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

  // ================= Questions (part 2) =================
  await questionsPart();

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
  console.log("check-chat-games: ok");
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
