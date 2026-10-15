#!/usr/bin/env node
// functions/scripts/reconcile-vault-services.js: puts Service Hub's Vault game items (sites/boomertanger/services/main/items/vault-<slug>) back in line
// with the Vault (sites/boomertanger/vaultGames), with the same plan as the onVaultGameService trigger (lib/services reconcileVault):
//   create   a visible game with no item (e.g. imported before the trigger was deployed)
//   revive   a game shown again whose item the game had retired (an item an admin retired on purpose stays retired)
//   rename   the item's name differs from the game's title
//   retire   a hidden or deleted game whose item is still live
// Never deletes an item or a rating, never touches an item's hidden flag (an admin's hide). With --apply it writes the changes and rebuilds
// summary/main and public/services once. Dry run unless --apply. STAGING ONLY unless the project is allowed on purpose with --allow-project <id>.
// Application Default Credentials.
//   node functions/scripts/reconcile-vault-services.js                     # dry run on staging: the change table
//   node functions/scripts/reconcile-vault-services.js --apply             # write it
//   --project <name|id>   default staging     --allow-project <id>   required (and equal to --project) for anything that isn't staging
const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const a = { project: "staging", apply: false, allow: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--apply") a.apply = true;
    else if (argv[i] === "--project") a.project = argv[++i];
    else if (argv[i].startsWith("--project=")) a.project = argv[i].slice(10);
    else if (argv[i] === "--allow-project") a.allow = argv[++i];
    else if (argv[i].startsWith("--allow-project=")) a.allow = argv[i].slice(16);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return a;
}
function resolveProjectId(nameOrId) {
  try { const rc = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", ".firebaserc"), "utf8")); return rc.projects?.[nameOrId] ?? nameOrId; }
  catch { return nameOrId; }
}
/** Staging, or a project named on purpose with --allow-project (the same id). */
function projectAllowed(projectId, allow) {
  if (/staging/i.test(String(projectId)) && !/prod/i.test(String(projectId))) return true;
  return !!allow && resolveProjectId(allow) === projectId;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  if (!projectAllowed(projectId, args.allow)) throw new Error(`Refusing ${projectId}: reconcile-vault-services.js runs on staging only (add --allow-project ${projectId} to run it there on purpose).`);
  const admin = require("firebase-admin");
  admin.initializeApp({ projectId });
  const S = require("../lib/services").build({ adminLogEntry: async () => ({}) });
  const out = await S.reconcileVault({ apply: args.apply });
  console.log(`${projectId} · ${out.games} Vault games (${out.visible} visible) · ${out.items} vaultGame items${args.apply ? "" : " · dry run (add --apply)"}`);
  const by = (k) => out.changes.filter((c) => c.change === k);
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`  ${pad("change", 8)} ${pad("count", 6)} ids`);
  for (const k of ["create", "revive", "rename", "retire"]) {
    const list = by(k);
    console.log(`  ${pad(k, 8)} ${pad(list.length, 6)} ${list.map((c) => c.id + (c.from ? ` ("${c.from}" → "${c.name}")` : "")).join(", ") || "-"}`);
  }
  if (out.kept.length) console.log(`  kept retired by an admin (${out.kept.length}): ${out.kept.map((k) => k.id).join(", ")}`);
  console.log(out.applied ? "  applied: items written, summary/main and public/services rebuilt." : out.changes.length ? "  nothing written." : "  nothing to do.");
}

if (require.main === module) main().catch((err) => { console.error(String((err && err.message) || err)); process.exit(1); });
module.exports = { projectAllowed };
