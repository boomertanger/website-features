// The Mod Deck's data (/live/deck; docs/specs/mod-machina.md §17a "Data model"): what the page reads, and the callables it calls, behind one door, so a preview can never reach real data.
// Real reads (firestore.rules): public/live (the shared listener in lib/live.ts: stream, beats, rooms, deck.rooms), streams/{id}/private/duty (crew and the owner), MY OWN
// crew/main/duties/{streamId}_{uid}, crew/main/notes (newest first), and, only when private/duty names an active Chat Games run, that run's cues for my room. ONE listener each; all but
// public/live are let go when the tab has been hidden for a minute and opened again when it is back (like lib/live.ts). No polling loops: the page's only timer is the duty heartbeat.
// One-off reads: the stream doc (my seat; public handles), the next stream, the swap board, the crew settings (the YouTube boost).
// Display only: every write is a callable the server checks again. Preview (non-production, signed out, ?state= / ?as=): a local copy in mod-deck-preview.ts.
import { call } from "../../lib/call";
import { db as lite, doc as liteDoc, getDoc, getDocs, collection as liteCollection } from "../../lib/db";
import { SITE_ID } from "../../lib/firebase";
import { loadNextStream } from "../../lib/next-stream";
import { onLive } from "../../lib/live";
import { loadSwaps, ms, type Swap } from "../planner/plan-data";
import { streamFrom, type LStream, type PubLive, type Room as PRoom } from "./model";

export type Room = PRoom | "site";
export type RoleKey = "captain" | "lead" | "deckhand";
export interface SeatRole { role: RoleKey; room: Room | null }
export interface Grade { track: "mod" | "admin"; grade: number }
export interface Me {
  uid: string; handle: string; name: string;
  owner: boolean; admin: boolean;
  /** The crew grade for the chip (null for the owner without a roster entry). */
  grade: Grade | null;
  /** Effective grade for display-side checks: admins count as 4. The server decides. */
  level: number;
  preview: boolean;
}
export interface PubDeck extends PubLive { deck?: { rooms?: Record<string, { lead: string | null; deckhands: number; covered: boolean }> } }
export interface OnDutyEntry { handle: string | null; grade: number; since: number; roles: SeatRole[]; away: { until: number; kind: string; at: number } | null }
export interface Prompt { id: string; kind: string; room?: string; from?: string; fromHandle?: string | null; to: string | string[] | null; expiresAt: number; createdAt: number; status: string; text?: string }
export interface DutyState {
  streamId: string; state: "live" | "ended"; startedAt: number; endedAt: number | null; afterShow: boolean;
  captainNow: { uid: string; handle: string | null; acting: boolean; owner?: boolean; since: number } | null;
  onDuty: Record<string, OnDutyEntry>; prompts: Record<string, Prompt>;
  rooms: Record<string, { lead: string | null; deckhands: number; covered: boolean }>;
  /** The two PUBLIC chat video ids (copied from private/watch by the Control Room's YouTube link; never the backstage id). */
  youtube?: { landscapeId: string | null; verticalId: string | null };
  chatGames?: { activeRunIds?: string[] };
  needsConfirm: boolean; confirmedAt: number | null;
  /** Members locked out of a beat's check-in (mirrored from the check-in; crew can read it, private/control they cannot). */
  lockedOut: LockedOut[];
  /** The flags I sent that the owner has seen (a bare mirror, no text). */
  flagsSeen: Record<string, boolean>;
  /** At Stop: everyone's minutes by role, for "Confirm tonight's crew". */
  night: { minutes: number; rows: NightRow[] } | null;
  captainAtStop: string | null;
}
export interface LockedOut { uid: string; handle: string | null; room: string | null; beat: string }
export interface NightRow { uid: string; handle: string | null; grade: number | null; lines: Record<string, number>; minutes: number }
export type FlagType = "threat" | "pii" | "raid" | "harassment" | "other";
export interface Flag { id: string; type: FlagType; room: string; note: string; byHandle: string | null; urgent: boolean; createdAt: number; seenAt: number | null; doneAt: number | null }
export interface ChatFormat { id: string; title: string; icon: string; sub: string; order: number }
/** The Chat Game on stream now: one of private/duty.chatGames.activeRunIds whose run doc (chatGames/main/runs/{runId}) is this stream's and not over. */
export interface ActiveRun { runId: string; formatId: string }
/** Chat Games' launch API (agreed contract): loaded by the Chat Games script when it exists. The Deck never shows Chat Games tiles without it. */
export interface ChatGamesApi { openLaunch(a: { formatId: string; streamId: string }): unknown; end(a: { runId: string }): unknown }
declare global { interface Window { btChatGames?: ChatGamesApi } }
export interface DutyRec {
  streamId: string; minutes: number; lines: Record<string, number>; scheduled: SeatRole | null; showed: boolean; counted: boolean; led: boolean;
  gears: number | null; confirmedAt: number | null; addedMinutes: number; clockedInAt: number | null; endedAt: number | null; noShow: boolean;
}
export interface Note { id: string; uid: string; handle: string; grade: number | null; track: "mod" | "admin"; text: string; createdAt: number }
export interface Cue { id: string; runId: string; order: number; kicker: string; text: string; due: number | null; state: "pending" | "posted" | "done" }
export interface StreamInfo { id: string; title: string; start: number; end: number; type: "platform" | "backstage"; rooms: Room[]; adhoc: boolean; captain: string | null; seat: SeatRole[] }

