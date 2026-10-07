// shared/ui/tri.js — .bt-tri, the availability tri-toggle: Available / Maybe / Can't (docs/design-system.md §5 "Scream
// Planner pieces"). A real role="radiogroup" (roving tabindex; arrows, Home and End move and choose) built on initRadioGroup.
// [data-value] on the group drives the sliding pill: yes lime, maybe gold, no gray. Text is escaped.
//
//   TRI_OPTIONS                       [["yes","Available"],["maybe","Maybe"],["no","Can't"]]
//   triHtml({ value, label, name, options, disabled })   value "yes" | "maybe" | "no" | "" (nothing chosen: no pill)
//   initTri(root, { onChange(value, group) })   wires every .bt-tri; also fires a bubbling "bt-tri-change"
//                                               CustomEvent { detail: { value, name } }
import { escapeHtml as esc } from "./dom.js";
import { initRadioGroup } from "./pref.js";

export const TRI_OPTIONS = [["yes", "Available"], ["maybe", "Maybe"], ["no", "Can't"]];

export function triHtml({ value = "", label = "Can you make it?", name = "", options = TRI_OPTIONS, disabled = false } = {}) {
  const btn = ([v, text], i) => {
    const on = v === value;
    return `<button type="button" role="radio" aria-checked="${on}" tabindex="${on || (!value && i === 0) ? 0 : -1}" data-value="${esc(v)}"${disabled ? " disabled" : ""}>${esc(text)}</button>`;
  };
  return `<div class="bt-tri" role="radiogroup" aria-label="${esc(label)}" data-value="${esc(value)}"${name ? ` data-name="${esc(name)}"` : ""}><span class="bt-tri-pill" aria-hidden="true"></span>${options.map(btn).join("")}</div>`;
}

export function initTri(root = document, { onChange } = {}) {
  root.querySelectorAll(".bt-tri:not([data-tri-ready])").forEach((g) => {
    g.dataset.triReady = "";
    initRadioGroup(g, {
      onChange: (value) => {
        g.dataset.value = value;
        onChange?.(value, g);
        g.dispatchEvent(new CustomEvent("bt-tri-change", { bubbles: true, detail: { value, name: g.dataset.name ?? "" } }));
      },
    });
  });
}
