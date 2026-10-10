// Hotline Boom layout behaviour: the sticky HOTLINE BOOM bar and the wordmark's touch power-on.
import { initStickyBar } from "../../../../shared/ui/sticky-bar.js";
import { initPowerWordmarks } from "../../../../shared/ui/wordmark.js";

const dock = document.querySelector<HTMLElement>("[data-hb-dock]");
if (dock) initStickyBar(dock, { progress: !!document.querySelector(".tl-wrap") });
initPowerWordmarks();
