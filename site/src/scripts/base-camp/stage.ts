// site/src/scripts/base-camp/stage.ts — the E1 stage cards' behaviour (docs/specs/base-camp.md "E1 stage cards"; styles/base-camp.css .bc-e):
// a 3D tilt and a spotlight that follow a mouse pointer, and, on touch screens (no hover), the card plays while it's scrolled into view (.is-play).
// Reduced motion: no tilt and no play-on-scroll (the CSS also stills the scenes).
import { RM } from "./ui";

export function initStageCards(root: ParentNode = document) {
  const cards = [...root.querySelectorAll<HTMLElement>(".bc-e")];
  const touch = matchMedia("(hover: none)").matches;
  let io: IntersectionObserver | null = null;
  if (touch && !RM() && "IntersectionObserver" in window) io = new IntersectionObserver((es) => es.forEach((e) => (e.target as HTMLElement).classList.toggle("is-play", e.isIntersecting)), { threshold: 0.6 });
  cards.forEach((card) => {
    if (card.dataset.bcStage) return;
    card.dataset.bcStage = "1";
    card.addEventListener("pointermove", (ev) => {
      if (ev.pointerType !== "mouse") return;
      const r = card.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
      card.style.setProperty("--mx", `${x * 100}%`); card.style.setProperty("--my", `${y * 100}%`);
      if (!RM()) { card.style.setProperty("--ry", `${(x - 0.5) * 8}deg`); card.style.setProperty("--rx", `${(0.5 - y) * 6}deg`); }
    });
    card.addEventListener("pointerleave", () => { card.style.setProperty("--ry", "0deg"); card.style.setProperty("--rx", "0deg"); });
    io?.observe(card);
  });
}
