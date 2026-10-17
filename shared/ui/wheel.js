// shared/ui/wheel.js — .bt-wheel, Hot Seat's picker W1: a wheel of names that spins to each pick in turn under a pointer
// (docs/specs/chat-games.md §5, §14; mockup control-room-batch-4.html "Hot Seat on stream"). Like the séance board it only SHOWS the
// server's draw. An SVG, so it scales from a card to the 1920 px stream view. Text is escaped.
//
//   wheelHtml({ names, picks, state, shown, motion })
//     names   up to 12 handles round the rim (every pick is put on it if missing)
//     picks   [{ handle, status }] in seat order; picked segments light up gold
//     state   idle · spinning · landed (the pointer on the last pick)
//     shown   how many picks are already lit (default all; wheelSpin from: shown does the rest)
//     motion  true keeps the spin under prefers-reduced-motion (the stream view is video)
//   wheelSpin(el, { picks, from = 0, motion, spinMs = 4200, onTick, onDone })   spins to picks[from..] one by one, then data-state landed.
//     Returns cancel(). Reduced motion: it lands at once. onTick() runs each time a segment edge passes the pointer.
//
// The Prize Wheel (.bt-wheel--prize, Prize Box F2 "Gentle fan"; docs/specs/prize-box.md §2, §9; mockup prize-box-wheel-fan.html):
// 10 fan blades in --bt-wheel-1 … 10, each edge one circular arc from hub to rim (hub end turned −7°, curve depth 0.11 of the chord),
// rounded tips, an off-white edge, yellow pegs at the gaps, the red paddle that kicks on each peg, the mascot on the hub, names along
// each blade's centerline. An empty blade (no label) says "Spin again" over a hatch.
//   prizeWheelHtml({ labels, text = true, landed = null, offset = 0.5, motion, mascot, label })
//     labels  up to 10 names (null or "" = an empty "Spin again" blade); text: false draws a plain wheel (cards, thumbnails)
//     landed  a blade index to show it already landed (with offset, 0–1 across the blade)
//     mascot  the hub art: the mascot's inner SVG (default: the page's #bt-mascot-tpl)
//   wheelSpin(el, { pickIndex, offset, spins, durationMs, startAt, now, motion, onTick, onDone })
//     A Prize Wheel spin decided by the server: from rest it turns `spins` whole turns plus the angle that puts `offset` of blade
//     `pickIndex` under the paddle, easing out over durationMs from startAt (epoch ms). Every viewer computes the same angle for the
//     same moment, so they all see the same spin; a late joiner joins mid-spin, and after the end it just shows the result.
//     now() is the clock (default Date.now; pass a server-corrected one). onTick() runs once per peg (the paddle kicks; play a
//     sound there). Reduced motion (unless motion or data-motion="always"): no spin; it fades in on the result. Returns cancel().
//     from (deg) is where it starts turning (default 0, at rest); wheelPlay passes the last spin's resting angle.
//   wheelPlay(el, spins, { now, motion, onTick, onLand, onDone })   a draw's chained spins in order (the server's list: all but the last landed on
//     Spin again), each from where the last rested; spins already over are skipped. spinEnd(spin, from) is where a spin rests.
//   wheelShow(el, { pickIndex, offset })   put a Prize Wheel straight on a result (data-state landed)
//   wheelReset(el)                         back to rest (data-state idle)
import { escapeHtml as esc } from "./dom.js";

const R = 92, C = 100;
const handleOf = (h) => String(h || "").replace(/^@/, "");
const gone = (s) => s === "replaced" || s === "out";
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const short = (h) => (h.length > 13 ? h.slice(0, 12) + "…" : h);

function rimOf(names, picks) {
  const list = [...new Set((names || []).map(handleOf).filter(Boolean))].slice(0, 12);
  for (const p of picks || []) { const h = handleOf(p.handle); if (h && !list.includes(h)) { if (list.length < 12) list.push(h); else list[list.length - 1] = h; } }
  while (list.length && list.length < 6) list.push(...list.slice(0, 6 - list.length));   // a wheel needs a few segments; names repeat
  return list.length ? list : ["?", "?", "?", "?", "?", "?"];
}
/** The rotation (deg) that puts segment k of n under the pointer at the top, at least two turns past `prev`. */
function rotFor(k, n, prev = 0) {
  const centre = ((k + 0.5) / n) * 360;
  return 360 * Math.ceil(prev / 360) + 720 + (360 - centre);
}

