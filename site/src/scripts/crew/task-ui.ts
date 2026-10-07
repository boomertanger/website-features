// The task board's rows and actions, shared by /crew/hq (a short strip) and /crew/tasks (the full board).
// docs/specs/mod-machina.md §4a: Gears are paid once, when SOMEONE ELSE confirms (the poster, or an Overseer and
// above). Display rules here only decide which buttons show; taskClaim, taskDone and taskConfirm check on the server.
import { act, esc, previewData, type Ctx, type Task } from "./data";
import { messageFor } from "../../lib/errors";
import { toast } from "../../../../shared/ui/toast.js";

const who = (h: string | null | undefined, uid: string, ctx: Ctx) => (uid === ctx.uid ? "you" : h ? `@${h}` : "someone");

/** What this row says under the title. */
function sub(t: Task, ctx: Ctx): string {
  const poster = t.postedBy === ctx.uid ? "you" : t.postedByHandle ? `@${t.postedByHandle}` : "a Sentinel";
  switch (t.status) {
    case "open": return `Posted by ${esc(poster)} · open`;
    case "claimed": return t.claimedBy === ctx.uid ? "You claimed this" : `Claimed by ${esc(who(t.claimedByHandle, t.claimedBy || "", ctx))}`;
    case "done": return `Done by ${esc(who(t.claimedByHandle, t.claimedBy || "", ctx))} · posted by ${esc(poster)}`;
    default: return `Done by ${esc(who(t.claimedByHandle, t.claimedBy || "", ctx))} · confirmed`;
  }
}

/** The right-hand side: Gears and the one thing you can do (or the state it's in). */
function side(t: Task, ctx: Ctx): string {
  const g = `<span class="hq-g">+${t.gears}<small> Gears</small></span>`;
  const btn = (act: string, label: string, kind = "secondary") => `<button type="button" class="bt-btn bt-btn--${kind} bt-btn--sm" data-task-act="${act}" data-id="${esc(t.taskId)}">${label}</button>`;
  const mine = t.claimedBy === ctx.uid;
  switch (t.status) {
    case "open": return `${g}${ctx.crewMember ? btn("taskClaim", "Claim") : ""}`;
    case "claimed": return `${g}${mine ? btn("taskDone", "Done", "primary") : `<span class="bt-badge bt-badge--gray">In progress</span>`}`;
    case "done":
      if (mine) return `${g}<span class="bt-badge bt-badge--teal" title="Someone else confirms your task, then the Gears are paid.">Someone else confirms</span>`;
      return `${g}${t.postedBy === ctx.uid || ctx.a2plus ? btn("taskConfirm", "Confirm", "primary") : `<span class="bt-badge bt-badge--teal">Waiting to be confirmed</span>`}`;
    default: return `${g}<span class="bt-badge bt-badge--lime">Confirmed</span>`;
  }
}

export function taskRowHtml(t: Task, ctx: Ctx, { detail = false } = {}): string {
  return `<div class="hq-task" data-status="${t.status}"><span class="hq-task-main"><b>${esc(t.title)}</b>${detail && t.detail ? `<span class="hq-task-detail">${esc(t.detail)}</span>` : ""}<small>${sub(t, ctx)}</small></span><span class="hq-task-side">${side(t, ctx)}</span></div>`;
}

const LOCAL: Record<string, (t: Task, ctx: Ctx) => void> = {
  taskClaim: (t, ctx) => { t.status = "claimed"; t.claimedBy = ctx.uid; t.claimedByHandle = ctx.handle; },
  taskDone: (t) => { t.status = "done"; },
  taskConfirm: (t) => { t.status = "confirmed"; },
};
const DONE_MSG: Record<string, string> = { taskClaim: "Task claimed. Thank you!", taskDone: "Marked done. Someone else will confirm it.", taskConfirm: "Confirmed. The Gears are on their way." };

/** One click handler for every [data-task-act] button under root. `after` re-renders from fresh data. */
export function wireTaskActions(root: HTMLElement, ctx: Ctx, after: () => Promise<void> | void) {
  root.addEventListener("click", async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-task-act]");
    if (!b || !root.contains(b) || b.disabled) return;
    const name = b.dataset.taskAct!, taskId = b.dataset.id!;
    b.disabled = true;
    const label = b.textContent;
    b.innerHTML = `<span class="bt-spinner" aria-hidden="true"></span>${esc(label)}`;
    try {
      await act(ctx, name, { taskId }, () => {
        const t = (previewData().tasks as Task[]).find((x) => x.taskId === taskId);
        if (t) LOCAL[name](t, ctx);
      });
      toast(DONE_MSG[name]);
      await after();
    } catch (err) {
      toast(messageFor(err, "That didn't work. Try again."), { kind: "error" });
      b.disabled = false;
      b.textContent = label;
    }
  });
}
