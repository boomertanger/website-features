// Chat Games, Questions (docs/specs/chat-games.md §4, §11, §12, §13; part 2). Created by the engine (index.js) with its helpers; it registers the "questions"
// format handler in logic.HANDLERS and returns its own functions.
//
//   questionAsk({ text })                    a signed-up member: 200 characters of plain text, 3 open across both lanes, the text filter; accounts under
//                                            7 days are held for a mod; Tonight while a stream is live, Standing otherwise
//   questionWithdraw({ questionId })         the asker, while it's open
//   questionModerate({ questionId, action, targetId })   approve | hide | toStanding | merge (voters counted once). Who: the owner, the Captain and crew
//                                            clocked in while live; off air, admins and mods (so held questions never wait for a stream). adminLog "chatGames".
//   onQuestionVote                           trigger on questions/{id}/votes/{uid}: keeps questions/{id}.votes (a copied merge vote is already counted)
//   questionArchive                          daily 05:15 America/Los_Angeles: Standing questions unanswered for 30 days are archived
//   the "questions" handler                  a session run: start (5, 10, 15 or open-ended minutes), Answered / Skip / Pin next / Next question through
//                                            chatGameControl, the timer lets the card on screen finish, Stop settles Tonight (5+ votes → Standing, else cleared)
//
// DATA sites/boomertanger/chatGames/main/questions/{id}: { text, uid, handle, status, lane, votes, createdAt, streamId, standingSince, mergedInto,
// answeredAt, answeredOn, answeredRunId, answeredBy, xp, capped, onAir, expireAt }. votes/{uid}: { at } (the member's own; { at, fromMerge } when Merge copies it).
// The run doc keeps a public `display` card for the Play panel and the stream view: { kind, questionId, text, handle, votes, here, lane, next, ending }.
// XP: the asker gets 15 via grantXp(uid, n, { feature: "chatGames", ref: "q:{questionId}" }) under the shared 100 XP cap (presence.xpEarned, set-merge);
// a mod clocked in for the stream gets none. Night Shift event "stream" { action: "question-answered" }; activityLog "question-answered".
const { onCall } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const L = require("./logic");
const Q = require("./qlogic");
const LL = require("../live/logic");
const { isProfane } = require("../accounts/validate");

const SITE_ID = "boomertanger";
const BASE = `sites/${SITE_ID}/chatGames/main`;

