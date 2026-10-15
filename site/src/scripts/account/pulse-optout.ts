// site/src/scripts/account/pulse-optout.ts — Account › Privacy › "Don't count my visits" (Traffic Pulse, docs/specs/traffic-pulse.md §3A).
// The member's own preference on users/{uid}.pulseOptOut: the one field the rules let a member write on their users doc (a boolean, nothing
// else changes). The beacon (scripts/pulse/beacon.ts) reads it at sign-in and keeps a local copy ("bt.pulse.off") so a signed-out visit on the
// same browser isn't counted either. Turning it on stops counting at once (the bt:pulse-optout event).
import { onAuth } from "../../lib/auth";
import { messageFor } from "../../lib/errors";

const btn = document.querySelector<HTMLButtonElement>("[data-pulse-optout]");
const note = document.querySelector<HTMLElement>("[data-pulse-optout-note]");
const local = (on: boolean) => { try { if (on) localStorage.setItem("bt.pulse.off", "1"); else localStorage.removeItem("bt.pulse.off"); } catch { /* storage blocked */ } };

if (btn) {
  let uid: string | null = null;
  onAuth((s) => {
    uid = s.user?.uid || null;
    const on = !!(s.account as { pulseOptOut?: boolean } | null)?.pulseOptOut;
    if (!btn.dataset.busy) btn.setAttribute("aria-checked", String(on));
    if (s.account) local(on);
  });
  btn.addEventListener("click", async () => {
    if (btn.dataset.busy || !uid) return;
    const on = btn.getAttribute("aria-checked") !== "true";
    btn.dataset.busy = "1";
    btn.setAttribute("aria-checked", String(on));
    if (note) note.textContent = "";
    try {
      const { db, doc } = await import("../../lib/db");
      const { updateDoc } = await import("firebase/firestore/lite");
      await updateDoc(doc(db, "users", uid), { pulseOptOut: on });
      local(on);
      window.dispatchEvent(new CustomEvent("bt:pulse-optout", { detail: on }));
      if (note) note.textContent = on ? "Saved. Your visits aren't counted from now on." : "Saved. Your visits count again, as anonymous numbers.";
    } catch (err) {
      btn.setAttribute("aria-checked", String(!on));
      if (note) note.textContent = messageFor(err);
    } finally { delete btn.dataset.busy; }
  });
}
