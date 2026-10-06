// /games/{slug}, one game (docs/specs/game-vault.md §9; round 2 E4): an ambient banner from the
// game's own cover (it drifts behind film grain and flickers once), the cover tilting toward the
// pointer, the score dial in Boomer's gold, the review, Every stream (a dot per stream sized by
// its length; history from before the site as one hollow dot), about + the IGDB credit, facts,
// where to play (the stores' own marks), and the stats. Community picks get the banner with
// I want this too and, for staff, Hide; admins get Edit; a game with no cover offers
// "Suggest a cover". Round 3 N1 + P12: the banner's top bar has Back to the Vault (with a reminder of
// the list you came from; it returns to that /games URL and scroll position) and the pager ("3 of 14",
// ‹ › with a cover preview, the ← → keys), stepping through that same list in place: the banner
// slides in the direction you moved (not under reduced motion). At the bottom, an Up next card and
// "‹ Previous". The list comes from scripts/vault/context.ts; a direct visit uses the whole Vault,
// last streamed first.
import { coverHtml, coverUrl } from "../../../../shared/ui/cover.js";
import { backHtml, pagerHtml } from "../../../../shared/ui/pager.js";
import { sectionHeadHtml } from "../../../../shared/ui/section-head.js";
import { initSpotlights } from "../../../../shared/ui/spotlight.js";
import { dialHtml, initDials } from "../../../../shared/ui/dial.js";
import { timelineHtml, initTimelines } from "../../../../shared/ui/timeline.js";
import { initCountUp } from "../../../../shared/ui/count-up.js";
import { brandIcon, BRANDS } from "../../../../shared/ui/brand-icons.js";
import { confirmAction } from "../../../../shared/ui/confirm.js";
import { onAuth } from "../../lib/auth";
import { call } from "../../lib/call";
import { messageFor } from "../../lib/errors";
import { loadGame, loadStreamsFor, loadVault, type StreamRow, type VCard, type Vault } from "./data";
import { loadCtx, markRestore, byLastStreamed, DEFAULT_LABEL } from "./context";
import { vaultIcon, I } from "./art";
import { esc, badge, tag, hours, plural, longDate, shortDate, isEarly, metaLine } from "./ui";
import { isStaff, isAdmin } from "./gate";
import { wantButton, initWants } from "./wants";

const root = document.querySelector<HTMLElement>("[data-game]");

function slugFromUrl() {
  const parts = location.pathname.split("/").filter(Boolean);   // ["games", slug]
  const fromPath = parts[0] === "games" && parts[1] && parts[1] !== "view" ? decodeURIComponent(parts[1]) : "";
  return fromPath || new URLSearchParams(location.search).get("slug") || "";
}

let G: any = null;
let streams: StreamRow[] = [];
/** The list this game sits in (round 3 N1 + P12) and the Vault's cards for previews. */
const nav = { slugs: [] as string[], back: "/games", label: DEFAULT_LABEL, cards: new Map<string, VCard>() };
let dir = "";        // "is-next" / "is-prev" for the one render after moving
let moving = false;
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const gameHref = (slug: string) => `/games/${encodeURIComponent(slug)}`;
const ARROW = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 8h10M9 4l4 4-4 4"/></svg>`;

function setupNav(vault: Vault | null, slug: string) {
  nav.cards = new Map((vault?.games || []).map((g) => [g.slug, g]));
  const ctx = loadCtx();
  if (ctx && ctx.slugs.includes(slug)) Object.assign(nav, { slugs: ctx.slugs, back: ctx.url, label: ctx.label });
  else Object.assign(nav, { slugs: [...(vault?.games || [])].sort(byLastStreamed).map((g) => g.slug), back: "/games", label: DEFAULT_LABEL });
}
const neighbour = (d: number): string | null => { const i = nav.slugs.indexOf(G.slug); return i < 0 ? null : nav.slugs[i + d] ?? null; };

