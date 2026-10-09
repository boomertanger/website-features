// /live/control (docs/specs/control-room.md §3, layout A "Cockpit" from docs/design/mockups/control-room-batch-2.html): the owner's and the Overseers'
// controls. This file is the page itself: who is looking, the poll, the redraw, the hero with the look switch, the platforms and readouts, the
// beats, the game and the crew. The parts: stage.ts (the main control: pick, start, check-in), live.ts (live controls), rail.ts (the owner's
// checklist), deck.ts (Stream Deck and stream view keys). Display only: every write is a callable the server checks again.
// Data (api.ts): public/live + the stream doc + private/control + live/main, polled every 5 s while the tab is visible. Preview (non-production,
// signed out, ?as=admin owner / ?as=a2): src/data/preview-live-control.json and a local copy of the callables.
import { crPanelHtml } from "../../../../shared/ui/cr-panel.js";
import { CR_ICON, setLook, crBoot } from "../../../../shared/ui/control-room.js";
import { readoutHtml, readoutsHtml, readoutBarsHtml, setReadout } from "../../../../shared/ui/readout.js";
import { beatsHtml } from "../../../../shared/ui/beats.js";
import { deckplanHtml } from "../../../../shared/ui/deckplan.js";
import { platformIconHtml } from "../../../../shared/ui/crew.js";
import { coverHtml } from "../../../../shared/ui/cover.js";
import { onAccess } from "./layout";
import { makeApi } from "./api";
import { ctx, current } from "./state";
import { BEATS, BEAT_LABEL, ROOMS, ROOM_LABEL, fmtTime, fmtUptime, fmtDur, plural, type Room, type Snapshot, type LStream } from "./model";
import { esc, $, withBusy, toast, messageFor, reduced, mascotHtml } from "./ui";
import { stageHtml, initStage } from "./stage";
import { initLive } from "./live";
import { gamePickerHtml } from "./gamepick";

const POLL_MS = 5000;
const SITE_TILE = `<span class="bt-platform-icon bt-platform-icon--sm bt-platform-icon--site" aria-hidden="true">BT</span>`;
const ICONS = { radar: CR_ICON };

/* ------------------------------------------------------------------ slots: a panel is redrawn only when its markup changed */
function slot(id: string, html: string): HTMLElement | null {
  const el = ctx.root.querySelector<HTMLElement>(`[data-slot="${id}"]`);
  if (!el) return null;
  if (el.dataset.k !== html) { el.dataset.k = html; el.innerHTML = html; el.dataset.fresh = "1"; }
  return el;
}

/* ------------------------------------------------------------------ the hero */
function heroHtml() {
  const s = ctx.snap, pub = s.pub;
  const live = ctx.mode === "live", st = current();
  const title = ctx.mode === "ended" ? ctx.snap.pub?.title || "Control Room" : live ? (pub?.title || st?.title || "Control Room") : st?.title || "Control Room";
  const back = pub?.state === "backstage";
  const tag = live
    ? `<span class="bt-live-tag"><i></i>${back ? "Backstage · " : "Live · "}<span data-up></span></span>`
    : ctx.mode === "ended" ? `<span class="bt-badge bt-badge--lime">Ended</span>`
    : st ? `<span class="bt-badge bt-badge--gold">${esc(new Date(st.start).toDateString() === new Date().toDateString() ? "Today" : new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(new Date(st.start)))} ${esc(fmtTime(st.start))}</span>`
    : `<span class="bt-badge bt-badge--gray">Off air</span>`;
  const look = ctx.main?.look || "hull";
  const lookCtl = ctx.role === "owner"
    ? `<span class="lc-look" id="lc-look-l">House look</span><span class="bt-pills" role="group" aria-labelledby="lc-look-l" data-look-pick><button type="button" data-value="hull" class="${look === "hull" ? "is-on" : ""}" aria-pressed="${look === "hull"}">Hull map</button><button type="button" data-value="crt" class="${look === "crt" ? "is-on" : ""}" aria-pressed="${look === "crt"}">CRT</button></span>`
    : `<span class="lc-look">House look</span><span class="bt-badge bt-badge--gray" data-look-ro>${look === "crt" ? "CRT" : "Hull map"}</span>`;
  const sub = ctx.mode === "live" ? `${esc(BEAT_LABEL[pub?.beat || "start"])} beat${pub?.game ? ` · ${esc(pub.game.title)}` : ""}` : ctx.mode === "ended" ? "The stream has ended." : st ? `${esc(st.type === "backstage" ? "Backstage" : "Platform stream")} · ${esc(plural(st.plannedGames.length, "game"))} planned` : "Nothing is scheduled in the next 12 hours.";
  return `<div class="lc-hero"><span class="lc-radar" aria-hidden="true">${ICONS.radar}</span><div class="lc-hero-main"><div class="lc-hero-row"><h1 class="bt-title lc-title">${esc(title)}</h1>${tag}</div><p class="lc-hero-sub">${sub}</p></div><div class="lc-hero-side">${lookCtl}</div></div>`;
}

