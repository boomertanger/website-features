// shared/ui/count-up.js — [data-count-to] (docs/design-system.md §5 "Count-up"): a number that
// counts up once, the first time it scrolls into view. The element's text is the final value
// from the start (so it reads right without this script); data-suffix (" h") is kept. Under
// reduced motion it just shows the value.
//
//   <b data-count-to="61" data-suffix=" h">61 h</b>
//   initCountUp(root)   (idempotent per element)

const io = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver((entries) => entries.forEach((e) => {
  if (!e.isIntersecting) return;
  io.unobserve(e.target);
  run(e.target);
}), { threshold: 0.4 }) : null;

function run(el) {
  const to = Number(el.dataset.countTo), suffix = el.dataset.suffix || "";
  if (!Number.isFinite(to) || to <= 0 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const t0 = performance.now(), dur = 1100;
  const step = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    el.textContent = `${Math.round(to * (1 - Math.pow(1 - p, 3))).toLocaleString("en-US")}${suffix}`;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** @param {ParentNode} [root] */
export function initCountUp(root = document) {
  if (!io) return;
  root.querySelectorAll("[data-count-to]:not([data-counted])").forEach((el) => { el.dataset.counted = ""; io.observe(el); });
}