function pagebar(g: any) {
  const back = backHtml({ href: nav.back, label: nav.label, long: "Back to the Vault", short: "Vault", attrs: "data-back" });
  const i = nav.slugs.indexOf(g.slug);
  const side = (d: number) => {
    const slug = neighbour(d);
    if (!slug) return null;
    const c = nav.cards.get(slug);
    return { href: gameHref(slug), title: c?.title || slug, meta: c ? metaLine(c) : "", cover: c ? coverHtml(c.cover, { alt: "", size: "sm" }) : "" };
  };
  const pager = i >= 0 && nav.slugs.length > 1 ? pagerHtml({ pos: i + 1, total: nav.slugs.length, prev: side(-1), next: side(1), label: "Games in this list" }) : "";
  return `<div class="gv-pagebar">${back}${pager}</div>`;
}

function upNext() {
  const nx = neighbour(1), pv = neighbour(-1);
  const n = nx ? nav.cards.get(nx) : null, p = pv ? nav.cards.get(pv) : null;
  const by = n ? [n.developers[0], n.release ? new Date(n.release).getFullYear() : null].filter(Boolean).join(", ") : "";
  const card = n ? `<a class="bt-card bt-card--door bt-spotlight gv-upnext" href="${gameHref(n.slug)}" data-pg="1">${coverHtml(n.cover, { alt: "" })}<div><h3>${esc(n.title)}</h3><p>${esc(by ? `${by}. ` : "")}${esc(metaLine(n))}.</p></div><span class="bt-card-go">Next game${ARROW}</span></a>` : "";
  const links = pv ? `<div class="gv-endlinks"><a class="bt-link-btn" href="${gameHref(pv)}" data-pg="-1">‹ Previous: ${esc(p?.title || pv)}</a><a class="bt-link-btn" href="${esc(nav.back)}" data-back>Back to the Vault</a></div>` : "";
  return card || links ? `<div class="gv-endnav">${card ? sectionHeadHtml({ icon: "⏭", title: "Up next", small: true }) : ""}${card}${links}</div>` : "";
}

/** A game-page section (G1): the section head above its card; the card holds the content. */
const sec = (icon: string, title: string, inner: string, meta = "") => `<section>${sectionHeadHtml({ icon, title, meta, small: true })}<div class="bt-card">${inner}</div></section>`;
const mascot = () => document.getElementById("bt-mascot-tpl")?.innerHTML ?? "";
const year = (ms: number | null) => (ms ? new Date(ms).getFullYear() : null);

function totals(g: any) {
  const s = g.stats || {}, l = g.legacy || {};
  return {
    count: (s.streamCount || 0) + (l.streamCount || 0),
    minutes: (s.minutes || 0) + (l.minutes || 0),
    first: s.firstStreamedAt || l.lastStreamedAt || null,      // legacy keeps only a last date
    last: Math.max(s.lastStreamedAt || 0, l.lastStreamedAt || 0) || null,
    legacy: l.streamCount || 0, legacyMinutes: l.minutes || 0,
  };
}

function tools(g: any) {
  const t: string[] = [];
  if (isAdmin()) t.push(`<button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-edit>${I.pencil}<span class="bt-btn-label">Edit</span></button>`);
  if (isStaff() && g.origin === "community") t.push(`<button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-hide>${g.hidden ? I.eye : I.eyeOff}${g.hidden ? "Unhide" : "Hide"}</button>`);
  return t.length ? `<div class="gv-page-tools">${t.join("")}</div>` : "";
}