export function wheelHtml({ names = [], picks = [], state = "idle", shown = null, motion = false } = {}) {
  const rim = rimOf(names, picks), n = rim.length;
  const vis = state === "idle" ? [] : (picks || []).slice(0, shown == null ? undefined : shown);
  const lit = new Set(vis.filter((p) => !gone(p.status)).map((p) => handleOf(p.handle)));
  const last = [...vis].reverse().find((p) => !gone(p.status));
  const rot = last ? rotFor(rim.indexOf(handleOf(last.handle)), n) % 360 : 0;
  const seg = rim.map((h, i) => {
    const a0 = (i / n) * 2 * Math.PI - Math.PI / 2, a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2, am = (a0 + a1) / 2;
    const p = (a) => `${(C + R * Math.cos(a)).toFixed(2)} ${(C + R * Math.sin(a)).toFixed(2)}`;
    const tx = (C + 56 * Math.cos(am)).toFixed(2), ty = (C + 56 * Math.sin(am)).toFixed(2);
    return `<g class="bt-wheel-seg${lit.has(h) ? " is-hit" : ""}" data-i="${i}" data-h="${esc(h)}"><path class="s${i % 2}" d="M${C} ${C} L${p(a0)} A${R} ${R} 0 0 1 ${p(a1)}Z"/>`
      + `<text x="${tx}" y="${ty}" transform="rotate(${((am * 180) / Math.PI).toFixed(1)} ${tx} ${ty})">@${esc(short(h))}</text></g>`;
  }).join("");
  const label = lit.size ? `Wheel: ${[...lit].map((h) => "@" + h).join(", ")} picked` : "Wheel of names";
  return `<div class="bt-wheel" data-state="${esc(state)}"${motion ? ' data-motion="always"' : ""} role="img" aria-label="${esc(label)}" data-rot="${rot}">`
    + `<svg viewBox="0 0 200 200" aria-hidden="true" focusable="false"><g class="bt-wheel-spin" style="--rot:${rot}deg">${seg}<circle class="bt-wheel-rim" cx="${C}" cy="${C}" r="${R}"/></g>`
    + `<circle class="bt-wheel-hub" cx="${C}" cy="${C}" r="16"/><text class="bt-wheel-hub-t" x="${C}" y="${C + 1}">🔥</text><path class="bt-wheel-ptr" d="M${C} 14 L${C + 7} 1 L${C - 7} 1Z"/></svg></div>`;
}

export function wheelSpin(el, opts = {}) {
  const box = el && (el.matches(".bt-wheel") ? el : el.querySelector(".bt-wheel"));
  if (box && box.classList.contains("bt-wheel--prize") && typeof opts.pickIndex === "number") return prizeSpin(box, opts);
  return namesSpin(box, opts);
}

