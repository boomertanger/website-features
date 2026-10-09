// /crew/hq (docs/specs/mod-machina.md §12, mockup mod-machina-guides.html "Crew HQ" with the time card M2).
// Crew only. Your grade and status, the month's time card (Phase 1: "Starts with stream duty"), progress to the
// next grade (promotions are never automatic: the owner confirms), the task strip, your recruit link, Gears and
// board rank, Academy progress and any strikes (private, yours only). The duties and open-seats cards wait for
// stream duty.
import { onAccess } from "./layout";
import { loadCtx, loadStanding, loadTasks, statusChip, STATUS, esc, num, fmtDate, previewNote, emptyState, type Ctx, type Task } from "./data";
import { taskRowHtml, wireTaskActions } from "./task-ui";
import { messageFor } from "../../lib/errors";
import { gradeChipHtml } from "../../../../shared/ui/grade-chip.js";
import { timecardHtml, ringHtml } from "../../../../shared/ui/crew.js";
import { initials } from "../../../../shared/ui/dom.js";
import { toast } from "../../../../shared/ui/toast.js";
import { makeIo, type Io } from "../planner/plan-io";
import type { Swap } from "../planner/plan-data";
import { boardCardHtml, wireBoard } from "./swaps";

const root = document.querySelector<HTMLElement>("[data-hq]")!;
const mascot = () => document.getElementById("bt-mascot-tpl")?.innerHTML || "";
const SITE_URL = "https://boomertanger.com";
const CORE = ["m1", "m2", "m3", "m4", "m5", "m6"];

function nextCard(ctx: Ctx) {
  const n = ctx.me.next;
  if (!n) return `<div class="bt-card hq-card"><div class="bt-card-head"><span class="bt-card-title">Next grade</span></div><p class="hq-note">${ctx.me.crew?.track === "admin" ? "The admin ladder is by invitation, so there's nothing to tick off here." : "You're at the top of the mod ladder. Thank you for everything you do."}</p></div>`;
  const li = (state: string, text: string) => `<li data-s="${state}"><span class="hq-mark" aria-hidden="true"></span><span>${esc(text)}</span>${state === "pending" ? `<span class="bt-badge bt-badge--gray hq-pend">Starts with stream duty</span>` : ""}</li>`;
  const total = n.met.length + n.missing.length + n.pending.length;
  const items = [...n.met.map((t) => li("met", t)), ...n.missing.map((t) => li("missing", t)), ...n.pending.map((t) => li("pending", t))].join("");
  return `<div class="bt-card hq-card"><div class="bt-card-head"><span class="bt-card-title">Next grade</span>${gradeChipHtml({ track: "mod", grade: n.to } as any)}</div>`
    + (ctx.me.ready ? `<div class="bt-notice hq-ready"><b>Ready to promote to ${esc(ctx.me.ready.name)}.</b> You've met everything. The owner confirms promotions, so you'll hear from them soon.</div>` : "")
    + `<p class="hq-note">${n.met.length} of ${total} done on the way to ${esc(n.name)}. Everything has to be ticked, then the owner confirms.</p>`
    + `<ul class="hq-checks">${items}</ul>`
    + (n.missing.some((m) => /module|Academy/i.test(m)) ? `<a class="bt-link-btn" href="/crew/academy">Go to the Academy</a>` : "")
    + `</div>`;
}

function taskStrip(ctx: Ctx, tasks: Task[]) {
  const mine = tasks.filter((t) => t.claimedBy === ctx.uid && (t.status === "claimed" || t.status === "done"));
  const open = tasks.filter((t) => t.status === "open");
  const shown = [...mine, ...open].slice(0, 4);
  return `<div class="bt-card hq-card"><div class="bt-card-head"><span class="bt-card-title">Task board</span><a class="bt-meta" href="/crew/tasks">All tasks${open.length ? ` (${open.length} open)` : ""}</a></div>`
    + (shown.length ? shown.map((t) => taskRowHtml(t, ctx)).join("") : `<p class="hq-note">Nothing open right now. New tasks show up here.</p>`)
    + `</div>`;
}

