#!/usr/bin/env node
// functions/scripts/check-broken-links.js: Broken links (docs/specs/not-found.md "Data"), run against the in-memory Firestore. No network, no deploy.
//   npm run check      (or node scripts/check-broken-links.js)
const assert = require("assert/strict");
const { makeDb } = require("./fixtures/fake-firestore");

const admin = require("firebase-admin");
process.env.GCLOUD_PROJECT ||= "boomertanger-staging";
process.env.FIREBASE_CONFIG ||= JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const wdb = makeDb(); const realFs = admin.firestore;
const fakeFs = () => wdb; fakeFs.Timestamp = realFs.Timestamp; fakeFs.FieldValue = realFs.FieldValue;
Object.defineProperty(admin, "firestore", { value: fakeFs, configurable: true, writable: true });

const S = "sites/boomertanger", H = 3600000;
const report = require("../lib/brokenLinks/report");
const { cleanPath, referrerHost, linkId } = report;
let clock = Date.UTC(2026, 9, 10, 15, 0);
const logs = [];
const adminLogEntry = async (_db, f) => { logs.push(f); return { ...f, createdAt: "now" }; };
const { handlers } = report({ adminLogEntry, now: () => clock });

const visitor = (ip = "203.0.113.7") => ({ auth: null, rawRequest: { ip } });
const member = (uid) => ({ auth: { uid, token: { email: `${uid}@x.test`, email_verified: true } }, rawRequest: { ip: "198.51.100.1" } });
const row = async (path) => (await wdb.doc(`${S}/brokenLinks/${linkId(path)}`).get()).data();
const reason = async (p) => { try { await p; return "ok"; } catch (e) { return e.details?.reason || e.message; } };

(async () => {
  // the pure helpers
  assert.equal(cleanPath("/schedual?code=SECRET#top"), "/schedual");
  assert.equal(cleanPath("/a b/<script>"), "/a b/<script>");   // stored as text; the admin card escapes it
  for (const bad of ["schedual", "", 42, null, "/" + "x".repeat(300), "/a\nb"]) assert.throws(() => cleanPath(bad), /address/);
  assert.equal(cleanPath("/" + "x".repeat(299)).length, 300);
  assert.equal(referrerHost("https://www.Google.com/search?q=boomer"), "www.google.com");
  assert.equal(referrerHost(""), "direct");
  assert.equal(referrerHost("android-app://com.x"), "direct");
  assert.equal(referrerHost("not a url"), "direct");
  assert.match(linkId("/x"), /^[0-9a-f]{40}$/);

  // a first report creates the row; the query and hash never reach it
  await handlers.report({ ...visitor(), data: { path: "/schedual?code=SECRET#x", referrer: "https://t.co/abc" } });
  let r = await row("/schedual");
  assert.equal(r.path, "/schedual"); assert.equal(r.count, 1); assert.deepEqual(r.referrerHosts, ["t.co"]);
  assert.equal(r.fixedAt, null); assert.equal(r.fixedBy, null);
  assert.ok(!JSON.stringify(r).includes("SECRET"));
  assert.ok((await wdb.doc(`${S}/private/arcadeSalt`).get()).exists, "uses the Arcade's daily salt");

  // the same visitor, same path, same day: ok, not counted
  assert.equal(await reason(handlers.report({ ...visitor(), data: { path: "/schedual", referrer: "" } })), "ok");
  assert.equal((await row("/schedual")).count, 1);
  // another visitor counts and adds its referrer host (up to 5 unique)
  await handlers.report({ ...visitor("192.0.2.9"), data: { path: "/schedual" } });
  r = await row("/schedual"); assert.equal(r.count, 2); assert.deepEqual(r.referrerHosts, ["t.co", "direct"]);
  for (let i = 0; i < 6; i++) await handlers.report({ ...visitor(`192.0.2.${20 + i}`), data: { path: "/schedual", referrer: `https://h${i}.test/` } });
  r = await row("/schedual"); assert.equal(r.count, 8); assert.equal(r.referrerHosts.length, 5);
  // next day, the first visitor counts again
  clock += 24 * H;
  await handlers.report({ ...visitor(), data: { path: "/schedual" } });
  assert.equal((await row("/schedual")).count, 9);

  // 10 per hour per visitor key; the next hour is fresh
  for (let i = 0; i < 10; i++) assert.equal(await reason(handlers.report({ ...member("m1"), data: { path: `/p${i}` } })), "ok");
  assert.equal(await reason(handlers.report({ ...member("m1"), data: { path: "/p10" } })), "rateLimit");
  clock += H;
  assert.equal(await reason(handlers.report({ ...member("m1"), data: { path: "/p10" } })), "ok");
  // bad input
  assert.equal(await reason(handlers.report({ ...visitor(), data: { path: "javascript:alert(1)" } })), "badPath");

  // Mark fixed: admins only; sets fixedAt / fixedBy, writes the adminLog entry, never deletes
  await wdb.doc(S).set({ ownerUid: "owner1" });
  await wdb.doc(`${S}/members/admin1`).set({ roles: ["admin"] });
  await wdb.doc(`${S}/profiles/admin1`).set({ handle: "boss" });
  await wdb.doc(`${S}/members/mod1`).set({ roles: ["mod"] });
  await wdb.doc(`${S}/profiles/mod1`).set({ handle: "moddy" });
  const id = linkId("/schedual");
  assert.equal(await reason(handlers.fix({ ...member("mod1"), data: { id } })), "notAdmin");
  assert.equal(await reason(handlers.fix({ ...visitor(), data: { id } })), "signedOut");
  assert.equal(await reason(handlers.fix({ ...member("admin1"), data: { id: "nope" } })), "badId");
  assert.equal(await reason(handlers.fix({ ...member("admin1"), data: { id: "0".repeat(40) } })), "notFound");
  assert.deepEqual(await handlers.fix({ ...member("admin1"), data: { id } }), { ok: true });
  r = await row("/schedual");
  assert.ok(r.fixedAt); assert.equal(r.fixedBy, "admin1"); assert.equal(r.count, 9);
  const log = (await wdb.collection("adminLog").get()).docs.map((d) => d.data());
  assert.equal(log.length, 1); assert.equal(log[0].feature, "brokenLinks"); assert.equal(log[0].action, "fix");
  assert.equal(log[0].itemTitle, "/schedual"); assert.equal(log[0].itemPath, `${S}/brokenLinks/${id}`); assert.equal(log[0].actorName, "@boss");
  assert.deepEqual(await handlers.fix({ ...member("owner1"), data: { id } }), { ok: true, already: true });
  assert.equal((await wdb.collection("adminLog").get()).docs.length, 1, "no second entry");

  // a new report reopens a fixed row and counts
  await handlers.report({ ...visitor("192.0.2.99"), data: { path: "/schedual" } });
  r = await row("/schedual"); assert.equal(r.fixedAt, null); assert.equal(r.fixedBy, null); assert.equal(r.count, 10);

  console.log("check-broken-links: all checks passed");
})().catch((err) => { console.error(err); process.exit(1); });
