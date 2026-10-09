// The Mod Deck's markup (/live/deck; mockup docs/design/mockups/mod-deck.html section 1): pure functions from the page's model to strings, built from the kit's own pieces in shared/ui
// (.bt-duty-bar, .bt-room-tile, .bt-chat-feed, .bt-prompt, .bt-crew-notes, .bt-cue-card, .bt-cr-panel, .bt-stamp) and the Swap board card from /crew/hq. Page-only layout is md-* in
// styles/mod-deck.css. Nothing here reads or writes data: mod-deck.ts decides what to show and what a button does. Text is escaped.
import { dutyBarHtml, awayPopoverHtml } from "../../../../shared/ui/duty-bar.js";
import { roomTileHtml, roomTilesHtml } from "../../../../shared/ui/room-tile.js";
import { chatFeedHtml, chatFeedOutHtml, chatFeedEmptyHtml, chatLinesHtml } from "../../../../shared/ui/chat-feed.js";
import { promptHtml } from "../../../../shared/ui/prompt.js";
import { crewNotesHtml } from "../../../../shared/ui/crew-notes.js";
import { cueCardHtml } from "../../../../shared/ui/cue-card.js";
import { crPanelHtml } from "../../../../shared/ui/cr-panel.js";
import { CR_ICON } from "../../../../shared/ui/control-room.js";
import { stampHtml } from "../../../../shared/ui/stamp.js";
import { gradeChipHtml } from "../../../../shared/ui/grade-chip.js";
import { platformIconHtml } from "../../../../shared/ui/crew.js";
import { initials } from "../../../../shared/ui/dom.js";
import type { Swap } from "../planner/plan-data";
import { boardCardHtml } from "../crew/swaps";
import { BEATS, BEAT_LABEL, fmtDur, type Beat } from "./model";
import { esc, mascotHtml } from "./ui";
import type { Tool } from "./mod-deck-tools";
import { ROOM_NAME, ROOM_ORDER, myRoomOf, roleLine, type ChatFormat, type ActiveRun, type Flag, type Cue, type DutyRec, type DutyState, type Me, type Note, type Prompt, type PubDeck, type Room, type SeatRole, type StreamInfo } from "./mod-deck-data";

export type Tab = "chats" | "crew" | "tools";
export interface SiteConf { twitchChannel: string; host: string; tiktokUrl: string; houseRules: string; socials: { id: string; label: string; url: string }[]; origin: string }
export interface Model {
  me: Me; pub: PubDeck | null; duty: DutyState | null; rec: DutyRec | null;
  stream: StreamInfo | null; next: StreamInfo | null; notes: Note[]; cues: Cue[]; swaps: Swap[]; boost: number;
  phone: boolean; tab: Tab; focus: boolean; chatRoom: Room; dropRoom: Room | null; away: boolean; site: SiteConf; now: number;
  /** The prompt ids the person already answered here (hidden at once, before the doc catches up). */
  answered: Set<string>;
  /** Part 5: the flags I may see (admins: urgent; owner: all), the open Captain tool, the unlocks done here, Chat Games' formats, minutes added in the confirm panel. */
  flags: Flag[]; tool: Tool | null; unlocked: { uid: string; handle: string | null; beat: string }[]; formats: ChatFormat[]; run: ActiveRun | null; added: Record<string, number>; confirmBusy: boolean;
}
export type Phase = "off" | "live" | "ended";
export interface RoomRow { room: Room; name: string; state: "covered" | "needed" | "off"; lead: string | null; deckhands: number; viewers: number | null; mine: boolean; boost: boolean }
export interface Derived {
  phase: Phase; after: boolean; clock: "out" | "in" | "away" | "owner"; roles: SeatRole[]; seat: SeatRole[]; myRoom: Room | null; isCaptain: boolean; isLead: boolean;
  prompt: Prompt | null; rooms: RoomRow[]; streamRooms: Room[]; title: string; canLead: boolean;
  /** At Stop: this person is the Captain who ended the night (or the owner) and so confirms tonight's crew. */
  canConfirm: boolean;
}

