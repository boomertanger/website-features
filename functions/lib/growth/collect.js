// Growth collector core (docs/specs/growth-collector.md). No firebase-functions here:
// the scheduled function, the runGrowthCollectorNow callable and
// scripts/run-growth-once.js all call collect() with their own config and Firestore.
//
//   sites/{siteId}/growthDaily/{YYYY-MM-DD}   one doc per day (Los Angeles date), admin read
//   sites/{siteId}/public/socials             the footer's counts, public read
//   sites/{siteId}/private/growthConfig       the Twitch broadcaster id (looked up once)
//   sites/{siteId}/private/tiktokAuth         TikTok tokens (server only; absent = TikTok off)

const TZ = "America/Los_Angeles";
const YOUTUBE_GOAL = 1000;

/** YYYY-MM-DD for a moment, in Los Angeles. */
function dayKey(ms = Date.now(), tz = TZ) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

async function getJson(fetchFn, url, init, label) {
  const res = await fetchFn(url, init);
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) {
    const why = body?.error?.message || body?.message || body?.error_description || text.slice(0, 160);
    throw new Error(`${label}: HTTP ${res.status}${why ? ` (${why})` : ""}`);
  }
  return body;
}

// ---------- Twitch: follower total (Helix, app access token) ----------
async function twitch({ fetchFn, cfg, configRef, config }) {
  if (!cfg.twitchClientId || !cfg.twitchClientSecret || !cfg.twitchLogin) throw new Error("twitch: not configured");
  const tok = await getJson(fetchFn, "https://id.twitch.tv/oauth2/token", {
    method: "POST",
    body: new URLSearchParams({ client_id: cfg.twitchClientId, client_secret: cfg.twitchClientSecret, grant_type: "client_credentials" }),
  }, "twitch token");
  const headers = { Authorization: `Bearer ${tok.access_token}`, "Client-Id": cfg.twitchClientId };
  // The broadcaster id is looked up from the username once and kept.
  let id = config.twitchLogin === cfg.twitchLogin ? config.twitchBroadcasterId : null;
  const saves = {};
  if (!id) {
    const u = await getJson(fetchFn, `https://api.twitch.tv/helix/users?login=${encodeURIComponent(cfg.twitchLogin)}`, { headers }, "twitch users");
    id = u?.data?.[0]?.id;
    if (!id) throw new Error(`twitch: no user "${cfg.twitchLogin}"`);
    Object.assign(saves, { twitchLogin: cfg.twitchLogin, twitchBroadcasterId: String(id) });
  }
  const f = await getJson(fetchFn, `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${id}&first=1`, { headers }, "twitch followers");
  if (typeof f?.total !== "number") throw new Error("twitch: no follower total");
  if (Object.keys(saves).length && configRef) await configRef.set(saves, { merge: true });
  return { followers: f.total };
}

