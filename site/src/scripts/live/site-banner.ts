// The live banner on every page while a check-in window is open (docs/specs/control-room.md §4; kit .bt-live-banner; mockup control-room-batch-3.html
// section 2): "Check-in is open · Break 1 · 4:31 left" with a Check in button (visitors: "Join free to check in", which opens the Join dialog titled
// "Join to check in"). After checking in it turns green ("You're in for Break 1 · +10 XP") until the window closes. It can be dismissed for that window
// (remembered for the session in sessionStorage). Never on /live (its own panel) or /live/control.
// Loaded by BaseLayout only once public/live says a window is open, so pages pay nothing the rest of the time. Reads the same shared public/live
// listener (lib/live.ts) through pub-data.ts; a member's own presence doc is read once per stream.
import { onAuth, type AuthState } from "../../lib/auth";
import type { Presence, PubApi } from "./pub-data";
import { pubApi } from "./pub-data";
import { beatOf, isOpenNow } from "./checkin-flow";
import { initLiveBanner, isMember, liveBannerHtml } from "./pub-ui";
import type { Beat, PubLive } from "./model";
import { announceOverlay } from "./ui";

const DISMISS_KEY = "bt-lb-dismissed";
const host = () => document.querySelector<HTMLElement>("[data-live-banner]");

let api: PubApi;
let pub: PubLive | null = null;
let auth: AuthState | null = null;
let presence: Presence | null = null;
let presenceFor = "";
let shown = "";
let doneXp: Record<string, number> = {};      // XP just earned this session, by "streamId|beat"

const windowKey = (p: PubLive) => `${p.streamId}|${beatOf(p)}`;
const dismissed = (p: PubLive) => { try { return sessionStorage.getItem(DISMISS_KEY) === windowKey(p); } catch { return false; } };
const member = () => !!auth && isMember(auth);

async function loadPresence() {
  if (!pub?.streamId || !auth || !member()) { presence = null; presenceFor = ""; return; }
  const key = `${pub.streamId}|${auth.user?.uid || "preview"}`;
  if (presenceFor === key) return;
  presenceFor = key;
  presence = await api.presence(pub.streamId, auth);
  render(true);
}

/** Draws, removes or leaves the banner alone. `force` redraws even when nothing in its key changed. */
function render(force = false) {
  const el = host();
  if (!el || !pub || !auth || auth.status === "loading") return;
  const p = pub;
  const open = isOpenNow(p) && !dismissed(p);
  if (!open) { if (shown) { el.innerHTML = ""; el.hidden = true; shown = ""; } return; }
  const beat = beatOf(p) as Beat;
  const isIn = member() && !!presence?.beats[beat];
  const key = `${isIn ? "in" : member() ? "open" : "visitor"}|${windowKey(p)}|${p.window.closesAt}`;
  if (!force && key === shown) return;
  shown = key;
  el.hidden = false;
  const xp = doneXp[windowKey(p)];
  el.innerHTML = isIn
    ? liveBannerHtml({ state: "in", beat, extra: xp ? `+${xp} XP` : "", dismissible: true })
    : liveBannerHtml({ state: "open", beat, closesAt: p.window.closesAt || 0, cta: member() ? "Check in" : "Join free to check in", dismissible: true });
  const banner = el.querySelector<HTMLElement>(".bt-live-banner")!;
  if (!member()) {
    const btn = banner.querySelector<HTMLElement>("[data-checkin-open]");
    btn?.setAttribute("data-signin", "join"); btn?.setAttribute("data-signin-title", "Join to check in");   // the Join dialog (scripts/account/ui.ts)
  }
  initLiveBanner(el, {});   // the Check in button fires a bubbling bt-checkin-open, handled once below
  banner.addEventListener("bt-banner-dismiss", () => { try { sessionStorage.setItem(DISMISS_KEY, windowKey(p)); } catch { /* storage off */ } shown = ""; });
  banner.addEventListener("bt-checkin-closed", () => { shown = ""; render(); });
}

async function openDialog() {
  const { openCheckinDialog } = await import("./checkin-dialog");
  announceOverlay("live-checkin");
  openCheckinDialog({
    api, getPub: () => pub!, getPresence: () => presence, setPresence: (p) => { presence = p; },
    onDone: (beat, xp) => { if (pub) doneXp[`${pub.streamId}|${beat}`] = xp; render(true); },
  });
}

/** Starts the banner (once). Safe to call again: it only wires the listeners the first time. */
let started = false;
export async function startSiteBanner() {
  if (started) return;
  started = true;
  if (location.pathname.replace(/\/+$/, "").startsWith("/live")) return;      // /live has its own panel, /live/control its controls
  api = await pubApi();
  api.feed((p) => { pub = p; void loadPresence(); render(); });
  onAuth((s) => { auth = s; void loadPresence(); render(); });
  document.addEventListener("bt-checkin-open", () => { if (member()) void openDialog(); });
}
