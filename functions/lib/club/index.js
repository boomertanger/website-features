// Club Pass backend (docs/specs/club-pass.md §11, §12). functions/index.js calls build({ adminLogEntry }) and spreads .functions into
// its exports, the same way lib/climb does.
//
//   clubBroadcasterStart       owner: { redirectUri } -> { url, state }. Stores a one-time state (10 minutes) server-side at
//                              sites/boomertanger/private/twitchBroadcasterConnect; the site sends the owner to Twitch's consent screen.
//   clubBroadcasterConnect     owner: { code, state, redirectUri } from /auth/twitch/callback (mode "broadcaster"). Checks the state,
//                              swaps the code, checks the token is the Boomertanger channel's (TWITCH_LOGIN, and growthConfig's
//                              twitchBroadcasterId when known) with both scopes, then stores it (lib/twitchBroadcaster.js). adminLog.
//   clubBroadcasterStatus      owner: connected as, scopes, token health (asks Twitch). Never returns a token.
//   clubBroadcasterDisconnect  owner: revokes and deletes the token. adminLog.
//
// adminLog feature "clubPass". No activityLog.
const { onCall } = require("firebase-functions/v2/https");
const { defineString } = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("crypto");
const accounts = require("../accounts");
const { SITE_ID, fail, callerInfo } = require("../vault/common");
const { makeBroadcaster, authUrl, BroadcasterError, SCOPES, DOC_PATH } = require("../twitchBroadcaster");

const FEATURE = "clubPass";
const TWITCH_LOGIN = defineString("TWITCH_LOGIN");
const STATE_TTL_MS = 10 * 60 * 1000;
const SECRETS = [accounts.TWITCH_CLIENT_SECRET];

function projectId() {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  try { return JSON.parse(process.env.FIREBASE_CONFIG || "{}").projectId || ""; } catch { return ""; }
}

function build(deps = {}) {
  const db = deps.db || admin.firestore();
  const now = deps.now || Date.now;
  const fetchFn = deps.fetchFn || fetch;
  const adminLogEntry = deps.adminLogEntry;
  const R = {
    connect: db.doc(`sites/${SITE_ID}/private/twitchBroadcasterConnect`),
    growthConfig: db.doc(`sites/${SITE_ID}/private/growthConfig`),
  };
  const clientId = () => deps.clientId ?? accounts.TWITCH_CLIENT_ID.value();
  const login = () => String(deps.twitchLogin ?? TWITCH_LOGIN.value() ?? "").toLowerCase();
  const redirects = () => deps.redirects ?? (accounts.TWITCH_REDIRECTS[projectId()] || []);
  let bc = null;
  const broadcaster = () => (bc ||= makeBroadcaster({ db, fetchFn, clientId: clientId(), clientSecret: deps.clientSecret ?? accounts.TWITCH_CLIENT_SECRET.value(), now }));

  async function requireOwner(request) {
    const c = await callerInfo(request);
    if (!c.isOwner) throw fail("permission-denied", "Only the owner can connect the broadcaster's Twitch.", "notOwner");
    return c;
  }
  async function log(c, action, details) {
    try {
      await db.collection("adminLog").add(await adminLogEntry(db, { feature: FEATURE, action, itemPath: DOC_PATH, itemTitle: "Twitch broadcaster", actorUid: c?.uid ?? null, actorName: c?.name || "Automatic", reason: "", details }));
    } catch (err) { console.error("club: adminLog write failed", err); }
  }
  const okRedirect = (u) => typeof u === "string" && redirects().includes(u);

  // ---------- the broadcaster token ----------
  async function startConnect(request) {
    const c = await requireOwner(request);
    const { redirectUri } = request.data || {};
    if (!okRedirect(redirectUri)) throw fail("invalid-argument", "That return address isn't allowed.", "redirectUri");
    const state = crypto.randomBytes(24).toString("hex");
    await R.connect.set({ state, uid: c.uid, expireAt: now() + STATE_TTL_MS });
    return { url: authUrl({ clientId: clientId(), redirectUri, state }), state };
  }

  async function finishConnect(request) {
    const c = await requireOwner(request);
    const { code, state, redirectUri } = request.data || {};
    if (typeof code !== "string" || !code || code.length > 200) throw fail("invalid-argument", "Twitch didn't send a code.", "code");
    if (!okRedirect(redirectUri)) throw fail("invalid-argument", "That return address isn't allowed.", "redirectUri");
    // The state is one-time: read and delete it together, then check it.
    const saved = await db.runTransaction(async (tx) => {
      const s = await tx.get(R.connect);
      if (s.exists) tx.delete(R.connect);
      return s.exists ? s.data() : null;
    });
    const same = saved && typeof state === "string" && state.length === String(saved.state).length && crypto.timingSafeEqual(Buffer.from(state), Buffer.from(String(saved.state)));
    if (!same || saved.uid !== c.uid || !(saved.expireAt > now())) throw fail("failed-precondition", "That connection expired. Press Connect again.", "state");
    let t;
    try { t = await broadcaster().exchange({ code, redirectUri }); }
    catch (err) {
      console.error("clubBroadcasterConnect: exchange failed", err?.code);
      if (err instanceof BroadcasterError && err.code === "network") throw fail("unavailable", "Could not reach Twitch. Try again.", "network");
      throw fail("permission-denied", "Twitch didn't accept that. Press Connect again.", "exchange");
    }
    const cfg = (await R.growthConfig.get()).data() || {};
    const wrongUser = t.login !== login() || (cfg.twitchBroadcasterId && String(cfg.twitchBroadcasterId) !== t.twitchUserId);
    const missing = SCOPES.filter((s) => !t.scope.includes(s));
    if (wrongUser || missing.length) {
      await broadcaster().revoke(t.refreshToken);
      if (wrongUser) throw fail("permission-denied", `That's ${t.login || "another account"} on Twitch. Sign in to Twitch as ${login()} and connect again.`, "wrongChannel");
      throw fail("failed-precondition", `Twitch didn't grant ${missing.join(" and ")}. Connect again and allow both.`, "scopes");
    }
    await broadcaster().store(t, { connectedBy: c.uid });
    await log(c, "broadcasterConnect", { login: t.login, scope: t.scope });
    return { ok: true, login: t.login };
  }

  async function broadcasterStatus(request) {
    await requireOwner(request);
    return broadcaster().status({ validate: true });
  }

  async function disconnect(request) {
    const c = await requireOwner(request);
    const was = await broadcaster().disconnect();
    if (was) await log(c, "broadcasterDisconnect", { login: was.login });
    return { ok: true, wasConnected: !!was };
  }

  const functions = {
    clubBroadcasterStart: onCall(startConnect),
    clubBroadcasterConnect: onCall({ secrets: SECRETS }, finishConnect),
    clubBroadcasterStatus: onCall({ secrets: SECRETS }, broadcasterStatus),
    clubBroadcasterDisconnect: onCall(disconnect),
  };
  return { functions, helpers: { startConnect, finishConnect, broadcasterStatus, disconnect, broadcaster } };
}

module.exports = (deps) => build(deps).functions;
module.exports.build = build;
