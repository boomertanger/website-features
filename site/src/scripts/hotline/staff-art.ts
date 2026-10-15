// Art for /admin/inbox/how-it-works, the staff guide (docs/specs/talk-back.md §10; mockup docs/design/mockups/talk-back-inbox-how-it-works.html, hero H1 "The desk"
// with the quality pass). Every builder gives its gradients unique ids. Colours live in styles/hotline-staff-how.css (classes on shapes and stops).
//   deskScene(mascot)   the hero: an office wall with a flickering HOTLINE neon, a wall clock and a desk lamp; a silhouette in over-ear headphones (not the mascot)
//                       nodding behind the desk with a purple status light; the /contact hero's Bakelite phone (art.ts phoneGroup()); a mug with steam that
//                       carries the mascot logo; a New tray and a Done tray. Three numbered envelopes fly from New past the phone (its handset lifts as each
//                       passes) into a fanned stack in Done, the Done tray glows lime and the Desk / Clear stamp slams in; every 12 s. mascot = the mascot's
//                       SVG shapes (Mascot.astro's source). Reduced motion (the CSS): the finished state, still.
//   stageTeam, stageOwner   chapter 01's two stage cards: the team lane's lamps 1-3, a message lifting toward an admin avatar and "Picked up"; the owner lane's
//                       gold-trimmed safe with lamps 4-6 (its dial spins, the padlock rattles and an envelope drops into the slot on hover)
//   JR_ICONS, FACT_ICONS, jrIcon(k), factIcon(k, tone)   drawn icons (24x24 strokes), never emoji
import { phoneGroup } from "./art";

let n = 0;
const uid = (p: string) => `${p}${++n}${Math.random().toString(36).slice(2, 6)}`;
/** The mascot artwork's shapes (shared/assets/mascot.svg?raw minus the root <svg> and the c2pa <metadata>), as Mascot.astro does. */
export const mascotShapes = (svg: string) => svg.replace(/<metadata[\s\S]*?<\/metadata>/, "").replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").trim();
/** Text without its tags (an accessible name built from markup). */
export const stripTags = (x: string) => x.replace(/<[^>]+>/g, "");
/** An envelope: paper, flap, a purple number seal. */
const env = (cls: string, x: number, y: number, k: number) => `<g class="${cls}"><g transform="translate(${x} ${y})"><rect class="pp" width="76" height="50" rx="5"/><path class="pf" d="M0 6 L38 30 L76 6"/><circle class="pk" cx="64" cy="40" r="7"/><text class="pn" x="64" y="43.5">${k}</text></g></g>`;

