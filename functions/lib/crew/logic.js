// Mod Machina, pure helpers (docs/specs/mod-machina.md): grades, status, the settings defaults and the
// claim values. No Firestore here, so scripts/check-crew.js can run it without credentials.
const MOD_GRADES = ["Initiate", "Watcher", "Warden", "Sentinel"];          // grade 1-4
const ADMIN_GRADES = ["Steward", "Overseer", "Right Hand"];                 // grade 1-3 on the admin track (A1-A3)
const STATUSES = ["active", "checkIn", "goingDark", "reserve", "alumni", "paused"];
const PLATFORM_PREFS = ["favourite", "happy", "ifNeeded", "no"];

// Crew settings (crew/main). The document wins; anything missing falls back to these.
const DEFAULT_SETTINGS = {
  gearsValues: {                                       // spec 4a, tunable in /admin/crew
    dutyCaptainPerHour: 12, dutyRoomLeadPerHour: 10, dutyDeckhandPerHour: 6,
    showedUp: 5, tookOver: 5, hostedGame: 5, earlySignup: 3,
    recruitActivated: 10, recruitFirstCheckin: 5, queueReview: 2, queueReviewMonthlyCap: 10,
    academyModule: 5, triage: 3, dutyHoursCapPerStream: 6,
  },
  youtubeBoost: 1.5,
  activityRules: false,        // the monthly minimums stay off until stream duty exists (phase 3)
  checkinFallback: true,       // Night Shift daily check-ins stand in for stream check-ins
  recruitCapPerMonth: 10,
  vouchCap: 3,
  appExpiryDays: 90,
  reapplyDays: 60,
  twitchSync: false,           // Twitch moderator sync (2e): off until a broadcaster token with channel:manage:moderators exists
};

function mergeSettings(doc) {
  const d = doc || {};
  const out = { ...DEFAULT_SETTINGS, ...d, gearsValues: { ...DEFAULT_SETTINGS.gearsValues, ...(d.gearsValues || {}) } };
  return out;
}

const isMod = (r) => !!r && r.track !== "admin";
/** The custom-claim value for a roster entry: 1-4 on the mod track, "A1"-"A3" on the admin track. */
function claimGrade(roster) {
  if (!roster || !Number.isInteger(roster.grade)) return null;
  if (roster.track === "admin") return roster.grade >= 1 && roster.grade <= 3 ? `A${roster.grade}` : null;
  return roster.grade >= 1 && roster.grade <= 4 ? roster.grade : null;
}
/** The public subset mirrored to profiles/{uid}.crew: grade, track and status, nothing else. */
function publicCrew(roster) {
  if (!roster || claimGrade(roster) == null) return null;
  return { grade: roster.grade, track: roster.track === "admin" ? "admin" : "mod", status: STATUSES.includes(roster.status) ? roster.status : "active" };
}
const gradeName = (track, grade) => (track === "admin" ? ADMIN_GRADES : MOD_GRADES)[grade - 1] || null;

/** Mod-track grade for permission checks: admins count as Sentinel-level (4). */
function effectiveGrade(roster) {
  if (!roster) return 0;
  if (roster.track === "admin") return 4;
  return Number.isInteger(roster.grade) ? roster.grade : 0;
}


// ---------- 2a: applying, the queue, promotion criteria ----------
const DAY_MS = 86400000;
const CHECKIN_WINDOW_DAYS = 30;
const VOUCH_WEIGHT = { 2: 1, 3: 2, 4: 3 };       // Watcher 1, Warden 2, Sentinel 3 (admins count as Sentinel)
const vouchWeight = (grade) => VOUCH_WEIGHT[grade] || 0;
const moduleId = (n) => `m${n}`;

/** Day keys ("2026-10-04") within the last `days` days up to and including today's key. */
function checkinsWithin(recentDays, todayKey, days = CHECKIN_WINDOW_DAYS) {
  const t = Date.parse(`${todayKey}T00:00:00Z`);
  return new Set((recentDays || []).filter((d) => {
    const x = Date.parse(`${d}T00:00:00Z`);
    return x <= t && t - x < days * DAY_MS;
  })).size;
}
const monthCheckins = (recentDays, todayKey) => (recentDays || []).filter((d) => d.slice(0, 7) === todayKey.slice(0, 7)).length;

/**
 * Can this member apply (spec 10, with the section 15 fallbacks)? Returns { ok, reason, ... }.
 * input: ageBand, signedUpAtMs, linkedCount, checkins (in the last 30 days), waived, now, settings,
 *        crewStatus (an existing roster status or null), openApp (bool), lastNotNowAtMs
 */
