// Chat Games' mod tools in the Mod Deck (docs/specs/chat-games.md §2, §9; part 7): one "Chat Games" section for mods on duty (on phones, in the Tools
// tab). Everything follows live listeners (cg-watch.ts), never polling:
//   Questions   the held queue (accounts under 7 days) with Approve, Hide and Merge, and Tonight's top questions with To Standing, Hide and Merge
//               (questionModerate; the server takes Tonight → Standing only from Tonight, so held questions don't get that button)
//   Hot Seat    while answers are in (the answer and vote steps), each player's answer with Hide (chatGameModerate; out of the round, no XP, logged)
//   Predictions Call it for each locked Prediction, then "You called X. Waiting for the Captain." (cg-choices' waiting strip, predictionPropose)
//   nothing     the mascot and "Nothing to do right now"
// mountModTools(el, opts) is called on every Deck render; it only changes what it shows when the run, the waiting list or a listener changes.
// Preview (the Deck's signed-out ?as=…): the sample held and Tonight questions, the sample Hot Seat round (?game=hot-seat), ?waiting=1; nothing is saved.
import { qcardHtml } from "../../../../shared/ui/qcard.js";
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { confirmAction } from "../../../../shared/ui/confirm.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { messageFor } from "../../lib/errors";
import { toast, mascotHtml } from "./ui";
import { watchQuery } from "./cg-watch";
import { fromDoc, laneList, heldList, moderateQuestion, ago, type Question } from "./questions-data";
import { watchHsPanel, type HsPanelData } from "./cg-hotseat";
import { hsHide } from "./hotseat-data";
import { mountWaiting } from "./cg-choices";
import type { WaitingItem } from "./choices-sample";

export interface ModToolsOpts { chatGame: { runId: string; formatId: string; state: string; title: string | null } | null; waiting: WaitingItem[]; preview: boolean }
interface St { held: Question[]; tonight: Question[]; hs: HsPanelData | null; hsFor: string; stops: (() => void)[]; hsStop: (() => void) | null; waitEl: HTMLElement; qEl: HTMLElement; hsEl: HTMLElement; emptyEl: HTMLElement; waitKey: string; opts: ModToolsOpts }
type Host = HTMLElement & { _mt?: St };

const tools = (x: Question) => `${x.status === "held" ? `<button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-mt="approve" data-id="${esc(x.id)}">Approve</button>` : ""}`
  + `${x.status === "tonight" ? `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-mt="toStanding" data-id="${esc(x.id)}">To Standing</button>` : ""}`
  + `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-mt="hide" data-id="${esc(x.id)}">Hide</button>`
  + `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-mt="merge" data-id="${esc(x.id)}">Merge</button>`;
const card = (x: Question) => qcardHtml({ id: x.id, text: x.text, handle: x.handle, ago: ago(x.createdAt), votes: x.votes, canVote: false, state: x.status, toolsHtml: tools(x) });

function paintQuestions(st: St) {
  const held = st.held, top = [...st.tonight].sort((a, b) => b.votes - a.votes || a.createdAt - b.createdAt).slice(0, 6);
  st.qEl.innerHTML = (held.length ? `<div class="md-cg-group"><h4 class="md-cg-h">Held for a mod <span class="bt-badge bt-badge--teal">${held.length}</span></h4><div class="bt-qcard-list">${held.map(card).join("")}</div></div>` : "")
    + (top.length ? `<div class="md-cg-group"><h4 class="md-cg-h">Tonight's top questions</h4><div class="bt-qcard-list">${top.map(card).join("")}</div></div>` : "");
}
function paintHotSeat(st: St) {
  const p = st.hs;
  if (!p || !["answer", "vote"].includes(p.run.phase) || !p.round) { st.hsEl.innerHTML = ""; return; }
  const rows = (p.round.seats || []).filter((s) => s.status !== "replaced").map((s) => {
    const a = p.staff.answers[s.uid], hid = p.staff.hidden[s.uid];
    return `<div class="md-cg-ans${hid ? " is-hidden" : ""}"><b>@${esc(s.handle)}</b><p>${a ? esc(a.text) : `<i>${s.status === "out" ? "No answer: out of the round" : "Typing…"}</i>`}</p>`
      + (hid ? `<small>Hidden by @${esc(hid.byHandle || "a mod")}</small>` : a ? `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-mt-hide="${esc(s.uid)}" data-handle="${esc(s.handle)}">Hide</button>` : "") + `</div>`;
  }).join("");
  st.hsEl.innerHTML = `<div class="md-cg-group"><h4 class="md-cg-h">Hot Seat answers <span class="bt-badge bt-badge--gold">${p.run.phase === "vote" ? "Voting" : "Answering"}</span></h4><p class="md-hint">Hide an answer that breaks the house rules before the reveal: that player is out of the round, with no XP. Logged.</p>${rows}</div>`;
}
function paintEmpty(st: St) {
  const any = !!(st.qEl.innerHTML || st.hsEl.innerHTML || st.waitEl.querySelector(".lcg-wait"));
  st.emptyEl.innerHTML = any ? "" : `<div class="md-empty md-empty--sm"><span class="md-empty-m" aria-hidden="true">${mascotHtml()}</span><b>Nothing to do right now</b><p>Held questions, Hot Seat answers and Predictions to call show up here.</p></div>`;
}

