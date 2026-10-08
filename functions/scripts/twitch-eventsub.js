#!/usr/bin/env node
// functions/scripts/twitch-eventsub.js
//
// Creates, lists and tidies the Twitch EventSub subscriptions the Control Room needs (docs/specs/control-room.md §10): stream.online
// and stream.offline for the broadcaster, delivered to the twitchEventSub function. STAGING ONLY: it refuses any other project.
// DRY RUN by default: it prints what it would create and delete and changes nothing; --apply does it.
//
//   node functions/scripts/twitch-eventsub.js            # dry run: lists what exists, says what it would create / delete
//   node functions/scripts/twitch-eventsub.js --apply    # creates the missing subscriptions, deletes the stale ones
//
// ORDER (the owner does the first two steps himself; Twitch calls the function back to verify, so it must be live first):
//   1. firebase functions:secrets:set TWITCH_EVENTSUB_SECRET --project staging       (a long random string; never paste it in chat)
//   2. firebase deploy --project staging --only functions:twitchEventSub              (the lead deploys)
//   3. node functions/scripts/twitch-eventsub.js --apply
//
// Needs Application Default Credentials (gcloud auth application-default login). With them it reads, for the chosen project, the
// latest versions of TWITCH_CLIENT_SECRET (the existing Twitch app) and TWITCH_EVENTSUB_SECRET from Secret Manager (your account
// needs Secret Manager Secret Accessor), exactly as youtube-cleanup.js reads YOUTUBE_CLIENT_SECRET. No secret is ever printed or put
// in the environment. The broadcaster id comes from sites/boomertanger/private/growthConfig (twitchBroadcasterId, looked up and kept
// by the growth collector); if it is missing the script looks it up from TWITCH_LOGIN. The client ID is TWITCH_CLIENT_ID (env or
// functions/.env).
//
// Subscriptions are created with the APP token (webhook transport needs no user token). The callback is fixed:
//   https://us-central1-boomertanger-staging.cloudfunctions.net/twitchEventSub
// Only subscriptions that point at that callback are ever touched. A subscription is "stale" when it points at the callback but is not
// enabled and not waiting for verification (webhook_callback_verification_failed, authorization_revoked, notification_failures_exceeded...),
// or a duplicate of one that is already enabled.
const fs = require("fs");
const path = require("path");

const STAGING_PROJECT = "boomertanger-staging";
const CALLBACK = `https://us-central1-${STAGING_PROJECT}.cloudfunctions.net/twitchEventSub`;
const TYPES = ["stream.online", "stream.offline"];
const HELIX = "https://api.twitch.tv/helix";
const SITE_ID = "boomertanger";
const PENDING = ["webhook_callback_verification_pending"];

