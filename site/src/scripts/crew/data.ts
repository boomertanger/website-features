// Shared data for the crew's own pages (/crew/hq, /queue, /tasks, /profile; docs/specs/mod-machina.md §12).
// loadCtx() gives one object: who you are, your crewMe, the owner flag. Real signed-in people always get real
// data from the callables. Signed out with ?as=member|admin on a non-production build, the pages read
// site/src/data/preview-crew-hq.json instead and actions change a local copy, so layouts can be checked
// without an account (?grade=1 shows a lower grade). Display only: the server checks every action.
import sample from "../../data/preview-crew-hq.json";
import { previewAs } from "./layout";
import { crewMe, crewCall, board, type Me, type BoardRow } from "./api";
import { db, doc, getDoc, getDocs, collection, SITE_ID } from "../../lib/db";
import type { AuthState } from "../../lib/auth";
import { escapeHtml } from "../../../../shared/ui/dom.js";

export const esc = (v: unknown) => escapeHtml(String(v ?? ""));

export interface Task {
  taskId: string; title: string; detail: string; gears: number; status: "open" | "claimed" | "done" | "confirmed";
  postedBy: string; postedByHandle: string | null; claimedBy: string | null; claimedByHandle: string | null; createdAt: number;
}
export interface Applicant {
  appId: string; uid: string; handle: string | null; createdAt: number; expiresAt: number; band: string | null;
  prefs: Record<string, string>; availability: { days: string[]; note: string }; device: string; answers: { why: string; experience: string };
  score: number; rank: number | null; vouches: { uid: string; handle: string | null; grade: number }[]; vouchedByMe: boolean;
  concerns?: { byHandle: string | null; note: string }[];
}
export interface Ctx {
  s: AuthState; preview: boolean; uid: string; handle: string; name: string; me: Me;
  owner: boolean; admin: boolean; crewMember: boolean;
  /** Watcher and up, or an admin: the queue opens. */
  watcherPlus: boolean;
  /** Sentinels and admins post tasks. */
  canPost: boolean;
  /** A2 Overseer and up, or the owner: can confirm anyone's task. */
  a2plus: boolean;
}

/** One live copy of the sample per page, so preview actions can change it. */
let SAMPLE_STATE: any = null;
export const previewData = (): any => (SAMPLE_STATE ??= JSON.parse(JSON.stringify(sample)));

export const STATUS: Record<string, { label: string; tone: string; note: string }> = {
  active: { label: "Active", tone: "lime", note: "Full perks." },
  checkIn: { label: "Check-in", tone: "gold", note: "Perks stay. Take a duty when you can." },
  goingDark: { label: "Going dark", tone: "blue", note: "A planned break. No warnings." },
  reserve: { label: "Reserve", tone: "gray", note: "Perks are paused. One duty brings you back." },
  alumni: { label: "Alumni", tone: "gray", note: "Thanks for your time on the crew." },
  paused: { label: "Paused", tone: "gray", note: "The owner will be in touch." },
};
export const statusChip = (status: string) => {
  const st = STATUS[status] || { label: status, tone: "gray" };
  return `<span class="bt-badge bt-badge--${st.tone}"><span class="bt-badge-dot"></span>${esc(st.label)}</span>`;
};

export async function loadCtx(s: AuthState): Promise<Ctx> {
  const preview = !s.user && !!previewAs();
  let me: Me, uid: string, handle: string, name: string, owner: boolean;
  if (preview) {
    const d = previewData();
    me = d.me; uid = d.uid; handle = d.handle; name = d.name;
    const g = Number(new URLSearchParams(location.search).get("grade"));
    if (g >= 1 && g <= 4 && me.crew) { me.crew.grade = g; me.crew.name = ["", "Initiate", "Watcher", "Warden", "Sentinel"][g]; }
    owner = previewAs() === "admin" && d.owner === true;
  } else {
    me = await crewMe();
    uid = s.user!.uid;
    handle = s.profile?.handle || "";
    name = s.profile?.displayName || handle;
    // Owner: sites/{id}.ownerUid is readable once signed in (as /admin does). Only the owner sees Approve and Not now.
    owner = false;
    try { owner = (await getDoc(doc(db, "sites", SITE_ID))).get("ownerUid") === uid; } catch { /* not the owner as far as we can tell */ }
  }
  const crew = me.crew;
  const admin = s.isAdmin || s.roles.includes("admin") || crew?.track === "admin";
  const crewMember = !!crew && crew.status !== "alumni";
  const mod = crew?.track === "mod";
  return {
    s, preview, uid, handle, name, me, owner, admin, crewMember,
    watcherPlus: admin || (mod && (crew?.grade || 0) >= 2),
    canPost: admin || (mod && (crew?.grade || 0) >= 4),
    a2plus: owner || (crew?.track === "admin" && (crew?.grade || 0) >= 2),
  };
}

