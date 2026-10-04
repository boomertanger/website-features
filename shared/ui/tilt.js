// shared/ui/tilt.js — [data-tilt] (docs/design-system.md §5 "Tilt and glare"): the element
// turns toward the pointer and a .bt-glare inside it catches the light. Pointer devices with a
// fine pointer only; nothing under reduced motion. One delegated listener for the page.
//
//   initTilt()   call once; works for anything with data-tilt, now or added later

let on = false;
export function initTilt() {
  if (on || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  on = true;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const settle = (el) => { el.classList.remove("is-tilting"); el.style.removeProperty("--rx"); el.style.removeProperty("--ry"); };
  document.addEventListener("pointermove", (e) => {
    const el = e.target instanceof Element ? e.target.closest("[data-tilt]") : null;
    document.querySelectorAll("[data-tilt].is-tilting").forEach((x) => { if (x !== el) settle(x); });
    if (!el || reduce.matches) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    el.classList.add("is-tilting");
    el.style.setProperty("--ry", `${((px - 0.5) * 16).toFixed(2)}deg`);
    el.style.setProperty("--rx", `${((0.5 - py) * 12).toFixed(2)}deg`);
    el.style.setProperty("--gx", `${(px * 100).toFixed(1)}%`);
    el.style.setProperty("--gy", `${(py * 100).toFixed(1)}%`);
  }, { passive: true });
  document.addEventListener("pointerleave", () => document.querySelectorAll("[data-tilt].is-tilting").forEach(settle));
}
