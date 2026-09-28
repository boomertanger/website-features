// Tap the Splat rounds 3 to 8 (docs/specs/tap-the-splat.md): pull chain, breaker,
// links, power cut, loose letters, DANGER. The firefly (bug.js), bomb (bomb.js)
// and catch-the-blood (chase.js) rounds have their own modules.
import { showBreaker, startPlug, showTool, dropTool } from "./tools.js";
import { startBomb } from "./bomb.js";

// Round 3: pull the skull. Flicker stops, the chain goes, Contact and Follow appear
// and the page scrolls to the bottom of the footer.
export function pullChain(G) {
  const { SFX } = G, ch = G.$(".bt-tts-chain");
  SFX.chainpull(); ch.classList.add("is-pull");
  G.progress(20); G.phase("post-chain"); G.setA("flicker", null);
  G.later(() => { ch.classList.remove("is-pull"); G.setA("chain", "done"); G.enable(ch, false); G.setA("cf", "1"); SFX.clink(); G.toBottom(560); }, 650);
  G.later(() => showBreaker(G), 1600);
}

// Round 4: flip the breaker (ignored = the links keep working as links).
export function flipBreaker(G) {
  const { root, SFX } = G, br = G.$(".bt-tts-breaker");
  SFX.kachunk(); G.setA("breaker", "off");
  root.classList.add("is-blackout"); setTimeout(() => root.classList.remove("is-blackout"), 520);
  G.setA("dark", "1"); G.progress(25); G.phase("links");
  G.later(() => { G.setA("breaker", "gone"); G.enable(br, false); }, 500);
}

// Round 5: hover (tap on phones) each dark link to relight it.
export function relight(G, c) {
  const { S, SFX } = G;
  if (S.phase !== "links") return;
  const i = G.idx(c);
  if (S.got.has(i)) return;
  S.got.add(i); c.classList.add("is-got");
  SFX.blip(S.got.size); G.progress(25 + S.got.size * 2.5);
  if (S.got.size === 8) G.later(() => { G.setA("dark", null); startPlug(G); }, 700);
}

// Round 6b: TANGER is glowing; click it to restore it.
export function restoreTanger(G) {
  G.SFX.click(); G.setA("tstate", null); G.setA("plug", null);
  G.$(".bt-tts-cord path").setAttribute("d", "");
  G.progress(57);
  G.later(() => startHammer(G), 1200);
}

// Round 7: A, G and R come loose; knock each back with the hammer.
const LOOSE = [[1, -16, 4], [3, 14, -3], [5, -12, 5]];   // letter, tilt deg, drop px
export function startHammer(G) {
  const { S, SFX } = G;
  G.phase("hammer"); G.setA("tstate", "shake"); SFX.crumble();
  LOOSE.forEach(([i, rot, dy]) => {
    const s = G.$(`.bt-tts-tanger [data-l="${i}"]`);
    s.classList.add("is-loose"); s.style.transform = `rotate(${rot}deg) translateY(${dy}px)`; S.loose.add(i);
  });
  G.later(() => showTool(G, "hammer"), 700);
}

export function hammerHit(G, t, ev) {
  const { S, SFX, root } = G, p = G.pointer(ev);
  if (S.held !== "hammer") return G.minus(p.x, p.y);
  const h = G.$('[data-tool="hammer"]');
  h.classList.remove("is-swing"); void h.offsetWidth; h.classList.add("is-swing");
  SFX.thunk();
  const i = +t.dataset.l;
  if (!S.loose.has(i)) return G.minus(p.x, p.y);
  S.loose.delete(i); t.classList.remove("is-loose"); t.style.transform = "";
  G.progress(57 + (3 - S.loose.size) * 4);
  const th = document.createElement("span");
  th.className = "bt-tts-thunk"; th.textContent = "THUNK"; th.style.left = p.x + "px"; th.style.top = p.y - 20 + "px";
  root.append(th); setTimeout(() => th.remove(), 720);
  if (!S.loose.size) {
    G.setA("tstate", null);
    G.later(() => dropTool(G), 300);
    // Round 8: the T flips to D.
    G.later(() => { G.phase("danger"); G.setA("tstate", "danger"); G.$(".bt-tts-t1").textContent = "D"; SFX.buzz(); }, 1300);
  }
}

// Round 8: click DANGER; the bomb appears in the first O.
export function clickDanger(G) {
  G.SFX.click(); G.setA("tstate", null);
  G.$(".bt-tts-t1").textContent = "T";
  G.progress(73);
  G.later(() => startBomb(G), 350);
}
