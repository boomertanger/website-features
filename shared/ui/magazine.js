// shared/ui/magazine.js — the magazine pieces (docs/specs/boomertang.md §6, §8; design-system.md §8ak), shared by Boomertang's
// pages, the renderer that draws issue pages at build time and in the browser, and the UI Kit page. CSS: the "Boomertang pieces"
// block in bt-ui.css. Markup builders return strings (safe for Astro's set:html and for innerHTML); the init* functions wire them.
//
//   TRUST                         the four trust tags: { off: "Official", ver: "Verified by Boomer", com: "Community", fan: "Fan theory" }
//   factagHtml({ trust, version, sourceId, sourceTitle, href })
//                                 .bt-factag. With href it's a link to the source (The Index); with sourceId alone a button
//                                 (data-factag-source) a page can answer, e.g. the How it works tag example. "ver" shows its version.
//   issueBarHtml({ mastHref, line, pages: [{ href, label, current, locked }], mode })
//                                 .bt-issuebar with the Paper / Ink switch (mode "paper" | "ink").
//   initIssueBar(el, { onMode })  the switch (aria-pressed, onMode(mode)) and the current page scrolled into the nav on phones.
//   turnPageHtml({ prev, next })  .bt-turnpage; prev / next are { href, label } or null.
//   initTurnPage(el)              ArrowLeft / ArrowRight turn the page, except while typing, in a form control, in a .bt-zoomframe
//                                 (The Map) or anywhere under [data-turnpage-ignore]. Never swipe (it would fight The Map).
//   initRedact(root)              every [data-redact-toggle] button: toggles .is-revealed on its .bt-redact (aria-controls), the
//                                 label (Reveal / Cover it again), aria-expanded, and hides covered text from screen readers.
import { escapeHtml as esc } from "./dom.js";

export const TRUST = { off: "Official", ver: "Verified by Boomer", com: "Community", fan: "Fan theory" };

const LOCK = '<svg class="bt-issuebar-lock" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4.5 7V5a3.5 3.5 0 017 0v2M3.5 7h9v7h-9z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
export const LOCK_ICON = LOCK.replace('class="bt-issuebar-lock" ', "");

/** A trust tag. trust: off | ver | com | fan. */
export function factagHtml({ trust, version = "", sourceId = "", sourceTitle = "", href = "" } = {}) {
  const label = TRUST[trust];
  if (!label) throw new Error(`factagHtml: unknown trust "${trust}"`);
  const ver = trust === "ver" && version ? `<span class="bt-factag-ver">${esc(version)}</span>` : "";
  const title = sourceTitle ? ` title="Source: ${esc(sourceTitle)}"` : "";
  const src = sourceId ? ` data-source="${esc(sourceId)}"` : "";
  if (href) return `<a class="bt-factag" data-trust="${trust}" href="${esc(href)}"${src}${title}>${label}${ver}</a>`;
  if (sourceId) return `<button type="button" class="bt-factag" data-trust="${trust}" data-factag-source${src}${title} aria-expanded="false">${label}${ver}</button>`;
  return `<span class="bt-factag" data-trust="${trust}">${label}${ver}</span>`;
}

/** The issue bar. pages: [{ href, label, current, locked }]. */
export function issueBarHtml({ mastHref = "/boomertang", line = "", pages = [], mode = "paper", mast = "BOOMERTANG" } = {}) {
  const links = pages.map((p) => `<a href="${esc(p.href)}"${p.current ? ' aria-current="page"' : ""}${p.locked ? ' data-locked=""' : ""}>${esc(p.label)}${p.locked ? `${LOCK}<span class="bt-sr-only"> (locked)</span>` : ""}</a>`).join("");
  const btn = (v, label, title) => `<button type="button" data-mode="${v}" aria-pressed="${mode === v}" title="${title}" data-pulse="tang-mode">${label}</button>`;
  return `<div class="bt-issuebar">`
    + `<a class="bt-issuebar-mast" href="${esc(mastHref)}" aria-label="Boomertang newsstand">${esc(mast)}</a>`
    + (line ? `<span class="bt-issuebar-line">${esc(line)}</span>` : "")
    + `<nav class="bt-issuebar-nav" aria-label="This issue">${links}</nav>`
    + `<div class="bt-issuebar-mode" role="group" aria-label="Reading mode">${btn("paper", "Paper", "Cream paper, black ink")}${btn("ink", "Ink", "Light text on near-black")}</div>`
    + `</div>`;
}

