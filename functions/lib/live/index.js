// Control Room, Cloud Functions (docs/specs/control-room.md §14). functions/index.js calls this factory with its adminLog helper
// and the youtube module's hooks, and spreads the result into its exports, the same way lib/planner and lib/youtube do.
//
//   controls.js   startStream, switchGame, stopStream, liveBeat, liveCheckInWindow, liveScene, liveAfterShow,
//                 liveChecklist, liveObsKey, liveDeckKey, liveSettings
// Pure rules are in logic.js (Part 2). `hooks` are for scripts/check-live-wiring.js (they are NOT exported as functions).
const { makeCore } = require("./core");

/** Builds everything. `deps` beyond adminLogEntry are for the checks (fake Google, clock, rng). */
function build({ adminLogEntry, youtube = null, now = Date.now, rng = Math.random } = {}) {
  const ctx = makeCore({ adminLogEntry, now });
  const controls = require("./controls")(ctx, { youtube, rng });
  const functions = { ...controls.functions };
  const hooks = { ctx, controls };
  return { functions, hooks };
}

module.exports = (deps) => build(deps).functions;
module.exports.build = build;
