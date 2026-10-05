// /games, the Vault page (docs/specs/game-vault.md §7, §9; round 2 A65 + B34 + C56):
// the vault door hero that opens on what Boomer's playing (once per visit, never under reduced
// motion; a click skips it), the ledger, search with the command panel (matched letters lit,
// suggested filters, an Add row, full keyboard, "/" focuses it), the status seg nav, Tags /
// Length menus, Community picks, removable tokens, sort, state in the URL, the shelves (Now
// playing, Most wanted, Boomer's best, The ones that got away) and then the All games grid (round 3
// S1), just the gliding grid when searching or filtering, and the states (loading, empty, no
// matches, error). Shelves only show when they have games, except Most wanted, which shows whenever
// there's a wishlist game: the top 5 by wants with rank numerals, or, before anyone wants anything,
// the 5 newest wishlist games and a nudge to be the first.
import { buildIndex, search } from "../../../../shared/vault-search.js";
import { coverHtml } from "../../../../shared/ui/cover.js";
import { initSegNav } from "../../../../shared/ui/seg-nav.js";
import { initCmd, litText } from "../../../../shared/ui/cmd.js";
import { initShelves } from "../../../../shared/ui/shelf.js";
import { initCountUp } from "../../../../shared/ui/count-up.js";
import { flipSwap } from "../../../../shared/ui/flip.js";
import { onAuth, getAuthState } from "../../lib/auth";
import { loadVault, type VCard, type Status, type Vault } from "./data";
import { vaultIcon, doorParts, I } from "./art";
import { esc, badge, vcard, tag, hours, plural, STATUS, STATUS_KEYS, lenOf, LENGTHS } from "./ui";
import { wantButton, initWants } from "./wants";

const root = document.querySelector<HTMLElement>("[data-vault]");
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const DOOR_KEY = "bt-vault-door";
const SUB = "Every horror game on the channel: what Boomer's playing, what he finished, what beat him and what's next.";
const SORTS: [string, string][] = [["last", "Last streamed"], ["most", "Most streamed"], ["score", "Boomer's score"], ["wanted", "Most wanted"], ["new", "Newest"], ["az", "A–Z"]];

interface State { q: string; status: "all" | Status; tags: string[]; len: string; picks: boolean; sort: string }
const st: State = { q: "", status: "all", tags: [], len: "", picks: false, sort: "last" };
let V: Vault = { games: [], tags: [], count: 0 };
let index: any = null;
let openMenu: "" | "tags" | "len" = "";

// ---------- URL state ----------
function readUrl() {
  const p = new URLSearchParams(location.search);
  st.q = p.get("q") || "";
  const s = p.get("status") as State["status"];
  st.status = s && (STATUS_KEYS as string[]).includes(s) ? s : "all";
  st.tags = (p.get("tags") || "").split(",").map((t) => t.trim()).filter(Boolean);
  st.len = ["short", "medium", "long"].includes(p.get("len") || "") ? p.get("len")! : "";
  st.picks = p.get("picks") === "1";
  st.sort = SORTS.some(([k]) => k === p.get("sort")) ? p.get("sort")! : "last";
}
function writeUrl() {
  const p = new URLSearchParams();
  if (st.q.trim()) p.set("q", st.q.trim());
  if (st.status !== "all") p.set("status", st.status);
  if (st.tags.length) p.set("tags", st.tags.join(","));
  if (st.len) p.set("len", st.len);
  if (st.picks) p.set("picks", "1");
  if (st.sort !== "last") p.set("sort", st.sort);
  const qs = p.toString();
  history.replaceState(null, "", `${location.pathname}${qs ? `?${qs}` : ""}`);
}
const filtering = () => !!(st.q.trim() || st.status !== "all" || st.tags.length || st.len || st.picks || st.sort !== "last");

