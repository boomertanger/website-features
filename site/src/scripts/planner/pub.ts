// Scream Planner, public pages: data and helpers shared by /schedule, /schedule/usual and /schedule/vote
// (docs/specs/scream-planner.md section 14, "Reads for the pages"). Reads only what the rules allow everyone to read:
// public/schedule, public/usualWeek, public/ballot, published streams, and the Vault's public/vault summary (covers).
// Member data comes from the ballotMine callable. Nothing here writes; votes go through the ballot callables.
//
// Non-production preview: signed out with ?as=member|admin (or ?pv=a,b) the pages use SAMPLE data from
// site/src/data/preview-planner-public.json, so layouts can be checked without an account. A real signed-in
// session always gets real data. ?pv= switches: live, weekoff, empty, closed, unverified, visitor, snowman, jack.
import { db, doc, getDoc, getDocs, collection, query, where, SITE_ID } from "../../lib/db";
import { call } from "../../lib/call";
import { isProduction } from "../../lib/env.js";
import { messageFor, reasonOf } from "../../lib/errors";
import { loadVault, type Cover } from "../vault/data";
import { escapeHtml } from "../../../../shared/ui/dom.js";
import sample from "../../data/preview-planner-public.json";
import type { AuthState } from "../../lib/auth";

export const esc: (v: unknown) => string = escapeHtml;
export const DEFAULT_TZ = "America/Chicago";

// ---------- preview switches ----------
const qs = () => new URLSearchParams(location.search);
export const pv = (): Set<string> => new Set((qs().get("pv") || "").split(",").map((s) => s.trim()).filter(Boolean));
/** Sample data: non-production, nobody signed in, and ?as= or ?pv= on the address. A real session never gets it. */
export const isSample = (s?: AuthState | null) => !isProduction && !(s && s.user) && (qs().has("as") || qs().has("pv"));

