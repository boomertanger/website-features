// shared/ui/scream-planner.js — Scream Planner parts used across its kit pieces (docs/design-system.md §5 "Scream Planner
// pieces", docs/specs/scream-planner.md §13). Text is escaped; arguments ending in Html are trusted markup.
//
//   SP_ICON                      the wordmark icon, a screaming tear-off calendar (.bt-sp-icon). Inside
//                                .bt-wordmark--power the top page rips away on hover, focus or touch and the mouth stretches.
//   <a class="bt-wordmark bt-wordmark--power" href="/schedule" aria-label="Scream Planner">
//     <span class="bt-wordmark-icon">${SP_ICON}</span>
//     <span class="bt-wordmark-text" aria-hidden="true">SCREAM <span class="bt-wordmark-accent">PLANNER</span></span></a>
//   themeChipHtml({ icon, label })              .bt-theme chip ("🥽 VR night")
//   velvetHtml(text = "Fan Club · members only")  .bt-velvet chip (the backstage badge, a key and the velvet colour)
//   platformsHtml(chats = [all four])           .bt-plats row of platform icons (twitch, ytLandscape, ytVertical, tiktok)
//   avatarsHtml(names, max = 4)                 .bt-avs overlapped initials
//   srcHtml(kind, extra = "")                   .bt-src where a planned game came from: mod | vote | theme | you
//   dualTimeHtml({ start, end, was, tz, localTz, central, local, localLabel })   .bt-dualtime
//        start/end: Date, ISO string or ms. Central text first, then your own time in localTz (default: the browser's
//        zone; skipped when it is the same clock as Central). was: the original start (struck out, for a delay).
//        central/local: ready-made strings instead of dates. localLabel defaults to "your time".
//   timeRangeText(start, end, tz)               "7–9 PM", "11 PM–1 AM"
//   dayParts(start, tz)                         { dow: "Wed", num: 7, month: "Oct" } in that zone (for ticket stubs)
import { escapeHtml as esc, initials } from "./dom.js";
import { platformIconHtml, PLATFORMS } from "./crew.js";

export const CENTRAL = "America/Chicago";

export const SP_ICON = `<svg class="bt-sp-icon" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><rect class="pad" x="5" y="7" width="30" height="29" rx="5"/><path class="rings" d="M13 4v6M27 4v6"/><text class="under" x="20" y="29" text-anchor="middle">14</text><g class="page"><rect x="5" y="11" width="30" height="25" rx="5"/><circle class="eye" cx="15" cy="19" r="2.2"/><circle class="eye" cx="25" cy="19" r="2.2"/><ellipse class="mouth" cx="20" cy="28" rx="3.4" ry="3.2"/></g></svg>`;

export const themeChipHtml = ({ icon = "", label = "" } = {}) => `<span class="bt-theme">${icon ? `<i aria-hidden="true">${esc(icon)}</i>` : ""}${esc(label)}</span>`;

const KEY = `<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="4" cy="6" r="2.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6.5 6H11M9.5 6v2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
export const velvetHtml = (text = "Fan Club · members only") => `<span class="bt-velvet">${KEY}${esc(text)}</span>`;

export const platformsHtml = (chats = Object.keys(PLATFORMS)) => `<span class="bt-plats">${chats.map((c) => platformIconHtml(c)).join("")}</span>`;

export const avatarsHtml = (names = [], max = 4) => `<span class="bt-avs" aria-hidden="true">${names.slice(0, max).map((n) => `<span class="bt-av">${esc(initials(n))}</span>`).join("")}</span>`;

const SRC = { mod: "Mod pick", vote: "Votes", theme: "Theme", you: "Your pick" };
export const srcHtml = (kind = "you", extra = "") => `<span class="bt-src bt-src--${SRC[kind] ? kind : "you"}">${SRC[kind] || SRC.you}${esc(extra)}</span>`;

const toDate = (v) => (v instanceof Date ? v : new Date(v));
function hm(d, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(d).map((x) => [x.type, x.value]));
  const ap = (p.dayPeriod || "").toUpperCase();
  return { t: p.minute === "00" ? p.hour : `${p.hour}:${p.minute}`, ap };
}
export function timeRangeText(start, end, tz = CENTRAL) {
  const a = hm(toDate(start), tz), b = hm(toDate(end), tz);
  return a.ap === b.ap ? `${a.t}–${b.t} ${b.ap}` : `${a.t} ${a.ap}–${b.t} ${b.ap}`;
}
export function dayParts(start, tz = CENTRAL) {
  const d = toDate(start), f = (o) => new Intl.DateTimeFormat("en-US", { timeZone: tz, ...o }).format(d);
  return { dow: f({ weekday: "short" }), num: Number(f({ day: "numeric" })), month: f({ month: "short" }) };
}
const clockKey = (d, tz) => new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false, day: "numeric" }).format(d);

/** The viewer's zone as a short name ("Pacific"), or "" when it is the same clock as Central right now. */
export function localZoneName(tz = CENTRAL, localTz) {
  const ltz = localTz || (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : CENTRAL), now = new Date();
  if (clockKey(now, tz) === clockKey(now, ltz)) return "";
  const n = new Intl.DateTimeFormat("en-US", { timeZone: ltz, timeZoneName: "longGeneric" }).formatToParts(now).find((x) => x.type === "timeZoneName")?.value || "";
  return n.replace(/ Time$/, "") || "your time";
}
// mode "local" (the viewer picked My time): their own clock leads, Central follows.
export function dualTimeHtml({ start, end, was, tz = CENTRAL, localTz, central, local, localLabel = "your time", mode = "central" } = {}) {
  const ltz = localTz || (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : CENTRAL);
  const c = central ?? (start != null && end != null ? timeRangeText(start, end, tz) : "");
  const sameClock = start != null && clockKey(toDate(start), tz) === clockKey(toDate(start), ltz);
  const l = local ?? (start != null && end != null && !sameClock ? timeRangeText(start, end, ltz) : "");
  const wasText = was == null ? "" : (typeof was === "string" && !/^[0-9]{4}-[0-9][0-9]/.test(was)) ? was : (() => { const h = hm(toDate(was), tz); return `${h.t} ${h.ap}`; })();
  const w = wasText ? `<s>${esc(wasText)}</s>` : "";
  if (mode === "local" && l) {
    const lz = localZoneName(tz, ltz), lw = was == null || typeof was === "string" ? wasText : (() => { const h = hm(toDate(was), ltz); return `${h.t} ${h.ap}`; })();
    return `<span class="bt-dualtime"><b>${lw ? `<s>${esc(lw)}</s>` : ""}${esc(l)} <small>${esc(lz || "your time")}</small></b><span class="bt-dualtime-local">${esc(c)} Central</span></span>`;
  }
  return `<span class="bt-dualtime"><b>${w}${esc(c)} <small>Central</small></b>${l ? `<span class="bt-dualtime-local">${esc(l)} ${esc(localLabel)}</span>` : ""}</span>`;
}
