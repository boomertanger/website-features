// Fun Factory builder data (docs/specs/fun-factory.md §7, §10): the builder's callables, the idea
// library (readable by mods and admins), and the bits every builder page shares: status and cadence
// tones, and Central dates (date inputs hold "2027-01-11"; the server keeps milliseconds at midnight
// Central).
import { call } from "../../lib/call";

export type Status = "draft" | "review" | "scheduled" | "live" | "ended" | "archived";
export type Cadence = "daily" | "weekly" | "story" | "milestone" | "event";
export type Audience = "all" | "sub" | "crew";
export interface Season { id: string; number: number | null; name: string; pitch: string; tags: string[]; art: { url: string } | null; startsAt: number | null; endsAt: number | null; status: Status; dailyXpCap: number | null; badgeId: string | null; badge?: { id: string; name: string; rarity: number; emoji: string | null; status: string } | null; ideaId?: string | null; createdBy?: { name: string } | null; reviewNote?: { text: string; by: string; at: number } | null; updatedAt?: number | null; test?: boolean }
export interface Chapter { id: string; order: number; name: string; blurb?: string; unlockAt: number | null; revealed?: boolean; ideaId?: string | null }
export interface Campaign { id: string; chapterId: string; name: string; cadence: Cadence; audience: Audience; opensAt: number | null; closesAt: number | null; order: number; bonus: { xp: number; badgeId: string | null } | null; revealed?: boolean; ideaId?: string | null }
export interface Activity { id: string; campaignId: string; title: string; instructions: string; link: string | null; typeId: string; target: number; params: Record<string, string | number>; xp: number; badgeId: string | null; repeat: "none" | "daily" | "weekly"; order: number; revealed?: boolean; ideaId?: string | null }
export interface Medal { id: string; path: string; position: string; hint: string; order: number }
export interface Hunt { id: string; activityId: string; name: string; medals: Medal[] }
export interface Tree { season: Season; chapters: Chapter[]; campaigns: Campaign[]; activities: Activity[]; hunts: Hunt[] }
export interface TypeInfo { enabled: boolean; params: string[]; actions: string[]; name: string }
export interface Check { state: "ok" | "warn" | ""; text: string }
export interface Stage { key: string; label: string; icon: string; ok: boolean; state: "done" | "now" | "todo"; status: string; pct: number; checks: Check[] }
export interface Other { id: string; number: number | null; name: string; status: Status; startsAt: number | null; endsAt: number | null }
export interface SeasonView { tree: Tree; types: Record<string, TypeInfo>; others: Other[]; stages: Stage[]; budget: { byCadence: Record<Cadence, number>; total: number }; readyToSubmit: boolean }
export interface Idea { id: string; kind: "theme" | "chapter" | "campaign" | "activity" | "reward"; name?: string; title?: string; pitch?: string; tags?: string[]; emoji?: string | null; theme?: string; cadence?: Cadence; audience?: Audience; instructions?: string; typeId?: string; target?: number; xp?: number; params?: Record<string, string | number>; usedIn?: string[]; retired?: boolean; source?: string }

export const STATUS: Record<Status, [string, string]> = {
  draft: ["Draft", "blue"], review: ["In review", "teal"], scheduled: ["Scheduled", "gold"], live: ["Live", "green"], ended: ["Ended", "lime"], archived: ["Archived", "gray"],
};
export const CADENCE: Record<Cadence, [string, string]> = { daily: ["Daily", "blue"], weekly: ["Weekly", "gold"], story: ["Story", "rank-3"], milestone: ["Milestone", "pink"], event: ["Event", "teal"] };
export const AUDIENCE: Record<Audience, string> = { all: "Everyone", sub: "Sub Club", crew: "Crew" };
export const statusBadge = (s: Status) => `<span class="bt-badge bt-badge--${STATUS[s]?.[1] ?? "gray"}"><span class="bt-badge-dot"></span>${STATUS[s]?.[0] ?? s}</span>`;
export const seasonLabel = (s: Pick<Season, "number" | "name">) => `Season ${String(s.number ?? 0).padStart(2, "0")}${s.name ? ` · ${s.name}` : ""}`;
/** The site tour's sections (functions/lib/factory/logic.js VISIT_SECTIONS): where medals can hide. */
export const VISIT_SECTIONS = ["/", "/live", "/schedule", "/games", "/arcade", "/trophies", "/factory", "/streams", "/shop", "/club"];
export const POSITIONS: [string, string][] = [["top-left", "Top left"], ["top-right", "Top right"], ["bottom-left", "Bottom left"], ["bottom-right", "Bottom right"]];

