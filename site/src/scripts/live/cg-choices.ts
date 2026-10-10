// Would You Rather and Predictions in Chat Games (docs/specs/chat-games.md §6, §7, §14; part 5; mockup chat-games-batch-1.html "Would You Rather",
// "Predictions", "Start a game"): what shared/ui/chatgames.js mounts for formatIds "would-you-rather" and "predictions", the waiting strip, and
// /live/control's run panels. Registered with registerFormat (the stream view scenes are cg-choices-scene.ts). Runs are followed with live listeners
// (choices-data.ts → cg-watch.ts), never polled; countdowns tick locally.
//   launch   "From a pack" / "Type my own" (.bt-pills), the pack and its next card with Skip card, or the typed prompt with character counters
//            (Predictions: 2 to 4 answers, add and remove); Would You Rather's voting time as .bt-chip (30, 45, 60 s); a Swap warning when a game runs
//   play     the choices (.bt-choice), the timer, the reveal with +3 XP and a burst (Would You Rather); the auto-lock countdown, the locked state with
//            the +3 XP badge, the result ("You called it" +10 and a burst, or "Not this time"), void (Predictions); the clocked-in note; the cap
//   mountWaiting(el, { waiting })   the "Waiting on" strip for locked Predictions, under any game; for mods on duty, "Call it" then "You called X"
//   watchChoicePanel / choicePanelHtml / wireChoicePanel   /live/control: step chips, the prompt card ("Typed live"), live counts with the split
//            hidden, the controls, Save to pack; Predictions: Lock now, "Or settle it yourself", the teal proposal card, Correct the result, Void
//   waitingPanelHtml / wireWaitingPanel   /live/control: the locked Predictions, each openable to settle (a dialog)
import { registerFormat } from "../../../../shared/ui/chatgames.js";
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { confirmAction } from "../../../../shared/ui/confirm.js";
import { choicesHtml } from "../../../../shared/ui/choice.js";
import { burst } from "../../../../shared/ui/burst.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { getAuthState } from "../../lib/auth";
import { db, doc, getDoc, SITE_ID } from "../../lib/db";
import { reasonOf, messageFor } from "../../lib/errors";
import { call } from "../../lib/call";
import { toast, mascotHtml, reduced } from "./ui";
import { launchPacks, pickCard, type HsPack } from "./hotseat-data";
import { WYR_ID, PRED_ID, choicePreview, anyPreview, watchCRun, watchCStaff, getMyChoice, onDuty, choose, cControl, propose, settle, type CRun, type CPlay, type CStaff } from "./choices-data";
import type { WyrDisplay, PredDisplay, WaitingItem } from "./choices-sample";
import "./cg-choices-scene";

const signedIn = () => !!getAuthState().user;
const isMember = () => { const s = getAuthState(); return (s.status === "verified" || s.status === "unverified") && !!s.profile; };
const pvOf = (formatId?: string) => choicePreview(signedIn(), formatId);
const previewMember = () => pvOf() && new URLSearchParams(location.search).get("as") !== "visitor";
const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
const NAME: Record<string, string> = { [WYR_ID]: "Would You Rather", [PRED_ID]: "Predictions" };
const CLOCK = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
const xpBadge = (p: { xp: number; capped: boolean; crew: boolean } | undefined, label: string) => !p ? "" : p.crew ? `<span class="bt-badge bt-badge--gray">On duty: no XP</span>`
  : p.xp > 0 ? `<span class="bt-badge bt-badge--gold">+${p.xp} XP${p.capped ? " (cap)" : ""}</span>` : p.capped ? `<span class="bt-badge bt-badge--gray">Tonight's XP is maxed</span>` : `<span class="bt-badge bt-badge--gray">${esc(label)}</span>`;

/** The game on stream now (for the launch dialog's Swap warning). */
async function runningGame(): Promise<{ formatId: string; title: string | null } | null> {
  if (anyPreview(signedIn())) {
    const g = new URLSearchParams(location.search).get("game");
    const t: Record<string, string> = { questions: "Questions", "hot-seat": "Hot Seat", wyr: NAME[WYR_ID], predictions: NAME[PRED_ID] };
    return g && t[g] ? { formatId: g, title: t[g] } : null;
  }
  try { const d: any = (await getDoc(doc(db, "sites", SITE_ID, "public", "live"))).data(); return d?.chatGame || null; } catch { return null; }
}