function recruitCard(ctx: Ctx, recruits: number, allRecruits: number) {
  if (!ctx.handle) return "";
  const link = `${SITE_URL}/join/@${ctx.handle}`;
  return `<div class="bt-card hq-card"><span class="bt-card-title">Your recruit link</span>`
    + `<div class="hq-link"><span class="bt-code" data-hq-link>${esc(link.replace("https://", ""))}</span><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-hq-copy>Copy</button></div>`
    + `<span class="bt-meta">${recruits} recruit${recruits === 1 ? "" : "s"} this month · ${allRecruits} all time. A recruit counts once they've been active for a week.</span></div>`;
}

function academyCard(ctx: Ctx) {
  const done = CORE.filter((m) => ctx.me.academy.passed.includes(m)).length;
  const all = done === CORE.length;
  return `<a class="bt-card hq-card hq-acad" href="/crew/academy">${ringHtml({ value: (done / CORE.length) * 100, centre: `${done}/${CORE.length}`, caption: "core", label: `${done} of ${CORE.length} core Academy modules passed`, size: "sm", done: all })}`
    + `<span class="hq-acad-txt"><b>Crew Academy</b><span class="bt-meta">${all ? "Core six done. Pick up the next steps when you like." : `${CORE.length - done} core module${CORE.length - done === 1 ? "" : "s"} to go`}</span></span></a>`;
}

function strikesCard(ctx: Ctx) {
  if (!ctx.me.strikes.length) return "";
  return `<div class="bt-card hq-card"><div class="bt-card-head"><span class="bt-card-title">A note from the crew leads</span><span class="bt-badge bt-badge--gray">Private</span></div>`
    + `<p class="hq-note">Only you, the admins and the owner can see this. Everyone has a rough patch, and these fall away on their own after six months.</p>`
    + ctx.me.strikes.map((s) => `<div class="hq-strike"><b>${esc(s.reason)}</b><small>${fmtDate(s.at, { month: "short", day: "numeric", year: "numeric" })} · fades ${fmtDate(s.expiresAt, { month: "short", year: "numeric" })}</small></div>`).join("")
    + `<p class="hq-note">Questions? Message an admin, they're glad to talk it through.</p></div>`;
}

function statusLine(ctx: Ctx) {
  const c = ctx.me.crew!;
  const st = STATUS[c.status];
  if (c.status === "goingDark") return `<span class="bt-meta">Back around ${fmtDate(c.breakUntil, { month: "short", day: "numeric" })}</span>`;
  return st && c.status !== "active" ? `<span class="bt-meta">${esc(st.note)}</span>` : "";
}