const ROOM_SHORT: Record<Room, string> = ROOM_NAME;
const CHAT_ROOMS: Room[] = ["twitch", "ytLandscape", "ytVertical"];
export const fmtClock = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
const when = (t: number) => new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(t);
const whenShort = (t: number) => new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }).format(t);
const clockTime = (t: number) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(t);
export const ago = (t: number, now = Date.now()) => { const m = Math.max(0, Math.floor((now - t) / 60000)); return m < 1 ? "just now" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h`; };
const gradeOf = (g: { track: "mod" | "admin"; grade: number } | null) => (g ? gradeChipHtml({ track: g.track, grade: g.grade } as any) : "");
const mascot = (aware = false) => { const m = mascotHtml(); return aware ? m.replace(/class="bt-mascot/, 'class="bt-mascot bt-mascot--aware') : m; };
const minText = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);

// ---------------------------------------------------------------------------------------------- what the page is showing
export function derive(m: Model): Derived {
  const pub = m.pub, duty = m.duty;
  const live = !!pub && (pub.state === "live" || pub.state === "backstage");
  const canConfirm = !!duty && duty.state === "ended" && (m.me.owner || duty.captainAtStop === m.me.uid);
  const ended = !!pub && pub.state === "ended" && (!!m.rec || canConfirm);
  const phase: Phase = live ? "live" : ended ? "ended" : "off";
  const after = pub?.state === "backstage" || (duty?.afterShow ?? false);
  const mine = duty?.onDuty[m.me.uid] || null;
  const clock = m.me.owner ? "owner" : mine ? (mine.away ? "away" : "in") : "out";
  const roles = mine ? mine.roles : [];
  const seat = m.stream?.seat ?? [];
  const myRoom = myRoomOf(roles.length ? roles : seat);
  const isCaptain = roles.some((r) => r.role === "captain") || (!!duty?.captainNow && duty.captainNow.uid === m.me.uid);
  const isLead = roles.some((r) => r.role === "lead");
  const prompts = Object.values(duty?.prompts || {}).filter((p) => p.status === "open" && p.expiresAt > m.now && !m.answered.has(p.id) && ["handoff", "actingCaptain", "captainHandoff"].includes(p.kind) && (p.to === m.me.uid || (Array.isArray(p.to) && p.to.includes(m.me.uid))));
  const streamRooms: Room[] = after ? ["site"] : ((m.stream?.rooms?.length ? m.stream.rooms : (pub?.liveRooms as Room[])) || CHAT_ROOMS.concat("tiktok")).filter((r) => r !== "site") as Room[];
  const cover = duty?.rooms && Object.keys(duty.rooms).length ? duty.rooms : pub?.deck?.rooms || {};
  const liveRooms = (pub?.liveRooms || []) as string[];
  const rooms: RoomRow[] = streamRooms.sort((a, b) => ROOM_ORDER.indexOf(a) - ROOM_ORDER.indexOf(b)).map((room) => {
    const c = cover[room];
    const off = phase !== "live" || (liveRooms.length > 0 && !liveRooms.includes(room));
    return { room, name: ROOM_SHORT[room], state: off ? "off" : c && c.covered ? "covered" : "needed", lead: c?.lead ? `@${c.lead}` : null, deckhands: c?.deckhands || 0, viewers: pub?.viewers.byPlatform?.[room as "twitch"] ?? null, mine: room === myRoom, boost: room === "ytLandscape" || room === "ytVertical" };
  });
  const title = phase === "live" || phase === "ended" ? pub?.title || "The stream" : "Nobody is on air right now";
  return { phase, after, clock, roles, seat, myRoom, isCaptain, isLead, prompt: prompts[0] || null, rooms, streamRooms, title, canLead: !m.me.owner && m.me.level >= 2, canConfirm };
}
/** The room a Take the lead button applies to, and how: a handoff prompt for that room (accept it), or a clock in as lead (only when not on duty yet). */
export function takeFor(m: Model, d: Derived, room: Room): "prompt" | "clockin" | "vacant" | null {
  if (d.phase !== "live" || d.after || !d.canLead) return null;
  const p = Object.values(m.duty?.prompts || {}).find((x) => x.kind === "handoff" && x.room === room && x.status === "open" && x.expiresAt > m.now && !m.answered.has(x.id) && Array.isArray(x.to) && x.to.includes(m.me.uid));
  if (p) return "prompt";
  return d.clock === "out" ? "clockin" : d.clock === "in" ? "vacant" : null;
}

// ---------------------------------------------------------------------------------------------- hero
function beatRail(pub: PubDeck | null) {
  const beats = pub?.beats || {};
  const now = pub?.beat;
  const dots = BEATS.map((k) => { const st = (beats as any)[k]?.status; return `<i class="${st === "done" ? "is-done" : st === "now" ? "is-now" : st === "skipped" ? "is-skip" : ""}" title="${esc(BEAT_LABEL[k as Beat])}"></i>`; }).join("");
  return `<span class="md-beatrail" aria-label="Beats">${dots}<small>${esc(now ? BEAT_LABEL[now as Beat] : "")}</small></span>`;
}
export function heroHtml(m: Model, d: Derived): string {
  const pub = m.pub;
  const tag = d.phase === "live" ? `<span class="bt-live-tag"><i></i>${d.after ? "AFTER-SHOW" : "LIVE"}</span>` : d.phase === "ended" ? `<span class="bt-badge bt-badge--gray">Ended</span>` : `<span class="bt-badge bt-badge--gray">Off air</span>`;
  const sub = d.phase === "live" && m.stream?.type !== "backstage" && pub?.game ? `<span class="bt-meta">${esc(pub.game.title)}</span>` : "";
  let meta = "";
  if (d.phase === "live") meta = `<span class="md-clock" data-clock>${fmtClock(m.now - (pub?.actualStart || m.now))}</span>${beatRail(pub)}<span>Viewers <b data-viewers>${(pub?.viewers.total || 0).toLocaleString("en-US")}</b></span>`;
  else if (d.phase === "ended") meta = `<span>Ended <b>${pub?.actualEnd ? clockTime(pub.actualEnd) : ""}</b></span>${pub?.actualStart && pub.actualEnd ? `<span>On air <b>${fmtDur(pub.actualEnd - pub.actualStart)}</b></span>` : ""}<span>Peak <b>${(pub?.peak || 0).toLocaleString("en-US")}</b></span>`;
  else meta = m.next ? `<span>Next: <b>${esc(when(m.next.start))}</b></span>${m.next.seat.length ? `<span>Your seat: <b>${esc(roleLine(m.next.seat))}</b></span>` : `<span>No seat yet: <a href="/schedule/plan">sign up</a></span>`}` : `<span>Nothing is scheduled yet.</span>`;
  return `<div class="md-hero"><span class="md-radar" aria-hidden="true">${CR_ICON}</span>
    <div class="md-hero-main"><div class="md-hero-l1">${tag}<span class="md-kicker">MOD <b>DECK</b></span>${sub}</div><h1 class="bt-title md-title">${esc(d.title)}</h1><div class="md-hero-meta">${meta}</div></div>
    <div class="md-hero-right"><div data-slot="bar"></div></div>
    <div class="md-scene" aria-hidden="true">${mascot(true)}</div></div>`;
}

// ---------------------------------------------------------------------------------------------- the duty bar and clock in
export function barHtml(m: Model, d: Derived): string {
  if (d.phase !== "live") return "";
  if (d.clock === "owner") return `<div class="md-host"><b>You're hosting</b><span>The owner has no clock in. You see everything here.</span></div>`;
  const mine = m.duty?.onDuty[m.me.uid];
  if (d.clock === "out") return clockInHtml(m, d);
  const away = mine?.away;
  return dutyBarHtml({
    state: d.clock === "away" ? "away" : "on", handle: `@${m.me.handle}`, grade: m.me.grade, avatarName: m.me.name || m.me.handle, line: roleLine(d.roles), minutes: m.rec?.minutes || 0,
    awayText: away ? awayText(away.until, m.now) : "Stepped away",
  } as any);
}
/** "Stepped away · back in 14:32": the page's one-second tick rewrites it from the same function. */
export const awayText = (until: number, now: number) => `Stepped away · back in ${fmtClock(Math.max(0, until - now)).replace(/^0:/, "")}`;
export function clockInHtml(m: Model, d: Derived): string {
  const seatLine = d.seat.length ? roleLine(d.seat) : "";
  const rooms = d.streamRooms;
  const drop = !d.seat.length ? `<div class="md-drop" role="group" aria-label="Drop in to a room">${rooms.map((r) => `<button type="button" class="bt-chip bt-chip--small${(m.dropRoom || defaultDrop(d)) === r ? " is-active" : ""}" data-drop-room="${esc(r)}" aria-pressed="${(m.dropRoom || defaultDrop(d)) === r}">${esc(ROOM_SHORT[r])}${d.rooms.find((x) => x.room === r)?.state === "needed" ? " · needed" : ""}</button>`).join("")}</div>` : "";
  return `<div class="md-clockin"><span class="md-clockin-txt"><small>${seatLine ? "Your seat tonight" : d.after ? "The after-show has no seats" : "No seat tonight"}</small><b>${esc(seatLine || "Drop in as a Deckhand")}</b>${drop}</span><button type="button" class="bt-btn bt-btn--primary" data-act="clockin">Clock in</button></div>`;
}
export const defaultDrop = (d: Derived): Room | null => (d.rooms.find((r) => r.state === "needed" && r.room !== "tiktok") || d.rooms.find((r) => r.state !== "off") || d.rooms[0])?.room ?? null;
export const awayPopHtml = (d: Derived) => awayPopoverHtml({ lead: d.isLead || d.isCaptain });

