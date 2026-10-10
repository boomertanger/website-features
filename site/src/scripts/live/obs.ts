// The stream view page, /live/obs (docs/specs/control-room.md §8; mockup control-room-batch-3.html section 1). A browser source for Streamlabs and TikTok LIVE
// Studio, so: no site chrome, a transparent page, a fixed canvas (?layout=wide 1920 x 1080 or tall 1080 x 1920).
// DATA: only the obsFeed HTTPS function with the stream view key (?k=). Never Firestore, never Firebase (this page does not even start it): the key is what
// lets the feed include the check-in word, so with no key, or a key the server refuses, the page draws NOTHING (blank and transparent) and stops asking.
// POLLING: one request at a time (the next is scheduled when the last has answered), about once a second while something moves (a check-in window open,
// the Break or Be right back scene), every 2 s on the stats scene and the countdown, every 10 s when nothing is live, and backing off 2 s, 4 s ... 15 s after
// an error. A cheaper way of equal speed does not exist without changing obsFeed: Firestore listeners would need the viewer to be signed in, and an ETag or
// If-None-Match answer would still run the function; polling keeps the cost to one small function call per second only while a window is open.
// STAGING ONLY demo: ?demo=1 (refused on production: the page stays blank) draws sample data without a key (scripts/live/obs-demo.ts).
import { projectId } from "../../lib/env.js";
import { streamViewHtml } from "../../../../shared/ui/streamview.js";
import { setLook } from "../../../../shared/ui/control-room.js";
import type { PubLive } from "./model";

/** What obsFeed returns as `view` (functions/lib/live/feeds.js viewData): public/live plus the scene, the word and the Starting soon data. */
export type ObsView = Omit<PubLive, "state"> & {
  /** Chat Games: the active run's public card (obsFeed; docs/specs/chat-games.md §14). */
  chatGameDisplay?: Record<string, unknown> | null;
  state: PubLive["state"] | "starting";
  scene: "starting" | "stats" | "break" | "break-side" | "brb" | "ending";
  brbUntil: number | null;
  word: string | null;
  firstIn: string[];
  plannedStart?: number | null;
  plannedGames?: string[];
  /** Public cover image URLs of the planned games (the Game Vault's), aligned with plannedGames; null where a game has none. */
  gameCovers?: (string | null)[];
  /** The next published stream (title and start in ms) from the schedule, or null. */
  nextStream?: { title: string; start: number } | null;
  twitchStatus?: string | null;
};

const q = new URLSearchParams(location.search);
export const shape: "wide" | "tall" = q.get("layout") === "tall" ? "tall" : "wide";
export const params = q;
document.documentElement.dataset.shape = shape;
const root = document.querySelector<HTMLElement>("[data-obs]")!;
const FEED = `https://us-central1-${projectId}.cloudfunctions.net/obsFeed`;

let mounted = false;
let scenes: { render(view: ObsView): void } | null = null;

/** The canvas is only put on the page once there is something to draw (a good key, or the staging demo). */
async function mount() {
  if (mounted) return;
  mounted = true;
  // [data-cg-scene]: Chat Games' scene (shared/ui/chatgames.js mountScene, from obsFeed's chatGame); empty until a format ships
  root.innerHTML = streamViewHtml({ shape, fit: false, label: "Stream view", sceneHtml: `<div class="obs-scene" data-obs-scene></div><div data-cg-scene></div>` });
  scenes = (await import("./obs-scenes")).createScenes(root.querySelector<HTMLElement>("[data-obs-scene]")!, shape, params);
}

async function show(view: ObsView) {
  await mount();
  setLook(document.body, view.look);
  scenes?.render(view);
  await showGame(view);
}

/* ---------------------------------------------------------------- Chat Games' scene (docs/specs/chat-games.md §3, §14) */
// While a run is on, its scene covers the regular one (data-cg="on" hides .obs-scene); when it ends, the last card stays 8 s, then the regular scene returns.
let cgLast: { g: any; display: any } | null = null, cgTimer = 0;
async function showGame(view: ObsView) {
  const cgEl = root.querySelector<HTMLElement>("[data-cg-scene]");
  if (!cgEl) return;
  const g = (view as any).chatGame || null, display = (view as any).chatGameDisplay || null;
  const { initChatGames } = await import("../../../../shared/ui/chatgames.js");
  await import("./cg-questions-scene");
  const api = initChatGames();
  if (g) {
    if (cgTimer) { clearTimeout(cgTimer); cgTimer = 0; }
    const key = JSON.stringify([g.runId, g.state, g.round, display]);
    if (cgEl.dataset.cgKey !== key) { cgEl.dataset.cgKey = key; api.mountScene?.(cgEl, { chatGame: g, display }); }
    cgLast = { g, display };
    root.dataset.cg = "on";
    return;
  }
  if (cgLast && !cgTimer) {
    cgTimer = window.setTimeout(() => { cgTimer = 0; cgLast = null; cgEl.dataset.cgKey = ""; api.mountScene?.(cgEl, { chatGame: null }); delete root.dataset.cg; }, 8000);
  }
}

/* ---------------------------------------------------------------- the feed */
function delayFor(view: ObsView): number {
  if (view.state === "off" || view.state === "ended") return 10_000;
  if (view.state === "starting") return 2_000;
  const moving = view.window?.open || view.scene === "break" || view.scene === "break-side" || view.scene === "brb";
  return moving ? 1_000 : 2_000;
}

async function poll(key: string) {
  let wait = 1_000, errors = 0;
  for (;;) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8_000);
    try {
      const res = await fetch(`${FEED}?k=${encodeURIComponent(key)}`, { signal: ctl.signal, cache: "no-store", referrerPolicy: "no-referrer" });
      if (res.status === 403) { root.replaceChildren(); return; }            // a wrong or revoked key: nothing at all, and no more asking
      const body = await res.json();
      if (!res.ok || !body?.ok) throw new Error("feed");
      errors = 0;
      await show(body.view as ObsView);
      wait = delayFor(body.view as ObsView);
    } catch {
      errors++;
      wait = Math.min(15_000, 1_000 * 2 ** errors);
    } finally { clearTimeout(timer); }
    await new Promise((r) => setTimeout(r, wait));
  }
}

// The test is spelled out on import.meta.env so a production build drops the demo (and its sample data) entirely instead of shipping it unused.
if ((import.meta.env.PUBLIC_FIREBASE_ENV || "staging") !== "production" && q.get("demo") === "1") {
  void import("./obs-demo").then((m) => m.runDemo(show, params));
} else {
  const key = (q.get("k") || "").trim();
  if (key) void poll(key);      // no key: nothing is drawn and nothing is asked
}
