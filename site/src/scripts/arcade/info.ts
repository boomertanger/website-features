// How it works (arcade-info.html layout 1): the version-cycle stages are tabs, and the
// "On this page" menu is the kit's .bt-toc (shared/ui/toc.js). No Firestore reads.
import { initTocs } from "../../../../shared/ui/toc.js";

const steps = [...document.querySelectorAll<HTMLButtonElement>("[data-stage]")];
const details = [...document.querySelectorAll<HTMLElement>("[data-stage-detail]")];

function show(i: number, focus = false) {
  steps.forEach((b, k) => {
    b.setAttribute("aria-selected", String(k === i));
    b.tabIndex = k === i ? 0 : -1;
    b.classList.toggle("is-done", k < i);
  });
  details.forEach((d, k) => { d.hidden = k !== i; });
  if (focus) steps[i].focus();
}
steps.forEach((b, i) => b.addEventListener("click", () => show(i)));
document.querySelector(".ai-steps")?.addEventListener("keydown", (ev) => {
  const e = ev as KeyboardEvent, cur = steps.findIndex((b) => b.getAttribute("aria-selected") === "true");
  const next = e.key === "ArrowRight" ? cur + 1 : e.key === "ArrowLeft" ? cur - 1 : e.key === "Home" ? 0 : e.key === "End" ? steps.length - 1 : null;
  if (next == null) return;
  e.preventDefault();
  show((next + steps.length) % steps.length, true);
});

// The side menu: the kit's progress rail follows the scroll.
initTocs();
