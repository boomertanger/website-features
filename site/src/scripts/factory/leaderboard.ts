// /shift/leaderboard (docs/specs/fun-factory.md §8). Reads after sign-in: the public summary (which season),
// the chosen board (boards/{all|sub|crew}, top 100, written by factoryTick), the member's standing and, past
// the top 100 of All, a count of who's ahead. Admins race too, with a Staff tag (members get the prizes); under a
// season's staffRace "separate" they're on a Staff board instead. The Boss marker comes from the board doc. Off-season
// it shows the last season's final board with the top 3's trophies (factoryTick's finalize, rewards.md §7).
import { onAccess } from "./layout";
import { SHIFT_ICON } from "./art";
import { messageFor } from "../../lib/errors";
import type { AuthState } from "../../lib/auth";
import * as D from "./member-data";
import type { Board, BoardRow, Summary } from "./member-data";
import { fmtDay } from "./api";
import { timerHtml, initTimers } from "../../../../shared/ui/countdown.js";
import { medalHtml } from "../../../../shared/ui/medal.js";
import { escapeHtml } from "../../../../shared/ui/dom.js";

type BoardId = "all" | "sub" | "crew" | "staff";
const esc = (v: unknown) => escapeHtml(String(v ?? ""));
const root = document.querySelector<HTMLElement>("[data-ff-lb]")!;
const BASE_BOARDS: [BoardId, string][] = [["all", "All"], ["sub", "Sub Club"], ["crew", "Crew"]];
let hasStaff = false;   // the season keeps staff on their own board (staffRace "separate")
const boardList = (): [BoardId, string][] => (hasStaff ? [...BASE_BOARDS, ["staff", "Staff"]] : BASE_BOARDS);
/** Is this standing on that board? Admins race on all and crew (together) or only on staff (separate). */
const onBoardOf = (st: BoardRow | null, id: BoardId) => !!st && (id === "staff" ? st.roleTag === "admin" : st.roleTag === "admin" && hasStaff ? false : id === "all" || st.tier === id);
const TROPHIES = [{ place: "1st", xp: 150 }, { place: "2nd", xp: 100 }, { place: "3rd", xp: 75 }];
const PAGE = 25;
const num = (n: number) => (n || 0).toLocaleString("en-US");
const sn = (n: number | null | undefined) => String(n ?? 0).padStart(2, "0");

let me: AuthState;
let season: { id: string; name: string; number: number | null; ended: boolean; endsAt: number | null; endedAt: number | null };
let board: BoardId = "all";
let shown = PAGE;
const boards = new Map<BoardId, Board>();
let standing: BoardRow | null = null;
const ranks = new Map<BoardId, number | null>();

onAccess(async (s) => {
  me = s;
  try {
    const summary = await D.loadSummary();
    const pick = pickSeason(summary);
    if (!pick) return renderEmpty(summary);
    season = pick;
    const q = new URLSearchParams(location.search).get("board");
    standing = await D.loadStanding(season.id, me.user!.uid).catch(() => null);
    const staff = await D.loadBoard(season.id, "staff").catch(() => null);
    if (staff?.exists) { hasStaff = true; boards.set("staff", staff); ranks.set("staff", staff.rows.find((r) => r.uid === me.user!.uid)?.rank ?? null); }
    if (q === "sub" || q === "crew" || (q === "staff" && hasStaff)) board = q;
    await show(board);
  } catch (err) {
    console.error(err);
    root.removeAttribute("aria-busy");
    root.innerHTML = `<p class="bt-notice bt-notice--error">${esc(messageFor(err, "The leaderboard didn't load. Refresh the page."))}</p>`;
  }
});

function pickSeason(s: Summary | null) {
  if (s?.live && s.liveSeasonId) return { id: s.liveSeasonId, name: s.name || "", number: s.number ?? null, ended: false, endsAt: s.endsAt ?? null, endedAt: null };
  if (s?.last) return { id: s.last.id, name: s.last.name, number: s.last.number, ended: true, endsAt: null, endedAt: s.last.endedAt };
  return null;
}

async function show(id: BoardId) {
  board = id;
  shown = PAGE;
  if (!boards.has(id)) {
    const b = await D.loadBoard(season.id, id);
    boards.set(id, b);
    const tier = id === "all" ? undefined : id;
    const mine = onBoardOf(standing, id) ? standing : null;
    ranks.set(id, await D.rankOf(season.id, b, mine, tier).catch(() => null));
  }
  render();
}

