// TikTok Login Kit for the owner's "Connect TikTok" on /admin (docs/specs/growth-collector.md).
// The browser goes to TikTok; TikTok returns to /auth/tiktok/callback with a code, and
// that page hands it to the tiktokConnect callable, which swaps it for tokens server
// side (stored in sites/{siteId}/private/tiktokAuth, no client access).
// sessionStorage carries a CSRF state.
import { tiktokClientKey } from "../data/site.json";

const KEY = "bt-tiktok-flow";
export const TIKTOK_CALLBACK = "/auth/tiktok/callback";
export const tiktokReady = () => !!tiktokClientKey;

export function startTikTok() {
  const state = crypto.getRandomValues(new Uint32Array(4)).join("-");
  try { sessionStorage.setItem(KEY, state); } catch { /* the callback will say it expired */ }
  const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
  url.searchParams.set("client_key", tiktokClientKey);
  url.searchParams.set("scope", "user.info.basic,user.info.stats,video.list");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", location.origin + TIKTOK_CALLBACK);
  url.searchParams.set("state", state);
  location.assign(url.toString());
}

/** Reads (and clears) the state the callback must match. */
export function takeTikTokState(): string | null {
  try {
    const s = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return s;
  } catch {
    return null;
  }
}
