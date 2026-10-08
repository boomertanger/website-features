// /schedule (docs/specs/scream-planner.md sections 2, 8, 13, 14; approved mockups round 4): the marquee hero (what is
// next, with a flip-clock countdown and the week's frame), "This week at a glance" (the week's door style, the L4 row
// of seven that is a slider on phones), then the full week as W1 tickets or the W2 timeline (a viewer switch kept in
// localStorage), This week / Next week tabs (published weeks only), the usual-week strip and the vote call-out.
// Reads public/schedule, the published streams of the two weeks, public/usualWeek, public/ballot and the Vault's
// public/vault (covers). Writes nothing. Renders are idempotent: they run again when the member changes and when the
// once-a-minute refresh finds new data.
import { onAccess } from "./layout";
import {
  esc, loadSchedule, loadWeekStreams, loadUsual, loadBallot, loadCovers, fillVoteCount, isSample, sampleSchedule, sampleUsual, sampleBallot, sampleCovers,
  ymd, addDays, mondayOf, weekIdOf, nextWeekId, rangeLabel, rangeText, dayTime, DEFAULT_TZ, DOW_SHORT, DOW_LONG, lengthText, hmText,
  type Sched, type PubStream, type Usual, type Ballot, type PubWeek,
} from "./pub";
import type { AuthState } from "../../lib/auth";
import type { Cover } from "../vault/data";
import { sectionHeadHtml } from "../../../../shared/ui/section-head.js";
import { coverHtml, initCoverFallbacks } from "../../../../shared/ui/cover.js";
import { themeChipHtml, velvetHtml, platformsHtml, dualTimeHtml, localZoneName, timeRangeText, dayParts } from "../../../../shared/ui/scream-planner.js";
import { marqueeHtml, flipClockHtml, initFlipClocks } from "../../../../shared/ui/marquee.js";
import { ticketHtml, initTickets } from "../../../../shared/ui/ticket.js";
import { DOOR_STYLES, doorHtml, doorStateFor, setDoorStyle, initDoors } from "../../../../shared/ui/doors.js";
import { sliderHtml, initSlider } from "../../../../shared/ui/slider.js";
import { viewSwitchHtml, initViewSwitch, WEEK_VIEWS } from "../../../../shared/ui/view-switch.js";
import { posterHtml } from "../../../../shared/ui/poster.js";
import { roomHtml } from "../../../../shared/ui/crew.js";

const root = document.querySelector<HTMLElement>("[data-pp-schedule]")!;
const heroEl = root.querySelector<HTMLElement>("[data-pp-hero]")!;
const glanceEl = root.querySelector<HTMLElement>("[data-pp-glance]")!;
const weekEl = root.querySelector<HTMLElement>("[data-pp-week]")!;
const voteEl = root.querySelector<HTMLElement>("[data-pp-vote]")!;
const usualEl = root.querySelector<HTMLElement>("[data-pp-usual]")!;

const WEEK_KEY = "bt.schedule.weekView";
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const mascot = () => document.getElementById("bt-mascot-tpl")?.innerHTML ?? "";
const store = {
  get(): string | null { try { return localStorage.getItem(WEEK_KEY); } catch { return null; } },
  set(v: string) { try { localStorage.setItem(WEEK_KEY, v); } catch { /* private window: fine */ } },
};

interface Model { sched: Sched | null; streams: Record<string, PubStream[]>; covers: Map<string, Cover | null>; usual: Usual | null; ballot: Ballot | null; sample: boolean; cur: string; nxt: string; tz: string }
let M: Model | null = null;
let auth: AuthState | null = null;
let tab: "this" | "next" | null = null;
let weekView: "tickets" | "timeline" = store.get() === "timeline" ? "timeline" : "tickets";
let timesIn: "central" | "local" = (() => { try { return localStorage.getItem("bt.schedule.timesIn") === "local" ? "local" : "central"; } catch { return "central"; } })();
let doorStyleOverride: string | null = null;     // the viewer's ‹ › flips: for fun, never saved
let doorDay: string | null = null;               // the night open in the glance strip
const selTicket: Record<string, string> = {};    // per week: the ticket whose detail shows
let clocks: { stop(): void } | null = null;
let heroKey = "", stateKey = "";

initCoverFallbacks();

