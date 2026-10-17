// The Prize Box panel on /live/control (docs/specs/prize-box.md §4, §5 "/live/control"; mockup prize-box-wheel-and-draw.html section 2, "your Prize Box
// panel"). OWNER ONLY: control.ts mounts it into [data-prize-slot] for the owner and nobody else (the Captain and admins can't run a draw).
//   no draw    the launch prompt: the live contests waiting for a draw, the one due at the current beat first ("It's time"), the Round 1 switch,
//              Run the draw. A running Chat Game blocks it: the panel offers to end the game first.
//   pool       the pool counts (checked in, crew left out, cooldown left out, in the draw), Spin round 1 or Spin for the winner
//   round1     spinning, then "Round 1 landed on <group>" and Spin round 2
//   here       spinning, then "Waiting for @x" with the I'm here meter (the server respins on its own when it runs out) and Respin without them
//   won        the winner, Done, See the draw record
// Data: public/live from the one-per-tab listener (lib/live.ts onLive: prizeDraw, beat, chatGame) and public/prizeBox (the contests), read when the panel
// mounts and after each action. Writes: prizeDrawStart, prizeDrawSpin, prizeRespin, prizeDrawEnd, chatGameEnd through lib/call; the server checks
// everything again. Preview (control.ts preview mode, or ?prize=): local sample data, no callables.
import { crPanelHtml } from "../../../../shared/ui/cr-panel.js";
import { onLive } from "../../lib/live";
import { esc, toast, messageFor, withBusy } from "./ui";
import type { PubLive, PubPrizeDraw } from "./model";
import { isSpinning, landsAt, prizePreviewStep, samplePrize, secondsLeft } from "./prize-watch";
import { serverNow } from "../../lib/server-clock";

interface SumContest { id: string; slug: string; title: string; type: string; status: string; beat: string | null; prizes: { title: string }[] }
export interface PrizePanelIo {
  preview: boolean;
  call<T = any>(name: string, data?: unknown): Promise<T>;
  contests(): Promise<SumContest[]>;
  onLive(fn: (p: PubLive) => void): () => void;
}
const BEAT_NAME: Record<string, string> = { break1: "Break 1", break2: "Break 2", start: "Start", end: "End" };

export function realPrizePanelIo(): PrizePanelIo {
  return {
    preview: false,
    async call(name, data) { const { call } = await import("../../lib/call"); return call(name, data); },
    async contests() {
      const { db, doc, getDoc, SITE_ID } = await import("../../lib/db");
      const s = await getDoc(doc(db, "sites", SITE_ID, "public", "prizeBox"));
      return ((s.exists() ? (s.data() as any).contests : []) || []) as SumContest[];
    },
    onLive: (fn) => onLive(fn),
  };
}
export function previewPrizePanelIo(): PrizePanelIo {
  const step = prizePreviewStep();
  const sample = step ? samplePrize(step === "wonme" ? "won" : step).draw : null;
  return {
    preview: true,
    async call(name) { toast(`Preview: ${name} isn't sent.`); return {}; },
    async contests() { return [{ id: "sample", slug: "sample", title: "Break Wheel #1 (sample)", type: "live", status: sample ? "drawing" : "scheduled", beat: "break1", prizes: [{ title: "A horror game on Steam (sample)" }] }]; },
    onLive(fn) { const p = { state: "live", beat: "break1", chatGame: null, prizeDraw: sample } as unknown as PubLive; fn(p); return () => {}; },
  };
}

const GIFT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8c-1.5-3-5-4-5.5-2S9 8 12 8zm0 0c1.5-3 5-4 5.5-2S15 8 12 8z"/></svg>';

