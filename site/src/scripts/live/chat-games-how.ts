// /live/chat-games (docs/specs/chat-games.md §14a; Chat Games part 6). The shared How it works behaviour (the journey, the stage cards' spotlight,
// BOOMBOT's chat, the flip medals) plus the page's own:
//   the Live wall   a tap on the phone's Play panel, the split on stream, then +3 XP, looping; under reduced motion one still frame with the split
//                   and +3 XP showing
//   Try it          Questions (ask up to 3, vote, take a vote back), Hot Seat (a .bt-seance draw, I'm in, answer, vote, reveal), Would You Rather
//                   (vote, change, reveal, next prompt), Predictions (pick, lock with +3 XP, a mod calls it or it's void, the Captain confirms). All
//                   local: no Firestore, no callables, nothing kept after a reload. The rules they show are the as-built ones (spec §4 to §7, §11).
//   the closing     by state: live (public/live through the shared listener: the game that's on), visitor (Join free / Sign in), member off air
//                   (the next stream's day and time from the Scream Planner's published schedule). Both are public reads.
import { initHowItWorks } from "../../../../shared/ui/how-it-works.js";
import { initFlipCards } from "../../../../shared/ui/flip-card.js";
import { qcardHtml, initQcards } from "../../../../shared/ui/qcard.js";
import { seanceHtml, seanceDraw } from "../../../../shared/ui/seance.js";
import { choicesHtml } from "../../../../shared/ui/choice.js";
import { burst } from "../../../../shared/ui/burst.js";
import { boombotIcon } from "../../../../shared/ui/arcade.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { onLive, startLiveWhenIdle } from "../../lib/live";
import { loadNextStream } from "../../lib/next-stream";
import { onAuth } from "../../lib/auth";

const root = document.querySelector<HTMLElement>("[data-cgh]");
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const pop = (el: Element | null, n = 22) => { if (el && !reduced()) burst(el as HTMLElement, { n }); };
let bbId = 0;
const bb = () => boombotIcon(`cgh-bb-x${++bbId}`);
const steps = (list: [string, string][], now: string) => {
  const at = list.findIndex(([k]) => k === now);
  return `<ol class="cgh-steps" aria-label="Steps">${list.map(([, n], i) => `<li class="${i === at ? "is-now" : i < at ? "is-done" : ""}"${i === at ? ' aria-current="step"' : ""}>${n}</li>`).join("")}</ol>`;
};
const tryHead = (hint: string, extra = "") => `<div class="cgh-try-h"><span class="cgh-tag">Try it</span><span class="cgh-hint">${hint}</span><span class="cgh-sp"></span>${extra}</div>`;
/** Draws a Try it frame and keeps focus on the same control (by its data-key) across the redraw. */
function paint(box: HTMLElement, html: string) {
  const key = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-key]")?.dataset.key;
  box.innerHTML = html;
  if (key && box.contains(document.activeElement) === false) box.querySelector<HTMLElement>(`[data-key="${key}"]`)?.focus();
}

