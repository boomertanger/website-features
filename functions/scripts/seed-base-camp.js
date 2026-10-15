#!/usr/bin/env node
// functions/scripts/seed-base-camp.js: loads Base Camp's Fan Club text and the Pup Post address into Firestore (docs/specs/base-camp.md "Data" and
// "Pup Post mail card"). STAGING ONLY for now, like seed-tech-stack.js: it refuses any production project, even named deliberately (the launch
// checklist lifts that guard).
//
// Reads functions/scripts/data/base-camp-member.json (gitignored while the repo is public; start from base-camp-member.sample.json) and writes
// up to TWO docs, each replaced as a whole (the file is the source):
//   sites/boomertanger/memberContent/base-camp   sides { character, streamer, professional }, stops { island, engineering, gaming, rise, build }, beyond,
//                                                updatedAt
//   sites/boomertanger/memberContent/mail        to, lines[], updatedAt, from the file's "mail" block. Refused (and the rest still written) while
//                                                "to" or any line still contains REPLACE_ME: the owner types the address into the file himself.
// Nothing it prints contains the member text or the address: only doc ids, field names, counts and lengths.
// Without --apply it's a dry run.
//
// Usage (from the repo root or functions/; Application Default Credentials):
//   node functions/scripts/seed-base-camp.js                 # dry run
//   node functions/scripts/seed-base-camp.js --apply         # write it on staging
//   --file <path>  another member file;  --project <name|id>  default staging
const fs = require("fs");
const path = require("path");

const BASE = "sites/boomertanger/memberContent";
const SIDES = ["character", "streamer", "professional"];
const STOPS = ["island", "engineering", "gaming", "rise", "build"];   // build: stage 5 (Addendum 3); its {all-10000.value} / {all-10000.day} are filled on the page from public/climb
const MAX_TEXT = 4000, MAX_LINES = 6, MAX_LINE = 120;

function parseArgs(argv) {
  const a = { project: "staging", apply: false, file: path.join(__dirname, "data", "base-camp-member.json") };
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
  if (/prod/i.test(String(projectId)) || /prod/i.test(String(name))) throw new Error(`Refusing ${projectId}: seed-base-camp.js runs on staging only.`);
  if (!/staging/i.test(String(projectId))) throw new Error(`Refusing ${projectId}: seed-base-camp.js runs on staging only (the project id must name staging).`);
}

const str = (v) => typeof v === "string";
const placeholder = (s) => /REPLACE_ME/i.test(String(s));

/** The story doc (or problems). Every key must be there and be text; the text itself is never echoed. */
function buildStory(member) {
  const problems = [];
  const text = (v, at) => { if (!str(v) || !v.trim()) problems.push(`${at} must be text`); else if (v.length > MAX_TEXT) problems.push(`${at} is longer than ${MAX_TEXT} characters`); else if (placeholder(v)) problems.push(`${at} still says REPLACE_ME`); return str(v) ? v.trim() : ""; };
  const sides = {}, stops = {};
  for (const k of SIDES) sides[k] = text(member.sides?.[k], `sides.${k}`);
  for (const k of STOPS) stops[k] = text(member.stops?.[k], `stops.${k}`);
  for (const k of Object.keys(member.sides || {})) if (!SIDES.includes(k)) problems.push(`sides.${k}: not a card (${SIDES.join(", ")})`);
  for (const k of Object.keys(member.stops || {})) if (!STOPS.includes(k)) problems.push(`stops.${k}: not a stop (${STOPS.join(", ")})`);
  const beyond = text(member.beyond, "beyond");
  return { problems, doc: { sides, stops, beyond } };
}

/** The mail doc, or { held } with a reason that never contains the address. */
function buildMail(member) {
  const m = member.mail;
  if (!m || typeof m !== "object") return { held: "the file has no mail block" };
  const lines = Array.isArray(m.lines) ? m.lines : null;
  if (!str(m.to) || !m.to.trim()) return { held: "mail.to must be text" };
  if (!lines || !lines.length || !lines.every((l) => str(l) && l.trim())) return { held: "mail.lines must be a list of text lines" };
  if (lines.length > MAX_LINES || lines.some((l) => l.length > MAX_LINE)) return { held: `mail.lines: at most ${MAX_LINES} lines of ${MAX_LINE} characters` };
  const still = [placeholder(m.to) ? "to" : null, ...lines.map((l, i) => (placeholder(l) ? `lines[${i}]` : null))].filter(Boolean);
  if (still.length) return { held: `${still.join(", ")} still say${still.length === 1 ? "s" : ""} REPLACE_ME. Type the address into the mail block first` };
  return { doc: { to: m.to.trim(), lines: lines.map((l) => l.trim()) } };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  stagingOnly(projectId, args.project);
  if (!fs.existsSync(args.file)) throw new Error(`No ${args.file}. Copy functions/scripts/data/base-camp-member.sample.json to it first.`);
  const member = JSON.parse(fs.readFileSync(args.file, "utf8"));
  const story = buildStory(member);
  if (story.problems.length) throw new Error(`The member file isn't ready:\n  - ${story.problems.join("\n  - ")}`);
  const mail = buildMail(member);
  const len = (s) => `${s.length} chars`;
  console.log(`${projectId}${args.apply ? "" : " · dry run (add --apply to write)"}`);
  console.log(`  from ${path.relative(process.cwd(), args.file) || args.file}`);
  console.log(`  ${BASE}/base-camp`);
  console.log(`    sides: ${SIDES.map((k) => `${k} (${len(story.doc.sides[k])})`).join(", ")}`);
  console.log(`    stops: ${STOPS.map((k) => `${k} (${len(story.doc.stops[k])})`).join(", ")}`);
  console.log(`    beyond (${len(story.doc.beyond)}), updatedAt`);
  if (mail.doc) console.log(`  ${BASE}/mail\n    to, lines (${mail.doc.lines.length}), updatedAt`);
  else console.log(`  ${BASE}/mail: NOT written. ${mail.held}. The rest is written as usual.`);
  if (!args.apply) return;
  const admin = require("firebase-admin");
  admin.initializeApp({ projectId });
  const db = admin.firestore(), at = admin.firestore.FieldValue.serverTimestamp();
  await db.doc(`${BASE}/base-camp`).set({ ...story.doc, updatedAt: at });
  console.log(`  written: ${BASE}/base-camp`);
  if (mail.doc) { await db.doc(`${BASE}/mail`).set({ ...mail.doc, updatedAt: at }); console.log(`  written: ${BASE}/mail`); }
}

if (require.main === module) main().catch((err) => { console.error(String((err && err.message) || err)); process.exit(1); });
module.exports = { stagingOnly, buildStory, buildMail };
