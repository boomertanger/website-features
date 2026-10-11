// site/src/scripts/base-camp/newfoundland-art.ts — /base-camp/newfoundland's drawn scenes (built at build time by newfoundland.astro; from the approved
// mockup docs/design/mockups/base-camp-newfoundland.html): dawn at Cape Spear, the chart (traced from real coordinates in
// src/data/base-camp/newfoundland-map.json: the main island, Fogo, New World Island, Bell Island, St. Pierre and Miquelon, the Labrador shore),
// Pangaea, the iceberg, the Vikings, the cod, St. John's, Gander's planes, the Newfoundland pony and the Newfoundland dog's rescue swim.
// Colours are classes in styles/base-camp-newfoundland.css; gradient ids are unique per scene.
import MAP from "../../data/base-camp/newfoundland-map.json";
import { THINGS, PINS } from "./newfoundland-data";

let n = 0;
const nid = (p: string) => `${p}${++n}`;

export function heroScene() {
  const u = nid("nlh");
  const stars = [[90, 60], [220, 40], [340, 90], [520, 50], [700, 80], [880, 40], [1040, 70], [1220, 50], [1400, 90], [1520, 40], [160, 140], [600, 130]].map(([x, y], i) => `<circle class="n-star" cx="${x}" cy="${y}" r="${i % 3 ? 1.4 : 2}" opacity="${(0.2 + (i % 4) * 0.12).toFixed(2)}"/>`).join("");
  return `<svg class="nl-hero-scene" viewBox="0 0 1600 800" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Dawn at Cape Spear: the sun rises over the North Atlantic, an iceberg floats offshore, and the old square lighthouse stands on the cliff">
  <defs><linearGradient id="${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="n-sky0"/><stop offset=".62" class="n-sky1"/><stop offset=".78" class="n-sky2"/></linearGradient></defs>
  <rect width="1600" height="800" fill="url(#${u})"/>${stars}
  <circle class="n-sun" cx="620" cy="520" r="70"/>
  <rect class="n-sea" y="510" width="1600" height="290"/>
  <path class="n-glint" d="M560 540 h120 M585 562 h70 M540 588 h160 M600 614 h40 M520 650 h200 M590 690 h60"/>
  <path class="n-wave" d="M60 600 q20 -8 40 0 t40 0 M220 640 q20 -8 40 0 t40 0 M880 590 q20 -8 40 0 t40 0 M760 680 q20 -8 40 0 t40 0 M120 730 q20 -8 40 0 t40 0 M980 720 q20 -8 40 0 t40 0"/>
  <g class="bg-bob"><path class="n-ice" d="M780 516 L812 452 L838 470 L866 420 L904 476 L930 466 L956 516 Z"/><path class="n-ice-shade" d="M866 420 L904 476 L930 466 L956 516 L880 516 Z" opacity=".55"/></g>
  <path class="n-cliff" d="M980 800 L1000 470 L1060 420 L1180 400 L1320 392 L1460 410 L1600 400 L1600 800 Z"/>
  <path class="n-grass" d="M1000 470 L1060 420 L1180 400 L1320 392 L1460 410 L1600 400 L1600 414 L1460 424 L1320 406 L1180 414 L1064 434 L1006 482 Z"/>
  <path class="n-cliff2" d="M1000 470 L1030 560 L1010 650 L1040 800 L980 800 Z"/>
  <path class="n-beam" d="M1252 300 L1600 230 L1600 330 Z" style="transform-origin:1252px 300px"/>
  <rect class="n-house" x="1196" y="324" width="112" height="76"/><path class="n-roof" d="M1188 326 L1252 296 L1316 326 Z"/>
  <rect class="n-house" x="1212" y="344" width="16" height="20"/><rect class="n-house" x="1276" y="344" width="16" height="20"/>
  <rect class="n-lantern" x="1240" y="280" width="24" height="22" rx="3"/><path class="n-roof" d="M1236 282 L1252 268 L1268 282 Z"/><circle class="n-lamp" cx="1252" cy="291" r="6"/>
  <path class="n-bird" d="M360 260 q10 -8 20 0 q10 -8 20 0 M440 230 q8 -6 16 0 q8 -6 16 0 M1420 200 q8 -6 16 0 q8 -6 16 0"/>
  </svg>`;
}