/* ---------- the Live wall ---------- */
function liveWall() {
  const wall = root?.querySelector<HTMLElement>("[data-cgh-wall]");
  if (!wall) return;
  const q = <T extends HTMLElement>(s: string) => wall.querySelector<T>(s)!;
  const split = () => {
    ([["a", 58], ["b", 42]] as const).forEach(([k, p]) => { q(`[data-tv="${k}"] i`).style.width = `${p}%`; q(`[data-tvp="${k}"]`).textContent = `${p}%`; });
    q('[data-tv="a"]').classList.add("is-win");
  };
  if (reduced()) { q('[data-ph="a"]').classList.add("is-tap"); split(); q(".cgh-xp").classList.add("is-on"); return; }
  let timer = 0;
  const step = (n: number) => {
    if (!wall.isConnected) return;
    if (n === 0) {
      wall.querySelectorAll("[data-ph]").forEach((b) => b.classList.remove("is-tap"));
      wall.querySelectorAll<HTMLElement>("[data-tv]").forEach((c) => { c.classList.remove("is-win"); c.querySelector<HTMLElement>("i")!.style.width = "0"; });
      wall.querySelectorAll("[data-tvp]").forEach((e) => { e.textContent = ""; });
      q(".cgh-xp").classList.remove("is-on"); q(".cgh-tap").classList.remove("is-on");
    }
    if (n === 1) {
      const b = q('[data-ph="a"]'), sc = wall.getBoundingClientRect(), r = b.getBoundingClientRect(), t = q(".cgh-tap");
      t.style.left = `${r.left - sc.left + r.width / 2 - 13}px`; t.style.top = `${r.top - sc.top + r.height / 2 - 13}px`;
      t.classList.add("is-on"); b.classList.add("is-tap");
    }
    if (n === 2) { q(".cgh-tap").classList.remove("is-on"); split(); }
    if (n === 3) q(".cgh-xp").classList.add("is-on");
    timer = window.setTimeout(() => step((n + 1) % 5), n === 4 ? 600 : n === 3 ? 2200 : 1400);
  };
  // run only while the hero is on screen
  new IntersectionObserver(([e]) => { clearTimeout(timer); if (e.isIntersecting) step(0); }).observe(wall);
}

/* ---------- 02 Questions ---------- */
interface Q { id: string; text: string; handle: string; votes: number; voted: boolean; mine: boolean }
function questions() {
  const box = root?.querySelector<HTMLElement>('[data-try="questions"]');
  if (!box) return;
  let n = 0;
  const list: Q[] = [
    { id: "q1", text: "If you could delete one horror trope forever, which one?", handle: "mothgirl", votes: 23, voted: false, mine: false },
    { id: "q2", text: "What game scared you most as a kid?", handle: "deadbolt", votes: 17, voted: false, mine: false },
    { id: "q3", text: "Would you ever play a horror game in VR on stream?", handle: "lanternjack", votes: 9, voted: false, mine: false },
  ];
  const ta = box.querySelector<HTMLTextAreaElement>("#cgh-qa")!, askBtn = box.querySelector<HTMLButtonElement>("[data-q-ask]")!;
  const draw = () => {
    const open = list.filter((x) => x.mine).length;
    box.querySelector("[data-q-open]")!.textContent = `${open} of 3 open`;
    box.querySelector<HTMLElement>("[data-q-full]")!.hidden = open < 3;
    askBtn.disabled = open >= 3;
    box.querySelector("[data-q-list]")!.innerHTML = [...list].sort((a, b) => b.votes - a.votes).map((x) => qcardHtml({ id: x.id, text: x.text, handle: x.handle, ago: x.mine ? "just now" : "tonight", votes: x.votes, voted: x.voted, canVote: !x.mine, mine: x.mine, state: "tonight", isNew: x.mine && x.id === `m${n}` })).join("");
  };
  ta.addEventListener("input", () => { box.querySelector("[data-q-count]")!.textContent = String(ta.value.length); });
  askBtn.addEventListener("click", () => {
    const text = ta.value.trim();
    if (!text) { ta.focus(); return; }
    if (list.filter((x) => x.mine).length >= 3) return;
    list.push({ id: `m${++n}`, text, handle: "you", votes: 0, voted: false, mine: true });
    ta.value = ""; box.querySelector("[data-q-count]")!.textContent = "0";
    draw();
  });
  initQcards(box as unknown as Document, { onVote: (id: string, on: boolean) => { const x = list.find((y) => y.id === id); if (x) { x.voted = on; x.votes += on ? 1 : -1; } draw(); } });
  draw();
}

