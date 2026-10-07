// Scream Planner, pure logic (docs/specs/scream-planner.md). No Firebase in here, so
// scripts/check-planner.js tests every rule without credentials. lib/planner/index.js (the callables and
// plannerTick) calls these instead of re-deriving them, and uses lib/streams/logic.js for transitions.
//
// Conventions
//   - The site's time zone is ALWAYS passed in (sites/{siteId}.timezone). Nothing here assumes one.
//   - Times are UTC milliseconds. Local wall-clock times ("19:00") are strings and stay local, so a
//     7 PM slot is 7 PM on both sides of a DST change (docs/specs/scream-planner.md section 10).
//   - Local dates are "YYYY-MM-DD" strings. Weekdays are ISO numbers: 1 = Monday ... 7 = Sunday.
//   - Weeks are ISO weeks in the site's zone, "2026-W43", Monday to Sunday (same ids as streams/logic.js).
//   - Functions never mutate their input. Validators return a list of short problems (empty = valid).

const { ms, weekKey } = require("../arcade/logic");
const ST = require("../streams/logic");

// ---------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------
const ROOMS = ["twitch", "ytLandscape", "ytVertical", "tiktok"];             // Mod Machina chats (section 6a)
const ROOM_GROUP = { twitch: "twitch", ytLandscape: "youtube", ytVertical: "youtube", tiktok: "tiktok" };
const PLATFORM_ROOMS = { twitch: ["twitch"], youtube: ["ytLandscape", "ytVertical"], tiktok: ["tiktok"] };
const SEAT_ROLES = ["captain", "lead", "deckhand"];
const AVAILABILITY = ["yes", "maybe", "no"];
const TYPES = ["platform", "backstage"];
const AUDIENCES = ["public", "fanClub"];                                      // subClub arrives with billing
const EXCEPTION_KINDS = ["weekOff", "dayOff", "skipPattern"];
const WEEK_STATES = ["open", "closed", "published"];
const GAME_COUNT_MAX = 6;
const NOTE_MAX = 140;
const HOUR = 3600000, DAY = 86400000;

/** The planner settings (planner/main). The document wins; anything missing falls back to these. */
const DEFAULT_SETTINGS = {
  deadlines: { openDow: 1, openTime: "10:00", closeDow: 4, closeTime: "22:00", publishDow: 5, publishTime: "18:00" },
  defaults: {
    rooms: ["twitch", "ytLandscape", "ytVertical", "tiktok"],                 // the spec leaves the value open: every room
    minCrew: { captain: true, rooms: ["youtube"] },
    caps: { deckhands: 2 },
    votesPerMember: 3,
    ballotAddsPerMember: 2,
    ballotSeed: 5,
    gameCount: 2,
  },
};
function mergeSettings(doc) {
  const d = doc || {};
  const df = d.defaults || {};
  return {
    deadlines: { ...DEFAULT_SETTINGS.deadlines, ...(d.deadlines || {}) },
    defaults: {
      ...DEFAULT_SETTINGS.defaults, ...df,
      minCrew: { ...DEFAULT_SETTINGS.defaults.minCrew, ...(df.minCrew || {}) },
      caps: { ...DEFAULT_SETTINGS.defaults.caps, ...(df.caps || {}) },
    },
  };
}

// Marquee frames and door styles (section 13).
const FRAME_POOL = ["bulbs", "neon", "barbed", "drip", "tape", "film", "web", "electric", "vhs", "candles", "ecg"];
const FRAMES_SEASONAL = ["jack", "pumpkin", "blizzard", "snowman"];            // hand-picked only, never rolled
const DOOR_STYLES = ["jaws", "elevator", "coffins", "morgue", "hinged"];
const FRAME_NO_REPEAT_WEEKS = 3;

function needTz(tz) {
  if (typeof tz !== "string" || !tz) throw new Error("planner/logic: a time zone is required (sites/{siteId}.timezone)");
}

// ---------------------------------------------------------------------------------------------
// Time zone and week math
// ---------------------------------------------------------------------------------------------
const pad2 = (n) => String(n).padStart(2, "0");
const _fmt = new Map();
function formatter(tz) {
  let f = _fmt.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    _fmt.set(tz, f);
  }
  return f;
}

