// shared/ui/scrubber.js — .bt-scrubber (docs/specs/base-camp.md Addendum 3; design-system.md §5 ".bt-scrubber"): a timeline you scrub through
// one step at a time. A track with an optional curve (and the area under it), era bands with their names, milestone dots (a big one for the
// moment that matters most), an optional "Today" point and a purple thumb; tick labels under it. role="slider" on the track with aria-valuetext
// from each step's text; pointer drag or tap, arrow keys (Shift + arrow: 3 steps), Page Up / Down, Home, End. Reduced motion: no transitions
// (the CSS). Draws itself as SVG in a 0–1000 × 0–100 space (preserveAspectRatio none), so it follows the width it's given. The colours come from
// the kit (gold curve, band tones, lime big dot, purple thumb); a page only passes the data.
//
//   scrubber(el, { steps, index?, label, curve?, bands?, dots?, ticks?, onInput? }) → { set(i, { silent }), index(), update(opts), destroy() }
//     steps   [{ text, x? }]      text: aria-valuetext ("June 2025: 2,584 followers"); x 0–1 (default: evenly spread)
//     curve   [{ x, y }]          0–1 (y up), drawn as a line with the area under it; optional
//     bands   [{ from, to, label, tone }]   x 0–1; tone "gray" | "gold" | "plain" | "lime" (default plain)
//     dots    [{ x, y, big?, today? }]      milestone dots (y 0–1, default on the curve's baseline); big: larger and lime; today: the last point
//     ticks   [{ x, label }]      labels under the track
//     onInput (i, how)            how: "drag" | "tap" | "key"; not called for set()
const NS = "http://www.w3.org/2000/svg";
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const TONES = ["gray", "gold", "plain", "lime"];

