// Tap the Splat end screens (splatter style): the card floats on the blood
// splatter over the dimmed play area. No close button: any click that isn't on
// a button or link closes it and collapses the footer (handled in engine.js).
import { getBoard, submitRun, getVotes, vote } from "./game-api.js";
import { dropTool } from "./tools.js";

const VOTES_KEY = "bt-tts-votes";
const readVotes = () => { try { return JSON.parse(localStorage.getItem(VOTES_KEY)) || {}; } catch { return {}; } };
const saveVotes = (v) => { try { localStorage.setItem(VOTES_KEY, JSON.stringify(v)); } catch { /* not saved */ } };

// Opens the sign-in dialog (scripts/account/ui.ts handles every [data-signin]).
export const END_GRACE_MS = 2000;

const JOIN = `<a class="bt-btn bt-btn--primary bt-btn--sm" href="/account" data-signin="join">Join free to get on the leaderboard</a>`;

export function showEnd(G, kind, title = "", sub = "") {
  const { S } = G;
  G.clearTimers(); cancelAnimationFrame(S.raf); G.stopClock(); G.hissStop(); dropTool(G);
  G.cards().forEach((c) => c.classList.remove("is-hot"));
  G.phase("over"); G.setA("finish", null);

  // The clock stops at the moment the run ended (a bomb stops it when it blows).
  const secs = S.endAt ?? G.elapsed(), win = kind === "win", dev = S.device;
  const member = document.body.dataset.auth !== "visitor";
  const time = G.fmtTime(secs);
  G.$("[data-tm]").textContent = time;

  G.$("[data-end-title]").textContent = win ? "You beat Tap the Splat" : title;
  G.$("[data-end-score]").textContent = time;
  G.$("[data-end-sub]").innerHTML = win
    ? `100% complete · ${S.pen ? `includes ${S.pen}s of miss-click penalties` : "no miss-clicks"}<br><span class="bt-tts-end-dev">${dev === "mobile" ? "📱 Mobile" : "🖥 Desktop"} run</span>`
    : `${sub} You made it ${Math.round(S.prog)}% of the way.`;

  const place = G.$("[data-end-place]");
  place.innerHTML = win
    ? (member ? "" : `<div class="bt-tts-end-note">Completed runs by members make the leaderboard.</div>${JOIN}`)
    : `<div class="bt-tts-end-note">Only completed runs make the leaderboard.</div>${member ? "" : JOIN}`;
  if (win && member) {
    getBoard(dev).then((board) => {
      if (!board || S.phase !== "over") return;
      const rank = board.rows.filter((r) => r.secs < secs).length + 1;
      place.innerHTML = (rank <= 10 ? `You placed <b>#${rank}</b> on the ${dev} leaderboard.` : "Not quite top 10. Go again!")
        + (board.preview ? ` <span class="bt-tts-end-preview">Preview data</span>` : "");
    });
  }
  submitRun({ device: dev, secs, penalties: S.pen, completed: win, reached: Math.round(S.prog) });

  // Feedback buttons: once per person (remembered in this browser); totals only
  // where there are any (PREVIEW DATA on staging, none in production yet).
  const done = readVotes();
  G.$$("[data-fb]").forEach((b) => b.classList.toggle("is-done", !!done[b.dataset.fb]));
  getVotes().then((v) => G.$$("[data-c]").forEach((c) => { c.textContent = v ? String(v[c.dataset.c] + (done[c.dataset.c] ? 1 : 0)) : ""; }));

  G.setA("end", kind);
  // Grace period: for 2 s the card ignores every click and tap (engine.js), so quick
  // follow-up clicks from the last round can't close it; then its buttons fade in.
  const { root } = G;
  S.endShownAt = performance.now();
  root.classList.remove("is-end-ready");
  G.later(() => root.classList.add("is-end-ready"), END_GRACE_MS);
  const card = G.$(".bt-tts-end");
  G.enable(card, true);
  if (win) setTimeout(G.SFX.victory, 250);
  setTimeout(() => {
    card.scrollIntoView({ block: "center", behavior: G.reduced() ? "auto" : "smooth" });
    card.querySelector("[data-tts-g='again']").focus({ preventScroll: true });
  }, 60);
}

export function onFeedback(G, btn) {
  const kind = btn.dataset.fb, done = readVotes();
  if (done[kind]) return;
  done[kind] = true; saveVotes(done);
  btn.classList.add("is-done");
  const c = btn.querySelector("[data-c]");
  if (c.textContent) c.textContent = String(+c.textContent + 1);
  G.SFX.click();
  vote(kind);
}
