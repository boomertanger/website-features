// functions/lib/youtube/logic.js: YouTube events, the PURE part (docs/specs/scream-planner.md
// section 15, control-room.md section 11). No I/O, no Firebase, no clock reads: everything the
// youtubeSync trigger, the callables and youtubeTidy decide comes from here, so
// scripts/check-youtube.js tests every rule without credentials or network.
//
// A stream is the plain object streams/{id} holds (times may be Firestore Timestamps, Dates or
// milliseconds). The Vault cover URL is NOT on the stream (plannedGames carries gameId and title
// only), so the caller looks up the first planned game's `cover` and passes it in.
const crypto = require("crypto");

const STAGING_PROJECT = "boomertanger-staging";
const STAGING_PREFIX = "[STAGING] ";
const TITLE_MAX = 100;           // YouTube's limit for a broadcast title
const DESCRIPTION_MAX = 5000;    // YouTube's limit for a description
const ERROR_MAX = 200;           // the error text kept on the public stream doc
const DEFAULT_TIDY_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const ms = (at) => (at == null ? 0 : typeof at === "number" ? at : at.toMillis ? at.toMillis() : at.getTime ? at.getTime() : 0);
const iso = (at) => new Date(ms(at)).toISOString();
const isStaging = (projectId) => projectId === STAGING_PROJECT;
const isStagingTitle = (t) => typeof t === "string" && t.startsWith(STAGING_PREFIX);
const isBackstage = (s) => (s && s.type) === "backstage";

/** First planned game's id (by `order`, then array position) or null. Callers use it to find the cover. */
function firstGameId(stream) {
  const g = [...(stream?.plannedGames || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
  return g?.gameId || (stream?.plannedGameIds || [])[0] || null;
}

/** The live page link every event description carries. */
const liveUrl = (siteUrl) => `${String(siteUrl || "").replace(/\/+$/, "")}/live`;

/**
 * Cloudinary covers are 3:4 and may be webp/avif; YouTube wants 16:9 jpg or png under 2 MB. For a
 * Cloudinary URL this inserts a transformation (padded to 1280x720 on a blurred copy, as jpg);
 * any other URL is returned as is. UNVERIFIED against live Cloudinary: see the part 8 notes.
 */
function thumbnailUrl(cover) {
  if (typeof cover !== "string" || !cover) return null;
  const m = cover.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)$/);
  return m ? `${m[1]}c_pad,b_blurred:400:15,w_1280,h_720,f_jpg/${m[2]}` : cover;
}

/**
 * The liveBroadcasts payload for a stream (insert and update use the same body; update adds the id).
 *  - snippet: title (staging: "[STAGING] " first, capped at 100), description (a short line about
 *    the stream, the games, then the /live link), scheduledStartTime, scheduledEndTime when known.
 *  - status.privacyStatus: public for platform streams, unlisted for backstage. STAGING RULE: on
 *    boomertanger-staging every event is private, whatever the stream says. Production only ever
 *    produces public or unlisted.
 *  - contentDetails: latencyPreference "low" (the spec's Low latency); enableAutoStart and
 *    enableAutoStop false (the owner starts and stops in Streamlabs, the site never goes live by
 *    itself); monitorStream off (no broadcast delay is needed for low latency); embed on (the
 *    /live page embeds the player); DVR on so late viewers can rewind.
 *  - selfDeclaredMadeForKids false (required answer).
 */
function buildEvent(stream, { siteUrl, projectId, cover } = {}) {
  const staging = isStaging(projectId);
  const base = String(stream?.title || "Boomertanger stream").trim() || "Boomertanger stream";
  const title = ((staging ? STAGING_PREFIX : "") + base).slice(0, TITLE_MAX);
  const games = (stream?.plannedGames || []).map((g) => g.title).filter(Boolean);
  const backstage = isBackstage(stream);
  const lines = [
    backstage ? `${base}: a backstage stream for the Boomertanger fan club.` : `${base}: live on Boomertanger.`,
  ];
  if (games.length) lines.push(`Playing: ${games.slice(0, 8).join(", ")}.`);
  lines.push(`Watch and chat: ${liveUrl(siteUrl)}`);
  if (staging) lines.unshift("[STAGING] test event, safe to ignore.");
  const snippet = {
    title,
    description: lines.join("\n\n").slice(0, DESCRIPTION_MAX),
    scheduledStartTime: iso(stream?.plannedStart),
  };
  if (ms(stream?.plannedEnd) > 0) snippet.scheduledEndTime = iso(stream.plannedEnd);
  return {
    snippet,
    status: { privacyStatus: staging ? "private" : backstage ? "unlisted" : "public", selfDeclaredMadeForKids: false },
    contentDetails: {
      latencyPreference: "low", enableAutoStart: false, enableAutoStop: false,
      enableDvr: true, enableEmbed: true, recordFromStart: true,
      monitorStream: { enableMonitorStream: false },
    },
  };
}

/**
 * A stable hash of EXACTLY the fields an event shows: title, start, end, type (privacy), audience
 * (privacy), slug (the link), game titles, and the thumbnail URL. Never status, syncedAt, rev,
 * crew, anything the sync itself writes: so writing youtube.status / syncedAt back to the stream
 * can't change the hash and the trigger can't loop.
 */
