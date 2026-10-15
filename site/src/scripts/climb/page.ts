// /climb, Creator Climb (docs/specs/creator-climb.md §5-§6): fills climb.astro from public/climb (everyone) and the climb months (members), both
// live. Visitors: the summary, month-end charts ("All" only), lock cards that open Join free. Members (a members/{uid} doc; ?as=member previews it
// on localhost and staging): every reading, ranges, member breakdowns, month reports, records and pace. Deep links: ?month=YYYY-MM (opens and
// scrolls to Month by month), ?platform=twitch|tiktok|youtube (only that line on), ?range=30d|90d|1y|all (visitors fall back to All).
import { chart, chartTable, focusSeries } from "../../../../shared/ui/chart.js";
import { initChat } from "../../../../shared/ui/chat.js";
import { onAuth, getAuthState, type AuthState } from "../../lib/auth";
import { drawScene } from "./scene";
import {
  PLATFORMS, NAME, COLOR, type Platform, type Key, type Public, type MonthDoc, type SPoint,
  ms, fmt, monthLabel, dayLabel, todayMs, escapeHtml as esc, previewMember, watchPublic, watchMonths, previewMonths,
  iconHtml, monthEndSeries, readingSeries, combinedSeries, toS, erasOf, eraOf, allMilestones, records, pace,
} from "./data";

const root = document.querySelector<HTMLElement>("[data-cc]");
const $ = <T extends Element = HTMLElement>(sel: string) => root!.querySelector<T>(sel);
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const DAY = 864e5;
const RANGES: [string, string, number | null][] = [["30d", "30 days", 30], ["90d", "90 days", 90], ["1y", "1 year", 365], ["all", "All", null]];
const qs = new URLSearchParams(location.search);

const S = {
  pub: null as Public | null,
  months: null as Map<string, MonthDoc> | null,
  member: false,
  on: new Set<Key>(["all", "twitch", "tiktok", "youtube"]),
  range: "all",
  month: null as string | null,
  scrub: null as { key: string; value: number; last: boolean } | null,
  counted: false,
};
{
  const p = qs.get("platform");
  if (p && (PLATFORMS as readonly string[]).includes(p)) S.on = new Set([p as Key]);
  const r = qs.get("range");
  if (r && RANGES.some(([k]) => k === r)) S.range = r;
  const m = qs.get("month");
  if (m && /^\d{4}-\d{2}$/.test(m)) S.month = m;
}

const per = (k: Key) => (k === "youtube" ? "subscribers" : k === "members" ? "members" : "followers");

