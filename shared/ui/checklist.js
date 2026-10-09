// shared/ui/checklist.js — .bt-checklist, the owner's private beat checklist rows (docs/design-system.md §5 "Control Room pieces",
// docs/specs/control-room.md §5). .bt-task-row is an activity row with XP and a progress bar, so it doesn't fit; this is its own piece:
// groups per beat (the current beat open, the others folded to a progress chip like "Break 1 · 3 of 5") of tick rows. A row is a real
// checkbox label; ticking pops the box. Text is escaped.
//
//   checklistHtml({ groups, label })
//     groups  [{ id, title, open, items: [{ id, text, note, shortcut, done }] }]
//             shortcut: the name of a control the row can run ("Open check-in"), shown as purple text
//   initChecklist(root, { onToggle(itemId, done, groupId) })   wires every .bt-checklist: ticking toggles .is-done and the progress chip;
//        the group button folds and unfolds (aria-expanded). Also fires a bubbling "bt-checklist-toggle" CustomEvent.
//   tickChecklistItem(root, itemId, done = true)   tick a row from outside (a shortcut that ran its control)
import { escapeHtml as esc } from "./dom.js";

const TICK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>`;
let uid = 0;

const itemHtml = (it, gid) => {
  const id = `bt-cl-${++uid}`;
  return `<label class="bt-checklist-item${it.done ? " is-done" : ""}" data-item="${esc(it.id ?? id)}" data-group="${esc(gid)}" for="${id}">`
    + `<input type="checkbox" id="${id}"${it.done ? " checked" : ""}><span class="bt-checklist-box">${TICK}</span>`
    + `<span class="bt-checklist-t"><span class="bt-checklist-text">${esc(it.text ?? "")}</span>${it.note ? `<small>${esc(it.note)}</small>` : ""}${it.shortcut ? `<span class="bt-checklist-short">${esc(it.shortcut)}</span>` : ""}</span></label>`;
};

export function checklistHtml({ groups = [], label = "Checklist" } = {}) {
  return `<div class="bt-checklist" role="group" aria-label="${esc(label)}">${groups.map((g, gi) => {
    const gid = g.id ?? `g${gi}`;
    const items = g.items ?? [];
    const done = items.filter((i) => i.done).length;
    const open = !!g.open;
    const pid = `bt-clg-${++uid}`;
    return `<div class="bt-checklist-group${open ? " is-open" : ""}" data-group="${esc(gid)}"><button type="button" class="bt-checklist-head" aria-expanded="${open}" aria-controls="${pid}"><span>${esc(g.title ?? "")}</span><span class="bt-badge bt-badge--${done === items.length && items.length ? "green" : "gray"} bt-checklist-prog" data-total="${items.length}">${done} of ${items.length}</span></button>`
      + `<div class="bt-checklist-items" id="${pid}"${open ? "" : " hidden"}>${items.map((i) => itemHtml(i, gid)).join("")}</div></div>`;
  }).join("")}</div>`;
}

function refresh(group) {
  const boxes = [...group.querySelectorAll(".bt-checklist-item input")];
  const done = boxes.filter((b) => b.checked).length;
  const prog = group.querySelector(".bt-checklist-prog");
  if (prog) {
    prog.textContent = `${done} of ${boxes.length}`;
    prog.classList.toggle("bt-badge--green", done === boxes.length && boxes.length > 0);
    prog.classList.toggle("bt-badge--gray", !(done === boxes.length && boxes.length > 0));
  }
}

export function tickChecklistItem(root, itemId, done = true) {
  const row = [...root.querySelectorAll(".bt-checklist-item")].find((r) => r.dataset.item === String(itemId));
  const box = row?.querySelector("input");
  if (!box || box.checked === done) return;
  box.checked = done;
  row.classList.toggle("is-done", done);
  const g = row.closest(".bt-checklist-group");
  if (g) refresh(g);
}

export function initChecklist(root = document, { onToggle } = {}) {
  root.querySelectorAll(".bt-checklist:not([data-cl-ready])").forEach((list) => {
    list.dataset.clReady = "";
    list.addEventListener("change", (e) => {
      const box = e.target.closest(".bt-checklist-item input");
      if (!box) return;
      const row = box.closest(".bt-checklist-item");
      row.classList.toggle("is-done", box.checked);
      const g = row.closest(".bt-checklist-group");
      if (g) refresh(g);
      onToggle?.(row.dataset.item, box.checked, row.dataset.group);
      list.dispatchEvent(new CustomEvent("bt-checklist-toggle", { bubbles: true, detail: { id: row.dataset.item, done: box.checked, group: row.dataset.group } }));
    });
    list.addEventListener("click", (e) => {
      const head = e.target.closest(".bt-checklist-head");
      if (!head || !list.contains(head)) return;
      const g = head.closest(".bt-checklist-group");
      const open = head.getAttribute("aria-expanded") !== "true";
      head.setAttribute("aria-expanded", String(open));
      g.classList.toggle("is-open", open);
      g.querySelector(".bt-checklist-items").hidden = !open;
    });
  });
}