// ---------------------------------------------------------------------------------------------- prompts
export function promptBlockHtml(m: Model, d: Derived, inline: boolean): string {
  const p = d.prompt;
  if (!p) return "";
  const who = p.fromHandle ? `@${p.fromHandle}` : "A Room Lead";
  const base = { id: `md-p-${p.id}`, deadline: p.expiresAt, inline };
  const html = p.kind === "handoff"
    ? promptHtml({ ...base, kind: "handoff", kicker: "Pass the lantern", title: `Take the lead in ${ROOM_SHORT[(p.room as Room) || "twitch"]}?`, text: `${who} stepped away. You hold the room until they are back. +5 Gears for taking over.` })
    : p.kind === "captainHandoff"
      ? promptHtml({ ...base, kind: "captain", kicker: "Pass the lantern", title: "Take the Captain's seat?", text: `${who} stepped away. You hold the helm until they are back.` })
      : promptHtml({ ...base, kind: "acting", kicker: "Nobody is at the helm", title: "Be acting Captain tonight?", text: "No Captain is seated. You are the highest-grade crew on duty. A seated Captain who clocks in takes over, and Boomer can change it any time." });
  return html.replace('<div class="bt-prompt', `<div data-prompt-id="${esc(p.id)}" class="bt-prompt`);
}
export const dockHtml = (m: Model, d: Derived): string => (d.phase !== "live" || d.clock === "owner" ? "" : `${promptBlockHtml(m, d, true)}${barHtml(m, d)}`);

