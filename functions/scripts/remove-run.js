#!/usr/bin/env node
// functions/scripts/remove-run.js
//
// Pulls a cheated run off the Boom Arcade boards (docs/specs/arcade-step1.md §5
// "Scripts"):
//   - marks the run: checks.ok false, reason "admin: <reason>", onBoard false
//   - recomputes that member's best (bests/{uid}_{device}) from their other passing
//     runs (runs are kept 180 days, so older ones may be gone)
//   - rebuilds the affected board rows: the all-time board from every member's best,
//     the current week's board the same way, and an older week's board by removing
//     the member's row and putting back their best other run from that week
//   - writes an adminLog entry (feature "arcade", action "removeRun")
// The run and vote counts stay as they are.
//
// Needs Application Default Credentials:
//   gcloud auth application-default login
//
// Usage (from the repo root or functions/):
//   node functions/scripts/remove-run.js --project staging --game tapTheSplat --version v1 --run <runId> --reason "scripted"           # dry run
//   node functions/scripts/remove-run.js --project staging --game tapTheSplat --version v1 --run <runId> --reason "scripted" --apply   # write it
// --run takes the run's document id, or the full "gameId/version/docId" the game uses.

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const L = require("../lib/arcade/logic");

const SITE_ID = "boomertanger";
const ACTOR = { uid: null, name: "remove-run script" };
const DAY = 24 * 60 * 60 * 1000;

function parseArgs(argv) {
  const args = { project: null, game: null, version: null, run: null, reason: null, apply: false };
  const take = (flag, i) => { if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`${flag} needs a value.`); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const [flag, inline] = a.includes("=") ? a.split(/=(.*)/s) : [a, null];
    if (flag === "--apply") { args.apply = true; continue; }
    if (!["--project", "--game", "--version", "--run", "--reason"].includes(flag)) throw new Error(`Unknown argument: ${a}`);
    args[flag.slice(2)] = inline ?? take(flag, i);
    if (inline === null) i++;
  }
  for (const k of ["project", "game", "version", "run", "reason"]) if (!args[k]) throw new Error(`--${k} is required.`);
  if (args.run.includes("/")) args.run = args.run.split("/").pop();
  return args;
}

function resolveProjectId(nameOrId) {
  try {
    const rc = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", ".firebaserc"), "utf8"));
    return rc.projects?.[nameOrId] ?? nameOrId;
  } catch {
    return nameOrId;
  }
}

// Same retention rule as functions/index.js (adminSettings/log.retentionDays, default 365).
async function expireAt(db) {
  let days = 365;
  const configured = (await db.doc("adminSettings/log").get().catch(() => null))?.get("retentionDays");
  if (Number.isFinite(configured) && configured > 0) days = configured;
  return admin.firestore.Timestamp.fromMillis(Date.now() + days * DAY);
}

