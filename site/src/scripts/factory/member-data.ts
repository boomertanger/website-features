// Fun Factory member reads (docs/specs/fun-factory.md §8, §9), through lib/db.ts (Firestore Lite) after
// sign-in. Paths under sites/{siteId}/factory/main. The rules only let members read what's revealed in a
// live or ended season, so every query filters on revealed == true. The public summary
// (sites/{siteId}/public/factory, written by factoryTick) says what's on without touching the tree.
//   loadSummary()                 the public summary (sessionStorage, 1 minute)
//   loadTree(seasonId)            season, chapters, campaigns, activities (sessionStorage, 5 minutes)
//   loadProgress / loadStreak     the member's own docs (fresh)
//   loadBoard / loadStanding / rankOf   the season boards and where a member sits
const lib = () => import("../../lib/db");
const cacheGet = <T>(k: string, ms: number): T | null => { try { const v = JSON.parse(sessionStorage.getItem(k) || "null"); return v && Date.now() - v.at < ms ? (v.value as T) : null; } catch { return null; } };
const cacheSet = (k: string, value: unknown) => { try { sessionStorage.setItem(k, JSON.stringify({ at: Date.now(), value })); } catch { /* not cached */ } };
const toMs = (v: any): number | null => (v == null ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : null);
/** Firestore values -> plain JSON (Timestamps as milliseconds). */
function plain(v: any): any {
  if (v == null || typeof v !== "object") return v;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (Array.isArray(v)) return v.map(plain);
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
}

export interface Summary {
  live: boolean; liveSeasonId: string | null; name?: string; number?: number | null; pitch?: string; art?: string | null;
  startsAt?: number; endsAt?: number; chapters?: number; chapter?: { number: number; name: string; id: string } | null;
  nextUnlockAt?: number | null; nextChapterNumber?: number | null; badge?: { id: string; name: string; emoji: string | null; rarity: number } | null;
  huntPaths?: string[]; next: { id: string; name: string; number: number | null; startsAt: number } | null;
  last: { id: string; name: string; number: number | null; endedAt: number; top3: BoardRow[] } | null;
}
export interface BoardRow { rank?: number; uid: string; handle: string | null; displayName: string | null; seasonXp: number; tier?: string; featured?: { id: string; emoji: string | null; art: string | null; rarity: number } | null }
export interface Board { rows: BoardRow[]; count: number }
export interface SChapter { id: string; order: number; name: string; blurb?: string; unlockAt: number | null; revealed?: boolean; number?: number }
export interface SCampaign { id: string; chapterId: string; name: string; cadence: string; audience: string; opensAt: number | null; closesAt: number | null; order: number; bonus: { xp: number; badgeId: string | null } | null; enabled?: boolean }
export interface SActivity { id: string; campaignId: string; title: string; instructions: string; link: string | null; typeId: string; target: number; params: Record<string, unknown>; xp: number; repeat: string; order: number; enabled?: boolean }
export interface STree { season: { id: string; number: number | null; name: string; pitch: string; art: { url: string } | null; startsAt: number | null; endsAt: number | null; status: string; badgeId: string | null }; chapters: SChapter[]; campaigns: SCampaign[]; activities: SActivity[]; lockedSub?: { id: string; chapterId: string; name: string }[] }
export interface Progress { acts: Record<string, { count: number; period: string; completedAt: number | null; seen?: string[] }>; camps: Record<string, { period: string; completedAt: number | null }> }
export interface Streak { current: number; best: number; lastDay: string | null; lastCheckIn?: string | null; savers: number; saversCap: number }

export async function loadSummary(fresh = false): Promise<Summary | null> {
  const k = "ff-summary-v1";
  if (!fresh) { const c = cacheGet<Summary>(k, 60000); if (c) return c; }
  const { db, doc, getDoc, SITE_ID } = await lib();
  const s = await getDoc(doc(db, "sites", SITE_ID, "public", "factory"));
  const value = s.exists() ? (plain(s.data()) as Summary) : null;
  cacheSet(k, value);
  return value;
}

