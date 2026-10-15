// site/src/scripts/pulse/data.ts — what /admin/pulse reads (docs/specs/traffic-pulse.md §8, §9). Admins read sites/boomertanger/pulse/main
// (firestore.rules); every write goes through pulseAdmin. Nothing is ever sorted by document id descending: ranges are ascending id ranges
// (the ids are YYYY-MM-DD days), and lists sort by a field.
// Preview (non-production, signed out, ?as=admin): sample data built here in memory (90 days, clearly labelled), so the page can be checked
// without an admin account. Dates are Los Angeles days.
import { isPreview } from "../stash/gate";

export type Range = "today" | "7d" | "28d" | "90d" | "12m";
export const RANGES: [Range, string, number][] = [["today", "Today", 1], ["7d", "7 days", 7], ["28d", "28 days", 28], ["90d", "90 days", 90], ["12m", "12 months", 365]];
export interface Day { day: string; views?: number; uniques?: number; engaged?: number; errors?: number; signedIn?: number; members?: number; memberReturns?: number; joinOpens?: number; newMembers?: number; ctas?: Record<string, number>; scroll?: Record<string, number>; devices?: Record<string, number>; hours?: Record<string, number>; live?: { views?: number }; cf?: { visits?: number; countries?: Record<string, number>; browsers?: Record<string, number> } }
export interface Scored { id: string; name: string; ok: boolean; views: number; prevViews: number; eng: number; errPerK: number; reach: number; engagement: number; health: number; love: number | null; score: number | null; group: "expand" | "fix" | "spotlight" | "rethink" | null; utility: boolean; median: number; vit?: { lcp: number | null; inp: number | null; cls: number | null } }
export interface Move { id: string; service: string; group: string; title: string; text: string; evidence: string[]; impact: number; action: string; done?: boolean }
export interface Alert { id: string; type: string; severity: "urgent" | "watch" | "good"; service: string | null; title: string; facts: Record<string, unknown>; state: "new" | "ack" | "snoozed" | "resolved"; firstAt: number | null; ack: { name: string } | null; snoozeUntil: number | null }
export interface Goal { id: string; kind: string; target: number; month: string; service: string | null; label: string | null }
export interface Note { id: string; day: string; service: string | null; text: string; auto: string | null; by: { name: string } | null }
export interface Report { id: string; kind: "week" | "month"; from: string; to: string; headline: { now: Record<string, number>; prev: Record<string, number> }; top: { id: string; name: string; score: number; views: number; group: string }[]; bottom: { id: string; name: string; score: number; views: number; group: string }[]; sources: { from: string; n: number }[]; bestStream: { title: string; visits: number; joins: number } | null; alerts: { type: string; title: string; state: string }[]; moves: Move[]; goals: Goal[] }
export interface Stream { id: string; title: string | null; start: number | null; end: number | null; visits: number; joins: number; refs: Record<string, number>; peakMinute: { at: number; views: number } | null }
export interface PulseData {
  sample: boolean; settings: { excludeStaff: boolean; sampling: number; rules: Record<string, Record<string, number | boolean>>; cf?: { status: string; error?: string | null; checkedAt?: number | null; missing?: string[] } };
  scores: { day: string; services: Scored[]; join?: { steps: { key: string; label: string; n: number; drop?: number }[]; weakest: { key: string; label: string; drop: number } | null }; topErrors?: { service: string; m: string; n: number }[] } | null;
  moves: Move[]; goals: Goal[]; alerts: Alert[]; notes: Note[]; reports: Report[]; refs: { tag: string; label: string; path: string }[];
  days: Day[]; sources: { day: string; refs?: Record<string, number>; tags?: Record<string, number>; platforms?: Record<string, number> }[]; months: (Day & { month: string })[];
  streams: Stream[]; broken: { path: string; count: number }[];
}

const DAY = 864e5;
const laDay = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date(ms));
export const today = () => laDay(Date.now());
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const msOf = (v: unknown): number | null => (v == null ? null : typeof v === "number" ? v : typeof (v as { toMillis?: () => number }).toMillis === "function" ? (v as { toMillis: () => number }).toMillis() : null);

