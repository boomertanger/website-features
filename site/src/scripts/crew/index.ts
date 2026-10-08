// /crew: Meet the crew, a story page. Reads public/crew (the roster) and the awards docs, no sign-in needed.
// Fills the hero lineup, the flip-medal awards, the "where we need you" coverage, the roster cards and the Hall of
// Fame journey. Mods and admins see Go to HQ in place of Join. Sample data under ?as= (non-production).
// Idempotent: onAccess re-runs on every member change, so each render replaces its own host's contents.
import { onAccess, isCrew } from "./layout";
import { esc, loadMembers, loadAwards, who, monthName, monthShort, voteOpensOn, dayLabel, num } from "./public";
import { CHATS, CHAT_NAME } from "./api";
import type { Award, Chat, PublicMember } from "./api";
import { crewCardHtml, platformIconHtml } from "../../../../shared/ui/crew.js";
import { medalHtml } from "../../../../shared/ui/medal.js";
import { gradeInfo } from "../../../../shared/ui/grade-chip.js";
import { initHowItWorks } from "../../../../shared/ui/how-it-works.js";
import { initFlipCards } from "../../../../shared/ui/flip-card.js";

const root = document.querySelector<HTMLElement>("[data-cs-crew]")!;
const $ = (s: string) => root.querySelector<HTMLElement>(s)!;

/** Admins first, then the highest grades, then by name. Members on a planned break go last. */
const ranked = (members: PublicMember[]) => [...members].sort((a, b) =>
  Number(a.status === "goingDark") - Number(b.status === "goingDark")
  || Number(b.track === "admin") - Number(a.track === "admin")
  || b.grade - a.grade
  || (a.handle || "").localeCompare(b.handle || ""));

// ---- Hero lineup: up to 5 crew around the mascot, and an open gold spot for you ----
const SIZES = [46, 52, 46, 46, 52];
function renderLineup(members: PublicMember[]) {
  const el = $("[data-cs-lineup]");
  el.removeAttribute("aria-busy");
  const pick = ranked(members).filter((m) => m.status !== "goingDark").slice(0, 5);
  const fig = (m: PublicMember, i: number) => `<span class="cs-who" style="--s:${SIZES[i % SIZES.length]}px"><span class="bt-avatar-md" aria-hidden="true">${esc((m.handle || "Crew member").slice(0, 2).toUpperCase())}</span><span class="bt-sr-only">${esc(m.handle || "Crew member")}</span></span>`;
  const split = Math.ceil(pick.length / 2);
  $("[data-cs-left]").innerHTML = pick.slice(0, split).map(fig).join("");
  $("[data-cs-right]").innerHTML = pick.slice(split).map((m, i) => fig(m, i + split)).join("");
  el.dataset.empty = pick.length ? "false" : "true";
  $("[data-cs-start]").hidden = !!pick.length;
  $("[data-cs-open]").hidden = !pick.length;
}

// ---- 01 This month's heroes: four flip medals ----
type Flip = { c: string; ic: string; t: string; sub: string; rows: [string, string][]; tag: string };
const flipHtml = (f: Flip) => `<button type="button" class="bt-flip bt-flip--${f.c}" aria-label="${esc(`${f.t}: ${f.sub}. ${f.rows.map(([k, v]) => `${k}: ${v}`).join(". ")}. ${f.tag}.`)}"><span class="bt-flip-in">`
  + `<span class="bt-flip-face" aria-hidden="true"><span class="bt-flip-medal">${f.ic}</span><b>${esc(f.t)}</b><span class="bt-flip-sub">${esc(f.sub)}</span><span class="bt-flip-hint">Hover or tap to flip</span></span>`
  + `<span class="bt-flip-face bt-flip-face--back" aria-hidden="true">${f.rows.map(([k, v]) => `<span class="bt-flip-k">${esc(k)}</span><span class="bt-flip-v">${esc(v)}</span>`).join("")}<span class="bt-flip-tag">${esc(f.tag)}</span></span></span></button>`;

