// shared/ui/cycle-wheel.js — .bt-cycle-wheel (docs/design-system.md §5 "Cycle wheel",
// docs/design/mockups/how-it-works-sections-2-3.html, 3C with palette 1 Spectrum): a version's
// stages as segments round a ring, a dashed arrow from the last stage back to the first (it
// loops), and a stage card beside it. Used by How it works; built for the Workshop pages too.
//
//   cycleWheelHtml({ id, label, title, badge, stages, current, play, note })
//     The whole markup as a string (the site renders it at build time, the UI Kit at runtime),
//     so the stage names and texts are in the HTML, not only in the SVG. stages is
//     [{ name, text, who }]; stage i takes --bt-cycle-(i+1). title / badge (HTML) / play /
//     note are optional; current is the stage shown first.
//   initCycleWheels(root)  wires every .bt-cycle-wheel under root → [{ show, stop }]
//
// Behavior: the segments are a tablist (roving tabindex, aria-selected; Arrow keys wrap,
// Home / End), the card holds one tabpanel per stage, the card's arrows step one stage
// (disabled at the ends). Play goes round the wheel, one stage every 2.6 s, and stops on any
// other interaction. Reduced motion: nothing moves (colour and glow only); Play still steps.

const STEP_MS = 2600;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const chev = (d) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
const PLAY = chev("M5 3.5v9l7-4.5z"), PAUSE = chev("M5 3.5v9M11 3.5v9");
const colour = (i) => `var(--bt-cycle-${(i % 8) + 1})`;
const pad = (n) => String(n).padStart(2, "0");

// The ring: centre 190, outer 150, inner 92, labels on 172 (viewBox leaves room for them).
const C = 190, R1 = 150, R0 = 92, RL = 172, GAP = 2.2;
const r2 = (v) => Math.round(v * 100) / 100;
const pt = (r, deg) => [r2(C + r * Math.sin(deg * Math.PI / 180)), r2(C - r * Math.cos(deg * Math.PI / 180))];

function dialHtml(id, label, stages, cur) {
  const n = stages.length, step = 360 / n;
  const segs = stages.map(({ name }, i) => {
    const a0 = i * step + GAP, a1 = (i + 1) * step - GAP, mid = i * step + step / 2;
    const [x0, y0] = pt(R1, a0), [x1, y1] = pt(R1, a1), [x2, y2] = pt(R0, a1), [x3, y3] = pt(R0, a0);
    const [nx, ny] = pt((R0 + R1) / 2, mid), [lx, ly] = pt(RL, mid);
    const anchor = mid > 5 && mid < 175 ? "start" : mid > 185 && mid < 355 ? "end" : "middle";
    const w = name.split(" "), half = Math.ceil(w.length / 2);
    const lines = name.length > 11 && w.length > 1 ? [w.slice(0, half).join(" "), w.slice(half).join(" ")] : [name];
    const on = i === cur;
    return `<g class="bt-cycle-seg${i < cur ? " is-done" : ""}" role="tab" id="${id}-tab-${i}" aria-controls="${id}-panel-${i}" aria-selected="${on}" tabindex="${on ? 0 : -1}" aria-label="${esc(`Stage ${i + 1}: ${name}`)}" style="--c:${colour(i)}">`
      + `<path d="M${x0} ${y0}A${R1} ${R1} 0 0 1 ${x1} ${y1}L${x2} ${y2}A${R0} ${R0} 0 0 0 ${x3} ${y3}Z"/>`
      + `<text class="bt-cycle-n" x="${nx}" y="${ny}" aria-hidden="true">${i + 1}</text>`
      + lines.map((l, k) => `<text class="bt-cycle-lb" x="${lx}" y="${r2(ly + (k - (lines.length - 1) / 2) * 13)}" text-anchor="${anchor}" aria-hidden="true">${esc(l)}</text>`).join("")
      + `</g>`;
  }).join("");
  const RA = R0 - 12, [ax, ay] = pt(RA, 350), [bx, by] = pt(RA, 10);
  const core = `<g class="bt-cycle-core" aria-hidden="true"><circle class="bt-cycle-hub" cx="${C}" cy="${C}" r="${R0 - 20}"/>`
    + `<path class="bt-cycle-loop" d="M${ax} ${ay}A${RA} ${RA} 0 0 1 ${bx} ${by}"/><path class="bt-cycle-loop-head" d="M${r2(bx + 4)} ${by}l-7 -4v8z"/>`
    + `<text class="bt-cycle-k" x="${C}" y="${C - 30}">Stage</text><text class="bt-cycle-big" x="${C}" y="${C + 10}" data-cycle-num>${pad(cur + 1)}</text><text class="bt-cycle-k" x="${C}" y="${C + 34}">of ${n} stages</text></g>`;
  return `<svg class="bt-cycle-dial" viewBox="-40 -10 460 400" role="tablist" aria-label="${esc(label)}">${segs}${core}</svg>`;
}

