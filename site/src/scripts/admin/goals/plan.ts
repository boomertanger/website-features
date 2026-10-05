// The Plan tab (docs/specs/goal-tracker.md §6): the plan as .bt-tree rows. Collapse, click a status to
// cycle it, move up and down, Add a child, Edit (the dialog in edit.ts) and the filters All, In progress,
// Planned, Overdue and Needed for relaunch. Rows are labelled Unpublished, Relaunch and Overdue. An empty
// plan offers "Load the starting plan".
import { initTree } from "../../../../../shared/ui/tree.js";
import { toast } from "../../../../../shared/ui/toast.js";
import { escapeHtml as esc } from "../../../../../shared/ui/dom.js";
import { messageFor } from "../../../lib/errors";
import { STATUS, STATUS_ORDER, dayText, type Status } from "../../goals/data";
import { state, flatten, childrenOf, isOverdue, setStatus, moveItem, seedPlan, loadDraft, CHILD_TYPE, type DItem } from "./model";
import { openItemEditor } from "./edit";

const VIS: Record<string, [string, string]> = { public: ["🌐", "Public"], members: ["👥", "Members"], private: ["🔒", "Private"] };
const CARET = `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`;
type Filter = "all" | "progress" | "planned" | "overdue" | "relaunch";

export function initPlan(host: HTMLElement, onChange: () => void) {
  const tree = host.querySelector<HTMLElement>("[data-tree]")!;
  const empty = host.querySelector<HTMLElement>("[data-plan-empty]")!;
  const note = host.querySelector<HTMLElement>("[data-plan-note]")!;
  const collapsed = new Set<string>();
  let filter: Filter = "all";
  const handle = initTree(tree, { collapsed });   // one delegated listener; apply() after each render

  function row(item: DItem, depth: number, hasKids: boolean): string {
    const label = item.type === "track" && item.icon ? `${esc(item.icon)} ${esc(item.title)}` : esc(item.title);
    const [vi, vl] = VIS[item.visibility] || VIS.members;
    const childType = CHILD_TYPE[item.type];
    const over = isOverdue(item);
    const s = item.status ? STATUS[item.status] : null;
    return `<div class="bt-tree-row" role="treeitem" aria-level="${depth + 1}" data-id="${esc(item.id)}" data-parent="${esc(item.parentId || "")}" data-type="${item.type}" style="--d:${depth}">`
      + `<button type="button" class="bt-tree-caret" data-caret="${esc(item.id)}" aria-label="Collapse"${hasKids ? "" : " disabled"}>${CARET}</button>`
      + `<span class="bt-tree-main"><b>${label}</b><span class="bt-tree-type">${item.type}</span>`
      + (item.relaunch?.needed ? `<span class="bt-tree-tag bt-tree-tag--quiet">Relaunch</span>` : "")
      + (over ? `<span class="bt-badge bt-badge--pink">Overdue</span>` : "")
      + (item.changedSincePublish ? `<span class="bt-tree-tag">Unpublished</span>` : "") + `</span>`
      + `<span class="bt-tree-meta"><span class="bt-tree-vis" title="${vl}" aria-label="${vl}">${vi}</span>`
      + (item.dueDate ? `<span class="bt-tree-opt">${esc(dayText(item.dueDate))}</span>` : "")
      + (s ? `<button type="button" class="bt-tree-status" data-cycle aria-label="Status: ${s[0]}. Change"><span class="bt-badge bt-badge--${s[1]}"><span class="bt-badge-dot"></span>${s[0]}</span></button>` : "") + `</span>`
      + `<span class="bt-tree-acts"><button type="button" class="bt-icon-btn bt-icon-btn--sm bt-tree-move" data-move="up" aria-label="Move up">↑</button>`
      + `<button type="button" class="bt-icon-btn bt-icon-btn--sm bt-tree-move" data-move="down" aria-label="Move down">↓</button>`
      + (childType ? `<button type="button" class="bt-icon-btn bt-icon-btn--sm" data-add="${childType}" aria-label="Add ${childType}" title="Add ${childType}">+</button>` : "")
      + `<button type="button" class="bt-icon-btn bt-icon-btn--sm" data-edit aria-label="Edit ${esc(item.title)}">✎</button></span></div>`;
  }

  function matches(i: DItem): boolean {
    if (filter === "all") return true;
    if (filter === "relaunch") return !!i.relaunch?.needed && i.status !== "dropped";
    if (filter === "overdue") return isOverdue(i);
    return i.status === filter;
  }

  function applyFilter() {
    const rows = [...tree.querySelectorAll<HTMLElement>(".bt-tree-row")];
    if (filter === "all") { rows.forEach((r) => r.removeAttribute("hidden")); return; }
    const items = new Map(state.draft.items.map((i) => [i.id, i]));
    const show = new Set<string>();
    for (const i of state.draft.items) {
      if (i.type === "track" || !matches(i)) continue;
      for (let x: DItem | undefined = i, n = 0; x && n < 10; x = x.parentId ? items.get(x.parentId) : undefined, n++) show.add(x.id);   // the item and everything above it
    }
    rows.forEach((r) => { if (show.has(r.dataset.id!)) r.removeAttribute("hidden"); else r.setAttribute("hidden", ""); });
  }

  function render() {
    const items = state.draft.items;
    empty.hidden = items.length > 0;
    tree.hidden = items.length === 0;
    note.hidden = items.length === 0;
    if (!items.length) { tree.innerHTML = ""; return; }
    tree.innerHTML = flatten(items).map(({ item, depth }) => row(item, depth, childrenOf(items, item.id).length > 0)).join("");
    handle.apply();
    applyFilter();
  }

  // Treeitems share one container, so one listener (initTree already handles the carets).
  tree.addEventListener("click", async (e) => {
    const t = e.target as HTMLElement;
    const rowEl = t.closest<HTMLElement>(".bt-tree-row");
    if (!rowEl) return;
    const item = state.draft.items.find((i) => i.id === rowEl.dataset.id);
    if (!item) return;
    const cycle = t.closest<HTMLButtonElement>("[data-cycle]");
    if (cycle && item.status) {
      cycle.disabled = true;
      try { await setStatus(item.id, STATUS_ORDER[(STATUS_ORDER.indexOf(item.status as Status) + 1) % STATUS_ORDER.length]); }
      catch (err) { toast(messageFor(err), { kind: "error" }); }
      render(); onChange();
      return;
    }
    const mv = t.closest<HTMLButtonElement>("[data-move]");
    if (mv) {
      mv.disabled = true;
      try { await moveItem(item.id, mv.dataset.move as "up" | "down"); } catch (err) { toast(messageFor(err), { kind: "error" }); }
      render(); onChange();
      return;
    }
    const add = t.closest<HTMLElement>("[data-add]");
    if (add) { openItemEditor({ add: { type: add.dataset.add as DItem["type"], parent: item }, onDone: () => { collapsed.delete(item.id); render(); onChange(); toast("Saved as a draft"); } }); return; }
    if (t.closest("[data-edit]")) openItemEditor({ item, onDone: () => { render(); onChange(); toast("Saved as a draft"); } });
  });

  host.querySelector("[data-filters]")!.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-f]");
    if (!b) return;
    filter = b.dataset.f as Filter;
    host.querySelectorAll<HTMLElement>("[data-f]").forEach((x) => { const on = x === b; x.classList.toggle("is-active", on); x.setAttribute("aria-pressed", String(on)); });
    applyFilter();
  });
  host.querySelector("[data-add-track]")!.addEventListener("click", () => openItemEditor({ add: { type: "track", parent: null }, onDone: () => { render(); onChange(); toast("Saved as a draft"); } }));
  host.querySelector<HTMLButtonElement>("[data-seed]")!.addEventListener("click", async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    btn.disabled = true; btn.textContent = "Loading…";
    try { await seedPlan(); await loadDraft(); render(); onChange(); toast("The starting plan is loaded as a draft"); }
    catch (err) { toast(messageFor(err), { kind: "error" }); btn.disabled = false; btn.textContent = "Load the starting plan"; }
  });
  return { render };
}
