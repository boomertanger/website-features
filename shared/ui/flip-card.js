// shared/ui/flip-card.js — .bt-flip (docs/design-system.md §5 "Flip card"): hover or focus turns a
// medal card over (CSS); on touch a tap toggles .is-flipped. Reduced motion: the CSS cross-fades.
//
//   initFlipCards(root)   (idempotent per card)

export function initFlipCards(root = document) {
  root.querySelectorAll(".bt-flip:not([data-flip-ready])").forEach((b) => {
    b.dataset.flipReady = "";
    b.addEventListener("click", () => b.classList.toggle("is-flipped"));
  });
}