// ---------- loading ----------
async function load(s: AuthState): Promise<Model> {
  const sample = isSample(s);
  if (sample) {
    const { sched, streams } = sampleSchedule();
    return { sched, streams, covers: sampleCovers(), usual: sampleUsual(), ballot: sampleBallot(), sample, cur: sched.currentWeek, nxt: nextWeekId(sched.currentWeek), tz: sched.tz };
  }
  const sched = await loadSchedule().catch(() => null);
  const tz = sched?.tz || DEFAULT_TZ;
  const cur = sched?.currentWeek || weekIdOf(ymd(Date.now(), tz)), nxt = nextWeekId(cur);
  const [a, b, covers, usual, ballot] = await Promise.all([
    loadWeekStreams(cur).catch(() => []), loadWeekStreams(nxt).catch(() => []), loadCovers().catch(() => new Map<string, Cover | null>()),
    loadUsual().catch(() => null), loadBallot().catch(() => null),
  ]);
  return { sched, streams: { [cur]: a, [nxt]: b }, covers, usual, ballot, sample, cur, nxt, tz };
}
/** The once-a-minute refresh: streams and the schedule doc only (state, delay, cancel and seats reach the public doc at once). */
async function refresh() {
  if (!M || M.sample || document.hidden) return;
  try {
    const [sched, a, b] = await Promise.all([loadSchedule().catch(() => M!.sched), loadWeekStreams(M.cur), loadWeekStreams(M.nxt)]);
    const next = { ...M, sched, streams: { [M.cur]: a, [M.nxt]: b } };
    if (JSON.stringify([next.sched, next.streams]) !== JSON.stringify([M.sched, M.streams])) { M = next; render(); }
    else tickStates();
  } catch { /* offline: keep what is shown */ }
}

// ---------- helpers ----------
const weekOf = (w: string): PubWeek | undefined => M?.sched?.weeks.find((x) => x.week === w);
const live = (s: PubStream) => s.state === "live";
const stateOf = (s: PubStream) => (s.state === "cancelled" ? "cancelled" : s.state === "live" ? "live" : s.state === "ended" || s.end < Date.now() ? "ended" : "scheduled");
const titleOf = (s: PubStream) => s.theme?.label || s.title;
const handle = (h: string | null | undefined) => (h ? `@${h}` : "");
const coverOf = (slug: string) => M?.covers.get(slug) ?? null;
const gameCovers = (s: PubStream, cls = "", n = 3) => s.games.slice(0, n).map((g) => coverHtml(coverOf(g.slug), { alt: g.title, cls, eager: true })).join("");
const streamsFlat = () => (M ? [...(M.streams[M.cur] || []), ...(M.streams[M.nxt] || [])] : []);
const delayedBy = (s: PubStream) => (s.delay?.originalStart != null ? Math.round((s.start - s.delay.originalStart) / 60000) : 0);
const isBackstage = (s: PubStream) => s.type === "backstage";
const visitor = () => !auth || auth.status === "signedOut";
const roomsOf = (s: PubStream) => (s.rooms.length ? s.rooms : s.platforms.map((p) => (p === "youtube" ? "ytLandscape" : p)));
const timeHtml = (s: PubStream) => dualTimeHtml({ start: s.start, end: s.end, was: s.delay?.originalStart ?? undefined, tz: M!.tz, mode: timesIn });
const captainLine = (s: PubStream) => (s.crew?.captain ? `Captain ${handle(s.crew.captain)}` : "");
const gamesLine = (s: PubStream) => {
  const n = s.games.length, more = Math.max(0, s.plannedGameCount - n);
  if (!n) return s.plannedGameCount ? `<b>${s.plannedGameCount} ${s.plannedGameCount === 1 ? "game" : "games"}</b> · picked on stream` : "";
  return `<b>${n} ${n === 1 ? "game" : "games"}</b> · ${esc(s.games.map((g) => g.title).join(", "))}${more ? ` · +${more} picked on stream` : ""}`;
};
const mascotEmpty = (title: string, text: string, tag = "h2", actions = "") =>
  `<div class="bt-empty pp-empty"><span class="pp-empty-art" aria-hidden="true">${mascot()}</span><${tag} class="${tag === "h1" ? "bt-title " : ""}bt-empty-title">${esc(title)}</${tag}><span>${text}</span>${actions}</div>`;