const fmt = (e) => (e ? `${e.secs}s (${e.runId})` : "none");
const entryOf = (runId, r) => ({ secs: r.secs, penalties: r.penalties ?? 0, runId, at: r.finishedAt });
/** The fastest (then earliest) of a list of { id, data } runs, as a best entry. */
function fastest(runs, gameId, version) {
  const list = runs.map(({ id, data }) => ({ ...entryOf(L.runPath(gameId, version, id), data) })).sort(L.compareRows);
  return list[0] || null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const vRef = db.doc(`sites/${SITE_ID}/games/${args.game}/versions/${args.version}`);
  const runRef = vRef.collection("runs").doc(args.run);
  const [vSnap, runSnap] = await Promise.all([vRef.get(), runRef.get()]);
  if (!vSnap.exists) throw new Error(`No version doc at ${vRef.path}.`);
  if (!runSnap.exists) throw new Error(`No run at ${runRef.path}.`);
  const run = runSnap.data();
  const epoch = vSnap.get("boardEpoch") || 1;
  const reason = `admin: ${args.reason}`;
  console.log(`Project: ${projectId}`);
  console.log(`Run: ${runRef.path}`);
  console.log(`  ${run.result} · ${run.secs}s · ${run.device} · ${run.uid ? `member ${run.uid}` : "visitor"} · checks ${run.checks?.ok ? "ok" : `failed (${(run.checks?.reasons || []).join(", ")})`} · onBoard ${!!run.onBoard}`);
  if ((run.checks?.reasons || []).includes(reason)) console.log("  (already removed with this reason; the bests and boards are rebuilt again)");

  const writes = [];   // [ref, data, "set" | "update" | "delete"]
  writes.push([runRef, { "checks.ok": false, "checks.reasons": admin.firestore.FieldValue.arrayUnion(reason), onBoard: false }, "update"]);

  let summary = { best: null };
  if (run.uid && run.device) {
    const uid = run.uid, device = run.device;
    const bestRef = vRef.collection("bests").doc(`${uid}_${device}`);
    const bestSnap = await bestRef.get();
    const best = bestSnap.exists ? bestSnap.data() : null;

    // The member's other passing wins on this board epoch.
    const mine = await vRef.collection("runs").where("uid", "==", uid).where("device", "==", device).get();
    const others = mine.docs
      .filter((d) => d.id !== args.run && d.get("result") === "win" && d.get("checks.ok") === true && d.get("epoch") === epoch && typeof d.get("secs") === "number" && d.get("finishedAt"))
      .map((d) => ({ id: d.id, data: d.data() }));
    const runWeek = run.finishedAt ? L.weekKey(run.finishedAt) : null;
    const currentWeek = L.weekKey(Date.now());
    const weekOf = (key) => fastest(others.filter((o) => L.weekKey(o.data.finishedAt) === key), args.game, args.version);

    const allTime = fastest(others, args.game, args.version);
    const weekKey = best?.week?.key || runWeek;
    const week = weekKey ? weekOf(weekKey) : null;
    const nextBest = allTime ? {
      uid, device, epoch, handle: best?.handle ?? null, displayName: best?.displayName ?? null,
      allTime, week: week ? { key: weekKey, ...week } : null,
    } : null;
    console.log(`\nBest ${bestRef.path}`);
    console.log(`  all-time: ${fmt(best?.allTime)} -> ${fmt(nextBest?.allTime)}`);
    console.log(`  week ${weekKey || "-"}: ${fmt(best?.week)} -> ${fmt(nextBest?.week)}`);
    writes.push(nextBest ? [bestRef, nextBest, "set"] : [bestRef, null, "delete"]);
    summary = { best: { before: best ? { allTime: best.allTime ?? null, week: best.week ?? null } : null, after: nextBest ? { allTime: nextBest.allTime, week: nextBest.week } : null } };

    const names = { handle: best?.handle ?? null, displayName: best?.displayName ?? null };
    const rowOf = (e) => ({ uid, ...names, secs: e.secs, penalties: e.penalties, at: e.at });
    // Every member's best for a board, with this member's replaced by the new one.
    async function fromBests(field, where) {
      const snap = await vRef.collection("bests").where("device", "==", device).where(where.field, "==", where.value).orderBy(`${field}.secs`).limit(L.BOARD_SIZE + 50).get();
      const entries = snap.docs.filter((d) => d.get("uid") !== uid).map((d) => ({ uid: d.get("uid"), handle: d.get("handle") ?? null, displayName: d.get("displayName") ?? null, secs: d.get(`${field}.secs`), penalties: d.get(`${field}.penalties`) ?? 0, at: d.get(`${field}.at`) }));
      const own = field === "allTime" ? nextBest?.allTime : (nextBest?.week?.key === where.value ? nextBest.week : null);
      if (own) entries.push(rowOf(own));
      return L.buildRows(entries);
    }

    const boards = vRef.collection("boards");
    const plan = [["all", () => fromBests("allTime", { field: "epoch", value: epoch })]];
    for (const key of new Set([runWeek, weekKey].filter(Boolean))) {
      plan.push([key, key === currentWeek
        ? () => fromBests("week", { field: "week.key", value: key })
        : async (rows) => { const w = weekOf(key); const kept = L.removeRow(rows, uid); return w ? L.insertRow(kept, rowOf(w)).rows : kept; }]);
    }
    for (const [period, build] of plan) {
      const ref = boards.doc(L.boardId(epoch, device, period));
      const snap = await ref.get();
      const before = snap.get("rows") || [];
      const rows = await build(before);
      const b = L.rankOf(before, uid), a = L.rankOf(rows, uid);
      console.log(`\nBoard ${ref.path}: ${before.length} -> ${rows.length} rows; this member #${b ?? "-"} -> #${a ?? "-"}`);
      if (JSON.stringify(before) !== JSON.stringify(rows)) {
        writes.push([ref, { period, device, epoch, rows, updatedAt: admin.firestore.Timestamp.now() }, "set"]);
      }
    }
  } else {
    console.log("\nA visitor's run is never on a board: only the run is marked.");
  }

  if (!args.apply) {
    console.log(`\nDry run: nothing written (${writes.length} write${writes.length === 1 ? "" : "s"} planned, plus the adminLog entry). Add --apply to write it.`);
    return;
  }
  const batch = db.batch();
  for (const [ref, data, op] of writes) {
    if (op === "delete") batch.delete(ref);
    else if (op === "update") batch.update(ref, data);
    else batch.set(ref, data);
  }
  batch.set(db.collection("adminLog").doc(), {
    feature: "arcade", action: "removeRun",
    itemPath: runRef.path, itemTitle: run.uid ? `${run.uid} ${run.device} ${run.secs}s` : `visitor ${run.secs}s`,
    actorUid: ACTOR.uid, actorName: ACTOR.name, reason: args.reason,
    details: summary,
    createdAt: admin.firestore.FieldValue.serverTimestamp(), expireAt: await expireAt(db),
  });
  await batch.commit();
  console.log(`\nWritten (${writes.length} write${writes.length === 1 ? "" : "s"} + adminLog).`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
