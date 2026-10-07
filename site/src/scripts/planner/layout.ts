// Scream Planner layout behaviour: the sticky SCREAM PLANNER bar, the seg navs, the wordmark's touch power-on, and
// which part of a gated page shows (PlannerLayout.astro): .pl[data-access] is
//   loading (skeleton) · join (visitors) · signup (mid-signup) · gate (signed in, not allowed) · page.
// The pl:access event fires with the auth state once the page is allowed. Role checks here only control
// what is shown; the callables and Firestore rules are the real protection.
import { initSegNavs } from "../../../../shared/ui/seg-nav.js";
import { initPowerWordmarks } from "../../../../shared/ui/wordmark.js";
import { initStickyBar } from "../../../../shared/ui/sticky-bar.js";
import { onAuth, getAuthState, type AuthState } from "../../lib/auth";
import { isProduction } from "../../lib/env.js";

initSegNavs();
initPowerWordmarks();
const dock = document.querySelector<HTMLElement>("[data-pl-dock]");
const bar = dock ? initStickyBar(dock, { progress: !!document.querySelector(".tl-wrap") }) : null;

export const isCrew = (s: AuthState) => s.isAdmin || s.roles.includes("mod") || s.roles.includes("admin");
export const isAdmin = (s: AuthState) => s.isAdmin || s.roles.includes("admin");

/**
 * Preview (non-production only): signed out with ?as=member or ?as=admin, pages show sample data from
 * site/src/data/preview-planner-*.json (on /schedule/plan, ?as=member is a mod, so the crew view shows) instead of calling the callables, so layouts can be checked without an
 * account. A real signed-in member always wins. Never true on production.
 */
export const previewAs = (): "member" | "admin" | null => {
  if (isProduction) return null;
  const v = new URLSearchParams(location.search).get("as");
  return v === "member" || v === "admin" ? v : null;
};
const previewState = (): AuthState | null => {
  const p = previewAs();
  return p ? ({ status: "verified", user: null, profile: null, account: null, roles: p === "admin" ? ["admin", "mod"] : location.pathname.startsWith("/schedule/plan") ? ["mod"] : [], isAdmin: p === "admin" } as unknown as AuthState) : null;
};

const root = document.querySelector<HTMLElement>("[data-pl]");
if (root && root.dataset.access !== "page") {
  const crewOnly = root.hasAttribute("data-crew-only"), adminOnly = root.hasAttribute("data-admin-only");
  let shown = false;
  onAuth((real) => {
    const s = real.status === "signedOut" && previewState() ? previewState()! : real;
    const allowed = adminOnly ? isAdmin(s) : crewOnly ? isCrew(s) : true;
    const access = s.status === "loading" ? "loading"
      : s.status === "signedOut" ? "join"
      : s.status === "needsSignup" ? "signup"
      : !allowed ? "gate" : "page";
    root.dataset.access = access;
    root.querySelector<HTMLElement>("[data-pl-gate-visitor]")!.hidden = access !== "join";
    root.querySelector<HTMLElement>("[data-pl-gate-signup]")!.hidden = access !== "signup";
    bar?.sync();
    if (access === "page" && !shown) {
      shown = true;
      document.dispatchEvent(new CustomEvent("pl:access", { detail: s }));
    }
  });
}

const gatedPage = !!root && (root.hasAttribute("data-members-only") || root.hasAttribute("data-crew-only") || root.hasAttribute("data-admin-only"));

/**
 * Runs fn once the page is allowed. On gated pages that is once, when the gate opens. On open pages (join,
 * vote, the roster, the board) fn runs again every time the member changes (signed out, signed up, verified,
 * a different account), so a state that arrives late is never missed: the page used to render the visitor
 * card from the first state it saw and keep it. A signed-out state is only acted on after a short pause
 * (and if it still holds), so a brief signed-out reading while Firebase restores the session can't flash it.
 */
export function onAccess(fn: (s: AuthState) => void) {
  if (gatedPage) {
    let done = false;
    const go = (s: AuthState) => { if (!done) { done = true; fn(s); } };
    document.addEventListener("pl:access", (e) => go((e as CustomEvent<AuthState>).detail), { once: true });
    onAuth((real) => { const s = real.status === "signedOut" && previewState() ? previewState()! : real; if (root?.dataset.access === "page" && s.status !== "loading") go(s); });
    return;
  }
  let last = "", timer = 0;
  const emit = (s: AuthState) => {
    const key = `${s.status}:${s.user?.uid ?? ""}`;
    if (key === last) return;
    last = key;
    fn(s);
  };
  onAuth((real) => {
    clearTimeout(timer);
    if (real.status === "loading") return;
    if (real.status !== "signedOut") return emit(real);
    const p = previewState();
    if (p) return emit(p);
    timer = window.setTimeout(() => { const now = getAuthState(); if (now.status === "signedOut") emit(now); }, 700);
  });
}
