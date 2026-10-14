// shared/ui/seg-nav.js — behavior for .bt-seg-nav (docs/design-system.md §5): one lit
// pill glides to the hovered or focused tab and settles back on the current one
// (a[aria-current="page"]). Without this script the current tab is lit on its own.
//
//   <nav class="bt-seg-nav" aria-label="…"><a href="…" aria-current="page">…</a><a …>…</a></nav>
//   initSegNav(nav)  (idempotent; returns { place })
//
// At rest the current tab lights itself with CSS (nothing measured, so it can never be stale: a
// sticky bar sticking, tabs shrinking, fonts loading). The measured pill only shows while it glides
// (.is-gliding: hover or focus on another tab); it is re-measured, without animating, whenever the
// nav or a tab changes size, and hands back to the CSS once it is home again. A row that overflows
// (phones) scrolls the current tab into view, inside the row only (the page never moves).

export function initSegNav(nav) {
  if (!nav || nav._segNav) return nav?._segNav;
  const pill = document.createElement("span");
  pill.className = "bt-seg-nav-pill";
  pill.setAttribute("aria-hidden", "true");
  nav.prepend(pill);
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const current = () => nav.querySelector('a[aria-current="page"]');
  let target = null, homeT = 0;
  const measure = (a) => {
    pill.style.width = a ? `${a.offsetWidth}px` : "0";
    if (a) pill.style.transform = `translateX(${a.offsetLeft}px)`;
  };
  const snap = (a) => { pill.style.transition = "none"; measure(a); void pill.offsetWidth; pill.style.transition = ""; };
  // Glide to a tab: the pill appears on the current tab (where the CSS light was), then moves.
  const glide = (a) => {
    clearTimeout(homeT);
    if (!nav.classList.contains("is-gliding")) { snap(current() || a); nav.classList.add("is-gliding"); }
    target = a;
    measure(a);
  };
  // Back to the current tab, then hand back to the CSS light once it has arrived.
  const home = () => {
    const cur = current();
    target = cur;
    if (!nav.classList.contains("is-gliding")) return;
    measure(cur);
    clearTimeout(homeT);
    homeT = setTimeout(() => { if (target === current()) nav.classList.remove("is-gliding"); }, reduce() || !cur ? 0 : 300);
  };
  nav.addEventListener("pointerover", (e) => { const a = e.target.closest("a"); if (a && nav.contains(a)) glide(a); });
  nav.addEventListener("pointerleave", home);
  nav.addEventListener("focusin", (e) => { const a = e.target.closest("a"); if (a) glide(a); });
  nav.addEventListener("focusout", () => setTimeout(() => { if (!nav.contains(document.activeElement)) home(); }, 0));
  // Sizes change under the pill (the bar sticking, a compact search sliding in, counts hiding, fonts): re-measure, no animation.
  const remeasure = () => { if (nav.classList.contains("is-gliding")) snap(target); show(); };
  const ro = new ResizeObserver(remeasure);
  const observeTabs = () => { ro.disconnect(); ro.observe(nav); nav.querySelectorAll("a").forEach((a) => ro.observe(a)); };
  observeTabs();
  // The current tab changed (or the tabs were redrawn): settle and bring it into view
  new MutationObserver((ms) => {
    if (ms.some((m) => m.type === "childList")) observeTabs();
    home(); show(true);
  }).observe(nav, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-current"] });
  // A row that overflows: the current tab scrolled into view (centred when it isn't fully visible), inside the row only.
  const scroll = nav.classList.contains("bt-seg-nav--scroll");
  const edges = () => {
    if (!scroll) return;
    const max = nav.scrollWidth - nav.clientWidth;
    nav.classList.toggle("is-more-start", max > 1 && nav.scrollLeft > 1);
    nav.classList.toggle("is-more-end", max > 1 && nav.scrollLeft < max - 1);
  };
  function show(force = false) {
    const a = current();
    if (a && a.offsetWidth && nav.scrollWidth > nav.clientWidth + 1) {   // a hidden current link (a role link) scrolls nothing
      const left = a.offsetLeft, right = left + a.offsetWidth;
      const inView = left >= nav.scrollLeft && right <= nav.scrollLeft + nav.clientWidth;
      if (!inView || force) nav.scrollLeft = Math.max(0, left - (nav.clientWidth - a.offsetWidth) / 2);
    }
    edges();
  }
  if (scroll) nav.addEventListener("scroll", edges, { passive: true });
  show(true);
  document.fonts?.ready.then(() => { remeasure(); show(true); });
  nav.classList.add("is-ready");
  nav._segNav = { place: () => { home(); show(); } };
  return nav._segNav;
}

/** Wires every .bt-seg-nav under root. */
export function initSegNavs(root = document) {
  root.querySelectorAll(".bt-seg-nav").forEach(initSegNav);
}
