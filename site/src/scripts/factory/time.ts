// Night Shift clock for the site (docs/specs/fun-factory.md §3): Central time, like the engine
// (functions/lib/factory/logic.js). Day keys run midnight to midnight Central; weeks start Monday.
import { centralMidnight, centralDate } from "./api";

const TZ = "America/Chicago";
function parts(t: number) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(new Date(t));
  const g = (k: string) => p.find((x) => x.type === k)!.value;
  return { y: +g("year"), m: +g("month"), d: +g("day"), wd: g("weekday") };
}
export const dayKey = (t: number) => { const { y, m, d } = parts(t); return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`; };
export function weekKey(t: number) {
  const { y, m, d } = parts(t);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dow);
  const isoYear = date.getUTCFullYear();
  const week = Math.ceil(((+date - Date.UTC(isoYear, 0, 1)) / 86400000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}
export const periodKey = (repeat: string | undefined, t: number) => (repeat === "daily" ? dayKey(t) : repeat === "weekly" ? weekKey(t) : "all");
const addDay = (key: string, n: number) => new Date(Date.parse(`${key}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
/** The next midnight Central (the daily reset). */
export const nextMidnight = (t: number) => centralMidnight(addDay(centralDate(t), 1))!;
/** The next Monday midnight Central (the weekly reset). */
export function nextMonday(t: number) {
  const dow = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[parts(t).wd] ?? 1;
  return centralMidnight(addDay(centralDate(t), 8 - dow))!;
}
