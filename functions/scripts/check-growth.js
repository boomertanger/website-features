#!/usr/bin/env node
// functions/scripts/check-growth.js: quick checks for the growth collector core
// (lib/growth/collect.js) with a fake fetch and an in-memory Firestore. No network,
// no credentials.   npm run check   (or node scripts/check-growth.js)
const assert = require("assert/strict");
const { collect, dayKey } = require("../lib/growth/collect");

// ---- in-memory Firestore (just what collect() uses) ----
function memDb(seed = {}) {
  const store = new Map(Object.entries(seed));
  const ref = (p) => ({
    path: p,
    get: async () => ({ exists: store.has(p), data: () => store.get(p), get: (k) => store.get(p)?.[k] }),
    set: async (v, o) => { store.set(p, o?.merge ? { ...(store.get(p) || {}), ...v } : v); },
    collection: (c) => ({ doc: (d) => ref(`${p}/${c}/${d}`) }),
  });
  return { store, doc: ref };
}
const Timestamp = { fromMillis: (ms) => ({ ms, toDate: () => new Date(ms) }) };

// ---- fake APIs ----
function fakeFetch(fail = {}) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push(url);
    const json = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
    if (url.startsWith("https://id.twitch.tv/oauth2/token")) return json(200, { access_token: "app" });
    if (url.includes("helix/users")) return json(200, { data: [{ id: "123" }] });
    if (url.includes("helix/channels/followers")) return fail.twitch ? json(500, { message: "boom" }) : json(200, { total: 654 });
    if (url.includes("youtube/v3/channels")) return fail.youtube ? json(403, { error: { message: "quota" } }) : json(200, { items: [{ statistics: { subscriberCount: "820", viewCount: "51234", videoCount: "77" } }] });
    if (url.includes("open.tiktokapis.com/v2/oauth/token")) return json(200, { access_token: "a2", refresh_token: "r2", expires_in: 86400, refresh_expires_in: 31536000, open_id: "o" });
    if (url.includes("v2/user/info")) return json(200, { data: { user: { follower_count: 9496 } } });
    if (url.includes("v2/video/list")) return json(200, { data: { videos: [{ id: "v", create_time: 1790000000 }] } });
    return json(404, {});
  };
  fn.calls = calls;
  return fn;
}
const cfg = { twitchClientId: "id", twitchClientSecret: "s", twitchLogin: "boomertanger", youtubeApiKey: "k", youtubeChannelId: "UCx", tiktokClientKey: "", tiktokClientSecret: "" };
const NOW = Date.UTC(2026, 8, 30, 12, 0, 0);

(async () => {
  assert.equal(dayKey(Date.UTC(2026, 8, 30, 6, 0, 0)), "2026-09-29");   // 23:00 the day before in Los Angeles

  // Everything works; TikTok not connected = skipped quietly.
  let db = memDb(), f = fakeFetch();
  let out = await collect({ db, siteId: "s", cfg, fetchFn: f, now: NOW, Timestamp });
  assert.deepEqual(out.daily.twitch, { followers: 654 });
  assert.deepEqual(out.daily.youtube, { subscribers: 820, views: 51234, videos: 77 });
  assert.equal(out.daily.tiktok, null);
  assert.deepEqual(out.daily.errors, []);
  assert.equal(out.tiktok, "off");
  assert.equal(db.store.get("sites/s/private/growthConfig").twitchBroadcasterId, "123");
  assert.equal(db.store.get("sites/s/public/socials").youtubeGoal, 1000);
  assert.ok(db.store.has(`sites/s/growthDaily/${out.day}`));

  // The broadcaster id is reused (no second helix/users call).
  f = fakeFetch();
  await collect({ db, siteId: "s", cfg, fetchFn: f, now: NOW, Timestamp });
  assert.equal(f.calls.filter((u) => u.includes("helix/users")).length, 0);

  // A failing platform keeps its last good value in the summary and logs an error.
  f = fakeFetch({ youtube: true });
  out = await collect({ db, siteId: "s", cfg, fetchFn: f, now: NOW + 86400000, Timestamp });
  assert.equal(out.daily.youtube, null);
  assert.equal(out.daily.errors[0].platform, "youtube");
  assert.equal(db.store.get("sites/s/public/socials").youtube.subscribers, 820);
  assert.equal(db.store.get("sites/s/public/socials").youtube.updatedAt.ms, NOW);
  assert.equal(db.store.get("sites/s/public/socials").twitch.updatedAt.ms, NOW + 86400000);

  // TikTok connected: the refresh token rotates and is saved; counts come through.
  db = memDb({ "sites/s/private/tiktokAuth": { refreshToken: "r1" } });
  out = await collect({ db, siteId: "s", cfg: { ...cfg, tiktokClientKey: "ck", tiktokClientSecret: "x".repeat(20) }, fetchFn: fakeFetch(), now: NOW, Timestamp });
  assert.deepEqual(out.daily.tiktok, { followers: 9496, latestVideoAt: new Date(1790000000 * 1000).toISOString() });
  assert.equal(db.store.get("sites/s/private/tiktokAuth").refreshToken, "r2");

  // A dry run writes nothing at all.
  db = memDb();
  await collect({ db, siteId: "s", cfg, fetchFn: fakeFetch(), now: NOW, Timestamp, dryRun: true });
  assert.equal(db.store.size, 0);

  console.log("growth checks passed");
})().catch((err) => { console.error(err); process.exit(1); });
