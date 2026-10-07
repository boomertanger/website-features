#!/usr/bin/env node
// functions/scripts/check-vault-emulator.js: runs the Game Vault callables, the editor and the
// stream trigger against the local Firestore EMULATOR, with recorded source data and stubbed
// Cloudinary (docs/specs/game-vault.md, stream-object.md). Not part of `npm run check` (it
// needs Java and downloads the emulator once); run it with:
//   npm run check:emulator
// No credentials, no network, nothing real is touched (project "demo-vault").
// On Windows the emulator's java.exe can outlive a run; if the next run says port 8080 is
// taken, end the java.exe whose command line mentions cloud-firestore-emulator.
const assert = require("assert/strict");
const path = require("path");
const admin = require("firebase-admin");

if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error("Run this through the emulator: npm run check:emulator"); process.exit(1); }
admin.initializeApp({ projectId: "demo-vault" });
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue, Timestamp = admin.firestore.Timestamp;

const { normalizeIgdb, normalizeSteam } = require("../lib/vault/sources");
const IGDB = require("./fixtures/vault/igdb.json");
const STEAM = { ...require("./fixtures/vault/steam-1205040.json"), ...require("./fixtures/vault/steam-dlc.json"), ...require("./fixtures/vault/steam-eldenring.json") };
const igdbById = (id) => IGDB.games.find((g) => g.id === id);
const fixtureSources = {
  igdbGet: async (id) => (igdbById(id) ? normalizeIgdb(igdbById(id)) : null),
  igdbBySlug: async (slug) => { const g = IGDB.games.find((x) => x.slug === slug); return g ? normalizeIgdb(g) : null; },
  igdbSearch: async (q) => IGDB.games.filter((g) => g.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8).map(normalizeIgdb),
  igdbFindBySteam: async (appId) => { const g = IGDB.games.find((x) => (x.external_games || []).some((e) => e.uid === String(appId) && e.external_game_source === 1)); return g ? normalizeIgdb(g) : null; },
  steamGet: async (appId) => (STEAM[appId] ? normalizeSteam(appId, STEAM[appId]) : null),
  steamCoverExists: async () => true,
};

const SITE = "boomertanger";
const site = db.doc(`sites/${SITE}`);
const stubs = { deleted: [], recorded: [] };
const deps = {
  adminLogEntry: async (_db, p) => ({ ...p, createdAt: Timestamp.now() }),
  performAssetDeletion: async (id) => { stubs.deleted.push(id); },
  cloudinaryDelete: async () => {},
  recordAssetCreated: async (a) => { stubs.recorded.push(a); return `asset${stubs.recorded.length}`; },
  cloudSecrets: [],
  cloudCreds: () => ({ cloudName: "demo", apiKey: "k", apiSecret: "s" }),
  sources: fixtureSources,
};
const vault = require("../lib/vault")(deps);
const F = vault.functions;
const streamsModule = require("../lib/streams")({ adminLogEntry: deps.adminLogEntry });