/** Wires the Paper / Ink switch; onMode(mode) runs on a change. Returns { set(mode) } to reflect a change made elsewhere. */
export function initIssueBar(el, { onMode } = {}) {
  const buttons = Array.from(el.querySelectorAll(".bt-issuebar-mode [data-mode]"));
  const set = (mode) => buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  buttons.forEach((b) => b.addEventListener("click", () => {
    if (b.getAttribute("aria-pressed") === "true") return;
    set(b.dataset.mode);
    onMode?.(b.dataset.mode);
  }));
  // on a narrow bar the nav scrolls sideways: bring the current page into view (without moving the page itself)
  const nav = el.querySelector(".bt-issuebar-nav"), cur = nav?.querySelector('[aria-current="page"]');
  if (nav && cur && nav.scrollWidth > nav.clientWidth) {
    const n = nav.getBoundingClientRect(), c = cur.getBoundingClientRect();
    if (c.left < n.left || c.right > n.right) nav.scrollLeft += c.left - n.left - (n.width - c.width) / 2;   // only when it's out of sight
  }
  return { set };
}

/** Turn the page. prev / next: { href, label } or null. */
export function turnPageHtml({ prev = null, next = null } = {}) {
  const a = (p, cls, rel, small) => `<a class="${cls}" href="${esc(p.href)}" rel="${rel}"><small>${small}</small><b>${esc(p.label)}</b></a>`;
  return `<nav class="bt-turnpage" aria-label="Turn the page">${prev ? a(prev, "bt-turnpage-prev", "prev", "← Previous") : "<span></span>"}${next ? a(next, "bt-turnpage-next", "next", "Turn the page →") : ""}</nav>`;
}

/** Arrow keys turn the page (not while typing, in a form control, in The Map's frame or under [data-turnpage-ignore]). */
export function initTurnPage(el) {
  const prev = el.querySelector(".bt-turnpage-prev"), next = el.querySelector(".bt-turnpage-next");
  const onKey = (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const t = e.target;
    if (t instanceof Element && t.closest("input, textarea, select, [contenteditable], [role=slider], [role=listbox], [role=menu], .bt-zoomframe, [data-turnpage-ignore], dialog, .bt-portal")) return;
    const go = e.key === "ArrowLeft" ? prev : next;
    if (!go) return;
    e.preventDefault();
    go.click();
  };
  document.addEventListener("keydown", onKey);
  return () => document.removeEventListener("keydown", onKey);
}

/** Every [data-redact-toggle] under root: Reveal / Cover it again. The button names its .bt-redact with aria-controls. */
export function initRedact(root, { onReveal } = {}) {
  root.querySelectorAll("[data-redact-toggle]").forEach((btn) => {
    const box = document.getElementById(btn.getAttribute("aria-controls") || "");
    if (!box) return;
    const paint = (open) => {
      box.classList.toggle("is-revealed", open);
      btn.setAttribute("aria-expanded", String(open));
      btn.textContent = open ? (btn.dataset.coverLabel || "Cover it again") : (btn.dataset.revealLabel || "Reveal");
      box.querySelectorAll(".bt-redact-text").forEach((s) => { if (open) s.removeAttribute("aria-hidden"); else s.setAttribute("aria-hidden", "true"); });
    };
    paint(box.classList.contains("is-revealed"));
    btn.addEventListener("click", () => {
      const open = !box.classList.contains("is-revealed");
      paint(open);
      if (open) onReveal?.(box);
    });
  });
}
