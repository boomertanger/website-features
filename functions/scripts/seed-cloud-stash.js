#!/usr/bin/env node
// functions/scripts/seed-cloud-stash.js
//
// Starts Cloud Stash (docs/specs/cloud-stash.md §4 Seed, §7) on a project. Idempotent: run it again and nothing changes. It is the ONLY script that sets up the Bug Zapper
// screenshot cleanup rule (it replaced seed-bug-cleanup-rule.js).
//   1. adminSettings/storage  the limits: pauseAtPct 80, manualPause false, manualPauseReason "", runCap 100. If the doc exists, only the fields it lacks are added.
//   2. cleanupRules/bugZapperScreenshots  the rule "Old bug screenshots": Bug Zapper screenshots (the allowlisted target in lib/stash/targets.js), closed as Fixed, Won't fix,
//      Can't reproduce or Duplicate for 60 days, DISABLED. Missing: created. Present in the old shape (no target): rewritten IN PLACE to the allowlisted shape, same id, switched
//      OFF (the owner or an Overseer switches it on in Cloud Stash after a dry run). Present and already allowlisted: left alone.
//   3. cleanupRules/oldBugScreenshots  the duplicate an earlier version of this seed created. Deleted, but only when it is disabled and has no lastRun; otherwise the seed stops
//      before writing anything and says so. Deleting a cleanupRules doc never touches Cloudinary.
// Both rule changes are logged to adminLog (feature cloudStash: rule-save and rule-delete, actor "seed").
//
// STAGING ONLY: it accepts --project staging and nothing else. --dry-run prints what it would write and writes nothing. Needs Application Default Credentials
// (gcloud auth application-default login).
//   node functions/scripts/seed-cloud-stash.js --project staging [--dry-run]
const fs = require("fs");
const path = require("path");
const T = require("../lib/stash/targets");
const { DEFAULTS, settingsOf } = require("../lib/stash/logic");

const RULE_ID = "bugZapperScreenshots";
const DUPLICATE_ID = "oldBugScreenshots";
const RULE_INPUT = { name: "Old bug screenshots", target: "bugScreenshots", statuses: T.BUG_SCREENSHOTS.statuses.slice(), days: 60 };

/** The settings fields to add: the defaults for every field the stored doc lacks (valid stored values are left alone). */
function settingsToAdd(stored) {
  const have = stored && typeof stored === "object" ? stored : {};
  const out = {};
  for (const k of Object.keys(DEFAULTS)) if (have[k] === undefined) out[k] = DEFAULTS[k];
  return out;
}

/** The allowlisted rule fields, the same shape stashRuleSave writes (the legacy-named fields stay so an older reader still sees a complete doc). Always disabled. */
function ruleFields() {
  const v = T.validateRule(RULE_INPUT);
  if (!v.ok) throw new Error(`The built-in rule is invalid: ${v.message}`);
  const t = T.targetOf(v.value.target);
  return { name: v.value.name, target: v.value.target, statuses: v.value.statuses, days: v.value.days, feature: t.feature, collection: t.collection, matchField: t.matchField, matchValue: t.matchValue, ageField: t.ageField, ageThresholdDays: v.value.days, enabled: false };
}

/**
 * What to do with the rules: { rule: "create" | "upgrade" | "keep", fields, remove: boolean, stop: string|null }. `main` and `dup` are the stored docs (or undefined).
 * "upgrade" is for any doc at the id that is not on the allowlist; a rule already on the allowlist is kept as it is (its enabled state, days and statuses are the owner's now).
 */
function planRules(main, dup) {
  let stop = null;
  if (dup && (dup.enabled === true || dup.lastRun)) stop = `cleanupRules/${DUPLICATE_ID} is ${dup.enabled === true ? "enabled" : "disabled"}${dup.lastRun ? " and has a lastRun" : ""}, so it is not deleted. Look at it in Cloud Stash, then run the seed again.`;
  const onList = !!(main && T.targetOf(main.target));
  return { rule: !main ? "create" : onList ? "keep" : "upgrade", fields: ruleFields(), remove: !!dup && !stop, stop };
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
  const FV = admin.firestore.FieldValue;
  console.log(`Project: ${projectId}${args.dryRun ? " (dry run: nothing is written)" : ""}`);

  // read everything first, and stop before writing anything if the duplicate can't be removed
  const settingsRef = db.doc("adminSettings/storage");
  const stored = (await settingsRef.get()).data();
  const mainRef = db.doc(`cleanupRules/${RULE_ID}`), dupRef = db.doc(`cleanupRules/${DUPLICATE_ID}`);
  const main = (await mainRef.get()).data(), dup = (await dupRef.get()).data();
  const plan = planRules(main, dup);
  if (plan.stop) throw new Error(plan.stop);

  const add = settingsToAdd(stored);
  if (Object.keys(add).length) {
    console.log(`adminSettings/storage: ${stored ? "exists, adding the missing fields" : "new"}: ${JSON.stringify(add)}`);
    if (!args.dryRun) await settingsRef.set(add, { merge: true });
  } else console.log("adminSettings/storage: nothing to add");
  console.log(`  limits now: ${JSON.stringify(settingsOf({ ...(stored || {}), ...add }))}`);

  const log = async (action, id, title, extra) => {
    const retention = (await db.doc("adminSettings/log").get()).get("retentionDays");
    const days = Number.isFinite(retention) && retention > 0 ? retention : 365;
    await db.collection("adminLog").add({ feature: "cloudStash", action, itemPath: `cleanupRules/${id}`, itemTitle: title, actorUid: null, actorName: "seed", reason: "", createdAt: FV.serverTimestamp(), expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + days * 864e5), ...extra });
  };
  if (plan.rule === "keep") console.log(`cleanupRules/${RULE_ID}: already on the allowlist, left alone`);
  else {
    console.log(`cleanupRules/${RULE_ID}: ${plan.rule === "create" ? "new" : "rewritten in place from the old shape"}, DISABLED: ${T.sentence(plan.fields)}`);
    if (!args.dryRun) {
      const meta = { updatedBy: "seed", updatedAt: FV.serverTimestamp() };
      if (plan.rule === "create") await mainRef.set({ ...plan.fields, ...meta, createdBy: "seed", createdAt: FV.serverTimestamp() });
      else await mainRef.set({ ...plan.fields, ...meta }, { merge: true });
      await log("rule-save", RULE_ID, plan.fields.name, { details: { op: plan.rule === "create" ? "create" : "update", sentence: T.sentence(plan.fields), enabled: false, by: "seed" }, ...(plan.rule === "upgrade" ? { changes: { target: { before: main.target ?? null, after: plan.fields.target }, enabled: { before: main.enabled === true, after: false } } } : {}) });
    }
  }
  if (plan.remove) {
    console.log(`cleanupRules/${DUPLICATE_ID}: the earlier duplicate, disabled with no lastRun: deleted (Cloudinary is not touched)`);
    if (!args.dryRun) { await dupRef.delete(); await log("rule-delete", DUPLICATE_ID, (dup && dup.name) || DUPLICATE_ID, { details: { rule: { name: (dup && dup.name) || "", target: dup.target || "legacy", days: dup.days ?? dup.ageThresholdDays ?? null }, by: "seed" } }); }
  } else console.log(`cleanupRules/${DUPLICATE_ID}: not there`);
  console.log(args.dryRun ? "Dry run done." : "Done.");
}

if (require.main === module) main().catch((err) => { console.error(String(err.message || err)); process.exit(1); });
module.exports = { RULE_ID, DUPLICATE_ID, RULE_INPUT, settingsToAdd, ruleFields, planRules, parseArgs };
