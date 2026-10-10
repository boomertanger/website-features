#!/usr/bin/env node
// functions/scripts/check-drops.js: live drops (docs/specs/live-drops.md §3, §4, §6; workstream 7 part 2). The pure rules in lib/live/drops-logic.js,
// grantBadge's quiet option, and the callables, the sweep and the hooks (Stop, public/live, Recruit Rush) against the in-memory Firestore with the
// REAL Trophy Room grants. No network, no credentials, no deploy.   npm run check   (or node scripts/check-drops.js)
const assert = require("assert/strict");
const DL = require("../lib/live/drops-logic");
const L = require("../lib/live/logic");
const { makeDb } = require("./fixtures/fake-firestore");

const admin = require("firebase-admin");
process.env.GCLOUD_PROJECT ||= "boomertanger-staging";
process.env.FIREBASE_CONFIG ||= JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const wdb = makeDb(); const realFs = admin.firestore;
const fakeFs = () => wdb; fakeFs.Timestamp = realFs.Timestamp; fakeFs.FieldValue = realFs.FieldValue;
Object.defineProperty(admin, "firestore", { value: fakeFs, configurable: true, writable: true });
const TS = (m) => realFs.Timestamp.fromMillis(m);
const S = "sites/boomertanger";
const MIN = 60000, H = 60 * MIN;
let clock = Date.UTC(2026, 9, 12, 1, 0);

