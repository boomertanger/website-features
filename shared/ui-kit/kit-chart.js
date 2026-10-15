// shared/ui-kit/kit-chart.js — the ".bt-chart" section of the UI Kit page (/dev/ui-kit): the line chart (shared/ui/chart.js; docs/specs/
// creator-climb.md §12) in every state: full with eras and a gap (lines break across it), focused series (hover or tap a chip), three minis,
// the empty state, and "Show as table". Made-up demo numbers (the points are marked "sample", so the tooltip says Sample); the line colours
// are kit tokens here, set by the page as a feature would. No reads, no writes. ui-kit.js appends chartKitHtml() and calls initChartKit(mount).
import { chart, chartTable, focusSeries } from "../ui/chart.js";

const D = 864e5, T0 = Date.UTC(2025, 0, 1), T1 = Date.UTC(2026, 9, 15);
const GAP = { from: Date.UTC(2026, 3, 20), to: Date.UTC(2026, 8, 25) };
const ERAS = [{ from: T0, to: Date.UTC(2025, 5, 1), label: "Before" }, { from: Date.UTC(2025, 5, 1), to: Date.UTC(2026, 1, 1), label: "The grind" }, { from: Date.UTC(2026, 1, 1), to: T1, label: "The build" }];
const COLORS = { all: "var(--bt-title)", a: "var(--bt-ice)", b: "var(--bt-pink)", c: "var(--bt-fuse)" };
/** A smooth made-up climb: one point a week before the gap, a few after it. */
function demo(start, slope, wobble) {
  const pts = [];
  for (let t = Date.UTC(2025, 5, 1), i = 0; t <= T1; t += 7 * D, i++) {
    if (t > GAP.from && t < GAP.to) continue;
    pts.push({ t, v: Math.round(start + slope * i + Math.sin(i / 3) * wobble), src: "sample" });
  }
  return pts;
}
function seriesSet() {
  const a = demo(300, 14, 30), b = demo(2400, 70, 120), c = demo(400, 9, 20);
  const all = a.map((p, i) => ({ t: p.t, v: p.v + b[i].v + c[i].v, src: "sample" }));
  const icon = (k) => `<b>${k}</b>`;
  return [
    { key: "all", label: "Combined", points: all, color: COLORS.all, width: 3.5, icon: icon("∑") },
    { key: "a", label: "Platform A", points: a, color: COLORS.a, icon: icon("A") },
    { key: "b", label: "Platform B", points: b, color: COLORS.b, dash: "6 4", icon: icon("B") },
    { key: "c", label: "Platform C", points: c, color: COLORS.c, dash: "2 4", icon: icon("C") },
  ];
}

export function chartKitHtml() {
  return `
  <section class="kit-section" id="kit-chart">
    <h2 class="kit-h">Line chart (.bt-chart)</h2>
    <p class="kit-p">A line chart over time (<span class="kit-code">shared/ui/chart.js</span>: <span class="kit-code">chart(el, opts)</span>, <span class="kit-code">focusSeries</span>, <span class="kit-code">chartTable</span>; <span class="kit-code">docs/specs/creator-climb.md</span> §12). Era bands, a hatched gap where nothing was tracked (no line crosses a gap longer than 20 days), line-end icons, a crosshair tooltip with each value's change, arrows / Home / End / Esc on the keyboard. Line colours come from the page (a series' <span class="kit-code">color</span>); these demo numbers are made up and marked Sample.</p>
    <h3 class="kit-sub">Full, with eras and a gap; hover a chip to focus its line</h3>
    <div class="kit-row" data-kit-chart-chips style="margin-bottom:10px"></div>
    <div data-kit-chart="full"></div>
    <div class="kit-row" style="margin-top:10px"><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-kit-chart-table aria-expanded="false">Show as table</button></div>
    <div class="bt-chart-table" data-kit-chart-tablebox hidden></div>
    <h3 class="kit-sub">Mini (small multiples)</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px"><div data-kit-chart="mini-a"></div><div data-kit-chart="mini-b"></div><div data-kit-chart="mini-c"></div></div>
    <h3 class="kit-sub">Empty (nothing in the range)</h3>
    <div data-kit-chart="empty" style="max-width:560px"></div>
  </section>`;
}

export function initChartKit(mount) {
  const sec = mount.querySelector("#kit-chart");
  if (!sec) return;
  const S = seriesSet();
  const box = (k) => sec.querySelector(`[data-kit-chart="${k}"]`);
  const full = { series: S, t0: T0, t1: T1, eras: ERAS, gaps: [GAP], zero: true, label: "Demo climb: four lines from January 2025" };
  chart(box("full"), full);
  ["a", "b", "c"].forEach((k) => {
    const s = S.find((x) => x.key === k);
    chart(box(`mini-${k}`), { series: [s], t0: Date.UTC(2025, 8, 1), t1: Date.UTC(2025, 9, 1), mini: true, label: `${s.label} in September 2025` });
  });
  chart(box("empty"), { series: S, t0: Date.UTC(2026, 4, 1), t1: Date.UTC(2026, 7, 31), empty: "No readings in this range yet. The morning collector adds one every day." });
  const chips = sec.querySelector("[data-kit-chart-chips]");
  chips.innerHTML = S.map((s) => `<button type="button" class="bt-chip bt-chip--small" data-k="${s.key}" style="border-color:${s.color}">${s.label}</button>`).join("");
  chips.addEventListener("pointerover", (e) => { const b = e.target.closest("[data-k]"); focusSeries(box("full"), b ? b.dataset.k : null); });
  chips.addEventListener("pointerout", () => focusSeries(box("full"), null));
  chips.addEventListener("click", (e) => { const b = e.target.closest("[data-k]"); if (b) focusSeries(box("full"), box("full").classList.contains("has-focus") ? null : b.dataset.k); });
  const tbtn = sec.querySelector("[data-kit-chart-table]"), tbox = sec.querySelector("[data-kit-chart-tablebox]");
  tbtn.addEventListener("click", () => {
    tbox.hidden = !tbox.hidden;
    tbtn.setAttribute("aria-expanded", String(!tbox.hidden));
    tbtn.textContent = tbox.hidden ? "Show as table" : "Hide the table";
    if (!tbox.hidden) tbox.innerHTML = chartTable(full);
  });
}