/* ---------- 03 Hot Seat ---------- */
function hotSeat() {
  const box = root?.querySelector<HTMLElement>('[data-try="hot-seat"]');
  if (!box) return;
  const POOL = ["gbo", "nyx", "mothgirl", "deadbolt", "lanternjack", "crypt_kid", "you", "fogbank"];
  const PICKS = [{ handle: "lanternjack", status: "picked" }, { handle: "you", status: "picked" }, { handle: "mothgirl", status: "picked" }];
  const OTHERS: Record<string, string> = { lanternjack: "Inside the monster's laundry basket", mothgirl: "Behind the only other survivor" };
  const ST: [string, string][] = [["draw", "Pick"], ["in", "I'm in"], ["answer", "Answer"], ["vote", "Vote"], ["reveal", "Reveal"]];
  const S = { step: "draw", drawn: false, drawing: false, ans: "", vote: null as number | null };
  let stop = () => {};
  const card = `<div class="cgh-card-q"><small>Hot Seat card</small>What's the worst place to hide from a monster?</div>`;
  const draw = () => {
    stop();
    let body = "";
    if (S.step === "draw" || S.step === "in") {
      const seats = PICKS.map((p) => `<div class="cgh-seat${S.drawn ? " is-in" : ""}${p.handle === "you" && S.drawn ? " is-you" : ""}">@${S.drawn ? esc(p.handle) : "?"}<small>${S.drawn ? (p.handle === "you" ? "that's you" : "tapped I'm in") : "waiting"}</small></div>`).join("");
      body = `<div class="cgh-seance" data-hs-board>${seanceHtml({ names: POOL, picks: PICKS, state: S.drawn ? "landed" : "idle" })}</div><div class="cgh-seats">${seats}</div>`
        + (S.step === "draw"
          ? `<div class="cgh-acts cgh-acts--center"><button type="button" class="bt-btn bt-btn--primary" data-key="hs-draw" data-hs="draw"${S.drawing ? " disabled" : ""}>Draw three players</button></div>`
          : `<div class="cgh-say">${bb()}<p>You're in the Hot Seat! In a real game you get 15 seconds to tap I'm in, or someone else takes your seat.</p></div><div class="cgh-acts cgh-acts--center"><button type="button" class="bt-btn bt-btn--primary" data-key="hs-in" data-hs="in">I'm in</button></div>`);
    }
    if (S.step === "answer") {
      body = `${card}<div class="bt-field"><label class="bt-label" for="cgh-hsa">Your answer (60 seconds in a real game)</label><input class="bt-input" id="cgh-hsa" maxlength="140" placeholder="Make chat laugh" value="${esc(S.ans)}"><span class="bt-hint"><span class="cgh-count" data-hs-n>${S.ans.length}</span> / 140</span></div>`
        + `<div class="cgh-acts"><button type="button" class="bt-btn bt-btn--primary" data-key="hs-send" data-hs="send">Send answer</button></div>`;
    }
    if (S.step === "vote" || S.step === "reveal") {
      const rev = S.step === "reveal";
      const rows = [["lanternjack", OTHERS.lanternjack, 12], ["you", S.ans || "In the safe room, obviously", 16], ["mothgirl", OTHERS.mothgirl, 9]] as const;
      const counts = rows.map(([, , v], i) => v + (S.vote === i ? 1 : 0)), total = counts.reduce((a, b) => a + b, 0);
      const top = Math.max(...counts), winners = counts.map((c, i) => (c === top ? i : -1)).filter((i) => i >= 0);
      body = `${card}${choicesHtml({ options: rows.map(([, a]) => a), state: rev ? "revealed" : "open", pick: S.vote, pct: rev ? counts.map((c) => Math.round((c / total) * 100)) : null, counts: rev ? counts : null, winners: rev ? winners : null, name: "Vote for the best answer", unit: "vote", mark: winners.length > 1 ? "a winner (tie)" : "the winner", mineLabel: "✓ Your vote" })}`
        + (rev
          ? `<div class="cgh-win" data-hs-win>${winners.includes(1) ? `<h3>You won the round</h3><div class="cgh-xp"><span class="bt-badge bt-badge--gold">+25 XP</span><span class="bt-badge bt-badge--gray">Other players +5</span></div>` : `<p>Not this time.</p><div class="cgh-xp"><span class="bt-badge bt-badge--gold">+5 XP for playing</span></div>`}<p>${rows.map(([h], i) => `@${esc(h)} ${counts[i]}`).join(" · ")}</p><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-key="hs-again" data-hs="again">Play again</button></div>`
          : `<div class="cgh-acts"><button type="button" class="bt-btn bt-btn--primary" data-key="hs-reveal" data-hs="reveal"${S.vote === null ? " disabled" : ""}>Reveal</button><span class="cgh-note">${S.vote === null ? "Pick the best answer that isn't yours." : "In a real game, everyone checked in this beat votes for 30 seconds, the players too."}</span></div>`);
    }
    paint(box, `${tryHead("A full round, sped up.")}<div class="cgh-play">${steps(ST, S.step)}${body}</div>`);
    // your own answer can't be voted for
    if (S.step === "vote") {
      const mine = box.querySelector<HTMLButtonElement>('[data-choice="1"]');
      if (mine) { mine.disabled = true; mine.insertAdjacentHTML("beforeend", `<small class="bt-choice-meta">Your answer: you can't vote for it</small>`); }
    }
    if (S.step === "reveal") pop(box.querySelector("[data-hs-win]"), 26);
  };
  box.addEventListener("input", (e) => { const i = (e.target as Element).closest<HTMLInputElement>("#cgh-hsa"); if (i) { S.ans = i.value; box.querySelector("[data-hs-n]")!.textContent = String(i.value.length); } });
  box.addEventListener("click", (e) => {
    const t = e.target as Element;
    const c = t.closest<HTMLButtonElement>("[data-choice]");
    if (c && !c.disabled && S.step === "vote") { S.vote = Number(c.dataset.choice); draw(); return; }
    const b = t.closest<HTMLButtonElement>("[data-hs]");
    if (!b || b.disabled) return;
    const a = b.dataset.hs;
    if (a === "draw") {
      S.drawing = true;
      draw();
      const board = box.querySelector<HTMLElement>("[data-hs-board]")!;
      stop = seanceDraw(board, { picks: PICKS, step: 700, onDone: () => { S.drawing = false; S.drawn = true; S.step = "in"; draw(); box.querySelector<HTMLElement>('[data-hs="in"]')?.focus(); } });
      return;
    }
    if (a === "in") { S.step = "answer"; draw(); box.querySelector<HTMLInputElement>("#cgh-hsa")?.focus(); return; }
    if (a === "send") { if (!S.ans.trim()) { box.querySelector<HTMLInputElement>("#cgh-hsa")?.focus(); return; } S.step = "vote"; draw(); return; }
    if (a === "reveal") { S.step = "reveal"; draw(); return; }
    if (a === "again") { Object.assign(S, { step: "draw", drawn: false, drawing: false, ans: "", vote: null }); draw(); }
  });
  draw();
}

