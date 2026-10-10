// Bug Zapper data (docs/specs/bug-zapper.md §3, §7). The board reads sites/{siteId}/bugs/main/reports: everyone reads public reports (private == false, hidden ==
// false), a member also reads their own (by.uid == them, hidden == false, private ones included), staff read everything. The thread, the device and the screenshot
// record are for the reporter and staff. Every write goes through the callables (bugSubmit, bugShotParams, bugAttachShot, bugShotUrl, bugMeToo, bugReply, bugTriage,
// bugHide, bugDelete, adminEditItem kind bugReport). Times are ms.
import { db, doc, getDoc, collection, getDocs, query, where, orderBy, limit, getCount, SITE_ID } from "../../lib/db";
import type { Status, Severity, Priority } from "./status";

export * from "./status";
export interface By { uid: string; handle: string; name?: string }
export interface HistoryItem { status?: Status; kind?: "note"; note?: string; changedBy?: { uid?: string; handle?: string }; changedAt: number }
export interface Report {
  id: string; title: string; page: string; whatHappened: string; expected: string; steps: string; severity: Severity; status: Status; priority: Priority | null; duplicateOf: string | null;
  /** The Service Hub service it is about (services/<id>.json), or null. */ serviceId: string | null;
  private: boolean; hidden: boolean; hiddenBy?: { uid?: string; handle?: string }; hiddenReason?: string; closed: boolean; by: By; meTooCount: number; threadCount: number; shotRef: string | null;
  statusHistory: HistoryItem[]; statusChangedAt: number; confirmedAt: number; fixedAt: number; closedAt: number; editedAt: number; editCount: number; createdAt: number; updatedAt: number;
}
export interface Reply { id: string; text: string; by: By; staffTag: "admin" | "mod" | null; hidden: boolean; hiddenBy?: { uid?: string; handle?: string }; hiddenReason?: string; createdAt: number }
export interface Info { device: { browser: string; os: string; viewport: string } | null; shot: { publicId: string; format: string; bytes: number; width: number | null; height: number | null } | null }
export interface LogEntry { id: string; action: string; actorName: string; reason: string; createdAt: number; changes?: Record<string, { before: unknown; after: unknown }>; details?: Record<string, unknown> }

const ms = (v: any): number => (v == null ? 0 : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : 0);
const col = (...p: string[]) => collection(db, "sites", SITE_ID, "bugs", "main", ...p);

function toReport(id: string, d: any): Report {
  return {
    id, title: d.title || "", page: d.page || "", whatHappened: d.whatHappened || "", expected: d.expected || "", steps: d.steps || "", severity: d.severity || "minor", status: d.status || "open",
    priority: d.priority || null, duplicateOf: d.duplicateOf || null, serviceId: typeof d.serviceId === "string" && d.serviceId ? d.serviceId : null, private: d.private === true, hidden: d.hidden === true, hiddenBy: d.hiddenBy, hiddenReason: d.hiddenReason, closed: d.closed === true,
    by: d.by || { uid: "", handle: "" }, meTooCount: d.meTooCount || 0, threadCount: d.threadCount || 0, shotRef: d.shotRef || null,
    statusHistory: (d.statusHistory || []).map((h: any) => ({ ...h, changedAt: ms(h.changedAt) })),
    statusChangedAt: ms(d.statusChangedAt), confirmedAt: ms(d.confirmedAt), fixedAt: ms(d.fixedAt), closedAt: ms(d.closedAt), editedAt: ms(d.editedAt), editCount: d.editCount || 0, createdAt: ms(d.createdAt), updatedAt: ms(d.updatedAt),
  };
}

/**
 * The board, newest first (capped at 300). Staff read everything. Everyone else reads public reports (private == false and hidden == false: the rules need both),
 * and a signed-in member's own reports (by.uid and hidden == false, no order: two equalities need no index) are merged in so their private ones show too.
 */
