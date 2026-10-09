// Mod Machina phase 3, part 2: the duty backend (docs/specs/mod-machina.md section 17a: "The duty loop", "The Captain", "Duty records and duty Gears", "Data model", "Functions and rules").
// Built on the Control Room's core (`ctx` from lib/live/core.js: db, now, fail, the stream and control refs, publishLive, adminLog) and called by lib/live (index.js spreads these functions into
// the live module; controls.js calls onStart / closeOut; feeds.js calls tick). Nothing here is copied from elsewhere: Gears go through lib/crew/gears.js grantGears, badges through the Trophy Room
// grant(), seats through the planner's logic and the swap board's lockUntil, rates and the YouTube boost from the crew settings.
//
// DATA (all under sites/boomertanger/, function-written only):
//   streams/{id}/private/duty        the LIVE state, readable by crew (mods and admins) and the owner; control stays owner + A2+ because it holds the check-in word:
//        { streamId, state: "live"|"ended", startedAt, endedAt, afterShow, captainNow: { uid, handle, acting, owner?, since }|null, captainDeclined: [uid], onDuty: { uid: { handle, grade, since,
//          roles: [{ role, room }], away: { until, kind, at, roles }|null, nudged } }, prompts: { id: { kind, to, room, ... expiresAt, status } }, handoffs: [..], takeovers: { uid: n },
//          rooms: { room: { lead handle|null, deckhands n, covered } }, youtube: { landscapeId, verticalId } (the two PUBLIC chat video ids for the Deck's embeds; never the backstage id), needsConfirm, confirmedAt, captainAtStop, updatedAt }
//   crew/main/duties/{streamId}_{uid}  the durable, payable record, readable by that person, admins and the owner:
//        { streamId, uid, handle, grade, scheduled: { role, room }|null, segments: [{ role, room, in, out }], lines: { "captain" | "lead:room" | "deckhand:room": minutes }, minutes, lastPing, showed,
//          takeovers: [{ id, at }], addedMinutes, clockedInAt, endedAt, noShow, counted, led, gears, confirmedAt, confirmedBy }
// Times are milliseconds. Every callable re-checks the caller on the server; the Deck only shows buttons.
const { onCall } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const D = require("./dutyLogic");
const PL = require("../planner/logic");
const L = require("../live/logic");
const { paths, loadSettings, SITE_ID } = require("./settings");
const { lockUntilOf } = require("./lock");

const BADGE_REF = "duty";
const ID_SAFE = /^[A-Za-z0-9_-]{1,100}$/;

