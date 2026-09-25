// shared/ui/admin-menu.js — the narrow-width admin dropdown.
//
// Expected markup inside a feature root (same DOM works inline at wide widths):
//   <div class="bt-admin">
//     <button class="bt-admin-menu-toggle" aria-label="Admin menu" aria-expanded="false">…login icon…</button>
//     <div class="bt-admin-row">
//       <div class="bt-admin-section"><span class="bt-admin-label">Admin access</span><button class="bt-signin-btn">…</button></div>
//       <div class="bt-admin-section"><span class="bt-admin-label">Signed in as</span><span class="bt-admin-pill">…</span><button class="bt-signout-row">…</button></div>
//     </div>
//   </div>

export const LOGIN_ICON =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>';

export const SIGNOUT_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>';

export const PENCIL_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path></svg>';

export const SHIELD_ICON =
  '<svg viewBox="0 0 24 24" stroke="none" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>';

/**
 * initAdminMenu(root) wires the toggle, outside-click, and Escape.
 * Returns { close, sync }. Call sync() after changing any control's .hidden;
 * it hides the trigger when nothing is visible and sets .bt-has-admin-trigger
 * on the root (used to shrink the wordmark at narrow widths).
 */
export function initAdminMenu(root) {
  const toggle = root.querySelector(".bt-admin-menu-toggle");
  const row = root.querySelector(".bt-admin-row");
  if (!toggle || !row) return { close() {}, sync() {} };

  const isOpen = () => row.classList.contains("is-open");
  function setOpen(open) {
    row.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    if (open) {
      // The dropdown anchors to the right edge of .bt-topnav so it never runs
      // off the left side; point its caret back at the trigger.
      const nav = toggle.closest(".bt-topnav") || row.parentElement;
      const n = nav.getBoundingClientRect();
      const t = toggle.getBoundingClientRect();
      row.style.setProperty("--bt-caret-right", `${Math.round(n.right - (t.left + t.width / 2) - 7)}px`);
    }
  }

  const container = toggle.closest(".bt-admin") || root;
  toggle.addEventListener("click", () => setOpen(!isOpen()));
  // Close on any click outside this admin block. No stopPropagation, so the
  // feature's own delegated click handlers still see clicks inside the menu.
  document.addEventListener("click", (e) => {
    if (isOpen() && !container.contains(e.target)) setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) {
      setOpen(false);
      toggle.focus();
    }
  });

  function sync() {
    const controls = row.querySelectorAll(".bt-admin-section > :not(.bt-admin-label)");
    const hasAnything = [...controls].some((el) => !el.hidden);
    toggle.hidden = !hasAnything;
    root.classList.toggle("bt-has-admin-trigger", hasAnything);
    if (!hasAnything) setOpen(false);
  }
  sync();

  return { close: () => setOpen(false), sync };
}
