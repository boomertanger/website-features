// Hot Seat in Chat Games (docs/specs/chat-games.md §5, §14; part 4; mockup control-room-batch-4.html "Hot Seat: run it / play it"): what
// shared/ui/chatgames.js mounts for formatId "hot-seat", plus /live/control's run panel. Registered with registerFormat (the stream view scene is
// cg-hotseat-scene.ts). Both panels follow the run with live listeners (cg-watch.ts, docs/specs/chat-games.md §3): the Play panel watches the run doc
// only (its display carries the seats, the nameless answers and the results), the run panel the run doc and the current round doc; nothing is
// polled, and the countdowns tick locally.
//   launch   pack (default: the pack tagged to tonight's Game Vault game, else General), rounds 1 to 5 as .bt-chip (3), picker as .bt-pills
//            (Séance board / Wheel), the first card with Skip card, and a warning when fewer than 2 are checked in (Start anyway)
//   play     the Play panel on /live: Put me in; "You're in the Hot Seat!" with I'm in and its 15 s countdown; the answer box (140); voting on
//            nameless answers (yours marked, not votable); "Check in to vote"; the reveal (a burst for winners, none under reduced motion);
//            the clocked-in note and the XP cap
//   watchHsPanel / hsPanelHtml / wireHsPanel   /live/control: the round's steps, card (Skip card), players with their live answer status (Hide),
//            Next round, the picker for the next round, Pause / Resume, End
// Preview (staging, signed out, ?game=hot-seat): the sample round on a loop with you as @gbo; ?hs=accept|answer|vote|reveal pins a step,
// ?duty=1 shows the clocked-in note, ?few=1 the launch warning. Nothing is saved.
import { registerFormat } from "../../../../shared/ui/chatgames.js";
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { burst } from "../../../../shared/ui/burst.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { getAuthState } from "../../lib/auth";
import { reasonOf, messageFor } from "../../lib/errors";
import { call } from "../../lib/call";
import { toast, mascotHtml, reduced } from "./ui";
import { watchHsRun, watchHsRound, getMyPlay, getStaff, checkedInNow, onDutyNow, myVolunteer, launchPacks, pickCard, hsPlay, hsVolunteer, hsHide, hsControl, eligibleNow, hsPreview,
  type HsRun, type HsPlay, type HsRound, type HsStaff, type HsPack } from "./hotseat-data";
import type { HsDisplay } from "./hotseat-sample";
import "./cg-hotseat-scene";

const signedIn = () => !!getAuthState().user;
const isMember = () => { const s = getAuthState(); return (s.status === "verified" || s.status === "unverified") && !!s.profile; };
const preview = () => hsPreview(signedIn());
const previewMember = () => preview() && new URLSearchParams(location.search).get("as") !== "visitor";
const myHandle = () => (preview() ? "gbo" : String(getAuthState().profile?.handle || "").replace(/^@/, ""));
const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
const secs = (ms: number) => String(Math.ceil(Math.max(0, ms) / 1000));
const FLAME = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2c2.5 3.6 6 6 6 11a6 6 0 0 1-12 0c0-2.4 1.2-3.8 2.4-4.8 0 2.4 1.2 3.6 2.4 3.6 0-3.6-1.2-6 1.2-9.8z"/></svg>';
const PHASES: [string, string][] = [["accept", "Pick"], ["answer", "Answer"], ["vote", "Vote"], ["reveal", "Reveal"]];

