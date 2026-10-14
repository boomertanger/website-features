// Hotline Boom art (docs/specs/hotline-boom.md §9; mockups docs/design/mockups/hotline-boom-contact.html W5 and hotline-boom-hero.html). Every SVG builder gives
// its gradients unique ids, so several copies on one page never share (or steal) a gradient. Colours come from styles/hotline.css (classes on the stops).
//   hbIcon()       the W5 Dial-up wordmark icon, 40x40 (the wheel dials to the finger stop on power-on)
//   HB_ICON        one copy for Astro components (the bar); scripts call hbIcon() for more
//   phoneScene()   the /contact hero: the classic rotary desk phone in the V2 Bakelite look (hotline-boom-hero.html), ring marks and arcs
//   I, icon(k)     line and UI icons (24x24 strokes)
//   dialSvg(lines), HOLE_A, DIAL_STOP   /contact/how-it-works hero H1: the big rotary dial (six holes, the plate, the finger stop)
//   SCENES         /contact/how-it-works chapter 1: a small scene per line
let n = 0;
const uid = (p: string) => `${p}${++n}${Math.random().toString(36).slice(2, 6)}`;

export function hbIcon(): string {
  const u = uid("hbi");
  return `<svg class="hb-wmi hb-wmi--w5" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
  <defs><linearGradient id="${u}d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="s-hand1"/><stop offset="1" class="s-hand2"/></linearGradient></defs>
  <ellipse cx="20" cy="38" rx="12" ry="1.5" class="shadow"/>
  <circle class="base" cx="20" cy="20" r="17.4"/>
  <g class="disc"><circle class="ring" fill="url(#${u}d)" cx="20" cy="20" r="15.4"/><path class="shine" d="M9.2 12.4 A12.8 12.8 0 0 1 20 6.6"/><g class="holes"><circle cx="17.99" cy="8.58" r="2.25"/><circle cx="23.97" cy="9.10" r="2.25"/><circle cx="28.89" cy="12.54" r="2.25"/><circle cx="31.42" cy="17.99" r="2.25"/><circle cx="30.90" cy="23.97" r="2.25"/><circle cx="27.46" cy="28.89" r="2.25"/><circle cx="22.01" cy="31.42" r="2.25"/><circle cx="16.03" cy="30.90" r="2.25"/><circle cx="11.11" cy="27.46" r="2.25"/><circle cx="8.58" cy="22.01" r="2.25"/></g></g>
  <circle class="plate" cx="20" cy="20" r="6.6"/>
  <path class="glyph" d="M13.6 22.8 C13.6 20.9 14.4 19.9 15.9 19.8 L16.7 19.8 C17.2 18.8 18.2 18.3 20 18.3 C21.8 18.3 22.8 18.8 23.3 19.8 L24.1 19.8 C25.6 19.9 26.4 20.9 26.4 22.8 C26.4 23.4 26.1 23.7 25.5 23.7 H23.8 C23.3 23.7 23 23.4 23 22.9 V21.7 C23 21.1 22.5 20.8 21.7 20.8 H18.3 C17.5 20.8 17 21.1 17 21.7 V22.9 C17 23.4 16.7 23.7 16.2 23.7 H14.5 C13.9 23.7 13.6 23.4 13.6 22.8Z"/>
  <path class="stop" d="M33.6 27.4 L36.6 30.2"/>
</svg>`;
}
export const HB_ICON = hbIcon();

