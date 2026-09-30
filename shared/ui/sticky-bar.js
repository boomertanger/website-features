// shared/ui/sticky-bar.js — behavior for .bt-sticky-bar (docs/design-system.md §5 "Sticky
// feature bar", docs/design/mockups/podium-sticky-gap.html §3 and §4 B): a feature's top bar
// that sticks at the top of the screen.
//   - .is-stuck once it reaches the top (a sentinel just above it, watched by an
//     IntersectionObserver and checked each scroll frame): the slim bar. With hysteresis: it
//     un-sticks only after scrolling back up UNSTICK_AT px past that point, so a notched wheel
//     at the threshold can't make it shake. Only while the bar is actually position: sticky,
//     so CSS can switch it off (the Arcade's members-only gate).
//   - progress: true adds .bt-sticky-bar-progress, the reading-progress line along its bottom
//     edge. CSS scroll-driven animation where supported (.is-timeline); otherwise a rAF-throttled scroll
//     handler sets --bt-read (0..1).
//   - Phones (<= 640px): never hides within the first screen (scrollY < FIRST_SCREEN of the
//     viewport height); after that it hides (.is-hidden) once the reader has scrolled HIDE_AFTER
//     px down in one continuous run (any upward scroll resets the count) and comes back after
//     SHOW_AFTER px up, and whenever focus is inside it. Never hides under reduced motion.
//   - Writes --bt-sticky-top on `root` (default <body>): the bar's --bt-sticky-bar-h while it's
//     stuck and shown, 0 otherwise, so other sticky things tuck in under it.
//
//   initStickyBar(bar, { progress = false, root = document.body })  → { sync } (idempotent)

const UNSTICK_AT = 40;     // px back up past the stick point before it grows again
const FIRST_SCREEN = 0.6;  // phones: never hide above this share of the viewport height
const HIDE_AFTER = 200;    // phones: px of continuous downward scroll before it hides
const SHOW_AFTER = 24;     // phones: px of upward scroll that bring it back

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
  let atTop = false, hidden = false, last = scrollY, down = 0, up = 0, ticking = false;

  const sync = () => {
    const on = atTop && getComputedStyle(bar).position === "sticky";
    if (!on || !narrow.matches || reduce.matches) hidden = false;
    bar.classList.toggle("is-stuck", on);
    bar.classList.toggle("is-hidden", on && hidden);
    const h = getComputedStyle(bar).getPropertyValue("--bt-sticky-bar-h").trim() || "0px";
    root.style.setProperty("--bt-sticky-top", on && !hidden ? h : "0px");
  };
  const setHidden = (v) => { if (hidden !== v) { hidden = v; sync(); } };

  // Stick when the sentinel passes the top; un-stick only once it's UNSTICK_AT px below it.
  const check = () => {
    const t = sentinel.getBoundingClientRect().top;
    const next = atTop ? t <= UNSTICK_AT : t < 0;
    if (next !== atTop) { atTop = next; sync(); }
  };
  new IntersectionObserver(check).observe(sentinel);

  const frame = () => {
    ticking = false;
    const y = scrollY, dy = y - last;
    last = y;
    check();
    if (line && !timeline) {
      const max = document.documentElement.scrollHeight - innerHeight;
      line.style.setProperty("--bt-read", String(max > 0 ? Math.min(1, Math.max(0, y / max)) : 0));
    }
    if (dy > 0) { down += dy; up = 0; } else if (dy < 0) { up -= dy; down = 0; }
    if (!narrow.matches || reduce.matches) return;
    if (y < innerHeight * FIRST_SCREEN) { down = 0; setHidden(false); }   // the run starts past the first screen
    else if (bar.contains(document.activeElement)) setHidden(false);
    else if (down >= HIDE_AFTER) setHidden(true);
    else if (up >= SHOW_AFTER) setHidden(false);
  };
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }, { passive: true });
  bar.addEventListener("focusin", () => setHidden(false));
  narrow.addEventListener("change", sync);
  reduce.addEventListener("change", sync);
  frame();

  bar._stickyBar = { sync };
  return bar._stickyBar;
}
