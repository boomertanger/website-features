#!/usr/bin/env node
// functions/scripts/seed-factory-types.js
//
// Loads the Fun Factory's activity types (functions/data/fun-factory-ideas.json, activityTypes;
// docs/specs/fun-factory.md §4) into sites/boomertanger/factory/main/activityTypes. The builder
// only offers types that are enabled; disabled ones show "Needs …". The idea library in the same
// file is for Fun Factory part 2 (not loaded here).
// STAGING ONLY: it refuses any other project. Dry run by default: it shows what would be created
// or changed and writes nothing; --apply writes. A type in Firestore but not in the file is listed
// and left alone (nothing is ever deleted here).
//
// Needs Application Default Credentials (gcloud auth application-default login).
// Usage (from the repo root or functions/):
//   node functions/scripts/seed-factory-types.js                 # dry run, staging
//   node functions/scripts/seed-factory-types.js --apply         # write to staging
//   node functions/scripts/seed-factory-types.js --only stream   # dry run for ONE type only (add --apply to write it)
// --only <id>: touches only that one type and never the others (so edits made in the Night Shift builder to other types
// are safe); for an existing doc it leaves `order` alone and writes only the fields the file owns (name is kept).
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const FILE = path.join(__dirname, "..", "data", "fun-factory-ideas.json");
const SITE_ID = "boomertanger";

function parseArgs(argv) {
  const args = { project: "staging", apply: false, only: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--apply") args.apply = true;
    else if (argv[i] === "--only") args.only = argv[++i];
    else if (argv[i] === "--project") args.project = argv[++i];
    else if (argv[i].startsWith("--project=")) args.project = argv[i].slice("--project=".length);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return args;
}
function resolveProjectId(nameOrId) {
  try {
    const rc = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", ".firebaserc"), "utf8"));
    return rc.projects?.[nameOrId] ?? nameOrId;
  } catch { return nameOrId; }
}

/** The fields the file owns for an activity type doc. */
function typeDoc(t, order) {
  return {
    name: t.name, description: t.description || "", source: t.source || null, enabled: t.enabled === true, needs: t.needs || null,
    actions: Array.isArray(t.actions) ? t.actions : [], params: Array.isArray(t.params) ? t.params : [], order,
  };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  if (!/staging/.test(projectId)) throw new Error(`Staging only: refusing to run against "${projectId}".`);
  const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const ids = new Set();
  for (const t of data.activityTypes) {
    if (!t.id || !/^[a-z][a-z0-9-]*$/.test(t.id) || ids.has(t.id)) throw new Error(`Duplicate or bad type id: ${t.id}`);
    if (!t.name) throw new Error(`${t.id}: name is required`);
    if (!t.enabled && !t.needs) throw new Error(`${t.id}: a disabled type says what it needs`);
    ids.add(t.id);
  }

  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const col = db.collection(`sites/${SITE_ID}/factory/main/activityTypes`);
  const existing = await col.get();
  const have = new Map(existing.docs.map((d) => [d.id, d.data()]));

  console.log(`Project: ${projectId} (${args.apply ? "writing" : "dry run: nothing is written"})`);
  console.log(`File: ${path.relative(process.cwd(), FILE)} · version ${data.version} · ${data.activityTypes.length} activity types\n`);
  const writes = [];
  let created = 0, changed = 0, unchanged = 0;
  if (args.only && !ids.has(args.only)) throw new Error(`--only ${args.only}: no such type in the file.`);
  data.activityTypes.forEach((t, order) => {
    if (args.only && t.id !== args.only) return;
    const next = typeDoc(t, order), cur = have.get(t.id);
    if (!cur) { created++; console.log(`NEW     ${t.id} (${t.enabled ? "on" : `off, needs ${t.needs}`})`); writes.push([col.doc(t.id), next]); return; }
    const diff = Object.keys(next).filter((k) => !(args.only && k === "order") && !same(next[k], cur[k] ?? null));
    if (!diff.length) { unchanged++; return; }
    changed++;
    console.log(`CHANGE  ${t.id}: ${diff.join(", ")}`);
    const { order: _o, ...patch } = next;
    writes.push([col.doc(t.id), args.only ? Object.fromEntries(diff.map((k) => [k, next[k]])) : next]);
  });
  const extra = [...have.keys()].filter((id) => !ids.has(id));
  const on = data.activityTypes.filter((t) => t.enabled).map((t) => t.id);
  console.log(`\nTypes: ${created} new · ${changed} changed · ${unchanged} unchanged${extra.length ? ` · ${extra.length} in Firestore but not in the file (left alone: ${extra.join(", ")})` : ""}`);
  if (!args.only) {
  console.log(`On (${on.length}): ${on.join(", ")}`);
  console.log(`Off (${data.activityTypes.length - on.length}): ${data.activityTypes.filter((t) => !t.enabled).map((t) => `${t.id} (${t.needs})`).join(", ")}`);
  }

  if (!args.apply) { console.log("\nDry run: nothing written. Add --apply to write it."); return; }
  const batch = db.batch();
  writes.forEach(([ref, doc]) => batch.set(ref, doc, { merge: true }));
  if (writes.length) await batch.commit();
  console.log(`\nWritten: ${writes.length} document(s).`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err.message || err); process.exit(1); });
