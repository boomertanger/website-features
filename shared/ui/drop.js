// shared/ui/drop.js — live drop pieces (docs/specs/live-drops.md §5, §7; docs/design-system.md §5 "Live drops"): the fuse ring around a
// drop's medal (.bt-dropfuse, built on medal.js) and the m:ss countdown text used by the drop banner and .bt-drop-timer.
//
//   dropFuseHtml(badge, { p, state, flip, size })
//     badge: { emoji, art, rarity, name } (a Trophy Room badge); p: the fuse left, 1..0; state: open | closing | closed | lost | claimed | won | already
//     (already is a full ring, not filled; "drawing" uses closing); flip: play the medal flip once (.is-flip); size: the medal in px (default 40).
//   setFuse(el, p)        moves a fuse already on the page (no re-render): sets --p, clamped to 0..1.
//   formatDropTime(ms)    "2:41"; anything below zero is "0:00"; minutes are not capped (75 minutes is "75:00").
import { medalHtml } from "./medal.js";

const STATES = ["open", "closing", "closed", "lost", "claimed", "won", "already"];

const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));

export function dropFuseHtml(badge = {}, { p = 1, state = "open", flip = false, size } = {}) {
  const st = state === "drawing" ? "closing" : STATES.includes(state) ? state : "open";
  const fz = size ? `--fz:${Number(size)}px;` : "";
  const medal = medalHtml({ emoji: badge.emoji, art: badge.art, rarity: badge.rarity, label: badge.name || "" });
  return `<span class="bt-dropfuse${flip ? " is-flip" : ""}" data-state="${st}" style="${fz}--p:${clamp01(p)}">${medal}</span>`;
}

export function setFuse(el, p) {
  if (el) el.style.setProperty("--p", String(clamp01(p)));
}

export function formatDropTime(ms) {
  const s = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