// ---------- the list ----------
const count = (s: State["status"]) => V.games.filter((g) => s === "all" || g.status === s).length;
function list(): VCard[] {
  let gs = V.games.filter((g) => (st.status === "all" || g.status === st.status) && (!st.picks || g.origin === "community")
    && st.tags.every((t) => g.tags.includes(t)) && (!st.len || lenOf(g) === st.len));
  const q = st.q.trim();
  if (q) {
    const rank = new Map<string, number>();
    search(index, q, { limit: 500 }).forEach((h: any, i: number) => rank.set(h.game.slug, i));
    gs = gs.filter((g) => rank.has(g.slug)).sort((a, b) => rank.get(a.slug)! - rank.get(b.slug)!);
    return gs;
  }
  const cmp: Record<string, (a: VCard, b: VCard) => number> = {
    last: (a, b) => (b.last || 0) - (a.last || 0) || b.wanted - a.wanted || a.sortTitle.localeCompare(b.sortTitle),
    most: (a, b) => b.streams - a.streams || b.minutes - a.minutes,
    score: (a, b) => (b.score ?? -1) - (a.score ?? -1) || (b.last || 0) - (a.last || 0),
    wanted: (a, b) => b.wanted - a.wanted || a.sortTitle.localeCompare(b.sortTitle),
    new: (a, b) => (b.added || 0) - (a.added || 0) || a.sortTitle.localeCompare(b.sortTitle),
    az: (a, b) => a.sortTitle.localeCompare(b.sortTitle, "en"),
  };
  return gs.sort(cmp[st.sort] || cmp.last);
}

// ---------- pieces ----------
function doorHero() {
  const playing = V.games.filter((g) => g.status === "playing").sort((a, b) => (b.last || 0) - (a.last || 0));
  const g = playing[0] || null;
  const { plate, door } = doorParts();
  const label = g ? `The vault door swings open on what Boomer is playing now: ${g.title}` : "The vault door";
  const inside = `<div class="gv-door-inside">${coverHtml(g?.cover ?? null, { alt: "" })}<span class="gv-door-tag">${g ? badge("playing") : tag("Nothing on right now")}</span></div>`;
  const totals = V.games.reduce((a, x) => ({ streams: a.streams + x.streams, minutes: a.minutes + x.minutes }), { streams: 0, minutes: 0 });
  const fin = count("finished"), h = hours(totals.minutes);
  const ledger = `<div class="gv-ledger"><div><b data-count-to="${V.games.length}">${V.games.length}</b><small>games in the Vault</small></div><div><b data-count-to="${totals.streams}">${totals.streams}</b><small>streams</small></div><div><b data-count-to="${h}" data-suffix=" h">${h} h</b><small>on stream</small></div><div><b data-count-to="${fin}">${fin}</b><small>finished</small></div></div>`;
  const now = playing.length
    ? `<p class="gv-nowline"><span>Now playing:</span>${playing.slice(0, 3).map((x, i) => `${i ? `<span>${i === playing.slice(0, 3).length - 1 ? "and" : ","}</span>` : ""}<a href="/games/${encodeURIComponent(x.slug)}">${esc(x.title)}</a>`).join("")}</p>` : "";
  return `<section class="gv-vaulthero"><div class="gv-door-wrap" data-door role="img" aria-label="${esc(label)}">${plate}${inside}${door}</div><div class="gv-vaulthero-copy"><h1 class="bt-title bt-title--hero">The Vault</h1><p>${SUB}</p>${ledger}${now}</div></section>`;
}

