// The staging-only demo of the stream view (docs/specs/control-room.md §8): /live/obs?demo=1&layout=wide|tall&scene=starting|stats|break|side|brb|ending&look=hull|crt&window=0
// with sample data, no key and no request. Refused on production (obs.ts never calls this there: the page stays blank). Optional &guides=1 draws the
// platforms' phone UI guides on the tall layout, &bg=1 a stand-in for the game picture behind the transparent canvas. The numbers move on their own like a
// real window: check-ins climb, first-ins arrive one by one, and the 5 minute window and the Be right back timer start over when they run out.
import type { ObsView } from "./obs";
import { shape } from "./obs";
import raw from "../../data/preview-live-control.json";

const MIN = 60_000;
const SCENES = ["starting", "stats", "break", "side", "brb", "ending"] as const;
const FIRST = raw.firstIn;

export function runDemo(show: (v: ObsView) => Promise<void>, params: URLSearchParams) {
  const asked = (params.get("scene") || "break").toLowerCase();
  const scene = (SCENES as readonly string[]).includes(asked) ? asked : "break";
  const look = params.get("look") === "crt" ? "crt" : "hull";
  const t0 = Date.now();
  const crew = raw.streams[0].crew as any;
  const chats: ObsView["crew"]["chats"] = {};
  for (const [r, c] of Object.entries<any>(crew.chats)) chats[r] = { lead: c.lead, deckhands: c.deckhands };
  let ci = 40, windowEnd = Date.now() + 5 * MIN - 1000;
  const rooms = { twitch: 20, ytLandscape: 12, ytVertical: 6, tiktok: 2 } as Record<string, number>;

  const view = (): ObsView => {
    const now = Date.now(), ended = scene === "ending";
    if (now > windowEnd) windowEnd = now + 5 * MIN;
    const open = (scene === "break" || scene === "side") && params.get("window") !== "0";   // &window=0: the Break before the window opens
    const started = now - (2 * 3600 + 14 * 60 + 37) * 1000;
    return {
      state: scene === "starting" ? "starting" : ended ? "ended" : "live", look, scene: (scene === "side" ? "break-side" : scene) as ObsView["scene"], streamId: "demo", title: "Monster Monday",
      type: "platform", audience: "public", liveRooms: ["twitch", "ytLandscape", "ytVertical", "tiktok"], actualStart: started, actualEnd: ended ? now - 2 * MIN : null,
      beat: scene === "stats" ? "start" : "break1",
      beats: { start: { status: scene === "stats" ? "now" : "done", checkins: 214 }, break1: { status: scene === "stats" ? "next" : "now", checkins: ci }, break2: { status: "next", checkins: 0 }, end: { status: "next", checkins: 0 } },
      window: { open, closesAt: open ? windowEnd : null, beat: open ? "break1" : null },
      counts: { total: 214 + ci, byBeat: { start: 214, break1: ci }, byRoom: { ...rooms } },
      viewers: { total: 1284, byPlatform: { twitch: 812, ytLandscape: 301, ytVertical: 96, tiktok: 75 } }, peak: 1412,
      game: ended ? null : { gameId: "soul-hunt", title: "Soul Hunt", startedAt: now - 47 * MIN }, nextGame: { gameId: "lethal-night", title: "Lethal Night" },
      crew: { captain: crew.captain, chats, onDuty: [crew.captain] }, chatGame: null,
      brbUntil: scene === "brb" ? now + 2 * MIN + 41_000 - ((now - t0) % (2 * MIN + 41_000)) : null,
      word: open ? "mortuary" : null,
      firstIn: open ? FIRST.slice(0, Math.min(FIRST.length, Math.floor((now - t0) / 2500))) : [],
      plannedStart: scene === "starting" ? now + 5 * MIN - ((now - t0) % (5 * MIN)) : null,
      plannedGames: raw.streams[0].games.map((g) => g.title),
      gameCovers: raw.streams[0].games.map(() => null),
      nextStream: { title: "Granny Gauntlet", start: Date.now() + 26 * 3600_000 },
    };
  };
  const tick = () => {
    if (scene === "break" || scene === "side") {
      const add = ci < 200 ? 1 + Math.floor(Math.random() * 4) : Math.random() < 0.4 ? 1 : 0;
      for (let i = 0; i < add; i++) { const r = Math.random(); rooms[r < 0.6 ? "twitch" : r < 0.85 ? "ytLandscape" : r < 0.93 ? "ytVertical" : "tiktok"]++; }
      ci += add;
    }
    void show(view());
  };
  const guides = params.get("guides") === "1" && shape === "tall";
  if (guides) document.querySelector("[data-obs]")!.insertAdjacentHTML("afterend", `<div class="obs-guides" aria-hidden="true"><i style="right:0;top:600px;width:170px;height:1020px"></i><b style="right:12px;top:560px">buttons</b><i style="left:0;right:0;bottom:0;height:300px"></i><b style="left:30px;bottom:310px">captions, chat</b><i style="left:0;right:0;top:0;height:150px"></i><b style="left:30px;top:158px">top bar</b></div>`);
  tick();
  setInterval(tick, 700);
}
