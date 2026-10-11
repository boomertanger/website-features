// site/src/scripts/base-camp/kind-words-art.ts — Kind Words' drawings (docs/design/mockups/base-camp-newfoundland.html, Puffin Post; the Skipper
// mockup's Paw Notes): the Atlantic puffin with a beak full of capelin, the flying puffin carrying a postcard (the sent moment), the cliff-top
// hero, the NFLD stamp and the St. John's postmark on a postcard, and the paw pin. Colours are classes in styles/kind-words.css; ids are unique per
// drawing. Built in the browser by kind-words.ts and at build time by the /admin/kind-words page.
import { PAW } from "./ui";

const PREFIX = `kw${Math.random().toString(36).slice(2, 6)}`;
let n = 0;
const nid = () => `${PREFIX}${++n}`;

export function puffinArt({ cls = "", fish = true }: { cls?: string; fish?: boolean } = {}) {
  const u = nid();
  const capelin = (x: number, y: number, r: number, s = 1) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})"><g class="pf-fish"><path class="pf-capelin" d="M0 0 C8 -4 30 -4 44 0 L52 -5 L51 0 L52 5 L44 0 C30 4 8 4 0 0 Z"/><path class="pf-capback" d="M6 -1.5 C16 -3 30 -3 42 -1"/><circle class="pf-capeye" cx="47" cy="-0.6" r="1"/></g></g>`;
  return `<svg class="pf${cls ? ` ${cls}` : ""}" viewBox="0 0 300 330" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id="${u}f" cx=".45" cy=".35" r=".7"><stop offset="0" class="pf-face0"/><stop offset=".75" class="pf-face1"/><stop offset="1" class="pf-face2"/></radialGradient>
      <linearGradient id="${u}k" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="pf-blk0"/><stop offset="1" class="pf-blk1"/></linearGradient>
      <linearGradient id="${u}b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" class="pf-bk0"/><stop offset=".55" class="pf-bk1"/><stop offset="1" class="pf-bk2"/></linearGradient>
      <linearGradient id="${u}y" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="pf-face0"/><stop offset="1" class="pf-face2"/></linearGradient>
    </defs>
    <g class="pf-bird">
      <path class="pf-foot" d="M138 296 L126 314 L136 312 L140 318 L146 311 L154 314 L148 296 Z"/>
      <path class="pf-foot" d="M172 296 L164 314 L174 312 L178 318 L184 311 L192 314 L184 296 Z"/>
      <path fill="url(#${u}k)" class="pf-black" d="M168 112 C126 110 96 144 92 196 C88 246 110 292 156 300 C196 306 222 280 222 236 C222 190 206 150 184 126 Z"/>
      <path fill="url(#${u}y)" d="M200 168 C220 198 224 250 208 280 C194 300 164 304 144 294 C166 282 182 252 184 216 C186 196 190 180 200 168 Z"/>
      <path class="pf-wing" d="M128 168 C104 186 98 234 110 270 C122 290 140 296 152 292 C136 268 132 230 140 196 C142 182 138 172 128 168 Z"/>
      <path class="pf-feather" d="M116 214 c6 14 8 28 8 44 M126 204 c6 16 8 32 6 50 M136 196 c4 16 4 34 0 50"/>
      <path class="pf-tail" d="M110 282 L92 300 L118 294 Z"/>
      <circle fill="url(#${u}k)" class="pf-black" cx="188" cy="96" r="46"/>
      <path class="pf-collar" d="M150 126 C170 142 204 144 226 128 C222 140 210 152 190 156 C170 156 156 144 150 126 Z"/>
      <ellipse fill="url(#${u}f)" cx="198" cy="100" rx="30" ry="33"/>
      <path class="pf-cheek" d="M178 116 C186 130 204 134 218 126"/>
      <g class="pf-eyeg"><path class="pf-eyemark" d="M192 80 L206 84 L198 88 Z M196 100 L212 96 L200 94 Z"/><circle class="pf-eyering" cx="200" cy="90" r="5.4"/><circle class="pf-eye" cx="200" cy="90" r="3.4"/><circle class="pf-eyehi" cx="201.4" cy="88.6" r="1.1"/></g>
      <g>
        <path fill="url(#${u}b)" class="pf-beak" d="M222 74 C240 72 264 86 282 106 C268 118 244 126 222 126 C226 108 226 90 222 74 Z"/>
        <path class="pf-plate" d="M222 74 C230 74 236 76 240 78 C238 94 238 110 240 124 C234 125 228 126 222 126 C226 108 226 90 222 74 Z"/>
        <path class="pf-ridge" d="M240 78 C242 94 242 110 240 124"/>
        <path class="pf-groove" d="M254 86 C256 98 256 110 254 120 M266 94 C268 102 268 110 266 116"/>
        <path class="pf-gape" d="M224 108 C240 108 262 106 280 106"/>
        <circle class="pf-rosette" cx="222" cy="110" r="4.2"/>
        ${fish ? capelin(238, 112, 78, 0.8) + capelin(246, 110, 96, 0.92) + capelin(252, 113, 66, 0.78) + capelin(242, 115, 112, 0.72) + capelin(258, 110, 86, 0.86) : ""}
      </g>
    </g>
  </svg>`;
}

