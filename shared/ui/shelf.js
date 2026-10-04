// shared/ui/shelf.js — .bt-shelf (docs/design-system.md §5 "Shelf"): a swipeable rail of cards
// with snap. Buttons [data-shelf-prev] / [data-shelf-next] inside the same [data-shelf-wrap]
// scroll it by most of a screen and switch off at the ends. Touch screens just swipe.
//
//   initShelves(root)

export function initShelves(root = document) {
  root.querySelectorAll("[data-shelf-wrap]:not([data-shelf-ready])").forEach((wrap) => {
    wrap.dataset.shelfReady = "";
    const shelf = wrap.querySelector(".bt-shelf");
    const prev = wrap.querySelector("[data-shelf-prev]"), next = wrap.querySelector("[data-shelf-next]");
    if (!shelf) return;
    const sync = () => {
      const max = shelf.scrollWidth - shelf.clientWidth - 2;
      if (prev) prev.disabled = shelf.scrollLeft <= 2;
      if (next) next.disabled = shelf.scrollLeft >= max;
    };
    const go = (dir) => shelf.scrollBy({ left: dir * shelf.clientWidth * 0.85, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    prev?.addEventListener("click", () => go(-1));
    next?.addEventListener("click", () => go(1));
    shelf.addEventListener("scroll", sync, { passive: true });
    new ResizeObserver(sync).observe(shelf);
    sync();
  });
}
