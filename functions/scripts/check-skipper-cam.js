#!/usr/bin/env node
// functions/scripts/check-skipper-cam.js: the Skipper Cam (docs/specs/base-camp.md "Skipper Cam"), run against the in-memory Firestore. No network.
//   npm run check   (or node scripts/check-skipper-cam.js)
const assert = require("assert/strict");
const { makeDb } = require("./fixtures/fake-firestore");

const admin = require("firebase-admin");
process.env.GCLOUD_PROJECT ||= "boomertanger-staging";
process.env.FIREBASE_CONFIG ||= JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const wdb = makeDb(); const realFs = admin.firestore;
const fakeFs = () => wdb; fakeFs.Timestamp = realFs.Timestamp; fakeFs.FieldValue = realFs.FieldValue;
Object.defineProperty(admin, "firestore", { value: fakeFs, configurable: true, writable: true });
const S = "sites/boomertanger";

let clock = Date.UTC(2026, 9, 12, 15, 0);
const logs = [];
const adminLogEntry = async (_d, f) => { logs.push(f); return { ...f }; };
const mod = require("../lib/skipperCam");
const K = mod.build({ db: wdb, adminLogEntry, now: () => clock }).ops;
const req = (uid, data = {}) => ({ auth: uid ? { uid, token: {} } : undefined, data });
const why = async (p) => { try { await p; return "ok"; } catch (e) { return e.details?.reason || e.message; } };
const pub = async () => (await wdb.doc(`${S}/public/skipperCam`).get()).data();
const ALL = { sound: true, privateDetails: true, window: true };
const ID = "dQw4w9WgXcQ";

async function main() {
  assert.equal(mod.videoIdOf(ID), ID);
  assert.equal(mod.videoIdOf(`https://www.youtube.com/watch?v=${ID}&t=3`), ID);
  assert.equal(mod.videoIdOf(`https://youtu.be/${ID}`), ID);
  assert.equal(mod.videoIdOf(`https://www.youtube.com/live/${ID}?si=x`), ID);
  assert.equal(mod.videoIdOf("nope"), null);

  await wdb.doc(S).set({ ownerUid: "owner" });
  for (const [uid, handle] of [["owner", "boomer"], ["m1", "fan"], ["ad", "adminy"]]) { await wdb.doc(`${S}/profiles/${uid}`).set({ handle }); await wdb.doc(`${S}/members/${uid}`).set({ roles: uid === "ad" ? ["admin"] : [] }); }

  // only the owner; three checks and a video id to go live
  assert.equal(await why(K.set(req("ad", { live: true, videoId: ID, checks: ALL }))), "notOwner");
  assert.equal(await why(K.set(req("owner", { live: true, videoId: ID, checks: { sound: true, window: true } }))), "checks");
  assert.equal(await why(K.set(req("owner", { live: true, videoId: "bad", checks: ALL }))), "videoId");
  assert.equal(await why(K.watch(req("m1"))), "notLive");
  assert.equal(await why(K.set(req("owner", { live: true, videoId: `https://youtu.be/${ID}`, checks: ALL }))), "ok");
  assert.equal((await pub()).live, true);
  assert.equal(JSON.stringify(await pub()).includes(ID), false, "the id is never public");

  // members watch; visitors and mid-signup don't
  assert.equal((await K.watch(req("m1"))).videoId, ID);
  assert.equal(await why(K.watch(req(null))), "signedOut");
  assert.equal(await why(K.watch(req("stranger"))), "audience");

  // the sweep turns it off after 12 hours, not before
  clock += 11 * 3600000;
  assert.equal((await K.sweep()).turnedOff, false);
  clock += 2 * 3600000;
  assert.equal((await K.sweep()).turnedOff, true);
  const p = await pub();
  assert.equal(p.live, false); assert.equal(p.lastOn.toMillis(), clock);
  assert.equal(await why(K.watch(req("m1"))), "notLive");

  // turning off is always allowed (no checks)
  await K.set(req("owner", { live: true, videoId: ID, checks: ALL }));
  clock += 60000;
  assert.equal(await why(K.set(req("owner", { live: false }))), "ok");
  assert.equal((await pub()).lastOn.toMillis(), clock);
  assert.deepEqual(logs.map((l) => [l.feature, l.action, l.details?.by || ""]), [["skipperCam", "goLive", ""], ["skipperCam", "off", "sweep"], ["skipperCam", "goLive", ""], ["skipperCam", "off", "owner"]]);
  assert.equal(JSON.stringify(logs).includes(ID), false, "the id is never logged");
  console.log("check-skipper-cam: ok");
}
main().catch((err) => { console.error(err); process.exit(1); });
