// Feature Lab data (docs/specs/feature-lab.md §3, §7). The board reads sites/{siteId}/lab/main/ideas (everyone sees the visible
// ones; staff see hidden ones too), an idea's comments and the member's own vote marks. Every write goes through the callables
// (labSubmit, labVote, labComment, labTriage, labHide, labDelete, adminEditItem kind labIdea). Times are ms.
import type { Status, Priority, Area } from "./status";
export { STATUS_KEYS, STATUS, PRIORITY, AREA, voteLocked } from "./status";
export type { Status, Priority, Area } from "./status";
import { db, doc, getDoc, collection, getDocs, query, where, orderBy, limit, SITE_ID } from "../../lib/db";

export interface By { uid: string; handle: string; name?: string }
export interface HistoryItem { status?: Status; kind?: "note"; note?: string; changedBy?: { uid?: string; handle?: string }; changedAt: number }
export interface Idea {
  id: string; title: string; description: string; area: Area; status: Status; priority: Priority | null;
  /** The Service Hub service it is about (services/<id>.json), or null. */ serviceId: string | null;
  by: By; voteCount: number; commentCount: number; hidden: boolean; hiddenBy?: { uid?: string; handle?: string }; hiddenReason?: string;
  statusChangedAt: number; shippedAt: number; createdAt: number; updatedAt: number; editedAt: number; editCount: number; statusHistory: HistoryItem[];
}
export interface Comment { id: string; text: string; by: By; staffTag: "admin" | "mod" | null; hidden: boolean; hiddenBy?: { uid?: string; handle?: string }; hiddenReason?: string; createdAt: number }
export interface LogEntry { id: string; action: string; actorName: string; reason: string; createdAt: number; changes?: Record<string, { before: unknown; after: unknown }>; details?: Record<string, unknown> }

const ms = (v: any): number => (v == null ? 0 : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : 0);
const col = (...p: string[]) => collection(db, "sites", SITE_ID, "lab", "main", ...p);

function toIdea(id: string, d: any): Idea {
  return {
    id, title: d.title || "", description: d.description || "", area: d.area || "other", serviceId: typeof d.serviceId === "string" && d.serviceId ? d.serviceId : null, status: d.status || "submitted", priority: d.priority || null,
    by: d.by || { uid: "", handle: "" }, voteCount: d.voteCount || 0, commentCount: d.commentCount || 0, hidden: d.hidden === true, hiddenBy: d.hiddenBy, hiddenReason: d.hiddenReason,
    statusChangedAt: ms(d.statusChangedAt), shippedAt: ms(d.shippedAt), createdAt: ms(d.createdAt), updatedAt: ms(d.updatedAt), editedAt: ms(d.editedAt), editCount: d.editCount || 0,
    statusHistory: (d.statusHistory || []).map((h: any) => ({ ...h, changedAt: ms(h.changedAt) })),
  };
}

/** The whole board, newest first (capped at 300). Staff read hidden ideas too; everyone else filters on hidden == false (the rules need it). */
export async function loadIdeas(staff: boolean): Promise<Idea[]> {
  const q = staff ? query(col("ideas"), orderBy("createdAt", "desc"), limit(300)) : query(col("ideas"), where("hidden", "==", false), orderBy("createdAt", "desc"), limit(300));
  const snap = await getDocs(q);
  return snap.docs.map((d) => toIdea(d.id, d.data()));
}

/** One idea, for the deep link (null when it's gone, hidden from this viewer, or unreadable). */
export async function loadIdea(id: string): Promise<Idea | null> {
  try {
    const snap = await getDoc(doc(db, "sites", SITE_ID, "lab", "main", "ideas", id));
    return snap.exists() ? toIdea(snap.id, snap.data()) : null;
  } catch { return null; }
}

export async function loadComments(id: string, staff: boolean): Promise<Comment[]> {
  const q = staff ? query(col("ideas", id, "comments"), orderBy("createdAt", "asc"), limit(300)) : query(col("ideas", id, "comments"), where("hidden", "==", false), orderBy("createdAt", "asc"), limit(300));
  const snap = await getDocs(q);
  return snap.docs.map((d) => { const c: any = d.data(); return { id: d.id, text: c.text || "", by: c.by || { uid: "", handle: "" }, staffTag: c.staffTag || null, hidden: c.hidden === true, hiddenBy: c.hiddenBy, hiddenReason: c.hiddenReason, createdAt: ms(c.createdAt) }; });
}

/** The idea ids this member voted for (only they can read it). */
export async function loadMyVotes(uid: string): Promise<string[]> {
  try {
    const snap = await getDoc(doc(db, "sites", SITE_ID, "lab", "main", "myVotes", uid));
    return snap.exists() ? ((snap.data().ids as string[]) || []) : [];
  } catch { return []; }
}

/** The admin activity for an idea (admins only: the rules read adminLog through hasSiteRole). Newest first; empty when it can't be read. */
export async function loadAdminLog(id: string): Promise<LogEntry[]> {
  try {
    const snap = await getDocs(query(collection(db, "adminLog"), where("itemPath", "==", `sites/${SITE_ID}/lab/main/ideas/${id}`), orderBy("createdAt", "desc"), limit(20)));
    return snap.docs.map((d) => { const e: any = d.data(); return { id: d.id, action: e.action, actorName: e.actorName || "Admin", reason: e.reason || "", createdAt: ms(e.createdAt), changes: e.changes, details: e.details }; });
  } catch { return []; }
}

/** Jar counts for the How it works hero: one capped read of the visible ideas. */
export async function loadCounts(): Promise<Record<string, number> | null> {
  try {
    const list = await loadIdeas(false);
    const c: Record<string, number> = {};
    list.forEach((i) => { c[i.status] = (c[i.status] || 0) + 1; });
    return c;
  } catch { return null; }
}