function tools() {
  return `<div class="gv-tools"><div class="gv-searchwrap"><label class="bt-search bt-search--lg">${I.search}<input class="bt-input" type="search" data-q autocomplete="off" spellcheck="false" placeholder="Search games, developers, tags…" aria-label="Search the Vault" value="${esc(st.q)}"><span class="bt-search-key" aria-hidden="true">/</span></label><div data-cmd></div></div><select class="bt-select" data-sort aria-label="Sort">${SORTS.map(([k, l]) => `<option value="${k}"${st.sort === k ? " selected" : ""}>${l}</option>`).join("")}</select></div>
  <div class="gv-segrow"><nav class="bt-seg-nav" aria-label="Status" data-seg>${(["all", ...STATUS_KEYS] as State["status"][]).map((s) => `<a href="?status=${s}" data-status="${s}"${st.status === s ? ' aria-current="page"' : ""}>${s === "all" ? "All" : STATUS[s][0]}<span class="bt-chip-n">${count(s)}</span></a>`).join("")}</nav>
  <div class="gv-menu" data-menu="tags"><button type="button" class="bt-chip bt-chip--small bt-chip--menu" data-open="tags" aria-expanded="false" aria-haspopup="true">Tags<span class="bt-chip-n" data-tags-n></span></button></div>
  <div class="gv-menu" data-menu="len"><button type="button" class="bt-chip bt-chip--small bt-chip--menu" data-open="len" aria-expanded="false" aria-haspopup="true">Length</button></div>
  <button type="button" class="bt-chip bt-chip--small" data-picks aria-pressed="false">${I.people}Community picks</button></div>
  <div class="gv-tokens" data-tokens></div>
  <div class="gv-count" data-count></div>`;
}

function tokensHtml() {
  return [
    ...st.tags.map((t) => `<button type="button" class="bt-token" data-untag="${esc(t)}">${esc(t)}<i aria-hidden="true">×</i><span class="bt-sr-only">Remove the ${esc(t)} filter</span></button>`),
    st.len ? `<button type="button" class="bt-token" data-unlen>${esc(LENGTHS.find(([k]) => k === st.len)![1])}<i aria-hidden="true">×</i><span class="bt-sr-only">Remove the length filter</span></button>` : "",
    st.picks ? '<button type="button" class="bt-token" data-unpicks>Community picks<i aria-hidden="true">×</i><span class="bt-sr-only">Remove the Community picks filter</span></button>' : "",
  ].join("");
}

function popover(kind: "tags" | "len") {
  if (kind === "tags") {
    const tags = V.tags.map((t) => `<label class="bt-check"><input type="checkbox" data-tag="${esc(t.tag)}"${st.tags.includes(t.tag) ? " checked" : ""}><span>${esc(t.tag)}</span><span class="bt-popover-n">${t.count}</span></label>`).join("");
    return `<div class="bt-popover" role="group" aria-label="Tags">${tags || '<span class="bt-meta">No tags yet.</span>'}<div class="bt-popover-foot"><button type="button" class="bt-link-btn" data-clear-tags>Clear</button><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-close-menu>Show ${plural(list().length, "game")}</button></div></div>`;
  }
  const opts = [["", "Any length"], ...LENGTHS].map(([k, l]) => `<label class="bt-check"><input type="radio" name="gv-len" data-len="${k}"${st.len === k ? " checked" : ""}><span>${l}</span><span class="bt-popover-n">${k ? V.games.filter((g) => lenOf(g) === k).length : ""}</span></label>`).join("");
  return `<div class="bt-popover" role="group" aria-label="Length">${opts}<div class="bt-popover-foot"><span class="bt-meta">From IGDB's time to beat</span><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-close-menu>Show ${plural(list().length, "game")}</button></div></div>`;
}

