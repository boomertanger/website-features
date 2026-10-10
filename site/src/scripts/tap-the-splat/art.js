// Tap the Splat art and the game-only DOM, added to the idle footer when the
// game loads. Drawn from the approved prototype; every colour is a --tts-*
// feature property declared once at the top of tap-the-splat.css.

import { FIREFLY_SVG } from "../../../../shared/ui/firefly.js";

const f = (fill, stroke, sw) => `style="fill:var(--tts-${fill})${stroke ? `;stroke:var(--tts-${stroke})` : ""}"${sw ? ` stroke-width="${sw}"` : ""}`;

// The fuse ends at the bomb's cap (bottom-right corner of the viewBox).
export const FUSE_PATH = "M8 14 C 30 2, 44 34, 64 20 S 96 2, 104 30 S 130 58, 150 40 S 178 30, 188 62 S 199 84, 200 92";

const SKULL = `<svg viewBox="0 0 22 26" aria-hidden="true"><path d="M11 3c5 0 8 3.4 8 7.6 0 2.6-1.2 4.2-2.6 5.2v3.2c0 .8-.7 1.5-1.5 1.5H7.1c-.8 0-1.5-.7-1.5-1.5v-3.2C4.2 14.8 3 13.2 3 10.6 3 6.4 6 3 11 3z" ${f("bone", "bone-edge", ".8")}/><circle cx="8" cy="11" r="2.2" ${f("socket")}/><circle cx="14" cy="11" r="2.2" ${f("socket")}/><path d="M11 13.3l-1.1 2h2.2z" ${f("socket")}/><path d="M8.3 20.4v-2.2M11 20.4v-2.2M13.7 20.4v-2.2" style="fill:none;stroke:var(--tts-bone-edge)" stroke-width=".8"/></svg>`;

const OUTLET = `<svg viewBox="0 0 34 46" aria-hidden="true"><rect x="1" y="1" width="32" height="44" rx="5" ${f("plate", "plate-edge", "1.2")}/><rect x="7" y="9" width="20" height="28" rx="4" ${f("plate-face", "plate-face-edge", "1")}/><rect x="11" y="14" width="3" height="8" rx="1" ${f("slot")}/><rect x="20" y="14" width="3" height="8" rx="1" ${f("slot")}/><path d="M15 29a2 2 0 0 1 4 0v3h-4z" ${f("slot")}/><circle cx="17" cy="5" r="1.4" ${f("plate-edge")}/><circle cx="17" cy="41" r="1.4" ${f("plate-edge")}/></svg>`;

const PLUG = `<svg viewBox="0 0 22 30" aria-hidden="true"><rect x="6" y="0" width="2.6" height="8" rx="1" ${f("prong")}/><rect x="13.4" y="0" width="2.6" height="8" rx="1" ${f("prong")}/><rect x="2" y="7" width="18" height="15" rx="4" ${f("plug", "plug-edge", "1")}/><rect x="8" y="21" width="6" height="7" rx="2" ${f("cord")}/></svg>`;

const HAMMER = `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="17" y="12" width="6" height="26" rx="2.5" ${f("wood", "wood-edge", "1")}/><path d="M6 6h24a3 3 0 0 1 3 3v6H6a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3z" ${f("steel", "steel-edge", "1.2")}/><rect x="30" y="7" width="6" height="7" rx="1.5" ${f("steel-dark")}/><path d="M8 8h18" style="fill:none;stroke:var(--tts-steel-shine)" stroke-width="1.2"/></svg>`;

const CUTTERS = `<svg viewBox="0 0 40 40" aria-hidden="true"><g class="jaw1"><path d="M20 20 L6 11 L3 14 L18 22z" ${f("jaw", "jaw-edge", "1")}/></g><g class="jaw2"><path d="M20 20 L6 29 L3 26 L18 18z" ${f("jaw-2", "jaw-edge", "1")}/></g><path d="M20 19 C 26 16, 32 10, 37 9 L38 12 C 33 14, 27 19, 22 21z" ${f("grip", "grip-edge", "1")}/><path d="M20 21 C 26 24, 32 30, 37 31 L38 28 C 33 26, 27 21, 22 19z" ${f("grip-2", "grip-edge", "1")}/><circle cx="20" cy="20" r="2.4" ${f("pivot", "jaw-edge", "1")}/></svg>`;

// The firefly is the kit's drawing (shared/ui/firefly.js, coloured by the --bt-firefly-* tokens); the game keeps its own wrapper and motion (.bt-tts-bug).
export const FIREFLY = FIREFLY_SVG;

