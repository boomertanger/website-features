// Boomertang in the browser (docs/specs/boomertang.md §3, §5): the magazine's state from Firestore (tang/main and the issue docs: published or
// not, public or members, the edition log) and who's reading, then what each issue gives this reader. Client checks only decide what's shown;
// the rules decide every read. Off production, signed out, ?as=fan | sub | admin | owner previews a reader (display only: the rules still see
// a visitor, so a members-only page stays sealed).
import { db, doc, getDoc, SITE_ID } from "../../lib/db";
import { onAuth, type AuthState } from "../../lib/auth";
import { isProduction } from "../../lib/env.js";

export type ReaderKind = "visitor" | "fan" | "sub" | "staff";
export interface Reader { kind: ReaderKind; signedIn: boolean; member: boolean; sub: boolean; staff: boolean; uid: string | null; preview: boolean; state: AuthState | null }
export interface IssueDoc { status: "draft" | "published"; access: "public" | "members"; textInRepo?: boolean; editions?: { date: string; note: string }[]; publishedAt?: { toMillis(): number } | null }
export interface TangState { currentIssueId: string | null; issues: Record<string, IssueDoc | null> }
export type Access = { open: boolean; label: string; short: string; why: "public" | "fan" | "sub" | "staff" | "back" | "newest" | "draft" | "unknown" };

const BASE = ["sites", SITE_ID, "tang", "main"] as const;

/** tang/main and the given issue docs (a missing or unreadable doc is null: not set up, or a draft this reader can't see). */
export async function loadTang(ids: string[]): Promise<TangState> {
  const main = await getDoc(doc(db, ...BASE)).catch(() => null);
  const docs = await Promise.all(ids.map((id) => getDoc(doc(db, ...BASE, "issues", id)).then((s) => (s.exists() ? (s.data() as IssueDoc) : null), () => null)));
  return { currentIssueId: (main?.exists() ? (main.data().currentIssueId as string) : null) || null, issues: Object.fromEntries(ids.map((id, k) => [id, docs[k]])) };
}

const PREVIEW: Record<string, ReaderKind> = { fan: "fan", member: "fan", sub: "sub", admin: "staff", owner: "staff" };
function readerOf(s: AuthState): Reader {
  const signedIn = !!s.user && (s.status === "verified" || s.status === "unverified");
  if (!signedIn) {
    const as = isProduction ? "" : new URLSearchParams(location.search).get("as") || "";
    const k = PREVIEW[as];
    if (k) return { kind: k, signedIn: false, member: k !== "visitor", sub: k === "sub" || k === "staff", staff: k === "staff", uid: null, preview: true, state: s };
    return { kind: "visitor", signedIn: false, member: false, sub: false, staff: false, uid: null, preview: false, state: s };
  }
  const staff = s.isAdmin || !!s.isOwner, sub = s.roles.includes("sub");
  return { kind: staff ? "staff" : sub ? "sub" : "fan", signedIn: true, member: !!s.profile, sub: sub || staff, staff, uid: s.user!.uid, preview: false, state: s };
}

/** Calls fn with the reader once auth has settled, and again when it changes. */
export function onReader(fn: (r: Reader) => void) {
  let last = "";
  return onAuth((s) => {
    if (s.status === "loading") return;
    const r = readerOf(s);
    const key = `${r.kind}|${r.uid}|${r.member}`;
    if (key === last) return;
    last = key;
    fn(r);
  });
}

/** What an issue gives this reader (spec §3), for the access lines, the locks and the sealed page. */
export function accessOf(id: string, inRepo: boolean, t: TangState, r: Reader): Access {
  const d = t.issues[id];
  if (inRepo || d?.access === "public") return { open: true, label: "Free for everyone", short: "Free", why: "public" };
  if (r.staff) return { open: true, label: d?.status === "draft" ? "Draft · owner and admins" : "Members-only issue", short: "Open", why: "staff" };
  if (!d || d.status !== "published") return { open: false, label: "Not out yet", short: "Soon", why: d ? "draft" : "unknown" };
  const newest = t.currentIssueId === id;
  if (newest) {
    const nextNo = Number(id.split("n")[1]) + 1;
    return r.sub ? { open: true, label: "Newest issue · Sub Club", short: "Sub Club", why: "sub" } : { open: false, label: `Sub Club first · Fan Club when No. ${nextNo} is out`, short: "Sub Club first", why: "newest" };
  }
  return r.member ? { open: true, label: "Fan Club", short: "Fan Club", why: "fan" } : { open: false, label: "Free with Fan Club", short: "Fan Club", why: "back" };
}
