#!/usr/bin/env node
// functions/scripts/find-orphans.js
//
// One-time cleanup for data left behind by deletes made before
// deleteBugReport / deleteFeatureRequest removed everything (see
// deleteItemCompletely in functions/index.js). Runs locally with the Admin
// SDK, so it needs Application Default Credentials:
//   gcloud auth application-default login
//
// Usage (from the functions/ folder):
//   node scripts/find-orphans.js --project staging            # dry run: list only
//   node scripts/find-orphans.js --project staging --delete   # remove orphans
//
// --project takes an alias from .firebaserc (staging, production) or a raw
// project id.
//
// Finds:
//   1. comment docs whose parent featureRequests/bugReports doc is missing
//   2. activityLog events whose linked item is missing
//   3. externalAssets whose linkedDoc is missing
// --delete removes ONLY 1 and 2. Orphaned externalAssets are reported, never
// deleted here: they still have a live Cloudinary file, so they must go
// through Cloud Stash's deleteExternalAsset (Cloudinary first, then Firestore).

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

// Mirrors ACTIVITY_LINKS in functions/index.js.
const ACTIVITY_LINKS = {
  featureRequests: { feature: "feature-lab", idField: "requestId" },
  bugReports: { feature: "bug-zapper", idField: "reportId" },
};
const ITEM_COLLECTIONS = Object.keys(ACTIVITY_LINKS);

function parseArgs(argv) {
  const args = { project: null, delete: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--project") args.project = argv[++i];
    else if (argv[i].startsWith("--project=")) args.project = argv[i].slice("--project=".length);
    else if (argv[i] === "--delete") args.delete = true;
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

// Existence check with a cache, so 50 comments on one deleted item cost one read.
function makeExists(db) {
  const cache = new Map();
  return async (collectionName, docId) => {
    const key = `${collectionName}/${docId}`;
    if (!cache.has(key)) {
      cache.set(key, db.collection(collectionName).doc(docId).get().then((s) => s.exists));
    }
    return cache.get(key);
  };
}

async function findOrphanComments(db, exists) {
  const orphans = [];
  const skipped = new Map(); // comments under collections this script doesn't own
  const snap = await db.collectionGroup("comments").get();
  for (const d of snap.docs) {
    const parent = d.ref.parent.parent;
    if (!parent) continue;
    const parentCollection = parent.parent.id;
    if (!ITEM_COLLECTIONS.includes(parentCollection) || parent.parent.parent) {
      skipped.set(parentCollection, (skipped.get(parentCollection) ?? 0) + 1);
      continue;
    }
    if (!(await exists(parentCollection, parent.id))) {
      orphans.push({ ref: d.ref, parent: parent.path, createdAt: d.get("createdAt") });
    }
  }
  return { orphans, scanned: snap.size, skipped };
}

async function findOrphanActivity(db, exists) {
  const orphans = [];
  const snap = await db.collection("activityLog").get();
  for (const d of snap.docs) {
    for (const [collectionName, { feature, idField }] of Object.entries(ACTIVITY_LINKS)) {
      const id = d.get(idField);
      if (d.get("feature") !== feature || typeof id !== "string" || !id) continue;
      if (!(await exists(collectionName, id))) {
        orphans.push({ ref: d.ref, item: `${collectionName}/${id}`, type: d.get("type"), summary: d.get("summary") });
      }
    }
  }
  return { orphans, scanned: snap.size };
}

async function findOrphanAssets(db, exists) {
  const orphans = [];
  const snap = await db.collection("externalAssets").get();
  for (const d of snap.docs) {
    const { collection: c, docId } = d.get("linkedDoc") || {};
    if (!c || !docId) continue;
    if (!(await exists(c, docId))) {
      orphans.push({ id: d.id, linked: `${c}/${docId}`, publicId: d.get("publicId"), sizeBytes: d.get("sizeBytes") });
    }
  }
  return { orphans, scanned: snap.size };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const exists = makeExists(db);

  console.log(`Project: ${projectId}  Mode: ${args.delete ? "DELETE" : "DRY RUN (nothing is changed)"}\n`);

  const comments = await findOrphanComments(db, exists);
  console.log(`1. Orphaned comments: ${comments.orphans.length} (scanned ${comments.scanned} comment docs)`);
  for (const o of comments.orphans) console.log(`   ${o.ref.path}   (parent ${o.parent} is missing)`);
  for (const [c, n] of comments.skipped) console.log(`   skipped ${n} comment doc(s) under "${c}" (not a collection this script owns)`);

  const activity = await findOrphanActivity(db, exists);
  console.log(`\n2. Orphaned activityLog events: ${activity.orphans.length} (scanned ${activity.scanned} events)`);
  for (const o of activity.orphans) console.log(`   activityLog/${o.ref.id}   ${o.type}   -> ${o.item} missing   "${o.summary ?? ""}"`);

  const assets = await findOrphanAssets(db, exists);
  console.log(`\n3. Orphaned externalAssets: ${assets.orphans.length} (scanned ${assets.scanned} assets) — report only`);
  for (const o of assets.orphans) {
    console.log(`   externalAssets/${o.id}   ${o.publicId}   ${o.sizeBytes ?? "?"} bytes   -> ${o.linked} missing`);
  }
  if (assets.orphans.length) {
    console.log("   Purge these from Cloud Stash (deleteExternalAsset), never directly here.");
  }

  if (!args.delete) {
    console.log("\nDry run complete. Re-run with --delete to remove the orphans in 1 and 2.");
    return;
  }

  const writer = db.bulkWriter();
  for (const o of [...comments.orphans, ...activity.orphans]) writer.delete(o.ref);
  await writer.close();
  console.log(`\nDeleted ${comments.orphans.length} comment doc(s) and ${activity.orphans.length} activityLog event(s).`);
}

main().catch((err) => {
  console.error(err.message || err);
  if (/default credentials|Could not load the default credentials/i.test(String(err.message))) {
    console.error("\nOne-time setup: gcloud auth application-default login");
  }
  process.exit(1);
});
