// Twitch sign-in and linking: the authorization-code flow (docs/specs/accounts.md).
// The browser goes to Twitch; Twitch returns to /auth/twitch/callback with a code,
// and that page hands the code to the twitchAuth callable. The same callback page
// serves both modes; sessionStorage carries the mode, a CSRF state and where to
// return afterwards.
import { twitchClientId } from "../data/site.json";

const KEY = "bt-twitch-flow";
export const TWITCH_CALLBACK = "/auth/twitch/callback";

export interface TwitchFlow { state: string; mode: "signin" | "link"; returnTo: string }

export function startTwitch(mode: "signin" | "link", returnTo = location.pathname + location.search + location.hash) {
  const state = crypto.getRandomValues(new Uint32Array(4)).join("-");
  try { sessionStorage.setItem(KEY, JSON.stringify({ state, mode, returnTo } satisfies TwitchFlow)); } catch { /* the callback will say the sign-in expired */ }
  const url = new URL("https://id.twitch.tv/oauth2/authorize");
  url.searchParams.set("client_id", twitchClientId);
  url.searchParams.set("redirect_uri", location.origin + TWITCH_CALLBACK);
  url.searchParams.set("response_type", "code");
  // openid + claims: userinfo then says whether the email is verified.
  url.searchParams.set("scope", "openid user:read:email");
  url.searchParams.set("claims", JSON.stringify({ userinfo: { email: null, email_verified: null } }));
  url.searchParams.set("state", state);
  // Linking always asks, so people can pick a different Twitch account than the one signed in there.
  if (mode === "link") url.searchParams.set("force_verify", "true");
  location.assign(url.toString());
}

/** Reads (and clears) the flow the callback belongs to. */
export function takeTwitchFlow(): TwitchFlow | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return raw ? (JSON.parse(raw) as TwitchFlow) : null;
  } catch {
    return null;
  }
}

/** Only same-site paths are followed after sign-in. */
export function safeReturn(path: string | null | undefined): string {
  return path && path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/auth/") ? path : "/";
}