function headHtml() {
  const title = `Season ${sn(season.number)}${season.name ? ` · ${esc(season.name)}` : ""}`;
  return `<div class="ff-lb-head"><div><span class="ff-kicker">${season.ended ? "Final standings" : "Season leaderboard"}</span><h1 class="bt-title">${title}</h1>
    <p class="ff-muted">${season.ended ? `Ended ${esc(fmtDay(season.endedAt ?? Date.now()))}. Members in places 1 to 3 won the season trophies and 4 to 10 a top 10 plaque; staff race too, with a Staff tag, and the top 10 of them get a Staff Finish.` : "Ranked by season XP. Finish jobs to climb; everyone starts at zero each season."}</p></div>
    ${!season.ended && season.endsAt ? timerHtml({ until: season.endsAt, label: "Ends in", done: "Ending now" }) : ""}</div>`;
}

function podiumHtml(b: Board) {
  if (!season.ended || !b.rows.length || board !== "all") return "";
  return `<section class="ff-lb-podium" aria-label="Season trophies, members only">${b.rows.filter((r) => r.roleTag !== "admin").slice(0, 3).map((r, i) => `<div class="ff-lb-place" style="--rk:var(--bt-rank-${i + 1})">
      <span class="ff-lb-cup" aria-hidden="true">🏆</span><b>${TROPHIES[i].place}</b>
      ${whoHtml(r, 40)}<span class="ff-muted">${num(r.seasonXp)} season XP</span>
      <span class="bt-badge bt-badge--gold">${TROPHIES[i].place} · ${esc(season.name)} · +${TROPHIES[i].xp} XP</span></div>`).join("")}</section>`;
}

function whoHtml(r: BoardRow, size = 24) {
  const name = r.handle ? `@${r.handle}` : r.displayName || "Member";
  const medal = r.featured ? medalHtml({ emoji: r.featured.emoji || "", art: r.featured.art || "", rarity: r.featured.rarity, size }) : `<span class="ff-nomedal" style="--s:${size}px" aria-hidden="true"></span>`;
  return `<span class="bt-board-who">${medal}<span>${r.handle ? `<a href="/u/${encodeURIComponent(r.handle)}">${esc(name)}</a>` : esc(name)}</span>${r.roleTag === "admin" ? `<span class="bt-admin-tag bt-admin-tag--small ff-staff-tag">Staff</span>` : ""}</span>`;
}
const rowHtml = (r: BoardRow, rank: number, you: boolean) =>
  `<tr data-r="${rank}"${you ? ' class="is-me"' : ""}><td class="bt-board-rank">${rank}</td><td>${whoHtml(r)}${you ? `<span class="bt-sr-only"> (you)</span>` : ""}</td><td class="bt-board-time">${num(r.seasonXp)}</td></tr>`;

function youHtml(b: Board) {
  const rank = ranks.get(board) ?? null;
  const onBoard = onBoardOf(standing, board) ? standing : null;
  const staffNote = standing?.roleTag === "admin" ? ` You race with a Staff tag: member prizes go to members, and a top 10 finish earns a Staff Finish trophy.` : "";
  if (!onBoard || !(onBoard.seasonXp > 0)) {
    if (board !== "all") return `<p class="ff-muted ff-lb-you">${board === "sub" ? "Sub Club members' season XP, ranked among themselves." : board === "staff" ? "Admins' season XP, ranked among themselves." : "Mods' and admins' season XP, ranked among themselves."}${standing?.seasonXp ? ` You're on the <a href="/shift/leaderboard">All board</a>.` : ""}</p>`;
    return `<p class="ff-muted ff-lb-you">${season.ended ? "You didn't race this season." : "You're not on the board yet. Finish any job on the <a href=\"/shift\">season pass</a> to get a place."}</p>`;
  }
  return `<p class="ff-muted ff-lb-you">You're <b>${rank ? `#${num(rank)}` : "past #100"}</b> with <b>${num(onBoard.seasonXp)}</b> season XP${rank && rank > 1 && b.rows[rank - 2] ? `, ${num(b.rows[rank - 2].seasonXp - onBoard.seasonXp + 1)} XP behind #${rank - 1}` : ""}.${staffNote}</p>`;
}

