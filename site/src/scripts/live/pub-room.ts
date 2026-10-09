// The waiting room on /live (docs/specs/control-room.md §7a; mockup control-room-batch-1.html, the Off air and Starting soon states): off air and Starting
// soon, and (/live?how=1) the same story while a stream is on. A story page: the static chapters are in live.astro (TocLayout rail, ghost-numbered
// chapters, the four-beat journey, the practice check-in's frame, Ask BOOMBOT, the closing call); this part fills the live bits:
//   hero        badge, lede, the countdown, "Running late · now 9:00 PM"
//   ticket      the next stream: day, time in both zones, covers of the games, platforms, Captain; Remind me, Add to calendar, Full schedule
//   practice    a working check-in with the word "lantern" that saves nothing
// Remind me goes through Boom Alerts (pub-data.ts remind): until alertsRemindMe exists it says so and hands over a calendar file instead.
import { crPanelHtml } from "../../../../shared/ui/cr-panel.js";
import { coverHtml } from "../../../../shared/ui/cover.js";
import { streamIcs } from "../../../../shared/ui/navgroup.js";
import { dayParts, platformsHtml } from "../../../../shared/ui/scream-planner.js";
import site from "../../data/site.json";
import { toast, messageFor, mascotHtml } from "./ui";
import { checkinHtml, clock, dualTimeHtml, esc, initCheckin, initHowItWorks, pad2, ticketHtml, type PubCtx, type ViewPart } from "./pub-ui";

const PRACTICE_WORD = "lantern";

// accents, case, spaces and punctuation are ignored, like the real check-in
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

let box: HTMLElement;
let cur: PubCtx;
let timer = 0;
let cdMode = "";
let ticketKey = "";
let tries = 5;
let reminded = "";

