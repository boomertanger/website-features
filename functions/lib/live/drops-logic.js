// Live drops, pure decisions (docs/specs/live-drops.md §3, §4, §6). No Firestore, no clock: every function takes what it needs, so
// scripts/check-drops.js can run each rule. drops.js does the reads and writes.
//
//   dropIdOf(streamId, badgeId)            "<streamId>_<badgeId>": a second drop of the same badge in the same stream can't exist
//   isCaptain(duty, uid)                   captainNow.uid on the stream's private/duty (set only while that person is clocked in)
//   canOpen({ caller, duty, stream, badge, badgeId, existing, openPointer, rush, input, nowMs })      -> { ok, value } | refusal
//   canAdjust({ caller, duty, drop, action, nowMs })                                                 -> { ok, patch, kind } | refusal
//   canClaim({ drop, caller, existingClaim, count, nowMs })                                          -> { ok, kind, inGrace } | { ok, repeat } | refusal
//   sweepAction(drop, count, nowMs)        what dropSweep does to one drop: { action: "close", closedBy } | { action: "finish" } | { action: "none" }
//   pickWinners(entries, holders, n, randomInt)   draw winners from entries minus holders, crypto randomness (randomInt is injectable)
//   publicDropOf(pointer, nowMs)           private/control.drop -> public/live.drop (no uids; gone 60 s after close)
//   summaryOf({ name, mode, claims, winners })    the one "badge-drop" activity line (null for a draw with no entries)
// A refusal is { ok: false, reason, message }; drops.js turns it into an HttpsError with details.reason.
const crypto = require("crypto");

const MIN = 60 * 1000;
const D = Object.freeze({
  minMinutes: 1, maxMinutes: 120, drawMaxMinutes: 15, maxCap: 10000, maxExtensions: 20,
  windowMaxMs: 2 * 60 * MIN,        // maxClosesAt = openedAt + 2 h, for every mode (a streamEnd drop too)
  graceMs: 30 * 1000,               // the hidden grace after close: Claim still works
  publicKeepMs: 60 * 1000,          // public/live.drop stays 60 s after close
  pushMinutes: { plus1: 1, plus5: 5 },
});
const OPEN_STATES = ["open", "closing"];
const refuse = (reason, message) => ({ ok: false, reason, message });
const ms = (v) => (v == null ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : null);

const dropIdOf = (streamId, badgeId) => `${streamId}_${badgeId}`;
const isCaptain = (duty, uid) => !!uid && !!duty && !!duty.captainNow && duty.captainNow.uid === uid;

/** Who is acting: "owner" (always allowed), the live Captain ("captain" or "acting"), or null. */
function roleOf(caller, duty) {
  if (caller && caller.isOwner) return "owner";
  if (isCaptain(duty, caller && caller.uid)) return duty.captainNow.acting ? "acting" : "captain";
  return null;
}

/**
 * Opening a drop. input { minutes?, untilEnd?, cap?, source? }. existing = the drops/{dropId} doc or null; openPointer = the stream's
 * private/control.drop when it's open, closing or drawing; rush = private/control.recruitRush of the main stream (only for source "rush").
 * value: { mode, minutes, cap, winners, closesAt, maxClosesAt, as, source }.
 */
