// Skipper Cam (docs/specs/base-camp.md "Skipper Cam"): an unlisted YouTube live stream of Skipper from the office, for Fan Club members, sound always
// off. Written ONLY here (Admin SDK).
//   sites/boomertanger/public/skipperCam     { live, since, lastOn }   public (the page's chip and the cam-off picture)
//   sites/boomertanger/skipperCam/control    { videoId, checks, updatedAt }   the owner reads it (rules); the video id is handed out only by
//                                            skipperCamWatch, never logged
//
//   skipperCamSet    the owner     { live: true, videoId, checks: { sound, privateDetails, window } } goes live only with all three privacy checks and
//                                  a video id; { live: false } is always allowed. adminLog feature "skipperCam" (the id is never in the log).
//   skipperCamWatch  members       -> { videoId } while it's live (signed up: a profile; staff always), the same pattern as backstageWatch
//   skipperCamSweep  schedule      every 15 minutes: off after 12 hours live, in case Boomer forgets
//
// build(deps) is what scripts/check-skipper-cam.js runs against the in-memory Firestore: { db, adminLogEntry, now }.
const { onCall } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const { SITE_ID, fail, callerInfo } = require("../vault/common");

const SITE = `sites/${SITE_ID}`;
const MAX_LIVE_MS = 12 * 60 * 60 * 1000;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CHECKS = ["sound", "privateDetails", "window"];

/** A YouTube video id from an id or a watch / live / share link; null when it isn't one. */
function videoIdOf(v) {
  const s = String(v ?? "").trim();
  if (VIDEO_ID.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|[?&]v=|\/live\/|\/embed\/)([A-Za-z0-9_-]{11})(?:[?&#/]|$)/);
  return m ? m[1] : null;
}

function build(deps = {}) {
  const db = deps.db || admin.firestore();
  const { Timestamp } = admin.firestore;
  const now = deps.now || Date.now;
  const pubRef = db.doc(`${SITE}/public/skipperCam`);
  const ctlRef = db.doc(`${SITE}/skipperCam/control`);
  const ms = (t) => (t == null ? null : typeof t === "number" ? t : typeof t.toMillis === "function" ? t.toMillis() : null);

  async function log(actor, action, details) {
    if (!deps.adminLogEntry) return;
    try { await db.collection("adminLog").add(await deps.adminLogEntry(db, { feature: "skipperCam", action, itemPath: `${SITE}/public/skipperCam`, itemTitle: "Skipper Cam", actorUid: actor.uid, actorName: actor.name, details })); }
    catch (err) { console.error("skipperCam: adminLog write failed", String((err && err.message) || err).slice(0, 160)); }
  }

  // ---------- skipperCamSet ----------
  async function set(request) {
    const c = await callerInfo(request);
    if (!c.isOwner) throw fail("permission-denied", "The Skipper Cam is the owner's.", "notOwner");
    const d = request.data || {};
    if (typeof d.live !== "boolean") throw fail("invalid-argument", "On or off?", "badInput");
    const at = now();
    if (!d.live) {
      const was = (await pubRef.get()).data() || {};
      await pubRef.set({ live: false, since: null, lastOn: was.live ? Timestamp.fromMillis(at) : was.lastOn ?? null });
      if (was.live) await log(c, "off", { by: "owner", minutes: ms(was.since) ? Math.round((at - ms(was.since)) / 60000) : null });
      return { ok: true, live: false };
    }
    const checks = d.checks || {};
    const missing = CHECKS.filter((k) => checks[k] !== true);
    if (missing.length) throw fail("failed-precondition", "Tick all three privacy checks before going live.", "checks", { missing });
    const videoId = videoIdOf(d.videoId);
    if (!videoId) throw fail("invalid-argument", "Paste the YouTube video id (11 characters) or its link.", "videoId");
    const was = (await pubRef.get()).data() || {};
    await ctlRef.set({ videoId, checks: { sound: true, privateDetails: true, window: true, at: Timestamp.fromMillis(at) }, updatedAt: Timestamp.fromMillis(at) });
    await pubRef.set({ live: true, since: was.live && was.since ? was.since : Timestamp.fromMillis(at), lastOn: was.lastOn ?? null });
    if (!was.live) await log(c, "goLive", { checks: CHECKS });
    return { ok: true, live: true };
  }

  // ---------- skipperCamWatch ----------
  async function watch(request) {
    const c = await callerInfo(request);
    if (!c.member && !c.isStaff) throw fail("permission-denied", "Join free to watch the Skipper Cam.", "audience");
    const pub = (await pubRef.get()).data() || {};
    if (!pub.live) throw fail("failed-precondition", "The Skipper Cam is off right now.", "notLive");
    const videoId = ((await ctlRef.get()).data() || {}).videoId || null;
    if (!videoId) throw fail("failed-precondition", "The video isn't ready yet.", "noVideo");
    return { ok: true, provider: "youtube", videoId };   // never logged, never written anywhere else
  }

  // ---------- skipperCamSweep ----------
  async function sweep() {
    const pub = (await pubRef.get()).data() || {};
    const since = ms(pub.since);
    if (!pub.live || !since || now() - since < MAX_LIVE_MS) return { turnedOff: false };
    const at = now();
    await pubRef.set({ live: false, since: null, lastOn: Timestamp.fromMillis(at) });
    await log({ uid: "system", name: "Skipper Cam sweep" }, "off", { by: "sweep", minutes: Math.round((at - since) / 60000) });
    return { turnedOff: true };
  }

  return {
    functions: {
      skipperCamSet: onCall(set),
      skipperCamWatch: onCall(watch),
      skipperCamSweep: onSchedule({ schedule: "every 15 minutes", timeZone: "America/Chicago" }, async () => { await sweep(); }),
    },
    ops: { set, watch, sweep },
  };
}

module.exports = { build, videoIdOf, MAX_LIVE_MS };