// the two-tone coiled cord down the phone's left side, from the approved hero mockup (hotline-boom-hero.html heroScene()), kept as drawn
const CORD = "M50.0 108.0 L49.7 108.9 L49.2 109.9 L48.6 110.8 L47.9 111.6 L47.0 112.3 L46.0 113.0 L44.9 113.6 L43.8 114.0 L42.6 114.4 L41.4 114.6 L40.2 114.7 L39.1 114.6 L38.0 114.5 L37.0 114.3 L36.2 113.9 L35.4 113.5 L34.8 113.1 L34.3 112.6 L34.1 112.0 L33.9 111.5 L34.0 111.0 L34.1 110.5 L34.5 110.1 L34.9 109.8 L35.5 109.5 L36.2 109.3 L36.9 109.3 L37.7 109.4 L38.5 109.6 L39.3 109.9 L40.1 110.3 L40.8 110.8 L41.4 111.5 L41.9 112.2 L42.3 113.0 L42.5 113.9 L42.6 114.8 L42.5 115.8 L42.3 116.7 L41.9 117.7 L41.4 118.5 L40.7 119.4 L39.9 120.2 L39.0 120.8 L38.0 121.4 L36.9 121.9 L35.7 122.2 L34.6 122.5 L33.5 122.6 L32.4 122.6 L31.3 122.5 L30.4 122.2 L29.5 121.9 L28.8 121.5 L28.2 121.1 L27.7 120.6 L27.5 120.0 L27.4 119.5 L27.4 119.0 L27.6 118.5 L28.0 118.1 L28.5 117.7 L29.1 117.4 L29.8 117.2 L30.5 117.2 L31.4 117.2 L32.2 117.4 L33.0 117.7 L33.9 118.1 L34.6 118.6 L35.3 119.2 L35.9 119.9 L36.3 120.7 L36.6 121.6 L36.8 122.5 L36.8 123.5 L36.7 124.4 L36.4 125.3 L35.9 126.2 L35.3 127.1 L34.5 127.9 L33.7 128.6 L32.7 129.2 L31.7 129.6 L30.6 130.0 L29.5 130.3 L28.4 130.4 L27.4 130.4 L26.3 130.3 L25.4 130.1 L24.6 129.8 L23.9 129.4 L23.3 129.0 L22.9 128.5 L22.6 127.9 L22.5 127.4 L22.6 126.9 L22.8 126.4 L23.2 125.9 L23.7 125.6 L24.3 125.3 L25.1 125.1 L25.9 125.0 L26.7 125.0 L27.6 125.1 L28.5 125.4 L29.4 125.8 L30.2 126.3 L30.9 126.9 L31.6 127.6 L32.1 128.4 L32.5 129.2 L32.7 130.1 L32.8 131.0 L32.7 132.0 L32.5 132.9 L32.1 133.8 L31.6 134.7 L30.9 135.5 L30.1 136.2 L29.2 136.8 L28.2 137.3 L27.2 137.7 L26.2 138.0 L25.1 138.1 L24.1 138.1 L23.1 138.1 L22.2 137.9 L21.4 137.6 L20.7 137.2 L20.2 136.8 L19.8 136.3 L19.5 135.7 L19.4 135.2 L19.5 134.7 L19.8 134.2 L20.2 133.7 L20.7 133.3 L21.4 133.0 L22.1 132.8 L23.0 132.7 L23.9 132.7 L24.8 132.8 L25.7 133.0 L26.6 133.4 L27.5 133.8 L28.3 134.4 L29.0 135.1 L29.6 135.9 L30.1 136.7 L30.4 137.6 L30.5 138.5 L30.5 139.5 L30.4 140.4 L30.1 141.3 L29.6 142.2 L29.0 143.0 L28.3 143.7 L27.4 144.3 L26.5 144.8 L25.6 145.3 L24.6 145.5 L23.5 145.7 L22.6 145.8 L21.6 145.7 L20.7 145.5 L20.0 145.2 L19.3 144.9 L18.8 144.5 L18.4 144.0 L18.2 143.4 L18.1 142.9 L18.2 142.4 L18.5 141.8 L18.9 141.4 L19.4 141.0 L20.1 140.6 L20.9 140.4 L21.8 140.3 L22.7 140.2 L23.7 140.3 L24.7 140.5 L25.6 140.9 L26.6 141.3 L27.4 141.9 L28.2 142.5 L28.9 143.3 L29.4 144.1 L29.8 145.0 L30.0 145.9 L30.1 146.8 L30.0 147.8 L29.8 148.7 L29.4 149.6 L28.8 150.4 L28.2 151.1 L27.4 151.7 L26.5 152.3 L25.6 152.7 L24.7 153.0 L23.7 153.2 L22.8 153.3 L21.9 153.2 L21.0 153.1 L20.3 152.8 L19.6 152.5 L19.1 152.0 L18.8 151.6 L18.5 151.0 L18.5 150.5 L18.6 150.0 L18.9 149.4 L19.3 149.0 L19.9 148.5 L20.6 148.2 L21.4 147.9 L22.3 147.8 L23.3 147.7 L24.3 147.8 L25.3 148.0 L26.4 148.3 L27.3 148.7 L28.3 149.2 L29.1 149.9 L29.8 150.6 L30.4 151.4 L30.9 152.3 L31.2 153.2 L31.3 154.1 L31.3 155.1 L31.2 156.0 L30.8 156.9 L30.4 157.7 L29.8 158.4 L29.1 159.1 L28.3 159.6 L27.4 160.1 L26.5 160.4 L25.6 160.6 L24.7 160.7 L23.8 160.7 L23.0 160.5 L22.3 160.3 L21.7 160.0 L21.2 159.5 L20.9 159.1 L20.7 158.5 L20.6 158.0 L20.8 157.5 L21.1 156.9 L21.5 156.4 L22.1 156.0 L22.8 155.6 L23.7 155.3 L24.6 155.2 L25.6 155.1 L26.7 155.1 L27.8 155.3 L28.8 155.6 L29.9 156.0 L30.8 156.5 L31.7 157.1 L32.5 157.8 L33.2 158.6 L33.7 159.5 L34.1 160.4 L34.3 161.3 L34.4 162.2 L34.3 163.2 L34.1 164.0 L33.7 164.9 L33.2 165.6 L32.5 166.3 L31.8 166.9 L31.0 167.3 L30.1 167.7 L29.3 167.9 L28.4 168.0 L27.6 168.0 L26.8 167.9 L26.1 167.7 L25.5 167.3 L25.0 166.9 L24.7 166.5 L24.5 166.0 L24.5 165.4 L24.7 164.9 L25.0 164.3 L25.4 163.8 L26.1 163.4 L26.8 163.0 L27.7 162.7 L28.6 162.5 L29.7 162.4 L30.8 162.4 L31.9 162.5 L33.0 162.8 L34.1 163.2 L35.1 163.7 L36.1 164.3 L37.0 165.0 L37.7 165.8 L38.3 166.6 L38.8 167.5 L39.1 168.4 L39.2 169.3 L39.2 170.3 L39.0 171.1 L38.7 172.0 L38.2 172.7 L37.7 173.4 L37.0 174.0 L36.2 174.5 L35.4 174.9 L34.6 175.1 L33.8 175.3 L33.0 175.3 L32.3 175.2 L31.6 174.9 L31.0 174.6 L30.6 174.2 L30.3 173.8 L30.1 173.3 L30.1 172.7 L30.3 172.2 L30.6 171.6 L31.1 171.1 L31.7 170.6 L32.5 170.2 L33.4 169.9 L34.4 169.7 L35.5 169.6 L36.6 169.6 L37.8 169.7 L39.0 169.9 L40.1 170.3 L41.2 170.8 L42.2 171.3 L43.1 172.0 L43.9 172.8 L44.6 173.6 L45.2 174.5 L45.5 175.4 L45.7 176.3 L45.8 177.2 L45.7 178.1 L45.4 179.0 L45.1 179.8 L44.6 180.5 L43.9 181.1 L43.3 181.6 L42.5 182.0 L41.7 182.2 L41.0 182.4 L40.2 182.4 L39.5 182.3 L38.9 182.1 L38.3 181.8 L37.9 181.4 L37.6 181.0 L37.5 180.5 L37.5 179.9 L37.7 179.4 L38.0 178.8 L38.5 178.3 L39.2 177.8 L40.0 177.4 L40.9 177.1 L41.9 176.8 L43.0 176.7 L44.2 176.7 L45.4 176.7 L46.6 177.0 L47.8 177.3 L49.0 177.7 L50.0 178.3 L51.0 179.0 L51.9 179.7 L52.7 180.5 L53.3 181.4 L53.7 182.3 L54.0 183.2 L54.1 184.1 L54.1 185.0 L53.9 185.9 L53.6 186.7 L53.2 187.4 L52.6 188.0 L52.0 188.5 L51.3 188.9 L50.6 189.2 L49.8 189.4 L49.1 189.4 L48.5 189.4 L47.9 189.2 L47.3 188.9 L46.9 188.5 L46.7 188.1 L46.6 187.6 L46.6 187.0 L46.8 186.5 L47.1 185.9 L47.7 185.4 L48.3 184.9 L49.2 184.5 L50.1 184.1 L51.2 183.8 L52.3 183.7 L53.5 183.6 L54.8 183.7 L56.0 183.9 L57.3 184.2 L58.5 184.6 L59.6 185.2 L60.7 185.8 L61.6 186.5 L62.4 187.3 L63.1 188.2 L63.6 189.1 L64.0 190.0";

