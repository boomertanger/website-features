// The CONTROLROOM bar's behaviour (components/live/ControlRoomBar.astro, on every /live page): the sticky bar, the seg nav and the
// wordmark's touch power-on. The bar's links never change after load: role links are in the HTML and shown by the body flags BaseLayout
// sets before first paint (.bt-when-crew / -overseer / -owner), so there is nothing to add here. Idempotent: the bar's own script,
// scripts/live/pub.ts, scripts/live/layout.ts and scripts/live/mod-deck.ts may all call it.
import { initSegNavs } from "../../../../shared/ui/seg-nav.js";
import { initPowerWordmarks } from "../../../../shared/ui/wordmark.js";
import { initStickyBar } from "../../../../shared/ui/sticky-bar.js";

let wired = false;
/** Wires the bar once; returns the sticky bar (call .sync() when the page under it changes). */
export function initLiveBar() {
  if (!wired) { wired = true; initSegNavs(); initPowerWordmarks(); }
  const dock = document.querySelector<HTMLElement>("[data-lv-dock]");
  return dock ? initStickyBar(dock, {}) : null;
}
