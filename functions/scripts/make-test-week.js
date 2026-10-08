#!/usr/bin/env node
// functions/scripts/make-test-week.js
//
// Test helper for the Scream Planner (docs/specs/scream-planner.md section 7). STAGING ONLY: it refuses any other
// project. Opens a test week from SAMPLE patterns (held in this file; the real usual week at planner/main is not
// touched): a few planned streams, a ballot seeded from the Vault games that exist, and crew sign-ups for roster
// members that exist. Every document it makes is marked test: true; --remove deletes exactly those, then rebuilds
// public/ballot and public/schedule. Dry run by default; --apply writes.
//
// The week is the first coming week with no planWeeks document (so it never collides with a week plannerTick
// opened), or the one named with --week. Needs Application Default Credentials
// (gcloud auth application-default login).
// Usage (from the repo root or functions/):
//   node functions/scripts/make-test-week.js                        # dry run
//   node functions/scripts/make-test-week.js --apply                # write it
//   node functions/scripts/make-test-week.js --week 2026-W45 --apply
//   node functions/scripts/make-test-week.js --remove --apply       # delete everything it made
//   node functions/scripts/make-test-week.js --publish --apply      # publish the test week (public pages read published data only)
//   node functions/scripts/make-test-week.js --publish --frame <frame> --doors <style> --apply   # choose the look; safe to re-run
//   (--frame / --doors default to the first pool frame and door style; they are validated by the planner's own validateHero.)
// --project  only "staging" (the default) is accepted

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const L = require("../lib/planner/logic");

const SITE_ID = "boomertanger";
const STAGING = "boomertanger-staging";

