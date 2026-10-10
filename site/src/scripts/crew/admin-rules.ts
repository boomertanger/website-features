// /admin/crew: the activity rules section (Mod Machina phase 3 part 7; docs/specs/mod-machina.md §3f, §17a "Activity rules on"). The rules card (Off/On, the start month,
// a confirmAction naming the practice month; owner only: crewSetRules), the lists "Behind this month", "On Check-in" and "Due for Reserve" with Excuse (the existing
// excuse flow, owner only), and the no-show lockouts with Lift (crewLockLift, owner only). Green is for these staff-only controls. Display only: the server decides.
// Preview (?as=admin): ?rules=off|before|grace|on draws sample lists from the preview roster.
import { confirmAction } from "../../../../shared/ui/confirm.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { gradeChipHtml } from "../../../../shared/ui/grade-chip.js";

export interface ListRow { uid: string; handle: string | null; status: string; track: "mod" | "admin"; grade: number; missedMonths: number; line: string | null }
export interface Activity {
  ym: string; rules: "off" | "before" | "grace" | "on"; activityRules: boolean; rulesSince: string | null; graceMonth: string | null;
  light?: boolean; streamsLeftOpen?: number; behind: ListRow[]; checkIn: ListRow[]; dueReserve: ListRow[];
}
export interface Lockout { uid: string; handle: string | null; lockUntil: number }

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (ym: string | null) => (ym ? MONTHS[Number(ym.slice(5, 7)) - 1] || "" : "");
const ymOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const nextYm = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1); return ymOf(d); };
const mascot = () => document.getElementById("bt-mascot-tpl")?.innerHTML || "";
const who = (r: { handle: string | null }) => (r.handle ? `@${r.handle}` : "Unknown member");
const STATUS_LABEL: Record<string, string> = { active: "Active", checkIn: "Check-in", reserve: "Reserve", goingDark: "Going dark" };

/** Sample lists for the preview: rows from the preview roster. */
export function previewActivity(rules: string | null, rows: { uid: string; handle: string | null; status: string; track: "mod" | "admin"; grade: number }[]): Activity | null {
  if (!rules) return null;
  const ym = ymOf(new Date()), next = nextYm();
  if (rules === "off") return { ym, rules: "off", activityRules: false, rulesSince: null, graceMonth: null, behind: [], checkIn: [], dueReserve: [] };
  if (rules === "before") return { ym, rules: "before", activityRules: true, rulesSince: next, graceMonth: next, behind: [], checkIn: [], dueReserve: [] };
  const crew = rows.filter((r) => ["active", "checkIn", "reserve"].includes(r.status));
  const row = (r: (typeof rows)[number], i: number): ListRow => ({ uid: r.uid, handle: r.handle, status: r.status, track: r.track, grade: r.grade, missedMonths: r.status === "checkIn" ? 1 : 0, line: r.grade >= 3 && r.track === "mod" ? `${i % 2} of 3 duties, at least 1 as Room Lead or Captain` : `${i % 2} of 2 duties` });
  const behind = crew.slice(0, 3).map(row);
  const checkIn = rows.filter((r) => r.status === "checkIn").map(row);
  return { ym, rules: rules === "grace" ? "grace" : "on", activityRules: true, rulesSince: rules === "grace" ? ym : "2026-01", graceMonth: rules === "grace" ? ym : "2026-01", light: false, streamsLeftOpen: 4,
    behind, checkIn, dueReserve: behind.filter((r) => r.status === "checkIn") };
}

function listHtml(title: string, rows: ListRow[], owner: boolean, empty: string): string {
  const items = rows.map((r) => `<li class="ca-rl-row"><span class="ca-rl-who"><b>${esc(who(r))}</b>${gradeChipHtml({ track: r.track, grade: r.grade } as any)}<span class="bt-badge bt-badge--${r.status === "active" ? "lime" : r.status === "checkIn" ? "gold" : "gray"}">${esc(STATUS_LABEL[r.status] || r.status)}</span></span>`
    + `<span class="ca-rl-line">${esc(r.line || "")}${r.missedMonths ? ` · ${r.missedMonths} missed month${r.missedMonths === 1 ? "" : "s"}` : ""}</span>`
    + (owner ? `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-act="excuse" data-uid="${esc(r.uid)}">Excuse</button>` : "") + `</li>`).join("");
  return `<article class="bt-card ca-card ca-rl"><h3 class="ca-rl-h">${esc(title)} <span class="bt-badge">${rows.length}</span></h3>`
    + (rows.length ? `<ul class="ca-rl-list">${items}</ul>` : `<div class="ca-rl-empty">${mascot()}<p>${esc(empty)}</p></div>`) + `</article>`;
}