function parseArgs(argv) {
  const args = { apply: false, project: "staging" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") args.apply = true;
    else if (a === "--project") args.project = argv[++i];
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function resolveProjectId(nameOrId) {
  try {
    const rc = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", ".firebaserc"), "utf8"));
    return rc.projects?.[nameOrId] ?? nameOrId;
  } catch { return nameOrId; }
}

function envFileValue(name) {
  try {
    const m = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").match(new RegExp(`^${name}=(.+)$`, "m"));
    return m ? m[1].trim() : "";
  } catch { return ""; }
}

/**
 * What to do, from the subscriptions Twitch lists. Pure.
 *   existing      the items of GET eventsub/subscriptions
 *   -> { create: [type], remove: [{ id, type, status, why }], keep: [{ id, type, status }] }
 * Only entries whose transport.callback is `callback` and whose condition names `broadcasterId` are considered.
 */
function planSubscriptions(existing, { callback = CALLBACK, broadcasterId, types = TYPES } = {}) {
  const ours = (existing || []).filter((s) => s && s.transport && s.transport.callback === callback && String(s.condition && s.condition.broadcaster_user_id) === String(broadcasterId));
  const create = [], remove = [], keep = [];
  for (const type of types) {
    const mine = ours.filter((s) => s.type === type);
    const live = mine.filter((s) => s.status === "enabled");
    const pending = mine.filter((s) => PENDING.includes(s.status));
    const stale = mine.filter((s) => s.status !== "enabled" && !PENDING.includes(s.status));
    for (const s of stale) remove.push({ id: s.id, type, status: s.status, why: "stale" });
    if (live.length) {
      keep.push({ id: live[0].id, type, status: live[0].status });
      for (const s of live.slice(1)) remove.push({ id: s.id, type, status: s.status, why: "duplicate" });
    } else if (pending.length) keep.push({ id: pending[0].id, type, status: pending[0].status });
    else create.push(type);
  }
  return { create, remove, keep };
}

/**
 * The whole run, with everything injectable for the check: { apply, projectId, fetchFn, readSecret(name), clientId, broadcasterId (or
 * a function returning it, may be null), login, log }. Never logs a secret or a token.
 */
async function run({ apply = false, projectId, fetchFn = fetch, readSecret, clientId, getBroadcasterId, login = "boomertanger", log = console.log }) {
  if (projectId !== STAGING_PROJECT) throw new Error(`This script only runs on staging (${STAGING_PROJECT}); got "${projectId}".`);
  if (!clientId) throw new Error("No Twitch client ID: set TWITCH_CLIENT_ID or add it to functions/.env.");
  log(`Project: ${projectId}${apply ? "" : " (dry run: nothing is created or deleted; add --apply to do it)"}`);
  log(`Callback: ${CALLBACK}`);
  const clientSecret = await readSecret("TWITCH_CLIENT_SECRET");
  const tokRes = await fetchFn("https://id.twitch.tv/oauth2/token", { method: "POST", body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }) });
  if (!tokRes.ok) throw new Error(`Twitch refused the app token request (HTTP ${tokRes.status}). Check TWITCH_CLIENT_ID and the TWITCH_CLIENT_SECRET secret.`);
  const token = (await tokRes.json()).access_token;
  const headers = { Authorization: `Bearer ${token}`, "Client-Id": clientId };
  const call = async (method, urlPath, body) => {
    const res = await fetchFn(`${HELIX}/${urlPath}`, { method, headers: { ...headers, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    if (!res.ok) throw new Error(`Twitch ${method} ${urlPath.split("?")[0]} failed (HTTP ${res.status}${data && data.message ? `: ${String(data.message).slice(0, 120)}` : ""}).`);
    return data;
  };

  let broadcasterId = typeof getBroadcasterId === "function" ? await getBroadcasterId() : getBroadcasterId;
  if (!broadcasterId) {
    const u = await call("GET", `users?login=${encodeURIComponent(login)}`);
    broadcasterId = u && u.data && u.data[0] && u.data[0].id;
    if (!broadcasterId) throw new Error(`No broadcaster id: growthConfig has none and Twitch has no user "${login}".`);
    log(`Broadcaster id looked up from "${login}" (not saved by this script).`);
  }
  log(`Broadcaster: ${broadcasterId}`);

  const existing = []; let cursor = "";
  for (let i = 0; i < 20; i++) {
    const page = await call("GET", `eventsub/subscriptions${cursor ? `?after=${encodeURIComponent(cursor)}` : ""}`);
    existing.push(...((page && page.data) || []));
    cursor = page && page.pagination && page.pagination.cursor;
    if (!cursor) break;
  }
  const mine = existing.filter((s) => s.transport && s.transport.callback === CALLBACK);
  log(`Subscriptions pointing at the callback: ${mine.length}`);
  for (const s of mine) log(`  ${s.type}  ${s.status}  ${s.id}`);
  const plan = planSubscriptions(existing, { broadcasterId });
  for (const k of plan.keep) log(`Keep: ${k.type} (${k.status})`);
  for (const t of plan.create) log(`${apply ? "Creating" : "Would create"}: ${t}`);
  for (const r of plan.remove) log(`${apply ? "Deleting" : "Would delete"}: ${r.type} ${r.id} (${r.why}, ${r.status})`);
  if (!plan.create.length && !plan.remove.length) { log("Nothing to do."); return { plan, applied: false }; }
  if (!apply) { log("Dry run: nothing changed."); return { plan, applied: false }; }

  const results = { created: [], deleted: [] };
  for (const r of plan.remove) { await call("DELETE", `eventsub/subscriptions?id=${encodeURIComponent(r.id)}`); results.deleted.push(r.id); }
  if (plan.create.length) {
    const secret = await readSecret("TWITCH_EVENTSUB_SECRET");        // read only when something is created; never printed
    for (const type of plan.create) {
      await call("POST", "eventsub/subscriptions", { type, version: "1", condition: { broadcaster_user_id: String(broadcasterId) }, transport: { method: "webhook", callback: CALLBACK, secret } });
      results.created.push(type);
      log(`Created: ${type} (Twitch now calls the function to verify it; the status becomes enabled within a few seconds)`);
    }
  }
  log("Done. Run again without --apply to check the statuses.");
  return { plan, applied: true, results };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  if (projectId !== STAGING_PROJECT) throw new Error(`This script only runs on staging (${STAGING_PROJECT}); got "${projectId}".`);
  const { readSecret } = require("./youtube-cleanup");
  const admin = require("firebase-admin");
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  await run({
    apply: args.apply, projectId, fetchFn: fetch, clientId: process.env.TWITCH_CLIENT_ID || envFileValue("TWITCH_CLIENT_ID"),
    login: process.env.TWITCH_LOGIN || envFileValue("TWITCH_LOGIN") || "boomertanger",
    readSecret: (name) => readSecret({ projectId, name }),
    getBroadcasterId: async () => ((await db.doc(`sites/${SITE_ID}/private/growthConfig`).get()).data() || {}).twitchBroadcasterId || null,
  });
}

module.exports = { planSubscriptions, run, parseArgs, CALLBACK, TYPES, STAGING_PROJECT };
if (require.main === module) main().catch((err) => { console.error(err.message || err); process.exit(1); });
