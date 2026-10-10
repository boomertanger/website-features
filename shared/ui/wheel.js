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
//   wheelSpin(el, { picks, from = 0, motion, spinMs = 4200, onDone })   spins to picks[from..] one by one, then data-state landed.
//     Returns cancel(). Reduced motion: it lands at once.
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

export function wheelSpin(el, { picks = [], from = 0, motion = false, spinMs = 4200, onDone = null } = {}) {
  const box = el && (el.matches(".bt-wheel") ? el : el.querySelector(".bt-wheel"));
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
  let i = 0, timer = 0, stopped = false;
  box.dataset.state = "spinning";
  const next = () => {
    if (stopped) return;
    if (i >= todo.length) { box.dataset.state = "landed"; if (onDone) onDone(); return; }
    const p = todo[i++];
    turn(p.handle, true);
    timer = setTimeout(() => { light(p.handle); timer = setTimeout(next, 900); }, spinMs);
  };
  timer = setTimeout(next, 120);
  return () => { stopped = true; clearTimeout(timer); };
}