export function chartSvg() {
  const grid = [500, 400, 300, 200, 100].map((y, i) => `<line class="c-grid" x1="0" x2="640" y1="${y}" y2="${y}"/><text class="c-gridlab" x="6" y="${y - 4}">${47 + i}°N</text>`).join("")
    + [106, 238, 370, 502].map((x, i) => `<line class="c-grid" y1="0" y2="690" x1="${x}" x2="${x}"/><text class="c-gridlab" x="${x + 4}" y="684">${58 - 2 * i}°W</text>`).join("");
  const bergs = [[468, 10, ""], [500, 40, " c-berg--2"], [455, 60, " c-berg--3"]].map(([x, y, c]) => `<path class="c-berg${c}" d="M${x} ${y} l6 -8 l5 4 l4 -6 l6 10 Z"/>`).join("");
  const pins = Object.entries(PINS).map(([k, [x, y, hx, hy]]) => {
    const t = THINGS[+k - 1];
    return `<a class="c-pin" href="#nl-${t.id}" data-pin="${k}" aria-label="${k}: ${t.t}, ${t.where}"><line class="lead" x1="${x}" y1="${y}" x2="${hx}" y2="${hy}"/><circle class="dot" cx="${x}" cy="${y}" r="3.5"/><circle class="halo" cx="${hx}" cy="${hy}" r="14"/><circle class="head" cx="${hx}" cy="${hy}" r="14"/><text x="${hx}" y="${hy}">${k}</text></a>`;
  }).join("");
  return `<svg viewBox="0 0 640 690" role="img" aria-label="A chart of Newfoundland with numbered pins on the places in this page">
    ${grid}
    <path class="c-alley" d="M470 0 C 520 120 540 260 520 360 S 560 520 580 600"/>${bergs}
    <ellipse class="c-banks" cx="575" cy="625" rx="70" ry="48"/><text class="c-banklab" x="500" y="572">GRAND BANKS</text>
    <path class="c-lab" d="${MAP.LAB}"/><text class="c-labname" x="40" y="30">LABRADOR</text><text class="c-small c-small--i" x="62" y="74">Strait of Belle Isle</text>
    <path class="c-coast" d="${MAP.MAIN}"/><path class="c-land" d="${MAP.MAIN}"/>
    <path class="c-land" d="${MAP.FOGO}"/><path class="c-land" d="${MAP.NWI}"/><path class="c-land" d="${MAP.BELL}"/>
    <text class="c-small" x="364" y="216">Fogo Island</text>
    <text class="c-name" x="128" y="390">THE ROCK</text>
    <text class="c-town" x="322" y="326" text-anchor="end">Gander</text>
    <a class="c-tmark" href="#nl-ice" aria-label="Titanic wreck site, about 370 miles south, off this chart"><path class="tline" d="M570 642 L556 650"/><rect class="tbox" x="420" y="648" width="212" height="36" rx="8"/><path class="tship" d="M430 671 h22 l-3 5 h-16 Z M436 671 v-7 h4 v7 M442 671 v-9 h4 v9"/><text class="tx" x="460" y="663">Titanic wreck site</text><text class="tx2" x="460" y="677">About 370 mi south</text><path class="tarrow" d="M614 660 l8 0 l-4 12 Z"/></a>
    <path class="c-france" d="${MAP.SPM}"/><text class="c-small" x="150" y="540">St. Pierre &amp; Miquelon (France)</text>
    <text class="c-small" x="425" y="98">Iceberg Alley</text>
    <text class="c-small" x="388" y="424">Bell Island</text>
    <circle class="c-dotpt" cx="424" cy="537" r="2.5"/><text class="c-small" x="380" y="556">Mistaken Point</text>
    <text class="c-small c-small--lead" x="150" y="414">9 and 10 are everywhere</text>
    <g class="c-compass" transform="translate(585 70)"><circle r="26"/><path d="M0 -22 L5 0 L0 22 L-5 0 Z"/><text class="c-small" x="-4" y="-30">N</text></g>
    <text class="c-small" x="20" y="664">Not to scale</text>
    ${pins}
  </svg>`;
}

