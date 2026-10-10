// Control Room, feeds and ticks (docs/specs/control-room.md §3, §8, §10, §11, §14).
//
//   onCheckInWritten  trigger on streams/{id}/counters/{shard}: queues the debounced flush
//   liveFlush         Cloud Tasks (onTaskDispatched): folds the counters into public/live, at most every 3 s
//   liveTick          every minute: NOTHING when nothing is live (no API call); live: Twitch viewers and status, YouTube viewers,
//                     peak, "Waiting for YouTube…" retries every 15 s, the 12 hour auto-end
//   obsFeed           HTTPS GET, a valid stream view key only: the stream view's data, INCLUDING the check-in word while open
//   liveDeck          HTTPS, a valid deck key only, rate-limited: the Stream Deck's actions. NEVER Start, Stop or After-show
//   liveViewerEntry   callable, crew on duty: the TikTok Room Lead's viewer count
//   livePlatformStatus callable, owner and A2+, NO WRITES: Twitch, the YouTube event and the vertical broadcast, for the Start dialog
//   backstageWatch    callable, the stream's audience only: the stored YouTube video id (never logged)
//
// THE DEBOUNCE. state doc sites/boomertanger/rateLimits/live_flush { lastFlushMs, scheduledAtMs, expireAt } (the rateLimits TTL
// applies). logic.flushDecision says flush now / schedule at lastFlush + 3 s / wait (one is already queued). Scheduling enqueues the
// liveFlush task with the deterministic id "flush-<atMs/3000>" and scheduleDelaySeconds, so two writers in the same window make ONE
// task (the queue refuses a duplicate id) and the state doc turns a third into "wait". If Cloud Tasks is unavailable (its API is off
// until the owner enables it) the trigger flushes inline instead: the page still updates, only the 3 s spacing is lost.
//
// STREAM DECK RATE LIMIT. 30 requests per minute per key: rateLimits/live_deck_<first 16 hex of the key hash>_<yyyymmddhhmm>
// { count, expireAt }. Bad keys count against a shared per-minute budget (60) so guessing is throttled too.
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onTaskDispatched } = require("firebase-functions/v2/tasks");
const { onRequest, onCall } = require("firebase-functions/v2/https");
const { defineSecret, defineString } = require("firebase-functions/params");
const L = require("./logic");
const S = require("../streams/logic");
const { P, ENDED_VISIBLE_MS } = require("./core");
const { makeTwitch } = require("./twitch");
const { YoutubeError } = require("../youtube/api");
const { pickYoutubeIds } = require("./ytlink");

const TWITCH_CLIENT_ID = defineString("TWITCH_CLIENT_ID");
const TWITCH_LOGIN = defineString("TWITCH_LOGIN", { default: "boomertanger" });
const TWITCH_CLIENT_SECRET = defineSecret("TWITCH_CLIENT_SECRET");
const YOUTUBE_CLIENT_SECRET = defineSecret("YOUTUBE_CLIENT_SECRET");
const DECK_LIMIT_PER_MIN = 30, BAD_KEY_LIMIT_PER_MIN = 60;
const FLUSH_QUEUE = { retryConfig: { maxAttempts: 3, minBackoffSeconds: 2, maxBackoffSeconds: 30 }, rateLimits: { maxDispatchesPerSecond: 1, maxConcurrentDispatches: 1 } };
const YT_RETRY_MS = 15 * 1000;
const TIKTOK_FRESH_MS = 15 * 60 * 1000;
const DECK_ACTIONS = ["nextBeat", "openCheckin", "extend", "closeCheckin", "scene", "nextGame"];
const DECK_LATER = ["startQuestions", "endQuestions", "answered", "skip", "startHotSeat", "spin", "nextStep", "dropBadge"];   // Chat Games (not built yet)
const DECK_REFUSED = ["start", "stop", "afterShow", "startStream", "stopStream"];

