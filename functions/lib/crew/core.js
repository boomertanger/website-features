// Mod Machina crew core (docs/specs/mod-machina.md sections 3, 10, 14): applying, the queue, the owner's
// decision, grades and status. Callable errors carry details.reason. Everything is written here and nowhere else.
//
//   crewApply, crewVouch, crewUnvouch, crewConcern, crewQueue          the queue (spec 10)
//   crewDecide (owner), crewWaive (owner)                              approve or "not now"; waive the check-ins
//   crewPromote, crewSetStatus, crewExcuse, crewStrike, crewSaveProfile
//   crewMe (own HQ data), crewAdminOverview (admins: roster, ready to promote, queue size)
//   crewNightly (03:10 Central): expire applications, refresh the queue, flag "ready to promote" (never promotes)
const { onCall } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const L = require("./logic");
const { SITE_ID, paths, loadSettings } = require("./settings");
const { makeStore, fail, ms } = require("./store");
const { dayKey, WEEK_TZ } = require("../arcade/logic");
const { makeGrant } = require("../rewards/grant");

const GRADE_BADGES = { mod: ["crew-initiate", "crew-watcher", "crew-warden", "crew-sentinel"], admin: ["crew-steward", "crew-overseer", "crew-right-hand"] };
const DEVICES = ["phone", "desktop", "both"];
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

