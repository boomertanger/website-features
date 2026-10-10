// Control Room, the stream controls (docs/specs/control-room.md §3, §4, §5, §14). Every rule comes from lib/live/logic.js and
// lib/streams/logic.js; this file only reads, calls them, and writes the patch they return.
//
//   createAdhocStream owner, A2+  step one of an unscheduled stream: scheduled + adhoc + published, NOT live; youtubeSync makes its event
//   startStream      owner, A2+   Start (a planned stream or one made by createAdhocStream; never {adhoc}): the Start beat begins, the checklist is copied, alerts go out
//   switchGame       owner, A2+   closes the open segment, opens the next game
//   stopStream       owner, A2+   ends the stream, closes any window (grace still applies), settles rewards
//   liveBeat         owner, A2+   begin / skip a beat (Begin End skips the breaks), back to the game
//   liveCheckInWindow owner, A2+  open / extend / close / reopen once; the word is stored ONLY in private/control
//   liveScene        owner, A2+   Auto or a pinned scene with an optional Be right back timer
//   liveRoom         owner, A2+   the TikTok switch: adds or removes tiktok in the stream's liveRooms (before Start or live)
//   liveAfterShow    owner, A2+   stop the platform stream and start its linked backstage after-show in one step
//   liveChecklist    OWNER ONLY   save the four templates, tick items of a stream's copy
//   liveObsKey / liveDeckKey  OWNER ONLY  generate or rotate: only the SHA-256 hash is stored (live/main), the key is returned once
//   liveSettings     OWNER ONLY   the house look and the few switches in live/main
//
// Every handler is `ops.x(actor, data)` so the Stream Deck (liveDeck) runs the same code with actor { name: "Stream Deck" }.
// A1 Steward is refused by requireStaff (crew store a2plus). Every control writes adminLog (feature "controlRoom").
const crypto = require("crypto");
const { onCall } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const L = require("./logic");
const WORDS = require("./words");
const S = require("../streams/logic");
const PL = require("../planner/logic");
const { pickYoutubeIds } = require("./ytlink");
const { P, stamp } = require("./core");

const YOUTUBE_CLIENT_SECRET = defineSecret("YOUTUBE_CLIENT_SECRET");
const SECRETS = [YOUTUBE_CLIENT_SECRET];
const SHORTCUTS = ["openCheckin", "startQuestions", "startHotSeat", "dropBadge", "copySocials"];
const ITEM_TEXT_MAX = 120, NOTE_MAX = 300, ITEMS_MAX = 40;
const HOUR = 60 * 60 * 1000;
const BRB_MAX_MIN = 60;

