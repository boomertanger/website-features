// Feature Lab UI pieces shared by its pages: status and priority badges, the vote tally, an idea row, The Architect mini medal,
// dates, the IDEA IN / SHIPPED stamps and the vote pop. Markup follows the approved mockup (docs/design/mockups/feature-lab-mockups.html).
import { escapeHtml as esc, levelBars } from "../../../../shared/ui/dom.js";
import { medalHtml } from "../../../../shared/ui/medal.js";
import { stampHtml } from "../../../../shared/ui/stamp.js";
import { reducedMotion } from "../../../../shared/ui/burst.js";
import { I } from "./art";
import { STATUS, PRIORITY, AREA, voteLocked, type Status, type Priority } from "./status";
import type { Idea } from "./data";
import { authorLink, type Author } from "../boards/profiles";

export { esc };
export const reduce = reducedMotion;

export const sBadge = (k: Status) => `<span class="bt-badge bt-badge--${STATUS[k].tone}"><span class="bt-badge-dot"></span>${STATUS[k].label}</span>`;
export const pBadge = (k: Priority | null) => (k ? `<span class="bt-badge bt-badge--${PRIORITY[k].tone}">${levelBars(PRIORITY[k].level, 3)}${PRIORITY[k].label}</span>` : "");
export const architect = (size = 18, label = "") => medalHtml({ emoji: "🏛", rarity: 4, size, label });
export const stamp = (label: string, kicker = "", sub = "", tone = "", size = "") => stampHtml({ label, kicker, sub, tone, size });

export const initialsOf = (handle: string) => (handle || "?").replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase() || "?";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Oct 8" this year, "Aug 2025" before. */
export function shortDate(t: number) {
  if (!t) return "";
  const d = new Date(t), now = new Date();
  return d.getFullYear() === now.getFullYear() ? `${MONTHS[d.getMonth()]} ${d.getDate()}` : `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
export const longDate = (t: number) => (t ? new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "3 days ago" for the /admin card. */
export function ago(t: number) {
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 60) return m <= 1 ? "just now" : `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${plural(h, "hour")} ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${plural(d, "day")} ago` : shortDate(t);
}
export const areaLabel = (a: string) => AREA[a as keyof typeof AREA] || "Other";
/** The author chip: the live handle from the member's profile (scripts/boards/profiles.ts; fillAuthors() swaps it in), "Former member" for a deleted account. */
export const handleLink = (by: Author) => authorLink(by);

/** The vote tally (.bt-tally). Locked (disabled) once an idea is Shipped or Declined. */
export function tally(i: Idea, voted: boolean) {
  const n = i.voteCount;
  if (voteLocked(i)) return `<button type="button" class="bt-tally${voted ? " is-active" : ""}" disabled aria-label="${n} votes. Voting is closed">${I.up}<span class="bt-tally-count">${n}</span><span class="bt-tally-label">votes</span></button>`;
  return `<button type="button" class="bt-tally${voted ? " is-active" : ""}" data-vote="${esc(i.id)}" aria-pressed="${voted}" aria-label="${voted ? "Remove your vote" : "Vote for this idea"}">${I.up}<span class="bt-tally-count">${n}</span><span class="bt-tally-label">votes</span></button>`;
}

/** One idea row for the List view. `staff` shows hidden ideas dimmed with a gray Hidden badge. */
export function row(i: Idea, voted: boolean, staff: boolean) {
  const arch = i.status === "shipped" ? `<span class="fl-arch" title="The Architect">${architect(18, "The Architect")}</span>` : "";
  const dim = i.status === "declined" || (i.hidden && staff);
  return `<div class="bt-row bt-row--clickable${dim ? " bt-row--dimmed" : ""}" tabindex="0" role="button" data-open="${esc(i.id)}" aria-label="${esc(i.title)}. Open">
    ${tally(i, voted)}
    <div class="bt-row-body"><div class="bt-row-title">${esc(i.title)}</div><div class="bt-row-desc">${esc(i.description)}</div>
      <div class="bt-row-meta"><span class="bt-avatar">${initialsOf(i.by.handle)}</span>${handleLink(i.by)}${arch}<span class="fl-area">· ${areaLabel(i.area)}</span></div></div>
    <div class="bt-row-side"><div class="bt-row-badges">${i.hidden && staff ? '<span class="bt-badge bt-badge--gray">Hidden</span>' : ""}${pBadge(i.priority)}${sBadge(i.status)}</div>
      ${i.commentCount ? `<span class="bt-count">${I.cmt}${i.commentCount}</span>` : ""}<span class="bt-row-date">${shortDate(i.createdAt)}</span></div></div>`;
}

/** A few dots fly off a vote button that just went on (skipped under reduced motion). */
export function pop(btn: Element | null) {
  if (reduce() || !btn) return;
  const p = document.createElement("span");
  p.className = "fl-pop";
  p.setAttribute("aria-hidden", "true");
  for (let k = 0; k < 8; k++) {
    const a = (Math.PI * 2 * k) / 8 - Math.PI / 2, d = 16 + Math.random() * 14, i = document.createElement("i");
    i.style.setProperty("--x", `${Math.cos(a) * d - 3}px`);
    i.style.setProperty("--y", `${Math.sin(a) * d - 8}px`);
    p.appendChild(i);
  }
  btn.appendChild(p);
  setTimeout(() => p.remove(), 750);
}