function namesSpin(box, { picks = [], from = 0, motion = false, spinMs = 4200, onTick = null, onDone = null } = {}) {
  if (!box) { if (onDone) onDone(); return () => {}; }
  const spin = box.querySelector(".bt-wheel-spin");
  const segs = [...box.querySelectorAll(".bt-wheel-seg")];
  const n = segs.length || 1;
  const live = (picks || []).filter((p) => !gone(p.status));
  const idx = (h) => segs.findIndex((s) => s.dataset.h === handleOf(h));
  const light = (h) => { const s = segs[idx(h)]; if (s) s.classList.add("is-hit"); };
  let rot = Number(box.dataset.rot) || 0;
  const turn = (h, animate) => {
    const k = idx(h);
    if (k < 0 || !spin) return;
    rot = animate ? rotFor(k, n, rot) : rotFor(k, n) % 360;
    box.dataset.rot = String(rot);
    spin.style.setProperty("--rot", `${rot}deg`);
  };
  const todo = live.slice(from);
  if (!todo.length || (reduced() && !motion && box.dataset.motion !== "always")) {
    for (const p of live) light(p.handle);
    if (live.length) turn(live[live.length - 1].handle, false);
    box.dataset.state = live.length ? "landed" : "idle";
    if (onDone) onDone();
    return () => {};
  }
  let i = 0, timer = 0, stopped = false, raf = 0;
  box.dataset.state = "spinning";
  // onTick: follow the CSS transition frame by frame and report each segment edge that passes the pointer.
  const follow = (ms) => {
    if (!onTick || !spin) return;
    const seg = 360 / n, end = performance.now() + ms + 100;
    const angle = () => { const m = getComputedStyle(spin).transform; const v = /matrix\(([^)]+)\)/.exec(m); if (!v) return 0; const [a, b] = v[1].split(",").map(Number); return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360; };
    let prev = Math.floor(angle() / seg);
    const frame = () => {
      if (stopped) return;
      const k = Math.floor(angle() / seg);
      if (k !== prev) { prev = k; try { onTick(); } catch { /* a listener never stops the wheel */ } }
      if (performance.now() < end) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  };
  const next = () => {
    if (stopped) return;
    if (i >= todo.length) { box.dataset.state = "landed"; if (onDone) onDone(); return; }
    const p = todo[i++];
    turn(p.handle, true);
    follow(spinMs);
    timer = setTimeout(() => { light(p.handle); timer = setTimeout(next, 900); }, spinMs);
  };
  timer = setTimeout(next, 120);
  return () => { stopped = true; clearTimeout(timer); cancelAnimationFrame(raf); };
}

// ---------------------------------------------------------------- the Prize Wheel (F2 Gentle fan) ----------------------------------------------------------------
const BLADES = 10, STEP = 360 / BLADES;
const F2 = { T: -7, K: 0.11 };                 // hub end turned −7°, curve depth 0.11 of the chord
const RI = 46, RS = 300, RH = 60, RP = 309;    // hub, rim (blade ends), hub disc, pegs
const DARK_INK = new Set([3, 4, 5, 6, 9]);     // blades light enough for dark names (--bt-wheel-4 … 7 and 10)
const cart = (r, deg) => { const a = (deg * Math.PI) / 180; return [Math.sin(a) * r, -Math.cos(a) * r]; };
const polar = (p) => (Math.atan2(p[0], -p[1]) * 180) / Math.PI;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const fmt = (p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
/** One circular arc from H to P, bulging counterclockwise by K of the chord, as n+1 points. */
function arcPts(H, P, K, n) {
  const dx = P[0] - H[0], dy = P[1] - H[1], c = Math.hypot(dx, dy);
  const M = [(H[0] + P[0]) / 2, (H[1] + P[1]) / 2];
  let nx = -dy / c, ny = dx / c;
  const s = K * c;
  const a1 = polar([M[0] + nx * s, M[1] + ny * s]), a2 = polar([M[0] - nx * s, M[1] - ny * s]);
  const diff = (x, y) => { let d = x - y; while (d > 180) d -= 360; while (d < -180) d += 360; return d; };
  if (diff(a1, a2) > 0) { nx = -nx; ny = -ny; }
  const R = (c * c) / 4 / (2 * s) + s / 2;
  const C = [M[0] + nx * (s - R), M[1] + ny * (s - R)];
  const b0 = Math.atan2(H[1] - C[1], H[0] - C[0]), b1 = Math.atan2(P[1] - C[1], P[0] - C[0]);
  let d = b1 - b0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  return Array.from({ length: n + 1 }, (_, t) => [C[0] + R * Math.cos(b0 + (d * t) / n), C[1] + R * Math.sin(b0 + (d * t) / n)]);
}
const edgePts = (i) => arcPts(cart(RI, i * STEP + F2.T), cart(RS, i * STEP), F2.K, 40);   // hub → rim
const circPts = (r, from, to, n) => Array.from({ length: n + 1 }, (_, t) => cart(r, from + ((to - from) * t) / n));
function trimStart(pts, d) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = dist(pts[i - 1], pts[i]);
    if (acc + l >= d) { const f = (d - acc) / l; return [[pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f], ...pts.slice(i)]; }
    acc += l;
  }
  return [pts[pts.length - 1]];
}
const trimEnd = (pts, d) => trimStart([...pts].reverse(), d).reverse();
/** Blade i's outline with rounded corners (18 at the rim tips, 4 at the hub). */
function bladeD(i) {
  const s1 = edgePts(i).reverse(), s2 = circPts(RI, i * STEP + F2.T, (i + 1) * STEP + F2.T, 8), s3 = edgePts(i + 1), s4 = circPts(RS, (i + 1) * STEP, i * STEP, 24);
  const rr = 18, rh = 4;
  const T1 = trimEnd(trimStart(s1, rr), rh), T2 = trimEnd(trimStart(s2, rh), rh), T3 = trimEnd(trimStart(s3, rh), rr), T4 = trimEnd(trimStart(s4, rr), rr);
  const run = (pts) => pts.slice(1).map((p) => " L" + fmt(p)).join("");
  return `M${fmt(T1[0])}${run(T1)} Q${fmt(s1[s1.length - 1])} ${fmt(T2[0])}${run(T2)} Q${fmt(s2[s2.length - 1])} ${fmt(T3[0])}${run(T3)} Q${fmt(s3[s3.length - 1])} ${fmt(T4[0])}${run(T4)} Q${fmt(s4[s4.length - 1])} ${fmt(T1[0])} Z`;
}
/** Blade i's centerline (where its name runs), clipped to the space between the hub and the pegs. */
function midD(i) {
  const pts = arcPts(cart(RI, i * STEP + STEP / 2 + F2.T), cart(RS, i * STEP + STEP / 2), F2.K, 60).filter((p) => { const r = Math.hypot(p[0], p[1]); return r >= 92 && r <= 287; });
  return "M" + pts.map(fmt).join(" L");
}
const SHAPES = Array.from({ length: BLADES }, (_, i) => ({ blade: bladeD(i), mid: midD(i), peg: cart(RP, i * STEP) }));
let uidN = 0;

