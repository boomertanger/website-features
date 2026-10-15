#!/usr/bin/env node
// functions/scripts/verdict-sample.js: gives a Vault game a sample members' verdict on staging (docs/specs/game-page-votes.md §3), so the C1 dial on
// /games/{slug} shows its ring. Application Default Credentials and the Admin SDK, STAGING ONLY (it refuses any production project, even named
// deliberately), like drop-sample.js.
//
// It writes three rating docs (services/main/ratings/vault-<slug>__sample-member-1..3: Love it, Like it, Not for me with a comment) in the same
// shape serviceRate stores, marked sample: true and countable (they stand in for three members). The deployed onServiceRatingWritten then does
// what it does for any rating: the item's totals, the summary row, my/{uid}, and the game's key in public/serviceVerdicts (3+ ratings).
// --clean deletes those three ratings (the trigger recounts and removes the key), then the sample uids' my/ docs and any Night Shift events the
// trigger recorded for them (badges are never paid: the sample uids have no profile). It only ever touches the uids sample-member-1..3, and
// refuses a rating doc for them that isn't its own (no sample: true). Real members' ratings are never read for writing or deleted.
// Usage (from the repo root or functions/):
//   node functions/scripts/verdict-sample.js --game duck-season              # dry run: what it would write
//   node functions/scripts/verdict-sample.js --game duck-season --apply      # write the three ratings, wait for the verdict entry
//   node functions/scripts/verdict-sample.js --game duck-season --clean --apply
//   --project <name|id>  default staging
const { stagingOnly } = require("./sync-services");

const SAMPLES = [["sample-member-1", "love", ""], ["sample-member-2", "like", ""], ["sample-member-3", "dislike", "Sample rating from verdict-sample.js: not for me."]];
const SITE = "sites/boomertanger", BASE = `${SITE}/services/main`;

function parseArgs(argv) {
  const a = { project: "staging", apply: false, clean: false, game: null };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--project") a.project = argv[++i];
    else if (x.startsWith("--project=")) a.project = x.slice(10);
    else if (x === "--game") a.game = argv[++i];
    else if (x.startsWith("--game=")) a.game = x.slice(7);
    else if (x === "--apply") a.apply = true;
    else if (x === "--clean") a.clean = true;
    else throw new Error(`Unknown argument: ${x}`);
  }
  if (!a.game || !/^[a-z0-9][a-z0-9-]{0,80}$/.test(a.game)) throw new Error("Name the game: --game <slug> (e.g. --game duck-season).");
  return a;
}
function resolveProjectId(nameOrId) {
  try { const rc = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", "..", ".firebaserc"), "utf8")); return rc.projects?.[nameOrId] ?? nameOrId; }
  catch { return nameOrId; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  stagingOnly(projectId, args.project);
  const admin = require("firebase-admin");
  admin.initializeApp({ projectId });
  const db = admin.firestore(), { FieldValue } = admin.firestore;
  const sid = `vault-${args.game}`;
  const item = await db.doc(`${BASE}/items/${sid}`).get();
  if (!item.exists || item.get("type") !== "vaultGame") throw new Error(`${sid} isn't a Vault game item in Service Hub (check the slug).`);
  const verdict = async () => ((await db.doc(`${SITE}/public/serviceVerdicts`).get()).data() || {})[sid];
  const ratingRef = (uid) => db.doc(`${BASE}/ratings/${sid}__${uid}`);
  // never touch a rating these uids hold that this script didn't write
  for (const [uid] of SAMPLES) {
    const r = await ratingRef(uid).get();
    if (r.exists && r.get("sample") !== true) throw new Error(`${r.ref.path} exists and isn't a sample rating: refusing.`);
  }
  console.log(`${projectId} · ${sid} ("${item.get("name")}", v${item.get("version")}) · verdict now: ${JSON.stringify((await verdict()) || null)}${args.apply ? "" : " · dry run (add --apply)"}`);

  if (args.clean) {
    console.log(`  delete: ${SAMPLES.map(([uid]) => `${sid}__${uid}`).join(", ")}; then my/${"{"}sample-member-1..3${"}"} and their Night Shift events`);
    if (!args.apply) return;
    for (const [uid] of SAMPLES) await ratingRef(uid).delete();
    let v; for (let i = 0; i < 30 && (v = await verdict()); i++) await sleep(2000);
    await sleep(5000);   // let the last trigger finish writing my/{uid} before removing it
    for (const [uid] of SAMPLES) await db.doc(`${BASE}/my/${uid}`).delete();
    const ev = await db.collection(`${SITE}/factory/main/events`).where("uid", "in", SAMPLES.map(([u]) => u)).get();
    for (const d of ev.docs) await d.ref.delete();
    console.log(`  deleted 3 ratings, 3 my/ docs and ${ev.size} Night Shift event(s). Verdict now: ${JSON.stringify((await verdict()) || null)}${v ? " (still there: check the onServiceRatingWritten logs)" : ""}`);
    return;
  }

  console.log(`  write: ${SAMPLES.map(([uid, value]) => `${uid} ${value}`).join(", ")} (countable, sample: true)`);
  if (!args.apply) return;
  const version = String(item.get("version") || "1.0");
  for (const [uid, value, comment] of SAMPLES) {
    const at = FieldValue.serverTimestamp();
    await ratingRef(uid).set({ serviceId: sid, uid, handle: uid, type: "vaultGame", value, comment, version, countable: true, hidden: false, history: [{ value, version, at: admin.firestore.Timestamp.now() }], sample: true, createdAt: at, updatedAt: at });
  }
  let v; for (let i = 0; i < 30 && !(v = await verdict()); i++) await sleep(2000);
  console.log(v ? `  verdict written by the trigger: ${JSON.stringify(v)}. Open /games/${args.game} (hard-refresh).` : "  no verdict entry after 60 s: check the onServiceRatingWritten logs.");
}

if (require.main === module) main().catch((err) => { console.error(String((err && err.message) || err)); process.exit(1); });