// ---------------------------------------------------------------------------------------------- rooms strip
export function roomsStripHtml(m: Model, d: Derived): string {
  if (d.phase !== "live" || d.after) return "";
  return roomsStrip(d.rooms.map((r) => roomTileHtml({
    chat: r.room, name: r.name, state: r.state, boost: r.boost && m.boost > 1 ? `×${m.boost}` : "", lead: r.lead, deckhands: r.deckhands, viewers: r.viewers == null ? "–" : r.viewers.toLocaleString("en-US"), mine: r.mine,
    take: r.state === "needed" && takeFor(m, d, r.room) ? "Take the lead" : false,
  } as any).replace('class="bt-room-tile', `data-md-room="${esc(r.room)}" class="bt-room-tile`)));
}
const roomsStrip = (tiles: string[]) => `<div class="md-rooms">${roomTilesHtml(tiles.join(""))}</div>`;

// ---------------------------------------------------------------------------------------------- the chat wall
const demoLines = (room: Room) => chatLinesHtml(room === "twitch"
  ? [{ user: "ashgrave", text: "that chainsaw guy is BACK", tone: "--bt-pink" }, { user: "vexx", text: "reminder: no spoilers past chapter 6 please", tone: "--bt-teal", kind: "mod" }, { user: "ghoul_ivy", text: "boomer jumped so hard lmao", tone: "--bt-blue" }, { user: "newbie_23", text: "first time here, this is great", tone: "--bt-lime", kind: "new" }, { user: "nightowl", text: "welcome in @newbie_23 grab a seat 👋", tone: "--bt-teal", kind: "mod" }]
  : room === "ytLandscape"
    ? [{ user: "Mara K", text: "hello from portugal", tone: "--bt-blue" }, { user: "hollowgrin", text: "hi Mara! check-in link is pinned", tone: "--bt-teal", kind: "mod" }, { user: "Dree", text: "what difficulty is this", tone: "--bt-gold" }]
    : [{ user: "jxk", text: "how do i get the badge", tone: "--bt-gold", kind: "new" }, { user: "pumpkn", text: "vertical gang", tone: "--bt-pink" }, { user: "", text: "No lead in this room · ×1.5 Gears", kind: "sys" }]);
