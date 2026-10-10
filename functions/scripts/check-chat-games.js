#!/usr/bin/env node
// functions/scripts/check-chat-games.js: Chat Games part 1 (docs/specs/chat-games.md §3, §9, §12, §13), run against the in-memory Firestore with fakes for
// Cloud Tasks. The engine (state machine, one-at-a-time, Swap, End, deadlines and the liveTick sweep, Stop clean-up), the registry refusal, the cue contract
// (who may mark a cue, +5 Gears once), the public/live pointer, and the rules text. No network, no credentials, no deploy.
//   npm run check      (or node scripts/check-chat-games.js)
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { makeDb } = require("./fixtures/fake-firestore");
const CG = require("../lib/chatGames/logic");
const LL = require("../lib/live/logic");

const admin = require("firebase-admin");
process.env.GCLOUD_PROJECT ||= "boomertanger-staging";
process.env.FIREBASE_CONFIG ||= JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const wdb = makeDb(); const realFs = admin.firestore;
const fakeFs = () => wdb; fakeFs.Timestamp = realFs.Timestamp; fakeFs.FieldValue = realFs.FieldValue;
Object.defineProperty(admin, "firestore", { value: fakeFs, configurable: true, writable: true });
const TS = (m) => realFs.Timestamp.fromMillis(m);
const S = "sites/boomertanger";
const B = `${S}/chatGames/main`;
const MIN = 60000, H = 60 * MIN;
let clock = Date.UTC(2026, 9, 12, 1, 0);

const tasks = [];
let taskFail = null;
const adminLogEntry = async (_d, f) => ({ ...f, createdAt: realFs.Timestamp.now() });
const live = require("../lib/live").build({ adminLogEntry, now: () => clock, fetchFn: async () => { throw new Error("no network"); },
  chatGamesEnqueue: async (data, delay) => { if (taskFail) throw taskFail; tasks.push({ data, delay }); }, enqueue: async () => {}, sleep: async () => {} });
const fns = live.functions, ctx = live.hooks.ctx, cg = live.hooks.chatGames;
const as = (uid, fn, data = {}) => fns[fn].run({ auth: uid ? { uid, token: {} } : undefined, data });
const why = async (p) => { try { await p; return "ok"; } catch (e) { return e.details?.reason || e.message; } };
const msg = async (p) => { try { await p; return "ok"; } catch (e) { return e.message; } };
const get = async (p) => (await wdb.doc(p).get()).data();
const docs = async (p) => (await wdb.collection(p).get()).docs.map((d) => ({ id: d.id, ...d.data() }));

// a test format (part 1 registers none): opens at once with a 45 s deadline, two cues, crew-hosted
const TEST = {
  start: (run, opts, { at }) => ({ ok: true, patch: { state: "open", openedAt: at, closesAt: at + 45000, round: 1 }, cues: [{ room: "twitch", order: 1, kicker: "Test game", text: "Type 1 or 2 in chat!" }, { room: "tiktok", order: 2, kicker: "Test game", text: "Tap the screen!" }] }),
  control: (run, action) => (action === "reveal" ? { ok: true, to: "revealed" } : action === "nextRound" ? { ok: true, to: "open", patch: { round: (run.round || 0) + 1, closesAt: clock + 30000 }, closesAt: clock + 30000 } : { ok: false, reason: "badAction", message: "Not here." }),
};

