// YouTube events, Cloud Functions (docs/specs/scream-planner.md section 15; control-room.md section 11).
// The site creates every YouTube event; the owner only picks it in Streamlabs. Pure rules live in logic.js,
// Google OAuth in auth.js, the Data API client in api.js. functions/index.js calls this factory with its
// adminLog helper and spreads the result into its exports, the same way lib/growth does.
//
//   youtubeConnect   owner-only callable: swaps the Google sign-in code for tokens (the /auth/youtube/callback page)
//   youtubeStatus    owner or A2+ callable: { connected, channelTitle }, nothing secret
//   youtubeRetry     A2+ or owner callable: re-runs the sync for one stream now (ignores the hash)
//   youtubeSync      trigger on sites/{siteId}/streams/{streamId}: create, update or delete the event
//   youtubeTidy      daily: makes ended backstage videos private after makeBackstagePrivateAfterDays
//
// Where things live:
//   streams/{id}/private/watch          SERVER ONLY (firestore.rules): provider, youtube.{landscapeId,backstageId,
//                                       verticalId,hash,syncedAt}. The hash is what the event shows (logic.syncHash).
//   streams/{id}.youtube                PUBLIC status only: { status: ok|pending|failed, syncedAt, error?, warning?,
//                                       madePrivateAt? }. Never an event id, video id or token.
//   sites/{siteId}/private/youtubeChannel   tokens, server only (lib/youtube/auth.js)
// Params: YOUTUBE_CLIENT_ID (functions/.env, public). Secret: YOUTUBE_CLIENT_SECRET
// (firebase functions:secrets:set YOUTUBE_CLIENT_SECRET --project <alias>, set by the owner himself).
const { isDeepStrictEqual } = require("util");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret, defineString } = require("firebase-functions/params");
const admin = require("firebase-admin");
const L = require("./logic");
const { makeAuth, REDIRECTS, YoutubeAuthError } = require("./auth");
const { makeApi, YoutubeError } = require("./api");
const { makeStore } = require("../crew/store");

const SITE_ID = "boomertanger";
const SITE = `sites/${SITE_ID}`;
const TZ = "America/Chicago";
const YOUTUBE_CLIENT_ID = defineString("YOUTUBE_CLIENT_ID", { default: "" });
const YOUTUBE_CLIENT_SECRET = defineSecret("YOUTUBE_CLIENT_SECRET");
const SECRETS = [YOUTUBE_CLIENT_SECRET];
const RECONNECT = "Reconnect YouTube on /admin";
const SITE_URLS = { "boomertanger-staging": "https://staging.boomertanger.com", "boomertanger-prod": "https://boomertanger.com" };

const fail = (code, message, reason) => new HttpsError(code, message, { reason });
function envProjectId() {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  try { return JSON.parse(process.env.FIREBASE_CONFIG || "{}").projectId || ""; } catch { return ""; }
}

/** The short text the chip shows for a failure: never a token, never an id (logic.statusDocShape scrubs it again). */
function failureText(err) {
  if (err instanceof YoutubeAuthError) return err.code === "network" ? "Could not reach Google. Try Retry later." : RECONNECT;
  if (err instanceof YoutubeError) {
    if (err.kind === "quotaExceeded") return "YouTube quota used up for today";
    if (err.kind === "unauthorized") return RECONNECT;
    return err.message || "YouTube refused the request";
  }
  return "YouTube sync failed";
}

