// site/src/scripts/tech-stack/ui.ts — small pieces the Tech Stack's scripts share: the Fan Club lock card for each member state (docs/specs/tech-stack.md
// §2, §7), the mascot, and reduced motion. A visitor's Join free button carries data-return (the deep link to come back to: ?device=…, ?tour=…, or a #
// section); page.ts writes it into the address before the sign-in dialog opens, so the dialog's "come back here" lands on what they clicked.
import { esc } from "./art";
import type { MemberState } from "./member";

export const RM = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
export const mascot = () => document.getElementById("bt-mascot-tpl")?.innerHTML ?? "";
export const LOCK_SVG = `<svg class="ts-lk" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M5 7V5a3 3 0 1 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v5A1.5 1.5 0 0 1 11.5 15h-7A1.5 1.5 0 0 1 3 13.5v-5A1.5 1.5 0 0 1 4.5 7H5zm1.5 0h3V5a1.5 1.5 0 0 0-3 0v2z"/></svg>`;

/** The lock card for a Fan Club part. ret = what to come back to after joining ("?device=gp", "#ts-history"). */
export function lockCard(m: MemberState, title: string, text: string, ret = "") {
  if (m.status === "loading") return `<div class="bt-lock-card ts-lock ts-lock--loading" aria-busy="true"><span class="bt-lock-card-ic" aria-hidden="true">🔒</span><div><b>${esc(title)}</b><p>Checking your membership…</p></div></div>`;
  if (m.status === "error") return `<div class="bt-lock-card ts-lock"><span class="bt-lock-card-ic" aria-hidden="true">⚠️</span><div><b>Couldn't load the member details</b><p>The rest of the page still works.</p></div><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-ts-retry>Try again</button></div>`;
  if (m.status === "signup") return `<div class="bt-lock-card ts-lock"><span class="bt-lock-card-ic" aria-hidden="true">🔒</span><div><b>${esc(title)}</b><p>Finish signing up to see it. It's free.</p></div><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-signin="signup">Finish signing up</button></div>`;
  return `<div class="bt-lock-card ts-lock"><span class="bt-lock-card-ic" aria-hidden="true">🔒</span><div><b>${esc(title)}</b><p>${esc(text)}</p></div><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-signin="join" data-signin-title="Join free to see the whole rig" data-return="${esc(ret)}">Join free</button></div>`;
}
