#!/usr/bin/env node
// functions/scripts/check-services-fn.js: the Service Hub backend (docs/specs/service-hub.md §3-§11). The pure rules in lib/services/logic.js;
// then (as the parts land) the callables and triggers against the in-memory Firestore, the rules text and the hooks. No network, no credentials.
//   npm run check   (or node scripts/check-services-fn.js)
const assert = require("assert/strict");
const L = require("../lib/services/logic");

// ---------- popularity ----------
assert.deepEqual(L.popularity({}), { n: 0, score: null, lovePct: 0, dislikePct: 0 });
assert.equal(L.popularity({ love: 2, like: 1, dislike: 1 }).score, 0.75, "(2·2 + 1 − 2·1) ÷ 4");
assert.equal(L.popularity({ love: 1 }).score, 2, "all love is the top score");
assert.equal(L.popularity({ dislike: 3 }).score, -2, "all Not for me is the bottom score");
assert.equal(L.popularity({ love: 1, like: 1, dislike: 2 }).lovePct, 25);
assert.equal(L.popularity({ love: 1, like: 1, dislike: 2 }).dislikePct, 50);

// ---------- who can use what ----------
const member = { member: true }, mod = { member: true, staff: true }, adm = { member: true, staff: true, admin: true }, owner = { owner: true }, visitor = {};
assert.ok(L.audienceOpen("everyone", visitor));
assert.ok(!L.audienceOpen("members", visitor) && L.audienceOpen("members", member));
assert.ok(!L.audienceOpen("crew", member) && L.audienceOpen("crew", mod));
assert.ok(!L.audienceOpen("admins", mod) && L.audienceOpen("admins", adm));
assert.ok(!L.audienceOpen("owner", adm) && L.audienceOpen("owner", owner));
assert.ok(L.audienceOpen("admins", owner), "the owner sees everything");

const svc = (o = {}) => ({ id: "x", type: "feature", status: "live", audience: "everyone", version: "1.0", ...o });
assert.ok(L.isCore(svc(), member));
for (const t of ["page", "arcadeGame", "streamSetup"]) assert.ok(L.isCore(svc({ type: t }), member), `${t} is core`);
for (const t of ["vaultGame", "stream", "adminTool", "video"]) assert.ok(!L.isCore(svc({ type: t }), member), `${t} isn't core`);
assert.ok(!L.isCore(svc({ status: "building" }), member), "only live services are core");
assert.ok(!L.isCore(svc({ hidden: true }), member), "a hidden service isn't core");
assert.ok(!L.isCore(svc({ audience: "crew" }), member) && L.isCore(svc({ audience: "crew" }), mod), "core is per member: crew services count for the crew");

const now = Date.UTC(2026, 9, 20);
assert.ok(L.canRate(svc(), member, now).ok);
assert.equal(L.canRate(svc({ status: "planned" }), member, now).reason, "notOpen");
assert.equal(L.canRate(svc({ hidden: true }), member, now).reason, "notOpen");
assert.equal(L.canRate(svc({ type: "adminTool", audience: "admins" }), adm, now).reason, "adminTool", "admin tools are never rated");
assert.equal(L.canRate(svc({ audience: "crew" }), member, now).reason, "notOpen");
assert.ok(L.canRate(svc({ type: "vaultGame" }), member, now).ok, "Vault games can be rated");
assert.ok(L.canRate(svc({ type: "stream", rateableUntil: now + 1 }), member, now).ok, "a stream within 14 days");
assert.equal(L.canRate(svc({ type: "stream", rateableUntil: now - 1 }), member, now).reason, "streamClosed", "a stream after 14 days");
assert.equal(L.canRate(svc({ type: "stream" }), member, now).reason, "streamClosed", "a stream with no end");