// ================================================================ 1. pure rules
{
  const t = clock;
  const live = { id: "s1", state: "live" };
  const owner = { uid: "boss", isOwner: true }, capt = { uid: "capt", isOwner: false }, fan = { uid: "fan", isOwner: false };
  const duty = { captainNow: { uid: "capt", handle: "capt", acting: false } };
  const timed = { status: "active", drop: { mode: "timed", minutes: 3, by: "captain" } };
  const ownerOnly = { status: "active", drop: { mode: "draw", minutes: 2, winners: 1, by: "owner" } };
  const noBy = { status: "active", drop: { mode: "timed", minutes: 5 } };
  const open = (o) => DL.canOpen({ caller: owner, duty, stream: live, badge: timed, badgeId: "b", existing: null, openPointer: null, rush: null, input: {}, nowMs: t, ...o });
  assert.equal(open({}).value.mode, "timed"); assert.equal(open({}).value.closesAt, t + 3 * MIN); assert.equal(open({}).value.maxClosesAt, t + 2 * H); assert.equal(open({}).value.as, "owner");
  assert.equal(open({ caller: capt }).value.as, "captain");
  assert.equal(open({ caller: capt, duty: { captainNow: { uid: "capt", acting: true } } }).value.as, "acting");
  assert.equal(open({ caller: fan }).reason, "notCaptain");
  assert.equal(open({ caller: capt, duty: { captainNow: null } }).reason, "notCaptain", "a Captain who clocked out isn't the live Captain");
  assert.equal(open({ caller: capt, badge: ownerOnly }).reason, "ownerOnly");
  assert.equal(open({ caller: capt, badge: noBy }).reason, "ownerOnly", "missing drop.by means owner");
  assert.equal(open({ badge: noBy }).ok, true);
  assert.equal(open({ stream: { id: "s1", state: "ended" } }).reason, "notLive");
  assert.equal(open({ badge: { status: "active" } }).reason, "noPreset");
  assert.equal(open({ badge: null }).reason, "noPreset");
  assert.equal(open({ existing: { status: "closed" } }).reason, "dropped");
  assert.equal(open({ openPointer: { state: "closing" } }).reason, "busy");
  assert.equal(open({ openPointer: { state: "closed" } }).ok, true);
  assert.equal(open({ input: { minutes: 0 } }).reason, "minutes"); assert.equal(open({ input: { minutes: 121 } }).reason, "minutes"); assert.equal(open({ input: { minutes: 120 } }).ok, true);
  assert.equal(open({ input: { cap: 0 } }).reason, "cap"); assert.equal(open({ input: { cap: 10001 } }).reason, "cap"); assert.equal(open({ input: { cap: 50 } }).value.cap, 50);
  const ue = open({ input: { untilEnd: true, minutes: 7 } }).value; assert.equal(ue.mode, "streamEnd"); assert.equal(ue.closesAt, null);
  assert.equal(open({ badge: { status: "active", drop: { mode: "streamEnd" } } }).value.mode, "streamEnd");
  const dr = open({ badge: ownerOnly }).value; assert.deepEqual([dr.mode, dr.minutes, dr.winners, dr.cap], ["draw", 2, 1, null]);
  assert.equal(open({ badge: ownerOnly, input: { cap: 5 } }).reason, "cap", "a draw has no cap");
  assert.equal(open({ badge: ownerOnly, input: { untilEnd: true } }).reason, "untilEnd");
  assert.equal(open({ badge: ownerOnly, input: { minutes: 16 } }).reason, "minutes");
  // Rush source
  const hit = { on: true, hitAt: t - MIN, rewardBadgeId: "b" };
  assert.equal(open({ input: { source: "rush" }, rush: hit }).value.source, "rush");
  assert.equal(open({ input: { source: "rush" }, rush: { ...hit, hitAt: null } }).reason, "rushNotHit");
  assert.equal(open({ input: { source: "rush" }, rush: { ...hit, rewardBadgeId: "other" } }).reason, "rushBadge");
  assert.equal(open({ input: { source: "rush" }, rush: { ...hit, rushDropId: "x" } }).reason, "rushDropped");

  // adjust
  const drop = { status: "open", mode: "timed", closesAt: t + 3 * MIN, maxClosesAt: t + 2 * H, extensions: [] };
  const adj = (o) => DL.canAdjust({ caller: capt, duty, drop, action: "plus1", nowMs: t, ...o });
  assert.equal(adj({}).patch.closesAt, t + 4 * MIN); assert.equal(adj({ action: "plus5" }).patch.closesAt, t + 8 * MIN);
  assert.equal(adj({ caller: fan }).reason, "notCaptain");
  assert.equal(adj({ duty: { captainNow: { uid: "newcapt" } } }).reason, "notCaptain", "the old Captain can't once the seat moved");
  assert.equal(adj({ caller: { uid: "newcapt" }, duty: { captainNow: { uid: "newcapt" } } }).ok, true, "the new Captain can");
  assert.equal(adj({ drop: { ...drop, closesAt: t + 2 * H - 30000 } }).reason, "maxed", "never past 2 hours");
  assert.equal(adj({ drop: { ...drop, extensions: Array(20).fill({}) } }).reason, "maxed");
  assert.equal(adj({ drop: { ...drop, mode: "streamEnd", closesAt: null } }).reason, "untilEnd");
  assert.equal(adj({ drop: { ...drop, status: "closing" } }).reason, "closed");
  const cl = adj({ action: "close" }); assert.deepEqual(cl.patch, { status: "closing", closedAt: t, graceUntil: t + 30000, closedBy: "manual" });
  assert.equal(adj({ action: "close", caller: owner, duty: { captainNow: null } }).ok, true, "the owner can close after the Captain clocks out");

  // claim
  const cd = { status: "open", mode: "timed", closesAt: t + 3 * MIN, maxClosesAt: t + 2 * H, cap: null, droppedBy: { uid: "capt" } };
  const claim = (o) => DL.canClaim({ drop: cd, caller: { uid: "fan", handle: "fan" }, existingClaim: null, count: 0, nowMs: t, ...o });
  assert.deepEqual(claim({}), { ok: true, kind: "claim", inGrace: false });
  assert.equal(claim({ caller: { uid: "x", handle: null } }).reason, "needsSignup");
  assert.equal(claim({ caller: { uid: "capt", handle: "capt" } }).reason, "ownDrop");
  assert.deepEqual(claim({ existingClaim: { result: "granted", kind: "claim" }, drop: { ...cd, status: "closed" } }), { ok: true, repeat: true, result: "granted", kind: "claim" }, "a repeat returns the first result, even after close");
  assert.equal(claim({ nowMs: t + 3 * MIN + 10000 }).inGrace, true, "open past closesAt: still within the grace");
  assert.equal(claim({ nowMs: t + 3 * MIN + 31000 }).reason, "closed");
  assert.equal(claim({ drop: { ...cd, status: "closing", closedAt: t, graceUntil: t + 30000 }, nowMs: t + 29000 }).inGrace, true);
  assert.equal(claim({ drop: { ...cd, status: "closing", closedAt: t, graceUntil: t + 30000 }, nowMs: t + 31000 }).reason, "closed");
  assert.equal(claim({ drop: { ...cd, cap: 3 }, count: 3 }).reason, "full");
  assert.equal(claim({ drop: { ...cd, mode: "draw" } }).kind, "entry");
  assert.equal(claim({ drop: { ...cd, mode: "streamEnd", closesAt: null }, nowMs: t + H }).ok, true);
  assert.equal(claim({ drop: { ...cd, mode: "streamEnd", closesAt: null }, nowMs: t + 2 * H + 31000 }).reason, "closed", "a streamEnd drop stops at the 2-hour cap");

  // sweep
  assert.deepEqual(DL.sweepAction({ status: "open", closesAt: t, cap: null }, 0, t), { action: "close", closedBy: "timer", at: t });
  assert.deepEqual(DL.sweepAction({ status: "open", closesAt: t + MIN, cap: 5 }, 5, t), { action: "close", closedBy: "cap" });
  assert.deepEqual(DL.sweepAction({ status: "open", closesAt: null, maxClosesAt: t, cap: null }, 0, t), { action: "close", closedBy: "timer", at: t });
  assert.deepEqual(DL.sweepAction({ status: "open", closesAt: t + MIN }, 0, t), { action: "none" });
  assert.deepEqual(DL.sweepAction({ status: "closing", graceUntil: t }, 0, t), { action: "finish" });
  assert.deepEqual(DL.sweepAction({ status: "closing", graceUntil: t + 1 }, 0, t), { action: "none" });
  assert.deepEqual(DL.sweepAction({ status: "closed" }, 0, t), { action: "none" });

  // draw
  assert.deepEqual(DL.pickWinners(["a", "b", "c"], new Set(["a", "b"]), 1, () => 0), ["c"], "holders can't win");
  assert.deepEqual(DL.pickWinners([], new Set(), 1), []);
  assert.deepEqual(DL.pickWinners(["a"], new Set(["a"]), 1), []);
  const seen = {}; for (let i = 0; i < 300; i++) { const w = DL.pickWinners(["a", "b", "c"], new Set(), 1)[0]; seen[w] = (seen[w] || 0) + 1; }
  assert.equal(Object.keys(seen).length, 3, "every entrant can win (crypto randomness)");
  assert.equal(DL.pickWinners(["a", "b", "c", "a"], new Set(), 5).length, 3, "unique winners, never more than the entries");

  // public pointer and the activity line
  const ptr = { id: "s1_b", badgeId: "b", name: "Jump-Scare Witness", art: "😱", rarity: 1, mode: "timed", state: "open", closesAt: t + MIN, graceUntil: null, cap: null, claims: 0, winners: [], closedAt: null, uid: "leak" };
  const pub = DL.publicDropOf(ptr, t, 7);
  assert.equal(pub.claims, 7); assert.equal(pub.untilEnd, false); assert.equal("uid" in pub, false); assert.equal("graceUntil" in pub, false);
  assert.equal(DL.publicDropOf({ ...ptr, state: "closed", closedAt: t - 61000 }, t), null, "gone 60 s after close");
  assert.ok(DL.publicDropOf({ ...ptr, state: "closed", closedAt: t - 59000 }, t));
  assert.equal(DL.publicDropOf({ ...ptr, state: "weird" }, t), null);
  assert.equal(DL.summaryOf({ name: "Jump-Scare Witness", mode: "timed", claims: 42 }), "42 members caught Jump-Scare Witness");
  assert.equal(DL.summaryOf({ name: "X", mode: "timed", claims: 1 }), "1 member caught X");
  assert.equal(DL.summaryOf({ name: "The Chosen One", mode: "draw", winners: ["gbo"] }), "@gbo is The Chosen One");
  assert.equal(DL.summaryOf({ name: "The Chosen One", mode: "draw", winners: [] }), null, "a draw with no entries writes no activity");
  // public/live
  const out = L.buildPublicLive({ stream: { id: "s1", state: "live", beats: {} }, nowMs: t, drop: ptr, dropClaims: 3 });
  assert.equal(out.drop.claims, 3); assert.deepEqual(L.findSecrets(out), [], "nothing secret in public/live.drop");
  assert.ok(L.findSecrets({ drop: { droppedBy: { uid: "x" } } }).length, "findSecrets still catches a uid under drop");
  assert.equal(L.buildPublicLive({ stream: null, nowMs: t }).drop, null);
  // Rush dropReady
  assert.equal(L.publicRush({ on: true, goal: 5, reward: "r", hitAt: t, rewardBadgeId: "b" }, 5).dropReady, "b");
  assert.equal("dropReady" in L.publicRush({ on: true, goal: 5, reward: "r", hitAt: t, rewardBadgeId: "b", rushDropId: "x" }, 5), false, "gone once the Rush drop opened");
  assert.equal("dropReady" in L.publicRush({ on: true, goal: 5, reward: "r", hitAt: null, rewardBadgeId: "b" }, 3), false);
  assert.equal("dropReady" in L.publicRush({ on: true, goal: 5, reward: "r", hitAt: t }, 5), false);
}

