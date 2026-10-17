#!/usr/bin/env node
// functions/scripts/check-prize-draw.js: the Prize Box live draw (lib/prizeBox/draw.js, docs/specs/prize-box.md §4) built inside lib/live, against the
// in-memory Firestore with a fake Cloud Tasks queue and Trophy Room. The pool snapshot from presence, Round 1 groups, Round 2 with Spin again blades,
// the decided spins on the pointer, public/live.prizeDraw with handles only, I'm here, the timeout respin (task and backstop), Respin without them,
// the Chat Game block, one draw at a time, the stream's end voiding a draw and the rerun from its snapshot.   npm run check
const assert = require("assert/strict");
const { makeDb } = require("./fixtures/fake-firestore");
const admin = require("firebase-admin");
process.env.GCLOUD_PROJECT ||= "boomertanger-staging";
process.env.FIREBASE_CONFIG ||= JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const wdb = makeDb(); const realFs = admin.firestore;
const fakeFs = () => wdb; fakeFs.Timestamp = realFs.Timestamp; fakeFs.FieldValue = realFs.FieldValue;
Object.defineProperty(admin, "firestore", { value: fakeFs, configurable: true, writable: true });
const LL = require("../lib/live/logic");
const TS = (m) => realFs.Timestamp.fromMillis(m);
const S = "sites/boomertanger", BASE = `${S}/prizeBox/main`, DAY = 86400000;
let clock = Date.UTC(2026, 9, 17, 2, 0);

const tasks = [], badges = [];
const crypto = require("crypto");
const rigged = [];   // planSpin draws rand(10) pickIndex, rand(601) offset, rand(2) spins, rand(1201) duration; empty = real randomness
const prizeRand = (n) => (rigged.length ? rigged.shift() % n : crypto.randomInt(n));
const fakeGrant = { grantBadge: async (uid, id, o) => { badges.push({ uid, id, ...o }); return { granted: true }; }, grantXp: async () => ({ granted: true }) };
const adminLogEntry = async (_d, f) => ({ ...f, createdAt: realFs.Timestamp.now() });
const live = require("../lib/live").build({ adminLogEntry, now: () => clock, grant: fakeGrant, factory: { recordFactoryEvent: async () => ({ counted: true }) }, prizeEnqueue: async (data, opts) => { tasks.push({ data, opts }); }, prizeRand, enqueue: async () => {}, chatGamesEnqueue: async () => {} });
const pbm = require("../lib/prizeBox").build({ adminLogEntry, now: () => clock, grant: fakeGrant, cloudCreds: () => ({}), cloudSecrets: [], drawTick: () => live.hooks.prizeDraw.tick(), drawMe: (uid) => live.hooks.prizeDraw.me(uid) });
const fns = { ...live.functions, ...pbm.functions };
const as = (uid, fn, data = {}) => fns[fn].run({ auth: uid ? { uid, token: { email_verified: true } } : undefined, data });
const why = async (p) => { try { await p; return "ok"; } catch (e) { return (e.details && e.details.reason) || e.code || e.message; } };
const get = async (p) => (await wdb.doc(p).get()).data();
const pub = async () => (await get(`${S}/public/live`)) || {};
const ctrl = async () => ((await get(`${S}/streams/s1/private/control`)) || {}).prizeDraw;

