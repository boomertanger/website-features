// shared/ui/view-switch.js — .bt-view-switch, the viewer's two-way view switch: Tickets / Timeline on the week and
// Covers / Race on the ballot (docs/design-system.md §5 "Scream Planner pieces"). The kit only renders and emits; the PAGE
// keeps the choice (localStorage keys bt.schedule.weekView and bt.schedule.voteView, wrapped in try/catch) and swaps the
// view. A role="radiogroup" on initRadioGroup (arrows, Home, End).
//
//   viewSwitchHtml({ key, label, value, options: [{ value, icon, label }] })
//   initViewSwitch(root, { onChange(value, key, group) })   also fires a bubbling "bt-view-change" { detail: { key, value } }
//   WEEK_VIEWS (tickets, timeline), VOTE_VIEWS (covers, race): the two presets
import { escapeHtml as esc } from "./dom.js";
import { initRadioGroup } from "./pref.js";

export const WEEK_VIEWS = [{ value: "tickets", icon: "🎟", label: "Tickets" }, { value: "timeline", icon: "🌙", label: "Timeline" }];
export const VOTE_VIEWS = [{ value: "covers", icon: "🃏", label: "Covers" }, { value: "race", icon: "🩸", label: "Race" }];

export function viewSwitchHtml({ key = "view", label = "View", value, options = WEEK_VIEWS } = {}) {
  const cur = value ?? options[0]?.value;
  return `<span class="bt-view-switch" role="radiogroup" aria-label="${esc(label)}" data-key="${esc(key)}">${options.map((o) => {
    const on = o.value === cur;
    return `<button type="button" role="radio" aria-checked="${on}" tabindex="${on ? 0 : -1}" data-value="${esc(o.value)}">${o.icon ? `<i aria-hidden="true">${esc(o.icon)}</i>` : ""}<span>${esc(o.label)}</span></button>`;
  }).join("")}</span>`;
}

export function initViewSwitch(root = document, { onChange } = {}) {
  root.querySelectorAll(".bt-view-switch:not([data-vs-ready])").forEach((g) => {
    g.dataset.vsReady = "";
    initRadioGroup(g, {
      onChange: (value) => {
        const key = g.dataset.key ?? "";
        onChange?.(value, key, g);
        g.dispatchEvent(new CustomEvent("bt-view-change", { bubbles: true, detail: { key, value } }));
      },
    });
  });
}
