// Live drops (docs/specs/live-drops.md §3, §4, §6; Trophy Room workstream 7, part 2). Built on the Control Room's ctx (core.js), because a
// drop publishes to public/live. Pure decisions are in drops-logic.js.
//
//   dropOpen({ streamId?, badgeId, minutes? | untilEnd?, cap?, source? })   the owner, or the live Captain (captainNow on private/duty, so only
//                                     while clocked in) for badges whose drop.by is "captain". One drop per badge per stream (the id), one open
//                                     at a time (the private/control.drop pointer). source "rush" also sets the main stream's recruitRush.rushDropId.
//   dropAdjust({ dropId, action })    plus1 | plus5 | close. The owner or whoever is the live Captain NOW. Close starts the 30 s grace.
//   claimDrop({ dropId })             any member with a handle, not the one who opened it. claims/{uid} is created once in a transaction (the "one per
//                                     member" lock) with the counter shard and presence.drops; a repeat call returns the first result. timed and
//                                     streamEnd grant the badge through grantBadge(..., { ref: "drop-<dropId>", quiet: true }); a draw records an entry.
//   dropSweep                         every minute; nothing to do (one query) when no drop is open or closing. Closes on time or cap, finishes after
//                                     the grace: the final count, the draw, ONE "badge-drop" activityLog entry, the pointer, public/live.
//   stopClose(streamId, { auto })     Stop's and the 12-hour auto-end's afterEnd: an open drop goes to closing (closedBy "stop" / "autoEnd").
//
// Documents (all server-written; firestore.rules: drops read by the owner and crew, claims by their member and the owner, shards by nobody):
//   sites/boomertanger/drops/{streamId}_{badgeId}   the drop (spec §3), kept as history
//   …/drops/{id}/claims/{uid}                       { uid, handle, at, kind: claim|entry, inGrace, result: granted|already|entered|won|lost|pending }
//   …/drops/{id}/shards/{0-9}                       { claims } (a capped drop counts on one doc, shards/cap, inside the claim transaction)
//   streams/{id}/private/control.drop               the public pointer: { id, badgeId, name, art, rarity, mode, state, closesAt, graceUntil, cap,
//                                                   claims, winners [handles], closedAt } -> public/live.drop through drops-logic.publicDropOf
// Activity: one "badge-drop" entry per drop, written only by the transaction that moves it from closing to closed or drawn, so a second sweep run
// can't write another; grants pass quiet: true, so there are no per-member badge-earned entries for drops.
const crypto = require("crypto");
const { onCall } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const DL = require("./drops-logic");
const { P, SHARDS, shardOf, PRESENCE_TTL_MS } = require("./core");

const FEATURE = "liveDrops";   // adminLog feature and the grant ledger feature

