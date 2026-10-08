// Control Room, check-ins and presence (docs/specs/control-room.md §4, §6, §12, §13).
//
//   streamCheckIn({ word, room })   member callable: validates with logic.validateCheckIn, writes the member's own presence doc
//                                   and bumps a counter shard in ONE transaction; pays through the Trophy Room; fires Night Shift
//   liveUnlock({ uid, beat })       crew on duty (any active mod, or an admin): gives a locked-out member their tries back
//   settle(streamId)                at Stop / auto-end: the all-beats bonus and the stream-present events (idempotent)
//
// Presence (streams/{id}/presence/{uid}, the member reads their own, admins read all, expires after 13 months):
//   { uid, beats: { <beat>: { room, at, crew? } }, wrongTries: { <beat>: n }, xpEarned, crew?, noPrize?, twitchBuckets?, drops?, expireAt }
// Counters (streams/{id}/counters/{0-9}, owner + A2+): { beats: { <beat>: { <room>: n } } }, one shard per member (hash of the uid).
//
// REWARDS. Every XP grant goes through lib/rewards/grant.js grantXp(uid, amount, { feature: "live", ref: <grantKey>, reason }).
// The ledger id is "live:<ref>:<uid>"; ref is logic.grantKey(), e.g. "<streamId>:break1:<uid>:checkin" (the uid appears twice, which
// is harmless: the id stays unique and one action can never pay twice). The 100 XP cap per member per stream (logic.capPayout)
// counts what presence.xpEarned says was paid. Night Shift events go through factory/record.js recordFactoryEvent(uid, "stream",
// { action, beat, room }, <grantKey>): the registry type is "stream" (Stream presence) and `action` is checkin | all-beats | present
// | first-in, the spec's stream-checkin, stream-all-beats, stream-present and first-in keys.
//
// Crew: a seated crew member is present for a beat automatically (liveCheckInWindow writes it when a window opens), with no check-in
// XP; any other admin or active mod who checks in with the word is recorded too but paid nothing ("no prizes", Mod Machina).
// The owner hosts: the owner cannot check in.
const { onCall } = require("firebase-functions/v2/https");
const L = require("./logic");
const { P, shardOf, PRESENCE_TTL_MS } = require("./core");

const ERRORS = {
  noWindow: ["failed-precondition", "There's no check-in open right now."],
  windowClosed: ["failed-precondition", "That check-in has closed."],
  badRoom: ["invalid-argument", "Pick where you're watching."],
  lockedOut: ["resource-exhausted", "Too many tries for this beat. A crew member can unlock you."],
  empty: ["invalid-argument", "Type the word."],
  wrongWord: ["failed-precondition", "That's not the word."],
};