// ---------- the launch dialog ----------
async function launch({ formatId = WYR_ID, streamId = "", title = "" }: { formatId?: string; streamId?: string; title?: string } = {}) {
  const wyr = formatId === WYR_ID, name = title || NAME[formatId];
  const pv = anyPreview(signedIn());
  let src = wyr ? "pack" : "typed", seconds = 45, packs: HsPack[] = [], pack: HsPack | null = null, card: HsPack["cards"][number] | null = null;
  const skipped: string[] = [];
  const typed = wyr
    ? `<div class="bt-field"><label class="bt-label" for="lcg-lead">Lead line</label><input class="bt-input" id="lcg-lead" maxlength="80" value="Would you rather…" data-cnt="lead"><span class="bt-hint"><span data-n="lead">17</span> / 80</span></div>`
      + `<div class="lcg-two"><div class="bt-field"><label class="bt-label" for="lcg-a">Option A</label><input class="bt-input" id="lcg-a" maxlength="80" data-cnt="a" data-opt><span class="bt-hint"><span data-n="a">0</span> / 80</span></div>`
      + `<div class="bt-field"><label class="bt-label" for="lcg-b">Option B</label><input class="bt-input" id="lcg-b" maxlength="80" data-cnt="b" data-opt><span class="bt-hint"><span data-n="b">0</span> / 80</span></div></div>`
    : `<div class="bt-field"><label class="bt-label" for="lcg-q">Question</label><input class="bt-input" id="lcg-q" maxlength="120" placeholder="Does he make it past the chainsaw guy?" data-cnt="q"><span class="bt-hint"><span data-n="q">0</span> / 120</span></div>`
      + `<div class="bt-field"><span class="bt-label" id="lcg-ans">Answers (2 to 4)</span><div class="lcg-answers" data-answers role="group" aria-labelledby="lcg-ans">${["Yes", "No"].map((v) => ansRow(v)).join("")}</div>`
      + `<div class="lcg-acts"><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-add>+ Add an answer</button></div></div>`;
  const m = openModal({
    title: name, feature: "chat-games",
    content: modalHeader(esc(name), wyr ? "Two options, the split on stream" : "Call what happens next; a mod calls the result")
      + `<div class="lcg-launch"><p class="lcg-warn" data-swapnote hidden></p>`
      + `<div class="bt-pills" role="group" aria-label="Where the prompt comes from"><button type="button" data-src="pack" class="${src === "pack" ? "is-on" : ""}" aria-pressed="${src === "pack"}">From a pack</button><button type="button" data-src="typed" class="${src === "typed" ? "is-on" : ""}" aria-pressed="${src === "typed"}">Type my own</button></div>`
      + `<div data-pane="pack"${src === "pack" ? "" : " hidden"}><div class="bt-field"><label class="bt-label" for="lcg-pack">Pack</label><select class="bt-select" id="lcg-pack" data-pack disabled><option>Loading packs…</option></select><span class="bt-hint" data-tag></span></div>`
      + `<div class="lcg-card"><span class="bt-label">Next card</span><p data-card>…</p><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-skip disabled>Skip card</button></div></div>`
      + `<div data-pane="typed"${src === "typed" ? "" : " hidden"}>${typed}</div>`
      + (wyr ? `<div class="bt-field"><span class="bt-label" id="lcg-time">Voting time</span><div class="lcg-chips" role="group" aria-labelledby="lcg-time">${[30, 45, 60].map((s) => `<button type="button" class="bt-chip bt-chip--small" data-sec="${s}" aria-pressed="${s === 45}">${s} s</button>`).join("")}</div></div>`
        : `<p class="lcg-note">Stays open until you tap Lock, 3 minutes at most. A mod on duty calls the result; you confirm.</p>`)
      + `<p class="bt-notice bt-notice--error" data-err hidden></p></div>`
      + `<div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="button" class="bt-btn bt-btn--primary" data-start>Start ${esc(name)}</button></div>`,
  });
  const box = m.modal, err = box.querySelector<HTMLElement>("[data-err]")!, sel = box.querySelector<HTMLSelectElement>("[data-pack]")!;
  let swap = false;
  void runningGame().then((g) => {
    if (!g || !box.isConnected) return;
    swap = true;
    const note = box.querySelector<HTMLElement>("[data-swapnote]")!;
    note.innerHTML = `<b>${esc(g.title || "A game")} is running.</b> Swap ends it (no XP for an unfinished round) and starts ${esc(name)}.`;
    note.hidden = false;
    box.querySelector<HTMLElement>("[data-start]")!.textContent = `Swap to ${name}`;
  });
  const showCard = () => {
    card = pack ? pickCard(pack, skipped) || null : null;
    const c = box.querySelector<HTMLElement>("[data-card]")!;
    c.innerHTML = card ? `${esc(card.text)}${card.options?.length ? `<br><small>${card.options.map(esc).join(" · ")}</small>` : ""}` : "This pack has no cards yet.";
    box.querySelector<HTMLButtonElement>("[data-skip]")!.disabled = !pack || pack.cards.length < 2;
  };
  void launchPacks(streamId, pv, formatId).then((r) => {
    packs = r.packs;
    if (!packs.length) { sel.innerHTML = `<option>No approved packs yet</option>`; box.querySelector("[data-card]")!.textContent = "Type your own, or add a pack in Games."; return; }
    sel.innerHTML = packs.map((p) => `<option value="${esc(p.id)}"${p.id === r.defaultId ? " selected" : ""}>${esc(p.title)} (${p.cards.length})</option>`).join("");
    sel.disabled = false;
    pack = packs.find((p) => p.id === r.defaultId) || packs[0];
    box.querySelector("[data-tag]")!.textContent = r.tagged ? "Tagged to a game planned tonight." : "";
    showCard();
  }, () => { box.querySelector("[data-card]")!.textContent = "The packs didn't load. Type your own."; });
  sel.addEventListener("change", () => { pack = packs.find((p) => p.id === sel.value) || null; skipped.length = 0; showCard(); });
  const syncAns = () => {
    const a = box.querySelector<HTMLElement>("[data-answers]");
    if (!a) return;
    a.querySelectorAll<HTMLButtonElement>("[data-rm]").forEach((b) => { b.disabled = a.children.length <= 2; });
    box.querySelector<HTMLButtonElement>("[data-add]")!.disabled = a.children.length >= 4;
  };
  syncAns();
  box.addEventListener("input", (e) => {
    const i = (e.target as Element).closest<HTMLInputElement>("[data-cnt]");
    if (i) { const n = box.querySelector(`[data-n="${i.dataset.cnt}"]`); if (n) n.textContent = String(i.value.length); }
    const a = (e.target as Element).closest<HTMLInputElement>("[data-ans]");
    if (a) a.parentElement!.querySelector("small")!.textContent = `${a.value.length} / 40`;
    err.hidden = true;
  });
  box.addEventListener("click", async (e) => {
    const t = e.target as Element;
    const s = t.closest<HTMLElement>("[data-src]");
    if (s) { src = s.dataset.src!; box.querySelectorAll<HTMLElement>("[data-src]").forEach((b) => { b.classList.toggle("is-on", b === s); b.setAttribute("aria-pressed", String(b === s)); }); box.querySelectorAll<HTMLElement>("[data-pane]").forEach((p) => { p.hidden = p.dataset.pane !== src; }); return; }
    const c = t.closest<HTMLElement>("[data-sec]");
    if (c) { seconds = Number(c.dataset.sec); box.querySelectorAll<HTMLElement>("[data-sec]").forEach((x) => x.setAttribute("aria-pressed", String(x === c))); return; }
    if (t.closest("[data-skip]")) { if (card) skipped.push(card.id); if (pack && skipped.length >= pack.cards.length) skipped.length = 0; showCard(); return; }
    if (t.closest("[data-add]")) { const a = box.querySelector<HTMLElement>("[data-answers]")!; if (a.children.length < 4) { a.insertAdjacentHTML("beforeend", ansRow("")); syncAns(); a.querySelector<HTMLInputElement>(".lcg-ans:last-child input")?.focus(); } return; }
    const rm = t.closest<HTMLButtonElement>("[data-rm]");
    if (rm) { const a = box.querySelector<HTMLElement>("[data-answers]")!; if (a.children.length > 2) { rm.closest(".lcg-ans")!.remove(); syncAns(); } return; }
    const go = t.closest<HTMLButtonElement>("[data-start]");
    if (!go) return;
    let options: Record<string, unknown>;
    if (src === "pack") {
      if (!pack || !card) { err.textContent = "Pick a pack with cards, or type your own."; err.hidden = false; return; }
      options = { source: "pack", packId: pack.id, cardId: card.id };
    } else if (wyr) {
      const opts = [...box.querySelectorAll<HTMLInputElement>("[data-opt]")].map((i) => i.value.trim());
      if (opts.some((o) => !o)) { err.textContent = "Write both options."; err.hidden = false; return; }
      options = { source: "typed", prompt: { text: box.querySelector<HTMLInputElement>("#lcg-lead")!.value.trim(), options: opts } };
    } else {
      const text = box.querySelector<HTMLInputElement>("#lcg-q")!.value.trim();
      const opts = [...box.querySelectorAll<HTMLInputElement>("[data-ans]")].map((i) => i.value.trim()).filter(Boolean);
      if (!text) { err.textContent = "Write the question."; err.hidden = false; return; }
      if (opts.length < 2) { err.textContent = "Give at least two answers."; err.hidden = false; return; }
      options = { source: "typed", prompt: { text, options: opts } };
    }
    if (wyr) options.seconds = seconds;
    const label = go.textContent;
    go.disabled = true; go.textContent = swap ? "Swapping…" : "Starting…";
    try {
      if (pv) { m.close(); toast(`Preview: ${name} would start${swap ? " (Swap)" : ""}.`); return; }
      await call(swap ? "chatGameSwap" : "chatGameStart", { formatId, streamId: streamId || undefined, options });
      m.close();
      toast(`${name} is on stream`);
    } catch (ex) {
      if (reasonOf(ex) === "busy") { swap = true; go.textContent = `Swap to ${name}`; go.disabled = false; const n = box.querySelector<HTMLElement>("[data-swapnote]")!; n.textContent = messageFor(ex); n.hidden = false; return; }
      err.textContent = messageFor(ex, "That didn't start. Try again."); err.hidden = false;
      go.disabled = false; go.textContent = label;
    }
  });
}
function ansRow(v: string) {
  return `<div class="lcg-ans"><input class="bt-input" maxlength="40" value="${esc(v)}" placeholder="Another answer" aria-label="Answer" data-ans><small>${v.length} / 40</small><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-rm aria-label="Remove this answer">✕</button></div>`;
}

