// shared/ui/slider.js — .bt-slider, the L4 layout of a week of doors (docs/design-system.md §5 "Scream Planner pieces").
// One markup, two looks decided by the container (bt): above 640px a row of seven cells; at 640px and below a left-right
// slider with the current cell centred and open, its neighbours scaled and dimmed. Swipe or drag, ‹ › buttons, dots and the
// arrow keys move it; it never wraps at Monday or Sunday. Text is escaped; cell html is trusted markup.
//
//   sliderHtml({ cells, index = 0, label })
//        cells  [{ id, html, label, tonight }]  html is usually doorHtml(...); label is the dot's name ("Mon 5");
//        tonight marks that dot. index is the cell centred first (tonight's).
//   initSlider(root, { onChange(index, cell, id) }) -> { go(index), get() }   wires the first or every .bt-slider under root
//        (each gets its own controller; the return value is the first). Keeps `is-c` on the centred cell, aria-current on its
//        dot, disables ‹ at the first and › at the last, and sets .is-open + aria-pressed on the centred door.
//        Fires a bubbling "bt-slider-change" { detail: { index, id } }. A swipe never counts as a click on a door.
import { escapeHtml as esc } from "./dom.js";

export function sliderHtml({ cells = [], index = 0, label = "This week" } = {}) {
  const n = cells.length;
  return `<div class="bt-slider" role="group" aria-roledescription="carousel" aria-label="${esc(label)}" data-index="${index}">`
    + `<button type="button" class="bt-slider-nav prev" aria-label="Previous night"${index === 0 ? " disabled" : ""}>‹</button>`
    + `<div class="bt-slider-view"><div class="bt-slider-track" style="--i:${index}">${cells.map((c, i) => `<div class="bt-slider-cell${i === index ? " is-c" : ""}" data-id="${esc(c.id ?? i)}">${c.html}</div>`).join("")}</div></div>`
    + `<button type="button" class="bt-slider-nav next" aria-label="Next night"${index === n - 1 ? " disabled" : ""}>›</button>`
    + `<div class="bt-slider-dots">${cells.map((c, i) => `<button type="button" class="${c.tonight ? "is-tonight" : ""}" data-i="${i}" aria-label="${esc(c.label ?? `Night ${i + 1}`)}"${i === index ? ' aria-current="true"' : ""}></button>`).join("")}</div></div>`;
}

function wire(sl, onChange) {
  const track = sl.querySelector(".bt-slider-track"), cells = [...sl.querySelectorAll(".bt-slider-cell")];
  const prev = sl.querySelector(".prev"), next = sl.querySelector(".next"), dots = [...sl.querySelectorAll(".bt-slider-dots button")];
  let i = Math.max(0, cells.findIndex((c) => c.classList.contains("is-c"))), suppress = false;
  const apply = (silent) => {
    track.style.setProperty("--i", i);
    cells.forEach((c, k) => {
      c.classList.toggle("is-c", k === i);
      c.querySelectorAll(".bt-door").forEach((d) => {
        const on = k === i && !d.classList.contains("is-off");
        d.classList.toggle("is-open", on); d.setAttribute("aria-pressed", String(on));
        d.tabIndex = k === i ? 0 : -1;
      });
    });
    dots.forEach((d, k) => { if (k === i) d.setAttribute("aria-current", "true"); else d.removeAttribute("aria-current"); });
    prev.disabled = i === 0; next.disabled = i === cells.length - 1;
    sl.dataset.index = i;
    if (!silent) {
      onChange?.(i, cells[i], cells[i]?.dataset.id);
      sl.dispatchEvent(new CustomEvent("bt-slider-change", { bubbles: true, detail: { index: i, id: cells[i]?.dataset.id } }));
    }
  };
  const go = (k) => { const nk = Math.max(0, Math.min(cells.length - 1, k)); if (nk === i) return; i = nk; apply(); };
  prev.addEventListener("click", () => go(i - 1));
  next.addEventListener("click", () => go(i + 1));
  dots.forEach((d) => d.addEventListener("click", () => go(Number(d.dataset.i))));
  sl.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); go(i + 1); }
  });
  // a tap on a neighbour brings it to the centre (phones); the row layout leaves the door's own click alone
  sl.addEventListener("click", (e) => {
    if (suppress) { e.stopImmediatePropagation(); e.preventDefault(); return; }
    const cell = e.target.closest(".bt-slider-cell");
    if (cell && !cell.classList.contains("is-c") && getComputedStyle(sl.querySelector(".bt-slider-nav")).display !== "none") { e.stopImmediatePropagation(); e.preventDefault(); go(cells.indexOf(cell)); }
  }, true);
  // swipe: the track follows the pointer, then snaps a night left or right
  let drag = null;
  track.addEventListener("pointerdown", (e) => { if (getComputedStyle(prev).display === "none" || e.button > 0) return; drag = { x: e.clientX, dx: 0 }; });
  addEventListener("pointermove", (e) => {
    if (!drag) return;
    drag.dx = e.clientX - drag.x;
    if (!track.classList.contains("is-drag") && Math.abs(drag.dx) > 6) track.classList.add("is-drag");
    if (track.classList.contains("is-drag")) track.style.setProperty("--drag", drag.dx + "px");
  });
  addEventListener("pointerup", () => {
    if (!drag) return;
    const { dx } = drag; drag = null;
    const was = track.classList.contains("is-drag");
    track.classList.remove("is-drag"); track.style.setProperty("--drag", "0px");
    if (was) { suppress = true; setTimeout(() => { suppress = false; }, 80); }
    if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1));
  });
  apply(true);
  return { go, get: () => i };
}

export function initSlider(root = document, { onChange } = {}) {
  const ctrls = [...root.querySelectorAll(".bt-slider:not([data-slider-ready])")].map((sl) => { sl.dataset.sliderReady = ""; return wire(sl, onChange); });
  return ctrls[0] ?? null;
}
