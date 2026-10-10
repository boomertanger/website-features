// Questions in Chat Games (docs/specs/chat-games.md §4, §14; part 2; mockup control-room-batch-4.html): what shared/ui/chatgames.js mounts for formatId
// "questions", plus the Ask dialog and /live/control's run panel. Registered with registerFormat (the stream view scene is cg-questions-scene.ts).
//   launch   the launch dialog: how many questions are waiting, the session length as .bt-chip options (5, 10, 15 minutes or open-ended; 10 by default),
//            Start (or Swap when another game is on stream)
//   play     the Play panel on /live: the card on stream (.bt-qcard--big, votable), "Next up", the timer, Ask a question and All questions
//   openAsk  the Ask dialog (200 characters; held for a mod when the account is new; 3 open at most)
//   runPanelHtml / wireRunPanel   /live/control: the card on stream with Answered, Skip and End session; Up next with Pin next; Next question
// Preview (staging, signed out, ?game=questions): the sample session; nothing is saved.
import { registerFormat } from "../../../../shared/ui/chatgames.js";
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { qcardHtml, initQcards } from "../../../../shared/ui/qcard.js";
import { stampHtml } from "../../../../shared/ui/stamp.js";
import { burst } from "../../../../shared/ui/burst.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { getAuthState } from "../../lib/auth";
import { reasonOf, messageFor } from "../../lib/errors";
import { call } from "../../lib/call";
import { toast, mascotHtml, reduced } from "./ui";
import { getRun, watchRun, watchQuestion, laneList, myVotes, setVote, askQuestion, controlRun, waitingCount, qPreview, ago, type QRun, type Question } from "./questions-data";
import "./cg-questions-scene";

const signedIn = () => !!getAuthState().user;
const isMember = () => { const s = getAuthState(); return (s.status === "verified" || s.status === "unverified") && !!s.profile; };
const preview = () => qPreview(signedIn());
const previewMember = () => preview() && new URLSearchParams(location.search).get("as") !== "visitor";
const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

// ---------- the Ask dialog ----------
export function openAsk({ onDone }: { onDone?: () => void } = {}) {
  if (!isMember() && !previewMember()) { document.querySelector<HTMLElement>('[data-signin="join"]')?.click(); return; }
  const m = openModal({
    title: "Ask a question", feature: "chat-games",
    content: modalHeader("Ask a question", "The top ones get answered on stream")
      + `<form class="lq-ask" novalidate data-ask><div class="bt-field"><label class="bt-label" for="lq-ask-t">Your question</label>`
      + `<textarea class="bt-textarea" id="lq-ask-t" maxlength="200" rows="3" placeholder="Keep it short. No links."></textarea>`
      + `<div class="lq-ask-row"><span class="bt-hint">While the stream is live it goes to Tonight; otherwise to Standing. You can have 3 open.</span><span class="lq-count" data-count>0 / 200</span></div></div>`
      + `<p class="bt-notice bt-notice--error" data-err hidden></p>`
      + `<div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="submit" class="bt-btn bt-btn--primary" data-post>Post question</button></div></form>`,
  });
  const form = m.modal.querySelector<HTMLFormElement>("[data-ask]")!, ta = form.querySelector<HTMLTextAreaElement>("textarea")!, err = form.querySelector<HTMLElement>("[data-err]")!;
  ta.addEventListener("input", () => { form.querySelector<HTMLElement>("[data-count]")!.textContent = `${ta.value.length} / 200`; err.hidden = true; });
  setTimeout(() => ta.focus(), 50);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = ta.value.trim();
    if (!text) { err.textContent = "Write your question first."; err.hidden = false; ta.focus(); return; }
    const btn = form.querySelector<HTMLButtonElement>("[data-post]")!;
    btn.disabled = true; btn.textContent = "Posting…";
    try {
      if (preview()) { m.close(); toast("Preview: your question would go to Tonight."); onDone?.(); return; }
      const r = await askQuestion(text);
      m.close();
      toast(r.status === "held" ? "Thanks! New accounts are checked by a mod first, so yours is held for now." : `Your question is in ${r.status === "tonight" ? "Tonight" : "Standing"}.`, { kind: r.status === "held" ? "info" : "ok" });
      onDone?.();
    } catch (ex) {
      err.innerHTML = reasonOf(ex) === "limit" ? `${esc(messageFor(ex))} <a href="/live/questions#lq-mine">Your questions</a>` : esc(messageFor(ex, "That didn't post. Try again."));
      err.hidden = false; btn.disabled = false; btn.textContent = "Post question";
    }
  });
}

