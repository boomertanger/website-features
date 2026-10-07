// Scream Planner, Cloud Functions (docs/specs/scream-planner.md; data model in section 4, functions in section 7).
// Written ONLY here (Admin SDK); firestore.rules gives clients no writes. functions/index.js calls this factory with
// its adminLog helper and spreads the result into its exports, the same way lib/crew does.
//
//   plan.js    plannerSaveSettings, patternSave/Delete, exceptionSave/Delete, weekOpen, weekReopen, planSlot,
//              planGames, publishWeek, delayStream, cancelStream
//   crew.js    crewAvailability, dutySignUp, dutyDrop, dutyConfirm, dutyKeep, modGameRequest
//   ballot.js  ballotVote, ballotAddGame, ballotMine
//   tick.js    plannerTick (every 15 minutes)
const admin = require("firebase-admin");
const { makeCore } = require("./core");

/** Builds everything; `hooks` are for scripts/check-planner.js (they are NOT exported as functions). */
function build({ adminLogEntry } = {}) {
  const db = admin.firestore();
  const core = makeCore({ db, adminLogEntry });
  const gears = require("../crew/gears").makeGears({ db });
  const plan = require("./plan")({ core });
  const crewFns = require("./crew")({ core, gears });
  const ballot = require("./ballot")({ core });
  const tick = require("./tick")({ core, plan, crewFns, ballot });
  return { functions: { ...plan.functions, ...crewFns.functions, ...ballot.functions, plannerTick: tick.plannerTick }, hooks: { core, plan, crewFns, ballot, runTick: tick.runTick } };
}

module.exports = (deps) => build(deps).functions;
module.exports.build = build;