export const pangaeaSvg = () => `<svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <rect class="pg-sea" x="150" y="0" width="100" height="240"/>
    <g class="pg-left"><path class="pg-land" d="M40 40 C90 30 150 44 200 52 L200 196 C150 206 96 214 50 200 C20 170 18 80 40 40 Z"/><path class="pg-ridge" d="M80 180 C120 150 160 120 200 100"/><text class="pg-lab" x="60" y="130">Newfoundland</text></g>
    <g class="pg-right"><path class="pg-land" d="M200 52 C250 40 320 30 360 50 C384 90 380 170 350 200 C300 214 250 206 200 196 Z"/><path class="pg-ridge" d="M200 100 C250 80 300 64 340 56"/><text class="pg-lab" x="236" y="150">Ireland &amp; Scotland</text></g>
    <text class="pg-cap" x="200" y="226" text-anchor="middle">Same mountain chain, two sides of an ocean</text>
  </svg>`;

export const bergSvg = () => `<svg viewBox="0 0 1600 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="1600" height="300" class="n-dusk3"/>
    <rect y="300" width="1600" height="400" class="n-sea-deep"/>
    <g class="bg-under"><path class="n-ice-under" d="M560 300 L520 380 L470 470 L500 560 L620 640 L800 668 L980 640 L1100 560 L1130 460 L1070 370 L1030 300 Z"/></g>
    <g class="bg-bob"><path class="n-ice" d="M640 300 L700 210 L760 236 L820 140 L900 230 L960 214 L1010 300 Z"/><path class="n-ice-shade" d="M820 140 L900 230 L960 214 L1010 300 L860 300 Z" opacity=".5"/></g>
    <g class="bg-water"><rect y="300" width="1600" height="400" class="n-sea" opacity=".96"/><path class="n-wave" d="M80 330 q30 -10 60 0 t60 0 M1200 350 q30 -10 60 0 t60 0 M300 420 q30 -10 60 0 t60 0 M1350 460 q30 -10 60 0 t60 0"/></g>
    <line class="bg-line" x1="0" x2="1600" y1="300" y2="300"/>
    <g class="bg-90 bg-wide"><text class="bg-cap" x="1150" y="500">About 90% of it</text><text class="bg-cap2" x="1150" y="546">sits under the water</text></g>
    <text class="bg-cap2 bg-wide" x="1060" y="190">The part you see</text>
    <g class="bg-90 bg-narrow"><text class="bg-cap" x="800" y="590" text-anchor="middle">About 90% of it</text><text class="bg-cap2" x="800" y="636" text-anchor="middle">sits under the water</text></g>
    <text class="bg-cap2 bg-narrow" x="800" y="110" text-anchor="middle">The part you see</text>
  </svg>`;

export const vikingSvg = () => `<svg viewBox="0 0 400 225" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="400" height="225" class="n-dusk"/>
    <rect y="120" width="400" height="105" class="n-sea"/>
    <g class="v-ship"><path class="v-hull" d="M60 122 Q100 134 140 122 L132 116 L68 116 Z"/><rect class="v-mast" x="99" y="76" width="2" height="40"/><path class="v-sail" d="M80 80 H120 V112 H80 Z"/><path class="v-stripe" d="M80 88 H120 V92 H80 Z M80 100 H120 V104 H80 Z"/></g>
    <path class="v-grass" d="M0 150 Q120 128 260 146 T400 140 V225 H0 Z"/>
    <path class="v-sod" d="M70 172 Q130 140 190 172 Z"/><rect class="v-wall" x="76" y="170" width="108" height="16"/><rect class="v-door" x="124" y="174" width="12" height="12"/>
    <path class="v-sod" d="M220 180 Q270 156 320 180 Z"/><rect class="v-wall" x="226" y="178" width="88" height="14"/>
    <circle class="v-smoke" cx="130" cy="150" r="5"/><circle class="v-smoke v-smoke--2" cx="134" cy="150" r="4"/><circle class="v-smoke v-smoke--3" cx="128" cy="150" r="4"/>
  </svg>`;

