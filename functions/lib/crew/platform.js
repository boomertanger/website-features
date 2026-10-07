// Platform moderators (docs/specs/mod-machina.md sections 10, 14, 17): when someone joins the crew, they should be
// a moderator on Twitch (Helix, automatic) and on the YouTube and TikTok chats they said they would help in
// (a manual checklist in phase 1). When they leave (Alumni) the powers come off the same way.
//
// Twitch sync is OFF (crew/main.twitchSync = false) because no broadcaster token with the
// channel:manage:moderators scope is stored yet. While it is off, or whenever the Helix call fails, the work lands
// on the /admin/crew to-do list instead ("Add @handle as a Twitch mod"), at crew/main/todos/{id}. To switch it on:
//   1. Store the broadcaster's user token at sites/boomertanger/private/twitchBroadcaster
//      { accessToken, refreshToken, accessExpiresAt (ms), scope: ["channel:manage:moderators", ...] }
//      (a one-time "Connect Twitch" step with that scope; the page comes with the Crew admin pages).
//   2. Set crew/main.twitchSync = true.
//
//   mirror of the roster -> crewTwitchSync (trigger), crewTodoDone({ id }) (admins)
const { onCall } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const accounts = require("../accounts");
const { SITE_ID, paths, loadSettings } = require("./settings");
const { makeStore, fail } = require("./store");

const SCOPE = "channel:manage:moderators";
const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const HELIX = "https://api.twitch.tv/helix/moderation/moderators";

/** Is this roster entry supposed to hold platform mod powers? Alumni (and no roster) don't. */
const wantsPowers = (roster) => !!roster && roster.status !== "alumni";

/**
 * What should happen on each platform when a roster entry changes? Pure.
 * Returns [{ platform, action: "add" | "remove", text }].
 * Twitch always (every crew member mods there); YouTube and TikTok only where the person didn't say "no".
 */
function planChanges({ before, after, handle, twitchLogin }) {
  const was = wantsPowers(before), now = wantsPowers(after);
  if (was === now) return [];
  const action = now ? "add" : "remove", who = handle ? `@${handle}` : "a crew member";
  const prefs = (now ? after : before)?.platforms || {};
  const out = [{ platform: "twitch", action, text: `${now ? "Add" : "Remove"} ${twitchLogin ? `@${twitchLogin}` : who} as a Twitch mod` }];
  if ((prefs.ytLandscape && prefs.ytLandscape !== "no") || (prefs.ytVertical && prefs.ytVertical !== "no")) out.push({ platform: "youtube", action, text: `${now ? "Add" : "Remove"} ${who} as a YouTube moderator` });
  if (prefs.tiktok && prefs.tiktok !== "no") out.push({ platform: "tiktok", action, text: `${now ? "Add" : "Remove"} ${who} as a TikTok LIVE moderator` });
  return out;
}

