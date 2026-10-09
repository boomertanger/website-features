// Feature Lab layout behaviour: the sticky FEATURELAB bar, the wordmark's touch power-on, and New idea (every Lab page opens the same
// dialog; on the board a posted idea redraws the list, elsewhere "See it on the board" goes to the board with the idea open).
import { initStickyBar } from "../../../../shared/ui/sticky-bar.js";
import { initPowerWordmarks } from "../../../../shared/ui/wordmark.js";

const dock = document.querySelector<HTMLElement>("[data-fl-dock]");
if (dock) initStickyBar(dock, { progress: !!document.querySelector(".tl-wrap") });
initPowerWordmarks();

document.addEventListener("click", async (e) => {
  if (!(e.target as Element).closest?.("[data-fl-new]")) return;
  const { openPost } = await import("./post");
  const onBoard = !!document.querySelector("[data-fl]");
  openPost(
    (id) => document.dispatchEvent(new CustomEvent("fl:posted", { detail: { id } })),
    (id) => { if (onBoard) document.dispatchEvent(new CustomEvent("fl:open", { detail: { id } })); else location.href = `/feature-lab?idea=${encodeURIComponent(id)}`; },
  );
});
