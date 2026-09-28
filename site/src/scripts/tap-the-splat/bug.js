// Round 2: the firefly. It flies in on an S-shaped path (random height, flipping
// up or down) that lasts 2.6 to 5 seconds, hits the B of "Built", the tagline
// zaps and starts to flicker, and the skull pull chain drops at the same moment.
// The clock keeps running: the flight counts toward the time.
import { FIREFLY } from "./art.js";

export function flyBug(G) {
  const { root, S } = G;
  G.phase("bug");
  const b = document.createElement("span");
  b.className = "bt-tts-bug"; b.innerHTML = FIREFLY; root.append(b);

  const T = G.rel(G.$(".bt-tts-b"), 0.3, 0.5), st = G.playRect();
  const sx = -40, sy = T.y - 20 + (Math.random() * 60 - 30), tx = T.x - 10, ty = T.y;
  const room = Math.min(T.y - (st.y - st.h / 2) - 20, (st.y + st.h / 2) - T.y - 20, 130);
  // S height (random, flips up or down); reduced motion flies a gentle glide instead.
  // The duration stays the same either way, so times stay comparable.
  const A = (G.reduced() ? 0.25 : 1) * Math.max(40, room * (0.55 + Math.random() * 0.45)) * (Math.random() < 0.5 ? 1 : -1);
  const loops = 1 + Math.random() * 0.6;                 // one S, sometimes a bit more
  const D = 2600 + Math.random() * 2400, t0 = performance.now();
  let px = sx, py = sy;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / D), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const x = sx + (tx - sx) * e + Math.sin(t / 110) * 2.5;
    const y = sy + (ty - sy) * k + A * Math.sin(k * Math.PI * 2 * loops) * (1 - Math.pow(k, 3)) + Math.cos(t / 80) * 2.5;
    const ang = (Math.atan2(y - py, x - px) * 180) / Math.PI; px = x; py = y;
    b.style.transform = `translate(${x - 13}px, ${y - 13}px) rotate(${ang}deg)`;
    if (k < 1) S.raf = requestAnimationFrame(step); else hit(G, b, x, y);
  };
  S.raf = requestAnimationFrame(step);
}

function hit(G, b, x, y) {
  const { root, SFX } = G;
  SFX.zap();
  const s = document.createElement("span");
  s.className = "bt-tts-zapspark"; s.style.left = x + 8 + "px"; s.style.top = y + "px";
  root.append(s); setTimeout(() => s.remove(), 500);
  const tag = G.$(".bt-tts-tag");
  tag.classList.remove("is-zap"); void tag.offsetWidth; tag.classList.add("is-zap");
  b.classList.add("is-dead"); b.style.transform += " translate(-10px, 70px) rotate(160deg)";
  setTimeout(() => b.remove(), 800);
  G.later(() => {
    G.setA("flicker", "1"); tag.classList.remove("is-zap");
    G.phase("chainwait"); G.progress(10);
    G.setA("chain", "1"); G.enable(G.$(".bt-tts-chain"), true); SFX.clink();
  }, 560);
}
