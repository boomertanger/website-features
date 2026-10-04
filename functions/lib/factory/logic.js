// Fun Factory pure logic (docs/specs/fun-factory.md §3, §5, §13a). No Firestore here, so
// scripts/check-factory.js can check every rule.
//
// Clock: America/Chicago (Central). Day keys run midnight to midnight Central ("2026-10-04");
// weeks start Monday 00:00 Central (ISO week keys, "2026-W40"), the same keys as the Arcade.
//
//   dayKey(at) / weekKey(at)        Central day and week keys
//   addDays(day, n) / daysBetween(a, b)   arithmetic on day keys (calendar days, DST-proof)
//   periodKey(repeat, at)           "all" | day key | week key, from an activity's repeat
//   paramsMatch(want, got)          every parameter the activity sets must match the event's
//   audienceOk(audience, who)       all / sub (Sub Club or crew) / crew (mods and admins)
//   tierFor(who)                    the season board a member races on: fan, sub, crew; null for admins
//   streakCheckIn(state, today, cap)   a check-in's effect on the streak (savers, resets, badges)
//   streakSweep(state, today)       the nightly sweep: spend savers for missed days, or break
//   revealDue(node, now)            the scheduler reveals a chapter, campaign or activity
//   campaignOpen(campaign, season, now)   a campaign counts actions right now
//   capXp(xp, earnedToday, cap)     the XP a completion may pay under the season's daily cap
//   rankRows(rows) / seasonAwards(rows)   board order; trophies (top 3) and plaques (4 to 10)
//   seasonsOverlap(a, b)            two seasons' [startsAt, endsAt) windows overlap
const { dayKey, weekKey, ms, WEEK_TZ: TZ } = require("../arcade/logic");

const DAY_MS = 24 * 60 * 60 * 1000;
const REPEATS = ["none", "daily", "weekly"];
const CADENCES = ["daily", "weekly", "story", "milestone", "event"];
const AUDIENCES = ["all", "sub", "crew"];
const STATUSES = ["draft", "review", "scheduled", "live", "ended", "archived"];
const STREAK_BADGES = [3, 7, 14, 21, 30, 45, 60, 75, 100, 150, 200, 365];
const SAVER_EVERY = 7;
const SAVERS_CAP = { base: 2, plus: 3 };
const SEASON_PLACES = { trophies: 3, plaques: 10 };
// The sections factoryVisit counts (the first path segment); anything else is refused.
const VISIT_SECTIONS = ["/", "/live", "/schedule", "/games", "/arcade", "/trophies", "/factory", "/streams", "/shop", "/club"];

// ---------- day keys ----------
const parseDay = (k) => { const [y, m, d] = k.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const fmtDay = (t) => new Date(t).toISOString().slice(0, 10);
/** The day key n calendar days after `day` (negative goes back). */
const addDays = (day, n) => fmtDay(parseDay(day) + n * DAY_MS);
/** Calendar days from day a to day b (b - a); 1 when b is the day after a. */
const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / DAY_MS);
const isDayKey = (k) => typeof k === "string" && /^\d{4}-\d{2}-\d{2}$/.test(k);

function periodKey(repeat, at) {
  if (repeat === "daily") return dayKey(at);
  if (repeat === "weekly") return weekKey(at);
  return "all";
}

// ---------- matching ----------
/** Every parameter the activity sets (not null or "") must equal the event's, as strings. */
function paramsMatch(want, got) {
  const w = want && typeof want === "object" ? want : {};
  const g = got && typeof got === "object" ? got : {};
  return Object.entries(w).every(([k, v]) => v == null || v === "" || String(g[k]) === String(v));
}

/** who: { roles, isOwner, staging }. Sub Club is the staging-only "sub" role until billing ships (as setShowcase). */
function who(w = {}) {
  const roles = Array.isArray(w.roles) ? w.roles : [];
  const admin = !!w.isOwner || roles.includes("admin");
  const crew = admin || roles.includes("mod");
  const sub = !!w.staging && roles.includes("sub");
  return { admin, crew, sub };
}
function audienceOk(audience, w) {
  const x = who(w);
  if (audience === "crew") return x.crew;
  if (audience === "sub") return x.sub || x.crew;
  return true;
}
/** Admins (and the owner) never race; mods race on the crew board; Sub Club on sub; everyone else fan. */
function tierFor(w) {
  const x = who(w);
  if (x.admin) return null;
  if (x.crew) return "crew";
  if (x.sub) return "sub";
  return "fan";
}
const saversCapFor = (w) => { const x = who(w); return x.sub || x.crew ? SAVERS_CAP.plus : SAVERS_CAP.base; };

