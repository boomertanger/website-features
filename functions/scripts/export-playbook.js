#!/usr/bin/env node
// functions/scripts/export-playbook.js: writes the live Playbook (docs/specs/playbook.md §7) back to a PRIVATE file in functions/scripts/data, in the seed's
// format, so it can seed another project (at launch: export from staging, seed production). Application Default Credentials. Prints counts only.
//   node functions/scripts/export-playbook.js                         staging -> data/playbook-export-<YYYY-MM-DD>.json
//   --project prod (or production)                                    read production instead (named explicitly; anything else is refused)
//   --out <name>                                                      playbook.json or playbook-<name>.json; nothing else
//   --overwrite                                                       replace an existing file
// It writes only to a path that .gitignore keeps out of the repo (checked with git check-ignore before writing); it never prints Playbook text.
const fs = require("fs");
const path = require("path");
const { projectOf, privateFile } = require("./seed-playbook");

function parseArgs(argv) {
  const a = { project: "staging", out: null, overwrite: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--project") a.project = argv[++i];
    else if (x.startsWith("--project=")) a.project = x.slice(10);
    else if (x === "--out") a.out = argv[++i];
    else if (x.startsWith("--out=")) a.out = x.slice(6);
    else if (x === "--overwrite") a.overwrite = true;
    else throw new Error(`Unknown argument: ${x}`);
  }
  return a;
}
const dateKey = (t) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date(t));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = projectOf(args.project);
  const name = args.out || `playbook-export-${dateKey(Date.now())}.json`;
  const file = privateFile(name);   // refuses any name .gitignore doesn't cover
  if (fs.existsSync(file) && !args.overwrite) throw new Error(`${name} already exists. Add --overwrite to replace it.`);
  const admin = require("firebase-admin");
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const B = "sites/boomertanger/playbook/main";
  const [main, pages, flags, decisions] = await Promise.all([db.doc(B).get(), db.collection(`${B}/pages`).get(), db.collection(`${B}/flags`).get(), db.collection(`${B}/decisions`).get()]);
  if (pages.empty) throw new Error(`${projectId} has no Playbook pages to export.`);
  const by = (k) => (a, b) => (Number(a[k]) || 0) - (Number(b[k]) || 0);
  const out = {
    playbookSeed: 1,
    seedVersion: `export-${projectId}-${dateKey(Date.now())}`,
    note: `Exported from ${projectId}. Private: keep it in functions/scripts/data, never commit it.`,
    pages: pages.docs.map((d) => { const x = d.data(); return { id: d.id, order: x.order ?? 0, nav: x.nav || x.title, icon: x.icon || "", title: x.title, status: x.status ?? null, service: x.service ?? null, lede: x.lede || "", body: x.body || "", mockupUrl: x.mockupUrl || null }; }).sort(by("order")),
    flags: flags.docs.map((d) => { const x = d.data(); return { id: d.id, pageId: x.pageId, status: x.status, text: x.text, ...(x.answer ? { answer: x.answer } : {}), order: x.order ?? 0 }; }).sort(by("order")),
    decisions: decisions.docs.map((d) => { const x = d.data(); return { id: d.id, date: x.date, text: x.text, ...(x.pageId ? { pageId: x.pageId } : {}), ...(x.flagId ? { flagId: x.flagId } : {}), order: x.order ?? 0 }; }).sort(by("order")),
  };
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
  console.log(`${projectId} -> functions/scripts/data/${name} (gitignored): ${out.pages.length} pages, ${out.flags.length} flags, ${out.decisions.length} decisions${main.exists && main.get("firstReadDone") ? " · first read-through done" : ""}.`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
