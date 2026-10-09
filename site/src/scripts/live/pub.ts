// The public /live page (docs/specs/control-room.md §7; mockup docs/design/mockups/control-room-batch-1.html, layout 1 "Bridge"; design-system.md §8p).
// ONE controller: it reads public/live (the one shared listener, lib/live.ts), the next stream and the live stream's own document, decides which of
// the three views shows, and hands each change to that view. The views are separate parts so the page stays small:
//   room    the waiting room (off air, Starting soon; also /live?how=1 while a stream is on)   pub-room.ts
//   live    the Bridge: live, Break and backstage                                                pub-bridge.ts
//   ended   the wrap-up for the 2 hours after a stream                                            pub-ended.ts
// Non-production preview: ?live=off|public|backstage or ?state=off|soon|live|break|backstage|ended (pub-preview.ts); ?as=visitor|member; ?look=crt.
import { initSegNavs } from "../../../../shared/ui/seg-nav.js";
import { initPowerWordmarks } from "../../../../shared/ui/wordmark.js";
import { initStickyBar } from "../../../../shared/ui/sticky-bar.js";
import { crBoot, setLook } from "../../../../shared/ui/control-room.js";
import { onAuth, type AuthState } from "../../lib/auth";
import { bodyLive, livePreview } from "../../lib/live";
import { isStartingSoon } from "../../lib/next-stream";
import type { PubLive } from "./model";
import { pubApi } from "./pub-data";
import { esc, isMember, clock, type PubCtx, type View, type ViewPart } from "./pub-ui";
import { velvetHtml } from "../../../../shared/ui/scream-planner.js";

initSegNavs();
initPowerWordmarks();
const dock = document.querySelector<HTMLElement>("[data-lv-dock]");
if (dock) initStickyBar(dock, {});

const root = document.querySelector<HTMLElement>("[data-lp]")!;
const how = new URLSearchParams(location.search).get("how") === "1";
document.querySelectorAll<HTMLElement>("[data-lp-nav]").forEach((a) => {
  if (a.dataset.lpNav === (how ? "how" : "live")) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
});

const EMPTY: PubLive = { state: "off", look: "hull", streamId: null, title: null, beat: null, beats: {}, window: { open: false, closesAt: null, beat: null }, counts: { total: 0, byBeat: {}, byRoom: {} }, viewers: { total: 0, byPlatform: {} }, peak: 0, game: null, nextGame: null, crew: { captain: null, chats: {}, onDuty: [] }, activity: null };
const ctx = { root, pub: EMPTY, next: null, stream: null, vault: new Map(), how, soon: false, member: false } as unknown as PubCtx;

const boxes = Object.fromEntries([...root.querySelectorAll<HTMLElement>("[data-lp-view]")].map((b) => [b.dataset.lpView!, b])) as Record<string, HTMLElement>;
// One module per view, loaded the first time that view shows.
const loaders: Partial<Record<View, () => Promise<{ default: ViewPart }>>> = {
};
const parts: Partial<Record<View, ViewPart>> = {};
let view: View | null = null;
let seq = 0;
let gotPub = false, gotAuth = false;
let stateKey = "";

const ENDED_WINDOW = 2 * 3600_000;
const viewOf = (): View => {
  const p = ctx.pub, now = Date.now();
  if (ctx.how) return "room";
  if (p.state === "live" || p.state === "backstage") return "live";
  if (p.state === "ended" && p.actualEnd && now - p.actualEnd < ENDED_WINDOW) return "ended";
  return "room";
};
const stateOf = (v: View): string => {
  const p = ctx.pub;
  if (v === "room") return ctx.soon ? "soon" : "off";
  if (v === "ended") return "ended";
  return p.state === "backstage" ? "backstage" : p.window.open ? "break" : "live";
};

