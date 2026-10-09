// /feature-lab/how-it-works (docs/specs/feature-lab.md §8). The shared How it works behaviour (journey, spotlight, BOOMBOT, the roles
// flow), the hero bench filled from one capped read of the visible ideas (an empty bench if it fails), and Try it: a sample idea you can
// vote on and move to Shipped. Try it is local and writes nothing. Reduced motion: no bursts, no vote pop.
import { initHowItWorks, initFlow } from "../../../../shared/ui/how-it-works.js";
import { burst } from "../../../../shared/ui/burst.js";
import { loadCounts } from "./data";
import { STATUS, voteLocked, type Status } from "./status";
import { benchHtml } from "./bench";
import { I } from "./art";
import { sBadge, pBadge, architect, stamp, esc, pop, initialsOf } from "./ui";

const root = document.querySelector<HTMLElement>("[data-flh]");

// ---------- 03 Try it ----------
const TRY: Status[] = ["submitted", "under_review", "planned", "in_progress", "shipped"];
const t = { step: 0, voted: false, votes: 12 };

function tryHtml() {
  const s = TRY[t.step];
  const sample = { status: s, priority: t.step >= 2 ? ("medium" as const) : null };
  const tallyBtn = voteLocked(sample)
    ? `<button type="button" class="bt-tally${t.voted ? " is-active" : ""}" disabled aria-label="${t.votes} votes. Voting is closed">${I.up}<span class="bt-tally-count">${t.votes}</span><span class="bt-tally-label">votes</span></button>`
    : `<button type="button" class="bt-tally${t.voted ? " is-active" : ""}" data-tryvote aria-pressed="${t.voted}" aria-label="${t.voted ? "Remove your vote" : "Vote for this sample idea"}">${I.up}<span class="bt-tally-count">${t.votes}</span><span class="bt-tally-label">votes</span></button>`;
  const hist = TRY.slice(0, t.step + 1).map((k, n) => ({ k, by: n === 0 ? "@you" : "@boomertanger", at: n === 0 ? "Today" : `Day ${n * 3}`, note: k === "planned" ? "Doing it with the next schedule update." : k === "shipped" ? "Live now. Nice one!" : "" })).reverse();
  const history = `<div class="bt-history">${hist.map((h) => `<div class="bt-history-item"><div class="bt-history-line"><span class="bt-history-dot bt-history-dot--${STATUS[h.k].tone}"></span><span class="bt-history-rule"></span></div><div class="bt-history-body"><div><strong style="font-weight:600">${STATUS[h.k].label}</strong> · ${h.by}</div>${h.note ? `<div style="color:var(--bt-text-muted);margin-top:2px">${esc(h.note)}</div>` : ""}<div class="bt-meta">${h.at}</div></div></div>`).join("")}</div>`;
  const next = t.step < 4
    ? `<button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-trynext>Move to ${STATUS[TRY[t.step + 1]].label}</button>`
    : `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-tryreset>Start over</button>`;
  return `<div class="fl-try">
    <div class="bt-card fl-try-card" data-burst><span class="bt-label">A sample idea · nothing here is saved</span>
      <div class="bt-row">${tallyBtn}<div class="bt-row-body"><div class="bt-row-title">Glow-in-the-dark mode for the schedule</div><div class="bt-row-desc">Night view where the doors on /schedule glow like they're lit from inside.</div><div class="bt-row-meta"><span class="bt-avatar">${initialsOf("you")}</span><span>@you</span>${s === "shipped" ? architect(18) : ""}</div></div><div class="bt-row-side"><div class="bt-row-badges">${pBadge(sample.priority)}${sBadge(s)}</div></div></div>
      <div class="fl-try-ctl"><span class="bt-meta">Play admin:</span>${next}</div>
      ${s === "shipped" ? stamp("Shipped", "", "", "lime", "sm") : ""}</div>
    <div class="bt-card fl-try-side"><span class="bt-card-title">History</span>${history}${s === "shipped" ? `<p class="bt-meta fl-try-note">${architect(18)} You'd earn The Architect here.</p>` : `<p class="bt-meta fl-try-note">${t.voted ? "Your vote counts. On a real idea it also counts for Night Shift's Vote on ideas." : "Tap the votes button to vote."}</p>`}</div></div>`;
}
function drawTry() {
  const box = root!.querySelector<HTMLElement>("[data-try]")!;
  box.innerHTML = tryHtml();
}

root?.addEventListener("click", (e) => {
  const el = e.target as Element;
  const box = root.querySelector<HTMLElement>("[data-try]")!;
  if (el.closest("[data-tryvote]")) {
    t.voted = !t.voted; t.votes += t.voted ? 1 : -1;
    drawTry();
    if (t.voted) pop(box.querySelector("[data-tryvote]"));
    box.querySelector<HTMLElement>("[data-tryvote]")?.focus();
    return;
  }
  if (el.closest("[data-trynext]")) {
    t.step = Math.min(4, t.step + 1);
    drawTry();
    if (t.step === 4) burst(box.querySelector<HTMLElement>("[data-burst]"));
    box.querySelector<HTMLElement>("[data-trynext], [data-tryreset]")?.focus();
    return;
  }
  if (el.closest("[data-tryreset]")) {
    t.step = 0;
    drawTry();
    box.querySelector<HTMLElement>("[data-trynext]")?.focus();
  }
});

if (root) {
  initHowItWorks(root);
  root.querySelectorAll<HTMLElement>("[data-flow]").forEach(initFlow);
  const bench = root.querySelector<HTMLElement>("[data-fl-how-bench]")!;
  bench.innerHTML = benchHtml(null, { big: true, button: false });
  void loadCounts().then((c) => { if (c) bench.innerHTML = benchHtml(c, { big: true, button: false }); });
  drawTry();
}
