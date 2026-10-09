// Mod Machina phase 3, part 2: the duty loop's pure rules (docs/specs/mod-machina.md section 17a). No Firestore here, so scripts/check-duty.js can prove every rule.
//
// A duty is a stretch of time in one role in one room, counted by the Deck heartbeat (dutyPing). Everyone's live state sits in streams/{id}/private/duty (captainNow, onDuty, prompts, room
// coverage: crew read it); the durable, payable copy is crew/main/duties/{streamId}_{uid} (written only by functions). Minutes are credited to ONE role at a time, the highest-paid one held
// (Captain 12/h, Room Lead 10/h, Deckhand 6/h), which is the spec's "one rate at a time": a Captain who is also a Room Lead is paid the higher rate for those minutes, not both.
const MIN = 60000;
const HOUR = 3600000;
const ROOMS = ["twitch", "ytLandscape", "ytVertical", "tiktok"];
const YT_ROOMS = ["ytLandscape", "ytVertical"];
const RANK = { captain: 3, lead: 2, deckhand: 1 };
const RATE_KEY = { captain: "dutyCaptainPerHour", lead: "dutyRoomLeadPerHour", deckhand: "dutyDeckhandPerHour" };

const PING_MIN_GAP_MS = 50 * 1000;          // pings closer than this are ignored: two Deck tabs count once, and a ping a few seconds early still counts
const BRIDGE_MS = 3 * MIN;                  // a gap up to 3 minutes between pings is bridged (credited); a longer one counts only the minute the ping arrived in
const QUIET_MS = 20 * MIN;                  // a Lead or Captain with no ping this long: the Captain (or the owner) gets a gentle nudge
const HANDOFF_MS = 2 * MIN;                 // a handoff or acting-Captain prompt waits this long for an answer
const CAPTAIN_WAIT_MS = 15 * MIN;           // a seated Captain who hasn't clocked in this long after the start: offer acting Captain
const OVERSTAY_MS = 10 * MIN;               // staying away this long past the break ends it: you come back as a Deckhand
const SHOWED_WITHIN_MS = 15 * MIN;          // clocked in within 15 minutes of the start earns the "showed up" Gears (seated crew only)
const TAKEOVER_CAP = 3;                     // "took over" Gears, at most this many a stream per person
const BREAK_MIN = { "5": 5, "15": 15, "30": 30 };
const COUNT_MIN = 60;                       // a duty counts at 60 confirmed minutes (or the whole stream minus 5 minutes under an hour)
const LED_MIN = 30;                         // "led" = Lead or Captain for at least 30 of those minutes
const YT_LED_MIN = 30;                      // a YouTube room counts toward YouTube Pioneer when led for 30+ minutes
const DUTY_BADGES = [[10, "crew-duties-10"], [25, "crew-duties-25"], [50, "crew-duties-50"], [100, "crew-duties-100"], [250, "crew-duties-250"]];
const PIONEER_BADGES = [[1, "youtube-pioneer-1"], [5, "youtube-pioneer-5"], [15, "youtube-pioneer-15"], [30, "youtube-pioneer-30"]];
const LOCK_DAYS = 30;
const LOCK_NOSHOWS = 3;
const RELIABILITY_DAYS = 90;

const rankOf = (r) => RANK[r && r.role] || 0;
const lineKey = (role, room) => (role === "captain" ? "captain" : `${role}:${room}`);
const parseLine = (key) => { const [role, room] = String(key).split(":"); return { role, room: room || null }; };

/** The highest-paid role of a list of { role, room } (ties keep the first). */
const primaryRole = (roles) => (roles || []).reduce((best, r) => (!best || rankOf(r) > rankOf(best) ? r : best), null);

/** What a ping credits: { credit: minutes, ignored }. `away` pauses minutes (the ping still moves lastPing, so coming back never bridges the break). */
function creditFor({ lastPing, away = false }, nowMs) {
  if (lastPing != null && nowMs - lastPing < PING_MIN_GAP_MS) return { credit: 0, ignored: true };
  if (away) return { credit: 0, ignored: false };
  const gap = lastPing == null ? MIN : nowMs - lastPing;
  return { credit: gap <= BRIDGE_MS ? Math.max(1, Math.round(gap / MIN)) : 1, ignored: false };
}