function makePlatformMods({ db = admin.firestore(), fetchFn = globalThis.fetch, clientId = null, clientSecret = null, now = () => Date.now() } = {}) {
  const { FieldValue, Timestamp } = admin.firestore;
  const todoRef = (platform, uid, action) => db.doc(`${paths.settings()}/todos/${platform}_${uid}_${action}`);

  async function addTodo(uid, change, why) {
    const opposite = change.action === "add" ? "remove" : "add";
    const old = todoRef(change.platform, uid, opposite);
    if ((await old.get()).exists) await old.delete();                    // a later change cancels the earlier one
    await todoRef(change.platform, uid, change.action).set({ kind: "platformMod", platform: change.platform, action: change.action, uid, text: change.text, why: why || null, status: "open", createdAt: Timestamp.fromMillis(now()) });
  }

  /** A fresh broadcaster access token, or null when none is stored / it can't be refreshed. */
  async function broadcasterToken() {
    const ref = db.doc(`sites/${SITE_ID}/private/twitchBroadcaster`), snap = await ref.get();
    if (!snap.exists || !(snap.get("scope") || []).includes(SCOPE)) return null;
    if ((snap.get("accessExpiresAt") || 0) > now() + 60000) return snap.get("accessToken");
    if (!snap.get("refreshToken") || !clientId || !clientSecret) return null;
    const res = await fetchFn(TOKEN_URL, { method: "POST", body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: snap.get("refreshToken") }) });
    if (!res.ok) return null;
    const t = await res.json();
    if (!t.access_token) return null;
    await ref.set({ accessToken: t.access_token, refreshToken: t.refresh_token || snap.get("refreshToken"), accessExpiresAt: now() + (t.expires_in || 0) * 1000, scope: t.scope || snap.get("scope") }, { merge: true });
    return t.access_token;
  }

  /** Adds or removes the moderator on Twitch. Returns { done: true } or { done: false, why }. */
  async function twitchMod(action, twitchId) {
    const [token, cfg] = await Promise.all([broadcasterToken(), db.doc(`sites/${SITE_ID}/private/growthConfig`).get()]);
    const broadcasterId = cfg.exists ? cfg.get("twitchBroadcasterId") : null;
    if (!token) return { done: false, why: "no broadcaster token with channel:manage:moderators" };
    if (!broadcasterId || !twitchId) return { done: false, why: "missing Twitch ids" };
    const url = `${HELIX}?broadcaster_id=${encodeURIComponent(broadcasterId)}&user_id=${encodeURIComponent(twitchId)}`;
    const res = await fetchFn(url, { method: action === "add" ? "POST" : "DELETE", headers: { Authorization: `Bearer ${token}`, "Client-Id": clientId } });
    // 204 done; 400 means already a mod (add) or not a mod (remove): the state we wanted
    if (res.status === 204 || res.status === 200 || res.status === 400) return { done: true };
    return { done: false, why: `Twitch said ${res.status}` };
  }

  /** The roster entry changed: do what the plan says, or leave a to-do. Never throws. */
  async function sync(uid, before, after) {
    try {
      const [profile, user, settings] = await Promise.all([db.doc(`sites/${SITE_ID}/profiles/${uid}`).get(), db.doc(`users/${uid}`).get(), loadSettings(db)]);
      const handle = profile.exists ? profile.get("handle") : null, tw = user.exists ? user.get("linked.twitch") : null;
      const plan = planChanges({ before, after, handle, twitchLogin: tw?.login || null });
      const results = [];
      for (const change of plan) {
        if (change.platform !== "twitch") { await addTodo(uid, change, "manual in phase 1"); results.push({ ...change, todo: true }); continue; }
        if (!settings.twitchSync) { await addTodo(uid, change, "Twitch sync is off"); results.push({ ...change, todo: true }); continue; }
        let r;
        try { r = await twitchMod(change.action, tw?.id); } catch (err) { r = { done: false, why: String(err.message || err).slice(0, 120) }; }
        if (r.done) { await todoRef("twitch", uid, change.action).delete().catch(() => {}); results.push({ ...change, done: true }); }
        else { await addTodo(uid, change, r.why); results.push({ ...change, todo: true, why: r.why }); }
      }
      return results;
    } catch (err) { console.error("crew: platform mod sync failed", err); return []; }
  }
  return { sync, planChanges };
}

module.exports = function crewPlatform({ adminLogEntry } = {}) {
  const S = makeStore({ adminLogEntry });
  const { db, FieldValue } = S;

  const crewTwitchSync = onDocumentWritten({ document: "sites/{siteId}/crew/main/roster/{uid}", secrets: [accounts.TWITCH_CLIENT_SECRET] }, async (event) => {
    if (event.params.siteId !== SITE_ID) return;
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after = event.data.after.exists ? event.data.after.data() : null;
    if (wantsPowers(before) === wantsPowers(after)) return;
    let clientId = null, clientSecret = null;
    try { clientId = accounts.TWITCH_CLIENT_ID.value(); clientSecret = accounts.TWITCH_CLIENT_SECRET.value(); } catch { /* the values are only needed to refresh a token */ }
    await makePlatformMods({ db, clientId, clientSecret }).sync(event.params.uid, before, after);
  });

  const crewTodoDone = onCall(async (request) => {
    const uid = S.requireAuth(request);
    const w = await S.who(uid);
    if (!w.isAdmin) throw fail("permission-denied", "Admins only.", "notAdmin");
    const id = request.data?.id;
    if (typeof id !== "string" || !/^[a-z]+_[A-Za-z0-9]+_(add|remove)$/.test(id)) throw fail("invalid-argument", "id is required.", "args");
    const ref = db.doc(`${paths.settings()}/todos/${id}`), snap = await ref.get();
    if (!snap.exists) throw fail("not-found", "That to-do doesn't exist.", "noTodo");
    await ref.update({ status: "done", doneBy: uid, doneAt: FieldValue.serverTimestamp() });
    return { ok: true };
  });

  return { crewTwitchSync, crewTodoDone };
};
module.exports.makePlatformMods = makePlatformMods;
module.exports.planChanges = planChanges;
module.exports.wantsPowers = wantsPowers;
