// shared/ui/cmd.js — .bt-cmd (docs/design-system.md §5 "Command panel"): a panel under a search
// field with grouped results, suggested filters and an action row, driven from the keyboard.
// The field is a combobox: ArrowDown / ArrowUp move, Enter picks, Escape closes; the option
// under the pointer is picked on mousedown (before the field loses focus).
//
//   const cmd = initCmd({ input, mount, groups, onChoose, foot })
//     input    the <input> (role="combobox" is set here)
//     mount    an element right after the field, inside a position: relative wrapper
//     groups(q) -> [{ label, items: [{ html, value }] }]   (empty list: the panel closes)
//     onChoose(value, q)
//   cmd.refresh()   re-render (after the data changes); cmd.close()

let seq = 0;
export function initCmd({ input, mount, groups, onChoose, foot = true }) {
  const id = `bt-cmd-${++seq}`;
  let open = false, sel = 0, flat = [];
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", id);
  input.setAttribute("aria-expanded", "false");

  const render = () => {
    const q = input.value.trim();
    const gs = open && q ? groups(q).filter((g) => g.items.length) : [];
    flat = gs.flatMap((g) => g.items);
    if (!flat.length) { mount.innerHTML = ""; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); return; }
    sel = Math.min(sel, flat.length - 1);
    let i = -1;
    const opt = (it) => { i++; return `<button type="button" class="bt-cmd-item" role="option" id="${id}-${i}" data-cmd="${i}" aria-selected="${i === sel}" tabindex="-1">${it.html}</button>`; };
    mount.innerHTML = `<div class="bt-cmd" id="${id}" role="listbox" aria-label="Search results">${gs.map((g) => `<span class="bt-label" aria-hidden="true">${g.label}</span>${g.items.map(opt).join("")}`).join("")}${foot ? '<div class="bt-cmd-foot" aria-hidden="true"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></div>' : ""}</div>`;
    input.setAttribute("aria-expanded", "true");
    input.setAttribute("aria-activedescendant", `${id}-${sel}`);
    mount.querySelector(`#${id}-${sel}`)?.scrollIntoView({ block: "nearest" });
  };
  const choose = (i) => { const it = flat[i]; if (!it) return; const q = input.value.trim(); close(); onChoose(it.value, q); };
  const close = () => { open = false; render(); };

  input.addEventListener("input", () => { open = true; sel = 0; render(); });
  input.addEventListener("focus", () => { if (input.value.trim()) { open = true; render(); } });
  input.addEventListener("blur", () => setTimeout(() => { if (document.activeElement !== input) close(); }, 0));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { if (open && flat.length) { e.preventDefault(); close(); } return; }
    if (!open || !flat.length) { if (e.key === "ArrowDown" && input.value.trim()) { e.preventDefault(); open = true; render(); } return; }
    if (e.key === "ArrowDown") { e.preventDefault(); sel = (sel + 1) % flat.length; render(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = (sel - 1 + flat.length) % flat.length; render(); }
    else if (e.key === "Enter") { e.preventDefault(); choose(sel); }
  });
  mount.addEventListener("mousedown", (e) => {
    const b = e.target instanceof Element ? e.target.closest("[data-cmd]") : null;
    if (!b) return;
    e.preventDefault();
    choose(Number(b.dataset.cmd));
  });
  return { refresh: render, close, get isOpen() { return open && flat.length > 0; } };
}

/** Wraps the matched letters (indexes into text) in <mark>: the command panel's lit letters. */
export function litText(text, indexes, esc) {
  const set = new Set(indexes || []);
  let out = "", inMark = false;
  [...String(text)].forEach((ch, i) => {
    const on = set.has(i);
    if (on && !inMark) { out += "<mark>"; inMark = true; }
    if (!on && inMark) { out += "</mark>"; inMark = false; }
    out += esc(ch);
  });
  return inMark ? `${out}</mark>` : out;
}
