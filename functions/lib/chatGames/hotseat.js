// Chat Games, Hot Seat (docs/specs/chat-games.md §5, §11, §12, §15; part 4). Created by the engine (index.js) with its helpers; it registers the "hot-seat"
// format handler and returns chatGameVolunteer. chatGamePlay and chatGameModerate are the engine's (they dispatch to this handler's play / moderate).
//
// A run has `rounds` rounds (1 to 5). Each round, all on the server, phase by phase (run.phase; the round doc rounds/{n}.phase):
//   waiting   round 1 only, when fewer than 2 can play: 30 s for volunteers, then it runs with whoever is there (fewer than 2: the round is void)
//   accept    3 seats drawn at random from members checked in to the current beat plus volunteers, nobody picked twice in one stream; 15 s to tap I'm in,
//             a seat that doesn't is replaced by a new draw (twice at most); when the pool runs dry the round runs with 2; fewer than 2: void, next card
//   answer    60 s, 140 characters through the Questions filter, kept in secret/r{n} (and staff/r{n} for the crew); no answer = out
//   vote      30 s; the answers WITHOUT names in rounds/{n}.answers; everyone checked in to the beat (and the players) votes once, never for themselves
//   reveal    names and counts; the run moves to "revealed"; XP: winner 25 (ties all win), other players 5; no votes: everyone who answered 5, no winner
// Controls (chatGameControl, the Captain or the owner): nextRound, skipCard (before answers open), picker { picker } for the next round, pause / resume
// (paused time is added to closesAt). A mod on duty, the Captain or the owner hides an answer before the reveal (chatGameModerate): that player is out
// with no XP, it's recorded in staff/r{n}.hidden and adminLog, and it never reaches the stream view. A picked player who leaves simply doesn't answer.
// XP: grantXp(uid, n, { feature: "chatGames", ref: "{runId}:{round}" }) under the shared cap; mods clocked in get none. Night Shift "stream"
// { action: "chat-game-played" }; activityLog "chat-game-won" for winners. Cards come from the pack through packs.draw / markUsed (part 3).
const { onCall } = require("firebase-functions/v2/https");
const L = require("./logic");
const HL = require("./hlogic");
const LL = require("../live/logic");
const { isProfane } = require("../accounts/validate");

const SITE_ID = "boomertanger";
const BASE = `sites/${SITE_ID}/chatGames/main`;
const BUSY_MS = 30000;