/* ---------- 04 Would You Rather ---------- */
function wyr() {
  const box = root?.querySelector<HTMLElement>('[data-try="wyr"]');
  if (!box) return;
  const P = [{ o: ["Hide in a locker while something breathes outside", "Crawl a vent you can't turn around in"], base: [77, 55] }, { o: ["Always hear footsteps behind you", "Never see your own reflection again"], base: [49, 51] }];
  const S = { i: 0, my: null as number | null, rev: false };
  const draw = () => {
    const p = P[S.i], counts = p.base.map((n, k) => n + (S.my === k ? 1 : 0)), total = counts[0] + counts[1];
    const pct = counts.map((c) => Math.round((c / total) * 100)), lead = counts[0] >= counts[1] ? 0 : 1;
    const body = `<p class="cgh-lead">Would you rather…</p>${choicesHtml({ options: p.o, two: true, state: S.rev ? "revealed" : "open", pick: S.my, pct: S.rev ? pct : null, winners: S.rev ? [lead] : null, name: "Would you rather" })}`
      + (S.rev
        ? `<div class="cgh-win" data-wy-win><p>${pct[lead]}% chose “${esc(p.o[lead])}” · ${total} votes</p>${S.my !== null ? `<div class="cgh-xp"><span class="bt-badge bt-badge--gold">+3 XP</span>${S.my === lead ? `<span class="bt-badge bt-badge--lime">With the crowd</span>` : `<span class="bt-badge bt-badge--pink">Brave minority</span>`}</div>` : ""}<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-key="wy-next" data-wy="next">Next prompt</button></div>`
        : `<div class="cgh-acts cgh-acts--center"><button type="button" class="bt-btn bt-btn--primary" data-key="wy-rev" data-wy="reveal"${S.my === null ? " disabled" : ""}>Reveal</button><span class="cgh-note">${S.my === null ? "Pick one first." : "Change your mind if you like. In a real game the timer reveals it."}</span></div>`);
    paint(box, `${tryHead("Vote, change your mind, then reveal.")}<div class="cgh-play">${body}</div>`);
    if (S.rev && S.my !== null) pop(box.querySelector("[data-wy-win]"), 16);
  };
  box.addEventListener("click", (e) => {
    const t = e.target as Element;
    const c = t.closest<HTMLButtonElement>("[data-choice]");
    if (c && !c.disabled) { S.my = Number(c.dataset.choice); draw(); box.querySelector<HTMLElement>(`[data-choice="${S.my}"]`)?.focus(); return; }
    const b = t.closest<HTMLButtonElement>("[data-wy]");
    if (!b || b.disabled) return;
    if (b.dataset.wy === "reveal") { S.rev = true; draw(); }
    else { S.i = (S.i + 1) % P.length; S.my = null; S.rev = false; draw(); box.querySelector<HTMLElement>('[data-choice="0"]')?.focus(); }
  });
  draw();
}

