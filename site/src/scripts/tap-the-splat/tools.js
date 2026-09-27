// Tap the Splat tools: the hammer and wire cutters (pick up, follow the pointer),
// the plug and cord, and the breaker switch, each placed at a random spot.

const clampX = (G, x, pad = 30) => Math.min(G.root.offsetWidth - pad, Math.max(pad, x));
const pick = (spots) => spots[Math.floor(Math.random() * spots.length)];

// ---- hammer and cutters ----
export function showTool(G, name) {
  const t = G.$(`[data-tool="${name}"]`), W = G.root.offsetWidth, st = G.rel(G.$(".bt-tts-stage"));
  const spots = G.isPhone()
    ? [[W - 40, st.y - st.h / 2 + 40], [40, st.y - st.h / 2 + 40]]
    : [[46, st.y - 110], [46, st.y + 120], [W - 46, st.y - 110], [W - 46, st.y + 120]];
  const [x, y] = pick(spots);
  t.style.left = x + "px"; t.style.top = y + "px";
  t.classList.add("is-shown"); G.enable(t, true); G.SFX.pick();
}

export function pickTool(G, t) {
  const { S, root } = G;
  if (!t.classList.contains("is-shown")) return;
  S.held = t.dataset.tool; t.classList.add("is-held"); root.classList.add("is-holding");
  if (S.held === "cutters") { root.classList.add("is-cutters"); S.prog = Math.max(S.prog, 76); G.draw(); }
  G.SFX.pick();
}

/** The held tool follows the pointer (and jumps to it on a tap). */
export function moveHeldTool(G, ev) {
  const t = G.$(`[data-tool="${G.S.held}"]`), p = G.pointer(ev);
  t.style.left = p.x + 16 + "px"; t.style.top = p.y - 14 + "px";
}

export function dropTool(G) {
  G.$$(".bt-tts-tool").forEach((t) => { t.classList.remove("is-shown", "is-held"); G.enable(t, false); });
  G.S.held = null;
  G.root.classList.remove("is-holding", "is-cutters");
}

// ---- breaker (the gate before the link round) ----
export function showBreaker(G) {
  G.phase("breaker");
  const W = G.root.offsetWidth, st = G.rel(G.$(".bt-tts-stage")), top = st.y - st.h / 2, br = G.$(".bt-tts-breaker");
  const spots = G.isPhone()
    ? [[W - 30, top + 30], [30, top + 30]]
    : [[40, st.y - 150], [40, st.y + 40], [W - 40, st.y - 150], [W - 40, st.y + 40], [W / 2 - 330, top + 34], [W / 2 + 330, top + 34]];
  const [x, y] = pick(spots);
  br.style.left = clampX(G, x) + "px"; br.style.top = y + "px";
  G.setA("breaker", "on"); G.enable(br, true); G.SFX.pick();
}

// ---- plug and cord (round 6) ----
// The cord runs from the bottom of the R to the plug, lying at a random spot
// below the wordmark; the outlet sits at a random spot above, far from the plug
// and never over a link.
const cordAnchor = (G) => G.rel(G.$(".bt-tts-tanger span:last-child"), 0.5, 0.92);
function drawCord(G, p) {
  const a = cordAnchor(G), sag = Math.max(30, Math.hypot(p.x - a.x, p.y - a.y) * 0.35);
  G.$(".bt-tts-cord path").setAttribute("d", `M${a.x},${a.y} C ${a.x},${a.y + sag} ${p.x},${p.y + 14 + sag * 0.6} ${p.x},${p.y + 12}`);
}
function freeSpot(G, xr, yr, avoid) {
  const cards = G.cards().map((c) => G.rel(c)), hub = G.rel(G.$(".bt-tts-splat")), far = G.isPhone() ? 150 : 260;
  for (let tries = 0; tries < 60; tries++) {
    const x = xr[0] + Math.random() * (xr[1] - xr[0]), y = yr[0] + Math.random() * (yr[1] - yr[0]);
    const onCard = cards.some((r) => Math.abs(x - r.x) < r.w / 2 + 26 && Math.abs(y - r.y) < r.h / 2 + 30);
    const onHub = Math.abs(x - hub.x) < hub.w * 0.32 && Math.abs(y - hub.y) < hub.h * 0.42;
    if (!onCard && !onHub && (!avoid || Math.hypot(x - avoid.x, y - avoid.y) > far)) return { x, y };
  }
  return { x: (xr[0] + xr[1]) / 2, y: (yr[0] + yr[1]) / 2 };
}

export function startPlug(G) {
  const { S } = G;
  G.phase("plug"); G.setA("tstate", "dead"); G.SFX.hum();
  const wm = G.rel(G.$(".bt-tts-wm")), tag = G.rel(G.$(".bt-tts-tag")), W = G.root.offsetWidth, st = G.playRect();
  const below = [tag.y + 40, Math.min(st.y + st.h / 2 - 20, tag.y + 150)], above = [st.y - st.h / 2 + 30, wm.y - 50];
  const xr = G.isPhone() ? [30, W - 30] : [clampX(G, W / 2 - 360), clampX(G, W / 2 + 360)];
  const p = freeSpot(G, xr, below, null), so = freeSpot(G, xr, above, p);
  const o = G.$(".bt-tts-outlet"), pl = G.$(".bt-tts-plug");
  o.style.left = so.x - 17 + "px"; o.style.top = so.y - 23 + "px"; S.sock = { x: so.x, y: so.y - 6 };
  pl.style.left = p.x + "px"; pl.style.top = p.y + "px"; S.plugP = p;
  G.setA("plug", "out"); drawCord(G, p);
}

export function initPlug(G) {
  const { S } = G, pl = G.$(".bt-tts-plug"), outlet = G.$(".bt-tts-outlet");
  let drag = false;
  const near = (p) => Math.hypot(p.x - S.sock.x, p.y - S.sock.y) < 38;
  pl.addEventListener("pointerdown", (ev) => {
    if (S.phase !== "plug") return;
    drag = true; pl.setPointerCapture(ev.pointerId); pl.classList.add("is-dragging"); ev.preventDefault();
  });
  pl.addEventListener("pointermove", (ev) => {
    if (!drag) return;
    const p = G.pointer(ev); S.plugP = p;
    pl.style.left = p.x + "px"; pl.style.top = p.y + "px"; drawCord(G, p);
    outlet.classList.toggle("is-hot", near(p));
  });
  const release = () => {
    if (!drag) return;
    drag = false; pl.classList.remove("is-dragging"); outlet.classList.remove("is-hot");
    if (S.phase !== "plug" || !near(S.plugP)) return;
    // Plugged in: TANGER powers up (dim to bright) and holds a steady glow.
    const s = S.sock;
    pl.style.left = s.x + "px"; pl.style.top = s.y + 4 + "px"; drawCord(G, { x: s.x, y: s.y + 4 });
    G.setA("plug", "in"); G.SFX.plug(); G.SFX.powerup();
    G.progress(52); G.setA("tstate", "glow"); G.phase("glowclick");
  };
  pl.addEventListener("pointerup", release);
  pl.addEventListener("pointercancel", release);
}
