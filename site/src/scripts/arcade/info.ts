// How it works (arcade-info.html layout 1, round 2 in how-it-works-round-2.html): the
// version-cycle stages are tabs, the What's inside cards get the pointer spotlight, and
// the Versions timeline and its cartridges light each other on hover. The "On this page"
// menu comes from TocLayout.astro. No Firestore reads.
import { initSpotlights } from "../../../../shared/ui/spotlight.js";

initSpotlights(document.querySelector(".ai-stage") ?? document);

// Versions: a cartridge lights its part of the line (data-hl + .is-lit stops); a stop lifts its card.
const linked = document.querySelector<HTMLElement>(".ai-linked");
if (linked) {
  const light = (kind = "") => {
    linked.dataset.hl = kind;
    linked.querySelectorAll<HTMLElement>(".ai-ct").forEach((c) => c.classList.toggle("is-on", !!kind && c.dataset.kind === kind));
    linked.querySelectorAll<HTMLElement>(".ai-st").forEach((st) => st.classList.toggle("is-lit", !!kind && st.dataset.kind === kind));
  };
  linked.querySelectorAll<HTMLElement>(".ai-ct, .ai-st").forEach((el) => {
    el.addEventListener("pointerenter", () => light(el.dataset.kind));
    el.addEventListener("pointerleave", () => light(""));
  });
}

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
