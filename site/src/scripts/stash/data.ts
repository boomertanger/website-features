// Cloud Stash data (docs/specs/cloud-stash.md §3, §7). The admin tool reads these top-level docs directly (rules: the owner and admins read them): storageUsage/{cloudinary, current, scan,
// sweep, alerts}, adminSettings/{storage, log}, cleanupRules, the newest 1,000 externalAssets (filtered in the browser, so no extra index) and the newest 20 adminLog entries with feature
// "cloudStash" (index: feature asc, createdAt desc). Everything that changes anything goes through the stash callables. Times are ms.
import { db, doc, getDoc, collection, getDocs, query, where, orderBy, limit } from "../../lib/db";
import type { UsageStatus } from "./status";

export interface Usage {
  credits: { used: number; limit: number; pct: number | null }; storage: { usage: number; credits: number }; bandwidth: { usage: number; credits: number }; transformations: { usage: number; credits: number };
  plan: string; status: UsageStatus; uploads: "open" | "members-paused" | "stopped"; fetchedAt: number; failures: number;
}
export interface Current { totalBytes: number; byFeature: Record<string, { bytes: number; files: number }>; recountedAt: number }
export interface ScanFile { publicId: string; type: string; bytes: number; createdAt: number }
export interface Scan { at: number; by: string; counts: { orphan: number; stale: number; unrecorded: number; untracked: number }; untracked: ScanFile[]; unrecorded: { path: string; field: string; publicId: string }[]; truncated: boolean }
export interface Sweep { lastRunAt: number; status: "ok" | "partial" | "capped" | "failed"; purged: number; bytes: number; failures: { ruleId: string; assetId?: string; message: string }[]; perRule: Record<string, { purged: number; bytes: number; failed: number }>; trigger: string }
export interface Alert { kind: string; title: string; body: string; severity: string; at: number }
export interface Settings { pauseAtPct: number; manualPause: boolean; manualPauseReason: string; runCap: number }
export interface Rule { id: string; name: string; target: string | null; statuses: string[]; days: number; enabled: boolean; legacy: boolean; updatedAt: number; lastRun: { at: number; purged: number; bytes: number; failed: number } | null; legacyText?: string }
export interface Asset { id: string; publicId: string; url: string; feature: string; sizeBytes: number; deliveryType: "upload" | "authenticated"; createdAt: number; linkedDoc: { collection: string; docId: string; field: string } | null; scan: { state: "linked" | "orphan" | "stale"; due?: string } | null }
export interface LogEntry { id: string; action: string; actorName: string; reason: string; createdAt: number; itemTitle: string; details?: Record<string, any>; changes?: Record<string, any> }
export interface Snapshot { usage: Usage | null; current: Current | null; scan: Scan | null; sweep: Sweep | null; alerts: Alert[]; settings: Settings; retentionDays: number | null; rules: Rule[]; assets: Asset[]; assetsCapped: boolean }
export interface Item { title: string; kind: string; link: string | null }

const ms = (v: any): number => (v == null ? 0 : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : 0);
export const DEFAULT_SETTINGS: Settings = { pauseAtPct: 80, manualPause: false, manualPauseReason: "", runCap: 100 };
const one = async (path: string) => { try { const s = await getDoc(doc(db, path)); return s.exists() ? (s.data() as any) : null; } catch { return undefined; } };

