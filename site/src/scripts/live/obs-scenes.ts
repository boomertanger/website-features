// The stream view's scenes (docs/specs/control-room.md §8; mockup control-room-batch-3.html section 1). The scene engine: given the feed's view it draws the scene
// the feed names (Auto follows the beat, or the owner's Scene card pins one): Starting soon, Live stats, Break (B1 Takeover; B2 Side rail with &break=side on a
// second browser source, the manual scene), Be right back and Ending. Questions and Hot Seat scenes arrive with the live activities.
// Built from the kit's .bt-sv-* parts at canvas pixels (1920 x 1080 wide, 1080 x 1920 tall); text is at least 32 px (live-obs.css); the tall scenes keep clear of the
// platforms' UI: the top bar (y < 150), the buttons down the right (x > 900 between y 600 and 1620) and the captions at the bottom (y > 1620).
// A scene is drawn once per change of scene, beat, window or crew; every number is then set in place (so nothing flickers) and ticks 4 times a second from the
// clock (uptime, countdowns, the ring). The word scrambles and settles; first-ins pop in one by one. Motion is always on and nothing flashes faster than 3 a second.
import { platformIconHtml } from "../../../../shared/ui/crew.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import type { ObsView } from "./obs";

type Shape = "wide" | "tall";
type Scene = "starting" | "stats" | "break" | "side" | "brb" | "ending";
const ROOMS = ["twitch", "ytLandscape", "ytVertical", "tiktok"] as const;
const ROOM_NAME: Record<string, string> = { twitch: "Twitch", ytLandscape: "YouTube", ytVertical: "YouTube vertical", tiktok: "TikTok" };
const ROOM_COLOUR: Record<string, string> = { twitch: "var(--bt-brand-twitch)", ytLandscape: "var(--bt-brand-youtube)", ytVertical: "var(--bt-brand-youtube)", tiktok: "var(--bt-brand-tiktok-edge)" };
const BEAT_NAME: Record<string, string> = { start: "Start", break1: "Break 1", break2: "Break 2", end: "End" };
const pad = (n: number) => String(n).padStart(2, "0");
const hms = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`; };
const ms = (ms0: number) => { const s = Math.max(0, Math.ceil(ms0 / 1000)); return s >= 3600 ? hms(ms0) : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };
const dur = (ms0: number) => { const m = Math.max(0, Math.round(ms0 / 60000)); return m >= 60 ? `${Math.floor(m / 60)}h ${pad(m % 60)}m` : `${m}m`; };
const num = (n: number) => n.toLocaleString("en-US");
const mascot = (cls = "") => { const t = document.getElementById("bt-mascot-tpl") as HTMLTemplateElement | null; const svg = t?.content.firstElementChild?.outerHTML || ""; return cls ? svg.replace('class="', `class="${cls} `) : svg; };

/** Everyone on the crew tonight (public handles): the Captain first, then leads and deckhands, once each. */
function crewOf(v: ObsView): string[] {
  const out: string[] = [];
  const add = (h: string | null | undefined) => { if (h && !out.includes(h)) out.push(h); };
  add(v.crew?.captain);
  for (const c of Object.values(v.crew?.chats || {})) { add(c.lead); (c.deckhands || []).forEach(add); }
  (v.crew?.onDuty || []).forEach(add);
  return out;
}
const liveRooms = (v: ObsView) => ROOMS.filter((r) => (v.liveRooms || []).includes(r));

/** The scene to draw: the feed's (Auto or pinned), the Break as Side rail when the source asked for it, and an Ending once the stream is over. */
export function sceneOf(v: ObsView, p: URLSearchParams): Scene {
  const s = v.scene;
  if (v.state === "ended") return "ending";
  if (v.state === "off" || v.state === "starting") return s === "ending" ? "ending" : "starting";
  if (s === "break-side") return "side";                          // pinned on the Scene card
  if (s === "break" && p.get("break") === "side") return "side";  // or asked for by this source's address (&break=side)
  return s;
}