// ---------- versions, videos, tests ----------
assert.equal(L.compareVersions("1.0", "1.0"), 0);
assert.equal(L.compareVersions("1.0", "1"), 0, "1 and 1.0 are the same version");
assert.equal(L.compareVersions("1.0", "1.1"), -1);
assert.equal(L.compareVersions("1.10", "1.9"), 1, "numeric, not text");
assert.equal(L.compareVersions("v2", "1.9"), 1, "a leading v is ignored");
assert.equal(L.normalizeVersion("v1"), "1.0");
assert.equal(L.normalizeVersion("v1.2"), "1.2");
assert.equal(L.normalizeVersion("1.0"), "1.0");
assert.equal(L.normalizeVersion(""), "1.0");
assert.equal(L.videoState(null, "1.0"), "none");
assert.equal(L.videoState({ id: "abc", coversVersion: "1.0" }, "1.0"), "current");
assert.equal(L.videoState({ id: "abc", coversVersion: "1.1" }, "1.0"), "current", "a video of a later version still covers it");
assert.equal(L.videoState({ id: "abc", coversVersion: "1.0" }, "1.1"), "stale", "a version bump makes the video stale");
assert.equal(L.videoState({ id: "abc" }, "1.0"), "stale", "no version on the video: stale until an admin sets it");
assert.equal(L.testState(null, "1.0"), "none");
assert.equal(L.testState({ version: "1.0", result: "pass" }, "1.0"), "current");
assert.equal(L.testState({ version: "1.0", result: "pass" }, "1.1"), "old", "Not tested on v1.1");

// ---------- rated every core service ----------
assert.ok(L.ratedEveryCore(["a", "b"], { a: { value: "like" }, b: { value: "dislike" } }));
assert.ok(!L.ratedEveryCore(["a", "b"], { a: { value: "like" } }));
assert.ok(!L.ratedEveryCore([], {}), "nothing to rate isn't full coverage");

// ---------- coverage ----------
const full = svc({ checks: ["a", "b", "c"], ratings: { n: 3 }, video: { id: "v", coversVersion: "1.0" }, tests: { staging: { version: "1.0" }, production: { version: "1.0" } }, communityTests: { version: "1.0", pass: 2, problems: 0 } });
assert.equal(L.coverage(full), 100);
assert.equal(L.coverage(svc()), 0, "nothing done");
assert.equal(L.coverage({ ...full, version: "1.1" }), 20, "a version bump leaves only the ratings cell (1 of 5)");
assert.equal(L.coverage(svc({ type: "adminTool", tests: { staging: { version: "1.0" } } })), 33, "admin tools have no rating or member-test cells (1 of 3)");
assert.equal(L.coverageCells(svc()).memberTests, null, "no checks: no member-test cell");

// ---------- ratings ----------
assert.ok(L.validateRating({ value: "love" }).ok);
assert.ok(L.validateRating({ value: "like", comment: "" }).ok);
assert.equal(L.validateRating({ value: "meh" }).reason, "value");
assert.equal(L.validateRating({ value: "dislike" }).reason, "commentNeeded", "Not for me needs a comment");
assert.equal(L.validateRating({ value: "dislike", comment: "too short" }).reason, "commentNeeded", "under 10 characters");
assert.ok(L.validateRating({ value: "dislike", comment: "  The leaderboard never loads on my phone.  " }).ok);
assert.equal(L.validateRating({ value: "dislike", comment: "  The leaderboard never loads on my phone.  " }).value.comment, "The leaderboard never loads on my phone.", "trimmed");
assert.equal(L.validateRating({ value: "love", comment: "x".repeat(501) }).reason, "comment", "500 at most");
assert.equal(L.validateRating({ value: "love", comment: 5 }).reason, "comment");
let h = [];
for (let i = 0; i < 25; i++) h = L.pushHistory(h, { value: "like", version: "1.0", at: i });
assert.equal(h.length, 20, "the last 20 changes are kept");
assert.equal(h[0].at, 5, "the oldest are dropped");
const T = L.totalsOf([
  { value: "love", version: "1.0", comment: "great" }, { value: "like", version: "1.1" }, { value: "dislike", version: "1.1", comment: "slow on phones", hidden: true },
  { value: "love", version: "1.1", countable: false },   // an admin: kept, not counted
]);
assert.deepEqual([T.love, T.like, T.dislike, T.n, T.comments], [1, 1, 1, 3, 1], "owner and admin ratings and hidden comments are left out of the counts");
assert.deepEqual(T.byVersion, { "1_0": { love: 1, like: 0, dislike: 0 }, "1_1": { love: 0, like: 1, dislike: 1 } });