function shelf(title: string, sub: string, games: VCard[], { ranked = false, wants = false, status }: { ranked?: boolean; wants?: boolean; status: Status }) {
  if (!games.length) return "";
  const items = games.map((g, i) => ranked
    ? `<div class="bt-ranked"${i < 3 ? ` style="--rk:var(--bt-rank-${i + 1})"` : ""}><span class="bt-rank" aria-hidden="true">${i + 1}</span><div class="gv-want">${vcard(g, { key: false })}${wantButton(g)}</div></div>`
    : wants ? `<div class="gv-want">${vcard(g, { key: false })}${wantButton(g)}</div>` : vcard(g, { key: false })).join("");
  return `<section data-shelf-wrap aria-label="${esc(title)}"><div class="bt-shelf-head"><div><h2 class="bt-heading">${title}</h2>${sub ? `<p>${sub}</p>` : ""}</div><div class="bt-shelf-tools"><span class="bt-shelf-arrows"><button type="button" class="bt-icon-btn" data-shelf-prev aria-label="Scroll ${esc(title)} back">‹</button><button type="button" class="bt-icon-btn" data-shelf-next aria-label="Scroll ${esc(title)} on">›</button></span><button type="button" class="bt-link-btn" data-see="${status}">See all ${count(status)}</button></div></div><div class="bt-shelf${ranked ? " bt-shelf--ranked" : ""}">${items}</div></section>`;
}
/** Most wanted: the top 5 by wants (ranked); before anyone wants anything, the 5 newest wishlist games. */
function mostWanted() {
  const wish = V.games.filter((g) => g.status === "wishlist");
  const wanted = wish.filter((g) => g.wanted > 0).sort((a, b) => b.wanted - a.wanted || (b.added || 0) - (a.added || 0)).slice(0, 5);
  if (wanted.length) return shelf("Most wanted", "What members want Boomer to play next.", wanted, { ranked: true, status: "wishlist" });
  const newest = [...wish].sort((a, b) => (b.added || 0) - (a.added || 0) || a.sortTitle.localeCompare(b.sortTitle)).slice(0, 5);
  return shelf("Most wanted", "Nothing wanted yet. Tap I want this too on a game to be the first.", newest, { wants: true, status: "wishlist" });
}
function shelves() {
  const by = (s: Status, sort: (a: VCard, b: VCard) => number) => V.games.filter((g) => g.status === s).sort(sort);
  const html = shelf("Now playing", "", by("playing", (a, b) => (b.last || 0) - (a.last || 0)), { status: "playing" })
    + mostWanted()
    + shelf("Boomer's best", "Finished, highest score first.", by("finished", (a, b) => (b.score ?? -1) - (a.score ?? -1) || (b.last || 0) - (a.last || 0)), { status: "finished" })
    + shelf("The ones that got away", "Games that beat Boomer's patience.", by("abandoned", (a, b) => (b.last || 0) - (a.last || 0)), { status: "abandoned" });
  return `<div class="gv-rails">${html}</div>`;
}
const allGames = (gs: VCard[]) => `<div class="gv-allhead"><h2 class="bt-heading">All games</h2><span class="bt-meta">${plural(gs.length, "game")}, last streamed first</span></div>${grid(gs)}`;

function addCta(q: string, big = false) {
  const visitor = getAuthState().status === "signedOut";
  return `<button type="button" class="bt-btn bt-btn--primary${big ? "" : " bt-btn--sm"}" data-add-q="${esc(q)}">${visitor ? "Join free to add it" : `${I.plusSm}Add “${esc(q)}”`}</button>`;
}
function noMatch() {
  const q = st.q.trim();
  const what = q ? `“${esc(q)}”` : "those filters";
  return `<div class="bt-empty gv-state"><div class="gv-flash">${mascotSvg()}<span class="gv-beam" aria-hidden="true"></span></div><p class="bt-empty-title">Nothing on the shelf for ${what}</p><span>${q ? "Know the game? Add it and it lands on the Wishlist." : "Try fewer filters."}</span>${q ? addCta(q, true) : '<button type="button" class="bt-btn bt-btn--secondary" data-reset>Clear filters</button>'}</div>`;
}
const mascotSvg = () => document.getElementById("bt-mascot-tpl")?.innerHTML ?? "";
const grid = (gs: VCard[]) => `<div class="bt-cover-grid">${gs.map((g) => vcard(g)).join("")}</div>`;

