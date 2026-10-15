// shared/ui/chart.js — .bt-chart (docs/specs/creator-climb.md §12; design-system.md §5 ".bt-chart"): an SVG line chart over time, ported from the
// Creator Climb mockup's engine. Grid with nice ticks, era bands with labels, hatched gaps ("Not tracked month by month"), one line per series
// (colours come from the page: a series' `color` is a CSS value such as "var(--cc-twitch)", set as --c; the kit has no feature colours), an icon
// slot at each line's end (collisions nudged apart), a crosshair with a tooltip (the date, each value and its change since the previous reading,
// "From the old growth pages" under imported points, "Sample" under sample points), lines that break across a gap longer than 20 days (never a
// line through untracked time), pointer and keyboard (arrows, Home, End, Esc), has-focus to highlight one series (focusSeries), the mascot
// empty state, --mini small multiples, and chartTable() for "Show as table". Redraws on resize (one shared ResizeObserver).
//
//   chart(el, { series, t0, t1, eras?, gaps?, zero?, mini?, monthly?, empty?, label?, notes? })
//     series  [{ key, label, points: [{ t, v, src? }], color?, width?, dash?, icon? }]   t = ms (UTC); src "import" | "sample" | anything else
//     t0, t1  the time range (ms); eras [{ from, to, label }] (ms); gaps [{ from, to }] (ms); zero: the value axis starts at 0
//     mini    small multiple (4 / 3, fewer ticks, no icons); monthly: the tooltip and table say "September 2025" instead of a day
//     empty   the empty state's sentence; label: the chart's accessible name; notes { import, sample } replace the two tooltip notes
//   focusSeries(el, key | null)   dim every line but one (null: all back)
//   chartTable(opts)              "Show as table": a .bt-table, newest first, one column per series
// Under reduced motion nothing animates (the CSS handles it).

const NS = "http://www.w3.org/2000/svg";
const DAY = 864e5, GAP_BREAK = 20 * DAY;
const fmt = (n) => (n == null ? "—" : Math.round(n).toLocaleString("en-US"));
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const monthLabel = (t) => new Date(t).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const dayLabel = (t) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const shortMonth = (t) => new Date(t).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
let uid = 0;

function niceStep(range, n) {
  const raw = Math.max(range, 1) / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
}
const mascotHtml = () => {
  const tpl = typeof document !== "undefined" ? document.getElementById("bt-mascot-tpl") : null;
  return tpl ? tpl.innerHTML : "";
};
/** True when the line from a to b crosses one of the gaps and that gap is longer than 20 days: the line breaks there. */
const breaksAt = (gaps, a, b) => (gaps || []).some((g) => g.to - g.from > GAP_BREAK && a.t <= g.from && b.t >= g.to);

const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver((ents) => ents.forEach((en) => { if (en.target._btChart) draw(en.target, en.target._btChart); })) : null;

export function chart(el, o) {
  if (!el) return;
  const first = !el._btChart;
  el._btChart = o;
  el.classList.add("bt-chart");
  el.classList.toggle("bt-chart--mini", !!o.mini);
  if (!el.hasAttribute("tabindex")) el.tabIndex = 0;
  el.setAttribute("role", "img");
  if (o.label) el.setAttribute("aria-label", o.label);
  if (first && ro) ro.observe(el);
  draw(el, o);
}

export function focusSeries(el, key) {
  if (!el) return;
  el.classList.toggle("has-focus", !!key);
  el.querySelectorAll(".bt-chart-line").forEach((l) => l.classList.toggle("is-focus", !!key && l.dataset.k === key));
}

