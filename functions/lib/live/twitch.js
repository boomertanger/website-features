// Control Room, a small Twitch Helix client on the APP token (docs/specs/control-room.md §10). The token call is the growth
// collector's (lib/growth/collect.js twitchAppToken), shared, not copied. Everything goes through the injected fetchFn so the checks
// fake Twitch. Never logs the client secret or the token.
const { twitchAppToken, getJson } = require("../growth/collect");

function makeTwitch({ fetchFn, clientId, clientSecret, now = Date.now }) {
  let tok = null;
  async function headers() {
    if (!clientId || !clientSecret) throw new Error("twitch: not configured");
    if (!tok || tok.exp < now() + 60 * 1000) {
      const t = await twitchAppToken(fetchFn, clientId, clientSecret);
      tok = { v: t.access_token, exp: now() + (Number(t.expires_in) || 3600) * 1000 };
    }
    return { Authorization: `Bearer ${tok.v}`, "Client-Id": clientId };
  }
  const helix = async (pathAndQuery, label, init = {}) => getJson(fetchFn, `https://api.twitch.tv/helix/${pathAndQuery}`, { ...init, headers: { ...(await headers()), ...(init.headers || {}) } }, label);
  return {
    helix,
    /** Get Streams for one broadcaster: { live, viewers, startedAt } (live false when the channel is offline). */
    async streamStatus(broadcasterId) {
      const d = await helix(`streams?user_id=${encodeURIComponent(broadcasterId)}&type=live`, "twitch streams");
      const s = d && d.data && d.data[0];
      return s ? { live: true, viewers: Number(s.viewer_count) || 0, startedAt: s.started_at ? Date.parse(s.started_at) : null } : { live: false, viewers: 0, startedAt: null };
    },
    /** The broadcaster id for a login (users endpoint). */
    async userId(login) {
      const d = await helix(`users?login=${encodeURIComponent(login)}`, "twitch users");
      return d && d.data && d.data[0] ? String(d.data[0].id) : null;
    },
  };
}

module.exports = { makeTwitch };
