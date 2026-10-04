// shared/ui/flip.js — FLIP reflow (docs/design-system.md §5 "Gliding grid"): swap a container's
// content and let the items that stay glide to their new places, new ones fade in. Items are
// matched by [data-key]. Under reduced motion the content just changes.
//
//   flipSwap(container, html)

export function flipSwap(container, html) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const before = new Map();
  if (!reduce) container.querySelectorAll("[data-key]").forEach((el) => before.set(el.dataset.key, el.getBoundingClientRect()));
  container.innerHTML = html;
  if (reduce || !before.size) return;
  container.querySelectorAll("[data-key]").forEach((el) => {
    const b = before.get(el.dataset.key);
    if (!b) { el.animate([{ opacity: 0, transform: "scale(.92)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: "ease-out" }); return; }
    const a = el.getBoundingClientRect(), dx = b.left - a.left, dy = b.top - a.top;
    if (dx || dy) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 420, easing: "cubic-bezier(.2,.7,.2,1)" });
  });
}
