// shared/ui/mod-machina.js — Mod Machina markup shared by the site and the UI Kit page
// (docs/specs/mod-machina.md §16, design-system.md §5 "Mod Machina pieces"):
//   MM_ICON   the wordmark icon, a gear with a watching eye (.bt-mm-icon). The gear turns slowly and the
//             pupil glances about; inside .bt-wordmark--power both speed up and the eye lights on hover,
//             focus or touch (shared/ui/wordmark.js adds .is-lit on touch). Still under reduced motion.
//             Colours come from .bt-mm-icon in bt-ui.css.
//
//   <a class="bt-wordmark bt-wordmark--power" href="/crew" aria-label="Mod Machina">
//     <span class="bt-wordmark-icon">${MM_ICON}</span>
//     <span class="bt-wordmark-text" aria-hidden="true">MOD <span class="bt-wordmark-accent">MACHINA</span></span></a>

export const MM_ICON = `<svg class="bt-mm-icon" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><path class="gear" d="M17 3h6l1 5 4 2 4-3 4 4-3 4 2 4 5 1v6l-5 1-2 4 3 4-4 4-4-3-4 2-1 5h-6l-1-5-4-2-4 3-4-4 3-4-2-4-5-1v-6l5-1 2-4-3-4 4-4 4 3 4-2z"/><ellipse class="eye" cx="20" cy="20" rx="8" ry="5"/><circle class="pupil" cx="20" cy="20" r="2.6"/></svg>`;
