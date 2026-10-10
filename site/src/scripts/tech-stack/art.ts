// site/src/scripts/tech-stack/art.ts — the wiring diagram's drawings (docs/specs/tech-stack.md §5.1), ported from the approved mockup: each device kind
// drawn around 0,0 (the classes b, m, e, s, l, a, g, k, scr1-3, pl are styled per view in styles/tech-stack.css), the cable paths for each view, and
// the whole diagram's SVG for a view. Photo view uses the owner's cut-outs (Cloudinary) where the device has one, the drawing otherwise.
import { DEVICES, CABLES, DEV, PAIR_K, FLOW_COLS, posOf, photoUrl, cardPhoto, type Device, type Cable, type Look } from "./data";
import { PLATFORM_ICONS } from "../../data/footer-icons.js";   // the official marks (Simple Icons, CC0), the same the footer's Follow badges use

export const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const R = (x: number, y: number, w: number, h: number, c: string, rx = 0, extra = "") => `<rect class="${c}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ${extra}/>`;
const tally = (x: number, y: number) => `<circle class="ts-tally" cx="${x}" cy="${y}" r="4"/>`;

type Kind = { w: number; h: number; d: (v: string) => string };
export const KINDS: Record<string, Kind> = {
  tower: { w: 100, h: 164, d: (v) => R(-48, -80, 96, 160, "b", 10) + R(-36, -66, 72, 9, "m", 3) + [0, 1, 2, 3, 4, 5, 6].map((i) => R(-34, -44 + i * 12, 68, 5, "k", 2)).join("")
    + (v === "aw" ? `<ellipse class="a" cx="0" cy="52" rx="20" ry="10" opacity=".85"/>` : `<circle class="g" cx="0" cy="56" r="5"/>`) },
  monitor: { w: 244, h: 170, d: (v) => {
    const scr = ({ game: "scr1", slobs: "scr2", chat: "scr3" } as Record<string, string>)[v] || "s";
    let inner = "";
    if (v === "game") inner = `<circle class="l" cx="62" cy="-34" r="13" opacity=".8"/><path class="k" d="M-112 40 L-80 6 L-58 26 L-30 -6 L0 30 L30 10 L60 34 L112 4 L112 54 L-112 54Z"/>`;
    if (v === "slobs") inner = R(-104, -56, 130, 74, "k", 3) + R(32, -56, 72, 22, "k", 3) + R(32, -30, 72, 22, "k", 3) + R(32, -4, 72, 22, "k", 3) + R(-104, 24, 208, 22, "k", 3) + `<circle class="ts-sc-live" cx="-92" cy="-46" r="4"/>`;
    if (v === "chat") inner = [0, 1, 2, 3, 4, 5].map((i) => R(-100 + (i % 2) * 16, -52 + i * 17, 120 - (i % 3) * 22, 8, "k", 4)).join("") + R(40, -56, 64, 102, "k", 4);
    return R(-120, -76, 240, 140, "b", 8) + R(-112, -68, 224, 124, "s " + scr, 4) + inner + R(-8, 64, 16, 18, "m") + R(-44, 80, 88, 8, "m", 4);
  } },
  webcam: { w: 64, h: 36, d: () => R(-30, -14, 60, 28, "b", 14) + `<circle class="s" r="10"/><circle class="a" r="4"/>` + tally(20, -6) },
  gimbal: { w: 52, h: 60, d: () => R(-16, 12, 32, 14, "m", 4) + R(-21, -28, 42, 42, "b", 12) + `<circle class="s" cy="-7" r="13"/><circle class="a" cy="-7" r="5"/>` + tally(14, -20) },
  tripod: { w: 70, h: 190, d: () => `<path class="e" d="M0 -20 V54 M0 54 L-34 104 M0 54 L34 104 M0 54 V104" stroke-width="3"/>` + R(-16, -30, 32, 14, "m", 4) + R(-21, -68, 42, 42, "b", 12) + `<circle class="s" cy="-47" r="13"/><circle class="a" cy="-47" r="5"/>` + tally(14, -60) },
  keylight: { w: 104, h: 80, d: () => `<path class="e" d="M0 30 V120" stroke-width="4"/>` + R(-48, -32, 96, 64, "b", 9) + R(-40, -24, 80, 48, "l", 5) },
  lightsm: { w: 64, h: 60, d: () => R(-28, -18, 56, 34, "b", 9) + R(-21, -11, 42, 20, "l", 6) + `<path class="e" d="M0 16 V32 M-14 32 H14" stroke-width="3"/>` },
  mic: { w: 70, h: 100, d: () => `<path class="e" d="M44 52 L8 2" stroke-width="5"/><g transform="rotate(-18)">` + R(-15, -46, 30, 66, "b", 13) + R(-13, -44, 26, 22, "m", 11) + `</g>` + tally(18, -36) },
  headphones: { w: 84, h: 70, d: () => `<path class="e" d="M-27 6 A27 30 0 0 1 27 6" stroke-width="7"/>` + R(-36, -2, 17, 32, "b", 8) + R(19, -2, 17, 32, "b", 8) },
  mixer: { w: 172, h: 96, d: () => {
    let s = R(-82, -44, 164, 88, "b", 8);
    for (let i = 0; i < 8; i++) { const x = -70 + i * 15; s += R(x + 3, -6, 4, 40, "k", 2) + R(x, 6 + ((i * 7) % 4) * 6, 10, 7, "m", 2); }
    for (let i = 0; i < 6; i++) s += R(-70 + i * 15, -34, 11, 11, i % 2 ? "g" : "a", 2);
    return s + R(46, -34, 26, 26, "k", 4);
  } },
  keyboard: { w: 226, h: 74, d: () => { let s = R(-110, -32, 220, 64, "b", 8) + R(-104, -28, 208, 3, "a", 1.5); for (let r = 0; r < 4; r++) for (let c = 0; c < 15; c++) s += R(-100 + c * 13.4, -20 + r * 12.5, 10.5, 9.5, "k", 2); return s; } },
  mouse: { w: 40, h: 56, d: () => `<path class="b" d="M0 -25 C15 -25 17 -10 17 2 C17 19 9 25 0 25 C-9 25 -17 19 -17 2 C-17 -10 -15 -25 0 -25Z"/><path class="e" d="M0 -25 V-7"/><circle class="a" cy="12" r="3"/>` },
  mousepad: { w: 128, h: 96, d: () => R(-62, -46, 124, 92, "m", 12, 'opacity=".55"') + R(46, -40, 10, 10, "a", 3) },
  pedal: { w: 108, h: 54, d: () => R(-50, -22, 100, 44, "b", 8) + [-31, 0, 31].map((x) => R(x - 12, -16, 24, 32, "m", 5)).join("") },
  tablet: { w: 124, h: 90, d: (v) => {
    let s = R(-58, -42, 116, 84, "b", 9) + R(-52, -36, 104, 72, "s", 4);
    if (v === "deck") for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) s += R(-46 + c * 19, -30 + r * 21, 15, 15, (r + c) % 3 ? "k" : (c % 2 ? "g" : "a"), 3);
    if (v === "play") s += R(-52, -36, 104, 72, "scr1", 4) + `<path class="l" d="M-8 -12 L12 0 L-8 12Z"/>`;
    return s;
  } },
  phone: { w: 46, h: 82, d: () => R(-20, -37, 40, 74, "b", 9) + R(-16, -31, 32, 62, "s scr2", 4) + [0, 1, 2, 3].map((i) => R(-12, -24 + i * 12, 24 - (i % 2) * 8, 5, "k", 2)).join("") },
  echo: { w: 72, h: 72, d: () => `<circle class="b" r="33"/><circle class="s" r="24"/><text class="ts-echo-t" text-anchor="middle" y="5" font-size="13" font-weight="800">8:42</text>` },
  vr: { w: 104, h: 66, d: () => `<path class="e" d="M-40 0 C-62 -36 62 -36 40 0" stroke-width="5"/>` + R(-44, -16, 88, 42, "b", 19) + R(-35, -8, 70, 22, "s", 11) },
  controllers: { w: 84, h: 70, d: () => `<circle class="e" cx="-19" cy="-6" r="14" stroke-width="5"/><circle class="e" cx="19" cy="-6" r="14" stroke-width="5"/>` + R(-25, 6, 12, 26, "b", 5) + R(13, 6, 12, 26, "b", 5) },
  capture: { w: 100, h: 44, d: () => R(-46, -17, 92, 34, "b", 8) + R(-34, -4, 34, 8, "k", 3) + `<circle class="a" cx="30" cy="0" r="4"/>` },
  usbswitch: { w: 80, h: 40, d: () => R(-35, -14, 70, 28, "b", 6) + [0, 1, 2, 3].map((i) => R(-27 + i * 14, -5, 10, 10, "k", 2)).join("") },
  rx: { w: 54, h: 54, d: () => `<path class="e" d="M12 -12 L22 -30" stroke-width="3"/>` + R(-20, -14, 40, 30, "b", 6) + `<circle class="a" cx="-8" cy="1" r="3"/>` },
  lav: { w: 54, h: 60, d: () => R(-22, -22, 24, 40, "b", 6) + `<path class="e" d="M-10 -22 C-10 -36 16 -36 16 -16" stroke-width="2"/>` + `<circle class="m" cx="16" cy="-12" r="6"/>` + tally(-10, -10) },
  router: { w: 120, h: 70, d: () => `<path class="e" d="M-36 -14 L-44 -40 M36 -14 L44 -40" stroke-width="4"/>` + R(-54, -16, 108, 36, "b", 8) + [0, 1, 2, 3, 4].map((i) => `<circle class="a" cx="${-36 + i * 12}" cy="2" r="3"/>`).join("") },
  platform: { w: 84, h: 84, d: (v) => {
    const mark = (PLATFORM_ICONS as Record<string, string>)[v];
    return R(-38, -38, 76, 76, `pl pl--${v}`, 18) + (mark ? `<path class="plt plt--${v}" transform="translate(-22 -22) scale(1.833)" d="${mark}"/>` : "");
  } },
};
const kindOf = (d: { art: string }) => { const [k, v = ""] = d.art.split(":"); return { k: KINDS[k] || KINDS.capture, v }; };
export const drawDev = (d: Device) => { const { k, v } = kindOf(d); return k.d(v); };

