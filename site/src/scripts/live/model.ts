// Control Room page model (docs/specs/control-room.md §13): the shapes the controls read and a few helpers. Times are milliseconds.
// What the page may read (firestore.rules): public/live (everyone), the stream doc, streams/{id}/private/control and live/main (owner and
// A2+), and ONLY for the owner's uid streams/{id}/private/checklist and live/main/private/checklistTemplates. A non-owner never asks for those.
import { ms, SITE_TZ } from "../planner/plan-data";

export type Room = "twitch" | "ytLandscape" | "ytVertical" | "tiktok";
export const ROOMS: Room[] = ["twitch", "ytLandscape", "ytVertical", "tiktok"];
export const ROOM_LABEL: Record<Room, string> = { twitch: "Twitch", ytLandscape: "YouTube landscape", ytVertical: "YouTube vertical", tiktok: "TikTok" };
export type Beat = "start" | "break1" | "break2" | "end";
export const BEATS: Beat[] = ["start", "break1", "break2", "end"];
export const BEAT_LABEL: Record<Beat, string> = { start: "Start", break1: "Break 1", break2: "Break 2", end: "End" };
export type Role = "owner" | "a2";

export interface PubLive {
  state: "off" | "live" | "backstage" | "ended";
  look: "hull" | "crt";
  updatedAt?: number;
  streamId: string | null;
  title: string | null;
  type?: "platform" | "backstage";
  audience?: string;
  actualStart?: number | null;
  actualEnd?: number | null;
  beat: Beat | null;
  beats: Partial<Record<Beat, { status: "now" | "done" | "skipped" | "next"; checkins: number }>>;
  window: { open: boolean; closesAt: number | null; beat: Beat | null };
  liveRooms?: string[];
  counts: { total: number; byBeat: Partial<Record<Beat, number>>; byRoom: Record<string, number> };
  viewers: { total: number; byPlatform: Partial<Record<Room, number>> };
  peak: number;
  game: { gameId: string; title: string; startedAt: number } | null;
  nextGame: { gameId: string; title: string | null } | null;
  crew: { captain: string | null; chats: Record<string, { lead: string | null; deckhands: string[] }>; onDuty: string[] };
  activity: { kind: string; title: string | null; status: string | null } | null;
}

export interface Seg { kind: string; gameId?: string; title?: string; startedAt: number | null; endedAt: number | null }
export interface LStream {
  id: string; title: string; state: string; type: "platform" | "backstage"; audience: string; adhoc: boolean;
  start: number; end: number; actualStart: number | null; rooms: Room[]; /** The rooms live (the TikTok switch lives here). Empty until Start or the first switch. */ liveRooms: Room[]; week: string | null;
  crew: { captain: string | null; chats: Partial<Record<Room, { lead: string | null; deckhands: string[] }>> };
  minCrew: { captain: boolean; rooms: string[] };
  plannedGames: { gameId: string; title: string; order: number }[];
  segments: Seg[];
  beats: Partial<Record<Beat, { startedAt: number | null; endedAt: number | null; skipped?: boolean; checkins?: number; windowOpenedAt?: number | null }>>;
  youtube: { status: "ok" | "pending" | "failed"; error?: string } | null;
  delay: { count: number } | null;
}
export interface Window { beat: Beat; word?: string; openedAt: number; closesAt: number; lengthMinutes: number; reopened?: boolean; closedAt?: number | null }
export interface Control {
  window: Window | null; pinned: string | null; brbUntil: number | null;
  firstIn: Partial<Record<Beat, { handle: string }[]>>; viewers: Partial<Record<Room, number>>; peak: number;
  yt: { status: "waiting" | "ok" | "failed" | "off"; waiting?: string[] } | null;
  twitch: { status: "live" | "offline"; offlineSince?: number } | null;
  tiktok: { viewers: number; at: number; by?: string | null } | null;
}
export interface Main { look: "hull" | "crt"; windowLengthChoices: number[]; windowDefaultMinutes: number; obsKeyAt: number | null; deckKeyAt: number | null; obsKeySet: boolean; deckKeySet: boolean }
export interface CItem { id: string; text: string; note?: string; shortcut?: string; only?: "platform" | "backstage"; done?: boolean; doneAt?: number }
export type CBeats = Record<Beat, CItem[]>;
export interface Snapshot {
  pub: PubLive | null; streams: LStream[]; live: LStream | null; control: Control | null; main: Main | null;
  /** OWNER ONLY: the live stream's checklist copy. Always null for everyone else, and never requested for them. */
  checklist: CBeats | null;
}