/** The puffin in flight with the postcard in its beak (the sent moment). */
export const puffinFly = () => `<svg class="pf-fly" viewBox="0 0 160 110" aria-hidden="true" focusable="false">
    <g class="pff-wing pff-wing--b"><path d="M70 50 C56 24 40 14 22 12 C36 26 48 40 60 56 Z"/></g>
    <path class="pff-body" d="M40 60 C52 46 84 42 108 48 C120 52 126 60 124 66 C112 74 80 78 58 74 C48 72 40 68 40 60 Z"/>
    <path class="pff-belly" d="M60 72 C82 76 108 72 122 66 C112 76 84 82 60 76 Z"/>
    <circle class="pff-head" cx="118" cy="50" r="14"/><ellipse class="pff-face" cx="122" cy="51" rx="9" ry="10"/>
    <path class="pff-beak" d="M128 44 C136 44 144 50 150 56 C142 60 134 62 128 60 Z"/>
    <circle cx="123" cy="48" r="1.4" class="pf-eye"/>
    <path class="pff-feet" d="M44 64 L30 70 L42 70 Z"/>
    <g class="pff-card"><rect x="130" y="58" width="26" height="18" rx="2" transform="rotate(12 143 67)"/><path d="M134 64 h10 M134 68 h14" transform="rotate(12 143 67)"/></g>
    <g class="pff-wing pff-wing--f"><path d="M80 52 C70 22 56 6 36 0 C46 20 56 38 66 58 Z"/></g>
  </svg>`;

/** The puffins' cliff top with the sea stacks (Puffin Post's header art); the puffin sits on top of it. */
export const puffinHero = () => `<div class="kw-hero kw-hero--puffin"><svg viewBox="0 0 600 330" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false"><rect class="kw-sky-fill" width="600" height="330"/><rect class="kw-sea" y="190" width="600" height="140"/><path class="kw-stack" d="M420 330 L430 200 L452 186 L470 196 L478 330 Z M500 330 L506 236 L522 228 L532 330 Z"/><path class="kw-wave" d="M30 230 q16 -6 32 0 t32 0 M200 250 q16 -6 32 0 t32 0 M380 270 q16 -6 32 0 t32 0"/><path class="kw-cliff" d="M0 330 L0 236 C60 226 140 230 200 240 C240 246 270 262 280 290 L290 330 Z"/><path class="kw-turf" d="M0 236 C60 226 140 230 200 240 C240 246 270 262 280 290 L272 292 C262 268 236 256 198 250 C140 242 60 238 0 246 Z"/><ellipse class="kw-burrow" cx="70" cy="252" rx="14" ry="6"/><g class="kw-far"><path d="M520 70 c8 -10 16 -10 22 0 c6 -10 14 -10 22 0"/><path d="M460 110 c6 -7 12 -7 16 0 c4 -7 10 -7 16 0"/></g></svg>${puffinArt({ cls: "kw-puffin" })}</div>`;

/** The small sky in the sent dialog: sea, a cliff, the puffin flying off with the postcard. */
export const sentSky = () => `<div class="kw-sky">${puffinFly()}<svg class="kw-sky-bg" viewBox="0 0 400 160" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false"><rect class="kw-sea" y="120" width="400" height="40"/><path class="kw-cliff" d="M0 160 L0 128 C40 122 90 124 120 132 L130 160 Z"/></svg></div>`;

export const stampMini = () => `<span class="kw-stamp" aria-hidden="true"><span class="kw-stamp-in"><svg viewBox="0 0 40 40" focusable="false"><circle cx="18" cy="16" r="9" class="ks-blk"/><ellipse cx="20" cy="17" rx="6" ry="6.5" class="ks-face"/><path d="M25 12 C30 12 34 16 37 20 C33 23 29 24 25 23 Z" class="ks-beak"/><path d="M10 22 C8 30 14 38 22 38 C28 38 30 32 28 26 C24 30 16 30 10 22 Z" class="ks-blk"/></svg><s>NFLD</s></span></span>`;

/** A St. John's postmark with the day it was sent ("OCT 2"). */
export function postmark(day: string) {
  const u = nid();
  return `<svg class="kw-pm" viewBox="0 0 90 90" aria-hidden="true" focusable="false"><defs><path id="${u}" d="M45 45 m-32 0 a32 32 0 1 1 64 0 a32 32 0 1 1 -64 0"/></defs><circle cx="45" cy="45" r="40"/><circle cx="45" cy="45" r="25"/><text><textPath href="#${u}">ST. JOHN'S · NL · PUFFIN POST ·</textPath></text><text class="kw-pm-d" x="45" y="49" text-anchor="middle">${day}</text><path class="kw-pm-w" d="M90 30 q10 -6 20 0 t20 0 t20 0 M90 45 q10 -6 20 0 t20 0 t20 0 M90 60 q10 -6 20 0 t20 0 t20 0"/></svg>`;
}

export const pawPin = () => `<span class="pn-pin" aria-hidden="true"><svg viewBox="0 0 24 26" focusable="false">${PAW}</svg></span>`;
