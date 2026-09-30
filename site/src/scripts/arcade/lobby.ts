// /arcade lobby (docs/specs/arcade-step1.md §3, §7): the newest live game as the
// marquee card, any others as compact cards, What's new from every game's news.
// Reads: the games query + the member's two bests per live game.
import { onMember, getGames, getBest, logoHtml, gameHref, artHtml, statsHtml, fmtTime, esc, DEVICE_LABEL, type Game, type Device, type Best } from "./data";

const slot = document.querySelector<HTMLElement>("[data-lobby-games]");
const newsList = document.querySelector<HTMLElement>("[data-lobby-news]");

const NEW_DAYS = 45;
const isNew = (g: Game) => g.news.some((n) => Date.now() - Date.parse(n.at) < NEW_DAYS * 86400000);

function meHtml(bests: Record<Device, Best | null>) {
  const has = (d: Device) => bests[d]?.allTime;
  if (!has("desktop") && !has("mobile")) return `<div class="bt-game-me"><span class="ar-muted">No finished runs yet. Your best times show here.</span></div>`;
  const cell = (d: Device) => (has(d) ? `<span>${DEVICE_LABEL[d]} <b>${fmtTime(bests[d]!.allTime!.secs)}</b></span>` : `<span class="ar-faint">${DEVICE_LABEL[d]}: no run yet</span>`);
  return `<div class="bt-game-me"><span class="ar-faint">Your best</span>${cell("desktop")}${cell("mobile")}</div>`;
}

function cardHtml(g: Game, bests: Record<Device, Best | null> | null, compact: boolean) {
  if (g.status === "soon") {
    return `<article class="bt-tile bt-game-card bt-game-card--compact is-soon"><div class="bt-game-art"><span class="bt-game-art-soon" aria-hidden="true">🔒</span></div><div class="bt-game-body"><div class="ar-meta"><span class="bt-badge bt-badge--gold"><span class="bt-badge-dot"></span>Soon</span></div><h2 class="bt-game-name">${esc(g.title)}</h2>${g.tagline ? `<p class="bt-game-tag">${esc(g.tagline)}</p>` : ""}</div></article>`;
  }
  const badges = `${isNew(g) ? `<span class="bt-badge bt-badge--lime"><span class="bt-badge-dot"></span>New</span>` : ""}<span class="bt-badge bt-badge--gray">${esc(g.currentVersion)}</span>`;
  const acts = `<div class="bt-game-acts"><a class="bt-btn bt-btn--go" href="${gameHref(g)}" ${g.id === "tapTheSplat" ? "data-play-now" : ""}>Play now</a><a class="bt-btn bt-btn--secondary" href="${gameHref(g, "leaderboards")}">Leaderboards</a></div>`;
  return `<article class="bt-tile bt-game-card${compact ? " bt-game-card--compact" : ""}">${artHtml()}<div class="bt-game-body"><div class="ar-meta">${badges}</div><h2 class="bt-game-name"><a href="${gameHref(g)}">${logoHtml(g, "sm")}</a></h2>${!compact && g.tagline ? `<p class="bt-game-tag">${esc(g.tagline)}</p>` : ""}${statsHtml(g.stats)}${bests ? meHtml(bests) : ""}${acts}</div></article>`;
}

onMember(async (s) => {
  if (!slot) return;
  try {
    const games = await getGames();
    const live = games.filter((g) => g.status === "live");
    const bests = await Promise.all(live.map(async (g) => {
      const [desktop, mobile] = await Promise.all([getBest(g, s.user!.uid, "desktop"), getBest(g, s.user!.uid, "mobile")]);
      return [g.id, { desktop, mobile }] as const;
    }));
    const byGame = Object.fromEntries(bests);
    // The marquee is the newest release (the first live game by sortOrder); the rest drop into a row.
    const [marquee, ...rest] = [...live, ...games.filter((g) => g.status === "soon")];
    slot.innerHTML = marquee
      ? cardHtml(marquee, byGame[marquee.id] ?? null, false) + (rest.length ? `<div class="ar-row">${rest.map((g) => cardHtml(g, byGame[g.id] ?? null, true)).join("")}</div>` : "")
      : `<div class="bt-card"><div class="bt-empty"><span class="bt-empty-title">No games yet</span><span>The first one is on its way.</span></div></div>`;
    const news = games.flatMap((g) => g.news).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 3);
    if (newsList) {
      newsList.innerHTML = news.length
        ? news.map((n) => `<li><b>${esc(n.title)}</b><span class="ar-faint">${new Date(n.at + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })}${n.text ? ` · ${esc(n.text)}` : ""}</span></li>`).join("")
        : `<li class="ar-faint">Nothing new yet.</li>`;
    }
  } catch (err) {
    console.error("arcade: couldn't load the lobby", err);
    slot.innerHTML = `<div class="bt-notice">Couldn't load the games. Refresh to try again.</div>`;
  } finally {
    slot.removeAttribute("aria-busy");
  }
});
