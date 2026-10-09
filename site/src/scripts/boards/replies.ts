// Replies on a board item (Feature Lab's comments, Bug Zapper's private thread): one reply's markup with the staff tag, Hide for staff and the staff view of a
// hidden reply (.bt-comment--hidden); and the box under the list, which depends on who you are: the composer for a verified member, the Join box for a
// visitor, Finish signup, or the verify box. handleGateClick() handles the gate box's buttons. `px` is the feature's class prefix ("fl", "bz"): the feature
// CSS owns .px-gate, .px-gate--warn and .px-cmt-tools.
import { composerHtml } from "../../../../shared/ui/composer.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { toast } from "../../../../shared/ui/toast.js";
import type { Author } from "./profiles";
import { verifyLine, type Need } from "./gate";

export interface Reply { id: string; text: string; by: Author; staffTag: "admin" | "mod" | null; hidden: boolean; hiddenBy?: { uid?: string; handle?: string }; hiddenReason?: string; createdAt: number }
export interface ReplyIcons { shield: string; eye: string }

const initialsOf = (handle: string) => (handle || "?").replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase() || "?";
const plainAuthor = (a: Author) => (a.handle ? `<a href="/u/${encodeURIComponent(a.handle)}">@${esc(a.handle)}</a>` : '<span class="bt-meta">Former member</span>');

/** One reply. `staff` sees hidden ones (dashed, struck through, with who hid it and why) and gets Hide / Unhide on members' replies. */
export function replyHtml(c: Reply, o: { staff: boolean; px: string; icons: ReplyIcons; date: (t: number) => string; hideAttr?: string; author?: (a: Author) => string }) {
  if (c.hidden && !o.staff) return "";
  const hideAttr = o.hideAttr || "data-hide-comment";
  const tag = c.staffTag === "admin" ? `<span class="bt-admin-tag bt-admin-tag--small">${o.icons.shield}Admin</span>` : c.staffTag === "mod" ? '<span class="bt-badge bt-badge--teal">Mod</span>' : "";
  const tools = o.staff && !c.staffTag ? `<span class="${o.px}-cmt-tools"><button type="button" class="bt-btn bt-btn--admin bt-btn--sm" ${hideAttr}="${esc(c.id)}" data-hidden="${c.hidden}" aria-label="${c.hidden ? "Unhide comment" : "Hide comment"}">${o.icons.eye}<span class="bt-btn-label">${c.hidden ? "Unhide" : "Hide"}</span></button></span>` : "";
  const note = c.hidden ? `<span class="bt-comment-hidden-note">Hidden by @${esc(c.hiddenBy?.handle || "a mod")}${c.hiddenReason ? `: ${esc(c.hiddenReason)}` : ""}. Only staff see this.</span>` : "";
  return `<div class="bt-comment${c.hidden ? " bt-comment--hidden" : ""}">${tools}<div class="bt-comment-head"><span class="bt-avatar">${initialsOf(c.by.handle)}</span>${(o.author || plainAuthor)(c.by)}${tag}<span class="bt-comment-time">${o.date(c.createdAt)}</span></div><p class="bt-comment-text">${esc(c.text)}</p>${note}</div>`;
}

/** The box under the replies: the composer, or what stands in its place. */
export function replyBoxHtml(need: Need, o: { px: string; email: string; composerId: string; placeholder: string; joinLine: string; finishLine: string; verifyLead: string }) {
  if (need === "signedOut") return `<div class="${o.px}-gate"><p>${o.joinLine}</p><div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-join-dlg>Join free</button><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-signin-dlg>Sign in</button></div></div>`;
  if (need === "needsSignup") return `<div class="${o.px}-gate"><p>${o.finishLine}</p><div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-finish-dlg>Finish signup</button></div></div>`;
  if (need === "unverified") return `<div class="${o.px}-gate ${o.px}-gate--warn"><p><b>${o.verifyLead}</b> ${verifyLine(o.email)}</p><div class="bt-modal-actions">${o.email ? '<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-resend-dlg>Send a new link</button>' : '<a class="bt-btn bt-btn--secondary bt-btn--sm" href="/account">Open Account</a>'}</div></div>`;
  return composerHtml({ placeholder: o.placeholder, maxLength: 1000, id: o.composerId });
}

/** Handles a click on the gate box's buttons. Resolves true when it was one of them. */
export async function handleGateClick(t: Element, joinTitle: string): Promise<boolean> {
  if (t.closest("[data-join-dlg]")) { const { openSignIn } = await import("../account/dialog"); openSignIn({ mode: "join", title: joinTitle }); return true; }
  if (t.closest("[data-signin-dlg]")) { const { openSignIn } = await import("../account/dialog"); openSignIn({ mode: "signin" }); return true; }
  if (t.closest("[data-finish-dlg]")) { const { openSignIn } = await import("../account/dialog"); openSignIn({}); return true; }
  if (t.closest("[data-resend-dlg]")) {
    const { sendVerification } = await import("../../lib/auth");
    try { await sendVerification(); toast("Sent. Check your inbox."); } catch { toast("Couldn't send it. Wait a minute and try again.", { kind: "error" }); }
    return true;
  }
  return false;
}
