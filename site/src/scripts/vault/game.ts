// /games/{slug}, one game (docs/specs/game-vault.md §9; round 2 E4): an ambient banner from the
// game's own cover (it drifts behind film grain and flickers once), the cover tilting toward the
// pointer, the score dial in Boomer's gold, the review, Every stream (a dot per stream sized by
// its length; history from before the site as one hollow dot), about + the IGDB credit, facts,
// where to play (the stores' own marks), and the stats. Community picks get the banner with
// I want this too and, for staff, Hide; admins get Edit; a game with no cover offers
// "Suggest a cover".
import { coverHtml, coverUrl } from "../../../../shared/ui/cover.js";
import { dialHtml, initDials } from "../../../../shared/ui/dial.js";
import { timelineHtml, initTimelines } from "../../../../shared/ui/timeline.js";
import { initCountUp } from "../../../../shared/ui/count-up.js";
import { brandIcon, BRANDS } from "../../../../shared/ui/brand-icons.js";
import { confirmAction } from "../../../../shared/ui/confirm.js";
import { onAuth } from "../../lib/auth";
import { call } from "../../lib/call";
import { messageFor } from "../../lib/errors";
import { loadGame, loadStreamsFor, type StreamRow } from "./data";
import { vaultIcon, I } from "./art";
import { esc, badge, tag, hours, plural, longDate, shortDate, isEarly } from "./ui";
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
  return `<section class="gv-hero gv-hero--ambient"><div class="gv-hero-art" aria-hidden="true">${art ? `<img src="${esc(art)}" alt="" referrerpolicy="no-referrer">` : ""}</div><span class="gv-grain" aria-hidden="true"></span><div class="gv-hero-inner"><span class="gv-cover-tilt">${coverHtml(g.cover, { tilt: true, alt: `${g.title} cover`, eager: true })}</span><div class="gv-hero-text"><div class="gv-badges">${badge(g.status)}${g.origin === "community" ? tag("Community pick", I.people) : ""}${isEarly(g) ? tag("Early access") : ""}${tags}</div><h1 class="bt-title bt-title--hero">${esc(g.title)}</h1>${by || ttb ? `<p class="gv-byline">${esc(by)}${by ? "." : ""}${ttb}</p>` : ""}<div class="gv-hero-foot">${t.count ? `<span class="bt-cover-card-meta"><b data-count-to="${t.count}">${t.count}</b> ${t.count === 1 ? "stream" : "streams"}, <b data-count-to="${hours(t.minutes)}">${hours(t.minutes)}</b> hours on stream</span>` : '<span class="bt-cover-card-meta">Not streamed yet</span>'}${tools(g)}</div></div>${dial}</div></section>`;
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
    return `<section class="bt-card"><h2 class="bt-card-title">Boomer's review</h2><div class="bt-empty bt-empty--compact"><p class="bt-empty-title">${msg[0]}</p><span>${msg[1]}</span></div></section>`;
  }
  const r = g.review;
  return `<section class="bt-card"><h2 class="bt-card-title">Boomer's review</h2>${r.verdict ? `<p class="gv-verdict">“${esc(r.verdict)}”</p>` : ""}${r.body ? `<div class="gv-review-body">${esc(r.body)}</div>` : ""}<div class="gv-review-by"><span aria-hidden="true">${mascot()}</span>Boomer${r.updatedAt ? `, updated ${longDate(r.updatedAt)}` : ""}</div></section>`;
}

