// functions/lib/twitchBroadcaster.js: the Boomertanger broadcaster's Twitch user token (docs/specs/club-pass.md §12). One token,
// connected once by the owner on /admin (lib/club: clubBroadcasterStart / clubBroadcasterConnect), stored server-only at
// sites/boomertanger/private/twitchBroadcaster (firestore.rules: no client access):
//   { accessToken, refreshToken, accessExpiresAt (ms), scope: [...], twitchUserId, login, connectedAt, connectedBy, refreshedAt,
//     health: { ok, at, why? } }
// The same shape lib/crew/platform.js reads for the Twitch moderator sync (which stays off: crew/main.twitchSync).
// Everything goes through the injected fetchFn so scripts/check-club.js fakes Twitch. Tokens never leave this module except as the
// return value of token(), and never go into logs or errors.
//
//   const b = makeBroadcaster({ db, fetchFn: fetch, clientId, clientSecret, now: Date.now });
//   await b.token()                          // a valid access token (refreshed when < 5 min left); throws BroadcasterError
//   await b.status({ validate: true })       // { connected, login, twitchUserId, scope, accessExpiresAt, health }
//   await b.exchange({ code, redirectUri })  // the code -> tokens + who they belong to (not stored)
//   await b.store(tokens, { connectedBy }) / await b.disconnect()
const SITE_ID = "boomertanger";
const DOC_PATH = `sites/${SITE_ID}/private/twitchBroadcaster`;
const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const VALIDATE_URL = "https://id.twitch.tv/oauth2/validate";
const REVOKE_URL = "https://id.twitch.tv/oauth2/revoke";
const AUTH_URL = "https://id.twitch.tv/oauth2/authorize";
const SCOPES = ["channel:read:subscriptions", "channel:manage:moderators"];
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** Typed error: code "none" (not connected), "reconnect" (refresh refused: connect again), "network" or "exchange". */
class BroadcasterError extends Error {
  constructor(code, message) { super(message); this.name = "BroadcasterError"; this.code = code; }
}

/** The Twitch consent URL for the broadcaster (force_verify, so the owner sees which account and scopes). */
function authUrl({ clientId, redirectUri, state }) {
  const p = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: SCOPES.join(" "), state, force_verify: "true" });
  return `${AUTH_URL}?${p.toString()}`;
}

const readJson = async (res) => { try { return await res.json(); } catch { return {}; } };
const scopeList = (s) => (Array.isArray(s) ? s.map(String) : typeof s === "string" ? s.split(" ").filter(Boolean) : []);