// ---------- render ----------
let lastGrid = false;
function renderResults() {
  const res = root!.querySelector<HTMLElement>("[data-results]")!;
  const gs = list();
  const filtered = filtering();
  const countEl = root!.querySelector<HTMLElement>("[data-count]")!;
  countEl.innerHTML = filtered
    ? `<span><b>${gs.length}</b> ${gs.length === 1 ? "game" : "games"}${st.q.trim() ? ` for “${esc(st.q.trim())}”` : ""}</span><button type="button" class="bt-link-btn" data-reset>Clear filters</button>`
    : "";
  const html = !filtered ? shelves() + allGames(gs) : gs.length ? grid(gs) : noMatch();
  if (filtered && lastGrid && gs.length) flipSwap(res, html);
  else res.innerHTML = html;
  lastGrid = filtered && gs.length > 0;
  initShelves(res);
  initWants(res);
}
function renderControls() {
  root!.querySelector<HTMLElement>("[data-tokens]")!.innerHTML = tokensHtml();
  root!.querySelectorAll<HTMLAnchorElement>("[data-status]").forEach((a) => { if (a.dataset.status === st.status) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  (root!.querySelector<HTMLElement>("[data-seg]") as any)?._segNav?.place();
  const tn = root!.querySelector<HTMLElement>("[data-tags-n]")!;
  tn.textContent = st.tags.length ? String(st.tags.length) : "";
  const pk = root!.querySelector<HTMLButtonElement>("[data-picks]")!;
  pk.classList.toggle("is-active", st.picks); pk.setAttribute("aria-pressed", String(st.picks));
  const lenBtn = root!.querySelector<HTMLButtonElement>('[data-open="len"]')!;
  lenBtn.classList.toggle("is-active", !!st.len);
  root!.querySelector<HTMLButtonElement>('[data-open="tags"]')!.classList.toggle("is-active", st.tags.length > 0);
  root!.querySelector<HTMLSelectElement>("[data-sort]")!.value = st.sort;
  // an open menu keeps its live "Show N games"
  if (openMenu) { const box = root!.querySelector(`[data-menu="${openMenu}"] .bt-popover-foot .bt-btn`); if (box) box.textContent = `Show ${plural(list().length, "game")}`; }
}
function update() { writeUrl(); renderControls(); renderResults(); }

function toggleMenu(kind: "" | "tags" | "len") {
  root!.querySelectorAll("[data-menu] .bt-popover").forEach((p) => p.remove());
  root!.querySelectorAll<HTMLButtonElement>("[data-open]").forEach((b) => b.setAttribute("aria-expanded", String(b.dataset.open === kind)));
  openMenu = kind;
  if (!kind) return;
  root!.querySelector(`[data-menu="${kind}"]`)!.insertAdjacentHTML("beforeend", popover(kind));
  root!.querySelector<HTMLInputElement>(`[data-menu="${kind}"] input`)?.focus();
}

// ---------- the door ----------
function initDoor() {
  const door = root!.querySelector<HTMLElement>("[data-door]");
  if (!door) return;
  let seen = false;
  try { seen = sessionStorage.getItem(DOOR_KEY) === "1"; } catch { /* storage blocked */ }
  const openNow = () => door.classList.add("is-instant", "is-open");
  if (seen || reduce()) return openNow();
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    try { sessionStorage.setItem(DOOR_KEY, "1"); } catch { /* fine */ }
    setTimeout(() => door.classList.add("is-open"), 350);
  }), { threshold: 0.4 });
  io.observe(door);
  door.addEventListener("click", () => { io.disconnect(); try { sessionStorage.setItem(DOOR_KEY, "1"); } catch { /* fine */ } openNow(); });
}

