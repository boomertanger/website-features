// /trophies, the badge catalog (docs/specs/rewards.md §11): reads the catalog (cached 5 minutes),
// the member's profile and their profiles/{uid}/badges, then draws every badge as a flip card
// (card.ts). Collection chips start on Loyalty (plus All); the Crew collection only shows for
// mods and admins. Rarity chips narrow it further. The strip on top links to /account#rewards.
import { initFlipCards } from "../../../../shared/ui/flip-card.js";
import { RARITY } from "../../../../shared/ui/medal.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { progress } from "../../lib/rewards.js";
import { badgeCardHtml, LIVE_SOURCES } from "./card";
import { loadCatalog, loadHeld, ownProfile, isCrew, onMember } from "./data";

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const grid = $("[data-tr-grid]"), me = $<HTMLAnchorElement>("[data-tr-me]"), filters = $("[data-tr-filters]");
const head = $("[data-tr-head]"), empty = $("[data-tr-empty]");
const DEFAULT_COLL = "loyalty";

export function meStripHtml(xp: number, held: number, total: number) {
  const p = progress(xp);
  const pct = p.nextXp > p.levelXp ? Math.max(0, Math.min(100, ((p.xp - p.levelXp) / (p.nextXp - p.levelXp)) * 100)) : 100;
  const n = (v: number) => v.toLocaleString("en-US");
  return `<span class="tr-me-lv" aria-hidden="true"><small>Lv</small>${p.level}</span>
    <span class="tr-me-main"><span class="tr-lv-top"><b>Level ${p.level} · ${esc(p.rank)}</b><span>${n(p.xp)} / ${n(p.nextXp)} XP</span></span>
    <span class="tr-xpbar" style="--v:${pct.toFixed(1)}%"><i></i></span></span>
    <span class="tr-me-count"><b>${held}</b><small>of ${total} badges</small></span>
    <span class="tr-me-go">Rewards<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg></span>`;
}

onMember(async (s) => {
  const uid = s.user!.uid;
  try {
    const [{ collections, badges }, held] = await Promise.all([loadCatalog(), loadHeld(uid)]);
    const profile = ownProfile(s);
    const crew = isCrew(s.roles, s.isAdmin);
    const colls = collections.filter((c) => crew || !c.crewOnly);
    const visible = badges.filter((b) => colls.some((c) => c.id === b.collection) && (crew || !b.crewOnly || held.has(b.id)));
    const names = new Map(colls.map((c) => [c.id, c.name]));

    // The strip: level, rank, XP and how many of the visible badges you hold.
    const heldCount = visible.filter((b) => held.has(b.id)).length;
    me.innerHTML = meStripHtml(profile?.xp ?? 0, heldCount, visible.length);
    me.setAttribute("aria-label", `Level ${progress(profile?.xp ?? 0).level}, ${heldCount} of ${visible.length} badges. Open your Rewards.`);
    me.removeAttribute("aria-busy");

    // Chips
    const count = (id: string) => visible.filter((b) => b.collection === id).length;
    const heldIn = (id: string) => visible.filter((b) => b.collection === id && held.has(b.id)).length;
    $("[data-tr-colls]").innerHTML = `<button type="button" class="bt-chip" data-c="all" aria-pressed="false">All <small>${heldCount}/${visible.length}</small></button>`
      + colls.map((c) => `<button type="button" class="bt-chip${c.id === DEFAULT_COLL ? " is-active" : ""}" data-c="${esc(c.id)}" aria-pressed="${c.id === DEFAULT_COLL}"><span aria-hidden="true">${esc(c.icon)}</span>${esc(c.name)} <small>${heldIn(c.id)}/${count(c.id)}</small></button>`).join("");
    $("[data-tr-rars]").innerHTML = `<button type="button" class="bt-chip bt-chip--small is-active" data-r="0" aria-pressed="true">Any rarity</button>`
      + [1, 2, 3, 4, 5].map((n) => `<button type="button" class="bt-chip bt-chip--small" data-r="${n}" aria-pressed="false">${RARITY[n].name}</button>`).join("");
    filters.hidden = false;

    // Cards: built once, the chips show and hide them.
    let coll = colls.some((c) => c.id === DEFAULT_COLL) ? DEFAULT_COLL : "all", rar = 0;
    grid.innerHTML = visible.map((b) => badgeCardHtml(b, { collName: names.get(b.collection), held: held.get(b.id) ?? null, member: true, comingSoon: !LIVE_SOURCES.has(b.source), hidden: coll !== "all" && b.collection !== coll })).join("");
    grid.removeAttribute("aria-busy");
    initFlipCards(grid);
    const cards = [...grid.querySelectorAll<HTMLElement>(".tr-card")];

    const render = () => {
      let shown = 0;
      for (const c of cards) {
        const on = (coll === "all" || c.dataset.coll === coll) && (!rar || c.dataset.rar === String(rar));
        c.hidden = !on;
        if (on) shown++; else c.classList.remove("is-flipped");
      }
      const c = colls.find((k) => k.id === coll);
      head.innerHTML = c
        ? `<div><span class="tr-ic" aria-hidden="true">${esc(c.icon)}</span><div><h2>${esc(c.name)}</h2><p>${esc(c.blurb)}</p></div><span class="tr-coll-n">${heldIn(c.id)} of ${count(c.id)}</span></div>`
        : `<div><span class="tr-ic" aria-hidden="true">🏅</span><div><h2>Every badge</h2><p>${visible.length} badges in ${colls.length} collections. You hold ${heldCount}.</p></div></div>`;
      empty.hidden = shown > 0;
      empty.textContent = shown ? "" : `No ${RARITY[rar]?.name ?? ""} badges in this collection yet.`;
    };
    filters.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
      if (!btn) return;
      if (btn.dataset.c) coll = btn.dataset.c; else if (btn.dataset.r) rar = Number(btn.dataset.r); else return;
      btn.parentElement!.querySelectorAll("button").forEach((b) => { b.classList.toggle("is-active", b === btn); b.setAttribute("aria-pressed", String(b === btn)); });
      render();
    });
    render();
  } catch (err) {
    console.error(err);
    me.hidden = true;
    grid.removeAttribute("aria-busy");
    grid.innerHTML = `<p class="bt-notice bt-notice--error tr-cat-error">The badges didn't load. Check your connection and refresh the page.</p>`;
  }
});
