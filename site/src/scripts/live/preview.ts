// Preview data for the Control Room (non-production, signed out, ?as=admin = the owner, ?as=a2 = an Overseer). Builds today's streams, a live
// stream or an ended one from src/data/preview-live-control.json and answers the callables from a local copy, so the layouts and the
// interactions can be checked without an account. ?state=idle|live|ended  ?beat=start|break1|break2|end  ?window=1 (an open check-in)  ?look=crt.
// Nothing here ever runs for a real session (api.ts decides), and nothing here reaches Firestore or a real callable.
// The a2 role gets no checklist and no templates, exactly as the real reads: those calls throw "Only the owner can do that."
import raw from "../../data/preview-live-control.json";
import { toast } from "../../../../shared/ui/toast.js";
import { previewVault } from "../planner/plan-preview";
import type { VCard } from "../vault/data";
import { countRead, type Api, type Templates } from "./api";
import { livePreview } from "./layout";
import { BEATS, ROOMS, type Beat, type CBeats, type Control, type LStream, type Main, type PubLive, type Room, type Snapshot, type Window } from "./model";

const MIN = 60000;
const jitter = (n: number, spread: number) => Math.max(0, Math.round(n + (Math.random() - 0.45) * spread));
const fail = (message: string) => Object.assign(new Error(message), { code: "bt/msg" });

interface PState {
  streams: LStream[]; live: LStream | null; control: Control | null; main: Main; checklist: CBeats | null; templates: CBeats;
  ended: PubLive | null; counts: { byBeat: Partial<Record<Beat, number>>; byRoom: Record<string, number> }; viewers: Partial<Record<Room, number>>; peak: number; wordUsed: number;
  adhocAt: Record<string, number>;
}
let S: PState | null = null;
const pstatusCalls: Record<string, number> = {};

const stream = (r: any, now: number): LStream => ({
  id: r.id, title: r.title, state: "scheduled", type: r.type, audience: r.audience, adhoc: false, start: now + r.startInMin * MIN, end: now + (r.startInMin + r.lenMin) * MIN, actualStart: null,
  rooms: r.rooms as Room[], liveRooms: [], week: null, crew: JSON.parse(JSON.stringify(r.crew)), minCrew: r.minCrew,
  plannedGames: (r.games as any[]).map((g, i) => ({ gameId: g.gameId, title: g.title, order: i })), segments: [], beats: {},
  youtube: { status: r.youtube, ...(r.youtube === "failed" ? { error: "The event could not be created" } : {}) }, delay: null,
});
const copyTemplates = (t: CBeats, type: string): CBeats => {
  const only = type === "backstage" ? "backstage" : "platform", out = {} as CBeats;
  for (const k of BEATS) out[k] = t[k].filter((it) => !it.only || it.only === only).map((it) => ({ ...it, done: false }));
  return out;
};

function goLive(st: PState, s: LStream, now: number, beat: Beat, windowOpen: boolean) {
  const q = new URLSearchParams(location.search);
  const startedAt = now - 47 * MIN;
  s.state = "live"; s.actualStart = startedAt;
  s.segments = [{ kind: "game", gameId: s.plannedGames[0]?.gameId, title: s.plannedGames[0]?.title, startedAt, endedAt: null }];
  const order = BEATS.indexOf(beat);
  BEATS.slice(0, order + 1).forEach((k, i) => { s.beats[k] = { startedAt: startedAt + i * 25 * MIN, endedAt: i < order ? startedAt + (i + 1) * 25 * MIN : null, checkins: st.counts.byBeat[k] || 0, windowOpenedAt: i < order || windowOpen ? startedAt + i * 25 * MIN + 3 * MIN : null }; });
  if (order > 0 && order < 3 && q.get("seg") !== "game") s.segments = [{ ...s.segments[0], endedAt: now - 5 * MIN }, { kind: "break", startedAt: now - 5 * MIN, endedAt: null }];
  s.liveRooms = s.liveRooms.length ? s.liveRooms : s.type === "backstage" ? ["site" as Room] : s.rooms.filter((r) => r !== "tiktok");
  st.live = s;
  st.streams = st.streams.filter((x) => x.id !== s.id);
  const word = raw.words[st.wordUsed++ % raw.words.length];
  const w: Window | null = windowOpen ? { beat, word, openedAt: now - 2 * MIN, closesAt: now + 3 * MIN, lengthMinutes: 5 } : order > 0 || q.get("closed") === "1" ? { beat, word, openedAt: now - 8 * MIN, closesAt: now - 3 * MIN, lengthMinutes: 5, closedAt: now - 3 * MIN } : null;
  st.control = { window: w, pinned: null, brbUntil: null, firstIn: { [beat]: raw.firstIn.map((handle) => ({ handle })) }, viewers: { ...st.viewers }, peak: 1412, yt: { status: "ok" }, twitch: { status: "live" }, tiktok: null };
  st.checklist = copyTemplates(st.templates, s.type);
  if (order > 0) for (const it of st.checklist.start) it.done = true;
}

