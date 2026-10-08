#!/usr/bin/env node
// functions/scripts/youtube-cleanup.js
//
// Deletes the test YouTube events the staging site made (docs/specs/scream-planner.md section 15). STAGING ONLY:
// it refuses any other project. Lists the connected channel's broadcasts (upcoming, active and completed) and
// deletes ONLY those whose title starts with "[STAGING] ". Dry run by default: it prints what it would delete;
// --apply deletes. Events made by hand are never touched.
//
// Needs Application Default Credentials (gcloud auth application-default login). With them it reads the stored Google
// token from sites/boomertanger/private/youtubeChannel (Firestore) and the latest version of the YOUTUBE_CLIENT_SECRET
// secret from Secret Manager for the chosen project (your account needs Secret Manager Secret Accessor). The secret is
// never printed and never has to be put in the environment:
//   node functions/scripts/youtube-cleanup.js [--apply]
// The client ID comes from YOUTUBE_CLIENT_ID or functions/.env.
// --project  only "staging" (the default) is accepted
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const { makeAuth } = require("../lib/youtube/auth");
const { makeApi } = require("../lib/youtube/api");
const { STAGING_PROJECT, isStagingTitle } = require("../lib/youtube/logic");

const STATUSES = ["upcoming", "active", "completed"];
const SECRET_NAME = "YOUTUBE_CLIENT_SECRET";

/**
 * The latest version of a Secret Manager secret, read with Application Default Credentials (REST, so no extra
 * package). Never logs the value; errors say what failed, not what the secret was.
 * opts: { projectId, name, getAuth, fetchFn } (getAuth/fetchFn are injectable for the checks).
 */
async function readSecret({ projectId, name = SECRET_NAME, getAuth, fetchFn = fetch }) {
  const auth = getAuth ? await getAuth() : await new (require("google-auth-library").GoogleAuth)({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] }).getClient();
  const tokenResp = await auth.getAccessToken();
  const token = typeof tokenResp === "string" ? tokenResp : tokenResp?.token;
  if (!token) throw new Error("No Application Default Credentials: run  gcloud auth application-default login  first.");
  const url = `https://secretmanager.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/secrets/${encodeURIComponent(name)}/versions/latest:access`;
  const res = await fetchFn(url, { headers: { Authorization: `Bearer ${token}`, "x-goog-user-project": projectId } });
  if (res.status === 403) throw new Error(`Secret Manager refused access to ${name} in ${projectId}: your account needs the Secret Manager Secret Accessor role on that project.`);
  if (res.status === 404) throw new Error(`The secret ${name} has no version in ${projectId}: set it with  firebase functions:secrets:set ${name} --project staging.`);
  if (!res.ok) throw new Error(`Secret Manager returned ${res.status} reading ${name} in ${projectId}.`);
  const body = await res.json();
  const value = Buffer.from(body?.payload?.data || "", "base64").toString("utf8");
  if (!value) throw new Error(`The latest version of ${name} in ${projectId} is empty.`);
  return value;
}

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
  const clientId = process.env.YOUTUBE_CLIENT_ID || clientIdFromEnvFile();
  if (!clientId) throw new Error("No YouTube client ID: set YOUTUBE_CLIENT_ID or add it to functions/.env.");

  const clientSecret = await readSecret({ projectId });   // the latest version, straight from Secret Manager; never printed
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

module.exports = { readSecret };
if (require.main === module) main().catch((err) => { console.error(err.message || err); process.exit(1); });
