// Cloud Stash layout behaviour: the sticky CLOUDSTASH bar, the wordmark's touch power-on, and which part of the tool page shows (StashLayout.astro): .cs-page[data-access] is
// loading (skeleton) · join (visitors: the sign-in dialog opens once, then a short gate) · page (admins, or the non-production ?as=admin preview). Signed-in members are sent to
// How it works. The cs:access event fires once the page is allowed. Display only.
import { initStickyBar } from "../../../../shared/ui/sticky-bar.js";
import { initPowerWordmarks } from "../../../../shared/ui/wordmark.js";
import { onAuth, type AuthState } from "../../lib/auth";
import { isPreview } from "./gate";

const dock = document.querySelector<HTMLElement>("[data-cs-dock]");
const bar = dock ? initStickyBar(dock, { progress: false }) : null;
initPowerWordmarks();

const root = document.querySelector<HTMLElement>("[data-cs-page]");
if (root && root.hasAttribute("data-admin-only")) {
  let shown = false;
  onAuth((s) => {
    const access = isPreview(s) ? "page" : s.status === "loading" ? "loading" : s.status === "signedOut" || s.status === "needsSignup" ? "join" : s.isAdmin ? "page" : "member";
    if (access === "member") { location.replace("/cloud-stash/how-it-works"); return; }
    root.dataset.access = access;
    bar?.sync();
    if (access === "page" && !shown) { shown = true; document.dispatchEvent(new CustomEvent("cs:access", { detail: s })); }
  });
}

/** Runs fn once the tool page is allowed. */
export function onAccess(fn: (s: AuthState) => void) {
  let done = false;
  const go = (s: AuthState) => { if (!done) { done = true; fn(s); } };
  document.addEventListener("cs:access", (e) => go((e as CustomEvent<AuthState>).detail), { once: true });
  onAuth((s) => { if (root?.dataset.access === "page" && s.status !== "loading") go(s); });
}
