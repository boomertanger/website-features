// /crew/tasks (docs/specs/mod-machina.md §4a). The full board by status with Claim, Done and Confirm. Gears are paid
// once, when SOMEONE ELSE confirms (the poster, or an Overseer and above), never your own task. Sentinels and admins
// get a Post a task form (5 to 50 Gears). The server checks every action.
import { onAccess } from "./layout";
import { loadCtx, loadTasks, act, previewData, esc, previewNote, emptyState, type Ctx, type Task } from "./data";
import { taskRowHtml, wireTaskActions } from "./task-ui";
import { messageFor } from "../../lib/errors";
import { toast } from "../../../../shared/ui/toast.js";

const root = document.querySelector<HTMLElement>("[data-hq]")!;
let ctx: Ctx, tasks: Task[] = [];

const GROUPS: { status: Task["status"]; title: string; empty: string }[] = [
  { status: "open", title: "Open", empty: "Nothing open right now. Check back soon." },
  { status: "claimed", title: "In progress", empty: "Nobody is working on a task at the moment." },
  { status: "done", title: "Waiting to be confirmed", empty: "Nothing is waiting." },
  { status: "confirmed", title: "Confirmed", empty: "Confirmed tasks show up here." },
];

function postForm() {
  if (!ctx.canPost) return "";
  return `<form class="bt-card hq-card hq-post" data-post novalidate><div class="bt-card-head"><span class="bt-card-title">Post a task</span><span class="bt-meta">Sentinels and admins</span></div>
    <div class="bt-field"><label class="bt-label" for="hq-t-title">Title</label><input class="bt-input" id="hq-t-title" maxlength="100" required placeholder="Clip the best scare from Saturday"></div>
    <div class="bt-field"><label class="bt-label" for="hq-t-detail">Details <span class="bt-meta">optional</span></label><textarea class="bt-textarea" id="hq-t-detail" maxlength="600" rows="3" placeholder="What done looks like, and where to put it."></textarea></div>
    <div class="bt-field hq-gears"><label class="bt-label" for="hq-t-gears">Gears</label><input class="bt-input" id="hq-t-gears" type="number" inputmode="numeric" min="5" max="50" step="1" value="10" required><span class="bt-fineprint">From 5 to 50, paid when someone else confirms it.</span></div>
    <p class="bt-error" hidden></p>
    <div><button type="submit" class="bt-btn bt-btn--primary">Post task</button></div></form>`;
}

function render() {
  const sections = GROUPS.map((g) => {
    let rows = tasks.filter((t) => t.status === g.status);
    const more = g.status === "confirmed" && rows.length > 10 ? rows.length - 10 : 0;
    if (more) rows = rows.slice(0, 10);
    return `<section class="hq-sec" data-status="${g.status}"><h2 class="bt-heading">${g.title} <span class="bt-meta">${tasks.filter((t) => t.status === g.status).length}</span></h2>
      <div class="bt-card hq-card hq-tasklist">${rows.length ? rows.map((t) => taskRowHtml(t, ctx, { detail: true })).join("") : `<p class="hq-note">${g.empty}</p>`}${more ? `<p class="bt-fineprint">And ${more} older.</p>` : ""}</div></section>`;
  }).join("");
  root.innerHTML = `${previewNote(ctx)}
    <div class="hq-head"><div><h1 class="bt-title">Task board</h1><p class="bt-subtitle">Small jobs that help the community. Claim one, mark it done, and someone else confirms it to pay your Gears.</p></div></div>
    <div class="hq-tasks-layout"><div class="hq-col" data-tasks>${sections}</div>${ctx.canPost ? `<div class="hq-col">${postForm()}</div>` : ""}</div>
    <p class="bt-fineprint">Gears are paid once, when the person who posted the task (or an Overseer or above) confirms it. You can't confirm your own task: someone else does.</p>`;
  root.setAttribute("aria-busy", "false");

  wireTaskActions(root.querySelector<HTMLElement>("[data-tasks]")!, ctx, async () => { tasks = await loadTasks(ctx); render(); });
  const form = root.querySelector<HTMLFormElement>("[data-post]");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = (form.querySelector("#hq-t-title") as HTMLInputElement), detail = (form.querySelector("#hq-t-detail") as HTMLTextAreaElement), gears = (form.querySelector("#hq-t-gears") as HTMLInputElement);
    const err = form.querySelector<HTMLElement>(".bt-error")!, btn = form.querySelector<HTMLButtonElement>("[type=submit]")!;
    const g = Number(gears.value);
    [title, gears].forEach((x) => x.removeAttribute("aria-invalid"));
    const bad = title.value.trim().length < 3 ? [title, "Give the task a short title (3 letters or more)."] as const : !Number.isInteger(g) || g < 5 || g > 50 ? [gears, "Gears must be a whole number from 5 to 50."] as const : null;
    if (bad) { bad[0].setAttribute("aria-invalid", "true"); err.textContent = bad[1]; err.hidden = false; bad[0].focus(); return; }
    err.hidden = true; btn.disabled = true; btn.innerHTML = `<span class="bt-spinner" aria-hidden="true"></span>Posting…`;
    try {
      await act(ctx, "taskPost", { title: title.value.trim(), detail: detail.value.trim(), gears: g }, () => {
        (previewData().tasks as Task[]).unshift({ taskId: `t${Date.now()}`, title: title.value.trim(), detail: detail.value.trim(), gears: g, status: "open", postedBy: ctx.uid, postedByHandle: ctx.handle, claimedBy: null, claimedByHandle: null, createdAt: Date.now() });
      });
      toast("Task posted.");
      tasks = await loadTasks(ctx); render();
    } catch (x) { err.textContent = messageFor(x, "That didn't post. Try again."); err.hidden = false; btn.disabled = false; btn.textContent = "Post task"; }
  });
}

onAccess(async (s) => {
  try {
    ctx = await loadCtx(s);
    tasks = await loadTasks(ctx);
    render();
  } catch (err) {
    root.innerHTML = emptyState("The task board didn't load", messageFor(err, "Something went wrong. Try again in a moment."), `<a class="bt-btn bt-btn--primary" href="/crew/tasks">Reload</a>`);
    root.setAttribute("aria-busy", "false");
  }
});