/** The page's mascot shapes (the inner SVG of #bt-mascot-tpl), or "" when there is none. */
function pageMascot() {
  if (typeof document === "undefined") return "";
  const t = document.getElementById("bt-mascot-tpl");
  const svg = t && t.content ? t.content.querySelector("svg") : null;
  return svg ? svg.innerHTML : "";
}
/** The rotation (deg, clockwise) that puts `offset` (0–1) of blade k under the paddle at the top. */
export function prizeAngle(k, offset = 0.5) { return (((360 - (k + offset) * STEP) % 360) + 360) % 360; }

export function prizeWheelHtml({ labels = [], text = true, landed = null, offset = 0.5, motion = false, mascot = null, label = "" } = {}) {
  const id = `btpw${++uidN}`, L = Array.from({ length: BLADES }, (_, i) => (labels[i] == null ? "" : String(labels[i])));
  let blades = "", hatch = "", defs = "", names = "", pegs = "";
  SHAPES.forEach((s, i) => {
    const empty = text && !L[i];
    blades += `<path class="bt-wheel-blade${landed === i ? " is-win" : ""}" data-i="${i}" d="${s.blade}" style="fill:var(--bt-wheel-${i + 1})"/>`;
    if (empty) hatch += `<path class="bt-wheel-hatch" d="${s.blade}" fill="url(#${id}-h)"/>`;
    if (text) {
      defs += `<path id="${id}-m${i}" d="${s.mid}"/>`;
      const t = empty ? "Spin again" : L[i];
      const fs = Math.min(20, Math.floor(196 / (Math.max(t.length, 7) * 0.58)));
      names += `<text class="bt-wheel-name${empty ? " is-empty" : ""}${DARK_INK.has(i) ? " is-dark" : ""}${landed === i ? " is-win" : ""}" data-i="${i}" font-size="${fs}" dominant-baseline="central"><textPath href="#${id}-m${i}" startOffset="100%" text-anchor="end">${esc(t)}</textPath></text>`;
    }
    pegs += `<circle class="bt-wheel-peg" r="7.5" cx="${s.peg[0].toFixed(2)}" cy="${s.peg[1].toFixed(2)}"/>`;
  });
  const art = mascot == null ? pageMascot() : mascot;
  const rot = landed == null ? 0 : prizeAngle(landed, offset);
  const count = L.filter(Boolean).length;
  const aria = label || (!text ? "Prize Wheel" : landed != null ? `Prize Wheel landed on ${L[landed] || "Spin again"}` : `Prize Wheel with ${count} name${count === 1 ? "" : "s"}`);
  return `<div class="bt-wheel bt-wheel--prize" data-state="${landed == null ? "idle" : "landed"}"${motion ? ' data-motion="always"' : ""} data-rot="${rot}"${landed == null ? "" : ` data-win="${landed}"`} role="img" aria-label="${esc(aria)}">`
    + `<svg viewBox="-370 -405 740 780" aria-hidden="true" focusable="false"><defs><pattern id="${id}-h" class="bt-wheel-hatch-p" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect class="a" width="14" height="14"/><rect class="b" width="6" height="14"/></pattern>${defs}</defs>`
    + `<circle class="bt-wheel-rim" r="322"/>`
    + `<g class="bt-wheel-rot" transform="rotate(${rot.toFixed(3)})"><g class="bt-wheel-blades">${blades}</g><g class="bt-wheel-hatches">${hatch}</g><g class="bt-wheel-names">${names}</g><g>${pegs}</g>`
    + `<circle class="bt-wheel-hubdisc" r="${RH}"/><circle class="bt-wheel-hubring" r="53"/><circle class="bt-wheel-hubface" r="47"/>${art ? `<g class="bt-mascot" transform="translate(-41 -69.2) scale(0.4)">${art}</g>` : ""}</g>`
    + `<g class="bt-wheel-flapg"><path class="bt-wheel-flap-blade" d="M-11 -372 L11 -372 L3.5 -288 Q0 -282 -3.5 -288 Z"/><circle class="bt-wheel-flap" cy="-372" r="27"/><circle class="bt-wheel-flap-pin" cy="-372" r="7"/></g>`
    + `</svg></div>`;
}