/* ------------------------------------------------------------------ platforms and readouts */
const ytText = (s: LStream | null) => {
  if (!s?.youtube) return `<span class="lc-wait">No event yet</span>`;
  if (s.youtube.status === "ok") return `<span class="lc-ok">✓ Event ready</span>`;
  if (s.youtube.status === "pending") return `<span class="lc-wait">Making the event…</span>`;
  return `<span class="lc-bad">Event failed</span> <button type="button" class="bt-link-btn" data-act="yt-retry" data-id="${esc(s.id)}">Retry</button>`;
};
function platCard(chat: Room | "site", name: string, body: string, extra = "") {
  return `<div class="lc-plat" data-plat="${chat}">${chat === "site" ? SITE_TILE : platformIconHtml(chat)}<b>${esc(name)}</b><small>${body}</small>${extra}</div>`;
}
function statusHtml() {
  const live = ctx.mode === "live", st = current(), c = ctx.snap.control, back = st?.type === "backstage";
  const rooms = (st?.rooms || []).filter(() => !back);
  const has = (r: Room) => rooms.includes(r);
  const cards: string[] = [];
  if (!st) cards.push("");
  if (back) {
    cards.push(platCard("ytLandscape", "YouTube (unlisted)", live ? (c?.yt?.status === "ok" ? `<span class="lc-ok">● Live</span>` : c?.yt?.status === "failed" ? `<span class="lc-bad">Not found</span>` : `<span class="lc-wait">Waiting for YouTube…</span>`) : ytText(st)));
    cards.push(platCard("site", "On the site", live ? `<span class="lc-ok">● Live</span> <b data-v="site"></b>` : "Members-only, behind the curtain"));
  } else if (st) {
    if (has("twitch")) cards.push(platCard("twitch", "Twitch", live ? (c?.twitch?.status === "offline" ? `<span class="lc-wait">● Offline</span>` : c?.twitch?.status === "live" ? `<span class="lc-ok">● Live</span> <b data-v="twitch"></b>` : `<span class="lc-wait">Checking…</span>`) : `<span class="lc-wait">Not live yet</span>`));
    if (has("ytLandscape")) cards.push(platCard("ytLandscape", "YouTube", live ? (c?.yt?.waiting?.includes("landscape") ? `<span class="lc-wait">Waiting for YouTube…</span>` : c?.yt?.status === "failed" ? `<span class="lc-bad">Not found</span>` : `<span class="lc-ok">● Live</span> <b data-v="ytLandscape"></b>`) : ytText(st)));
    if (has("ytVertical")) cards.push(platCard("ytVertical", "YouTube vertical", live ? (c?.yt?.waiting?.includes("vertical") ? `<span class="lc-wait">Waiting for YouTube…</span>` : `<span class="lc-ok">● Found</span> <b data-v="ytVertical"></b>`) : "Made by Dual Output at go-live"));
    if (has("tiktok")) cards.push(platCard("tiktok", "TikTok", live
      ? (ctx.tiktokOn ? `<span class="lc-ok">● Live</span> <b data-v="tiktok"></b>` : `<span class="lc-wait">Are you live?</span>`)
      : "Start TikTok LIVE Studio", live ? `<button type="button" class="bt-switch lc-tt" role="switch" aria-checked="${ctx.tiktokOn}" aria-label="Live on TikTok" data-act="tiktok-switch"></button>` : ""));
  }
  const ros = live ? readoutsHtml([
    { key: "up", value: "0:00:00", label: "Uptime" },
    { key: "checkins", value: "0", label: "Check-ins tonight" },
    readoutHtml({ key: "total", wide: true, value: "0", label: back ? "Watching on the site" : `Watching on ${plural(rooms.length, "platform")}`, extraHtml: back ? "" : readoutBarsHtml(rooms.map((r) => ({ chat: r, value: 0, max: 1 }))) }),
    { key: "peak", value: "0", label: "Peak tonight" },
    { key: "game", value: "0m", label: "On this game" },
  ], { cols: 2 }) : "";
  const tag = live ? "" : st ? `<small class="lc-hint">Go live in Streamlabs, then press Start</small>` : "";
  return crPanelHtml({ id: "lc-status", cls: "lc-a-status", title: "Platforms", icon: "watch", tagHtml: tag, bodyHtml: `${ros}<div class="lc-plats">${cards.join("")}</div>${(ctx.hooks.ttForm?.(ctx) as string) ?? ""}` });
}

