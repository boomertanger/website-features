#!/usr/bin/env node
// functions/scripts/seed-chat-games.js
//
// Creates the Chat Games registry (docs/specs/chat-games.md §9, §10, §12; part 1):
//   sites/boomertanger/chatGames/main/formats/{questions|hot-seat|would-you-rather|predictions}
//        title, blurb, icon, crewHosted, needsPack, minLeads, order, rules (timers, XP); enabled: false until each part ships
//   sites/boomertanger/chatGames/main/packs/hot-seat-general    the empty "General" Hot Seat pack
// The registry fields are merged on every run; `enabled` is written only when a format doc is new (the owner's toggle on /crew/games is never
// undone), and a pack that exists is left alone (its cards are the owner's). Runs locally with the Admin SDK and Application Default Credentials.
//
// Usage (from the repo root or functions/):
//   node functions/scripts/seed-chat-games.js                                  # staging, dry run: show what would change
//   node functions/scripts/seed-chat-games.js --project staging --apply        # write it
//   node functions/scripts/seed-chat-games.js --project production --apply    # production only when named deliberately
const fs = require("fs");
const path = require("path");

const SITE_ID = "boomertanger";
const BASE = `sites/${SITE_ID}/chatGames/main`;
const FORMATS = [
  { id: "questions", title: "Questions", blurb: "Members ask, the chat votes, the Captain puts the best on stream.", icon: "❓", crewHosted: false, needsPack: false, minLeads: 0, order: 1, enabled: false,
    rules: { sessionMinutes: [5, 10, 15, 0], defaultMinutes: 10, xp: { answered: 15 } } },
  { id: "hot-seat", title: "Hot Seat", blurb: "Three members answer the same card; everyone votes for the best.", icon: "🔥", crewHosted: false, needsPack: true, minLeads: 0, order: 2, enabled: false,
    rules: { rounds: { min: 1, max: 5, default: 3 }, acceptSeconds: 15, answerSeconds: 60, answerMax: 140, voteSeconds: 30, xp: { winner: 25, player: 5 } } },
  { id: "would-you-rather", title: "Would You Rather", blurb: "Two options, one vote each, the split on stream.", icon: "⚖️", crewHosted: false, needsPack: false, minLeads: 0, order: 3, enabled: false,
    rules: { openSeconds: [30, 45, 60], defaultSeconds: 45, optionMax: 80, xp: { vote: 3 } } },
  { id: "predictions", title: "Predictions", blurb: "Call what happens next; a mod calls it, the Captain confirms.", icon: "🔮", crewHosted: false, needsPack: false, minLeads: 0, order: 4, enabled: false,
    rules: { answers: { min: 2, max: 4 }, questionMax: 120, answerMax: 40, maxOpenSeconds: 180, maxLocked: 3, xp: { lock: 3, correct: 10 } } },
];
const PACKS = [{ id: "hot-seat-general", formatId: "hot-seat", title: "General", vaultGameIds: [], status: "approved", cards: [] }];

function parseArgs(argv) {
  const args = { project: "staging", apply: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--project") args.project = argv[++i];
    else if (argv[i].startsWith("--project=")) args.project = argv[i].slice("--project=".length);
    else if (argv[i] === "--apply") args.apply = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!args.project) throw new Error("--project needs a value (staging or production).");
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
  if (/prod/i.test(projectId) && args.project !== "production") throw new Error(`Refusing ${projectId}: name production deliberately with --project production.`);
  const admin = require("firebase-admin");
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  console.log(`${args.apply ? "Writing" : "Dry run"}: ${projectId}`);
  const { FieldValue } = admin.firestore;
  for (const f of FORMATS) {
    const ref = db.doc(`${BASE}/formats/${f.id}`);
    const snap = await ref.get();
    const { id, enabled, ...fields } = f;
    const doc = snap.exists ? fields : { ...fields, enabled };
    const changed = !snap.exists || Object.entries(fields).some(([k, v]) => JSON.stringify(snap.get(k)) !== JSON.stringify(v));
    console.log(`  formats/${id}: ${!snap.exists ? "create (enabled: false)" : changed ? "update registry fields (enabled stays " + snap.get("enabled") + ")" : "unchanged"}`);
    if (args.apply && changed) await ref.set({ ...doc, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  for (const p of PACKS) {
    const ref = db.doc(`${BASE}/packs/${p.id}`);
    const snap = await ref.get();
    console.log(`  packs/${p.id}: ${snap.exists ? "exists, left alone" : "create"}`);
    if (args.apply && !snap.exists) { const { id, ...doc } = p; await ref.set({ ...doc, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }); }
  }
  console.log(args.apply ? "Done." : "Nothing written. Add --apply to write.");
}

module.exports = { FORMATS, PACKS, BASE };
if (require.main === module) main().catch((e) => { console.error(e.message || e); process.exit(1); });
