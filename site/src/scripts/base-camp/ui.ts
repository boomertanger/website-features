// site/src/scripts/base-camp/ui.ts — small pieces the Base Camp pages share (docs/specs/base-camp.md): the W1 "Peak and tent" wordmark icon, the
// paw print, HTML escaping, reduced motion, and the Fan Club lock card for each member state (visitors get Join free, which opens the sign-in
// dialog E1; mid-signup members get Finish signing up). A lock card's data-return (a #chapter) is written into the address before the dialog opens
// (layout.ts), so signing up comes back to what was clicked.
import type { MemberState } from "./member";

export const RM = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** W1: the peak and the tent (the door lights with the wordmark). */
export const BC_ICON = `<svg class="bc-ic" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><path class="peak" d="M3 34 L18 8 L26 20 L30 15 L38 34 Z"/><path class="snow" d="M14.5 14 L18 8 L21.6 14 L19 13 L17 15 Z"/><path class="tent" d="M8 34 L15 22 L22 34 Z"/><path class="door" d="M13 34 L15 29.5 L17 34 Z"/></svg>`;

/** A paw print (viewBox 0 0 24 26). */
export const PAW = `<path d="M12 15 c-4 0 -7 3 -7 6 c0 2 2 3 4 3 c1 0 2 -1 3 -1 s2 1 3 1 c2 0 4 -1 4 -3 c0 -3 -3 -6 -7 -6 Z"/><circle cx="5" cy="11" r="2.4"/><circle cx="9.5" cy="7" r="2.4"/><circle cx="14.5" cy="7" r="2.4"/><circle cx="19" cy="11" r="2.4"/>`;

/** The lock card for a Fan Club part, by member state. ret = the #section to come back to after joining. */
export function lockCard(m: Pick<MemberState, "status">, title: string, text: string, ret = "", joinTitle = "Join free to see the whole story") {
  if (m.status === "loading") return `<div class="bt-lock-card bc-lock" aria-busy="true"><span class="bt-lock-card-ic" aria-hidden="true">🔒</span><div><b>${esc(title)}</b><p>Checking your membership…</p></div></div>`;
  if (m.status === "error") return `<div class="bt-lock-card bc-lock"><span class="bt-lock-card-ic" aria-hidden="true">⚠️</span><div><b>Couldn't load the Fan Club part</b><p>The rest of the page still works.</p></div><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-bc-retry>Try again</button></div>`;
  if (m.status === "signup") return `<div class="bt-lock-card bc-lock"><span class="bt-lock-card-ic" aria-hidden="true">🔒</span><div><b>${esc(title)}</b><p>Finish signing up to see it. It's free.</p></div><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-signin="signup">Finish signing up</button></div>`;
  return `<div class="bt-lock-card bc-lock"><span class="bt-lock-card-ic" aria-hidden="true">🔒</span><div><b>${esc(title)}</b><p>${esc(text)}</p></div><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-signin="join" data-signin-title="${esc(joinTitle)}" data-return="${esc(ret)}">Join free</button></div>`;
}
