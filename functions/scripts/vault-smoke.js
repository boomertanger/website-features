#!/usr/bin/env node
// functions/scripts/vault-smoke.js
//
// One real IGDB search ("Granny") and one real Steam appdetails call (app 1205040), through
// the same clients the Game Vault functions use (lib/vault/sources.js). Writes nothing. It
// also warns when IGDB's response doesn't look the way docs/specs/game-vault.md expects
// (no game type, no status, no themes…), which is how a wrong guess about IGDB's field names
// shows up before the Vault depends on it.
//
// Needs Application Default Credentials that can read TWITCH_CLIENT_SECRET in Secret
// Manager (the same as run-growth-once.js):
//   gcloud auth application-default login
// TWITCH_CLIENT_ID comes from functions/.env. Secret values are never printed.
//
// Usage (from the repo root or functions/):
//   node functions/scripts/vault-smoke.js --project staging

const fs = require("fs");
const path = require("path");
const { GoogleAuth } = require("google-auth-library");
const { createSources, SourceError } = require("../lib/vault/sources");

function parseArgs(argv) {
  const args = { project: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--project") args.project = argv[++i];
    else if (argv[i].startsWith("--project=")) args.project = argv[i].slice("--project=".length);
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
  const res = await client.request({ url });
  return Buffer.from(res.data.payload.data, "base64").toString("utf8").trim();
}

const show = (label, value) => console.log(`  ${label.padEnd(16)} ${typeof value === "string" ? value : JSON.stringify(value)}`);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  console.log(`Project: ${projectId}\n`);
  const env = readEnv();
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const twitchClientSecret = await secret(auth, projectId, "TWITCH_CLIENT_SECRET");
  const sources = createSources({ twitchClientId: env.TWITCH_CLIENT_ID, twitchClientSecret });
  const warnings = [];

  console.log('IGDB search "Granny"');
  const hits = await sources.igdbSearch("Granny");
  console.log(`  ${hits.length} result(s): ${hits.map((h) => h.name).join(" | ")}`);
  const g = hits.find((h) => /granny/i.test(h.name));
  if (!g) warnings.push("IGDB search returned nothing named Granny");
  else {
    show("igdbId", g.igdbId);
    show("gameType", String(g.gameType));
    show("releaseStatus", g.releaseStatus);
    show("themes", g.themes);
    show("perspectives", g.perspectives);
    show("modes", g.modes);
    show("ageDescriptors", g.ageDescriptors);
    show("developers", g.developers);
    show("cover", g.coverImageId);
    show("steamAppId", String(g.steamAppId));
    show("altNames", g.altNames);
    if (!g.gameType) warnings.push("no game type (is `game_type` the right field?)");
    if (!g.themes.length) warnings.push("no themes");
    if (!g.coverImageId) warnings.push("no cover image id");
    const full = await sources.igdbGet(g.igdbId);
    show("timeToBeat", String(JSON.stringify(full?.timeToBeat)));
    const bySteam = await sources.igdbFindBySteam("1205040");
    show("steam -> igdb", bySteam ? `${bySteam.igdbId} ${bySteam.name}` : "not found");
    if (!bySteam) warnings.push("Steam app 1205040 didn't resolve to an IGDB game (external_games)");
  }

  console.log("\nSteam appdetails 1205040");
  const s = await sources.steamGet("1205040");
  if (!s) warnings.push("Steam returned nothing for app 1205040");
  else {
    show("name", s.name);
    show("type", s.type);
    show("descriptors", s.descriptorIds);
    show("developers", s.developers);
    show("coming soon", String(s.comingSoon));
    if (s.type !== "game") warnings.push(`Steam type is ${s.type}, expected game`);
  }
  show("portrait art", String(await sources.steamCoverExists("1205040")));

  console.log(warnings.length ? `\nWarnings:\n- ${warnings.join("\n- ")}` : "\nAll as the spec expects.");
  process.exit(warnings.length ? 2 : 0);
}

main().catch((err) => {
  if (err instanceof SourceError) console.error(`${err.kind}: ${err.message}`);
  else console.error(err.message || err);
  process.exit(1);
});
