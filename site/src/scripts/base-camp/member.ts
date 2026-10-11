// site/src/scripts/base-camp/member.ts — Base Camp's Fan Club layer (docs/specs/base-camp.md): who's looking, and the members-only docs under
// sites/boomertanger/memberContent: "base-camp" (the card backs, the full stop stories, the chapter 5 paragraph) and "mail" (the Pup Post address,
// { to, lines[] }). The rule lets any signed-in member with a members/{uid} doc read them; both are written only by
// functions/scripts/seed-base-camp.js. Client checks only decide what's shown: the text and the address are only ever sent to members, never put
// in the page HTML.
// States: loading · visitor (signed out) · signup (signed in, signup unfinished) · member (doc, or null when it isn't seeded yet) · error.
// Preview (signed out, ?as=member or ?as=admin) shows the committed SAMPLE (functions/scripts/data/base-camp-member.sample.json: sample text and a
// sample address), only on localhost and staging.boomertanger.com, never in production.
import { onAuth, type AuthState } from "../../lib/auth";
import { isProduction } from "../../lib/env.js";

export type MemberDocId = "base-camp" | "mail";
export interface StoryDoc {
  sides?: Record<string, string>;      // character, streamer, professional: the backs of the three cards
  stops?: Record<string, string>;      // island, engineering, gaming, rise: the full stop stories
  beyond?: string;                     // chapter 5's full paragraph
}
export interface MailDoc { to?: string; lines?: string[] }
export type MemberStatus = "loading" | "visitor" | "signup" | "member" | "error";
export interface MemberState<T = unknown> { status: MemberStatus; doc: T | null; preview: boolean }

const PREVIEW_HOSTS = ["localhost", "127.0.0.1", "staging.boomertanger.com"];
const previewAs = () => {
  if (isProduction || !PREVIEW_HOSTS.includes(location.hostname)) return false;
  const a = new URLSearchParams(location.search).get("as");
  return a === "member" || a === "admin";
};
async function sample(id: MemberDocId) {
  const m = await import("../../../../functions/scripts/data/base-camp-member.sample.json");
  const s = (m.default || m) as { sides: StoryDoc["sides"]; stops: StoryDoc["stops"]; beyond: string; mail: MailDoc };
  return id === "mail" ? { to: s.mail.to, lines: s.mail.lines } : { sides: s.sides, stops: s.stops, beyond: s.beyond };
}

interface Slot { state: MemberState; fns: Set<(s: MemberState) => void>; loadedFor: string | null }
const slots = new Map<MemberDocId, Slot>();
let auth: AuthState | null = null;
let started = false;

function set(id: MemberDocId, state: MemberState) {
  const slot = slots.get(id)!;
  slot.state = state;
  slot.fns.forEach((f) => { try { f(state); } catch (err) { console.error(err); } });
}
async function load(id: MemberDocId, uid: string) {
  const slot = slots.get(id)!;
  set(id, { status: "loading", doc: null, preview: false });
  try {
    const { db, doc, getDoc, SITE_ID } = await import("../../lib/db");
    const snap = await getDoc(doc(db, "sites", SITE_ID, "memberContent", id));
    if (slot.loadedFor !== uid) return;
    set(id, { status: "member", doc: snap.exists() ? snap.data() : null, preview: false });
  } catch (err) {
    console.warn(`base camp: couldn't load memberContent/${id}`, err);
    if (slot.loadedFor === uid) set(id, { status: "error", doc: null, preview: false });
  }
}
async function apply(id: MemberDocId) {
  const slot = slots.get(id)!;
  const s = auth;
  if (!s || s.status === "loading") return;
  if (!s.user) {
    slot.loadedFor = null;
    if (previewAs()) set(id, { status: "member", doc: await sample(id), preview: true });
    else set(id, { status: "visitor", doc: null, preview: false });
    return;
  }
  if (s.status === "needsSignup") { slot.loadedFor = null; set(id, { status: "signup", doc: null, preview: false }); return; }
  if (slot.loadedFor === s.user.uid) return;
  slot.loadedFor = s.user.uid;
  void load(id, s.user.uid);
}

/** Calls fn now and on every change of the member state for one memberContent doc. Returns an unsubscribe. */
export function onMemberDoc<T>(id: MemberDocId, fn: (s: MemberState<T>) => void) {
  if (!slots.has(id)) slots.set(id, { state: { status: "loading", doc: null, preview: false }, fns: new Set(), loadedFor: null });
  const slot = slots.get(id)!;
  slot.fns.add(fn as (s: MemberState) => void);
  fn(slot.state as MemberState<T>);
  if (!started) { started = true; onAuth((s) => { auth = s; slots.forEach((_, k) => void apply(k)); }); }
  else void apply(id);
  return () => slot.fns.delete(fn as (s: MemberState) => void);
}

/** Try again after an error (every doc that failed). */
export function retryMember() {
  slots.forEach((slot, id) => {
    if (slot.state.status !== "error" || !slot.loadedFor) return;
    const uid = slot.loadedFor;
    void load(id, uid);
  });
}
