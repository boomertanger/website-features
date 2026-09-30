// /arcade/leaderboards (docs/specs/arcade-step1.md §3, §7): per live game, the
// all-time top 3 on Desktop and Mobile. Reads: the games list (cached) + 2 board docs per game.
import { onMember, getGames, getBoard, ranked, boardHtml, logoHtml, gameHref, esc, DEVICE_LABEL, type Device, type Game } from "./data";

const slot = document.querySelector<HTMLElement>("[data-all-boards]");

async function cardHtml(g: Game, uid: string) {
  const col = async (d: Device) => {
    const rows = await getBoard(g, d, "all");
    return `<div><span class="bt-label">${DEVICE_LABEL[d]}</span>${rows.length ? boardHtml(ranked(rows).slice(0, 3), { mini: true, meUid: uid }) : `<div class="bt-board-empty"><span>No finished runs yet.</span></div>`}</div>`;
  };
  const [desk, mob] = await Promise.all([col("desktop"), col("mobile")]);
  return `<article class="bt-tile"><div class="bt-tile-head"><h2 class="ar-xg-title bt-game-name">${logoHtml(g, "sm")}<span class="bt-badge bt-badge--gray">${esc(g.currentVersion)}</span></h2><a href="${gameHref(g, "leaderboards")}">Full leaderboard</a></div><div class="ar-xg">${desk}${mob}</div></article>`;
}

onMember(async (s) => {
  if (!slot) return;
  try {
    const live = (await getGames()).filter((g) => g.status === "live");
    slot.innerHTML = live.length
      ? (await Promise.all(live.map((g) => cardHtml(g, s.user!.uid)))).join("")
      : `<div class="bt-card"><div class="bt-empty"><span class="bt-empty-title">No boards yet</span><span>The first game's boards open at launch.</span></div></div>`;
  } catch (err) {
    console.error("arcade: couldn't load the leaderboards", err);
    slot.innerHTML = `<div class="bt-notice">Couldn't load the leaderboards. Refresh to try again.</div>`;
  } finally {
    slot.removeAttribute("aria-busy");
  }
});
