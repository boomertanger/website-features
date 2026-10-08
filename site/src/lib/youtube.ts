// Google OAuth for the owner's "Connect YouTube" on /admin (docs/specs/scream-planner.md §15).
// The browser goes to Google; Google returns to /auth/youtube/callback with a code, and that
// page hands it to the youtubeConnect callable, which swaps it for tokens server side
// (no client access). A random CSRF state rides in sessionStorage and must match on return.
import { youtubeClientId } from "../data/site.json";

const KEY = "bt-youtube-flow";
export const YOUTUBE_CALLBACK = "/auth/youtube/callback";
export const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";
export const youtubeReady = () => !!youtubeClientId;

export function startYouTube() {
  const state = crypto.getRandomValues(new Uint32Array(4)).join("-");
  try { sessionStorage.setItem(KEY, state); } catch { /* the callback will say it expired */ }
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", youtubeClientId);
  url.searchParams.set("redirect_uri", location.origin + YOUTUBE_CALLBACK);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", YOUTUBE_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  location.assign(url.toString());
}

/** Reads (and clears) the state the callback must match. */
export function takeYouTubeState(): string | null {
  try {
    const s = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return s;
  } catch {
    return null;
  }
}
