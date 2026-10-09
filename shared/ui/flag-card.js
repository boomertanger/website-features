// shared/ui/flag-card.js — .bt-flag-card and .bt-flags, a flag to the owner (Mod Machina phase 3 part 3; docs/specs/mod-machina.md section 17a "Flag to owner"; docs/design-system.md §5 "Mod Deck
// pieces"). The gold card on the owner's controls (and on admins' Decks for urgent flags): the flag tile, the type, an Urgent tag, the room, the note, "who · when", and Got it / Done. is-new rings
// and waves its flag until it is seen; is-seen settles and only Done is left. Several flags stack in .bt-flags, newest first, with the "Tap to turn on sound" line when the browser blocks the chime.
// Gold is for flags: never red.
//
//   flagCardHtml({ id, type, urgent, room, note, by, ago, state, extra, icon })   one card (text escaped)
//     state  "new" | "seen" ("seen" adds " · seen by you" and drops Got it);  extra  " · also sent to admins on duty";  icon  the flag glyph (default ⚑)
//   flagsHtml(cardsHtml, { soundOff })   the stack; soundOff adds the sound line with its button (data-flags-sound)
//   initFlags(root, { onSeen(id), onDone(id), onSound })   delegated clicks on [data-flag-seen], [data-flag-done] and [data-flags-sound]
import { escapeHtml as esc } from "./dom.js";

export function flagCardHtml({ id = "", type = "", urgent = false, room = "", note = "", by = "", ago = "", state = "new", extra = "", icon = "⚑" } = {}) {
  const seen = state === "seen";
  return `<div class="bt-flag-card ${seen ? "is-seen" : "is-new"}" data-flag="${esc(id)}"><span class="bt-flag-ic" aria-hidden="true">${esc(icon)}</span>`
    + `<span class="bt-flag-main"><b>${esc(type)}${urgent ? '<span class="bt-flag-urgent">Urgent</span>' : ""}${room ? `<span class="bt-badge bt-badge--gray">${esc(room)}</span>` : ""}</b><p>${esc(note)}</p><small>${esc(by)}${ago ? ` · ${esc(ago)}` : ""}${seen ? " · seen by you" : ""}${extra ? ` · ${esc(extra)}` : ""}</small></span>`
    + `<span class="bt-flag-acts">${seen ? "" : `<button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-flag-seen>Got it</button>`}<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-flag-done>Done</button></span></div>`;
}

export function flagsHtml(cardsHtml = "", { soundOff = false } = {}) {
  return `<div class="bt-flags" role="region" aria-label="Flags">${cardsHtml}${soundOff ? `<div class="bt-flags-sound"><span>🔔 Sound is off until you tap the page once (browser rule).</span><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-flags-sound>Tap to turn on sound</button></div>` : ""}</div>`;
}

export function initFlags(root, { onSeen, onDone, onSound } = {}) {
  if (!root || root._flags) return;
  root._flags = true;
  root.addEventListener("click", (e) => {
    const t = e.target.closest("[data-flag-seen], [data-flag-done], [data-flags-sound]");
    if (!t || !root.contains(t)) return;
    const id = t.closest("[data-flag]")?.dataset.flag || "";
    if (t.matches("[data-flag-seen]")) onSeen?.(id);
    else if (t.matches("[data-flag-done]")) onDone?.(id);
    else onSound?.();
  });
}