/** Fills the numbers in place (so they tick and flash instead of being redrawn). */
function applyLive(first: boolean) {
  const pub = ctx.snap.pub, c = ctx.snap.control, s = ctx.snap.live;
  if (ctx.mode !== "live" || !pub || !s) return;
  const by = { ...(pub.viewers.byPlatform || {}), ...(c?.viewers || {}) } as Record<string, number>;
  const total = pub.viewers.total || Object.values(by).reduce((a, b) => a + (b || 0), 0);
  const set = (key: string, v: string | number) => { const el = ctx.root.querySelector(`[data-ro="${key}"]`); if (el) setReadout(el, v, { tick: !first }); };
  set("checkins", pub.counts.total); set("total", total); set("peak", Math.max(pub.peak, c?.peak || 0));
  const bars = ctx.root.querySelectorAll<HTMLElement>(".lc-a-status .bt-readout-bar");
  const max = Math.max(1, ...ROOMS.map((r) => by[r] || 0));
  bars.forEach((b) => { const chat = b.dataset.chat as Room, v = by[chat] || 0; b.querySelector<HTMLElement>("i")?.style.setProperty("--f", (Math.min(1, v / max)).toFixed(3)); const n = b.querySelector("b"); if (n) n.textContent = v.toLocaleString("en-US"); });
  ctx.root.querySelectorAll<HTMLElement>("[data-v]").forEach((el) => { const v = el.dataset.v === "site" ? total : by[el.dataset.v!]; el.textContent = v == null ? "" : v.toLocaleString("en-US"); });
}

/* ------------------------------------------------------------------ beats (the actions are added by live.ts) */
function beatsPanelHtml() {
  const pub = ctx.snap.pub, s = ctx.snap.live, live = ctx.mode === "live";
  const beats: Record<string, { state: string; time: string }> = {};
  for (const k of BEATS) {
    const status = live ? pub?.beats?.[k]?.status || "next" : ctx.mode === "ended" ? pub?.beats?.[k]?.status || "" : "";
    const t = live || ctx.mode === "ended" ? s?.beats[k]?.startedAt : null;
    beats[k] = { state: status === "next" ? "" : status, time: t ? fmtTime(t) : "" };
  }
  const nextKey = live ? BEATS.find((k) => !["now", "done", "skipped"].includes(pub?.beats?.[k]?.status || "")) : "start";
  if (nextKey) beats[nextKey] = { state: live ? "next" : "next", time: "" };
  const open = pub?.window?.open ? pub.window.beat : null;
  const chips = open ? { [open]: "Check-in open" } : {};
  const body = beatsHtml({ beats: beats as any, now: live ? pub?.beat || "" : "", chips, label: "Stream beats" });
  return crPanelHtml({ id: "lc-beats", cls: "lc-a-beats", title: "Beats", icon: "beats", bodyHtml: `${body}<div class="lc-beat-acts">${(ctx.hooks.beatActs?.(ctx) as string) ?? ""}</div>` });
}

