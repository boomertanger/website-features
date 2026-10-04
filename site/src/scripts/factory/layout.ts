// Fun Factory layout behaviour: the sticky FUNFACTORY bar, the seg navs, the wordmark's touch
// power-on, and which part of a gated page shows (FactoryLayout.astro): .ff[data-access] is
//   loading (skeleton) · join (visitors) · signup (mid-signup) · gate (signed in, not crew, on a
//   crew-only page) · page. The ff:access event fires with the auth state once the page is allowed.
import { initSegNavs } from "../../../../shared/ui/seg-nav.js";
import { initPowerWordmarks } from "../../../../shared/ui/wordmark.js";
import { initStickyBar } from "../../../../shared/ui/sticky-bar.js";
import { onAuth, type AuthState } from "../../lib/auth";

initSegNavs();
initPowerWordmarks();
const dock = document.querySelector<HTMLElement>("[data-ff-dock]");
const bar = dock ? initStickyBar(dock, { progress: !!document.querySelector(".tl-wrap") }) : null;

export const isCrew = (s: AuthState) => s.isAdmin || s.roles.includes("mod") || s.roles.includes("admin");

const root = document.querySelector<HTMLElement>("[data-ff]");
if (root && root.dataset.access !== "page") {
  const crewOnly = root.hasAttribute("data-crew-only");
  let shown = false;
  onAuth((s) => {
    const access = s.status === "loading" ? "loading"
      : s.status === "signedOut" ? "join"
      : s.status === "needsSignup" ? "signup"
      : crewOnly && !isCrew(s) ? "gate" : "page";
    root.dataset.access = access;
    root.querySelector<HTMLElement>("[data-ff-gate-visitor]")!.hidden = access !== "join";
    root.querySelector<HTMLElement>("[data-ff-gate-signup]")!.hidden = access !== "signup";
    bar?.sync();
    if (access === "page" && !shown) {
      shown = true;
      document.dispatchEvent(new CustomEvent("ff:access", { detail: s }));
    }
  });
}

/** Runs fn once the page is allowed (members, or crew on crew-only pages). */
export function onAccess(fn: (s: AuthState) => void) {
  let done = false;
  const go = (s: AuthState) => { if (!done) { done = true; fn(s); } };
  document.addEventListener("ff:access", (e) => go((e as CustomEvent<AuthState>).detail), { once: true });
  onAuth((s) => { if (root?.dataset.access === "page" && s.status !== "loading") go(s); });
}