/** The zone's UTC offset in ms at an instant (negative west of Greenwich). */
function tzOffsetMs(utcMs, tz) {
  needTz(tz);
  const p = Object.fromEntries(formatter(tz).formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** The wall clock in the zone at an instant: { date: "2026-10-26", hhmm: "19:00", dow: 1..7, y, m, d }. */
function localParts(utcMs, tz) {
  needTz(tz);
  const t = new Date(utcMs + tzOffsetMs(utcMs, tz));            // shifted so the UTC getters read the local wall clock
  const y = t.getUTCFullYear(), m = t.getUTCMonth() + 1, d = t.getUTCDate();
  return { y, m, d, date: `${y}-${pad2(m)}-${pad2(d)}`, hhmm: `${pad2(t.getUTCHours())}:${pad2(t.getUTCMinutes())}`, dow: t.getUTCDay() || 7 };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const WEEK_RE = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;
const isDate = (s) => typeof s === "string" && DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
const isTime = (s) => typeof s === "string" && TIME_RE.test(s);
const isWeekId = (s) => typeof s === "string" && WEEK_RE.test(s);
const utcOf = (date) => Date.parse(`${date}T00:00:00Z`);
const dateOf = (utc) => new Date(utc).toISOString().slice(0, 10);
/** A local date plus n days ("2026-10-31", 1 -> "2026-11-01"). Calendar arithmetic, so DST can't bend it. */
const addDays = (date, n) => dateOf(utcOf(date) + n * DAY);
/** ISO weekday of a local date, 1 = Monday ... 7 = Sunday. */
const dowOf = (date) => new Date(utcOf(date)).getUTCDay() || 7;

/**
 * The local wall time on a local date as a UTC instant. Handles DST both ways: in the repeated hour
 * (fall back) it picks the first occurrence; a time inside the skipped hour (spring forward) lands on the
 * equivalent instant just before the gap (so a pattern never silently moves a day).
 */
function zonedToUtc(date, hhmm, tz) {
  needTz(tz);
  if (!isDate(date) || !isTime(hhmm)) throw new Error(`planner/logic: bad local time ${date} ${hhmm}`);
  const [h, m] = hhmm.split(":").map(Number);
  const wall = utcOf(date) + (h * 60 + m) * 60000;
  const off1 = tzOffsetMs(wall, tz);
  let t = wall - off1;
  const off2 = tzOffsetMs(t, tz);
  if (off2 !== off1) t = wall - off2;
  return t;
}

/** The ISO week id of a local date ("2026-10-26" -> "2026-W44"). */
const weekOfDate = (date) => weekKey(zonedToUtc(date, "12:00", "UTC"), "UTC");
/** The ISO week id of an instant in the site's zone. */
function weekOf(utcMs, tz) { needTz(tz); return weekKey(utcMs, tz); }

/** The Monday (local date) of an ISO week id. Week 1 is the week with January 4th. */
function weekMonday(weekId) {
  if (!isWeekId(weekId)) throw new Error(`planner/logic: bad week id ${weekId}`);
  const y = +weekId.slice(0, 4), w = +weekId.slice(6);
  const jan4 = `${y}-01-04`;
  return addDays(jan4, -(dowOf(jan4) - 1) + (w - 1) * 7);
}
const nextWeek = (weekId) => weekOfDate(addDays(weekMonday(weekId), 7));
const prevWeek = (weekId) => weekOfDate(addDays(weekMonday(weekId), -7));

/**
 * The week's edges in the zone: { week, monday, sunday, startMs, endMs, days: [{ date, dow }] }.
 * startMs is Monday 00:00 local, endMs is the NEXT Monday 00:00 local (exclusive), so a week with a DST
 * change is 167 or 169 hours long.
 */
function weekBounds(weekId, tz) {
  needTz(tz);
  const monday = weekMonday(weekId);
  const days = Array.from({ length: 7 }, (_, i) => ({ date: addDays(monday, i), dow: i + 1 }));
  return { week: weekId, monday, sunday: days[6].date, startMs: zonedToUtc(monday, "00:00", tz), endMs: zonedToUtc(addDays(monday, 7), "00:00", tz), days };
}

// ---------------------------------------------------------------------------------------------
// The weekly rhythm: deadlines (section 3)
// ---------------------------------------------------------------------------------------------
const minuteOfWeek = (dow, hhmm) => (dow - 1) * 1440 + Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

/** Problems with a deadlines object. Must satisfy open < close < publish < the target week's Monday. */
function validateDeadlines(d, tz) {
  const errs = [];
  const x = d || {};
  for (const k of ["open", "close", "publish"]) {
    if (!Number.isInteger(x[`${k}Dow`]) || x[`${k}Dow`] < 1 || x[`${k}Dow`] > 7) errs.push(`${k}Dow: 1 (Monday) to 7 (Sunday)`);
    if (!isTime(x[`${k}Time`])) errs.push(`${k}Time: HH:MM, 24 hour`);
  }
  if (errs.length) return errs;
  const o = minuteOfWeek(x.openDow, x.openTime), c = minuteOfWeek(x.closeDow, x.closeTime), p = minuteOfWeek(x.publishDow, x.publishTime);
  if (!(o < c)) errs.push("close must be after open");
  if (!(c < p)) errs.push("publish must be after close");
  if (tz) {
    // All three fall in the planning week, so they are always before the target week's Monday; check it for real anyway.
    const w = weekDeadlines(nextWeek(weekOf(Date.now(), tz)), x, tz);
    if (!(w.opensAt < w.closesAt && w.closesAt < w.publishBy && w.publishBy < weekBounds(w.week, tz).startMs)) errs.push("publish must be before the week starts");
  }
  return errs;
}

/**
 * The three instants for planning TARGET week `weekId`. The deadlines fall in the week BEFORE it
 * (we plan next week during this one): { week, planningWeek, opensAt, closesAt, publishBy } in UTC ms.
 */
function weekDeadlines(weekId, deadlines, tz) {
  needTz(tz);
  const planning = prevWeek(weekId), monday = weekMonday(planning);
  const at = (dow, time) => zonedToUtc(addDays(monday, dow - 1), time, tz);
  const d = { ...DEFAULT_SETTINGS.deadlines, ...(deadlines || {}) };
  return { week: weekId, planningWeek: planning, opensAt: at(d.openDow, d.openTime), closesAt: at(d.closeDow, d.closeTime), publishBy: at(d.publishDow, d.publishTime) };
}

/** The week plannerTick is working on at `nowMs`: the week after the current one. */
const targetWeekAt = (nowMs, tz) => nextWeek(weekOf(nowMs, tz));

/** What a week's state should be at `nowMs` given its deadlines (never "published": that is a manual act). */
const stateAt = (nowMs, dl) => (nowMs >= dl.closesAt ? "closed" : "open");

// ---------------------------------------------------------------------------------------------
// Patterns, exceptions and week expansion (sections 4a, 10)
// ---------------------------------------------------------------------------------------------
/** Platforms (twitch / youtube / tiktok) -> the chat rooms they imply. */
function roomsForPlatforms(platforms) {
  const out = [];
  for (const p of platforms || []) for (const r of PLATFORM_ROOMS[p] || []) if (!out.includes(r)) out.push(r);
  return ROOMS.filter((r) => out.includes(r));
}
/** Rooms -> the platforms they imply (twitch, youtube, tiktok), in a stable order. */
function platformsForRooms(rooms) {
  const set = new Set((rooms || []).map((r) => ROOM_GROUP[r]).filter(Boolean));
  return ["twitch", "youtube", "tiktok"].filter((p) => set.has(p));
}

/** Problems with a pattern (a repeating slot). */
function validatePattern(p) {
  const errs = [];
  if (!p || typeof p !== "object") return ["pattern: missing"];
  if (typeof p.label !== "string" || !p.label.trim() || p.label.length > 60) errs.push("label: 1 to 60 characters");
  if (p.icon != null && (typeof p.icon !== "string" || p.icon.length > 16)) errs.push("icon: up to 16 characters");
  if (!Number.isInteger(p.dow) || p.dow < 1 || p.dow > 7) errs.push("dow: 1 (Monday) to 7 (Sunday)");
  if (!isTime(p.start)) errs.push("start: HH:MM");
  if (!isTime(p.end)) errs.push("end: HH:MM");
  else if (isTime(p.start) && p.start === p.end) errs.push("end: must differ from start");
  errs.push(...validateKind(p));
  if (p.gameCount != null && (!Number.isInteger(p.gameCount) || p.gameCount < 1 || p.gameCount > GAME_COUNT_MAX)) errs.push(`gameCount: 1 to ${GAME_COUNT_MAX}`);
  for (const k of ["tagHints", "gameHints"]) {
    if (p[k] != null && (!Array.isArray(p[k]) || p[k].length > 20 || p[k].some((x) => typeof x !== "string" || !x || x.length > 80))) errs.push(`${k}: up to 20 short strings`);
  }
  if (p.rooms != null) errs.push(...validateRooms(p.rooms));
  if (p.minCrew != null) errs.push(...validateMinCrew(p.minCrew));
  if (p.caps != null && !(p.caps && Number.isInteger(p.caps.deckhands) && p.caps.deckhands >= 0 && p.caps.deckhands <= 5)) errs.push("caps.deckhands: 0 to 5");
  return errs;
}
/** type + audience (+ platforms for a platform stream). */
function validateKind(p) {
  const errs = [];
  if (!TYPES.includes(p.type)) errs.push("type: platform or backstage");
  else if (p.type === "platform") {
    if (p.audience != null && p.audience !== "public") errs.push("audience: a platform stream is public");
    if (p.platforms != null && (!Array.isArray(p.platforms) || p.platforms.some((x) => !ST.PLATFORMS.includes(x)))) errs.push("platforms: twitch, youtube or tiktok");
  } else if (p.audience !== "fanClub") errs.push("audience: backstage is fanClub (subClub comes with billing)");
  return errs;
}
function validateRooms(rooms) {
  if (!Array.isArray(rooms) || rooms.some((r) => !ROOMS.includes(r)) || new Set(rooms).size !== rooms.length) return [`rooms: any of ${ROOMS.join(", ")}`];
  return [];
}
function validateMinCrew(m) {
  if (!m || typeof m !== "object" || (m.captain != null && typeof m.captain !== "boolean")) return ["minCrew: { captain, rooms }"];
  if (m.rooms != null && (!Array.isArray(m.rooms) || m.rooms.some((r) => !["twitch", "youtube", "tiktok", ...ROOMS].includes(r)))) return ["minCrew.rooms: twitch, youtube, tiktok or a room"];
  return [];
}

/** Problems with an exception (weekOff, dayOff or skipPattern, a date range with a label). */
function validateException(e) {
  const errs = [];
  if (!e || typeof e !== "object") return ["exception: missing"];
  if (!EXCEPTION_KINDS.includes(e.kind)) errs.push("kind: weekOff, dayOff or skipPattern");
  if (!isDate(e.from)) errs.push("from: YYYY-MM-DD");
  if (e.to != null && !isDate(e.to)) errs.push("to: YYYY-MM-DD");
  else if (isDate(e.from) && isDate(e.to) && e.to < e.from) errs.push("to: before from");
  if (typeof e.label !== "string" || !e.label.trim() || e.label.length > 60) errs.push("label: 1 to 60 characters");
  if (e.kind === "skipPattern" && (!Array.isArray(e.patternIds) || !e.patternIds.length || e.patternIds.some((x) => typeof x !== "string" || !x))) errs.push("patternIds: pick at least one pattern");
  if (e.public != null && typeof e.public !== "boolean") errs.push("public: true or false");
  return errs;
}
const exTo = (e) => e.to || e.from;
const exCovers = (e, date) => date >= e.from && date <= exTo(e);

/**
 * The exception that takes the WHOLE week off, or null. A weekOff range covering only part of a week
 * acts as a day off for the days it covers (see expandWeek).
 */
function weekOffFor(weekId, exceptions) {
  const mon = weekMonday(weekId), sun = addDays(mon, 6);
  return (exceptions || []).find((e) => e.kind === "weekOff" && e.from <= mon && exTo(e) >= sun) || null;
}

/**
 * Expands the patterns into the week's slots, minus exceptions (section 4a and 10).
 *   -> { week, weekOff: { label, public } | null, slots: [...], skipped: [{ patternId, date, why }] }
 * Slots keep their LOCAL times: startMs is `date start` in the zone, so DST never shifts them. A slot
 * whose end is earlier than its start crosses midnight and belongs to its start day. Inactive patterns
 * are ignored. A week off opens empty (slots = []) and carries the exception's label.
 * `defaults` (planner/main.defaults, merged) fills rooms, minCrew, caps and gameCount a pattern leaves out.
 */
function expandWeek({ week, patterns, exceptions, tz, defaults }) {
  needTz(tz);
  const dflt = mergeSettings({ defaults }).defaults;
  const off = weekOffFor(week, exceptions);
  if (off) return { week, weekOff: { label: off.label, public: off.public !== false, exceptionId: off.id || null }, slots: [], skipped: [] };
  const { days } = weekBounds(week, tz);
  const slots = [], skipped = [];
  const ordered = [...(patterns || [])].filter((p) => p.active !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.dow - b.dow || String(a.start).localeCompare(String(b.start)));
  for (const p of ordered) {
    const day = days.find((d) => d.dow === p.dow);
    if (!day) continue;
    const blocker = (exceptions || []).find((e) => exCovers(e, day.date) && (e.kind === "dayOff" || e.kind === "weekOff" || (e.kind === "skipPattern" && (e.patternIds || []).includes(p.id))));
    if (blocker) { skipped.push({ patternId: p.id || null, date: day.date, why: blocker.kind, label: blocker.label }); continue; }
    slots.push(slotFromPattern(p, day.date, tz, dflt));
  }
  slots.sort((a, b) => a.startMs - b.startMs);
  return { week, weekOff: null, slots, skipped };
}

/** One slot from a pattern on a local date. The planSlot callable turns it into a planned stream. */
function slotFromPattern(p, date, tz, dflt) {
  const crossing = p.end <= p.start;                                 // 22:00 -> 02:00 ends the next day
  const startMs = zonedToUtc(date, p.start, tz);
  const endMs = zonedToUtc(crossing ? addDays(date, 1) : date, p.end, tz);
  const type = p.type === "backstage" ? "backstage" : "platform";
  const rooms = type === "backstage" ? [] : (p.rooms || (p.platforms && p.platforms.length ? roomsForPlatforms(p.platforms) : dflt.rooms));
  return {
    patternId: p.id || null, date, dow: p.dow, startMs, endMs, tz,
    type, audience: type === "backstage" ? "fanClub" : "public",
    rooms, platforms: type === "backstage" ? [] : platformsForRooms(rooms),
    plannedGameCount: p.gameCount || dflt.gameCount,
    theme: { patternId: p.id || null, label: p.label, icon: p.icon || null, tagHints: p.tagHints || [], gameHints: p.gameHints || [] },
    minCrew: type === "backstage" ? { captain: false, rooms: [] } : (p.minCrew || dflt.minCrew),
    caps: p.caps || dflt.caps,
  };
}

/** Problems with a slot about to be saved as a planned stream (planSlot). */
function validateSlot(s) {
  const errs = [];
  if (!Number.isFinite(s.startMs) || !Number.isFinite(s.endMs)) errs.push("start and end are required");
  else if (s.endMs <= s.startMs) errs.push("end must be after start");
  else if (s.endMs - s.startMs > 12 * HOUR) errs.push("a slot is at most 12 hours");
  errs.push(...validateKind(s));
  if (!Number.isInteger(s.plannedGameCount) || s.plannedGameCount < 1 || s.plannedGameCount > GAME_COUNT_MAX) errs.push(`plannedGameCount: 1 to ${GAME_COUNT_MAX}`);
  errs.push(...validateRooms(s.rooms || []));
  if (s.type === "backstage" && (s.rooms || []).length) errs.push("rooms: a backstage stream has none");
  if (s.type === "platform" && !(s.rooms || []).length) errs.push("rooms: pick at least one chat");
  if (s.minCrew != null) errs.push(...validateMinCrew(s.minCrew));
  if (s.theme != null && (typeof s.theme.label !== "string" || !s.theme.label.trim() || s.theme.label.length > 60)) errs.push("theme.label: 1 to 60 characters");
  return errs;
}

// ---------------------------------------------------------------------------------------------
// Overlaps (section 10: refused on save, delay and publish)
// ---------------------------------------------------------------------------------------------
/** Half-open ranges: a stream ending at 9:00 and one starting at 9:00 do NOT overlap. */
const overlaps = (a, b) => a.startMs < b.endMs && b.startMs < a.endMs;
const msRange = (s) => ({ startMs: ms(s.plannedStart ?? s.startMs), endMs: ms(s.plannedEnd ?? s.endMs) });

/** Streams (cancelled ones excluded) that overlap `candidate`; `ignoreId` skips the candidate's own stream. */
function overlapsWith(candidate, others, ignoreId = null) {
  const c = msRange(candidate);
  return (others || []).filter((o) => o.id !== ignoreId && o.state !== "cancelled" && overlaps(c, msRange(o)));
}
/** Every overlapping pair among streams: [{ a, b }] by id. Cancelled streams never count. */
function findOverlaps(streams) {
  const live = (streams || []).filter((s) => s.state !== "cancelled").sort((x, y) => msRange(x).startMs - msRange(y).startMs);
  const out = [];
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    if (msRange(live[j]).startMs >= msRange(live[i]).endMs) break;
    out.push({ a: live[i].id, b: live[j].id });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Crew: seats and eligibility (Mod Machina section 6a), sign-ups and game requests (section 4d)
// ---------------------------------------------------------------------------------------------
/**
 * A seat: "captain" is a seat of its own; Room Lead and Deckhand name a room.
 *   { room: "captain", role: "captain" } | { room: "twitch", role: "lead" | "deckhand" }
 */
const seatKey = (s) => (s.role === "captain" ? "captain" : `${s.room}:${s.role}`);
function normalizeSeat(s) {
  if (!s || !SEAT_ROLES.includes(s.role)) return null;
  if (s.role === "captain") return { room: "captain", role: "captain" };
  return ROOMS.includes(s.room) ? { room: s.room, role: s.role } : null;
}

/**
 * May this person take this seat? (Mod Machina 6a.)
 *   person: { isAdmin, isMod, grade (effective: admins count as 4), rosterStatus (null when no roster entry),
 *             leadBlockedUntilMs }
 *   -> { ok, reason?, needsOwnerOk? }
 * Initiate+ (grade 1) Deckhand; Watcher+ (2) Room Lead; Warden+ (3) Captain. A Watcher MAY ask for Captain
 * ("Watcher with owner OK early on"): the request is allowed and flagged needsOwnerOk, and only the owner
 * can confirm it. Status must be Active or Check-in (an admin without a roster entry is on duty by role).
 * A strike's leadBlockedUntil blocks Lead and Captain, not Deckhand.
 */
function seatEligibility(person, seat, nowMs) {
  const s = normalizeSeat(seat);
  if (!s) return { ok: false, reason: "badSeat" };
  if (!person) return { ok: false, reason: "notCrew" };
  if (!person.isAdmin && !person.isMod) return { ok: false, reason: "notCrew" };
  if (person.rosterStatus == null) { if (!person.isAdmin) return { ok: false, reason: "notCrew" }; }
  else if (!["active", "checkIn"].includes(person.rosterStatus)) return { ok: false, reason: "notActive" };
  const grade = Number.isInteger(person.grade) ? person.grade : 0;
  const need = s.role === "captain" ? 2 : s.role === "lead" ? 2 : 1;      // Watcher can ask for lead and (with the owner's OK) captain
  if (grade < need) return { ok: false, reason: "gradeTooLow" };
  if (s.role !== "deckhand" && ms(person.leadBlockedUntilMs) > nowMs) return { ok: false, reason: "leadBlocked" };
  if (s.role === "captain" && grade < 3) return { ok: true, needsOwnerOk: true };
  return { ok: true };
}

/**
 * Can this person hold `seat` on top of the seats they already hold on the same stream? Rules: the Captain
 * may also be a Room Lead; one Lead may cover both YouTube rooms (and only those two); a Deckhand holds that
 * one seat and nothing else.
 */
function canHoldTogether(held, seat) {
  const s = normalizeSeat(seat);
  if (!s) return false;
  const h = (held || []).map(normalizeSeat).filter(Boolean);
  if (h.some((x) => seatKey(x) === seatKey(s))) return false;
  if (!h.length) return true;
  if (s.role === "deckhand" || h.some((x) => x.role === "deckhand")) return false;
  const leads = [...h, s].filter((x) => x.role === "lead").map((x) => x.room);
  if (leads.length <= 1) return true;
  return leads.length === 2 && leads.every((r) => ROOM_GROUP[r] === "youtube");
}

/** An empty crew for a stream's rooms, the Mod Machina shape: { captain, chats: { room: { lead, deckhands[] } }, caps }. */
function emptyCrew(rooms, caps) {
  const chats = {};
  for (const r of ROOMS) if ((rooms || []).includes(r)) chats[r] = { lead: null, deckhands: [] };
  return { captain: null, chats, caps: { deckhands: 2, ...(caps || {}) } };
}
/** The seats a uid holds in a (draft) crew: [{ room, role }]. Seat entries are { uid, handle }. */
function seatsHeldBy(crew, uid) {
  const out = [];
  if (!crew) return out;
  if (crew.captain?.uid === uid) out.push({ room: "captain", role: "captain" });
  for (const r of ROOMS) {
    const c = crew.chats?.[r];
    if (!c) continue;
    if (c.lead?.uid === uid) out.push({ room: r, role: "lead" });
    if ((c.deckhands || []).some((d) => d.uid === uid)) out.push({ room: r, role: "deckhand" });
  }
  return out;
}
/**
 * Puts a person in a seat: { ok, crew } or { ok: false, reason: seatTaken | roomOff | deckhandCap | cantHold }.
 * `person` is { uid, handle }. The Captain seat takes the person as-is; checks of grade belong to seatEligibility.
 */
function placeSeat(crew, seat, person) {
  const s = normalizeSeat(seat);
  if (!s) return { ok: false, reason: "badSeat" };
  const next = JSON.parse(JSON.stringify(crew));
  if (!canHoldTogether(seatsHeldBy(next, person.uid), s)) return { ok: false, reason: "cantHold" };
  const who = { uid: person.uid, handle: person.handle || null };
  if (s.role === "captain") {
    if (next.captain) return { ok: false, reason: "seatTaken" };
    next.captain = who;
    return { ok: true, crew: next };
  }
  const chat = next.chats?.[s.room];
  if (!chat) return { ok: false, reason: "roomOff" };
  if (s.role === "lead") {
    if (chat.lead) return { ok: false, reason: "seatTaken" };
    chat.lead = who;
  } else {
    if ((chat.deckhands || []).length >= (next.caps?.deckhands ?? 2)) return { ok: false, reason: "deckhandCap" };
    chat.deckhands = [...(chat.deckhands || []), who];
  }
  return { ok: true, crew: next };
}
/** Takes a uid out of one seat, or out of every seat when `seat` is omitted. */
function removeSeat(crew, uid, seat = null) {
  const next = JSON.parse(JSON.stringify(crew));
  const s = seat ? normalizeSeat(seat) : null;
  const hit = (role, room) => !s || (s.role === role && (role === "captain" || s.room === room));
  if (next.captain?.uid === uid && hit("captain")) next.captain = null;
  for (const r of ROOMS) {
    const c = next.chats?.[r];
    if (!c) continue;
    if (c.lead?.uid === uid && hit("lead", r)) c.lead = null;
    if (hit("deckhand", r)) c.deckhands = (c.deckhands || []).filter((d) => d.uid !== uid);
  }
  return next;
}
/** The public face of a draft crew: handles only, no uids. */
function publicCrew(crew) {
  if (!crew) return null;
  const chats = {};
  for (const [r, c] of Object.entries(crew.chats || {})) chats[r] = { lead: c.lead?.handle ?? null, deckhands: (c.deckhands || []).map((d) => d.handle) };
  return { captain: crew.captain?.handle ?? null, chats, caps: crew.caps || { deckhands: 2 } };
}
/** Every uid with a confirmed seat. */
const crewUids = (crew) => [...new Set(ROOMS.flatMap((r) => [crew?.chats?.[r]?.lead?.uid, ...(crew?.chats?.[r]?.deckhands || []).map((d) => d.uid)]).concat(crew?.captain?.uid).filter(Boolean))];

/**
 * What a stream still needs from its minimum crew: a list of { need: "captain" | "twitch" | "youtube" | ..., rooms }.
 * The Captain when minCrew.captain; each minCrew room group needs a Lead in every room of that group the
 * stream has (so one YouTube Lead covering both YouTube rooms satisfies "youtube"). Backstage needs nothing
 * unless its minCrew says so.
 */
function crewGaps(stream) {
  const crew = stream.crew || emptyCrew(stream.rooms, stream.caps);
  const need = stream.minCrew || {};
  const gaps = [];
  if (need.captain && !crew.captain) gaps.push({ need: "captain", rooms: [] });
  for (const g of need.rooms || []) {
    const rooms = ROOMS.filter((r) => (r === g || ROOM_GROUP[r] === g) && (stream.rooms || []).includes(r));
    if (rooms.some((r) => !crew.chats?.[r]?.lead)) gaps.push({ need: g, rooms });
  }
  return gaps;
}

/** The sign-up document's checks: availability and the requested seats (section 4d). */
function validateSignup({ availability, seats }) {
  const errs = [];
  if (availability != null && !AVAILABILITY.includes(availability)) errs.push("availability: yes, maybe or no");
  if (seats != null) {
    if (!Array.isArray(seats) || seats.length > 6 || seats.some((s) => !normalizeSeat(s))) errs.push("seats: up to 6, each a captain, lead or deckhand seat");
    else if (new Set(seats.map((s) => seatKey(normalizeSeat(s)))).size !== seats.length) errs.push("seats: one entry per seat");
  }
  return errs;
}

/**
 * A mod's game request on a slot (section 4d): needs availability yes and at least one requested seat
 * (an open or confirmed one); one request per mod per slot, so a new request replaces the old one.
 */
function validateGameRequest({ availability, seats, gameSlug, note }) {
  if (typeof gameSlug !== "string" || !gameSlug) return { ok: false, reason: "noGame" };
  if (note != null && (typeof note !== "string" || note.trim().length > NOTE_MAX)) return { ok: false, reason: "noteTooLong" };
  if (availability !== "yes") return { ok: false, reason: "needsAvailability" };
  if (!(seats || []).some((s) => ["requested", "confirmed"].includes(s.status))) return { ok: false, reason: "needsSeat" };
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// The tray (section 5)
// ---------------------------------------------------------------------------------------------
/** A short weekday ("Wed") in the zone. */
function dayLabel(utcMs, tz) {
  needTz(tz);
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(new Date(utcMs));
}
/** "9:00 PM" in the zone. */
function timeLabel(utcMs, tz) {
  needTz(tz);
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(utcMs));
}

/** Does a Vault game match a slot's hints? tagHints are Vault tags, gameHints are Vault slugs. */
function fitsTheme(game, theme) {
  if (!theme) return false;
  if ((theme.gameHints || []).includes(game.slug)) return true;
  const hints = new Set((theme.tagHints || []).map((t) => String(t).toLowerCase()));
  return (game.tags || []).some((t) => hints.has(String(t).toLowerCase()));
}

/**
 * The tray for one slot, in the four groups of section 5:
 *   1 modRequests  open requests for THIS slot (game, handle, grade, seat, note)
 *   2 votes        ballot games, most votes first (ties: Most wanted, then newest vote)
 *   3 theme        Vault games matching the slot's tagHints or gameHints
 *   4 picks        `playing` games first, then the whole Vault (A to Z; the page searches with the Vault matcher)
 * Each game appears once, in the first group it qualifies for. Hidden games and games already in this slot
 * are left out. Items carry: slug, title, fitsTheme (the theme chip: shown on groups 1 and 2) and alsoOn
 * (["Wed"], days of other slots that week that already plan the game).
 *   input: { slot: { id, theme, plannedGameIds[] }, requests: [{ uid, handle, grade, seat, gameSlug, note, status }],
 *            ballot: [{ slug, votes, wanted, lastVoteMs }], vault: [{ slug, title, status, hidden, tags, sortTitle }],
 *            weekStreams: [{ id, plannedStart, plannedGameIds[], state }], tz }
 */
function trayGroups({ slot, requests, ballot, vault, weekStreams, tz }) {
  const byslug = new Map((vault || []).filter((g) => g.hidden !== true).map((g) => [g.slug, g]));
  const inSlot = new Set(slot.plannedGameIds || []);
  const elsewhere = new Map();
  for (const s of weekStreams || []) {
    if (s.id === slot.id || s.state === "cancelled") continue;
    for (const slug of s.plannedGameIds || []) {
      const days = elsewhere.get(slug) || [];
      const d = dayLabel(ms(s.plannedStart), tz);
      if (!days.includes(d)) days.push(d);
      elsewhere.set(slug, days);
    }
  }
  const used = new Set(inSlot);
  const item = (g, extra = {}) => ({ slug: g.slug, title: g.title, status: g.status || null, tags: g.tags || [], fitsTheme: fitsTheme(g, slot.theme), alsoOn: elsewhere.get(g.slug) || [], ...extra });
  const take = (slug) => { const g = byslug.get(slug); if (!g || used.has(slug)) return null; used.add(slug); return g; };

  const modRequests = [];
  const reqs = (requests || []).filter((r) => r.status === "open").sort((a, b) => (b.grade ?? 0) - (a.grade ?? 0) || String(a.handle).localeCompare(String(b.handle)));
  for (const r of reqs) {
    const g = take(r.gameSlug);
    if (g) modRequests.push(item(g, { requestUid: r.uid, byHandle: r.handle || "Deleted member", grade: r.grade ?? null, seat: r.seat || null, note: r.note || "" }));
  }
  const votes = [];
  for (const b of rankBallot(ballot)) {
    const g = take(b.slug);
    if (g) votes.push(item(g, { votes: b.votes || 0 }));
  }
  const theme = [];
  for (const g of [...byslug.values()].sort(byTitle)) if (!used.has(g.slug) && fitsTheme(g, slot.theme)) { used.add(g.slug); theme.push(item(g)); }
  const rest = [...byslug.values()].filter((g) => !used.has(g.slug));
  const picks = [...rest.filter((g) => g.status === "playing").sort(byTitle), ...rest.filter((g) => g.status !== "playing").sort(byTitle)].map((g) => item(g));
  return [
    { id: "modRequests", title: "Mod requests", items: modRequests },
    { id: "votes", title: "Community votes", items: votes },
    { id: "theme", title: "Fits the theme", items: theme },
    { id: "picks", title: "Your picks", items: picks },
  ];
}
const byTitle = (a, b) => String(a.sortTitle || a.title).localeCompare(String(b.sortTitle || b.title), "en");

/** The source recorded on a planned game, from where it came in the tray (stream-object.md section 3). */
function plannedSource(groupId, item) {
  if (groupId === "modRequests") return { kind: "modRequest", byHandle: item.byHandle || null };
  if (groupId === "votes") return { kind: "ballot", votes: item.votes || 0 };
  return { kind: "owner" };
}

// ---------------------------------------------------------------------------------------------
// The ballot (sections 4e and 10)
// ---------------------------------------------------------------------------------------------
/**
 * Ballot order: more votes first; ties go to the higher Most wanted count, then the newest vote, then the
 * slug (so the order never flickers). entry: { slug, votes, wanted, lastVoteMs }.
 */
function rankBallot(entries) {
  return [...(entries || [])].sort((a, b) =>
    (b.votes || 0) - (a.votes || 0) || (b.wanted || 0) - (a.wanted || 0) || (b.lastVoteMs || 0) - (a.lastVoteMs || 0) || String(a.slug).localeCompare(String(b.slug)));
}
/**
 * The ballot a new week opens with: the top `seed` Most wanted wishlist games (a game nobody wants is not
 * "most wanted", so it needs wanted >= 1) plus every `playing` game. Hidden games never. Ties on wanted go to
 * the more recently added game, then the slug. -> [{ slug, seededFrom: "mostWanted" | "owner" }]
 * (the playing games are the owner's own picks).
 */
function seedBallot({ games, seed }) {
  const ok = (games || []).filter((g) => g.hidden !== true);
  const wished = ok.filter((g) => g.status === "wishlist" && (g.wantedCount || 0) > 0)
    .sort((a, b) => (b.wantedCount || 0) - (a.wantedCount || 0) || (b.addedMs || 0) - (a.addedMs || 0) || String(a.slug).localeCompare(String(b.slug)))
    .slice(0, seed ?? DEFAULT_SETTINGS.defaults.ballotSeed);
  const playing = ok.filter((g) => g.status === "playing").sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
  return [...wished.map((g) => ({ slug: g.slug, seededFrom: "mostWanted" })), ...playing.map((g) => ({ slug: g.slug, seededFrom: "owner" }))];
}
/**
 * A member's vote check: unique slugs, at most `max`, all on the ballot. -> { ok, slugs } or { ok: false, reason }.
 */
function checkVotes(slugs, onBallot, max = DEFAULT_SETTINGS.defaults.votesPerMember) {
  if (!Array.isArray(slugs) || slugs.some((s) => typeof s !== "string" || !s)) return { ok: false, reason: "args" };
  const uniq = [...new Set(slugs)];
  if (uniq.length !== slugs.length) return { ok: false, reason: "duplicate" };
  if (uniq.length > max) return { ok: false, reason: "tooManyVotes" };
  const set = new Set(onBallot);
  if (uniq.some((s) => !set.has(s))) return { ok: false, reason: "notOnBallot" };
  return { ok: true, slugs: uniq };
}
/** Count changes from a member moving their votes: { slug: +1 | -1 } (unchanged slugs are left out). */
function voteDeltas(before, after) {
  const b = new Set(before || []), a = new Set(after || []);
  const d = {};
  for (const s of a) if (!b.has(s)) d[s] = 1;
  for (const s of b) if (!a.has(s)) d[s] = -1;
  return d;
}

// ---------------------------------------------------------------------------------------------
// Publishing: hero choices, warnings (section 6, 13)
// ---------------------------------------------------------------------------------------------
/** Seasonal frames to list first for a month (1-12): October is Halloween, December is Christmas. */
const seasonalFor = (month) => (month === 10 ? ["jack", "pumpkin"] : month === 12 ? ["blizzard", "snowman"] : []);
/**
 * Surprise me for the marquee frame: a random one from the POOL only, never a seasonal frame and never one
 * used in the last three weeks. `recent` is the frames of the previous weeks, newest first. `rng` is injectable.
 */
function rollFrame(recent, rng = Math.random) {
  const banned = new Set((recent || []).slice(0, FRAME_NO_REPEAT_WEEKS));
  const choices = FRAME_POOL.filter((f) => !banned.has(f));
  const from = choices.length ? choices : FRAME_POOL;                  // can't happen with an 11-frame pool and 3 banned
  return from[Math.min(from.length - 1, Math.floor(rng() * from.length))];
}
/** Surprise me for the door style. */
const rollDoors = (rng = Math.random) => DOOR_STYLES[Math.min(DOOR_STYLES.length - 1, Math.floor(rng() * DOOR_STYLES.length))];
/** Problems with a hero choice. The frame may be a pool or a seasonal one; doors one of the five styles. */
function validateHero(h) {
  const errs = [];
  if (!h || typeof h !== "object") return ["hero: { frame, doors }"];
  if (![...FRAME_POOL, ...FRAMES_SEASONAL].includes(h.frame)) errs.push("frame: not a known marquee frame");
  if (!DOOR_STYLES.includes(h.doors)) errs.push(`doors: ${DOOR_STYLES.join(", ")}`);
  return errs;
}
/** The default hero is the previous week's choice; with no history, the first pool frame and the jaws. */
const defaultHero = (previous) => (previous && validateHero(previous).length === 0 ? { frame: previous.frame, doors: previous.doors } : { frame: FRAME_POOL[0], doors: DOOR_STYLES[0] });

/**
 * Publish warnings (they never block): a slot without games, minimum crew missing, an overlap.
 * -> [{ streamId, kind: "noGames" | "minCrew" | "overlap", text }]
 */
function publishWarnings(streams, tz) {
  const live = (streams || []).filter((s) => s.state !== "cancelled");
  const name = (s) => `${dayLabel(ms(s.plannedStart), tz)} ${timeLabel(ms(s.plannedStart), tz)}`;
  const out = [];
  for (const s of live) {
    if (!(s.plannedGames || []).length) out.push({ streamId: s.id, kind: "noGames", text: `${name(s)} has no games yet` });
    const gaps = crewGaps(s);
    if (gaps.length) out.push({ streamId: s.id, kind: "minCrew", text: `${name(s)} needs ${gaps.map((g) => (g.need === "captain" ? "a Captain" : `a ${g.need} Lead`)).join(" and ")}` });
  }
  for (const { a, b } of findOverlaps(live)) out.push({ streamId: a, kind: "overlap", text: `${name(live.find((s) => s.id === a))} overlaps ${name(live.find((s) => s.id === b))}`, with: b });
  return out;
}

/** The week doc's counts: { slots, seatsOpen, votes }. seatsOpen counts missing minimum-crew items. */
function weekCounts(streams, votesTotal) {
  const live = (streams || []).filter((s) => s.state !== "cancelled");
  return { slots: live.length, seatsOpen: live.reduce((n, s) => n + crewGaps(s).length, 0), votes: votesTotal || 0 };
}

// ---------------------------------------------------------------------------------------------
// Delay and cancel (section 6)
// ---------------------------------------------------------------------------------------------
/** Owner, or an admin on the A2 Overseer rung or above. A1 Steward can't (Mod Machina safety net). */
const canDelayOrCancel = (w) => !!w && (w.isOwner === true || (w.isAdmin === true && w.track === "admin" && Number.isInteger(w.adminGrade) && w.adminGrade >= 2));

/** Whether a stream can still be moved or cancelled: before it starts, and only planned or scheduled. */
function movable(stream) {
  if (!["planned", "scheduled"].includes(stream.state)) return { ok: false, reason: "badState" };
  if (stream.actualStart != null) return { ok: false, reason: "started" };
  return { ok: true };
}

/**
 * The patch for delaying a stream (section 6). The new start and end default to the same length. Refused
 * after the start, in a final state, when it overlaps another stream, or when it moves outside its week.
 *   -> { ok, patch } | { ok: false, reason, with? }
 * `delay.originalStart/End` keep the FIRST times through repeated delays; `count` increases.
 */
function planDelay(stream, { startMs, endMs, reason, atMs, by }, others) {
  const m = movable(stream);
  if (!m.ok) return m;
  const curStart = ms(stream.plannedStart), curEnd = ms(stream.plannedEnd);
  if (!Number.isFinite(startMs)) return { ok: false, reason: "noStart" };
  const end = Number.isFinite(endMs) ? endMs : startMs + (curEnd - curStart);
  if (end <= startMs) return { ok: false, reason: "endBeforeStart" };
  if (startMs === curStart && end === curEnd) return { ok: false, reason: "noChange" };
  const clash = overlapsWith({ startMs, endMs: end }, others, stream.id);
  if (clash.length) return { ok: false, reason: "overlap", with: clash[0].id };
  const prev = stream.delay || null;
  return {
    ok: true,
    patch: {
      plannedStart: startMs, plannedEnd: end,
      delay: { originalStart: prev ? ms(prev.originalStart) : curStart, originalEnd: prev ? ms(prev.originalEnd) : curEnd, count: (prev?.count || 0) + 1, ...(reason ? { reason: String(reason).slice(0, 140) } : {}), atMs, by },
    },
  };
}
/** The patch for cancelling: state cancelled (through streams/logic's transitions), the record of who and why. */
function planCancel(stream, { reason, atMs, by }) {
  const m = movable(stream);
  if (!m.ok) return m;
  if (!ST.canTransition(stream.state, "cancelled")) return { ok: false, reason: "badState" };
  return { ok: true, patch: { state: "cancelled", cancel: { ...(reason ? { reason: String(reason).slice(0, 140) } : {}), atMs, by } } };
}

// ---------------------------------------------------------------------------------------------
// Reminders and the activity line (sections 4f, 4g)
// ---------------------------------------------------------------------------------------------
/**
 * Which crew reminder is due for a stream starting at `startMs`: "24h" while it is 1 to 24 hours away,
 * "1h" within the last hour, else null. The windows don't overlap, so a stream published late only ever
 * sends the one that still makes sense; the outbox document id makes a repeat run harmless.
 */
function reminderDue(startMs, nowMs) {
  const left = startMs - nowMs;
  if (left <= 0) return null;
  if (left <= HOUR) return "1h";
  if (left <= 24 * HOUR) return "24h";
  return null;
}

/** "Tonight's stream moved to 9:00 PM" style summary for the activity feed. */
function delayedSummary(stream, nowMs, tz) {
  const start = ms(stream.plannedStart);
  const when = localParts(start, tz).date === localParts(nowMs, tz).date ? "Tonight's stream" : `${dayLabel(start, tz)}'s stream`;
  return `${when} moved to ${timeLabel(start, tz)}`;
}
const weekPublishedSummary = (n) => `Next week's schedule is up: ${n} stream${n === 1 ? "" : "s"}`;

module.exports = {
  ROOMS, ROOM_GROUP, PLATFORM_ROOMS, SEAT_ROLES, AVAILABILITY, TYPES, AUDIENCES, EXCEPTION_KINDS, WEEK_STATES,
  FRAME_POOL, FRAMES_SEASONAL, DOOR_STYLES, FRAME_NO_REPEAT_WEEKS, DEFAULT_SETTINGS, GAME_COUNT_MAX, NOTE_MAX, HOUR, DAY,
  mergeSettings,
  // time and weeks
  tzOffsetMs, localParts, isDate, isTime, isWeekId, addDays, dowOf, zonedToUtc, weekOfDate, weekOf, weekMonday, nextWeek, prevWeek, weekBounds,
  // deadlines
  validateDeadlines, weekDeadlines, targetWeekAt, stateAt,
  // patterns and slots
  roomsForPlatforms, platformsForRooms, validateRooms, validateMinCrew, validatePattern, validateException, validateSlot, weekOffFor, expandWeek, slotFromPattern,
  // overlaps
  overlaps, overlapsWith, findOverlaps,
  // crew
  seatKey, normalizeSeat, seatEligibility, canHoldTogether, emptyCrew, seatsHeldBy, placeSeat, removeSeat, publicCrew, crewUids, crewGaps,
  validateSignup, validateGameRequest,
  // tray and ballot
  dayLabel, timeLabel, fitsTheme, trayGroups, plannedSource, rankBallot, seedBallot, checkVotes, voteDeltas,
  // publish
  seasonalFor, rollFrame, rollDoors, validateHero, defaultHero, publishWarnings, weekCounts,
  // delay and cancel
  canDelayOrCancel, movable, planDelay, planCancel,
  // reminders and summaries
  reminderDue, delayedSummary, weekPublishedSummary,
};
