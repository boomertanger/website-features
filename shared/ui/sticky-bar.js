// shared/ui/sticky-bar.js — behavior for .bt-sticky-bar (docs/design-system.md §5 "Sticky
// feature bar", docs/design/mockups/podium-sticky-gap.html §3 and §4 B): a feature's top bar
// that sticks at the top of the screen.
//   - .is-stuck once it reaches the top (an IntersectionObserver on a sentinel just above it,
//     not a scroll listener): the slim bar. Only while the bar is actually position: sticky, so
//     CSS can switch it off (the Arcade's members-only gate).
//   - progress: true adds .bt-sticky-bar-progress, the reading-progress line along its bottom
//     edge. CSS scroll-driven animation where supported (.is-timeline); otherwise a rAF-throttled scroll
//     handler sets --bt-read (0..1).
//   - Phones (<= 640px): hides on scroll down (.is-hidden, after 120px and more than 8px
//     down), shows on any scroll up, near the top, and whenever focus is inside it. Never
//     hides under reduced motion.
//   - Writes --bt-sticky-top on `root` (default <body>): the bar's --bt-sticky-bar-h while it's
//     stuck and shown, 0 otherwise, so other sticky things tuck in under it.
//
//   initStickyBar(bar, { progress = false, root = document.body })  → { sync } (idempotent)

const HIDE_AFTER = 120, HIDE_DELTA = 8;

export function initStickyBar(bar, { progress = false, root = document.body } = {}) {
  if (!bar || bar._stickyBar) return bar?._stickyBar;
  const sentinel = document.createElement("div");
  sentinel.className = "bt-sticky-sentinel";
  sentinel.setAttribute("aria-hidden", "true");
  bar.before(sentinel);

  const timeline = !!CSS.supports?.("animation-timeline: scroll()");
  let line = null;
  if (progress) {
    line = document.createElement("span");
    line.className = "bt-sticky-bar-progress";
    line.setAttribute("aria-hidden", "true");
    line.classList.toggle("is-timeline", timeline);
    bar.append(line);
  }
  // The site's bt container is the page frame, which spans the screen, so a media query
  // matches the kit's 640px container breakpoint here.
  const narrow = matchMedia("(max-width: 640px)");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  let atTop = false, hidden = false, last = scrollY, ticking = false;

  const sync = () => {
    const on = atTop && getComputedStyle(bar).position === "sticky";
    if (!on || !narrow.matches || reduce.matches) hidden = false;
    bar.classList.toggle("is-stuck", on);
    bar.classList.toggle("is-hidden", on && hidden);
    const h = getComputedStyle(bar).getPropertyValue("--bt-sticky-bar-h").trim() || "0px";
    root.style.setProperty("--bt-sticky-top", on && !hidden ? h : "0px");
  };
  const setHidden = (v) => { if (hidden !== v) { hidden = v; sync(); } };

  new IntersectionObserver(([e]) => {
    atTop = !e.isIntersecting && e.boundingClientRect.top < 0;
    sync();
  }).observe(sentinel);

  const frame = () => {
    ticking = false;
    const y = scrollY;
    if (line && !timeline) {
      const max = document.documentElement.scrollHeight - innerHeight;
      line.style.setProperty("--bt-read", String(max > 0 ? Math.min(1, Math.max(0, y / max)) : 0));
    }
    if (narrow.matches && !reduce.matches) {
      const d = y - last;
      if (y < HIDE_AFTER || bar.contains(document.activeElement)) { setHidden(false); last = y; }
      else if (d > HIDE_DELTA) { setHidden(true); last = y; }
      else if (d < 0) { setHidden(false); last = y; }
    } else last = y;
  };
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }, { passive: true });
  bar.addEventListener("focusin", () => setHidden(false));
  narrow.addEventListener("change", sync);
  reduce.addEventListener("change", sync);
  frame();

  bar._stickyBar = { sync };
  return bar._stickyBar;
}