export function cycleWheelHtml({ id = "bt-cycle", label = "Version cycle stages", title = "", badge = "", stages, current = 0, play = true, note = "" }) {
  const n = stages.length, cur = Math.min(Math.max(current, 0), n - 1);
  const top = title || badge || play
    ? `<div class="bt-cycle-top">${title ? `<b class="bt-cycle-title">${esc(title)}</b>` : "<span></span>"}<div class="bt-cycle-acts">${play ? `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm bt-cycle-play" data-cycle-play>${PLAY}<span>Play</span></button>` : ""}${badge}</div></div>`
    : "";
  const panels = stages.map(({ name, text, who }, i) => `<div class="bt-cycle-panel" role="tabpanel" id="${id}-panel-${i}" aria-labelledby="${id}-tab-${i}" tabindex="0"${i === cur ? "" : " hidden"}>`
    + `<h4 class="bt-cycle-name">${esc(name)} <span class="bt-cycle-chip" style="--c:${colour(i)}">Stage ${i + 1} of ${n}</span></h4>`
    + `<p class="bt-cycle-text">${esc(text)}</p>`
    + (who ? `<p class="bt-cycle-who">Led by <span class="bt-cycle-lead">${esc(who)}</span></p>` : "")
    + `</div>`).join("");
  const nav = `<div class="bt-cycle-nav"><button type="button" data-cycle-prev aria-label="Previous stage"${cur === 0 ? " disabled" : ""}>${chev("M10 3.5L5.5 8l4.5 4.5")}</button><button type="button" data-cycle-next aria-label="Next stage"${cur === n - 1 ? " disabled" : ""}>${chev("M6 3.5L10.5 8 6 12.5")}</button></div>`;
  return `<div class="bt-cycle-wheel" id="${id}" style="--c:${colour(cur)}">${top}<div class="bt-cycle-body">${dialHtml(id, label, stages, cur)}`
    + `<div class="bt-cycle-side"><div class="bt-cycle-card">${nav}${panels}</div>${note ? `<p class="bt-cycle-note"><i aria-hidden="true"></i>${esc(note)}</p>` : ""}</div></div></div>`;
}

function initCycleWheel(el) {
  el.dataset.ready = "";
  const tabs = [...el.querySelectorAll(".bt-cycle-seg")];
  const panels = [...el.querySelectorAll(".bt-cycle-panel")];
  const prev = el.querySelector("[data-cycle-prev]"), next = el.querySelector("[data-cycle-next]");
  const play = el.querySelector("[data-cycle-play]"), num = el.querySelector("[data-cycle-num]");
  const n = tabs.length;
  let cur = Math.max(0, tabs.findIndex((t) => t.getAttribute("aria-selected") === "true"));
  let timer = 0;

  const show = (i, focus = false) => {
    cur = ((i % n) + n) % n;
    el.style.setProperty("--c", colour(cur));
    tabs.forEach((t, k) => {
      t.setAttribute("aria-selected", String(k === cur));
      t.setAttribute("tabindex", k === cur ? "0" : "-1");
      t.classList.toggle("is-done", k < cur);
    });
    panels.forEach((p, k) => {
      p.hidden = k !== cur;
      if (k === cur) { p.classList.remove("is-in"); void p.offsetWidth; p.classList.add("is-in"); }
    });
    if (num) num.textContent = pad(cur + 1);
    if (prev) prev.disabled = cur === 0;
    if (next) next.disabled = cur === n - 1;
    if (focus) tabs[cur].focus();
  };
  const stop = () => {
    if (!timer) return;
    clearInterval(timer); timer = 0;
    play.innerHTML = `${PLAY}<span>Play</span>`;
  };

  tabs.forEach((t, i) => {
    t.addEventListener("click", () => { stop(); show(i); });
    t.addEventListener("keydown", (e) => {
      const k = e.key;
      const to = k === "ArrowRight" || k === "ArrowDown" ? cur + 1 : k === "ArrowLeft" || k === "ArrowUp" ? cur - 1
        : k === "Home" ? 0 : k === "End" ? n - 1 : k === "Enter" || k === " " ? i : null;
      if (to == null) return;
      e.preventDefault(); stop(); show(to, true);
    });
  });
  prev?.addEventListener("click", () => { stop(); show(cur - 1); });
  next?.addEventListener("click", () => { stop(); show(cur + 1); });
  play?.addEventListener("click", () => {
    if (timer) { stop(); return; }
    play.innerHTML = `${PAUSE}<span>Pause</span>`;
    timer = setInterval(() => show(cur + 1), STEP_MS);
  });
  return { show, stop };
}

export function initCycleWheels(root = document) {
  return [...root.querySelectorAll(".bt-cycle-wheel:not([data-ready])")].map(initCycleWheel);
}
