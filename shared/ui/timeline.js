// shared/ui/timeline.js — .bt-timeline (docs/design-system.md §5 "Timeline"): dots on a line,
// sized by value, with a tooltip on hover or focus. A hollow .is-legacy dot stands for history
// from before the site; a flag marks a moment (finished it); a coloured stretch marks when the
// site has been open. Reusable for the Stream Library.
//
//   timelineHtml({ points, site, ends, keys, label })
//     points: [{ at (0-1), size (px), title, lines: [..], aria, legacy?, flag?, href? }]
//     site:   { at (0-1), label } | null      ends: [leftLabel, rightLabel]
//     keys:   [{ cls: "" | "is-legacy", label } | { flag, label }]
//   initTimelines(root)   tooltips

import { escapeHtml as esc } from "./dom.js";

export function timelineHtml({ points = [], site = null, ends = ["", ""], keys = [], label = "Timeline" }) {
  const pct = (v) => `${(Math.max(0, Math.min(1, v)) * 100).toFixed(2)}%`;
  const dots = points.map((p) => {
    const tip = esc(JSON.stringify({ t: p.title, l: p.lines || [] }));
    const style = `left:${pct(p.at)};--s:${Math.round(p.size || 18)}px`;
    const dot = p.href
      ? `<a class="bt-timeline-dot${p.legacy ? " is-legacy" : ""}" href="${esc(p.href)}" style="${style}" data-tip="${tip}" aria-label="${esc(p.aria || p.title)}"></a>`
      : `<button type="button" class="bt-timeline-dot${p.legacy ? " is-legacy" : ""}" style="${style}" data-tip="${tip}" aria-label="${esc(p.aria || p.title)}"></button>`;
    return dot + (p.flag ? `<span class="bt-timeline-flag" style="left:${pct(p.at)}" aria-hidden="true">${p.flag}</span>` : "");
  }).join("");
  const siteBar = site ? `<span class="bt-timeline-site" style="left:${pct(site.at)}"></span>${site.label ? `<span class="bt-timeline-site-lab" style="left:${pct(site.at)}">${esc(site.label)}</span>` : ""}` : "";
  const keyRow = keys.length ? `<div class="bt-timeline-key">${keys.map((k) => `<span>${k.flag ? `${k.flag} ` : `<i class="${k.cls || ""}"></i>`}${esc(k.label)}</span>`).join("")}</div>` : "";
  return `<div class="bt-timeline" data-timeline role="group" aria-label="${esc(label)}"><span class="bt-timeline-line"></span>${siteBar}${dots}</div><div class="bt-timeline-ends"><span>${esc(ends[0] || "")}</span><span>${esc(ends[1] || "")}</span></div>${keyRow}`;
}

export function initTimelines(root = document) {
  root.querySelectorAll("[data-timeline]:not([data-tl-ready])").forEach((tl) => {
    tl.dataset.tlReady = "";
    const show = (dot) => {
      tl.querySelector(".bt-timeline-tip")?.remove();
      if (!dot) return;
      let x; try { x = JSON.parse(dot.dataset.tip); } catch { return; }
      const tip = document.createElement("span");
      tip.className = "bt-timeline-tip";
      tip.setAttribute("aria-hidden", "true");
      tip.style.left = dot.style.left;
      tip.innerHTML = `<b>${esc(x.t)}</b>${(x.l || []).map((l) => `<span>${esc(l)}</span>`).join("")}`;
      tl.append(tip);
    };
    const dotOf = (e) => (e.target instanceof Element ? e.target.closest(".bt-timeline-dot") : null);
    tl.addEventListener("pointerover", (e) => show(dotOf(e)));
    tl.addEventListener("pointerleave", () => show(null));
    tl.addEventListener("focusin", (e) => show(dotOf(e)));
    tl.addEventListener("focusout", () => show(null));
  });
}
