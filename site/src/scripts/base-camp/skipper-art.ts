// site/src/scripts/base-camp/skipper-art.ts — /base-camp/skipper's media and drawings (docs/specs/base-camp.md "Page 3"; mockup
// docs/design/mockups/base-camp-skipper.html). Built at build time by pages/base-camp/skipper.astro:
//   mediaUrl / posterUrl / mediaHtml    Cloudinary delivery URLs for the fixed skipper/ public ids (cloud name: site.json cloudinary.cloudName).
//                                       Clips are muted, looping, inline, preload="none" and never autoplay: skipper.ts plays them only while
//                                       they're on screen, and never under reduced motion (the poster stays).
//   camOffScene()                       the painted sleeping Skipper in her bed (cam off; the blurred screen for visitors)
//   mailboxScene()                      the sitting corgi by the Pup Post mailbox
//   walesCard(), wordCard(), saddleCard()   All about corgis: the real Wales outline, cor + ci, the fairy saddle
//   shield(icon, i)                     a royal shield crest for the quirk flip cards; CROWN the Queen's corgis crown; PAWS the hero's paw prints
// Colours are classes in styles/base-camp-skipper.css; ids are unique per drawing.
import site from "../../data/site.json";
import data from "../../data/base-camp/skipper.json";
import { dogAt, sittingCorgi, sleepingCorgi } from "./corgi";
import { PAW, esc } from "./ui";

let n = 0;
const nid = (p: string) => `${p}${++n}`;
const CLOUD: string = site.cloudinary?.cloudName || "";
type MediaKey = keyof typeof data.media;
export const MEDIA = data.media as Record<string, { type: "image" | "video"; id: string; alt: string }>;

/** An image (or a clip's poster) at width w. */
export const imageUrl = (id: string, w: number) => (CLOUD ? `https://res.cloudinary.com/${encodeURIComponent(CLOUD)}/image/upload/f_auto,q_auto,c_limit,w_${Math.round(w)}/${id}` : "");
/** A clip at width w. */
export const videoUrl = (id: string, w: number) => (CLOUD ? `https://res.cloudinary.com/${encodeURIComponent(CLOUD)}/video/upload/q_auto,vc_auto,w_${Math.round(w)}/${id}.mp4` : "");
/** A media item's still: the photo itself, or the clip's -poster image. */
export const posterUrl = (key: string, w: number) => { const m = MEDIA[key]; return m ? imageUrl(m.type === "video" ? `${m.id}-poster` : m.id, w) : ""; };

/** The <img> or <video> for a media key. Videos carry data-sk-video so skipper.ts plays them only while on screen. */
export function mediaHtml(key: MediaKey | string, w: number, cls = "", alt?: string) {
  const m = MEDIA[key];
  if (!m) return "";
  const a = esc(alt ?? m.alt);
  if (m.type === "image") return `<img class="${cls}" src="${imageUrl(m.id, w)}" alt="${a}" loading="lazy" decoding="async">`;
  return `<video class="${cls}" data-sk-video src="${videoUrl(m.id, w)}" poster="${posterUrl(key, w)}" muted loop playsinline preload="none" aria-label="${a}"></video>`;
}