// ================================================================ 2. grantBadge quiet, and 3. the callables
const adminLogEntry = async (_d, f) => ({ ...f, createdAt: realFs.Timestamp.now() });
const grant = require("../lib/rewards/grant").makeGrant({ db: wdb });
const nsEvents = [];
const fakeFactory = { recordFactoryEvent: async (uid, type, params, ref) => { nsEvents.push({ uid, type, params, ref }); return { counted: true }; } };
const live = require("../lib/live").build({ adminLogEntry, now: () => clock, grant, factory: fakeFactory, enqueue: async () => {}, sleep: async () => {}, dropRandomInt: (n) => n - 1 });
const fns = live.functions, ctx = live.hooks.ctx, drops = live.hooks.drops;
const as = (uid, fn, data = {}) => fns[fn].run({ auth: uid ? { uid, token: {} } : undefined, data });
const why = async (p) => { try { await p; return "ok"; } catch (e) { return e.details?.reason || e.message; } };
const get = async (p) => (await wdb.doc(`${S}/${p}`).get()).data();
const col = async (p) => (await wdb.collection(`${S}/${p}`).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const activity = async () => (await wdb.collection("activityLog").get()).docs.map((d) => d.data());
const adminLog = async () => (await wdb.collection("adminLog").get()).docs.map((d) => d.data());

async function main() {
  await wdb.doc(S).set({ ownerUid: "boss", timezone: "America/Chicago" });
  const person = async (uid, roles = [], handle = uid) => { await wdb.doc(`${S}/members/${uid}`).set({ roles }); if (handle) await wdb.doc(`${S}/profiles/${uid}`).set({ handle, xp: 0 }); };
  for (const [u, r] of [["boss", ["admin"]], ["capt", ["mod"]], ["capt2", ["mod"]], ["fan", []], ["fan2", []], ["fan3", []], ["fan4", []], ["q1", []], ["q2", []]]) await person(u, r);
  await person("newbie", [], null);
  const badges = require("../data/trophy-room-badges.json").badges;
  const { badgeDoc } = require("../lib/rewards/catalog");
  for (const id of ["jump-scare-witness", "glitchwitness", "chosen-one", "boss-fight-believer", "anniversary-ember", "seat-warmer"]) {
    const b = badges.find((x) => x.id === id); if (b) await wdb.doc(`${S}/badges/${id}`).set({ ...badgeDoc(b), holders: 0 });
  }
  await wdb.doc(`${S}/badges/plain-badge`).set({ name: "Plain", collection: "moments", rarity: 2, source: "auto", status: "active", xp: 10, holders: 0 });

  // ---- 2. grantBadge quiet: skips only the badge-earned entry ----
  await wdb.doc(`${S}/badges/quiet-test`).set({ name: "Quiet Test", collection: "moments", rarity: 2, source: "auto", status: "active", xp: 5, holders: 0 });
  await wdb.doc(`${S}/badges/loud-test`).set({ name: "Loud Test", collection: "moments", rarity: 2, source: "auto", status: "active", xp: 5, holders: 0 });
  const before = (await activity()).length;
  assert.equal((await grant.grantBadge("q1", "loud-test", { feature: "test", ref: "loud" })).granted, true);
  assert.equal((await activity()).filter((a) => a.type === "badge-earned").length, 1, "the default still writes badge-earned");
  assert.equal((await grant.grantBadge("q2", "quiet-test", { feature: "test", ref: "quiet", quiet: true })).granted, true);
  assert.equal((await activity()).length, before + 1, "quiet: true writes no badge-earned entry");
  assert.ok(await get("profiles/q2/badges/quiet-test"), "quiet still grants the badge");
  assert.equal((await get("profiles/q2")).xp, 5, "and its XP");

  // ---- a live stream with a Captain on duty ----
  await wdb.doc(`${S}/streams/s1`).set({ title: "Monster Monday", state: "live", type: "platform", audience: "public", actualStart: TS(clock - H), beats: {}, rooms: ["twitch"] });
  await wdb.doc(`${S}/streams/s1/private/duty`).set({ streamId: "s1", state: "live", captainNow: { uid: "capt", handle: "capt", acting: false, since: clock } });
  await wdb.doc(`${S}/streams/s1/private/control`).set({});

  // ---- dropOpen ----
  assert.equal(await why(as(null, "dropOpen", { badgeId: "glitchwitness" })), "signedOut");
  assert.equal(await why(as("fan", "dropOpen", { badgeId: "glitchwitness" })), "notCaptain");
  assert.equal(await why(as("capt2", "dropOpen", { badgeId: "glitchwitness" })), "notCaptain", "crew who aren't the live Captain");
  assert.equal(await why(as("capt", "dropOpen", { badgeId: "chosen-one" })), "ownerOnly");
  assert.equal(await why(as("capt", "dropOpen", { badgeId: "plain-badge" })), "noPreset");
  assert.equal(await why(as("capt", "dropOpen", { badgeId: "nope" })), "noPreset");
  const o1 = await as("capt", "dropOpen", { badgeId: "glitchwitness" });
  assert.equal(o1.dropId, "s1_glitchwitness"); assert.equal(o1.mode, "timed"); assert.equal(o1.closesAt, clock + 5 * MIN);
  const d1 = await get("drops/s1_glitchwitness");
  assert.deepEqual(d1.droppedBy, { uid: "capt", handle: "capt", as: "captain" }); assert.equal(d1.status, "open"); assert.equal(d1.name, "The Glitchwitness");
  assert.equal(await why(as("boss", "dropOpen", { badgeId: "jump-scare-witness" })), "busy", "one drop at a time");
  let pub = await get("public/live");
  assert.equal(pub.drop.id, "s1_glitchwitness"); assert.equal(pub.drop.state, "open"); assert.deepEqual(L.findSecrets(pub), []);
  assert.ok((await adminLog()).some((e) => e.feature === "liveDrops" && e.action === "dropOpen"));

  // ---- claimDrop ----
  const claim = (uid) => as(uid, "claimDrop", { dropId: "s1_glitchwitness" });
  assert.equal(await why(claim("capt")), "ownDrop");
  assert.equal(await why(claim("newbie")), "needsSignup");
  assert.equal(await why(as(null, "claimDrop", { dropId: "s1_glitchwitness" })), "signedOut");
  const earnedBefore = (await activity()).filter((a) => a.type === "badge-earned").length;
  const c1 = await claim("fan");
  assert.equal(c1.result, "granted"); assert.equal(c1.badge.name, "The Glitchwitness");
  assert.ok(await get("profiles/fan/badges/glitchwitness"), "the badge is granted");
  assert.equal((await claim("fan")).result, "granted", "a repeat returns the first result");
  assert.equal((await col("profiles/fan/badges")).length, 1); assert.equal((await get("badges/glitchwitness")).holders, 1, "no double grant");
  assert.equal((await claim("boss")).result, "granted", "the owner can claim the Captain's drop");
  await grant.grantBadge("fan2", "glitchwitness", { feature: "test", ref: "pre", quiet: true });
  assert.equal((await claim("fan2")).result, "already", "already held: claim works, no grant");
  assert.equal((await get("streams/s1/presence/fan2")).drops, 1, "it still counts for presence");
  assert.equal((await get("streams/s1/presence/fan")).drops, 1, "one per claim, not per repeat");
  assert.equal((await activity()).filter((a) => a.type === "badge-earned").length, earnedBefore + 0, "no per-member badge-earned entries for drops");
  assert.equal(await drops.countOf("s1_glitchwitness"), 3);
  await ctx.publishLive(); pub = await get("public/live");
  assert.equal(pub.drop.claims, 3, "public/live carries the live count");

  // ---- dropAdjust: Captain changes mid-drop ----
  assert.equal(await why(as("fan", "dropAdjust", { dropId: "s1_glitchwitness", action: "plus1" })), "notCaptain");
  assert.equal((await as("capt", "dropAdjust", { dropId: "s1_glitchwitness", action: "plus5" })).closesAt, clock + 10 * MIN);
  await wdb.doc(`${S}/streams/s1/private/duty`).update({ captainNow: { uid: "capt2", handle: "capt2", acting: true, since: clock } });
  assert.equal(await why(as("capt", "dropAdjust", { dropId: "s1_glitchwitness", action: "plus1" })), "notCaptain", "the old Captain can't");
  assert.equal(await why(as("capt2", "dropAdjust", { dropId: "s1_glitchwitness", action: "plus1" })), "ok", "the new one can");
  assert.equal((await get("drops/s1_glitchwitness")).droppedBy.uid, "capt", "droppedBy keeps the original");
  assert.equal((await get("drops/s1_glitchwitness")).extensions.length, 2);
  // close: the 30 s grace
  await as("capt2", "dropAdjust", { dropId: "s1_glitchwitness", action: "close" });
  assert.equal((await get("drops/s1_glitchwitness")).status, "closing");
  assert.equal((await get("streams/s1/private/control")).drop.state, "closing");
  clock += 20000;
  const late = await claim("fan3"); assert.equal(late.result, "granted"); assert.equal((await get("drops/s1_glitchwitness/claims/fan3")).inGrace, true);
  clock += 15000;
  assert.equal(await why(claim("fan4")), "closed", "after the grace");
  // sweep: finished once, one activity line
  assert.deepEqual(await drops.sweep(), { closed: 0, finished: 1 });
  const fin = await get("drops/s1_glitchwitness");
  assert.equal(fin.status, "closed"); assert.equal(fin.claims, 4);
  let drops1 = (await activity()).filter((a) => a.type === "badge-drop");
  assert.equal(drops1.length, 1); assert.equal(drops1[0].summary, "4 members caught The Glitchwitness");
  assert.deepEqual(await drops.sweep(), { idle: true }, "nothing open: one query, nothing else");
  await drops.finish("s1_glitchwitness");
  assert.equal((await activity()).filter((a) => a.type === "badge-drop").length, 1, "a second finish writes nothing");
  assert.equal((await get("streams/s1/private/control")).drop.state, "closed");
  assert.equal(await why(as("boss", "dropOpen", { badgeId: "glitchwitness" })), "dropped", "same badge twice in one stream");

  // ---- a capped drop closes on the cap ----
  await as("boss", "dropOpen", { badgeId: "jump-scare-witness", minutes: 3, cap: 2 });
  assert.equal((await as("fan", "claimDrop", { dropId: "s1_jump-scare-witness" })).result, "granted");
  assert.equal((await as("fan2", "claimDrop", { dropId: "s1_jump-scare-witness" })).result, "granted");
  assert.equal(await why(as("fan3", "claimDrop", { dropId: "s1_jump-scare-witness" })), "full", "claim cap+1 is refused");
  assert.equal((await get("drops/s1_jump-scare-witness/shards/cap")).claims, 2, "a capped drop counts on one doc");
  assert.equal((await drops.sweep()).closed, 1);
  assert.equal((await get("drops/s1_jump-scare-witness")).closedBy, "cap");
  clock += 31000; await drops.sweep();
  assert.equal((await get("drops/s1_jump-scare-witness")).status, "closed");

  // ---- a draw (The Chosen One): entries, a holder can't win, one winner, results ----
  await wdb.doc(`${S}/streams/s1/private/duty`).update({ captainNow: { uid: "capt", handle: "capt", acting: false, since: clock } });
  const od = await as("boss", "dropOpen", { badgeId: "chosen-one" });
  assert.equal(od.mode, "draw"); assert.equal(od.closesAt, clock + 2 * MIN);
  await grant.grantBadge("fan4", "chosen-one", { feature: "test", ref: "pre", quiet: true });
  for (const u of ["fan", "fan2", "fan4"]) assert.equal((await as(u, "claimDrop", { dropId: "s1_chosen-one" })).result, "entered");
  assert.equal(await why(as("boss", "claimDrop", { dropId: "s1_chosen-one" })), "ownDrop");
  clock += 2 * MIN; await drops.sweep();          // closes on time
  clock += 31000; await drops.sweep();            // the grace is over: draw
  const dd = await get("drops/s1_chosen-one");
  assert.equal(dd.status, "drawn"); assert.equal(dd.winnersOut.length, 1); assert.notEqual(dd.winnersOut[0].uid, "fan4", "a holder can't win");
  const winner = dd.winnersOut[0].uid;
  assert.ok(await get(`profiles/${winner}/badges/chosen-one`));
  const res = Object.fromEntries((await col("drops/s1_chosen-one/claims")).map((c) => [c.id, c.result]));
  assert.equal(Object.values(res).filter((r) => r === "won").length, 1); assert.equal(Object.values(res).filter((r) => r === "lost").length, 2);
  assert.ok((await activity()).some((a) => a.type === "badge-drop" && a.summary === `@${winner} is The Chosen One`));
  assert.ok((await adminLog()).some((e) => e.action === "dropDraw"));
  pub = (await ctx.publishLive(), await get("public/live")); assert.deepEqual(pub.drop.winners, [winner]); assert.deepEqual(L.findSecrets(pub), []);
  // a draw with no entries: drawn, no winner, no activity line
  await wdb.doc(`${S}/streams/s2`).set({ title: "Second", state: "live", type: "platform", beats: {}, actualStart: TS(clock) });
  await wdb.doc(`${S}/streams/s1`).update({ state: "ended", actualEnd: TS(clock) });
  const actBefore = (await activity()).filter((a) => a.type === "badge-drop").length;
  await as("boss", "dropOpen", { badgeId: "chosen-one", streamId: "s2" });
  clock += 2 * MIN; await drops.sweep(); clock += 31000; await drops.sweep();
  assert.equal((await get("drops/s2_chosen-one")).status, "drawn"); assert.deepEqual((await get("drops/s2_chosen-one")).winnersOut, []);
  assert.equal((await activity()).filter((a) => a.type === "badge-drop").length, actBefore, "no activity for a draw with no entries");

  // ---- Stop and the auto-end close an open drop (afterEnd) ----
  await as("boss", "dropOpen", { badgeId: "anniversary-ember", streamId: "s2" });
  assert.equal((await get("drops/s2_anniversary-ember")).mode, "streamEnd");
  await live.hooks.controls.helpers.afterEnd(null, { id: "s2", title: "Second" }, { beats: {} }, { auto: true });
  const se = await get("drops/s2_anniversary-ember");
  assert.equal(se.status, "closing"); assert.equal(se.closedBy, "autoEnd");
  assert.ok((await adminLog()).some((e) => e.action === "dropStopClose" && e.feature === "liveDrops"));
  assert.equal((await as("fan", "claimDrop", { dropId: "s2_anniversary-ember" })).result, "granted", "the grace after Stop still takes claims");
  clock += 31000; await drops.sweep();
  assert.equal((await get("drops/s2_anniversary-ember")).status, "closed", "dropSweep doesn't need the stream to be live");

  // ---- Recruit Rush: the reward badge and the one-tap drop ----
  await wdb.doc(`${S}/streams/s2`).update({ state: "ended", actualEnd: TS(clock) });
  await wdb.doc(`${S}/streams/s3`).set({ title: "Third", state: "live", type: "platform", beats: {}, actualStart: TS(clock) });
  await wdb.doc(`${S}/streams/s3/private/duty`).set({ streamId: "s3", state: "live", captainNow: { uid: "capt", handle: "capt", acting: false } });
  assert.equal(await why(as("boss", "liveRecruitRush", { streamId: "s3", on: true, goal: 5, reward: "Pizza", rewardBadgeId: "plain-badge" })), "rewardBadge", "only drop badges");
  assert.equal((await as("boss", "liveRecruitRush", { streamId: "s3", on: true, goal: 5, reward: "Pizza", rewardBadgeId: "boss-fight-believer" })).rewardBadgeId, "boss-fight-believer");
  await wdb.doc(`${S}/streams/s3/private/control`).set({ recruitRush: { hitAt: TS(clock) } }, { merge: true });
  await ctx.publishLive(); pub = await get("public/live");
  assert.equal(pub.recruitRush.dropReady, "boss-fight-believer");
  assert.equal(await why(as("capt", "dropOpen", { badgeId: "glitchwitness", source: "rush", streamId: "s3" })), "rushBadge");
  const rd = await as("capt", "dropOpen", { badgeId: "boss-fight-believer", source: "rush", streamId: "s3" });
  assert.equal((await get("streams/s3/private/control")).recruitRush.rushDropId, rd.dropId);
  assert.equal((await get("streams/s3/private/control")).recruitRush.rewardBadgeId, "boss-fight-believer", "the reward badge is kept");
  pub = await get("public/live"); assert.equal("dropReady" in pub.recruitRush, false, "the prompt clears once the Rush drop opened");
  assert.equal((await get(`drops/${rd.dropId}`)).source, "rush");
  // a goal change later keeps rushDropId (merge)
  await as("boss", "liveRecruitRush", { streamId: "s3", on: true, goal: 5, reward: "Pizza and wings" });
  assert.equal((await get("streams/s3/private/control")).recruitRush.rushDropId, rd.dropId);

  // ---- extending past 2 hours ----
  await as("capt", "dropAdjust", { dropId: rd.dropId, action: "close" });
  clock += 31000; await drops.sweep();
  await as("boss", "dropOpen", { badgeId: "jump-scare-witness", streamId: "s3", minutes: 118 });
  await as("boss", "dropAdjust", { dropId: "s3_jump-scare-witness", action: "plus1" });
  assert.equal(await why(as("boss", "dropAdjust", { dropId: "s3_jump-scare-witness", action: "plus5" })), "maxed");
  assert.equal(await why(as("boss", "dropAdjust", { dropId: "s3_jump-scare-witness", action: "plus1" })), "ok", "exactly 2 hours is fine");
  assert.equal(await why(as("boss", "dropAdjust", { dropId: "s3_jump-scare-witness", action: "plus1" })), "maxed");

  // ---- the Deck and the checklist no longer know dropBadge ----
  const ctrl = require("../lib/live/controls");
  assert.equal(ctrl.SHORTCUTS.includes("dropBadge"), false);
  assert.equal(require("fs").readFileSync(require("path").join(__dirname, "../lib/live/feeds.js"), "utf8").includes('"dropBadge"'), false);

  console.log("check-drops: ok");
}
main().catch((err) => { console.error(err); process.exit(1); });