export async function loadTree(seasonId: string): Promise<STree> {
  const k = `ff-tree-${seasonId}`;
  const c = cacheGet<STree>(k, 5 * 60000);
  if (c) return c;
  const { db, doc, getDoc, collection, getDocs, query, where, SITE_ID } = await lib();
  const base = ["sites", SITE_ID, "factory", "main", "seasons", seasonId] as const;
  const sub = (name: string) => getDocs(query(collection(db, ...base, name), where("revealed", "==", true)));
  const [s, ch, ca, ac] = await Promise.all([getDoc(doc(db, ...base)), sub("chapters"), sub("campaigns"), sub("activities")]);
  if (!s.exists()) throw Object.assign(new Error("That season isn't open."), { code: "bt/msg" });
  const sd = plain(s.data());
  const byOrder = (a: any, b: any) => (a.order ?? 0) - (b.order ?? 0);
  const value: STree = {
    season: { id: s.id, number: sd.number ?? null, name: sd.name || "", pitch: sd.pitch || "", art: sd.art || null, startsAt: sd.startsAt ?? null, endsAt: sd.endsAt ?? null, status: sd.status, badgeId: sd.badgeId || null },
    chapters: ch.docs.map((d) => ({ id: d.id, ...plain(d.data()) })).sort((a: any, b: any) => (a.unlockAt ?? 0) - (b.unlockAt ?? 0)),
    campaigns: ca.docs.map((d) => ({ id: d.id, ...plain(d.data()) })).filter((c: any) => c.enabled !== false).sort(byOrder),
    activities: ac.docs.map((d) => ({ id: d.id, ...plain(d.data()) })).filter((a: any) => a.enabled !== false).sort(byOrder),
  };
  cacheSet(k, value);
  return value;
}

export async function loadProgress(seasonId: string, uid: string): Promise<Progress> {
  const { db, doc, getDoc, SITE_ID } = await lib();
  const s = await getDoc(doc(db, "sites", SITE_ID, "factory", "main", "seasons", seasonId, "progress", uid));
  const d = s.exists() ? plain(s.data()) : {};
  return { acts: d.acts || {}, camps: d.camps || {} };
}
export async function loadStreak(uid: string): Promise<Streak> {
  const { db, doc, getDoc, SITE_ID } = await lib();
  const s = await getDoc(doc(db, "sites", SITE_ID, "factory", "main", "streaks", uid));
  const d = s.exists() ? s.data() : {};
  return { current: d.current || 0, best: d.best || 0, lastDay: d.lastDay ?? null, lastCheckIn: d.lastCheckIn ?? null, savers: d.savers || 0, saversCap: d.saversCap || 2 };
}
export async function loadBoard(seasonId: string, board: "all" | "sub" | "crew" = "all"): Promise<Board> {
  const { db, doc, getDoc, SITE_ID } = await lib();
  const s = await getDoc(doc(db, "sites", SITE_ID, "factory", "main", "seasons", seasonId, "boards", board));
  return s.exists() ? { rows: (s.get("rows") || []) as BoardRow[], count: s.get("count") || 0 } : { rows: [], count: 0 };
}
export async function loadStanding(seasonId: string, uid: string): Promise<BoardRow | null> {
  const { db, doc, getDoc, SITE_ID } = await lib();
  const s = await getDoc(doc(db, "sites", SITE_ID, "factory", "main", "seasons", seasonId, "standings", uid));
  return s.exists() ? ({ uid, ...(plain(s.data()) as Omit<BoardRow, "uid">) }) : null;
}
/** A member's place on a board: from the top 100 when they're in it, else a count of who's ahead. */
export async function rankOf(seasonId: string, board: Board, me: BoardRow | null, tier?: string): Promise<number | null> {
  if (!me || !(me.seasonXp > 0)) return null;
  const hit = board.rows.find((r) => r.uid === me.uid);
  if (hit) return hit.rank ?? board.rows.indexOf(hit) + 1;
  if (tier) return null;   // past the Sub Club and Crew top 100 (a count there would need a composite index): "100+"
  const { db, collection, query, where, getCount, SITE_ID } = await lib();
  const q = query(collection(db, "sites", SITE_ID, "factory", "main", "seasons", seasonId, "standings"), where("seasonXp", ">", me.seasonXp));
  return (await getCount(q)).data().count + 1;
}
export { toMs };
