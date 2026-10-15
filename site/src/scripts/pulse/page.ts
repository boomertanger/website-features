// site/src/scripts/pulse/page.ts — /admin/pulse, Traffic Pulse's tool page (docs/specs/traffic-pulse.md §8; mockup traffic-pulse.html H1 / L1 / F1).
// The top bar (TRAFFIC PULSE wordmark, range chips, Compare), on Overview the hero (title, the H1 monitor drawn from the last 24 hours of real
// hourly visits, four .bt-kpi tiles), on every other tab a slim header with a tiny live pulse; the seven tabs (.bt-seg-nav, ?tab=); the L1
// Triage overview (Next best moves | Focus map, Goals; Visits; Top movers | Join path); Services (sortable table, cards on phones, CSV) with
// the service detail dialog (openModal, ?service= deep link); Audience; Health; Alerts; Reports; Settings (the owner and Overseers change
// them; Stewards see them read-only with the notice). States: skeletons, "No pulse yet", the low-data line, the stale Cloudflare row, the
// "Staging: sample data" badge. Writes go through pulseAdmin (admin green buttons); everything else is secondary.
import { isAdmin, isPreview, tierOf } from "../stash/gate";
import { whenReady } from "../../lib/auth";
import { messageFor } from "../../lib/errors";
import { toast } from "../../../../shared/ui/toast.js";
import { openModal } from "../../../../shared/ui/modal.js";
import { initSegNav } from "../../../../shared/ui/seg-nav.js";
import { chart } from "../../../../shared/ui/chart.js";
import { deltaHtml, kpiHtml, sparkHtml, tick } from "../../../../shared/ui/kpi.js";
import { focusMapHtml, initFocusMap, GROUPS } from "../../../../shared/ui/quadrant.js";
import { load, monitorData, today, addDays, RANGES, type Range, type PulseData, type Day, type Scored, type Alert } from "./data";

type Tab = "overview" | "services" | "audience" | "health" | "alerts" | "reports" | "settings";
type Filter = "all" | "visitors" | "members" | "streams";
const TABS: [Tab, string][] = [["overview", "Overview"], ["services", "Services"], ["audience", "Audience"], ["health", "Health"], ["alerts", "Alerts"], ["reports", "Reports"], ["settings", "Settings"]];
const root = document.querySelector<HTMLElement>("#tp-root");
const qs = new URLSearchParams(location.search);
const S = {
  tab: (TABS.some(([k]) => k === qs.get("tab")) ? qs.get("tab") : "overview") as Tab,
  range: (RANGES.some(([k]) => k === qs.get("range")) ? qs.get("range") : "28d") as Range,
  compare: qs.get("compare") !== "off", filter: "all" as Filter, sort: "score", alertFilter: "open", report: null as string | null,
  data: null as PulseData | null, monitor: null as Awaited<ReturnType<typeof monitorData>>, tier: "steward" as "owner" | "overseer" | "steward",
};
const DAY = 864e5;
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const fmt = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "–" : Math.round(n).toLocaleString("en-US"));
const short = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K` : fmt(n));
const pct = (x: number) => `${Math.round(x * 100)}%`;
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const mascot = () => document.getElementById("bt-mascot-tpl")?.innerHTML || "";
const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const ms = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root!.querySelector<T>(sel);
const canChange = () => S.tier !== "steward";
const nameOf = (id: string | null) => (id ? S.data?.scores?.services.find((s) => s.id === id)?.name || id : "Site");
const ALERT_IC: Record<string, string> = {
  spike: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-5 4 4 8-9"/><path d="M15 7h5v5"/></svg>',
  drop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l5 5 4-4 8 9"/><path d="M15 17h5v-5"/></svg>',
  silence: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12h6l2-4 4 8 2-4h6"/><path d="M3 3l18 18"/></svg>',
  slow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/></svg>',
  errors: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/></svg>',
  missing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1"/><path d="M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"/></svg>',
  goal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>',
  record: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
};
const SEV_BADGE: Record<string, string> = { urgent: '<span class="bt-badge bt-badge--red">Urgent</span>', watch: '<span class="bt-badge bt-badge--gold">Watch</span>', good: '<span class="bt-badge bt-badge--lime">Good news</span>' };
const STATE_BADGE: Record<string, (a: Alert) => string> = {
  new: () => '<span class="bt-badge bt-badge--blue">New</span>', ack: (a) => `<span class="bt-badge bt-badge--teal">Acknowledged${a.ack ? ` by ${esc(a.ack.name)}` : ""}</span>`,
  snoozed: () => '<span class="bt-badge bt-badge--gray">Snoozed</span>', resolved: () => '<span class="bt-badge bt-badge--lime">Resolved</span>',
};

async function act(data: Record<string, unknown>, ok: string) {
  if (isPreview()) { toast(`${ok} (preview: nothing saved)`); return { ok: true }; }
  try { const { call } = await import("../../lib/call"); const r = await call<Record<string, unknown>>("pulseAdmin", data); toast(ok); return r; }
  catch (err) { toast(messageFor(err, "Couldn't save that. Try again."), { kind: "error" }); return null; }
}

// ---------------------------------------------------------------------------------------------- numbers over the range
const rangeDays = () => RANGES.find(([k]) => k === S.range)![2];
function windowOf(offset = 0): Day[] {
  const d = S.data!, n = rangeDays(), end = addDays(today(), -n * offset), start = addDays(end, -n + 1);
  if (S.range === "12m" && d.months.length) return d.months.filter((m) => m.day >= start.slice(0, 7) + "-01" && m.day <= end);
  if (S.range === "today") { const t = offset ? addDays(today(), -7) : today(); return d.days.filter((x) => x.day === t); }
  return d.days.filter((x) => x.day >= start && x.day <= end);
}
const viewsOf = (x: Day) => (S.filter === "visitors" ? (x.views || 0) - (x.signedIn || 0) : S.filter === "members" ? x.signedIn || 0 : S.filter === "streams" ? x.live?.views || 0 : x.views || 0);
const sum = (list: Day[], f: (x: Day) => number) => list.reduce((a, x) => a + f(x), 0);
const change = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : 0);

// ---------------------------------------------------------------------------------------------- the monitor (H1)
function monitorSvg(m: NonNullable<typeof S.monitor> | null) {
  const W = 800, base = 205, step = W / 24;
  const grid = Array.from({ length: 17 }, (_, i) => `<line x1="${i * 50}" y1="0" x2="${i * 50}" y2="320"/>`).join("") + Array.from({ length: 7 }, (_, i) => `<line x1="0" y1="${i * 50 + 10}" x2="800" y2="${i * 50 + 10}"/>`).join("");
  if (!m) return `<svg viewBox="0 0 800 320" preserveAspectRatio="none" aria-hidden="true" focusable="false"><g class="tp-grid">${grid}</g><path class="tp-flat" d="M0 ${base} L800 ${base}"/></svg>`;
  const max = Math.max(1, ...m.hours, ...m.usual);
  const amp = (v: number) => Math.min(150, 6 + (v / max) * 144);
  let d = `M0 ${base}`, g = `M0 ${base}`;
  m.hours.forEach((v, i) => {
    const x = i * step, a = amp(v), u = amp(m.usual[i]);
    d += ` L${(x + step * 0.25).toFixed(1)} ${base} l4 -6 l4 6 L${(x + step * 0.45).toFixed(1)} ${base} l3 8 l5 ${-(a + 8)} l5 ${a + 16} l3 -8 L${(x + step * 0.78).toFixed(1)} ${base} l5 -10 l5 10 L${(x + step).toFixed(1)} ${base}`;
    g += ` L${(x + step * 0.45).toFixed(1)} ${base} l3 8 l5 ${-(u + 8)} l5 ${u + 16} l3 -8 L${(x + step).toFixed(1)} ${base}`;
  });
  const bands = m.liveHours.map((i) => `<g class="tp-onair"><rect x="${i * step}" y="0" width="${step}" height="320"/></g>`).join("") + (m.liveHours.length ? `<g class="tp-onair"><text x="${m.liveHours[0] * step + 6}" y="62">ON AIR</text></g>` : "");
  const lab = (h: number) => (h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`);
  const axis = [0, 6, 12, 18].map((i) => `<text x="${i * step + 6}" y="306">${lab((m.nowHour - 23 + i + 24) % 24)}</text>`).join("") + `<text x="770" y="306">Now</text>`;
  const sweep = reduce() ? "" : `<rect class="tp-sweep" x="-60" y="0" width="60" height="320" fill="url(#tp-sweep-g)"/>`;
  return `<svg viewBox="0 0 800 320" preserveAspectRatio="none" aria-hidden="true" focusable="false"><defs><linearGradient id="tp-sweep-g" x1="0" x2="1"><stop offset="0" class="tp-sweep-stop-0"/><stop offset="1" class="tp-sweep-stop-1"/></linearGradient></defs><g class="tp-grid">${grid}</g>${bands}<path class="tp-trace-ghost" d="${g}"/><path class="tp-trace" d="${d}"/>${sweep}<g class="tp-axis">${axis}</g></svg>`;
}
function liveHoursOf(m: NonNullable<typeof S.monitor>) {
  const now = Date.now(), out: number[] = [];
  for (const s of S.data?.streams || []) {
    if (!s.start) continue;
    for (let i = 0; i < 24; i++) { const hs = now - (23 - i) * 3600e3 - (now % 3600e3), he = hs + 3600e3; if (s.start < he && (s.end || now) > hs) out.push(i); }
  }
  m.liveHours = [...new Set(out)];
}
const pulseMini = (m: typeof S.monitor) => { const v = m ? m.hours.slice(-12) : []; const mx = Math.max(1, ...v); const d = v.map((x, i) => `${i ? "L" : "M"}${(i / Math.max(1, v.length - 1)) * 120} ${26 - (x / mx) * 20}`).join(""); return `<svg viewBox="0 0 120 30" preserveAspectRatio="none" aria-hidden="true"><path d="${d || "M0 26 L120 26"}"/></svg>`; };