const sleepReal = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = function feeds(ctx, { controls, fetchFn = null, enqueue = null, sleep = sleepReal, twitchClientId = null, twitchClientSecret = null, twitchLogin = null, youtube = null } = {}) {
  const { db, FieldValue, Timestamp, fail, now } = ctx;
  const doFetch = (...a) => (fetchFn || fetch)(...a);
  const secrets = [TWITCH_CLIENT_SECRET, YOUTUBE_CLIENT_SECRET];

  // ---------- the debounced flush ----------
  const flushState = () => db.doc(P.rateLimit("live_flush"));
  /** Default enqueue: Cloud Tasks through the Admin SDK. Throws when the API is off; requestFlush handles that. */
  const defaultEnqueue = async (data, { scheduleDelaySeconds, id }) => {
    const { getFunctions } = require("firebase-admin/functions");
    await getFunctions().taskQueue("liveFlush").enqueue(data, { scheduleDelaySeconds, id });
  };
  const doEnqueue = enqueue || defaultEnqueue;

  async function flushNow() {
    const r = await ctx.publishLive();
    await flushState().set({ lastFlushMs: now(), scheduledAtMs: null, expireAt: Timestamp.fromMillis(now() + 24 * 60 * 60 * 1000) }, { merge: true });
    return r;
  }
  /** Called when a counter changed: flush now, queue one flush for later, or do nothing (one is already queued). */
  async function requestFlush() {
    const settings = await ctx.settings();
    const nowMs = now();
    let decision;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(flushState());
      const st = snap.exists ? snap.data() : {};
      decision = L.flushDecision({ lastFlushMs: st.lastFlushMs == null ? null : st.lastFlushMs, nowMs, scheduledAtMs: st.scheduledAtMs == null ? null : st.scheduledAtMs }, settings);
      if (decision.action === "schedule") tx.set(flushState(), { scheduledAtMs: decision.atMs, expireAt: Timestamp.fromMillis(nowMs + 24 * 60 * 60 * 1000) }, { merge: true });
    });
    if (decision.action === "flush") { await flushNow(); return decision; }
    if (decision.action === "schedule") {
      const gap = settings.flushMinGapSeconds * 1000;
      try {
        await doEnqueue({ atMs: decision.atMs }, { scheduleDelaySeconds: Math.max(0, Math.ceil((decision.atMs - nowMs) / 1000)), id: `flush-${Math.floor(decision.atMs / gap)}` });
      } catch (err) {
        if (!/ALREADY_EXISTS|already exists/i.test(String((err && (err.code || err.message)) || ""))) {
          console.error("live: could not queue liveFlush, flushing inline", String((err && err.message) || err).slice(0, 160));
          await flushNow();
          return { action: "flush", fallback: true };
        }
      }
    }
    return decision;
  }
  /** What the liveFlush task does: flush if the gap has passed, else queue again. */
  async function runFlushTask() {
    const settings = await ctx.settings();
    const snap = await flushState().get();
    const st = snap.exists ? snap.data() : {};
    const d = L.flushDecision({ lastFlushMs: st.lastFlushMs == null ? null : st.lastFlushMs, nowMs: now(), scheduledAtMs: null }, settings);
    if (d.action === "flush") { await flushNow(); return { flushed: true }; }
    const gap = settings.flushMinGapSeconds * 1000;
    try { await doEnqueue({ atMs: d.atMs }, { scheduleDelaySeconds: Math.max(1, Math.ceil((d.atMs - now()) / 1000)), id: `flush-${Math.floor(d.atMs / gap)}` }); } catch (err) { if (!/ALREADY_EXISTS|already exists/i.test(String((err && (err.code || err.message)) || ""))) throw err; }
    return { flushed: false, again: d.atMs };
  }
  const onCheckInWritten = onDocumentWritten("sites/{siteId}/streams/{streamId}/counters/{shard}", async (event) => {
    if (event.params.siteId !== "boomertanger") return;
    await requestFlush();
  });
  const liveFlush = onTaskDispatched(FLUSH_QUEUE, async () => { await runFlushTask(); });

  // ---------- liveTick ----------
  let twitchClient = null;
  const twitch = () => (twitchClient ||= makeTwitch({
    fetchFn: doFetch, clientId: twitchClientId ?? TWITCH_CLIENT_ID.value(), clientSecret: twitchClientSecret ?? TWITCH_CLIENT_SECRET.value(), now,
  }));
  async function broadcasterId() {
    const ref = db.doc(P.growthConfig);
    const cfg = (await ref.get()).data() || {};
    if (cfg.twitchBroadcasterId) return String(cfg.twitchBroadcasterId);
    const login = twitchLogin ?? TWITCH_LOGIN.value();
    const id = await twitch().userId(login);
    if (id) await ref.set({ twitchLogin: login, twitchBroadcasterId: id }, { merge: true });
    return id;
  }
  async function ytIds(streamId) {
    return (((await db.doc(P.watch(streamId)).get()).data()) || {}).youtube || {};
  }

  /** One minute of work. Returns what it did; { idle: true } and ZERO network calls when nothing is live. */
  async function runTick() {
    const stream = await ctx.liveStream();
    if (!stream) {
      // Nothing live: no Twitch or YouTube call, nothing written, except putting /live back off air once a finished stream's 2 hours are up.
      const pub = (await db.doc(P.publicLive).get()).data();
      if (pub && ((pub.state === "ended" && now() - (pub.actualEnd || 0) > ENDED_VISIBLE_MS) || pub.state === "live" || pub.state === "backstage")) await ctx.publishLive();
      return { idle: true };
    }
    const at = now();
    const out = { streamId: stream.id, errors: [] };
    if (S.needsAutoEnd(stream, at)) { await controls.helpers.autoEnd(stream); return { ...out, autoEnded: true }; }
    const control = await ctx.control(stream.id);
    const viewers = { ...(control.viewers || {}) };
    const patch = {};
    const backstage = stream.type === "backstage";
    const rooms = L.allowedRooms(stream);
    // Twitch (platform streams)
    if (!backstage && rooms.includes("twitch")) {
      try {
        const id = await broadcasterId();
        if (id) {
          const st = await twitch().streamStatus(id);
          viewers.twitch = st.viewers;
          const prev = control.twitch || {};
          patch.twitch = st.live ? { status: "live", at } : { status: "offline", at, offlineSince: prev.status === "offline" && prev.offlineSince ? prev.offlineSince : at };
        }
      } catch (err) { out.errors.push("twitch"); console.error("liveTick: Twitch failed", String((err && err.message) || err).slice(0, 160)); }
    }
    // YouTube (landscape and vertical viewers of a platform stream)
    if (!backstage && youtube && youtube.apiClient) {
      try {
        const y = await ytIds(stream.id);
        const ids = [y.landscapeId, y.verticalId].filter(Boolean);
        if (ids.length) {
          const api = await youtube.apiClient();
          if (api) {
            const items = await api.videosList(ids);
            const n = (id) => { const it = items.find((x) => x.id === id); return it ? Number(it.liveStreamingDetails && it.liveStreamingDetails.concurrentViewers) || 0 : null; };
            if (y.landscapeId && n(y.landscapeId) != null) viewers.ytLandscape = n(y.landscapeId);
            if (y.verticalId && n(y.verticalId) != null) viewers.ytVertical = n(y.verticalId);
          }
        }
      } catch (err) { out.errors.push("youtube"); console.error("liveTick: YouTube failed", err instanceof YoutubeError ? err.kind : "", String((err && err.message) || err).slice(0, 160)); }
    }
    // TikTok: the Room Lead's typed count, while it is fresh
    if (!backstage && control.tiktok && Number.isFinite(control.tiktok.viewers) && at - (control.tiktok.at || 0) <= TIKTOK_FRESH_MS) viewers.tiktok = control.tiktok.viewers;
    else delete viewers.tiktok;
    const total = L.PLATFORM_ROOMS.reduce((n, r) => n + (Number.isFinite(viewers[r]) ? viewers[r] : 0), 0);
    patch.viewers = viewers; patch.viewersAt = at; patch.peak = Math.max(control.peak || 0, total);
    await ctx.controlRef(stream.id).update(patch);
    // Mod Machina phase 3 part 2: prompts expire, breaks end, the Captain seat is kept filled, quiet leads are nudged (reads one document and does nothing when nobody is on duty)
    // Chat Games: close any deadline a Cloud Task missed (the backstop for chatGameDeadline)
    if (ctx.chatGames) { try { out.chatGames = await ctx.chatGames.sweep(stream); } catch (err) { out.errors.push("chatGames"); console.error("liveTick: chat games sweep failed", String((err && err.message) || err).slice(0, 160)); } }
    if (ctx.duty) { try { out.duty = await ctx.duty.tick(stream, at); } catch (err) { out.errors.push("duty"); console.error("liveTick: duty failed", String((err && err.message) || err).slice(0, 160)); } }
    // "Waiting for YouTube…": ask again every 15 seconds for the rest of this minute (control.yt.status stays "waiting" until found)
    if ((control.yt || {}).status === "waiting") {
      for (let i = 0; i < 3; i++) {
        await sleep(YT_RETRY_MS);
        const r = await controls.helpers.linkYoutube(stream.id, stream);
        if (r.status !== "waiting") break;
      }
    }
    await ctx.publishLive();
    return { ...out, total, peak: patch.peak };
  }
  const liveTick = onSchedule({ schedule: "every 1 minutes", timeoutSeconds: 60, secrets }, async () => { await runTick(); });

  // ---------- obsFeed ----------
  const setCors = (res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "content-type, x-live-key");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Cache-Control", "no-store");
  };
  const keyOf = (req) => {
    const q = (req.query && (req.query.k || req.query.key)) || (req.headers && req.headers["x-live-key"]) || (req.body && req.body.k);
    return typeof q === "string" ? q : "";
  };
  const send = (res, status, body) => { res.status(status).json(body); };

  async function chatGameDisplay(runId) {
    try {
      const r = (await db.doc(`${P.site}/chatGames/main/runs/${runId}`).get()).data() || {};
      return r.display ? { ...r.display, closesAt: r.closesAt && typeof r.closesAt.toMillis === "function" ? r.closesAt.toMillis() : null } : null;
    } catch (err) { return null; }
  }
  async function viewData() {
    const nowMs = now();
    const stream = (await ctx.currentStream()) || (await ctx.nextScheduled());
    const main = await ctx.mainDoc();
    if (!stream) return { state: "off", scene: "starting", look: main.look === "crt" ? "crt" : "hull", updatedAt: nowMs };
    const control = await ctx.control(stream.id);
    const shards = (await db.collection(P.countersCol(stream.id)).get()).docs.map((d) => d.data());
    const counts = L.sumShards(shards);
    const pub = L.buildPublicLive({
      stream: stream.state === "scheduled" ? { ...stream, state: "scheduled" } : { ...stream, beats: Object.fromEntries(Object.entries(stream.beats || {}).map(([k, b]) => [k, { ...b, checkins: counts.byBeat[k] != null ? counts.byBeat[k] : b.checkins || 0 }])) },
      window: control.window, counters: counts, viewers: control.viewers || {}, peak: control.peak || 0, onDuty: ctx.dutyHandles(stream), chatGame: control.chatGame || null, look: main.look, nowMs,
      rush: stream.state === "scheduled" ? null : await ctx.rushFor(stream),
    });
    const scene = L.autoScene({ stream, window: control.window, pinned: control.pinned, nowMs });
    const win = control.window;
    const open = stream.state === "live" && L.windowOpenNow(win, nowMs);
    const first = ((control.firstIn || {})[win ? win.beat : L.currentBeat(stream.beats)] || []).map((x) => x.handle).filter(Boolean);
    const planned = stream.plannedGames || [];
    return {
      ...pub,
      streamId: stream.id,
      title: pub.title != null ? pub.title : stream.title || null,
      crew: pub.state === "off" ? { captain: (stream.crew && stream.crew.captain) || null, chats: pub.crew.chats, onDuty: ctx.dutyHandles(stream) } : pub.crew,
      state: stream.state === "scheduled" ? "starting" : pub.state === "off" ? "off" : pub.state,
      plannedStart: stream.plannedStart ? L_ms(stream.plannedStart) : null,
      plannedGames: planned.map((g) => g.title).filter(Boolean).slice(0, 8),
      gameCovers: await ctx.vaultCovers(planned.filter((g) => g.title).slice(0, 8).map((g) => g.gameId)),   // public cover URLs, aligned with plannedGames
      nextStream: await ctx.nextPublished(),                // { title, start } of the next published stream, or null
      scene, brbUntil: scene === "brb" && control.brbUntil ? control.brbUntil : null,
      word: open ? win.word : null,                 // the check-in word, only while the window is open and only with a valid key
      firstIn: first,
      twitchStatus: (control.twitch || {}).status || null,
      // Chat Games (docs/specs/chat-games.md §3, §14): the active run's public card for the stream view scene (the run doc is public; nothing secret is in display)
      chatGameDisplay: pub.chatGame ? await chatGameDisplay(pub.chatGame.runId) : null,
    };
  }
  const L_ms = (t) => ctx.ms(t);

  /** The HTTPS handler (exported for the checks as a plain function). */
  async function handleObsFeed(req, res) {
    setCors(res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "GET") { send(res, 405, { ok: false, reason: "method" }); return; }
    const main = await ctx.mainDoc();
    if (!L.verifyKey(keyOf(req), main.obsKeyHash)) { send(res, 403, { ok: false, reason: "key" }); return; }
    try { send(res, 200, { ok: true, view: await viewData() }); }
    catch (err) { console.error("obsFeed failed", String((err && err.message) || err).slice(0, 160)); send(res, 500, { ok: false, reason: "error" }); }
  }
  const obsFeed = onRequest({ cors: true }, handleObsFeed);

  // ---------- liveDeck ----------
  const minuteKey = (t) => new Date(t).toISOString().slice(0, 16).replace(/\D/g, "");
  async function bump(docId, limit) {
    const ref = db.doc(P.rateLimit(docId));
    let allowed = true;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const count = snap.exists ? snap.get("count") || 0 : 0;
      if (count >= limit) { allowed = false; return; }
      tx.set(ref, { count: count + 1, expireAt: Timestamp.fromMillis(now() + 10 * 60 * 1000) }, { merge: true });
    });
    return allowed;
  }
  const DECK = { name: "Stream Deck", uid: null };
  async function deckAction(action, q) {
    const stream = await ctx.liveStream();
    if (!stream) throw fail("failed-precondition", "No stream is live.", "notLive");
    const base = { streamId: stream.id };
    const o = controls.ops;
    switch (action) {
      case "nextBeat": { const beat = L.nextBeat(stream.beats); if (!beat) throw fail("failed-precondition", "All four beats are done.", "noNextBeat"); return o.liveBeat(DECK, { ...base, action: "begin", beat }); }
      case "openCheckin": return o.liveCheckInWindow(DECK, { ...base, action: "open", lengthMinutes: q.minutes != null ? Number(q.minutes) : undefined });
      case "extend": return o.liveCheckInWindow(DECK, { ...base, action: "extend" });
      case "closeCheckin": return o.liveCheckInWindow(DECK, { ...base, action: "close" });
      case "scene": {
        const scene = q.scene;
        if (!["auto", "brb", "ending", "break-side"].includes(scene)) throw fail("invalid-argument", "The deck sets Auto, Be right back (brb), Ending or the Break side rail (break-side).", "scene");
        return o.liveScene(DECK, { ...base, scene, brbMinutes: q.brbMinutes != null ? Number(q.brbMinutes) : undefined });
      }
      case "nextGame": return o.switchGame(DECK, { ...base, next: true });
      default: throw fail("invalid-argument", "Unknown action.", "action");
    }
  }
  /** The HTTPS handler (a plain function for the checks). GET or POST ?k=<deck key>&action=... */
  async function handleLiveDeck(req, res) {
    setCors(res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (!["GET", "POST"].includes(req.method)) { send(res, 405, { ok: false, reason: "method" }); return; }
    const main = await ctx.mainDoc();
    const key = keyOf(req);
    if (!L.verifyKey(key, main.deckKeyHash)) {
      const within = await bump(`live_deckbad_${minuteKey(now())}`, BAD_KEY_LIMIT_PER_MIN);
      send(res, within ? 403 : 429, { ok: false, reason: within ? "key" : "rateLimit" });
      return;
    }
    if (!(await bump(`live_deck_${L.hashKey(key).slice(0, 16)}_${minuteKey(now())}`, DECK_LIMIT_PER_MIN))) { send(res, 429, { ok: false, reason: "rateLimit" }); return; }
    const q = { ...(req.query || {}), ...(req.body && typeof req.body === "object" ? req.body : {}) };
    const action = typeof q.action === "string" ? q.action : "";
    if (DECK_REFUSED.includes(action)) { send(res, 403, { ok: false, reason: "notOnDeck", message: "Start and Stop stay on the controls page." }); return; }
    if (DECK_LATER.includes(action)) { send(res, 501, { ok: false, reason: "notBuilt", message: "That arrives with Chat Games." }); return; }
    if (!DECK_ACTIONS.includes(action)) { send(res, 400, { ok: false, reason: "action" }); return; }
    try {
      const r = await deckAction(action, q);
      const { word: _w, ...safe } = r || {};                // the iPad never needs the word
      send(res, 200, { ok: true, ...safe });
    } catch (err) {
      const reason = (err && err.details && err.details.reason) || "error";
      if (reason === "error") console.error("liveDeck failed", String((err && err.message) || err).slice(0, 160));
      send(res, reason === "error" ? 500 : 409, { ok: false, reason });
    }
  }
  const liveDeck = onRequest({ cors: true }, handleLiveDeck);

  // ---------- liveViewerEntry ----------
  const liveViewerEntry = async (request) => {
    const w = await ctx.requireCrew(request);
    const data = request.data || {};
    const n = data.viewers;
    if (!Number.isInteger(n) || n < 0 || n > 10000000) throw fail("invalid-argument", "Type the viewer count as a whole number.", "viewers");
    const stream = await ctx.target(data);
    if (stream.state !== "live") throw fail("failed-precondition", "That stream isn't live.", "notLive");
    const at = now();
    const control = await ctx.control(stream.id);
    const viewers = { ...(control.viewers || {}), tiktok: n };
    await ctx.controlRef(stream.id).update({ tiktok: { viewers: n, at, by: w.handle || null }, viewers, peak: Math.max(control.peak || 0, L.PLATFORM_ROOMS.reduce((t, r) => t + (Number.isFinite(viewers[r]) ? viewers[r] : 0), 0)) });
    await ctx.logAdmin(w, { action: "viewerEntry", streamId: stream.id, title: stream.title, details: { room: "tiktok", viewers: n } });
    await ctx.publishLive();
    return { ok: true, streamId: stream.id, viewers: n };
  };

  // ---------- livePlatformStatus ----------
  /**
   * livePlatformStatus { streamId }: what the Start dialog shows while it is open. Owner and A2+. NO WRITES. Never returns an id, a video id or a token.
   *   { twitch: { live, viewers?, error? }, youtube: { eventStatus, connected, live, verticalWanted, verticalActive, error? }, tiktok: { planned, on }, checkedAt }
   * Twitch is Helix Get Streams on the app token exactly as liveTick does (the broadcaster id is resolved but never stored here). A missing
   * Twitch config is { live: false, error: "notConfigured" }. YouTube asks the active broadcasts with the same logic Start uses (pickYoutubeIds).
   */
  const livePlatformStatus = async (request) => {
    await ctx.requireStaff(request);
    const data = request.data || {};
    if (typeof data.streamId !== "string" || !data.streamId) throw fail("invalid-argument", "streamId is required.", "args");
    const stream = await ctx.loadStream(data.streamId);
    const backstage = stream.type === "backstage";
    const out = { twitch: { live: false }, youtube: { eventStatus: (stream.youtube && stream.youtube.status) || null, connected: false, live: false, verticalWanted: false, verticalActive: false }, tiktok: { planned: Array.isArray(stream.rooms) && stream.rooms.includes("tiktok") && !backstage, on: Array.isArray(stream.liveRooms) && stream.liveRooms.includes("tiktok") && !backstage }, checkedAt: now() };
    if (!backstage && (stream.rooms || []).includes("twitch")) {
      try {
        const cfg = (await db.doc(P.growthConfig).get()).data() || {};
        const id = cfg.twitchBroadcasterId ? String(cfg.twitchBroadcasterId) : await twitch().userId(twitchLogin ?? TWITCH_LOGIN.value());
        if (id) { const st = await twitch().streamStatus(id); out.twitch = { live: st.live, ...(st.live ? { viewers: st.viewers } : {}) }; }
        else out.twitch = { live: false, error: "unavailable" };
      } catch (err) { out.twitch = { live: false, error: /not configured/.test(String((err && err.message) || "")) ? "notConfigured" : "unavailable" }; }
    }
    if (youtube && youtube.apiClient) {
      try {
        const api = await youtube.apiClient();
        if (api) {
          out.youtube.connected = true;
          const w = (((await db.doc(P.watch(stream.id)).get()).data()) || {}).youtube || {};
          const pick = pickYoutubeIds({ stream, known: w, active: await api.list({ status: "active" }) });
          out.youtube.live = !pick.waiting.includes(backstage ? "event" : "landscape");
          out.youtube.verticalWanted = !backstage && (!Array.isArray(stream.rooms) || stream.rooms.includes("ytVertical"));
          out.youtube.verticalActive = out.youtube.verticalWanted && !pick.waiting.includes("vertical");
        }
      } catch (err) { out.youtube.error = "unavailable"; }
    }
    return out;
  };

  // ---------- backstageWatch ----------
  const backstageWatch = async (request) => {
    const uid = ctx.crew.requireAuth(request);
    const data = request.data || {};
    const w = await ctx.crew.who(uid);
    const stream = data.streamId != null ? await ctx.loadStream(data.streamId) : await ctx.liveStream();
    if (!stream) throw fail("failed-precondition", "No stream is live.", "notLive");
    if (stream.type !== "backstage") throw fail("failed-precondition", "That isn't a backstage stream.", "notBackstage");
    if (stream.state !== "live") throw fail("failed-precondition", "That stream isn't live.", "notLive");
    const profile = await db.doc(`${P.site}/profiles/${uid}`).get();
    const staff = w.isAdmin || w.isMod;
    const audience = stream.audience || "fanClub";
    // fanClub: every signed-up member (the Fan Club is free); subClub (billing, later): Sub Club members; staff always.
    const allowed = staff || (audience === "subClub" ? w.roles.includes("sub") : profile.exists);
    if (!allowed) throw fail("permission-denied", audience === "subClub" ? "This show is for Sub Club members." : "Join free to watch backstage.", "audience");
    const y = ((await db.doc(P.watch(stream.id)).get()).data() || {}).youtube || {};
    const videoId = y.backstageId || y.landscapeId || null;
    if (!videoId) throw fail("failed-precondition", "The video isn't ready yet.", "noVideo");
    return { ok: true, provider: "youtube", videoId };       // never logged, never written anywhere
  };

  return {
    functions: { onCheckInWritten, liveFlush, liveTick, obsFeed, liveDeck, liveViewerEntry: onCall(liveViewerEntry), livePlatformStatus: onCall({ secrets }, livePlatformStatus), backstageWatch: onCall(backstageWatch) },
    SECRETS: secrets,
    ops: { liveViewerEntry, livePlatformStatus, backstageWatch },
    helpers: { requestFlush, runFlushTask, flushNow, runTick, handleObsFeed, handleLiveDeck, viewData, FLUSH_QUEUE },
  };
};