// ---------- the launch dialog ----------
async function launch({ streamId = "", title = "Questions" }: { streamId?: string; title?: string } = {}) {
  let minutes = 10;
  const m = openModal({
    title: "Questions", feature: "chat-games",
    content: modalHeader(esc(title || "Questions"), "Chat Games")
      + `<div class="lq-launch"><p class="lq-waiting" data-waiting>Counting the questions…</p>`
      + `<div class="bt-field"><span class="bt-label" id="lq-len">Session length</span><div class="lq-chips" role="group" aria-labelledby="lq-len">`
      + [[5, "5 min"], [10, "10 min"], [15, "15 min"], [0, "Open-ended"]].map(([v, l]) => `<button type="button" class="bt-chip bt-chip--small" data-min="${v}" aria-pressed="${v === 10}">${l}</button>`).join("")
      + `</div><span class="bt-hint">Tonight's questions go first, by votes, then Standing. When the time is up, the question on screen can finish.</span></div>`
      + `<p class="bt-notice" data-busy hidden></p></div>`
      + `<div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="button" class="bt-btn bt-btn--primary" data-start>Start session</button></div>`,
  });
  const box = m.modal;
  void waitingCount(preview()).then((n) => { const w = box.querySelector("[data-waiting]"); if (w) w.innerHTML = n ? `<b>${n}</b> ${n === 1 ? "question is" : "questions are"} waiting.` : "No questions are waiting yet. The session shows them as they come in."; }, () => {});
  box.addEventListener("click", async (e) => {
    const chip = (e.target as Element).closest<HTMLElement>("[data-min]");
    if (chip) { minutes = Number(chip.dataset.min); box.querySelectorAll<HTMLElement>("[data-min]").forEach((c) => c.setAttribute("aria-pressed", String(c === chip))); return; }
    const go = (e.target as Element).closest<HTMLButtonElement>("[data-start], [data-swap]");
    if (!go) return;
    const swap = go.hasAttribute("data-swap");
    go.disabled = true; go.textContent = swap ? "Swapping…" : "Starting…";
    try {
      if (preview()) { m.close(); toast(`Preview: a ${minutes ? `${minutes}-minute` : "open-ended"} Questions session would start.`); return; }
      await call(swap ? "chatGameSwap" : "chatGameStart", { formatId: "questions", streamId: streamId || undefined, options: { minutes } });
      m.close();
      toast("Questions is on stream");
    } catch (ex) {
      if (reasonOf(ex) === "busy") {
        const b = box.querySelector<HTMLElement>("[data-busy]")!;
        b.textContent = messageFor(ex); b.hidden = false;
        go.outerHTML = `<button type="button" class="bt-btn bt-btn--primary" data-swap>Swap to Questions</button>`;
        return;
      }
      toast(messageFor(ex, "That didn't start. Try again."), { kind: "error" });
      go.disabled = false; go.textContent = swap ? "Swap to Questions" : "Start session";
    }
  });
}