function prizeParts(el) {
  const box = el && (el.matches(".bt-wheel--prize") ? el : el.querySelector(".bt-wheel--prize"));
  if (!box) return null;
  return { box, rot: box.querySelector(".bt-wheel-rot"), flap: box.querySelector(".bt-wheel-flapg") };
}
const setRot = (p, deg, flap = 0) => {
  p.rot.setAttribute("transform", `rotate(${deg.toFixed(3)})`);
  p.flap.setAttribute("transform", `rotate(${flap.toFixed(2)} 0 -372)`);
  p.box.dataset.rot = String(((deg % 360) + 360) % 360);
};
function unmark(p) {
  delete p.box.dataset.win;
  p.box.querySelectorAll(".is-win").forEach((e) => e.classList.remove("is-win"));
}
function mark(p, k) {
  p.box.dataset.win = String(k);
  const b = p.box.querySelector(`.bt-wheel-blade[data-i="${k}"]`);
  if (b) { b.classList.add("is-win"); b.parentNode.appendChild(b); }   // on top, so its gold edge isn't covered by a neighbour
  const t = p.box.querySelector(`.bt-wheel-name[data-i="${k}"]`);
  if (t) t.classList.add("is-win");
  const n = p.box.querySelector(`.bt-wheel-name[data-i="${k}"] textPath`);
  p.box.setAttribute("aria-label", `Prize Wheel landed on ${n ? n.textContent : "this blade"}`);
}

export function wheelShow(el, { pickIndex, offset = 0.5 } = {}) {
  const p = prizeParts(el);
  if (!p) return;
  unmark(p);
  setRot(p, prizeAngle(pickIndex, offset));
  p.box.dataset.state = "landed";
  mark(p, pickIndex);
}
export function wheelReset(el) {
  const p = prizeParts(el);
  if (!p) return;
  unmark(p);
  setRot(p, 0);
  p.box.dataset.state = "idle";
}