function heroHtml() {
  const d = S.data!, m = S.monitor, flat = !m;
  const cur = windowOf(0), prev = windowOf(1);
  const series = (f: (x: Day) => number) => cur.map(f), pseries = (f: (x: Day) => number) => prev.map(f);
  const views = sum(cur, viewsOf), pv = sum(prev, viewsOf), uq = sum(cur, (x) => x.uniques || 0), pu = sum(prev, (x) => x.uniques || 0);
  const eng = views ? sum(cur, (x) => x.engaged || 0) / Math.max(1, sum(cur, (x) => x.views || 0)) : 0, peng = sum(prev, (x) => x.engaged || 0) / Math.max(1, sum(prev, (x) => x.views || 0));
  const nm = sum(cur, (x) => x.newMembers || 0), pnm = sum(prev, (x) => x.newMembers || 0);
  const kp = flat && !cur.length ? ["Visitors", "Page views", "Engaged views", "New members"].map((l) => kpiHtml({ label: l, empty: true })).join("") : [
    kpiHtml({ label: "Visitors", value: short(uq), delta: deltaHtml(change(uq, pu)), spark: series((x) => x.uniques || 0), prev: S.compare ? pseries((x) => x.uniques || 0) : null, id: "visitors" }),
    kpiHtml({ label: "Page views", value: short(views), delta: deltaHtml(change(views, pv)), spark: series(viewsOf), prev: S.compare ? pseries(viewsOf) : null, id: "views" }),
    kpiHtml({ label: "Engaged views", value: String(Math.round(eng * 100)), unit: "%", delta: deltaHtml(Math.round((eng - peng) * 100), { label: `${Math.abs(Math.round((eng - peng) * 100))} pts` }), spark: series((x) => (x.views ? (x.engaged || 0) / x.views : 0)), prev: S.compare ? pseries((x) => (x.views ? (x.engaged || 0) / x.views : 0)) : null, id: "engaged" }),
    kpiHtml({ label: "New members", value: short(nm), delta: deltaHtml(change(nm, pnm)), spark: series((x) => x.newMembers || 0), prev: S.compare ? pseries((x) => x.newMembers || 0) : null, id: "members" }),
  ].join("");
  const hour = m ? m.hours[m.hours.length - 1] : 0, usualNow = m ? Math.round(m.usual[m.usual.length - 1]) : 0;
  const tags = flat ? `<span class="tp-scr-tag tl">No signal yet</span>` : `<span class="tp-scr-tag tl">Last 24 hours</span><span class="tp-scr-tag tr"><b>${fmt(hour)}</b> visits this hour</span><span class="tp-scr-tag bl">Usual for a ${esc(m!.weekday)}: ${fmt(usualNow)}</span>`;
  const rec = celebration();
  void d;
  return `<section class="tp-hero" aria-label="Site pulse">
    <div class="tp-hero-l">
      <div class="tp-hero-head"><h1 class="bt-title">Traffic Pulse</h1><span class="bt-badge bt-badge--admin">Staff</span><p>How the site is doing, and what to work on next.</p></div>
      <div class="tp-bezel${rec ? " is-cele" : ""}"><div class="tp-screen" role="img" aria-label="${flat ? "No visits counted yet" : `Visits per hour over the last 24 hours: ${fmt(hour)} this hour, usual ${fmt(usualNow)}`}">${monitorSvg(m)}${tags}<div class="tp-flash"></div>${rec ? `<div class="tp-cele-chip">Record day<small>${fmt(Number(rec.facts.views))} visits, best ever</small></div>` : ""}</div></div>
      <p class="tp-scene-cap">${flat ? "Real counting starts at launch on boomertanger.com." : "Faint line: a usual day like today. Bright line: the last 24 hours. Red band: when you were live."}</p>
    </div>
    <div class="tp-kpis">${kp}</div>
  </section>`;
}
function celebration() { return (S.data?.alerts || []).find((a) => a.type === "record" && a.state === "new" && a.firstAt && Date.now() - a.firstAt < 36 * 3600e3) || null; }