export async function load(range: Range): Promise<PulseData> {
  if (isPreview()) return previewData();
  const { db, doc, getDoc, collection, getDocs, query, where, orderBy, limit, SITE_ID } = await import("../../lib/db");
  const { documentId } = await import("firebase/firestore/lite");
  const base = ["sites", SITE_ID, "pulse", "main"] as const;
  const col = (...p: string[]) => collection(db, ...base, ...p);
  const n = RANGES.find(([k]) => k === range)![2];
  const to = today(), from = addDays(to, -(Math.min(n, 90) * 2) + 1);
  const month = to.slice(0, 7);
  const between = (c: ReturnType<typeof col>, a: string, b: string) => query(c, where(documentId(), ">=", a), where(documentId(), "<=", b));
  const [settings, scores, moves, goals, alerts, notes, reports, refs, days, sources, months, streams, broken] = await Promise.all([
    getDoc(doc(db, ...base, "settings", "main")), getDoc(doc(db, ...base, "scores", "current")), getDoc(doc(db, ...base, "moves", "current")),
    getDocs(query(col("goals"), where("month", "==", month))),
    getDocs(query(col("alerts"), orderBy("firstAt", "desc"), limit(100))),
    getDocs(query(col("notes"), where("day", ">=", addDays(to, -400)))),
    getDocs(query(col("reports"), orderBy("createdAt", "desc"), limit(30))),
    getDocs(col("refs")),
    getDocs(between(col("days"), from, to)),
    getDocs(between(col("sources"), from, to)),
    range === "12m" ? getDocs(between(col("months"), addDays(to, -730).slice(0, 7), month)) : Promise.resolve(null),
    getDocs(query(col("streams"), orderBy("start", "desc"), limit(20))),
    getDocs(query(collection(db, "sites", SITE_ID, "brokenLinks"), orderBy("count", "desc"), limit(40))).catch(() => null),
  ]);
  const st = settings.exists() ? (settings.data() as PulseData["settings"] & { sample?: boolean }) : null;
  return {
    sample: !!st?.sample,
    settings: { excludeStaff: st?.excludeStaff ?? true, sampling: st?.sampling ?? 1, rules: st?.rules || {}, cf: st?.cf ? { ...st.cf, checkedAt: msOf((st.cf as { checkedAt?: unknown }).checkedAt) } : undefined },
    scores: scores.exists() ? (scores.data() as PulseData["scores"]) : null,
    moves: moves.exists() ? ((moves.get("list") as Move[]) || []) : [],
    goals: goals.docs.map((d) => ({ id: d.id, ...d.data() }) as Goal),
    alerts: alerts.docs.map((d) => { const x = d.data(); return { ...x, id: d.id, firstAt: msOf(x.firstAt), snoozeUntil: msOf(x.snoozeUntil) } as Alert; }),
    notes: notes.docs.map((d) => ({ id: d.id, ...d.data() }) as Note),
    reports: reports.docs.map((d) => ({ id: d.id, ...d.data() }) as Report),
    refs: refs.docs.map((d) => ({ tag: d.id, ...d.data() }) as PulseData["refs"][number]),
    days: days.docs.map((d) => ({ day: d.id, ...d.data() }) as Day),
    sources: sources.docs.map((d) => ({ day: d.id, ...d.data() })),
    months: months ? months.docs.map((d) => ({ month: d.id, day: `${d.id}-01`, ...d.data() }) as Day & { month: string }) : [],
    streams: streams.docs.map((d) => { const x = d.data(); return { ...x, id: d.id, start: msOf(x.start), end: msOf(x.end), peakMinute: x.peakMinute ? { at: msOf(x.peakMinute.at)!, views: x.peakMinute.views } : null } as Stream; }),
    broken: broken ? broken.docs.filter((d) => !d.get("fixedAt")).map((d) => ({ path: d.get("path"), count: d.get("count") || 0 })) : [],
  };
}

