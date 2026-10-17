// The Prize Box live draw (docs/specs/prize-box.md §4). Built by lib/live/index.js with the Control Room's ctx, so its callables are lib/live
// functions (they rebuild public/live through ctx.publishLive). Owner only, except prizeHere (the picked member).
//
//   prizeDrawStart   owner    snapshots the pool from the stream's presence docs (checked in, minus crew, admins, the owner, the cooldown and the
//                            contest's filters) and puts the draw on stage. Refused while a Chat Game runs, or while another draw is on. { rerun: true }
//                            reruns a draw the stream's end voided, from the same pool snapshot.
//   prizeDrawSpin    owner    { round: 1 } spins Round 1 (the group slices; a group with fewer than 2 members is "Spin again"); { round: 2 } puts
//                            10 random members of the (group's) pool on the wheel (empty blades are "Spin again") and spins for the winner.
//                            Fewer than 2 members: no spin. The spin is decided here, before anything moves: { pickIndex, offset 0.2–0.8,
//                            spins 5–6, durationMs 7200–8400, startAt }, chained while it lands on Spin again, saved with the draw.
//   prizeHere        member   the picked member taps I'm here within hereSeconds (60) of the landing: the winner is confirmed (awardWinner).
//   prizeRespin      owner    "Respin without them": a new Round 2 among the rest. The I'm here timeout does the same on its own (a Cloud Task,
//                            prizeHereTimeout, with prizeTick's drawTick as the backstop).
//   prizeDrawEnd     owner    Done (after a winner), or stops the draw (void; the contest goes back to scheduled).
// Stop and the 12 h auto-end call onStreamEnd: a draw still running is void and can be rerun later from the same pool snapshot.
//
// Where it lives: contests/{id}/draws/{drawId} (admins: the pool snapshot with uids, both rounds, every spin, respins with reasons, times, the result),
// prizeBox/main.activeDraw { contestId, drawId, streamId } (one draw at a time), and the pointer streams/{id}/private/control.prizeDraw, which
// buildPublicLive copies to public/live.prizeDraw with handles only (lib/live/logic.js prizeDrawOf: never a uid).
const { onCall } = require("firebase-functions/v2/https");
const { onTaskDispatched } = require("firebase-functions/v2/tasks");
const PL = require("./logic");
const LL = require("../live/logic");
const { raise, idStr } = require("../boards");

const HERE_QUEUE = { retryConfig: { maxAttempts: 3, minBackoffSeconds: 2, maxBackoffSeconds: 30 }, rateLimits: { maxDispatchesPerSecond: 5, maxConcurrentDispatches: 2 } };
const AGAIN_GAP_MS = 1300;     // a "Spin again" landing, then the next spin starts
const HERE_GRACE_MS = 2500;    // a tap that left the phone just before the end still counts
const ACTIVE = ["pool", "round1", "round2", "here", "noSpin"];

