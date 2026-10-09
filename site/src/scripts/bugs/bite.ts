// A "bit me too" tap (docs/specs/bug-zapper.md §2, §7), shared by the board, the board cards' dialogs and the report dialog. Visitors nudge the Join strip (or get the Join
// dialog inside a dialog); members finishing signup finish it; members with an unverified email get the verify prompt; verified members add or take back their bite, with
// the count pop when it goes on. The callable refuses a private, hidden, own, fixed, won't fix or duplicate report and an over-limit member ("Slow down…"); the message shows as a toast.
import { toast } from "../../../../shared/ui/toast.js";
import { whenReady } from "../../lib/auth";
import { messageFor } from "../../lib/errors";
import { meToo, S } from "./store";
import { needOf, verifyPrompt } from "./gate";
import { pop } from "./ui";

export function nudgeJoin() {
  document.querySelectorAll<HTMLElement>("[data-join]").forEach((j) => { j.classList.remove("is-nudge"); void j.offsetWidth; j.classList.add("is-nudge"); });
}

/** `after` redraws the page; the pop plays on the freshly drawn button when the bite went on. */
export async function handleBite(btn: Element, id: string, after: () => void | Promise<void>) {
  const s = await whenReady();
  const need = needOf(s);
  if (need === "signedOut") {
    if (btn.closest(".bt-portal")) { const { openSignIn } = await import("../account/dialog"); openSignIn({ mode: "join", title: "Join to report bugs" }); }
    else nudgeJoin();
    return;
  }
  if (need === "needsSignup") { const { openSignIn } = await import("../account/dialog"); openSignIn({}); return; }
  if (need === "unverified") { verifyPrompt(s.user?.email || ""); return; }
  if ((btn as HTMLButtonElement).disabled) return;
  (btn as HTMLButtonElement).disabled = true;
  try {
    const was = S.bit.has(id);
    const res = await meToo(id);
    await after();
    if (res.on && !was) document.querySelectorAll(`[data-bite="${CSS.escape(id)}"]`).forEach(pop);
  } catch (err) {
    toast(messageFor(err, "Couldn't save that. Try again."), { kind: "error" });
    (btn as HTMLButtonElement).disabled = false;
  }
}