const totalMinutes = (lines) => Object.values(lines || {}).reduce((n, m) => n + (Number(m) || 0), 0);

/**
 * Caps a person's minutes across all roles at `capMin` (the 6-hour cap per stream), keeping the highest-paid lines first. Returns a new { lineKey: minutes }.
 */
function capLines(lines, capMin) {
  const out = {};
  let left = capMin;
  const sorted = Object.entries(lines || {}).filter(([, m]) => m > 0).sort((a, b) => rankOf(parseLine(b[0])) - rankOf(parseLine(a[0])) || b[1] - a[1]);
  for (const [k, m] of sorted) { const take = Math.min(m, Math.max(0, left)); if (take > 0) out[k] = take; left -= take; }
  return out;
}

/** The boost of a room: a per-room boost on the stream's crew.caps wins, else the crew settings' youtubeBoost for the two YouTube rooms, else 1. Captain lines have no room, so no boost. */
function boostOf(room, caps, settings) {
  if (!room) return 1;
  const per = caps && caps.boost && typeof caps.boost === "object" ? Number(caps.boost[room]) : NaN;
  if (Number.isFinite(per) && per > 0) return per;
  return YT_ROOMS.includes(room) ? Number(settings && settings.youtubeBoost) || 1.5 : 1;
}

/** Gears per role line: minutes / 60 x rate x room boost, rounded to the nearest whole Gear per line. -> [{ key, role, room, minutes, gears }] (zero lines left out). */
function gearLines(lines, gearsValues, caps, settings) {
  return Object.entries(lines || {}).map(([k, minutes]) => {
    const { role, room } = parseLine(k);
    const rate = Number(gearsValues[RATE_KEY[role]]) || 0;
    return { key: k, role, room, minutes, gears: Math.round((minutes / 60) * rate * boostOf(room, caps, settings)) };
  }).filter((l) => l.gears > 0).sort((a, b) => a.key.localeCompare(b.key));
}

/** counted: 60 confirmed minutes, or (a stream under an hour) the whole stream minus 5 minutes. led: Lead or Captain for 30+ of them. */
function dutyOutcome(lines, streamMinutes) {
  const total = totalMinutes(lines);
  const need = streamMinutes < COUNT_MIN ? Math.max(1, streamMinutes - 5) : COUNT_MIN;
  const lead = Object.entries(lines || {}).filter(([k]) => rankOf(parseLine(k)) >= RANK.lead).reduce((n, [, m]) => n + m, 0);
  const captain = Object.entries(lines || {}).filter(([k]) => parseLine(k).role === "captain").reduce((n, [, m]) => n + m, 0);
  const ytLed = Object.entries(lines || {}).filter(([k]) => { const p = parseLine(k); return p.role === "lead" && YT_ROOMS.includes(p.room); });
  return { total, counted: total >= need, led: lead >= LED_MIN, asCaptain: captain >= LED_MIN, asLead: lead >= LED_MIN && captain < LED_MIN, ytRoomsLed: ytLed.filter(([, m]) => m >= YT_LED_MIN).length };
}

/** The badges a new total earns on a ladder: every rung at or below `count` (the grant is idempotent, so a repeat is a no-op). */
const laddered = (ladder, count) => ladder.filter(([n]) => count >= n).map(([, id]) => id);

/** Who covers each room: { room: { lead: handle|null, deckhands: n, covered } }. One YouTube Lead who holds both YouTube Lead seats covers both (each seat is its own role entry). */
function coverage(onDuty, rooms) {
  const out = {};
  for (const room of rooms) {
    let lead = null, deckhands = 0;
    for (const p of Object.values(onDuty || {})) {
      if (p.away) continue;
      for (const r of p.roles || []) {
        if (r.room !== room) continue;
        if (r.role === "lead" && !lead) lead = p.handle || null;
        if (r.role === "deckhand") deckhands++;
      }
    }
    out[room] = { lead, deckhands, covered: !!lead };
  }
  return out;
}

/**
 * Who gets offered "acting Captain": crew on duty (not away), Watcher or above (grade 2+, admins count as 4), the highest grade first and the earliest clock-in breaking ties; never the owner, never
 * someone blocked (strike or no-show lockout), never someone who already declined. `people`: [{ uid, grade, since, away, blocked }]. Returns the uid or null.
 */
