// shared/ui/pref.js — .bt-pref, the crew's per-chat preference rows (docs/design-system.md §5 "Preference rows";
// docs/specs/mod-machina.md §7): one row per chat with a four-way choice, Favourite · Happy to help · Only if
// needed · No. Each choice group is a real radio group: role="radiogroup" with button[role="radio"], one tab
// stop (roving tabindex), arrows / Home / End move and choose, Space / Enter choose.
//
//   PREF_OPTIONS                                   [{ value, label }] in order; values match the crew data
//                                                  ("favourite", "happy", "ifNeeded", "no")
//   prefHtml({ rows })                             .bt-pref; rows: [{ chat, name, iconHtml, value, needed }]
//     chat: the data key (twitch, ytLandscape, ytVertical, tiktok); needed: gold "Most needed" tag + gold edge
//   prefRowHtml(row)                               one row
//   initPrefs(root, { onChange(chat, value) })     wires every .bt-pref-seg; also fires a bubbling
//                                                  "bt-pref-change" CustomEvent { detail: { chat, value } }
//   initRadioGroup(group, { onChange(value, button) }) -> { set(value), get() }
//                                                  the roving-tabindex radio behaviour, reused by the quiz
import { escapeHtml as esc } from "./dom.js";

export const PREF_OPTIONS = [
  { value: "favourite", label: "Favourite" },
  { value: "happy", label: "Happy to help" },
  { value: "ifNeeded", label: "Only if needed" },
  { value: "no", label: "No" },
];

export function prefRowHtml({ chat = "", name = "", iconHtml = "", value = "", needed = false } = {}) {
  const buttons = PREF_OPTIONS.map((o, i) => {
    const on = o.value === value;
    return `<button type="button" role="radio" aria-checked="${on}" tabindex="${on || (!value && i === 0) ? 0 : -1}" data-value="${o.value}">${o.label}</button>`;
  }).join("");
  return `<div class="bt-pref-row${needed ? " is-needed" : ""}" data-chat="${esc(chat)}">`
    + `<span class="bt-pref-lab">${iconHtml}${esc(name)}${needed ? `<span class="bt-badge bt-badge--gold">Most needed</span>` : ""}</span>`
    + `<span class="bt-pref-seg" role="radiogroup" aria-label="${esc(name)} preference">${buttons}</span></div>`;
}

export function prefHtml({ rows = [] } = {}) {
  return `<div class="bt-pref">${rows.map(prefRowHtml).join("")}</div>`;
}

export function initRadioGroup(group, { onChange } = {}) {
  const radios = () => [...group.querySelectorAll("[role=radio]")];
  const select = (btn, { focus = false, silent = false } = {}) => {
    radios().forEach((r) => {
      const on = r === btn;
      r.setAttribute("aria-checked", String(on));
      r.tabIndex = on ? 0 : -1;
    });
    if (focus) btn.focus();
    if (!silent) onChange?.(btn.dataset.value, btn);
  };
  group.addEventListener("click", (e) => {
    const b = e.target.closest("[role=radio]");
    if (b && group.contains(b) && !b.disabled) select(b);
  });
  group.addEventListener("keydown", (e) => {
    const list = radios().filter((r) => !r.disabled);
    const i = list.indexOf(document.activeElement);
    if (i < 0) return;
    const to = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: list.length - 1 }[e.key];
    if (to == null) return;
    e.preventDefault();
    select(list[(to + list.length) % list.length], { focus: true });
  });
  return {
    get: () => radios().find((r) => r.getAttribute("aria-checked") === "true")?.dataset.value ?? null,
    set: (value) => { const b = radios().find((r) => r.dataset.value === value); if (b) select(b, { silent: true }); },
  };
}

export function initPrefs(root = document, { onChange } = {}) {
  root.querySelectorAll(".bt-pref-seg:not([data-pref-ready])").forEach((seg) => {
    seg.dataset.prefReady = "";
    const row = seg.closest(".bt-pref-row");
    initRadioGroup(seg, {
      onChange: (value) => {
        const chat = row?.dataset.chat ?? "";
        onChange?.(chat, value);
        seg.dispatchEvent(new CustomEvent("bt-pref-change", { bubbles: true, detail: { chat, value } }));
      },
    });
  });
}
