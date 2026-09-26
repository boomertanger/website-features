#!/usr/bin/env node
// functions/scripts/purge-old-feature-log-entries.js
//
// One-time cleanup after the Disk Stash → Cloud Stash rename: removes
// activityLog and adminLog entries written under the old feature keys
// ("disk-stash" / "diskStash"). New entries use "cloud-stash" / "cloudStash" going
// forward (see functions/index.js) — this does NOT rewrite old entries
// to the new key, it deletes them. That means the admin audit trail
// loses those specific historical rows permanently; there is no way to
// get them back once --delete runs. Runs locally with the Admin SDK:
//   gcloud auth application-default login
//
// Usage (from the functions/ folder):
//   node scripts/purge-old-feature-log-entries.js --project staging            # dry run: list only
//   node scripts/purge-old-feature-log-entries.js --project staging --delete   # actually remove
//
// --project takes an alias from .firebaserc (staging, production) or a raw
// project id. Run against staging first; re-run with --project production
// once you're satisfied.

const admin = require("firebase-admin");

const OLD_KEYS = {
  activityLog: "disk-stash",
  adminLog: "diskStash",
};

function parseArgs(argv) {
  const args = { project: null, delete: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--project") args.project = argv[++i];
    else if (argv[i].startsWith("--project=")) args.project = argv[i].slice("--project=".length);
    else if (argv[i] === "--delete") args.delete = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.project) {
    console.error("Usage: node scripts/purge-old-feature-log-entries.js --project <staging|production> [--delete]");
    process.exit(1);
  }

  // .firebaserc lives at the repo root and isn't a .json file, so read + parse it.
  const rc = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", "..", ".firebaserc"), "utf8"));
  const projectId = rc.projects?.[args.project] || args.project;
  admin.initializeApp({ projectId });
  const db = admin.firestore();

  let totalFound = 0;
  let totalDeleted = 0;

  for (const [collectionName, oldKey] of Object.entries(OLD_KEYS)) {
    const snap = await db.collection(collectionName).where("feature", "==", oldKey).get();
    totalFound += snap.size;
    console.log(`${collectionName}: ${snap.size} entries with feature "${oldKey}"`);

    if (!args.delete) {
      snap.docs.slice(0, 5).forEach((d) => console.log(`  - ${collectionName}/${d.id}`));
      if (snap.size > 5) console.log(`  ...and ${snap.size - 5} more`);
      continue;
    }

    const batchSize = 400; // stay under Firestore's 500-write batch limit
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = db.batch();
      docs.slice(i, i + batchSize).forEach((d) => batch.delete(d.ref));
      await batch.commit();
      totalDeleted += Math.min(batchSize, docs.length - i);
    }
  }

  if (!args.delete) {
    console.log(`\nDry run: ${totalFound} total entries would be deleted. Re-run with --delete to remove them.`);
  } else {
    console.log(`\nDeleted ${totalDeleted} entries.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
