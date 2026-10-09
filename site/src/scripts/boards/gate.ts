// Who may do what on a member board (Feature Lab, Bug Zapper; docs/specs/feature-lab.md §2, docs/specs/bug-zapper.md §2). Visitors get the Join dialog
// with the action's own title, members part-way through signup finish it, members whose email isn't verified get the verify prompt (Twitch sign-ins
// with no email are told to add one). Client checks only decide what's shown; the callables check again. Also the non-production ?as= preview (signed
// out only: the page reads its preview-*.json and actions change a local copy).
//
//   const gate = makeGate({ preview: previewJson, feature: "feature-lab", verifyTitle: "Verify your email to post, vote and comment", resultClass: "fl-result" });
import { getAuthState, whenReady, sendVerification, refresh, type AuthState } from "../../lib/auth";
import { isProduction } from "../../lib/env.js";
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { call } from "../../lib/call";
import { db, doc, getDoc, SITE_ID } from "../../lib/db";

export type Need = "signedOut" | "needsSignup" | "unverified" | "ok";

export function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  return name && domain ? `${name[0]}•••@${domain}` : "";
}
/** The "verify your email" line (and the prompt's body). */
export const verifyLine = (email: string) => (email ? `We sent a link to ${esc(maskEmail(email))}.` : "Add an email in Account, then verify it.");

export function makeGate({ preview: previewJson, feature, verifyTitle, resultClass }: { preview: any; feature: string; verifyTitle: string; resultClass: string }) {
  const preview = () => previewJson as any;
  const previewAs = (): "member" | "admin" | null => {
    if (isProduction) return null;
    const v = new URLSearchParams(location.search).get("as");
    return v === "member" || v === "admin" ? v : null;
  };
  const isPreview = (s: AuthState = getAuthState()) => !s.user && !!previewAs();
  const isStaff = (s: AuthState = getAuthState()) => (isPreview(s) ? previewAs() === "admin" : s.roles.includes("admin") || s.roles.includes("mod"));
  const isAdmin = (s: AuthState = getAuthState()) => (isPreview(s) ? previewAs() === "admin" : s.isAdmin);
  /** Signed up: may vote, comment and post once verified. Previews count as verified members. */
  const isMember = (s: AuthState = getAuthState()) => isPreview(s) || s.status === "verified" || s.status === "unverified";
  const isVerified = (s: AuthState = getAuthState()) => isPreview(s) || s.status === "verified";
  const meOf = (s: AuthState = getAuthState()) => (isPreview(s) ? { uid: preview().me.uid as string, handle: preview().me.handle as string, name: preview().me.name as string } : { uid: s.user?.uid || "", handle: s.profile?.handle || "", name: s.profile?.displayName || s.profile?.handle || "" });

  let a2plus: boolean | null = null;
  /** Admins who may delete: the owner, or Overseer (A2) and up. Read lazily; a failed read means no (the callable decides anyway). */
  async function canDelete(): Promise<boolean> {
    const s = getAuthState();
    if (!isAdmin(s)) return false;
    if (isPreview(s)) return preview().me.owner === true;
    if (a2plus !== null) return a2plus;
    let owner = false, grade = 0, track = "";
    try { owner = (await getDoc(doc(db, "sites", SITE_ID))).get("ownerUid") === s.user?.uid; } catch { /* not the owner as far as we can tell */ }
    try { const me: any = await call("crewMe"); grade = me?.crew?.grade || 0; track = me?.crew?.track || ""; } catch { /* no crew row */ }
    a2plus = owner || (track === "admin" && grade >= 2);
    return a2plus;
  }

  const needOf = (s: AuthState = getAuthState()): Need => (isPreview(s) ? "ok" : s.status === "signedOut" ? "signedOut" : s.status === "needsSignup" ? "needsSignup" : s.status === "unverified" ? "unverified" : "ok");

  /** Resolves true when a verified member may go ahead; otherwise shows the right step and resolves false. */
  async function requireVerified(joinTitle: string): Promise<boolean> {
    const s = await whenReady();
    if (isPreview(s)) return true;
    if (s.status === "verified") return true;
    if (s.status === "signedOut" || s.status === "needsSignup") {
      const { openSignIn } = await import("../account/dialog");
      openSignIn(s.status === "signedOut" ? { mode: "join", title: joinTitle } : {});
      return false;
    }
    verifyPrompt(s.user?.email || "");
    return false;
  }

  function verifyPrompt(email: string) {
    const m = openModal({
      title: "Verify your email",
      feature,
      content: `${modalHeader("Verify your email")}<div class="${resultClass}"><span class="bt-modal-icon" aria-hidden="true">✉️</span><b>${esc(verifyTitle)}</b><p>${verifyLine(email)}${email ? " Open it, then come back here." : ""}</p><p class="bt-hint" data-msg role="status"></p></div><div class="bt-modal-actions">${email ? '<button type="button" class="bt-btn bt-btn--secondary" data-resend>Send a new link</button><button type="button" class="bt-btn bt-btn--primary" data-done>I\'ve verified</button>' : '<a class="bt-btn bt-btn--primary" href="/account">Open Account</a>'}</div>`,
    });
    const msg = m.modal.querySelector<HTMLElement>("[data-msg]")!;
    m.modal.querySelector<HTMLButtonElement>("[data-resend]")?.addEventListener("click", async (e) => {
      const b = e.currentTarget as HTMLButtonElement;
      b.disabled = true;
      try { await sendVerification(); msg.textContent = "Sent. Check your inbox."; }
      catch { msg.textContent = "Couldn't send it. Wait a minute and try again."; b.disabled = false; }
    });
    m.modal.querySelector<HTMLButtonElement>("[data-done]")?.addEventListener("click", async () => {
      const { auth } = await import("../../lib/firebase");
      await auth.currentUser?.reload();
      await refresh({ forceToken: true });
      if (getAuthState().status === "verified") m.close();
      else msg.textContent = "Not verified yet. Open the link in the email first.";
    });
  }

  return { previewAs, isPreview, preview, isStaff, isAdmin, isMember, isVerified, meOf, canDelete, needOf, requireVerified, verifyPrompt, verifyLine, maskEmail };
}
