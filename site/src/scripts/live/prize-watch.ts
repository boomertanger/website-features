// The viewer's side of a Prize Box live draw (docs/specs/prize-box.md §4, §5 "/live"; mockup docs/design/mockups/prize-box-wheel-and-draw.html section 2):
// ONE state machine shared by the site-wide gold banner (prize-banner.ts) and the /live Prize Box card (prize-card.ts), so the two never disagree.
//
// Reads (real):
//   public/live.prizeDraw     from the feed the page already has (lib/live.ts onLive, or /live's pubApi feed): no new public/live listener
//   prizeMine { draw: true }  the viewer's own place in the draw (in the pool, in the group, their blade, picked, won), read ONCE each time the
//                             pointer moves (a new draw, round, respin or result), never polled. public/live holds handles only, never uids.
// Writes: prizeHere through lib/call (the server checks the picked member and the 60 s window again).
// The spins on the pointer were decided by the server, so "spinning" and "landed" come from the clock: every viewer sees the same moment.
// Preview (non-production): ?prize=pool|round1|still|out|wheel|spinning|picked|waiting|won|wonme|nospin draws local sample data only.
import type { AuthState } from "../../lib/auth";
import { isProduction } from "../../lib/env.js";
import { reasonOf } from "../../lib/errors";
import { toast } from "./ui";
import type { PubLive, PubPrizeDraw } from "./model";

export interface PrizeMe { drawId: string; inPool: boolean; inGroup: boolean; blade: number | null; picked: boolean; won: boolean; winnerId: string | null }
export type PrizeKind = "visitor" | "signup" | "notIn" | "pool" | "round1" | "still" | "out" | "wheel" | "offWheel" | "spinning" | "picked" | "waiting" | "won" | "wonOther" | "noSpin";
export interface PrizeView { kind: PrizeKind; draw: PubPrizeDraw; me: PrizeMe | null; spinning: boolean; busy: boolean }
export interface PrizeIo {
  preview: boolean;
  me(): Promise<PrizeMe | null>;
  here(drawId: string): Promise<{ won?: boolean; already?: boolean }>;
  /** Preview only: the sample pointer for the step on the address. */
  sample?(): PubPrizeDraw | null;
  /** Preview only: the viewer's own sample state. */
  sampleMe?(): PrizeMe | null;
}

// ------------------------------------------------------------------------------------------------ the real io
export function realPrizeIo(): PrizeIo {
  return {
    preview: false,
    async me() { const { call } = await import("../../lib/call"); const r = await call<{ draw: PrizeMe | null }>("prizeMine", { draw: true }); return r.draw || null; },
    async here(drawId) { const { call } = await import("../../lib/call"); return call("prizeHere", { drawId }); },
  };
}

