// Hotline Boom art (docs/specs/hotline-boom.md §9; mockups docs/design/mockups/hotline-boom-contact.html W5 and hotline-boom-hero.html). Every SVG builder gives
// its gradients unique ids, so several copies on one page never share (or steal) a gradient. Colours come from styles/hotline.css (classes on the stops).
//   hbIcon()       the W5 Dial-up wordmark icon, 40x40 (the wheel dials to the finger stop on power-on)
//   HB_ICON        one copy for Astro components (the bar); scripts call hbIcon() for more
//   phoneScene()   the /contact hero: the desk phone (two-tone body, gold rim, glossy purple handset, the W5-style dial), ring marks and arcs
//   I, icon(k)     line and UI icons (24x24 strokes)
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

// the coiled cord from the approved hero mockup (hotline-boom-hero.html), kept as drawn
const CORD = "M228.0 180.0 L228.2 180.6 L228.3 181.2 L228.3 181.7 L228.2 182.2 L227.9 182.7 L227.5 183.1 L227.1 183.4 L226.6 183.6 L226.0 183.7 L225.4 183.7 L224.8 183.6 L224.2 183.4 L223.7 183.2 L223.1 182.8 L222.7 182.3 L222.3 181.8 L222.0 181.2 L221.9 180.5 L221.8 179.8 L221.9 179.0 L222.1 178.3 L222.4 177.5 L222.9 176.8 L223.5 176.1 L224.2 175.4 L225.1 174.8 L226.0 174.2 L227.0 173.8 L228.1 173.4 L229.2 173.1 L230.3 172.9 L231.5 172.8 L232.7 172.8 L233.8 172.9 L234.8 173.1 L235.8 173.4 L236.7 173.8 L237.6 174.2 L238.3 174.7 L238.8 175.2 L239.3 175.8 L239.6 176.4 L239.8 176.9 L239.8 177.5 L239.7 178.0 L239.5 178.5 L239.2 178.9 L238.8 179.3 L238.3 179.6 L237.7 179.8 L237.1 179.9 L236.5 179.9 L235.8 179.7 L235.1 179.5 L234.5 179.2 L233.9 178.8 L233.4 178.4 L233.0 177.8 L232.7 177.2 L232.4 176.5 L232.3 175.8 L232.3 175.0 L232.5 174.2 L232.8 173.4 L233.2 172.7 L233.7 171.9 L234.4 171.2 L235.2 170.6 L236.0 170.0 L237.0 169.5 L238.0 169.1 L239.1 168.8 L240.2 168.6 L241.3 168.5 L242.4 168.5 L243.4 168.6 L244.4 168.8 L245.4 169.0 L246.2 169.4 L247.0 169.8 L247.6 170.2 L248.1 170.7 L248.5 171.3 L248.8 171.8 L248.9 172.4 L248.9 172.9 L248.8 173.4 L248.5 173.9 L248.1 174.3 L247.7 174.6 L247.1 174.9 L246.5 175.1 L245.8 175.1 L245.1 175.1 L244.4 175.0 L243.7 174.8 L243.0 174.5 L242.3 174.0 L241.8 173.5 L241.3 172.9 L240.9 172.3 L240.6 171.6 L240.4 170.8 L240.4 170.0 L240.5 169.2 L240.7 168.5 L241.1 167.7 L241.6 166.9 L242.2 166.2 L242.9 165.5 L243.7 165.0 L244.6 164.4 L245.6 164.0 L246.6 163.7 L247.6 163.5 L248.6 163.3 L249.7 163.3 L250.7 163.3 L251.6 163.5 L252.5 163.7 L253.3 164.1 L254.0 164.5 L254.6 164.9 L255.1 165.4 L255.4 165.9 L255.6 166.4 L255.7 167.0 L255.6 167.5 L255.4 168.0 L255.1 168.4 L254.6 168.8 L254.1 169.1 L253.5 169.4 L252.8 169.5 L252.1 169.6 L251.3 169.5 L250.5 169.4 L249.8 169.1 L249.0 168.8 L248.3 168.3 L247.7 167.8 L247.2 167.2 L246.7 166.5 L246.4 165.8 L246.2 165.0 L246.1 164.2 L246.1 163.4 L246.3 162.6 L246.6 161.8 L247.0 161.0 L247.6 160.3 L248.2 159.6 L249.0 159.0 L249.8 158.5 L250.7 158.0 L251.7 157.7 L252.6 157.4 L253.6 157.2 L254.6 157.2 L255.5 157.2 L256.4 157.4 L257.3 157.6 L258.0 157.9 L258.6 158.3 L259.2 158.7 L259.6 159.2 L259.9 159.6 L260.0 160.2 L260.0 160.7 L259.9 161.2 L259.6 161.6 L259.3 162.1 L258.8 162.4 L258.2 162.7 L257.5 162.9 L256.8 163.1 L256.0 163.1 L255.1 163.0 L254.3 162.9 L253.5 162.6 L252.7 162.2 L251.9 161.8 L251.2 161.2 L250.6 160.6 L250.1 159.9 L249.7 159.2 L249.5 158.4 L249.3 157.5 L249.3 156.7 L249.4 155.8 L249.7 155.0 L250.0 154.2 L250.5 153.5 L251.1 152.8 L251.8 152.1 L252.6 151.6 L253.4 151.1 L254.3 150.7 L255.3 150.5 L256.2 150.3 L257.1 150.2 L258.0 150.2 L258.8 150.4 L259.6 150.6 L260.3 150.8 L260.9 151.2 L261.3 151.6 L261.7 152.0 L261.9 152.5 L262.0 153.0 L262.0 153.5 L261.8 154.0 L261.5 154.4 L261.0 154.8 L260.5 155.1 L259.8 155.4 L259.1 155.6 L258.3 155.7 L257.5 155.7 L256.6 155.7 L255.7 155.5 L254.8 155.2 L253.9 154.8 L253.1 154.3 L252.4 153.7 L251.7 153.1 L251.2 152.4 L250.7 151.6 L250.4 150.8 L250.2 150.0 L250.1 149.1 L250.2 148.2 L250.3 147.4 L250.7 146.6 L251.1 145.8 L251.6 145.1 L252.3 144.4 L253.0 143.8 L253.8 143.4 L254.6 143.0 L255.5 142.7 L256.4 142.5 L257.2 142.4 L258.1 142.4 L258.8 142.5 L259.5 142.6 L260.2 142.9 L260.7 143.2 L261.1 143.6 L261.4 144.0 L261.6 144.5 L261.6 145.0 L261.5 145.4 L261.3 145.9 L260.9 146.3 L260.4 146.7 L259.8 147.0 L259.1 147.3 L258.3 147.4 L257.4 147.5 L256.5 147.5 L255.6 147.4 L254.7 147.2 L253.7 146.9 L252.8 146.5 L251.9 146.0 L251.1 145.4 L250.4 144.7 L249.8 144.0 L249.3 143.2 L248.9 142.4 L248.6 141.5 L248.5 140.6 L248.5 139.7 L248.6 138.9 L248.9 138.0 L249.3 137.2 L249.8 136.5 L250.3 135.8 L251.0 135.2 L251.7 134.7 L252.5 134.3 L253.3 134.0 L254.1 133.8 L254.9 133.6 L255.7 133.6 L256.4 133.7 L257.1 133.8 L257.7 134.1 L258.1 134.4 L258.5 134.8 L258.7 135.2 L258.8 135.6 L258.8 136.0 L258.6 136.5 L258.3 136.9 L257.9 137.3 L257.4 137.7 L256.7 138.0 L255.9 138.2 L255.1 138.4 L254.2 138.4 L253.2 138.4 L252.2 138.3 L251.2 138.0 L250.2 137.7 L249.3 137.3 L248.3 136.8 L247.5 136.2 L246.7 135.5 L246.0 134.7 L245.5 133.9 L245.0 133.0 L244.7 132.2 L244.5 131.3 L244.4 130.3 L244.5 129.5 L244.7 128.6 L245.0 127.8 L245.5 127.0 L246.0 126.3 L246.6 125.7 L247.3 125.2 L248.0 124.7 L248.7 124.4 L249.5 124.2 L250.3 124.0 L251.0 124.0 L251.6 124.0 L252.2 124.2 L252.7 124.4 L253.2 124.7 L253.5 125.0 L253.6 125.4 L253.7 125.8 L253.6 126.2 L253.4 126.7 L253.0 127.1 L252.5 127.5 L251.9 127.8 L251.2 128.1 L250.4 128.3 L249.5 128.4 L248.5 128.5 L247.5 128.4 L246.5 128.3 L245.4 128.0 L244.3 127.7 L243.3 127.2 L242.3 126.7 L241.4 126.0 L240.6 125.3 L239.9 124.6 L239.2 123.7 L238.7 122.8 L238.3 121.9 L238.1 121.0 L238.0 120.1 L238.0 119.2 L238.1 118.3 L238.4 117.5 L238.8 116.7 L239.2 116.0 L239.8 115.3 L240.4 114.8 L241.1 114.3 L241.8 114.0 L242.5 113.7 L243.2 113.5 L243.8 113.5 L244.4 113.5 L245.0 113.6 L245.4 113.8 L245.8 114.1 L246.0 114.4 L246.1 114.8 L246.1 115.2 L246.0 115.6 L245.7 116.0 L245.3 116.4 L244.8 116.7 L244.1 117.0 L243.3 117.3 L242.5 117.5 L241.5 117.6 L240.5 117.6 L239.4 117.5 L238.3 117.4 L237.2 117.1 L236.1 116.7 L235.0 116.3 L233.9 115.7 L233.0 115.1 L232.1 114.3 L231.3 113.5 L230.6 112.7 L230.0 111.8 L229.6 110.8 L229.3 109.9 L229.1 108.9 L229.1 108.0 L229.2 107.1 L229.4 106.3 L229.7 105.4 L230.1 104.7 L230.6 104.1 L231.2 103.5 L231.8 103.0 L232.4 102.6 L233.0 102.3 L233.7 102.2 L234.3 102.1 L234.8 102.1 L235.3 102.2 L235.7 102.4 L236.0 102.6 L236.2 102.9 L236.3 103.2 L236.2 103.6 L236.0 104.0";

