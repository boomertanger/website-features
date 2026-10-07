// shared/ui/stamp.js — .bt-stamp, the celebratory stamp (docs/design-system.md §5 "Story page pieces"): the
// "Application In" seal on Join, and the moment on a tool page's key action (queued, signed off, sent). It slams in
// and settles; under prefers-reduced-motion it just sits there (the CSS handles it).
//
//   stampHtml({ label, sub, kicker, tone, size })   markup string
//     label   the big word ("In", "Done")
//     kicker  small line above it ("Application"); optional
//     sub     small line below it ("Oct 7"); optional
//     tone    "" (gold, the default) | "lime" | "primary"
//     size    "" (130px) | "sm" (96px)
// Text is escaped. Put it where it should land (a card's corner); re-render the node to replay the slam.
import { escapeHtml as esc } from "./dom.js";

const TONES = ["lime", "primary"];

export function stampHtml({ label = "", sub = "", kicker = "", tone = "", size = "" } = {}) {
  const cls = `bt-stamp${TONES.includes(tone) ? ` bt-stamp--${tone}` : ""}${size === "sm" ? " bt-stamp--sm" : ""}`;
  const text = [kicker && `<small>${esc(kicker)}</small>`, `<b>${esc(label)}</b>`, sub && `<small>${esc(sub)}</small>`].filter(Boolean).join("");
  return `<span class="${cls}" role="img" aria-label="${esc([kicker, label, sub].filter(Boolean).join(" "))}"><span aria-hidden="true">${text}</span></span>`;
}