export async function loadReports(staff: boolean, uid: string | null): Promise<Report[]> {
  if (staff) return (await getDocs(query(col("reports"), orderBy("createdAt", "desc"), limit(300)))).docs.map((d) => toReport(d.id, d.data()));
  const pub = await getDocs(query(col("reports"), where("private", "==", false), where("hidden", "==", false), orderBy("createdAt", "desc"), limit(300)));
  const map = new Map(pub.docs.map((d) => [d.id, toReport(d.id, d.data())]));
  if (uid) {
    try {
      const mine = await getDocs(query(col("reports"), where("by.uid", "==", uid), where("hidden", "==", false), limit(300)));
      mine.docs.forEach((d) => map.set(d.id, toReport(d.id, d.data())));
    } catch (err) { console.warn("bugs: couldn't read your own reports", err); }
  }
  return [...map.values()].sort((a, b) => b.createdAt - a.createdAt);
}

/** One report, for a deep link (null when it's gone, hidden from this viewer, private, or unreadable). */
export async function loadReport(id: string): Promise<Report | null> {
  try {
    const snap = await getDoc(doc(db, "sites", SITE_ID, "bugs", "main", "reports", id));
    return snap.exists() ? toReport(snap.id, snap.data()) : null;
  } catch { return null; }
}

/** A report's thread (the reporter and staff only; anyone else gets []). The reporter reads visible replies; staff read hidden ones too. */
export async function loadThread(id: string, staff: boolean): Promise<Reply[]> {
  try {
    const q = staff ? query(col("reports", id, "thread"), orderBy("createdAt", "asc"), limit(300)) : query(col("reports", id, "thread"), where("hidden", "==", false), orderBy("createdAt", "asc"), limit(300));
    return (await getDocs(q)).docs.map((d) => { const c: any = d.data(); return { id: d.id, text: c.text || "", by: c.by || { uid: "", handle: "" }, staffTag: c.staffTag || null, hidden: c.hidden === true, hiddenBy: c.hiddenBy, hiddenReason: c.hiddenReason, createdAt: ms(c.createdAt) }; });
  } catch { return []; }
}

/** The device line and screenshot record (the reporter and staff only). */
export async function loadInfo(id: string): Promise<Info> {
  try {
    const snap = await getDoc(doc(db, "sites", SITE_ID, "bugs", "main", "reports", id, "staff", "info"));
    const d: any = snap.exists() ? snap.data() : {};
    return { device: d.device || null, shot: d.shot || null };
  } catch { return { device: null, shot: null }; }
}

/** The report ids this member bit "me too" on (only they can read it). */
export async function loadMyMeToos(uid: string): Promise<string[]> {
  try {
    const snap = await getDoc(doc(db, "sites", SITE_ID, "bugs", "main", "myMeToos", uid));
    return snap.exists() ? ((snap.data().ids as string[]) || []) : [];
  } catch { return []; }
}

/** The admin activity for a report (admins only: the rules read adminLog through hasSiteRole). Newest first; empty when it can't be read. */
export async function loadAdminLog(id: string): Promise<LogEntry[]> {
  try {
    const snap = await getDocs(query(collection(db, "adminLog"), where("itemPath", "==", `sites/${SITE_ID}/bugs/main/reports/${id}`), orderBy("createdAt", "desc"), limit(20)));
    return snap.docs.map((d) => { const e: any = d.data(); return { id: d.id, action: e.action, actorName: e.actorName || "Admin", reason: e.reason || "", createdAt: ms(e.createdAt), changes: e.changes, details: e.details }; });
  } catch { return []; }
}

/** How many reports were zapped so far (public Fixed ones): one count query, null if it can't be read (the number is then hidden). */
export async function loadZapped(): Promise<number | null> {
  try {
    const snap = await getCount(query(col("reports"), where("private", "==", false), where("hidden", "==", false), where("status", "==", "fixed")));
    return snap.data().count;
  } catch { return null; }
}
