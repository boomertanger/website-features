// /crew/board: the crew leaderboard (docs/specs/mod-machina.md §4b). Reads crew/main/boards/{month|season|all}
// (public, written by the crew functions). Podium for the top three, then the table; your row is highlighted and,
// when it is past the first rows, pinned under a gap. Admins carry a Staff tag and their real place. Duties and
// hours show 0 and a dash until stream duty opens. Sample data under ?as= (non-production).
import { onAccess } from "./layout";
import { esc, num, loadBoard, who, monthName } from "./public";
import type { Board, BoardRow } from "./api";
import { PLATFORMS, platformIconHtml, podiumHtml } from "../../../../shared/ui/crew.js";
import { MM_ICON } from "../../../../shared/ui/mod-machina.js";
import { initials } from "../../../../shared/ui/dom.js";
import type { AuthState } from "../../lib/auth";

type Id = "month" | "season" | "all";
const root = document.querySelector<HTMLElement>("[data-cp-board]")!;
const body = root.querySelector<HTMLElement>("[data-cp-body]")!;
const sub = root.querySelector<HTMLElement>("[data-cp-sub]")!;
const SHOWN = 15;
let me: AuthState;
let tab: Id = "month";
let all = false;
const cache = new Map<Id, Board>();
const STAFF = `<span class="bt-badge bt-badge--admin">Staff</span>`;

const rooms = (r: BoardRow) => `<span class="bt-crew-plats">${(r.rooms || []).filter((c) => c in PLATFORMS).map((c) => `<span class="bt-crew-plat">${platformIconHtml(c)}</span>`).join("")}</span>`;
const hours = (h: number) => (h > 0 ? String(Math.round(h * 10) / 10) : "—");

function rowHtml(r: BoardRow, you: boolean, place = r.place) {
  const w = who(r);
  const name = w.href ? `<a href="${esc(w.href)}">${esc(w.name)}</a>` : esc(w.name);
  return `<tr${r.place <= 3 && place === r.place ? ` data-r="${r.place}"` : ""} class="${[you && "is-me", r.staff && "is-staff"].filter(Boolean).join(" ")}">
    <td class="bt-board-rank">${place}</td>
    <td><span class="bt-board-who"><span class="bt-avatar-sm" aria-hidden="true">${esc(initials(w.name))}</span><span><b>${name}</b>${w.gradeHtml}${r.staff ? STAFF : ""}${you ? `<span class="bt-sr-only"> (you)</span>` : ""}</span></span></td>
    <td class="bt-board-rooms">${rooms(r)}</td>
    <td class="bt-board-n bt-board-hide">${num(r.duties)}</td><td class="bt-board-n bt-board-hide">${hours(r.hours)}</td><td class="bt-board-n bt-board-hide">${num(r.recruits)}</td>
    <td class="bt-board-time">${num(r.gears)}</td></tr>`;
}

function render() {
  body.removeAttribute("aria-busy");
  root.removeAttribute("aria-busy");
  const b = cache.get(tab)!;
  const rows = [...b.rows].sort((x, y) => x.place - y.place);
  const uid = me.user?.uid;
  const mine = uid ? rows.find((r) => r.uid === uid) : undefined;
  const label = tab === "month" ? (b.period && /^\d{4}-\d{2}$/.test(b.period) ? `${monthName(b.period)} so far` : "This month so far") : tab === "season" ? "This season" : "All time";
  sub.textContent = `Gears count help: time on duty, hosting Chat Games, recruiting and crew tasks. ${label}.`;
  if (!rows.length) {
    body.innerHTML = `<div class="bt-tile bt-board-card"><div class="bt-board-empty"><span class="cp-art" aria-hidden="true">${MM_ICON}</span><b>No Gears yet</b><span>${tab === "month" ? "The board fills as the crew starts earning Gears this month." : "Nobody has earned Gears in this period yet."} <a href="/crew/how-it-works">How Gears work</a></span></div></div>`;
    return;
  }
  const top = rows.filter((r) => r.gears > 0).slice(0, 3);
  const pod = top.length === 3
    ? podiumHtml({ label: "Top three", places: top.map((r) => { const w = who(r); return { rank: r.place, name: w.name, gradeHtml: w.gradeHtml + (r.staff ? STAFF : ""), value: num(r.gears), unit: "Gears", sub: r.duties || r.hours ? `${num(r.duties)} duties · ${hours(r.hours)} h` : "" }; }) })
    : "";
  const vis = all ? rows : rows.slice(0, SHOWN);
  const pinned = mine && !vis.includes(mine);
  const trs = vis.map((r) => rowHtml(r, r === mine)).join("")
    + (pinned ? `<tr class="bt-board-gap" aria-hidden="true"><td colspan="7">···</td></tr>${rowHtml(mine!, true)}` : "");
  const you = mine ? `<span>You're <b>#${mine.place}</b> with <b>${num(mine.gears)}</b> Gears${mine.staff ? ". Staff race with a green tag but never win crew awards" : ""}.</span>` : `<span>Staff race with a green tag but never win crew awards.</span>`;
  body.innerHTML = `${pod}<div class="bt-tile bt-board-card"><div class="cp-scroll"><table class="bt-board bt-board--crew"><thead><tr><th scope="col">#</th><th scope="col">Crew</th><th scope="col" class="bt-board-rooms">Chats</th><th scope="col" class="bt-board-n bt-board-hide">Duties</th><th scope="col" class="bt-board-n bt-board-hide">Hours</th><th scope="col" class="bt-board-n bt-board-hide">Recruits</th><th scope="col">Gears</th></tr></thead><tbody>${trs}</tbody></table></div>
    <div class="bt-board-foot">${you}${!all && rows.length > SHOWN ? `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-more>Show all ${rows.length}</button>` : `<a href="/crew/how-it-works">How Gears work</a>`}</div></div>`;
}

async function show(id: Id) {
  tab = id;
  all = false;
  root.querySelectorAll<HTMLButtonElement>("[data-b]").forEach((x) => { const on = x.dataset.b === id; x.classList.toggle("is-on", on); x.setAttribute("aria-pressed", String(on)); });
  if (!cache.has(id)) { body.setAttribute("aria-busy", "true"); cache.set(id, await loadBoard(me, id)); }
  render();
}

root.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  const b = t.closest<HTMLElement>("[data-b]");
  if (b && b.dataset.b !== tab) void show(b.dataset.b as Id);
  if (t.closest("[data-more]")) { all = true; render(); }
});

onAccess((s) => { me = s; void show("month"); });
