// Sample data for the public /live page (non-production only: ?live=off|public|backstage, the shell's own switch, or ?state=off|soon|live|break|backstage|ended).
// Also: ?beat=start|break1|break2|end  ?window=1 (an open check-in)  ?checked=start,break1 (your stamps)  ?locked=1  ?look=crt  ?as=visitor|member (the shell's).
// Same shapes as the real reads (docs/specs/control-room.md §13); times are relative to now. Practice only: the word is "mortuary", five wrong tries
// lock a beat, Remind me answers as the real callable does today ("soon"). Nothing here reaches Firestore or a callable (pub-data.ts decides).
import raw from "../../data/preview-live-control.json";
import type { NextStream } from "../../lib/next-stream";
import { previewVault } from "../planner/plan-preview";
import type { VCard } from "../vault/data";
import { BEATS, streamFrom, type Beat, type LStream, type PubLive } from "./model";
import type { CheckInResult, Presence, PubApi, Room } from "./pub-data";

const MIN = 60000;
const jitter = (n: number, spread: number) => Math.max(0, Math.round(n + (Math.random() - 0.45) * spread));
const q = () => new URLSearchParams(location.search);

export type Kind = "off" | "soon" | "live" | "break" | "backstage" | "ended";
const KINDS: Kind[] = ["off", "soon", "live", "break", "backstage", "ended"];
export function previewKind(): Kind {
  const p = q(), s = p.get("state"), l = p.get("live");
  if (s && KINDS.includes(s as Kind)) return s as Kind;
  return l === "public" ? "live" : l === "backstage" ? "backstage" : "off";
}

const monday = raw.streams[0], backstageRaw = raw.streams[1];
const WORD = "mortuary";
const GRADES = [{ handle: "nightowl", track: "mod" as const, grade: 3 }, { handle: "vexx", track: "mod" as const, grade: 2 }, { handle: "hollowgrin", track: "mod" as const, grade: 2 }, { handle: "mothlight", track: "mod" as const, grade: 1 }];
let tries = 5;
const checked = new Set<string>((q().get("checked") || "").split(",").filter(Boolean));
const start = Date.now();

function nextStream(kind: Kind): NextStream {
  const now = Date.now();
  const soon = kind === "soon";
  const at = soon ? now + 12 * MIN : now + (26 * 60 + 12) * MIN;
  return {
    id: "pv-next", title: monday.title, start: at, end: at + monday.lenMin * MIN, type: "platform", audience: "public", rooms: monday.rooms,
    games: monday.games.map((g) => ({ slug: g.gameId, title: g.title })), plannedGameCount: 3, captain: monday.crew.captain,
    delayedFrom: q().get("late") === "1" ? at - 60 * MIN : null,
  };
}

function liveSnapshot(kind: Kind): PubLive {
  const now = Date.now(), p = q();
  const backstage = kind === "backstage";
  const beat = (BEATS.includes(p.get("beat") as Beat) ? p.get("beat") : kind === "break" ? "break1" : "start") as Beat;
  const open = kind === "break" || p.get("window") === "1";
  const order = BEATS.indexOf(beat);
  const beats: PubLive["beats"] = {};
  BEATS.forEach((k, i) => { beats[k] = { status: i < order ? "done" : i === order ? "now" : "next", checkins: (raw.checkins.byBeat as any)[k] || 0 }; });
  const rooms: Room[] = backstage ? ["site"] : ["twitch", "ytLandscape", "ytVertical"];
  const by = backstage ? {} : { twitch: jitter(raw.viewers.twitch, 28), ytLandscape: jitter(raw.viewers.ytLandscape, 12), ytVertical: jitter(raw.viewers.ytVertical, 6) };
  const total = backstage ? jitter(96, 6) : Object.values(by).reduce((a, b) => a + b, 0);
  const crew = (backstageRaw as any).crew, mc = monday.crew;
  const chats: PubLive["crew"]["chats"] = {};
  for (const [r, v] of Object.entries<any>((backstage ? crew : mc).chats || {})) chats[r] = { lead: v.lead, deckhands: v.deckhands };
  const live = kind === "live" || kind === "break";
  const game = backstage ? null : live && kind === "break" ? null : { gameId: "soul-hunt", title: "Soul Hunt", startedAt: now - 47 * MIN };
  const startedAt = now - (backstage ? 18 : 134) * MIN - 37000;
  const e = kind === "ended";
  return {
    state: e ? "ended" : backstage ? "backstage" : "live", look: p.get("look") === "crt" ? "crt" : "hull",
    streamId: backstage ? "pv-backstage" : "pv-monday", title: backstage ? "After-show" : monday.title, type: backstage ? "backstage" : "platform", audience: backstage ? "fanClub" : "public",
    liveRooms: rooms as string[], actualStart: e ? now - 167 * MIN : startedAt, actualEnd: e ? now - 4 * MIN : null, beat: e ? null : beat, beats,
    window: { open: open && !e, closesAt: open && !e ? start + 5 * MIN : null, beat: open && !e ? beat : null },
    counts: { total: Object.values(raw.checkins.byBeat).reduce((a, b) => a + b, 0), byBeat: { ...raw.checkins.byBeat }, byRoom: { ...raw.checkins.byRoom } },
    viewers: { total, byPlatform: by as any }, peak: Math.max(1412, total), game: e ? null : game,
    nextGame: e || backstage ? null : { gameId: "lethal-night", title: "Lethal Night" },
    crew: { captain: (backstage ? crew : mc).captain, chats, onDuty: [(backstage ? crew : mc).captain], grades: GRADES },
    firstIn: e ? [] : raw.firstIn.slice(0, 3), firstInBeat: e ? null : beat,
    chatGame: null,
  };
}

