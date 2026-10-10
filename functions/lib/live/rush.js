// Recruit Rush (docs/specs/mod-machina.md §17a "Recruit Rush", choice 8; Mod Machina phase 3 part 6). Built on the Control Room's ctx (core.js).
//
//   liveRecruitRush({ streamId, on, goal, reward })   owner only. goal 5 to 200, reward 1 to 80 characters. Before or during a stream, never
//                                                     after Stop. One Rush per main stream: an after-show's id resolves to its main stream.
//                                                     The goal can't change after it's hit. adminLog "recruitRush".
//   onUserCreatedRush                                 trigger on users/{uid}: counts the moment signedUpAt first appears (a finished signup,
//                                                     decided Oct 9, 2026: Twitch sign-in creates users/{uid} before the signup is done, and
//                                                     the role mirror can merge-create it, so a bare create isn't a new member). Counts while
//                                                     a Rush is on, from Start to 30 minutes after Stop, referral link or not.
//
// Stored on streams/{id}/private/control.recruitRush { on, goal, reward, count, hitAt } (owner and A2+). The count goes through the
// counter shards ({ rush: n } next to beats), so onCheckInWritten queues the same debounced liveFlush and public/live gets
// recruitRush { goal, count, reward, hitAt } (logic.publicRush; nothing when off). streams/{id}/rushJoins/{uid} is the server-only
// marker (30 days, TTL) that makes a retry count once; no uid or handle of a new member ever reaches public/live. Referral credit (§9) is untouched.
const { onCall } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const L = require("./logic");
const { P, SHARDS, shardOf } = require("./core");

module.exports = function rush(ctx) {
  const { db, Timestamp, fail, now, ms } = ctx;
  const joinRef = (sid, uid) => db.doc(`${P.stream(sid)}/rushJoins/${uid}`);
  const shardRefs = (sid) => Array.from({ length: SHARDS }, (_, n) => db.doc(P.counter(sid, n)));
  const mainOf = async (s) => (typeof s.afterShowOf === "string" && s.afterShowOf ? ctx.loadStream(s.afterShowOf) : s);

  const liveRecruitRush = onCall(async (request) => {
    const w = await ctx.requireStaff(request, { ownerOnly: true });
    const data = request.data || {};
    if (typeof data.streamId !== "string" || !data.streamId) throw fail("invalid-argument", "streamId is required.", "args");
    const s = await mainOf(await ctx.loadStream(data.streamId));
    let out;
    await db.runTransaction(async (tx) => {
      const cRef = ctx.controlRef(s.id);
      const [cs, ...shards] = await Promise.all([tx.get(cRef), ...shardRefs(s.id).map((r) => tx.get(r))]);
      const cur = (cs.data() || {}).recruitRush || null;
      const v = L.rushSettings(data, cur, s);
      if (!v.ok) throw fail(v.reason === "ended" ? "failed-precondition" : "invalid-argument", v.message, v.reason);
      const count = L.sumRush(shards.map((d) => d.data()));
      // a goal already met (lowered to the count, or turned on late) is hit now; hitAt is set once and never moves
      const hitAt = cur && cur.hitAt != null ? cur.hitAt : v.value.on && count >= v.value.goal ? Timestamp.fromMillis(now()) : null;
      out = { ...v.value, count, hitAt };
      tx.set(cRef, { recruitRush: out }, { merge: true });
    });
    await ctx.logAdmin(w, { action: "recruitRush", streamId: s.id, title: s.title, details: { on: out.on, goal: out.goal, reward: out.reward } });
    try { await ctx.publishLive(); } catch (err) { console.error("rush: publish failed", String((err && err.message) || err).slice(0, 120)); }
    return { ok: true, streamId: s.id, on: out.on, goal: out.goal, reward: out.reward, count: out.count, hitAt: out.hitAt == null ? null : ms(out.hitAt) };
  });

  /** The main streams a sign-up could count for: the live one (or its main, during an after-show) and anything that ended in the last 30 minutes. */
  async function candidates(atMs) {
    const out = new Map();
    const add = async (s) => { if (!s) return; const m = await mainOf(s); if (!out.has(m.id)) out.set(m.id, m); };
    await add(await ctx.liveStream());
    const ended = await db.collection(P.streams).where("state", "==", "ended").orderBy("actualEnd", "desc").limit(3).get();
    for (const d of ended.docs) if (atMs - ms(d.get("actualEnd")) <= L.RUSH.afterStopMs + 60000) await add({ id: d.id, ...d.data() });
    return [...out.values()];
  }

  /** Counts one finished signup into the Rush of stream `s`. Idempotent per (stream, uid). Returns true when it counted. */
  async function countJoin(s, uid, atMs) {
    if (!L.rushCounts(s, atMs)) return false;
    let counted = false;
    await db.runTransaction(async (tx) => {
      counted = false;
      const cRef = ctx.controlRef(s.id), jRef = joinRef(s.id, uid), refs = shardRefs(s.id);
      const [cs, js, ...shards] = await Promise.all([tx.get(cRef), tx.get(jRef), ...refs.map((r) => tx.get(r))]);
      const r = (cs.data() || {}).recruitRush;
      if (!r || r.on !== true || js.exists) return;
      const count = L.sumRush(shards.map((d) => d.data())) + 1;
      tx.set(jRef, { at: Timestamp.fromMillis(atMs), expireAt: Timestamp.fromMillis(atMs + 30 * 24 * 3600000) });   // the window is long closed by then (TTL)
      tx.set(refs[shardOf(uid)], { rush: ctx.FieldValue.increment(1) }, { merge: true });
      const patch = { "recruitRush.count": count };
      if (r.hitAt == null && count >= r.goal) patch["recruitRush.hitAt"] = Timestamp.fromMillis(now());
      tx.update(cRef, patch);
      counted = true;
    });
    return counted;
  }

  const onUserCreatedRush = onDocumentWritten("users/{uid}", async (event) => {
    const before = event.data && event.data.before, after = event.data && event.data.after;
    if (!after || !after.exists) return;
    if (before && before.exists && before.get("signedUpAt") != null) return;   // only the first time signedUpAt appears
    const at = after.get("signedUpAt");
    if (at == null) return;
    const atMs = ms(at);
    for (const s of await candidates(atMs)) {
      if (await countJoin(s, event.params.uid, atMs)) return;                   // one Rush per signup
    }
  });

  return { functions: { liveRecruitRush, onUserCreatedRush }, countJoin };
};
