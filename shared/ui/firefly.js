// shared/ui/firefly.js — the firefly (docs/design-system.md §5 "Firefly"; docs/specs/not-found.md). One drawing, shared by the Tap the Splat footer
// game (round 2's firefly) and the 404 page's workshop, where it's the only light. Colours come from the kit tokens --bt-firefly (the lamp),
// --bt-firefly-shell, --bt-firefly-head and --bt-firefly-wing through the classes below; the lamp's yellow-green is a lamp, not admin green.
//
//   FIREFLY_SVG   the 26×26 drawing: two .ff-wing, the .ff-shell, the glowing .ff-lamp and the .ff-head. Put it in a .bt-firefly (the kit's glow,
//                 wing flap and lamp pulse; reduced motion keeps it still) or in a feature's own wrapper (the footer game's .bt-tts-bug).
export const FIREFLY_SVG = `<svg viewBox="0 0 26 26" aria-hidden="true" focusable="false"><ellipse class="ff-wing" cx="10" cy="9" rx="5" ry="3.5"/><ellipse class="ff-wing ff-wing--2" cx="15" cy="9" rx="5" ry="3.5"/><ellipse class="ff-shell" cx="12" cy="14" rx="4" ry="5"/><ellipse class="ff-lamp" cx="11" cy="18.5" rx="3.6" ry="3.4"/><circle class="ff-head" cx="16.5" cy="11" r="2.6"/></svg>`;
