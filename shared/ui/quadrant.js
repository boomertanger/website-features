// shared/ui/quadrant.js — the focus map (docs/specs/traffic-pulse.md §4, §8 "F1"; design-system.md §5): .bt-quadrant, a scatter of items by
// reach (across, log scale) and engagement (up), split at the reach median and at 50%, in four groups:
//   expand    high reach, high engagement   lime
//   fix       high reach, low engagement    gold
//   spotlight low reach, high engagement    blue
//   rethink   low reach, low engagement     gray   ("Fine for a utility" for an item marked utility)
// Bubble size is reach. Every bubble is a keyboard-focusable button (role="button", Enter or Space) that opens the item. Under 640px the
// wrapper shows .bt-quadrant-lanes instead: the four groups as lanes of buttons (a container query; no JS). (Not .bt-lanes: that is the
// week-lanes timeline.)
//
//   focusMapHtml({ items, split, label, axisLabel })   the wrapper (.bt-quadrant-wrap) with the scatter, its key and the lanes
//     items  [{ id, name, x, y, utility?, side? }]  x: reach (> 0), y: 0–1 engagement; side "l" puts the name on the left
//     split  { x?, y? }  x default: the median of the items' x; y default 0.5
//   groupOf(item, split) → "expand" | "fix" | "spotlight" | "rethink"
//   initFocusMap(root, onOpen(id))   wires clicks and keys on every [data-q-open] under root
export const GROUPS = {
  expand: { name: "Expand", why: "Lots of people, and they stay. Give it more." },
  fix: { name: "Fix", why: "Lots of people, but they leave. Find the leak." },
  spotlight: { name: "Spotlight", why: "People love it, few find it. Promote it." },
  rethink: { name: "Rethink", why: "Few people, and they don't stay." },
};
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };

export function groupOf(it, split) {
  const hiX = it.x >= split.x, hiY = it.y >= split.y;
  return hiX && hiY ? "expand" : hiX ? "fix" : hiY ? "spotlight" : "rethink";
}

function scatterSvg(items, split, label) {
  const W = 600, H = 450, x0 = 50, x1 = 570, y0 = 400, y1 = 30;
  const xs = items.map((i) => Math.max(1, i.x));
  const lmin = Math.log10(Math.min(...xs) * 0.8), lmax = Math.log10(Math.max(...xs) * 1.25);
  const ys = items.map((i) => i.y);
  const ymin = Math.max(0, Math.min(0.2, Math.min(...ys) - 0.05)), ymax = Math.min(1, Math.max(0.8, Math.max(...ys) + 0.05));
  const lx = (v) => x0 + ((Math.log10(Math.max(1, v)) - lmin) / (lmax - lmin || 1)) * (x1 - x0);
  const ly = (e) => y0 - ((e - ymin) / (ymax - ymin || 1)) * (y0 - y1);
  const mx = lx(split.x), my = ly(split.y);
  const zones = `<rect class="bt-quadrant-zone" data-q="expand" x="${mx}" y="${y1}" width="${x1 - mx}" height="${my - y1}"/><rect class="bt-quadrant-zone" data-q="spotlight" x="${x0}" y="${y1}" width="${mx - x0}" height="${my - y1}"/><rect class="bt-quadrant-zone" data-q="fix" x="${mx}" y="${my}" width="${x1 - mx}" height="${y0 - my}"/><rect class="bt-quadrant-zone" data-q="rethink" x="${x0}" y="${my}" width="${mx - x0}" height="${y0 - my}"/>`;
  const names = `<text class="bt-quadrant-name" data-q="expand" x="${x1 - 6}" y="${y1 + 18}" text-anchor="end">Expand</text><text class="bt-quadrant-name" data-q="spotlight" x="${x0 + 6}" y="${y1 + 18}">Spotlight</text><text class="bt-quadrant-name" data-q="fix" x="${x1 - 6}" y="${y0 - 8}" text-anchor="end">Fix</text><text class="bt-quadrant-name" data-q="rethink" x="${x0 + 6}" y="${y0 - 8}">Rethink</text>`;
  const pct = (v) => `${Math.round(v * 100)}%`;
  const axes = `<text class="bt-quadrant-axis" x="${x1}" y="${y0 + 22}" text-anchor="end">More views →</text><text class="bt-quadrant-axis" x="${x0}" y="${y0 + 22}">${esc(label.axis)}</text><text class="bt-quadrant-axis" x="${x0 - 8}" y="${y1 + 4}" text-anchor="end">${pct(ymax)}</text><text class="bt-quadrant-axis" x="${x0 - 8}" y="${my + 4}" text-anchor="end">${pct(split.y)}</text><text class="bt-quadrant-axis" x="${x0 - 8}" y="${y0}" text-anchor="end">${pct(ymin)}</text><text class="bt-quadrant-axis" x="${mx}" y="${y0 + 22}" text-anchor="middle">median</text>`;
  const maxX = Math.max(...xs);
  const dots = items.map((it) => {
    const x = lx(it.x), y = ly(it.y), r = 5 + Math.sqrt(it.x / maxX) * 14, q = groupOf(it, split);
    const left = it.side === "l" || x > x1 - 90;
    const tx = left ? -r - 5 : r + 5;
    const what = q === "rethink" && it.utility ? "fine for a utility" : GROUPS[q].name;
    return `<g class="bt-quadrant-dot" data-q="${q}" tabindex="0" role="button" data-q-open="${esc(it.id)}" aria-label="${esc(it.name)}: ${fmt(it.x)} views, ${pct(it.y)} engaged, ${what}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"/><text x="${(x + tx).toFixed(1)}" y="${(y + 3.5).toFixed(1)}" text-anchor="${left ? "end" : "start"}">${esc(it.name)}</text></g>`;
  }).join("");
  return `<div class="bt-quadrant"><svg viewBox="0 0 ${W} ${H + 10}" role="group" aria-label="${esc(label.map)}">${zones}<line class="bt-quadrant-split" x1="${mx}" y1="${y1}" x2="${mx}" y2="${y0}"/><line class="bt-quadrant-split" x1="${x0}" y1="${my}" x2="${x1}" y2="${my}"/>${names}${axes}${dots}</svg></div>`;
}

