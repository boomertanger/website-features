// shared/ui-kit/kit-choice.js — the ".bt-choice" section of the UI Kit page (/dev/ui-kit): one tappable option (docs/specs/chat-games.md §6, §7, §14) in
// every state: open, picked ("✓ Your pick"), locked, revealed (gold fill and percentage), correct (lime), out (dimmed), void, and the two-option layout
// with the OR badge (side by side, stacked at 420 px). ui-kit.js appends choiceKitHtml() and calls initChoiceKit(mount) (taps flip the pick; nothing saved).
import { choicesHtml } from "../ui/choice.js";

const WYR = ["Hide in a locker while something breathes outside", "Crawl a vent you can't turn around in"];
const PRED = ["Yes, before the save room", "No, he makes it", "He dies AT the save room"];

export function choiceKitHtml() {
  const cell = (label, html) => `<div class="kit-choice-cell"><p class="kit-sub">${label}</p>${html}</div>`;
  return `
  <section class="kit-section" id="kit-choice">
    <h2 class="kit-h">Choice (.bt-choice)</h2>
    <p class="kit-p">One tappable option for Would You Rather (two, with the OR badge), Predictions (2 to 4) and later Polls (<span class="kit-code">shared/ui/choice.js</span>: choicesHtml, choiceHtml). The split shows as a gold fill with the percentage; the right answer turns lime and the others dim. Tap the open ones.</p>
    <div class="kit-choice-grid">
      ${cell("Two options: open (tap one)", `<div data-kit-choice>${choicesHtml({ options: WYR, two: true, name: "Would you rather" })}</div>`)}
      ${cell("Two options: revealed, your pick, the winner outlined", choicesHtml({ options: WYR, two: true, state: "revealed", pick: 0, pct: [62, 38], winners: [0] }))}
      ${cell("Open, picked (✓ Your pick)", `<div data-kit-choice>${choicesHtml({ options: PRED, pick: 1 })}</div>`)}
      ${cell("Locked (picks closed, the split not out yet)", choicesHtml({ options: PRED, state: "locked", pick: 1 }))}
      ${cell("Locked with the split (gold fill and percentage)", choicesHtml({ options: PRED, state: "locked", pick: 1, pct: [48, 31, 21], counts: [46, 30, 20] }))}
      ${cell("Result: correct (lime) and out (dimmed)", choicesHtml({ options: PRED, state: "result", pick: 0, pct: [48, 31, 21], counts: [46, 30, 20], correct: 0 }))}
      ${cell("Void", choicesHtml({ options: PRED, state: "void", pick: 2 }))}
    </div>
  </section>`;
}

export function initChoiceKit(mount) {
  mount.querySelectorAll("[data-kit-choice]").forEach((box) => box.addEventListener("click", (e) => {
    const b = e.target.closest("[data-choice]");
    if (!b || b.disabled) return;
    box.querySelectorAll("[data-choice]").forEach((x) => {
      const on = x === b;
      x.setAttribute("aria-pressed", String(on));
      x.querySelector(".bt-choice-mine")?.remove();
      if (on) x.insertAdjacentHTML("beforeend", `<span class="bt-choice-mine">${box.querySelector(".bt-choices--two") ? "✓" : "✓ Your pick"}</span>`);
    });
  }));
}
