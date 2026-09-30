// Tap the Splat end screens (splatter style; docs/specs/arcade-step1.md §1, layout 2
// "Play first", Spooky wording): the card floats on the blood splatter over the
// dimmed play area. No close button: any click that isn't on a button or link
// closes it and collapses the footer (handled in engine.js).
import { submitRun, getVotes, getInfo, vote } from "./game-api.js";
import { dropTool } from "./tools.js";

export const END_GRACE_MS = 2000;

const TITLES = { win: "You survived", missed: "It got away", wrong: "Wrong one", boom: "Boom" };
const LINES = {
  win: "Every trap cleared. 100% complete.",
  missed: "Too slow. It slipped into the dark.",
  wrong: "That wasn't the bloody one. It's still watching.",
  boom: "Should have cut the wire.",
};
const DEVICE = { desktop: "🖥 Desktop", mobile: "📱 Mobile" };

/** 8400 -> "8.4K". */
const fmtCount = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K` : String(n));
// Signed up (verified or not), from <body data-auth-state> (lib/auth.ts).
const isMember = () => ["verified", "unverified"].includes(document.body.dataset.authState);
// Opens the sign-in dialog on the Join tab (scripts/account/ui.ts handles every [data-signin]).
const joinLink = (text) => `<a href="/account" data-signin="join">${text}</a>`;
const boardHref = (device, period) => `/arcade/tap-the-splat/leaderboards?device=${device}${period === "week" ? "&period=week" : ""}`;

/** The placement line for a finishRun answer (members) or a visitor's run. */
function placement(out, device, win) {
  if (!out.recorded) return `This run wasn't recorded.${out.refresh ? " Refresh the page to play the latest version." : ""}`;
  const v = out.version || "v1", r = out.rank || {};
  if (out.onBoard) {
    const week = r.all == null || r.all > 100;
    const board = week ? `this week's ${device} board` : `the ${device} board`;
    return `You placed <b>#${week ? r.week : r.all}</b> on ${board} for <b>${v}</b>. <a href="${boardHref(device, week ? "week" : "all")}">See leaderboard</a>`;
  }
  if (out.personalBest) return `New personal best${r.all ? `: <b>#${r.all}</b> on the ${device} board` : ""}.`;
  switch (out.reason) {
    case null: return `New best this week${r.week ? `: <b>#${r.week}</b> on this week's ${device} board` : ""}.`;   // a weekly best outside the top 100
    case "visitor": return `Finished runs by members go on the leaderboard. ${win ? joinLink("See leaderboard") : ""}`;
    case "unverified": return "Verify your email to get on the board.";
    case "needsSignup": return "Finish signup to get on the board.";
    case "lost": return "Only finished runs get on the leaderboard.";
    case "notBest": return `Not a new personal best this time. <a href="${boardHref(device, "all")}">See leaderboard</a>`;
    default: return "This run can't go on the leaderboard.";   // failed checks, or the boards were reset mid-run
  }
}

const SOON = `<span class="bt-badge bt-badge--gold"><span class="bt-badge-dot"></span>Soon</span>`;
function teaser(member, workshopOpen) {
  return member
    ? `<div class="bt-tease"><span class="bt-tease-ic" aria-hidden="true">🕹</span><span class="bt-tease-txt"><b>More games coming ${SOON}</b><small>You'll play them first.${workshopOpen ? ` Got an idea for v2? <a href="/arcade/tap-the-splat/workshop">Suggest it</a>` : ""}</small></span></div>`
    : `<div class="bt-tease"><span class="bt-tease-ic" aria-hidden="true">🕹</span><span class="bt-tease-txt"><b>More games for members ${SOON}</b><small>Horror point-and-click puzzles, leaderboards and badges. Join free to play them first.</small></span><a class="bt-btn bt-btn--primary bt-btn--sm" href="/account" data-signin="join">Join free</a></div>`;
}