function hero(g: any) {
  const t = totals(g);
  const art = coverUrl(g.cover);
  const tags = (g.tags?.auto || []).slice(0, 4).map((x: string) => tag(x)).join("");
  const by = [g.developers?.[0], year(g.releaseDate)].filter(Boolean).join(", ");
  const ttb = g.timeToBeat?.normally ? ` About ${g.timeToBeat.normally} hours to beat.` : "";
  const dial = g.review?.score ? dialHtml(g.review.score) : "";
  return `<section class="gv-hero gv-hero--ambient gv-hero--bar${dir ? ` ${dir}` : ""}"><div class="gv-hero-art" aria-hidden="true">${art ? `<img src="${esc(art)}" alt="" referrerpolicy="no-referrer">` : ""}</div><span class="gv-grain" aria-hidden="true"></span>${pagebar(g)}<div class="gv-hero-inner"><span class="gv-cover-tilt">${coverHtml(g.cover, { tilt: true, alt: `${g.title} cover`, eager: true })}</span><div class="gv-hero-text"><div class="gv-badges">${badge(g.status)}${g.origin === "community" ? tag("Community pick", I.people) : ""}${isEarly(g) ? tag("Early access") : ""}${tags}</div><h1 class="bt-title bt-title--hero" tabindex="-1">${esc(g.title)}</h1>${by || ttb ? `<p class="gv-byline">${esc(by)}${by ? "." : ""}${ttb}</p>` : ""}<div class="gv-hero-foot">${t.count ? `<span class="bt-cover-card-meta"><b data-count-to="${t.count}">${t.count}</b> ${t.count === 1 ? "stream" : "streams"}, <b data-count-to="${hours(t.minutes)}">${hours(t.minutes)}</b> hours on stream</span>` : `<span class="bt-cover-card-meta">${g.status === "wishlist" ? "Not streamed yet" : "No streams on record yet"}</span>`}${tools(g)}</div></div>${dial}</div></section>`;
}

function pickBanner(g: any) {
  if (g.origin !== "community") return "";
  const when = g.createdAt ? ` on ${shortDate(g.createdAt)}` : "";
  const wanted = g.status === "wishlist" ? ` <b data-wanted>${g.wantedCount || 0} ${g.wantedCount === 1 ? "person wants" : "people want"}</b> Boomer to play it.` : "";
  return `<div class="gv-pick-banner">${I.people}<span><b>Community pick</b> added by <b>@${esc(g.addedBy?.handle || "a member")}</b>${when}.${wanted}</span>${wantButton({ slug: g.slug, wanted: g.wantedCount || 0, status: g.status }, { big: true })}</div>`;
}

function review(g: any) {
  if (!g.review) {
    const msg = g.status === "wishlist" ? ["Not played yet", "Boomer reviews it once he's streamed it."] : ["No review yet", "Boomer hasn't written this one up."];
    return sec("🎙", "Boomer's review", `<div class="bt-empty bt-empty--compact"><p class="bt-empty-title">${msg[0]}</p><span>${msg[1]}</span></div>`);
  }
  const r = g.review;
  return sec("🎙", "Boomer's review", `${r.verdict ? `<p class="gv-verdict">“${esc(r.verdict)}”</p>` : ""}${r.body ? `<div class="gv-review-body">${esc(r.body)}</div>` : ""}<div class="gv-review-by"><span aria-hidden="true">${mascot()}</span>Boomer${r.updatedAt ? `, updated ${longDate(r.updatedAt)}` : ""}</div>`);
}

