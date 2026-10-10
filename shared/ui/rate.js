// shared/ui/rate.js — .bt-rate, the three-button rating control (R1; docs/specs/service-hub.md §5, §12; design-system.md §5 "Service Hub pieces").
// Not for me (nope) · Like it (like) · Love it (love), each with a one-line hint; the comment box under it turns required in place for Not for me
// (10 to 500 characters), optional for the other two.
//
//   RATE_VALUES                       ["nope", "like", "love"]
//   RATE_LABEL / RATE_ICON            the words and the stroke icons (thumb down, thumb up, two thumbs); RATE_ICON.ask is the Ask pin's question mark
//   rateHtml({ value, hints, comment, commentText, label, id })
//       value: the current pick ("" for none); hints: show the one-line hints (default true); comment: draw the comment field (default true);
//       commentText: its text; label: the radiogroup's accessible name; id: a prefix for the field ids (default "bt-rate")
//   initRate(el, { onChange })        wires one .bt-rate-wrap: click or arrow keys pick (aria-checked, roving tabindex), Not for me makes the comment
//       required; onChange(value) on every pick. Returns { value(), comment(), validate() }: validate() marks the field .is-error with the reason
//       and returns false when Not for me has under 10 characters (or a comment is over 500).
import { escapeHtml as esc } from "./dom.js";

export const RATE_VALUES = ["nope", "like", "love"];
export const RATE_LABEL = { nope: "Not for me", like: "Like it", love: "Love it" };
export const RATE_HINT = { nope: "Tell us why", like: "It works for me", love: "One of my favorites" };
const THUMB = "M7 11v9H4v-9zM7 11l4-8a2 2 0 0 1 3 2l-1 4h6a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.8 19H7";
export const RATE_ICON = {
  like: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${THUMB}"/></svg>`,
  nope: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 13V4H4v9zM7 13l4 8a2 2 0 0 0 3-2l-1-4h6a2 2 0 0 0 2-2.3l-1.2-6A2 2 0 0 0 17.8 5H7"/></svg>`,
  love: `<svg viewBox="0 0 28 24" aria-hidden="true"><g transform="translate(-1 1) scale(.82)"><path d="${THUMB}"/></g><g transform="translate(8.5 -1) scale(.82)"><path d="${THUMB}"/></g></svg>`,
  ask: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01"/></svg>`,
};
const MIN_NOPE = 10, MAX = 500;

export function rateHtml({ value = "", hints = true, comment = true, commentText = "", label = "Your rating", id = "bt-rate" } = {}) {
  const pick = RATE_VALUES.includes(value) ? value : "";
  const btns = RATE_VALUES.map((v) => `<button type="button" class="bt-rate-btn" role="radio" data-v="${v}" aria-checked="${v === pick}" tabindex="${v === (pick || "nope") ? 0 : -1}">${RATE_ICON[v]}${RATE_LABEL[v]}${hints ? `<small>${RATE_HINT[v]}</small>` : ""}</button>`).join("");
  const field = comment
    ? `<div class="bt-field bt-rate-field" data-required="${pick === "nope"}"><label class="bt-label" for="${esc(id)}-c">${pick === "nope" ? "Why not?" : "Comment (optional)"}<span class="bt-rate-req">Required</span></label>`
      + `<textarea class="bt-textarea" id="${esc(id)}-c" maxlength="${MAX}" rows="3" placeholder="What would make it better?">${esc(commentText)}</textarea>`
      + `<span class="bt-hint">${MIN_NOPE} to ${MAX} characters for Not for me. For Like and Love a comment is optional.</span><p class="bt-error" role="alert" hidden></p></div>`
    : "";
  return `<div class="bt-rate-wrap"><div class="bt-rate" role="radiogroup" aria-label="${esc(label)}">${btns}</div>${field}</div>`;
}

export function initRate(el, { onChange } = {}) {
  const wrap = el.classList.contains("bt-rate-wrap") ? el : el.querySelector(".bt-rate-wrap") || el;
  const btns = [...wrap.querySelectorAll(".bt-rate-btn")];
  const field = wrap.querySelector(".bt-rate-field");
  const box = field && field.querySelector("textarea");
  const err = field && field.querySelector(".bt-error");
  const label = field && field.querySelector(".bt-label");
  let value = (btns.find((b) => b.getAttribute("aria-checked") === "true") || {}).dataset?.v || "";
  const clearError = () => { if (field) { field.classList.remove("is-error"); if (err) { err.hidden = true; err.textContent = ""; } } };
  const set = (v, focus = false) => {
    value = v;
    btns.forEach((b) => { const on = b.dataset.v === v; b.setAttribute("aria-checked", String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
    if (field) {
      field.dataset.required = String(v === "nope");
      if (label && label.firstChild) label.firstChild.textContent = v === "nope" ? "Why not?" : "Comment (optional)";
      if (box) box.required = v === "nope";
      clearError();
    }
    if (onChange) onChange(v);
  };
  wrap.addEventListener("click", (e) => { const b = e.target.closest(".bt-rate-btn"); if (b && wrap.contains(b)) set(b.dataset.v); });
  wrap.addEventListener("keydown", (e) => {
    const b = e.target.closest(".bt-rate-btn"); if (!b) return;
    const i = btns.indexOf(b), step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    set(btns[(i + step + btns.length) % btns.length].dataset.v, true);
  });
  if (box) box.addEventListener("input", clearError);
  return {
    value: () => value,
    comment: () => (box ? box.value.trim() : ""),
    validate() {
      const c = box ? box.value.trim() : "";
      const msg = !value ? "Pick Not for me, Like it or Love it." : value === "nope" && c.length < MIN_NOPE ? `Tell Boomer what's not working (at least ${MIN_NOPE} characters).` : c.length > MAX ? `Keep the comment under ${MAX} characters.` : "";
      if (field) { field.classList.toggle("is-error", !!msg && !!value); if (err) { err.textContent = msg; err.hidden = !msg; } }
      return !msg;
    },
  };
}