const gradeName = (m?: PublicMember) => (m ? gradeInfo(m.track, m.grade).name : "");
/** The first of next month as "November 1": the awards for a month are made on the 1st after it. */
const nextFirst = () => { const d = new Date(); const n = new Date(d.getFullYear(), d.getMonth() + 1, 1); return dayLabel(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-01`); };

function renderAwards(awards: Award[], members: PublicMember[]) {
  const el = $("[data-cs-awards]");
  el.removeAttribute("aria-busy");
  const byUid = new Map(members.map((m) => [m.uid, m]));
  const a = awards[0];
  const opens = voteOpensOn();
  const first = nextFirst();
  const month = a ? monthName(a.month) : `First awards ${first}`;
  const winner = (w: { uid: string; handle: string | null }) => {
    const m = byUid.get(w.uid);
    return `${w.handle || m?.handle || "A crew member"}${m ? ` · ${gradeName(m)}` : ""}`;
  };
  const flips: Flip[] = [
    a?.topGear
      ? { c: "gold", ic: "⚙️", t: "Top Gear", sub: month, rows: [["Winner", winner(a.topGear)], ["Why", a.topGear.gears ? `${num(a.topGear.gears)} Gears, the most on the crew.` : "The most Gears on the crew."]], tag: "Picks a game for a stream" }
      : { c: "gold", ic: "⚙️", t: "Top Gear", sub: a ? `${month} · no winner` : month, rows: a ? [["This month", "Nobody earned a Gear."], ["How", "Whoever earns the most Gears in a month."]] : [["How", "Whoever earns the most Gears in a month, picked automatically on the 1st."], ["Prize", "A trophy, a shout-out and a game for a stream"]], tag: a ? "Next one is on the 1st" : "Starts the 1st" },
    a?.fanFavourite
      ? { c: "primary", ic: "🕯️", t: "Fan Favourite", sub: month, rows: [["Winner", winner(a.fanFavourite)], ["Why", a.fanFavourite.votes ? `Chosen by ${num(a.fanFavourite.votes)} members.` : "Chosen by the members."]], tag: `${monthName(opens.slice(0, 7))} vote opens ${dayLabel(opens)}` }
      : { c: "primary", ic: "🕯️", t: "Fan Favourite", sub: a ? `${month} · no winner` : month, rows: [["How", "Members vote in the last 5 days of each month."], ["Prize", "A trophy and a shout-out on stream"]], tag: `Vote opens ${dayLabel(opens)}` },
    { c: "teal", ic: "⏱️", t: "On the Clock", sub: "Not awarded yet", rows: [["How", "Do 4 duties in a calendar month."], ["Prize", "A new collectible every month"]], tag: "Starts with stream duty" },
    { c: "red", ic: "🎃", t: "Boomer's Blessing", sub: "Not awarded yet", rows: [["How", "Boomer's own pick, any time, for something that mattered."], ["Prize", "A badge and a personal thank-you"]], tag: "Boomer's pick" },
  ];
  el.innerHTML = flips.map(flipHtml).join("");
  $("[data-cs-heroes-lede]").textContent = a
    ? "Hover or tap a medal to see who won it and why."
    : `The first awards land on ${first}. Hover or tap a medal to see how each one is won.`;
  initFlipCards(el as unknown as Document);
}

// ---- 02 Where we need you: favourites per chat (not streams covered) ----
function renderRooms(members: PublicMember[]) {
  const el = $("[data-cs-rooms]");
  el.removeAttribute("aria-busy");
  const active = members.filter((m) => m.status !== "goingDark");
  el.innerHTML = CHATS.map((c: Chat) => {
    const n = active.filter((m) => (m.favourites || []).includes(c)).length;
    const yt = c === "ytLandscape" || c === "ytVertical";
    const line = n ? `${n} ${n === 1 ? "crew member loves" : "crew members love"} this chat` : "Nobody has picked it as a favourite yet";
    return `<div class="cs-room${yt ? " is-need" : ""}">${platformIconHtml(c)}<i class="cs-lamp" aria-hidden="true"></i><b>${esc(CHAT_NAME[c])}</b><small>${esc(line)}${yt ? " · ×1.5 Gears" : ""}</small>${yt ? `<span class="bt-badge bt-badge--gold">Most needed</span>` : ""}</div>`;
  }).join("");
}

// ---- 03 The crew: roster cards, with an optional "in their own words" line (only when a member has a quote) ----
const quoteOf = (m: PublicMember) => (typeof m.quote === "string" ? m.quote.trim().slice(0, 90) : "");
function cardHtml(m: PublicMember) {
  const w = who(m);
  const chats = Object.fromEntries((m.favourites || []).map((c) => [c, "favourite"]));
  const html = crewCardHtml({ name: w.name, href: w.href, gradeHtml: w.gradeHtml, staff: m.track === "admin", onBreak: m.status === "goingDark", chats: m.favourites?.length ? chats : null } as any);
  const q = quoteOf(m);
  return html
    .replace("bt-tile bt-crew-card", `bt-tile bt-crew-card cs-card${m.track === "admin" ? " is-staff" : ""}`)
    .replace(/<\/div>$/, q ? `<p class="cs-quote">“${esc(q)}”</p></div>` : "</div>");
}
function renderRoster(members: PublicMember[]) {
  const el = $("[data-cs-roster]");
  el.removeAttribute("aria-busy");
  if (!members.length) {
    el.innerHTML = `<div class="bt-tile cs-empty"><b>The crew starts here</b><span>The first mods are being trained now. Want to be one of them?</span><a class="bt-btn bt-btn--primary" href="/crew/join">Join the crew</a></div>`;
    return;
  }
  el.innerHTML = `<div class="cs-roster">${ranked(members).map(cardHtml).join("")}</div>`;
}

// ---- 04 Hall of Fame: a journey line of the latest winners, oldest to newest ----
function renderFame(awards: Award[]) {
  const el = $("[data-cs-fame]");
  el.removeAttribute("aria-busy");
  const items: { name: string | null; k: string; when: string; emoji: string }[] = [];
  for (const a of [...awards].sort((x, y) => x.month.localeCompare(y.month))) {
    const when = `${monthShort(a.month)} ${a.month.slice(0, 4)}`;
    if (a.topGear) items.push({ name: a.topGear.handle, k: "Top Gear", when, emoji: "⚙️" });
    if (a.fanFavourite) items.push({ name: a.fanFavourite.handle, k: "Fan Favourite", when, emoji: "🕯️" });
  }
  const shown = items.slice(-6);
  if (!shown.length) {
    el.innerHTML = `<div class="bt-tile cs-empty"><b>The wall is waiting for its first name</b><span>Every monthly winner lands here, starting with the first awards on ${esc(nextFirst())}.</span></div>`;
    return;
  }
  const name = (n: string | null) => (n ? `<a href="/u/${encodeURIComponent(n)}">${esc(n)}</a>` : "Crew member");
  el.innerHTML = `<ol class="ai-jr cs-fame" data-journey style="--n:${shown.length};--m:${Math.max(1, shown.length - 1)}">${shown.map((i, n) => `<li tabindex="0"><span class="ai-jr-num">${n + 1}</span>${medalHtml({ emoji: i.emoji, rarity: 4, size: 40 } as any)}<b>${name(i.name)}</b><span class="ai-jr-t">${esc(i.k)} · ${esc(i.when)}</span></li>`).join("")}</ol>`;
  initHowItWorks(el as unknown as Document);
}

// ---- Join or HQ ----
function renderAccess(crew: boolean) {
  root.querySelectorAll<HTMLElement>("[data-cs-join]").forEach((b) => { b.hidden = crew; });
  root.querySelectorAll<HTMLElement>("[data-cs-hq]").forEach((b) => { b.hidden = !crew; });
  $("[data-cs-cta-h]").textContent = crew ? "You're on the crew" : "There's a seat for you";
  $("[data-cs-cta-p]").textContent = crew ? "Your grade, Gears and next steps are in HQ." : "Pick your chats, train at your own pace, and help on the streams that suit you. YouTube especially.";
}

let run = 0;
onAccess(async (s) => {
  const mine = ++run;
  renderAccess(isCrew(s));
  const [members, awards] = await Promise.all([loadMembers(s), loadAwards(s)]);
  if (mine !== run) return;
  renderLineup(members);
  renderAwards(awards, members);
  renderRooms(members);
  renderRoster(members);
  renderFame(awards);
});