// ---------- the marquee ----------
function nextStream(): PubStream | null {
  const now = Date.now(), all = streamsFlat().filter((s) => s.state !== "cancelled" && s.state !== "ended");
  return all.find(live) || all.filter((s) => s.end > now).sort((a, b) => a.start - b.start)[0] || null;
}
function renderHero() {
  clocks?.stop(); clocks = null;
  const s = nextStream(), tz = M!.tz;
  if (!s) {
    // nothing coming up: a week off, or next week isn't published yet
    const off = weekOf(M!.nxt)?.weekOff;
    const msg = off ? `Week off${off.label ? `: ${off.label}` : ""}` : "Next week's schedule lands Friday.";
    const sub = off ? "Boomer is taking next week off. The usual routine is back after that." : `Check back then, or see <a href="/schedule/usual">Boomer's usual week</a>.`;
    heroEl.innerHTML = mascotEmpty(msg, sub, "h1");
    heroKey = "none";
    return;
  }
  const isLive = live(s), today = ymd(Date.now(), tz) === ymd(s.start, tz), dp = dayParts(s.start, tz);
  const kicker = isLive ? "Live now" : `${today ? "Tonight" : "Next stream"} · ${dp.dow} ${dp.month} ${dp.num}`;
  const frame = weekOf(s.week)?.hero?.frame || "bulbs";
  const d = delayedBy(s);
  const when = (d > 0 ? `<span class="bt-badge bt-badge--gold">Delayed ${esc(lengthText(d))}</span>` : "")
    + (isLive ? `<span class="bt-badge bt-badge--red"><span class="bt-badge-dot"></span>Live</span>` : "") + timeHtml(s);
  const meta = `${isBackstage(s) ? velvetHtml("Backstage · Fan Club") : platformsHtml(roomsOf(s).length ? roomsOf(s) : undefined)}`
    + (gamesLine(s) ? `<span>${gamesLine(s)}</span>` : "") + (s.crew?.captain ? `<span>Captain <b>${esc(handle(s.crew.captain))}</b></span>` : "");
  const watch = isBackstage(s) && visitor()
    ? `<a class="bt-btn bt-btn--primary" href="/account" data-signin="join" data-signin-title="Join to watch backstage streams">Join free to watch</a>`
    : `<a class="bt-btn bt-btn--primary" href="/live">${isLive ? "Watch live" : "Go to the live page"}</a>`;
  heroEl.innerHTML = marqueeHtml({
    frame, kicker, icon: s.theme?.icon || "", title: titleOf(s), whenHtml: when, clockHtml: isLive ? "" : flipClockHtml({ startsAt: s.start }), metaHtml: meta,
    ctaHtml: `${watch}<a class="bt-btn bt-btn--secondary" href="#pp-week">See the whole week</a>`,
    coversHtml: s.games.slice(0, 2).map((g) => coverHtml(coverOf(g.slug), { alt: g.title, eager: true })).join(""), label: "Next stream",
  });
  heroKey = `${s.id}:${s.state}:${isLive}`;
  if (!isLive) clocks = initFlipClocks(heroEl, { onZero: () => { window.setTimeout(refresh, 4000); } });
}

// ---------- This week at a glance (doors) ----------
function weekDays(week: string) {
  const mon = mondayOf(week);
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}
function exceptionFor(day: string): string | null {
  const x = M!.usual?.exceptions.find((e) => e.kind !== "skipPattern" && day >= e.from && day <= e.to);
  return x ? x.label : null;
}
function streamsOn(day: string, list: PubStream[]) { return list.filter((s) => ymd(s.start, M!.tz) === day); }
function dayStream(day: string, list: PubStream[]) {
  const on = streamsOn(day, list), now = Date.now();
  return on.find((s) => s.state !== "cancelled" && s.end >= now) || on[0] || null;
}
function doorFor(day: string, i: number, list: PubStream[], style: string) {
  const s = dayStream(day, list), dp = dayParts(zonedNoon(day), M!.tz);
  if (!s) return { id: day, day: dp.dow, num: dp.num, state: "off", style, index: i };
  const st = doorStateFor({ start: s.start, end: s.end, status: s.state === "cancelled" ? "cancelled" : undefined }, Date.now(), M!.tz);
  return { id: day, style, index: i, day: dp.dow, num: dp.num, state: st, icon: s.theme?.icon || "🎬", title: titleOf(s), timeText: timeRangeText(s.start, s.end, M!.tz), coverHtml: coverHtml(coverOf(s.games[0]?.slug), { alt: "", eager: true }), backstage: isBackstage(s) };
}
const zonedNoon = (day: string) => new Date(`${day}T18:00:00Z`).getTime();   // a safe instant inside that Central date

