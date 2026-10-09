// shared/ui/prompt.js — .bt-prompt, the gold timed prompt of the Mod Deck (Mod Machina phase 3 part 3; docs/specs/mod-machina.md section 17a "Lantern prompt (P1)"; docs/design-system.md §5 "Mod Deck
// pieces"). "Take the lead?" when a Room Lead steps away (a swinging lantern), "Be acting Captain tonight?" (a gear and a crown), "Take the Captain's seat?". A countdown ring and the time left run from a
// DEADLINE, updating every second, and call back once when it runs out. The prompt is role="alertdialog" and focus moves to its primary button when it appears. Gold means needed: prompts and flags
// are gold, never red. The page decides where it sits (over the chat wall on desktop, in the dock above the duty bar on phones); `inline` removes the entrance animation for that docked spot.
//
//   promptHtml({ kind, kicker, title, text, deadline, total, acceptLabel, declineLabel, inline, id })   markup string (text escaped)
//     kind       "handoff" (lantern) | "acting" (gear and crown) | "captain" (gear and crown, "Take the Captain's seat?");  deadline  epoch ms the prompt runs out;  total  how long it lasts (default 2 min)
//   initPrompt(el, { onAccept, onDecline, onExpire, focus }) -> { stop, remaining }
//     Wires [data-prompt="accept"|"decline"], focuses the accept button (focus: false for a static demo, like the UI kit page), and ticks every second (--t on the ring, the time in the badge). onExpire runs once at zero and the buttons lock.
import { escapeHtml as esc } from "./dom.js";

export const LANTERN_ICON = `<svg viewBox="0 0 30 34" aria-hidden="true"><path class="lt-frame" d="M11 4h8M15 1v3M9 8h12l-1 3H10zM10 11h10v15H10zM8 26h14l-1 4H9z"/><rect class="lt-glass" x="11.5" y="12.5" width="7" height="12" rx="1"/><path class="lt-flame" d="M15 15c2.2 2.6 2.4 4.6 1.5 6.3-.8 1.3-2.2 1.3-3 0-.9-1.7-.6-3.7 1.5-6.3z"/></svg>`;
export const HELM_ICON = `<svg viewBox="0 0 30 34" aria-hidden="true"><circle class="lt-gear" cx="15" cy="17" r="9"/><path class="lt-crown" d="M8 21h14l-1-8-3.5 3.2L15 11l-2.5 5.2L9 13z"/></svg>`;
export const PROMPT_TOTAL_MS = 2 * 60 * 1000;
const clock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

export function promptHtml({ kind = "handoff", kicker = "", title = "", text = "", deadline = Date.now() + PROMPT_TOTAL_MS, total = PROMPT_TOTAL_MS, acceptLabel = "", declineLabel = "", inline = false, id = "" } = {}) {
  const acting = kind === "acting" || kind === "captain";
  const left = Math.max(0, deadline - Date.now());
  const accept = acceptLabel || (kind === "handoff" ? "Take the lead" : kind === "captain" ? "Take the seat" : "Take the helm");
  const decline = declineLabel || (kind === "handoff" ? "Not now" : "Not tonight");
  return `<div class="bt-prompt bt-prompt--${acting ? "acting" : "handoff"}${inline ? " is-inline" : ""}" role="alertdialog" aria-labelledby="${esc(id || "bt-prompt")}-t" aria-describedby="${esc(id || "bt-prompt")}-d" data-deadline="${Math.round(deadline)}" data-total="${Math.round(total)}" style="--t:${Math.min(1, left / total).toFixed(3)}">`
    + `<span class="bt-prompt-ring">${acting ? HELM_ICON : LANTERN_ICON}<em data-prompt-left>${clock(left)}</em></span>`
    + `<span class="bt-prompt-txt"><small>${esc(kicker)}</small><b id="${esc(id || "bt-prompt")}-t">${esc(title)}</b><span id="${esc(id || "bt-prompt")}-d">${esc(text)}</span></span>`
    + `<span class="bt-prompt-acts"><button type="button" class="bt-btn bt-btn--secondary" data-prompt="decline">${esc(decline)}</button><button type="button" class="bt-btn bt-btn--primary" data-prompt="accept">${esc(accept)}</button></span></div>`;
}

/** @param {HTMLElement} el @param {{ onAccept?: () => void, onDecline?: () => void, onExpire?: () => void, focus?: boolean }} [opts] */
export function initPrompt(el, { onAccept, onDecline, onExpire, focus = true } = {}) {
  if (!el || el._prompt) return { stop() {}, remaining: () => 0 };
  const deadline = Number(el.dataset.deadline) || 0, total = Number(el.dataset.total) || PROMPT_TOTAL_MS;
  const label = el.querySelector("[data-prompt-left]");
  let done = false, timer = 0;
  const remaining = () => Math.max(0, deadline - Date.now());
  const paint = () => { const r = remaining(); el.style.setProperty("--t", Math.min(1, r / total).toFixed(3)); if (label) label.textContent = clock(r); return r; };
  const stop = () => { done = true; clearInterval(timer); };
  const lock = () => el.querySelectorAll("button").forEach((b) => { b.disabled = true; });
  const tick = () => { if (done) return; if (!el.isConnected) return stop(); if (paint() <= 0) { stop(); lock(); onExpire?.(); } };
  el._prompt = { stop };
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-prompt]");
    if (!b || done) return;
    stop();
    if (b.dataset.prompt === "accept") onAccept?.(); else onDecline?.();
  });
  tick();
  if (!done) timer = setInterval(tick, 1000);
  if (focus) requestAnimationFrame(() => el.querySelector('[data-prompt="accept"]:not(:disabled)')?.focus());
  return { stop, remaining };
}
