// shared/ui/poster.js — .bt-poster, a card of Boomer's usual week (docs/design-system.md §5 "Scream Planner pieces").
// Text is escaped; arguments ending in Html are trusted markup.
//
//   posterHtml({ id, day, icon, label, timeText, platformsHtml, backstage, off, selected, editable })
//        day "Mon"; icon the theme emoji; backstage swaps the platform row for the Fan Club velvet badge and the velvet tone;
//        off draws the dashed, faded "Day off" card; selected is the one open in the editor; editable adds the ✎ button
//        (data-ed="id") and makes the card focusable (tabindex 0, data-ed).
//   posterAddHtml(day)                the "+" circle that goes on a day-off poster in the editor (data-add-slot)
//   Wrap seven in <div class="bt-posters">: a grid of seven, a scrolling row at 640px and below.
import { escapeHtml as esc } from "./dom.js";
import { velvetHtml, platformsHtml as plats } from "./scream-planner.js";

export const posterAddHtml = (day = "") => `<button type="button" class="bt-poster-add" data-add-slot="${esc(day)}" aria-label="Add a slot on ${esc(day)}">+</button>`;

export function posterHtml({ id = "", day = "", icon = "", label = "", timeText = "", platformsHtml, backstage = false, off = false, selected = false, editable = false } = {}) {
  if (off) return `<div class="bt-poster is-off"><small>${esc(day)}</small><span class="bt-poster-ic" aria-hidden="true">💤</span><b>Day off</b><span class="bt-poster-time">&nbsp;</span>${editable ? posterAddHtml(day) : ""}</div>`;
  return `<div class="bt-poster${backstage ? " is-backstage" : ""}${selected ? " is-sel" : ""}"${editable ? ` data-ed="${esc(id)}" tabindex="0"` : ""}>`
    + `${editable ? `<button type="button" class="bt-poster-edit" data-ed="${esc(id)}" aria-label="Edit ${esc(label)}">✎</button>` : ""}`
    + `<small>${esc(day)}</small><span class="bt-poster-ic" aria-hidden="true">${esc(icon)}</span><b>${esc(label)}</b><span class="bt-poster-time">${esc(timeText)}</span>${backstage ? velvetHtml("Fan Club") : (platformsHtml ?? plats())}</div>`;
}
