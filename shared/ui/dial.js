// shared/ui/dial.js — .bt-dial (docs/design-system.md §5 "Score dial"): a score out of 10 as a
// vault dial. Its ten segments light one by one in Boomer's gold (--bt-title, the colour his own
// words use) when it scrolls into view. Without the script the number still reads; under
// reduced motion the segments light at once.
//
//   dialHtml(score, { label, caption, size: "sm" })   markup (score 1-10)
//   initDials(root)

export function dialHtml(score, { label = "Boomer's score", caption = "Boomer's score", size } = {}) {
  const n = Math.max(0, Math.min(10, Math.round(Number(score) || 0)));
  const R = 62, C = 75, rad = (d) => (d * Math.PI) / 180;
  const segs = Array.from({ length: 10 }, (_, i) => {
    const a0 = rad(-90 + i * 36 + 2.5), a1 = rad(-90 + (i + 1) * 36 - 2.5);
    return `<path class="seg${i < n ? " is-on" : ""}" style="--i:${i}" d="M${(C + R * Math.cos(a0)).toFixed(2)} ${(C + R * Math.sin(a0)).toFixed(2)}A${R} ${R} 0 0 1 ${(C + R * Math.cos(a1)).toFixed(2)} ${(C + R * Math.sin(a1)).toFixed(2)}"/>`;
  }).join("");
  const ticks = Array.from({ length: 40 }, (_, i) => {
    const a = rad(i * 9), r2 = i % 4 ? 74 : 76;
    return `<line class="tk" x1="${(C + 72 * Math.cos(a)).toFixed(1)}" y1="${(C + 72 * Math.sin(a)).toFixed(1)}" x2="${(C + r2 * Math.cos(a)).toFixed(1)}" y2="${(C + r2 * Math.sin(a)).toFixed(1)}"/>`;
  }).join("");
  return `<div class="bt-dialbox"><div class="bt-dial${size === "sm" ? " bt-dial--sm" : ""}" data-dial role="img" aria-label="${label}: ${n} out of 10"><svg viewBox="0 0 150 150" aria-hidden="true">${ticks}${segs}</svg><div class="bt-dial-c" aria-hidden="true"><b>${n}</b><small>/10</small></div></div>${caption ? `<p class="bt-dial-cap">${caption}</p>` : ""}</div>`;
}

const io = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver((entries) => entries.forEach((e) => {
  if (!e.isIntersecting) return;
  io.unobserve(e.target);
  e.target.classList.add("is-in");
}), { threshold: 0.4 }) : null;

export function initDials(root = document) {
  root.querySelectorAll("[data-dial]:not(.is-in)").forEach((el) => (io ? io.observe(el) : el.classList.add("is-in")));
}
