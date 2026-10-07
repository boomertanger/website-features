// Shared bits for the Academy "Try it" widgets (tryit/*.ts): the card shell with its title, one-line instruction
// and success slot. Local examples only: nothing is saved or sent.
import { escapeHtml } from "../../../../../shared/ui/dom.js";
import "../../../styles/crew-academy-2.css";

export const esc: (s: unknown) => string = escapeHtml;

export interface Shell { body: HTMLElement; done: HTMLElement; }

export function mountShell(root: HTMLElement, title: string, lead: string): Shell {
  root.innerHTML = `<div class="bt-card ta2"><div class="bt-card-head"><span class="bt-card-title">Try it: ${esc(title)}</span><span class="bt-badge bt-badge--gold">Practice only</span></div>`
    + `<p class="ta2-lead">${esc(lead)} Nothing here is saved or sent.</p><div class="ta2-body"></div><div class="ta2-done" role="status" hidden></div></div>`;
  return { body: root.querySelector<HTMLElement>(".ta2-body")!, done: root.querySelector<HTMLElement>(".ta2-done")! };
}

/** Copy text; true when the browser allowed it. */
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch { return false; }
}