/** The site's own mark (the "BT" tile /live and the Control Room use for the site room) instead of the platform tile the kit draws for an unknown chat. */
const siteMark = (html: string) => html.replace(/<span class="bt-platform-icon[^>]*>[^]*?<[/]span>(?=[^<]*<)/, `<span class="bt-platform-icon bt-platform-icon--sm bt-platform-icon--site" aria-hidden="true">BT</span>`);
const iframe = (src: string, title: string) => `<iframe src="${esc(src)}" title="${esc(title)}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
function embedFor(m: Model, room: Room): { html: string; live: boolean } | null {
  if (m.site.host === "") return null;
  if (room === "twitch") return { html: iframe(`https://www.twitch.tv/embed/${encodeURIComponent(m.site.twitchChannel)}/chat?parent=${encodeURIComponent(m.site.host)}&darkpopout`, "Twitch chat"), live: true };
  const yt = m.duty?.youtube; const id = room === "ytLandscape" ? yt?.landscapeId : yt?.verticalId;
  return id ? { html: iframe(`https://www.youtube.com/live_chat?v=${encodeURIComponent(id)}&embed_domain=${encodeURIComponent(m.site.host)}&dark_theme=1`, room === "ytLandscape" ? "YouTube chat" : "YouTube vertical chat"), live: true } : null;
}
const feedFoot = (room: Room) => (room === "twitch" ? "Embedded Twitch chat · you type here as yourself" : "Embedded YouTube chat · you type here as yourself");
function feedHtml(m: Model, d: Derived, row: RoomRow): string {
  const room = row.room, lead = row.lead || "no lead", viewers = row.viewers == null ? null : row.viewers.toLocaleString("en-US");
  const common = { chat: room, name: ROOM_SHORT[room], lead, viewers, mine: row.mine };
  let inner: string;
  if (m.me.preview) inner = chatFeedHtml({ ...common, bodyHtml: demoLines(room), embed: false, foot: `Sample chat · ${feedFoot(room).toLowerCase()}` } as any);
  else {
    const e = embedFor(m, room);
    inner = e ? chatFeedHtml({ ...common, bodyHtml: e.html, foot: feedFoot(room) } as any)
      : chatFeedEmptyHtml({ ...common, mascotHtml: mascot(), text: room === "twitch" ? "The Twitch chat isn't available here." : "Waiting for the YouTube chat. It shows here as soon as YouTube has the stream." } as any);
  }
  return `<div class="md-feed" data-room="${esc(room)}">${inner}</div>`;
}
export function wallHtml(m: Model, d: Derived): string {
  if (d.phase !== "live") return "";
  const tt = d.rooms.find((r) => r.room === "tiktok" && r.state !== "off");
  const ttHtml = tt ? `<div class="md-feed md-feed--out" data-room="tiktok">${chatFeedOutHtml({ chat: "tiktok", name: "TikTok", lead: tt.lead || "no lead", viewers: tt.viewers == null ? null : tt.viewers.toLocaleString("en-US"), href: m.site.tiktokUrl || "#", label: "Open TikTok LIVE", mine: tt.mine } as any)}</div>` : "";
  if (d.after) {
    const feed = `<div class="md-feed" data-room="site">${siteMark(chatFeedEmptyHtml({ chat: "site", name: "The site", lead: "no seats", viewers: m.pub?.viewers.total ?? null, mascotHtml: mascot(), text: "The after-show lives on the stream page. Drop in as a Deckhand and keep the room friendly.", foot: "Site room" } as any))}</div>`;
    return `<div class="md-wall"><div class="md-wall-h"><span class="bt-label">Chats</span></div><div class="md-chats md-chats--1">${feed}</div></div>`;
  }
  const rows = d.rooms.filter((r) => CHAT_ROOMS.includes(r.room));
  const first = m.focus && rows.some((r) => r.mine) ? [...rows.filter((r) => r.mine), ...rows.filter((r) => !r.mine)].slice(0, 2) : rows;
  const shown = m.phone ? rows.filter((r) => r.room === m.chatRoom) : first;
  const switcher = `<div class="md-roomswitch" role="group" aria-label="Chat">${[...rows, ...(tt ? [tt] : [])].map((r) => `<button type="button" data-chat-room="${esc(r.room)}" aria-pressed="${m.chatRoom === r.room}">${platformIconHtml(r.room)}${esc(r.name)}</button>`).join("")}</div>`;
  const showTT = tt && (!m.phone || m.chatRoom === "tiktok");
  const hideChats = m.phone && m.chatRoom === "tiktok";
  return `<div class="md-wall"><div class="md-wall-h"><span class="bt-label">Chats</span><button type="button" class="bt-btn bt-btn--ghost md-focus" data-act="focus" aria-pressed="${m.focus}">${m.focus ? `Show all ${rows.length}` : "Focus on mine"}</button></div>${switcher}`
    + (hideChats ? "" : `<div class="md-chats${m.focus && !m.phone ? " is-focus" : ""}" style="--md-n:${shown.length}">${shown.map((r) => feedHtml(m, d, r)).join("")}</div>`) + (showTT ? ttHtml : "") + `</div>`;
}
/** A key for the wall: it is redrawn (and its embeds reloaded) only when this changes, never for viewer counts or leads. */
export function wallKey(m: Model, d: Derived): string {
  return [d.phase, d.after, m.phone, m.chatRoom, m.focus, d.streamRooms.join(), d.rooms.filter((r) => r.mine).map((r) => r.room).join(), m.duty?.youtube?.landscapeId || "", m.duty?.youtube?.verticalId || "", m.me.preview].join("|");
}

