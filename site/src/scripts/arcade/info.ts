// How it works (arcade-info.html layout 1): the version-cycle stages are tabs, and
// the "On this page" menu highlights the section in view. No Firestore reads.
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

const links = [...document.querySelectorAll<HTMLAnchorElement>(".ai-nav a")];
const secs = links.map((a) => document.querySelector(a.getAttribute("href")!)).filter((s): s is Element => !!s);
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    const i = secs.indexOf(e.target);
    links.forEach((a, k) => a.classList.toggle("is-on", k === i));
    // Phones: the menu is a sideways pill row; keep the current pill in it.
    const nav = links[i]?.parentElement;
    if (nav && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: links[i].offsetLeft - 16, behavior: "smooth" });
  });
}, { rootMargin: "-40% 0px -55% 0px" });
secs.forEach((s) => io.observe(s));