// ---------------------------------------------------------------------------------------------- Overview (L1 Triage)
const QBADGE: Record<string, string> = { expand: "lime", fix: "gold", spotlight: "blue", rethink: "gray" };
const level = (n: number) => `<span class="bt-level" data-level="${n}" data-of="4" aria-hidden="true"><i></i><i></i><i></i><i></i></span>`;
function movesCard() {
  const d = S.data!, list = d.moves;
  const items = list.map((m) => `<li class="tp-move${m.done ? " is-done" : ""}"><div><div class="tp-move-top"><span class="bt-badge bt-badge--${QBADGE[m.group] || "gray"}">${esc(GROUPS[m.group as keyof typeof GROUPS]?.name || m.group)}</span><strong>${esc(m.title)}</strong><span class="tp-impact">${level(m.impact)}<span class="bt-sr-only">Impact ${m.impact} of 4</span> Impact</span></div><p>${esc(m.text)}</p><div class="tp-move-ev">${m.evidence.map((e) => `<span class="tp-ev">${esc(e)}</span>`).join("")}</div><div class="tp-move-act"><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-open="${esc(m.service)}">${esc(m.action)}</button><button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-done="${esc(m.id)}" data-is-done="${m.done ? "1" : ""}">${m.done ? "Undo" : "Mark done"}</button></div></div></li>`).join("");
  return `<section class="bt-card tp-card a-moves"><div class="bt-card-head"><h2 class="bt-heading">Next best moves</h2><span class="bt-card-meta">${d.scores ? `Updated ${dayLabel(d.scores.day)}` : ""}</span></div><p class="tp-card-sub">Ranked by how many people it touches times the size of the gap. Each one shows its evidence.</p>${items ? `<ol class="tp-moves">${items}</ol>` : `<p class="tp-low">No moves yet. They're worked out every night once there's a week of visits.</p>`}</section>`;
}
function mapCard() {
  const list = (S.data!.scores?.services || []).filter((s) => s.ok);
  return `<section class="bt-card tp-card a-map" data-map><div class="bt-card-head"><h2 class="bt-heading">Focus map</h2><span class="bt-card-meta">Engaged % up, views across</span></div><p class="tp-card-sub">Every service sorted into four groups. Bubble size is views. Tap one to open it.</p>${focusMapHtml({ items: list.map((s) => ({ id: s.id, name: s.name, x: s.views, y: s.eng, utility: s.utility })), split: { x: list[0]?.median, y: 0.5 } })}</section>`;
}
function goalProgress(g: PulseData["goals"][number]) {
  const month = today().slice(0, 7), days = S.data!.days.filter((x) => x.day.startsWith(month));
  const now = g.kind === "visitors" ? sum(days, (x) => x.uniques || 0) : g.kind === "members" || g.kind === "fanClub" ? sum(days, (x) => x.newMembers || 0) : g.kind === "returnRate" ? (sum(days, (x) => x.members || 0) ? (sum(days, (x) => x.memberReturns || 0) / sum(days, (x) => x.members || 0)) * 100 : 0) : (S.data!.scores?.services.find((s) => s.id === g.service)?.views || 0);
  const [y, mo] = month.split("-").map(Number), dim = new Date(Date.UTC(y, mo, 0)).getUTCDate(), dom = Number(today().slice(8, 10));
  const f = g.target > 0 ? now / g.target : 0, at = dom / dim;
  const state = g.kind === "returnRate" ? (f >= 0.97 ? "on" : "behind") : f >= at * 1.05 ? "ahead" : f >= at * 0.95 ? "on" : "behind";
  return { now, f, at, state, dom, dim };
}
const GOAL_NAME: Record<string, string> = { visitors: "Monthly visitors", members: "New members", fanClub: "Fan Club joins", returnRate: "Member return rate", serviceViews: "Views on" };
function goalsCard() {
  const goals = S.data!.goals;
  const rows = goals.map((g) => {
    const p = goalProgress(g), unit = g.kind === "returnRate" ? "%" : "";
    const badge = p.state === "ahead" ? '<span class="bt-badge bt-badge--lime">Ahead</span>' : p.state === "on" ? '<span class="bt-badge bt-badge--blue">On pace</span>' : '<span class="bt-badge bt-badge--gold">Behind</span>';
    const color = p.state === "ahead" ? "var(--bt-lime)" : p.state === "on" ? "var(--bt-blue)" : "var(--bt-gold)";
    const name = g.kind === "serviceViews" ? `${GOAL_NAME[g.kind]} ${nameOf(g.service)}` : g.label || GOAL_NAME[g.kind];
    return `<div><div class="tp-goal-top"><strong>${esc(name)}</strong>${badge}<span class="tp-sp"></span><span><b>${fmt(p.now)}${unit}</b> of ${fmt(g.target)}${unit}</span></div><div class="bt-meter" style="--bt-meter-color:${color}"><div class="bt-meter-track" role="meter" aria-valuemin="0" aria-valuemax="${g.target}" aria-valuenow="${Math.round(p.now)}" aria-label="${esc(name)}"><div class="bt-meter-fill" style="width:${Math.min(100, p.f * 100).toFixed(0)}%"></div>${g.kind === "returnRate" ? "" : `<span class="tp-goal-mark" style="left:${(p.at * 100).toFixed(1)}%" title="Where you should be today"></span>`}</div></div></div>`;
  }).join("");
  const p0 = goals[0] ? goalProgress(goals[0]) : null;
  const monthName = new Date(`${today()}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  return `<section class="bt-card tp-card a-goals"><div class="bt-card-head"><h2 class="bt-heading">${esc(monthName)} goals</h2><span class="bt-card-meta">${p0 ? `Day ${p0.dom} of ${p0.dim}` : ""}</span></div>${rows ? `<div class="tp-goals">${rows}</div><p class="tp-goal-note">The tick on each bar is where you should be today.</p>` : `<p class="tp-low">No goals yet. ${canChange() ? "Add one in Settings." : "The owner or an Overseer can add them in Settings."}</p>`}</section>`;
}
function trendCard() {
  return `<section class="bt-card tp-card a-trend"><div class="bt-card-head"><h2 class="bt-heading">Visits</h2><span class="bt-card-meta">${esc(RANGES.find(([k]) => k === S.range)![1])}${S.filter !== "all" ? ` · ${esc(FILTERS.find(([k]) => k === S.filter)![1])}` : ""}</span></div><div data-trend></div><div class="tp-key"><span><i style="--c:var(--bt-title)"></i>This period</span>${S.compare ? `<span><i class="d" style="--c:var(--bt-gray)"></i>Previous period</span>` : ""}<span><i class="b" style="--c:rgba(var(--bt-red-rgb),0.35)"></i>Stream days</span><span><i class="r" style="--c:var(--bt-blue)"></i>Notes</span></div></section>`;
}
function drawTrend(el: HTMLElement | null, service: string | null = null, daysOverride: Day[] | null = null) {
  if (!el) return;
  const d = S.data!, n = S.range === "today" ? 7 : rangeDays();
  const t1 = ms(today()), t0 = t1 - (n - 1) * DAY;
  const src = daysOverride || d.days;
  const pts = src.filter((x) => ms(x.day) >= t0 && ms(x.day) <= t1).map((x) => ({ t: ms(x.day), v: viewsOf(x) }));
  const cmp = S.compare ? src.filter((x) => ms(x.day) >= t0 - n * DAY && ms(x.day) < t0).map((x) => ({ t: ms(x.day) + n * DAY, v: viewsOf(x) })) : [];
  const live = [...new Set(d.streams.filter((s) => s.start).map((s) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date(s.start!))))].map((k) => ({ from: ms(k) - DAY / 2, to: ms(k) + DAY / 2, tone: "live" }));
  const pins = d.notes.filter((x) => (service ? x.service === service || !x.service : true)).filter((x) => ms(x.day) >= t0 && ms(x.day) <= t1).sort((a, b) => (a.day < b.day ? -1 : 1)).map((x) => ({ t: ms(x.day), title: x.text, date: dayLabel(x.day) }));
  chart(el, { series: [{ key: "visits", label: "Visits", points: pts, color: "var(--bt-title)", area: true }], t0, t1, zero: true, compare: cmp.length ? { label: "Previous period", points: cmp } : undefined, eras: live, pins, label: `Visits per day${service ? ` on ${nameOf(service)}` : ""}, with the previous period, stream days and notes`, empty: "No visits in this range yet." });
}
function moversCard() {
  const list = (S.data!.scores?.services || []).filter((s) => s.ok && s.prevViews > 0).map((s) => ({ s, c: change(s.views, s.prevViews) }));
  const up = [...list].sort((a, b) => b.c - a.c).slice(0, 5), down = [...list].sort((a, b) => a.c - b.c).slice(0, 5);
  const row = ({ s, c }: { s: Scored; c: number }) => `<div class="tp-mrow"><button type="button" data-open="${esc(s.id)}">${esc(s.name)}</button><small>${fmt(s.views)}</small>${deltaHtml(c)}</div>`;
  return `<section class="bt-card tp-card a-movers"><div class="bt-card-head"><h2 class="bt-heading">Top movers</h2><span class="bt-card-meta">Views, 28 days vs the 28 before</span></div>${list.length ? `<div class="tp-movers"><div><h4 class="bt-label">Rising</h4>${up.map(row).join("")}</div><div><h4 class="bt-label">Falling</h4>${down.map(row).join("")}</div></div>` : `<p class="tp-low">Movers show once there are two 28-day periods to compare.</p>`}</section>`;
}
function pathCard() {
  const j = S.data!.scores?.join;
  if (!j) return `<section class="bt-card tp-card a-path"><div class="bt-card-head"><h2 class="bt-heading">Join path</h2></div><p class="tp-low">The join path shows after the first nightly close.</p></section>`;
  const top = Math.max(1, j.steps[0].n);
  return `<section class="bt-card tp-card a-path"><div class="bt-card-head"><h2 class="bt-heading">Join path</h2><span class="bt-card-meta">28 days, site-wide</span></div><div class="tp-path">${j.steps.map((st) => `<div class="tp-step${j.weakest && j.weakest.key === st.key ? " is-leak" : ""}"><div class="tp-step-bar"><i style="--h:${Math.max(2, (st.n / top) * 100).toFixed(1)}"></i></div><b>${short(st.n)}</b><span>${esc(st.label)}</span><em>${st.drop != null ? `−${pct(st.drop)}` : "&nbsp;"}</em></div>`).join("")}</div>${j.weakest ? `<p class="tp-card-sub" style="margin:0">The biggest drop is at <b>${esc(j.weakest.label)}</b> (gold).</p>` : ""}</section>`;
}
const FILTERS: [Filter, string][] = [["all", "All traffic"], ["visitors", "Visitors"], ["members", "Members"], ["streams", "During streams"]];
function overviewHtml() {
  return `<div class="tp-ov">${movesCard()}${mapCard()}${goalsCard()}${trendCard()}${moversCard()}${pathCard()}</div>`;
}

// ---------------------------------------------------------------------------------------------- Services
const SORTS: [string, string, (s: Scored) => number][] = [["score", "Pulse score", (s) => s.score ?? -1], ["views", "Views", (s) => s.views], ["change", "Change", (s) => change(s.views, s.prevViews)], ["engaged", "Engaged", (s) => s.eng], ["health", "Health", (s) => s.health], ["love", "Love", (s) => s.love ?? -1]];
const scoreRing = (s: Scored) => `<span class="tp-score" data-q="${s.group || ""}" style="--s:${s.score ?? 0}"><span>${s.score ?? "–"}</span></span>`;
const vit = (v: number) => `<span class="tp-vit" aria-hidden="true"><i style="--v:${Math.max(0, Math.min(100, v))}"></i></span>`;
function servicesHtml() {
  const list = [...(S.data!.scores?.services || [])].sort((a, b) => SORTS.find(([k]) => k === S.sort)![2](b) - SORTS.find(([k]) => k === S.sort)![2](a));
  if (!list.length) return emptyHtml("No services yet", "Services show here after the first nightly close.");
  const sortbar = `<div class="tp-sortbar"><span>Sort</span>${SORTS.map(([k, l]) => `<button type="button" class="bt-chip bt-chip--small${S.sort === k ? " is-active" : ""}" aria-pressed="${S.sort === k}" data-sort="${k}">${l}</button>`).join("")}<span class="tp-sp"></span><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-csv="services">Download CSV</button></div>`;
  const rows = list.map((s) => `<tr class="tp-svc-row" tabindex="0" data-open="${esc(s.id)}"><td><div class="tp-svc-name">${scoreRing(s)}<div><b>${esc(s.name)}</b><small>${s.ok ? (s.group === "rethink" && s.utility ? "Rethink · fine for a utility" : GROUPS[s.group!].name) : "Not enough visits to judge yet."}</small></div></div></td><td class="bt-chart-num">${fmt(s.views)}</td><td>${s.prevViews ? deltaHtml(change(s.views, s.prevViews)) : "–"}</td><td class="bt-chart-num">${pct(s.eng)}</td><td>${vit(s.health)} ${s.health}</td><td>${s.love == null ? '<span class="tp-low">under 3 ratings</span>' : `${vit(s.love)} ${s.love}`}</td></tr>`).join("");
  const cards = list.map((s) => `<button type="button" class="tp-svc-card" data-open="${esc(s.id)}">${scoreRing(s)}<div><b>${esc(s.name)}</b><div class="tp-svc-meta"><span>${fmt(s.views)} views</span><span>${pct(s.eng)} engaged</span><span>health ${s.health}</span></div></div>${s.prevViews ? deltaHtml(change(s.views, s.prevViews)) : ""}</button>`).join("");
  return `${sortbar}<div class="bt-table-wrap tp-svc-table"><table class="bt-table"><thead><tr><th scope="col">Service</th><th scope="col" class="bt-chart-num">Views</th><th scope="col">Change</th><th scope="col" class="bt-chart-num">Engaged</th><th scope="col">Health</th><th scope="col">Love</th></tr></thead><tbody>${rows}</tbody></table></div><div class="tp-svc-cards">${cards}</div><p class="tp-low">28 days, as of ${S.data!.scores ? dayLabel(S.data!.scores.day) : "–"}. A service needs 50 views in 28 days before it's judged.</p>`;
}

// ---------------------------------------------------------------------------------------------- the service detail dialog
async function openDetail(id: string) {
  const d = S.data!, s = d.scores?.services.find((x) => x.id === id);
  if (id === "join") { setTab("overview"); document.querySelector(".a-path")?.scrollIntoView({ behavior: reduce() ? "auto" : "smooth" }); return; }
  const url = new URL(location.href); url.searchParams.set("service", id); history.replaceState(history.state, "", url);
  document.dispatchEvent(new CustomEvent("bt:overlay-open", { detail: { source: "traffic-pulse" } }));
  const vital = (label: string, v: number | null, note: string) => `<div class="tp-d-v"><span>${label}</span><b>${v == null ? "–" : v}</b><div class="tp-vbar"><i style="--v:${v ?? 0}"></i></div><small>${note}</small></div>`;
  const notes = d.notes.filter((n) => n.service === id).sort((a, b) => (a.day < b.day ? 1 : -1));
  const content = `<div class="tp-d">
    <div class="tp-d-head">${s ? scoreRing(s) : ""}<div><h2 class="bt-modal-title">${esc(s?.name || id)}</h2>${s?.group ? `<span class="bt-badge bt-badge--${QBADGE[s.group]}">${GROUPS[s.group].name}</span>` : `<span class="tp-low">Not enough visits to judge yet.</span>`}</div></div>
    ${s ? `<div class="tp-d-vitals">${vital("Reach", s.reach, `${fmt(s.views)} views in 28 days`)}${vital("Engagement", s.engagement, `${pct(s.eng)} stayed 10 s or more`)}${vital("Health", s.health, s.errPerK ? `${s.errPerK} errors per 1,000 views` : "speed, errors, links")}${vital("Love", s.love, s.love == null ? "needs 3 member ratings" : "Service Hub ratings")}</div>` : ""}
    <div><h4 class="bt-label">Visits</h4><div data-d-trend></div></div>
    <div class="tp-d-cols"><div><h4 class="bt-label">Pages</h4><div class="tp-d-list" data-d-pages><div><span class="bt-skeleton" style="height:14px;width:100%"></span></div></div></div><div><h4 class="bt-label">Clicked</h4><div class="tp-d-list" data-d-ctas><div><span class="bt-skeleton" style="height:14px;width:100%"></span></div></div></div></div>
    <div><h4 class="bt-label">Notes</h4><div class="tp-d-list">${notes.map((n) => `<div><span>${esc(n.text)}${n.by ? ` <small>${esc(n.by.name)}</small>` : ""}</span><b>${dayLabel(n.day)}</b></div>`).join("") || `<div><span>No notes yet.</span></div>`}</div>
      <form class="tp-d-note" data-d-note><label class="bt-sr-only" for="tp-note-in">Add a note</label><input class="bt-input" id="tp-note-in" maxlength="200" placeholder="What changed? (shown as a pin on the charts)" /><button type="submit" class="bt-btn bt-btn--admin bt-btn--sm">Add note</button></form></div>
  </div>`;
  const mod = openModal({ title: s?.name || id, content, wide: true, feature: "traffic-pulse", onClose: () => { const u = new URL(location.href); u.searchParams.delete("service"); history.replaceState(history.state, "", u); } });
  const box = mod.modal as HTMLElement;
  // this service's own days (the preview scales the site's)
  let days: Day[] = [];
  const n = Math.max(28, rangeDays());
  if (isPreview()) { const share = s ? s.views / Math.max(1, sum(d.days.slice(-28), (x) => x.views || 0)) : 0.05; days = d.days.map((x) => ({ ...x, views: Math.round((x.views || 0) * share), signedIn: Math.round((x.signedIn || 0) * share), live: { views: Math.round((x.live?.views || 0) * share) }, ctas: Object.fromEntries(Object.entries(x.ctas || {}).map(([k, v]) => [k, Math.round(v * share)])) })); }
  else {
    try {
      const { db, collection, getDocs, query, where, SITE_ID } = await import("../../lib/db");
      const { documentId } = await import("firebase/firestore/lite");
      const snap = await getDocs(query(collection(db, "sites", SITE_ID, "pulse", "main", "services", id, "days"), where(documentId(), ">=", addDays(today(), -n * 2 + 1)), where(documentId(), "<=", today())));
      days = snap.docs.map((x) => ({ day: x.id, ...x.data() }) as Day);
      const ps = await getDocs(query(collection(db, "sites", SITE_ID, "pulse", "main", "paths"), where("service", "==", id)));
      const rows = await Promise.all(ps.docs.slice(0, 15).map(async (p) => { const ds = await getDocs(query(collection(db, `${p.ref.path}/days`), where(documentId(), ">=", addDays(today(), -27)))); return { path: p.get("path") as string, views: ds.docs.reduce((a, x) => a + (x.get("views") || 0), 0), engaged: ds.docs.reduce((a, x) => a + (x.get("engaged") || 0), 0) }; }));
      fillPages(box, rows);
    } catch (err) { console.warn("pulse: couldn't read the service", err); }
  }
  if (isPreview()) fillPages(box, s ? [{ path: `/${id === "home" ? "" : id}`, views: Math.round(s.views * 0.7), engaged: Math.round(s.views * 0.7 * s.eng) }, { path: `/${id}/how-it-works`, views: Math.round(s.views * 0.3), engaged: Math.round(s.views * 0.3 * s.eng * 0.9) }] : []);
  drawTrend(box.querySelector("[data-d-trend]"), id, days);
  const ctas: Record<string, number> = {};
  days.filter((x) => x.day >= addDays(today(), -27)).forEach((x) => Object.entries(x.ctas || {}).forEach(([k, v]) => (ctas[k] = (ctas[k] || 0) + v)));
  box.querySelector("[data-d-ctas]")!.innerHTML = Object.entries(ctas).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `<div><code>${esc(k)}</code><b>${fmt(v)}</b></div>`).join("") || `<div><span>No tracked clicks in 28 days. Add data-pulse ids to this service's key buttons.</span></div>`;
  box.querySelector<HTMLFormElement>("[data-d-note]")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const inp = box.querySelector<HTMLInputElement>("#tp-note-in")!, text = inp.value.trim();
    if (text.length < 2) { inp.focus(); return; }
    const r = await act({ action: "noteAdd", service: id, text }, "Note added.");
    if (r) { S.data!.notes.push({ id: String((r as { id?: string }).id || Date.now()), day: today(), service: id, text, auto: null, by: { name: "You" } }); inp.value = ""; drawTrend(box.querySelector("[data-d-trend]"), id, days); }
  });
}
function fillPages(box: HTMLElement, rows: { path: string; views: number; engaged: number }[]) {
  const el = box.querySelector("[data-d-pages]");
  if (el) el.innerHTML = rows.sort((a, b) => b.views - a.views).slice(0, 10).map((r) => `<div><code>${esc(r.path)}</code><b>${fmt(r.views)} · ${r.views ? pct(r.engaged / r.views) : "–"}</b></div>`).join("") || `<div><span>No page views in 28 days.</span></div>`;
}

