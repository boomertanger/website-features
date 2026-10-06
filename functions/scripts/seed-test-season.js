#!/usr/bin/env node
// functions/scripts/seed-test-season.js
//
// Creates "Season 00 · Test Signal" on staging so the Fun Factory engine can be tried end to end
// (docs/specs/fun-factory.md): live now, ending in 14 days, two chapters (the second unlocks in 2
// days), live activity types only, XP from the idea library:
//   Chapter 1 · Clock On
//     Daily      Clock in (check in once, 10 XP) · Play a round (any Arcade run, 15 XP)
//     Weekly     Splat run (finish Tap the Splat 3 times, 60 XP) · Wishlist voter (I want this too on 2 games, 50 XP)
//     Story      Site tour (visit 3 sections, 100 XP)
//     Milestone  Ten check-ins (100 XP)
//   Chapter 2 · Static (unlocks in 2 days)
//     Story      Hidden medals (find 2: one on /arcade, one on /games; 150 XP)
// Daily and weekly campaigns run to the season's end here (one short test season), not to the
// chapter's. The scheduler (factoryTick) reveals chapter 2 when it unlocks.
//
// STAGING ONLY. Dry run by default; --apply writes. Refuses if another season is live, or if any
// Scheduled or live season overlaps the test window.
//   --remove   deletes ONLY this test season: its doc, chapters, campaigns, activities, hunts and
//              medals, progress, standings, boards and its events. Never the reward ledger, badges,
//              trophies or XP already paid, and never check-in streaks (they aren't per season).
//
// Needs Application Default Credentials (gcloud auth application-default login).
// Usage (from the repo root or functions/):
//   node functions/scripts/seed-test-season.js                    # dry run
//   node functions/scripts/seed-test-season.js --apply            # create it
//   node functions/scripts/seed-test-season.js --remove           # dry run of the removal
//   node functions/scripts/seed-test-season.js --remove --apply   # remove it
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const L = require("../lib/factory/logic");

const SITE_ID = "boomertanger";
const SEASON_ID = "s00-test";
const DAY = 86400000;

