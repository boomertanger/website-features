// shared/ui/prize-box.js — Prize Box markup shared by the site and the UI Kit page (docs/specs/prize-box.md §2 "Wordmark", §9;
// mockup prize-box-wordmark.html, pick I2 "Wheel on the box"):
//   PB_ICON   the wordmark icon, a tiny prize stand: the F2 wheel (--bt-wheel-*) on the Prize Box (.bt-pb-icon). Inside
//             .bt-wordmark--power its power-on (hover, focus, .is-lit) spins the wheel one and a half turns, ticks the paddle and jolts
//             the lid as it lands; touch screens play it once on scroll-in (initPowerWordmarks in shared/ui/wordmark.js). Reduced
//             motion: colour and glow only. Colours come from .bt-pb-icon in bt-ui.css (the wood is the --pz-* feature properties).
//
//   <span class="bt-wordmark bt-wordmark--power" tabindex="0">
//     <span class="bt-wordmark-icon">${PB_ICON}</span>
//     <span class="bt-wordmark-text">PRIZE<span class="bt-wordmark-accent">BOX</span></span></span>
// The first top-bar link is the area's home, so the wordmark isn't a link (tabindex="0" keeps the keyboard power-on).

export const PB_ICON = `<svg class="bt-pb-icon" viewBox="0 0 36 36" aria-hidden="true" focusable="false">`
  + `<rect class="post" x="17" y="20" width="2" height="6"/><circle class="rim" cx="18" cy="12.5" r="11.3"/>`
  + `<g class="wheel"><path d="M18 12.5 L16.78 2.57 A10 10 0 0 1 22.85 3.75 Z" style="fill:var(--bt-wheel-1)"/><path d="M18 12.5 L22.85 3.75 A10 10 0 0 1 27.06 8.27 Z" style="fill:var(--bt-wheel-2)"/><path d="M18 12.5 L27.06 8.27 A10 10 0 0 1 27.82 14.41 Z" style="fill:var(--bt-wheel-3)"/><path d="M18 12.5 L27.82 14.41 A10 10 0 0 1 24.82 19.81 Z" style="fill:var(--bt-wheel-4)"/><path d="M18 12.5 L24.82 19.81 A10 10 0 0 1 19.22 22.43 Z" style="fill:var(--bt-wheel-5)"/><path d="M18 12.5 L19.22 22.43 A10 10 0 0 1 13.15 21.25 Z" style="fill:var(--bt-wheel-6)"/><path d="M18 12.5 L13.15 21.25 A10 10 0 0 1 8.94 16.73 Z" style="fill:var(--bt-wheel-7)"/><path d="M18 12.5 L8.94 16.73 A10 10 0 0 1 8.18 10.59 Z" style="fill:var(--bt-wheel-8)"/><path d="M18 12.5 L8.18 10.59 A10 10 0 0 1 11.18 5.19 Z" style="fill:var(--bt-wheel-9)"/><path d="M18 12.5 L11.18 5.19 A10 10 0 0 1 16.78 2.57 Z" style="fill:var(--bt-wheel-10)"/><circle class="hub" cx="18" cy="12.5" r="2.6"/></g>`
  + `<path class="flap" d="M16.6 0.4h2.8l-1.4 4.2z"/>`
  + `<g class="body"><rect class="wood" x="9" y="25" width="18" height="10" rx="1.5"/><path class="ribbon" d="M16.6 25v10M19.4 25v10"/></g>`
  + `<g class="lid"><rect class="wood" x="8" y="23" width="20" height="3.4" rx="1"/></g></svg>`;

/** The PRIZE BOX power wordmark (not a link). */
export const pbWordmarkHtml = () => `<span class="bt-wordmark bt-wordmark--power" tabindex="0" aria-label="Prize Box"><span class="bt-wordmark-icon">${PB_ICON}</span><span class="bt-wordmark-text" aria-hidden="true">PRIZE<span class="bt-wordmark-accent">BOX</span></span></span>`;
