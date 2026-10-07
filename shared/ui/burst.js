// shared/ui/burst.js — the splat burst, the flying cover and the "On air soon" celebration (docs/design-system.md §5
// "Scream Planner pieces"). All of it is skipped under prefers-reduced-motion (the CSS hides the layers too).
//
//   burst(el, { colors, n })        a short splat of dots from the middle of el. colors are CSS values; default blood,
//                                   gold and primary-soft tokens. Appended inside el's .bt-root so tokens resolve.
//   flyTo(fromEl, toEl, done)       a clone of fromEl glides onto toEl, then done() (immediately when motion is reduced
//                                   or either element is missing)
//   onAirSoonHtml()                 the ON AIR SOON stamp (.bt-onair > .bt-stamp--sm)
//   celebrate(root, { selector = ".bt-slot, .bt-ticket", stagger = 180, onDone })
//                                   publish moment: each card in turn gets the stamp and a burst; returns cancel().
//                                   Under reduced motion the stamps just appear, no burst, no delay.
//   reducedMotion()                 true when the viewer asked for less motion
import { stampHtml } from "./stamp.js";

export const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const TOKENS = ["var(--bt-blood)", "var(--bt-title)", "var(--bt-primary-soft)"];

function host(el) { return el.closest(".bt-root") || document.body; }
function rel(el, h) {
  const r = el.getBoundingClientRect(), b = h.getBoundingClientRect();
  return { x: r.left - b.left + h.scrollLeft, y: r.top - b.top + h.scrollTop, w: r.width, h: r.height };
}

export function burst(el, { colors = TOKENS, n = 16 } = {}) {
  if (reducedMotion() || !el) return;
  const h = host(el), p = rel(el, h), b = document.createElement("div");
  b.className = "bt-burst"; b.setAttribute("aria-hidden", "true");
  b.style.left = p.x + p.w / 2 + "px"; b.style.top = p.y + p.h / 2 + "px";
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.4, d = 30 + Math.random() * 50, s = document.createElement("i");
    s.style.setProperty("--x", Math.cos(a) * d + "px"); s.style.setProperty("--y", Math.sin(a) * d + "px"); s.style.setProperty("--c", colors[i % colors.length]);
    s.style.width = s.style.height = 4 + Math.random() * 7 + "px";
    b.appendChild(s);
  }
  h.appendChild(b); setTimeout(() => b.remove(), 900);
}

export function flyTo(fromEl, toEl, done) {
  if (reducedMotion() || !fromEl || !toEl) { done?.(); return; }
  const h = host(fromEl), a = rel(fromEl, h), t = rel(toEl, h), c = fromEl.cloneNode(true);
  c.classList.add("bt-fly"); c.removeAttribute("id");
  Object.assign(c.style, { left: a.x + "px", top: a.y + "px", width: a.w + "px", height: a.h + "px" });
  h.appendChild(c);
  requestAnimationFrame(() => { c.style.transform = `translate(${t.x - a.x}px, ${t.y - a.y}px) scale(${t.w / a.w}) rotate(-8deg)`; });
  setTimeout(() => { c.remove(); done?.(); }, 600);
}

export const onAirSoonHtml = () => `<span class="bt-onair">${stampHtml({ kicker: "On air", label: "soon", size: "sm" })}</span>`;

export function celebrate(root = document, { selector = ".bt-slot, .bt-ticket", stagger = 180, onDone } = {}) {
  const cards = [...root.querySelectorAll(selector)].filter((c) => !c.classList.contains("is-off"));
  const timers = [], still = reducedMotion();
  cards.forEach((c, i) => {
    const go = () => {
      if (!c.querySelector(".bt-onair")) {
        c.insertAdjacentHTML("beforeend", onAirSoonHtml());
        const wrap = c.querySelector(".bt-onair");
        wrap.style.cssText = c.classList.contains("bt-slot") ? "right:120px;top:50%;margin-top:-48px" : "right:8px;top:30px";
      }
      burst(c.querySelector(".bt-onair") || c, { n: 12 });
      if (i === cards.length - 1) onDone?.();
    };
    if (still) go(); else timers.push(setTimeout(go, i * stagger));
  });
  if (!cards.length) onDone?.();
  return () => timers.forEach(clearTimeout);
}
