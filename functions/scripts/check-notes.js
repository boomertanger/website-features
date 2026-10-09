#!/usr/bin/env node
// functions/scripts/check-notes.js: Mod Machina phase 3 part 4, the crew notes (crewNote, crewNoteDelete; docs/specs/mod-machina.md section 17a), run against the in-memory Firestore. No network, no deploy.
//   npm run check      (or node scripts/check-notes.js)
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
const adminLogEntry = async (_d, f) => ({ ...f, createdAt: realFs.Timestamp.now() });
const fns = require("../lib/crew/notes")({ adminLogEntry });
const as = (uid, fn, data = {}) => fns[fn].run({ auth: uid ? { uid, token: {} } : undefined, data });
const why = async (p) => { try { await p; return "ok"; } catch (e) { return e.details?.reason || e.message; } };
const notes = async () => (await wdb.collection(`${S}/crew/main/notes`).get()).docs.map((d) => ({ id: d.id, ...d.data() }));

async function main() {
  await wdb.doc(S).set({ ownerUid: "boss" });
  const person = async (uid, roles, roster) => {
    await wdb.doc(`${S}/members/${uid}`).set({ roles }); await wdb.doc(`${S}/profiles/${uid}`).set({ handle: `${uid}_h` });
    if (roster) await wdb.doc(`${S}/crew/main/roster/${uid}`).set({ handle: `${uid}_h`, status: "active", ...roster });
  };
  await person("boss", ["admin"]); await person("adm", ["admin"], { track: "admin", grade: 2 });
  await person("m1", ["mod"], { track: "mod", grade: 2 }); await person("m2", ["mod"], { track: "mod", grade: 1, status: "reserve" });
  await person("paused", ["mod"], { track: "mod", grade: 2, status: "paused" }); await person("gone", ["mod"], { track: "mod", grade: 2, status: "alumni" }); await person("fan", []);

  // who can post
  assert.equal(await why(as(null, "crewNote", { text: "hi" })), "signedOut");
  for (const u of ["fan", "paused", "gone"]) assert.equal(await why(as(u, "crewNote", { text: "hi" })), "notCrew", `${u} can't post`);
  for (const u of ["boss", "adm", "m1", "m2"]) assert.equal(await why(as(u, "crewNote", { text: "hello" })), "ok", `${u} posts (any grade, any status but Paused and Alumni)`);
  // length
  assert.equal(await why(as("m1", "crewNote", { text: "   " })), "field"); assert.equal(await why(as("m1", "crewNote", { text: "x".repeat(201) })), "field"); assert.equal(await why(as("m1", "crewNote", {})), "field");
  assert.equal(await why(as("m1", "crewNote", { text: "x".repeat(200) })), "ok", "200 characters is fine");
  // what is written: handle, grade, 24 h expiry, no extra
  const n1 = (await notes()).find((n) => n.uid === "m1");
  assert.equal(n1.handle, "m1_h"); assert.equal(n1.grade, 2); assert.equal(n1.text, "hello");
  assert.equal(n1.expireAt.toMillis() - n1.createdAt.toMillis(), 24 * 3600000, "expireAt is createdAt + 24 h");
  // 10 a day: m1 has 2 so far
  for (let i = 0; i < 8; i++) assert.equal(await why(as("m1", "crewNote", { text: `n${i}` })), "ok");
  assert.equal(await why(as("m1", "crewNote", { text: "one more" })), "limit", "the 11th in a day is refused");
  assert.equal(await why(as("m2", "crewNote", { text: "another person is fine" })), "ok");
  // notes older than a day don't count against the limit
  for (const n of (await notes()).filter((n) => n.uid === "m1")) await wdb.doc(`${S}/crew/main/notes/${n.id}`).update({ createdAt: realFs.Timestamp.fromMillis(Date.now() - 25 * 3600000) });
  assert.equal(await why(as("m1", "crewNote", { text: "fresh day" })), "ok", "yesterday's notes don't count");

  // delete: own, any for admins (logged), nobody else
  const mine = (await notes()).find((n) => n.uid === "m2"), theirs = (await notes()).find((n) => n.uid === "m1" && n.text === "fresh day");
  assert.equal(await why(as(null, "crewNoteDelete", { noteId: mine.id })), "signedOut"); assert.equal(await why(as("m1", "crewNoteDelete", {})), "args");
  assert.equal(await why(as("m1", "crewNoteDelete", { noteId: mine.id })), "notYours", "a mod can't delete someone else's note");
  assert.equal(await why(as("fan", "crewNoteDelete", { noteId: mine.id })), "notYours");
  const logs = async () => (await wdb.collection("adminLog").get()).docs.filter((d) => d.get("action") === "crewNoteDelete");
  assert.equal(await why(as("m2", "crewNoteDelete", { noteId: mine.id })), "ok"); assert.equal((await logs()).length, 0, "an author deleting their own note is not logged");
  assert.equal(await why(as("adm", "crewNoteDelete", { noteId: theirs.id })), "ok"); assert.equal((await logs()).length, 1, "an admin delete is logged");
  assert.equal((await notes()).some((n) => n.id === theirs.id || n.id === mine.id), false);
  assert.equal((await as("m1", "crewNoteDelete", { noteId: "gone-already" })).gone, true, "deleting a note that's already gone is fine");

  // rules and indexes
  const root = path.join(__dirname, "..", "..");
  const rules = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
  assert.ok(/match \/notes\/\{noteId\} \{\s+allow read: if isSiteStaff\(siteId\) \|\| isSiteOwner\(siteId\);\s+allow write: if false;/.test(rules), "notes: crew and the owner read, no client writes");
  const idx = JSON.parse(fs.readFileSync(path.join(root, "firestore.indexes.json"), "utf8"));
  assert.ok(idx.fieldOverrides.some((o) => o.collectionGroup === "notes" && o.fieldPath === "expireAt" && o.ttl === true), "TTL on notes.expireAt");
  assert.ok(/require\("\.\/notes"\)/.test(fs.readFileSync(path.join(__dirname, "..", "lib", "crew", "index.js"), "utf8")), "crew/index.js exports the notes functions");
  console.log("check-notes: ok");
}
main().catch((e) => { console.error(e); process.exit(1); });