export function deskScene(mascot: string): string {
  const u = uid("hsd");
  return `<svg class="hb-sh-desk" viewBox="0 0 480 320" role="img" aria-label="A staff member in headphones at the Hotline desk: three messages move from the New tray past the phone into Done, then the desk is stamped clear." focusable="false">
  <defs>
    <linearGradient id="${u}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="g-wall0"/><stop offset="1" class="g-wall1"/></linearGradient>
    <linearGradient id="${u}t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="g-top0"/><stop offset="1" class="g-top1"/></linearGradient>
    <radialGradient id="${u}c" cx="0.5" cy="0" r="1"><stop offset="0" class="g-cone0"/><stop offset=".7" class="g-cone1"/><stop offset="1" class="g-cone2"/></radialGradient>
    <linearGradient id="${u}r" x1="0" y1="0" x2="1" y2="0"><stop offset="0" class="g-rim0"/><stop offset="1" class="g-rim1"/></linearGradient>
  </defs>
  <rect class="wall" width="480" height="210" fill="url(#${u}w)"/>
  <g class="neon"><rect x="196" y="22" width="122" height="30" rx="8" class="neon-box"/><text x="257" y="43" class="neon-t">HOTLINE</text></g>
  <g class="clock" transform="translate(96 66)"><circle r="22" class="clk"/><g class="ticks">${[0, 1, 2, 3].map((i) => `<line x1="0" y1="-19" x2="0" y2="-16" transform="rotate(${i * 90})"/>`).join("")}</g><line class="hand-h" x1="0" y1="0" x2="0" y2="-11"/><line class="hand-m" x1="0" y1="0" x2="0" y2="-16"/><circle r="2" class="clk-c"/></g>
  <g class="lamp"><path class="cone" d="M392 70 L330 236 L470 236 L420 70 Z" fill="url(#${u}c)"/><path class="arm" d="M440 200 L452 120 L406 66"/><path class="shade" d="M388 56 L424 50 L428 72 L394 78 Z"/><circle class="bulb" cx="408" cy="76" r="4"/></g>
  <g class="sil"><g class="sil-head"><path class="sil-body" d="M24 200 C 26 176, 46 166, 64 164 L 66 152 C 54 146, 50 132, 52 120 C 54 100, 70 92, 80 92 C 92 92, 108 100, 108 120 C 110 134, 104 146, 92 152 L 94 164 C 112 166, 132 176, 134 200 Z"/><path class="sil-rim" stroke="url(#${u}r)" d="M100 104 C 108 112, 108 132, 98 146 M 118 172 C 126 178, 132 188, 134 200"/><path class="hp-band" d="M50 124 C 48 86, 112 86, 110 124"/><rect class="hp-cup" x="42" y="112" width="16" height="30" rx="7"/><rect class="hp-cup" x="102" y="112" width="16" height="30" rx="7"/><circle class="hp-led" cx="110" cy="136" r="2"/></g></g>
  <path class="top" d="M14 198 L466 198 L480 254 L0 254 Z" fill="url(#${u}t)"/><path class="edge" d="M0 254 H480 V320 H0 Z"/><path class="lip" d="M0 254 H480"/>
  ${phoneGroup('transform="translate(156 80) scale(.6)"')}
  <g class="mug" transform="translate(338 158)"><path class="mug-h" d="M38 10 Q52 10 52 21 Q52 32 38 30"/><path class="mug-b" d="M0 0 H38 V36 Q38 42 32 42 H6 Q0 42 0 36 Z"/><path class="mug-hi" d="M5 4 V34"/><svg x="6" y="8" width="26" height="29" viewBox="30 92 145 162" overflow="visible"><g class="bt-mascot">${mascot}</g></svg><path class="steam s1" d="M11 -4 q-5 -8 0 -14 q5 -6 0 -14"/><path class="steam s2" d="M25 -4 q-5 -8 0 -14 q5 -6 0 -14"/></g>
  <g class="tray-new"><path class="tr" d="M38 214 h130 l8 30 h-146 z"/><path class="tr-f" d="M30 244 h146 v6 h-146 z"/><text x="103" y="276" class="tl tl-new">NEW</text></g>
  <g class="tray-done"><path class="tr" d="M306 214 h130 l8 30 h-146 z"/><path class="tr-f" d="M298 244 h146 v6 h-146 z"/><text x="371" y="276" class="tl tl-done">DONE</text></g>
  <g class="rm-only">${env("", 334, 200, 1)}${env("", 334, 196, 2)}${env("", 334, 192, 3)}</g>
  ${env("card c3", 64, 196, 3)}${env("card c2", 64, 192, 2)}${env("card c1", 64, 188, 1)}
  <g class="clear-stamp" transform="translate(438 148)"><g class="cs-in"><circle r="30" class="cs-ring"/><text y="-4" class="cs-s">DESK</text><text y="12" class="cs-b">CLEAR</text></g></g>
</svg>`;
}

export function stageTeam(): string {
  const u = uid("hst");
  return `<svg class="hb-sh-ln hb-sh-ln--team" viewBox="0 0 320 140" aria-hidden="true" focusable="false">
  <defs><linearGradient id="${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="g-team0"/><stop offset="1" class="g-team1"/></linearGradient></defs>
  <rect x="58" y="10" width="204" height="44" rx="10" class="board" fill="url(#${u})"/>
  ${[1, 2, 3].map((k, i) => `<g class="key k${k}" transform="translate(${96 + i * 64} 32)"><circle r="11" class="lampbg"/><circle r="7" class="lamp"/><text y="26" class="kn">${k}</text></g>`).join("")}
  <path class="tray" d="M94 84 h132 l8 26 h-148 z"/><path class="tray-f" d="M86 110 h148 v5 h-148 z"/>
  <g class="pp p3"><rect x="118" y="78" width="84" height="26" rx="4"/></g><g class="pp p2"><rect x="114" y="82" width="92" height="26" rx="4"/></g>
  <g class="pp p1"><rect x="110" y="86" width="100" height="26" rx="4"/><path d="M110 90 l50 12 l50 -12" class="pf"/></g>
  ${[["RV", 34, 100], ["HW", 274, 102], ["LJ", 300, 116]].map(([t, x, y], i) => `<g class="av av${i}" transform="translate(${x} ${y})"><circle r="13"/><text y="4">${t}</text></g>`).join("")}
  <g transform="translate(0 116)"><g class="picked"><rect width="70" height="20" rx="10"/><text x="35" y="14">Picked up</text></g></g>
</svg>`;
}