/** A device's drawing as a small standalone svg (cards, list rows, the hardware cards when there's no photo). */
export function iconSvg(d: Device, cls = "") {
  const { k } = kindOf(d), m = Math.max(k.w, k.h) / 2 + 6;
  return `<svg class="ts-ico ${cls}" viewBox="${-m} ${-m} ${m * 2} ${m * 2}" aria-hidden="true" focusable="false"><g class="ts-dev ts-dev--ico">${drawDev(d)}</g></svg>`;
}
/** The card photo (an <img> that falls back to the drawing if it can't load), or the drawing. w = the CSS width it shows at. */
export function devPic(id: string, w: number, cls = "") {
  const url = photoUrl(cardPhoto(id), w * 2), d = DEV[id];
  if (!url) return d ? iconSvg(d, cls) : "";
  return `<img class="ts-pic ${cls}" src="${url}" alt="" loading="lazy" decoding="async" data-fallback="${esc(id)}">`;
}

function roundPath(pts: [number, number][], r = 14) {
  let s = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [x, y] = pts[i], [nx, ny] = pts[i + 1];
    const d1 = Math.hypot(x - px, y - py), d2 = Math.hypot(nx - x, ny - y), rr = Math.min(r, d1 / 2, d2 / 2);
    const ax = x - ((x - px) / (d1 || 1)) * rr, ay = y - ((y - py) / (d1 || 1)) * rr, bx = x + ((nx - x) / (d2 || 1)) * rr, by = y + ((ny - y) / (d2 || 1)) * rr;
    s += ` L${ax} ${ay} Q${x} ${y} ${bx} ${by}`;
  }
  const l = pts[pts.length - 1];
  return s + ` L${l[0]} ${l[1]}`;
}
/** A cable's path in a view: Photo and Drawn hang like the footer's power cables (wireless arcs over), Blueprint runs square on a grid, Flow goes left to right. */
export function cablePath(c: Cable, look: Look, i: number) {
  const a = posOf(DEV[c.from], look), b = posOf(DEV[c.to], look), k = PAIR_K[c.id];
  if (look === "flow") {
    if (b[0] <= a[0]) { const x1 = a[0] + 110, x2 = b[0] + 110, s = 70 + k * 30; return `M${x1} ${a[1]} C${x1 + s} ${a[1]} ${x2 + s} ${b[1]} ${x2} ${b[1]}`; }
    const x1 = a[0] + 110, x2 = b[0] - 110, dx = Math.max(40, (x2 - x1) / 2), o = k * 10;
    return `M${x1} ${a[1] + o} C${x1 + dx} ${a[1] + o} ${x2 - dx} ${b[1] + o} ${x2} ${b[1] + o}`;
  }
  if (look === "blueprint") {
    const lane = ((i * 5) % 9 - 4) * 9;
    if (Math.abs(a[0] - b[0]) < 6) return `M${a[0]} ${a[1]} L${b[0]} ${b[1]}`;
    const my = (a[1] + b[1]) / 2 + lane;
    return roundPath([a, [a[0], my], [b[0], my], b]);
  }
  if (c.signal === "wifi") return `M${a[0]} ${a[1]} Q${(a[0] + b[0]) / 2} ${Math.min(a[1], b[1]) - (look === "photo" ? 50 : 60)} ${b[0]} ${b[1]}`;
  const s = (look === "photo" ? 30 : 40) + Math.hypot(b[0] - a[0], b[1] - a[1]) * (look === "photo" ? 0.14 : 0.16) + k * (look === "photo" ? 26 : 28);
  return `M${a[0]} ${a[1]} C${a[0]} ${a[1] + s} ${b[0]} ${b[1] + s} ${b[0]} ${b[1]}`;
}

