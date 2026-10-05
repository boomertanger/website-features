// shared/ui/road.js — .bt-road, the level select (docs/design-system.md §5 "Road and tree"; Goal Tracker).
// Stops sit on a dashed road with a fill that grows once to the current stop. Pick a stop and a panel
// shows what is in it. At <= 640px the road is a vertical path and the panel opens right under the stop
// that was tapped.
//
//   roadHtml({ levels, selected, label, mascot, panelHtml })
//     levels: [{ n, icon, name, when, lv, state: "done" | "now" | "later", boss }]
//       lv is the small line over the name ("Level 2", "Final boss"); the "now" stop gets "· we're here"
//     selected: the n of the open stop; mascot: markup for the figure that stands on the "now" stop
//     panelHtml: the panel's markup for the selected stop
//   initRoad(host, { renderPanel, onSelect }) → { select(n), refresh(), destroy() }
//     host: the element holding roadHtml's output; renderPanel(n) returns the panel markup
// Stops are buttons with data-lv="<n>" and aria-pressed. Reduced motion: the fill is drawn at once.
import { escapeHtml as esc } from "./dom.js";

export function roadHtml({ levels = [], selected, label = "Levels", mascot = "", panelHtml = "" } = {}) {
  const stops = levels.map((l) => {
    const state = l.state === "done" || l.state === "now" ? `is-${l.state}` : "is-later";
    const here = l.state === "now";
    return `<button type="button" class="bt-road-stop ${state}${l.boss ? " bt-road-stop--boss" : ""}" aria-pressed="${l.n === selected}" data-lv="${esc(l.n)}">`
      + `<span class="bt-road-nodewrap"><span class="bt-road-node" aria-hidden="true">${esc(l.icon || "")}</span>`
      + (here && mascot ? `<span class="bt-road-me" title="We're here">${mascot}</span>` : "")
      + `</span><span class="bt-road-lv">${esc(l.lv || "")}${here ? " · we're here" : ""}</span>`
      + `<span class="bt-road-name">${esc(l.name)}</span><span class="bt-road-when">${esc(l.when || "")}</span></button>`;
  }).join("");
  return `<div class="bt-road" style="--bt-road-n:${levels.length || 1}" role="group" aria-label="${esc(label)}">${stops}<span class="bt-road-fill" aria-hidden="true"></span></div>`
    + `<div class="bt-road-panel" data-panel>${panelHtml}</div>`;
}

export function initRoad(host, { renderPanel, onSelect } = {}) {
  const road = host.querySelector(".bt-road");
  const panel = host.querySelector("[data-panel]");
  if (!road || !panel) return { select() {}, refresh() {}, destroy() {} };
  const stops = [...road.querySelectorAll(".bt-road-stop")];
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  let sel = Number(stops.find((s) => s.getAttribute("aria-pressed") === "true")?.dataset.lv);

  // How far the fill reaches: to the centre of the last done or current stop.
  const fill = () => {
    let last = -1;
    stops.forEach((s, i) => { if (s.classList.contains("is-done") || s.classList.contains("is-now")) last = i; });
    const nodes = stops.map((s) => s.querySelector(".bt-road-node"));
    if (last < 0 || !nodes[0]) { road.style.setProperty("--bt-road-fill", "0px"); road.style.setProperty("--bt-road-fill-v", "0px"); return; }
    const r = road.getBoundingClientRect(), a = nodes[0].getBoundingClientRect(), b = nodes[last].getBoundingClientRect();
    const cx = (x) => x.left + x.width / 2 - r.left, cy = (x) => x.top + x.height / 2 - r.top;
    const half = a.width / 2;
    road.style.setProperty("--bt-road-fill", `${cx(b) - cx(a) + half}px`);
    road.style.setProperty("--bt-road-fill-v", `${cy(b) - cy(a) + half}px`);
  };

  // One column (phones): the panel opens right under the stop that was picked.
  const place = () => {
    const vertical = getComputedStyle(road).gridTemplateColumns.split(" ").length === 1;
    const stop = stops.find((s) => Number(s.dataset.lv) === sel);
    if (vertical && stop) stop.after(panel);
    else if (panel.parentNode !== host) host.append(panel);
  };

  const select = (n) => {
    sel = Number(n);
    stops.forEach((s) => s.setAttribute("aria-pressed", String(Number(s.dataset.lv) === sel)));
    if (renderPanel) panel.innerHTML = renderPanel(sel);
    place();
    onSelect?.(sel);
  };
  const click = (e) => {
    const b = e.target.closest("[data-lv]");
    if (b && road.contains(b)) select(b.dataset.lv);
  };
  road.addEventListener("click", click);

  const ro = new ResizeObserver(() => { fill(); place(); });
  ro.observe(road);
  ro.observe(host);
  fill();
  place();
  if (reduced()) road.classList.add("is-in");
  else requestAnimationFrame(() => requestAnimationFrame(() => road.classList.add("is-in")));
  return { select, refresh() { fill(); place(); }, destroy() { ro.disconnect(); road.removeEventListener("click", click); } };
}
