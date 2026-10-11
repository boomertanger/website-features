// site/src/scripts/base-camp/story-art.ts — /base-camp's drawn scenes (docs/design/mockups/base-camp.html; built at build time by
// pages/base-camp/index.astro): the hero H1 "The climb" (a camp at the foot of a dark mountain, the trail's five purple waypoints link to the
// chapters, the mascot by the fire and the painted sleeping Skipper curled up beside it), the five Top 5 stage-card scenes (hallway, game shelf,
// chat, mods, two PCs), the three playing-card suits, and the platform tiles (the official marks from data/footer-icons.js).
// Colours are classes in styles/base-camp.css and base-camp-story.css; gradient ids are unique per scene.
import artwork from "../../../../shared/assets/mascot.svg?raw";
import { sleepingCorgi } from "./corgi";
import { PLATFORM_ICONS } from "../../data/footer-icons.js";

let n = 0;
const nid = (p: string) => `${p}${++n}`;

/** The mascot's shapes (shared/assets/mascot.svg minus its root and metadata), for a nested <svg class="bt-mascot"> inside a scene. */
const MASCOT_INNER = artwork.replace(/<metadata[\s\S]*?<\/metadata>/, "").replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").trim();
const MASCOT_VB = artwork.match(/<svg[^>]*\bviewBox="([^"]+)"/)?.[1] ?? "30 92 145 162";
// The kit sizes .bt-mascot with CSS (width: 36px), which would beat a nested <svg>'s width attribute, so the size goes in an inline style too.
export const mascotAt = (x: number, y: number, w: number, h: number) => `<svg class="bt-mascot" x="${x}" y="${y}" width="${w}" height="${h}" style="width:${w}px;height:${h}px" viewBox="${MASCOT_VB}" aria-hidden="true">${MASCOT_INNER}</svg>`;

/** Hero H1 "The climb". wps: [x, y, "01", label, chapter id]. */
export function climbScene(labels: string[], ids: string[]) {
  const sky = nid("bcSky"), glow = nid("bcGlow");
  const stars = [[30, 30], [70, 18], [120, 40], [180, 22], [210, 52], [260, 14], [340, 30], [372, 60], [316, 74], [150, 64], [24, 80], [96, 70]].map(([x, y]) => `<circle class="s-star" cx="${x}" cy="${y}" r="${x % 3 ? 1 : 1.4}"/>`).join("");
  const at = [[150, 258], [236, 226], [170, 180], [252, 136], [286, 96]];
  const wps = at.map(([x, y], i) => {
    const num = String(i + 1).padStart(2, "0");
    return `<a class="s-wp" href="#${ids[i]}" aria-label="Chapter ${i + 1}: ${labels[i]}"><circle cx="${x}" cy="${y}" r="9"/><text x="${x}" y="${y}">${num}</text><text class="s-wp-lab" x="${x + 14}" y="${y}">${labels[i]}</text></a>`;
  }).join("");
  return `<svg class="bc-scene bc-scene--climb" viewBox="0 0 400 320" role="img" aria-label="A camp at the foot of a dark mountain. A trail with five waypoints climbs to a flag at the top. The mascot sits by the fire, with Skipper curled up asleep beside it.">
    <defs><linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1"><stop class="s-sky0" offset="0"/><stop class="s-sky1" offset="1"/></linearGradient>
    <radialGradient id="${glow}"><stop class="s-glow0" offset="0"/><stop class="s-glow1" offset="1"/></radialGradient></defs>
    <rect width="400" height="320" rx="16" fill="url(#${sky})"/>${stars}
    <path class="s-far" d="M0 220 L60 150 L110 190 L170 120 L215 170 L260 130 L330 180 L400 140 L400 320 L0 320 Z"/>
    <path class="s-peak" d="M40 320 L300 52 L392 320 Z"/>
    <path class="s-snow" d="M268 86 L300 52 L322 106 L306 96 L292 110 L282 94 Z"/>
    <path class="s-trail" d="M118 290 Q140 270 150 258 Q200 240 236 226 Q200 200 170 180 Q215 156 252 136 Q270 116 286 96 Q294 78 300 60"/>
    <line class="s-flagpole" x1="300" y1="60" x2="300" y2="40"/><path class="s-flag" d="M300 40 L316 45 L300 50 Z"/>
    <path class="s-ground" d="M0 288 Q120 276 220 292 T400 286 L400 320 L0 320 Z"/>
    <circle cx="100" cy="292" r="46" fill="url(#${glow})"/>
    <path class="s-tent" d="M22 300 L52 254 L82 300 Z"/><path class="s-tentdoor" d="M44 300 L52 280 L60 300 Z"/>
    <line class="s-log" x1="88" y1="304" x2="114" y2="296"/><line class="s-log" x1="88" y1="296" x2="114" y2="304"/>
    <path class="s-fl1" d="M101 300 C90 288 96 278 100 266 C103 276 110 282 108 292 C107 297 105 300 101 300 Z"/>
    <path class="s-fl2" d="M101 300 C94 292 98 284 101 276 C103 284 107 288 106 294 C105 298 103 300 101 300 Z"/>
    <path class="s-fl3" d="M101 300 C97 296 99 291 101 287 C102 291 104 293 103.5 296 C103 299 102 300 101 300 Z"/>
    <circle class="s-spark" cx="100" cy="270" r="1.4"/><circle class="s-spark s-spark--2" cx="104" cy="274" r="1.1"/><circle class="s-spark s-spark--3" cx="98" cy="272" r="1"/>
    ${mascotAt(112, 252, 44, 50)}
    <g transform="translate(139 278) scale(0.27)">${sleepingCorgi()}</g>
    ${wps}
  </svg>`;
}

