// Bug Zapper art (docs/specs/bug-zapper.md Appendix A; docs/design/mockups/bug-zapper-mockups.html, Icon I1 Porch zapper and Hero H1 Porch light): the
// BUGZAPPER wordmark's icon (BZ_ICON, bzIcon: M1 Hanging lantern with E4 Big zap, docs/specs/bug-zapper-icon.md; it rests, and on power-on the tube lights,
// a moth flies in and a forked bolt bursts out, bug-zapper.css) and the hero's
// hanging lamp (bzLamp: the L2 Porch lantern, drawn at full size with a UV violet tube, docs/specs/bug-zapper-lamp.md), plus the page's small icons.
// Bug-Zapper-only, so it lives with the feature, not the kit. Each copy needs unique gradient ids.

let n = 0;
const uid = (p: string) => `${p}${++n}`;

const MOTH = `<path class="wing w1" d="M0 0C-2.8-2.6-4.6-.6-3.6 1.6C-2.4 2-1 1.2 0 0Z"/><path class="wing w2" d="M0 0C2.8-2.6 4.6-.6 3.6 1.6C2.4 2 1 1.2 0 0Z"/><ellipse class="body" cx="0" cy=".8" rx=".85" ry="2"/>`;
export const mothSvg = () => `<svg viewBox="-5 -3.4 10 7" aria-hidden="true">${MOTH}</svg>`;

/** The wordmark icon, M1 Hanging lantern with E4 Big zap (docs/specs/bug-zapper-icon.md); u keeps its gradient ids unique. */
export const bzIcon = (u: string) => `<svg class="bz-icon bz-icon--lantern" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><defs><linearGradient id="${u}t" x1="0" x2="1"><stop offset="0" class="t-lo"/><stop offset=".5" class="t-hi"/><stop offset="1" class="t-lo"/></linearGradient><radialGradient id="${u}h"><stop offset="0" class="h-in"/><stop offset="1" class="h-out"/></radialGradient></defs>
<circle class="halo" cx="20" cy="22" r="15" fill="url(#${u}h)"/>
<circle class="ring" cx="20" cy="2.9" r="1.4"/><path class="hang" d="M20 4.3V6.4"/>
<path class="cap" d="M20 6.4L29.6 13H10.4Z"/>
<rect class="cap" x="9.4" y="12.8" width="21.2" height="2.2" rx=".8"/>
<path class="frame" d="M11.6 15H28.4L27.2 31.2H12.8Z"/>
<rect class="tube" x="17.6" y="17.2" width="4.8" height="11.8" rx="2.4" fill="url(#${u}t)"/>
<path class="wire" d="M15.4 15L15.8 31.2M24.6 15L24.2 31.2"/><path class="rung" d="M12.2 23.1H27.8"/>
<g class="arc a4"><path class="bg" d="M17.6 20.2L16.4 21.3L17.1 22.1L15.5 23.5"/><path class="bc" d="M17.6 20.2L16.4 21.3L17.1 22.1L15.5 23.5"/></g><path class="frame-line" d="M11.6 15H28.4L27.2 31.2H12.8Z"/>
<rect class="base" x="11.4" y="31.2" width="17.2" height="2.2" rx=".8"/>
<path class="base" d="M14 33.4H26L24 36.2H16Z"/><g transform="translate(33.4 15.2)"><g class="moth"><path class="wing w1" d="M0 0C-2.8-2.6-4.6-.6-3.6 1.6C-2.4 2-1 1.2 0 0Z"/><path class="wing w2" d="M0 0C2.8-2.6 4.6-.6 3.6 1.6C2.4 2 1 1.2 0 0Z"/><ellipse class="body" cx="0" cy=".8" rx=".85" ry="2"/></g></g>
<path class="zap" d="M28.4 18.2L30.6 19.9L29 21.1L31.5 22.9"/>
<g class="sparks"><circle cx="29.6" cy="19" r=".75"/><circle cx="30.8" cy="21.8" r=".6"/><circle cx="28.4" cy="22.6" r=".55"/><circle cx="31.4" cy="19.8" r=".5"/></g>
<circle class="ash" cx="28.8" cy="21.4" r=".75"/><circle class="flashc" cx="28.6" cy="20.4" r="4.2"/><g class="fork f1"><path class="bg" d="M28.4 20.3L31.2 18.4L30.2 20.9L34.4 19.6"/><path class="bc" d="M28.4 20.3L31.2 18.4L30.2 20.9L34.4 19.6"/></g><g class="fork f2"><path class="bg" d="M30.6 19.6L32.6 23.4"/><path class="bc" d="M30.6 19.6L32.6 23.4"/></g><g class="fork f3"><path class="bg" d="M29.6 21.6L31.4 25.2L30.4 25.4L32.6 27.8"/><path class="bc" d="M29.6 21.6L31.4 25.2L30.4 25.4L32.6 27.8"/></g></svg>`;
/** A unique id prefix for one bzIcon copy. */
export const iconId = () => uid("bzi");
/** The wordmark icon. */
export const BZ_ICON = bzIcon(iconId());
/** A unique id prefix for one bzLamp copy (its gradients). */
export const lampId = () => uid("bzl");
/** The hero's hanging lamp: L2 Porch lantern (docs/specs/bug-zapper-lamp.md, the mockup's "V1 UV violet"); u keeps its gradient ids unique. */
export function bzLamp(u: string) {
  return `<svg class="bz-lamp" viewBox="0 0 120 196" aria-hidden="true" focusable="false"><defs>
<linearGradient id="${u}m" x1="0" x2="1"><stop offset="0" class="i0"/><stop offset=".45" class="i1"/><stop offset="1" class="i0"/></linearGradient>
<linearGradient id="${u}t" x1="0" x2="1"><stop offset="0" class="t0"/><stop offset=".5" class="t1"/><stop offset="1" class="t0"/></linearGradient>
<linearGradient id="${u}g" x1="0" x2="1"><stop offset="0" class="g0"/><stop offset=".5" class="g1"/><stop offset="1" class="g0"/></linearGradient></defs>
<path class="cord" d="M60 0V16"/><circle class="ringo" cx="60" cy="20" r="4"/>
<path d="M60 24L94 50H26Z" fill="url(#${u}m)" class="edge"/><path class="sheen" d="M58 28L36 46"/>
<rect x="22" y="49" width="76" height="6" rx="2" fill="url(#${u}m)" class="edge"/>
<path d="M30 55H90L86 146H34Z" fill="url(#${u}g)"/>
<rect x="52" y="64" width="16" height="70" rx="8" fill="url(#${u}t)" class="tube"/>
<path class="wire" d="M44 55L43 146M60 55V146M76 55L77 146"/>
<path class="ring2" d="M31.2 80H88.8M32.4 105H87.6M33.5 128H86.5"/>
<path d="M30 55H90L86 146H34Z" class="frame"/>
<path class="glint" d="M35 60L38 140"/>
<rect x="28" y="146" width="64" height="6" rx="2" fill="url(#${u}m)" class="edge"/>
<path d="M36 152H84L76 162H44Z" fill="url(#${u}m)" class="edge"/><circle class="ringo" cx="60" cy="168" r="3"/></svg>`;
}

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