function build(): PState {
  const now = Date.now(), q = new URLSearchParams(location.search);
  const state = q.get("state") || "idle";
  const templates = {} as CBeats;
  for (const k of BEATS) templates[k] = (raw.templates as any)[k].map((x: any) => ({ ...x }));
  const st: PState = {
    streams: (raw.streams as any[]).map((r) => stream(r, now)), live: null, control: null,
    main: { look: q.get("look") === "crt" ? "crt" : "hull", windowLengthChoices: [2, 3, 5, 10], windowDefaultMinutes: 5, obsKeyAt: null, deckKeyAt: Date.now() - 12 * 86400000, obsKeySet: false, deckKeySet: true },
    checklist: null, templates, ended: null, counts: { byBeat: { ...raw.checkins.byBeat }, byRoom: { ...raw.checkins.byRoom } }, viewers: { ...raw.viewers } as any, peak: 1412, wordUsed: 0, adhocAt: {},
  };
  st.main.obsKeyAt = null;
  if (q.get("ttset") === "1") st.streams[0].liveRooms = st.streams[0].rooms.slice();   // TikTok already saved on the stream (before Start)
  if (state === "live") {
    const beat = (BEATS.includes(q.get("beat") as Beat) ? q.get("beat") : "start") as Beat;
    goLive(st, st.streams[0], now, beat, q.get("window") === "1");
  } else if (state === "ended") {
    const s = st.streams[0];
    st.streams = st.streams.filter((x) => x !== s);
    st.ended = {
      state: "ended", look: st.main.look, streamId: s.id, title: s.title, type: "platform", audience: "public", actualStart: now - 167 * MIN, actualEnd: now - 4 * MIN, beat: null,
      beats: { start: { status: "done", checkins: 214 }, break1: { status: "done", checkins: 302 }, break2: { status: "skipped", checkins: 0 }, end: { status: "done", checkins: 287 } },
      window: { open: false, closesAt: null, beat: null }, counts: { total: 803, byBeat: { start: 214, break1: 302, end: 287 }, byRoom: { ...raw.checkins.byRoom } }, viewers: { total: 0, byPlatform: {} }, peak: 1412,
      game: null, nextGame: null, crew: { captain: null, chats: {}, onDuty: [] }, activity: null,
    };
  }
  return st;
}
const pv = () => (S ||= build());

