// shared/ui/zoomframe.js — .bt-zoomframe, a pan and zoom viewport for SVG content (docs/design-system.md §5 "Zoom frame"; docs/specs/tech-stack.md §8).
// Built for the Tech Stack wiring diagram; any SVG drawn in a fixed viewBox can use it. It never hijacks page scrolling: the wheel zooms only after a
// click (or tap) inside the frame, and a click anywhere else switches that off again.
//
//   zoomFrameHtml({ width, height, label, hint, svgClass, inner })
//                                  the markup: .bt-zoomframe[tabindex=-1] > svg.bt-zoomframe-view (role group, aria-label = label), the hint
//                                  (shown until the first click or zoom), the + / − / FIT buttons and the minimap (shown while zoomed).
//   initZoomFrame(frame, opts)     wires one frame and returns the controller below. opts:
//     width, height                the content's full viewBox (default 1600 × 1000)
//     minWidth                     the closest zoom, as a viewBox width (default width / 6)
//     itemSelector                 elements inside the svg that are tap targets (a double tap on one doesn't zoom)
//     onTap(event, item)           a click or tap that didn't pan; item is the itemSelector match, or null
//     onChange(vb)                 after every viewBox change
//     reduced()                    true to jump instead of easing (default: prefers-reduced-motion)
//   controller:
//     vb                           the current viewBox { x, y, w, h }
//     setView(vb), zoomAt(factor, x, y), flyTo(cx, cy, w), fit(), toSvg(clientX, clientY)
//     setMap(html)                 the minimap's content: a copy of the drawing (not a <use>: page-scoped styles don't reach inside a <use> copy);
//                                  the box is added after it
//     zoomed                       true while closer than the full view
// States on .bt-zoomframe: .is-active (the wheel zooms), .is-panning, .is-zoomed. Keyboard on the frame: + / = zoom in, - zoom out, 0 fit.

const RM = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function zoomFrameHtml({ width = 1600, height = 1000, label = "Diagram", hint = "Click, then scroll to zoom · drag to pan", svgClass = "", inner = "" } = {}) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  return `<div class="bt-zoomframe" tabindex="-1">`
    + `<svg class="bt-zoomframe-view${svgClass ? ` ${svgClass}` : ""}" viewBox="0 0 ${width} ${height}" role="group" aria-label="${esc(label)}">${inner}</svg>`
    + `<span class="bt-zoomframe-hint">${esc(hint)}</span>`
    + `<div class="bt-zoomframe-ctl"><button type="button" aria-label="Zoom in">+</button><button type="button" aria-label="Zoom out">−</button><button type="button" class="fit" aria-label="Fit the whole diagram">FIT</button></div>`
    + `<div class="bt-zoomframe-map" aria-hidden="true"><svg viewBox="0 0 ${width} ${height}"></svg></div></div>`;
}

