// A vote tap (docs/specs/feature-lab.md §2, §7), shared by the board, the roadmap cards and the idea dialog. Visitors nudge the Join strip
// (or get the Join dialog inside a dialog); members finishing signup finish it; members with an unverified email get the verify prompt;
// verified members vote or take the vote back, with the vote pop when it goes on. The callable refuses a vote on Shipped / Declined and
// over the limit ("Slow down…"); the message shows as a toast.
import { toast } from "../../../../shared/ui/toast.js";
import { getAuthState, whenReady } from "../../lib/auth";
import { messageFor } from "../../lib/errors";
import { vote, S } from "./store";
import { needOf, verifyPrompt } from "./gate";
import { pop } from "./ui";

export function nudgeJoin() {
  document.querySelectorAll<HTMLElement>("[data-join]").forEach((j) => { j.classList.remove("is-nudge"); void j.offsetWidth; j.classList.add("is-nudge"); });
}

/** `after` redraws the page; the pop plays on the freshly drawn button when the vote went on. */
export async function handleVote(btn: Element, id: string, after: () => void | Promise<void>) {
  const s = await whenReady();
  const need = needOf(s);
  if (need === "signedOut") {
    if (btn.closest(".bt-portal")) { const { openSignIn } = await import("../account/dialog"); openSignIn({ mode: "join", title: "Join to vote" }); }
    else nudgeJoin();
    return;
  }
  if (need === "needsSignup") { const { openSignIn } = await import("../account/dialog"); openSignIn({}); return; }
  if (need === "unverified") { verifyPrompt(s.user?.email || ""); return; }
  if ((btn as HTMLButtonElement).disabled) return;
  (btn as HTMLButtonElement).disabled = true;
  try {
    const was = S.voted.has(id);
    const res = await vote(id);
    await after();
    if (res.voted && !was) document.querySelectorAll(`[data-vote="${CSS.escape(id)}"]`).forEach(pop);
  } catch (err) {
    toast(messageFor(err, "Couldn't save your vote. Try again."), { kind: "error" });
    (btn as HTMLButtonElement).disabled = false;
  }
  void getAuthState;
}