/** Reads everything the page needs. A doc that can't be read (rules not deployed, offline) makes the whole load an error: the page says so instead of showing half of it. */
export async function loadSnapshot(): Promise<Snapshot> {
  const [u, c, sc, sw, al, st, lg, rulesSnap, assetsSnap] = await Promise.all([
    one("storageUsage/cloudinary"), one("storageUsage/current"), one("storageUsage/scan"), one("storageUsage/sweep"), one("storageUsage/alerts"), one("adminSettings/storage"), one("adminSettings/log"),
    getDocs(collection(db, "cleanupRules")), getDocs(query(collection(db, "externalAssets"), orderBy("createdAt", "desc"), limit(1000))),
  ]);
  if ([u, c, sc, sw, al, st, lg].includes(undefined as any)) throw new Error("A Cloud Stash doc couldn't be read.");
  return {
    usage: u ? { credits: { used: u.credits?.used || 0, limit: u.credits?.limit || 0, pct: u.credits?.pct ?? null }, storage: u.storage || { usage: 0, credits: 0 }, bandwidth: u.bandwidth || { usage: 0, credits: 0 }, transformations: u.transformations || { usage: 0, credits: 0 }, plan: u.plan || "", status: u.status || "healthy", uploads: u.uploads || "open", fetchedAt: ms(u.fetchedAt), failures: u.failures || 0 } : null,
    current: c ? { totalBytes: c.totalBytes || 0, byFeature: c.byFeature || {}, recountedAt: ms(c.recountedAt) } : null,
    scan: sc ? { at: ms(sc.at), by: sc.by || "", counts: { orphan: 0, stale: 0, unrecorded: 0, untracked: 0, ...(sc.counts || {}) }, untracked: (sc.untracked || []).map((x: any) => ({ ...x, createdAt: ms(x.createdAt) })), unrecorded: sc.unrecorded || [], truncated: sc.truncated === true } : null,
    sweep: sw ? { lastRunAt: ms(sw.lastRunAt), status: sw.status || "ok", purged: sw.purged || 0, bytes: sw.bytes || 0, failures: sw.failures || [], perRule: sw.perRule || {}, trigger: sw.trigger || "" } : null,
    alerts: ((al && al.items) || []).map((a: any) => ({ ...a, at: ms(a.at) })),
    settings: { ...DEFAULT_SETTINGS, ...(st || {}) },
    retentionDays: lg && Number.isFinite(lg.retentionDays) ? lg.retentionDays : null,
    rules: rulesSnap.docs.map((d) => {
      const r: any = d.data();
      const legacy = !r.target;
      return { id: d.id, name: r.name || (legacy ? "Legacy rule" : d.id), target: r.target || null, statuses: r.statuses || [], days: r.days ?? r.ageThresholdDays ?? 0, enabled: r.enabled === true, legacy, updatedAt: ms(r.updatedAt), lastRun: r.lastRun ? { ...r.lastRun, at: ms(r.lastRun.at) } : null, legacyText: legacy ? `Delete files on ${r.collection || "a collection"} where ${r.matchField || "a field"} is ${String(r.matchValue)} for ${r.ageThresholdDays || "?"} days.` : undefined };
    }),
    assets: assetsSnap.docs.map((d) => { const a: any = d.data(); return { id: d.id, publicId: a.publicId || "", url: a.url || "", feature: a.feature || "", sizeBytes: a.sizeBytes || 0, deliveryType: a.deliveryType === "authenticated" ? "authenticated" : "upload", createdAt: ms(a.createdAt), linkedDoc: a.linkedDoc || null, scan: a.scan ? { state: a.scan.state, due: a.scan.due } : null } as Asset; }),
    assetsCapped: assetsSnap.size >= 1000,
  };
}

/** The newest 20 admin log entries for Cloud Stash. */
export async function loadLog(): Promise<LogEntry[]> {
  try {
    const snap = await getDocs(query(collection(db, "adminLog"), where("feature", "==", "cloudStash"), orderBy("createdAt", "desc"), limit(20)));
    return snap.docs.map((d) => { const e: any = d.data(); return { id: d.id, action: e.action, actorName: e.actorName || "Admin", reason: e.reason || "", createdAt: ms(e.createdAt), itemTitle: e.itemTitle || "", details: e.details, changes: e.changes }; });
  } catch { return []; }
}

const KIND_OF_FEATURE = (a: Asset, data: any): string => {
  if (a.feature === "bugZapper") return `Bug${data && data.status ? ` · ${String(data.status).replace(/_/g, " ")}` : ""}`;
  if (a.feature === "gameVault") return /vaultQueue/.test(a.linkedDoc?.collection || "") ? "Queue · waiting for a mod" : "Game · cover";
  if (a.feature === "funFactory") return "Season art";
  return a.feature || "File";
};
/** What a file belongs to (its title, what kind of thing it is, and where to open it), read from the linked doc. Null when the doc is gone (an orphan). */
export async function loadItem(a: Asset): Promise<Item | null> {
  if (!a.linkedDoc) return null;
  try {
    const snap = await getDoc(doc(db, a.linkedDoc.collection, a.linkedDoc.docId));
    if (!snap.exists()) return null;
    const d: any = snap.data();
    const col = a.linkedDoc.collection;
    const link = a.feature === "bugZapper" ? `/bug-zapper?report=${a.linkedDoc.docId}` : /vaultGames$/.test(col) ? `/games/${a.linkedDoc.docId}` : /vaultQueue$/.test(col) ? "/games/queue" : a.feature === "funFactory" ? "/shift/builder" : null;
    return { title: d.title || d.name || a.linkedDoc.docId, kind: KIND_OF_FEATURE(a, d), link };
  } catch { return { title: a.linkedDoc.docId, kind: KIND_OF_FEATURE(a, null), link: null }; }
}