function draw(el, o) {
  const W = el.clientWidth, H = el.clientHeight;
  if (!W || !H) return;
  const mini = !!o.mini;
  const pad = { l: mini ? 34 : 46, r: mini ? 10 : 34, t: o.eras && o.eras.length && !mini ? 22 : 10, b: 24 };
  const series = (o.series || []).filter((s) => s.points && s.points.length);
  el.innerHTML = "";
  const inRange = (p) => p.t >= o.t0 && p.t <= o.t1;
  if (!series.some((s) => s.points.some(inRange))) {
    const e = document.createElement("div");
    e.className = "bt-chart-empty";
    e.innerHTML = `<div aria-hidden="true">${mascotHtml()}</div><p>${esc(o.empty || "No readings in this range yet.")}</p>`;
    el.appendChild(e);
    return;
  }
  const vis = series.map((s) => ({ ...s, points: s.points.filter((p) => p.t >= o.t0 - 1 && p.t <= o.t1 + 1) })).filter((s) => s.points.length);
  let lo = o.zero ? 0 : Infinity, hi = -Infinity;
  vis.forEach((s) => s.points.forEach((p) => { lo = Math.min(lo, p.v); hi = Math.max(hi, p.v); }));
  if (!o.zero) { const pv = Math.max((hi - lo) * 0.12, 2); lo = Math.max(0, lo - pv); hi += pv; } else hi = hi * 1.06 || 1;
  const step = niceStep(hi - lo, mini ? 3 : 4);
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  if (hi === lo) hi = lo + step;
  const X = (t) => pad.l + ((t - o.t0) / (o.t1 - o.t0 || 1)) * (W - pad.l - pad.r);
  const Y = (v) => H - pad.b - ((v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const hatch = `bt-chart-hatch-${++uid}`;
  let h = `<defs><pattern id="${hatch}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect class="bt-chart-hatch-bg" width="8" height="8"/><line class="bt-chart-hatch" x1="0" y1="0" x2="0" y2="8"/></pattern></defs>`;
  if (!mini) (o.eras || []).forEach((e) => {
    const a = Math.max(X(e.from), pad.l), b = Math.min(X(e.to), W - pad.r);
    if (b - a < 2) return;
    h += `<rect class="bt-chart-era" x="${a}" y="${pad.t - 18}" width="${b - a}" height="${H - pad.b - pad.t + 18}" rx="6"/>`;
    if (b - a > 70) h += `<text class="bt-chart-era-k" x="${a + 8}" y="${pad.t - 5}">${esc(e.label)}</text>`;
  });
  (o.gaps || []).forEach((g) => {
    const a = Math.max(X(g.from), pad.l), b = Math.min(X(g.to), W - pad.r);
    if (b - a <= 4) return;
    h += `<rect class="bt-chart-gap" style="fill:url(#${hatch})" x="${a}" y="${pad.t}" width="${b - a}" height="${H - pad.b - pad.t}"/>`;
    if (b - a > 90 && !mini) h += `<text class="bt-chart-gap-k" x="${(a + b) / 2}" y="${(pad.t + H - pad.b) / 2}" text-anchor="middle">Not tracked month by month</text>`;
  });
  for (let v = lo; v <= hi + 1e-6; v += step) {
    const k = v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}K` : String(v);
    h += `<line class="bt-chart-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="bt-chart-yk" x="${pad.l - 6}" y="${Y(v) + 4}" text-anchor="end">${k}</text>`;
  }
  // time ticks: months over long ranges, days over short ones
  const span = o.t1 - o.t0, ticks = [];
  if (span > 300 * DAY) {
    const d = new Date(o.t0);
    let y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
    const every = W < 420 ? 6 : W < 620 ? 4 : span > 500 * DAY ? 3 : 2;
    while (Date.UTC(y, m, 1) <= o.t1) {
      if (m % every === 0) ticks.push([Date.UTC(y, m, 1), `${shortMonth(Date.UTC(y, m, 1))} '${String(y).slice(2)}`]);
      if (++m > 11) { m = 0; y++; }
    }
  } else {
    const n = mini ? 3 : W < 520 ? 4 : 6;
    for (let i = 0; i <= n; i++) { const t = o.t0 + (span * i) / n; ticks.push([t, new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })]); }
  }
  let lastX = -1e9;
  ticks.forEach(([t, k], i) => {
    const x = X(t);
    if (x < pad.l - 1 || x > W - pad.r + 1 || x - lastX < 54) return;
    lastX = x;
    const anchor = mini && i === 0 ? "start" : mini && i === ticks.length - 1 ? "end" : "middle";
    h += `<text class="bt-chart-xk" x="${x}" y="${H - 6}" text-anchor="${anchor}">${k}</text>`;
  });
  const sty = (s) => `--c:${s.color || "var(--bt-text-muted)"};${s.width ? `--w:${s.width};` : ""}${s.dash ? `--dash:${s.dash};` : ""}`;
  vis.forEach((s) => {
    const d = s.points.map((p, i) => `${i && !breaksAt(o.gaps, s.points[i - 1], p) ? "L" : "M"}${X(p.t).toFixed(1)} ${Y(p.v).toFixed(1)}`).join("");
    h += `<path class="bt-chart-line" data-k="${esc(s.key)}" style="${sty(s)}" d="${d}"/>`;
  });
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = h;
  // line-end icons, nudged apart when they'd overlap
  if (!mini) {
    const ends = vis.filter((s) => s.icon).map((s) => ({ s, p: s.points[s.points.length - 1] })).map((e) => ({ ...e, y: Y(e.p.v) - 11 })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 24) ends[i].y = ends[i - 1].y + 24;
    ends.forEach(({ s, p, y }) => {
      const fo = document.createElementNS(NS, "foreignObject");
      fo.setAttribute("class", "bt-chart-end");
      fo.setAttribute("x", String(Math.min(X(p.t) + 6, W - 24)));
      fo.setAttribute("y", String(y));
      fo.setAttribute("width", "24"); fo.setAttribute("height", "24");
      fo.innerHTML = `<div xmlns="http://www.w3.org/1999/xhtml" class="bt-chart-end-i" style="${sty(s)}">${s.icon}</div>`;
      svg.appendChild(fo);
    });
  }
  el.appendChild(svg);
  // crosshair and tooltip
  const times = [...new Set(vis.flatMap((s) => s.points.map((p) => p.t)))].sort((a, b) => a - b);
  const tip = document.createElement("div");
  tip.className = "bt-chart-tip";
  tip.setAttribute("role", "status");
  el.appendChild(tip);
  const g = document.createElementNS(NS, "g");
  svg.appendChild(g);
  const notes = { import: "From the old growth pages", sample: "Sample", ...(o.notes || {}) };
  let idx = -1;
  const show = (i) => {
    idx = Math.max(0, Math.min(times.length - 1, i));
    const t = times[idx], x = X(t);
    let gh = `<line class="bt-chart-cross" x1="${x}" x2="${x}" y1="${pad.t}" y2="${H - pad.b}"/>`, rows = "", imp = false, smp = false;
    vis.forEach((s) => {
      const j = s.points.findIndex((p) => p.t === t);
      if (j < 0) return;
      const p = s.points[j];
      if (p.src === "import") imp = true;
      if (p.src === "sample") smp = true;
      const prev = j > 0 && !breaksAt(o.gaps, s.points[j - 1], p) ? s.points[j - 1] : null;
      const ch = prev ? p.v - prev.v : null;
      gh += `<circle class="bt-chart-dot" data-k="${esc(s.key)}" style="${sty(s)}" cx="${x}" cy="${Y(p.v)}" r="${s.width ? 5 : 4}"/>`;
      rows += `<div class="bt-chart-tip-r" style="${sty(s)}"><i></i><span>${esc(s.label || s.key)}</span><b>${fmt(p.v)}</b>${ch ? `<em data-up="${ch > 0}">${ch > 0 ? "+" : "−"}${fmt(Math.abs(ch))}</em>` : ""}</div>`;
    });
    g.innerHTML = gh;
    tip.innerHTML = `<b>${o.monthly ? monthLabel(t) : dayLabel(t)}</b>${rows}${imp ? `<small>${esc(notes.import)}</small>` : ""}${smp ? `<small>${esc(notes.sample)}</small>` : ""}`;
    tip.classList.add("is-on");
    const tw = tip.offsetWidth;
    let left = x + 14;
    if (left + tw > W) left = x - tw - 14;
    tip.style.left = `${Math.max(0, left)}px`;
    tip.style.top = `${Math.max(0, pad.t)}px`;
  };
  const hide = () => { g.innerHTML = ""; tip.classList.remove("is-on"); idx = -1; };
  el.onpointermove = (e) => {
    const r = el.getBoundingClientRect();
    const t = o.t0 + ((e.clientX - r.left - pad.l) / (W - pad.l - pad.r)) * (o.t1 - o.t0);
    let best = 0;
    times.forEach((x, i) => { if (Math.abs(x - t) < Math.abs(times[best] - t)) best = i; });
    show(best);
  };
  el.onpointerleave = (e) => { if (e.pointerType === "mouse") hide(); };
  el.onkeydown = (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); show(idx < 0 ? times.length - 1 : idx + (e.key === "ArrowRight" ? 1 : -1)); }
    else if (e.key === "Home") { e.preventDefault(); show(0); }
    else if (e.key === "End") { e.preventDefault(); show(times.length - 1); }
    else if (e.key === "Escape") hide();
  };
  el.onblur = hide;
}

/** "Show as table": every reading in the range, newest first, one column per series (a .bt-table in a scroll box). */
export function chartTable(o) {
  const vis = (o.series || []).filter((s) => s.points && s.points.length);
  const times = [...new Set(vis.flatMap((s) => s.points.filter((p) => p.t >= o.t0 && p.t <= o.t1).map((p) => p.t)))].sort((a, b) => b - a);
  const head = `<tr><th scope="col">${o.monthly ? "Month" : "Day"}</th>${vis.map((s) => `<th scope="col" class="bt-chart-num">${esc(s.label || s.key)}</th>`).join("")}</tr>`;
  const body = times.map((t) => `<tr><td>${o.monthly ? monthLabel(t) : dayLabel(t)}</td>${vis.map((s) => { const p = s.points.find((x) => x.t === t); return `<td class="bt-chart-num">${p ? fmt(p.v) : ""}</td>`; }).join("")}</tr>`).join("");
  return `<div class="bt-chart-table"><table class="bt-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}
