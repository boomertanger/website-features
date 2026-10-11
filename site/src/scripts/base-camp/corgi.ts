// site/src/scripts/base-camp/corgi.ts — Skipper, drawn (docs/specs/base-camp.md "Corgi drawings"; from the approved Skipper mockup's corgi(),
// sittingCorgi() and sleepingCorgi()). Look A only (painted: gradients, rim light, fur strokes and a fine displacement "fur" edge). Each call returns
// an SVG <g> whose gradient and filter ids are unique to it, so any number can share a page. Palettes: .cgr (red Pembroke) and .cgm (blue merle
// Cardigan) in styles/base-camp.css. Used at build time (components/base-camp/Corgi.astro and the page scenes) and in the browser (Kind Words).
//
//   corgi({ coat, tail, catchHtml })   standing, side view; coat "red" | "merle", tail "short" | "long"; catchHtml goes in her mouth (a frisbee)
//   dogAt(x, y, scale, catchHtml, opts) the standing corgi placed in a scene
//   sittingCorgi()                     sitting (by the Pup Post mailbox)
//   sleepingCorgi()                    curled up asleep (cam off, the Base Camp hero)
//   CORGI_VIEWBOX                      the box each pose fits in (standing, sitting, sleeping)

// A prefix per module load keeps build-time ids and browser ids apart.
const PREFIX = `cg${Math.random().toString(36).slice(2, 6)}`;
let n = 0;
const nid = () => `${PREFIX}${++n}`;

export const CORGI_VIEWBOX = { standing: "0 -16 250 146", sitting: "20 -34 172 160", sleeping: "20 12 238 98" } as const;
export type CorgiPose = keyof typeof CORGI_VIEWBOX;

const FURLINES = (pts: number[][]) => pts.map(([x, y]) => `M${x} ${y} l-4 3`).join(" ");
const furFilter = (id: string, seed: number) => `<filter id="${id}" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${seed}"/><feDisplacementMap in="SourceGraphic" scale="2.2"/></filter>`;

/** The head every awake pose shares (ears, face, eye, tongue, nose, whiskers). B = coat gradient id, H = head gradient id, W = white gradient id. */
function awakeHead(B: string, H: string, W: string, merle: boolean, extra = "") {
  return `<g class="cg-ears">
      <path class="cg-coatf cg-ear-far" fill="url(#${B})" d="M186 24 C184 12 182 2 181 -8 C189 -3 196 6 199 15 Z"/>
      <path class="cg-coatf" fill="url(#${B})" d="M196 16 C198 5 200 -4 203 -13 C210 -5 214 6 212 19 Z"/>
      <path class="cg-ear-in" d="M199 14 C200 6 202 -1 203 -6 C207 0 209 7 208 15 Z"/>
      <path class="cg-earfluff" d="M201 13 c1 -4 2 -7 3 -9 M204 14 c1 -3 2 -6 4 -8 M200 10 c0 -2 1 -4 2 -5"/>
    </g>
    <path class="cg-coatf" fill="url(#${H})" d="M182 46 C178 34 184 18 198 14 C206 12 212 16 216 22 C220 28 226 32 238 37 C243 39 243 46 238 48 C232 51 226 54 220 56 C210 60 198 60 190 56 C184 53 182 50 182 46 Z"/>
    <path class="cg-white" fill="url(#${W})" d="M205 14 C207 19 209 25 212 30 C218 34 228 38 238 40 C242 42 242 46 238 48 C232 51 226 54 220 56 C214 58 206 58 201 56 C206 50 210 43 210 37 C208 30 206 22 205 14 Z"/>
    <path class="cg-white" d="M188 53 C192 60 200 64 210 62 C206 66 199 68 192 66 C194 64 190 62 191 60 C188 58 189 56 188 53 Z"/>
    <path class="cg-furline" d="M186 30 l3 3 M188 38 l3 3 M190 46 l3 2 M196 22 l2 3"/>
    ${merle ? `<ellipse class="cg-tan" cx="206" cy="21" rx="2.4" ry="1.5"/><ellipse class="cg-tan" cx="196" cy="55" rx="5" ry="2.2" transform="rotate(-15 196 55)"/>` : `<ellipse class="cg-brow" cx="206" cy="21" rx="3" ry="1.8"/>`}
    <path class="cg-eyerim" d="M204 27 C207 23 213 23 216 27 C213 30 207 30 204 27 Z"/>
    <ellipse class="cg-eye" cx="210" cy="26.6" rx="3.4" ry="2.7"/><circle class="cg-glint" cx="211.3" cy="25.6" r="0.95"/>
    <path class="cg-mouth" d="M237 50 C232 54 226 56 220 55"/>
    <path class="cg-tongue" d="M222 55 C222 62 228 64 230 58 C230 56 228 55 226 55 Z"/>
    <ellipse class="cg-nose" cx="238" cy="42.5" rx="4.6" ry="3.6"/><path class="cg-nosehi" d="M236 41 q2 -1.4 4 0"/>
    <path class="cg-whisk" d="M228 48 l12 -2 M228 50 l12 2 M226 52 l10 5"/>
    ${extra}`;
}