module.exports = function makeDraw(ctx, { grant = null, enqueue = null, rand = undefined, core = null } = {}) {
  const { db, FieldValue, Timestamp, fail, now } = ctx;
  // The Prize Box core (awardWinner, standings, settings): grant only, no Cloudinary, so lib/live can build it.
  const pb = core || require("./index").build({ db, adminLogEntry: ctx.adminLogEntry, now, ...(grant ? { grant } : {}) }).hooks;
  const R = pb.R;
  const drawRef = (cid, id) => db.doc(`${pb.base}/contests/${cid}/draws/${id}`);
  const doEnqueue = enqueue || (async (data, opts) => {
    const { getFunctions } = require("firebase-admin/functions");
    await getFunctions().taskQueue("prizeHereTimeout").enqueue(data, opts);
  });
  const randInt = rand || undefined;

  const owner = (request) => ctx.requireStaff(request, { ownerOnly: true });
  const log = (actor, action, contest, details) => pb.adminLog({ uid: actor && actor.uid ? actor.uid : null, name: actor ? actor.name : "Automatic" }, { action, id: contest.id, title: contest.title, details });

  async function active() {
    const a = ((await R.main().get()).data() || {}).activeDraw || null;
    if (!a) return null;
    const [c, d] = await Promise.all([pb.loadContest(a.contestId), drawRef(a.contestId, a.drawId).get()]);
    if (!c || !d.exists) return null;
    return { ...a, contest: c, draw: d.data() };
  }
  async function mustActive(drawId) {
    const a = await active();
    if (!a || (drawId && a.drawId !== drawId)) throw fail("failed-precondition", "That draw isn't running.", "noDraw");
    return a;
  }

  /** The pointer on the stage (control) and the public copy (publishLive). Never a uid: handles, counts and the decided spins only. */
  function pointerOf(contest, drawId, d) {
    const r = d.round2 && d.status !== "round1" && d.status !== "pool" ? d.round2 : d.round1 && d.status === "round1" ? d.round1 : null;
    const round = d.status === "round1" ? 1 : d.round2 ? 2 : d.round1 ? 1 : 0;
    const prize = (contest.prizes || [])[0] || {};
    return {
      drawId, contestId: contest.id, contestSlug: contest.slug, contestTitle: contest.title, prizeTitle: prize.title || null,
      phase: d.status, round, rounds: d.useRound1 ? 2 : 1,
      labels: r ? r.labels : null,
      groups: d.round1 ? d.round1.slices.map((s) => ({ label: s.group, count: s.count })) : null,
      groupPick: d.round1 && d.round1.chosen != null ? { index: d.round1.chosen, label: d.round1.slices[d.round1.chosen].group, count: d.round1.slices[d.round1.chosen].count } : null,
      spins: r && r.spins ? r.spins.map((s) => ({ pickIndex: s.pickIndex, offset: s.offset, spins: s.spins, durationMs: s.durationMs, startAt: s.startAt, again: !!s.again })) : [],
      picked: d.here ? { handle: d.here.handle, index: d.here.index } : null,
      hereUntil: d.here ? d.here.until : null, hereSeconds: d.hereSeconds,
      winner: d.result ? { handle: d.result.handle } : null,
      pool: d.counts, respins: (d.respins || []).length, updatedAt: now(),
    };
  }
  async function stage(streamId, contest, drawId, d) {
    await ctx.controlRef(streamId).set({ prizeDraw: d ? pointerOf(contest, drawId, d) : null }, { merge: true });
    await ctx.publishLive();
  }

  // ---------------------------------------------------------------- the pool (spec §4.2)
  async function snapshot(contest, stream) {
    const presence = (await db.collection(ctx.P.presenceCol(stream.id)).get()).docs.map((x) => x.data());
    const ownerUid = await pb.ownerUid();
    const filters = [...(contest.eligibility || []), ...(contest.round1 || []).map((g) => g.filter)];
    const needNs = filters.some((f) => f && f.kind === "nightShiftTop");
    const counts = { checkedIn: 0, crew: 0, cooldown: 0, filtered: 0, inDraw: 0 };
    const pool = [];
    for (const pr of presence) {
      if (!pr.uid) continue;
      // crew and on-duty check-ins never count, but they are counted as "left out" so the panel's numbers add up
      if (!pr.beats || !Object.keys(pr.beats).length) continue;
      counts.checkedIn++;
      if (pr.crew || pr.noPrize) { counts.crew++; continue; }
      const everyBeat = LL.qualifiesAllBeats(stream.beats || {}, pr.beats);
      const nsRank = needNs ? await pb.nightShiftRank(pr.uid) : null;
      const st = await pb.standingOf(pr.uid, { ...contest, eligibility: filters.filter((f) => f && f.kind !== "everyone") }, { ownerUid, everyBeat, nsRank });
      const why = PL.ineligible(st, { ...contest, eligibility: [] }, now());   // who can win at all
      if (why) { counts[why.reason === "cooldown" ? "cooldown" : why.reason === "crew" ? "crew" : "filtered"]++; continue; }
      if ((contest.eligibility || []).some((f) => PL.filterMiss(f, st, now()))) { counts.filtered++; continue; }
      pool.push({ uid: pr.uid, handle: st.profile.handle, everyBeat, nsRank: nsRank || null, joinedAt: PL.ms(st.member && st.member.joinedAt), badges: [...st.badges] });
    }
    counts.inDraw = pool.length;
    return { pool, counts };
  }
  const inGroup = (m, f, at) => !f || f.kind === "everyone" || !PL.filterMiss(f, { badges: new Set(m.badges || []), nsRank: m.nsRank, member: { joinedAt: m.joinedAt }, everyBeat: m.everyBeat }, at);

  /** Spins, decided now: chained while they land on an empty (Spin again) blade. `real(i)` says whether blade i is a real pick. */
  function chain(real, at) {
    const out = [];
    let start = at;
    for (let n = 0; n < 40; n++) {
      const s = PL.planSpin({ now: start, leadMs: n === 0 ? 1500 : AGAIN_GAP_MS, ...(randInt ? { rand: randInt } : {}) });
      const again = !real(s.pickIndex);
      out.push({ ...s, again });
      if (!again) return out;
      start = s.startAt + s.durationMs;
    }
    throw fail("internal", "The wheel couldn't land. Try again.", "spin");
  }
  const lastOf = (spins) => spins[spins.length - 1];
  const endOf = (spins) => lastOf(spins).startAt + lastOf(spins).durationMs;

  // ---------------------------------------------------------------- prizeDrawStart
  async function start(request) {
    const w = await owner(request);
    const { contestId, rerun = false, useRound1 = true } = request.data || {};
    const contest = await pb.loadContest(contestId);
    if (!contest) throw fail("not-found", "This contest is no longer here.", "noContest");
    if (contest.type !== "live") throw fail("failed-precondition", "Only live contests are drawn on stream.", "notLive");
    if (contest.status !== "scheduled") throw fail("failed-precondition", contest.status === "drawing" ? "This draw is already running." : "Publish the contest first.", "status");
    const stream = await ctx.liveStream();
    if (!stream) throw fail("failed-precondition", "Start the stream first.", "notLive");
    const control = await ctx.control(stream.id);
    if (control.chatGame) throw fail("failed-precondition", "A Chat Game is running. End it first.", "chatGame");
    if (await active()) throw fail("failed-precondition", "Another draw is running. Finish it first.", "busy");
    const st = await pb.settings();
    let pool, counts, rerunOf = null;
    if (rerun) {
      if (!contest.voidDrawId) throw fail("failed-precondition", "There's no voided draw to rerun.", "noVoid");
      const old = (await drawRef(contest.id, contest.voidDrawId).get()).data();
      if (!old) throw fail("not-found", "That draw record is gone.", "noVoid");
      pool = old.pool; counts = old.counts; rerunOf = contest.voidDrawId;
    } else ({ pool, counts } = await snapshot(contest, stream));
    const ref = db.collection(`${pb.base}/contests/${contest.id}/draws`).doc();
    const round1On = useRound1 !== false && (contest.round1 || []).length >= 2;
    const d = {
      streamId: stream.id, beat: (contest.draw && contest.draw.beat) || null, status: "pool", useRound1: round1On, hereSeconds: st.hereSeconds,
      pool, counts, round1: null, round2: null, here: null, respins: [], excluded: [], result: null, rerunOf,
      startedAt: now(), by: { uid: w.uid, name: w.name }, updatedAt: now(),
    };
    await db.runTransaction(async (tx) => {
      const m = await tx.get(R.main());
      if (m.exists && m.get("activeDraw")) throw fail("failed-precondition", "Another draw is running. Finish it first.", "busy");
      tx.set(ref, d);
      tx.set(R.main(), { activeDraw: { contestId: contest.id, drawId: ref.id, streamId: stream.id } }, { merge: true });
      tx.update(R.contest(contest.id), { status: "drawing", updatedAt: FieldValue.serverTimestamp(), ...(rerun ? { voidDrawId: FieldValue.delete() } : {}) });
    });
    await stage(stream.id, contest, ref.id, d);
    await log(w, rerun ? "draw-rerun" : "draw-start", contest, { drawId: ref.id, streamId: stream.id, counts });
    await pb.rebuildQuietly();
    return { ok: true, drawId: ref.id, counts, round1: round1On };
  }

  // ---------------------------------------------------------------- prizeDrawSpin
  async function spin(request) {
    const w = await owner(request);
    const { drawId, round } = request.data || {};
    const a = await mustActive(drawId);
    const { contest, draw: d } = a;
    const at = now();
    if (round === 1) {
      if (!d.useRound1 || d.status !== "pool") throw fail("failed-precondition", "Round 1 isn't next.", "round");
      const slices = (contest.round1 || []).slice(0, PL.WHEEL).map((g) => ({ group: g.group, filter: g.filter, count: d.pool.filter((m) => inGroup(m, g.filter, at)).length }));
      const labels = Array.from({ length: PL.WHEEL }, (_, i) => (slices[i] && slices[i].count >= 2 ? slices[i].group : null));
      if (!labels.some(Boolean)) throw fail("failed-precondition", "No group has two members tonight. Spin for the winner instead.", "noGroups");
      const spins = chain((i) => !!labels[i], at);
      const chosen = lastOf(spins).pickIndex;
      d.round1 = { slices, labels, spins, chosen, at };
      d.status = "round1";
    } else {
      if (!["pool", "round1"].includes(d.status) || (d.useRound1 && !d.round1)) throw fail("failed-precondition", "Spin round 1 first.", "round");
      if (d.round1 && endOf(d.round1.spins) > at) throw fail("failed-precondition", "Round 1 is still spinning.", "spinning");
      const g = d.round1 ? d.round1.slices[d.round1.chosen] : null;
      const pool = d.pool.filter((m) => !g || inGroup(m, g.filter, at));
      Object.assign(d, roundTwo(pool, at, d));
    }
    d.updatedAt = at;
    await drawRef(contest.id, a.drawId).set(d);
    await stage(a.streamId, contest, a.drawId, d);
    if (d.status === "here") await scheduleTimeout(a, d);
    await log(w, round === 1 ? "draw-round1" : "draw-round2", contest, { drawId: a.drawId, spins: (round === 1 ? d.round1.spins : (d.round2 || {}).spins || []).length });
    return { ok: true, status: d.status, landsAt: d.here ? d.here.landsAt : d.round1 && round === 1 ? endOf(d.round1.spins) : null };
  }
  /** A fresh Round 2 among `pool` minus the excluded: blades, the chained spins, and the I'm here window from the landing. */
  function roundTwo(pool, at, d) {
    const left = pool.filter((m) => !(d.excluded || []).includes(m.uid));
    if (left.length < 2) return { status: "noSpin", round2: { blades: [], labels: Array(PL.WHEEL).fill(null), spins: [], at }, here: null };
    const { blades, labels } = PL.roundTwo(left, randInt);
    const spins = chain((i) => !!blades[i], at);
    const k = lastOf(spins).pickIndex, landsAt = endOf(spins);
    const seq = ((d.here && d.here.seq) || 0) + 1;
    return {
      status: "here",
      round2: { blades: blades.map((b) => (b ? { uid: b.uid, handle: b.handle } : null)), labels, spins, at, groupSize: pool.length },
      here: { uid: blades[k].uid, handle: blades[k].handle, index: k, landsAt, until: landsAt + d.hereSeconds * 1000, seq },
    };
  }
  async function scheduleTimeout(a, d) {
    const delay = Math.max(1, Math.ceil((d.here.until - now()) / 1000) + 1);
    try { await doEnqueue({ contestId: a.contestId, drawId: a.drawId, seq: d.here.seq }, { scheduleDelaySeconds: delay, id: `here-${a.drawId}-${d.here.seq}` }); }
    catch (err) { if (!/ALREADY_EXISTS|already exists/i.test(String((err && err.message) || err))) console.error("prizeBox: here timeout task failed (prizeTick is the backstop)", String((err && err.message) || err).slice(0, 160)); }
  }

  // ---------------------------------------------------------------- prizeHere (the picked member)
  async function here(request) {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw fail("unauthenticated", "Sign in first.", "signedOut");
    await pb.bump("here", uid);
    const a = await mustActive(request.data && request.data.drawId);
    const { contest, draw: d } = a;
    if (d.status === "won" && d.result && d.result.uid === uid) return { ok: true, already: true };   // a second tap after the win
    if (d.status !== "here" || !d.here || d.here.uid !== uid) throw fail("permission-denied", "The wheel didn't land on you this time.", "notPicked");
    const at = now();
    if (at < d.here.landsAt - HERE_GRACE_MS) throw fail("failed-precondition", "The wheel is still spinning.", "spinning");
    if (at > d.here.until + HERE_GRACE_MS) throw fail("failed-precondition", "Time ran out, so the wheel spins again.", "late");
    // confirm once: the draw doc moves to won inside a transaction, so a double tap can't award twice
    const ok = await db.runTransaction(async (tx) => {
      const s = await tx.get(drawRef(contest.id, a.drawId));
      const x = s.data();
      if (!x || x.status !== "here" || !x.here || x.here.uid !== uid || x.here.seq !== d.here.seq) return false;
      tx.update(drawRef(contest.id, a.drawId), { status: "won", result: { uid, handle: x.here.handle, at }, updatedAt: at });
      tx.update(R.contest(contest.id), { status: "won", wonAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      return true;
    });
    if (!ok) return { ok: true, already: true };
    const fresh = (await drawRef(contest.id, a.drawId).get()).data();
    await stage(a.streamId, contest, a.drawId, fresh);
    await pb.awardWinner({ contest, uid, handle: d.here.handle, place: 1, winnerId: a.drawId, showIfWin: true, drawId: a.drawId, by: null });
    await log(null, "draw-won", contest, { drawId: a.drawId, handle: d.here.handle });
    await pb.rebuildQuietly();
    return { ok: true, won: true };
  }

  // ---------------------------------------------------------------- prizeRespin (owner) and the timeout
  async function respinOf(a, reason, actor) {
    const { contest, draw: d } = a;
    if (d.status !== "here" || !d.here) throw fail("failed-precondition", "There's nobody to respin without.", "status");
    const at = now();
    d.respins = [...(d.respins || []), { uid: d.here.uid, handle: d.here.handle, reason, at }];
    d.excluded = [...new Set([...(d.excluded || []), d.here.uid])];
    const g = d.round1 ? d.round1.slices[d.round1.chosen] : null;
    const pool = d.pool.filter((m) => !g || inGroup(m, g.filter, at));
    Object.assign(d, roundTwo(pool, at, d));
    d.updatedAt = at;
    await drawRef(contest.id, a.drawId).set(d);
    await stage(a.streamId, contest, a.drawId, d);
    if (d.status === "here") await scheduleTimeout(a, d);
    await log(actor, "draw-respin", contest, { drawId: a.drawId, reason, without: d.respins[d.respins.length - 1].handle });
    return { ok: true, status: d.status };
  }
  async function respin(request) {
    const w = await owner(request);
    const a = await mustActive(request.data && request.data.drawId);
    return respinOf(a, "owner", w);
  }
  /** The I'm here window ran out: respin among the rest (the task, or prizeTick's backstop). Only for the same landing (seq). */
  async function timeout({ drawId, seq } = {}) {
    const a = await active();
    if (!a || a.drawId !== drawId || a.draw.status !== "here" || !a.draw.here || (seq != null && a.draw.here.seq !== seq)) return { skipped: true };
    if (now() < a.draw.here.until + HERE_GRACE_MS) return { skipped: true, early: true };
    return respinOf(a, "timeout", null);
  }
  /** prizeTick's backstop: a here window the task missed. */
  async function tick() {
    const a = await active();
    if (!a || a.draw.status !== "here" || !a.draw.here || now() < a.draw.here.until + HERE_GRACE_MS + 5000) return { changed: false };
    await respinOf(a, "timeout", null);
    return { changed: true, respun: a.drawId };
  }

  // ---------------------------------------------------------------- prizeDrawEnd (owner) and the stream's end
  async function finish(a, { status, reason, actor }) {
    const { contest, draw: d } = a;
    const won = d.status === "won";
    await db.runTransaction(async (tx) => {
      tx.update(drawRef(contest.id, a.drawId), { status: won ? "done" : status, voidReason: won ? null : reason, endedAt: now(), updatedAt: now() });
      tx.set(R.main(), { activeDraw: null }, { merge: true });
      if (!won) tx.update(R.contest(contest.id), { status: "scheduled", ...(status === "void" ? { voidDrawId: a.drawId } : {}), updatedAt: FieldValue.serverTimestamp() });
    });
    await stage(a.streamId, contest, a.drawId, null);
    await log(actor, won ? "draw-done" : status === "void" ? "draw-void" : "draw-stop", contest, { drawId: a.drawId, reason: won ? null : reason });
    await pb.rebuildQuietly();
    return { ok: true, status: won ? "done" : status };
  }
  async function end(request) {
    const w = await owner(request);
    const a = await mustActive(request.data && request.data.drawId);
    return finish(a, { status: "stopped", reason: "ended by the owner", actor: w });   // not rerunnable: the next draw takes a fresh pool
  }
  /** Stop / auto-end (lib/live controls afterEnd): a running draw is void and can be rerun from its pool snapshot. */
  async function onStreamEnd(streamId) {
    const a = await active();
    if (!a || a.streamId !== streamId) return { voided: false };
    if (a.draw.status === "won") { await finish(a, { status: "done", reason: null, actor: null }); return { voided: false, done: true }; }
    await finish(a, { status: "void", reason: "the stream ended", actor: null });
    return { voided: true };
  }

  /** What the viewer's /live card needs about themselves (prizeMine { draw: true }): in the pool, in the group, on the wheel, picked. */
  async function me(uid) {
    const a = await active();
    if (!a) return { draw: null };
    const d = a.draw, at = now();
    const m = (d.pool || []).find((x) => x.uid === uid) || null;
    const g = d.round1 && d.round1.chosen != null ? d.round1.slices[d.round1.chosen] : null;
    const blade = d.round2 && d.round2.blades ? d.round2.blades.findIndex((b) => b && b.uid === uid) : -1;
    return { draw: { drawId: a.drawId, inPool: !!m, inGroup: !!m && (!g || inGroup(m, g.filter, at)), blade: blade >= 0 ? blade : null, picked: !!(d.here && d.here.uid === uid && d.status === "here"), won: !!(d.result && d.result.uid === uid), winnerId: d.result && d.result.uid === uid ? a.drawId : null } };
  }

  const wrap = (fn) => async (request) => { try { return await fn(request); } catch (err) { if (err && err.ok === false) throw raise(err); throw err; } };
  const functions = {
    prizeDrawStart: onCall(wrap(start)), prizeDrawSpin: onCall(wrap(spin)), prizeRespin: onCall(wrap(respin)), prizeDrawEnd: onCall(wrap(end)), prizeHere: onCall(wrap(here)),
    prizeHereTimeout: onTaskDispatched(HERE_QUEUE, async (req) => { const r = await timeout(req.data || {}); console.log("prizeHereTimeout", JSON.stringify(r)); }),
  };
  return { functions, start, spin, here, respin, end, timeout, tick, onStreamEnd, me, active, pointerOf, ACTIVE, idStr };
};