/* ---------- 05 Predictions ---------- */
function predictions() {
  const box = root?.querySelector<HTMLElement>('[data-try="predictions"]');
  if (!box) return;
  const OPTS = ["Yes, before the save room", "No, he makes it", "He dies AT the save room"];
  const ST: [string, string][] = [["open", "Pick"], ["locked", "Locked"], ["called", "A mod calls it"], ["result", "Result"]];
  const S = { step: "open", my: null as number | null };
  const draw = () => {
    const counts = [61, 44, 23].map((c, i) => c + (S.my === i ? 1 : 0)), total = counts.reduce((a, b) => a + b, 0);
    const pct = counts.map((c) => Math.round((c / total) * 100));
    const shown = S.step !== "open";
    const state = S.step === "open" ? "open" : S.step === "result" ? "result" : S.step === "void" ? "void" : "locked";
    let act = "";
    if (S.step === "open") act = `<div class="cgh-acts"><button type="button" class="bt-btn bt-btn--primary" data-key="pr-lock" data-pr="lock"${S.my === null ? " disabled" : ""}>Lock it (the Captain does this)</button><span class="cgh-note">${S.my === null ? "Pick an answer first." : "You can change your pick until it locks."}</span></div>`;
    if (S.step === "locked") act = `<div class="cgh-say">${bb()}<p>Locked! Your pick is in and you earned 3 XP. It's yours to keep, whatever happens next. Now we wait for it to happen on screen…</p></div>`
      + `<div class="cgh-acts"><button type="button" class="bt-btn bt-btn--primary" data-key="pr-call" data-pr="call">Fast-forward: it happens</button><button type="button" class="bt-btn bt-btn--secondary" data-key="pr-void" data-pr="void">It never happens</button></div>`;
    if (S.step === "called") act = `<div class="cgh-proposal"><p><b>@nyx</b> (a mod on duty) says it happened: <b>${esc(OPTS[0])}</b></p><p>The Captain confirms before the +10 goes out.</p></div><div class="cgh-acts"><button type="button" class="bt-btn bt-btn--primary" data-key="pr-conf" data-pr="confirm">Captain confirms</button></div>`;
    if (S.step === "result") act = `<div class="cgh-win" data-pr-win>${S.my === 0 ? `<h3>You called it</h3><div class="cgh-xp"><span class="bt-badge bt-badge--gold">+3 XP at the lock</span><span class="bt-badge bt-badge--gold">+10 XP</span></div>` : `<p>Not this time. You keep the 3 XP for your pick.</p>`}<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-key="pr-again" data-pr="again">Try again</button></div>`;
    if (S.step === "void") act = `<div class="cgh-win"><p>Void: it didn't happen this stream, so nobody gets the +10. You keep the 3 XP for your pick.</p><div class="cgh-xp"><span class="bt-badge bt-badge--gold">+3 XP kept</span></div><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-key="pr-again" data-pr="again">Try again</button></div>`;
    const body = `${steps(ST, S.step === "void" ? "result" : S.step)}<div class="cgh-card-q"><small>Prediction</small>Does Boomer die before the first save room?</div>`
      + choicesHtml({ options: OPTS, state, pick: S.my, pct: shown ? pct : null, counts: shown ? counts : null, correct: S.step === "result" ? 0 : null, name: "Your prediction" }) + act;
    paint(box, `${tryHead("Pick, lock, and see who called it.")}<div class="cgh-play">${body}</div>`);
    if (S.step === "result" && S.my === 0) pop(box.querySelector("[data-pr-win]"), 26);
  };
  box.addEventListener("click", (e) => {
    const t = e.target as Element;
    const c = t.closest<HTMLButtonElement>("[data-choice]");
    if (c && !c.disabled && S.step === "open") { S.my = Number(c.dataset.choice); draw(); box.querySelector<HTMLElement>(`[data-choice="${S.my}"]`)?.focus(); return; }
    const b = t.closest<HTMLButtonElement>("[data-pr]");
    if (!b || b.disabled) return;
    const a = b.dataset.pr;
    S.step = a === "lock" ? "locked" : a === "call" ? "called" : a === "confirm" ? "result" : a === "void" ? "void" : "open";
    if (a === "again") S.my = null;
    draw();
    if (a === "again") box.querySelector<HTMLElement>('[data-choice="0"]')?.focus();
  });
  draw();
}