module.exports = function crewCore({ adminLogEntry, gears = null } = {}) {
  const S = makeStore({ adminLogEntry });
  const { db, FieldValue, Timestamp } = S;
  const grant = makeGrant({ db });

  const rosterRef = (uid) => db.doc(paths.roster(uid));
  const recordRef = (uid) => db.doc(paths.record(uid));
  const record = async (uid) => { const s = await recordRef(uid).get(); return s.exists ? s.data() : {}; };
  const appsCol = () => db.collection(`${paths.settings()}/applications`);
  const rosterCol = () => db.collection(`${paths.settings()}/roster`);
  const progressOf = (snap) => Object.keys(snap.exists ? snap.get("modules") || {} : {});

  async function giveBadge(uid, badgeId, ref) {
    try { return await grant.grantBadge(uid, badgeId, { feature: "crew", ref: ref || badgeId }); }
    catch (err) { console.error(`crew: badge ${badgeId} failed`, err); return { granted: false, reason: "error" }; }
  }

  // ---------- input checks ----------
  function cleanPrefs(v) {
    const out = {};
    for (const k of ["twitch", "ytLandscape", "ytVertical", "tiktok"]) {
      const x = v?.[k] ?? "no";
      if (!L.PLATFORM_PREFS.includes(x)) throw fail("invalid-argument", `Pick a preference for ${k}.`, "field", { field: k });
      out[k] = x;
    }
    return out;
  }
  function cleanAvailability(v) {
    const days = Array.isArray(v?.days) ? [...new Set(v.days)] : [];
    if (days.some((d) => !DAYS.includes(d))) throw fail("invalid-argument", "Days must be mon to sun.", "field", { field: "availability" });
    return { days, note: S.text(v?.note ?? "", 300, { field: "availability note" }) };
  }
  function cleanDevice(v) {
    if (!DEVICES.includes(v)) throw fail("invalid-argument", "Device must be phone, desktop or both.", "field", { field: "device" });
    return v;
  }

  // ---------- the queue ----------
  /** Recomputes every open application's score and band (the applicant sees the band only). */
  async function refreshQueue(now = Date.now()) {
    const snap = await appsCol().where("status", "==", "open").get();
    const today = dayKey(now);
    const scored = [];
    for (const doc of snap.docs) {
      const a = doc.data();
      const [vouches, streak] = await Promise.all([doc.ref.collection("vouches").get(), db.doc(`sites/${SITE_ID}/factory/main/streaks/${a.uid}`).get()]);
      const parts = L.queueScore({ vouchGrades: vouches.docs.map((v) => v.get("grade")), prefs: a.prefs, checkins: L.checkinsWithin(streak.get("recentDays"), today) });
      scored.push({ id: doc.id, ref: doc.ref, score: parts.score, parts, createdAtMs: ms(a.createdAt) });
    }
    const ranked = L.rankQueue(scored);
    for (const r of ranked) {
      const s = scored.find((x) => x.id === r.id);
      await s.ref.update({ band: r.band, updatedAt: Timestamp.fromMillis(now) });
      await s.ref.collection("private").doc("score").set({ score: r.score, rank: r.rank, ...s.parts, at: Timestamp.fromMillis(now) });
    }
    return ranked;
  }

  // ---------- crewApply ----------
  const crewApply = onCall(async (request) => {
    const uid = S.requireAuth(request);
    const d = request.data || {};
    const now = Date.now();
    const [user, profile, roster, waiver, streak, mine, settings] = await Promise.all([
      db.doc(`users/${uid}`).get(), db.doc(`sites/${SITE_ID}/profiles/${uid}`).get(), rosterRef(uid).get(), db.doc(paths.waiver(uid)).get(),
      db.doc(`sites/${SITE_ID}/factory/main/streaks/${uid}`).get(), appsCol().where("uid", "==", uid).get(), loadSettings(db),
    ]);
    if (!user.get("signedUpAt") || !profile.exists) throw fail("failed-precondition", "Finish signing up first.", "needsSignup");
    const linked = Object.values(user.get("linked") || {}).filter((x) => x && (x.login || x.id || x.channelId)).length;
    const lastNotNow = Math.max(0, ...mine.docs.filter((a) => a.get("status") === "notNow").map((a) => ms(a.get("decidedAt")) || 0));
    const check = L.applyEligibility({
      ageBand: user.get("ageBand"), signedUpAtMs: ms(user.get("signedUpAt")), linkedCount: linked,
      checkins: L.checkinsWithin(streak.get("recentDays"), dayKey(now)), waived: waiver.exists,
      now, settings, crewStatus: roster.exists ? roster.get("status") : null,
      openApp: mine.docs.some((a) => a.get("status") === "open"), lastNotNowAtMs: lastNotNow || null,
    });
    if (!check.ok) throw fail("failed-precondition", "You can't apply yet.", check.reason, check.reapplyAtMs ? { reapplyAt: check.reapplyAtMs } : {});
    if (d.codeAgreed !== true) throw fail("invalid-argument", "Agree to the Crew Code first.", "code");
    const app = {
      uid, handle: profile.get("handle") || null, role: "mod", status: "open", band: "In the queue",
      prefs: cleanPrefs(d.preferences), availability: cleanAvailability(d.availability), device: cleanDevice(d.device),
      answers: { why: S.text(d.answers?.why, 1000, { min: 20, field: "why" }), experience: S.text(d.answers?.experience ?? "", 1000, { field: "experience" }) },
      codeAgreed: true, createdAt: Timestamp.fromMillis(now), updatedAt: Timestamp.fromMillis(now),
      expiresAt: Timestamp.fromMillis(now + settings.appExpiryDays * L.DAY_MS),
    };
    const ref = appsCol().doc(`${uid}-${now}`);
    await ref.create(app);
    const ranked = await refreshQueue(now);
    return { ok: true, appId: ref.id, band: ranked.find((r) => r.id === ref.id)?.band || "In the queue", expiresAt: ms(app.expiresAt) };
  });

  // ---------- vouches and concerns ----------
  async function loadOpenApp(appId) {
    if (typeof appId !== "string" || !appId) throw fail("invalid-argument", "appId is required.", "args");
    const ref = appsCol().doc(appId), snap = await ref.get();
    if (!snap.exists) throw fail("not-found", "That application doesn't exist.", "noApplication");
    if (snap.get("status") !== "open") throw fail("failed-precondition", "That application is closed.", "closed");
    return { ref, app: snap.data() };
  }

  const crewVouch = onCall(async (request) => {
    const uid = S.requireAuth(request);
    const w = await S.who(uid);
    if (!S.watcherPlus(w)) throw fail("permission-denied", "Watchers and above can vouch.", "notWatcher");
    const settings = await loadSettings(db);
    const { ref, app } = await loadOpenApp(request.data?.appId);
    if (app.uid === uid) throw fail("failed-precondition", "You can't vouch for yourself.", "self");
    const rec = recordRef(uid);
    await db.runTransaction(async (tx) => {
      const [r, existing] = await Promise.all([tx.get(rec), tx.get(ref.collection("vouches").doc(uid))]);
      if (existing.exists) throw fail("already-exists", "You've already vouched for this applicant.", "alreadyVouched");
      const held = (r.exists ? r.get("activeVouches") : null) || [];
      if (held.length >= settings.vouchCap) throw fail("resource-exhausted", `You can hold ${settings.vouchCap} vouches at a time.`, "vouchCap");
      tx.set(rec, { activeVouches: [...held, ref.id] }, { merge: true });
      tx.set(ref.collection("vouches").doc(uid), { voucherUid: uid, voucherHandle: w.handle, grade: w.grade, at: FieldValue.serverTimestamp() });
    });
    if (gears) await gears.grantQueueReview(uid, ref.id);
    const ranked = await refreshQueue();
    return { ok: true, rank: ranked.find((x) => x.id === ref.id)?.rank ?? null };
  });

  async function releaseVouch(voucherUid, appId) {
    const rec = recordRef(voucherUid);
    await db.runTransaction(async (tx) => {
      const r = await tx.get(rec);
      const held = (r.exists ? r.get("activeVouches") : null) || [];
      if (held.includes(appId)) tx.set(rec, { activeVouches: held.filter((x) => x !== appId) }, { merge: true });
    });
  }

  const crewUnvouch = onCall(async (request) => {
    const uid = S.requireAuth(request);
    const { ref } = await loadOpenApp(request.data?.appId);
    const v = ref.collection("vouches").doc(uid);
    if (!(await v.get()).exists) throw fail("not-found", "You haven't vouched for this applicant.", "noVouch");
    await v.delete();
    await releaseVouch(uid, ref.id);
    await refreshQueue();
    return { ok: true };
  });

  const crewConcern = onCall(async (request) => {
    const uid = S.requireAuth(request);
    const w = await S.who(uid);
    if (!S.watcherPlus(w)) throw fail("permission-denied", "Watchers and above can raise a concern.", "notWatcher");
    const { ref, app } = await loadOpenApp(request.data?.appId);
    if (app.uid === uid) throw fail("failed-precondition", "You can't raise a concern about yourself.", "self");
    const note = S.text(request.data?.note, 500, { min: 1, field: "note" });
    await ref.collection("concerns").doc(uid).set({ byUid: uid, byHandle: w.handle, note, at: FieldValue.serverTimestamp() });
    return { ok: true };
  });

  // ---------- crewQueue (Watcher+ and admins) ----------
  const crewQueue = onCall(async (request) => {
    const uid = S.requireAuth(request);
    const w = await S.who(uid);
    if (!S.watcherPlus(w)) throw fail("permission-denied", "Watchers and above can see the queue.", "notWatcher");
    const snap = await appsCol().where("status", "==", "open").get();
    const out = [];
    for (const doc of snap.docs) {
      const a = doc.data();
      const [vouches, score, concerns] = await Promise.all([doc.ref.collection("vouches").get(), doc.ref.collection("private").doc("score").get(), w.isAdmin ? doc.ref.collection("concerns").get() : null]);
      out.push({
        appId: doc.id, uid: a.uid, handle: a.handle, createdAt: ms(a.createdAt), expiresAt: ms(a.expiresAt), band: a.band,
        prefs: a.prefs, availability: a.availability, device: a.device, answers: a.answers,
        score: score.exists ? score.get("score") : 0, rank: score.exists ? score.get("rank") : null,
        vouches: vouches.docs.map((v) => ({ uid: v.get("voucherUid"), handle: v.get("voucherHandle"), grade: v.get("grade") })),
        vouchedByMe: vouches.docs.some((v) => v.id === uid),
        ...(concerns ? { concerns: concerns.docs.map((c) => ({ byHandle: c.get("byHandle"), note: c.get("note") })) } : {}),
      });
    }
    out.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
    return { queue: out };
  });

  // ---------- crewWaive (owner): the 3 check-ins can be waived ----------
  const crewWaive = onCall(async (request) => {
    const uid = S.requireAuth(request);
    const w = await S.who(uid);
    if (!w.isOwner) throw fail("permission-denied", "Only the owner can waive the requirements.", "notOwner");
    const target = request.data?.uid;
    if (typeof target !== "string" || !target) throw fail("invalid-argument", "uid is required.", "args");
    const tw = await S.who(target);
    await db.doc(paths.waiver(target)).set({ byUid: uid, at: FieldValue.serverTimestamp(), covers: ["checkins", "accountAge"] });
    await S.adminLog(w, { action: "crewWaive", uid: target, title: tw.handle ? `@${tw.handle}` : target, details: { covers: "check-ins and the 14-day account age" } });
    return { ok: true };
  });

  // ---------- crewDecide (owner only) ----------
  const crewDecide = onCall(async (request) => {
    const uid = S.requireAuth(request);
    const w = await S.who(uid);
    if (!w.isOwner) throw fail("permission-denied", "Only the owner decides on applications.", "notOwner");
    const decision = request.data?.decision;
    if (!["approve", "notNow"].includes(decision)) throw fail("invalid-argument", "decision must be approve or notNow.", "args");
    const settings = await loadSettings(db);
    const { ref, app } = await loadOpenApp(request.data?.appId);
    const now = Date.now();
    const vouches = await ref.collection("vouches").get();
    if (decision === "notNow") {
      const note = S.text(request.data?.note ?? "", 500, { min: 1, field: "note" });
      await ref.update({ status: "notNow", note, decidedAt: Timestamp.fromMillis(now), decidedBy: uid, band: FieldValue.delete(), reapplyAt: Timestamp.fromMillis(now + settings.reapplyDays * L.DAY_MS) });
      await Promise.all(vouches.docs.map((v) => releaseVouch(v.id, ref.id)));
      await refreshQueue(now);
      return { ok: true, status: "notNow" };
    }
    const member = await db.doc(`sites/${SITE_ID}/members/${app.uid}`).get();
    if (!member.exists) throw fail("not-found", "That member doesn't exist.", "noMember");
    await rosterRef(app.uid).set({
      track: "mod", grade: 1, status: "active", since: Timestamp.fromMillis(now), gradeSince: Timestamp.fromMillis(now),
      platforms: app.prefs || {}, availability: app.availability || { days: [], note: "" }, device: app.device || "desktop",
      monthDuties: 0, missedMonths: 0, activeStreak: 0, breakUntil: null, breakMonthsUsed: {}, excusedMonths: [],
      firstPick: false, crewComp: false, mentor: null, alumni: false,
      stats: { duties: 0, asRoomLead: 0, asCaptain: 0, rideAlongs: 0, showedPct: 0, mentored: 0 },
      handle: app.handle || null, approvedFrom: ref.id,
    });
    await S.setModRole(app.uid, true, w);
    await ref.update({ status: "approved", decidedAt: Timestamp.fromMillis(now), decidedBy: uid, band: FieldValue.delete() });
    await Promise.all(vouches.docs.map((v) => releaseVouch(v.id, ref.id)));
    await giveBadge(app.uid, GRADE_BADGES.mod[0]);
    await S.adminLog(w, { action: "crewApprove", uid: app.uid, title: app.handle ? `@${app.handle}` : app.uid, details: { appId: ref.id, grade: "Initiate" } });
    await S.activity("crew-joined", `${app.handle ? `@${app.handle}` : "A member"} joined the crew`, app.handle ? `@${app.handle}` : null);
    await refreshQueue(now);
    return { ok: true, status: "approved", uid: app.uid };
  });

  // ---------- crewPromote ----------
  // Owner: one step up on either ladder; the move onto the admin ladder (a Sentinel, or an admin already) is owner only.
  // A3 Right Hand: confirms mod promotions up to Warden. The owner is notified through the adminLog.
  const crewPromote = onCall(async (request) => {
    const uid = S.requireAuth(request);
    const w = await S.who(uid);
    const target = request.data?.uid;
    if (typeof target !== "string" || !target) throw fail("invalid-argument", "uid is required.", "args");
    const isRightHand = w.isAdmin && w.roster?.track === "admin" && w.roster.grade === 3;
    if (!w.isOwner && !isRightHand) throw fail("permission-denied", "Only the owner or a Right Hand can promote.", "notAllowed");
    if (target === uid) throw fail("failed-precondition", "You can't promote yourself.", "self");
    const tw = await S.who(target);
    const r = tw.roster;
    const now = Date.now();
    let next;
    if (request.data?.track === "admin") {
      if (!w.isOwner) throw fail("permission-denied", "Only the owner invites admins.", "notOwner");
      const grade = request.data?.grade;
      if (!Number.isInteger(grade) || grade < 1 || grade > 3) throw fail("invalid-argument", "grade must be 1 to 3.", "args");
      const onAdmin = r?.track === "admin";
      if (onAdmin ? grade !== r.grade + 1 : !(tw.roles.includes("admin") || (r && r.grade === 4))) throw fail("failed-precondition", "That isn't the next step.", "badStep");
      next = { track: "admin", grade };
    } else {
      if (!r || r.track === "admin") throw fail("failed-precondition", "That member isn't on the mod ladder.", "notMod");
      if (r.status === "paused" || r.status === "alumni") throw fail("failed-precondition", "They can't be promoted right now.", "status");
      next = { track: "mod", grade: r.grade + 1 };
      if (next.grade > 4) throw fail("failed-precondition", "That's the top of the mod ladder.", "top");
      if (!w.isOwner && next.grade > 3) throw fail("permission-denied", "A Right Hand confirms up to Warden.", "notOwner");
    }
    if (!r && !(next.track === "admin" && tw.roles.includes("admin"))) throw fail("failed-precondition", "That member isn't crew.", "notCrew");
    const patch = { ...next, gradeSince: Timestamp.fromMillis(now) };
    if (!r) Object.assign(patch, { status: "active", since: Timestamp.fromMillis(now), platforms: {}, availability: { days: [], note: "" }, device: "desktop", handle: tw.handle, stats: {}, breakUntil: null, breakMonthsUsed: {}, excusedMonths: [] });
    await rosterRef(target).set(patch, { merge: true });
    if (next.track === "admin" && !tw.roles.includes("admin")) {
      await db.doc(`sites/${SITE_ID}/members/${target}`).update({ roles: FieldValue.arrayUnion("admin"), rolesChangedBy: { uid, name: w.name }, rolesChangedAt: FieldValue.serverTimestamp() });
    }
    await recordRef(target).set({ ready: FieldValue.delete() }, { merge: true });
    const name = L.gradeName(next.track, next.grade);
    await giveBadge(target, GRADE_BADGES[next.track][next.grade - 1]);
    await S.adminLog(w, { action: "crewPromote", uid: target, title: tw.handle ? `@${tw.handle}` : target, changes: { grade: { before: r ? L.gradeName(r.track, r.grade) : null, after: name } }, details: { confirmedBy: w.isOwner ? "owner" : "rightHand" } });
    await S.activity("crew-promoted", `${tw.handle ? `@${tw.handle}` : "A crew member"} is now a ${name}`, tw.handle ? `@${tw.handle}` : null, { grade: name });
    return { ok: true, track: next.track, grade: next.grade, name };
  });

  // ---------- crewSetStatus ----------
  const crewSetStatus = onCall(async (request) => {
    const uid = S.requireAuth(request);
    const w = await S.who(uid);
    const target = typeof request.data?.uid === "string" && request.data.uid ? request.data.uid : uid;
    const status = request.data?.status;
    if (!L.STATUSES.includes(status)) throw fail("invalid-argument", "status is not one of the crew statuses.", "args");
    const tw = target === uid ? w : await S.who(target);
    const r = tw.roster;
    if (!r) throw fail("not-found", "That member isn't on the crew roster.", "notCrew");
    const now = Date.now(), year = String(new Date(now).getUTCFullYear());
    const patch = { status, statusSince: Timestamp.fromMillis(now), breakUntil: null };
    let reason = "";
    if (target === uid) {
      // yourself: a planned break, back to Active, or retiring in good standing
      if (!["goingDark", "active", "alumni"].includes(status)) throw fail("permission-denied", "You can set Going dark, Active or retire. The rest is up to the owner.", "notAllowed");
      if (status === "active" && !["goingDark", "checkIn"].includes(r.status)) throw fail("permission-denied", "Ask the owner to bring you back.", "notAllowed");
      if (status === "goingDark") {
        const months = request.data?.months;
        if (![1, 2].includes(months)) throw fail("invalid-argument", "A break is 1 or 2 months.", "args");
        const used = (r.breakMonthsUsed || {})[year] || 0;
        if (used + months > 2) throw fail("failed-precondition", "That's more than 2 months of breaks this year.", "breakLimit");
        patch.breakUntil = Timestamp.fromMillis(now + months * 30 * L.DAY_MS);
        patch[`breakMonthsUsed.${year}`] = used + months;
      }
    } else {
      if (!(w.isOwner || S.a2plus(w))) throw fail("permission-denied", "Only the owner or an Overseer can change someone's status.", "notAllowed");
      if (tw.isOwner) throw fail("failed-precondition", "The owner's status can't change.", "owner");
      if (r.track === "admin" && !w.isOwner) throw fail("permission-denied", "Only the owner changes an admin's status.", "notAllowed");
      if (!["active", "reserve", "alumni", "paused"].includes(status)) throw fail("invalid-argument", "Set Active, Reserve, Alumni or Paused.", "args");
      if (r.status === "alumni" && status !== "alumni" && !w.isOwner) throw fail("permission-denied", "Only the owner brings an alumnus back.", "notAllowed");
      reason = S.text(request.data?.reason ?? "", 300, { min: ["reserve", "alumni", "paused"].includes(status) ? 1 : 0, field: "reason" });
    }
    await rosterRef(target).update({ ...patch, alumni: status === "alumni" });
    // Alumni: the platform mod powers go (the mod role); coming back restores it. Admin roles are never touched here.
    if (r.track !== "admin") {
      if (status === "alumni" && tw.isMod) await S.setModRole(target, false, w);
      if (r.status === "alumni" && status !== "alumni" && !tw.isMod) await S.setModRole(target, true, w);
    }
    await S.adminLog(w, { action: "crewStatus", uid: target, title: tw.handle ? `@${tw.handle}` : target, reason, changes: { status: { before: r.status, after: status } } });
    return { ok: true, status };
  });

  // ---------- crewExcuse (owner): no minimum for one month ----------
  const crewExcuse = onCall(async (request) => {
    const uid = S.requireAuth(request);
    const w = await S.who(uid);
    if (!w.isOwner) throw fail("permission-denied", "Only the owner can excuse a month.", "notOwner");
    const { uid: target, month } = request.data || {};
    if (typeof target !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month || "")) throw fail("invalid-argument", "uid and month (yyyy-mm) are required.", "args");
    const tw = await S.who(target);
    if (!tw.roster) throw fail("not-found", "That member isn't on the crew roster.", "notCrew");
    await rosterRef(target).update({ excusedMonths: FieldValue.arrayUnion(month) });
    await S.adminLog(w, { action: "crewExcuse", uid: target, title: tw.handle ? `@${tw.handle}` : target, reason: S.text(request.data?.reason ?? "", 300, { field: "reason" }), details: { month } });
    return { ok: true };
  });

  // ---------- crewStrike (A2+): private; 1 a note, 2 no Lead/Captain for 30 days, 3 owner review ----------
  const crewStrike = onCall(async (request) => {
    const uid = S.requireAuth(request);
    const w = await S.who(uid);
    if (!S.a2plus(w)) throw fail("permission-denied", "Only Overseers and above can log a strike.", "notAllowed");
    const target = request.data?.uid;
    if (typeof target !== "string" || !target) throw fail("invalid-argument", "uid is required.", "args");
    if (target === uid) throw fail("failed-precondition", "You can't strike yourself.", "self");
    const tw = await S.who(target);
    if (tw.isOwner) throw fail("failed-precondition", "The owner can't be struck.", "owner");
    if (!tw.roster) throw fail("not-found", "That member isn't on the crew roster.", "notCrew");
    const reason = S.text(request.data?.reason, 500, { min: 1, field: "reason" });
    const now = Date.now();
    const rec = await record(target);
    const count = L.activeStrikes(rec.strikes, now).length + 1;
    const strikes = [...(rec.strikes || []), { at: now, byUid: uid, byName: w.name, reason, expiresAtMs: now + L.STRIKE_EXPIRY_DAYS * L.DAY_MS }];
    await recordRef(target).set({ strikes, ...(count >= 3 ? { ownerReview: true } : {}) }, { merge: true });
    if (count >= 2) await rosterRef(target).update({ leadBlockedUntil: Timestamp.fromMillis(now + 30 * L.DAY_MS) });
    await S.adminLog(w, { action: "crewStrike", uid: target, title: tw.handle ? `@${tw.handle}` : target, reason, details: { activeStrikes: count } });
    return { ok: true, activeStrikes: count, ownerReview: count >= 3 };
  });

  // ---------- crewSaveProfile (self) ----------
  const crewSaveProfile = onCall(async (request) => {
    const uid = S.requireAuth(request);
    const d = request.data || {};
    const r = await rosterRef(uid).get();
    if (!r.exists) throw fail("not-found", "You aren't on the crew roster.", "notCrew");
    const patch = {};
    if (d.preferences !== undefined) patch.platforms = cleanPrefs(d.preferences);
    if (d.availability !== undefined) patch.availability = cleanAvailability(d.availability);
    if (d.device !== undefined) patch.device = cleanDevice(d.device);
    if (!Object.keys(patch).length) throw fail("invalid-argument", "Nothing to save.", "args");
    await rosterRef(uid).update(patch);
    return { ok: true };
  });

  // ---------- crewMe: what a member's own pages need ----------
  const crewMe = onCall(async (request) => {
    const uid = S.requireAuth(request);
    const [w, rec, mine, progress] = await Promise.all([S.who(uid), record(uid), appsCol().where("uid", "==", uid).get(), db.doc(paths.academy(uid)).get()]);
    const now = Date.now();
    const apps = mine.docs.map((d) => ({ appId: d.id, status: d.get("status"), band: d.get("band") || null, note: d.get("note") || null, createdAt: ms(d.get("createdAt")), expiresAt: ms(d.get("expiresAt")), reapplyAt: ms(d.get("reapplyAt")) })).sort((a, b) => b.createdAt - a.createdAt);
    const r = w.roster;
    const settings = await loadSettings(db);
    // Not crew (or Alumni): the "Can I apply?" checklist, from the same function crewApply uses.
    let apply = null;
    if (!r || r.status === "alumni") {
      const [user, waiver, streak] = await Promise.all([db.doc(`users/${uid}`).get(), db.doc(paths.waiver(uid)).get(), db.doc(`sites/${SITE_ID}/factory/main/streaks/${uid}`).get()]);
      const linked = Object.values(user.get("linked") || {}).filter((x) => x && (x.login || x.id || x.channelId)).length;
      const lastNotNow = Math.max(0, ...mine.docs.filter((a) => a.get("status") === "notNow").map((a) => ms(a.get("decidedAt")) || 0));
      apply = L.applyChecklist({
        ageBand: user.get("ageBand"), signedUpAtMs: ms(user.get("signedUpAt")), linkedCount: linked,
        checkins: L.checkinsWithin(streak.get("recentDays"), dayKey(now)), waived: waiver.exists, now, settings,
        crewStatus: r ? r.status : null, openApp: mine.docs.some((a) => a.get("status") === "open"), lastNotNowAtMs: lastNotNow || null,
      });
      apply.signedUp = !!user.get("signedUpAt");
    }
    // Next-grade progress for HQ: the same criteria the nightly "Ready to promote" flag uses (duty criteria are pending until stream duty).
    const crit = r ? L.promotionCriteria({ roster: { ...r, gradeSince: ms(r.gradeSince) }, stats: r.stats, passed: progressOf(progress), strikes: L.activeStrikes(rec.strikes, now).length, now, settings }) : null;
    return {
      activityRules: settings.activityRules === true,
      apply,
      next: crit && crit.to ? { to: crit.to, name: L.gradeName("mod", crit.to), ready: crit.ready, met: crit.met, missing: crit.missing, pending: crit.pending } : null,
      crew: r ? { track: r.track, grade: r.grade, name: L.gradeName(r.track, r.grade), status: r.status, since: ms(r.since), gradeSince: ms(r.gradeSince), platforms: r.platforms, availability: r.availability, device: r.device, breakUntil: ms(r.breakUntil), breakMonthsUsed: (r.breakMonthsUsed || {})[String(new Date(now).getUTCFullYear())] || 0, stats: r.stats || {} } : null,
      strikes: L.activeStrikes(rec.strikes, now).map((s) => ({ at: s.at, reason: s.reason, expiresAt: s.expiresAtMs })),
      ready: rec.ready ? { to: rec.ready.to, name: L.gradeName(r?.track || "mod", rec.ready.to) } : null,
      academy: { passed: progressOf(progress) },
      application: apps[0] || null,
    };
  });

  // ---------- crewAdminOverview (admins) ----------
  const crewAdminOverview = onCall(async (request) => {
    const uid = S.requireAuth(request);
    const w = await S.who(uid);
    if (!w.isAdmin) throw fail("permission-denied", "Admins only.", "notAdmin");
    const [roster, open] = await Promise.all([rosterCol().get(), appsCol().where("status", "==", "open").get()]);
    const rows = [];
    for (const d of roster.docs) {
      const r = d.data(), rec = await record(d.id);
      rows.push({ uid: d.id, handle: r.handle || null, track: r.track, grade: r.grade, name: L.gradeName(r.track, r.grade), status: r.status, since: ms(r.since), platforms: r.platforms || {}, device: r.device || null, ready: rec.ready ? { to: rec.ready.to, since: rec.ready.since } : null, activeStrikes: L.activeStrikes(rec.strikes, Date.now()).length, ownerReview: !!rec.ownerReview });
    }
    return { roster: rows, openApplications: open.size, settings: await loadSettings(db) };
  });

  // ---------- crewSaveSettings (owner only): the settings card on /admin/crew ----------
  // Validates every field; anything not sent is left alone. Gears values, the YouTube boost, the activity rules switch,
  // the check-in fallback, the recruit and vouch caps, application timings and the Twitch sync switch.
  const crewSaveSettings = onCall(async (request) => {
    const uid = S.requireAuth(request);
    const w = await S.who(uid);
    if (!w.isOwner) throw fail("permission-denied", "Only the owner changes the crew settings.", "notOwner");
    const d = request.data || {};
    const patch = {};
    const int = (v, min, max, field) => { if (!Number.isInteger(v) || v < min || v > max) throw fail("invalid-argument", `${field} must be a whole number from ${min} to ${max}.`, "field", { field }); return v; };
    const bool = (v, field) => { if (typeof v !== "boolean") throw fail("invalid-argument", `${field} must be on or off.`, "field", { field }); return v; };
    if (d.gearsValues !== undefined) {
      if (!d.gearsValues || typeof d.gearsValues !== "object") throw fail("invalid-argument", "gearsValues must be an object.", "field", { field: "gearsValues" });
      for (const [k, v] of Object.entries(d.gearsValues)) {
        if (!(k in L.DEFAULT_SETTINGS.gearsValues)) throw fail("invalid-argument", `${k} isn't a Gears value.`, "field", { field: k });
        patch[`gearsValues.${k}`] = int(v, 0, 1000, k);
      }
    }
    if (d.youtubeBoost !== undefined) {
      if (typeof d.youtubeBoost !== "number" || !(d.youtubeBoost >= 1 && d.youtubeBoost <= 5)) throw fail("invalid-argument", "youtubeBoost must be from 1 to 5.", "field", { field: "youtubeBoost" });
      patch.youtubeBoost = Math.round(d.youtubeBoost * 100) / 100;
    }
    if (d.activityRules !== undefined) patch.activityRules = bool(d.activityRules, "activityRules");
    if (d.checkinFallback !== undefined) patch.checkinFallback = bool(d.checkinFallback, "checkinFallback");
    if (d.twitchSync !== undefined) patch.twitchSync = bool(d.twitchSync, "twitchSync");
    if (d.recruitCapPerMonth !== undefined) patch.recruitCapPerMonth = int(d.recruitCapPerMonth, 1, 100, "recruitCapPerMonth");
    if (d.vouchCap !== undefined) patch.vouchCap = int(d.vouchCap, 1, 10, "vouchCap");
    if (d.appExpiryDays !== undefined) patch.appExpiryDays = int(d.appExpiryDays, 7, 365, "appExpiryDays");
    if (d.reapplyDays !== undefined) patch.reapplyDays = int(d.reapplyDays, 0, 365, "reapplyDays");
    if (!Object.keys(patch).length) throw fail("invalid-argument", "Nothing to save.", "args");
    const before = await loadSettings(db);
    await db.doc(paths.settings()).update(patch);
    const after = await loadSettings(db);
    const changes = {};
    for (const k of Object.keys(patch)) {
      const [a, b] = k.split(".");
      const was = b ? before[a][b] : before[a], now = b ? after[a][b] : after[a];
      if (was !== now) changes[k] = { before: was, after: now };
    }
    await db.collection("adminLog").add(await adminLogEntry(db, { feature: "crew", action: "crewSettings", itemPath: paths.settings(), itemTitle: "Crew settings", actorUid: uid, actorName: w.name, changes }));
    return { ok: true, settings: after };
  });

  // ---------- crewNightly (03:10 Central) ----------
  async function runNightly(now = Date.now()) {
    const settings = await loadSettings(db);
    const open = await appsCol().where("status", "==", "open").get();
    let expired = 0;
    for (const d of open.docs) {
      if ((ms(d.get("expiresAt")) || Infinity) <= now) {
        await d.ref.update({ status: "expired", decidedAt: Timestamp.fromMillis(now), band: FieldValue.delete() });
        const vouches = await d.ref.collection("vouches").get();
        await Promise.all(vouches.docs.map((v) => releaseVouch(v.id, d.id)));
        expired++;
      }
    }
    await refreshQueue(now);
    const roster = await rosterCol().get();
    let flagged = 0, served = 0;
    for (const d of roster.docs) {
      const r = d.data();
      // The service ladder (3, 6, 12, 24 months on the crew): Alumni stop earning it, everyone else keeps going.
      if (r.status !== "alumni" && ms(r.since)) {
        for (const badgeId of L.serviceBadges(L.monthsBetween(ms(r.since), now))) {
          if ((await giveBadge(d.id, badgeId)).granted) served++;
        }
      }
      const [rec, prog] = await Promise.all([record(d.id), db.doc(paths.academy(d.id)).get()]);
      const c = L.promotionCriteria({ roster: { ...r, gradeSince: ms(r.gradeSince) }, stats: r.stats, passed: progressOf(prog), strikes: L.activeStrikes(rec.strikes, now).length, now, settings });
      if (c.ready && ["active", "checkIn"].includes(r.status)) {
        if (!rec.ready || rec.ready.to !== c.to) { await recordRef(d.id).set({ ready: { to: c.to, since: now } }, { merge: true }); flagged++; }
      } else if (rec.ready) await recordRef(d.id).set({ ready: FieldValue.delete() }, { merge: true });
    }
    await require("./publicRoster").rebuildPublicCrew(db);     // handles can change; the roster page stays fresh
    return { expired, flagged, served };
  }
  const crewNightly = onSchedule({ schedule: "every day 03:10", timeZone: WEEK_TZ, timeoutSeconds: 300 }, async () => {
    const r = await runNightly();
    console.log(`crewNightly: ${r.expired} applications expired, ${r.flagged} newly ready to promote, ${r.served} service badges`);
  });

  return { crewApply, crewVouch, crewUnvouch, crewConcern, crewQueue, crewWaive, crewDecide, crewPromote, crewSetStatus, crewExcuse, crewStrike, crewSaveProfile, crewMe, crewAdminOverview, crewSaveSettings, crewNightly };
};
