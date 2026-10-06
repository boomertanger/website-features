// Trophy Room reads (docs/specs/rewards.md §9), through lib/db.ts (Firestore Lite). The catalog
// (collections and badges) changes rarely, so it's kept in sessionStorage for 5 minutes, like the
// Arcade's games list; a member's own badges, trophies and profile are read fresh.
//   sites/{siteId}/collections, badges              the catalog (public)
//   sites/{siteId}/profiles/{uid}                    xp, level, rank, showcase, featuredBadge, persona, roleTag
//   sites/{siteId}/profiles/{uid}/badges, trophies   what a member holds (public)
//   handles/{handle}                                 handle -> uid (public)
import type { BadgeDoc, Held } from "./card";
import { onAuth, type AuthState } from "../../lib/auth";

export interface Collection { id: string; name: string; icon: string; blurb: string; order: number; crewOnly: boolean }
export interface Trophy { id: string; kind: string; place: number | null; label: string; period: string; earnedAt: Date | null }
export interface RewardProfile {
  uid: string; handle: string; displayName: string; avatar?: { type: string; initials?: string; url?: string } | null;
  xp: number; showcase: string[]; featuredBadge: string | null; persona: string | null; joinedAt: Date | null;
  roleTag: string | null;   // fan, sub, mod or admin: the public copy of the highest role (functions keep it in step)
  currentStreak: number; bestStreak: number;   // Night Shift daily streak, copied on check-in (functions)
}

const lib = () => import("../../lib/db");
const CACHE_MS = 5 * 60 * 1000;
const KEY = "tr-catalog-v1";
const toDate = (v: unknown): Date | null => (v && typeof (v as { toDate?: unknown }).toDate === "function" ? (v as { toDate(): Date }).toDate() : null);

/** The nine collections (in order) and every badge, cached for 5 minutes. */
export async function loadCatalog(): Promise<{ collections: Collection[]; badges: BadgeDoc[] }> {
  let value: { collections: Collection[]; badges: BadgeDoc[] } | null = null;
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (v && Date.now() - v.at < CACHE_MS) value = v.value;
  } catch { /* read fresh */ }
  if (!value) {
    value = await readCatalog();
    try { sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), value })); } catch { /* not cached */ }
  }
  return sortCatalog(value);
}

async function readCatalog(): Promise<{ collections: Collection[]; badges: BadgeDoc[] }> {
  const { db, collection, getDocs, SITE_ID } = await lib();
  const [cs, bs] = await Promise.all([getDocs(collection(db, "sites", SITE_ID, "collections")), getDocs(collection(db, "sites", SITE_ID, "badges"))]);
  const collections = cs.docs.map((d, i) => {
    const x = d.data();
    return { id: d.id, name: String(x.name ?? d.id), icon: String(x.icon ?? "🏅"), blurb: String(x.blurb ?? ""), order: Number.isFinite(x.order) ? x.order : i, crewOnly: !!x.crewOnly || d.id === "crew" };
  }).sort((a, b) => a.order - b.order);
  const badges = bs.docs.map((d) => ({ ...(d.data() as Omit<BadgeDoc, "id">), id: d.id }))
    .filter((b) => b.status !== "draft" && b.status !== "retired");
  return { collections, badges };
}

function sortCatalog({ collections, badges }: { collections: Collection[]; badges: BadgeDoc[] }) {
  // Collection order, then the catalog's authored order (the page's #tr-order, from the seed
  // file), then rarity and name for badges added since.
  const ci = new Map(collections.map((c, i) => [c.id, i]));
  let ids: string[] = [];
  try { ids = JSON.parse(document.getElementById("tr-order")?.textContent || "[]"); } catch { /* no order */ }
  const oi = new Map(ids.map((id, i) => [id, i]));
  badges.sort((a, b) => (ci.get(a.collection) ?? 99) - (ci.get(b.collection) ?? 99)
    || (oi.get(a.id) ?? 1e4) - (oi.get(b.id) ?? 1e4) || a.rarity - b.rarity || a.name.localeCompare(b.name));
  return { collections, badges };
}

/** The badges a member holds: badgeId -> { earnedAt, serial }. */
export async function loadHeld(uid: string): Promise<Map<string, Held>> {
  const { db, collection, getDocs, SITE_ID } = await lib();
  const snap = await getDocs(collection(db, "sites", SITE_ID, "profiles", uid, "badges"));
  return new Map(snap.docs.map((d) => { const x = d.data(); return [d.id, { earnedAt: toDate(x.earnedAt), serial: Number.isFinite(x.serial) ? x.serial : null }]; }));
}

export async function loadTrophies(uid: string): Promise<Trophy[]> {
  const { db, collection, getDocs, SITE_ID } = await lib();
  const snap = await getDocs(collection(db, "sites", SITE_ID, "profiles", uid, "trophies"));
  return snap.docs.map((d) => {
    const x = d.data();
    return { id: d.id, kind: String(x.kind ?? ""), place: Number.isFinite(x.place) ? x.place : null, label: String(x.label ?? ""), period: String(x.period ?? ""), earnedAt: toDate(x.earnedAt) };
  }).sort((a, b) => (b.earnedAt?.getTime() ?? 0) - (a.earnedAt?.getTime() ?? 0));
}

export async function loadProfile(uid: string): Promise<RewardProfile | null> {
  const { db, doc, getDoc, SITE_ID } = await lib();
  const s = await getDoc(doc(db, "sites", SITE_ID, "profiles", uid));
  return s.exists() ? toProfile(uid, s.data()) : null;
}
/** The signed-in member's own profile, from the doc lib/auth.ts already read (no second read). */
export const ownProfile = (s: AuthState): RewardProfile | null => (s.user && s.profile ? toProfile(s.user.uid, s.profile as unknown as Record<string, unknown>) : null);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toProfile(uid: string, x: Record<string, any>): RewardProfile {
  return {
    uid, handle: String(x.handle ?? ""), displayName: String(x.displayName ?? x.handle ?? ""), avatar: x.avatar ?? null,
    xp: Number(x.xp) || 0, showcase: Array.isArray(x.showcase) ? x.showcase.filter((v: unknown) => typeof v === "string") : [],
    featuredBadge: typeof x.featuredBadge === "string" ? x.featuredBadge : null, persona: typeof x.persona === "string" ? x.persona : null,
    currentStreak: Number(x.currentStreak) || 0, bestStreak: Number(x.bestStreak) || 0,
    joinedAt: toDate(x.joinedAt), roleTag: typeof x.roleTag === "string" ? x.roleTag : null,
  };
}

/** handles/{handle} -> uid, or null. Handles are stored lower case. */
export async function uidForHandle(handle: string): Promise<string | null> {
  const h = handle.trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(h)) return null;
  const { db, doc, getDoc } = await lib();
  const s = await getDoc(doc(db, "handles", h));
  return s.exists() ? (String(s.data().uid ?? "") || null) : null;
}

/** Mods and admins see the Crew collection. */
export const isCrew = (roles: string[], isAdmin: boolean) => isAdmin || roles.includes("mod") || roles.includes("admin");

/** Runs fn once, as soon as a signed-up member (verified or not) is signed in. */
export function onMember(fn: (s: AuthState) => void) {
  let done = false;
  const off = onAuth((s) => {
    if (done || !s.user || (s.status !== "verified" && s.status !== "unverified")) return;
    done = true;
    queueMicrotask(() => off());
    fn(s);
  });
}
