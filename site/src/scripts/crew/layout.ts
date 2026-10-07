// Mod Machina layout behaviour: the sticky MOD MACHINA bar, the seg navs, the wordmark's touch power-on, and
// which part of a gated page shows (CrewLayout.astro): .cr[data-access] is
//   loading (skeleton) · join (visitors) · signup (mid-signup) · gate (signed in, not allowed) · page.
// The cr:access event fires with the auth state once the page is allowed. Role checks here only control
// what is shown; the callables and Firestore rules are the real protection.
import { initSegNavs } from "../../../../shared/ui/seg-nav.js";
import { initPowerWordmarks } from "../../../../shared/ui/wordmark.js";
import { initStickyBar } from "../../../../shared/ui/sticky-bar.js";
import { onAuth, type AuthState } from "../../lib/auth";

initSegNavs();
initPowerWordmarks();
const dock = document.querySelector<HTMLElement>("[data-cr-dock]");
const bar = dock ? initStickyBar(dock, { progress: !!document.querySelector(".tl-wrap") }) : null;

export const isCrew = (s: AuthState) => s.isAdmin || s.roles.includes("mod") || s.roles.includes("admin");
export const isAdmin = (s: AuthState) => s.isAdmin || s.roles.includes("admin");

const root = document.querySelector<HTMLElement>("[data-cr]");
if (root && root.dataset.access !== "page") {
  const crewOnly = root.hasAttribute("data-crew-only"), adminOnly = root.hasAttribute("data-admin-only");
  let shown = false;
  onAuth((s) => {
    const allowed = adminOnly ? isAdmin(s) : crewOnly ? isCrew(s) : true;
    const access = s.status === "loading" ? "loading"
      : s.status === "signedOut" ? "join"
      : s.status === "needsSignup" ? "signup"
      : !allowed ? "gate" : "page";
    root.dataset.access = access;
    root.querySelector<HTMLElement>("[data-cr-gate-visitor]")!.hidden = access !== "join";
    root.querySelector<HTMLElement>("[data-cr-gate-signup]")!.hidden = access !== "signup";
    bar?.sync();
    if (access === "page" && !shown) {
      shown = true;
      document.dispatchEvent(new CustomEvent("cr:access", { detail: s }));
    }
  });
}

/** Runs fn once the page is allowed. On ungated pages it runs once auth has settled (signed out or not). */
export function onAccess(fn: (s: AuthState) => void) {
  let done = false;
  const go = (s: AuthState) => { if (!done) { done = true; fn(s); } };
  document.addEventListener("cr:access", (e) => go((e as CustomEvent<AuthState>).detail), { once: true });
  onAuth((s) => { if (root?.dataset.access === "page" && s.status !== "loading") go(s); });
}
