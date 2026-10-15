#!/usr/bin/env node
// functions/scripts/seed-playbook.js: seeds The Playbook (docs/specs/playbook.md §7) from the PRIVATE, gitignored functions/scripts/data/playbook.json (or a
// --file in that folder, e.g. an export). Application Default Credentials and the Admin SDK. Prints counts only, never Playbook text.
//   node functions/scripts/seed-playbook.js                    dry run on staging: what it would do
//   node functions/scripts/seed-playbook.js --apply            write it to staging
//   --project prod (or production)                             production, only when named explicitly; any other project is refused
//   --force                                                    also overwrite pages edited on the site (editedOnSite: true); otherwise they're skipped
//   --file <name>                                              another file in functions/scripts/data (it must be one .gitignore keeps out of the repo)
// Pages: a new page is created at version 1; a changed page keeps its old text as a version (source "seed") and moves up one; lastReviewedAt is kept.
// Flags and decisions are upserted by id. An existing flag keeps a status the owner settled on the site (a confirmed flag is never reopened) and its answer.
// main: reviewDay 1 and seedVersion; firstReadDone is only set (false) when it's missing.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const DATA = path.join(__dirname, "data");
const PROD = new Set(["prod", "production"]);
function parseArgs(argv) {
  const a = { project: "staging", apply: false, force: false, file: "playbook.json" };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--project") a.project = argv[++i];
    else if (x.startsWith("--project=")) a.project = x.slice(10);
    else if (x === "--file") a.file = argv[++i];
    else if (x.startsWith("--file=")) a.file = x.slice(7);
    else if (x === "--apply") a.apply = true;
    else if (x === "--force") a.force = true;
    else throw new Error(`Unknown argument: ${x}`);
  }
  return a;
}
function projectOf(name) {
  if (name === "staging") return "boomertanger-staging";
  if (PROD.has(name)) return "boomertanger-prod";
  throw new Error(`Refusing project "${name}": staging, or --project prod named explicitly.`);
}
/** Only files .gitignore keeps out of the repo (the Playbook's text must never be committed). */
function privateFile(name) {
  if (!/^playbook(-[A-Za-z0-9._-]+)?\.json$/.test(name)) throw new Error(`--file must be playbook.json or playbook-<name>.json in functions/scripts/data.`);
  const file = path.join(DATA, name);
  try { execFileSync("git", ["check-ignore", "-q", file], { cwd: path.join(__dirname, "..", "..") }); } catch { throw new Error(`${name} isn't gitignored. Stop: the Playbook's text must never be committed.`); }
  return file;
}

