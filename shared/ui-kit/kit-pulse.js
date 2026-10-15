// shared/ui-kit/kit-pulse.js — the Traffic Pulse kit pieces on the UI Kit page (/dev/ui-kit; docs/specs/traffic-pulse.md §8): .bt-delta in
// every state (better, worse, flat, lowerIsBetter), .bt-spark (with and without the previous period, empty), .bt-kpi (normal, empty, the
// gold tick), the focus map (.bt-quadrant with its lanes under 640px; the empty state) and the .bt-chart additions (the previous period, an
// area, on-air bands and note pins). Made-up demo numbers. No reads, no writes. ui-kit.js appends pulseKitHtml() and calls initPulseKit(mount).
import { deltaHtml, sparkHtml, kpiHtml, tick } from "../ui/kpi.js";
import { focusMapHtml, initFocusMap } from "../ui/quadrant.js";
import { chart } from "../ui/chart.js";

const D = 864e5, T1 = Date.UTC(2026, 9, 15), T0 = T1 - 27 * D;
const wave = (base, amp, k) => Array.from({ length: 28 }, (_, i) => Math.round(base + Math.sin(i / 2.2 + k) * amp + i * 3 + ((i * 37) % 11) * 4));

export function pulseKitHtml() {
  const now = wave(420, 90, 0), prev = wave(380, 80, 1.3);
  return `
  <section class="kit-section" id="kit-pulse">
    <h2 class="kit-h">Numbers that move (.bt-delta, .bt-spark, .bt-kpi) and the focus map (.bt-quadrant)</h2>
    <p class="kit-p">Built for Traffic Pulse (shared/ui/kpi.js, shared/ui/quadrant.js). A delta's arrow shows the direction and its colour whether that's good: lime better, gold worse, gray flat; lowerIsBetter flips the colour, never the arrow, so rising errors are ▲ in gold. Screen readers hear "up, worse". The focus map's bubbles are buttons; under 640px it becomes lanes.</p>
    <h3 class="kit-sub">.bt-delta</h3>
    <div class="kit-row" style="gap:8px;flex-wrap:wrap">${deltaHtml(12)}${deltaHtml(-8)}${deltaHtml(0)}${deltaHtml(3, { label: "3 pts" })}${deltaHtml(40, { lowerIsBetter: true, label: "40% errors" })}${deltaHtml(-15, { lowerIsBetter: true, label: "15% load time" })}</div>
    <h3 class="kit-sub">.bt-spark</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;max-width:640px"><div>${sparkHtml(now, { prev })}</div><div>${sparkHtml(now)}</div><div>${sparkHtml([])}</div></div>
    <h3 class="kit-sub">.bt-kpi (normal, lower is better, empty, the gold tick)</h3>
    <div data-kit-kpis style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px">
      ${kpiHtml({ label: "Visitors", value: 4812, delta: deltaHtml(12), spark: now, prev, id: "a" })}
      ${kpiHtml({ label: "Script errors", value: 37, delta: deltaHtml(40, { lowerIsBetter: true }), spark: prev, id: "b" })}
      ${kpiHtml({ label: "Engaged views", value: "61", unit: "%", delta: deltaHtml(0, { label: "0 pts" }), spark: now.map((v) => v / 8), id: "c" })}
      ${kpiHtml({ label: "New members", empty: true, id: "d" })}
    </div>
    <div class="kit-row" style="margin-top:10px"><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-kit-tick>Tick "Visitors" (a record)</button></div>
    <h3 class="kit-sub">Focus map (.bt-quadrant; lanes under 640px) and its empty state</h3>
    <div data-kit-map style="max-width:640px"></div>
    <p class="bt-meta" data-kit-map-out aria-live="polite"></p>
    <div style="max-width:420px;margin-top:12px">${focusMapHtml({ items: [] })}</div>
    <h3 class="kit-sub">.bt-chart with the previous period, an area, on-air bands and note pins</h3>
    <div data-kit-pulse-chart></div>
  </section>`;
}

export function initPulseKit(mount) {
  const sec = mount.querySelector("#kit-pulse");
  if (!sec) return;
  sec.querySelector("[data-kit-tick]").addEventListener("click", () => tick(sec.querySelector('[data-kpi="a"]')));
  const items = [
    { id: "live", name: "Live", x: 9400, y: 0.68 }, { id: "vault", name: "Game Vault", x: 6100, y: 0.41 }, { id: "arcade", name: "Arcade", x: 3800, y: 0.72 },
    { id: "climb", name: "Creator Climb", x: 900, y: 0.66 }, { id: "base-camp", name: "Base Camp", x: 1300, y: 0.58, side: "l" }, { id: "shop", name: "Shop", x: 2100, y: 0.31 },
    { id: "contact", name: "Contact", x: 450, y: 0.34, utility: true }, { id: "tech", name: "Tech Stack", x: 700, y: 0.39 },
  ];
  const map = sec.querySelector("[data-kit-map]"), out = sec.querySelector("[data-kit-map-out]");
  map.innerHTML = focusMapHtml({ items, label: { map: "Demo focus map" } });
  initFocusMap(map, (id) => { out.textContent = `Open ${items.find((i) => i.id === id)?.name}`; });
  const now = wave(420, 90, 0), prev = wave(380, 80, 1.3);
  const pts = now.map((v, i) => ({ t: T0 + i * D, v, src: "sample" }));
  const cmp = prev.map((v, i) => ({ t: T0 + i * D, v }));
  const live = [3, 6, 10, 13, 17, 20, 24, 27].map((i) => ({ from: T0 + i * D - D / 2, to: T0 + i * D + D / 2, tone: "live" }));
  chart(sec.querySelector("[data-kit-pulse-chart]"), {
    series: [{ key: "visits", label: "Visits", points: pts, color: "var(--bt-title)", area: true }], t0: T0, t1: T1, zero: true,
    compare: { label: "Previous 28 days", points: cmp }, eras: live,
    pins: [{ t: T0 + 6 * D, title: "Game Vault 1.2: the twin dials" }, { t: T0 + 17 * D, title: "Stream: Granny Gauntlet, night 12" }, { t: T0 + 24 * D, title: "YouTube upload: best jump scares" }],
    label: "Demo visits per day, with the previous 28 days, stream days and notes",
  });
}
