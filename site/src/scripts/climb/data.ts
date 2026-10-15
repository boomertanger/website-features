// Creator Climb, the page's data (docs/specs/creator-climb.md §5, §8, §9): public/climb for everyone and, for members, climb/main/months, both
// through live listeners (scripts/live/cg-watch.ts: one listener per doc or query, let go while the tab is hidden). Series for the charts, the
// labels, and the members' own sums (records, pace) are worked out here from what those documents hold; nothing is invented for the gap.
//   ?as=member on localhost and staging (never production) previews the members' view while signed out: the month docs are made from
//   public/climb's month-ends (one reading per month, no streams or hours), so the layout can be checked without real member data.
import { isProduction } from "../../lib/env.js";
import { watchDoc, watchQuery } from "../live/cg-watch";
import { PLATFORM_ICONS } from "../../data/footer-icons.js";

export const PLATFORMS = ["twitch", "tiktok", "youtube"] as const;
export type Platform = (typeof PLATFORMS)[number];
export type Key = Platform | "all" | "members";
export const NAME: Record<Key, string> = { all: "Combined", twitch: "Twitch", tiktok: "TikTok", youtube: "YouTube", members: "Members" };
export const COLOR: Record<Key, string> = { all: "var(--cc-all)", twitch: "var(--cc-twitch)", tiktok: "var(--cc-tiktok)", youtube: "var(--cc-youtube)", members: "var(--cc-members)" };
const DAY = 864e5;

export interface Point { d: string; v: number; s?: string }
export interface MonthDoc {
  key: string; points: Partial<Record<Platform, Point[]>>; monthEnd: Partial<Record<Platform, number>>; startingBalance?: Partial<Record<Platform, number>>;
  gain: Partial<Record<Platform | "all", number>>; rate: number | null; streams: number | null; minutes: number | null;
  peak: { value: number; day: string; streamId: string | null } | null; likes: number | null; highlights: string[]; notes: Partial<Record<Platform, string>>;
  members: { points: Point[]; start: number; end: number; joined: number | string; left: number | string; fanClub: number | string; subClub: number | string; byMethod: Record<string, number | string> } | null;
  crossover: { tiktok: number; twitchPer100: number; youtubePer100: number; membersPer100?: number; small: boolean } | null;
  imported?: { lastReadingDay?: string | null; monthEnd?: Partial<Record<Platform, number>> } | null; preview?: boolean;
}
export interface Milestone { id: string; platform: Key; value: number; day: string }
export interface Public {
  lastReading: { day: string; at: number | null } | null;
  totals: Partial<Record<Platform | "all", number>>;
  members: { total: number | null; perThousand: number | null; start: string | null; staging: boolean; monthEnd: { month: string; day: string; total: number }[]; milestones: Milestone[] };
  crossover: { span: { from: string; to: string }; tiktok: number; twitch: number | null; youtube: number | null; members?: number; eras: { era: string; label: string; tiktok: number; twitch: number | null; youtube: number | null }[] } | null;
  monthEnd: ({ month: string; day: string } & Partial<Record<Platform | "all", number>>)[];
  gaps: { from: string; to: string | null }[];
  eras: { id: string; label: string; from: string | null; to: string | null; note?: string }[];
  milestones: Milestone[];
  goals: Partial<Record<Platform | "all" | "members", number>>;
  counts: { months: number; milestones: number };
  records: { id: string; month: string; platform: string; value: number; label: string }[];
}