const FLOW_LAB: Record<string, string> = { gp: "Gaming PC", sp: "Streaming PC", aoc: "AOC 4K · Streamlabs", g7a: "G7 · gameplay", g7b: "G7 · apps and chat",
  link: "Face cam · Twitch/YT", link2: "Face cam · TikTok", brio: "Shoulder cam · Twitch/YT", link2c: "Shoulder cam · TikTok", c920: "Skipper cam", "kl-l": "Key Light · left",
  "kl-r": "Key Light · right", neo: "Key Light Neo", "lt-l": "Litra Glow · left", "lt-r": "Litra Glow · right", l8: "Zoom L-8 mixer", sm7: "Shure SM7dB", lav: "Sennheiser TX",
  lavrx: "Sennheiser RX", hp: "NDH 20 headphones", hd60x: "HD60X capture", kb: "K100 keyboard", usbsw: "USB switch", g502: "G502 X mouse", pp: "Powerplay pad", g503: "G503 mouse",
  pedal: "Stream Deck Pedal", deck: "iPad · Stream Deck", play: "iPad · playback", iphone: "iPhone 16", echo: "Echo Spot", quest: "Quest 3", ctrl: "Quest controllers",
  router: "Wi-Fi router · Beacon G6", ont: "Fiber box (ONT)", twitch: "Twitch", youtube: "YouTube", tiktok: "TikTok" };