// ---------- the launch dialog ----------
async function launch({ streamId = "", title = "Hot Seat" }: { streamId?: string; title?: string } = {}) {
  let rounds = 3, picker = "seance", packs: HsPack[] = [], pack: HsPack | null = null, card: { id: string; text: string } | null = null;
  const skipped: string[] = [];
  const m = openModal({
    title: "Hot Seat", feature: "chat-games",
    content: modalHeader(esc(title || "Hot Seat"), "Chat Games")
      + `<div class="lhs-launch"><div class="bt-field"><label class="bt-label" for="lhs-pack">Pack</label><select class="bt-select" id="lhs-pack" data-pack disabled><option>Loading packs…</option></select><span class="bt-hint" data-tag></span></div>`
      + `<div class="lhs-first" data-first><span class="bt-label">First card</span><p class="lhs-first-card" data-card>…</p><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-skip disabled>Skip card</button></div>`
      + `<div class="lhs-two"><div class="bt-field"><span class="bt-label" id="lhs-rounds">Rounds</span><div class="lhs-chips" role="group" aria-labelledby="lhs-rounds">`
      + [1, 2, 3, 4, 5].map((n) => `<button type="button" class="bt-chip bt-chip--small" data-rounds="${n}" aria-pressed="${n === 3}">${n}</button>`).join("")
      + `</div></div><div class="bt-field"><span class="bt-label" id="lhs-picker">Picker</span><div class="bt-pills" role="group" aria-labelledby="lhs-picker"><button type="button" class="is-on" data-picker="seance" aria-pressed="true">Séance board</button><button type="button" data-picker="wheel" aria-pressed="false">Wheel</button></div></div></div>`
      + `<p class="bt-notice" data-few hidden></p><p class="bt-notice" data-busy hidden></p></div>`
      + `<div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="button" class="bt-btn bt-btn--primary" data-start disabled>Start Hot Seat</button></div>`,
  });
  const box = m.modal;
  const sel = box.querySelector<HTMLSelectElement>("[data-pack]")!, startBtn = box.querySelector<HTMLButtonElement>("[data-start]")!;
  const showCard = () => {
    card = pack ? pickCard(pack, skipped) || null : null;
    box.querySelector("[data-card]")!.textContent = card ? card.text : "This pack has no cards yet.";
    box.querySelector<HTMLButtonElement>("[data-skip]")!.disabled = !pack || pack.cards.length < 2;
  };
  try {
    const [r, eligible] = await Promise.all([launchPacks(streamId, preview()), eligibleNow(preview())]);
    packs = r.packs;
    if (!packs.length) {
      sel.innerHTML = `<option>No approved Hot Seat packs</option>`;
      box.querySelector("[data-card]")!.innerHTML = `No cards to draw yet. <a href="/crew/games">Add a pack in Games</a>.`;
    } else {
      sel.innerHTML = packs.map((p) => `<option value="${esc(p.id)}"${p.id === r.defaultId ? " selected" : ""}>${esc(p.title)} (${p.cards.length} ${p.cards.length === 1 ? "card" : "cards"})</option>`).join("");
      sel.disabled = false; startBtn.disabled = false;
      pack = packs.find((p) => p.id === r.defaultId) || packs[0];
      box.querySelector("[data-tag]")!.textContent = r.tagged && pack.vaultGameIds.length ? "Tagged to a game planned tonight." : "";
      showCard();
    }
    if (eligible < 2) {
      const few = box.querySelector<HTMLElement>("[data-few]")!;
      few.textContent = `Only ${eligible} ${eligible === 1 ? "member is" : "members are"} checked in to this beat. You can start anyway: the first round waits 30 seconds for volunteers to tap Put me in.`;
      few.hidden = false; startBtn.textContent = "Start anyway";
    }
  } catch (ex) { box.querySelector("[data-card]")!.textContent = messageFor(ex, "The packs didn't load. Close this and try again."); }
  sel.addEventListener("change", () => { pack = packs.find((p) => p.id === sel.value) || null; skipped.length = 0; box.querySelector("[data-tag]")!.textContent = ""; showCard(); });
  box.addEventListener("click", async (e) => {
    const t = e.target as Element;
    const chip = t.closest<HTMLElement>("[data-rounds]");
    if (chip) { rounds = Number(chip.dataset.rounds); box.querySelectorAll<HTMLElement>("[data-rounds]").forEach((c) => c.setAttribute("aria-pressed", String(c === chip))); return; }
    const pill = t.closest<HTMLElement>("[data-picker]");
    if (pill) { picker = pill.dataset.picker!; box.querySelectorAll<HTMLElement>("[data-picker]").forEach((b) => { b.classList.toggle("is-on", b === pill); b.setAttribute("aria-pressed", String(b === pill)); }); return; }
    if (t.closest("[data-skip]")) { if (card) skipped.push(card.id); if (pack && skipped.length >= pack.cards.length) skipped.length = 0; showCard(); return; }
    const go = t.closest<HTMLButtonElement>("[data-start], [data-swap]");
    if (!go || !pack) return;
    const swap = go.hasAttribute("data-swap"), label = go.textContent;
    go.disabled = true; go.textContent = swap ? "Swapping…" : "Starting…";
    try {
      if (preview()) { m.close(); toast(`Preview: Hot Seat would start with ${rounds} ${rounds === 1 ? "round" : "rounds"} on the ${picker === "wheel" ? "wheel" : "séance board"}.`); return; }
      await call(swap ? "chatGameSwap" : "chatGameStart", { formatId: "hot-seat", streamId: streamId || undefined, options: { packId: pack.id, rounds, picker, cardId: card?.id } });
      m.close();
      toast("Hot Seat is on stream");
    } catch (ex) {
      if (reasonOf(ex) === "busy") {
        const b = box.querySelector<HTMLElement>("[data-busy]")!;
        b.textContent = messageFor(ex); b.hidden = false;
        go.outerHTML = `<button type="button" class="bt-btn bt-btn--primary" data-swap>Swap to Hot Seat</button>`;
        return;
      }
      toast(messageFor(ex, "That didn't start. Try again."), { kind: "error" });
      go.disabled = false; go.textContent = label;
    }
  });
}