export const PAWS = `<svg class="sk-paws" viewBox="0 0 600 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${[[40, 240, -20], [90, 200, -10], [130, 250, -25], [180, 205, -12], [470, 60, 20], [520, 30, 30], [560, 80, 15]].map(([x, y, r]) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(1.4)">${PAW}</g>`).join("")}</svg>`;

/** The cam-off scene: Skipper asleep in her bed, a window, z's. */
export function camOffScene() {
  return `<svg class="sk-cam-off" viewBox="0 0 640 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect class="sk-room" width="640" height="400"/><rect class="sk-floor" y="270" width="640" height="130"/>
    <rect class="sk-window" x="60" y="50" width="150" height="104" rx="6"/><path class="sk-window-bar" d="M135 50 V154 M60 102 H210"/>
    <ellipse class="sk-bed2" cx="320" cy="330" rx="240" ry="56"/><ellipse class="sk-bed" cx="320" cy="314" rx="226" ry="48"/><ellipse class="sk-bed2" cx="320" cy="306" rx="180" ry="30"/>
    <path class="sk-bedrim" d="M98 314 C130 276 510 276 542 314"/>
    <g transform="translate(118 158) scale(1.5)">${sleepingCorgi()}</g>
    <g class="sk-zz"><text x="500" y="230" font-size="22">z</text><text x="518" y="210" font-size="28">z</text><text x="538" y="186" font-size="34">Z</text></g>
  </svg>`;
}

/** A sunny backyard (sky, trees, fence, grass) in a W × H box. */
function yard(u: string, w = 400, h = 260) {
  const k = w / 400;
  const x = (v: number) => (v * k).toFixed(0);
  return `<defs><linearGradient id="${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="y-sky0"/><stop offset="1" class="y-sky1"/></linearGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#${u})"/>
  <path class="y-tree" d="M0 ${h - 110} C${x(30)} ${h - 150} ${x(70)} ${h - 140} ${x(90)} ${h - 120} C${x(110)} ${h - 160} ${x(160)} ${h - 150} ${x(170)} ${h - 120} C${x(200)} ${h - 144} ${x(240)} ${h - 140} ${x(260)} ${h - 114} C${x(290)} ${h - 148} ${x(350)} ${h - 144} ${w} ${h - 120} V${h - 90} H0 Z"/>
  <g class="y-fence"><path d="M0 ${h - 88} H${w} M0 ${h - 74} H${w}"/><path d="${Array.from({ length: Math.ceil(w / 50) }, (_, i) => `M${20 + i * 50} ${h - 100} V${h - 64}`).join(" ")}"/></g>
  <path class="y-grass" d="M0 ${h - 64} C${x(100)} ${h - 72} ${x(300)} ${h - 68} ${w} ${h - 72} V${h} H0 Z"/><path class="y-grass2" d="M0 ${h - 24} C${x(120)} ${h - 34} ${x(280)} ${h - 28} ${w} ${h - 34} V${h} H0 Z"/>`;
}

/** The sitting corgi by the Pup Post mailbox (a letter with a heart waits in it, the flag is up). */
export function mailboxScene() {
  const u = nid("skYd");
  return `<svg viewBox="0 0 600 330" preserveAspectRatio="xMidYMax slice" role="img" aria-label="Skipper sitting in the yard beside a mailbox with a letter in it">${yard(u, 600, 330)}
    <rect class="mb-post" x="392" y="170" width="12" height="130"/>
    <path class="mb-box" d="M350 130 C350 108 368 96 398 96 C428 96 446 108 446 130 V176 H350 Z"/>
    <path class="mb-base" d="M350 176 H446 V184 H350 Z"/>
    <g class="pm-flag"><rect class="mb-flagpole" x="446" y="112" width="6" height="40"/><rect class="mb-flag" x="452" y="112" width="26" height="16"/></g>
    <g class="pm-env"><rect class="mb-env" x="356" y="132" width="60" height="38" rx="3"/><path class="mb-env-v" d="M356 132 L386 154 L416 132"/><path class="mb-heart" d="M386 150 c-6 -6 -12 0 -6 6 l6 6 l6 -6 c6 -6 0 -12 -6 -6 Z"/></g>
    <g transform="translate(150 186) scale(1.12)">${sittingCorgi()}</g>
  </svg>`;
}

export const walesCard = () => `<svg viewBox="0 0 240 120" role="img" aria-label="An outline of Wales with Pembrokeshire marked in the southwest"><rect class="ow-sea" width="240" height="120"/><path class="ow-land" d="M151.9 13.5 L133.4 16.0 L118.0 18.5 L111.9 23.5 L105.7 33.5 L98.0 41.0 L111.9 37.0 L118.0 43.5 L119.6 56.0 L108.8 71.0 L99.6 76.0 L81.1 87.0 L87.2 95.0 L93.4 98.5 L99.6 98.0 L111.9 95.0 L113.4 103.5 L124.2 101.0 L133.4 107.0 L145.8 108.5 L161.2 101.0 L162.7 88.5 L150.4 76.0 L148.8 56.0 L150.4 36.0 L159.6 28.5 L151.9 13.5 Z"/><path class="ow-land" d="M115.0 21.0 L102.6 17.0 L104.2 10.0 L115.0 10.0 L119.6 16.0 Z"/><circle class="ow-pin" cx="91.9" cy="90.0" r="5"/><text class="ow-lab" x="21.9" y="108.0">Pembrokeshire</text><text class="ow-lab ow-lab--muted" x="150" y="50">WALES</text></svg>`;
export const wordCard = () => `<svg viewBox="0 0 240 120" aria-hidden="true"><rect class="sk-word-bg" width="240" height="120"/><text class="sk-w1" x="44" y="70">cor</text><text class="sk-wplus" x="116" y="70">+</text><text class="sk-w2" x="146" y="70">ci</text><text class="sk-wsub" x="44" y="96">dwarf</text><text class="sk-wsub" x="148" y="96">dog</text></svg>`;
export const saddleCard = () => `<svg viewBox="0 0 240 120" aria-hidden="true"><rect class="sk-saddle-bg" width="240" height="120"/>${dogAt(40, 24, 0.62)}<path class="fs-saddle" d="M84 50 C98 42 116 42 128 50"/><g class="fs-fairy"><circle cx="106" cy="36" r="4"/><path class="fs-wing" d="M106 34 C100 24 92 24 94 32 Z"/><path class="fs-wing" d="M106 34 C110 24 118 24 116 32 Z"/></g></svg>`;
export const breedSvg = (coat: "red" | "merle", label: string) => `<svg viewBox="0 -16 250 146" role="img" aria-label="${esc(label)}">${coat === "merle" ? dogAt(0, 0, 1, "", { coat: "merle", tail: "long" }) : dogAt(0, 0, 1)}</svg>`;

export const CROWN = `<svg class="sk-crown" viewBox="0 0 80 60" aria-hidden="true"><path class="cr-g" d="M6 50 L2 14 L22 30 L40 4 L58 30 L78 14 L74 50 Z"/><rect class="cr-g" x="6" y="50" width="68" height="8" rx="2"/><circle class="cr-j" cx="40" cy="36" r="5"/><circle class="cr-b" cx="22" cy="40" r="3.5"/><circle class="cr-b" cx="58" cy="40" r="3.5"/></svg>`;

/** A royal shield crest (six field patterns) with the quirk's icon on the boss, a crown and laurels. */
export function shield(ic: string, i: number) {
  const u = nid("skSh");
  const S = "M14 22 H78 V52 C78 76 62 90 46 98 C30 90 14 76 14 52 Z";
  const fields = [
    `<rect class="sh-r" x="0" y="0" width="46" height="60"/><rect class="sh-b" x="46" y="0" width="46" height="60"/><rect class="sh-b" x="0" y="60" width="46" height="50"/><rect class="sh-r" x="46" y="60" width="46" height="50"/>`,
    `<rect class="sh-r" x="0" y="0" width="46" height="110"/><rect class="sh-b" x="46" y="0" width="46" height="110"/>`,
    `<rect class="sh-b" width="92" height="110"/><path class="sh-g" d="M10 86 L46 50 L82 86 L82 72 L46 36 L10 72 Z"/>`,
    `<rect class="sh-r" width="92" height="110"/><path class="sh-g" d="M0 30 L16 18 L92 92 L76 104 Z"/>`,
    `<rect class="sh-b" width="92" height="110"/><path class="sh-g" d="M10 18 L22 18 L82 96 L70 96 Z M82 18 L70 18 L10 96 L22 96 Z"/>`,
    `<rect class="sh-r" width="92" height="110"/><rect class="sh-b" width="92" height="38"/><circle class="sh-g" cx="30" cy="30" r="3.5"/><circle class="sh-g" cx="46" cy="30" r="3.5"/><circle class="sh-g" cx="62" cy="30" r="3.5"/>`,
  ];
  const laurel = [0, 1, 2, 3].map((k) => `<ellipse cx="${10 - k * 0.5}" cy="${86 - k * 11}" rx="5" ry="2.6" transform="rotate(${-50 + k * 8} ${10 - k * 0.5} ${86 - k * 11})"/><ellipse cx="${82 + k * 0.5}" cy="${86 - k * 11}" rx="5" ry="2.6" transform="rotate(${50 - k * 8} ${82 + k * 0.5} ${86 - k * 11})"/>`).join("");
  return `<svg class="sk-shield" viewBox="0 0 92 104" aria-hidden="true"><defs><clipPath id="${u}c"><path d="${S}"/></clipPath><linearGradient id="${u}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="sh-gl0"/><stop offset=".5" class="sh-gl1"/><stop offset="1" class="sh-gl0"/></linearGradient></defs>
    <g class="sh-laurel"><path d="M20 94 C8 84 4 66 8 48 M72 94 C84 84 88 66 84 48"/>${laurel}</g>
    <g clip-path="url(#${u}c)">${fields[i % fields.length]}<rect class="sh-sheen" x="-40" y="0" width="30" height="110" fill="url(#${u}g)" transform="skewX(-20)"/></g>
    <path class="sh-rim" d="${S}"/><path class="sh-rim2" d="M19 27 H73 V52 C73 73 59 85 46 92 C33 85 19 73 19 52 Z"/>
    <circle class="sh-boss" cx="46" cy="58" r="15"/><text class="sh-ic" x="46" y="64.5" text-anchor="middle">${ic}</text>
    <g class="sh-crown"><path d="M28 18 L25 4 L35 11 L46 0 L57 11 L67 4 L64 18 Z"/><rect x="27" y="17" width="38" height="5" rx="1.5"/><circle class="sh-jewel" cx="46" cy="12" r="2.4"/><circle class="sh-jewel2" cx="36" cy="14" r="1.6"/><circle class="sh-jewel2" cx="56" cy="14" r="1.6"/></g>
  </svg>`;
}

/** A ghost-numbered chapter header (the kit .bt-chapter--ghost), as on /base-camp. */
export function chapterHtml(i: number, id: string, title: string, lede = "") {
  const n = String(i + 1).padStart(2, "0");
  return `<header class="bt-chapter bt-chapter--ghost" data-n="${n}"><p class="bt-chapter-eyebrow" aria-hidden="true">${n} · Chapter</p><h2 class="bt-chapter-title" id="h-${id}">${esc(title)}</h2>${lede ? `<p class="bt-chapter-lede">${esc(lede)}</p>` : ""}</header>`;
}