// ---------------------------------------------------------------------------------------------- Audience
const bar = (label: string, n: number, max: number, c = "var(--bt-title)", ic = "") => `<div class="tp-bar"><span>${ic}${esc(label)}</span><span class="tp-track"><i style="--f:${max ? (n / max).toFixed(3) : 0};--c:${c}"></i></span><b>${fmt(n)}</b></div>`;
const PI: Record<string, string> = { "twitch.tv": "twitch", "youtube.com": "youtube", "tiktok.com": "tiktok", "google.com": "google" };
function audienceHtml() {
  const d = S.data!, cur = windowOf(0), n = rangeDays(), from = addDays(today(), -n + 1);
  const refs: Record<string, number> = {}, tags: Record<string, number> = {};
  d.sources.filter((x) => x.day >= from).forEach((x) => { Object.entries(x.refs || {}).forEach(([k, v]) => (refs[k] = (refs[k] || 0) + v)); Object.entries(x.tags || {}).forEach(([k, v]) => (tags[k] = (tags[k] || 0) + v)); });
  const views = sum(cur, (x) => x.views || 0), direct = Math.max(0, views - Object.values(refs).reduce((a, b) => a + b, 0));
  const srcs = [...Object.entries(refs).map(([k, v]) => [k.replace(/_/g, "."), v] as [string, number]), ["Direct or unknown", direct] as [string, number]].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const mx = Math.max(1, ...srcs.map(([, v]) => v));
  const live = sum(cur, (x) => x.live?.views || 0);
  const dev: Record<string, number> = {}; cur.forEach((x) => Object.entries(x.devices || {}).forEach(([k, v]) => (dev[k] = (dev[k] || 0) + v)));
  const devTot = Math.max(1, Object.values(dev).reduce((a, b) => a + b, 0));
  const countries: Record<string, number> = {}; cur.forEach((x) => Object.entries(x.cf?.countries || {}).forEach(([k, v]) => (countries[k] = (countries[k] || 0) + v)));
  const cTop = Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 8), cMax = Math.max(1, ...cTop.map(([, v]) => v));
  const tagList = Object.entries(tags).sort((a, b) => b[1] - a[1]), tMax = Math.max(1, ...tagList.map(([, v]) => v));
  const label = (t: string) => d.refs.find((r) => r.tag === t)?.label || t;
  const split = (parts: [string, number, string][], tot: number) => `<div class="tp-split" role="img" aria-label="${parts.map(([l, v]) => `${l} ${pct(v / tot)}`).join(", ")}">${parts.map(([, v, c]) => `<i style="width:${((v / tot) * 100).toFixed(1)}%;--c:${c}"></i>`).join("")}</div><div class="tp-split-key">${parts.map(([l, v, c]) => `<span><i style="--c:${c}"></i>${esc(l)} <b>${pct(v / tot)}</b></span>`).join("")}</div>`;
  return `<div class="tp-two">
    <section class="bt-card tp-card"><div class="bt-card-head"><h2 class="bt-heading">Where visits come from</h2><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-csv="sources">CSV</button></div><div class="tp-bars">${srcs.map(([k, v]) => bar(k, v, mx, "var(--bt-title)", PI[k] ? `<span class="bt-sr-only"></span>` : "")).join("")}</div></section>
    <div style="display:grid;gap:16px">
      <section class="bt-card tp-card"><div class="bt-card-head"><h2 class="bt-heading">Live vs off air</h2></div>${split([["During streams", live, "var(--bt-red)"], ["Off air", Math.max(0, views - live), "var(--bt-gray)"]], Math.max(1, views))}</section>
      <section class="bt-card tp-card"><div class="bt-card-head"><h2 class="bt-heading">Devices</h2></div>${split([["Phones", dev.phone || 0, "var(--bt-title)"], ["Computers", dev.desktop || 0, "var(--bt-blue)"], ["Tablets", dev.tablet || 0, "var(--bt-teal)"]], devTot)}</section>
    </div>
    <section class="bt-card tp-card"><div class="bt-card-head"><h2 class="bt-heading">Top countries</h2><span class="bt-card-meta">Cloudflare</span></div>${cTop.length ? `<div class="tp-bars">${cTop.map(([k, v]) => bar(k.replace(/_/g, "."), v, cMax, "var(--bt-blue)")).join("")}</div>` : `<p class="tp-low">${d.settings.cf?.status === "ok" ? "No country data in this range." : "Cloudflare: not connected."}</p>`}</section>
    <section class="bt-card tp-card"><div class="bt-card-head"><h2 class="bt-heading">Redirect domains and ref tags</h2></div>${tagList.length ? `<div class="tp-bars tp-bars--stack">${tagList.map(([k, v]) => bar(`${label(k)} (${k})`, v, tMax, "var(--bt-teal)")).join("")}</div>` : `<p class="tp-low">No tagged visits in this range. Make a tag in Settings and use it in a link: ?ref=your-tag.</p>`}</section>
    <section class="bt-card tp-card" style="grid-column:1/-1"><div class="bt-card-head"><h2 class="bt-heading">Streams</h2><span class="bt-card-meta">Visits during the stream and the hour after</span></div>${d.streams.length ? d.streams.slice(0, 10).map((s) => `<div class="tp-stream"><strong>${esc(s.title || "Stream")}</strong><b>${fmt(s.visits)} visits</b><small><span>${s.start ? new Date(s.start).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }) : ""}</span><span>${fmt(s.joins)} joins</span><span>Twitch ${fmt(s.refs?.twitch || 0)} · YouTube ${fmt(s.refs?.youtube || 0)} · TikTok ${fmt(s.refs?.tiktok || 0)}</span>${s.peakMinute ? `<span>Peak minute ${fmt(s.peakMinute.views)}</span>` : ""}</small></div>`).join("") : `<p class="tp-low">Stream rollups show after the first stream the Control Room ends.</p>`}</section>
  </div>`;
}

