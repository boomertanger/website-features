// shared/ui/qcard.js — .bt-qcard, a question card (docs/specs/chat-games.md §4, §14; docs/design-system.md §5). Markup plus one click helper.
// Text is escaped; arguments ending in Html are trusted markup.
//
//   qcardHtml({ id, text, handle, ago, votes, voted, canVote, state, pinned, here, mine, note, toolsHtml, sideHtml, big, isNew })
//     state     tonight | standing | held | onair | answered | hidden | merged | cleared | archived (data-state; picks the chip)
//     voted     the viewer's vote (aria-pressed); canVote false disables the button (held, answered, closed, your own, signed out)
//     pinned    "Pinned next" (gold edge) · here "● asker is here" · mine "Yours" · note a short gray line (e.g. "Merged into a similar question")
//   QCARD_CHIP[state]  { tone, label } for the status chip (held teal, Tonight blue, Standing gold, answered lime, the rest gray)
//   initQcards(root, { onVote(id, nextVoted, btn) })   one delegated click handler for every [data-qvote] under root (idempotent)
import { escapeHtml as esc } from "./dom.js";

export const QCARD_CHIP = {
  held: { tone: "teal", label: "Held for a mod" },
  tonight: { tone: "blue", label: "Tonight" },
  standing: { tone: "gold", label: "Standing" },
  answered: { tone: "lime", label: "Answered on stream" },
  hidden: { tone: "gray", label: "Hidden by a mod" },
  merged: { tone: "gray", label: "Merged" },
  cleared: { tone: "gray", label: "Cleared" },
  archived: { tone: "gray", label: "Archived" },
};
const UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 15l6-6 6 6"/></svg>';
const badge = (tone, label) => `<span class="bt-badge bt-badge--${tone}"><span class="bt-badge-dot"></span>${esc(label)}</span>`;

export function qcardHtml({ id = "", text = "", handle = "", ago = "", votes = 0, voted = false, canVote = true, state = "tonight", pinned = false, here = false, mine = false, note = "", toolsHtml = "", sideHtml = "", big = false, isNew = false } = {}) {
  const chip = state === "onair" ? `<span class="bt-live-tag"><i></i>On stream</span>` : QCARD_CHIP[state] ? badge(QCARD_CHIP[state].tone, QCARD_CHIP[state].label) : "";
  const meta = [
    handle ? `<span>@${esc(String(handle).replace(/^@/, ""))}</span>` : "",
    ago ? `<span>${esc(ago)}</span>` : "",
    here ? `<span class="bt-qcard-here">● asker is here</span>` : "",
    chip,
    pinned ? badge("gold", "Pinned next") : "",
    mine ? badge("blue", "Yours") : "",
    note ? `<span>${esc(note)}</span>` : "",
  ].filter(Boolean).join("");
  const n = Math.max(0, Number(votes) || 0);
  const label = `${voted ? "Take back your vote" : "Vote for this question"}: ${n} ${n === 1 ? "vote" : "votes"}`;
  return `<div class="bt-qcard${big ? " bt-qcard--big" : ""}${pinned ? " is-pinned" : ""}${here ? " is-here" : ""}${isNew ? " is-new" : ""}" data-state="${esc(state)}"${id ? ` data-qid="${esc(id)}"` : ""}>`
    + `<button type="button" class="bt-qcard-vote" data-qvote="${esc(id)}" aria-pressed="${voted ? "true" : "false"}" aria-label="${esc(label)}"${canVote ? "" : " disabled"}>${UP}<b>${n}</b></button>`
    + `<div class="bt-qcard-body"><p class="bt-qcard-text">${esc(text)}</p><div class="bt-qcard-meta">${meta}</div>${toolsHtml ? `<div class="bt-qcard-tools">${toolsHtml}</div>` : ""}</div>`
    + `${sideHtml ? `<div class="bt-qcard-side">${sideHtml}</div>` : "<span></span>"}</div>`;
}

export function initQcards(root = document, { onVote } = {}) {
  if (!root || root._qcards) return;
  root._qcards = true;
  root.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-qvote]");
    if (!b || b.disabled || !root.contains(b) || !onVote) return;
    const next = b.getAttribute("aria-pressed") !== "true";
    // optimistic: the button flips and the count moves at once; the caller puts it back if the write fails
    b.setAttribute("aria-pressed", String(next));
    const n = b.querySelector("b");
    if (n) n.textContent = String(Math.max(0, (Number(n.textContent) || 0) + (next ? 1 : -1)));
    onVote(b.dataset.qvote, next, b);
  });
}
