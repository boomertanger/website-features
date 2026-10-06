// shared/ui/section-head.js — .bt-section-head (docs/design-system.md §5 "Section head"): the
// header of a page section or a shelf: a small icon tile, the heading with a count pill (and an
// optional line under it), a thin gold rule that runs across to the tools on the right (shelf
// arrows, See all). Markup only; the arrows are wired by shelf.js (initShelves) as always.
//
//   sectionHeadHtml({ icon, title, count, sub, meta, tools, level = 2, small }) → html string
//     icon   a character or an inline SVG (decorative), shown in the tile; omit for no tile
//     title  plain text (escaped); count  a number for the pill, omit for none
//     sub    plain text under the heading (hidden on phones); tools  trusted html for the right side
//     meta   a short plain-text note at the right, e.g. "6 streams, 14 hours"; small  the compact size
//            (.bt-section-head--sm, for a section head above a card on a detail page)
import { escapeHtml } from "./dom.js";

export function sectionHeadHtml({ icon = "", title, count = null, sub = "", meta = "", tools = "", level = 2, small = false } = {}) {
  const h = `h${level}`;
  return `<div class="bt-section-head${small ? " bt-section-head--sm" : ""}">${icon ? `<span class="bt-section-head-ic" aria-hidden="true">${icon}</span>` : ""}`
    + `<div class="bt-section-head-text"><${h} class="bt-section-head-title">${escapeHtml(title)}${count == null ? "" : ` <span class="bt-section-head-n">${escapeHtml(String(count))}</span>`}</${h}>`
    + `${sub ? `<span class="bt-section-head-sub">${escapeHtml(sub)}</span>` : ""}</div>`
    + `<span class="bt-section-head-rule" aria-hidden="true"></span>`
    + `${meta ? `<span class="bt-section-head-meta">${escapeHtml(meta)}</span>` : ""}`
    + `${tools ? `<div class="bt-section-head-tools">${tools}</div>` : ""}</div>`;
}
