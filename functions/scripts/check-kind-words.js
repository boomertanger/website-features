#!/usr/bin/env node
// functions/scripts/check-kind-words.js: Kind Words (docs/specs/base-camp.md "Kind Words engine"), run against the in-memory Firestore. No network,
// no deploy.   npm run check   (or node scripts/check-kind-words.js)
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
const L = require("../lib/kindWords/logic");

let clock = Date.UTC(2026, 9, 12, 15, 0);
const logs = [];
const adminLogEntry = async (_d, f) => { logs.push(f); return { ...f }; };
const K = require("../lib/kindWords").build({ db: wdb, adminLogEntry, now: () => clock }).ops;
const req = (uid, data) => ({ auth: uid ? { uid, token: { email_verified: true } } : undefined, data });
const why = async (p) => { try { await p; return "ok"; } catch (e) { return e.details?.reason || e.message; } };
const get = async (p) => { const s = await wdb.doc(p).get(); return s.exists ? s.data() : null; };
const nl = (text, extra = {}) => ({ board: "newfoundland", connection: "I've visited", text, ...extra });
const LONG = "Thank you for the warmest welcome I ever had in St. John's.";

async function main() {
  // ---------- pure ----------
  assert.equal(L.cleanText("hi https://x.com/a there www.y.org ok example.com/path end"), "hi there ok end");
  assert.equal(L.countLinks("see https://a.b and c.com"), 2);
  assert.equal(L.validateSubmit(nl("too short")).reason, "badInput");
  assert.equal(L.validateSubmit(nl("x".repeat(601))).field, "text");
  assert.equal(L.validateSubmit(nl(LONG, { connection: "Corgi owner" })).field, "connection", "connection must be the board's");
  assert.equal(L.validateSubmit({ board: "skipper", connection: "Corgi owner", text: LONG, place: "Gander" }).field, "place", "skipper takes no town");
  assert.equal(L.validateSubmit(nl(LONG, { place: "x".repeat(41) })).field, "place");
  assert.equal(L.validateSubmit(nl("short http://spam.example.com/a/b/c/d/e/f/g")).field, "text", "links don't count toward the 20");
  assert.ok(L.validateSubmit(nl(LONG, { place: "Gander" })).ok);
  assert.equal(L.planReview({ status: "withdrawn" }, { action: "approve" }).reason, "wrongStatus");
  assert.equal(L.planReview({ status: "pending" }, { action: "feature" }).reason, "wrongStatus");
  assert.deepEqual(L.planReview({ status: "pending" }, { action: "reject", note: "  off topic " }).note, "off topic");

  // ---------- setup ----------
  await wdb.doc(S).set({ ownerUid: "owner" });
  for (const [uid, handle] of [["m1", "puffinfan"], ["m2", "rocklover"], ["owner", "boomer"], ["ad", "adminy"], ["mod1", "nightowl"]]) await wdb.doc(`${S}/profiles/${uid}`).set({ handle, displayName: handle });
  for (const uid of ["m1", "m2", "owner", "ad", "mod1"]) await wdb.doc(`${S}/members/${uid}`).set({ roles: uid === "ad" ? ["admin"] : uid === "mod1" ? ["mod"] : [] });
  await wdb.doc(`${S}/crew/main/roster/mod1`).set({ handle: "nightowl", status: "active" });

  // ---------- kindSubmit ----------
  assert.equal(await why(K.submit(req(null, nl(LONG)))), "signedOut");
  assert.equal(await why(K.submit(req("stranger", nl(LONG)))), "needsSignup", "no profile = not signed up");
  const a = await K.submit(req("m1", nl(`${LONG} https://spam.example/x`, { place: "Gander" })));
  assert.equal(a.linksRemoved, 1);
  const card = await get(`${S}/kindWords/${a.id}`);
  assert.equal(card.status, "pending"); assert.equal(card.handle, "puffinfan"); assert.equal(card.place, "Gander"); assert.ok(!card.text.includes("spam"));
  assert.equal(card.flagged, false);
  assert.equal(await why(K.submit(req("m1", nl(LONG)))), "pendingExists", "one pending per board");
  const b = await K.submit(req("m1", { board: "skipper", connection: "Corgi owner", text: "Skipper, my corgi Biscuit says hi to you!" }));
  assert.ok(b.id, "another board is fine");
  // the crew name check flags it
  const f = await K.submit(req("m2", nl("Nightowl made my night, thanks for the welcome!")));
  assert.equal((await get(`${S}/kindWords/${f.id}`)).flagged, true);
  assert.equal((await get(`${S}/kindWords/${f.id}/private/review`)).nameFlag.handle, "nightowl");

  // ---------- kindWithdraw ----------
  assert.equal(await why(K.withdraw(req("m2", { id: a.id }))), "gone", "only the author");
  assert.equal(await why(K.withdraw(req("m1", { id: a.id }))), "ok");
  assert.equal((await get(`${S}/kindWords/${a.id}`)).status, "withdrawn");
  assert.equal(await why(K.withdraw(req("m1", { id: a.id }))), "wrongStatus");
  // 3 a day: m1 has made 2 today; a third is fine, a fourth isn't
  const c3 = await K.submit(req("m1", nl(LONG)));
  await K.withdraw(req("m1", { id: c3.id }));
  assert.equal(await why(K.submit(req("m1", nl(LONG)))), "rateLimit");
  clock += L.DAY_MS;
  assert.equal(await why(K.submit(req("m1", nl(LONG)))), "ok", "a new day");

  // ---------- kindReview ----------
  assert.equal(await why(K.review(req("m2", { id: b.id, action: "approve" }))), "notAdmin");
  assert.equal(await why(K.review(req("mod1", { id: b.id, action: "approve" }))), "notAdmin", "mods can't review");
  assert.equal((await K.review(req("ad", { id: b.id, action: "approve" }))).status, "approved");
  assert.equal((await K.review(req("owner", { id: b.id, action: "feature" }))).featured, true);
  const r = await K.review(req("ad", { id: f.id, action: "reject", note: "Names a mod by handle" }));
  assert.equal(r.status, "rejected");
  assert.equal((await get(`${S}/kindWords/${f.id}/private/review`)).rejectNote, "Names a mod by handle", "the note is private");
  assert.equal((await get(`${S}/kindWords/${f.id}`)).rejectNote, undefined, "never on the card the author reads");
  assert.equal((await K.review(req("ad", { id: b.id, action: "hide" }))).status, "hidden");
  assert.equal((await get(`${S}/kindWords/${b.id}`)).featured, false, "hiding unfeatures");
  assert.equal(await why(K.review(req("ad", { id: a.id, action: "approve" }))), "wrongStatus", "withdrawn stays withdrawn");
  assert.ok(await get(`${S}/kindWords/${a.id}`), "nothing is deleted");
  assert.deepEqual(logs.map((l) => [l.feature, l.action]), [["kindWords", "approve"], ["kindWords", "feature"], ["kindWords", "reject"], ["kindWords", "hide"]]);
  assert.equal(logs[2].reason, "Names a mod by handle");

  console.log("check-kind-words: ok");
}
main().catch((err) => { console.error(err); process.exit(1); });
