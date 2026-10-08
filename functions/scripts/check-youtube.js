#!/usr/bin/env node
// functions/scripts/check-youtube.js: Scream Planner part 8a checks (docs/specs/scream-planner.md
// section 15): event bodies, what changed, staging rule, auth and API request shapes. In memory,
// no network, no credentials (Google is a fake fetch).
//   npm run check      (or node scripts/check-youtube.js)
const assert = require("assert/strict");
const { makeDb } = require("./fixtures/fake-firestore");
const L = require("../lib/youtube/logic");
const { makeAuth, authUrl, REDIRECTS, SCOPE, YoutubeAuthError } = require("../lib/youtube/auth");
const { makeApi, YoutubeError } = require("../lib/youtube/api");

const T = (m) => ({ toMillis: () => m });
const H = 3600000, START = Date.UTC(2026, 9, 12, 1, 0), NOW = Date.UTC(2026, 9, 20);
const stream = (o = {}) => ({
  title: "Monster Monday", slug: "2026-10-12", state: "scheduled", published: true, type: "platform", audience: "public",
  plannedStart: T(START), plannedEnd: T(START + 3 * H), hasUnpublishedChanges: false, rev: 1,
  plannedGames: [{ gameId: "g1", title: "Cult of the Lamb", order: 0 }, { gameId: "g2", title: "Lethal Company", order: 1 }], ...o,
});
const SITE = "https://boomertanger.com";