function canOpen({ caller, duty, stream, badge, badgeId, existing, openPointer, rush, input = {}, nowMs }) {
  const as = roleOf(caller, duty);
  if (!as) return refuse("notCaptain", "Only the owner or the live Captain can drop a badge.");
  if (!stream || stream.state !== "live") return refuse("notLive", "Drops open while you're live.");
  if (!badge || badge.status === "removed" || badge.status === "buried" || !badge.drop || typeof badge.drop !== "object") return refuse("noPreset", "That badge can't be dropped.");
  const by = badge.drop.by === "captain" ? "captain" : "owner";                     // missing means owner
  if (as !== "owner" && by !== "captain") return refuse("ownerOnly", "Only the owner can drop that badge.");
  if (existing) return refuse("dropped", "That badge was already dropped this stream.");
  if (openPointer && ["open", "closing", "drawing"].includes(openPointer.state)) return refuse("busy", "One drop at a time.");
  const source = input.source === "rush" ? "rush" : "manual";
  if (source === "rush") {
    if (!rush || rush.on !== true || rush.hitAt == null) return refuse("rushNotHit", "The Rush goal isn't hit yet.");
    if (rush.rewardBadgeId !== badgeId) return refuse("rushBadge", "That isn't the Rush reward badge.");
    if (rush.rushDropId) return refuse("rushDropped", "The Rush drop is already out.");
  }
  const preset = badge.drop;
  const draw = preset.mode === "draw";
  const cap = input.cap == null ? null : input.cap;
  if (cap != null && (!Number.isInteger(cap) || cap < 1 || cap > D.maxCap)) return refuse("cap", `The cap is 1 to ${D.maxCap}.`);
  const maxClosesAt = nowMs + D.windowMaxMs;
  if (draw) {
    if (cap != null) return refuse("cap", "A draw has no claim cap.");
    if (input.untilEnd === true) return refuse("untilEnd", "A draw can't run until the stream ends.");
    const minutes = input.minutes == null ? preset.minutes : input.minutes;
    if (!Number.isInteger(minutes) || minutes < D.minMinutes || minutes > D.drawMaxMinutes) return refuse("minutes", `A draw runs 1 to ${D.drawMaxMinutes} minutes.`);
    const winners = Number.isInteger(preset.winners) && preset.winners > 0 ? preset.winners : 1;
    return { ok: true, value: { mode: "draw", minutes, cap: null, winners, closesAt: nowMs + minutes * MIN, maxClosesAt, as, source } };
  }
  const untilEnd = input.untilEnd === true || (preset.mode === "streamEnd" && input.minutes == null);
  if (untilEnd) return { ok: true, value: { mode: "streamEnd", minutes: null, cap, winners: null, closesAt: null, maxClosesAt, as, source } };
  const minutes = input.minutes == null ? preset.minutes : input.minutes;
  if (!Number.isInteger(minutes) || minutes < D.minMinutes || minutes > D.maxMinutes) return refuse("minutes", `A drop runs 1 to ${D.maxMinutes} minutes.`);
  return { ok: true, value: { mode: "timed", minutes, cap, winners: null, closesAt: nowMs + minutes * MIN, maxClosesAt, as, source } };
}

/** +1 min, +5 min, Close now. The owner, or whoever is the live Captain now (not the one who opened it, if that changed). */
function canAdjust({ caller, duty, drop, action, nowMs }) {
  if (!roleOf(caller, duty)) return refuse("notCaptain", "Only the owner or the live Captain can change a drop.");
  if (!drop) return refuse("noDrop", "That drop isn't there.");
  if (drop.status !== "open") return refuse("closed", "That drop has closed.");
  if (action === "close") {
    return { ok: true, kind: "close", patch: { status: "closing", closedAt: nowMs, graceUntil: nowMs + D.graceMs, closedBy: "manual" } };
  }
  const add = D.pushMinutes[action];
  if (!add) return refuse("action", "Say plus1, plus5 or close.");
  if (drop.mode === "streamEnd") return refuse("untilEnd", "This drop runs until the stream ends.");
  const closesAt = ms(drop.closesAt), max = ms(drop.maxClosesAt);
  if (closesAt == null || closesAt <= nowMs) return refuse("closed", "That drop has closed.");
  const next = closesAt + add * MIN;
  if (max != null && next > max) return refuse("maxed", "A drop can't run past 2 hours.");
  if ((drop.extensions || []).length >= D.maxExtensions) return refuse("maxed", "That drop can't be extended again.");
  return { ok: true, kind: "extend", minutes: add, patch: { closesAt: next } };
}

/** When a drop stops taking claims, with the grace: open past closesAt (or 2 h) counts as closing from that moment. */
function graceEnd(drop) {
  if (drop.status === "closing") return ms(drop.graceUntil);
  if (drop.status !== "open") return null;
  const closesAt = ms(drop.closesAt), max = ms(drop.maxClosesAt);
  const end = closesAt != null ? closesAt : max;
  return end == null ? null : end + D.graceMs;
}

/**
 * A claim (or a draw entry). existingClaim = claims/{uid} or null: a repeat returns the first result, whatever the drop's state now.
 * caller { uid, handle } (handle null = signup unfinished). count = the claims so far (for the cap).
 */
