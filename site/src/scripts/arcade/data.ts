// Boom Arcade page data (docs/specs/arcade-step1.md §3, §4). Every read goes through
// lib/db.ts (Firestore Lite), which loads only once a member is signed in: the pages
// call these from onMember(). Reads per view stay within §3; the games list and game
// docs are kept in sessionStorage for 5 minutes so moving between pages doesn't re-read
// them. Board ids come from games/{gameId}.boardEpoch (a mirror of the version doc's).
import { onAuth, type AuthState } from "../../lib/auth";
import { fmtTime } from "../tap-the-splat/format.js";
import { escapeHtml } from "../../../../shared/ui/dom.js";
import { ttsLogoHtml } from "../../../../shared/ui/arcade.js";

export type Device = "desktop" | "mobile";
export type Period = "all" | "week";
export interface Stats { runs: number; finished: number; liked: number; wantMore: number }
export interface Game {
  id: string; title: string; slug: string; tagline?: string; status: "live" | "soon" | "hidden";
  currentVersion: string; boardEpoch: number; sortOrder: number; stats: Stats | null;
  news: { title: string; text?: string; at: string }[];
}
export interface Row { uid: string; name: string; handle: string | null; secs: number; at: Date | null }
export interface Best { allTime: { secs: number; at: Date | null } | null; week: { key: string; secs: number; at: Date | null } | null }