(async () => {
  // ---------- the cast: the owner, an admin, a mod, crew by grade, a recent winner, and members ----------
  await wdb.doc(S).set({ ownerUid: "boss", timezone: "America/Chicago" });
  const person = async (uid, roles = [], member = {}) => {
    await wdb.doc(`${S}/members/${uid}`).set({ roles, joinedAt: TS(clock - 90 * DAY), ...member });
    await wdb.doc(`${S}/profiles/${uid}`).set({ handle: uid, displayName: uid });
    await wdb.doc(`users/${uid}`).set({ ageBand: "18+" });
  };
  await person("boss", ["admin"]); await person("adm", ["admin"]); await person("mod", ["mod"]); await person("crewbie", [], { crewGrade: 1, crewStatus: "active" });
  const members = ["owl", "hex", "moth", "lantern", "pumpkin", "ghost", "fog"];
  for (const m of members) await person(m);
  await person("recent");
  await wdb.doc(`${BASE}/cooldowns/recent`).set({ until: TS(clock + 10 * DAY) });
  // a live stream with Start done and Break 1 under way; presence: every beat (owl, hex, moth), break 1 only (the rest), crew and on-duty, a drop only
  const beats = { start: { startedAt: TS(clock - 2 * 3600000), endedAt: TS(clock - 3600000), windowOpenedAt: TS(clock - 2 * 3600000), checkins: 0 }, break1: { startedAt: TS(clock - 600000), endedAt: null, windowOpenedAt: TS(clock - 600000), checkins: 0 } };
  await wdb.doc(`${S}/streams/s1`).set({ title: "Sample stream", state: "live", type: "platform", audience: "public", beats, actualStart: TS(clock - 2 * 3600000), segments: [] });
  const pres = (uid, bs, extra = {}) => wdb.doc(`${S}/streams/s1/presence/${uid}`).set({ uid, beats: Object.fromEntries(bs.map((b) => [b, { room: "twitch", at: TS(clock) }])), ...extra });
  for (const m of ["owl", "hex", "moth"]) await pres(m, ["start", "break1"]);
  for (const m of ["lantern", "pumpkin", "ghost", "fog"]) await pres(m, ["break1"]);
  await pres("recent", ["start", "break1"]); await pres("mod", ["break1"], { noPrize: true }); await pres("crewbie", ["break1"]); await pres("adm", ["break1"], { crew: true });
  await wdb.doc(`${S}/streams/s1/presence/dropper`).set({ uid: "dropper", drops: 1 });

  // ---------- a live contest (owner only), with Round 1 groups ----------
  const contest = { type: "live", title: "Break Wheel #1 (sample)", method: "wheel", winnersCount: 1, prizes: [{ place: 1, title: "A horror game on Steam (sample)", kind: "digital" }], draw: { beat: "break1" },
    round1: [{ group: "Everyone", filter: { kind: "everyone" } }, { group: "Every beat tonight", filter: { kind: "everyBeat" } }, { group: "Members 1000 days", filter: { kind: "memberDays", n: 1000 } }] };
  const cid = (await as("boss", "prizeContestSave", contest)).id;
  assert.equal(await why(as("boss", "prizeDrawStart", { contestId: cid })), "status", "publish first");
  await as("boss", "prizeContestStatus", { id: cid, action: "publish" });
  assert.equal((await get(`${BASE}/contests/${cid}`)).status, "scheduled");
  assert.equal(await why(as("adm", "prizeDrawStart", { contestId: cid })), "notOwner", "live draws are the owner's alone");

  // a Chat Game blocks the draw
  await wdb.doc(`${S}/streams/s1/private/control`).set({ chatGame: { runId: "r1", formatId: "hot-seat", state: "open", round: 1, title: "Hot Seat" } });
  assert.equal(await why(as("boss", "prizeDrawStart", { contestId: cid })), "chatGame");
  await wdb.doc(`${S}/streams/s1/private/control`).set({ chatGame: null });

  // ---------- start: the pool ----------
  let r = await as("boss", "prizeDrawStart", { contestId: cid });
  const drawId = r.drawId;
  assert.deepEqual(r.counts, { checkedIn: 11, crew: 3, cooldown: 1, filtered: 0, inDraw: 7 }, "checked in, minus crew (on duty, by grade, crew flag), minus the cooldown");
  // the mod was on duty (noPrize) and adm checked in as crew: both counted as crew; crewbie is crew by grade; the drop-only presence never counts
  assert.equal(r.round1, true);
  assert.equal((await get(`${BASE}/contests/${cid}`)).status, "drawing");
  assert.equal((await get(BASE)).activeDraw.drawId, drawId, "one draw at a time");
  let p = (await pub()).prizeDraw;
  assert.equal(p.phase, "pool"); assert.equal(p.pool.inDraw, 7);
  assert.equal(p.serverNow, clock, "the pointer carries the server clock (devices correct their own with it)"); assert.equal(p.contestTitle, "Break Wheel #1 (sample)");
  const c2 = (await as("boss", "prizeContestSave", { ...contest, title: "Break Wheel #2 (sample)" })).id;
  await as("boss", "prizeContestStatus", { id: c2, action: "publish" });
  assert.equal(await why(as("boss", "prizeDrawStart", { contestId: c2 })), "busy");
  assert.equal(await why(as("boss", "prizeDrawSpin", { drawId, round: 2 })), "round", "round 1 first when it's on");

  // ---------- round 1: groups; a group with fewer than 2 is Spin again ----------
  rigged.push(0, 300, 0, 600);   // Round 1 lands on blade 1, Everyone (7 members), so two respins still leave a wheel
  r = await as("boss", "prizeDrawSpin", { drawId, round: 1 });
  p = (await pub()).prizeDraw;
  assert.equal(p.phase, "round1"); assert.equal(p.round, 1);
  assert.deepEqual(p.labels.slice(0, 3), ["Everyone", "Every beat tonight", null], "Members 1000 days has nobody: Spin again");
  assert.deepEqual(p.groups.map((g) => g.count), [7, 3, 0]);
  assert.equal(p.spins.length, 1); assert.equal(p.spins.at(-1).again, false); assert.ok(p.spins.slice(0, -1).every((s) => s.again), "chained re-picks land on Spin again");
  for (const s of p.spins) { assert.ok(s.offset >= 0.2 && s.offset <= 0.8); assert.ok(s.durationMs >= 7200 && s.durationMs <= 8400); assert.ok(s.spins === 5 || s.spins === 6); }
  assert.equal(p.spins[0].startAt, clock + 1500, "the spin starts a moment after it's decided, so every viewer starts together");
  const chosen = p.groupPick;
  assert.equal(chosen.label, "Everyone"); assert.equal(chosen.count, 7);
  assert.equal(await why(as("boss", "prizeDrawSpin", { drawId, round: 2 })), "spinning", "round 1 is still spinning");
  clock = p.spins.at(-1).startAt + p.spins.at(-1).durationMs + 500;

  // ---------- round 2: up to 10 members of the group; empty blades are Spin again ----------
  await as("boss", "prizeDrawSpin", { drawId, round: 2 });
  p = (await pub()).prizeDraw;
  assert.equal(p.phase, "here"); assert.equal(p.round, 2);
  assert.equal(p.labels.filter(Boolean).length, chosen.count); assert.equal(p.labels.filter((x) => x === null).length, 10 - chosen.count);
  assert.equal(p.labels[p.picked.index], `@${p.picked.handle}`, "the paddle lands on the picked member's blade");
  assert.equal(p.spins.at(-1).pickIndex, p.picked.index);
  assert.equal(p.hereUntil, p.spins.at(-1).startAt + p.spins.at(-1).durationMs + 60000, "60 s from the landing");
  assert.ok(!/"(uid|uids)"/.test(JSON.stringify(await pub())), "public/live never holds a uid");
  assert.deepEqual(LL.findSecrets(await pub(), {}), [], "the secrets scan passes");
  assert.equal(tasks.length, 1); assert.equal(tasks[0].opts.id, `here-${drawId}-1`);
  const first = p.picked.handle;
  const someoneElse = members.find((m) => m !== first);
  assert.equal(await why(as(someoneElse, "prizeHere", { drawId })), "notPicked");
  assert.equal(await why(as(first, "prizeHere", { drawId })), "spinning", "not before it lands");
  // the window runs out: the task respins among the rest
  assert.deepEqual(await live.hooks.prizeDraw.timeout(tasks[0].data), { skipped: true, early: true });
  clock = p.hereUntil + 3000;
  assert.equal(await why(as(first, "prizeHere", { drawId })), "late");
  r = await live.hooks.prizeDraw.timeout(tasks[0].data);
  assert.equal(r.status, "here");
  p = (await pub()).prizeDraw;
  assert.notEqual(p.picked.handle, first, "they're left out of the respin"); assert.equal(p.respins, 1);
  assert.ok(!p.labels.includes(`@${first}`));
  assert.deepEqual(await live.hooks.prizeDraw.timeout(tasks[0].data), { skipped: true }, "an old task does nothing");
  // Respin without them (owner)
  assert.equal(await why(as("adm", "prizeRespin", { drawId })), "notOwner");
  await as("boss", "prizeRespin", { drawId });
  p = (await pub()).prizeDraw;
  assert.equal(p.respins, 2);
  const d = await get(`${BASE}/contests/${cid}/draws/${drawId}`);
  assert.deepEqual(d.respins.map((x) => x.reason), ["timeout", "owner"]);
  // the viewer's own state (prizeMine { draw: true })
  const picked = p.picked.handle;
  r = await as(picked, "prizeMine", { draw: true });
  assert.equal(r.serverNow, clock, "prizeMine { draw: true } returns the server clock");
  assert.equal(r.draw.picked, true); assert.equal(r.draw.inPool, true); assert.equal(typeof r.draw.blade, "number");
  r = await as("recent", "prizeMine", { draw: true });
  assert.equal(r.draw.inPool, false, "the cooldown keeps them out");
  // I'm here: the winner
  clock = p.spins.at(-1).startAt + p.spins.at(-1).durationMs + 5000;
  r = await as(picked, "prizeHere", { drawId });
  assert.equal(r.won, true);
  assert.equal((await as(picked, "prizeHere", { drawId })).already, true, "a double tap awards once");
  p = (await pub()).prizeDraw;
  assert.equal(p.phase, "won"); assert.equal(p.winner.handle, picked);
  const w = await get(`${BASE}/winners/${drawId}`);
  assert.equal(w.uid, picked); assert.equal(w.status, "pending"); assert.equal(w.drawId, drawId);
  assert.equal((await get(`${BASE}/contests/${cid}`)).status, "won");
  assert.ok((await get(`${BASE}/cooldowns/${picked}`)).until.toMillis() > clock + 29 * DAY, "the 30-day cooldown");
  assert.equal(badges.filter((b) => b.uid === picked && b.id === "prize-box-winner").length, 1);
  assert.equal((await get(`${S}/public/prizeBox`)).winners[0].handle, picked);
  // Done
  await as("boss", "prizeDrawEnd", { drawId });
  assert.equal((await pub()).prizeDraw, null); assert.equal((await get(BASE)).activeDraw, null);
  assert.equal((await get(`${BASE}/contests/${cid}/draws/${drawId}`)).status, "done");

  // ---------- the stream ends mid-draw: void, then rerun from the same snapshot ----------
  r = await as("boss", "prizeDrawStart", { contestId: c2, useRound1: false });
  const d2 = r.drawId;
  assert.equal(r.counts.inDraw, 6, `${picked} won a live draw tonight: the cooldown`);
  await live.hooks.prizeDraw.onStreamEnd("s1");
  assert.equal((await get(`${BASE}/contests/${c2}/draws/${d2}`)).status, "void");
  let c2doc = await get(`${BASE}/contests/${c2}`);
  assert.equal(c2doc.status, "scheduled"); assert.equal(c2doc.voidDrawId, d2);
  assert.equal(((await get(`${S}/streams/s1/private/control`)) || {}).prizeDraw, null);
  // a new stream: the rerun uses the old snapshot (6 members), not tonight's presence
  await wdb.doc(`${S}/streams/s1`).update({ state: "ended" });
  await wdb.doc(`${S}/streams/s2`).set({ title: "Next stream (sample)", state: "live", type: "platform", beats: { start: { startedAt: TS(clock), endedAt: null, windowOpenedAt: TS(clock) } }, segments: [] });
  r = await as("boss", "prizeDrawStart", { contestId: c2, rerun: true, useRound1: false });
  assert.equal(r.counts.inDraw, 6); const d3 = r.drawId;
  assert.equal((await get(`${BASE}/contests/${c2}/draws/${d3}`)).rerunOf, d2);
  assert.equal((await get(`${BASE}/contests/${c2}`)).voidDrawId, undefined);
  await as("boss", "prizeDrawSpin", { drawId: d3, round: 2 });
  let p3 = ((await get(`${S}/streams/s2/private/control`)) || {}).prizeDraw;
  assert.equal(p3.phase, "here"); assert.equal(p3.labels.filter(Boolean).length, 6);
  // the backstop: prizeTick respins a window the task missed
  clock = p3.hereUntil + 10000;
  r = await pbm.ops.tick();
  assert.equal(r.draws.changed, true);
  p3 = ((await get(`${S}/streams/s2/private/control`)) || {}).prizeDraw;
  assert.equal(p3.respins, 1);
  // keep respinning: under 2 left means no spin
  for (let i = 0; i < 4; i++) await as("boss", "prizeRespin", { drawId: d3 });
  p3 = ((await get(`${S}/streams/s2/private/control`)) || {}).prizeDraw;
  assert.equal(p3.phase, "noSpin", "fewer than 2 left: no spin");
  assert.equal(await why(as("boss", "prizeRespin", { drawId: d3 })), "status");
  await as("boss", "prizeDrawEnd", { drawId: d3 });
  assert.equal((await get(`${BASE}/contests/${c2}`)).status, "scheduled", "ended without a winner: back to scheduled");
  // a contest the owner left without a winner can't be rerun from a voided snapshot it doesn't have
  assert.equal(await why(as("boss", "prizeDrawStart", { contestId: c2, rerun: true })), "noVoid");
  // adminLog
  const logs = (await wdb.collection("adminLog").get()).docs.map((x) => x.data()).filter((l) => l.feature === "prizeBox");
  for (const a of ["draw-start", "draw-round1", "draw-round2", "draw-respin", "draw-won", "draw-done", "draw-void", "draw-rerun"]) assert.ok(logs.some((l) => l.action === a), a);
  console.log("check-prize-draw: ok");
})().catch((e) => { console.error(e); process.exit(1); });
