// shared/ui/medal.js — .bt-medal markup (docs/design-system.md §5 "Medal", §8j): the Trophy Room's
// coin. rarity 1-5 (Common to Legendary); a secret badge shows "?" until it's earned; art is the
// commissioned face (a URL), with the emoji as the fallback until it arrives.
//
//   medalHtml({ emoji, art, rarity, size, secret, label })
//     label: the accessible name (role="img"); without it the medal is decorative.
//   RARITY: [, { name, tone }] for 1-5 (the badge tone and the rarity's name)
import { escapeHtml } from "./dom.js";

export const RARITY = [null,
  { name: "Common", tone: "gray" }, { name: "Uncommon", tone: "blue" }, { name: "Rare", tone: "gold" },
  { name: "Epic", tone: "pink" }, { name: "Legendary", tone: "red" },
];

export function medalHtml({ emoji = "", art = "", rarity = 1, size, secret = false, label = "" } = {}) {
  const r = Math.max(1, Math.min(5, Number(rarity) || 1));
  const style = size ? ` style="--bt-medal-size:${Number(size)}px"` : "";
  const a11y = label ? ` role="img" aria-label="${escapeHtml(label)}"` : ' aria-hidden="true"';
  const face = secret ? "?" : `${art ? `<img class="bt-medal-art" src="${escapeHtml(art)}" alt="" loading="lazy" decoding="async">` : ""}${escapeHtml(emoji)}`;
  return `<span class="bt-medal" data-rarity="${r}"${secret ? " data-secret" : ""}${style}${a11y}><span class="bt-medal-ring"></span><span class="bt-medal-face">${face}</span></span>`;
}