/* ------------------------------------------------------------------ game (switching is added by live.ts) */
function gamePanelHtml() {
  const pub = ctx.snap.pub, st = current(), live = ctx.mode === "live";
  const planned = st?.plannedGames || [];
  const now = live ? pub?.game : null;
  const first = planned[0];
  const nowGame = now ? { gameId: now.gameId, title: now.title } : !live && first ? { gameId: first.gameId, title: first.title } : null;
  const cover = (id: string, title: string) => coverHtml(ctx.vault.get(id)?.cover ?? null, { alt: title, cls: "bt-cover--sm" });
  const played = new Set((st?.segments || []).filter((x) => x.kind === "game").map((x) => x.gameId));
  const upNext = planned.filter((g) => g.gameId !== nowGame?.gameId && !played.has(g.gameId));
  const nowHtml = nowGame
    ? `<div class="lc-game-now">${cover(nowGame.gameId, nowGame.title)}<div><small>${live ? "Playing now" : "First up"}</small><h3 class="lc-game-t">${esc(nowGame.title)}</h3><small>${live ? `<b data-gm class="lc-game-min"></b> on this game` : "Opens its segment when you press Start"}</small></div></div>`
    : `<div class="lc-empty">${live ? "No game is playing: this is a break." : "No game is planned yet."}</div>`;
  const list = upNext.length ? `<div class="lc-game-list"><span class="bt-label">Up next tonight</span>${upNext.map((g) => `<div class="lc-game-row">${cover(g.gameId, g.title)}<div><b>${esc(g.title)}</b><small>Planned</small></div>${live ? `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-act="switch-game" data-id="${esc(g.gameId)}" data-title="${esc(g.title)}">Switch</button>` : ""}</div>`).join("")}</div>` : "";
  return crPanelHtml({ id: "lc-game", cls: "lc-a-game", title: "Game", icon: "game", bodyHtml: `${nowHtml}${list}${live ? gamePickerHtml("switch", { placeholder: "Switch to another game", label: "Search the Game Vault" }) : ""}` });
}

/* ------------------------------------------------------------------ crew on duty */
function crewPanelHtml() {
  const st = current();
  const people = (list: (string | null)[], role: string) => list.filter(Boolean).map((h) => ({ name: `@${h}`, role }));
  const bridge = { name: "Bridge", people: st?.crew.captain ? [{ name: `@${st.crew.captain}`, role: "Stream Captain" }] : [] };
  const rooms = (st?.type === "backstage" ? [] : st?.rooms || []) as Room[];
  const bays = rooms.map((r) => {
    const c = st!.crew.chats[r];
    const ppl = [...people([c?.lead ?? null], `${ROOM_LABEL[r]} lead`), ...people(c?.deckhands || [], "Deckhand")];
    return { name: ROOM_LABEL[r], iconHtml: platformIconHtml(r), people: ppl, open: !c?.lead, need: "Needs a lead" };
  });
  const body = st
    ? deckplanHtml({ bridge, bays: bays as any })
    : `<div class="lc-empty">${mascotHtml()}<p>Crew shows up here once a stream is picked.</p></div>`;
  return crPanelHtml({ id: "lc-crew", cls: "lc-a-crew", title: "Crew on duty", icon: "crew", tagHtml: `<span class="lc-soon-tag">Mod Deck: soon</span>`, bodyHtml: body });
}

/* ------------------------------------------------------------------ the page */
function grid() {
  const owner = ctx.role === "owner";
  return `<div class="lc-grid" data-owner="${owner ? 1 : 0}">`
    + (owner ? `<div class="lc-a-list" data-slot="rail"></div>` : "")
    + `<div class="lc-a-status" data-slot="status"></div><div class="lc-a-beats" data-slot="beats"></div><div class="lc-a-stage" data-slot="stage"></div><div class="lc-a-scene" data-slot="scene"></div>`
    + `<div class="lc-a-launch" data-slot="launch"></div><div class="lc-a-game" data-slot="game"></div><div class="lc-a-crew" data-slot="crew"></div>`
    + (owner ? `<div class="lc-a-deck" data-slot="deck"></div>` : "")
    + `</div>`;
}

