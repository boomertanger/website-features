// Drawn scenes for the /live page (docs/design/mockups/control-room-batch-1.html): the corridor of the waiting room's hero and the video frame's
// empty and gate states, and the small scene on each stage card of "How a stream runs". Plain strings so both the page (Astro, at build time) and the
// scripts can use them. Colours are the kit's tokens, never raw values; motion is CSS in styles/live-public.css (and stops under reduced motion).

/** The dark corridor with a flickering light and a red alarm. `id` keeps the gradients unique when two are on the page. */
export function corridorSvg(id = "lp-c") {
  return `<svg class="lp-scene" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
  <defs><radialGradient id="${id}a" cx="50%" cy="46%" r="60%"><stop offset="0" stop-color="var(--bt-surface-2)"/><stop offset="1" stop-color="var(--bt-bg)"/></radialGradient>
  <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--bt-surface-2)"/><stop offset="1" stop-color="var(--bt-bg)"/></linearGradient></defs>
  <rect width="640" height="360" fill="url(#${id}a)"/>
  <path d="M0 0 L250 120 L390 120 L640 0 Z" fill="var(--bt-bg)"/><path d="M0 360 L250 240 L390 240 L640 360 Z" fill="var(--bt-surface)"/>
  <path d="M0 0 L250 120 L250 240 L0 360 Z" fill="var(--bt-surface)"/><path d="M640 0 L390 120 L390 240 L640 360 Z" fill="var(--bt-surface)"/>
  <g stroke="var(--bt-border-2)" stroke-width="2" fill="none"><path d="M60 30 L60 330"/><path d="M130 63 L130 297"/><path d="M190 92 L190 268"/><path d="M580 30 L580 330"/><path d="M510 63 L510 297"/><path d="M450 92 L450 268"/></g>
  <rect x="250" y="120" width="140" height="120" fill="url(#${id}b)"/>
  <rect x="290" y="150" width="60" height="90" fill="var(--bt-bg)" stroke="var(--bt-border-2)"/>
  <rect class="lp-alarm" x="300" y="128" width="40" height="8" rx="2" fill="var(--bt-red)"/>
  <rect class="lp-flicker" x="270" y="104" width="100" height="5" fill="var(--bt-lamp)" opacity=".9"/>
  <g opacity=".08"><path class="lp-flicker" d="M270 109 L230 250 L410 250 L370 109Z" fill="var(--bt-lamp)"/></g>
  <path d="M312 240 q8-40 8-58 q0-8 6-8 q6 0 6 8 q0 18 8 58z" fill="var(--bt-surface-2)" opacity=".9"/>
</svg>`;
}

const STAGE = [
  // Start: a doorway and a red light
  `<path d="M0 50 L80 20 L160 50" stroke="var(--bt-title)" stroke-width="2" fill="none"/><circle class="lp-st-dot" cx="80" cy="20" r="6" fill="var(--bt-red)"/>`,
  // Break 1: the word
  `<rect x="50" y="14" width="60" height="26" rx="5" fill="none" stroke="var(--bt-primary)" stroke-width="2"/><text class="lp-st-word" x="80" y="32" text-anchor="middle" font-size="12" font-weight="900" fill="var(--bt-title)" font-family="Inter, sans-serif">WORD</text>`,
  // Break 2: three stamps
  `<circle class="lp-st-c1" cx="50" cy="28" r="10" fill="none" stroke="var(--bt-green)" stroke-width="2"/><circle class="lp-st-c2" cx="80" cy="28" r="10" fill="none" stroke="var(--bt-title)" stroke-width="2"/><circle class="lp-st-c3" cx="110" cy="28" r="10" fill="none" stroke="var(--bt-primary)" stroke-width="2"/>`,
  // End: a line that climbs
  `<path class="lp-st-line" d="M40 40 L60 18 L80 34 L100 12 L120 30" stroke="var(--bt-lime)" stroke-width="2" fill="none" pathLength="1"/>`,
];
/** The small scene on stage card i (0 to 3) of "How a stream runs". It moves while the card is lit (hover, focus or tap). */
export const stageSceneSvg = (i) => `<span class="lp-stage-scene" aria-hidden="true"><svg viewBox="0 0 160 56" focusable="false">${STAGE[i] || ""}</svg></span>`;