function devMarkup(d: Device, look: Look, interactive: boolean) {
  const [x, y] = posOf(d, look), { k } = kindOf(d);
  const attrs = interactive ? `tabindex="0" role="button" aria-label="${esc(`${d.name}, ${d.model}`)}"` : "";
  const P = d.views.photo, src = look === "photo" && P ? photoUrl(d.photo.desk, Math.max(P.w, P.h) * 3) : "";
  if (look === "photo" && P && src) {
    const rx = P.x - P.anchor[0], ry = P.y - P.anchor[1];
    return `<g class="ts-dev ts-dev--photo" data-id="${d.id}" data-onair="${d.onAir ? 1 : 0}" ${attrs} transform="translate(${x} ${y})">
      <rect class="ts-hit" x="${rx}" y="${ry}" width="${P.w}" height="${P.h}"/><rect class="ring" x="${rx - 6}" y="${ry - 6}" width="${P.w + 12}" height="${P.h + 12}" rx="12"/>
      <image class="ts-photo" href="${src}" x="${rx}" y="${ry}" width="${P.w}" height="${P.h}" preserveAspectRatio="xMidYMid meet"/>
      <text class="ts-lab" text-anchor="middle" y="${ry + P.h + 20}">${esc(d.short)}</text></g>`;
  }
  if (look === "flow") {
    const sc = 30 / Math.max(k.w, k.h);
    return `<g class="ts-dev" data-id="${d.id}" data-onair="${d.onAir ? 1 : 0}" ${attrs} transform="translate(${x} ${y})">
      <rect class="ts-node" x="-110" y="-22" width="220" height="44" rx="12"/><g transform="translate(-86 0) scale(${sc.toFixed(3)})">${drawDev(d)}</g>
      <text class="ts-lab" x="-64" y="5" font-size="14">${esc(FLOW_LAB[d.id] || d.short)}</text><circle class="ts-tally" cx="98" cy="0" r="4"/></g>`;
  }
  // Drawn, Blueprint, and Photo for a device without a cut-out (drawn at its Drawn spot, a little smaller so it sits with the photos)
  const s = look === "photo" ? 0.7 : 1;
  return `<g class="ts-dev" data-id="${d.id}" data-onair="${d.onAir ? 1 : 0}" ${attrs} transform="translate(${x} ${y})${s !== 1 ? ` scale(${s})` : ""}">
    <rect class="ts-hit" x="${-k.w / 2}" y="${-k.h / 2}" width="${k.w}" height="${k.h}"/>
    <rect class="ring" x="${-k.w / 2 - 8}" y="${-k.h / 2 - 8}" width="${k.w + 16}" height="${k.h + 16}" rx="16"/>
    ${drawDev(d)}<text class="ts-lab" text-anchor="middle" y="${k.h / 2 + 22}">${esc(d.short)}</text></g>`;
}

