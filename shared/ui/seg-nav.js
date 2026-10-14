// shared/ui/seg-nav.js — behavior for .bt-seg-nav (docs/design-system.md §5): one lit
// pill glides to the hovered or focused tab and settles back on the current one
// (a[aria-current="page"]). Without this script the current tab is lit on its own.
//
//   <nav class="bt-seg-nav" aria-label="…"><a href="…" aria-current="page">…</a><a …>…</a></nav>
//   initSegNav(nav)  (idempotent; returns { place })

export function initSegNav(nav) {
  if (!nav || nav._segNav) return nav?._segNav;
  const pill = document.createElement("span");
  pill.className = "bt-seg-nav-pill";
  pill.setAttribute("aria-hidden", "true");
  nav.prepend(pill);
  const current = () => nav.querySelector('a[aria-current="page"]');
  const place = (a) => {
    if (!a) { pill.style.width = "0"; return; }
    pill.style.width = `${a.offsetWidth}px`;
    pill.style.transform = `translateX(${a.offsetLeft}px)`;
  };
  // First placement without the glide, then turn the shared pill on.
  const settle = () => { pill.style.transition = "none"; place(current()); void pill.offsetWidth; pill.style.transition = ""; };
  nav.addEventListener("pointerover", (e) => { const a = e.target.closest("a"); if (a && nav.contains(a)) place(a); });
  nav.addEventListener("pointerleave", () => place(current()));
  nav.addEventListener("focusin", (e) => { const a = e.target.closest("a"); if (a) place(a); });
  nav.addEventListener("focusout", () => setTimeout(() => { if (!nav.contains(document.activeElement)) place(current()); }, 0));
  new ResizeObserver(settle).observe(nav);
  settle();
  if (nav.classList.contains("bt-seg-nav--scroll")) scrolling(nav, current);
  // Web fonts can change the tab widths after the first paint.
  document.fonts?.ready.then(settle);
  nav.classList.add("is-ready");
  nav._segNav = { place: () => place(current()) };
  return nav._segNav;
}

/** .bt-seg-nav--scroll: the current link scrolled into view (centred, without moving the page) and the
 *  edge fades (.is-more-start / .is-more-end) kept in step with the scroll position and the size. */
function scrolling(nav, current) {
  const edges = () => {
    const max = nav.scrollWidth - nav.clientWidth;
    nav.classList.toggle("is-more-start", max > 1 && nav.scrollLeft > 1);
    nav.classList.toggle("is-more-end", max > 1 && nav.scrollLeft < max - 1);
  };
  const show = () => {
    const a = current();
    if (a && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = Math.max(0, a.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2);
    edges();
  };
  nav.addEventListener("scroll", edges, { passive: true });
  new ResizeObserver(edges).observe(nav);
  show();
  document.fonts?.ready.then(show);
}

/** Wires every .bt-seg-nav under root. */
export function initSegNavs(root = document) {
  root.querySelectorAll(".bt-seg-nav").forEach(initSegNav);
}
