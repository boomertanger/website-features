#!/usr/bin/env node
// functions/scripts/backfill-service-verdicts.js: fills sites/boomertanger/public/serviceVerdicts (docs/specs/game-page-votes.md §3) once, from the
// vaultGame items' rating totals (lib/services backfillVerdicts): an entry { love, like, nope } for every Vault game with 3+ counted member ratings
// (owner and admin ratings are already left out of the totals), none below that. After this, only onServiceRatingWritten keeps it up to date.
// Prints what it would add, update and remove. Dry run unless --apply. STAGING ONLY. Application Default Credentials.
//   node functions/scripts/backfill-service-verdicts.js            # dry run on staging
//   node functions/scripts/backfill-service-verdicts.js --apply    # write it
const { stagingOnly } = require("./sync-services");

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
  try { const rc = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", "..", ".firebaserc"), "utf8")); return rc.projects?.[nameOrId] ?? nameOrId; }
  catch { return nameOrId; }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  stagingOnly(projectId, args.project);
  const admin = require("firebase-admin");
  admin.initializeApp({ projectId });
  const S = require("../lib/services").build({ adminLogEntry: async () => ({}) });
  const out = await S.backfillVerdicts({ apply: args.apply });
  console.log(`${projectId} · ${out.items} vaultGame items · ${Object.keys(out.entries).length} with 3+ member ratings${args.apply ? "" : " · dry run (add --apply)"}`);
  const row = (k, ids) => console.log(`  ${k.padEnd(7)} ${String(ids.length).padEnd(4)} ${ids.map((id) => `${id} ${JSON.stringify(out.entries[id] || null)}`).join(", ") || "-"}`);
  row("add", out.add); row("update", out.update); row("remove", out.remove);
  console.log(out.applied ? "  applied: public/serviceVerdicts written." : out.add.length + out.update.length + out.remove.length ? "  nothing written." : "  nothing to do.");
}

if (require.main === module) main().catch((err) => { console.error(String((err && err.message) || err)); process.exit(1); });
