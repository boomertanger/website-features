// The live tools' shared bar behaviour (components/live/CrBar.astro, rendered by layouts/LiveFrame.astro for the Control Room and the Mod
// Deck alike): the sticky bar, the seg navs, the wordmark's touch power-on, and the owner's "Checklist templates" link (added for the owner's
// uid only, so there is never an empty slot for anyone else). scripts/live/layout.ts and scripts/live/mod-deck.ts both call these, so the
// bar behaves the same on both pages.
import { initSegNavs } from "../../../../shared/ui/seg-nav.js";
import { initPowerWordmarks } from "../../../../shared/ui/wordmark.js";
import { initStickyBar } from "../../../../shared/ui/sticky-bar.js";
import { isProduction } from "../../lib/env.js";

/** Wires the bar once; returns the sticky bar (call .sync() when the page under it changes). */
export function initLiveBar() {
  initSegNavs();
  initPowerWordmarks();
  const dock = document.querySelector<HTMLElement>("[data-lv-dock]");
  return dock ? initStickyBar(dock, {}) : null;
}

/** The owner's "Checklist templates" link, in the text nav and the icon nav (once). */
export function addOwnerLinks() {
  document.querySelectorAll<HTMLElement>("[data-lv-owner-slot]").forEach((slot) => {
    if (slot.querySelector("[data-lv-owner-link]")) return;
    const a = document.createElement("a");
    a.setAttribute("data-lv-owner-link", "");
    a.href = "/live/control/checklist";
    if (location.pathname.replace(/\/$/, "") === "/live/control/checklist") a.setAttribute("aria-current", "page");
    const q = location.search;
    if (q && !isProduction) a.href += q;
    if (slot.dataset.icon === "1") { a.setAttribute("aria-label", "Checklist templates"); a.title = "Checklist templates"; a.innerHTML = `<svg aria-hidden="true"><use href="#i-bulb"/></svg>`; }
    else a.textContent = "Checklist templates";
    slot.append(a);
    slot.hidden = false;
  });
  initSegNavs();
}
