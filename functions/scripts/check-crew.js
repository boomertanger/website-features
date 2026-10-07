#!/usr/bin/env node
// functions/scripts/check-crew.js: Mod Machina checks (docs/specs/mod-machina.md) against an in-memory
// Firestore (scripts/fixtures/fake-firestore.js). No credentials needed.
//   npm run check      (or node scripts/check-crew.js)
const assert = require("assert/strict");
const admin = require("firebase-admin");
const { makeDb } = require("./fixtures/fake-firestore");

process.env.GCLOUD_PROJECT ||= "boomertanger-staging";
process.env.FIREBASE_CONFIG ||= JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });

const db = makeDb();
const real = admin.firestore;
const fake = () => db;
fake.Timestamp = real.Timestamp; fake.FieldValue = real.FieldValue;
Object.defineProperty(admin, "firestore", { value: fake, configurable: true, writable: true });

const L = require("../lib/crew/logic");
const { paths, loadSettings } = require("../lib/crew/settings");
const S = "sites/boomertanger";
const reason = async (p) => { try { await p; return "ok"; } catch (e) { return e.details?.reason || e.message; } };

async function main() {
  // ---------- part 1: data model, settings, claims ----------
  // Grades and the claim values: 1-4 on the mod track, "A1"-"A3" on the admin track.
  assert.equal(L.claimGrade({ track: "mod", grade: 1 }), 1);
  assert.equal(L.claimGrade({ track: "mod", grade: 4 }), 4);
  assert.equal(L.claimGrade({ track: "mod", grade: 5 }), null);
  assert.equal(L.claimGrade({ track: "admin", grade: 2 }), "A2");
  assert.equal(L.claimGrade({ track: "admin", grade: 4 }), null);
  assert.equal(L.claimGrade(null), null);
  assert.deepEqual(L.publicCrew({ track: "mod", grade: 2, status: "checkIn", private: "x", gears: 99 }), { grade: 2, track: "mod", status: "checkIn" });
  assert.deepEqual(L.publicCrew({ track: "admin", grade: 3, status: "bogus" }), { grade: 3, track: "admin", status: "active" });
  assert.equal(L.gradeName("mod", 2), "Watcher");
  assert.equal(L.gradeName("admin", 3), "Right Hand");

  // Settings: the defaults from the prompt, the document wins, a first load writes them.
  const d = L.DEFAULT_SETTINGS;
  assert.equal(d.youtubeBoost, 1.5); assert.equal(d.activityRules, false); assert.equal(d.checkinFallback, true);
  assert.equal(d.recruitCapPerMonth, 10); assert.equal(d.vouchCap, 3); assert.equal(d.appExpiryDays, 90); assert.equal(d.reapplyDays, 60);
  assert.equal(d.gearsValues.dutyCaptainPerHour, 12); assert.equal(d.gearsValues.recruitActivated, 10); assert.equal(d.gearsValues.academyModule, 5);
  assert.equal(d.twitchSync, false);
  assert.equal((await loadSettings(db)).vouchCap, 3);
  assert.equal((await db.doc(paths.settings()).get()).get("youtubeBoost"), 1.5);
  await db.doc(paths.settings()).update({ vouchCap: 5, "gearsValues.academyModule": 7 });
  const merged = await loadSettings(db);
  assert.equal(merged.vouchCap, 5); assert.equal(merged.gearsValues.academyModule, 7); assert.equal(merged.gearsValues.dutyCaptainPerHour, 12);

  // The roster mirror: roster -> profiles/{uid}.crew (public subset) and members/{uid}.crewGrade / crewStatus.
  const fns = require("../lib/crew")({ adminLogEntry: async () => ({}) });
  await db.doc(`${S}/members/m1`).set({ roles: ["mod"] });
  await db.doc(`${S}/profiles/m1`).set({ handle: "m1" });
  const fire = async (uid, before, after) => {
    const snap = (d) => ({ exists: !!d, data: () => d });
    if (after) await db.doc(paths.roster(uid)).set(after); else await db.doc(paths.roster(uid)).delete();
    await fns.mirrorCrewRoster.run({ params: { siteId: "boomertanger", uid }, data: { before: snap(before), after: snap(after) } });
  };
  await fire("m1", null, { track: "mod", grade: 1, status: "active", gears: 5 });
  assert.deepEqual((await db.doc(`${S}/profiles/m1`).get()).get("crew"), { grade: 1, track: "mod", status: "active" });
  assert.equal((await db.doc(`${S}/members/m1`).get()).get("crewGrade"), 1);
  assert.equal((await db.doc(`${S}/members/m1`).get()).get("crewStatus"), "active");
  assert.deepEqual((await db.doc(`${S}/members/m1`).get()).get("roles"), ["mod"]);   // roles untouched
  await fire("m1", {}, { track: "admin", grade: 2, status: "checkIn" });
  assert.equal((await db.doc(`${S}/members/m1`).get()).get("crewGrade"), "A2");
  await fire("m1", {}, null);
  assert.equal((await db.doc(`${S}/members/m1`).get()).get("crewGrade"), undefined);
  assert.equal((await db.doc(`${S}/profiles/m1`).get()).get("crew"), undefined);
  await fire("ghost", null, { track: "mod", grade: 1, status: "active" });   // no profile or member yet: nothing to mirror, no throw

  // setMemberRole: admins and the owner can no longer grant or remove "mod"; the owner still manages admins.
  await db.doc(S).set({ ownerUid: "boss" });
  await db.doc(`${S}/members/boss`).set({ roles: ["admin"] });
  await db.doc(`${S}/members/adm`).set({ roles: ["admin"] });
  await db.doc(`${S}/members/fan`).set({ roles: [] });
  await db.doc(`${S}/profiles/boss`).set({ handle: "boss" });
  const acc = require("../lib/accounts")({ adminLogEntry: async () => ({}) });
  const setRole = (uid, data) => acc.setMemberRole.run({ auth: { uid, token: {} }, data });
  assert.equal(await reason(setRole("adm", { uid: "fan", role: "mod", on: true })), "useCrew");
  assert.equal(await reason(setRole("boss", { uid: "fan", role: "mod", on: true })), "useCrew");
  assert.equal(await reason(setRole("boss", { uid: "m1", role: "mod", on: false })), "useCrew");
  assert.equal(await reason(setRole("adm", { uid: "fan", role: "admin", on: true })), "notOwner");
  assert.equal(await reason(setRole("boss", { uid: "fan", role: "admin", on: true })), "ok");
  assert.deepEqual((await db.doc(`${S}/members/fan`).get()).get("roles"), ["admin"]);


  // ---------- part 2a: apply, queue, decide, grades and status ----------
  const NOW = Date.now(), DAY = 86400000, T = admin.firestore.Timestamp;
  // pure: queue score and bands
  assert.deepEqual(L.queueScore({ vouchGrades: [2, 3, 4], prefs: { ytVertical: "happy" }, checkins: 5 }), { score: 1 + 2 + 3 + 3 + 5, vouches: 6, youtube: 3, checkins: 5 });
  assert.equal(L.queueScore({ vouchGrades: [], prefs: { ytLandscape: "ifNeeded", ytVertical: "no" }, checkins: 0 }).score, 0);
  assert.equal(L.queueScore({ vouchGrades: [4], prefs: { ytLandscape: "favourite" }, checkins: 1 }).score, 7);
  const ranked = L.rankQueue(Array.from({ length: 7 }, (_, i) => ({ id: `a${i}`, score: 10 - i, createdAtMs: i })));
  assert.deepEqual(ranked.map((r) => r.band), ["Top 5", "Top 5", "Top 5", "Top 5", "Top 5", "In the queue", "In the queue"]);
  assert.equal(L.rankQueue([{ id: "late", score: 3, createdAtMs: 9 }, { id: "early", score: 3, createdAtMs: 1 }])[0].id, "early");   // ties: earlier first
  assert.equal(L.checkinsWithin(["2026-10-01", "2026-09-10", "2026-08-01", "2026-10-01"], "2026-10-06"), 2);
  // pure: who may apply
  const elig = (o) => L.applyEligibility({ ageBand: "18+", signedUpAtMs: NOW - 20 * DAY, linkedCount: 1, checkins: 3, waived: false, now: NOW, settings: L.DEFAULT_SETTINGS, ...o }).reason || "ok";
  assert.equal(elig({}), "ok");
  assert.equal(elig({ ageBand: "13-17" }), "under18");
  assert.equal(elig({ signedUpAtMs: NOW - 13 * DAY }), "tooNew");
  assert.equal(elig({ linkedCount: 0 }), "noPlatform");
  assert.equal(elig({ checkins: 2 }), "needsCheckins");
  assert.equal(elig({ checkins: 0, waived: true }), "ok");
  assert.equal(elig({ crewStatus: "active" }), "alreadyCrew");
  assert.equal(elig({ crewStatus: "alumni" }), "ok");
  assert.equal(elig({ openApp: true }), "openApplication");
  assert.equal(elig({ lastNotNowAtMs: NOW - 30 * DAY }), "reapplyWait");
  assert.equal(elig({ lastNotNowAtMs: NOW - 61 * DAY }), "ok");
  assert.equal(elig({ settings: { ...L.DEFAULT_SETTINGS, checkinFallback: false } }), "needsStreamCheckins");
  // pure: the "ready to promote" criteria (spec 3a); duty criteria wait for stream duty
  const mods = [1, 2, 3, 4, 5, 6].map(L.moduleId);
  const ready = (o) => L.promotionCriteria({ now: NOW, settings: L.DEFAULT_SETTINGS, ...o });
  assert.equal(ready({ roster: { track: "mod", grade: 1, status: "active", gradeSince: NOW - 31 * DAY }, passed: mods }).ready, true);
  assert.equal(ready({ roster: { track: "mod", grade: 1, status: "active", gradeSince: NOW - 29 * DAY }, passed: mods }).ready, false);
  assert.equal(ready({ roster: { track: "mod", grade: 1, status: "active", gradeSince: NOW - 31 * DAY }, passed: mods.slice(0, 5) }).missing[0], "Core Academy modules 1 to 6");
  assert.deepEqual(ready({ roster: { track: "mod", grade: 1, status: "active", gradeSince: NOW - 31 * DAY }, passed: mods }).pending, ["2 ride-alongs signed off", "Showed up for 80% of duties"]);
  const onRules = { ...L.DEFAULT_SETTINGS, activityRules: true };
  assert.equal(ready({ roster: { track: "mod", grade: 1, status: "active", gradeSince: NOW - 31 * DAY }, passed: mods, settings: onRules }).ready, false);
  assert.equal(ready({ roster: { track: "mod", grade: 1, status: "active", gradeSince: NOW - 31 * DAY }, passed: mods, settings: onRules, stats: { rideAlongs: 2, showedPct: 80 } }).ready, true);
  assert.equal(ready({ roster: { track: "mod", grade: 2, status: "active", gradeSince: NOW - 91 * DAY }, passed: [...mods, "m9"] }).ready, true);
  assert.equal(ready({ roster: { track: "mod", grade: 2, status: "active", gradeSince: NOW - 91 * DAY }, passed: [...mods, "m9"], strikes: 1 }).ready, false);
  assert.equal(ready({ roster: { track: "mod", grade: 2, status: "active", gradeSince: NOW - 91 * DAY }, passed: mods }).ready, false);   // no Safety module
  assert.equal(ready({ roster: { track: "mod", grade: 4, status: "active", gradeSince: 0 } }).ready, false);   // Sentinels aren't flagged
  assert.equal(ready({ roster: { track: "admin", grade: 1, status: "active", gradeSince: 0 } }).ready, false);

  await db.doc(paths.settings()).update({ vouchCap: 3, "gearsValues.academyModule": 5 });   // (part 1 tuned them)
  // the callables, against the fake Firestore
  const logs = [];
  const C = require("../lib/crew")({ adminLogEntry: async (_d, e) => { logs.push(e); return e; } });
  const as = (uid) => (fn, data = {}) => C[fn].run({ auth: { uid, token: {} }, data });
  const person = async (uid, { roles = [], roster = null, user = {} } = {}) => {
    await db.doc(`${S}/members/${uid}`).set({ roles });
    await db.doc(`${S}/profiles/${uid}`).set({ handle: uid });
    await db.doc(`users/${uid}`).set({ signedUpAt: T.fromMillis(NOW - 30 * DAY), ageBand: "18+", linked: { twitch: { login: uid } }, ...user });
    if (roster) await db.doc(paths.roster(uid)).set({ status: "active", since: T.fromMillis(NOW - 200 * DAY), gradeSince: T.fromMillis(NOW - 100 * DAY), stats: {}, ...roster });
  };
  const streakDays = (uid, n) => db.doc(`${S}/factory/main/streaks/${uid}`).set({ recentDays: Array.from({ length: n }, (_, i) => require("../lib/arcade/logic").dayKey(NOW - i * DAY)) });
  await person("boss", { roles: ["admin"] });
  await person("init", { roles: ["mod"], roster: { track: "mod", grade: 1 } });
  await person("w1", { roles: ["mod"], roster: { track: "mod", grade: 2 } });
  await person("w2", { roles: ["mod"], roster: { track: "mod", grade: 3 } });
  await person("sent", { roles: ["mod"], roster: { track: "mod", grade: 4 } });
  await person("ov", { roles: ["admin"], roster: { track: "admin", grade: 2 } });
  await person("rh", { roles: ["admin"], roster: { track: "admin", grade: 3 } });
  await person("fan", {});
  const boss = as("boss"), initiate = as("init"), w1 = as("w1"), w2 = as("w2"), ov = as("ov"), rh = as("rh");
  const goodApp = (extra = {}) => ({ preferences: { twitch: "happy", ytLandscape: "favourite", ytVertical: "no", tiktok: "no" }, availability: { days: ["mon", "fri"], note: "evenings" }, device: "phone", answers: { why: "I love this community and want to help it grow.", experience: "Modded a small channel." }, codeAgreed: true, ...extra });

  // crewApply: the gates, then one open application
  await person("apl", {}); await streakDays("apl", 3);
  await person("kid", { user: { ageBand: "13-17" } }); await streakDays("kid", 5);
  await person("newbie", { user: { signedUpAt: T.fromMillis(NOW - 5 * DAY) } }); await streakDays("newbie", 5);
  await person("nolink", { user: { linked: {} } }); await streakDays("nolink", 5);
  await person("quiet", {}); await streakDays("quiet", 2);
  assert.equal(await reason(as("kid")("crewApply", goodApp())), "under18");
  assert.equal(await reason(as("newbie")("crewApply", goodApp())), "tooNew");
  assert.equal(await reason(as("nolink")("crewApply", goodApp())), "noPlatform");
  assert.equal(await reason(as("quiet")("crewApply", goodApp())), "needsCheckins");
  await boss("crewWaive", { uid: "quiet" });
  assert.equal(await reason(as("quiet")("crewApply", goodApp())), "ok");   // waived
  assert.equal(await reason(as("apl")("crewApply", goodApp({ codeAgreed: false }))), "code");
  assert.equal(await reason(as("apl")("crewApply", goodApp({ device: "fax" }))), "field");
  assert.equal(await reason(as("apl")("crewApply", goodApp({ answers: { why: "short" } }))), "field");
  assert.equal(await reason(w1("crewWaive", { uid: "x" })), "notOwner");
  const applied = await as("apl")("crewApply", goodApp());
  assert.match(applied.appId, /^apl-/);
  assert.equal(await reason(as("apl")("crewApply", goodApp())), "openApplication");
  assert.equal(await reason(as("init")("crewApply", goodApp())), "alreadyCrew");
  const appDoc = () => db.doc(paths.application(applied.appId)).get();
  assert.equal((await appDoc()).get("band"), "Top 5");   // the only one in the queue
  assert.equal((await appDoc()).get("score"), undefined);                       // the applicant-readable doc never carries the score
  assert.equal((await db.doc(paths.score(applied.appId)).get()).get("score"), 3 + 3);   // 3 check-ins + YouTube favourite
  assert.ok((await appDoc()).get("expiresAt"));

  // vouches: Watcher and above, not for yourself, a cap of 3, weighted by grade
  assert.equal(await reason(initiate("crewVouch", { appId: applied.appId })), "notWatcher");
  assert.equal(await reason(as("apl")("crewVouch", { appId: applied.appId })), "notWatcher");
  await w1("crewVouch", { appId: applied.appId });
  assert.equal(await reason(w1("crewVouch", { appId: applied.appId })), "alreadyVouched");
  await w2("crewVouch", { appId: applied.appId });
  assert.equal((await db.doc(paths.score(applied.appId)).get()).get("score"), 6 + 1 + 2);
  for (const n of ["f1", "f2", "f3"]) {
    await person(n, {});
    await db.doc(paths.application(`${n}-1`)).set({ uid: n, handle: n, status: "open", prefs: {}, createdAt: T.fromMillis(NOW - 5000), expiresAt: T.fromMillis(NOW + 80 * DAY) });
  }
  await w1("crewVouch", { appId: "f1-1" }); await w1("crewVouch", { appId: "f2-1" });   // w1: applicant + f1 + f2 = 3
  assert.equal(await reason(w1("crewVouch", { appId: "f3-1" })), "vouchCap");
  await w1("crewUnvouch", { appId: "f2-1" });
  await w1("crewVouch", { appId: "f3-1" });                                       // a slot freed
  await db.doc(paths.application("w1-1")).set({ uid: "w1", status: "open", prefs: {}, createdAt: T.fromMillis(NOW), expiresAt: T.fromMillis(NOW + DAY) });
  assert.equal(await reason(w2("crewVouch", { appId: "w1-1" })), "ok");           // someone else can
  await db.doc(paths.application("w2-1")).set({ uid: "w2", status: "open", prefs: {}, createdAt: T.fromMillis(NOW), expiresAt: T.fromMillis(NOW + DAY) });
  assert.equal(await reason(w2("crewVouch", { appId: "w2-1" })), "self");

  // the queue: only Watcher+, concerns for admins only, applicants see their band only
  await w1("crewConcern", { appId: applied.appId, note: "Seen heated in another chat." });
  assert.equal(await reason(initiate("crewQueue")), "notWatcher");
  const q = await w1("crewQueue");
  assert.equal(q.queue[0].appId, applied.appId);
  assert.equal(q.queue[0].score, 9); assert.equal(q.queue[0].vouches.length, 2); assert.equal(q.queue[0].concerns, undefined);
  assert.equal((await boss("crewQueue")).queue[0].concerns[0].note, "Seen heated in another chat.");
  assert.equal(await reason(as("apl")("crewConcern", { appId: applied.appId, note: "x" })), "notWatcher");
  assert.equal(await reason(initiate("crewConcern", { appId: applied.appId, note: "x" })), "notWatcher");

  // crewDecide: owner only; approve makes an Initiate with the mod role; not now waits 60 days
  assert.equal(await reason(ov("crewDecide", { appId: applied.appId, decision: "approve" })), "notOwner");
  assert.equal(await reason(w2("crewDecide", { appId: applied.appId, decision: "approve" })), "notOwner");
  assert.equal(await reason(boss("crewDecide", { appId: applied.appId, decision: "maybe" })), "args");
  assert.equal(await reason(boss("crewDecide", { appId: "f1-1", decision: "notNow" })), "field");   // a kind note is required
  await boss("crewDecide", { appId: "f1-1", decision: "notNow", note: "Not right now, thank you for offering. Come back in a couple of months." });
  assert.equal((await db.doc(paths.application("f1-1")).get()).get("status"), "notNow");
  const ap = await boss("crewDecide", { appId: applied.appId, decision: "approve" });
  assert.equal(ap.status, "approved");
  const r = (await db.doc(paths.roster("apl")).get()).data();
  assert.equal(r.track, "mod"); assert.equal(r.grade, 1); assert.equal(r.status, "active"); assert.equal(r.platforms.ytLandscape, "favourite"); assert.equal(r.device, "phone");
  assert.deepEqual((await db.doc(`${S}/members/apl`).get()).get("roles"), ["mod"]);
  assert.equal((await db.doc(`${S}/members/apl`).get()).get("rolesChangedBy").uid, "boss");
  assert.deepEqual((await db.doc(paths.record("w1")).get()).get("activeVouches"), ["f3-1"]);   // the vouch slot came back
  assert.ok(logs.some((l) => l.action === "crewApprove" && l.feature === "crew"));
  assert.ok((await db.collection("activityLog").get()).docs.some((d) => d.get("type") === "crew-joined"));
  assert.equal(await reason(boss("crewDecide", { appId: applied.appId, decision: "approve" })), "closed");
  await person("late", {}); await streakDays("late", 3);
  await boss("crewDecide", { appId: (await as("late")("crewApply", goodApp())).appId, decision: "notNow", note: "Not this time, but thank you." });
  assert.equal(await reason(as("late")("crewApply", goodApp())), "reapplyWait");
  assert.equal((await as("late")("crewMe")).application.status, "notNow");
  assert.equal((await as("late")("crewMe")).application.band, null);

  // crewPromote: the owner moves anyone up one step; a Right Hand up to Warden; nobody else
  assert.equal(await reason(w2("crewPromote", { uid: "init" })), "notAllowed");
  assert.equal(await reason(ov("crewPromote", { uid: "init" })), "notAllowed");
  assert.equal(await reason(boss("crewPromote", { uid: "boss" })), "self");
  assert.equal(await reason(boss("crewPromote", { uid: "late" })), "notMod");
  await boss("crewPromote", { uid: "init" });
  assert.equal((await db.doc(paths.roster("init")).get()).get("grade"), 2);
  await rh("crewPromote", { uid: "init" });                                       // Watcher -> Warden, confirmed by the Right Hand
  assert.equal((await db.doc(paths.roster("init")).get()).get("grade"), 3);
  assert.equal(await reason(rh("crewPromote", { uid: "init" })), "notOwner");     // Sentinel is the owner's
  await boss("crewPromote", { uid: "init" });
  assert.equal((await db.doc(paths.roster("init")).get()).get("grade"), 4);
  assert.equal(await reason(boss("crewPromote", { uid: "init" })), "top");
  assert.equal(await reason(boss("crewPromote", { uid: "w1", track: "admin", grade: 1 })), "badStep");   // only a Sentinel (or an admin) enters the admin ladder
  await boss("crewPromote", { uid: "init", track: "admin", grade: 1 });
  assert.deepEqual((await db.doc(`${S}/members/init`).get()).get("roles").sort(), ["admin", "mod"]);
  assert.equal((await db.doc(paths.roster("init")).get()).get("track"), "admin");
  assert.equal(await reason(rh("crewPromote", { uid: "init", track: "admin", grade: 2 })), "notOwner");
  await boss("crewPromote", { uid: "init", track: "admin", grade: 2 });
  assert.ok(logs.filter((l) => l.action === "crewPromote").length >= 5);
  assert.ok((await db.collection("activityLog").get()).docs.some((d) => d.get("type") === "crew-promoted"));

  // crewSetStatus: Going dark by self (2 months a year), the rest by the owner or an Overseer
  await person("m1", { roles: ["mod"], roster: { track: "mod", grade: 2 } });
  assert.equal(await reason(as("m1")("crewSetStatus", { status: "reserve" })), "notAllowed");
  assert.equal(await reason(as("m1")("crewSetStatus", { status: "goingDark", months: 3 })), "args");
  await as("m1")("crewSetStatus", { status: "goingDark", months: 2 });
  assert.equal((await db.doc(paths.roster("m1")).get()).get("status"), "goingDark");
  assert.ok((await db.doc(paths.roster("m1")).get()).get("breakUntil"));
  await as("m1")("crewSetStatus", { status: "active" });
  assert.equal(await reason(as("m1")("crewSetStatus", { status: "goingDark", months: 1 })), "breakLimit");
  assert.equal(await reason(w2("crewSetStatus", { uid: "m1", status: "reserve", reason: "x" })), "notAllowed");
  assert.equal(await reason(ov("crewSetStatus", { uid: "m1", status: "reserve" })), "field");   // a reason is required
  await ov("crewSetStatus", { uid: "m1", status: "reserve", reason: "Missed two months" });
  assert.equal((await db.doc(paths.roster("m1")).get()).get("status"), "reserve");
  assert.deepEqual((await db.doc(`${S}/members/m1`).get()).get("roles"), ["mod"]);               // Reserve keeps the role
  await ov("crewSetStatus", { uid: "m1", status: "alumni", reason: "Six months on Reserve" });
  assert.deepEqual((await db.doc(`${S}/members/m1`).get()).get("roles"), []);                    // Alumni: mod powers removed
  assert.equal(await reason(ov("crewSetStatus", { uid: "m1", status: "active" })), "notAllowed"); // only the owner brings an alumnus back
  await boss("crewSetStatus", { uid: "m1", status: "active" });
  assert.deepEqual((await db.doc(`${S}/members/m1`).get()).get("roles"), ["mod"]);
  assert.equal(await reason(boss("crewSetStatus", { uid: "boss", status: "paused", reason: "x" })), "notCrew");
  assert.equal(await reason(ov("crewSetStatus", { uid: "rh", status: "paused", reason: "x" })), "notAllowed");   // an Overseer can't touch admins
  assert.ok(logs.filter((l) => l.action === "crewStatus").length >= 4);

  // crewExcuse (owner), crewStrike (A2+; 2 = no Lead/Captain for 30 days, 3 = owner review), crewSaveProfile
  assert.equal(await reason(ov("crewExcuse", { uid: "m1", month: "2026-10" })), "notOwner");
  assert.equal(await reason(boss("crewExcuse", { uid: "m1", month: "Oct" })), "args");
  await boss("crewExcuse", { uid: "m1", month: "2026-10", reason: "Moving house" });
  assert.deepEqual((await db.doc(paths.roster("m1")).get()).get("excusedMonths"), ["2026-10"]);
  assert.equal(await reason(w2("crewStrike", { uid: "m1", reason: "x" })), "notAllowed");
  assert.equal(await reason(ov("crewStrike", { uid: "ov", reason: "x" })), "self");
  assert.equal(await reason(ov("crewStrike", { uid: "boss", reason: "x" })), "owner");
  const s1 = await ov("crewStrike", { uid: "m1", reason: "Rude to a new chatter" });
  assert.equal(s1.activeStrikes, 1); assert.equal((await db.doc(paths.roster("m1")).get()).get("leadBlockedUntil"), undefined);
  const s2 = await boss("crewStrike", { uid: "m1", reason: "Missed a handoff" });
  assert.equal(s2.activeStrikes, 2); assert.ok((await db.doc(paths.roster("m1")).get()).get("leadBlockedUntil"));
  const s3 = await ov("crewStrike", { uid: "m1", reason: "Third" });
  assert.equal(s3.ownerReview, true);
  assert.equal((await as("m1")("crewMe")).strikes.length, 3);                     // the mod sees their own strikes
  assert.equal((await db.doc(paths.record("m1")).get()).get("strikes")[0].byName, "@ov");
  await db.doc(paths.record("m1")).update({ strikes: [{ at: NOW - 200 * DAY, reason: "old", expiresAtMs: NOW - 17 * DAY }] });
  assert.equal((await as("m1")("crewMe")).strikes.length, 0);                     // strikes expire after 6 months
  await as("m1")("crewSaveProfile", { device: "both", availability: { days: ["sat"], note: "" } });
  assert.equal((await db.doc(paths.roster("m1")).get()).get("device"), "both");
  assert.equal(await reason(as("m1")("crewSaveProfile", { device: "toaster" })), "field");
  assert.equal(await reason(as("fan")("crewSaveProfile", { device: "both" })), "notCrew");

  // crewAdminOverview and the nightly run: expiry, the queue refresh and a "ready to promote" flag (never a promotion)
  assert.equal(await reason(w1("crewAdminOverview")), "notAdmin");
  await person("rookie", { roles: ["mod"], roster: { track: "mod", grade: 1, gradeSince: T.fromMillis(NOW - 40 * DAY) } });
  await db.doc(paths.academy("rookie")).set({ modules: Object.fromEntries(mods.map((m) => [m, { passedAt: NOW }])) });
  await db.doc(paths.application("old-1")).set({ uid: "old", status: "open", prefs: {}, createdAt: T.fromMillis(NOW - 100 * DAY), expiresAt: T.fromMillis(NOW - DAY) });
  await C.crewNightly.run({});
  assert.equal((await db.doc(paths.application("old-1")).get()).get("status"), "expired");
  assert.equal((await db.doc(paths.record("rookie")).get()).get("ready").to, 2);
  assert.equal((await db.doc(paths.roster("rookie")).get()).get("grade"), 1);      // flagged, not promoted
  assert.equal((await db.doc(paths.record("w1")).get()).get("ready"), undefined);
  const ovw = await boss("crewAdminOverview");
  assert.equal(ovw.roster.find((x) => x.uid === "rookie").ready.to, 2);
  assert.ok(ovw.roster.length >= 8);
  assert.equal((await as("rookie")("crewMe")).ready.name, "Watcher");

  // ---------- part 2b: Gears, tasks and boards ----------
  const G = require("../lib/crew/gears");
  const gears = G.makeGears({ db });
  assert.equal(G.gearKey("task", "t1", "u1"), "task:t1:u1");
  assert.equal(G.gearKey("recruit", "a/b c", "u1"), "recruit:a-b-c:u1");
  // the vouches in part 2a already paid queue-review Gears to w1 (4 x 2) and w2 (2 x 2)
  const mine = async (uid) => (await db.collection(`${paths.settings()}/gears`).get()).docs.filter((d) => d.get("uid") === uid);
  assert.equal((await mine("w1")).reduce((n, d) => n + d.get("amount"), 0), 8);
  assert.equal((await mine("w2")).reduce((n, d) => n + d.get("amount"), 0), 4);
  assert.ok((await db.doc(paths.gear(`queueReview:${applied.appId}:w1`)).get()).exists);   // doc id = source:ref:uid

  // idempotent, crew only, only the Phase 1 sources, never for timeouts, bans or message counts
  const first = await gears.grantGears("m1", "task", "task-x", 20);
  assert.equal(first.granted, true);
  assert.equal((await gears.grantGears("m1", "task", "task-x", 20)).reason, "paid");
  assert.equal((await gears.grantGears("m1", "task", "task-x", 99)).reason, "paid");         // the same key never pays again, whatever the amount
  assert.equal((await gears.grantGears("fan", "task", "task-y", 20)).reason, "notCrew");
  for (const bad of ["timeout", "ban", "messages", "deletedMessage", "duty", "made-up"]) assert.equal((await gears.grantGears("m1", bad, "r", 5)).reason, "badSource", bad);
  assert.equal((await gears.grantGears("m1", "task", "task-z", 0)).reason, "badAmount");
  assert.equal((await gears.grantGears("m1", "task", "task-z", 5000)).reason, "badAmount");
  assert.equal((await mine("m1")).reduce((n, d) => n + d.get("amount"), 0), 20);

  // queue reviews: +2 each, at most 10 a month (w1 has 8)
  assert.equal((await gears.grantQueueReview("w1", "extra1")).granted, true);
  assert.equal((await gears.grantQueueReview("w1", "extra2")).reason, "monthlyCap");
  // recruits: +10 each, up to recruitCapPerMonth (10) a month; the first check-in +5; the same recruit never pays twice
  for (let i = 1; i <= 10; i++) assert.equal((await gears.grantRecruit("w2", `new${i}`)).granted, true, `recruit ${i}`);
  assert.equal((await gears.grantRecruit("w2", "new11")).reason, "monthlyCap");
  assert.equal((await gears.grantRecruit("w2", "new1")).reason, "monthlyCap");
  assert.equal((await gears.grantRecruitCheckin("w2", "new1")).granted, true);
  assert.equal((await gears.grantRecruitCheckin("w2", "new1")).reason, "paid");
  assert.equal((await mine("w2")).filter((d) => d.get("source") === "recruit").reduce((n, d) => n + d.get("amount"), 0), 100);
  // an Academy module pays +5, once
  assert.equal((await gears.grantAcademy("rookie", "m1")).granted, true);
  assert.equal((await gears.grantAcademy("rookie", "m1")).reason, "paid");
  assert.equal((await gears.grantAcademy("rookie", "m2")).granted, true);
  assert.equal((await mine("rookie")).reduce((n, d) => n + d.get("amount"), 0), 10);

  // the task board
  const sent = as("sent"), m1 = as("m1");
  assert.equal(await reason(w1("taskPost", { title: "Greet new chatters", gears: 10 })), "notAllowed");     // Watchers can't post
  assert.equal(await reason(initiate("taskPost", { title: "x", gears: 10 })), "field");                  // (admin-track) title too short
  assert.equal(await reason(sent("taskPost", { title: "Greet new chatters", gears: 4 })), "field");
  assert.equal(await reason(sent("taskPost", { title: "Greet new chatters", gears: 51 })), "field");
  const task = (await sent("taskPost", { title: "Greet new chatters", detail: "Say hi in the first 5 minutes.", gears: 15 })).taskId;
  assert.equal((await db.doc(paths.task(task)).get()).get("status"), "open");
  assert.equal(await reason(as("fan")("taskClaim", { taskId: task })), "notCrew");
  await w1("taskClaim", { taskId: task });
  assert.equal(await reason(w2("taskClaim", { taskId: task })), "notOpen");
  assert.equal(await reason(w1("taskConfirm", { taskId: task })), "notDone");
  assert.equal(await reason(w2("taskDone", { taskId: task })), "notYours");
  await w1("taskDone", { taskId: task });
  assert.equal(await reason(w1("taskConfirm", { taskId: task })), "ownTask");                            // never by the claimer
  assert.equal(await reason(w2("taskConfirm", { taskId: task })), "notAllowed");                         // a Warden who isn't the poster
  const w1Before = (await mine("w1")).reduce((n, d) => n + d.get("amount"), 0);
  const conf = await sent("taskConfirm", { taskId: task });                                              // the poster
  assert.equal(conf.paid, true);
  assert.equal((await mine("w1")).reduce((n, d) => n + d.get("amount"), 0), w1Before + 15);
  assert.ok((await db.doc(paths.gear(`task:${task}:w1`)).get()).exists);
  assert.equal(await reason(sent("taskConfirm", { taskId: task })), "notDone");                          // no second payout
  assert.ok(logs.some((l) => l.action === "taskConfirm" && l.details.gears === 15));
  const task2 = (await ov("taskPost", { title: "Review the Academy text", gears: 50 })).taskId;           // an admin posts too
  await m1("taskClaim", { taskId: task2 }); await m1("taskDone", { taskId: task2 });
  await ov("taskConfirm", { taskId: task2 });                                                            // an Overseer confirms
  assert.equal((await db.doc(paths.gear(`task:${task2}:m1`)).get()).get("amount"), 50);

  // boards: month, season, all; admins appear with a staff flag; Reserve and alumni are off the board
  await gears.grantGears("ov", "task", "ov-task", 5);
  const all = (await db.doc(paths.board("all")).get()).data();
  assert.ok(all.rows.length >= 4);
  assert.deepEqual(all.rows.map((r) => r.gears), [...all.rows.map((r) => r.gears)].sort((a, b) => b - a));
  assert.deepEqual(all.rows.map((r) => r.place), all.rows.map((_, i) => i + 1));
  assert.equal(all.rows[0].uid, "w2");                                                                   // 4 + 100 + 5 Gears
  assert.equal(all.rows.find((r) => r.uid === "m1").gears, 70);
  assert.equal(all.rows.find((r) => r.uid === "w2").recruits, 10);
  assert.equal(Object.keys(all.rows[0]).sort().join(), "duties,gears,grade,handle,hours,place,recruits,rooms,staff,track,uid");   // nothing private
  const month = (await db.doc(paths.board("month")).get()).data();
  assert.match(month.period, /^[0-9]{4}-[0-9]{2}$/);
  assert.ok(month.rows.some((r) => r.uid === "m1"));
  assert.deepEqual((await db.doc(paths.board("season")).get()).data().rows, []);                         // no live Night Shift season in this test
  await db.doc(paths.roster("m1")).update({ status: "reserve" });
  await gears.rebuildBoards();
  assert.equal((await db.doc(paths.board("all")).get()).data().rows.some((r) => r.uid === "m1"), false);
  await db.doc(paths.roster("m1")).update({ status: "active" });
  // an admin on the board with the staff flag
  assert.equal(all.rows.some((r) => r.uid === "ov" && r.staff === true), true);
  // the season board follows Night Shift's live season
  await db.doc(`${S}/factory/main/seasons/s01`).set({ name: "Season 01", status: "live", startsAt: NOW - 10 * DAY, endsAt: NOW + 50 * DAY });
  await gears.grantGears("w1", "task", "season-task", 7);
  assert.equal((await db.doc(paths.board("season")).get()).data().rows.find((r) => r.uid === "w1").gears > 0, true);
  assert.equal((await db.doc(paths.board("season")).get()).data().period, "Season 01");
  // a Gears grant only ever lands once per key, so the boards can't double count
  const before = (await db.doc(paths.board("all")).get()).data().rows.find((r) => r.uid === "w1").gears;
  await gears.grantGears("w1", "task", "season-task", 7);
  assert.equal((await db.doc(paths.board("all")).get()).data().rows.find((r) => r.uid === "w1").gears, before);
  console.log("check-crew: ok");
}
main().catch((e) => { console.error(e); process.exit(1); });