export interface PrizePanel { destroy(): void }
export function mountPrizePanel(el: HTMLElement, { io = realPrizePanelIo() }: { io?: PrizePanelIo } = {}): PrizePanel {
  let pub: PubLive | null = null, contests: SumContest[] = [], round1 = true, dismissed = "", told = "", busy = false, lastKey = "", tick = 0, landTimer = 0;
  const loadContests = async () => { try { contests = await io.contests(); } catch { contests = []; } draw(); };

  function launchHtml(): string {
    const waiting = contests.filter((c) => c.type === "live" && c.status === "scheduled");
    if (!waiting.length) return `<p class="pz-small">No live draw is waiting. Build one on <a href="/admin/prize-box">the Prize Box admin page</a>.</p>`;
    const beat = pub && pub.beat ? pub.beat : null;
    const due = waiting.find((c) => c.beat && c.beat === beat) || null;
    const c = due || waiting[0];
    if (due && dismissed === c.id) return `<p class="pz-small">${esc(c.title)} is waiting. <button type="button" class="bt-link-btn" data-pz-undismiss>Show it again</button></p>`;
    const badge = due ? `<span class="bt-badge bt-badge--gold">It's time: ${esc(BEAT_NAME[c.beat || ""] || "now")}</span>` : `<span class="bt-badge bt-badge--gray">Due at ${esc(BEAT_NAME[c.beat || ""] || "a break")}</span>`;
    const cg = pub && pub.chatGame;
    const block = cg ? `<div class="bt-notice pz-cg"><b>A Chat Game is running.</b> End it first, then run the draw.<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-pz-endgame="${esc(cg.runId)}">End ${esc(cg.title || "the game")}</button></div>` : "";
    return `${head(badge)}<div><div class="pz-cp-big">${esc(c.title)}</div><p class="pz-small">Prize: ${esc((c.prizes[0] && c.prizes[0].title) || "")}. One winner.</p></div>`
      + `<div class="pz-switchrow"><div>Round 1: spin for the group<small>The group slices are set in the contest.</small></div><button type="button" class="bt-switch" role="switch" aria-checked="${round1}" aria-label="Round 1" data-pz-r1></button></div>`
      + block
      + `<div class="pz-actions"><button type="button" class="bt-btn bt-btn--primary" data-pz-start="${esc(c.id)}" data-pulse="run-draw"${cg || busy ? " disabled" : ""}>Run the draw</button>${due ? '<button type="button" class="bt-btn bt-btn--ghost" data-pz-notnow>Not now</button>' : ""}</div>`;
  }
  const head = (badgeHtml: string) => `<div class="pz-cp-head">${GIFT}<span class="pz-cp-name">Prize Box</span><span class="pz-sp"></span>${badgeHtml}</div>`;
  function drawHtml(d: PubPrizeDraw): string {
    const spinning = isSpinning(d);
    const p = d.pool;
    const kv = p ? `<dl class="pz-kv"><dt>Checked in tonight</dt><dd>${p.checkedIn}</dd><dt>Crew and admins (can't win)</dt><dd>−${p.crew}</dd><dt>Won in the last 30 days</dt><dd>−${p.cooldown}</dd>${p.filtered ? `<dt>Not in the contest's rules</dt><dd>−${p.filtered}</dd>` : ""}<dt class="pz-kv-total">In the draw</dt><dd class="pz-kv-total">${p.inDraw}</dd></dl>` : "";
    const title = `<div><div class="pz-cp-big">${esc(d.contestTitle || "Prize Box draw")}</div><p class="pz-small">Prize: ${esc(d.prizeTitle || "")}</p></div>`;
    const stop = `<button type="button" class="bt-btn bt-btn--ghost" data-pz-end>Stop the draw</button>`;
    if (d.phase === "pool") {
      const r1 = d.rounds === 2;
      return head('<span class="bt-badge bt-badge--green">Drawing</span>') + title + kv
        + `<div class="pz-actions"><button type="button" class="bt-btn bt-btn--primary" data-pz-spin="${r1 ? 1 : 2}" data-pulse="spin-wheel"${p && p.inDraw < 2 ? " disabled" : ""}>${r1 ? "Spin round 1" : "Spin for the winner"}</button>${stop}</div>${p && p.inDraw < 2 ? '<p class="pz-small">Fewer than two members are in the draw, so the wheel can\'t spin.</p>' : ""}`;
    }
    if (d.phase === "round1") {
      return head('<span class="bt-badge bt-badge--green">Drawing</span>') + (spinning ? `<div class="pz-cp-big">Spinning round 1…</div><p class="pz-small">The group was picked before the spin and saved with the draw.</p>`
        : `<div><div class="pz-small">Round 1 landed on</div><div class="pz-cp-big">${esc((d.groupPick && d.groupPick.label) || "")}: ${(d.groupPick ? d.groupPick.count : 0)} members</div></div><p class="pz-small">Round 2 puts up to 10 of them, picked at random, on the wheel.</p><div class="pz-actions"><button type="button" class="bt-btn bt-btn--primary" data-pz-spin="2" data-pulse="spin-wheel">Spin round 2</button>${stop}</div>`);
    }
    if (d.phase === "here") {
      if (spinning) return head('<span class="bt-badge bt-badge--green">Drawing</span>') + `<div class="pz-cp-big">Spinning for the winner…</div><p class="pz-small">The "I'm here" window opens when it lands.</p>`;
      const s = secondsLeft(d), pct = d.hereSeconds ? Math.round((s / d.hereSeconds) * 100) : 0;
      return head('<span class="bt-badge bt-badge--green">Drawing</span>') + `<div><div class="pz-small">Waiting for</div><div class="pz-cp-big">@${esc((d.picked && d.picked.handle) || "")}</div></div>`
        + `<div class="bt-meter bt-meter--gold pz-meter-time"><div class="bt-meter-track"><div class="bt-meter-fill" data-pz-meter style="width:${pct}%"></div></div><div class="bt-meter-legend"><span><span data-pz-left>${s}</span> s left to tap I'm here</span><span>${d.hereSeconds} s</span></div></div>`
        + `<p class="pz-small">If the time runs out, the wheel spins again among the others on its own.${d.respins ? ` Respins so far: ${d.respins}.` : ""}</p><div class="pz-actions"><button type="button" class="bt-btn bt-btn--secondary" data-pz-respin>Respin without them</button>${stop}</div>`;
    }
    if (d.phase === "noSpin") return head('<span class="bt-badge bt-badge--gray">Stopped</span>') + `<div class="pz-cp-big">Not enough to spin</div><p class="pz-small">Fewer than two members are left for this draw.</p><div class="pz-actions">${stop}</div>`;
    return head('<span class="bt-badge bt-badge--lime">Done</span>') + `<div><div class="pz-small">Winner</div><div class="pz-cp-big">@${esc((d.winner && d.winner.handle) || "")}</div></div>`
      + `<p class="pz-small">Posted to /prizes and the activity feed, the badge granted, and @${esc((d.winner && d.winner.handle) || "")} told to claim the prize within 7 days. The pool, both picks and the times are saved with the draw.</p>`
      + `<div class="pz-actions"><button type="button" class="bt-btn bt-btn--primary" data-pz-end>Done</button><a class="bt-btn bt-btn--secondary" href="/admin/prize-box?tab=draws">See the draw record</a></div>`;
  }
  function draw() {
    const d = pub && pub.prizeDraw ? pub.prizeDraw : null;
    const html = crPanelHtml({ id: "lc-prize", cls: "lc-prize", title: "Prize Box", icon: "gift", bodyHtml: `<div class="pz-cp">${d ? drawHtml(d) : launchHtml()}</div>` });
    if (html !== lastKey) { lastKey = html; el.innerHTML = html; }
    clearTimeout(landTimer);
    if (d && isSpinning(d)) { const end = landsAt(d); if (end) landTimer = window.setTimeout(draw, Math.max(50, end - serverNow() + 60)); }
    // the launch prompt at the scheduled beat: a toast once per contest and beat
    if (!d && pub && pub.beat) {
      const due = contests.find((c) => c.type === "live" && c.status === "scheduled" && c.beat === pub!.beat);
      const k = due ? `${due.id}|${pub.streamId}|${pub.beat}` : "";
      if (k && told !== k) { told = k; toast(`It's time for the Prize Box draw: ${due!.title}.`); }
    }
  }
  const act = async (btn: HTMLButtonElement, label: string, name: string, data: unknown) => {
    busy = true;
    try { await withBusy(btn, label, () => io.call(name, data)); } catch (err) { toast(messageFor(err), { kind: "error" }); }
    finally { busy = false; await loadContests(); }
  };
  const off = io.onLive((p) => { const was = pub && pub.prizeDraw ? pub.prizeDraw.phase : null; pub = p; const now = p.prizeDraw ? p.prizeDraw.phase : null; if (was !== now) void loadContests(); else draw(); });
  void loadContests();
  tick = window.setInterval(() => {
    const d = pub && pub.prizeDraw; if (!d || d.phase !== "here" || document.hidden) return;
    const s = secondsLeft(d), left = el.querySelector("[data-pz-left]"), m = el.querySelector<HTMLElement>("[data-pz-meter]");
    if (left && left.textContent !== String(s)) left.textContent = String(s);
    if (m && d.hereSeconds) m.style.width = `${Math.round((s / d.hereSeconds) * 100)}%`;
  }, 250);
  el.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("button, a");
    if (!t || !el.contains(t)) return;
    const b = t as HTMLButtonElement, d = pub && pub.prizeDraw;
    if (t.hasAttribute("data-pz-r1")) { round1 = !round1; draw(); }
    else if (t.hasAttribute("data-pz-notnow")) { const c = contests.find((x) => x.type === "live" && x.status === "scheduled" && x.beat === (pub && pub.beat)); dismissed = c ? c.id : ""; draw(); }
    else if (t.hasAttribute("data-pz-undismiss")) { dismissed = ""; draw(); }
    else if (t.dataset.pzStart) void act(b, "Starting…", "prizeDrawStart", { contestId: t.dataset.pzStart, useRound1: round1 });
    else if (t.dataset.pzSpin && d) void act(b, "Spinning…", "prizeDrawSpin", { drawId: d.drawId, round: Number(t.dataset.pzSpin) });
    else if (t.hasAttribute("data-pz-respin") && d) void act(b, "Respinning…", "prizeRespin", { drawId: d.drawId });
    else if (t.hasAttribute("data-pz-end") && d) void act(b, "Closing…", "prizeDrawEnd", { drawId: d.drawId });
    else if (t.dataset.pzEndgame) void act(b, "Ending…", "chatGameEnd", { runId: t.dataset.pzEndgame });
  });
  return { destroy() { off(); clearInterval(tick); clearTimeout(landTimer); el.innerHTML = ""; } };
}
