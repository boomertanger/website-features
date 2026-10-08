#!/usr/bin/env node
// functions/scripts/check-youtube.js: Scream Planner part 8a checks (docs/specs/scream-planner.md
// section 15): event bodies, what changed, staging rule, auth and API request shapes, then (part 8b) the
// callables, youtubeSync and youtubeTidy against the in-memory Firestore and a fake Google. In memory,
// no network, no credentials (Google is a fake fetch).
//   npm run check      (or node scripts/check-youtube.js)
const assert = require("assert/strict");
const fs = require("fs");
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

  // ======================= part 8b: wiring (callables, youtubeSync, youtubeTidy) =======================
  // The same pattern as check-planner-wiring.js: the callables and triggers run against the in-memory Firestore
  // and a fake Google. Nothing here touches the network or real data.
  const admin = require("firebase-admin");
  process.env.GCLOUD_PROJECT ||= "boomertanger-staging";
  process.env.FIREBASE_CONFIG ||= JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
  if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  const wdb = makeDb(); const realFs = admin.firestore;
  const fakeFs = () => wdb; fakeFs.Timestamp = realFs.Timestamp; fakeFs.FieldValue = realFs.FieldValue;
  Object.defineProperty(admin, "firestore", { value: fakeFs, configurable: true, writable: true });
  const TS = (m) => realFs.Timestamp.fromMillis(m);
  const S = "sites/boomertanger";
  let wclock = NOW;
  const eg = { token: { access_token: "AT1", refresh_token: "RT1", expires_in: 3600, scope: SCOPE }, events: new Map(), n: 0, insertErr: null, thumbErr: false, glog: [], videos: new Map(), videoGone: false };
  const bytes2 = Buffer.from([9, 9, 9]);
  const fakeGoogle = async (url, init = {}) => {
    const method = init.method || "GET";
    eg.glog.push({ method, url, body: init.body });
    if (url.startsWith("https://oauth2.googleapis.com/token")) return eg.token.error ? res(400, eg.token) : res(200, eg.token);
    if (url.startsWith("https://www.googleapis.com/youtube/v3/channels")) return res(200, { items: [{ id: "UC1", snippet: { title: "Boomertanger" } }] });
    if (url.startsWith("https://example.com/")) return res(200, bytes2, { "content-type": "image/png" });
    if (url.startsWith("https://www.googleapis.com/upload/youtube/v3/thumbnails/set")) return eg.thumbErr ? res(403, { error: { message: "no custom thumbnails" } }) : res(200, {});
    if (url.startsWith("https://www.googleapis.com/youtube/v3/liveBroadcasts")) {
      if (method === "POST") {
        if (eg.insertErr) return res(eg.insertErr.status, eg.insertErr.body);
        const id = `EV${++eg.n}`; eg.events.set(id, JSON.parse(init.body)); return res(200, { id });
      }
      if (method === "PUT") { const b = JSON.parse(init.body); if (!eg.events.has(b.id)) return res(404, { error: { message: "not found" } }); eg.events.set(b.id, b); return res(200, { id: b.id }); }
      if (method === "DELETE") { const id = new URL(url).searchParams.get("id"); if (!eg.events.has(id)) return res(404, { error: { message: "not found" } }); eg.events.delete(id); return res(204, null); }
    }
    if (url.startsWith("https://www.googleapis.com/youtube/v3/videos")) {
      if (method === "PUT") { const b = JSON.parse(init.body); eg.videos.set(b.id, b); return res(200, {}); }
      return eg.videoGone ? res(200, { items: [] }) : res(200, { items: [{ id: "V", snippet: { title: "T", categoryId: "20" }, status: { privacyStatus: "unlisted" } }] });
    }
    throw new Error("unexpected " + url);
  };
  const gcalls = (re) => eg.glog.filter((c) => re.test(`${c.method} ${c.url}`));
  const mark = () => eg.glog.length;
  const since = (mk) => eg.glog.slice(mk);
  const mkBuild = (projectId) => require("../lib/youtube").build({ adminLogEntry: async (_d, f) => ({ ...f, createdAt: realFs.Timestamp.now() }), fetchFn: fakeGoogle, clientId: "CID", clientSecret: "SEC", now: () => wclock, projectId });
  const staging = mkBuild("boomertanger-staging");
  const fns = staging.functions;
  const as = (uid, fn, data = {}) => fns[fn].run({ auth: uid ? { uid, token: {} } : undefined, data });
  const why = async (p) => { try { await p; return "ok"; } catch (e) { return e.details?.reason || e.message; } };

  // the cast
  await wdb.doc(S).set({ ownerUid: "boss", timezone: "America/Chicago" });
  const person = async (uid, roles, roster) => {
    await wdb.doc(`${S}/members/${uid}`).set({ roles }); await wdb.doc(`${S}/profiles/${uid}`).set({ handle: uid });
    if (roster) await wdb.doc(`${S}/crew/main/roster/${uid}`).set({ handle: uid, status: "active", ...roster });
  };
  await person("boss", ["admin"]); await person("adm1", ["admin"], { track: "admin", grade: 2 });
  await person("adm0", ["admin"], { track: "admin", grade: 1 }); await person("m1", ["mod"], { track: "mod", grade: 3 }); await person("fan", []);
  await wdb.doc(`${S}/vaultGames/g1`).set({ title: "Cult of the Lamb", cover: "https://example.com/c1.png" });
  await wdb.doc(`${S}/vaultGames/g2`).set({ title: "Lethal Company" });
  const wstream = (o = {}) => stream({ plannedStart: TS(START), plannedEnd: TS(START + 3 * H), ...o });
  const snapOf = (d) => ({ exists: !!d, data: () => d });
  const cur = async (id) => (await wdb.doc(`${S}/streams/${id}`).get()).data();
  const watchOf = async (id) => (await wdb.doc(`${S}/streams/${id}/private/watch`).get()).data();
  const fire = async (id, before, after) => {
    if (after) await wdb.doc(`${S}/streams/${id}`).set(after); else await wdb.doc(`${S}/streams/${id}`).delete();
    await fns.youtubeSync.run({ params: { siteId: "boomertanger", streamId: id }, data: { before: snapOf(before), after: snapOf(after) } });
  };
  const edit = async (id, patch) => { const before = await cur(id); const after = { ...before, ...patch }; await fire(id, before, after); return { before, after }; };

  // ---------- youtubeConnect: owner only, allowlist ----------
  const GOOD = REDIRECTS["boomertanger-staging"][1];
  assert.equal(await why(as(null, "youtubeConnect", { code: "C", redirectUri: GOOD })), "signedOut");
  for (const uid of ["adm1", "adm0", "m1", "fan"]) assert.equal(await why(as(uid, "youtubeConnect", { code: "C", redirectUri: GOOD })), "notOwner", `${uid} cannot connect`);
  assert.equal(await why(as("boss", "youtubeConnect", { code: "C", redirectUri: "https://evil.example/auth/youtube/callback" })), "redirectUri");
  assert.equal(await why(as("boss", "youtubeConnect", { code: "", redirectUri: GOOD })), "code");
  assert.equal(await why(as("boss", "youtubeConnect", { redirectUri: GOOD })), "code");
  assert.equal(gcalls(/./).length, 0, "refused calls never reach Google");
  assert.deepEqual(await as("boss", "youtubeStatus"), { connected: false, channelTitle: "" });

  // ---------- not connected: sync skips quietly with status pending ----------
  await fire("p0", null, wstream());
  assert.equal((await cur("p0")).youtube.status, "pending"); assert.equal(gcalls(/liveBroadcasts/).length, 0);
  assert.equal(await watchOf("p0"), undefined);

  // ---------- youtubeConnect: failures, then success ----------
  eg.token = { error: "invalid_grant" };
  assert.equal(await why(as("boss", "youtubeConnect", { code: "C", redirectUri: GOOD })), "exchange");
  eg.token = { access_token: "AT0", expires_in: 3600 };
  assert.equal(await why(as("boss", "youtubeConnect", { code: "C", redirectUri: GOOD })), "noRefreshToken");
  assert.deepEqual(await as("boss", "youtubeStatus"), { connected: false, channelTitle: "" });
  eg.token = { access_token: "AT1", refresh_token: "RT1", expires_in: 3600, scope: SCOPE };
  const conn = await as("boss", "youtubeConnect", { code: "GOODCODE", redirectUri: GOOD });
  assert.deepEqual(conn, { ok: true, channelTitle: "Boomertanger" });
  const tok = (await wdb.doc(`${S}/private/youtubeChannel`).get()).data();
  assert.equal(tok.refreshToken, "RT1"); assert.equal(tok.connectedBy, "boss"); assert.equal(tok.channelId, "UC1");
  const logs = (await wdb.collection("adminLog").get()).docs.map((x) => x.data()).filter((e) => e.action === "youtubeConnect");
  assert.equal(logs.length, 1); assert.equal(logs[0].feature, "screamPlanner"); assert.equal(logs[0].actorUid, "boss");
  assert.ok(!JSON.stringify(logs[0]).match(/AT1|RT1|SEC|GOODCODE/), "no secret in the admin log");

  // videosList (the Control Room's liveTick): one call for the distinct ids, nothing for none.
  const vlCalls = [];
  const vlApi = makeApi({ fetchFn: async (url) => { vlCalls.push(url); return res(200, { items: [{ id: "A", liveStreamingDetails: { concurrentViewers: "5" } }] }); }, token: "T" });
  assert.deepEqual((await vlApi.videosList(["A", "A", "B", ""])).map((x) => x.id), ["A"]);
  assert.ok(vlCalls[0].includes("part=liveStreamingDetails&id=A,B"));
  assert.deepEqual(await vlApi.videosList([]), []); assert.equal(vlCalls.length, 1, "no ids, no call");

  // ---------- youtubeStatus: owner and A2+ ----------
  for (const uid of ["boss", "adm1"]) { const s = await as(uid, "youtubeStatus"); assert.deepEqual(s, { connected: true, channelTitle: "Boomertanger" }); assert.ok(!/AT1|RT1/.test(JSON.stringify(s))); }
  for (const uid of ["adm0", "m1", "fan"]) assert.equal(await why(as(uid, "youtubeStatus")), "notAllowed");
  assert.equal(await why(as(null, "youtubeStatus")), "signedOut");

  // ---------- youtubeSync: create (platform, with the Vault cover as the thumbnail) ----------
  let m = mark();
  await fire("s1", null, wstream());
  let d = since(m);
  assert.equal(d.filter((c) => c.method === "POST" && /liveBroadcasts/.test(c.url)).length, 1);
  const ev1 = eg.events.get("EV1");
  assert.ok(ev1.snippet.title.startsWith("[STAGING] Monster Monday")); assert.equal(ev1.status.privacyStatus, "private");
  assert.ok(ev1.snippet.description.includes("https://staging.boomertanger.com/live"));
  assert.equal(gcalls(/thumbnails\/set\?videoId=EV1/).length, 1, "the cover became the thumbnail");
  assert.ok(d.find((c) => c.url.startsWith("https://example.com/")));
  const w1 = await watchOf("s1");
  assert.equal(w1.provider, "youtube"); assert.equal(w1.youtube.landscapeId, "EV1"); assert.equal(w1.youtube.backstageId, null);
  assert.equal(w1.youtube.hash, L.syncHash(wstream(), "https://example.com/c1.png")); assert.ok(w1.youtube.syncedAt);
  const s1 = await cur("s1");
  assert.equal(s1.youtube.status, "ok"); assert.ok(s1.youtube.syncedAt); assert.equal("error" in s1.youtube, false); assert.equal("warning" in s1.youtube, false);

  // ---------- loop-free and idempotent ----------
  m = mark();
  const reread = await cur("s1");
  const trig = (siteId, before, after) => fns.youtubeSync.run({ params: { siteId, streamId: "s1" }, data: { before: snapOf(before), after: snapOf(after) } });
  await trig("boomertanger", wstream(), reread);                                  // the status write-back arriving as a trigger
  await trig("boomertanger", null, reread);                                       // a redelivered create
  await trig("boomertanger", { ...reread, youtube: { status: "failed" } }, reread);
  await trig("other", null, reread);
  assert.equal(since(m).length, 0, "no calls");
  assert.deepEqual(await cur("s1"), reread, "nothing written back");

  // ---------- update, unpublished edit waits, delay, rev bump ----------
  m = mark();
  await edit("s1", { title: "New title", rev: 2 });
  d = since(m);
  const put = d.find((c) => c.method === "PUT"); assert.ok(put); assert.equal(JSON.parse(put.body).id, "EV1"); assert.equal(JSON.parse(put.body).snippet.title, "[STAGING] New title");
  assert.equal(d.filter((c) => c.method === "POST" && /liveBroadcasts/.test(c.url)).length, 0, "an update never inserts again");
  assert.equal((await watchOf("s1")).youtube.hash, L.syncHash(await cur("s1"), "https://example.com/c1.png"));
  assert.equal((await cur("s1")).youtube.status, "ok");
  m = mark();
  await edit("s1", { title: "Draft only", hasUnpublishedChanges: true }); assert.equal(since(m).length, 0, "unpublished edits wait for Publish changes");
  await edit("s1", { title: "New title", hasUnpublishedChanges: false });
  assert.equal(since(m).length, 0, "back to the synced state: nothing to do");
  await edit("s1", { rev: 3 }); assert.equal(since(m).length, 0);
  await edit("s1", { plannedStart: TS(START + H), plannedEnd: TS(START + 4 * H), hasUnpublishedChanges: true, delay: { at: TS(NOW) } });
  assert.equal(since(m).filter((c) => c.method === "PUT").length, 1, "a delay moves the start at once, even with edits pending");
  assert.equal(eg.events.get("EV1").snippet.scheduledStartTime, new Date(START + H).toISOString());
  await edit("s1", { hasUnpublishedChanges: false });

  // ---------- backstage: no thumbnail, id under backstageId ----------
  m = mark();
  await fire("s2", null, wstream({ type: "backstage", audience: "fanClub", title: "Backstage VOD" }));
  assert.equal(gcalls(/thumbnails\/set\?videoId=EV2/).length, 0, "backstage: no thumbnail");
  assert.equal(since(m).some((c) => c.url.startsWith("https://example.com/")), false);
  const w2 = await watchOf("s2"); assert.equal(w2.youtube.backstageId, "EV2"); assert.equal(w2.youtube.landscapeId, null);
  assert.equal((await cur("s2")).youtube.status, "ok");
  // No cover (g2 has none): created without a thumbnail and without a warning.
  await fire("s3", null, wstream({ plannedGames: [{ gameId: "g2", title: "Lethal Company", order: 0 }] }));
  assert.equal(gcalls(/thumbnails\/set\?videoId=EV3/).length, 0); assert.equal("warning" in (await cur("s3")).youtube, false); assert.equal((await cur("s3")).youtube.status, "ok");
  // A thumbnail failure never fails the sync: the event exists, the status is ok with a warning.
  eg.thumbErr = true;
  await fire("s4", null, wstream());
  eg.thumbErr = false;
  const s4 = await cur("s4"); assert.equal(s4.youtube.status, "ok"); assert.ok(/Thumbnail skipped/.test(s4.youtube.warning)); assert.equal((await watchOf("s4")).youtube.landscapeId, "EV4");
  assert.ok(eg.events.has("EV4"));

  // ---------- cancel deletes; a removed stream deletes ----------
  m = mark();
  await edit("s1", { state: "cancelled" });
  assert.equal(eg.events.has("EV1"), false); assert.equal(since(m).filter((c) => c.method === "DELETE").length, 1);
  const w1c = await watchOf("s1"); assert.equal(w1c.youtube.landscapeId, null); assert.equal(w1c.youtube.hash, null);
  assert.equal((await cur("s1")).youtube.status, "ok");
  m = mark();
  await edit("s1", { rev: 9 }); assert.equal(since(m).length, 0, "a cancelled stream with no event: nothing");
  // A removed stream whose event is already gone (a cancelled stream's ids are cleared) still takes its watch doc with it.
  const lines = []; const realLog = console.log; console.log = (...x) => { lines.push(x.join(" ")); };
  try {
    assert.ok(await watchOf("s1"), "the cancelled stream still has a (null-id) watch doc");
    await fire("s1", await cur("s1"), null);
    assert.equal(await watchOf("s1"), undefined, "a removed stream with no event leaves no watch doc");
  } finally { console.log = realLog; }
  assert.equal(lines.some((l) => /^youtubeSync s1: (create|update|delete)/.test(l)), false, "no event, no action line");
  const before2 = await cur("s2");
  await fire("s2", before2, null);
  assert.equal(eg.events.has("EV2"), false); assert.equal(await watchOf("s2"), undefined, "the watch doc goes with the stream");
  // A stream that has gone live is the Control Room's: hands off.
  m = mark();
  await edit("s3", { state: "live", actualStart: TS(NOW), title: "Changed while live" }); assert.equal(since(m).length, 0);

  // The Control Room's ad hoc stream and after-show are live before their event exists: createNow asks for the create directly (once).
  await wdb.doc(`${S}/streams/adhocLive`).set(wstream({ state: "live", actualStart: TS(NOW), adhoc: true, published: true }));
  const adhocLive = await cur("adhocLive");
  m = mark();
  assert.equal((await staging.hooks.syncStream("adhocLive", { before: null, after: adhocLive })).action, "none", "a live stream is handed off without createNow");
  assert.equal(since(m).length, 0);
  assert.equal((await staging.hooks.syncStream("adhocLive", { before: null, after: adhocLive, createNow: true })).action, "create");
  const nowId = (await watchOf("adhocLive")).youtube.landscapeId; assert.ok(nowId && eg.events.has(nowId));
  assert.equal((await staging.hooks.syncStream("adhocLive", { before: null, after: adhocLive, createNow: true })).action, "none", "createNow never makes a second event");
  assert.ok(await staging.hooks.apiClient(), "apiClient: a connected client for the Control Room");

  // ---------- every sync action is logged: action, stream id, event id (server log only) ----------
  {
    const log = []; const realLog = console.log; console.log = (...x) => { log.push(x.join(" ")); };
    try {
      await fire("sl", null, wstream({ title: "Logged" }));
      const id = (await watchOf("sl")).youtube.landscapeId;
      await edit("sl", { title: "Logged, edited" });
      await edit("sl", { state: "cancelled" });
      assert.ok(log.includes(`youtubeSync sl: create ${id}`), "create logged: " + JSON.stringify(log));
      assert.ok(log.includes(`youtubeSync sl: update ${id}`), "update logged");
      assert.ok(log.includes(`youtubeSync sl: delete ${id}`), "delete logged");
    } finally { console.log = realLog; }
    assert.ok(!/EVd+/.test(JSON.stringify(await cur("sl"))), "the public stream doc carries no event id");
  }

  // ---------- an event deleted by hand is recreated, with a warning ----------
  await fire("s5", null, wstream({ title: "Hand deleted" }));
  const first = (await watchOf("s5")).youtube.landscapeId; eg.events.delete(first);
  m = mark();
  await edit("s5", { title: "Hand deleted, edited" });
  const second = (await watchOf("s5")).youtube.landscapeId;
  assert.notEqual(second, first); assert.ok(eg.events.has(second));
  assert.equal(since(m).filter((c) => c.method === "POST" && /liveBroadcasts/.test(c.url)).length, 1);
  const s5 = await cur("s5"); assert.equal(s5.youtube.status, "ok"); assert.ok(/deleted by hand/.test(s5.youtube.warning));
  // Deleting an event that is already gone is fine too.
  eg.events.delete(second); await edit("s5", { state: "cancelled" });
  assert.equal((await cur("s5")).youtube.status, "ok"); assert.equal((await watchOf("s5")).youtube.landscapeId, null);

  // ---------- failures: quota, unauthorized, other; Retry ----------
  eg.insertErr = { status: 403, body: { error: { message: "quota", errors: [{ reason: "quotaExceeded" }] } } };
  await fire("s6", null, wstream({ title: "Quota day" }));
  let s6 = await cur("s6"); assert.equal(s6.youtube.status, "failed"); assert.equal(s6.youtube.error, "YouTube quota used up for today");
  assert.equal(await watchOf("s6"), undefined, "no event, no watch doc");
  eg.insertErr = { status: 401, body: { error: { message: "Bearer AT1 invalid" } } };
  await fire("s7", null, wstream({ title: "Auth day" }));
  assert.equal((await cur("s7")).youtube.status, "failed"); assert.equal((await cur("s7")).youtube.error, "Reconnect YouTube on /admin");
  eg.insertErr = { status: 500, body: { error: { message: "Backend Error with Bearer AT1 and id dQw4w9WgXcQ" } } };
  await fire("s8", null, wstream({ title: "Boom day" }));
  const s8 = await cur("s8"); assert.equal(s8.youtube.status, "failed"); assert.ok(!/AT1|dQw4w9WgXcQ|Bearer/.test(s8.youtube.error));
  eg.insertErr = null;
  // Retry: A2+ and the owner only; re-runs the sync now.
  assert.equal(await why(as(null, "youtubeRetry", { streamId: "s6" })), "signedOut");
  for (const uid of ["adm0", "m1", "fan"]) assert.equal(await why(as(uid, "youtubeRetry", { streamId: "s6" })), "notAllowed");
  assert.equal(await why(as("adm1", "youtubeRetry", {})), "args");
  assert.equal(await why(as("adm1", "youtubeRetry", { streamId: "nope" })), "noStream");
  assert.deepEqual(await as("adm1", "youtubeRetry", { streamId: "s6" }), { ok: true, status: "ok" });
  s6 = await cur("s6"); assert.equal(s6.youtube.status, "ok"); assert.equal("error" in s6.youtube, false, "the old error is gone");
  assert.ok((await watchOf("s6")).youtube.landscapeId);
  // Retry forces an update of an event that is already in sync (the hash is ignored).
  m = mark();
  assert.deepEqual(await as("boss", "youtubeRetry", { streamId: "s6" }), { ok: true, status: "ok" });
  assert.equal(since(m).filter((c) => c.method === "PUT" && /liveBroadcasts/.test(c.url)).length, 1);
  // A Retry that fails again says so.
  eg.insertErr = { status: 403, body: { error: { message: "q", errors: [{ reason: "quotaExceeded" }] } } };
  assert.deepEqual(await as("adm1", "youtubeRetry", { streamId: "s7" }), { ok: false, status: "failed" });
  eg.insertErr = null;
  assert.deepEqual(await as("adm1", "youtubeRetry", { streamId: "s7" }), { ok: true, status: "ok" });
  // An unpublished draft stays out of YouTube even on Retry.
  await wdb.doc(`${S}/streams/d1`).set(wstream({ state: "planned", published: false }));
  m = mark(); await as("adm1", "youtubeRetry", { streamId: "d1" }); assert.equal(since(m).length, 0);
  // The token is revoked: failed with the reconnect hint, then Connect again and Retry.
  wclock += 2 * H; eg.token = { error: "invalid_grant" };
  await fire("s9", null, wstream({ title: "Revoked" }));
  assert.equal((await cur("s9")).youtube.error, "Reconnect YouTube on /admin");
  eg.token = { access_token: "AT2", refresh_token: "RT3", expires_in: 3600, scope: SCOPE };
  await as("boss", "youtubeConnect", { code: "AGAIN", redirectUri: GOOD });
  assert.deepEqual(await as("adm1", "youtubeRetry", { streamId: "s9" }), { ok: true, status: "ok" });

  // ---------- nothing a client can read carries an id or a token; the rules keep the rest server-only ----------
  for (const [p, data] of wdb._store) {
    if (/\/private\//.test(p)) continue;
    const json = JSON.stringify(data);
    assert.ok(!/EV\d+/.test(json), `no event id in ${p}`);
    assert.ok(!/AT\d|RT\d|dQw4w9WgXcQ/.test(json), `no token in ${p}`);
  }
  const rules = require("fs").readFileSync(require("path").join(__dirname, "..", "..", "firestore.rules"), "utf8");
  assert.ok(/match \/private\/\{docId\} \{\s*allow read: if docId != 'watch' && isSiteStaff\(siteId\);/.test(rules), "streams/{id}/private/watch is server only");
  assert.ok(/match \/private\/\{docId\} \{\s*allow read, write: if false;/.test(rules), "sites/{id}/private/* (youtubeChannel) is server only");

  // ---------- production sync: public, no prefix, the production link ----------
  const prod = mkBuild("boomertanger-prod");
  await wdb.doc(`${S}/streams/pp1`).set(wstream({ title: "Prod stream" }));
  await prod.hooks.syncStream("pp1", { before: null, after: await cur("pp1") });
  const pev = eg.events.get((await watchOf("pp1")).youtube.landscapeId);
  assert.equal(pev.snippet.title, "Prod stream"); assert.equal(pev.status.privacyStatus, "public"); assert.ok(pev.snippet.description.includes("https://boomertanger.com/live"));

  // ---------- youtubeTidy ----------
  const bs = (o) => wstream({ type: "backstage", audience: "fanClub", state: "ended", actualStart: TS(NOW - 9 * 24 * H), actualEnd: TS(NOW - 8 * 24 * H), ...o });
  const seed = async (id, o, vid) => { await wdb.doc(`${S}/streams/${id}`).set(bs(o)); if (vid) await wdb.doc(`${S}/streams/${id}/private/watch`).set(L.watchDocShape({ backstageId: vid })); };
  await seed("b1", {}, "VID1");                                                         // 8 days ago: due at the default 7
  await seed("b2", { actualEnd: TS(NOW - 3 * 24 * H) }, "VID2");                         // 3 days ago
  await seed("b3", { type: "platform" }, "VID3");                                       // not backstage
  await seed("b4", { youtube: { madePrivateAt: 5 } }, "VID4");                          // already done
  await seed("b5", {});                                                                 // no video id on record
  await seed("b6", { state: "scheduled" }, "VID6");                                     // hasn't happened
  assert.equal(await staging.hooks.tidyDays(), 7, "default 7 days when live/main is missing");
  // Staging: events are private from the start, so it only marks them done, with no YouTube call.
  m = mark();
  const c1 = await staging.hooks.runTidy(NOW);
  assert.equal(since(m).length, 0, "staging: no API call"); assert.equal(c1.marked, 2); assert.equal(c1.madePrivate, 0);
  assert.ok((await cur("b1")).youtube.madePrivateAt); assert.ok((await cur("b5")).youtube.madePrivateAt);
  for (const id of ["b2", "b3", "b6"]) assert.equal((await cur(id)).youtube?.madePrivateAt, undefined, `${id} untouched`);
  assert.equal((await cur("b4")).youtube.madePrivateAt, 5);
  assert.equal((await staging.hooks.runTidy(NOW)).marked, 0, "a second run changes nothing");
  // Production: videos.update to private for the stored id, then the mark. The scheduled function does the same.
  await wdb.doc(`${S}/streams/b1`).update({ "youtube.madePrivateAt": realFs.FieldValue.delete() });
  m = mark();
  await prod.functions.youtubeTidy.run({});
  d = since(m);
  assert.ok(d.some((c) => c.method === "GET" && c.url.includes("videos?part=snippet,status&id=VID1")), "looked up VID1");
  assert.equal(eg.videos.get("VID1").status.privacyStatus, "private");
  assert.equal(d.some((c) => c.url.includes("VID2") || c.url.includes("VID3") || c.url.includes("VID6")), false, "only due streams");
  assert.ok((await cur("b1")).youtube.madePrivateAt);
  // The setting overrides the default: 2 days makes b2 due; 0 or false turns it off.
  await wdb.doc(`${S}/live/main`).set({ makeBackstagePrivateAfterDays: 2 });
  assert.equal(await prod.hooks.tidyDays(), 2);
  m = mark(); const c2 = await prod.hooks.runTidy(NOW);
  assert.equal(c2.days, 2); assert.equal(c2.madePrivate, 1); assert.ok((await cur("b2")).youtube.madePrivateAt); assert.ok(since(m).some((c) => c.url.includes("id=VID2")));
  await seed("b7", { actualEnd: TS(NOW - 5 * 24 * H) }, "VID7");
  for (const off of [0, false]) {
    await wdb.doc(`${S}/live/main`).set({ makeBackstagePrivateAfterDays: off });
    m = mark(); const c3 = await prod.hooks.runTidy(NOW); assert.equal(c3.days, 0); assert.equal(c3.marked, 0); assert.equal(since(m).length, 0);
  }
  assert.equal((await cur("b7")).youtube?.madePrivateAt, undefined);
  await wdb.doc(`${S}/live/main`).set({ makeBackstagePrivateAfterDays: "soon" });
  assert.equal(await prod.hooks.tidyDays(), 7, "a junk value falls back to the default");
  // A video already gone from YouTube is still marked done.
  await wdb.doc(`${S}/live/main`).set({ makeBackstagePrivateAfterDays: 2 });
  eg.videoGone = true; const c4 = await prod.hooks.runTidy(NOW); eg.videoGone = false;
  assert.equal(c4.marked, 1); assert.ok((await cur("b7")).youtube.madePrivateAt);

  Object.defineProperty(admin, "firestore", { value: realFs, configurable: true, writable: true });


  // ---------- youtube-cleanup.js: the client secret comes from Secret Manager, never the environment ----------
  {
    const { readSecret } = require("./youtube-cleanup");
    const asked = [];
    const getAuth = async () => ({ getAccessToken: async () => ({ token: "adc-token" }) });
    const ok = async (url, init) => { asked.push({ url, init }); return { ok: true, status: 200, json: async () => ({ payload: { data: Buffer.from("s3cr3t-value").toString("base64") } }) }; };
    assert.equal(await readSecret({ projectId: "boomertanger-staging", getAuth, fetchFn: ok }), "s3cr3t-value");
    assert.equal(asked[0].url, "https://secretmanager.googleapis.com/v1/projects/boomertanger-staging/secrets/YOUTUBE_CLIENT_SECRET/versions/latest:access");
    assert.equal(asked[0].init.headers.Authorization, "Bearer adc-token");
    assert.equal(asked[0].init.headers["x-goog-user-project"], "boomertanger-staging");
    const status = (code) => async () => ({ ok: false, status: code, json: async () => ({}) });
    const msg = async (fetchFn, auth = getAuth) => { try { await readSecret({ projectId: "boomertanger-staging", getAuth: auth, fetchFn }); return "no error"; } catch (e) { return e.message; } };
    assert.match(await msg(status(403)), /Secret Accessor role/);
    assert.match(await msg(status(404)), /has no version/);
    assert.match(await msg(status(500)), /returned 500/);
    assert.match(await msg(async () => ({ ok: true, status: 200, json: async () => ({ payload: { data: "" } }) })), /is empty/);
    assert.match(await msg(ok, async () => ({ getAccessToken: async () => null })), /gcloud auth application-default login/);
    for (const m of [await msg(status(403)), await msg(status(404)), await msg(status(500))]) assert.equal(m.includes("s3cr3t"), false);   // an error never carries the value
    const src = fs.readFileSync(require.resolve("./youtube-cleanup"), "utf8");
    assert.equal(/process\.env\.YOUTUBE_CLIENT_SECRET/.test(src), false);                // the old way is gone
    assert.equal(/console\.(log|error)\([^)]*clientSecret/.test(src), false);            // and the secret is never printed
  }
  console.log("check-youtube: all checks passed");
}

main().catch((e) => { console.error(e); process.exit(1); });
