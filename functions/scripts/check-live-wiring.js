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

const yt = { active: [], created: [], listCalls: 0, down: false };
const fakeYoutube = {
  apiClient: async () => { if (yt.down) return null; return { list: async ({ status }) => { yt.listCalls++; assert.equal(status, "active"); return yt.active.map((id) => ({ id })); } }; },
  syncStream: async (id, opts) => { yt.created.push({ id, ...opts }); return { action: "create", status: "ok" }; },
};
const adminLogEntry = async (_d, f) => ({ ...f, createdAt: realFs.Timestamp.now() });
let wordPick = 0;
const rng = () => [0.0, 0.5, 0.9, 0.3, 0.7][wordPick++ % 5];
const nsEvents = [];
const fakeFactory = { recordFactoryEvent: async (uid, type, params, ref) => { nsEvents.push({ uid, type, params, ref }); return { counted: true }; } };
const live = require("../lib/live").build({ adminLogEntry, youtube: fakeYoutube, now: () => clock, rng, factory: fakeFactory });
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
  const STAFF_FNS = ["startStream", "switchGame", "stopStream", "liveBeat", "liveCheckInWindow", "liveScene", "liveAfterShow"];
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

  // ---------- ad hoc stream ----------
  yt.created.length = 0;
  assert.equal(await why(as("boss", "startStream", { adhoc: { title: "", type: "platform" } })), "field");
  assert.equal(await why(as("boss", "startStream", { adhoc: { title: "Pop-up", type: "platform", rooms: ["nope"] } })), "rooms");
  assert.equal(await why(as("boss", "startStream", { adhoc: { title: "Pop-up", firstGame: { gameId: "zzz" } } })), "notInVault");
  r = await as("adm2", "startStream", { adhoc: { title: "Pop-up Party", type: "platform", rooms: ["twitch", "ytLandscape"], firstGame: { gameId: "g2" } } });
  const ad = await stream(r.streamId);
  assert.equal(ad.adhoc, true); assert.equal(ad.state, "live"); assert.equal(ad.title, "Pop-up Party"); assert.equal(ad.segments[0].gameId, "g2"); assert.deepEqual(ad.platforms, ["twitch", "youtube"]);
  assert.equal(yt.created.length, 1); assert.equal(yt.created[0].createNow, true);
  assert.ok((await root(`${S}/notifyOutbox`)).some((x) => x.type === "stream-live" && x.streamId === r.streamId));
  assert.ok((await root("adminLog")).some((x) => x.action === "startAdhoc"));
  await as("boss", "stopStream", {});
  r = await as("boss", "startStream", { adhoc: { title: "Backstage pop-up", type: "backstage" } });
  const adb = await stream(r.streamId); assert.equal(adb.type, "backstage"); assert.equal(adb.audience, "fanClub"); assert.deepEqual(adb.rooms, []);
  await as("boss", "stopStream", {});

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
  const obs = await as("boss", "liveObsKey", {}), deck = await as("boss", "liveDeckKey", {});
  assert.ok(/^[0-9a-f]{64}$/.test(obs.key) && /^[0-9a-f]{64}$/.test(deck.key) && obs.key !== deck.key);
  const main = await get("live/main");
  assert.equal(main.obsKeyHash, L.hashKey(obs.key)); assert.equal(main.deckKeyHash, L.hashKey(deck.key));
  assert.ok(!clean(main).includes(obs.key) && !clean(main).includes(deck.key), "no key in live/main");
  for (const [name, docs] of [["adminLog", await root("adminLog")], ["activityLog", await root("activityLog")]]) assert.ok(!clean(docs).includes(obs.key) && !clean(docs).includes(deck.key) && !clean(docs).includes(main.obsKeyHash), `${name}: no key or hash`);
  const obs2 = await as("boss", "liveObsKey", {});
  assert.notEqual(obs2.key, obs.key); assert.equal(L.verifyKey(obs.key, (await get("live/main")).obsKeyHash), false, "rotating kills the old key");
  assert.equal(L.verifyKey(obs2.key, (await get("live/main")).obsKeyHash), true);
  assert.equal((await as("boss", "liveObsKey", { revoke: true })).revoked, true); assert.equal((await get("live/main")).obsKeyHash, null);
  await as("boss", "liveObsKey", {});
  // settings
  assert.equal(await why(as("boss", "liveSettings", { look: "neon" })), "look");
  assert.equal(await why(as("boss", "liveSettings", {})), "args");
  assert.deepEqual((await as("boss", "liveSettings", { look: "crt", windowDefaultMinutes: 3 })).saved, ["look", "windowDefaultMinutes"]);
  assert.equal((await get("live/main")).look, "crt"); assert.equal((await get("public/live")).look, "crt");
  await as("boss", "liveSettings", { look: "hull" });

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

  // [3c section] [3d section] [3e section]
  console.log("check-live-wiring: ok");
}
main().catch((e) => { console.error(e); process.exit(1); });