/** The last 24 hours by hour for the monitor (today's hours, then yesterday's before them) and a usual same weekday. */
export async function monitorData(): Promise<{ hours: number[]; usual: number[]; liveHours: number[]; nowHour: number; weekday: string } | null> {
  const t = today(), y = addDays(t, -1);
  const nowHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "long" }).format(new Date());
  let docs: (Day | null)[];
  if (isPreview()) { const p = previewData(); const by = new Map(p.days.map((d) => [d.day, d])); docs = [t, y, ...[7, 14, 21, 28].map((n) => addDays(t, -n))].map((k) => by.get(k) || null); }
  else {
    const { db, doc, getDoc, SITE_ID } = await import("../../lib/db");
    const ids = [t, y, ...[7, 14, 21, 28].map((n) => addDays(t, -n))];
    docs = (await Promise.all(ids.map((k) => getDoc(doc(db, "sites", SITE_ID, "pulse", "main", "days", k))))).map((s) => (s.exists() ? (s.data() as Day) : null));
  }
  const h = (d: Day | null, hh: number) => (d?.hours || {})[String(hh).padStart(2, "0")] || 0;
  const hours: number[] = [], usual: number[] = [];
  for (let i = 23; i >= 0; i--) {
    const hh = (nowHour - i + 24) % 24, fromToday = nowHour - i >= 0;
    hours.push(h(fromToday ? docs[0] : docs[1], hh));
    const same = docs.slice(2).map((d) => h(d, hh)).sort((a, b) => a - b);
    usual.push(same.length ? (same[1] + same[2]) / 2 || same[same.length - 1] : 0);
  }
  if (!docs[0] && !docs[1]) return null;
  return { hours, usual, liveHours: [], nowHour, weekday };
}

