// Chat Games, the engine (docs/specs/chat-games.md §3, §9, §12, §13; part 1). Built on the Control Room's ctx (lib/live/core.js) so it shares the stream
// refs, publishLive and the who() check: lib/live/index.js creates it, sets ctx.chatGames, and spreads these functions into the live module.
//
//   chatGameStart({ formatId, streamId?, options })   Captain (captainNow.uid on the stream's duty doc, any grade) or the owner. Refuses when a run is active
//                                                     ("<title> is running. End it first or use Swap") and any format without a handler ("Not available yet").
//   chatGameSwap({ formatId, streamId?, options })    the same, but voids the active run first, in one transaction.
//   chatGameEnd({ runId })                            ends a revealed run, voids anything earlier (no result, no XP).
//   chatGameControl({ runId, action, data })          the run controls; each format's handler owns them (none yet: "Not available yet").
//   chatGameCue({ runId, cueId, action })             §9: the member on duty in the cue's room, the Captain or the owner. First Posted pays +5 Gears
//                                                     (grantGears source "chatGame", key chatGame:{runId}:{uid}).
//   chatGameDeadline                                  Cloud Tasks (onTaskDispatched, one task per deadline): closes a state whose closesAt has passed.
//   sweep(stream)                                     liveTick's backstop: the same for any deadline a task missed.
//   closeOut(streamId)                                the Control Room's Stop (and the auto-end, and the after-show handover): voids unsettled runs (a
//                                                     revealed one ends with its result), clears private/control.chatGame and .chatGameWaiting and
//                                                     private/duty.chatGames, writes streams/{id}.chatGames.
//
// DATA (sites/boomertanger/, function-written only): chatGames/main/formats/{formatId}, chatGames/main/runs/{runId} (+ rounds, secret, staff, plays, cues).
// The one-at-a-time pointer is streams/{id}/private/control.chatGame = { runId, formatId, state, round, title }; publishLive copies it to public/live.chatGame
// (logic.buildPublicLive), so every writer of public/live keeps it. Crew-hosted runs are also listed in streams/{id}/private/duty.chatGames.activeRunIds.
// Every staff action writes adminLog under feature "chatGames". Every transition is transaction-checked: the second tap gets "Already done by @handle".
const { onCall } = require("firebase-functions/v2/https");
const { onTaskDispatched } = require("firebase-functions/v2/tasks");
const L = require("./logic");

const SITE_ID = "boomertanger";
const BASE = `sites/${SITE_ID}/chatGames/main`;
const DEADLINE_QUEUE = { retryConfig: { maxAttempts: 3, minBackoffSeconds: 5, maxBackoffSeconds: 60 }, rateLimits: { maxDispatchesPerSecond: 5, maxConcurrentDispatches: 5 } };

