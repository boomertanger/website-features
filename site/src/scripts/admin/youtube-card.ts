// /admin: the owner's Connect YouTube card (docs/specs/scream-planner.md §15). Shows "Not connected" with a Connect YouTube button,
// or the connected channel's title with Reconnect. The tokens never reach the browser; youtubeStatus only says whether it works.
// Preview (non-production, signed out, ?as=admin): connected sample, or ?yt=off for the not-connected look. Nothing is saved.
import { whenReady } from "../../lib/auth";
import { isProduction } from "../../lib/env.js";
import { messageFor } from "../../lib/errors";
import { startYouTube, youtubeReady } from "../../lib/youtube";
import { toast } from "../../../../shared/ui/toast.js";

const card = document.querySelector<HTMLElement>("[data-yt-card]");

export interface YouTubeStatus { connected: boolean; channelTitle?: string }

function show(st: YouTubeStatus | null, o: { preview: boolean; error?: string }) {
  if (!card) return;
  const btn = card.querySelector<HTMLButtonElement>("[data-yt-connect]")!;
  const badge = card.querySelector<HTMLElement>("[data-yt-badge]")!;
  const line = card.querySelector<HTMLElement>("[data-yt-status]")!;
  const justConnected = new URLSearchParams(location.search).get("youtube") === "connected";
  card.hidden = false;
  if (o.error) { badge.className = "bt-badge bt-badge--gray"; badge.textContent = "Unknown"; line.textContent = o.error; }
  else if (st?.connected) {
    badge.className = "bt-badge bt-badge--green"; badge.textContent = "Connected";
    line.textContent = (justConnected ? "YouTube connected. " : "") + (st.channelTitle ? `Channel: ${st.channelTitle}.` : "Connected.") + " Published streams get their YouTube events on their own.";
    btn.textContent = "Reconnect YouTube";
  } else { badge.className = "bt-badge bt-badge--gray"; badge.textContent = "Not connected"; line.textContent = "Not connected. Published streams won't get YouTube events until you connect."; }
  btn.disabled = !o.preview && !youtubeReady();
  btn.onclick = () => (o.preview ? toast("Preview: nothing saved", { kind: "info" }) : startYouTube());
}

/** Owner only (the caller checks; youtubeConnect and youtubeStatus check again on the server). */
export async function initYouTube() {
  try {
    const { call } = await import("../../lib/call");
    show(await call<YouTubeStatus>("youtubeStatus"), { preview: false });
  } catch (err) { show(null, { preview: false, error: messageFor(err, "Couldn't check YouTube.") }); }
}

if (!isProduction) {
  whenReady().then((s) => {
    const q = new URLSearchParams(location.search);
    if (s.user || q.get("as") !== "admin") return;
    show(q.get("yt") === "off" ? { connected: false } : { connected: true, channelTitle: "Boomertanger" }, { preview: true });
  });
}
