// The Bridge on /live (docs/specs/control-room.md §7a to §7b, §11; mockup control-room-batch-1.html, layout 1 "Bridge"; design-system.md §8p): live, Break
// (a check-in window is open) and backstage. A tool page built for speed: the video in a ship's viewport with a console column beside it (live readouts,
// the check-in, crew on duty, Watch on), the beat rail under the viewport, Now playing and the Play panel. On phones one column in this order:
// video, beats, check-in, Play, Now playing, crew, readouts, Watch on (CSS `order` on the panels' wrappers, live-public.css).
//
// Panels are patched in place: each has a key, and its markup is redrawn only when the key changes, so a word being typed is never wiped by a counter
// that ticked. Numbers (uptime, check-ins, viewers, time on this game) are set in place with setReadout and tick every second.
// Video: public streams get the Twitch player (parent = the current host, no muted autoplay, a play button); backstage gets the unlisted YouTube
// embed with its chat beside it, through backstageWatch (audience only; the video id lives in this closure, never in the page's markup beyond the
// iframe, never stored or logged); everyone else gets the velvet curtain with Join free.
import { beatsHtml } from "../../../../shared/ui/beats.js";
import { coverHtml } from "../../../../shared/ui/cover.js";
import { crPanelHtml, crViewportHtml } from "../../../../shared/ui/cr-panel.js";
import { platformIconHtml } from "../../../../shared/ui/crew.js";
import { deckplanHtml } from "../../../../shared/ui/deckplan.js";
import { readoutBarsHtml, readoutHtml, readoutsHtml, setReadout } from "../../../../shared/ui/readout.js";
import { velvetHtml } from "../../../../shared/ui/scream-planner.js";
import { burst } from "../../../../shared/ui/burst.js";
import site from "../../data/site.json";
import { BEATS, BEAT_LABEL, plural, type Beat } from "./model";
import type { Presence, Room } from "./pub-data";
import { checkinHtml, clock, esc, fmtDuration, fmtHms, initCheckin, mascotHtml, reduced, setCheckinCount, type CheckinOutcome, type PubCtx, type ViewPart } from "./pub-ui";
import { corridorSvg } from "./pub-ui";
import { messageFor } from "./ui";
import { reasonOf } from "../../lib/errors";

const PLATFORM_ROOMS = ["twitch", "ytLandscape", "ytVertical", "tiktok"] as const;
const SOCIAL: Record<string, string> = { twitch: "twitch", ytLandscape: "youtube", ytVertical: "youtube", tiktok: "tiktok" };
const ROOM_NAME: Record<string, string> = { twitch: "Twitch", ytLandscape: "YouTube", ytVertical: "YouTube Vertical", tiktok: "TikTok" };
const ALIASES: Record<string, string> = { twitch: "twitch", tiktok: "tiktok", site: "site", ytlandscape: "ytLandscape", ytvertical: "ytVertical", youtube: "ytLandscape", ytv: "ytVertical" };
const ROOM_KEY = "lp-room";

let box: HTMLElement;
let cur: PubCtx;
let keys: Record<string, string> = {};
let timer = 0;
let presence: Presence | null = null;
let presenceFor = "";
let played = false;                 // the Twitch play button was pressed
let backstage: { state: "idle" | "loading" | "ok" | "denied" | "error"; videoId?: string; message?: string; for?: string } = { state: "idle" };

const panel = (n: string) => box.querySelector<HTMLElement>(`[data-p="${n}"]`)!;
function patch(name: string, key: string, html: () => string, after?: (el: HTMLElement) => void) {
  if (keys[name] === key) return;
  keys[name] = key;
  const el = panel(name);
  el.innerHTML = html();
  after?.(el);
}

/** The rooms live now (a platform stream), in the page's order. The backstage stream is always "site". */
const roomsOf = (c: PubCtx): Room[] => (c.pub.state === "backstage" ? ["site"] : PLATFORM_ROOMS.filter((r) => (c.pub.liveRooms || []).includes(r)) as Room[]);
const isBackstage = (c: PubCtx) => c.pub.state === "backstage";
const scoreHtml = (s: number | null | undefined) => (s == null ? `<span class="bt-score-none">Not rated</span>` : `<span class="bt-score"><b>${esc(s)}</b><small>/10</small></span>`);