export function stageOwner(): string {
  const u = uid("hso");
  return `<svg class="hb-sh-ln hb-sh-ln--owner" viewBox="0 0 320 140" aria-hidden="true" focusable="false">
  <defs><linearGradient id="${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="g-safe0"/><stop offset="1" class="g-safe1"/></linearGradient></defs>
  ${[4, 5, 6].map((k, i) => `<g transform="translate(70 ${58 + i * 22})"><circle r="6" class="glamp"/><text y="3.5" x="-16" class="gn">${k}</text></g>`).join("")}
  <rect x="96" y="34" width="128" height="92" rx="10" class="safe" fill="url(#${u})"/>
  <rect x="104" y="42" width="112" height="76" rx="6" class="safe-in"/>
  <rect x="122" y="50" width="76" height="6" rx="3" class="slot"/>
  <g transform="translate(160 88)"><g class="dial"><circle r="17" class="dial-o"/><circle r="11" class="dial-i"/>${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<line x1="0" y1="-14" x2="0" y2="-16.5" transform="rotate(${i * 45})"/>`).join("")}<line class="dial-p" x1="0" y1="0" x2="0" y2="-8"/></g></g>
  <g transform="translate(222 62)"><g class="lock"><path class="shackle" d="M-7 0 v-7 a7 7 0 0 1 14 0 v7"/><rect x="-10" y="0" width="20" height="16" rx="3" class="lbody"/><circle cx="0" cy="8" r="2" class="kh"/></g></g>
  <g class="env-in"><rect x="130" y="20" width="60" height="34" rx="3"/><path d="M130 24 l30 14 l30 -14"/></g>
  <g class="plate" transform="translate(160 134)"><text>ONLY BOOMERTANGER</text></g>
</svg>`;
}

const svg24 = (paths: string, sw = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
export const JR_ICONS: Record<string, string> = {
  new: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 8l9 6 9-6"/>',
  pick: '<path d="M7 11V6a1.5 1.5 0 0 1 3 0v4M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V11M16 11V8a1.5 1.5 0 0 1 3 0v6a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L4.5 13.5a1.5 1.5 0 0 1 2.5-1.7L7 12"/>',
  reply: '<path d="M4 5h16v11H10l-6 4z"/><path d="M8 10l3 3 5-5"/>',
  wait: '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/>',
  done: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
};
export const jrIcon = (k: string) => svg24(JR_ICONS[k] || "");
export const FACT_ICONS: Record<string, string> = {
  kind: '<path d="M4 5h16v11H10l-6 4z"/><path d="M9 10.5c0-1 .8-1.7 1.6-1.7.6 0 1.1.3 1.4.8.3-.5.8-.8 1.4-.8.9 0 1.6.7 1.6 1.7 0 1.8-3 3.5-3 3.5s-3-1.7-3-3.5z"/>',
  fast: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6M12 2v3"/>',
  mail: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 8l9 6 9-6"/><path d="M16 3l3 3-3 3"/>',
  bot: '<rect x="5" y="8" width="14" height="11" rx="4"/><path d="M12 8V4M9 13h.01M15 13h.01M9.5 16.5h5"/>',
  personal: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/><circle cx="12" cy="16" r="1.4"/>',
  report: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  crew: '<path d="M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  safety: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
  scales: '<path d="M12 3v18M5 21h14M6 7h12M6 7l-3 7a3 3 0 0 0 6 0zM18 7l-3 7a3 3 0 0 0 6 0z"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M10.3 2h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9L2 13.7v-3.4l2.6-.5.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8z"/>',
  hand: '<path d="M7 11V6a1.5 1.5 0 0 1 3 0v4M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V11M16 11V8a1.5 1.5 0 0 1 3 0v6a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L4.5 13.5a1.5 1.5 0 0 1 2.5-1.7L7 12"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};
/** A drawn icon in a soft tile; tone = gold | red | teal | primary | lime. */
export const factIcon = (k: string, tone = "gold") => `<span class="hb-sh-fic hb-sh-fic--${tone}">${svg24(FACT_ICONS[k] || "", 1.8)}</span>`;