// ---------------------------------------------------------------------------------------------- Health
const chipOf = (v: number | null, ok: number, mid: number, f: (n: number) => string) => (v == null ? '<span class="tp-low">–</span>' : `<span class="tp-chip ${v <= ok ? "ok" : v <= mid ? "mid" : "bad"}">${f(v)}</span>`);
function healthHtml() {
  const d = S.data!, list = (d.scores?.services || []).filter((s) => s.vit), cur = windowOf(0), prev = windowOf(1);
  const errs = sum(cur, (x) => x.errors || 0), perrs = sum(prev, (x) => x.errors || 0);
  const med = (k: "lcp" | "inp" | "cls") => { const v = list.map((s) => s.vit![k]).filter((x): x is number => typeof x === "number").sort((a, b) => a - b); return v.length ? v[v.length >> 1] : null; };
  const lcp = med("lcp"), inp = med("inp"), cls = med("cls");
  const kp = [kpiHtml({ label: "Script errors", value: fmt(errs), delta: deltaHtml(change(errs, perrs), { lowerIsBetter: true }), spark: cur.map((x) => x.errors || 0), prev: S.compare ? prev.map((x) => x.errors || 0) : null }),
    kpiHtml({ label: "Shows in (LCP p75)", value: lcp == null ? "–" : lcp.toFixed(1), unit: lcp == null ? "" : "s", empty: lcp == null }),
    kpiHtml({ label: "Tap reply (INP p75)", value: inp == null ? "–" : String(Math.round(inp)), unit: inp == null ? "" : "ms", empty: inp == null }),
    kpiHtml({ label: "Jumpiness (CLS p75)", value: cls == null ? "–" : cls.toFixed(2), empty: cls == null })].join("");
  const rows = list.sort((a, b) => (b.vit!.lcp || 0) - (a.vit!.lcp || 0)).map((s) => `<tr><td>${esc(s.name)}</td><td>${chipOf(s.vit!.lcp, 2.5, 4, (v) => `${v.toFixed(1)} s`)}</td><td>${chipOf(s.vit!.inp, 200, 500, (v) => `${Math.round(v)} ms`)}</td><td>${chipOf(s.vit!.cls, 0.1, 0.25, (v) => v.toFixed(2))}</td><td class="bt-chart-num">${s.errPerK}</td></tr>`).join("");
  const topErr = d.scores?.topErrors || [];
  return `<div class="tp-kpis" style="grid-template-columns:repeat(4,minmax(0,1fr));margin-bottom:16px">${kp}</div>
  <div class="tp-two">
    <section class="bt-card tp-card" style="grid-column:1/-1"><div class="bt-card-head"><h2 class="bt-heading">Speed by service</h2><span class="bt-card-meta">Core Web Vitals, p75 (Cloudflare)</span></div>${rows ? `<div class="bt-table-wrap"><table class="bt-table"><thead><tr><th scope="col">Service</th><th scope="col">Shows in</th><th scope="col">Tap reply</th><th scope="col">Jumpiness</th><th scope="col" class="bt-chart-num">Errors / 1k</th></tr></thead><tbody>${rows}</tbody></table></div><p class="tp-low">Lime is good, gold needs work, pink is poor (Core Web Vitals limits: 2.5 s, 200 ms, 0.1).</p>` : `<p class="tp-low">${d.settings.cf?.status === "ok" ? "No speed data yet." : "Speed comes from Cloudflare: not connected."}</p>`}</section>
    <section class="bt-card tp-card"><div class="bt-card-head"><h2 class="bt-heading">Top script errors</h2><a class="bt-btn bt-btn--secondary bt-btn--sm" href="/bug-zapper">Report in Bug Zapper</a></div>${topErr.length ? topErr.map((e) => `<div class="tp-err"><code>${esc(e.m)}</code><b>${fmt(e.n)}</b><small>${esc(nameOf(e.service))}</small></div>`).join("") : `<p class="tp-low">No script errors in 28 days.</p>`}</section>
    <section class="bt-card tp-card"><div class="bt-card-head"><h2 class="bt-heading">Missing pages</h2><a class="bt-btn bt-btn--secondary bt-btn--sm" href="/admin">Open Broken links</a></div>${d.broken.length ? d.broken.slice(0, 10).map((b) => `<div class="tp-err"><code>${esc(b.path)}</code><b>${fmt(b.count)}</b></div>`).join("") : `<p class="tp-low">No broken links reported.</p>`}</section>
  </div>`;
}

