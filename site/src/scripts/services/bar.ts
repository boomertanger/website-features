// The SERVICE HUB bar (components/services/ServicesBar.astro), on every page that has it: the kit's sticky bar (slim on desktop, with a
// reading-progress line on TocLayout pages; hide-on-scroll on phones) and the wordmark's power-on for touch screens.
import { initStickyBar } from "../../../../shared/ui/sticky-bar.js";
import { initPowerWordmarks } from "../../../../shared/ui/wordmark.js";

const dock = document.querySelector<HTMLElement>("[data-sv-dock]");
if (dock) initStickyBar(dock, { progress: !!document.querySelector(".tl-wrap") });
initPowerWordmarks();