module.exports = function duty(ctx, { gears = null, grant = null } = {}) {
  const { db, FieldValue, Timestamp, fail, now } = ctx;
  const { P } = require("../live/core");
  const G = () => gears || (gears = require("./gears").makeGears({ db, now }));
  const GR = () => grant || (grant = require("../rewards/grant").makeGrant({ db }));
  const dutyPath = (sid) => P.duty(sid);
  const recPath = (sid, uid) => paths.duty(sid, uid);
  const ts = (n) => Timestamp.fromMillis(n);
  const ms = ctx.ms;
  let seq = 0;
  const newId = (prefix) => `${prefix}${now().toString(36)}${(seq++).toString(36)}`;

  // ---------- who and what ----------
  const isCrew = (w) => ctx.isCrewOnDuty(w);
  const crewCaller = async (request) => { const w = await ctx.crew.who(ctx.crew.requireAuth(request)); return w; };
  const needCrew = async (request) => {
    const w = await crewCaller(request);
    if (!isCrew(w)) throw fail("permission-denied", "Crew on duty only (Active or Check-in).", "notCrew");
    return w;
  };
  const idArg = (v, what = "streamId") => { if (typeof v !== "string" || !ID_SAFE.test(v)) throw fail("invalid-argument", `${what} is required.`, "args"); return v; };
  const person = async (uid) => ctx.crew.who(uid);
  async function ownerOf() {
    const uid = (await db.doc(`sites/${SITE_ID}`).get()).get("ownerUid") || null;
    if (!uid) return { uid: null, handle: null };
    const p = await db.doc(`sites/${SITE_ID}/profiles/${uid}`).get();
    return { uid, handle: p.exists ? p.get("handle") || null : null };
  }
  async function blockedOf(uid, at = now()) {
    const [r, lock] = await Promise.all([db.doc(paths.roster(uid)).get(), lockUntilOf(db, uid)]);
    return ms(r.exists ? r.get("leadBlockedUntil") : null) > at || lock > at;
  }
  /** The stream a duty call is about: it must be live. Before Start and after Stop there is nothing to clock into. */
  async function liveStreamFor(streamId) {
    const s = await ctx.loadStream(idArg(streamId));
    if (s.state === "live") return s;
    if (s.state === "ended") throw fail("failed-precondition", "That stream has ended.", "ended");
    throw fail("failed-precondition", "The stream hasn't started yet.", "notStarted");
  }
  const draftOf = async (sid) => ((await db.doc(P.draft(sid)).get()).data()) || {};
  const isAfterShow = (s) => !!(s.afterShowOf || s.type === "backstage");

  // ---------- state helpers ----------
  const blank = (sid, at, s) => ({ streamId: sid, state: "live", startedAt: at, endedAt: null, afterShow: !!(s && isAfterShow(s)), captainNow: null, captainDeclined: [], onDuty: {}, prompts: {}, handoffs: [], takeovers: {}, rooms: {}, needsConfirm: false, confirmedAt: null, captainAtStop: null });
  const loadState = async (sid) => ((await db.doc(dutyPath(sid)).get()).data()) || null;
  const roomsOf = (s) => (s && isAfterShow(s) ? ["site"] : L.allowedRooms(s));
  const sameRole = (a, b) => a.role === b.role && (a.room || null) === (b.room || null);
  const hasRole = (list, r) => (list || []).some((x) => sameRole(x, r));
  const isPrompt = (p, at) => p.status === "open" && p.expiresAt > at;

  /** Runs `fn(state, duties)` against private/duty and the named people's duty records in one transaction; whatever it leaves in them is written back. */
  async function txn(sid, uids, fn, { create = null } = {}) {
    return db.runTransaction(async (tx) => {
      const sref = db.doc(dutyPath(sid));
      const refs = [...new Set(uids)].map((u) => [u, db.doc(recPath(sid, u))]);
      const [ssnap, ...dsnaps] = await Promise.all([tx.get(sref), ...refs.map(([, r]) => tx.get(r))]);
      let state = ssnap.exists ? ssnap.data() : create;
      if (!state) throw fail("failed-precondition", "That stream has no duty yet.", "noDuty");
      state = JSON.parse(JSON.stringify(state));
      const duties = {};
      refs.forEach(([u], i) => { duties[u] = dsnaps[i].exists ? JSON.parse(JSON.stringify(dsnaps[i].data())) : null; });
      const out = await fn(state, duties);
      state.updatedAt = now();
      tx.set(sref, state);
      for (const [u, r] of refs) if (duties[u]) tx.set(r, duties[u]);
      return out;
    });
  }
  const freshDuty = (sid, uid, w, at) => ({ streamId: sid, uid, handle: w.handle || null, grade: w.grade || null, scheduled: null, segments: [], lines: {}, minutes: 0, lastPing: at, showed: false, takeovers: [], addedMinutes: 0, clockedInAt: at, endedAt: null, noShow: false, counted: false, led: false, gears: null, confirmedAt: null, confirmedBy: null });
  /** Moves a person's segments to a new set of roles: segments that stop are closed, new ones opened. */
  function applyRoles(d, roles, at) {
    for (const seg of d.segments) if (seg.out == null && !hasRole(roles, seg)) seg.out = at;
    for (const r of roles) if (!d.segments.some((seg) => seg.out == null && sameRole(seg, r))) d.segments.push({ role: r.role, room: r.room || null, in: at, out: null });
  }
  const closeAll = (d, at) => { for (const seg of d.segments) if (seg.out == null) seg.out = at; };
  const recompute = (state, rooms) => { state.rooms = D.coverage(state.onDuty, rooms); };
  /** Everyone's grade, clock-in and blocked flags, for choosing a Captain. */
  const peopleOf = (state, blocked) => Object.entries(state.onDuty).map(([uid, p]) => ({ uid, grade: p.grade || 0, since: p.since, away: !!p.away, blocked: !!blocked[uid], roles: p.roles, owner: false }));

  /**
   * Keeps the Captain seat filled (called inside a transaction). A seated Captain who has clocked in is Captain (set by dutyClockIn). Otherwise, when nobody is seated or the seated Captain is 15 minutes late,
   * the highest-grade crew on duty is offered "acting Captain"; every decline offers the next; when all decline the owner is Captain. `info`: { seatedCaptainUid, startedAt, owner, blocked }.
   */
  function reconcileCaptain(state, info, at) {
    const cur = state.captainNow;
    if (cur && !cur.owner) {
      const e = state.onDuty[cur.uid];
      if (!e || e.away || !hasRole(e.roles, { role: "captain", room: null })) state.captainNow = null;
    }
    if (state.captainNow) return;
    const open = Object.values(state.prompts).find((p) => ["actingCaptain", "captainHandoff"].includes(p.kind) && isPrompt(p, at));
    if (open) return;
    const people = peopleOf(state, info.blocked || {});
    if (!people.length) return;
    const seatedWaiting = info.seatedCaptainUid && !state.onDuty[info.seatedCaptainUid] && at - state.startedAt < D.CAPTAIN_WAIT_MS;
    if (seatedWaiting) return;
    const next = D.nextActingCaptain(people, state.captainDeclined);
    if (next) {
      const id = newId("c");
      state.prompts[id] = { id, kind: "actingCaptain", to: next, toHandle: state.onDuty[next].handle, createdAt: at, expiresAt: at + D.HANDOFF_MS, status: "open", text: "Nobody's at the helm. Be acting Captain tonight?" };
    } else if (info.owner && info.owner.uid) {
      state.captainNow = { uid: info.owner.uid, handle: info.owner.handle, acting: false, owner: true, since: at };
    }
  }
  const setCaptain = (state, uid, acting, at) => { state.captainNow = { uid, handle: state.onDuty[uid] ? state.onDuty[uid].handle : null, acting, since: at }; };
  const addRole = (entry, role) => { if (!hasRole(entry.roles, role)) entry.roles.push(role); };
  const dropRole = (entry, role) => { entry.roles = entry.roles.filter((r) => !sameRole(r, role)); };

  /** The facts reconcile needs that live outside the duty doc (one round of reads before the transaction). */
  async function gather(sid, state, s, extraUids = []) {
    const draft = await draftOf(sid);
    const uids = [...new Set([...Object.keys(state ? state.onDuty : {}), ...extraUids])];
    const blocked = {};
    await Promise.all(uids.map(async (u) => { blocked[u] = await blockedOf(u); }));
    return { seatedCaptainUid: !s || isAfterShow(s) ? null : (draft.crew && draft.crew.captain && draft.crew.captain.uid) || null, owner: await ownerOf(), blocked, draft };
  }
  const publish = async () => { try { await ctx.publishLive(); } catch (err) { console.error("duty: publishLive failed", String((err && err.message) || err).slice(0, 140)); } };

  // ---------- onStart / closeOut (called by startStream and Stop / the 12-hour auto-end) ----------
  /** Start: the live duty state exists from the first second (the Deck reads one document). */
  async function onStart(sid, at, s) {
    const ref = db.doc(dutyPath(sid));
    if ((await ref.get()).exists) return;
    const w = ((await db.doc(P.watch(sid)).get()).data() || {}).youtube || {};
    await ref.set({ ...blank(sid, at, s), youtube: { landscapeId: w.landscapeId || null, verticalId: w.verticalId || null }, updatedAt: at });
  }

  /** The Mod Deck embeds the YouTube chats, and crew can't read private/watch. This copies the two PUBLIC video ids (landscape and vertical, never the backstage one) into private/duty.youtube,
   * which crew can read. Called by the Control Room's linkYoutube whenever it knows the ids. Does nothing when there is no live duty state (the next call, or onStart, fills it in). */
  async function copyVideoIds(sid, ids) {
    const ref = db.doc(dutyPath(sid));
    const youtube = { landscapeId: (ids && ids.landscapeId) || null, verticalId: (ids && ids.verticalId) || null };
    if (!(await ref.get()).exists) return false;
    await ref.update({ youtube });
    return true;
  }

  /** Stop and the 12-hour auto-end: everyone clocked out, seated crew who never clocked in marked no-show, a "confirm" prompt for the Captain and the owner. Idempotent. */
  async function closeOut(sid, at = now()) {
    const s = await ctx.loadStream(sid);
    const draft = await draftOf(sid);
    const owner = await ownerOf();
    const seated = isAfterShow(s) ? [] : await ctx.seatedCrew(sid);
    const snap = await db.collection(paths.dutiesCol()).where("streamId", "==", sid).get();
    const have = new Map(snap.docs.map((d) => [d.get("uid"), d]));
    for (const d of snap.docs) {
      const x = d.data();
      if (x.endedAt != null) continue;
      const seg = (x.segments || []).map((g) => (g.out == null ? { ...g, out: at } : g));
      await d.ref.update({ segments: seg, endedAt: at });
    }
    for (const st of seated) {   // a seat nobody clocked into: a duty record with no segments is the no-show
      if (have.has(st.uid)) continue;
      const w = await person(st.uid).catch(() => ({ handle: null, grade: null }));
      const role = st.room == null ? "captain" : (draft.crew && draft.crew.chats && draft.crew.chats[st.room] && draft.crew.chats[st.room].lead && draft.crew.chats[st.room].lead.uid === st.uid ? "lead" : "deckhand");
      await db.doc(recPath(sid, st.uid)).set({ ...freshDuty(sid, st.uid, w, at), scheduled: { role, room: st.room }, lastPing: null, clockedInAt: null, endedAt: at, noShow: true });
    }
    // seated people with a duty record keep their scheduled seat (set at clock in); anyone seated who clocked in is not a no-show
    await txn(sid, [], (state) => {
      if (state.state === "ended") return;
      state.captainAtStop = state.captainNow ? state.captainNow.uid : null;
      state.onDuty = {}; state.captainNow = null; state.state = "ended"; state.endedAt = at; state.needsConfirm = true; state.rooms = {};
      const to = state.captainAtStop || owner.uid;
      state.prompts = { confirm: { id: "confirm", kind: "confirm", to, createdAt: at, expiresAt: at + 7 * 24 * 3600000, status: "open", text: "Confirm tonight's crew" } };
    }, { create: blank(sid, at, s) });
    await publish();
  }

  // ---------- dutyClockIn ----------
  const dutyClockIn = onCall(async (request) => {
    const w = await crewCaller(request);
    if (w.isOwner) throw fail("permission-denied", "The owner hosts the stream, so there is no clock in.", "ownerHosts");
    if (!isCrew(w)) throw fail("permission-denied", "Crew on duty only (Active or Check-in).", "notCrew");
    const { streamId, room: askedRoom, role: askedRole } = request.data || {};
    const s = await liveStreamFor(streamId);
    const sid = s.id, at = now();
    const rooms = roomsOf(s);
    const draft = await draftOf(sid);
    const held = isAfterShow(s) ? [] : PL.seatsHeldBy(draft.crew, w.uid).filter((h) => h.role === "captain" || rooms.includes(h.room));
    let roles, scheduled = null;
    if (held.length) {
      roles = held.map((h) => ({ role: h.role, room: h.role === "captain" ? null : h.room }));
      scheduled = D.primaryRole(roles);
    } else {
      const role = askedRole == null ? "deckhand" : askedRole;
      if (!["deckhand", "lead"].includes(role)) throw fail("invalid-argument", "Drop in as a Deckhand, or as Room Lead where a room has none.", "badRole");
      const room = typeof askedRoom === "string" ? askedRoom : rooms.length === 1 ? rooms[0] : null;
      if (!room || !rooms.includes(room)) throw fail("invalid-argument", "Pick a room that is streaming.", "badRoom", { rooms });
      if (role === "lead") {
        if (isAfterShow(s)) throw fail("failed-precondition", "The after-show has no seats; drop in as a Deckhand.", "afterShow");
        const e = PL.seatEligibility(w.person || { isAdmin: w.isAdmin, isMod: w.isMod, grade: w.grade, rosterStatus: w.roster ? w.roster.status : null, leadBlockedUntilMs: ms(w.roster && w.roster.leadBlockedUntil) }, { room, role: "lead" }, at);
        if (!e.ok) throw fail("permission-denied", { gradeTooLow: "Room Lead needs Watcher or above.", leadBlocked: "Lead and Captain seats are paused for you for now.", notActive: "Your crew status isn't Active or Check-in." }[e.reason] || "You can't take that seat.", e.reason);
      }
      roles = [{ role, room }];
    }
    if (roles.some((r) => r.role !== "deckhand")) {
      const lock = await lockUntilOf(db, w.uid);
      if (lock > at) throw fail("permission-denied", D.lockMessage(lock), "locked", { until: lock });
      if (ms(w.roster && w.roster.leadBlockedUntil) > at) throw fail("permission-denied", "Lead and Captain seats are paused for you for now.", "leadBlocked");
    }
    const state0 = (await loadState(sid)) || blank(sid, at, s);
    const info = await gather(sid, state0, s, [w.uid]);
    const out = await txn(sid, [w.uid], (state, duties) => {
      if (state.state === "ended") throw fail("failed-precondition", "That stream has ended.", "ended");
      if (state.onDuty[w.uid]) return { already: true, roles: state.onDuty[w.uid].roles };
      let myRoles = roles;
      if (myRoles.some((r) => r.role === "lead" && !held.length)) {                    // a drop-in Lead needs a room with none
        const lead = myRoles.find((r) => r.role === "lead");
        const taken = (draft.crew && draft.crew.chats && draft.crew.chats[lead.room] && draft.crew.chats[lead.room].lead) || Object.values(state.onDuty).some((p) => (p.roles || []).some((r) => r.role === "lead" && r.room === lead.room));
        if (taken) throw fail("failed-precondition", "That room already has a Lead.", "leadTaken");
      }
      const entry = { handle: w.handle || null, grade: w.grade || 0, since: at, roles: myRoles.map((r) => ({ ...r })), away: null, nudged: false };
      let thanks = null;
      if (myRoles.some((r) => r.role === "captain")) {                                 // a seated Captain takes over from an acting one at once
        const prev = state.captainNow;
        if (prev && prev.acting && prev.uid !== w.uid && state.onDuty[prev.uid]) {
          dropRole(state.onDuty[prev.uid], { role: "captain", room: null });
          const id = newId("t");
          state.prompts[id] = { id, kind: "thanks", to: prev.uid, createdAt: at, expiresAt: at + 10 * D.MIN, status: "open", text: "Thanks for holding the helm" };
          thanks = prev.uid;
        }
        state.onDuty[w.uid] = entry;
        state.captainNow = { uid: w.uid, handle: w.handle || null, acting: false, since: at };
      } else state.onDuty[w.uid] = entry;
      const d = duties[w.uid] || freshDuty(sid, w.uid, w, at);
      d.handle = w.handle || d.handle; d.grade = w.grade || d.grade; d.lastPing = at; d.clockedInAt = d.clockedInAt || at; d.endedAt = null; d.noShow = false;
      if (scheduled && !d.scheduled) d.scheduled = scheduled;
      if (scheduled && at - ms(s.actualStart) <= D.SHOWED_WITHIN_MS) d.showed = true;           // +5 "showed up" is recorded now and paid at confirm
      applyRoles(d, entry.roles, at);
      duties[w.uid] = d;
      recompute(state, rooms);
      reconcileCaptain(state, info, at);
      return { roles: entry.roles, captainNow: state.captainNow, showed: d.showed, thanks };
    }, { create: state0 });
    await publish();
    return { ok: true, ...out };
  });

  // ---------- dutyPing ----------
  const dutyPing = onCall(async (request) => {
    const w = await needCrew(request);
    const sid = idArg((request.data || {}).streamId);
    const state = await loadState(sid);
    if (!state) throw fail("failed-precondition", "You're not clocked in.", "notOnDuty");
    if (state.state === "ended") throw fail("failed-precondition", "That stream has ended.", "ended");
    const e = state.onDuty[w.uid];
    if (!e) throw fail("failed-precondition", "You're not clocked in.", "notOnDuty");
    const at = now(), ref = db.doc(recPath(sid, w.uid));
    const r = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw fail("failed-precondition", "You're not clocked in.", "notOnDuty");
      const d = snap.data();
      const c = D.creditFor({ lastPing: d.lastPing, away: !!e.away }, at);
      if (c.ignored) return { counted: 0, minutes: d.minutes, ignored: true };
      const lines = { ...(d.lines || {}) };
      if (c.credit > 0) { const p = D.primaryRole(e.roles); if (p) { const k = D.lineKey(p.role, p.room); lines[k] = (lines[k] || 0) + c.credit; } }
      tx.update(ref, { lines, minutes: D.totalMinutes(lines), lastPing: at });
      return { counted: c.credit, minutes: D.totalMinutes(lines), ignored: false };
    });
    if (e.nudged && !r.ignored) { try { await txn(sid, [], (st) => { if (st.onDuty[w.uid]) st.onDuty[w.uid].nudged = false; }); } catch (err) { /* a missed flag reset only repeats a nudge */ } }
    return { ok: true, ...r };
  });

  // ---------- handoffs: step away, back, take the lead ----------
  /** The Room Lead (or Captain) leaves for a break or for the night: their lead rooms get a handoff prompt for the room's Deckhands, the Captain role is offered to a Room Lead. */
  function startHandoffs(state, uid, entry, roles, at, s) {
    for (const r of roles) {
      if (r.role === "lead") {
        const to = Object.entries(state.onDuty).filter(([u, p]) => u !== uid && !p.away && (p.roles || []).some((x) => x.role === "deckhand" && x.room === r.room)).map(([u]) => u);
        const id = newId("h");
        if (to.length) state.prompts[id] = { id, kind: "handoff", room: r.room, from: uid, fromHandle: entry.handle, to, createdAt: at, expiresAt: at + D.HANDOFF_MS, status: "open", text: "Take the lead?" };
        else { const nid = newId("n"); state.prompts[nid] = { id: nid, kind: "needed", room: r.room, to: state.captainNow ? state.captainNow.uid : null, createdAt: at, expiresAt: at + 30 * D.MIN, status: "open", text: `${r.room} needs a lead` }; }
      } else if (r.role === "captain") {
        const next = D.nextCaptainFromLeads(peopleOf(state, {}), uid, state.captainDeclined);
        if (next) { const id = newId("k"); state.prompts[id] = { id, kind: "captainHandoff", from: uid, fromHandle: entry.handle, to: next, toHandle: state.onDuty[next].handle, createdAt: at, expiresAt: at + D.HANDOFF_MS, status: "open", text: "Take the Captain's seat?" }; }
      }
    }
  }
  const dutyStepAway = onCall(async (request) => {
    const w = await needCrew(request);
    const { streamId, kind } = request.data || {};
    const sid = idArg(streamId);
    if (!["5", "15", "30", "done"].includes(String(kind))) throw fail("invalid-argument", "Pick 5, 15 or 30 minutes, or done for tonight.", "args");
    const s = await liveStreamFor(sid), at = now(), rooms = roomsOf(s);
    const state0 = (await loadState(sid)) || null;
    if (!state0) throw fail("failed-precondition", "You're not clocked in.", "notOnDuty");
    const info = await gather(sid, state0, s, [w.uid]);
    const out = await txn(sid, [w.uid], (state, duties) => {
      const e = state.onDuty[w.uid], d = duties[w.uid];
      if (!e || !d) throw fail("failed-precondition", "You're not clocked in.", "notOnDuty");
      if (e.away) throw fail("failed-precondition", "You're already stepped away.", "alreadyAway");
      const roles = e.roles.map((r) => ({ ...r }));
      startHandoffs(state, w.uid, e, roles, at, s);
      if (state.captainNow && state.captainNow.uid === w.uid && roles.some((r) => r.role === "captain")) state.captainNow = null;
      if (String(kind) === "done") {                                                    // clocked out for the night: the handoff above runs as it would for a break
        closeAll(d, at); delete state.onDuty[w.uid];
      } else e.away = { until: at + D.BREAK_MIN[String(kind)] * D.MIN, kind: String(kind), at, roles };
      recompute(state, rooms);
      reconcileCaptain(state, info, at);
      return { kind: String(kind), until: e.away ? e.away.until : null };
    });
    await publish();
    return { ok: true, ...out };
  });

  /** Back from a short break: the roles they lent come back and the acting lead (or Captain) goes back to Deckhand. */
  function restore(state, duties, uid, at) {
    const e = state.onDuty[uid];
    if (!e || !e.away) return false;
    const back = [];
    for (const r of e.away.roles) {
      const lent = state.handoffs.find((h) => h.from === uid && !h.undone && h.kind === (r.role === "captain" ? "captain" : "lead") && (r.role === "captain" || h.room === r.room));
      if (lent) {
        lent.undone = true;
        const to = state.onDuty[lent.to];
        if (to) {
          if (r.role === "lead") { dropRole(to, { role: "lead", room: r.room }); addRole(to, { role: "deckhand", room: r.room }); }
          else dropRole(to, { role: "captain", room: null });
          if (duties[lent.to]) applyRoles(duties[lent.to], to.roles, at);
        }
        if (r.role === "captain" && state.captainNow && state.captainNow.uid === lent.to) state.captainNow = null;
      }
      back.push({ role: r.role, room: r.room || null });
    }
    e.roles = back.length ? back.map((r) => ({ ...r })) : e.roles;
    e.away = null; e.nudged = false;
    if (duties[uid]) { duties[uid].lastPing = at; applyRoles(duties[uid], e.roles, at); }
    if (e.roles.some((r) => r.role === "captain")) state.captainNow = { uid, handle: e.handle, acting: false, since: at };
    return true;
  }
  const dutyBack = onCall(async (request) => {
    const w = await needCrew(request);
    const sid = idArg((request.data || {}).streamId);
    const s = await liveStreamFor(sid), at = now(), rooms = roomsOf(s);
    const state0 = await loadState(sid);
    if (!state0) throw fail("failed-precondition", "You're not clocked in.", "notOnDuty");
    const info = await gather(sid, state0, s, [w.uid]);
    const out = await txn(sid, [w.uid, ...Object.values(state0.handoffs).map((h) => h.to).filter(Boolean)], (state, duties) => {
      const e = state.onDuty[w.uid];
      if (!e) throw fail("failed-precondition", "You're not clocked in.", "notOnDuty");
      if (!e.away) return { already: true, roles: e.roles };
      for (const [u, d] of Object.entries(duties)) if (!d) delete duties[u];
      restore(state, duties, w.uid, at);
      recompute(state, rooms);
      reconcileCaptain(state, info, at);
      return { roles: state.onDuty[w.uid].roles };
    });
    await publish();
    return { ok: true, ...out };
  });

  /** Accepts a prompt addressed to the caller: a handoff ("Take the lead?", first accept wins), the Captain's seat, acting Captain, or a reassignment. */
  const dutyTakeLead = onCall(async (request) => {
    const w = await needCrew(request);
    const { streamId, promptId } = request.data || {};
    const sid = idArg(streamId);
    const s = await liveStreamFor(sid), at = now(), rooms = roomsOf(s);
    const state0 = await loadState(sid);
    const p0 = state0 && state0.prompts ? state0.prompts[promptId] : null;
    if (!p0) throw fail("not-found", "That prompt is gone.", "noPrompt");
    const info = await gather(sid, state0, s, [w.uid]);
    const out = await txn(sid, [w.uid], (state, duties) => {
      const p = state.prompts[promptId];
      if (!p) throw fail("not-found", "That prompt is gone.", "noPrompt");
      const mine = p.to === w.uid || (Array.isArray(p.to) && p.to.includes(w.uid));
      const e = state.onDuty[w.uid], d = duties[w.uid];
      if (!mine || !e || !d) throw fail("permission-denied", "That prompt isn't for you.", "notYours");
      if (p.status === "taken") throw fail("aborted", "Someone beat you to it.", "beaten");
      if (p.status !== "open" || p.expiresAt <= at) throw fail("failed-precondition", "That prompt has run out.", "expired");
      if (e.away) throw fail("failed-precondition", "Come back from your break first.", "away");
      if (p.kind === "handoff") {
        p.status = "taken"; p.takenBy = w.uid;
        const from = state.onDuty[p.from];
        dropRole(e, { role: "deckhand", room: p.room }); addRole(e, { role: "lead", room: p.room });
        const hid = newId("o");
        state.handoffs.push({ id: hid, kind: "lead", room: p.room, from: p.from, to: w.uid, at });
        state.takeovers[w.uid] = (state.takeovers[w.uid] || 0) + 1;
        d.takeovers = [...(d.takeovers || []), { id: hid, at }];
        if (from && from.away) from.away.roles = from.away.roles.map((r) => (r.role === "lead" && r.room === p.room ? { ...r, lent: w.uid } : r));
        applyRoles(d, e.roles, at);
        recompute(state, rooms);
        return { kind: "handoff", role: "lead", room: p.room, takeover: state.takeovers[w.uid] <= D.TAKEOVER_CAP };
      }
      if (p.kind === "captainHandoff" || p.kind === "actingCaptain") {
        p.status = "taken"; p.takenBy = w.uid;
        const prev = state.captainNow;
        if (prev && prev.uid !== w.uid && state.onDuty[prev.uid]) dropRole(state.onDuty[prev.uid], { role: "captain", room: null });
        addRole(e, { role: "captain", room: null });
        setCaptain(state, w.uid, true, at);
        if (p.kind === "captainHandoff") {
          const from = state.onDuty[p.from];
          state.handoffs.push({ id: newId("o"), kind: "captain", room: null, from: p.from, to: w.uid, at });
          if (from && from.away) from.away.roles = from.away.roles.map((r) => (r.role === "captain" ? { ...r, lent: w.uid } : r));
        }
        applyRoles(d, e.roles, at);
        recompute(state, rooms);
        return { kind: p.kind, role: "captain" };
      }
      if (p.kind === "reassign") {
        p.status = "taken"; p.takenBy = w.uid;
        const target = { role: p.role, room: p.role === "captain" ? null : p.room };
        if (target.role === "captain") {
          const prev = state.captainNow;
          if (prev && prev.uid !== w.uid && state.onDuty[prev.uid]) dropRole(state.onDuty[prev.uid], { role: "captain", room: null });
          addRole(e, target); setCaptain(state, w.uid, true, at);
        } else {
          e.roles = e.roles.filter((r) => r.role === "captain");
          e.roles.push(target);
        }
        applyRoles(d, e.roles, at);
        recompute(state, rooms);
        return { kind: "reassign", role: target.role, room: target.room };
      }
      throw fail("failed-precondition", "That prompt can't be accepted.", "badPrompt");
    });
    await publish();
    return { ok: true, ...out };
  });

  /** "Not now": a handoff prompt just drops the caller from the candidates; an acting-Captain or Captain offer goes to the next person (and to the owner when everyone says no). */
  const dutyDecline = onCall(async (request) => {
    const w = await needCrew(request);
    const { streamId, promptId } = request.data || {};
    const sid = idArg(streamId);
    const s = await liveStreamFor(sid), at = now();
    const state0 = await loadState(sid);
    if (!state0 || !state0.prompts[promptId]) throw fail("not-found", "That prompt is gone.", "noPrompt");
    const info = await gather(sid, state0, s, [w.uid]);
    const out = await txn(sid, [], (state) => {
      const p = state.prompts[promptId];
      if (!p) throw fail("not-found", "That prompt is gone.", "noPrompt");
      const mine = p.to === w.uid || (Array.isArray(p.to) && p.to.includes(w.uid));
      if (!mine) throw fail("permission-denied", "That prompt isn't for you.", "notYours");
      if (p.status !== "open") return { already: true };
      if (p.kind === "handoff") { p.to = p.to.filter((u) => u !== w.uid); if (!p.to.length) { p.status = "expired"; } return { kind: "handoff" }; }
      p.status = "declined";
      if (p.kind === "actingCaptain" || p.kind === "captainHandoff") {
        if (!state.captainDeclined.includes(w.uid)) state.captainDeclined.push(w.uid);
        if (p.kind === "captainHandoff") { const next = D.nextCaptainFromLeads(peopleOf(state, info.blocked), p.from, state.captainDeclined); if (next) { const id = newId("k"); state.prompts[id] = { ...p, id, to: next, toHandle: state.onDuty[next].handle, createdAt: at, expiresAt: at + D.HANDOFF_MS, status: "open" }; return { kind: p.kind, next }; } }
        reconcileCaptain(state, info, at);
      }
      return { kind: p.kind };
    });
    await publish();
    return { ok: true, ...out };
  });

  // ---------- captainSet and dutyReassign ----------
  const captainSet = onCall(async (request) => {
    const w = await crewCaller(request);
    if (!w.isOwner) throw fail("permission-denied", "Only the owner can pick the Captain.", "notOwner");
    const { streamId, uid } = request.data || {};
    const sid = idArg(streamId);
    const s = await liveStreamFor(sid), at = now(), rooms = roomsOf(s);
    const target = idArg(uid, "uid");
    const draft = await draftOf(sid);
    const seated = draft.crew && draft.crew.captain && draft.crew.captain.uid;
    const out = await txn(sid, [target], (state, duties) => {
      const e = state.onDuty[target], d = duties[target];
      if (!e || !d) throw fail("failed-precondition", "They aren't on duty.", "notOnDuty");
      if ((e.grade || 0) < 2) throw fail("failed-precondition", "The Captain is Watcher or above.", "gradeTooLow");
      const prev = state.captainNow;
      if (prev && prev.uid !== target && state.onDuty[prev.uid]) dropRole(state.onDuty[prev.uid], { role: "captain", room: null });
      addRole(e, { role: "captain", room: null });
      e.away = null;
      setCaptain(state, target, seated !== target, at);
      state.captainDeclined = [];
      for (const p of Object.values(state.prompts)) if (["actingCaptain", "captainHandoff"].includes(p.kind) && p.status === "open") p.status = "cancelled";
      applyRoles(d, e.roles, at);
      recompute(state, rooms);
      return { captainNow: state.captainNow, previous: prev ? prev.uid : null };
    });
    await logCrew(w, "captainSet", sid, s.title, { uid: target, previous: out.previous });
    await publish();
    return { ok: true, captainNow: out.captainNow };
  });

  const dutyReassign = onCall(async (request) => {
    const w = await crewCaller(request);
    const { streamId, uid, room, role } = request.data || {};
    const sid = idArg(streamId), target = idArg(uid, "uid");
    if (!["deckhand", "lead", "captain", "free"].includes(role)) throw fail("invalid-argument", "Pick deckhand, lead, captain or free.", "args");
    const s = await liveStreamFor(sid), at = now(), rooms = roomsOf(s);
    const state0 = await loadState(sid);
    if (!state0) throw fail("failed-precondition", "Nobody is on duty.", "notOnDuty");
    if (!(w.isOwner || (state0.captainNow && state0.captainNow.uid === w.uid))) throw fail("permission-denied", "Only the Captain or the owner can move people.", "notCaptain");
    if (role !== "captain" && !rooms.includes(room)) throw fail("invalid-argument", "Pick a room that is streaming.", "badRoom", { rooms });
    const tw = await person(target);
    const out = await txn(sid, [target], (state, duties) => {
      const e = state.onDuty[target], d = duties[target];
      if (!e || !d) throw fail("failed-precondition", "They aren't on duty.", "notOnDuty");
      if (role === "free") {                                                          // free a seat: a Lead steps down to Deckhand, a Deckhand is clocked out
        const mine = e.roles.find((r) => r.room === room && r.role !== "captain");
        if (!mine) throw fail("failed-precondition", "They don't hold a seat in that room.", "noSeat");
        if (mine.role === "lead") { dropRole(e, mine); addRole(e, { role: "deckhand", room }); applyRoles(d, e.roles, at); }
        else { dropRole(e, mine); if (!e.roles.length) { closeAll(d, at); delete state.onDuty[target]; } else applyRoles(d, e.roles, at); }
        recompute(state, rooms);
        return { freed: true };
      }
      const person0 = { isAdmin: tw.isAdmin, isMod: tw.isMod, grade: tw.grade, rosterStatus: tw.roster ? tw.roster.status : null, leadBlockedUntilMs: ms(tw.roster && tw.roster.leadBlockedUntil) };
      const el = PL.seatEligibility(person0, { room: role === "captain" ? "captain" : room, role }, at);
      if (!el.ok) throw fail("failed-precondition", "That's beyond their grade.", el.reason);
      if (el.needsOwnerOk && !w.isOwner) throw fail("permission-denied", "A Watcher as Captain needs the owner.", "needsOwner");
      if (role === "deckhand") {                                                       // a Deckhand move is immediate
        e.roles = e.roles.filter((r) => r.role === "captain");
        e.roles.push({ role: "deckhand", room });
        applyRoles(d, e.roles, at);
        recompute(state, rooms);
        return { moved: true };
      }
      if (role === "lead" && Object.values(state.onDuty).some((p) => p !== e && !p.away && (p.roles || []).some((r) => r.role === "lead" && r.room === room))) throw fail("failed-precondition", "That room already has a Lead.", "leadTaken");
      const id = newId("r");                                                           // Lead and Captain need their accept
      state.prompts[id] = { id, kind: "reassign", to: target, toHandle: e.handle, role, room: role === "captain" ? null : room, by: w.uid, createdAt: at, expiresAt: at + D.HANDOFF_MS, status: "open", text: role === "captain" ? "Be Captain?" : `Take the lead in ${room}?` };
      return { prompt: id };
    });
    await logCrew(w, "dutyReassign", sid, s.title, { uid: target, role, room: room || null, ...out });
    await publish();
    return { ok: true, ...out };
  });

  // ---------- the minute-by-minute work: liveTick calls this for the live stream ----------
  /**
   * Expires prompts and runs the next step (a handoff nobody takes goes to the Captain, an acting-Captain offer nobody answers goes to the next person), ends breaks that ran 10 minutes over,
   * offers acting Captain when the seated one is 15 minutes late, and nudges the Captain about a Lead or Captain who has gone quiet for 20 minutes. Never touches a mod beyond the break rule.
   * Does NOTHING (no read beyond the one state document) when nobody is on duty and nothing is pending. Returns what changed.
   */
  async function tick(stream, at = now()) {
    const sid = stream.id;
    const state0 = await loadState(sid);
    if (!state0 || state0.state !== "live") return { idle: true };
    const busy = Object.keys(state0.onDuty).length || Object.keys(state0.prompts).length;
    if (!busy) return { idle: true };
    const rooms = roomsOf(stream);
    const info = await gather(sid, state0, stream);
    const quietBase = {};
    const recs = await db.collection(paths.dutiesCol()).where("streamId", "==", sid).get();
    for (const r of recs.docs) quietBase[r.get("uid")] = ms(r.get("lastPing")) || 0;
    const out = { expired: 0, ended: 0, nudged: 0 };
    await txn(sid, Object.keys(state0.onDuty), (state, duties) => {
      for (const p of Object.values(state.prompts)) {
        if (p.status === "open" && p.expiresAt <= at) {
          p.status = "expired"; out.expired++;
          if (p.kind === "handoff") {                                                // nobody took the lead: the Captain is nudged and the room shows needed
            const nid = newId("n");
            state.prompts[nid] = { id: nid, kind: "needed", room: p.room, to: state.captainNow ? state.captainNow.uid : info.owner.uid, createdAt: at, expiresAt: at + 30 * D.MIN, status: "open", text: `${p.room} needs a lead` };
          } else if (p.kind === "actingCaptain" || p.kind === "captainHandoff") {
            if (typeof p.to === "string" && !state.captainDeclined.includes(p.to)) state.captainDeclined.push(p.to);
            if (p.kind === "captainHandoff") { const next = D.nextCaptainFromLeads(peopleOf(state, info.blocked), p.from, state.captainDeclined); if (next) { const id = newId("k"); state.prompts[id] = { ...p, id, to: next, toHandle: state.onDuty[next].handle, createdAt: at, expiresAt: at + D.HANDOFF_MS, status: "open" }; } }
          }
        } else if (p.status !== "open" && at - (p.createdAt || 0) > 30 * D.MIN && p.kind !== "confirm") delete state.prompts[p.id];
      }
      for (const [uid, e] of Object.entries(state.onDuty)) {
        if (e.away && at >= e.away.until + D.OVERSTAY_MS) {                          // a break that ran 10 minutes over just ends: they are back as a Deckhand
          const room = (e.away.roles.find((r) => r.room) || {}).room || rooms[0];
          const kept = e.away.roles.filter((r) => r.lent);
          e.roles = [{ role: "deckhand", room }];
          void kept;
          e.away = null;
          if (duties[uid]) { duties[uid].lastPing = at; applyRoles(duties[uid], e.roles, at); }
          out.ended++;
        }
      }
      for (const [uid, e] of Object.entries(state.onDuty)) {                         // quiet leads: a gentle nudge, nothing taken away
        const leads = !e.away && (e.roles || []).some((r) => r.role !== "deckhand");
        const quiet = leads && at - (quietBase[uid] || e.since) >= D.QUIET_MS;
        if (quiet && !e.nudged) {
          e.nudged = true;
          const isCap = state.captainNow && state.captainNow.uid === uid;
          const to = isCap || !state.captainNow ? info.owner.uid : state.captainNow.uid;
          const id = newId("q");
          state.prompts[id] = { id, kind: "quiet", to, about: uid, aboutHandle: e.handle, room: (D.primaryRole(e.roles) || {}).room || null, createdAt: at, expiresAt: at + 30 * D.MIN, status: "open", text: `${e.handle ? `@${e.handle}` : "A crew member"} has been quiet for a while` };
          out.nudged++;
        }
      }
      recompute(state, rooms);
      reconcileCaptain(state, info, at);
    });
    return out;
  }

  // ---------- dutyConfirmNight and the payout ----------
  async function logCrew(w, action, sid, title, details) {
    await db.collection("adminLog").add(await ctx.adminLogEntry(db, { feature: "crew", action, itemPath: sid ? P.stream(sid) : paths.settings(), itemTitle: title || "Crew", actorUid: w ? w.uid : null, actorName: w ? w.name : "Automatic", details }));
  }
  const streamMinutes = (s) => Math.max(1, Math.round((ms(s.actualEnd) - ms(s.actualStart)) / D.MIN));

  /** Pays one night: per person, per role line, keyed so a retry never pays twice; marks duties counted and led; grants the ladder badges. Idempotent. */
  async function payNight(sid, { by = null, auto = false } = {}) {
    const s = await ctx.loadStream(sid);
    const settings = await loadSettings(db);
    const v = settings.gearsValues, capMin = (v.dutyHoursCapPerStream || 6) * 60;
    const caps = (s.crew && s.crew.caps) || (s.caps) || {};
    const snap = await db.collection(paths.dutiesCol()).where("streamId", "==", sid).get();
    const smin = streamMinutes(s), paid = [];
    for (const doc of snap.docs) {
      const x = doc.data();
      if (x.confirmedAt) continue;
      const lines = D.capLines(x.lines || {}, capMin);
      const g = G();
      let total = 0;
      const lineGears = D.gearLines(lines, v, caps, settings);
      for (const l of lineGears) { const r = await g.grantGears(x.uid, "duty", `${sid}:${x.uid}:${l.key}`, l.gears, { key: `duty:${sid}:${x.uid}:${l.key}`, role: l.role, room: l.room, minutes: l.minutes }); if (r.granted) total += l.gears; }
      let showed = 0;
      if (x.showed && v.showedUp > 0) { const r = await g.grantGears(x.uid, "showed", sid, v.showedUp); if (r.granted) showed = v.showedUp; }
      let took = 0;
      for (const t of (x.takeovers || []).slice(0, D.TAKEOVER_CAP)) { if (v.tookOver > 0) { const r = await g.grantGears(x.uid, "takeover", `${sid}:${t.id}`, v.tookOver, { key: `takeover:${sid}:${t.id}:${x.uid}` }); if (r.granted) took += v.tookOver; } }
      const outcome = D.dutyOutcome(lines, smin);
      const stats = await db.runTransaction(async (tx) => {
        const [dr, rr] = await Promise.all([tx.get(doc.ref), tx.get(db.doc(paths.roster(x.uid)))]);
        if (dr.get("confirmedAt")) return null;
        tx.update(doc.ref, { lines, minutes: outcome.total, counted: outcome.counted, led: outcome.led, gears: { duty: total, showed, takeover: took, total: total + showed + took, lines: lineGears.map((l) => ({ key: l.key, gears: l.gears })) }, confirmedAt: now(), confirmedBy: by ? by.uid : "auto" });
        if (!rr.exists) return { duties: 0, ytRoomsLed: 0 };
        const st = { ...(rr.get("stats") || {}) };
        if (outcome.counted) {
          st.duties = (st.duties || 0) + 1;
          if (outcome.asCaptain) st.asCaptain = (st.asCaptain || 0) + 1;
          else if (outcome.asLead) st.asRoomLead = (st.asRoomLead || 0) + 1;
          st.ytRoomsLed = (st.ytRoomsLed || 0) + outcome.ytRoomsLed;
          tx.update(rr.ref, { stats: st, monthDuties: (rr.get("monthDuties") || 0) + 1 });
        }
        return { duties: st.duties || 0, ytRoomsLed: st.ytRoomsLed || 0, counted: outcome.counted };
      });
      if (stats && stats.counted) {
        for (const id of [...D.laddered(D.DUTY_BADGES, stats.duties), ...D.laddered(D.PIONEER_BADGES, stats.ytRoomsLed)]) {
          try { await GR().grantBadge(x.uid, id, { feature: "crew", ref: `${BADGE_REF}:${id}` }); } catch (err) { console.error(`duty: badge ${id} failed`, String((err && err.message) || err).slice(0, 120)); }
        }
      }
      paid.push({ uid: x.uid, handle: x.handle, gears: total + showed + took, counted: !!(stats && stats.counted) });
    }
    await txn(sid, [], (state) => { state.needsConfirm = false; state.confirmedAt = now(); delete state.prompts.confirm; }, { create: blank(sid, now(), s) });
    return { paid, auto };
  }

  const dutyConfirmNight = onCall(async (request) => {
    const w = await crewCaller(request);
    const { streamId, added } = request.data || {};
    const sid = idArg(streamId);
    const s = await ctx.loadStream(sid);
    if (s.state !== "ended") throw fail("failed-precondition", "The stream hasn't ended yet.", "notEnded");
    const state = await loadState(sid);
    if (!state) throw fail("failed-precondition", "There is no duty to confirm.", "noDuty");
    if (state.confirmedAt) throw fail("failed-precondition", "Tonight's crew is already confirmed.", "alreadyConfirmed");
    if (!(w.isOwner || (state.captainAtStop && state.captainAtStop === w.uid))) throw fail("permission-denied", "Only the Captain or the owner can confirm tonight's crew.", "notCaptain");
    const smin = streamMinutes(s), rooms = roomsOf(s);
    const clamped = {};
    if (added && typeof added === "object") {
      for (const [uid, raw] of Object.entries(added)) {
        const n = Math.floor(Number(raw));
        if (!ID_SAFE.test(uid) || !(n > 0) || n > 360) throw fail("invalid-argument", "Add whole minutes (up to 360) for each person.", "args");
        const tw = await person(uid);
        if (!tw.roster || tw.roster.status === "alumni") throw fail("failed-precondition", "They aren't on the crew.", "notCrew", { uid });
        const ref = db.doc(recPath(sid, uid));
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          const d = snap.exists ? snap.data() : { ...freshDuty(sid, uid, tw, ms(s.actualStart)), lastPing: null, clockedInAt: null, endedAt: ms(s.actualEnd), segments: [] };
          const cur = D.totalMinutes(d.lines);
          const add = Math.max(0, Math.min(n, smin - cur));                          // added minutes never take anyone past the stream's length
          clamped[uid] = add;
          const p = Object.keys(d.lines || {}).map(D.parseLine).sort((a, b) => D.rankOf(b) - D.rankOf(a))[0] || { role: "deckhand", room: rooms[0] };
          const k = D.lineKey(p.role, p.room);
          d.lines = { ...(d.lines || {}), [k]: ((d.lines || {})[k] || 0) + add };
          d.minutes = D.totalMinutes(d.lines); d.addedMinutes = (d.addedMinutes || 0) + add;
          tx.set(ref, d);
        });
      }
    }
    const r = await payNight(sid, { by: w });
    await logCrew(w, "dutyConfirmNight", sid, s.title, { people: r.paid.length, added: clamped, gears: r.paid.reduce((n, p) => n + p.gears, 0) });
    await publish();
    return { ok: true, ...r, added: clamped };
  });

  /** Every 15 minutes: nights older than 24 hours that nobody confirmed are confirmed with the heartbeat minutes. */
  async function runAutoConfirm(at = now()) {
    const snap = await db.collection(P.streams).where("state", "==", "ended").where("actualEnd", ">=", ts(at - 14 * 24 * 3600000)).where("actualEnd", "<=", ts(at - 24 * 3600000)).get();
    let n = 0;
    for (const d of snap.docs) {
      const state = await loadState(d.id);
      if (!state || state.confirmedAt || !state.needsConfirm) continue;
      await payNight(d.id, { auto: true });
      await logCrew(null, "dutyConfirmNight", d.id, d.get("title"), { auto: true });
      n++;
    }
    return { confirmed: n };
  }
  const dutyAutoConfirm = onSchedule({ schedule: "every 15 minutes", timeZone: "America/Chicago", timeoutSeconds: 300 }, async () => { console.log(`dutyAutoConfirm: ${JSON.stringify(await runAutoConfirm())}`); });

  // ---------- crewLockLift ----------
  const crewLockLift = onCall(async (request) => {
    const w = await crewCaller(request);
    if (!w.isOwner) throw fail("permission-denied", "Only the owner can lift a lockout.", "notOwner");
    const uid = idArg((request.data || {}).uid, "uid");
    const ref = db.doc(paths.record(uid));
    const before = ms((await ref.get()).get("lockUntil"));
    await ref.set({ lockUntil: FieldValue.delete(), lockTriggerAt: now() }, { merge: true });     // lockTriggerAt: the same no-shows never lock them again
    await logCrew(w, "crewLockLift", null, uid, { uid, wasUntil: before || null });
    return { ok: true, lifted: !!before };
  });

  // ---------- a presence hook for later ----------
  /**
   * Counts ONE minute for a person from another source, for when Twitch chat presence feeds duty minutes. NOT called anywhere yet: it needs the Twitch broadcaster token (the chatters list), which
   * is not connected (docs/specs/mod-machina.md section 17a, "Out of scope and later"; scripts/twitch-eventsub.js and the growth collector hold the token setup). The same rules as dutyPing apply: a
   * minute counts once, only while the person is clocked in and not stepped away. Returns { counted }.
   */
  async function creditPresence(sid, uid, at = now(), source = "twitchChat") {
    const state = await loadState(sid);
    const e = state && state.onDuty ? state.onDuty[uid] : null;
    if (!e || e.away || state.state !== "live") return { counted: 0, source };
    const ref = db.doc(recPath(sid, uid));
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { counted: 0, source };
      const d = snap.data();
      const minute = Math.floor(at / D.MIN);
      if (d.lastPresenceMinute === minute || Math.floor((d.lastPing || 0) / D.MIN) === minute) return { counted: 0, source };
      const p = D.primaryRole(e.roles);
      if (!p) return { counted: 0, source };
      const lines = { ...(d.lines || {}) };
      const k = D.lineKey(p.role, p.room);
      lines[k] = (lines[k] || 0) + 1;
      tx.update(ref, { lines, minutes: D.totalMinutes(lines), lastPresenceMinute: minute });
      return { counted: 1, source };
    });
  }

  return {
    functions: { dutyClockIn, dutyPing, dutyStepAway, dutyBack, dutyTakeLead, dutyDecline, dutyReassign, captainSet, dutyConfirmNight, dutyAutoConfirm, crewLockLift },
    onStart, closeOut, copyVideoIds, tick, payNight, runAutoConfirm, creditPresence, loadState,
  };
};
