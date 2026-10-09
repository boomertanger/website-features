// shared/ui/swap.js — .bt-swap, a seat on the swap board (Mod Machina phase 3 part 1; docs/specs/mod-machina.md section 17a; docs/design-system.md §5 "Swap board").
//
//   swapRowHtml({ id, dow, day, chat, role, roomName, note, state, actionLabel })   one row (markup string, text escaped)
//     id           the swap's id (goes in data-swap, so a click handler can find it)
//     dow, day     the stream's day stub: "FRI", "16"
//     chat         "twitch" | "ytLandscape" | "ytVertical" | "tiktok" | "captain": picks the platform tile (none for the Captain seat)
//     role         "Lead", "Deckhand", "Captain" (the line's first words)
//     roomName     "Twitch", "YT Vertical" ...
//     note         the notice line under it: "Dropped by @mothlight · 3 days ahead · 7:00 PM"
//     state        "open" (gold, Take it) | "taken" (dimmed, no button) | "mine" (is-mine-now, a lime "Yours" badge)
//     actionLabel  the button's text for an open seat (default "Take it"); the button carries data-swap-take
//   swapsHtml(rowsHtml)   wraps rows in .bt-swaps
//
// Open means "needed", so it is GOLD, never red. The button is a plain .bt-btn: wire it with confirmAction() ("Take it" is one tap, then a confirmation) and toast the result.
import { escapeHtml as esc } from "./dom.js";
import { platformIconHtml } from "./crew.js";

const STATES = { open: "", taken: " is-taken", mine: " is-mine-now" };

export function swapRowHtml({ id = "", dow = "", day = "", chat = "", role = "", roomName = "", note = "", state = "open", actionLabel = "Take it" } = {}) {
  const st = Object.prototype.hasOwnProperty.call(STATES, state) ? state : "open";
  const tile = chat && chat !== "captain" ? `${platformIconHtml(chat)} ` : "";
  const title = [role, roomName].filter(Boolean).map(esc).join(" · ");
  const action = st === "open" ? `<button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-swap-take>${esc(actionLabel)}</button>` : st === "mine" ? `<span class="bt-badge bt-badge--lime">Yours</span>` : "";
  return `<div class="bt-swap${STATES[st]}" data-swap="${esc(id)}" data-state="${st}"><span class="bt-swap-day"><small>${esc(dow)}</small><b>${esc(day)}</b></span><span class="bt-swap-main"><b>${tile}${title}</b><small>${esc(note)}</small></span>${action}</div>`;
}

export const swapsHtml = (rowsHtml = "") => `<div class="bt-swaps">${rowsHtml}</div>`;