// ---------- the Play panel ----------
function timerHtml(run: QRun) {
  if (run.ending || (run.closesAt && run.closesAt <= Date.now())) return `<span class="bt-live-tag"><i></i>Last question</span>`;
  return run.closesAt ? `<span class="bt-live-tag"><i></i>Questions · <span data-left>${fmt(Math.max(0, run.closesAt - Date.now()))}</span> left</span>` : `<span class="bt-live-tag"><i></i>Questions</span>`;
}
// The session is followed with live listeners (cg-watch.ts, chat-games.md §3): the run doc (the card, Next up, the timer) and the question on stream
// (its vote count). My vote on it is read once per card. Nothing is polled; the countdown ticks locally.
type PlayHost = HTMLElement & { _lq?: number; _lqStop?: () => void; _lqVoted?: (on: boolean) => void; _lqDraw?: () => void };
async function play(el: PlayHost, { chatGame }: { chatGame: { runId: string } }) {
  if (el._lq) { clearInterval(el._lq); el._lq = 0; }
  el._lqStop?.();
  const pv = preview();
  let run: QRun | null = null, q: Question | null = null, qFor = "", qStop: (() => void) | null = null, voted = false;
  const uid = getAuthState().user?.uid || "";
  const draw = () => {
    if (!run || !el.isConnected) return;
    const d = run.display ? { ...run.display, votes: q && q.id === run.display.questionId ? q.votes : run.display.votes } : null;
    const canVote = !!d?.questionId && (isMember() || previewMember());
    const card = d?.text
      ? qcardHtml({ id: d.questionId || "", text: d.text, handle: d.handle || "", votes: d.votes, voted, canVote, state: "onair", here: d.here, big: true })
      : `<div class="bt-empty bt-empty--compact">${mascotHtml()}<span class="bt-empty-title">The next question is on its way</span><span>Ask yours now: the top ones get picked.</span></div>`;
    const ask = isMember() || previewMember()
      ? `<button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-lq-ask>Ask a question</button>`
      : `<button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-signin="join" data-signin-title="Join free to ask and vote">Join free to ask</button>`;
    el.dataset.lqClose = String(run.ending ? 0 : run.closesAt || 0);
    el.innerHTML = `<div class="lq-play"><div class="lq-play-top">${timerHtml(run)}</div>${card}`
      + `${d?.next ? `<p class="lq-next"><span>Next up</span> ${esc(d.next.text)} <b>▲ ${d.next.votes}</b></p>` : ""}`
      + `<div class="lq-play-acts">${ask}<a class="bt-btn bt-btn--ghost bt-btn--sm" href="/live/questions">All questions</a></div></div>`;
  };
  el._lqVoted = (on) => { voted = on; };
  el._lqDraw = draw;
  if (!(el as any)._lqWired) {   // wired once per element; they reach the current mount through el._lqVoted / el._lqDraw
    (el as any)._lqWired = true;
    initQcards(el as unknown as Document, { onVote: (id, on, btn) => void vote(id, on, btn).then((ok) => { if (ok) el._lqVoted?.(on); }) });
    el.addEventListener("click", (e) => { if ((e.target as Element).closest("[data-lq-ask]")) openAsk({ onDone: () => el._lqDraw?.() }); });
  }
  const runStop = watchRun(chatGame.runId, pv, (r) => {
    run = r;
    const cur = r?.display?.questionId || "";
    if (cur !== qFor) {
      qStop?.(); qStop = null; qFor = cur; q = null; voted = false;
      if (cur) {
        qStop = watchQuestion(cur, pv, (x) => { q = x; draw(); });
        if (uid || pv) void myVotes(uid || "me", [cur], pv).then((s) => { if (qFor === cur) { voted = s.has(cur); draw(); } }, () => {});
      }
    }
    draw();
  });
  el._lqStop = () => { runStop(); qStop?.(); };
  // the countdown only (no reads)
  el._lq = window.setInterval(() => {
    if (!el.isConnected) { clearInterval(el._lq); el._lqStop?.(); return; }
    const left = el.querySelector<HTMLElement>("[data-left]"), close = Number(el.dataset.lqClose || 0);
    if (left && close) left.textContent = fmt(Math.max(0, close - Date.now()));
  }, 1000);
}
/** A vote from any card (the button already flipped). Resolves true when it counted. */
export async function vote(id: string, on: boolean, btn?: HTMLElement): Promise<boolean> {
  const uid = getAuthState().user?.uid;
  try {
    if (!uid && !previewMember()) throw new Error("signedOut");
    await setVote(id, uid || "me", on, preview());
    return true;
  } catch (ex) {
    if (btn) { btn.setAttribute("aria-pressed", String(!on)); const n = btn.querySelector("b"); if (n) n.textContent = String(Math.max(0, (Number(n.textContent) || 0) + (on ? -1 : 1))); }
    toast(String((ex as Error)?.message) === "signedOut" ? "Join free to vote on questions." : "That vote didn't count: you can't vote on your own question, or it just closed.", { kind: "info" });
    return false;
  }
}