// ---------------------------------------------------------------------------------------------- Alerts
const ALERT_FILTERS: [string, string, (a: Alert) => boolean][] = [["open", "Open", (a) => a.state === "new" || a.state === "ack"], ["snoozed", "Snoozed", (a) => a.state === "snoozed"], ["resolved", "Resolved", (a) => a.state === "resolved"], ["all", "All", () => true]];
function alertText(a: Alert) {
  const f = a.facts as Record<string, unknown>;
  if (a.type === "spike") return `${fmt(Number(f.views))} views this hour, ${fmt(Number(f.usual))} is usual.${Array.isArray(f.from) && f.from.length ? ` Mostly from ${(f.from as { from: string }[]).map((x) => x.from.replace(/_/g, ".")).join(", ")}.` : ""}`;
  if (a.type === "drop") return `${fmt(Number(f.views))} views on ${esc(f.day)}, under half of the usual ${fmt(Number(f.usual))}.`;
  if (a.type === "errors") return `${fmt(Number(f.errors))} script errors today, ${fmt(Number(f.usual))} is usual.`;
  if (a.type === "slow") return `Pages took over 2.5 s to show (p75) three days in a row.`;
  if (a.type === "missing") return `${esc(f.path)} was hit ${fmt(Number(f.count))} times. Fix or redirect it.`;
  if (a.type === "silence") return `No beacon events for 2 hours while Cloudflare still sees ${fmt(Number(f.cfVisits))} visits today.`;
  if (a.type === "goal") return `A goal is behind by 15% or more with a week left.`;
  if (a.type === "record") return `${fmt(Number(f.views))} views on ${esc(f.day)}, the best day so far.`;
  return "";
}
function alertsHtml() {
  const all = S.data!.alerts, fl = ALERT_FILTERS.find(([k]) => k === S.alertFilter)!;
  const list = all.filter(fl[2]);
  const chips = `<div class="tp-sortbar">${ALERT_FILTERS.map(([k, l, f]) => `<button type="button" class="bt-chip bt-chip--small${S.alertFilter === k ? " is-active" : ""}" aria-pressed="${S.alertFilter === k}" data-afilter="${k}">${l} <span class="tp-low">${all.filter(f).length}</span></button>`).join("")}</div>`;
  if (!list.length) return chips + `<div class="bt-empty tp-empty"><div aria-hidden="true">${mascot()}</div><p class="bt-empty-title">All quiet</p><p>Nothing needs a look right now.</p></div>`;
  return chips + `<div class="tp-alerts">${list.map((a) => `<article class="tp-alert${a.state === "resolved" || a.state === "snoozed" ? " is-quiet" : ""}" data-sev="${a.severity}"><span class="tp-alert-ic" aria-hidden="true">${ALERT_IC[a.type] || ""}</span><div><h4>${esc(a.title)} ${SEV_BADGE[a.severity] || ""} ${STATE_BADGE[a.state] ? STATE_BADGE[a.state](a) : ""}</h4><p>${alertText(a)}</p><div class="tp-alert-meta">${a.firstAt ? new Date(a.firstAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }) : ""}${a.service ? ` · ${esc(nameOf(a.service))}` : ""}</div></div><div class="tp-alert-act">${a.state === "new" ? `<button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-ack="${esc(a.id)}">Acknowledge</button>` : ""}${a.state === "new" || a.state === "ack" ? `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-snooze="${esc(a.id)}">Snooze a day</button>` : ""}${a.service ? `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-open="${esc(a.service)}">Open service</button>` : ""}</div></article>`).join("")}</div>`;
}

// ---------------------------------------------------------------------------------------------- Reports
function reportsHtml() {
  const list = S.data!.reports;
  if (!list.length) return emptyHtml("No reports yet", "The weekly report arrives Monday at 6 AM, the monthly one on the 1st.");
  const cur = list.find((r) => r.id === S.report) || list[0];
  S.report = cur.id;
  const h = cur.headline, num = (label: string, k: string) => `<div class="bt-kpi"><div class="bt-kpi-top"><span class="bt-kpi-label">${label}</span>${deltaHtml(change(h.now[k] || 0, h.prev[k] || 0))}</div><div class="bt-stat"><span class="bt-stat-value">${short(h.now[k] || 0)}</span></div></div>`;
  const when = `${dayLabel(cur.from)} to ${dayLabel(cur.to)}`;
  return `<div class="tp-reports"><div class="tp-replist" role="group" aria-label="Reports">${list.map((r) => `<button type="button" data-report="${esc(r.id)}" aria-pressed="${r.id === cur.id}"><b>${r.kind === "week" ? "Week" : "Month"}</b><span>${dayLabel(r.from)} to ${dayLabel(r.to)}</span></button>`).join("")}</div>
    <article class="tp-paperrep" data-paper><div class="tp-rep-head"><div><h3 class="bt-heading">${cur.kind === "week" ? "Weekly" : "Monthly"} report</h3><p>${when}, compared with the ${cur.kind === "week" ? "week" : "month"} before</p></div><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-copy-report>Copy summary</button><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-print>Print</button><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-csv="days">CSV</button></div>
    <div class="tp-rep-nums">${num("Visitors", "uniques")}${num("Page views", "views")}${num("Engaged views", "engaged")}${num("New members", "newMembers")}</div>
    <div class="tp-rep-sec"><h4 class="bt-label">Top services</h4><ul>${cur.top.map((s) => `<li><b>${esc(s.name)}</b> score ${s.score}, ${fmt(s.views)} views</li>`).join("")}</ul></div>
    <div class="tp-rep-sec"><h4 class="bt-label">Needs work</h4><ul>${cur.bottom.map((s) => `<li><b>${esc(s.name)}</b> score ${s.score}, ${fmt(s.views)} views</li>`).join("")}</ul></div>
    <div class="tp-rep-sec"><h4 class="bt-label">Sources</h4><ul>${cur.sources.map((s) => `<li><b>${esc(s.from.replace(/_/g, "."))}</b> ${fmt(s.n)}</li>`).join("") || "<li>None recorded.</li>"}</ul></div>
    ${cur.bestStream ? `<div class="tp-rep-sec"><h4 class="bt-label">Best stream</h4><ul><li><b>${esc(cur.bestStream.title)}</b> ${fmt(cur.bestStream.visits)} visits, ${fmt(cur.bestStream.joins)} joins</li></ul></div>` : ""}
    <div class="tp-rep-sec"><h4 class="bt-label">Alerts</h4><ul>${cur.alerts.map((a) => `<li>${esc(a.title)} (${esc(a.state)})</li>`).join("") || "<li>None.</li>"}</ul></div>
    ${cur.moves.length ? `<div class="tp-rep-sec"><h4 class="bt-label">Moves</h4><ul>${cur.moves.map((m) => `<li><b>${esc(m.title)}</b> ${esc(m.text)}</li>`).join("")}</ul></div>` : ""}
    </article></div>`;
}

