// Control Room, shared server helpers (docs/specs/control-room.md §13, §14). Internal: the other lib/live modules
// require this; nothing here is callable. Admin SDK only; firestore.rules gives clients no writes.
//
//   sites/{siteId}/streams/{id}                       the stream (public when published); beats, afterShowOf/Id, liveRooms, stats
//   …/streams/{id}/private/control                    owner + A2+ (rules): the CURRENT WORD per beat, window, pinned scene,
//                                                     first-in names, viewers, peak, TikTok count, YouTube status
//   …/streams/{id}/private/checklist                  OWNER ONLY: copied items and ticks per beat
//   …/streams/{id}/private/watch                      server only (lib/youtube): the YouTube ids (backstage video)
//   …/streams/{id}/presence/{uid}                     that member + admins (13 months)
//   …/streams/{id}/counters/{0-9}                     owner + A2+: check-in counts per beat and room (10 shards)
//   sites/{siteId}/live/main                          owner + A2+: settings, look, obsKeyHash, deckKeyHash (hashes only)
//   …/live/main/private/checklistTemplates            OWNER ONLY: the four beat templates
//   …/live/main/wordLog/{word}                        server only: when each word was last used (no repeats in 30 days)
//   sites/{siteId}/public/live                        public read: what /live shows (logic.buildPublicLive, never the word)
//
// "Crew on duty" in phase 1 (Mod Machina has no duty or clock-in documents yet): an admin, or a mod whose roster status is
// Active or Check-in (the Planner's onDuty). Seated crew (the stream's draft crew) are counted present when a window
// opens. When duty documents exist, `isCrewOnDuty` is the one place to tighten.
const { isDeepStrictEqual } = require("util");
const admin = require("firebase-admin");
const L = require("./logic");
const { makeStore, fail, ms } = require("../crew/store");
const { makeCore: makePlannerCore } = require("../planner/core");
const PL = require("../planner/logic");

const SITE_ID = "boomertanger";
const SITE = `sites/${SITE_ID}`;
const ENDED_VISIBLE_MS = 2 * 60 * 60 * 1000;          // "Just ended" shows on /live for 2 hours
const PRESENCE_TTL_MS = 396 * 24 * 60 * 60 * 1000;    // 13 months
const SHARDS = 10;
const TIME_KEYS = new Set(["actualStart", "actualEnd", "startedAt", "endedAt", "skippedAt", "windowOpenedAt"]);

const P = {
  site: SITE,
  streams: `${SITE}/streams`,
  stream: (id) => `${SITE}/streams/${id}`,
  draft: (id) => `${SITE}/streams/${id}/private/draft`,
  control: (id) => `${SITE}/streams/${id}/private/control`,
  duty: (id) => `${SITE}/streams/${id}/private/duty`,
  checklist: (id) => `${SITE}/streams/${id}/private/checklist`,
  watch: (id) => `${SITE}/streams/${id}/private/watch`,
  presenceCol: (id) => `${SITE}/streams/${id}/presence`,
  presence: (id, uid) => `${SITE}/streams/${id}/presence/${uid}`,
  countersCol: (id) => `${SITE}/streams/${id}/counters`,
  counter: (id, n) => `${SITE}/streams/${id}/counters/${n}`,
  main: `${SITE}/live/main`,
  templates: `${SITE}/live/main/private/checklistTemplates`,
  wordLog: `${SITE}/live/main/wordLog`,
  publicLive: `${SITE}/public/live`,
  outbox: `${SITE}/notifyOutbox`,
  vaultGame: (id) => `${SITE}/vaultGames/${id}`,
  rateLimit: (key) => `${SITE}/rateLimits/${key}`,
  eventSubSeen: (id) => `${SITE}/rateLimits/${id}`,
  growthConfig: `${SITE}/private/growthConfig`,
};

/** Times in a patch are milliseconds (the logic's currency); Firestore stores Timestamps. Converts the known time keys, any depth. */
function stamp(v, Timestamp = admin.firestore.Timestamp) {
  if (Array.isArray(v)) return v.map((x) => stamp(x, Timestamp));
  if (v && typeof v === "object" && !(v instanceof Timestamp) && typeof v.toMillis !== "function") {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, TIME_KEYS.has(k) && typeof x === "number" ? Timestamp.fromMillis(x) : stamp(x, Timestamp)]));
  }
  return v;
}

