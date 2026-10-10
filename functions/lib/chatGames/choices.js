// Chat Games, the choice formats: Would You Rather and Predictions (docs/specs/chat-games.md §6, §7, §11, §12, §13; part 5). Created by the engine
// (index.js) with its helpers; it registers the "would-you-rather" and "predictions" handlers and returns predictionPropose and predictionSettle.
// A member's pick goes through the engine's chatGamePlay (action "vote", { choice }); the run controls through chatGameControl.
//
// Would You Rather. Each round is one prompt (a pack card, or typed live: a lead line plus two options of 80), open 30, 45 or 60 s (45). Any signed-up
// member votes, checked in or not, and can change their vote until it closes. Each vote is a ballot (runs/{id}/ballots/{round}_{uid}, functions only), so
// the split stays secret until the reveal; staff/r{n}.total counts voters for the run panel. Reveal (the deadline or Reveal now): counts and percentages
// in the run's display and rounds/{n}; 3 XP to every voter (ref "{runId}:{round}"). Controls: reveal, pause / resume, nextRound (Next prompt: a new
// round from the pack or typed live), saveToPack. End is the engine's.
//
// Predictions. One question (typed live: 120, plus 2 to 4 answers of 40; or a pack card), open until Lock or 3 minutes. Members pick and can change until
// it locks; picks per answer stay hidden until then. At the lock: 3 XP to every member with a pick (ref "{runId}:lock"), kept whatever happens next; the
// run leaves the one-at-a-time slot and waits in private/control.chatGameWaiting (at most 3; a 4th Lock is refused; an automatic lock with 3 already
// waiting keeps the slot instead). predictionPropose: a mod on duty (or the Captain, or the owner) calls what happened (staff/p.proposal; members never
// see it). predictionSettle (the Captain or the owner): confirm (the proposal), reject (clears it), settle { answer } directly, void (no +10; the lock XP
// stays), correct { answer } once, during the same stream. A result pays +10 to each correct pick (ref "{runId}:win"); a correction reverses those
// (grant.reverseXp, ref "{runId}:win_rev") and pays the new winners (ref "{runId}:win2"); then it's final. A settled Prediction takes the slot to show
// its result when the slot is free (state revealed), otherwise it ends with its result. Stop voids every unsettled one (the engine's closeOut).
//
// Both: mods clocked in for the stream earn no game XP; everything else goes through the shared stream cap (capPayout against presence.xpEarned; over
// the cap the play is marked capped). Night Shift "stream" { action: "chat-game-played" } once per member per round (WYR) or at the lock (Predictions).
// Save to pack (after a typed round): the owner's save adds the card (chatGamePackSave's addCard), the Captain's lands in the pack's Suggested lane.
const { onCall } = require("firebase-functions/v2/https");
const L = require("./logic");
const C = require("./clogic");
const LL = require("../live/logic");
const { isProfane } = require("../accounts/validate");

const SITE_ID = "boomertanger";
const BASE = `sites/${SITE_ID}/chatGames/main`;
const WYR = "would-you-rather", PRED = "predictions";

