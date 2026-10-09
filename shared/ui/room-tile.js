// shared/ui/room-tile.js — .bt-room-tile, one chat in the Mod Deck (Mod Machina phase 3 part 3; docs/design-system.md §5 "Mod Deck pieces"): the platform tile (the real logo when given, the
// landscape / vertical corner mark for the two YouTube chats), the name and ×1.5 boost tag, who leads and how many Deckhands, the viewer count (with a ✎ edit button for TikTok, whose count
// is typed in by hand), and the coverage state: data-state covered (lime top edge) · needed (GOLD, "Lead needed") · off (dimmed, not streaming). is-mine marks your own room (purple edge).
//
//   roomTileHtml({ chat, name, state, boost, lead, deckhands, note, viewers, editViewers, mine, take })   markup string (text escaped)
//     chat       "twitch" | "ytLandscape" | "ytVertical" | "tiktok";  name  the room's short name ("YT Vertical")
//     state      "covered" | "needed" | "off";  boost  "×1.5" (shown in gold) or "";  lead  "@handle" or null;  deckhands  a number or an array of "@handle"s
//     note       a short extra after the line ("also watching Vertical");  viewers  a number (or "–");  editViewers  true shows ✎ (data-room-edit) for the TikTok count
//     mine       is-mine;  take  true (or a label) adds the "Take the lead" button (data-room-take) on a needed room
//   roomTilesHtml(tilesHtml)   the row of tiles (.bt-room-tiles: four across, two at 1024, one at 640)
import { escapeHtml as esc } from "./dom.js";
import { platformIconHtml } from "./crew.js";

const STATES = ["covered", "needed", "off"];

export function roomTileHtml({ chat = "twitch", name = "", state = "covered", boost = "", lead = null, deckhands = 0, note = "", viewers = null, editViewers = false, mine = false, take = false, logo = "" } = {}) {
  const st = STATES.includes(state) ? state : "covered";
  const hands = Array.isArray(deckhands) ? deckhands : null, n = hands ? hands.length : Math.max(0, Number(deckhands) || 0);
  const who = st === "off" ? "Not streaming" : lead ? `<b>${esc(lead)}</b>${hands && n ? ` + ${esc(hands.join(", "))}` : n ? ` + ${n} deckhand${n === 1 ? "" : "s"}` : ""}${note ? ` · ${esc(note)}` : ""}` : `Lead needed${n ? ` · ${n} deckhand${n === 1 ? "" : "s"}` : ""}`;
  const v = st === "off" || viewers == null ? "" : `<span class="bt-room-tile-v"><strong>${esc(viewers)}</strong>viewers${editViewers ? `<button type="button" class="bt-room-tile-edit" data-room-edit title="Type tonight's count" aria-label="Type tonight's viewer count">✎</button>` : ""}</span>`;
  const takeBtn = take && st === "needed" ? `<span class="bt-room-tile-take"><button type="button" class="bt-btn bt-btn--secondary" data-room-take>${esc(typeof take === "string" ? take : "Take the lead")}</button></span>` : "";
  return `<div class="bt-room-tile${mine ? " is-mine" : ""}" data-state="${st}" data-room="${esc(chat)}">${platformIconHtml(chat, { logo })}<span class="bt-room-tile-name">${esc(name)}${boost ? `<span class="bt-room-tile-boost">${esc(boost)}</span>` : ""}</span>${v}<span class="bt-room-tile-who">${who}</span>${takeBtn}</div>`;
}

export const roomTilesHtml = (tilesHtml = "") => `<div class="bt-room-tiles">${tilesHtml}</div>`;
