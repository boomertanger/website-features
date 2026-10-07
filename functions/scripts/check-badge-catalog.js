#!/usr/bin/env node
// functions/scripts/check-badge-catalog.js: the owner-only seedBadgeCatalog callable (lib/rewards/index.js,
// lib/rewards/catalog.js) against an in-memory Firestore. No credentials needed.
//   npm run check      (or node scripts/check-badge-catalog.js)
const assert = require("assert/strict");
const admin = require("firebase-admin");
const { makeDb } = require("./fixtures/fake-firestore");

process.env.GCLOUD_PROJECT = "boomertanger-prod";   // it must work on production too
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: "boomertanger-prod" });
if (!admin.apps.length) admin.initializeApp({ projectId: "boomertanger-prod" });
const db = makeDb();
const real = admin.firestore;
const fake = () => db;
fake.Timestamp = real.Timestamp; fake.FieldValue = real.FieldValue;
Object.defineProperty(admin, "firestore", { value: fake, configurable: true, writable: true });

const data = require("../data/trophy-room-badges.json");
const logs = [];
const R = require("../lib/rewards")({ adminLogEntry: async (_d, e) => { logs.push(e); return e; } });
const as = (uid) => (data2 = {}) => R.seedBadgeCatalog.run({ auth: { uid, token: {} }, data: data2 });
const reason = async (p) => { try { await p; return "ok"; } catch (e) { return e.details?.reason || e.message; } };
const S = "sites/boomertanger";

async function main() {
  await db.doc(S).set({ ownerUid: "boss" });
  for (const [uid, roles] of [["boss", ["admin"]], ["adm", ["admin"]], ["mod", ["mod"]], ["fan", []]]) {
    await db.doc(`${S}/members/${uid}`).set({ roles });
    await db.doc(`${S}/profiles/${uid}`).set({ handle: uid });
  }
  const boss = as("boss");

  // the owner only: not admins, mods, members or signed-out callers
  assert.equal(await reason(as("adm")()), "notOwner");
  assert.equal(await reason(as("mod")({ apply: true })), "notOwner");
  assert.equal(await reason(as("fan")({ apply: true })), "notOwner");
  assert.equal(await reason(R.seedBadgeCatalog.run({ data: {} })), "signedOut");
  assert.equal((await db.collection(`${S}/badges`).get()).size, 0);

  // a dry run (the default, and anything but apply === true) lists what it would do and writes nothing
  for (const input of [undefined, {}, { apply: false }, { apply: "true" }, { apply: 1 }]) {
    const r = await boss(input);
    assert.equal(r.apply, false); assert.equal(r.written, 0);
    assert.equal(r.created.length, data.badges.length); assert.equal(r.changed.length, 0);
    assert.equal(r.total, data.badges.length); assert.equal(r.collections.created, data.collections.length);
  }
  assert.equal((await db.collection(`${S}/badges`).get()).size, 0);
  assert.equal((await db.collection(`${S}/collections`).get()).size, 0);
  assert.equal(logs.length, 0);                                                               // a dry run isn't logged

  // apply: creates every badge (holders 0) and the collections, and logs it
  const first = await boss({ apply: true });
  assert.equal(first.apply, true); assert.equal(first.created.length, data.badges.length);
  assert.ok(first.written >= data.badges.length + data.collections.length);
  const b = await db.doc(`${S}/badges/crew-initiate`).get();
  assert.equal(b.get("name"), "Initiate"); assert.equal(b.get("holders"), 0); assert.equal(b.get("pctHeld"), 0);
  assert.equal(b.get("collection"), "crew"); assert.equal(b.get("crewOnly"), true); assert.equal(b.get("status"), "active");
  assert.equal((await db.doc(`${S}/badges/youtube-founding-crew`).get()).get("limited").label, "Founding");
  assert.equal((await db.doc(`${S}/collections/crew`).get()).get("crewOnly"), true);
  assert.equal((await db.doc(`${S}/collections/loyalty`).get()).get("order"), 0);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].feature, "rewards"); assert.equal(logs[0].action, "rewardsCatalog"); assert.equal(logs[0].actorUid, "boss");
  assert.equal(logs[0].details.created, data.badges.length);

  // run again: nothing to do, nothing logged
  const again = await boss({ apply: true });
  assert.equal(again.created.length, 0); assert.equal(again.changed.length, 0); assert.equal(again.unchanged, data.badges.length);
  assert.equal(again.written, 0); assert.equal(logs.length, 1);

  // a changed definition is merged, but holders, pctHeld, art and buriedAt stay; extra badges are listed and left alone
  await db.doc(`${S}/badges/crew-initiate`).update({ rarity: 3, how: "old text", holders: 7, pctHeld: 12.5, art: { url: "https://x/y.png" }, buriedAt: 99 });
  await db.doc(`${S}/badges/old-event-badge`).set({ name: "Old", holders: 4 });
  const dry = await boss({ apply: false });
  assert.deepEqual(dry.changed, [{ id: "crew-initiate", fields: ["rarity", "how"] }]);
  assert.deepEqual(dry.extra, ["old-event-badge"]);
  assert.equal((await db.doc(`${S}/badges/crew-initiate`).get()).get("rarity"), 3);          // the dry run changed nothing
  const fix = await boss({ apply: true });
  assert.equal(fix.changed.length, 1); assert.equal(fix.created.length, 0);
  const after = (await db.doc(`${S}/badges/crew-initiate`).get()).data();
  assert.equal(after.rarity, 1); assert.equal(after.how, "Be approved into the crew.");
  assert.equal(after.holders, 7); assert.equal(after.pctHeld, 12.5); assert.equal(after.art.url, "https://x/y.png"); assert.equal(after.buriedAt, 99);
  assert.equal((await db.doc(`${S}/badges/old-event-badge`).get()).get("holders"), 4);        // never deleted
  assert.equal((await db.collection(`${S}/badges`).get()).size, data.badges.length + 1);
  assert.equal(logs.length, 2);

  // a missing badge is created without touching the others
  await db.doc(`${S}/badges/case-closed`).delete();
  const one = await boss({ apply: true });
  assert.deepEqual(one.created, ["case-closed"]);
  assert.equal((await db.doc(`${S}/badges/crew-initiate`).get()).get("holders"), 7);
  console.log("check-badge-catalog: ok");
}
main().catch((e) => { console.error(e); process.exit(1); });
