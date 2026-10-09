// shared/ui/cr-panel.js — .bt-cr-panel, the Control Room panel: a card with a head row (docs/design-system.md §5 "Control Room
// pieces", docs/specs/control-room.md §7c, §15). In the default look it is a plain card with the gold tick before its heading. The
// looks (site/src/styles/control-room-looks.css) light the head: an icon tile, a status light, a scan line. The decoration spans are
// always in the markup (aria-hidden) and hidden unless a look shows them, so every look shares one set of markup. Text is escaped;
// arguments ending in Html are trusted markup.
//
//   CR_HEAD_ICONS                       small stroke icons by key: checkin, now, crew, questions, watch, backstage, launch,
//                                       checklist, beats, stats, game, video, controls
//   crPanelHeadHtml({ title, icon, tagHtml, actionsHtml, level })   the .bt-cr-panel-head row (title is a .bt-heading h2; level 2-4)
//   crPanelHtml({ id, cls, title, icon, tagHtml, actionsHtml, bodyHtml, label, level })   the whole .bt-cr-panel section
//   crViewportHtml({ innerHtml, overlayHtml, label })   .bt-cr-viewport: the frame round the video (gold corner brackets; the hull look draws a
//        breathing targeting frame, the CRT look a TV with its control strip). innerHtml is the player, in a 16:9 .bt-cr-screen;
//        overlayHtml sits on top of it (the live beacon, a tag).
import { escapeHtml as esc } from "./dom.js";

export const CR_HEAD_ICONS = {
  checkin: `<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><circle cx="12" cy="12" r="5"/>`,
  now: `<rect x="3" y="6" width="18" height="12" rx="3"/><path d="M8 12h3M9.5 10.5v3M15 11h.01M17 13h.01"/>`,
  crew: `<circle cx="9" cy="9" r="3"/><circle cx="17" cy="10" r="2.4"/><path d="M3 19c0-3 3-5 6-5s6 2 6 5M15 19c0-2 1.5-3.6 4-3.6"/>`,
  questions: `<path d="M9 9a3 3 0 1 1 4 2.8c-.8.3-1 .9-1 1.7V14M12 18h.01"/><circle cx="12" cy="12" r="9"/>`,
  watch: `<path d="M5 12.5a10 10 0 0 1 14 0M8 15.5a5.5 5.5 0 0 1 8 0"/><circle cx="12" cy="18.5" r="1"/>`,
  backstage: `<path d="M4 4h16v16H4z"/><path d="M4 4c3 3 3 13 0 16M20 4c-3 3-3 13 0 16"/>`,
  launch: `<path d="M5 19l4-1 9-9a2.8 2.8 0 0 0-4-4l-9 9zM14 6l4 4"/>`,
  checklist: `<path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>`,
  beats: `<circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><path d="M7 12h3M14 12h3"/>`,
  stats: `<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>`,
  game: `<rect x="3" y="6" width="18" height="12" rx="3"/><path d="M8 12h3M9.5 10.5v3M15 11h.01M17 13h.01"/>`,
  video: `<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z"/>`,
  controls: `<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>`,
};

export function crPanelHeadHtml({ title = "", icon = "", tagHtml = "", actionsHtml = "", level = 2 } = {}) {
  const h = Math.min(4, Math.max(2, Number(level) || 2));
  const ico = CR_HEAD_ICONS[icon] || CR_HEAD_ICONS.stats;
  return `<div class="bt-cr-panel-head"><span class="bt-cr-hico" aria-hidden="true"><svg viewBox="0 0 24 24">${ico}</svg></span><h${h} class="bt-heading">${esc(title)}</h${h}><span class="bt-cr-sp"></span>${tagHtml}${actionsHtml}<span class="bt-cr-led" aria-hidden="true"></span><span class="bt-cr-scan" aria-hidden="true"></span></div>`;
}

export function crPanelHtml({ id = "", cls = "", title = "", icon = "", tagHtml = "", actionsHtml = "", bodyHtml = "", label = "", level = 2 } = {}) {
  return `<section class="bt-cr-panel${cls ? ` ${esc(cls)}` : ""}"${id ? ` id="${esc(id)}"` : ""} aria-label="${esc(label || title)}">${crPanelHeadHtml({ title, icon, tagHtml, actionsHtml, level })}${bodyHtml}</section>`;
}

export const crViewportHtml = ({ innerHtml = "", overlayHtml = "", label = "Video" } = {}) =>
  `<div class="bt-cr-viewport" role="group" aria-label="${esc(label)}"><div class="bt-cr-screen">${innerHtml}${overlayHtml}</div><span class="bt-cr-strip" aria-hidden="true"></span></div>`;
