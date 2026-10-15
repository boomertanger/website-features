// site/src/scripts/base-camp/climb.ts — Base Camp's read of Creator Climb (docs/specs/base-camp.md Addendum 3): sites/boomertanger/public/climb,
// read once per page, never written. Base Camp hard-codes no follower number: every count and date it shows comes from here.
//   loadClimb()              → Climb | null (null: the doc doesn't exist yet, or it couldn't be read; callers hide what needs it)
//   fill(text, climb, ctx?)  → the text with every {…} filled, or null when one can't be filled (callers drop that sentence or line)
//     {totals.all} · {YYYY-MM.all} (that month's last reading) · {<milestone id>.value} / {<milestone id>.day} · {value} / {day} (ctx milestone)
//   dropUnfilled(text, climb) → the text with each sentence that has a placeholder it can't fill left out
//   backOnAir(climb)         → true once the "Back on air" era has a start date on or before today (the stage 5 tag turns lime by itself)
export interface Milestone { id: string; platform: string; value: number; day: string }
export interface MonthEnd { month: string; day: string; all?: number; twitch?: number; tiktok?: number; youtube?: number }
export interface Climb {
  lastReading: { day: string; at: number | null } | null;
  totals: { all?: number; twitch?: number; tiktok?: number; youtube?: number };
  monthEnd: MonthEnd[];
  milestones: Milestone[];
  eras: { id: string; label: string; from: string | null; to: string | null }[];
}

let cache: Promise<Climb | null> | null = null;
export function loadClimb(): Promise<Climb | null> {
  cache ??= (async () => {
    try {
      const { db, doc, getDoc, SITE_ID } = await import("../../lib/db");
      const s = await getDoc(doc(db, "sites", SITE_ID, "public", "climb"));
      if (!s.exists()) return null;
      const d = s.data() as Climb;
      // month-ends in date order (the combined-only months can arrive out of order)
      return { ...d, monthEnd: [...(d.monthEnd || [])].sort((a, b) => (a.month < b.month ? -1 : 1)), milestones: d.milestones || [], eras: d.eras || [] };
    } catch (err) {
      console.warn("base camp: couldn't read public/climb", err);
      return null;
    }
  })();
  return cache;
}

export const fmt = (n: number) => n.toLocaleString("en-US");
const UTC = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`);
export const longDate = (d: string) => UTC(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
export const shortDate = (d: string) => UTC(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export const monthName = (m: string) => UTC(`${m}-15`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/** One placeholder's value, or null. */
function value(key: string, c: Climb, ctx?: Milestone): string | null {
  if (key === "totals.all") return typeof c.totals.all === "number" ? fmt(c.totals.all) : null;
  if (ctx && key === "value") return fmt(ctx.value);
  if (ctx && key === "day") return longDate(ctx.day);
  const m = /^(\d{4}-\d{2})\.(all|twitch|tiktok|youtube)$/.exec(key);
  if (m) { const r = c.monthEnd.find((x) => x.month === m[1]); const v = r ? r[m[2] as "all"] : undefined; return typeof v === "number" ? fmt(v) : null; }
  const ms = /^([a-z]+-\d+)\.(value|day)$/.exec(key);
  if (ms) { const x = c.milestones.find((y) => y.id === ms[1]); return x ? (ms[2] === "value" ? fmt(x.value) : longDate(x.day)) : null; }
  return null;
}
export function fill(text: string, c: Climb, ctx?: Milestone): string | null {
  let ok = true;
  const out = text.replace(/\{([^{}]+)\}/g, (_, k: string) => { const v = value(k.trim(), c, ctx); if (v == null) ok = false; return v ?? ""; });
  return ok ? out : null;
}
export function dropUnfilled(text: string, c: Climb | null): string {
  return text.split(/(?<=[.!?])\s+/).map((s) => (/\{[^{}]+\}/.test(s) ? (c ? fill(s, c) : null) : s)).filter((s): s is string => !!s).join(" ");
}
export function backOnAir(c: Climb | null) {
  if (!c) return false;
  const e = c.eras.find((x) => x.label === "Back on air" || x.id === "back-on-air");
  const today = new Date().toISOString().slice(0, 10);
  return !!(e && e.from && e.from <= today);
}