const handleOf = (v: any): string | null => (typeof v === "string" ? v : v && typeof v.handle === "string" ? v.handle : null);
export function streamFrom(id: string, d: any): LStream {
  const chats: LStream["crew"]["chats"] = {};
  for (const [r, c] of Object.entries<any>(d.crew?.chats || {})) chats[r as Room] = { lead: handleOf(c?.lead), deckhands: ((c?.deckhands || []) as any[]).map(handleOf).filter(Boolean) as string[] };
  const beats: LStream["beats"] = {};
  for (const [k, b] of Object.entries<any>(d.beats || {})) beats[k as Beat] = { startedAt: ms(b.startedAt), endedAt: ms(b.endedAt), skipped: b.skipped === true, checkins: b.checkins || 0, windowOpenedAt: ms(b.windowOpenedAt) };
  return {
    id, title: d.title || d.theme?.label || "Stream", state: d.state, type: d.type === "backstage" ? "backstage" : "platform", audience: d.audience || "public", adhoc: d.adhoc === true,
    start: ms(d.plannedStart) ?? 0, end: ms(d.plannedEnd) ?? 0, actualStart: ms(d.actualStart), rooms: (d.rooms || []) as Room[], liveRooms: (Array.isArray(d.liveRooms) ? d.liveRooms : []) as Room[], week: d.week || null,
    crew: { captain: handleOf(d.crew?.captain), chats },
    minCrew: d.minCrew || { captain: false, rooms: [] },
    plannedGames: ((d.plannedGames || []) as any[]).map((g, i) => ({ gameId: g.gameId, title: g.title || g.gameId, order: g.order ?? i })).sort((a, b) => a.order - b.order),
    segments: ((d.segments || []) as any[]).map((s) => ({ kind: s.kind, gameId: s.gameId, title: s.title, startedAt: ms(s.startedAt), endedAt: ms(s.endedAt) })),
    beats,
    youtube: d.youtube && ["ok", "pending", "failed"].includes(d.youtube.status) ? { status: d.youtube.status, error: d.youtube.error } : null,
    delay: d.delay ? { count: d.delay.count || 1 } : null,
  };
}
export function controlFrom(d: any): Control {
  const w = d.window;
  return {
    window: w ? { beat: w.beat, word: w.word, openedAt: ms(w.openedAt) ?? 0, closesAt: ms(w.closesAt) ?? 0, lengthMinutes: w.lengthMinutes || 5, reopened: w.reopened === true, closedAt: ms(w.closedAt) } : null,
    pinned: d.pinned || null, brbUntil: ms(d.brbUntil), firstIn: d.firstIn || {}, viewers: d.viewers || {}, peak: d.peak || 0, yt: d.yt || null, twitch: d.twitch || null, tiktok: d.tiktok || null,
  };
}

// ---- crew seats of a stream (public handles) ----
export const seatsOf = (s: LStream) => {
  const rooms = s.type === "backstage" ? [] : s.rooms;
  const total = (s.minCrew.captain ? 1 : 0) + rooms.length;
  const filled = (s.minCrew.captain && s.crew.captain ? 1 : 0) + rooms.filter((r) => s.crew.chats[r]?.lead).length;
  const open = rooms.filter((r) => !s.crew.chats[r]?.lead);
  return { total, filled, open, captainOpen: s.minCrew.captain && !s.crew.captain };
};

// ---- time ----
const pad = (n: number) => String(n).padStart(2, "0");
export const fmtUptime = (msv: number) => { const s = Math.max(0, Math.floor(msv / 1000)); return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`; };
export const fmtDur = (msv: number) => { const m = Math.max(0, Math.round(msv / 60000)); return m >= 60 ? `${Math.floor(m / 60)}h ${pad(m % 60)}m` : `${m}m`; };
export const fmtTime = (t: number | null | undefined, tz = SITE_TZ) => (t ? new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(t)) : "");
export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/** What livePlatformStatus answers (functions/lib/live/feeds.js): never an id or a token. */
export interface PlatformStatus {
  twitch: { live: boolean; viewers?: number; error?: string };
  youtube: { eventStatus: "ok" | "pending" | "failed" | null; connected: boolean; live: boolean; verticalWanted: boolean; verticalActive: boolean; error?: string };
  tiktok: { planned: boolean; on: boolean };
  checkedAt: number;
}
export const tiktokOf = (s: LStream | null) => !!s && s.type !== "backstage" && s.liveRooms.includes("tiktok");
