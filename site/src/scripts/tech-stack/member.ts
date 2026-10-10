// site/src/scripts/tech-stack/member.ts — the Tech Stack's Fan Club layer (docs/specs/tech-stack.md §2, §6): who's looking, and the members-only text from
// sites/boomertanger/memberContent/tech-stack (the rule lets any signed-in member with a members/{uid} doc read it). Client checks only decide what's
// shown; the text itself is only ever sent to members. States:
//   loading · visitor (signed out: lock cards) · signup (signed in, signup unfinished: "Finish signing up") · member (the doc, or null if it isn't seeded)
//   · error ("Couldn't load the member details" + Try again; the public page still works)
// Preview (signed out, ?as=member or ?as=admin) shows the committed sample (functions/scripts/data/tech-stack-member.sample.json), only in local dev
// (localhost) and on staging.boomertanger.com; never in production.
import { onAuth, type AuthState } from "../../lib/auth";
import { isProduction } from "../../lib/env.js";

export interface MemberDoc {
  devices?: Record<string, { specs?: Record<string, string>; whyPicked?: string; wouldChange?: string }>;
  cables?: Record<string, { port?: string }>;
  tours?: Record<string, string[]>;
  mixer?: { inputs: MixRow[]; outputs: MixRow[] };
  history?: { date: string; text: string; sample?: boolean }[];
}
export interface MixRow { id: string; icon: string; title: string; sub: string; port: string; cable: string; sockets: string[] }
export type MemberState = { status: "loading" | "visitor" | "signup" | "member" | "error"; doc: MemberDoc | null };

let state: MemberState = { status: "loading", doc: null };
const fns = new Set<(s: MemberState) => void>();
const set = (s: MemberState) => { state = s; fns.forEach((f) => { try { f(s); } catch (err) { console.error(err); } }); };
export const memberState = () => state;
export function onMember(fn: (s: MemberState) => void) { fns.add(fn); fn(state); return () => fns.delete(fn); }

const PREVIEW_HOSTS = ["localhost", "127.0.0.1", "staging.boomertanger.com"];
const previewAs = () => {
  if (isProduction || !PREVIEW_HOSTS.includes(location.hostname)) return null;
  const a = new URLSearchParams(location.search).get("as"); return a === "member" || a === "admin" ? a : null;
};
let loadedFor: string | null = null;

async function load(uid: string) {
  set({ status: "loading", doc: null });
  try {
    const { db, doc, getDoc, SITE_ID } = await import("../../lib/db");
    const snap = await getDoc(doc(db, "sites", SITE_ID, "memberContent", "tech-stack"));
    if (loadedFor !== uid) return;
    set({ status: "member", doc: snap.exists() ? (snap.data() as MemberDoc) : null });
  } catch (err) {
    console.warn("tech stack: couldn't load the member details", err);
    if (loadedFor === uid) set({ status: "error", doc: null });
  }
}
/** Try again after an error. */
export function retry() { const uid = loadedFor; loadedFor = null; if (uid) { loadedFor = uid; void load(uid); } }

export function startMember() {
  onAuth(async (s: AuthState) => {
    if (s.status === "loading") return;
    if (!s.user) {
      loadedFor = null;
      if (previewAs()) { const m = await import("../../../../functions/scripts/data/tech-stack-member.sample.json"); set({ status: "member", doc: (m.default || m) as MemberDoc }); }
      else set({ status: "visitor", doc: null });
      return;
    }
    if (s.status === "needsSignup") { loadedFor = null; set({ status: "signup", doc: null }); return; }
    if (loadedFor === s.user.uid) return;
    loadedFor = s.user.uid;
    void load(s.user.uid);
  });
}