function everyStream(g: any) {
  const t = totals(g);
  const real = [...streams].sort((a, b) => a.start - b.start);
  if (!real.length && !t.legacy) {
    return `<section class="bt-card"><div class="bt-card-head"><h2 class="bt-card-title">Every stream</h2></div><div class="bt-empty bt-empty--compact"><p class="bt-empty-title">Not streamed yet</p><span>Each stream of this game shows up here.</span></div></section>`;
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
  return `<section class="bt-card"><div class="bt-card-head"><h2 class="bt-card-title">Every stream</h2><span class="bt-card-meta">${plural(t.count, "stream")}, ${hours(t.minutes)} hours</span></div>${timelineHtml({ points, site, ends: [shortDate(first), "Today"], keys, label: `Every stream of ${g.title}` })}</section>`;
}

function about(g: any) {
  if (!g.summary) return "";
  const fromIgdb = !!g.ids?.igdb;
  return `<section class="bt-card"><h2 class="bt-card-title">About the game</h2><p class="gv-about">${esc(g.summary)}</p>${fromIgdb ? '<span class="gv-credit">Game info from IGDB</span>' : ""}</section>`;
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
  return rows.length ? `<section class="bt-card"><dl class="gv-facts">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl></section>` : "";
}

function where(g: any) {
  const L = g.links || {};
  const items = (["steam", "gog", "itch", "epic"] as const).filter((k) => L[k]).map((k) => `<a class="bt-btn bt-btn--secondary bt-btn--sm" href="${esc(L[k])}" target="_blank" rel="noopener">${brandIcon(k)}${BRANDS[k].name}</a>`);
  if (L.official) items.push(`<a class="bt-btn bt-btn--secondary bt-btn--sm" href="${esc(L.official)}" target="_blank" rel="noopener">${I.globe}Official site</a>`);
  return items.length ? `<section class="bt-card"><div class="bt-stack" style="gap:10px"><span class="bt-label">Where to play</span><div class="gv-where">${items.join("")}</div></div></section>` : "";
}

function stats(g: any) {
  const t = totals(g);
  if (!t.count) return "";
  const h = hours(t.minutes);
  return `<section class="bt-card"><h2 class="bt-card-title">On stream</h2><div class="bt-stack" style="gap:8px"><div class="gv-stats"><div class="gv-stat"><b data-count-to="${t.count}">${t.count}</b><small>${t.count === 1 ? "stream" : "streams"}</small></div><div class="gv-stat"><b data-count-to="${h}" data-suffix=" h">${h} h</b><small>on stream</small></div><div class="gv-stat"><b>${t.first ? shortDate(t.first) : "–"}</b><small>first streamed</small></div><div class="gv-stat"><b>${t.last ? shortDate(t.last) : "–"}</b><small>last streamed</small></div></div>${t.legacy ? `<span class="gv-stats-note">Includes ${plural(t.legacy, "stream")} from before the site.</span>` : ""}</div></section>`;
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
  root!.innerHTML = `${hero(g)}${top ? `<div class="gv-body" style="padding-bottom:0">${top}</div>` : ""}<div class="gv-cols"><div class="gv-col">${review(g)}${everyStream(g)}${about(g)}</div><aside class="gv-col">${facts(g)}${where(g)}${stats(g)}</aside></div>`;
  initDials(root!);
  initCountUp(root!);
  initTimelines(root!);
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

async function boot() {
  const slug = slugFromUrl();
  if (!slug) return notFound();
  try {
    G = await loadGame(slug);
  } catch (err: any) {
    if (err?.code === "permission-denied") return notFound();   // a hidden game, for someone who isn't staff
    root!.innerHTML = `<div class="gv-body"><div class="bt-empty gv-state">${vaultIcon({ size: 56, lamp: "gv-deadlamp" })}<p class="bt-empty-title">This game didn't load</p><span>Check your connection and try again.</span><button type="button" class="bt-btn bt-btn--secondary" data-retry>Try again</button></div></div>`;
    root!.querySelector("[data-retry]")!.addEventListener("click", boot);
    return;
  }
  if (!G) return notFound();
  render();
  try { streams = await loadStreamsFor(slug); render(); } catch (err) { console.warn("vault: streams didn't load", err); }
  onAuth(() => render());   // staff tools and the want button follow sign-in
}

root?.addEventListener("click", async (e) => {
  const el = e.target as Element;
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
