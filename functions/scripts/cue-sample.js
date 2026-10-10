#!/usr/bin/env node
// functions/scripts/cue-sample.js: a sample crew-hosted Chat Games run for checking the Mod Deck's cue slot (docs/specs/chat-games.md §9; part 7).
// STAGING ONLY: it refuses any production project, even named deliberately.
//
// It writes, on the stream that's live (or --stream <id>):
//   sites/boomertanger/chatGames/main/runs/cue-sample-{streamId}           formatId "cue-sample", crewHosted, state "open" (active), never on public/live
//   sites/boomertanger/chatGames/main/runs/cue-sample-{streamId}/cues/*    one pending cue per room (Twitch, YouTube, YouTube vertical, TikTok, site)
//   streams/{streamId}/private/duty.chatGames.activeRunIds = [that run]    so the Deck's cue slot finds it (the duty doc must exist: the stream is live)
// In the Deck, a Room Lead (or the Captain) taps Posted, then Done: chatGameCue checks who, and the first Posted pays +5 Gears once under the key
// chatGame:{runId}:{uid} (crew/main/gears). --status prints every cue's status and the Gears entries for the run.
// --clean removes the run, its cues and the pointer (activeRunIds, and private/control.chatGame if it ever points at the run). Gears already paid stay:
// they're the tester's, like any other Gears.
//
// Usage (from the repo root or functions/; Application Default Credentials):
//   node functions/scripts/cue-sample.js                       # dry run: which stream, what would be written
//   node functions/scripts/cue-sample.js --apply               # create it on staging's live stream
//   node functions/scripts/cue-sample.js --status              # cues and Gears so far
//   node functions/scripts/cue-sample.js --clean --apply       # remove it
//   --stream <id>  use that stream instead of the live one;  --project <name|id>  default staging
const fs = require("fs");
const path = require("path");

const SITE = "sites/boomertanger";
const BASE = `${SITE}/chatGames/main`;
const ROOMS = [["twitch", "Twitch"], ["ytLandscape", "YouTube"], ["ytVertical", "YouTube vertical"], ["tiktok", "TikTok"], ["site", "the site"]];