// ---------- YouTube: channels.list statistics (1 quota unit) ----------
async function youtube({ fetchFn, cfg }) {
  if (!cfg.youtubeApiKey || !cfg.youtubeChannelId) throw new Error("youtube: not configured");
  const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${encodeURIComponent(cfg.youtubeChannelId)}&key=${encodeURIComponent(cfg.youtubeApiKey)}`;
  const body = await getJson(fetchFn, url, {}, "youtube channels");
  const s = body?.items?.[0]?.statistics;
  if (!s) throw new Error("youtube: channel not found");
  // YouTube rounds public subscriber counts (3 significant figures) and can hide them.
  return {
    subscribers: s.hiddenSubscriberCount ? null : Number(s.subscriberCount),
    views: Number(s.viewCount),
    videos: Number(s.videoCount),
  };
}

// ---------- TikTok: refresh the token, followers + newest video (off until connected) ----------
const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
/** Swaps a code or refresh token at TikTok; returns the fields tiktokAuth stores. */
async function tiktokToken(fetchFn, params) {
  const t = await getJson(fetchFn, TIKTOK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body: new URLSearchParams(params),
  }, "tiktok token");
  if (!t?.access_token) throw new Error(`tiktok token: ${t?.error_description || t?.error || "no access token"}`);
  const now = Date.now();
  return {
    openId: t.open_id || null, scope: t.scope || null,
    accessToken: t.access_token, accessExpiresAt: now + (t.expires_in || 0) * 1000,
    refreshToken: t.refresh_token, refreshExpiresAt: now + (t.refresh_expires_in || 0) * 1000,
    updatedAt: now,
  };
}

async function tiktok({ fetchFn, cfg, authRef, auth }) {
  // Quietly off until the owner connects TikTok and the app's key and secret are set.
  if (!auth?.refreshToken || !cfg.tiktokClientKey || !cfg.tiktokClientSecret) return { skipped: true };
  const fresh = await tiktokToken(fetchFn, { client_key: cfg.tiktokClientKey, client_secret: cfg.tiktokClientSecret, grant_type: "refresh_token", refresh_token: auth.refreshToken });
  if (authRef) await authRef.set(fresh, { merge: true });
  const headers = { Authorization: `Bearer ${fresh.accessToken}` };
  const info = await getJson(fetchFn, "https://open.tiktokapis.com/v2/user/info/?fields=follower_count", { headers }, "tiktok user");
  const followers = info?.data?.user?.follower_count;
  if (typeof followers !== "number") throw new Error("tiktok: no follower_count");
  const vids = await getJson(fetchFn, "https://open.tiktokapis.com/v2/video/list/?fields=id,create_time", {
    method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ max_count: 1 }),
  }, "tiktok videos");
  const created = vids?.data?.videos?.[0]?.create_time;
  return { followers, latestVideoAt: typeof created === "number" ? new Date(created * 1000).toISOString() : null };
}

/**
 * Collects every platform and (unless dryRun) writes the day's history doc and the
 * public summary. A failing platform keeps its last good value in the summary and
 * adds an entry to the day's errors.
 * cfg: { twitchClientId, twitchClientSecret, twitchLogin, youtubeApiKey, youtubeChannelId, tiktokClientKey, tiktokClientSecret }
 * Returns { day, daily, summary } (no secrets).
 */
async function collect({ db, siteId, cfg, dryRun = false, fetchFn = fetch, now = Date.now(), Timestamp }) {
  const site = db.doc(`sites/${siteId}`);
  const configRef = site.collection("private").doc("growthConfig");
  const authRef = site.collection("private").doc("tiktokAuth");
  const summaryRef = site.collection("public").doc("socials");
  const [configSnap, authSnap, summarySnap] = await Promise.all([configRef.get(), authRef.get(), summaryRef.get()]);
  const ctx = { fetchFn, cfg, config: configSnap.exists ? configSnap.data() : {}, auth: authSnap.exists ? authSnap.data() : null, configRef: dryRun ? null : configRef, authRef: dryRun ? null : authRef };

  const errors = [];
  const run = async (platform, fn) => {
    try { return await fn(ctx); } catch (err) {
      errors.push({ platform, message: String(err?.message || err).slice(0, 300) });
      return null;
    }
  };
  const [tw, yt, tt] = await Promise.all([run("twitch", twitch), run("youtube", youtube), run("tiktok", tiktok)]);

  const at = Timestamp.fromMillis(now);
  const day = dayKey(now);
  const daily = {
    twitch: tw ? { followers: tw.followers } : null,
    youtube: yt ? { subscribers: yt.subscribers, views: yt.views, videos: yt.videos } : null,
    tiktok: tt && !tt.skipped ? { followers: tt.followers, latestVideoAt: tt.latestVideoAt } : null,
    collectedAt: at,
    errors,
  };
  // Public summary: only platforms that succeeded move; the rest keep their last good value.
  const prev = summarySnap.exists ? summarySnap.data() : {};
  const summary = {
    twitch: tw ? { followers: tw.followers, updatedAt: at } : prev.twitch ?? null,
    youtube: yt ? { subscribers: yt.subscribers, views: yt.views, videos: yt.videos, updatedAt: at } : prev.youtube ?? null,
    tiktok: tt && !tt.skipped ? { followers: tt.followers, latestVideoAt: tt.latestVideoAt, updatedAt: at } : prev.tiktok ?? null,
    instagram: prev.instagram ?? { followers: null, updatedAt: null },
    youtubeGoal: YOUTUBE_GOAL,
  };
  if (!dryRun) {
    await Promise.all([site.collection("growthDaily").doc(day).set(daily), summaryRef.set(summary)]);
  }
  return { day, daily, summary, tiktok: tt?.skipped ? "off" : tt ? "ok" : "error" };
}

module.exports = { collect, tiktokToken, dayKey, TZ, YOUTUBE_GOAL };
