#!/usr/bin/env node
// functions/scripts/seed-factory-ideas.js
//
// Loads the Fun Factory's idea library (functions/data/fun-factory-ideas.json; docs/specs/fun-factory.md
// §6) into sites/boomertanger/factory/main/ideas: season themes, chapter names (by theme), campaign names
// (by cadence and audience), activity ideas and reward names. One doc per idea with a stable id
// ("theme-dark-signal"), kind, its fields, usedIn ([] — publishing a season fills it) and retired.
// Re-running updates the seed's own fields and never touches usedIn, retired or ideas admins added.
// Readable by mods and admins only (firestore.rules); admins edit them with factoryIdeaSave.
// STAGING ONLY. Dry run by default; --apply writes. Nothing is ever deleted here.
//
// Needs Application Default Credentials (gcloud auth application-default login).
// Usage (from the repo root or functions/):
//   node functions/scripts/seed-factory-ideas.js            # dry run, staging
//   node functions/scripts/seed-factory-ideas.js --apply    # write to staging
//   node functions/scripts/seed-factory-ideas.js --wording "Punch the clock"   # dry run: ONLY the text fields containing that phrase, on ideas that already exist
//   (see scripts/wording.js; add --apply to write exactly those fields)
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const FILE = path.join(__dirname, "..", "data", "fun-factory-ideas.json");
const SITE_ID = "boomertanger";

function parseArgs(argv) {
  const args = { project: "staging", apply: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--apply") args.apply = true;
    else if (argv[i] === "--wording") args.wording = argv[++i];
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
const slug = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 60);

/** Every idea in the file as [id, doc] (the seed's own fields only). */
function ideasFrom(data) {
  const out = [];
  const add = (kind, label, doc) => out.push([`${kind}-${slug(label)}`, { kind, ...doc }]);
  for (const t of data.themes || []) add("theme", t.name, { name: t.name, pitch: t.pitch || "", tags: t.tags || [], emoji: t.emoji || null });
  for (const g of data.chapterNames || []) for (const n of g.names || []) add("chapter", `${g.theme}-${n}`, { name: n, theme: g.theme || "Any theme" });
  for (const g of data.campaignNames || []) for (const n of g.names || []) add("campaign", `${g.cadence}-${g.audience}-${n}`, { name: n, cadence: g.cadence === "any" ? null : g.cadence, audience: g.audience || "all" });   // "any": a Sub Club or Crew name for any cadence
  for (const a of data.activities || []) add("activity", a.id ? a.id.replace(/^activity-/, "") : `${a.type}-${a.title}`, { title: a.title, instructions: a.instructions || "", typeId: a.type, target: a.target, xp: a.xp, cadence: a.cadence, audience: a.audience || "all", params: a.params || {} });
  for (const n of data.rewardNames || []) add("reward", n, { name: n });
  return out;
}
// Compare ignoring key order (Firestore can return a map's keys in a different order).
const stable = (v) => (Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])])) : v);
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  if (!/staging/.test(projectId)) throw new Error(`Staging only: refusing to run against "${projectId}".`);
  const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const ideas = ideasFrom(data);
  const ids = new Set();
  for (const [id] of ideas) { if (ids.has(id)) throw new Error(`Duplicate idea id: ${id}`); ids.add(id); }

  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const col = db.collection(`sites/${SITE_ID}/factory/main/ideas`);
  const existing = await col.get();
  const have = new Map(existing.docs.map((d) => [d.id, d.data()]));
  console.log(`Project: ${projectId} (${args.apply ? "writing" : "dry run: nothing is written"})`);
  console.log(`File: ${path.relative(process.cwd(), FILE)} · version ${data.version}\n`);

  if (args.wording) {
    const entries = ideas.map(([id, doc]) => ({ ref: col.doc(id), path: `${col.path}/${id}`, id, next: doc, cur: have.get(id) }));
    return require("./wording").runWording(db, entries, args.wording, args.apply);
  }
  const writes = [];
  const counts = {};
  let created = 0, changed = 0, unchanged = 0;
  for (const [id, doc] of ideas) {
    counts[doc.kind] = (counts[doc.kind] || 0) + 1;
    const cur = have.get(id);
    if (!cur) { created++; writes.push([col.doc(id), { ...doc, usedIn: [], retired: false, source: "seed", createdAt: admin.firestore.FieldValue.serverTimestamp() }]); continue; }
    const diff = Object.keys(doc).filter((k) => !same(doc[k], cur[k] ?? null));
    if (!diff.length) { unchanged++; continue; }
    changed++;
    console.log(`CHANGE  ${id}: ${diff.join(", ")}`);
    writes.push([col.doc(id), doc]);   // merge: usedIn and retired stay
  }
  const theirs = [...have.keys()].filter((id) => !ids.has(id));
  const waiting = new Set((data.activityTypes || []).filter((t) => !t.enabled).map((t) => t.id));
  const waitingActs = (data.activities || []).filter((a) => waiting.has(a.type)).length;
  console.log(`Ideas: ${created} new · ${changed} changed · ${unchanged} unchanged${theirs.length ? ` · ${theirs.length} added in the builder (left alone)` : ""}`);
  console.log(`By kind: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  console.log(`Activity ideas waiting on new features: ${waitingActs} of ${(data.activities || []).length}`);

  if (!args.apply) { console.log("\nDry run: nothing written. Add --apply to write it."); return; }
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    writes.slice(i, i + 400).forEach(([ref, doc]) => batch.set(ref, doc, { merge: true }));
    await batch.commit();
  }
  console.log(`\nWritten: ${writes.length} document(s).`);
}

if (require.main === module) main().then(() => process.exit(0)).catch((err) => { console.error(err.message || err); process.exit(1); });
module.exports = { ideasFrom, slug };