// ---------------------------------------------------------------------------------------------- rail
const panel = (id: string, cls: string, title: string, icon: string, body: string, tag = "") => crPanelHtml({ id, cls: `md-panel ${cls}`, title, icon, tagHtml: tag, bodyHtml: body, level: 3 });
const lineRow = (id: string, label: string, val: string) => `<div class="md-line"><span><b>${esc(label)}</b> ${esc(val)}</span><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-copy="${esc(id)}">Copy</button></div>`;
export function linesTexts(m: Model, d: Derived): Record<string, { label: string; show: string; text: string }> {
  const room = d.myRoom || "twitch";
  const o = m.site.origin;
  const soc = m.site.socials.filter((s) => s.url && s.url !== "#").map((s) => `${s.label}: ${s.url}`);
  const next = m.next ? `${m.next.title}, ${when(m.next.start)}` : "";
  return {
    room: { label: "Room link", show: `${o.replace(/^https?:\/\//, "")}/live?room=${room}`, text: `${o}/live?room=${room}` },
    ref: { label: "Your link", show: m.me.handle ? `${o.replace(/^https?:\/\//, "")}/join/@${m.me.handle}` : "sign in first", text: m.me.handle ? `${o}/join/@${m.me.handle}` : "" },
    rules: { label: "House rules", show: "the short version", text: m.site.houseRules },
    soc: { label: "Socials", show: soc.length ? "all of them" : "Twitch, YouTube, TikTok, Instagram", text: soc.length ? `Find Boomertanger everywhere: ${soc.join(" · ")}` : "Find Boomertanger on Twitch, YouTube, TikTok and Instagram: @boomertanger" },
    sched: { label: "Schedule", show: m.next ? `next: ${whenShort(m.next.start)}` : "nothing scheduled yet", text: next ? `Next stream: ${next}. Full schedule: ${o}/schedule` : `Full schedule: ${o}/schedule` },
  };
}
export function linesHtml(m: Model, d: Derived): string {
  const t = linesTexts(m, d);
  return panel("md-lines", "md-tools-only", "Quick lines", "checklist", Object.entries(t).map(([k, v]) => lineRow(k, v.label, v.show)).join("") + `<span class="md-hint">One link post per room per hour. Never in DMs to strangers.</span>`);
}
export function notesHtml(m: Model): string {
  const mine = (n: Note) => n.uid === m.me.uid || m.me.admin;
  const notes = m.notes.map((n) => ({ id: n.id, handle: `@${n.handle}`, avatarName: n.handle, grade: n.grade ? { track: n.track, grade: n.grade } : null, age: ago(n.createdAt, m.now), text: n.text, deletable: mine(n) }));
  return panel("md-notes", "md-crew-only", "Crew notes", "crew", crewNotesHtml({ notes, canPost: true, placeholder: "Note for the crew" } as any), `<span class="bt-meta">clear after 24 h</span>`);
}
export function cuesHtml(m: Model, d: Derived): string {
  if (!m.cues.length || d.phase !== "live") return "";
  const edit = d.clock === "in" && (d.isLead || d.isCaptain);
  const cards = m.cues.map((c) => cueCardHtml({ id: `${c.runId}/${c.id}`, kicker: c.kicker, text: c.text, due: c.due ? `${clockTime(c.due)}${c.due > m.now ? ` · in ${Math.max(1, Math.round((c.due - m.now) / 60000))} min` : ""}` : "", state: c.state, readonly: !edit } as any)).join("");
  return panel("md-cues", "md-tools-only", "Chat Game cue", "game", `<div class="md-cues">${cards}</div>`);
}

