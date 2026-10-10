#!/usr/bin/env node
// functions/scripts/seed-tech-stack.js: loads the Tech Stack's Fan Club text into Firestore (docs/specs/tech-stack.md §6).
// STAGING ONLY for now: it refuses any production project, even named deliberately.
//
// Reads functions/scripts/data/tech-stack-member.json (gitignored while the repo is public; start from tech-stack-member.sample.json) and
// writes ONE doc, sites/boomertanger/memberContent/tech-stack: devices.{id} (specs, whyPicked, wouldChange), cables.{id}.port, tours.{id}
// (narration per stop), mixer (inputs, outputs, sockets), history[] and updatedAt. The doc is replaced as a whole, so the file is the source.
// Before writing it checks the file against site/src/data/tech-stack.json: every device, cable and tour key must exist there, and each tour's
// narration needs one line per stop. Without --apply it's a dry run (what would be written; the text itself isn't printed).
//
// Usage (from the repo root or functions/; Application Default Credentials):
//   node functions/scripts/seed-tech-stack.js                 # dry run
//   node functions/scripts/seed-tech-stack.js --apply         # write it on staging
//   --file <path>  another member file;  --project <name|id>  default staging
const fs = require("fs");
const path = require("path");

const DOC = "sites/boomertanger/memberContent/tech-stack";

function parseArgs(argv) {
  const a = { project: "staging", apply: false, file: path.join(__dirname, "data", "tech-stack-member.json") };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--project") a.project = argv[++i];
    else if (x.startsWith("--project=")) a.project = x.slice(10);
    else if (x === "--file") a.file = argv[++i];
    else if (x.startsWith("--file=")) a.file = x.slice(7);
    else if (x === "--apply") a.apply = true;
    else throw new Error(`Unknown argument: ${x}`);
  }
  return a;
}
function resolveProjectId(nameOrId) {
  try { const rc = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", ".firebaserc"), "utf8")); return rc.projects?.[nameOrId] ?? nameOrId; }
  catch { return nameOrId; }
}
/** The guard: anything that looks like production is refused, whatever the flags say. */
function stagingOnly(projectId, name) {
  if (/prod/i.test(String(projectId)) || /prod/i.test(String(name))) throw new Error(`Refusing ${projectId}: seed-tech-stack.js runs on staging only.`);
  if (!/staging/i.test(String(projectId))) throw new Error(`Refusing ${projectId}: seed-tech-stack.js runs on staging only (the project id must name staging).`);
}

/** The doc to write, or a list of problems. pub = the public tech-stack.json. */
function buildDoc(member, pub) {
  const problems = [];
  const devIds = new Set([...pub.devices.map((d) => d.id), ...pub.gear.map((g) => g.id)]);
  const cabIds = new Set(pub.cables.map((c) => c.id));
  const tours = Object.fromEntries(pub.tours.map((t) => [t.id, t]));
  const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
  const str = (v) => typeof v === "string";
  const devices = {}, cables = {}, tourText = {};
  for (const [id, d] of Object.entries(member.devices || {})) {
    if (!devIds.has(id)) { problems.push(`devices.${id}: not a device or gear id in tech-stack.json`); continue; }
    if (!isObj(d.specs) || !Object.values(d.specs).every(str)) problems.push(`devices.${id}.specs must be { label: text }`);
    if (!str(d.whyPicked) || !str(d.wouldChange)) problems.push(`devices.${id}: whyPicked and wouldChange must be text`);
    devices[id] = { specs: d.specs || {}, whyPicked: d.whyPicked || "", wouldChange: d.wouldChange || "" };
  }
  for (const [id, c] of Object.entries(member.cables || {})) {
    if (!cabIds.has(id)) { problems.push(`cables.${id}: not a cable id in tech-stack.json`); continue; }
    if (!str(c.port)) problems.push(`cables.${id}.port must be text`);
    cables[id] = { port: c.port || "" };
  }
  for (const [id, lines] of Object.entries(member.tours || {})) {
    if (!tours[id]) { problems.push(`tours.${id}: not a tour id in tech-stack.json`); continue; }
    if (!Array.isArray(lines) || !lines.every(str)) problems.push(`tours.${id} must be a list of lines`);
    else if (lines.length !== tours[id].steps.length) problems.push(`tours.${id}: ${lines.length} lines for ${tours[id].steps.length} stops`);
    tourText[id] = lines;
  }
  const row = (r, at) => { if (!r || !str(r.id) || !str(r.title) || !Array.isArray(r.sockets)) problems.push(`${at}: needs id, title and sockets`); return r; };
  const mixer = { inputs: (member.mixer?.inputs || []).map((r, i) => row(r, `mixer.inputs[${i}]`)), outputs: (member.mixer?.outputs || []).map((r, i) => row(r, `mixer.outputs[${i}]`)) };
  const history = (member.history || []).map((h, i) => { if (!str(h.date) || !str(h.text)) problems.push(`history[${i}]: needs date and text`); return { date: h.date, text: h.text, ...(h.sample ? { sample: true } : {}) }; });
  return { problems, doc: { devices, cables, tours: tourText, mixer, history } };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  stagingOnly(projectId, args.project);
  if (!fs.existsSync(args.file)) throw new Error(`No ${args.file}. Copy functions/scripts/data/tech-stack-member.sample.json to it first.`);
  const member = JSON.parse(fs.readFileSync(args.file, "utf8"));
  const pub = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "site", "src", "data", "tech-stack.json"), "utf8"));
  const { problems, doc } = buildDoc(member, pub);
  if (problems.length) throw new Error(`The member file doesn't match tech-stack.json:\n  - ${problems.join("\n  - ")}`);
  const samples = doc.history.filter((h) => h.sample).length;
  const emptyNotes = Object.entries(doc.devices).filter(([, d]) => !d.whyPicked).map(([id]) => id);
  const missing = [...pub.devices.map((d) => d.id), ...pub.gear.map((g) => g.id)].filter((id) => !doc.devices[id]);
  console.log(`${projectId} · ${DOC}${args.apply ? "" : " · dry run (add --apply to write)"}`);
  console.log(`  from ${path.relative(process.cwd(), args.file) || args.file}`);
  console.log(`  devices: ${Object.keys(doc.devices).length} (specs and notes)${missing.length ? `; none for ${missing.join(", ")}` : ""}`);
  if (emptyNotes.length) console.log(`    without a "why I picked it" note yet: ${emptyNotes.join(", ")}`);
  console.log(`  cables: ${Object.keys(doc.cables).length} ports of ${pub.cables.length}`);
  console.log(`  tours: ${Object.entries(doc.tours).map(([id, l]) => `${id} (${l.length} stops)`).join(", ")}`);
  console.log(`  mixer: ${doc.mixer.inputs.length} inputs, ${doc.mixer.outputs.length} outputs`);
  console.log(`  history: ${doc.history.length} entries${samples ? ` (${samples} still marked sample)` : ""}`);
  if (member._note) console.log(`  note in the file: ${member._note.slice(0, 120)}${member._note.length > 120 ? "…" : ""}`);
  if (!args.apply) return;
  const admin = require("firebase-admin");
  admin.initializeApp({ projectId });
  await admin.firestore().doc(DOC).set({ ...doc, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  console.log("  written.");
}

if (require.main === module) main().catch((err) => { console.error(String((err && err.message) || err)); process.exit(1); });
module.exports = { stagingOnly, buildDoc };