export function codSvg() {
  const u = nid("nlc");
  const fish = (y: number, s: string, d: string, dur: string) => `<g class="f-cod" style="animation-delay:${d}s;--dur:${dur}s"><g transform="translate(0 ${y}) scale(${s})"><path class="f-body" d="M60 10 C50 1 28 0 14 7 L2 0 L4 10 L2 20 L14 13 C28 20 50 19 60 10 Z"/><path class="f-fin" d="M30 3 L36 -3 L40 4 Z M34 17 L38 22 L42 16 Z"/><circle class="f-eye" cx="52" cy="8" r="1.6"/><path class="f-gill" d="M46 5 q-3 5 0 10"/><circle class="f-shine" cx="52" cy="8" r="2.4"/></g></g>`;
  let school = "";
  for (let i = 0; i < 34; i++) { const y = 12 + ((i * 53) % 190), s = 0.45 + ((i * 37) % 60) / 100, dur = 7 + ((i * 29) % 70) / 10, d = -((i * 1.7) % dur); school += fish(y, s.toFixed(2), d.toFixed(1), dur.toFixed(1)); }
  return `<svg viewBox="0 0 400 225" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><linearGradient id="${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="f-w0"/><stop offset="1" class="f-w1"/></linearGradient></defs>
    <rect width="400" height="225" fill="url(#${u})"/>
    <path class="f-ray" d="M0 0 L60 225 L120 225 L40 0 Z M140 0 L200 225 L240 225 L170 0 Z"/>
    ${school}
  </svg>`;
}

export function citySvg() {
  const houses = Array.from({ length: 10 }, (_, i) => {
    const x = 150 + i * 44, h = 70 + (i % 3) * 8;
    return `<g><rect class="j-h j-h${(i % 6) + 1}" x="${x}" y="${300 - h}" width="40" height="${h}"/><path class="j-roof" d="M${x - 2} ${300 - h} H${x + 42} L${x + 38} ${300 - h - 8} H${x + 2} Z"/><rect class="j-win" x="${x + 7}" y="${300 - h + 14}" width="9" height="12"/><rect class="j-win" x="${x + 24}" y="${300 - h + 14}" width="9" height="12"/><rect class="j-win" x="${x + 7}" y="${300 - h + 40}" width="9" height="12"/><rect class="j-win" x="${x + 24}" y="${300 - h + 40}" width="9" height="12"/></g>`;
  }).join("");
  return `<svg viewBox="0 0 600 360" preserveAspectRatio="xMinYMid slice" aria-hidden="true">
    <rect width="600" height="360" class="n-dusk2"/>
    <path class="n-cliff" d="M0 230 Q60 120 140 150 L160 300 L0 300 Z"/>
    <rect class="j-tower" x="70" y="104" width="34" height="40"/><path class="j-tower" d="M66 104 H108 L104 96 H70 Z"/><rect class="j-door" x="80" y="112" width="6" height="10"/>
    <path class="j-wave" d="M108 100 a16 16 0 0 1 16 -16"/><path class="j-wave" d="M108 100 a30 30 0 0 1 30 -30"/><path class="j-wave" d="M108 100 a46 46 0 0 1 46 -46"/>
    ${houses}
    <rect y="300" width="600" height="60" class="n-sea"/><path class="n-wave" d="M30 320 q14 -6 28 0 t28 0 M300 332 q14 -6 28 0 t28 0 M480 318 q14 -6 28 0 t28 0"/>
  </svg>`;
}

