// shared/ui-kit/kit-zoomframe.js — the ".bt-zoomframe" section of the UI Kit page (/dev/ui-kit): the pan and zoom viewport (shared/ui/zoomframe.js;
// docs/specs/tech-stack.md §8). A live frame to try (click, then scroll; drag; pinch; double-tap; + / − / FIT; the minimap while zoomed; keyboard
// + − 0; "Fly to" eases to a node, or jumps under reduced motion), then the states side by side: at rest with the hint, active, zoomed with the
// minimap, panning. ui-kit.js appends zoomFrameKitHtml() and calls initZoomFrameKit(mount).
import { zoomFrameHtml, initZoomFrame } from "../ui/zoomframe.js";

const W = 1600, H = 1000;
const NODES = [["A", 260, 260], ["B", 800, 200], ["C", 1340, 300], ["D", 420, 760], ["E", 1000, 700], ["F", 1380, 820]];
const LINKS = [[0, 1], [1, 2], [0, 3], [1, 4], [3, 4], [4, 5], [2, 5]];

/** A small drawing for the demo frames: a grid and six linked nodes. uid keeps the minimap's <use> target unique. */
function drawing(uid) {
  let grid = "";
  for (let x = 0; x <= W; x += 100) grid += `M${x} 0 V${H} `;
  for (let y = 0; y <= H; y += 100) grid += `M0 ${y} H${W} `;
  const links = LINKS.map(([a, b]) => `<path class="kit-zf-link" d="M${NODES[a][1]} ${NODES[a][2]} L${NODES[b][1]} ${NODES[b][2]}"/>`).join("");
  const nodes = NODES.map(([t, x, y]) => `<g class="kit-zf-node" data-node="${t}" transform="translate(${x} ${y})"><circle r="56"/><text text-anchor="middle" y="16">${t}</text></g>`).join("");
  return `<g id="kit-zf-${uid}"><path class="kit-zf-grid" d="${grid}"/>${links}${nodes}</g>`;
}

export function zoomFrameKitHtml() {
  const cell = (label, state, uid) => `<div class="kit-zf-cell"><p class="kit-sub">${label}</p><div data-kit-zf-state="${state}" data-uid="${uid}">${zoomFrameHtml({ width: W, height: H, label: `Zoom frame, ${label}`, inner: drawing(uid) })}</div></div>`;
  return `
  <section class="kit-section" id="kit-zoomframe">
    <h2 class="kit-h">Zoom frame (.bt-zoomframe)</h2>
    <p class="kit-p">A pan and zoom viewport for SVG drawn in a fixed viewBox (<span class="kit-code">shared/ui/zoomframe.js</span>: zoomFrameHtml, initZoomFrame). The wheel zooms only after a click inside, so it never hijacks page scrolling. Drag to pan, pinch, double-tap to zoom in, + / − / FIT, keyboard + − 0, a minimap while zoomed, and <span class="kit-code">flyTo()</span> eases to a point (it jumps under reduced motion). States: <span class="kit-code">.is-active</span>, <span class="kit-code">.is-panning</span>, <span class="kit-code">.is-zoomed</span>. Used by the Tech Stack wiring diagram.</p>
    <div class="kit-zf-live" data-kit-zf-live>
      ${zoomFrameHtml({ width: W, height: H, label: "Zoom frame demo", inner: drawing("live") })}
      <div class="kit-zf-acts"><span class="kit-sub">Fly to</span>${NODES.map(([t]) => `<button type="button" class="bt-chip bt-chip--small" data-fly="${t}">${t}</button>`).join("")}<span class="bt-meta" data-kit-zf-tap></span></div>
    </div>
    <div class="kit-zf-grid4">
      ${cell("At rest, hint showing", "rest", "s1")}
      ${cell("Active (clicked: the wheel zooms)", "active", "s2")}
      ${cell("Zoomed, minimap showing", "zoomed", "s3")}
      ${cell("Panning (dragging)", "panning", "s4")}
    </div>
  </section>`;
}

export function initZoomFrameKit(mount) {
  const live = mount.querySelector("[data-kit-zf-live]");
  if (live) {
    const note = live.querySelector("[data-kit-zf-tap]");
    const zf = initZoomFrame(live.querySelector(".bt-zoomframe"), { width: W, height: H, itemSelector: ".kit-zf-node",
      onTap: (_e, item) => { note.textContent = item ? `Tapped node ${item.dataset.node}` : ""; } });
    zf.setMap(drawing("live-map"));
    live.querySelectorAll("[data-fly]").forEach((b) => b.addEventListener("click", () => { const n = NODES.find((x) => x[0] === b.dataset.fly); zf.flyTo(n[1], n[2], 600); }));
  }
  mount.querySelectorAll("[data-kit-zf-state]").forEach((box) => {
    const frame = box.querySelector(".bt-zoomframe"), state = box.dataset.kitZfState;
    const zf = initZoomFrame(frame, { width: W, height: H, itemSelector: ".kit-zf-node" });
    zf.setMap(drawing(box.dataset.uid + "-map"));
    if (state === "active") frame.classList.add("is-active");
    if (state === "zoomed" || state === "panning") zf.setView({ x: 500, y: 300, w: 640 });
    if (state === "panning") frame.classList.add("is-active", "is-panning");
    // the static state frames stay in their state: clicks elsewhere would clear .is-active, so put it back
    if (state === "active" || state === "panning") document.addEventListener("pointerdown", () => requestAnimationFrame(() => frame.classList.add("is-active")));
  });
}
