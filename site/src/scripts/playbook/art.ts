// The Playbook's art (docs/specs/playbook.md §8): the Overview hero's hanging light, a lamp on a cord swinging over a small open book, its beam and pool
// of light moving with it, the bulb flickering now and then, the mascot watching from the dark. Ported from the approved mockup's scene; every colour is
// a class in styles/playbook.css (tokens, and --pb-lamp for the light). Reduced motion (the CSS): it hangs still.
//   lampScene(mascot)   mascot = the mascot artwork's shapes (Mascot.astro's source), or "" to leave it out
//   BOOK_ICON           the PLAYBOOK wordmark's small book with a hanging bulb
let n = 0;
export function lampScene(mascot = ""): string {
  const u = `pbl${++n}${Math.random().toString(36).slice(2, 6)}`;
  const lines = (x0: number, x1: number, y0: number, dy: number, k: number, cls: string) => Array.from({ length: k }, (_, i) => `<path class="${cls}" d="M${x0} ${y0 + i * 9} Q${(x0 + x1) / 2} ${y0 - 28 + i * 9} ${x1} ${y0 - 12 + i * 9 + dy}"/>`).join("");
  return `<svg class="pb-lamp-scene" viewBox="0 0 600 375" role="img" aria-label="A lamp swinging on its cord over an open book in the dark, the mascot watching." focusable="false">
  <defs>
    <linearGradient id="${u}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="g-beam0"/><stop offset=".55" class="g-beam1"/><stop offset="1" class="g-beam2"/></linearGradient>
    <radialGradient id="${u}p" cx="50%" cy="50%" r="50%"><stop offset="0" class="g-pool0"/><stop offset="1" class="g-pool1"/></radialGradient>
  </defs>
  <g class="pool"><ellipse cx="300" cy="318" rx="150" ry="30" fill="url(#${u}p)"/></g>
  <g transform="translate(300 362) scale(.6) translate(-300 -362)">
    <path class="stand" d="M150 330 L300 262 L450 330 Z"/><rect class="stand-2" x="285" y="262" width="30" height="100"/><rect class="stand-2" x="230" y="355" width="140" height="14" rx="4"/>
    <path class="cover" d="M120 250 Q210 205 300 232 L300 300 Q210 272 120 318 Z"/>
    <path class="cover" d="M480 250 Q390 205 300 232 L300 300 Q390 272 480 318 Z"/>
    <path class="page page-r" d="M300 232 Q385 205 470 245 L470 300 Q385 268 300 296 Z"/>
    <path class="page" d="M130 248 Q210 210 296 234 L296 294 Q210 268 130 310 Z"/>
    ${lines(150, 285, 256, 0, 5, "text-l")}${lines(315, 455, 246, 10, 4, "text-r")}
  </g>
  ${mascot ? `<g transform="translate(60 232) scale(.68)" class="peek"><svg viewBox="30 92 145 162" width="145" height="162" class="bt-mascot bt-mascot--aware">${mascot}</svg></g>` : ""}
  <g class="swing">
    <path class="beam" d="M256 150 L170 350 L430 350 L344 150 Z" fill="url(#${u}b)"/>
    <circle class="halo" cx="300" cy="156" r="46"/>
    <line class="cord" x1="300" y1="0" x2="300" y2="84"/>
    <rect class="cap" x="292" y="80" width="16" height="16" rx="3"/>
    <path class="shade" d="M236 152 Q246 98 300 94 Q354 98 364 152 Z"/>
    <path class="shade-line" d="M252 128 Q300 112 348 128"/>
    <ellipse class="rim" cx="300" cy="152" rx="64" ry="9"/>
    <circle class="bulb" cx="300" cy="157" r="14"/>
  </g>
  <circle class="mote" cx="80" cy="70" r="1.6"/><circle class="mote" cx="530" cy="300" r="1.4"/>
</svg>`;
}

/** The wordmark's icon: a small open book with a bulb hanging over it. */
export const BOOK_ICON = `<svg class="pb-wm-ic" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><line class="w-cord" x1="16" y1="1" x2="16" y2="7"/><circle class="w-bulb" cx="16" cy="9.5" r="2.6"/><path class="w-book" d="M4 14 Q10 12 16 15 Q22 12 28 14 V27 Q22 25 16 28 Q10 25 4 27 Z"/><path class="w-spine" d="M16 15 V28"/></svg>`;