// ---------- the Play panel ----------
interface PState { run: CRun | null; my: CPlay; duty: boolean; key: string; burst: string; offline: boolean; busy: boolean }
type PHost = HTMLElement & { _cg?: number; _cgStop?: () => void; _cgState?: PState; _cgRead?: () => Promise<void> };

function wyrBody(run: CRun, st: PState, can: boolean) {
  const d = run.display as WyrDisplay | null;
  const rev = run.state === "revealed" && d?.phase === "revealed";
  const opts = d?.options || run.prompt.options;
  const lead = `<p class="lcg-lead">${esc(d?.lead || run.prompt.text)}</p>`;
  if (!rev) {
    const left = run.paused ? `<span class="bt-badge bt-badge--gold">Paused</span>` : run.closesAt ? `<b class="lcg-timer" data-left>${fmt(Math.max(0, run.closesAt - Date.now()))}</b> left · ` : "";
    return `${lead}${choicesHtml({ options: opts, two: true, state: can && !run.paused && !st.busy ? "open" : "locked", pick: st.my.pick ?? null, name: "Would you rather" })}`
      + (run.closesAt && !run.paused ? `<div class="lcg-bar" aria-hidden="true"><i data-bar></i></div>` : "")
      + `<p class="lcg-note lcg-center">${left}${st.my.pick != null ? "You can change your vote until it closes." : "Tap one. 3 XP for voting."} The split shows at the reveal.</p>`;
  }
  const winners = d?.winners || [], total = d?.total || 0, lead1 = winners[0] ?? 0;
  const mine = st.my.pick;
  const res = mine == null ? `<p class="lcg-note">You didn't vote on this one. The next prompt is coming.</p>`
    : `<div class="lcg-xp">${xpBadge(st.my.result, "Voted")}${winners.includes(mine) ? `<span class="bt-badge bt-badge--lime">With the crowd</span>` : `<span class="bt-badge bt-badge--pink">Brave minority</span>`}</div>`;
  return `${lead}${choicesHtml({ options: opts, two: true, state: "revealed", pick: mine ?? null, pct: d?.pct || [0, 0], winners })}`
    + `<div class="lcg-win" data-win><p>${total ? `${winners.length > 1 ? "A dead heat" : `${(d?.pct || [])[lead1] || 0}% chose “${esc(opts[lead1])}”`} · ${total} ${total === 1 ? "vote" : "votes"}` : "Nobody voted on this one."}</p>${res}</div>`;
}
function predBody(run: CRun, st: PState, can: boolean) {
  const d = run.display as PredDisplay | null;
  const opts = d?.options || run.prompt.options;
  const card = `<div class="lcg-prompt"><small>Prediction</small><p>${esc(d?.question || run.prompt.text)}</p></div>`;
  const mine = st.my.pick ?? null;
  if (run.state === "open") {
    return `${card}${choicesHtml({ options: opts, state: can && !st.busy ? "open" : "locked", pick: mine, name: "Your prediction" })}`
      + `<p class="lcg-note lcg-center">Locks when the Captain says${run.closesAt ? `, or in <b class="lcg-timer" data-left>${fmt(Math.max(0, run.closesAt - Date.now()))}</b>` : ""}. Picks stay hidden until then. 3 XP for a pick, +10 if you're right.</p>`;
  }
  if (run.state === "void" || d?.phase === "void") return `${card}${choicesHtml({ options: opts, state: "void", pick: mine })}<p class="lcg-note lcg-center">Void: it didn't happen this stream. No +10.${st.my.lock?.xp ? " You keep the 3 XP for your pick." : ""}</p>`;
  if (run.result) {
    const right = mine != null && mine === run.result.answer;
    const res = mine == null ? `<p>You didn't pick this one.</p>`
      : right ? `<h3 class="lcg-won">You called it</h3><div class="lcg-xp">${xpBadge(st.my.win, "Called it")}<span class="bt-badge bt-badge--lime">${(d?.counts || [])[run.result.answer] || 0} of you got it</span></div>`
      : `<p>Not this time.${st.my.lock && !st.my.lock.crew ? " You still got 3 XP for your pick." : ""}</p>`;
    return `${card}${choicesHtml({ options: opts, state: "result", pick: mine, pct: d?.pct, counts: d?.counts, correct: run.result.answer })}<div class="lcg-win" data-win>${res}${run.corrected ? `<p class="lcg-note">The result was corrected once.</p>` : ""}</div>`;
  }
  return `${card}${choicesHtml({ options: opts, state: "locked", pick: mine, pct: d?.pct, counts: d?.counts })}`
    + `<div class="lcg-wait"><span class="lcg-wait-ic">${CLOCK}</span><div><small>Locked · waiting for what happens</small><b>${mine != null ? `Your pick: ${esc(opts[mine])}` : "You didn't pick this one"}</b></div><span class="lcg-sp"></span>${mine != null ? xpBadge(st.my.lock, "Picked") : ""}</div>`;
}
function renderPlay(el: PHost) {
  const st = el._cgState!, run = st.run;
  if (!run || !el.isConnected) return;
  const member = isMember() || previewMember();
  const can = member && run.state === "open" && !st.offline;
  const wyr = run.formatId === WYR_ID;
  const tag = run.state === "open" ? `<span class="bt-live-tag"><i></i>${NAME[run.formatId]}${wyr && run.round > 1 ? ` · round ${run.round}` : ""}</span>`
    : run.state === "void" ? `<span class="bt-badge bt-badge--gray">Void</span>` : run.result || run.state === "revealed" ? `<span class="bt-badge bt-badge--lime">${wyr ? "Revealed" : "Settled"}</span>` : `<span class="bt-badge bt-badge--gold">Locked</span>`;
  const join = member ? "" : `<div class="lcg-acts lcg-center"><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-signin="join" data-signin-title="Join free to play Chat Games">Join free to ${wyr ? "vote" : "predict"}</button></div>`;
  const duty = st.duty ? `<p class="bt-notice lcg-duty">You're clocked in, so you can play but earn no game XP tonight.</p>` : "";
  el.innerHTML = `<div class="lcg-play"><div class="lcg-top">${tag}${st.offline ? `<span class="bt-badge bt-badge--gray">Reconnecting…</span>` : ""}</div>${duty}${wyr ? wyrBody(run, st, can) : predBody(run, st, can)}${join}</div>`;
  // the celebratory moment: once per reveal or result, for the members it pays (never under reduced motion)
  const key = `${run.id}:${run.round}:${run.state}`;
  const won = wyr ? run.state === "revealed" && st.my.pick != null : !!run.result && st.my.pick === run.result.answer;
  if (won && st.burst !== key) { st.burst = key; const h = el.querySelector<HTMLElement>("[data-win]"); if (h && !reduced()) burst(h, { n: wyr ? 16 : 26 }); }
  paintClock(el, run);
}
function paintClock(el: HTMLElement, run: CRun) {
  if (!run.closesAt || run.paused) return;
  const left = Math.max(0, run.closesAt - Date.now());
  el.querySelectorAll<HTMLElement>("[data-left]").forEach((x) => { x.textContent = fmt(left); });
  const bar = el.querySelector<HTMLElement>("[data-bar]");
  if (bar) bar.style.width = `${Math.min(100, (left / (run.formatId === WYR_ID ? 60000 : 180000)) * 100)}%`;
}
async function play(el: PHost, { chatGame }: { chatGame: { runId: string; formatId: string } }) {
  if (el._cg) { clearInterval(el._cg); el._cg = 0; }
  el._cgStop?.();
  const pv = pvOf(chatGame.formatId);
  const runId = pv ? (chatGame.formatId === WYR_ID ? "preview-wyr" : "preview-pred") : chatGame.runId;
  const st: PState = { run: null, my: {}, duty: false, key: "", burst: "", offline: false, busy: false };
  el._cgState = st;
  const uid = getAuthState().user?.uid || (pv ? "me" : "");
  let seq = 0;
  const mine = async (run: CRun) => { const n = ++seq; const my = uid ? await getMyChoice(run.id, uid, run.round, pv) : {}; if (n === seq) st.my = my; };
  const onRun = async (run: CRun | null) => {
    if (!el.isConnected) { el._cgStop?.(); return; }
    if (!run) return;
    const key = `${run.id}|${run.round}|${run.state}|${run.paused}|${run.display?.phase}|${(run.display as any)?.total ?? ""}|${run.result?.answer ?? ""}|${run.corrected}`;
    const fresh = key !== st.key;
    const first = !st.key;
    st.run = run; st.offline = false; st.key = key;
    if (fresh && uid) { try { await mine(run); if (first) st.duty = await onDuty(run.streamId, uid, pv); } catch { /* keep the last */ } }
    if (fresh) renderPlay(el); else paintClock(el, run);
  };
  el._cgRead = async () => { if (st.run && uid) { try { await mine(st.run); } catch { /* keep */ } } renderPlay(el); };
  if (!(el as any)._cgWired) {
    (el as any)._cgWired = true;
    el.addEventListener("click", async (e) => {
      const b = (e.target as Element).closest<HTMLButtonElement>("[data-choice]");
      const s = el._cgState, run = s?.run;
      if (!b || b.disabled || !s || !run) return;
      const choice = Number(b.dataset.choice);
      if (s.my.pick === choice) return;
      const prev = s.my.pick;
      s.my = { ...s.my, pick: choice }; s.busy = true;
      renderPlay(el);
      try { await choose(run.id, choice, pvOf(run.formatId)); toast(run.formatId === WYR_ID ? (prev == null ? "Vote in" : "Vote changed") : prev == null ? "Pick in" : "Pick changed"); }
      catch (ex) { s.my = { ...s.my, pick: prev }; toast(messageFor(ex, "That didn't count. Try again."), { kind: reasonOf(ex) === "closed" ? "info" : "error" }); }
      finally { s.busy = false; renderPlay(el); }
    });
  }
  el._cgStop = watchCRun(runId, pv, (r) => void onRun(r), () => { st.offline = true; renderPlay(el); });
  el._cg = window.setInterval(() => {
    if (!el.isConnected) { clearInterval(el._cg); el._cgStop?.(); return; }
    if (st.run) paintClock(el, st.run);
  }, 1000);
}

