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
  // Web fonts can change the tab widths after the first paint.
  document.fonts?.ready.then(settle);
  nav.classList.add("is-ready");
  nav._segNav = { place: () => place(current()) };
  return nav._segNav;
}

/** Wires every .bt-seg-nav under root. */
export function initSegNavs(root = document) {
  root.querySelectorAll(".bt-seg-nav").forEach(initSegNav);
}
