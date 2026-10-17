// shared/ui/prizestand.js — .bt-prizestand, the Prize Box's H2a "the box is the stand" (docs/specs/prize-box.md §2, §9; mockups
// prize-box-pages.html H2a and prize-box-wheel-and-draw.html): the F2 Prize Wheel (.bt-wheel--prize) on a post that runs down into the
// Prize Box. When a winner is confirmed the box shakes, the lid blows off, gold light pours out, confetti bursts from the box and a winner
// card rises out of it (lime "It's you!" when the viewer is the winner). Used on the /prizes hero and the stream view.
// Reduced motion (unless motion or data-motion="always", as on the stream view): no shake or confetti; the lid opens and the card appears.
//
//   prizeStandHtml({ labels, text, landed, offset, motion, mascot, label })   markup (the wheel options are prizeWheelHtml's)
//   standBurst(el, { title, line, note, me, motion, confetti })   the winner moment; resolves when the card is up
//     title   the big line ("@nightowl", or "It's you!")    line  under it ("wins the draw")    note  small print (optional)
//     me      the lime "It's you!" card                       confetti  pieces (default 110; 220 for me)
//   standReset(el)   lid back on, card gone (the wheel is left as it is)
// Text is escaped. The wood colours are the --pz-* feature properties in bt-ui.css (declared once), the wheel uses --bt-wheel-*.
import { escapeHtml as esc } from "./dom.js";
import { prizeWheelHtml } from "./wheel.js";

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const B = { x: 175, y: 318, w: 170, h: 96 };   // the box in the 520 × 440 scene
let uidN = 0;

export function prizeStandHtml(opts = {}) {
  const id = `btps${++uidN}`, { x, y, w, h } = B, cx = x + w / 2;
  const box = `<g class="bt-prizestand-box"><rect class="wood" x="${x}" y="${y}" width="${w}" height="${h}" rx="5"/>`
    + `<path class="slat" d="M${x} ${y + h / 3} H${x + w} M${x} ${y + (2 * h) / 3} H${x + w}"/>`
    + `<path class="ribbon" d="M${cx - 12} ${y} V${y + h} M${cx + 12} ${y} V${y + h}"/>`
    + `<path class="brass" d="M${x} ${y} h16 v16 M${x + w} ${y} h-16 v16 M${x} ${y + h} h16 v-16 M${x + w} ${y + h} h-16 v-16"/></g>`;
  const lid = `<g class="bt-prizestand-lid"><rect class="wood" x="${x - 8}" y="${y - 22}" width="${w + 16}" height="24" rx="4"/><path class="ribbon" d="M${cx - 12} ${y - 22} V${y + 2} M${cx + 12} ${y - 22} V${y + 2}"/></g>`;
  return `<div class="bt-prizestand"${opts.motion ? ' data-motion="always"' : ""} data-state="idle" style="--bx:${((cx / 520) * 100).toFixed(2)}%;--by:${((y / 440) * 100).toFixed(2)}%">`
    + `<svg class="bt-prizestand-back" viewBox="0 0 520 440" aria-hidden="true" focusable="false"><defs>`
    + `<linearGradient id="${id}-s" x1="0" y1="0" x2="0" y2="1"><stop class="spot-a" offset="0"/><stop class="spot-b" offset="1"/></linearGradient>`
    + `<linearGradient id="${id}-b" x1="0" y1="1" x2="0" y2="0"><stop class="beam-a" offset="0"/><stop class="beam-b" offset="1"/></linearGradient></defs>`
    + `<path class="spot" d="M222 0 L298 0 L478 436 L42 436 Z" fill="url(#${id}-s)"/><ellipse class="floor" cx="260" cy="420" rx="230" ry="16"/>`
    + `<rect class="post" x="252" y="250" width="16" height="${y - 250 + 10}" rx="3"/>`
    + `<path class="bt-prizestand-beam" d="M${x + 6} ${y} L${cx - 130} 40 L${cx + 130} 40 L${x + w - 6} ${y} Z" fill="url(#${id}-b)"/></svg>`
    + `<div class="bt-prizestand-wheel">${prizeWheelHtml(opts)}</div>`
    + `<svg class="bt-prizestand-front" viewBox="0 0 520 440" aria-hidden="true" focusable="false">${box}${lid}</svg>`
    + `<div class="bt-prizestand-card" aria-live="polite"></div>`
    + `<canvas class="bt-prizestand-confetti" aria-hidden="true"></canvas></div>`;
}

