// shared/ui/cue-card.js — .bt-cue-card, a Chat Games cue for your room (Mod Machina phase 3 part 3; docs/design-system.md §5 "Mod Deck pieces", §8t; the cue slot on the Mod Deck's rail that Chat
// Games (ROADMAP 5b) fills). The format name, the cue text in a dashed box (what to post in your chat), a Copy button that turns into "Copied", the due time in gold when there is one, and Posted /
// Done. States: pending · posted (a lime "Posted" tag, only Done left) · done (muted) · read-only (no buttons, for Deckhands, who only see the cue). An empty slot says "No cues for your room yet".
// The Deck itself never changes when a new game ships: Chat Games registers what goes here. Text is escaped.
//
//   cueCardHtml({ id, kicker, text, due, state, readonly })   markup string
//     kicker  the format's name ("Dead Air · clue 2");  due  "9:15 PM" (shown in gold as "Due 9:15 PM");  state  "pending" | "posted" | "done";  readonly  true for no buttons
//   cueEmptyHtml({ mascotHtml, title, text })   the empty state
//   initCueCards(root, { onPosted(id), onDone(id), onCopy(id, text) })   Copy writes the cue to the clipboard (falls back to selecting it), shows "Copied" for 2 s
import { escapeHtml as esc } from "./dom.js";

const STATES = ["pending", "posted", "done"];

export function cueCardHtml({ id = "", kicker = "", text = "", due = "", state = "pending", readonly = false } = {}) {
  const st = STATES.includes(state) ? state : "pending";
  const tag = st === "posted" ? `<span class="bt-badge bt-badge--lime"><span class="bt-badge-dot"></span>Posted</span>` : st === "done" ? `<span class="bt-badge bt-badge--gray">Done</span>` : "";
  const acts = readonly || st === "done" ? "" : `<span class="bt-cue-acts">${st === "pending" ? `<button type="button" class="bt-btn bt-btn--secondary" data-cue-posted>Posted</button>` : ""}<button type="button" class="bt-btn bt-btn--primary" data-cue-done>Done</button></span>`;
  const copy = st === "done" ? "" : `<button type="button" class="bt-cue-copy" data-cue-copy>Copy</button>`;
  return `<div class="bt-cue-card is-${st}${readonly ? " is-readonly" : ""}" data-cue="${esc(id)}"><div class="bt-cue-head"><span class="bt-cue-kicker">${esc(kicker)}</span>${tag}${due && st !== "done" ? `<span class="bt-cue-due">Due ${esc(due)}</span>` : ""}</div>`
    + `<p class="bt-cue-text" data-cue-text>${esc(text)}</p>${copy || acts ? `<div class="bt-cue-foot">${copy}${acts}</div>` : ""}</div>`;
}

export function cueEmptyHtml({ mascotHtml = "", title = "No cues for your room yet", text = "When a game has something to post in your chat, it shows up here." } = {}) {
  return `<div class="bt-cue-empty">${mascotHtml}<b>${esc(title)}</b><p>${esc(text)}</p></div>`;
}

export function initCueCards(root, { onPosted, onDone, onCopy } = {}) {
  if (!root || root._cues) return;
  root._cues = true;
  root.addEventListener("click", async (e) => {
    const card = e.target.closest("[data-cue]");
    if (!card || !root.contains(card)) return;
    const id = card.dataset.cue;
    if (e.target.closest("[data-cue-posted]")) return onPosted?.(id);
    if (e.target.closest("[data-cue-done]")) return onDone?.(id);
    const b = e.target.closest("[data-cue-copy]");
    if (!b) return;
    const textEl = card.querySelector("[data-cue-text]"), text = textEl?.textContent || "";
    try { await navigator.clipboard.writeText(text); }
    catch { const r = document.createRange(); r.selectNodeContents(textEl); const s = getSelection(); s?.removeAllRanges(); s?.addRange(r); }
    b.textContent = "Copied"; b.classList.add("is-done");
    onCopy?.(id, text);
    setTimeout(() => { if (b.isConnected) { b.textContent = "Copy"; b.classList.remove("is-done"); } }, 2000);
  });
}