export function initZoomFrame(frame, { width = 1600, height = 1000, minWidth = width / 6, itemSelector = null, onTap = null, onChange = null, reduced = RM } = {}) {
  const svg = frame.querySelector(".bt-zoomframe-view"), mapEl = frame.querySelector(".bt-zoomframe-map"), mapSvg = mapEl && mapEl.querySelector("svg");
  const [zi, zo, fitBtn] = frame.querySelectorAll(".bt-zoomframe-ctl button");
  const ratio = height / width;
  let fly = 0;
  const ctl = {
    vb: { x: 0, y: 0, w: width, h: height },
    get zoomed() { return ctl.vb.w < width - 1; },
    setView(vb) {
      const w = Math.min(Math.max(vb.w, minWidth), width), h = w * ratio;
      let x = vb.x, y = vb.y;
      if (w >= width - 1) { x = 0; y = 0; }
      else { x = Math.min(Math.max(x, -w * 0.2), width - w * 0.8); y = Math.min(Math.max(y, -h * 0.2), height - h * 0.8); }
      ctl.vb = { x, y, w, h };
      svg.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
      const box = mapSvg && mapSvg.querySelector(".bt-zoomframe-box");
      if (box) { box.setAttribute("x", x); box.setAttribute("y", y); box.setAttribute("width", w); box.setAttribute("height", h); }
      frame.classList.toggle("is-zoomed", ctl.zoomed);
      if (zi) zi.disabled = w <= minWidth + 1;
      if (zo) zo.disabled = w >= width - 1;
      if (onChange) onChange(ctl.vb);
    },
    toSvg(cx, cy) { const p = svg.createSVGPoint(); p.x = cx; p.y = cy; return p.matrixTransform(svg.getScreenCTM().inverse()); },
    zoomAt(f, px, py, from = ctl.vb) { const w = Math.min(Math.max(from.w * f, minWidth), width), k = w / from.w; ctl.setView({ x: px - (px - from.x) * k, y: py - (py - from.y) * k, w }); },
    flyTo(cx, cy, w = ctl.vb.w) {
      const to = { x: cx - w / 2, y: cy - (w * ratio) / 2, w }, from = { ...ctl.vb };
      cancelAnimationFrame(fly);
      if (reduced()) { ctl.setView(to); return; }
      const t0 = performance.now(), D = 450;
      const step = (now) => { const t = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - t, 3); ctl.setView({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e }); if (t < 1) fly = requestAnimationFrame(step); };
      fly = requestAnimationFrame(step);
    },
    fit() { ctl.flyTo(width / 2, height / 2, width); },
    setMap(html) { if (mapSvg) { mapSvg.innerHTML = `${html}<rect class="bt-zoomframe-box"/>`; ctl.setView(ctl.vb); } },
  };

  const centre = () => [ctl.vb.x + ctl.vb.w / 2, ctl.vb.y + ctl.vb.h / 2];
  zi && zi.addEventListener("click", () => ctl.zoomAt(0.7, ...centre()));
  zo && zo.addEventListener("click", () => ctl.zoomAt(1 / 0.7, ...centre()));
  fitBtn && fitBtn.addEventListener("click", () => ctl.fit());
  frame.addEventListener("keydown", (e) => {
    if (e.target.closest && itemSelector && e.target.closest(itemSelector) && !["+", "=", "-", "0"].includes(e.key)) return;
    if (e.key === "+" || e.key === "=") { e.preventDefault(); ctl.zoomAt(0.7, ...centre()); }
    else if (e.key === "-") { e.preventDefault(); ctl.zoomAt(1 / 0.7, ...centre()); }
    else if (e.key === "0") { e.preventDefault(); ctl.fit(); }
  });
  document.addEventListener("pointerdown", (e) => { if (!frame.contains(e.target)) frame.classList.remove("is-active"); });
  frame.addEventListener("wheel", (e) => {
    if (!frame.classList.contains("is-active")) return;   // page scrolling stays page scrolling until the frame is clicked
    e.preventDefault();
    const p = ctl.toSvg(e.clientX, e.clientY); ctl.zoomAt(Math.exp(e.deltaY * 0.0016), p.x, p.y);
  }, { passive: false });

  // drag, pinch, tap and double tap
  const P = new Map();
  let start = null, pinch = null, lastTap = 0, lastXY = [0, 0];
  svg.addEventListener("pointerdown", (e) => {
    frame.classList.add("is-active");
    if (e.isPrimary) { P.clear(); pinch = null; }   // a new first finger (or mouse): forget any pointer that never sent up or cancel
    svg.setPointerCapture(e.pointerId); P.set(e.pointerId, [e.clientX, e.clientY]);
    if (P.size === 1) start = { x: e.clientX, y: e.clientY, vb: { ...ctl.vb }, k: 1 / svg.getScreenCTM().a, moved: false, item: itemSelector ? e.target.closest(itemSelector) : null };
    if (P.size === 2) { const [a, b] = [...P.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), mid: ctl.toSvg((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), vb: { ...ctl.vb } }; if (start) start.moved = true; }
  });
  svg.addEventListener("pointermove", (e) => {
    if (!P.has(e.pointerId)) return; P.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && P.size >= 2) { const [a, b] = [...P.values()]; ctl.zoomAt(pinch.d / Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])), pinch.mid.x, pinch.mid.y, pinch.vb); return; }
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!start.moved && Math.hypot(dx, dy) > 5) { start.moved = true; frame.classList.add("is-panning"); }
    if (start.moved && ctl.zoomed) ctl.setView({ x: start.vb.x - dx * start.k, y: start.vb.y - dy * start.k, w: start.vb.w });
  });
  const up = (e) => {
    if (!P.has(e.pointerId)) return; P.delete(e.pointerId); frame.classList.remove("is-panning");
    if (P.size < 2) pinch = null;
    if (P.size === 0 && start) {
      if (!start.moved && e.type === "pointerup") {
        const now = performance.now();
        if (now - lastTap < 300 && Math.hypot(e.clientX - lastXY[0], e.clientY - lastXY[1]) < 24 && !start.item) { const p = ctl.toSvg(e.clientX, e.clientY); ctl.zoomAt(0.55, p.x, p.y); lastTap = 0; }
        else { lastTap = now; lastXY = [e.clientX, e.clientY]; if (onTap) onTap(e, start.item); }
      }
      start = null;
    }
  };
  svg.addEventListener("pointerup", up); svg.addEventListener("pointercancel", up); svg.addEventListener("lostpointercapture", up);
  mapEl && mapEl.addEventListener("pointerdown", (e) => { e.stopPropagation(); const r = mapEl.getBoundingClientRect(); ctl.flyTo(((e.clientX - r.left) / r.width) * width, ((e.clientY - r.top) / r.height) * height); });

  ctl.setView(ctl.vb);
  return ctl;
}