/* ------------------------------------------------------------------ the countdown */
function countdownTick() {
  const n = cur?.next, cd = box?.querySelector<HTMLElement>("[data-lp-cd]");
  if (!cd) return;
  if (!n) { cd.hidden = true; return; }
  cd.hidden = false;
  const left = n.start - Date.now();
  if (left <= 0) {
    if (cdMode !== "now") { cdMode = "now"; cd.innerHTML = `<p class="lp-now">Any moment now…</p>`; }
    return;
  }
  const s = Math.floor(left / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mode = d > 0 ? "dhms" : h > 0 ? "hms" : "ms";
  if (mode !== cdMode) {
    cdMode = mode;
    const unit = (k: string, label: string) => `<div><strong data-u="${k}">0</strong><span>${label}</span></div>`;
    cd.innerHTML = (mode === "dhms" ? unit("d", "days") : "") + (mode !== "ms" ? unit("h", "hours") : "") + unit("m", "min") + unit("s", "sec");
  }
  const set = (k: string, v: number) => { const el = cd.querySelector<HTMLElement>(`[data-u="${k}"]`); const t = k === "d" ? String(v) : pad2(v); if (el && el.textContent !== t) el.textContent = t; };
  set("d", d); set("h", h); set("m", m); set("s", sec);
}

/* ------------------------------------------------------------------ the ticket */
const listOf = (a: string[]) => (a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")}, then ${a[a.length - 1]}`);

function ticketMarkup(ctx: PubCtx): string {
  const n = ctx.next;
  if (!n) {
    return `<div class="bt-card lp-empty">${mascotHtml()}<div><h3>Nothing scheduled yet</h3><p>When Boomer publishes the week's streams they show up here, with a countdown and a reminder.</p>
      <a class="bt-btn bt-btn--secondary" href="/schedule">Open the schedule</a></div></div>`;
  }
  const dp = dayParts(n.start);
  const today = new Date(n.start).toDateString() === new Date().toDateString();
  const state = ctx.soon ? "soon" : today ? "tonight" : "scheduled";
  const shown = n.games.slice(0, 3), more = Math.max(0, n.plannedGameCount - shown.length);
  const covers = shown.map((g) => coverHtml(ctx.vault.get(g.slug)?.cover ?? null, { alt: g.title, cls: "bt-cover--sm" })).join("");
  const backstage = n.type === "backstage";
  const ticket = ticketHtml({
    id: n.id, day: dp.dow, num: String(dp.num), month: dp.month, state, title: n.title,
    timeHtml: dualTimeHtml({ start: n.start, end: n.end, was: n.delayedFrom ?? undefined }), was: n.delayedFrom ?? undefined,
    coversHtml: covers, more, backstage, platformsHtml: backstage ? undefined : platformsHtml(n.rooms.length ? n.rooms : undefined),
    crew: n.captain ? `Captain @${n.captain}` : "",
  });
  const games = n.games.length ? `<p class="lp-games"><b>Tonight's games</b> ${n.games.map((g) => esc(g.title)).join(" · ")}${more ? ` · +${more} picked on stream` : ""}</p>` : "";
  const remind = ctx.member
    ? `<button type="button" class="bt-btn bt-btn--primary" data-lp-remind aria-pressed="${reminded === n.id}">${reminded === n.id ? "Reminder set" : "Remind me"}</button>`
    : `<a class="bt-btn bt-btn--primary" href="/account" data-signin="join" data-signin-title="Join to get go-live alerts">Get go-live alerts</a>`;
  return `<div class="lp-ticket">${ticket}<div class="lp-ticket-side">${games}<div class="lp-ticket-acts">${remind}<button type="button" class="bt-btn bt-btn--secondary" data-lp-cal>Add to calendar</button><a class="bt-link-btn" href="/schedule">Full schedule</a></div></div></div>`;
}

function downloadIcs(ctx: PubCtx) {
  const n = ctx.next;
  if (!n) return;
  const blob = new Blob([streamIcs({ title: n.title, startsAt: new Date(n.start).toISOString(), url: `${location.origin}/live`, name: site.name })], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "stream.ics";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

async function remind(ctx: PubCtx, btn: HTMLElement) {
  const n = ctx.next;
  if (!n) { toast("There's no stream to remind you about yet.", { kind: "info" }); return; }
  btn.setAttribute("aria-busy", "true");
  try {
    const r = await ctx.api.remind(n.id);
    if (r === "ok") { reminded = n.id; toast("Reminder set. We'll ping you 15 minutes before.", { kind: "ok" }); part.update(ctx); }
    else { downloadIcs(ctx); toast("Reminders arrive with Boom Alerts. A calendar event just downloaded in the meantime.", { kind: "info", ms: 7000 }); }
  } catch (err) { toast(messageFor(err), { kind: "error" }); }
  finally { btn.removeAttribute("aria-busy"); }
}

/* ------------------------------------------------------------------ the practice check-in */
function drawTry() {
  const host = box.querySelector<HTMLElement>("[data-lp-try]");
  if (!host) return;
  const card = checkinHtml({ dialog: true, state: "entry", beat: "start", time: "5:00", count: 0, countLabel: "checked in (practice)", tries, id: "lp-try", wordLabel: "Type the word you just heard", rooms: ["twitch", "ytLandscape", "ytVertical", "tiktok"] });
  host.innerHTML = crPanelHtml({ cls: "lp-try-card", title: "Practice check-in", icon: "checkin", tagHtml: `<span class="bt-badge bt-badge--gray">Practice</span>`, bodyHtml: `${card}<p class="lp-private">Nothing is saved. This is a practice run.</p>` });
  initCheckin(host, {
    onSubmit: async (word: string) => {
      await new Promise((r) => setTimeout(r, 250));
      if (norm(word) === PRACTICE_WORD) {
        setTimeout(() => host.querySelector(".bt-checkin-done")?.insertAdjacentHTML("beforeend", `<button type="button" class="bt-link-btn" data-lp-again>Try again</button>`), 0);
        return { ok: true, xp: 10, streak: "practice only, nothing is saved" };
      }
      tries--;
      if (tries <= 0) {
        setTimeout(() => host.querySelector(".bt-checkin-note")?.insertAdjacentHTML("beforeend", `<button type="button" class="bt-link-btn" data-lp-again>Try again</button>`), 0);
        return { locked: true };
      }
      return { ok: false, left: tries };
    },
  });
}

/* ------------------------------------------------------------------ the part */
const part: ViewPart = {
  mount(ctx, el) {
    box = el; cur = ctx;
    initHowItWorks(box);
    tries = 5;
    drawTry();
    box.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const rem = t.closest<HTMLElement>("[data-lp-remind]"), cal = t.closest("[data-lp-cal]"), again = t.closest("[data-lp-again]");
      if (rem) void remind(cur, rem);
      else if (cal) downloadIcs(cur);
      else if (again) { tries = 5; drawTry(); }
    });
    clearInterval(timer);
    timer = window.setInterval(() => { if (!document.hidden) countdownTick(); }, 1000);
    part.update(ctx);
  },
  update(ctx) {
    cur = ctx;
    const n = ctx.next, p = ctx.pub;
    const onAir = ctx.how && (p.state === "live" || p.state === "backstage");
    box.querySelector<HTMLElement>("[data-lp-onair]")!.hidden = !onAir;
    const badge = box.querySelector<HTMLElement>("[data-lp-badge]")!;
    const b = ctx.soon ? ["bt-badge--gold", "Starting soon"] : onAir ? ["bt-badge--red", "On air now"] : ["bt-badge--gray", "Off air"];
    badge.className = `bt-badge ${b[0]}`; badge.textContent = b[1];
    // The lede
    const lede = box.querySelector<HTMLElement>("[data-lp-lede]")!;
    const games = n ? n.games.map((g) => g.title) : [];
    let text: string;
    if (!n) text = "No stream is scheduled right now. The schedule shows what is coming up.";
    else if (ctx.soon) text = `Boomer is getting the ship ready.${games.length ? ` Tonight: ${listOf(games.slice(0, 3))}.` : ""} Check-in opens at the Start beat.`;
    else text = `The bridge is dark for now. The next stream is ${n.title}: four beats, four check-ins and a break in the middle.${games.length ? ` First up: ${games[0]}.` : ""}`;
    if (lede.textContent !== text) lede.textContent = text;
    // Running late
    const late = box.querySelector<HTMLElement>("[data-lp-late]")!;
    late.hidden = !(n && n.delayedFrom != null);
    if (n && n.delayedFrom != null) late.textContent = `Running late · now ${clock(n.start)}`;
    countdownTick();
    // The ticket: redrawn only when what it shows changed (so a pressed button isn't lost)
    const key = `${n?.id}|${n?.start}|${ctx.soon}|${ctx.vault.size}|${ctx.member}|${reminded}`;
    if (key !== ticketKey) { ticketKey = key; box.querySelector<HTMLElement>("[data-lp-ticket]")!.innerHTML = ticketMarkup(ctx); }
    box.querySelectorAll<HTMLElement>("[data-lp-remind]").forEach((r) => { r.textContent = n && reminded === n.id ? "Reminder set" : "Remind me"; r.setAttribute("aria-pressed", String(!!n && reminded === n.id)); });
  },
  unmount() { clearInterval(timer); timer = 0; },
};
export default part;
