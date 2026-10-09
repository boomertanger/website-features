#!/usr/bin/env node
// functions/scripts/seed-cloud-stash.js
//
// Starts Cloud Stash (docs/specs/cloud-stash.md §6, §7) on a project: it writes only what is MISSING and never changes anything that already exists, so it is safe to run again.
//   1. adminSettings/storage  the limits: pauseAtPct 80, manualPause false, manualPauseReason "", runCap 100. If the doc exists, only the fields it lacks are added.
//   2. cleanupRules/oldBugScreenshots  the rule "Old bug screenshots": Bug Zapper screenshots, closed as Fixed, Won't fix, Can't reproduce or Duplicate for 60 days.
//      It is created DISABLED: the owner or an Overseer switches it on in Cloud Stash after looking at its dry run. It is skipped when any rule with target "bugScreenshots"
//      already exists. The old enabled rule from seed-bug-cleanup-rule.js (cleanupRules/bugZapperScreenshots, no target) is left exactly as it is; it keeps sweeping until the
//      launch checklist retires it, and the Rules tab shows it read-only.
//
// STAGING ONLY: it accepts --project staging and nothing else. --dry-run prints what it would write and writes nothing. Needs Application Default Credentials
// (gcloud auth application-default login).
//   node functions/scripts/seed-cloud-stash.js --project staging [--dry-run]
const fs = require("fs");
const path = require("path");
const T = require("../lib/stash/targets");
const { DEFAULTS, settingsOf } = require("../lib/stash/logic");

const RULE_ID = "oldBugScreenshots";
const RULE_INPUT = { name: "Old bug screenshots", target: "bugScreenshots", statuses: T.BUG_SCREENSHOTS.statuses.slice(), days: 60 };

/** The settings fields to add: the defaults for every field the stored doc lacks (valid stored values are left alone). */
function settingsToAdd(stored) {
  const have = stored && typeof stored === "object" ? stored : {};
  const out = {};
  for (const k of Object.keys(DEFAULTS)) if (have[k] === undefined) out[k] = DEFAULTS[k];
  return out;
}

/** The rule doc to create (the same shape stashRuleSave writes), or null when a rule for this target is already there. */
function ruleToAdd(existingRules) {
  if ((existingRules || []).some((r) => r && r.target === T.BUG_SCREENSHOTS.key)) return null;
  const v = T.validateRule(RULE_INPUT);
  if (!v.ok) throw new Error(`The built-in rule is invalid: ${v.message}`);
  const t = T.targetOf(v.value.target);
  return { name: v.value.name, target: v.value.target, statuses: v.value.statuses, days: v.value.days, feature: t.feature, collection: t.collection, matchField: t.matchField, matchValue: t.matchValue, ageField: t.ageField, ageThresholdDays: v.value.days, enabled: false };
}

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
  const admin = require("firebase-admin");
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  console.log(`Project: ${projectId}${args.dryRun ? " (dry run: nothing is written)" : ""}`);

  const settingsRef = db.doc("adminSettings/storage");
  const stored = (await settingsRef.get()).data();
  const add = settingsToAdd(stored);
  if (Object.keys(add).length) {
    console.log(`adminSettings/storage: ${stored ? "exists, adding the missing fields" : "new"}: ${JSON.stringify(add)}`);
    if (!args.dryRun) await settingsRef.set(add, { merge: true });
  } else console.log("adminSettings/storage: nothing to add");
  console.log(`  limits now: ${JSON.stringify(settingsOf({ ...(stored || {}), ...add }))}`);

  const rules = (await db.collection("cleanupRules").get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const rule = ruleToAdd(rules);
  if (rule) {
    console.log(`cleanupRules/${RULE_ID}: new, DISABLED: ${T.sentence(rule)}`);
    if (!args.dryRun) await db.doc(`cleanupRules/${RULE_ID}`).create({ ...rule, createdBy: "seed", createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: "seed", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  } else console.log("cleanupRules: a rule for Bug Zapper screenshots already exists, so none is added");
  const legacy = rules.filter((r) => T.isLegacyShaped(r));
  if (legacy.length) console.log(`Old-page rules left as they are: ${legacy.map((r) => `${r.id} (${r.enabled ? "on" : "off"})`).join(", ")}`);
  console.log(args.dryRun ? "Dry run done." : "Done.");
}

if (require.main === module) main().catch((err) => { console.error(String(err.message || err)); process.exit(1); });
module.exports = { RULE_ID, RULE_INPUT, settingsToAdd, ruleToAdd, parseArgs };
