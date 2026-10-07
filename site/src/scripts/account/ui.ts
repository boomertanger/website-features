// Account UI on every page (small; the sign-in dialog loads on demand):
//   [data-signin]          opens the sign-in dialog: "join" (every Join free button, the
//                          default) on the Join tab, "signin" (Log in) on the Sign in
//                          tab, "signup" resumes the signup steps; an optional
//                          data-signin-title replaces the Join tab's heading
//   [data-me="..."]        filled from the signed-in member: displayName, handle,
//                          avatar (initials or opted-in photo), email
//   [data-account-menu]    the header avatar button and its menu
//   [data-verify-banner]   verify-your-email banner: resend, or add an email (Twitch)
// Signed out (or previewing with ?as=), the static preview content stays as built.
import { onAuth, whenReady, signOut, sendVerification, type AuthState } from "../../lib/auth";
import { escapeHtml } from "../../../../shared/ui/dom.js";

import { CONTINUE_KEY } from "../../lib/auth-keys";

export async function openDialog(kind = "", title?: string) {
  const { openSignIn } = await import("./dialog");
  if (kind === "signup") openSignIn({ screen: "birthday" });
  else openSignIn({ mode: kind === "signin" ? "signin" : "join", title });
}

document.addEventListener("click", (ev) => {
  const t = (ev.target as Element | null)?.closest<HTMLElement>("[data-signin]");
  if (!t) return;
  ev.preventDefault();
  void openDialog(t.dataset.signin, t.dataset.signinTitle);
});

// ---- member details ----
function avatarHtml(s: AuthState) {
  const a = s.profile?.avatar;
  if (a?.type === "photo" && a.url) return `<img src="${escapeHtml(a.url)}" alt="" referrerpolicy="no-referrer" />`;
  return escapeHtml(a?.initials || (s.profile?.displayName || "?").slice(0, 2).toUpperCase());
}
onAuth((s) => {
  if (!s.user || !s.profile || (s.status !== "verified" && s.status !== "unverified")) return;
  document.querySelectorAll<HTMLElement>("[data-me]").forEach((el) => {
    const k = el.dataset.me;
    if (k === "displayName") el.textContent = s.profile!.displayName;
    else if (k === "handle") el.textContent = `@${s.profile!.handle}`;
    else if (k === "email") el.textContent = s.user!.email || "";
    else if (k === "avatar") el.innerHTML = avatarHtml(s);
  });
});

// ---- avatar menu ----
document.querySelectorAll<HTMLElement>("[data-account-menu]").forEach((wrap) => {
  const btn = wrap.querySelector<HTMLButtonElement>("[aria-haspopup]")!;
  const menu = wrap.querySelector<HTMLElement>(".bt-account-menu")!;
  const set = (open: boolean) => {
    menu.hidden = !open; btn.setAttribute("aria-expanded", String(open));
    if (open) document.dispatchEvent(new CustomEvent("bt:overlay-open", { detail: { source: "account" } }));   // closes any nav panel or the More sheet
  };
  document.addEventListener("bt:overlay-open", (ev) => { if ((ev as CustomEvent).detail?.source !== "account" && !menu.hidden) set(false); });
  btn.addEventListener("click", () => set(menu.hidden));
  document.addEventListener("click", (ev) => { if (!menu.hidden && !wrap.contains(ev.target as Node)) set(false); });
  wrap.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && !menu.hidden) { set(false); btn.focus(); } });
});
document.addEventListener("click", async (ev) => {
  if (!(ev.target as Element | null)?.closest("[data-signout]")) return;
  await signOut();
  if (location.pathname.startsWith("/account")) location.href = "/";
  else location.reload();
});

// ---- verify banner ----
const banner = document.querySelector<HTMLElement>("[data-verify-banner]");
if (banner) {
  onAuth((s) => {
    const hasEmail = !!s.user?.email;
    banner.querySelectorAll<HTMLElement>("[data-verify-email]").forEach((el) => { el.hidden = !hasEmail; });
    banner.querySelectorAll<HTMLElement>("[data-verify-noemail]").forEach((el) => { el.hidden = hasEmail; });
  });
  const resend = banner.querySelector<HTMLButtonElement>("[data-verify-resend]");
  resend?.addEventListener("click", async () => {
    resend.disabled = true;
    try {
      await sendVerification();
      resend.textContent = "Sent. Check your inbox";
    } catch (err) {
      resend.textContent = (err as { code?: string }).code === "auth/too-many-requests" ? "Wait a minute, then try again" : "Couldn't send. Try again";
    }
    setTimeout(() => { resend.disabled = false; resend.textContent = "Resend email"; }, 30000);
  });
}

// ---- resume the signup steps after a redirect sign-in (Twitch, email link) ----
whenReady().then((s) => {
  let resume = false;
  try { resume = sessionStorage.getItem(CONTINUE_KEY) === "1"; sessionStorage.removeItem(CONTINUE_KEY); } catch { /* none */ }
  if (resume && s.status === "needsSignup") void openDialog("signup");
});
