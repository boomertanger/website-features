// Goal Tracker reads (docs/specs/goal-tracker.md §4), through lib/db.ts (Firestore Lite), after sign-in:
//   sites/{siteId}/public/goalTracker          the published plan (signed-up members; the rules close it to everyone else)
//   sites/{siteId}/public/goalTrackerTeaser    the headline for the gate and the home tile (anyone)
// Nothing is written from the browser: every change goes through the admin callables (functions/lib/goalTracker).

export type Status = "planned" | "progress" | "done" | "dropped";
export interface Relaunch { needed: boolean; weeks: number; side: "site" | "stream" }
export interface GItem {
  id: string; type: "track" | "goal" | "milestone" | "task"; parentId: string | null; level: number | null;
  title: string; description: string; help: string; status: Status | null; startDate: string | null; dueDate: string | null;
  order: number; relaunch: Relaunch; icon: string; metricId: string | null; target: number | null;
}
export interface Level { n: number; name: string; when: string; icon: string; status: Status; blurb: string; boss?: boolean }
export interface MetricView { label: string; unit: string; auto: boolean; value: number | null; updatedAt: number | null }
export interface Group { id: string; name: string; icon: string; done: number; total: number; items: string[] }
export interface Snapshot {
  config: { northStar: string; story: string; result: string; relaunchAt: number | null; nomineesAt: number | null; showAt: number | null };
  levels: Level[]; items: GItem[]; metrics: Record<string, MetricView>;
  readiness: { done: number; total: number; weeksLeft: number; groups: Group[] };
  publishedAt: number | null; updatedAt: number | null;
}
export interface KeyDate { key: string; label: string; at: number }
export interface Teaser { northStar: string; readiness: { done: number; total: number }; relaunchAt: number | null; nextKeyDate: KeyDate | null; updatedAt: number | null }

const lib = () => import("../../lib/db");
const ms = (v: unknown): number | null => {
  const t = v as { toMillis?: () => number } | number | null | undefined;
  return t == null ? null : typeof t === "number" ? t : typeof t.toMillis === "function" ? t.toMillis() : null;
};

/** The published plan, or null when nothing has been published yet. Throws if the read fails. */
export async function loadSnapshot(): Promise<Snapshot | null> {
  const { db, doc, getDoc, SITE_ID } = await lib();
  const snap = await getDoc(doc(db, "sites", SITE_ID, "public", "goalTracker"));
  if (!snap.exists()) return null;
  const d = snap.data() as Snapshot;
  const metrics: Record<string, MetricView> = {};
  for (const [id, m] of Object.entries(d.metrics || {})) metrics[id] = { ...m, updatedAt: ms(m.updatedAt) };
  return { ...d, items: d.items || [], levels: d.levels || [], metrics, publishedAt: ms(d.publishedAt), updatedAt: ms(d.updatedAt) };
}

/** The teaser, or null when nothing has been published. Never throws: the gate and the home tile just don't show it. */
export async function loadTeaser(): Promise<Teaser | null> {
  try {
    const { db, doc, getDoc, SITE_ID } = await lib();
    const snap = await getDoc(doc(db, "sites", SITE_ID, "public", "goalTrackerTeaser"));
    if (!snap.exists()) return null;
    const d = snap.data() as Teaser;
    return { ...d, updatedAt: ms(d.updatedAt) };
  } catch (err) {
    console.warn("goal tracker teaser unavailable", err);
    return null;
  }
}

// ---------- small helpers shared by the pages ----------
export const STATUS: Record<Status, [string, string]> = { planned: ["Planned", "gold"], progress: ["In progress", "green"], done: ["Done", "lime"], dropped: ["Dropped", "gray"] };
export const STATUS_ORDER: Status[] = ["planned", "progress", "done", "dropped"];
export const fmt = (n: number) => n.toLocaleString("en-US");
export const DAY = 86400000;

/** The next key date that hasn't passed yet. The teaser and snapshot carry dates; the browser decides what is next. */
export function nextKey(c: { relaunchAt: number | null; nomineesAt: number | null; showAt: number | null }, now = Date.now()): KeyDate | null {
  const list: KeyDate[] = [];
  if (c.relaunchAt) list.push({ key: "relaunch", label: "Relaunch", at: c.relaunchAt });
  if (c.nomineesAt) list.push({ key: "nominees", label: "Nominees announced", at: c.nomineesAt });
  if (c.showAt) list.push({ key: "show", label: "The Game Awards", at: c.showAt });
  return list.filter((k) => k.at > now).sort((a, b) => a.at - b.at)[0] ?? null;
}

/** "3 days", "5 hours", "12 minutes": a short way to say how far away a date is. */
export function untilText(at: number, now = Date.now()): string {
  const left = Math.max(0, at - now);
  const d = Math.floor(left / DAY), h = Math.floor((left % DAY) / 3600000), m = Math.floor((left % 3600000) / 60000);
  if (d >= 2) return `${d} days`;
  if (d === 1) return h ? `1 day ${h} h` : "1 day";
  if (h >= 1) return `${h} h ${m} min`;
  return `${Math.max(1, m)} min`;
}

export const dateText = (at: number) => new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
export const dateTimeText = (at: number) => new Date(at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
/** A YYYY-MM-DD plan date as "Mar 31, 2027". */
export const dayText = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};
export const pct = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 100) : 0);

/** The shared gold readiness meter (the kit's .bt-meter). */
export function meterHtml(tone: "gold" | "blue", value: number, of: number, label: string, legend = ""): string {
  const w = of > 0 ? Math.max(0, Math.min(100, (value / of) * 100)) : 0;
  return `<div class="bt-meter bt-meter--${tone}"><div class="bt-meter-track" role="meter" aria-valuemin="0" aria-valuemax="${of}" aria-valuenow="${Math.min(value, of)}" aria-label="${label.replace(/"/g, "&quot;")}"><div class="bt-meter-fill" style="width:${w}%"></div></div>${legend}</div>`;
}
