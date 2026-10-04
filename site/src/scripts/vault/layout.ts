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
let counted = false;
export async function refreshQueueCount() {
  if (!qn) return;
  try { const n = await queueCount(); qn.textContent = n ? String(n) : ""; } catch { qn.textContent = ""; }
}
onAuth((s) => {
  const staff = s.status !== "loading" && isStaff(s);
  if (q) q.hidden = !staff;
  if (staff && !counted) { counted = true; refreshQueueCount(); }
});

document.querySelector("[data-gv-add]")?.addEventListener("click", async () => {
  const { openAddGame } = await import("./add");
  openAddGame();
});