/** Runs a callable, or in preview mode runs `local` against the sample instead. */
export async function act<T = any>(ctx: Ctx, name: string, data: unknown, local?: () => void): Promise<T> {
  if (ctx.preview) { await new Promise((r) => setTimeout(r, 250)); local?.(); return {} as T; }
  return crewCall<T>(name, data);
}

export async function loadTasks(ctx: Ctx): Promise<Task[]> {
  if (ctx.preview) return previewData().tasks as Task[];
  const snap = await getDocs(collection(db, `sites/${SITE_ID}/crew/main/tasks`));
  const ms = (v: any) => (v?.toMillis ? v.toMillis() : typeof v === "number" ? v : 0);
  return snap.docs.map((d) => {
    const t = d.data();
    return { taskId: d.id, title: t.title, detail: t.detail || "", gears: t.gears, status: t.status, postedBy: t.postedBy, postedByHandle: t.postedByHandle || null, claimedBy: t.claimedBy || null, claimedByHandle: t.claimedByHandle || null, createdAt: ms(t.createdAt) } as Task;
  }).sort((a, b) => b.createdAt - a.createdAt);
}

/** Your row on the month and all-time boards; no row means 0 Gears and unranked. */
export async function loadStanding(ctx: Ctx): Promise<{ month: BoardRow | null; all: BoardRow | null }> {
  if (ctx.preview) { const b = previewData().boards; return { month: b.month as BoardRow, all: b.all as BoardRow }; }
  const [m, a] = await Promise.all([board("month").catch(() => null), board("all").catch(() => null)]);
  const mine = (b: { rows: BoardRow[] } | null) => b?.rows.find((r) => r.uid === ctx.uid) ?? null;
  return { month: mine(m), all: mine(a) };
}

export async function loadVouchCap(ctx: Ctx): Promise<number> {
  if (ctx.preview) return previewData().vouchCap ?? 3;
  try { const n = (await getDoc(doc(db, `sites/${SITE_ID}/crew/main`))).get("vouchCap"); return Number.isInteger(n) && n > 0 ? n : 3; } catch { return 3; }
}

export const num = (n: number) => (n || 0).toLocaleString("en-US");
export const fmtDate = (ms: number | null | undefined, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) =>
  ms ? new Date(ms).toLocaleDateString("en-US", { timeZone: "America/Chicago", ...opts }) : "";
export const ago = (ms: number) => {
  const d = Math.max(0, Math.floor((Date.now() - ms) / 86400000));
  return d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};
export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const DAY_LABEL: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
export const DEVICE_LABEL: Record<string, string> = { phone: "Phone", desktop: "Desktop", both: "Phone and desktop" };

/** Signed-out preview chrome: a small note so a screenshot can't be mistaken for real data. */
export const previewNote = (ctx: Ctx) => ctx.preview ? `<p class="bt-fineprint hq-previewnote">Preview data. Actions here change a local copy only.</p>` : "";

/** A friendly state in place of a page. */
export const emptyState = (title: string, text: string, actions = "") =>
  `<section class="bt-zone hq-state"><h1 class="bt-title">${esc(title)}</h1><p class="hq-lead">${esc(text)}</p>${actions ? `<div class="hq-acts">${actions}</div>` : ""}</section>`;
