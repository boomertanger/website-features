// functions/lib/youtube/auth.js: Connect YouTube (docs/specs/scream-planner.md section 15). Google
// OAuth for the channel owner; tokens live server-only at sites/boomertanger/private/youtubeChannel.
// Everything goes through the injected fetchFn so scripts/check-youtube.js fakes Google.
//
//   const auth = makeAuth({ db, fetchFn: fetch, clientId, clientSecret, now: Date.now });
//   await auth.exchangeCode({ code, redirectUri, connectedBy })   // the youtubeConnect callable
//   const token = await auth.accessToken();                       // refreshes when < 60 s left
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true";
const SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";
const DOC_PATH = "sites/boomertanger/private/youtubeChannel";
const EXPIRY_MARGIN_MS = 60 * 1000;

// Google returns here (the redirect URIs registered on the OAuth client), same shape as TIKTOK_REDIRECTS.
const REDIRECTS = {
  "boomertanger-staging": [
    "http://localhost:4321/auth/youtube/callback",
    "https://staging.boomertanger.com/auth/youtube/callback",
  ],
  "boomertanger-prod": [
    // TODO: the production site's /auth/youtube/callback when it launches.
  ],
};

/** Typed auth error: code is "reconnect" (token revoked or expired for good), "exchange" or "network". */
class YoutubeAuthError extends Error {
  constructor(code, message) { super(message); this.name = "YoutubeAuthError"; this.code = code; }
}

/** The Google sign-in URL (the site mirrors this): offline access and a forced consent screen so a refresh token always comes back. */
function authUrl({ clientId, redirectUri, state }) {
  const p = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: SCOPE,
    access_type: "offline", prompt: "consent", include_granted_scopes: "false", state: state || "",
  });
  return `${AUTH_URL}?${p.toString()}`;
}

const readJson = async (res) => { try { return await res.json(); } catch { return {}; } };

function makeAuth({ db, fetchFn, clientId, clientSecret, now = Date.now }) {
  const ref = () => db.doc(DOC_PATH);

  async function tokenCall(params) {
    let res;
    try {
      res = await fetchFn(TOKEN_URL, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }).toString(),
      });
    } catch { throw new YoutubeAuthError("network", "Could not reach Google."); }
    const body = await readJson(res);
    if (!res.ok) {
      // Never put Google's text (or any token) in the message beyond the short error code.
      if (body.error === "invalid_grant") throw new YoutubeAuthError("reconnect", "YouTube needs to be connected again.");
      throw new YoutubeAuthError("exchange", `Google refused the request (${String(body.error || res.status).slice(0, 40)}).`);
    }
    return body;
  }

  /** Swaps the sign-in code for tokens, looks up the channel and stores everything. Returns { channelTitle } only. */
  async function exchangeCode({ code, redirectUri, connectedBy = null }) {
    const t = await tokenCall({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
    if (!t.refresh_token) throw new YoutubeAuthError("exchange", "Google did not send a refresh token. Connect again.");
    const ch = await fetchChannel(t.access_token);
    await ref().set({
      accessToken: t.access_token, accessExpiresAt: now() + (Number(t.expires_in) || 3600) * 1000,
      refreshToken: t.refresh_token, channelId: ch.channelId, channelTitle: ch.channelTitle,
      scope: t.scope || SCOPE, connectedBy, connectedAt: now(),
    });
    return { channelTitle: ch.channelTitle };
  }

  /** A valid access token: the stored one, or a refreshed one when it expires within 60 s. */
  async function accessToken() {
    const snap = await ref().get();
    if (!snap.exists || !snap.get("refreshToken")) throw new YoutubeAuthError("reconnect", "YouTube is not connected.");
    const cur = snap.get("accessToken");
    if (cur && snap.get("accessExpiresAt") - now() > EXPIRY_MARGIN_MS) return cur;
    const t = await tokenCall({ grant_type: "refresh_token", refresh_token: snap.get("refreshToken") });
    // Google usually omits refresh_token on a refresh: keep the stored one.
    await ref().set({
      accessToken: t.access_token, accessExpiresAt: now() + (Number(t.expires_in) || 3600) * 1000,
      refreshToken: t.refresh_token || snap.get("refreshToken"),
    }, { merge: true });
    return t.access_token;
  }

  /** The signed-in channel: { channelId, channelTitle }. */
  async function fetchChannel(token) {
    const res = await fetchFn(CHANNELS_URL, { headers: { Authorization: `Bearer ${token}` } });
    const body = await readJson(res);
    const item = body.items && body.items[0];
    if (!res.ok || !item) throw new YoutubeAuthError("exchange", "That Google account has no YouTube channel.");
    return { channelId: item.id, channelTitle: item.snippet?.title || "" };
  }

  /** Connected or not, and the channel name. No secrets, safe to hand to the owner's browser. */
  async function status() {
    const snap = await ref().get();
    const connected = snap.exists && !!snap.get("refreshToken");
    return { connected, channelTitle: connected ? snap.get("channelTitle") || "" : "" };
  }

  return { exchangeCode, accessToken, fetchChannel, status };
}

module.exports = { makeAuth, authUrl, REDIRECTS, SCOPE, TOKEN_URL, DOC_PATH, YoutubeAuthError };