// ---------- dates in the site's zone (Central) ----------
const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (ms: number, tz = DEFAULT_TZ) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
function tzOffset(ms: number, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(ms).map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}
/** The instant a local date and "HH:MM" is in that zone (DST safe). */
export function zonedMs(day: string, hm: string, tz = DEFAULT_TZ) {
  const [y, m, d] = day.split("-").map(Number), [H, M] = hm.split(":").map(Number);
  const base = Date.UTC(y, m - 1, d, H, M);
  let t = base - tzOffset(base, tz);
  t = base - tzOffset(t, tz);
  return t;
}
export const addDays = (day: string, n: number) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const isoDow = (day: string) => ((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
export function weekIdOf(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
  const y = d.getUTCFullYear(), jan4 = new Date(Date.UTC(y, 0, 4));
  const wk = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${y}-W${pad(wk)}`;
}
export function mondayOf(week: string) {
  const [y, w] = week.split("-W").map(Number), jan4 = new Date(Date.UTC(y, 0, 4));
  jan4.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (w - 1) * 7);
  return jan4.toISOString().slice(0, 10);
}
export const nextWeekId = (week: string) => weekIdOf(addDays(mondayOf(week), 7));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthDay = (day: string) => `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`;
export const rangeLabel = (monday: string) => { const sun = addDays(monday, 6); return monday.slice(5, 7) === sun.slice(5, 7) ? `${monthDay(monday)} to ${Number(sun.slice(8, 10))}` : `${monthDay(monday)} to ${monthDay(sun)}`; };
export const DOW_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DOW_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
/** "Thu 10 PM" in a zone. */
export function dayTime(ms: number, tz = DEFAULT_TZ) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(ms).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.minute === "00" ? p.hour : `${p.hour}:${p.minute}`} ${String(p.dayPeriod || "").toUpperCase()}`;
}
/** "7 PM" / "7:30 PM" from "19:00". */
export function hmText(hm: string) {
  const [H, M] = hm.split(":").map(Number), ap = H >= 12 ? "PM" : "AM", h = H % 12 || 12;
  return M ? `${h}:${pad(M)} ${ap}` : `${h} ${ap}`;
}
export const rangeText = (a: string, b: string) => {
  const x = hmText(a), y = hmText(b);
  return x.slice(-2) === y.slice(-2) ? `${x.slice(0, -3)}–${y}` : `${x}–${y}`;
};
export const lengthText = (mins: number) => (mins % 60 === 0 ? `${mins / 60} h` : mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`);

// ---------- public docs ----------
export interface PubWeek { week: string; state: "published" | "planning"; startsMs: number; endsMs: number; publishBy: number | null; publishedAt: number | null; publishedRev: number; hero: { frame: string; doors: string } | null; weekOff: { label: string | null } | null; streamCount: number | null }
export interface Sched { currentWeek: string; tz: string; weeks: PubWeek[] }
export interface Crew { captain: string | null; chats?: Record<string, { lead: string | null; deckhands: string[] }>; caps?: unknown }
export interface PlannedGame { slug: string; title: string; order: number; kind: "owner" | "modRequest" | "ballot" | "suggestion" | "wishlist" | string; byHandle?: string; votes?: number }
export interface PubStream {
  id: string; slug: string | null; state: "scheduled" | "live" | "ended" | "cancelled"; week: string; title: string; type: "platform" | "backstage"; audience: string;
  rooms: string[]; platforms: string[]; start: number; end: number; plannedGameCount: number; theme: { label: string; icon: string | null } | null;
  games: PlannedGame[]; crew: Crew | null; delay: { originalStart: number | null; originalEnd: number | null; count: number; reason?: string } | null; cancel: { reason?: string } | null;
}
const tsMs = (v: any): number | null => (v == null ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : null);

function normStream(id: string, d: any): PubStream {
  return {
    id, slug: d.slug ?? null, state: d.state || "scheduled", week: d.week, title: d.title || d.theme?.label || "Stream", type: d.type === "backstage" ? "backstage" : "platform", audience: d.audience || "public",
    rooms: Array.isArray(d.rooms) ? d.rooms : [], platforms: Array.isArray(d.platforms) ? d.platforms : [],
    start: tsMs(d.plannedStart) ?? 0, end: tsMs(d.plannedEnd) ?? 0, plannedGameCount: d.plannedGameCount || (d.plannedGames || []).length || 0,
    theme: d.theme ? { label: d.theme.label, icon: d.theme.icon ?? null } : null,
    games: (d.plannedGames || []).map((g: any, i: number) => ({ slug: g.gameId, title: g.title, order: g.order ?? i, kind: g.source?.kind || "owner", byHandle: g.source?.byHandle, votes: g.source?.votes })).sort((a: PlannedGame, b: PlannedGame) => a.order - b.order),
    crew: d.crew || null,
    delay: d.delay ? { originalStart: tsMs(d.delay.originalStart), originalEnd: tsMs(d.delay.originalEnd), count: d.delay.count || 1, reason: d.delay.reason } : null,
    cancel: d.cancel ? { reason: d.cancel.reason } : null,
  };
}

export async function loadSchedule(): Promise<Sched | null> {
  const s = await getDoc(doc(db, "sites", SITE_ID, "public", "schedule"));
  if (!s.exists()) return null;
  const d: any = s.data();
  return { currentWeek: d.currentWeek, tz: d.tz || DEFAULT_TZ, weeks: d.weeks || [] };
}
/** The published streams of one week, earliest first. (Equality filters only: no composite index needed.) */
export async function loadWeekStreams(week: string): Promise<PubStream[]> {
  const snap = await getDocs(query(collection(db, "sites", SITE_ID, "streams"), where("published", "==", true), where("week", "==", week)));
  return snap.docs.map((x) => normStream(x.id, x.data())).sort((a, b) => a.start - b.start);
}

export interface UsualPattern { id: string; label: string; icon: string | null; dow: number; start: string; end: string; type: string; membersOnly: boolean; platforms: string[]; gameCount: number | null }
export interface UsualException { id: string; kind: "weekOff" | "dayOff" | "skipPattern"; from: string; to: string; label: string; patternIds: string[] }
export interface Usual { patterns: UsualPattern[]; exceptions: UsualException[]; tz: string }
export async function loadUsual(): Promise<Usual | null> {
  const s = await getDoc(doc(db, "sites", SITE_ID, "public", "usualWeek"));
  if (!s.exists()) return null;
  const d: any = s.data();
  return { patterns: d.patterns || [], exceptions: d.exceptions || [], tz: d.tz || DEFAULT_TZ };
}

export interface BallotGame { slug: string; title: string; cover: Cover | null; status: string | null; tags: string[]; votes: number; wanted: number; seededFrom: string; addedBy: string | null }
export interface Ballot { week: string | null; state: "open" | "closed" | "none"; opensAt: number | null; closesAt: number | null; games: BallotGame[]; totalVotes: number; votesPerMember: number }
export interface Mine { week: string | null; open: boolean; closesAt: number | null; votes: string[]; adds: string[]; votesLeft: number; addsLeft: number }

export async function loadBallot(): Promise<Ballot> {
  const s = await getDoc(doc(db, "sites", SITE_ID, "public", "ballot"));
  const d: any = s.exists() ? s.data() : {};
  return { week: d.week ?? null, state: d.state || "none", opensAt: d.opensAt ?? null, closesAt: d.closesAt ?? null, games: d.games || [], totalVotes: d.totalVotes || 0, votesPerMember: d.votesPerMember || 3 };
}
export const loadMine = (week: string | null) => call<Mine>("ballotMine", week ? { week } : {});

/** slug -> cover, from the Vault's one public summary doc. */
export async function loadCovers(): Promise<Map<string, Cover | null>> {
  const v = await loadVault();
  return new Map(v.games.map((g) => [g.slug, g.cover]));
}

const REASONS: Record<string, string> = {
  closed: "Voting is closed for this week.",
  emailNotVerified: "Verify your email first, then vote.",
  needsSignup: "Finish signing up, then vote.",
  tooManyVotes: "You've used all your votes. Take one back first.",
  notOnBallot: "That game isn't on the ballot any more.",
  addLimit: "You've already added 2 games this week.",
  onBallot: "That game is already on the ballot.",
  noGame: "We couldn't find that game in the Vault.",
  invalid: "That didn't work. Refresh the page and try again.",
};
/** A friendly line for a ballot callable's refusal (details.reason). */
export const ballotError = (err: unknown, fallback = "That didn't go through. Try again.") => REASONS[reasonOf(err) || ""] || messageFor(err, fallback);

/** The Vote link's count badge in the bar: the open ballot's game count, hidden otherwise. */
export function fillVoteCount(b: Ballot | null) {
  document.querySelectorAll<HTMLElement>("[data-pl-votecount]").forEach((el) => {
    const n = b && b.state === "open" ? b.games.length : 0;
    el.textContent = n ? String(n) : "";
    el.hidden = !n;
  });
}

// ---------- sample data (preview only) ----------
const S: any = sample;
const slugCover = (slug: string): Cover | null => S.covers[slug] ?? null;
export const sampleCovers = () => new Map<string, Cover | null>(Object.keys(S.covers).map((k) => [k, S.covers[k]]));

function sampleStream(week: string, monday: string, def: any, now: number, flags: Set<string>, n: number, tonight = false): PubStream {
  const tz = S.tz as string;
  let start: number, end: number, day: string;
  if (tonight) {
    day = ymd(now, tz);
    start = flags.has("live") ? now - 3600e3 : now + def.startsInHours * 3600e3;
    start = Math.floor(start / 900e3) * 900e3;
    end = start + def.hours * 3600e3;
  } else {
    day = addDays(monday, def.dow - 1);
    start = zonedMs(day, def.start, tz); end = zonedMs(day, def.end, tz);
    if (end <= start) end = zonedMs(addDays(day, 1), def.end, tz);
  }
  const backstage = def.type === "backstage";
  const delayed = def.delay ? { originalStart: start - def.delay.hours * 3600e3, originalEnd: end - def.delay.hours * 3600e3, count: 1, reason: def.delay.reason } : null;
  const state: PubStream["state"] = def.cancel ? "cancelled" : tonight && flags.has("live") ? "live" : end < now ? "ended" : "scheduled";
  const chats = def.crew?.chats || (def.crew?.captain ? { twitch: { lead: def.crew.captain, deckhands: [] }, ytLandscape: { lead: null, deckhands: [] }, ytVertical: { lead: null, deckhands: [] }, tiktok: { lead: null, deckhands: [] } } : undefined);
  return {
    id: `sample-${week}-${n}`, slug: `sample-${n}`, state, week, title: def.theme.label, type: backstage ? "backstage" : "platform", audience: backstage ? "fanClub" : "public",
    rooms: backstage ? [] : ["twitch", "ytLandscape", "ytVertical", "tiktok"], platforms: backstage ? [] : ["twitch", "youtube", "tiktok"], start, end, plannedGameCount: def.plannedGameCount || def.games.length,
    theme: def.theme, games: def.games.map((g: any, i: number) => ({ slug: g.slug, title: g.title, order: i, kind: g.kind, byHandle: g.byHandle, votes: g.votes })),
    crew: def.crew ? { captain: def.crew.captain ?? null, chats } : null, delay: delayed, cancel: def.cancel ? { reason: def.cancel.reason } : null,
  };
}

/** The whole /schedule data set as the sample: this week and next week, built around "now". */
export function sampleSchedule(now = Date.now()): { sched: Sched; streams: Record<string, PubStream[]> } {
  const flags = pv(), tz = S.tz as string;
  const today = ymd(now, tz), cur = weekIdOf(today), nxt = nextWeekId(cur), monday = mondayOf(cur), nextMonday = mondayOf(nxt);
  const todayDow = isoDow(today);
  const empty = flags.has("empty");
  const hero = { frame: flags.has("snowman") ? "snowman" : flags.has("jack") ? "jack" : S.hero.frame, doors: S.hero.doors };
  const mk = (week: string, mon: string, defs: any[], skipDow?: number) => defs.filter((d) => d.dow !== skipDow).map((d, i) => sampleStream(week, mon, d, now, flags, i + 1));
  const streams: Record<string, PubStream[]> = {};
  const here = empty ? [] : [...mk(cur, monday, S.week, todayDow), sampleStream(cur, monday, S.tonight, now, flags, 0, true)];
  streams[cur] = here.filter((x) => x.week === cur && ymd(x.start, tz) >= monday && ymd(x.start, tz) <= addDays(monday, 6)).sort((a, b) => a.start - b.start);
  const nextOff = flags.has("weekoff");
  streams[nxt] = nextOff || empty ? [] : mk(nxt, nextMonday, S.next).sort((a, b) => a.start - b.start);
  const wk = (week: string, mon: string, st: "published" | "planning", h: any, off: any, count: number | null): PubWeek => ({ week, state: st, startsMs: zonedMs(mon, "00:00", tz), endsMs: zonedMs(addDays(mon, 7), "00:00", tz), publishBy: null, publishedAt: null, publishedRev: 1, hero: h, weekOff: off, streamCount: count });
  const sched: Sched = {
    currentWeek: cur, tz,
    weeks: [
      wk(cur, monday, empty ? "planning" : "published", empty ? null : hero, null, empty ? null : streams[cur].length),
      wk(nxt, nextMonday, empty && !nextOff ? "planning" : "published", empty && !nextOff ? null : { frame: S.nextHero.frame, doors: S.nextHero.doors }, nextOff ? { label: "Holiday break" } : null, nextOff || empty ? 0 : streams[nxt].length),
    ],
  };
  return { sched, streams };
}

export function sampleUsual(now = Date.now()): Usual {
  const tz = S.tz as string, today = ymd(now, tz);
  return {
    tz, patterns: S.usual.patterns,
    exceptions: S.usual.exceptions.map((e: any) => { const from = addDays(today, e.inDays); return { id: e.id, kind: e.kind, from, to: addDays(from, e.spanDays || 0), label: e.label, patternIds: [] }; }),
  };
}

export function sampleBallot(now = Date.now()): Ballot {
  const flags = pv(), b = S.ballot, closed = flags.has("closed");
  return {
    week: nextWeekId(weekIdOf(ymd(now, S.tz))), state: closed ? "closed" : "open", opensAt: now - 30 * 3600e3, closesAt: closed ? now - 2 * 3600e3 : now + b.closesInHours * 3600e3,
    games: b.games.map((g: any) => ({ ...g, cover: slugCover(g.slug), status: null })), totalVotes: b.games.reduce((n: number, g: any) => n + g.votes, 0), votesPerMember: b.votesPerMember,
  };
}
export const sampleMine = (ballot: Ballot): Mine => ({ week: ballot.week, open: ballot.state === "open", closesAt: ballot.closesAt, votes: [...S.ballot.mine.votes], adds: [...S.ballot.mine.adds], votesLeft: ballot.votesPerMember - S.ballot.mine.votes.length, addsLeft: S.ballot.mine.addsLeft });
export const sampleVault = () => (S.vault as { slug: string; title: string; status: string; tags: string[] }[]).map((g) => ({ ...g, cover: slugCover(g.slug) }));
