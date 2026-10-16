// shared/ui/spread.js — helpers for .bt-spread, the magazine spread on story pages (docs/design-system.md §5 "Club Pass pieces").
//   spreadHead(text)      the giant headline's inner HTML: each word in .w > span (they rise in one after another); a word wrapped
//                         in *stars* is the accent word (.w--hi). Text is escaped.
//   isLongHead(text)      true when a word is long enough to need .bt-spread-head--long
//   turnSpread(spread, page, html)   swaps the page with the turn (out, the gold sweep, in); under reduced motion it just swaps.
import { escapeHtml as esc } from "./dom.js";

export function spreadHead(text) {
  return String(text).split(" ").map((w, i) => {
    const hi = w.includes("*");
    return `<span class="w${hi ? " w--hi" : ""}"><span style="--i:${i}">${esc(w.replace(/\*/g, ""))}</span></span>`;
  }).join(" ");
}

export function isLongHead(text) {
  return Math.max(...String(text).replace(/\*/g, "").split(" ").map((w) => w.length)) > 9;
}

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function turnSpread(spread, page, html, { animate = true } = {}) {
  clearTimeout(page._btTurn);
  if (!animate || reduced()) { page.innerHTML = html; page.classList.remove("is-in", "is-out"); return; }
  page.classList.remove("is-in"); page.classList.add("is-out");
  spread.classList.remove("is-turning"); void spread.offsetWidth; spread.classList.add("is-turning");
  page._btTurn = setTimeout(() => { page.innerHTML = html; page.classList.remove("is-out"); void page.offsetWidth; page.classList.add("is-in"); }, 260);
}
