// /admin: the Control Room card (docs/specs/control-room.md §2): a door to /live/control for the owner and A2 Overseers and up. Display only: the
// controls page checks again, and so do the callables and the rules. Preview (non-production, signed out, ?as=admin or ?as=a2) shows it too.
import { whenReady } from "../../lib/auth";
import { detectRole } from "../live/api";

const card = document.querySelector<HTMLElement>("[data-live-card]");
whenReady().then(async (s) => {
  if (!card) return;
  try { if (await detectRole(s)) card.hidden = false; } catch { /* no card */ }
});