// ---------------------------------------------------------------------------------------------- Settings
const RULE_LABELS: [string, string, [string, string][]][] = [
  ["spike", "Traffic spike (urgent)", [["factor", "× usual in an hour"]]], ["drop", "Traffic drop (urgent)", [["below", "below this share of usual, all day"]]],
  ["silence", "Beacon silence (urgent)", [["hours", "hours with no events"]]], ["errors", "Error surge (watch)", [["factor", "× usual"], ["abs", "or this many in an hour"]]],
  ["missing", "Missing page surge (watch)", [["hits", "hits in a day"]]], ["slow", "Slow page (urgent)", [["lcp", "s LCP p75"], ["days", "days in a row"]]],
  ["goal", "Goal off pace (watch)", [["behind", "behind by (0.15 = 15%)"]]], ["record", "Record (good news)", []],
];
function settingsHtml() {
  const d = S.data!, view = !canChange(), r = d.settings.rules;
  const notice = view ? `<p class="bt-notice" role="note">View only. Stewards can view, acknowledge alerts and add notes. Overseer and Right Hand change settings.</p>` : "";
  const goals = d.goals.map((g) => `<div class="tp-set-row"><div><b>${esc(g.kind === "serviceViews" ? `Views on ${nameOf(g.service)}` : GOAL_NAME[g.kind])}</b><small>${fmt(g.target)}${g.kind === "returnRate" ? "%" : ""} in ${esc(g.month)}</small></div><div class="tp-set-ctl"><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-goal-del="${esc(g.id)}">Remove</button></div></div>`).join("");
  const svcOpts = (d.scores?.services || []).map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("");
  const cf = d.settings.cf;
  const cfLine = !cf || cf.status === "not-connected" ? `Not connected${cf?.missing?.length ? ` (missing: ${cf.missing.join(", ")})` : ""}. Everything else works without it.` : cf.status === "error" ? `Last pull failed: ${esc(cf.error || "unknown error")}` : `Connected. Last pull ${cf.checkedAt ? new Date(cf.checkedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}.`;
  const base = location.origin.includes("localhost") || location.origin.includes("127.0.0.1") ? "https://boomertanger.com" : location.origin;
  return `${notice}<fieldset class="tp-two" ${view ? "disabled" : ""} style="border:0;padding:0;margin:0;min-width:0">
    <section class="bt-card tp-card"><div class="bt-card-head"><h2 class="bt-heading">Goals</h2><span class="bt-card-meta">This month</span></div>${goals || `<p class="tp-low">No goals yet.</p>`}
      <form class="tp-form" data-goal-form><div class="bt-field"><label class="bt-label" for="tp-g-kind">Counts</label><select class="bt-select" id="tp-g-kind" name="kind"><option value="visitors">Monthly visitors</option><option value="members">New members</option><option value="fanClub">Fan Club joins</option><option value="returnRate">Member return rate (%)</option><option value="serviceViews">Views on a service</option></select></div><div class="bt-field"><label class="bt-label" for="tp-g-target">Target</label><input class="bt-input" id="tp-g-target" name="target" inputmode="numeric" required /></div><div class="bt-field"><label class="bt-label" for="tp-g-svc">Service</label><select class="bt-select" id="tp-g-svc" name="service"><option value="">(views goals only)</option>${svcOpts}</select></div><button type="submit" class="bt-btn bt-btn--admin bt-btn--sm">Add goal</button></form></section>
    <section class="bt-card tp-card"><div class="bt-card-head"><h2 class="bt-heading">Privacy and counting</h2></div>
      <div class="tp-set-row"><div><b id="tp-staff-l">Don't count staff</b><small>The owner, admins and mods aren't counted (on by default).</small></div><div class="tp-set-ctl"><button type="button" class="bt-switch" role="switch" aria-checked="${d.settings.excludeStaff}" aria-labelledby="tp-staff-l" data-staff></button></div></div>
      <div class="tp-set-row"><div><b>Sampling</b><small>1 counts every visit. Lower it only if writes surge.</small></div><div class="tp-set-ctl"><input class="bt-input" data-sampling value="${d.settings.sampling}" inputmode="decimal" aria-label="Sampling" /><button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-save-counting>Save</button></div></div>
      ${["Global Privacy Control and Do Not Track are respected", "Members can switch on \"Don't count my visits\"", "No cookies, no stored IPs, no ad ids"].map((t) => `<div class="tp-set-row"><div><b>${t}</b></div><span class="tp-locked"><span aria-hidden="true">🔒</span>Always on</span></div>`).join("")}</section>
    <section class="bt-card tp-card"><div class="bt-card-head"><h2 class="bt-heading">Alert rules</h2></div>${RULE_LABELS.map(([k, label, fields]) => `<div class="tp-set-row" data-rule="${k}"><div><b id="tp-r-${k}">${label}</b>${fields.map(([f, l]) => `<small>${l}</small>`).join("")}</div><div class="tp-set-ctl">${fields.map(([f, l]) => `<input class="bt-input" data-rf="${f}" value="${esc(r[k]?.[f] ?? "")}" inputmode="decimal" aria-label="${esc(label)}: ${esc(l)}" />`).join("")}<button type="button" class="bt-switch" role="switch" aria-checked="${r[k]?.on !== false}" aria-labelledby="tp-r-${k}" data-ron></button></div></div>`).join("")}<button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-save-rules>Save rules</button></section>
    <section class="bt-card tp-card"><div class="bt-card-head"><h2 class="bt-heading">Campaign tags</h2></div><p class="tp-card-sub">Add ?ref=tag to a link to see what it brings in (Audience).</p>${d.refs.map((x) => `<div class="tp-ref"><code>${esc(x.tag)}</code><span>${esc(x.label)} → ${esc(x.path)}</span><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-copy="${esc(`${base}${x.path}${x.path.includes("?") ? "&" : "?"}ref=${x.tag}`)}">Copy link</button><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-ref-del="${esc(x.tag)}">Remove</button></div>`).join("") || `<p class="tp-low">No tags yet.</p>`}
      <form class="tp-form" data-ref-form><div class="bt-field"><label class="bt-label" for="tp-t-tag">Tag</label><input class="bt-input" id="tp-t-tag" name="tag" placeholder="tt-bio" required /></div><div class="bt-field"><label class="bt-label" for="tp-t-label">Name</label><input class="bt-input" id="tp-t-label" name="label" placeholder="TikTok bio" /></div><div class="bt-field"><label class="bt-label" for="tp-t-path">Page</label><input class="bt-input" id="tp-t-path" name="path" placeholder="/" /></div><button type="submit" class="bt-btn bt-btn--admin bt-btn--sm">New tag</button></form></section>
    <section class="bt-card tp-card"><div class="bt-card-head"><h2 class="bt-heading">Cloudflare</h2></div><p class="tp-card-sub" style="margin:0">${cfLine}</p><button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-cf-retry>Try again</button></section>
  </fieldset>`;
}

