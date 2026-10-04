// Fun Factory art (docs/specs/fun-factory.md §8): the FUNFACTORY wordmark's factory. At rest the
// windows glow softly and one puff hangs over the chimney; on hover / focus / .is-lit (touch: once in
// view) the windows flicker on in turn and puffs of smoke roll up out of the chimney (factory.css).
// Feature-only, like the Arcade's joystick and the Trophy Room's cup.
export const FF_ICON = `<svg class="ff-icon" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><g class="smoke"><circle class="puff p1" cx="30" cy="9" r="2.6"/><circle class="puff p2" cx="32.5" cy="5.5" r="2"/><circle class="puff p3" cx="29" cy="3" r="1.6"/></g><path class="body" d="M4 34V20l8-5v5l8-5v5l8-5V12h6v22z"/><rect class="chimney" x="28" y="10" width="6" height="4" rx="1"/><g class="win"><rect class="w w1" x="8" y="24" width="4" height="4" rx="1"/><rect class="w w2" x="16" y="24" width="4" height="4" rx="1"/><rect class="w w3" x="24" y="24" width="4" height="4" rx="1"/></g><rect class="floor" x="2" y="34" width="36" height="3" rx="1.5"/></svg>`;

/** The builder's eight machines (docs/specs/fun-factory.md §7, tracker A). */
export const STAGE_ICONS: Record<string, string> = { theme: "🎨", chapters: "📖", campaigns: "🗂", activities: "⚙️", rewards: "🏅", schedule: "📅", review: "🔍", live: "🚀" };
