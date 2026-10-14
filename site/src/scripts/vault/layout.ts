// Game Vault layout behaviour: the sticky GAMEVAULT bar, the wordmark's touch power-on, the
// staff Queue button with its count, and Add a game (every Vault page opens the same dialog).
import { initStickyBar } from "../../../../shared/ui/sticky-bar.js";
import { initPowerWordmarks } from "../../../../shared/ui/wordmark.js";
import { initTilt } from "../../../../shared/ui/tilt.js";
import { initCoverFallbacks } from "../../../../shared/ui/cover.js";
import { onAuth } from "../../lib/auth";
import { isStaff } from "./gate";
import { queueCount } from "./data";

const dock = document.querySelector<HTMLElement>("[data-gv-dock]");
if (dock) initStickyBar(dock, {});
initPowerWordmarks();
initTilt();
initCoverFallbacks();

// Staff: Queue with how many items wait (one count query, refreshed when the queue page changes it).
const q = document.querySelector<HTMLAnchorElement>("[data-gv-queue]");
const qn = document.querySelector<HTMLElement>("[data-gv-queue-n]");
const qb = document.querySelector<HTMLElement>("[data-gv-queue-badge]");   // phones: the count as a badge on the icon
let counted = false;
export async function refreshQueueCount() {
  if (!qn) return;
  let n = 0;
  try { n = await queueCount(); } catch { /* no count */ }
  qn.textContent = n ? String(n) : "";
  if (qb) qb.textContent = n ? String(n) : "";
  q?.setAttribute("aria-label", n ? `Queue, ${n} waiting` : "Queue");
}
onAuth((s) => {
  const staff = s.status !== "loading" && isStaff(s);
  if (q) q.hidden = !staff;
  if (staff && !counted) { counted = true; refreshQueueCount(); }
});

// Phones: the bar's magnifier. On /games it focuses the filter bar's search (in the tap, so the keyboard opens) and scrolls the page so the
// filter bar sits under the bar; anywhere else it is a link to /games#gv-search, which does the same once the Vault is drawn (page.ts).
document.addEventListener("click", (e) => {
  const a = (e.target as Element).closest?.("[data-gv-search]");
  const input = document.querySelector<HTMLInputElement>("[data-compact-search]");
  if (!a || !input) return;
  e.preventDefault();
  focusVaultSearch(input);
});
export function focusVaultSearch(input: HTMLInputElement) {
  const fbar = input.closest<HTMLElement>("[data-fbar]"), hero = document.querySelector<HTMLElement>("[data-hero]");
  input.focus({ preventScroll: true });
  const top = hero ? hero.getBoundingClientRect().bottom + scrollY : (fbar?.getBoundingClientRect().top ?? 0) + scrollY;
  const offset = parseFloat(getComputedStyle(document.body).getPropertyValue("--bt-sticky-h")) || 0;
  scrollTo({ top: Math.max(0, top - offset), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

// Every Add a game button (the bar's, and the How it works page's) opens the same dialog.
document.addEventListener("click", async (e) => {
  if (!(e.target as Element).closest?.("[data-gv-add]")) return;
  const { openAddGame } = await import("./add");
  openAddGame();
});
