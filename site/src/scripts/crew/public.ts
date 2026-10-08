// Shared bits of the public crew pages (/crew, /crew/board, /crew/join, /crew/vote): data loaders that fall back to
// site/src/data/preview-crew-public.json for the non-production ?as= preview (signed out only, never on
// production; a real signed-in member always gets real data), and small markup helpers.
import preview from "../../data/preview-crew-public.json";
import type { AuthState } from "../../lib/auth";
import { messageFor, reasonOf } from "../../lib/errors";
import { previewAs } from "./layout";
import * as A from "./api";
import { gradeChipHtml } from "../../../../shared/ui/grade-chip.js";
import { escapeHtml } from "../../../../shared/ui/dom.js";

export const esc = (v: unknown) => escapeHtml(String(v ?? ""));
export const num = (n: number) => (n || 0).toLocaleString("en-US");
export const q = (k: string) => new URLSearchParams(location.search).get(k);

/** True when this page is showing sample data (signed out with ?as= on a non-production build). */
export const isPreview = (s: AuthState) => !s.user && !!previewAs();

export const loadMembers = async (s: AuthState): Promise<A.PublicMember[]> =>
  isPreview(s) ? (preview.members as A.PublicMember[]) : A.publicCrew().catch(() => []);
export const loadAwards = async (s: AuthState): Promise<A.Award[]> =>
  isPreview(s) ? (preview.awards as A.Award[]) : A.awards().catch(() => []);
export const loadBoard = async (s: AuthState, id: "month" | "season" | "all"): Promise<A.Board> => {
  if (!isPreview(s)) return A.board(id).catch(() => ({ period: null, rows: [] }));
  const rows = (preview.board.rows as Omit<A.BoardRow, "place">[]).map((r, i) => ({ ...r, place: i + 1 }));
  // Sample data: the month board has the full set, the season and all-time boards a little more of the same.
  return { period: id === "month" ? "2026-10" : id === "season" ? "Season 1" : null, rows: id === "all" ? rows.map((r) => ({ ...r, gears: r.gears * 3 })) : rows };
};
export const loadMe = async (s: AuthState): Promise<A.Me> => {
  if (!isPreview(s)) return A.crewMe();
  const v = q("apply");
  const me = JSON.parse(JSON.stringify(v === "blocked" ? preview.crewMeBlocked : preview.crewMe)) as A.Me;
  if (v === "sent" || v === "notNow" || v === "crew") me.application = { ...(preview.application as A.Me["application"])!, status: v === "notNow" ? "notNow" : "open", note: v === "notNow" ? "Thanks for applying. We'd like a little more time with you in chat first." : null, reapplyAt: v === "notNow" ? 1795000000000 : null };
  if (v === "crew") me.crew = { track: "mod", grade: 1, name: "Initiate", status: "active", since: 1790000000000, gradeSince: null, platforms: {}, availability: { days: [], note: "" }, device: "phone", breakUntil: null, stats: {} } as any;
  return me;
};
export const loadBallot = async (s: AuthState) => {
  if (!isPreview(s)) return A.crewCall<Ballot>("fanFavouriteBallot");
  const v = q("ballot");
  const b = JSON.parse(JSON.stringify(preview.ballot)) as Ballot;
  if (v === "closed") return { ...b, open: false, candidates: [], canVote: false, reason: "closed" };
  if (v === "voted") return { ...b, canVote: false, reason: "voted", myVote: "p-kat" };
  if (v && ["tooNew", "needsCheckin", "crewCantVote", "needsSignup"].includes(v)) return { ...b, canVote: false, reason: v };
  return b;
};
export interface Ballot { open: boolean; month: string; opensOn: string; closesOn: string; candidates: { uid: string; handle: string | null; grade: number; sinceMs: number }[]; canVote: boolean; reason: string | null; myVote: string | null }

/** Name, grade chip and a profile link for a public member or board row. */
export const who = (m: { handle: string | null; track?: "mod" | "admin"; grade: number }) => ({
  name: m.handle || "Crew member",
  href: m.handle ? `/u/${encodeURIComponent(m.handle)}` : "",
  gradeHtml: gradeChipHtml({ track: m.track || "mod", grade: m.grade } as any),
});

/** "2026-10-27" -> "October 27" (a calendar day, no time zone shifts). */
export const dayLabel = (ymd: string) => new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10))).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
export const dateLabel = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
/** "2026-09" -> "Sep" */
export const monthShort = (ym: string) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1, 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
export const monthName = (ym: string) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1, 1)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });

/** The last five days of this month, as "YYYY-MM-DD" (the day the Fan Favourite vote opens). */
export function voteOpensOn(now = new Date()) {
  const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(dim - 4).padStart(2, "0")}`;
}

const REASONS: Record<string, string> = {
  under18: "The crew is for people 18 and older, because crew spaces put adults and teens together.",
  alreadyCrew: "You're already on the crew.",
  openApplication: "You already have an application in the queue.",
  reapplyWait: "You can apply again after the wait is over.",
  tooNew: "Your account needs to be a little older first.",
  noPlatform: "Link a Twitch, YouTube or TikTok account first.",
  needsCheckins: "Check in to a few more streams first.",
  needsStreamCheckins: "Check in to a few more streams first.",
  needsSignup: "Finish signing up first.",
  code: "Agree to the Crew Code to send your application.",
  closed: "Voting isn't open right now.",
  voted: "You've already voted this month.",
  needsCheckin: "Check in to a stream this month to vote.",
  crewCantVote: "Crew members can't vote, so every member's voice counts.",
  notOnBallot: "That person isn't on the ballot.",
};
export const reasonText = (r: string | null | undefined) => (r && REASONS[r]) || "";
export const errText = (err: unknown, fallback: string) => { const r = reasonOf(err); return (r && REASONS[r]) || messageFor(err, fallback); };
