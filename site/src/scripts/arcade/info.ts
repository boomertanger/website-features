// How it works (arcade-info.html layout 1): the version-cycle stages are tabs. The "On
// this page" menu comes from TocLayout.astro. No Firestore reads.

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
