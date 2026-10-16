// functions/lib/club/hooks.js: one Twitch-subs counter (lib/club/twitch.js) wired to Firestore, Auth, the broadcaster token and the
// entitlement, for the functions outside lib/club that need it: lib/accounts (Twitch link, sign-in, unlink) and lib/live/eventsub.js.
// It loads nothing from lib/accounts (lib/accounts loads this), so the callers pass the Twitch app's client id and secret values.
//   const T = require("../club/hooks").twitchSubs({ clientId, clientSecret });
const admin = require("firebase-admin");
const { makeBroadcaster } = require("../twitchBroadcaster");
const { makeEntitlement } = require("./entitlement");
const { makeTwitchSubs } = require("./twitch");

function twitchSubs({ db = admin.firestore(), auth = admin.auth(), fetchFn = fetch, clientId = "", clientSecret = "", now = Date.now } = {}) {
  const broadcaster = makeBroadcaster({ db, fetchFn, clientId, clientSecret, now });
  const entitlement = makeEntitlement({ db, auth, now });
  return makeTwitchSubs({ db, fetchFn, clientId, broadcaster, entitlement, now });
}

module.exports = { twitchSubs };