module.exports = function questions(ctx, { grant = null, factory = null, log, caller, refuse, syncPointer } = {}) {
  const { db, FieldValue, Timestamp, fail, now, ms, P } = ctx;
  const G = () => grant || (grant = require("../rewards/grant").makeGrant({ db }));
  const F = () => factory || (factory = require("../factory/record").makeFactory({ db, grant: G() }));
  const { PRESENCE_TTL_MS } = require("../live/core");
  const qCol = () => db.collection(`${BASE}/questions`);
  const qRef = (id) => db.doc(`${BASE}/questions/${id}`);
  const runRef = (id) => db.doc(`${BASE}/runs/${id}`);
  const TS = (m) => Timestamp.fromMillis(m);
  const asQ = (d) => (d && d.exists ? { id: d.id, ...d.data(), createdAtMs: ms(d.get("createdAt")), standingSinceMs: ms(d.get("standingSince")) } : null);
  const bad = (message, reason = "bad-input", extra = {}) => fail("invalid-argument", message, reason, extra);
  const idOk = (x) => typeof x === "string" && L.ID_SAFE.test(x);

  // ---------- who ----------
  /** The owner, the Captain and crew clocked in while live; off air, admins and mods. Returns the live stream and its duty doc. */
  async function requireModerator(w) {
    const live = await ctx.liveStream();
    const duty = live ? ((await db.doc(P.duty(live.id)).get()).data() || null) : null;
    const ok = w.isOwner || (live ? (L.isCaptain(duty, w.uid) || !!(duty && duty.onDuty && duty.onDuty[w.uid])) : (w.isAdmin || w.isMod));
    if (!ok) throw fail("permission-denied", live ? "Mods on duty, the Captain and the owner moderate questions." : "Only the crew moderates questions.", "notModerator");
    return { live, duty };
  }

  // ---------- reading the queue ----------
  async function openQuestions() {
    const [t, s] = await Promise.all([qCol().where("status", "==", "tonight").get(), qCol().where("status", "==", "standing").get()]);
    return [...t.docs, ...s.docs].map(asQ);
  }
  /** Is the asker checked in to the stream's current beat? */
  async function hereFor(stream, uid) {
    if (!stream || !uid) return false;
    const beat = LL.currentBeat(stream.beats || {});
    if (!beat) return false;
    const p = (await db.doc(P.presence(stream.id, uid)).get()).data();
    return !!(p && p.beats && p.beats[beat]);
  }
  const cardOf = (q) => (q ? { questionId: q.id, text: q.text, handle: q.handle || null, votes: q.votes || 0, lane: q.status } : null);
  async function displayFor(stream, current, next, { ending = false } = {}) {
    if (!current) return { kind: "question", questionId: null, text: null, handle: null, votes: 0, here: false, lane: null, next: next ? { text: next.text, votes: next.votes || 0 } : null, ending };
    return { kind: "question", ...cardOf(current), here: await hereFor(stream, current.uid), next: next ? { text: next.text, votes: next.votes || 0 } : null, ending };
  }
  async function setOnAir(qid, runId, on) {
    if (!qid) return;
    try { await qRef(qid).update({ onAir: on ? { runId, at: TS(now()) } : null }); } catch { /* gone */ }
  }

  // ---------- XP for an answered question ----------
  async function payAnswer(q, stream) {
    const duty = (await db.doc(P.duty(stream.id)).get()).data() || null;
    if (duty && duty.onDuty && duty.onDuty[q.uid]) return { xp: 0, crew: true };   // a mod clocked in earns no game XP tonight
    const settings = await ctx.settings();
    const pref = db.doc(P.presence(stream.id, q.uid));
    const pres = (await pref.get()).data() || {};
    const paid = LL.capPayout(pres.xpEarned || 0, Q.ANSWER_XP, settings.xpStreamCap);
    if (paid <= 0) return { xp: 0, capped: true };
    let r = null;
    try { r = await G().grantXp(q.uid, paid, { feature: "chatGames", ref: `q:${q.id}`, reason: "Your question was answered on stream" }); }
    catch (err) { console.error("chatGames: question XP failed", String((err && err.message) || err).slice(0, 140)); return { xp: 0 }; }
    if (r && r.granted) await pref.set({ uid: q.uid, xpEarned: FieldValue.increment(paid), expireAt: TS(now() + PRESENCE_TTL_MS) }, { merge: true });
    return { xp: r && r.granted ? paid : 0, capped: paid < Q.ANSWER_XP };
  }
  async function celebrate(q, stream, pay) {
    if (pay.crew) return;
    try { await F().recordFactoryEvent(q.uid, "stream", { action: "question-answered" }, `q:${q.id}`); } catch (err) { console.error("chatGames: Night Shift event failed", String((err && err.message) || err).slice(0, 140)); }
    try { await db.collection("activityLog").add({ feature: "chatGames", type: "question-answered", summary: `@${q.handle || "someone"}'s question was answered on stream`, link: "/live/questions", actorName: null, streamId: stream.id, createdAt: FieldValue.serverTimestamp() }); }
    catch (err) { console.error("chatGames: activityLog failed", err); }
  }

  // ---------- the "questions" format ----------
  /** The next card for a run: the pinned one, else the session order. Returns { current, next, list }. */
  async function pick(run) {
    const list = Q.queue(await openQuestions(), { skipped: run.skipped || [], pinned: run.pinned || null, current: null });
    return { current: list[0] || null, next: list[1] || null, list };
  }
  const handler = {
    title: "Questions",
    async prepare({ stream }) {
      const list = Q.queue(await openQuestions());
      return { current: list[0] || null, display: await displayFor(stream, list[0] || null, list[1] || null), count: list.length };
    },
    start(run, options, { at, prep }) {
      const minutes = Q.sessionMinutes(options && options.minutes);
      return { ok: true, patch: {
        state: "open", openedAt: at, closesAt: minutes ? at + minutes * 60000 : null, round: 1, options: { minutes },
        current: prep && prep.current ? prep.current.id : null, pinned: null, skipped: [], answeredIds: [], ending: false, display: prep ? prep.display : null,
      } };
    },
    async afterStart(run) { const r = (await runRef(run.id).get()).data() || {}; await setOnAir(r.current, run.id, true); },
    /** Answered, Skip, Pin next, Next question. Returns what the engine writes. */
    async control(run, action, data, { at, w, stream }) {
      const cur = run.current || null;
      const nextRun = async (extra) => {
        const r2 = { ...run, ...extra, current: null };
        const p = await pick(r2);
        await setOnAir(cur, run.id, false);
        if (run.ending) return { ok: true, to: "ended", patch: { ...extra, current: null, display: null } };
        if (p.current) await setOnAir(p.current.id, run.id, true);
        return { ok: true, patch: { ...extra, current: p.current ? p.current.id : null, round: (run.round || 0) + 1, pinned: extra.pinned !== undefined ? extra.pinned : (p.current && p.current.id === run.pinned ? null : run.pinned || null), display: await displayFor(stream, p.current, p.next) }, pointer: true };
      };
      if (action === "answered" || action === "skip") {
        if (!cur) return { ok: false, reason: "noCard", message: "There's no question on screen." };
        if (data && data.questionId && data.questionId !== cur) throw refuse("already", { byHandle: run.lastByHandle || null });
        if (action === "skip") return nextRun({ skipped: [...(run.skipped || []), cur] });
        let q = null, by = null;
        await db.runTransaction(async (tx) => {
          const s = await tx.get(qRef(cur));
          q = asQ(s);
          if (!q) throw fail("not-found", "That question is gone.", "gone");
          if (!Q.VOTABLE.includes(q.status)) { by = q.answeredByHandle || null; throw refuse("already", { byHandle: by }); }
          tx.update(qRef(cur), { status: "answered", answeredAt: TS(at), answeredOn: stream.id, answeredRunId: run.id, answeredBy: w.uid, answeredByHandle: w.handle || null });
        });
        const pay = await payAnswer(q, stream);
        await qRef(cur).update({ xp: pay.xp, capped: !!pay.capped });
        await celebrate(q, stream, pay);
        await log(w, "question:answered", { runId: run.id, streamId: stream.id, title: "Questions", details: { questionId: cur, xp: pay.xp, capped: !!pay.capped } });
        return nextRun({ answeredIds: [...(run.answeredIds || []), cur] });
      }
      if (action === "pinNext") {
        const id = data && data.questionId;
        if (!idOk(id)) return { ok: false, reason: "bad-input", message: "Pick a question to pin." };
        const q = asQ(await qRef(id).get());
        if (!q || !Q.VOTABLE.includes(q.status) || id === cur) return { ok: false, reason: "notOpen", message: "That question can't be pinned." };
        const list = Q.queue(await openQuestions(), { skipped: run.skipped || [], pinned: id, current: cur });
        const curQ = cur ? asQ(await qRef(cur).get()) : null;
        return { ok: true, patch: { pinned: id, display: await displayFor(stream, curQ, list[0] || null, { ending: !!run.ending }) } };
      }
      if (action === "nextRound") {
        if (cur) return { ok: false, reason: "busy", message: "Answer or skip the question on screen first." };
        return nextRun({});
      }
      return { ok: false, reason: "badAction", message: "That control isn't part of Questions." };
    },
    /** The timer ran out: the card on screen may finish (Answered or Skip then ends the session); with none on screen it ends now. */
    async onDeadline(run) {
      if (!run.current) return "ended";
      return { patch: { ending: true, closesAt: null, display: { ...(run.display || {}), ending: true } } };
    },
    /** Stop: Tonight questions with 5+ votes move to Standing; the rest are cleared and deleted after 30 days. */
    async atStop() {
      const at = now();
      const snap = await qCol().where("status", "==", "tonight").get();
      for (const d of snap.docs) {
        const s = Q.settleAtStop({ votes: d.get("votes") || 0 });
        await d.ref.update(s.status === "standing" ? { status: "standing", standingSince: TS(at), onAir: null } : { status: "cleared", expireAt: TS(at + Q.CLEAR_KEEP_MS), onAir: null });
      }
      return { settled: snap.size };
    },
  };
  L.HANDLERS.questions = handler;

  // ---------- callables ----------
  async function ask(w, data) {
    const t = Q.cleanText(data && data.text, { isProfane });
    if (!t.ok) throw bad(t.message, t.reason);
    if (!w.handle) throw fail("failed-precondition", "Finish signing up first.", "needsSignup");
    const user = (await db.doc(`users/${w.uid}`).get()).data() || {};
    if (!user.signedUpAt) throw fail("failed-precondition", "Finish signing up first.", "needsSignup");
    const mine = (await qCol().where("uid", "==", w.uid).get()).docs.map(asQ).filter((q) => Q.OPEN.includes(q.status));
    if (mine.length >= Q.MAX_OPEN) throw fail("resource-exhausted", "You have 3 open questions. Withdraw one to ask another.", "limit", { open: mine.map((q) => ({ id: q.id, text: q.text, status: q.status })) });
    const at = now();
    const live = await ctx.liveStream();
    const lane = Q.laneFor(!!live);
    const held = Q.isHeld({ signedUpAtMs: ms(user.signedUpAt), staff: w.isAdmin || w.isMod || w.isOwner, nowMs: at });
    const ref = qCol().doc();
    const doc = { text: t.text, uid: w.uid, handle: w.handle, status: held ? "held" : lane, lane, votes: 0, createdAt: TS(at), streamId: live ? live.id : null,
      standingSince: !held && lane === "standing" ? TS(at) : null, mergedInto: null, answeredAt: null, onAir: null, expireAt: null };
    await ref.set(doc);
    return { ok: true, questionId: ref.id, status: doc.status, lane };
  }
  async function withdraw(w, data) {
    const id = data && data.questionId;
    if (!idOk(id)) throw bad("Which question?");
    let out = null;
    await db.runTransaction(async (tx) => {
      const q = asQ(await tx.get(qRef(id)));
      if (!q || q.uid !== w.uid) throw fail("not-found", "That question is gone.", "gone");
      if (!Q.OPEN.includes(q.status)) throw fail("failed-precondition", q.status === "answered" ? "That question was already answered." : "That question isn't open.", "notOpen");
      tx.update(qRef(id), { status: "withdrawn", expireAt: TS(now() + Q.CLEAR_KEEP_MS) });
      out = { ok: true };
    });
    return out;
  }
  async function moderate(w, data) {
    const id = data && data.questionId, action = data && data.action;
    if (!idOk(id)) throw bad("Which question?");
    if (!["approve", "hide", "toStanding", "merge"].includes(action)) throw bad("Unknown action.", "bad-input", { field: "action" });
    const { live } = await requireModerator(w);
    const at = now();
    if (action === "merge") {
      const targetId = data.targetId;
      if (!idOk(targetId)) throw bad("Pick the question to merge into.", "bad-input", { field: "targetId" });
      const [srcVotes, tgtVotes] = await Promise.all([qRef(id).collection("votes").get(), qRef(targetId).collection("votes").get()]);
      let res = null;
      await db.runTransaction(async (tx) => {
        const [src, tgt] = [asQ(await tx.get(qRef(id))), asQ(await tx.get(qRef(targetId)))];
        const c = Q.canMerge(src, tgt);
        if (!c.ok) throw fail("failed-precondition", c.message, c.reason);
        const m = Q.mergeVoters(srcVotes.docs.map((d) => d.id), tgtVotes.docs.map((d) => d.id), tgt.uid, src.uid);
        for (const u of m.gain) tx.set(qRef(targetId).collection("votes").doc(u), { at: TS(at), fromMerge: true });
        tx.update(qRef(targetId), { votes: m.total });
        tx.update(qRef(id), { status: "merged", mergedInto: targetId, mergedAt: TS(at), mergedBy: w.uid });
        res = { gained: m.gain.length, votes: m.total };
      });
      await log(w, "question:merge", { title: "Questions", details: { questionId: id, into: targetId, votes: res.votes } });
      return { ok: true, ...res };
    }
    let out = null;
    await db.runTransaction(async (tx) => {
      const q = asQ(await tx.get(qRef(id)));
      if (!q) throw fail("not-found", "That question is gone.", "gone");
      if (action === "approve") {
        if (q.status !== "held") throw refuse("already");
        const to = q.lane === "tonight" && live && q.streamId === live.id ? "tonight" : "standing";
        tx.update(qRef(id), { status: to, ...(to === "standing" ? { standingSince: TS(at) } : {}), approvedBy: w.uid });
        out = to;
      } else if (action === "hide") {
        if (!Q.OPEN.includes(q.status)) throw refuse("already");
        tx.update(qRef(id), { status: "hidden", hiddenBy: w.uid, hiddenAt: TS(at) });
        out = "hidden";
      } else {
        if (q.status !== "tonight") throw fail("failed-precondition", "Only Tonight questions move to Standing.", "notTonight");
        tx.update(qRef(id), { status: "standing", lane: "standing", standingSince: TS(at) });
        out = "standing";
      }
    });
    await log(w, `question:${action}`, { title: "Questions", details: { questionId: id, status: out } });
    return { ok: true, status: out };
  }

  // the vote count (the one member-writable path is the vote doc itself; the rules check who and when)
  const onQuestionVote = onDocumentWritten(`sites/${SITE_ID}/chatGames/main/questions/{qid}/votes/{uid}`, async (event) => {
    const before = event.data && event.data.before, after = event.data && event.data.after;
    const created = after && after.exists && !(before && before.exists), deleted = before && before.exists && !(after && after.exists);
    if (!created && !deleted) return;
    if (created && after.get("fromMerge") === true) return;   // Merge already counted it
    await countVote(event.params.qid, created ? 1 : -1);
  });
  async function countVote(qid, delta) {
    await db.runTransaction(async (tx) => {
      const s = await tx.get(qRef(qid));
      if (!s.exists) return;
      tx.update(qRef(qid), { votes: Math.max(0, (s.get("votes") || 0) + delta) });
    });
  }

  // daily: Standing questions unanswered for 30 days are archived
  async function archive() {
    const at = now();
    const snap = await qCol().where("status", "==", "standing").get();
    let n = 0;
    for (const d of snap.docs) if (Q.archiveDue(asQ(d), at)) { await d.ref.update({ status: "archived", archivedAt: TS(at) }); n++; }
    return { archived: n };
  }
  const questionArchive = onSchedule({ schedule: "15 5 * * *", timeZone: "America/Los_Angeles" }, async () => { await archive(); });

  const wrap = (fn) => async (request) => fn(await caller(request), request.data || {});
  return {
    functions: {
      questionAsk: onCall(wrap(ask)), questionWithdraw: onCall(wrap(withdraw)), questionModerate: onCall(wrap(moderate)),
      onQuestionVote, questionArchive,
    },
    ops: { ask, withdraw, moderate, countVote, archive, payAnswer, openQuestions },
    handler,
  };
};