function nextActingCaptain(people, declined = []) {
  const ok = (people || []).filter((p) => !p.away && !p.blocked && !p.owner && p.grade >= 2 && !declined.includes(p.uid));
  ok.sort((a, b) => b.grade - a.grade || a.since - b.since || String(a.uid).localeCompare(String(b.uid)));
  return ok[0] ? ok[0].uid : null;
}
/** When the Captain steps away: the highest-grade Room Lead on duty (not away, not the Captain), earliest clock-in breaking ties. */
function nextCaptainFromLeads(people, exceptUid, declined = []) {
  const leads = (people || []).filter((p) => p.uid !== exceptUid && !p.away && !p.blocked && !declined.includes(p.uid) && (p.roles || []).some((r) => r.role === "lead"));
  leads.sort((a, b) => b.grade - a.grade || a.since - b.since || String(a.uid).localeCompare(String(b.uid)));
  return leads[0] ? leads[0].uid : null;
}

/** "No Lead or Captain seats until Nov 4, 2026 (3 no-shows in 90 days)." */
function lockMessage(untilMs, tz = "America/Chicago") {
  const d = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric" }).format(untilMs);
  return `No Lead or Captain seats until ${d} (${LOCK_NOSHOWS} no-shows in ${RELIABILITY_DAYS} days).`;
}

/**
 * Reliability from the last 90 days. duties: [{ streamId, endedAt, scheduled (seat or null), clockedIn }], lateSwaps: [{ streamId, at }] (swaps with countsAsNoShow).
 * Kept seats = scheduled seats on ended streams + untaken late drops; showed = clocked in at any point. -> { reliability (0..1 or null), kept, showed, noShows: [{ streamId, at }] }.
 */
function reliability(duties, lateSwaps, nowMs) {
  const since = nowMs - RELIABILITY_DAYS * 24 * HOUR;
  const seats = (duties || []).filter((d) => d.scheduled && d.endedAt >= since);
  const showed = seats.filter((d) => d.clockedIn);
  const noShows = [...seats.filter((d) => !d.clockedIn).map((d) => ({ streamId: d.streamId, at: d.endedAt })), ...(lateSwaps || []).filter((s) => s.at >= since).map((s) => ({ streamId: s.streamId, at: s.at }))]
    .sort((a, b) => a.at - b.at);
  const kept = seats.length + (lateSwaps || []).filter((s) => s.at >= since).length;
  return { reliability: kept ? showed.length / kept : null, kept, showed: showed.length, noShows };
}
/** The lockout the nightly run sets: 3 no-shows in 90 days, 30 days, once per set of no-shows (not again for ones already locked on). -> lockUntil ms or null. */
function lockFor(noShows, record, nowMs) {
  if (noShows.length < LOCK_NOSHOWS) return null;
  const newest = noShows[noShows.length - 1].at;
  const current = record && record.lockUntil != null ? (typeof record.lockUntil === "number" ? record.lockUntil : record.lockUntil.toMillis ? record.lockUntil.toMillis() : 0) : 0;
  if (current > nowMs) return null;
  if ((record && Number(record.lockTriggerAt)) >= newest) return null;
  return nowMs + LOCK_DAYS * 24 * HOUR;
}

module.exports = {
  MIN, HOUR, ROOMS, YT_ROOMS, RANK, RATE_KEY, PING_MIN_GAP_MS, BRIDGE_MS, QUIET_MS, HANDOFF_MS, CAPTAIN_WAIT_MS, OVERSTAY_MS, SHOWED_WITHIN_MS, TAKEOVER_CAP, BREAK_MIN, COUNT_MIN, LED_MIN, YT_LED_MIN,
  DUTY_BADGES, PIONEER_BADGES, LOCK_DAYS, LOCK_NOSHOWS, RELIABILITY_DAYS,
  rankOf, lineKey, parseLine, primaryRole, creditFor, totalMinutes, capLines, boostOf, gearLines, dutyOutcome, laddered, coverage, nextActingCaptain, nextCaptainFromLeads, lockMessage, reliability, lockFor,
};
