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
