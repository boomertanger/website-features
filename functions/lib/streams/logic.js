// The stream object's pure logic (docs/specs/stream-object.md §2, §3, §5). No Firebase
// here, so scripts/check-streams.js tests every rule without credentials. Workstreams 4
// (Schedule Planner) and 5 (Control Room) call these instead of re-deriving them; the
// Vault's onStreamWritten trigger uses statsForGame / affectedGameIds.
//
// A stream is a plain object (times may be Firestore Timestamps, Dates or milliseconds).
// Functions that change a stream return a PATCH ({ ok: true, patch }) or a refusal
// ({ ok: false, reason }); they never mutate their input.
//
// The site's time zone is always passed in (sites/{siteId}.timezone), never assumed.

const { ms, weekKey, dayKey } = require("../arcade/logic");

const STATES = ["planned", "scheduled", "live", "ended", "cancelled"];
const PLATFORMS = ["twitch", "youtube", "tiktok"];
const SOURCE_KINDS = ["owner", "suggestion", "wishlist"];
const MAX_SEGMENTS = 30;
const MAX_PLANNED_GAMES = 20;
const AUTO_END_MS = 12 * 60 * 60 * 1000;
const TITLE_MAX = 120;
const DESCRIPTION_MAX = 2000;

// planned -> scheduled (publishWeek) | live (started without publishing) | cancelled;
// scheduled -> live (startStream) | cancelled; live -> ended (stopStream or the 12 h auto-end).
// Ended and cancelled are final: later corrections are admin edits, not transitions.
const TRANSITIONS = {
  planned: ["scheduled", "live", "cancelled"],
  scheduled: ["live", "cancelled"],
  live: ["ended"],
  ended: [],
  cancelled: [],
};

const canTransition = (from, to) => Array.isArray(TRANSITIONS[from]) && TRANSITIONS[from].includes(to);

// ---------- slug and week ----------
/** ISO week in the site's time zone, e.g. "2026-W41". */
function streamWeek(plannedStart, tz) {
  needTz(tz);
  return weekKey(plannedStart, tz);
}