/** The five Top 5 scenes (E1 stage cards). */
export function edgeScene(kind: string) {
  const u = nid("bcE");
  switch (kind) {
    case "scream": {
      const bars = Array.from({ length: 24 }, (_, i) => `<rect class="h-bar" x="${560 + i * 9}" y="150" width="5" height="40" rx="2" style="--d:${((i % 9) / 10).toFixed(1)}s;--h:${[0.3, 0.7, 0.4, 0.8, 0.5, 0.9, 0.6][i % 7]}"/>`).join("");
      return `<svg viewBox="0 0 800 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><radialGradient id="${u}r"><stop offset="0" class="g-red0"/><stop offset="1" class="g-red1"/></radialGradient>
    <linearGradient id="${u}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="g-lamp0"/><stop offset="1" class="g-lamp1"/></linearGradient></defs>
    <path class="h-wall" d="M0 0 L330 62 L330 176 L0 220 Z"/><path class="h-wall" d="M800 0 L470 62 L470 176 L800 220 Z"/>
    <path class="h-ceil" d="M0 0 H800 L470 62 H330 Z"/><path class="h-floor" d="M0 220 L330 176 H470 L800 220 Z"/>
    <path class="h-line" d="M110 220 L360 176 M690 220 L440 176 M400 220 V176"/>
    <rect class="h-frame" x="352" y="80" width="96" height="96"/><rect class="h-dark" x="356" y="84" width="88" height="92"/>
    <circle class="h-eye" cx="389" cy="122" r="3.6"/><circle class="h-eye" cx="411" cy="122" r="3.6"/>
    <rect class="h-door" x="356" y="84" width="88" height="92"/><circle class="h-knob" cx="434" cy="132" r="2.4"/>
    <circle class="h-redwash" cx="400" cy="128" r="210" fill="url(#${u}r)"/>
    <path class="h-cone" d="M392 34 L408 34 L470 176 L330 176 Z" fill="url(#${u}c)"/>
    <rect class="h-lamp" x="388" y="26" width="24" height="9" rx="3"/>
    <g class="h-meter">${bars}</g>
    <text class="h-cue" x="40" y="200">TURN THE LIGHTS OFF</text>
  </svg>`;
    }
    case "games":
      return `<svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><linearGradient id="${u}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="g-lamp0"/><stop offset="1" class="g-lamp1"/></linearGradient></defs>
    <path class="g-cone" d="M176 0 H224 L262 168 H138 Z" fill="url(#${u}c)"/>
    <rect class="g-shelf" x="70" y="166" width="260" height="8" rx="2"/>
    ${[[96, 74, 92, 1], [122, 66, 100, 2], [146, 82, 84, 3], [206, 70, 96, 4], [230, 78, 88, 5], [254, 68, 98, 1]].map(([x, y, h, t]) => `<rect class="g-spine g-t${t}" x="${x}" y="${y}" width="22" height="${h}" rx="3"/><rect class="g-lab" x="${x + 6}" y="${y + 12}" width="10" height="3" rx="1.5"/>`).join("")}
    <g class="g-pick"><rect class="g-case" x="182" y="60" width="36" height="106" rx="4"/><rect class="g-cover" x="186" y="66" width="28" height="56" rx="2"/><text class="g-q" x="200" y="104">?</text><rect class="g-lab" x="188" y="132" width="24" height="4" rx="2"/><rect class="g-lab" x="191" y="142" width="18" height="4" rx="2"/></g>
    ${[[160, 150, 1.6, 0], [236, 140, 1.3, 0.6], [206, 156, 1.2, 1.2], [184, 150, 1.4, 1.8]].map(([x, y, r, d]) => `<circle class="g-mote" cx="${x}" cy="${y}" r="${r}" style="--d:${d}s"/>`).join("")}
  </svg>`;
    case "chat":
      return `<svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect class="c-screen" x="22" y="34" width="168" height="112" rx="10"/>
    <rect class="c-door c-door--l" x="52" y="62" width="38" height="70" rx="3"/><rect class="c-door" x="122" y="62" width="38" height="70" rx="3"/>
    <text class="c-dl" x="71" y="102">L</text><text class="c-dl" x="141" y="102">R</text>
    <rect class="c-vote" x="22" y="158" width="168" height="10" rx="5"/><rect class="c-vote-fill" x="22" y="158" width="168" height="10" rx="5"/>
    <text class="c-pct" x="22" y="186">LEFT 72%</text>
    <rect class="c-panel" x="212" y="20" width="168" height="160" rx="12"/>
    <g class="c-msg" style="--i:0"><rect x="224" y="34" width="96" height="22" rx="11"/><text x="236" y="49">left door!</text></g>
    <g class="c-msg" style="--i:1"><rect x="244" y="62" width="124" height="22" rx="11"/><text x="256" y="77">code is 3-7-1</text></g>
    <g class="c-msg" style="--i:2"><rect x="224" y="90" width="70" height="22" rx="11"/><text x="236" y="105">LEFT</text></g>
    <g class="c-msg c-msg--big" style="--i:3"><rect x="244" y="118" width="124" height="34" rx="12"/><text x="306" y="141">RUN!!</text></g>
    <g class="c-typing"><circle cx="236" cy="166" r="3"/><circle cx="246" cy="166" r="3"/><circle cx="256" cy="166" r="3"/></g>
  </svg>`;
    case "mods": {
      const rays = Array.from({ length: 12 }, (_, i) => {
        const a = (i * 30 * Math.PI) / 180, b = ((i * 30 + 7) * Math.PI) / 180, R = 260;
        return `<path d="M200 90 L${(200 + Math.cos(a) * R).toFixed(1)} ${(90 + Math.sin(a) * R).toFixed(1)} L${(200 + Math.cos(b) * R).toFixed(1)} ${(90 + Math.sin(b) * R).toFixed(1)} Z"/>`;
      }).join("");
      const shield = "M200 26 L244 42 V88 C244 120 222 142 200 154 C178 142 156 120 156 88 V42 Z";
      return `<svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><linearGradient id="${u}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="g-gl0"/><stop offset=".5" class="g-gl1"/><stop offset="1" class="g-gl0"/></linearGradient>
    <clipPath id="${u}k"><path d="${shield}"/></clipPath></defs>
    <g class="m-rays">${rays}</g>
    <g class="m-shield"><path class="m-sh" d="${shield}"/><path class="m-sh-in" d="M200 38 L234 50 V88 C234 113 217 131 200 141 C183 131 166 113 166 88 V50 Z"/>
    <path class="m-tick" d="M184 90 L196 102 L218 78"/><rect class="m-sweep" x="120" y="0" width="40" height="200" fill="url(#${u}g)" clip-path="url(#${u}k)"/></g>
    <g class="m-av" style="--i:0"><circle cx="96" cy="150" r="17"/><path class="m-star" d="M96 118 l3 6 6 1 -4.5 4 1 6 -5.5 -3 -5.5 3 1 -6 -4.5 -4 6 -1 Z"/></g>
    <g class="m-av" style="--i:1"><circle cx="304" cy="150" r="17"/><path class="m-star" d="M304 118 l3 6 6 1 -4.5 4 1 6 -5.5 -3 -5.5 3 1 -6 -4.5 -4 6 -1 Z"/></g>
    <g class="m-av" style="--i:2"><circle cx="200" cy="182" r="13"/></g>
  </svg>`;
    }
    case "pcs": {
      const pc = (x: number) => { const c = x + 35; return `<g class="p-pc"><rect class="p-case" x="${x}" y="36" width="70" height="124" rx="8"/><g class="p-fan" style="transform-origin:${c}px 82px"><circle class="p-ring" cx="${c}" cy="82" r="22"/><path class="p-blade" d="M${c} 82 L${c} 64 A18 18 0 0 1 ${c + 15} 74 Z M${c} 82 L${c + 16} 91 A18 18 0 0 1 ${c} 100 Z M${c} 82 L${c - 16} 91 A18 18 0 0 1 ${c - 15} 73 Z"/></g><g class="p-fan" style="transform-origin:${c}px 128px"><circle class="p-ring" cx="${c}" cy="128" r="18"/><path class="p-blade" d="M${c} 128 L${c} 114 A14 14 0 0 1 ${c + 12} 121 Z M${c} 128 L${c + 12} 135 A14 14 0 0 1 ${c} 142 Z M${c} 128 L${c - 12} 135 A14 14 0 0 1 ${c - 12} 121 Z"/></g><circle class="p-led" cx="${x + 10}" cy="48" r="3"/></g>`; };
      const grid = [40, 80, 120, 160].map((y) => `M0 ${y} H400`).join(" ") + " " + [40, 80, 120, 160, 200, 240, 280, 320, 360].map((x) => `M${x} 0 V200`).join(" ");
      return `<svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <path class="p-grid" d="${grid}"/>${pc(54)}${pc(276)}
    <path class="p-cable" d="M124 140 C170 140 170 110 200 110 C230 110 230 140 276 140"/>
    <path class="p-glow" d="M124 140 C170 140 170 110 200 110 C230 110 230 140 276 140"/>
    <text class="p-tag" x="200" y="96">GAMING  →  STREAMING</text>
  </svg>`;
    }
  }
  return "";
}