// ---------- search panel ----------
function cmdGroups(q: string) {
  const hits = search(index, q, { limit: 5 }) as { game: VCard; lit: number[] }[];
  const nq = q.toLowerCase();
  const tagSug = V.tags.map((t) => t.tag).filter((t) => !st.tags.includes(t) && (t.toLowerCase().startsWith(nq) || (nq.length > 2 && t.toLowerCase().includes(nq)))).slice(0, 2);
  const statSug = nq.length > 1 ? STATUS_KEYS.filter((k) => STATUS[k][0].toLowerCase().startsWith(nq) && st.status !== k) : [];
  const visitor = getAuthState().status === "signedOut";
  return [
    { label: "In the Vault", items: hits.map(({ game: g, lit }) => ({ value: { kind: "game", slug: g.slug }, html: `${coverHtml(g.cover, { cls: "bt-cover--sm", size: "sm" })}<b>${litText(g.title, lit, esc)}</b><small>${esc(g.developers[0] || "")}</small>${badge(g.status)}` })) },
    { label: "Filters", items: [
      ...statSug.map((k) => ({ value: { kind: "status", k }, html: `<span class="bt-cmd-ic">${I.filter}</span><b>Only ${STATUS[k][0]}</b><small>${plural(count(k), "game")}</small>` })),
      ...tagSug.map((t) => ({ value: { kind: "tag", t }, html: `<span class="bt-cmd-ic">${I.filter}</span><b>Only ${esc(t)} games</b><small>${plural(V.games.filter((g) => g.tags.includes(t)).length, "game")}</small>` })),
    ] },
    { label: "Not here?", items: [{ value: { kind: "add", q }, html: `<span class="bt-cmd-ic">${I.plusSm}</span><b>${visitor ? "Join free to add" : "Add"} “${esc(q)}” to the Vault</b>` }] },
  ];
}
async function openAdd(q = "") { const { openAddGame } = await import("./add"); openAddGame(q); }

// ---------- boot ----------
function wire() {
  const input = root!.querySelector<HTMLInputElement>("[data-q]")!;
  let t = 0;
  input.addEventListener("input", () => { st.q = input.value; clearTimeout(t); t = window.setTimeout(update, 120); });
  initCmd({
    input, mount: root!.querySelector<HTMLElement>("[data-cmd]")!,
    groups: cmdGroups,
    onChoose: (v: any, q: string) => {
      if (v.kind === "game") { location.href = `/games/${encodeURIComponent(v.slug)}`; return; }
      if (v.kind === "add") { openAdd(q); return; }
      st.q = ""; input.value = "";
      if (v.kind === "status") st.status = v.k;
      if (v.kind === "tag") st.tags = [...st.tags, v.t];
      update();
    },
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable], .bt-portal")) return;
    e.preventDefault();
    input.focus();
    input.scrollIntoView({ block: "center", behavior: reduce() ? "auto" : "smooth" });
  });
  const nav = root!.querySelector<HTMLElement>("[data-seg]")!;
  initSegNav(nav);
  root!.querySelector<HTMLSelectElement>("[data-sort]")!.addEventListener("change", (e) => { st.sort = (e.target as HTMLSelectElement).value; update(); });
  root!.addEventListener("change", (e) => {
    const el = e.target as HTMLInputElement;
    if (el.dataset.tag != null) { st.tags = el.checked ? [...st.tags, el.dataset.tag] : st.tags.filter((x) => x !== el.dataset.tag); update(); }
    if (el.dataset.len != null) { st.len = el.dataset.len; update(); }
  });
  root!.addEventListener("click", (e) => {
    const el = e.target as Element;
    const s = el.closest<HTMLElement>("[data-status]");
    if (s) { e.preventDefault(); st.status = s.dataset.status as State["status"]; update(); return; }
    const see = el.closest<HTMLElement>("[data-see]");
    if (see) { st.status = see.dataset.see as Status; update(); root!.querySelector("[data-seg]")?.scrollIntoView({ block: "center", behavior: reduce() ? "auto" : "smooth" }); return; }
    const op = el.closest<HTMLElement>("[data-open]");
    if (op) { toggleMenu(openMenu === op.dataset.open ? "" : (op.dataset.open as "tags" | "len")); return; }
    if (el.closest("[data-close-menu]")) { toggleMenu(""); return; }
    if (el.closest("[data-clear-tags]")) { st.tags = []; root!.querySelectorAll<HTMLInputElement>("[data-tag]").forEach((c) => { c.checked = false; }); update(); return; }
    if (el.closest("[data-picks]")) { st.picks = !st.picks; update(); return; }
    const ut = el.closest<HTMLElement>("[data-untag]");
    if (ut) { st.tags = st.tags.filter((x) => x !== ut.dataset.untag); update(); return; }
    if (el.closest("[data-unlen]")) { st.len = ""; update(); return; }
    if (el.closest("[data-unpicks]")) { st.picks = false; update(); return; }
    if (el.closest("[data-reset]")) { Object.assign(st, { q: "", status: "all", tags: [], len: "", picks: false, sort: "last" }); input.value = ""; update(); return; }
    const add = el.closest<HTMLElement>("[data-add-q]");
    if (add) { openAdd(add.dataset.addQ || ""); return; }
  });
  document.addEventListener("click", (e) => { if (openMenu && !(e.target as Element).closest("[data-menu]")) toggleMenu(""); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && openMenu) { const k = openMenu; toggleMenu(""); root!.querySelector<HTMLElement>(`[data-open="${k}"]`)?.focus(); } });
}

