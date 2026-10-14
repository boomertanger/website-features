# Addendum: Bug Zapper hero lamp redraw — CONFIRMED (Oct 2026)

Amends `docs/specs/bug-zapper.md` (decision 13, §7 Hero, Appendix A). Approved mockup:
`docs/design/mockups/bug-zapper-lamp.html` (section "V1 UV violet"; published copy
https://claude.ai/artifact/T1QJMGdeB9oNJ2MT7xTXfp).

## Why

The hero lamp was the 36 px wordmark icon scaled up: its 1.9 outline became a thick, flat tube, and it was purple,
which on this site means clickable. The hero lamp is decoration, not a button.

## Decisions

1. **Hero lamp = L2 Porch lantern**, drawn at full size (its own SVG, not the icon scaled): peaked iron roof, tapered
   glass panes, one glowing UV tube, hairline wires, iron frame. Used in the /bug-zapper hero and the How it works hero.
2. **Light colour = V1 UV violet**, one declared feature colour `--bz-uv: #7c5cff`. It is used **only as light**: the
   tube, the tube's glow, the halo behind the lamp, the floor pool, the hero's soft background tint, the wordmark icon's
   lit tube and halo, and the ZAPPED IN success glow. Never an outline, a border or a flat fill. The metal is iron
   (`--bt-wire` mixes), so purple keeps meaning clickable. The zap bolt stays `--bt-lamp`; moths unchanged.
3. **Wordmark icon (I1 Porch zapper)** keeps its drawing and purple outline (it is a link), with the outline thinned
   from 1.9 to 1.5 (`.frame`, `.cap`, `.base`, `.frame-line`; the ring 1.4 → 1.2). Its tube and halo use `--bz-uv`.
4. Rename the feature glow properties `--bz-ice-glow` / `--bz-ice-faint` to `--bz-glow` / `--bz-glow-faint`, defined
   from `--bz-uv`. `--bt-ice` stays a kit token; Bug Zapper just stops using it for its light.
5. Reduced motion: the tube's slow hum stops; the glow stays.

## Lamp source (site/src/scripts/bugs/art.ts, `bzLamp(uid)`; unique gradient ids per copy)

```js
export function bzLamp(u) {
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
```

## CSS (bug-zapper.css; replaces the old hero lamp rules; tokens plus the one declared colour)

```css
.bt-root:not(#_) .bz-root { --bz-uv: #7c5cff; --bz-glow: color-mix(in srgb, var(--bz-uv) 45%, transparent); --bz-glow-faint: color-mix(in srgb, var(--bz-uv) 14%, transparent); --bz-core: color-mix(in srgb, var(--bz-uv) 25%, var(--bt-snow)); }
.bt-root:not(#_) .bz-lamp-wrap { position: absolute; left: 54%; top: 0; width: 86px; height: 152px; margin-left: -43px; }
.bt-root:not(#_) .bz-lamp { display: block; width: 100%; height: 100%; overflow: visible; }
.bt-root:not(#_) .bz-lamp-pool { position: absolute; left: 54%; bottom: -6px; width: 150px; height: 26px; margin-left: -75px; border-radius: 50%; background: radial-gradient(closest-side, color-mix(in srgb, var(--bz-uv) 30%, transparent), transparent); }
.bt-root:not(#_) .bz-lamp .cord { fill: none; stroke: var(--bt-wire); stroke-width: 1.4; stroke-linecap: round; }
.bt-root:not(#_) .bz-lamp .ringo { fill: none; stroke: var(--bt-wire); stroke-width: 1.8; }
.bt-root:not(#_) .bz-lamp .edge { stroke: color-mix(in srgb, var(--bt-snow) 22%, transparent); stroke-width: .7; }
.bt-root:not(#_) .bz-lamp .sheen { fill: none; stroke: color-mix(in srgb, var(--bt-snow) 55%, transparent); stroke-width: 1.4; stroke-linecap: round; }
.bt-root:not(#_) .bz-lamp .i0 { stop-color: color-mix(in srgb, var(--bt-wire) 18%, var(--bt-bg)); }
.bt-root:not(#_) .bz-lamp .i1 { stop-color: color-mix(in srgb, var(--bt-wire) 55%, var(--bt-bg)); }
.bt-root:not(#_) .bz-lamp .g0 { stop-color: color-mix(in srgb, var(--bz-uv) 12%, var(--bt-bg)); }
.bt-root:not(#_) .bz-lamp .g1 { stop-color: color-mix(in srgb, var(--bz-uv) 28%, var(--bt-bg)); }
.bt-root:not(#_) .bz-lamp .t0 { stop-color: var(--bz-uv); }
.bt-root:not(#_) .bz-lamp .t1 { stop-color: var(--bz-core); }
.bt-root:not(#_) .bz-lamp .tube { filter: drop-shadow(0 0 3px var(--bz-uv)) drop-shadow(0 0 9px var(--bz-uv)); animation: bz-lamp-hum 3.2s ease-in-out infinite; }
.bt-root:not(#_) .bz-lamp .wire { fill: none; stroke: var(--bt-wire); stroke-width: .55; opacity: .75; }
.bt-root:not(#_) .bz-lamp .ring2 { fill: none; stroke: color-mix(in srgb, var(--bt-snow) 30%, var(--bt-wire)); stroke-width: 1.3; }
.bt-root:not(#_) .bz-lamp .glint { fill: none; stroke: color-mix(in srgb, var(--bt-snow) 20%, transparent); stroke-width: 1.4; stroke-linecap: round; }
.bt-root:not(#_) .bz-lamp .frame { fill: none; stroke: color-mix(in srgb, var(--bt-wire) 60%, var(--bt-bg)); stroke-width: 2.4; stroke-linejoin: round; }
@keyframes bz-lamp-hum { 0%, 100% { opacity: .92; } 50% { opacity: 1; } }
@container bt (max-width: 640px) { .bt-root:not(#_) .bz-lamp-wrap { width: 66px; height: 116px; margin-left: -33px; } .bt-root:not(#_) .bz-lamp-pool { width: 110px; margin-left: -55px; } }
@media (prefers-reduced-motion: reduce) { .bt-root:not(#_) .bz-lamp .tube { animation: none; } }
```

Scene markup inside `.bz-porch`: the existing `.bz-porch-glow` (now `--bz-glow`), then
`<span class="bz-lamp-pool"></span><div class="bz-lamp-wrap">${bzLamp(uid)}</div>`, then the moths, zap effect,
mascot and count as before. How it works hero: scale the wrap up (about 104 × 184 px), as the old big lamp was.
