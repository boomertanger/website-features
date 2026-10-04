// Trophy Room layout behaviour: the sticky TROPHYROOM bar (a reading-progress line on the long
// How it works page), the seg navs, and the wordmark's touch power-on.
import { initSegNavs } from "../../../../shared/ui/seg-nav.js";
import { initPowerWordmarks } from "../../../../shared/ui/wordmark.js";
import { initStickyBar } from "../../../../shared/ui/sticky-bar.js";

initSegNavs();
initPowerWordmarks();
const dock = document.querySelector<HTMLElement>("[data-tr-dock]");
if (dock) {
  const bar = initStickyBar(dock, { progress: !!document.querySelector(".tl-wrap") });
  new MutationObserver(() => bar.sync()).observe(document.body, { attributes: true, attributeFilter: ["data-auth-state"] });
}
