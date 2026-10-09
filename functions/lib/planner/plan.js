// Scream Planner, the owner's and admins' callables (docs/specs/scream-planner.md sections 6 and 7):
// settings, the usual week (patterns and exceptions), opening and reopening a week, planning slots and games,
// publishing, and delaying or cancelling a stream. Also exports openWeek / closeWeek for plannerTick.
const { onCall } = require("firebase-functions/v2/https");
const L = require("./logic");
const ST = require("../streams/logic");
const { P, fail, ms, requireOwner, requireAdmin } = require("./core");

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_MS = 86400000;

module.exports = function plan({ core, swap = null }) {
  const { db, FieldValue, Timestamp, ts } = core;
  const owner = async (request) => { const w = await core.whoPlus(core.requireAuth(request)); requireOwner(w); return w; };
  const admin = async (request) => { const w = await core.whoPlus(core.requireAuth(request)); requireAdmin(w); return w; };
  const errs = (list, field = "fields") => { if (list.length) throw fail("invalid-argument", list[0], "invalid", { problems: list, field }); };
  const newId = (col) => db.collection(col).doc().id;

  // ---------------------------------------------------------------------------------------------
  // plannerSaveSettings (owner): deadlines and defaults
  // ---------------------------------------------------------------------------------------------
  const plannerSaveSettings = onCall(async (request) => {
    const w = await owner(request);
    const tz = await core.siteTz();
    const cur = await core.loadSettings();
    const d = request.data || {};
    const next = L.mergeSettings({ deadlines: { ...cur.deadlines, ...(d.deadlines || {}) }, defaults: { ...cur.defaults, ...(d.defaults || {}) } });
    errs(L.validateDeadlines(next.deadlines, tz), "deadlines");
    const df = next.defaults;
    errs([
      ...(Array.isArray(df.rooms) && df.rooms.every((r) => L.ROOMS.includes(r)) && df.rooms.length ? [] : ["defaults.rooms: pick at least one chat"]),
      ...(Number.isInteger(df.gameCount) && df.gameCount >= 1 && df.gameCount <= L.GAME_COUNT_MAX ? [] : ["defaults.gameCount: 1 to 6"]),
      ...(Number.isInteger(df.votesPerMember) && df.votesPerMember >= 1 && df.votesPerMember <= 10 ? [] : ["defaults.votesPerMember: 1 to 10"]),
      ...(Number.isInteger(df.ballotAddsPerMember) && df.ballotAddsPerMember >= 0 && df.ballotAddsPerMember <= 10 ? [] : ["defaults.ballotAddsPerMember: 0 to 10"]),
      ...(Number.isInteger(df.ballotSeed) && df.ballotSeed >= 0 && df.ballotSeed <= 20 ? [] : ["defaults.ballotSeed: 0 to 20"]),
      ...(Number.isInteger(df.caps?.deckhands) && df.caps.deckhands >= 0 && df.caps.deckhands <= 5 ? [] : ["defaults.caps.deckhands: 0 to 5"]),
      ...L.validateMinCrew(df.minCrew),
    ]);
    await db.doc(P.settings).set(next);
    await core.logAdmin(w, { action: "settings", title: "Scream Planner settings", changes: { deadlines: { before: cur.deadlines, after: next.deadlines }, defaults: { before: cur.defaults, after: next.defaults } } });
    return { ok: true, settings: next };
  });

  // ---------------------------------------------------------------------------------------------
  // patterns and exceptions (owner, admins)
  // ---------------------------------------------------------------------------------------------
  const cleanPattern = (d) => {
    const p = {
      label: core.text(d.label, 60, { min: 1, field: "label" }), icon: typeof d.icon === "string" ? d.icon.trim().slice(0, 16) : null,
      dow: d.dow, start: d.start, end: d.end, type: d.type || "platform",
      audience: (d.type || "platform") === "backstage" ? "fanClub" : "public",
      gameCount: d.gameCount ?? null, tagHints: (d.tagHints || []).map((x) => String(x).trim()).filter(Boolean), gameHints: (d.gameHints || []).map((x) => String(x).trim()).filter(Boolean),
      active: d.active !== false, order: Number.isInteger(d.order) ? d.order : 0,
    };
    if ((d.type || "platform") === "platform") p.platforms = Array.isArray(d.platforms) ? d.platforms : ["twitch", "youtube", "tiktok"];
    if (d.rooms != null) p.rooms = d.rooms;
    if (d.minCrew != null) p.minCrew = d.minCrew;
    if (d.caps != null) p.caps = d.caps;
    return p;
  };
  /** A pattern may not overlap another active pattern (checked over two reference weeks so Sunday night spills into Monday). */
  async function patternClash(p, id, tz) {
    const all = (await db.collection(P.patterns).get()).docs.map((x) => ({ id: x.id, ...x.data() })).filter((x) => x.id !== id && x.active !== false);
    if (p.active === false) return null;
    const w0 = L.nextWeek(L.weekOf(Date.now(), tz)), w1 = L.nextWeek(w0);
    const slotsOf = (list) => [w0, w1].flatMap((w) => L.expandWeek({ week: w, patterns: list, exceptions: [], tz }).slots.map((s) => ({ id: s.patternId, startMs: s.startMs, endMs: s.endMs })));
    const mine = slotsOf([{ ...p, id: id || "_new" }]).filter((s) => s.id === (id || "_new"));
    const theirs = slotsOf(all);
    for (const m of mine) { const c = theirs.find((t) => L.overlaps(m, t)); if (c) return c.id; }
    return null;
  }

  const patternSave = onCall(async (request) => {
    const w = await admin(request);
    const tz = await core.siteTz();
    const d = request.data || {};
    const id = typeof d.id === "string" && d.id ? d.id : null;
    const p = cleanPattern(d);
    errs(L.validatePattern(p));
    const before = id ? await db.doc(`${P.patterns}/${id}`).get() : null;
    if (id && !before.exists) throw fail("not-found", "That pattern doesn't exist.", "noPattern");
    const clash = await patternClash(p, id, tz);
    if (clash) throw fail("failed-precondition", "That overlaps another pattern in the usual week.", "overlap", { with: clash });
    const pid = id || newId(P.patterns);
    await db.doc(`${P.patterns}/${pid}`).set({ ...p, updatedAt: FieldValue.serverTimestamp(), ...(id ? {} : { createdAt: FieldValue.serverTimestamp() }) }, { merge: !!id });
    if (id) for (const k of ["rooms", "minCrew", "caps", "platforms"]) if (p[k] === undefined && before.get(k) !== undefined) await db.doc(`${P.patterns}/${pid}`).update({ [k]: FieldValue.delete() });
    await core.rebuildUsualWeek();     // editing a pattern never changes weeks already opened (section 4a)
    await core.logAdmin(w, { action: "pattern", path: `${P.patterns}/${pid}`, title: p.label, changes: before ? { pattern: { before: before.data(), after: p } } : undefined, details: { created: !id } });
    return { ok: true, id: pid };
  });
  const patternDelete = onCall(async (request) => {
    const w = await admin(request);
    const id = request.data?.id;
    if (typeof id !== "string" || !id) throw fail("invalid-argument", "id is required.", "args");
    const ref = db.doc(`${P.patterns}/${id}`), snap = await ref.get();
    if (!snap.exists) throw fail("not-found", "That pattern doesn't exist.", "noPattern");
    await ref.delete();
    await core.rebuildUsualWeek();
    await core.logAdmin(w, { action: "pattern", path: `${P.patterns}/${id}`, title: snap.get("label"), details: { deleted: true } });
    return { ok: true };
  });

  const exceptionSave = onCall(async (request) => {
    const w = await admin(request);
    const d = request.data || {};
    const id = typeof d.id === "string" && d.id ? d.id : null;
    const e = { kind: d.kind, from: d.from, to: d.to || d.from, label: core.text(d.label, 60, { min: 1, field: "label" }), public: d.public !== false, ...(d.kind === "skipPattern" ? { patternIds: d.patternIds } : {}) };
    errs(L.validateException(e));
    if (id && !(await db.doc(`${P.exceptions}/${id}`).get()).exists) throw fail("not-found", "That exception doesn't exist.", "noException");
    const eid = id || newId(P.exceptions);
    await db.doc(`${P.exceptions}/${eid}`).set({ ...e, updatedAt: FieldValue.serverTimestamp(), ...(id ? {} : { createdAt: FieldValue.serverTimestamp() }) });
    await core.rebuildUsualWeek();
    await core.logAdmin(w, { action: "exception", path: `${P.exceptions}/${eid}`, title: e.label, details: { kind: e.kind, from: e.from, to: e.to, created: !id } });
    return { ok: true, id: eid };
  });
  const exceptionDelete = onCall(async (request) => {
    const w = await admin(request);
    const id = request.data?.id;
    if (typeof id !== "string" || !id) throw fail("invalid-argument", "id is required.", "args");
    const ref = db.doc(`${P.exceptions}/${id}`), snap = await ref.get();
    if (!snap.exists) throw fail("not-found", "That exception doesn't exist.", "noException");
    await ref.delete();
    await core.rebuildUsualWeek();
    await core.logAdmin(w, { action: "exception", path: `${P.exceptions}/${id}`, title: snap.get("label"), details: { deleted: true } });
    return { ok: true };
  });

  // ---------------------------------------------------------------------------------------------
  // opening a week: the streams from the usual week, the ballot, the crew's prefilled availability
  // ---------------------------------------------------------------------------------------------
  /** A planned stream's full working copy from a slot (draft shape; uids live only in the crew seats). */
  function newDraft(slot, { week, slug, title }) {
    return {
      state: "planned", published: false, hasUnpublishedChanges: false, adhoc: false, rev: 0,
      week, slug, tz: slot.tz, title: title || slot.theme?.label || "Stream", description: "",
      plannedStart: ts(slot.startMs), plannedEnd: ts(slot.endMs),
      type: slot.type, audience: slot.audience, platforms: slot.platforms, plannedGameCount: slot.plannedGameCount,
      ...(slot.theme ? { theme: slot.theme } : {}), rooms: slot.rooms, minCrew: slot.minCrew, caps: slot.caps,
      crew: L.emptyCrew(slot.rooms, slot.caps), plannedGames: [], plannedGameIds: [], createdAt: FieldValue.serverTimestamp(),
    };
  }
  async function freeSlug(startMs, tz, week) {
    const taken = (await core.streamsOfWeek(week)).map((s) => s.slug);
    return ST.streamSlug(startMs, tz, taken);
  }

  /** The ballot a week opens with: top Most wanted wishlist games plus every playing game (section 4e). */
  async function seedBallot(week, settings, mark = null) {
    const snap = await db.collection(P.games).where("hidden", "==", false).get();
    const games = snap.docs.map((d) => ({ slug: d.id, status: d.get("status"), hidden: d.get("hidden") === true, wantedCount: d.get("wantedCount") || 0, addedMs: ms(d.get("createdAt")) || 0 }));
    const seeded = L.seedBallot({ games, seed: settings.defaults.ballotSeed });
    for (const s of seeded) await db.doc(`${P.ballot(week)}/${s.slug}`).set({ votes: 0, seededFrom: s.seededFrom, addedBy: null, ...(mark || {}), createdAt: FieldValue.serverTimestamp() });
    return seeded.map((s) => s.slug);
  }
  /** Crew prefilled from their usual availability: the day is in their list -> yes, else no (prefilled: true until touched). */
  async function prefillSignups(streams, mark = null) {
    const roster = (await db.collection(P.rosterCol).get()).docs.filter((d) => ["active", "checkIn"].includes(d.get("status")));
    for (const r of roster) {
      const days = r.get("availability")?.days || [];
      if (!days.length) continue;
      for (const s of streams) {
        const dow = L.localParts(ms(s.draft.plannedStart), s.draft.tz).dow;
        await db.doc(P.signup(s.id, r.id)).set({ availability: days.includes(DAYS[dow - 1]) ? "yes" : "no", prefilled: true, seats: [], gameRequest: null, handle: r.get("handle") || null, grade: r.get("grade") ?? null, track: r.get("track") || "mod", ...(mark || {}), updatedAt: FieldValue.serverTimestamp() });
      }
    }
  }

  /**
   * Creates planWeeks/{week} from the usual week minus exceptions. Called by the owner's weekOpen and by plannerTick.
   * `manual` opens early: a close time already in the past becomes 24 hours from now.
   * Returns { created: false } when the week already exists (so a repeat tick is harmless).
   * `source` ({ patterns, exceptions }) replaces the stored usual week and `mark` ({ test: true }) is stamped on every
   * document created; both are for scripts/make-test-week.js only.
   */
  async function openWeek(week, { w = null, manual = false, nowMs = Date.now(), source = null, mark = null, adopt = false } = {}) {
    const tz = await core.siteTz(), settings = await core.loadSettings();
    const ref = db.doc(P.week(week));
    const have = await ref.get();
    // adopt (make-test-week.js only): fill an existing, empty, unpublished week instead of creating one; the week keeps its own
    // dates and state, and remembers what it had so --remove can put it back.
    if (have.exists && !(adopt && have.get("state") !== "published" && !(have.get("streamIds") || []).length && !have.get("weekOff"))) return { created: false };
    const dl = L.weekDeadlines(week, settings.deadlines, tz);
    const [pats, exs] = source ? [null, null] : await Promise.all([db.collection(P.patterns).get(), db.collection(P.exceptions).get()]);
    const exp = L.expandWeek({ week, patterns: source ? source.patterns : pats.docs.map((d) => ({ id: d.id, ...d.data() })), exceptions: source ? source.exceptions || [] : exs.docs.map((d) => ({ id: d.id, ...d.data() })), tz, defaults: settings.defaults });
    let closesAt = dl.closesAt;
    if (manual && closesAt <= nowMs) closesAt = nowMs + DAY_MS;
    const state = L.stateAt(nowMs, { closesAt });
    try {
      if (have.exists) await ref.update({ adoptedTest: { prevBallotSlugs: have.get("ballotSlugs") || [], prevState: have.get("state"), prevClosesAt: have.get("closesAt") || null } });
      else await ref.create({ week, state, opensAt: ts(manual ? nowMs : dl.opensAt), closesAt: ts(closesAt), publishBy: ts(dl.publishBy), publishedAt: null, publishedRev: 0, hasUnpublishedChanges: false, weekOff: exp.weekOff, hero: null, streamIds: [], ballotSlugs: [], counts: { slots: 0, seatsOpen: 0, votes: 0 }, tz, ...(mark || {}), createdAt: FieldValue.serverTimestamp() });
    } catch (err) { if (err.code === 6 || /ALREADY_EXISTS/.test(String(err.message))) return { created: false }; throw err; }
    const made = [];
    for (const slot of exp.slots) {
      const id = newId(P.streams);
      const draft = newDraft(slot, { week, slug: await freeSlug(slot.startMs, tz, week) });
      await core.saveDraft(id, { ...draft, ...(mark || {}) });
      made.push({ id, draft });
    }
    await prefillSignups(made, mark);
    const ballotSlugs = exp.weekOff ? [] : await seedBallot(week, settings, mark);
    await ref.update({ streamIds: made.map((m) => m.id).sort(), ballotSlugs });
    await core.refreshCounts(week);
    await core.rebuildPublicBallot();
    await core.rebuildSchedule();
    await core.logAdmin(w, { action: "slot", path: P.week(week), title: week, details: { opened: true, manual, streams: made.length, weekOff: exp.weekOff ? exp.weekOff.label : null, ballot: ballotSlugs.length } });
    return { created: true, streams: made.length, weekOff: exp.weekOff };
  }

  const weekOpen = onCall(async (request) => {
    const w = await owner(request);
    const tz = await core.siteTz();
    const week = request.data?.week || L.targetWeekAt(Date.now(), tz);
    if (!L.isWeekId(week)) throw fail("invalid-argument", "week must look like 2026-W43.", "args");
    if (week <= L.weekOf(Date.now(), tz)) throw fail("failed-precondition", "Only a coming week can be opened.", "pastWeek");
    const r = await openWeek(week, { w, manual: true });
    if (!r.created) throw fail("already-exists", "That week is already open.", "exists");
    return { ok: true, week, ...r };
  });

  const weekReopen = onCall(async (request) => {
    const w = await owner(request);
    const week = await core.loadWeek(request.data?.week);
    if (week.weekOff) throw fail("failed-precondition", "A week off has no voting.", "weekOff");
    if (week.state === "published") throw fail("failed-precondition", "That week is published.", "published");
    const now = Date.now();
    const closesAtMs = Number.isFinite(request.data?.closesAt) ? request.data.closesAt : now + DAY_MS;
    if (closesAtMs <= now) throw fail("invalid-argument", "The new close time must be in the future.", "closeInPast");
    await db.doc(P.week(week.id)).update({ state: "open", closesAt: ts(closesAtMs) });
    await core.rebuildPublicBallot();
    await core.rebuildSchedule();
    await core.logAdmin(w, { action: "reopen", path: P.week(week.id), title: week.id, changes: { closesAt: { before: ms(week.closesAt), after: closesAtMs }, state: { before: week.state, after: "open" } } });
    return { ok: true, week: week.id, closesAt: closesAtMs };
  });

  /** Closes an open week whose close time has passed (plannerTick). */
  async function closeWeek(week) {
    await db.doc(P.week(week)).update({ state: "closed" });
    await core.rebuildPublicBallot();
    await core.rebuildSchedule();
  }

  // ---------------------------------------------------------------------------------------------
  // planSlot: create, edit or remove a planned slot (the draft)
  // ---------------------------------------------------------------------------------------------
  function slotTimes(d, tz) {
    if (typeof d.date === "string" && L.isTime(d.start) && L.isTime(d.end)) {
      if (!L.isDate(d.date)) throw fail("invalid-argument", "date must be YYYY-MM-DD.", "args");
      return { startMs: L.zonedToUtc(d.date, d.start, tz), endMs: L.zonedToUtc(d.end <= d.start ? L.addDays(d.date, 1) : d.date, d.end, tz) };
    }
    if (Number.isFinite(d.startMs) && Number.isFinite(d.endMs)) return { startMs: d.startMs, endMs: d.endMs };
    throw fail("invalid-argument", "Give a local date, start and end (or startMs and endMs).", "args");
  }

  const planSlot = onCall(async (request) => {
    const w = await admin(request);
    const d = request.data || {};
    const tz = await core.siteTz();
    const week = await core.loadWeek(d.week);
    const siblings = await core.draftsOfWeek(week.id);

    if (d.remove) {
      const { id, top, draft } = await core.loadStream(d.streamId);
      if (draft.published === true || top.state !== "planned") throw fail("failed-precondition", "A published slot is cancelled, not removed.", "cancelInstead");
      for (const s of (await db.collection(P.signups(id)).get()).docs) await s.ref.delete();
      await db.doc(P.draft(id)).delete(); await db.doc(P.stream(id)).delete();
      await core.refreshCounts(week.id);
      await core.logAdmin(w, { action: "slot", path: P.stream(id), title: draft.title, details: { removed: true, week: week.id } });
      return { ok: true, removed: id };
    }

    const existing = d.streamId ? await core.loadStream(d.streamId) : null;
    if (existing && existing.draft.week !== week.id) throw fail("invalid-argument", "That stream is in another week.", "wrongWeek");
    if (existing && !["planned", "scheduled"].includes(existing.draft.state)) throw fail("failed-precondition", "That stream can't be edited any more.", "badState");
    const cur = existing ? existing.draft : null;
    const dflt = (await core.loadSettings()).defaults;
    const times = d.date || d.startMs != null ? slotTimes(d, tz) : cur ? { startMs: ms(cur.plannedStart), endMs: ms(cur.plannedEnd) } : (() => { throw fail("invalid-argument", "A new slot needs a date, start and end.", "args"); })();
    const type = d.type || cur?.type || "platform";
    const rooms = type === "backstage" ? [] : (d.rooms ?? cur?.rooms ?? dflt.rooms);
    const slot = {
      ...times, type, audience: type === "backstage" ? "fanClub" : "public", rooms, platforms: L.platformsForRooms(rooms),
      plannedGameCount: d.plannedGameCount ?? cur?.plannedGameCount ?? dflt.gameCount,
      minCrew: d.minCrew ?? cur?.minCrew ?? (type === "backstage" ? { captain: false, rooms: [] } : dflt.minCrew),
      caps: d.caps ?? cur?.caps ?? dflt.caps, tz,
      theme: d.theme === null ? null : d.theme ? { patternId: d.theme.patternId || null, label: String(d.theme.label || "").trim(), icon: d.theme.icon || null, tagHints: d.theme.tagHints || [], gameHints: d.theme.gameHints || [] } : cur?.theme || null,
    };
    errs(L.validateSlot(slot));
    const b = L.weekBounds(week.id, tz);
    if (slot.startMs < b.startMs || slot.startMs >= b.endMs) throw fail("invalid-argument", "A slot belongs to the week it starts in.", "outsideWeek");
    const clash = L.overlapsWith(slot, siblings, existing?.id);
    if (clash.length) throw fail("failed-precondition", "That overlaps another stream.", "overlap", { with: clash[0].id });
    if (existing && slot.plannedGameCount < (cur.plannedGames || []).length) throw fail("failed-precondition", "Remove a planned game first.", "tooManyGames");

    let id, draft;
    if (!existing) {
      id = newId(P.streams);
      draft = newDraft(slot, { week: week.id, slug: await freeSlug(slot.startMs, tz, week.id), title: typeof d.title === "string" && d.title.trim() ? d.title.trim().slice(0, 120) : undefined });
    } else {
      id = existing.id;
      let crewNow = cur.crew;
      const dropped = L.ROOMS.filter((r) => cur.rooms.includes(r) && !rooms.includes(r));
      // Rooms taken off the stream release their seats (their sign-ups are marked dropped below).
      const released = [];
      for (const r of dropped) {
        const c = crewNow.chats?.[r];
        for (const u of [c?.lead?.uid, ...(c?.deckhands || []).map((x) => x.uid)].filter(Boolean)) released.push({ uid: u, room: r });
      }
      const chats = Object.fromEntries(Object.entries(crewNow.chats || {}).filter(([r]) => rooms.includes(r)));
      for (const r of rooms) if (!chats[r]) chats[r] = { lead: null, deckhands: [] };
      crewNow = { ...crewNow, chats, caps: { ...(crewNow.caps || {}), ...slot.caps } };
      for (const x of released) await dropSeatInSignup(id, x.uid, { room: x.room }, "roomRemoved");
      draft = {
        ...cur, plannedStart: ts(slot.startMs), plannedEnd: ts(slot.endMs), type: slot.type, audience: slot.audience, platforms: slot.platforms, rooms, plannedGameCount: slot.plannedGameCount,
        minCrew: slot.minCrew, caps: slot.caps, crew: crewNow, ...(slot.theme ? { theme: slot.theme } : {}),
        title: typeof d.title === "string" && d.title.trim() ? d.title.trim().slice(0, 120) : cur.title,
        ...(cur.published === true ? { hasUnpublishedChanges: true } : {}),
      };
      if (!slot.theme) delete draft.theme;
    }
    await core.saveDraft(id, draft, draft.published === true ? { fields: ["hasUnpublishedChanges"], alsoPublic: true } : {});
    if (draft.published === true) await db.doc(P.week(week.id)).update({ hasUnpublishedChanges: true });
    await core.refreshCounts(week.id);
    await core.logAdmin(w, { action: "slot", path: P.stream(id), title: draft.title, details: { week: week.id, created: !existing } });
    return { ok: true, streamId: id, slug: draft.slug };
  });

  /** Marks a person's seat in their sign-up dropped (the seat itself is already out of the crew). */
  async function dropSeatInSignup(streamId, uid, match, why) {
    const ref = db.doc(P.signup(streamId, uid)), snap = await ref.get();
    if (!snap.exists) return;
    const seats = (snap.get("seats") || []).map((s) => (s.room === match.room && (!match.role || s.role === match.role) && ["requested", "confirmed"].includes(s.status) ? { ...s, status: "dropped", why } : s));
    await ref.update({ seats, updatedAt: FieldValue.serverTimestamp() });
  }

  // ---------------------------------------------------------------------------------------------
  // planGames: set a slot's planned games and their order. The server decides each game's source.
  // ---------------------------------------------------------------------------------------------
  const planGames = onCall(async (request) => {
    const w = await admin(request);
    const d = request.data || {};
    const { id, draft } = await core.loadStream(d.streamId);
    if (!["planned", "scheduled"].includes(draft.state)) throw fail("failed-precondition", "That stream can't be edited any more.", "badState");
    const slugs = Array.isArray(d.slugs) ? d.slugs : (Array.isArray(d.games) ? d.games.map((g) => g.slug) : null);
    if (!slugs || slugs.some((s) => typeof s !== "string" || !s) || new Set(slugs).size !== slugs.length) throw fail("invalid-argument", "slugs must be a list of different games.", "args");
    if (slugs.length > draft.plannedGameCount) throw fail("failed-precondition", `This slot holds ${draft.plannedGameCount} game${draft.plannedGameCount === 1 ? "" : "s"}.`, "tooManyGames", { max: draft.plannedGameCount });
    const games = await core.getAll(slugs.map((s) => db.doc(`${P.games}/${s}`)));
    games.forEach((g, i) => { if (!g.exists || g.get("hidden") === true) throw fail("not-found", "That game isn't in the Vault.", "noGame", { slug: slugs[i] }); });
    const signups = (await db.collection(P.signups(id)).get()).docs;
    const ballot = new Map((await db.collection(P.ballot(draft.week)).get()).docs.map((x) => [x.id, x.data()]));
    const prev = new Map((draft.plannedGames || []).map((g) => [g.gameId, g]));
    const requested = new Map();
    for (const s of signups) { const r = s.get("gameRequest"); if (r && ["open", "planned"].includes(r.status)) requested.set(r.gameSlug, { uid: s.id, handle: s.get("handle") }); }
    const plannedGames = slugs.map((slug, order) => {
      const req = requested.get(slug), bal = ballot.get(slug), old = prev.get(slug);
      const source = req ? { kind: "modRequest", byHandle: req.handle || "Deleted member" } : bal && (bal.votes || 0) > 0 ? { kind: "ballot", votes: bal.votes } : old?.source || { kind: "owner" };
      return { gameId: slug, title: games[order].get("title"), order, source, outcome: null };
    });
    errs(ST.validateStream({ state: "planned", plannedGames }));
    // The mods whose request was planned get the heads-up (status planned); a request left out goes back to open.
    for (const s of signups) {
      const r = s.get("gameRequest");
      if (!r) continue;
      const status = slugs.includes(r.gameSlug) ? "planned" : r.status === "planned" ? "open" : r.status;
      if (status !== r.status) await s.ref.update({ gameRequest: { ...r, status }, updatedAt: FieldValue.serverTimestamp() });
    }
    const next = { ...draft, plannedGames, plannedGameIds: slugs, ...(draft.published === true ? { hasUnpublishedChanges: true } : {}) };
    await core.saveDraft(id, next, draft.published === true ? { alsoPublic: true, fields: ["hasUnpublishedChanges"] } : {});
    if (draft.published === true) await db.doc(P.week(draft.week)).update({ hasUnpublishedChanges: true });
    await core.logAdmin(w, { action: "games", path: P.stream(id), title: draft.title, details: { week: draft.week, games: slugs } });
    return { ok: true, plannedGames: plannedGames.map((g) => ({ gameId: g.gameId, order: g.order, source: g.source })) };
  });

  // ---------------------------------------------------------------------------------------------
  // planTray (owner, admins): the four-group tray for one slot (section 5). The ordering is pure logic in logic.js.
  // ---------------------------------------------------------------------------------------------
  const ROOM_NAMES = { twitch: "Twitch", ytLandscape: "YouTube landscape", ytVertical: "YouTube vertical", tiktok: "TikTok" };
  const seatLabel = (s) => `${s.role === "captain" ? "Captain" : `${ROOM_NAMES[s.room]} ${s.role === "lead" ? "lead" : "deckhand"}`}, ${s.status}`;
  const TRAY_PICKS_MAX = 60;
  const planTray = onCall(async (request) => {
    await admin(request);
    const tz = await core.siteTz();
    const { id, draft } = await core.loadStream(request.data?.streamId);
    const [signups, ballotRows, vaultSnap, weekStreams] = await Promise.all([db.collection(P.signups(id)).get(), db.collection(P.ballot(draft.week)).get(), db.collection(P.games).where("hidden", "==", false).get(), core.draftsOfWeek(draft.week)]);
    const vault = vaultSnap.docs.map((g) => ({ slug: g.id, title: g.get("title"), sortTitle: g.get("sortTitle"), status: g.get("status"), hidden: false, tags: [...(g.get("tags")?.auto || []), ...(g.get("tags")?.boomer || [])], wanted: g.get("wantedCount") || 0 }));
    const wanted = new Map(vault.map((g) => [g.slug, g.wanted]));
    const requests = signups.docs.filter((x) => x.get("gameRequest")).map((x) => {
      const r = x.get("gameRequest"), seat = (x.get("seats") || []).find((t) => ["requested", "confirmed"].includes(t.status));
      return { uid: x.id, handle: x.get("handle"), grade: x.get("grade"), seat: seat ? seatLabel(seat) : null, gameSlug: r.gameSlug, note: r.note, status: r.status };
    });
    const ballot = ballotRows.docs.map((b) => ({ slug: b.id, votes: b.get("votes") || 0, wanted: wanted.get(b.id) || 0, lastVoteMs: ms(b.get("lastVoteAt")) || 0 }));
    const groups = L.trayGroups({ slot: { id, theme: draft.theme || null, plannedGameIds: draft.plannedGameIds || [] }, requests, ballot, vault, weekStreams, tz });
    const picks = groups.find((g) => g.id === "picks");
    picks.more = Math.max(0, picks.items.length - TRAY_PICKS_MAX);
    picks.items = picks.items.slice(0, TRAY_PICKS_MAX);
    return { ok: true, streamId: id, plannedGameCount: draft.plannedGameCount, groups };
  });

  // ---------------------------------------------------------------------------------------------
  // publishWeek (owner): "Publish week" and "Publish changes"
  // ---------------------------------------------------------------------------------------------
  /** What viewers would notice about a stream: if it differs from the published copy it counts as changed. */
  const fingerprint = (s) => JSON.stringify([ms(s.plannedStart), ms(s.plannedEnd), s.plannedGameIds || [], s.theme?.label || null, s.type, s.audience, s.rooms, s.title]);

  const publishWeek = onCall(async (request) => {
    const w = await owner(request);
    const d = request.data || {};
    const tz = await core.siteTz();
    const week = await core.loadWeek(d.week);
    const now = Date.now();
    const streams = await core.streamsOfWeek(week.id);
    const drafts = await core.draftsOfWeek(week.id);
    const live = drafts.filter((s) => s.state !== "cancelled");
    const warnings = L.publishWarnings(live, tz);
    const blocking = warnings.filter((x) => x.kind === "overlap");

    // The hero: chosen at publish (section 13). Default is the previous week's choice; "surprise" rolls from the pool.
    const allWeeks = (await db.collection(P.weeks).get()).docs.filter((x) => x.id < week.id && x.get("hero")).sort((a, b) => b.id.localeCompare(a.id));
    const recentFrames = allWeeks.map((x) => x.get("hero").frame);
    const fallback = week.hero || L.defaultHero(allWeeks[0]?.get("hero"));
    const frame = d.hero?.frame === "surprise" ? L.rollFrame(recentFrames) : d.hero?.frame || fallback.frame;
    const doors = d.hero?.doors === "surprise" ? L.rollDoors() : d.hero?.doors || fallback.doors;
    const hero = { frame, doors };
    errs(L.validateHero(hero), "hero");

    if (d.check === true) return { ok: true, check: true, warnings, hero: fallback, recentFrames: recentFrames.slice(0, L.FRAME_NO_REPEAT_WEEKS), poolFrames: L.FRAME_POOL, seasonalFrames: L.FRAMES_SEASONAL, doorStyles: L.DOOR_STYLES, state: week.state, publishedRev: week.publishedRev || 0 };
    if (blocking.length) throw fail("failed-precondition", "Two streams overlap.", "overlap", { warnings: blocking });
    const first = week.state !== "published";
    const heroChanged = !week.hero || week.hero.frame !== hero.frame || week.hero.doors !== hero.doors;
    if (!first && week.hasUnpublishedChanges !== true && !heroChanged && !d.force) throw fail("failed-precondition", "Nothing has changed since the last publish.", "nothingToPublish");

    // Copy each draft into the public doc.
    const changedIds = [];
    let published = 0;
    for (const dr of drafts) {
      if (dr.state === "cancelled" && dr.published !== true) continue;          // never-published cancelled slot: nothing to show
      const top = streams.find((s) => s.id === dr.id);
      const isNew = top.published !== true;
      if (!isNew && fingerprint(top) !== fingerprint(dr)) changedIds.push(dr.id);
      if (isNew && dr.state !== "cancelled") changedIds.push(dr.id);
      const next = { ...dr, state: dr.state === "planned" ? "scheduled" : dr.state, published: true, hasUnpublishedChanges: false, rev: (dr.rev || 0) + 1 };
      await core.saveDraft(dr.id, next, { alsoPublic: true });
      if (dr.state !== "cancelled") published++;
    }
    const rev = (week.publishedRev || 0) + 1;
    const patch = { state: "published", publishedAt: Timestamp.fromMillis(now), publishedRev: rev, hasUnpublishedChanges: false, hero, ballotSlugs: [], ...(first ? { earlySignupUntil: Timestamp.fromMillis(now + 48 * 3600000) } : {}), ...(ms(week.closesAt) > now ? { closesAt: Timestamp.fromMillis(now), closedEarly: true } : {}) };
    await db.doc(P.week(week.id)).update(patch);
    await db.doc(`${P.site}/planner/main/todos/publish_${week.id}`).delete().catch(() => {});
    await core.refreshCounts(week.id);
    await core.rebuildPublicBallot();
    await core.rebuildSchedule();
    if (changedIds.length) await core.outbox({ id: `week-published_${week.id}_${rev}`, type: "week-published", audience: "members", week: week.id, payload: { title: first ? L.weekPublishedSummary(published) : "The schedule changed", count: changedIds.length, streamIds: changedIds, link: "/schedule", revision: rev } });
    if (first && !week.weekOff) await core.activity("week-published", L.weekPublishedSummary(published), { week: week.id });
    await core.logAdmin(w, { action: "publish", path: P.week(week.id), title: week.id, details: { rev, first, streams: published, changed: changedIds.length, hero, warnings: warnings.length, closedEarly: ms(week.closesAt) > now } });
    return { ok: true, week: week.id, publishedRev: rev, published, changed: changedIds.length, hero, warnings, earlySignupUntil: first ? now + 48 * 3600000 : ms(week.earlySignupUntil) };
  });

  // ---------------------------------------------------------------------------------------------
  // delayStream / cancelStream (owner, A2+ admins): only before actualStart; take effect at once
  // ---------------------------------------------------------------------------------------------
  const mayMove = (w) => { if (!L.canDelayOrCancel(w)) throw fail("permission-denied", "Only the owner and Overseers can delay or cancel a stream.", "notAllowed"); };
  const toStamps = (patch) => {
    const out = { ...patch };
    if (patch.plannedStart != null) { out.plannedStart = ts(patch.plannedStart); out.plannedEnd = ts(patch.plannedEnd); }
    if (patch.delay) { const { atMs, originalStart, originalEnd, ...rest } = patch.delay; out.delay = { ...rest, originalStart: ts(originalStart), originalEnd: ts(originalEnd), at: ts(atMs) }; }
    if (patch.cancel) { const { atMs, ...rest } = patch.cancel; out.cancel = { ...rest, at: ts(atMs) }; }
    return out;
  };
  /** The uids with a confirmed seat or a requested one, for the crew's notes. */
  const crewOf = (draft) => L.crewUids(draft.crew);

  // Control Room unscheduled streams (createAdhocStream: scheduled, adhoc, published, no planner draft) are moved and cancelled on the
  // public stream doc itself. A stream WITH a draft (every planned one) never takes this path.
  async function adhocTop(streamId) {
    if (typeof streamId !== "string" || !streamId || streamId.includes("/")) return null;
    const [top, dr] = await Promise.all([db.doc(P.stream(streamId)).get(), db.doc(P.draft(streamId)).get()]);
    return top.exists && top.get("adhoc") === true && !dr.exists ? { id: streamId, ...top.data() } : null;
  }
  async function adhocDelay(w, stream, d, tz) {
    const startMs = Number.isFinite(d.startMs) ? d.startMs : (d.date && d.start ? L.zonedToUtc(d.date, d.start, tz) : null);
    const endMs = Number.isFinite(d.endMs) ? d.endMs : (d.date && d.end ? L.zonedToUtc(d.end <= d.start ? L.addDays(d.date, 1) : d.date, d.end, tz) : null);
    const reason = typeof d.reason === "string" ? d.reason.trim() : "";
    const newWeek = Number.isFinite(startMs) ? ST.streamWeek(startMs, tz) : stream.week;
    const others = await core.streamsOfWeek(newWeek);
    const r = L.planDelay(stream, { startMs, endMs, reason, atMs: Date.now(), by: w.name }, others);
    if (!r.ok) throw fail("failed-precondition", delayMessage(r.reason), r.reason, r.with ? { with: r.with } : {});
    const stamped = toStamps(r.patch);
    await db.doc(P.stream(stream.id)).update({ ...stamped, week: newWeek, rev: (stream.rev || 0) + 1, updatedAt: FieldValue.serverTimestamp() });
    const summary = L.delayedSummary(r.patch, Date.now(), tz);
    await core.outbox({ type: "stream-delayed", audience: "members", streamId: stream.id, week: newWeek, payload: { title: summary, newStart: r.patch.plannedStart, newEnd: r.patch.plannedEnd, originalStart: r.patch.delay.originalStart, reason: reason || null, link: "/schedule" } });
    await core.activity("stream-delayed", summary, { streamId: stream.id });
    await core.logAdmin(w, { action: "delay", path: P.stream(stream.id), title: stream.title, reason, details: { week: newWeek, adhoc: true, from: ms(stream.plannedStart), to: r.patch.plannedStart, count: stamped.delay.count } });
    return { ok: true, streamId: stream.id, plannedStart: r.patch.plannedStart, plannedEnd: r.patch.plannedEnd, delayCount: stamped.delay.count };
  }
  async function adhocCancel(w, stream, d, tz) {
    const reason = typeof d.reason === "string" ? d.reason.trim() : "";
    const r = L.planCancel(stream, { reason, atMs: Date.now(), by: w.name });
    if (!r.ok) throw fail("failed-precondition", delayMessage(r.reason), r.reason);
    await db.doc(P.stream(stream.id)).update({ ...toStamps(r.patch), hasUnpublishedChanges: false, rev: (stream.rev || 0) + 1, updatedAt: FieldValue.serverTimestamp() });   // stays as a record
    const title = `${stream.title || "A stream"} on ${L.dayLabel(ms(stream.plannedStart), tz)} is cancelled`;
    await core.outbox({ type: "stream-cancelled", audience: "members", streamId: stream.id, week: stream.week || null, payload: { title, reason: reason || null, start: ms(stream.plannedStart), link: "/schedule" } });
    await core.activity("stream-cancelled", title, { streamId: stream.id });
    if (stream.week) await core.refreshCounts(stream.week);
    await core.logAdmin(w, { action: "cancel", path: P.stream(stream.id), title: stream.title, reason, details: { week: stream.week || null, adhoc: true } });
    return { ok: true, streamId: stream.id, state: "cancelled" };
  }

  const delayStream = onCall(async (request) => {
    const w = await core.whoPlus(core.requireAuth(request));
    mayMove(w);
    const d = request.data || {};
    const tz = await core.siteTz();
    const ad = await adhocTop(d.streamId);
    if (ad) return adhocDelay(w, ad, d, tz);
    const { id, top, draft } = await core.loadStream(d.streamId);
    const week = await core.loadWeek(draft.week);
    const startMs = Number.isFinite(d.startMs) ? d.startMs : (d.date && d.start ? L.zonedToUtc(d.date, d.start, tz) : null);
    const endMs = Number.isFinite(d.endMs) ? d.endMs : (d.date && d.end ? L.zonedToUtc(d.end <= d.start ? L.addDays(d.date, 1) : d.date, d.end, tz) : null);
    const others = await core.draftsOfWeek(draft.week);
    const reason = typeof d.reason === "string" ? d.reason.trim() : "";
    const r = L.planDelay({ id, ...draft, state: draft.state, actualStart: top.actualStart ?? draft.actualStart ?? null }, { startMs, endMs, reason, atMs: Date.now(), by: w.name }, others);
    if (!r.ok) throw fail("failed-precondition", delayMessage(r.reason), r.reason, r.with ? { with: r.with } : {});
    const b = L.weekBounds(draft.week, tz);
    if (r.patch.plannedStart < b.startMs || r.patch.plannedStart >= b.endMs) throw fail("invalid-argument", "A stream stays in its week.", "outsideWeek");
    const stamped = toStamps(r.patch);
    const next = { ...draft, ...stamped, rev: (draft.rev || 0) + 1 };
    await core.saveDraft(id, next, { alsoPublic: true, fields: ["plannedStart", "plannedEnd", "delay", "rev"] });
    if (swap) await swap.closeForStream(id, { title: draft.title, actor: w, why: "delay" });   // open swaps close with no effect on anyone's record
    // Crew seats stay; each person with a seat is asked "Still on for the new time?" (keep or drop, no reliability hit).
    for (const uid of crewOf(draft)) await db.doc(P.signup(id, uid)).set({ reconfirm: { count: stamped.delay.count, needed: true } }, { merge: true });
    const pub = draft.published === true && draft.state === "scheduled";
    if (pub) {
      const summary = L.delayedSummary(r.patch, Date.now(), tz);
      await core.outbox({ type: "stream-delayed", audience: "members", streamId: id, week: draft.week, payload: { title: summary, newStart: r.patch.plannedStart, newEnd: r.patch.plannedEnd, originalStart: r.patch.delay.originalStart, reason: reason || null, link: "/schedule" } });
      await core.outbox({ type: "stream-delayed", audience: "uids", uids: crewOf(draft), streamId: id, week: draft.week, payload: { title: "Still on for the new time?", newStart: r.patch.plannedStart, newEnd: r.patch.plannedEnd, reason: reason || null, link: "/schedule/plan", ask: "keepOrDrop" } });
      await core.activity("stream-delayed", summary, { streamId: id });
    }
    await core.logAdmin(w, { action: "delay", path: P.stream(id), title: draft.title, reason, details: { week: week.id, from: ms(draft.plannedStart), to: r.patch.plannedStart, count: stamped.delay.count } });
    return { ok: true, streamId: id, plannedStart: r.patch.plannedStart, plannedEnd: r.patch.plannedEnd, delayCount: stamped.delay.count };
  });
  const delayMessage = (reason) => ({
    badState: "That stream can't be moved any more.", started: "That stream has already started; the Control Room handles it.", overlap: "That would overlap another stream.",
    noChange: "That's the same time.", endBeforeStart: "The end must be after the start.", noStart: "Give a new start time.",
  }[reason] || "That can't be done.");

  const cancelStream = onCall(async (request) => {
    const w = await core.whoPlus(core.requireAuth(request));
    mayMove(w);
    const d = request.data || {};
    const tz = await core.siteTz();
    const ad = await adhocTop(d.streamId);
    if (ad) return adhocCancel(w, ad, d, tz);
    const { id, top, draft } = await core.loadStream(d.streamId);
    const reason = typeof d.reason === "string" ? d.reason.trim() : "";
    const r = L.planCancel({ id, ...draft, actualStart: top.actualStart ?? draft.actualStart ?? null }, { reason, atMs: Date.now(), by: w.name });
    if (!r.ok) throw fail("failed-precondition", delayMessage(r.reason), r.reason);
    const stamped = toStamps(r.patch);
    // Seats are released (no reliability hit); the planned games stay on the record but leave the plan (the tray offers them again).
    const crewUidsHad = crewOf(draft);
    const signups = (await db.collection(P.signups(id)).get()).docs;
    for (const s of signups) {
      const seats = (s.get("seats") || []).map((x) => (["requested", "confirmed"].includes(x.status) ? { ...x, status: "dropped", why: "cancelled" } : x));
      await s.ref.update({ seats, updatedAt: FieldValue.serverTimestamp(), ...(s.get("gameRequest") ? { gameRequest: { ...s.get("gameRequest"), status: "notPlanned" } } : {}) });
    }
    const next = { ...draft, ...stamped, crew: L.emptyCrew(draft.rooms, draft.caps), plannedGameIds: [], hasUnpublishedChanges: false, rev: (draft.rev || 0) + 1 };
    await core.saveDraft(id, next, { alsoPublic: true });
    if (swap) await swap.closeForStream(id, { title: draft.title, actor: w, why: "cancel" });   // open swaps close with no effect on anyone's record
    const pub = draft.published === true;
    if (pub) {
      const title = `${draft.title || "A stream"} on ${L.dayLabel(ms(draft.plannedStart), tz)} is cancelled`;
      await core.outbox({ type: "stream-cancelled", audience: "members", streamId: id, week: draft.week, payload: { title, reason: reason || null, start: ms(draft.plannedStart), link: "/schedule" } });
      if (crewUidsHad.length) await core.outbox({ type: "stream-cancelled", audience: "uids", uids: crewUidsHad, streamId: id, week: draft.week, payload: { title, reason: reason || null, start: ms(draft.plannedStart), link: "/schedule/plan" } });
      await core.activity("stream-cancelled", title, { streamId: id });
    }
    await core.refreshCounts(draft.week);
    await core.logAdmin(w, { action: "cancel", path: P.stream(id), title: draft.title, reason, details: { week: draft.week, released: crewUidsHad.length } });
    return { ok: true, streamId: id, state: "cancelled" };
  });

  return { functions: { plannerSaveSettings, patternSave, patternDelete, exceptionSave, exceptionDelete, weekOpen, weekReopen, planSlot, planGames, planTray, publishWeek, delayStream, cancelStream }, openWeek, closeWeek, dropSeatInSignup, newDraft };
};