// ------------------------------------------------------------------------------------------------ previews (non-production, sample data only)
const PREVIEW_STEPS = ["pool", "round1", "still", "out", "wheel", "spinning", "picked", "waiting", "won", "wonme", "nospin"] as const;
export type PreviewStep = (typeof PREVIEW_STEPS)[number];
export const prizePreviewStep = (): PreviewStep | null => {
  if (isProduction) return null;
  const v = new URLSearchParams(location.search).get("prize");
  return (PREVIEW_STEPS as readonly string[]).includes(v || "") ? (v as PreviewStep) : null;
};
const SAMPLE_NAMES = ["@cryptkeeper", "@ghostlight", "@hexqueen", "@mothman", "@screamteam", "@nightowl", "@gravedigger", "@lanternjack", "@pumpkinrot", "@staticghost"];
const SAMPLE_GROUPS = ["Everyone", "Night Shift top 50", "Every beat tonight", "Tap the Splat badge", "Everyone", "Members 90 days", null, "Night Shift top 10", "Beat the Boss badge", "Every beat tonight"];
const ME = 5;
/** A sample pointer for a preview step, with spins that start a moment after the page opens (so the wheel plays). Sample text only. */
export function samplePrize(step: PreviewStep, t0 = Date.now()): { draw: PubPrizeDraw; me: PrizeMe } {
  const spin = (pickIndex: number, startAt: number, again = false) => ({ pickIndex, offset: 0.45, spins: 5, durationMs: 7600, startAt, again });
  const landed = t0 - 9000, soon = t0 + 800;
  const r1 = ["pool", "round1", "still", "out"].includes(step);
  const draw: PubPrizeDraw = {
    drawId: "sample-draw", contestId: "sample", contestSlug: "sample", contestTitle: "Break Wheel #1 (sample)", prizeTitle: "A horror game on Steam (sample)",
    phase: step === "pool" ? "pool" : r1 ? "round1" : step === "won" || step === "wonme" ? "won" : step === "nospin" ? "noSpin" : "here",
    round: step === "pool" ? 0 : r1 ? 1 : 2, rounds: 2,
    labels: step === "pool" ? null : r1 ? SAMPLE_GROUPS : SAMPLE_NAMES,
    groups: SAMPLE_GROUPS.map((g, i) => ({ label: g || "Spin again", count: g ? [47, 21, 18, 12, 47, 30, 1, 5, 3, 18][i] : 1 })),
    groupPick: r1 && step !== "round1" ? { index: 2, label: "Every beat tonight", count: 18 } : !r1 ? { index: 2, label: "Every beat tonight", count: 18 } : null,
    spins: step === "pool" ? [] : step === "round1" ? [spin(6, soon, true), spin(2, soon + 8900)] : r1 ? [spin(2, landed)] : step === "spinning" || step === "wheel" ? [spin(ME, soon)] : [spin(ME, landed)],
    picked: ["picked", "waiting", "spinning", "wheel"].includes(step) ? { handle: step === "waiting" ? "ghostlight" : "nightowl", index: step === "waiting" ? 1 : ME } : null,
    hereUntil: ["picked", "waiting"].includes(step) ? t0 + 52000 : step === "spinning" || step === "wheel" ? soon + 7600 + 60000 : null, hereSeconds: 60,
    winner: step === "won" ? { handle: "ghostlight" } : step === "wonme" ? { handle: "nightowl" } : null,
    pool: { checkedIn: 52, crew: 4, cooldown: 1, filtered: 0, inDraw: 47 }, respins: 0,
  };
  if ((step === "waiting" || step === "won") && draw.spins[0]) draw.spins[0].pickIndex = 1;   // @ghostlight's blade
  const me: PrizeMe = {
    drawId: "sample-draw", inPool: true, inGroup: step !== "out", blade: r1 || step === "pool" ? null : ME,
    picked: step === "picked" || step === "spinning" || step === "wheel", won: step === "wonme", winnerId: step === "wonme" ? "sample-draw" : null,
  };
  return { draw, me };
}
export function previewPrizeIo(step: PreviewStep): PrizeIo {
  const s = samplePrize(step);
  return {
    preview: true,
    async me() { return s.me; },
    async here() { toast("Preview: nothing is sent."); return { won: true }; },
    sample: () => s.draw, sampleMe: () => s.me,
  };
}
export async function prizeIo(): Promise<PrizeIo> { const step = prizePreviewStep(); return step ? previewPrizeIo(step) : realPrizeIo(); }

// ------------------------------------------------------------------------------------------------ words and times (one place for the banner and the card)
const REFUSALS: Record<string, string> = { notPicked: "The wheel didn't land on you this time.", late: "Time ran out, so the wheel spins again.", spinning: "The wheel is still spinning.", signedOut: "Sign in first." };
export const hereRefusal = (err: unknown) => REFUSALS[reasonOf(err) || ""] || "That didn't go through. Try again.";
const lastSpin = (d: PubPrizeDraw) => (d.spins.length ? d.spins[d.spins.length - 1] : null);
/** When the wheel stops (ms), or null when it isn't spinning for this phase. */
export const landsAt = (d: PubPrizeDraw) => { const s = lastSpin(d); return s ? s.startAt + s.durationMs : null; };
export const isSpinning = (d: PubPrizeDraw, now = Date.now()) => { const s = d.spins[0], end = landsAt(d); return !!s && !!end && now >= s.startAt - 2000 && now < end; };
export const secondsLeft = (d: PubPrizeDraw, now = Date.now()) => (d.hereUntil ? Math.max(0, Math.ceil((d.hereUntil - now) / 1000)) : 0);
/** The blade colour for a blade index (the decorative wheel tokens). */
export const bladeColor = (i: number | null) => (i == null ? "" : `var(--bt-wheel-${i + 1})`);
const COLOR_NAMES = ["violet", "blue", "steel blue", "teal", "green", "yellow", "orange", "coral", "red", "pink"];
export const bladeName = (i: number | null) => (i == null ? "" : COLOR_NAMES[i] || "");

