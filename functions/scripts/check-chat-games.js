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
  assert.equal(CG.handlerFor("caption-this"), null, "a format without its part has no handler");
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
  assert.equal(await why(as("fan", "chatGameStart", { formatId: "caption-this" })), "notCaptain");
  assert.equal(await why(as("adm2", "chatGameStart", { formatId: "caption-this" })), "notCaptain", "an Overseer who isn't Captain can't start");
  assert.equal(await why(as(null, "chatGameStart", { formatId: "caption-this" })), "signedOut");
  assert.equal(await msg(as("cap", "chatGameStart", { formatId: "caption-this" })), "Not available yet.", "no handler yet");
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

  // ================= Questions (part 2) =================
  await questionsPart();
  // ================= Packs and the pool (part 3) =================
  await packsPart();
  // ================= Hot Seat (part 4) =================
  await hotSeatPart();
  // ================= Would You Rather and Predictions (part 5) =================
  await choicesPart();

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
  // Questions rules: the one member-writable path (own vote, only { at: request.time }, Tonight or Standing, not your own)
  assert.match(rules, /match \/chatGames\/main\/questions\/\{qid\} \{\s*allow read: if resource\.data\.status in \['tonight', 'standing', 'answered', 'merged', 'cleared', 'archived'\]\s*\|\| \(request\.auth != null && resource\.data\.uid == request\.auth\.uid\)\s*\|\| isSiteStaff\(siteId\);\s*allow write: if false;/);
  assert.match(rules, /match \/votes\/\{uid\} \{\s*allow read: if request\.auth != null && request\.auth\.uid == uid;\s*allow create: if isSignedUpMember\(siteId\) && request\.auth\.uid == uid\s*&& request\.resource\.data\.keys\(\)\.hasOnly\(\['at'\]\) && request\.resource\.data\.at == request\.time/);
  assert.match(rules, /questions\/\$\(qid\)\)\.data\.status in \['tonight', 'standing'\]/);
  assert.match(rules, /questions\/\$\(qid\)\)\.data\.uid != request\.auth\.uid;\s*allow delete: if request\.auth != null && request\.auth\.uid == uid;\s*allow update: if false;/);
  const idx = JSON.parse(fs.readFileSync(path.join(__dirname, "../../firestore.indexes.json"), "utf8"));
  assert.ok(idx.fieldOverrides.some((f) => f.collectionGroup === "questions" && f.fieldPath === "expireAt" && f.ttl === true), "TTL on questions.expireAt");
  assert.ok(idx.indexes.some((i) => i.collectionGroup === "questions" && i.fields.map((f) => f.fieldPath).join() === "status,votes,createdAt"));
  // Would You Rather and Predictions: the ballots stay server-only (no rule of their own; the catch-all denies)
  assert.ok(!/ballots/.test(rules.replace(/\/\/.*$/gm, "")), "ballots have no rule of their own");
  // Hot Seat rules: a member reads only their own volunteer doc; nobody writes; hotSeatPicked falls to the catch-all
  assert.match(rules, /match \/chatGames\/main\/volunteers\/\{vid\} \{\s*allow read: if request\.auth != null && resource\.data\.uid == request\.auth\.uid;\s*allow write: if false;/);
  assert.ok(!/hotSeatPicked/.test(rules.replace(/\/\/.*$/gm, "")), "hotSeatPicked has no rule of its own");
  // Packs rules: the crew reads packs and the Suggested lane; nobody writes
  assert.match(rules, /match \/chatGames\/main\/packs\/\{packId\} \{\s*allow read: if isSiteStaff\(siteId\);\s*allow write: if false;\s*match \/suggested\/\{sid\} \{\s*allow read: if isSiteStaff\(siteId\);\s*allow write: if false;/);
  console.log("check-chat-games: ok");
}

async function choicesPart() {
  const C5 = require("../lib/chatGames/clogic");
  const R = (id) => `${B}/runs/${id}`;
  const ledger = (key) => get(`${S}/rewardLedger/${key}`);
  // ---------- pure rules ----------
  assert.deepEqual(C5.tally({ a: 0, b: 1, c: 0, d: 9 }, 2), { counts: [2, 1], total: 3, pct: [67, 33] });
  assert.deepEqual(C5.leaders([2, 2, 1]), [0, 1]); assert.deepEqual(C5.leaders([0, 0]), []);
  let wl = [];
  for (const id of ["p1", "p2", "p3"]) wl = C5.waitingAdd(wl, { runId: id, title: id }).list;
  assert.equal(C5.waitingAdd(wl, { runId: "p4", title: "x" }).reason, "waitingFull", "at most 3 wait");
  assert.deepEqual(C5.waitingDrop(wl, "p2").map((x) => x.runId), ["p1", "p3"]);
  assert.equal(C5.promptOf("would-you-rather", { options: ["Hide", "Run"] }).prompt.text, "Would you rather…");
  assert.equal(C5.promptOf("predictions", { text: "Does he die?", options: ["Yes"] }).reason, "options");
  assert.equal(C5.secondsOf(99), 45);

  // ---------- the cast: a new live stream, hand1 (grade 1) is Captain, lead1 a mod on duty ----------
  await wdb.doc(`${S}/streams/s3`).update({ state: "ended" });
  await wdb.doc(`${S}/streams/s5`).set({ title: "Night 5", state: "live", published: true, type: "platform", beats: { start: { startedAt: TS(clock - H) } }, actualStart: TS(clock - H), crew: {} });
  await wdb.doc(`${S}/streams/s5/private/control`).set({});
  await wdb.doc(`${S}/streams/s5/private/duty`).set({ streamId: "s5", state: "live", captainNow: { uid: "hand1", handle: "hand1" }, onDuty: { hand1: { roles: [{ role: "captain", room: null }] }, lead1: { roles: [{ role: "lead", room: "twitch" }] } } });
  const M = ["m1", "m2", "m3", "m4"];
  for (const u of M) { await wdb.doc(`${S}/profiles/${u}`).set({ handle: u, xp: 50 }); await wdb.doc(`${S}/members/${u}`).set({ roles: [] }); await wdb.doc(`users/${u}`).set({ signedUpAt: TS(clock - 40 * 24 * H) }); }
  await wdb.doc(`${S}/streams/s5/presence/m3`).set({ uid: "m3", xpEarned: 99 });
  await as("boss", "chatGameFormatSet", { formatId: "would-you-rather", enabled: true });
  await as("boss", "chatGameFormatSet", { formatId: "predictions", enabled: true });
  const classics = (await docs(`${B}/packs`)).find((p) => p.formatId === "would-you-rather");

  // ================= Would You Rather =================
  assert.equal(await why(as("lead1", "chatGameStart", { formatId: "would-you-rather", options: { source: "typed", prompt: { options: ["A", "B"] } } })), "notCaptain");
  const w1 = await as("hand1", "chatGameStart", { formatId: "would-you-rather", options: { source: "typed", prompt: { options: ["Hide in a locker", "Crawl a vent"] }, seconds: 30 } });
  let run = await get(R(w1.runId));
  assert.equal(run.state, "open"); assert.equal(run.prompt.text, "Would you rather…"); assert.equal(run.source, "typed"); assert.equal(tasks[tasks.length - 1].delay, 30, "30 s to vote");
  // ---- the Mod Deck (part 7): every action is refused on the server for the wrong person. lead1 is on duty but not the Captain; cap is a mod who
  // isn't clocked in for this stream (hand1 is tonight's Captain).
  for (const [who, fn, data, reason] of [
    ["lead1", "chatGameControl", { runId: w1.runId, action: "reveal" }, "notCaptain"],
    ["lead1", "chatGameControl", { runId: w1.runId, action: "pause" }, "notCaptain"],
    ["lead1", "chatGameEnd", { runId: w1.runId }, "notCaptain"],
    ["lead1", "chatGameSwap", { formatId: "would-you-rather", options: { source: "typed", prompt: { options: ["A", "B"] } } }, "notCaptain"],
    ["cap", "chatGameControl", { runId: w1.runId, action: "saveToPack", data: { packId: classics.id } }, "notCaptain"],
    ["cap", "chatGameModerate", { runId: w1.runId, uid: "m1" }, "notModerator"],
    ["cap", "questionModerate", { questionId: "nope", action: "hide" }, "notModerator"],
  ]) assert.equal(await why(as(who, fn, data)), reason, `${who} ${fn} ${data.action || ""} is refused`);
  // any member votes, checked in or not, and can change until it closes; the split stays secret
  await as("m1", "chatGamePlay", { runId: w1.runId, action: "vote", choice: 0 });
  await as("m2", "chatGamePlay", { runId: w1.runId, action: "vote", choice: 1 });
  await as("m3", "chatGamePlay", { runId: w1.runId, action: "vote", choice: 0 });
  await as("lead1", "chatGamePlay", { runId: w1.runId, action: "vote", choice: 0 });
  await as("m1", "chatGamePlay", { runId: w1.runId, action: "vote", choice: 1 });
  assert.equal((await get(`${R(w1.runId)}/ballots/1_m1`)).pick, 1, "a changed vote");
  assert.equal((await get(`${R(w1.runId)}/staff/r1`)).total, 4, "voters counted once each");
  assert.equal((await get(`${R(w1.runId)}/plays/m1`)).r[1].pick, 1);
  run = await get(R(w1.runId));
  assert.equal(run.display.counts, undefined, "no split in the public run before the reveal");
  assert.equal(await why(as("m4", "chatGamePlay", { runId: w1.runId, action: "vote", choice: 2 })), "bad-input");
  // the deadline reveals: counts, a 2-2 tie, 3 XP each under the cap, nothing for the mod on duty
  clock += 31000;
  await cg.sweep({ id: "s5" });
  run = await get(R(w1.runId));
  assert.equal(run.state, "revealed");
  assert.deepEqual(run.display.counts, [2, 2]); assert.deepEqual(run.display.winners, [0, 1]); assert.equal(run.display.total, 4);
  assert.equal((await ledger(`chatGames:${w1.runId}:1:m1`)).amount, 3, "ref {runId}:{round}");
  assert.equal(await ledger(`chatGames:${w1.runId}:1:lead1`), undefined, "a mod clocked in earns no game XP");
  assert.equal((await get(`${R(w1.runId)}/plays/lead1`)).r[1].result.crew, true);
  const m3r = (await get(`${R(w1.runId)}/plays/m3`)).r[1].result;
  assert.equal(m3r.xp, 1); assert.equal(m3r.capped, true, "capped at the stream's 100");
  assert.equal(await why(as("m4", "chatGamePlay", { runId: w1.runId, action: "vote", choice: 0 })), "closed");
  // Save to pack: the Captain (grade 1) lands in Suggested
  await as("hand1", "chatGameControl", { runId: w1.runId, action: "saveToPack", data: { packId: classics.id } });
  const sug = await docs(`${B}/packs/${classics.id}/suggested`);
  assert.ok(sug.some((s) => s.by === "hand1" && s.status === "pending" && s.options[0] === "Hide in a locker"), "the Captain's save is a suggestion");
  assert.equal(await msg(as("hand1", "chatGameControl", { runId: w1.runId, action: "saveToPack", data: { packId: classics.id } })), "Already saved.");
  // Next prompt (typed), Pause adds the time back, Reveal now; the owner's save adds the card
  await as("hand1", "chatGameControl", { runId: w1.runId, action: "nextRound", data: { source: "typed", prompt: { text: "Would you rather…", options: ["Lose the map", "Lose the flashlight"] }, seconds: 60 } });
  run = await get(R(w1.runId));
  assert.equal(run.state, "open"); assert.equal(run.round, 2); assert.equal((await get(`${S}/public/live`)).chatGame.round, 2);
  const before = run.closesAt.toMillis();
  clock += 5000; await as("hand1", "chatGameControl", { runId: w1.runId, action: "pause" });
  assert.equal(await why(as("m1", "chatGamePlay", { runId: w1.runId, action: "vote", choice: 0 })), "paused");
  clock += 60000; await as("hand1", "chatGameControl", { runId: w1.runId, action: "resume" });
  assert.equal((await get(R(w1.runId))).closesAt.toMillis(), before + 60000, "paused time added");
  await as("m1", "chatGamePlay", { runId: w1.runId, action: "vote", choice: 0 });
  await as("hand1", "chatGameControl", { runId: w1.runId, action: "reveal" });
  assert.equal(await msg(as("boss", "chatGameControl", { runId: w1.runId, action: "reveal" })), "It's already revealed.");
  assert.ok(await ledger(`chatGames:${w1.runId}:2:m1`));
  const cardsBefore = (await get(`${B}/packs/${classics.id}`)).cards.length;
  await as("boss", "chatGameControl", { runId: w1.runId, action: "saveToPack", data: { packId: classics.id } });
  assert.equal((await get(`${B}/packs/${classics.id}`)).cards.length, cardsBefore + 1, "the owner's save adds the card");
  assert.ok((await docs("adminLog")).some((e) => e.feature === "chatGames" && e.action === "saveToPack:added"));
  await as("hand1", "chatGameEnd", { runId: w1.runId });
  assert.equal((await get(R(w1.runId))).state, "ended");

  // ================= Predictions =================
  const Q = { source: "typed", prompt: { text: "Does Boomer die before the save room?", options: ["Yes", "No", "At the save room"] } };
  const p1 = await as("hand1", "chatGameStart", { formatId: "predictions", options: Q });
  assert.equal(tasks[tasks.length - 1].delay, 180, "locks itself after 3 minutes");
  for (const [u, c] of [["m1", 0], ["m2", 1], ["m3", 0], ["m4", 2], ["lead1", 0]]) await as(u, "chatGamePlay", { runId: p1.runId, action: "vote", choice: c });
  await as("m4", "chatGamePlay", { runId: p1.runId, action: "vote", choice: 1 });
  assert.equal((await get(R(p1.runId))).display.counts, undefined, "picks hidden until the lock");
  assert.equal(await why(as("lead1", "predictionPropose", { runId: p1.runId, answer: 0 })), "notLocked");
  // Lock: the lock XP (kept whatever happens), the slot freed, the waiting list
  await as("hand1", "chatGameControl", { runId: p1.runId, action: "lock" });
  run = await get(R(p1.runId));
  assert.equal(run.state, "locked"); assert.deepEqual(run.display.counts, [3, 2, 0], "the mod on duty picks too (no XP)");
  assert.equal((await ledger(`chatGames:${p1.runId}:lock:m1`)).amount, 3, "ref {runId}:lock");
  assert.equal(await ledger(`chatGames:${p1.runId}:lock:lead1`), undefined);
  assert.equal((await get(`${S}/streams/s5/private/control`)).chatGame, null, "a locked Prediction doesn't hold the slot");
  assert.deepEqual((await get(`${S}/public/live`)).chatGameWaiting, [{ runId: p1.runId, title: "Does Boomer die before the save room?" }]);
  assert.equal(await why(as("m1", "chatGamePlay", { runId: p1.runId, action: "vote", choice: 1 })), "closed");
  const w2 = await as("hand1", "chatGameStart", { formatId: "would-you-rather", options: { source: "typed", prompt: { options: ["Stay", "Go"] } } });
  assert.ok(w2.runId, "another game runs while it waits");
  // propose, reject, propose again, confirm (the slot is busy: it ends with its result)
  assert.equal(await why(as("fan", "predictionPropose", { runId: p1.runId, answer: 0 })), "notOnDuty");
  assert.equal(await why(as("cap", "predictionPropose", { runId: p1.runId, answer: 0 })), "notOnDuty", "a mod who isn't clocked in for this stream can't Call it");
  assert.equal(await why(as("cap", "predictionSettle", { runId: p1.runId, action: "settle", answer: 0 })), "notCaptain");
  assert.equal(await why(as("lead1", "predictionSettle", { runId: p1.runId, action: "void" })), "notCaptain", "a Room Lead can't void");
  await as("lead1", "predictionPropose", { runId: p1.runId, answer: 1 });
  assert.equal((await get(`${R(p1.runId)}/staff/p`)).proposal.answer, 1);
  assert.equal(await msg(as("lead1", "predictionPropose", { runId: p1.runId, answer: 0 })), "Already done by @lead1.");
  assert.equal(await why(as("lead1", "predictionSettle", { runId: p1.runId, action: "confirm" })), "notCaptain");
  await as("hand1", "predictionSettle", { runId: p1.runId, action: "reject" });
  assert.equal((await get(`${R(p1.runId)}/staff/p`)).proposal, null);
  await as("lead1", "predictionPropose", { runId: p1.runId, answer: 0 });
  await as("hand1", "predictionSettle", { runId: p1.runId, action: "confirm" });
  run = await get(R(p1.runId));
  assert.equal(run.state, "ended"); assert.equal(run.result.answer, 0); assert.equal(run.display.correct, 0);
  assert.equal((await ledger(`chatGames:${p1.runId}:win:m1`)).amount, 10, "ref {runId}:win");
  assert.equal(await ledger(`chatGames:${p1.runId}:win:m2`), undefined);
  assert.equal(await ledger(`chatGames:${p1.runId}:win:lead1`), undefined, "no game XP on duty");
  assert.deepEqual((await get(`${S}/public/live`)).chatGameWaiting, []);
  assert.equal((await get(`${S}/public/live`)).chatGame.runId, w2.runId, "the running game keeps the slot");
  assert.deepEqual((await get(`${S}/public/live`)).chatGameSettled, { runId: p1.runId, title: "Does Boomer die before the save room?", answer: "Yes", count: 3, at: clock }, "the result chip: answer and how many got it");
  assert.equal(LL.buildPublicLive({ stream: { id: "s", state: "live", beats: {} }, chatGameSettled: { runId: "r", answer: "Yes", count: 2, at: 1000 }, nowMs: 16001 }).chatGameSettled, null, "gone after 15 s");
  assert.equal(LL.buildPublicLive({ stream: { id: "s", state: "live", beats: {} }, chatGameSettled: { runId: "r", answer: "Yes", count: 2, at: 1000 }, nowMs: 15000 }).chatGameSettled.count, 2);
  // correct once: the first winners' +10 reversed, the new winners paid; then final
  const m1xp = (await get(`${S}/profiles/m1`)).xp, m1earned = (await get(`${S}/streams/s5/presence/m1`)).xpEarned;
  await as("hand1", "predictionSettle", { runId: p1.runId, action: "correct", answer: 1 });
  const rev = await ledger(`chatGames:${p1.runId}:win_rev:m1`);
  assert.equal(rev.amount, -10); assert.equal(rev.kind, "xp-reverse"); assert.equal(rev.reverses, `chatGames:${p1.runId}:win:m1`);
  assert.equal((await get(`${S}/profiles/m1`)).xp, m1xp - 10, "the profile total goes down");
  assert.equal((await get(`${S}/streams/s5/presence/m1`)).xpEarned, m1earned - 10, "and the stream's XP counter");
  assert.equal((await ledger(`chatGames:${p1.runId}:win2:m2`)).amount, 10, "ref {runId}:win2");
  assert.ok(await ledger(`chatGames:${p1.runId}:lock:m1`), "lock XP stays");
  const RG = require("../lib/rewards/grant").makeGrant({ db: wdb });
  assert.equal((await RG.reverseXp("m1", { feature: "chatGames", ref: `${p1.runId}:win_rev`, of: `${p1.runId}:win` })).reason, "done", "a retried reversal does nothing");
  assert.equal((await RG.reverseXp("m4", { feature: "chatGames", ref: `${p1.runId}:win_rev`, of: `${p1.runId}:win` })).reason, "notPaid", "nothing paid, nothing taken");
  assert.equal((await get(`${S}/profiles/m1`)).xp, m1xp - 10);
  assert.equal(await why(as("hand1", "predictionSettle", { runId: p1.runId, action: "correct", answer: 2 })), "corrected", "a second correction is refused");
  const run1 = await get(R(p1.runId));
  assert.equal(run1.result.answer, 1); assert.equal(run1.result.was, 0); assert.equal(run1.corrected, true);
  await as("hand1", "chatGameEnd", { runId: w2.runId });

  // ---------- the waiting cap: three wait, a 4th Lock is refused, an automatic lock keeps the slot ----------
  const startP = async (t) => (await as("hand1", "chatGameStart", { formatId: "predictions", options: { source: "typed", prompt: { text: t, options: ["Yes", "No"] } } })).runId;
  const pA = await startP("Will the chainsaw guy come back?");
  await as("m2", "chatGamePlay", { runId: pA, action: "vote", choice: 1 });
  clock += 181000; await cg.sweep({ id: "s5" });
  assert.equal((await get(R(pA))).state, "locked", "auto-lock at 3 minutes");
  assert.ok(await ledger(`chatGames:${pA}:lock:m2`));
  const pB = await startP("Two?"); await as("hand1", "chatGameControl", { runId: pB, action: "lock" });
  const pC = await startP("Three?"); await as("hand1", "chatGameControl", { runId: pC, action: "lock" });
  assert.equal((await get(`${S}/streams/s5/private/control`)).chatGameWaiting.length, 3);
  const pD = await startP("Four?");
  await as("m1", "chatGamePlay", { runId: pD, action: "vote", choice: 0 });
  assert.equal(await msg(as("hand1", "chatGameControl", { runId: pD, action: "lock" })), "3 Predictions are already waiting. Settle one first.");
  clock += 181000; await cg.sweep({ id: "s5" });
  assert.equal((await get(R(pD))).state, "locked");
  assert.equal((await get(`${S}/public/live`)).chatGame.runId, pD, "an automatic lock with 3 waiting keeps the slot");
  // direct settle (slot busy: ends), void (lock XP stays), settle the slot holder (its result goes on stream)
  await as("hand1", "predictionSettle", { runId: pB, action: "settle", answer: 0 });
  assert.equal((await get(R(pB))).state, "ended");
  await as("hand1", "predictionSettle", { runId: pA, action: "void" });
  assert.equal((await get(R(pA))).state, "void");
  assert.ok(await ledger(`chatGames:${pA}:lock:m2`), "void keeps the lock XP");
  assert.equal(await ledger(`chatGames:${pA}:win:m2`), undefined, "and pays no +10");
  assert.deepEqual((await get(`${S}/streams/s5/private/control`)).chatGameWaiting.map((x) => x.runId), [pC]);
  await as("hand1", "predictionSettle", { runId: pD, action: "settle", answer: 0 });
  assert.equal((await get(R(pD))).state, "revealed");
  assert.equal((await get(`${S}/public/live`)).chatGame.state, "revealed", "the result is on stream");
  assert.ok(await ledger(`chatGames:${pD}:win:m1`));
  const w3 = await as("hand1", "chatGameStart", { formatId: "would-you-rather", options: { source: "typed", prompt: { options: ["X", "Y"] } } });
  assert.equal((await get(R(pD))).state, "ended", "a shown result ends when the next game starts");
  // Stop: the unsettled one is voided, the waiting list cleared
  await ctx.chatGames.closeOut("s5");
  assert.equal((await get(R(pC))).state, "void");
  assert.equal((await get(R(w3.runId))).state, "void");
  assert.equal((await get(R(pD))).state, "ended", "a settled result stays");
  assert.deepEqual((await get(`${S}/streams/s5/private/control`)).chatGameWaiting, []);
  assert.equal((await get(`${S}/streams/s5/private/control`)).chatGameSettled, null, "Stop clears the result chip");
  assert.ok(fns.predictionPropose && fns.predictionSettle);
  // the cue sample script (part 7) runs on staging only
  const { stagingOnly } = require("./cue-sample");
  assert.throws(() => stagingOnly("boomertanger-prod", "production"), /staging only/);
  assert.throws(() => stagingOnly("boomertanger-prod", "boomertanger-prod"), /staging only/);
  assert.throws(() => stagingOnly("some-other-project", "x"), /staging only/);
  assert.doesNotThrow(() => stagingOnly("boomertanger-staging", "staging"));
  await as("boss", "chatGameFormatSet", { formatId: "would-you-rather", enabled: false });
  await as("boss", "chatGameFormatSet", { formatId: "predictions", enabled: false });
}

async function hotSeatPart() {
  const HL = require("../lib/chatGames/hlogic");
  const R = (id) => `${B}/runs/${id}`;
  // ---------- pure rules ----------
  const seats = HL.pickSeats([{ uid: "a" }, { uid: "a" }, { uid: "b" }, { uid: "c" }, { uid: "d" }], 3, () => 0.4);
  assert.equal(seats.length, 3); assert.equal(new Set(seats.map((s) => s.uid)).size, 3, "never the same uid twice");
  const ans = [{ id: "a1", uid: "x", text: "X" }, { id: "a2", uid: "y", text: "Y" }, { id: "a3", uid: "z", text: "Z" }];
  let t = HL.tally({ answers: ans, votes: { v1: "a1", v2: "a2", v3: "a1", v4: "a2" } });
  assert.deepEqual(t.rows.map((r) => [r.uid, r.winner, r.xp]), [["x", true, 25], ["y", true, 25], ["z", false, 5]], "every tied player wins 25");
  t = HL.tally({ answers: ans, votes: {} });
  assert.ok(t.noVotes && t.rows.every((r) => r.xp === 5 && !r.winner), "no votes: everyone who answered gets 5, nobody wins");
  t = HL.tally({ answers: ans, votes: { v1: "a3" }, hidden: new Set(["z"]) });
  assert.equal(t.rows.find((r) => r.uid === "z").xp, 0, "a hidden answer is out");
  assert.equal(HL.cleanAnswer("x".repeat(141)).reason, "tooLong");
  assert.equal(HL.cleanAnswer("see www.x.com").reason, "link");

  // ---------- the cast: six members checked in to the current beat, lead1 (a mod) on duty and checked in too ----------
  const DAY = 24 * H;
  await wdb.doc(`${S}/streams/s3`).set({ title: "Night 3", state: "live", published: true, type: "platform", beats: { start: { startedAt: TS(clock - H) } }, actualStart: TS(clock - H), crew: {} });
  await wdb.doc(`${S}/streams/s3/private/control`).set({});
  await wdb.doc(`${S}/streams/s3/private/duty`).set({ streamId: "s3", state: "live", captainNow: { uid: "cap", handle: "cap" }, onDuty: { cap: { roles: [{ role: "captain", room: null }] }, lead1: { roles: [{ role: "lead", room: "twitch" }] } } });
  const players = ["p1", "p2", "p3", "p4", "p5"];
  for (const u of [...players, "p6", "late"]) { await wdb.doc(`${S}/profiles/${u}`).set({ handle: u, xp: 0 }); await wdb.doc(`${S}/members/${u}`).set({ roles: [] }); await wdb.doc(`users/${u}`).set({ signedUpAt: TS(clock - 40 * DAY) }); }
  const checkIn = (u) => wdb.doc(`${S}/streams/s3/presence/${u}`).set({ uid: u, beats: { start: { room: "twitch", at: TS(clock) } } });
  for (const u of players) await checkIn(u);
  const pk = await as("boss", "chatGamePackSave", { op: "create", formatId: "hot-seat", title: "Night pack" });
  const cards = [];
  for (const t2 of ["Worst place to hide?", "Worst roommate villain?", "Nightmare in five words?", "Rename the village.", "Haunted hotel name?", "Sound that makes you leave?"]) cards.push((await as("boss", "chatGamePackSave", { op: "addCard", packId: pk.packId, card: { text: t2 } })).cardId);
  await as("boss", "chatGameFormatSet", { formatId: "hot-seat", enabled: true });
  assert.equal(await why(as("p1", "chatGameVolunteer", {})), "notRunning", "Put me in only while Hot Seat runs");

  // ---------- start: round 1 draws 3 from the pool, marks the card used ----------
  const st = await as("cap", "chatGameStart", { formatId: "hot-seat", streamId: "s3", options: { packId: pk.packId, rounds: 2, picker: "seance", cardId: cards[0] } });
  let run = await get(R(st.runId));
  assert.equal(run.phase, "accept"); assert.equal(run.round, 1); assert.equal(run.rounds, 2); assert.equal(run.picker, "seance");
  let r1 = await get(`${R(st.runId)}/rounds/1`);
  assert.equal(r1.card, "Worst place to hide?"); assert.equal(r1.seats.length, 3);
  assert.ok(r1.seats.every((s) => players.includes(s.uid)));
  assert.ok((await get(`${B}/packs/${pk.packId}`)).cards.find((c) => c.id === cards[0]).usedOn.some((u) => u.streamId === "s3"), "the card is marked used with the stream id");
  assert.equal((await get(`${S}/public/live`)).chatGame.formatId, "hot-seat");
  assert.equal(tasks[tasks.length - 1].delay, 15, "15 s to accept");
  await as("p5", "chatGameVolunteer", {}).catch(() => {});
  // accept: two tap I'm in, the third doesn't
  const [s1, s2, s3] = r1.seats.map((s) => s.uid);
  assert.equal(await why(as(players.find((u) => ![s1, s2, s3].includes(u)), "chatGamePlay", { runId: st.runId, action: "accept" })), "notPicked");
  await as(s1, "chatGamePlay", { runId: st.runId, action: "accept" });
  await as(s2, "chatGamePlay", { runId: st.runId, action: "accept" });
  assert.equal(await msg(as(s1, "chatGamePlay", { runId: st.runId, action: "accept" })), "Already done.");
  clock += 16000;
  await cg.sweep({ id: "s3" });
  r1 = await get(`${R(st.runId)}/rounds/1`);
  const replaced = r1.seats.find((s) => s.uid === s3);
  assert.equal(replaced.status, "replaced", "no tap: replaced by a new draw");
  const fresh = r1.seats.find((s) => s.status === "picked");
  assert.ok(fresh && ![s1, s2, s3].includes(fresh.uid), "a new player from the pool");
  let picked = (await get(`${B}/hotSeatPicked/s3`)).uids;
  assert.ok(!picked.includes(s3) && picked.includes(fresh.uid), "anyone replaced can be drawn again; nobody twice");
  await as(fresh.uid, "chatGamePlay", { runId: st.runId, action: "accept" });
  run = await get(R(st.runId));
  assert.equal(run.phase, "answer", "everyone in: answers open at once");
  const P3 = [s1, s2, fresh.uid];

  // ---------- answers: 140 characters, through the filter, kept secret ----------
  assert.equal(await why(as(P3[0], "chatGamePlay", { runId: st.runId, action: "answer", text: "x".repeat(141) })), "tooLong");
  assert.equal(await why(as(s3, "chatGamePlay", { runId: st.runId, action: "answer", text: "Me too!" })), "notPlaying");
  await as(P3[0], "chatGamePlay", { runId: st.runId, action: "answer", text: "Under the bed." });
  await as(P3[1], "chatGamePlay", { runId: st.runId, action: "answer", text: "In plain sight." });
  assert.equal((await get(`${R(st.runId)}/secret/r1`)).answers[P3[0]], "Under the bed.");
  assert.equal((await get(`${R(st.runId)}/rounds/1`)).answers, undefined, "no answers in the public round before the vote");
  await as(P3[2], "chatGamePlay", { runId: st.runId, action: "answer", text: "The monster's group chat." });
  run = await get(R(st.runId));
  assert.equal(run.phase, "vote", "all answered: the vote opens");
  r1 = await get(`${R(st.runId)}/rounds/1`);
  assert.equal(r1.answers.length, 3); assert.ok(r1.answers.every((a) => Object.keys(a).sort().join() === "id,text"), "answers without names");
  assert.ok(run.display.answers.every((a) => !a.handle), "the stream view gets no names before the reveal");
  // a mod on duty hides one before the reveal: out, no XP, recorded in staff
  assert.equal(await why(as("fan", "chatGameModerate", { runId: st.runId, uid: P3[2] })), "notModerator");
  await as("lead1", "chatGameModerate", { runId: st.runId, uid: P3[2] });
  assert.ok((await get(`${R(st.runId)}/staff/r1`)).hidden[P3[2]]);
  r1 = await get(`${R(st.runId)}/rounds/1`);
  assert.equal(r1.answers.length, 2, "a hidden answer leaves the vote");
  assert.ok(!(await get(R(st.runId))).display.answers.some((a) => a.text === "The monster's group chat."), "and never reaches the stream view");
  assert.ok((await docs("adminLog")).some((e) => e.feature === "chatGames" && e.action === "hotSeat:hide"));
  // votes: once, never your own, checked in to the beat (players vote too)
  const sec = await get(`${R(st.runId)}/secret/r1`);
  const idOf = (uid) => Object.keys(sec.idMap).find((k) => sec.idMap[k] === uid);
  assert.equal((await get(`${R(st.runId)}/plays/${P3[0]}`)).r[1].answerId, idOf(P3[0]), "each player's play doc names their own answer");
  assert.equal(await why(as(P3[0], "chatGamePlay", { runId: st.runId, action: "vote", answerId: idOf(P3[0]) })), "ownAnswer");
  assert.equal(await why(as("late", "chatGamePlay", { runId: st.runId, action: "vote", answerId: idOf(P3[0]) })), "notCheckedIn");
  const others = players.filter((u) => !P3.includes(u));
  await as(P3[0], "chatGamePlay", { runId: st.runId, action: "vote", answerId: idOf(P3[1]) });
  await as(P3[1], "chatGamePlay", { runId: st.runId, action: "vote", answerId: idOf(P3[0]) });
  await as(others[0], "chatGamePlay", { runId: st.runId, action: "vote", answerId: idOf(P3[0]) });
  await as(others[1], "chatGamePlay", { runId: st.runId, action: "vote", answerId: idOf(P3[1]) });
  assert.equal(await msg(as(others[1], "chatGamePlay", { runId: st.runId, action: "vote", answerId: idOf(P3[0]) })), "Already done.");
  clock += 31000;
  await cg.sweep({ id: "s3" });
  run = await get(R(st.runId));
  assert.equal(run.state, "revealed"); assert.equal(run.phase, "reveal");
  r1 = await get(`${R(st.runId)}/rounds/1`);
  const res = Object.fromEntries(r1.results.map((x) => [x.uid, x]));
  assert.equal(res[P3[0]].winner, true); assert.equal(res[P3[1]].winner, true, "a 2-2 tie: both win");
  assert.equal(res[P3[0]].xpPaid, 25); assert.equal(res[P3[2]].xpPaid, 0); assert.equal(res[P3[2]].hidden, true);
  assert.ok(await get(`${S}/rewardLedger/chatGames:${st.runId}:1:${P3[0]}`), "ledger chatGames:{runId}:{round}:{uid}");
  assert.equal((await get(`${S}/streams/s3/presence/${P3[0]}`)).xpEarned, 25);
  assert.ok((await docs("activityLog")).some((e) => e.type === "chat-game-won" && e.feature === "chatGames"));
  assert.ok(run.display.answers.every((a) => a.handle), "names at the reveal");

  // ---------- round 2: only lead1 (a mod on duty) and p6 can play: it runs with 2; nobody votes ----------
  for (const u of players) await wdb.doc(`${S}/streams/s3/presence/${u}`).delete();
  await wdb.doc(`${S}/streams/s3/presence/lead1`).set({ uid: "lead1", beats: { start: { room: "twitch", at: TS(clock) } } });
  await wdb.doc(`${S}/streams/s3/presence/p6`).set({ uid: "p6", beats: { start: { room: "twitch", at: TS(clock) } }, xpEarned: 98 });
  for (const d of (await docs(`${B}/volunteers`))) await wdb.doc(`${B}/volunteers/${d.id}`).delete();
  await as("cap", "chatGameControl", { runId: st.runId, action: "picker", data: { picker: "wheel" } });
  await as("cap", "chatGameControl", { runId: st.runId, action: "nextRound" });
  run = await get(R(st.runId));
  assert.equal(run.state, "open"); assert.equal(run.round, 2); assert.equal(run.picker, "wheel", "the picker switch applies to the next round");
  const r2 = await get(`${R(st.runId)}/rounds/2`);
  assert.deepEqual(r2.seats.map((s) => s.uid).sort(), ["lead1", "p6"], "the pool ran dry: the round runs with 2");
  assert.notEqual(r2.cardId, cards[0]);
  await as("lead1", "chatGamePlay", { runId: st.runId, action: "accept" });
  await as("p6", "chatGamePlay", { runId: st.runId, action: "accept" });
  assert.equal((await get(R(st.runId))).phase, "answer");
  // Pause adds the paused time to the deadline
  const before = (await get(R(st.runId))).closesAt.toMillis();
  clock += 10000;
  await as("cap", "chatGameControl", { runId: st.runId, action: "pause" });
  assert.equal((await get(R(st.runId))).closesAt, null);
  clock += 120000;
  assert.equal((await cg.sweep({ id: "s3" })).closed, 0, "paused: no deadline");
  assert.equal(await why(as("p6", "chatGamePlay", { runId: st.runId, action: "answer", text: "x" })), "paused");
  await as("cap", "chatGameControl", { runId: st.runId, action: "resume" });
  assert.equal((await get(R(st.runId))).closesAt.toMillis(), before + 120000, "the 2 paused minutes are added");
  await as("lead1", "chatGamePlay", { runId: st.runId, action: "answer", text: "A crew answer." });
  await as("p6", "chatGamePlay", { runId: st.runId, action: "answer", text: "A member answer." });
  clock += 31000;
  await cg.sweep({ id: "s3" });
  const rr2 = Object.fromEntries((await get(`${R(st.runId)}/rounds/2`)).results.map((x) => [x.uid, x]));
  assert.equal(rr2.lead1.crew, true); assert.equal(rr2.lead1.xpPaid, 0, "a mod clocked in earns no game XP");
  assert.equal((await get(`${R(st.runId)}/plays/p6`)).r[1], undefined, "plays are kept per round");
  assert.equal((await get(`${R(st.runId)}/plays/p6`)).r[2].result.xp, 2);
  assert.equal(rr2.p6.winner, false); assert.equal(rr2.p6.xpPaid, 2); assert.equal(rr2.p6.capped, true, "no votes: 5 each, capped at 100");
  await as("cap", "chatGameControl", { runId: st.runId, action: "nextRound" });
  assert.equal((await get(R(st.runId))).state, "ended", "after the last round, Next round ends it");

  // ---------- a void round: fewer than 2 even after the 30 s wait ----------
  await wdb.doc(`${S}/streams/s3/presence/p6`).delete();
  const v = await as("cap", "chatGameStart", { formatId: "hot-seat", streamId: "s3", options: { packId: pk.packId, rounds: 2 } });
  run = await get(R(v.runId));
  assert.equal(run.phase, "waiting", "fewer than 2: the first round waits 30 s for volunteers");
  assert.equal(tasks[tasks.length - 1].delay, 30);
  clock += 31000;
  await cg.sweep({ id: "s3" });
  run = await get(R(v.runId));
  assert.equal((await get(`${R(v.runId)}/rounds/1`)).phase, "void");
  assert.equal((await get(`${R(v.runId)}/rounds/2`)).phase, "void", "the next card is void too");
  assert.equal(run.state, "ended", "no rounds left");
  await as("boss", "chatGameFormatSet", { formatId: "hot-seat", enabled: false });
  assert.ok(fns.chatGamePlay && fns.chatGameModerate && fns.chatGameVolunteer);
}

async function packsPart() {
  const PL = require("../lib/chatGames/plogic");
  const PB = `${B}/packs`;
  const DAY = 24 * H;
  // ---------- card limits per format ----------
  assert.equal(PL.cardShape("hot-seat", { text: "x".repeat(140) }).ok, true);
  assert.equal(PL.cardShape("hot-seat", { text: "x".repeat(141) }).reason, "tooLong");
  assert.equal(PL.cardShape("hot-seat", { text: "see https://x.y" }).reason, "link");
  assert.equal(PL.cardShape("hot-seat", { text: "bad" }, { isProfane: () => true }).reason, "blocked");
  assert.deepEqual(PL.cardShape("would-you-rather", { text: "", options: ["Hide in a locker", "Crawl a vent"] }).card, { text: "Would you rather…", options: ["Hide in a locker", "Crawl a vent"] });
  assert.equal(PL.cardShape("would-you-rather", { options: ["a", "b", "c"] }).reason, "options");
  assert.equal(PL.cardShape("would-you-rather", { options: ["a", "y".repeat(81)] }).reason, "tooLong");
  assert.equal(PL.cardShape("would-you-rather", { options: ["Same", "same"] }).reason, "duplicate");
  assert.equal(PL.cardShape("predictions", { text: "Shotgun first?", options: ["Yes"] }).reason, "options");
  assert.equal(PL.cardShape("predictions", { text: "Shotgun first?", options: ["1", "2", "3", "4", "5"] }).reason, "options");
  assert.equal(PL.cardShape("predictions", { text: "q".repeat(121), options: ["Yes", "No"] }).reason, "tooLong");
  assert.equal(PL.cardShape("predictions", { text: "Tries for the boss?", options: ["1", "2-3", "z".repeat(41)] }).reason, "tooLong");
  assert.equal(PL.cardShape("predictions", { text: "", options: ["Yes", "No"] }).reason, "empty");
  assert.equal(PL.cardShape("questions", { text: "x" }).reason, "badFormat");
  // ---------- the draw: cards used in the last 30 days are skipped unless none are left ----------
  const pk = { cards: [{ id: "a", usedOn: [{ at: clock - 2 * DAY }] }, { id: "b", usedOn: [] }, { id: "c", usedOn: [{ at: clock - 40 * DAY }] }] };
  const seen = new Set(); for (const r of [0, 0.3, 0.6, 0.99]) seen.add(PL.drawCard(pk, { nowMs: clock, rng: () => r }).id);
  assert.deepEqual([...seen].sort(), ["b", "c"], "the one used 2 days ago is skipped");
  assert.equal(PL.drawCard(pk, { nowMs: clock, skip: ["b", "c"] }).id, "a", "none left: the recent one after all");
  const all = { cards: [{ id: "x", usedOn: [{ at: clock - 5 * DAY }] }, { id: "y", usedOn: [{ at: clock - 9 * DAY }] }] };
  assert.equal(PL.drawCard(all, { nowMs: clock }).id, "y", "all recent: the one used longest ago");
  assert.equal(PL.drawCard({ cards: [] }, { nowMs: clock }), null);

  // ---------- permissions by grade ----------
  // the cast from part 1: boss owner, adm2 admin, cap Watcher (grade 2), lead1 Warden (grade 3), hand1 Initiate (grade 1), fan member
  assert.equal(await why(as("hand1", "chatGamePackSave", { op: "create", formatId: "hot-seat", title: "Outlast night" })), "notWarden");
  assert.equal(await why(as("cap", "chatGamePackSave", { op: "create", formatId: "hot-seat", title: "Outlast night" })), "notWarden", "a Watcher suggests; Wardens write packs");
  assert.equal(await why(as("fan", "chatGamePackSave", { op: "create", formatId: "hot-seat", title: "Outlast night" })), "notWarden");
  const draft = await as("lead1", "chatGamePackSave", { op: "create", formatId: "hot-seat", title: "Outlast night", vaultGameIds: ["outlast"] });
  assert.equal(draft.status, "draft", "a Warden's pack is a draft");
  const gen = await as("boss", "chatGamePackSave", { op: "create", formatId: "hot-seat", title: "General" });
  assert.equal(gen.status, "approved", "the owner's pack is approved on save");
  assert.equal(await why(as("boss", "chatGamePackSave", { op: "create", formatId: "questions", title: "Nope" })), "bad-input");
  const c1 = await as("lead1", "chatGamePackSave", { op: "addCard", packId: draft.packId, card: { text: "What's on the night-vision camera you wish you hadn't seen?" } });
  assert.ok(c1.cardId);
  assert.equal(await why(as("lead1", "chatGamePackSave", { op: "addCard", packId: gen.packId, card: { text: "Not mine to add" } })), "notAllowed", "Wardens edit drafts only");
  assert.equal(await why(as("lead1", "chatGamePackSave", { op: "approve", packId: draft.packId })), "notOwner");
  await as("boss", "chatGamePackSave", { op: "approve", packId: draft.packId });
  assert.equal((await get(`${PB}/${draft.packId}`)).status, "approved");
  assert.equal(await why(as("lead1", "chatGamePackSave", { op: "editCard", packId: draft.packId, cardId: c1.cardId, card: { text: "Edit after approval" } })), "notAllowed");
  const g1 = await as("boss", "chatGamePackSave", { op: "addCard", packId: gen.packId, card: { text: "What is the worst place to hide from a monster?" } });
  const g2 = await as("boss", "chatGamePackSave", { op: "addCard", packId: gen.packId, card: { text: "Which horror villain would be the worst roommate?" } });
  assert.equal(await why(as("boss", "chatGamePackSave", { op: "addCard", packId: gen.packId, card: { text: "x".repeat(141) } })), "tooLong");

  // ---------- suggestions and the 2 Gears ----------
  assert.equal(await why(as("hand1", "chatGameCardSuggest", { packId: gen.packId, card: { text: "An Initiate's idea" } })), "notWatcher");
  const s1 = await as("cap", "chatGameCardSuggest", { packId: gen.packId, card: { text: "What would a ghost complain about on a review site?" } });
  const s2 = await as("lead1", "chatGameCardSuggest", { packId: gen.packId, card: { text: "Give the final boss a terrible day job." } });
  const wyr = await as("boss", "chatGamePackSave", { op: "create", formatId: "would-you-rather", title: "Classics" });
  assert.equal(await why(as("cap", "chatGameCardSuggest", { packId: wyr.packId, card: { options: ["one", "two", "three"] } })), "options");
  const pred = await as("boss", "chatGamePackSave", { op: "create", formatId: "predictions", title: "Resident Evil 4" });
  assert.equal(await why(as("cap", "chatGameCardSuggest", { packId: pred.packId, card: { text: "Lake boss tries?", options: ["1", "2", "3", "4", "5"] } })), "options");
  const draft2 = await as("lead1", "chatGamePackSave", { op: "create", formatId: "hot-seat", title: "Draft only" });
  assert.equal(await why(as("cap", "chatGameCardSuggest", { packId: draft2.packId, card: { text: "Into a draft?" } })), "notApproved");
  assert.equal(await why(as("lead1", "chatGameCardDecide", { packId: gen.packId, suggestionId: s1.suggestionId, action: "approve" })), "notOwner");
  const ap = await as("boss", "chatGameCardDecide", { packId: gen.packId, suggestionId: s1.suggestionId, action: "approve", card: { text: "What would a ghost write in a one-star review?" } });
  assert.equal(ap.status, "approved"); assert.equal(ap.gears, 2);
  const gl = await get(`${S}/crew/main/gears/cardSuggest:${ap.cardId}:cap`);
  assert.equal(gl.amount, 2, "keyed cardSuggest:{cardId}:{uid}"); assert.equal(gl.source, "cardSuggest");
  const gp = await get(`${PB}/${gen.packId}`);
  assert.equal(gp.cards.find((c) => c.id === ap.cardId).text, "What would a ghost write in a one-star review?", "Edit then approve");
  assert.equal((await get(`${PB}/${gen.packId}/suggested/${s1.suggestionId}`)).status, "approved");
  assert.equal(await msg(as("boss", "chatGameCardDecide", { packId: gen.packId, suggestionId: s1.suggestionId, action: "approve" })), "Already done.");
  await as("boss", "chatGameCardDecide", { packId: gen.packId, suggestionId: s2.suggestionId, action: "reject", reason: "Too close to one we have" });
  const rj = await get(`${PB}/${gen.packId}/suggested/${s2.suggestionId}`);
  assert.equal(rj.status, "rejected"); assert.equal(rj.reason, "Too close to one we have");
  assert.ok((await docs("adminLog")).some((e) => e.feature === "chatGames" && e.action === "card:approve"));

  // ---------- deleting: owner only, never a used card; used cards can be edited ----------
  assert.equal(await why(as("lead1", "chatGamePackSave", { op: "deleteCard", packId: gen.packId, cardId: g2.cardId })), "notAllowed");
  await cg.markUsed(gen.packId, g1.cardId, "s2");
  assert.equal((await get(`${PB}/${gen.packId}`)).cards.find((c) => c.id === g1.cardId).usedOn[0].streamId, "s2");
  assert.equal(await why(as("boss", "chatGamePackSave", { op: "deleteCard", packId: gen.packId, cardId: g1.cardId })), "usedCard");
  await as("boss", "chatGamePackSave", { op: "editCard", packId: gen.packId, cardId: g1.cardId, card: { text: "What is the WORST place to hide from a monster?" } });
  await as("boss", "chatGamePackSave", { op: "deleteCard", packId: gen.packId, cardId: g2.cardId });
  assert.equal((await get(`${PB}/${gen.packId}`)).cards.some((c) => c.id === g2.cardId), false);
  // the draw skips the card used tonight
  for (const r of [0, 0.5, 0.99]) assert.notEqual((await cg.draw(gen.packId, { rng: () => r })).card.id, g1.cardId);
  assert.equal(await cg.draw(draft2.packId), null, "drafts are never drawn");
  // retire, never delete
  await as("boss", "chatGamePackSave", { op: "retire", packId: draft2.packId });
  assert.equal((await get(`${PB}/${draft2.packId}`)).status, "retired");
  assert.equal(await why(as("boss", "chatGamePackSave", { op: "delete", packId: draft2.packId })), "bad-input");

  // ---------- format switches (owner only, enabled only) ----------
  assert.equal(await why(as("adm2", "chatGameFormatSet", { formatId: "hot-seat", enabled: true })), "notOwner");
  assert.equal((await as("boss", "chatGameFormatSet", { formatId: "hot-seat", enabled: true })).enabled, true);
  assert.equal((await get(`${B}/formats/hot-seat`)).enabled, true);
  assert.equal(await why(as("boss", "chatGameFormatSet", { formatId: "hot-seat", enabled: "yes" })), "bad-input");
  await as("boss", "chatGameFormatSet", { formatId: "hot-seat", enabled: false });
  assert.ok(fns.chatGamePackSave && fns.chatGameCardSuggest && fns.chatGameCardDecide && fns.chatGameFormatSet);
}

async function questionsPart() {
  const QL = require("../lib/chatGames/qlogic");
  const QB = `${B}/questions`;
  const DAY = 24 * H;
  // ---------- pure rules ----------
  assert.equal(QL.cleanText("  What   scared you most?  ").text, "What scared you most?");
  assert.equal(QL.cleanText("x".repeat(201)).reason, "tooLong");
  assert.equal(QL.cleanText("see www.example.com").reason, "link");
  assert.equal(QL.cleanText("go to https://x.y").reason, "link");
  assert.equal(QL.cleanText("bad words", { isProfane: () => true }).reason, "blocked");
  assert.equal(QL.cleanText("   ").reason, "empty");
  assert.equal(QL.isHeld({ signedUpAtMs: clock - 2 * DAY, nowMs: clock }), true);
  assert.equal(QL.isHeld({ signedUpAtMs: clock - 2 * DAY, staff: true, nowMs: clock }), false);
  assert.equal(QL.isHeld({ signedUpAtMs: clock - 8 * DAY, nowMs: clock }), false);
  const order = QL.queue([
    { id: "s1", status: "standing", votes: 50, createdAtMs: 1 }, { id: "t1", status: "tonight", votes: 3, createdAtMs: 5 },
    { id: "t2", status: "tonight", votes: 9, createdAtMs: 9 }, { id: "t3", status: "tonight", votes: 9, createdAtMs: 2 }, { id: "h", status: "held", votes: 99 },
  ]);
  assert.deepEqual(order.map((q) => q.id), ["t3", "t2", "t1", "s1"], "Tonight by votes, then Standing; ties by oldest; held never");
  assert.deepEqual(QL.queue(order, { skipped: ["t3"], pinned: "s1" }).map((q) => q.id), ["s1", "t2", "t1"]);
  assert.deepEqual(QL.mergeVoters(["a", "b", "z"], ["b", "c"], "z", "y"), { gain: ["a", "y"], total: 4 }, "each voter once; never the target's asker");
  assert.equal(QL.canMerge({ id: "a", status: "tonight" }, { id: "b", status: "merged" }).reason, "targetMerged");
  assert.equal(QL.canMerge({ id: "a", status: "tonight" }, { id: "b", status: "answered" }).reason, "targetAnswered");
  assert.deepEqual(QL.settleAtStop({ votes: 5 }), { status: "standing" });
  assert.deepEqual(QL.settleAtStop({ votes: 4 }), { status: "cleared" });

  // ---------- the cast and a live stream ----------
  const member = async (uid, daysOld) => { await wdb.doc(`${S}/profiles/${uid}`).set({ handle: uid, xp: 0 }); await wdb.doc(`${S}/members/${uid}`).set({ roles: [] }); await wdb.doc(`users/${uid}`).set({ signedUpAt: TS(clock - daysOld * DAY) }); };
  for (const [u, d] of [["fan1", 40], ["fan2", 40], ["fan3", 40], ["fan4", 40], ["newbie", 2]]) await member(u, d);
  await wdb.doc("users/lead1").set({ signedUpAt: TS(clock - 90 * DAY) });
  await wdb.doc(`${S}/streams/s2`).set({ title: "Night 2", state: "live", published: true, type: "platform", beats: { start: { startedAt: TS(clock - H) } }, actualStart: TS(clock - H), crew: {} });
  await wdb.doc(`${S}/streams/s2/private/control`).set({});
  await wdb.doc(`${S}/streams/s2/private/duty`).set({ streamId: "s2", state: "live", captainNow: { uid: "cap", handle: "cap" }, onDuty: { cap: { roles: [{ role: "captain", room: null }] }, lead1: { roles: [{ role: "lead", room: "twitch" }] } } });
  const ask = (uid, text) => as(uid, "questionAsk", { text });

  // ---------- asking: limits, the hold, the lane ----------
  assert.equal(await why(ask(null, "hi?")), "signedOut");
  const a1 = await ask("fan1", "What game made you quit for the night?");
  assert.equal(a1.status, "tonight", "while live: Tonight");
  const a2 = await ask("fan1", "Second question?"); const a3 = await ask("fan1", "Third question?");
  assert.equal(await why(ask("fan1", "Fourth?")), "limit", "3 open across both lanes");
  assert.equal(await why(ask("fan2", "check www.spam.com")), "link");
  const held = await ask("newbie", "is the tracker beeping ever not stressful");
  assert.equal(held.status, "held", "accounts under 7 days are held");
  const crewQ = await ask("lead1", "Crew question?");
  assert.equal(crewQ.status, "tonight", "crew are never held");
  // withdraw frees a slot
  await as("fan1", "questionWithdraw", { questionId: a3.questionId });
  assert.equal((await get(`${QB}/${a3.questionId}`)).status, "withdrawn");
  assert.equal(await why(as("fan2", "questionWithdraw", { questionId: crewQ.questionId })), "gone", "only the asker");
  const a4 = await ask("fan1", "Best ending in a horror game?");

  // ---------- votes: the trigger keeps the count ----------
  const snap = (d) => ({ exists: !!d, data: () => d, get: (k) => (d || {})[k] });
  const vote = async (qid, uid, on = true) => {
    const ref = wdb.doc(`${QB}/${qid}/votes/${uid}`);
    if (on) { await ref.set({ at: TS(clock) }); await fns.onQuestionVote.run({ params: { siteId: "boomertanger", qid, uid }, data: { before: snap(null), after: snap({ at: TS(clock) }) } }); }
    else { await ref.delete(); await fns.onQuestionVote.run({ params: { siteId: "boomertanger", qid, uid }, data: { before: snap({ at: TS(clock) }), after: snap(null) } }); }
  };
  const qA = a1.questionId, qB = a2.questionId;
  await vote(qA, "fan2"); await vote(qA, "fan3"); await vote(qA, "fan4"); await vote(qA, "fan4", false); await vote(qA, "fan4");
  assert.equal((await get(`${QB}/${qA}`)).votes, 3);
  await vote(a4.questionId, "fan2"); await vote(a4.questionId, "fan3");
  await vote(crewQ.questionId, "fan2");

  // ---------- moderation ----------
  assert.equal(await why(as("fan2", "questionModerate", { questionId: held.questionId, action: "approve" })), "notModerator");
  assert.equal(await why(as("hand1", "questionModerate", { questionId: held.questionId, action: "approve" })), "notModerator", "a mod who isn't clocked in");
  assert.equal((await as("lead1", "questionModerate", { questionId: held.questionId, action: "approve" })).status, "tonight");
  assert.equal(await msg(as("cap", "questionModerate", { questionId: held.questionId, action: "approve" })), "Already done.");
  assert.ok((await docs("adminLog")).some((e) => e.feature === "chatGames" && e.action === "question:approve"));
  // merge: qB (fan1's, no votes) into qA: the target gains fan1? no: fan1 asked qA too, so nobody new; then a4 into qA: fan2 and fan3 already voted, so the count stays
  const m1 = await as("cap", "questionModerate", { questionId: a4.questionId, action: "merge", targetId: qA });
  assert.equal(m1.votes, 3, "voters counted once (fan2, fan3 already voted; fan1 is the target's own asker)");
  assert.equal((await get(`${QB}/${a4.questionId}`)).status, "merged");
  // merging the crew question (voted by fan2, asked by lead1) adds lead1 only
  const m2 = await as("cap", "questionModerate", { questionId: crewQ.questionId, action: "merge", targetId: qA });
  assert.equal(m2.votes, 4); assert.equal(m2.gained, 1);
  assert.equal((await get(`${QB}/${qA}/votes/lead1`)).fromMerge, true);
  await fns.onQuestionVote.run({ params: { siteId: "boomertanger", qid: qA, uid: "lead1" }, data: { before: snap(null), after: snap({ at: TS(clock), fromMerge: true }) } });
  assert.equal((await get(`${QB}/${qA}`)).votes, 4, "a copied merge vote isn't counted twice");
  assert.equal(await msg(as("cap", "questionModerate", { questionId: qB, action: "merge", targetId: a4.questionId })), "That question was merged itself. Merge into the one it went to.");
  await as("cap", "questionModerate", { questionId: qB, action: "toStanding" });
  assert.equal((await get(`${QB}/${qB}`)).status, "standing");

  // ---------- the session ----------
  await wdb.doc(`${B}/formats/questions`).update({ enabled: true });
  const q2 = await ask("fan2", "Lights fully off for a whole stream?");
  const q3 = await ask("fan3", "Scariest sound design?");
  await vote(q3.questionId, "fan2");
  const run = await as("cap", "chatGameStart", { formatId: "questions", streamId: "s2", options: { minutes: 5 } });
  let r = await get(`${B}/runs/${run.runId}`);
  assert.equal(r.state, "open"); assert.equal(r.options.minutes, 5);
  assert.equal(r.current, qA, "the top Tonight question first (4 votes)");
  assert.equal(r.display.text, "What game made you quit for the night?"); assert.equal(r.display.votes, 4); assert.equal(r.display.next.text, "Scariest sound design?");
  assert.equal((await get(`${S}/public/live`)).chatGame.formatId, "questions");
  assert.equal(tasks[tasks.length - 1].delay, 300);
  // Skip: not shown again this session
  await as("cap", "chatGameControl", { runId: run.runId, action: "skip", data: { questionId: qA } });
  r = await get(`${B}/runs/${run.runId}`);
  assert.equal(r.current, q3.questionId); assert.deepEqual(r.skipped, [qA]); assert.equal(r.round, 2);
  // a second tap on the card that already moved on
  assert.equal(await msg(as("boss", "chatGameControl", { runId: run.runId, action: "skip", data: { questionId: qA } })), "Already done by @cap.");
  // Pin next
  await as("cap", "chatGameControl", { runId: run.runId, action: "pinNext", data: { questionId: qB } });
  assert.equal((await get(`${B}/runs/${run.runId}`)).display.next.text, "Second question?", "the pinned one is next");
  // Answered: 15 XP to the asker, keyed chatGames:q:{id}:{uid}, presence counter set-merged
  await as("cap", "chatGameControl", { runId: run.runId, action: "answered", data: { questionId: q3.questionId } });
  const ans = await get(`${QB}/${q3.questionId}`);
  assert.equal(ans.status, "answered"); assert.equal(ans.xp, 15); assert.equal(ans.answeredOn, "s2");
  assert.ok(await get(`${S}/rewardLedger/chatGames:q:${q3.questionId}:fan3`), "ledger chatGames:q:{questionId}:{uid}");
  assert.equal((await get(`${S}/streams/s2/presence/fan3`)).xpEarned, 15, "the asker never checked in: the counter is created");
  assert.ok((await docs("activityLog")).some((e) => e.type === "question-answered" && e.feature === "chatGames"));
  r = await get(`${B}/runs/${run.runId}`);
  assert.equal(r.current, qB, "the pinned question came up"); assert.equal(r.pinned, null);
  assert.equal(await msg(as("boss", "chatGameControl", { runId: run.runId, action: "answered", data: { questionId: q3.questionId } })), "Already done by @cap.");
  // the cap: fan1 has 95 already tonight, so the answer pays 5
  await wdb.doc(`${S}/streams/s2/presence/fan1`).set({ uid: "fan1", xpEarned: 95 });
  await as("cap", "chatGameControl", { runId: run.runId, action: "answered", data: { questionId: qB } });
  assert.equal((await get(`${QB}/${qB}`)).xp, 5); assert.equal((await get(`${QB}/${qB}`)).capped, true);
  assert.equal((await get(`${S}/streams/s2/presence/fan1`)).xpEarned, 100);
  // a mod clocked in for the stream earns no game XP: lead1's question (approved into Tonight)
  const lq = await ask("lead1", "Crew can ask too?");
  r = await get(`${B}/runs/${run.runId}`);
  if (r.current !== lq.questionId) { await as("cap", "chatGameControl", { runId: run.runId, action: "pinNext", data: { questionId: lq.questionId } }); await as("cap", "chatGameControl", { runId: run.runId, action: "skip", data: { questionId: r.current } }); }
  await as("cap", "chatGameControl", { runId: run.runId, action: "answered", data: { questionId: lq.questionId } });
  assert.equal((await get(`${QB}/${lq.questionId}`)).xp, 0);
  assert.equal(await get(`${S}/rewardLedger/chatGames:q:${lq.questionId}:lead1`), undefined);
  // the timer: the card on screen may finish, then the run ends
  r = await get(`${B}/runs/${run.runId}`);
  if (!r.current) { const extra = await ask("fan4", "One more?"); await as("cap", "chatGameControl", { runId: run.runId, action: "nextRound" }); r = await get(`${B}/runs/${run.runId}`); assert.equal(r.current, extra.questionId); }
  clock += 6 * 60000;
  assert.equal((await cg.sweep({ id: "s2" })).closed, 1);
  r = await get(`${B}/runs/${run.runId}`);
  assert.equal(r.state, "open"); assert.equal(r.ending, true); assert.equal(r.closesAt, null);
  await as("cap", "chatGameControl", { runId: run.runId, action: "skip", data: { questionId: r.current } });
  assert.equal((await get(`${B}/runs/${run.runId}`)).state, "ended");
  assert.equal((await get(`${S}/public/live`)).chatGame, null);
  // an open-ended session with nothing to show ends at once when time is up? (no timer: it never does)
  const run2 = await as("cap", "chatGameStart", { formatId: "questions", streamId: "s2", options: { minutes: 0 } });
  assert.equal((await get(`${B}/runs/${run2.runId}`)).closesAt, null);
  assert.equal(await msg(as("cap", "chatGameControl", { runId: run2.runId, action: "lock" })), "That control isn't part of Questions.");

  // ---------- Stop: Tonight with 5+ votes → Standing; the rest cleared (TTL 30 days) ----------
  const s5 = await ask("fan4", "Five votes?");
  for (const u of ["fan1", "fan2", "fan3", "newbie", "lead1"]) await vote(s5.questionId, u);
  const s0 = await ask("fan2", "Zero votes?");
  await ctx.chatGames.closeOut("s2");
  assert.equal((await get(`${QB}/${s5.questionId}`)).status, "standing");
  const cl = await get(`${QB}/${s0.questionId}`);
  assert.equal(cl.status, "cleared"); assert.equal(cl.expireAt.toMillis(), clock + 30 * DAY);
  assert.equal((await get(`${B}/runs/${run2.runId}`)).state, "void");
  // off air: Standing, and admins moderate held questions
  await wdb.doc(`${S}/streams/s2`).update({ state: "ended" });
  const off = await ask("fan3", "Asked off air?");
  assert.equal(off.status, "standing");
  const offHeld = await ask("newbie", "Held off air?");
  assert.equal((await as("adm2", "questionModerate", { questionId: offHeld.questionId, action: "approve" })).status, "standing");

  // ---------- the daily archive ----------
  await wdb.doc(`${QB}/${s5.questionId}`).update({ standingSince: TS(clock - 31 * DAY) });
  assert.equal((await cg.ops.archive()).archived, 1);
  assert.equal((await get(`${QB}/${s5.questionId}`)).status, "archived");
  assert.equal((await get(`${QB}/${off.questionId}`)).status, "standing", "not yet 30 days");
  assert.ok(fns.questionArchive && fns.onQuestionVote && fns.questionAsk && fns.questionModerate && fns.questionWithdraw);
}

main().catch((e) => { console.error(e); process.exit(1); });