const as = (uid, extra = {}) => ({ uid, token: { email_verified: true, email: `${uid}@example.com`, ...extra } });
const call = (fn, uid, data, auth) => F[fn].run({ data, auth: uid ? auth || as(uid) : undefined, rawRequest: {}, acceptsStreaming: false });
const rejects = async (p, code, reason) => {
  try { await p; } catch (e) { assert.equal(e.code, code, `${e.code}: ${e.message}`); if (reason) assert.equal(e.details?.reason, reason); return e; }
  assert.fail(`expected ${code}${reason ? "/" + reason : ""}`);
};
const col = async (path) => (await db.collection(path).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const pub = async () => (await site.collection("public").doc("vault").get()).data();

(async () => {
  // ---------- people ----------
  await site.set({ name: "Boomertanger", ownerUid: "owner1", timezone: "America/Chicago" });
  for (const [uid, roles, handle] of [["owner1", ["admin"], "boomer"], ["mod1", ["mod"], "modwoman"], ["viewer1", [], "viewer1"], ["viewer2", [], "viewer2"], ["admin2", ["admin"], "admin2"]]) {
    await site.collection("members").doc(uid).set({ roles, joinedAt: Timestamp.now() });
    await site.collection("profiles").doc(uid).set({ handle, displayName: handle });
  }

  // ---------- who can do what ----------
  await rejects(call("vaultAddGame", null, { input: "1205040" }), "unauthenticated");
  await rejects(call("vaultAddGame", "viewer1", { input: "1205040" }, as("viewer1", { email_verified: false })), "failed-precondition", "emailNotVerified");
  await rejects(call("vaultAddGame", "nobody", { input: "1205040" }), "failed-precondition", "needsSignup");
  await rejects(call("vaultQueueList", "viewer1", {}), "permission-denied", "notStaff");
  await rejects(call("vaultHideGame", "viewer1", { slug: "x", hidden: true }), "permission-denied", "notStaff");
  await rejects(call("vaultDeleteGame", "mod1", { slug: "x" }), "permission-denied", "notAdmin");

  // ---------- a member adds a horror game: added at once ----------
  let r = await call("vaultAddGame", "viewer1", { input: "https://store.steampowered.com/app/1205040/Granny/" });
  assert.equal(r.decision, "added");
  assert.equal(r.slug, "granny-chapter-two");
  assert.deepEqual(r.checks.map((c) => c.state), ["pass", "pass", "pass", "pass", "pass"]);
  let g = (await site.collection("vaultGames").doc("granny-chapter-two").get()).data();
  assert.equal(g.status, "wishlist"); assert.equal(g.origin, "community"); assert.deepEqual(g.addedBy, { handle: "viewer1" });
  assert.equal(g.hidden, false); assert.equal(g.editCount, 0); assert.equal(g.stats.streamCount, 0);
  assert.equal(g.cover.igdbImageId, "co2granny");
  assert.ok(g.releaseDate.toMillis() > 0);
  const src = (await site.collection("vaultGames").doc("granny-chapter-two").collection("private").doc("source").get()).data();
  assert.equal(src.addedByUid, "viewer1"); assert.ok(src.themes.includes("Horror"));
  assert.deepEqual((await col(`sites/${SITE}/vaultKeys`)).map((k) => k.id).sort(), ["igdb_1001", "steam_1205040", "title_granny-chapter-two"]);
  let p = await pub();
  assert.equal(p.count, 1); assert.equal(p.games[0].slug, "granny-chapter-two"); assert.equal(p.games[0].by, "viewer1"); assert.ok(p.tags.some((t) => t.tag === "Horror"));
  let ptr = (await site.collection("private").doc("vaultDigest").get()).data();
  assert.equal(ptr.count, 1);
  let events = (await col("activityLog")).filter((e) => e.feature === "game-vault");
  assert.equal(events.length, 1); assert.equal(events[0].summary, "Granny: Chapter Two was added to the Vault"); assert.equal(events[0].link, "/games?sort=new");
  assert.ok((await col("adminLog")).some((e) => e.feature === "gameVault" && e.action === "add" && e.itemPath.endsWith("/vaultGames/granny-chapter-two")));

  // ---------- the same game again: already there, a +1 once per member ----------
  r = await call("vaultAddGame", "viewer2", { input: "1205040" });
  assert.equal(r.decision, "duplicate"); assert.equal(r.wantedCount, 1); assert.equal(r.slug, "granny-chapter-two");
  r = await call("vaultAddGame", "viewer2", { input: { igdbId: 1001 } });
  assert.equal(r.wantedCount, 1, "a member counts once");
  assert.ok((await site.collection("vaultGames").doc("granny-chapter-two").collection("wants").doc("viewer2").get()).exists);
  assert.equal((await pub()).games[0].wanted, 1);
  // "I want this too": on and off
  r = await call("vaultWant", "viewer1", { slug: "granny-chapter-two", on: true }); assert.equal(r.wantedCount, 2);
  r = await call("vaultWant", "viewer1", { slug: "granny-chapter-two", on: true }); assert.equal(r.wantedCount, 2);
  r = await call("vaultWant", "viewer1", { slug: "granny-chapter-two", on: false }); assert.equal(r.wantedCount, 1);
  await rejects(call("vaultWant", "viewer1", { slug: "nope", on: true }), "not-found", "noGame");

  // ---------- refused: nothing is created, the reason is vague, adminLog has the uid ----------
  r = await call("vaultAddGame", "viewer1", { input: { igdbId: 3001 } });
  assert.equal(r.decision, "refused"); assert.equal(r.message, "This game can't be added to the Vault.");
  assert.equal((await site.collection("vaultGames").get()).size, 1);
  const refused = (await col("adminLog")).find((e) => e.action === "refused");
  assert.equal(refused.details.uid, "viewer1"); assert.equal(refused.details.code, "adult");
  r = await call("vaultAddGame", "viewer1", { input: "1456361" }); assert.equal(r.code, "notAGame");
  await rejects(call("vaultAddGame", "viewer1", { input: "https://example.com" }).then((x) => { assert.equal(x.decision, "refused"); throw Object.assign(new Error("ok"), { code: "ok" }); }), "ok");

  // ---------- queued, once; a mod approves it ----------
  r = await call("vaultAddGame", "viewer1", { input: { igdbId: 4001 } });
  assert.equal(r.decision, "queued"); assert.equal(r.message, "Sent for a quick check.");
  const queueId = r.queueId;
  assert.equal((await call("vaultAddGame", "viewer2", { input: { igdbId: 4001 } })).code, "alreadyQueued");
  assert.equal((await site.collection("vaultQueue").doc(queueId).collection("private").doc("submitter").get()).get("uid"), "viewer1");
  let list = await call("vaultQueueList", "mod1", {});
  assert.equal(list.count, 1); assert.equal(list.items[0].kind, "add"); assert.equal(list.items[0].submittedBy, "viewer1"); assert.equal(list.items[0].title, "Cozy Farm Valley");
  assert.equal((await site.collection("vaultGames").get()).size, 1, "a queued game isn't in the Vault yet");
  r = await call("vaultReviewQueue", "mod1", { id: queueId, decision: "approve" });
  assert.equal(r.result, "approved"); assert.equal(r.slug, "cozy-farm-valley");
  assert.equal((await site.collection("vaultQueue").doc(queueId).get()).exists, false);
  assert.equal((await site.collection("vaultGames").doc("cozy-farm-valley").get()).get("origin"), "community");
  assert.equal((await site.collection("vaultGames").doc("cozy-farm-valley").get()).get("addedBy").handle, "viewer1");
  ptr = (await site.collection("private").doc("vaultDigest").get()).data();
  assert.equal(ptr.count, 2);
  events = (await col("activityLog")).filter((e) => e.type === "games-added");
  assert.equal(events.length, 1); assert.equal(events[0].summary, "2 games added to the Vault: Granny: Chapter Two and Cozy Farm Valley");
  let notes = await col(`sites/${SITE}/members/viewer1/vaultNotices`);
  assert.equal(notes[0].decision, "approved");
  // …and another is rejected with a reason the member can read; rejecting doesn't pause
  r = await call("vaultAddGame", "viewer2", { input: "1245620" });
  assert.equal(r.decision, "queued");
  r = await call("vaultReviewQueue", "mod1", { id: r.queueId, decision: "reject", reason: "Not horror" });
  assert.equal(r.result, "rejected");
  notes = await col(`sites/${SITE}/members/viewer2/vaultNotices`);
  assert.equal(notes[0].decision, "rejected"); assert.equal(notes[0].reason, "Not horror");
  assert.equal((await site.collection("members").doc("viewer2").get()).get("vaultAddPausedUntil"), undefined);
  assert.equal((await call("vaultQueueList", "mod1", {})).count, 0);
  await rejects(call("vaultReviewQueue", "mod1", { id: queueId, decision: "approve" }), "not-found", "noItem");

  // ---------- staff skip the horror check; admins' adds are Boomer's ----------
  r = await call("vaultAddGame", "owner1", { input: { igdbId: 6001 } });
  assert.equal(r.decision, "added");
  assert.equal((await site.collection("vaultGames").doc("elden-ring").get()).get("origin"), "boomer");
  assert.equal((await site.collection("vaultGames").doc("elden-ring").get()).get("addedBy"), null);

  // ---------- 5 adds a day ----------
  for (const id of [3002, 3006, 2005, 2006]) assert.equal((await call("vaultAddGame", "viewer2", { input: { igdbId: id } })).decision, "added");
  // viewer2 has added 4 so far (the Granny +1 and the rejected queue item don't count); the 5th is fine, the 6th is not
  assert.equal((await call("vaultAddGame", "viewer2", { input: { igdbId: 2007 } })).decision, "added");
  await rejects(call("vaultAddGame", "viewer2", { input: { igdbId: 1002 } }), "resource-exhausted", "addLimit");
  // staff are not braked
  assert.equal((await call("vaultAddGame", "mod1", { input: { igdbId: 1002 } })).decision, "added");

  // ---------- add it by hand: always queued ----------
  r = await call("vaultAddGame", "viewer1", { byHand: { name: "Basement Dread", link: "https://example.com/basement" } });
  assert.equal(r.decision, "queued"); assert.equal(r.code, "queuedByHand");
  r = await call("vaultReviewQueue", "owner1", { id: r.queueId, decision: "approve" });
  assert.equal(r.slug, "basement-dread");
  assert.equal((await site.collection("vaultGames").doc("basement-dread").get()).get("links").official, "https://example.com/basement");

  // ---------- hiding a community pick pauses the adder ----------
  await rejects(call("vaultHideGame", "mod1", { slug: "elden-ring", hidden: true }), "failed-precondition", "notCommunity");
  r = await call("vaultHideGame", "mod1", { slug: "cozy-farm-valley", hidden: true, reason: "Not what the Vault is for" });
  assert.equal(r.changed, true);
  assert.ok((await site.collection("members").doc("viewer1").get()).get("vaultAddPausedUntil").toMillis() > Date.now() + 6 * 86400000);
  p = await pub();
  assert.equal(p.games.some((x) => x.slug === "cozy-farm-valley"), false, "hidden games leave public/vault");
  await rejects(call("vaultAddGame", "viewer1", { input: { igdbId: 3002 } }), "failed-precondition", "paused");
  assert.equal((await call("vaultHideGame", "mod1", { slug: "cozy-farm-valley", hidden: false })).hidden, false);
  assert.ok((await pub()).games.some((x) => x.slug === "cozy-farm-valley"));
  await rejects(call("vaultWant", "viewer2", { slug: "cozy-farm-valley", on: true }).then(async () => { await call("vaultHideGame", "mod1", { slug: "cozy-farm-valley", hidden: true }); return call("vaultWant", "viewer2", { slug: "cozy-farm-valley", on: true }); }), "not-found", "noGame");
  await call("vaultHideGame", "mod1", { slug: "cozy-farm-valley", hidden: false });

  // ---------- the editor (adminEditItem kind vaultGame) ----------
  const edit = (uid, data, auth) => vault.editVaultGame({ data: { feature: "vaultGame", ...data }, auth: auth || as(uid), rawRequest: {}, acceptsStreaming: false });
  await rejects(edit("mod1", { id: "granny-chapter-two", changes: { status: "playing" }, before: { status: "wishlist" } }), "permission-denied", "notAdmin");
  await rejects(edit("viewer1", { id: "granny-chapter-two", changes: { status: "playing" }, before: { status: "wishlist" } }), "permission-denied");
  r = await edit("owner1", { id: "granny-chapter-two", changes: { status: "playing" }, before: { status: "wishlist" } });
  assert.equal(r.changed, true);
  g = (await site.collection("vaultGames").doc("granny-chapter-two").get()).data();
  assert.equal(g.status, "playing"); assert.equal(g.editCount, 1); assert.ok(g.editedAt);
  assert.ok((await col("adminLog")).some((e) => e.action === "status" && e.actorUid === "owner1" && e.changes.status));
  assert.ok((await col("activityLog")).some((e) => e.type === "now-playing" && e.summary === "Now playing: Granny: Chapter Two"));
  await rejects(edit("owner1", { id: "granny-chapter-two", changes: { status: "finished" }, before: { status: "wishlist" } }), "aborted", "conflict");   // loaded an old value
  assert.equal((await edit("owner1", { id: "granny-chapter-two", changes: { status: "playing" }, before: { status: "playing" } })).changed, false);
  await rejects(edit("owner1", { id: "granny-chapter-two", changes: { status: "nope" }, before: { status: "playing" } }), "invalid-argument");
  await rejects(edit("owner1", { id: "granny-chapter-two", changes: { title: "Hacked" }, before: { title: "x" } }), "invalid-argument");
  await rejects(edit("owner1", { id: "granny-chapter-two", changes: { review: { score: 11, verdict: "x", body: "" } }, before: { review: null } }), "invalid-argument");
  await rejects(edit("owner1", { id: "granny-chapter-two", changes: { links: { steam: "http://insecure.example" } }, before: { links: {} } }), "invalid-argument");
  r = await edit("admin2", {
    id: "granny-chapter-two",
    changes: { review: { score: 9, verdict: "Granny hears everything.", body: "Five nights of dread." }, boomerTags: ["Jump scares", "Chaos"], legacy: { streamCount: 12, minutes: 1800, lastStreamedAt: Date.UTC(2026, 5, 1) }, summary: "A custom summary." },
    before: { review: null, boomerTags: [], legacy: { streamCount: 0, minutes: 0, lastStreamedAt: null }, summary: g.summary },
    reason: "First review",
  });
  assert.equal(r.changed, true);
  g = (await site.collection("vaultGames").doc("granny-chapter-two").get()).data();
  assert.equal(g.review.score, 9); assert.ok(g.review.updatedAt); assert.deepEqual(g.tags.boomer, ["Jump scares", "Chaos"]);
  assert.equal(g.legacy.streamCount, 12); assert.equal(g.summary, "A custom summary."); assert.equal(g.editCount, 2);
  p = await pub();
  const card = p.games.find((x) => x.slug === "granny-chapter-two");
  assert.equal(card.score, 9); assert.equal(card.streams, 12); assert.equal(card.minutes, 1800); assert.ok(card.tags.includes("Jump scares"));
  const logged = (await col("adminLog")).filter((e) => e.itemPath.endsWith("granny-chapter-two") && e.action === "edit");
  assert.equal(logged.length, 1); assert.equal(logged[0].reason, "First review"); assert.deepEqual(Object.keys(logged[0].changes).sort(), ["boomerTags", "legacy", "review", "summary"]);
  // finished: a separate event with the score
  await edit("owner1", { id: "granny-chapter-two", changes: { status: "finished" }, before: { status: "playing" } });
  assert.ok((await col("activityLog")).some((e) => e.type === "finished" && e.summary === "Finished Granny: Chapter Two. Boomer's score: 9"));
  await edit("owner1", { id: "granny-chapter-two", changes: { status: "playing" }, before: { status: "finished" } });
  // a cover override that isn't a file in the covers folder is refused before anything is touched
  await rejects(edit("owner1", { id: "granny-chapter-two", changes: { cover: { action: "replace", publicId: "somewhere/else" } }, before: { cover: g.cover } }), "invalid-argument");

  // ---------- streams: the trigger recomputes stats, moves wishlist to playing ----------
  const T0 = Date.UTC(2026, 8, 6, 0, 0, 0), MIN = 60000;
  const streamDoc = (over) => ({
    state: "ended", published: true, title: "Test stream", actualStart: Timestamp.fromMillis(T0), actualEnd: Timestamp.fromMillis(T0 + 150 * MIN),
    segments: [
      { gameId: "elden-ring", kind: "game", title: "Elden Ring", startedAt: Timestamp.fromMillis(T0), endedAt: Timestamp.fromMillis(T0 + 60 * MIN) },
      { gameId: "granny-chapter-two", kind: "game", title: "Granny", startedAt: Timestamp.fromMillis(T0 + 60 * MIN), endedAt: Timestamp.fromMillis(T0 + 150 * MIN) },
    ],
    gameIds: ["elden-ring", "granny-chapter-two"], plannedGameIds: [], test: true, ...over,
  });
  // put Elden Ring on the wishlist so it can move
  await site.collection("vaultGames").doc("elden-ring").update({ status: "wishlist" });
  const fire = async (id, before, after) => streamsModule.onStreamWritten.run({
    params: { siteId: SITE, streamId: id },
    data: { before: { exists: !!before, data: () => before }, after: { exists: !!after, data: () => after } },
  });
  const s1 = streamDoc({});
  await site.collection("streams").doc("s1").set(s1);
  await fire("s1", null, s1);
  let er = (await site.collection("vaultGames").doc("elden-ring").get()).data();
  assert.deepEqual([er.stats.streamCount, er.stats.minutes], [1, 60]);
  assert.equal(er.status, "playing", "a streamed wishlist game moves to playing");
  assert.ok((await col("adminLog")).some((e) => e.actorName === "Automatic" && e.action === "status" && e.itemPath.endsWith("elden-ring")));
  assert.ok((await col("activityLog")).some((e) => e.type === "now-playing" && e.summary === "Now playing: Elden Ring"));
  let gr = (await site.collection("vaultGames").doc("granny-chapter-two").get()).data();
  assert.deepEqual([gr.stats.streamCount, gr.stats.minutes], [1, 90]);
  assert.equal(gr.status, "playing", "a game that isn't on the wishlist keeps its status");
  assert.equal(gr.stats.firstStreamedAt.toMillis(), T0 + 60 * MIN);
  p = await pub();
  assert.equal(p.games.find((x) => x.slug === "granny-chapter-two").streams, 13, "displayed stats add the legacy history (12 + 1)");
  assert.equal(p.games.find((x) => x.slug === "granny-chapter-two").minutes, 1890);
  // re-running changes nothing (no duplicate event), a second stream adds up
  const nowPlayingBefore = (await col("activityLog")).filter((e) => e.type === "now-playing").length;
  await fire("s1", s1, s1);
  await fire("s1", s1, { ...s1, title: "Renamed" });
  assert.equal((await col("activityLog")).filter((e) => e.type === "now-playing").length, nowPlayingBefore);
  const s2 = streamDoc({ actualStart: Timestamp.fromMillis(T0 + 1440 * MIN), actualEnd: Timestamp.fromMillis(T0 + 1500 * MIN), segments: [{ gameId: "elden-ring", kind: "game", title: "Elden Ring", startedAt: Timestamp.fromMillis(T0 + 1440 * MIN), endedAt: Timestamp.fromMillis(T0 + 1500 * MIN) }], gameIds: ["elden-ring"] });
  await site.collection("streams").doc("s2").set(s2);
  await fire("s2", null, s2);
  er = (await site.collection("vaultGames").doc("elden-ring").get()).data();
  assert.deepEqual([er.stats.streamCount, er.stats.minutes], [2, 120]);
  assert.equal((await col("activityLog")).filter((e) => e.type === "now-playing").length, nowPlayingBefore, "now playing is posted the first time only");
  // a stream that isn't ended, or touches no game, changes nothing
  await fire("s3", null, { state: "live", gameIds: ["elden-ring"], segments: [] });
  // a correction (the stream is hidden from stats by leaving "ended") heals the numbers
  await site.collection("streams").doc("s2").update({ state: "cancelled" });
  await fire("s2", s2, { ...s2, state: "cancelled" });
  er = (await site.collection("vaultGames").doc("elden-ring").get()).data();
  assert.deepEqual([er.stats.streamCount, er.stats.minutes], [1, 60]);

  // ---------- deleting: refused while a stream references the game ----------
  const e = await rejects(call("vaultDeleteGame", "owner1", { slug: "granny-chapter-two" }), "failed-precondition", "inStreams");
  assert.match(e.message, /Appears in 1 stream; set it to Abandoned instead/);
  // ... and while the Scream Planner uses it: on a ballot that is taking votes, or in a planned slot (details.reason inPlanner)
  await site.collection("planWeeks").doc("2026-W44").set({ state: "open", ballotSlugs: ["hell-carnage"] });
  await rejects(call("vaultDeleteGame", "owner1", { slug: "hell-carnage" }), "failed-precondition", "inPlanner");
  await site.collection("planWeeks").doc("2026-W44").update({ state: "published" });   // a published week's ballot is history, not a use
  await site.collection("streams").doc("slot1").set({ state: "planned", plannedGameIds: ["hell-carnage"] });
  await rejects(call("vaultDeleteGame", "owner1", { slug: "hell-carnage" }), "failed-precondition", "inPlanner");
  await site.collection("streams").doc("slot1").delete(); await site.collection("planWeeks").doc("2026-W44").delete();
  const before = (await col(`sites/${SITE}/vaultKeys`)).length;
  r = await call("vaultDeleteGame", "owner1", { slug: "hell-carnage" });
  assert.equal(r.ok, true);
  assert.equal((await site.collection("vaultGames").doc("hell-carnage").get()).exists, false);
  assert.equal((await site.collection("vaultGames").doc("hell-carnage").collection("private").doc("source").get()).exists, false, "subcollections go too");
  assert.ok((await col(`sites/${SITE}/vaultKeys`)).length < before);
  assert.equal((await col(`sites/${SITE}/vaultKeys`)).some((k) => k.slug === "hell-carnage"), false);
  assert.equal((await pub()).games.some((x) => x.slug === "hell-carnage"), false);
  assert.ok((await col("adminLog")).some((x) => x.action === "delete" && x.itemTitle === "Hell Carnage"));
  ptr = (await site.collection("private").doc("vaultDigest").get()).data();
  // a deleted game can be added again (its keys are gone)
  assert.equal((await call("vaultAddGame", "owner1", { input: { igdbId: 3002 } })).decision, "added");

  // ---------- covers: signed uploads ----------
  const sig = await call("vaultCoverSignature", "mod1", {});
  assert.equal(sig.fields.folder, "game-vault/covers"); assert.ok(/^[0-9a-f]{40}$/.test(sig.fields.signature));
  await rejects(call("vaultCoverSignature", "viewer1", {}), "permission-denied");
  await site.collection("vaultGames").doc("basement-dread").update({ cover: null });
  const sug = await call("vaultCoverSuggestSignature", "viewer1", { slug: "basement-dread" });
  assert.ok(sug.publicId.startsWith("game-vault/pending/p_")); assert.equal(sug.fields.type, "authenticated"); assert.equal(sug.fields.context, "owner=viewer1"); assert.equal(sug.fields.folder, undefined);
  await rejects(call("vaultCoverSuggestSignature", "viewer1", { slug: "granny-chapter-two" }), "failed-precondition", "hasCover");
  await rejects(call("vaultCoverSubmit", "viewer1", { publicId: "game-vault/covers/x", slug: "basement-dread" }), "invalid-argument");

  console.log("check-vault-emulator: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
