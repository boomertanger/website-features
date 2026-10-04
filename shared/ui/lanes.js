// shared/ui/lanes.js — .bt-lanes, a week timeline with labelled lanes (docs/design-system.md §5
// "Lanes"; the Fun Factory builder's Schedule stage). Not .bt-timeline, which is the Vault's dots.
//
//   lanesHtml({ weeks, weekLabel, rows, label })
//     weeks: how many week columns; weekLabel(i) -> "W1" (default)
//     rows: [{ label, head?, bars: [{ from (0-based week), len (weeks), text, color: "title" | "blue" | … }] }]
//     label: the accessible name of the whole picture
import { escapeHtml as esc } from "./dom.js";

export function lanesHtml({ weeks = 13, weekLabel = (i) => `W${i + 1}`, rows = [], label = "Timeline" } = {}) {
  const n = Math.max(1, Math.round(weeks));
  const head = `<div class="bt-lanes-row bt-lanes-row--weeks" aria-hidden="true"><span class="bt-lanes-lab"></span>${Array.from({ length: n }, (_, i) => `<span class="bt-lanes-wk" style="grid-column:${i + 2}">${esc(weekLabel(i))}</span>`).join("")}</div>`;
  const body = rows.map((r) => {
    const bars = (r.bars || []).map((b) => {
      const from = Math.max(0, Math.min(n - 1, Math.floor(b.from || 0)));
      const len = Math.max(1, Math.min(n - from, Math.round(b.len || 1)));
      return `<span class="bt-lanes-bar" style="grid-column:${from + 2} / span ${len};--c:var(--bt-${esc(b.color || "title")})" title="${esc(b.title || b.text || "")}">${esc(b.text || "")}</span>`;
    }).join("");
    return `<div class="bt-lanes-row"><span class="bt-lanes-lab${r.head ? " is-head" : ""}">${esc(r.label || "")}</span>${bars}</div>`;
  }).join("");
  return `<div class="bt-lanes" style="--bt-lanes-weeks:${n}" role="img" aria-label="${esc(label)}"><div class="bt-lanes-in">${head}${body}</div></div>`;
}
