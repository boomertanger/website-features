// Boom Arcade pure helpers (docs/specs/arcade-step1.md §4, §5): run checks, week
// keys, board rows and ranks. No Firebase here, so scripts/check-arcade.js can test
// every rule without credentials.

const DEVICES = ["desktop", "mobile"];
const RESULTS = ["win", "missed", "wrong", "boom", "tappedOut"];
const VOTE_KINDS = ["liked", "wantMore"];
const BOARD_SIZE = 100;
const MAX_SPLITS = 10;           // one per round (Tap the Splat has 10)
const FIREFLY_MIN_SECS = 2.6;    // round 2's flight is 2.6 to 5 s (tap-the-splat.md)
const WEEK_TZ = "America/Chicago";   // the site clock (docs/specs/fun-factory.md §3); was Pacific until Oct 2026

const isNum = (n) => typeof n === "number" && Number.isFinite(n);
const isInt = (n) => Number.isInteger(n);
/** Milliseconds from a Firestore Timestamp, a Date or a number. */
const ms = (at) => (at == null ? 0 : typeof at === "number" ? at : at.toMillis ? at.toMillis() : at.getTime ? at.getTime() : 0);

// ---------- run ids ----------
// The client only ever sees "gameId/version/docId", so finishRun and voteRun can
// find the run from the one id startRun handed back. The format check is strict
// (exactly 3 segments, docId a Firestore auto-id as startRun creates); ownRun still
// confirms the game and version exist and checks ownership on uid or runKey.
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const AUTO_ID_RE = /^[A-Za-z0-9]{20}$/;
function runPath(gameId, version, docId) { return `${gameId}/${version}/${docId}`; }
function parseRunId(runId) {
  if (typeof runId !== "string" || runId.length > 140) return null;
  const parts = runId.split("/");
  if (parts.length !== 3 || !ID_RE.test(parts[0]) || !ID_RE.test(parts[1]) || !AUTO_ID_RE.test(parts[2])) return null;
  const [gameId, version, docId] = parts;
  return { gameId, version, docId };
}
const validId = (s) => typeof s === "string" && ID_RE.test(s);