let lastMode = "";
function render() {
  const root = ctx.root;
  const m = ctx.snap.pub?.state;
  document.body.dataset.live = m === "live" ? "public" : m === "backstage" ? "backstage" : "off";
  root.dataset.state = ctx.mode;
  root.dataset.live = document.body.dataset.live;
  if (lastMode !== ctx.mode) {
    const wasMode = lastMode; lastMode = ctx.mode;
    root.querySelector<HTMLElement>("[data-lc-body]")!.innerHTML = ctx.mode === "ended" ? `<div data-slot="wrap"></div>` : grid();
    if (wasMode && !reduced()) crBoot(root);
  }
  slot("hero", heroHtml());
  if (ctx.mode === "ended") { slot("banners", ""); slot("wrap", (ctx.hooks.wrapHtml?.(ctx) as string) ?? ""); ctx.after.forEach((f) => f(ctx)); return; }
  slot("status", statusHtml());
  slot("beats", beatsPanelHtml());
  slot("game", gamePanelHtml());
  slot("crew", crewPanelHtml());
  slot("stage", stageHtml(ctx));
  slot("scene", (ctx.hooks.sceneHtml?.(ctx) as string) ?? "");
  slot("launch", (ctx.hooks.launchHtml?.(ctx) as string) ?? "");
  slot("banners", (ctx.hooks.bannersHtml?.(ctx) as string) ?? "");
  ctx.after.forEach((f) => f(ctx));
  const fresh = root.querySelector<HTMLElement>(".lc-a-status[data-fresh]");
  applyLive(!!fresh);
  root.querySelectorAll<HTMLElement>("[data-fresh]").forEach((e) => delete e.dataset.fresh);
  tickTimers();
}

/* ------------------------------------------------------------------ timers: uptime, game minutes, and the redraw when a window runs out */
function tickTimers() {
  const now = Date.now(), s = ctx.snap.live, pub = ctx.snap.pub;
  if (ctx.mode === "live" && s?.actualStart) {
    const t = fmtUptime(now - s.actualStart);
    ctx.root.querySelectorAll<HTMLElement>("[data-up]").forEach((el) => { if (el.textContent !== t) el.textContent = t; });
    const ro = ctx.root.querySelector('[data-ro="up"]'); if (ro) setReadout(ro, t, { tick: false });
    const g = pub?.game; const gm = g ? fmtDur(now - g.startedAt) : "0m";
    ctx.root.querySelectorAll<HTMLElement>("[data-gm]").forEach((el) => { el.textContent = gm; });
    const gro = ctx.root.querySelector('[data-ro="game"]'); if (gro) setReadout(gro, gm, { tick: false });
  }
  ctx.hooks.tick?.(now);
}

/* ------------------------------------------------------------------ polling */
let timer = 0, polls = 0, inflight = false;
const livePub = (s: Snapshot | undefined) => !!s?.pub && (s.pub.state === "live" || s.pub.state === "backstage");
async function refresh() {
  if (inflight) return;
  inflight = true;
  try {
    const wantList = !livePub(ctx.snap) && (polls % 2 === 0 || !ctx.snap.streams.length);
    const next = await ctx.api.read({ role: ctx.role, streams: wantList || !ctx.snap.pub });
    polls++;
    const prev = ctx.snap;
    ctx.snap = { ...next, streams: next.streams.length || wantList ? next.streams : prev.streams, main: ctx.main };
    if (!wantList && !livePub(next)) ctx.snap.live = null;
    derive();
    ctx.render();
  } catch (err) { console.error("control: couldn't read", err); }
  finally { inflight = false; }
}
function derive() {
  const s = ctx.snap, now = Date.now();
  const liveNow = livePub(s) && !!s.live;
  if (liveNow) { ctx.mode = "live"; ctx.wrap = ctx.wrap; }
  else if (s.pub?.state === "ended" && !ctx.wrapDismissed && (ctx.wrap || now - (s.pub.actualEnd || 0) < 2 * 3600000)) ctx.mode = "ended";
  else ctx.mode = "idle";
  ctx.todays = s.streams.filter((x) => Math.abs(x.start - now) <= 12 * 3600000).sort((a, b) => a.start - b.start);
  if (!ctx.todays.some((x) => x.id === ctx.pickedId)) ctx.pickedId = ctx.todays[0]?.id || null;
}
function schedule() {
  clearTimeout(timer);
  if (document.hidden) return;
  timer = window.setTimeout(async () => { await refresh(); schedule(); }, POLL_MS);
}