export function scrubber(el, opts) {
  let o = { ...opts };
  let cur = Math.max(0, Math.min((o.steps || []).length - 1, o.index ?? 0));
  el.classList.add("bt-scrubber");
  // .bt-scrubber-in is inset from the track's ends so the end dots and the thumb are never clipped; the ticks use the same inset
  el.innerHTML = `<div class="bt-scrubber-track" tabindex="0" role="slider"><div class="bt-scrubber-in"><svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true" focusable="false"></svg><div class="bt-scrubber-labels" aria-hidden="true"></div><span class="bt-scrubber-thumb" aria-hidden="true"></span></div></div><div class="bt-scrubber-ticks" aria-hidden="true"></div>`;
  const track = el.querySelector(".bt-scrubber-track"), inner = track.querySelector(".bt-scrubber-in"), svg = track.querySelector("svg"), labels = track.querySelector(".bt-scrubber-labels");
  const thumb = track.querySelector(".bt-scrubber-thumb"), ticks = el.querySelector(".bt-scrubber-ticks");
  const xs = () => o.steps.map((s, i) => (typeof s.x === "number" ? s.x : o.steps.length > 1 ? i / (o.steps.length - 1) : 0));
  const X = (x) => (x * 1000).toFixed(1), Y = (y) => (96 - y * 80).toFixed(1);   // leave room above for band names

  function draw() {
    track.setAttribute("aria-label", o.label || "Timeline");
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", String(Math.max(0, o.steps.length - 1)));
    // a band that touches an end runs on to the track's edge (past the inset; the track clips it)
    const bands = (o.bands || []).map((b) => { const x0 = b.from <= 0 ? -0.2 : b.from, x1 = b.to >= 1 ? 1.2 : b.to; return `<rect class="bt-scrubber-band bt-scrubber-band--${TONES.includes(b.tone) ? b.tone : "plain"}" x="${X(x0)}" y="0" width="${Math.max(0, (x1 - x0) * 1000).toFixed(1)}" height="100"/>`; }).join("");
    const c = o.curve || [];
    const line = c.length > 1 ? c.map((p, i) => `${i ? "L" : "M"}${X(p.x)} ${Y(p.y)}`).join("") : "";
    const area = line ? `<path class="bt-scrubber-area" d="${line} L${X(c[c.length - 1].x)} 100 L${X(c[0].x)} 100Z"/>` : "";
    svg.innerHTML = `${bands}<rect class="bt-scrubber-played" x="-200" y="0" width="0" height="100"/>${area}${line ? `<path class="bt-scrubber-line" d="${line}"/>` : ""}`;
    // dots and band names are HTML over the SVG, so they stay round and crisp at any width
    labels.innerHTML = (o.bands || []).filter((b) => b.label).map((b) => `<span class="bt-scrubber-bandk" style="left:${(b.from * 100).toFixed(2)}%;max-width:${((b.to - b.from) * 100).toFixed(2)}%">${esc(b.label)}</span>`).join("")
      + (o.dots || []).map((d) => `<i class="bt-scrubber-dot${d.big ? " is-big" : ""}${d.today ? " is-today" : ""}" style="left:${(d.x * 100).toFixed(2)}%;top:${Y(d.y ?? 0)}%"></i>`).join("");
    ticks.innerHTML = (o.ticks || []).map((t) => `<span class="${t.x < 0.04 ? "is-start" : t.x > 0.96 ? "is-end" : ""}" style="left:${(t.x * 100).toFixed(2)}%">${esc(t.label)}</span>`).join("");
    fitTicks();
    place();
  }
  /** Tick labels that would overlap are hidden (the later one, except the last, which always shows). */
  function fitTicks() {
    const list = [...ticks.children];
    list.forEach((t) => (t.hidden = false));
    let prevRight = -Infinity;
    list.forEach((t, i) => {
      const r = t.getBoundingClientRect();
      if (!r.width) return;
      const last = i === list.length - 1;
      if (r.left < prevRight + 8) {
        if (last) { const prev = list.slice(0, i).reverse().find((x) => !x.hidden); if (prev) prev.hidden = true; }
        else { t.hidden = true; return; }
      }
      prevRight = r.right;
    });
  }
  function place() {
    const x = xs()[cur] ?? 0;
    thumb.style.left = `${(x * 100).toFixed(3)}%`;
    const played = svg.querySelector(".bt-scrubber-played");
    if (played) played.setAttribute("width", String(x * 1000 + 200));
    track.setAttribute("aria-valuenow", String(cur));
    track.setAttribute("aria-valuetext", o.steps[cur]?.text || "");
  }
  function go(i, how) {
    const n = Math.max(0, Math.min(o.steps.length - 1, i));
    if (n === cur) return;
    cur = n; place();
    if (how && o.onInput) o.onInput(cur, how);
  }
  /** The step nearest to a pointer position. */
  function nearest(clientX) {
    const r = inner.getBoundingClientRect(), f = (clientX - r.left) / (r.width || 1);
    let best = 0, bd = Infinity;
    xs().forEach((x, i) => { const d = Math.abs(x - f); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  let dragging = false, moved = false;
  const onDown = (e) => { if (e.button !== undefined && e.button !== 0) return; dragging = true; moved = false; track.setPointerCapture?.(e.pointerId); track.classList.add("is-dragging"); go(nearest(e.clientX), "tap"); };
  const onMove = (e) => { if (!dragging) return; moved = true; go(nearest(e.clientX), "drag"); };
  const onUp = (e) => { if (!dragging) return; dragging = false; track.classList.remove("is-dragging"); track.releasePointerCapture?.(e.pointerId); };
  const onKey = (e) => {
    const k = e.key, step = e.shiftKey ? 3 : 1;
    let i = null;
    if (k === "ArrowRight" || k === "ArrowUp") i = cur + step;
    else if (k === "ArrowLeft" || k === "ArrowDown") i = cur - step;
    else if (k === "PageUp") i = cur + 3;
    else if (k === "PageDown") i = cur - 3;
    else if (k === "Home") i = 0;
    else if (k === "End") i = o.steps.length - 1;
    if (i == null) return;
    e.preventDefault();
    go(i, "key");
  };
  track.addEventListener("pointerdown", onDown);
  track.addEventListener("pointermove", onMove);
  track.addEventListener("pointerup", onUp);
  track.addEventListener("pointercancel", onUp);
  track.addEventListener("keydown", onKey);
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => fitTicks()) : null;
  ro?.observe(el);
  draw();
  return {
    set(i, { silent = true } = {}) { const n = Math.max(0, Math.min(o.steps.length - 1, i)); cur = n; place(); if (!silent && o.onInput) o.onInput(cur, "set"); },
    index: () => cur,
    update(next) { o = { ...o, ...next }; cur = Math.max(0, Math.min(o.steps.length - 1, next.index ?? cur)); draw(); },
    destroy() { ro?.disconnect(); track.removeEventListener("pointerdown", onDown); track.removeEventListener("pointermove", onMove); track.removeEventListener("pointerup", onUp); track.removeEventListener("pointercancel", onUp); track.removeEventListener("keydown", onKey); el.innerHTML = ""; },
    get moved() { return moved; },
  };
}
