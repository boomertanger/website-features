// Bug Zapper UI pieces shared by its pages: severity, status and priority badges, the "bit me" tally, a report row and a board card, the Bug Finder mini medal,
// the zapper pop and dates. Markup follows the approved mockup (docs/design/mockups/bug-zapper-mockups.html). Who sees what is decided here with the same rules the
// Firestore rules enforce (the server is the real check).
import { escapeHtml as esc, levelBars, initials } from "../../../../shared/ui/dom.js";
import { medalHtml } from "../../../../shared/ui/medal.js";
import { stampHtml } from "../../../../shared/ui/stamp.js";
import { reducedMotion } from "../../../../shared/ui/burst.js";
import { BITE, LINK, LOCK } from "./art";
import { STATUS, SEVERITY, PRIORITY, CLOSED_VIEW, CONFIRMED_LIKE, isFrozen, type Status, type Severity, type Priority } from "./status";
import type { Report } from "./data";
import { isStaff, isMember, meOf } from "./gate";

export { esc, initials };
export const reduce = reducedMotion;
export const stamp = (label: string, kicker = "", sub = "", tone = "", size = "") => stampHtml({ label, kicker, sub, tone, size });

export const sevBadge = (k: Severity) => `<span class="bt-badge bt-badge--${SEVERITY[k].tone}">${levelBars(SEVERITY[k].level, 4)}${SEVERITY[k].label}</span>`;
export const prioBadge = (k: Priority | null) => (k ? `<span class="bt-badge bt-badge--${PRIORITY[k].tone}">${levelBars(PRIORITY[k].level, 4)}${PRIORITY[k].label} priority</span>` : "");
export const statusBadge = (k: Status) => `<span class="bt-badge bt-badge--${STATUS[k].tone}"><span class="bt-badge-dot"></span>${esc(STATUS[k].label)}</span>`;
export const privTag = `<span class="bt-badge bt-badge--gray">${LOCK.replace("<svg", '<svg width="10" height="10"')}Private</span>`;
export const hiddenTag = `<span class="bt-badge bt-badge--gray"><span class="bt-badge-dot"></span>Hidden</span>`;
export const bugFinder = (size = 18, label = "") => medalHtml({ emoji: "🐛", rarity: 2, size, label });
export const finderMini = (r: Report) => (CONFIRMED_LIKE.includes(r.status) ? `<span class="bz-finder" title="Bug Finder: this report was confirmed">${bugFinder(18, "Bug Finder")}</span>` : "");
export const handleLink = (handle: string) => (handle ? `<a href="/u/${encodeURIComponent(handle)}" class="bt-link" data-noopen>@${esc(handle)}</a>` : '<span class="bt-meta">Former member</span>');

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Oct 8" this year, "Aug 2025" before. */
export function shortDate(t: number) {
  if (!t) return "";
  const d = new Date(t), now = new Date();
  return d.getFullYear() === now.getFullYear() ? `${MONTHS[d.getMonth()]} ${d.getDate()}` : `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
export const longDate = (t: number) => (t ? new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export function ago(t: number) {
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 60) return m <= 1 ? "just now" : `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${plural(h, "hour")} ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${plural(d, "day")} ago` : shortDate(t);
}

// ---------- who sees what ----------
export const mine = (r: Report) => isMember() && !!meOf().uid && r.by.uid === meOf().uid;
/** Hidden reports are for staff, private ones for staff and their reporter. */
export const visible = (r: Report) => (r.hidden ? isStaff() : r.private ? isStaff() || mine(r) : true);
/** The reporter and staff: the thread, the screenshot and the device. */
export const insider = (r: Report) => isStaff() || mine(r);

/** The "bit me" tally. Locked (disabled) when private, hidden, your own, fixed, won't fix or a duplicate. */
export function tally(r: Report, on: boolean, { mini = false }: { mini?: boolean } = {}) {
  if (mini) return `<span class="bz-minibite">${BITE}${r.meTooCount}</span>`;
  const frozen = isFrozen(r.status) || r.private || r.hidden || mine(r);
  const lit = on && isMember();
  const label = frozen ? (mine(r) ? "You reported this" : "Closed to new bites") : lit ? "Remove your bit me too" : "Bit me too";
  return `<button type="button" class="bt-tally bz-bite${lit ? " is-active" : ""}" ${frozen ? "" : `data-bite="${esc(r.id)}"`} aria-pressed="${lit}" aria-label="${label}, ${r.meTooCount}"${frozen ? " disabled" : ""}>${BITE}<span class="bt-tally-count">${r.meTooCount}</span><span class="bt-tally-label">bit me</span></button>`;
}

/** One report row for the List view. Closed and hidden rows are dimmed. */
export function row(r: Report, on: boolean) {
  const dim = r.closed || r.hidden;
  const thread = insider(r) && r.threadCount ? `<span class="bt-count bz-lockcount" title="Private thread: you and the team">${LOCK}${r.threadCount}</span>` : "";
  return `<div class="bt-row bt-row--clickable${dim ? " bt-row--dimmed" : ""}" tabindex="0" role="button" data-open="${esc(r.id)}" aria-label="${esc(r.title)}. Open">
    ${tally(r, on)}
    <div class="bt-row-body"><div class="bt-row-title">${esc(r.title)}</div><div class="bt-row-desc">${esc(r.whatHappened)}</div>
      <div class="bt-row-meta"><span class="bt-avatar">${esc(initials(r.by.handle))}</span>${handleLink(r.by.handle)}${finderMini(r)}<span class="bz-page-ref">${LINK}${esc(r.page)}</span></div></div>
    <div class="bt-row-side"><div class="bt-row-badges">${sevBadge(r.severity)}${statusBadge(r.status)}${r.private ? privTag : ""}${r.hidden ? hiddenTag : ""}</div>${thread}<span class="bt-row-date">${shortDate(r.createdAt)}</span></div>
  </div>`;
}

export const isClosedView = (s: Status) => CLOSED_VIEW.includes(s);

/** A few dots fly off a "bit me" button that just went on, and the count pops (skipped under reduced motion). */
export function pop(btn: Element | null) {
  if (reduce() || !btn) return;
  btn.classList.remove("bz-pop"); void (btn as HTMLElement).offsetWidth; btn.classList.add("bz-pop");
  setTimeout(() => btn.classList.remove("bz-pop"), 600);
}