module.exports = function checkin(ctx, { grant = null, factory = null } = {}) {
  const { db, FieldValue, Timestamp, fail, now } = ctx;
  const G = () => grant || (grant = require("../rewards/grant").makeGrant({ db }));
  const F = () => factory || (factory = require("../factory/record").makeFactory({ db, grant: G() }));

  async function recordEvent(uid, action, params, ref) {
    try { return await F().recordFactoryEvent(uid, "stream", { action, ...params }, ref); }
    catch (err) { console.error(`live: Night Shift event ${action} failed`, String((err && err.message) || err).slice(0, 160)); return null; }
  }
  /**
   * One planned grant through the Trophy Room under the per-stream cap. Returns the XP actually added to the member's
   * running total (0 when already paid, capped away, or no profile). Never throws for a reward problem.
   */
  async function payXp(kind, ctx2, earned, settings, reason) {
    const plan = L.planGrant(kind, ctx2, earned, settings);
    if (plan.paid <= 0) return { plan, paid: 0 };
    try {
      const r = await G().grantXp(ctx2.uid, plan.paid, { feature: "live", ref: plan.key, reason });
      return { plan, paid: r.granted ? plan.paid : 0, result: r };
    } catch (err) { console.error(`live: grant ${plan.key} failed`, String((err && err.message) || err).slice(0, 160)); return { plan, paid: 0 }; }
  }

  // ---------- streamCheckIn ----------
  const streamCheckIn = async (request) => {
    const uid = ctx.crew.requireAuth(request);
    const w = await ctx.crew.who(uid);
    const profile = await db.doc(`${P.site}/profiles/${uid}`).get();
    if (!profile.exists) throw fail("failed-precondition", "Finish signing up first.", "needsSignup");
    if (w.isOwner) throw fail("failed-precondition", "You host the stream. The owner doesn't check in.", "ownerHosts");
    const data = request.data || {};
    const stream = await ctx.liveStream();
    if (!stream || (data.streamId != null && data.streamId !== stream.id)) throw fail(...ERRORS.noWindow, "noWindow");
    const settings = await ctx.settings();
    // The edge: aliases (youtube, ytv) become canonical rooms here and nowhere else.
    let room = data.room == null ? null : L.normaliseRoom(data.room);
    if (stream.type === "backstage" && data.room == null) room = "site";
    const seat = (await ctx.seatedCrew(stream.id)).find((s) => s.uid === uid) || null;
    const onDuty = ctx.isCrewOnDuty(w);
    const at = now();
    const cRef = ctx.controlRef(stream.id), pRef = db.doc(P.presence(stream.id, uid)), shard = db.doc(P.counter(stream.id, shardOf(uid)));
    let out;
    await db.runTransaction(async (tx) => {
      const [cs, ps] = await Promise.all([tx.get(cRef), tx.get(pRef)]);
      const control = cs.data() || {}, presence = ps.exists ? ps.data() : null;
      const v = L.validateCheckIn({
        member: { uid, signedIn: true }, stream, window: control.window || null, answer: data.word, room, presence,
        crew: seat ? { clockedIn: true, room: seat.room || room } : null, nowMs: at,
      }, settings);
      if (!v.ok) {
        if (v.reason === "wrongWord") tx.set(pRef, { uid, wrongTries: { [control.window.beat]: v.wrongTries }, expireAt: Timestamp.fromMillis(at + PRESENCE_TTL_MS) }, { merge: true });
        out = { ...v, beat: control.window ? control.window.beat : null };
        return;
      }
      const base = { uid, beats: { [v.beat]: { room: v.room, at: Timestamp.fromMillis(at), ...(v.crew ? { crew: true } : {}) } }, expireAt: Timestamp.fromMillis(at + PRESENCE_TTL_MS) };
      if (v.crew) { tx.set(pRef, { ...base, crew: true }, { merge: true }); out = { ...v, position: null }; return; }
      tx.set(pRef, { ...base, ...(onDuty ? { noPrize: true } : {}) }, { merge: true });
      tx.set(shard, { beats: { [v.beat]: { [v.room]: FieldValue.increment(1) } } }, { merge: true });
      const firstIn = ((control.firstIn || {})[v.beat]) || [];
      let position = null;
      if (firstIn.length < 3 && !onDuty) { position = firstIn.length + 1; tx.update(cRef, { [`firstIn.${v.beat}`]: [...firstIn, { uid, handle: w.handle || null }] }); }
      out = { ...v, position, earned: (presence && presence.xpEarned) || 0 };
    });
    if (!out.ok) {
      if (out.reason === "already") return { ok: true, already: true, beat: out.beat };
      if (out.reason === "signedOut") throw fail("unauthenticated", "Sign in first.", "signedOut");
      const [code, msg] = ERRORS[out.reason] || ["failed-precondition", "That didn't work."];
      throw fail(code, msg, out.reason, out.reason === "wrongWord" || out.reason === "lockedOut" || out.reason === "empty" ? { triesLeft: out.triesLeft, locked: !!out.locked } : {});
    }
    if (out.crew) return { ok: true, crew: true, beat: out.beat, room: out.room, xp: 0 };

    // Rewards: only members are paid; the first three of a beat are named and fire first-in (no XP).
    const gctx = { streamId: stream.id, uid, beat: out.beat, crew: onDuty };
    const pay = await payXp("checkin", gctx, out.earned, settings, `Check-in · ${out.beat}`);
    if (pay.paid > 0) await db.doc(P.presence(stream.id, uid)).update({ xpEarned: FieldValue.increment(pay.paid) });
    if (!onDuty) {
      await recordEvent(uid, "checkin", { beat: out.beat, room: out.room }, pay.plan.key);
      if (out.position) await recordEvent(uid, "first-in", { beat: out.beat }, L.grantKey("firstIn", gctx));
    }
    return { ok: true, beat: out.beat, room: out.room, xp: pay.paid, capped: pay.plan.capped, firstIn: out.position || null, triesLeft: out.triesLeft };
  };

  // ---------- liveUnlock ----------
  const liveUnlock = async (request) => {
    const w = await ctx.requireCrew(request);
    const data = request.data || {};
    if (!L.BEATS.includes(data.beat)) throw fail("invalid-argument", "That isn't a beat.", "badBeat");
    if (typeof data.uid !== "string" || !data.uid || data.uid.includes("/")) throw fail("invalid-argument", "Say who to unlock.", "args");
    const stream = await ctx.target(data);
    if (stream.state !== "live") throw fail("failed-precondition", "That stream isn't live.", "notLive");
    const ref = db.doc(P.presence(stream.id, data.uid));
    const snap = await ref.get();
    if (!snap.exists) throw fail("not-found", "They haven't tried this stream.", "noPresence");
    const tries = L.unlockTries(snap.get("wrongTries"), data.beat);
    await ref.update({ wrongTries: tries });
    await ctx.logAdmin(w, { action: "unlock", streamId: stream.id, title: stream.title, details: { beat: data.beat, member: data.uid } });
    return { ok: true, streamId: stream.id, beat: data.beat };
  };

  // ---------- settle ----------
  /** At the end of a stream: the all-beats bonus and stream-present for everyone with a presence doc. Safe to run twice. */
  async function settle(streamId) {
    try {
      const stream = await ctx.loadStream(streamId);
      const settings = await ctx.settings();
      const docs = (await db.collection(P.presenceCol(streamId)).get()).docs;
      let bonus = 0, present = 0;
      for (const d of docs) {
        const p = d.data(), uid = d.id;
        const pres = L.streakPresence({ beats: p.beats, twitchBuckets: p.twitchBuckets, drops: p.drops, crew: p.crew }, settings);
        if (!p.crew && !p.noPrize && L.qualifiesAllBeats(stream.beats, p.beats)) {
          const gctx = { streamId, uid };
          const pay = await payXp("allBeats", gctx, p.xpEarned || 0, settings, "All beats");
          if (pay.paid > 0) await d.ref.update({ xpEarned: FieldValue.increment(pay.paid) });
          await recordEvent(uid, "all-beats", {}, pay.plan.key);
          bonus++;
        }
        if (pres.present) { await recordEvent(uid, "present", { why: pres.why[0] }, L.grantKey("present", { streamId, uid })); present++; }
      }
      return { members: docs.length, bonus, present };
    } catch (err) {
      console.error(`live: settle ${streamId} failed`, String((err && err.message) || err).slice(0, 200));
      return { members: 0, bonus: 0, present: 0, failed: true };
    }
  }
  ctx.settle = settle;

  return {
    functions: { streamCheckIn: onCall(streamCheckIn), liveUnlock: onCall(liveUnlock) },
    ops: { streamCheckIn, liveUnlock }, helpers: { settle, payXp, recordEvent },
  };
};
