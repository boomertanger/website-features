# Addendum: Bug Zapper wordmark icon — M1 Hanging lantern with E4 Big zap — CONFIRMED (Oct 2026)

Amends `docs/specs/bug-zapper.md` (decision 13, Appendix A) and `docs/specs/bug-zapper-lamp.md` (decision 3).
Approved mockups: `docs/design/mockups/bug-zapper-icon.html` (M1) and `docs/design/mockups/bug-zapper-icon-bolts.html`
(E4). Published: https://claude.ai/artifact/CjGBLZP2GtT4bk7b6FFdFR

## Decisions

1. The wordmark icon becomes the hero's Porch lantern in miniature (**M1 Hanging lantern**): ring, peaked roof, tapered
   glass, one tube, two wires, one hoop, base. It replaces I1 Porch zapper everywhere the icon appears (the top bar,
   the /admin card, the How it works "Zapped" stage card).
2. Outline `--bt-primary` at 1.5 (ring 1.2). The wordmark is a link, so purple is right here and only here.
3. Light: the tube and halo use `--bz-uv` (declared once on the Bug Zapper page root, per `bug-zapper-lamp.md`).
4. **E4 Big zap** on power-on (hover, focus, or `.is-lit` from `initPowerWordmarks` on touch): the moth flies in on the
   2.4 s loop; when it hits the glass a forked bolt (`--bt-lamp` with a `--bt-snow` core) bursts out with a white flash,
   and a small violet arc (`--bz-uv` with a white core) crackles inside. At rest: no bolts.
5. Reduced motion: nothing flashes or moves; the lit state shows the tube glow and one still bolt.
6. Outside the wordmark (the How it works "Zapped" stage card), wrap the icon in `.bz-icon-live` so it plays on that
   card's hover and focus.

## Source (site/src/scripts/bugs/art.ts; unique gradient ids per copy)

