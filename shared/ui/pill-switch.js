// shared/ui/pill-switch.js — two-way pill switches (.bt-pills).
//
// Markup:
//   <div class="bt-pills" role="group" aria-label="Filter posts" data-attr="filter">
//     <button type="button" data-value="boom" class="is-on">Boom</button>
//     <button type="button" data-value="crowd">Everyone</button>
//   </div>
//
// Clicking a button marks it .is-on / aria-pressed and writes its value to
// data-{attr} on the target element, where CSS does the showing and hiding
// (e.g. [data-board][data-filter="boom"] hides the crowd posts).

/**
 * initPillSwitch(group, { target, attr, onChange })
 * group: the .bt-pills element. target: element that gets data-{attr}
 * (default: group). attr: data attribute name (default: group.dataset.attr
 * or "value"). onChange(value) runs after each switch.
 * Returns { set(value) }.
 */
export function initPillSwitch(group, { target = group, attr = group.dataset.attr || "value", onChange } = {}) {
  const buttons = [...group.querySelectorAll("button[data-value]")];
  const set = (value) => {
    buttons.forEach((b) => {
      const on = b.dataset.value === value;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    target.dataset[attr] = value;
    if (onChange) onChange(value);
  };
  buttons.forEach((b) => b.addEventListener("click", () => set(b.dataset.value)));
  const initial = buttons.find((b) => b.classList.contains("is-on")) || buttons[0];
  if (initial) set(initial.dataset.value);
  return { set };
}
