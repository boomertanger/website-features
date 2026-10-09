// shared/ui/beats.js — .bt-beats, the four-station beat tracker: Start, Break 1, Break 2, End (docs/design-system.md §5 "Control
// Room pieces", docs/specs/control-room.md §4). States per station: done (check), now (the pulsing double ripple, in the live colour:
// red, green backstage), next ("Up next"), skipped (struck through; End marks any break not begun as skipped), or empty (not reached).
// Text is escaped.
//
//   BEAT_KEYS   ["start", "break1", "break2", "end"]      BEAT_NAMES   { start: "Start", break1: "Break 1", ... }
//   beatsHtml({ beats, now, progress, chips, label })
//     beats     { start, break1, break2, end }: each "done" | "now" | "next" | "skipped" | "" , or { state, time }
//               (time is the small text under the name, e.g. "7:02 PM")
//     now       the key that is running; overrides beats[now] and sets the fill to that station
//     progress  0..1, how far the line has travelled towards the next station when none is "now"
//     chips     { break1: "Check-in open" }: the pill under a "now" station (default "Now")
//     label     aria-label of the list
import { escapeHtml as esc } from "./dom.js";

export const BEAT_KEYS = ["start", "break1", "break2", "end"];
export const BEAT_NAMES = { start: "Start", break1: "Break 1", break2: "Break 2", end: "End" };
const STATES = ["done", "now", "next", "skipped"];
const CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M5 12l5 5 9-11"/></svg>`;

export function beatsHtml({ beats = {}, now = "", progress = 0, chips = {}, label = "Stream beats" } = {}) {
  const items = BEAT_KEYS.map((k, i) => {
    const raw = beats[k];
    const o = typeof raw === "object" && raw ? raw : { state: raw };
    const state = k === now ? "now" : STATES.includes(o.state) ? o.state : "";
    return { k, i, state, time: o.time || "" };
  });
  const nowIdx = items.findIndex((b) => b.state === "now");
  const lastDone = items.reduce((m, b) => (b.state === "done" ? b.i : m), -1);
  const at = nowIdx >= 0 ? nowIdx : Math.max(lastDone, 0);
  const p = Math.min(1, (nowIdx >= 0 ? at : lastDone < 0 ? 0 : at + Math.max(0, Math.min(1, progress))) / 3);
  const li = ({ k, i, state, time }) => {
    const dot = state === "done" ? CHECK : state === "skipped" ? "–" : String(i + 1);
    const sub = state === "now" ? `<span class="bt-beat-chip">${esc(chips[k] || "Now")}</span>` : state === "next" ? `<small>Up next</small>` : time ? `<small>${esc(time)}</small>` : "";
    return `<li class="bt-beat${state ? ` is-${state}` : ""}"${state === "now" ? ` aria-current="step"` : ""}><span class="bt-beat-dot" aria-hidden="true">${dot}</span><b>${esc(BEAT_NAMES[k])}</b>${sub}<span class="bt-sr-only">${state ? `, ${state === "now" ? "now" : state === "next" ? "up next" : state}` : ""}</span></li>`;
  };
  return `<div class="bt-beats" style="--p:${p.toFixed(3)}"><span class="bt-beats-fill" aria-hidden="true"></span><ol class="bt-beats-list" aria-label="${esc(label)}">${items.map(li).join("")}</ol></div>`;
}
