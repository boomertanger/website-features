#!/usr/bin/env node
// functions/scripts/check-boomertang-fn.js: Boomertang's backend (lib/boomertang/*, docs/specs/boomertang.md §3, §5). Part 1 proves the pure rules
// (who reads what, the newest issue, edition notes, moving a vote). Part 2 runs tangAdmin and tangVote against the in-memory Firestore: publish,
// setAccess (refused for No. 1), addEdition, poll open / close / reopen, voting, changing a vote, the locks, the rate limit, "my votes", and that
// lib/boomertang loads nothing from rewards or lib/live. No network, no credentials, no deploy.   npm run check
const assert = require("assert/strict");
const { makeDb } = require("./fixtures/fake-firestore");
const admin = require("firebase-admin");
process.env.GCLOUD_PROJECT ||= "boomertanger-staging";
process.env.FIREBASE_CONFIG ||= JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const wdb = makeDb(); const realFs = admin.firestore;
const fakeFs = () => wdb; fakeFs.Timestamp = realFs.Timestamp; fakeFs.FieldValue = realFs.FieldValue;
Object.defineProperty(admin, "firestore", { value: fakeFs, configurable: true, writable: true });

// ---------- lib/boomertang loads nothing from rewards or lib/live ----------
const M = require("module"), seen = new Set(), orig = M._load;
M._load = function (req, parent) { try { seen.add(M._resolveFilename(req, parent)); } catch { /* builtins */ } return orig.apply(this, arguments); };
const T = require("../lib/boomertang");
M._load = orig;
const bad = [...seen].filter((f) => /rewards[\\/]grant|[\\/]lib[\\/]live[\\/]/.test(f));
assert.deepEqual(bad, [], "lib/boomertang must not load rewards/grant.js or lib/live");
const L = require("../lib/boomertang/logic");

// ================================================================ part 1: the pure rules
(function pure() {
  const vis = { signedIn: false, member: false, sub: false, admin: false, owner: false };
  const fan = { ...vis, signedIn: true, member: true }, sub = { ...fan, sub: true }, adm = { ...fan, admin: true }, own = { ...fan, owner: true };
  const pub = { id: "v1n1", status: "published", access: "public" }, back = { id: "v1n2", status: "published", access: "members" }, newest = { id: "v1n4", status: "published", access: "members" }, draft = { id: "v1n5", status: "draft", access: "members" };
  const cur = "v1n4";
  // spec §3: the access table
  assert.equal(L.canRead(pub, cur, vis), true, "No. 1 and public issues: everyone");
  assert.equal(L.canRead(back, cur, vis), false, "a back issue: visitors get the sealed page");
  assert.equal(L.canRead(back, cur, fan), true, "a back issue: Fan Club reads it");
  assert.equal(L.canRead(newest, cur, fan), false, "the newest issue: Fan Club waits");
  assert.equal(L.canRead(newest, cur, sub), true, "the newest issue: Sub Club reads it first");
  assert.equal(L.canRead(newest, cur, adm), true); assert.equal(L.canRead(newest, cur, own), true);
  assert.equal(L.canRead(draft, cur, sub), false, "drafts: never for readers");
  assert.equal(L.canRead(draft, cur, adm), true, "drafts: admins (preview)"); assert.equal(L.canRead(draft, cur, own), true);
  assert.equal(L.canRead({ ...newest }, "v1n5", fan), true, "the moment No. 5 comes out, No. 4 is a back issue");
  assert.equal(L.newer("v1n2", "v1n1"), true); assert.equal(L.newer("v1n1", "v1n2"), false); assert.equal(L.newer("v2n1", "v1n12"), true); assert.equal(L.newer("v1n1", null), true);
  assert.equal(L.todayCentral(Date.UTC(2026, 9, 18, 3, 30)), "2026-10-17", "10:30 pm Central is still the 17th");
  assert.equal(L.todayCentral(Date.UTC(2026, 9, 18, 6)), "2026-10-18");
  assert.equal(L.editionNote("  Room guide:  the sauna added "), "Room guide: the sauna added");
  assert.equal(L.editionNote(""), null); assert.equal(L.editionNote("x".repeat(121)), null); assert.equal(L.editionNote("x".repeat(120)).length, 120); assert.equal(L.editionNote(3), null);
  assert.deepEqual(L.moveVote({}, null, "a"), { a: 1 });
  assert.deepEqual(L.moveVote({ a: 1 }, "a", "b"), { a: 0, b: 1 });
  assert.deepEqual(L.moveVote({ a: 0, b: 1 }, "a", "b"), { a: 0, b: 2 }, "never below zero");
  assert.deepEqual(L.moveVote({ a: 1 }, "a", "a"), { a: 1 }, "the same vote changes nothing");
  assert.equal(L.pollOpen({ open: true }, 1), true); assert.equal(L.pollOpen({ open: false }, 1), false); assert.equal(L.pollOpen({ open: true, closesAt: 5 }, 10), false);
  console.log("check-boomertang-fn: rules ok");
})();

