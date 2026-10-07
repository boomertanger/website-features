// Mod Machina data (docs/specs/mod-machina.md §13, §14): the callables the pages use and the few public docs
// the rules allow (public/crew, crew/main/boards/*, crew/main/awards/*). Pages never read anything else.
import { call } from "../../lib/call";
import { db, doc, getDoc, getDocs, collection } from "../../lib/db";

const SITE = "boomertanger";
const ROOT = `sites/${SITE}/crew/main`;

export type Chat = "twitch" | "ytLandscape" | "ytVertical" | "tiktok";
export const CHATS: Chat[] = ["twitch", "ytLandscape", "ytVertical", "tiktok"];
export const CHAT_NAME: Record<Chat, string> = { twitch: "Twitch", ytLandscape: "YouTube landscape", ytVertical: "YouTube vertical", tiktok: "TikTok" };
export type Pref = "favourite" | "happy" | "ifNeeded" | "no";
export type Prefs = Record<Chat, Pref>;

export interface ApplyItem { id: string; label: string; ok: boolean; detail: string }
export interface Me {
  activityRules: boolean;
  apply: { ok: boolean; reason: string | null; reapplyAt: number | null; items: ApplyItem[]; signedUp: boolean } | null;
  next: { to: number; name: string; ready: boolean; met: string[]; missing: string[]; pending: string[] } | null;
  crew: { track: "mod" | "admin"; grade: number; name: string; status: string; since: number | null; gradeSince: number | null; platforms: Partial<Prefs>; availability: { days: string[]; note: string }; device: string; breakUntil: number | null; breakMonthsUsed: number; quote?: string; stats: Record<string, number> } | null;
  strikes: { at: number; reason: string; expiresAt: number }[];
  ready: { to: number; name: string } | null;
  academy: { passed: string[] };
  application: { appId: string; status: string; band: string | null; note: string | null; createdAt: number; expiresAt: number | null; reapplyAt: number | null } | null;
}
export interface PublicMember { uid: string; handle: string | null; track: "mod" | "admin"; grade: number; status: string; favourites: Chat[]; /** Optional one-line "in their own words" (plain text, max 90 chars), published only when the member set one. */ quote?: string }
export interface BoardRow { uid: string; handle: string | null; track: "mod" | "admin"; grade: number; gears: number; duties: number; hours: number; rooms: string[]; recruits: number; staff: boolean; place: number }
export interface Board { period: string | null; rows: BoardRow[] }
export interface Award { month: string; topGear: { uid: string; handle: string | null; gears?: number } | null; fanFavourite: { uid: string; handle: string | null; votes?: number } | null }

export const crewMe = () => call<Me>("crewMe");
export const crewCall = <T = any>(name: string, data: unknown = {}) => call<T>(name, data);

export async function publicCrew(): Promise<PublicMember[]> {
  const s = await getDoc(doc(db, `sites/${SITE}/public/crew`));
  return s.exists() ? ((s.data().members as PublicMember[]) || []) : [];
}
export async function board(id: "month" | "season" | "all"): Promise<Board> {
  const s = await getDoc(doc(db, `${ROOT}/boards/${id}`));
  return s.exists() ? (s.data() as Board) : { period: null, rows: [] };
}
/** Every monthly award, newest first: this month's winners and the Hall of Fame. */
export async function awards(): Promise<Award[]> {
  const snap = await getDocs(collection(db, `${ROOT}/awards`));
  return snap.docs.map((d) => ({ month: d.id, topGear: d.get("topGear") ?? null, fanFavourite: d.get("fanFavourite") ?? null }) as Award).sort((a, b) => b.month.localeCompare(a.month));
}
export const monthLabel = (ym: string) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