export interface Handlers {
  pub(p: PubDeck): void;
  duty(d: DutyState | null): void;
  rec(r: DutyRec | null): void;
  notes(n: Note[]): void;
  cues(c: Cue[]): void;
  /** The flags (owner: all; admins: urgent ones). Crew who are not admins never get any. */
  flags(f: Flag[]): void;
}
export interface Source {
  preview: boolean;
  me: Me;
  start(h: Handlers): void;
  /** Tells the source which room is mine (the cue slot reads my room's cues). */
  setRoom(room: Room | null): void;
  call<T = any>(name: string, data?: unknown): Promise<T>;
  loadStream(id: string): Promise<StreamInfo | null>;
  loadNext(): Promise<StreamInfo | null>;
  swaps(): Promise<Swap[]>;
  youtubeBoost(): Promise<number>;
  /** Chat Games' enabled formats (sites/boomertanger/chatGames/main/formats, by order). [] when they can't be read yet: the slot renders nothing. */
  formats(): Promise<ChatFormat[]>;
  /** Which of the active runs is on this stream (null when none, or when runs can't be read). */
  activeRun(streamId: string, runIds: string[]): Promise<ActiveRun | null>;
}

export const HIDDEN_MS = 60_000;
export const ROOM_NAME: Record<Room, string> = { twitch: "Twitch", ytLandscape: "YouTube", ytVertical: "YT Vertical", tiktok: "TikTok", site: "The site" };
export const ROOM_ORDER: Room[] = ["twitch", "ytLandscape", "ytVertical", "tiktok", "site"];

export const seatOf = (s: LStream, handle: string): SeatRole[] => {
  const out: SeatRole[] = [];
  if (s.crew.captain && s.crew.captain === handle) out.push({ role: "captain", room: null });
  for (const [room, c] of Object.entries(s.crew.chats)) {
    if (!c) continue;
    if (c.lead === handle) out.push({ role: "lead", room: room as Room });
    else if (c.deckhands.includes(handle)) out.push({ role: "deckhand", room: room as Room });
  }
  return out;
};
const infoOf = (id: string, d: any, handle: string): StreamInfo => {
  const s = streamFrom(id, d);
  return { id, title: s.title, start: s.start, end: s.end, type: s.type, rooms: (s.type === "backstage" ? ["site"] : s.rooms) as Room[], adhoc: s.adhoc, captain: s.crew.captain, seat: seatOf(s, handle) };
};

/** The roles on one line: "Stream Captain · Twitch Lead", "Room Lead · Twitch", "Deckhand · YT Vertical". */
export function roleLine(roles: SeatRole[]): string {
  const cap = roles.some((r) => r.role === "captain");
  const lead = roles.filter((r) => r.role === "lead").map((r) => ROOM_NAME[r.room as Room] || "");
  const hands = roles.filter((r) => r.role === "deckhand").map((r) => ROOM_NAME[r.room as Room] || "");
  const parts: string[] = [];
  if (cap && lead.length) parts.push(`Stream Captain · ${lead.join(" and ")} Lead`);
  else if (cap) parts.push("Stream Captain");
  else if (lead.length) parts.push(`Room Lead · ${lead.join(" and ")}`);
  if (hands.length) parts.push(`Deckhand · ${hands.join(" and ")}`);
  return parts.join(" · ") || "On duty";
}
/** The room that is "mine": my lead room, else my deckhand room, else null (a Captain with no room). */
export const myRoomOf = (roles: SeatRole[]): Room | null => (roles.find((r) => r.role === "lead") || roles.find((r) => r.role === "deckhand"))?.room ?? null;