module.exports = function drops(ctx, { grant = null, randomInt = crypto.randomInt } = {}) {
  const { db, FieldValue, Timestamp, fail, now, ms } = ctx;
  const G = () => grant || (grant = require("../rewards/grant").makeGrant({ db }));
  const TS = (m) => (m == null ? null : Timestamp.fromMillis(m));
  const dropRef = (id) => db.doc(`${P.site}/drops/${id}`);
  const claimRef = (id, uid) => db.doc(`${P.site}/drops/${id}/claims/${uid}`);
  const shardRef = (id, n) => db.doc(`${P.site}/drops/${id}/shards/${n}`);
  const badgeRef = (id) => db.doc(`${P.site}/badges/${id}`);
  const raise = (r) => fail(["notCaptain", "ownerOnly", "ownDrop"].includes(r.reason) ? "permission-denied" : ["signedOut"].includes(r.reason) ? "unauthenticated" : ["noDrop", "noPreset"].includes(r.reason) ? "not-found" : ["cap", "minutes", "action", "untilEnd", "args"].includes(r.reason) ? "invalid-argument" : "failed-precondition", r.message, r.reason);
  const idOk = (s) => typeof s === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(s);

  async function logDrop(actor, { action, dropId, title, details }) {
    await db.collection("adminLog").add(await ctx.adminLogEntry(db, {
      feature: FEATURE, action, itemPath: `${P.site}/drops/${dropId}`, itemTitle: title || "Live drop",
      actorUid: actor && actor.uid ? actor.uid : null, actorName: actor ? actor.name : "Automatic", reason: "", details,
    }));
  }
  const publish = async () => { try { await ctx.publishLive(); } catch (err) { console.error("drops: publish failed", String((err && err.message) || err).slice(0, 140)); } };
  /** Claims so far: every shard doc's claims (0-9, and "cap" for a capped drop). */
  async function countOf(dropId) {
    const snap = await db.collection(`${P.site}/drops/${dropId}/shards`).get();
    return snap.docs.reduce((n, d) => n + (Number.isFinite(d.get("claims")) ? d.get("claims") : 0), 0);
  }
  ctx.dropClaims = countOf;
  const pointerOf = (dropId, d, extra = {}) => ({
    id: dropId, badgeId: d.badgeId, name: d.name, art: d.art || null, rarity: d.rarity || 1, mode: d.mode, state: "open",
    closesAt: ms(d.closesAt), graceUntil: ms(d.graceUntil), cap: d.cap == null ? null : d.cap, claims: 0, winners: [], closedAt: ms(d.closedAt), ...extra,
  });
  const dutyOf = async (streamId) => ((await db.doc(P.duty(streamId)).get()).data()) || null;
  const mainIdOf = (s) => (typeof s.afterShowOf === "string" && s.afterShowOf ? s.afterShowOf : s.id);

  // ---------- dropOpen ----------
  const dropOpen = async (request) => {
    const uid = ctx.crew.requireAuth(request);
    const w = await ctx.crew.who(uid);
    const data = request.data || {};
    if (!idOk(data.badgeId)) throw fail("invalid-argument", "Pick a badge.", "args");
    const stream = await ctx.target(data);
    const [duty, bs] = await Promise.all([dutyOf(stream.id), badgeRef(data.badgeId).get()]);
    const badge = bs.exists ? bs.data() : null;
    const dropId = DL.dropIdOf(stream.id, data.badgeId);
    const mainId = mainIdOf(stream);
    const at = now();
    let value;
    await db.runTransaction(async (tx) => {
      const reads = [tx.get(dropRef(dropId)), tx.get(ctx.controlRef(stream.id))];
      if (mainId !== stream.id) reads.push(tx.get(ctx.controlRef(mainId)));
      const [ds, cs, ms0] = await Promise.all(reads);
      const control = cs.data() || {}, mainControl = mainId === stream.id ? control : ((ms0 && ms0.data()) || {});
      const r = DL.canOpen({ caller: w, duty, stream, badge, badgeId: data.badgeId, existing: ds.exists ? ds.data() : null, openPointer: control.drop || null,
        rush: mainControl.recruitRush || null, input: { minutes: data.minutes, untilEnd: data.untilEnd, cap: data.cap, source: data.source }, nowMs: at });
      if (!r.ok) throw raise(r);
      value = r.value;
      const d = {
        streamId: stream.id, badgeId: data.badgeId, name: badge.name || data.badgeId, art: typeof badge.art === "string" ? badge.art : badge.emoji || null, rarity: badge.rarity || 1,
        mode: value.mode, minutes: value.minutes, cap: value.cap, winners: value.winners, status: "open",
        openedAt: TS(at), closesAt: TS(value.closesAt), maxClosesAt: TS(value.maxClosesAt), closedAt: null, graceUntil: null, closedBy: null,
        droppedBy: { uid, handle: w.handle || null, as: value.as }, source: value.source, extensions: [], claims: 0, winnersOut: [],
      };
      tx.set(dropRef(dropId), d);
      tx.set(ctx.controlRef(stream.id), { drop: pointerOf(dropId, d) }, { merge: true });
      if (value.source === "rush") tx.set(ctx.controlRef(mainId), { recruitRush: { rushDropId: dropId } }, { merge: true });
    });
    await logDrop(w, { action: "dropOpen", dropId, title: badge.name, details: { streamId: stream.id, badgeId: data.badgeId, mode: value.mode, minutes: value.minutes, cap: value.cap, source: value.source, as: value.as } });
    await publish();
    return { ok: true, dropId, mode: value.mode, closesAt: value.closesAt, maxClosesAt: value.maxClosesAt, cap: value.cap };
  };

  // ---------- dropAdjust ----------
  const dropAdjust = async (request) => {
    const uid = ctx.crew.requireAuth(request);
    const w = await ctx.crew.who(uid);
    const data = request.data || {};
    if (!idOk(data.dropId)) throw fail("invalid-argument", "Say which drop.", "args");
    const first = await dropRef(data.dropId).get();
    if (!first.exists) throw raise({ reason: "noDrop", message: "That drop isn't there." });
    const streamId = first.get("streamId");
    const duty = await dutyOf(streamId);
    const at = now();
    let out, drop;
    await db.runTransaction(async (tx) => {
      const [ds, cs] = await Promise.all([tx.get(dropRef(data.dropId)), tx.get(ctx.controlRef(streamId))]);
      drop = ds.data();
      const r = DL.canAdjust({ caller: w, duty, drop, action: data.action, nowMs: at });
      if (!r.ok) throw raise(r);
      out = r;
      const ptr = ((cs.data() || {}).drop || null);
      const same = ptr && ptr.id === data.dropId;
      if (r.kind === "extend") {
        tx.update(dropRef(data.dropId), { closesAt: TS(r.patch.closesAt), extensions: FieldValue.arrayUnion({ by: { uid, handle: w.handle || null }, minutes: r.minutes, at: TS(at) }) });
        if (same) tx.set(ctx.controlRef(streamId), { drop: { ...ptr, closesAt: r.patch.closesAt } }, { merge: true });
      } else {
        tx.update(dropRef(data.dropId), { status: "closing", closedAt: TS(r.patch.closedAt), graceUntil: TS(r.patch.graceUntil), closedBy: "manual" });
        if (same) tx.set(ctx.controlRef(streamId), { drop: { ...ptr, state: "closing", closedAt: r.patch.closedAt, graceUntil: r.patch.graceUntil } }, { merge: true });
      }
    });
    await logDrop(w, { action: out.kind === "extend" ? "dropExtend" : "dropClose", dropId: data.dropId, title: drop.name, details: out.kind === "extend" ? { minutes: out.minutes } : { closedBy: "manual" } });
    await publish();
    return { ok: true, dropId: data.dropId, ...(out.kind === "extend" ? { closesAt: out.patch.closesAt } : { status: "closing", graceUntil: out.patch.graceUntil }) };
  };

  // ---------- claimDrop ----------
  /** Grants a claim's badge (idempotent through the ledger) and records the result on the claim. */
  async function grantClaim(dropId, drop, uid) {
    const r = await G().grantBadge(uid, drop.badgeId, { feature: FEATURE, ref: `drop-${dropId}`, reason: `Live drop: ${drop.name}`, quiet: true });
    const result = r.granted ? "granted" : ["held", "paid"].includes(r.reason) ? "already" : null;
    if (!result) { console.error("drops: grant refused", drop.badgeId, r.reason); throw fail("failed-precondition", "That badge couldn't be granted right now. Try again.", "grant"); }
    await claimRef(dropId, uid).update({ result });
    return result;
  }
  const badgeOut = (d) => ({ id: d.badgeId, name: d.name, art: d.art || null, rarity: d.rarity || 1 });
  const claimDrop = async (request) => {
    const uid = ctx.crew.requireAuth(request);
    const data = request.data || {};
    if (!idOk(data.dropId)) throw fail("invalid-argument", "Say which drop.", "args");
    const w = await ctx.crew.who(uid);
    const at = now();
    let res, drop;
    await db.runTransaction(async (tx) => {
      const [ds, cl] = await Promise.all([tx.get(dropRef(data.dropId)), tx.get(claimRef(data.dropId, uid))]);
      drop = ds.exists ? ds.data() : null;
      const capped = drop && drop.cap != null;
      const capSnap = capped ? await tx.get(shardRef(data.dropId, "cap")) : null;
      const count = capped ? (capSnap.exists ? capSnap.get("claims") || 0 : 0) : 0;
      const r = DL.canClaim({ drop, caller: { uid, handle: w.handle }, existingClaim: cl.exists ? cl.data() : null, count, nowMs: at });
      if (!r.ok) throw raise(r);
      res = r;
      if (r.repeat) return;
      tx.create(claimRef(data.dropId, uid), { uid, handle: w.handle, at: TS(at), kind: r.kind, inGrace: r.inGrace, result: r.kind === "entry" ? "entered" : "pending" });
      if (capped) tx.set(shardRef(data.dropId, "cap"), { claims: count + 1 }, { merge: true });
      else tx.set(shardRef(data.dropId, shardOf(uid)), { claims: FieldValue.increment(1) }, { merge: true });
      tx.set(db.doc(P.presence(drop.streamId, uid)), { uid, drops: FieldValue.increment(1), expireAt: TS(at + PRESENCE_TTL_MS) }, { merge: true });
    });
    let result = res.repeat ? res.result : res.kind === "entry" ? "entered" : "pending";
    if (result === "pending") result = await grantClaim(data.dropId, drop, uid);   // a first claim, or a repeat whose grant didn't finish
    if (!res.repeat && ctx.requestFlush) { try { await ctx.requestFlush(); } catch (err) { console.error("drops: flush request failed", String((err && err.message) || err).slice(0, 140)); } }
    return { ok: true, dropId: data.dropId, result, repeat: !!res.repeat, badge: badgeOut(drop) };
  };

  // ---------- closing and finishing ----------
  /** open -> closing (the grace starts), in a transaction that re-checks the status. Returns true when it moved it. */
  async function startClosing(dropId, closedBy, atMs) {
    let moved = false, d = null;
    await db.runTransaction(async (tx) => {
      moved = false;
      const ds = await tx.get(dropRef(dropId));
      d = ds.exists ? ds.data() : null;
      if (!d || d.status !== "open") return;
      const graceUntil = atMs + DL.D.graceMs;
      tx.update(dropRef(dropId), { status: "closing", closedAt: TS(atMs), graceUntil: TS(graceUntil), closedBy });
      moved = true;
      d = { ...d, status: "closing", closedAt: atMs, graceUntil };
    });
    if (moved) {
      const ptr = (await ctx.control(d.streamId)).drop;
      if (ptr && ptr.id === dropId) await ctx.controlRef(d.streamId).set({ drop: { ...ptr, state: "closing", closedAt: d.closedAt, graceUntil: d.graceUntil } }, { merge: true });
    }
    return moved ? d : null;
  }

  /** closing -> closed (or drawn), after the grace. The status move is the one place the activity entry is written, so it happens once. */
  async function finish(dropId) {
    const d0 = (await dropRef(dropId).get()).data();
    if (!d0 || d0.status !== "closing") return null;
    const count = await countOf(dropId);
    let winnerUids = [], handles = {};
    if (d0.mode === "draw") {
      const entries = (await db.collection(`${P.site}/drops/${dropId}/claims`).get()).docs.map((c) => c.data()).filter((c) => c.kind === "entry");
      handles = Object.fromEntries(entries.map((c) => [c.uid, c.handle || null]));
      const holders = new Set();
      for (const e of entries) if ((await db.doc(`${P.site}/profiles/${e.uid}/badges/${d0.badgeId}`).get()).exists) holders.add(e.uid);
      winnerUids = DL.pickWinners(entries.map((e) => e.uid), holders, d0.winners || 1, randomInt);
    }
    const status = d0.mode === "draw" ? "drawn" : "closed";
    const winnersOut = winnerUids.map((u) => ({ uid: u, handle: handles[u] || null }));
    let moved = false;
    await db.runTransaction(async (tx) => {
      moved = false;
      const ds = await tx.get(dropRef(dropId));
      if (!ds.exists || ds.get("status") !== "closing") return;
      tx.update(dropRef(dropId), { status, claims: count, winnersOut, finishedAt: TS(now()) });
      moved = true;
    });
    if (!moved) return null;
    if (d0.mode === "draw") {
      for (const u of winnerUids) {
        try { const r = await G().grantBadge(u, d0.badgeId, { feature: FEATURE, ref: `drop-${dropId}`, reason: `Live drop draw: ${d0.name}`, quiet: true }); if (!r.granted) console.error("drops: draw grant refused", r.reason); }
        catch (err) { console.error("drops: draw grant failed", String((err && err.message) || err).slice(0, 140)); }
      }
      const all = (await db.collection(`${P.site}/drops/${dropId}/claims`).get()).docs.filter((c) => c.get("kind") === "entry");
      for (let i = 0; i < all.length; i += 400) {
        const batch = db.batch();
        for (const c of all.slice(i, i + 400)) batch.update(c.ref, { result: winnerUids.includes(c.id) ? "won" : "lost" });
        await batch.commit();
      }
      await logDrop(null, { action: "dropDraw", dropId, title: d0.name, details: { entries: Object.keys(handles).length, winners: winnersOut.map((x) => x.handle) } });
    }
    const line = DL.summaryOf({ name: d0.name, mode: d0.mode, claims: count, winners: winnersOut.map((x) => x.handle) });
    if (line) await ctx.activity("badge-drop", line, { streamId: d0.streamId, dropId, badgeId: d0.badgeId });
    const ptr = (await ctx.control(d0.streamId)).drop;
    if (ptr && ptr.id === dropId) await ctx.controlRef(d0.streamId).set({ drop: { ...ptr, state: "closed", claims: count, winners: winnersOut.map((x) => x.handle).filter(Boolean), closedAt: ms(d0.closedAt) != null ? ms(d0.closedAt) : now() } }, { merge: true });
    return { status, claims: count, winners: winnersOut.length };
  }

  /** One sweep: one query, nothing else when no drop is open or closing. */
  async function sweep() {
    const snap = await db.collection(`${P.site}/drops`).where("status", "in", DL.OPEN_STATES).get();
    if (snap.empty) return { idle: true };
    const out = { closed: 0, finished: 0 };
    for (const doc of snap.docs) {
      try {
        const d = doc.data(), nowMs = now();
        const a = DL.sweepAction(d, d.status === "open" ? await countOf(doc.id) : 0, nowMs);
        if (a.action === "close" && await startClosing(doc.id, a.closedBy, a.at != null ? a.at : nowMs)) out.closed++;
        else if (a.action === "finish" && await finish(doc.id)) out.finished++;
      } catch (err) { console.error("dropSweep: drop failed", doc.id, String((err && err.message) || err).slice(0, 140)); }
    }
    if (out.closed || out.finished) await publish();
    return out;
  }
  const dropSweep = onSchedule({ schedule: "every 1 minutes", timeoutSeconds: 60 }, async () => { await sweep(); });

  /** Stop / auto-end: the open drop of this stream goes to closing; dropSweep finishes it after the grace (a draw still draws). */
  async function stopClose(streamId, { auto = false, actor = null } = {}) {
    const ptr = (await ctx.control(streamId)).drop;
    if (!ptr || ptr.state !== "open") return null;
    const d = await startClosing(ptr.id, auto ? "autoEnd" : "stop", now());
    if (d) await logDrop(actor, { action: "dropStopClose", dropId: ptr.id, title: d.name, details: { closedBy: auto ? "autoEnd" : "stop" } });
    return d;
  }

  return {
    functions: { dropOpen: onCall(dropOpen), dropAdjust: onCall(dropAdjust), claimDrop: onCall(claimDrop), dropSweep },
    ops: { dropOpen, dropAdjust, claimDrop },
    sweep, finish, stopClose, countOf,
  };
};

module.exports.SHARDS = SHARDS;