const BREAKER = `<svg viewBox="0 0 34 48" aria-hidden="true"><rect x="1" y="1" width="32" height="46" rx="4" ${f("box", "box-edge", "1.2")}/><rect x="7" y="8" width="20" height="30" rx="3" ${f("box-slot", "box-slot-edge", "1")}/><g class="lever"><rect x="12" y="10" width="10" height="14" rx="2.5" ${f("lever", "lever-edge", "1")}/></g><circle class="led" cx="17" cy="42" r="2"/><text x="17" y="35" font-size="5" text-anchor="middle" font-family="monospace" ${f("lever-edge")}>ON</text></svg>`;

const fuse = (gid) => `<svg class="bt-tts-fuse" viewBox="0 0 200 90" preserveAspectRatio="xMaxYMax meet" aria-hidden="true"><defs><mask id="bt-tts-fm-${gid}" maskUnits="userSpaceOnUse"><path class="f-mk" d="${FUSE_PATH}" stroke-width="9" fill="none" stroke-linecap="round"/></mask></defs><g mask="url(#bt-tts-fm-${gid})"><path class="f-rope" d="${FUSE_PATH}"/><path class="f-braid" d="${FUSE_PATH}"/></g><path class="f-hit" data-tts-g="fuse" d="${FUSE_PATH}"/><g class="f-fx"></g><circle class="f-cut" r="9"/><circle class="f-spark" r="4.5"/><g class="f-sparkg"><path class="f-spark2" d="M0 -8 L2 -2 L8 0 L2 2 L0 8 L-2 2 L-8 0 L-2 -2Z"/></g></svg>`;

const html = (s) => { const t = document.createElement("template"); t.innerHTML = s.trim(); return t.content; };

/** Adds the game-only pieces to the idle footer (once per game root). */
export function mountPieces(root, gid) {
  const $ = (s) => root.querySelector(s);

  $("[data-snd]").before(html(`<div class="bt-tts-arcade" role="group" aria-label="Time and penalty">
    <span class="bt-tts-cell is-time"><span class="bt-tts-cell-lab">Time</span><span class="bt-tts-num is-big"><span class="bt-tts-ghost" aria-hidden="true">8:88.88</span><span data-tm>0:00.00</span></span></span>
    <span class="bt-tts-cell"><span class="bt-tts-cell-lab">Penalty</span><span class="bt-tts-num"><span class="bt-tts-ghost" aria-hidden="true">+88s</span><span data-pen>+0s</span></span></span>
  </div>`));

  root.querySelectorAll(".bt-tts-link").forEach((a) => a.prepend(html(`<span class="bt-tts-link-mark" aria-hidden="true"></span>`)));

  $(".bt-tts-hr").append(html(`<span class="bt-tts-chain" inert><span class="bt-tts-chain-links"></span><button type="button" class="bt-tts-chain-handle" data-tts-g="chain" aria-label="Pull the chain">${SKULL}</button></span>`));

  $(".bt-tts-o").append(html(`<button type="button" class="bt-tts-bomb" data-tts-g="bomb" aria-label="Bomb" tabindex="-1"></button>${fuse(gid)}`));

  // End card, layout 2 "Play first" (arcade-step1.md §1); the toast sits at the top of
  // the stage: below the game bar, above the splat.
  $(".bt-tts-stage").append(html(`<div class="bt-tts-toast" role="status"></div>`));
  $(".bt-tts-stage").append(html(`<section class="bt-tts-end" aria-live="polite" inert>
    <h3 data-end-title></h3><div class="bt-tts-end-big" data-end-score></div><p class="bt-tts-end-sub" data-end-sub></p>
    <div class="bt-tts-end-pills" data-end-pills></div>
    <button type="button" class="bt-btn bt-btn--go bt-tts-play" data-tts-g="again">Play again</button>
    <div class="bt-tts-end-place" data-end-place></div>
    <div class="bt-tts-end-fb" data-end-fb hidden><button type="button" data-fb="liked">👍 I liked it <span data-c="liked"></span></button><button type="button" data-fb="wantMore">🎮 Make more games <span data-c="wantMore"></span></button></div>
    <div class="bt-tts-end-proof" data-end-proof></div>
    <div data-end-tease></div>
  </section>`));

  root.append(html(`<div class="bt-tts-veil"></div>
    <svg class="bt-tts-cord" aria-hidden="true"><path/></svg>
    <span class="bt-tts-outlet" aria-hidden="true">${OUTLET}</span>
    <span class="bt-tts-plug" aria-label="Plug">${PLUG}</span>
    <button type="button" class="bt-tts-breaker" data-tts-g="breaker" aria-label="Breaker switch" inert>${BREAKER}</button>
    <button type="button" class="bt-tts-tool" data-tool="hammer" aria-label="Hammer" inert>${HAMMER}</button>
    <button type="button" class="bt-tts-tool" data-tool="cutters" aria-label="Wire cutters" inert>${CUTTERS}</button>
    <div class="bt-tts-boom" aria-hidden="true"></div>`));
}