// ---------------------------------------------------------------------------------------------- normalising
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
function roleOf(r: any): SeatRole { return { role: r?.role === "captain" ? "captain" : r?.role === "lead" ? "lead" : "deckhand", room: typeof r?.room === "string" ? (r.room as Room) : null }; }
export function dutyFrom(d: any): DutyState | null {
  if (!d || typeof d !== "object") return null;
  const onDuty: DutyState["onDuty"] = {};
  for (const [uid, e] of Object.entries<any>(d.onDuty || {})) {
    onDuty[uid] = { handle: e?.handle ?? null, grade: num(e?.grade), since: num(e?.since), roles: Array.isArray(e?.roles) ? e.roles.map(roleOf) : [], away: e?.away ? { until: num(e.away.until), kind: String(e.away.kind || ""), at: num(e.away.at) } : null };
  }
  const prompts: DutyState["prompts"] = {};
  for (const [id, p] of Object.entries<any>(d.prompts || {})) prompts[id] = { id, kind: String(p?.kind || ""), room: p?.room, from: p?.from, fromHandle: p?.fromHandle ?? null, to: p?.to ?? null, expiresAt: num(p?.expiresAt), createdAt: num(p?.createdAt), status: String(p?.status || ""), text: p?.text };
  const yt = d.youtube && typeof d.youtube === "object" ? { landscapeId: typeof d.youtube.landscapeId === "string" ? d.youtube.landscapeId : null, verticalId: typeof d.youtube.verticalId === "string" ? d.youtube.verticalId : null } : undefined;
  return {
    streamId: String(d.streamId || ""), state: d.state === "ended" ? "ended" : "live", startedAt: num(d.startedAt), endedAt: d.endedAt == null ? null : num(d.endedAt), afterShow: d.afterShow === true,
    captainNow: d.captainNow ? { uid: String(d.captainNow.uid), handle: d.captainNow.handle ?? null, acting: d.captainNow.acting === true, owner: d.captainNow.owner === true, since: num(d.captainNow.since) } : null,
    onDuty, prompts, rooms: d.rooms || {}, youtube: yt, chatGames: d.chatGames && typeof d.chatGames === "object" ? d.chatGames : undefined,
    needsConfirm: d.needsConfirm === true, confirmedAt: d.confirmedAt == null ? null : num(d.confirmedAt),
    lockedOut: Object.values<any>(d.lockedOut || {}).filter((x) => x && typeof x.uid === "string" && typeof x.beat === "string").map((x) => ({ uid: x.uid, handle: x.handle ?? null, room: x.room ?? null, beat: x.beat })).sort((a, b) => a.beat.localeCompare(b.beat) || String(a.handle).localeCompare(String(b.handle))),
    flagsSeen: d.flagsSeen && typeof d.flagsSeen === "object" ? d.flagsSeen : {},
    night: d.night && Array.isArray(d.night.rows) ? { minutes: num(d.night.minutes), rows: d.night.rows.map((r: any) => ({ uid: String(r.uid), handle: r.handle ?? null, grade: Number.isFinite(r.grade) ? r.grade : null, lines: r.lines && typeof r.lines === "object" ? r.lines : {}, minutes: num(r.minutes) })) } : null,
    captainAtStop: typeof d.captainAtStop === "string" ? d.captainAtStop : null,
  };
}
export function recFrom(d: any): DutyRec | null {
  if (!d || typeof d !== "object") return null;
  return {
    streamId: String(d.streamId || ""), minutes: num(d.minutes), lines: d.lines && typeof d.lines === "object" ? d.lines : {}, scheduled: d.scheduled ? roleOf(d.scheduled) : null, showed: d.showed === true, counted: d.counted === true, led: d.led === true,
    gears: d.gears == null ? null : num(d.gears), confirmedAt: ms(d.confirmedAt), addedMinutes: num(d.addedMinutes), clockedInAt: ms(d.clockedInAt), endedAt: ms(d.endedAt), noShow: d.noShow === true,
  };
}
const DAY = 24 * 3600_000;
export function noteFrom(id: string, d: any): Note | null {
  const t = ms(d?.createdAt);
  if (!d || typeof d.text !== "string" || t == null) return null;
  return { id, uid: String(d.uid || ""), handle: String(d.handle || "crew"), grade: Number.isFinite(d.grade) ? d.grade : null, track: d.track === "admin" ? "admin" : "mod", text: d.text, createdAt: t };
}
/** Newest first, nothing older than 24 hours (the TTL removes them later, but the Deck never shows an old one). */
export function flagFrom(id: string, d: any): Flag | null {
  const t = ms(d?.createdAt);
  if (!d || t == null || typeof d.type !== "string") return null;
  return { id, type: d.type, room: String(d.room || ""), note: String(d.note || ""), byHandle: d.byHandle ?? null, urgent: d.urgent === true, createdAt: t, seenAt: ms(d.seenAt), doneAt: ms(d.doneAt) };
}
export const freshNotes = (notes: Note[], at = Date.now()) => notes.filter((n) => at - n.createdAt < DAY).sort((a, b) => b.createdAt - a.createdAt);
function cueFrom(runId: string, id: string, d: any): Cue {
  return { id, runId, order: num(d?.order), kicker: String(d?.kicker || d?.title || d?.format || "Chat Game"), text: String(d?.text || ""), due: ms(d?.dueAt ?? d?.due), state: d?.done ? "done" : d?.posted ? "posted" : "pending" };
}