function syncHash(stream, cover) {
  const key = JSON.stringify([
    String(stream?.title || ""), ms(stream?.plannedStart), ms(stream?.plannedEnd),
    stream?.type || "platform", stream?.audience || "", stream?.slug || "",
    (stream?.plannedGames || []).map((g) => g.title || g.gameId || ""), thumbnailUrl(cover) || "",
  ]);
  return crypto.createHash("sha1").update(key).digest("hex").slice(0, 16);
}

/** Streams that carry an event: scheduled and published, or ad hoc / after-show (synced at once). */
const wantsEvent = (s) => !!s && s.state !== "cancelled" && !s.actualStart && s.state !== "live" && s.state !== "ended"
  && ((s.state === "scheduled" && s.published === true) || ((s.adhoc === true || !!s.afterShowOf) && ["planned", "scheduled"].includes(s.state)));

/**
 * What the trigger does for a stream write.
 *   before, after   the stream before and after the write (null when it didn't exist / was removed)
 *   synced          what was last synced: { eventId, hash } (eventId null/absent: no event yet)
 *   cover           the CURRENT first-game cover URL (for the hash); the stored hash IS the "before"
 * Returns { action: "create" | "update" | "delete" | "none", reason }.
 */
function decide(before, after, { synced, cover } = {}) {
  const eventId = synced?.eventId || null;
  const none = (reason) => ({ action: "none", reason });
  // The stream is gone: delete its event if it had one (a published stream removed).
  if (!after) return eventId ? { action: "delete", reason: "removed" } : none("removed, no event");
  // The Control Room owns an event once the stream has started: never touch it.
  if (after.actualStart || before?.actualStart || after.state === "live" || after.state === "ended") return none("started");
  if (after.state === "cancelled") return eventId ? { action: "delete", reason: "cancelled" } : none("cancelled, no event");
  if (!wantsEvent(after)) return none("not published");
  if (!eventId) return { action: "create", reason: after.adhoc || after.afterShowOf ? "adhoc" : "published" };
  const delayChanged = ms(after.delay?.at) !== ms(before?.delay?.at);
  const moved = ms(after.plannedStart) !== ms(before?.plannedStart) || ms(after.plannedEnd) !== ms(before?.plannedEnd);
  // An unpublished edit waits for Publish changes: except a delay, which moves the start at once.
  if (after.hasUnpublishedChanges === true && !(moved && delayChanged)) return none("unpublished changes");
  if (syncHash(after, cover) === synced?.hash) return none("in sync");
  return { action: "update", reason: moved && delayChanged ? "delayed" : "changed" };
}

/** How many events a publish will create: published streams with no event id, not cancelled, ended or live. */
function eventsToCreate(streams, hasEvent = (s) => !!(s.youtubeEventId || s.youtube?.eventId)) {
  return (streams || []).filter((s) => s && s.state !== "cancelled" && s.state !== "ended" && s.state !== "live"
    && !s.actualStart && s.published === true && !hasEvent(s)).length;
}

/** The publish dialog's count for streams about to be published (planned -> scheduled): every non-cancelled, not-started one. */
const eventsAtPublish = (streams, hasEvent) => eventsToCreate((streams || []).map((s) => ({ ...s, published: true })), hasEvent);

/** youtubeTidy: a backstage stream that ended `days` (default 7) or more days ago and isn't already private. */
function shouldMakePrivate(stream, nowMs, days = DEFAULT_TIDY_DAYS) {
  if (!isBackstage(stream) || stream.state !== "ended" || stream.youtube?.madePrivateAt) return false;
  const end = ms(stream.actualEnd) || ms(stream.plannedEnd);
  return end > 0 && nowMs - end >= days * DAY_MS;
}

/** streams/{id}/private/watch: ids only; the video ID is handed out by backstageWatch to the audience. */
function watchDocShape(ids = {}) {
  return { provider: "youtube", youtube: { landscapeId: ids.landscapeId || null, backstageId: ids.backstageId || null, verticalId: ids.verticalId || null } };
}

/** Cuts anything that looks like a token or an id out of an error message before it's stored publicly. */
function safeError(text) {
  return String(text ?? "")
    .replace(/Bearer\s+\S+/gi, "[removed]").replace(/\bya29\.[\w-]+/g, "[removed]").replace(/\b1\/\/[\w-]+/g, "[removed]")
    .replace(/[A-Za-z0-9_-]{10,}/g, (w) => (/\d/.test(w) ? "[removed]" : w))
    .replace(/\s+/g, " ").trim().slice(0, ERROR_MAX);
}

/** The public stream's `youtube` field: { status, error?, syncedAt }. Never an id or a token. */
function statusDocShape(status, error, at = Date.now()) {
  const st = ["ok", "pending", "failed"].includes(status) ? status : "failed";
  const out = { status: st, syncedAt: at };
  if (st === "failed" && error) out.error = safeError(error?.message ?? error);
  return out;
}

module.exports = {
  STAGING_PROJECT, STAGING_PREFIX, TITLE_MAX, DEFAULT_TIDY_DAYS,
  buildEvent, decide, syncHash, eventsToCreate, eventsAtPublish, shouldMakePrivate, isStagingTitle, isStaging,
  watchDocShape, statusDocShape, safeError, firstGameId, thumbnailUrl, liveUrl, wantsEvent,
};