/** "2026-10-05", then "2026-10-05-2" for a second stream that day. `taken` is the slugs already used. */
function streamSlug(plannedStart, tz, taken = []) {
  needTz(tz);
  const base = dayKey(plannedStart, tz);
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

function needTz(tz) {
  if (typeof tz !== "string" || !tz) throw new Error("streams/logic: a time zone is required (sites/{siteId}.timezone)");
}

// ---------- segments ----------
const toMs = (t) => ms(t);
const isOpen = (seg) => seg.endedAt == null;
const openSegmentIndex = (segments) => (segments || []).findIndex(isOpen);

/** Played game ids, in the order first played. Breaks carry no gameId. */
function gameIdsOf(segments) {
  const out = [];
  for (const s of segments || []) if (s.kind === "game" && s.gameId && !out.includes(s.gameId)) out.push(s.gameId);
  return out;
}

/** The segments with any open one closed at `at`. */
function closeOpen(segments, at) {
  return (segments || []).map((s) => (isOpen(s) ? { ...s, endedAt: at } : s));
}

/** Minutes per game: { gameId: minutes }. An open segment counts up to `endAt`. Rounded once per game. */
function minutesPerGame(segments, endAt) {
  const totalMs = {};
  for (const s of segments || []) {
    if (s.kind !== "game" || !s.gameId) continue;
    const start = toMs(s.startedAt);
    const end = s.endedAt == null ? toMs(endAt) : toMs(s.endedAt);
    if (end > start) totalMs[s.gameId] = (totalMs[s.gameId] || 0) + (end - start);
  }
  return Object.fromEntries(Object.entries(totalMs).map(([id, t]) => [id, Math.round(t / 60000)]));
}

/** Each planned game marked played (it has a game segment) or skipped. Only meaningful once a stream has ended. */
function computeOutcomes(plannedGames, segments) {
  const played = new Set(gameIdsOf(segments));
  return (plannedGames || []).map((g) => ({ ...g, outcome: played.has(g.gameId) ? "played" : "skipped" }));
}

// ---------- the live part of the life cycle ----------
function startStream(stream, at, firstGame = null) {
  if (!canTransition(stream.state, "live")) return { ok: false, reason: "badState" };
  const segments = firstGame ? [{ gameId: firstGame.gameId, kind: "game", title: firstGame.title, startedAt: at, endedAt: null }] : [];
  return { ok: true, patch: { state: "live", actualStart: at, segments, gameIds: gameIdsOf(segments) } };
}

/** Moves to another game (or a break): closes the open segment at `at` and opens the next. */
function switchSegment(stream, next, at) {
  if (stream.state !== "live") return { ok: false, reason: "notLive" };
  const segments = stream.segments || [];
  const openAt = openSegmentIndex(segments);
  const open = openAt >= 0 ? segments[openAt] : null;
  const isBreak = !next || next.kind === "break" || !next.gameId;
  if (open && ((isBreak && open.kind === "break") || (!isBreak && open.kind === "game" && open.gameId === next.gameId))) {
    return { ok: false, reason: "alreadyOn" };
  }
  if (segments.length >= MAX_SEGMENTS) return { ok: false, reason: "tooManySegments" };
  const seg = isBreak
    ? { gameId: null, kind: "break", title: "Break", startedAt: at, endedAt: null }
    : { gameId: next.gameId, kind: "game", title: next.title, startedAt: at, endedAt: null };
  const closed = closeOpen(segments, at);
  const all = [...closed, seg];
  return { ok: true, patch: { segments: all, gameIds: gameIdsOf(all) } };
}

/** Ends a live stream: closes the open segment, fixes the end time, marks planned games played or skipped. */
function stopStream(stream, at, { auto = false } = {}) {
  if (!canTransition(stream.state, "ended")) return { ok: false, reason: "badState" };
  const segments = closeOpen(stream.segments, at);
  return {
    ok: true,
    patch: {
      state: "ended",
      actualEnd: at,
      segments,
      gameIds: gameIdsOf(segments),
      plannedGames: computeOutcomes(stream.plannedGames, segments),
      ...(auto ? { autoEnded: true } : {}),
    },
  };
}

/** True when a live stream has run 12 hours or more. */
function needsAutoEnd(stream, now) {
  return stream.state === "live" && stream.actualStart != null && now - toMs(stream.actualStart) >= AUTO_END_MS;
}

/** The auto-end patch: ended exactly 12 hours after it started, flagged autoEnded. */
function autoEnd(stream) {
  const endAt = toMs(stream.actualStart) + AUTO_END_MS;
  return stopStream(stream, endAt, { auto: true });
}

// ---------- validation ----------
/** Problems with a stream's fields, as short strings; an empty list means it is valid. */
function validateStream(s) {
  const errs = [];
  if (!STATES.includes(s.state)) errs.push("state: unknown");
  if (s.title != null && (typeof s.title !== "string" || s.title.length > TITLE_MAX)) errs.push(`title: at most ${TITLE_MAX} characters`);
  if (s.description != null && (typeof s.description !== "string" || s.description.length > DESCRIPTION_MAX)) errs.push(`description: at most ${DESCRIPTION_MAX} characters`);
  if (s.platforms != null && (!Array.isArray(s.platforms) || s.platforms.some((p) => !PLATFORMS.includes(p)))) errs.push("platforms: twitch, youtube or tiktok");
  if (s.plannedStart != null && s.plannedEnd != null && toMs(s.plannedEnd) <= toMs(s.plannedStart)) errs.push("plannedEnd: must be after plannedStart");
  if (s.actualStart != null && s.actualEnd != null && toMs(s.actualEnd) < toMs(s.actualStart)) errs.push("actualEnd: before actualStart");
  if (s.plannedGames != null) {
    if (!Array.isArray(s.plannedGames) || s.plannedGames.length > MAX_PLANNED_GAMES) errs.push(`plannedGames: at most ${MAX_PLANNED_GAMES}`);
    else s.plannedGames.forEach((g, i) => {
      if (!g || typeof g.gameId !== "string" || !g.gameId) errs.push(`plannedGames[${i}]: gameId`);
      if (!g?.source || !SOURCE_KINDS.includes(g.source.kind)) errs.push(`plannedGames[${i}]: source.kind`);
      if (g && g.outcome != null && !["played", "skipped"].includes(g.outcome)) errs.push(`plannedGames[${i}]: outcome`);
    });
  }
  if (s.segments != null) {
    if (!Array.isArray(s.segments) || s.segments.length > MAX_SEGMENTS) errs.push(`segments: at most ${MAX_SEGMENTS}`);
    else s.segments.forEach((g, i) => {
      if (!g || !["game", "break"].includes(g.kind)) errs.push(`segments[${i}]: kind`);
      else if (g.kind === "game" && !g.gameId) errs.push(`segments[${i}]: a game segment needs a gameId`);
      if (g && g.endedAt != null && toMs(g.endedAt) < toMs(g.startedAt)) errs.push(`segments[${i}]: ends before it starts`);
    });
    if (Array.isArray(s.segments) && s.segments.filter(isOpen).length > 1) errs.push("segments: more than one open");
    if (s.state === "ended" && Array.isArray(s.segments) && s.segments.some(isOpen)) errs.push("segments: an ended stream has an open segment");
  }
  return errs;
}

// ---------- stats for the Vault ----------
/**
 * A game's stats from its ended streams (recomputed, never running totals):
 * { streamCount, minutes, firstStreamedAt, lastStreamedAt } (times in ms, or null).
 */
function statsForGame(gameId, endedStreams, nowMs = Date.now()) {
  let streamCount = 0, minutes = 0, first = null, last = null;
  for (const s of endedStreams || []) {
    if (s.state !== "ended") continue;
    const mine = (s.segments || []).filter((g) => g.kind === "game" && g.gameId === gameId);
    if (!mine.length) continue;
    streamCount++;
    minutes += minutesPerGame(mine, s.actualEnd ?? nowMs)[gameId] || 0;
    for (const g of mine) {
      const start = toMs(g.startedAt), end = g.endedAt == null ? toMs(s.actualEnd ?? nowMs) : toMs(g.endedAt);
      if (first == null || start < first) first = start;
      if (last == null || end > last) last = end;
    }
  }
  return { streamCount, minutes, firstStreamedAt: first, lastStreamedAt: last };
}

/** Which Vault games' stats a stream write can change: those of the stream before and after, if either was ended. */
function affectedGameIds(before, after) {
  const wasEnded = !!before && before.state === "ended";
  const isEnded = !!after && after.state === "ended";
  if (!wasEnded && !isEnded) return [];
  const key = (s) => JSON.stringify((s?.segments || []).map((g) => [g.kind, g.gameId, toMs(g.startedAt), g.endedAt == null ? null : toMs(g.endedAt)]));
  if (wasEnded === isEnded && key(before) === key(after) && toMs(before.actualEnd) === toMs(after.actualEnd)) return [];
  return [...new Set([...(wasEnded ? before.gameIds || gameIdsOf(before.segments) : []), ...(isEnded ? after.gameIds || gameIdsOf(after.segments) : [])])];
}

/** What a game shows: the recomputed stats plus the admin-entered history from before the site. */
function displayStats(stats, legacy) {
  const s = stats || {}, l = legacy || {};
  const last = [s.lastStreamedAt, l.lastStreamedAt].map((t) => (t == null ? null : toMs(t))).filter((t) => t != null);
  return {
    streamCount: (s.streamCount || 0) + (l.streamCount || 0),
    minutes: (s.minutes || 0) + (l.minutes || 0),
    lastStreamedAt: last.length ? Math.max(...last) : null,
  };
}

/** A wishlist game that has now been streamed moves to Playing; nothing else changes by itself. */
const wishlistToPlaying = (status, streamCount) => status === "wishlist" && streamCount > 0;

module.exports = {
  STATES, PLATFORMS, SOURCE_KINDS, TRANSITIONS, MAX_SEGMENTS, MAX_PLANNED_GAMES, AUTO_END_MS,
  canTransition, streamWeek, streamSlug, gameIdsOf, minutesPerGame, computeOutcomes,
  startStream, switchSegment, stopStream, needsAutoEnd, autoEnd, validateStream,
  statsForGame, affectedGameIds, displayStats, wishlistToPlaying,
};