export function focusMapHtml({ items = [], split = {}, label = {}, empty = "Not enough visits to judge yet." } = {}) {
  const L = { map: label.map || "Focus map", axis: label.axis || "Views (28 days, log scale)" };
  if (!items.length) return `<div class="bt-quadrant-wrap is-empty"><p class="bt-quadrant-empty">${esc(empty)}</p></div>`;
  const sp = { x: split.x ?? median(items.map((i) => i.x)), y: split.y ?? 0.5 };
  const key = `<div class="bt-quadrant-key">${Object.keys(GROUPS).map((q) => `<span data-q="${q}"><i></i>${GROUPS[q].name}</span>`).join("")}</div>`;
  const lanes = `<div class="bt-quadrant-lanes">${Object.keys(GROUPS).map((q) => {
    const list = items.filter((i) => groupOf(i, sp) === q).sort((a, b) => b.x - a.x);
    const why = q === "rethink" && list.length && list.every((i) => i.utility) ? "Fine for a utility." : GROUPS[q].why;
    return `<div class="bt-quadrant-lane" data-q="${q}"><h4>${GROUPS[q].name}</h4><p>${esc(why)}</p>${list.map((i) => `<button type="button" data-q-open="${esc(i.id)}">${esc(i.name)}<span>${fmt(i.x)}</span></button>`).join("") || `<p class="bt-quadrant-none">None</p>`}</div>`;
  }).join("")}</div>`;
  return `<div class="bt-quadrant-wrap"><div class="bt-quadrant-scatter">${scatterSvg(items, sp, L)}${key}</div>${lanes}</div>`;
}

export function initFocusMap(root, onOpen) {
  if (!root || root._btFocusMap) return;
  root._btFocusMap = true;
  root.addEventListener("click", (e) => { const t = e.target.closest?.("[data-q-open]"); if (t && root.contains(t)) onOpen(t.dataset.qOpen); });
  root.addEventListener("keydown", (e) => {
    const t = e.target.closest?.(".bt-quadrant-dot[data-q-open]");
    if (t && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(t.dataset.qOpen); }
  });
}