module.exports = function chatGames(ctx, { gears = null, enqueue = null, grant = null, factory = null, hotSeatRng = Math.random } = {}) {
  const { db, FieldValue, Timestamp, fail, now, ms, P } = ctx;
  const G = () => gears || (gears = require("../crew/gears").makeGears({ db, now }));
  const runRef = (id) => db.doc(`${BASE}/runs/${id}`);
  const runsCol = () => db.collection(`${BASE}/runs`);
  const formatRef = (id) => db.doc(`${BASE}/formats/${id}`);
  const cueRef = (runId, cueId) => db.doc(`${BASE}/runs/${runId}/cues/${cueId}`);
  const dutyRef = (sid) => db.doc(P.duty(sid));
  const env = () => (/prod/i.test(String(process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "")) ? "production" : "staging");
  const refuse = (reason, extra = {}) => {
    const code = { busy: "failed-precondition", notAvailable: "failed-precondition", disabled: "failed-precondition", notLive: "failed-precondition", notCaptain: "permission-denied", notYourRoom: "permission-denied", noRun: "not-found" }[reason] || "failed-precondition";
    return fail(code, L.refusal(reason, extra), reason, extra.byHandle ? { byHandle: extra.byHandle } : {});
  };
  const asRun = (snap) => (snap && snap.exists ? { id: snap.id, ...snap.data(), closesAtMs: ms(snap.get("closesAt")) } : null);

  async function log(w, action, { runId = null, streamId = null, title = "Chat Games", details } = {}) {
    try {
      await db.collection("adminLog").add(await ctx.adminLogEntry(db, {
        feature: "chatGames", action, itemPath: runId ? `${BASE}/runs/${runId}` : streamId ? P.stream(streamId) : BASE, itemTitle: title,
        actorUid: w && w.uid ? w.uid : null, actorName: w ? w.name : "Automatic", details,
      }));
    } catch (err) { console.error("chatGames: adminLog failed", String((err && err.message) || err).slice(0, 140)); }
  }

  /** Deadline tasks (Cloud Tasks, default region like liveFlush). A failure is fine: liveTick's sweep closes it within a minute. */
  const defaultEnqueue = async (data, scheduleDelaySeconds) => {
    const { getFunctions } = require("firebase-admin/functions");
    await getFunctions().taskQueue("chatGameDeadline").enqueue(data, { scheduleDelaySeconds });
  };
  async function scheduleDeadline(runId, closesAtMs) {
    if (!Number.isFinite(closesAtMs)) return;
    const delay = Math.max(0, Math.ceil((closesAtMs - now()) / 1000));
    try { await (enqueue || defaultEnqueue)({ runId, closesAtMs }, delay); }
    catch (err) { console.error("chatGames: deadline task not queued (the sweep will close it)", String((err && err.message) || err).slice(0, 140)); }
  }

  // ---------- who ----------
  async function caller(request) {
    const uid = ctx.crew.requireAuth(request);
    return ctx.crew.who(uid);
  }
  /** The Captain (captainNow.uid on this stream's duty doc, any grade) or the owner. Returns the duty doc. */
  async function requireCaptain(w, streamId) {
    const duty = (await dutyRef(streamId).get()).data() || null;
    if (!w.isOwner && !L.isCaptain(duty, w.uid)) throw refuse("notCaptain");
    return duty;
  }
  async function liveTarget(streamId) {
    const s = streamId ? await ctx.loadStream(streamId) : await ctx.liveStream();
    if (!s || s.state !== "live") throw refuse("notLive");
    return s;
  }

  // ---------- start and swap ----------
  async function startRun(w, data, { swap = false } = {}) {
    const v = L.validateStart(data);
    if (!v.ok) throw fail("invalid-argument", v.message, v.reason, { field: v.field });
    const stream = await liveTarget(v.value.streamId);
    await requireCaptain(w, stream.id);
    const handler = L.handlerFor(v.value.formatId);
    if (!handler) throw refuse("notAvailable");
    const fsnap = await formatRef(v.value.formatId).get();
    if (!fsnap.exists || fsnap.get("enabled") !== true) throw refuse("disabled");
    const format = { id: fsnap.id, ...fsnap.data() };
    const at = now();
    // a format may look things up first (Questions: the first card from the queue); start() itself runs inside the transaction
    const prep = handler.prepare ? await handler.prepare({ stream, options: v.value.options, at, w }) : null;
    const newRef = runsCol().doc();
    let out = null;
    await db.runTransaction(async (tx) => {
      const cRef = ctx.controlRef(stream.id);
      const cs = await tx.get(cRef);
      const ptr = (cs.data() || {}).chatGame || null;
      let cur = null;
      if (ptr && ptr.runId) { cur = asRun(await tx.get(runRef(ptr.runId))); }
      // a settled Prediction showing its result (part 5) only fills the slot until the next game: it ends, it doesn't block
      const shown = !!cur && cur.formatId === "predictions" && cur.state === "revealed";
      const busy = cur && L.ACTIVE.includes(cur.state) && !shown;
      if (busy && !swap) throw refuse("busy", { title: cur.title || ptr.title });
      const dRef = dutyRef(stream.id);
      const ds = await tx.get(dRef);
      // end the shown result, or void the current run (Swap; a revealed run keeps its result and ends)
      if (shown) tx.update(runRef(cur.id), stampPatch(L.transition(cur, "ended", { at }).patch));
      else if (busy) {
        const to = cur.state === "revealed" ? "ended" : "void";
        const t = L.transition(cur, to, { at });
        if (!t.ok) throw refuse(t.reason);
        tx.update(runRef(cur.id), { ...stampPatch(t.patch), ...(to === "void" ? { voidReason: "swap" } : {}) });
      }
      // the new run: the handler decides what happens in "ready"
      const base = { formatId: format.id, streamId: stream.id, state: "ready", round: 0, title: format.title || format.id, crewHosted: format.crewHosted === true,
        packId: null, cardId: null, prompt: null, options: null, closesAt: null, startedBy: w.uid, startedByHandle: w.handle || null, env: env(), startedAt: at, updatedAt: at, result: null };
      const h = handler.start ? handler.start({ id: newRef.id, ...base }, v.value.options, { at, prep, stream }) : { ok: true, patch: {} };
      if (!h || !h.ok) throw fail("failed-precondition", (h && h.message) || "That game couldn't start.", (h && h.reason) || "startFailed");
      const run = { ...base, ...(h.patch || {}) };
      tx.set(newRef, stampPatch(run));
      for (const c of h.cues || []) tx.set(newRef.collection("cues").doc(), { ...c, status: "pending", postedBy: null, postedAt: null, doneBy: null, doneAt: null });
      tx.set(cRef, { chatGame: L.pointerOf({ id: newRef.id, ...run }) }, { merge: true });
      if (ds.exists) {
        const ids = run.crewHosted ? [newRef.id] : [];
        tx.update(dRef, { "chatGames.activeRunIds": ids });
      }
      out = { runId: newRef.id, voided: busy ? cur.id : null, closesAtMs: typeof run.closesAt === "number" ? run.closesAt : null, title: run.title };
    });
    if (out.closesAtMs) await scheduleDeadline(out.runId, out.closesAtMs);
    if (handler.afterStart) {
      try {
        const as = await handler.afterStart({ id: out.runId, streamId: stream.id }, { w, stream });
        if (as && typeof as.closesAt === "number") await scheduleDeadline(out.runId, as.closesAt);   // Hot Seat: round 1's first deadline
        await syncPointer(out.runId);
      } catch (err) { console.error("chatGames: afterStart failed", String((err && err.message) || err).slice(0, 140)); }
    }
    if (out.voided) await log(w, "swap", { runId: out.voided, streamId: stream.id, title: stream.title, details: { to: format.id, newRunId: out.runId } });
    await log(w, "start", { runId: out.runId, streamId: stream.id, title: out.title, details: { formatId: format.id } });
    await ctx.publishLive();
    return { ok: true, runId: out.runId, voided: out.voided };
  }
  /** Times in a run patch are ms (the logic's currency); Firestore stores Timestamps. */
  function stampPatch(p) {
    const o = { ...p };
    for (const k of ["closesAt", "openedAt", "lockedAt", "revealedAt", "endedAt", "startedAt", "updatedAt"]) if (typeof o[k] === "number") o[k] = Timestamp.fromMillis(o[k]);
    return o;
  }

  /** Copies the run's state and round to private/control.chatGame when this run is the active one. */
  async function syncPointer(runId) {
    const run = asRun(await runRef(runId).get());
    if (!run) return;
    const cRef = ctx.controlRef(run.streamId);
    const ptr = ((await cRef.get()).data() || {}).chatGame;
    if (ptr && ptr.runId === runId) await cRef.set({ chatGame: L.pointerOf(run) }, { merge: true });
  }

  // ---------- end ----------
  /** Moves a run to `to` inside a transaction and keeps the pointers right. Returns the run (before). */
  async function move(runId, to, { w = null, reason = null, extra = {} } = {}) {
    const at = now();
    let before = null;
    await db.runTransaction(async (tx) => {
      const run = asRun(await tx.get(runRef(runId)));
      if (!run) throw refuse("noRun");
      const t = L.transition(run, to, { at });
      if (!t.ok) {
        const by = run.lastBy && run.lastBy !== (w && w.uid) ? run.lastByHandle : null;
        throw refuse(t.reason, { byHandle: by });
      }
      const cRef = ctx.controlRef(run.streamId), dRef = dutyRef(run.streamId);
      const [cs, ds] = await Promise.all([tx.get(cRef), tx.get(dRef)]);
      tx.update(runRef(runId), { ...stampPatch(t.patch), lastBy: w ? w.uid : null, lastByHandle: w ? w.handle || null : null, ...(reason ? { voidReason: reason } : {}), ...extra });
      const ptr = (cs.data() || {}).chatGame;
      const next = { ...run, ...t.patch, ...extra };
      if (ptr && ptr.runId === runId) tx.set(cRef, { chatGame: L.pointerOf(next) }, { merge: true });
      // a locked Prediction leaves private/control.chatGameWaiting once it's settled, voided or ended (part 5)
      const waiting = (cs.data() || {}).chatGameWaiting;
      if ((to === "revealed" || L.FINAL.includes(to)) && Array.isArray(waiting) && waiting.some((x) => x && x.runId === runId)) tx.set(cRef, { chatGameWaiting: waiting.filter((x) => x && x.runId !== runId) }, { merge: true });
      if (L.FINAL.includes(to) && ds.exists) {
        const ids = (((ds.data() || {}).chatGames || {}).activeRunIds || []).filter((x) => x !== runId);
        tx.update(dRef, { "chatGames.activeRunIds": ids });
      }
      before = run;
    });
    return before;
  }
  async function endRun(w, data) {
    const runId = data && data.runId;
    if (typeof runId !== "string" || !L.ID_SAFE.test(runId)) throw fail("invalid-argument", "Which game?", "bad-input", { field: "runId" });
    const run = asRun(await runRef(runId).get());
    if (!run) throw refuse("noRun");
    await requireCaptain(w, run.streamId);
    const to = run.state === "revealed" ? "ended" : "void";
    await move(runId, to, { w, reason: to === "void" ? "endedEarly" : null });
    await log(w, to === "void" ? "void" : "end", { runId, streamId: run.streamId, title: run.title });
    await ctx.publishLive();
    return { ok: true, runId, state: to };
  }

  // ---------- controls ----------
  async function control(w, data) {
    const v = L.validateControl(data);
    if (!v.ok) throw fail("invalid-argument", v.message, v.reason, { field: v.field });
    const run = asRun(await runRef(v.value.runId).get());
    if (!run) throw refuse("noRun");
    await requireCaptain(w, run.streamId);
    const h = L.handlerFor(run.formatId);
    if (!h || !h.control) throw refuse("notAvailable");
    const stream = await ctx.loadStream(run.streamId);
    const r = await h.control(run, v.value.action, v.value.data, { at: now(), w, stream, move: (to, extra) => move(run.id, to, { w, extra: extra ? stampPatch(extra) : {} }) });
    if (!r || !r.ok) throw fail("failed-precondition", (r && r.message) || "That didn't work.", (r && r.reason) || "control");
    if (r.handled) await runRef(run.id).update({ lastBy: w.uid, lastByHandle: w.handle || null });   // the format wrote everything itself (Hot Seat)
    else if (r.to) await move(run.id, r.to, { w, extra: r.patch ? stampPatch(r.patch) : {} });
    else if (r.patch) await runRef(run.id).update({ ...stampPatch(r.patch), lastBy: w.uid, lastByHandle: w.handle || null });
    if (r.pointer || r.handled) await syncPointer(run.id);
    if (typeof r.closesAt === "number") await scheduleDeadline(run.id, r.closesAt);
    await log(w, `control:${v.value.action}`, { runId: run.id, streamId: run.streamId, title: run.title });
    await ctx.publishLive();
    return { ok: true };
  }

  // ---------- a member's move and a mod's hide (§13: chatGamePlay, chatGameModerate), handled by the running format ----------
  async function play(w, d) {
    const runId = d && d.runId;
    if (typeof runId !== "string" || !L.ID_SAFE.test(runId)) throw fail("invalid-argument", "Which game?", "bad-input", { field: "runId" });
    const run = asRun(await runRef(runId).get());
    if (!run || !L.ACTIVE.includes(run.state)) throw refuse("noRun");
    if (!w.handle) throw fail("failed-precondition", "Finish signing up first.", "needsSignup");
    const h = L.handlerFor(run.formatId);
    if (!h || !h.play) throw refuse("notAvailable");
    const r = (await h.play(run, d.action, d, w)) || {};
    if (typeof r.closesAt === "number") await scheduleDeadline(runId, r.closesAt);
    if (r.changed) { await syncPointer(runId); await ctx.publishLive(); }
    return { ok: true };
  }
  async function moderateRun(w, d) {
    const runId = d && d.runId;
    if (typeof runId !== "string" || !L.ID_SAFE.test(runId)) throw fail("invalid-argument", "Which game?", "bad-input", { field: "runId" });
    const run = asRun(await runRef(runId).get());
    if (!run || !L.ACTIVE.includes(run.state)) throw refuse("noRun");
    const duty = (await dutyRef(run.streamId).get()).data() || null;
    if (!w.isOwner && !L.isCaptain(duty, w.uid) && !(duty && duty.onDuty && duty.onDuty[w.uid])) throw fail("permission-denied", "Mods on duty, the Captain and the owner moderate games.", "notModerator");
    const h = L.handlerFor(run.formatId);
    if (!h || !h.moderate) throw refuse("notAvailable");
    const r = (await h.moderate(run, d, w)) || {};
    if (r.changed) await ctx.publishLive();
    return { ok: true };
  }

  // ---------- cues (§9) ----------
  async function cue(w, data) {
    const v = L.validateCue(data);
    if (!v.ok) throw fail("invalid-argument", v.message, v.reason, { field: v.field });
    const { runId, cueId, action } = v.value;
    const run = asRun(await runRef(runId).get());
    if (!run || !L.ACTIVE.includes(run.state)) throw refuse("noRun");
    const duty = (await dutyRef(run.streamId).get()).data() || null;
    const at = now();
    let first = false;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(cueRef(runId, cueId));
      if (!snap.exists) throw fail("not-found", "That cue is gone.", "noCue");
      const c = snap.data();
      if (!L.canCue({ uid: w.uid, isOwner: w.isOwner }, duty, c)) throw refuse("notYourRoom");
      const m = L.cueMove(c, action);
      if (!m.ok) throw refuse("already", { byHandle: action === "posted" ? c.postedByHandle : c.doneByHandle });
      const patch = action === "posted"
        ? { status: "posted", postedBy: w.uid, postedByHandle: w.handle || null, postedAt: Timestamp.fromMillis(at) }
        : { status: "done", doneBy: w.uid, doneByHandle: w.handle || null, doneAt: Timestamp.fromMillis(at) };
      tx.update(cueRef(runId, cueId), patch);
      first = action === "posted";
    });
    let gears = null;
    if (first) {
      try { gears = await G().grantGears(w.uid, "chatGame", runId, L.HOST_GEARS, { key: `chatGame:${runId}:${w.uid}`, streamId: run.streamId }); }
      catch (err) { console.error("chatGames: hosting Gears failed", String((err && err.message) || err).slice(0, 140)); }
    }
    await log(w, `cue:${action}`, { runId, streamId: run.streamId, title: run.title, details: { cueId } });
    return { ok: true, status: action, gears: gears && gears.granted ? gears.amount : 0 };
  }

  // ---------- deadlines ----------
  /** Closes a run whose deadline has passed: the handler says what comes next (locked by default). Idempotent. */
  async function onDeadline(runId, closesAtMs = null) {
    const run = asRun(await runRef(runId).get());
    if (!run || !["ready", "open"].includes(run.state) || !Number.isFinite(run.closesAtMs)) return { closed: false };
    if (closesAtMs != null && run.closesAtMs !== closesAtMs) return { closed: false, reason: "moved" };   // paused or extended: a newer task owns it
    if (run.closesAtMs > now() + 500) return { closed: false, reason: "early" };
    const h = L.handlerFor(run.formatId);
    // a handler may answer with a state, or { to, patch } (Questions: the card on screen may finish first, so the run only stops its clock)
    const res = h && h.onDeadline ? await h.onDeadline(run, { at: now() }) : null;
    if (res && res.handled) {   // the format moved its own phase on (Hot Seat): schedule the next deadline, if any
      if (typeof res.closesAt === "number") await scheduleDeadline(runId, res.closesAt);
      await syncPointer(runId);
      await ctx.publishLive();
      return { closed: true, to: "handled" };
    }
    const to = typeof res === "string" ? res : res && res.to ? res.to : res && res.patch ? null : run.state === "ready" ? "void" : "locked";
    try {
      if (to) await move(runId, to, { reason: to === "void" ? "deadline" : null, extra: res && res.patch ? stampPatch(res.patch) : {} });
      else await runRef(runId).update(stampPatch({ ...res.patch, updatedAt: now() }));
    } catch (err) { return { closed: false, reason: (err && err.details && err.details.reason) || "error" }; }
    await ctx.publishLive();
    return { closed: true, to: to || run.state };
  }
  const chatGameDeadline = onTaskDispatched(DEADLINE_QUEUE, async (req) => {
    const d = (req && req.data) || {};
    if (typeof d.runId === "string" && L.ID_SAFE.test(d.runId)) await onDeadline(d.runId, Number.isFinite(d.closesAtMs) ? d.closesAtMs : null);
  });
  /** liveTick's backstop: any of this stream's runs whose deadline passed. */
  async function sweep(stream) {
    if (!stream || !stream.id) return { closed: 0 };
    const runs = (await runsCol().where("streamId", "==", stream.id).get()).docs.map(asRun);
    let closed = 0;
    for (const r of L.dueSweep(runs, now())) if ((await onDeadline(r.id)).closed) closed++;
    return { closed };
  }

  // ---------- Stop clean-up (§3) ----------
  async function closeOut(streamId) {
    const runs = (await runsCol().where("streamId", "==", streamId).get()).docs.map(asRun);
    let voided = 0;
    for (const r of runs) {
      if (!L.ACTIVE.includes(r.state)) continue;
      const to = r.state === "revealed" ? "ended" : "void";   // a revealed round (or a settled Prediction on stream) keeps its result; anything unsettled is void
      try { await move(r.id, to, { reason: to === "void" ? "stop" : null }); if (to === "void") voided++; } catch (err) { if (!["already", "over"].includes(err && err.details && err.details.reason)) throw err; }
    }
    for (const h of Object.values(L.HANDLERS)) if (h && h.atStop) { try { await h.atStop(streamId); } catch (err) { console.error("chatGames: format stop clean-up failed", String((err && err.message) || err).slice(0, 140)); } }
    const fresh = (await runsCol().where("streamId", "==", streamId).get()).docs.map(asRun);
    await ctx.controlRef(streamId).set({ chatGame: null, chatGameWaiting: [], chatGameSettled: null }, { merge: true });
    const d = dutyRef(streamId);
    if ((await d.get()).exists) await d.update({ chatGames: FieldValue.delete() });
    await ctx.streamRef(streamId).set({ chatGames: L.nightSummary(fresh.map((r) => ({ ...r, startedAt: ms(r.startedAt) }))) }, { merge: true });
    if (voided) await log(null, "stopCleanup", { streamId, details: { voided } });
    return { voided, runs: fresh.length };
  }

  const wrap = (fn) => async (request) => fn(await caller(request), request.data || {});
  // Questions (part 2): its callables, the vote trigger, the daily archive; it registers the "questions" format handler
  const questions = require("./questions")(ctx, { grant, factory, log, caller, refuse, syncPointer });
  // Packs and the pool (part 3): the callables behind /crew/games, and draw / markUsed for the pack formats
  const packs = require("./packs")(ctx, { gears, log, caller, refuse });
  // Hot Seat (part 4): the "hot-seat" handler and chatGameVolunteer; cards through packs.draw / markUsed
  const hotSeat = require("./hotseat")(ctx, { grant, factory, log, caller, refuse, packs: packs.ops, move, rng: hotSeatRng });
  // Would You Rather and Predictions (part 5): their handlers, predictionPropose and predictionSettle; prompts through packs.draw / markUsed
  const choices = require("./choices")(ctx, { grant, factory, log, caller, refuse, packs: packs.ops, move, syncPointer });
  const functions = {
    chatGameStart: onCall(wrap((w, d) => startRun(w, d))),
    chatGameSwap: onCall(wrap((w, d) => startRun(w, d, { swap: true }))),
    chatGameEnd: onCall(wrap(endRun)),
    chatGameControl: onCall(wrap(control)),
    chatGameCue: onCall(wrap(cue)),
    chatGameDeadline,
    ...questions.functions,
    ...packs.functions,
    ...hotSeat.functions,
    ...choices.functions,
    chatGamePlay: onCall(wrap(play)),
    chatGameModerate: onCall(wrap(moderateRun)),
  };
  return { functions, ops: { startRun, endRun, control, cue, onDeadline, sweep, closeOut, move, ...questions.ops, ...packs.ops, hotSeat: hotSeat.ops, choices: choices.ops, play, moderateRun }, closeOut, sweep, draw: packs.ops.draw, markUsed: packs.ops.markUsed };
};
module.exports.BASE = BASE;
