#!/usr/bin/env node
// functions/scripts/sync-services.js: syncs the Service Hub manifests (services/*.json at the repo root; docs/specs/service-hub.md §3a) into staging's
// sites/boomertanger/services/main, the same code as the serviceSync callable (lib/services syncManifests), so the items exist before /admin/services does.
// New manifests become items, a version change appends versionHistory, a manifest that disappeared retires its item (never deleted); then summary/main
// and public/services are rebuilt. The build hash is the one /services.json carries (SHA-256 of the manifests sorted by id).
// STAGING ONLY (it refuses any production project). Application Default Credentials. Dry run unless --apply.
//   node functions/scripts/sync-services.js                    # dry run: what would be created, updated, bumped, retired
//   node functions/scripts/sync-services.js --apply            # write it
//   --project <name|id>   default staging
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

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
  if (/prod/i.test(String(projectId)) || /prod/i.test(String(name)) || !/staging/i.test(String(projectId))) throw new Error(`Refusing ${projectId}: sync-services.js runs on staging only.`);
}
/** The manifests, sorted by id, and the hash /services.json carries. */
function readManifests(dir = path.join(__dirname, "..", "..", "services")) {
  const list = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))).sort((a, b) => a.id.localeCompare(b.id));
  return { list, hash: crypto.createHash("sha256").update(JSON.stringify(list)).digest("hex") };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  stagingOnly(projectId, args.project);
  const admin = require("firebase-admin");
  admin.initializeApp({ projectId });
  // Firestore refuses undefined values (an adminLog entry without changes or a snapshot), so they are left out
  const adminLogEntry = async (_db, f) => ({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)), actorUid: f.actorUid ?? null, actorName: f.actorName || "sync-services.js", reason: f.reason || "", createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 365 * 24 * 3600000) });
  const { list, hash } = readManifests();
  const S = require("../lib/services").build({ adminLogEntry });
  console.log(`${projectId} · ${list.length} manifests · build hash ${hash.slice(0, 12)}…${args.apply ? "" : " · dry run (add --apply)"}`);
  const out = await S.syncManifests(list, { buildHash: hash, apply: args.apply, actor: args.apply ? { uid: null, name: "sync-services.js" } : null });
  console.log(`  create (${out.create.length}): ${out.create.join(", ") || "-"}`);
  console.log(`  update (${out.update.length}): ${out.update.join(", ") || "-"}`);
  console.log(`  version bumps (${out.bump.length}): ${out.bump.join(", ") || "-"}`);
  console.log(`  retire (${out.retire.length}): ${out.retire.join(", ") || "-"}`);
  console.log(`  unchanged: ${out.same}`);
  if (out.applied) console.log("  applied: items written, summary/main and public/services rebuilt, adminLog sync written.");
}

if (require.main === module) main().catch((err) => { console.error(String((err && err.details && err.details.reason) ? `${err.details.reason}: ${err.message}` : (err && err.message) || err)); process.exit(1); });
module.exports = { readManifests, stagingOnly };
