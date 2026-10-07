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

  console.log("check-crew: ok");
}
main().catch((e) => { console.error(e); process.exit(1); });