function renderGlance() {
  const list = M!.streams[M!.cur] || [];
  if (!list.length) { glanceEl.hidden = true; glanceEl.innerHTML = ""; return; }
  glanceEl.hidden = false;
  const days = weekDays(M!.cur), today = ymd(Date.now(), M!.tz);
  const style = doorStyleOverride || weekOf(M!.cur)?.hero?.doors || "jaws";
  if (!doorDay || !days.includes(doorDay)) doorDay = days.includes(today) ? today : (days.find((d) => dayStream(d, list) && dayStream(d, list)!.end >= Date.now()) || days[0]);
  const cells = days.map((day, i) => { const d: any = doorFor(day, i, list, style); return { id: day, html: doorHtml({ ...d, open: day === doorDay }), label: `${d.day} ${d.num}`, tonight: d.state === "tonight" }; });
  const ix = Math.max(0, days.indexOf(doorDay));
  const name = DOOR_STYLES.find((x) => x[0] === style)?.[1] || "Jaws";
  const stsw = `<span class="pp-stsw" role="group" aria-label="Door style"><button type="button" class="bt-chip bt-chip--small" data-dstep="-1" aria-label="Previous door style">‹</button><b data-dname>${esc(name)}</b><button type="button" class="bt-chip bt-chip--small" data-dstep="1" aria-label="Next door style">›</button></span>`;
  glanceEl.innerHTML = `<div data-pp-glance-in>${sectionHeadHtml({ icon: "🚪", title: "This week at a glance", count: list.length, sub: "Open a night for a quick look. The full tickets are below.", tools: stsw })}`
    + `<div class="pp-glance-doors" data-style="${esc(style)}">${sliderHtml({ cells, index: ix, label: "This week" })}</div><div class="pp-door-detail" data-pp-doordetail aria-live="polite"></div></div>`;
  glanceEl.dataset.style = style;
  renderDoorDetail();
  const inner = glanceEl.querySelector<HTMLElement>("[data-pp-glance-in]")!;
  initSlider(inner, { onChange: (_i, _c, id) => { doorDay = id || doorDay; renderDoorDetail(); } });
  initDoors(inner, { onOpen: (id) => { doorDay = id; renderDoorDetail(); } });
}
function renderDoorDetail() {
  const el = glanceEl.querySelector<HTMLElement>("[data-pp-doordetail]");
  if (!el || !doorDay) return;
  const list = M!.streams[M!.cur] || [], s = dayStream(doorDay, list), dp = dayParts(zonedNoon(doorDay), M!.tz), idx = weekDays(M!.cur).indexOf(doorDay);
  if (!s) {
    const why = exceptionFor(doorDay);
    el.innerHTML = `<b>${esc(DOW_LONG[idx])} is a day off.</b><span class="bt-meta">${why ? esc(why) : "Nothing is planned for this day."}</span>`;
    return;
  }
  const st = stateOf(s), d = delayedBy(s);
  const note = s.cancel ? `<span class="pp-why is-gray"><b>Off</b>${esc(s.cancel.reason || "This stream is cancelled.")}</span>` : d > 0 ? `<span class="pp-why"><b>Moved</b>${esc(s.delay?.reason || `Starts ${lengthText(d)} later than planned.`)}</span>` : "";
  el.innerHTML = `${s.theme ? themeChipHtml(s.theme) : ""}<span class="pp-dd-time">${timeHtml(s)}</span>${isBackstage(s) ? velvetHtml() : platformsHtml(roomsOf(s).length ? roomsOf(s) : undefined)}`
    + `<span class="bt-meta">${esc(s.games.map((g) => g.title).join(" · ") || "Games picked on stream")}</span>${note}`
    + `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm pp-dd-go" data-see="${esc(s.id)}" data-week="${esc(s.week)}">See the ticket ↓</button>`;
  void st; void dp;
}

