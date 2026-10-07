// Shared bits for the Academy "Try it" widgets of modules 1 to 5 (tryit/{welcome,platforms,stream-duty,engagement}.ts):
// the card shell with its title, a one-line instruction and a success slot, plus a tiny chat-message builder.
// Local examples only: nothing is saved or sent. (Modules 6 to 10 have their own: tryit-kit.ts.)
import { escapeHtml } from "../../../../../shared/ui/dom.js";
import "../../../styles/crew-academy-1.css";

export const esc: (s: unknown) => string = escapeHtml;

export interface Shell { body: HTMLElement; done: HTMLElement }

export function mountShell(root: HTMLElement, title: string, lead: string): Shell {
  root.innerHTML = `<div class="bt-card ta1"><div class="bt-card-head"><span class="bt-card-title">Try it: ${esc(title)}</span><span class="bt-badge bt-badge--gold">Practice only</span></div>`
    + `<p class="ta1-lead">${esc(lead)} Nothing here is saved or sent.</p><div class="ta1-body"></div><div class="ta1-done" role="status" hidden></div></div>`;
  return { body: root.querySelector<HTMLElement>(".ta1-body")!, done: root.querySelector<HTMLElement>(".ta1-done")! };
}

/** One chat line: name colour is one of c1..c4 (kit colours), `mod` marks crew. */
export const msgHtml = (name: string, text: string, c = 1, mod = false) =>
  `<div class="ta1-msg"><b class="ta1-nm" data-c="${c}">${mod ? `<span class="ta1-mod" aria-label="Crew">MOD</span> ` : ""}${esc(name)}</b><span class="ta1-tx">${esc(text)}</span></div>`;
