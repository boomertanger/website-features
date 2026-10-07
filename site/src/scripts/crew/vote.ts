// /crew/vote: the Fan Favourite ballot. Open in the last 5 days of the month (the server decides: opensOn and
// closesOn come from fanFavouriteBallot). One vote, confirmed with confirmAction, and no tally is ever shown
// before the vote closes. Visitors can't call the ballot, so they get the dates worked out here and a Join free
// prompt. Sample data under ?as= (non-production).
import { onAccess } from "./layout";
import { esc, loadBallot, errText, dayLabel, isPreview, reasonText, voteOpensOn, who, type Ballot } from "./public";
import { crewCall } from "./api";
import { crewCardHtml } from "../../../../shared/ui/crew.js";
import { confirmAction } from "../../../../shared/ui/confirm.js";
import { MM_ICON } from "../../../../shared/ui/mod-machina.js";
import type { AuthState } from "../../lib/auth";

const root = document.querySelector<HTMLElement>("[data-cp-vote]")!;
const body = root.querySelector<HTMLElement>("[data-cp-body]")!;
let me: AuthState;
let ballot: Ballot;
let order: string[] = [];

const art = `<span class="cp-art" aria-hidden="true">${MM_ICON}</span>`;
const done = () => { root.removeAttribute("aria-busy"); };

onAccess(async (s) => {
  me = s;
  if (s.status === "signedOut") return visitor();
  if (s.status === "needsSignup") {
    done();
    body.innerHTML = `<div class="bt-card cp-apply-card"><span class="bt-card-title">Finish signing up first</span><p>Your account needs a few more details before you can vote.</p><div class="cp-acts"><button type="button" class="bt-btn bt-btn--primary" data-signin="signup">Finish signup</button></div></div>`;
    return;
  }
  try {
    ballot = await loadBallot(s);
    order = shuffle(ballot.candidates.map((c) => c.uid));
    render();
  } catch (err) {
    done();
    body.innerHTML = `<div class="bt-notice bt-notice--error">${esc(errText(err, "The ballot didn't load. Refresh the page to try again."))}</div>`;
  }
});

const shuffle = <T,>(a: T[]) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

function visitor() {
  done();
  const opens = voteOpensOn();
  const open = localToday() >= opens;
  body.innerHTML = `<div class="bt-tile cp-vote-state">${art}<h2 class="bt-heading">${open ? "Voting is open" : `Voting opens on ${esc(dayLabel(opens))}`}</h2>
    <p>${open ? "Members choose this month's Fan Favourite until the end of the month." : "Members choose the Fan Favourite in the last 5 days of every month."} Voting is for members with an account, so everyone gets one fair vote.</p>
    <div class="cp-acts"><a class="bt-btn bt-btn--primary" href="/account" data-signin="join" data-signin-title="Join to vote for the Fan Favourite">Join free</a><a class="bt-btn bt-btn--secondary" href="/account" data-signin="signin">Log in</a></div></div>`;
}
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function candHtml(c: Ballot["candidates"][number], can: boolean, mine: boolean) {
  const w = who({ handle: c.handle, grade: c.grade });
  const card = crewCardHtml({ name: w.name, href: w.href, gradeHtml: w.gradeHtml, meta: mine ? "Your vote" : "" });
  const btn = can ? `<button type="button" class="bt-btn bt-btn--secondary" data-vote="${esc(c.uid)}" aria-label="Vote for ${esc(w.name)}">Vote</button>` : mine ? `<span class="bt-badge bt-badge--lime">Your vote</span>` : "";
  return `<div class="cp-cand${mine ? " is-mine" : ""}">${card}${btn}</div>`;
}

function render() {
  done();
  const b = ballot;
  if (!b.open) {
    body.innerHTML = `<div class="bt-tile cp-vote-state">${art}<h2 class="bt-heading">Voting opens on ${esc(dayLabel(b.opensOn))}</h2>
      <p>Members choose the Fan Favourite in the last 5 days of every month. Come back then to vote, and the winner is announced on the 1st. In the meantime you can <a href="/crew">meet the crew</a>.</p></div>`;
    return;
  }
  const byUid = new Map(b.candidates.map((c) => [c.uid, c]));
  const mineC = b.myVote ? byUid.get(b.myVote) : null;
  let notice = "";
  if (b.reason === "voted") notice = `<div class="bt-notice bt-notice--ok" role="status">You voted for <b>${mineC?.handle ? `@${esc(mineC.handle)}` : "your pick"}</b>. Thank you! Results stay secret until voting closes, and the winner is announced on the 1st.</div>`;
  else if (!b.canVote) notice = `<div class="bt-notice" role="status">${esc(reasonText(b.reason) || "You can't vote this month.")}${b.reason === "tooNew" ? " Accounts need to be 14 days old to vote." : b.reason === "needsCheckin" ? " A daily check-in on the site counts." : ""}</div>`;
  const list = order.map((u) => byUid.get(u)!).filter(Boolean);
  body.innerHTML = `${notice}<div class="cp-vote-head"><h2 class="bt-heading">On the ballot</h2><span class="bt-meta">Voting closes ${esc(dayLabel(b.closesOn))} · ${list.length} ${list.length === 1 ? "mod" : "mods"}</span></div>
    ${list.length ? `<div class="bt-roster cp-ballot">${list.map((c) => candHtml(c, b.canVote, c.uid === b.myVote)).join("")}</div>` : `<div class="bt-tile bt-board-card"><div class="bt-board-empty"><span class="cp-art" aria-hidden="true">${MM_ICON}</span><b>No one is on the ballot yet</b><span>Mods who have been active this month appear here.</span></div></div>`}`;
}

body.addEventListener("click", async (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-vote]");
  if (!btn) return;
  const uid = btn.dataset.vote!;
  const c = ballot.candidates.find((x) => x.uid === uid);
  const name = c?.handle ? `@${c.handle}` : "this mod";
  await confirmAction({
    title: `Vote for ${name}?`,
    message: `You get one vote this month and you can't change it. ${name} won't see who voted for them.`,
    confirmLabel: "Vote", busyLabel: "Voting…", danger: false, feature: "crew-vote",
    onConfirm: async () => {
      if (isPreview(me)) { ballot = { ...ballot, canVote: false, reason: "voted", myVote: uid }; render(); return; }
      try {
        await crewCall("fanFavouriteVote", { uid });
      } catch (err) {
        if ((err as { details?: { reason?: string } })?.details?.reason === "voted") { ballot = await loadBallot(me); render(); }
        throw new Error(errText(err, "Your vote didn't go through. Try again."));
      }
      ballot = await loadBallot(me);
      render();
    },
  });
});