// ================================================================ part 2: the callables
(async function callables() {
  const { Timestamp } = realFs;
  let clock = Date.UTC(2026, 9, 17, 18);
  const adminLogEntry = async (_db, f) => ({ ...f, createdAt: "now" });
  const fns = T.build({ db: wdb, adminLogEntry, now: () => clock }).functions;
  const SITE = "sites/boomertanger", BASE = `${SITE}/tang/main`;
  const doc = (p) => wdb.doc(p);
  const get = async (p) => (await doc(p).get()).data();
  await doc(SITE).set({ ownerUid: "own" });
  const member = async (uid, roles = []) => { await doc(`${SITE}/members/${uid}`).set({ roles }); await doc(`${SITE}/profiles/${uid}`).set({ handle: uid }); };
  await member("own", []); await member("fan"); await member("sub", ["sub"]); await member("adm", ["admin"]);
  await doc(`${SITE}/members/half`).set({ roles: [] });   // no profile: signup not finished
  const issue = (id, d) => doc(`${BASE}/issues/${id}`).set({ vol: 1, no: Number(id.split("n")[1]), title: `Issue ${id}`, status: "draft", access: "members", textInRepo: false, editions: [], ...d });
  await issue("v1n1", { title: "The Granny Issue", status: "published", access: "public", textInRepo: true });
  await issue("v1n2", { status: "published" });
  await issue("v1n3", {});
  await doc(BASE).set({ currentIssueId: "v1n2" });
  const poll = (id, issueId, d = {}) => doc(`${BASE}/polls/${id}`).set({ issueId, question: `Q ${id}?`, options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], counts: { a: 0, b: 0 }, open: true, closesAt: null, ...d });
  await poll("v1n1-way-out", "v1n1"); await poll("v1n2-newest", "v1n2"); await poll("v1n1-closed", "v1n1", { open: false });
  const as = (uid, fn, data = {}) => fns[fn].run({ auth: uid ? { uid, token: { email_verified: true } } : undefined, data });
  const why = (p) => p.then(() => "ok", (e) => e.details?.reason || e.message);

  // ---- tangAdmin: the owner only ----
  assert.equal(await why(as(null, "tangAdmin", { action: "publish", issueId: "v1n3" })), "signedOut");
  assert.equal(await why(as("adm", "tangAdmin", { action: "publish", issueId: "v1n3" })), "notOwner", "admins can't publish");
  assert.equal(await why(as("own", "tangAdmin", { action: "nope" })), "badAction");
  assert.equal(await why(as("own", "tangAdmin", { action: "publish", issueId: "../x" })), "badIssue");
  assert.equal(await why(as("own", "tangAdmin", { action: "publish", issueId: "v1n9" })), "noIssue");
  assert.equal(await why(as("own", "tangAdmin", { action: "publish", issueId: "v1n2" })), "alreadyPublished");
  // ---- publish: draft -> published, the newest issue moves, one activityLog entry, adminLog ----
  let r = await as("own", "tangAdmin", { action: "publish", issueId: "v1n3" });
  assert.equal(r.current, "v1n3"); assert.equal((await get(`${BASE}/issues/v1n3`)).status, "published");
  assert.equal((await get(BASE)).currentIssueId, "v1n3", "currentIssueId follows the newest published issue");
  let acts = (await wdb.collection("activityLog").get()).docs.map((d) => d.data());
  assert.equal(acts.length, 1); assert.equal(acts[0].type, "tang-issue"); assert.equal(acts[0].feature, "boomertang"); assert.equal(acts[0].link, "/boomertang/vol-1/no-3");
  let logs = (await wdb.collection("adminLog").get()).docs.map((d) => d.data());
  assert.equal(logs.at(-1).feature, "boomertang"); assert.equal(logs.at(-1).action, "publish");
  // publishing an older draft later doesn't steal "newest"
  await issue("v1n0", { no: 0, title: "Old draft" });
  r = await as("own", "tangAdmin", { action: "publish", issueId: "v1n0" });
  assert.equal((await get(BASE)).currentIssueId, "v1n3", "an older issue never becomes the newest");
  // ---- setAccess: refused for an issue whose text is in the repo (No. 1) ----
  assert.equal(await why(as("own", "tangAdmin", { action: "setAccess", issueId: "v1n1", access: "members" })), "textInRepo");
  assert.equal(await why(as("own", "tangAdmin", { action: "setAccess", issueId: "v1n2", access: "everyone" })), "badAccess");
  await as("own", "tangAdmin", { action: "setAccess", issueId: "v1n2", access: "public" });
  assert.equal((await get(`${BASE}/issues/v1n2`)).access, "public");
  assert.equal((await as("own", "tangAdmin", { action: "setAccess", issueId: "v1n2", access: "public" })).unchanged, true);
  await as("own", "tangAdmin", { action: "setAccess", issueId: "v1n2", access: "members" });
  // ---- addEdition: 1 to 120 characters, today's date in Central, newest first ----
  assert.equal(await why(as("own", "tangAdmin", { action: "addEdition", issueId: "v1n1", note: "" })), "badNote");
  assert.equal(await why(as("own", "tangAdmin", { action: "addEdition", issueId: "v1n1", note: "x".repeat(121) })), "badNote");
  clock = Date.UTC(2026, 9, 18, 3, 30);   // 10:30 pm Central on the 17th
  r = await as("own", "tangAdmin", { action: "addEdition", issueId: "v1n1", note: "Room guide: the sauna added" });
  assert.deepEqual(r.edition, { date: "2026-10-17", note: "Room guide: the sauna added" });
  await as("own", "tangAdmin", { action: "addEdition", issueId: "v1n1", note: "Poll results updated" });
  assert.equal((await get(`${BASE}/issues/v1n1`)).editions[0].note, "Poll results updated", "newest edition first");
  // ---- poll: close, reopen ----
  assert.equal(await why(as("own", "tangAdmin", { action: "poll", pollId: "v1n1-nope", op: "close" })), "noPoll");
  assert.equal(await why(as("own", "tangAdmin", { action: "poll", pollId: "v1n1-way-out", op: "melt" })), "badOp");

  // ---- tangVote ----
  const vote = (uid, pollId, optionId) => as(uid, "tangVote", { pollId, optionId });
  assert.equal(await why(vote(null, "v1n1-way-out", "a")), "signedOut");
  assert.equal(await why(vote("half", "v1n1-way-out", "a")), "needsSignup", "voting needs a finished signup");
  assert.equal(await why(vote("fan", "v1n1-way-out", "zzz")), "badOption");
  assert.equal(await why(vote("fan", "v1n1-closed", "a")), "closed", "a closed poll takes no votes");
  r = await vote("fan", "v1n1-way-out", "a");
  assert.deepEqual(r.counts, { a: 1, b: 0 }); assert.equal(r.mine, "a"); assert.equal(r.changed, true);
  r = await vote("fan", "v1n1-way-out", "a");
  assert.equal(r.changed, false, "the same vote again changes nothing"); assert.deepEqual((await get(`${BASE}/polls/v1n1-way-out`)).counts, { a: 1, b: 0 });
  r = await vote("fan", "v1n1-way-out", "b");
  assert.deepEqual(r.counts, { a: 0, b: 1 }, "changing a vote moves it in one transaction");
  assert.equal((await get(`${BASE}/pollVotes/v1n1-way-out_fan`)).optionId, "b");
  await vote("sub", "v1n1-way-out", "b");
  assert.deepEqual((await get(`${BASE}/polls/v1n1-way-out`)).counts, { a: 0, b: 2 });
  // the newest issue (v1n3 is newest now; give it a poll): Fan Club can't vote on it, Sub Club can
  await poll("v1n3-q", "v1n3");
  assert.equal(await why(vote("fan", "v1n3-q", "a")), "locked", "Fan Club waits for the newest issue");
  assert.equal((await vote("sub", "v1n3-q", "a")).mine, "a");
  // a members-only back issue: Fan Club votes
  assert.equal((await vote("fan", "v1n2-newest", "a")).mine, "a");
  // close, vote refused, reopen, vote works; the closed result stays
  await as("own", "tangAdmin", { action: "poll", pollId: "v1n1-way-out", op: "close" });
  assert.equal((await get(`${BASE}/polls/v1n1-way-out`)).open, false);
  assert.equal(await why(vote("adm", "v1n1-way-out", "a")), "closed");
  await as("own", "tangAdmin", { action: "poll", pollId: "v1n1-way-out", op: "reopen" });
  assert.equal((await vote("adm", "v1n1-way-out", "a")).mine, "a");
  // ---- my votes ----
  r = await as("fan", "tangVote", { issueId: "v1n1", mine: true });
  assert.deepEqual(r.votes, { "v1n1-way-out": "b" });
  assert.equal(await why(as("fan", "tangVote", { issueId: "v1n3", mine: true })), "locked");
  // ---- the rate limit: 60 votes an hour ----
  clock = Date.UTC(2026, 9, 19, 12);
  let hit = null;
  for (let i = 0; i < 62 && !hit; i++) { const w = await why(vote("sub", "v1n1-way-out", i % 2 ? "a" : "b")); if (w !== "ok") hit = { i, w }; }
  assert.deepEqual(hit, { i: 60, w: "rateLimit" }, "the 61st vote in an hour is refused");
  console.log("check-boomertang-fn: callables ok");

  // ---- updatePrefs takes tangMode (Paper or Ink, synced to the account) and nothing new besides ----
  const accounts = require("../lib/accounts")({ adminLogEntry });
  await doc("users/fan").set({ signedUpAt: Timestamp.fromMillis(clock), prefs: { showLinked: false } });
  const prefs = (data) => why(accounts.updatePrefs.run({ auth: { uid: "fan", token: { email_verified: true } }, data }));
  assert.equal(await prefs({ tangMode: "ink" }), "ok");
  assert.equal((await get("users/fan")).prefs.tangMode, "ink");
  assert.equal(await prefs({ tangMode: "paper" }), "ok");
  assert.equal((await get("users/fan")).prefs.tangMode, "paper");
  assert.equal(await prefs({ tangMode: "sepia" }), "prefs", "only paper or ink");
  assert.equal(await prefs({ tangMode: true }), "prefs");
  assert.equal(await prefs({ constructor: "ink" }), "prefs", "no prototype keys");
  assert.equal(await prefs({ showLinked: "yes" }), "prefs", "the switches stay booleans");
  console.log("check-boomertang-fn: updatePrefs tangMode ok");
  console.log("check-boomertang-fn: ok");
})().catch((e) => { console.error(e); process.exit(1); });
