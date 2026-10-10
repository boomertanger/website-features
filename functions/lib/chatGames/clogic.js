// Chat Games, the choice formats: pure rules for Would You Rather and Predictions (docs/specs/chat-games.md §6, §7, §11; part 5). No Firestore here:
// choices.js reads, calls these, writes.
//
//   WYR_TIMES / WYR_DEFAULT_S      30, 45, 60 s of voting (45 by default)
//   PRED_OPEN_MS                   a Prediction locks itself after 3 minutes; MAX_WAITING locked ones may wait at once (3)
//   VOTE_XP / LOCK_XP / WIN_XP     3 for a Would You Rather vote, 3 for a locked pick, +10 for a correct one
//   promptOf(formatId, input, { isProfane })   a typed-live prompt through the pack card rules (plogic.cardShape): Would You Rather a lead line of 80
//                                  ("Would you rather…" when empty) plus two options of 80; Predictions a question of 120 plus 2 to 4 answers of 40
//   tally(picks, n)                { counts: [n], total, pct: [n] } from { uid: index }
//   leaders(counts)                the indexes with the most votes ([] when nobody voted)
//   waitingAdd(list, entry)        { ok, list } | { ok: false, reason: "waitingFull" }: the locked Predictions that wait (at most MAX_WAITING)
//   waitingDrop(list, runId)       the list without that run
//   settleCheck(run, action, { proposal, answer })   which settle moves are allowed now (confirm needs a proposal; correct once, only after a result)
const PL = require("./plogic");

const WYR_TIMES = [30, 45, 60], WYR_DEFAULT_S = 45;
const PRED_OPEN_MS = 3 * 60 * 1000;
const MAX_WAITING = 3;
const VOTE_XP = 3, LOCK_XP = 3, WIN_XP = 10;
const WYR_LEAD = "Would you rather…";
const SETTLE_ACTIONS = ["confirm", "reject", "settle", "void", "correct"];

const secondsOf = (s) => (WYR_TIMES.includes(Number(s)) ? Number(s) : WYR_DEFAULT_S);

/** A typed prompt or a pack card as the run keeps it: { text, options }. */
function promptOf(formatId, input, { isProfane = () => false } = {}) {
  const x = input || {};
  const r = PL.cardShape(formatId, { text: x.text, options: x.options }, { isProfane });
  if (!r.ok) return r;
  return { ok: true, prompt: { text: r.card.text || (formatId === "would-you-rather" ? WYR_LEAD : ""), options: r.card.options || [] } };
}
/** picks: { uid: index }. */
function tally(picks, n) {
  const counts = Array.from({ length: n }, () => 0);
  for (const i of Object.values(picks || {})) if (Number.isInteger(i) && i >= 0 && i < n) counts[i]++;
  const total = counts.reduce((a, b) => a + b, 0);
  return { counts, total, pct: counts.map((c) => (total ? Math.round((c / total) * 100) : 0)) };
}
function leaders(counts) {
  const top = Math.max(0, ...(counts || []));
  return top > 0 ? counts.map((c, i) => (c === top ? i : -1)).filter((i) => i >= 0) : [];
}
function waitingAdd(list, entry) {
  const cur = (Array.isArray(list) ? list : []).filter((x) => x && x.runId !== entry.runId);
  if (cur.length >= MAX_WAITING) return { ok: false, reason: "waitingFull" };
  return { ok: true, list: [...cur, { runId: String(entry.runId), title: entry.title == null ? null : String(entry.title).slice(0, 120) }] };
}
const waitingDrop = (list, runId) => (Array.isArray(list) ? list : []).filter((x) => x && x.runId !== runId);

/** run: a Prediction. answer: an index (settle, correct). */
function settleCheck(run, action, { proposal = null, answer = null } = {}) {
  if (!run) return { ok: false, reason: "noRun" };
  if (!SETTLE_ACTIONS.includes(action)) return { ok: false, reason: "badAction" };
  const n = ((run.prompt || {}).options || []).length;
  const okAnswer = (a) => Number.isInteger(a) && a >= 0 && a < n;
  if (action === "correct") {
    if (!["revealed", "ended"].includes(run.state) || !run.result) return { ok: false, reason: "notSettled" };
    if (run.corrected) return { ok: false, reason: "corrected" };
    if (!okAnswer(answer) || answer === run.result.answer) return { ok: false, reason: "badAnswer" };
    return { ok: true };
  }
  if (action === "void") return ["open", "locked"].includes(run.state) ? { ok: true } : { ok: false, reason: run.state === "void" ? "already" : "over" };
  if (run.state !== "locked") return { ok: false, reason: run.state === "open" ? "notLocked" : "over" };
  if (action === "confirm") return proposal && okAnswer(proposal.answer) ? { ok: true, answer: proposal.answer } : { ok: false, reason: "noProposal" };
  if (action === "reject") return proposal ? { ok: true } : { ok: false, reason: "noProposal" };
  return okAnswer(answer) ? { ok: true, answer } : { ok: false, reason: "badAnswer" };
}
function refusal(reason) {
  switch (reason) {
    case "waitingFull": return `${MAX_WAITING} Predictions are already waiting. Settle one first.`;
    case "notLocked": return "Lock it first.";
    case "notSettled": return "There's no result to correct yet.";
    case "corrected": return "That result was already corrected once. It's final.";
    case "badAnswer": return "Pick a different answer.";
    case "noProposal": return "Nobody has called it yet.";
    case "already": return "Already done.";
    case "over": return "That Prediction is already settled.";
    case "otherStream": return "Results can only be corrected during the same stream.";
    default: return "That didn't work.";
  }
}

module.exports = { WYR_TIMES, WYR_DEFAULT_S, PRED_OPEN_MS, MAX_WAITING, VOTE_XP, LOCK_XP, WIN_XP, WYR_LEAD, SETTLE_ACTIONS, secondsOf, promptOf, tally, leaders, waitingAdd, waitingDrop, settleCheck, refusal };
