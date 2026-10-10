// Control Room, Cloud Functions (docs/specs/control-room.md §14). functions/index.js calls this factory with its adminLog helper
// and the youtube module's hooks, and spreads the result into its exports, the same way lib/planner and lib/youtube do.
//
//   checkin.js    streamCheckIn, liveUnlock (and settle: the all-beats bonus and stream-present at the end)
//   eventsub.js   twitchEventSub (stream.online / stream.offline, signature checked)
//   feeds.js      onCheckInWritten, liveFlush, liveTick, obsFeed, liveDeck, liveViewerEntry, backstageWatch
//   duty (lib/crew/duty.js, Mod Machina phase 3): dutyClockIn, dutyPing, dutyStepAway, dutyBack, dutyTakeLead, dutyDecline, dutyReassign, captainSet, dutyConfirmNight, dutyAutoConfirm, crewLockLift;
//                 startStream, stopStream and the auto-end call its onStart / closeOut and liveTick calls its tick, through ctx.duty
//   rush.js       liveRecruitRush, onUserCreatedRush (Recruit Rush, Mod Machina phase 3 part 6)
//   chatGames (lib/chatGames, docs/specs/chat-games.md part 1): chatGameStart, chatGameSwap, chatGameEnd, chatGameControl, chatGameCue, chatGameDeadline;
//                 Stop's afterEnd calls its closeOut and liveTick its sweep, through ctx.chatGames
//   drops.js      dropOpen, dropAdjust, claimDrop, dropSweep (live drops, docs/specs/live-drops.md); Stop's afterEnd calls its stopClose
//                 through ctx.drops, publishLive copies private/control.drop to public/live.drop
//   controls.js   startStream, switchGame, stopStream, liveBeat, liveCheckInWindow, liveScene, liveAfterShow,
//                 liveChecklist, liveObsKey, liveDeckKey, liveSettings
// Pure rules are in logic.js (Part 2). `hooks` are for scripts/check-live-wiring.js (they are NOT exported as functions).
const { makeCore } = require("./core");

/** Builds everything. `deps` beyond adminLogEntry are for the checks (fake Google, clock, rng). */
function build({ adminLogEntry, youtube = null, now = Date.now, rng = Math.random, grant = null, factory = null, fetchFn = null, enqueue = null, sleep = undefined, twitchClientId = null, twitchClientSecret = null, twitchLogin = null, eventSubSecret = null, chatGamesEnqueue = null, dropRandomInt = undefined } = {}) {
  const ctx = makeCore({ adminLogEntry, now });
  const duty = require("../crew/duty")(ctx, { grant });
  ctx.duty = duty;                                                            // set before controls and feeds use it
  const controls = require("./controls")(ctx, { youtube, rng });
  const checkin = require("./checkin")(ctx, { grant, factory });          // sets ctx.settle, which Stop and the auto-end call
  const feeds = require("./feeds")(ctx, { controls, fetchFn, enqueue, sleep, twitchClientId, twitchClientSecret, twitchLogin, youtube });
  const eventsub = require("./eventsub")(ctx, { eventSubSecret });
  const flags = require("../crew/flags")(ctx);
  const rush = require("./rush")(ctx);
  const chatGames = require("../chatGames")(ctx, { enqueue: chatGamesEnqueue, grant, factory, hotSeatRng: rng });
  ctx.chatGames = chatGames;
  const drops = require("./drops")(ctx, { grant, randomInt: dropRandomInt });
  ctx.drops = drops;
  const functions = { ...controls.functions, ...checkin.functions, ...feeds.functions, ...eventsub.functions, ...duty.functions, ...flags.functions, ...rush.functions, ...chatGames.functions, ...drops.functions };
  const hooks = { ctx, controls, checkin, feeds, eventsub, duty, rush, chatGames, drops };
  return { functions, hooks };
}

module.exports = (deps) => build(deps).functions;
module.exports.build = build;
