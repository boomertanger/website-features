// Recruit Rush, the R1 goal meter (docs/specs/mod-machina.md §17a "Recruit Rush"; mockup docs/design/mockups/mod-deck.html sections 2 and 5).
// One markup for /live, /live/control and the Deck (styles/live-rush.css); the stream view draws its own slim bar (obs-scenes.ts). Built on
// the kit's .bt-meter in gold; no new kit piece. public/live carries recruitRush { goal, count, reward, hitAt } only while a Rush is on.
import { isProduction } from "../../lib/env.js";
import { esc } from "./ui";

export interface PubRush { goal: number; count: number; reward: string; hitAt: number | null }

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const msOf = (v: any): number | null => (v == null ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : null);
/** public/live.recruitRush (or private/control.recruitRush) to a PubRush; null when off or malformed. */
export function rushFrom(x: any): PubRush | null {
  if (!x || typeof x !== "object" || x.on === false) return null;
  const goal = num(x.goal);
  if (!goal || goal < 1) return null;
  return { goal, count: Math.max(0, num(x.count) ?? 0), reward: typeof x.reward === "string" ? x.reward : "", hitAt: msOf(x.hitAt) };
}
export const rushHit = (r: PubRush) => r.hitAt != null || r.count >= r.goal;

/** Staging previews: ?rush=0 (off), ?rush=14 (counting), ?rush=20 (hit), on a goal of 20. undefined when not asked (use the real data). */
export function previewRush(): PubRush | null | undefined {
  if (isProduction) return undefined;
  const v = new URLSearchParams(location.search).get("rush");
  if (v == null) return undefined;
  const n = Math.max(0, Math.min(20, Number(v) || 0));
  if (!n) return null;
  return { goal: 20, count: n, reward: "Hard-mode run on Friday", hitAt: n >= 20 ? Date.now() - 60_000 : null };
}

/** The R1 body: the big gold count, the meter, "new members tonight · N to go", and the reward line with its lock. */
export function rushBodyHtml(r: PubRush): string {
  const hit = rushHit(r), pct = Math.min(100, (r.count / r.goal) * 100), left = Math.max(0, r.goal - r.count);
  return `<div class="lr-rush${hit ? " is-hit" : ""}" data-rush-hit="${hit ? 1 : 0}">`
    + `<div class="lr-rush-top"><b>${Math.min(r.count, 999)} <small>/ ${r.goal}</small></b><span>${hit ? "Goal hit!" : `new members tonight · ${left} to go`}</span></div>`
    + `<div class="bt-meter bt-meter--gold"><div class="bt-meter-track" role="meter" aria-valuemin="0" aria-valuemax="${r.goal}" aria-valuenow="${Math.min(r.count, r.goal)}" aria-label="New members tonight"><div class="bt-meter-fill" style="width:${pct.toFixed(1)}%"></div></div></div>`
    + `<div class="lr-rush-reward"><span aria-hidden="true">${hit ? "🔓" : "🔒"}</span><span>${hit ? "Unlocked:" : "At the goal:"} <b>${esc(r.reward)}</b></span></div>`
    + `</div>`;
}
