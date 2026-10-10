// Hot Seat on the stream view (docs/specs/chat-games.md §5, §14; mockup control-room-batch-4.html "Hot Seat on stream"): Chat Games' scene for formatId
// "hot-seat", registered with shared/ui/chatgames.js. It only uses obsFeed's chatGameDisplay (this page never starts Firebase), so it shows exactly the
// server's draw: the picker (.bt-seance by default, .bt-wheel when the Captain switched the round) lands on the seats the round holds, one by one; a
// replaced player is struck through and the new draw follows. Then the answering (who has locked in, never what), the vote (answers without names),
// and the reveal (names, votes, the winner in gold). Wide: picker left, panel right; tall: picker on top. Canvas pixels; text at least 28 px.
// It is video, so motion stays on (data-motion="always").
import { registerFormat } from "../../../../shared/ui/chatgames.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { seanceHtml, seanceDraw } from "../../../../shared/ui/seance.js";
import { wheelHtml, wheelSpin } from "../../../../shared/ui/wheel.js";
import type { HsDisplay, HsSeat } from "./hotseat-sample";

interface PickState { key: string; picker: string; all: HsSeat[]; shown: number; busy: boolean; stop: () => void }
type Host = HTMLElement & { _hsTick?: number; _hsPick?: PickState | null; _hsTotal?: number; _hsClose?: number };

const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
const gone = (s: string) => s === "replaced" || s === "out";
const SITE = "boomertanger.com/live";

/** Seats in draw order, keeping the ones that were replaced (the display drops them) so the board can strike them through. */
function mergeSeats(prev: HsSeat[], now: HsSeat[]): HsSeat[] {
  const out = prev.map((s) => { const n = now.find((x) => x.handle === s.handle); return n ? { ...n } : gone(s.status) ? s : { ...s, status: "replaced" }; });
  for (const s of now) if (!out.some((x) => x.handle === s.handle)) out.push({ ...s });
  return out;
}

function panelHtml(d: HsDisplay, wide: boolean) {
  const head = `<div class="bt-sv-h"><i></i>Hot Seat · Round ${d.round || 1} of ${d.rounds}${d.paused ? ` <span class="obs-hs-paused">Paused</span>` : ""}</div>`;
  const card = `<div class="obs-hs-card">${d.card ? esc(d.card) : "Drawing a card…"}</div>`;
  const timer = `<div class="obs-cg-timer" data-cg-timer ${d.closesAt && !d.paused ? "" : "hidden"}><i></i></div>`;
  const left = `<div class="obs-sub" data-hs-left></div>`;
  const ph = d.phase;
  if (ph === "starting" || ph === "waiting") return `${head}${card}<div class="obs-sub">Need players! Tap <b class="obs-w">Put me in</b> at <b class="obs-w">${SITE}</b></div>${timer}${left}`;
  if (ph === "accept") {
    const picks = d.seats.map((s) => `<span class="obs-hs-pick" data-st="${esc(s.status)}">@${esc(s.handle)}${s.status === "in" ? " ✓" : ""}</span>`).join("");
    return `${head}${card}<div class="obs-hs-picks">${picks}</div><div class="obs-sub">Players, tap <b class="obs-w">I'm in</b> at ${SITE}</div>${timer}${left}`;
  }
  if (ph === "answer") {
    const rows = d.seats.filter((s) => !gone(s.status)).map((s) => `<div class="obs-hs-a"><span>@${esc(s.handle)}</span><b class="${s.status === "answered" ? "is-in" : ""}">${s.status === "answered" ? "✓ Locked in" : s.status === "hidden" ? "Out" : "Typing…"}</b></div>`).join("");
    return `${head}${card}<div class="obs-hs-answers">${rows}</div><div class="obs-sub">Answers lock in <b class="obs-hs-amber" data-hs-clock></b></div>${timer}`;
  }
  if (ph === "vote") {
    const rows = d.answers.map((a, i) => `<div class="obs-hs-a obs-hs-a--vote"><em>${String.fromCharCode(65 + i)}</em><span>${esc(a.text)}</span></div>`).join("");
    return `${head}${card}<div class="obs-hs-answers">${rows}</div><div class="obs-sub">Vote at <b class="obs-w">${SITE}</b> · <b class="obs-hs-amber" data-hs-clock></b></div>${timer}`;
  }
  if (ph === "reveal") {
    const rows = d.answers.map((a) => `<div class="obs-hs-a obs-hs-a--res${a.winner ? " is-win" : ""}"><span>${esc(a.text)}</span><small>@${esc(a.handle || "")}${a.winner ? " · 👑 winner" : ""}</small><b>${a.pct || 0}%</b><span class="obs-hs-bar"><i style="--f:${(a.pct || 0) / 100}"></i></span></div>`).join("");
    const wins = d.answers.filter((a) => a.winner).map((a) => "@" + esc(a.handle || ""));
    const foot = d.noVotes ? "No votes this time: everyone who answered gets 5 XP" : wins.length > 1 ? `A tie! ${wins.join(" and ")} each win 25 XP` : wins.length ? `${wins[0]} wins 25 XP` : "";
    return `${head}${card}<div class="obs-hs-answers${wide ? "" : " is-tall"}">${rows}</div><div class="obs-sub obs-hs-foot">${foot}</div>`;
  }
  if (ph === "void") return `${head}${card}<div class="obs-sub">Not enough players for this one. The next card is coming up.</div>`;
  if (ph === "over") return `<div class="bt-sv-h"><i></i>Hot Seat</div><div class="obs-hs-card">That's Hot Seat for tonight!</div><div class="obs-sub">Thanks for playing. Want in next time? Check in at <b class="obs-w">${SITE}</b></div>`;
  return `${head}${card}`;
}