async function render(ctx: Ctx) {
  const c = ctx.me.crew;
  if (!c || !ctx.crewMember) {
    root.innerHTML = emptyState(c ? "Welcome back" : "You're not on the crew yet", c ? "You're an alumnus now, so HQ is closed. Ask the owner if you'd like to come back." : "HQ is for people on the crew. If you'd like to help, apply from the crew page.", `<a class="bt-btn bt-btn--primary" href="${c ? "/crew" : "/crew/join"}">${c ? "See the crew" : "Apply to join"}</a>`);
    root.setAttribute("aria-busy", "false");
    return;
  }
  const io: Io = await makeIo();
  const [standing, tasks0, swaps0] = await Promise.all([loadStanding(ctx), loadTasks(ctx).catch(() => [] as Task[]), io.swaps().catch(() => [] as Swap[])]);
  let swaps = swaps0;
  const meUid = io.preview ? "me" : ctx.uid;   // the planner preview names its pretend crew member "me"
  let tasks = tasks0;
  const month = new Date().toLocaleDateString("en-US", { month: "long", timeZone: "America/Chicago" });
  const monthShort = new Date().toLocaleDateString("en-US", { month: "short", timeZone: "America/Chicago" });
  const g = standing.month?.gears ?? 0, ga = standing.all?.gears ?? 0, place = standing.month?.place ?? null;
  const rec = standing.month?.recruits ?? 0, recAll = standing.all?.recruits ?? 0;
  const since = c.since ? `Crew since ${fmtDate(c.since, { month: "short", year: "numeric" })}` : "";
  const tail = (t: Task[]) => { tasks = t; root.querySelector<HTMLElement>("[data-hq-tasks]")!.innerHTML = taskStrip(ctx, tasks); };

  root.innerHTML = `${previewNote(ctx)}
    <header class="hq-me"><span class="bt-avatar-xl" aria-hidden="true">${esc(initials(ctx.name || ctx.handle || "?"))}</span>
      <div class="hq-me-txt"><h1 class="bt-title">Crew HQ</h1><p class="hq-hey">Hey, ${esc(ctx.name || ctx.handle)}</p>
        <div class="hq-me-tags">${gradeChipHtml({ track: c.track, grade: c.grade } as any)}${statusChip(c.status)}${since ? `<span class="bt-meta">${esc(since)}</span>` : ""}${statusLine(ctx)}</div></div>
      <div class="hq-stats"><div><strong>${num(g)}</strong><span>Gears · ${esc(monthShort)}</span></div><div><strong>${num(ga)}</strong><span>All time</span></div><div><strong>${place ? `#${place}` : "–"}</strong><span>${place ? "Crew board" : "Unranked"}</span></div></div>
    </header>
    ${c.status === "goingDark" ? `<div class="bt-notice">You're on a planned break. No warnings and nothing to do. <a href="/crew/profile#going-dark">Come back early</a> whenever you like.</div>` : ""}
    <div class="hq-grid">
      <div class="hq-col">
        ${timecardHtml({ month, need: 2, total: 4, state: "idle" } as any)}
        <div data-hq-swaps>${boardCardHtml(swaps, meUid, mascot())}</div>
        <div data-hq-tasks>${taskStrip(ctx, tasks)}</div>
        ${strikesCard(ctx)}
      </div>
      <div class="hq-col">
        ${nextCard(ctx)}
        ${recruitCard(ctx, rec, recAll)}
        ${academyCard(ctx)}
        <a class="bt-card hq-card hq-prof" href="/live/deck"><span class="hq-acad-txt"><b>Mod Deck</b><span class="bt-meta">Your seat, the chats and the tools while Boomer is live</span></span><span aria-hidden="true">›</span></a>
        <a class="bt-card hq-card hq-prof" href="/crew/profile"><span class="hq-acad-txt"><b>Your chats and availability</b><span class="bt-meta">Preferences, days, device and Going dark</span></span><span aria-hidden="true">›</span></a>
      </div>
    </div>`;
  root.setAttribute("aria-busy", "false");

  wireTaskActions(root.querySelector<HTMLElement>("[data-hq-tasks]")!, ctx, async () => tail(await loadTasks(ctx)));
  // the swap board: Take it through confirmAction; the card redraws from the latest swaps afterwards
  const swapBox = root.querySelector<HTMLElement>("[data-hq-swaps]")!;
  wireBoard(swapBox, io, (id) => swaps.find((x) => x.id === id), async () => { swaps = await io.swaps().catch(() => swaps); swapBox.innerHTML = boardCardHtml(swaps, meUid, mascot()); });
  root.querySelector<HTMLButtonElement>("[data-hq-copy]")?.addEventListener("click", async (e) => {
    const url = `${SITE_URL}/join/@${ctx.handle}`;
    try { await navigator.clipboard.writeText(url); toast("Link copied. One link post per room an hour, please."); }
    catch {
      const range = document.createRange(); range.selectNodeContents(root.querySelector("[data-hq-link]")!);
      const sel = getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
      toast("Press Ctrl+C to copy the link.", { kind: "info" });
    }
    (e.currentTarget as HTMLElement).blur();
  });
}

onAccess(async (s) => {
  try { await render(await loadCtx(s)); }
  catch (err) {
    root.innerHTML = emptyState("HQ didn't load", messageFor(err, "Something went wrong. Try again in a moment."), `<a class="bt-btn bt-btn--primary" href="/crew/hq">Reload</a>`);
    root.setAttribute("aria-busy", "false");
  }
});
