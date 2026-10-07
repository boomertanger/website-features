// Try it for module 1 "Welcome to the crew": the Crew Code's "Which rule is this?" card. Three short chat moments;
// tap the rule each one tests. Local only (docs/specs/crew-academy.md §1).
import { mountShell, esc, msgHtml } from "../tryit1-kit";
import { CODE } from "../../../../data/academy-blocks";

interface Moment { lines: [string, string, number, boolean][]; rule: number; why: string; hint: string }
const MOMENTS: Moment[] = [
  { lines: [["Nova", "ok team, my kid just came down with a fever, I have to go", 2, true], ["Ivy", "all good, go! I've got your chat", 3, true]], rule: 0, why: "Nova steps away with no guilt, and a teammate takes over. Life comes first.", hint: "Think about what the crew does when a real-life thing comes up." },
  { lines: [["newviewer22", "everyone watch my stream too: twitch.tv/newviewer22", 1, false], ["Moss", "Hey! No links in chat, but welcome in. Glad you're here.", 2, true]], rule: 1, why: "Moss starts with the softest step that does the job: a friendly reminder, not a ban. Friendly before firm.", hint: "Look at how Moss opens, before any rule is mentioned." },
  { lines: [["Ash", "removed it. Someone said they don't feel safe, flagging Boomer from the Deck now", 4, true], ["Captain Sol", "thanks Ash, good catch", 3, true]], rule: 4, why: "Ash doesn't handle it alone or stay quiet: serious things go to the Captain and Boomer. Flag what matters.", hint: "This one is too important to handle quietly." },
];

export default function init(root: HTMLElement): void {
  const { body, done } = mountShell(root, "Which rule is this?", "Read the chat moment, then tap the Crew Code rule it tests.");
  let at = 0;
  let solved = false;
  let wrong = -1;
  const found: number[] = [];

  function render() {
    const m = MOMENTS[at];
    body.innerHTML = `<div class="bt-steps" aria-hidden="true">${MOMENTS.map((_, i) => `<i class="${i <= at ? "is-on" : ""}"></i>`).join("")}</div>`
      + `<p class="ta1-h">Moment ${at + 1} of ${MOMENTS.length}</p>`
      + `<div class="ta1-chat" role="group" aria-label="Chat moment">${m.lines.map(([n, t, c, mod]) => msgHtml(n, t, c, mod)).join("")}</div>`
      + `<div class="ta1-opts" role="group" aria-label="Which rule is this?">${CODE.map(([name], i) => `<button type="button" class="ta1-opt${solved && i === m.rule ? " is-right" : ""}${wrong === i ? " is-wrong" : ""}" data-i="${i}"${solved ? " disabled" : ""}><span class="ta1-opt-n" aria-hidden="true">${i + 1}</span>${esc(name)}</button>`).join("")}</div>`
      + `<p class="ta1-fb" role="status" data-s="${solved ? "ok" : wrong >= 0 ? "bad" : ""}"${solved || wrong >= 0 ? "" : " hidden"}>${solved ? `<b>Yes.</b> ${esc(m.why)}` : wrong >= 0 ? `<b>Not quite.</b> ${esc(m.hint)}` : ""}</p>`
      + (solved && at < MOMENTS.length - 1 ? `<div class="ta1-row"><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-next>Next moment</button></div>` : "");
    done.hidden = !(solved && at === MOMENTS.length - 1);
    if (!done.hidden) done.innerHTML = `<b>Three for three</b><p>Every chat moment maps to one of the six rules. When you're not sure, ask which rule it's about.</p><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-again>Try again</button>`;
  }

  root.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const opt = t.closest<HTMLButtonElement>(".ta1-opt");
    if (opt && !solved) {
      const i = Number(opt.dataset.i);
      if (i === MOMENTS[at].rule) { solved = true; wrong = -1; if (!found.includes(at)) found.push(at); } else wrong = i;
      render();
      (root.querySelector<HTMLElement>(solved ? "[data-next], [data-again]" : ".ta1-opt.is-wrong") ?? null)?.focus();
    } else if (t.closest("[data-next]")) {
      if (at < MOMENTS.length - 1) { at += 1; solved = false; wrong = -1; render(); root.querySelector<HTMLElement>(".ta1-opt")?.focus(); }
    } else if (t.closest("[data-again]")) {
      at = 0; solved = false; wrong = -1; found.length = 0; render(); root.querySelector<HTMLElement>(".ta1-opt")?.focus();
    }
  });
  render();
}
