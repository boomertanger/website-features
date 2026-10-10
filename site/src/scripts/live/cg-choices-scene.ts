// Would You Rather and Predictions on the stream view (docs/specs/chat-games.md §6, §7, §14; mockup chat-games-batch-1.html "On stream"):
//   R2 Two cards   the Play panel's two choices at stream size with the OR badge: a gold letter A / B while open; at the reveal the share as a gold fill,
//                  the percentage on top, the winner outlined lime. Side by side in wide, stacked in tall.
//   P1 Odds board  Hot Seat's answer rows reused: answer, picks, a gold bar; picks hidden until the lock; at the result the right row turns lime and
//                  the others dim.
// Only obsFeed's chatGameDisplay (this page never starts Firebase). The "⏳ Waiting on" chip is obs.ts's, under every Chat Games scene. Canvas pixels;
// text at least 28 px. It is video, so motion stays on.
import { registerFormat } from "../../../../shared/ui/chatgames.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import type { WyrDisplay, PredDisplay } from "./choices-sample";

type Host = HTMLElement & { _cgTick?: number; _cgTotal?: number; _cgClose?: number };
const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
const SITE = "boomertanger.com/live";

function wyrHtml(d: WyrDisplay, wide: boolean) {
  const rev = d.phase === "revealed" && !!d.pct;
  const card = (i: number) => {
    const f = rev ? (d.pct![i] || 0) / 100 : 0, win = rev && (d.winners || []).includes(i);
    return `<div class="obs-wcard${win ? " is-win" : ""}" style="--f:${f}">${rev ? `<span class="obs-wfill"></span><span class="obs-wpct">${d.pct![i] || 0}%</span>` : `<span class="obs-wletter">${i ? "B" : "A"}</span>`}<span class="obs-wt">${esc(d.options[i] || "")}</span></div>`;
  };
  const head = `<div class="bt-sv-h obs-cgx-h"><i></i>Would You Rather<span class="obs-cgx-tag${rev ? " is-done" : " is-open"}">${rev ? "Revealed" : d.paused ? "Paused" : "Vote now"}</span></div><div class="obs-cgx-lead">${esc(d.lead)}</div>`;
  const foot = rev ? `${d.total || 0} ${d.total === 1 ? "vote" : "votes"} · voters get 3 XP` : `Vote at <b class="obs-w">${SITE}</b>${d.closesAt && !d.paused ? ` · <b class="obs-cgx-amber" data-cgx-clock></b>` : ""}`;
  return `${head}<div class="obs-wcards${wide ? "" : " is-tall"}">${card(0)}<span class="obs-wor">OR</span>${card(1)}</div><div class="obs-sub obs-cgx-foot">${foot}</div>${!rev && d.closesAt && !d.paused ? `<div class="obs-cg-timer" data-cg-timer><i></i></div>` : ""}`;
}
function predHtml(d: PredDisplay) {
  const shown = d.phase !== "open" && !!d.counts, res = d.phase === "result" && d.correct != null, vd = d.phase === "void";
  const tag = d.phase === "open" ? ["is-open", "Pick now"] : res ? ["is-done", "Result"] : vd ? ["", "Void"] : ["", "Locked"];
  const total = d.total || 0;
  const rows = d.options.map((o, i) => {
    const cor = res && d.correct === i, out = (res && d.correct !== i) || vd;
    return `<div class="obs-odds-row${cor ? " is-correct" : ""}${out ? " is-out" : ""}"><span class="obs-odds-t">${esc(o)}</span><small>${shown ? `${d.counts![i]} ${d.counts![i] === 1 ? "pick" : "picks"}` : "picks hidden until it locks"}${cor ? " · it happened" : ""}</small><b>${shown ? `${(d.pct || [])[i] || 0}%` : "?"}</b>${shown ? `<span class="obs-odds-bar"><i style="--f:${((d.pct || [])[i] || 0) / 100}"></i></span>` : ""}</div>`;
  }).join("");
  const foot = d.phase === "open" ? `Pick at <b class="obs-w">${SITE}</b>${d.closesAt ? ` · locks in <b class="obs-cgx-amber" data-cgx-clock></b>` : ""}` : res ? `${(d.counts || [])[d.correct!] || 0} called it · +10 XP each${d.corrected ? " · corrected" : ""}` : vd ? "It didn't happen tonight · no +10" : `Locked · ${total} ${total === 1 ? "pick" : "picks"} · waiting for what happens`;
  return `<div class="bt-sv-h obs-cgx-h"><i></i>Predictions<span class="obs-cgx-tag ${tag[0]}">${tag[1]}</span></div><div class="obs-cgx-q">${esc(d.question)}</div><div class="obs-odds">${rows}</div><div class="obs-sub obs-cgx-foot">${foot}</div>`;
}

function scene(el: HTMLElement, { display }: { display?: (WyrDisplay | PredDisplay) | null } = {}) {
  const host = el as Host;
  if (host._cgTick) { clearInterval(host._cgTick); host._cgTick = 0; }
  if (!display || (display.kind !== "wyr" && display.kind !== "predictions")) { el.innerHTML = ""; return; }
  const wide = (el.closest("[data-shape]") as HTMLElement | null)?.dataset.shape !== "tall";
  const body = display.kind === "wyr" ? wyrHtml(display as WyrDisplay, wide) : predHtml(display as PredDisplay);
  el.innerHTML = `<div class="obs-view obs-cg obs-cgx ${wide ? "is-wide" : "is-tall"}"><div class="bt-sv-panel obs-on obs-stack obs-cgx-panel">${body}</div></div>`;
  const close = display.closesAt || 0;
  if (!close) return;
  if (host._cgClose !== close) { host._cgClose = close; host._cgTotal = Math.max(10000, close - Date.now()); }
  const tick = () => {
    const left = Math.max(0, close - Date.now());
    const bar = el.querySelector<HTMLElement>("[data-cg-timer] i");
    if (bar) bar.style.width = `${Math.round((left / (host._cgTotal || 1)) * 100)}%`;
    el.querySelectorAll<HTMLElement>("[data-cgx-clock]").forEach((x) => { x.textContent = fmt(left); });
  };
  tick();
  host._cgTick = window.setInterval(() => { if (!el.isConnected) { clearInterval(host._cgTick); return; } tick(); }, 500);
}

registerFormat("would-you-rather", { scene });
registerFormat("predictions", { scene });
export {};
