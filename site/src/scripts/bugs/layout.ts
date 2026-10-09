// Bug Zapper layout behaviour: the sticky BUGZAPPER bar, the wordmark's touch power-on, and Report a bug (every Bug Zapper page opens the same dialog; on the board a sent report redraws
// the list, elsewhere "See your report" goes to the board with the report open).
import { initStickyBar } from "../../../../shared/ui/sticky-bar.js";
import { initPowerWordmarks } from "../../../../shared/ui/wordmark.js";

const dock = document.querySelector<HTMLElement>("[data-bz-dock]");
if (dock) initStickyBar(dock, { progress: !!document.querySelector(".tl-wrap") });
initPowerWordmarks();

document.addEventListener("click", async (e) => {
  if (!(e.target as Element).closest?.("[data-bz-new]")) return;
  const { openForm } = await import("./form");
  const onBoard = !!document.querySelector("[data-bz]");
  void openForm({
    onSent: (id) => document.dispatchEvent(new CustomEvent("bz:posted", { detail: { id } })),
    openReport: (id) => { if (onBoard) document.dispatchEvent(new CustomEvent("bz:open", { detail: { id } })); else location.href = `/bug-zapper?report=${encodeURIComponent(id)}`; },
  });
});