```js
export const bzIcon = (u) => `<svg class="bz-icon bz-icon--lantern" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><defs><linearGradient id="${u}t" x1="0" x2="1"><stop offset="0" class="t-lo"/><stop offset=".5" class="t-hi"/><stop offset="1" class="t-lo"/></linearGradient><radialGradient id="${u}h"><stop offset="0" class="h-in"/><stop offset="1" class="h-out"/></radialGradient></defs>
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
```

## CSS (bug-zapper.css; replaces the I1 icon rules; tokens plus the declared `--bz-uv`)

```css
.bt-root:not(#_) .bz-icon { width: 36px; height: 36px; overflow: visible; }
.bt-root:not(#_) .bz-wm .bt-wordmark-icon { padding-top: 2px; }
.bt-root:not(#_) .bz-icon :is(.frame, .cap, .base) { fill: var(--bt-surface-2); stroke: var(--bt-primary); stroke-width: 1.5; stroke-linejoin: round; }
.bt-root:not(#_) .bz-icon .frame { fill: color-mix(in srgb, var(--bz-uv) 10%, var(--bt-surface-2)); }
.bt-root:not(#_) .bz-icon .frame-line { fill: none; stroke: var(--bt-primary); stroke-width: 1.5; stroke-linejoin: round; }
.bt-root:not(#_) .bz-icon .hang { fill: none; stroke: var(--bt-text-faint); stroke-width: 1.3; stroke-linecap: round; }
.bt-root:not(#_) .bz-icon .ring { fill: none; stroke: var(--bt-primary); stroke-width: 1.2; }
.bt-root:not(#_) .bz-icon .wire { fill: none; stroke: var(--bt-wire); stroke-width: 0.9; opacity: 0.85; }
.bt-root:not(#_) .bz-icon .rung { fill: none; stroke: var(--bt-wire); stroke-width: 0.8; opacity: 0.55; }
.bt-root:not(#_) .bz-icon .t-lo { stop-color: var(--bz-uv); stop-opacity: .55; }
.bt-root:not(#_) .bz-icon .t-hi { stop-color: var(--bz-core); stop-opacity: .95; }
.bt-root:not(#_) .bz-icon .tube { opacity: 0.5; transition: opacity 0.3s, filter 0.3s; }
.bt-root:not(#_) .bz-icon .h-in { stop-color: var(--bz-uv); stop-opacity: .5; }
.bt-root:not(#_) .bz-icon .h-out { stop-color: var(--bz-uv); stop-opacity: 0; }
.bt-root:not(#_) .bz-icon .halo { opacity: 0; transition: opacity 0.35s; }
.bt-root:not(#_) .bz-icon .moth .body { fill: var(--bt-wax); }
.bt-root:not(#_) .bz-icon .moth .wing { fill: var(--bt-text-muted); opacity: 0.9; transform-box: fill-box; }
.bt-root:not(#_) .bz-icon .moth .w1 { transform-origin: 100% 40%; }
.bt-root:not(#_) .bz-icon .moth .w2 { transform-origin: 0% 40%; }
.bt-root:not(#_) .bz-icon .moth { transform-box: fill-box; transform-origin: center; }
.bt-root:not(#_) .bz-icon .zap { fill: none; stroke: var(--bt-lamp); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; opacity: 0; filter: drop-shadow(0 0 2px rgba(var(--bt-lamp-rgb), 0.95)); }
.bt-root:not(#_) .bz-icon .sparks circle { fill: var(--bt-lamp); opacity: 0; transform-box: fill-box; transform-origin: center; }
.bt-root:not(#_) .bz-icon .sparks circle:nth-child(even) { fill: var(--bt-title); }
.bt-root:not(#_) .bz-icon .ash { fill: var(--bt-text-faint); opacity: 0; }
/* Power on: hover, focus, or .is-lit (initPowerWordmarks on touch screens) */
.bt-root:not(#_) .bt-wordmark--power:is(:hover, :focus-visible, .is-lit) .bz-icon .tube { opacity: 1; filter: drop-shadow(0 0 2px var(--bz-uv)) drop-shadow(0 0 6px var(--bz-glow)); }
.bt-root:not(#_) .bt-wordmark--power:is(:hover, :focus-visible, .is-lit) .bz-icon .halo { opacity: 1; }
.bt-root:not(#_) .bt-wordmark--power:is(:hover, :focus-visible, .is-lit) .bz-icon--lantern .moth { animation: bz-moth 2.4s ease-in-out infinite; }
.bt-root:not(#_) .bt-wordmark--power:is(:hover, :focus-visible, .is-lit) .bz-icon .moth .wing { animation: bz-flutter 0.16s ease-in-out infinite alternate; }
.bt-root:not(#_) .bt-wordmark--power:is(:hover, :focus-visible, .is-lit) .bz-icon--lantern .zap { animation: bz-flash 2.4s steps(1, end) infinite; }
.bt-root:not(#_) .bt-wordmark--power:is(:hover, :focus-visible, .is-lit) .bz-icon--lantern .sparks circle { animation: bz-spark 2.4s ease-out infinite; }
.bt-root:not(#_) .bt-wordmark--power:is(:hover, :focus-visible, .is-lit) .bz-icon--lantern .ash { animation: bz-ash 2.4s ease-in infinite; }
.bt-root:not(#_) .bz-icon .sparks circle:nth-child(1) { --dx: 1.5px; --dy: -2px; } .bt-root:not(#_) .bz-icon .sparks circle:nth-child(2) { --dx: 2.5px; --dy: 1px; }
.bt-root:not(#_) .bz-icon .sparks circle:nth-child(3) { --dx: -.5px; --dy: 2.5px; } .bt-root:not(#_) .bz-icon .sparks circle:nth-child(4) { --dx: 2px; --dy: -.5px; }
@keyframes bz-moth { 0%, 100% { transform: translate(0, 0); opacity: 1; } 18% { transform: translate(-1.2px, 2.2px); } 32% { transform: translate(-.6px, 3.4px); } 48% { transform: translate(-4.6px, 4.6px) scale(1); opacity: 1; } 51% { transform: translate(-4.6px, 4.6px) scale(.3); opacity: 0; } 92% { transform: translate(1px, -1px); opacity: 0; } }
@keyframes bz-flutter { from { transform: scaleX(1); } to { transform: scaleX(0.4); } }
@keyframes bz-flash { 0%, 46% { opacity: 0; } 48% { opacity: 1; } 51% { opacity: .25; } 54% { opacity: 1; } 60%, 100% { opacity: 0; } }
@keyframes bz-spark { 0%, 47% { opacity: 0; transform: translate(0, 0) scale(.4); } 50% { opacity: 1; transform: translate(0, 0) scale(1.2); } 66% { opacity: 0; transform: translate(var(--dx, 2px), var(--dy, -2px)) scale(.6); } 100% { opacity: 0; } }
@keyframes bz-ash { 0%, 52% { opacity: 0; transform: translate(0, 0); } 56% { opacity: 1; } 88% { opacity: 0; transform: translate(-.6px, 11px); } 100% { opacity: 0; } }
@keyframes bz-flicker { 0% { opacity: .2; } 12% { opacity: 1; } 20% { opacity: .3; } 30%, 100% { opacity: 1; } }

.bt-root:not(#_) .bz-icon .arc .bg { stroke: var(--bz-uv); stroke-width: 1.5; filter: drop-shadow(0 0 1.4px var(--bz-uv)); }
.bt-root:not(#_) .bz-icon .arc .bc { stroke: var(--bt-snow); stroke-width: .55; }
.bt-root:not(#_) .bz-icon .flashc { fill: var(--bt-snow); transform-box: fill-box; transform-origin: center; filter: blur(1.2px); }
.bt-root:not(#_) :is(.bt-wordmark--power:is(:hover, :focus-visible, .is-lit), .bz-icon-live:is(:hover, :focus-within)) .bz-icon .moth .wing { animation: bz-flutter .16s ease-in-out infinite alternate; }
.bt-root:not(#_) :is(.bt-wordmark--power:is(:hover, :focus-visible, .is-lit), .bz-icon-live:is(:hover, :focus-within)) .bz-icon--lantern .moth { animation: bz-moth 2.4s ease-in-out infinite; }
.bt-root:not(#_) :is(.bt-wordmark--power:is(:hover, :focus-visible, .is-lit), .bz-icon-live:is(:hover, :focus-within)) .bz-icon--lantern .zap { animation: bz-flash 2.4s steps(1, end) infinite; }
.bt-root:not(#_) :is(.bt-wordmark--power:is(:hover, :focus-visible, .is-lit), .bz-icon-live:is(:hover, :focus-within)) .bz-icon--lantern .sparks circle { animation: bz-spark 2.4s ease-out infinite; }
.bt-root:not(#_) :is(.bt-wordmark--power:is(:hover, :focus-visible, .is-lit), .bz-icon-live:is(:hover, :focus-within)) .bz-icon--lantern .ash { animation: bz-ash 2.4s ease-in infinite; }
.bt-root:not(#_) :is(.bt-wordmark--power:is(:hover, :focus-visible, .is-lit), .bz-icon-live:is(:hover, :focus-within)) .bz-icon .halo { opacity: 1; }
.bt-root:not(#_) :is(.bt-wordmark--power:is(:hover, :focus-visible, .is-lit), .bz-icon-live:is(:hover, :focus-within)) .bz-icon .fork { animation: bz-flash 2.4s steps(1, end) infinite; }
.bt-root:not(#_) :is(.bt-wordmark--power:is(:hover, :focus-visible, .is-lit), .bz-icon-live:is(:hover, :focus-within)) .bz-icon .f2 { animation-delay: .03s; }
.bt-root:not(#_) :is(.bt-wordmark--power:is(:hover, :focus-visible, .is-lit), .bz-icon-live:is(:hover, :focus-within)) .bz-icon .a4 { animation: bz-flash 2.4s steps(1, end) .06s infinite; }
.bt-root:not(#_) :is(.bt-wordmark--power:is(:hover, :focus-visible, .is-lit), .bz-icon-live:is(:hover, :focus-within)) .bz-icon .flashc { animation: bz-pop 2.4s ease-out infinite; }
@keyframes bz-pop { 0%, 47% { opacity: 0; transform: scale(.3); } 49% { opacity: .9; transform: scale(1); } 60%, 100% { opacity: 0; transform: scale(1.6); } }
@media (prefers-reduced-motion: reduce) {
}
```

Keep the existing moth keyframes (`bz-moth`, `bz-flutter`, `bz-flash`, `bz-spark`, `bz-ash`). Remove the I1-only
`.bz-icon--porch` rules.