// ---------- the waiting strip (locked Predictions, under any game) and "Call it" ----------
interface WItem { item: WaitingItem; run: CRun | null; my: CPlay; staff: CStaff | null; stops: (() => void)[]; dismissed: boolean }
type WHost = HTMLElement & { _w?: Map<string, WItem>; _wDuty?: boolean | null; _wWired?: boolean };
export function mountWaiting(el: HTMLElement, { waiting = [] as WaitingItem[] } = {}) {
  const host = el as WHost;
  const items = host._w || (host._w = new Map());
  const pv = pvOf(PRED_ID);
  const uid = getAuthState().user?.uid || (pv ? "me" : "");
  const paint = () => {
    if (!el.isConnected) { for (const w of items.values()) w.stops.forEach((s) => s()); return; }
    const rows = [...items.values()].filter((w) => !w.dismissed).map((w) => waitRow(w, !!host._wDuty)).join("");
    el.innerHTML = rows ? `<div class="lcg-waits">${rows}</div>` : "";
  };
  // follow every waiting run (one listener each, at most 3); a run that settles stays until dismissed, with the member's result
  for (const it of waiting) {
    if (items.has(it.runId)) continue;
    const w: WItem = { item: it, run: null, my: {}, staff: null, stops: [], dismissed: false };
    items.set(it.runId, w);
    w.stops.push(watchCRun(it.runId, pv, async (r) => {
      const was = w.run?.state;
      w.run = r;
      if (r && uid && (was !== r.state || !w.my.lock)) { try { w.my = await getMyChoice(r.id, uid, 1, pv); } catch { /* keep */ } }
      if (r && r.result && was === "locked" && w.my.pick === r.result.answer && !reduced()) setTimeout(() => { const h = el.querySelector<HTMLElement>(`[data-wrun="${r.id}"]`); if (h) burst(h, { n: 22 }); }, 60);
      if (r && r.state !== "locked") { w.stops.slice(1).forEach((s) => s()); w.stops.length = 1; }
      paint();
    }));
  }
  if (host._wDuty == null && (uid || pv)) {
    host._wDuty = false;
    const first = waiting[0];
    if (first) void (async () => {
      const r = pv ? { streamId: "preview" } : ((await getDoc(doc(db, "sites", SITE_ID, "chatGames", "main", "runs", first.runId)).catch(() => null))?.data() as any);
      host._wDuty = r ? await onDuty(r.streamId, uid, pv) : false;
      if (host._wDuty) for (const w of items.values()) if (w.stops.length === 1) w.stops.push(watchCStaff(w.item.runId, "p", pv, (s) => { w.staff = s; paint(); }));
      paint();
    })();
  } else if (host._wDuty) for (const w of items.values()) if (w.stops.length === 1 && (!w.run || w.run.state === "locked")) w.stops.push(watchCStaff(w.item.runId, "p", pv, (s) => { w.staff = s; paint(); }));
  // a run that left the list and was never seen settling (it was voided or ended elsewhere) just goes
  for (const [id, w] of items) if (!waiting.some((x) => x.runId === id) && (!w.run || w.run.state === "locked")) { w.stops.forEach((s) => s()); items.delete(id); }
  if (!host._wWired) {
    host._wWired = true;
    el.addEventListener("click", async (e) => {
      const t = e.target as Element;
      const dis = t.closest<HTMLElement>("[data-wdismiss]");
      if (dis) { const w = items.get(dis.dataset.wdismiss!); if (w) { w.dismissed = true; w.stops.forEach((s) => s()); } paint(); return; }
      const c = t.closest<HTMLButtonElement>("[data-callit]");
      if (!c) return;
      const [runId, ans] = c.dataset.callit!.split(":");
      c.disabled = true;
      try { await propose(runId, Number(ans), pvOf(PRED_ID)); toast("Sent to the Captain to confirm."); }
      catch (ex) { toast(messageFor(ex, "That didn't send. Try again."), { kind: "error" }); c.disabled = false; }
    });
  }
  paint();
}
function waitRow(w: WItem, duty: boolean) {
  const r = w.run, opts = r?.prompt.options || [], mine = w.my.pick;
  const title = esc(w.item.title || r?.prompt.text || "A prediction");
  if (r && r.state !== "locked") {
    const right = r.result && mine != null && mine === r.result.answer;
    const line = r.state === "void" ? "Void: no +10." : mine == null ? `Settled: ${esc(opts[r.result?.answer ?? 0] || "")}.` : right ? `You called it: ${esc(opts[mine])}` : `Not this time. It was ${esc(opts[r.result?.answer ?? 0] || "")}.`;
    return `<div class="lcg-wait${right ? " is-won" : ""}" data-wrun="${esc(r.id)}"><span class="lcg-wait-ic">${CLOCK}</span><div><small>${r.state === "void" ? "Prediction void" : "Prediction settled"}</small><b>${title}</b><span class="lcg-wait-line">${line}</span></div><span class="lcg-sp"></span>`
      + `${right ? xpBadge(w.my.win, "Called it") : ""}<button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-wdismiss="${esc(r.id)}" aria-label="Dismiss">✕</button></div>`;
  }
  const strip = `<div class="lcg-wait" data-wrun="${esc(w.item.runId)}"><span class="lcg-wait-ic">${CLOCK}</span><div><small>Waiting on a result</small><b>${title}</b>${mine != null && opts[mine] ? `<span class="lcg-wait-line">Your pick: ${esc(opts[mine])}</span>` : ""}</div><span class="lcg-sp"></span>${mine != null ? xpBadge(w.my.lock, "Picked") : `<span class="bt-badge bt-badge--gold">Locked</span>`}</div>`;
  if (!duty || !r) return strip;
  const p = w.staff?.proposal;
  const call = p
    ? `<div class="lcg-proposal"><p>${p.byHandle === getAuthState().profile?.handle || p.byHandle === "you" ? "You called" : `@${esc(p.byHandle || "a mod")} called`} <b>${esc(opts[p.answer] || "")}</b>. Waiting for the Captain.</p></div>`
    : `<div class="lcg-callit"><p class="lcg-note">When it happens on screen, tap what happened. The Captain confirms before any XP goes out.</p><div class="lcg-settle-row">${opts.map((o, i) => `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-callit="${esc(r.id)}:${i}">${esc(o)}</button>`).join("")}</div></div>`;
  return `<div class="lcg-waitbox">${strip}<div class="lcg-callbox"><span class="lcg-callh">Call it <span class="bt-badge bt-badge--teal">Mods on duty</span></span>${call}</div></div>`;
}

