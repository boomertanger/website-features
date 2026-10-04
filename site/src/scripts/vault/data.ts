// Game Vault data (docs/specs/game-vault.md §4, §7). The whole Vault comes from ONE summary doc,
// sites/{siteId}/public/vault, read once per visit; search and filters run in the browser.
// A game page reads its own vaultGames/{slug}. All writes go through the callables.
import { db, doc, getDoc, collection, getDocs, query, where, SITE_ID } from "../../lib/db";
import { getCount } from "firebase/firestore/lite";

export type Status = "playing" | "finished" | "abandoned" | "wishlist";
export interface Cover { source: "igdb" | "steam" | "upload"; igdbImageId?: string; steamAppId?: string; url?: string; publicId?: string; byHandle?: string | null }
/** One card in public/vault (functions/lib/vault/store.js card()). Times are ms. */
export interface VCard {
  slug: string; title: string; sortTitle: string; altNames: string[];
  status: Status; origin: "boomer" | "community"; by: string | null; wanted: number;
  cover: Cover | null; release: number | null; releaseStatus: string;
  developers: string[]; tags: string[]; ttb: number | null;
  score: number | null; verdict: string | null;
  streams: number; minutes: number; last: number | null; added: number | null; statusAt: number | null;
}
export interface Vault { games: VCard[]; tags: { tag: string; count: number }[]; count: number }

export async function loadVault(): Promise<Vault> {
  const snap = await getDoc(doc(db, "sites", SITE_ID, "public", "vault"));
  const d = snap.exists() ? snap.data() : null;
  return { games: (d?.games as VCard[]) || [], tags: (d?.tags as Vault["tags"]) || [], count: d?.count || 0 };
}

const ms = (v: any): number | null => (v == null ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : null);

/** The full game doc for its page (public unless hidden; staff can read hidden ones). */
export async function loadGame(slug: string) {
  const snap = await getDoc(doc(db, "sites", SITE_ID, "vaultGames", slug));
  if (!snap.exists()) return null;
  const g: any = snap.data();
  return {
    ...g, slug,
    releaseDate: ms(g.releaseDate), createdAt: ms(g.createdAt), statusChangedAt: ms(g.statusChangedAt),
    review: g.review ? { ...g.review, updatedAt: ms(g.review.updatedAt) } : null,
    stats: g.stats ? { ...g.stats, firstStreamedAt: ms(g.stats.firstStreamedAt), lastStreamedAt: ms(g.stats.lastStreamedAt) } : null,
    legacy: g.legacy ? { ...g.legacy, lastStreamedAt: ms(g.legacy.lastStreamedAt) } : null,
  };
}

export interface StreamRow { id: string; slug: string | null; start: number; end: number | null; minutes: number; title: string; finished?: boolean }
/**
 * The ended, published streams a game was played in, newest first, with this game's minutes from
 * the segments. Filters on gameIds + published (rules need published == true for everyone who
 * isn't staff); sorted here, so no extra index is needed.
 */
export async function loadStreamsFor(slug: string): Promise<StreamRow[]> {
  const snap = await getDocs(query(collection(db, "sites", SITE_ID, "streams"), where("gameIds", "array-contains", slug), where("published", "==", true)));
  const rows: StreamRow[] = [];
  snap.forEach((d) => {
    const s: any = d.data();
    if (s.state !== "ended" || s.hidden === true) return;
    const start = ms(s.actualStart) ?? ms(s.plannedStart);
    if (!start) return;
    let minutes = 0;
    for (const seg of s.segments || []) {
      if (seg.gameId !== slug) continue;
      const a = ms(seg.startedAt), b = ms(seg.endedAt);
      if (a && b && b > a) minutes += Math.round((b - a) / 60000);
    }
    rows.push({ id: d.id, slug: s.slug || null, start, end: ms(s.actualEnd), minutes, title: s.title || "" });
  });
  return rows.sort((a, b) => b.start - a.start);
}

/** Staff: how many queue items wait for a look (not the held by-hand covers). */
export async function queueCount(): Promise<number> {
  const snap = await getCount(query(collection(db, "sites", SITE_ID, "vaultQueue"), where("held", "==", false)));
  return snap.data().count;
}
