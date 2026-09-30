// shared/ui/arcade.js — Boom Arcade markup shared by the site and the UI Kit page
// (docs/specs/arcade-step1.md §8, design-system.md §5 "Boom Arcade"):
//   BA_ICON        the animated joystick for the BOOM ARCADE wordmark (.bt-ba-icon;
//                  static under reduced motion)
//   ttsLetters()   Tap the Splat's blood-drip title letters, the one source for the
//                  footer's .bt-tts-title and every .bt-game-logo
//   ttsLogoHtml()  a .bt-game-logo for Tap the Splat (--lg page title, --sm cards)
//   BOOMBOT_ICON   BOOMBOT, the Arcade's helper robot (.bt-boombot; .is-thinking while it
//                  "types"). boombotIcon(uid) gives each copy its own gradient id when a
//                  page shows more than one.

export const BA_ICON = `<svg class="bt-ba-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><defs><radialGradient id="bt-ba-knob" cx="36%" cy="30%" r="72%"><stop offset="0" class="k0"/><stop offset=".35" class="k1"/><stop offset="1" class="k2"/></radialGradient></defs><path class="base" d="M10 31h28l5 7.5V41a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-2.5z"/><path class="top" d="M10 31h28l5 7.5H5z"/><circle class="halo" cx="31" cy="36" r="6"/><circle class="lamp" cx="31" cy="36" r="3.6"/><circle class="btn2" cx="38.2" cy="36.6" r="1.8"/><g class="stick"><ellipse class="boot" cx="17" cy="33.6" rx="5" ry="1.9"/><path class="shaft" d="M17 33V17"/><circle class="knob" cx="17" cy="13" r="7.2" fill="url(#bt-ba-knob)"/></g></svg>`;

export const TTS_TITLE = "Tap the Splat";
// Letters that carry a drip: index -> [length px, delay s, duration s]. A logo size
// scales the lengths with --bt-drip-scale (bt-ui.css), not here.
export const TTS_DRIPS = { 1: [12, 0, 4.2], 4: [8, 1.6, 5], 6: [14, 0.8, 4.6], 8: [10, 2.4, 5.4], 11: [13, 1.2, 4.8] };

/** The title's letter spans (uppercase; wrap them in .bt-tts-title). */
export function ttsLetters() {
  return [...TTS_TITLE.toUpperCase()].map((ch, i) => {
    if (ch === " ") return `<span class="bt-tts-lt bt-tts-gap"></span>`;
    const d = TTS_DRIPS[i];
    return d ? `<span class="bt-tts-lt" data-drip style="--len:${d[0]}px;--dl:${d[1]}s;--dur:${d[2]}s">${ch}</span>` : `<span class="bt-tts-lt">${ch}</span>`;
  }).join("");
}

/** Tap the Splat's logo lettering as a .bt-game-logo ("lg" or "sm"), read as one word. */
export function ttsLogoHtml(size = "sm") {
  return `<span class="bt-tts-title bt-game-logo bt-game-logo--${size}" role="img" aria-label="${TTS_TITLE}">${ttsLetters()}</span>`;
}

// BOOMBOT (docs/design/mockups/how-it-works-sections-5-9.html): a yellow head (--bt-lamp to
// --bt-title), a dark visor, --bt-neon eyes that blink now and then, a --bt-blood antenna knob.
// The Arcade's helper character for help and FAQ answers; never presented as a real person
// or as Boomertanger (design-system.md §8h). Colours come from .bt-boombot in bt-ui.css.
export function boombotIcon(uid = "bt-boombot-head") {
  return `<svg class="bt-boombot" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><defs><linearGradient id="${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="h0"/><stop offset="1" class="h1"/></linearGradient></defs><path class="b-ant" d="M20 9V4.5"/><circle class="b-knob" cx="20" cy="3.6" r="2.6"/><rect class="b-ear" x="2.4" y="17" width="3.4" height="9" rx="1.6"/><rect class="b-ear" x="34.2" y="17" width="3.4" height="9" rx="1.6"/><rect class="b-head" x="5.5" y="9" width="29" height="25" rx="8" fill="url(#${uid})"/><rect class="b-visor" x="9.5" y="14.5" width="21" height="10.5" rx="5.2"/><g class="b-eyes"><rect class="b-eye" x="13" y="17.2" width="4.4" height="5" rx="2.2"/><rect class="b-eye" x="22.6" y="17.2" width="4.4" height="5" rx="2.2"/></g><path class="b-mouth" d="M15.5 29.5h9"/></svg>`;
}
export const BOOMBOT_ICON = boombotIcon();