// ---------- /live/control: the run panels ----------
export interface ChoicePanelData { run: CRun; staff: CStaff }
export function watchChoicePanel(runId: string, formatId: string, pv: boolean, onData: (p: ChoicePanelData) => void): () => void {
  const prv = pv ? (formatId === WYR_ID ? "preview-wyr" : "preview-pred") : runId;
  let run: CRun | null = null, staff: CStaff = { total: 0, proposal: null }, staffStop: (() => void) | null = null, staffKey = "";
  const emit = () => { if (run) onData({ run, staff }); };
  const runStop = watchCRun(prv, pv, (r) => {
    run = r;
    const key = r ? (r.formatId === PRED_ID ? "p" : `r${r.round}`) : "";
    if (key !== staffKey) { staffStop?.(); staffKey = key; staff = { total: 0, proposal: null }; staffStop = key ? watchCStaff(prv, key, pv, (s) => { staff = s; emit(); }) : null; }
    emit();
  });
  return () => { runStop(); staffStop?.(); };
}
const steps = (list: [string, string][], now: string) => { const at = list.findIndex(([k]) => k === now); return `<div class="lcg-steps" style="--n:${list.length}">${list.map(([, n], i) => `<span class="lcg-step${i < at ? " is-done" : i === at ? " is-now" : ""}">${n}</span>`).join("")}</div>`; };
function tallyHtml(opts: string[], d: { counts?: number[]; pct?: number[] } | null, correct: number[] = [], hidden = false, mark = " · it happened") {
  return `<div class="lcg-tally">${opts.map((o, i) => `<div class="lcg-tally-row${correct.includes(i) ? " is-correct" : ""}"><span>${esc(o)}${correct.includes(i) ? mark : ""}</span><b>${hidden || !d?.counts ? "hidden" : `${d.pct?.[i] ?? 0}% · ${d.counts[i]}`}</b><span class="lcg-bar"><i style="width:${hidden || !d?.pct ? 0 : d.pct[i]}%"></i></span></div>`).join("")}</div>`;
}
export function choicePanelHtml(p: ChoicePanelData, may: boolean) {
  const { run, staff } = p, wyr = run.formatId === WYR_ID, d = run.display as any;
  const typed = run.source === "typed" ? `<span class="bt-badge bt-badge--blue">Typed live</span>` : `<span class="bt-badge bt-badge--gray">From a pack</span>`;
  const left = run.paused ? `<span class="bt-badge bt-badge--gold">Paused</span>` : run.closesAt && run.state === "open" ? `<span class="lcg-timer" data-cg-left>${fmt(Math.max(0, run.closesAt - Date.now()))}</span>` : "";
  const save = may && run.source === "typed" && (wyr ? run.state === "revealed" : run.state !== "open") ? (run.savedRound === run.round ? `<span class="bt-badge bt-badge--lime">Saved to a pack</span>` : `<button type="button" class="bt-btn bt-btn--secondary" data-cgsave>Save to pack</button>`) : "";
  const end = may ? `<span class="lcg-sp"></span><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-cgrun="end">End game</button>` : "";
  if (wyr) {
    const step = run.state === "open" ? "open" : "revealed";
    const counts = run.state === "open" ? `<div class="lcg-info"><span><b>${staff.total}</b> ${staff.total === 1 ? "vote" : "votes"} in</span><span>·</span><span>The split stays hidden until you reveal</span></div>` : tallyHtml(run.prompt.options, d, d?.winners || [], false, (d?.winners || []).length > 1 ? " · tied" : " · the winner");
    const acts = !may ? "" : run.state === "open"
      ? `<div class="lcg-acts"><button type="button" class="bt-btn bt-btn--primary" data-cgrun="reveal">Reveal now</button><button type="button" class="bt-btn bt-btn--secondary" data-cgrun="${run.paused ? "resume" : "pause"}">${run.paused ? "Resume" : "Pause"}</button>${end}</div>`
      : `<div class="lcg-acts"><button type="button" class="bt-btn bt-btn--primary" data-cgnext>Next prompt</button>${save}${end}</div>`;
    return `<div class="lcg-run"><div class="lcg-run-head"><span class="bt-live-tag"><i></i>Would You Rather on stream</span>${left}</div>${steps([["open", "Voting open"], ["revealed", "Revealed"]], step)}`
      + `<div class="lcg-prompt"><small>Round ${run.round} ${typed}</small><p>${esc(run.prompt.text)}<br>A: ${esc(run.prompt.options[0] || "")}<br>B: ${esc(run.prompt.options[1] || "")}</p></div>${counts}${acts}</div>`;
  }
  return `<div class="lcg-run"><div class="lcg-run-head"><span class="bt-live-tag"><i></i>Predictions on stream</span>${left}</div>${predCore(run, staff, may, save, end)}</div>`;
}
/** The Prediction's body: the run panel and the settle dialog share it. */
function predCore(run: CRun, staff: CStaff, may: boolean, save = "", end = "") {
  const d = run.display as any, opts = run.prompt.options;
  const step = run.state === "open" ? "open" : run.result || run.state === "void" ? "result" : staff.proposal ? "called" : "locked";
  const head = `${steps([["open", "Picks open"], ["locked", "Locked"], ["called", "Called"], ["result", "Result"]], step)}<div class="lcg-prompt"><small>${run.source === "typed" ? "Typed live" : "From a pack"} · ${run.state === "open" ? `<b>${staff.total}</b> picks in` : `${d?.total ?? staff.total} picks`}</small><p>${esc(run.prompt.text)}</p></div>`;
  const tally = tallyHtml(opts, d, run.result ? [run.result.answer] : [], run.state === "open");
  let acts = "";
  if (!may) acts = "";
  else if (run.state === "open") acts = `<div class="lcg-acts"><button type="button" class="bt-btn bt-btn--primary" data-cgrun="lock">Lock now</button>${run.closesAt ? `<span class="lcg-note">Locks itself in <b class="lcg-timer" data-cg-left>${fmt(Math.max(0, run.closesAt - Date.now()))}</b></span>` : ""}<span class="lcg-sp"></span><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-settle="void" data-run="${esc(run.id)}">Void</button></div>`;
  else if (run.state === "locked" && staff.proposal) acts = `<div class="lcg-proposal"><p><b>@${esc(staff.proposal.byHandle || "a mod")}</b> says it happened: <b>${esc(opts[staff.proposal.answer] || "")}</b></p><div class="lcg-acts"><button type="button" class="bt-btn bt-btn--primary" data-settle="confirm" data-run="${esc(run.id)}">Confirm</button><button type="button" class="bt-btn bt-btn--secondary" data-settle="reject" data-run="${esc(run.id)}">Reject</button></div></div>`;
  else if (run.state === "locked") acts = `<div class="lcg-settle"><p class="lcg-note">Waiting for a mod on duty to call it. Or settle it yourself:</p><div class="lcg-settle-row">${opts.map((o, i) => `<button type="button" class="bt-btn bt-btn--secondary" data-settle="settle" data-answer="${i}" data-run="${esc(run.id)}">${esc(o)}</button>`).join("")}</div><div class="lcg-acts">${save}<span class="lcg-sp"></span><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-settle="void" data-run="${esc(run.id)}">Void</button></div></div>`;
  else if (run.result) acts = `<div class="lcg-acts"><span class="lcg-note">${(d?.counts || [])[run.result.answer] ?? 0} called it: +10 XP each, already granted</span>${save}<span class="lcg-sp"></span>${run.corrected ? `<span class="bt-badge bt-badge--gray">Corrected once · final</span>` : `<button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-correct="${esc(run.id)}">Correct the result</button>`}${end}</div>`;
  else if (run.state === "void") acts = `<div class="lcg-acts"><span class="lcg-note">Voided. No +10; the 3 XP for picks stays. Logged.</span>${end}</div>`;
  return `${head}${tally}${acts}`;
}
async function settleAction(runId: string, action: string, answer: number | undefined, pv: boolean) {
  if (action === "void") {
    const ok = await confirmAction({ title: "Void this prediction?", message: "Nobody gets the +10. The 3 XP already paid for picks stays. It's logged.", confirmLabel: "Void it", busyLabel: "Voiding…", danger: true, feature: "chat-games",
      onConfirm: async () => { await settle(runId, "void", undefined, pv); } });
    if (ok) toast("Voided");
    return;
  }
  await settle(runId, action, answer, pv);
  toast(action === "reject" ? "Rejected: the call is cleared" : "Settled: +10 XP to everyone who called it");
}
/** Correct the result: once, in the same stream (a dialog). */
function openCorrect(run: CRun, pv: boolean) {
  const others = run.prompt.options.map((o, i) => [o, i] as const).filter(([, i]) => i !== run.result?.answer);
  const m = openModal({
    title: "Correct the result", feature: "chat-games",
    content: modalHeader("Correct the result", `You can do this once. The +10 for “${esc(run.prompt.options[run.result?.answer ?? 0] || "")}” is taken back and the new winners get +10.`)
      + `<div class="lcg-launch"><span class="bt-label">What actually happened</span><div class="lcg-settle-row">${others.map(([o, i]) => `<button type="button" class="bt-btn bt-btn--secondary" data-fix="${i}">${esc(o)}</button>`).join("")}</div><p class="bt-notice bt-notice--error" data-err hidden></p></div>`
      + `<div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button></div>`,
  });
  m.modal.addEventListener("click", async (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>("[data-fix]");
    if (!b) return;
    b.disabled = true;
    try { await settle(run.id, "correct", Number(b.dataset.fix), pv); m.close(); toast("Corrected. XP was taken back and regranted. Logged."); }
    catch (ex) { const er = m.modal.querySelector<HTMLElement>("[data-err]")!; er.textContent = messageFor(ex, "That didn't work."); er.hidden = false; b.disabled = false; }
  });
}
/** Save to pack: the owner adds the card; the Captain's lands in the pack's Suggested lane (both through chatGameControl saveToPack). */
async function openSave(run: CRun, pv: boolean, owner: boolean) {
  const m = openModal({
    title: "Save to pack", feature: "chat-games",
    content: modalHeader("Save to pack", owner ? "You save straight in." : "It goes to the pack's Suggested lane for the owner.")
      + `<div class="lcg-launch"><div class="lcg-card"><span class="bt-label">This prompt</span><p>${esc(run.prompt.text)}<br><small>${run.prompt.options.map(esc).join(" / ")}</small></p></div>`
      + `<div class="bt-field"><label class="bt-label" for="lcg-sp">Pack</label><select class="bt-select" id="lcg-sp" data-sp disabled><option>Loading…</option></select></div><p class="bt-notice bt-notice--error" data-err hidden></p></div>`
      + `<div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="button" class="bt-btn bt-btn--primary" data-ok disabled>Save to pack</button></div>`,
  });
  const sel = m.modal.querySelector<HTMLSelectElement>("[data-sp]")!, ok = m.modal.querySelector<HTMLButtonElement>("[data-ok]")!;
  try {
    const r = await launchPacks(run.streamId, pv, run.formatId);
    if (r.packs.length) { sel.innerHTML = r.packs.map((p) => `<option value="${esc(p.id)}"${p.id === (run.packId || r.defaultId) ? " selected" : ""}>${esc(p.title)}</option>`).join(""); sel.disabled = false; ok.disabled = false; }
    else sel.innerHTML = `<option>No approved packs for this game</option>`;
  } catch { sel.innerHTML = `<option>The packs didn't load</option>`; }
  ok.addEventListener("click", async () => {
    ok.disabled = true;
    try { await cControl(run.id, "saveToPack", { packId: sel.value }, pv); m.close(); toast(owner ? "Saved to the pack" : "Sent to the pack's Suggested lane"); }
    catch (ex) { const er = m.modal.querySelector<HTMLElement>("[data-err]")!; er.textContent = messageFor(ex, "That didn't save."); er.hidden = false; ok.disabled = false; }
  });
}
/** Next prompt: from the pack (the next card) or typed live. */
function openNext(run: CRun, pv: boolean) {
  const m = openModal({
    title: "Next prompt", feature: "chat-games",
    content: modalHeader("Next prompt", "Would You Rather")
      + `<div class="lcg-launch"><div class="bt-pills" role="group" aria-label="Where the prompt comes from"><button type="button" data-src="pack" class="${run.packId ? "is-on" : ""}" aria-pressed="${!!run.packId}"${run.packId ? "" : " disabled"}>Next card</button><button type="button" data-src="typed" class="${run.packId ? "" : "is-on"}" aria-pressed="${!run.packId}">Type my own</button></div>`
      + `<div data-pane="typed"${run.packId ? " hidden" : ""}><div class="lcg-two"><div class="bt-field"><label class="bt-label" for="lcg-na">Option A</label><input class="bt-input" id="lcg-na" maxlength="80" data-opt></div><div class="bt-field"><label class="bt-label" for="lcg-nb">Option B</label><input class="bt-input" id="lcg-nb" maxlength="80" data-opt></div></div></div>`
      + `<p class="bt-notice bt-notice--error" data-err hidden></p></div>`
      + `<div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="button" class="bt-btn bt-btn--primary" data-ok>Start the next prompt</button></div>`,
  });
  let src = run.packId ? "pack" : "typed";
  m.modal.addEventListener("click", async (e) => {
    const t = e.target as Element;
    const s = t.closest<HTMLButtonElement>("[data-src]");
    if (s && !s.disabled) { src = s.dataset.src!; m.modal.querySelectorAll<HTMLElement>("[data-src]").forEach((b) => { b.classList.toggle("is-on", b === s); b.setAttribute("aria-pressed", String(b === s)); }); m.modal.querySelector<HTMLElement>("[data-pane]")!.hidden = src !== "typed"; return; }
    const ok = t.closest<HTMLButtonElement>("[data-ok]");
    if (!ok) return;
    const err = m.modal.querySelector<HTMLElement>("[data-err]")!;
    const opts = [...m.modal.querySelectorAll<HTMLInputElement>("[data-opt]")].map((i) => i.value.trim());
    if (src === "typed" && opts.some((o) => !o)) { err.textContent = "Write both options."; err.hidden = false; return; }
    ok.disabled = true;
    try { await cControl(run.id, "nextRound", src === "typed" ? { source: "typed", prompt: { text: "Would you rather…", options: opts } } : { source: "pack" }, pv); m.close(); toast("Next prompt is on"); }
    catch (ex) { err.textContent = messageFor(ex, "That didn't start."); err.hidden = false; ok.disabled = false; }
  });
}
export function wireChoicePanel(el: HTMLElement, getRun: () => CRun | null, pv: boolean, owner: () => boolean) {
  if ((el as any)._cgRunWired) return;
  (el as any)._cgRunWired = true;
  el.addEventListener("click", async (e) => {
    const t = e.target as Element, run = getRun();
    if (!run) return;
    if (t.closest("[data-cgsave]")) { void openSave(run, pv, owner()); return; }
    if (t.closest("[data-cgnext]")) { openNext(run, pv); return; }
    const c = t.closest<HTMLElement>("[data-correct]");
    if (c) { openCorrect(run, pv); return; }
    const s = t.closest<HTMLButtonElement>("[data-settle]");
    if (s) { s.disabled = true; try { await settleAction(s.dataset.run!, s.dataset.settle!, s.dataset.answer != null ? Number(s.dataset.answer) : undefined, pv); } catch (ex) { toast(messageFor(ex, "That didn't work."), { kind: "error" }); } finally { s.disabled = false; } return; }
    const b = t.closest<HTMLButtonElement>("[data-cgrun]");
    if (!b) return;
    if (b.dataset.cgrun === "end") { void (window as any).btChatGames?.end({ runId: run.id, title: NAME[run.formatId] }); return; }
    b.disabled = true;
    try { await cControl(run.id, b.dataset.cgrun!, {}, pv); if (b.dataset.cgrun === "lock") toast("Locked: +3 XP to every pick. It waits for its result while other games run."); }
    catch (ex) { toast(messageFor(ex, "That didn't work. Try again."), { kind: "error" }); }
    finally { b.disabled = false; }
  });
}

