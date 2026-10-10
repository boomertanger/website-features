#!/usr/bin/env node
// functions/scripts/backfill-service-links.js: links the Bug Zapper reports made before the Service Hub (docs/specs/service-hub.md §3a, part 4) to their
// service, from each report's page (the same matching as bugSubmit: lib/services/logic.js serviceForPath against the services items' routes). Only reports
// with no serviceId yet are touched; ideas are left alone (there is no path to go on). Writing serviceId sets off onBugReportService, which recounts the
// service's open bugs. STAGING ONLY (it refuses any production project). Application Default Credentials. Dry run unless --apply.
//   node functions/scripts/backfill-service-links.js                 # dry run: how many reports would link to which service
//   node functions/scripts/backfill-service-links.js --apply         # write it
//   --project <name|id>   default staging
const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const a = { project: "staging", apply: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--apply") a.apply = true;
    else if (argv[i] === "--project") a.project = argv[++i];
    else if (argv[i].startsWith("--project=")) a.project = argv[i].slice(10);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return a;
}
function resolveProjectId(nameOrId) {
  try { const rc = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", ".firebaserc"), "utf8")); return rc.projects?.[nameOrId] ?? nameOrId; }
  catch { return nameOrId; }
}
function stagingOnly(projectId, name) {
  if (/prod/i.test(String(projectId)) || /prod/i.test(String(name)) || !/staging/i.test(String(projectId))) throw new Error(`Refusing ${projectId}: backfill-service-links.js runs on staging only.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  stagingOnly(projectId, args.project);
  const admin = require("firebase-admin");
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const L = require("../lib/services/logic");
  const items = (await db.collection("sites/boomertanger/services/main/items").get()).docs.map((d) => ({ id: d.id, status: d.get("status"), routes: d.get("routes") || [] }));
  if (!items.length) throw new Error("No services items yet: run sync-services.js --apply first.");
  const reports = (await db.collection("sites/boomertanger/bugs/main/reports").get()).docs;
  const linked = reports.filter((d) => typeof d.get("serviceId") === "string" && d.get("serviceId"));
  const todo = reports.filter((d) => !(typeof d.get("serviceId") === "string" && d.get("serviceId")));
  const plan = [], unmatched = [];
  for (const d of todo) {
    const sid = L.serviceForPath(d.get("page"), items);
    if (sid) plan.push({ ref: d.ref, id: d.id, sid, page: d.get("page") }); else unmatched.push({ id: d.id, page: d.get("page") });
  }
  const bySvc = {};
  for (const p of plan) bySvc[p.sid] = (bySvc[p.sid] || 0) + 1;
  console.log(`${projectId} · ${reports.length} reports (${linked.length} already linked, ${todo.length} without a service) · ${items.length} services${args.apply ? "" : " · dry run (add --apply)"}`);
  console.log(`  would link ${plan.length}: ${Object.entries(bySvc).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ${n}`).join(", ") || "-"}`);
  console.log(`  no match ${unmatched.length}${unmatched.length ? ": " + unmatched.slice(0, 15).map((u) => JSON.stringify(String(u.page || "").slice(0, 50))).join(", ") + (unmatched.length > 15 ? " …" : "") : ""}`);
  console.log("  ideas: left alone (no path to go on)");
  if (!args.apply) return;
  for (let i = 0; i < plan.length; i += 400) { const b = db.batch(); plan.slice(i, i + 400).forEach((p) => b.update(p.ref, { serviceId: p.sid })); await b.commit(); }
  console.log(`  applied: ${plan.length} report(s) linked; onBugReportService recounts each service's open bugs.`);
}

if (require.main === module) main().catch((err) => { console.error(String((err && err.message) || err)); process.exit(1); });
module.exports = { stagingOnly };