export function rulesHtml(a: Activity | null, lockouts: Lockout[], owner: boolean): string {
  const st = a?.rules || "off";
  const badge = st === "off" ? `<span class="bt-badge bt-badge--gray">Off</span>` : st === "before" ? `<span class="bt-badge bt-badge--green">On · starts ${esc(monthName(a!.rulesSince))} 1</span>`
    : st === "grace" ? `<span class="bt-badge bt-badge--green">On · practice month</span>` : `<span class="bt-badge bt-badge--green">On since ${esc(monthName(a!.rulesSince))}</span>`;
  const lead = st === "off" ? "The monthly minimums are off. Turn them on for the 1st of a month; that whole month is a practice month: nobody moves down."
    : st === "before" ? `The rules start on ${esc(monthName(a!.rulesSince))} 1. ${esc(monthName(a!.graceMonth))} is a practice month: nobody moves down.`
    : st === "grace" ? "This is the practice month: reminders and the time card run, nobody moves down and missed months don't count. Moving back to Active still works."
    : "The rules run as written: minimums each month, Check-in after one missed month, Reserve after two.";
  const card = `<div class="bt-card ca-card ca-rules"><div class="ca-rules-top"><span class="bt-label">Activity rules</span>${badge}</div><p class="bt-section-text">${lead}</p>`
    + (owner ? `<div class="ca-rules-acts">${st === "off" ? `<label class="bt-field ca-rules-start"><span class="bt-label">Start month</span><input class="bt-input" type="month" value="${nextYm()}" min="${ymOf(new Date())}" data-rules-start></label><button type="button" class="bt-btn bt-btn--admin" data-act="rules-on">Turn on</button>`
      : `<button type="button" class="bt-btn bt-btn--secondary" data-act="rules-off">Turn off</button>`}</div>` : `<p class="bt-fine bt-fine--left">Only the owner turns the rules on or off.</p>`)
    + `</div>`;
  const lists = st === "grace" || st === "on"
    ? `<div class="ca-rl-grid">${listHtml("Behind this month", a!.behind, owner, "Everyone's on track.")}${listHtml("On Check-in", a!.checkIn, owner, "Nobody is on Check-in.")}${listHtml("Due for Reserve", a!.dueReserve, owner, "Nobody is due for Reserve.")}</div>`
      + (a!.light ? `<p class="bt-fine bt-fine--left">Light month: fewer than 8 streams are scheduled, so 1 duty is enough for everyone.</p>` : "")
    : "";
  const locks = `<article class="bt-card ca-card ca-rl"><h3 class="ca-rl-h">No-show lockouts <span class="bt-badge">${lockouts.length}</span></h3>`
    + (lockouts.length ? `<ul class="ca-rl-list">${lockouts.map((l) => `<li class="ca-rl-row"><span class="ca-rl-who"><b>${esc(who(l))}</b></span><span class="ca-rl-line">No Lead or Captain seats until ${esc(new Date(l.lockUntil).toLocaleDateString("en-US", { month: "short", day: "numeric" }))}</span>${owner ? `<button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-act="lift" data-uid="${esc(l.uid)}">Lift</button>` : ""}</li>`).join("")}</ul>`
      : `<div class="ca-rl-empty">${mascot()}<p>No lockouts. 3 no-shows in 90 days without using the swap board locks Lead and Captain seats for 30 days.</p></div>`) + `</article>`;
  return card + lists + locks;
}

/** The owner's confirmations; `call` runs the callable (or the preview's local copy) and resolves when saved. */
export function rulesOn(start: string, call: (startMonth: string) => Promise<void>) {
  const m = monthName(start);
  void confirmAction({
    title: "Turn on the activity rules?", confirmLabel: `Start on ${m} 1`, busyLabel: "Saving…", danger: false, feature: "crew",
    message: `Activity rules start on ${m} 1. ${m} is a practice month: nobody moves down.`,
    onConfirm: async () => { await call(start); },
  });
}
export function rulesOff(call: () => Promise<void>) {
  void confirmAction({
    title: "Turn off the activity rules?", confirmLabel: "Turn off", busyLabel: "Saving…", danger: true, feature: "crew",
    message: "The monthly minimums stop: nobody moves to Check-in or Reserve and the reminders stop. Statuses stay as they are, and the history is kept.",
    onConfirm: async () => { await call(); },
  });
}