async function openMerge(st: St, srcId: string) {
  let targets: Question[] = st.tonight.filter((x) => x.id !== srcId);
  try { targets = [...targets, ...(await laneList("standing", "top", st.opts.preview)).filter((x) => x.id !== srcId)]; } catch { /* Tonight only */ }
  const m = openModal({
    title: "Merge into…", feature: "chat-games",
    content: modalHeader("Merge into…", "The duplicate's votes fold into the one you pick, each voter once")
      + (targets.length ? `<div class="lq-merge-list">${targets.slice(0, 20).map((x) => `<button type="button" class="lq-merge-pick" data-target="${esc(x.id)}"><b>▲ ${x.votes}</b><span>${esc(x.text)}</span></button>`).join("")}</div>` : `<p class="bt-section-text">Nothing to merge into yet.</p>`)
      + `<div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button></div>`,
  });
  m.modal.addEventListener("click", async (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>("[data-target]");
    if (!b) return;
    m.close();
    const ok = await confirmAction({ title: "Merge these questions?", message: "The duplicate is marked merged and its asker sees that. It can't be undone.", confirmLabel: "Merge", danger: false, feature: "chat-games",
      onConfirm: async () => { if (!st.opts.preview) await moderateQuestion(srcId, "merge", b.dataset.target!); } });
    if (ok) toast(st.opts.preview ? "Preview: merged" : "Merged");
  });
}

export function mountModTools(el: HTMLElement, opts: ModToolsOpts) {
  const host = el as Host;
  let st = host._mt;
  if (!st) {
    host.innerHTML = `<div data-mt-q></div><div data-mt-hs></div><div data-mt-wait></div><div data-mt-empty></div>`;
    st = host._mt = { held: [], tonight: [], hs: null, hsFor: "", stops: [], hsStop: null, waitEl: host.querySelector("[data-mt-wait]")!, qEl: host.querySelector("[data-mt-q]")!, hsEl: host.querySelector("[data-mt-hs]")!, emptyEl: host.querySelector("[data-mt-empty]")!, waitKey: "", opts };
    const s = st;
    if (opts.preview) {
      void heldList(true).then((h) => { s.held = h; paintQuestions(s); paintEmpty(s); });
      void laneList("tonight", "top", true).then((t) => { s.tonight = t; paintQuestions(s); paintEmpty(s); });
    } else {
      const base = ["chatGames", "main", "questions"];
      s.stops.push(watchQuery(base, [["status", "==", "held"]], (docs) => { s.held = docs.map((d) => fromDoc(d.id, d)).sort((a, b) => a.createdAt - b.createdAt); paintQuestions(s); paintEmpty(s); }));
      s.stops.push(watchQuery(base, [["status", "==", "tonight"]], (docs) => { s.tonight = docs.map((d) => fromDoc(d.id, d)); paintQuestions(s); paintEmpty(s); }));
    }
    host.addEventListener("click", async (e) => {
      const t = e.target as Element;
      const hide = t.closest<HTMLButtonElement>("[data-mt-hide]");
      if (hide && s.hs) {
        hide.disabled = true;
        try { if (!s.opts.preview) await hsHide(s.hs.run.id, hide.dataset.mtHide!); toast(`${s.opts.preview ? "Preview: " : ""}@${hide.dataset.handle}'s answer is hidden. They're out of this round.`); }
        catch (ex) { toast(messageFor(ex, "That didn't hide. Try again."), { kind: "error" }); hide.disabled = false; }
        return;
      }
      const b = t.closest<HTMLButtonElement>("[data-mt]");
      if (!b) return;
      const action = b.dataset.mt as "approve" | "hide" | "toStanding" | "merge", id = b.dataset.id!;
      if (action === "merge") { void openMerge(s, id); return; }
      b.disabled = true;
      try {
        if (!s.opts.preview) await moderateQuestion(id, action);
        toast(`${s.opts.preview ? "Preview: " : ""}${action === "approve" ? "Approved" : action === "hide" ? "Hidden" : "Moved to Standing"}`);
      } catch (ex) { toast(messageFor(ex, "That didn't work. Try again."), { kind: "error" }); b.disabled = false; }
    });
  }
  st.opts = opts;
  // Hot Seat: follow the run while one is on
  const hsRun = opts.chatGame && opts.chatGame.formatId === "hot-seat" ? opts.chatGame.runId : "";
  if (hsRun !== st.hsFor) {
    st.hsStop?.(); st.hsStop = null; st.hsFor = hsRun; st.hs = null; st.hsEl.innerHTML = "";
    const s = st;
    if (hsRun) st.hsStop = watchHsPanel(hsRun, opts.preview, (p) => { s.hs = p; paintHotSeat(s); paintEmpty(s); });
  }
  // Predictions to call: the waiting list, plus one that locked itself while keeping the slot (3 already waiting)
  const list = [...opts.waiting];
  if (opts.chatGame && opts.chatGame.formatId === "predictions" && opts.chatGame.state === "locked" && !list.some((x) => x.runId === opts.chatGame!.runId)) list.push({ runId: opts.chatGame.runId, title: opts.chatGame.title });
  const wk = list.map((x) => x.runId).join();
  if (wk !== st.waitKey) { st.waitKey = wk; mountWaiting(st.waitEl, { waiting: list }); }
  paintEmpty(st);
}

/** Stops every listener (the Deck left the live phase). */
export function stopModTools(el: HTMLElement) {
  const st = (el as Host)._mt;
  if (!st) return;
  st.stops.forEach((s) => s()); st.hsStop?.();
  delete (el as Host)._mt;
}