// ---------- tests ----------
const checks = ["Open the report form", "Attach a screenshot", "Send it"];
assert.equal(L.validateTest({ device: "phone", results: [] }, []).reason, "noChecks");
assert.equal(L.validateTest({ device: "tablet", results: [] }, checks).reason, "device");
assert.equal(L.validateTest({ device: "phone", results: [{ ok: true }] }, checks).reason, "results", "every check answered");
assert.equal(L.validateTest({ device: "phone", results: [{ ok: true }, { ok: false }, { ok: true }] }, checks).reason, "noteNeeded", "a problem needs a note");
const okTest = L.validateTest({ device: "desktop", results: [{ ok: true }, { ok: false, note: "The upload spinner never stops." }, { ok: true, note: "ignored" }] }, checks);
assert.ok(okTest.ok);
assert.equal(okTest.value.problems, 1);
assert.equal(okTest.value.results[2].note, "", "an OK keeps no note");
assert.equal(okTest.value.results[1].check, "Attach a screenshot");

// ---------- manifests and sync ----------
const man = (o = {}) => ({ id: "bug-zapper", name: "Bug Zapper", type: "feature", area: "Community", blurb: "Report it.", version: "1.0", status: "live", audience: "members", routes: ["/bug-zapper"], nav: "bugzapper", testPlan: null, checks: [], videoTag: "#bt-bug-zapper", sections: {}, talkBack: "note", help: null, ...o });
assert.ok(L.normalizeManifest(man()).ok);
assert.equal(L.normalizeManifest(man({ id: "Bug Zapper" })).reason, "manifest");
assert.equal(L.normalizeManifest(man({ type: "vaultGame" })).reason, "manifest", "Vault games and streams never come from manifests");
assert.equal(L.normalizeManifest(man({ talkBack: "maybe" })).reason, "manifest");
assert.equal(L.normalizeManifest(man({ blurb: " " })).reason, "manifest");
assert.equal(L.normalizeManifest(man({ routes: ["bug-zapper"] })).reason, "manifest");
assert.equal(L.normalizeManifest(man({ videoTag: "#nope" })).value.videoTag, "#bt-bug-zapper", "the video tag always follows the id");
assert.ok(L.needsSetup({ status: "live", blurb: "", area: "Play" }) && !L.needsSetup({ status: "live", blurb: "x", area: "Play" }) && !L.needsSetup({ status: "planned", blurb: "" }));
const norm = (o) => L.normalizeManifest(man(o)).value;
const existing = {
  "bug-zapper": { ...norm(), source: { manifest: true } },
  "feature-lab": { ...norm({ id: "feature-lab", name: "Feature Lab", routes: ["/feature-lab"] }), source: { manifest: true } },
  "old-thing": { ...norm({ id: "old-thing" }), source: { manifest: true } },
  "gone-already": { ...norm({ id: "gone-already" }), status: "retired", source: { manifest: true } },
  "vault-silent-hill": { id: "vault-silent-hill", type: "vaultGame", status: "live", source: { vault: "silent-hill" } },
  "tap-the-splat": { ...norm({ id: "tap-the-splat", type: "arcadeGame" }), version: "2.0", source: { manifest: true, arcade: "tapTheSplat" } },
};
const plan = L.planSync(existing, [norm(), norm({ id: "feature-lab", name: "Feature Lab", routes: ["/feature-lab"], version: "1.1" }), norm({ id: "tech-stack", name: "Tech Stack" }), norm({ id: "tap-the-splat", type: "arcadeGame", version: "1.0" })]);
assert.deepEqual(plan.create.map((m) => m.id), ["tech-stack"], "a new manifest makes a new item");
assert.deepEqual(plan.bump.map((b) => [b.id, b.from, b.to]), [["feature-lab", "1.0", "1.1"]], "a version change bumps");
assert.deepEqual(plan.update.map((u) => u.id), ["feature-lab"], "only what changed is written");
assert.deepEqual(plan.same.sort(), ["bug-zapper", "tap-the-splat"], "an Arcade game keeps its own version (no bump from the manifest)");
assert.deepEqual(plan.retire.map((r) => r.id), ["old-thing"], "a missing manifest retires its item; Vault games, streams and retired items are left alone");
const p2 = L.planSync({ x: { ...norm({ id: "x" }), source: { arcade: "x" } } }, [norm({ id: "x" })]);
assert.deepEqual(p2.update.map((u) => u.id), ["x"], "a manifest that meets an Arcade-made item adopts it");