// ---------- Central dates ----------
const TZ = "America/Chicago";
/** "2027-01-11" -> milliseconds at 00:00 Central that day (CST or CDT). */
export function centralMidnight(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || "");
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  for (const h of [5, 6]) {
    const t = Date.UTC(y, mo - 1, d, h);
    const p = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23", day: "numeric" }).formatToParts(new Date(t));
    if (+p.find((x) => x.type === "hour")!.value === 0 && +p.find((x) => x.type === "day")!.value === d) return t;
  }
  return null;
}
/** Milliseconds -> "2027-01-11" (Central). */
export function centralDate(t: number | null | undefined): string {
  if (t == null) return "";
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
  return p;
}
export const fmtDay = (t: number | null | undefined, year = false) => (t == null ? "No date" : new Date(t).toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}) }));
/** A season's dates: its end is exclusive (midnight starting the next day), so the last day shows. */
export const fmtRange = (a: number | null, b: number | null) => (a == null || b == null ? "Dates not set" : `${fmtDay(a)} to ${fmtDay(b - 1, true)}`);
/** The day after "2027-04-11" ("2027-04-12"), for a season's exclusive end. */
export const nextDay = (d: string) => { const t = Date.parse(`${d}T12:00:00Z`) + 86400000; return new Date(t).toISOString().slice(0, 10); };

// ---------- callables ----------
export const listSeasons = () => call<{ seasons: (Pick<Season, "id" | "number" | "name" | "status" | "startsAt" | "endsAt" | "createdBy" | "updatedAt" | "test"> & { art: string | null })[] }>("factoryListSeasons");
export const getSeason = (seasonId: string) => call<SeasonView>("factoryGetSeason", { seasonId });
export const save = (seasonId: string | null, node: string, op: string, data: Record<string, unknown> = {}) => call<{ ok: boolean; id?: string; seasonId?: string; badgeId?: string; art?: { url: string } }>("factorySave", { seasonId, node, op, data });
export const submit = (seasonId: string) => call("factorySubmit", { seasonId });
export const publish = (seasonId: string) => call("factoryPublish", { seasonId });
export const sendBack = (seasonId: string, note: string) => call("factorySendBack", { seasonId, note });
export const unpublish = (seasonId: string) => call("factoryUnpublish", { seasonId });
export const endSeason = (seasonId: string) => call("factoryEnd", { seasonId });
export const duplicate = (seasonId: string) => call<{ seasonId: string }>("factoryDuplicate", { seasonId });
export const artSignature = () => call<{ uploadUrl: string; fields: Record<string, string> }>("factoryArtSignature");
export const ideaSave = (data: { id?: string; kind?: string; data?: Record<string, unknown>; retired?: boolean }) => call<{ id: string }>("factoryIdeaSave", data);
export const typeToggle = (typeId: string, enabled: boolean) => call("factoryTypeToggle", { typeId, enabled });

/** The idea library and the activity types (mods and admins can read both). */
export async function loadIdeas(): Promise<Idea[]> {
  const { db, collection, getDocs, SITE_ID } = await import("../../lib/db");
  const snap = await getDocs(collection(db, "sites", SITE_ID, "factory", "main", "ideas"));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Idea, "id">) }));
}
export async function loadTypes(): Promise<(TypeInfo & { id: string; needs: string | null; description: string; source: string | null; order: number })[]> {
  const { db, collection, getDocs, SITE_ID } = await import("../../lib/db");
  const snap = await getDocs(collection(db, "sites", SITE_ID, "factory", "main", "activityTypes"));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}

/** Uploads a file with a signed form (the Vault's pattern) and returns its public id. */
export async function uploadArt(file: File): Promise<string> {
  const sig = await artSignature();
  const form = new FormData();
  Object.entries(sig.fields).forEach(([k, v]) => form.append(k, v));
  form.append("file", file);
  const res = await fetch(sig.uploadUrl, { method: "POST", body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.public_id) throw Object.assign(new Error(json?.error?.message || "The upload didn't go through."), { code: "bt/msg" });
  return json.public_id as string;
}