function parseArgs(argv) {
  const args = { project: "staging", apply: false, remove: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--apply") args.apply = true;
    else if (argv[i] === "--remove") args.remove = true;
    else if (argv[i] === "--project") args.project = argv[++i];
    else if (argv[i].startsWith("--project=")) args.project = argv[i].slice("--project=".length);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return args;
}
function resolveProjectId(nameOrId) {
  try {
    const rc = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", ".firebaserc"), "utf8"));
    return rc.projects?.[nameOrId] ?? nameOrId;
  } catch { return nameOrId; }
}

/** The season as a list of [subpath, doc] writes, relative to seasons/{SEASON_ID}. */
function plan(now) {
  const ts = (t) => admin.firestore.Timestamp.fromMillis(t);
  const ch2At = now + 2 * DAY, endsAt = now + 14 * DAY;
  const shown = { revealed: true, revealedAt: ts(now) };
  const later = { revealed: false };
  const writes = [];
  const campaign = (id, d) => writes.push([`campaigns/${id}`, { audience: "all", closesAt: null, bonus: null, enabled: true, ...d }]);
  const activity = (id, d) => writes.push([`activities/${id}`, { link: null, params: {}, badgeId: null, repeat: "none", target: 1, enabled: true, ...d }]);

  writes.push(["", {
    number: 0, name: "Season 00 · Test Signal", pitch: "A two-week test of the Night Shift engine on staging.", art: null,
    startsAt: ts(now), endsAt: ts(endsAt), status: "live", revealed: true, dailyXpCap: null, badgeId: null,
    createdBy: "seed-test-season", publishedBy: "seed-test-season", test: true, liveAt: ts(now),
  }]);
  writes.push(["chapters/ch1", { order: 1, name: "Clock On", blurb: "Settle in: clock in, play a round, look around.", art: null, unlockAt: ts(now), ...shown }]);
  writes.push(["chapters/ch2", { order: 2, name: "Static", blurb: "Something's hiding on the site.", art: null, unlockAt: ts(ch2At), ...later }]);

  campaign("daily", { chapterId: "ch1", name: "Daily shift", cadence: "daily", opensAt: ts(now), order: 1, ...shown });
  activity("clock-in", { campaignId: "daily", title: "Clock in", instructions: "Press Clock in on the Night Shift page.", link: "/shift", typeId: "checkin", repeat: "daily", xp: 10, order: 1, ...shown });
  activity("play-a-round", { campaignId: "daily", title: "Play a round", instructions: "Play any game in the Boom Arcade.", link: "/arcade", typeId: "arcade", params: { action: "play" }, repeat: "daily", xp: 15, order: 2, ...shown });

  campaign("weekly", { chapterId: "ch1", name: "This week", cadence: "weekly", opensAt: ts(now), order: 2, ...shown });
  activity("splat-run", { campaignId: "weekly", title: "Splat run", instructions: "Finish Tap the Splat 3 times.", link: "/arcade", typeId: "arcade", params: { action: "finish", gameId: "tapTheSplat" }, repeat: "weekly", target: 3, xp: 60, order: 1, ...shown });
  activity("wishlist-voter", { campaignId: "weekly", title: "Wishlist voter", instructions: "Tap I want this too on 2 games on the wishlist.", link: "/games", typeId: "vault", params: { action: "want" }, repeat: "weekly", target: 2, xp: 50, order: 2, ...shown });

  campaign("tour", { chapterId: "ch1", name: "Site tour", cadence: "story", opensAt: ts(now), order: 3, ...shown });
  activity("site-tour", { campaignId: "tour", title: "Site tour", instructions: "Visit 3 sections of the site.", typeId: "visit", target: 3, xp: 100, order: 1, ...shown });

  campaign("milestone", { chapterId: "ch1", name: "Regular", cadence: "milestone", opensAt: ts(now), order: 4, ...shown });
  activity("ten-check-ins", { campaignId: "milestone", title: "Ten check-ins", instructions: "Clock in on 10 days this season.", link: "/shift", typeId: "checkin", target: 10, xp: 100, order: 1, ...shown });

  campaign("hunt", { chapterId: "ch2", name: "Hidden medals", cadence: "story", opensAt: ts(ch2At), order: 1, ...later });
  activity("hidden-medals", { campaignId: "hunt", title: "Hidden medals", instructions: "Find the 2 medals hidden around the site.", typeId: "medals", params: { huntId: "test-hunt" }, target: 2, xp: 150, order: 1, ...later });
  writes.push(["hunts/test-hunt", { activityId: "hidden-medals", name: "Test hunt" }]);
  writes.push(["hunts/test-hunt/medals/arcade", { path: "/arcade", position: { x: 92, y: 18 }, hint: "Look up in the Arcade.", order: 1 }]);
  writes.push(["hunts/test-hunt/medals/games", { path: "/games", position: { x: 6, y: 64 }, hint: "Something glints by the Vault.", order: 2 }]);
  return { writes, endsAt, ch2At };
}

async function deleteTree(db, ref, counts, apply) {
  for (const col of await ref.listCollections()) {
    for (const d of (await col.get()).docs) await deleteTree(db, d.ref, counts, apply);
  }
  const key = ref.path.split("/").slice(-2, -1)[0] || "season";
  counts[key] = (counts[key] || 0) + 1;
  if (apply) await ref.delete();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  if (!/staging/.test(projectId)) throw new Error(`Staging only: refusing to run against "${projectId}".`);
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const root = db.doc(`sites/${SITE_ID}/factory/main`);
  const seasonRef = root.collection("seasons").doc(SEASON_ID);
  console.log(`Project: ${projectId} (${args.apply ? "writing" : "dry run: nothing is written"})`);

  if (args.remove) {
    const snap = await seasonRef.get();
    const events = await root.collection("events").where("seasonId", "==", SEASON_ID).get();
    if (!snap.exists && events.empty) { console.log(`No ${SEASON_ID} season or events to remove.`); return; }
    if (snap.exists && snap.get("test") !== true) throw new Error(`${SEASON_ID} isn't marked as the test season; refusing to delete it.`);
    const counts = {};
    if (snap.exists || (await seasonRef.listCollections()).length) await deleteTree(db, seasonRef, counts, args.apply);
    for (let i = 0; i < events.docs.length; i += 400) {
      if (!args.apply) break;
      const batch = db.batch();
      events.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    console.log(`Remove ${SEASON_ID}: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(" · ")} · ${events.size} events`);
    console.log("Kept: the reward ledger, badges, trophies and XP already paid, and check-in streaks.");
    if (!args.apply) console.log("\nDry run: nothing deleted. Add --apply to delete it.");
    else console.log(`\nRemoved ${SEASON_ID}.`);
    return;
  }

  const now = Date.now();
  const { writes, endsAt, ch2At } = plan(now);
  const existing = await seasonRef.get();
  if (existing.exists) throw new Error(`${SEASON_ID} already exists (status ${existing.get("status")}). Remove it first with --remove --apply.`);
  const others = (await root.collection("seasons").where("status", "in", ["live", "scheduled"]).get()).docs.filter((d) => d.id !== SEASON_ID);
  const live = others.find((d) => d.get("status") === "live");
  if (live) throw new Error(`Another season is live (${live.id}: ${live.get("name")}). Refusing.`);
  const clash = others.find((d) => L.seasonsOverlap({ startsAt: d.get("startsAt"), endsAt: d.get("endsAt") }, { startsAt: now, endsAt }));
  if (clash) throw new Error(`${clash.id} (${clash.get("status")}) overlaps the test window. Seasons can't overlap. Refusing.`);
  const types = new Map((await root.collection("activityTypes").get()).docs.map((d) => [d.id, d.get("enabled") === true]));
  const used = [...new Set(writes.filter(([p]) => p.startsWith("activities/")).map(([, d]) => d.typeId))];
  const off = used.filter((t) => types.get(t) !== true);

  const fmt = (t) => new Date(t).toLocaleString("en-US", { timeZone: L.TZ, dateStyle: "medium", timeStyle: "short" });
  console.log(`\nSeason 00 · Test Signal (${SEASON_ID}): live ${fmt(now)} to ${fmt(endsAt)} Central`);
  console.log(`  Chapter 1 · Clock On      revealed now`);
  console.log(`  Chapter 2 · Static        unlocks ${fmt(ch2At)} (factoryTick reveals it)`);
  let xpTotal = 0;
  for (const [p, d] of writes.filter(([x]) => x.startsWith("activities/"))) {
    xpTotal += d.xp;
    console.log(`    ${d.title.padEnd(16)} ${d.typeId}${d.params.action ? `:${d.params.action}` : ""}${d.params.gameId ? ` (${d.params.gameId})` : ""} · target ${d.target} · ${d.repeat} · ${d.xp} XP${d.revealed ? "" : " · chapter 2"}`);
  }
  console.log(`  Hunt: 2 medals (/arcade, /games)`);
  console.log(`  ${writes.length} documents · up to ${xpTotal} XP if every activity is done once`);
  if (off.length) console.log(`  WARNING: these types aren't on in activityTypes yet (run seed-factory-types.js first): ${off.join(", ")}`);

  if (!args.apply) { console.log("\nDry run: nothing written. Add --apply to create it."); return; }
  const batch = db.batch();
  for (const [p, d] of writes) batch.set(p ? db.doc(`${seasonRef.path}/${p}`) : seasonRef, d);
  await batch.commit();
  console.log(`\nCreated ${SEASON_ID}. The engine notices it within a minute.`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err.message || err); process.exit(1); });