// ---------- weeks ----------
// Weeks start Monday 00:00 in America/Chicago (Central); the key is the ISO week of the
// finish time's local date there, e.g. "2026-W40".
function localDate(at, tz = WEEK_TZ) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms(at)));
  const get = (t) => +parts.find((p) => p.type === t).value;
  return { y: get("year"), m: get("month"), d: get("day") };
}
function weekKey(at, tz = WEEK_TZ) {
  const { y, m, d } = localDate(at, tz);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay() || 7;                 // Monday 1 ... Sunday 7
  date.setUTCDate(date.getUTCDate() + 4 - dow);      // the Thursday of this ISO week
  const isoYear = date.getUTCFullYear();
  const week = Math.ceil(((date - Date.UTC(isoYear, 0, 1)) / 86400000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}
/** "2026-09-29" in the site timezone (the daily salt rotation). */
function dayKey(at, tz = WEEK_TZ) {
  const { y, m, d } = localDate(at, tz);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// ---------- boards ----------
function boardId(epoch, device, period) { return `e${epoch}_${device}_${period}`; }

/** Faster first; on a tie the earlier run ranks higher. */
function compareRows(a, b) { return a.secs - b.secs || ms(a.at) - ms(b.at); }
/** True when (secs, at) beats the existing entry (null = no entry yet). */
function beats(secs, at, prev) { return !prev || secs < prev.secs || (secs === prev.secs && ms(at) < ms(prev.at)); }

/**
 * Puts a member's best into a board's rows: one row per member (their best), sorted,
 * trimmed to 100. Returns { rows, rank (1-based, or null when it didn't place), changed }.
 * A row that doesn't beat the member's existing row leaves the board as it was.
 */
function insertRow(rows, row, size = BOARD_SIZE) {
  const list = Array.isArray(rows) ? rows.slice() : [];
  const at = list.findIndex((r) => r.uid === row.uid);
  if (at >= 0 && !beats(row.secs, row.at, list[at])) {
    return { rows: list, rank: at + 1, changed: false };
  }
  if (at >= 0) list.splice(at, 1);
  list.push(row);
  list.sort(compareRows);
  const trimmed = list.slice(0, size);
  const i = trimmed.findIndex((r) => r.uid === row.uid);
  const changed = i >= 0 || at >= 0;
  return { rows: changed ? trimmed : (Array.isArray(rows) ? rows.slice() : []), rank: i >= 0 ? i + 1 : null, changed };
}
/** Removes a member's row. */
function removeRow(rows, uid) { return (rows || []).filter((r) => r.uid !== uid); }
/** A member's 1-based rank on a board's rows, or null. */
function rankOf(rows, uid) { const i = (rows || []).findIndex((r) => r.uid === uid); return i >= 0 ? i + 1 : null; }
/** Rows rebuilt from best entries ({ uid, handle, displayName, secs, penalties, at }). */
function buildRows(entries, size = BOARD_SIZE) { return entries.slice().sort(compareRows).slice(0, size); }

// ---------- run checks ----------
/**
 * The finishRun checks (arcade-step1.md §5.2). `secs` is the time the player saw:
 * wall clock plus miss-click penalties, so the clock and floor checks use the wall
 * clock part (secs - penalties), and splits are wall-clock seconds at each round start.
 * Returns { ok, reasons } (reasons are short codes; empty when ok).
 */
function checkRun({ result, secs, penalties, reached, splits, device }, { serverSecs, checks }) {
  const reasons = [];
  const c = checks || {};
  const slack = isNum(c.slackSecs) ? c.slackSecs : 3;
  if (!RESULTS.includes(result)) reasons.push("result");
  if (!isInt(penalties) || penalties < 0 || penalties > 999) reasons.push("penalties");
  if (!isNum(secs) || secs < 0 || secs > 24 * 3600) reasons.push("secs");
  const wall = isNum(secs) && isInt(penalties) ? secs - penalties : NaN;
  if (!isNum(wall) || wall < 0 || Math.abs(wall - serverSecs) > slack) reasons.push("clock");
  if (result === "win") {
    const floor = c.minSecs?.[device];
    if (isNum(floor) && !(wall >= floor)) reasons.push("tooFast");
  }
  if (!isNum(reached) || reached < 0 || reached > 100) reasons.push("reached");
  else if (result === "win" ? reached !== 100 : reached >= 100) reasons.push("reached");
  if (!Array.isArray(splits) || splits.length > MAX_SPLITS || !splits.every(isNum)) {
    reasons.push("splits");
  } else {
    let ok = splits.every((s, i) => s >= 0 && (i === 0 || s > splits[i - 1]) && (!isNum(wall) || s <= wall + 0.05));
    if (result === "win" && splits.length !== MAX_SPLITS) ok = false;
    if (splits.length >= 3 && splits[2] - splits[1] < FIREFLY_MIN_SECS) ok = false;
    if (!ok) reasons.push("splits");
  }
  return { ok: reasons.length === 0, reasons };
}

/** Where a run's time can go: why it's not on the boards, or null when it can. */
function boardBlock({ result, ok, uid, signedUp, verified, epoch, currentEpoch }) {
  if (result === "tappedOut") return "tappedOut";
  if (result !== "win") return "lost";
  if (!ok) return "checks";
  if (!uid) return "visitor";
  if (!signedUp) return "needsSignup";
  if (!verified) return "unverified";
  if (epoch !== currentEpoch) return "epoch";
  return null;
}

module.exports = {
  DEVICES, RESULTS, VOTE_KINDS, BOARD_SIZE, MAX_SPLITS, WEEK_TZ,
  ms, runPath, parseRunId, validId, weekKey, dayKey, boardId,
  compareRows, beats, insertRow, removeRow, rankOf, buildRows, checkRun, boardBlock,
};
