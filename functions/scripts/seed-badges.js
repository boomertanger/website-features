#!/usr/bin/env node
// functions/scripts/seed-badges.js
//
// Loads the Trophy Room's starter catalog (functions/data/trophy-room-badges.json,
// docs/specs/rewards.md §9) into sites/boomertanger/badges and sites/boomertanger/collections.
// STAGING ONLY: it refuses any other project. Dry run by default: it shows what would be
// created or changed and writes nothing; --apply writes. A badge already in Firestore keeps its
// holders and pctHeld (they're counted by rewardsNightly); a badge in Firestore but not in the
// file is listed and left alone (nothing is ever deleted here).
//
// Needs Application Default Credentials (gcloud auth application-default login).
// Usage (from the repo root or functions/):
//   node functions/scripts/seed-badges.js                 # dry run, staging
//   node functions/scripts/seed-badges.js --apply         # write to staging
//   node functions/scripts/seed-badges.js --wording "Punch the clock"   # dry run: ONLY the text fields containing that phrase (scripts/wording.js)
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const FILE = path.join(__dirname, "..", "data", "trophy-room-badges.json");
const SITE_ID = "boomertanger";
const { KEEP, badgeDoc, same, norm } = require("../lib/rewards/catalog");   // shared with the seedBadgeCatalog callable

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  if (!/staging/.test(projectId)) throw new Error(`Staging only: refusing to run against "${projectId}".`);
  const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const ids = new Set();
  for (const b of data.badges) {
    if (!b.id || ids.has(b.id)) throw new Error(`Duplicate or missing badge id: ${b.id}`);
    ids.add(b.id);
    if (!data.collections.some((c) => c.id === b.collection)) throw new Error(`${b.id}: unknown collection ${b.collection}`);
  }

  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const site = db.doc(`sites/${SITE_ID}`);
  const [existing, existingCols] = await Promise.all([site.collection("badges").get(), site.collection("collections").get()]);
  const have = new Map(existing.docs.map((d) => [d.id, d.data()]));
  const haveCols = new Map(existingCols.docs.map((d) => [d.id, d.data()]));

  console.log(`Project: ${projectId} (${args.apply ? "writing" : "dry run: nothing is written"})`);
  console.log(`File: ${path.relative(process.cwd(), FILE)} · version ${data.version} · ${data.badges.length} badges · ${data.collections.length} collections\n`);

  if (args.wording) {
    const entries = data.badges.map((b) => ({ ref: site.collection("badges").doc(b.id), path: `${site.path}/badges/${b.id}`, id: b.id, next: badgeDoc(b), cur: have.get(b.id) }));
    return require("./wording").runWording(db, entries, args.wording, args.apply);
  }
  const writes = [];
  let created = 0, changed = 0, unchanged = 0;
  for (const b of data.badges) {
    const next = badgeDoc(b);
    const cur = have.get(b.id);
    if (!cur) { created++; writes.push([site.collection("badges").doc(b.id), { ...next, holders: 0, pctHeld: 0, createdAt: admin.firestore.FieldValue.serverTimestamp() }, false]); continue; }
    const diff = Object.keys(next).filter((k) => !same(norm(next[k]), norm(cur[k] ?? null)));
    if (!diff.length) { unchanged++; continue; }
    changed++;
    console.log(`CHANGE  ${b.id}: ${diff.join(", ")}`);
    writes.push([site.collection("badges").doc(b.id), next, true]);   // merge: holders and pctHeld stay
  }
  const extra = [...have.keys()].filter((id) => !ids.has(id));
  let colNew = 0, colChanged = 0;
  data.collections.forEach((c, order) => {
    const next = { name: c.name, icon: c.icon || null, blurb: c.blurb || "", order, crewOnly: c.id === "crew" };
    const cur = haveCols.get(c.id);
    if (!cur) colNew++; else if (Object.keys(next).some((k) => !same(next[k], cur[k] ?? null))) colChanged++; else return;
    writes.push([site.collection("collections").doc(c.id), next, true]);
  });

  const byRarity = [1, 2, 3, 4, 5].map((r) => data.badges.filter((b) => b.rarity === r).length);
  const bySource = data.badges.reduce((m, b) => ({ ...m, [b.source]: (m[b.source] || 0) + 1 }), {});
  console.log(`Badges:      ${created} new · ${changed} changed · ${unchanged} unchanged${extra.length ? ` · ${extra.length} in Firestore but not in the file (left alone: ${extra.join(", ")})` : ""}`);
  console.log(`Collections: ${colNew} new · ${colChanged} changed · ${data.collections.length - colNew - colChanged} unchanged`);
  console.log(`By rarity:   Common ${byRarity[0]} · Uncommon ${byRarity[1]} · Rare ${byRarity[2]} · Epic ${byRarity[3]} · Legendary ${byRarity[4]}`);
  console.log(`By source:   ${Object.entries(bySource).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  console.log(`Holders kept on existing badges: ${KEEP.join(", ")}`);

  if (!args.apply) { console.log("\nDry run: nothing written. Add --apply to write it."); return; }
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    writes.slice(i, i + 400).forEach(([ref, doc, merge]) => (merge ? batch.set(ref, doc, { merge: true }) : batch.set(ref, doc)));
    await batch.commit();
  }
  console.log(`\nWritten: ${writes.length} document(s).`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err.message || err); process.exit(1); });
