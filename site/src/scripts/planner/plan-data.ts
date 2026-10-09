// Scream Planner staff data (docs/specs/scream-planner.md §14 "Reads for the pages"): the shapes, the few Firestore reads
// staff are allowed (planWeeks, streams and their private/draft and signups, planner/main) and the callables, plus the
// week and time helpers the staff pages share. Pages never write: every change goes through a callable.
import { call } from "../../lib/call";
import { db, doc, getDoc, getDocs, collection, query, where, SITE_ID } from "../../lib/db";
import { crewMe, type Me } from "../crew/api";

export type Room = "twitch" | "ytLandscape" | "ytVertical" | "tiktok";
export const ROOMS: Room[] = ["twitch", "ytLandscape", "ytVertical", "tiktok"];
export const ROOM_NAME: Record<Room, string> = { twitch: "Twitch", ytLandscape: "YouTube landscape", ytVertical: "YouTube vertical", tiktok: "TikTok" };
export const ROOM_SHORT: Record<Room, string> = { twitch: "Twitch", ytLandscape: "YT land", ytVertical: "YT vert", tiktok: "TikTok" };
export const GROUP_OF: Record<Room, "twitch" | "youtube" | "tiktok"> = { twitch: "twitch", ytLandscape: "youtube", ytVertical: "youtube", tiktok: "tiktok" };
export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export interface Hero { frame: string; doors: string }
export interface WeekDoc {
  id: string; state: "open" | "closed" | "published";
  opensAt: number | null; closesAt: number | null; publishBy: number | null; publishedAt: number | null; publishedRev: number;
  hasUnpublishedChanges: boolean; hero: Hero | null; weekOff: { label: string; public?: boolean } | null;
  streamIds: string[]; counts: { slots: number; seatsOpen: number; votes: number }; earlySignupUntil: number | null; tz?: string;
}
export interface SeatPerson { uid?: string; handle: string | null }
export interface Crew { captain: SeatPerson | null; chats: Partial<Record<Room, { lead: SeatPerson | null; deckhands: SeatPerson[] }>>; caps: { deckhands: number } }
export interface PGame { gameId: string; title: string; order: number; source: { kind: string; byHandle?: string; votes?: number } }
export interface MinCrew { captain: boolean; rooms: string[] }
export interface Theme { patternId?: string | null; label: string; icon?: string | null; tagHints?: string[]; gameHints?: string[] }
export interface Stream {
  id: string; week: string; state: "planned" | "scheduled" | "live" | "ended" | "cancelled"; published: boolean; hasUnpublishedChanges: boolean;
  slug: string; title: string; tz: string; start: number; end: number; type: "platform" | "backstage"; audience: string;
  rooms: Room[]; plannedGameCount: number; theme: Theme | null; minCrew: MinCrew; caps: { deckhands: number }; crew: Crew;
  plannedGames: PGame[]; delay: { originalStart: number; originalEnd: number; count: number; reason?: string } | null;
  cancel: { reason?: string } | null; actualStart: number | null;
  /** The YouTube event's status only (event IDs are server-only). Absent until the first sync. */
  youtube: { status: "ok" | "pending" | "failed"; error?: string } | null;
}
export interface SeatReq { room: string; role: "captain" | "lead" | "deckhand"; status: "requested" | "confirmed" | "declined" | "dropped"; needsOwnerOk?: boolean; why?: string }
export interface GameReq { gameSlug: string; note: string; status: "open" | "planned" | "notPlanned" }
export interface Signup { uid: string; availability: "yes" | "maybe" | "no" | ""; prefilled: boolean; seats: SeatReq[]; gameRequest: GameReq | null; handle: string | null; grade: number | null; track: string; reconfirm?: { count: number; needed: boolean } | null }
export interface TrayItem { slug: string; title: string; status: string | null; tags: string[]; fitsTheme: boolean; alsoOn: string[]; votes?: number; requestUid?: string; byHandle?: string; grade?: number | null; seat?: string | null; note?: string }
export interface TrayGroup { id: "modRequests" | "votes" | "theme" | "picks"; title: string; items: TrayItem[]; more?: number }
export interface Settings { deadlines: { openDow: number; openTime: string; closeDow: number; closeTime: string; publishDow: number; publishTime: string }; defaults: { rooms: Room[]; minCrew: MinCrew; caps: { deckhands: number }; votesPerMember: number; ballotAddsPerMember: number; ballotSeed: number; gameCount: number } }
export interface Pattern { id: string; label: string; icon: string | null; dow: number; start: string; end: string; type: "platform" | "backstage"; audience?: string; platforms?: string[]; rooms?: Room[]; gameCount: number | null; tagHints: string[]; gameHints: string[]; minCrew?: MinCrew; caps?: { deckhands: number }; active: boolean; order: number }
export interface Exception { id: string; kind: "weekOff" | "dayOff" | "skipPattern"; from: string; to: string; label: string; public: boolean; patternIds?: string[] }
export interface Todo { id: string; kind: string; text: string; week: string | null; link: string | null }