/** The /contact hero scene (300x220), the approved classic rotary desk phone in the V2 "Bakelite" look (hotline-boom-hero.html): a bell-shaped
 *  body on a wide plinth with two feet, two cradle posts, a long handset with domed ends and cup rims, a two-tone coiled cord down the left,
 *  body and post highlights, a shadow under the handset; black glossy Bakelite with gold edges, the gold ring marks and purple arcs. The dial
 *  (purple ring, holes, gold plate, handset glyph, finger stop) is unchanged. Wrapped by the page in a <button class="hb-stage" aria-pressed>. */
export function phoneScene(): string {
  const u = uid("hbs");
  return `<svg class="hb-scene" viewBox="0 0 300 220" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="${u}g" cx="50%" cy="55%" r="50%"><stop offset="0" class="g-glow0"/><stop offset="1" class="g-glow1"/></radialGradient>
    <linearGradient id="${u}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="g-body0"/><stop offset="1" class="g-body1"/></linearGradient>
    <linearGradient id="${u}p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="g-plinth0"/><stop offset=".7" class="g-body1"/><stop offset="1" class="g-plinth2"/></linearGradient>
    <linearGradient id="${u}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="g-hand0"/><stop offset="1" class="g-hand1"/></linearGradient>
    <linearGradient id="${u}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="g-ring0"/><stop offset="1" class="g-ring1"/></linearGradient>
  </defs>
  <ellipse class="glow" fill="url(#${u}g)" cx="150" cy="128" rx="150" ry="100"/>
  <ellipse class="floor" cx="150" cy="214" rx="104" ry="6"/>
  <rect class="foot" x="76" y="202" width="32" height="9" rx="3"/><rect class="foot" x="192" y="202" width="32" height="9" rx="3"/>
  <rect class="plinth" fill="url(#${u}p)" x="54" y="176" width="192" height="28" rx="9"/>
  <path class="plinth-hi" d="M66 182.5 H234"/>
  <path class="cord-shadow" d="${CORD}" transform="translate(1.6 1.6)"/>
  <path class="cord" d="${CORD}"/>
  <path class="body" fill="url(#${u}b)" d="M80 180 C84 146 96 116 112 106 H188 C204 116 216 146 220 180 Z"/>
  <path class="body-hi" d="M92 172 C95 148 104 126 116 114"/>
  <path class="body-lo" d="M210 172 C207 150 199 130 188 117"/>
  <path class="post" fill="url(#${u}b)" d="M108 110 L112 66 Q112.5 61 117 61 H124 Q128.5 61 128.5 66 L127 110 Z"/>
  <path class="post" fill="url(#${u}b)" d="M192 110 L188 66 Q187.5 61 183 61 H176 Q171.5 61 171.5 66 L173 110 Z"/>
  <path class="post-hi" d="M114.5 68 L111.5 104 M178 68 L176 104"/>
  <ellipse class="hs-shadow" cx="150" cy="70" rx="66" ry="5"/>
  <circle class="bezel" cx="150" cy="150" r="36"/>
  <circle class="ring" fill="url(#${u}r)" cx="150" cy="150" r="31"/>
  <path class="ring-shine" d="M127 133 A28 28 0 0 1 148 122"/>
  <g class="holes"><circle cx="146.18" cy="128.33" r="4.3"/><circle cx="157.52" cy="129.33" r="4.3"/><circle cx="166.85" cy="135.86" r="4.3"/><circle cx="171.67" cy="146.18" r="4.3"/><circle cx="170.67" cy="157.52" r="4.3"/><circle cx="164.14" cy="166.85" r="4.3"/><circle cx="153.82" cy="171.67" r="4.3"/><circle cx="142.48" cy="170.67" r="4.3"/><circle cx="133.15" cy="164.14" r="4.3"/><circle cx="128.33" cy="153.82" r="4.3"/></g>
  <circle class="plate" cx="150" cy="150" r="11"/>
  <path class="glyph" d="M143.6 152.8 C143.6 150.9 144.4 149.9 145.9 149.8 L146.7 149.8 C147.2 148.8 148.2 148.3 150 148.3 C151.8 148.3 152.8 148.8 153.3 149.8 L154.1 149.8 C155.6 149.9 156.4 150.9 156.4 152.8 C156.4 153.4 156.1 153.7 155.5 153.7 H153.8 C153.3 153.7 153 153.4 153 152.9 V151.7 C153 151.1 152.5 150.8 151.7 150.8 H148.3 C147.5 150.8 147 151.1 147 151.7 V152.9 C147 153.4 146.7 153.7 146.2 153.7 H144.5 C143.9 153.7 143.6 153.4 143.6 152.8Z"/>
  <path class="stop" d="M171.5 173.5 L176.5 179"/>
  <g class="handset">
    <path class="hs" stroke="url(#${u}h)" d="M62 72 C102 44 198 44 238 72"/>
    <path class="cup" fill="url(#${u}h)" d="M24 98 C24 76 38 64 60 64 C82 64 96 76 96 98 C96 105 82 109 60 109 C38 109 24 105 24 98Z"/>
    <path class="cup" fill="url(#${u}h)" d="M204 98 C204 76 218 64 240 64 C262 64 276 76 276 98 C276 105 262 109 240 109 C218 109 204 105 204 98Z"/>
    <ellipse class="cup-rim" cx="60" cy="102" rx="34" ry="6.5"/><ellipse class="cup-rim" cx="240" cy="102" rx="34" ry="6.5"/>
    <path class="hs-gloss" d="M98 57 C128 47 172 47 202 57"/>
    <path class="cup-gloss" d="M36 86 Q41 73 57 70 M216 86 Q221 73 237 70"/>
  </g>
  <g class="rings"><path d="M30 40 L20 31"/><path d="M150 34 V21"/><path d="M270 40 L280 31"/></g>
  <g class="arcs"><path d="M12 58 q-9 16 0 32"/><path d="M288 58 q9 16 0 32"/></g>
</svg>`;
}