// ---------- rows ----------
const item = { ...full, id: "bug-zapper", name: "Bug Zapper", area: "Community", blurb: "Report it.", routes: ["/bug-zapper"], versionHistory: [{ version: "1.0" }] };
assert.ok(!("versionHistory" in L.summaryRow(item)), "the summary leaves the history out");
assert.equal(L.summaryRow(item).coverage, 100);
const pub = L.publicRow(item);
assert.deepEqual(Object.keys(pub).sort(), ["area", "audience", "blurb", "checks", "id", "link", "name", "status", "type", "version"].sort(), "member-safe fields only");
assert.equal(pub.checks, 3, "the checks count, not the checks");
assert.equal(pub.link, "/bug-zapper");
assert.equal(L.publicRow({ ...item, type: "adminTool" }), null, "admin tools are excluded");
assert.equal(L.publicRow({ ...item, hidden: true }), null);
assert.equal(L.publicRow({ ...item, status: "retired" }), null);

// ---------- badge ladders ----------
assert.deepEqual(L.ratingBadges(0), []);
assert.deepEqual(L.ratingBadges(1), ["services-first-rating"]);
assert.deepEqual(L.ratingBadges(25), ["services-first-rating", "services-rated-10", "services-rated-25"]);
assert.deepEqual(L.testerBadges(5), ["services-tester-1", "services-tester-5"]);
assert.deepEqual(L.vaultBadges(4), []);
assert.deepEqual(L.vaultBadges(30), ["vault-critic-5", "vault-critic-15", "vault-critic-30"]);
assert.equal(L.BADGE_IDS.length, 12, "first rating, Critic I-IV, Full Coverage, Tester I-III, Vault Critic I-III");

// ---------- rate limits ----------
assert.ok(!L.overLimit("rate", 59) && L.overLimit("rate", 60), "60 ratings an hour");
assert.ok(!L.overLimit("test", 9) && L.overLimit("test", 10), "10 tests an hour");
assert.equal(L.periodKey("rate", Date.UTC(2026, 9, 20, 14, 59)), "2026-10-20T14");
assert.ok(L.skipsLimits({ isAdmin: true }) && !L.skipsLimits({ isMod: true }));

console.log("check-services-fn: logic ok");
// ================================================================================================ wiring (lib/services against the in-memory Firestore)
const { makeDb } = require("./fixtures/fake-firestore");
const admin = require("firebase-admin");
process.env.GCLOUD_PROJECT ||= "boomertanger-staging";
process.env.FIREBASE_CONFIG ||= JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const wdb = makeDb(); const realFs = admin.firestore;
const fakeFs = () => wdb; fakeFs.Timestamp = realFs.Timestamp; fakeFs.FieldValue = realFs.FieldValue;
Object.defineProperty(admin, "firestore", { value: fakeFs, configurable: true, writable: true });

const SITE = "sites/boomertanger", BASE = `${SITE}/services/main`;
let clock = Date.UTC(2026, 9, 20, 15, 0);
const logs = [];
const adminLogEntry = async (_d, f) => { logs.push(f); return { ...f, createdAt: realFs.Timestamp.now() }; };
const hub = require("../lib/services").build({ adminLogEntry, now: () => clock });
const fns = hub.functions;
const call = (uid, fn, data = {}) => fns[fn].run({ auth: uid ? { uid, token: { email_verified: true } } : undefined, data });
const why = async (p) => { try { await p; return "ok"; } catch (e) { return (e.details && e.details.reason) || e.code || e.message; } };
const get = async (p) => { const s = await wdb.doc(p).get(); return s.exists ? s.data() : null; };
const { readManifests } = require("./sync-services");
/** A rating as the callable writes it, then the trigger body (the fake has no triggers). */
const rateAs = async (uid, data) => { const before = await get(`${BASE}/ratings/${data.serviceId}__${uid}`); const r = await call(uid, "serviceRate", data); await hub.ratingWritten(before, await get(`${BASE}/ratings/${data.serviceId}__${uid}`)); return r; };