/** Shard 0-9 for a member (stable, spreads a burst of check-ins over the 10 counter documents). */
function shardOf(uid) {
  let h = 0;
  for (const c of String(uid)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % SHARDS;
}

function makeCore({ db = admin.firestore(), adminLogEntry, now = Date.now } = {}) {
  const { FieldValue, Timestamp } = admin.firestore;
  const crew = makeStore({ db, adminLogEntry });
  const planner = makePlannerCore({ db, adminLogEntry });
  const ctx = { db, FieldValue, Timestamp, crew, planner, now, P, fail, ms, adminLogEntry, settle: async () => {}, duty: null, chatGames: null };

  // ---------- who may call ----------
  /** Owner or A2+ (the owner always counts); { ownerOnly } narrows to the owner. A1 Steward is refused. */
  ctx.requireStaff = async (request, { ownerOnly = false } = {}) => {
    const uid = crew.requireAuth(request);
    const w = await crew.who(uid);
    if (ownerOnly ? !w.isOwner : !crew.a2plus(w)) throw ownerOnly ? fail("permission-denied", "Only the owner can do that.", "notOwner") : fail("permission-denied", "Only the owner or an Overseer can do that.", "notAllowed");
    return w;
  };
  /** Crew on duty (phase 1): an admin, or a mod who is Active or Check-in. The owner is crew for this purpose. */
  ctx.isCrewOnDuty = (w) => planner.onDuty(w);
  ctx.requireCrew = async (request) => {
    const uid = crew.requireAuth(request);
    const w = await crew.who(uid);
    if (!ctx.isCrewOnDuty(w)) throw fail("permission-denied", "Crew on duty only.", "notCrew");
    return w;
  };

  // ---------- logs ----------
  /** adminLog, feature "controlRoom". `actor` is a who() result, or { name } for the Stream Deck. Never put a key or the word in details. */
  ctx.logAdmin = async (actor, { action, streamId = null, title = "Control Room", reason = "", changes, details }) => {
    await db.collection("adminLog").add(await adminLogEntry(db, {
      feature: "controlRoom", action, itemPath: streamId ? P.stream(streamId) : P.main, itemTitle: title,
      actorUid: actor && actor.uid ? actor.uid : null, actorName: actor ? actor.name : "Automatic", reason, changes, details,
    }));
  };
  ctx.activity = async (type, summary, extra = {}) => {
    try { await db.collection("activityLog").add({ feature: "live", type, summary, link: "/live", actorName: null, ...extra, createdAt: FieldValue.serverTimestamp() }); }
    catch (err) { console.error("live: activityLog write failed", err); }
  };
  /** The planner's notifyOutbox writer (same shape, 30 day TTL). */
  ctx.outbox = (doc) => planner.outbox(doc);

  // ---------- documents ----------
  ctx.mainDoc = async () => ((await db.doc(P.main).get()).data()) || {};
  ctx.settings = async () => L.resolveSettings(await ctx.mainDoc());
  ctx.streamRef = (id) => db.doc(P.stream(id));
  ctx.controlRef = (id) => db.doc(P.control(id));
  ctx.control = async (id) => ((await ctx.controlRef(id).get()).data()) || {};
  ctx.loadStream = async (id) => {
    if (typeof id !== "string" || !id || id.includes("/")) throw fail("invalid-argument", "streamId is required.", "args");
    const snap = await db.doc(P.stream(id)).get();
    if (!snap.exists) throw fail("not-found", "That stream isn't there.", "noStream");
    return { id, ...snap.data() };
  };
  /** The stream that is live now (at most one), or null. */
  ctx.liveStream = async () => {
    const snap = await db.collection(P.streams).where("state", "==", "live").limit(2).get();
    const d = snap.docs[0];
    return d ? { id: d.id, ...d.data() } : null;
  };
  /** The id the caller named, else the live stream's. */
  ctx.target = async (data) => {
    if (data && data.streamId != null) return ctx.loadStream(data.streamId);
    const live = await ctx.liveStream();
    if (!live) throw fail("failed-precondition", "No stream is live.", "notLive");
    return live;
  };
  /** Writes a logic patch (ms times) to the stream doc, and mirrors the state fields into the planner's draft when there is one. */
  ctx.patchStream = async (id, patch, tx = null) => {
    const data = stamp(patch);
    if (tx) tx.update(db.doc(P.stream(id)), data); else await db.doc(P.stream(id)).update(data);
    const mirror = Object.fromEntries(["state", "actualStart", "actualEnd"].filter((k) => k in data).map((k) => [k, data[k]]));
    if (Object.keys(mirror).length) {
      const d = db.doc(P.draft(id));
      if ((await d.get()).exists) await d.update(mirror);
    }
  };
  /** Seated crew of a stream (uids and rooms) from the planner's draft: [{ uid, room }] (room null for the Captain). */
  ctx.seatedCrew = async (id) => {
    const draft = ((await db.doc(P.draft(id)).get()).data()) || {};
    const out = [];
    const c = draft.crew || {};
    if (c.captain && c.captain.uid) out.push({ uid: c.captain.uid, room: null });
    for (const r of PL.ROOMS) {
      const chat = (c.chats || {})[r];
      if (!chat) continue;
      if (chat.lead && chat.lead.uid) out.push({ uid: chat.lead.uid, room: r });
      for (const d of chat.deckhands || []) if (d && d.uid) out.push({ uid: d.uid, room: r });
    }
    return out;
  };
  /** Handles of the crew seated on a stream (public handles, from the stream doc). Phase 1 "on duty". */
  ctx.dutyHandles = (stream) => {
    const c = (stream && stream.crew) || {};
    const out = [];
    if (c.captain) out.push(c.captain);
    for (const chat of Object.values(c.chats || {})) {
      if (chat && chat.lead) out.push(chat.lead);
      for (const d of (chat && chat.deckhands) || []) out.push(d);
    }
    return [...new Set(out.filter((h) => typeof h === "string"))];
  };

  // ---------- public/live ----------
  /** The current beat's first check-ins as public handles (private/control holds { uid, handle }; the uid never leaves it). */
  const firstInOf = (control, stream) => {
    const beat = control.window && control.window.beat && L.windowOpenNow(control.window, now()) ? control.window.beat : L.currentBeat(stream.beats);
    return ((control.firstIn || {})[beat] || []).map((x) => (x && typeof x.handle === "string" ? x.handle : null)).filter(Boolean).slice(0, 3);
  };
  /** The stream /live shows: the live one, else the one that ended in the last 2 hours, else null (off air). */
  async function currentForPublic(nowMs) {
    const live = await ctx.liveStream();
    if (live) return live;
    const snap = await db.collection(P.streams).where("state", "==", "ended").orderBy("actualEnd", "desc").limit(1).get();
    const d = snap.docs[0];
    if (d && nowMs - ms(d.get("actualEnd")) <= ENDED_VISIBLE_MS) return { id: d.id, ...d.data() };
    return null;
  }
  /**
   * Rebuilds public/live (logic.buildPublicLive) and writes it ONLY when it changed (updatedAt aside). Refuses to write
   * anything findSecrets flags (a forbidden key, a video id, a key hash, a uid). Returns { wrote, id }.
   */
  // The public crew mirror (public/crew: handle, track, grade), read at most once a minute: grade chips on /live.
  let gradeCache = { at: 0, map: {} };
  ctx.crewGrades = async () => {
    if (now() - gradeCache.at < 60000) return gradeCache.map;
    try {
      const d = (await db.doc(`${SITE}/public/crew`).get()).data() || {};
      const map = {};
      for (const m of d.members || []) if (m && typeof m.handle === "string" && Number.isInteger(m.grade)) map[m.handle] = { track: m.track === "admin" ? "admin" : "mod", grade: m.grade };
      gradeCache = { at: now(), map };
    } catch (err) { console.error("live: couldn't read public/crew", String((err && err.message) || err).slice(0, 120)); gradeCache = { at: now(), map: gradeCache.map }; }
    return gradeCache.map;
  };
  /** Recruit Rush for public/live and the stream view: the MAIN stream's (an after-show shows its main stream's Rush), counted from the shards. Null when off. */
  ctx.rushFor = async (stream) => {
    if (!stream) return null;
    const mainId = typeof stream.afterShowOf === "string" && stream.afterShowOf ? stream.afterShowOf : stream.id;
    const rush = (await ctx.control(mainId)).recruitRush;
    if (!rush || rush.on !== true) return null;
    const shards = (await db.collection(P.countersCol(mainId)).get()).docs.map((d) => d.data());
    return { ...rush, count: L.sumRush(shards) };
  };
  ctx.publishLive = async () => {
    const nowMs = now();
    const stream = await currentForPublic(nowMs);
    const main = await ctx.mainDoc();
    let control = {}, shards = [], secrets = { words: [], videoIds: [] };
    if (stream) {
      control = await ctx.control(stream.id);
      shards = (await db.collection(P.countersCol(stream.id)).get()).docs.map((d) => d.data());
      // The word is deliberately NOT scanned for here: buildPublicLive copies no window field but open/closesAt/beat, and a
      // stream titled "Ghost night" on a ghost word day must not freeze /live. The check script proves the word never appears.
      const y = (((await db.doc(P.watch(stream.id)).get()).data()) || {}).youtube || {};
      secrets.videoIds = [y.landscapeId, y.backstageId, y.verticalId].filter(Boolean);
    }
    const counts = L.sumShards(shards);
    // the Deck's room coverage (handles and counts from private/duty; a uid never reaches public/live)
    const deckState = stream && stream.state === "live" ? ((await db.doc(P.duty(stream.id)).get()).data() || null) : null;
    const sb = {};
    for (const k of L.BEATS) if (stream && stream.beats && stream.beats[k]) sb[k] = { ...stream.beats[k], checkins: counts.byBeat[k] != null ? counts.byBeat[k] : stream.beats[k].checkins || 0 };
    const out = L.buildPublicLive({
      stream: stream ? { ...stream, beats: sb } : null, window: control.window || null, counters: counts, viewers: control.viewers || {},
      peak: control.peak || 0, onDuty: ctx.dutyHandles(stream), chatGame: control.chatGame || null, chatGameWaiting: control.chatGameWaiting || [], chatGameSettled: control.chatGameSettled || null, look: main.look, nowMs,
      deck: deckState ? { rooms: deckState.rooms || {} } : null,
      grades: stream ? await ctx.crewGrades() : {}, firstIn: stream && stream.state === "live" ? firstInOf(control, stream) : [],
      rush: await ctx.rushFor(stream),
    });
    const hits = L.findSecrets(out, secrets);
    if (hits.length) { console.error("live: public/live not written, it would expose:", hits.join(", ")); return { wrote: false, id: stream ? stream.id : null, blocked: hits }; }
    const ref = db.doc(P.publicLive);
    const prev = (await ref.get()).data();
    const strip = (o) => { if (!o) return o; const { updatedAt: _u, ...rest } = o; return rest; };
    if (prev && isDeepStrictEqual(strip(prev), strip(out))) return { wrote: false, id: stream ? stream.id : null };
    await ref.set(out);
    return { wrote: true, id: stream ? stream.id : null };
  };

  ctx.currentStream = () => currentForPublic(now());
  // Public cover URLs of Game Vault games (docs/specs/control-room.md §8: the Starting soon scene shows the real covers). One vaultGames read per slug,
  // kept 10 minutes in memory; hidden games and games without a cover give null. Only the URL leaves, nothing else of the game.
  const coverCache = new Map();
  ctx.vaultCovers = async (slugs) => {
    const out = [];
    for (const slug of slugs) {
      if (typeof slug !== "string" || !slug || slug.includes("/")) { out.push(null); continue; }
      const hit = coverCache.get(slug);
      if (hit && now() - hit.at < 600000) { out.push(hit.url); continue; }
      let url = null;
      try { const d = (await db.doc(P.vaultGame(slug)).get()).data(); if (d && d.hidden !== true) url = L.coverUrl(d.cover); } catch (err) { /* no cover: the scene shows the title only */ }
      coverCache.set(slug, { at: now(), url });
      out.push(url);
    }
    return out;
  };
  // The next published stream still to come ({ title, start } in ms) from the published schedule, or null; kept a minute in memory.
  let nextCache = { at: -Infinity, v: null };
  ctx.nextPublished = async () => {
    if (now() - nextCache.at < 60000) return nextCache.v;
    let v = null;
    try {
      const snap = await db.collection(P.streams).where("state", "==", "scheduled").where("plannedStart", ">=", Timestamp.fromMillis(now())).orderBy("plannedStart", "asc").limit(5).get();
      const d = snap.docs.map((x) => x.data()).find((x) => x.published === true);
      if (d) v = { title: typeof d.title === "string" && d.title ? d.title : (d.theme && d.theme.label) || "Stream", start: ms(d.plannedStart) };
    } catch (err) { console.error("live: next stream read failed", String((err && err.message) || err).slice(0, 120)); }
    nextCache = { at: now(), v };
    return v;
  };
  /** The next scheduled stream (for the stream view's Starting soon scene), or null. */
  ctx.nextScheduled = async () => {
    const snap = await db.collection(P.streams).where("state", "==", "scheduled").where("plannedStart", ">=", Timestamp.fromMillis(now() - 12 * 60 * 60 * 1000)).orderBy("plannedStart", "asc").limit(1).get();
    const d = snap.docs[0];
    return d ? { id: d.id, ...d.data() } : null;
  };
  ctx.expireAt = (ms0) => Timestamp.fromMillis(ms0);
  return ctx;
}

module.exports = { makeCore, P, SITE_ID, SITE, SHARDS, PRESENCE_TTL_MS, ENDED_VISIBLE_MS, stamp, shardOf, fail, ms };
