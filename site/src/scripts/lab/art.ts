// Feature Lab art (docs/specs/feature-lab.md Appendix A; docs/design/mockups/feature-lab-icon.html, option 3 "Bright idea"):
// the FEATURELAB wordmark's bulb-flask icon (it rests; on hover or focus the bubbles rise and the filament lights, feature-lab.css),
// the bench scene's big flask, and the page's small icons. Lab-only, so it lives with the feature, not the kit.

let uid = 0;
/** The Bright idea icon. Each instance gets its own gradient ids (spec Appendix A: <uid> must be unique per instance). */
export function flIcon() {
  const id = `fl-g${++uid}`;
  return `<svg class="fl-icon" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><defs><radialGradient id="${id}" cx=".4" cy=".3" r=".8"><stop offset="0" class="s-hi"/><stop offset="1" class="s-lo"/></radialGradient><radialGradient id="${id}h"><stop offset="0" class="h-in"/><stop offset="1" class="h-out"/></radialGradient></defs><path class="glass" d="M16.5 6.5V15.6A11 11 0 1 0 23.5 15.6V6.5Z"/><circle class="halo" cx="20" cy="23.4" r="9" fill="url(#${id}h)"/><path class="liq" fill="url(#${id})" d="M11.3 30Q20 28.6 28.7 30A9.6 9.6 0 0 1 11.3 30Z"/><circle class="in" cx="17" cy="33" r="1"/><circle class="in" cx="23.4" cy="32.6" r="1.2"/><path class="post" d="M18 13.5V22.6M22 13.5V22.6"/><path class="fil" d="M17.2 23.2c.6-2.1 1.5-2.1 2 0s1.4 2.1 2 0 1.4-2.1 2 0"/><path class="outline" d="M16.5 6.5V15.6A11 11 0 1 0 23.5 15.6V6.5"/><path class="thread" d="M16.5 8.6l7-1.2M16.5 11.2l7-1.2M16.5 13.8l7-1.2"/><path class="shine" d="M12.6 23.2A8.4 8.4 0 0 1 16.2 18.4"/><rect class="lip" x="14.6" y="4.4" width="10.8" height="2.6" rx="1.3"/><circle class="up u1" cx="20" cy="9" r="1.5"/><circle class="up u2" cx="21.5" cy="9" r="1"/><circle class="up u3" cx="19" cy="9" r="1.2"/></svg>`;
}
export const FL_ICON = flIcon();

/** The big bubbling flask on the bench (and in the empty states and the Idea posted moment). */
export const bigFlask = () => `<svg class="fl-big" viewBox="0 0 80 110" aria-hidden="true" focusable="false"><circle class="bub" cx="40" cy="62" r="4"/><circle class="bub" cx="34" cy="70" r="3"/><circle class="bub" cx="46" cy="66" r="3.5"/><circle class="bub" cx="40" cy="74" r="2.5"/><path class="liq" d="M14 78a26 26 0 0 0 52 0Z"/><path class="glass" d="M31 8h18M33 8v30A30 30 0 1 0 47 38V8"/><path class="line" d="M15 78h50"/></svg>`;

export const mascot = () => document.getElementById("bt-mascot-tpl")?.innerHTML ?? "";

const ic = (d: string, size = 16, sw = 2) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
export const I = {
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="18 15 12 9 6 15"></polyline></svg>',
  plus: ic('<path d="M12 5v14M5 12h14"/>', 14, 2.5),
  help: ic('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17h.01"/>'),
  cmt: '<svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false"><path d="M3 5.5C3 4.67 3.67 4 4.5 4h11c.83 0 1.5.67 1.5 1.5v7c0 .83-.67 1.5-1.5 1.5H8L4.5 17v-3C3.67 14 3 13.33 3 12.5v-7Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  x: ic('<path d="M6 6l12 12M18 6 6 18"/>', 16, 2.2),
  shield: ic('<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z"/>', 12, 2.2),
  pencil: ic('<path d="M4 20h4L19 9l-4-4L4 16v4Z"/>', 14),
  trash: ic('<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>', 14),
  eye: ic('<path d="M3 3l18 18M10.6 6.2A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a15 15 0 0 1-2.6 3.1M6.3 7.9C4.2 9.4 3 12 3 12s4 6 9 6c1.2 0 2.3-.3 3.3-.8"/>', 14),
  eyeOpen: ic('<path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z"/><circle cx="12" cy="12" r="3"/>', 14),
};

export const boombot = (id: string) => `<svg class="bt-boombot" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="h0"/><stop offset="1" class="h1"/></linearGradient></defs><path class="b-ant" d="M20 9V4.5"/><circle class="b-knob" cx="20" cy="3.6" r="2.6"/><rect class="b-ear" x="2.4" y="17" width="3.4" height="9" rx="1.6"/><rect class="b-ear" x="34.2" y="17" width="3.4" height="9" rx="1.6"/><rect class="b-head" x="5.5" y="9" width="29" height="25" rx="8" fill="url(#${id})"/><rect class="b-visor" x="9.5" y="14.5" width="21" height="10.5" rx="5.2"/><g class="b-eyes"><rect class="b-eye" x="13" y="17.2" width="4.4" height="5" rx="2.2"/><rect class="b-eye" x="22.6" y="17.2" width="4.4" height="5" rx="2.2"/></g><path class="b-mouth" d="M15.5 29.5h9"/></svg>`;
