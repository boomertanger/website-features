#!/usr/bin/env node
// functions/scripts/seed-live.js
//
// Seeds the Control Room's two settings documents (docs/specs/control-room.md §5, §13):
//   sites/boomertanger/live/main                            the settings logic.js uses (DEFAULT_SETTINGS), the house look "hull",
//                                                           twitchPresence off, makeBackstagePrivateAfterDays 7
//   sites/boomertanger/live/main/private/checklistTemplates the four beat templates, filled with the starter checklist (§5)
// STAGING ONLY: it refuses any other project. DRY RUN by default: it prints what it would write and writes nothing; --apply writes.
//
// Safe to run again (idempotent). It never overwrites what the owner edited: live/main only gets the fields that are missing (a
// field that exists keeps its value) and the templates are written only when there are none. --force replaces the SETTINGS fields
// and the templates with the defaults again; it never touches the key hashes (obsKeyHash, deckKeyHash) or any other field.
//
// Needs Application Default Credentials (gcloud auth application-default login). Usage (repo root or functions/):
//   node functions/scripts/seed-live.js                  # dry run, staging
//   node functions/scripts/seed-live.js --apply          # write what is missing to staging
//   node functions/scripts/seed-live.js --apply --force  # reset settings and templates to the defaults
const fs = require("fs");
const path = require("path");

const SITE_ID = "boomertanger";
const STAGING_PROJECT = "boomertanger-staging";

function parseArgs(argv) {
  const args = { project: "staging", apply: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") args.apply = true;
    else if (a === "--force") args.force = true;
    else if (a === "--project") args.project = argv[++i];
    else if (a.startsWith("--project=")) args.project = a.slice("--project=".length);
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}
function resolveProjectId(nameOrId) {
  try {
    const rc = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", ".firebaserc"), "utf8"));
    return rc.projects?.[nameOrId] ?? nameOrId;
  } catch { return nameOrId; }
}

/** The settings fields this script owns: logic.DEFAULT_SETTINGS plus the look and the two switches. */
function defaultSettingsDoc() {
  const { DEFAULT_SETTINGS } = require("../lib/live/logic");
  return { ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), look: "hull", twitchPresence: false, makeBackstagePrivateAfterDays: 7 };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The whole seed, for a Firestore `db` (Admin SDK or the check's fake). Returns { main: "created" | "filled" | "unchanged" | "reset",
 * templates: "created" | "kept" | "reset", wrote: boolean }. `log` gets one line per decision; nothing secret is ever involved.
 */
async function run({ db, apply = false, force = false, log = console.log }) {
  const { STARTER_TEMPLATES } = require("../lib/live/starter");
  const mainRef = db.doc(`sites/${SITE_ID}/live/main`), tplRef = db.doc(`sites/${SITE_ID}/live/main/private/checklistTemplates`);
  const defaults = defaultSettingsDoc();
  const [mainSnap, tplSnap] = await Promise.all([mainRef.get(), tplRef.get()]);
  const out = { wrote: false };

  // live/main
  const cur = mainSnap.exists ? mainSnap.data() : null;
  if (!cur) { out.main = "created"; log(`${apply ? "Creating" : "Would create"}: live/main with the default settings (look ${defaults.look})`); if (apply) await mainRef.set(defaults); }
  else {
    const missing = Object.fromEntries(Object.entries(defaults).filter(([k]) => cur[k] === undefined));
    const reset = force ? Object.fromEntries(Object.entries(defaults).filter(([k, v]) => !same(cur[k], v))) : {};
    const patch = force ? reset : missing;
    if (!Object.keys(patch).length) { out.main = "unchanged"; log("live/main: unchanged (nothing missing)"); }
    else {
      out.main = force ? "reset" : "filled";
      log(`${apply ? (force ? "Resetting" : "Filling") : (force ? "Would reset" : "Would fill")}: live/main fields ${Object.keys(patch).join(", ")}${force ? " (key hashes are never touched)" : " (existing values are kept)"}`);
      if (apply) await mainRef.set(patch, { merge: true });
    }
  }

  // the templates
  if (!tplSnap.exists) { out.templates = "created"; log(`${apply ? "Creating" : "Would create"}: the checklist templates (the starter checklist, ${Object.values(STARTER_TEMPLATES.beats).reduce((n, l) => n + l.length, 0)} items)`); if (apply) await tplRef.set({ ...JSON.parse(JSON.stringify(STARTER_TEMPLATES)), seededAt: Date.now() }); }
  else if (force) { out.templates = "reset"; log(`${apply ? "Resetting" : "Would reset"}: the checklist templates to the starter checklist (your edits are replaced)`); if (apply) await tplRef.set({ ...JSON.parse(JSON.stringify(STARTER_TEMPLATES)), seededAt: Date.now() }); }
  else { out.templates = "kept"; log("Checklist templates: kept (they already exist; use --force to reset them)"); }

  out.wrote = apply && (out.main !== "unchanged" || out.templates !== "kept");
  if (!apply) log("Dry run: nothing written. Add --apply to write.");
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  if (projectId !== STAGING_PROJECT) throw new Error(`Staging only: refusing to run against "${projectId}".`);
  const admin = require("firebase-admin");
  admin.initializeApp({ projectId });
  console.log(`Project: ${projectId}${args.apply ? "" : " (dry run)"}`);
  await run({ db: admin.firestore(), apply: args.apply, force: args.force });
}

module.exports = { run, parseArgs, defaultSettingsDoc, STAGING_PROJECT };
if (require.main === module) main().catch((err) => { console.error(err.message || err); process.exit(1); });
