// The viewer's side of a live drop (docs/specs/live-drops.md §5 parts 2 and 3, §6): ONE state machine shared by the site-wide banner
// (drop-banner.ts) and the /live drop card (drop-card.ts), so the two never disagree and the rules are written once.
//
// Reads (real):
//   public/live.drop                    from the feed the page already has (lib/live.ts onLive, or /live's pubApi feed): no new public/live listener
//   drops/{id}/claims/{uid}             the member's OWN result, one live listener while a drop exists (rules: your own doc). It drives claimed, already,
//                                       entered, won and lost on every page and after a reload. Never polled.
//   drops/{id}                          read ONCE, only for staff (the rules let the owner and crew read it), to compare droppedBy.uid: the dropper sees
//                                       "Your drop". No uid ever goes into public data.
// Writes: claimDrop through lib/call (the server checks everything again).
// "Already yours" comes from the claim's own result ("already"), after the tap: the site doesn't load a member's badges on every page.
// Preview (non-production, ?drop=...): drop-panel-preview.ts viewerPreview(), local data only.
import type { AuthState } from "../../lib/auth";
import { isProduction } from "../../lib/env.js";
import { reasonOf } from "../../lib/errors";
import { formatDropTime } from "../../../../shared/ui/drop.js";
import { esc, toast } from "./ui";
import type { PubDrop, PubLive } from "./model";

export type ClaimResult = "granted" | "already" | "entered" | "won" | "lost";
export type DropKind = "open" | "visitor" | "signup" | "closing" | "claimed" | "already" | "entered" | "drawing" | "won" | "lost" | "closed" | "dropper";
export interface DropView { kind: DropKind; drop: PubDrop; busy: boolean; /** set once when this page saw the member win or claim: the renderer flips the medal */ flip: boolean }
export interface WatchIo {
  preview: boolean;
  claim(dropId: string): Promise<{ result: ClaimResult }>;
  /** The member's own claim result, live. */
  watchClaim(dropId: string, uid: string, fn: (r: ClaimResult | null) => void): () => void;
  /** droppedBy.uid of a drop (staff only); null when it can't be read. */
  droppedBy(dropId: string): Promise<string | null>;
  /** Preview only: puts the sample drop on a public/live the page already has. */
  decorate?(p: PubLive): PubLive;
  /** Preview only (?signup=1): the viewer is signed in with an unfinished signup. */
  signup?: boolean;
  /** Preview only: the viewer counts as staff (the dropper check runs). */
  staff?: boolean;
}

// ------------------------------------------------------------------------------------------------ the real io
export function realWatchIo(): WatchIo {
  return {
    preview: false,
    async claim(dropId) { const { call } = await import("../../lib/call"); return call<{ result: ClaimResult }>("claimDrop", { dropId }); },
    watchClaim(dropId, uid, fn) {
      let stop: (() => void) | null = null, dead = false;
      void Promise.all([import("firebase/firestore"), import("../../lib/firebase")]).then(([fs, fb]) => {
        if (dead) return;
        stop = fs.onSnapshot(fs.doc(fs.getFirestore(fb.app), "sites", fb.SITE_ID, "drops", dropId, "claims", uid),
          (s) => fn(s.exists() ? ((s.data() as any).result as ClaimResult) || null : null),
          (err) => console.warn("drops: your claim listener", err?.code || err));
      });
      return () => { dead = true; stop?.(); };
    },
    async droppedBy(dropId) {
      try {
        const { db, doc, getDoc, SITE_ID } = await import("../../lib/db");
        const s = await getDoc(doc(db, "sites", SITE_ID, "drops", dropId));
        return s.exists() ? (s.data() as any)?.droppedBy?.uid || null : null;
      } catch { return null; }
    },
  };
}

/** ?drop= on a non-production address: the local sample (drop-panel-preview.ts). */
export const dropPreviewAsked = () => !isProduction && new URLSearchParams(location.search).has("drop");
export async function watchIo(): Promise<WatchIo> {
  return dropPreviewAsked() ? (await import("./drop-panel-preview")).viewerPreview() : realWatchIo();
}