function mkPub(st: PState): PubLive {
  const s = st.live;
  if (!s) return st.ended || { state: "off", look: st.main.look, streamId: null, title: null, beat: null, beats: {}, window: { open: false, closesAt: null, beat: null }, counts: { total: 0, byBeat: {}, byRoom: {} }, viewers: { total: 0, byPlatform: {} }, peak: 0, game: null, nextGame: null, crew: { captain: null, chats: {}, onDuty: [] }, activity: null };
  const now = Date.now(), c = st.control!, w = c.window;
  const current = [...BEATS].reverse().find((k) => s.beats[k] && !s.beats[k]!.skipped && s.beats[k]!.startedAt != null && s.beats[k]!.endedAt == null) || null;
  const beats: PubLive["beats"] = {};
  for (const k of BEATS) { const b = s.beats[k]; beats[k] = { status: b?.skipped ? "skipped" : b?.startedAt != null ? (b.endedAt == null ? "now" : "done") : "next", checkins: st.counts.byBeat[k] || 0 }; }
  const open = !!w && !w.closedAt && w.closesAt > now;
  const by: Partial<Record<Room, number>> = {};
  let total = 0;
  for (const r of s.type === "backstage" ? [] : s.rooms) if (c.viewers[r] != null) { by[r] = c.viewers[r]; total += c.viewers[r]!; }
  const seg = s.segments.find((x) => x.endedAt == null && x.kind === "game");
  const played = s.segments.filter((x) => x.kind === "game").map((x) => x.gameId);
  const next = s.plannedGames.find((g) => !played.includes(g.gameId));
  const chats: PubLive["crew"]["chats"] = {};
  for (const [r, v] of Object.entries(s.crew.chats)) chats[r] = { lead: v!.lead, deckhands: v!.deckhands };
  const total2 = Object.values(st.counts.byBeat).reduce((a, b) => a + (b || 0), 0);
  return {
    state: s.type === "backstage" ? "backstage" : "live", look: st.main.look, streamId: s.id, title: s.title, type: s.type, audience: s.audience, actualStart: s.actualStart, actualEnd: null, beat: current, beats,
    window: { open, closesAt: open ? w!.closesAt : null, beat: open ? w!.beat : null }, liveRooms: s.liveRooms,
    counts: { total: total2, byBeat: { ...st.counts.byBeat }, byRoom: { ...st.counts.byRoom } }, viewers: { total, byPlatform: by }, peak: Math.max(c.peak, total),
    game: seg ? { gameId: seg.gameId!, title: seg.title!, startedAt: seg.startedAt! } : null, nextGame: next ? { gameId: next.gameId, title: next.title } : null,
    crew: { captain: s.crew.captain, chats, onDuty: [s.crew.captain, ...Object.values(s.crew.chats).flatMap((v) => [v!.lead, ...v!.deckhands])].filter(Boolean) as string[] }, activity: null,
  };
}

/** Moves the sample forward a little on each poll: viewers wander, check-ins climb while a window is open, a new event gets its YouTube status. */
function tick(st: PState) {
  const now = Date.now();
  for (const s of st.streams) if (st.adhocAt[s.id] && now - st.adhocAt[s.id] > 6000 && s.youtube?.status === "pending") s.youtube = { status: "ok" };
  const c = st.control, s = st.live;
  if (!c || !s) return;
  for (const r of s.rooms) if (r !== "tiktok" || c.tiktok) c.viewers[r] = jitter(c.viewers[r] ?? (st.viewers[r] || 0), 28);
  if (c.tiktok) c.viewers.tiktok = c.tiktok.viewers;
  const total = Object.values(c.viewers).reduce((a, b) => a + (b || 0), 0);
  c.peak = Math.max(c.peak, total);
  const w = c.window;
  if (w && !w.closedAt && w.closesAt > now) {
    st.counts.byBeat[w.beat] = (st.counts.byBeat[w.beat] || 0) + Math.round(Math.random() * 7);
    for (const r of s.rooms) st.counts.byRoom[r] = (st.counts.byRoom[r] || 0) + Math.round(Math.random() * 3);
  }
}

const snapshot = (st: PState, role: "owner" | "a2", streams: boolean): Snapshot => ({
  pub: mkPub(st), streams: streams ? st.streams.map((s) => ({ ...s })) : [], live: st.live, control: st.control,
  main: null, checklist: role === "owner" ? (countRead("checklist"), st.checklist) : null,
});