function makeBroadcaster({ db, fetchFn = fetch, clientId, clientSecret, now = Date.now }) {
  const ref = () => db.doc(DOC_PATH);

  async function tokenCall(params) {
    let res;
    try { res = await fetchFn(TOKEN_URL, { method: "POST", body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }) }); }
    catch { throw new BroadcasterError("network", "Could not reach Twitch."); }
    const body = await readJson(res);
    if (!res.ok) {
      if (params.grant_type === "refresh_token" && (res.status === 400 || res.status === 401)) throw new BroadcasterError("reconnect", "Twitch needs the broadcaster to connect again.");
      throw new BroadcasterError("exchange", `Twitch refused the request (HTTP ${res.status}).`);
    }
    if (!body.access_token) throw new BroadcasterError("exchange", "Twitch sent no token.");
    return body;
  }

  /** Who a token belongs to: { login, userId, scope, expiresIn } or null when Twitch says it's invalid. */
  async function validate(accessToken) {
    let res;
    try { res = await fetchFn(VALIDATE_URL, { headers: { Authorization: `OAuth ${accessToken}` } }); }
    catch { throw new BroadcasterError("network", "Could not reach Twitch."); }
    if (res.status === 401) return null;
    if (!res.ok) throw new BroadcasterError("network", `Twitch didn't answer the check (HTTP ${res.status}).`);
    const b = await readJson(res);
    return { login: String(b.login || "").toLowerCase(), userId: String(b.user_id || ""), scope: scopeList(b.scopes), expiresIn: Number(b.expires_in) || 0 };
  }

  /** The code from the consent screen -> { accessToken, refreshToken, accessExpiresAt, scope, twitchUserId, login }. Not stored. */
  async function exchange({ code, redirectUri }) {
    const t = await tokenCall({ code, grant_type: "authorization_code", redirect_uri: redirectUri });
    if (!t.refresh_token) throw new BroadcasterError("exchange", "Twitch sent no refresh token.");
    const who = await validate(t.access_token);
    if (!who) throw new BroadcasterError("exchange", "Twitch didn't accept its own token.");
    return { accessToken: t.access_token, refreshToken: t.refresh_token, accessExpiresAt: now() + (Number(t.expires_in) || 0) * 1000, scope: scopeList(t.scope).length ? scopeList(t.scope) : who.scope, twitchUserId: who.userId, login: who.login };
  }

  async function store(tokens, { connectedBy = null } = {}) {
    await ref().set({ ...tokens, connectedAt: now(), connectedBy, refreshedAt: now(), health: { ok: true, at: now() } });
  }

  async function markHealth(ok, why) {
    await ref().set({ health: ok ? { ok: true, at: now() } : { ok: false, at: now(), why } }, { merge: true }).catch(() => {});
  }

  /** A valid access token for Helix (refreshing when it has under 5 minutes left). */
  async function token() {
    const snap = await ref().get();
    if (!snap.exists || !snap.get("refreshToken")) throw new BroadcasterError("none", "The broadcaster's Twitch isn't connected.");
    if ((snap.get("accessExpiresAt") || 0) > now() + REFRESH_MARGIN_MS) return snap.get("accessToken");
    let t;
    try { t = await tokenCall({ grant_type: "refresh_token", refresh_token: snap.get("refreshToken") }); }
    catch (err) { if (err.code === "reconnect") await markHealth(false, "reconnect"); throw err; }
    await ref().set({ accessToken: t.access_token, refreshToken: t.refresh_token || snap.get("refreshToken"), accessExpiresAt: now() + (Number(t.expires_in) || 0) * 1000, scope: scopeList(t.scope).length ? scopeList(t.scope) : snap.get("scope") || [], refreshedAt: now(), health: { ok: true, at: now() } }, { merge: true });
    return t.access_token;
  }

  /** For the /admin card. validate: also ask Twitch whether the token works now (refreshing first if needed). Never returns a token. */
  async function status({ validate: check = false } = {}) {
    const snap = await ref().get();
    if (!snap.exists || !snap.get("refreshToken")) return { connected: false };
    const d = snap.data();
    const out = { connected: true, login: d.login || null, twitchUserId: d.twitchUserId || null, scope: d.scope || [], accessExpiresAt: d.accessExpiresAt || null, connectedAt: d.connectedAt || null, refreshedAt: d.refreshedAt || null, health: d.health || null };
    if (!check) return out;
    try {
      const who = await validate(await token());
      out.health = who ? { ok: true, at: now() } : { ok: false, at: now(), why: "invalid" };
      if (!who) await markHealth(false, "invalid");
      const fresh = (await ref().get()).data() || {};
      out.accessExpiresAt = fresh.accessExpiresAt || out.accessExpiresAt;
      out.missingScopes = SCOPES.filter((s) => !(fresh.scope || []).includes(s));
    } catch (err) { out.health = { ok: false, at: now(), why: err.code || "error" }; }
    return out;
  }

  /** Revokes the token at Twitch (best effort) and deletes the stored one. Returns what was connected ({ login } or null). */
  async function disconnect() {
    const snap = await ref().get();
    if (!snap.exists) return null;
    const tok = snap.get("refreshToken") || snap.get("accessToken");
    if (tok) await fetchFn(REVOKE_URL, { method: "POST", body: new URLSearchParams({ client_id: clientId, token: tok }) }).catch(() => {});
    await ref().delete();
    return { login: snap.get("login") || null };
  }

  /** Gives a token back to Twitch (an exchange for the wrong account). */
  const revoke = (tok) => fetchFn(REVOKE_URL, { method: "POST", body: new URLSearchParams({ client_id: clientId, token: tok }) }).catch(() => {});

  return { token, status, exchange, store, disconnect, revoke, validate };
}

module.exports = { makeBroadcaster, authUrl, BroadcasterError, SCOPES, DOC_PATH };
