// Header nav feature tiles (docs/specs/header-nav.md, design-system.md §5 "Header nav groups").
// Loaded by BaseLayout's script; every read happens the first time a panel opens, never on page
// load, and Firebase is only imported then (dynamic imports). Existing data only:
//   Watch      site.json nextStream + the live state on <body data-live> (the Live Beacon's sources)
//   Play       sites/{siteId}/games (public) and, signed in, the member's own bests doc (public read)
//   Community  sites/{siteId}/crew/main/awards (public read), via scripts/crew/api.ts awards()
// Each tile falls back to its call to action when the data is missing or the read fails.
import site from "../data/site.json";
import { initWatchTile, playFeatureHtml, communityFeatureHtml } from "../../../shared/ui/navgroup.js";
import { escapeHtml } from "../../../shared/ui/dom.js";
import { liveNow, onLive } from "../lib/live";
import { loadNextStream } from "../lib/next-stream";

type Tile = { start: () => void; stop: () => void };
let watch: Tile | null = null;
const SETTLE_MS = 4000;

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | null> => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);

export interface PlayData { title: string; href: string; best: string; bestNote: string }

/** Today's Arcade game (the first live game) and, for a signed-in member, their best time on this device. */
export async function loadPlayData(): Promise<PlayData> {
  const fallback: PlayData = { title: "Boom Arcade", href: "/arcade", best: "", bestNote: "" };
  try {
    const [data, auth] = await Promise.all([import("./arcade/data"), import("../lib/auth")]);
    const game = (await data.getGames()).find((g) => g.status === "live");
    if (!game) return fallback;
    const out: PlayData = { title: game.title, href: data.gameHref(game), best: "", bestNote: "" };
    const s = await withTimeout(auth.whenReady(), SETTLE_MS);
    if (s?.user && (s.status === "verified" || s.status === "unverified")) {
      const b = await data.getBest(game, s.user.uid, data.thisDevice());
      if (b?.week) { out.best = data.fmtTime(b.week.secs); out.bestNote = "Your best this week."; }
      else if (b?.allTime) { out.best = data.fmtTime(b.allTime.secs); out.bestNote = "Your best time."; }
    }
    return out;
  } catch {
    return fallback;
  }
}

async function loadPlay(tile: Element) {
  const d = await loadPlayData();
  tile.innerHTML = playFeatureHtml({ title: d.title, href: d.href, best: d.best, bestNote: d.bestNote, cta: d.best ? "Play again" : "Play" });
}

async function loadCommunity(tile: Element) {
  const mascotHtml = (document.getElementById("bt-mascot-tpl") as HTMLTemplateElement | null)?.innerHTML ?? "";
  try {
    const api = await import("./crew/api");
    const latest = (await api.awards()).find((a) => a.topGear?.handle || a.fanFavourite?.handle);
    if (!latest) throw new Error("no award yet");
    const winners: { role: string; handle: string }[] = [];
    if (latest.topGear?.handle) winners.push({ role: "Top Gear", handle: latest.topGear.handle });
    if (latest.fanFavourite?.handle) winners.push({ role: "Fan Favourite", handle: latest.fanFavourite.handle });
    tile.innerHTML = communityFeatureHtml({ month: api.monthLabel(latest.month), winners });
  } catch {
    tile.innerHTML = communityFeatureHtml({ mascotHtml });
  }
}

/** The phone More sheet's small Arcade tile (TabBar.astro): same data as the Play panel. */
export async function loadSheetFeature(tile: HTMLAnchorElement) {
  const d = await loadPlayData();
  tile.href = d.href;
  const body = tile.querySelector("[data-sheet-body]");
  if (body) body.innerHTML = `<b>Today in the Arcade</b><small>${escapeHtml(d.title)}${d.best ? `. ${escapeHtml(d.bestNote.replace(/.$/, ""))}: ${escapeHtml(d.best)}` : ". Tap to play."}</small>`;
}

/**
 * The Watch tile's real content: the live stream's own title while live (kept in step by the shared public/live listener), otherwise the next published
 * stream. site.json's nextStream is the fallback when nothing is scheduled or the read fails. Runs once, the first time the panel opens.
 */
async function startWatch(tile: Element) {
  let title = site.nextStream.title, startsAt = site.nextStream.startsAt;
  const strong = tile.querySelector("strong"), when = tile.querySelector<HTMLTimeElement>("time[data-stream-time]");
  const live = liveNow();
  if (!(live && live.state !== "off" && live.state !== "ended" && live.title)) {
    const n = await withTimeout(loadNextStream().catch(() => null), SETTLE_MS);
    if (n) { title = n.title; startsAt = new Date(n.start).toISOString(); if (when) { when.setAttribute("datetime", startsAt); when.textContent = ""; when.removeAttribute("data-stream-time"); when.textContent = new Intl.DateTimeFormat("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" }).format(n.start); } }
  } else title = live.title!;
  if (strong) strong.textContent = title;
  onLive((p) => { if ((p.state === "live" || p.state === "backstage") && p.title && strong) strong.textContent = p.title; });
  watch = initWatchTile(tile, { title, startsAt, url: `${location.origin}/live`, name: site.name });
  watch.start();
}

/** navgroup.js onOpen: fills a group's feature tile the first time its panel opens (Watch's countdown runs while open). */
export function onNavOpen(name: string, panel: HTMLElement, { first }: { first: boolean }) {
  const tile = panel.querySelector("[data-navgroup-feature]");
  if (!tile) return;
  if (name === "watch") {
    if (first) void startWatch(tile);
    else watch?.start();
  } else if (first && name === "play") void loadPlay(tile);
  else if (first && name === "community") void loadCommunity(tile);
}

export function onNavClose(name: string) {
  if (name === "watch") watch?.stop();
}