function everyStream(g: any) {
  const t = totals(g);
  const real = [...streams].sort((a, b) => a.start - b.start);
  if (!real.length && !t.legacy) {
    return sec("📺", "Every stream", `<div class="bt-empty bt-empty--compact"><p class="bt-empty-title">${g.status === "wishlist" ? "Not streamed yet" : "No streams on record yet"}</p><span>Each stream of this game shows up here.</span></div>`);
  }
  const now = Date.now();
  const legacyAt = g.legacy?.lastStreamedAt || null;
  const first = Math.min(...[real[0]?.start, legacyAt].filter((x): x is number => !!x), now);
  const span = Math.max(1, now - first);
  // History from before the site sits at the start as one hollow dot; real streams spread over the rest.
  const lead = t.legacy ? 0.1 : 0.02;
  const pos = (ms: number) => lead + (1 - lead - 0.03) * ((ms - first) / span);
  const size = (m: number) => Math.round(14 + Math.min(14, m / 20));
  const finishedAt = g.status === "finished" ? real[real.length - 1]?.start : null;
  const points = [
    ...(t.legacy ? [{ at: 0.03, size: 24, legacy: true, title: "Before the site", lines: [`${plural(t.legacy, "stream")}, ${hours(t.legacyMinutes)} h`, "Counted, but not listed one by one"], aria: `${plural(t.legacy, "stream")} before the site, ${hours(t.legacyMinutes)} hours` }] : []),
    ...real.map((s) => {
      const len = `${Math.floor(s.minutes / 60)} h ${String(s.minutes % 60).padStart(2, "0")} m`;
      const fin = s.start === finishedAt;
      return { at: pos(s.start), size: size(s.minutes), title: longDate(s.start), lines: [len, ...(fin ? ["Finished it"] : []), ...(s.title ? [s.title] : [])], aria: `${longDate(s.start)}, ${len}${fin ? ", finished it" : ""}`, flag: fin ? "🏁" : "" };
    }),
  ];
  const keys = [{ label: "A stream (size = length)" }, ...(t.legacy ? [{ cls: "is-legacy", label: "Before the site" }] : []), ...(finishedAt ? [{ flag: "🏁", label: "Finished it" }] : [])];
  const site = real.length ? { at: pos(real[0].start), label: t.legacy ? "On the site" : "" } : null;
  return sec("📺", "Every stream", timelineHtml({ points, site, ends: [shortDate(first), "Today"], keys, label: `Every stream of ${g.title}` }), `${plural(t.count, "stream")}, ${hours(t.minutes)} hours`);
}

function about(g: any) {
  if (!g.summary) return "";
  const fromIgdb = !!g.ids?.igdb;
  return sec("📖", "About the game", `<p class="gv-about">${esc(g.summary)}</p>${fromIgdb ? '<span class="gv-credit">Game info from IGDB</span>' : ""}`);
}

function facts(g: any) {
  const rows: [string, string][] = [];
  if (g.developers?.length) rows.push(["Developer", g.developers.join(", ")]);
  if (g.publishers?.length && g.publishers.join() !== g.developers?.join()) rows.push(["Publisher", g.publishers.join(", ")]);
  if (g.releaseDate) rows.push(["Released", g.releaseStatus === "unreleased" ? `Coming ${longDate(g.releaseDate)}` : longDate(g.releaseDate)]);
  else if (g.releaseStatus === "unreleased") rows.push(["Released", "Not out yet"]);
  if (isEarly(g)) rows.push(["Status", "Early access"]);
  if (g.timeToBeat?.normally) rows.push(["Time to beat", `About ${g.timeToBeat.normally} hours${g.timeToBeat.hastily ? ` (${g.timeToBeat.hastily} rushed)` : ""}`]);
  if (g.createdAt) rows.push(["In the Vault", `Since ${shortDate(g.createdAt)}`]);
  if (g.tags?.boomer?.length) rows.push(["Boomer's tags", g.tags.boomer.join(", ")]);
  return rows.length ? sec("📋", "Details", `<dl class="gv-facts">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`) : "";
}

function where(g: any) {
  const L = g.links || {};
  const items = (["steam", "gog", "itch", "epic"] as const).filter((k) => L[k]).map((k) => `<a class="bt-btn bt-btn--secondary bt-btn--sm" href="${esc(L[k])}" target="_blank" rel="noopener">${brandIcon(k)}${BRANDS[k].name}</a>`);
  if (L.official) items.push(`<a class="bt-btn bt-btn--secondary bt-btn--sm" href="${esc(L.official)}" target="_blank" rel="noopener">${I.globe}Official site</a>`);
  return items.length ? sec("🛒", "Where to play", `<div class="gv-where">${items.join("")}</div>`) : "";
}

