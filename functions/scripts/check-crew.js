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

  // ---------- part 2c: Academy quizzes and referral links ----------
  const academy = require("../lib/crew/academy");
  const acData = require("../data/crew-academy.json");
  // the JSON is generated from docs/specs/crew-academy.md and must be current
  assert.deepEqual(JSON.parse(JSON.stringify(require("./build-crew-academy").build())), acData, "crew-academy.json is stale: run node scripts/build-crew-academy.js");
  assert.deepEqual(acData.modules.map((m) => m.id), ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10"]);
  assert.deepEqual(acData.modules.map((m) => m.slug), ["welcome", "house-rules", "platforms", "stream-duty", "engagement", "tools", "recruiting", "chat-games", "safety", "captain"]);
  assert.deepEqual(acData.modules.map((m) => m.requiredFor), ["initiate", "initiate", "initiate", "initiate", "watcher", "watcher", null, null, "warden", "captain"]);
  assert.equal(acData.modules[6].optional, true); assert.equal(acData.modules[7].soon, true);
  assert.equal(acData.passMark, 4);
  for (const m of acData.modules) { assert.equal(m.quiz.length, 5, m.slug); for (const q of m.quiz) { assert.equal(q.options.length, 3); assert.ok(q.answer >= 0 && q.answer < 3); assert.ok(q.q.length > 5); } }
  // the answer keys, written out so a parser slip can't pass quietly (they come from the ✓ marks in the spec)
  assert.equal(acData.modules[0].quiz.map((q) => q.answer).join(""), "11112");
  assert.equal(acData.modules[2].quiz.map((q) => q.answer).join(""), "11111");
  assert.equal(acData.modules[8].quiz.map((q) => q.answer).join(""), "01121");
  assert.equal(acData.modules[9].quiz.map((q) => q.answer).join(""), "10010");
  assert.equal(acData.modules[0].quiz[0].options[acData.modules[0].quiz[0].answer], "Set Going dark before you go");
  assert.match(acData.modules[1].quiz[3].say, /crisis|flag/i);
  // grading: pass mark 4 of 5
  const key = (id) => acData.modules.find((m) => m.id === id).quiz.map((q) => q.answer);
  const wrong = (a, n) => a.map((x, i) => (i < n ? (x + 1) % 3 : x));
  assert.deepEqual(academy.grade(academy.MODULES.get("m1"), key("m1")), { score: 5, passed: true, results: academy.grade(academy.MODULES.get("m1"), key("m1")).results });
  assert.equal(academy.grade(academy.MODULES.get("m1"), wrong(key("m1"), 1)).passed, true);    // 4 of 5
  assert.equal(academy.grade(academy.MODULES.get("m1"), wrong(key("m1"), 2)).passed, false);   // 3 of 5
  assert.equal(academy.grade(academy.MODULES.get("m1"), [0, 0, 0]).score >= 0, true);
  assert.equal(academy.grade(academy.MODULES.get("m1"), ["1", "1", "1", "1", "2"]).score, 0);   // strings never match

  // academySubmitQuiz: crew only, validated, graded on the server, +5 Gears once per module
  const quiz = (uid, moduleId, answers) => as(uid)("academySubmitQuiz", { moduleId, answers });
  await person("rk", { roles: ["mod"], roster: { track: "mod", grade: 1 } });
  assert.equal(await reason(quiz("fan", "m1", key("m1"))), "notCrew");
  assert.equal(await reason(quiz("rk", "m99", [0, 0, 0, 0, 0])), "noModule");
  assert.equal(await reason(quiz("rk", "m1", [0, 0])), "answers");
  assert.equal(await reason(quiz("rk", "m1", [0, 0, 0, 0, 7])), "answers");
  assert.equal(await reason(quiz("rk", "m8", key("m8"))), "soon");
  const rookieGears = async () => (await mine("rk")).reduce((n, d) => n + d.get("amount"), 0);
  const g0 = await rookieGears();                                                                
  const failed = await quiz("rk", "m3", wrong(key("m3"), 2));
  assert.equal(failed.passed, false); assert.equal(failed.score, 3); assert.equal(failed.paid, false);
  assert.equal(failed.results.length, 5); assert.equal(typeof failed.results[0].say, "string");
  assert.equal(JSON.stringify(failed).includes('"answer"'), false);                              // the key never leaves the server
  assert.equal((await db.doc(paths.academy("rk")).get()).get("modules").m3, undefined);
  assert.equal((await db.doc(paths.academy("rk")).get()).get("attempts").m3, 1);
  assert.equal(await rookieGears(), g0);
  const passed = await quiz("rk", "m3", wrong(key("m3"), 1));
  assert.equal(passed.passed, true); assert.equal(passed.score, 4); assert.equal(passed.paid, true);
  assert.equal(await rookieGears(), g0 + 5);
  assert.ok((await db.doc(paths.gear("academy:m3:rk")).get()).exists);
  const again = await quiz("rk", "m3", key("m3"));
  assert.equal(again.passed, true); assert.equal(again.paid, false);                              // no second payout
  assert.equal(await rookieGears(), g0 + 5);
  assert.equal((await db.doc(paths.academy("rk")).get()).get("modules").m3.score, 5);          // the best score is kept
  assert.equal((await db.doc(paths.academy("rk")).get()).get("attempts").m3, 3);
  assert.equal((await as("rk")("crewMe")).academy.passed.includes("m3"), true);
  // the nightly check reads these passes: with m1 to m6 in, the Initiate is flagged ready
  for (const id of ["m1", "m2", "m4", "m5", "m6"]) await quiz("rk", id, key(id));
  assert.deepEqual((await as("rk")("crewMe")).academy.passed.sort(), ["m1", "m2", "m3", "m4", "m5", "m6"]);

  // referrals: the link at signup (first wins), the first check-in, 7 days with a real action, the ladder
  const R = require("../lib/crew/referrals");
  await db.doc("handles/mod_one").set({ uid: "m1" });
  let clock = NOW;
  const eventCalls = [];
  const refs = R.makeReferrals({ db, gears, now: () => clock, recordEvent: async (uid, type, params, ref) => { eventCalls.push([uid, type, ref]); return { counted: true }; } });
  assert.equal((await R.recordReferral(db, "ra", "")).reason, "noLink");
  assert.equal((await R.recordReferral(db, "ra", "no")).reason, "badHandle");
  assert.equal((await R.recordReferral(db, "ra", "grapefan")).reason, "noReferrer");
  await person("ra", {});
  assert.equal((await R.recordReferral(db, "m1", "mod_one")).reason, "noReferrer");                    // never your own link
  assert.equal((await R.recordReferral(db, "ra", "@MOD_ONE", clock)).saved, true);                     // the handle is normalised
  await db.doc("handles/ward_one").set({ uid: "w1" });
  assert.equal((await R.recordReferral(db, "ra", "ward_one")).reason, "firstLinkWins");
  assert.equal((await db.doc(paths.referral("ra")).get()).get("refUid"), "m1");
  const m1Gears = async () => (await mine("m1")).reduce((n, d) => n + d.get("amount"), 0);
  const m1Before = await m1Gears();
  assert.deepEqual(await refs.noteAction("nobody", "checkin"), { noted: false });                 // no referral, nothing happens
  assert.deepEqual(await refs.noteAction("ra", "tap"), { noted: false });                         // only a check-in or a finished run
  assert.equal((await refs.noteAction("ra", "checkin")).gears, 5);                                // the recruit's first check-in: +5 for a crew referrer
  assert.equal(await m1Gears(), m1Before + 5);
  await refs.noteAction("ra", "checkin");
  assert.equal(await m1Gears(), m1Before + 5);                                                    // once
  assert.deepEqual(eventCalls.filter((c) => c[1] === "recruit-checks-in"), [["m1", "recruit-checks-in", "ra"]]);
  // 7 days with a real action: not before, then once
  clock = NOW + 6 * DAY;
  assert.equal((await refs.activateDue(clock)).activated, 0);
  clock = NOW + 8 * DAY;
  assert.equal((await refs.activateDue(clock)).activated, 1);
  assert.equal(await m1Gears(), m1Before + 5 + 10);                                               // +10 for the activated recruit
  assert.ok((await db.doc(paths.referral("ra")).get()).get("activatedAt"));
  assert.deepEqual(eventCalls.filter((c) => c[1] === "bring-a-friend"), [["m1", "bring-a-friend", "ra"]]);
  assert.equal((await refs.activateDue(clock)).activated, 0);                                     // never twice
  // a recruit with no action never activates; a non-crew referrer still gets the badge ladder, just no Gears
  await person("rb", {}); await R.recordReferral(db, "rb", "mod_one", NOW);
  assert.equal((await refs.activateDue(NOW + 30 * DAY)).activated, 0);
  for (const [n, id, xp] of [[1, "recruiter-1", 1], [5, "recruiter-5", 2], [15, "recruiter-15", 3], [50, "recruiter-50", 4]]) await db.doc(`${S}/badges/${id}`).set({ name: `Recruiter ${n}`, rarity: xp, collection: "community", holders: 0, status: "active" });
  await db.doc(`${S}/profiles/m1`).set({ handle: "m1", xp: 0 }, { merge: true });
  for (let i = 2; i <= 5; i++) {
    await person(`ra${i}`, {});
    await R.recordReferral(db, `ra${i}`, "mod_one", NOW);
    await refs.noteAction(`ra${i}`, "arcade");
  }
  clock = NOW + 9 * DAY;
  assert.equal((await refs.activateDue(clock)).activated, 4);
  const owns = async (uid, id) => (await db.doc(`${S}/profiles/${uid}/badges/${id}`).get()).exists;
  assert.equal(await owns("m1", "recruiter-1"), true);
  assert.equal(await owns("m1", "recruiter-5"), true);                                             // five activated recruits
  assert.equal(await owns("m1", "recruiter-15"), false);
  // Gears for the referrer stop at the monthly cap (10 recruits) but the recruit still counts for the ladder
  assert.equal((await mine("m1")).filter((d) => d.get("source") === "recruit").length, 5);
  await person("rf", {}); await db.doc("handles/refer_f").set({ uid: "rf" });
  await person("rg", {}); await R.recordReferral(db, "rg", "refer_f", NOW); await refs.noteAction("rg", "arcade");
  assert.equal((await refs.activateDue(NOW + 9 * DAY)).activated, 1);
  assert.equal(await owns("rf", "recruiter-1"), true);                                             // a plain member gets the badge...
  assert.equal((await mine("rf")).length, 0);                                                      // ...and no Gears

  // ---------- part 2d: Top Gear and Fan Favourite ----------
  const AWM = require("../lib/crew/awards");
  // the vote window: the last 5 days of the month, Central
  assert.equal(AWM.voteWindow("2026-10-26").open, false);
  assert.equal(AWM.voteWindow("2026-10-27").open, true);
  assert.equal(AWM.voteWindow("2026-10-31").open, true);
  assert.equal(AWM.voteWindow("2026-11-25").open, false);                       // November has 30 days: the window opens on the 26th
  assert.equal(AWM.voteWindow("2026-11-26").open, true);
  assert.equal(AWM.voteWindow("2028-02-24").open, false);                       // a leap February has 29
  assert.equal(AWM.voteWindow("2028-02-25").open, true);
  assert.equal(AWM.voteWindow("2026-10-28").opensOn, "2026-10-27");
  assert.equal(AWM.prevMonth("2027-01"), "2026-12"); assert.equal(AWM.prevMonth("2026-10"), "2026-09");
  assert.equal(AWM.monthLabel("2026-10"), "October 2026");
  // Top Gear: most Gears; a tie goes to more duty hours, then to whoever reached their total first
  assert.equal(AWM.pickTopGear([{ uid: "a", gears: 50, hours: 0, reachedAtMs: 5 }, { uid: "b", gears: 60, hours: 0, reachedAtMs: 9 }]).uid, "b");
  assert.equal(AWM.pickTopGear([{ uid: "a", gears: 60, hours: 2, reachedAtMs: 1 }, { uid: "b", gears: 60, hours: 3, reachedAtMs: 9 }]).uid, "b");       // more duty hours
  assert.equal(AWM.pickTopGear([{ uid: "a", gears: 60, hours: 3, reachedAtMs: 9 }, { uid: "b", gears: 60, hours: 3, reachedAtMs: 4 }]).uid, "b");       // earlier achiever
  assert.equal(AWM.pickTopGear([{ uid: "a", gears: 0, hours: 9, reachedAtMs: 1 }]), null);                                                           // nobody earned anything
  assert.equal(AWM.pickTopGear([]), null);
  // Fan Favourite: most votes; ties go to more Gears, then the longer-serving
  assert.equal(AWM.pickFanFavourite([{ uid: "a", votes: 3, gears: 1, sinceMs: 1 }, { uid: "b", votes: 4, gears: 0, sinceMs: 9 }]).uid, "b");
  assert.equal(AWM.pickFanFavourite([{ uid: "a", votes: 3, gears: 10, sinceMs: 9 }, { uid: "b", votes: 3, gears: 20, sinceMs: 9 }]).uid, "b");
  assert.equal(AWM.pickFanFavourite([{ uid: "a", votes: 3, gears: 10, sinceMs: 9 }, { uid: "b", votes: 3, gears: 10, sinceMs: 2 }]).uid, "b");
  assert.equal(AWM.pickFanFavourite([{ uid: "a", votes: 0 }]), null);

  // the callables, on a clock inside the window (the 28th, Central) and one on the 1st
  const ym = require("../lib/arcade/logic").dayKey(NOW).slice(0, 7);
  const [Y, M] = ym.split("-").map(Number);
  let awClock = Date.UTC(Y, M - 1, 20, 18);
  const AW = AWM({ adminLogEntry: async (_d, e) => e, now: () => awClock });
  const av = (uid) => (fn, data = {}) => AW[fn].run({ auth: { uid, token: {} }, data });
  const checkedIn = (uid, extra = {}) => person(uid, { user: extra }).then(() => db.doc(`${S}/factory/main/streaks/${uid}`).set({ recentDays: [`${ym}-10`] }));
  await checkedIn("v1"); await checkedIn("v2"); await checkedIn("v3");
  await person("v4", {}); await db.doc(`${S}/factory/main/streaks/v4`).set({ recentDays: [] });                              // no check-in this month
  await checkedIn("v5", { signedUpAt: T.fromMillis(Date.UTC(Y, M - 1, 25, 12)) });                                           // signed up 3 days before the vote: too new
  assert.equal((await av("v1")("fanFavouriteBallot")).open, false);
  assert.equal((await av("v1")("fanFavouriteBallot")).reason, "closed");
  assert.deepEqual((await av("v1")("fanFavouriteBallot")).candidates, []);
  assert.equal(await reason(av("v1")("fanFavouriteVote", { uid: "w1" })), "closed");
  awClock = Date.UTC(Y, M - 1, new Date(Date.UTC(Y, M, 0)).getUTCDate() - 1, 18);                                            // two days before the month ends
  const bal = await av("v1")("fanFavouriteBallot");
  assert.equal(bal.open, true); assert.equal(bal.canVote, true);
  assert.equal(bal.candidates.some((c) => c.uid === "w1"), true);
  for (const adminUid of ["ov", "rh", "init", "boss"]) assert.equal(bal.candidates.some((c) => c.uid === adminUid), false, `${adminUid} (an admin) is never on the ballot`);
  assert.equal(bal.candidates.some((c) => c.uid === "m1"), true);
  assert.equal(JSON.stringify(bal).includes("votes"), false);                                                                  // no tally
  assert.equal((await av("v4")("fanFavouriteBallot")).reason, "needsCheckin");
  assert.equal((await av("v5")("fanFavouriteBallot")).reason, "tooNew");
  assert.equal((await av("w1")("fanFavouriteBallot")).reason, "crewCantVote");
  assert.equal(await reason(av("v4")("fanFavouriteVote", { uid: "w1" })), "needsCheckin");
  assert.equal(await reason(av("v5")("fanFavouriteVote", { uid: "w1" })), "tooNew");
  assert.equal(await reason(av("w2")("fanFavouriteVote", { uid: "w1" })), "crewCantVote");
  assert.equal(await reason(av("ov")("fanFavouriteVote", { uid: "w1" })), "crewCantVote");
  assert.equal(await reason(av("v1")("fanFavouriteVote", { uid: "ov" })), "notOnBallot");
  assert.equal(await reason(av("v1")("fanFavouriteVote", { uid: "nobody" })), "notOnBallot");
  assert.equal(await reason(av("v1")("fanFavouriteVote", {})), "args");
  await av("v1")("fanFavouriteVote", { uid: "w1" });
  await av("v2")("fanFavouriteVote", { uid: "w1" });
  await av("v3")("fanFavouriteVote", { uid: "w2" });
  assert.equal(await reason(av("v1")("fanFavouriteVote", { uid: "w2" })), "voted");                                           // one vote each
  assert.equal((await av("v1")("fanFavouriteBallot")).myVote, "w1");
  assert.equal((await av("v1")("fanFavouriteBallot")).canVote, false);
  assert.equal((await db.doc(paths.awardVote(ym, "v1")).get()).get("candidate"), "w1");

  // the monthly run, on the 1st: Top Gear (most Gears) and Fan Favourite (most votes); admins never win
  const eligibleNow = (await db.collection(`${paths.settings()}/roster`).get()).docs.filter((d) => d.get("track") !== "admin" && ["active", "checkIn"].includes(d.get("status"))).map((d) => d.id);
  const totals = new Map();
  for (const g of (await db.collection(`${paths.settings()}/gears`).get()).docs) if (g.get("month") === ym && eligibleNow.includes(g.get("uid"))) totals.set(g.get("uid"), (totals.get(g.get("uid")) || 0) + g.get("amount"));
  const [bestUid, bestGears] = [...totals.entries()].sort((a, b) => b[1] - a[1])[0];
  assert.equal(totals.has("ov"), false);
  const adminGears = (await mine("ov")).reduce((n, d) => n + d.get("amount"), 0);
  assert.ok(adminGears > 0 && adminGears < bestGears);                                                                        // an admin earned Gears and is on the board, not eligible for the award
  awClock = Date.UTC(Y, M, 1, 12);                                                                                            // the 1st of next month (past 00:05 Central)
  const xpOf = async (uid) => (await db.doc(`${S}/profiles/${uid}`).get()).get("xp") || 0;
  const [xpTop, xpFan] = [await xpOf(bestUid), await xpOf("w1")];
  await AW.crewMonthlyAwards.run({});
  const award = (await db.doc(paths.award(ym)).get()).data();
  assert.equal(award.topGear.uid, bestUid); assert.equal(award.topGear.gears, bestGears);
  assert.equal(award.fanFavourite.uid, "w1"); assert.equal(award.fanFavourite.votes, 2);
  assert.equal(award.votesCast, 3); assert.equal(award.ballot.includes("ov"), false);
  assert.ok(award.ranAt);
  assert.ok(await xpOf("w1") - xpFan >= 150);                                                                                 // a 150 XP trophy
  const trophy = (uid, kind) => db.doc(`${S}/profiles/${uid}/trophies/${kind}-${ym}`).get();
  assert.equal((await trophy(bestUid, "crew-top-gear")).exists, true);
  assert.equal((await trophy("w1", "crew-fan-favourite")).exists, true);
  assert.equal((await trophy("w1", "crew-fan-favourite")).get("label"), `Fan Favourite · ${AWM.monthLabel(ym)}`);
  assert.equal((await trophy("w1", "crew-fan-favourite")).get("kind"), "crew-fan-favourite");
  assert.ok(await xpOf(bestUid) - xpTop >= 150);
  const awardLogs = (await db.collection("activityLog").get()).docs.filter((d) => d.get("type") === "crew-award");
  assert.equal(awardLogs.length, 2);
  assert.match(awardLogs.map((d) => d.get("summary")).join("|"), /won Top Gear for/);
  await AW.crewMonthlyAwards.run({});                                                                                         // a rerun changes nothing
  assert.equal((await db.collection("activityLog").get()).docs.filter((d) => d.get("type") === "crew-award").length, 2);
  // a month with no Gears and no votes awards nobody
  awClock = Date.UTC(Y, M + 1, 1, 12);
  await AW.crewMonthlyAwards.run({});
  const emptyMonth = new Date(Date.UTC(Y, M, 1)).toISOString().slice(0, 7);
  const empty = (await db.doc(paths.award(emptyMonth)).get()).data();
  assert.equal(empty.topGear, null); assert.equal(empty.fanFavourite, null);

  // ---------- part 2e: Twitch moderator sync (off) and the platform to-do list ----------
  const PM = require("../lib/crew/platform");
  const rosterOf = (o) => ({ track: "mod", grade: 1, status: "active", platforms: { twitch: "happy", ytLandscape: "no", ytVertical: "no", tiktok: "no" }, ...o });
  // the plan: Twitch always, YouTube and TikTok only where they said they'd help; nothing when powers don't change
  assert.deepEqual(PM.planChanges({ before: null, after: rosterOf({}), handle: "vexa", twitchLogin: "vexa_tv" }), [{ platform: "twitch", action: "add", text: "Add @vexa_tv as a Twitch mod" }]);
  assert.deepEqual(PM.planChanges({ before: null, after: rosterOf({ platforms: { ytVertical: "favourite", tiktok: "ifNeeded" } }), handle: "vexa", twitchLogin: null }).map((c) => c.platform), ["twitch", "youtube", "tiktok"]);
  assert.equal(PM.planChanges({ before: null, after: rosterOf({}), handle: "vexa", twitchLogin: null })[0].text, "Add @vexa as a Twitch mod");
  assert.deepEqual(PM.planChanges({ before: rosterOf({}), after: rosterOf({ status: "reserve" }), handle: "v" }), []);                // Reserve keeps the powers
  assert.deepEqual(PM.planChanges({ before: rosterOf({}), after: rosterOf({ status: "paused" }), handle: "v" }), []);
  assert.deepEqual(PM.planChanges({ before: rosterOf({}), after: rosterOf({ status: "alumni" }), handle: "v", twitchLogin: "v" }), [{ platform: "twitch", action: "remove", text: "Remove @v as a Twitch mod" }]);
  assert.deepEqual(PM.planChanges({ before: rosterOf({ status: "alumni" }), after: rosterOf({}), handle: "v", twitchLogin: "v" }).map((c) => c.action), ["add"]);
  assert.deepEqual(PM.planChanges({ before: rosterOf({ platforms: { ytLandscape: "happy" } }), after: null, handle: "v" }).map((c) => `${c.platform}:${c.action}`), ["twitch:remove", "youtube:remove"]);
  assert.equal(L.DEFAULT_SETTINGS.twitchSync, false);

  // sync, flag off: a to-do, no Twitch call
  const calls = [];
  const okFetch = (status = 204) => async (url, opts = {}) => { calls.push([opts.method || "GET", String(url)]); return { ok: status < 300, status, json: async () => ({ access_token: "fresh", refresh_token: "r2", expires_in: 3600, scope: ["channel:manage:moderators"] }) }; };
  await person("tw1", { roles: ["mod"], user: { linked: { twitch: { id: "9001", login: "tw1_tv" } } } });
  await db.doc(`${S}/profiles/tw1`).set({ handle: "tw1" });
  const todoDoc = (platform, uid, action) => db.doc(`${paths.settings()}/todos/${platform}_${uid}_${action}`).get();
  let sync = PM.makePlatformMods({ db, fetchFn: okFetch(), clientId: "cid", clientSecret: "sec", now: () => NOW });
  const joined = rosterOf({ platforms: { twitch: "favourite", ytVertical: "happy", ytLandscape: "no", tiktok: "no" } });
  await sync.sync("tw1", null, joined);
  assert.equal((await todoDoc("twitch", "tw1", "add")).get("text"), "Add @tw1_tv as a Twitch mod");
  assert.equal((await todoDoc("twitch", "tw1", "add")).get("status"), "open");
  assert.equal((await todoDoc("twitch", "tw1", "add")).get("why"), "Twitch sync is off");
  assert.equal((await todoDoc("youtube", "tw1", "add")).get("text"), "Add @tw1 as a YouTube moderator");
  assert.equal((await todoDoc("tiktok", "tw1", "add")).exists, false);
  assert.equal(calls.length, 0);
  // leaving cancels the open "add" and leaves a "remove"
  await sync.sync("tw1", joined, rosterOf({ status: "alumni" }));
  assert.equal((await todoDoc("twitch", "tw1", "add")).exists, false);
  assert.equal((await todoDoc("twitch", "tw1", "remove")).get("text"), "Remove @tw1_tv as a Twitch mod");

  // sync, flag on but no broadcaster token: still a to-do, with the reason
  await db.doc(paths.settings()).update({ twitchSync: true });
  await sync.sync("tw1", null, joined);
  assert.match((await todoDoc("twitch", "tw1", "add")).get("why"), /no broadcaster token/);
  assert.equal(calls.length, 0);
  // flag on, token stored but without the scope: no call
  await db.doc(`${S}/private/twitchBroadcaster`).set({ accessToken: "old", refreshToken: "r1", accessExpiresAt: NOW + 3600000, scope: ["chat:read"] });
  await db.doc(`${S}/private/growthConfig`).set({ twitchBroadcasterId: "555" });
  await sync.sync("tw1", null, joined);
  assert.equal(calls.length, 0);
  // flag on and a good token: the moderator is added through Helix, and the to-do goes away
  await db.doc(`${S}/private/twitchBroadcaster`).set({ accessToken: "tok", refreshToken: "r1", accessExpiresAt: NOW + 3600000, scope: ["channel:manage:moderators"] });
  await sync.sync("tw1", null, joined);
  assert.deepEqual(calls.at(-1), ["POST", "https://api.twitch.tv/helix/moderation/moderators?broadcaster_id=555&user_id=9001"]);
  assert.equal((await todoDoc("twitch", "tw1", "add")).exists, false);
  assert.equal((await todoDoc("youtube", "tw1", "add")).exists, true);                                                       // YouTube stays manual
  await sync.sync("tw1", joined, rosterOf({ status: "alumni" }));
  assert.deepEqual(calls.at(-1), ["DELETE", "https://api.twitch.tv/helix/moderation/moderators?broadcaster_id=555&user_id=9001"]);
  assert.equal((await todoDoc("twitch", "tw1", "remove")).exists, false);
  // an expired token is refreshed first (and stored); a refused refresh or a Helix error falls back to a to-do
  await db.doc(`${S}/private/twitchBroadcaster`).update({ accessExpiresAt: NOW - 1000 });
  const n = calls.length;
  await sync.sync("tw1", null, joined);
  assert.equal(calls[n][1], "https://id.twitch.tv/oauth2/token");
  assert.equal((await db.doc(`${S}/private/twitchBroadcaster`).get()).get("accessToken"), "fresh");
  assert.equal(calls.at(-1)[0], "POST");
  const failing = PM.makePlatformMods({ db, fetchFn: okFetch(500), clientId: "cid", clientSecret: "sec", now: () => NOW });
  await failing.sync("tw1", null, joined);
  assert.match((await todoDoc("twitch", "tw1", "add")).get("why"), /Twitch said 500/);
  await db.doc(`${S}/private/twitchBroadcaster`).update({ accessExpiresAt: NOW - 1000 });
  const noSecret = PM.makePlatformMods({ db, fetchFn: okFetch(), clientId: "cid", clientSecret: null, now: () => NOW });
  await noSecret.sync("tw1", null, joined);
  assert.match((await todoDoc("twitch", "tw1", "add")).get("why"), /no broadcaster token/);                                  // can't refresh: a to-do, not a crash
  const throwing = PM.makePlatformMods({ db, fetchFn: async () => { throw new Error("network down"); }, clientId: "cid", clientSecret: "sec", now: () => NOW });
  assert.ok(Array.isArray(await throwing.sync("tw1", null, joined)));
  await db.doc(paths.settings()).update({ twitchSync: false });

  // the trigger: only a change in who holds powers does anything; crewTodoDone is for admins
  const fireRoster = (uid, before, after) => C.crewTwitchSync.run({ params: { siteId: "boomertanger", uid }, data: { before: { exists: !!before, data: () => before }, after: { exists: !!after, data: () => after } } });
  await db.doc(`${paths.settings()}/todos/twitch_tw1_add`).delete().catch(() => {});
  await fireRoster("tw1", rosterOf({}), rosterOf({ grade: 2 }));
  assert.equal((await todoDoc("twitch", "tw1", "add")).exists, false);
  await fireRoster("tw1", null, joined);
  assert.equal((await todoDoc("twitch", "tw1", "add")).get("status"), "open");
  assert.equal(await reason(w1("crewTodoDone", { id: "twitch_tw1_add" })), "notAdmin");
  assert.equal(await reason(boss("crewTodoDone", { id: "nope" })), "args");
  assert.equal(await reason(boss("crewTodoDone", { id: "twitch_zz9_add" })), "noTodo");
  await boss("crewTodoDone", { id: "twitch_tw1_add" });
  assert.equal((await todoDoc("twitch", "tw1", "add")).get("status"), "done");
  assert.equal((await todoDoc("twitch", "tw1", "add")).get("doneBy"), "boss");
  console.log("check-crew: ok");
}
main().catch((e) => { console.error(e); process.exit(1); });