async function main() {
  // ---------- buildEvent ----------
  const plat = L.buildEvent(stream(), { siteUrl: SITE, projectId: "boomertanger-prod" });
  assert.equal(plat.snippet.title, "Monster Monday");
  assert.ok(plat.snippet.description.includes("https://boomertanger.com/live"));
  assert.ok(plat.snippet.description.includes("Cult of the Lamb"));
  assert.equal(plat.snippet.scheduledStartTime, new Date(START).toISOString());
  assert.equal(plat.snippet.scheduledEndTime, new Date(START + 3 * H).toISOString());
  assert.equal(plat.status.privacyStatus, "public");
  assert.equal(plat.contentDetails.latencyPreference, "low");
  assert.equal(plat.contentDetails.enableAutoStart, false);
  assert.equal(plat.contentDetails.enableAutoStop, false);
  assert.equal(plat.contentDetails.monitorStream.enableMonitorStream, false);
  const back = L.buildEvent(stream({ type: "backstage", audience: "fanClub" }), { siteUrl: SITE + "/", projectId: "boomertanger-prod" });
  assert.equal(back.status.privacyStatus, "unlisted");
  assert.ok(back.snippet.description.includes("https://boomertanger.com/live"), "trailing slash handled");
  assert.ok(!back.snippet.description.includes("//live"));
  const noEnd = L.buildEvent(stream({ plannedEnd: null }), { siteUrl: SITE, projectId: "boomertanger-prod" });
  assert.equal("scheduledEndTime" in noEnd.snippet, false);
  // The staging rule: always private, always prefixed, for platform and backstage alike.
  for (const type of ["platform", "backstage"]) {
    const ev = L.buildEvent(stream({ type }), { siteUrl: SITE, projectId: "boomertanger-staging" });
    assert.equal(ev.status.privacyStatus, "private");
    assert.ok(ev.snippet.title.startsWith("[STAGING] ") && L.isStagingTitle(ev.snippet.title));
  }
  const long = L.buildEvent(stream({ title: "x".repeat(300) }), { siteUrl: SITE, projectId: "boomertanger-staging" });
  assert.equal(long.snippet.title.length, 100); assert.ok(long.snippet.title.startsWith("[STAGING] "));
  // Production only ever makes public or unlisted.
  for (const type of ["platform", "backstage", "other"]) assert.ok(["public", "unlisted"].includes(L.buildEvent(stream({ type }), { siteUrl: SITE, projectId: "boomertanger-prod" }).status.privacyStatus));
  assert.equal(L.isStagingTitle("Monster Monday"), false);
  assert.equal(L.firstGameId(stream({ plannedGames: [{ gameId: "b", order: 1 }, { gameId: "a", order: 0 }] })), "a");
  assert.equal(L.firstGameId(stream({ plannedGames: [] })), null);
  assert.equal(L.thumbnailUrl("https://res.cloudinary.com/x/image/upload/v1/game-vault/covers/a.png"), "https://res.cloudinary.com/x/image/upload/c_pad,b_blurred:400:15,w_1280,h_720,f_jpg/v1/game-vault/covers/a.png");
  assert.equal(L.thumbnailUrl("https://example.com/a.png"), "https://example.com/a.png");
  assert.equal(L.thumbnailUrl(null), null);

  // ---------- syncHash ----------
  const COVER = "https://example.com/c1.png";
  const h0 = L.syncHash(stream(), COVER);
  assert.equal(h0, L.syncHash(stream(), COVER), "stable");
  assert.equal(h0, L.syncHash(stream({ plannedStart: START, plannedEnd: START + 3 * H }), COVER), "Timestamp or ms");
  // Writes the sync itself makes, and unrelated writes, never change it: no trigger loop.
  assert.equal(h0, L.syncHash(stream({ youtube: { status: "ok", syncedAt: 99 } }), COVER));
  assert.equal(h0, L.syncHash(stream({ youtube: { status: "failed", error: "x", syncedAt: 5 }, rev: 9, crew: { a: 1 }, hasUnpublishedChanges: true }), COVER));
  for (const [what, s, c] of [
    ["title", stream({ title: "Other" }), COVER], ["start", stream({ plannedStart: T(START + H) }), COVER],
    ["end", stream({ plannedEnd: T(START + 4 * H) }), COVER], ["type", stream({ type: "backstage" }), COVER],
    ["audience", stream({ audience: "fanClub" }), COVER], ["cover", stream(), "https://example.com/c2.png"],
    ["games", stream({ plannedGames: [{ gameId: "g3", title: "Other game" }] }), COVER],
  ]) assert.notEqual(L.syncHash(s, c), h0, `${what} changes the hash`);

  // ---------- decide (table-driven) ----------
  const synced = { eventId: "EV1", hash: h0 };
  const cases = [
    ["first publish", null, stream(), { cover: COVER }, "create"],
    ["first publish from planned", stream({ state: "planned", published: false }), stream(), { cover: COVER }, "create"],
    ["draft (planned, unpublished)", null, stream({ state: "planned", published: false }), {}, "none"],
    ["ad hoc, planned, at once", null, stream({ state: "planned", published: false, adhoc: true }), {}, "create"],
    ["after-show at once", null, stream({ state: "scheduled", published: false, afterShowOf: "s1" }), {}, "create"],
    ["republish with new title", stream(), stream({ title: "New" }), { synced, cover: COVER }, "update"],
    ["new first-game cover", stream(), stream(), { synced, cover: "https://example.com/c2.png" }, "update"],
    ["privacy change (type)", stream(), stream({ type: "backstage" }), { synced, cover: COVER }, "update"],
    ["delay", stream({ delay: null }), stream({ plannedStart: T(START + H), plannedEnd: T(START + 4 * H), delay: { at: T(NOW) } }), { synced, cover: COVER }, "update"],
    ["delay with unpublished edits pending", stream(), stream({ plannedStart: T(START + H), plannedEnd: T(START + 4 * H), hasUnpublishedChanges: true, delay: { at: T(NOW) } }), { synced, cover: COVER }, "update"],
    ["unpublished edit waits", stream(), stream({ title: "Draft title", hasUnpublishedChanges: true }), { synced, cover: COVER }, "none"],
    ["status-only write", stream(), stream({ youtube: { status: "ok", syncedAt: 5 } }), { synced, cover: COVER }, "none"],
    ["no-op rev bump", stream(), stream({ rev: 2 }), { synced, cover: COVER }, "none"],
    ["cancel with event", stream(), stream({ state: "cancelled" }), { synced, cover: COVER }, "delete"],
    ["cancel without event", stream(), stream({ state: "cancelled" }), {}, "none"],
    ["published stream removed", stream(), null, { synced }, "delete"],
    ["removed, no event", stream(), null, {}, "none"],
    ["live: hands off", stream(), stream({ state: "live", actualStart: T(NOW), title: "Changed" }), { synced, cover: COVER }, "none"],
    ["ended: hands off", stream({ state: "live" }), stream({ state: "ended", actualStart: T(NOW) }), { synced }, "none"],
    ["cancelled after actualStart: hands off", stream({ actualStart: T(NOW) }), stream({ state: "cancelled", actualStart: T(NOW) }), { synced }, "none"],
    ["published but event exists, in sync", null, stream(), { synced, cover: COVER }, "none"],
  ];
  for (const [name, b, a, o, want] of cases) assert.equal(L.decide(b, a, o).action, want, name);
  assert.equal(L.decide(stream(), stream({ state: "cancelled" }), { synced }).reason, "cancelled");
  assert.ok(L.decide(null, stream(), {}).reason);

  // ---------- eventsToCreate / shouldMakePrivate ----------
  const list = [stream(), stream({ youtubeEventId: "E" }), stream({ state: "cancelled" }), stream({ state: "ended" }), stream({ state: "live" }), stream({ published: false }), stream({ youtube: { eventId: "E2" } }), stream()];
  assert.equal(L.eventsToCreate(list), 2);
  assert.equal(L.eventsToCreate([]), 0);
  assert.equal(L.eventsAtPublish([stream({ state: "planned", published: false }), stream({ state: "cancelled" }), stream({ state: "planned", published: false })]), 2);
  const ended = (o) => stream({ type: "backstage", state: "ended", actualEnd: T(NOW - 7 * 24 * H), ...o });
  assert.equal(L.shouldMakePrivate(ended(), NOW), true);
  assert.equal(L.shouldMakePrivate(ended({ actualEnd: T(NOW - 6 * 24 * H) }), NOW), false);
  assert.equal(L.shouldMakePrivate(ended({ actualEnd: T(NOW - 4 * 24 * H) }), NOW, 3), true);
  assert.equal(L.shouldMakePrivate(ended({ type: "platform" }), NOW), false);
  assert.equal(L.shouldMakePrivate(ended({ youtube: { madePrivateAt: 1 } }), NOW), false);
  assert.equal(L.shouldMakePrivate(ended({ state: "scheduled" }), NOW), false);

  // ---------- doc shapes ----------
  assert.deepEqual(L.watchDocShape({ landscapeId: "L1", backstageId: "B1" }), { provider: "youtube", youtube: { landscapeId: "L1", backstageId: "B1", verticalId: null } });
  assert.deepEqual(L.watchDocShape(), { provider: "youtube", youtube: { landscapeId: null, backstageId: null, verticalId: null } });
  const ok = L.statusDocShape("ok", null, 5);
  assert.deepEqual(ok, { status: "ok", syncedAt: 5 });
  const bad = L.statusDocShape("failed", new Error("Bearer ya29.A0AfH6SMBxyz token ya29.secretvalue1 video dQw4w9WgXcQ failed " + "x".repeat(500)), 5);
  assert.equal(bad.status, "failed"); assert.ok(bad.error.length <= 200);
  for (const leak of ["ya29", "A0AfH6SMBxyz", "dQw4w9WgXcQ", "Bearer", "secretvalue1"]) assert.ok(!bad.error.includes(leak), leak);
  assert.equal("error" in L.statusDocShape("ok", "boom"), false);
  assert.equal(L.statusDocShape("pending").status, "pending");
  assert.equal(L.statusDocShape("nonsense").status, "failed");

  // ---------- auth ----------
  const db = makeDb(); let clock = 1_000_000;
  const calls = [];
  const res = (status, body, headers = {}) => ({ ok: status < 400, status, json: async () => body, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, arrayBuffer: async () => body });
  let tokenReply = { access_token: "AT1", refresh_token: "RT1", expires_in: 3600, scope: SCOPE };
  const google = async (url, init = {}) => {
    calls.push({ url, ...init });
    if (url.startsWith("https://oauth2.googleapis.com/token")) return tokenReply.error ? res(400, tokenReply) : res(200, tokenReply);
    if (url.startsWith("https://www.googleapis.com/youtube/v3/channels")) return res(200, { items: [{ id: "UC1", snippet: { title: "Boomertanger" } }] });
    throw new Error("unexpected " + url);
  };
  const auth = makeAuth({ db, fetchFn: google, clientId: "CID", clientSecret: "SEC", now: () => clock });
  assert.deepEqual(await auth.status(), { connected: false, channelTitle: "" });
  await assert.rejects(auth.accessToken(), (e) => e instanceof YoutubeAuthError && e.code === "reconnect");
  const out = await auth.exchangeCode({ code: "CODE", redirectUri: REDIRECTS["boomertanger-staging"][0], connectedBy: "uid1" });
  assert.deepEqual(out, { channelTitle: "Boomertanger" });
  const tokenReq = new URLSearchParams(calls[0].body);
  assert.equal(calls[0].method, "POST"); assert.equal(tokenReq.get("grant_type"), "authorization_code");
  assert.equal(tokenReq.get("code"), "CODE"); assert.equal(tokenReq.get("client_secret"), "SEC"); assert.equal(tokenReq.get("redirect_uri"), "http://localhost:4321/auth/youtube/callback");
  assert.equal(calls[1].headers.Authorization, "Bearer AT1");
  const doc = (await db.doc("sites/boomertanger/private/youtubeChannel").get()).data();
  assert.equal(doc.accessToken, "AT1"); assert.equal(doc.refreshToken, "RT1"); assert.equal(doc.channelId, "UC1"); assert.equal(doc.channelTitle, "Boomertanger");
  assert.equal(doc.connectedBy, "uid1"); assert.equal(doc.accessExpiresAt, clock + 3600000); assert.equal(doc.scope, SCOPE); assert.equal(doc.connectedAt, clock);
  const st = await auth.status(); assert.deepEqual(st, { connected: true, channelTitle: "Boomertanger" });
  assert.ok(!JSON.stringify(st).includes("AT1") && !JSON.stringify(st).includes("RT1"));
  // Valid token: no refresh. Within 60 s of expiry: refresh first, keep the stored refresh token.
  const n0 = calls.length;
  assert.equal(await auth.accessToken(), "AT1"); assert.equal(calls.length, n0);
  clock += 3600000 - 30000;
  tokenReply = { access_token: "AT2", expires_in: 3600 };
  assert.equal(await auth.accessToken(), "AT2");
  const rq = new URLSearchParams(calls[calls.length - 1].body);
  assert.equal(rq.get("grant_type"), "refresh_token"); assert.equal(rq.get("refresh_token"), "RT1");
  const doc2 = (await db.doc("sites/boomertanger/private/youtubeChannel").get()).data();
  assert.equal(doc2.refreshToken, "RT1"); assert.equal(doc2.accessToken, "AT2"); assert.equal(doc2.channelId, "UC1");
  // A refresh that returns a new refresh token replaces it.
  clock += 3600000; tokenReply = { access_token: "AT3", refresh_token: "RT2", expires_in: 3600 };
  await auth.accessToken(); assert.equal((await db.doc("sites/boomertanger/private/youtubeChannel").get()).get("refreshToken"), "RT2");
  // invalid_grant -> reconnect, no secret in the message.
  clock += 3600000; tokenReply = { error: "invalid_grant", error_description: "Token has been expired or revoked." };
  await assert.rejects(auth.accessToken(), (e) => e.code === "reconnect" && !/RT2|SEC/.test(e.message));
  // Exchange without a refresh token is refused (the owner must use prompt=consent).
  tokenReply = { access_token: "AT9", expires_in: 3600 };
  await assert.rejects(auth.exchangeCode({ code: "C", redirectUri: "x" }), (e) => e.code === "exchange");
  // Allowlist and sign-in URL.
  assert.deepEqual(REDIRECTS["boomertanger-staging"], ["http://localhost:4321/auth/youtube/callback", "https://staging.boomertanger.com/auth/youtube/callback"]);
  assert.deepEqual(REDIRECTS["boomertanger-prod"], []);
  const u = new URL(authUrl({ clientId: "CID", redirectUri: "https://staging.boomertanger.com/auth/youtube/callback", state: "S1" }));
  assert.equal(u.origin + u.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(u.searchParams.get("scope"), "https://www.googleapis.com/auth/youtube.force-ssl");
  assert.equal(u.searchParams.get("access_type"), "offline"); assert.equal(u.searchParams.get("prompt"), "consent");
  assert.equal(u.searchParams.get("include_granted_scopes"), "false"); assert.equal(u.searchParams.get("state"), "S1");
  assert.equal(u.searchParams.get("response_type"), "code");

  // ---------- api request shapes ----------
  const log = []; let reply = () => res(200, {});
  const api = makeApi({ fetchFn: async (url, init = {}) => { log.push({ url, ...init }); return reply(url, init); }, token: "TOK" });
  const last = () => log[log.length - 1];
  const body = L.buildEvent(stream(), { siteUrl: SITE, projectId: "boomertanger-prod" });
  reply = () => res(200, { id: "EV9" });
  assert.deepEqual(await api.insert(body), { id: "EV9" });
  assert.equal(last().method, "POST"); assert.equal(last().url, "https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,status,contentDetails");
  assert.equal(last().headers.Authorization, "Bearer TOK"); assert.equal(last().headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(last().body), body);
  await api.update("EV9", body);
  assert.equal(last().method, "PUT"); assert.equal(last().url, "https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,status,contentDetails");
  assert.equal(JSON.parse(last().body).id, "EV9"); assert.equal(JSON.parse(last().body).snippet.title, "Monster Monday");
  reply = () => res(204, null);
  await api.remove("EV9");
  assert.equal(last().method, "DELETE"); assert.equal(last().url, "https://www.googleapis.com/youtube/v3/liveBroadcasts?id=EV9");
  assert.equal(last().headers.Authorization, "Bearer TOK");
  let page = 0;
  reply = () => (page++ === 0 ? res(200, { items: [{ id: "a" }], nextPageToken: "P2" }) : res(200, { items: [{ id: "b" }] }));
  assert.deepEqual((await api.list({ status: "active" })).map((i) => i.id), ["a", "b"]);
  assert.ok(log[log.length - 2].url.includes("broadcastStatus=active")); assert.ok(last().url.includes("pageToken=P2")); assert.equal(last().method, "GET");
  reply = () => res(200, {});
  const bytes = Buffer.from([1, 2, 3]);
  await api.thumbnail("EV9", bytes, "image/jpeg");
  assert.equal(last().method, "POST"); assert.equal(last().url, "https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=EV9&uploadType=media");
  assert.equal(last().headers["Content-Type"], "image/jpeg"); assert.equal(last().headers.Authorization, "Bearer TOK"); assert.equal(last().body, bytes);
  assert.throws(() => api.thumbnail("EV9", bytes, "image/webp"), YoutubeError);
  reply = (url, init) => (init.method === "PUT" ? res(200, {}) : res(200, { items: [{ id: "V1", snippet: { title: "T", categoryId: "20", description: "D" }, status: { privacyStatus: "unlisted", selfDeclaredMadeForKids: false } }] }));
  await api.setVideoPrivate("V1");
  assert.equal(log[log.length - 2].url, "https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=V1");
  assert.equal(last().method, "PUT"); assert.equal(last().url, "https://www.googleapis.com/youtube/v3/videos?part=snippet,status");
  const pv = JSON.parse(last().body);
  assert.equal(pv.id, "V1"); assert.equal(pv.snippet.title, "T"); assert.equal(pv.snippet.categoryId, "20");
  assert.equal(pv.status.privacyStatus, "private"); assert.equal(pv.status.selfDeclaredMadeForKids, false);
  reply = () => res(200, { items: [] });
  await assert.rejects(api.setVideoPrivate("V2"), (e) => e.kind === "notFound");
  // downloadImage
  reply = () => res(200, bytes, { "content-type": "image/png; charset=x" });
  const img = await api.downloadImage("https://example.com/c.png");
  assert.equal(img.contentType, "image/png"); assert.ok(Buffer.isBuffer(img.bytes));
  reply = () => res(200, bytes, { "content-type": "image/webp" });
  await assert.rejects(api.downloadImage("https://example.com/c.webp"), (e) => e.kind === "other");
  await assert.rejects(api.downloadImage("http://example.com/c.png"), (e) => e.kind === "other");
  // Typed errors, with the HTTP status; the token never leaks.
  const err = async (status, b) => { reply = () => res(status, b); try { await api.insert(body); } catch (e) { return e; } };
  const quota = await err(403, { error: { message: "quota", errors: [{ reason: "quotaExceeded" }] } });
  assert.ok(quota instanceof YoutubeError); assert.equal(quota.kind, "quotaExceeded"); assert.equal(quota.status, 403);
  assert.equal((await err(401, { error: { message: "Bearer TOK bad" } })).kind, "unauthorized");
  assert.ok(!(await err(401, { error: { message: "Bearer TOK bad" } })).message.includes("TOK"));
  const nf = await err(404, {}); assert.equal(nf.kind, "notFound"); assert.equal(nf.status, 404);
  const other = await err(500, { error: { message: "boom" } }); assert.equal(other.kind, "other"); assert.equal(other.status, 500);
  assert.equal((await err(403, { error: { errors: [{ reason: "forbidden" }] } })).kind, "other");

  console.log("check-youtube: all checks passed");
}

main().catch((e) => { console.error(e); process.exit(1); });
