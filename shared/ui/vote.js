// shared/ui/vote.js — the ballot pieces and the deadline fuse (docs/design-system.md §5 "Scream Planner pieces").
// Text is escaped; arguments ending in Html are trusted markup (coverHtml(...) from cover.js, badges).
//
//   dropHtml(used)                       one blood drop (.bt-drop; is-used = spent)
//   dropsHtml({ used, total = 3 })       .bt-drops, `used` of `total` spent
//   tokensHtml({ used, total = 3, visitor })   .bt-tokens: "2 of 3 votes left" (visitor: "Members get 3 votes a week")
//   voteBtnHtml({ slug, voted, full, visitor })   .bt-vote-btn: Vote | Voted ✓ (is-on, tap again to take it back) |
//                                        No votes left (disabled) | Join to vote (data-join)
//   voteCardHtml({ slug, title, coverHtml, rank, votes, pct, mine, tagHtml, voted, full, visitor })   V1 .bt-vote-card;
//                                        rank 1-3 draws the outlined number; pct (0-100) is the blood meter
//   raceRowHtml({ slug, title, coverHtml, rank, votes, pct, mine, tagHtml, voted, full, visitor })    V2 .bt-race-row
//   voteAddHtml({ row })                 the dashed "Add a game to the ballot" card (row: the wide one for the race)
//   Wrap cards in <div class="bt-vote-grid"> and rows in <div class="bt-race">.
//   initVoteButtons(root, { onVote(slug, wantOn, btn) → false to cancel, onJoin(btn), onAdd(btn) })
//        click on [data-vote] calls onVote with the NEW wish (true = vote, false = take back); the page updates the data
//        and re-renders. A vote that goes on gets a splat burst. Also fires "bt-vote" { detail: { slug, on } }.
//
//   fuseHtml({ steps, progress, left, short })   .bt-fuse: the week's deadlines on a burning fuse
//        steps     [{ n, label, when, state: "done" | "next" | "todo" }] (2 or 3; the third hides on phones)
//        progress  [62, 0]: percent burnt of each line between the steps
//        left      "1d 4h left" over the spark; short: only the first two steps and one line
import { escapeHtml as esc } from "./dom.js";
import { burst } from "./burst.js";

export const dropHtml = (used = false) => `<svg class="bt-drop${used ? " is-used" : ""}" viewBox="0 0 18 22" aria-hidden="true"><path d="M9 1C9 1 2 9.5 2 14a7 7 0 0 0 14 0C16 9.5 9 1 9 1z"/></svg>`;
export const dropsHtml = ({ used = 0, total = 3 } = {}) => `<span class="bt-drops" aria-hidden="true">${Array.from({ length: total }, (_, i) => dropHtml(i < used)).join("")}</span>`;
export function tokensHtml({ used = 0, total = 3, visitor = false } = {}) {
  if (visitor) return `<span class="bt-tokens">Members get <b>${total} votes</b> a week</span>`;
  return `<span class="bt-tokens" role="status">${dropsHtml({ used, total })}<span><b>${total - used} of ${total}</b> votes left</span></span>`;
}

export function voteBtnHtml({ slug = "", voted = false, full = false, visitor = false } = {}) {
  if (visitor) return `<button type="button" class="bt-vote-btn" data-join>Join to vote</button>`;
  const off = full && !voted;
  return `<button type="button" class="bt-vote-btn${voted ? " is-on" : ""}" data-vote="${esc(slug)}" aria-pressed="${voted}"${off ? " disabled" : ""}${voted ? ' title="Tap to take your vote back"' : ""}>${voted ? `${dropHtml()} Voted ✓` : off ? "No votes left" : `${dropHtml()} Vote`}</button>`;
}

export function voteCardHtml({ slug = "", title = "", coverHtml = "", rank = 0, votes = 0, pct = 0, mine = false, tagHtml = "", ...btn } = {}) {
  return `<div class="bt-vote-card${mine ? " is-mine" : ""}" data-slug="${esc(slug)}"><div class="bt-vote-cov">${rank && rank <= 3 ? `<span class="bt-vote-rank" aria-label="Rank ${rank}">${rank}</span>` : ""}${coverHtml}<span class="bt-vote-meter" aria-hidden="true"><i style="--v:${Math.max(0, Math.min(100, pct))}%"></i></span></div>`
    + `<span class="bt-vote-title">${esc(title)}</span><div class="bt-vote-meta"><span class="bt-vote-count">${esc(votes)}<small>votes</small></span>${tagHtml}</div>${voteBtnHtml({ slug, ...btn })}</div>`;
}

export function raceRowHtml({ slug = "", title = "", coverHtml = "", rank = 0, votes = 0, pct = 0, mine = false, tagHtml = "", ...btn } = {}) {
  return `<div class="bt-race-row${mine ? " is-mine" : ""}" data-slug="${esc(slug)}"><span class="bt-race-bar" style="--v:${Math.max(0, Math.min(100, pct))}%"></span><span class="bt-race-rk">${esc(rank)}</span>${coverHtml}`
    + `<span class="bt-race-nm"><b>${esc(title)}</b><span>${tagHtml}</span></span><span class="bt-vote-count">${esc(votes)}<small>votes</small></span>${voteBtnHtml({ slug, ...btn })}</div>`;
}

export const voteAddHtml = ({ row = false } = {}) => `<button type="button" class="bt-vote-add" data-add-game${row ? ' style="flex-direction:row"' : ""}><span class="bt-vote-add-plus" aria-hidden="true">+</span><span><b>Add a game to the ballot</b>${row ? " · " : "<br>"}from the Vault, or add a new one. 2 a week.</span></button>`;

export function initVoteButtons(root = document, { onVote, onJoin, onAdd } = {}) {
  if (root.dataset?.voteReady) return;
  if (root.dataset) root.dataset.voteReady = "";
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-vote], [data-join], [data-add-game]");
    if (!b || !root.contains(b)) return;
    if (b.matches("[data-join]")) { onJoin?.(b); return; }
    if (b.matches("[data-add-game]")) { onAdd?.(b); return; }
    if (b.disabled) return;
    const on = b.getAttribute("aria-pressed") !== "true";
    if (onVote?.(b.dataset.vote, on, b) === false) return;
    if (on) burst(b);
    b.dispatchEvent(new CustomEvent("bt-vote", { bubbles: true, detail: { slug: b.dataset.vote, on } }));
  });
}

export function fuseHtml({ steps = [], progress = [], left = "", short = false } = {}) {
  const list = short ? steps.slice(0, 2) : steps;
  const node = (s, i) => `<div class="bt-fuse-node${s.state ? ` is-${esc(s.state)}` : ""}${i === 2 ? " bt-fuse-node--3" : ""}"><span class="bt-fuse-dot">${s.state === "done" ? "✓" : esc(s.n ?? i + 1)}</span><span>${esc(s.label)}<b>${esc(s.when)}</b></span></div>`;
  const line = (v, i) => `<div class="bt-fuse-line${i === 1 ? " bt-fuse-line--2" : ""}" style="--v:${v}%" aria-hidden="true"><i></i>${v > 0 && v < 100 ? `<span class="bt-fuse-spark"></span>${left ? `<span class="bt-fuse-left">${esc(left)}</span>` : ""}` : ""}</div>`;
  const out = [];
  list.forEach((s, i) => { out.push(node(s, i)); if (i < list.length - 1) out.push(line(progress[i] ?? 0, i)); });
  return `<div class="bt-fuse${short ? " bt-fuse--short" : ""}" role="group" aria-label="This week's deadlines">${out.join("")}</div>`;
}
