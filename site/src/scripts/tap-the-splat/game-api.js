// Tap the Splat data: stubs until there are accounts and Cloud Functions.
// TODO: milestone 2 (accounts + Cloud Functions, docs/specs/tap-the-splat.md "Data"):
//   runs via startRun / finishRun callables (server timing checks, members only,
//   one best time per member per device), per-device board summary docs written
//   only by functions, and two feedback counters with one vote per member/browser.
// Until then: non-production builds get the prototype's sample rows, labelled
// PREVIEW DATA; production gets nothing (the leaderboard button isn't rendered
// there and votes are visual only).
import { isProduction } from "../../lib/env.js";

const PREVIEW_BOARDS = {
  desktop: [["CryptRat", 41.31], ["Hexxy", 44.82], ["Vexa", 47.25], ["Dredd", 49.90], ["RavenByte", 52.64], ["GhoulKid", 55.13], ["Mortis", 58.47], ["NoLights", 63.72], ["Wisp", 71.08], ["Banshee", 79.55]],
  mobile: [["Vexa", 52.10], ["Wisp", 57.44], ["GhoulKid", 61.03], ["Banshee", 64.90], ["Hexxy", 68.21], ["Mortis", 73.66], ["NoLights", 77.02], ["Dredd", 81.35], ["CryptRat", 85.70], ["RavenByte", 92.18]],
};
const PREVIEW_VOTES = { liked: 128, wantMore: 94 };

/** Top 10 for "desktop" or "mobile": { preview, rows: [{ name, secs }] }, or null (none yet). */
export async function getBoard(device) {
  // TODO: milestone 2: read sites/{siteId}/games/tapTheSplat/boards/{device}.
  if (isProduction) return null;
  return { preview: true, rows: (PREVIEW_BOARDS[device] || []).map(([name, secs]) => ({ name, secs })) };
}

/** A finished run: { device, secs, penalties, completed, reached }. Not stored yet. */
export async function submitRun(run) {
  // TODO: milestone 2: startRun at the first tap, finishRun here (members only).
  void run;
  return { stored: false };
}

/** Feedback: kind is "liked" or "wantMore". Not stored yet (visual only). */
export async function vote(kind) {
  // TODO: milestone 2: one vote per member or browser, running totals.
  void kind;
  return { stored: false };
}

/** Feedback totals: { preview, liked, wantMore }, or null (none yet). */
export async function getVotes() {
  // TODO: milestone 2: read the two counters.
  if (isProduction) return null;
  return { preview: true, ...PREVIEW_VOTES };
}
