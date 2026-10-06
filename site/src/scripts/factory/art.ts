// Night Shift art (docs/specs/fun-factory.md §8; the member-facing name is Night Shift, the internal name stays
// factory): the NIGHTSHIFT wordmark's time clock over a punch card. At rest the lamp on top is dim; on hover / focus /
// .is-lit (touch: once in view) the lamp, the dial and the card's punch holes flicker on in turn, like a light coming on
// (factory.css; under reduced motion they just light). Feature-only, like the Arcade's joystick and the Trophy Room's cup.
// SHIFT_SYMBOL is the same clock and card drawn on the nav's 24-unit icon grid: IconSprite.astro builds #i-shift from
// it, so the nav and the wordmark are one icon.
export const SHIFT_SYMBOL = `<circle cx="12" cy="9.5" r="6.5"/><path d="M12 5.8v3.9l2.8 1.7"/><rect x="7.5" y="17.5" width="9" height="4.5" rx="1"/><path d="M10 19.75h4"/>`;
export const FF_ICON = `<svg class="ff-icon" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><circle class="lamp" cx="20" cy="3.6" r="2.4"/><circle class="face" cx="20" cy="18" r="13"/><circle class="dial" cx="20" cy="18" r="10"/><path class="hand" d="M20 11v7.5l5 3"/><circle class="hub" cx="20" cy="18.5" r="1.6"/><rect class="card" x="10" y="33" width="20" height="6" rx="1.5"/><circle class="hole h1" cx="15" cy="36" r="1.1"/><circle class="hole h2" cx="20" cy="36" r="1.1"/><circle class="hole h3" cx="25" cy="36" r="1.1"/></svg>`;

/** The builder's eight machines (docs/specs/fun-factory.md §7, tracker A). */
export const STAGE_ICONS: Record<string, string> = { theme: "🎨", chapters: "📖", campaigns: "🗂", activities: "⚙️", rewards: "🏅", schedule: "📅", review: "🔍", live: "🚀" };