/** Builds everything. `deps` beyond adminLogEntry are for scripts/check-youtube.js (fake Google, clock, secrets). */
function build({ adminLogEntry, fetchFn, clientId, clientSecret, now = Date.now, projectId = envProjectId } = {}) {
  const db = admin.firestore();
  const { FieldValue } = admin.firestore;
  const crew = makeStore({ db, adminLogEntry });
  const pid = () => (typeof projectId === "function" ? projectId() : projectId);
  const doFetch = (...a) => (fetchFn || fetch)(...a);
  const auth = () => makeAuth({ db, fetchFn: doFetch, clientId: clientId ?? YOUTUBE_CLIENT_ID.value(), clientSecret: clientSecret ?? YOUTUBE_CLIENT_SECRET.value(), now });
  const path = { stream: (id) => `${SITE}/streams/${id}`, watch: (id) => `${SITE}/streams/${id}/private/watch` };

  /** Owner or A2+ (the owner always counts). */
  async function requireStaff(request, { ownerOnly = false } = {}) {
    const uid = crew.requireAuth(request);
    const w = await crew.who(uid);
    if (ownerOnly ? !w.isOwner : !crew.a2plus(w)) throw ownerOnly ? fail("permission-denied", "Only the owner can do that.", "notOwner") : fail("permission-denied", "Only the owner or an Overseer can do that.", "notAllowed");
    return w;
  }

  // ---------- the sync ----------
  /** Writes the public status. Dotted fields so madePrivateAt (the tidy job) survives and a stale error/warning goes away. */
  async function writeStatus(streamId, shape) {
    const u = { "youtube.status": shape.status, "youtube.syncedAt": shape.syncedAt, "youtube.error": shape.error ?? FieldValue.delete(), "youtube.warning": shape.warning ?? FieldValue.delete() };
    try { await db.doc(path.stream(streamId)).update(u); }
    catch (err) { if (err.code !== 5) throw err; }   // the stream was removed meanwhile
  }
  const watchIds = (y, type, eventId) => (eventId === null
    ? { landscapeId: null, backstageId: null, verticalId: y.verticalId || null }
    : type === "backstage" ? { landscapeId: null, backstageId: eventId, verticalId: y.verticalId || null } : { landscapeId: eventId, backstageId: null, verticalId: y.verticalId || null });
  async function writeWatch(streamId, y, type, eventId, hash) {
    await db.doc(path.watch(streamId)).set(L.watchDocShape(watchIds(y, type, eventId), { hash, syncedAt: now() }), { merge: true });
  }
  async function coverOf(stream) {
    const gameId = stream ? L.firstGameId(stream) : null;
    if (!gameId) return null;
    const g = await db.doc(`${SITE}/vaultGames/${gameId}`).get();
    return g.exists ? g.get("cover") || null : null;
  }
  async function setThumbnail(api, eventId, stream, cover) {
    if (!cover || stream.type === "backstage") return null;   // backstage and no cover: no card exists yet, skip
    try {
      const img = await api.downloadImage(L.thumbnailUrl(cover));
      await api.thumbnail(eventId, img.bytes, img.contentType);
      return null;
    } catch (err) { return `Thumbnail skipped: ${err.message || "it could not be set"}`; }
  }

  /**
   * One sync. before/after are the stream doc before and after the write (after null: removed). force (Retry)
   * ignores the stored hash and pending edits. Never throws: a YouTube failure becomes status "failed".
   * Returns { action, status }.
   */
  async function syncStream(streamId, { before, after, force = false }) {
    const y = ((await db.doc(path.watch(streamId)).get()).data() || {}).youtube || {};
    const eventId = y.landscapeId || y.backstageId || null;
    let a = after, b = before;
    if (force && after) { a = { ...after, hasUnpublishedChanges: false }; b = a; }
    const cover = await coverOf(a);
    const d = L.decide(b, a, { synced: { eventId, hash: force ? null : y.hash }, cover });
    const finish = async (status, error, warning) => {
      if (after) await writeStatus(streamId, L.statusDocShape(status, error, now(), warning));
      return { action: d.action, status };
    };
    if (d.action === "none") {
      // A removed stream never leaves its server-only watch doc behind, even when it had no event any more (a cancelled stream's ids are already cleared).
      if (!after) await db.doc(path.watch(streamId)).delete();
      return { action: "none", status: after?.youtube?.status || "ok" };
    }
    try {
      const au = auth();
      if (!(await au.status()).connected) return await finish("pending");      // not connected yet: skip quietly
      const api = makeApi({ fetchFn: doFetch, token: await au.accessToken() });
      const site = await db.doc(SITE).get();
      const siteUrl = (site.exists && site.get("siteUrl")) || SITE_URLS[pid()] || SITE_URLS["boomertanger-prod"];
      let warning = null;
      const hash = a ? L.syncHash(a, cover) : null;
      const create = async () => {
        const ev = await api.insert(L.buildEvent(a, { siteUrl, projectId: pid(), cover }));
        await writeWatch(streamId, y, a.type, ev.id, hash);
        return ev.id;
      };
      // One log line per sync action: server-side only (Cloud Logging, admins), so the ids it names are never in a doc anyone else can read.
      const logAction = (act, id) => console.log(`youtubeSync ${streamId}: ${act} ${id || "-"}${force ? " (retry)" : ""}`);
      if (d.action === "create") {
        const id = await create();
        logAction("create", id);
        warning = await setThumbnail(api, id, a, cover);
      } else if (d.action === "update") {
        let id = eventId;
        try {
          await api.update(eventId, L.buildEvent(a, { siteUrl, projectId: pid(), cover }));
          await writeWatch(streamId, y, a.type, eventId, hash);
          logAction("update", eventId);
        } catch (err) {
          if (!(err instanceof YoutubeError) || err.kind !== "notFound") throw err;
          id = await create();                                                  // deleted by hand: make a new one
          logAction("recreate (the old event was gone)", id);
          warning = "The YouTube event was deleted by hand, so a new one was made.";
        }
        const thumb = await setThumbnail(api, id, a, cover);
        warning = warning || thumb;
      } else {                                                                   // delete
        let gone = false;
        try { await api.remove(eventId); } catch (err) { if (!(err instanceof YoutubeError) || err.kind !== "notFound") throw err; gone = true; }
        logAction(gone ? "delete (already gone)" : "delete", eventId);
        await writeWatch(streamId, y, after?.type, null, null);
        if (!after) await db.doc(path.watch(streamId)).delete();
      }
      return await finish("ok", null, warning);
    } catch (err) {
      console.error(`youtubeSync ${streamId}: ${d.action} failed`, err?.name, err?.kind || err?.code || "", String(err?.message || err).slice(0, 200));
      return await finish("failed", failureText(err));
    }
  }

  const youtubeSync = onDocumentWritten({ document: "sites/{siteId}/streams/{streamId}", secrets: SECRETS }, async (event) => {
    const { siteId, streamId } = event.params;
    if (siteId !== SITE_ID) return;
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after = event.data.after.exists ? event.data.after.data() : null;
    // The sync's own write-back (and the tidy job's) only touches youtube.*: nothing to do, which ends the loop.
    if (before && after) {
      const { youtube: _b, ...b } = before; const { youtube: _a, ...a } = after;
      if (isDeepStrictEqual(a, b)) return;
    }
    await syncStream(streamId, { before, after });
  });

  // ---------- callables ----------
  const youtubeConnect = onCall({ secrets: SECRETS }, async (request) => {
    const w = await requireStaff(request, { ownerOnly: true });
    const { code, redirectUri } = request.data || {};
    if (typeof code !== "string" || !code || code.length > 2000) throw fail("invalid-argument", "Google didn't send a code.", "code");
    if (!(REDIRECTS[pid()] || []).includes(redirectUri)) throw fail("invalid-argument", "That return address isn't allowed.", "redirectUri");
    const cid = clientId ?? YOUTUBE_CLIENT_ID.value(), sec = clientSecret ?? YOUTUBE_CLIENT_SECRET.value();
    if (!cid || !sec) throw fail("failed-precondition", "The YouTube app isn't set up yet.", "youtubeOff");
    let out;
    try { out = await auth().exchangeCode({ code, redirectUri, connectedBy: w.uid }); }
    catch (err) {
      console.error("youtubeConnect: exchange failed", err?.code, String(err?.message || "").slice(0, 120));
      if (err instanceof YoutubeAuthError && err.code === "network") throw fail("unavailable", "Could not reach Google. Try again.", "network");
      if (err instanceof YoutubeAuthError && /refresh token/i.test(err.message)) throw fail("failed-precondition", "Google didn't send a refresh token. Connect again.", "noRefreshToken");
      if (err instanceof YoutubeAuthError && /no YouTube channel/i.test(err.message)) throw fail("failed-precondition", "That Google account has no YouTube channel.", "noChannel");
      throw fail("permission-denied", "Google didn't accept that. Try connecting again.", "exchange");
    }
    await db.collection("adminLog").add(await adminLogEntry(db, {
      feature: "screamPlanner", action: "youtubeConnect", itemPath: `${SITE}/private/youtubeChannel`, itemTitle: "YouTube channel",
      actorUid: w.uid, actorName: w.name, reason: "", details: { channelTitle: out.channelTitle },
    }));
    return { ok: true, channelTitle: out.channelTitle };
  });

  const youtubeStatus = onCall(async (request) => {
    await requireStaff(request);
    return auth().status();
  });

  const youtubeRetry = onCall({ secrets: SECRETS }, async (request) => {
    await requireStaff(request);
    const streamId = request.data?.streamId;
    if (typeof streamId !== "string" || !streamId || streamId.includes("/")) throw fail("invalid-argument", "streamId is required.", "args");
    const snap = await db.doc(path.stream(streamId)).get();
    if (!snap.exists) throw fail("not-found", "That stream isn't there.", "noStream");
    const stream = snap.data();
    const out = await syncStream(streamId, { before: stream, after: stream, force: true });
    return { ok: out.status !== "failed", status: out.status };
  });

  // ---------- the daily tidy ----------
  /** Days after the stream before a backstage video goes private: live/main.makeBackstagePrivateAfterDays; 0 or false turns it off. */
  async function tidyDays() {
    const v = (await db.doc(`${SITE}/live/main`).get()).get("makeBackstagePrivateAfterDays");
    if (v === 0 || v === false) return 0;
    return Number.isFinite(v) && v > 0 ? v : L.DEFAULT_TIDY_DAYS;
  }
  async function runTidy(nowMs = now()) {
    const days = await tidyDays();
    const counts = { days, checked: 0, madePrivate: 0, marked: 0, skipped: 0, failed: 0 };
    if (!days) { console.log("youtubeTidy: off"); return counts; }
    const snap = await db.collection(`${SITE}/streams`).where("state", "==", "ended").where("type", "==", "backstage").get();
    const due = snap.docs.filter((d) => L.shouldMakePrivate(d.data(), nowMs, days));
    counts.checked = snap.docs.length;
    const staging = L.isStaging(pid());
    let api = null, quota = false;
    for (const d of due) {
      if (quota) { counts.skipped++; continue; }
      const y = ((await db.doc(path.watch(d.id)).get()).data() || {}).youtube || {};
      const videoId = y.backstageId || y.landscapeId || null;
      try {
        if (videoId && !staging) {                                             // staging events are private from the start
          if (!api) {
            const au = auth();
            if (!(await au.status()).connected) { console.warn("youtubeTidy: YouTube is not connected, nothing changed"); counts.skipped = due.length; return counts; }
            api = makeApi({ fetchFn: doFetch, token: await au.accessToken() });
          }
          try { await api.setVideoPrivate(videoId); counts.madePrivate++; }
          catch (err) { if (!(err instanceof YoutubeError) || err.kind !== "notFound") throw err; }   // already gone from YouTube: done
        }
        await db.doc(path.stream(d.id)).update({ "youtube.madePrivateAt": nowMs });
        counts.marked++;
      } catch (err) {
        counts.failed++;
        if (err instanceof YoutubeError && err.kind === "quotaExceeded") quota = true;
        if (err instanceof YoutubeAuthError) { counts.skipped = due.length - counts.marked - counts.failed; console.error("youtubeTidy: auth failed", err.code); return counts; }
        console.error(`youtubeTidy ${d.id}: failed`, err?.kind || err?.code || "", String(err?.message || err).slice(0, 200));
      }
    }
    console.log("youtubeTidy:", JSON.stringify(counts));
    return counts;
  }
  const youtubeTidy = onSchedule({ schedule: "20 4 * * *", timeZone: TZ, secrets: SECRETS }, async () => { await runTidy(); });

  return {
    functions: { youtubeConnect, youtubeStatus, youtubeRetry, youtubeSync, youtubeTidy },
    hooks: { syncStream, runTidy, tidyDays },
  };
}

module.exports = (deps) => build(deps).functions;
module.exports.build = build;