async function main() {
  // ---------- the pure state machine ----------
  const r0 = { id: "r", formatId: "x", state: "ready" };
  assert.equal(CG.transition(r0, "open", { at: 5 }).ok, true);
  assert.equal(CG.transition(r0, "revealed").reason, "badMove");
  assert.equal(CG.transition({ ...r0, state: "void" }, "open").reason, "over");
  assert.equal(CG.transition({ ...r0, state: "open" }, "open").reason, "already");
  assert.equal(CG.transition({ ...r0, state: "revealed" }, "open").ok, true, "rounds loop: revealed → open");
  assert.deepEqual(CG.transition({ ...r0, state: "open" }, "void", { at: 9 }).patch, { state: "void", updatedAt: 9, endedAt: 9, closesAt: null });
  assert.equal(CG.pointerOf({ ...r0, state: "ended" }), null);
  assert.deepEqual(CG.pointerOf({ id: "r", formatId: "x", state: "open", round: 2, title: "X", secret: 1 }), { runId: "r", formatId: "x", state: "open", round: 2, title: "X" });
  const duty = { captainNow: { uid: "cap" }, onDuty: { m1: { roles: [{ role: "lead", room: "twitch" }] }, m2: { roles: [{ role: "deckhand", room: "tiktok" }], away: { until: 1 } } } };
  assert.equal(CG.isCaptain(duty, "cap"), true);
  assert.equal(CG.canCue({ uid: "m1" }, duty, { room: "twitch" }), true);
  assert.equal(CG.canCue({ uid: "m1" }, duty, { room: "tiktok" }), false);
  assert.equal(CG.canCue({ uid: "m2" }, duty, { room: "tiktok" }), false, "away: not on duty in the room");
  assert.equal(CG.canCue({ uid: "cap" }, duty, { room: "tiktok" }), true);
  assert.equal(CG.canCue({ uid: "boss", isOwner: true }, null, { room: "site" }), true);
  assert.equal(CG.cueMove({ status: "posted" }, "posted").reason, "already");
  assert.equal(CG.cueMove({ status: "pending" }, "done").ok, true);
  assert.equal(CG.handlerFor("hot-seat"), null, "part 1 registers no format");
  // public/live: only the five pointer fields, and only while live
  const pub = LL.buildPublicLive({ stream: { id: "s", state: "live", beats: {} }, chatGame: { runId: "r", formatId: "x", state: "open", round: 1, title: "X", uid: "leak" }, nowMs: 1 });
  assert.deepEqual(pub.chatGame, { runId: "r", formatId: "x", state: "open", round: 1, title: "X" });
  assert.equal(LL.buildPublicLive({ stream: { id: "s", state: "ended", beats: {} }, chatGame: { runId: "r", formatId: "x", state: "open" }, nowMs: 1 }).chatGame, null);
  assert.equal(LL.buildPublicLive({ stream: null, nowMs: 1 }).chatGame, null);
  assert.equal(LL.findSecrets(pub).length, 0);

  // ---------- the cast and a live stream ----------
  await wdb.doc(S).set({ ownerUid: "boss" });
  const person = async (uid, roles, roster) => {
    await wdb.doc(`${S}/members/${uid}`).set({ roles }); await wdb.doc(`${S}/profiles/${uid}`).set({ handle: uid });
    if (roster) await wdb.doc(`${S}/crew/main/roster/${uid}`).set({ handle: uid, status: "active", ...roster });
  };
  await person("boss", ["admin"]); await person("adm2", ["admin"], { track: "admin", grade: 2 }); await person("cap", ["mod"], { track: "mod", grade: 2 });
  await person("lead1", ["mod"], { track: "mod", grade: 3 }); await person("hand1", ["mod"], { track: "mod", grade: 1 }); await person("fan", []);
  await wdb.doc(`${S}/streams/s1`).set({ title: "Monster Monday", state: "live", published: true, type: "platform", beats: { start: { startedAt: TS(clock - H) } }, actualStart: TS(clock - H), crew: {} });
  await wdb.doc(`${S}/streams/s1/private/control`).set({});
  await wdb.doc(`${S}/streams/s1/private/duty`).set({ streamId: "s1", state: "live", captainNow: { uid: "cap", handle: "cap", acting: true }, onDuty: {
    cap: { handle: "cap", roles: [{ role: "captain", room: null }] }, lead1: { handle: "lead1", roles: [{ role: "lead", room: "twitch" }] }, hand1: { handle: "hand1", roles: [{ role: "deckhand", room: "twitch" }] } } });
  for (const [id, order] of [["questions", 1], ["hot-seat", 2], ["would-you-rather", 3], ["predictions", 4]]) await wdb.doc(`${B}/formats/${id}`).set({ title: id, enabled: false, order, crewHosted: false });
  await wdb.doc(`${B}/formats/test`).set({ title: "Test game", enabled: true, order: 9, crewHosted: true });

  // ---------- who may start ----------
  assert.equal(await why(as("fan", "chatGameStart", { formatId: "hot-seat" })), "notCaptain");
  assert.equal(await why(as("adm2", "chatGameStart", { formatId: "hot-seat" })), "notCaptain", "an Overseer who isn't Captain can't start");
  assert.equal(await why(as(null, "chatGameStart", { formatId: "hot-seat" })), "signedOut");
  assert.equal(await msg(as("cap", "chatGameStart", { formatId: "hot-seat" })), "Not available yet.", "no handler yet");
  assert.equal(await msg(as("boss", "chatGameStart", { formatId: "nope" })), "Not available yet.");
  CG.HANDLERS.test = TEST;
  await wdb.doc(`${B}/formats/test`).update({ enabled: false });
  assert.equal(await why(as("cap", "chatGameStart", { formatId: "test" })), "disabled");
  await wdb.doc(`${B}/formats/test`).update({ enabled: true });

  // ---------- start: the run, both pointers, a deadline task, adminLog ----------
  const st = await as("cap", "chatGameStart", { formatId: "test" });
  const run = await get(`${B}/runs/${st.runId}`);
  assert.equal(run.state, "open"); assert.equal(run.streamId, "s1"); assert.equal(run.env, "staging"); assert.equal(run.startedBy, "cap");
  assert.equal((await get(`${S}/streams/s1/private/control`)).chatGame.runId, st.runId);
  assert.deepEqual((await get(`${S}/public/live`)).chatGame, { runId: st.runId, formatId: "test", state: "open", round: 1, title: "Test game" });
  assert.deepEqual((await get(`${S}/streams/s1/private/duty`)).chatGames.activeRunIds, [st.runId], "crew-hosted: listed for the Deck");
  assert.equal(tasks.length, 1); assert.equal(tasks[0].data.runId, st.runId); assert.equal(tasks[0].delay, 45);
  assert.ok((await docs("adminLog")).some((e) => e.feature === "chatGames" && e.action === "start"));
  const cues = await docs(`${B}/runs/${st.runId}/cues`);
  assert.equal(cues.length, 2); assert.ok(cues.every((c) => c.status === "pending"));
  // one at a time
  assert.equal(await msg(as("boss", "chatGameStart", { formatId: "test" })), "Test game is running. End it first or use Swap.");

  // ---------- cues ----------
  const tw = cues.find((c) => c.room === "twitch"), tt = cues.find((c) => c.room === "tiktok");
  assert.equal(await why(as("fan", "chatGameCue", { runId: st.runId, cueId: tw.id, action: "posted" })), "notYourRoom");
  assert.equal(await why(as("lead1", "chatGameCue", { runId: st.runId, cueId: tt.id, action: "posted" })), "notYourRoom", "another room's cue");
  const p1 = await as("lead1", "chatGameCue", { runId: st.runId, cueId: tw.id, action: "posted" });
  assert.equal(p1.gears, 5);
  assert.equal(await msg(as("hand1", "chatGameCue", { runId: st.runId, cueId: tw.id, action: "posted" })), "Already done by @lead1.");
  assert.equal((await get(`${S}/crew/main/gears/chatGame:${st.runId}:lead1`)).amount, 5, "keyed chatGame:{runId}:{uid}");
  await as("lead1", "chatGameCue", { runId: st.runId, cueId: tw.id, action: "done" });
  const p2 = await as("cap", "chatGameCue", { runId: st.runId, cueId: tt.id, action: "posted" });
  assert.equal(p2.gears, 5, "the Captain posting in any room");
  assert.equal((await get(`${B}/runs/${st.runId}/cues/${tw.id}`)).status, "done");

  // ---------- control and the second tap ----------
  assert.equal(await why(as("adm2", "chatGameControl", { runId: st.runId, action: "reveal" })), "notCaptain");
  await as("cap", "chatGameControl", { runId: st.runId, action: "reveal" });
  assert.equal(await msg(as("boss", "chatGameControl", { runId: st.runId, action: "reveal" })), "Already done by @cap.");
  assert.equal((await get(`${S}/public/live`)).chatGame.state, "revealed");
  await as("cap", "chatGameControl", { runId: st.runId, action: "nextRound" });
  assert.equal((await get(`${B}/runs/${st.runId}`)).round, 2);

  // ---------- deadlines: the task, a moved deadline, and the liveTick sweep ----------
  assert.equal((await cg.ops.onDeadline(st.runId, tasks[0].data.closesAtMs)).reason, "moved", "nextRound moved the deadline: the old task does nothing");
  assert.equal((await cg.ops.onDeadline(st.runId)).reason, "early");
  clock += 31000;
  assert.equal((await cg.sweep({ id: "s1" })).closed, 1);
  assert.equal((await get(`${B}/runs/${st.runId}`)).state, "locked");
  assert.equal((await cg.sweep({ id: "s1" })).closed, 0, "idempotent");

  // ---------- swap: voids the active run and starts the next one in one call ----------
  const sw = await as("boss", "chatGameSwap", { formatId: "test" });
  assert.equal(sw.voided, st.runId);
  const old = await get(`${B}/runs/${st.runId}`);
  assert.equal(old.state, "void"); assert.equal(old.voidReason, "swap");
  assert.equal((await get(`${S}/public/live`)).chatGame.runId, sw.runId);
  assert.deepEqual((await get(`${S}/streams/s1/private/duty`)).chatGames.activeRunIds, [sw.runId]);
  // a task that fails to queue is fine: the sweep is the backstop
  taskFail = new Error("queue off");
  await as("boss", "chatGameEnd", { runId: sw.runId });
  assert.equal((await get(`${B}/runs/${sw.runId}`)).state, "void", "ending before a reveal voids it");
  assert.equal((await get(`${S}/public/live`)).chatGame, null);
  assert.deepEqual((await get(`${S}/streams/s1/private/duty`)).chatGames.activeRunIds, []);
  const st3 = await as("cap", "chatGameStart", { formatId: "test" });
  taskFail = null;
  assert.equal((await get(`${B}/runs/${st3.runId}`)).state, "open");

  // ---------- Stop: void open runs, clear both pointers, write the night ----------
  await ctx.chatGames.closeOut("s1");
  assert.equal((await get(`${B}/runs/${st3.runId}`)).state, "void");
  assert.equal((await get(`${B}/runs/${st3.runId}`)).voidReason, "stop");
  assert.equal((await get(`${S}/streams/s1/private/control`)).chatGame, null);
  assert.equal((await get(`${S}/streams/s1/private/duty`)).chatGames, undefined);
  const night = (await get(`${S}/streams/s1`)).chatGames;
  assert.equal(night.count, 3); assert.equal(night.voided, 3);
  assert.equal(await why(as("cap", "chatGameCue", { runId: st3.runId, cueId: "x", action: "posted" })), "noRun");
  // the real Stop calls it
  const ctl = fs.readFileSync(path.join(__dirname, "../lib/live/controls.js"), "utf8");
  assert.match(ctl, /ctx\.chatGames\.closeOut\(s\.id\)/);
  assert.match(fs.readFileSync(path.join(__dirname, "../lib/live/feeds.js"), "utf8"), /ctx\.chatGames\.sweep\(stream\)/);
  // not live: no start
  await wdb.doc(`${S}/streams/s1`).update({ state: "ended" });
  assert.equal(await why(as("boss", "chatGameStart", { formatId: "test", streamId: "s1" })), "notLive");
  delete CG.HANDLERS.test;

  // ---------- rules text (the emulator needs Java 11+; same style as the other checks) ----------
  const rules = fs.readFileSync(path.join(__dirname, "../../firestore.rules"), "utf8");
  assert.match(rules, /match \/chatGames\/main\/formats\/\{formatId\} \{\s*allow read: if true;\s*allow write: if false;/);
  assert.match(rules, /match \/chatGames\/main\/runs\/\{runId\} \{\s*allow read: if true;\s*allow write: if false;/);
  assert.match(rules, /match \/rounds\/\{n\} \{\s*allow read: if true;\s*allow write: if false;/);
  assert.match(rules, /match \/secret\/\{docId\} \{\s*allow read, write: if false;/);
  assert.match(rules, /match \/staff\/\{docId\} \{\s*allow read: if isSiteStaff\(siteId\);\s*allow write: if false;/);
  assert.match(rules, /match \/plays\/\{uid\} \{\s*allow read: if request\.auth != null && \(request\.auth\.uid == uid \|\| isSiteStaff\(siteId\)\);\s*allow write: if false;/);
  assert.match(rules, /match \/cues\/\{cueId\} \{\s*allow read: if isSiteStaff\(siteId\);\s*allow write: if false;/);
  assert.match(rules, /match \/chatGames\/\{document=\*\*\} \{\s*allow read, write: if false;/);
  // the seed: four formats, all off, and the General Hot Seat pack
  const seed = require("./seed-chat-games");
  assert.deepEqual(seed.FORMATS.map((f) => f.id), ["questions", "hot-seat", "would-you-rather", "predictions"]);
  assert.ok(seed.FORMATS.every((f) => f.enabled === false && typeof f.title === "string" && typeof f.icon === "string" && typeof f.order === "number"));
  assert.equal(seed.PACKS[0].formatId, "hot-seat"); assert.equal(seed.PACKS[0].title, "General"); assert.deepEqual(seed.PACKS[0].cards, []);
  console.log("check-chat-games: ok");
}

main().catch((e) => { console.error(e); process.exit(1); });