// ------------------------------------------------------------------------------------------------ the watcher
export interface PrizeWatcher { stop(): void; here(): void; view(): PrizeView | null }

export function watchPrize({ io, feed, onAuthState, member, onView }: {
  io: PrizeIo; feed: (fn: (p: PubLive) => void) => () => void; onAuthState: (fn: (a: AuthState) => void) => () => void | void;
  member: (a: AuthState) => boolean; onView: (v: PrizeView | null) => void;
}): PrizeWatcher {
  let draw: PubPrizeDraw | null = null, auth: AuthState | null = null, me: PrizeMe | null = null, meKey = "", busy = false, cur: PrizeView | null = null, lastKey = "", landTimer = 0;
  const keyOf = (d: PubPrizeDraw) => JSON.stringify([d.drawId, d.phase, d.round, d.respins, d.picked && d.picked.handle, d.winner && d.winner.handle]);

  function followMe() {
    const signed = !!auth && (io.preview || (!!auth.user && member(auth)));   // a preview has its sample viewer even signed out
    const k = draw && signed ? keyOf(draw) : "";
    if (k === meKey) return;
    meKey = k;
    if (!k) { me = null; return; }
    void io.me().then((m) => { if (meKey === k) { me = m; emit(); } }, () => { /* keep the last answer: the card still works from public/live */ });
  }
  function derive(): PrizeView | null {
    if (!draw || !auth || auth.status === "loading") return null;
    const now = Date.now(), spinning = isSpinning(draw, now);
    let kind: PrizeKind;
    if (me && me.won) kind = "won";   // straight after I'm here, before public/live catches up
    else if (draw.phase === "won") kind = "wonOther";
    else if (draw.phase === "noSpin") kind = "noSpin";
    else if (auth.status === "needsSignup") kind = "signup";
    else if (!member(auth) && !io.preview) kind = "visitor";
    else if (me && !me.inPool) kind = "notIn";
    else if (draw.phase === "pool") kind = "pool";
    else if (draw.phase === "round1") kind = spinning ? "round1" : me && !me.inGroup ? "out" : "still";
    else if (me && !me.inGroup) kind = "out";
    else if (me && me.blade == null) kind = "offWheel";
    else if (spinning) kind = "spinning";
    else if (draw.phase === "here") kind = me && me.picked ? "picked" : "waiting";
    else kind = "wheel";
    return { kind, draw, me, spinning, busy };
  }
  function emit() {
    const v = derive();
    const key = v ? JSON.stringify([v.kind, keyOf(v.draw), v.spinning, v.busy, v.me && [v.me.blade, v.me.picked, v.me.won]]) : "";
    cur = v;
    clearTimeout(landTimer);
    if (v && v.spinning) { const end = landsAt(v.draw); if (end) landTimer = window.setTimeout(emit, Math.max(50, end - Date.now() + 60)); }   // redraw when it lands
    else if (v && v.draw.spins[0] && Date.now() < v.draw.spins[0].startAt - 2000) landTimer = window.setTimeout(emit, v.draw.spins[0].startAt - 2000 - Date.now() + 30);
    if (key === lastKey) return;
    lastKey = key;
    onView(v);
  }
  const apply = (p: PubLive) => { draw = io.sample ? io.sample() : p.prizeDraw || null; followMe(); emit(); };
  const offFeed = feed(apply);
  const offAuth = onAuthState((a) => { auth = a; followMe(); emit(); });
  if (io.sampleMe) me = io.sampleMe();
  return {
    stop() { offFeed(); offAuth?.(); clearTimeout(landTimer); },
    view: () => cur,
    here() {
      if (!draw || busy) return;
      busy = true; emit();
      io.here(draw.drawId).then((r) => { busy = false; if (r && (r.won || r.already)) { me = me ? { ...me, won: true, picked: false } : me; toast("You won! Claim your prize within 7 days."); } emit(); },
        (err) => { busy = false; toast(hereRefusal(err), { kind: "error" }); emit(); });
    },
  };
}