/** Standing, side view. */
export function corgi({ coat = "red", tail = "short", catchHtml = "" }: { coat?: "red" | "merle"; tail?: "short" | "long"; catchHtml?: string } = {}) {
  const u = nid(), merle = coat === "merle";
  const B = `${u}B`, L = `${u}L`, W = `${u}W`, F = `${u}F`, H = `${u}H`;
  const blot = (x: number, y: number, r: number) => `<g class="cg-spot"><ellipse cx="${x}" cy="${y}" rx="${(r * 1.3).toFixed(1)}" ry="${(r * 0.8).toFixed(1)}" transform="rotate(${(x * 7) % 50 - 25} ${x} ${y})"/><ellipse cx="${x + r * 0.7}" cy="${y + r * 0.4}" rx="${(r * 0.8).toFixed(1)}" ry="${(r * 0.6).toFixed(1)}"/></g>`;
  const spots = merle ? [[66, 50, 6], [82, 44, 4], [98, 42, 5], [116, 46, 7], [134, 44, 4], [146, 56, 5], [74, 64, 5], [92, 58, 3], [108, 62, 6], [128, 64, 4], [62, 76, 4], [86, 78, 3], [118, 80, 4], [140, 74, 3], [100, 50, 2.5], [56, 62, 3]].map(([x, y, r]) => blot(x, y, r)).join("") : "";
  const tailSvg = tail === "long"
    ? `<path class="cg-tail cg-coatf" fill="url(#${B})" d="M52 62 C34 60 18 70 10 90 C8 98 12 102 18 98 C22 92 30 84 40 80 C46 78 52 74 54 70 Z"/><path class="cg-furline" d="M44 66 C32 70 22 80 16 94 M48 70 C38 74 30 82 24 92"/><path class="cg-white" d="M14 92 C10 98 12 102 18 98 C20 96 20 94 18 92 Z"/>`
    : `<path class="cg-tail cg-coatf" fill="url(#${B})" d="M50 56 C42 52 36 54 36 60 C36 66 44 68 50 66 Z"/><path class="cg-furline" d="M40 58 c2 2 4 3 8 3"/>`;
  return `<g class="cg ${merle ? "cgm" : "cgr"}">
  <defs>
    <linearGradient id="${B}" gradientUnits="userSpaceOnUse" x1="0" y1="34" x2="0" y2="104"><stop offset="0" class="cg-s0"/><stop offset=".55" class="cg-s1"/><stop offset="1" class="cg-s2"/></linearGradient>
    <linearGradient id="${L}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="cg-s1"/><stop offset="1" class="cg-s3"/></linearGradient>
    <linearGradient id="${W}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="cg-w0"/><stop offset="1" class="cg-w1"/></linearGradient>
    ${furFilter(F, n % 7)}
    <radialGradient id="${H}" cx=".4" cy=".35" r=".75"><stop offset="0" class="cg-s0h"/><stop offset=".7" class="cg-s1"/><stop offset="1" class="cg-s2"/></radialGradient>
  </defs>
  <ellipse class="y-shadow" cx="118" cy="122" rx="80" ry="6"/>
  <g filter="url(#${F})">
  <g class="cg-leg cg-leg--b"><path class="cg-far" d="M66 80 C60 92 62 100 66 106 L65 116 C65 120 68 121 74 121 L80 121 C80 118 78 116 77 113 L77 104 C80 96 80 88 78 80 Z"/><path class="cg-far-w" d="M65 110 L65 116 C65 120 68 121 74 121 L80 121 C80 118 78 116 77 113 L77 110 Z"/></g>
  <g class="cg-leg cg-leg--a"><path class="cg-far" d="M150 86 L149 114 C149 119 152 121 157 121 L163 121 C163 118 161 116 160 113 L161 88 Z"/><path class="cg-far-w" d="M149 106 L149 114 C149 119 152 121 157 121 L163 121 C163 118 161 116 160 113 L160 106 Z"/></g>
  ${tailSvg}
  <path class="cg-coatf" fill="url(#${B})" d="M48 64 C46 48 60 38 84 36 C110 34 134 36 150 40 C164 44 172 54 172 66 C172 80 164 90 150 94 C130 98 104 98 84 96 C64 94 50 82 48 64 Z"/>
  ${spots}
  <path class="cg-white" fill="url(#${W})" d="M70 91 C90 99 130 99 150 91 C147 97 140 101 132 102 C128 105 124 102 120 104 C116 102 112 105 108 103 C104 105 100 102 96 104 C92 102 88 104 84 102 C78 100 72 97 70 91 Z"/>
  <path class="cg-white" fill="url(#${W})" d="M51 68 C46 80 49 92 58 99 C62 101 66 100 67 96 C64 94 66 90 62 88 C64 84 58 82 58 78 C54 76 54 72 51 68 Z"/>
  <path class="cg-furline" d="${FURLINES([[66, 44], [74, 41], [82, 39], [90, 38], [98, 37], [106, 37], [114, 37], [122, 38], [130, 39], [138, 41], [146, 43], [70, 54], [84, 50], [98, 48], [112, 48], [126, 50], [140, 53], [152, 58], [78, 64], [94, 60], [110, 60], [126, 62], [142, 66], [60, 60], [58, 72]])}"/>
  <path class="cg-rim" d="M58 42 C80 34 120 33 150 39"/><path class="cg-bellyshade" d="M66 88 C90 95 130 95 152 88"/>
  <g class="cg-leg cg-leg--a"><path class="cg-coatf cg-ns" fill="url(#${B})" d="M66 74 C82 72 94 82 92 94 C91 100 86 104 84 108 L84 116 C84 120 88 121 94 121 L100 121 C100 118 98 116 96 114 L96 106 C102 100 103 89 99 81 C94 72 80 68 66 74 Z"/><path class="cg-white" d="M84 106 L84 116 C84 120 88 121 94 121 L100 121 C100 118 98 116 96 114 L96 106 C92 108 88 108 84 106 Z"/><path class="cg-toe" d="M88 119 v-3 M92 119 v-3"/><path class="cg-thighshade" d="M88 86 C92 92 92 98 88 104"/></g>
  <path class="cg-white" fill="url(#${W})" d="M156 50 C168 52 180 62 180 76 C180 88 172 96 160 98 C156 96 158 92 154 90 C158 86 154 82 156 78 C152 74 156 70 152 66 C156 62 152 56 156 50 Z"/>
  <path class="cg-wline" d="M162 64 c4 2 7 5 8 9 M160 74 c4 2 6 5 7 9 M164 84 c3 2 5 4 6 7"/>
  <g class="cg-leg cg-leg--b"><path class="cg-white" d="M156 84 C162 92 163 102 160 110 L160 116 C160 120 164 121 170 121 L176 121 C176 118 174 116 172 114 L172 104 C174 96 172 88 168 82 Z"/><path class="cg-white" d="M160 100 C160 104 160 107 160 110 L160 116 C160 120 164 121 170 121 L176 121 C176 118 174 116 172 114 L172 100 C168 102 164 102 160 100 Z"/><path class="cg-toe" d="M164 119 v-3 M168 119 v-3"/></g>
  <g class="cg-head">
    <path class="cg-coatf" fill="url(#${B})" d="M148 48 C156 36 168 28 182 28 L194 50 C186 60 172 64 158 62 Z"/>
    <path class="cg-white" fill="url(#${W})" d="M160 58 C170 62 184 62 194 54 C192 62 184 70 172 70 C166 68 162 64 160 58 Z"/>
    ${awakeHead(B, H, W, merle, catchHtml)}
  </g>
  </g>
</g>`;
}

