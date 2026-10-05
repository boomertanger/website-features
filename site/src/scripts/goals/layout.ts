// Goal Tracker layout behaviour: the sticky GOALTRACKER bar, and which part of a gated page shows
// (GoalsLayout.astro): .gt[data-access] is
//   loading (skeleton) · join (visitors) · signup (mid-signup) · gate (signed in, not an admin, on the admin page) · page.
// The gt:access event fires with the auth state once the page is allowed. The gate's teaser card is read
// from public/goalTrackerTeaser (anyone can) the first time a gate shows.
import { initStickyBar } from "../../../../shared/ui/sticky-bar.js";
import { onAuth, type AuthState } from "../../lib/auth";
import { fillTeasers } from "./teaser";

const dock = document.querySelector<HTMLElement>("[data-gt-dock]");
const bar = dock ? initStickyBar(dock, { progress: !!document.querySelector(".tl-wrap") }) : null;

const root = document.querySelector<HTMLElement>("[data-gt]");
if (root) {
  const adminOnly = root.hasAttribute("data-admin-only");
  let shown = false, teased = false;
  onAuth((s) => {
    const access = s.status === "loading" ? "loading"
      : s.status === "signedOut" ? "join"
      : s.status === "needsSignup" ? "signup"
      : adminOnly && !s.isAdmin ? "gate" : "page";
    root.dataset.access = access;
    root.querySelector<HTMLElement>("[data-gt-gate-visitor]")!.hidden = access !== "join";
    root.querySelector<HTMLElement>("[data-gt-gate-signup]")!.hidden = access !== "signup";
    bar?.sync();
    if (!teased && (access === "join" || access === "signup")) { teased = true; void fillTeasers(root); }
    if (access === "page" && !shown) {
      shown = true;
      document.dispatchEvent(new CustomEvent("gt:access", { detail: s }));
    }
  });
}

/** Runs fn once the page is allowed (signed-up members, or admins on the admin page). */
export function onAccess(fn: (s: AuthState) => void) {
  let done = false;
  const go = (s: AuthState) => { if (!done) { done = true; fn(s); } };
  document.addEventListener("gt:access", (e) => go((e as CustomEvent<AuthState>).detail), { once: true });
  onAuth((s) => { if (root?.dataset.access === "page" && s.status !== "loading") go(s); });
}
