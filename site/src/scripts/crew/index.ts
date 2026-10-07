// /crew: Meet the crew. Reads public/crew (the roster) and the awards docs, no sign-in needed. Mods and admins see
// "You're on the crew" with a link to HQ in place of the Join card. Sample data under ?as= (non-production).
import { onAccess, isCrew } from "./layout";
import { esc, loadMembers, loadAwards, who, monthName, monthShort, voteOpensOn, dayLabel, num } from "./public";
import type { Award, PublicMember } from "./api";
import { crewCardHtml } from "../../../../shared/ui/crew.js";
import { medalHtml } from "../../../../shared/ui/medal.js";
import { MM_ICON } from "../../../../shared/ui/mod-machina.js";

const root = document.querySelector<HTMLElement>("[data-cp-crew]")!;
const $ = (s: string) => root.querySelector<HTMLElement>(s)!;

const card = (m: PublicMember) => {
  const w = who(m);
  const chats = Object.fromEntries((m.favourites || []).map((c) => [c, "favourite"]));
  return crewCardHtml({ name: w.name, href: w.href, gradeHtml: w.gradeHtml, staff: m.track === "admin", onBreak: m.status === "goingDark", chats: m.favourites?.length ? chats : null });
};

function awardTile(kind: "gear" | "fan", a: Award, byUid: Map<string, PublicMember>, extra = "") {
  const win = kind === "gear" ? a.topGear : a.fanFavourite;
  const label = `${kind === "gear" ? "Top Gear" : "Fan Favourite"} · ${monthName(a.month)}`;
  const emoji = kind === "gear" ? "⚙️" : "🕯️";
  if (!win) return `<div class="bt-tile cp-award">${medalHtml({ emoji, rarity: 1, size: 68 })}<div class="cp-award-txt"><span class="bt-label">${esc(label)}</span><b>No winner this month</b><small>${kind === "gear" ? "Top Gear needs at least one Gear earned." : "Fan Favourite needs at least one vote."}${esc(extra)}</small></div></div>`;
  const m = byUid.get(win.uid);
  const handle = win.handle || m?.handle || null;
  const votes = (win as { votes?: number }).votes;
  const gears = (win as { gears?: number }).gears;
  const line = kind === "gear"
    ? `${gears ? `${num(gears)} Gears. ` : ""}Picks a game for a stream next month.`
    : `${votes ? `Chosen by ${num(votes)} members.` : "Chosen by the members."}`;
  return `<div class="bt-tile cp-award">${medalHtml({ emoji, rarity: 4, size: 68 })}<div class="cp-award-txt"><span class="bt-label">${esc(label)}</span>
    <div class="cp-award-who"><b>${handle ? `<a href="/u/${encodeURIComponent(handle)}">${esc(handle)}</a>` : "Crew member"}</b>${m ? who(m).gradeHtml : ""}</div><small>${esc(`${line}${extra}`)}</small></div></div>`;
}

function renderAwards(awards: Award[], members: PublicMember[]) {
  const el = $("[data-cp-awards]");
  el.removeAttribute("aria-busy");
  const byUid = new Map(members.map((m) => [m.uid, m]));
  const a = awards[0];
  const opens = voteOpensOn();
  if (!a) {
    el.classList.add("cp-awards--one");
    el.innerHTML = `<div class="bt-tile cp-award"><span class="cp-art" aria-hidden="true">${MM_ICON}</span><div class="cp-award-txt"><span class="bt-label">Awards</span><b>First awards come on the 1st</b><small>Top Gear goes to whoever earns the most Gears. Members vote for Fan Favourite in the last 5 days of the month, and voting opens ${esc(dayLabel(opens))}.</small></div></div>`;
    return;
  }
  el.innerHTML = awardTile("gear", a, byUid) + awardTile("fan", a, byUid, ` ${monthName(opens.slice(0, 7))} voting opens ${dayLabel(opens)}.`);
}

function renderRoster(members: PublicMember[]) {
  const el = $("[data-cp-roster]");
  el.removeAttribute("aria-busy");
  if (!members.length) {
    el.innerHTML = `<div class="bt-tile bt-board-card"><div class="bt-board-empty"><span class="cp-art" aria-hidden="true">${MM_ICON}</span><b>The crew list is on its way</b><span>The first mods are being trained now. <a href="/crew/join">Want to be one of them?</a></span></div></div>`;
    return;
  }
  const admins = members.filter((m) => m.track === "admin"), mods = members.filter((m) => m.track !== "admin");
  const group = (title: string, list: PublicMember[], note: string) => list.length ? `<section class="cp-group" aria-label="${title}"><div class="bt-tile-head"><h2 class="bt-heading">${title}</h2><span class="bt-meta">${list.length}${note}</span></div><div class="bt-roster">${list.map(card).join("")}</div></section>` : "";
  el.innerHTML = `<div class="cp-groups">${group("Admins", admins, "")}${group("Mods", mods, " · ★ = favourite chat")}</div>`;
}

function renderFame(awards: Award[]) {
  const el = $("[data-cp-fame]");
  type W = { handle: string | null };
  const items: { k: string; w: W; m: string; y: string }[] = [];
  for (const a of awards) {
    if (a.topGear) items.push({ k: "Top Gear", w: a.topGear, m: monthShort(a.month), y: a.month.slice(0, 4) });
    if (a.fanFavourite) items.push({ k: "Fan Favourite", w: a.fanFavourite, m: monthShort(a.month), y: a.month.slice(0, 4) });
  }
  if (!items.length) return;
  el.hidden = false;
  el.innerHTML = `<div class="bt-tile-head"><h2 class="bt-heading" id="cp-fame-h">Hall of Fame</h2><span class="bt-meta">Every monthly winner</span></div>
    <ul class="cp-fame">${items.map((i) => `<li class="cp-fame-item">${medalHtml({ emoji: "🏆", rarity: 4, size: 34 })}<span><b>${i.w.handle ? `<a href="/u/${encodeURIComponent(i.w.handle)}">${esc(i.w.handle)}</a>` : "Crew member"}</b><small>${esc(i.k)} · ${esc(i.m)} ${esc(i.y)}</small></span></li>`).join("")}</ul>`;
}

onAccess(async (s) => {
  const [members, awards] = await Promise.all([loadMembers(s), loadAwards(s)]);
  renderAwards(awards, members);
  renderRoster(members);
  renderFame(awards);
  if (isCrew(s)) {
    $("[data-cp-joinbtn]").outerHTML = `<a class="bt-btn bt-btn--secondary" href="/crew/hq">Go to HQ</a>`;
    $("[data-cp-cta]").innerHTML = `<div><h3>You're on the crew</h3><ul><li>Your grade, Gears and next steps are in HQ</li></ul></div><a class="bt-btn bt-btn--primary" href="/crew/hq">Go to HQ</a>`;
  }
});