// ---------------------------------------------------------------------------------------------- the hero
function countUp(el: HTMLElement, to: number) {
  if (reduce() || S.counted) { el.textContent = fmt(to); return; }
  const t0 = performance.now(), dur = 1400;
  const step = (now: number) => { const f = Math.min(1, (now - t0) / dur); el.textContent = fmt(to * (1 - (1 - f) ** 3)); if (f < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function asofText(p: Public) {
  if (S.scrub) return `End of ${monthLabel(S.scrub.key, true)}${S.scrub.last && p.lastReading ? ` (last reading ${dayLabel(p.lastReading.day)})` : ""}`;
  if (!p.lastReading) return "";
  const age = Math.round((todayMs() - ms(p.lastReading.day)) / DAY);
  return `Last reading ${dayLabel(p.lastReading.day)}${age > 7 ? `, ${age} days ago` : ""}.`;
}
function hero(p: Public) {
  const total = $("[data-cc-total]")!;
  if (S.scrub) total.textContent = fmt(S.scrub.value); else if (!S.counted) countUp(total, p.totals.all || 0); else total.textContent = fmt(p.totals.all);
  const mBox = $("[data-cc-members-total]")!;
  const mt = p.members && p.members.total != null ? p.members.total : null;
  mBox.hidden = mt == null;
  if (mt != null) { const n = $("[data-cc-members-n]")!; if (!S.counted) countUp(n, mt); else n.textContent = fmt(mt); }
  $("[data-cc-staging]")!.hidden = !(p.members && p.members.staging && mt != null);
  $("[data-cc-asof]")!.textContent = asofText(p);
  $("[data-cc-plats]")!.innerHTML = PLATFORMS.filter((k) => p.totals[k] != null).map((k) => `<span class="cc-plat">${iconHtml(k)}<b>${fmt(p.totals[k])}</b><span>${NAME[k]}</span></span>`).join("");
  S.counted = true;
}

// ---------------------------------------------------------------------------------------------- 01 the climb so far
const bigEl = () => $("[data-cc-big]")!;
function bigOpts() {
  const p = S.pub!, r = RANGES.find(([k]) => k === S.range) || RANGES[3];
  const t1 = todayMs(), t0 = r[2] ? t1 - r[2] * DAY : Date.UTC(2025, 0, 1);
  let src: Record<Platform | "all", SPoint[]>;
  if (S.member && S.months) {
    const rd = readingSeries(S.months);
    src = { all: combinedSeries(p, rd), twitch: toS(rd.twitch), tiktok: toS(rd.tiktok), youtube: toS(rd.youtube) };
  } else src = monthEndSeries(p);
  const keys: (Platform | "all")[] = ["all", ...PLATFORMS];
  const series = keys.filter((k) => S.on.has(k)).map((k) => ({ key: k, label: NAME[k], points: src[k], color: COLOR[k], width: k === "all" ? 3.5 : undefined, icon: iconHtml(k) }));
  const days = r[2];
  return { series, t0, t1, eras: erasOf(p), zero: true, monthly: !S.member, label: "Followers over time. Use the left and right arrow keys to step through readings.",
    empty: days ? `No readings in the last ${days} days yet. The morning collector adds one every day.` : "No readings yet." };
}
function controls() {
  $("[data-cc-series]")!.innerHTML = (["all", ...PLATFORMS] as Key[]).map((k) => `<button type="button" class="bt-chip bt-chip--small cc-chip-pi${S.on.has(k) ? " is-active" : ""}" aria-pressed="${S.on.has(k)}" data-series="${k}" style="--c:${COLOR[k]}"><i></i>${NAME[k]}</button>`).join("");
  $("[data-cc-range]")!.innerHTML = RANGES.map(([k, l]) => (S.member || k === "all"
    ? `<button type="button" class="bt-chip bt-chip--small${S.range === k ? " is-active" : ""}" aria-pressed="${S.range === k}" data-range="${k}">${l}</button>`
    : `<button type="button" class="bt-chip bt-chip--small cc-lock" data-signin="join" data-signin-title="Join free to see every stream day" title="Members see every stream day"><span aria-hidden="true">🔒</span> ${l}</button>`)).join("");
}
function drawBig() {
  const o = bigOpts();
  chart(bigEl(), o);
  $("[data-cc-big-meta]")!.textContent = S.member ? "Every stream day since June 2025; month-end totals before that." : "Month-end totals. Members see every stream day.";
  const tb = $("[data-cc-big-table]")!;
  if (!tb.hidden) tb.innerHTML = chartTable(o);
}
function membersChart() {
  const p = S.pub!, el = $("[data-cc-mem]")!;
  const m = p.members;
  let pts: SPoint[] = [];
  if (S.member && S.months) pts = [...S.months.values()].sort((a, b) => (a.key < b.key ? -1 : 1)).flatMap((x) => (x.members ? x.members.points.map((r) => ({ t: ms(r.d), v: r.v, src: "live" })) : []));
  else if (m) pts = m.monthEnd.map((r) => ({ t: ms(r.day), v: r.total, src: "live" }));
  const start = m && m.start ? ms(m.start) : todayMs() - 30 * DAY;
  chart(el, { series: [{ key: "members", label: "Members", points: pts, color: COLOR.members, width: 3 }], t0: start - 3 * DAY, t1: todayMs(), zero: true, label: "Site members since launch. Use the arrow keys to step through readings.",
    empty: "Members are counted from launch day. The first reading lands the next morning." });
  $("[data-cc-mem-meta]")!.textContent = m && m.total != null ? `${fmt(m.total)} members${m.perThousand != null ? `, ${m.perThousand.toLocaleString("en-US")} per 1,000 followers` : ""}${m.staging ? " · Staging" : ""}` : "Starts at launch";
}
const under = (v: number | string | null | undefined) => (v === "<5" ? "under 5" : v == null ? "—" : fmt(Number(v)));
function memberBreakdown() {
  const box = $("[data-cc-mem-break]")!;
  if (!S.member || !S.months) { box.innerHTML = ""; return; }
  const list = [...S.months.values()].filter((m) => m.members).sort((a, b) => (a.key < b.key ? 1 : -1));
  if (!list.length) { box.innerHTML = `<div class="bt-card cc-card"><b class="bt-card-title cc-card-t">Joined and left, month by month</b><p class="cc-vs">Counted from launch day. The first month shows here once it has readings.</p></div>`; return; }
  const billing = list.some((m) => m.members!.subClub && m.members!.subClub !== 0);
  const head = `<tr><th scope="col">Month</th><th scope="col" class="bt-chart-num">Joined</th><th scope="col" class="bt-chart-num">Left</th><th scope="col" class="bt-chart-num">Fan Club</th>${billing ? `<th scope="col" class="bt-chart-num">Sub Club</th>` : ""}<th scope="col" class="bt-chart-num">Google</th><th scope="col" class="bt-chart-num">Email</th><th scope="col" class="bt-chart-num">Twitch</th><th scope="col" class="bt-chart-num">Unknown</th></tr>`;
  const rows = list.map((x) => { const m = x.members!; const b = m.byMethod || {}; return `<tr><td>${monthLabel(x.key, true)}</td><td class="bt-chart-num">${under(m.joined)}</td><td class="bt-chart-num">${under(m.left)}</td><td class="bt-chart-num">${under(m.fanClub)}</td>${billing ? `<td class="bt-chart-num">${under(m.subClub)}</td>` : ""}<td class="bt-chart-num">${under(b.google)}</td><td class="bt-chart-num">${under(b.email)}</td><td class="bt-chart-num">${under(b.twitch)}</td><td class="bt-chart-num">${under(b.unknown)}</td></tr>`; }).join("");
  box.innerHTML = `<div class="bt-card cc-card"><b class="bt-card-title cc-card-t">Joined and left, month by month</b><div class="bt-chart-table"><table class="bt-table"><thead>${head}</thead><tbody>${rows}</tbody></table></div><span class="bt-card-meta">Sign-up method is how the account joined; Unknown is members who joined before it was recorded. Any group under 5 shows "under 5".</span></div>`;
}

// ---------------------------------------------------------------------------------------------- 02 milestones
const msLabel = (m: { platform: Key; value: number }) => (m.platform === "members" ? `${fmt(m.value)} members` : `${fmt(m.value)} on ${m.platform === "all" ? "all three" : NAME[m.platform]}`);
function milestones() {
  const p = S.pub!, all = allMilestones(p);
  const top = all.slice(0, 6).reverse();
  const path = $("[data-cc-path]")!;
  path.style.setProperty("--n", String(Math.max(1, top.length))); path.style.setProperty("--fill", "1");
  path.innerHTML = top.map((m, i) => `<li class="bt-path-node is-done${i === top.length - 1 ? " is-now is-new" : ""}"><i style="--c:${COLOR[m.platform]}">${iconHtml(m.platform)}</i><b>${esc(msLabel(m))}</b><small>${dayLabel(m.day)}</small></li>`).join("");
  const first = all.length ? all[all.length - 1] : null;
  $("[data-cc-ms-count]")!.textContent = all.length ? `${all.length} milestones since ${monthLabel(first!.day.slice(0, 7), true)}` : "No milestones yet";
  $("[data-cc-ms-list]")!.innerHTML = all.map((m) => `<div class="cc-ms">${iconHtml(m.platform)}<b>${esc(msLabel(m))}</b><span>${dayLabel(m.day)}</span></div>`).join("");
}

// ---------------------------------------------------------------------------------------------- 03 platforms
function stages() {
  const p = S.pub!, mend = monthEndSeries(p);
  const sorted = S.months ? [...S.months.values()].filter((m) => !m.preview).sort((a, b) => (a.key < b.key ? -1 : 1)) : [];
  $("[data-cc-stages]")!.innerHTML = PLATFORMS.filter((k) => mend[k].length).map((k) => {
    const s = mend[k], v = s.map((x) => x.v), lo = Math.min(...v), hi = Math.max(...v);
    const d = s.map((x, i) => `${i ? "L" : "M"}${((i / Math.max(1, s.length - 1)) * 200).toFixed(1)} ${(52 - ((x.v - lo) / (hi - lo || 1)) * 46).toFixed(1)}`).join("");
    const firstKey = p.monthEnd.find((r) => r[k] != null)!.month;
    let meta = `<span>Members see each month's growth</span>`;
    if (S.member) {
      const withGain = sorted.filter((m) => m.gain && m.gain[k] != null);
      const last = withGain[withGain.length - 1];
      const best = [...withGain].sort((a, b) => (b.gain[k] as number) - (a.gain[k] as number))[0];
      const rate = last && last.monthEnd[k] != null && (last.monthEnd[k]! - last.gain[k]!) > 0 ? ((last.gain[k]! / (last.monthEnd[k]! - last.gain[k]!)) * 100).toFixed(2) : null;
      meta = last ? `<span>${monthLabel(last.key, true)} <b>${last.gain[k]! >= 0 ? "+" : "−"}${fmt(Math.abs(last.gain[k]!))}</b>${rate ? ` (${rate}%)` : ""}</span>${best ? `<span>Best month <b>${monthLabel(best.key)}</b> +${fmt(best.gain[k])}</span>` : ""}` : `<span>Month growth shows once a month has readings</span>`;
    }
    return `<article class="cc-stage" data-p="${k}" tabindex="0"><div class="cc-stage-head">${iconHtml(k)}<b class="bt-card-title cc-card-t">${NAME[k]}</b></div>
      <div><div class="cc-stage-n">${fmt(p.totals[k])}</div><div class="cc-stage-sub">${per(k)}, since ${monthLabel(firstKey)}</div></div>
      <svg class="cc-stage-spark" viewBox="0 0 200 56" aria-hidden="true" focusable="false"><path class="cc-spark-fill" d="${d} L200 56 L0 56Z"/><path class="cc-spark-base" d="${d}"/><path class="cc-spark-lit" d="${d}" style="--len:420"/></svg>
      <div class="cc-stage-meta">${meta}</div></article>`;
  }).join("");
}

// ---------------------------------------------------------------------------------------------- 04 crossover
function spanText(from: string, to: string) { return `${monthLabel(from, true)} to ${monthLabel(to, true)}`; }
function crossover() {
  const p = S.pub!, x = p.crossover, flow = $("[data-cc-flow]")!;
  if (!x) { flow.innerHTML = `<p class="cc-vs">Crossover starts with the first month all three platforms were tracked.</p>`; $("[data-cc-cross-span]")!.textContent = ""; $("[data-cc-eracmp]")!.innerHTML = ""; return; }
  $("[data-cc-cross-span]")!.textContent = `${spanText(x.span.from, x.span.to)}, ${fmt(x.tiktok)} new TikTok followers`;
  const N = flow.clientWidth > 0 && flow.clientWidth < 520;
  const W = N ? 430 : 760, H = 250, x0 = N ? 6 : 20, sx = N ? 96 : 150, tx = N ? 236 : 470;
  flow.style.aspectRatio = `${W} / ${H}`;
  const mem = x.members != null ? x.members : null;
  const tg: [Key, number, number | null, string, string][] = [
    ["twitch", 44, x.twitch, "new Twitch followers", "Twitch"],
    ["youtube", 122, x.youtube, "new YouTube subscribers", "YouTube"],
    ["members", 200, mem, mem != null ? "members per 100 new followers" : "members: counted from launch", mem != null ? "members" : "from launch"],
  ];
  const curve = (y: number) => `M${sx} 125 C ${sx + 160} 125, ${tx - 170} ${y}, ${tx - 10} ${y}`;
  const band = (y: number, w: number, k: Key, wait: boolean) => `<path class="cc-fv-band${wait ? " is-wait" : ""}" data-k="${k}" d="${curve(y)}" style="stroke-width:${w}"/>${wait || reduce() ? "" : `<path class="cc-fv-flow" d="${curve(y)}"/>`}`;
  flow.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="For every 100 new TikTok followers, about ${x.twitch} new Twitch followers and ${x.youtube} new YouTube subscribers${mem != null ? `; ${mem} members per 100 new followers` : ""}."><rect class="cc-fv-src" x="${x0}" y="60" width="${sx - x0}" height="130" rx="14"/><text class="cc-fv-n" x="${(x0 + sx) / 2}" y="128" text-anchor="middle">100</text><text class="cc-fv-src-k" x="${(x0 + sx) / 2}" y="154" text-anchor="middle">TikTok</text>${tg.map(([k, y, v]) => band(y, v == null ? 2 : Math.min(26, Math.max(3, v * 2.6)), k, v == null)).join("")}${tg.map(([k, y, v, l, s]) => `<foreignObject x="${tx}" y="${y - 17}" width="36" height="36"><div xmlns="http://www.w3.org/1999/xhtml">${iconHtml(k)}</div></foreignObject><text class="cc-fv-n${v == null ? " is-wait" : ""}" x="${tx + 44}" y="${y + 4}">${v == null ? "—" : `+${v.toFixed(1)}`}</text><text class="cc-fv-l" x="${tx + 44}" y="${y + 24}">${N ? s : l}</text>`).join("")}</svg>`;
  const bar = (v: number | null, k: Key) => `<span class="cc-xbar" style="--c:${COLOR[k]};--w:${(v || 0) * 7}%"><em>${NAME[k]}</em><i></i><b>${v == null ? "—" : v.toFixed(1)}</b></span>`;
  const range = (e: { era: string }) => { const era = p.eras.find((z) => z.id === e.era); if (!era) return ""; const a = era.from && era.from.slice(0, 7) > x.span.from ? era.from.slice(0, 7) : x.span.from; const b = era.to && era.to.slice(0, 7) < x.span.to ? era.to.slice(0, 7) : x.span.to; return `${monthLabel(a)} – ${monthLabel(b)}`; };
  $("[data-cc-eracmp]")!.innerHTML = `<span></span><span class="cc-h">Twitch per 100 TikTok</span><span class="cc-h">YouTube per 100 TikTok</span>` + x.eras.map((e) => `<span><b>${esc(e.label)}</b><br><small class="cc-faint">${range(e)}</small></span>${bar(e.twitch, "twitch")}${bar(e.youtube, "youtube")}`).join("");
  const rows = $("[data-cc-xrows]")!;
  if (S.member && S.months) {
    const list = [...S.months.values()].filter((m) => m.crossover).sort((a, b) => (a.key < b.key ? 1 : -1));
    rows.innerHTML = `<span class="cc-h">Month</span><span class="cc-h cc-xtt">New on TikTok</span><span class="cc-h">Twitch per 100</span><span class="cc-h">YouTube per 100</span>` + list.map((m) => `<span>${monthLabel(m.key)}${m.crossover!.small ? ` <span class="bt-tag">Small month</span>` : ""}</span><span class="cc-xtt cc-num">+${fmt(m.crossover!.tiktok)}</span>${bar(m.crossover!.twitchPer100, "twitch")}${bar(m.crossover!.youtubePer100, "youtube")}`).join("")
      || `<span class="cc-vs">No month has all three platforms yet.</span>`;
  } else rows.innerHTML = "";
}

// ---------------------------------------------------------------------------------------------- 05 month by month
const box = (l: string, v: string, sub = "") => `<div class="cc-statbox"><span class="bt-label">${l}</span><span class="bt-stat"><span class="bt-stat-value">${v}</span></span>${sub ? `<small>${sub}</small>` : ""}</div>`;
const likesText = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2).replace(/\.?0+$/, "")}M` : n >= 1e3 ? `${fmt(n / 1000)}K` : fmt(n));
function months() {
  if (!S.member || !S.months) return;
  const p = S.pub!;
  const keys = [...S.months.keys()].filter((k) => Object.keys(S.months!.get(k)!.monthEnd || {}).length).sort();
  if (!keys.length) { $("[data-cc-months]")!.innerHTML = ""; $("[data-cc-report]")!.innerHTML = `<p class="cc-vs">No month reports yet.</p>`; return; }
  if (!S.month || !keys.includes(S.month)) S.month = keys[keys.length - 1];
  const chips: string[] = [];
  for (const k of keys) {
    chips.push(`<button type="button" class="bt-chip bt-chip--small${k === S.month ? " is-active" : ""}" aria-pressed="${k === S.month}" data-month="${k}">${monthLabel(k)}</button>`);
  }
  $("[data-cc-months]")!.innerHTML = chips.reverse().join("");
  const key = S.month, M = S.months.get(key)!;
  const prevK = keys[keys.indexOf(key) - 1];
  const P = prevK ? S.months.get(prevK)! : null;
  const era = eraOf(p, key);
  const vs = P && P.gain?.all != null && M.gain?.all != null ? M.gain.all - P.gain.all : null;
  const row = p.monthEnd.find((r) => r.month === key);
  const [y, mo] = key.split("-").map(Number);
  const t0 = Date.UTC(y, mo - 1, 1), t1 = Date.UTC(y, mo, 0);
  const msIn = allMilestones(p).filter((m) => m.day.startsWith(key)).reverse();
  const recs = (p.records || []).filter((r) => r.month === key);
  const hl = [...(M.highlights || []).map((h) => esc(h)), ...msIn.map((m) => esc(m.platform === "members" ? `${fmt(m.value)} members on boomertanger.com` : `${fmt(m.value)} on ${m.platform === "all" ? "all three platforms combined" : NAME[m.platform]}`)), ...recs.map((r) => `Record: ${esc(r.label)}`)];
  const hours = M.minutes != null ? (M.minutes / 60) : null;
  const gain = M.gain?.all;
  const mem = M.members;
  $("[data-cc-report]")!.innerHTML = `<div class="cc-report-head"><h3 class="bt-card-title">${monthLabel(key, true)}</h3>${era ? `<span class="bt-tag">${esc(era.label)}</span>` : ""}${M.preview ? `<span class="bt-tag">Preview: month-ends only</span>` : ""}<span class="cc-sp"></span>${vs != null && P ? `<span class="cc-vs">${fmt(Math.abs(vs))} ${vs >= 0 ? "more" : "fewer"} new followers than ${monthLabel(P.key, true).split(" ")[0]}</span>` : ""}</div>
    <div class="cc-stats">${box("Streams", M.streams != null ? fmt(M.streams) : "—")}${box("Hours live", hours != null ? (hours % 1 ? hours.toFixed(1) : fmt(hours)) : "—")}${box("New followers", gain != null ? `<span class="${gain >= 0 ? "cc-up-n" : "cc-down-n"}">${gain >= 0 ? "+" : "−"}${fmt(Math.abs(gain))}</span>` : "—", M.rate != null ? `${M.rate.toFixed(2)}% growth` : "")}${box("Total", fmt(row?.all), "at month end")}${mem ? box("New members", `<span class="cc-up-n">+${under(mem.joined)}</span>`, `${fmt(mem.end)} at month end`) : ""}${box("Live likes", M.likes ? likesText(M.likes) : "—", M.likes ? "TikTok, typed in" : "not recorded")}</div>
    <div class="cc-minis">${PLATFORMS.map((k) => {
      const pts = (M.points[k] || []).filter((r) => r.d.startsWith(key));
      const end = M.monthEnd[k], g = M.gain?.[k];
      const head = `<div class="cc-mini-h">${iconHtml(k)}${NAME[k]}<span>${end != null ? `${fmt(end)}${g != null ? ` <b class="cc-up-n">${g >= 0 ? "+" : "−"}${fmt(Math.abs(g))}</b>` : ""}` : ""}</span></div>`;
      const note = M.notes?.[k];
      const body = !pts.length ? `<div class="cc-mini-none">${esc(note || (end != null ? "Month-end only" : "Not streaming here yet"))}</div>` : `<div data-mini="${k}"></div>`;
      return `<div class="cc-mini">${head}${body}</div>`;
    }).join("")}</div>
    ${hl.length ? `<div><span class="bt-label">Highlights</span><ul class="cc-hl">${hl.map((h) => `<li>${h}</li>`).join("")}</ul></div>` : ""}`;
  root!.querySelectorAll<HTMLElement>("[data-mini]").forEach((el) => {
    const k = el.dataset.mini as Platform;
    chart(el, { series: [{ key: k, label: NAME[k], points: toS((M.points[k] || []).filter((r) => r.d.startsWith(key))), color: COLOR[k] }], t0, t1, mini: true, label: `${NAME[k]} on each stream day in ${monthLabel(key, true)}` });
  });
}

// ---------------------------------------------------------------------------------------------- 06 records and pace
function goals() {
  const p = S.pub!, el = $("[data-cc-goals]")!;
  const list = (Object.entries(p.goals || {}) as [Platform | "all" | "members", number][]).filter(([, v]) => v > 0);
  if (!list.length) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = list.map(([k, goal]) => {
    const now = k === "members" ? p.members?.total ?? 0 : p.totals[k] ?? 0;
    const pct = Math.min(100, (now / goal) * 100);
    return `<div class="cc-goal">${iconHtml(k)}<div class="bt-meter" style="--bt-meter-color:${COLOR[k]}"><div class="bt-meter-legend cc-goal-legend"><b>${NAME[k]}: ${fmt(goal)} ${per(k)}</b><span>${fmt(now)} / ${fmt(goal)}</span></div><div class="bt-meter-track" role="meter" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${now}" aria-label="${esc(NAME[k])} goal"><div class="bt-meter-fill" style="width:${pct.toFixed(1)}%"></div></div></div></div>`;
  }).join("");
}
// R2 record tiles (spec §6 chapter 6; mockup records() and recViz()): plain stats, never medals or badges. Each tile is a button that opens its
// month in Month by month: the name, the big number and its unit, the date in gold, a small context chart drawn from the data, a note.
type RecViz = { kind: "bars"; data: [string, number][]; hi: string } | { kind: "line"; p: Platform; pts: SPoint[]; from: number; to: number } | null;
interface RecTile { label: string; value: string; unit: string; when: string; note: string; month: string | null; viz: RecViz }
const shortDay = (d: string) => new Date(ms(d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
function recViz(v: RecViz, w = 200, h = 46) {
  if (!v) return "";
  if (v.kind === "bars") {
    const max = Math.max(1, ...v.data.map((d) => d[1])), bw = w / v.data.length;
    return `<svg class="cc-rec-viz" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false">${v.data.map(([k, n], i) => { const bh = Math.max(2, (Math.max(0, n) / max) * (h - 4)); return `<rect class="cc-rec-bar${k === v.hi ? " is-hi" : ""}" x="${(i * bw + 1).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5"/>`; }).join("")}</svg>`;
  }
  const s = v.pts.filter((x) => x.t >= v.from - 25 * DAY && x.t <= v.to + 25 * DAY);
  if (s.length < 2) return "";
  const lo = Math.min(...s.map((x) => x.v)), hi = Math.max(...s.map((x) => x.v)), t0 = s[0].t, t1 = s[s.length - 1].t;
  const X = (t: number) => ((t - t0) / (t1 - t0 || 1)) * w, Y = (n: number) => h - 3 - ((n - lo) / (hi - lo || 1)) * (h - 6);
  const d = s.map((x, i) => `${i ? "L" : "M"}${X(x.t).toFixed(1)} ${Y(x.v).toFixed(1)}`).join("");
  const a = s.find((x) => x.t === v.from), b = s.find((x) => x.t === v.to);
  return `<svg class="cc-rec-viz" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false"><path class="cc-rec-line" style="stroke:${COLOR[v.p]}" d="${d}"/>${a && b ? `<path class="cc-rec-jump" d="M${X(a.t).toFixed(1)} ${Y(a.v).toFixed(1)}L${X(b.t).toFixed(1)} ${Y(b.v).toFixed(1)}"/><circle class="cc-rec-dot" cx="${X(b.t).toFixed(1)}" cy="${Y(b.v).toFixed(1)}" r="3.5"/>` : ""}</svg>`;
}
function recordTiles(): RecTile[] {
  const p = S.pub!, rd = readingSeries(S.months!), r = records(S.months!, rd);
  const list = [...S.months!.values()].filter((m) => !m.preview || m.gain?.all != null).sort((a, b) => (a.key < b.key ? -1 : 1));
  const out: RecTile[] = [];
  if (r.best) {
    const gains = list.filter((m) => m.gain?.all != null).map((m) => [m.key, m.gain.all as number] as [string, number]);
    out.push({ label: "Biggest month", value: `+${fmt(r.best.gain.all)}`, unit: "new followers", when: monthLabel(r.best.key, true), note: r.best.highlights?.[0] || "Across every platform", month: r.best.key, viz: { kind: "bars", data: gains, hi: r.best.key } });
  }
  if (r.jump) {
    const j = r.jump;
    out.push({ label: "Best jump between streams", value: `+${fmt(j.value)}`, unit: `${NAME[j.platform]} ${per(j.platform)}`, when: `${shortDay(j.from)} to ${dayLabel(j.to)}`, note: "Between two readings in a row", month: j.to.slice(0, 7), viz: { kind: "line", p: j.platform, pts: toS(rd[j.platform]), from: ms(j.from), to: ms(j.to) } });
  }
  // Peak viewers: the best Control Room stream (every platform added up) once one exists, otherwise the imported TikTok record; never compared
  const imported = (p.records || []).find((x) => x.id && x.platform && x.value);
  const before = imported ? `${fmt(imported.value)} on ${NAME[imported.platform as Key] || imported.platform}, ${monthLabel(imported.month, true)}` : null;
  if (r.peak) out.push({ label: "Peak viewers", value: fmt(r.peak.value), unit: "viewers, all platforms", when: dayLabel(r.peak.day), note: before ? `Before the site: ${before}.` : "The best stream across every platform.", month: r.peak.day.slice(0, 7), viz: null });
  else if (imported) out.push({ label: "Peak viewers", value: fmt(imported.value), unit: `on ${NAME[imported.platform as Key] || imported.platform}`, when: monthLabel(imported.month, true), note: "Before the site.", month: imported.month, viz: null });
  if (r.most) {
    const streams = list.filter((m) => m.streams != null).map((m) => [m.key, m.streams as number] as [string, number]);
    const h = r.most.minutes != null ? r.most.minutes / 60 : null;
    out.push({ label: "Most streams in a month", value: fmt(r.most.streams), unit: "streams", when: monthLabel(r.most.key, true), note: h != null ? `${h % 1 ? h.toFixed(1) : fmt(h)} hours live` : "Hours not recorded", month: r.most.key, viz: { kind: "bars", data: streams, hi: r.most.key } });
  }
  return out;
}
function recordsGrid() {
  if (!S.member || !S.months) return;
  const has = (k: string | null) => !!k && S.months!.has(k);
  $("[data-cc-recs]")!.innerHTML = recordTiles().map((t) => `<button type="button" class="bt-card cc-rec"${has(t.month) ? ` data-goto="${t.month}"` : " disabled"}><span class="bt-label">${esc(t.label)}</span><span class="cc-rec-n">${t.value}<small>${esc(t.unit)}</small></span><span class="cc-rec-when">${esc(t.when)}</span>${recViz(t.viz)}<span class="cc-rec-note">${esc(t.note)}</span>${has(t.month) ? `<span class="cc-rec-go">Open ${monthLabel(t.month!)} <span aria-hidden="true">›</span></span>` : ""}</button>`).join("");
}
function paceCard() {
  if (!S.member || !S.months) return;
  const p = S.pub!, rd = readingSeries(S.months);
  // At this pace (§9): combined and per platform over the last 60 days
  const comb = combinedSeries(p, rd);
  const tpl = document.getElementById("bt-mascot-tpl")?.innerHTML || "";
  const lines: string[] = [];
  for (const k of ["all", ...PLATFORMS] as (Platform | "all")[]) {
    const pts = k === "all" ? comb : toS(rd[k]);
    const goal = (p.goals || {})[k] || null;
    const f = pace(pts, goal);
    if (f.state === "paused") continue;
    if (f.state === "goal") lines.push(`At this pace, ${NAME[k] === "Combined" ? "the combined total" : NAME[k]} reaches ${fmt(goal)} around <b>${new Date(f.at).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</b>.`);
    else if (f.state === "steady") lines.push(`${NAME[k]}: holding steady.`);
    else lines.push(`${NAME[k]}: about <b>+${f.perDay < 10 ? f.perDay.toFixed(1) : fmt(f.perDay)}</b> a day.`);
  }
  $("[data-cc-pace]")!.innerHTML = lines.length
    ? `<div aria-hidden="true">${tpl}</div><div><b class="bt-card-title cc-card-t">At this pace</b><ul class="cc-hl">${lines.map((l) => `<li>${l}</li>`).join("")}</ul></div>`
    : `<div aria-hidden="true">${tpl}</div><div><b class="bt-card-title cc-card-t">At this pace: paused</b><p>Forecasts need at least 14 readings in the last 60 days${p.lastReading ? `, and the last reading was ${dayLabel(p.lastReading.day)}` : ""}. They come back on their own about two weeks after the morning readings start.</p></div>`;
}

// ---------------------------------------------------------------------------------------------- drawing
/** BOOMBOT answers with a live fact (help JSON "live"): {milestone:<id>} becomes that milestone's date from public/climb; without it the plain answer stays. */
function liveAnswers(p: Public) {
  root!.querySelectorAll<HTMLElement>("[data-cc-live]").forEach((el) => {
    const tpl = el.dataset.ccLive || "";
    let ok = true;
    const text = tpl.replace(/\{milestone:([a-z0-9-]+)\}/g, (_, id: string) => {
      const m = p.milestones.find((x) => x.id === id);
      if (!m) { ok = false; return ""; }
      return new Date(ms(m.day)).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
    });
    if (ok) el.textContent = text;
  });
}
function draw() {
  const p = S.pub;
  root!.dataset.viewer = S.member ? "member" : "visitor";
  if (!p) {
    $("[data-cc-total]")!.textContent = "—";
    $("[data-cc-asof]")!.textContent = "The climb is being set up. Check back soon.";
    return;
  }
  if (!S.member && S.range !== "all") S.range = "all";
  hero(p);
  drawScene($("[data-cc-scene]")!, p, { onScrub: (q) => { S.scrub = q; hero(p); } });
  liveAnswers(p); controls(); drawBig(); membersChart(); memberBreakdown(); milestones(); stages(); crossover(); months(); goals(); recordsGrid(); paceCard();
}

let stopMonths: (() => void) | null = null;
function setViewer(s: AuthState) {
  const signedMember = !!s.user && (s.status === "verified" || s.status === "unverified");
  const preview = !s.user && previewMember();
  const want = signedMember || preview;
  if (want === S.member && (S.months || !want)) return;
  S.member = want;
  stopMonths?.(); stopMonths = null; S.months = null;
  if (preview) { S.months = S.pub ? previewMonths(S.pub) : null; draw(); return; }
  if (signedMember) {
    // no members doc (signup not finished): the rules refuse quietly and the lock cards show
    stopMonths = watchMonths((m) => { S.months = m; draw(); }, () => { S.member = false; S.months = null; draw(); });
  }
  draw();
}

if (root) {
  initChat(root as unknown as Document);
  watchPublic((p) => {
    S.pub = p;
    if (p && S.member && !getAuthState().user && previewMember()) S.months = previewMonths(p);
    draw();
    if (S.month && qs.get("month") && S.member) { document.getElementById("ch-months")?.scrollIntoView({ behavior: reduce() ? "auto" : "smooth" }); qs.delete("month"); }
  });
  onAuth((s) => { if (s.status !== "loading") setViewer(s); });
  root.addEventListener("click", (e) => {
    const t = e.target as Element;
    const ser = t.closest<HTMLElement>("[data-series]");
    if (ser) { const k = ser.dataset.series as Key; if (S.on.has(k) && S.on.size > 1) S.on.delete(k); else S.on.add(k); controls(); drawBig(); return; }
    const rng = t.closest<HTMLElement>("[data-range]");
    if (rng) { S.range = rng.dataset.range!; controls(); drawBig(); return; }
    const go = t.closest<HTMLElement>("[data-goto]");
    if (go && S.months?.has(go.dataset.goto!)) { S.month = go.dataset.goto!; months(); document.getElementById("ch-months")?.scrollIntoView({ behavior: reduce() ? "auto" : "smooth", block: "start" }); return; }
    const mon = t.closest<HTMLElement>("[data-month]");
    if (mon) { S.month = mon.dataset.month!; months(); return; }
    if (t.closest("[data-cc-table]")) {
      const b = t.closest<HTMLElement>("[data-cc-table]")!, tb = $("[data-cc-big-table]")!;
      tb.hidden = !tb.hidden; b.setAttribute("aria-expanded", String(!tb.hidden)); b.textContent = tb.hidden ? "Show as table" : "Hide the table";
      if (!tb.hidden) tb.innerHTML = chartTable(bigOpts());
      return;
    }
    if (t.closest("[data-cc-ms-all]")) {
      const b = t.closest<HTMLElement>("[data-cc-ms-all]")!, l = $("[data-cc-ms-list]")!;
      l.hidden = !l.hidden; b.setAttribute("aria-expanded", String(!l.hidden)); b.textContent = l.hidden ? "Show all milestones" : "Show fewer";
    }
  });
  const series = () => $("[data-cc-series]")!;
  root.addEventListener("pointerover", (e) => { const b = (e.target as Element).closest<HTMLElement>("[data-series]"); if (b && series().contains(b)) focusSeries(bigEl(), b.dataset.series!); });
  root.addEventListener("pointerout", (e) => { const b = (e.target as Element).closest<HTMLElement>("[data-series]"); if (b && series().contains(b)) focusSeries(bigEl(), null); });
  // a stage card's sparkline draws in on tap too (hover and focus are CSS)
  root.addEventListener("click", (e) => { const st = (e.target as Element).closest<HTMLElement>(".cc-stage"); if (st) st.classList.toggle("is-on"); });
  // the crossover flow follows its own width (narrow layout under 520px)
  let w = 0;
  new ResizeObserver(() => { const el = $("[data-cc-flow]"); if (!el || !S.pub) return; const n = el.clientWidth < 520; if (n !== (w < 520) || !w) { w = el.clientWidth; crossover(); } else w = el.clientWidth; }).observe($("[data-cc-flow]")!);
}