// ---------- the week ----------
function tabsHtml() {
  const t = (id: "this" | "next", label: string) => `<button type="button" role="tab" class="bt-chip${tab === id ? " is-active" : ""}" aria-selected="${tab === id}" data-tab="${id}">${label}</button>`;
  return `<span class="pp-tabs" role="tablist" aria-label="Week">${t("this", "This week")}${t("next", "Next week")}</span>`;
}
function ticketFor(s: PubStream, open: boolean) {
  const tz = M!.tz, dp = dayParts(s.start, tz), st = stateOf(s), today = ymd(Date.now(), tz) === ymd(s.start, tz);
  const d = delayedBy(s);
  return ticketHtml({
    id: s.id, day: dp.dow, num: dp.num, month: dp.month, state: st === "scheduled" && today ? "tonight" : st, title: titleOf(s), icon: s.theme?.icon || "", timeHtml: timeHtml(s),
    was: d > 0 ? d : undefined, reason: s.cancel?.reason || s.delay?.reason || "", coversHtml: gameCovers(s), more: Math.max(0, s.plannedGameCount - Math.min(3, s.games.length)),
    platformsHtml: platformsHtml(roomsOf(s).length ? roomsOf(s) : undefined), backstage: isBackstage(s), crew: captainLine(s), open, interactive: true,
  });
}
function offTicket(day: string) {
  const dp = dayParts(zonedNoon(day), M!.tz);
  return ticketHtml({ day: dp.dow, num: dp.num, month: dp.month, state: "off", reason: exceptionFor(day) || "" });
}
function timelineHtml(list: PubStream[], week: string, sel: string) {
  const tz = M!.tz, days = weekDays(week), today = ymd(Date.now(), tz);
  const hourOf = (ms: number) => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(ms).map((x) => [x.type, Number(x.value)])); return p.hour + p.minute / 60; };
  const spans = list.map((s) => { const a = hourOf(s.start), b = a + (s.end - s.start) / 3600e3, o = s.delay?.originalStart != null ? hourOf(s.delay.originalStart) : null; return { s, a, b, o }; });
  const lo = Math.min(12, ...spans.map((x) => Math.floor(x.a))), hi = Math.max(25, ...spans.map((x) => Math.ceil(x.b))), n = hi - lo;
  const pos = (h: number) => `${(Math.max(0, Math.min(n, h - lo)) / n * 100).toFixed(2)}%`;
  const axis = Array.from({ length: n }, (_, i) => `<span>${hmText(`${String((lo + i) % 24).padStart(2, "0")}:00`)}</span>`).join("");
  const rows = days.map((day) => {
    const dp = dayParts(zonedNoon(day), tz);
    const blocks = spans.filter((x) => ymd(x.s.start, tz) === day).map(({ s, a, b, o }) => {
      const st = stateOf(s), cls = ["pp-blk", st === "ended" && "is-past", isBackstage(s) && "is-backstage", st === "live" && "is-live", st === "scheduled" && day === today && "is-tonight", st === "cancelled" && "is-cancelled", s.id === sel && "is-sel"].filter(Boolean).join(" ");
      const ghost = o != null && o !== a ? `<span class="pp-blk-ghost" style="left:${pos(o)};width:calc(${pos(o + (b - a))} - ${pos(o)})" aria-hidden="true"></span>` : "";
      return `${ghost}<span class="${cls}" role="button" tabindex="0" data-open="${esc(s.id)}" style="left:${pos(a)};width:calc(${pos(b)} - ${pos(a)})" aria-label="${esc(titleOf(s))}, ${esc(dp.dow)} ${dp.num}, ${esc(timeRangeText(s.start, s.end, tz))}">${coverHtml(coverOf(s.games[0]?.slug), { alt: "", eager: true })}${s.theme?.icon ? `<i aria-hidden="true">${esc(s.theme.icon)}</i>` : ""}<span class="pp-blk-t">${esc(titleOf(s))}</span><small>${esc(timeRangeText(s.start, s.end, tz))}</small></span>`;
    }).join("");
    const now = day === today ? `<span class="pp-now" style="left:${pos(hourOf(Date.now()))}" aria-hidden="true"></span>` : "";
    return `<div class="pp-tl-day${day === today ? " is-today" : ""}">${esc(dp.dow.toUpperCase())}<b>${dp.num}</b></div><div class="pp-tl-lane">${blocks}${now}</div>`;
  }).join("");
  return `<div class="pp-tl" style="--n:${n}" role="group" aria-label="The week as a timeline, Central time"><span></span><div class="pp-tl-axis">${axis}</div>${rows}</div>`;
}
function detailHtml(s: PubStream | undefined) {
  if (!s) return "";
  const tz = M!.tz, dp = dayParts(s.start, tz), st = stateOf(s), d = delayedBy(s), back = isBackstage(s);
  const kick = `${dp.dow} ${dp.month} ${dp.num} · ${st === "cancelled" ? "Cancelled" : st === "ended" ? "Ended" : st === "live" ? "Live now" : "Scheduled"}`;
  const srcOf = (g: PubStream["games"][number]) => g.kind === "modRequest" ? `<span class="bt-src bt-src--mod">Mod pick${g.byHandle ? ` · @${esc(g.byHandle)}` : ""}</span>`
    : g.kind === "ballot" ? `<span class="bt-src bt-src--vote">Votes${g.votes ? ` · ${esc(g.votes)}` : ""}</span>` : `<span class="bt-src bt-src--you">Boomer's pick</span>`;
  const list = s.games.map((g, i) => `<li><span class="n">${i + 1}</span>${coverHtml(coverOf(g.slug), { alt: g.title, cls: "bt-cover--sm", size: "sm" })}<span class="t">${esc(g.title)}</span>${srcOf(g)}</li>`).join("");
  const plan = s.games.length ? `<ul class="pp-gamelist">${list}</ul>` : `<p class="bt-meta">${s.plannedGameCount ? "Boomer picks the games on stream." : "The games aren't picked yet."}</p>`;
  const more = Math.max(0, s.plannedGameCount - s.games.length);
  const why = s.cancel ? `<span class="pp-why is-gray"><b>Why it's off</b>${esc(s.cancel.reason || "Boomer cancelled this stream.")}</span>` : d > 0 ? `<span class="pp-why"><b>Why it moved</b>${esc(s.delay?.reason || `Starts ${lengthText(d)} later than planned.`)}</span>` : "";
  const watch = back
    ? `<div class="bt-lock-card">${velvetHtml()}<span class="bt-meta">${visitor() ? "Fan Club is free. Join to watch backstage streams here on the site." : "It plays right here on boomertanger.com when it starts."}</span>${visitor() ? `<a class="bt-btn bt-btn--primary bt-btn--sm" href="/account" data-signin="join" data-signin-title="Join to watch backstage streams">Join free</a>` : ""}</div>`
    : `<span class="bt-label">Where to watch</span><div class="pp-where">${platformsHtml(roomsOf(s).length ? roomsOf(s) : undefined)}<a class="bt-btn bt-btn--secondary bt-btn--sm" href="/live">Go to the live page</a></div>`;
  const chats = s.crew?.chats && !back ? Object.entries(s.crew.chats) : [];
  const NAMES: Record<string, string> = { twitch: "Twitch", ytLandscape: "YT landscape", ytVertical: "YT vertical", tiktok: "TikTok" };
  const crew = chats.length ? `<span class="bt-label">Crew</span><div class="bt-rooms">${chats.map(([c, v]) => roomHtml({ chat: c, name: NAMES[c] || c, state: v.lead ? "covered" : "needed", text: v.lead ? `@${v.lead}` : "lead needed" })).join("")}</div>` : "";
  const tone = back ? "var(--bt-velvet)" : st === "cancelled" ? "var(--bt-gray)" : "var(--bt-title)";
  return `<div class="pp-detail" style="--tone:${tone}" aria-live="polite"><div class="pp-detail-games">${s.games.slice(0, 2).map((g) => coverHtml(coverOf(g.slug), { alt: g.title })).join("")}</div>`
    + `<div class="pp-detail-main"><span class="pp-kick">${esc(kick)}</span><h3 class="bt-heading pp-detail-title">${s.theme?.icon ? `${esc(s.theme.icon)} ` : ""}${esc(titleOf(s))}</h3><span class="pp-detail-time">${timeHtml(s)}</span>${why}`
    + `<span class="bt-label pp-plan-lab">The plan · ${s.games.length || s.plannedGameCount} ${(s.games.length || s.plannedGameCount) === 1 ? "game" : "games"}${more && s.games.length ? ` · +${more} picked on stream` : ""}</span>${plan}</div>`
    + `<div class="pp-detail-side">${watch}${crew}</div></div>`;
}