function stats(g: any) {
  const t = totals(g);
  if (!t.count) return "";
  const h = hours(t.minutes);
  return sec("📊", "On stream", `<div class="bt-stack" style="gap:8px"><div class="gv-stats"><div class="gv-stat"><b data-count-to="${t.count}">${t.count}</b><small>${t.count === 1 ? "stream" : "streams"}</small></div><div class="gv-stat"><b data-count-to="${h}" data-suffix=" h">${h} h</b><small>on stream</small></div><div class="gv-stat"><b>${t.first ? shortDate(t.first) : "–"}</b><small>first streamed</small></div><div class="gv-stat"><b>${t.last ? shortDate(t.last) : "–"}</b><small>last streamed</small></div></div>${t.legacy ? `<span class="gv-stats-note">Includes ${plural(t.legacy, "stream")} from before the site.</span>` : ""}</div>`);
}

function suggest(g: any) {
  if (g.cover) return "";
  return `<div class="gv-suggest"><span>No cover yet.</span><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-suggest>${I.image}Suggest a cover</button></div>`;
}

function render() {
  const g = G;
  document.title = `${g.title} · Game Vault · Boomertanger`;
  const hiddenNote = g.hidden ? '<p class="gv-hidden-note">Hidden from the Vault. Only staff can see this page.</p>' : "";
  const top = [hiddenNote, pickBanner(g), suggest(g)].filter(Boolean).join("");
  root!.innerHTML = `${hero(g)}${top ? `<div class="gv-body" style="padding-bottom:0">${top}</div>` : ""}<div class="gv-cols"><div class="gv-col">${review(g)}<div class="gv-every" data-every>${everyStream(g)}</div>${about(g)}${upNext()}</div><aside class="gv-col">${facts(g)}${where(g)}${stats(g)}</aside></div>`;
  initDials(root!);
  initCountUp(root!);
  initTimelines(root!);
  initSpotlights(root!);
  initWants(root!, (_slug, n) => {
    G.wantedCount = n;
    const el = root!.querySelector("[data-wanted]");
    if (el) el.textContent = `${n} ${n === 1 ? "person wants" : "people want"}`;
  });
}

function notFound() {
  document.title = "Not in the Vault · Boomertanger";
  root!.innerHTML = `<div class="gv-body"><div class="bt-empty gv-state"><div class="gv-flash">${mascot()}<span class="gv-beam" aria-hidden="true"></span></div><p class="bt-empty-title">That game isn't in the Vault</p><span>It may have been removed, or the link is wrong.</span><a class="bt-btn bt-btn--secondary" href="/games">Back to the Vault</a></div></div>`;
}

/** Only Every stream changes when the streams arrive, so a banner mid-slide isn't redrawn. */
function renderStreams() {
  const box = root!.querySelector<HTMLElement>("[data-every]");
  if (!box) return render();
  box.innerHTML = everyStream(G);
  initTimelines(box);
}
async function loadStreams(slug: string) {
  try { const s = await loadStreamsFor(slug); if (G?.slug === slug) { streams = s; renderStreams(); } } catch (err) { console.warn("vault: streams didn't load", err); }
}

/** Previous / next in place: load the game, swap the page, keep the address in step. */
async function go(d: number, from: "pager" | "key" | "card" | "" = "") {
  const slug = neighbour(d);
  if (!slug || moving) return;
  moving = true;
  let next: any = null;
  try { next = await loadGame(slug); } catch { next = null; }
  moving = false;
  if (!next) { location.href = gameHref(slug); return; }
  G = next; streams = [];
  history.pushState({ slug }, "", gameHref(slug));
  dir = reduce() ? "" : d > 0 ? "is-next" : "is-prev";
  render();
  dir = "";
  const heroEl = root!.querySelector<HTMLElement>(".gv-hero");
  if (heroEl && heroEl.getBoundingClientRect().top < 0) scrollTo({ top: 0, behavior: "auto" });
  if (from === "pager") (root!.querySelector<HTMLElement>(`.bt-pager-btn[data-pg="${d}"]`) || root!.querySelector<HTMLElement>(".bt-pager-btn"))?.focus();
  else if (from === "card") root!.querySelector<HTMLElement>(".gv-hero h1")?.focus();
  void loadStreams(slug);
}

