#!/usr/bin/env node
// functions/scripts/seed-staff-doc.js
//
// Loads a staff-only document (docs/specs/game-vault-how-it-works.md §3) from a local Markdown file into
// sites/{siteId}/staffDocs/{doc}, shaped { sections: [{ title, body }], updatedAt }. Mods and admins read
// it (firestore.rules); no client writes it. The repo is public, so the Markdown lives outside git, in
// functions/scripts/private/ (gitignored). The format is shared/staff-doc.js's: "# " headings start
// sections; bodies keep paragraphs, "- " bullets, **bold** and [A]-style keys; anything else is refused.
//
// Staging unless --project production is given explicitly. Dry run by default; --apply writes (it
// replaces the whole document). Needs Application Default Credentials (gcloud auth application-default login).
//
//   node functions/scripts/seed-staff-doc.js --doc vault-guide --file functions/scripts/private/vault-guide.md
//   node functions/scripts/seed-staff-doc.js --doc vault-guide --file functions/scripts/private/vault-guide.md --apply

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const SITE_ID = "boomertanger";

function parseArgs(argv) {
  const args = { project: "staging", apply: false, doc: null, file: null };
  for (let i = 0; i < argv.length; i++) {
    const [k, inline] = argv[i].split("=");
    const val = () => (inline != null ? inline : argv[++i]);
    if (k === "--project") args.project = val();
    else if (k === "--doc") args.doc = val();
    else if (k === "--file") args.file = val();
    else if (k === "--apply") args.apply = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!args.doc || !/^[a-z0-9-]{1,40}$/.test(args.doc)) throw new Error("--doc <id> is required (lowercase letters, digits and dashes).");
  if (!args.file) throw new Error("--file <markdown> is required.");
  return args;
}
function resolveProjectId(nameOrId) {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", ".firebaserc"), "utf8")).projects?.[nameOrId] ?? nameOrId; } catch { return nameOrId; }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "shared", "staff-doc.js"), "utf8");
  const { parseDoc, toBlocks } = await import(`data:text/javascript;base64,${Buffer.from(src).toString("base64")}`);
  const { sections } = parseDoc(fs.readFileSync(args.file, "utf8"));

  console.log(`Project: ${projectId}${args.apply ? "" : " (dry run: nothing is written)"}`);
  console.log(`Doc: sites/${SITE_ID}/staffDocs/${args.doc}, from ${args.file}\n`);
  for (const s of sections) {
    console.log(`# ${s.title}`);
    for (const b of toBlocks(s.body)) {
      const line = (runs) => runs.map((r) => (r.t === "b" ? `**${r.v}**` : r.t === "kbd" ? `[${r.v}]` : r.v)).join("");
      if (b.type === "p") console.log(`  ${line(b.runs)}`);
      else b.items.forEach((it) => console.log(`  - ${line(it)}`));
    }
    console.log("");
  }
  console.log(`${sections.length} section(s), ${sections.reduce((n, s) => n + s.body.length, 0)} characters.`);
  if (!args.apply) { console.log("Dry run: nothing written. Add --apply to write it."); return; }

  admin.initializeApp({ projectId });
  await admin.firestore().doc(`sites/${SITE_ID}/staffDocs/${args.doc}`).set({ sections, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  console.log(`Written: sites/${SITE_ID}/staffDocs/${args.doc}`);
}

main().catch((err) => { console.error(err.message || err); process.exit(1); });