function canClaim({ drop, caller, existingClaim, count = 0, nowMs }) {
  if (existingClaim) return { ok: true, repeat: true, result: existingClaim.result || null, kind: existingClaim.kind || null };
  if (!caller || !caller.uid) return refuse("signedOut", "Sign in to claim.");
  if (!caller.handle) return refuse("needsSignup", "Finish joining to claim.");
  if (!drop) return refuse("noDrop", "That drop isn't there.");
  if (drop.droppedBy && drop.droppedBy.uid === caller.uid) return refuse("ownDrop", "Your drop.");
  if (!OPEN_STATES.includes(drop.status)) return refuse("closed", "Drop closed.");
  const end = graceEnd(drop);
  if (end == null || nowMs > end) return refuse("closed", "Drop closed.");
  if (drop.cap != null && count >= drop.cap) return refuse("full", "All claimed.");
  const closesAt = drop.status === "closing" ? ms(drop.closedAt) : (ms(drop.closesAt) != null ? ms(drop.closesAt) : ms(drop.maxClosesAt));
  return { ok: true, kind: drop.mode === "draw" ? "entry" : "claim", inGrace: closesAt != null && nowMs > closesAt };
}

/** dropSweep, one drop. count = claims so far. "close" starts the grace; "finish" ends it (count, activity, draw). */
function sweepAction(drop, count, nowMs) {
  if (!drop) return { action: "none" };
  if (drop.status === "open") {
    if (drop.cap != null && count >= drop.cap) return { action: "close", closedBy: "cap" };
    const closesAt = ms(drop.closesAt), max = ms(drop.maxClosesAt);
    if (closesAt != null && nowMs >= closesAt) return { action: "close", closedBy: "timer", at: closesAt };
    if (max != null && nowMs >= max) return { action: "close", closedBy: "timer", at: max };
    return { action: "none" };
  }
  if (drop.status === "closing") {
    const g = ms(drop.graceUntil);
    return g != null && nowMs >= g ? { action: "finish" } : { action: "none" };
  }
  return { action: "none" };
}

/** Up to n winners from the entries (uids), never someone in holders (a Set of uids who already hold the badge). Uniform, crypto randomness. */
function pickWinners(entries, holders, n = 1, randomInt = crypto.randomInt) {
  const pool = [...new Set(entries || [])].filter((u) => !(holders && holders.has(u)));
  const out = [];
  for (let i = 0; i < Math.min(n, pool.length); i++) {
    const j = i + randomInt(pool.length - i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
    out.push(pool[i]);
  }
  return out;
}

const STATES = ["open", "closing", "drawing", "closed"];
/** public/live.drop from the private/control.drop pointer: only these fields, no uids; null 60 s after close (or for anything unknown). */
function publicDropOf(p, nowMs, claims = null) {
  if (!p || typeof p !== "object" || typeof p.id !== "string" || !p.id || typeof p.badgeId !== "string" || !STATES.includes(p.state)) return null;
  const closedAt = ms(p.closedAt);
  if (p.state === "closed" && closedAt != null && nowMs - closedAt > D.publicKeepMs) return null;
  const n = Number.isInteger(claims) ? claims : Number.isInteger(p.claims) ? p.claims : 0;
  return {
    id: p.id, badgeId: p.badgeId, name: typeof p.name === "string" ? p.name : "", art: typeof p.art === "string" ? p.art : null,
    rarity: Number.isInteger(p.rarity) ? p.rarity : 1, mode: ["timed", "streamEnd", "draw"].includes(p.mode) ? p.mode : "timed", state: p.state,
    closesAt: ms(p.closesAt), untilEnd: p.mode === "streamEnd", cap: Number.isInteger(p.cap) ? p.cap : null, claims: n,
    winners: Array.isArray(p.winners) ? p.winners.filter((h) => typeof h === "string" && h).slice(0, 10) : [],
    closedAt,
  };
}

/** The one activityLog line per drop, or null (a draw nobody entered). */
function summaryOf({ name, mode, claims = 0, winners = [] }) {
  if (mode === "draw") {
    const hs = (winners || []).filter(Boolean).map((h) => `@${h}`);
    if (!hs.length) return null;
    return hs.length === 1 ? `${hs[0]} is ${name}` : `${hs.slice(0, -1).join(", ")} and ${hs[hs.length - 1]} are ${name}`;
  }
  const n = Number.isInteger(claims) ? claims : 0;
  return n === 0 ? `Nobody caught ${name}` : `${n} ${n === 1 ? "member" : "members"} caught ${name}`;
}

module.exports = { D, OPEN_STATES, dropIdOf, isCaptain, roleOf, canOpen, canAdjust, graceEnd, canClaim, sweepAction, pickWinners, publicDropOf, summaryOf };