// ---------------------------------------------------------------------------------------------- the preview's sample data
let cache: PulseData | null = null;
export function previewData(): PulseData {
  if (cache) return cache;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const t = today();
  const SVC: [string, string, number, number][] = [["home", "Home", 420, 0.43], ["game-vault", "Game Vault", 310, 0.64], ["boom-arcade", "Boom Arcade", 240, 0.72], ["live", "Live", 220, 0.55], ["tech-stack", "Tech Stack", 170, 0.29], ["scream-planner", "Scream Planner", 130, 0.58], ["night-shift", "Night Shift", 70, 0.34], ["hotline-boom", "Hotline Boom", 48, 0.48], ["trophy-room", "Trophy Room", 40, 0.66], ["feature-lab", "Feature Lab", 29, 0.61], ["chat-games", "Chat Games", 21, 0.74], ["bug-zapper", "Bug Zapper", 17, 0.38], ["services", "Service Hub", 13, 0.27], ["creator-climb", "Creator Climb", 30, 0.62]];
  const days: Day[] = [];
  for (let i = 179; i >= 0; i--) {
    const day = addDays(t, -i), wd = new Date(`${day}T12:00:00Z`).getUTCDay(), growth = 1 + (179 - i) / 400, live = wd === 2 || wd === 4 || wd === 6;
    const views = Math.round(1900 * growth * (live ? 1.35 : 0.95) * (0.85 + rnd() * 0.3));
    const hours: Record<string, number> = {};
    for (let hh = 0; hh < 24; hh++) hours[String(hh).padStart(2, "0")] = Math.round((views / 24) * (0.3 + (hh >= 17 && hh <= 22 ? 2.2 : hh >= 9 ? 1 : 0.4)) * (0.8 + rnd() * 0.4) * (live && hh >= 19 && hh <= 21 ? 1.6 : 1));
    if (i === 0) { const nh = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "2-digit", hourCycle: "h23" }).format(new Date())); for (let hh = nh + 1; hh < 24; hh++) delete hours[String(hh).padStart(2, "0")]; }
    days.push({ day, views, uniques: Math.round(views * 0.31), engaged: Math.round(views * (0.5 + rnd() * 0.06)), errors: Math.round(rnd() * 12), signedIn: Math.round(views * 0.22), members: Math.round(views * 0.05), memberReturns: Math.round(views * 0.03), joinOpens: Math.round(views * 0.02), newMembers: Math.round(4 + rnd() * 10 * growth), live: { views: live ? Math.round(views * 0.3) : 0 },
      devices: { phone: Math.round(views * 0.58), desktop: Math.round(views * 0.34), tablet: Math.round(views * 0.08) }, hours, ctas: { "hero-watch": Math.round(views * 0.03), "vote-play-this": Math.round(views * 0.02), "play-now": Math.round(views * 0.05) },
      cf: { visits: Math.round(views * 0.36), countries: { "United States": Math.round(views * 0.2), Canada: Math.round(views * 0.07), "United Kingdom": Math.round(views * 0.03), Germany: Math.round(views * 0.02) }, browsers: { Chrome: Math.round(views * 0.2), Safari: Math.round(views * 0.12) } } });
  }
  const services: Scored[] = SVC.map(([id, name, v, eng], i) => {
    const views = Math.round(v * 28 * (0.9 + rnd() * 0.2)), prevViews = Math.round(views * (0.75 + rnd() * 0.4));
    return { id, name, ok: true, views, prevViews, eng, errPerK: Math.round(rnd() * 30) / 10, reach: 0, engagement: Math.round(eng * 100), health: Math.round(70 + rnd() * 30), love: i % 3 ? Math.round(60 + rnd() * 35) : null, score: 0, group: null, utility: id === "bug-zapper", median: 0, vit: { lcp: Math.round((1.6 + rnd() * 1.6) * 10) / 10, inp: Math.round(100 + rnd() * 140), cls: Math.round(rnd() * 12) / 100 } };
  });
  const med = [...services.map((s) => s.views)].sort((a, b) => a - b)[services.length >> 1];
  services.forEach((s) => { s.median = med; s.reach = Math.min(100, Math.round(50 * Math.log2(1 + s.views / med))); s.group = s.views >= med ? (s.eng >= 0.5 ? "expand" : "fix") : s.eng >= 0.5 ? "spotlight" : "rethink"; s.score = Math.round((s.reach + s.engagement + s.health + (s.love ?? s.health)) / 4); });
  const sum = (k: keyof Day) => days.slice(-28).reduce((a, d) => a + ((d[k] as number) || 0), 0);
  cache = {
    sample: true,
    settings: { excludeStaff: true, sampling: 1, rules: { spike: { on: true, factor: 3 }, drop: { on: true, below: 0.5 }, silence: { on: true, hours: 2 }, errors: { on: true, factor: 3, abs: 20 }, missing: { on: true, hits: 10 }, slow: { on: true, lcp: 2.5, days: 3 }, goal: { on: true, behind: 0.15 }, record: { on: true } }, cf: { status: "not-connected", missing: ["token"] } },
    scores: { day: addDays(t, -1), services, topErrors: [{ service: "boom-arcade", m: "TypeError: Cannot read properties of null (reading 'score')", n: 41 }, { service: "tech-stack", m: "ResizeObserver loop completed with undelivered notifications", n: 12 }],
      join: { steps: [{ key: "visited", label: "Visited", n: sum("uniques") }, { key: "opened", label: "Opened Join", n: sum("joinOpens"), drop: 0.88 }, { key: "started", label: "Started signup", n: Math.round(sum("joinOpens") * 0.55), drop: 0.45 }, { key: "accounts", label: "Made an account", n: sum("newMembers"), drop: 0.2 }, { key: "returned", label: "Came back within 7 days", n: Math.round(sum("newMembers") * 0.6), drop: 0.4 }], weakest: { key: "opened", label: "Opened Join", drop: 0.88 } } },
    moves: [
      { id: "fix-tech-stack", service: "tech-stack", group: "fix", title: "Tech Stack", text: "Lots of people open Tech Stack, but only 29% stay 10 seconds. Look at what they see first.", evidence: ["4,760 views", "29% engaged", "site goal 50%"], impact: 4, action: "Open the service" },
      { id: "spot-chat-games", service: "chat-games", group: "spotlight", title: "Chat Games", text: "People who find Chat Games stay (74% engaged), but few find it. Link to it from the home page or a stream.", evidence: ["590 views", "74% engaged"], impact: 3, action: "Open the service" },
      { id: "join-path", service: "join", group: "fix", title: "Join path", text: "The biggest drop on the way to joining is \"Opened Join\": 88% of people stop there.", evidence: ["Visited 18,240", "Opened Join 2,190"], impact: 3, action: "Open the join path" },
      { id: "health-boom-arcade", service: "boom-arcade", group: "fix", title: "Boom Arcade", text: "Boom Arcade has health issues: 2.1 script errors per 1,000 views.", evidence: ["health 64", "2.1 errors / 1k"], impact: 2, action: "Open Health" },
    ],
    goals: [{ id: "g1", kind: "visitors", target: 20000, month: t.slice(0, 7), service: null, label: null }, { id: "g2", kind: "members", target: 400, month: t.slice(0, 7), service: null, label: null }, { id: "g3", kind: "returnRate", target: 50, month: t.slice(0, 7), service: null, label: null }],
    alerts: [
      { id: "a1", type: "spike", severity: "urgent", service: "game-vault", title: "Traffic spike on Game Vault", facts: { views: 480, usual: 120, hour: "20", from: [{ from: "twitch.tv", n: 210 }] }, state: "new", firstAt: Date.now() - 3600e3, ack: null, snoozeUntil: null },
      { id: "a2", type: "slow", severity: "urgent", service: "tech-stack", title: "Slow pages on Tech Stack", facts: { lcp: [3.4, 3.1, 3.2] }, state: "ack", firstAt: Date.now() - 86400e3, ack: { name: "@gbo" }, snoozeUntil: null },
      { id: "a3", type: "record", severity: "good", service: null, title: "Record day", facts: { day: addDays(t, -1), views: days[days.length - 2].views }, state: "new", firstAt: Date.now() - 8 * 3600e3, ack: null, snoozeUntil: null },
      { id: "a4", type: "errors", severity: "watch", service: "boom-arcade", title: "Error surge on Boom Arcade", facts: { errors: 24, usual: 6 }, state: "resolved", firstAt: Date.now() - 4 * 86400e3, ack: null, snoozeUntil: null },
    ],
    notes: [{ id: "n1", day: addDays(t, -20), service: "game-vault", text: "Game Vault 1.2", auto: "version", by: null }, { id: "n2", day: addDays(t, -9), service: null, text: "Stream: Granny Gauntlet, night 12", auto: "stream", by: null }, { id: "n3", day: addDays(t, -4), service: null, text: "Shared the Arcade on TikTok", auto: null, by: { name: "@gbo" } }],
    reports: [{ id: "w-sample", kind: "week", from: addDays(t, -13), to: addDays(t, -7), headline: { now: { views: 15800, uniques: 4900, engaged: 8400, newMembers: 96, joinOpens: 310 }, prev: { views: 14100, uniques: 4500, engaged: 7300, newMembers: 81, joinOpens: 290 } },
      top: services.slice(0, 3).map((s) => ({ id: s.id, name: s.name, score: s.score!, views: s.views, group: s.group! })), bottom: services.slice(-3).map((s) => ({ id: s.id, name: s.name, score: s.score!, views: s.views, group: s.group! })),
      sources: [{ from: "tiktok.com", n: 2100 }, { from: "twitch.tv", n: 1400 }, { from: "google.com", n: 640 }], bestStream: { title: "Granny Gauntlet, night 12", visits: 1840, joins: 22 }, alerts: [{ type: "spike", title: "Traffic spike on Game Vault", state: "resolved" }], moves: [], goals: [] }],
    refs: [{ tag: "dom-live", label: "boomertanger.live", path: "/live" }, { tag: "tt-bio", label: "TikTok bio", path: "/" }],
    days, sources: days.map((d) => ({ day: d.day, refs: { "tiktok.com": Math.round((d.views || 0) * 0.12), "twitch.tv": Math.round((d.views || 0) * 0.08), "google.com": Math.round((d.views || 0) * 0.04), "youtube.com": Math.round((d.views || 0) * 0.03) }, tags: { "dom-live": Math.round((d.views || 0) * 0.01), "tt-bio": Math.round((d.views || 0) * 0.02) } })),
    months: [], streams: [{ id: "s1", title: "Granny Gauntlet, night 12", start: Date.now() - 9 * DAY, end: Date.now() - 9 * DAY + 3 * 3600e3, visits: 1840, joins: 22, refs: { twitch: 610, tiktok: 420, youtube: 90 }, peakMinute: { at: Date.now() - 9 * DAY + 3600e3, views: 41 } }],
    broken: [{ path: "/merch", count: 14 }, { path: "/arcade/tap-the-spalt", count: 3 }],
  };
  return cache;
}