/** The standing corgi placed in a scene at (x, y), scaled. */
export const dogAt = (x: number, y: number, s: number, catchHtml = "", opts: { coat?: "red" | "merle"; tail?: "short" | "long" } = {}) =>
  `<g transform="translate(${x} ${y}) scale(${s})">${corgi({ ...opts, catchHtml })}</g>`;

/** Sitting (by the Pup Post mailbox). */
export function sittingCorgi() {
  const u = nid(), B = `${u}B`, H = `${u}H`, W = `${u}W`, F = `${u}F`;
  return `<g class="cg cgr cg-sitting">
  <defs>
    <linearGradient id="${B}" gradientUnits="userSpaceOnUse" x1="0" y1="30" x2="0" y2="120"><stop offset="0" class="cg-s0"/><stop offset=".55" class="cg-s1"/><stop offset="1" class="cg-s2"/></linearGradient>
    <radialGradient id="${H}" cx=".4" cy=".35" r=".75"><stop offset="0" class="cg-s0h"/><stop offset=".7" class="cg-s1"/><stop offset="1" class="cg-s2"/></radialGradient>
    <linearGradient id="${W}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="cg-w0"/><stop offset="1" class="cg-w1"/></linearGradient>
    ${furFilter(F, 5)}
  </defs>
  <ellipse class="y-shadow" cx="88" cy="121" rx="58" ry="5"/>
  <g filter="url(#${F})">
    <path class="cg-coatf cg-tail" fill="url(#${B})" d="M42 108 C32 104 26 108 28 114 C30 120 38 120 44 116 Z"/>
    <path class="cg-far" d="M122 92 L121 116 C121 120 124 121 128 121 L134 121 C134 118 132 116 131 113 L132 94 Z"/>
    <path class="cg-coatf" fill="url(#${B})" d="M48 100 C46 76 60 56 84 46 C100 39 116 38 128 44 C140 52 140 74 132 92 C124 108 104 118 82 119 C62 119 50 112 48 100 Z"/>
    <path class="cg-furline" d="${FURLINES([[70, 58], [82, 52], [94, 47], [106, 44], [118, 44], [64, 72], [78, 66], [92, 62], [106, 60], [60, 86], [74, 82], [90, 78], [104, 76], [118, 74], [66, 98], [82, 96], [98, 94]])}"/>
    <path class="cg-rim" d="M66 56 C84 44 106 38 124 42"/>
    <path class="cg-coatf cg-ns" fill="url(#${B})" d="M40 110 C34 92 44 74 64 72 C82 70 96 82 96 98 C96 112 86 120 72 120 L52 120 C44 120 41 116 40 110 Z"/>
    <path class="cg-thighshade" d="M90 88 C95 96 95 104 90 112"/>
    <path class="cg-white" fill="url(#${W})" d="M42 108 C40 116 46 121 56 121 L66 121 C64 116 58 114 52 110 Z"/>
    <path class="cg-white" fill="url(#${W})" d="M64 120 C62 114 70 112 82 113 C90 114 94 118 90 121 L68 121 Z"/>
    <path class="cg-toe" d="M80 119 v-2.5 M84 119 v-2.5"/>
    <path class="cg-white" fill="url(#${W})" d="M116 40 C132 44 142 60 140 80 C138 96 128 106 116 108 C120 100 116 96 120 92 C116 88 120 82 116 78 C120 72 116 66 118 60 C114 54 118 48 116 40 Z"/>
    <path class="cg-wline" d="M124 56 c4 2 7 6 7 10 M122 70 c4 2 6 6 6 10 M124 84 c3 2 5 5 5 8"/>
    <path class="cg-white" d="M110 92 C112 100 112 108 111 114 L111 117 C111 120 114 121 119 121 L125 121 C125 118 123 116 122 114 L122 92 Z"/>
    <path class="cg-toe" d="M115 119 v-2.5 M119 119 v-2.5"/>
    <path class="cg-coatf" fill="url(#${H})" d="M106 46 C110 34 120 26 132 24 L144 42 C136 50 124 52 112 50 Z"/>
    <g transform="translate(-56 -16)">${awakeHead(B, H, W, false)}</g>
  </g>
</g>`;
}

