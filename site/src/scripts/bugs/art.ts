// Bug Zapper art (docs/specs/bug-zapper.md Appendix A; docs/design/mockups/bug-zapper-mockups.html, Icon I1 Porch zapper and Hero H1 Porch light): the
// BUGZAPPER wordmark's porch-lamp icon (BZ_ICON: it rests; on hover or focus the tube lights and a moth flies in and is zapped, bug-zapper.css) and the hero's large
// hanging lamp (bzLamp), plus the page's small icons. Bug-Zapper-only, so it lives with the feature, not the kit. Each copy needs unique gradient ids.

let n = 0;
const uid = (p: string) => `${p}${++n}`;

const MOTH = `<path class="wing w1" d="M0 0C-2.8-2.6-4.6-.6-3.6 1.6C-2.4 2-1 1.2 0 0Z"/><path class="wing w2" d="M0 0C2.8-2.6 4.6-.6 3.6 1.6C2.4 2 1 1.2 0 0Z"/><ellipse class="body" cx="0" cy=".8" rx=".85" ry="2"/>`;
export const mothSvg = () => `<svg viewBox="-5 -3.4 10 7" aria-hidden="true">${MOTH}</svg>`;

export function porchIcon({ big = false, cls = "" }: { big?: boolean; cls?: string } = {}) {
  const u = uid("bzp");
  return `<svg class="bz-icon bz-icon--porch${big ? " bz-big bz-porch-svg" : ""}${cls ? " " + cls : ""}" viewBox="${big ? "9 -6 22 40" : "0 0 40 40"}" aria-hidden="true" focusable="false"><defs><linearGradient id="${u}t" x1="0" x2="1"><stop offset="0" class="t-lo"/><stop offset=".5" class="t-hi"/><stop offset="1" class="t-lo"/></linearGradient><radialGradient id="${u}h"><stop offset="0" class="h-in"/><stop offset="1" class="h-out"/></radialGradient></defs>
<circle class="halo" cx="20" cy="19.5" r="15" fill="url(#${u}h)"/>${big ? `<path class="hang" d="M20 -6V1.3"/>` : ""}
<path class="hang" d="M20 4.2V7.4"/><circle class="ring" cx="20" cy="2.8" r="1.5"/>
<path class="cap" d="M11.4 10.4C12.6 7.6 15.8 6.4 20 6.4S27.4 7.6 28.6 10.4Z"/>
<rect class="frame" x="12.6" y="10.4" width="14.8" height="17.6" rx="1.4"/>
<rect class="tube" x="17.5" y="12" width="5" height="14.4" rx="2.5" fill="url(#${u}t)"/>
<path class="wire" d="M14.7 10.4V28M16.1 10.4V28M23.9 10.4V28M25.3 10.4V28"/>
<path class="rung" d="M12.6 14.8H27.4M12.6 19.2H27.4M12.6 23.6H27.4"/>
<rect class="frame-line" x="12.6" y="10.4" width="14.8" height="17.6" rx="1.4"/>
<path class="base" d="M11.4 28H28.6C27.6 30.6 24.4 31.8 20 31.8S12.4 30.6 11.4 28Z"/>
${big ? "" : `<g transform="translate(33.4 12.6)"><g class="moth">${MOTH}</g></g>
<path class="zap" d="M28.2 14.6L30.6 16.4L28.9 17.6L31.4 19.6"/>
<g class="sparks"><circle cx="29.6" cy="15.6" r=".75"/><circle cx="30.8" cy="18.2" r=".6"/><circle cx="28.4" cy="19.4" r=".55"/><circle cx="31.4" cy="16.4" r=".5"/></g>
<circle class="ash" cx="28.9" cy="18.6" r=".75"/>`}</svg>`;
}
/** The wordmark icon. */
export const BZ_ICON = porchIcon();
/** The hero's large hanging lamp (no moth: the scene has its own). */
export const bzLamp = () => porchIcon({ big: true });

export const mascot = () => document.getElementById("bt-mascot-tpl")?.innerHTML ?? "";

const ic = (d: string, size = 16, sw = 2) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
export const BITE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><ellipse cx="12" cy="14" rx="5" ry="6.5"/><path d="M12 7.5V20.5M9 4l1.6 3.4M15 4l-1.6 3.4M7 11.5L3.5 10M7 15H3M7.6 18.5l-3 2M17 11.5l3.5-1.5M17 15h4M16.4 18.5l3 2"/></svg>`;
export const LINK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>`;
export const LOCK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;
export const DEAD_BUG = `<svg class="bz-deadbug" viewBox="0 0 34 24" aria-hidden="true" focusable="false"><path class="leg" d="M9 12L5 4M14 11L12 2M20 11L22 2M25 12L29 4"/><path class="bug" d="M5 14C5 9 10 8 17 8S29 9 29 14C29 19 24 21 17 21S5 19 5 14Z"/><path class="x" d="M9 12l3 3M12 12l-3 3M22 12l3 3M25 12l-3 3"/></svg>`;
export const I = {
  plus: ic('<path d="M12 5v14M5 12h14"/>', 14, 2.5),
  book: ic('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5"/>', 14),
  eyeOff: ic('<path d="M3 3l18 18M10.6 6.1A9.7 9.7 0 0 1 12 6c5 0 9 6 9 6a16 16 0 0 1-2.9 3.4M6.6 6.6A16 16 0 0 0 3 12s4 6 9 6a9 9 0 0 0 4.4-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2"/>', 14),
  eye: ic('<path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z"/><circle cx="12" cy="12" r="3"/>', 14),
  trash: ic('<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>', 14),
  pencil: ic('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>', 14),
  shield: '<svg viewBox="0 0 24 24" stroke="none" aria-hidden="true" focusable="false"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>',
  search: ic('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', 16),
};
