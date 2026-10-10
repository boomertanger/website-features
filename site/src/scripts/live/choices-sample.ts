// Would You Rather and Predictions: the run displays (as the server writes them) and the preview rounds (docs/specs/chat-games.md §6, §7; part 5).
// No Firebase here: the stream view demo (obs-demo.ts) and the site previews (?game=wyr, ?game=predictions) both use it. A step can be pinned with
// ?step= (wyr: open | revealed; predictions: open | locked | called | result | void); otherwise the preview loops. ?waiting=1 adds a waiting Prediction.
export type WyrDisplay = {
  kind: "wyr"; phase: "open" | "revealing" | "revealed" | string; round: number; lead: string; options: string[]; source: "pack" | "typed" | string; paused?: boolean;
  counts?: number[]; pct?: number[]; total?: number; winners?: number[]; closesAt?: number | null;
};
export type PredDisplay = {
  kind: "predictions"; phase: "open" | "locking" | "locked" | "result" | "void" | string; question: string; options: string[]; source: "pack" | "typed" | string;
  counts?: number[]; pct?: number[]; total?: number; correct?: number; corrected?: boolean; waiting?: boolean; closesAt?: number | null;
};
export type WaitingItem = { runId: string; title: string | null };

export const WYR_SAMPLE = { lead: "Would you rather…", options: ["Hide in a locker while something breathes outside", "Crawl a vent you can't turn around in"] };
export const PRED_SAMPLE = { question: "Does Boomer die before the first save room?", options: ["Yes, before the save room", "No, he makes it", "He dies AT the save room"] };
export const WAITING_SAMPLE: WaitingItem[] = [{ runId: "preview-wait", title: "Does the chainsaw guy come back before the boss?" }];

export const WYR_STEPS: [string, number][] = [["open", 14000], ["revealed", 9000]];
export const PRED_STEPS: [string, number][] = [["open", 12000], ["locked", 9000], ["called", 6000], ["result", 9000]];
const loop = (steps: [string, number][]) => steps.reduce((n, [, d]) => n + d, 0);

/** The step on the loop at time t (or the pinned one), its deadline and how far into it we are. */
export function stepAt(steps: [string, number][], t: number, t0: number, pinned?: string | null): { step: string; closesAt: number | null; into: number; lap: number } {
  const lap = Math.floor((t - t0) / loop(steps));
  const fixed = pinned && (steps.find(([s]) => s === pinned) || (pinned === "void" ? ["void", 0] : null));
  if (fixed) return { step: fixed[0], closesAt: fixed[0] === "open" ? t0 + Math.ceil((t - t0 + 1) / 45000) * 45000 : null, into: 99999, lap: 0 };
  let at = (t - t0) % loop(steps), start = t - at;
  for (const [s, d] of steps) { if (at < d) return { step: s, closesAt: s === "open" ? start + d : null, into: at, lap }; at -= d; start += d; }
  return { step: steps[0][0], closesAt: null, into: 0, lap };
}

export function wyrSampleDisplay(step: string, { closesAt = null, into = 99999 }: { closesAt?: number | null; into?: number } = {}): WyrDisplay {
  const base: WyrDisplay = { kind: "wyr", phase: step === "revealed" ? "revealed" : "open", round: 2, lead: WYR_SAMPLE.lead, options: WYR_SAMPLE.options, source: "typed", closesAt };
  if (step !== "revealed") return base;
  return { ...base, counts: [133, 81], pct: [62, 38], total: 214, winners: [0] };
}
export function predSampleDisplay(step: string, { closesAt = null }: { closesAt?: number | null } = {}): PredDisplay {
  const base: PredDisplay = { kind: "predictions", phase: "open", question: PRED_SAMPLE.question, options: PRED_SAMPLE.options, source: "typed", closesAt };
  const split = { counts: [46, 30, 20], pct: [48, 31, 21], total: 96 };
  if (step === "open") return base;
  if (step === "void") return { ...base, ...split, phase: "void" };
  if (step === "result") return { ...base, ...split, phase: "result", correct: 0 };
  return { ...base, ...split, phase: "locked", waiting: true };
}
