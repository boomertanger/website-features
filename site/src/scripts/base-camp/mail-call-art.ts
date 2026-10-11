// site/src/scripts/base-camp/mail-call-art.ts — Mail Call's drawings (docs/specs/base-camp.md "Addendum 2: Mail Call"; mockup
// docs/design/mockups/base-camp-mail-call.html): the hero scene (a glowing ON AIR sign, the desk lamp on the left lighting the letter with a beam
// and a pool of light, the mascot reading in the middle, a small MAIL sack on the right, envelopes on the desk and floating) and the Something
// private? door art. The desk fades in from the right of the words (a token mask), so it never reaches the buttons. Colours are classes in
// styles/base-camp-mail-call.css; ids are unique per scene.
import { mascotAt } from "./story-art";

let n = 0;
const nid = () => `mc${++n}`;

const env = (x: number, y: number, r: number, fly: boolean, heart = true) =>
  `<g transform="translate(${x} ${y}) rotate(${r})"><g class="ms-env${fly ? " ms-fly" : ""}"><rect x="-26" y="-17" width="52" height="34" rx="2"/><path d="M-26 -17 L0 4 L26 -17"/>${heart ? `<path class="ms-heart" d="M0 4 c-4 -4 -9 0 -4 4 l4 4 l4 -4 c5 -4 0 -8 -4 -4 Z"/>` : `<rect class="ms-stampr" x="14" y="-13" width="9" height="11"/>`}</g></g>`;

export function mailHero() {
  const u = nid();
  return `<svg class="mc-hero-scene" viewBox="0 0 800 360" preserveAspectRatio="xMaxYMid slice" role="img" aria-label="An On air sign glows over a desk. A lamp lights a letter, the mascot reads one, and a small mail sack sits by a pile of envelopes.">
    <defs>
      <radialGradient id="${u}g"><stop offset="0" class="ms-glow0"/><stop offset="1" class="ms-glow1"/></radialGradient>
      <linearGradient id="${u}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="ml-b0"/><stop offset="1" class="ml-b1"/></linearGradient>
      <linearGradient id="${u}f" gradientUnits="userSpaceOnUse" x1="420" y1="0" x2="520" y2="0"><stop offset="0" class="mc-mask0"/><stop offset="1" class="mc-mask1"/></linearGradient>
      <mask id="${u}m"><rect width="800" height="360" fill="url(#${u}f)"/></mask>
    </defs>
    <rect class="ms-wall" width="800" height="360"/>
    <g class="ms-onair" transform="translate(664 26)"><rect width="104" height="30" rx="6"/><text x="52" y="20" text-anchor="middle">ON AIR</text></g>
    <circle cx="590" cy="250" r="190" fill="url(#${u}g)"/>
    <g mask="url(#${u}m)"><rect class="ms-desk" x="420" y="270" width="380" height="90"/><rect class="ms-desk2" x="420" y="270" width="380" height="10"/></g>
    <g transform="translate(306 108) scale(.62)"><path class="ms-sack" d="M650 292 C620 242 632 182 670 162 C686 152 714 152 730 162 C770 184 782 242 752 294 Z"/>
      <path class="ms-rope" d="M666 170 C690 178 712 178 734 168"/><path class="ms-sackline" d="M660 212 C690 224 724 224 760 210 M656 252 C692 264 730 264 766 250"/>
      <text class="ms-sacktext" x="704" y="240" text-anchor="middle">MAIL</text></g>
    ${mascotAt(528, 118, 150, 168)}
    <g transform="translate(560 232) rotate(-6)"><rect class="ms-letter" width="96" height="70" rx="3"/><path class="ms-lines" d="M10 18 h76 M10 30 h70 M10 42 h74 M10 54 h50"/></g>
    <g>
      <ellipse class="ml-base" cx="478" cy="270" rx="28" ry="7"/><rect class="ml-base" x="468" y="258" width="20" height="12" rx="3"/>
      <path class="ml-arm" d="M478 260 L462 178"/><circle class="ml-joint" cx="462" cy="178" r="6"/>
      <path class="ml-arm" d="M462 178 L520 118"/><circle class="ml-joint" cx="520" cy="118" r="6"/>
      <path class="ml-spring" d="M474 238 L464 192 M474 164 L506 132"/>
      <path class="ml-shade" d="M534 102 C524 98 510 102 504 110 L510 148 C520 146 540 138 550 130 Z"/>
      <path class="ml-rim" d="M510 148 C520 146 540 138 550 130"/>
      <ellipse class="ml-bulb" cx="530" cy="139" rx="11" ry="5" transform="rotate(-22 530 139)"/>
    </g>
    <path class="ml-beam" d="M510 148 L550 130 L700 272 L540 272 Z" fill="url(#${u}b)"/>
    <ellipse class="ml-pool" cx="612" cy="272" rx="84" ry="10"/>
    ${env(712, 312, -14, false, false)}${env(778, 318, 10, false)}${env(650, 322, 6, false)}
    ${env(724, 120, -18, true)}${env(772, 92, 12, true)}
  </svg>`;
}

/** The Something private? door: a little phone screen. */
export const privateArt = () => `<svg viewBox="0 0 120 100" aria-hidden="true" focusable="false"><rect class="mc-pv-box" x="22" y="18" width="76" height="64" rx="10"/><circle class="mc-pv-dot" cx="60" cy="42" r="12"/><path class="mc-pv-line" d="M40 70 h40"/></svg>`;

/** A ghost-numbered chapter header (kept out of the .astro frontmatter: the compiler trips on markup in a block-bodied helper there). */
export function chapterHtml(n: number, id: string, title: string, lede = "") {
  const nn = String(n).padStart(2, "0");
  return `<header class="bt-chapter bt-chapter--ghost" data-n="${nn}"><p class="bt-chapter-eyebrow" aria-hidden="true">${nn} · Chapter</p><h2 class="bt-chapter-title" id="h-${id}">${title}</h2>${lede ? `<p class="bt-chapter-lede">${lede}</p>` : ""}</header>`;
}