const standOf = (el) => (el && (el.matches(".bt-prizestand") ? el : el.querySelector(".bt-prizestand"))) || null;

export function standReset(el) {
  const s = standOf(el);
  if (!s) return;
  clearTimeout(s._bt_t);
  s.classList.remove("is-shake", "is-burst");
  s.dataset.state = "idle";
  const card = s.querySelector(".bt-prizestand-card");
  card.className = "bt-prizestand-card";
  card.innerHTML = "";
}

export function standBurst(el, { title = "", line = "", note = "", me = false, motion = false, confetti = null } = {}) {
  const s = standOf(el);
  if (!s) return Promise.resolve();
  standReset(s);
  const still = !motion && s.dataset.motion !== "always" && reduced();
  const card = s.querySelector(".bt-prizestand-card");
  const up = () => {
    card.innerHTML = `<b>${esc(title)}</b>${line ? `<span>${esc(line)}</span>` : ""}${note ? `<small>${esc(note)}</small>` : ""}`;
    card.className = `bt-prizestand-card is-in${me ? " is-me" : ""}`;
    s.dataset.state = "burst";
  };
  if (still) { s.classList.add("is-burst"); up(); return Promise.resolve(); }
  return new Promise((done) => {
    s.dataset.state = "shake";
    s.classList.add("is-shake");
    s._bt_t = setTimeout(() => {
      s.classList.remove("is-shake");
      s.classList.add("is-burst");
      burstConfetti(s, confetti == null ? (me ? 220 : 110) : confetti);
      up();
      done();
    }, 520);
  });
}

/** Confetti from the box's mouth, in the wheel's colours plus gold and the off-white edge (read from the tokens on the page). */
function burstConfetti(s, n) {
  const cv = s.querySelector(".bt-prizestand-confetti");
  if (!cv || !cv.getContext) return;
  const r = s.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  const c = cv.getContext("2d");
  c.scale(dpr, dpr);
  const cs = getComputedStyle(s);
  const cols = [...Array.from({ length: 10 }, (_, i) => cs.getPropertyValue(`--bt-wheel-${i + 1}`)), cs.getPropertyValue("--bt-title"), cs.getPropertyValue("--bt-bulb"), cs.getPropertyValue("--bt-wheel-hub")].map((v) => v.trim()).filter(Boolean);
  const ox = (r.width * parseFloat(cs.getPropertyValue("--bx"))) / 100, oy = (r.height * parseFloat(cs.getPropertyValue("--by"))) / 100, u = r.width / 520;
  const P = Array.from({ length: n }, () => ({ x: ox + (Math.random() - 0.5) * 60 * u, y: oy, vx: (Math.random() - 0.5) * 9 * u, vy: -(5 + Math.random() * 9) * u, g: 0.22 * u, w: (5 + Math.random() * 6) * u, h: (3 + Math.random() * 4) * u, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4, c: cols[Math.floor(Math.random() * cols.length)] }));
  const t0 = performance.now(), LIFE = 2600;
  const f = (now) => {
    const t = now - t0;
    c.clearRect(0, 0, r.width, r.height);
    for (const p of P) {
      p.vy += p.g; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
      c.save(); c.globalAlpha = Math.max(0, 1 - t / LIFE); c.translate(p.x, p.y); c.rotate(p.a); c.fillStyle = p.c;
      c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.a * 2))); c.restore();
    }
    if (t < LIFE) requestAnimationFrame(f); else c.clearRect(0, 0, r.width, r.height);
  };
  requestAnimationFrame(f);
}
