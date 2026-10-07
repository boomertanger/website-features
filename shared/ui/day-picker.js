// shared/ui/day-picker.js — .bt-day-picker, a week of day tiles (docs/design-system.md §5 "Story page pieces"; the
// "When are you usually around?" picker on Join). Each tile is a real <button> with aria-pressed, so Tab, Space
// and Enter just work; a chosen tile gets a lit dot.
//
//   DAYS                                       Mon to Sun as [{ key: 0..6, label }]
//   dayPickerHtml({ days, selected, label, disabled })
//     days      [{ key, label, num?, disabled? }] or plain label strings (the key is then the index);
//               default DAYS. num is an optional big number on the tile (the date)
//     selected  keys that start chosen
//     label     the group's aria-label (default "Days of the week")
//     disabled  true disables every tile
//   initDayPicker(root, { onChange(selected, key) })   wires every .bt-day-picker under root; selected is the array of
//                                                      chosen keys (numbers when the keys are numbers). Also fires a
//                                                      bubbling "bt-day-change" CustomEvent { detail: { selected, key } }
//   dayPickerValue(picker)                     the chosen keys of one .bt-day-picker
import { escapeHtml as esc } from "./dom.js";

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, key) => ({ key, label }));

const keyOf = (v) => (/^\d+$/.test(v) ? Number(v) : v);

export function dayPickerHtml({ days = DAYS, selected = [], label = "Days of the week", disabled = false } = {}) {
  const on = new Set(selected.map(String));
  const tiles = days.map((d, i) => {
    const day = typeof d === "string" ? { label: d } : d;
    const key = day.key ?? i;
    return `<button type="button" class="bt-day" data-day="${esc(key)}" aria-pressed="${on.has(String(key))}"${disabled || day.disabled ? " disabled" : ""}>`
      + `<small>${esc(day.label)}</small>${day.num != null ? `<b>${esc(day.num)}</b>` : ""}<i aria-hidden="true"></i></button>`;
  }).join("");
  return `<div class="bt-day-picker" role="group" aria-label="${esc(label)}">${tiles}</div>`;
}

export function dayPickerValue(picker) {
  return [...picker.querySelectorAll(".bt-day[aria-pressed=true]")].map((b) => keyOf(b.dataset.day));
}

export function initDayPicker(root = document, { onChange } = {}) {
  root.querySelectorAll(".bt-day-picker:not([data-day-ready])").forEach((picker) => {
    picker.dataset.dayReady = "";
    picker.addEventListener("click", (e) => {
      const b = e.target.closest(".bt-day");
      if (!b || !picker.contains(b) || b.disabled) return;
      b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
      const selected = dayPickerValue(picker);
      const key = keyOf(b.dataset.day);
      onChange?.(selected, key);
      picker.dispatchEvent(new CustomEvent("bt-day-change", { bubbles: true, detail: { selected, key } }));
    });
  });
}