function snapshot(kind: Kind): PubLive {
  if (kind === "off" || kind === "soon") {
    return { state: "off", look: q().get("look") === "crt" ? "crt" : "hull", streamId: null, title: null, beat: null, beats: {}, window: { open: false, closesAt: null, beat: null }, counts: { total: 0, byBeat: {}, byRoom: {} },
      viewers: { total: 0, byPlatform: {} }, peak: 0, game: null, nextGame: null, crew: { captain: null, chats: {}, onDuty: [], grades: [] }, firstIn: [], firstInBeat: null, chatGame: null };
  }
  return liveSnapshot(kind);
}

function streamDoc(kind: Kind): LStream | null {
  const now = Date.now();
  if (kind === "off" || kind === "soon") return null;
  const backstage = kind === "backstage", e = kind === "ended";
  const t0 = e ? now - 167 * MIN : now - (backstage ? 18 : 134) * MIN;
  const games = backstage ? [] : monday.games;
  const segs = e
    ? [{ kind: "game", gameId: "soul-hunt", title: "Soul Hunt", startedAt: t0, endedAt: t0 + 71 * MIN }, { kind: "break", startedAt: t0 + 71 * MIN, endedAt: t0 + 78 * MIN },
       { kind: "game", gameId: "lethal-night", title: "Lethal Night", startedAt: t0 + 78 * MIN, endedAt: t0 + 130 * MIN }, { kind: "break", startedAt: t0 + 130 * MIN, endedAt: t0 + 136 * MIN },
       { kind: "game", gameId: "granny-2", title: "Granny 2", startedAt: t0 + 136 * MIN, endedAt: t0 + 163 * MIN }]
    : backstage ? [] : [{ kind: "game", gameId: "soul-hunt", title: "Soul Hunt", startedAt: now - 47 * MIN, endedAt: null }];
  const bt = (k: Beat) => { const i = BEATS.indexOf(k); return { startedAt: t0 + i * 55 * MIN, endedAt: i < BEATS.indexOf(((BEATS.includes(q().get("beat") as Beat) ? q().get("beat") : kind === "break" ? "break1" : "start") as Beat)) || e ? t0 + (i + 1) * 55 * MIN : null }; };
  const beats: any = {};
  const cur = BEATS.indexOf((BEATS.includes(q().get("beat") as Beat) ? q().get("beat") : kind === "break" ? "break1" : "start") as Beat);
  BEATS.forEach((k, i) => { if (e ? k !== "break2" : i <= cur) beats[k] = bt(k); });
  if (e) beats.break2 = { skipped: true };
  return streamFrom("pv-stream", {
    title: backstage ? "After-show" : monday.title, state: e ? "ended" : "live", type: backstage ? "backstage" : "platform", audience: backstage ? "fanClub" : "public",
    plannedStart: t0, plannedEnd: t0 + monday.lenMin * MIN, actualStart: t0, rooms: monday.rooms, liveRooms: backstage ? ["site"] : ["twitch", "ytLandscape", "ytVertical"],
    plannedGames: games.map((g, i) => ({ gameId: g.gameId, title: g.title, order: i })), segments: segs, beats, crew: { captain: monday.crew.captain, chats: {} },
  });
}

const covers = () => new Map<string, VCard>(previewVault().map((g: any) => [g.slug, { ...g, score: g.slug === "soul-hunt" ? 8.5 : null, streams: 6, minutes: 860, verdict: null } as unknown as VCard]));

export function previewApi(): PubApi {
  const kind = previewKind();
  return {
    preview: true,
    feed(fn) {
      fn(snapshot(kind));
      const live = kind !== "off" && kind !== "soon" && kind !== "ended";
      if (!live) return () => {};
      // ?handover=1: a public stream hands over to the after-show after 4 seconds (the page changes over without a reload)
      let k: Kind = kind;
      const h = q().get("handover") === "1" && kind === "live" ? setTimeout(() => { k = "backstage"; fn(snapshot(k)); }, 4000) : 0;
      const t = setInterval(() => fn(snapshot(k)), 3000);
      return () => { clearInterval(t); clearTimeout(h); };
    },
    next: async () => (kind === "off" || kind === "soon" || kind === "ended" ? nextStream(kind) : null),
    stream: async () => streamDoc(kind),
    vault: async () => covers(),
    async presence(): Promise<Presence | null> {
      const beats: Presence["beats"] = {};
      checked.forEach((k) => { beats[k as Beat] = { room: "twitch" }; });
      const wrong: Presence["wrongTries"] = q().get("locked") === "1" ? { [q().get("beat") || "break1"]: 5 } : {};
      return { beats, wrongTries: wrong };
    },
    async checkIn(word): Promise<CheckInResult> {
      await new Promise((r) => setTimeout(r, 350));
      if (word.trim().toLowerCase().replace(/[^a-z]/g, "") === WORD) { const b = (snapshot(kind).beat || "break1") as Beat; checked.add(b); return { ok: true, beat: b, xp: 10 }; }
      tries--;
      return tries <= 0 ? { locked: true } : { ok: false, left: tries };
    },
    backstage: async () => ({ videoId: "preview" }),
    remind: async () => "soon",
  };
}
