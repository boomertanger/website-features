// shared/ui/pager.js — markup for the back pill and the pager (docs/design-system.md §5 "Back pill
// and pager"; the Game Vault's game page, game-vault-round-3.html N1 + P12). Pages wire the behavior
// (where the links go, the arrow keys); these only build the markup so it always matches.
//
//   backHtml({ href, label, long = "Back", short = "Back" })
//       .bt-back: the "Back to the Vault" pill with a reminder of where you were (small, hidden on
//       phones, where the short text replaces the long one).
//   pagerHtml({ pos, total, prev, next, keys = true, label = "Pages" })
//       .bt-pager: "3 of 14" with ‹ › links. prev / next: { href, title, meta, cover } or null; a
//       side with nothing is left as an empty gap so the other doesn't move. cover is HTML (a
//       .bt-cover) shown in the .bt-pager-peek preview on hover or focus (pointer devices only).
//       Each link carries data-pg="-1" / "1" for the page to intercept.
import { escapeHtml as esc } from "./dom.js";

const chev = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
export const CHEV_LEFT = chev("M15 5l-7 7 7 7");
export const CHEV_RIGHT = chev("M9 5l7 7-7 7");

export function backHtml({ href = "/", label = "", long = "Back", short = "Back", attrs = "" } = {}) {
  return `<a class="bt-back" href="${esc(href)}"${attrs ? ` ${attrs}` : ""}>${CHEV_LEFT}<span class="bt-back-long">${esc(long)}</span><span class="bt-back-short">${esc(short)}</span>${label ? `<small>${esc(label)}</small>` : ""}</a>`;
}

export function pagerHtml({ pos = 1, total = 1, prev = null, next = null, keys = true, label = "Pages" } = {}) {
  const side = (x, d, word) => {
    if (!x) return `<span class="bt-pager-gap" aria-hidden="true"></span>`;
    const peek = `<span class="bt-pager-peek" aria-hidden="true">${x.cover || ""}<span>${word}<b>${esc(x.title)}</b>${x.meta ? esc(x.meta) : ""}</span></span>`;
    return `<span class="bt-pager-wrap"><a class="bt-pager-btn" href="${esc(x.href)}" data-pg="${d}" aria-label="${word}: ${esc(x.title)}">${d < 0 ? CHEV_LEFT : CHEV_RIGHT}</a>${peek}</span>`;
  };
  return `<div class="bt-pager" role="group" aria-label="${esc(label)}">${keys ? `<span class="bt-pager-keys" aria-hidden="true">← → keys</span>` : ""}<span class="bt-pager-pos"><b>${pos}</b> of ${total}</span>${side(prev, -1, "Previous")}${side(next, 1, "Next")}</div>`;
}