export const ms = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)) || 1);
export const fmt = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : Math.round(n).toLocaleString("en-US"));
export const monthLabel = (key: string, long = false) => new Date(ms(`${key}-01`)).toLocaleDateString("en-US", { month: long ? "long" : "short", year: "numeric", timeZone: "UTC" });
export const dayLabel = (d: string) => new Date(ms(d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export const todayMs = () => { const n = new Date(); return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()); };
export const escapeHtml = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/** A platform's official icon (site/src/data/footer-icons.js), or the members star / the combined sigma. */
export function iconHtml(k: Key) {
  const path = (PLATFORM_ICONS as Record<string, string>)[k];
  const inner = path ? `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"/></svg>` : k === "members" ? "★" : "∑";
  return `<span class="cc-pi" data-p="${k}" aria-hidden="true">${inner}</span>`;
}
/** ?as=member: localhost and staging only. */
export const previewMember = () => !isProduction && new URLSearchParams(location.search).get("as") === "member";

// ---------------------------------------------------------------------------------------------- listeners
export function watchPublic(onData: (p: Public | null) => void) {
  return watchDoc(["public", "climb"], (d) => onData(d ? (d as Public) : null), () => onData(null));
}
/** Members: every month doc. onErr when the rules say no (no members doc). */
export function watchMonths(onData: (m: Map<string, MonthDoc>) => void, onErr: () => void) {
  return watchQuery(["climb", "main", "months"], [], (docs) => onData(new Map(docs.map((d: any) => [d.id, { key: d.id, ...d } as MonthDoc]))), onErr);
}
/** The preview's month docs, from public/climb's month-ends only (labelled preview). */
export function previewMonths(p: Public): Map<string, MonthDoc> {
  const out = new Map<string, MonthDoc>();
  let prev: Public["monthEnd"][number] | null = null;
  for (const r of p.monthEnd) {
    if (!PLATFORMS.some((k) => r[k] != null)) { prev = r; continue; }
    const points: MonthDoc["points"] = {}, monthEnd: MonthDoc["monthEnd"] = {}, gain: MonthDoc["gain"] = {};
    let all = 0;
    for (const k of PLATFORMS) {
      if (r[k] == null) continue;
      points[k] = [{ d: r.day, v: r[k]!, s: "import" }]; monthEnd[k] = r[k]!;
      if (prev && prev[k] != null) { gain[k] = r[k]! - prev[k]!; all += gain[k]!; }
    }
    gain.all = all;
    out.set(r.month, { key: r.month, points, monthEnd, gain, rate: null, streams: null, minutes: null, peak: null, likes: null, highlights: [], notes: {}, members: null, crossover: null, preview: true });
    prev = r;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- series
export interface SPoint { t: number; v: number; src?: string }
const lastImportDay = (p: Public) => (p.gaps[0] ? p.gaps[0].from : null);
const srcOf = (p: Public, day: string) => { const li = lastImportDay(p); return li && day <= li ? "import" : "live"; };
/** Month-end series per line (visitors' chart; the hero's ridge is the combined one). */
export function monthEndSeries(p: Public): Record<Platform | "all", SPoint[]> {
  const out = { all: [], twitch: [], tiktok: [], youtube: [] } as Record<Platform | "all", SPoint[]>;
  for (const r of p.monthEnd) {
    const t = ms(r.day), src = srcOf(p, r.day);
    if (r.all != null) out.all.push({ t, v: r.all, src });
    for (const k of PLATFORMS) if (r[k] != null) out[k].push({ t, v: r[k]!, src });
  }
  return out;
}
/** Every reading per platform (members), the imported month-end added as its own reading where the chart missed it (as lib/climb does). */
export function readingSeries(months: Map<string, MonthDoc>): Record<Platform, Point[]> {
  const out = { twitch: [], tiktok: [], youtube: [] } as Record<Platform, Point[]>;
  for (const key of [...months.keys()].sort()) {
    const m = months.get(key)!;
    for (const k of PLATFORMS) {
      const pts = (m.points[k] || []).slice();
      const end = m.imported?.monthEnd?.[k];
      if (end != null && (!pts.length || pts[pts.length - 1].v !== end)) {
        const last = pts[pts.length - 1];
        const lastDayOfMonth = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).toISOString().slice(0, 10);
        const day = m.imported?.lastReadingDay || lastDayOfMonth;
        pts.push({ d: last && last.d > day ? last.d : day, v: end, s: "import" });
      }
      out[k].push(...pts);
    }
  }
  return out;
}
/** Combined readings: every day each platform that has started has a reading; the combined-only months (Jan–May 2025) as month-ends first. */
export function combinedSeries(p: Public, per: Record<Platform, Point[]>): SPoint[] {
  const firstFull = p.monthEnd.find((r) => PLATFORMS.some((k) => r[k] != null));
  const early = p.monthEnd.filter((r) => !PLATFORMS.some((k) => r[k] != null) && r.all != null).map((r) => ({ t: ms(r.day), v: r.all!, src: "import" }));
  const firsts = Object.fromEntries(PLATFORMS.filter((k) => per[k].length).map((k) => [k, per[k][0].d])) as Record<Platform, string>;
  const maps = Object.fromEntries(PLATFORMS.map((k) => [k, new Map(per[k].map((r) => [r.d, r]))])) as Record<Platform, Map<string, Point>>;
  const days = [...new Set(PLATFORMS.flatMap((k) => per[k].map((r) => r.d)))].sort();
  const out: SPoint[] = [];
  for (const d of days) {
    let sum = 0, ok = true, imp = true;
    for (const k of PLATFORMS) {
      if (!firsts[k] || firsts[k] > d) continue;
      const r = maps[k].get(d);
      if (!r) { ok = false; break; }
      sum += r.v; if (r.s !== "import") imp = false;
    }
    if (ok) out.push({ t: ms(d), v: sum, src: imp ? "import" : "live" });
  }
  return firstFull ? [...early, ...out] : out;
}
export const toS = (pts: Point[]): SPoint[] => pts.map((r) => ({ t: ms(r.d), v: r.v, src: r.s === "import" ? "import" : "live" }));
export function gapsOf(p: Public) { return p.gaps.map((g) => ({ from: ms(g.from), to: g.to ? ms(g.to) : todayMs() })); }
export function erasOf(p: Public) {
  return p.eras.filter((e) => e.from).map((e) => ({ from: ms(e.from!), to: e.to ? ms(e.to) + DAY : todayMs(), label: e.label }));
}
/** The era a month belongs to. */
export function eraOf(p: Public, key: string) { return p.eras.find((e) => e.from && key >= e.from.slice(0, 7) && (!e.to || key <= e.to.slice(0, 7))) || null; }
/** All milestones, followers and members, newest first. */
export function allMilestones(p: Public): Milestone[] {
  return [...p.milestones, ...(p.members?.milestones || []).map((m) => ({ ...m, platform: "members" as Key }))].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : b.value - a.value));
}