/* ------------------------------------------------------------------ boot */
function chrome(root: HTMLElement) {
  root.innerHTML = `<div data-slot="hero"></div><div class="lc-banners" data-slot="banners" aria-live="polite"></div><div data-lc-body></div>`;
}

async function look(value: "hull" | "crt", btn: HTMLElement) {
  if (ctx.role !== "owner" || value === (ctx.main?.look || "hull")) return;
  const group = btn.closest(".bt-pills")!;
  group.querySelectorAll("button").forEach((b) => { b.classList.toggle("is-on", b === btn); b.setAttribute("aria-pressed", String(b === btn)); });
  try {
    await ctx.api.call("liveSettings", { look: value });
    if (ctx.main) ctx.main.look = value;
    setLook(ctx.root, value);
    crBoot(ctx.root);
    toast(`${value === "crt" ? "CRT" : "Hull map"} look is on for the whole site.`);
  } catch (err) {
    toast(messageFor(err), { kind: "error" });
    const was = ctx.main?.look || "hull";
    group.querySelectorAll("button").forEach((b) => { b.classList.toggle("is-on", (b as HTMLElement).dataset.value === was); b.setAttribute("aria-pressed", String((b as HTMLElement).dataset.value === was)); });
  }
}

onAccess(async (s, role) => {
  const root = $("[data-lc]");
  ctx.root = root; ctx.role = role; ctx.uid = s.user?.uid || "preview";
  ctx.api = await makeApi(s);
  ctx.acts = ctx.acts || {}; ctx.hooks = ctx.hooks || {}; ctx.after = ctx.after || [];
  ctx.render = render; ctx.refresh = refresh;
  ctx.wrapDismissed = false; ctx.vault = new Map(); ctx.tiktokOn = false; ctx.wrap = null; ctx.todays = []; ctx.pickedId = null;
  ctx.snap = { pub: null, streams: [], live: null, control: null, main: null, checklist: null };
  root.dataset.owner = role === "owner" ? "1" : "0";
  chrome(root);
  const q = new URLSearchParams(location.search);
  try { ctx.main = await ctx.api.main(); } catch { ctx.main = null; }
  const l = !(ctx.api.preview) ? ctx.main?.look : q.get("look") === "crt" ? "crt" : ctx.main?.look;
  setLook(root, l || "hull");
  if (ctx.main && l) ctx.main.look = l === "crt" ? "crt" : "hull";
  initStage(ctx);
  initLive(ctx);
  root.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-act], [data-look-pick] button");
    if (!t || !root.contains(t)) return;
    if (t.matches("[data-look-pick] button")) { void look(t.dataset.value as "hull" | "crt", t); return; }
    const fn = ctx.acts[t.dataset.act!];
    if (fn) { e.preventDefault(); void fn(t, e); }
  });
  ctx.acts["yt-retry"] = async (btn) => {
    await withBusy(btn as HTMLButtonElement, "Retrying…", async () => {
      try { await ctx.api.call("youtubeRetry", { streamId: btn.dataset.id }); toast("Retrying the YouTube event. It updates here when it's done."); await ctx.refresh(); }
      catch (err) { toast(messageFor(err), { kind: "error" }); }
    });
  };
  ctx.acts["tiktok-switch"] = (btn) => { ctx.tiktokOn = btn.getAttribute("aria-checked") !== "true"; ctx.render(); };
  void ctx.api.vault().then((g) => { ctx.vault = new Map(g.map((x) => [x.slug, x])); ctx.render(); }, () => {});
  await refresh();
  setInterval(tickTimers, 1000);
  schedule();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { void refresh().then(schedule); } else clearTimeout(timer); });
});