// ---------- the Play panel ----------
interface PlayState { run: HsRun | null; play: HsPlay; checked: boolean; duty: boolean; vol: boolean; key: string; offline: boolean; burstFor: string; draft: string; busy: boolean }
type PlayHost = HTMLElement & { _hs?: number; _hsState?: PlayState; _hsStop?: () => void; _hsRead?: () => Promise<void> };

function closeLine(run: HsRun, label: string) {
  if (run.paused) return `<span class="bt-badge bt-badge--gold">Paused</span>`;
  return run.closesAt ? `<span class="lhs-timer"><b data-left>${secs(run.closesAt - Date.now())}</b> s ${esc(label)}</span>` : "";
}
function seatChips(d: HsDisplay, me: string) {
  if (!d.seats.length) return "";
  return `<div class="lhs-seats">${d.seats.map((s) => `<span class="lhs-seat${s.handle === me ? " is-me" : ""}" data-st="${esc(s.status)}">@${esc(s.handle)}${s.status === "in" || s.status === "answered" ? " ✓" : ""}</span>`).join("")}</div>`;
}
function playBody(st: PlayState, el: PlayHost): string {
  const run = st.run!, d = run.display, me = myHandle();
  const member = isMember() || previewMember();
  if (!d) return `<div class="lhs-me"><span class="lhs-hot">${FLAME}</span><h3>Hot Seat is starting</h3><p>The first card is on its way.</p></div>`;
  const seat = d.seats.find((s) => s.handle === me);
  const card = d.card ? `<p class="lhs-card">${esc(d.card)}</p>` : "";
  const vol = member ? `<label class="bt-check lhs-vol"><input type="checkbox" data-vol${st.vol ? " checked" : ""}${st.offline ? " disabled" : ""}> Put me in</label><span class="lhs-note">${st.vol ? "You volunteered: you can be drawn in the next pick." : "Volunteers can be drawn even before they check in."}</span>` : "";
  const join = `<button type="button" class="bt-btn bt-btn--primary" data-signin="join" data-signin-title="Join free to play Hot Seat">Join free to play</button>`;
  const phase = d.phase;
  if (!member) return `<div class="lhs-me"><span class="lhs-hot">${FLAME}</span><h3>Hot Seat is on</h3>${card}<p>Three members answer the same card; everyone checked in votes. The winner gets 25 XP.</p>${join}</div>`;
  if (phase === "over") return `<div class="lhs-me"><span class="lhs-hot">${FLAME}</span><h3>That's Hot Seat for tonight</h3><p>Thanks for playing. Your XP is in your trophy case.</p></div>`;
  if (phase === "void") return `<div class="lhs-me">${mascotHtml()}<h3>Not enough players this round</h3><p>The next card comes up when the Captain is ready.</p>${vol}</div>`;
  if (phase === "starting" || phase === "waiting") return `<div class="lhs-me"><span class="lhs-hot">${FLAME}</span><h3>Hot Seat is on</h3>${card}<p>Three players are about to be picked from everyone checked in this beat.</p>${closeLine(run, "until the pick")}${vol}</div>`;
  if (phase === "accept") {
    if (seat && seat.status === "picked") return `<div class="lhs-me is-picked"><span class="lhs-hot">${FLAME}</span><h3>You're in the Hot Seat!</h3>${card}<button type="button" class="bt-btn bt-btn--primary lhs-wide" data-hs="accept"${st.busy || run.paused ? " disabled" : ""}>I'm in</button><p class="lhs-note"><b data-left>${secs((run.closesAt || 0) - Date.now())}</b> seconds, or the board picks someone else.</p></div>`;
    if (seat && seat.status === "in") return `<div class="lhs-me"><span class="lhs-hot">${FLAME}</span><h3>You're in!</h3>${card}<p>Waiting for the other players to tap I'm in.</p>${seatChips(d, me)}</div>`;
    return `<div class="lhs-me"><span class="lhs-hot">${FLAME}</span><h3>Picking players</h3>${card}${seatChips(d, me)}${closeLine(run, "to tap I'm in")}${vol}</div>`;
  }
  if (phase === "answer") {
    if (seat && seat.status === "in") {
      const n = st.draft.length;
      return `<div class="lhs-me"><h3>Your answer</h3>${card}<textarea class="bt-textarea" maxlength="140" rows="3" data-answer placeholder="Make chat laugh (or scream)"${run.paused ? " disabled" : ""}>${esc(st.draft)}</textarea>`
        + `<div class="lhs-row"><span class="lhs-timer"><b data-left>${run.paused ? "Paused" : fmt(Math.max(0, (run.closesAt || 0) - Date.now()))}</b>${run.paused ? "" : " left"}</span><span class="lhs-count" data-count>${n} / 140</span></div>`
        + `<button type="button" class="bt-btn bt-btn--primary lhs-wide" data-hs="answer"${st.busy || run.paused ? " disabled" : ""}>Lock it in</button><p class="lhs-note">No links; the usual word filter applies. No answer means you're out of this round.</p></div>`;
    }
    if (seat && seat.status === "answered") return `<div class="lhs-me"><h3>Locked in</h3>${card}${st.play.answer ? `<blockquote class="lhs-mine">${esc(st.play.answer)}</blockquote>` : ""}<p>The vote opens when every player has answered or the time is up.</p></div>`;
    if (seat && seat.status === "hidden") return `<div class="lhs-me">${mascotHtml()}<h3>You're out this round</h3><p>A mod hid your answer, so it won't be shown. You can still vote next round.</p></div>`;
    if (seat && seat.status === "out") return `<div class="lhs-me">${mascotHtml()}<h3>You're out this round</h3><p>No answer came in time. Catch the next one!</p></div>`;
    return `<div class="lhs-me"><h3>The players are writing</h3>${card}${seatChips(d, me)}${closeLine(run, "to answer")}<p class="lhs-note">${st.checked ? "Get ready: you vote next." : "Check in to this beat to vote."}</p>${vol}</div>`;
  }
  if (phase === "vote") {
    const player = !!seat;
    const can = (st.checked || player) && !run.paused && !st.offline;
    const rows = d.answers.map((a) => {
      const mine = st.play.answerId === a.id, voted = st.play.vote === a.id;
      return `<button type="button" class="lhs-pick" data-vote="${esc(a.id)}" aria-pressed="${voted}"${mine || !can || !!st.play.vote ? " disabled" : ""}><span>${esc(a.text)}</span>${mine ? `<span class="bt-badge bt-badge--blue">Yours</span>` : voted ? `<span class="bt-badge bt-badge--lime">Your vote</span>` : ""}</button>`;
    }).join("");
    const foot = st.play.vote ? `<p class="lhs-note">Vote counted. The reveal is in <b data-left>${secs((run.closesAt || 0) - Date.now())}</b> s.</p>`
      : can ? `<p class="lhs-note"><b data-left>${secs((run.closesAt || 0) - Date.now())}</b> s to vote. You can't vote for your own answer.</p>`
      : `<p class="lhs-note">Check in to vote. <a href="#lp-checkin" data-hs-checkin>Check in</a></p>`;
    return `<div class="lhs-me lhs-me--left"><h3>Vote for the best</h3>${card}<div class="lhs-picks">${rows}</div>${foot}</div>`;
  }
  if (phase === "reveal") {
    const res = st.play.result;
    const rows = d.answers.map((a) => `<div class="lhs-res${a.winner ? " is-win" : ""}"><p>${esc(a.text)}</p><small>@${esc(a.handle || "")}${a.winner ? " · 👑 winner" : ""}</small><b>${a.pct || 0}%</b><span class="lhs-bar"><i style="--f:${(a.pct || 0) / 100}"></i></span></div>`).join("");
    let mine = "";
    if (res && !res.hidden) {
      const xp = res.crew ? `<span class="bt-badge bt-badge--gray">No game XP while clocked in</span>` : `<span class="bt-badge bt-badge--gold">+${res.xp} XP</span>`;
      mine = `<div class="lhs-mine-res" data-hs-mine>${res.winner ? `<h3 class="lhs-won">You won!</h3>` : `<h3>Thanks for playing</h3>`}${xp}${res.capped && !res.crew ? `<p class="lhs-note">You've hit tonight's XP cap, so this paid ${res.xp} XP.</p>` : ""}</div>`;
      if (res.winner && st.burstFor !== `${run.id}:${run.round}`) {
        st.burstFor = `${run.id}:${run.round}`;
        setTimeout(() => { const h = el.querySelector<HTMLElement>("[data-hs-mine]"); if (h && !reduced()) burst(h, { n: 26 }); }, 60);
      }
    }
    return `<div class="lhs-me lhs-me--left">${mine}<h3>${d.noVotes ? "No votes this time" : "The results"}</h3>${card}${d.noVotes ? `<p class="lhs-note">Everyone who answered gets 5 XP.</p>` : ""}<div class="lhs-results">${rows}</div></div>`;
  }
  return `<div class="lhs-me"><h3>Hot Seat</h3>${card}</div>`;
}
function renderPlay(el: PlayHost) {
  const st = el._hsState!, run = st.run;
  if (!run || !el.isConnected) return;
  const ta = el.querySelector<HTMLTextAreaElement>("[data-answer]");
  const typing = ta && document.activeElement === ta;
  const pos = ta ? ta.selectionStart : 0;
  const head = `<div class="lhs-top"><span class="bt-live-tag"><i></i>Hot Seat · Round ${run.round || 1} of ${run.rounds}</span>${st.offline ? `<span class="bt-badge bt-badge--gray">Reconnecting…</span>` : ""}</div>`;
  const duty = st.duty ? `<p class="bt-notice lhs-duty">You're clocked in, so you can play but earn no game XP tonight.</p>` : "";
  el.innerHTML = `<div class="lhs-play">${head}${duty}${playBody(st, el)}</div>`;
  const ta2 = el.querySelector<HTMLTextAreaElement>("[data-answer]");
  if (ta2 && typing) { ta2.focus(); ta2.setSelectionRange(pos, pos); }
}
async function play(el: PlayHost, { chatGame }: { chatGame: { runId: string } }) {
  if (el._hs) { clearInterval(el._hs); el._hs = 0; }
  el._hsStop?.(); el._hsStop = undefined;
  const pvw = preview();
  const st: PlayState = el._hsState && el._hsState.run?.id === chatGame.runId ? el._hsState : { run: null, play: {}, checked: false, duty: false, vol: false, key: "", offline: false, burstFor: "", draft: "", busy: false };
  el._hsState = st;
  const uid = getAuthState().user?.uid || (pvw ? "me" : "");
  // The run doc is watched (cg-watch.ts): it carries the display (seats, the nameless answers, the results), so nothing is polled. My own play,
  // check-in and Put me in are read once each time the round, the phase or a seat changes, and after my own moves.
  let seq = 0;
  const mine = async (run: HsRun) => {
    const n = ++seq, first = !st.key || st.key.split("|")[0] !== run.id;
    const [play, checked, vol] = await Promise.all([getMyPlay(run.id, uid, run.round, pvw), checkedInNow(run.streamId, uid, pvw), myVolunteer(run.streamId, uid, pvw)]);
    const duty = first ? await onDutyNow(run.streamId, uid, pvw) : st.duty;
    if (n !== seq) return;
    st.play = play; st.checked = checked; st.vol = vol; st.duty = duty;
  };
  const onRun = async (run: HsRun | null) => {
    if (!el.isConnected) { el._hsStop?.(); return; }
    if (!run) return;
    const key = `${run.id}|${run.round}|${run.phase}|${run.paused}|${run.display?.seats.map((x) => x.status).join()}|${run.display?.answers.length}`;
    const fresh = key !== st.key;
    if (fresh && st.key.split("|")[1] !== String(run.round)) st.draft = "";
    st.run = run; st.offline = false;
    if (fresh && uid) { try { await mine(run); } catch { /* keep the last */ } }
    st.key = key;
    if (fresh || !el.querySelector("[data-answer]")) renderPlay(el);
  };
  const read = async () => { if (st.run && uid) { try { await mine(st.run); } catch { /* keep the last */ } } renderPlay(el); };
  el._hsRead = read;   // the handlers below are wired once per element and reach the current mount through it
  if (!(el as any)._hsWired) {
    (el as any)._hsWired = true;
    el.addEventListener("input", (e) => {
      const ta = (e.target as Element).closest<HTMLTextAreaElement>("[data-answer]");
      if (!ta) return;
      el._hsState!.draft = ta.value;
      const c = el.querySelector("[data-count]"); if (c) c.textContent = `${ta.value.length} / 140`;
    });
    el.addEventListener("change", async (e) => {
      const box = (e.target as Element).closest<HTMLInputElement>("[data-vol]");
      if (!box) return;
      const s = el._hsState!;
      box.disabled = true;
      try { await hsVolunteer(box.checked, preview()); s.vol = box.checked; toast(box.checked ? "You're in the pool: you can be drawn next." : "Taken out of the pool.", { kind: "info" }); }
      catch (ex) { box.checked = !box.checked; toast(messageFor(ex, "That didn't save. Try again."), { kind: "error" }); }
      finally { renderPlay(el); }
    });
    el.addEventListener("click", async (e) => {
      const t = e.target as Element, s = el._hsState!, run = s.run;
      if (t.closest("[data-hs-checkin]")) { e.preventDefault(); document.querySelector<HTMLElement>("#lp-checkin")?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "center" }); return; }
      if (!run) return;
      const b = t.closest<HTMLButtonElement>("[data-hs], [data-vote]");
      if (!b || b.disabled) return;
      const action = (b.dataset.hs || "vote") as "accept" | "answer" | "vote";
      const data: Record<string, unknown> = action === "answer" ? { text: s.draft.trim() } : action === "vote" ? { answerId: b.dataset.vote } : {};
      if (action === "answer" && !s.draft.trim()) { toast("Write your answer first.", { kind: "info" }); return; }
      s.busy = true; b.disabled = true;
      try {
        await hsPlay(run.id, action, data, preview());
        if (action === "accept") toast("You're in! Get your answer ready.");
        if (action === "answer") { s.play = { ...s.play, answer: String(data.text) }; toast("Locked in"); }
        if (action === "vote") { s.play = { ...s.play, vote: String(data.answerId) }; toast("Vote counted"); }
      } catch (ex) {
        toast(messageFor(ex, reasonOf(ex) === "closed" ? "That just closed." : "That didn't go through. Try again."), { kind: reasonOf(ex) === "closed" || reasonOf(ex) === "already" ? "info" : "error" });
      } finally { s.busy = false; await el._hsRead?.(); }
    });
  }
  el._hsStop = watchHsRun(chatGame.runId, pvw, (r) => void onRun(r), () => { st.offline = true; renderPlay(el); });
  // the countdown only (no reads)
  el._hs = window.setInterval(() => {
    if (!el.isConnected) { clearInterval(el._hs); el._hsStop?.(); return; }
    const run = el._hsState?.run;
    if (run && run.closesAt && !run.paused) el.querySelectorAll<HTMLElement>("[data-left]").forEach((x) => { x.textContent = run.phase === "answer" ? fmt(Math.max(0, run.closesAt! - Date.now())) : secs(run.closesAt! - Date.now()); });
  }, 1000);
}