// ------------------------------------------------------------------------------------------------ words (one place for the banner and the card)
const REFUSALS: Record<string, string> = {
  full: "All claimed.", closed: "Drop closed.", ownDrop: "Your drop: you can't claim it.", needsSignup: "Finish joining to claim.", signedOut: "Sign in to claim.",
};
export const refusalText = (err: unknown) => REFUSALS[reasonOf(err) || ""] || "That didn't go through. Try again.";
const isUrl = (s: string | null) => !!s && /^(https?:)?\//.test(s);
/** A badge-like object for medal.js: art is a URL, else the emoji the server copied. */
export const dropFace = (d: PubDrop) => ({ art: isUrl(d.art) ? d.art! : "", emoji: isUrl(d.art) ? "" : d.art || "✦", rarity: d.rarity, name: d.name });
export const untilEnd = (d: PubDrop) => d.mode === "streamEnd" || d.closesAt == null;
export const claimWord = (d: PubDrop) => (d.mode === "draw" ? "Enter the draw" : "Claim");
export const countWord = (d: PubDrop) => (d.mode === "draw" ? "entered" : "claimed");
export const winnersText = (d: PubDrop) => (d.winners || []).map((h) => `<b>@${esc(h)}</b>`).join(", ");
/** The fuse for a view: how full, and which ring. */
export function fuseOf(v: DropView, p: number): { p: number; state: string } {
  switch (v.kind) {
    case "closing": case "drawing": return { p: 0, state: "closing" };
    case "claimed": return { p: 1, state: "claimed" };
    case "won": return { p: 1, state: "won" };
    case "already": return { p: 1, state: "already" };
    case "lost": return { p: 0, state: "lost" };
    case "closed": return { p: 0, state: "closed" };
    default: return { p: untilEnd(v.drop) ? 1 : p, state: "open" };
  }
}
/** Which views show the live countdown. */
export const counts = (k: DropKind) => ["open", "visitor", "signup", "already", "entered", "dropper"].includes(k);
/** The button for a view: [label, attributes] or null. Visitors get the sign-in dialog (scripts/account/ui.ts [data-signin]). */
export function buttonOf(v: DropView): { label: string; attrs: string } | null {
  if (v.kind === "visitor") return { label: "Join free to claim", attrs: 'data-signin="join" data-signin-title="Join to claim"' };
  if (v.kind === "signup") return { label: "Finish joining to claim", attrs: 'data-signin="signup"' };
  if (v.kind === "open" || v.kind === "closing") return { label: v.busy ? "Claiming…" : claimWord(v.drop), attrs: `data-drop-claim${v.busy ? " disabled" : ""}` };
  return null;
}

// ------------------------------------------------------------------------------------------------ the watcher
export interface Watcher { stop(): void; claim(): void; view(): DropView | null }

/**
 * feed: the page's public/live feed. auth: the page's auth feed. onView: called when the view changes (not on every tick).
 * The renderers tick their own countdown and claim count from view().drop.
 */