/** "Times in  Central | My time": only for a viewer whose clock differs from Central. */
function timesInHtml() {
  const zone = localZoneName(M!.tz);
  return zone ? `<span class="pp-timesin"><span class="bt-meta">Times in</span>${viewSwitchHtml({ key: "timesIn", label: "Times in", value: timesIn, options: [{ value: "central", label: "Central" }, { value: "local", label: `My time · ${zone}` }] })}</span>` : "";
}
function renderWeek() {
  const id = tab === "next" ? M!.nxt : M!.cur, list = M!.streams[id] || [], w = weekOf(id), mon = mondayOf(id);
  const cur = tab !== "next";
  const sub = `${rangeLabel(mon)}${cur && !(w?.state === "published" && M!.streams[M!.nxt]?.length) ? " · next week lands Friday" : ""}`;
  const head = sectionHeadHtml({ icon: "📅", title: cur ? "This week" : "Next week", count: list.length || null, sub, tools: `${tabsHtml()}${list.length ? viewSwitchHtml({ key: "weekView", label: "Week view", value: weekView, options: WEEK_VIEWS }) : ""}${list.length ? timesInHtml() : ""}` });
  let body = "";
  if (w?.weekOff && !list.length) {
    body = mascotEmpty(`Week off${w.weekOff.label ? `: ${w.weekOff.label}` : ""}`, cur ? "Boomer is taking this week off. There are no streams." : "Boomer is taking next week off. The usual routine is back after that.");
  } else if (!list.length) {
    body = cur ? mascotEmpty("Nothing scheduled this week yet", `See <a href="/schedule/usual">Boomer's usual week</a> for the routine, or check back soon.`)
      : mascotEmpty("Next week's schedule lands Friday.", `Boomer plans it with the community. You can <a href="/schedule/vote">vote on the games</a> while the ballot is open.`);
  } else {
    if (!selTicket[id] || !list.some((s) => s.id === selTicket[id])) selTicket[id] = (nextStream() && list.find((s) => s.id === nextStream()!.id)?.id) || list.find((s) => stateOf(s) !== "ended")?.id || list[0].id;
    const sel = selTicket[id];
    if (weekView === "timeline") body = `${timelineHtml(list, id, sel)}<div class="pp-agenda-note bt-meta">Tap a block for the details.</div>`;
    else {
      const days = weekDays(id), cells = days.map((day) => {
        const on = streamsOn(day, list);
        return on.length ? on.map((s) => ticketFor(s, s.id === sel)).join("") : (exceptionFor(day) ? offTicket(day) : "");
      }).join("");
      body = `<div class="bt-tickets">${cells}</div>`;
    }
    body += `<div data-pp-detail>${detailHtml(list.find((s) => s.id === sel))}</div>`;
  }
  weekEl.innerHTML = `<div class="pp-week" id="pp-week">${head}${body}</div>`;
  initTickets(weekEl, { onOpen: (sid) => selectTicket(sid) });
  initViewSwitch(weekEl, { onChange: (v, key) => {
    if (key === "timesIn") {
      timesIn = v === "local" ? "local" : "central"; try { localStorage.setItem("bt.schedule.timesIn", timesIn); } catch { /* fine */ }
      heroKey = ""; renderHero(); renderGlance(); renderWeek(); weekEl.querySelector<HTMLElement>('[data-key="timesIn"] [aria-checked="true"]')?.focus(); return;
    }
    weekView = v === "timeline" ? "timeline" : "tickets"; store.set(weekView); renderWeek(); weekEl.querySelector<HTMLElement>(`.bt-view-switch [aria-checked="true"]`)?.focus(); } });
}
function selectTicket(id: string) {
  const wk = tab === "next" ? M!.nxt : M!.cur;
  selTicket[wk] = id;
  const list = M!.streams[wk] || [];
  const box = weekEl.querySelector<HTMLElement>("[data-pp-detail]");
  if (box) box.innerHTML = detailHtml(list.find((s) => s.id === id));
  weekEl.querySelectorAll(".pp-blk").forEach((b) => b.classList.toggle("is-sel", (b as HTMLElement).dataset.open === id));
}