// ---------- /live/control: the run panel ----------
export interface HsPanelData { run: HsRun; round: HsRound | null; staff: HsStaff }
const STATUS: Record<string, string> = { picked: "15 s to tap I'm in", in: "✓ In", answered: "✓ Answered", out: "Out: no answer", hidden: "Out: hidden by a mod", replaced: "Replaced: no tap" };
/** Follows a run for the run panel: the run doc and the current round doc are watched; the staff answers are read once whenever either changes
 *  in the answer or vote step (every answer and every Hide rewrites the run's display, so the run doc fires). Returns a stop. */
export function watchHsPanel(runId: string, pv: boolean, onData: (p: HsPanelData) => void): () => void {
  let run: HsRun | null = null, round: HsRound | null = null, staff: HsStaff = { answers: {}, hidden: {} }, roundStop: (() => void) | null = null, roundN = 0, seq = 0;
  const emit = async () => {
    if (!run) return;
    const n = ++seq;
    if (run.round && ["answer", "vote", "reveal"].includes(run.phase)) { try { staff = await getStaff(run.id, run.round, pv); } catch { /* keep the last */ } }
    if (n === seq && run) onData({ run, round, staff });
  };
  const runStop = watchHsRun(runId, pv, (r) => {
    run = r;
    if (r && r.round !== roundN) {
      roundStop?.(); roundN = r.round; round = null; staff = { answers: {}, hidden: {} };
      roundStop = r.round ? watchHsRound(runId, r.round, pv, (x) => { round = x; void emit(); }) : null;
    }
    void emit();
  });
  return () => { runStop(); roundStop?.(); };
}
export function hsPanelHtml(p: HsPanelData, may: boolean) {
  const { run, round, staff } = p, phase = run.phase;
  const at = PHASES.findIndex(([k]) => k === phase), done = phase === "reveal" ? 4 : at;
  const steps = `<div class="lhs-steps">${PHASES.map(([, n], i) => `<span class="lhs-step${i < done ? " is-done" : i === at ? " is-now" : ""}">${n}</span>`).join("")}</div>`;
  const left = run.paused ? `<span class="bt-badge bt-badge--gold">Paused</span>` : run.closesAt ? `<span class="lhs-timer" data-hs-left>${fmt(Math.max(0, run.closesAt - Date.now()))}</span>` : "";
  const note = phase === "waiting" ? "Fewer than 2 could play: waiting 30 s for volunteers." : phase === "void" ? "Not enough players: this round is void (no XP). Bring up the next card." : phase === "over" ? "Hot Seat is over." : phase === "starting" ? "Drawing the first card…" : "";
  const seats = (round?.seats || []).filter((s) => s.status !== "replaced" || phase === "accept");
  const res = new Map((round?.results || []).map((r) => [r.uid, r]));
  const players = seats.length ? `<div class="lhs-players">${seats.map((s) => {
    const r = res.get(s.uid), a = staff.answers[s.uid], hid = staff.hidden[s.uid];
    let body = `<small>${esc(STATUS[s.status] || s.status)}</small>`;
    if (phase === "reveal" && r) body = r.hidden ? `<small>Hidden by a mod · no XP</small>` : `<p>${esc(r.text || "")}</p><span class="lhs-bar"><i style="--f:${r.pct / 100}"></i></span><small>${r.votes} ${r.votes === 1 ? "vote" : "votes"} · ${r.pct}% · ${r.crew ? "clocked in, no XP" : `${r.xpPaid} XP${r.capped ? " (capped)" : ""}`}</small>`;
    else if (a && (phase === "answer" || phase === "vote")) body = `<p class="lhs-staff-a${hid ? " is-hidden" : ""}">${esc(a.text)}</p><small>${hid ? `Hidden by @${esc(hid.byHandle || "a mod")}` : esc(STATUS[s.status] || s.status)}</small>${hid ? "" : `<button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-hs-hide="${esc(s.uid)}" data-handle="${esc(s.handle)}">Hide answer</button>`}`;
    return `<div class="lhs-p${r?.winner ? " is-win" : ""}${hid || s.status === "hidden" ? " is-hidden" : ""}" data-st="${esc(s.status)}">${r?.winner ? `<span class="lhs-crown" aria-hidden="true">👑</span>` : ""}<div class="lhs-p-who"><b>@${esc(s.handle)}</b>${s.volunteer ? `<span class="bt-badge bt-badge--gold">Volunteer</span>` : ""}</div>${body}</div>`;
  }).join("")}</div>` : "";
  const card = round?.card ? `<div class="lhs-runcard"><small>Round ${run.round} of ${run.rounds}</small><p>${esc(round.card)}</p></div>` : "";
  const last = run.round >= run.rounds;
  const acts = !may || phase === "over" ? "" : `<div class="lhs-acts">`
    + (phase === "reveal" || phase === "void" ? `<button type="button" class="bt-btn bt-btn--primary" data-hsrun="nextRound">${last ? "Finish Hot Seat" : "Next round"}</button>` : "")
    + (phase === "waiting" || phase === "accept" ? `<button type="button" class="bt-btn bt-btn--secondary" data-hsrun="skipCard">Skip card</button>` : "")
    + (run.paused ? `<button type="button" class="bt-btn bt-btn--secondary" data-hsrun="resume">Resume</button>` : run.closesAt ? `<button type="button" class="bt-btn bt-btn--secondary" data-hsrun="pause">Pause</button>` : "")
    + `<span class="lhs-sp"></span><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-hsrun="end">End Hot Seat</button></div>`
    + (last ? "" : `<div class="lhs-next"><span class="bt-label">Picker for the next round</span><div class="bt-pills"><button type="button" data-hs-picker="seance" class="${run.nextPicker !== "wheel" ? "is-on" : ""}" aria-pressed="${run.nextPicker !== "wheel"}">Séance board</button><button type="button" data-hs-picker="wheel" class="${run.nextPicker === "wheel" ? "is-on" : ""}" aria-pressed="${run.nextPicker === "wheel"}">Wheel</button></div></div>`);
  return `<div class="lhs-run" data-hsrun-box><div class="lhs-run-head"><span class="bt-live-tag"><i></i>Hot Seat on stream</span>${left}</div>${steps}${card}${note ? `<p class="lhs-note">${note}</p>` : ""}${players}${acts}</div>`;
}
export function wireHsPanel(el: HTMLElement, getRunNow: () => HsRun | null, after: () => void, pv: boolean) {
  if ((el as any)._hsRun) return;
  (el as any)._hsRun = true;
  el.addEventListener("click", async (e) => {
    const t = e.target as Element, run = getRunNow();
    if (!run) return;
    const hide = t.closest<HTMLButtonElement>("[data-hs-hide]");
    if (hide) {
      hide.disabled = true;
      try { if (pv) toast("Preview: the answer would be hidden"); else await hsHide(run.id, hide.dataset.hsHide!); toast(`@${hide.dataset.handle}'s answer is hidden. They're out of this round.`); after(); }
      catch (ex) { toast(messageFor(ex, "That didn't hide. Try again."), { kind: "error" }); hide.disabled = false; }
      return;
    }
    const pk = t.closest<HTMLButtonElement>("[data-hs-picker]");
    if (pk) {
      try { await hsControl(run.id, "picker", { picker: pk.dataset.hsPicker }, pv); toast(`Next round uses the ${pk.dataset.hsPicker === "wheel" ? "wheel" : "séance board"}`); after(); }
      catch (ex) { toast(messageFor(ex, "That didn't switch. Try again."), { kind: "error" }); }
      return;
    }
    const b = t.closest<HTMLButtonElement>("[data-hsrun]");
    if (!b) return;
    if (b.dataset.hsrun === "end") { void (window as any).btChatGames?.end({ runId: run.id, title: "Hot Seat" }); return; }
    b.disabled = true;
    try { await hsControl(run.id, b.dataset.hsrun!, {}, pv); if (pv) toast(`Preview: ${b.dataset.hsrun}`); after(); }
    catch (ex) { toast(messageFor(ex, "That didn't work. Try again."), { kind: "error" }); b.disabled = false; }
  });
}

/** The run panel for btChatGames.mountRun (part 7): the run and the current round are watched; the clock ticks locally. Returns a stop. */
function run(el: HTMLElement, { chatGame, may, preview: pv }: { chatGame: { runId: string }; may: boolean; preview: boolean }) {
  const box = document.createElement("div");
  el.appendChild(box);
  let data: HsPanelData | null = null;
  wireHsPanel(box, () => data?.run || null, () => {}, pv);   // the listeners bring every change
  const stopW = watchHsPanel(chatGame.runId, pv, (p) => { data = p; const html = hsPanelHtml(p, may); if (box.innerHTML !== html) box.innerHTML = html; });
  const t = window.setInterval(() => {
    const c = data?.run.closesAt, x = box.querySelector<HTMLElement>("[data-hs-left]");
    if (x && c && !document.hidden) x.textContent = fmt(Math.max(0, c - Date.now()));
  }, 1000);
  return () => { stopW(); clearInterval(t); box.remove(); };
}

registerFormat("hot-seat", { launch, play, run });