// ---------------------------------------------------------------------------------------------- the page
const emptyHtml = (title: string, line: string) => `<div class="bt-empty tp-empty"><div aria-hidden="true">${mascot()}</div><p class="bt-empty-title">${esc(title)}</p><p>${esc(line)}</p></div>`;
function noticesHtml() {
  const d = S.data!, out: string[] = [];
  const cf = d.settings.cf;
  const stale = cf && (cf.status === "error" || (cf.status === "ok" && cf.checkedAt && Date.now() - cf.checkedAt > 3 * 3600e3));
  if (stale) out.push(`<div class="bt-notice bt-notice--warn tp-cf-row" role="status">Cloudflare numbers are out of date${cf!.status === "error" ? ` (${esc(cf!.error || "the last pull failed")})` : ""}. <button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-cf-retry>Try again</button></div>`);
  const nDays = d.days.filter((x) => (x.views || 0) > 0).length;
  if (nDays > 0 && nDays < 7) out.push(`<p class="tp-low">Only ${nDays} day${nDays === 1 ? "" : "s"} of visits so far. The numbers settle after a week.</p>`);
  return out.join("");
}
function shellTop() {
  const wm = `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M3 17h6l3-7 4 14 3-9 2 2h8"/><path class="tp-wm-beat" d="M3 17h6l3-7 4 14 3-9 2 2h8"/></svg>`;
  return `<div class="tp-top"><a class="bt-wordmark" href="/admin/pulse"><span class="bt-wordmark-icon tp-wm-icon">${wm}</span><span class="bt-wordmark-text">TRAFFIC<span class="bt-wordmark-accent">PULSE</span></span></a><span class="tp-sp"></span>
    <div class="tp-ranges" role="group" aria-label="Range">${RANGES.map(([k, l]) => `<button type="button" class="bt-chip bt-chip--small${S.range === k ? " is-active" : ""}" aria-pressed="${S.range === k}" data-range="${k}">${l}</button>`).join("")}<span class="tp-cmp"><span id="tp-cmp-l">Compare</span><button type="button" class="bt-switch" role="switch" aria-checked="${S.compare}" aria-labelledby="tp-cmp-l" data-compare></button></span></div></div>`;
}
function tabsHtml() {
  const open = S.data ? S.data.alerts.filter((a) => a.state === "new" || a.state === "ack").length : 0;
  return `<div class="tp-tabs"><nav class="bt-seg-nav" aria-label="Traffic Pulse">${TABS.map(([k, l]) => `<a href="?tab=${k}" data-tab="${k}"${S.tab === k ? ' aria-current="page"' : ""}>${l}${k === "alerts" && open ? ` <span class="bt-badge bt-badge--blue">${open}</span>` : ""}</a>`).join("")}</nav>${S.tab === "overview" ? `<div class="tp-filters" role="group" aria-label="Show">${FILTERS.map(([k, l]) => `<button type="button" class="bt-chip bt-chip--small${S.filter === k ? " is-active" : ""}" aria-pressed="${S.filter === k}" data-filter="${k}">${l}</button>`).join("")}</div>` : ""}</div>`;
}
function render() {
  if (!root) return;
  const d = S.data;
  const top = shellTop() + (d?.sample ? `<p class="tp-sample"><span class="bt-badge bt-badge--gold">Staging: sample data</span>The numbers here come from pulse-sample.js, not real visits.</p>` : "");
  if (!d) { root.innerHTML = top + `<div class="tp-skel"><div class="bt-skeleton" style="height:180px"></div><div class="bt-skeleton" style="height:44px"></div><div class="bt-skeleton" style="height:320px"></div></div>`; return; }
  const none = !d.days.some((x) => (x.views || 0) > 0) && !d.scores;
  const head = S.tab === "overview" ? heroHtml() : `<div class="tp-head-slim"><h1 class="bt-title">Traffic Pulse</h1><span class="bt-badge bt-badge--admin">Staff</span><span class="tp-pulse-mini">${pulseMini(S.monitor)}<span><b>${fmt(S.monitor ? S.monitor.hours[S.monitor.hours.length - 1] : 0)}</b> visits this hour</span></span></div>`;
  let body = "";
  if (none && S.tab !== "settings") body = emptyHtml("No pulse yet", "Counting starts when the beacon sees its first visit on boomertanger.com. On staging, functions/scripts/pulse-sample.js loads sample data.");
  else body = { overview: overviewHtml, services: servicesHtml, audience: audienceHtml, health: healthHtml, alerts: alertsHtml, reports: reportsHtml, settings: settingsHtml }[S.tab]();
  root.innerHTML = top + head + tabsHtml() + noticesHtml() + `<div data-panel>${body}</div>`;
  initSegNav(root.querySelector(".bt-seg-nav")!);
  if (S.tab === "overview" && !none) {
    drawTrend(root.querySelector("[data-trend]"));
    const map = root.querySelector<HTMLElement>("[data-map]");
    if (map) initFocusMap(map, (id) => void openDetail(id));
    if (celebration()) tick(root.querySelector('[data-kpi="visitors"]'));
  }
}
function setTab(t: Tab) {
  S.tab = t;
  const u = new URL(location.href); u.searchParams.set("tab", t); u.searchParams.delete("service"); history.replaceState(history.state, "", u);
  render();
}
function download(name: string, csv: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function csvFor(table: string) {
  const d = S.data!, q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  if (table === "services") return ["service,name,score,views,change,engaged,health,love,group", ...(d.scores?.services || []).map((s) => [s.id, q(s.name), s.score ?? "", s.views, change(s.views, s.prevViews), s.eng, s.health, s.love ?? "", s.group || ""].join(","))].join("\n");
  if (table === "sources") { const rows: string[] = []; d.sources.forEach((x) => Object.entries(x.refs || {}).forEach(([k, v]) => rows.push([x.day, q(k.replace(/_/g, ".")), v].join(",")))); return ["day,from,views", ...rows].join("\n"); }
  return ["day,views,uniques,engaged,newMembers,joinOpens,errors", ...d.days.map((x) => [x.day, x.views || 0, x.uniques || 0, x.engaged || 0, x.newMembers || 0, x.joinOpens || 0, x.errors || 0].join(","))].join("\n");
}
async function refresh() {
  S.data = null; render();
  try { [S.data, S.monitor] = await Promise.all([load(S.range), monitorData()]); if (S.monitor) liveHoursOf(S.monitor); }
  catch (err) { console.warn("pulse: couldn't read", err); root!.innerHTML = shellTop() + `<p class="bt-notice bt-notice--error">Couldn't read Traffic Pulse. Reload to try again.</p>`; return; }
  render();
  const sv = new URLSearchParams(location.search).get("service");
  if (sv) void openDetail(sv);
}

function wire() {
  root!.addEventListener("click", async (e) => {
    const t = e.target as HTMLElement, b = (sel: string) => t.closest<HTMLElement>(sel);
    let x: HTMLElement | null;
    if ((x = b("[data-tab]"))) { e.preventDefault(); setTab(x.dataset.tab as Tab); return; }
    if ((x = b("[data-range]"))) { S.range = x.dataset.range as Range; const u = new URL(location.href); u.searchParams.set("range", S.range); history.replaceState(history.state, "", u); void refresh(); return; }
    if (b("[data-compare]")) { S.compare = !S.compare; render(); return; }
    if ((x = b("[data-filter]"))) { S.filter = x.dataset.filter as Filter; render(); return; }
    if ((x = b("[data-sort]"))) { S.sort = x.dataset.sort!; render(); return; }
    if ((x = b("[data-afilter]"))) { S.alertFilter = x.dataset.afilter!; render(); return; }
    if ((x = b("[data-report]"))) { S.report = x.dataset.report!; render(); return; }
    if ((x = b("[data-open]"))) { void openDetail(x.dataset.open!); return; }
    if ((x = b("[data-csv]"))) { download(`traffic-pulse-${x.dataset.csv}-${today()}.csv`, csvFor(x.dataset.csv!)); return; }
    if (b("[data-print]")) { window.print(); return; }
    if (b("[data-copy-report]")) { const p = root!.querySelector<HTMLElement>("[data-paper]"); try { await navigator.clipboard.writeText(p?.innerText || ""); toast("Summary copied."); } catch { toast("Couldn't copy. Select the text instead.", { kind: "error" }); } return; }
    if ((x = b("[data-copy]"))) { try { await navigator.clipboard.writeText(x.dataset.copy!); toast("Link copied."); } catch { toast(x.dataset.copy!); } return; }
    if ((x = b("[data-done]"))) { const undo = !!x.dataset.isDone; const r = await act({ action: undo ? "moveUndo" : "moveDone", id: x.dataset.done }, undo ? "Back on the list." : "Marked done. It drops off next week unless the numbers still say so."); if (r) { const m = S.data!.moves.find((y) => y.id === x!.dataset.done); if (m) m.done = !undo; render(); } return; }
    if ((x = b("[data-ack]"))) { const r = await act({ action: "alertAck", id: x.dataset.ack }, "Acknowledged."); if (r) { const a = S.data!.alerts.find((y) => y.id === x!.dataset.ack); if (a) { a.state = "ack"; a.ack = { name: "You" }; } render(); } return; }
    if ((x = b("[data-snooze]"))) { const r = await act({ action: "alertSnooze", id: x.dataset.snooze, days: 1 }, "Snoozed for a day."); if (r) { const a = S.data!.alerts.find((y) => y.id === x!.dataset.snooze); if (a) a.state = "snoozed"; render(); } return; }
    if (b("[data-cf-retry]")) { const r = await act({ action: "cfTryAgain" }, "Asked Cloudflare again."); if (r) void refresh(); return; }
    if (!canChange()) return;
    if (b("[data-staff]")) { const on = !S.data!.settings.excludeStaff; const r = await act({ action: "settingsSave", excludeStaff: on }, on ? "Staff aren't counted." : "Staff are counted."); if (r) { S.data!.settings.excludeStaff = on; render(); } return; }
    if (b("[data-save-counting]")) { const v = Number(root!.querySelector<HTMLInputElement>("[data-sampling]")!.value); const r = await act({ action: "settingsSave", sampling: v }, "Saved."); if (r) S.data!.settings.sampling = v; return; }
    if ((x = b("[data-ron]"))) { x.setAttribute("aria-checked", String(x.getAttribute("aria-checked") !== "true")); return; }
    if (b("[data-save-rules]")) {
      const rules: Record<string, Record<string, number | boolean>> = {};
      root!.querySelectorAll<HTMLElement>("[data-rule]").forEach((row) => { const k = row.dataset.rule!; rules[k] = { on: row.querySelector("[data-ron]")!.getAttribute("aria-checked") === "true" }; row.querySelectorAll<HTMLInputElement>("[data-rf]").forEach((i) => (rules[k][i.dataset.rf!] = Number(i.value))); });
      const r = await act({ action: "settingsSave", rules }, "Rules saved.");
      if (r) S.data!.settings.rules = rules;
      return;
    }
    if ((x = b("[data-goal-del]"))) { const r = await act({ action: "goalDelete", id: x.dataset.goalDel }, "Goal removed."); if (r) { S.data!.goals = S.data!.goals.filter((g) => g.id !== x!.dataset.goalDel); render(); } return; }
    if ((x = b("[data-ref-del]"))) { const r = await act({ action: "refDelete", tag: x.dataset.refDel }, "Tag removed."); if (r) { S.data!.refs = S.data!.refs.filter((g) => g.tag !== x!.dataset.refDel); render(); } return; }
  });
  root!.addEventListener("keydown", (e) => { const tr = (e.target as HTMLElement).closest<HTMLElement>("tr[data-open]"); if (tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); void openDetail(tr.dataset.open!); } });
  root!.addEventListener("submit", async (e) => {
    const f = e.target as HTMLFormElement;
    e.preventDefault();
    if (!canChange()) return;
    const fd = new FormData(f);
    if (f.matches("[data-goal-form]")) {
      const kind = String(fd.get("kind")), target = Number(String(fd.get("target")).replace(/,/g, "")), service = String(fd.get("service") || "");
      if (!(target > 0)) { toast("The target is a number above zero.", { kind: "error" }); return; }
      if (kind === "serviceViews" && !service) { toast("Pick a service for a views goal.", { kind: "error" }); return; }
      const r = await act({ action: "goalSave", kind, target, service: service || null, month: today().slice(0, 7) }, "Goal added.");
      if (r) { S.data!.goals.push({ id: String((r as { id?: string }).id || Date.now()), kind, target, month: today().slice(0, 7), service: service || null, label: null }); render(); }
    }
    if (f.matches("[data-ref-form]")) {
      const tag = String(fd.get("tag")).trim().toLowerCase(), label = String(fd.get("label") || "").trim(), path = String(fd.get("path") || "/").trim() || "/";
      if (!/^[a-z0-9_-]{2,40}$/.test(tag)) { toast("A tag is 2 to 40 letters, digits, - or _.", { kind: "error" }); return; }
      const r = await act({ action: "refSave", tag, label, path }, "Tag saved.");
      if (r) { S.data!.refs = [...S.data!.refs.filter((x) => x.tag !== tag), { tag, label: label || tag, path }]; render(); }
    }
  });
}

if (root) {
  whenReady().then(async (s) => {
    if (!isAdmin(s)) { root.innerHTML = `<div class="bt-empty tp-empty" style="margin-top:40px"><div aria-hidden="true">${mascot()}</div><p class="bt-empty-title">Admins only</p><p>Traffic Pulse is for the site's admins.${s.user ? "" : " If you are one, sign in with your admin account."}</p>${s.user ? "" : `<div class="bt-row-center"><a class="bt-btn bt-btn--primary" href="/account" data-signin="signin">Sign in</a></div>`}</div>`; return; }
    const t = await tierOf(s);
    S.tier = (t || "steward") as typeof S.tier;
    wire();
    void refresh();
  });
}
