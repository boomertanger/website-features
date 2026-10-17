// Boomertang's pure rules (docs/specs/boomertang.md §3, §5): who reads an issue, the newest issue, edition notes, votes. No Firestore here,
// so scripts/check-boomertang-fn.js checks every rule offline. The same reading rule is in firestore.rules (canReadTang*).

const ISSUE_ID = /^v(\d{1,3})n(\d{1,3})$/;
const POLL_ID = /^v\d{1,3}n\d{1,3}-[a-z0-9-]{1,60}$/;
const OPTION_ID = /^[a-z0-9-]{1,40}$/;
const NOTE_MAX = 120;
const EDITIONS_MAX = 200;

/** An issue id's order: v1n2 -> [1, 2]; null if it isn't one. */
function issueOrder(id) {
  const m = ISSUE_ID.exec(String(id || ""));
  return m ? [Number(m[1]), Number(m[2])] : null;
}
/** a is newer than b (by volume, then number). */
function newer(a, b) {
  const x = issueOrder(a), y = issueOrder(b);
  if (!x) return false;
  if (!y) return true;
  return x[0] !== y[0] ? x[0] > y[0] : x[1] > y[1];
}

/**
 * Can this reader open the issue's pages (spec §3, §5)? reader: { signedIn, member, sub, admin, owner }.
 * Owner and admins always (drafts too). Otherwise the issue must be published, and then: public issues to everyone; members-only issues
 * to members, except the newest issue, which only Sub Club reads first.
 */
function canRead(issue, currentIssueId, reader) {
  if (!issue) return false;
  if (reader.owner || reader.admin) return true;
  if (issue.status !== "published") return false;
  if (issue.access === "public") return true;
  if (!reader.member) return false;
  return issue.id !== currentIssueId || !!reader.sub;
}

/** Today's date in Central (the owner's time zone), YYYY-MM-DD. */
function todayCentral(nowMs) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(nowMs));
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** An edition note: trimmed, 1 to 120 characters, one line. Returns the note or null. */
function editionNote(v) {
  if (typeof v !== "string") return null;
  const n = v.replace(/\s+/g, " ").trim();
  return n.length >= 1 && n.length <= NOTE_MAX ? n : null;
}

/** Moves a vote: the new counts after `from` (or null) becomes `to`. Never below zero. */
function moveVote(counts, from, to) {
  const c = { ...(counts || {}) };
  if (from && from !== to) c[from] = Math.max(0, (c[from] || 0) - 1);
  if (from !== to) c[to] = (c[to] || 0) + 1;
  return c;
}

/** Is the poll taking votes at this moment? */
function pollOpen(poll, nowMs) {
  if (!poll || poll.open !== true) return false;
  const closes = poll.closesAt?.toMillis ? poll.closesAt.toMillis() : poll.closesAt;
  return !closes || closes > nowMs;
}

module.exports = { ISSUE_ID, POLL_ID, OPTION_ID, NOTE_MAX, EDITIONS_MAX, issueOrder, newer, canRead, todayCentral, editionNote, moveVote, pollOpen };
