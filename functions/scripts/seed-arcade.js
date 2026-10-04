#!/usr/bin/env node
// functions/scripts/seed-arcade.js
//
// Creates or updates the Boom Arcade registry docs (docs/specs/arcade-step1.md §4):
//   sites/boomertanger/games/tapTheSplat          title, slug, tagline, status, currentVersion, …
//   sites/boomertanger/games/tapTheSplat/versions/v1   builds, board epoch, run checks
// Only the fields below are written (merge), so the rolled-up stats, boards and runs
// are never touched. Runs locally with the Admin SDK, so it needs Application Default
// Credentials:
//   gcloud auth application-default login
//
// Usage (from the repo root or functions/):
//   node functions/scripts/seed-arcade.js --project staging           # dry run: show what would change
//   node functions/scripts/seed-arcade.js --project staging --apply   # write it
//
// --project takes an alias from .firebaserc (staging, production) or a raw project id.

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

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

// The values in arcade-step1.md §4. `news[].at` is a date string (YYYY-MM-DD) so
// re-running the script doesn't count as a change.
const GAMES = [{
  id: "tapTheSplat",
  doc: {
    title: "Tap the Splat",
    slug: "tap-the-splat",
    tagline: "A horror puzzle hidden in the footer of every page. Ten traps, one splat, your fastest clean run.",
    status: "live",
    currentVersion: "v1",
    // Mirrors versions/{currentVersion}.boardEpoch (rollupArcadeStats keeps it in sync),
    // so pages build board ids from the game doc alone.
    boardEpoch: 1,
    sortOrder: 1,
    playsIn: "footer",
    news: [
      { title: "Tap the Splat v1 is live", text: "Real leaderboards, Desktop and Mobile", at: "2026-10-01" },
      { title: "Weekly boards reset Mondays", text: "12 am Central · All-time boards stay", at: "2026-10-01" },
    ],
  },
  versions: [{
    id: "v1",
    doc: {
      label: "v1",
      status: "released",
      releasedAt: "2026-10-01",
      currentBuild: "1.0",
      acceptedBuilds: ["1.0"],
      boardEpoch: 1,
      boardNote: null,
      checks: { minSecs: { desktop: 26, mobile: 31 }, slackSecs: 3, maxRunMins: 30 },
      workshopOpen: false,
      keeperUid: null,
      plan: null,
      releaseNotes: "The first release: ten rounds, Desktop and Mobile boards, weekly and all-time.",
    },
  }],
}];

// Firestore hands maps back with their keys reordered, so compare with sorted keys.
const stable = (v) => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));

function diff(label, current, next) {
  const changed = Object.keys(next).filter((k) => stable(current[k] ?? null) !== stable(next[k]));
  console.log(`\n${label} (${Object.keys(current).length ? "exists" : "new"})`);
  if (!changed.length) console.log("  Nothing to change.");
  for (const k of changed) console.log(`  ${k}: ${JSON.stringify(current[k] ?? null)} -> ${JSON.stringify(next[k])}`);
  return changed.length > 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  console.log(`Project: ${projectId}`);

  const writes = [];
  for (const game of GAMES) {
    const gRef = db.doc(`sites/${SITE_ID}/games/${game.id}`);
    const gSnap = await gRef.get();
    if (diff(gRef.path, gSnap.exists ? gSnap.data() : {}, game.doc)) writes.push([gRef, game.doc]);
    for (const version of game.versions) {
      const vRef = gRef.collection("versions").doc(version.id);
      const vSnap = await vRef.get();
      if (diff(vRef.path, vSnap.exists ? vSnap.data() : {}, version.doc)) writes.push([vRef, version.doc]);
    }
  }

  if (!writes.length) {
    console.log("\nNothing to change.");
    return;
  }
  if (!args.apply) {
    console.log("\nDry run: nothing written. Add --apply to write it.");
    return;
  }
  const batch = db.batch();
  for (const [ref, doc] of writes) batch.set(ref, { ...doc, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();
  console.log(`\nWritten (${writes.length} document${writes.length === 1 ? "" : "s"}).`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
