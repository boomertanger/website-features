#!/usr/bin/env node
// functions/scripts/run-growth-once.js
//
// Runs the growth collector once from your machine (docs/specs/growth-collector.md),
// with the same code as the scheduled function. Dry run by default: it fetches the
// counts and prints what it would write, and writes nothing (not even the Twitch
// broadcaster id or a refreshed TikTok token). --apply writes the day's growthDaily doc
// and public/socials.
//
// Needs Application Default Credentials that can read the project's secrets
// (TWITCH_CLIENT_SECRET, YOUTUBE_API_KEY, TIKTOK_CLIENT_SECRET) in Secret Manager:
//   gcloud auth application-default login
// Public params come from functions/.env. Secret values are never printed.
//
// Usage (from the repo root or functions/):
//   node functions/scripts/run-growth-once.js --project staging            # dry run
//   node functions/scripts/run-growth-once.js --project staging --apply    # write it
// Note: the TikTok refresh token rotates on use, so a dry run skips TikTok (a dry
// refresh would throw the new token away). --apply includes it when connected.

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const { GoogleAuth } = require("google-auth-library");
const { collect } = require("../lib/growth/collect");

const SITE_ID = "boomertanger";

function parseArgs(argv) {
  const args = { project: null, apply: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--project") args.project = argv[++i];
    else if (argv[i].startsWith("--project=")) args.project = argv[i].slice("--project=".length);
    else if (argv[i] === "--apply") args.apply = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!args.project) throw new Error("--project is required (e.g. --project staging).");
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

function readEnv() {
  const out = {};
  const file = path.join(__dirname, "..", ".env");
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

async function secret(auth, projectId, name) {
  const client = await auth.getClient();
  const url = `https://secretmanager.googleapis.com/v1/projects/${projectId}/secrets/${name}/versions/latest:access`;
  try {
    const res = await client.request({ url });
    return Buffer.from(res.data.payload.data, "base64").toString("utf8").trim();
  } catch (err) {
    const status = err?.response?.status;
    console.warn(`  ${name}: couldn't read it (${status === 404 ? "not set" : status || err.message})`);
    return "";
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  console.log(`Project: ${projectId}${args.apply ? "" : " (dry run)"}`);

  const env = readEnv();
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const [twitchSecret, youtubeKey, tiktokSecret] = await Promise.all(["TWITCH_CLIENT_SECRET", "YOUTUBE_API_KEY", "TIKTOK_CLIENT_SECRET"].map((n) => secret(auth, projectId, n)));
  const cfg = {
    twitchClientId: env.TWITCH_CLIENT_ID, twitchClientSecret: twitchSecret, twitchLogin: env.TWITCH_LOGIN,
    youtubeApiKey: youtubeKey, youtubeChannelId: env.YOUTUBE_CHANNEL_ID,
    tiktokClientKey: env.TIKTOK_CLIENT_KEY,
    // A dry run never refreshes TikTok (see the note at the top).
    tiktokClientSecret: args.apply && tiktokSecret.length >= 16 ? tiktokSecret : "",
  };

  const out = await collect({ db, siteId: SITE_ID, cfg, dryRun: !args.apply, Timestamp: admin.firestore.Timestamp });
  const plain = (v) => JSON.parse(JSON.stringify(v, (k, x) => (x && typeof x.toDate === "function" ? x.toDate().toISOString() : x)));
  console.log(`\nsites/${SITE_ID}/growthDaily/${out.day}`);
  console.log(JSON.stringify(plain(out.daily), null, 2));
  console.log(`\nsites/${SITE_ID}/public/socials`);
  console.log(JSON.stringify(plain(out.summary), null, 2));
  console.log(`\nTikTok: ${out.tiktok}`);
  console.log(args.apply ? "\nWritten." : "\nDry run: nothing written. Add --apply to write it.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