function parseArgs(argv) {
  const a = { project: "staging", apply: false, clean: false, status: false, stream: null };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--project") a.project = argv[++i];
    else if (x.startsWith("--project=")) a.project = x.slice(10);
    else if (x === "--stream") a.stream = argv[++i];
    else if (x.startsWith("--stream=")) a.stream = x.slice(9);
    else if (x === "--apply") a.apply = true;
    else if (x === "--clean") a.clean = true;
    else if (x === "--status") a.status = true;
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
  if (/prod/i.test(String(projectId)) || /prod/i.test(String(name))) throw new Error(`Refusing ${projectId}: cue-sample.js runs on staging only.`);
  if (!/staging/i.test(String(projectId))) throw new Error(`Refusing ${projectId}: cue-sample.js runs on staging only (the project id must name staging).`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  stagingOnly(projectId, args.project);
  const admin = require("firebase-admin");
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const { Timestamp, FieldPath } = admin.firestore;

  let streamId = args.stream;
  if (!streamId) {
    const live = (await db.collection(`${SITE}/streams`).where("state", "==", "live").get()).docs;
    if (!live.length && !args.clean && !args.status) throw new Error("No stream is live on staging. Go live first (the Deck's cue slot only shows while live), or pass --stream <id>.");
    streamId = live[0] ? live[0].id : null;
  }
  if (!streamId && (args.clean || args.status)) {
    const any = (await db.collection(`${BASE}/runs`).where("formatId", "==", "cue-sample").get()).docs;
    if (!any.length) { console.log("No cue-sample run found."); return; }
    streamId = any[0].get("streamId");
  }
  const runId = `cue-sample-${streamId}`;
  const runRef = db.doc(`${BASE}/runs/${runId}`), dutyRef = db.doc(`${SITE}/streams/${streamId}/private/duty`), ctlRef = db.doc(`${SITE}/streams/${streamId}/private/control`);
  console.log(`${projectId} · stream ${streamId} · run ${runId}${args.apply ? "" : args.status ? "" : " · dry run (add --apply to write)"}`);

  if (args.status) {
    const run = await runRef.get();
    if (!run.exists) { console.log("  no run"); return; }
    console.log(`  run: state ${run.get("state")}`);
    for (const c of (await runRef.collection("cues").orderBy("order").get()).docs) console.log(`  cue ${c.id} · ${c.get("room")} · ${c.get("status")}${c.get("postedByHandle") ? ` · posted by @${c.get("postedByHandle")}` : ""}${c.get("doneByHandle") ? ` · done by @${c.get("doneByHandle")}` : ""}`);
    const prefix = `chatGame:${runId}:`;
    const gears = (await db.collection(`${SITE}/crew/main/gears`).where(FieldPath.documentId(), ">=", prefix).where(FieldPath.documentId(), "<", `${prefix}`).get()).docs;
    console.log(`  Gears entries under ${prefix}{uid}: ${gears.length}${gears.map((g) => `\n    ${g.id} · ${g.get("amount")}`).join("")}`);
    const ids = ((await dutyRef.get()).data() || {}).chatGames?.activeRunIds || [];
    console.log(`  private/duty.chatGames.activeRunIds: ${JSON.stringify(ids)}`);
    return;
  }

  if (args.clean) {
    const cues = (await runRef.collection("cues").get()).docs;
    const duty = (await dutyRef.get()).data() || null, ctl = (await ctlRef.get()).data() || {};
    const ids = duty?.chatGames?.activeRunIds || [];
    console.log(`  delete ${cues.length} cues and the run; activeRunIds ${JSON.stringify(ids)} → ${JSON.stringify(ids.filter((x) => x !== runId))}${ctl.chatGame?.runId === runId ? "; clear private/control.chatGame" : ""}`);
    if (!args.apply) return;
    for (const c of cues) await c.ref.delete();
    await runRef.delete();
    if (duty && ids.includes(runId)) await dutyRef.update({ "chatGames.activeRunIds": ids.filter((x) => x !== runId) });
    if (ctl.chatGame?.runId === runId) await ctlRef.set({ chatGame: null }, { merge: true });
    console.log("  cleaned");
    return;
  }

  const stream = (await db.doc(`${SITE}/streams/${streamId}`).get()).data();
  if (!stream) throw new Error(`No stream ${streamId}.`);
  if (!(await dutyRef.get()).exists) throw new Error(`streams/${streamId}/private/duty doesn't exist yet: go live (Start) first.`);
  const now = Date.now();
  const run = { formatId: "cue-sample", streamId, state: "open", round: 1, title: "Cue sample", crewHosted: true, env: "staging", startedBy: "cue-sample.js", startedByHandle: null,
    startedAt: Timestamp.fromMillis(now), openedAt: Timestamp.fromMillis(now), updatedAt: Timestamp.fromMillis(now), closesAt: null, result: null, sample: true };
  const cues = ROOMS.map(([room, name], i) => ({ room, order: i + 1, kicker: "Cue sample", text: `Type 1 or 2 in chat! (a sample cue for ${name}, from cue-sample.js)`, dueAt: Timestamp.fromMillis(now + 5 * 60000),
    status: "pending", postedBy: null, postedAt: null, doneBy: null, doneAt: null }));
  console.log(`  write the run (state open, crewHosted) and ${cues.length} cues (${ROOMS.map((r) => r[0]).join(", ")}); activeRunIds = ["${runId}"]`);
  if (!args.apply) return;
  await runRef.set(run);
  for (const [i, c] of cues.entries()) await runRef.collection("cues").doc(`c${i + 1}-${c.room}`).set(c);
  await dutyRef.update({ "chatGames.activeRunIds": [runId] });
  console.log("  created. Open the Mod Deck as a Room Lead (clocked in) or the Captain: the cue card shows Posted, then Done. Then run --status, and --clean --apply.");
}

if (require.main === module) main().catch((err) => { console.error(String((err && err.message) || err)); process.exit(1); });
module.exports = { stagingOnly };
