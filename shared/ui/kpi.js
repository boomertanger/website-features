// shared/ui/kpi.js — numbers that move (docs/specs/traffic-pulse.md §8; design-system.md §5 and §8): .bt-delta, .bt-spark and .bt-kpi.
//
//   deltaHtml(change, { label, lowerIsBetter, unit })  a change chip. The ARROW shows the direction (▲ up, ▼ down, ■ flat); the COLOUR says
//                     whether that's good: lime = better, gold = worse, gray = flat. lowerIsBetter flips the colour, never the arrow (rising
//                     errors are ▲ in gold). Never colour alone: screen readers hear "up, worse" / "down, better" / "no change".
//                     change: a signed number; label: what's shown (default: |change| + unit, unit default "%").
//   sparkHtml(values, { prev, label })  a tiny trend (.bt-spark): the gold line with a soft area, and the previous period as a gray dashed line.
//                     Decorative unless label is given (then role="img" with that label).
//   kpiHtml({ label, value, unit, delta, spark, prev, empty, tone })   a KPI tile (.bt-kpi, built on .bt-stat): the label with its delta chip,
//                     the big number (.bt-stat-value + .bt-stat-unit), the spark under it. empty: a dash and a flat spark ("no data yet").
//                     tick(el): the value flashes gold once (a record or a goal hit); reduced motion: no flash.
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function deltaHtml(change, { label = null, lowerIsBetter = false, unit = "%" } = {}) {
  const n = Number(change) || 0;
  const dir = n > 0 ? "up" : n < 0 ? "down" : "flat";
  const tone = dir === "flat" ? "flat" : (dir === "up") !== !!lowerIsBetter ? "better" : "worse";
  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "■";
  const text = label ?? `${Math.abs(n).toLocaleString("en-US")}${unit}`;
  const sr = dir === "flat" ? "no change" : `${dir}, ${tone}`;
  return `<span class="bt-delta bt-delta--${tone}" data-dir="${dir}"><span aria-hidden="true">${arrow}</span>${esc(text)}<span class="bt-sr-only"> ${sr}</span></span>`;
}

export function sparkHtml(values, { prev = null, label = null } = {}) {
  const vals = (values || []).filter((v) => Number.isFinite(v));
  const w = 120, h = 20;
  if (vals.length < 2) return `<svg class="bt-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path class="bt-spark-prev" d="M0 ${h - 1} L${w} ${h - 1}"/></svg>`;
  const all = [...vals, ...((prev || []).filter((v) => Number.isFinite(v)))];
  const mx = Math.max(...all), mn = Math.min(...all);
  const pt = (v, i, a) => `${((i / (a.length - 1)) * w).toFixed(1)} ${(h - ((v - mn) / (mx - mn || 1)) * (h - 2) - 1).toFixed(1)}`;
  const line = vals.map(pt).join(" L");
  const p = prev && prev.length > 1 ? `<path class="bt-spark-prev" d="M${prev.map(pt).join(" L")}"/>` : "";
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : `aria-hidden="true"`;
  return `<svg class="bt-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" ${a11y} focusable="false"><path class="bt-spark-area" d="M${line} L${w} ${h} L0 ${h}Z"/>${p}<path class="bt-spark-line" d="M${line}"/></svg>`;
}

export function kpiHtml({ label = "", value = "", unit = "", delta = "", spark = null, prev = null, empty = false, id = "" } = {}) {
  const v = empty ? "–" : esc(typeof value === "number" ? value.toLocaleString("en-US") : value);
  return `<div class="bt-kpi${empty ? " is-empty" : ""}"${id ? ` data-kpi="${esc(id)}"` : ""}><div class="bt-kpi-top"><span class="bt-kpi-label">${esc(label)}</span>${empty ? "" : delta}</div><div class="bt-stat"><span class="bt-stat-value">${v}</span>${unit && !empty ? `<span class="bt-stat-unit">${esc(unit)}</span>` : ""}</div>${sparkHtml(empty ? [] : spark, { prev })}</div>`;
}

/** The value flashes gold once (a record or a goal hit). */
export function tick(el) {
  if (!el) return;
  el.classList.remove("is-tick");
  void el.offsetWidth;
  el.classList.add("is-tick");
}
