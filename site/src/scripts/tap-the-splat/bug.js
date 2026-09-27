// Round 2: the firefly. It wanders in on a random 2 to 5 loop path (the clock is
// paused for the whole flight, so a long flight never costs anyone), hits the B
// of "Built", the tagline zaps and starts to flicker, and the skull pull chain
// drops at the same moment.
import { FIREFLY } from "./art.js";

export function flyBug(G) {
  const { root, S } = G;
  G.phase("bug"); G.pause();
  const b = document.createElement("span");
  b.className = "bt-tts-bug"; b.innerHTML = FIREFLY; root.append(b);

  const W = root.offsetWidth, st = G.playRect(), T = G.rel(G.$(".bt-tts-b"), 0.3, 0.5);
  const top = st.y - st.h / 2 + 30, bot = st.y + st.h / 2 - 30;
  const n = 2 + Math.floor(Math.random() * 4);
  const pts = [{ x: -40, y: top + Math.random() * (bot - top) }];
  for (let i = 0; i < n; i++) pts.push({ x: 60 + Math.random() * (W - 120), y: top + Math.random() * (bot - top) });
  pts.push({ x: T.x - 70, y: T.y - 30 }, { x: T.x - 10, y: T.y });

  // Catmull-Rom through the points, sampled and walked at a constant speed.
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  const cr = (a, b2, c, d, t) => { const t2 = t * t, t3 = t2 * t; return 0.5 * ((2 * b2) + (-a + c) * t + (2 * a - 5 * b2 + 4 * c - d) * t2 + (-a + 3 * b2 - 3 * c + d) * t3); };
  const seg = (i, t) => ({ x: cr(P[i - 1].x, P[i].x, P[i + 1].x, P[i + 2].x, t), y: cr(P[i - 1].y, P[i].y, P[i + 1].y, P[i + 2].y, t) });
  const samples = [];
  for (let i = 1; i < P.length - 2; i++) for (let k = 0; k < 40; k++) samples.push(seg(i, k / 40));
  samples.push(pts[pts.length - 1]);
  const dist = [0];
  for (let i = 1; i < samples.length; i++) dist.push(dist[i - 1] + Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y));
  // Reduced motion: the same path, flown three times as fast.
  const total = dist[dist.length - 1], speed = G.reduced() ? 900 : 300, D = (total / speed) * 1000, t0 = performance.now();
  let px = samples[0].x, py = samples[0].y, j = 0;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / D), d = k * total;
    while (j < dist.length - 2 && dist[j + 1] < d) j++;
    const f = (d - dist[j]) / Math.max(1e-6, dist[j + 1] - dist[j]);
    const x = samples[j].x + (samples[j + 1].x - samples[j].x) * f + Math.sin(t / 90) * 3;
    const y = samples[j].y + (samples[j + 1].y - samples[j].y) * f + Math.cos(t / 70) * 3;
    const ang = (Math.atan2(y - py, x - px) * 180) / Math.PI; px = x; py = y;
    b.style.transform = `translate(${x - 13}px, ${y - 13}px) rotate(${ang}deg)`;
    if (k < 1) S.raf = requestAnimationFrame(step); else hit(G, b, x, y);
  };
  S.raf = requestAnimationFrame(step);
}

function hit(G, b, x, y) {
  const { root, SFX } = G;
  G.resume(); SFX.zap();
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
