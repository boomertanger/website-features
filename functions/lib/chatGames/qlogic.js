// Chat Games, Questions: pure rules (docs/specs/chat-games.md §4, §11, §15). No Firestore here: questions.js reads, calls these, writes.
//
//   STATUS        held | tonight | standing | answered | hidden | merged | cleared | archived | withdrawn
//   OPEN          held, tonight, standing (counted toward the 3-open limit; votable: tonight and standing)
//   cleanText(t)  { ok, text } | { ok: false, reason }: 1 to 200 characters of plain text, no links, the profanity list
//   laneFor(live) "tonight" while a stream is live, else "standing"
//   isHeld({ signedUpAtMs, staff, nowMs })   accounts under 7 days are held for a mod (staff never are)
//   queue(list, { skipped, pinned, current })   the session order: Tonight by votes, then Standing by votes, ties by oldest; a pinned one first
//   canMerge(src, target)   { ok } | { ok: false, reason }
//   mergeVoters(srcVoters, targetVoters, targetAsker)   the voters the target gains (each counted once; never the target's asker)
//   settleAtStop(q)        what a Tonight question becomes at Stop: { status: "standing" } (5+ votes) | { status: "cleared" }
//   archiveDue(q, nowMs)   a Standing question unanswered for 30 days
const STATUS = ["held", "tonight", "standing", "answered", "hidden", "merged", "cleared", "archived", "withdrawn"];
const OPEN = ["held", "tonight", "standing"];
const VOTABLE = ["tonight", "standing"];
const PUBLIC = ["tonight", "standing", "answered", "merged", "cleared", "archived"];   // everyone reads these; held, hidden and withdrawn: the asker and crew
const MAX_LEN = 200, MAX_OPEN = 3;
const DAY = 24 * 60 * 60 * 1000;
const HOLD_MS = 7 * DAY, CLEAR_KEEP_MS = 30 * DAY, ARCHIVE_MS = 30 * DAY;
const STANDING_VOTES = 5;
const MINUTES = [5, 10, 15, 0];   // 0 = open-ended
const ANSWER_XP = 15;
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]{2,}\.(com|net|org|gg|tv|io|ly|me|co|xyz|app|live|info|biz|us|uk)\b)/i;

function cleanText(t, { isProfane = () => false } = {}) {
  const text = String(t == null ? "" : t).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return { ok: false, reason: "empty", message: "Write your question first." };
  if (text.length > MAX_LEN) return { ok: false, reason: "tooLong", message: `Keep it under ${MAX_LEN} characters.` };
  if (LINK.test(text)) return { ok: false, reason: "link", message: "Links can't go in a question." };
  if (isProfane(text)) return { ok: false, reason: "blocked", message: "That question has words we don't allow. Try asking it another way." };
  return { ok: true, text };
}
const laneFor = (live) => (live ? "tonight" : "standing");
const isHeld = ({ signedUpAtMs, staff = false, nowMs }) => !staff && (!Number.isFinite(signedUpAtMs) || nowMs - signedUpAtMs < HOLD_MS);

/** list: [{ id, status, votes, createdAtMs }]. Returns the candidates in session order (current, skipped and non-votable ones left out). */
function queue(list, { skipped = [], pinned = null, current = null } = {}) {
  const skip = new Set(skipped || []);
  const c = (list || []).filter((q) => q && VOTABLE.includes(q.status) && q.id !== current && !skip.has(q.id));
  const by = (a, b) => (b.votes || 0) - (a.votes || 0) || (a.createdAtMs || 0) - (b.createdAtMs || 0) || String(a.id).localeCompare(String(b.id));
  const out = [...c.filter((q) => q.status === "tonight").sort(by), ...c.filter((q) => q.status === "standing").sort(by)];
  const p = pinned ? out.findIndex((q) => q.id === pinned) : -1;
  if (p > 0) out.unshift(out.splice(p, 1)[0]);
  return out;
}

function canMerge(src, target) {
  if (!src || !target) return { ok: false, reason: "gone", message: "That question is gone." };
  if (src.id === target.id) return { ok: false, reason: "same", message: "Pick a different question to merge into." };
  if (!OPEN.includes(src.status)) return { ok: false, reason: "notOpen", message: "Only open questions can be merged." };
  if (target.status === "merged") return { ok: false, reason: "targetMerged", message: "That question was merged itself. Merge into the one it went to." };
  if (target.status === "answered") return { ok: false, reason: "targetAnswered", message: "That question was already answered." };
  if (!VOTABLE.includes(target.status)) return { ok: false, reason: "targetNotOpen", message: "Merge into a question in Tonight or Standing." };
  return { ok: true };
}
/** The uids the target gains from the source's voters plus the source's asker (counted once; never the target's own asker). */
function mergeVoters(srcVoters, targetVoters, targetAsker, srcAsker = null) {
  const have = new Set(targetVoters || []);
  const gain = [];
  for (const u of [...(srcVoters || []), ...(srcAsker ? [srcAsker] : [])]) {
    if (!u || u === targetAsker || have.has(u)) continue;
    have.add(u); gain.push(u);
  }
  return { gain, total: have.size };
}

const settleAtStop = (q) => ((q.votes || 0) >= STANDING_VOTES ? { status: "standing" } : { status: "cleared" });
const archiveDue = (q, nowMs) => q && q.status === "standing" && Number.isFinite(q.standingSinceMs) && nowMs - q.standingSinceMs >= ARCHIVE_MS;
const sessionMinutes = (m) => (MINUTES.includes(Number(m)) ? Number(m) : 10);

module.exports = {
  STATUS, OPEN, VOTABLE, PUBLIC, MAX_LEN, MAX_OPEN, HOLD_MS, CLEAR_KEEP_MS, ARCHIVE_MS, STANDING_VOTES, MINUTES, ANSWER_XP, DAY,
  cleanText, laneFor, isHeld, queue, canMerge, mergeVoters, settleAtStop, archiveDue, sessionMinutes,
};
