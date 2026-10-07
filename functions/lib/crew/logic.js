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

module.exports = { MOD_GRADES, ADMIN_GRADES, STATUSES, PLATFORM_PREFS, DEFAULT_SETTINGS, mergeSettings, claimGrade, publicCrew, gradeName, effectiveGrade, isMod };
