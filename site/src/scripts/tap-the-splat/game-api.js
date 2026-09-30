// Tap the Splat data (docs/specs/arcade-step1.md §4, §5): runs through the shared
// Arcade callables (startRun, finishRun, voteRun), boards and counts read from
// sites/{siteId}/games/tapTheSplat. Only the game bundle and the leaderboard
// popover import this, so idle pages never load it. Firestore Lite (lib/db.ts)
// comes with it; the Functions SDK (lib/call.ts) loads on the first run.
import { db, doc, getDoc, SITE_ID } from "../../lib/db";
import { reasonOf } from "../../lib/errors";

export const GAME_ID = "tapTheSplat";
/** This build of the game (versions/{v}.acceptedBuilds must list it). */
export const BUILD = "1.0";

const call = async (name, data) => (await import("../../lib/call")).call(name, data);
const gameRef = () => doc(db, "sites", SITE_ID, "games", GAME_ID);

// The game and current version docs change rarely: read once, keep for a minute.
let infoCache = null;
/** { game, version, v } for the current version, or null when unreadable. */
export async function getInfo({ fresh = false } = {}) {
  if (!fresh && infoCache && Date.now() - infoCache.at < 60000) return infoCache.value;
  const value = (async () => {
    const g = await getDoc(gameRef());
    if (!g.exists()) return null;
    const game = g.data(), v = game.currentVersion || "v1";
    const s = await getDoc(doc(db, "sites", SITE_ID, "games", GAME_ID, "versions", v));
    return { game, v, version: s.exists() ? s.data() : {} };
  })().catch((err) => { console.error("tts: couldn't read the game", err); infoCache = null; return null; });
  infoCache = { at: Date.now(), value };
  return value;
}

/** Rolled-up counts for the current version: { runs, finished, liked, wantMore }, or null (not rolled up yet). */
export async function getVotes() {
  const s = (await getInfo({ fresh: true }))?.game?.stats;
  return s && typeof s.runs === "number" ? s : null;
}

/**
 * The all-time (or weekly: period "2026-W40") board for "desktop" or "mobile":
 * { rows: [{ uid, name, handle, secs, penalties, date }] } (date: a Date), or null when unreadable.
 */
export async function getBoard(device, period = "all") {
  const info = await getInfo();
  if (!info) return null;
  const id = `e${info.version.boardEpoch || 1}_${device}_${period}`;
  try {
    const s = await getDoc(doc(db, "sites", SITE_ID, "games", GAME_ID, "versions", info.v, "boards", id));
    const rows = s.exists() ? s.get("rows") || [] : [];
    return { rows: rows.map((r) => ({ uid: r.uid, name: r.displayName || r.handle || "?", handle: r.handle, secs: r.secs, penalties: r.penalties, date: r.at?.toDate?.() ?? null })) };
  } catch (err) {
    console.error("tts: couldn't read the board", err);
    return null;
  }
}

/**
 * Starts a run at the first splat tap without blocking it (the clock starts
 * locally). Returns a handle for submitRun and vote; its `started` promise resolves
 * to { runId, runKey?, version } or { error: reason }.
 */
export function startRun(device) {
  const run = { device, voted: {}, finished: false };
  run.started = call("startRun", { gameId: GAME_ID, device, build: BUILD })
    .then((r) => ({ runId: r.runId, runKey: r.runKey ?? null, version: r.version || "v1" }))
    .catch((err) => { console.warn("tts: startRun failed", err); return { error: reasonOf(err) || "offline" }; });
  return run;
}

/**
 * Finishes a run: { result, secs, penalties, reached, splits }. Awaits a pending
 * start. Resolves to { recorded: true, version, counted, onBoard, personalBest,
 * rank: { all, week }, reason } or { recorded: false, refresh } (never throws).
 */
export async function submitRun(run, { result, secs, penalties, reached, splits }) {
  if (!run || run.finished) return { recorded: false, refresh: false };
  run.finished = true;
  const s = await run.started;
  if (!s.runId) return { recorded: false, refresh: s.error === "build" };
  try {
    const out = await call("finishRun", { runId: s.runId, ...(s.runKey ? { runKey: s.runKey } : {}), result, secs, penalties, reached, splits });
    run.recorded = result !== "tappedOut";
    return { recorded: true, version: s.version, ...out };
  } catch (err) {
    console.warn("tts: finishRun failed", err);
    return { recorded: false, refresh: reasonOf(err) === "build" };
  }
}

/** A vote on a recorded, ended run: kind "liked" or "wantMore", once per kind per run. */
export async function vote(run, kind) {
  if (!run?.recorded || run.voted[kind]) return { stored: false };
  run.voted[kind] = true;
  const s = await run.started;
  try {
    const r = await call("voteRun", { runId: s.runId, ...(s.runKey ? { runKey: s.runKey } : {}), kind });
    return { stored: !!r?.counted };
  } catch (err) {
    console.warn("tts: voteRun failed", err);
    return { stored: false };
  }
}