module.exports = function choices(ctx, { grant = null, factory = null, log, caller, refuse, packs, move, syncPointer } = {}) {
  const { db, FieldValue, Timestamp, fail, now, ms, P } = ctx;
  const G = () => grant || (grant = require("../rewards/grant").makeGrant({ db }));
  const F = () => factory || (factory = require("../factory/record").makeFactory({ db, grant: G() }));
  const { PRESENCE_TTL_MS } = require("../live/core");
  const runRef = (id) => db.doc(`${BASE}/runs/${id}`);
  const roundRef = (id, n) => db.doc(`${BASE}/runs/${id}/rounds/${n}`);
  const ballotRef = (id, n, uid) => db.doc(`${BASE}/runs/${id}/ballots/${n}_${uid}`);
  const staffRef = (id, key) => db.doc(`${BASE}/runs/${id}/staff/${key}`);
  const playRef = (id, uid) => db.doc(`${BASE}/runs/${id}/plays/${uid}`);
  const TS = (m) => Timestamp.fromMillis(m);
  const asRun = (s) => (s && s.exists ? { id: s.id, ...s.data(), closesAtMs: ms(s.get("closesAt")) } : null);
  const loadRun = async (id) => asRun(await runRef(id).get());
  const bad = (m, r = "bad-input", extra = {}) => fail("invalid-argument", m, r, extra);
  const no = (reason, extra = {}) => fail(reason === "notCaptain" ? "permission-denied" : "failed-precondition", C.refusal(reason), reason, extra);

  // ---------- the prompt ----------
  /** options: { source: "pack" | "typed", packId, cardId, prompt: { text, options } } → { prompt, source, packId, cardId } */
  async function promptFrom(formatId, o, { skip = [] } = {}) {
    if (o.source === "typed" || (!o.source && o.prompt)) {
      const r = C.promptOf(formatId, o.prompt || {}, { isProfane });
      if (!r.ok) throw bad(r.message, r.reason, { field: r.field });
      return { prompt: r.prompt, source: "typed", packId: null, cardId: null };
    }
    const packId = typeof o.packId === "string" && L.ID_SAFE.test(o.packId) ? o.packId : null;
    if (!packId) throw bad("Pick a pack, or type your own.");
    const p = (await db.doc(`${BASE}/packs/${packId}`).get()).data();
    if (!p || p.formatId !== formatId || p.status !== "approved") throw fail("failed-precondition", "Pick an approved pack for this game.", "badPack");
    let card = typeof o.cardId === "string" ? (p.cards || []).find((c) => c.id === o.cardId) || null : null;
    if (!card) { const d = await packs.draw(packId, { skip }); card = d && d.card; }
    if (!card) throw fail("failed-precondition", "That pack has no cards yet.", "emptyPack");
    return { prompt: { text: card.text || (formatId === WYR ? C.WYR_LEAD : ""), options: card.options || [] }, source: "pack", packId, cardId: card.id };
  }

  // ---------- XP: the shared cap, crew on duty, Night Shift ----------
  /** Pays `amount` to each uid (8 at a time). Returns { uid: { xp, capped, crew } }. */
  async function payAll(stream, uids, amount, { ref, reason, nightShift = false }) {
    const duty = (await db.doc(P.duty(stream.id)).get()).data() || null;
    const settings = await ctx.settings();
    const out = {};
    const one = async (uid) => {
      if (duty && duty.onDuty && duty.onDuty[uid]) { out[uid] = { xp: 0, capped: false, crew: true }; return; }
      const pref = db.doc(P.presence(stream.id, uid));
      const pres = (await pref.get()).data() || {};
      const paid = LL.capPayout(pres.xpEarned || 0, amount, settings.xpStreamCap);
      let xp = 0;
      if (paid > 0) {
        try {
          const g = await G().grantXp(uid, paid, { feature: "chatGames", ref, reason });
          if (g && g.granted) { xp = paid; await pref.set({ uid, xpEarned: FieldValue.increment(paid), expireAt: TS(now() + PRESENCE_TTL_MS) }, { merge: true }); }
        } catch (err) { console.error("chatGames: XP failed", String((err && err.message) || err).slice(0, 140)); }
      }
      if (nightShift) { try { await F().recordFactoryEvent(uid, "stream", { action: "chat-game-played" }, ref); } catch (err) { /* Night Shift is best-effort */ } }
      out[uid] = { xp, capped: paid < amount, crew: false };
    };
    const list = [...new Set(uids)];
    for (let i = 0; i < list.length; i += 8) await Promise.all(list.slice(i, i + 8).map(one));
    return out;
  }
  async function ballotsOf(runId, n) {
    const snap = await db.collection(`${BASE}/runs/${runId}/ballots`).where("round", "==", n).get();
    return Object.fromEntries(snap.docs.map((d) => [d.get("uid"), d.get("pick")]));
  }
  async function writePlays(runId, n, results, key) {
    for (const [uid, r] of Object.entries(results)) await playRef(runId, uid).set({ round: n, r: { [n]: { [key]: r } } }, { merge: true });
  }

  // ---------- displays (the run's public card; obsFeed adds closesAt) ----------
  const wyrDisplay = (run, extra = {}) => ({ kind: "wyr", phase: "open", round: run.round || 1, lead: run.prompt.text, options: run.prompt.options, source: run.source, paused: !!run.paused, ...extra });
  const predDisplay = (run, extra = {}) => ({ kind: "predictions", phase: "open", question: run.prompt.text, options: run.prompt.options, source: run.source, ...extra });

  // ---------- a pick (both formats) ----------
  async function pick(run, data, w) {
    if (run.state !== "open") throw fail("failed-precondition", run.formatId === PRED ? "Picks are locked." : "Voting is closed.", "closed");
    if (run.paused) throw fail("failed-precondition", "It's paused for a moment.", "paused");
    if (run.closesAtMs && run.closesAtMs < now()) throw fail("failed-precondition", "That just closed.", "closed");
    const n = run.round || 1, choice = data && data.choice;
    if (!Number.isInteger(choice) || choice < 0 || choice >= (run.prompt.options || []).length) throw bad("Pick one.");
    let fresh = false, same = false;
    await db.runTransaction(async (tx) => {
      const b = await tx.get(ballotRef(run.id, n, w.uid));
      if (b.exists && b.get("pick") === choice) { same = true; return; }
      fresh = !b.exists;
      tx.set(ballotRef(run.id, n, w.uid), { uid: w.uid, round: n, pick: choice, at: TS(now()) });
      if (fresh) tx.set(staffRef(run.id, run.formatId === PRED ? "p" : `r${n}`), { total: FieldValue.increment(1) }, { merge: true });
    });
    if (!same) await playRef(run.id, w.uid).set({ round: n, r: { [n]: { pick: choice } }, at: TS(now()) }, { merge: true });
    return { ok: true, changed: false, pick: choice, first: fresh };
  }

  // ---------- Would You Rather ----------
  async function wyrReveal(run, w = null) {
    const n = run.round || 1;
    await move(run.id, "revealed", { w, extra: { closesAt: null, paused: false, pausedLeft: null, display: wyrDisplay(run, { phase: "revealing" }) } });   // the second caller is refused here
    const stream = await ctx.loadStream(run.streamId);
    const picks = await ballotsOf(run.id, n);
    const t = C.tally(picks, 2);
    const winners = C.leaders(t.counts);
    const results = await payAll(stream, Object.keys(picks), C.VOTE_XP, { ref: `${run.id}:${n}`, reason: "Voted in Would You Rather", nightShift: true });
    await writePlays(run.id, n, results, "result");
    const display = wyrDisplay(run, { phase: "revealed", counts: t.counts, pct: t.pct, total: t.total, winners });
    await roundRef(run.id, n).set({ n, prompt: run.prompt, source: run.source, packId: run.packId || null, cardId: run.cardId || null, counts: t.counts, pct: t.pct, total: t.total, winners, revealedAt: TS(now()) }, { merge: true });
    await runRef(run.id).update({ display, result: { round: n, counts: t.counts, winners } });
    return { ok: true, handled: true };
  }
  const wyr = {
    title: "Would You Rather",
    async prepare({ options }) {
      const o = options || {};
      return { ...(await promptFrom(WYR, o)), voteMs: C.secondsOf(o.seconds) * 1000 };
    },
    start(run, options, { at, prep }) {
      const r = { ...run, round: 1, prompt: prep.prompt, source: prep.source, paused: false };
      return { ok: true, patch: { state: "open", openedAt: at, round: 1, prompt: prep.prompt, source: prep.source, packId: prep.packId, cardId: prep.cardId, voteMs: prep.voteMs, closesAt: at + prep.voteMs, paused: false, pausedLeft: null, display: wyrDisplay(r) } };
    },
    async afterStart(run) {
      const r = await loadRun(run.id);
      if (r && r.cardId) await packs.markUsed(r.packId, r.cardId, r.streamId);
      return {};
    },
    async onDeadline(run) { try { await wyrReveal(run); } catch (err) { if (!["already", "badMove", "over"].includes(err && err.details && err.details.reason)) throw err; } return { handled: true }; },
    async play(run, action, data, w) {
      if (action !== "vote") throw bad("Unknown move.");
      return pick(run, data, w);
    },
    async control(run, action, data, { w }) {
      if (action === "reveal") {
        if (run.state !== "open") return { ok: false, reason: "already", message: "It's already revealed." };
        return wyrReveal(run, w);
      }
      if (action === "pause" || action === "resume") return pauseResume(run, action, wyrDisplay);
      if (action === "nextRound") {
        if (run.state !== "revealed") return { ok: false, reason: "notYet", message: "Reveal this one first." };
        const next = await promptFrom(WYR, { packId: run.packId, ...(data || {}) }, { skip: [run.cardId].filter(Boolean) });
        const voteMs = data && data.seconds ? C.secondsOf(data.seconds) * 1000 : run.voteMs || C.WYR_DEFAULT_S * 1000;
        const at = now(), n = (run.round || 1) + 1;
        if (next.cardId) await packs.markUsed(next.packId, next.cardId, run.streamId);
        const r = { ...run, round: n, prompt: next.prompt, source: next.source, paused: false };
        return { ok: true, to: "open", patch: { round: n, prompt: next.prompt, source: next.source, packId: next.packId || run.packId || null, cardId: next.cardId, voteMs, closesAt: at + voteMs, paused: false, pausedLeft: null, result: null, savedRound: null, display: wyrDisplay(r) }, closesAt: at + voteMs, pointer: true };
      }
      if (action === "saveToPack") return saveToPack(run, data, w);
      return { ok: false, reason: "badAction", message: "That control isn't part of Would You Rather." };
    },
  };
  async function pauseResume(run, action, displayOf) {
    if (run.state !== "open") return { ok: false, reason: "notTimed", message: "Nothing is counting down." };
    if (action === "pause") {
      if (run.paused || !run.closesAtMs) return { ok: false, reason: "notTimed", message: "Nothing is counting down." };
      const left = Math.max(0, run.closesAtMs - now());
      return { ok: true, patch: { paused: true, pausedLeft: left, closesAt: null, display: displayOf({ ...run, paused: true }) } };
    }
    if (!run.paused) return { ok: false, reason: "notPaused", message: "It isn't paused." };
    const close = now() + (run.pausedLeft || 0);
    return { ok: true, patch: { paused: false, pausedLeft: null, closesAt: close, display: displayOf({ ...run, paused: false }) }, closesAt: close };
  }
  async function saveToPack(run, data, w) {
    if (run.source !== "typed") return { ok: false, reason: "notTyped", message: "Only a prompt typed live can be saved." };
    if (run.savedRound === (run.round || 1)) return { ok: false, reason: "already", message: "Already saved." };
    const packId = data && data.packId;
    if (typeof packId !== "string" || !L.ID_SAFE.test(packId)) return { ok: false, reason: "bad-input", message: "Pick a pack." };
    const card = { text: run.prompt.text, options: run.prompt.options };
    let how;
    if (w.isOwner) { await packs.packSave(w, { op: "addCard", packId, card }); how = "added"; }
    else { await packs.suggestAsCaptain(w, { packId, card }); how = "suggested"; }
    await log(w, `saveToPack:${how}`, { runId: run.id, streamId: run.streamId, title: run.title, details: { packId, round: run.round || 1 } });
    return { ok: true, patch: { savedRound: run.round || 1, savedHow: how } };
  }

  // ---------- Predictions ----------
  /** Lock: the slot is freed and the run waits (at most 3), or, when the list is full, an automatic lock keeps the slot. */
  async function predLock(run, { w = null, auto = false } = {}) {
    const at = now();
    let waiting = false;
    await db.runTransaction(async (tx) => {
      const r = asRun(await tx.get(runRef(run.id)));
      if (!r || r.state !== "open") throw no(r && r.state === "locked" ? "already" : "over");
      const cRef = ctx.controlRef(r.streamId);
      const control = (await tx.get(cRef)).data() || {};
      const add = C.waitingAdd(control.chatGameWaiting, { runId: r.id, title: r.prompt.text });
      if (!add.ok && !auto) throw no("waitingFull");
      const t = L.transition(r, "locked", { at });
      waiting = add.ok;
      tx.update(runRef(r.id), { ...stampMs(t.patch), waiting, paused: false, pausedLeft: null, lastBy: w ? w.uid : null, lastByHandle: w ? w.handle || null : null, display: predDisplay(r, { phase: "locking" }) });
      const ptr = control.chatGame;
      const patch = {};
      if (waiting) { patch.chatGameWaiting = add.list; if (ptr && ptr.runId === r.id) patch.chatGame = null; }
      else if (ptr && ptr.runId === r.id) patch.chatGame = L.pointerOf({ ...r, ...t.patch });
      if (Object.keys(patch).length) tx.set(cRef, patch, { merge: true });
    });
    const stream = await ctx.loadStream(run.streamId);
    const picks = await ballotsOf(run.id, 1);
    const t = C.tally(picks, run.prompt.options.length);
    const results = await payAll(stream, Object.keys(picks), C.LOCK_XP, { ref: `${run.id}:lock`, reason: "Made a prediction", nightShift: true });
    await writePlays(run.id, 1, results, "lock");
    await runRef(run.id).update({ display: predDisplay(run, { phase: "locked", counts: t.counts, pct: t.pct, total: t.total, waiting }), counts: t.counts });
    if (w) await log(w, "predict:lock", { runId: run.id, streamId: run.streamId, title: run.prompt.text, details: { picks: t.total, waiting } });
    return { waiting, total: t.total };
  }
  const pred = {
    title: "Predictions",
    async prepare({ options }) { return promptFrom(PRED, options || {}); },
    start(run, options, { at, prep }) {
      const r = { ...run, prompt: prep.prompt, source: prep.source };
      return { ok: true, patch: { state: "open", openedAt: at, round: 1, prompt: prep.prompt, source: prep.source, packId: prep.packId, cardId: prep.cardId, closesAt: at + C.PRED_OPEN_MS, corrected: false, display: predDisplay(r) } };
    },
    async afterStart(run) {
      const r = await loadRun(run.id);
      if (r && r.cardId) await packs.markUsed(r.packId, r.cardId, r.streamId);
      return {};
    },
    async onDeadline(run) { try { await predLock(run, { auto: true }); } catch (err) { if (!["already", "over"].includes(err && err.details && err.details.reason)) throw err; } return { handled: true }; },
    async play(run, action, data, w) {
      if (action !== "vote") throw bad("Unknown move.");
      return pick(run, data, w);
    },
    async control(run, action, data, { w }) {
      if (action === "lock") {
        if (run.state !== "open") return { ok: false, reason: "already", message: "It's already locked." };
        try { await predLock(run, { w }); } catch (err) { return { ok: false, reason: (err.details && err.details.reason) || "lock", message: err.message }; }
        return { ok: true, handled: true };
      }
      if (action === "saveToPack") return saveToPack(run, data, w);
      return { ok: false, reason: "badAction", message: "That control isn't part of Predictions." };
    },
  };
  function stampMs(p) {
    const o = { ...p };
    for (const k of ["closesAt", "openedAt", "lockedAt", "revealedAt", "endedAt", "updatedAt"]) if (typeof o[k] === "number") o[k] = TS(o[k]);
    return o;
  }

  async function dutyOf(streamId) { return (await db.doc(P.duty(streamId)).get()).data() || null; }
  async function loadPred(d) {
    const runId = d && d.runId;
    if (typeof runId !== "string" || !L.ID_SAFE.test(runId)) throw bad("Which prediction?", "bad-input", { field: "runId" });
    const run = await loadRun(runId);
    if (!run || run.formatId !== PRED) throw fail("not-found", "That prediction is gone.", "noRun");
    return run;
  }

  /** predictionPropose({ runId, answer }): a mod on duty (or the Captain, or the owner) calls what happened. */
  async function propose(w, d) {
    const run = await loadPred(d);
    const duty = await dutyOf(run.streamId);
    if (!w.isOwner && !L.isCaptain(duty, w.uid) && !(duty && duty.onDuty && duty.onDuty[w.uid])) throw fail("permission-denied", "Mods on duty call the result.", "notOnDuty");
    if (run.state !== "locked") throw no(run.state === "open" ? "notLocked" : "over");
    const answer = d && d.answer;
    if (!Number.isInteger(answer) || answer < 0 || answer >= run.prompt.options.length) throw bad("Pick what happened.");
    await db.runTransaction(async (tx) => {
      const s = (await tx.get(staffRef(run.id, "p"))).data() || {};
      if (s.proposal) throw refuse("already", { byHandle: s.proposal.byHandle });
      tx.set(staffRef(run.id, "p"), { proposal: { answer, by: w.uid, byHandle: w.handle || null, at: TS(now()) } }, { merge: true });
    });
    await log(w, "predict:propose", { runId: run.id, streamId: run.streamId, title: run.prompt.text, details: { answer, option: run.prompt.options[answer] } });
    return { ok: true };
  }

  /** The result: locked → revealed (the slot is free: the result goes on stream) or ended; +10 to each correct pick. */
  async function settleTo(run, answer, w, via) {
    const at = now();
    let took = false;
    await db.runTransaction(async (tx) => {
      const r = asRun(await tx.get(runRef(run.id)));
      if (!r || r.state !== "locked") throw no("over");
      const cRef = ctx.controlRef(r.streamId);
      const control = (await tx.get(cRef)).data() || {};
      const ptr = control.chatGame;
      let free = !ptr || ptr.runId === r.id;
      if (!free && ptr) { const cur = asRun(await tx.get(runRef(ptr.runId))); free = !cur || !L.ACTIVE.includes(cur.state); }
      took = free;
      const t = L.transition(r, free ? "revealed" : "ended", { at });
      tx.update(runRef(r.id), { ...stampMs(t.patch), waiting: false, result: { answer, via, by: w.uid, byHandle: w.handle || null, at: TS(at) }, lastBy: w.uid, lastByHandle: w.handle || null,
        display: predDisplay(r, { phase: "result", counts: r.counts || [], pct: (r.display && r.display.pct) || [], total: (r.display && r.display.total) || 0, correct: answer }) });
      const patch = { chatGameWaiting: C.waitingDrop(control.chatGameWaiting, r.id) };
      if (free) patch.chatGame = L.pointerOf({ ...r, ...t.patch });
      // the slot is busy: the stream view's "Waiting on" chip turns into a result chip for 15 s (public/live.chatGameSettled)
      else patch.chatGameSettled = { runId: r.id, title: r.prompt.text, answer: r.prompt.options[answer], count: (r.counts || [])[answer] || 0, at };
      tx.set(cRef, patch, { merge: true });
      tx.set(staffRef(r.id, "p"), { proposal: null }, { merge: true });
    });
    const stream = await ctx.loadStream(run.streamId);
    const picks = await ballotsOf(run.id, 1);
    const winners = Object.keys(picks).filter((u) => picks[u] === answer);
    const results = await payAll(stream, winners, C.WIN_XP, { ref: `${run.id}:win`, reason: "Called the prediction" });
    await writePlays(run.id, 1, results, "win");
    await log(w, `predict:${via}`, { runId: run.id, streamId: run.streamId, title: run.prompt.text, details: { answer, option: run.prompt.options[answer], winners: winners.length, onStream: took } });
    return { ok: true, winners: winners.length, onStream: took };
  }
  async function correct(run, answer, w) {
    const live = await ctx.liveStream();
    if (!live || live.id !== run.streamId) throw no("otherStream");
    const was = run.result.answer;
    await db.runTransaction(async (tx) => {
      const r = asRun(await tx.get(runRef(run.id)));
      if (!r || r.corrected) throw no("corrected");
      tx.update(runRef(r.id), { corrected: true, result: { ...r.result, answer, was, correctedBy: w.uid, correctedByHandle: w.handle || null, correctedAt: TS(now()) }, lastBy: w.uid, lastByHandle: w.handle || null,
        display: { ...(r.display || {}), correct: answer, corrected: true } });
    });
    const stream = await ctx.loadStream(run.streamId);
    const picks = await ballotsOf(run.id, 1);
    const before = Object.keys(picks).filter((u) => picks[u] === was), after = Object.keys(picks).filter((u) => picks[u] === answer);
    let reversed = 0;
    for (const uid of before) {
      try {
        const r = await G().reverseXp(uid, { feature: "chatGames", ref: `${run.id}:win_rev`, of: `${run.id}:win`, reason: "Prediction result corrected", grantedBy: w.uid });
        if (r && r.reversed) {
          reversed++;
          await db.doc(P.presence(stream.id, uid)).set({ uid, xpEarned: FieldValue.increment(-r.amount), expireAt: TS(now() + PRESENCE_TTL_MS) }, { merge: true });
        }
        await playRef(run.id, uid).set({ r: { 1: { win: { xp: 0, reversed: r && r.reversed ? r.amount : 0 } } } }, { merge: true });
      } catch (err) { console.error("chatGames: XP reversal failed", String((err && err.message) || err).slice(0, 140)); }
    }
    const results = await payAll(stream, after, C.WIN_XP, { ref: `${run.id}:win2`, reason: "Called the prediction (corrected)" });
    await writePlays(run.id, 1, results, "win");
    await log(w, "predict:correct", { runId: run.id, streamId: run.streamId, title: run.prompt.text, details: { was, answer, reversed, paid: after.length } });
    return { ok: true, reversed, winners: after.length };
  }
  /** predictionSettle({ runId, action, answer? }): the Captain or the owner. */
  async function settle(w, d) {
    const run = await loadPred(d);
    const duty = await dutyOf(run.streamId);
    if (!w.isOwner && !L.isCaptain(duty, w.uid)) throw no("notCaptain");
    const action = d && d.action;
    const proposal = ((await staffRef(run.id, "p").get()).data() || {}).proposal || null;
    const ck = C.settleCheck(run, action, { proposal, answer: d && d.answer });
    if (!ck.ok) throw ck.reason === "already" || ck.reason === "over" ? refuse(ck.reason, { byHandle: run.lastBy && run.lastBy !== w.uid ? run.lastByHandle : null }) : no(ck.reason);
    if (action === "reject") {
      await staffRef(run.id, "p").set({ proposal: null, rejected: FieldValue.arrayUnion({ ...proposal, rejectedBy: w.uid }) }, { merge: true });
      await log(w, "predict:reject", { runId: run.id, streamId: run.streamId, title: run.prompt.text, details: { answer: proposal.answer, by: proposal.byHandle } });
      return { ok: true };
    }
    if (action === "void") {
      await move(run.id, "void", { w, reason: "voided", extra: { display: predDisplay(run, { phase: "void", counts: run.counts || null }), waiting: false } });
      await staffRef(run.id, "p").set({ proposal: null }, { merge: true });
      await log(w, "predict:void", { runId: run.id, streamId: run.streamId, title: run.prompt.text });
      await ctx.publishLive();
      return { ok: true };
    }
    const out = action === "correct" ? await correct(run, d.answer, w) : await settleTo(run, ck.answer, w, action === "confirm" ? "confirm" : "settle");
    await syncPointer(run.id);
    await ctx.publishLive();
    return out;
  }

  L.HANDLERS[WYR] = wyr;
  L.HANDLERS[PRED] = pred;
  const wrap = (fn) => async (request) => fn(await caller(request), request.data || {});
  return {
    functions: { predictionPropose: onCall(wrap(propose)), predictionSettle: onCall(wrap(settle)) },
    ops: { propose, settle, predLock, wyrReveal },
  };
};