// ---------- streaks (§13a) ----------
// state: { current, best, lastDay, savers, saversCap }. lastDay is the last day the streak covers
// (a check-in, or a missed day a saver paid for); null once the streak is broken.
function streakCheckIn(state, today, cap = SAVERS_CAP.base) {
  const s = { current: 0, best: 0, lastDay: null, savers: 0, ...(state || {}) };
  if (s.lastDay === today) return { ...s, saversCap: cap, already: true, spent: 0, earnedSaver: false, badges: [] };
  let current, savers = Math.min(s.savers || 0, cap), spent = 0;
  const gap = s.lastDay && s.current > 0 ? daysBetween(s.lastDay, today) - 1 : null;   // days missed in between
  if (gap === 0) current = s.current + 1;
  else if (gap != null && gap > 0 && savers >= gap) { savers -= gap; spent = gap; current = s.current + 1; }
  else current = 1;
  const earnedSaver = current % SAVER_EVERY === 0 && savers < cap;
  if (earnedSaver) savers += 1;
  return {
    current, best: Math.max(s.best || 0, current), lastDay: today, savers, saversCap: cap,
    already: false, spent, earnedSaver, badges: STREAK_BADGES.filter((n) => n === current).map((n) => `streak-day-${n}`),
  };
}
/** The 00:10 sweep: a streak that didn't check in yesterday spends savers for the missed days, or breaks. */
function streakSweep(state, today) {
  const s = { current: 0, best: 0, lastDay: null, savers: 0, ...(state || {}) };
  const yesterday = addDays(today, -1);
  if (!s.lastDay || s.current <= 0 || s.lastDay >= yesterday) return { ...s, changed: false };
  const missed = daysBetween(s.lastDay, yesterday);
  if ((s.savers || 0) >= missed) return { ...s, savers: s.savers - missed, lastDay: yesterday, spent: missed, broke: false, changed: true };
  return { ...s, current: 0, lastDay: null, spent: 0, broke: true, changed: true };
}

// ---------- scheduling ----------
/** When a node reveals: a chapter at unlockAt, a campaign at opensAt; activities follow their campaign. */
function revealDue(node, now) {
  if (!node || node.revealed === true) return false;
  const at = ms(node.unlockAt ?? node.opensAt);
  return at > 0 && at <= now;
}
/** A campaign counts actions when it's revealed and inside its window (and the season's). */
function campaignOpen(campaign, season, now) {
  if (!campaign || campaign.revealed !== true || campaign.enabled === false) return false;
  const opens = ms(campaign.opensAt), closes = ms(campaign.closesAt) || ms(season?.endsAt);
  return opens <= now && (!closes || now < closes) && (!season || now < ms(season.endsAt));
}
const seasonLive = (season, now) => !!season && season.status === "live" && ms(season.startsAt) <= now && now < ms(season.endsAt);

/** The XP a completion may pay with `earnedToday` already paid today, under an optional daily cap. */
function capXp(xp, earnedToday, cap) {
  const n = Math.max(0, Math.floor(Number(xp) || 0));
  if (!(cap > 0)) return n;
  return Math.max(0, Math.min(n, cap - (earnedToday || 0)));
}

// ---------- boards and season end ----------
/** Most season XP first; on a tie, whoever got there first (updatedAt earlier). */
function rankRows(rows) {
  return [...(rows || [])].filter((r) => r && r.seasonXp > 0)
    .sort((a, b) => b.seasonXp - a.seasonXp || ms(a.updatedAt) - ms(b.updatedAt) || String(a.uid).localeCompare(String(b.uid)));
}
/** Places 1-3 get a season trophy, 4-10 a plaque (rewards.md §7). */
function seasonAwards(rows) {
  return rankRows(rows).slice(0, SEASON_PLACES.plaques).map((r, i) => ({ uid: r.uid, place: i + 1, kind: i < SEASON_PLACES.trophies ? "season" : "plaque" }));
}
const seasonsOverlap = (a, b) => ms(a.startsAt) < ms(b.endsAt) && ms(b.startsAt) < ms(a.endsAt);

/** "/arcade/leaderboards" -> "/arcade"; null when it isn't a section the site tour counts. */
function visitSection(path) {
  if (typeof path !== "string" || path.length > 200 || !path.startsWith("/")) return null;
  const seg = path.split(/[?#]/)[0].split("/").filter(Boolean)[0];
  const section = seg ? `/${seg.toLowerCase()}` : "/";
  return VISIT_SECTIONS.includes(section) ? section : null;
}

module.exports = {
  TZ, DAY_MS, REPEATS, CADENCES, AUDIENCES, STATUSES, STREAK_BADGES, SAVER_EVERY, SAVERS_CAP, SEASON_PLACES, VISIT_SECTIONS,
  dayKey, weekKey, ms, addDays, daysBetween, isDayKey, periodKey,
  paramsMatch, audienceOk, tierFor, saversCapFor,
  streakCheckIn, streakSweep, revealDue, campaignOpen, seasonLive, capXp,
  rankRows, seasonAwards, seasonsOverlap, visitSection,
};
