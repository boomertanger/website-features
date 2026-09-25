// shared/ui/effects.js — pointer-driven visual effects.

/**
 * initRowSpotlight(root)
 * Makes the purple spotlight on .bt-row--clickable follow the mouse.
 * One delegated listener on the feature root; works for rows rendered later.
 * Touch and pen input are ignored (the hover effect is mouse-only in CSS too).
 */
export function initRowSpotlight(root) {
  if (!root || root.dataset.btSpotlight) return;
  root.dataset.btSpotlight = "1";
  root.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    const row = e.target.closest(".bt-row--clickable");
    if (!row || !root.contains(row)) return;
    const r = row.getBoundingClientRect();
    row.style.setProperty("--bt-mx", `${e.clientX - r.left}px`);
    row.style.setProperty("--bt-my", `${e.clientY - r.top}px`);
  }, { passive: true });
}
