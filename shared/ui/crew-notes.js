// shared/ui/crew-notes.js — .bt-crew-notes, the crew notes strip on the Mod Deck (Mod Machina phase 3 part 3; docs/specs/mod-machina.md section 17a "Crew notes strip"; docs/design-system.md §5
// "Mod Deck pieces"). Any crew member can post a note up to 200 characters; notes show newest first with the handle, a grade chip and how old they are, and vanish 24 hours after posting. Authors
// delete their own; admins any. NOT .bt-notes: that is the Warm Fuzzies pinboard.
//
//   crewNotesHtml({ notes, canPost, placeholder })   the strip (text escaped)
//     notes  [{ id, handle, avatarName, grade: { track, grade }, age: "2 min", text, deletable }]
//   initCrewNotes(root, { onPost(text), onDelete(id) })   Enter or Post sends a non-empty note (trimmed, up to 200); the field clears; a click on [data-note-delete] deletes
import { escapeHtml as esc, initials } from "./dom.js";
import { gradeChipHtml } from "./grade-chip.js";

export const NOTE_MAX = 200;

export function crewNotesHtml({ notes = [], canPost = true, placeholder = "Note for the crew" } = {}) {
  const rows = notes.map((n) => `<div class="bt-crew-note" data-note="${esc(n.id || "")}"><span class="bt-avatar-sm" aria-hidden="true">${esc(initials(n.avatarName || n.handle))}</span>`
    + `<span class="bt-crew-note-h"><b>${esc(n.handle)}</b>${n.grade ? gradeChipHtml(n.grade) : ""}<span>${esc(n.age || "")}</span>${n.deletable ? `<button type="button" class="bt-crew-note-x" data-note-delete aria-label="Delete this note">Delete</button>` : ""}</span><p>${esc(n.text)}</p></div>`).join("");
  const add = canPost ? `<div class="bt-crew-notes-add"><input class="bt-input" type="text" maxlength="${NOTE_MAX}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}" data-note-input><button type="button" class="bt-btn bt-btn--secondary" data-note-post>Post</button></div>` : "";
  return `<div class="bt-crew-notes">${rows || `<p class="bt-crew-notes-empty">No notes yet. Notes clear after 24 hours.</p>`}${add}</div>`;
}

export function initCrewNotes(root, { onPost, onDelete } = {}) {
  if (!root || root._notes) return;
  root._notes = true;
  const input = () => root.querySelector("[data-note-input]");
  const post = () => {
    const el = input(); if (!el) return;
    const text = el.value.trim().slice(0, NOTE_MAX);
    if (!text) return;
    el.value = "";
    onPost?.(text);
  };
  root.addEventListener("click", (e) => {
    if (e.target.closest("[data-note-post]")) return post();
    const d = e.target.closest("[data-note-delete]");
    if (d) onDelete?.(d.closest("[data-note]")?.dataset.note || "");
  });
  root.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches?.("[data-note-input]")) { e.preventDefault(); post(); } });
}
