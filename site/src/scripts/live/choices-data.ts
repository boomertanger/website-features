// Would You Rather and Predictions data for the site (docs/specs/chat-games.md §3, §6, §7, §12; part 5). Runs are followed with live listeners
// (cg-watch.ts): the run doc only for members (its display carries the prompt, and the split once it's out); the run panels add staff/{r<n> | p}
// (the voter count, a mod's call) for the crew. A member's own plays/{uid} (r.{n}: pick, result, lock, win) is a one-off Lite read when the run
// changes. Every move is a callable: chatGamePlay (vote { choice }), chatGameControl, predictionPropose, predictionSettle, chatGameStart / Swap.
// Preview (staging, signed out, ?game=wyr | predictions): the sample rounds from choices-sample.ts, ?step= pins one; nothing is read or written.
import { db, doc, getDoc, SITE_ID } from "../../lib/db";
import { call } from "../../lib/call";
import { isProduction } from "../../lib/env.js";
import { watchDoc } from "./cg-watch";
import { stepAt, wyrSampleDisplay, predSampleDisplay, WYR_STEPS, PRED_STEPS, WAITING_SAMPLE, PRED_SAMPLE, type WyrDisplay, type PredDisplay, type WaitingItem } from "./choices-sample";

export const WYR_ID = "would-you-rather", PRED_ID = "predictions";
const base = () => ["sites", SITE_ID, "chatGames", "main"] as const;
const ms = (v: any): number => (v == null ? 0 : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : 0);
const q = () => new URLSearchParams(location.search);

export interface CRun {
  id: string; formatId: string; state: string; round: number; prompt: { text: string; options: string[] }; source: string; packId: string | null; closesAt: number | null;
  paused: boolean; display: (WyrDisplay | PredDisplay) | null; streamId: string; result: { answer: number; was?: number; byHandle?: string | null } | null; corrected: boolean;
  savedRound: number | null; waiting: boolean; lastByHandle: string | null;
}
export interface CPlay { pick?: number; result?: { xp: number; capped: boolean; crew: boolean }; lock?: { xp: number; capped: boolean; crew: boolean }; win?: { xp: number; capped: boolean; crew: boolean; reversed?: number } }
export interface CStaff { total: number; proposal: { answer: number; by: string; byHandle: string | null } | null }

/** The preview: staging only, signed out, ?game=wyr or ?game=predictions. */
export const choicePreview = (signedIn: boolean, formatId?: string) => {
  if (isProduction || signedIn) return false;
  const g = q().get("game");
  return formatId ? g === (formatId === WYR_ID ? "wyr" : "predictions") || (formatId === PRED_ID && q().get("waiting") === "1") : g === "wyr" || g === "predictions" || q().get("waiting") === "1";
};
/** Any signed-out staging preview (?as=…, or a game flag): the launch and Save dialogs use the sample packs. */
export const anyPreview = (signedIn: boolean) => !isProduction && !signedIn && (q().has("as") || !!q().get("game") || q().get("waiting") === "1");
export const previewFormat = () => (q().get("game") === "wyr" ? WYR_ID : q().get("game") === "predictions" ? PRED_ID : null);
export const previewWaiting = (): WaitingItem[] => (!isProduction && q().get("waiting") === "1" ? WAITING_SAMPLE : []);

function runFrom(id: string, d: any): CRun {
  return {
    id, formatId: String(d.formatId || ""), state: String(d.state || ""), round: Number(d.round) || 1, prompt: { text: String(d.prompt?.text || ""), options: (d.prompt?.options || []).map(String) },
    source: d.source || "pack", packId: d.packId || null, closesAt: d.closesAt ? ms(d.closesAt) : null, paused: d.paused === true, display: d.display || null, streamId: String(d.streamId || ""),
    result: d.result && Number.isInteger(d.result.answer) ? { answer: d.result.answer, was: d.result.was, byHandle: d.result.byHandle || null } : null, corrected: d.corrected === true,
    savedRound: d.savedRound ?? null, waiting: d.waiting === true, lastByHandle: d.lastByHandle || null,
  };
}

// ---------- the preview (a local round; the viewer's own moves stick) ----------
const T0 = Date.now();
const pv = { pick: {} as Record<string, number>, proposal: null as number | null, locked: false, settled: null as number | null, voided: false, saved: false };
function previewRun(runId: string): CRun {
  const step = q().get("step");
  if (runId === "preview-wait") {
    const d = predSampleDisplay(pv.settled != null ? "result" : pv.voided ? "void" : "locked");
    if (pv.settled != null) d.correct = pv.settled;
    return { id: runId, formatId: PRED_ID, state: pv.settled != null ? "ended" : pv.voided ? "void" : "locked", round: 1, prompt: { text: WAITING_SAMPLE[0].title || "", options: ["Yes", "No"] }, source: "typed", packId: null, closesAt: null, paused: false,
      display: { ...d, question: WAITING_SAMPLE[0].title || "", options: ["Yes", "No"], counts: [61, 35], pct: [64, 36], total: 96 }, streamId: "preview", result: pv.settled != null ? { answer: pv.settled } : null, corrected: false, savedRound: null, waiting: pv.settled == null && !pv.voided, lastByHandle: null };
  }
  if (runId === "preview-wyr") {
    const at = stepAt(WYR_STEPS, Date.now(), T0, step);
    const d = wyrSampleDisplay(at.step, { closesAt: at.closesAt, into: at.into });
    return { id: runId, formatId: WYR_ID, state: at.step === "revealed" ? "revealed" : "open", round: 2, prompt: { text: d.lead, options: d.options }, source: "typed", packId: "classics", closesAt: at.closesAt, paused: false, display: d, streamId: "preview", result: null, corrected: false, savedRound: pv.saved ? 2 : null, waiting: false, lastByHandle: null };
  }
  const at = stepAt(PRED_STEPS, Date.now(), T0, pv.locked && (!step || step === "open") ? "locked" : step);
  const s = at.step === "called" ? "locked" : at.step;
  const d = predSampleDisplay(s, { closesAt: at.closesAt });
  const result = s === "result" ? { answer: 0, byHandle: "hand1" } : null;
  return { id: "preview-pred", formatId: PRED_ID, state: s === "open" ? "open" : s === "locked" ? "locked" : s === "void" ? "void" : "revealed", round: 1, prompt: { text: PRED_SAMPLE.question, options: PRED_SAMPLE.options }, source: "typed", packId: "re4",
    closesAt: at.closesAt, paused: false, display: d, streamId: "preview", result, corrected: false, savedRound: null, waiting: false, lastByHandle: null };
}
const previewStep = () => (q().get("step") || "");

