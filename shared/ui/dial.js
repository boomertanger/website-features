// shared/ui/dial.js — .bt-dial (docs/design-system.md §5 "Score dial"): a score out of 10 as a
// vault dial. Its ten segments light one by one in Boomer's gold (--bt-title, the colour his own
// words use) when it scrolls into view. Without the script the number still reads; under
// reduced motion the segments light at once.
// Also the members' verdict dial (.bt-dial--verdict, docs/specs/game-page-votes.md §3, C1), the
// same size and family: the ring split Love (pink) / Like (blue) / Not for me (gold) in the
// kit's rating tones, % who liked it ((love + like) ÷ n) in the middle, "<n> ratings · Rate it".
// Below `min` ratings it's the dashed "Not enough ratings yet" dial (.bt-dial--few).
//
//   dialHtml(score, { label, caption, size: "sm", kicker })   markup (score 1-10; null = .bt-dial--none, "Not played yet")
//   verdictDialHtml({ love, like, nope, min = 3, kicker = "Members", rate = "Rate it", rateAttrs = 'href="#rate" data-goto-rate', size })
//   initDials(root)
//   kicker: a small uppercase name over the caption ("Boomer", "Members"), for twin dials.

const R = 62, C = 75, rad = (d) => (d * Math.PI) / 180;
const pt = (a, r = R) => `${(C + r * Math.cos(a)).toFixed(2)} ${(C + r * Math.sin(a)).toFixed(2)}`;
/** An arc of the ring from deg0 to deg1 (0 = top, clockwise). */
const arc = (d0, d1) => `M${pt(rad(-90 + d0))}A${R} ${R} 0 ${d1 - d0 > 180 ? 1 : 0} 1 ${pt(rad(-90 + d1))}`;
const ticks = () => Array.from({ length: 40 }, (_, i) => {
  const a = rad(i * 9), r2 = i % 4 ? 74 : 76;
  return `<line class="tk" x1="${(C + 72 * Math.cos(a)).toFixed(1)}" y1="${(C + 72 * Math.sin(a)).toFixed(1)}" x2="${(C + r2 * Math.cos(a)).toFixed(1)}" y2="${(C + r2 * Math.sin(a)).toFixed(1)}"/>`;
}).join("");
const kickerHtml = (k) => (k ? `<span class="bt-dial-k">${k}</span>` : "");

export function dialHtml(score, { label = "Boomer's score", caption = "Boomer's score", size, kicker = "" } = {}) {
  const none = score == null || score === "";
  const n = none ? 0 : Math.max(0, Math.min(10, Math.round(Number(score) || 0)));
  const segs = Array.from({ length: 10 }, (_, i) => `<path class="seg${i < n ? " is-on" : ""}" style="--i:${i}" d="${arc(i * 36 + 2.5, (i + 1) * 36 - 2.5)}"/>`).join("");
  const cls = `bt-dial${size === "sm" ? " bt-dial--sm" : ""}${none ? " bt-dial--none" : ""}`;
  const mid = none ? `<div class="bt-dial-c" aria-hidden="true"><span class="bt-dial-none">Not yet</span></div>` : `<div class="bt-dial-c" aria-hidden="true"><b>${n}</b><small>/10</small></div>`;
  const cap = none ? (caption === "Boomer's score" ? "Not played yet" : caption) : caption;
  return `<div class="bt-dialbox">${kickerHtml(kicker)}<div class="${cls}" data-dial role="img" aria-label="${none ? `${label}: not played yet` : `${label}: ${n} out of 10`}"><svg viewBox="0 0 150 150" aria-hidden="true">${ticks()}${segs}</svg>${mid}</div>${cap ? `<p class="bt-dial-cap">${cap}</p>` : ""}</div>`;
}

export function verdictDialHtml({ love = 0, like = 0, nope = 0, min = 3, kicker = "Members", rate = "Rate it", rateAttrs = 'href="#rate" data-goto-rate', size } = {}) {
  const v = { love: Math.max(0, Number(love) || 0), like: Math.max(0, Number(like) || 0), nope: Math.max(0, Number(nope) || 0) };
  const n = v.love + v.like + v.nope;
  const link = rate ? `<a ${rateAttrs}>${rate}</a>` : "";
  const sm = size === "sm" ? " bt-dial--sm" : "";
  if (n < min) {
    return `<div class="bt-dialbox">${kickerHtml(kicker)}<div class="bt-dial bt-dial--verdict bt-dial--few${sm}" role="img" aria-label="Not enough member ratings yet"><svg viewBox="0 0 150 150" aria-hidden="true">${ticks()}<circle class="few" cx="${C}" cy="${C}" r="${R}"/></svg><div class="bt-dial-c" aria-hidden="true"><span class="bt-dial-none">Not enough<br>ratings yet</span></div></div>${link ? `<p class="bt-dial-cap">${link}</p>` : ""}</div>`;
  }
  const pct = Math.round(((v.love + v.like) / n) * 100);
  let at = 0, segs = "";
  const gap = 4;
  for (const k of ["love", "like", "nope"]) {
    if (!v[k]) continue;
    const span = (v[k] / n) * 360;
    const g = span > gap * 2 ? gap / 2 : 0;
    segs += span >= 359.9 ? `<circle class="arc" data-v="${k}" cx="${C}" cy="${C}" r="${R}"/>` : `<path class="arc" data-v="${k}" d="${arc(at + g, at + span - g)}"/>`;
    at += span;
  }
  const said = `${pct}% of ${n} members liked it: ${v.love} love it, ${v.like} like it, ${v.nope} not for them`;
  return `<div class="bt-dialbox">${kickerHtml(kicker)}<div class="bt-dial bt-dial--verdict${sm}" data-dial role="img" aria-label="${said}"><svg viewBox="0 0 150 150" aria-hidden="true">${ticks()}${segs}</svg><div class="bt-dial-c" aria-hidden="true"><b>${pct}%</b><small>liked it</small></div></div><p class="bt-dial-cap">${n} ${n === 1 ? "rating" : "ratings"}${link ? ` · ${link}` : ""}</p></div>`;
}

const io = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver((entries) => entries.forEach((e) => {
  if (!e.isIntersecting) return;
  io.unobserve(e.target);
  e.target.classList.add("is-in");
}), { threshold: 0.4 }) : null;

export function initDials(root = document) {
  root.querySelectorAll("[data-dial]:not(.is-in)").forEach((el) => (io ? io.observe(el) : el.classList.add("is-in")));
}