export { fmtTime };
export const esc = (s: unknown) => escapeHtml(String(s ?? ""));
/** 8400 -> "8.4K". */
export const fmtCount = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K` : String(n));
export const DEVICE_LABEL: Record<Device, string> = { desktop: "🖥 Desktop", mobile: "📱 Mobile" };
/** The device this browser plays on (the footer game's phone breakpoint). */
export const thisDevice = (): Device => (matchMedia("(max-width: 640px)").matches ? "mobile" : "desktop");

// ---- per-game look (the game's own logo lettering, design-system.md §8h) ----
const LOGOS: Record<string, (size: "lg" | "sm") => string> = { tapTheSplat: ttsLogoHtml };
export const logoHtml = (g: Pick<Game, "id" | "title">, size: "lg" | "sm") => (LOGOS[g.id] ? LOGOS[g.id](size) : esc(g.title));
export const gameHref = (g: Pick<Game, "slug">, tab = "") => `/arcade/${g.slug}${tab ? `/${tab}` : ""}`;
/** The splat and mascot, for a .bt-game-art (the mascot comes from BaseLayout's template). */
export function artHtml() {
  const mascot = (document.getElementById("bt-mascot-tpl") as HTMLTemplateElement | null)?.innerHTML ?? "";
  return `<div class="bt-game-art"><img src="/images/blood-splatter.webp" alt="" width="500" height="286" decoding="async" />${mascot}</div>`;
}

// ---- members only ----
const isMember = (s: AuthState) => s.status === "verified" || s.status === "unverified";
/** Runs fn once, as soon as a signed-up member (verified or not) is signed in. */
export function onMember(fn: (s: AuthState) => void) {
  let done = false;
  const off = onAuth((s) => {
    if (done || !isMember(s) || !s.user) return;
    done = true;
    queueMicrotask(() => off());
    fn(s);
  });
}

// ---- reads ----
const lib = () => import("../../lib/db");
const CACHE_MS = 5 * 60 * 1000;
const cacheGet = <T>(k: string): T | null => {
  try { const v = JSON.parse(sessionStorage.getItem(k) || "null"); return v && Date.now() - v.at < CACHE_MS ? (v.value as T) : null; } catch { return null; }
};
const cacheSet = (k: string, value: unknown) => { try { sessionStorage.setItem(k, JSON.stringify({ at: Date.now(), value })); } catch { /* not cached */ } };

function toGame(id: string, d: Record<string, any>): Game {
  const s = d.stats;
  return {
    id, title: d.title || id, slug: d.slug || id, tagline: d.tagline, status: d.status || "hidden",
    currentVersion: d.currentVersion || "v1", boardEpoch: d.boardEpoch || 1, sortOrder: d.sortOrder ?? 99,
    stats: s && typeof s.runs === "number" && s.updatedAt ? { runs: s.runs, finished: s.finished || 0, liked: s.liked || 0, wantMore: s.wantMore || 0 } : null,
    news: Array.isArray(d.news) ? d.news : [],
  };
}

/** Every game that isn't hidden, in sortOrder (the lobby's "games query"). */
export async function getGames(): Promise<Game[]> {
  const hit = cacheGet<Game[]>("bt-arcade-games");
  if (hit) return hit;
  const { db, collection, getDocs, SITE_ID } = await lib();
  const snap = await getDocs(collection(db, "sites", SITE_ID, "games"));
  const games = snap.docs.map((d) => toGame(d.id, d.data())).filter((g) => g.status !== "hidden").sort((a, b) => a.sortOrder - b.sortOrder);
  cacheSet("bt-arcade-games", games);
  games.forEach((g) => cacheSet(`bt-arcade-game-${g.id}`, g));
  return games;
}

/** One game doc (from the list's cache when fresh). */
export async function getGame(id: string): Promise<Game | null> {
  const hit = cacheGet<Game>(`bt-arcade-game-${id}`);
  if (hit) return hit;
  const { db, doc, getDoc, SITE_ID } = await lib();
  const s = await getDoc(doc(db, "sites", SITE_ID, "games", id));
  if (!s.exists()) return null;
  const g = toGame(s.id, s.data());
  cacheSet(`bt-arcade-game-${id}`, g);
  return g;
}

const versionPath = (g: Game) => ["games", g.id, "versions", g.currentVersion] as const;
const toDate = (at: any): Date | null => (at?.toDate ? at.toDate() : null);

/** A member's best on one device for the game's current version and board epoch, or null. */
export async function getBest(g: Game, uid: string, device: Device): Promise<Best | null> {
  const { db, doc, getDoc, SITE_ID } = await lib();
  const s = await getDoc(doc(db, "sites", SITE_ID, ...versionPath(g), "bests", `${uid}_${device}`));
  if (!s.exists() || (s.get("epoch") || 1) !== g.boardEpoch) return null;
  const a = s.get("allTime"), w = s.get("week");
  return {
    allTime: a?.secs != null ? { secs: a.secs, at: toDate(a.at) } : null,
    week: w?.secs != null && w.key === weekKey(new Date()) ? { key: w.key, secs: w.secs, at: toDate(w.at) } : null,
  };
}

/** A board's rows (top 100), or [] when nobody is on it yet. */
export async function getBoard(g: Game, device: Device, period: Period): Promise<Row[]> {
  const { db, doc, getDoc, SITE_ID } = await lib();
  const id = `e${g.boardEpoch}_${device}_${period === "week" ? weekKey(new Date()) : "all"}`;
  const s = await getDoc(doc(db, "sites", SITE_ID, ...versionPath(g), "boards", id));
  const rows = s.exists() ? (s.get("rows") as any[]) || [] : [];
  return rows.map((r) => ({ uid: r.uid, name: r.displayName || r.handle || "?", handle: r.handle || null, secs: r.secs, at: toDate(r.at) }));
}

/** Rank past the top 100: members with a faster best on this board, plus one (a count aggregation). */
export async function countRank(g: Game, device: Device, period: Period, secs: number): Promise<number> {
  const { db, collection, query, where, getCount, SITE_ID } = await lib();
  const bests = collection(db, "sites", SITE_ID, ...versionPath(g), "bests");
  const q = period === "week"
    ? query(bests, where("device", "==", device), where("week.key", "==", weekKey(new Date())), where("week.secs", "<", secs))
    : query(bests, where("device", "==", device), where("epoch", "==", g.boardEpoch), where("allTime.secs", "<", secs));
  return (await getCount(q)).data().count + 1;
}

// ---- weeks: Monday 00:00 America/Chicago (Central), keyed by ISO week (functions/lib/arcade/logic.js) ----
const WEEK_TZ = "America/Chicago";
export function weekKey(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: WEEK_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (t: string) => +parts.find((p) => p.type === t)!.value;
  const date = new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
  const dow = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dow);
  const isoYear = date.getUTCFullYear();
  const week = Math.ceil(((+date - Date.UTC(isoYear, 0, 1)) / 86400000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

// ---- markup ----
const day = (d: Date | null, period: Period) => (d ? d.toLocaleDateString("en-US", period === "week" ? { weekday: "short" } : { month: "short", day: "numeric" }) : "");
const initials = (name: string) => (name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2) || "?").toUpperCase();

/** A .bt-board table (names link to the member's profile, /u/{handle}). `pin` is the member's own row shown under a gap when they're further down. */
export function boardHtml(rows: (Row & { r: number })[], { mini = false, meUid = "", pin = null as (Row & { r: number }) | null, period = "all" as Period } = {}) {
  const tr = (x: Row & { r: number }) => `<tr data-r="${x.r}"${x.uid === meUid ? ' class="is-me"' : ""}><td class="bt-board-rank">${x.r}</td><td><span class="bt-board-who"><span class="bt-avatar-sm" aria-hidden="true">${esc(initials(x.name))}</span><span>${x.handle ? `<a href="/u/${encodeURIComponent(x.handle)}">${esc(x.name)}</a>` : esc(x.name)}${!mini && x.handle ? `<small>@${esc(x.handle)}</small>` : ""}</span></span></td>${mini ? "" : `<td class="bt-board-date">${day(x.at, period)}</td>`}<td class="bt-board-time">${fmtTime(x.secs)}</td></tr>`;
  const head = mini ? "" : `<thead><tr><th scope="col">#</th><th scope="col">Member</th><th scope="col" class="bt-board-date">Date</th><th scope="col">Time</th></tr></thead>`;
  const gap = pin ? `<tr class="bt-board-gap" aria-hidden="true"><td colspan="${mini ? 3 : 4}">···</td></tr>${tr(pin)}` : "";
  return `<table class="bt-board${mini ? " bt-board--mini" : ""}">${head}<tbody>${rows.map(tr).join("")}${gap}</tbody></table>`;
}
export const ranked = (rows: Row[]) => rows.map((r, i) => ({ ...r, r: i + 1 }));

export const SOON_BADGE = `<span class="bt-badge bt-badge--gold"><span class="bt-badge-dot"></span>Soon</span>`;
/** The members' "More games coming" teaser (.bt-tease). */
export const teaseHtml = (stack = false) => `<div class="bt-tease${stack ? " bt-tease--stack" : ""}"><span class="bt-tease-ic" aria-hidden="true">🕹</span><span class="bt-tease-txt"><b>More games coming ${SOON_BADGE}</b><small>You'll play them first.</small></span></div>`;
export const statsHtml = (s: Stats | null) => (s
  ? `<div class="bt-game-stats">${s.runs ? `<span><b>${fmtCount(s.runs)}</b> runs</span><span><b>${fmtCount(s.finished)}</b> finished</span><span>👍 <b>${fmtCount(s.liked)}</b></span>` : `<span>No runs yet. Be the first.</span>`}</div>`
  : "");