function parseArgs(argv) {
  const args = { project: "staging", apply: false, remove: false, publish: false, week: null, frame: null, doors: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === "--project") args.project = next();
    else if (a.startsWith("--project=")) args.project = a.slice("--project=".length);
    else if (a === "--apply") args.apply = true;
    else if (a === "--remove") args.remove = true;
    else if (a === "--publish") args.publish = true;
    else if (a === "--frame") args.frame = next();
    else if (a === "--doors") args.doors = next();
    else if (a === "--week") args.week = next();
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (args.week && !L.isWeekId(args.week)) throw new Error("--week must look like 2026-W45.");
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

// The sample usual week: ids start with "test-" so nothing here can be mistaken for a real pattern.
const SAMPLE_PATTERNS = [
  { id: "test-mon", label: "Monster Monday", icon: "M", dow: 1, start: "19:00", end: "22:00", type: "platform", platforms: ["twitch", "youtube", "tiktok"], gameCount: 2, order: 1, active: true },
  { id: "test-wed", label: "VR night", icon: "VR", dow: 3, start: "19:00", end: "22:00", type: "platform", platforms: ["twitch", "youtube"], gameCount: 2, tagHints: ["vr"], order: 2, active: true },
  { id: "test-sat", label: "Late night", icon: "L", dow: 6, start: "22:00", end: "02:00", type: "platform", rooms: ["twitch"], gameCount: 1, order: 3, active: true },
  { id: "test-sun", label: "Backstage VOD recording", icon: "B", dow: 7, start: "19:00", end: "21:00", type: "backstage", audience: "fanClub", gameCount: 1, order: 4, active: true },
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  if (projectId !== STAGING) throw new Error(`This helper only runs on staging (${STAGING}); got "${projectId}".`);
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const { FieldValue, Timestamp } = admin.firestore;
  const site = `sites/${SITE_ID}`;
  console.log(`Project: ${projectId}${args.apply ? "" : " (dry run: nothing is written)"}`);
  if (process.env.FIRESTORE_EMULATOR_HOST) console.log(`Firestore: the emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`);

  const siteSnap = await db.doc(site).get();
  const tz = siteSnap.exists ? siteSnap.get("timezone") : null;
  if (!tz) throw new Error(`sites/${SITE_ID} has no timezone; the planner never assumes one. Run seed-site.js first.`);
  console.log(`Time zone: ${tz}`);

  const build = require("../lib/planner").build({
    adminLogEntry: async (_db, f) => ({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)), details: { ...(f.details || {}), test: true }, createdAt: FieldValue.serverTimestamp(), expireAt: Timestamp.fromMillis(Date.now() + 30 * 86400000) }),
  });
  const { core, plan } = build.hooks;

  // ---------- --remove ----------
  if (args.remove) {
    const weeks = (await db.collection(`${site}/planWeeks`).where("test", "==", true).get()).docs;
    const streams = (await db.collection(`${site}/streams`).where("test", "==", true).get()).docs;
    console.log(`Would remove: ${weeks.length} test week(s) (${weeks.map((w) => w.id).join(", ") || "none"}) and ${streams.length} test stream(s) with their drafts and sign-ups.`);
    if (!args.apply) return console.log("Dry run only. Add --apply to delete them.");
    for (const s of streams) {
      for (const sub of ["signups"]) for (const d of (await s.ref.collection(sub).get()).docs) await d.ref.delete();
      await s.ref.collection("private").doc("draft").delete();
      await s.ref.delete();
    }
    for (const w of weeks) {
      for (const sub of ["ballot", "votes"]) for (const d of (await w.ref.collection(sub).get()).docs) await d.ref.delete();
      await w.ref.delete();
    }
    await core.rebuildPublicBallot();
    await core.rebuildSchedule();
    return console.log(`Removed ${weeks.length} week(s) and ${streams.length} stream(s); public/ballot and public/schedule rebuilt.`);
  }

  // ---------- --publish ----------
  // Writes what plan.js publishWeek writes (published copies of the drafts with state scheduled, the week's hero,
  // state published), through the planner's own core.saveDraft / refreshCounts / rebuild*, minus the owner check, the
  // outbox note and the activity entry (a test week must not notify anyone). Re-running only changes the hero.
  if (args.publish) {
    const weeks = (await db.collection(`${site}/planWeeks`).where("test", "==", true).get()).docs;
    if (!weeks.length) throw new Error("There is no test week. Make one first (no flags, then --apply).");
    const wk = args.week ? weeks.find((w) => w.id === args.week) : weeks.sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!wk) throw new Error(`${args.week} is not a test week.`);
    const prev = wk.get("hero") || L.defaultHero(null);
    const hero = { frame: args.frame || prev.frame, doors: args.doors || prev.doors };
    const bad = L.validateHero(hero);
    if (bad.length) throw new Error(`${bad.join("; ")}. Frames: ${[...L.FRAME_POOL, ...L.FRAMES_SEASONAL].join(", ")}. Doors: ${L.DOOR_STYLES.join(", ")}.`);
    const first = wk.get("state") !== "published";
    const drafts = (await core.draftsOfWeek(wk.id)).filter((d) => !(d.state === "cancelled" && d.published !== true));
    console.log(`Week ${wk.id} (state ${wk.get("state")}): ${first ? "first publish" : "already published, only the hero changes"}`);
    console.log(`  hero    frame ${hero.frame}, doors ${hero.doors}`);
    console.log(`  streams ${drafts.length} stream(s) ${first ? "become published (planned -> scheduled)" : "stay as they are"}`);
    if (first) console.log("  ballot  the open ballot closes (publishing ends voting, like the real thing)");
    if (!args.apply) return console.log("\nDry run only. Add --apply to write it.");
    if (first) {
      for (const dr of drafts) await core.saveDraft(dr.id, { ...dr, state: dr.state === "planned" ? "scheduled" : dr.state, published: true, hasUnpublishedChanges: false, rev: (dr.rev || 0) + 1 }, { alsoPublic: true });
      const now = Date.now();
      await wk.ref.update({ state: "published", publishedAt: Timestamp.fromMillis(now), publishedRev: (wk.get("publishedRev") || 0) + 1, hasUnpublishedChanges: false, hero, ballotSlugs: [], earlySignupUntil: Timestamp.fromMillis(now + 48 * 3600000), closesAt: Timestamp.fromMillis(now), closedEarly: true });
    } else await wk.ref.update({ hero });
    await core.refreshCounts(wk.id);
    await core.rebuildPublicBallot();
    await core.rebuildSchedule();
    return console.log(`\nDone. ${wk.id} is published with frame ${hero.frame} and doors ${hero.doors}. Remove it with: node functions/scripts/make-test-week.js --remove --apply`);
  }

  // ---------- pick the week ----------
  const existing = new Set((await db.collection(`${site}/planWeeks`).get()).docs.map((d) => d.id));
  let week = args.week;
  if (!week) { week = L.targetWeekAt(Date.now(), tz); while (existing.has(week)) week = L.nextWeek(week); }
  if (existing.has(week)) throw new Error(`${week} already has a planWeeks document; pick another with --week, or --remove the test weeks first.`);
  if (week <= L.weekOf(Date.now(), tz)) throw new Error("The test week must be a coming week.");

  // ---------- what would be made ----------
  const settings = await core.loadSettings();
  const exp = L.expandWeek({ week, patterns: SAMPLE_PATTERNS, exceptions: [], tz, defaults: settings.defaults });
  const games = (await db.collection(`${site}/vaultGames`).where("hidden", "==", false).get()).docs.map((d) => ({ slug: d.id, status: d.get("status"), hidden: false, wantedCount: d.get("wantedCount") || 0, addedMs: 0 }));
  const seeded = L.seedBallot({ games, seed: settings.defaults.ballotSeed });
  const roster = (await db.collection(`${site}/crew/main/roster`).get()).docs.filter((d) => ["active", "checkIn"].includes(d.get("status")));
  console.log(`\nWeek ${week} (${L.weekBounds(week, tz).monday} to ${L.weekBounds(week, tz).sunday}), opened by hand now, marked test: true`);
  for (const s of exp.slots) console.log(`  stream  ${s.date}  ${L.dayLabel(s.startMs, tz)} ${L.timeLabel(s.startMs, tz)} to ${L.timeLabel(s.endMs, tz)}  ${s.theme.label}  [${s.type}${s.rooms.length ? ", rooms " + s.rooms.join("/") : ""}]`);
  console.log(`  ballot  ${seeded.length} seeded game(s) from ${games.length} Vault game(s): ${seeded.map((x) => x.slug).join(", ") || "none"}`);
  const fill = Math.max(0, 3 - seeded.length);
  if (fill) console.log(`          plus ${Math.min(fill, games.length - seeded.length)} more Vault game(s) so the ballot isn't empty`);
  const crew = roster.slice(0, 3);
  console.log(`  crew    ${crew.length} roster member(s) get a sign-up on the first stream: ${crew.map((r) => `${r.get("handle") || r.id} (grade ${r.get("grade")})`).join(", ") || "none (the roster has nobody Active)"}`);
  if (!args.apply) return console.log("\nDry run only. Add --apply to write it.");

  // ---------- write it, through the same code path as the real week opening ----------
  const mark = { test: true };
  const r = await plan.openWeek(week, { manual: true, source: { patterns: SAMPLE_PATTERNS, exceptions: [] }, mark });
  if (!r.created) throw new Error(`${week} was not created (it already exists).`);
  const wk = db.doc(`${site}/planWeeks/${week}`);
  let slugs = (await wk.get()).get("ballotSlugs") || [];
  for (const g of games.filter((x) => !slugs.includes(x.slug)).slice(0, fill)) {
    await db.doc(`${site}/planWeeks/${week}/ballot/${g.slug}`).set({ votes: 0, seededFrom: "owner", addedBy: null, ...mark, createdAt: FieldValue.serverTimestamp() });
    slugs = [...slugs, g.slug];
  }
  await wk.update({ ballotSlugs: slugs });
  // A few crew sign-ups: each asks for the highest seat their grade allows on the first stream.
  const first = (await core.draftsOfWeek(week)).sort((a, b) => a.plannedStart.toMillis() - b.plannedStart.toMillis())[0];
  let signed = 0;
  for (const m of crew) {
    const grade = m.get("track") === "admin" ? 4 : m.get("grade") || 1;
    const seat = grade >= 3 ? { room: "captain", role: "captain" } : grade === 2 ? { room: "ytLandscape", role: "lead" } : { room: "twitch", role: "deckhand" };
    await db.doc(`${site}/streams/${first.id}/signups/${m.id}`).set({ availability: "yes", prefilled: false, seats: [{ ...seat, status: "requested" }], gameRequest: null, handle: m.get("handle") || null, grade: m.get("grade") ?? null, track: m.get("track") || "mod", ...mark, updatedAt: FieldValue.serverTimestamp() });
    signed++;
  }
  await core.refreshCounts(week);
  await core.rebuildPublicBallot();
  await core.rebuildSchedule();
  console.log(`\nDone. Week ${week} is open with ${r.streams} stream(s), ${slugs.length} ballot game(s) and ${signed} crew sign-up(s). Remove it with: node functions/scripts/make-test-week.js --remove --apply`);
}

main().then(() => process.exit(0), (err) => { console.error(`\nFailed: ${err.message}`); process.exit(1); });