/** The plan (pure): what would be created, updated or skipped. Counts and ids only. */
function plan(seed, existing, { force }) {
  const L = require("../lib/playbook/logic");
  if (!seed || seed.playbookSeed !== 1 || !Array.isArray(seed.pages) || !Array.isArray(seed.flags) || !Array.isArray(seed.decisions)) throw new Error("The seed file isn't a Playbook seed (playbookSeed: 1 with pages, flags and decisions).");
  const pageIds = new Set(seed.pages.map((p) => p.id));
  for (const p of seed.pages) {
    if (typeof p.id !== "string" || !L.PAGE_ID.test(p.id)) throw new Error(`A page has a bad id (${String(p.id).slice(0, 40)}).`);
    const v = L.validatePage(p); if (!v.ok) throw new Error(`Page ${p.id}: ${v.message}`);
  }
  for (const f of seed.flags) {
    if (typeof f.id !== "string" || !L.FLAG_ID.test(f.id)) throw new Error(`A flag has a bad id (${String(f.id).slice(0, 40)}).`);
    if (!pageIds.has(f.pageId)) throw new Error(`Flag ${f.id} points at a page that isn't in the seed.`);
    if (!L.STATUSES.includes(f.status)) throw new Error(`Flag ${f.id} has an unknown status.`);
    const t = L.validateFlagText(f.text); if (!t.ok) throw new Error(`Flag ${f.id}: ${t.message}`);
  }
  for (const d of seed.decisions) {
    if (typeof d.id !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(d.id)) throw new Error("A decision has a bad id.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.date))) throw new Error(`Decision ${d.id} has no YYYY-MM-DD date.`);
    if (typeof d.text !== "string" || !d.text.trim()) throw new Error(`Decision ${d.id} has no text.`);
  }
  const out = { pages: { create: [], update: [], same: [], skipEdited: [] }, flags: { create: 0, update: 0, same: 0, keptSettled: 0 }, decisions: { create: 0, update: 0, same: 0 } };
  for (const p of seed.pages) {
    const e = existing.pages.get(p.id);
    if (!e) { out.pages.create.push(p.id); continue; }
    const changed = ["title", "lede", "body", "nav", "icon", "order", "status", "service", "mockupUrl"].some((k) => (p[k] ?? null) !== (e[k] ?? null));
    if (!changed) out.pages.same.push(p.id);
    else if (e.editedOnSite && !force) out.pages.skipEdited.push(p.id);
    else out.pages.update.push(p.id);
  }
  for (const f of seed.flags) {
    const e = existing.flags.get(f.id);
    if (!e) { out.flags.create++; continue; }
    if (e.status === "confirmed" && f.status !== "confirmed") out.flags.keptSettled++;
    const same = e.text === f.text && (e.order ?? 0) === (f.order ?? 0) && e.pageId === f.pageId && (e.status === f.status || e.status === "confirmed");
    if (same) out.flags.same++; else out.flags.update++;
  }
  for (const d of seed.decisions) {
    const e = existing.decisions.get(d.id);
    if (!e) out.decisions.create++; else if (e.text === d.text && e.date === d.date && (e.order ?? 0) === (d.order ?? 0) && (e.pageId ?? null) === (d.pageId ?? null)) out.decisions.same++; else out.decisions.update++;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = projectOf(args.project);
  const file = privateFile(args.file);
  if (!fs.existsSync(file)) throw new Error(`No ${args.file} in functions/scripts/data. Put the private seed there first.`);
  const seed = JSON.parse(fs.readFileSync(file, "utf8"));
  const admin = require("firebase-admin");
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const { Timestamp, FieldValue } = admin.firestore;
  const B = "sites/boomertanger/playbook/main";
  const [pagesSnap, flagsSnap, decSnap, mainSnap] = await Promise.all([db.collection(`${B}/pages`).get(), db.collection(`${B}/flags`).get(), db.collection(`${B}/decisions`).get(), db.doc(B).get()]);
  const existing = { pages: new Map(pagesSnap.docs.map((d) => [d.id, d.data()])), flags: new Map(flagsSnap.docs.map((d) => [d.id, d.data()])), decisions: new Map(decSnap.docs.map((d) => [d.id, d.data()])) };
  const P = plan(seed, existing, args);
  console.log(`${projectId} · ${args.file} · seedVersion ${seed.seedVersion || "?"}${args.apply ? "" : " · DRY RUN (add --apply)"}${args.force ? " · --force" : ""}`);
  console.log(`  pages: ${seed.pages.length} in the seed · ${P.pages.create.length} new · ${P.pages.update.length} updated · ${P.pages.same.length} unchanged · ${P.pages.skipEdited.length} skipped (edited on the site${P.pages.skipEdited.length ? `: ${P.pages.skipEdited.join(", ")}; --force overwrites` : ""})`);
  console.log(`  flags: ${seed.flags.length} in the seed · ${P.flags.create} new · ${P.flags.update} updated · ${P.flags.same} unchanged · ${P.flags.keptSettled} kept as settled on the site`);
  console.log(`  decisions: ${seed.decisions.length} in the seed · ${P.decisions.create} new · ${P.decisions.update} updated · ${P.decisions.same} unchanged`);
  if (!args.apply) return;
  const now = Date.now(), TS = Timestamp.fromMillis(now);
  const w = db.bulkWriter();
  const skip = new Set(P.pages.skipEdited), same = new Set(P.pages.same);
  for (const p of seed.pages) {
    if (skip.has(p.id) || same.has(p.id)) continue;
    const e = existing.pages.get(p.id);
    const fields = { title: p.title, nav: p.nav || p.title, icon: p.icon || "", order: Number(p.order) || 0, service: p.service || null, status: p.status || null, lede: p.lede || "", body: p.body, mockupUrl: p.mockupUrl || null, updatedAt: TS };
    if (!e) { w.set(db.doc(`${B}/pages/${p.id}`), { ...fields, version: 1, lastReviewedAt: null, editedOnSite: false }); continue; }
    const v = Number(e.version) || 1;
    w.set(db.doc(`${B}/pages/${p.id}/versions/${v}`), { title: e.title || "", lede: e.lede || "", body: e.body || "", savedAt: TS, source: "seed" });
    w.set(db.doc(`${B}/pages/${p.id}`), { ...fields, version: v + 1, editedOnSite: false }, { merge: true });
  }
  for (const f of seed.flags) {
    const e = existing.flags.get(f.id);
    const keepSettled = e && e.status === "confirmed";
    w.set(db.doc(`${B}/flags/${f.id}`), { pageId: f.pageId, text: f.text, order: Number(f.order) || 0, status: keepSettled ? "confirmed" : f.status, ...(e ? {} : { createdAt: TS }), ...(!e && f.answer ? { answer: f.answer } : {}) }, { merge: true });
  }
  for (const d of seed.decisions) w.set(db.doc(`${B}/decisions/${d.id}`), { date: d.date, text: d.text, order: Number(d.order) || 0, pageId: d.pageId || null, ...(d.flagId ? { flagId: d.flagId } : {}), ...(existing.decisions.has(d.id) ? {} : { createdAt: TS }) }, { merge: true });
  w.set(db.doc(B), { reviewDay: 1, seedVersion: String(seed.seedVersion || "seed"), seededAt: FieldValue.serverTimestamp(), ...(mainSnap.exists && mainSnap.get("firstReadDone") !== undefined ? {} : { firstReadDone: false }) }, { merge: true });
  await w.close();
  console.log(`  written: ${P.pages.create.length + P.pages.update.length} pages, ${seed.flags.length} flags, ${seed.decisions.length} decisions.`);
}

if (require.main === module) main().catch((e) => { console.error(e.message || e); process.exit(1); });
module.exports = { plan, projectOf, privateFile };
