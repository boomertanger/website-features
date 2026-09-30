// /arcade/tap-the-splat Play tab (docs/specs/arcade-step1.md §3, §7).
// Reads: the game doc + the member's 2 bests + 1 board doc (Desktop, all time).
// A rank shows where that board knows it (your Desktop all-time place in the top 100);
// the Leaderboards tab has the rest.
import { onMember, getGame, getBest, getBoard, ranked, boardHtml, statsHtml, fmtTime, esc, type Device, type Best } from "./data";

const GAME_ID = "tapTheSplat";
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s);
const boardLink = (d: Device) => `/arcade/tap-the-splat/leaderboards?device=${d}`;

function bestCell(d: Device, best: Best | null, allRank: number | null) {
  const label = d === "desktop" ? "Desktop" : "Mobile";
  if (!best?.allTime) {
    return `<div class="ar-best"><span class="bt-label">${label}</span><span class="ar-best-time is-none">No finished run yet</span><span class="ar-faint">${d === "mobile" ? "Play on your phone to set one" : "Play on a computer to set one"}</span></div>`;
  }
  const bits = [allRank ? `#${allRank} all-time` : "", best.week ? `this week ${fmtTime(best.week.secs)}` : ""].filter(Boolean);
  return `<div class="ar-best"><span class="bt-label">${label}</span><span class="ar-best-time">${fmtTime(best.allTime.secs)}</span><span class="ar-faint">${bits.length ? esc(bits.join(" · ")) + " · " : ""}<a href="${boardLink(d)}">Your rank</a></span></div>`;
}

onMember(async (s) => {
  const uid = s.user!.uid;
  try {
    const game = await getGame(GAME_ID);
    if (!game) throw new Error("game missing");
    const meta = $("[data-game-meta]");
    if (meta) meta.innerHTML = `<span class="bt-badge bt-badge--gray">${esc(game.currentVersion)}</span>${statsHtml(game.stats)}`;
    const [desktop, mobile, rows] = await Promise.all([getBest(game, uid, "desktop"), getBest(game, uid, "mobile"), getBoard(game, "desktop", "all")]);
    const mine = rows.findIndex((r) => r.uid === uid);
    $("[data-bests]")!.innerHTML = bestCell("desktop", desktop, mine >= 0 ? mine + 1 : null) + bestCell("mobile", mobile, null);
    $("[data-top3]")!.innerHTML = rows.length
      ? boardHtml(ranked(rows).slice(0, 3), { mini: true, meUid: uid })
      : `<div class="bt-board-empty"><b>No finished runs yet</b><span>Be the first on the desktop board.</span></div>`;
  } catch (err) {
    console.error("arcade: couldn't load the Play tab", err);
    $("[data-bests]")!.innerHTML = `<p class="bt-notice">Couldn't load your best times. Refresh to try again.</p>`;
    $("[data-top3]")!.innerHTML = "";
  } finally {
    document.querySelectorAll("[aria-busy]").forEach((el) => el.removeAttribute("aria-busy"));
  }
});