// ---------- live listeners ----------
export function watchCRun(runId: string, preview: boolean, fn: (r: CRun | null) => void, onErr?: () => void): () => void {
  if (preview || runId.startsWith("preview-")) { fn(previewRun(runId)); const t = window.setInterval(() => fn(previewRun(runId)), 1000); return () => clearInterval(t); }
  return watchDoc([...base(), "runs", runId], (d) => fn(d ? runFrom(runId, d) : null), onErr);
}
/** The crew's view of a run: staff/r{n} (Would You Rather) or staff/p (Predictions). */
export function watchCStaff(runId: string, key: string, preview: boolean, fn: (s: CStaff) => void): () => void {
  const of = (d: any): CStaff => ({ total: Number(d?.total) || 0, proposal: d?.proposal && Number.isInteger(d.proposal.answer) ? d.proposal : null });
  if (preview || runId.startsWith("preview-")) {
    const tick = () => fn({ total: runId === "preview-wyr" ? 120 + Math.floor((Date.now() - T0) / 700) % 90 : 96, proposal: pv.proposal != null ? { answer: pv.proposal, by: "me", byHandle: "you" } : previewStep() === "called" || (runId === "preview-pred" && stepAt(PRED_STEPS, Date.now(), T0, previewStep()).step === "called") ? { answer: 0, by: "lead1", byHandle: "nyx" } : null });
    tick(); const t = window.setInterval(tick, 1000); return () => clearInterval(t);
  }
  return watchDoc([...base(), "runs", runId, "staff", key], (d) => fn(of(d)));
}

// ---------- one-off reads ----------
export async function getMyChoice(runId: string, uid: string, n: number, preview = false): Promise<CPlay> {
  if (preview || runId.startsWith("preview-")) {
    const r = previewRun(runId), mine = pv.pick[runId];
    const out: CPlay = { pick: mine ?? (runId === "preview-wait" ? 0 : r.state === "open" ? undefined : 0) };
    if (r.formatId === WYR_ID && r.state === "revealed") out.result = { xp: 3, capped: false, crew: q().get("duty") === "1" };
    if (r.formatId === PRED_ID && r.state !== "open") out.lock = { xp: 3, capped: false, crew: q().get("duty") === "1" };
    if (r.result && out.pick === r.result.answer) out.win = { xp: 10, capped: false, crew: q().get("duty") === "1" };
    return out;
  }
  try { const s = await getDoc(doc(db, ...base(), "runs", runId, "plays", uid)); return ((s.data() as any)?.r || {})[n] || {}; } catch { return {}; }
}
/** Clocked in for this stream (crew only can read private/duty; anyone else is not on duty). */
export async function onDuty(streamId: string, uid: string, preview = false): Promise<boolean> {
  if (preview) return q().get("duty") === "1";
  try { return !!((await getDoc(doc(db, "sites", SITE_ID, "streams", streamId, "private", "duty"))).data() as any)?.onDuty?.[uid]; } catch { return false; }
}

// ---------- moves ----------
export async function choose(runId: string, choice: number, preview = false) {
  if (preview || runId.startsWith("preview-")) { pv.pick[runId] = choice; return { ok: true }; }
  return call("chatGamePlay", { runId, action: "vote", choice });
}
export async function cControl(runId: string, action: string, data: Record<string, unknown> = {}, preview = false) {
  if (preview || runId.startsWith("preview-")) { if (action === "lock") pv.locked = true; if (action === "saveToPack") pv.saved = true; return { ok: true }; }
  return call("chatGameControl", { runId, action, data });
}
export async function propose(runId: string, answer: number, preview = false) {
  if (preview || runId.startsWith("preview-")) { pv.proposal = answer; return { ok: true }; }
  return call("predictionPropose", { runId, answer });
}
export async function settle(runId: string, action: string, answer?: number, preview = false) {
  if (preview || runId.startsWith("preview-")) {
    if (action === "reject") pv.proposal = null;
    if (action === "confirm" || action === "settle") { pv.settled = action === "confirm" ? pv.proposal ?? 0 : answer ?? 0; pv.proposal = null; }
    if (action === "void") pv.voided = true;
    return { ok: true };
  }
  return call("predictionSettle", { runId, action, ...(answer != null ? { answer } : {}) });
}