export function ganderSvg() {
  const plane = (x: number, y: number, i: number) => `<g transform="translate(${x} ${y}) rotate(${i % 2 ? -8 : 8}) scale(3.1)"><path class="gd-plane" style="transition-delay:${((i % 38) * 0.05).toFixed(2)}s" d="M0 -9 L2 -3 L10 1 L10 3 L2 1 L1.5 6 L4 8 L4 9 L0 8 L-4 9 L-4 8 L-1.5 6 L-2 1 L-10 3 L-10 1 L-2 -3 Z"/></g>`;
  let planes = "", i = 0;
  ([[13, 290], [13, 370], [12, 450]] as const).forEach(([cnt, y], r) => { for (let k = 0; k < cnt; k++, i++) planes += plane(80 + k * 118 + (r === 1 ? 56 : 0), y, i); });
  const houses = Array.from({ length: 14 }, (_, h) => { const x = 40 + h * 112; return `<rect class="gd-house" x="${x}" y="150" width="70" height="56"/><path class="gd-house" d="M${x - 6} 150 L${x + 35} 122 L${x + 76} 150 Z"/><rect class="gd-win" style="transition-delay:${(0.4 + h * 0.08).toFixed(2)}s" x="${x + 12}" y="166" width="14" height="14"/><rect class="gd-win" style="transition-delay:${(0.5 + h * 0.08).toFixed(2)}s" x="${x + 44}" y="166" width="14" height="14"/>`; }).join("");
  return `<svg viewBox="0 0 1600 500" preserveAspectRatio="xMidYMid slice" role="img" aria-label="38 large planes parked in three rows on the tarmac at Gander, with the town's houses behind them">
    <rect width="1600" height="500" class="n-dusk3"/>${houses}
    <rect class="gd-tarmac" y="230" width="1600" height="270"/><line class="gd-line" x1="0" x2="1600" y1="330" y2="330"/><line class="gd-line" x1="0" x2="1600" y1="410" y2="410"/>${planes}
  </svg>`;
}

