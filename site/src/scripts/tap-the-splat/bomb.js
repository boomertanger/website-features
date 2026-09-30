// Round 8b: the bomb in the first O, with a burning braided fuse (smoke, embers,
// hiss; 11 s). Snip it with the wire cutters. The fuse without cutters = a
// penalty and a hint; the bomb itself, or running out of time = boom (lose).
import { showTool, dropTool } from "./tools.js";
import { nextHot } from "./chase.js";

const FUSE_MS = 11000;
const SVG = "http://www.w3.org/2000/svg";
const puff = (fx, cls, x, y, r, vars, ms) => {
  const c = document.createElementNS(SVG, "circle");
  c.setAttribute("class", cls); c.setAttribute("cx", x); c.setAttribute("cy", y); c.setAttribute("r", r);
  Object.entries(vars).forEach(([k, v]) => c.style.setProperty(k, v));
  fx.append(c); setTimeout(() => c.remove(), ms);
};

export function startBomb(G) {
  const { S } = G;
  G.phase("fuse"); G.setA("bomb", "1"); G.setA("fuse", "burn"); G.hissStart();
  const mk = G.$(".bt-tts-fuse .f-mk"), spark = G.$(".bt-tts-fuse .f-spark"), sg = G.$(".bt-tts-fuse .f-sparkg"), fx = G.$(".bt-tts-fuse .f-fx");
  const L = mk.getTotalLength(), t0 = performance.now();
  let lastSmoke = 0;
  mk.style.strokeDasharray = `${L} ${L}`;
  const tick = (t) => {
    const k = Math.min(1, (t - t0) / FUSE_MS), burned = k * L;
    mk.style.strokeDashoffset = -burned; S.fuseK = k;
    const p = mk.getPointAtLength(burned);
    spark.setAttribute("cx", p.x); spark.setAttribute("cy", p.y); sg.setAttribute("transform", `translate(${p.x} ${p.y})`);
    if (t - lastSmoke > 110) {
      lastSmoke = t;
      puff(fx, "f-smoke", p.x, p.y, 3, { "--sx": Math.random() * 12 - 6 + "px" }, 950);
      puff(fx, "f-ember", p.x, p.y, 1.2, { "--ex": Math.random() * 20 - 10 + "px", "--ey": Math.random() * 16 - 4 + "px" }, 520);
    }
    if (k >= 1) return explode(G);
    S.raf = requestAnimationFrame(tick);
  };
  S.raf = requestAnimationFrame(tick);
  G.later(() => showTool(G, "cutters"), 500);
}

export function explode(G) {
  const { S, root } = G;
  S.endAt = G.elapsed(); G.$("[data-tm]").textContent = G.fmtTime(S.endAt);
  cancelAnimationFrame(S.raf); G.hissStop(); G.SFX.boom(); dropTool(G);
  const o = G.rel(G.$(".bt-tts-o"), 0.5, 0.52), b = G.$(".bt-tts-boom");
  b.style.left = o.x + "px"; b.style.top = o.y + "px";
  b.innerHTML = `<span class="flash"></span>` + Array.from({ length: 26 }, (_, k) => {
    const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 180;
    return `<b style="--tx:${Math.cos(a) * d}px;--ty:${Math.sin(a) * d}px;--c:var(--tts-shard-${k % 4})"></b>`;
  }).join("");
  root.classList.add("is-shake"); G.setA("bomb", null); G.setA("fuse", null); G.phase("over"); G.stopClock();
  setTimeout(() => { root.classList.remove("is-shake"); G.end("boom"); }, 1000);
}

export function cutFuse(G, ev) {
  const { S, SFX } = G;
  if (S.held !== "cutters") {
    const p = G.pointer(ev); G.minus(p.x, p.y);
    if (!S.cutWarned) { S.cutWarned = true; G.toast("Too tough to snap by hand."); }
    return;
  }
  cancelAnimationFrame(S.raf); G.hissStop(); SFX.snip();
  const c = G.$('[data-tool="cutters"]');
  c.classList.remove("is-snip"); void c.offsetWidth; c.classList.add("is-snip");
  const sp = G.$(".bt-tts-fuse .f-spark"), cf = G.$(".bt-tts-fuse .f-cut");
  cf.setAttribute("cx", sp.getAttribute("cx")); cf.setAttribute("cy", sp.getAttribute("cy"));
  G.setA("fuse", "cut"); G.progress(85); G.phase("defused");
  G.later(() => dropTool(G), 400);
  G.later(() => G.setA("bomb", null), 900);
  // Round 9 starts.
  G.later(() => { G.phase("chase"); S.catches = 0; S.hot = null; G.later(() => nextHot(G), 600); }, 1300);
}