// ---------- /live/control: the Waiting panel (locked Predictions, each openable to settle) ----------
export function waitingPanelHtml(waiting: WaitingItem[], may: boolean) {
  if (!waiting.length) return "";
  return `<div class="lcg-waitpanel"><h3 class="bt-label">Waiting on a result</h3>${waiting.map((w) => `<div class="lcg-wait"><span class="lcg-wait-ic">${CLOCK}</span><div><small>Locked</small><b>${esc(w.title || "A prediction")}</b></div><span class="lcg-sp"></span>${may ? `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-openwait="${esc(w.runId)}">Settle</button>` : `<span class="bt-badge bt-badge--gold">Locked</span>`}</div>`).join("")}<p class="lcg-note">Up to 3 locked Predictions can wait while other games run. Unsettled at Stop means void.</p></div>`;
}
export function wireWaitingPanel(el: HTMLElement, pv: boolean) {
  if ((el as any)._cgWaitWired) return;
  (el as any)._cgWaitWired = true;
  el.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-openwait]");
    if (!b) return;
    const runId = b.dataset.openwait!;
    const m = openModal({ title: "Settle the prediction", feature: "chat-games", content: modalHeader("Settle the prediction", "Predictions") + `<div class="lcg-run lcg-run--dialog" data-settlebox><p class="lcg-note">Loading…</p></div><div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Close</button></div>` });
    const box = m.modal.querySelector<HTMLElement>("[data-settlebox]")!;
    let cur: CRun | null = null;
    // the preview's waiting run is "preview-wait" (choices-data routes the preview- ids to the sample)
    const stop = watchChoicePanel(pv ? "preview-wait" : runId, PRED_ID, false, (p) => { if (!box.isConnected) { stop(); return; } cur = p.run; box.innerHTML = predCore(p.run, p.staff, true); });
    wireChoicePanel(box, () => cur, pv, () => true);
  });
}

registerFormat(WYR_ID, { launch: (o: any) => launch({ ...o, formatId: WYR_ID }), play });
registerFormat(PRED_ID, { launch: (o: any) => launch({ ...o, formatId: PRED_ID }), play });
