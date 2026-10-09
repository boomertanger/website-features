// Control Room layout behaviour: the sticky CONTROLROOM bar, the seg navs, the wordmark's touch power-on, and which part of a gated page shows
// (LiveLayout.astro): .lv[data-access] is  loading (skeleton) · join (visitors) · signup (mid-signup) · gate (signed in, not allowed) · page.
// Who may open it (docs/specs/control-room.md §2): the owner and A2 Overseer and up. Role checks here only control what is shown; the callables and
// Firestore rules are the real protection. The "Checklist templates" link is added to the bar for the owner's uid only (never an empty slot).
import { initSegNavs } from "../../../../shared/ui/seg-nav.js";
import { initPowerWordmarks } from "../../../../shared/ui/wordmark.js";
import { initStickyBar } from "../../../../shared/ui/sticky-bar.js";
import { onAuth, type AuthState } from "../../lib/auth";
import { isProduction } from "../../lib/env.js";
import type { Role } from "./model";

initSegNavs();
initPowerWordmarks();
const dock = document.querySelector<HTMLElement>("[data-lv-dock]");
const bar = dock ? initStickyBar(dock, {}) : null;

/**
 * Preview (non-production only): signed out with ?as=admin (the owner) or ?as=a2 (an Overseer: owner-only parts hidden) the pages show sample data from
 * src/data/preview-live-control.json instead of calling the callables. A real signed-in session always wins (api.ts decides). Never true on production.
 */
export const livePreview = (): Role | null => {
  if (isProduction) return null;
  const v = new URLSearchParams(location.search).get("as");
  return v === "admin" ? "owner" : v === "a2" ? "a2" : null;
};
const previewState = (): AuthState | null => {
  const p = livePreview();
  return p ? ({ status: "verified", user: null, profile: null, account: null, roles: ["admin"], isAdmin: true } as unknown as AuthState) : null;
};

const root = document.querySelector<HTMLElement>("[data-lv]");
let roleCache: Promise<Role | null> | null = null;
let roleFor = "";
async function roleOf(s: AuthState): Promise<Role | null> {
  const key = s.user?.uid ?? "preview";
  if (!roleCache || roleFor !== key) { roleFor = key; roleCache = import("./api").then((m) => m.detectRole(s)); }
  return roleCache;
}

function addOwnerLinks() {
  document.querySelectorAll<HTMLElement>("[data-lv-owner-slot]").forEach((slot) => {
    if (slot.querySelector("[data-lv-owner-link]")) return;
    const a = document.createElement("a");
    a.setAttribute("data-lv-owner-link", "");
    a.href = "/live/control/checklist";
    if (location.pathname.replace(/\/$/, "") === "/live/control/checklist") a.setAttribute("aria-current", "page");
    const q = location.search;
    if (q && !isProduction) a.href += q;
    if (slot.dataset.icon === "1") { a.setAttribute("aria-label", "Checklist templates"); a.title = "Checklist templates"; a.innerHTML = `<svg aria-hidden="true"><use href="#i-bulb"/></svg>`; }
    else a.textContent = "Checklist templates";
    slot.append(a);
    slot.hidden = false;
  });
  initSegNavs();
}

let shown = false;
let granted: { state: AuthState; role: Role } | null = null;
if (root && root.dataset.access !== "page") {
  let seq = 0;
  onAuth((real) => {
    const s = real.status === "signedOut" && previewState() ? previewState()! : real;
    const mine = ++seq;
    const set = (access: string, role: Role | null = null) => {
      if (mine !== seq) return;
      root.dataset.access = access;
      root.querySelector<HTMLElement>("[data-lv-gate-visitor]")!.hidden = access !== "join";
      root.querySelector<HTMLElement>("[data-lv-gate-signup]")!.hidden = access !== "signup";
      if (role === "owner") addOwnerLinks();
      bar?.sync();
      if (access === "page" && !shown) { shown = true; granted = { state: s, role: role! }; document.dispatchEvent(new CustomEvent("lv:access", { detail: granted })); }
    };
    if (s.status === "loading") return set("loading");
    if (s.status === "signedOut") return set("join");
    if (s.status === "needsSignup") return set("signup");
    set("loading");
    const ownerOnly = root.hasAttribute("data-owner-only");
    roleOf(s).then((role) => set(role && (!ownerOnly || role === "owner") ? "page" : "gate", role), () => set("gate"));
  });
}

/** Runs fn once the page is allowed, with the viewer's role ("owner" or "a2"). */
export function onAccess(fn: (s: AuthState, role: Role) => void) {
  let done = false;
  const go = (d: { state: AuthState; role: Role }) => { if (done) return; done = true; fn(d.state, d.role); };
  if (granted) return go(granted);
  document.addEventListener("lv:access", (e) => go((e as CustomEvent<{ state: AuthState; role: Role }>).detail), { once: true });
}