const easeOut = (t) => 1 - Math.pow(1 - t, 4);
/** Where a spin ends (deg, absolute) when it starts at "from": at least "spins" turns on, resting with "offset" of blade k under the paddle. */
export function spinEnd({ pickIndex, offset = 0.5, spins = 5 }, from = 0) {
  const k = ((Math.round(pickIndex) % BLADES) + BLADES) % BLADES, turns = Math.max(1, Math.round(spins));
  let end = from - (((from % 360) + 360) % 360) + 360 * turns + prizeAngle(k, offset);
  if (end - from < 360 * (turns - 0.5)) end += 360;
  return end;
}
function prizeSpin(box, { pickIndex, offset = 0.5, spins = 5, durationMs = 7800, startAt = null, from = 0, now = Date.now, motion = false, onTick = null, onDone = null } = {}) {
  const p = prizeParts(box);
  const k = ((Math.round(pickIndex) % BLADES) + BLADES) % BLADES;
  const end = spinEnd({ pickIndex: k, offset, spins }, from);
  const t0 = startAt == null ? now() : Number(startAt);
  const dur = Math.max(1, Number(durationMs) || 7800);
  const finish = () => { setRot(p, end); p.box.dataset.state = "landed"; mark(p, k); if (onDone) onDone(k); };
  const tick = () => { if (onTick) { try { onTick(); } catch { /* a listener never stops the wheel */ } } };
  unmark(p);
  const still = !motion && p.box.dataset.motion !== "always" && reduced();
  if (still || now() >= t0 + dur) {   // reduced motion, or a late joiner after the end: just the result (a fade under reduced motion)
    if (still) { p.box.classList.remove("is-jump"); void p.box.offsetWidth; p.box.classList.add("is-jump"); }
    finish();
    return () => {};
  }
  let raf = 0, timer = 0, stopped = false, flap = 0;
  const at = (t) => from + (end - from) * easeOut(t);
  let last = Math.floor(at(Math.max(0, (now() - t0) / dur)) / STEP);
  setRot(p, at(Math.max(0, (now() - t0) / dur)));
  p.box.dataset.state = "spinning";
  const frame = () => {
    if (stopped) return;
    const t = Math.min(1, Math.max(0, (now() - t0) / dur));
    const deg = at(t);
    const peg = Math.floor(deg / STEP);
    if (peg !== last) { last = peg; flap = -20; tick(); } else flap *= 0.8;
    setRot(p, deg, flap);
    if (t < 1) raf = requestAnimationFrame(frame); else finish();
  };
  const begin = () => { if (!stopped) raf = requestAnimationFrame(frame); };
  const wait = t0 - now();
  if (wait > 0) { p.box.dataset.state = "idle"; setRot(p, from); timer = setTimeout(begin, wait); } else begin();
  return () => { stopped = true; cancelAnimationFrame(raf); clearTimeout(timer); };
}

/**
 * Plays the server's chained spins (a draw's spins: every one but the last landed on "Spin again"), in order, each starting where the last one rested.
 * Spins already over are skipped straight to their resting angle, so a viewer who opens the page late sees the same wheel as everyone else.
 * onLand(spin, index) runs as each spin lands (with spin.again for a Spin again); onDone(pickIndex) after the last. Returns cancel().
 */
export function wheelPlay(el, spins = [], { now = Date.now, motion = false, onTick = null, onLand = null, onDone = null } = {}) {
  const list = (spins || []).filter((s) => s && Number.isFinite(s.pickIndex));
  if (!list.length) return () => {};
  let from = 0, i = 0, stop = () => {}, dead = false;
  for (; i < list.length - 1 && now() >= list[i].startAt + list[i].durationMs; i++) from = spinEnd(list[i], from);   // already over: no animation
  const next = () => {
    if (dead) return;
    const s = list[i], last = i === list.length - 1;
    stop = wheelSpin(el, { ...s, from, now, motion, onTick, onDone: (k) => {
      if (dead) return;
      from = spinEnd(s, from);
      if (onLand) { try { onLand(s, i); } catch { /* a listener never stops the wheel */ } }
      if (last) { if (onDone) onDone(k); return; }
      i++; next();
    } });
  };
  next();
  return () => { dead = true; stop(); };
}
