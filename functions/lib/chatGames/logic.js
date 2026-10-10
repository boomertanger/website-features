// Chat Games, pure rules (docs/specs/chat-games.md §3, §9, §12, §13). No Firestore here: index.js reads, calls these, writes.
//
//   STATES / ACTIVE / FINAL           ready → open → locked → revealed → ended; void = ended without a result (no XP)
//   transition(run, to, { at })       { ok, patch } | { ok: false, reason }   (the state machine; index.js runs it inside a transaction)
//   HANDLERS / handlerFor(formatId)   the format-handler registry. Part 1 registers none: every format is refused "Not available yet"
//   pointerOf(run)                    { runId, formatId, state, round, title } for private/control.chatGame (copied to public/live.chatGame)
//   isCaptain(duty, uid)              captainNow.uid on the stream's duty doc (any grade); the owner is checked by the caller
//   roomsOf(duty, uid)                the rooms someone on duty holds (onDuty[uid].roles[].room), [] when away or not on duty
//   canCue(who, duty, cue)            the cue's room is one of mine, or I'm the Captain, or I'm the owner
//   validateStart(data) / validateCue(data) / validateControl(data)   argument checks
//   nightSummary(runs)                what streams/{id}.chatGames keeps for the Stream Library
//   dueSweep(runs, nowMs)             runs whose closesAt has passed (the liveTick backstop for the deadline tasks)
const STATES = ["ready", "open", "locked", "revealed", "ended", "void"];
const ACTIVE = ["ready", "open", "locked", "revealed"];   // a run in one of these holds the one-at-a-time slot (except a locked Prediction, §7, part 5)
const FINAL = ["ended", "void"];
// Allowed moves. A format may loop rounds by going revealed → open again (Next round / Next prompt).
const MOVES = {
  ready: ["open", "void", "ended"],
  open: ["locked", "revealed", "void", "ended"],   // "Reveal now" may skip the lock
  locked: ["revealed", "open", "void", "ended"],
  revealed: ["open", "ended", "void"],
  ended: [],
  void: [],
};
const ID_SAFE = /^[A-Za-z0-9_-]{1,100}$/;
const ROOMS = ["twitch", "ytLandscape", "ytVertical", "tiktok", "site"];
const CUE_ACTIONS = ["posted", "done"];
const CONTROL_ACTIONS = ["answered", "skip", "pinNext", "nextRound", "lock", "reveal", "pause", "resume", "skipCard", "picker", "saveToPack"];
const HOST_GEARS = 5;                 // "Hosted a Chat Game in your room", once per game per mod (§9, §11)
const MAX_TIMED_MS = 2 * 60 * 60 * 1000;
const FORMAT_IDS = ["questions", "hot-seat", "would-you-rather", "predictions"];

/**
 * The format-handler registry: formatId → { title, crewHosted, start(run, data) → { ok, patch, cues? }, control(run, action, data) → { ok, patch } }.
 * Formats register here as their part ships (Questions part 2, Hot Seat part 4, Would You Rather and Predictions part 5). Empty in part 1.
 */
const HANDLERS = {};
const handlerFor = (formatId) => (typeof formatId === "string" && Object.prototype.hasOwnProperty.call(HANDLERS, formatId) ? HANDLERS[formatId] : null);

function transition(run, to, { at = Date.now() } = {}) {
  if (!run || !STATES.includes(run.state)) return { ok: false, reason: "noRun" };
  if (!STATES.includes(to)) return { ok: false, reason: "badState" };
  if (run.state === to) return { ok: false, reason: "already" };
  if (FINAL.includes(run.state)) return { ok: false, reason: "over" };
  if (!MOVES[run.state].includes(to)) return { ok: false, reason: "badMove" };
  const patch = { state: to, updatedAt: at };
  if (to === "open") patch.openedAt = at;
  if (to === "locked") { patch.lockedAt = at; patch.closesAt = null; }
  if (to === "revealed") { patch.revealedAt = at; patch.closesAt = null; }
  if (FINAL.includes(to)) { patch.endedAt = at; patch.closesAt = null; }
  return { ok: true, patch };
}

const pointerOf = (run) => (run && ACTIVE.includes(run.state)
  ? { runId: String(run.id), formatId: String(run.formatId), state: run.state, round: Number.isInteger(run.round) ? run.round : 0, title: run.title == null ? null : String(run.title) }
  : null);