// ---------- /live/control: the run panel ----------
export interface RunPanelData { run: QRun; upNext: Question[]; current: Question | null }
export async function loadRunPanel(runId: string, pv: boolean): Promise<RunPanelData | null> {
  const run = await getRun(runId, pv);
  if (!run) return null;
  const [t, s] = await Promise.all([laneList("tonight", "top", pv), laneList("standing", "top", pv)]);
  const all = [...t, ...s];
  const current = all.find((x) => x.id === run.current) || null;
  const skip = new Set(run.skipped);
  const up = all.filter((x) => x.id !== run.current && !skip.has(x.id));
  const pinned = up.find((x) => x.id === run.pinned);
  return { run, current, upNext: pinned ? [pinned, ...up.filter((x) => x !== pinned)].slice(0, 5) : up.slice(0, 5) };
}
export function runPanelHtml(p: RunPanelData, may: boolean) {
  const { run } = p, d = run.display;
  const left = run.closesAt ? Math.max(0, run.closesAt - Date.now()) : null;
  const head = run.ending || left === 0 ? `<b class="lq-run-last">Last question: Answered or Skip ends the session</b>` : left != null ? `<span class="lq-run-timer">${fmt(left)} left</span>` : `<span class="lq-run-timer">Open-ended</span>`;
  const card = d?.text
    ? qcardHtml({ id: d.questionId || "", text: d.text, handle: d.handle || "", votes: d.votes, canVote: false, state: "onair", here: d.here, big: true, ago: p.current ? ago(p.current.createdAt) : "" })
    : `<div class="bt-empty bt-empty--compact">${mascotHtml()}<span class="bt-empty-title">No question on screen</span><span>${p.upNext.length ? "Bring up the next one." : "The queue is empty. They show up here as members ask."}</span></div>`;
  const acts = !may ? "" : d?.text
    ? `<div class="lq-run-acts"><button type="button" class="bt-btn bt-btn--primary" data-qrun="answered">Answered</button><button type="button" class="bt-btn bt-btn--secondary" data-qrun="skip">Skip</button><span class="lq-sp"></span><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-qrun="end">End session</button></div>`
    : `<div class="lq-run-acts">${p.upNext.length ? `<button type="button" class="bt-btn bt-btn--primary" data-qrun="nextRound">Next question</button>` : ""}<span class="lq-sp"></span><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-qrun="end">End session</button></div>`;
  const up = p.upNext.length
    ? `<ol class="lq-upnext">${p.upNext.map((x) => `<li><span class="lq-up-v">▲ ${x.votes}</span><span class="lq-up-t">${esc(x.text)}</span>${x.id === run.pinned ? `<span class="bt-badge bt-badge--gold">Pinned next</span>` : may ? `<button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-qpin="${esc(x.id)}">Pin next</button>` : ""}</li>`).join("")}</ol>`
    : `<p class="lq-note">Nothing else waiting yet.</p>`;
  return `<div class="lq-run" data-qrun-box><div class="lq-run-head"><span class="bt-live-tag"><i></i>Questions on stream</span>${head}</div>${card}<div data-qstamp class="lq-stamp"></div>${acts}<h3 class="bt-label lq-up-h">Up next</h3>${up}</div>`;
}
/** Wires the run panel's buttons (once per element). `after` re-reads and redraws. */
export function wireRunPanel(el: HTMLElement, getRunNow: () => QRun | null, after: () => void, pv: boolean) {
  if ((el as any)._lqRun) return;
  (el as any)._lqRun = true;
  el.addEventListener("click", async (e) => {
    const t = e.target as Element;
    const run = getRunNow();
    if (!run) return;
    const b = t.closest<HTMLButtonElement>("[data-qrun], [data-qpin]");
    if (!b) return;
    if (b.dataset.qrun === "end") { void (window as any).btChatGames?.end({ runId: run.id, title: "Questions" }); return; }
    const action = b.dataset.qpin ? "pinNext" : b.dataset.qrun!;
    const data: Record<string, unknown> = b.dataset.qpin ? { questionId: b.dataset.qpin } : run.current ? { questionId: run.current } : {};
    b.disabled = true;
    try {
      if (pv) toast(`Preview: ${action === "pinNext" ? "pinned next" : action}`);
      else await controlRun(run.id, action, data);
      if (action === "answered") {
        const s = el.querySelector<HTMLElement>("[data-qstamp]");
        if (s) { s.innerHTML = stampHtml({ kicker: "Question", label: "Answered", tone: "lime", size: "sm" }); if (!reduced()) burst(s, { n: 18 }); setTimeout(() => { if (s.isConnected) s.innerHTML = ""; }, 2200); }
        toast("Answered: the asker gets 15 XP");
      }
      after();
    } catch (ex) { toast(messageFor(ex, "That didn't work. Try again."), { kind: "error" }); b.disabled = false; }
  });
}

registerFormat("questions", { launch, play });