/** The whole diagram for a view. uid keeps the blueprint grid's pattern id unique; interactive adds the keyboard targets and wide cable hit lines. */
export function svgMarkup(look: Look, uid: string, interactive = true) {
  let bg = "";
  if (look === "drawn") bg = `<rect class="ts-bg-wall" x="-400" y="-300" width="2400" height="640"/><rect class="ts-bg-desk" x="-400" y="330" width="2400" height="520"/><path class="ts-bg-edge" d="M-400 330 H2000 M-400 850 H2000"/>
    <rect class="ts-zone" x="300" y="862" width="900" height="118" rx="16"/><text class="ts-zone-t" x="320" y="884">The internet</text>`;
  if (look === "blueprint") bg = `<defs><pattern id="tsg-${uid}" width="40" height="40" patternUnits="userSpaceOnUse"><path class="ts-bg-grid" d="M40 0 H0 V40"/></pattern></defs><rect x="-400" y="-300" width="2400" height="1600" fill="url(#tsg-${uid})"/>
    <rect class="ts-zone ts-zone--bp" x="300" y="862" width="900" height="118" rx="6"/><text class="ts-zone-t ts-zone-t--bp" x="320" y="884">THE INTERNET</text>`;
  if (look === "photo") bg = `<rect class="ts-zone" x="270" y="890" width="950" height="100" rx="16"/><text class="ts-zone-t" x="288" y="912">The internet</text>`;
  if (look === "flow") bg = FLOW_COLS.map(([t, x]) => `<text class="ts-col-t" x="${x}" y="34" text-anchor="middle">${t}</text>`).join("");
  const cables = CABLES.map((c, i) => {
    const d = cablePath(c, look, i), to = posOf(DEV[c.to], look);
    const j = look === "blueprint" ? `<circle class="ts-junction" cx="${to[0]}" cy="${to[1]}" r="4"/>` : "";
    return `<g class="ts-cab" data-id="${c.id}" data-sig="${c.signal}"><path class="ts-cable" data-phys="${c.signal}" d="${d}"/>${interactive ? `<path class="ts-cable-hit" d="${d}"/>` : ""}${j}</g>`;
  }).join("");
  return `${bg}<g class="ts-cables">${cables}</g><g class="ts-pulses"></g><g class="ts-devs">${DEVICES.map((d) => devMarkup(d, look, interactive)).join("")}</g>`;
}