// ---------------------------------------------------------------------------------------------- real
const base = `sites/${SITE_ID}`;
export function realSource(me: Me): Source {
  let h: Handlers | null = null;
  let fs: any = null, fdb: any = null;
  const unsubs = new Map<string, () => void>();
  let streamId: string | null = null, room: Room | null = null, runIds: string[] = [], cueKey = "";
  let hiddenTimer = 0, closed = false;
  const cues = new Map<string, Cue[]>();

  async function sdk() {
    if (fs) return;
    const [f, fb] = await Promise.all([import("firebase/firestore"), import("../../lib/firebase")]);
    fs = f; fdb = f.getFirestore(fb.app);
  }
  const listen = (key: string, ref: any, onData: (snap: any) => void, onErr?: () => void) => {
    if (unsubs.has(key)) return;
    unsubs.set(key, fs.onSnapshot(ref, onData, (err: any) => { console.warn("mod deck listener", key, err?.code || err); onErr?.(); }));
  };
  const drop = (key: string) => { unsubs.get(key)?.(); unsubs.delete(key); };
  const dropPrefix = (prefix: string) => { for (const k of [...unsubs.keys()]) if (k.startsWith(prefix)) drop(k); };

  function openStream() {
    if (!streamId || !h) return;
    const sid = streamId;
    listen("duty", fs.doc(fdb, `${base}/streams/${sid}/private/duty`), (s: any) => h!.duty(s.exists() ? dutyFrom(s.data()) : null), () => h!.duty(null));
    openFlags();
    listen("rec", fs.doc(fdb, `${base}/crew/main/duties/${sid}_${me.uid}`), (s: any) => h!.rec(s.exists() ? recFrom({ ...s.data(), streamId: sid }) : null), () => h!.rec(null));
  }
  /** Flags: the owner reads them all, admins read them too (the rules); anyone else never asks. Admins on duty see the urgent ones. */
  function openFlags() {
    if (!streamId || !h || !me.admin) return;
    const sid = streamId;
    listen("flags", fs.query(fs.collection(fdb, `${base}/streams/${sid}/flags`), fs.orderBy("createdAt", "desc"), fs.limit(20)),
      (s: any) => h!.flags(s.docs.map((d: any) => flagFrom(d.id, d.data())).filter((f: Flag | null): f is Flag => !!f && f.doneAt == null && (me.owner || f.urgent))), () => h!.flags([]));
  }
  function openNotes() {
    if (!h) return;
    listen("notes", fs.query(fs.collection(fdb, `${base}/crew/main/notes`), fs.orderBy("createdAt", "desc"), fs.limit(30)),
      (s: any) => h!.notes(freshNotes(s.docs.map((d: any) => noteFrom(d.id, d.data())).filter(Boolean) as Note[])), () => h!.notes([]));
  }
  /** Chat Games (ROADMAP 5b): the active runs named by private/duty, then each run's cues for my room. Nothing exists yet, so a refusal just means no cues. */
  function openCues() {
    const key = `${runIds.join(",")}|${room || ""}`;
    if (key === cueKey) return;
    cueKey = key; dropPrefix("cues:"); cues.clear();
    if (!runIds.length || !room) { h?.cues([]); return; }
    const push = () => h?.cues([...cues.values()].flat().sort((a, b) => a.order - b.order));
    for (const runId of runIds) {
      listen(`cues:${runId}`, fs.query(fs.collection(fdb, `${base}/chatGames/main/runs/${runId}/cues`), fs.where("room", "==", room), fs.orderBy("order")),
        (s: any) => { cues.set(runId, s.docs.map((d: any) => cueFrom(runId, d.id, d.data()))); push(); }, () => { cues.delete(runId); push(); });
    }
  }
  async function openAll() { await sdk(); if (closed) return; openNotes(); openStream(); cueKey = ""; openCues(); }
  function closeAll() { for (const k of [...unsubs.keys()]) drop(k); cueKey = ""; }
  function onVisibility() {
    if (document.hidden) { clearTimeout(hiddenTimer); hiddenTimer = window.setTimeout(() => { hiddenTimer = 0; closed = true; closeAll(); }, HIDDEN_MS); }
    else { clearTimeout(hiddenTimer); hiddenTimer = 0; if (closed) { closed = false; void openAll(); } }
  }

  const dutyRunIds = (d: DutyState | null) => (Array.isArray(d?.chatGames?.activeRunIds) ? d!.chatGames!.activeRunIds!.filter((x) => typeof x === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(x)) : []);
  return {
    preview: false, me,
    start(handlers) {
      h = { ...handlers, duty: (d) => { runIds = dutyRunIds(d); handlers.duty(d); if (fs) openCues(); } };
      document.addEventListener("visibilitychange", onVisibility);
      onLive((p) => {
        handlers.pub(p as PubDeck);
        const sid = p.state !== "off" ? p.streamId : null;
        if (sid !== streamId) { dropPrefix("duty"); dropPrefix("rec"); dropPrefix("flags"); streamId = sid; runIds = []; if (fs && !closed) openStream(); else if (!fs) void openAll(); if (!sid) { handlers.duty(null); handlers.rec(null); handlers.flags([]); } }
      });
      void openAll();
    },
    setRoom(r) { if (r !== room) { room = r; if (fs && !closed) openCues(); } },
    call: (name, data) => call(name, data),
    async loadStream(id) { const s = await getDoc(liteDoc(lite, `${base}/streams/${id}`)); return s.exists() ? infoOf(id, s.data(), me.handle) : null; },
    async loadNext() { const n = await loadNextStream(); return n ? this.loadStream(n.id) : null; },
    swaps: () => loadSwaps(),
    async formats() {
      try {
        const snap = await getDocs(liteCollection(lite, `${base}/chatGames/main/formats`));
        return snap.docs.map((d: any) => ({ id: d.id, title: String(d.get("title") || d.get("name") || d.id), icon: String(d.get("icon") || "🎲"), sub: String(d.get("blurb") || d.get("sub") || ""), order: Number(d.get("order")) || 0, on: d.get("enabled") !== false && d.get("on") !== false })).filter((f: any) => f.on).sort((a: any, b: any) => a.order - b.order);
      } catch { return []; }   // not readable (or not built) yet: the slot renders nothing
    },
    async activeRun(sid, ids) {
      for (const id of ids) {
        try {
          const s = await getDoc(liteDoc(lite, `${base}/chatGames/main/runs/${id}`));
          const st = s.exists() ? String(s.get("state") || "") : "";
          if (s.exists() && s.get("streamId") === sid && typeof s.get("formatId") === "string" && !["ended", "done", "cancelled"].includes(st)) return { runId: id, formatId: s.get("formatId") };
        } catch { /* not readable yet: no running tile */ }
      }
      return null;
    },
    async youtubeBoost() { try { const s = await getDoc(liteDoc(lite, `${base}/crew/main`)); const b = s.exists() ? Number(s.get("youtubeBoost")) : NaN; return Number.isFinite(b) && b > 0 ? b : 1.5; } catch { return 1.5; } },
  };
}
