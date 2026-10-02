#!/usr/bin/env node
// functions/scripts/make-test-stream.js
//
// Test helper for the stream object (docs/specs/stream-object.md §7). STAGING ONLY: it refuses
// any other project. Creates an ended, published test stream with segments for the Vault games
// you name, so the stats trigger (onStreamWritten) can be tried before the Control Room exists.
// Every stream it makes is marked test: true; --remove deletes exactly those (the trigger then
// takes their minutes back out of the games' stats). Dry run by default; --apply writes.
//
// Needs Application Default Credentials (gcloud auth application-default login).
// Usage (from the repo root or functions/):
//   node functions/scripts/make-test-stream.js --games granny-chapter-two,silent-hill-2            # dry run
//   node functions/scripts/make-test-stream.js --games granny-chapter-two,silent-hill-2 --apply    # write it
//   node functions/scripts/make-test-stream.js --games granny-chapter-two --minutes 45 --days-ago 3 --apply
//   node functions/scripts/make-test-stream.js --remove --apply                                     # delete the test streams
// --games    comma-separated Vault slugs, played in this order
// --minutes  minutes per game (one number for all, or one per game); default 60
// --days-ago how long ago the stream started (default 1); it starts at 19:00 site time that day
// --project  only "staging" (the default) is accepted

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const L = require("../lib/streams/logic");

const SITE_ID = "boomertanger";
const STAGING = "boomertanger-staging";

function parseArgs(argv) {
  const args = { project: "staging", apply: false, remove: false, games: [], minutes: [60], daysAgo: 1 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === "--project") args.project = next();
    else if (a.startsWith("--project=")) args.project = a.slice("--project=".length);
    else if (a === "--apply") args.apply = true;
    else if (a === "--remove") args.remove = true;
    else if (a === "--games") args.games = String(next()).split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--minutes") args.minutes = String(next()).split(",").map(Number);
    else if (a === "--days-ago") args.daysAgo = Number(next());
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!args.remove && !args.games.length) throw new Error("--games <slug,slug> is required (or --remove).");
  if (args.minutes.some((m) => !Number.isInteger(m) || m < 1 || m > 600)) throw new Error("--minutes takes whole numbers from 1 to 600.");
  if (args.minutes.length !== 1 && args.minutes.length !== args.games.length) throw new Error("--minutes is one number, or one per game.");
  if (!Number.isInteger(args.daysAgo) || args.daysAgo < 0 || args.daysAgo > 365) throw new Error("--days-ago is a whole number from 0 to 365.");
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

/** The moment it is HH:00 on a calendar day in a time zone (DST-safe: converges in two steps). */
function localToUtc(y, m, d, hour, tz) {
  const want = Date.UTC(y, m - 1, d, hour);
  let t = want;
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(t));
    const get = (k) => +parts.find((p) => p.type === k).value;
    t += want - Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"));
  }
  return t;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  if (projectId !== STAGING) throw new Error(`This helper only runs on staging (${STAGING}); got "${projectId}".`);
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const Timestamp = admin.firestore.Timestamp;
  const site = db.doc(`sites/${SITE_ID}`);
  console.log(`Project: ${projectId}${args.apply ? "" : " (dry run: nothing is written)"}`);
  if (process.env.FIRESTORE_EMULATOR_HOST) console.log(`Firestore: the emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`);

  if (args.remove) {
    const snap = await site.collection("streams").where("test", "==", true).get();
    console.log(`\n${snap.size} test stream(s)${snap.size ? ":" : "."}`);
    for (const d of snap.docs) console.log(`  ${d.id}  ${d.get("slug")}  games: ${(d.get("gameIds") || []).join(", ")}`);
    if (args.apply) {
      for (const d of snap.docs) await db.recursiveDelete(d.ref);
      console.log(snap.size ? "\nDeleted. The stats trigger takes their minutes back out of the games." : "\nNothing to delete.");
    } else if (snap.size) console.log("\nDry run: nothing deleted. Add --apply to delete them.");
    return;
  }

  const siteSnap = await site.get();
  const tz = (siteSnap.exists && siteSnap.get("timezone")) || null;
  if (!tz) throw new Error("sites/boomertanger has no timezone yet: run scripts/seed-site.js first.");
  const games = [];
  for (const slug of args.games) {
    const g = await site.collection("vaultGames").doc(slug).get();
    if (!g.exists) throw new Error(`No Vault game "${slug}".`);
    games.push({ slug, title: g.get("title") });
  }

  // Starts at 19:00 site time, `daysAgo` days back.
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() - args.daysAgo * 86400000)).split("-").map(Number);
  const start = localToUtc(day[0], day[1], day[2], 19, tz);
  let cursor = start;
  const segments = games.map((g, i) => {
    const mins = args.minutes.length === 1 ? args.minutes[0] : args.minutes[i];
    const seg = { gameId: g.slug, kind: "game", title: g.title, startedAt: Timestamp.fromMillis(cursor), endedAt: Timestamp.fromMillis(cursor + mins * 60000) };
    cursor += mins * 60000;
    return seg;
  });
  const existing = (await site.collection("streams").get()).docs.map((d) => d.get("slug")).filter(Boolean);
  const stream = {
    slug: L.streamSlug(start, tz, existing), week: L.streamWeek(start, tz), tz,
    state: "ended", published: true, hasUnpublishedChanges: false, adhoc: true, autoEnded: false, hidden: false, test: true, rev: 1,
    title: `Test stream (make-test-stream.js): ${games.map((g) => g.title).join(", ")}`.slice(0, 120), description: "", platforms: ["twitch"],
    plannedStart: Timestamp.fromMillis(start), plannedEnd: Timestamp.fromMillis(cursor), actualStart: Timestamp.fromMillis(start), actualEnd: Timestamp.fromMillis(cursor),
    plannedGames: games.map((g, i) => ({ gameId: g.slug, title: g.title, order: i + 1, source: { kind: "owner" }, outcome: "played" })),
    plannedGameIds: games.map((g) => g.slug), segments, gameIds: L.gameIdsOf(segments),
    crew: null, vods: { youtube: [], twitch: [] }, clips: [],
  };
  const problems = L.validateStream(stream);
  if (problems.length) throw new Error(`The test stream isn't valid: ${problems.join("; ")}`);

  console.log(`\nStream ${stream.slug} (${stream.week}, ${tz}), ${new Date(start).toISOString()} to ${new Date(cursor).toISOString()}`);
  segments.forEach((s) => console.log(`  ${s.title}: ${(s.endedAt.toMillis() - s.startedAt.toMillis()) / 60000} min`));
  if (!args.apply) { console.log("\nDry run: nothing written. Add --apply to write it."); return; }
  const ref = site.collection("streams").doc();
  await ref.set({ ...stream, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  console.log(`\nWritten: sites/${SITE_ID}/streams/${ref.id}. onStreamWritten recomputes the games' stats; check them on the game pages or in the console.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