export function ponySvg() {
  const u = nid("nlp");
  const grass = Array.from({ length: 26 }, (_, i) => { const x = 8 + i * 20 + (i % 3) * 4, h = 10 + (i * 7) % 12; return `<path class="pz-tuft" d="M${x} 372 q2 -${h} 5 -${h + 4} M${x + 4} 372 q1 -${h - 3} -3 -${h + 2} M${x + 7} 372 q3 -${h - 5} 7 -${h - 2}"/>`; }).join("");
  const flowers = [[40, 360], [120, 366], [430, 362], [480, 368], [300, 370], [210, 364]].map(([x, y], i) => `<circle class="pz-flower${i % 2 ? " pz-flower2" : ""}" cx="${x}" cy="${y}" r="2.6"/>`).join("");
  const trees = [[400, 262, 26], [424, 258, 34], [450, 264, 24], [470, 266, 18]].map(([x, y, h]) => `<path class="pz-tree" d="M${x} ${y} l-${h * 0.42} ${h} h${h * 0.84} Z M${x} ${y + h * 0.3} l-${h * 0.55} ${h} h${h * 1.1} Z"/>`).join("");
  const leg = (d: string, cls: string, fill = "") => `<g transform="translate(0 52.8) scale(1 .78)"><path class="${cls}"${fill ? ` fill="${fill}"` : ""} d="${d}"/></g>`;
  return `<svg class="pz" viewBox="0 0 520 400" role="img" aria-label="A shaggy Newfoundland pony standing in a field by the sea">
  <defs>
    <linearGradient id="${u}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="pz-sky0"/><stop offset=".75" class="pz-sky1"/></linearGradient>
    <linearGradient id="${u}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="pz-coat0"/><stop offset=".55" class="pz-coat1"/><stop offset="1" class="pz-coat2"/></linearGradient>
    <linearGradient id="${u}l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="pz-coat1"/><stop offset=".45" class="pz-coat2"/><stop offset="1" class="pz-point"/></linearGradient>
    <radialGradient id="${u}h" cx=".35" cy=".25" r=".7"><stop offset="0" class="pz-hi0"/><stop offset="1" class="pz-hi1"/></radialGradient>
  </defs>
  <rect width="520" height="400" fill="url(#${u}s)"/>
  <circle class="pz-sun" cx="96" cy="120" r="34"/>
  <rect class="pz-sea" y="236" width="520" height="26"/><path class="pz-glint" d="M70 246 h40 M84 254 h22"/>
  <path class="pz-hill" d="M0 262 C80 230 160 240 230 252 C300 262 380 236 520 248 V300 H0 Z"/>
  ${trees}
  <path class="pz-field" d="M0 300 C120 286 260 296 520 288 V400 H0 Z"/>
  <g class="pz-fence"><path d="M20 298 V350 M110 294 V346 M200 296 V346"/><path class="pz-rail" d="M14 312 L206 306 M14 330 L206 324"/></g>
  <ellipse class="pz-shadow" cx="268" cy="368" rx="138" ry="10"/>
  <g transform="translate(0 22)"><g class="pz-pony">
    <g class="pz-tail"><path class="pz-hair" d="M372 186 C394 196 400 226 396 262 C394 288 404 312 398 330 C388 316 380 300 382 282 C376 300 368 312 360 318 C366 294 372 270 366 244 C362 222 362 204 372 186 Z"/><path class="pz-strand" d="M378 200 C388 230 384 270 392 314 M372 214 C378 246 372 280 366 306"/></g>
    ${leg("M306 244 C312 266 318 286 314 304 L314 350 L334 352 L336 304 C340 280 336 254 330 238 Z", "pz-leg pz-far")}
    ${leg("M194 248 L192 302 C192 316 190 334 192 352 L212 352 C212 334 212 316 214 302 L218 250 Z", "pz-leg pz-far")}
    <path class="pz-body" fill="url(#${u}c)" d="M176 214 C172 186 196 168 232 166 C272 164 318 162 350 170 C378 178 388 202 380 228 C374 250 352 260 326 262 C290 266 246 268 214 262 C190 258 178 238 176 214 Z"/>
    <path class="pz-body" fill="url(#${u}h)" d="M176 214 C172 186 196 168 232 166 C272 164 318 162 350 170 C378 178 388 202 380 228 C374 250 352 260 326 262 C290 266 246 268 214 262 C190 258 178 238 176 214 Z"/>
    ${leg("M330 236 C340 262 348 282 342 304 L340 350 C340 358 346 360 354 360 L366 360 C366 352 364 346 364 340 L366 304 C372 276 370 250 362 228 Z", "pz-leg", `url(#${u}l)`)}
    ${leg("M172 238 C168 260 168 280 170 300 L170 350 C170 356 174 360 182 360 L196 360 C196 352 194 346 194 340 L194 300 C196 282 200 262 202 244 Z", "pz-leg", `url(#${u}l)`)}
    ${leg("M170 334 c2 10 0 16 -5 24 M176 336 c0 10 -2 16 -7 22 M184 338 c0 10 0 16 -2 22 M194 336 c2 10 4 16 2 24 M340 334 c-2 10 -2 16 -7 22 M348 338 c0 10 -2 14 -4 20 M356 338 c0 10 0 14 2 20 M366 336 c2 10 4 16 2 24", "pz-feather")}
    ${leg("M168 356 h30 v6 h-30 Z M338 356 h30 v6 h-30 Z M190 350 h24 v5 h-24 Z M312 350 h24 v5 h-24 Z", "pz-hoof")}
    <path class="pz-belly" d="M210 258 C246 266 290 264 326 258"/>
    <path class="pz-rim" d="M196 172 C230 164 300 160 350 168 C368 172 380 184 384 200"/>
    <path class="pz-shag" d="M214 190 q4 6 2 12 M236 184 q4 6 2 12 M258 182 q4 6 2 12 M282 182 q4 6 2 12 M306 184 q4 6 2 12 M330 188 q4 6 2 12 M352 196 q4 6 2 12 M226 214 q4 6 2 12 M252 210 q4 6 2 12 M278 210 q4 6 2 12 M304 212 q4 6 2 12 M330 216 q4 6 2 12 M240 238 q4 5 2 10 M270 236 q4 5 2 10 M300 238 q4 5 2 10 M182 226 q-4 8 -2 14 M178 240 q-4 8 -2 12"/>
    <g class="pz-head">
      <path class="pz-neck" fill="url(#${u}c)" d="M222 170 C212 140 190 112 166 96 L132 112 C142 138 150 170 156 214 C170 222 186 222 198 212 Z"/>
      <path class="pz-skull" fill="url(#${u}c)" d="M172 98 C164 86 144 82 130 90 C120 96 112 106 106 118 L80 158 C72 170 76 184 90 188 C104 192 116 186 124 176 L144 146 C156 132 168 116 172 98 Z"/>
      <path class="pz-muzzle" d="M80 158 C72 170 76 184 90 188 C100 190 108 186 114 180 C104 176 92 168 86 156 Z"/>
      <circle class="pz-nostril" cx="86" cy="172" r="2.8"/><g class="pz-snort"><circle cx="70" cy="176" r="4"/><circle cx="62" cy="170" r="3"/><circle cx="58" cy="180" r="2.4"/></g><path class="pz-mouth" d="M84 182 q8 2 14 -2"/>
      <path class="pz-jaw" d="M124 176 C132 168 142 156 146 146"/>
      <ellipse class="pz-eye" cx="136" cy="112" rx="4.2" ry="3.4"/><circle class="pz-glint2" cx="137.5" cy="110.8" r="1.2"/>
      <g class="pz-ear"><path class="pz-earfill" d="M156 90 L162 66 C166 74 168 84 166 94 Z"/><path class="pz-earfill" d="M146 88 L146 64 C152 72 156 82 154 92 Z"/></g>
      <path class="pz-hair" d="M166 92 C176 104 188 124 200 146 C208 160 216 172 224 182 C214 176 206 168 200 160 C202 172 206 184 214 194 C200 186 192 174 188 160 C186 172 186 184 190 196 C176 182 172 166 172 150 C168 162 164 172 158 180 C160 160 162 136 160 112 Z"/>
      <path class="pz-strand" d="M170 104 C182 128 194 152 210 180 M164 118 C172 140 180 162 186 186"/>
      <path class="pz-hair" d="M150 86 C138 90 128 100 124 112 C132 106 138 104 142 106 C136 110 132 118 132 124 C140 116 148 110 156 106 Z"/>
    </g>
  </g></g>
  ${grass}${flowers}
  </svg>`;
}

export function dogSvg() {
  const u = nid("nld");
  return `<svg class="dz" viewBox="0 0 640 300" preserveAspectRatio="xMidYMid slice" role="img" aria-label="A Newfoundland dog swims a rescue line out under the moon, towing a life ring">
  <defs>
    <linearGradient id="${u}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="dz-sky0"/><stop offset="1" class="dz-sky1"/></linearGradient>
    <linearGradient id="${u}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="dz-sea0"/><stop offset="1" class="dz-sea1"/></linearGradient>
    <radialGradient id="${u}f" cx=".45" cy=".25" r=".85"><stop offset="0" class="dz-fur0"/><stop offset=".6" class="dz-fur1"/><stop offset="1" class="dz-fur2"/></radialGradient>
    <linearGradient id="${u}o" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="dz-over0"/><stop offset="1" class="dz-over1"/></linearGradient>
  </defs>
  <rect width="640" height="300" fill="url(#${u}s)"/>
  <circle class="dz-moon" cx="110" cy="58" r="20"/><circle class="dz-moonglow" cx="110" cy="58" r="46"/>
  <path class="n-cliff" d="M520 300 L536 160 L590 126 L640 132 L640 300 Z"/><path class="n-grass" d="M536 160 L590 126 L640 132 L640 140 L592 134 L540 170 Z"/>
  <rect class="dz-house" x="574" y="104" width="22" height="20"/><path class="n-roof" d="M570 106 L585 94 L600 106 Z"/><rect x="580" y="110" width="5" height="6" class="dz-win"/>
  <rect y="168" width="640" height="132" fill="url(#${u}w)"/>
  <path class="dz-moonpath" d="M90 176 h40 M96 188 h28 M84 202 h52 M100 218 h20"/>
  <g class="d-swim">
    <path class="dz-wake" d="M300 196 C260 206 210 214 150 214 M304 204 C262 220 216 232 168 236"/>
    <g class="d-ring"><circle cx="92" cy="200" r="17" class="d-ring-o"/><circle cx="92" cy="200" r="8" class="d-ring-i"/><path class="d-ring-s" d="M80 188 L85 193 M99 207 L104 212 M80 212 L85 207 M99 193 L104 188"/></g>
    <path class="d-rope" d="M108 198 C150 192 200 196 238 194 C270 192 300 190 334 194"/>
    <g class="dz-under"><path class="dz-paw" d="M268 214 C276 236 284 250 296 254 C304 256 308 250 304 244 C296 234 290 222 286 210 Z"/><path class="dz-paw dz-paw2" d="M210 214 C214 236 216 250 226 256 C234 260 238 254 236 246 C230 236 228 222 228 210 Z"/></g>
    <path class="dz-tail" fill="url(#${u}f)" d="M174 196 C156 190 138 192 124 200 C138 198 150 200 160 206 C146 206 134 210 126 216 C146 214 164 210 176 204 Z"/>
    <path class="dz-body" fill="url(#${u}f)" d="M170 204 C176 182 204 166 238 162 C266 158 290 164 306 178 L314 204 Z"/>
    <path class="dz-tufts" d="M186 182 c4 -6 9 -8 14 -6 M206 172 c4 -6 10 -8 15 -5 M228 166 c4 -6 10 -7 15 -4 M250 164 c5 -5 10 -6 15 -3 M272 166 c4 -4 10 -5 14 -2"/>
    <g class="dz-headg">
      <path class="dz-neck" fill="url(#${u}f)" d="M290 204 C286 176 296 152 318 140 L352 152 L346 204 Z"/>
      <path class="dz-ruff" d="M300 168 c-6 6 -8 14 -6 22 M310 156 c-6 6 -9 14 -8 22"/>
      <path class="dz-head" fill="url(#${u}f)" d="M318 150 C318 124 340 106 368 106 C394 106 412 120 418 140 C420 148 420 154 418 160 L446 164 C458 166 464 176 460 186 C456 196 444 200 432 200 L404 200 C392 208 370 210 350 206 C330 202 318 188 316 172 Z"/>
      <path class="dz-flew" d="M404 176 C412 190 426 196 440 194 C430 204 412 206 398 200 Z"/>
      <path class="dz-brow" d="M372 132 C384 126 398 128 406 136"/>
      <ellipse class="dz-eye" cx="392" cy="142" rx="5" ry="4"/><circle class="dz-glint" cx="393.6" cy="140.6" r="1.5"/>
      <path class="dz-stop" d="M412 140 C418 148 420 156 418 162"/>
      <ellipse class="dz-nose" cx="456" cy="172" rx="9" ry="7.5"/><path class="dz-nosehi" d="M451 167 q4 -2 8 0"/>
      <path class="dz-ear" fill="url(#${u}f)" d="M350 116 C330 120 320 140 322 164 C324 180 332 192 342 196 C350 184 356 166 358 146 C360 134 358 124 350 116 Z"/>
      <path class="dz-earfur" d="M330 150 c-2 10 0 22 6 32 M338 140 c-2 12 0 24 6 34"/>
      <path class="dz-sheen" d="M346 112 C362 106 382 108 396 116 M424 158 C432 156 442 158 448 162"/>
      <path class="dz-ropebit" d="M430 192 C412 196 380 196 344 196"/>
    </g>
    <g class="d-splash"><path d="M462 186 q8 -10 16 -4 M470 196 q10 -6 18 0 M300 196 q-6 -10 -14 -8"/><circle cx="478" cy="176" r="2"/><circle cx="486" cy="190" r="1.6"/><circle cx="294" cy="182" r="1.6"/></g>
    <path class="dz-ripple" d="M286 206 C320 214 380 214 450 204"/>
  </g>
  <rect y="203" width="640" height="97" fill="url(#${u}o)"/>
  <path class="n-wave" d="M20 240 q20 -8 40 0 t40 0 M200 262 q20 -8 40 0 t40 0 M420 240 q20 -8 40 0 t40 0 M90 284 q20 -8 40 0 t40 0 M470 282 q20 -8 40 0 t40 0"/>
  </svg>`;
}

/** A perforated stamp card (the kit .bt-flip with the medal restyled as a stamp; never a round medal). */
export const stampFlip = ([ic, name, sub, back, yr]: [string, string, string, string, string]) =>
  `<button type="button" class="bt-flip bt-flip--gold" aria-label="${name}, ${sub}. ${back.replace(/"/g, "&quot;")}"><span class="bt-flip-in"><span class="bt-flip-face" aria-hidden="true"><span class="bt-flip-medal"><span class="nl-stamp-in">${ic}<em>${yr}</em><s>NFLD</s></span></span><b>${name}</b><span class="bt-flip-sub">${sub}</span><span class="bt-flip-hint">Turn over</span></span><span class="bt-flip-face bt-flip-face--back" aria-hidden="true"><span class="bt-flip-k">${name}</span><span class="bt-flip-v">${back}</span></span></span></button>`;
