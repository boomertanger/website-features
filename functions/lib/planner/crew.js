// Scream Planner, the crew's callables (docs/specs/scream-planner.md sections 4d and 7; seats follow Mod Machina 6a):
// availability per slot, seat sign-ups (Mod Machina names dutySignUp / dutyDrop / dutyConfirm), the delay
// reconfirm (dutyKeep) and one game request per mod per slot. Sign-ups live at streams/{id}/signups/{uid}.
const { onCall } = require("firebase-functions/v2/https");
const L = require("./logic");
const { P, fail, ms } = require("./core");
const crewSettings = require("../crew/settings");
const { swapPath } = require("../crew/swap");
const { lockUntilOf } = require("../crew/lock");
const { lockMessage } = require("../crew/dutyLogic");

module.exports = function crewFns({ core, gears, swap = null }) {
  const { db, FieldValue } = core;
  const live = (draft) => ["planned", "scheduled"].includes(draft.state) && ms(draft.plannedStart) > Date.now();
  const needCrew = async (request) => {
    const w = await core.whoPlus(core.requireAuth(request));
    if (!core.onDuty(w)) throw fail("permission-denied", "Crew only (Active or Check-in).", "notCrew");
    return w;
  };
  const loadLive = async (streamId) => {
    const s = await core.loadStream(streamId);
    if (!live(s.draft)) throw fail("failed-precondition", "That stream has started or can't take sign-ups.", "notOpen");
    return s;
  };
  const weekOpenForChanges = (week) => {
    if (week.weekOff || week.state !== "open" || Date.now() >= ms(week.closesAt)) throw fail("failed-precondition", "Availability and game requests are closed for this week.", "closed");
  };
  const signupBase = (w) => ({ handle: w.handle, grade: w.roster ? w.roster.grade ?? null : w.isAdmin ? 4 : null, track: w.roster?.track || (w.isAdmin ? "admin" : "mod") });
  const active = (s) => ["requested", "confirmed"].includes(s.status);

  /** Writes the crew back to the working copy and, because seats are live facts, to the public doc too (no "unpublished changes"). */
  async function saveCrew(id, draft, crew) {
    await core.saveDraft(id, { ...draft, crew }, { alsoPublic: true, fields: ["crew"] });
    await core.refreshCounts(draft.week);
  }

  /** Marks every active seat of a person on a stream dropped (used when a mod loses status). */
  async function releaseAll(streamId, uid, why) {
    const ref = db.doc(P.signup(streamId, uid)), snap = await ref.get();
    if (!snap.exists) return;
    const seats = (snap.get("seats") || []).map((s) => (active(s) ? { ...s, status: "dropped", why } : s));
    await ref.update({ seats, gameRequest: null, updatedAt: FieldValue.serverTimestamp() });
  }

  // ---------------------------------------------------------------------------------------------
  const crewAvailability = onCall(async (request) => {
    const w = await needCrew(request);
    const { streamId, availability } = request.data || {};
    if (!L.AVAILABILITY.includes(availability)) throw fail("invalid-argument", "availability must be yes, maybe or no.", "args");
    const { id, draft } = await loadLive(streamId);
    weekOpenForChanges(await core.loadWeek(draft.week));
    const ref = db.doc(P.signup(id, w.uid)), snap = await ref.get();
    let seats = snap.exists ? snap.get("seats") || [] : [];
    let gameRequest = snap.exists ? snap.get("gameRequest") || null : null;
    if (availability === "no") {                       // can't make it: pending requests go, confirmed seats stay until dropped
      seats = seats.map((s) => (s.status === "requested" ? { ...s, status: "dropped", why: "unavailable" } : s));
      gameRequest = null;
    }
    await ref.set({ ...signupBase(w), availability, prefilled: false, seats, gameRequest, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { ok: true, availability, seats, gameRequest };
  });

  // ---------------------------------------------------------------------------------------------
  const dutySignUp = onCall(async (request) => {
    const w = await needCrew(request);
    const { streamId, seats: asked } = request.data || {};
    const problems = L.validateSignup({ seats: asked });
    if (problems.length || !Array.isArray(asked) || !asked.length) throw fail("invalid-argument", problems[0] || "Pick at least one seat.", "args");
    const { id, draft } = await loadLive(streamId);
    const wanted = asked.map(L.normalizeSeat);
    if (wanted.some((x) => x && x.role !== "deckhand")) {          // the no-show lockout (3 no-shows in 90 days): no Lead or Captain seats; Deckhand is fine
      const lock = await lockUntilOf(db, w.uid);
      if (lock > Date.now()) throw fail("permission-denied", lockMessage(lock), "locked", { until: lock });
    }
    for (const seat of wanted) {
      if (seat.role !== "captain" && !(draft.rooms || []).includes(seat.room)) throw fail("failed-precondition", "That stream has no such room.", "roomOff", { room: seat.room });
      const e = L.seatEligibility(w.person, seat, Date.now());
      if (!e.ok) throw fail("permission-denied", seatMessage(e.reason), e.reason, { seat });
    }
    const ref = db.doc(P.signup(id, w.uid)), snap = await ref.get();
    if (snap.exists && snap.get("availability") === "no") throw fail("failed-precondition", "You marked yourself unavailable for this stream.", "unavailable");
    const old = snap.exists ? snap.get("seats") || [] : [];
    const keepConfirmed = old.filter((s) => s.status === "confirmed");
    const seats = [...keepConfirmed];
    for (const seat of wanted) {
      if (seats.some((s) => L.seatKey(s) === L.seatKey(seat))) continue;
      const e = L.seatEligibility(w.person, seat, Date.now());
      seats.push({ room: seat.room, role: seat.role, status: "requested", ...(e.needsOwnerOk ? { needsOwnerOk: true } : {}) });
    }
    const firstRequest = !old.some(active);
    await ref.set({ ...signupBase(w), availability: snap.exists ? snap.get("availability") : "yes", prefilled: false, seats, gameRequest: snap.exists ? snap.get("gameRequest") || null : null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    // Mod Machina "early sign-up": +3 Gears for the first seat request within 48 hours of the week being published.
    let earlyGears = false;
    const week = await core.loadWeek(draft.week);
    if (firstRequest && draft.published === true && ms(week.earlySignupUntil) > Date.now()) {
      try {
        const amount = (await crewSettings.loadSettings(db)).gearsValues.earlySignup;
        earlyGears = (await gears.grantGears(w.uid, "earlySignup", id, amount)).granted === true;
      } catch (err) { console.error("planner: early sign-up Gears failed", err); }
    }
    return { ok: true, seats, earlyGears };
  });
  const seatMessage = (reason) => ({
    gradeTooLow: "Your grade doesn't cover that seat yet.", leadBlocked: "Lead and Captain seats are paused for you for now.", notActive: "Your crew status isn't Active or Check-in.",
    notCrew: "Crew only.", badSeat: "That isn't a seat.",
  }[reason] || "You can't take that seat.");

  // ---------------------------------------------------------------------------------------------
  const dutyDrop = onCall(async (request) => {
    const w = await core.whoPlus(core.requireAuth(request));
    const { streamId, uid: other, seat } = request.data || {};
    const target = typeof other === "string" && other ? other : w.uid;
    if (target !== w.uid && !w.isAdmin) throw fail("permission-denied", "Only admins can release someone else's seat.", "notAllowed");
    if (target === w.uid && !core.onDuty(w)) throw fail("permission-denied", "Crew only.", "notCrew");
    const { id, draft } = await core.loadStream(streamId);
    if (!["planned", "scheduled"].includes(draft.state) || ms(draft.plannedStart) <= Date.now()) throw fail("failed-precondition", "That stream has started or ended.", "notOpen");
    const match = seat ? L.normalizeSeat(seat) : null;
    if (seat && !match) throw fail("invalid-argument", "That isn't a seat.", "args");
    const ref = db.doc(P.signup(id, target)), snap = await ref.get();
    if (!snap.exists && !L.seatsHeldBy(draft.crew, target).length) throw fail("not-found", "No seat to drop.", "noSeat");
    const hit = (s) => !match || L.seatKey(s) === L.seatKey(match);
    const heldConfirmed = L.seatsHeldBy(draft.crew, target).filter(hit);
    const seats = (snap.exists ? snap.get("seats") || [] : []).map((s) => (active(s) && hit(s) ? { ...s, status: "dropped", why: "dropped" } : s));
    const stillActive = seats.some(active);
    await ref.set({ seats, ...(stillActive ? {} : { gameRequest: null }), reconfirm: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    let swaps = 0;
    if (heldConfirmed.length) {
      let crew = draft.crew;
      for (const s of heldConfirmed) crew = L.removeSeat(crew, target, s);
      await saveCrew(id, draft, crew);
      // Swap board (Mod Machina phase 3 part 1): on a published stream the freed seat goes on the board, so the rest of the crew can take it. The seat shows as open on the stream; the swap
      // remembers who dropped it and how much notice they gave (early = 24 h or more, late = less). An admin releasing someone else's seat never counts against them (noRecord).
      if (swap && draft.published === true && draft.state === "scheduled") {
        const who = target === w.uid ? w : await core.whoPlus(target);
        for (const s of heldConfirmed) { await swap.open({ streamId: id, seat: s, from: { uid: target, handle: who.handle }, startsAtMs: ms(draft.plannedStart), title: draft.title, week: draft.week, noRecord: target !== w.uid, actor: w }); swaps++; }
      }
    }
    return { ok: true, dropped: seats.filter((s) => s.status === "dropped").length, released: heldConfirmed.length, swaps };
  });

  // ---------------------------------------------------------------------------------------------
  const dutyConfirm = onCall(async (request) => {
    const w = await core.whoPlus(core.requireAuth(request));
    const { streamId, uid: target, seat, decline } = request.data || {};
    const s = L.normalizeSeat(seat);
    if (typeof target !== "string" || !target || !s) throw fail("invalid-argument", "uid and a seat are required.", "args");
    const { id, draft } = await loadLive(streamId);
    // The Captain or the owner confirms (Mod Machina 6b); A1 Stewards can confirm crew too (admin ladder).
    if (!(w.isAdmin || draft.crew?.captain?.uid === w.uid)) throw fail("permission-denied", "Only the Captain, an admin or the owner can confirm crew.", "notAllowed");
    const ref = db.doc(P.signup(id, target)), snap = await ref.get();
    const seats = snap.exists ? snap.get("seats") || [] : [];
    const idx = seats.findIndex((x) => L.seatKey(x) === L.seatKey(s) && x.status === "requested");
    if (idx < 0) throw fail("failed-precondition", "That seat isn't requested.", "notRequested");
    if (decline === true) {
      seats[idx] = { ...seats[idx], status: "declined" };
      await ref.update({ seats, updatedAt: FieldValue.serverTimestamp() });
      return { ok: true, status: "declined" };
    }
    const tw = await core.whoPlus(target);
    const e = L.seatEligibility(tw.person, s, Date.now());
    if (!e.ok) throw fail("failed-precondition", seatMessage(e.reason), e.reason);
    if (e.needsOwnerOk && !w.isOwner) throw fail("permission-denied", "A Watcher as Captain needs the owner's OK.", "needsOwner");
    if (snap.get("availability") === "no") throw fail("failed-precondition", "They marked themselves unavailable.", "unavailable");
    const placed = L.placeSeat(draft.crew, s, { uid: target, handle: tw.handle });
    if (!placed.ok) throw fail("failed-precondition", ({ seatTaken: "That seat is already filled.", cantHold: "They already hold a seat that doesn't go with this one.", deckhandCap: "That room has its Deckhands.", roomOff: "That stream has no such room." })[placed.reason] || "Can't confirm that seat.", placed.reason);
    seats[idx] = { ...seats[idx], status: "confirmed", confirmedBy: w.handle || null };
    await ref.update({ seats, updatedAt: FieldValue.serverTimestamp() });
    await saveCrew(id, draft, placed.crew);
    if (draft.state === "scheduled") await core.outbox({ type: "crew-seat-confirmed", audience: "uids", uids: [target], streamId: id, week: draft.week, payload: { title: `You're on ${draft.title || "the stream"}`, seat: s, start: ms(draft.plannedStart), link: "/schedule/plan" } });
    await core.logAdmin(w, { action: "crewConfirm", path: P.stream(id), title: draft.title, details: { week: draft.week, uid: target, handle: tw.handle, seat: s } });
    return { ok: true, status: "confirmed", crew: L.publicCrew(placed.crew) };
  });

  // ---------------------------------------------------------------------------------------------
  // The swap board's Take it: first write wins. The seat is confirmed straight away (it was a confirmed seat), so the stream's crew field and the taker's sign-up are written here, with the same
  // helpers dutySignUp and dutyConfirm use (L.placeSeat, saveCrew, the signup doc). The claim is a transaction on the swap; if the seat can't be written afterwards the swap goes back on the board.
  const swapRefusal = {
    ownSeat: "That's the seat you dropped.", locked: "Lead and Captain seats are paused for you for now.", alreadySeated: "You already have a seat on that stream.",
    unavailable: "You marked yourself unavailable for this stream.", needsOwner: "A Watcher as Captain needs the owner's OK.", closed: "That seat is no longer up for grabs.",
    seatTaken: "That seat is already filled.", cantHold: "You already hold a seat that doesn't go with this one.", deckhandCap: "That room has its Deckhands.", roomOff: "That stream has no such room.",
  };
  const dutySwapTake = onCall(async (request) => {
    const w = await needCrew(request);
    const { swapId } = request.data || {};
    if (!swap || typeof swapId !== "string" || !swapId || swapId.includes("/")) throw fail("invalid-argument", "Say which seat.", "args");
    const sref = db.doc(swapPath(swapId)), ssnap = await sref.get();
    if (!ssnap.exists) throw fail("not-found", "That seat isn't on the board any more.", "noSwap");
    const sw = { id: swapId, ...ssnap.data() };
    if (sw.status === "taken") throw fail("aborted", "Someone beat you to it.", "beaten");
    if (sw.status !== "open") throw fail("failed-precondition", swapRefusal.closed, "closed");
    const { id, draft } = await loadLive(sw.streamId);
    if (sw.fromUid === w.uid) throw fail("failed-precondition", swapRefusal.ownSeat, "ownSeat");
    const seat = L.normalizeSeat({ room: sw.room, role: sw.role });
    if (!seat) throw fail("invalid-argument", "That isn't a seat.", "args");
    const e = L.seatEligibility(w.person, seat, Date.now());
    if (!e.ok) throw fail("permission-denied", seatMessage(e.reason), e.reason, { seat });
    if (e.needsOwnerOk) throw fail("permission-denied", swapRefusal.needsOwner, "needsOwner");
    if (seat.role !== "deckhand") {      // the no-show lockout (part 2 writes roster/{uid}/private/record.lockUntil; a missing field is no lock)
      const lockUntil = await lockUntilOf(db, w.uid);
      if (lockUntil > Date.now()) throw fail("permission-denied", lockMessage(lockUntil), "locked", { until: lockUntil });
    }
    const held = L.seatsHeldBy(draft.crew, w.uid);
    if (held.length && !(seat.role === "lead" && held.every((h) => h.role === "captain"))) throw fail("failed-precondition", swapRefusal.alreadySeated, "alreadySeated");
    const mine = db.doc(P.signup(id, w.uid)), msnap = await mine.get();
    if (msnap.exists && msnap.get("availability") === "no") throw fail("failed-precondition", swapRefusal.unavailable, "unavailable");
    const pre = L.placeSeat(draft.crew, seat, { uid: w.uid, handle: w.handle });
    if (!pre.ok) throw fail("failed-precondition", swapRefusal[pre.reason] || "Can't take that seat.", pre.reason);
    try { await swap.claim(swapId, { uid: w.uid, handle: w.handle }); }
    catch (err) { if (err && err.beaten) throw fail("aborted", "Someone beat you to it.", "beaten"); throw err; }
    let placed;
    try {
      const fresh = await core.loadStream(id);
      placed = L.placeSeat(fresh.draft.crew, seat, { uid: w.uid, handle: w.handle });
      if (!placed.ok) throw fail("failed-precondition", swapRefusal[placed.reason] || "Can't take that seat.", placed.reason);
      const old = (await mine.get()).exists ? (await mine.get()).get("seats") || [] : [];
      const seats = [...old.filter((s) => L.seatKey(s) !== L.seatKey(seat)), { room: seat.room, role: seat.role, status: "confirmed", confirmedBy: "swap" }];
      await mine.set({ ...signupBase(w), availability: msnap.exists ? msnap.get("availability") : "yes", prefilled: false, seats, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await saveCrew(id, fresh.draft, placed.crew);
    } catch (err) { try { await swap.unclaim(swapId); } catch (e2) { console.error("swap: couldn't put the seat back on the board", e2); } throw err; }
    await swap.taken(sw, { uid: w.uid, handle: w.handle }, { title: draft.title, actor: w });
    try {
      const uids = [sw.fromUid, draft.crew?.captain?.uid].filter((u, i, a) => u && u !== w.uid && a.indexOf(u) === i);
      if (uids.length) await core.outbox({ type: "crewSwap", audience: "uids", uids, streamId: id, week: draft.week, payload: { event: "taken", title: `@${w.handle || "someone"} took the ${seat.role === "captain" ? "Captain" : seat.role === "lead" ? "Room Lead" : "Deckhand"} seat on ${draft.title || "the stream"}`, seat: { room: seat.room, role: seat.role }, start: ms(draft.plannedStart), link: "/crew/hq" } });
    } catch (err) { console.error("planner: swap taken notice failed", err); }
    return { ok: true, status: "taken", seat, startsAt: ms(draft.plannedStart), crew: L.publicCrew(placed.crew) };
  });

  /** "Still on for the new time?" Keep: clears the question and the seats stay. (Drop is dutyDrop.) */
  const dutyKeep = onCall(async (request) => {
    const w = await needCrew(request);
    const { id } = await core.loadStream(request.data?.streamId);
    const ref = db.doc(P.signup(id, w.uid));
    if (!(await ref.get()).exists) throw fail("not-found", "No sign-up for that stream.", "noSignup");
    await ref.set({ reconfirm: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { ok: true };
  });

  // ---------------------------------------------------------------------------------------------
  const modGameRequest = onCall(async (request) => {
    const w = await needCrew(request);
    const { streamId, gameSlug, note, remove } = request.data || {};
    const { id, draft } = await loadLive(streamId);
    weekOpenForChanges(await core.loadWeek(draft.week));
    const ref = db.doc(P.signup(id, w.uid)), snap = await ref.get();
    if (!snap.exists) throw fail("failed-precondition", "Mark your availability and ask for a seat first.", "needsAvailability");
    if (remove === true) { await ref.update({ gameRequest: null, updatedAt: FieldValue.serverTimestamp() }); return { ok: true, removed: true }; }
    const v = L.validateGameRequest({ availability: snap.get("availability"), seats: snap.get("seats") || [], gameSlug, note });
    if (!v.ok) throw fail("failed-precondition", ({ needsAvailability: "Mark yourself available first.", needsSeat: "Ask for a seat on this stream first.", noteTooLong: "Keep the note to 140 characters.", noGame: "Pick a game." })[v.reason] || "Can't request that.", v.reason);
    const g = await db.doc(`${P.games}/${gameSlug}`).get();
    if (!g.exists || g.get("hidden") === true) throw fail("not-found", "That game isn't in the Vault.", "noGame");
    const gameRequest = { gameSlug, note: typeof note === "string" ? note.trim() : "", status: "open" };
    await ref.update({ gameRequest, updatedAt: FieldValue.serverTimestamp() });
    return { ok: true, gameRequest };
  });

  return { functions: { crewAvailability, dutySignUp, dutyDrop, dutySwapTake, dutyConfirm, dutyKeep, modGameRequest }, releaseAll };
};
