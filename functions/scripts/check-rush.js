#!/usr/bin/env node
// functions/scripts/check-rush.js: Recruit Rush (docs/specs/mod-machina.md §17a, phase 3 part 6), run against
// the in-memory Firestore and fakes for YouTube, Twitch and Cloud Tasks. No network, no credentials, no deploy.
//   npm run check      (or node scripts/check-rush.js)
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { makeDb } = require("./fixtures/fake-firestore");
const L = require("../lib/live/logic");

const admin = require("firebase-admin");
process.env.GCLOUD_PROJECT ||= "boomertanger-staging";
process.env.FIREBASE_CONFIG ||= JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const wdb = makeDb(); const realFs = admin.firestore;
const fakeFs = () => wdb; fakeFs.Timestamp = realFs.Timestamp; fakeFs.FieldValue = realFs.FieldValue;
Object.defineProperty(admin, "firestore", { value: fakeFs, configurable: true, writable: true });
const TS = (m) => realFs.Timestamp.fromMillis(m);
const S = "sites/boomertanger";
const H = 3600000, MIN = 60000;
let clock = Date.UTC(2026, 9, 12, 1, 0);

const yt = { active: [], created: [], listCalls: 0, down: false, videos: {}, videosCalls: 0, videosFail: false };
const net = [], tasks = [], sleeps = [];
let taskFail = null;
const tw = { live: false, viewers: 0 };
const jr = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body), json: async () => body });
const fakeFetch = async (url, init = {}) => {
  net.push({ url, ...init });
  if (url.startsWith("https://id.twitch.tv/oauth2/token")) return jr(200, { access_token: "TWTOKEN", expires_in: 3600 });
  if (url.startsWith("https://api.twitch.tv/helix/users")) return jr(200, { data: [{ id: "B1" }] });
  if (url.startsWith("https://api.twitch.tv/helix/streams")) return jr(200, { data: tw.live ? [{ viewer_count: tw.viewers, started_at: new Date(clock).toISOString() }] : [] });
  throw new Error("unexpected network call " + url);
};
const fakeYoutube = {
  apiClient: async () => { if (yt.down) return null; return { list: async ({ status }) => { yt.listCalls++; assert.equal(status, "active"); return yt.active.map((id) => ({ id })); }, videosList: async (ids) => { yt.videosCalls++; if (yt.videosFail) throw new Error("quota"); return ids.filter((id) => yt.videos[id] != null).map((id) => ({ id, liveStreamingDetails: { concurrentViewers: yt.videos[id] } })); } }; },
  syncStream: async (id, opts) => { yt.created.push({ id, ...opts }); return { action: "create", status: "ok" }; },
};
const adminLogEntry = async (_d, f) => ({ ...f, createdAt: realFs.Timestamp.now() });
let wordPick = 0;
const rng = () => [0.0, 0.5, 0.9, 0.3, 0.7][wordPick++ % 5];
const nsEvents = [];
const fakeFactory = { recordFactoryEvent: async (uid, type, params, ref) => { nsEvents.push({ uid, type, params, ref }); return { counted: true }; } };
const live = require("../lib/live").build({ adminLogEntry, youtube: fakeYoutube, now: () => clock, rng, factory: fakeFactory,
  fetchFn: fakeFetch, twitchClientId: "CID", twitchClientSecret: "TSEC", twitchLogin: "boomertanger",
  eventSubSecret: "ES-TEST-SECRET-123",
  enqueue: async (data, opts) => { if (taskFail) throw taskFail; tasks.push({ data, opts }); }, sleep: async (ms) => { sleeps.push(ms); } });