async function boot() {
  const slug = slugFromUrl();
  if (!slug) return notFound();
  let vault: Vault | null = null;
  try {
    [G, vault] = await Promise.all([loadGame(slug), loadVault().catch(() => null)]);
  } catch (err: any) {
    if (err?.code === "permission-denied") return notFound();   // a hidden game, for someone who isn't staff
    root!.innerHTML = `<div class="gv-body"><div class="bt-empty gv-state">${vaultIcon({ size: 56, lamp: "gv-deadlamp" })}<p class="bt-empty-title">This game didn't load</p><span>Check your connection and try again.</span><button type="button" class="bt-btn bt-btn--secondary" data-retry>Try again</button></div></div>`;
    root!.querySelector("[data-retry]")!.addEventListener("click", boot);
    return;
  }
  if (!G) return notFound();
  setupNav(vault, slug);
  render();
  await loadStreams(slug);
  onAuth(() => render());   // staff tools and the want button follow sign-in
}

addEventListener("popstate", async () => {
  const slug = slugFromUrl();
  if (!slug || slug === G?.slug) return;
  const g = await loadGame(slug).catch(() => null);
  if (!g) { location.reload(); return; }
  G = g; streams = [];
  render();
  void loadStreams(slug);
});

// ← → step through the list, unless you're typing, a dialog is open, or a dot on the timeline has focus.
document.addEventListener("keydown", (e) => {
  if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || !G) return;
  const t = e.target as Element | null;
  if (t?.closest?.("input, textarea, select, [contenteditable], .bt-timeline") || document.querySelector(".bt-portal")) return;
  const d = e.key === "ArrowRight" ? 1 : -1;
  if (!neighbour(d)) return;
  e.preventDefault();
  void go(d, t?.closest?.(".bt-pager") ? "pager" : "key");
});

root?.addEventListener("click", async (e) => {
  const el = e.target as Element;
  const me = e as MouseEvent;
  const pg = el.closest<HTMLAnchorElement>("[data-pg]");
  if (pg && !me.metaKey && !me.ctrlKey && !me.shiftKey && me.button === 0) {
    e.preventDefault();
    void go(Number(pg.dataset.pg), pg.classList.contains("gv-upnext") ? "card" : pg.closest(".bt-pager") ? "pager" : "");
    return;
  }
  if (el.closest("[data-back]")) { markRestore(); return; }
  if (el.closest("[data-edit]")) { const { openEditor } = await import("./edit"); openEditor(G, { onSaved: boot }); return; }
  if (el.closest("[data-suggest]")) { const { openCoverSuggest } = await import("./cover-suggest"); openCoverSuggest({ slug: G.slug, title: G.title }); return; }
  if (el.closest("[data-hide]")) {
    const hiding = !G.hidden;
    const who = G.addedBy?.handle ? `@${G.addedBy.handle}` : "the member who added it";
    confirmAction({
      title: hiding ? `Hide ${G.title}?` : `Unhide ${G.title}?`,
      message: hiding ? `It leaves the Vault and its updates, and ${who} can't add games for 7 days.` : "It comes back to the Vault.",
      confirmLabel: hiding ? "Hide" : "Unhide", busyLabel: hiding ? "Hiding…" : "Unhiding…", danger: false, feature: "game-vault",
      onConfirm: async () => {
        try { await call("vaultHideGame", { slug: G.slug, hidden: hiding }); }
        catch (err) { throw new Error(messageFor(err)); }
        G.hidden = hiding;
        render();
      },
    });
  }
});

if (root) boot();