/* ------------------------------------------------------------------ video */
function twitchSrc(autoplay: boolean) {
  const q = new URLSearchParams({ channel: site.twitchChannel, parent: location.hostname, muted: "false", autoplay: String(autoplay) });
  return `https://player.twitch.tv/?${q}`;
}
function ytSrc(id: string) { return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0&modestbranding=1`; }
function ytChatSrc(id: string) { return `https://www.youtube.com/live_chat?v=${encodeURIComponent(id)}&embed_domain=${encodeURIComponent(location.hostname)}`; }

const beacon = (bs: boolean) => bs
  ? `<span class="bt-beacon bt-beacon--backstage lp-beacon"><span class="bt-beacon-dot"></span>Backstage</span>`
  : `<span class="bt-beacon bt-beacon--public lp-beacon"><span class="bt-beacon-dot"></span>Live</span>`;

function gateHtml(c: PubCtx, msg = "") {
  const who = c.pub.audience === "subClub" ? "Sub Club" : "Fan Club";
  return `<span class="lp-curtain is-l" aria-hidden="true"></span><span class="lp-curtain is-r" aria-hidden="true"></span>
    <div class="lp-gate"><div class="lp-gate-in">${mascotHtml()}${velvetHtml(`Backstage · ${who}`)}<strong>The after-show is on</strong>
    <p>${esc(msg || (who === "Fan Club" ? "Fan Club members are watching right now. Joining is free and takes a minute." : "This show is for Sub Club members."))}</p>
    ${c.member ? "" : `<button type="button" class="bt-btn bt-btn--primary" data-signin="join" data-signin-title="Join to watch backstage">Join free to watch</button><button type="button" class="bt-link-btn" data-signin="signin">I have an account</button>`}</div></div>`;
}

function videoHtml(c: PubCtx): string {
  const bs = isBackstage(c);
  let inner: string;
  if (!bs) {
    inner = played && !c.api.preview
      ? `<iframe class="lp-embed" src="${esc(twitchSrc(true))}" title="Live on Twitch" allow="autoplay; fullscreen" allowfullscreen></iframe>`
      : `${corridorSvg("lp-vid")}${beacon(false)}<span class="lp-screen-tag">${c.api.preview && played ? "Twitch player (preview)" : "Twitch player"}</span>${played ? "" : `<button type="button" class="lp-play" data-lp-play aria-label="Play the stream"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4l14 8-14 8z"/></svg></button>`}`;
  } else if (!c.member || backstage.state === "denied") {
    inner = `${corridorSvg("lp-vid")}${gateHtml(c, backstage.state === "denied" ? backstage.message : "")}`;
  } else if (backstage.state === "ok" && backstage.videoId) {
    inner = c.api.preview
      ? `${corridorSvg("lp-vid")}${beacon(true)}<span class="lp-screen-tag">YouTube · unlisted · members (preview)</span>`
      : `<iframe class="lp-embed" src="${esc(ytSrc(backstage.videoId))}" title="Backstage video" allow="fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  } else if (backstage.state === "error") {
    inner = `${corridorSvg("lp-vid")}<div class="lp-gate"><div class="lp-gate-in">${mascotHtml()}<strong>The video isn't ready yet</strong><p>${esc(backstage.message || "Give it a moment.")}</p><button type="button" class="bt-btn bt-btn--secondary" data-lp-retry>Try again</button></div></div>`;
  } else {
    inner = `${corridorSvg("lp-vid")}<span class="lp-screen-tag">Opening the backstage video…</span>`;
  }
  const viewport = crViewportHtml({ innerHtml: inner, label: bs ? "Backstage video" : "Live video" });
  const chat = bs && c.member && backstage.state === "ok" && backstage.videoId && !c.api.preview
    ? `<iframe class="lp-ytchat" src="${esc(ytChatSrc(backstage.videoId))}" title="YouTube chat" referrerpolicy="strict-origin-when-cross-origin"></iframe>`
    : bs && c.member && backstage.state === "ok" && c.api.preview ? `<div class="lp-ytchat lp-ytchat--stub"><i>YouTube chat</i><p><b>cryptkeeper</b> the hallway noise</p><p><b>nightowl</b> welcome backstage everyone</p></div>` : "";
  const foot = `<div class="lp-vfoot"><span>Uptime <b data-up>0:00:00</b></span><span aria-hidden="true">·</span><span><b data-total>0</b> watching</span></div>`;
  return `<div class="lp-vbox${chat ? " has-chat" : ""}">${viewport}${chat}</div>${foot}`;
}

function drawVideo(c: PubCtx) {
  const bs = isBackstage(c);
  const key = `${bs}|${c.pub.streamId}|${c.member}|${played}|${backstage.state}|${c.api.preview}`;
  patch("video", key, () => videoHtml(c));
}

async function loadBackstage(c: PubCtx, force = false) {
  const id = c.pub.streamId || "";
  if (!isBackstage(c) || !c.member || !id) { if (backstage.state !== "idle" && (!c.member || !isBackstage(c))) backstage = { state: "idle" }; return; }
  if (!force && backstage.for === id && backstage.state !== "idle") return;
  backstage = { state: "loading", for: id };
  drawVideo(c);
  try { backstage = { state: "ok", videoId: (await c.api.backstage(id)).videoId, for: id }; }
  catch (err) {
    const denied = reasonOf(err) === "audience" || (err as any)?.code === "functions/permission-denied";
    backstage = { state: denied ? "denied" : "error", message: messageFor(err, "Try again in a moment."), for: id };
  }
  drawVideo(cur);
}

/* ------------------------------------------------------------------ readouts */
function drawReadouts(c: PubCtx) {
  const bs = isBackstage(c), rooms = roomsOf(c).filter((r) => r !== "site");
  patch("readouts", `${bs}|${rooms.join()}`, () => crPanelHtml({
    id: "lp-readouts", title: "Live readouts", icon: "stats",
    bodyHtml: readoutsHtml([
      { key: "up", value: "0:00:00", label: "Uptime" },
      { key: "checkins", value: "0", label: "Check-ins tonight" },
      readoutHtml({ key: "total", wide: true, value: "0", label: bs ? "Watching backstage" : `Watching on ${plural(rooms.length || 1, "platform")}`, extraHtml: bs ? "" : readoutBarsHtml(rooms.map((r) => ({ chat: r, value: 0, max: 1 }))) }),
      { key: "peak", value: "0", label: "Peak tonight" },
      { key: "game", value: "0m", label: bs ? "After-show so far" : "On this game" },
    ], { cols: 2 }),
  }));
}

let firstNumbers = true;
function applyNumbers(c: PubCtx) {
  const p = c.pub, now = Date.now();
  const by = (p.viewers.byPlatform || {}) as Record<string, number>;
  const total = p.viewers.total || Object.values(by).reduce((a, b) => a + (b || 0), 0);
  const set = (k: string, v: string | number, tick = true) => { const el = box.querySelector(`[data-ro="${k}"]`); if (el) setReadout(el, v, { tick: tick && !firstNumbers }); };
  const start = p.actualStart || now;
  set("up", fmtHms(now - start), false);
  set("checkins", p.counts.total); set("total", total); set("peak", Math.max(p.peak, total));
  set("game", fmtDuration(now - (isBackstage(c) ? start : p.game?.startedAt || start)), false);
  const max = Math.max(1, ...PLATFORM_ROOMS.map((r) => by[r] || 0));
  box.querySelectorAll<HTMLElement>(".bt-readout-bar").forEach((b) => {
    const v = by[b.dataset.chat === "ytLandscape" ? "ytLandscape" : b.dataset.chat || ""] || 0;
    b.querySelector<HTMLElement>("i")?.style.setProperty("--f", Math.min(1, v / max).toFixed(3));
    const n = b.querySelector("b"); if (n) n.textContent = v.toLocaleString("en-US");
  });
  box.querySelectorAll<HTMLElement>("[data-up]").forEach((e) => { const t = fmtHms(now - start); if (e.textContent !== t) e.textContent = t; });
  box.querySelectorAll<HTMLElement>("[data-total]").forEach((e) => { const t = total.toLocaleString("en-US"); if (e.textContent !== t) e.textContent = t; });
  box.querySelectorAll<HTMLElement>("[data-v]").forEach((e) => { const v = by[e.dataset.v || ""]; e.textContent = v == null ? "" : v.toLocaleString("en-US"); });
  const beat = p.window.beat || p.beat;
  if (beat) box.querySelectorAll(".bt-checkin").forEach((el) => setCheckinCount(el, p.counts.byBeat?.[beat] || 0));
  firstNumbers = false;
}

/* ------------------------------------------------------------------ beat rail */
function drawRail(c: PubCtx) {
  const p = c.pub, s = c.stream;
  const open = p.window.open && p.window.beat ? p.window.beat : null;
  const nextKey = BEATS.find((k) => !["now", "done", "skipped"].includes(p.beats[k]?.status || ""));
  const key = `${p.beat}|${BEATS.map((k) => p.beats[k]?.status).join()}|${open}|${BEATS.map((k) => s?.beats[k]?.startedAt || 0).join()}`;
  patch("rail", key, () => {
    const beats: Record<string, { state: string; time: string }> = {};
    for (const k of BEATS) {
      const st = p.beats[k]?.status || "next", t = s?.beats[k]?.startedAt;
      beats[k] = { state: k === nextKey ? "next" : st === "next" ? "" : st, time: t ? clock(t) : "" };
    }
    return crPanelHtml({ id: "lp-rail", title: "Where the stream is", icon: "beats", bodyHtml: beatsHtml({ beats, now: p.beat || "", chips: open ? { [open]: "Check-in open" } : {}, label: "Stream beats" }) });
  });
}

/* ------------------------------------------------------------------ check-in */
const defaultRoom = (rooms: Room[]): string => {
  const link = ALIASES[(new URLSearchParams(location.search).get("room") || "").toLowerCase()];
  if (link && rooms.includes(link as Room)) return link;
  try { const saved = localStorage.getItem(ROOM_KEY); if (saved && rooms.includes(saved as Room)) return saved; } catch { /* private mode */ }
  return rooms.length === 1 ? rooms[0] : "";
};

function drawCheckin(c: PubCtx) {
  const p = c.pub, now = Date.now();
  const w = p.window, open = w.open && !!w.closesAt && w.closesAt > now;
  const beat = (w.beat || p.beat || "start") as Beat;
  const rooms = roomsOf(c);
  const done = !!presence?.beats[beat];
  const locked = (presence?.wrongTries[beat] || 0) >= 5;
  const nextKey = BEATS.find((k) => p.beats[k]?.status === "next");
  let state: string;
  if (!c.member) state = open ? "visitor" : "closed";
  else if (open) state = done ? "success" : locked ? "locked" : "entry";
  else state = "closed";
  const stamps = Object.fromEntries(BEATS.map((k) => [k, !!presence?.beats[k]]));
  const key = `${state}|${beat}|${open ? w.closesAt : 0}|${rooms.join()}|${Object.keys(presence?.beats || {}).join()}|${isBackstage(c)}`;
  if (keys.checkin === "__adopt") { keys.checkin = key; return; }   // a check-in just succeeded: the kit already shows it
  patch("checkin", key, () => {
    const closedTitle = c.member && done && !open ? `You checked in for ${BEAT_LABEL[beat]}` : nextKey ? `Next check-in: ${BEAT_LABEL[nextKey]}` : "Check-in is closed";
    const closedText = c.member && done && !open ? "Nice. The next window opens at the next beat." : isBackstage(c) ? "Opens when Boomer calls it. It counts toward tonight's stream like any other beat." : "When Boomer opens it, listen for the word on stream and type it here. Each beat you check in to earns 10 XP.";
    return checkinHtml({
      id: "lp-ci", state: state === "success" ? "success" : state, beat, closesAt: open ? w.closesAt : 0, count: p.counts.byBeat?.[beat] || 0, rooms: rooms.length ? rooms : undefined,
      room: defaultRoom(rooms), stamps, title: state === "closed" ? closedTitle : undefined, text: state === "closed" ? closedText : undefined, xp: 10,
      streak: "stream streak safe tonight", wordLabel: "The word from the stream",
    });
  }, (el) => {
    if (!c.member) el.querySelector(".bt-checkin-stamps")?.remove();
    const card = el.querySelector<HTMLElement>(".bt-checkin");
    if (card) initCheckin(el, { onSubmit: (word, room) => submit(c, word, room, card) });
    if (state === "success") el.querySelector(".bt-checkin-stamp.is-got")?.classList.remove("is-new");
  });
}

async function submit(c: PubCtx, word: string, room: string | null, card: HTMLElement): Promise<CheckinOutcome> {
  const bs = isBackstage(c);
  if (!bs && !room) return { error: "Pick where you're watching." };
  const r = await c.api.checkIn(word, bs ? "site" : (room as Room));
  if ("ok" in r && r.ok) {
    if (room) { try { localStorage.setItem(ROOM_KEY, room); } catch { /* private mode */ } }
    const beat = (r.beat || c.pub.window.beat || c.pub.beat) as Beat;
    presence = { beats: { ...(presence?.beats || {}), [beat]: { room: room || "site" } }, wrongTries: presence?.wrongTries || {} };
    // The kit shows the success state itself (and slams the stamp); the key is updated so the next update doesn't redraw over it.
    keys.checkin = "__adopt";
    const stamp = () => { const st = card.querySelector<HTMLElement>(".bt-checkin-stamp.is-new"); if (st && !reduced()) burst(st, { n: 18 }); };
    setTimeout(stamp, 50);
    return { ok: true, xp: r.already ? 0 : r.xp ?? 10, streak: r.already ? "already checked in" : "stream streak safe tonight" };
  }
  if ("locked" in r) { presence = { beats: presence?.beats || {}, wrongTries: { ...(presence?.wrongTries || {}), [c.pub.window.beat || c.pub.beat || "start"]: 5 } }; keys.checkin = ""; return r; }
  return r;
}

/* ------------------------------------------------------------------ now playing */
function drawNow(c: PubCtx) {
  const p = c.pub, bs = isBackstage(c);
  const playedIds = new Set((c.stream?.segments || []).filter((s) => s.kind === "game").map((s) => s.gameId));
  const nowId = p.game?.gameId;
  const upNext = (c.stream?.plannedGames || []).filter((g) => g.gameId !== nowId && !playedIds.has(g.gameId)).slice(0, 3);
  if (!upNext.length && p.nextGame && p.nextGame.gameId !== nowId) upNext.push({ gameId: p.nextGame.gameId, title: p.nextGame.title || p.nextGame.gameId, order: 0 });
  const key = `${bs}|${nowId}|${upNext.map((g) => g.gameId).join()}|${c.vault.size}`;
  patch("now", key, () => {
    const cover = (id: string | undefined, t: string, cls = "") => coverHtml(id ? c.vault.get(id)?.cover ?? null : null, { alt: t, cls });
    const next = upNext.length ? `<div class="lp-next"><span class="bt-label">Up next tonight</span>${upNext.map((g) => `<div class="lp-next-row">${cover(g.gameId, g.title, "bt-cover--sm")}<div><b>${esc(g.title)}</b><small>Planned</small></div></div>`).join("")}</div>` : "";
    if (bs) return crPanelHtml({ id: "lp-now", title: "Now", icon: "now", bodyHtml: `<div class="lp-now-row"><span class="bt-cover bt-cover--sm lp-mascot-tile">${mascotHtml()}</span><div><h3>Just chatting</h3><span class="bt-velvet">After-show</span></div></div>` });
    if (!p.game) return crPanelHtml({ id: "lp-now", title: "Now playing", icon: "now", bodyHtml: `<div class="lp-now-row"><span class="bt-cover bt-cover--sm lp-mascot-tile">${mascotHtml()}</span><div><h3>On a break</h3><small>Boomer will be right back.</small></div></div>${next}` });
    const v = c.vault.get(p.game.gameId);
    const stat = (n: string, l: string) => `<div><b>${n}</b>${l}</div>`;
    return crPanelHtml({
      id: "lp-now", title: "Now playing", icon: "now",
      bodyHtml: `<div class="lp-now-row">${cover(p.game.gameId, p.game.title)}<div><h3>${esc(p.game.title)}</h3>${scoreHtml(v?.score)} <span class="bt-badge bt-badge--green">Playing</span>
        <div class="lp-now-stats">${stat(`<span data-gm>0m</span>`, "tonight")}${v ? stat(String(v.streams), plural(v.streams, "stream").replace(/^\d+ /, "")) : ""}${v ? stat(fmtDuration(v.minutes * 60000), "all time") : ""}</div></div></div>${next}`,
    });
  });
  const gm = box.querySelector("[data-gm]"); if (gm && p.game) gm.textContent = fmtDuration(Date.now() - p.game.startedAt);
}

/* ------------------------------------------------------------------ crew */
const SEAT = (people: { name: string; role: string }[]) => people.map((x) => ({ name: `@${x.name}`, role: x.role }));
function crewBays(c: PubCtx) {
  const chats = c.pub.crew.chats || {}, rooms = roomsOf(c).filter((r) => r !== "site");
  const out: { name: string; iconHtml: string; people: { name: string; role: string }[]; open: boolean; need: string }[] = [];
  const has = (r: string) => (rooms as string[]).includes(r);
  const seat = (rs: string[], name: string) => {
    const list = rs.filter(has);
    if (!list.length) return;
    const people: { name: string; role: string }[] = [];
    const leads = [...new Set(list.map((r) => chats[r]?.lead).filter(Boolean) as string[])];
    leads.forEach((l) => people.push({ name: l, role: list.length > 1 && list.every((r) => chats[r]?.lead === l) ? "Lead · both rooms" : "Lead" }));
    [...new Set(list.flatMap((r) => chats[r]?.deckhands || []))].forEach((d) => people.push({ name: d, role: "Deckhand" }));
    out.push({ name, iconHtml: list.map((r) => platformIconHtml(r)).join(""), people: SEAT(people), open: !leads.length, need: "Lead needed" });
  };
  seat(["twitch"], "Twitch"); seat(["ytLandscape", "ytVertical"], "YouTube"); seat(["tiktok"], "TikTok");
  return out;
}
function drawCrew(c: PubCtx) {
  const p = c.pub, look = c.root.dataset.look || "";
  const bays = crewBays(c);
  const key = `${look}|${p.crew.captain}|${JSON.stringify(p.crew.chats)}|${roomsOf(c).join()}`;
  patch("crew", key, () => {
    const cap = p.crew.captain ? [{ name: `@${p.crew.captain}`, role: "Stream Captain" }] : [];
    const action = `<a class="bt-link-btn" href="/crew">Meet the crew</a>`;
    if (look === "hull" || look === "crt") {
      return crPanelHtml({ id: "lp-crew", title: "Crew on duty", icon: "crew", actionsHtml: action, bodyHtml: deckplanHtml({ bridge: { name: "Bridge", people: cap, need: "Captain needed" }, bays: (isBackstage(c) ? [] : bays) as never[] }) });
    }
    const rows = [...cap.map((x) => `<div class="lp-crew-row is-captain"><span class="lp-crew-av">${esc(x.name.slice(1, 3).toUpperCase())}</span><div><b>${esc(x.name)}</b><small>${x.role}</small></div></div>`),
      ...bays.flatMap((b) => b.open ? [`<div class="lp-crew-row is-open"><span class="lp-crew-av">+</span><div><b>${esc(b.name)} lead needed</b><small>Crew can clock in from the Mod Deck</small></div></div>`] : b.people.map((x) => `<div class="lp-crew-row"><span class="lp-crew-av">${esc(x.name.slice(1, 3).toUpperCase())}</span><div><b>${esc(x.name)}</b><small>${esc(b.name)} · ${esc(x.role)}</small></div></div>`))];
    return crPanelHtml({ id: "lp-crew", title: "Crew on duty", icon: "crew", actionsHtml: action, bodyHtml: `<div class="lp-crew">${rows.join("")}</div>` });
  });
}

/* ------------------------------------------------------------------ watch on, and the Play panel */
function drawWatch(c: PubCtx) {
  const bs = isBackstage(c), rooms = roomsOf(c).filter((r) => r !== "site");
  patch("watch", `${bs}|${rooms.join()}`, () => {
    if (bs) return crPanelHtml({ id: "lp-watch", title: "Backstage", icon: "backstage", bodyHtml: `<p class="lp-note">The after-show is only here, for members. Check-ins work as usual.</p>` });
    const links = rooms.map((r) => {
      const url = site.socials.find((s) => s.id === SOCIAL[r])?.url || "#";
      const ext = /^https?:/.test(url);
      return `<a class="lp-watch-link" href="${esc(url)}"${ext ? ` target="_blank" rel="noopener"` : ""}>${platformIconHtml(r)}<span>${esc(ROOM_NAME[r])}</span><small data-v="${r}"></small></a>`;
    }).join("");
    return crPanelHtml({ id: "lp-watch", title: "Watch on", icon: "watch", bodyHtml: links ? `<div class="lp-watch">${links}</div>` : `<p class="lp-note">Watch right here on the page.</p>` });
  });
}
function drawPlay(c: PubCtx) {
  const a = c.pub.activity;
  patch("play", `${a?.kind}|${a?.title}|${a?.status}`, () => crPanelHtml({
    id: "lp-play", title: a ? "On now" : "Play", icon: "questions",
    bodyHtml: a
      ? `<div class="lp-activity"><span class="bt-live-tag"><i></i>${esc(a.kind || "Live")}</span><p>${esc(a.title || "A live activity is running.")}</p></div>`
      : `<div class="lp-activity">${mascotHtml()}<div><b>Questions and Hot Seat are coming soon</b><p>Until then, say it in chat. The crew is listening.</p></div></div>`,
  }));
}

/* ------------------------------------------------------------------ the part */
async function loadPresence(c: PubCtx) {
  const id = c.pub.streamId || "";
  const key = `${id}|${c.member}`;
  if (presenceFor === key) return;
  presenceFor = key;
  presence = c.member && id ? await c.api.presence(id, c.auth) : null;
  keys.checkin = "";
  drawCheckin(cur);
}

function redraw(c: PubCtx) {
  drawVideo(c); drawReadouts(c); drawRail(c); drawCheckin(c); drawNow(c); drawCrew(c); drawWatch(c); drawPlay(c);
  applyNumbers(c);
}

const part: ViewPart = {
  mount(ctx, el) {
    box = el; cur = ctx; keys = {}; presence = null; presenceFor = ""; played = false; backstage = { state: "idle" }; firstNumbers = true;
    el.innerHTML = `<div class="lp-grid"><div class="lp-main"><div data-p="video" class="lp-video"></div><div data-p="rail"></div><div data-p="now"></div><div data-p="play"></div></div>
      <div class="lp-side"><div data-p="readouts"></div><div data-p="checkin"></div><div data-p="crew"></div><div data-p="watch"></div></div></div>`;
    el.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-lp-play]")) { played = true; keys.video = ""; drawVideo(cur); }
      else if (t.closest("[data-lp-retry]")) void loadBackstage(cur, true);
    });
    clearInterval(timer);
    timer = window.setInterval(() => { if (!document.hidden) { applyNumbers(cur); drawCheckin(cur); } }, 1000);
    part.update(ctx);
  },
  update(ctx) {
    cur = ctx;
    redraw(ctx);
    void loadPresence(ctx);
    void loadBackstage(ctx);
  },
  unmount() { clearInterval(timer); timer = 0; box.innerHTML = ""; },
};
export default part;