const fns = live.functions, ctx = live.hooks.ctx;
const as = (uid, fn, data = {}) => fns[fn].run({ auth: uid ? { uid, token: {} } : undefined, data });
const why = async (p) => { try { await p; return "ok"; } catch (e) { return e.details?.reason || e.message; } };
const get = async (p) => (await wdb.doc(`${S}/${p}`).get()).data();
const col = async (p) => (await wdb.collection(`${S}/${p}`).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const root = async (p) => (await wdb.collection(p).get()).docs.map((d) => d.data());

const pubLive = () => get("public/live");
const rushNow = async (id) => ((await get(`streams/${id}/private/control`)) || {}).recruitRush || null;
// a users/{uid} write as the trigger sees it
const snap = (d) => ({ exists: !!d, data: () => d, get: (k) => (d || {})[k] });
const userEvent = (uid, before, after) => fns.onUserCreatedRush.run({ params: { uid }, data: { before: snap(before), after: snap(after) } });
let n = 0;
const signUp = async (atMs = clock) => { const uid = `newbie${++n}`; await userEvent(uid, null, { signedUpAt: TS(atMs) }); return uid; };

async function main() {
  // ---------- the cast ----------
  await wdb.doc(S).set({ ownerUid: "boss", timezone: "America/Chicago" });
  const person = async (uid, roles, roster) => {
    await wdb.doc(`${S}/members/${uid}`).set({ roles }); await wdb.doc(`${S}/profiles/${uid}`).set({ handle: uid, xp: 0 });
    if (roster) await wdb.doc(`${S}/crew/main/roster/${uid}`).set({ handle: uid, status: "active", ...roster });
  };
  await person("boss", ["admin"]); await person("adm2", ["admin"], { track: "admin", grade: 2 }); await person("mod1", ["mod"], { track: "mod", grade: 3 }); await person("fan", []);
  const mkStream = async (id, o = {}) => {
    const d = {
      title: "Monster Monday", slug: id, state: "scheduled", published: true, type: "platform", audience: "public", rooms: ["twitch", "ytLandscape"], platforms: ["twitch", "youtube"],
      plannedStart: TS(clock + H), plannedEnd: TS(clock + 4 * H), hasUnpublishedChanges: false, rev: 1, crew: { captain: "mod1", chats: {}, caps: { deckhands: 2 } }, plannedGames: [], ...o,
    };
    await wdb.doc(`${S}/streams/${id}`).set(d);
    await wdb.doc(`${S}/streams/${id}/private/draft`).set({ ...d, crew: { captain: { uid: "mod1", handle: "mod1" }, chats: {}, caps: { deckhands: 2 } } });
  };
  const ok = { streamId: "s1", on: true, goal: 5, reward: "Hard-mode run on Friday" };

  // ---------- who may set it, and the limits ----------
  await mkStream("s1");
  assert.equal(await why(as(null, "liveRecruitRush", ok)), "signedOut");
  for (const uid of ["fan", "mod1", "adm2"]) assert.equal(await why(as(uid, "liveRecruitRush", ok)), "notOwner", `${uid} refused`);
  for (const goal of [4, 201, 5.5, "10"]) assert.equal(await why(as("boss", "liveRecruitRush", { ...ok, goal })), "goal", `goal ${goal}`);
  for (const reward of ["", "   ", "x".repeat(81)]) assert.equal(await why(as("boss", "liveRecruitRush", { ...ok, reward })), "reward");
  assert.equal(await why(as("boss", "liveRecruitRush", { ...ok, on: "yes" })), "on");
  assert.equal(await why(as("boss", "liveRecruitRush", { ...ok, streamId: "nope" })), "noStream");
  // before the stream: allowed; nothing counts until Start
  let r = await as("boss", "liveRecruitRush", { ...ok, reward: "  Hard-mode run on Friday  " });
  assert.equal(r.on, true); assert.equal(r.reward, "Hard-mode run on Friday"); assert.equal(r.count, 0); assert.equal(r.hitAt, null);
  assert.deepEqual(await rushNow("s1"), { on: true, goal: 5, reward: "Hard-mode run on Friday", count: 0, hitAt: null });
  assert.ok((await root("adminLog")).some((e) => e.action === "recruitRush" && e.actorUid === "boss" && e.details.goal === 5));
  await signUp();
  assert.equal((await rushNow("s1")).count, 0, "a signup before Start doesn't count");

  // ---------- Start: counting ----------
  await as("boss", "startStream", { streamId: "s1" });
  clock += 5 * MIN;
  await ctx.publishLive();
  let pub = await pubLive();
  assert.deepEqual(pub.recruitRush, { goal: 5, count: 0, reward: "Hard-mode run on Friday", hitAt: null });
  const a = await signUp();
  assert.equal((await rushNow("s1")).count, 1);
  // a retried event, an update that already had signedUpAt, a Twitch sign-in that hasn't finished signing up, the role mirror's merge: none count
  await userEvent(a, null, { signedUpAt: TS(clock) });
  await userEvent(a, { signedUpAt: TS(clock) }, { signedUpAt: TS(clock), claimsUpdatedAt: TS(clock) });
  await userEvent("twitchy", null, { linked: { twitch: { login: "twitchy" } }, createdVia: "twitch" });
  await userEvent("roles", null, { claimsUpdatedAt: TS(clock) });
  assert.equal((await rushNow("s1")).count, 1, "retries, updates and unfinished signups don't count");
  await userEvent("twitchy", { createdVia: "twitch" }, { createdVia: "twitch", signedUpAt: TS(clock) });
  assert.equal((await rushNow("s1")).count, 2, "the Twitch member counts when the signup finishes");
  // the count goes through the shards (check-ins untouched) and public/live gets it at the flush, with no uid or handle of a new member
  const shards = await col("streams/s1/counters");
  assert.equal(L.sumRush(shards), 2); assert.deepEqual(L.sumShards(shards), { total: 0, byBeat: {}, byRoom: {} });
  tasks.length = 0;
  await fns.onCheckInWritten.run({ params: { siteId: "boomertanger", streamId: "s1", shard: "0" }, data: {} });
  await ctx.publishLive();
  pub = await pubLive();
  assert.equal(pub.recruitRush.count, 2);
  const text = JSON.stringify(pub);
  for (const id of [a, "twitchy", "newbie"]) assert.ok(!text.includes(id), `public/live has no ${id}`);
  assert.deepEqual(L.findSecrets(pub), []);
  assert.deepEqual(Object.keys(pub.recruitRush).sort(), ["count", "goal", "hitAt", "reward"]);

  // ---------- off and on again ----------
  await as("boss", "liveRecruitRush", { ...ok, on: false });
  await signUp();
  assert.equal(L.sumRush(await col("streams/s1/counters")), 2, "nothing counts while off");
  await ctx.publishLive();
  assert.equal("recruitRush" in (await pubLive()), false, "public/live carries nothing when off");
  await as("boss", "liveRecruitRush", { ...ok, on: true });

  // ---------- the goal: hitAt once ----------
  await signUp(); await signUp();
  assert.equal((await rushNow("s1")).hitAt, null);
  const hitClock = clock;
  await signUp();
  let rn = await rushNow("s1");
  assert.equal(rn.count, 5); assert.equal(ctx.ms(rn.hitAt), hitClock);
  clock += MIN;
  await signUp();
  rn = await rushNow("s1");
  assert.equal(rn.count, 6, "it keeps counting past the goal"); assert.equal(ctx.ms(rn.hitAt), hitClock, "hitAt is set once");
  assert.equal(await why(as("boss", "liveRecruitRush", { ...ok, goal: 10 })), "goalLocked");
  r = await as("boss", "liveRecruitRush", { ...ok, reward: "Hard mode and a costume" });
  assert.equal(r.hitAt, hitClock, "the same goal with a new reward keeps hitAt"); assert.equal(r.count, 6);
  await ctx.publishLive();
  assert.equal((await pubLive()).recruitRush.hitAt, hitClock);

  // ---------- Stop: 30 more minutes, then nothing; no changes after Stop ----------
  await as("boss", "stopStream", {});
  const end = ctx.ms((await get("streams/s1")).actualEnd);
  clock = end + 29 * MIN;
  await signUp();
  assert.equal((await rushNow("s1")).count, 7, "29 minutes after Stop counts");
  clock = end + 31 * MIN;
  await signUp();
  assert.equal((await rushNow("s1")).count, 7, "31 minutes after Stop doesn't");
  assert.equal(await why(as("boss", "liveRecruitRush", ok)), "ended");

  // ---------- the after-show uses the main stream's Rush ----------
  clock += H;
  await mkStream("s2", { title: "Late Night" });
  await as("boss", "startStream", { streamId: "s2" });
  await as("boss", "liveRecruitRush", { ...ok, streamId: "s2", goal: 20, reward: "Costume stream" });
  await signUp();
  clock += 30 * MIN;
  r = await as("boss", "liveAfterShow", {});
  const after = r.streamId;
  clock += 5 * MIN;
  await signUp();
  assert.equal((await rushNow("s2")).count, 2, "a signup during the after-show counts for the main stream");
  assert.equal(await rushNow(after), null, "the after-show has no Rush of its own");
  assert.equal(await why(as("boss", "liveRecruitRush", { ...ok, streamId: after })), "ended", "the after-show's id names the main stream's Rush (ended)");
  await ctx.publishLive();
  pub = await pubLive();
  assert.equal(pub.streamId, after); assert.deepEqual(pub.recruitRush, { goal: 20, count: 2, reward: "Costume stream", hitAt: null });
  assert.equal(L.sumRush(await col("streams/s1/counters")), 7, "the earlier stream's Rush is untouched");

  // ---------- rules and indexes ----------
  const rules = fs.readFileSync(path.join(__dirname, "../../firestore.rules"), "utf8");
  assert.match(rules, /match \/rushJoins\/\{uid\} \{\s*allow read, write: if false;/);
  const idx = JSON.parse(fs.readFileSync(path.join(__dirname, "../../firestore.indexes.json"), "utf8"));
  assert.ok(idx.fieldOverrides.some((f) => f.collectionGroup === "rushJoins" && f.fieldPath === "expireAt" && f.ttl === true));

  console.log("check-rush: ok");
}
main().catch((e) => { console.error(e); process.exit(1); });
