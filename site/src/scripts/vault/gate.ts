// Who may do a member action in the Vault (docs/specs/game-vault.md §2): visitors get the Join
// dialog with the action's own title, members part-way through signup finish it, members whose
// email isn't verified get the verify prompt (round 1 D1m). Client checks only decide what's
// shown; the callables check again.
import { getAuthState, whenReady, sendVerification, refresh, type AuthState } from "../../lib/auth";
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { esc } from "./ui";

export const isStaff = (s: AuthState = getAuthState()) => s.roles.includes("admin") || s.roles.includes("mod");
export const isAdmin = (s: AuthState = getAuthState()) => s.isAdmin;
export const handleOf = (s: AuthState = getAuthState()) => s.profile?.handle || "";

/** Resolves true when a verified member may go ahead; otherwise shows the right step and resolves false. */
export async function requireVerified(joinTitle: string): Promise<boolean> {
  const s = await whenReady();
  if (s.status === "verified") return true;
  if (s.status === "signedOut" || s.status === "needsSignup") {
    const { openSignIn } = await import("../account/dialog");
    openSignIn(s.status === "signedOut" ? { mode: "join", title: joinTitle } : {});
    return false;
  }
  verifyPrompt(s.user?.email || "");
  return false;
}

function masked(email: string) {
  const [name, domain] = email.split("@");
  return name && domain ? `${name[0]}•••@${domain}` : "your email";
}

export function verifyPrompt(email: string) {
  const m = openModal({
    title: "Verify your email",
    feature: "game-vault",
    content: `${modalHeader("Verify your email")}<div class="gv-result"><span class="bt-modal-icon" aria-hidden="true">✉️</span><b>Verify your email to add games</b><p>We sent a link to ${esc(masked(email))}. Open it, then come back here.</p><p class="bt-hint" data-msg role="status"></p></div><div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-resend>Resend email</button><button type="button" class="bt-btn bt-btn--primary" data-done>I've verified</button></div>`,
  });
  const msg = m.modal.querySelector<HTMLElement>("[data-msg]")!;
  m.modal.querySelector<HTMLButtonElement>("[data-resend]")!.addEventListener("click", async (e) => {
    const b = e.currentTarget as HTMLButtonElement;
    b.disabled = true;
    try { await sendVerification(); msg.textContent = "Sent. Check your inbox."; }
    catch { msg.textContent = "Couldn't send it. Wait a minute and try again."; b.disabled = false; }
  });
  m.modal.querySelector<HTMLButtonElement>("[data-done]")!.addEventListener("click", async () => {
    const { auth } = await import("../../lib/firebase");
    await auth.currentUser?.reload();
    await refresh({ forceToken: true });
    if (getAuthState().status === "verified") m.close();
    else msg.textContent = "Not verified yet. Open the link in the email first.";
  });
}