/* ---------- the closing, by state ---------- */
function closing() {
  if (!root) return;
  onLive((p) => {
    const g = p.chatGame;
    const line = root.querySelector<HTMLElement>("[data-cgh-livegame]");
    if (line) line.textContent = g ? `${g.title || "A Chat Game"} is running. Jump in from the Play panel.` : "Jump in from the Play panel on /live. The Captain calls games at the breaks.";
  });
  startLiveWhenIdle();
  let asked = false;
  // members only (the visitor's closing has no time in it); the body's data-auth also covers the staging preview (?as=member)
  onAuth((s) => {
    if (asked || s.status === "loading" || document.body.dataset.auth === "visitor") return;
    asked = true;
    void loadNextStream().then((n) => {
      const h = root.querySelector<HTMLElement>("[data-cgh-next-h]"), p = root.querySelector<HTMLElement>("[data-cgh-next-p]");
      if (!n || !h || !p) return;
      const when = new Date(n.start).toLocaleString(undefined, { weekday: "long", hour: "numeric", minute: "2-digit" });
      h.textContent = `The next games start ${when}`;
      p.textContent = `${n.title}. The Captain calls the first game soon after Start. Ask a question now and it waits for the next session.`;
    }, () => {});
  });
}

if (root) {
  initHowItWorks(root as unknown as Document);
  initFlipCards(root as unknown as Document);
  liveWall();
  questions();
  hotSeat();
  wyr();
  predictions();
  closing();
  // this page isn't one of the Live bar's three tabs
  document.querySelectorAll<HTMLAnchorElement>("[data-lp-nav]").forEach((a) => a.removeAttribute("aria-current"));
}
