// shared/ui/toc.js — behavior for .bt-toc, the "On this page" progress rail
// (docs/design-system.md §5). Follows the scroll: the current stop (a[aria-current="true"])
// is the last section whose top has passed a line 30% down the screen (at the very bottom
// of the page, the last one on screen; a menu click sets it at once), earlier ones are
// .is-past, the rail fills to the current stop (--bt-toc-fill) and the phone chip row's
// gold bar shows how far through the page you are (--bt-toc-prog). On phones the current
// chip is kept in view in the row.
//
//   <nav class="bt-toc" aria-label="On this page">
//     <span class="bt-toc-rail"></span><span class="bt-toc-fill"></span>
//     <a href="#section-id">…</a> …
//   </nav>
//   initToc(nav, { observe = true })  returns { set(i) } (set is for demos, e.g. the UI kit)

export function initToc(nav, { observe = true } = {}) {
  if (!nav || nav._toc) return nav?._toc;
  const links = [...nav.querySelectorAll("a[href^='#']")];
  const fill = nav.querySelector(".bt-toc-fill");
  let cur = -1;
  function set(i) {
    if (i === cur || i < 0 || i >= links.length) return;
    cur = i;
    links.forEach((a, k) => {
      if (k === i) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
      a.classList.toggle("is-past", k < i);
    });
    const a = links[i];
    if (fill) nav.style.setProperty("--bt-toc-fill", `${Math.max(0, a.offsetTop + a.offsetHeight / 2 - 14)}px`);
    nav.style.setProperty("--bt-toc-prog", `${Math.round(((i + 1) / links.length) * 100)}%`);
    // Phones: the chip row scrolls sideways; keep the current chip in it.
    if (nav.scrollWidth > nav.clientWidth + 1) nav.scrollTo({ left: a.offsetLeft - 16, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  if (observe) {
    // Works for tall sections and for short targets like a Markdown page's h2s, which can
    // jump past any thin band in one scroll.
    const sections = links.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1))));
    let frame = 0, clickedAt = 0;
    const pick = () => {
      frame = 0;
      if (performance.now() - clickedAt < 900) return;   // let a menu jump finish on the clicked stop
      const line = innerHeight * 0.3;
      let i = 0;
      sections.forEach((el, k) => { if (el && el.getBoundingClientRect().top <= line) i = k; });
      // At the very bottom the last sections may never reach the line: take the last one on screen.
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) {
        sections.forEach((el, k) => { if (el && el.getBoundingClientRect().top < innerHeight) i = k; });
      }
      set(i);
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(pick); };
    addEventListener("scroll", queue, { passive: true });
    addEventListener("resize", queue);
    nav.addEventListener("click", (e) => {
      const i = links.indexOf(e.target.closest("a"));
      if (i >= 0) { clickedAt = performance.now(); set(i); }
    });
    // Refill the rail when its size changes (fonts, the phone layout).
    new ResizeObserver(() => { const i = cur; cur = -1; set(Math.max(0, i)); }).observe(nav);
    set(0);
    pick();
  } else set(0);
  nav._toc = { set };
  return nav._toc;
}

/** Wires every .bt-toc under root. */
export function initTocs(root = document) {
  root.querySelectorAll(".bt-toc").forEach((n) => initToc(n));
}
