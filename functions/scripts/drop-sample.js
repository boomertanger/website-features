#!/usr/bin/env node
// functions/scripts/drop-sample.js: tries a live drop on staging (docs/specs/live-drops.md; workstream 7 part 2), the same way cue-sample.js works:
// Application Default Credentials and the Admin SDK, STAGING ONLY (it refuses any production project, even named deliberately).
//
// It runs the real drop code (lib/live/drops.js: dropOpen, dropAdjust, claimDrop, the sweep) here on your machine against staging's Firestore,
// acting as the uid you name (no ID token: the same checks run as for a signed-in caller, so the uid must really be the owner, the live Captain or
// a member with a handle). It writes the same documents the deployed functions would. The deployed dropSweep also runs every minute on staging.
// Grants are real badges on staging (ledger ref "drop-<dropId>").
//
// Needs a live stream on staging (Start on /live/control, or a test stream) and, for a Captain, someone clocked in as Captain.
// Usage (from the repo root or functions/):
//   node functions/scripts/drop-sample.js --status                                            # the live stream, its open drop, the counts
//   node functions/scripts/drop-sample.js --open jump-scare-witness [--minutes 3] [--cap 10] [--until-end] [--rush] --as <uid> --apply
//   node functions/scripts/drop-sample.js --claim <dropId> --as <uid> --apply
//   node functions/scripts/drop-sample.js --adjust <dropId> plus1|plus5|close --as <uid> --apply
//   node functions/scripts/drop-sample.js --sweep --apply                                     # one sweep now (instead of waiting a minute)
//   --stream <id>  a stream other than the live one;  --project <name|id>  default staging
// Without --apply it only says what it would do.
const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const a = { project: "staging", apply: false, as: null, stream: null, minutes: undefined, cap: undefined, untilEnd: false, rush: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--project") a.project = argv[++i];
    else if (x === "--stream") a.stream = argv[++i];
    else if (x === "--as") a.as = argv[++i];
    else if (x === "--apply") a.apply = true;
    else if (x === "--status") a.cmd = "status";
    else if (x === "--sweep") a.cmd = "sweep";
    else if (x === "--open") { a.cmd = "open"; a.badgeId = argv[++i]; }
    else if (x === "--claim") { a.cmd = "claim"; a.dropId = argv[++i]; }
    else if (x === "--adjust") { a.cmd = "adjust"; a.dropId = argv[++i]; a.action = argv[++i]; }
    else if (x === "--minutes") a.minutes = Number(argv[++i]);
    else if (x === "--cap") a.cap = Number(argv[++i]);
    else if (x === "--until-end") a.untilEnd = true;
    else if (x === "--rush") a.rush = true;
    else throw new Error(`Unknown argument: ${x}`);
  }
  if (!a.cmd) throw new Error("Say what to do: --status, --open, --claim, --adjust or --sweep.");
  if (["open", "claim", "adjust"].includes(a.cmd) && !a.as) throw new Error("Say who acts: --as <uid>.");
  return a;
}
function resolveProjectId(nameOrId) {
  try { const rc = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", ".firebaserc"), "utf8")); return rc.projects?.[nameOrId] ?? nameOrId; }
  catch { return nameOrId; }
}
/** The guard: anything that looks like production is refused, whatever the flags say. */
function stagingOnly(projectId, name) {
  if (/prod/i.test(String(projectId)) || /prod/i.test(String(name))) throw new Error(`Refusing ${projectId}: drop-sample.js runs on staging only.`);
  if (!/staging/i.test(String(projectId))) throw new Error(`Refusing ${projectId}: drop-sample.js runs on staging only (the project id must name staging).`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  stagingOnly(projectId, args.project);
  const admin = require("firebase-admin");
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const adminLogEntry = async (_db, f) => ({ ...f, actorUid: f.actorUid ?? null, actorName: f.actorName || "drop-sample.js", reason: f.reason || "", createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 365 * 24 * 3600000) });
  const live = require("../lib/live").build({ adminLogEntry, enqueue: async () => { throw new Error("no Cloud Tasks from a script"); } });   // flushes inline
  const drops = live.hooks.drops, ctx = live.hooks.ctx;
  const stream = args.stream ? await ctx.loadStream(args.stream) : await ctx.liveStream();
  console.log(`${projectId} · stream ${stream ? `${stream.id} (${stream.state})` : "none live"}${args.apply ? "" : " · dry run (add --apply)"}`);
  const req = (data) => ({ auth: { uid: args.as, token: {} }, data });

  if (args.cmd === "status") {
    if (!stream) return;
    const ptr = (await ctx.control(stream.id)).drop || null;
    const duty = (await db.doc(`sites/boomertanger/streams/${stream.id}/private/duty`).get()).data() || {};
    console.log(`  Captain now: ${duty.captainNow ? `@${duty.captainNow.handle} (${duty.captainNow.uid})` : "nobody clocked in"}`);
    console.log(`  pointer: ${ptr ? `${ptr.id} · ${ptr.state} · ${ptr.mode}` : "none"}`);
    if (ptr) {
      const d = (await db.doc(`sites/boomertanger/drops/${ptr.id}`).get()).data() || {};
      console.log(`  drop: status ${d.status} · claims so far ${await drops.countOf(ptr.id)} · closedBy ${d.closedBy || "-"} · winners ${JSON.stringify((d.winnersOut || []).map((w) => w.handle))}`);
    }
    const pub = (await db.doc("sites/boomertanger/public/live").get()).data() || {};
    console.log(`  public/live.drop: ${JSON.stringify(pub.drop || null)}`);
    return;
  }
  if (!args.apply) { console.log(`  would ${args.cmd}${args.badgeId ? ` ${args.badgeId}` : ""}${args.dropId ? ` ${args.dropId}` : ""}${args.action ? ` ${args.action}` : ""}${args.as ? ` as ${args.as}` : ""}`); return; }
  let out;
  if (args.cmd === "open") out = await drops.ops.dropOpen(req({ badgeId: args.badgeId, streamId: stream ? stream.id : undefined, minutes: args.minutes, cap: args.cap, untilEnd: args.untilEnd || undefined, source: args.rush ? "rush" : undefined }));
  else if (args.cmd === "claim") out = await drops.ops.claimDrop(req({ dropId: args.dropId }));
  else if (args.cmd === "adjust") out = await drops.ops.dropAdjust(req({ dropId: args.dropId, action: args.action }));
  else if (args.cmd === "sweep") out = await drops.sweep();
  console.log("  " + JSON.stringify(out));
}

if (require.main === module) main().catch((err) => { console.error(String((err && err.details && err.details.reason) ? `${err.details.reason}: ${err.message}` : (err && err.message) || err)); process.exit(1); });
module.exports = { stagingOnly };