module.exports = function controls(ctx, { youtube = null, rng = Math.random, hooks = {} } = {}) {
  const { db, FieldValue, Timestamp, fail, P: paths, now } = ctx;
  const swaps = require("../crew/swap").makeSwap({ db, FieldValue, Timestamp, log: (a) => ctx.logAdmin(a.actor || null, { action: a.action, streamId: a.streamId, title: a.title, details: a.details }) });

  const refusal = (r) => ({
    badState: ["failed-precondition", "That stream can't do that in its current state.", "badState"],
    notLive: ["failed-precondition", "That stream isn't live.", "notLive"],
    outOfOrder: ["failed-precondition", "Beats go in order: Start, Break 1, Break 2, End.", "outOfOrder"],
    badBeat: ["invalid-argument", "That isn't a beat.", "badBeat"],
    beatNotBegun: ["failed-precondition", "Begin that beat first.", "beatNotBegun"],
    alreadyOpened: ["failed-precondition", "That beat already had its check-in. Reopen it instead.", "alreadyOpened"],
    windowOpen: ["failed-precondition", "A check-in is already open.", "windowOpen"],
    windowClosed: ["failed-precondition", "That check-in has closed.", "windowClosed"],
    noWindow: ["failed-precondition", "There is no check-in for that beat.", "noWindow"],
    reopenUsed: ["failed-precondition", "That check-in was already reopened once.", "reopenUsed"],
    badLength: ["invalid-argument", "Pick 2, 3, 5 or 10 minutes.", "badLength"],
    noWord: ["failed-precondition", "There is no word to use.", "noWord"],
    emptyList: ["failed-precondition", "The word list is empty.", "noWord"],
    tooManySegments: ["failed-precondition", "That stream has too many game changes.", "tooManySegments"],
    alreadyOn: ["failed-precondition", "That's already on.", "alreadyOn"],
  }[r] || ["failed-precondition", "That can't be done.", r || "refused"]);
  const refuse = (r) => fail(...refusal(r));

  const text = (v, max, field, { min = 0 } = {}) => {
    const s = typeof v === "string" ? v.trim() : "";
    if (s.length < min || s.length > max) throw fail("invalid-argument", `${field} must be ${min ? `${min} to ` : "up to "}${max} characters.`, "field", { field });
    return s;
  };

  async function ensureControl(id) {
    const ref = ctx.controlRef(id);
    if (!(await ref.get()).exists) await ref.set({});
    return ref;
  }

  /** A game from the Vault (title comes from the Vault so the client can't invent one). */
  async function vaultGame(g) {
    if (!g || typeof g.gameId !== "string" || !g.gameId || g.gameId.includes("/")) throw fail("invalid-argument", "Pick a game from the Game Vault.", "game");
    const snap = await db.doc(paths.vaultGame(g.gameId)).get();
    if (!snap.exists) throw fail("not-found", "That game isn't in the Game Vault yet. Add it there first.", "notInVault");
    return { gameId: g.gameId, title: snap.get("title") || g.title || g.gameId };
  }
  const firstPlanned = (stream) => {
    const g = [...(stream.plannedGames || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
    return g ? { gameId: g.gameId, title: g.title || g.gameId } : null;
  };

  /** Checklist copy for a stream: the templates, items filtered by platform/backstage, nothing ticked. */
  function copyChecklist(templates, type) {
    const only = type === "backstage" ? "backstage" : "platform";
    const beats = {};
    for (const b of L.BEATS) {
      beats[b] = ((templates && templates.beats && templates.beats[b]) || []).filter((it) => !it.only || it.only === only)
        .map((it) => ({ id: it.id, text: it.text, ...(it.note ? { note: it.note } : {}), ...(it.shortcut ? { shortcut: it.shortcut } : {}), done: false }));
    }
    return { beats, copiedAt: now() };
  }
  const freshControl = (at) => ({ window: null, words: {}, pinned: null, brbUntil: null, firstIn: {}, viewers: {}, peak: 0, yt: { status: "waiting", since: at, tries: 0 }, startedAt: at });

  // ---------- YouTube ----------
  /** After Start: find the live YouTube broadcasts and store both ids in private/watch. Never throws; says why in control.yt. */
  async function linkYoutube(id, stream = null) {
    const at = now();
    const note = async (yt) => { try { await ctx.controlRef(id).update({ yt: { ...yt, checkedAt: at } }); } catch { /* the stream was removed */ } return yt; };
    try {
      if (!youtube || !youtube.apiClient) return await note({ status: "off" });
      const s = stream || await ctx.loadStream(id);
      const api = await youtube.apiClient();
      if (!api) return await note({ status: "off" });
      const w = ((await db.doc(paths.watch(id)).get()).data() || {}).youtube || {};
      const prev = (await ctx.control(id)).yt || {};
      const pick = pickYoutubeIds({ stream: s, known: w, active: await api.list({ status: "active" }) });
      if (pick.landscapeId || pick.backstageId || pick.verticalId) {
        await db.doc(paths.watch(id)).set({ provider: "youtube", youtube: { landscapeId: pick.landscapeId || w.landscapeId || null, backstageId: pick.backstageId || w.backstageId || null, verticalId: pick.verticalId || w.verticalId || null } }, { merge: true });
        // the Mod Deck embeds the two public chats: copy those two ids (never the backstage one) where crew can read them
        if (ctx.duty) { try { await ctx.duty.copyVideoIds(id, { landscapeId: pick.landscapeId || w.landscapeId || null, verticalId: pick.verticalId || w.verticalId || null }); } catch (err) { console.error("live: video ids not copied to the duty state", String((err && err.message) || err).slice(0, 140)); } }
      }
      return await note({ status: pick.ready ? "ok" : "waiting", since: prev.since || at, tries: (prev.tries || 0) + 1, waiting: pick.waiting });
    } catch (err) {
      console.error(`live: YouTube link ${id} failed`, err && (err.kind || err.code || err.name), String((err && err.message) || err).slice(0, 160));
      return await note({ status: "failed", since: at });
    }
  }
  /** Ad hoc streams and after-shows are live before their event exists: ask the youtube module to create it now. */
  async function createYoutubeEvent(id) {
    if (!youtube || !youtube.syncStream) return;
    try {
      const after = await ctx.loadStream(id);
      await youtube.syncStream(id, { before: null, after, createNow: true });
    } catch (err) { console.error(`live: YouTube event for ${id} failed`, String((err && err.message) || err).slice(0, 160)); }
  }

  // ---------- start ----------
  function adhocDoc(actor, a, firstGame, at, tz, slug, { state = "planned", durationMinutes = 180, week = null } = {}) {
    const type = a.type === "backstage" ? "backstage" : "platform";
    const rooms = type === "backstage" ? [] : Array.isArray(a.rooms) && a.rooms.length ? a.rooms : [...PL.ROOMS];
    const errs = type === "backstage" ? [] : PL.validateRooms(rooms);
    if (errs.length) throw fail("invalid-argument", "Pick the chats this stream runs in.", "rooms");
    const audience = type === "backstage" ? "fanClub" : "public";
    if (a.audience != null && !PL.AUDIENCES.includes(a.audience)) throw fail("invalid-argument", "Audience is public or fanClub.", "audience");
    return {
      state, published: true, hasUnpublishedChanges: false, adhoc: true, rev: 0, slug, tz, ...(week ? { week } : {}),
      title: text(a.title, S.TITLE_MAX, "title", { min: 1 }), description: "",
      plannedStart: Timestamp.fromMillis(at), plannedEnd: Timestamp.fromMillis(at + durationMinutes * 60 * 1000),
      type, audience: type === "backstage" ? "fanClub" : (a.audience || audience), platforms: type === "backstage" ? [] : PL.platformsForRooms(rooms), rooms, plannedGameCount: 1,
      crew: PL.emptyCrew(rooms, null), plannedGames: firstGame ? [{ gameId: firstGame.gameId, title: firstGame.title, order: 0, source: { kind: "owner" } }] : [], plannedGameIds: firstGame ? [firstGame.gameId] : [],
      createdAt: FieldValue.serverTimestamp(), createdBy: actor.uid || null,
    };
  }

  async function announceLive(actor, id, stream, { afterShow = false } = {}) {
    const backstage = stream.type === "backstage";
    const type = backstage ? "backstage-live" : "stream-live";
    const title = stream.title || "Stream";
    await ctx.outbox({
      id: `${type}:${id}`, type, audience: backstage ? (stream.audience || "fanClub") : "members", streamId: id,
      payload: { title, link: "/live", ...(backstage ? { afterShow } : { platforms: stream.platforms || [] }) },
    });
    await ctx.activity(afterShow ? "after-show" : "stream-live", afterShow ? `${title} is on` : `${title} is live`, { streamId: id });
  }

  /**
   * "Start an unscheduled stream", step one: creates a stream that starts now but is NOT live yet: state scheduled, adhoc, published,
   * plannedStart now, plannedEnd +3 h (or a.durationMinutes, 15 to 720), in this week's week id. The write triggers youtubeSync
   * (a published scheduled adhoc stream => create at once), so the YouTube event is in Streamlabs' list before the owner presses
   * Start (startStream {streamId}). adminLog only; the activity event comes when it goes live.
   */
  async function createAdhoc(actor, a, firstGame) {
    const at = now();
    const dm = a.durationMinutes == null ? 180 : Number(a.durationMinutes);
    if (!Number.isFinite(dm) || dm < 15 || dm > 720) throw fail("invalid-argument", "A stream lasts 15 minutes to 12 hours.", "durationMinutes");
    const tz = await ctx.planner.siteTz();
    const id = db.collection(paths.streams).doc().id;
    const near = (await db.collection(paths.streams).where("plannedStart", ">=", Timestamp.fromMillis(at - 36 * HOUR)).where("plannedStart", "<=", Timestamp.fromMillis(at + 36 * HOUR)).get()).docs.map((d) => d.get("slug"));
    const doc = adhocDoc(actor, a, firstGame, at, tz, S.streamSlug(at, tz, near), { state: "scheduled", durationMinutes: dm, week: S.streamWeek(at, tz) });
    await ctx.streamRef(id).set(doc);
    await ctx.logAdmin(actor, { action: "createAdhoc", streamId: id, title: doc.title, details: { type: doc.type, firstGame: firstGame ? firstGame.gameId : null } });
    return { id, doc };
  }
  const createAdhocStream = async (actor, data = {}) => {
    const a = data.adhoc && typeof data.adhoc === "object" ? data.adhoc : data;
    const firstGame = a.firstGame ? await vaultGame(a.firstGame) : null;
    const { id, doc } = await createAdhoc(actor, a, firstGame);
    return { ok: true, streamId: id, state: doc.state, type: doc.type };
  };

  const startStream = async (actor, data = {}) => {
    const at = now();
    // One way to make an unscheduled stream: createAdhocStream, then startStream { streamId }. An event can never be made twice.
    if (data.adhoc != null) throw fail("invalid-argument", "Create an unscheduled stream with createAdhocStream, then start it by its streamId.", "args");
    const id = typeof data.streamId === "string" ? data.streamId : null;
    if (!id || id.includes("/")) throw fail("invalid-argument", "streamId is required.", "args");
    const templates = ((await db.doc(paths.templates).get()).data()) || {};
    const firstGame = data.firstGame ? await vaultGame(data.firstGame) : null;
    const ref = ctx.streamRef(id);
    let started;
    await db.runTransaction(async (tx) => {
      const live = await tx.get(db.collection(paths.streams).where("state", "==", "live").limit(1));
      if (live.docs.length) throw fail("failed-precondition", live.docs[0].id === id ? "That stream is already live." : "Another stream is live. Stop it first.", live.docs[0].id === id ? "alreadyLive" : "otherLive");
      const snap = await tx.get(ref);
      if (!snap.exists) throw fail("not-found", "That stream isn't there.", "noStream");
      const prior = (await tx.get(ctx.controlRef(id))).data() || {};
      const stream = snap.data();
      const game = firstGame || firstPlanned(stream);
      const r = L.startLive(stream, at, game);
      if (!r.ok) throw refuse(r.reason);
      const patch = { ...r.patch, liveRooms: L.startRooms(stream) };
      tx.update(ref, stamp(patch));
      // a Recruit Rush the owner set before Start carries over (nothing counts before Start, so its count is 0)
      tx.set(ctx.controlRef(id), { ...freshControl(at), ...(prior.recruitRush ? { recruitRush: { ...prior.recruitRush, count: 0, hitAt: null } } : {}) });
      tx.set(db.doc(paths.checklist(id)), copyChecklist(templates, stream.type));
      started = { ...stream, ...patch, id };
    });
    const mirror = Object.fromEntries(["state", "actualStart"].map((k) => [k, Timestamp.fromMillis(at)]));
    const dr = db.doc(paths.draft(id));
    if ((await dr.get()).exists) await dr.update({ state: "live", actualStart: mirror.actualStart });
    await announceLive(actor, id, started);
    // Mod Machina phase 3 part 2: the live duty state exists from the first second (the Deck reads one document)
    if (ctx.duty) { try { await ctx.duty.onStart(id, at, started); } catch (err) { console.error("live: duty state not created", String((err && err.message) || err).slice(0, 140)); } }
    // Mod Machina phase 3 part 1: open swaps close at Start (an untaken late drop counts as a no-show, part 2 counts it)
    try { await swaps.closeAtStart(id, { title: started.title, actor }); } catch (err) { console.error("live: closing the swap board failed", err); }
    await ctx.logAdmin(actor, { action: "start", streamId: id, title: started.title, details: { adhoc: started.adhoc === true, type: started.type, firstGame: firstGame ? firstGame.gameId : null } });
    const yt = await linkYoutube(id);
    await ctx.publishLive();
    return { ok: true, streamId: id, state: "live", type: started.type, youtube: yt.status, ...(yt.waiting ? { waiting: yt.waiting } : {}) };
  };

  // ---------- switch game ----------
  const switchGame = async (actor, data = {}) => {
    const at = now();
    const s0 = await ctx.target(data);
    let game = data.game;
    if (data.next === true) {
      const played = S.gameIdsOf(s0.segments);
      const n = (s0.plannedGames || []).find((g) => g && g.gameId && !played.includes(g.gameId));
      if (!n) throw fail("failed-precondition", "No planned game is left.", "noNextGame");
      game = { gameId: n.gameId, title: n.title };
    }
    game = await vaultGame(game);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ctx.streamRef(s0.id));
      const r = S.switchSegment({ id: s0.id, ...snap.data() }, { kind: "game", gameId: game.gameId, title: game.title }, at);
      if (!r.ok) throw refuse(r.reason);
      tx.update(ctx.streamRef(s0.id), stamp(r.patch));
    });
    await ctx.logAdmin(actor, { action: "switchGame", streamId: s0.id, title: s0.title, details: { gameId: game.gameId } });
    await ctx.publishLive();
    return { ok: true, streamId: s0.id, game };
  };

  // ---------- stop ----------
  /** The beat counts and peak the wrap-up shows, written once at the end (the counters keep running only while live). */
  async function finalCounts(id) {
    const shards = (await db.collection(paths.countersCol(id)).get()).docs.map((d) => d.data());
    const sum = L.sumShards(shards);
    const control = await ctx.control(id);
    return { sum, peak: control.peak || 0 };
  }
  async function afterEnd(actor, s, patch, { auto = false } = {}) {
    const { sum, peak } = await finalCounts(s.id);
    const beats = { ...(patch.beats || {}) };
    for (const k of Object.keys(beats)) beats[k] = { ...beats[k], checkins: sum.byBeat[k] || 0 };
    await ctx.patchStream(s.id, { beats, stats: { peak, checkins: sum.total, byRoom: sum.byRoom } });
    await ctx.settle(s.id);
    // Mod Machina phase 3 part 2: everyone is clocked out, seats nobody clocked into become no-shows, the Captain and owner get "Confirm tonight's crew"
    if (ctx.duty) { try { await ctx.duty.closeOut(s.id, patch.actualEnd != null ? ctx.ms(patch.actualEnd) : now()); } catch (err) { console.error("live: duty close-out failed", String((err && err.message) || err).slice(0, 140)); } }
    await ctx.activity("stream-ended", `${s.title || "The stream"} has ended`, { streamId: s.id });
    return { sum, peak };
  }
  const stopStream = async (actor, data = {}) => {
    const at = now();
    const s0 = await ctx.target(data);
    let out;
    await db.runTransaction(async (tx) => {
      const [snap, cs] = await Promise.all([tx.get(ctx.streamRef(s0.id)), tx.get(ctx.controlRef(s0.id))]);
      const stream = { id: s0.id, ...snap.data() };
      const r = L.stopLive(stream, at);
      if (!r.ok) throw refuse(r.reason);
      tx.update(ctx.streamRef(s0.id), stamp(r.patch));
      const w = (cs.data() || {}).window;
      if (w && r.closeWindow) { const c = L.closeWindow(w, at); if (c.ok && !c.already) tx.update(ctx.controlRef(s0.id), { window: c.window }); }
      out = { stream, patch: r.patch };
    });
    const dr = db.doc(paths.draft(s0.id));
    if ((await dr.get()).exists) await dr.update({ state: "ended", actualEnd: Timestamp.fromMillis(at) });
    const res = await afterEnd(actor, s0, out.patch);
    await ctx.logAdmin(actor, { action: "stop", streamId: s0.id, title: s0.title, details: { checkins: res.sum.total, peak: res.peak } });
    await ctx.publishLive();
    return { ok: true, streamId: s0.id, state: "ended", durationMs: at - ctx.ms(out.stream.actualStart), peak: res.peak, checkins: res.sum.total, checkinsByBeat: res.sum.byBeat };
  };

  /** The 12-hour auto-end (liveTick): same beat and window handling as Stop, a correction is offered next time the controls open. */
  const autoEnd = async (stream) => {
    const r = L.autoEndLive(stream);
    if (!r.ok) return r;
    const at = r.patch.actualEnd;
    await db.runTransaction(async (tx) => {
      const cs = await tx.get(ctx.controlRef(stream.id));
      tx.update(ctx.streamRef(stream.id), stamp(r.patch));
      const w = (cs.data() || {}).window;
      if (w) { const c = L.closeWindow(w, at); if (c.ok && !c.already) tx.update(ctx.controlRef(stream.id), { window: c.window }); }
    });
    const dr = db.doc(paths.draft(stream.id));
    if ((await dr.get()).exists) await dr.update({ state: "ended", actualEnd: Timestamp.fromMillis(at) });
    await afterEnd(null, stream, r.patch, { auto: true });
    await ctx.logAdmin(null, { action: "autoEnd", streamId: stream.id, title: stream.title, reason: "Ran 12 hours: ended automatically" });
    await ctx.publishLive();
    return { ok: true, streamId: stream.id };
  };

  // ---------- beats ----------
  const liveBeat = async (actor, data = {}) => {
    const at = now();
    const s0 = await ctx.target(data);
    const action = data.action;
    if (!["begin", "skip", "backToGame"].includes(action)) throw fail("invalid-argument", "action is begin, skip or backToGame.", "args");
    let r, needGame = null;
    if (action === "backToGame") {
      needGame = data.game ? await vaultGame(data.game) : null;
    }
    await ensureControl(s0.id);
    await db.runTransaction(async (tx) => {
      const [snap, cs] = await Promise.all([tx.get(ctx.streamRef(s0.id)), tx.get(ctx.controlRef(s0.id))]);
      const stream = { id: s0.id, ...snap.data() };
      if (action === "backToGame") {
        const last = [...(stream.segments || [])].reverse().find((g) => g.kind === "game" && g.gameId);
        const game = needGame || (last ? { gameId: last.gameId, title: last.title } : null);
        if (!game) throw fail("failed-precondition", "Pick a game to go back to.", "noGame");
        r = L.backToGame(stream, game, at);
      } else {
        r = (action === "begin" ? L.beginBeat : L.skipBeat)(stream, data.beat, at);
      }
      if (!r.ok) throw refuse(r.reason);
      tx.update(ctx.streamRef(s0.id), stamp(r.patch));
      const w = (cs.data() || {}).window;
      if (r.closeWindow && w) { const c = L.closeWindow(w, at); if (c.ok && !c.already) tx.update(ctx.controlRef(s0.id), { window: c.window }); }
    });
    await ctx.logAdmin(actor, { action: action === "backToGame" ? "backToGame" : action === "begin" ? "beatBegin" : "beatSkip", streamId: s0.id, title: s0.title, details: { beat: data.beat || null } });
    await ctx.publishLive();
    return { ok: true, streamId: s0.id, action, beat: data.beat || null };
  };

  // ---------- check-in window ----------
  async function wordList() {
    const main = await ctx.mainDoc();
    const own = Array.isArray(main.words) ? main.words.filter((w) => typeof w === "string" && w.trim()) : [];
    return own.length ? own : WORDS.WORDS;
  }
  async function recentWords() {
    return (await db.collection(paths.wordLog).get()).docs.map((d) => ({ word: d.get("word"), atMs: d.get("atMs") }));
  }
  /** Ticks the checklist items of the current beat that run this control (a shortcut item ticks itself). */
  async function tickShortcut(id, beat, shortcut) {
    const ref = db.doc(paths.checklist(id));
    const snap = await ref.get();
    if (!snap.exists) return;
    const items = (snap.get("beats") || {})[beat] || [];
    if (!items.some((it) => it.shortcut === shortcut && !it.done)) return;
    await ref.update({ [`beats.${beat}`]: items.map((it) => (it.shortcut === shortcut ? { ...it, done: true, doneAt: now() } : it)) });
  }
  async function crewPresent(id, beat, at) {
    for (const seat of await ctx.seatedCrew(id)) {
      const ref = db.doc(paths.presence(id, seat.uid));
      const cur = ((await ref.get()).data()) || {};
      if (cur.beats && cur.beats[beat]) continue;
      await ref.set({ uid: seat.uid, crew: true, beats: { [beat]: { room: seat.room, at: Timestamp.fromMillis(at), crew: true } }, expireAt: Timestamp.fromMillis(at + require("./core").PRESENCE_TTL_MS) }, { merge: true });
    }
  }
  const liveCheckInWindow = async (actor, data = {}) => {
    const at = now();
    const s0 = await ctx.target(data);
    const action = data.action;
    if (!["open", "extend", "close", "reopen"].includes(action)) throw fail("invalid-argument", "action is open, extend, close or reopen.", "args");
    const settings = await ctx.settings();
    await ensureControl(s0.id);
    let word = null, pick = null;
    if (action === "open") {
      pick = L.pickWord(await wordList(), await recentWords(), at, rng, settings);
      if (!pick.ok) throw refuse(pick.reason);
    }
    let result;
    await db.runTransaction(async (tx) => {
      const [snap, cs] = await Promise.all([tx.get(ctx.streamRef(s0.id)), tx.get(ctx.controlRef(s0.id))]);
      const stream = { id: s0.id, ...snap.data() };
      const control = cs.data() || {};
      const cur = control.window || null;
      const beat = data.beat || (cur && action !== "open" ? cur.beat : L.currentBeat(stream.beats));
      let r;
      if (action === "open") {
        r = L.openWindow(stream, cur, beat, pick.word, data.lengthMinutes == null ? null : Number(data.lengthMinutes), at, settings);
        if (!r.ok) throw refuse(r.reason);
        tx.update(ctx.streamRef(s0.id), { [`beats.${beat}.windowOpenedAt`]: Timestamp.fromMillis(at) });
        tx.update(ctx.controlRef(s0.id), { window: r.window, [`words.${beat}`]: pick.word });
        word = pick.word;
      } else {
        if (action === "reopen") r = L.reopenWindow(stream, cur, beat, at);
        else if (action === "extend") r = L.extendWindow(cur, at, settings);
        else r = L.closeWindow(cur, at);
        if (!r.ok) throw refuse(r.reason);
        tx.update(ctx.controlRef(s0.id), { window: r.window });
        word = r.window.word;
      }
      result = { beat, window: { beat, openedAt: r.window.openedAt, closesAt: r.window.closesAt, lengthMinutes: r.window.lengthMinutes, reopened: !!r.window.reopened, closedAt: r.window.closedAt == null ? null : r.window.closedAt }, fallback: !!(pick && pick.fallback) };
    });
    if (action === "open") {
      await db.doc(`${paths.wordLog}/${L.normalise(word)}`).set({ word, atMs: at, streamId: s0.id });
      await crewPresent(s0.id, result.beat, at);
      await tickShortcut(s0.id, result.beat, "openCheckin");
    }
    await ctx.logAdmin(actor, { action: `window${action[0].toUpperCase()}${action.slice(1)}`, streamId: s0.id, title: s0.title, details: { beat: result.beat, lengthMinutes: result.window.lengthMinutes } });
    await ctx.publishLive();
    return { ok: true, streamId: s0.id, ...result, word };
  };

  // ---------- scene ----------
  const liveScene = async (actor, data = {}) => {
    const at = now();
    const s0 = await ctx.target(data);
    const scene = data.scene === "auto" || data.scene == null ? null : data.scene;
    if (scene != null && !L.SCENES.includes(scene)) throw fail("invalid-argument", `scene is auto or one of ${L.SCENES.join(", ")}.`, "scene");
    let brbUntil = null;
    if (scene === "brb" && data.brbMinutes != null) {
      const m = Number(data.brbMinutes);
      if (!Number.isFinite(m) || m <= 0 || m > BRB_MAX_MIN) throw fail("invalid-argument", `The timer is 1 to ${BRB_MAX_MIN} minutes.`, "brbMinutes");
      brbUntil = at + Math.round(m * 60 * 1000);
    }
    if (s0.state !== "live") throw refuse("notLive");
    await ensureControl(s0.id);
    await ctx.controlRef(s0.id).update({ pinned: scene, brbUntil });
    await ctx.logAdmin(actor, { action: "scene", streamId: s0.id, title: s0.title, details: { scene: scene || "auto" } });
    return { ok: true, streamId: s0.id, scene: scene || "auto", brbUntil };
  };

  // ---------- the TikTok switch ----------
  /**
   * liveRoom { streamId?, room: "tiktok", on }: the TikTok switch, persisted in the stream's liveRooms (the rooms live now: check-ins, public/live
   * and the stream view all read it). Before Start it sets the choice startStream keeps (L.startRooms); while live it changes the room at once,
   * drops the typed TikTok count when turned off, and republishes public/live. Platform streams only; the stream must be live or scheduled.
   */
  const liveRoom = async (actor, data = {}) => {
    const room = L.normaliseRoom(data.room);
    if (room !== "tiktok") throw fail("invalid-argument", "Only TikTok has a switch.", "room");
    if (typeof data.on !== "boolean") throw fail("invalid-argument", "on is true or false.", "args");
    const s0 = await ctx.target(data);
    if (s0.type === "backstage") throw fail("failed-precondition", "Backstage streams are on the site only.", "backstage");
    if (!["live", "scheduled"].includes(s0.state)) throw refuse("badState");
    if (!(Array.isArray(s0.rooms) ? s0.rooms : []).includes("tiktok") && !(Array.isArray(s0.liveRooms) && s0.liveRooms.includes("tiktok"))) throw fail("failed-precondition", "TikTok isn't one of this stream's chats.", "notInStream");
    let next;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ctx.streamRef(s0.id));
      const s = { id: s0.id, ...snap.data() };
      const cur = s.state === "live" ? L.allowedRooms(s) : L.startRooms(s);
      next = data.on ? L.PLATFORM_ROOMS.filter((r) => r === "tiktok" || cur.includes(r)) : cur.filter((r) => r !== "tiktok");
      if (!next.length) throw fail("failed-precondition", "A stream needs at least one chat.", "lastRoom");
      tx.update(ctx.streamRef(s0.id), { liveRooms: next });
    });
    if (s0.state === "live" && !data.on) {
      const control = await ctx.control(s0.id);
      const { tiktok: _t, ...viewers } = control.viewers || {};
      await ctx.controlRef(s0.id).update({ tiktok: FieldValue.delete(), viewers });
    }
    await ctx.logAdmin(actor, { action: "room", streamId: s0.id, title: s0.title, details: { room: "tiktok", on: data.on } });
    if (s0.state === "live") await ctx.publishLive();
    return { ok: true, streamId: s0.id, room: "tiktok", on: data.on, liveRooms: next };
  };

  // ---------- after-show ----------
  const liveAfterShow = async (actor, data = {}) => {
    const at = now();
    const s0 = await ctx.target(data);
    if (s0.type === "backstage") throw fail("failed-precondition", "An after-show follows a platform stream.", "notPlatform");
    if (s0.afterShowId) throw fail("failed-precondition", "That stream already has an after-show.", "alreadyAfterShow");
    const templates = ((await db.doc(paths.templates).get()).data()) || {};
    const tz = await ctx.planner.siteTz();
    const newId = db.collection(paths.streams).doc().id;
    const near = (await db.collection(paths.streams).where("plannedStart", ">=", Timestamp.fromMillis(at - 36 * HOUR)).where("plannedStart", "<=", Timestamp.fromMillis(at + 36 * HOUR)).get()).docs.map((d) => d.get("slug"));
    const doc = {
      ...adhocDoc(actor, { type: "backstage", title: `${s0.title || "Stream"} after-show`.slice(0, S.TITLE_MAX) }, null, at, tz, S.streamSlug(at, tz, near)),
      afterShowOf: s0.id, audience: "fanClub",
    };
    await ensureControl(s0.id);
    let ended, started;
    await db.runTransaction(async (tx) => {
      const [snap, cs] = await Promise.all([tx.get(ctx.streamRef(s0.id)), tx.get(ctx.controlRef(s0.id))]);
      const stream = { id: s0.id, ...snap.data() };
      const stop = L.stopLive(stream, at);
      if (!stop.ok) throw refuse(stop.reason);
      const start = L.startLive(doc, at, null);
      if (!start.ok) throw refuse(start.reason);
      tx.update(ctx.streamRef(s0.id), { ...stamp(stop.patch), afterShowId: newId });
      const w = (cs.data() || {}).window;
      if (w) { const c = L.closeWindow(w, at); if (c.ok && !c.already) tx.update(ctx.controlRef(s0.id), { window: c.window }); }
      tx.set(ctx.streamRef(newId), { ...doc, ...stamp({ ...start.patch, liveRooms: ["site"] }) });
      tx.set(ctx.controlRef(newId), freshControl(at));
      tx.set(db.doc(paths.checklist(newId)), copyChecklist(templates, "backstage"));
      ended = { stream, patch: stop.patch };
      started = { ...doc, ...start.patch, id: newId };
    });
    const dr = db.doc(paths.draft(s0.id));
    if ((await dr.get()).exists) await dr.update({ state: "ended", actualEnd: Timestamp.fromMillis(at) });
    await afterEnd(actor, s0, ended.patch);
    await announceLive(actor, newId, started, { afterShow: true });
    await ctx.logAdmin(actor, { action: "afterShow", streamId: s0.id, title: s0.title, details: { afterShowId: newId } });
    await createYoutubeEvent(newId);
    const yt = await linkYoutube(newId);
    await ctx.publishLive();
    return { ok: true, endedId: s0.id, streamId: newId, state: "live", type: "backstage", youtube: yt.status };
  };

  // ---------- checklist (owner only) ----------
  function cleanTemplates(input) {
    const src = input && input.beats && typeof input.beats === "object" ? input.beats : null;
    if (!src) throw fail("invalid-argument", "Send the four beat templates.", "templates");
    const beats = {};
    for (const b of L.BEATS) {
      const list = Array.isArray(src[b]) ? src[b] : [];
      if (list.length > ITEMS_MAX) throw fail("invalid-argument", `At most ${ITEMS_MAX} items per beat.`, "templates");
      const seen = new Set();
      beats[b] = list.map((it) => {
        const t = text(it && it.text, ITEM_TEXT_MAX, "text", { min: 1 });
        const note = it && it.note ? text(it.note, NOTE_MAX, "note") : null;
        if (it && it.only != null && !["platform", "backstage"].includes(it.only)) throw fail("invalid-argument", "Only on platform or backstage streams.", "templates");
        if (it && it.shortcut != null && !SHORTCUTS.includes(it.shortcut)) throw fail("invalid-argument", "That shortcut doesn't exist.", "templates");
        let id = it && typeof it.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(it.id) ? it.id : crypto.randomBytes(5).toString("hex");
        while (seen.has(id)) id = crypto.randomBytes(5).toString("hex");
        seen.add(id);
        return { id, text: t, ...(note ? { note } : {}), ...(it.only ? { only: it.only } : {}), ...(it.shortcut ? { shortcut: it.shortcut } : {}) };
      });
    }
    return { beats };
  }
  const liveChecklist = async (actor, data = {}) => {
    if (data.action === "saveTemplates") {
      const t = cleanTemplates(data.templates);
      await db.doc(paths.templates).set({ ...t, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid || null });
      await ctx.logAdmin(actor, { action: "checklistTemplates", title: "Checklist templates", details: { items: L.BEATS.reduce((n, b) => n + t.beats[b].length, 0) } });
      return { ok: true, items: L.BEATS.reduce((n, b) => n + t.beats[b].length, 0) };
    }
    if (data.action === "tick") {
      const s0 = await ctx.target(data);
      if (!L.BEATS.includes(data.beat) || typeof data.itemId !== "string") throw fail("invalid-argument", "beat and itemId are required.", "args");
      const ref = db.doc(paths.checklist(s0.id));
      let done;
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw fail("not-found", "That stream has no checklist.", "noChecklist");
        const items = (snap.get("beats") || {})[data.beat] || [];
        if (!items.some((it) => it.id === data.itemId)) throw fail("not-found", "That item isn't on the list.", "noItem");
        done = data.done !== false;
        tx.update(ref, { [`beats.${data.beat}`]: items.map((it) => (it.id === data.itemId ? (done ? { ...it, done: true, doneAt: now() } : (({ doneAt: _d, ...r }) => ({ ...r, done: false }))(it)) : it)) });
      });
      return { ok: true, streamId: s0.id, beat: data.beat, itemId: data.itemId, done };
    }
    throw fail("invalid-argument", "action is saveTemplates or tick.", "args");
  };

  // ---------- keys (owner only) ----------
  const keyOp = (kind) => async (actor, data = {}) => {
    const field = `${kind}Key`;
    const at = now();
    if (data.revoke === true) {
      await db.doc(paths.main).set({ [`${field}Hash`]: null, [`${field}At`]: at }, { merge: true });
      await ctx.logAdmin(actor, { action: `${field}Revoke`, title: "Control Room keys" });
      return { ok: true, revoked: true };
    }
    const key = L.generateKey();
    await db.doc(paths.main).set({ [`${field}Hash`]: L.hashKey(key), [`${field}At`]: at }, { merge: true });
    await ctx.logAdmin(actor, { action: `${field}Rotate`, title: "Control Room keys" });      // never the key, never its hash
    return { ok: true, key };                                                                  // shown once
  };

  // ---------- settings (owner only) ----------
  const liveSettings = async (actor, data = {}) => {
    const patch = {};
    if (data.look != null) { if (!["hull", "crt"].includes(data.look)) throw fail("invalid-argument", "look is hull or crt.", "look"); patch.look = data.look; }
    if (data.twitchPresence != null) patch.twitchPresence = data.twitchPresence === true;
    if (data.makeBackstagePrivateAfterDays != null) {
      const n = data.makeBackstagePrivateAfterDays;
      if (!(n === false || (Number.isFinite(n) && n >= 0))) throw fail("invalid-argument", "Days must be a number, or false to turn it off.", "days");
      patch.makeBackstagePrivateAfterDays = n;
    }
    for (const k of Object.keys(L.DEFAULT_SETTINGS)) {
      if (data[k] == null) continue;
      if (k === "windowLengthChoices") { if (!Array.isArray(data[k]) || !data[k].length || !data[k].every((x) => Number.isFinite(x) && x > 0)) throw fail("invalid-argument", "Choices must be positive minutes.", k); patch[k] = data[k]; }
      else { if (!Number.isFinite(data[k]) || data[k] < 0) throw fail("invalid-argument", `${k} must be a number of 0 or more.`, k); patch[k] = data[k]; }
    }
    if (!Object.keys(patch).length) throw fail("invalid-argument", "Nothing to change.", "args");
    await db.doc(paths.main).set(patch, { merge: true });
    await ctx.logAdmin(actor, { action: "settings", title: "Control Room settings", details: { fields: Object.keys(patch) } });
    await ctx.publishLive();
    return { ok: true, saved: Object.keys(patch) };
  };

  // ---------- the callables ----------
  const staff = (fn, opts = {}) => async (request) => fn(await ctx.requireStaff(request), request.data || {});
  const owner = (fn, opts = {}) => async (request) => fn(await ctx.requireStaff(request, { ownerOnly: true }), request.data || {});
  const functions = {
    createAdhocStream: onCall(staff(createAdhocStream)),
    startStream: onCall({ secrets: SECRETS, timeoutSeconds: 120 }, staff(startStream)),
    switchGame: onCall(staff(switchGame)),
    stopStream: onCall({ timeoutSeconds: 300 }, staff(stopStream)),
    liveBeat: onCall(staff(liveBeat)),
    liveCheckInWindow: onCall(staff(liveCheckInWindow)),
    liveScene: onCall(staff(liveScene)),
    liveRoom: onCall(staff(liveRoom)),
    liveAfterShow: onCall({ secrets: SECRETS, timeoutSeconds: 300 }, staff(liveAfterShow)),
    liveChecklist: onCall(owner(liveChecklist)),
    liveObsKey: onCall(owner(keyOp("obs"))),
    liveDeckKey: onCall(owner(keyOp("deck"))),
    liveSettings: onCall(owner(liveSettings)),
  };
  return {
    functions, SECRETS,
    ops: { createAdhocStream, startStream, switchGame, stopStream, liveBeat, liveCheckInWindow, liveScene, liveRoom, liveAfterShow, liveChecklist, liveSettings },
    helpers: { autoEnd, linkYoutube, createYoutubeEvent, afterEnd, cleanTemplates, copyChecklist, freshControl, vaultGame, crewPresent, tickShortcut },
  };
};
module.exports.SHORTCUTS = SHORTCUTS;