export const DEFAULT_SETTINGS: Settings = {
  deadlines: { openDow: 1, openTime: "10:00", closeDow: 4, closeTime: "22:00", publishDow: 5, publishTime: "18:00" },
  defaults: { rooms: [...ROOMS], minCrew: { captain: true, rooms: ["youtube"] }, caps: { deckhands: 2 }, votesPerMember: 3, ballotAddsPerMember: 2, ballotSeed: 5, gameCount: 2 },
};

export const ms = (v: any): number | null => (v == null ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : null);
export const SITE_TZ = "America/Chicago";

// ---------------------------------------------------------------------------------------------
// week and time helpers (a port of the server's week math: weeks run Monday to Sunday in the site zone)
// ---------------------------------------------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, "0");
export function localParts(utcMs: number, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second };
}
export const localDate = (utcMs: number, tz: string) => { const p = localParts(utcMs, tz); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; };
export const localTime = (utcMs: number, tz: string) => { const p = localParts(utcMs, tz); return `${pad(p.h)}:${pad(p.min)}`; };
const tzOffset = (utcMs: number, tz: string) => { const p = localParts(utcMs, tz); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(utcMs / 1000) * 1000; };
export function zonedToUtc(date: string, hhmm: string, tz: string): number {
  const [y, m, d] = date.split("-").map(Number), [h, mi] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const first = guess - tzOffset(guess, tz);
  return guess - tzOffset(first, tz);
}
export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
/** ISO weekday of a YYYY-MM-DD date: 1 Monday to 7 Sunday. */
export const dowOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
export function weekOfDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const y = d.getUTCFullYear(), jan1 = Date.UTC(y, 0, 1);
  return `${y}-W${pad(Math.ceil(((d.getTime() - jan1) / 86400000 + 1) / 7))}`;
}
export function weekMonday(weekId: string): string {
  const [y, w] = weekId.split("-W").map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const mon = new Date(jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * 86400000 + (w - 1) * 7 * 86400000);
  return mon.toISOString().slice(0, 10);
}
export const weekDates = (weekId: string) => Array.from({ length: 7 }, (_, i) => addDays(weekMonday(weekId), i));
export const nextWeekId = (weekId: string) => weekOfDate(addDays(weekMonday(weekId), 7));
export const currentWeekId = (tz = SITE_TZ, now = Date.now()) => weekOfDate(localDate(now, tz));
const dpart = (date: string) => { const d = new Date(`${date}T12:00:00Z`); return { dow: DAY_SHORT[(d.getUTCDay() + 6) % 7], num: d.getUTCDate(), month: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) }; };
export const dateParts = dpart;
/** "Mon Oct 12 to Sun Oct 18". */
export function weekRange(weekId: string): string {
  const [a, b] = [weekMonday(weekId), addDays(weekMonday(weekId), 6)].map(dpart);
  return a.month === b.month ? `${a.month} ${a.num} to ${b.num}` : `${a.month} ${a.num} to ${b.month} ${b.num}`;
}
const hm12 = (utcMs: number, tz: string) => { const p = localParts(utcMs, tz), ap = p.h >= 12 ? "PM" : "AM", h = p.h % 12 || 12; return `${h}${p.min ? `:${pad(p.min)}` : ""} ${ap}`; };
/** "Thu 10 PM" in the site zone. */
export const fmtDayTime = (utcMs: number | null, tz = SITE_TZ) => (utcMs == null ? "" : `${new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(new Date(utcMs))} ${hm12(utcMs, tz)}`);
export const fmtClock = hm12;
export const hhmm12 = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return `${h % 12 || 12}${m ? `:${pad(m)}` : ""} ${h >= 12 ? "PM" : "AM"}`; };
/** "1d 4h left", "3h 20m left", "12m left". */
export function leftText(toMs: number, now = Date.now()): string {
  const m = Math.max(0, Math.floor((toMs - now) / 60000)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return d ? `${d}d ${h}h left` : h ? `${h}h ${m % 60}m left` : `${m}m left`;
}

// ---------------------------------------------------------------------------------------------
// reads (staff only: the rules decide)
// ---------------------------------------------------------------------------------------------
const base = `sites/${SITE_ID}`;
const weekFrom = (id: string, d: any): WeekDoc => ({
  id, state: d.state, opensAt: ms(d.opensAt), closesAt: ms(d.closesAt), publishBy: ms(d.publishBy), publishedAt: ms(d.publishedAt), publishedRev: d.publishedRev || 0,
  hasUnpublishedChanges: d.hasUnpublishedChanges === true, hero: d.hero || null, weekOff: d.weekOff || null, streamIds: d.streamIds || [],
  counts: d.counts || { slots: 0, seatsOpen: 0, votes: 0 }, earlySignupUntil: ms(d.earlySignupUntil), tz: d.tz,
});
/** Every week (the collection is small), newest first. */
export async function loadWeeks(): Promise<WeekDoc[]> {
  const snap = await getDocs(collection(db, `${base}/planWeeks`));
  return snap.docs.map((d: any) => weekFrom(d.id, d.data())).sort((a, b) => b.id.localeCompare(a.id));
}
export function streamFrom(id: string, d: any): Stream {
  const ch = d.crew?.chats || {};
  return {
    id, week: d.week, state: d.state, published: d.published === true, hasUnpublishedChanges: d.hasUnpublishedChanges === true, slug: d.slug, title: d.title || d.theme?.label || "Stream",
    tz: d.tz || SITE_TZ, start: ms(d.plannedStart) ?? 0, end: ms(d.plannedEnd) ?? 0, type: d.type === "backstage" ? "backstage" : "platform", audience: d.audience || "public",
    rooms: (d.rooms || []) as Room[], plannedGameCount: d.plannedGameCount || 2, theme: d.theme || null, minCrew: d.minCrew || { captain: false, rooms: [] }, caps: d.caps || { deckhands: 2 },
    crew: { captain: d.crew?.captain || null, chats: ch, caps: d.crew?.caps || d.caps || { deckhands: 2 } },
    plannedGames: ((d.plannedGames || []) as PGame[]).slice().sort((a, b) => a.order - b.order),
    delay: d.delay ? { originalStart: ms(d.delay.originalStart) ?? 0, originalEnd: ms(d.delay.originalEnd) ?? 0, count: d.delay.count || 1, reason: d.delay.reason } : null,
    cancel: d.cancel || null, actualStart: ms(d.actualStart),
    youtube: d.youtube && ["ok", "pending", "failed"].includes(d.youtube.status) ? { status: d.youtube.status, error: d.youtube.error } : null,
  };
}
/** The week's streams as the working copy (private/draft: unpublished changes and uids), by start time. */
export async function loadStreams(week: string): Promise<Stream[]> {
  const snap = await getDocs(query(collection(db, `${base}/streams`), where("week", "==", week)));
  const out = await Promise.all(snap.docs.map(async (d: any) => {
    let data = d.data();
    try { const dr = await getDoc(doc(db, `${base}/streams/${d.id}/private/draft`)); if (dr.exists()) data = dr.data(); } catch { /* the public doc will do */ }
    return streamFrom(d.id, data);
  }));
  return out.sort((a, b) => a.start - b.start);
}
/** A seat dropped after publish and up for grabs (crew/main/swaps; Mod Machina phase 3 part 1). Handles only, no uids beyond the two that identify the people. */
export interface Swap { id: string; streamId: string; room: string; role: "captain" | "lead" | "deckhand"; fromUid: string; fromHandle: string; droppedAt: number; startsAt: number; notice: "early" | "late"; status: "open" | "taken" | "closed"; takenBy: string | null; takenByHandle: string | null; takenAt: number | null }
export async function loadSwaps(): Promise<Swap[]> {
  const snap = await getDocs(collection(db, `${base}/crew/main/swaps`));
  return snap.docs.map((d: any) => { const x = d.data(); return { id: d.id, streamId: x.streamId, room: x.room, role: x.role, fromUid: x.fromUid, fromHandle: x.fromHandle || "", droppedAt: ms(x.droppedAt) ?? 0, startsAt: ms(x.startsAt) ?? 0, notice: x.notice === "late" ? "late" : "early", status: x.status, takenBy: x.takenBy ?? null, takenByHandle: x.takenByHandle ?? null, takenAt: ms(x.takenAt) } as Swap; });
}
export async function loadSignups(streamId: string): Promise<Signup[]> {
  const snap = await getDocs(collection(db, `${base}/streams/${streamId}/signups`));
  return snap.docs.map((d: any) => { const x = d.data(); return { uid: d.id, availability: x.availability || "", prefilled: x.prefilled === true, seats: x.seats || [], gameRequest: x.gameRequest || null, handle: x.handle || null, grade: x.grade ?? null, track: x.track || "mod", reconfirm: x.reconfirm || null } as Signup; });
}
export async function loadSettings(): Promise<Settings> {
  const s = await getDoc(doc(db, `${base}/planner/main`));
  const d: any = s.exists() ? s.data() : {};
  return { deadlines: { ...DEFAULT_SETTINGS.deadlines, ...(d.deadlines || {}) }, defaults: { ...DEFAULT_SETTINGS.defaults, ...(d.defaults || {}), minCrew: { ...DEFAULT_SETTINGS.defaults.minCrew, ...(d.defaults?.minCrew || {}) }, caps: { ...DEFAULT_SETTINGS.defaults.caps, ...(d.defaults?.caps || {}) } } };
}
export async function loadPatterns(): Promise<Pattern[]> {
  const snap = await getDocs(collection(db, `${base}/planner/main/patterns`));
  return snap.docs.map((d: any) => ({ id: d.id, tagHints: [], gameHints: [], active: true, order: 0, ...d.data() }) as Pattern).sort((a, b) => a.dow - b.dow || a.start.localeCompare(b.start));
}
export async function loadExceptions(): Promise<Exception[]> {
  const snap = await getDocs(collection(db, `${base}/planner/main/exceptions`));
  return snap.docs.map((d: any) => ({ id: d.id, public: true, ...d.data() }) as Exception).sort((a, b) => a.from.localeCompare(b.from));
}
export async function loadTodos(): Promise<Todo[]> {
  const snap = await getDocs(collection(db, `${base}/planner/main/todos`));
  return snap.docs.map((d: any) => ({ id: d.id, kind: d.get("kind"), text: d.get("text") || "", week: d.get("week") || null, link: d.get("link") || null }));
}
export async function isOwner(uid: string | undefined): Promise<boolean> {
  if (!uid) return false;
  const site = await getDoc(doc(db, "sites", SITE_ID));
  return site.get("ownerUid") === uid;
}
export { crewMe, type Me };

// ---------------------------------------------------------------------------------------------
// callables (the only writes)
// ---------------------------------------------------------------------------------------------
export const planCall = <T = any>(name: string, data: unknown = {}) => call<T>(name, data);

/** Warnings from publishWeek({ check: true }). */
export interface PublishCheck { warnings: { streamId: string; kind: string; text: string }[]; hero: Hero; recentFrames: string[]; poolFrames: string[]; seasonalFrames: string[]; doorStyles: string[]; state: string; publishedRev: number }

// ---------------------------------------------------------------------------------------------
// what a slot needs from its crew, from the draft (display only)
// ---------------------------------------------------------------------------------------------
export interface Glance { captain: "ok" | "needed" | "none"; groups: { group: "twitch" | "youtube" | "tiktok"; state: "ok" | "needed" | "none" }[] }
export function crewGlance(s: Stream): Glance {
  const need = s.minCrew || { captain: false, rooms: [] };
  const groups: Glance["groups"] = [];
  for (const g of ["twitch", "youtube", "tiktok"] as const) {
    const rooms = s.rooms.filter((r) => GROUP_OF[r] === g);
    if (!rooms.length) continue;
    const filled = rooms.every((r) => s.crew.chats[r]?.lead);
    groups.push({ group: g, state: filled ? "ok" : need.rooms.includes(g) ? "needed" : "none" });
  }
  return { captain: s.crew.captain ? "ok" : need.captain ? "needed" : "none", groups };
}
export const roomState = (s: Stream, r: Room): "covered" | "needed" | "off" =>
  s.crew.chats[r]?.lead ? "covered" : (s.minCrew?.rooms || []).includes(GROUP_OF[r]) ? "needed" : "off";
/** Display-only: a slot that has not started and can still be moved. The server decides. */
export const movable = (s: Stream, now = Date.now()) => ["planned", "scheduled"].includes(s.state) && s.start > now && !s.actualStart;