// ---------- call-out and usual-week strip ----------
function renderVote() {
  const b = M!.ballot;
  fillVoteCount(b);
  if (!b || b.state !== "open" || !b.games.length) { voteEl.hidden = true; voteEl.innerHTML = ""; return; }
  voteEl.hidden = false;
  const closes = b.closesAt ? `Closes ${dayTime(b.closesAt, M!.tz)}` : "";
  voteEl.innerHTML = `<div class="pp-callout"><span class="pp-callout-ic" aria-hidden="true"><svg viewBox="0 0 18 22"><path d="M9 1C9 1 2 9.5 2 14a7 7 0 0 0 14 0C16 9.5 9 1 9 1z"/></svg></span>`
    + `<div class="pp-callout-text"><h2 class="bt-heading">Vote for next week</h2><span class="bt-meta">${b.games.length} games on the ballot · ${b.votesPerMember} votes each${closes ? ` · ${esc(closes)}` : ""}</span></div>`
    + `<a class="bt-btn bt-btn--primary" href="/schedule/vote">${visitor() ? "See the ballot" : "Vote now"}</a></div>`;
}
function renderUsual() {
  const u = M!.usual;
  if (!u || !u.patterns.length) { usualEl.hidden = true; usualEl.innerHTML = ""; return; }
  usualEl.hidden = false;
  const posters = DOW_SHORT.map((d, i) => {
    const p = u.patterns.find((x) => x.dow === i + 1);
    return p ? posterHtml({ day: d, icon: p.icon || "🎬", label: p.label, timeText: rangeText(p.start, p.end), platformsHtml: platformsHtml(p.platforms.map((x) => (x === "youtube" ? "ytLandscape" : x))), backstage: p.membersOnly }) : posterHtml({ day: d, off: true });
  }).join("");
  usualEl.innerHTML = sectionHeadHtml({ icon: "🕯️", title: "Boomer's usual week", sub: "The routine. Each new week starts from this, then Boomer changes what's different.", tools: `<a class="bt-btn bt-btn--secondary bt-btn--sm" href="/schedule/usual">See the usual week</a>` })
    + `<div class="bt-posters">${posters}</div>`;
}

