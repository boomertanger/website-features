#!/usr/bin/env node
// functions/scripts/club-eventsub.js
//
// Creates, lists and tidies the Twitch EventSub subscriptions Club Pass needs (docs/specs/club-pass.md §12): channel.subscribe,
// channel.subscription.message and channel.subscription.end for the broadcaster, delivered to the same twitchEventSub function as the
// Control Room's stream.online / stream.offline. STAGING ONLY. DRY RUN by default; --apply does it. It is twitch-eventsub.js with the
// Club Pass types (same app token, same callback, same TWITCH_EVENTSUB_SECRET); it only ever touches these three types.
//
//   node functions/scripts/club-eventsub.js            # dry run: what exists, what it would create / delete
//   node functions/scripts/club-eventsub.js --apply    # creates the missing ones, deletes the stale ones
//
// ORDER: 1. the twitchEventSub function is deployed with the Club Pass types; 2. the owner connects the broadcaster on /admin
// (Twitch only allows these subscriptions once the broadcaster has granted channel:read:subscriptions to this app); 3. --apply.
// The script refuses to run until step 2 is done. Needs Application Default Credentials (gcloud auth application-default login) and
// Secret Manager Secret Accessor (it reads TWITCH_CLIENT_SECRET and TWITCH_EVENTSUB_SECRET; nothing is printed).
const fs = require("fs");
const path = require("path");
const { run, parseArgs, STAGING_PROJECT } = require("./twitch-eventsub");

const SITE_ID = "boomertanger";
const CLUB_TYPES = ["channel.subscribe", "channel.subscription.message", "channel.subscription.end"];

function resolveProjectId(nameOrId) {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", ".firebaserc"), "utf8")).projects?.[nameOrId] ?? nameOrId; } catch { return nameOrId; }
}
function envFileValue(name) {
  try { const m = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").match(new RegExp(`^${name}=(.+)$`, "m")); return m ? m[1].trim() : ""; } catch { return ""; }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  if (projectId !== STAGING_PROJECT) throw new Error(`This script only runs on staging (${STAGING_PROJECT}); got "${projectId}".`);
  const { readSecret } = require("./youtube-cleanup");
  const admin = require("firebase-admin");
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const tok = await db.doc(`sites/${SITE_ID}/private/twitchBroadcaster`).get();
  if (!tok.exists || !(tok.get("scope") || []).includes("channel:read:subscriptions")) {
    throw new Error("The broadcaster's Twitch isn't connected yet (or lacks channel:read:subscriptions). Connect it on /admin first.");
  }
  await run({
    apply: args.apply, projectId, fetchFn: fetch, clientId: process.env.TWITCH_CLIENT_ID || envFileValue("TWITCH_CLIENT_ID"),
    login: process.env.TWITCH_LOGIN || envFileValue("TWITCH_LOGIN") || "boomertanger",
    readSecret: (name) => readSecret({ projectId, name }),
    getBroadcasterId: async () => String(tok.get("twitchUserId") || "") || ((await db.doc(`sites/${SITE_ID}/private/growthConfig`).get()).data() || {}).twitchBroadcasterId || null,
    types: CLUB_TYPES,
  });
}

module.exports = { CLUB_TYPES };
if (require.main === module) main().catch((err) => { console.error(err.message || err); process.exit(1); });