const AUDIENCE: Record<string, string> = { fanClub: "Fan Club", subClub: "Sub Club" };
/** The gold page title is the stream's own (the next stream's when off air); the head and its tags follow the state. */
function paintHead(v: View, key: string) {
  const p = ctx.pub;
  const title = v === "room" ? ctx.next?.title || "Off air" : p.title || (p.state === "backstage" ? "After-show" : "Live now");
  document.querySelectorAll<HTMLElement>("[data-lp-title]").forEach((el) => { if (el.textContent !== title) el.textContent = title; });
  const head = root.querySelector<HTMLElement>("[data-lp-head]");
  if (!head) return;
  head.hidden = v === "room";
  const sub = head.querySelector<HTMLElement>("[data-lp-sub]")!, tags = head.querySelector<HTMLElement>("[data-lp-tags]")!;
  const who = AUDIENCE[p.audience || ""] || "Members";
  let subHtml = "", tagsHtml = "";
  if (v === "live" && p.state === "backstage") { subHtml = `Backstage for <b>${esc(who)}</b>`; tagsHtml = velvetHtml(`Backstage · ${who}`); }
  else if (v === "live") { subHtml = p.game ? `Now playing <b>${esc(p.game.title)}</b>` : key === "break" ? "On a break" : ""; tagsHtml = `<span class="bt-live-tag"><i></i>${key === "break" ? "Break · check-in open" : "Live"}</span>`; }
  else if (v === "ended") { subHtml = p.actualEnd ? `Ended at <b>${esc(clock(p.actualEnd))}</b>` : ""; tagsHtml = `<span class="bt-badge bt-badge--lime">Just ended</span>`; }
  if (sub.innerHTML !== subHtml) sub.innerHTML = subHtml;
  if (tags.innerHTML !== tagsHtml) tags.innerHTML = tagsHtml;
}

let nextAt = 0, nextFor = "";
async function ensureNext(api: PubCtx["api"]) {
  const need = ctx.pub.state === "off" || ctx.pub.state === "ended" || ctx.how;
  if (!need) { ctx.next = null; return; }
  if (Date.now() - nextAt < 60_000 && nextFor === ctx.pub.state) return;
  nextAt = Date.now(); nextFor = ctx.pub.state;
  try { ctx.next = await api.next(); } catch { ctx.next = null; }
}
let streamKey = "";
async function ensureStream(api: PubCtx["api"]) {
  const p = ctx.pub;
  if (p.state === "off" || !p.streamId) { ctx.stream = null; streamKey = ""; return; }
  const key = `${p.streamId}|${p.state}|${p.beat}|${p.game?.gameId || ""}`;   // beat times and games change with these
  if (key === streamKey) return;
  streamKey = key;
  try { ctx.stream = await api.stream(p.streamId); } catch { /* the page works without the times */ }
}

async function update() {
  if (!gotPub || !gotAuth || !ctx.api) return;
  const mine = ++seq;
  await Promise.all([ensureNext(ctx.api), ensureStream(ctx.api)]);
  if (mine !== seq) return;
  const v = viewOf();
  ctx.soon = v === "room" && !!ctx.next && isStartingSoon(ctx.next);
  const key = stateOf(v);
  setLook(root, ctx.pub.look);
  if (livePreview()) document.body.dataset.live = bodyLive(ctx.pub);   // sample states drive the shell too (lib/live.ts leaves the body alone in preview)
  const changedState = key !== stateKey;
  stateKey = key;
  root.dataset.state = key;
  paintHead(v, key);
  if (v !== view) {
    parts[view as View]?.unmount?.();
    view = v;
    root.dataset.view = v;
    for (const [k, b] of Object.entries(boxes)) b.hidden = k !== v;
    const load = loaders[v];
    if (!load) return;
    parts[v] ||= (await load()).default;
    if (mine !== seq) return;
    parts[v]!.mount(ctx, boxes[v]);
    if (changedState) crBoot(root);
    return;
  }
  parts[v]?.update(ctx);
  if (changedState) crBoot(root);
}

let queued = 0;
const schedule = () => { cancelAnimationFrame(queued); queued = requestAnimationFrame(() => void update()); };

(async () => {
  ctx.api = await pubApi();
  ctx.api.vault().then((m) => { ctx.vault = m; schedule(); }, () => {});
  ctx.api.feed((p) => { ctx.pub = p; gotPub = true; schedule(); });
  onAuth((s: AuthState) => { ctx.auth = s; ctx.member = isMember(s); gotAuth = s.status !== "loading"; schedule(); });
  // Starting soon begins by the clock, and the next stream is re-read about every minute while off air.
  setInterval(() => { if (!document.hidden) schedule(); }, 15_000);
})();