function pickerHtml(p: PickState, board: string[]) {
  const picks = p.picker === "wheel" ? p.all.filter((s) => !gone(s.status)) : p.all;
  return p.picker === "wheel"
    ? wheelHtml({ names: board, picks, state: p.shown ? "landed" : "idle", shown: p.shown, motion: true })
    : seanceHtml({ names: board, picks, state: p.shown ? "landed" : "idle", shown: p.shown, motion: true });
}
/** Draws whatever the picker hasn't shown yet (new seats, a replacement), one after another. */
function pump(host: Host, el: HTMLElement) {
  const p = host._hsPick;
  if (!p || p.busy) return;
  const picks = p.picker === "wheel" ? p.all.filter((s) => !gone(s.status)) : p.all;
  if (p.shown >= picks.length) return;
  const box = el.querySelector<HTMLElement>("[data-hs-picker]");
  if (!box) return;
  p.busy = true;
  const target = picks.length;
  const done = () => { p.busy = false; p.shown = target; pump(host, el); };
  p.stop = p.picker === "wheel" ? wheelSpin(box, { picks, from: p.shown, motion: true, onDone: done }) : seanceDraw(box, { picks, from: p.shown, motion: true, onDone: done });
}

function scene(el: HTMLElement, { chatGame, display }: { chatGame?: { runId: string } | null; display?: HsDisplay | null } = {}) {
  const host = el as Host;
  if (host._hsTick) { clearInterval(host._hsTick); host._hsTick = 0; }
  if (!display || display.kind !== "hot-seat") { host._hsPick?.stop(); host._hsPick = null; el.innerHTML = ""; return; }
  const wide = (el.closest("[data-shape]") as HTMLElement | null)?.dataset.shape !== "tall";
  const d = display;
  const drawing = (d.phase === "accept" || d.phase === "waiting" || d.phase === "starting");
  const key = `${chatGame?.runId || ""}:${d.round}`;
  // the picker keeps its own element while the round's pick is on, so a seat tapping I'm in never restarts the draw
  let p = host._hsPick;
  if (!p || p.key !== key || p.picker !== d.picker) { p?.stop(); p = host._hsPick = { key, picker: d.picker === "wheel" ? "wheel" : "seance", all: [], shown: 0, busy: false, stop: () => {} }; }
  const before = p.all.length;
  p.all = mergeSeats(p.all, d.seats);
  const shell = el.querySelector<HTMLElement>(".obs-hs");
  const sameShell = !!shell && shell.dataset.key === key && shell.dataset.mode === (drawing ? "pick" : "panel") && shell.dataset.picker === p.picker;
  if (!sameShell) {
    const pickerBox = drawing ? `<div class="obs-hs-board${p.picker === "wheel" ? " is-wheel" : ""}" data-hs-picker>${pickerHtml(p, d.board)}</div>` : "";
    el.innerHTML = `<div class="obs-view obs-cg obs-hs ${wide ? "is-wide" : "is-tall"}" data-key="${key}" data-mode="${drawing ? "pick" : "panel"}" data-picker="${p.picker}">${pickerBox}<div class="bt-sv-panel obs-on obs-stack obs-hs-panel${drawing ? "" : " is-full"}" data-hs-panel>${panelHtml(d, wide)}</div></div>`;
  } else {
    el.querySelector<HTMLElement>("[data-hs-panel]")!.innerHTML = panelHtml(d, wide);
    // a seat that's new to the board (a replacement drawn from outside it) needs the board redrawn with the shown picks lit
    const box = el.querySelector<HTMLElement>("[data-hs-picker]");
    const missing = p.all.some((s) => box && !box.querySelector(`[data-h="${CSS.escape(s.handle)}"]`));
    if (box && missing && !p.busy) box.innerHTML = pickerHtml(p, [...d.board, ...p.all.map((s) => s.handle)]);
    else if (box && p.all.length !== before && !p.busy) box.querySelectorAll<HTMLElement>(".bt-seance-name").forEach((n) => { const s = p!.all.find((x) => x.handle === n.dataset.h); if (s && gone(s.status)) { n.classList.add("is-gone"); n.classList.remove("is-hit"); } });
  }
  if (drawing) pump(host, el);
  // the countdown bar and clock
  const close = d.closesAt || 0;
  if (!close || d.paused) return;
  if (host._hsClose !== close) { host._hsClose = close; host._hsTotal = Math.max(10000, close - Date.now()); }
  const tick = () => {
    const left = Math.max(0, close - Date.now());
    const bar = el.querySelector<HTMLElement>("[data-cg-timer] i");
    if (bar) bar.style.width = `${Math.round((left / (host._hsTotal || 1)) * 100)}%`;
    el.querySelectorAll<HTMLElement>("[data-hs-clock]").forEach((x) => { x.textContent = fmt(left); });
    const txt = el.querySelector<HTMLElement>("[data-hs-left]");
    if (txt) txt.textContent = d.phase === "accept" ? `${Math.ceil(left / 1000)} s to tap I'm in` : d.phase === "waiting" ? `Picking in ${Math.ceil(left / 1000)} s` : "";
  };
  tick();
  host._hsTick = window.setInterval(() => { if (!el.isConnected) { clearInterval(host._hsTick); return; } tick(); }, 500);
}

registerFormat("hot-seat", { scene });
export {};
