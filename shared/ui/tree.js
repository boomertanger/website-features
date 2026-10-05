// shared/ui/tree.js — .bt-tree, collapsible admin rows (docs/design-system.md §5 "Road and tree").
// The page builds the rows (a row is any element with .bt-tree-row, data-id, data-parent and, for rows
// with children, a button.bt-tree-caret[data-caret="<id>"]). This module only handles collapsing:
// a row is hidden (data-hidden) while any ancestor is collapsed. Filters belong to the page and use the
// hidden attribute, which the kit already guards.
//
//   initTree(root, { collapsed, onChange }) → { apply(), toggle(id), isCollapsed(id), collapsed }
//     collapsed: a Set of ids that start collapsed; onChange(collapsedSet) after each toggle
// Call apply() again after the page re-renders the rows.

export function initTree(root, { collapsed = new Set(), onChange } = {}) {
  const set = collapsed instanceof Set ? collapsed : new Set(collapsed);

  function apply() {
    const rows = [...root.querySelectorAll(".bt-tree-row")];
    const parentOf = new Map(rows.map((r) => [r.dataset.id, r.dataset.parent || ""]));
    const hiddenBy = (id) => {
      for (let p = parentOf.get(id); p; p = parentOf.get(p)) if (set.has(p)) return true;
      return false;
    };
    rows.forEach((r) => {
      if (hiddenBy(r.dataset.id)) r.setAttribute("data-hidden", ""); else r.removeAttribute("data-hidden");
      const caret = r.querySelector(".bt-tree-caret");
      if (caret) caret.setAttribute("aria-expanded", String(!set.has(r.dataset.id)));
    });
  }

  function toggle(id) {
    if (set.has(id)) set.delete(id); else set.add(id);
    apply();
    onChange?.(set);
  }

  root.addEventListener("click", (e) => {
    const c = e.target.closest(".bt-tree-caret");
    if (c && root.contains(c) && !c.disabled) toggle(c.dataset.caret);
  });
  apply();
  return { apply, toggle, isCollapsed: (id) => set.has(id), collapsed: set };
}
