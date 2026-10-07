// shared/ui/seats.js — the crew view's pieces: the seat map, the crew slot card and the crew bar (docs/design-system.md §5
// "Scream Planner pieces", docs/specs/scream-planner.md §8, mockup scream-planner-mockups.html "Crew sign-ups").
// Text is escaped; arguments ending in Html are trusted markup. The page owns the data and re-renders.
//
//   seatBoxHtml({ kind, name, role, note, seat, label, title })   .bt-sbox, one seat
//        kind  "taken" (someone else, with their avatar, name and role) · "open" (a dashed gold button: data-seat="seat")
//              · "mine" (you: primary edge; with `seat` it becomes a button, data-drop="seat", to drop it)
//              · "locked" (dimmed, dashed: your grade doesn't cover it; `title` says why)
//        seat  "captain" or "room:role" ("ytLandscape:lead", "twitch:deckhand"); role is the small word under the name
//   seatMapHtml({ captainHtml, rooms })   .bt-smap: the Captain row, then one .bt-smap-room per chat
//        rooms  [{ chat, name, boost, boxesHtml }]; boost ("×1.5") shows in gold at the right of the room's title
//   cslotHtml({ id, day, num, icon, label, timeHtml, count, games, metaHtml, state, backstage, sideHtml })   .bt-cslot
//        the crew's slot card: day tile, theme chip, time, game sockets (read-only covers; games [{ coverHtml }], empty ones "?"),
//        a line of text, and the right column (sideHtml: the tri-toggle, seat map and Ask for a game).
//        state "yes" lights a lime edge (you said Available).
//   crewBarHtml({ gradeHtml, statusHtml, monthHtml, notes })   .bt-crewbar: your chip, status, the month meter and notes
//   monthMeterHtml({ done, need })    .bt-month: little bars for this month's duties, lime when done (+ "1 of 2")
//   myReqHtml({ coverHtml, title, status })   .bt-myreq: "You asked for X" with where it stands (open | planned | notPlanned)
import { escapeHtml as esc, initials } from "./dom.js";
import { themeChipHtml, velvetHtml } from "./scream-planner.js";
import { platformIconHtml } from "./crew.js";

const ROLE = { captain: "Captain", lead: "Lead", deckhand: "Deckhand" };

export function seatBoxHtml({ kind = "open", name = "", role = "", note = "", seat = "", label = "", title = "" } = {}) {
  const who = `<span class="bt-av" aria-hidden="true">${esc(initials(name || "?"))}</span><span><b>${esc(name)}</b><i>${esc(note || ROLE[role] || role)}</i></span>`;
  if (kind === "open") return `<button type="button" class="bt-sbox is-open" data-seat="${esc(seat)}"${title ? ` title="${esc(title)}"` : ""}>+ ${esc(label || ROLE[role] || "Seat")}</button>`;
  if (kind === "locked") return `<span class="bt-sbox is-locked" aria-disabled="true"${title ? ` title="${esc(title)}"` : ""}>${esc(label)}</span>`;
  if (kind === "mine") {
    const inner = `<span class="bt-av" aria-hidden="true">${esc(initials(name || "You"))}</span><span><b>You</b><i>${esc(note || ROLE[role] || "")}</i></span>`;
    return seat
      ? `<button type="button" class="bt-sbox is-mine" data-drop="${esc(seat)}" title="Tap to drop this seat">${inner}</button>`
      : `<span class="bt-sbox is-mine">${inner}</span>`;
  }
  return `<span class="bt-sbox">${who}</span>`;
}

export function seatMapHtml({ captainHtml = "", rooms = [] } = {}) {
  const room = (r) => `<div class="bt-smap-room${/^yt/.test(r.chat) ? " is-yt" : ""}" data-room="${esc(r.chat)}"><span class="bt-smap-h">${platformIconHtml(r.chat)}${esc(r.name || r.chat)}${r.boost ? `<em>${esc(r.boost)}</em>` : ""}</span>${r.boxesHtml || ""}</div>`;
  return `<div class="bt-smap"><div class="bt-smap-cap"><small>⚓ Captain</small>${captainHtml}</div><div class="bt-smap-grid">${rooms.map(room).join("")}</div></div>`;
}

export function cslotHtml({ id = "", day = "", num = "", icon = "", label = "", timeHtml = "", count = 2, games = [], metaHtml = "", state = "", backstage = false, sideHtml = "" } = {}) {
  const socks = backstage ? "" : Array.from({ length: count }, (_, k) => games[k]
    ? `<span class="bt-sock">${games[k].coverHtml}</span>`
    : `<span class="bt-sock"><span class="bt-sock-empty" aria-label="Not picked yet">?</span></span>`).join("");
  return `<div class="bt-cslot${state === "yes" ? " is-yes" : ""}${backstage ? " is-backstage" : ""}" data-slot="${esc(id)}" role="group" aria-label="${esc(label)}, ${esc(day)} ${esc(num)}">`
    + `<div class="bt-slot-day"><small>${esc(String(day).toUpperCase())}</small><b>${esc(num)}</b></div>`
    + `<div class="bt-slot-mid"><div class="bt-slot-l1">${themeChipHtml({ icon, label })}<span class="bt-slot-time">${timeHtml}</span></div>${socks ? `<div class="bt-slot-socks">${socks}</div>` : ""}${metaHtml ? `<span class="bt-meta">${metaHtml}</span>` : ""}</div>`
    + `<div class="bt-cslot-side">${backstage ? `${velvetHtml()}<span class="bt-meta">Backstage streams have no chats to crew. Watch with everyone else.</span>` : sideHtml}</div></div>`;
}

export function monthMeterHtml({ done = 0, need = 2 } = {}) {
  const n = Math.max(need, done);
  return `<span class="bt-month" role="img" aria-label="${esc(`${done} of ${need} duties`)}">${Array.from({ length: n }, (_, i) => `<i class="${i < done ? "on" : ""}"></i>`).join("")}</span> <b>${esc(done)} of ${esc(need)}</b>`;
}

export const crewBarHtml = ({ gradeHtml = "", statusHtml = "", monthHtml = "", notes = [] } = {}) =>
  `<div class="bt-crewbar">${gradeHtml}${statusHtml}${monthHtml ? `<span>${monthHtml}</span>` : ""}${notes.map((n) => `<span>${n}</span>`).join("")}</div>`;

const REQ = { open: "Waiting for Boomer", planned: "Boomer planned it ✓", notPlanned: "Not planned this time" };
export const myReqHtml = ({ coverHtml = "", title = "", status = "open", extra = "" } = {}) =>
  `<div class="bt-myreq" data-status="${esc(status)}">${coverHtml}<span><b>You asked for ${esc(title)}</b><br><span class="bt-meta">${esc(REQ[status] || REQ.open)}${extra ? ` · ${esc(extra)}` : ""}</span></span></div>`;