/** The three playing-card suits (viewBox 0 0 100 100). */
const SUIT: Record<string, string> = {
  heart: `<path d="M50 84 C20 64 8 48 8 32 C8 18 19 8 32 8 C40 8 46 12 50 19 C54 12 60 8 68 8 C81 8 92 18 92 32 C92 48 80 64 50 84 Z"/>`,
  ghost: `<path d="M50 8 C28 8 14 24 14 46 V88 L24 80 L34 88 L44 80 L50 86 L56 80 L66 88 L76 80 L86 88 V46 C86 24 72 8 50 8 Z"/><ellipse class="pc-hole" cx="37" cy="42" rx="6" ry="9"/><ellipse class="pc-hole" cx="63" cy="42" rx="6" ry="9"/><ellipse class="pc-hole" cx="50" cy="62" rx="7" ry="9"/>`,
  gear: `<path d="M44 6 H56 L58 18 C62 19 66 21 69 23 L79 16 L87 24 L80 34 C82 37 84 41 85 45 L96 47 V59 L85 61 C84 65 82 69 80 72 L87 82 L79 90 L69 83 C66 85 62 87 58 88 L56 99 H44 L42 88 C38 87 34 85 31 83 L21 90 L13 82 L20 72 C18 69 16 65 15 61 L4 59 V47 L15 45 C16 41 18 37 20 34 L13 24 L21 16 L31 23 C34 21 38 19 42 18 Z"/><circle class="pc-hole" cx="50" cy="53" r="15"/>`,
};
export const suitSvg = (s: string, cls = "") => `<svg class="pc-suit${cls ? ` ${cls}` : ""}" viewBox="0 0 100 100" aria-hidden="true" focusable="false">${SUIT[s] || ""}</svg>`;
export const cardIndex = (s: string, cls = "") => `<span class="pc-idx${cls ? ` ${cls}` : ""}"><b>A</b>${suitSvg(s)}</span>`;

/** A platform tile with the official mark. */
export const platformTile = (k: "twitch" | "tiktok" | "youtube") => `<span class="bc-pi bc-pi--${k}" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="${PLATFORM_ICONS[k]}"/></svg></span>`;