function applyEligibility(i) {
  const s = i.settings || DEFAULT_SETTINGS;
  if (i.ageBand !== "18+") return { ok: false, reason: "under18" };
  if (i.crewStatus && i.crewStatus !== "alumni") return { ok: false, reason: "alreadyCrew" };
  if (i.openApp) return { ok: false, reason: "openApplication" };
  if (i.lastNotNowAtMs && i.now < i.lastNotNowAtMs + s.reapplyDays * DAY_MS) return { ok: false, reason: "reapplyWait", reapplyAtMs: i.lastNotNowAtMs + s.reapplyDays * DAY_MS };
  if (!(i.signedUpAtMs && i.now - i.signedUpAtMs >= 14 * DAY_MS)) return { ok: false, reason: "tooNew" };
  if (!(i.linkedCount >= 1)) return { ok: false, reason: "noPlatform" };
  if (!i.waived) {
    if (!s.checkinFallback) return { ok: false, reason: "needsStreamCheckins" };   // real stream check-ins arrive with the Control Room
    if ((i.checkins || 0) < 3) return { ok: false, reason: "needsCheckins" };
  }
  return { ok: true };
}

/** The queue score (spec 10): vouches by grade + platform need (a YouTube Favourite or Happy: +3) + check-ins in 30 days. */
function queueScore({ vouchGrades = [], prefs = {}, checkins = 0 }) {
  const vouches = vouchGrades.reduce((n, g) => n + vouchWeight(g), 0);
  const yt = ["favourite", "happy"].includes(prefs.ytLandscape) || ["favourite", "happy"].includes(prefs.ytVertical) ? 3 : 0;
  const checks = Math.max(0, Math.floor(checkins));
  return { score: vouches + yt + checks, vouches, youtube: yt, checkins: checks };
}
/** Orders applications best first (score, then earlier). Returns [{ id, rank, band, score }]. */
function rankQueue(apps) {
  const sorted = [...apps].sort((a, b) => b.score - a.score || (a.createdAtMs || 0) - (b.createdAtMs || 0) || String(a.id).localeCompare(String(b.id)));
  return sorted.map((a, i) => ({ id: a.id, rank: i + 1, band: i < 5 ? "Top 5" : "In the queue", score: a.score }));
}

/**
 * Spec 3a "to move up" criteria for the nightly flag. Returns { ready, to, met: [], missing: [], pending: [] }.
 * pending = criteria that need stream duty (phase 3), skipped while settings.activityRules is false.
 * input: roster { track, grade, gradeSince(ms) }, stats { duties, asRoomLead, asCaptain, rideAlongs, showedPct, mentored },
 *        passed (module ids), strikes (active count), now, settings
 */
function promotionCriteria({ roster, stats = {}, passed = [], strikes = 0, now, settings = DEFAULT_SETTINGS }) {
  if (!roster || roster.track === "admin" || !(roster.grade >= 1 && roster.grade <= 3) || roster.status === "paused") return { ready: false, to: null, met: [], missing: [], pending: [] };
  const met = [], missing = [], pending = [];
  const check = (label, ok) => (ok ? met : missing).push(label);
  const duty = (label, ok) => (settings.activityRules ? check(label, ok) : pending.push(label));
  const has = (n) => passed.includes(moduleId(n));
  const days = (now - (roster.gradeSince || 0)) / DAY_MS;
  if (roster.grade === 1) {
    check("Core Academy modules 1 to 6", [1, 2, 3, 4, 5, 6].every(has));
    duty("2 ride-alongs signed off", (stats.rideAlongs || 0) >= 2);
    check("30 days as Initiate", days >= 30);
    duty("Showed up for 80% of duties", (stats.showedPct ?? 0) >= 80);
  } else if (roster.grade === 2) {
    check("90 days as Watcher", days >= 90);
    duty("15 duties, 5 as Room Lead", (stats.duties || 0) >= 15 && (stats.asRoomLead || 0) >= 5);
    check("Safety module", has(9));
    check("No active strikes", strikes === 0);
  } else {
    check("6 months as Warden", days >= 182);
    duty("40 duties, 10 as Captain", (stats.duties || 0) >= 40 && (stats.asCaptain || 0) >= 10);
    duty("Mentored 2 Initiates to Watcher", (stats.mentored || 0) >= 2);
    check("No active strikes", strikes === 0);
  }
  return { ready: missing.length === 0, to: roster.grade + 1, met, missing, pending };
}

/** Whole calendar months between two instants (the crew service ladder: 3, 6, 12, 24). */
function monthsBetween(fromMs, toMs) {
  const a = new Date(fromMs), b = new Date(toMs);
  let m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) m--;
  return Math.max(0, m);
}
const SERVICE_STEPS = [3, 6, 12, 24];
/** The service badge ids earned after `months` months: crew-service-3 ... crew-service-24. */
const serviceBadges = (months) => SERVICE_STEPS.filter((n) => months >= n).map((n) => `crew-service-${n}`);

const STRIKE_EXPIRY_DAYS = 183;
const activeStrikes = (strikes, now) => (strikes || []).filter((s) => (s.expiresAtMs || 0) > now);

module.exports = { MOD_GRADES, ADMIN_GRADES, STATUSES, PLATFORM_PREFS, DEFAULT_SETTINGS, mergeSettings, claimGrade, publicCrew, gradeName, effectiveGrade, isMod, DAY_MS, vouchWeight, moduleId, checkinsWithin, monthCheckins, applyEligibility, queueScore, rankQueue, promotionCriteria, STRIKE_EXPIRY_DAYS, activeStrikes, monthsBetween, SERVICE_STEPS, serviceBadges };