export const I: Record<string, string> = {
  hi: '<path d="M12 20s-7-4.4-9-9a4.6 4.6 0 0 1 9-3 4.6 4.6 0 0 1 9 3c-2 4.6-9 9-9 9z"/>',
  feedback: '<path d="M4 5h16v11H10l-6 4z"/><path d="M8 9h8M8 12h5"/>',
  help: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6"/>',
  business: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 12h18"/>',
  private: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  report: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M12 8v5M12 16v.5"/>',
  team: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6"/>',
  bug: '<path d="M8 9h8v6a4 4 0 0 1-8 0zM9.5 9a2.5 2.5 0 0 1 5 0M4 13h4M16 13h4M5 8l3 2M19 8l-3 2M5 19l3-2M19 19l-3-2"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  crew: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  line: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  sign: '<path d="M12 3v18M5 6h11l3 3-3 3H5zM19 14H9l-3 3 3 3h10"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  help2: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14M12 17h.01"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  flag: '<path d="M5 21V4h11l-1.5 4L16 12H5"/>',
  pin: '<path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
};
export const icon = (k: string, sw = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${I[k] || ""}</svg>`;

// ---------- /contact/how-it-works (hero H1 "The dial", chapter 1 stage scenes; mockup docs/design/mockups/hotline-boom-how-it-works.html) ----------
/** The six holes' angles (degrees, clockwise from 3 o'clock) and the finger stop's. Dialing turns the disc by STOP - angle. */
export const HOLE_A = [60, 20, -20, -60, -100, -140];
export const DIAL_STOP = 100;
/** The big rotary dial: six holes (data-hole 0-5; gold numbers for the owner lines), the HOTLINE BOOM plate and the finger stop. lines: [number, title, owner?][]. */
export function dialSvg(lines: [number, string, boolean][]): string {
  const u = uid("hbd");
  const holes = lines.map(([n, t, own], i) => {
    const a = (HOLE_A[i] * Math.PI) / 180, x = (170 + 112 * Math.cos(a)).toFixed(1), y = (170 + 112 * Math.sin(a)).toFixed(1);
    return `<g class="hole${own ? " is-owner" : ""}" tabindex="0" role="button" data-hole="${i}" aria-label="Dial ${n}: ${t}${own ? ", only Boomertanger reads it" : ""}"><circle cx="${x}" cy="${y}" r="27"/><text x="${x}" y="${y}" aria-hidden="true">${n}</text></g>`;
  }).join("");
  const r = (DIAL_STOP * Math.PI) / 180;
  const p = (d: number) => [(170 + d * Math.cos(r)).toFixed(1), (170 + d * Math.sin(r)).toFixed(1)];
  const [sx, sy] = p(156), [sx2, sy2] = p(134);
  return `<svg class="hb-hw-dial" viewBox="0 0 340 340" role="group" aria-label="A rotary dial with the six lines">
  <defs>
    <radialGradient id="${u}g" cx="50%" cy="50%" r="50%"><stop offset="0" class="g-glow0"/><stop offset="1" class="g-glow1"/></radialGradient>
    <linearGradient id="${u}d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="g-hand0"/><stop offset="1" class="g-ring1"/></linearGradient>
  </defs>
  <circle class="glow" fill="url(#${u}g)" cx="170" cy="170" r="170"/><circle class="base" cx="170" cy="170" r="160"/>
  <g class="disc" data-disc><circle class="ring" fill="url(#${u}d)" cx="170" cy="170" r="148"/><path class="shine" d="M58 120 A120 120 0 0 1 150 52"/>${holes}</g>
  <circle class="plate" cx="170" cy="170" r="62"/><text class="plate-t" x="170" y="160">HOTLINE</text><text class="plate-t" x="170" y="178">BOOM</text><text class="plate-b" x="170" y="198">DIAL A LINE</text>
  <line class="stop" x1="${sx2}" y1="${sy2}" x2="${sx}" y2="${sy}"/>
</svg>`;
}
/** Chapter 1's small scenes (64x64), one per line; .mv / .fx / .lid / .shackle / .dot move on hover (styles/hotline.css). */
export const SCENES: Record<string, string> = {
  hi: '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><g class="mv"><path class="ink" d="M32 50s-16-10-20-20a10 10 0 0 1 20-7 10 10 0 0 1 20 7c-4 10-20 20-20 20z"/></g><g class="fx"><path class="ink" d="M8 14l3 3M56 14l-3 3M32 6v4"/></g></svg>',
  feedback: '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path class="ink" d="M10 12h44v28H26l-12 10v-10h-4z"/><circle class="dot" cx="22" cy="26" r="2.6"/><circle class="dot" cx="32" cy="26" r="2.6"/><circle class="dot" cx="42" cy="26" r="2.6"/></svg>',
  help: '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><g class="mv"><circle class="ink" cx="32" cy="32" r="22"/><circle class="ink" cx="32" cy="32" r="10"/><path class="ink" d="M16.5 16.5l8.4 8.4M39.1 39.1l8.4 8.4M47.5 16.5l-8.4 8.4M24.9 39.1l-8.4 8.4"/></g></svg>',
  business: '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect class="ink" x="8" y="22" width="48" height="30" rx="4"/><path class="ink" d="M8 34h48"/><g class="lid"><path class="ink" d="M24 22v-6h16v6"/></g><g class="fx"><path class="ink" d="M28 40h8"/><path class="ink" d="M44 10l2-4M50 14l4-2"/></g></svg>',
  private: '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect class="ink" x="16" y="28" width="32" height="24" rx="4"/><g class="shackle"><path class="ink" d="M22 28v-8a10 10 0 0 1 20 0v8"/></g><circle class="key-dot" cx="32" cy="40" r="3"/><g class="fx"><path class="ink" d="M10 22l4 2M54 22l-4 2"/></g></svg>',
  report: '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><g class="mv"><path class="ink" d="M32 8l20 7v15c0 12-8.5 20-20 24-11.5-4-20-12-20-24V15z"/><path class="ink" d="M32 22v12M32 41v1"/></g></svg>',
};