/** The /contact hero scene (300x220). Wrapped by the page in a <button class="hb-stage" aria-pressed>. */
export function phoneScene(): string {
  const u = uid("hbs");
  return `<svg class="hb-scene" viewBox="0 0 300 220" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="${u}g" cx="50%" cy="55%" r="50%"><stop offset="0" class="g-glow0"/><stop offset="1" class="g-glow1"/></radialGradient>
    <linearGradient id="${u}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="g-body0"/><stop offset="1" class="g-body1"/></linearGradient>
    <linearGradient id="${u}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="g-hand0"/><stop offset="1" class="g-hand1"/></linearGradient>
    <linearGradient id="${u}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="g-hand0"/><stop offset="1" class="g-ring1"/></linearGradient>
  </defs>
  <ellipse class="glow" fill="url(#${u}g)" cx="150" cy="128" rx="150" ry="100"/>
  <ellipse class="floor" cx="150" cy="203" rx="92" ry="8"/>
  <path class="cord" d="${CORD}"/>
  <path class="base" fill="url(#${u}b)" d="M70 188 L92 120 Q95 112 104 112 H196 Q205 112 208 120 L230 188 Q233 198 222 198 H78 Q67 198 70 188Z"/>
  <path class="rim" d="M101 121 H199"/>
  <path class="sheen" d="M86 176 L100 128"/>
  <circle class="bezel" cx="150" cy="150" r="36"/>
  <circle class="ring" fill="url(#${u}r)" cx="150" cy="150" r="31"/>
  <path class="ring-shine" d="M127 133 A28 28 0 0 1 148 122"/>
  <g class="holes"><circle cx="146.18" cy="128.33" r="4.3"/><circle cx="157.52" cy="129.33" r="4.3"/><circle cx="166.85" cy="135.86" r="4.3"/><circle cx="171.67" cy="146.18" r="4.3"/><circle cx="170.67" cy="157.52" r="4.3"/><circle cx="164.14" cy="166.85" r="4.3"/><circle cx="153.82" cy="171.67" r="4.3"/><circle cx="142.48" cy="170.67" r="4.3"/><circle cx="133.15" cy="164.14" r="4.3"/><circle cx="128.33" cy="153.82" r="4.3"/></g>
  <circle class="plate" cx="150" cy="150" r="11"/>
  <path class="glyph" d="M143.6 152.8 C143.6 150.9 144.4 149.9 145.9 149.8 L146.7 149.8 C147.2 148.8 148.2 148.3 150 148.3 C151.8 148.3 152.8 148.8 153.3 149.8 L154.1 149.8 C155.6 149.9 156.4 150.9 156.4 152.8 C156.4 153.4 156.1 153.7 155.5 153.7 H153.8 C153.3 153.7 153 153.4 153 152.9 V151.7 C153 151.1 152.5 150.8 151.7 150.8 H148.3 C147.5 150.8 147 151.1 147 151.7 V152.9 C147 153.4 146.7 153.7 146.2 153.7 H144.5 C143.9 153.7 143.6 153.4 143.6 152.8Z"/>
  <path class="stop" d="M171.5 173.5 L176.5 179"/>
  <rect class="prong" x="104" y="99" width="12" height="15" rx="3"/><rect class="prong" x="184" y="99" width="12" height="15" rx="3"/>
  <g class="handset">
    <path class="hs" stroke="url(#${u}h)" d="M88 92 C110 56 190 56 212 92"/>
    <rect class="cup" fill="url(#${u}h)" x="62" y="85" width="46" height="17" rx="8.5"/>
    <rect class="cup" fill="url(#${u}h)" x="192" y="85" width="46" height="17" rx="8.5"/>
    <path class="hs-gloss" d="M112 75 C130 64 170 64 188 75"/>
    <path class="cup-gloss" d="M70 89 H98 M200 89 H228"/>
  </g>
  <g class="rings"><path d="M46 58 L33 49"/><path d="M40 80 H25"/><path d="M254 58 L267 49"/><path d="M260 80 H275"/><path d="M150 40 V27"/></g>
  <g class="arcs"><path d="M60 62 q-11 17 0 34"/><path d="M240 62 q11 17 0 34"/></g>
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
};
export const icon = (k: string, sw = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${I[k] || ""}</svg>`;