export async function previewApi(): Promise<Api> {
  const role = livePreview() || "a2";
  const ownerOnly = () => { if (role !== "owner") throw fail("Only the owner can do that."); };
  const stream = (id: string) => { const s = pv().streams.find((x) => x.id === id) || (pv().live?.id === id ? pv().live : null); if (!s) throw fail("That stream isn't there."); return s; };
  const liveS = () => { const s = pv().live; if (!s) throw fail("That stream isn't live."); return s; };
  const ctl = () => pv().control!;

  const handlers: Record<string, (d: any) => any> = {
    delayStream(d) { const s = stream(d.streamId); const len = s.end - s.start; s.start = d.startMs; s.end = d.endMs ?? d.startMs + len; s.delay = { count: (s.delay?.count || 0) + 1 }; return { ok: true }; },
    cancelStream(d) { const st = pv(); stream(d.streamId); st.streams = st.streams.filter((x) => x.id !== d.streamId); return { ok: true, state: "cancelled" }; },
    youtubeRetry(d) { const s = stream(d.streamId); s.youtube = { status: "ok" }; return { ok: true, status: "ok" }; },
    createAdhocStream(d) {
      const st = pv(), a = d.adhoc || d, now = Date.now(), id = `pv-adhoc-${Math.random().toString(36).slice(2, 7)}`;
      const g = a.firstGame ? previewVault().find((v) => v.slug === a.firstGame.gameId) : null;
      const s: LStream = {
        id, title: a.title, state: "scheduled", type: a.type === "backstage" ? "backstage" : "platform", audience: a.type === "backstage" ? "fanClub" : a.audience || "public", adhoc: true, start: now, end: now + (a.durationMinutes || 180) * MIN, actualStart: null,
        rooms: a.type === "backstage" ? [] : (a.rooms || ["twitch", "ytLandscape", "ytVertical", "tiktok"]), liveRooms: [], week: null, crew: { captain: null, chats: {} }, minCrew: { captain: false, rooms: [] },
        plannedGames: g ? [{ gameId: g.slug, title: g.title, order: 0 }] : [], segments: [], beats: {}, youtube: { status: "pending" }, delay: null,
      };
      st.streams.unshift(s); st.adhocAt[id] = now;
      return { ok: true, streamId: id, state: "scheduled", type: s.type };
    },
    startStream(d) {
      const st = pv();
      if (st.live) throw fail("Another stream is live. Stop it first.");
      const s = st.streams.find((x) => x.id === d.streamId);
      if (!s) throw fail("That stream isn't there.");
      const now = Date.now();
      st.counts = { byBeat: {}, byRoom: {} }; st.viewers = { twitch: 48, ytLandscape: 12, ytVertical: 5 };
      const g = d.firstGame ? previewVault().find((v) => v.slug === d.firstGame.gameId) : null;
      if (g) s.plannedGames = [{ gameId: g.slug, title: g.title, order: 0 }, ...s.plannedGames.filter((p) => p.gameId !== g.slug).map((p, i) => ({ ...p, order: i + 1 }))];
      goLive(st, s, now, "start", false);
      s.actualStart = now; s.segments[0].startedAt = now; s.beats.start = { startedAt: now, endedAt: null, checkins: 0, windowOpenedAt: null };
      st.control!.window = null; st.control!.peak = 0; st.control!.viewers = { ...st.viewers }; st.control!.firstIn = {};
      for (const it of Object.values(st.checklist!).flat()) it.done = false;
      return { ok: true, streamId: s.id, state: "live", type: s.type, youtube: s.youtube?.status === "ok" ? "ok" : "waiting" };
    },
    switchGame(d) {
      const s = liveS(), now = Date.now();
      let game = d.game;
      if (d.next) { const played = s.segments.filter((x) => x.kind === "game").map((x) => x.gameId); const n = s.plannedGames.find((g) => !played.includes(g.gameId)); if (!n) throw fail("No planned game is left."); game = { gameId: n.gameId, title: n.title }; }
      const v = previewVault().find((x) => x.slug === game.gameId); if (!v) throw fail("That game isn't in the Game Vault yet. Add it there first.");
      s.segments.forEach((x) => { if (x.endedAt == null) x.endedAt = now; });
      s.segments.push({ kind: "game", gameId: v.slug, title: v.title, startedAt: now, endedAt: null });
      return { ok: true, game: { gameId: v.slug, title: v.title } };
    },
    liveBeat(d) {
      const s = liveS(), c = ctl(), now = Date.now();
      if (d.action === "backToGame") {
        const last = [...s.segments].reverse().find((x) => x.kind === "game");
        s.segments.forEach((x) => { if (x.endedAt == null) x.endedAt = now; });
        const g = d.game || (last ? { gameId: last.gameId, title: last.title } : null); if (!g) throw fail("Pick a game to go back to.");
        s.segments.push({ kind: "game", gameId: g.gameId, title: g.title, startedAt: now, endedAt: null });
        return { ok: true };
      }
      const k = d.beat as Beat;
      if (d.action === "skip") { s.beats[k] = { startedAt: null, endedAt: null, skipped: true, checkins: 0 }; return { ok: true }; }
      const i = BEATS.indexOf(k);
      if (i < 0) throw fail("That isn't a beat.");
      for (const b of BEATS) { const x = s.beats[b]; if (x && x.startedAt != null && x.endedAt == null) x.endedAt = now; }
      if (k === "end") for (const b of ["break1", "break2"] as Beat[]) if (!s.beats[b]) s.beats[b] = { startedAt: null, endedAt: null, skipped: true, checkins: 0 };
      s.beats[k] = { startedAt: now, endedAt: null, checkins: 0, windowOpenedAt: null };
      if (c.window && !c.window.closedAt) c.window.closedAt = now;
      if (k === "break1" || k === "break2") { s.segments.forEach((x) => { if (x.endedAt == null) x.endedAt = now; }); s.segments.push({ kind: "break", startedAt: now, endedAt: null }); }
      return { ok: true };
    },
    liveCheckInWindow(d) {
      const s = liveS(), c = ctl(), now = Date.now(), st = pv();
      const cur = [...BEATS].reverse().find((k) => s.beats[k]?.startedAt != null && s.beats[k]!.endedAt == null) as Beat;
      if (d.action === "open") {
        if (c.window && !c.window.closedAt && c.window.closesAt > now) throw fail("A check-in is already open.");
        if (s.beats[cur]?.windowOpenedAt) throw fail("That beat already had its check-in. Reopen it instead.");
        const len = d.lengthMinutes || 5, word = raw.words[st.wordUsed++ % raw.words.length];
        c.window = { beat: cur, word, openedAt: now, closesAt: now + len * MIN, lengthMinutes: len };
        s.beats[cur]!.windowOpenedAt = now; for (const it of st.checklist?.[cur] || []) if (it.shortcut === "openCheckin") it.done = true; c.firstIn = { ...c.firstIn, [cur]: raw.firstIn.map((handle) => ({ handle })) };
        st.counts.byBeat[cur] = 0; for (const r of s.rooms) st.counts.byRoom[r] = 0;
        return { ok: true, beat: cur, window: c.window, word };
      }
      const w = c.window; if (!w) throw fail("There is no check-in for that beat.");
      if (d.action === "extend") w.closesAt += MIN;
      else if (d.action === "close") { w.closedAt = now; w.closesAt = Math.min(w.closesAt, now); }
      else if (d.action === "reopen") { if (w.reopened) throw fail("That check-in was already reopened once."); w.reopened = true; w.closedAt = null; w.closesAt = now + 2 * MIN; }
      return { ok: true, beat: w.beat, window: w, word: w.word };
    },
    liveScene(d) { const c = ctl(); c.pinned = d.scene === "auto" || d.scene == null ? null : d.scene; c.brbUntil = c.pinned === "brb" && d.brbMinutes ? Date.now() + d.brbMinutes * MIN : null; return { ok: true, scene: c.pinned || "auto" }; },
    livePlatformStatus(d) {
      const s = stream(d.streamId), mode = new URLSearchParams(location.search).get("pstatus") || "progress";
      const n = (pstatusCalls[d.streamId] = (pstatusCalls[d.streamId] || 0) + 1); (window as any).__lvPstatus = ((window as any).__lvPstatus || 0) + 1;
      const level = mode === "live" ? 3 : mode === "partial" ? 2 : mode === "none" ? 0 : Math.min(3, Math.floor((n - 1) / 2));
      const back = s.type === "backstage", vert = !back && s.rooms.includes("ytVertical");
      return {
        twitch: back || !s.rooms.includes("twitch") ? { live: false } : level >= 1 ? { live: true, viewers: 48 } : { live: false },
        youtube: { eventStatus: s.youtube?.status ?? null, connected: true, live: level >= 2, verticalWanted: vert, verticalActive: vert && level >= 3 },
        tiktok: { planned: !back && s.rooms.includes("tiktok"), on: !back && s.liveRooms.includes("tiktok") }, checkedAt: Date.now(),
      };
    },
    liveRoom(d) {
      ((window as any).__lvRoomCalls ||= []).push({ streamId: d.streamId, on: d.on });
      const s = d.streamId ? stream(d.streamId) : liveS();
      if (s.type === "backstage") throw fail("Backstage streams are on the site only.");
      if (d.room !== "tiktok") throw fail("Only TikTok has a switch.");
      const cur = s.liveRooms.length ? s.liveRooms : s.rooms.filter((r) => r !== "tiktok");
      s.liveRooms = d.on ? ROOMS.filter((r) => r === "tiktok" || cur.includes(r)) : cur.filter((r) => r !== "tiktok");
      if (!d.on && pv().control && pv().live?.id === s.id) { pv().control!.tiktok = null; delete pv().control!.viewers.tiktok; }
      return { ok: true, on: d.on, liveRooms: s.liveRooms };
    },
    liveViewerEntry(d) { const c = ctl(); c.tiktok = { viewers: d.viewers, at: Date.now() }; c.viewers.tiktok = d.viewers; return { ok: true, viewers: d.viewers }; },
    stopStream() {
      const st = pv(), s = liveS(), now = Date.now(), pub = mkPub(st);
      s.state = "ended";
      st.ended = { ...pub, state: "ended", actualEnd: now, beat: null, window: { open: false, closesAt: null, beat: null }, viewers: { total: 0, byPlatform: {} } };
      st.live = null; st.control = null; st.checklist = null;
      return { ok: true, state: "ended", durationMs: now - (s.actualStart || now), peak: pub.peak, checkins: pub.counts.total, checkinsByBeat: pub.counts.byBeat };
    },
    liveAfterShow() {
      const st = pv(), s = liveS(), now = Date.now(), pub = mkPub(st);
      const id = "pv-aftershow", next: LStream = { ...s, id, title: `${s.title}: after-show`, type: "backstage", audience: "fanClub", rooms: [], adhoc: true, state: "live", actualStart: now, beats: { start: { startedAt: now, endedAt: null, checkins: 0, windowOpenedAt: null } }, segments: [], youtube: { status: "ok" } };
      st.ended = { ...pub, state: "ended", actualEnd: now, beat: null, window: { open: false, closesAt: null, beat: null }, viewers: { total: 0, byPlatform: {} } };
      st.live = next; st.counts = { byBeat: {}, byRoom: {} };
      st.control = { window: null, pinned: null, brbUntil: null, firstIn: {}, viewers: {}, peak: 0, yt: { status: "ok" }, twitch: null, tiktok: null };
      st.checklist = copyTemplates(st.templates, "backstage");
      return { ok: true, endedId: s.id, streamId: id, state: "live", type: "backstage" };
    },
    liveChecklist(d) {
      ownerOnly();
      const st = pv();
      if (d.action === "saveTemplates") { for (const k of BEATS) st.templates[k] = (d.templates.beats[k] || []).map((x: any) => ({ ...x })); toast("Preview: nothing saved", { kind: "info" }); return { ok: true }; }
      if (d.action === "tick") { const it = st.checklist?.[d.beat as Beat]?.find((x) => x.id === d.itemId); if (!it) throw fail("That item isn't on the list."); it.done = d.done !== false; return { ok: true }; }
      throw fail("Unknown action.");
    },
    liveObsKey(d) { ownerOnly(); const st = pv(); if (d.revoke) { st.main.obsKeySet = false; st.main.obsKeyAt = Date.now(); return { ok: true, revoked: true }; } st.main.obsKeySet = true; st.main.obsKeyAt = Date.now(); toast("Preview: nothing saved", { kind: "info" }); return { ok: true, key: "preview-obs-key-not-real-0000000000" }; },
    liveDeckKey(d) { ownerOnly(); const st = pv(); if (d.revoke) { st.main.deckKeySet = false; st.main.deckKeyAt = Date.now(); return { ok: true, revoked: true }; } st.main.deckKeySet = true; st.main.deckKeyAt = Date.now(); toast("Preview: nothing saved", { kind: "info" }); return { ok: true, key: "preview-deck-key-not-real-000000000" }; },
    liveSettings(d) { ownerOnly(); if (d.look) pv().main.look = d.look === "crt" ? "crt" : "hull"; toast("Preview: nothing saved", { kind: "info" }); return { ok: true, saved: Object.keys(d) }; },
  };

  return {
    preview: true,
    async read({ role: r, streams }) { const st = pv(); tick(st); return snapshot(st, r, streams); },
    async main() { return { ...pv().main }; },
    async templates(): Promise<Templates | null> { ownerOnly(); countRead("templates"); const t = {} as CBeats; for (const k of BEATS) t[k] = pv().templates[k].map((x) => ({ ...x })); return { beats: t }; },
    async vault() { return previewVault() as unknown as VCard[]; },
    async call(name, data) { const h = handlers[name]; if (!h) throw fail(`The preview doesn't fake ${name}.`); await new Promise((r) => setTimeout(r, 250)); return h(data || {}); },
  };
}