export function showEnd(G, kind) {
  const { S } = G;
  G.clearTimers(); cancelAnimationFrame(S.raf); G.stopClock(); G.hissStop(); dropTool(G);
  G.cards().forEach((c) => c.classList.remove("is-hot"));
  G.phase("over"); G.setA("finish", null);

  // The clock stops at the moment the run ended (a bomb stops it when it blows).
  const secs = S.endAt ?? G.elapsed(), win = kind === "win", dev = S.device, run = S.run;
  const time = G.fmtTime(secs), pct = win ? 100 : Math.min(99, Math.round(S.prog));
  G.$("[data-tm]").textContent = time;

  G.$("[data-end-title]").textContent = TITLES[kind];
  G.$("[data-end-score]").textContent = time;
  G.$("[data-end-sub]").textContent = win ? LINES.win : `${LINES[kind]} You made it ${pct}% of the way.`;
  const pills = G.$("[data-end-pills]");
  const showPills = (v) => {
    pills.innerHTML = `<span>${DEVICE[dev]}</span><span>${v}</span>${win ? `<span>${S.pen ? `+${S.pen}s penalties` : "no miss-clicks"}</span>` : ""}`;
  };
  showPills("v1");

  // Placement, votes and counts wait for finishRun; a run that wasn't recorded gets
  // no votes or placement.
  const place = G.$("[data-end-place]"), fb = G.$("[data-end-fb]"), proof = G.$("[data-end-proof]");
  place.innerHTML = ""; fb.hidden = true; proof.textContent = "";
  G.$$("[data-fb]").forEach((b) => { b.classList.remove("is-done"); b.disabled = false; });
  G.$$("[data-c]").forEach((c) => { c.textContent = ""; });
  const member = isMember();
  G.$("[data-end-tease]").innerHTML = teaser(member, false);
  getInfo().then((info) => { if (S.run === run && info?.version?.workshopOpen) G.$("[data-end-tease]").innerHTML = teaser(member, true); });

  const submitted = submitRun(run, { result: kind, secs: Math.round(secs * 100) / 100, penalties: S.pen, reached: pct, splits: S.splits.slice() });
  Promise.all([submitted, getVotes().catch(() => null)]).then(([out, stats]) => {
    if (S.run !== run || S.phase !== "over") return;   // a new run started meanwhile
    showPills(out.version || "v1");
    place.innerHTML = placement(out, dev, win);
    if (!out.recorded) return;
    fb.hidden = false;
    if (stats) {
      G.$$("[data-c]").forEach((c) => { c.textContent = fmtCount(stats[c.dataset.c] || 0); c.dataset.n = String(stats[c.dataset.c] || 0); });
      proof.textContent = `${fmtCount(stats.runs)} runs · ${fmtCount(stats.finished)} finished`;
    }
  });

  G.setA("end", kind);
  // Grace period: for 2 s the card ignores every click and tap (engine.js), so quick
  // follow-up clicks from the last round can't close it; then its buttons fade in.
  const { root } = G;
  S.endShownAt = performance.now();
  root.classList.remove("is-end-ready");
  G.later(() => root.classList.add("is-end-ready"), END_GRACE_MS);
  const card = G.$(".bt-tts-end");
  G.enable(card, true);
  // Win: the victory fanfare. Lose: the doom organ as the card appears, the only lose
  // sound (the bomb's explosion has already played, about 1 s earlier).
  if (win) setTimeout(G.SFX.victory, 250);
  else G.SFX.doom();
  setTimeout(() => {
    card.scrollIntoView({ block: "center", behavior: G.reduced() ? "auto" : "smooth" });
    card.querySelector("[data-tts-g='again']").focus({ preventScroll: true });
  }, 60);
}

/** A vote button: once per kind per run (locked until the next play), with a local +1. */
export function onFeedback(G, btn) {
  const kind = btn.dataset.fb, run = G.S.run;
  if (!run?.recorded || run.voted[kind]) return;
  btn.classList.add("is-done"); btn.disabled = true;
  const c = btn.querySelector("[data-c]");
  if (c.dataset.n) { c.dataset.n = String(+c.dataset.n + 1); c.textContent = fmtCount(+c.dataset.n); }
  G.SFX.click();
  vote(run, kind);
}