module.exports = function hotSeat(ctx, { grant = null, factory = null, log, caller, refuse, packs, move, rng = Math.random } = {}) {
  const { db, FieldValue, Timestamp, fail, now, ms, P } = ctx;
  const G = () => grant || (grant = require("../rewards/grant").makeGrant({ db }));
  const F = () => factory || (factory = require("../factory/record").makeFactory({ db, grant: G() }));
  const { PRESENCE_TTL_MS } = require("../live/core");
  const runRef = (id) => db.doc(`${BASE}/runs/${id}`);
  const roundRef = (id, n) => db.doc(`${BASE}/runs/${id}/rounds/${n}`);
  const secretRef = (id, n) => db.doc(`${BASE}/runs/${id}/secret/r${n}`);
  const staffRef = (id, n) => db.doc(`${BASE}/runs/${id}/staff/r${n}`);
  const playRef = (id, uid) => db.doc(`${BASE}/runs/${id}/plays/${uid}`);
  const pickedRef = (sid) => db.doc(`${BASE}/hotSeatPicked/${sid}`);
  const volRef = (sid, uid) => db.doc(`${BASE}/volunteers/${sid}_${uid}`);
  const TS = (m) => Timestamp.fromMillis(m);
  const asRun = (s) => (s && s.exists ? { id: s.id, ...s.data(), closesAtMs: ms(s.get("closesAt")) } : null);
  const loadRun = async (id) => asRun(await runRef(id).get());
  const loadRound = async (id, n) => ((await roundRef(id, n).get()).data() || null);
  const bad = (m, r = "bad-input") => fail("invalid-argument", m, r);

  // ---------- the pool ----------
  async function handlesOf(uids) {
    const out = {};
    const snaps = await Promise.all([...new Set(uids)].map((u) => db.doc(`${P.site}/profiles/${u}`).get()));
    for (const s of snaps) if (s.exists && s.get("handle")) out[s.id] = s.get("handle");
    return out;
  }
  /** Members checked in to the stream's current beat plus volunteers: [{ uid, handle, volunteer }]. */
  async function poolOf(stream) {
    const beat = LL.currentBeat(stream.beats || {});
    const pres = await db.collection(P.presenceCol(stream.id)).get();
    const checked = pres.docs.filter((d) => beat && d.get("beats") && d.get("beats")[beat]).map((d) => d.id);
    const vols = (await db.collection(`${BASE}/volunteers`).where("streamId", "==", stream.id).get()).docs.map((d) => d.get("uid"));
    const uids = [...new Set([...checked, ...vols])];
    const handles = await handlesOf(uids);
    return uids.filter((u) => handles[u]).map((u) => ({ uid: u, handle: handles[u], volunteer: vols.includes(u) }));
  }
  async function checkedIn(stream, uid) {
    const beat = LL.currentBeat(stream.beats || {});
    const p = (await db.doc(P.presence(stream.id, uid)).get()).data();
    return !!(beat && p && p.beats && p.beats[beat]);
  }

  // ---------- the public card for the stream view and the Play panel (no secrets: answers only once the vote opens, names only at the reveal) ----------
  function displayOf(run, round) {
    if (!round) return { kind: "hot-seat", phase: run.phase || "starting", round: run.round || 0, rounds: run.rounds, card: null, picker: run.picker, board: [], seats: [], answers: [], paused: !!run.paused };
    return {
      kind: "hot-seat", phase: round.phase, round: round.n, rounds: run.rounds, card: round.card || null, picker: round.picker, board: round.board || [], paused: !!run.paused,
      seats: (round.seats || []).filter((s) => s.status !== "replaced").map((s) => ({ handle: s.handle, status: s.status })),
      answers: round.phase === "vote" ? (round.answers || []).map((a) => ({ id: a.id, text: a.text })) : round.phase === "reveal" ? (round.results || []).filter((r) => !r.hidden).map((r) => ({ id: r.id, text: r.text, handle: r.handle, votes: r.votes, pct: r.pct, winner: r.winner })) : [],
      noVotes: !!round.noVotes,
    };
  }
  async function writeRun(runId, patch) {
    const p = { ...patch, updatedAt: TS(now()) };
    if (typeof p.closesAt === "number") p.closesAt = TS(p.closesAt);
    await runRef(runId).update(p);
  }

  // ---------- one round ----------
  /** Starts round n (or ends the run when there are no rounds or cards left). Returns { closesAt } for the engine to schedule. */
  async function startRound(runId, n, { stream: st = null } = {}) {
    let run = await loadRun(runId);
    const stream = st || await ctx.loadStream(run.streamId);
    for (let k = n; k <= run.rounds; k++) {
      const at = now();
      const drawn = k === 1 && run.firstCardId ? { card: (await cardById(run.packId, run.firstCardId)) } : await packs.draw(run.packId, { skip: run.usedCards || [], rng });
      if (!drawn || !drawn.card) { await finish(runId, "noCards"); return {}; }
      await packs.markUsed(run.packId, drawn.card.id, stream.id);
      const picker = HL.pickerOf(run.nextPicker || run.picker);
      const pool = await poolOf(stream);
      const pickedSnap = (await pickedRef(stream.id).get()).data() || {};
      const taken = new Set(pickedSnap.uids || []);
      const available = pool.filter((p) => !taken.has(p.uid));
      const used = [...(run.usedCards || []), drawn.card.id];
      if (available.length < HL.MIN_PLAYERS && k === 1 && !run.waited) {
        const round = { n: k, cardId: drawn.card.id, card: drawn.card.text, picker, phase: "waiting", seats: [], board: available.map((p) => p.handle), closesAt: TS(at + HL.WAIT_MS) };
        await roundRef(runId, k).set(round);
        await writeRun(runId, { round: k, phase: "waiting", waited: true, picker, usedCards: used, closesAt: at + HL.WAIT_MS, display: displayOf({ ...run, round: k, picker }, round), replaceRounds: 0 });
        return { closesAt: at + HL.WAIT_MS };
      }
      const seats = HL.pickSeats(available, HL.SEATS, rng).map((p, i) => ({ seat: i + 1, uid: p.uid, handle: p.handle, volunteer: !!p.volunteer, status: "picked" }));
      if (seats.length < HL.MIN_PLAYERS) {
        await roundRef(runId, k).set({ n: k, cardId: drawn.card.id, card: drawn.card.text, picker, phase: "void", reason: "notEnoughPlayers", seats, board: [] });
        await writeRun(runId, { round: k, phase: "void", usedCards: used, closesAt: null });
        run = await loadRun(runId);
        continue;   // the next card
      }
      await pickedRef(stream.id).set({ uids: FieldValue.arrayUnion(...seats.map((s) => s.uid)), updatedAt: TS(at) }, { merge: true });
      const round = { n: k, cardId: drawn.card.id, card: drawn.card.text, picker, phase: "accept", seats, board: HL.boardNames(pool, seats, rng), closesAt: TS(at + HL.ACCEPT_MS), startedAt: TS(at) };
      await roundRef(runId, k).set(round);
      await secretRef(runId, k).set({ answers: {}, votes: {}, idMap: {} });
      await staffRef(runId, k).set({ answers: {}, hidden: {} });
      await writeRun(runId, { round: k, phase: "accept", picker, usedCards: used, closesAt: at + HL.ACCEPT_MS, display: displayOf({ ...run, round: k, picker }, round), replaceRounds: 0 });
      return { closesAt: at + HL.ACCEPT_MS };
    }
    await finish(runId, "rounds");
    return {};
  }
  async function cardById(packId, cardId) {
    const p = (await db.doc(`${BASE}/packs/${packId}`).get()).data();
    return p ? (p.cards || []).find((c) => c.id === cardId) || null : null;
  }
  async function finish(runId, reason) {
    const run = await loadRun(runId);
    if (!run || L.FINAL.includes(run.state)) return;
    await writeRun(runId, { phase: "over", endReason: reason, closesAt: null });
    try { await move(runId, run.state === "revealed" ? "ended" : "ended", {}); } catch (err) { /* already over */ }
  }

  /** Claims the phase so a deadline task and an early advance never both run it. Returns the run, or null when someone else has it. */
  async function claim(runId, phase) {
    let out = null;
    await db.runTransaction(async (tx) => {
      const run = asRun(await tx.get(runRef(runId)));
      if (!run || run.state !== "open" || run.paused) return;
      const stale = run.busyAt && now() - ms(run.busyAt) > BUSY_MS;
      if (run.phase !== phase && !(run.phase === `busy:${phase}` && stale)) return;
      tx.update(runRef(runId), { phase: `busy:${phase}`, busyAt: TS(now()) });
      out = run;
    });
    return out;
  }

  /** The current phase is over (its deadline passed, or everyone is done early). Returns { closesAt } when a new deadline starts. */
  async function advance(runId, phase) {
    const run = await claim(runId, phase);
    if (!run) return {};
    const n = run.round, at = now();
    const round = await loadRound(runId, n);
    const stream = await ctx.loadStream(run.streamId);
    if (phase === "waiting") return startRound(runId, n, { stream });
    if (phase === "accept") {
      const seats = [...round.seats];
      const pending = seats.filter((s) => s.status === "picked");
      let added = 0;
      if (pending.length && (run.replaceRounds || 0) < HL.MAX_REPLACE_ROUNDS) {
        const pool = await poolOf(stream);
        const taken = new Set(((await pickedRef(stream.id).get()).data() || {}).uids || []);
        const fresh = HL.pickSeats(pool.filter((p) => !taken.has(p.uid) && !seats.some((s) => s.uid === p.uid)), pending.length, rng);
        for (const s of pending) s.status = "replaced";
        const freed = pending.map((s) => s.uid);   // anyone replaced can be drawn again
        for (const p of fresh) { seats.push({ seat: seats.length + 1, uid: p.uid, handle: p.handle, volunteer: !!p.volunteer, status: "picked" }); added++; }
        await pickedRef(stream.id).set({ uids: FieldValue.arrayRemove(...freed), updatedAt: TS(at) }, { merge: true });
        if (fresh.length) await pickedRef(stream.id).set({ uids: FieldValue.arrayUnion(...fresh.map((p) => p.uid)) }, { merge: true });
      } else for (const s of pending) s.status = "out";
      if (added) {
        const r2 = { ...round, seats, closesAt: TS(at + HL.ACCEPT_MS) };
        await roundRef(runId, n).update({ seats, closesAt: r2.closesAt });
        await writeRun(runId, { phase: "accept", closesAt: at + HL.ACCEPT_MS, replaceRounds: (run.replaceRounds || 0) + 1, display: displayOf(run, r2) });
        return { closesAt: at + HL.ACCEPT_MS };
      }
      const inSeats = seats.filter((s) => s.status === "in");
      if (inSeats.length < HL.MIN_PLAYERS) return voidRound(runId, run, round, seats, "notEnoughPlayers");
      const r2 = { ...round, seats, phase: "answer", closesAt: TS(at + HL.ANSWER_MS) };
      await roundRef(runId, n).update({ seats, phase: "answer", closesAt: r2.closesAt });
      await writeRun(runId, { phase: "answer", closesAt: at + HL.ANSWER_MS, display: displayOf(run, r2) });
      return { closesAt: at + HL.ANSWER_MS };
    }
    if (phase === "answer") {
      const [sec, stf] = await Promise.all([secretRef(runId, n).get(), staffRef(runId, n).get()]);
      const answers = (sec.data() || {}).answers || {}, hidden = (stf.data() || {}).hidden || {};
      const seats = round.seats.map((s) => (s.status === "in" ? { ...s, status: "out" } : s));   // in but no answer: out
      const live = seats.filter((s) => s.status === "answered" && answers[s.uid] && !hidden[s.uid]);
      if (!live.length) return voidRound(runId, run, round, seats, "noAnswers");
      const order = HL.shuffle(live, rng);
      const list = order.map((s, i) => ({ id: `a${i + 1}`, text: answers[s.uid] }));
      const idMap = Object.fromEntries(order.map((s, i) => [`a${i + 1}`, s.uid]));
      await secretRef(runId, n).set({ idMap }, { merge: true });
      for (const [aid, uid] of Object.entries(idMap)) await playRef(runId, uid).set({ round: n, r: { [n]: { answerId: aid } } }, { merge: true });
      const r2 = { ...round, seats, phase: "vote", answers: list, closesAt: TS(at + HL.VOTE_MS) };
      await roundRef(runId, n).update({ seats, phase: "vote", answers: list, closesAt: r2.closesAt });
      await writeRun(runId, { phase: "vote", closesAt: at + HL.VOTE_MS, display: displayOf(run, r2) });
      return { closesAt: at + HL.VOTE_MS };
    }
    if (phase === "vote") return reveal(runId, run, round, stream);
    return {};
  }
  async function voidRound(runId, run, round, seats, reason) {
    await roundRef(runId, run.round).update({ seats, phase: "void", reason, closesAt: null });
    await writeRun(runId, { phase: "void", closesAt: null });
    if (run.round >= run.rounds) { await finish(runId, "rounds"); return {}; }
    return startRound(runId, run.round + 1);
  }

  async function reveal(runId, run, round, stream) {
    const n = run.round;
    const [sec, stf] = await Promise.all([secretRef(runId, n).get(), staffRef(runId, n).get()]);
    const s = sec.data() || {}, hid = (stf.data() || {}).hidden || {};
    const answers = Object.entries(s.idMap || {}).map(([id, uid]) => ({ id, uid, text: (s.answers || {})[uid] }));
    const hiddenOut = round.seats.filter((x) => hid[x.uid] && !answers.some((a) => a.uid === x.uid)).map((x) => ({ id: `h${x.seat}`, uid: x.uid, text: null }));
    const t = HL.tally({ answers: [...answers, ...hiddenOut], votes: s.votes || {}, hidden: new Set(Object.keys(hid)) });
    const handleOf = (uid) => (round.seats.find((x) => x.uid === uid) || {}).handle || null;
    const duty = (await db.doc(P.duty(stream.id)).get()).data() || null;
    const settings = await ctx.settings();
    const results = [];
    for (const r of t.rows) {
      let xp = 0, capped = false, crew = false;
      if (r.xp > 0) {
        if (duty && duty.onDuty && duty.onDuty[r.uid]) crew = true;
        else {
          const pref = db.doc(P.presence(stream.id, r.uid));
          const pres = (await pref.get()).data() || {};
          const paid = LL.capPayout(pres.xpEarned || 0, r.xp, settings.xpStreamCap);
          capped = paid < r.xp;
          if (paid > 0) {
            try {
              const g = await G().grantXp(r.uid, paid, { feature: "chatGames", ref: `${runId}:${n}`, reason: r.winner ? "Hot Seat winner" : "Played the Hot Seat" });
              if (g && g.granted) { xp = paid; await pref.set({ uid: r.uid, xpEarned: FieldValue.increment(paid), expireAt: TS(now() + PRESENCE_TTL_MS) }, { merge: true }); }
            } catch (err) { console.error("chatGames: Hot Seat XP failed", String((err && err.message) || err).slice(0, 140)); }
          }
          try { await F().recordFactoryEvent(r.uid, "stream", { action: "chat-game-played" }, `${runId}:${n}`); } catch (err) { /* Night Shift is best-effort */ }
          if (r.winner) { try { await db.collection("activityLog").add({ feature: "chatGames", type: "chat-game-won", summary: `@${handleOf(r.uid) || "someone"} won the Hot Seat`, link: "/live", actorName: null, streamId: stream.id, createdAt: FieldValue.serverTimestamp() }); } catch { /* best-effort */ } }
        }
      }
      results.push({ ...r, handle: handleOf(r.uid), xpPaid: xp, capped, crew });
      await playRef(runId, r.uid).set({ round: n, r: { [n]: { result: { winner: r.winner, votes: r.votes, pct: r.pct, xp, capped, crew, hidden: !!r.hidden } } } }, { merge: true });
    }
    const r2 = { ...round, phase: "reveal", results: results.map(({ uid, ...x }) => ({ ...x, uid })), noVotes: t.noVotes, closesAt: null };
    await roundRef(runId, n).update({ phase: "reveal", results: r2.results, noVotes: t.noVotes, totalVotes: t.total, closesAt: null });
    await writeRun(runId, { phase: "reveal", closesAt: null, display: displayOf(run, r2) });
    await move(runId, "revealed", {});
    return {};
  }

  // ---------- the handler ----------
  const handler = {
    title: "Hot Seat",
    async prepare({ stream, options }) {
      const o = options || {};
      const packId = typeof o.packId === "string" && L.ID_SAFE.test(o.packId) ? o.packId : null;
      if (!packId) throw bad("Pick a pack.");
      const p = (await db.doc(`${BASE}/packs/${packId}`).get()).data();
      if (!p || p.formatId !== "hot-seat" || p.status !== "approved") throw fail("failed-precondition", "Pick an approved Hot Seat pack.", "badPack");
      if (!(p.cards || []).length) throw fail("failed-precondition", "That pack has no cards yet.", "emptyPack");
      const first = typeof o.cardId === "string" && (p.cards || []).some((c) => c.id === o.cardId) ? o.cardId : null;
      return { packId, firstCardId: first };
    },
    start(run, options, { at, prep }) {
      const picker = HL.pickerOf(options && options.picker);
      return { ok: true, patch: { state: "open", phase: "starting", rounds: HL.roundsOf(options && options.rounds), picker, nextPicker: picker, packId: prep.packId, firstCardId: prep.firstCardId, usedCards: [], waited: false, paused: false, round: 0, closesAt: null, display: null, openedAt: at } };
    },
    async afterStart(run, { stream }) { return startRound(run.id, 1, { stream }); },
    async onDeadline(run) {
      const phase = String(run.phase || "").replace(/^busy:/, "");
      const r = await advance(run.id, phase);
      return { handled: true, closesAt: r.closesAt };
    },
    async control(run, action, data) {
      if (action === "nextRound") {
        if (!["revealed", "open"].includes(run.state) || !["reveal", "void"].includes(run.phase)) return { ok: false, reason: "notYet", message: "Finish this round first." };
        if (run.round >= run.rounds) { await finish(run.id, "rounds"); return { ok: true, handled: true }; }
        if (run.state === "revealed") await move(run.id, "open", {});
        const r = await startRound(run.id, run.round + 1);
        return { ok: true, handled: true, closesAt: r.closesAt };
      }
      if (action === "picker") {
        const p = data && data.picker;
        if (!HL.PICKERS.includes(p)) return { ok: false, reason: "bad-input", message: "Séance board or Wheel?" };
        await writeRun(run.id, { nextPicker: p });
        return { ok: true, handled: true };
      }
      if (action === "skipCard") {
        if (!["waiting", "accept"].includes(run.phase)) return { ok: false, reason: "notYet", message: "Skip the card before the answers open." };
        const d = await packs.draw(run.packId, { skip: run.usedCards || [], rng });
        if (!d) return { ok: false, reason: "noCards", message: "No more cards in this pack." };
        await packs.markUsed(run.packId, d.card.id, run.streamId);
        await roundRef(run.id, run.round).update({ cardId: d.card.id, card: d.card.text });
        const round = await loadRound(run.id, run.round);
        await writeRun(run.id, { usedCards: [...(run.usedCards || []), d.card.id], display: displayOf(run, round) });
        return { ok: true, handled: true };
      }
      if (action === "pause") {
        if (run.paused || !run.closesAtMs) return { ok: false, reason: "notTimed", message: "Nothing is counting down." };
        const left = Math.max(0, run.closesAtMs - now());
        await writeRun(run.id, { paused: true, pausedLeft: left, closesAt: null, display: { ...(run.display || {}), paused: true } });
        await roundRef(run.id, run.round).update({ paused: true });
        return { ok: true, handled: true };
      }
      if (action === "resume") {
        if (!run.paused) return { ok: false, reason: "notPaused", message: "It isn't paused." };
        const close = now() + (run.pausedLeft || 0);
        await writeRun(run.id, { paused: false, pausedLeft: null, closesAt: close, display: { ...(run.display || {}), paused: false } });
        await roundRef(run.id, run.round).update({ paused: false, closesAt: TS(close) });
        return { ok: true, handled: true, closesAt: close };
      }
      return { ok: false, reason: "badAction", message: "That control isn't part of Hot Seat." };
    },
    /** A member's move: accept the seat, answer, vote. */
    async play(run, action, data, w) {
      const n = run.round;
      if (run.paused) throw fail("failed-precondition", "Hot Seat is paused for a moment.", "paused");
      if (run.closesAtMs && run.closesAtMs < now()) throw fail("failed-precondition", "That closed.", "closed");
      const stream = await ctx.loadStream(run.streamId);
      if (action === "accept") {
        if (run.phase !== "accept") throw fail("failed-precondition", "It's too late to take the seat.", "closed");
        let allIn = false;
        await db.runTransaction(async (tx) => {
          const r = (await tx.get(roundRef(run.id, n))).data();
          const seat = (r.seats || []).find((s) => s.uid === w.uid && s.status !== "replaced");
          if (!seat) throw fail("permission-denied", "You weren't picked this round.", "notPicked");
          if (seat.status === "in") throw refuse("already");
          const seats = r.seats.map((s) => (s === seat ? { ...s, status: "in" } : s));
          tx.update(roundRef(run.id, n), { seats });
          allIn = seats.filter((s) => s.status !== "replaced" && s.status !== "out").every((s) => s.status === "in");
        });
        await playRef(run.id, w.uid).set({ round: n, r: { [n]: { seat: true } }, at: TS(now()) }, { merge: true });
        if (allIn) { const r = await advance(run.id, "accept"); return { ok: true, closesAt: r.closesAt, changed: true }; }
        await refreshDisplay(run.id);
        return { ok: true, changed: true };
      }
      if (action === "answer") {
        if (run.phase !== "answer") throw fail("failed-precondition", "Answers are closed.", "closed");
        const c = HL.cleanAnswer(data && data.text, { isProfane });
        if (!c.ok) throw bad(c.message, c.reason);
        let allDone = false;
        await db.runTransaction(async (tx) => {
          const r = (await tx.get(roundRef(run.id, n))).data();
          const seat = (r.seats || []).find((s) => s.uid === w.uid);
          if (!seat || !["in", "answered"].includes(seat.status)) throw fail("permission-denied", "You're not in the Hot Seat this round.", "notPlaying");
          const seats = r.seats.map((s) => (s === seat ? { ...s, status: "answered" } : s));
          tx.update(roundRef(run.id, n), { seats });
          tx.set(secretRef(run.id, n), { answers: { [w.uid]: c.text } }, { merge: true });
          tx.set(staffRef(run.id, n), { answers: { [w.uid]: { text: c.text, handle: seat.handle } } }, { merge: true });
          allDone = !seats.some((s) => s.status === "in");
        });
        await playRef(run.id, w.uid).set({ round: n, r: { [n]: { answer: c.text } }, at: TS(now()) }, { merge: true });
        if (allDone) { const r = await advance(run.id, "answer"); return { ok: true, closesAt: r.closesAt, changed: true }; }
        await refreshDisplay(run.id);
        return { ok: true, changed: true };
      }
      if (action === "vote") {
        if (run.phase !== "vote") throw fail("failed-precondition", "Voting is closed.", "closed");
        const id = data && data.answerId;
        const round = await loadRound(run.id, n);
        const isPlayer = (round.seats || []).some((s) => s.uid === w.uid && s.status !== "replaced");
        if (!isPlayer && !(await checkedIn(stream, w.uid))) throw fail("failed-precondition", "Check in to this beat to vote.", "notCheckedIn");
        await db.runTransaction(async (tx) => {
          const s = (await tx.get(secretRef(run.id, n))).data() || {};
          if (!s.idMap || !(id in s.idMap)) throw bad("Pick an answer.");
          if (s.idMap[id] === w.uid) throw fail("failed-precondition", "You can't vote for your own answer.", "ownAnswer");
          if ((s.votes || {})[w.uid]) throw refuse("already");
          tx.set(secretRef(run.id, n), { votes: { [w.uid]: id } }, { merge: true });
        });
        await playRef(run.id, w.uid).set({ round: n, r: { [n]: { vote: id } }, at: TS(now()) }, { merge: true });
        return { ok: true };
      }
      throw bad("Unknown move.");
    },
    /** Hide an answer before the reveal. */
    async moderate(run, data, w) {
      const uid = data && data.uid;
      if (typeof uid !== "string" || !L.ID_SAFE.test(uid)) throw bad("Whose answer?");
      if (!["answer", "vote"].includes(run.phase)) throw fail("failed-precondition", "Answers can be hidden before the reveal only.", "closed");
      const n = run.round;
      let handle = null;
      await db.runTransaction(async (tx) => {
        const [rs, ss, sec] = await Promise.all([tx.get(roundRef(run.id, n)), tx.get(staffRef(run.id, n)), tx.get(secretRef(run.id, n))]);
        const r = rs.data(), st = ss.data() || {}, s = sec.data() || {};
        const seat = (r.seats || []).find((x) => x.uid === uid);
        if (!seat) throw fail("not-found", "That player isn't in this round.", "gone");
        if ((st.hidden || {})[uid]) throw refuse("already");
        handle = seat.handle;
        tx.set(staffRef(run.id, n), { hidden: { [uid]: { by: w.uid, byHandle: w.handle || null, at: TS(now()) } } }, { merge: true });
        const seats = r.seats.map((x) => (x.uid === uid ? { ...x, status: "hidden" } : x));
        const patch = { seats };
        if (r.phase === "vote") {
          const id = Object.keys(s.idMap || {}).find((k) => s.idMap[k] === uid);
          if (id) {
            patch.answers = (r.answers || []).filter((a) => a.id !== id);
            const votes = Object.fromEntries(Object.entries(s.votes || {}).filter(([, v]) => v !== id));
            const idMap = Object.fromEntries(Object.entries(s.idMap).filter(([k]) => k !== id));
            tx.update(secretRef(run.id, n), { votes, idMap });
          }
        }
        tx.update(roundRef(run.id, n), patch);
      });
      await log(w, "hotSeat:hide", { runId: run.id, streamId: run.streamId, title: "Hot Seat", details: { round: n, uid, handle } });
      await refreshDisplay(run.id);
      return { ok: true, changed: true };
    },
  };
  async function refreshDisplay(runId) {
    const run = await loadRun(runId);
    const round = run && run.round ? await loadRound(runId, run.round) : null;
    if (run) await writeRun(runId, { display: displayOf(run, round) });
  }
  L.HANDLERS["hot-seat"] = handler;

  // ---------- Put me in ----------
  async function volunteer(w, d) {
    if (!w.handle) throw fail("failed-precondition", "Finish signing up first.", "needsSignup");
    const live = await ctx.liveStream();
    const ptr = live ? ((await ctx.control(live.id)).chatGame || null) : null;
    if (!live || !ptr || ptr.formatId !== "hot-seat") throw fail("failed-precondition", "Hot Seat isn't running.", "notRunning");
    const ref = volRef(live.id, w.uid);
    if (d && d.on === false) { await ref.delete(); return { ok: true, on: false }; }
    await ref.set({ uid: w.uid, handle: w.handle, streamId: live.id, at: TS(now()) });
    return { ok: true, on: true };
  }

  const wrap = (fn) => async (request) => fn(await caller(request), request.data || {});
  return { functions: { chatGameVolunteer: onCall(wrap(volunteer)) }, ops: { startRound, advance, volunteer, poolOf, displayOf }, handler };
};
