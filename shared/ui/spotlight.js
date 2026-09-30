// shared/ui/spotlight.js — behavior for .bt-spotlight (docs/design-system.md §5): a soft
// glow that follows the pointer inside a card. Sets --mx / --my on the card as the pointer
// moves; the CSS draws the glow. Pointer devices only (hover + fine pointer); nothing on
// touch or under reduced motion.
//
//   <a class="bt-card bt-card--door bt-spotlight" …>   (or .bt-spotlight--gold on Soon cards)
//   initSpotlights(root)

export function initSpotlights(root = document) {
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  root.querySelectorAll(".bt-spotlight").forEach((el) => {
    if (el._spot) return;
    el._spot = true;
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    });
  });
}