// ---------------------------------------------------------------------------------------------- the live page, off air, ended
export function liveBodyHtml(): string {
  return `<div data-slot="flags"></div><div data-slot="rooms"></div><div data-slot="helm"></div><div class="md-main"><div class="md-wallbox"><div data-slot="wall"></div><div class="md-promptlayer" data-slot="layer"></div></div><div class="md-rail"><div data-slot="cues"></div><div data-slot="lines"></div><div data-slot="notes"></div></div></div>`;
}
export function tabsHtml(m: Model, d: Derived): string {
  if (d.phase !== "live" || d.after) return "";
  return `<div class="bt-pills md-ptabs" role="tablist" aria-label="Deck">${([["chats", "Chats"], ["crew", "Crew"], ["tools", "Tools"]] as const).map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" class="${m.tab === k ? "is-on" : ""}" aria-selected="${m.tab === k}">${l}</button>`).join("")}</div>`;
}
const empty = (title: string, text: string, extra = "") => `<div class="md-empty"><span class="md-empty-m" aria-hidden="true">${mascot()}</span><b>${esc(title)}</b><p>${esc(text)}</p>${extra}</div>`;
export function offHtml(m: Model, d: Derived): string {
  const n = m.next;
  const seatBody = n
    ? empty(n.seat.length ? whenShort(n.start) : "No seat yet", n.seat.length ? `${roleLine(n.seat)}. The chats open here when Boomer goes live; come back a few minutes early and clock in.` : "Nobody's on air. Grab a seat for the next one.", n.seat.length ? `<a class="bt-btn bt-btn--secondary bt-btn--sm" href="/schedule/plan">Can't make it? Drop the seat</a>` : `<a class="bt-btn bt-btn--primary bt-btn--sm" href="/schedule/plan">Pick a seat</a>`)
    : empty("Nobody's on air", "Nothing is scheduled yet. When the next stream is on the calendar, your seat shows here.");
  return `<div class="md-off">${panel("md-seat", "", "Your next seat", "now", seatBody)}<div data-slot="swaps" class="md-swaps">${boardCardHtml(m.swaps, m.me.uid, mascot())}</div><div class="md-rail"><div data-slot="lines"></div><div data-slot="notes"></div></div></div>`;
}
export function endedHtml(m: Model, d: Derived, confirmPanel = ""): string {
  const rec = m.rec;
  const night = rec ? nightPanel(m, rec) : "";
  const duty = m.duty;
  // the Captain (or the owner) confirms the crew in [data-confirm-slot]; everyone else waits for them
  const autoAt = duty?.endedAt ? duty.endedAt + 24 * 3600000 : null;
  const autoTxt = autoAt ? new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }).format(autoAt) : "24 hours after Stop";
  const confirm = d.canConfirm && confirmPanel ? `<div data-confirm-slot>${confirmPanel}</div>`
    : duty?.confirmedAt ? panel("md-confirm", "", "Crew confirmed", "crew", empty("Confirmed", "Gears are paid. Thank you for tonight."))
      : panel("md-confirm", "", "Waiting for the Captain", "crew", `<div data-confirm-slot>${empty("The Captain is confirming the crew", `Your minutes are in. Gears land when the Captain confirms, or on their own at ${autoTxt}.`)}</div>`);
  return `<div class="md-wrap${night ? "" : " md-wrap--1"}">${night}${confirm}</div><div class="md-ended-rail"><div data-slot="notes"></div></div>`;
}
function nightPanel(m: Model, rec: DutyRec): string {
  const roleRows = Object.entries(rec.lines).filter(([, v]) => v > 0).map(([k, v]) => {
    const [role, room] = k.split(":");
    const label = role === "captain" ? "Stream Captain" : role === "lead" ? `Room Lead · ${ROOM_SHORT[room as Room] || room}` : `Deckhand · ${ROOM_SHORT[room as Room] || room}`;
    return `<div class="md-night-row"><span>${esc(label)}</span><b>${esc(minText(v))}</b></div>`;
  }).join("") || `<div class="md-night-row"><span>On duty</span><b>${esc(minText(rec.minutes))}</b></div>`;
  const paid = rec.confirmedAt != null && rec.gears != null;
  const month = new Intl.DateTimeFormat("en-US", { month: "short" }).format(m.now);
  const stamp = rec.counted ? stampHtml({ kicker: month, label: "Counted", tone: "lime", size: "sm" }) : "";
  const gears = paid ? `<div class="md-gears"><b data-count-to="${rec.gears}">${rec.gears}</b><span>Gears paid</span></div>` : `<div class="md-gears is-wait"><b>${rec.gears ?? "…"}</b><span>Gears waiting for the crew to be confirmed</span></div>`;
  return panel("md-night", "", "Your night", "stats", `<div class="md-night"><div class="md-night-top">${gears}${stamp}</div><div class="md-night-rows">${roleRows}${rec.showed && rec.scheduled ? `<div class="md-night-row"><span>Showed up on time</span><b>+5</b></div>` : ""}<div class="md-night-row"><span>Duty counted toward ${esc(new Intl.DateTimeFormat("en-US", { month: "long" }).format(m.now))}</span><b>${rec.counted ? "Yes ✓" : "Pending"}</b></div></div></div>`);
}

export { initials };
