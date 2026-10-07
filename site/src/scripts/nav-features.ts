// Header nav feature tiles (docs/specs/header-nav.md, design-system.md §5 "Header nav groups").
// Loaded by BaseLayout's script; every read happens the first time a panel opens, never on page
// load, and Firebase is only imported then (dynamic imports). Existing data only:
//   Watch      site.json nextStream + the live state on <body data-live> (the Live Beacon's sources)
//   Play       sites/{siteId}/games (public) and, signed in, the member's own bests doc (public read)
//   Community  sites/{siteId}/crew/main/awards (public read), via scripts/crew/api.ts awards()
// Each tile falls back to its call to action when the data is missing or the read fails.
import site from "../data/site.json";
import { initWatchTile, playFeatureHtml, communityFeatureHtml } from "../../../shared/ui/navgroup.js";

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

/** navgroup.js onOpen: fills a group's feature tile the first time its panel opens (Watch's countdown runs while open). */
export function onNavOpen(name: string, panel: HTMLElement, { first }: { first: boolean }) {
  const tile = panel.querySelector("[data-navgroup-feature]");
  if (!tile) return;
  if (name === "watch") {
    if (first) watch = initWatchTile(tile, { title: site.nextStream.title, startsAt: site.nextStream.startsAt, url: `${location.origin}/live`, name: site.name });
    watch?.start();
  } else if (first && name === "play") void loadPlay(tile);
  else if (first && name === "community") void loadCommunity(tile);
}

export function onNavClose(name: string) {
  if (name === "watch") watch?.stop();
}
