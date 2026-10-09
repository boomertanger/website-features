// shared/ui/deckplan.js — .bt-deckplan, the crew deck plan (docs/design-system.md §5 "Control Room pieces", docs/specs/control-room.md §7c).
// The ship's hull seen from above: the Bridge up front (the Stream Captain), one compartment per chat room behind it. A compartment with
// someone on duty is lit (green: staff and backstage are green) and its dot pings; one with nobody is an open seat (dashed, gold "needed").
// Text is escaped; arguments ending in Html are trusted markup (use platformIconHtml and gradeChipHtml for them).
//
//   deckplanHtml({ bridge, bays, label })
//     bridge  { name, people }                    the front compartment (name defaults to "Bridge")
//     bays    [{ name, iconHtml, people, open, need }]   people: [{ name, role, gradeHtml }]; open: true for an open seat; need: its text
//                                                 (default "Needs a lead")
//   deckBayHtml(bay)                              one .bt-deckplan-bay
import { escapeHtml as esc } from "./dom.js";

const STAR = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6L3 10l6-1z"/></svg>`;

const personHtml = (p) => `<div class="bt-deckplan-p"><span class="bt-deckplan-dot" aria-hidden="true"></span><span><b>${esc(p.name ?? "")}</b>${p.role ? `<small>${esc(p.role)}</small>` : ""}</span>${p.gradeHtml ?? ""}</div>`;

export function deckBayHtml({ name = "", iconHtml = "", people = [], open = false, need = "Needs a lead", cls = "" } = {}) {
  const inner = open || !people.length
    ? `<span class="bt-deckplan-need">${esc(need)}</span>`
    : people.map(personHtml).join("");
  return `<div class="bt-deckplan-bay ${open || !people.length ? "is-open" : "is-lit"}${cls ? ` ${esc(cls)}` : ""}"><div class="bt-deckplan-name">${iconHtml}<b>${esc(name)}</b></div>${inner}</div>`;
}

export function deckplanHtml({ bridge = {}, bays = [], label = "Crew deck plan" } = {}) {
  const b = { name: "Bridge", people: [], ...bridge };
  return `<div class="bt-deckplan" role="group" aria-label="${esc(label)}"><span class="bt-deckplan-scan" aria-hidden="true"></span>`
    + deckBayHtml({ name: b.name, iconHtml: STAR, people: b.people, open: !b.people.length, need: b.need || "Needs a captain", cls: "bt-deckplan-bridge" })
    + `<div class="bt-deckplan-bays">${bays.map(deckBayHtml).join("")}</div></div>`;
}
