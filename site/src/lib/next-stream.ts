// The next stream, for the waiting room on /live and the Watch tile (docs/specs/control-room.md §7a, scream-planner.md §14). Reads what everyone may
// read: public/schedule (which weeks are published) and the published streams of this week and next. One answer per minute per tab, shared.
// Delay is read from the stream itself: a delayed stream keeps state "scheduled" with `delay` and its new plannedStart.
import { db, doc, getDoc, getDocs, collection, query, where, SITE_ID } from "./db";

export interface NextStream {
  id: string; title: string; start: number; end: number; type: "platform" | "backstage"; audience: string;
  rooms: string[]; games: { slug: string; title: string }[]; plannedGameCount: number; captain: string | null;
  /** Set when the start was moved: the time it was first planned for. */
  delayedFrom: number | null;
}

const ms = (v: any): number | null => (v == null ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : null);
const handleOf = (v: any): string | null => (typeof v === "string" ? v : v && typeof v.handle === "string" ? v.handle : null);

function from(id: string, d: any): NextStream {
  return {
    id, title: d.title || d.theme?.label || "Stream", start: ms(d.plannedStart) ?? 0, end: ms(d.plannedEnd) ?? 0,
    type: d.type === "backstage" ? "backstage" : "platform", audience: d.audience || "public", rooms: Array.isArray(d.rooms) ? d.rooms : [],
    games: ((d.plannedGames || []) as any[]).map((g, i) => ({ slug: g.gameId, title: g.title || g.gameId, order: g.order ?? i })).sort((a, b) => a.order - b.order).map(({ slug, title }) => ({ slug, title })),
    plannedGameCount: d.plannedGameCount || (d.plannedGames || []).length || 0, captain: handleOf(d.crew?.captain),
    delayedFrom: d.delay ? ms(d.delay.originalStart) : null,
  };
}

let cache: { at: number; p: Promise<NextStream | null> } | null = null;
export function loadNextStream(): Promise<NextStream | null> {
  if (cache && Date.now() - cache.at < 60_000) return cache.p;
  const p = (async () => {
    const s = await getDoc(doc(db, "sites", SITE_ID, "public", "schedule"));
    if (!s.exists()) return null;
    const weeks: any[] = (s.data().weeks || []).filter((w: any) => w.state === "published").map((w: any) => w.week).slice(0, 3);
    const now = Date.now();
    let best: NextStream | null = null;
    for (const week of weeks) {
      const snap = await getDocs(query(collection(db, "sites", SITE_ID, "streams"), where("published", "==", true), where("week", "==", week)));
      for (const x of snap.docs) {
        const d: any = x.data();
        if (d.state !== "scheduled") continue;
        const n = from(x.id, d);
        if (n.end > now && (!best || n.start < best.start)) best = n;
      }
      if (best) break;   // the first week with a stream still to come holds the next one
    }
    return best;
  })();
  p.catch(() => { if (cache?.p === p) cache = null; });
  cache = { at: Date.now(), p };
  return p;
}

/** Starting soon: from 15 minutes before the planned start, or while the stream is running late (delayed and the new start is near). */
export function isStartingSoon(n: NextStream, now = Date.now()) {
  const toGo = n.start - now;
  return toGo <= 15 * 60_000 || (n.delayedFrom != null && toGo <= 6 * 3600_000);
}
