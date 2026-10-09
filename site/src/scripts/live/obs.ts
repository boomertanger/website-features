// The stream view page, /live/obs (docs/specs/control-room.md §8; mockup control-room-batch-3.html section 1). A browser source for Streamlabs and TikTok LIVE
// Studio, so: no site chrome, a transparent page, a fixed canvas (?layout=wide 1920 x 1080 or tall 1080 x 1920).
// DATA: only the obsFeed HTTPS function with the stream view key (?k=). Never Firestore, never Firebase (this page does not even start it): the key is what
// lets the feed include the check-in word, so with no key, or a key the server refuses, the page draws NOTHING (blank and transparent) and stops asking.
// POLLING: one request at a time (the next is scheduled when the last has answered), about once a second while something moves (a check-in window open,
// the Break or Be right back scene), every 2 s on the stats scene and the countdown, every 10 s when nothing is live, and backing off 2 s, 4 s ... 15 s after
// an error. A cheaper way of equal speed does not exist without changing obsFeed: Firestore listeners would need the viewer to be signed in, and an ETag or
// If-None-Match answer would still run the function; polling keeps the cost to one small function call per second only while a window is open.
// STAGING ONLY demo: ?demo=1 (refused on production: the page stays blank) draws sample data without a key (scripts/live/obs-demo.ts).
import { isProduction, projectId } from "../../lib/env.js";
import { streamViewHtml } from "../../../../shared/ui/streamview.js";
import { setLook } from "../../../../shared/ui/control-room.js";
import type { PubLive } from "./model";

/** What obsFeed returns as `view` (functions/lib/live/feeds.js viewData): public/live plus the scene, the word and the Starting soon data. */
export type ObsView = Omit<PubLive, "state"> & {
  state: PubLive["state"] | "starting";
  scene: "starting" | "stats" | "break" | "brb" | "ending";
  brbUntil: number | null;
  word: string | null;
  firstIn: string[];
  plannedStart?: number | null;
  plannedGames?: string[];
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
  root.innerHTML = streamViewHtml({ shape, fit: false, label: "Stream view", sceneHtml: `<div class="obs-scene" data-obs-scene></div>` });
  scenes = (await import("./obs-scenes")).createScenes(root.querySelector<HTMLElement>("[data-obs-scene]")!, shape, params);
}

async function show(view: ObsView) {
  await mount();
  setLook(document.body, view.look);
  scenes?.render(view);
}

/* ---------------------------------------------------------------- the feed */
function delayFor(view: ObsView): number {
  if (view.state === "off" || view.state === "ended") return 10_000;
  if (view.state === "starting") return 2_000;
  const moving = view.window?.open || view.scene === "break" || view.scene === "brb";
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

if (!isProduction && q.get("demo") === "1") {
  void import("./obs-demo").then((m) => m.runDemo(show, params));
} else {
  const key = (q.get("k") || "").trim();
  if (key) void poll(key);      // no key: nothing is drawn and nothing is asked
}
