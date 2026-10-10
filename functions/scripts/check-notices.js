#!/usr/bin/env node
// functions/scripts/check-notices.js: Mod Machina phase 3 part 7, HQ notices (writeNotice, writeNotices, crewNoticeRead; the swap board's notices), run against the in-memory Firestore.
// No network, no deploy.
//   npm run check      (or node scripts/check-notices.js)
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { makeDb } = require("./fixtures/fake-firestore");

const admin = require("firebase-admin");
process.env.GCLOUD_PROJECT ||= "boomertanger-staging";
process.env.FIREBASE_CONFIG ||= JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const wdb = makeDb(); const realFs = admin.firestore;
const fakeFs = () => wdb; fakeFs.Timestamp = realFs.Timestamp; fakeFs.FieldValue = realFs.FieldValue;
Object.defineProperty(admin, "firestore", { value: fakeFs, configurable: true, writable: true });
const S = "sites/boomertanger";
const DAY = 24 * 3600000;
const adminLogEntry = async (_d, f) => ({ ...f, createdAt: realFs.Timestamp.now() });
const mod = require("../lib/crew/notices");
const fns = mod({ adminLogEntry });
const as = (uid, fn, data = {}) => fns[fn].run({ auth: uid ? { uid, token: {} } : undefined, data });
const why = async (p) => { try { await p; return "ok"; } catch (e) { return e.details?.reason || e.message; } };
const list = async (p) => (await wdb.collection(p).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const notices = () => list(`${S}/crew/main/notices`);
const outbox = () => list(`${S}/notifyOutbox`);

async function main() {
  let clock = Date.UTC(2026, 10, 3, 15, 0);
  const N = mod.makeNotices({ db: wdb, now: () => clock });

  // ---------- writeNotice: the notice and its outbox entry, in one call ----------
  assert.equal(await N.writeNotice("m1", { kind: "status", title: "You're on Check-in", text: "One missed month. Perks stay.", link: "/crew/hq" }), true);
  let ns = await notices();
  assert.equal(ns.length, 1);
  const n0 = ns[0];
  assert.deepEqual(Object.keys(n0).sort(), ["createdAt", "expireAt", "id", "kind", "link", "readAt", "text", "title", "uid"]);
  assert.equal(n0.uid, "m1"); assert.equal(n0.kind, "status"); assert.equal(n0.readAt, null);
  assert.equal(n0.expireAt.toMillis() - n0.createdAt.toMillis(), 30 * DAY, "expires after 30 days (TTL)");
  let ob = await outbox();
  assert.equal(ob.length, 1); assert.equal(ob[0].type, "crewNotice"); assert.deepEqual(ob[0].uids, ["m1"]); assert.equal(ob[0].payload.title, "You're on Check-in"); assert.equal(ob[0].status, "pending");
  // a link that isn't a site path is dropped; an unknown kind is refused
  await N.writeNotice("m1", { kind: "reminder", title: "t", text: "x", link: "https://evil.example" });
  assert.equal((await notices()).find((x) => x.kind === "reminder").link, null);
  await assert.rejects(N.writeNotice("m1", { kind: "nope", title: "t", text: "x" }));
  // with an id it is written once (a retried run is a no-op), outbox included
  assert.equal(await N.writeNotice("m2", { id: "rem-2026-11-15-m2", kind: "reminder", title: "Behind", text: "1 of 3" }), true);
  assert.equal(await N.writeNotice("m2", { id: "rem-2026-11-15-m2", kind: "reminder", title: "Behind", text: "1 of 3" }), false);
  assert.equal((await notices()).filter((x) => x.uid === "m2").length, 1); assert.equal((await outbox()).filter((x) => x.uids[0] === "m2").length, 1);
  // { outbox: false } writes the notice only
  const obBefore = (await outbox()).length;
  await N.writeNotice("m3", { kind: "rules", title: "Rules", text: "x" }, { outbox: false });
  assert.equal((await outbox()).length, obBefore);

  // ---------- writeNotices: many people, notices only ----------
  assert.equal(await N.writeNotices(["a", "b", "a", "", null], { kind: "swap", title: "Seat", text: "Take it" }), 2);
  assert.equal((await notices()).filter((x) => x.kind === "swap").length, 2);
  assert.equal((await outbox()).length, obBefore, "writeNotices never writes the outbox");

  // ---------- crewNoticeRead: your own only ----------
  const mine = (await notices()).find((x) => x.uid === "m1" && x.kind === "status");
  assert.equal(await why(as(null, "crewNoticeRead", { noticeId: mine.id })), "signedOut");
  assert.equal(await why(as("m1", "crewNoticeRead", {})), "args");
  assert.equal(await why(as("m2", "crewNoticeRead", { noticeId: mine.id })), "notYours");
  assert.equal((await as("m1", "crewNoticeRead", { noticeId: mine.id })).ok, true);
  const read1 = (await notices()).find((x) => x.id === mine.id).readAt;
  assert.ok(read1, "marked read");
  clock += DAY; await as("m1", "crewNoticeRead", { noticeId: mine.id });
  assert.equal((await notices()).find((x) => x.id === mine.id).readAt.toMillis(), read1.toMillis(), "reading twice keeps the first time");
  assert.equal((await as("m1", "crewNoticeRead", { noticeId: "gone" })).gone, true);

  // ---------- the swap board: one outbox entry (as before) and a notice per person ----------
  await wdb.doc(`${S}/crew/main/roster/w1`).set({ handle: "w1", track: "mod", grade: 2, status: "active", platforms: {} });
  await wdb.doc(`${S}/crew/main/roster/w2`).set({ handle: "w2", track: "mod", grade: 3, status: "checkIn", platforms: {} });
  await wdb.doc(`${S}/crew/main/roster/low`).set({ handle: "low", track: "mod", grade: 1, status: "active", platforms: {} });
  await wdb.doc(`${S}/crew/main/roster/gone`).set({ handle: "gone", track: "mod", grade: 3, status: "reserve", platforms: {} });
  const sent = [];
  const swap = require("../lib/crew/swap").makeSwap({ db: wdb, FieldValue: realFs.FieldValue, Timestamp: realFs.Timestamp, outbox: async (d) => { sent.push(d); }, notices: N });
  const before = (await notices()).length;
  await swap.open({ streamId: "s1", seat: { room: "ytLandscape", role: "lead" }, from: { uid: "w1", handle: "w1" }, startsAtMs: clock + 3 * DAY, title: "Monster Monday", nowMs: clock });
  assert.equal(sent.length, 1, "the swap board's own outbox entry, once"); assert.deepEqual(sent[0].uids, ["w2"]);
  const sw = (await notices()).slice(before).filter((x) => x.kind === "swap" && x.title.startsWith("Monster Monday"));
  assert.deepEqual(sw.map((x) => x.uid), ["w2"], "a notice for the same people (Lead needs Watcher+, Active or Check-in, not the dropper)");
  assert.match(sw[0].text, /Room Lead, YouTube/); assert.equal(sw[0].link, "/crew/hq");
  assert.equal((await outbox()).filter((x) => x.type === "crewNotice" && x.uids.includes("w2")).length, 0, "and no second outbox entry for it");

  // ---------- rules and indexes ----------
  const rules = fs.readFileSync(path.join(__dirname, "../../firestore.rules"), "utf8");
  assert.match(rules, /match \/notices\/\{noticeId\} \{\s*allow read: if request\.auth != null && \(resource\.data\.uid == request\.auth\.uid \|\| hasSiteRole\(siteId, 'admin'\) \|\| isSiteOwner\(siteId\)\);\s*allow write: if false;/);
  const idx = JSON.parse(fs.readFileSync(path.join(__dirname, "../../firestore.indexes.json"), "utf8"));
  assert.ok(idx.fieldOverrides.some((f) => f.collectionGroup === "notices" && f.fieldPath === "expireAt" && f.ttl === true));
  assert.ok(idx.indexes.some((i) => i.collectionGroup === "notices" && i.fields.map((f) => f.fieldPath).join() === "uid,createdAt"));

  console.log("check-notices: ok");
}
main().catch((e) => { console.error(e); process.exit(1); });