// ---------------------------------------------------------------------------------------------- members' sums
export function records(months: Map<string, MonthDoc>, per: Record<Platform, Point[]>) {
  const list = [...months.values()].filter((m) => !m.preview);
  const best = list.filter((m) => m.gain?.all != null).sort((a, b) => (b.gain.all as number) - (a.gain.all as number))[0] || null;
  const most = list.filter((m) => m.streams != null).sort((a, b) => (b.streams as number) - (a.streams as number))[0] || null;
  let jump: { platform: Platform; value: number; from: string; to: string } | null = null;
  for (const k of PLATFORMS) { const r = per[k]; for (let i = 1; i < r.length; i++) { const v = r[i].v - r[i - 1].v; if (!jump || v > jump.value) jump = { platform: k, value: v, from: r[i - 1].d, to: r[i].d }; } }
  const peak = list.map((m) => m.peak).filter(Boolean).sort((a, b) => b!.value - a!.value)[0] || null;
  return { best, most, jump, peak };
}
/** "At this pace" (§9): least squares over the last 60 days with at least 14 readings. */
export function pace(points: SPoint[], goal: number | null) {
  const cut = todayMs() - 60 * DAY;
  const r = points.filter((p) => p.t >= cut);
  if (r.length < 14) return { state: "paused" as const, readings: r.length };
  const n = r.length, mx = r.reduce((a, p) => a + p.t, 0) / n, my = r.reduce((a, p) => a + p.v, 0) / n;
  let num = 0, den = 0;
  r.forEach((p) => { num += (p.t - mx) * (p.v - my); den += (p.t - mx) ** 2; });
  const slope = den ? num / den : 0;   // per ms
  const last = r[r.length - 1];
  if (slope <= 0) return { state: "steady" as const, perDay: 0 };
  if (!goal || last.v >= goal) return { state: "climbing" as const, perDay: slope * DAY };
  const at = last.t + (goal - last.v) / slope;
  return { state: "goal" as const, perDay: slope * DAY, at };
}