export function watchDrop({ io, feed, onAuthState, member, onView }: {
  io: WatchIo; feed: (fn: (p: PubLive) => void) => () => void; onAuthState: (fn: (a: AuthState) => void) => () => void | void;
  member: (a: AuthState) => boolean; onView: (v: DropView | null) => void;
}): Watcher {
  let pub: PubLive | null = null, auth: AuthState | null = null;
  let result: ClaimResult | null = null, resultFor = "", stopClaim: (() => void) | null = null, baseline = false;
  let dropper = false, dropperFor = "";
  let busy = false, flip = false, flips = 0, lastKey = "", cur: DropView | null = null;
  const uid = () => auth?.user?.uid || (io.preview ? "preview" : "");
  const staff = () => (io.preview ? !!io.staff : !!auth && (auth.isAdmin || auth.roles.includes("mod")));

  function celebrate(r: ClaimResult) {
    const d = pub?.drop; if (!d) return;
    if (r === "granted") { flip = true; flips++; toast(`It's yours: ${d.name}`); }
    else if (r === "won") { flip = true; flips++; toast(`You're ${d.name}`); }
  }
  function setResult(r: ClaimResult | null, mine = false) {
    const was = result; result = r;
    if (r && r !== was && (mine || baseline)) celebrate(r);
  }
  function follow() {
    const d = pub?.drop, u = uid();
    const key = d && u && auth && (auth.user || io.preview) ? `${d.id}|${u}` : "";
    if (key !== resultFor) {
      stopClaim?.(); stopClaim = null; result = null; baseline = false; resultFor = key;
      if (key) stopClaim = io.watchClaim(d!.id, u, (r) => { if (!baseline) { result = r; baseline = true; } else setResult(r); emit(); });
    }
    const dk = d && staff() ? `${d.id}|${u}` : "";
    if (dk !== dropperFor) {
      dropperFor = dk; dropper = false;
      if (dk) void io.droppedBy(d!.id).then((by) => { if (dropperFor === dk) { dropper = !!by && by === u; emit(); } });
    }
  }
  function derive(): DropView | null {
    const d = pub?.drop;
    if (!d || !auth || auth.status === "loading") return null;
    const draw = d.mode === "draw";
    let kind: DropKind;
    if (d.state === "closed") {
      if (draw && result === "won") kind = "won";
      else if (draw && (result === "lost" || (result === "entered" && (d.winners || []).length))) kind = "lost";
      else if (result === "granted") kind = "claimed";
      else if (result === "already") kind = "already";
      else kind = "closed";
    } else if (dropper) kind = "dropper";
    else if (result === "granted") kind = "claimed";
    else if (result === "already") kind = "already";
    else if (result === "entered" || result === "won" || result === "lost") kind = d.state === "drawing" || d.state === "closing" && draw && Date.now() > (d.graceUntil || 0) ? "drawing" : "entered";
    else if (d.state === "drawing") kind = "drawing";
    else if (auth.status === "needsSignup" || io.signup) kind = "signup";
    else if (!member(auth)) kind = "visitor";
    else kind = d.state === "closing" ? "closing" : "open";
    return { kind, drop: d, busy, flip };
  }
  function emit() {
    const v = derive();
    const key = v ? JSON.stringify([v.kind, v.drop.id, v.drop.state, v.drop.mode, v.drop.closesAt == null, v.drop.winners, v.busy, flips, v.drop.name]) : "";
    cur = v;
    if (key === lastKey) return;
    lastKey = key;
    onView(v);
    flip = false;    // the flip plays once: the next redraw (if any) draws the medal without it, and the count keeps it from redrawing for nothing
  }

  const offFeed = feed((p) => { pub = io.decorate ? io.decorate(p) : p; follow(); emit(); });
  const offAuth = onAuthState((a) => { auth = a; follow(); emit(); });
  return {
    stop() { offFeed(); offAuth?.(); stopClaim?.(); },
    view: () => cur,
    claim() {
      const d = pub?.drop;
      if (!d || busy) return;
      busy = true; emit();
      io.claim(d.id).then((r) => { busy = false; setResult(r.result, true); emit(); },
        (err) => { busy = false; toast(refusalText(err), { kind: "error" }); emit(); });
    },
  };
}

/** The whole window the fuse drains over: the time left when this page first saw the drop, plus any extension. */
export function fuseClock() {
  let id = "", closes = 0, full = 1;
  return (d: PubDrop, now = Date.now()) => {
    if (!d.closesAt) return 1;
    const left = d.closesAt - now;
    if (d.id !== id) { id = d.id; closes = d.closesAt; full = Math.max(left, 1); }
    else if (d.closesAt !== closes) { full += d.closesAt - closes; closes = d.closesAt; }
    return Math.max(0, Math.min(1, left / full));
  };
}
export const leftText = (d: PubDrop, now = Date.now()) => formatDropTime((d.closesAt || 0) - now);