/* ------------------------------------------------------------------ scene markup */
const head = (text: string) => `<div class="bt-sv-h"><span class="bt-sv-led"></span>${esc(text)}</div>`;
const tickerHtml = (v: ObsView, style = "") => `<div class="bt-sv-ticker" style="${style}"><div><b>BOOMERTANGER.COM</b> · ${crewOf(v).length ? `Crew tonight: ${crewOf(v).map((h) => `<b>@${esc(h)}</b>`).join(", ")} · ` : ""}Check in for XP at <b>boomertanger.com/live</b> · Join free at <b>boomertanger.com</b></div></div>`;
const roomsHtml = (v: ObsView) => `<div class="bt-sv-rooms">${liveRooms(v).map((r) => `<div class="bt-sv-room">${platformIconHtml(r)}<span>${ROOM_NAME[r]}</span><span class="bar"><i data-rb="${r}" style="--c:${ROOM_COLOUR[r]}"></i></span><b data-rc="${r}">0</b></div>`).join("")}</div>`;
const beatsRail = (v: ObsView) => `<div class="bt-sv-beats">${(["start", "break1", "break2", "end"] as const).map((k, i) => {
  const st = v.beats?.[k]?.status, cls = st === "done" ? "is-done" : k === v.beat ? "is-now" : "";
  return `<div class="bt-sv-beat ${cls}"><i>${st === "done" ? "✓" : i + 1}</i>${BEAT_NAME[k]}</div>`;
}).join("")}</div>`;
const wordSize = (w: string, big: number) => (w.length <= 8 ? big : w.length <= 10 ? Math.round(big * 0.8) : Math.round(big * 0.64));
const wordHtml = (v: ObsView, big: number) => `<div class="bt-sv-word bt-sv-amber obs-word" style="font-size:${wordSize(v.word || "", big)}px" data-word>${v.word ? esc(v.word) : ""}</div>`;
const ringCount = (labelled = true) => `<div style="display:flex;align-items:center;gap:40px"><div class="bt-sv-ring" data-ring><span data-cd>0:00</span></div><div class="bt-sv-count bt-sv-amber"><span data-count>0</span>${labelled ? "<small>checked in</small>" : ""}</div></div>`;
const firstHtml = () => `<div class="bt-sv-first" data-first><span class="obs-first-l">First in</span></div>`;
const gameChips = (v: ObsView, max: number) => (v.plannedGames || []).slice(0, max).map((g) => `<span class="obs-chip">${esc(g)}</span>`).join("");
/** The tonight's games with their real Game Vault covers where there are some (a cover that fails to load simply drops out), else just the titles. */
const gamesBlock = (v: ObsView, max: number, small: boolean) => {
  const games = (v.plannedGames || []).slice(0, max), covers = v.gameCovers || [];
  if (!covers.some((c) => c)) return `<div class="obs-chips">${gameChips(v, max)}</div>`;
  return `<div class="obs-covers${small ? " is-small" : ""}">${games.map((g, i) => `<figure>${covers[i] ? `<img src="${esc(covers[i])}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}<figcaption>${esc(g)}</figcaption></figure>`).join("")}</div>`;
};
const CENTRAL = "America/Chicago";
/** "Thu · Monster Monday · 7:00 PM CDT": the next published stream, in the site's own zone (the stream PC's clock is not the audience's). */
const nextLine = (n: { title: string; start: number }) => {
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: CENTRAL, ...o }).format(n.start);
  return `${f({ weekday: "short" })} · ${esc(n.title)} · ${f({ hour: "numeric", minute: "2-digit", timeZoneName: "short" })}`;
};

function startingScene(v: ObsView, wide: boolean) {
  const title = v.title || "Starting soon";
  const games = (v.plannedGames || []);
  const tsz = title.length <= 16 ? (wide ? 120 : 92) : title.length <= 26 ? (wide ? 92 : 72) : (wide ? 72 : 60);
  const when = v.plannedStart ? `<div class="bt-sv-amber obs-count-big" style="font-size:${wide ? 150 : 130}px" data-soon>--:--</div>` : `<div class="obs-count-big bt-sv-amber" style="font-size:72px">Stay tuned</div>`;
  const lead = games.length ? `Tonight: ${games.slice(0, 3).map(esc).join(", then ")}` : "The bridge is waking up";
  const left = `<div class="obs-stack">${head("Starting soon")}<div class="obs-title" style="font-size:${tsz}px">${esc(title)}</div><div class="obs-sub">${lead}</div>${games.length ? gamesBlock(v, wide ? 4 : 3, false) : ""}</div>`;
  const right = `<div class="obs-stack obs-center">${mascot("bt-mascot--aware obs-float")}${when}<div class="bt-sv-url">Check in at <b>boomertanger.com/live</b></div></div>`;
  return wide
    ? `<div class="bt-sv-panel obs-on" style="left:110px;top:100px;width:1700px;height:780px;padding:70px 80px;display:grid;grid-template-columns:1fr 560px;gap:60px">${left}${right}</div>${tickerHtml(v)}`
    : `<div class="bt-sv-panel obs-on" style="left:70px;top:200px;width:780px;height:1300px;padding:60px 50px;display:grid;justify-items:center;align-content:start;gap:34px;text-align:center">${head("Starting soon")}${mascot("bt-mascot--aware obs-float obs-mascot-tall")}<div class="obs-title" style="font-size:${tsz}px">${esc(title)}</div>${when}${games.length ? gamesBlock(v, 3, true) : ""}<div class="bt-sv-url">boomertanger.com/<b>live</b></div></div>${tickerHtml(v, "top:160px;bottom:auto")}`;
}

function statsScene(v: ObsView, wide: boolean) {
  const rooms = liveRooms(v);
  const plat = rooms.map((r) => `<span class="obs-plat">${platformIconHtml(r)}<b data-v="${r}">0</b></span>`).join("");
  const panel = `<div class="obs-stack">${head("Live")}<div class="obs-two"><div><div class="bt-sv-amber obs-num" data-up>0:00:00</div><div class="obs-lab">Uptime</div></div><div><div class="bt-sv-amber obs-num" data-watch>0</div><div class="obs-lab">Watching</div></div></div>${plat ? `<div class="obs-plats">${plat}</div>` : ""}<div class="obs-lab"><span data-game>${esc(v.game?.title || "")}</span>${v.game ? " · " : ""}<b class="obs-w" data-ci>0</b> check-ins tonight</div></div>`;
  return wide
    ? `<div class="bt-sv-panel obs-on" style="right:40px;top:40px;width:680px;padding:36px 40px">${panel}</div><div class="bt-sv-panel obs-on" style="left:40px;bottom:40px;padding:26px 34px">${beatsRail(v)}</div>`
    : `<div class="bt-sv-panel obs-on" style="left:70px;top:190px;width:780px;padding:40px 44px">${panel}</div><div class="bt-sv-panel obs-on" style="left:70px;top:720px;width:780px;padding:26px 34px">${beatsRail(v)}</div>`;
}

function breakScene(v: ObsView, wide: boolean) {
  const open = !!v.word;
  const name = BEAT_NAME[v.window?.beat || v.beat || "break1"] || "Break";
  const title = open ? `${name} · check-in is open` : `${name} · check-in opens soon`;
  const middle = open
    ? `<div class="obs-lab">Type this word at <b class="obs-w">boomertanger.com/live</b></div>${wordHtml(v, wide ? 112 : 96)}${ringCount()}${wide ? roomsHtml(v) : ""}${firstHtml()}`
    : `<div class="obs-sub">Back in a moment. Check in at <b class="obs-w">boomertanger.com/live</b> when the word goes up.</div><div class="bt-sv-count bt-sv-amber"><span data-ci>0</span><small>checked in tonight</small></div>`;
  const panel = `<div class="obs-stack">${head(title)}${middle}</div>`;
  return wide
    ? `<div class="bt-sv-cam" style="left:90px;top:120px;width:880px;height:760px">Your camera</div><div class="bt-sv-panel obs-on" style="left:1040px;top:60px;width:800px;height:960px;padding:50px 60px">${panel}</div><div class="obs-rail" style="left:90px;bottom:40px">${beatsRail(v)}</div>`
    : `<div class="bt-sv-cam" style="left:70px;top:190px;width:780px;height:460px">Your camera</div><div class="bt-sv-panel obs-on" style="left:70px;top:700px;width:780px;padding:44px 48px">${panel}</div>`;
}

function sideScene(v: ObsView, wide: boolean) {
  const open = !!v.word;
  const name = BEAT_NAME[v.window?.beat || v.beat || "break1"] || "Break";
  const body = open
    ? `${head(`${name} · check in`)}<div class="obs-lab">Type it at <b class="obs-w">boomertanger.com/live</b></div>${wordHtml(v, 84)}<div style="display:flex;align-items:center;gap:30px"><div class="bt-sv-ring" data-ring style="width:170px;height:170px"><span data-cd style="font-size:48px">0:00</span></div><div class="bt-sv-count bt-sv-amber" style="font-size:110px"><span data-count>0</span><small>in</small></div></div>${firstHtml()}`
    : `${head(`${name} · check-in opens soon`)}<div class="bt-sv-count bt-sv-amber"><span data-ci>0</span><small>checked in tonight</small></div>`;
  return wide
    ? `<div class="bt-sv-panel obs-on" style="right:40px;top:40px;width:600px;padding:40px"><div class="obs-stack">${body}</div></div>`
    : `<div class="bt-sv-panel obs-on" style="left:70px;top:190px;width:780px;padding:44px 48px"><div class="obs-stack">${body}</div></div>`;
}

function brbScene(v: ObsView, wide: boolean) {
  const style = wide ? "left:300px;top:150px;width:1320px;height:760px" : "left:70px;top:330px;width:780px;height:1150px";
  const next = v.nextGame?.title ? `Up next: ${esc(v.nextGame.title)}` : "Back in a few minutes";
  return `<div class="bt-sv-panel obs-on" style="${style};padding:60px;display:grid;justify-items:center;align-content:center;text-align:center;gap:30px">${mascot("bt-mascot--aware obs-float obs-mascot-brb")}<div class="obs-title" style="font-size:${wide ? 120 : 88}px">BE RIGHT BACK</div>${v.brbUntil ? `<div class="bt-sv-amber obs-count-big" style="font-size:${wide ? 120 : 110}px" data-brb>0:00</div>` : ""}<div class="obs-sub">${next}</div><div class="bt-sv-url">Check in at <b>boomertanger.com/live</b></div></div>`;
}

function endingScene(v: ObsView, wide: boolean) {
  const stats: [string, string][] = [["on air", `<span data-onair>${dur((v.actualEnd || Date.now()) - (v.actualStart || Date.now()))}</span>`], ["check-ins", num(v.counts?.total || 0)], ["peak watching", num(v.peak || 0)]];
  const crew = crewOf(v);
  const style = wide ? "left:160px;top:100px;width:1600px;height:880px" : "left:70px;top:230px;width:780px;height:1300px";
  return `<div class="bt-sv-panel obs-on" style="${style};padding:60px;display:grid;justify-items:center;align-content:center;text-align:center;gap:${wide ? 34 : 40}px"><div class="obs-title" style="font-size:${wide ? 118 : 84}px">THANKS FOR WATCHING</div>
    <div class="obs-stats">${stats.map(([l, val]) => `<div><div class="bt-sv-amber obs-num">${val}</div><div class="obs-lab">${l}</div></div>`).join("")}</div>
    ${crew.length ? `<div class="obs-sub">Crew tonight: ${crew.map((h) => `<b class="obs-w">@${esc(h)}</b>`).join(" · ")}</div>` : ""}
    ${v.nextStream ? `<div class="obs-sub">Next: <b class="obs-w">${nextLine(v.nextStream)}</b></div>` : `<div class="obs-sub">See you next time · <b class="obs-w">boomertanger.com/schedule</b></div>`}${mascot("bt-mascot--aware obs-float obs-mascot-end")}</div>`;
}

/* ------------------------------------------------------------------ the engine */
export function createScenes(host: HTMLElement, shape: Shape, params: URLSearchParams) {
  const wide = shape === "wide";
  let view: ObsView | null = null, key = "", wordShown = "", beatOfFirst = "", scene: Scene = "starting";
  const $ = <T extends HTMLElement>(s: string) => host.querySelector<T>(s);
  const $$ = <T extends HTMLElement>(s: string) => [...host.querySelectorAll<T>(s)];

  function scramble(el: HTMLElement, word: string) {
    if (!word) { el.textContent = ""; return; }
    const abc = "abcdefghijklmnopqrstuvwxyz#%&";
    let n = 0;
    const t = setInterval(() => {
      n++;
      if (!el.isConnected) { clearInterval(t); return; }
      el.textContent = [...word].map((c, i) => (i < n / 2 ? c : abc[Math.floor(Math.random() * abc.length)])).join("");
      if (n / 2 >= word.length) { clearInterval(t); el.textContent = word; }
    }, 80);     // about 12 letter changes a second for a bit over a second, once per word: text churn, never a flash
  }

  function numbers() {
    const v = view;
    if (!v) return;
    const now = Date.now(), set = (el: Element | null, t: string) => { if (el && el.textContent !== t) el.textContent = t; };
    const start = v.actualStart || now;
    $$("[data-up]").forEach((e) => set(e, hms(now - start)));
    $$("[data-onair]").forEach((e) => set(e, dur((v.actualEnd || now) - start)));
    $$("[data-soon]").forEach((e) => { const left = (v.plannedStart || 0) - now; set(e, left > 0 ? ms(left) : "Any moment"); });
    $$("[data-brb]").forEach((e) => set(e, v.brbUntil ? ms(v.brbUntil - now) : ""));
    const closes = v.window?.closesAt || 0, left = Math.max(0, closes - now);
    $$("[data-cd]").forEach((e) => set(e, `${Math.floor(left / 60000)}:${pad(Math.floor((left % 60000) / 1000))}`));
    $$("[data-ring]").forEach((e) => e.style.setProperty("--ring", String(Math.min(1, left / 300000).toFixed(3))));
    const beat = v.window?.beat || v.beat;
    $$("[data-count]").forEach((e) => set(e, num(beat ? v.counts?.byBeat?.[beat] || 0 : 0)));
    $$("[data-ci]").forEach((e) => set(e, num(v.counts?.total || 0)));
    const by = v.viewers?.byPlatform || {};
    $$("[data-watch]").forEach((e) => set(e, num(v.viewers?.total || Object.values(by).reduce((a, b) => a + (b || 0), 0))));
    $$("[data-v]").forEach((e) => set(e, num((by as Record<string, number>)[e.dataset.v || ""] || 0)));
    const rooms = v.counts?.byRoom || {}, max = Math.max(1, ...ROOMS.map((r) => rooms[r] || 0));
    $$("[data-rc]").forEach((e) => set(e, num(rooms[e.dataset.rc || ""] || 0)));
    $$("[data-rb]").forEach((e) => e.style.setProperty("--f", String(Math.min(1, (rooms[e.dataset.rb || ""] || 0) / max).toFixed(3))));
  }

  function words() {
    const v = view!, el = $<HTMLElement>("[data-word]");
    if (!el) return;
    const w = v.word || "";
    if (w !== wordShown) { wordShown = w; scramble(el, w); }
  }
  function first() {
    const v = view!, el = $<HTMLElement>("[data-first]");
    if (!el) return;
    const beat = v.window?.beat || v.beat || "";
    if (beat !== beatOfFirst) { beatOfFirst = beat; el.querySelectorAll("span:not(.obs-first-l)").forEach((s) => s.remove()); }
    const have = new Set([...el.querySelectorAll("span:not(.obs-first-l)")].map((s) => s.textContent));
    for (const h of v.firstIn || []) if (!have.has(`@${h}`)) { const s = document.createElement("span"); s.textContent = `@${h}`; el.append(s); }   // a new one pops in on its own
  }

  function build(id: Scene, v: ObsView) {
    return id === "starting" ? startingScene(v, wide) : id === "stats" ? statsScene(v, wide) : id === "break" ? breakScene(v, wide) : id === "side" ? sideScene(v, wide)
      : id === "brb" ? brbScene(v, wide) : endingScene(v, wide);
  }

  setInterval(() => { numbers(); }, 250);

  return {
    render(v: ObsView) {
      view = v;
      scene = sceneOf(v, params);
      const k = [scene, v.state, v.beat, !!v.word, (v.liveRooms || []).join(), crewOf(v).join(), (v.plannedGames || []).join("|"), (v.gameCovers || []).join("|"), v.nextStream ? `${v.nextStream.title}${v.nextStream.start}` : "", v.title, !!v.brbUntil, !!v.nextGame, v.game?.title].join("~");
      if (k !== key) {
        key = k; wordShown = ""; beatOfFirst = "";
        host.dataset.scene = scene;
        host.innerHTML = (params.get("bg") === "1" && params.get("demo") === "1" ? `<div class="obs-game"></div>` : "") + `<div class="obs-view" data-scene="${scene}">${build(scene, v)}</div>`;
      }
      words(); first(); numbers();
    },
  };
}
