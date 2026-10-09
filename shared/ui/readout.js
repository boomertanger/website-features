// shared/ui/readout.js — .bt-readout, a live stat (docs/design-system.md §5 "Control Room pieces", docs/specs/control-room.md §15).
// A big tabular number over a small label. When the value changes the number flashes (gold tick; the hull look turns it amber and
// shows ghost digits behind it, drawn from data-ghost, which every helper here keeps up to date). Text is escaped; arguments ending
// in Html are trusted markup.
//
//   readoutHtml({ value, label, key, wide, extraHtml })   one .bt-readout (key becomes data-ro; wide spans the row;
//                                                         extraHtml goes under the label, e.g. readoutBarsHtml)
//   readoutsHtml(list, { cols })                           .bt-readouts grid of readoutHtml(...) results (or option objects)
//   readoutBarsHtml(rows)                                  .bt-readout-bars, one row per platform: { chat, value, max }
//                                                          (chat: twitch | ytLandscape | ytVertical | tiktok); the hull look draws them as fuel cells
//   setReadout(el, value, { tick })                        set a .bt-readout (or its .bt-readout-v) and flash it when the text changed
//   initReadouts(root)                                     fills every ghost attribute under root (call after rendering)
import { escapeHtml as esc } from "./dom.js";
import { platformIconHtml, PLATFORMS } from "./crew.js";

export const ghostOf = (text) => String(text).replace(/\d/g, "8");
export const fmtNum = (n) => (typeof n === "number" ? n.toLocaleString("en-US") : String(n));

export function readoutHtml({ value = "", label = "", key = "", wide = false, extraHtml = "" } = {}) {
  const v = fmtNum(value);
  return `<div class="bt-readout${wide ? " bt-readout--wide" : ""}"${key ? ` data-ro="${esc(key)}"` : ""}><div class="bt-readout-v" data-ghost="${esc(ghostOf(v))}">${esc(v)}</div><div class="bt-readout-l">${esc(label)}</div>${extraHtml}</div>`;
}

export function readoutsHtml(list = [], { cols = 0 } = {}) {
  return `<div class="bt-readouts"${cols ? ` data-cols="${Number(cols)}"` : ""}>${list.map((r) => (typeof r === "string" ? r : readoutHtml(r))).join("")}</div>`;
}

const BAR_COLOUR = { twitch: "var(--bt-brand-twitch)", ytLandscape: "var(--bt-brand-youtube)", ytVertical: "var(--bt-brand-youtube)", tiktok: "var(--bt-brand-tiktok-edge)" };

export function readoutBarsHtml(rows = []) {
  const max = Math.max(1, ...rows.map((r) => Number(r.max) || 0), ...rows.map((r) => Number(r.value) || 0));
  return `<div class="bt-readout-bars">${rows.map((r) => {
    const chat = PLATFORMS[r.chat] ? r.chat : "twitch";
    const m = Number(r.max) || max;
    return `<div class="bt-readout-bar" data-chat="${chat}">${platformIconHtml(chat)}<span class="bt-readout-track"><i style="--f:${Math.min(1, (Number(r.value) || 0) / m).toFixed(3)};--c:${BAR_COLOUR[chat]}"></i></span><b>${esc(fmtNum(r.value ?? 0))}</b></div>`;
  }).join("")}</div>`;
}

export function setReadout(el, value, { tick = true } = {}) {
  if (!el) return;
  const ro = el.classList.contains("bt-readout") ? el : el.closest(".bt-readout");
  const v = ro?.querySelector(".bt-readout-v") ?? el;
  const text = fmtNum(value);
  if (v.textContent === text) return;
  v.textContent = text;
  v.dataset.ghost = ghostOf(text);
  if (tick && ro) {
    ro.classList.remove("is-tick");
    void ro.offsetWidth;
    ro.classList.add("is-tick");
    v.addEventListener("animationend", () => ro.classList.remove("is-tick"), { once: true });
  }
}

export function initReadouts(root = document) {
  root.querySelectorAll(".bt-readout-v").forEach((v) => { v.dataset.ghost = ghostOf(v.textContent); });
}