function render() {
  root.removeAttribute("aria-busy");
  const b = boards.get(board)!;
  const uid = me.user?.uid;
  const rows = b.rows.slice(0, shown);
  const inView = rows.some((r) => r.uid === uid);
  const rank = ranks.get(board) ?? null;
  const pin = !inView && standing && standing.seasonXp > 0 && onBoardOf(standing, board);
  const body = rows.map((r, i) => rowHtml(r, r.rank ?? i + 1, r.uid === uid)).join("")
    + (pin ? `<tr class="bt-board-gap" aria-hidden="true"><td colspan="3">···</td></tr>${rowHtml({ ...standing!, featured: null }, rank ?? 0, true).replace(`<td class="bt-board-rank">0</td>`, `<td class="bt-board-rank">100+</td>`)}` : "");
  const label = boardList().find(([k]) => k === board)![1];
  const boss = D.bossLine(b.boss, standing?.seasonXp || 0, uid);
  root.innerHTML = `${headHtml()}
    <div class="ff-sel ff-lb-pills" role="group" aria-label="Board">${boardList().map(([k, l]) => `<button type="button" class="bt-chip${k === board ? " is-active" : ""}" data-board="${k}" aria-pressed="${k === board}">${l}</button>`).join("")}</div>
    ${podiumHtml(b)}
    ${boss ? `<p class="ff-boss" role="status"><span aria-hidden="true">👑</span> ${esc(boss)}</p>` : ""}
    <section class="bt-tile bt-board-card" aria-labelledby="ff-lb-h">
      <div class="bt-tile-head"><h2 class="ff-lb-title" id="ff-lb-h">${label}${b.count ? ` <span class="ff-muted">· ${num(b.count)} ${b.count === 1 ? "member" : "members"}</span>` : ""}</h2></div>
      ${b.rows.length ? `<table class="bt-board"><thead><tr><th scope="col">#</th><th scope="col">Member</th><th scope="col">Season XP</th></tr></thead><tbody>${body}</tbody></table>`
        : `<div class="bt-board-empty"><span aria-hidden="true">${SHIFT_ICON}</span><b>No one's on this board yet</b><span>${season.ended ? "No one in this group finished with season XP." : board === "all" ? "Finish a job on the season pass to be first." : `The first ${label} member to finish a job takes #1.`}</span></div>`}
      <div class="bt-board-foot">${youHtml(b)}${b.rows.length > shown ? `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-more>Show more</button>` : b.count > 100 && b.rows.length >= 100 ? `<span>Top 100 shown</span>` : ""}</div>
    </section>`;
  initTimers(root);
}

function renderEmpty(s: Summary | null) {
  root.removeAttribute("aria-busy");
  const next = s?.next;
  root.innerHTML = `<div class="ff-lb-head"><div><span class="ff-kicker">Season leaderboard</span><h1 class="bt-title">No season yet</h1>
    <p class="ff-muted">The board opens with the first season.${next ? "" : " Check back soon."}</p></div>${next ? timerHtml({ until: next.startsAt, label: "Starts in", done: "Starting now" }) : ""}</div>
    <div class="bt-tile bt-board-card"><div class="bt-board-empty"><span aria-hidden="true">${SHIFT_ICON}</span><b>Night Shift is quiet</b><span>Read <a href="/shift/how-it-works">how it works</a> while you wait.</span></div></div>`;
  initTimers(root);
}

root.addEventListener("click", async (e) => {
  const t = e.target as HTMLElement;
  const pill = t.closest<HTMLButtonElement>("[data-board]");
  if (pill && pill.dataset.board !== board) {
    const id = pill.dataset.board as BoardId;
    pill.setAttribute("aria-busy", "true");
    try {
      await show(id);
      const u = new URL(location.href);
      if (id === "all") u.searchParams.delete("board"); else u.searchParams.set("board", id);
      history.replaceState(null, "", u);
      root.querySelector<HTMLElement>(`[data-board="${id}"]`)?.focus();
    } catch (err) { pill.removeAttribute("aria-busy"); console.error(err); }
    return;
  }
  if (t.closest("[data-more]")) {
    const before = shown;
    shown = Math.min(shown + PAGE, 100);
    render();
    root.querySelectorAll<HTMLElement>(".bt-board tbody tr")[before]?.querySelector("a")?.focus();
  }
});