function showState(kind: "loading" | "error" | "empty") {
  if (kind === "loading") {
    const sk = Array.from({ length: 6 }, (_, i) => `<div class="bt-cover-card gv-wave"><span class="bt-skeleton gv-sk-art" style="--i:${i}"></span><span class="bt-skeleton" style="height:14px;width:80%;--i:${i}"></span></div>`).join("");
    root!.innerHTML = `<div class="gv-body"><div class="gv-loader" role="status">${vaultIcon()}<span>Opening the Vault…</span></div><div class="bt-cover-grid">${sk}</div></div>`;
    return;
  }
  if (kind === "error") {
    root!.innerHTML = `<div class="gv-body"><div class="bt-empty gv-state">${vaultIcon({ size: 56, lamp: "gv-deadlamp" })}<p class="bt-empty-title">The Vault didn't load</p><span>Check your connection and try again.</span><button type="button" class="bt-btn bt-btn--secondary" data-retry>Try again</button></div></div>`;
    root!.querySelector("[data-retry]")!.addEventListener("click", boot);
    return;
  }
  const dust = Array.from({ length: 5 }, (_, i) => `<i style="--i:${i};--x:${(i * 13) % 40}px;--dx:${(i % 2 ? 1 : -1) * (8 + i * 3)}px"></i>`).join("");
  const admin = getAuthState().isAdmin;
  root!.innerHTML = `<div class="gv-body"><div class="bt-empty gv-state"><div class="gv-dust">${vaultIcon()}${dust}</div><p class="bt-empty-title">The Vault is empty</p><span>${admin ? "Add the first game, or import your list with scripts/import-vault.js." : "Boomer's games show up here soon."}</span>${admin ? `<button type="button" class="bt-btn bt-btn--primary" data-add-q="">${I.plusSm}Add a game</button>` : ""}</div></div>`;
  root!.querySelector("[data-add-q]")?.addEventListener("click", () => openAdd(""));
}

async function boot() {
  showState("loading");
  try { V = await loadVault(); } catch (err) { console.error(err); showState("error"); return; }
  if (!V.games.length) { onAuth(() => showState("empty")); return; }
  index = buildIndex(V.games);
  readUrl();
  root!.innerHTML = `${doorHero()}<div class="gv-body">${tools()}<div data-results></div></div>`;
  initDoor();
  initCountUp(root!);
  wire();
  renderControls();
  renderResults();
  onAuth(() => renderResults());   // the Add / Join wording and the want buttons follow sign-in
}

if (root) boot();

// Exposed for the Add dialog: a game it added, or a +1 it recorded, shows without a reload.
export function vaultChanged() { if (root && index) boot(); }
