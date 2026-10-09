#!/usr/bin/env node
// functions/scripts/check-live-wiring.js: the Control Room's backend wiring (docs/specs/control-room.md §14, Part 3), run against
// the in-memory Firestore and fakes for YouTube, Twitch and Cloud Tasks. No network, no credentials, no deploy.
//   npm run check      (or node scripts/check-live-wiring.js)
// Sections: 3a stream controls, 3b check-ins and presence, 3c feeds and ticks, 3d Twitch EventSub, 3e rules, indexes and seed.
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

async function main() {
  // ---------- the cast ----------
  await wdb.doc(S).set({ ownerUid: "boss", timezone: "America/Chicago" });
  const person = async (uid, roles, roster) => {
    await wdb.doc(`${S}/members/${uid}`).set({ roles }); await wdb.doc(`${S}/profiles/${uid}`).set({ handle: uid, xp: 0 });
    if (roster) await wdb.doc(`${S}/crew/main/roster/${uid}`).set({ handle: uid, status: "active", ...roster });
  };
  await person("boss", ["admin"]); await person("adm2", ["admin"], { track: "admin", grade: 2 });
  await person("adm1", ["admin"], { track: "admin", grade: 1 }); await person("mod1", ["mod"], { track: "mod", grade: 3 });
  await person("capt", ["mod"], { track: "mod", grade: 3 }); await person("fan", []); await person("fan2", []);
  await wdb.doc(`${S}/vaultGames/g1`).set({ title: "Cult of the Lamb" });
  await wdb.doc(`${S}/vaultGames/g2`).set({ title: "Lethal Company" });
  const mkStream = async (id, o = {}) => {
    const d = {
      title: "Monster Monday", slug: id, state: "scheduled", published: true, type: "platform", audience: "public", rooms: ["twitch", "ytLandscape", "ytVertical"], platforms: ["twitch", "youtube"],
      plannedStart: TS(clock + H), plannedEnd: TS(clock + 4 * H), hasUnpublishedChanges: false, rev: 1, crew: { captain: "capt", chats: { twitch: { lead: "mod1", deckhands: [] } }, caps: { deckhands: 2 } },
      plannedGames: [{ gameId: "g1", title: "Cult of the Lamb", order: 0, source: { kind: "owner" } }, { gameId: "g2", title: "Lethal Company", order: 1, source: { kind: "owner" } }], ...o,
    };
    await wdb.doc(`${S}/streams/${id}`).set(d);
    await wdb.doc(`${S}/streams/${id}/private/draft`).set({ ...d, crew: { captain: { uid: "capt", handle: "capt" }, chats: { twitch: { lead: { uid: "mod1", handle: "mod1" }, deckhands: [] } }, caps: { deckhands: 2 } } });
    return d;
  };
  const stream = (id) => get(`streams/${id}`);
  const control = (id) => get(`streams/${id}/private/control`);
  const clean = (o) => JSON.stringify(o);

  // ================================================================ 3a: stream controls
  const STAFF_FNS = ["createAdhocStream", "startStream", "switchGame", "stopStream", "liveBeat", "liveCheckInWindow", "liveScene", "liveAfterShow"];
  const OWNER_FNS = ["liveChecklist", "liveObsKey", "liveDeckKey", "liveSettings"];
  // Role matrix: signed out, a member, a mod (Captain or not), A1 Steward are refused on the server; A2 and the owner pass the gate.
  for (const fn of [...STAFF_FNS, ...OWNER_FNS]) {
    assert.equal(await why(as(null, fn, {})), "signedOut", `${fn}: signed out`);
    for (const uid of ["fan", "mod1", "capt", "adm1", "nobody"]) assert.equal(await why(as(uid, fn, {})), STAFF_FNS.includes(fn) ? "notAllowed" : "notOwner", `${fn}: ${uid} refused`);
  }
  for (const fn of OWNER_FNS) assert.equal(await why(as("adm2", fn, {})), "notOwner", `${fn}: A2 is not the owner`);
  for (const fn of STAFF_FNS) for (const uid of ["adm2", "boss"]) assert.ok(!["signedOut", "notAllowed", "notOwner"].includes(await why(as(uid, fn, {}))), `${fn}: ${uid} passes the gate`);

  // starter templates, saved by the owner (A2 cannot)
  const tpl = { beats: {
    start: [{ text: "Welcome chat by room" }, { text: "Say the word and open check-in", shortcut: "openCheckin" }, { text: "Platform only", only: "platform" }, { text: "Backstage only", only: "backstage" }],
    break1: [{ text: "Hydrate", note: "water" }, { text: "Open check-in", shortcut: "openCheckin" }], break2: [], end: [{ text: "Thank the crew" }],
  } };
  assert.equal(await why(as("adm2", "liveChecklist", { action: "saveTemplates", templates: tpl })), "notOwner");
  assert.equal(await why(as("boss", "liveChecklist", { action: "saveTemplates", templates: { beats: { start: [{ text: "x".repeat(121) }] } } })), "field");
  assert.equal(await why(as("boss", "liveChecklist", { action: "saveTemplates", templates: { beats: { start: [{ text: "a", shortcut: "nope" }] } } })), "templates");
  assert.equal(await why(as("boss", "liveChecklist", { action: "saveTemplates", templates: { beats: { start: [{ text: "a", only: "x" }] } } })), "templates");
  assert.equal((await as("boss", "liveChecklist", { action: "saveTemplates", templates: tpl })).items, 7);
  const saved = await get("live/main/private/checklistTemplates");
  assert.equal(saved.beats.start.length, 4); assert.ok(saved.beats.start.every((i) => i.id), "ids generated");

  // ---------- Start ----------
  await mkStream("s1");
  await mkStream("s2", { title: "Second", plannedGames: [] });
  let r = await as("adm2", "startStream", { streamId: "s1" });
  assert.equal(r.ok, true); assert.equal(r.state, "live");
  let s1 = await stream("s1");
  assert.equal(s1.state, "live"); assert.equal(L.currentBeat(s1.beats), "start"); assert.equal(s1.actualStart.toMillis(), clock);
  assert.equal(s1.segments.length, 1); assert.equal(s1.segments[0].gameId, "g1"); assert.deepEqual(s1.gameIds, ["g1"]);
  assert.deepEqual(s1.liveRooms, ["twitch", "ytLandscape", "ytVertical"]);
  assert.equal((await get("streams/s1/private/draft")).state, "live", "the planner's draft mirrors the state");
  const ctl = await control("s1");
  assert.equal(ctl.window, null); assert.deepEqual(ctl.words, {});
  const ck = await get("streams/s1/private/checklist");
  assert.deepEqual(ck.beats.start.map((i) => i.text), ["Welcome chat by room", "Say the word and open check-in", "Platform only"], "backstage-only item left out");
  assert.ok(ck.beats.start.every((i) => i.done === false)); assert.equal(ck.beats.break1[0].note, "water");
  let box = await root(`${S}/notifyOutbox`);
  assert.equal(box.filter((o) => o.type === "stream-live").length, 1); assert.equal(box[0].audience, "members"); assert.equal(box[0].streamId, "s1"); assert.equal(box[0].payload.link, "/live");
  assert.ok((await root("activityLog")).some((e) => e.type === "stream-live" && e.feature === "live"));
  let logs = await root("adminLog");
  assert.ok(logs.some((e) => e.feature === "controlRoom" && e.action === "start" && e.actorUid === "adm2"));
  let pub = await get("public/live");
  assert.equal(pub.state, "live"); assert.equal(pub.streamId, "s1"); assert.equal(pub.beat, "start");
  assert.equal(yt.listCalls, 1, "Start looks for the live YouTube broadcasts");
  assert.equal((await control("s1")).yt.status, "waiting", "no broadcast is active yet: Waiting for YouTube");
  // Start twice, or a second stream: refused.
  assert.equal(await why(as("boss", "startStream", { streamId: "s1" })), "alreadyLive");
  assert.equal(await why(as("boss", "startStream", { streamId: "s2" })), "otherLive");
  assert.equal(await why(as("boss", "startStream", { streamId: "missing" })), "otherLive");
  assert.equal(await why(as("boss", "startStream", {})), "args");
  assert.equal((await root(`${S}/notifyOutbox`)).filter((o) => o.type === "stream-live").length, 1, "no second alert");

  // YouTube found: the landscape (the site's event) and the vertical (made by Streamlabs) are stored in private/watch.
  await wdb.doc(`${S}/streams/s1/private/watch`).set({ provider: "youtube", youtube: { landscapeId: "LAND123456", backstageId: null, verticalId: null, hash: "h" } });
  yt.active = ["LAND123456", "VERT123456"];
  const lk = await live.hooks.controls.helpers.linkYoutube("s1");
  assert.equal(lk.status, "ok");
  const watch = await get("streams/s1/private/watch");
  assert.equal(watch.youtube.landscapeId, "LAND123456"); assert.equal(watch.youtube.verticalId, "VERT123456"); assert.equal(watch.youtube.hash, "h", "the sync hash is kept");
  assert.equal((await control("s1")).yt.status, "ok");

  // ---------- beats ----------
  clock += 10 * MIN;
  assert.equal(await why(as("boss", "liveBeat", { action: "begin", beat: "break2" })), "outOfOrder");
  assert.equal(await why(as("boss", "liveBeat", { action: "begin", beat: "nope" })), "badBeat");
  assert.equal(await why(as("boss", "liveBeat", { action: "wat", beat: "break1" })), "args");
  await as("boss", "liveBeat", { action: "begin", beat: "break1" });
  s1 = await stream("s1");
  assert.equal(L.currentBeat(s1.beats), "break1"); assert.ok(s1.beats.start.endedAt, "the Start beat ended");
  assert.equal(s1.segments.find((g) => g.endedAt == null).kind, "break", "Break 1 opens a break segment");
  assert.equal(await why(as("boss", "liveBeat", { action: "begin", beat: "break1" })), "outOfOrder");
  await as("boss", "liveBeat", { action: "backToGame" });
  s1 = await stream("s1");
  assert.equal(s1.segments.find((g) => g.endedAt == null).gameId, "g1", "back to the game that was on");
  // skip Break 2, then "Begin End" from here
  await as("boss", "liveBeat", { action: "skip", beat: "break2" });
  assert.equal((await stream("s1")).beats.break2.skipped, true);
  assert.equal(await why(as("boss", "liveBeat", { action: "skip", beat: "break2" })), "outOfOrder");

  // ---------- switch game ----------
  clock += MIN;
  assert.equal(await why(as("boss", "switchGame", { game: { gameId: "nope" } })), "notInVault");
  assert.equal(await why(as("boss", "switchGame", { game: {} })), "game");
  assert.equal((await as("boss", "switchGame", { game: { gameId: "g2", title: "client lies" } })).game.title, "Lethal Company", "the title comes from the Vault");
  assert.equal(await why(as("boss", "switchGame", { game: { gameId: "g2" } })), "alreadyOn");
  assert.deepEqual((await stream("s1")).gameIds, ["g1", "g2"]);
  assert.equal(await why(as("boss", "switchGame", { next: true })), "noNextGame");

  // ---------- check-in window: the word lives only in private/control ----------
  assert.equal(await why(as("boss", "liveCheckInWindow", { action: "open", beat: "end" })), "beatNotBegun");
  assert.equal(await why(as("boss", "liveCheckInWindow", { action: "open", lengthMinutes: 7 })), "badLength");
  assert.equal(await why(as("boss", "liveCheckInWindow", { action: "extend" })), "noWindow");
  const o = await as("boss", "liveCheckInWindow", { action: "open", lengthMinutes: 3 });
  assert.equal(o.beat, "break1", "the current beat: Break 1 is still running");
  assert.ok(o.word && /^[a-z]+$/.test(o.word)); assert.equal(o.window.closesAt, clock + 3 * MIN);
  const c1 = await control("s1");
  assert.equal(c1.window.word, o.word); assert.equal(c1.words[o.beat], o.word);
  const WORD = o.word;
  pub = await get("public/live");
  assert.equal(pub.window.open, true); assert.equal(pub.window.beat, o.beat);
  assert.deepEqual(L.findSecrets(pub, { words: [WORD], videoIds: ["LAND123456", "VERT123456"] }), [], "public/live has no word and no video id");
  // the Deck's room coverage (Mod Machina phase 3 part 2): public/live carries deck { rooms } with handles and counts only, never a uid, and the deep scan would catch one
  assert.deepEqual(Object.keys(pub.deck.rooms), [], "no one is on duty: an empty deck");
  const deckPub = L.buildPublicLive({ stream: { id: "dk", state: "live", beats: {} }, deck: { rooms: { twitch: { lead: "mod_h", deckhands: 2, covered: true, uid: "UID-1" } } }, nowMs: 1 });
  assert.deepEqual(deckPub.deck, { rooms: { twitch: { lead: "mod_h", deckhands: 2, covered: true } } }, "the builder drops everything but handle, count and covered");
  assert.deepEqual(L.findSecrets(deckPub, {}), [], "a built deck is clean");
  assert.ok(L.findSecrets({ deck: { rooms: { twitch: { lead: "mod_h", uid: "UID-1" } } } }, {}).some((h) => /uid/.test(h)), "a uid anywhere in deck is flagged by the deep scan");
  assert.ok(L.findSecrets({ deck: { rooms: { twitch: { uids: ["UID-1"] } } } }, {}).some((h) => /uids/.test(h)));
  for (const [name, docs] of [["notifyOutbox", await root(`${S}/notifyOutbox`)], ["activityLog", await root("activityLog")], ["adminLog", await root("adminLog")]]) assert.ok(!clean(docs).includes(WORD), `${name} never holds the word`);
  assert.ok(!clean(await stream("s1")).includes(WORD), "the stream doc never holds the word");
  assert.ok(!clean(await get("streams/s1/private/checklist")).includes(`"${WORD}"`));
  assert.equal((await get(`live/main/wordLog/${L.normalise(WORD)}`)).word, WORD, "the word log keeps it server-side");
  assert.equal((await get(`streams/s1/presence/capt`)).beats[o.beat].crew, true, "seated crew are present when the window opens");
  assert.equal((await get(`streams/s1/presence/mod1`)).beats[o.beat].room, "twitch");
  assert.equal((await get("streams/s1/private/checklist")).beats.break1.find((i) => i.shortcut === "openCheckin").done, true, "a shortcut item ticks itself");
  assert.equal(await why(as("boss", "liveCheckInWindow", { action: "open" })), "windowOpen");
  const e = await as("boss", "liveCheckInWindow", { action: "extend" }); assert.equal(e.window.closesAt, clock + 4 * MIN);
  const cl = await as("boss", "liveCheckInWindow", { action: "close" }); assert.equal(cl.window.closedAt, clock);
  assert.equal(await why(as("boss", "liveCheckInWindow", { action: "extend" })), "windowClosed");
  assert.equal(await why(as("boss", "liveCheckInWindow", { action: "open" })), "alreadyOpened");
  clock += MIN;
  const ro = await as("boss", "liveCheckInWindow", { action: "reopen" });
  assert.equal(ro.word, WORD, "same word"); assert.equal(ro.window.reopened, true); assert.ok(ro.window.closesAt >= clock + 2 * MIN);
  await as("boss", "liveCheckInWindow", { action: "close" });
  assert.equal(await why(as("boss", "liveCheckInWindow", { action: "reopen" })), "reopenUsed");
  assert.equal((await get("public/live")).window.open, false);

  // ---------- scene ----------
  assert.equal(await why(as("boss", "liveScene", { scene: "disco" })), "scene");
  assert.equal(await why(as("boss", "liveScene", { scene: "brb", brbMinutes: 999 })), "brbMinutes");
  const sc = await as("boss", "liveScene", { scene: "brb", brbMinutes: 5 });
  assert.equal(sc.brbUntil, clock + 5 * MIN); assert.equal((await control("s1")).pinned, "brb");
  await as("boss", "liveScene", { scene: "auto" }); assert.equal((await control("s1")).pinned, null);

  // ---------- Begin End from here, then Stop ----------
  clock += 20 * MIN;
  await as("boss", "liveBeat", { action: "begin", beat: "end" });
  assert.equal(L.currentBeat((await stream("s1")).beats), "end");
  await wdb.doc(`${S}/streams/s1/counters/3`).set({ beats: { start: { twitch: 4 }, break1: { twitch: 3, ytVertical: 2 } } });
  await wdb.doc(`${S}/streams/s1/private/control`).update({ peak: 42 });
  clock += 5 * MIN;
  r = await as("adm2", "stopStream", {});
  assert.equal(r.state, "ended"); assert.equal(r.peak, 42); assert.equal(r.checkins, 9); assert.equal(r.durationMs, clock - s1.actualStart.toMillis());
  s1 = await stream("s1");
  assert.equal(s1.state, "ended"); assert.equal(s1.actualEnd.toMillis(), clock); assert.ok(s1.segments.every((g) => g.endedAt));
  assert.equal(s1.beats.break1.checkins, 5); assert.equal(s1.beats.start.checkins, 4); assert.equal(s1.stats.peak, 42);
  assert.deepEqual(s1.plannedGames.map((g) => g.outcome), ["played", "played"]);
  assert.ok((await root("activityLog")).some((x) => x.type === "stream-ended"));
  assert.equal((await get("public/live")).state, "ended");
  assert.equal(await why(as("boss", "stopStream", { streamId: "s1" })), "badState");
  assert.equal((await get("streams/s1/private/draft")).state, "ended");
  // Stop closes an open window (the grace still applies: validated in 3b)
  await mkStream("s3");
  await as("boss", "startStream", { streamId: "s3" });
  const ow = await as("boss", "liveCheckInWindow", { action: "open" });
  clock += MIN;
  await as("boss", "stopStream", {});
  const cw = (await control("s3")).window;
  assert.equal(cw.closedAt, clock, "Stop closed the open window"); assert.ok(ow.word);
  assert.equal(await why(as("boss", "liveCheckInWindow", { streamId: "s3", action: "open", beat: "start" })), "notLive");
  // Backstage start sends backstage-live to its audience
  const bs = await mkStream("sb", { type: "backstage", audience: "fanClub", title: "Backstage VOD", rooms: [], platforms: [] });
  await as("boss", "startStream", { streamId: "sb" });
  const bl = (await root(`${S}/notifyOutbox`)).find((x) => x.type === "backstage-live");
  assert.ok(bl && bl.audience === "fanClub" && bl.streamId === "sb", "backstage-live to the audience"); assert.equal(bl.payload.link, "/live");
  assert.equal((await get("public/live")).state, "backstage");
  assert.deepEqual((await stream("sb")).liveRooms, ["site"]);
  assert.deepEqual((await get("public/live")).liveRooms, ["site"], "a planned backstage stream is live in the site room only");
  assert.equal(await why(as("boss", "liveRoom", { streamId: "sb", room: "tiktok", on: true })), "backstage", "no TikTok switch on a backstage stream");
  assert.equal(await why(as("boss", "startStream", { streamId: "sb" })), "alreadyLive", "a second Start is refused");
  assert.ok(!(await get("streams/sb/private/checklist")).beats.start.some((i) => i.text === "Platform only"), "platform-only items skipped on backstage");
  assert.ok((await get("streams/sb/private/checklist")).beats.start.some((i) => i.text === "Backstage only"));
  await as("boss", "stopStream", {});
  assert.ok(bs);

  // ---------- after-show: stop the platform stream and start the linked backstage one ----------
  await mkStream("s4", { title: "Late Night" });
  await as("boss", "startStream", { streamId: "s4" });
  assert.equal(await why(as("boss", "liveAfterShow", { streamId: "sb" })), "notPlatform");
  clock += 30 * MIN; yt.created.length = 0;
  r = await as("adm2", "liveAfterShow", {});
  assert.equal(r.endedId, "s4"); assert.equal(r.type, "backstage");
  const old = await stream("s4"), next = await stream(r.streamId);
  assert.equal(old.state, "ended"); assert.equal(old.afterShowId, r.streamId);
  assert.equal(next.state, "live"); assert.equal(next.afterShowOf, "s4"); assert.equal(next.adhoc, true); assert.equal(next.audience, "fanClub"); assert.equal(next.type, "backstage");
  assert.deepEqual(next.liveRooms, ["site"]); assert.equal(L.currentBeat(next.beats), "start");
  const ab = (await root(`${S}/notifyOutbox`)).filter((x) => x.type === "backstage-live" && x.streamId === r.streamId);
  assert.equal(ab.length, 1); assert.equal(ab[0].audience, "fanClub"); assert.equal(ab[0].payload.afterShow, true);
  assert.ok((await root("activityLog")).some((x) => x.type === "after-show"));
  assert.equal(yt.created.length, 1); assert.equal(yt.created[0].id, r.streamId); assert.equal(yt.created[0].createNow, true, "the unlisted event is made at once");
  assert.equal((await get("public/live")).state, "backstage");
  assert.equal(await why(as("boss", "liveAfterShow", { streamId: "s4" })), "alreadyAfterShow");
  assert.equal(await why(as("boss", "liveAfterShow", {})), "notPlatform", "an after-show cannot have an after-show");
  await as("boss", "stopStream", {});

  // ---------- ad hoc: startStream refuses {adhoc}; createAdhocStream is the only way ----------
  yt.created.length = 0;
  const nStreams = (await col("streams")).length;
  assert.equal(await why(as("boss", "startStream", { adhoc: { title: "Pop-up", type: "platform" } })), "args");
  assert.equal(await why(as("boss", "startStream", { streamId: "s2", adhoc: { title: "Pop-up" } })), "args", "even with a streamId");
  assert.equal((await col("streams")).length, nStreams, "a refused startStream creates nothing"); assert.equal(yt.created.length, 0);
  r = await as("boss", "createAdhocStream", { adhoc: { title: "Backstage pop-up", type: "backstage" } });
  const adb0 = await stream(r.streamId); assert.equal(adb0.type, "backstage"); assert.equal(adb0.audience, "fanClub"); assert.deepEqual(adb0.rooms, []); assert.equal(adb0.state, "scheduled");
  await as("boss", "startStream", { streamId: r.streamId });
  assert.equal((await stream(r.streamId)).state, "live"); assert.equal(yt.created.length, 0, "Start makes no event: the trigger made it at creation");
  await as("boss", "stopStream", {});

  // ---------- createAdhocStream: step one of an unscheduled stream (scheduled, NOT live) ----------
  assert.equal(await why(as("boss", "createAdhocStream", { adhoc: { title: "", type: "platform" } })), "field");
  assert.equal(await why(as("boss", "createAdhocStream", { adhoc: { title: "Pop", durationMinutes: 5 } })), "durationMinutes");
  assert.equal(await why(as("boss", "createAdhocStream", { adhoc: { title: "Pop", rooms: ["nope"] } })), "rooms");
  assert.equal(await why(as("boss", "createAdhocStream", { adhoc: { title: "Pop", firstGame: { gameId: "zzz" } } })), "notInVault");
  const logsN = (await root("adminLog")).length, actN = (await root("activityLog")).length, boxN = (await root(`${S}/notifyOutbox`)).length;
  r = await as("adm2", "createAdhocStream", { adhoc: { title: "Pop-up two", type: "platform", rooms: ["twitch", "ytLandscape"], firstGame: { gameId: "g1" }, durationMinutes: 90 } });
  assert.equal(r.state, "scheduled");
  const cs = await stream(r.streamId);
  assert.equal(cs.state, "scheduled"); assert.equal(cs.adhoc, true); assert.equal(cs.published, true); assert.equal(cs.actualStart, undefined);
  assert.equal(cs.plannedStart.toMillis(), clock); assert.equal(cs.plannedEnd.toMillis(), clock + 90 * MIN); assert.match(cs.week, /^\d{4}-W\d{2}$/, "the week of now");
  assert.deepEqual(cs.platforms, ["twitch", "youtube"]); assert.equal(cs.plannedGames[0].gameId, "g1");
  assert.equal(await get(`streams/${r.streamId}/private/control`), undefined, "nothing live yet: no control, no checklist");
  assert.equal((await root(`${S}/notifyOutbox`)).length, boxN); assert.equal((await root("activityLog")).length, actN, "no activity until it is live");
  assert.ok((await root("adminLog")).slice(logsN).some((e) => e.action === "createAdhoc" && e.feature === "controlRoom" && e.actorUid === "adm2"));
  assert.equal((await ctx.liveStream()), null, "creating it does not make it live");
  assert.equal(require("../lib/youtube/logic").decide(null, cs, {}).action, "create", "decide(): a published scheduled adhoc stream gets its event at once");
  // the real youtubeSync trigger (fake Google) makes the event straight away; Start then works on it
  await wdb.doc(`${S}/private/youtubeChannel`).set({ accessToken: "AT", accessExpiresAt: clock + 3600000, refreshToken: "RT", channelId: "UC", channelTitle: "B" });
  const gl = []; let gEv = 0;
  const gfetch = async (url, init = {}) => { gl.push({ url, method: init.method || "GET", body: init.body }); if (url.includes("liveBroadcasts") && init.method === "POST") return { ok: true, status: 200, json: async () => ({ id: `EVADHOC${++gEv}` }) };
    if (url.includes("liveBroadcasts") && init.method === "PUT") return { ok: true, status: 200, json: async () => ({ id: JSON.parse(init.body).id }) };
    if (url.includes("liveBroadcasts") && init.method === "DELETE") return { ok: true, status: 204, json: async () => ({}) }; throw new Error("unexpected " + url); };
  const ytReal = require("../lib/youtube").build({ adminLogEntry, fetchFn: gfetch, clientId: "CID", clientSecret: "SEC", now: () => clock, projectId: "boomertanger-staging" });
  await ytReal.functions.youtubeSync.run({ params: { siteId: "boomertanger", streamId: r.streamId }, data: { before: { exists: false, data: () => undefined }, after: { exists: true, data: () => cs } } });
  const ev = JSON.parse(gl.find((c) => c.method === "POST").body);
  assert.ok(ev.snippet.title.startsWith("[STAGING] Pop-up two")); assert.equal(ev.status.privacyStatus, "private");
  assert.equal((await get(`streams/${r.streamId}/private/watch`)).youtube.landscapeId, "EVADHOC1", "the event is made before Start");
  const st2 = await as("boss", "startStream", { streamId: r.streamId });
  assert.equal(st2.state, "live"); assert.equal((await stream(r.streamId)).adhoc, true); assert.equal(L.currentBeat((await stream(r.streamId)).beats), "start");
  assert.equal((await stream(r.streamId)).segments[0].gameId, "g1"); assert.equal((await get(`streams/${r.streamId}/private/watch`)).youtube.landscapeId, "EVADHOC1");
  assert.ok((await root(`${S}/notifyOutbox`)).some((x) => x.type === "stream-live" && x.streamId === r.streamId));
  await as("boss", "stopStream", {});


  // ---------- delay and cancel of an unscheduled stream that is not live yet (the planner callables, no draft) ----------
  const planFns = require("../lib/planner").build({ adminLogEntry }).functions;
  const pas = (uid, fn, data = {}) => planFns[fn].run({ auth: uid ? { uid, token: {} } : undefined, data });
  const mkAd = async (title, o = {}) => (await as("boss", "createAdhocStream", { adhoc: { title, type: "platform", rooms: ["twitch", "ytLandscape"], ...o } })).streamId;
  const syncAd = async (id, before) => { const after = await stream(id); await ytReal.functions.youtubeSync.run({ params: { siteId: "boomertanger", streamId: id }, data: { before: before ? { exists: true, data: () => before } : { exists: false, data: () => undefined }, after: { exists: true, data: () => after } } }); return after; };
  const DAY = 24 * H;
  const A = await mkAd("Pop-up A"), B = await mkAd("Pop-up B");
  const a0 = await syncAd(A, null);                                   // the trigger: event at once
  const evA = (await get(`streams/${A}/private/watch`)).youtube.landscapeId; assert.ok(evA);
  // roles: signed out, member, mod, A1 refused; A2 and the owner pass
  for (const fn of ["delayStream", "cancelStream"]) {
    assert.equal(await why(pas(null, fn, { streamId: A, startMs: clock + 9 * DAY })), "signedOut");
    for (const uid of ["fan", "mod1", "capt", "adm1"]) assert.equal(await why(pas(uid, fn, { streamId: A, startMs: clock + 9 * DAY })), "notAllowed", `${fn}: ${uid}`);
  }
  assert.equal((await stream(A)).state, "scheduled", "refused calls changed nothing");
  // overlap: B moved onto A's time is refused, exactly as for planned streams
  assert.equal(await why(pas("adm2", "delayStream", { streamId: B, startMs: a0.plannedStart.toMillis() + 30 * MIN })), "overlap");
  assert.equal(await why(pas("adm2", "delayStream", { streamId: B })), "noStart");
  // delay: A2 moves A ten days out; the public doc and the YouTube event move, Boom Alerts and the feed hear about it
  const boxD = (await root(`${S}/notifyOutbox`)).length, actD = (await root("activityLog")).length;
  gl.length = 0;
  const newStart = clock + 10 * DAY;
  const dl = await pas("adm2", "delayStream", { streamId: A, startMs: newStart, reason: "Running late" });
  assert.equal(dl.plannedStart, newStart); assert.equal(dl.delayCount, 1);
  const a1 = await stream(A);
  assert.equal(a1.plannedStart.toMillis(), newStart); assert.equal(a1.plannedEnd.toMillis(), newStart + 3 * H); assert.equal(a1.delay.count, 1); assert.equal(a1.delay.originalStart.toMillis(), a0.plannedStart.toMillis());
  assert.equal(a1.delay.reason, "Running late"); assert.equal(a1.delay.by, "@adm2"); assert.ok(a1.delay.at); assert.equal(a1.state, "scheduled"); assert.equal(a1.adhoc, true);
  assert.match(a1.week, /^\d{4}-W\d{2}$/); assert.equal(await get(`streams/${A}/private/draft`), undefined, "still no planner draft");
  const boxes = await root(`${S}/notifyOutbox`);
  assert.equal(boxes.length, boxD + 1); assert.equal(boxes[boxes.length - 1].type, "stream-delayed"); assert.equal(boxes[boxes.length - 1].audience, "members");
  assert.equal((await root("activityLog")).length, actD + 1);
  assert.ok((await root("adminLog")).some((e) => e.action === "delay" && e.actorUid === "adm2" && e.details && e.details.adhoc));
  await syncAd(A, a0);                                                // the real youtubeSync: the event moves
  assert.equal(gl.filter((c) => c.method === "PUT").length, 1); assert.equal(JSON.parse(gl.find((c) => c.method === "PUT").body).snippet.scheduledStartTime, new Date(newStart).toISOString());
  assert.equal((await get(`streams/${A}/private/watch`)).youtube.landscapeId, evA, "same event, moved");
  // cancel: the owner cancels; the stream stays as a record, the event is deleted and the watch ids are cleared
  const boxC = (await root(`${S}/notifyOutbox`)).length; gl.length = 0;
  assert.deepEqual(await pas("boss", "cancelStream", { streamId: A, reason: "Not tonight" }), { ok: true, streamId: A, state: "cancelled" });
  const a2 = await stream(A);
  assert.equal(a2.state, "cancelled"); assert.equal(a2.cancel.reason, "Not tonight"); assert.equal(a2.cancel.by, "@boss"); assert.ok(a2.cancel.at); assert.equal(a2.title, "Pop-up A", "kept as a record");
  const boxes2 = await root(`${S}/notifyOutbox`); assert.equal(boxes2.length, boxC + 1); assert.equal(boxes2[boxes2.length - 1].type, "stream-cancelled");
  assert.ok((await root("activityLog")).some((e) => e.type === "stream-cancelled" && e.streamId === A));
  assert.ok((await root("adminLog")).some((e) => e.action === "cancel" && e.actorUid === "boss" && e.details && e.details.adhoc));
  await syncAd(A, a1);
  assert.equal(gl.filter((c) => c.method === "DELETE").length, 1, "the YouTube event is deleted");
  const wA = await get(`streams/${A}/private/watch`); assert.equal(wA.youtube.landscapeId, null); assert.equal(wA.youtube.hash, null);
  assert.equal(await why(pas("boss", "cancelStream", { streamId: A })), "badState", "cancelled is final");
  assert.equal(await why(pas("boss", "delayStream", { streamId: A, startMs: clock + 12 * DAY })), "badState");
  assert.equal(await why(as("boss", "startStream", { streamId: A })), "badState", "a cancelled stream cannot start");
  // a live (started) adhoc stream is refused: the Control Room owns it
  await as("boss", "startStream", { streamId: B });
  assert.equal(await why(pas("boss", "delayStream", { streamId: B, startMs: clock + 15 * DAY })), "badState");
  assert.equal(await why(pas("boss", "cancelStream", { streamId: B })), "badState");
  await as("boss", "stopStream", {});
  assert.equal(await why(pas("boss", "cancelStream", { streamId: B })), "badState");
  // planned streams WITH a draft keep the draft path: an adhoc-flagged stream that has a draft is not treated as unscheduled
  await mkStream("pd2", { adhoc: true });
  assert.equal(await why(pas("boss", "delayStream", { streamId: "pd2", startMs: clock + 13 * DAY })), "args", "the draft path (needs its week) ran, not the adhoc one");
  assert.equal((await stream("pd2")).delay, undefined);
  assert.equal(await why(pas("boss", "cancelStream", { streamId: "ghost" })), "noStream");

  // ---------- checklist ticks (owner only) ----------
  await mkStream("s5"); await as("boss", "startStream", { streamId: "s5" });
  const items = (await get("streams/s5/private/checklist")).beats.start;
  assert.equal(await why(as("adm2", "liveChecklist", { action: "tick", beat: "start", itemId: items[0].id })), "notOwner", "A2 cannot tick");
  assert.equal(await why(as("boss", "liveChecklist", { action: "tick", beat: "start", itemId: "nope" })), "noItem");
  assert.equal((await as("boss", "liveChecklist", { action: "tick", beat: "start", itemId: items[0].id })).done, true);
  assert.equal((await get("streams/s5/private/checklist")).beats.start[0].done, true);
  await as("boss", "liveChecklist", { action: "tick", beat: "start", itemId: items[0].id, done: false });
  assert.equal((await get("streams/s5/private/checklist")).beats.start[0].done, false);
  // Editing the live copy never touches the templates; saving templates never touches a started stream's copy.
  await as("boss", "liveChecklist", { action: "saveTemplates", templates: { beats: { start: [{ text: "New first" }], break1: [], break2: [], end: [] } } });
  assert.equal((await get("streams/s5/private/checklist")).beats.start.length, 3);
  await as("boss", "stopStream", {});

  // ---------- keys: owner only, only hashes stored, shown once ----------
  const kObs = await as("boss", "liveObsKey", {}), kDeck = await as("boss", "liveDeckKey", {});
  assert.ok(/^[0-9a-f]{64}$/.test(kObs.key) && /^[0-9a-f]{64}$/.test(kDeck.key) && kObs.key !== kDeck.key);
  const main = await get("live/main");
  assert.equal(main.obsKeyHash, L.hashKey(kObs.key)); assert.equal(main.deckKeyHash, L.hashKey(kDeck.key));
  assert.ok(!clean(main).includes(kObs.key) && !clean(main).includes(kDeck.key), "no key in live/main");
  for (const [name, docs] of [["adminLog", await root("adminLog")], ["activityLog", await root("activityLog")]]) assert.ok(!clean(docs).includes(kObs.key) && !clean(docs).includes(kDeck.key) && !clean(docs).includes(main.obsKeyHash), `${name}: no key or hash`);
  const kObs2 = await as("boss", "liveObsKey", {});
  assert.notEqual(kObs2.key, kObs.key); assert.equal(L.verifyKey(kObs.key, (await get("live/main")).obsKeyHash), false, "rotating kills the old key");
  assert.equal(L.verifyKey(kObs2.key, (await get("live/main")).obsKeyHash), true);
  assert.equal((await as("boss", "liveObsKey", { revoke: true })).revoked, true); assert.equal((await get("live/main")).obsKeyHash, null);
  await as("boss", "liveObsKey", {});
  // settings
  assert.equal(await why(as("boss", "liveSettings", { look: "neon" })), "look");
  assert.equal(await why(as("boss", "liveSettings", {})), "args");
  assert.deepEqual((await as("boss", "liveSettings", { look: "crt", windowDefaultMinutes: 3 })).saved, ["look", "windowDefaultMinutes"]);
  assert.equal((await get("live/main")).look, "crt"); assert.equal((await get("public/live")).look, "crt");
  await as("boss", "liveSettings", { look: "hull" });
  // the backstage privacy setting: a number of days, or false for off; nonsense is refused; only the owner
  assert.deepEqual((await as("boss", "liveSettings", { makeBackstagePrivateAfterDays: 3 })).saved, ["makeBackstagePrivateAfterDays"]); assert.equal((await get("live/main")).makeBackstagePrivateAfterDays, 3);
  await as("boss", "liveSettings", { makeBackstagePrivateAfterDays: false }); assert.equal((await get("live/main")).makeBackstagePrivateAfterDays, false, "off is saved as false");
  assert.equal(await why(as("boss", "liveSettings", { makeBackstagePrivateAfterDays: "soon" })), "days");
  assert.equal(await why(as("boss", "liveSettings", { makeBackstagePrivateAfterDays: -2 })), "days");
  await as("boss", "liveSettings", { makeBackstagePrivateAfterDays: 7 });

  // ================================================================ 3b: check-ins and presence
  assert.equal(await why(as(null, "streamCheckIn", { word: "x", room: "twitch" })), "signedOut");
  assert.equal(await why(as("nobody", "streamCheckIn", { word: "x", room: "twitch" })), "needsSignup", "a signed-in visitor without a profile");
  assert.equal(await why(as("boss", "streamCheckIn", { word: "x", room: "twitch" })), "ownerHosts");
  assert.equal(await why(as("fan", "streamCheckIn", { word: "x", room: "twitch" })), "noWindow", "nothing is live");
  for (const uid of [null, "fan", "nobody"]) assert.equal(await why(as(uid, "liveUnlock", { uid: "fan", beat: "start" })), uid ? "notCrew" : "signedOut", `liveUnlock: ${uid}`);
  for (const n of ["fan3", "fan4", "late", "latest", "capped", "cap2"]) await person(n, []);
  await wdb.doc(`${S}/live/main`).set({ look: "hull" }, { merge: true });
  const xpOf = async (uid) => (await get(`profiles/${uid}`)).xp;

  await mkStream("c1", { title: "Check-in night" });
  await as("boss", "startStream", { streamId: "c1" });
  assert.equal(await why(as("fan", "streamCheckIn", { word: "x", room: "twitch" })), "noWindow", "live but no window yet");
  clock += MIN;
  const w1 = await as("boss", "liveCheckInWindow", { action: "open", lengthMinutes: 5 });
  const W1 = w1.word;
  const ci = (uid, word, room) => as(uid, "streamCheckIn", { word, room });
  // wrong words count tries; a wrong room or an empty answer costs nothing
  assert.equal(await why(ci("fan", "", "twitch")), "empty");
  assert.equal(await why(ci("fan", W1, "bogus")), "badRoom");
  assert.equal(await why(ci("fan", W1, "site")), "badRoom", "On the site is only for backstage");
  let err = await ci("fan", "wrongo", "twitch").catch((e) => e);
  assert.equal(err.details.reason, "wrongWord"); assert.equal(err.details.triesLeft, 4);
  assert.equal((await get("streams/c1/presence/fan")).wrongTries.start, 1);
  for (let i = 0; i < 3; i++) await ci("fan", "wrongo", "twitch").catch(() => {});
  err = await ci("fan", "wrongo", "twitch").catch((e) => e);
  assert.equal(err.details.reason, "wrongWord"); assert.equal(err.details.locked, true);
  assert.equal(await why(ci("fan", W1, "twitch")), "lockedOut", "locked even with the right word");
  // the crew unlock (crew on duty), never a member or a visitor
  assert.equal(await why(as("fan2", "liveUnlock", { uid: "fan", beat: "start" })), "notCrew");
  assert.equal(await why(as("capt", "liveUnlock", { uid: "fan", beat: "nope" })), "badBeat");
  assert.equal(await why(as("capt", "liveUnlock", { uid: "ghost", beat: "start" })), "noPresence");
  assert.equal((await as("capt", "liveUnlock", { uid: "fan", beat: "start" })).ok, true);
  assert.equal((await get("streams/c1/presence/fan")).wrongTries.start, 0);
  assert.ok((await root("adminLog")).some((e) => e.action === "unlock" && e.actorUid === "capt" && e.feature === "controlRoom"));
  // success: the stamp, +10 XP, the counter, first-in, the alias converted at the edge
  nsEvents.length = 0;
  const ok1 = await ci("fan", " " + W1.toUpperCase() + "! ", "ytv");
  assert.equal(ok1.ok, true); assert.equal(ok1.room, "ytVertical", "the alias ytv is stored as ytVertical"); assert.equal(ok1.xp, 10); assert.equal(ok1.firstIn, 1); assert.equal(ok1.beat, "start");
  const pf = await get("streams/c1/presence/fan");
  assert.equal(pf.beats.start.room, "ytVertical"); assert.equal(pf.xpEarned, 10); assert.ok(pf.expireAt.toMillis() > clock + 390 * 86400000, "13 months");
  assert.equal(await xpOf("fan"), 10);
  assert.equal((await get("rewardLedger/live:c1:start:fan:checkin:fan")).amount, 10, "the ledger key is the section 12 key under live:");
  assert.deepEqual(nsEvents.map((e) => [e.type, e.params.action, e.ref]), [["stream", "checkin", "c1:start:fan:checkin"], ["stream", "first-in", "c1:start:fan:first-in"]]);
  // a second device: friendly already, nothing paid twice, counter unchanged
  nsEvents.length = 0;
  assert.deepEqual(await ci("fan", W1, "twitch"), { ok: true, already: true, beat: "start" });
  assert.equal(await xpOf("fan"), 10); assert.equal(nsEvents.length, 0);
  const sumNow = async (id) => L.sumShards(await col(`streams/${id}/counters`));
  assert.deepEqual((await sumNow("c1")).byRoom, { ytVertical: 1 });
  assert.ok((await col("streams/c1/counters")).every((c) => /^[0-9]$/.test(c.id)), "counter shards are 0 to 9");
  // three people are first in; the fourth is not named
  for (const [u, room] of [["fan2", "twitch"], ["fan3", "ytv"], ["fan4", "youtube"]]) await ci(u, W1, room);
  assert.deepEqual((await control("c1")).firstIn.start.map((x) => x.handle), ["fan", "fan2", "fan3"]);
  assert.equal((await get("streams/c1/presence/fan4")).beats.start.room, "ytLandscape", "youtube is stored as ytLandscape");
  assert.equal(nsEvents.filter((e) => e.params.action === "first-in").length, 2, "fan2 and fan3 are second and third in; fan4 is not named");
  assert.deepEqual((await sumNow("c1")).byRoom, { ytVertical: 2, twitch: 1, ytLandscape: 1 });
  assert.equal((await sumNow("c1")).total, 4, "counted once each");
  // crew: the Captain (seated) is present with no XP, no word, and is not counted in the room counters
  const cap = await ci("capt", "", "twitch");
  assert.equal(cap.crew, true); assert.equal(cap.xp, 0);
  assert.equal(await xpOf("capt"), 0); assert.equal((await sumNow("c1")).total, 4); assert.equal((await get("streams/c1/presence/capt")).crew, true);
  // an admin who is not seated checks in with the word: recorded, but "no prizes"
  const adm = await ci("adm2", W1, "twitch");
  assert.equal(adm.ok, true); assert.equal(adm.xp, 0); assert.equal((await get("streams/c1/presence/adm2")).noPrize, true);
  assert.ok(!(await control("c1")).firstIn.start.some((x) => x.handle === "adm2"), "crew never take a first-in");
  // the window: grace after close still counts, then it is closed
  await as("boss", "liveCheckInWindow", { action: "close" });
  clock += 20 * 1000;
  assert.equal((await ci("late", W1, "twitch")).ok, true, "20 seconds after Close now is inside the 30 second grace");
  clock += 15 * 1000;
  assert.equal(await why(ci("latest", W1, "twitch")), "windowClosed", "past close + grace");

  // all-beats and the 100 XP cap, through the callable path
  await wdb.doc(`${S}/live/main`).set({ xpCheckin: 60 }, { merge: true });
  clock += MIN;
  await as("boss", "liveBeat", { action: "begin", beat: "break1" });
  const w2 = await as("boss", "liveCheckInWindow", { action: "open" });
  assert.notEqual(w2.word, W1);
  assert.equal((await ci("capped", w2.word, "twitch")).xp, 60);
  assert.equal((await ci("fan", w2.word, "ytVertical")).xp, 60, "fan had 10: 10 + 60 stays under the cap");
  await wdb.doc(`${S}/streams/c1/presence/cap2`).set({ uid: "cap2", beats: { start: { room: "twitch", at: TS(clock) } }, xpEarned: 60 });
  const b2c = await ci("cap2", w2.word, "twitch");
  assert.equal(b2c.xp, 40); assert.equal(b2c.capped, true, "60 + 60 would be 120: only 40 is paid");
  assert.equal(await xpOf("cap2"), 40); assert.equal((await get("streams/c1/presence/cap2")).xpEarned, 100);
  await as("boss", "liveCheckInWindow", { action: "close" });
  clock += MIN;
  await as("boss", "liveBeat", { action: "skip", beat: "break2" });
  await as("boss", "liveBeat", { action: "begin", beat: "end" });          // End has no window: not held
  nsEvents.length = 0;
  await as("boss", "stopStream", {});
  const bonus = nsEvents.filter((e) => e.params.action === "all-beats");
  assert.deepEqual(bonus.map((e) => e.uid).sort(), ["cap2", "fan"], "held beats: Start and Break 1; only members who checked in to both");
  assert.ok(bonus.every((e) => /^c1:[a-z0-9]+:all-beats$/.test(e.ref) || e.ref.includes(":all-beats")));
  assert.equal(await xpOf("fan"), 10 + 60 + 15, "the all-beats bonus (15) was paid through the ledger");
  assert.equal(await xpOf("cap2"), 40, "cap2 is at the 100 XP cap: the bonus pays 0");
  assert.equal(await get("rewardLedger/live:c1:cap2:all-beats:cap2"), undefined, "nothing paid, nothing recorded");
  const present = nsEvents.filter((e) => e.params.action === "present").map((e) => e.uid).sort();
  for (const u of ["fan", "capt", "cap2", "adm2", "fan2"]) assert.ok(present.includes(u), `present: ${u}`);
  assert.ok(!bonus.some((e) => ["capt", "adm2", "capped"].includes(e.uid)), "crew and no-prize check-ins get no all-beats bonus");
  nsEvents.length = 0;
  await live.hooks.checkin.helpers.settle("c1");               // a second settle pays nothing new
  assert.equal(await xpOf("fan"), 85);
  assert.equal(await why(as("fan", "streamCheckIn", { word: W1, room: "twitch" })), "noWindow", "after Stop nothing is live");

  // backstage: the room is On the site
  await mkStream("c2", { type: "backstage", audience: "fanClub", title: "Backstage", rooms: [], platforms: [] });
  await as("boss", "startStream", { streamId: "c2" });
  const w3 = await as("boss", "liveCheckInWindow", { action: "open" });
  assert.equal((await ci("fan", w3.word, "twitch").catch((e) => e)).details.reason, "badRoom", "a platform room on a backstage stream");
  assert.equal((await ci("fan", w3.word, undefined)).room, "site", "backstage defaults to On the site");
  await as("boss", "stopStream", {});

  // ================================================================ 3c: feeds and ticks
  const FEEDS = live.hooks.feeds.helpers;
  const mkRes = () => { const r = { headers: {}, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, send(b) { r.body = b; return r; }, set(k, v) { r.headers[k] = v; return r; } }; return r; };
  const hit = async (handler, { method = "GET", query = {}, headers = {}, body } = {}) => { const res = mkRes(); await handler({ method, query, headers, body }, res); return res; };
  const flushState = () => get("rateLimits/live_flush");
  const setFlush = (st) => wdb.doc(`${S}/rateLimits/live_flush`).set(st);

  clock += 3 * H;                                              // every earlier stream ended more than 2 hours ago
  // ---------- liveTick with nothing live: nothing happens ----------
  net.length = 0; const ytBefore = yt.listCalls;
  await wdb.doc(`${S}/public/live`).delete();
  assert.deepEqual(await FEEDS.runTick(), { idle: true });
  assert.equal(net.length, 0, "no fetch at all when nothing is live"); assert.equal(yt.listCalls, ytBefore); assert.equal(yt.videosCalls, 0);
  assert.equal(await get("public/live"), undefined, "an idle tick writes nothing");
  await wdb.doc(`${S}/public/live`).set({ state: "ended", actualEnd: clock - 3 * H, updatedAt: clock - 3 * H });
  await FEEDS.runTick();
  assert.equal(net.length, 0); assert.equal((await get("public/live")).state, "off", "a finished stream's 2 hours are up: /live goes back off air");

  // ---------- the flush debounce (at most one flush per 3 s) ----------
  await setFlush({ lastFlushMs: null, scheduledAtMs: null });
  tasks.length = 0;
  clock += 10 * MIN;
  let d = await FEEDS.requestFlush();
  assert.equal(d.action, "flush"); assert.equal((await flushState()).lastFlushMs, clock); assert.equal(tasks.length, 0);
  clock += 1000;
  d = await FEEDS.requestFlush();
  assert.equal(d.action, "schedule"); assert.equal(tasks.length, 1);
  assert.equal(tasks[0].opts.scheduleDelaySeconds, 2); assert.match(tasks[0].opts.id, /^flush-\d+$/); assert.equal(tasks[0].data.atMs, clock + 2000);
  assert.equal((await flushState()).scheduledAtMs, clock + 2000);
  clock += 500;
  d = await FEEDS.requestFlush();
  assert.equal(d.action, "wait"); assert.equal(tasks.length, 1, "a third writer inside the window queues nothing");
  clock += 1500;                                              // the task fires at lastFlush + 3 s
  assert.deepEqual(await FEEDS.runFlushTask(), { flushed: true });
  { const pf = await get("public/live"); assert.ok(Array.isArray(pf.firstIn) && pf.firstIn.length <= 3, "public/live carries the first three handles"); assert.ok(pf.firstIn.every((h) => typeof h === "string"), "handles only"); assert.ok(Array.isArray(pf.crew.grades), "public/live carries crew grades"); assert.equal(JSON.stringify(pf).includes("uid"), false, "no uid key or value in public/live"); }
  assert.equal((await flushState()).scheduledAtMs, null); assert.equal((await flushState()).lastFlushMs, clock);
  clock += 1000;
  assert.equal((await FEEDS.runFlushTask()).flushed, false, "a task running inside the 3 s gap does not flush, it queues once more");
  assert.equal(tasks.length, 2);
  // two flushes in a row are never closer than the gap
  const stamps = [];
  await setFlush({ lastFlushMs: null, scheduledAtMs: null });
  for (let i = 0; i < 8; i++) { clock += 700; const r = await FEEDS.requestFlush(); if (r.action === "flush") stamps.push(clock); }
  assert.ok(stamps.every((t, i) => i === 0 || t - stamps[i - 1] >= 3000), "flushes are at least 3 s apart");
  // Cloud Tasks off (the API is disabled until the owner enables it): the trigger flushes inline and says so
  await setFlush({ lastFlushMs: clock - 500, scheduledAtMs: null });
  taskFail = new Error("7 PERMISSION_DENIED: Cloud Tasks API has not been used in project before or it is disabled.");
  d = await FEEDS.requestFlush();
  assert.equal(d.fallback, true); assert.equal((await flushState()).lastFlushMs, clock);
  taskFail = new Error("6 ALREADY_EXISTS: task exists"); await setFlush({ lastFlushMs: clock - 500, scheduledAtMs: null });
  assert.equal((await FEEDS.requestFlush()).action, "schedule", "a duplicate task id is fine");
  taskFail = null;
  // the trigger on a counter write queues the flush; another site's writes are ignored
  await setFlush({ lastFlushMs: clock, scheduledAtMs: null }); tasks.length = 0; clock += 1000;
  await fns.onCheckInWritten.run({ params: { siteId: "other", streamId: "x", shard: "0" }, data: {} });
  assert.equal(tasks.length, 0);
  await fns.onCheckInWritten.run({ params: { siteId: "boomertanger", streamId: "x", shard: "0" }, data: {} });
  assert.equal(tasks.length, 1, "onCheckInWritten queued one debounced flush");
  assert.ok(fns.liveFlush.run, "liveFlush is a task queue function");
  assert.deepEqual(FEEDS.FLUSH_QUEUE.rateLimits, { maxDispatchesPerSecond: 1, maxConcurrentDispatches: 1 });
  assert.ok(FEEDS.FLUSH_QUEUE.retryConfig.maxAttempts >= 2);

  // ---------- a live stream for the feeds ----------
  await person("tikt", ["mod"], { track: "mod", grade: 2 }); await person("subby", ["sub"]); await person("visitor0", []);
  await wdb.doc(`${S}/profiles/visitor0`).delete();
  await mkStream("f1", { title: "Feed night" });
  await as("boss", "startStream", { streamId: "f1" });
  await wdb.doc(`${S}/streams/f1/private/watch`).set({ provider: "youtube", youtube: { landscapeId: "LANDSCAPE11", backstageId: null, verticalId: "VERTICAL111" } });
  yt.active = ["LANDSCAPE11", "VERTICAL111"]; yt.videos = { LANDSCAPE11: "31", VERTICAL111: "7" };
  tw.live = true; tw.viewers = 120;
  const w5 = await as("boss", "liveCheckInWindow", { action: "open", lengthMinutes: 10 });
  const FW = w5.word;
  await ci("fan", FW, "twitch"); await ci("fan2", FW, "ytv");

  // liveViewerEntry: crew on duty (a mod or an admin), whole numbers only
  assert.equal(await why(as(null, "liveViewerEntry", { viewers: 5 })), "signedOut");
  for (const uid of ["fan", "subby", "nobody"]) assert.equal(await why(as(uid, "liveViewerEntry", { viewers: 5 })), "notCrew");
  assert.equal(await why(as("tikt", "liveViewerEntry", { viewers: -1 })), "viewers");
  assert.equal(await why(as("tikt", "liveViewerEntry", { viewers: 1.5 })), "viewers");
  assert.equal((await as("tikt", "liveViewerEntry", { viewers: 15 })).viewers, 15);
  assert.equal((await control("f1")).tiktok.viewers, 15);

  // ---------- liveTick while live: Twitch, YouTube, TikTok, peak ----------
  net.length = 0; yt.videosCalls = 0; clock += MIN;
  let t = await FEEDS.runTick();
  assert.equal(t.total, 120 + 31 + 7 + 15); assert.equal(t.peak, 173);
  const tokenCall = net.find((c) => c.url.startsWith("https://id.twitch.tv/oauth2/token"));
  assert.equal(new URLSearchParams(tokenCall.body).get("grant_type"), "client_credentials");
  const scall = net.find((c) => c.url.startsWith("https://api.twitch.tv/helix/streams"));
  assert.ok(scall.url.includes("user_id=B1")); assert.equal(scall.headers.Authorization, "Bearer TWTOKEN"); assert.equal(scall.headers["Client-Id"], "CID");
  assert.equal(yt.videosCalls, 1, "one videos.list call for both ids");
  let ctl2 = await control("f1");
  assert.deepEqual(ctl2.viewers, { twitch: 120, ytLandscape: 31, ytVertical: 7, tiktok: 15 }); assert.equal(ctl2.peak, 173); assert.equal(ctl2.twitch.status, "live");
  pub = await get("public/live");
  assert.equal(pub.viewers.total, 173); assert.deepEqual(pub.viewers.byPlatform, { twitch: 120, ytLandscape: 31, ytVertical: 7, tiktok: 15 }); assert.equal(pub.peak, 173);
  assert.equal(pub.counts.total, 2, "the counters are in public/live");
  assert.deepEqual(L.findSecrets(pub, { words: [FW], videoIds: ["LANDSCAPE11", "VERTICAL111"] }), []);
  assert.equal((await get("growthConfig".replace("growthConfig", "private/growthConfig"))).twitchBroadcasterId, "B1", "the broadcaster id is looked up once and kept");
  // peak only goes up; offline is noticed; one platform failing does not stop the others
  tw.viewers = 40; tw.live = false; yt.videosFail = true; clock += MIN;
  t = await FEEDS.runTick();
  assert.deepEqual(t.errors, ["youtube"]); assert.equal(t.peak, 173, "the peak stays");
  ctl2 = await control("f1");
  assert.equal(ctl2.twitch.status, "offline"); const since = ctl2.twitch.offlineSince; assert.equal(since, clock);
  clock += MIN; await FEEDS.runTick(); assert.equal((await control("f1")).twitch.offlineSince, since, "offline since the first minute it was seen");
  yt.videosFail = false; tw.live = true;
  // TikTok count goes stale after 15 minutes
  clock += 16 * MIN; await FEEDS.runTick(); assert.equal((await control("f1")).viewers.tiktok, undefined);
  // the Twitch app token is reused, not fetched every minute
  net.length = 0; clock += MIN; await FEEDS.runTick();
  assert.equal(net.filter((c) => c.url.startsWith("https://id.twitch.tv")).length, 0, "the app token is cached");

  // "Waiting for YouTube…": retries every 15 s inside the minute until the broadcast is found
  await wdb.doc(`${S}/streams/f1/private/control`).update({ yt: { status: "waiting", since: clock, tries: 1 } });
  yt.active = ["LANDSCAPE11"]; sleeps.length = 0; const lc = yt.listCalls;
  await FEEDS.runTick();
  assert.deepEqual(sleeps, [15000, 15000, 15000], "three 15 s waits, each followed by a look");
  assert.equal(yt.listCalls - lc, 3); assert.equal((await control("f1")).yt.status, "waiting");
  sleeps.length = 0; yt.active = ["LANDSCAPE11", "VERTICAL111"];
  await wdb.doc(`${S}/streams/f1/private/control`).update({ yt: { status: "waiting", since: clock, tries: 1 } });
  await FEEDS.runTick();
  assert.deepEqual(sleeps, [15000], "found on the first retry: no more waiting"); assert.equal((await control("f1")).yt.status, "ok");

  // ---------- obsFeed ----------
  const obsKey = (await as("boss", "liveObsKey", {})).key;
  await as("boss", "liveCheckInWindow", { action: "reopen" });          // the 10 minute window ran out while the ticks above moved the clock: reopen it (once)
  const obs = (extra) => hit(FEEDS.handleObsFeed, extra);
  let r1 = await obs({ query: {} }); assert.equal(r1.code, 403);
  r1 = await obs({ query: { k: "0".repeat(64) } }); assert.equal(r1.code, 403); assert.deepEqual(r1.body, { ok: false, reason: "key" });
  assert.ok(!JSON.stringify(r1.body).includes(FW));
  assert.equal((await obs({ method: "POST", query: { k: obsKey } })).code, 405);
  const pre = await obs({ method: "OPTIONS" }); assert.equal(pre.code, 204); assert.equal(pre.headers["Access-Control-Allow-Origin"], "*");
  // seed what the stream view may show beyond public/live: a Vault cover (g1; g2 is hidden) and the next PUBLISHED stream (an earlier unpublished one is skipped)
  await wdb.doc(`${S}/vaultGames/g1`).set({ title: "Cult of the Lamb", cover: { source: "igdb", igdbImageId: "co2abc", byHandle: "someone" }, hidden: false, secretNote: "SECRETNOTE" });
  await wdb.doc(`${S}/vaultGames/g2`).set({ title: "Lethal Company", cover: { source: "steam", steamAppId: "1966720" }, hidden: true });
  await mkStream("n0", { title: "Hidden draft", published: false, plannedStart: TS(clock + 5 * MIN), plannedEnd: TS(clock + H) });
  await mkStream("n1", { title: "Next night", plannedStart: TS(clock + 20 * H), plannedEnd: TS(clock + 23 * H) });
  const good = await obs({ query: { k: obsKey } });
  assert.equal(good.code, 200); assert.equal(good.body.ok, true);
  const good2 = await obs({ query: { k: obsKey } });
  assert.deepEqual(good2.body.view.gameCovers, ["https://images.igdb.com/igdb/image/upload/t_cover_big/co2abc.jpg", null], "public cover URLs only; a hidden game gives null");
  assert.equal(good2.body.view.nextStream.title !== "Hidden draft", true, "an unpublished stream is never the next stream");
  assert.equal(typeof good2.body.view.nextStream.start, "number"); assert.deepEqual(Object.keys(good2.body.view.nextStream).sort(), ["start", "title"]);
  const v = good2.body.view;
  assert.equal(v.word, FW, "a valid key gets the check-in word while the window is open");
  assert.equal(v.scene, "break"); assert.equal(v.title, "Feed night"); assert.equal(v.beat, "start"); assert.equal(v.counts.total, 2);
  assert.deepEqual(v.firstIn, ["fan", "fan2"]); assert.equal(v.viewers.total, 40 + 31 + 7, "the latest tick: Twitch 40, YouTube 31 and 7, the stale TikTok count dropped");
  const viaHeader = await obs({ headers: { "x-live-key": obsKey } }); assert.equal(viaHeader.code, 200);
  // never any other private data: no uids, no hashes, no video ids, no tokens, no other window fields
  const viewJson = JSON.stringify(good2.body);
  for (const secret of ["SECRETNOTE", "someone", "co2abc.jpg?", "LANDSCAPE11", "VERTICAL111", L.hashKey(obsKey), (await get("live/main")).deckKeyHash, "TWTOKEN", "RT1", "AT1", "xpEarned", "wrongTries", "presence"]) assert.ok(!viewJson.includes(secret), `obsFeed leaks ${secret}`);
  assert.deepEqual(L.findSecrets({ ...v, word: undefined }, { videoIds: ["LANDSCAPE11", "VERTICAL111"] }).filter((h) => !/\.word/.test(h)), [], "no forbidden key anywhere but the word");
  for (const uid of ["fan", "fan2", "boss", "capt", "mod1"]) assert.ok(!viewJson.includes(`"${uid}"`) || ["fan", "fan2", "capt", "mod1"].includes(uid), "handles only");
  await as("boss", "liveCheckInWindow", { action: "close" });
  assert.equal((await obs({ query: { k: obsKey } })).body.view.word, null, "no word once the window is closed");
  await as("boss", "liveScene", { scene: "brb", brbMinutes: 5 });
  const brb = (await obs({ query: { k: obsKey } })).body.view; assert.equal(brb.scene, "brb"); assert.equal(brb.brbUntil, clock + 5 * MIN);
  await as("boss", "liveScene", { scene: "break-side" });
  assert.equal((await control("f1")).pinned, "break-side", "the Break side rail can be pinned");
  assert.equal((await obs({ query: { k: obsKey } })).body.view.scene, "break-side");
  await as("boss", "liveScene", { scene: "auto" });
  // the old key dies when rotated
  const obsKey2 = (await as("boss", "liveObsKey", {})).key;
  assert.equal((await obs({ query: { k: obsKey } })).code, 403); assert.equal((await obs({ query: { k: obsKey2 } })).code, 200);
  // without a stored key hash nothing works
  await as("boss", "liveObsKey", { revoke: true }); assert.equal((await obs({ query: { k: obsKey2 } })).code, 403);
  const obsKey3 = (await as("boss", "liveObsKey", {})).key;

  // ---------- liveDeck ----------
  const deckKey = (await as("boss", "liveDeckKey", {})).key;
  const deck = (q, extra = {}) => hit(FEEDS.handleLiveDeck, { query: { k: deckKey, ...q }, ...extra });
  assert.equal((await hit(FEEDS.handleLiveDeck, { query: { action: "nextBeat" } })).code, 403);
  assert.equal((await hit(FEEDS.handleLiveDeck, { query: { k: obsKey3, action: "nextBeat" } })).code, 403, "the stream view key is not a deck key");
  assert.equal((await hit(FEEDS.handleLiveDeck, { method: "PUT", query: { k: deckKey } })).code, 405);
  // Start and Stop are never deck actions, whatever the key
  for (const a of ["start", "stop", "afterShow", "startStream", "stopStream"]) { const r = await deck({ action: a }); assert.equal(r.code, 403); assert.equal(r.body.reason, "notOnDeck"); }
  assert.equal((await stream("f1")).state, "live", "the deck did not stop the stream");
  assert.equal((await deck({ action: "startQuestions" })).code, 501);
  assert.equal((await deck({ action: "bogus" })).code, 400);
  const logsBefore = (await root("adminLog")).length;
  let dr = await deck({ action: "nextBeat" }); assert.equal(dr.code, 200); assert.equal(L.currentBeat((await stream("f1")).beats), "break1");
  dr = await deck({ action: "openCheckin", minutes: "3" });
  assert.equal(dr.code, 200); assert.equal(dr.body.word, undefined, "the deck response never carries the word"); assert.ok(!JSON.stringify(dr.body).includes((await control("f1")).window.word));
  assert.equal((await control("f1")).window.lengthMinutes, 3);
  assert.equal((await deck({ action: "extend" })).code, 200);
  assert.equal((await deck({ action: "closeCheckin" })).code, 200);
  assert.equal((await deck({ action: "scene", scene: "brb", brbMinutes: "2" })).code, 200); assert.equal((await control("f1")).pinned, "brb");
  assert.equal((await deck({ action: "scene", scene: "starting" })).body.reason, "scene", "the deck only sets Auto, Be right back and Ending");
  assert.equal((await deck({ action: "scene", scene: "break-side" })).code, 200); assert.equal((await control("f1")).pinned, "break-side", "the deck pins the Break side rail");
  assert.equal((await deck({ action: "scene", scene: "auto" })).code, 200);
  assert.equal((await deck({ action: "nextGame" })).code, 200); assert.equal((await stream("f1")).segments.find((g) => g.endedAt == null).gameId, "g2");
  assert.equal((await deck({ action: "nextGame" })).body.reason, "noNextGame");
  const dlogs = (await root("adminLog")).slice(logsBefore).filter((e) => e.feature === "controlRoom");
  assert.ok(dlogs.length >= 6 && dlogs.every((e) => e.actorName === "Stream Deck" && e.actorUid === null), "every deck action is logged as Stream Deck");
  assert.ok(!JSON.stringify(dlogs).includes(deckKey));
  // rate limit: 30 a minute per key, then 429; the next minute starts fresh
  const minuteStart = clock; let blocked = 0, okc = 0;
  for (let i = 0; i < 40; i++) { const r = await deck({ action: "scene", scene: "auto" }); if (r.code === 429) blocked++; else okc++; }
  assert.ok(blocked >= 10 && okc <= 30, `rate limit: ${okc} ok, ${blocked} blocked`);
  assert.deepEqual((await deck({ action: "scene", scene: "auto" })).body, { ok: false, reason: "rateLimit" });
  const counterDocs = (await wdb.collection(`${S}/rateLimits`).get()).docs.filter((x) => x.id.startsWith("live_deck_"));
  assert.ok(counterDocs.length >= 1 && counterDocs[0].get("expireAt"), "a documented counter doc with a TTL");
  assert.ok(!counterDocs.some((x) => x.id.includes(deckKey)), "the counter id holds only a hash prefix");
  clock += 61 * 1000; assert.equal((await deck({ action: "scene", scene: "auto" })).code, 200, "a new minute, a new budget");
  assert.ok(clock > minuteStart);
  // bad keys are throttled too
  let bad429 = 0; for (let i = 0; i < 70; i++) if ((await hit(FEEDS.handleLiveDeck, { query: { k: "bad" + i, action: "nextBeat" } })).code === 429) bad429++;
  assert.ok(bad429 >= 5, "key guessing is throttled");
  clock += 61 * 1000;
  // no stream live: a clear refusal
  const savedLive = await ctx.liveStream();
  await as("boss", "stopStream", {});
  assert.equal((await deck({ action: "nextBeat" })).body.reason, "notLive");
  assert.equal(savedLive.id, "f1");
  assert.equal(await why(as("boss", "liveViewerEntry", { viewers: 3 })), "notLive");

  // ---------- livePlatformStatus (Start dialog, NO WRITES) and the TikTok switch (liveRoom) ----------
  await mkStream("t1", { title: "TikTok night", rooms: ["twitch", "ytLandscape", "ytVertical", "tiktok"], youtube: { status: "ok" } });
  await mkStream("tb", { title: "Backstage", type: "backstage", audience: "fanClub", rooms: [] });
  await wdb.doc(`${S}/streams/t1/private/watch`).set({ provider: "youtube", youtube: { landscapeId: "VID-LAND-1", verticalId: null } });
  const storeSnap = () => JSON.stringify([...wdb._store.entries()]);
  // who may ask
  assert.equal(await why(as(null, "livePlatformStatus", { streamId: "t1" })), "signedOut");
  for (const uid of ["fan", "mod1", "adm1"]) assert.equal(await why(as(uid, "livePlatformStatus", { streamId: "t1" })), "notAllowed", uid + " is refused");
  assert.equal(await why(as("adm2", "livePlatformStatus", {})), "args");
  assert.equal(await why(as("boss", "livePlatformStatus", { streamId: "nope" })), "noStream");
  // the shape, with Twitch and YouTube both live
  tw.live = true; tw.viewers = 77; yt.active = ["VID-LAND-1", "VID-VERT-9"]; yt.down = false; net.length = 0; yt.listCalls = 0;
  const before = storeSnap();
  const ps = await as("adm2", "livePlatformStatus", { streamId: "t1" });
  assert.deepEqual(ps.twitch, { live: true, viewers: 77 });
  assert.deepEqual(ps.youtube, { eventStatus: "ok", connected: true, live: true, verticalWanted: true, verticalActive: true });
  assert.deepEqual(ps.tiktok, { planned: true, on: false });
  assert.equal(typeof ps.checkedAt, "number");
  const psJson = JSON.stringify(ps);
  assert.ok(!/VID-|TWTOKEN|B1|token/i.test(psJson), "no id, video id or token in the response");
  assert.equal(storeSnap(), before, "livePlatformStatus writes NOTHING (no document changed, none created)");
  assert.ok(net.every((n) => (n.method || "GET") === "GET" || n.url.includes("oauth2/token")), "only reads on the network");
  // partial and none
  yt.active = ["VID-LAND-1"]; assert.deepEqual((await as("boss", "livePlatformStatus", { streamId: "t1" })).youtube, { eventStatus: "ok", connected: true, live: true, verticalWanted: true, verticalActive: false });
  tw.live = false; yt.active = []; const none = await as("boss", "livePlatformStatus", { streamId: "t1" });
  assert.deepEqual(none.twitch, { live: false }); assert.equal(none.youtube.live, false); assert.equal(none.youtube.verticalActive, false);
  yt.down = true; const off = await as("boss", "livePlatformStatus", { streamId: "t1" });
  assert.deepEqual(off.youtube, { eventStatus: "ok", connected: false, live: false, verticalWanted: false, verticalActive: false }); yt.down = false;
  const bsPs = await as("boss", "livePlatformStatus", { streamId: "tb" });
  assert.deepEqual(bsPs.twitch, { live: false }); assert.deepEqual(bsPs.tiktok, { planned: false, on: false });
  // Twitch not configured: an answer, not a crash
  const noTw = require("../lib/live").build({ adminLogEntry, youtube: fakeYoutube, now: () => clock, fetchFn: fakeFetch, twitchClientId: "", twitchClientSecret: "", twitchLogin: "boomertanger" }).functions;
  const nt = await noTw.livePlatformStatus.run({ auth: { uid: "boss", token: {} }, data: { streamId: "t1" } });
  assert.deepEqual(nt.twitch, { live: false, error: "notConfigured" });
  assert.equal(storeSnap(), before, "still nothing written");

  // the TikTok switch: who, what, persistence
  assert.equal(await why(as(null, "liveRoom", { streamId: "t1", room: "tiktok", on: true })), "signedOut");
  for (const uid of ["fan", "mod1", "adm1"]) assert.equal(await why(as(uid, "liveRoom", { streamId: "t1", room: "tiktok", on: true })), "notAllowed");
  assert.equal(await why(as("adm2", "liveRoom", { streamId: "t1", room: "twitch", on: true })), "room");
  assert.equal(await why(as("adm2", "liveRoom", { streamId: "t1", room: "tiktok", on: "yes" })), "args");
  assert.equal(await why(as("adm2", "liveRoom", { streamId: "tb", room: "tiktok", on: true })), "backstage");
  assert.equal(await why(as("adm2", "liveRoom", { streamId: "s2", room: "tiktok", on: true })), "notInStream");
  const on1 = await as("adm2", "liveRoom", { streamId: "t1", room: "tiktok", on: true });
  assert.deepEqual(on1.liveRooms, ["twitch", "ytLandscape", "ytVertical", "tiktok"]);
  assert.deepEqual((await stream("t1")).liveRooms, ["twitch", "ytLandscape", "ytVertical", "tiktok"], "persisted on the stream before Start");
  assert.equal((await as("boss", "livePlatformStatus", { streamId: "t1" })).tiktok.on, true);
  assert.ok((await root("adminLog")).some((e) => e.feature === "controlRoom" && e.action === "room" && e.actorUid === "adm2"));
  const off1 = await as("boss", "liveRoom", { streamId: "t1", room: "ytv", on: false }).then(() => "ok", (e) => e.details.reason);
  assert.equal(off1, "room", "only the canonical tiktok room has a switch");
  await as("boss", "liveRoom", { streamId: "t1", room: "TikTok", on: false });
  assert.deepEqual((await stream("t1")).liveRooms, ["twitch", "ytLandscape", "ytVertical"]);
  await as("boss", "liveRoom", { streamId: "t1", room: "tiktok", on: true });
  // Start keeps the owner's pre-set choice
  await as("boss", "startStream", { streamId: "t1" });
  assert.deepEqual((await stream("t1")).liveRooms, ["twitch", "ytLandscape", "ytVertical", "tiktok"], "Start keeps TikTok when the switch was on");
  let pubT = await get("public/live");
  assert.deepEqual(pubT.liveRooms, ["twitch", "ytLandscape", "ytVertical", "tiktok"], "public/live shows TikTok live");
  assert.deepEqual((await FEEDS.viewData()).liveRooms, ["twitch", "ytLandscape", "ytVertical", "tiktok"], "the stream view feed carries it too");
  // live: type a TikTok count, switch off -> the count and the room go, public/live follows, it survives a re-read
  await as("boss", "liveViewerEntry", { viewers: 40 });
  assert.equal((await control("t1")).tiktok.viewers, 40);
  const off2 = await as("adm2", "liveRoom", { room: "tiktok", on: false });
  assert.deepEqual(off2.liveRooms, ["twitch", "ytLandscape", "ytVertical"]);
  assert.equal((await control("t1")).tiktok, undefined); assert.equal((await control("t1")).viewers.tiktok, undefined);
  pubT = await get("public/live"); assert.deepEqual(pubT.liveRooms, ["twitch", "ytLandscape", "ytVertical"]); assert.equal(pubT.viewers.byPlatform.tiktok, undefined);
  assert.deepEqual((await FEEDS.viewData()).liveRooms, ["twitch", "ytLandscape", "ytVertical"]);
  await as("adm2", "liveRoom", { room: "tiktok", on: true });
  assert.ok((await get("public/live")).liveRooms.includes("tiktok"));
  // default Start (no switch touched): TikTok is NOT live until the owner says so
  await as("boss", "stopStream", {});
  await mkStream("t2", { title: "Default", rooms: ["twitch", "tiktok"] });
  await as("boss", "startStream", { streamId: "t2" });
  assert.deepEqual((await stream("t2")).liveRooms, ["twitch"], "TikTok is off by default at Start");
  await as("boss", "stopStream", {});
  assert.equal(await why(as("boss", "liveRoom", { streamId: "t2", room: "tiktok", on: true })), "badState", "an ended stream has no switch");
  // a TikTok-only stream can't switch its only chat off
  await mkStream("t3", { title: "Only TikTok", rooms: ["tiktok"] });
  assert.equal(await why(as("boss", "liveRoom", { streamId: "t3", room: "tiktok", on: false })), "lastRoom");
  assert.deepEqual(L.startRooms({ type: "platform", rooms: ["tiktok"] }), ["tiktok"]);
  assert.deepEqual(L.startRooms({ type: "platform", rooms: ["twitch", "tiktok"] }), ["twitch"]);
  assert.deepEqual(L.startRooms({ type: "platform", rooms: ["twitch", "tiktok"], liveRooms: ["tiktok", "bogus"] }), ["tiktok"]);

  // ---------- 12 hour auto-end through liveTick ----------
  await mkStream("f2", { title: "Marathon" });
  await as("boss", "startStream", { streamId: "f2" });
  clock += 12 * H + MIN;
  t = await FEEDS.runTick();
  assert.equal(t.autoEnded, true); const f2 = await stream("f2");
  assert.equal(f2.state, "ended"); assert.equal(f2.autoEnded, true); assert.equal(f2.actualEnd.toMillis(), f2.actualStart.toMillis() + 12 * H);
  assert.ok((await root("adminLog")).some((e) => e.action === "autoEnd" && e.actorName === "Automatic"));

  // ---------- backstageWatch: the audience only ----------
  await wdb.doc(`${S}/streams/f1/private/watch`).set({ provider: "youtube", youtube: { landscapeId: "LANDSCAPE11", backstageId: null, verticalId: "VERTICAL111" } });
  await mkStream("bw1", { type: "backstage", audience: "fanClub", title: "Backstage live", rooms: [], platforms: [] });
  yt.active = [];
  await as("boss", "startStream", { streamId: "bw1" });
  assert.equal(await why(as(null, "backstageWatch", {})), "signedOut");
  assert.equal(await why(as("fan", "backstageWatch", {})), "noVideo", "live, audience ok, but the event has no id yet");
  await wdb.doc(`${S}/streams/bw1/private/watch`).set({ provider: "youtube", youtube: { landscapeId: null, backstageId: "BACKSTAGE01", verticalId: null } });
  assert.equal(await why(as("visitor0", "backstageWatch", {})), "audience", "signed in but never joined: Join free");
  for (const uid of ["fan", "subby", "mod1", "adm1", "adm2", "boss"]) { const r = await as(uid, "backstageWatch", {}); assert.equal(r.videoId, "BACKSTAGE01", `${uid} may watch`); assert.equal(r.provider, "youtube"); }
    assert.equal(await why(as("fan", "backstageWatch", { streamId: "f2" })), "notBackstage");
  for (const [name, docs] of [["adminLog", await root("adminLog")], ["activityLog", await root("activityLog")], ["notifyOutbox", await root(`${S}/notifyOutbox`)], ["public/live", [await get("public/live")]], ["stream", [await stream("bw1")]], ["control", [await control("bw1")]]]) assert.ok(!clean(docs).includes("BACKSTAGE01"), `${name} never holds the backstage video id`);
  assert.deepEqual(L.findSecrets(await get("public/live"), { videoIds: ["BACKSTAGE01"] }), []);
  // 9e: the backstage video id reaches ONLY the audience's answer. Not obsFeed (a valid key), not any log line, not the stream doc a visitor reads.
  {
    const logged = [], keep = {};
    for (const k of ["log", "error", "warn", "info"]) { keep[k] = console[k]; console[k] = (...args) => { logged.push(args.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")); keep[k](...args); }; }
    try {
      for (const uid of ["fan", "subby"]) assert.equal((await as(uid, "backstageWatch", {})).videoId, "BACKSTAGE01");
      for (const bad of [as(null, "backstageWatch", {}), as("visitor0", "backstageWatch", {}), as("fan", "backstageWatch", { streamId: "f2" })]) await why(bad);
      const ok = (await as("boss", "liveObsKey", {})).key;
      const ov = await obs({ query: { k: ok } });
      assert.equal(ov.code, 200); assert.ok(!JSON.stringify(ov.body).includes("BACKSTAGE01"), "obsFeed never carries the backstage video id");
      assert.equal(ov.body.view.state, "backstage");
      await as("boss", "liveObsKey", { revoke: true });
      assert.ok(!JSON.stringify(await get("streams/bw1")).includes("BACKSTAGE01"), "the public stream doc holds no video id");
    } finally { for (const k of Object.keys(keep)) console[k] = keep[k]; }
    assert.ok(!logged.join("\n").includes("BACKSTAGE01"), "no log line carries the backstage video id");
  }
  // Sub Club (billing, later): fans are refused, subs and staff pass
  await wdb.doc(`${S}/streams/bw1`).update({ audience: "subClub" });
  assert.equal(await why(as("fan", "backstageWatch", {})), "audience");
  assert.equal((await as("subby", "backstageWatch", {})).videoId, "BACKSTAGE01"); assert.equal((await as("mod1", "backstageWatch", {})).videoId, "BACKSTAGE01");
  await wdb.doc(`${S}/streams/bw1`).update({ audience: "fanClub" });
  await as("boss", "stopStream", {});
  assert.equal(await why(as("fan", "backstageWatch", {})), "notLive");

  // ================================================================ 3d: Twitch EventSub
  const ES = live.hooks.eventsub.helpers, ESSECRET = "ES-TEST-SECRET-123";
  const esReq = (type, body, o = {}) => {
    const raw = o.raw || Buffer.from(JSON.stringify(body));
    const id = o.id || `msg-${Math.random().toString(36).slice(2)}`, ts = o.ts || new Date(clock).toISOString();
    return { method: o.method || "POST", rawBody: raw, headers: {
      "twitch-eventsub-message-id": id, "twitch-eventsub-message-timestamp": ts, "twitch-eventsub-message-type": type,
      "twitch-eventsub-message-signature": o.sig || ES.signMessage(o.secret || ESSECRET, id, ts, raw),
    }, id };
  };
  const esHit = async (req) => { const res = mkRes(); await ES.handleTwitchEventSub(req, res); return res; };
  const online = { subscription: { type: "stream.online", status: "enabled" }, event: { broadcaster_user_id: "B1", type: "live" } };
  const offline = { subscription: { type: "stream.offline", status: "enabled" }, event: { broadcaster_user_id: "B1" } };
  const esLog = []; const realWarn = console.warn, realErr = console.error;
  console.warn = (...a) => { esLog.push(a.join(" ")); }; console.error = (...a) => { esLog.push(a.join(" ")); };

  assert.equal((await esHit({ ...esReq("notification", online), method: "GET" })).code, 405);
  const noHdr = esReq("notification", online); delete noHdr.headers["twitch-eventsub-message-signature"];
  assert.equal((await esHit(noHdr)).code, 400);
  // signature: wrong secret, tampered body, wrong length, missing prefix
  assert.equal((await esHit(esReq("notification", online, { secret: "other-secret" }))).code, 403);
  const goodMsg = esReq("notification", online);
  assert.equal((await esHit({ ...goodMsg, rawBody: Buffer.from(JSON.stringify({ ...online, event: { broadcaster_user_id: "B1", x: 1 } })) })).code, 403, "a tampered body");
  assert.equal((await esHit(esReq("notification", online, { sig: "sha256=abc" }))).code, 403, "wrong length");
  assert.equal((await esHit(esReq("notification", online, { sig: ES.signMessage(ESSECRET, "x", "y", "z").slice(7) }))).code, 403);
  assert.equal((await wdb.collection(`${S}/rateLimits`).get()).docs.filter((x) => x.id.startsWith("eventsub_")).length, 0, "a refused message leaves no trace");
  // replay window: 10 minutes either side
  assert.equal((await esHit(esReq("notification", online, { ts: new Date(clock - 11 * MIN).toISOString() }))).code, 403, "an old message");
  assert.equal((await esHit(esReq("notification", online, { ts: new Date(clock + 11 * MIN).toISOString() }))).code, 403, "a message from the future");
  assert.equal((await esHit(esReq("notification", online, { ts: "not a time" }))).code, 403);
  // the challenge
  r = await esHit(esReq("webhook_callback_verification", { challenge: "pogchamp-kappa-360", subscription: { type: "stream.online" } }));
  assert.equal(r.code, 200); assert.equal(r.body, "pogchamp-kappa-360"); assert.equal(r.headers["Content-Type"], "text/plain");
  assert.equal((await esHit(esReq("webhook_callback_verification", { challenge: "c", subscription: { type: "stream.online" } }, { secret: "wrong" }))).code, 403, "no challenge answer for a bad signature");
  assert.equal((await esHit(esReq("webhook_callback_verification", { challenge: "c", subscription: { type: "channel.follow" } }))).code, 400);
  // notifications: nothing live, then a live stream
  r = await esHit(esReq("notification", online)); assert.equal(r.code, 200);
  await mkStream("e1", { title: "EventSub night" });
  await as("boss", "startStream", { streamId: "e1" });
  clock += MIN;
  const onMsg = esReq("notification", online);
  assert.equal((await esHit(onMsg)).body, "ok"); assert.equal((await control("e1")).twitch.status, "live");
  const seen = (await wdb.collection(`${S}/rateLimits`).get()).docs.filter((x) => x.id.startsWith("eventsub_"));
  assert.ok(seen.length >= 1 && seen.every((x) => x.get("expireAt")), "message ids are remembered with a TTL");
  clock += MIN;
  const offMsg = esReq("notification", offline);
  assert.equal((await esHit(offMsg)).body, "ok");
  let tws = (await control("e1")).twitch; assert.equal(tws.status, "offline"); const offAt = tws.offlineSince; assert.equal(offAt, clock);
  clock += MIN;
  await esHit(esReq("notification", offline));
  assert.equal((await control("e1")).twitch.offlineSince, offAt, "offline since the first offline");
  // a replayed message id is acknowledged and ignored
  r = await esHit(onMsg); assert.equal(r.code, 200); assert.equal(r.body, "duplicate");
  assert.equal((await control("e1")).twitch.status, "offline", "the replayed online message did not flip the status back");
  // another broadcaster's event, and a type we do not use, change nothing
  assert.equal((await esHit(esReq("notification", { ...online, event: { broadcaster_user_id: "SOMEONE_ELSE" } }))).body, "ignored");
  assert.equal((await esHit(esReq("notification", { subscription: { type: "channel.follow" }, event: { broadcaster_user_id: "B1" } }))).body, "ignored");
  assert.equal((await control("e1")).twitch.status, "offline");
  await esHit(esReq("notification", online)); assert.equal((await control("e1")).twitch.status, "live");
  assert.equal((await stream("e1")).state, "live", "EventSub never stops a stream");
  // revocation is noted, never a secret in the log
  r = await esHit(esReq("revocation", { subscription: { type: "stream.offline", status: "authorization_revoked" } })); assert.equal(r.code, 200);
  assert.equal((await get("live/main")).eventSubRevoked.stream_offline.status, "authorization_revoked");
  assert.ok(esLog.some((l) => /revoked/.test(l)));
  assert.ok(!esLog.join("\n").includes(ESSECRET), "the secret never reaches the log");
  console.warn = realWarn; console.error = realErr;
  await as("boss", "stopStream", {});
  const esSrc = fs.readFileSync(path.join(__dirname, "..", "lib", "live", "eventsub.js"), "utf8");
  assert.ok(/timingSafeEqual/.test(esSrc) && /createHmac\("sha256"/.test(esSrc), "HMAC-SHA256 with a constant-time compare");
  assert.ok(/TWITCH_EVENTSUB_SECRET/.test(esSrc) && /firebase functions:secrets:set TWITCH_EVENTSUB_SECRET --project staging/.test(esSrc));
  assert.ok(fns.twitchEventSub, "twitchEventSub is exported");

  // ---------- scripts/twitch-eventsub.js ----------
  const SUB = require("./twitch-eventsub");
  const sub = (type, status, id, extra = {}) => ({ id, type, status, condition: { broadcaster_user_id: "B1" }, transport: { method: "webhook", callback: SUB.CALLBACK }, ...extra });
  assert.deepEqual(SUB.planSubscriptions([], { broadcasterId: "B1" }), { create: ["stream.online", "stream.offline"], remove: [], keep: [] });
  let plan = SUB.planSubscriptions([sub("stream.online", "enabled", "a"), sub("stream.offline", "webhook_callback_verification_pending", "b")], { broadcasterId: "B1" });
  assert.deepEqual(plan.create, []); assert.deepEqual(plan.remove, []); assert.equal(plan.keep.length, 2);
  plan = SUB.planSubscriptions([sub("stream.online", "webhook_callback_verification_failed", "a"), sub("stream.online", "enabled", "b"), sub("stream.online", "enabled", "c"), sub("stream.offline", "authorization_revoked", "d")], { broadcasterId: "B1" });
  assert.deepEqual(plan.create, ["stream.offline"]); assert.deepEqual(plan.remove.map((x) => [x.id, x.why]).sort(), [["a", "stale"], ["c", "duplicate"], ["d", "stale"]]);
  plan = SUB.planSubscriptions([sub("stream.online", "enabled", "x", { transport: { method: "webhook", callback: "https://elsewhere.example/hook" } }), sub("stream.online", "enabled", "y", { condition: { broadcaster_user_id: "OTHER" } })], { broadcasterId: "B1" });
  assert.deepEqual(plan.create, ["stream.online", "stream.offline"], "other callbacks and other broadcasters are never considered");
  assert.deepEqual(plan.remove, []);
  assert.deepEqual(SUB.parseArgs([]), { apply: false, project: "staging" }); assert.equal(SUB.parseArgs(["--apply"]).apply, true);
  assert.throws(() => SUB.parseArgs(["--force"]), /Unknown argument/);
  // a fake Twitch: the dry run only reads; --apply creates and deletes; no secret is printed
  const subs = [sub("stream.online", "webhook_callback_verification_failed", "stale1")];
  const calls = [];
  const helix = async (url, init = {}) => {
    const method = init.method || "GET"; calls.push({ method, url, body: init.body });
    if (url.startsWith("https://id.twitch.tv/oauth2/token")) return jr(200, { access_token: "APPTOK" });
    if (url.startsWith("https://api.twitch.tv/helix/eventsub/subscriptions")) {
      if (method === "GET") return jr(200, { data: subs, pagination: {} });
      if (method === "DELETE") return jr(204, null);
      if (method === "POST") return jr(202, { data: [{}] });
    }
    throw new Error("unexpected " + url);
  };
  const SECRETS = { TWITCH_CLIENT_SECRET: "CLIENT-SECRET-XYZ", TWITCH_EVENTSUB_SECRET: "ES-SECRET-ABC" };
  const readSecret = async (n) => { if (!SECRETS[n]) throw new Error("missing " + n); return SECRETS[n]; };
  const lines = [];
  await assert.rejects(SUB.run({ apply: false, projectId: "boomertanger-prod", fetchFn: helix, readSecret, clientId: "CID", getBroadcasterId: "B1", log: (l) => lines.push(l) }), /only runs on staging/);
  assert.equal(calls.length, 0);
  const dry = await SUB.run({ apply: false, projectId: "boomertanger-staging", fetchFn: helix, readSecret, clientId: "CID", getBroadcasterId: async () => "B1", log: (l) => lines.push(l) });
  assert.equal(dry.applied, false); assert.deepEqual(dry.plan.create, ["stream.online", "stream.offline"]); assert.deepEqual(dry.plan.remove.map((x) => x.id), ["stale1"]);
  assert.deepEqual(calls.filter((c) => !["GET"].includes(c.method) && !c.url.includes("oauth2/token")), [], "the dry run only reads");
  assert.ok(lines.some((l) => /Would create: stream.online/.test(l)) && lines.some((l) => /Would delete: stream.online stale1/.test(l)));
  const live2 = []; calls.length = 0;
  const done = await SUB.run({ apply: true, projectId: "boomertanger-staging", fetchFn: helix, readSecret, clientId: "CID", getBroadcasterId: "B1", log: (l) => live2.push(l) });
  assert.equal(done.applied, true); assert.deepEqual(done.results.created, ["stream.online", "stream.offline"]); assert.deepEqual(done.results.deleted, ["stale1"]);
  const posts = calls.filter((c) => c.method === "POST" && c.url.includes("eventsub"));
  assert.equal(posts.length, 2);
  const pb = JSON.parse(posts[0].body);
  assert.equal(pb.transport.callback, "https://us-central1-boomertanger-staging.cloudfunctions.net/twitchEventSub"); assert.equal(pb.transport.method, "webhook"); assert.equal(pb.condition.broadcaster_user_id, "B1"); assert.equal(pb.version, "1"); assert.equal(pb.transport.secret, "ES-SECRET-ABC");
  assert.ok(calls.some((c) => c.method === "DELETE" && c.url.includes("id=stale1")));
  for (const out of [lines.join("\n"), live2.join("\n")]) for (const secret of Object.values(SECRETS).concat(["APPTOK"])) assert.ok(!out.includes(secret), "no secret or token is ever printed");
  const scriptSrc = fs.readFileSync(path.join(__dirname, "twitch-eventsub.js"), "utf8");
  assert.ok(/firebase functions:secrets:set TWITCH_EVENTSUB_SECRET --project staging/.test(scriptSrc), "the header carries the secret command");
  assert.ok(/boomertanger-staging/.test(scriptSrc) && !/boomertanger-prod/.test(scriptSrc.replace(/This script only runs[^\n]*/g, "")), "staging only");
  // nothing to do once the subscriptions exist
  subs.length = 0; subs.push(sub("stream.online", "enabled", "k1"), sub("stream.offline", "enabled", "k2"));
  const idle = []; const again = await SUB.run({ apply: true, projectId: "boomertanger-staging", fetchFn: helix, readSecret, clientId: "CID", getBroadcasterId: "B1", log: (l) => idle.push(l) });
  assert.equal(again.applied, false); assert.ok(idle.some((l) => /Nothing to do/.test(l)));

  // ================================================================ 3e: rules, indexes and seed
  const rulesText = fs.readFileSync(path.join(__dirname, "..", "..", "firestore.rules"), "utf8").replace(/\r\n/g, "\n");
  const count = (t, ch) => t.split(ch).length - 1;
  assert.equal(count(rulesText, "{"), count(rulesText, "}"), "firestore.rules braces balance");
  /** The text of the block that starts at the first match of `re` (through its closing brace). */
  const block = (text, re, from = 0) => {
    const m = re.exec(text.slice(from)); assert.ok(m, `no block ${re}`);
    const start = from + m.index; let depth = 0;
    for (let i = start + m[0].length - 1; i < text.length; i++) { if (text[i] === "{") depth++; else if (text[i] === "}" && --depth === 0) return text.slice(start, i + 1); }
    throw new Error("unbalanced");
  };
  const streamsBlock = block(rulesText, /match \/streams\/\{streamId\} \{/);
  assert.equal((streamsBlock.match(/match \/private\//g) || []).length, 1, "ONE generic private rule inside streams (rules OR together: never a second overlapping match)");
  const rule = (text, op = "read") => { const m = new RegExp(`allow ${op}[a-z, ]*: if ([^;]+);`).exec(text); assert.ok(m, `no allow ${op}`); return m[1].replace(/\s+/g, " ").trim(); };
  const privateBlock = block(streamsBlock, /match \/private\/\{docId\} \{/);
  const privRead = rule(privateBlock);
  const evalRule = (expr, scope) => new Function(...Object.keys(scope), `return (${expr});`)(...Object.values(scope));
  const roleScope = (role, extra = {}) => ({
    siteId: "boomertanger", isSiteOwner: () => role === "owner", isOwnerOrA2Plus: () => ["owner", "a2"].includes(role),
    isSiteStaff: () => ["owner", "a2", "a1", "mod"].includes(role), isSignedUpMember: () => role !== "visitor",
    hasSiteRole: (_s, r) => (r === "admin" ? ["owner", "a2", "a1"].includes(role) : r === "mod" ? role === "mod" : false),
    request: { auth: role === "visitor" ? null : { uid: `u-${role}` } }, ...extra,
  });
  const ROLES = ["visitor", "member", "mod", "a1", "a2", "owner"];
  const who = (docId) => ROLES.filter((role) => evalRule(privRead, roleScope(role, { docId })));
  assert.deepEqual(who("control"), ["a2", "owner"], "private/control (the current word): the owner and A2+, never a mod or A1");
  assert.deepEqual(who("checklist"), ["owner"], "private/checklist: the owner's uid only, an A2 cannot read it");
  assert.deepEqual(who("watch"), [], "private/watch (the video id): nobody on the client");
  assert.deepEqual(who("duty"), ["mod", "a1", "a2", "owner"], "private/duty (the live duty state, Mod Machina phase 3): crew (mods and admins) and the owner read it, members and visitors do not");
  assert.deepEqual(who("draft"), ["mod", "a1", "a2", "owner"], "the planner draft stays staff");
  assert.equal(rule(privateBlock, "write"), "false");
  // presence (own doc + admins), counters (owner + A2+), live/main (owner + A2+), its private templates (owner only), the word log (nobody)
  const presenceBlock = block(streamsBlock, /match \/presence\/\{uid\} \{/), countersBlock = block(streamsBlock, /match \/counters\/\{shard\} \{/);
  const pres = (role, uid) => evalRule(rule(presenceBlock), roleScope(role, { uid }));
  assert.equal(pres("member", "u-member"), true, "a member reads their own presence"); assert.equal(pres("member", "someone-else"), false, "not another member's");
  assert.equal(pres("a1", "x"), true); assert.equal(pres("owner", "x"), true); assert.equal(pres("mod", "x"), false, "mods do not read presence"); assert.equal(pres("visitor", "x"), false);
  assert.deepEqual(ROLES.filter((r) => evalRule(rule(countersBlock), roleScope(r))), ["a2", "owner"], "counters: owner and A2+");
  const liveBlock = block(rulesText, /match \/live\/\{docId\} \{/);
  assert.deepEqual(ROLES.filter((r) => evalRule(rule(liveBlock), roleScope(r))), ["a2", "owner"], "live/main: owner and A2+ read");
  const tplBlock = block(liveBlock, /match \/private\/\{templateId\} \{/), wordBlock = block(liveBlock, /match \/wordLog\/\{word\} \{/);
  assert.deepEqual(ROLES.filter((r) => evalRule(rule(tplBlock), roleScope(r))), ["owner"], "checklistTemplates: the owner only");
  assert.match(wordBlock, /allow read, write: if false;/);
  // public/live: public read through the one public/{docId} rule
  const publicBlock = block(rulesText, /match \/public\/\{docId\} \{/);
  assert.equal(evalRule(rule(publicBlock), roleScope("visitor", { docId: "live" })), true, "public/live is public read");
  assert.equal(evalRule(rule(publicBlock), roleScope("visitor", { docId: "goalTracker" })), false);
  // NO client writes anywhere in the Control Room's paths: every write-like allow is `if false`
  for (const [name, b] of [["private", privateBlock], ["presence", presenceBlock], ["counters", countersBlock], ["live", liveBlock], ["templates", tplBlock], ["wordLog", wordBlock]]) {
    for (const m of b.matchAll(/allow ([a-z, ]+): if ([^;]+);/g)) if (/write|create|update|delete/.test(m[1])) assert.equal(m[2].trim(), "false", `${name}: ${m[0]}`);
  }
  assert.match(rulesText, /request\.auth\.token\.get\('crewGrade', ''\) in \['A2', 'A3'\]/, "A2+ means the A2 and A3 claims, not A1");
  assert.ok(!/'A1'\]/.test(rulesText.slice(rulesText.indexOf("function isOwnerOrA2Plus"), rulesText.indexOf("function isOwnerOrA2Plus") + 300)));
  // the word and key hashes are never in any public path the rules open: public/live is built by buildPublicLive (checked above), and live/main is staff-only
  const ctrlNow = await control("c1");
  assert.ok(ctrlNow.words && Object.values(ctrlNow.words).length, "the word lives in private/control");
  assert.deepEqual(L.findSecrets(await get("public/live"), { words: Object.values(ctrlNow.words) }), [], "…and nowhere in public/live");

  // indexes
  const idx = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "firestore.indexes.json"), "utf8"));
  const has = (cg, fields) => idx.indexes.some((i) => i.collectionGroup === cg && JSON.stringify(i.fields.map((f) => [f.fieldPath, f.order])) === JSON.stringify(fields));
  assert.ok(has("streams", [["state", "ASCENDING"], ["actualEnd", "DESCENDING"]]), "public/live: the stream that just ended");
  assert.ok(has("streams", [["state", "ASCENDING"], ["plannedStart", "ASCENDING"]]), "the stream view: the next scheduled stream");
  assert.ok(idx.fieldOverrides.some((o) => o.collectionGroup === "presence" && o.fieldPath === "expireAt" && o.ttl === true), "presence expires after 13 months (TTL)");
  assert.ok(idx.fieldOverrides.some((o) => o.collectionGroup === "rateLimits" && o.ttl === true), "the flush state, the deck counters and EventSub ids reuse the rateLimits TTL");

  // seed-live.js
  const SEED = require("./seed-live");
  const { STARTER_TEMPLATES } = require("../lib/live/starter");
  const sdb = makeDb(); const slog = [];
  assert.deepEqual(SEED.parseArgs([]), { project: "staging", apply: false, force: false }); assert.equal(SEED.parseArgs(["--apply", "--force"]).force, true);
  assert.throws(() => SEED.parseArgs(["--yolo"]), /Unknown argument/);
  assert.equal(SEED.STAGING_PROJECT, "boomertanger-staging");
  assert.match(fs.readFileSync(path.join(__dirname, "seed-live.js"), "utf8"), /Staging only: refusing/);
  let sr = await SEED.run({ db: sdb, apply: false, log: (l) => slog.push(l) });
  assert.deepEqual(sr, { wrote: false, main: "created", templates: "created" }); assert.equal(sdb._store.size, 0, "a dry run writes nothing");
  assert.ok(slog.some((l) => /Would create: live\/main/.test(l)));
  sr = await SEED.run({ db: sdb, apply: true, log: () => {} });
  assert.equal(sr.wrote, true);
  const sm = (await sdb.doc(`${S}/live/main`).get()).data();
  for (const [k, v] of Object.entries(L.DEFAULT_SETTINGS)) assert.deepEqual(sm[k], v, `live/main.${k} is the logic default`);
  assert.equal(sm.look, "hull"); assert.equal(sm.twitchPresence, false); assert.equal(sm.makeBackstagePrivateAfterDays, 7);
  assert.ok(!("obsKeyHash" in sm) && !("deckKeyHash" in sm), "no key is seeded");
  const stpl = (await sdb.doc(`${S}/live/main/private/checklistTemplates`).get()).data();
  assert.deepEqual(stpl.beats, JSON.parse(JSON.stringify(STARTER_TEMPLATES.beats)));
  assert.deepEqual(Object.keys(stpl.beats), ["start", "break1", "break2", "end"]);
  assert.ok(stpl.beats.start.some((i) => i.text.includes("open check-in")) && stpl.beats.break1.some((i) => /Questions/.test(i.text)) && stpl.beats.break2.some((i) => /Hot Seat/.test(i.text)) && stpl.beats.end.some((i) => /crew by name/.test(i.text)), "the starter checklist of section 5");
  assert.deepEqual(live.hooks.controls.helpers.cleanTemplates({ beats: stpl.beats }).beats.start.map((i) => i.id), stpl.beats.start.map((i) => i.id), "the callable accepts the starter templates unchanged");
  // idempotent; the owner's edits survive; keys survive --force
  sr = await SEED.run({ db: sdb, apply: true, log: () => {} });
  assert.deepEqual(sr, { wrote: false, main: "unchanged", templates: "kept" });
  await sdb.doc(`${S}/live/main`).set({ look: "crt", windowDefaultMinutes: 3, obsKeyHash: "a".repeat(64), deckKeyHash: "b".repeat(64) }, { merge: true });
  await sdb.doc(`${S}/live/main`).update({ xpCheckin: 12 });
  await sdb.doc(`${S}/live/main/private/checklistTemplates`).set({ beats: { start: [{ id: "mine", text: "My own" }], break1: [], break2: [], end: [] } });
  sr = await SEED.run({ db: sdb, apply: true, log: () => {} });
  assert.equal(sr.main, "unchanged"); assert.equal(sr.templates, "kept");
  assert.equal((await sdb.doc(`${S}/live/main`).get()).get("look"), "crt"); assert.equal((await sdb.doc(`${S}/live/main`).get()).get("xpCheckin"), 12);
  assert.equal((await sdb.doc(`${S}/live/main/private/checklistTemplates`).get()).get("beats").start[0].id, "mine");
  await sdb.doc(`${S}/live/main`).update({ makeBackstagePrivateAfterDays: realFs.FieldValue.delete() });
  sr = await SEED.run({ db: sdb, apply: true, log: () => {} });
  assert.equal(sr.main, "filled", "a missing field is filled"); assert.equal((await sdb.doc(`${S}/live/main`).get()).get("makeBackstagePrivateAfterDays"), 7); assert.equal((await sdb.doc(`${S}/live/main`).get()).get("look"), "crt", "…without touching what is there");
  const fl = []; sr = await SEED.run({ db: sdb, apply: false, force: true, log: (l) => fl.push(l) });
  assert.equal(sdb._store.get(`${S}/live/main`).look, "crt", "a forced dry run still writes nothing");
  assert.ok(fl.some((l) => /Would reset: live\/main fields/.test(l)));
  sr = await SEED.run({ db: sdb, apply: true, force: true, log: () => {} });
  const after = (await sdb.doc(`${S}/live/main`).get()).data();
  assert.equal(sr.main, "reset"); assert.equal(after.look, "hull"); assert.equal(after.xpCheckin, 10); assert.equal(after.windowDefaultMinutes, 5);
  assert.equal(after.obsKeyHash, "a".repeat(64), "--force never touches the key hashes"); assert.equal(after.deckKeyHash, "b".repeat(64));
  assert.equal((await sdb.doc(`${S}/live/main/private/checklistTemplates`).get()).get("beats").start.length, 5, "--force restores the starter templates");

  console.log("check-live-wiring: ok");
}
main().catch((e) => { console.error(e); process.exit(1); });
