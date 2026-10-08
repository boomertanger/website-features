#!/usr/bin/env node
// functions/scripts/youtube-cleanup.js
//
// Deletes the test YouTube events the staging site made (docs/specs/scream-planner.md section 15). STAGING ONLY:
// it refuses any other project. Lists the connected channel's broadcasts (upcoming, active and completed) and
// deletes ONLY those whose title starts with "[STAGING] ". Dry run by default: it prints what it would delete;
// --apply deletes. Events made by hand are never touched.
//
// Needs Application Default Credentials for Firestore (gcloud auth application-default login: the stored Google
// token is read from sites/boomertanger/private/youtubeChannel) and the OAuth client secret in the environment:
//   YOUTUBE_CLIENT_SECRET=... node functions/scripts/youtube-cleanup.js [--apply]
// The client ID comes from YOUTUBE_CLIENT_ID or functions/.env.
// --project  only "staging" (the default) is accepted
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const { makeAuth } = require("../lib/youtube/auth");
const { makeApi } = require("../lib/youtube/api");
const { STAGING_PROJECT, isStagingTitle } = require("../lib/youtube/logic");

const STATUSES = ["upcoming", "active", "completed"];

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
  } catch {
    return nameOrId;
  }
}

function clientIdFromEnvFile() {
  try {
    const m = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").match(/^YOUTUBE_CLIENT_ID=(.+)$/m);
    return m ? m[1].trim() : "";
  } catch { return ""; }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  if (projectId !== STAGING_PROJECT) throw new Error(`This helper only runs on staging (${STAGING_PROJECT}); got "${projectId}".`);
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientSecret) throw new Error("Set YOUTUBE_CLIENT_SECRET in the environment first (the same value as the Firebase secret; it is never stored in the repo).");
  const clientId = process.env.YOUTUBE_CLIENT_ID || clientIdFromEnvFile();
  if (!clientId) throw new Error("No YouTube client ID: set YOUTUBE_CLIENT_ID or add it to functions/.env.");

  admin.initializeApp({ projectId });
  const db = admin.firestore();
  console.log(`Project: ${projectId}${args.apply ? "" : " (dry run: nothing is deleted)"}`);
  const auth = makeAuth({ db, fetchFn: fetch, clientId, clientSecret });
  const st = await auth.status();
  if (!st.connected) throw new Error("YouTube is not connected on staging (Connect YouTube on /admin first).");
  const api = makeApi({ fetchFn: fetch, token: await auth.accessToken() });
  console.log(`Channel: ${st.channelTitle}`);

  const seen = new Map();
  for (const status of STATUSES) {
    for (const b of await api.list({ status })) if (!seen.has(b.id)) seen.set(b.id, { id: b.id, title: b.snippet?.title || "", start: b.snippet?.scheduledStartTime || "", status });
  }
  const mine = [...seen.values()].filter((b) => isStagingTitle(b.title));
  console.log(`\n${seen.size} broadcast(s) on the channel, ${mine.length} start with "[STAGING] ".`);
  for (const b of mine) console.log(`  ${b.id}  ${b.status.padEnd(9)} ${b.start.slice(0, 16)}  ${b.title}`);
  if (!mine.length) return;
  if (!args.apply) { console.log("\nDry run: nothing deleted. Add --apply to delete them."); return; }
  let deleted = 0, failed = 0;
  for (const b of mine) {
    try { await api.remove(b.id); deleted++; }
    catch (err) { failed++; console.error(`  could not delete ${b.id}: ${err.kind || ""} ${err.message}`); if (err.kind === "quotaExceeded") break; }
  }
  console.log(`\nDeleted ${deleted}${failed ? `, ${failed} failed` : ""}.`);
}

main().catch((err) => { console.error(err.message || err); process.exit(1); });
