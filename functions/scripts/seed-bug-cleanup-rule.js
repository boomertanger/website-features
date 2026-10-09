#!/usr/bin/env node
// functions/scripts/seed-bug-cleanup-rule.js
//
// Writes the Cloud Stash cleanup rule that purges a closed Bug Zapper report's screenshot 60 days after it closed (docs/specs/bug-zapper.md §2 decision 3):
// cleanupRules/bugZapperScreenshots { enabled, feature "bugZapper", collection sites/boomertanger/bugs/main/reports, matchField closed, matchValue true,
// ageField closedAt, ageThresholdDays 60 }. The daily scheduledAssetCleanup finds reports with closed == true and closedAt older than the threshold and purges their
// assets through performAssetDeletion (which clears the report's shotRef). It needs the reports index on closed + closedAt (firestore.indexes.json).
//
// STAGING ONLY: it accepts --project staging and nothing else. It writes (it is idempotent: run it again and nothing changes, and a rule an admin switched off in
// Cloud Stash stays off). --dry-run prints what it would write. Needs Application Default Credentials (gcloud auth application-default login).
//   node functions/scripts/seed-bug-cleanup-rule.js --project staging [--dry-run]
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const RULE_ID = "bugZapperScreenshots";
const RULE = {
  feature: "bugZapper",
  collection: "sites/boomertanger/bugs/main/reports",
  matchField: "closed",
  matchValue: true,
  ageField: "closedAt",
  ageThresholdDays: 60,
};

function parseArgs(argv) {
  const args = { project: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project") args.project = argv[++i];
    else if (a.startsWith("--project=")) args.project = a.slice("--project=".length);
    else if (a === "--dry-run") args.dryRun = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (args.project !== "staging") throw new Error("This script accepts --project staging only.");
  return args;
}
function resolveProjectId(name) {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", ".firebaserc"), "utf8")).projects?.[name] ?? name; } catch { return name; }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  if (/prod/i.test(projectId)) throw new Error(`Refusing ${projectId}: staging only.`);
  admin.initializeApp({ projectId });
  const ref = admin.firestore().doc(`cleanupRules/${RULE_ID}`);
  const snap = await ref.get();
  console.log(`Project: ${projectId}${args.dryRun ? " (dry run: nothing is written)" : ""}`);
  console.log(`Rule: cleanupRules/${RULE_ID}  ${snap.exists ? "(exists: its fields are refreshed, enabled stays as it is)" : "(new, enabled)"}`);
  for (const [k, v] of Object.entries(RULE)) console.log(`  ${k}: ${JSON.stringify(v)}`);
  if (args.dryRun) return;
  await ref.set(snap.exists ? RULE : { ...RULE, enabled: true, createdAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  console.log("Written.");
}

if (require.main === module) main().catch((err) => { console.error(String(err.message || err)); process.exit(1); });
module.exports = { RULE, RULE_ID, parseArgs };