(async () => {
  await wdb.doc(SITE).set({ ownerUid: "boss" });
  for (const [uid, roles, handle] of [["boss", ["admin"], "boomertanger"], ["adm", ["admin"], "adm"], ["mod", ["mod"], "modd"], ["fan", [], "fan"], ["fan2", [], "fan2"], ["nohandle", [], null]]) {
    await wdb.doc(`${SITE}/members/${uid}`).set({ roles });
    if (handle) await wdb.doc(`${SITE}/profiles/${uid}`).set({ handle, displayName: handle });
  }

  // ---------- serviceSync: the repo's manifests ----------
  const { list, hash } = readManifests();
  assert.equal(await why(call("fan", "serviceSync", { manifests: list, buildHash: hash })), "notAdmin", "admins only");
  assert.equal(await why(call("adm", "serviceSync", { manifests: list })), "buildHash", "the build hash is required");
  const dry = await hub.syncManifests(list, { buildHash: hash, apply: false });
  assert.equal(dry.applied, false);
  assert.equal(dry.create.length, list.length, "a dry run plans every manifest and writes nothing");
  assert.equal((await wdb.collection(`${BASE}/items`).get()).size, 0);
  const s1 = await call("adm", "serviceSync", { manifests: list, buildHash: hash });
  assert.equal(s1.create.length, list.length);
  assert.equal((await get(BASE)).buildHash, hash, "the build hash is kept for /admin/services to compare");
  const bz = await get(`${BASE}/items/bug-zapper`);
  assert.equal(bz.status, "live"); assert.equal(bz.source.manifest, true); assert.equal(bz.versionHistory.length, 1); assert.equal(bz.ratings.n, 0);
  const pub = (await get(`${SITE}/public/services`)).services;
  assert.ok(pub.some((p) => p.id === "bug-zapper") && !pub.some((p) => p.type === "adminTool"), "public/services: member-safe rows, no admin tools");
  assert.ok(!pub.some((p) => "ratings" in p), "no counts in public");
  const sum = await get(`${BASE}/summary/main`);
  assert.equal(Object.keys(sum.rows).length, list.length, "one summary row per service");
  assert.ok(logs.some((l) => l.feature === "serviceHub" && l.action === "sync"), "adminLog serviceHub sync");
  // a version bump, a renamed blurb, a manifest gone
  const edited = list.filter((m) => m.id !== "shop").map((m) => (m.id === "bug-zapper" ? { ...m, version: "1.1" } : m.id === "feature-lab" ? { ...m, blurb: "Ideas, votes, ships." } : m));
  const s2 = await hub.syncManifests(edited, { buildHash: "a".repeat(64), apply: true, actor: { uid: "adm", name: "@adm" } });
  assert.deepEqual(s2.bump, ["bug-zapper 1.0 → 1.1"]);
  assert.deepEqual(s2.update.sort(), ["bug-zapper", "feature-lab"]);
  assert.deepEqual(s2.retire, ["shop"]);
  assert.equal((await get(`${BASE}/items/bug-zapper`)).versionHistory.length, 2, "a version change appends versionHistory");
  assert.equal((await get(`${BASE}/items/shop`)).status, "retired", "a missing manifest retires its item, never deleting it");
  assert.equal((await hub.syncManifests(edited, { buildHash: "a".repeat(64), apply: true })).retire.length, 0, "a retired item isn't retired again");
  assert.equal(await why(hub.syncManifests([{ id: "Bad Id" }], { apply: false })), "manifest", "a bad manifest is refused");

  // ---------- the item triggers ----------
  // the Arcade game meets its manifest (tap-the-splat): the game's version wins, a stats roll-up does nothing
  await hub.onArcadeGame("tapTheSplat", null, { title: "Tap the Splat", slug: "tap-the-splat", tagline: "Splat them", status: "live", currentVersion: "v1" });
  let tts = await get(`${BASE}/items/tap-the-splat`);
  assert.equal(tts.source.arcade, "tapTheSplat"); assert.equal(tts.source.manifest, true); assert.equal(tts.version, "1.0"); assert.equal(tts.name, "Tap the Splat");
  assert.deepEqual(await hub.onArcadeGame("tapTheSplat", { title: "Tap the Splat", slug: "tap-the-splat", status: "live", currentVersion: "v1", runs: 1 }, { title: "Tap the Splat", slug: "tap-the-splat", status: "live", currentVersion: "v1", runs: 2 }), { skipped: true }, "a roll-up of the stats is skipped");
  await hub.onArcadeGame("tapTheSplat", { title: "Tap the Splat", slug: "tap-the-splat", status: "live", currentVersion: "v1" }, { title: "Tap the Splat", slug: "tap-the-splat", status: "live", currentVersion: "v2" });
  tts = await get(`${BASE}/items/tap-the-splat`);
  assert.equal(tts.version, "2.0", "a new Arcade version bumps the service");
  assert.ok(tts.versionHistory.some((h) => h.version === "2.0"));
  assert.equal((await hub.syncManifests(edited, { buildHash: "a".repeat(64), apply: false })).bump.length, 0, "the manifest's 1.0 doesn't undo the game's 2.0");
  await hub.onArcadeGame("splatRush", null, { title: "Splat Rush", slug: "splat-rush", status: "draft", currentVersion: "v1" });
  assert.equal((await get(`${BASE}/items/splat-rush`)).status, "building", "a game that isn't live is building");
  // a Vault game: one item per non-hidden game; hidden retires it
  await hub.onVaultGame("silent-hill-2", null, { title: "Silent Hill 2", hidden: false });
  assert.equal((await get(`${BASE}/items/vault-silent-hill-2`)).type, "vaultGame");
  assert.deepEqual(await hub.onVaultGame("silent-hill-2", { title: "Silent Hill 2", hidden: false, editCount: 1 }, { title: "Silent Hill 2", hidden: false, editCount: 2 }), { skipped: true });
  await hub.onVaultGame("silent-hill-2", { title: "Silent Hill 2", hidden: false }, { title: "Silent Hill 2", hidden: true });
  assert.equal((await get(`${BASE}/items/vault-silent-hill-2`)).status, "retired", "a hidden Vault game is retired");
  await hub.onVaultGame("silent-hill-2", { title: "Silent Hill 2", hidden: true }, { title: "Silent Hill 2", hidden: false });
  assert.equal((await get(`${BASE}/items/vault-silent-hill-2`)).status, "live", "and back when it shows again");
  // a stream reaching Ended: rateable for 14 days
  const ended = clock - 1000;
  await hub.onStreamEnded("dry-run", { state: "live" }, { state: "ended", title: "Dry run", actualEnd: realFs.Timestamp.fromMillis(ended) });
  const st = await get(`${BASE}/items/stream-dry-run`);
  assert.equal(st.type, "stream"); assert.equal(st.rateableUntil, ended + 14 * L.DAY);
  assert.deepEqual(await hub.onStreamEnded("dry-run", { state: "ended" }, { state: "ended", title: "Dry run" }), { skipped: true }, "only the move to Ended");

  // ---------- serviceRate ----------
  assert.equal(await why(call(null, "serviceRate", { serviceId: "bug-zapper", value: "love" })), "signedOut");
  assert.equal(await why(call("nohandle", "serviceRate", { serviceId: "bug-zapper", value: "love" })), "needsSignup", "signed-up members only");
  assert.equal(await why(call("fan", "serviceRate", { serviceId: "nope", value: "love" })), "noService");
  assert.equal(await why(call("fan", "serviceRate", { serviceId: "bug-zapper", value: "dislike" })), "commentNeeded");
  assert.equal(await why(call("fan", "serviceRate", { serviceId: "crew-admin", value: "like" })), "adminTool", "admin tools aren't rated");
  assert.equal(await why(call("fan", "serviceRate", { serviceId: "mod-deck", value: "like" })), "notOpen", "a crew service isn't open to a member");
  assert.equal(await why(call("fan", "serviceRate", { serviceId: "contests", value: "like" })), "notOpen", "a planned service can't be rated");
  assert.equal(await why(call("fan", "serviceRate", { serviceId: "shop", value: "like" })), "notOpen", "a retired service can't be rated");
  const r1 = await rateAs("fan", { serviceId: "bug-zapper", value: "love" });
  assert.equal(r1.version, "1.1"); assert.equal(r1.changed, true);
  await rateAs("fan2", { serviceId: "bug-zapper", value: "dislike", comment: "The form loses my text on phones." });
  await rateAs("adm", { serviceId: "bug-zapper", value: "dislike", comment: "Admins rate too, quietly." });
  let item = await get(`${BASE}/items/bug-zapper`);
  assert.deepEqual([item.ratings.love, item.ratings.dislike, item.ratings.n, item.ratings.comments], [1, 1, 2, 1], "the admin's rating is stored but not counted");
  assert.equal(item.ratings.score, 0, "(2 − 2) ÷ 2");
  assert.equal((await get(`${BASE}/ratings/bug-zapper__adm`)).countable, false);
  assert.equal((await get(`${SITE}/services/main/summary/main`)).rows["bug-zapper"].ratings.n, 2, "the summary row follows");
  await rateAs("fan", { serviceId: "bug-zapper", value: "like" });
  const fanR = await get(`${BASE}/ratings/bug-zapper__fan`);
  assert.equal(fanR.value, "like"); assert.equal(fanR.history.length, 2, "each change is kept in history");
  assert.equal(fanR.history[0].value, "love");
  let my = await get(`${BASE}/my/fan`);
  assert.equal(my.rated["bug-zapper"].value, "like");
  assert.ok(my.coreTotal > 10 && my.coreRated === 1, "core services open to a member");
  assert.ok((await get(`${BASE}/my/mod`)) === null);
  // a stream: within 14 days yes, after no
  await rateAs("fan", { serviceId: "stream-dry-run", value: "love" });
  clock += 15 * L.DAY;
  assert.equal(await why(call("fan", "serviceRate", { serviceId: "stream-dry-run", value: "like" })), "streamClosed");
  // 60 ratings an hour, then refused; admins skip it
  await wdb.doc(`${BASE}/items/home`).get();
  let n = 0; while ((await why(call("fan2", "serviceRate", { serviceId: "home", value: n % 2 ? "like" : "love" }))) === "ok") n++;
  assert.equal(n, 60, "60 an hour (a new hour after the clock moved 15 days)");
  assert.equal(await why(call("fan2", "serviceRate", { serviceId: "home", value: "love" })), "rateLimit");
  assert.equal(await why(call("adm", "serviceRate", { serviceId: "home", value: "love" })), "ok");
  // an admin hid a comment: it stays hidden while the comment doesn't change
  await call("adm", "serviceAdmin", { action: "hideComment", serviceId: "bug-zapper", uid: "fan2", hidden: true });
  await hub.ratingWritten(null, await get(`${BASE}/ratings/bug-zapper__fan2`));
  assert.equal((await get(`${BASE}/items/bug-zapper`)).ratings.comments, 0, "a hidden comment isn't counted");

  // ---------- serviceTest ----------
  assert.equal(await why(call("fan", "serviceTest", { serviceId: "bug-zapper", device: "phone", results: [] })), "noChecks", "no checks yet");
  await wdb.doc(`${BASE}/items/bug-zapper`).update({ checks: ["Open the report form", "Attach a screenshot", "Send it"] });
  assert.equal(await why(call("fan", "serviceTest", { serviceId: "bug-zapper", device: "tablet", results: [] })), "device");
  const res = [{ ok: true }, { ok: false, note: "The spinner never stops." }, { ok: true }];
  const t1 = await call("fan", "serviceTest", { serviceId: "bug-zapper", device: "phone", results: res });
  assert.deepEqual([t1.counted, t1.problems], [true, 1]);
  const t2 = await call("fan", "serviceTest", { serviceId: "bug-zapper", device: "desktop", results: [{ ok: true }, { ok: true }, { ok: true }] });
  assert.deepEqual([t2.counted, t2.already], [false, true], "one counted test per member per version");
  await hub.testCreated(await get(`${BASE}/tests/bug-zapper__fan__1.1`));
  await call("fan2", "serviceTest", { serviceId: "bug-zapper", device: "desktop", results: [{ ok: true }, { ok: true }, { ok: true }] });
  await hub.testCreated(await get(`${BASE}/tests/bug-zapper__fan2__1.1`));
  item = await get(`${BASE}/items/bug-zapper`);
  assert.deepEqual(item.communityTests, { version: "1.1", pass: 1, problems: 1, devices: { phone: 1, desktop: 1 } });
  assert.equal((await get(`${BASE}/my/fan`)).tested["bug-zapper"], "1.1");
  let tn = 0; for (const id of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]) { await wdb.doc(`${BASE}/items/t-${id}`).set({ id: `t-${id}`, type: "feature", status: "live", audience: "everyone", version: "1.0", checks: ["x", "y", "z"] }); if ((await why(call("fan2", "serviceTest", { serviceId: `t-${id}`, device: "phone", results: [{ ok: true }, { ok: true }, { ok: true }] }))) === "ok") tn++; }
  assert.equal(tn, 9, "10 tests an hour (one was used above)");

  // ---------- serviceAdmin ----------
  assert.equal(await why(call("mod", "serviceAdmin", { action: "retire", serviceId: "home" })), "notAdmin");
  assert.equal(await why(call("adm", "serviceAdmin", { action: "explode", serviceId: "home" })), "action");
  assert.equal(await why(call("adm", "serviceAdmin", { action: "markTested", serviceId: "bug-zapper", env: "staging", result: "issues" })), "note", "issues need a note");
  await call("adm", "serviceAdmin", { action: "markTested", serviceId: "bug-zapper", env: "staging", result: "pass" });
  assert.equal(await why(call("adm", "serviceAdmin", { action: "setCoversVersion", serviceId: "bug-zapper", version: "1.0" })), "noVideo");
  assert.equal(await why(call("adm", "serviceAdmin", { action: "linkVideo", serviceId: "bug-zapper", videoId: "not a video id!" })), "videoId");
  await call("adm", "serviceAdmin", { action: "linkVideo", serviceId: "bug-zapper", videoId: "dQw4w9WgXcQ", title: "Bug Zapper in 60 seconds" });
  item = await get(`${BASE}/items/bug-zapper`);
  assert.equal(item.tests.staging.version, "1.1"); assert.equal(item.video.coversVersion, "1.1", "a video covers the version it was linked at");
  await call("adm", "serviceAdmin", { action: "setCoversVersion", serviceId: "bug-zapper", version: "1.0" });
  assert.equal((await get(`${BASE}/summary/main`)).rows["bug-zapper"].videoState, "stale", "a video of 1.0 on 1.1 is stale");
  await call("adm", "serviceAdmin", { action: "hide", serviceId: "feature-lab", hidden: true });
  assert.ok(!(await get(`${SITE}/public/services`)).services.some((p) => p.id === "feature-lab"), "a hidden service leaves the public list");
  await call("adm", "serviceAdmin", { action: "retire", serviceId: "goal-tracker" });
  assert.equal((await get(`${BASE}/items/goal-tracker`)).status, "retired");
  for (const a of ["markTested", "linkVideo", "setCoversVersion", "hideComment", "hide", "retire"]) assert.ok(logs.some((l) => l.feature === "serviceHub" && l.action === a), `adminLog ${a}`);


  // ---------- rules (the text of firestore.rules) ----------
  {
    const path = require("path");
    const rules = require("fs").readFileSync(path.join(__dirname, "..", "..", "firestore.rules"), "utf8").replace(/\r\n/g, "\n");
    const start = rules.indexOf("// ---------- Service Hub (docs/specs/service-hub.md");
    assert.ok(start > 0, "the Service Hub rules are there");
    const block = rules.slice(start, rules.indexOf("// ---------- Growth collector", start));
    for (const m of ["match /services/main {", "match /items/{serviceId}", "match /ratings/{ratingId}", "match /tests/{testId}", "match /my/{uid}", "match /summary/{docId}"]) assert.ok(block.includes(m), m);
    const writes = [...block.matchAll(/allow write: if ([^;]+);/g)].map((x) => x[1].trim());
    assert.equal(writes.length, 6, "every Service Hub match closes writes");
    assert.ok(writes.every((w) => w === "false"), "every write is false");
    assert.ok(!/allow (create|update|delete)/.test(block), "no create, update or delete anywhere");
    const reads = [...block.matchAll(/allow read: if ([^;]+);/g)].map((x) => x[1].trim());
    assert.equal(reads.filter((r) => r === "hasSiteRole(siteId, 'admin')").length, 3, "the main doc, items and the summary: admins only");
    assert.equal(reads.filter((r) => r === "hasSiteRole(siteId, 'admin') || (request.auth != null && resource.data.uid == request.auth.uid)").length, 2, "ratings and tests: admins, or that member's own");
    assert.ok(reads.includes("request.auth != null && request.auth.uid == uid"), "my/{uid}: that member only");
  }
  console.log("check-services-fn: wiring and rules ok");
})().catch((err) => { console.error(err); process.exit(1); });