// ---------- render ----------
function statesKey() { return streamsFlat().map((s) => `${s.id}:${stateOf(s)}`).join("|"); }
function tickStates() {
  const k = statesKey();
  if (k !== stateKey) { render(); return; }
  const key = (() => { const s = nextStream(); return s ? `${s.id}:${s.state}:${live(s)}` : "none"; })();
  if (key !== heroKey) renderHero();
}
function render() {
  if (!M) return;
  if (!tab) {
    const thisHas = (M.streams[M.cur] || []).some((s) => stateOf(s) !== "ended") || !(M.streams[M.nxt] || []).length;
    tab = thisHas || weekOf(M.cur)?.weekOff ? "this" : "next";
  }
  root.removeAttribute("aria-busy");
  stateKey = statesKey();
  renderHero(); renderGlance(); renderWeek(); renderVote(); renderUsual();
}

// ---------- events ----------
root.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  const tabBtn = t.closest<HTMLElement>("[data-tab]");
  if (tabBtn && M) { tab = tabBtn.dataset.tab === "next" ? "next" : "this"; renderWeek(); weekEl.querySelector<HTMLElement>(`[data-tab="${tab}"]`)?.focus(); return; }
  const step = t.closest<HTMLElement>("[data-dstep]");
  if (step && M) {
    const cur = glanceEl.dataset.style || "jaws", ix = DOOR_STYLES.findIndex((x) => x[0] === cur);
    const nx = DOOR_STYLES[(ix + Number(step.dataset.dstep) + DOOR_STYLES.length) % DOOR_STYLES.length];
    doorStyleOverride = nx[0]; glanceEl.dataset.style = nx[0];
    setDoorStyle(glanceEl, nx[0]);
    glanceEl.querySelector(".pp-glance-doors")?.setAttribute("data-style", nx[0]);
    const nm = glanceEl.querySelector("[data-dname]"); if (nm) nm.textContent = nx[1];
    return;
  }
  const see = t.closest<HTMLElement>("[data-see]");
  if (see && M) {
    const wk = see.dataset.week!;
    tab = wk === M.nxt ? "next" : "this";
    selTicket[wk] = see.dataset.see!;
    renderWeek();
    const tk = weekEl.querySelector<HTMLElement>(`[data-ticket="${CSS.escape(see.dataset.see!)}"], [data-open="${CSS.escape(see.dataset.see!)}"]`);
    (tk || weekEl).scrollIntoView({ behavior: reduce() ? "auto" : "smooth", block: "center" });
    tk?.focus({ preventScroll: true });
  }
});
weekEl.addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>(".pp-blk"); if (b) selectTicket(b.dataset.open!); });
weekEl.addEventListener("keydown", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>(".pp-blk");
  if (b && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); selectTicket(b.dataset.open!); }
});

let first = true;
onAccess(async (s) => {
  auth = s;
  try {
    if (first) { M = await load(s); first = false; window.setInterval(refresh, 60000); document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); }); }
    else if (M && M.sample !== isSample(s)) M = await load(s);
    render();
  } catch (err) {
    console.error(err);
    root.removeAttribute("aria-busy");
    heroEl.innerHTML = `<div class="bt-notice bt-notice--error">The schedule didn't load. Refresh the page to try again.</div>`;
  }
});
