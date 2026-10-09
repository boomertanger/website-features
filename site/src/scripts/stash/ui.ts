// Cloud Stash UI helpers (docs/design/mockups/cloud-stash.html): badges, the SWEPT stamp, times and the sweep clock in Pacific time (the schedules run on Los Angeles time).
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { stampHtml } from "../../../../shared/ui/stamp.js";
import { reducedMotion } from "../../../../shared/ui/burst.js";

export { esc };
export const reduce = reducedMotion;
export const badge = (tone: string, label: string, dot = true) => `<span class="bt-badge bt-badge--${tone}">${dot ? '<span class="bt-badge-dot"></span>' : ""}${esc(label)}</span>`;
export const stamp = (o: { label: string; kicker?: string; sub?: string; tone?: string; size?: string }) => stampHtml(o);

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "3 hours ago", "Yesterday", "Oct 6". */
export function ago(t: number, now = Date.now()) {
  if (!t) return "never";
  const m = Math.round((now - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${plural(m, "minute")} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${plural(h, "hour")} ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "yesterday";
  if (d < 60) return `${d} days ago`;
  const mo = Math.round(d / 30);
  return mo < 24 ? `${mo} months ago` : `${Math.round(d / 365)} years ago`;
}
/** "71 days", "5 months", "2 hours": the age of a file without "ago". */
export const ageText = (t: number, now = Date.now()) => ago(t, now).replace(/ ago$/, "").replace(/^yesterday$/, "1 day");
const PT = { timeZone: "America/Los_Angeles" } as const;
/** "Today, 9:00 AM Pacific" / "Tomorrow, 9:00 AM Pacific" / "Oct 6, 9:00 AM Pacific" for a moment. */
export function pacific(t: number, now = Date.now()) {
  if (!t) return "never";
  const day = (x: number) => new Intl.DateTimeFormat("en-CA", PT).format(x);
  const time = new Intl.DateTimeFormat("en-US", { ...PT, hour: "numeric", minute: "2-digit" }).format(t);
  const d = day(t), today = day(now), tomorrow = day(now + 86400000), yesterday = day(now - 86400000);
  const label = d === today ? "Today" : d === tomorrow ? "Tomorrow" : d === yesterday ? "Yesterday" : new Intl.DateTimeFormat("en-US", { ...PT, month: "short", day: "numeric" }).format(t);
  return `${label}, ${time} Pacific`;
}
/** The next 9:00 AM Pacific after `now` (when scheduledAssetCleanup runs), as a moment. */
export function nextSweepAt(now = Date.now()) {
  const hourPT = (t: number) => Number(new Intl.DateTimeFormat("en-US", { ...PT, hour: "numeric", hour12: false }).format(t)) % 24;
  let t = Math.floor(now / 3600000) * 3600000 + 3600000;
  for (let i = 0; i < 26; i++, t += 3600000) if (hourPT(t) === 9) return t;
  return now + 86400000;
}
/** "Sweeps today" when the next run is still today (Pacific), else "Sweeps tomorrow". */
export function sweepWord(now = Date.now()) {
  const day = (x: number) => new Intl.DateTimeFormat("en-CA", PT).format(x);
  return day(nextSweepAt(now)) === day(now) ? "Sweeps today" : "Sweeps tomorrow";
}
export const dayShort = (t: number) => (t ? new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");
