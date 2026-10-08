// functions/lib/youtube/api.js: thin YouTube Data API v3 client. Every request goes through the
// injected fetchFn (so scripts/check-youtube.js fakes Google) with `Authorization: Bearer <token>`.
// Failures throw YoutubeError { kind: quotaExceeded | unauthorized | notFound | other, status }.
// The message never contains the token.
const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD = "https://www.googleapis.com/upload/youtube/v3";
const PARTS = "snippet,status,contentDetails";
const IMAGE_MAX_BYTES = 2 * 1024 * 1024;   // YouTube's thumbnail limit

class YoutubeError extends Error {
  constructor(kind, status, message) { super(message); this.name = "YoutubeError"; this.kind = kind; this.status = status; }
}

function classify(status, body) {
  const err = body?.error || {};
  const reasons = (err.errors || []).map((e) => e.reason).concat(err.status || []);
  if (reasons.some((r) => ["quotaExceeded", "rateLimitExceeded", "dailyLimitExceeded", "RESOURCE_EXHAUSTED"].includes(r))) return "quotaExceeded";
  if (status === 401) return "unauthorized";
  if (status === 404) return "notFound";
  return "other";
}

function makeApi({ fetchFn, token }) {
  async function call(method, url, { json, body, headers } = {}) {
    const h = { Authorization: `Bearer ${token}`, ...(headers || {}) };
    if (json !== undefined) h["Content-Type"] = "application/json";
    let res;
    try { res = await fetchFn(url, { method, headers: h, body: json !== undefined ? JSON.stringify(json) : body }); }
    catch { throw new YoutubeError("other", 0, "Could not reach YouTube."); }
    let data = {};
    if (res.status !== 204) { try { data = await res.json(); } catch { data = {}; } }
    if (!res.ok) {
      const msg = String(data?.error?.message || `HTTP ${res.status}`).replace(/Bearer\s+\S+/gi, "[removed]").slice(0, 200);
      throw new YoutubeError(classify(res.status, data), res.status, msg);
    }
    return data;
  }

  return {
    /** POST liveBroadcasts. body = buildEvent(...). Returns the broadcast (its id is the event and video id). */
    insert: (body) => call("POST", `${API}/liveBroadcasts?part=${PARTS}`, { json: body }),
    /** PUT liveBroadcasts. YouTube needs the id, snippet.title and scheduledStartTime in the body. */
    update: (id, body) => call("PUT", `${API}/liveBroadcasts?part=${PARTS}`, { json: { id, ...body } }),
    /** DELETE liveBroadcasts?id=. */
    remove: (id) => call("DELETE", `${API}/liveBroadcasts?id=${encodeURIComponent(id)}`),
    /**
     * GET liveBroadcasts for a broadcastStatus ("upcoming" default, or "active"). YouTube's filters
     * (broadcastStatus, mine, id) are mutually exclusive, and the token already scopes the list to
     * the owner's channel, so only broadcastStatus is sent. Follows up to 5 pages of 50.
     */
    async list({ status = "upcoming" } = {}) {
      const items = []; let pageToken = "";
      for (let i = 0; i < 5; i++) {
        const d = await call("GET", `${API}/liveBroadcasts?part=${PARTS}&broadcastStatus=${status}&maxResults=50${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`);
        items.push(...(d.items || []));
        if (!(pageToken = d.nextPageToken)) break;
      }
      return items;
    },
    /**
     * GET videos?part=liveStreamingDetails,statistics for up to 50 ids (about 1 quota unit). Returns the items:
     * { id, liveStreamingDetails: { actualStartTime, actualEndTime, concurrentViewers } }. concurrentViewers is a string and
     * absent when the stream is not live (or the viewer count is hidden).
     */
    async videosList(ids) {
      const list = [...new Set((ids || []).filter((x) => typeof x === "string" && x))].slice(0, 50);
      if (!list.length) return [];
      const d = await call("GET", `${API}/videos?part=liveStreamingDetails&id=${list.map(encodeURIComponent).join(",")}`);
      return d.items || [];
    },
    /** POST thumbnails.set with the raw image bytes (image/jpeg or image/png, at most 2 MB). */
    thumbnail(videoId, bytes, contentType) {
      if (!["image/jpeg", "image/png"].includes(contentType)) throw new YoutubeError("other", 0, "A thumbnail must be a jpg or png.");
      return call("POST", `${UPLOAD}/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`, { body: bytes, headers: { "Content-Type": contentType } });
    },
    /** videos.update: sets privacyStatus private, resending the snippet fields the API requires (title, categoryId) and the existing status. */
    async setVideoPrivate(videoId) {
      const d = await call("GET", `${API}/videos?part=snippet,status&id=${encodeURIComponent(videoId)}`);
      const v = d.items && d.items[0];
      if (!v) throw new YoutubeError("notFound", 404, "That video is not on YouTube.");
      return call("PUT", `${API}/videos?part=snippet,status`, { json: {
        id: videoId,
        snippet: { title: v.snippet.title, categoryId: v.snippet.categoryId, description: v.snippet.description || "", tags: v.snippet.tags || [] },
        status: { ...v.status, privacyStatus: "private" },
      } });
    },
    /** Fetches a cover: { bytes: Buffer, contentType }. https only, jpg or png, at most 2 MB. */
    async downloadImage(url) {
      if (typeof url !== "string" || !url.startsWith("https://")) throw new YoutubeError("other", 0, "A cover must be an https link.");
      let res;
      try { res = await fetchFn(url); } catch { throw new YoutubeError("other", 0, "Could not download the cover."); }
      if (!res.ok) throw new YoutubeError("other", res.status, "Could not download the cover.");
      const contentType = String(res.headers?.get ? res.headers.get("content-type") || "" : "").split(";")[0].trim().toLowerCase();
      if (!["image/jpeg", "image/png"].includes(contentType)) throw new YoutubeError("other", 0, "The cover is not a jpg or png.");
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length > IMAGE_MAX_BYTES) throw new YoutubeError("other", 0, "The cover is over 2 MB.");
      return { bytes, contentType };
    },
  };
}

module.exports = { makeApi, YoutubeError, API, UPLOAD };