/** Curled up asleep. */
export function sleepingCorgi() {
  const u = nid(), B = `${u}B`, H = `${u}H`, W = `${u}W`, F = `${u}F`;
  return `<g class="cg cgr cg-sleeping">
  <defs>
    <linearGradient id="${B}" gradientUnits="userSpaceOnUse" x1="0" y1="40" x2="0" y2="104"><stop offset="0" class="cg-s0"/><stop offset=".55" class="cg-s1"/><stop offset="1" class="cg-s2"/></linearGradient>
    <radialGradient id="${H}" cx=".45" cy=".35" r=".8"><stop offset="0" class="cg-s0h"/><stop offset=".7" class="cg-s1"/><stop offset="1" class="cg-s2"/></radialGradient>
    <linearGradient id="${W}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="cg-w0"/><stop offset="1" class="cg-w1"/></linearGradient>
    ${furFilter(F, 4)}
  </defs>
  <g filter="url(#${F})">
    <g class="sk-breathe">
      <path class="cg-coatf cg-tail" fill="url(#${B})" d="M42 78 C32 74 26 78 28 84 C30 90 38 90 44 86 Z"/>
      <path class="cg-coatf" fill="url(#${B})" d="M40 92 C34 68 56 48 98 46 C142 44 178 50 192 66 C200 76 198 92 188 98 L56 100 C46 100 41 97 40 92 Z"/>
      <path class="cg-furline" d="${FURLINES([[60, 58], [74, 52], [88, 49], [102, 48], [116, 48], [130, 49], [144, 51], [158, 55], [170, 60], [66, 70], [84, 64], [100, 62], [118, 62], [136, 64], [152, 68], [78, 80], [98, 76], [120, 76], [140, 80]])}"/>
      <path class="cg-rim" d="M58 52 C84 44 130 43 168 52"/>
      <path class="cg-coatf cg-ns" fill="url(#${B})" d="M48 74 C60 62 86 62 96 76 C102 86 98 98 86 100 L54 100 C44 98 42 86 48 74 Z"/>
      <path class="cg-thighshade" d="M92 80 C96 86 96 92 92 98"/>
      <path class="cg-white" fill="url(#${W})" d="M48 92 C46 98 52 102 62 102 L80 102 C84 100 82 96 78 96 C70 96 60 96 54 92 Z"/>
      <path class="cg-white" fill="url(#${W})" d="M100 98 C124 104 160 104 186 96 C182 102 172 104 160 104 L112 104 C106 104 102 102 100 98 Z"/>
    </g>
    <path class="cg-white" fill="url(#${W})" d="M176 90 L238 92 C244 92 246 98 240 100 L178 102 C172 100 172 92 176 90 Z"/>
    <path class="cg-white" fill="url(#${W})" d="M180 84 L232 86 C238 86 240 92 234 93 L182 95 C176 93 176 86 180 84 Z"/>
    <path class="cg-toe" d="M236 95 v3 M232 95 v3 M229 88 v3 M225 88 v3"/>
    <path class="cg-white" fill="url(#${W})" d="M172 60 C184 62 194 72 194 84 C186 90 178 90 170 86 C174 78 174 68 172 60 Z"/>
    <g class="sz-head">
      <path class="cg-coatf cg-ear-far" fill="url(#${B})" d="M188 56 C182 46 178 38 172 30 C182 30 192 38 198 48 Z"/>
      <path class="cg-coatf" fill="url(#${B})" d="M200 48 C200 36 204 26 210 18 C218 26 222 36 220 48 Z"/>
      <path class="cg-ear-in" d="M204 46 C205 36 207 30 210 25 C214 31 216 38 215 46 Z"/>
      <path class="cg-coatf" fill="url(#${H})" d="M184 72 C182 56 194 44 212 46 C224 48 232 56 236 64 L248 74 C253 79 250 86 243 86 L226 88 C214 92 198 90 190 82 C186 79 184 76 184 72 Z"/>
      <path class="cg-white" fill="url(#${W})" d="M213 47 C214 54 216 60 220 64 C228 68 240 72 248 76 C251 80 249 85 243 86 L226 88 C216 91 206 90 200 86 C208 80 214 72 214 64 C213 58 212 52 213 47 Z"/>
      <path class="cg-brow" d="M210 56 a3 2 0 1 0 0.1 0"/>
      <path class="sz-lid" d="M214 64 C217 67 222 67 225 64"/><path class="sz-lash" d="M216 66 l-1 2 M219 67 l0 2 M222 66 l1 2"/>
      <ellipse class="cg-nose" cx="248" cy="77" rx="4.4" ry="3.4"/><path class="cg-nosehi" d="M246 75.5 q2 -1.2 4 0"/>
      <path class="cg-mouth" d="M246 82 C240 85 234 86 228 86"/>
      <path class="cg-whisk" d="M236 80 l12 -2 M236 82 l12 2"/>
    </g>
  </g>
</g>`;
}

/** A whole <svg> for one pose (Corgi.astro uses this). label "" = decorative. */
export function corgiSvg(pose: CorgiPose, { coat = "red", tail = "short", label = "", cls = "" }: { coat?: "red" | "merle"; tail?: "short" | "long"; label?: string; cls?: string } = {}) {
  const inner = pose === "sitting" ? sittingCorgi() : pose === "sleeping" ? sleepingCorgi() : corgi({ coat, tail });
  const a11y = label ? `role="img" aria-label="${label.replace(/"/g, "&quot;")}"` : `aria-hidden="true"`;
  return `<svg class="bc-corgi${cls ? ` ${cls}` : ""}" viewBox="${CORGI_VIEWBOX[pose]}" ${a11y} focusable="false">${inner}</svg>`;
}
