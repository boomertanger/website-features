// Hotline Boom layout behaviour: the sticky HOTLINE BOOM bar, its tabs on /admin/inbox and the wordmark's touch power-on.
import { initStickyBar } from "../../../../shared/ui/sticky-bar.js";
import { initPowerWordmarks } from "../../../../shared/ui/wordmark.js";
import { initSegNav } from "../../../../shared/ui/seg-nav.js";

const dock = document.querySelector<HTMLElement>("[data-hb-dock]");
if (dock) initStickyBar(dock, { progress: !!document.querySelector(".tl-wrap") });
initPowerWordmarks();
const tabs = document.querySelector<HTMLElement>("[data-hb-tabs]");
if (tabs) initSegNav(tabs);