const isCaptain = (duty, uid) => !!uid && !!duty && !!duty.captainNow && duty.captainNow.uid === uid;
function roomsOf(duty, uid) {
  const e = duty && duty.onDuty && duty.onDuty[uid];
  if (!e || e.away) return [];
  return [...new Set((e.roles || []).map((r) => r && r.room).filter((r) => typeof r === "string" && r))];
}
/** who: { uid, isOwner }. */
function canCue(who, duty, cue) {
  if (!who || !cue) return false;
  if (who.isOwner || isCaptain(duty, who.uid)) return true;
  return roomsOf(duty, who.uid).includes(cue.room);
}

const bad = (field, message) => ({ ok: false, reason: "bad-input", field, message });
function validateStart(d) {
  const x = d || {};
  if (typeof x.formatId !== "string" || !ID_SAFE.test(x.formatId)) return bad("formatId", "Pick a game.");
  if (x.streamId != null && (typeof x.streamId !== "string" || !ID_SAFE.test(x.streamId))) return bad("streamId", "Which stream?");
  return { ok: true, value: { formatId: x.formatId, streamId: x.streamId || null, options: x.options && typeof x.options === "object" ? x.options : {} } };
}
function validateCue(d) {
  const x = d || {};
  if (typeof x.runId !== "string" || !ID_SAFE.test(x.runId)) return bad("runId", "Which game?");
  if (typeof x.cueId !== "string" || !ID_SAFE.test(x.cueId)) return bad("cueId", "Which cue?");
  if (!CUE_ACTIONS.includes(x.action)) return bad("action", "Posted or done?");
  return { ok: true, value: { runId: x.runId, cueId: x.cueId, action: x.action } };
}
function validateControl(d) {
  const x = d || {};
  if (typeof x.runId !== "string" || !ID_SAFE.test(x.runId)) return bad("runId", "Which game?");
  if (!CONTROL_ACTIONS.includes(x.action)) return bad("action", "Unknown control.");
  return { ok: true, value: { runId: x.runId, action: x.action, data: x.data && typeof x.data === "object" ? x.data : {} } };
}
/** A cue may move pending → posted → done (done straight from pending too). */
function cueMove(cue, action) {
  const st = (cue && cue.status) || "pending";
  if (action === "posted") return st === "pending" ? { ok: true } : { ok: false, reason: "already" };
  if (action === "done") return st === "done" ? { ok: false, reason: "already" } : { ok: true };
  return { ok: false, reason: "badAction" };
}

function nightSummary(runs) {
  const list = (runs || []).filter((r) => r && r.formatId).sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
  return {
    runs: list.map((r) => ({ runId: String(r.id), formatId: r.formatId, title: r.title == null ? null : String(r.title), state: r.state, rounds: Number.isInteger(r.round) ? r.round : 0, result: r.result == null ? null : r.result })),
    count: list.length,
    played: list.filter((r) => r.state === "ended" || r.state === "revealed").length,
    voided: list.filter((r) => r.state === "void").length,
  };
}
const dueSweep = (runs, nowMs) => (runs || []).filter((r) => r && ["open", "ready"].includes(r.state) && Number.isFinite(r.closesAtMs) && r.closesAtMs <= nowMs);

/** What a refusal says (§15: "Already done by @handle" when someone else got there first). */
function refusal(reason, { byHandle = null, title = null } = {}) {
  switch (reason) {
    case "busy": return `${title || "A game"} is running. End it first or use Swap.`;
    case "already": case "over": return byHandle ? `Already done by @${byHandle}.` : "Already done.";
    case "badMove": return byHandle ? `Already done by @${byHandle}.` : "That can't happen right now.";
    case "notAvailable": return "Not available yet.";
    case "disabled": return "That game isn't switched on yet.";
    case "notLive": return "Chat Games run while the stream is live.";
    case "notCaptain": return "Only the Captain or the owner can do that.";
    case "notYourRoom": return "That cue is for another room.";
    case "noRun": return "That game is over.";
    default: return "That didn't work.";
  }
}

module.exports = {
  STATES, ACTIVE, FINAL, MOVES, ROOMS, CUE_ACTIONS, CONTROL_ACTIONS, HOST_GEARS, MAX_TIMED_MS, FORMAT_IDS, ID_SAFE,
  HANDLERS, handlerFor, transition, pointerOf, isCaptain, roomsOf, canCue, validateStart, validateCue, validateControl, cueMove, nightSummary, dueSweep, refusal,
};
