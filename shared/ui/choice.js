// shared/ui/choice.js — .bt-choice, one tappable option: Would You Rather's A / B (with the OR badge), Predictions' 2 to 4 answers, later Polls
// (docs/specs/chat-games.md §6, §7, §14; mockup chat-games-batch-1.html). Markup only; the page wires the clicks ([data-choice] = the index).
// Text is escaped.
//
//   choicesHtml({ options, state, pick, pct, counts, correct, two, letters, name })
//     options  the option texts (2 to 4)
//     state    open (tappable) · locked (picks closed, nothing shown yet, or the split with pct) · revealed (gold fill and percentage) ·
//              result (revealed, plus correct: the right one lime, the others dimmed "out") · void (everything dimmed, struck)
//     pick     the viewer's pick (index, or null): aria-pressed and "✓ Your pick"
//     pct      percentages per option (revealed, result, and locked once the split shows); counts optional ("12 picks")
//     correct  the right option's index (result) · winners: indexes outlined lime at a Would You Rather reveal
//     two      the two-option layout: side by side with the OR badge, stacked at 420 px
//     letters  show A / B / C / D on each option
//   choiceHtml({ i, text, state, picked, pct, count, correct, out, letter })   one option
import { escapeHtml as esc } from "./dom.js";

const L = ["A", "B", "C", "D"];

export function choiceHtml({ i = 0, text = "", state = "open", picked = false, pct = null, count = null, correct = false, out = false, letter = false, two = false } = {}) {
  const shown = pct != null && state !== "open" && state !== "void";
  const cls = ["bt-choice", correct ? "is-correct" : "", out ? "is-out" : "", state === "void" ? "is-void" : "", shown ? "is-shown" : ""].filter(Boolean).join(" ");
  const meta = [count != null && shown ? `${count} ${count === 1 ? "pick" : "picks"}` : "", correct ? (two ? "the winner" : "it happened") : ""].filter(Boolean).join(" · ");
  return `<button type="button" class="${cls}" data-choice="${i}" data-state="${esc(state)}" aria-pressed="${picked ? "true" : "false"}"${state === "open" ? "" : " disabled"}${shown ? ` style="--f:${Math.max(0, Math.min(100, pct)) / 100}"` : ""}>`
    + (shown ? `<span class="bt-choice-fill" aria-hidden="true"></span>` : "")
    + (letter ? `<span class="bt-choice-letter" aria-hidden="true">${L[i] || ""}</span>` : "")
    + (shown ? `<span class="bt-choice-pct">${Math.round(pct)}%</span>` : "")
    + `<span class="bt-choice-t">${esc(text)}</span>`
    + (meta ? `<small class="bt-choice-meta">${esc(meta)}</small>` : "")
    + (picked ? `<span class="bt-choice-mine">${two ? "✓" : "✓ Your pick"}</span>` : "")
    + `</button>`;
}

export function choicesHtml({ options = [], state = "open", pick = null, pct = null, counts = null, correct = null, winners = null, two = false, letters = false, name = "" } = {}) {
  const one = (text, i) => choiceHtml({
    i, text, state, picked: pick === i, two, letter: letters,
    pct: pct ? pct[i] : null, count: counts ? counts[i] : null,
    correct: (state === "result" && correct === i) || (Array.isArray(winners) && winners.includes(i) && state !== "open"),
    out: state === "result" && correct != null && correct !== i,
  });
  const items = options.map(one);
  const body = two && items.length === 2 ? `${items[0]}<span class="bt-choice-or" aria-hidden="true">OR</span>${items[1]}` : items.join("");
  return `<div class="bt-choices${two ? " bt-choices--two" : ""}" role="group"${name ? ` aria-label="${esc(name)}"` : ""}>${body}</div>`;
}
