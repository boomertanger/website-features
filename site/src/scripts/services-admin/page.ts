// /admin/services (docs/specs/service-hub.md §7; mockup service-hub-round-1.html sections 4 to 8; design-system.md §8aa): the hero with Sync now, the six
// filter tiles, the search and the view switch (Grid, Board, Map, Needs attention), the views, and the detail dialog (detail.ts). Owner and admins only:
// the gate is display only, the rules and the callables decide. On load the summary doc is read once; when the build's hash differs from the stored one
// the page syncs on its own. The view is kept in localStorage "bt.services.view"; ?view= and ?service= are deep links.
import { onAuth, type AuthState } from "../../lib/auth";
import { messageFor } from "../../lib/errors";
import { toast } from "../../../../shared/ui/toast.js";
import { zoomFrameHtml, initZoomFrame } from "../../../../shared/ui/zoomframe.js";
import { loadBuild, realApi, previewApi, isPreview, type Api, type Row, type Build } from "./data";
import { esc, IC, TYPES, thumb, statusBadge, ratingBar, inds, scoreText, cell, nope7, untested, noVideo, staleVideo, isManifest, attentionRows, mascot } from "./ui";
import { openDetail, openMarkTested, openLinkVideo, settingsHtml, wireSettings } from "./detail";

type View = "grid" | "board" | "map" | "attention";
type Tile = "all" | "nope" | "untested" | "novid" | "stale" | "bugs";
const VIEWS: [View, string, string][] = [["grid", "grid", "Grid"], ["board", "board", "Board"], ["map", "map", "Map"], ["attention", "inbox", "Needs attention"]];
const VIEW_KEY = "bt.services.view";

const page = document.querySelector<HTMLElement>("[data-as-page]")!;
const root = document.querySelector<HTMLElement>("[data-as-root]")!;
const S = {
  api: null as Api | null, rows: [] as Row[], build: null as Build | null, storedHash: null as string | null, synced: "",
  view: "grid" as View, tile: "all" as Tile, q: "", all: false, grid: "coverage" as "coverage" | "ratings", group: "area" as "area" | "type" | "audience" | "status",
  sort: "loved" as "loved" | "disliked" | "most" | "least" | "newest" | "oldestTest", zones: "area" as "area" | "type", color: "popularity" as "popularity" | "attention" | "video" | "testing",
  sel: "" as string, canGears: false, settings: "" as string,
};

// ---------------------------------------------------------------------------------------------- the gate
let started = false;
onAuth(async (s: AuthState) => {
  const preview = isPreview(!!s.user);
  const access = preview ? "page" : s.status === "loading" ? "loading" : s.status === "signedOut" || s.status === "needsSignup" ? "join" : s.isAdmin ? "page" : "member";
  if (access === "member") { location.replace("/"); return; }
  page.dataset.access = access;
  if (access === "join" && !(window as any).__asJoin) { (window as any).__asJoin = true; document.querySelector<HTMLElement>(".as-gate [data-signin]")?.click(); }
  if (access !== "page" || started) return;
  started = true;
  S.api = preview ? await previewApi() : await realApi();
  S.canGears = preview || (await canSetGears(s));
  await start();
});

/** The owner, or an A2 Overseer and up (display only: setTaskGears checks on the server). */
async function canSetGears(s: AuthState) {
  try {
    const { db, doc, getDoc, SITE_ID } = await import("../../lib/db");
    if ((await getDoc(doc(db, "sites", SITE_ID))).get("ownerUid") === s.user?.uid) return true;
    const { crewMe } = await import("../crew/api");
    const me: any = await crewMe();
    return me?.crew?.track === "admin" && me.crew.grade >= 2;
  } catch { return false; }
}

// ---------------------------------------------------------------------------------------------- loading and syncing
async function start() {
  const q = new URLSearchParams(location.search);
  let stored: string | null = null;
  try { stored = localStorage.getItem(VIEW_KEY); } catch { /* storage off */ }
  const want = (q.get("view") || stored || "grid") as View;
  S.view = VIEWS.some(([k]) => k === want) ? want : "grid";
  root.innerHTML = `<div class="as-empty" aria-busy="true">${mascot()}<p>Loading the services…</p></div>`;
  try {
    const [data, build] = await Promise.all([S.api!.load(), loadBuild()]);
    S.rows = data.rows; S.storedHash = data.storedHash; S.build = build;
    if (build.hash && build.hash !== data.storedHash && build.services.length) await sync(true);
  } catch (err) {
    root.innerHTML = `<div class="as-empty">${mascot()}<p>Couldn't read the services: ${esc(messageFor(err))}</p><button type="button" class="bt-btn bt-btn--secondary" data-as-retry>Try again</button></div>`;
    root.querySelector("[data-as-retry]")?.addEventListener("click", () => void start());
    return;
  }
  render();
  const sid = q.get("service");
  if (sid && S.rows.some((r) => r.id === sid)) void showDetail(sid);
}
async function sync(auto: boolean) {
  if (!S.api || !S.build?.services.length) return;
  try {
    const r = await S.api.sync(S.build);
    const data = await S.api.load();
    S.rows = data.rows; S.storedHash = data.storedHash;
    S.synced = `Synced from build ${S.build.hash.slice(0, 7)}${r.create.length || r.bump.length || r.retire.length ? ` · ${[r.create.length && `${r.create.length} new`, r.bump.length && `${r.bump.length} new version${r.bump.length > 1 ? "s" : ""}`, r.retire.length && `${r.retire.length} retired`].filter(Boolean).join(", ")}` : ""}`;
    if (!auto) toast(S.synced);
  } catch (err) { toast(messageFor(err, "Couldn't sync. Try again."), { kind: "error" }); }
}
export async function refresh(): Promise<Row[]> {
  if (!S.api) return [];
  try { const d = await S.api.load(); S.rows = d.rows; S.storedHash = d.storedHash; } catch { /* keep what we have */ }
  render();
  return S.rows;
}

// ---------------------------------------------------------------------------------------------- what shows
const TILES: [Tile, string, string, (r: Row) => number][] = [
  ["all", "var(--bt-text-faint)", "Services", () => 1],
  ["nope", "var(--bt-rate-nope)", "New Not for me", (r) => nope7(r)],
  ["untested", "var(--bt-gold)", "Not tested on this version", (r) => (untested(r) ? 1 : 0)],
  ["novid", "var(--bt-gray)", "No video", (r) => (noVideo(r) ? 1 : 0)],
  ["stale", "var(--bt-gold)", "Stale video", (r) => (staleVideo(r) ? 1 : 0)],
  ["bugs", "var(--bt-pink)", "Open bugs", (r) => r.bugs.open],
];
const base = () => S.rows.filter((r) => S.all || isManifest(r));
function shown(): Row[] {
  const t = TILES.find(([k]) => k === S.tile)!;
  const q = S.q.trim().toLowerCase();
  return base().filter((r) => (S.tile === "all" || t[3](r) > 0) && (!q || r.name.toLowerCase().includes(q) || r.id.includes(q)));
}

// ---------------------------------------------------------------------------------------------- the frame
const SCENE = `<svg class="as-scene" viewBox="0 0 118 72" aria-hidden="true"><path class="w" d="M20 36 59 18 98 36 59 56z M20 36h78 M59 18v38"/><circle class="nd" cx="20" cy="36" r="8"/><circle class="nd" cx="98" cy="36" r="8"/><circle class="nd" cx="59" cy="18" r="8"/><circle class="nd" cx="59" cy="56" r="8"/><circle class="pk pulse" cx="20" cy="36" r="4"/><circle class="lt" cx="59" cy="18" r="4"/><circle class="gd pulse" cx="98" cy="36" r="4" style="animation-delay:1.2s"/><circle class="lt" cx="59" cy="56" r="4"/></svg>`;
function render() {
  const rows = base(), list = shown(), attn = attentionRows(rows, S.build?.unclaimed || []);
  const hash = S.storedHash ? S.storedHash.slice(0, 7) : "none yet";
  root.innerHTML = `
    <div class="as-hero">${SCENE}<div class="as-hero-txt"><h1>Every service, one place</h1><p>${rows.length} services · build <code class="bt-code">${esc(hash)}</code>${S.synced ? ` · <span class="as-synced">${IC.check}${esc(S.synced)}</span>` : ""}</p></div>
      <div class="as-hero-acts">${S.canGears ? `<button type="button" class="bt-btn bt-btn--sm bt-btn--secondary" data-as-settings>${IC.gear}Settings</button>` : ""}<button type="button" class="bt-btn bt-btn--sm bt-btn--admin" data-as-sync>${IC.sync}Sync now</button></div></div>
    ${S.settings}
    <div class="bt-filter-tiles">${TILES.map(([k, c, l, f]) => `<button type="button" class="bt-filter-tile" style="--tone:${c}" data-as-tile="${k}" aria-pressed="${S.tile === k}"><b>${k === "all" ? rows.length : rows.reduce((a, r) => a + f(r), 0)}</b><span><i></i>${l}</span></button>`).join("")}</div>
    <div class="as-bar"><div class="bt-view-switch" role="radiogroup" aria-label="View">${VIEWS.map(([k, i, l]) => `<button type="button" role="radio" aria-checked="${S.view === k}" data-as-view="${k}">${IC[i]}<span class="${k === "attention" ? "as-hide-n" : ""}">${l}</span>${k === "attention" ? `<span class="as-vn">${attn.length}</span>` : ""}</button>`).join("")}</div>
      <span class="as-sp"></span><button type="button" class="bt-chip bt-chip--small${S.all ? " is-active" : ""}" data-as-all aria-pressed="${S.all}">Include Vault games and streams</button>
      <label class="as-search">${IC.search}<input class="bt-input" type="search" placeholder="Search services" aria-label="Search services" value="${esc(S.q)}" data-as-q></label></div>
    <div data-as-body>${body(list, attn)}</div>`;
  if (S.settings) wireSettings(root, S.api!);
  if (S.view === "map") mountMap(list);
}
function body(list: Row[], attn: ReturnType<typeof attentionRows>) {
  if (S.view === "attention") return attentionHtml(attn);
  if (!list.length) return `<div class="as-empty">${mascot()}<p>${S.q ? "No service matches that search." : "Nothing here: every service is fine on this count."}</p></div>`;
  if (S.view === "board") return boardHtml(list);
  if (S.view === "map") return mapShellHtml();
  return S.grid === "ratings" ? ratingsHtml(list) : coverageHtml(list);
}

// ---------------------------------------------------------------------------------------------- Grid: G2 coverage, G1 ratings
const GROUPS: ["area" | "type" | "audience" | "status", string][] = [["area", "Area"], ["type", "Type"], ["audience", "Audience"], ["status", "Status"]];
const gridBar = (extra: string) => `<div class="as-bar"><span class="bt-sortbar-label">Show</span><div class="bt-view-switch" role="radiogroup" aria-label="Grid style">${[["coverage", "Coverage"], ["ratings", "Ratings"]].map(([k, l]) => `<button type="button" role="radio" aria-checked="${S.grid === k}" data-as-grid="${k}">${l}</button>`).join("")}</div><span class="as-sp"></span>${extra}</div>`;
const openBtn = (r: Row) => `<button type="button" class="as-open as-namecell" data-as-open="${esc(r.id)}">${thumb(r)}<span><span class="as-name">${esc(r.name)}</span><br><span class="as-type">${esc(TYPES[r.type]?.[1] || r.type)}${r.version ? ` · v${esc(r.version)}` : ""}</span></span></button>`;
function cells(r: Row) {
  const planned = r.status === "planned", admin = r.type === "adminTool", dash = (planned || admin) ? cell("missing", "–") : null;
  const n7 = nope7(r);
  return {
    rated: dash || (r.coverage ? cell("ok", `${r.coverage}%`) : r.ratings.n ? cell("old", `${r.ratings.n}`) : cell("missing", "0%")),
    rating: dash || (!r.ratings.n ? cell("missing", "None") : n7 ? cell("bad", `${n7} new`) : cell("ok", scoreText(r.ratings.score))),
    video: planned ? cell("missing", "–") : r.videoState === "current" ? cell("ok", `v${r.video?.coversVersion || r.version}`) : r.videoState === "stale" ? cell("old", "Stale") : cell("missing", "None"),
    staging: planned ? cell("missing", "–") : r.stagingTest === "current" ? cell("ok", r.tests.staging?.result === "issues" ? "Issues" : "✓") : r.stagingTest === "old" ? cell("old", "Older") : cell("missing", "No"),
    prod: planned ? cell("missing", "–") : r.productionTest === "current" ? cell("ok", r.tests.production?.result === "issues" ? "Issues" : "✓") : r.productionTest === "old" ? cell("old", "Older") : cell("missing", "No"),
    member: !r.checks.length || dash ? cell("missing", "–") : r.communityTests && r.communityTests.version === r.version ? cell(r.communityTests.problems ? "bad" : "ok", `${r.communityTests.pass + r.communityTests.problems}`) : cell("missing", "0"),
    bugs: r.bugs.open ? cell("bad", String(r.bugs.open)) : cell("ok", "0"),
    ideas: r.ideas.open ? cell("ok", String(r.ideas.open)) : cell("missing", "0"),
  };
}
function coverageHtml(list: Row[]) {
  const key = (r: Row) => (S.group === "type" ? TYPES[r.type]?.[1] || r.type : S.group === "status" ? r.status[0].toUpperCase() + r.status.slice(1) : S.group === "audience" ? r.audience : r.area);
  const groups = [...new Set(list.map(key))].sort();
  const body = groups.map((g) => `<tr class="as-group"><td colspan="10"><span class="bt-label">${esc(g)}</span></td></tr>` + list.filter((r) => key(r) === g).map((r) => { const c = cells(r); return `<tr data-id="${esc(r.id)}"><td>${openBtn(r)}</td><td>${statusBadge(r)}</td><td>${c.rated}</td><td>${c.rating}</td><td>${c.video}</td><td>${c.staging}</td><td>${c.prod}</td><td>${c.member}</td><td>${c.bugs}</td><td>${c.ideas}</td></tr>`; }).join("")).join("");
  const cards = list.map((r) => { const c = cells(r); return `<button type="button" class="as-mcard" data-as-open="${esc(r.id)}"><span class="as-mcard-top">${thumb(r)}<span><span class="as-name">${esc(r.name)}</span><span class="as-type">v${esc(r.version)} · ${esc(r.status)}</span></span></span><span class="as-mcells"><span class="as-type">Rating</span><span class="as-type">Video</span><span class="as-type">Stage</span><span class="as-type">Prod</span><span class="as-type">Bugs</span>${c.rating}${c.video}${c.staging}${c.prod}${c.bugs}</span></button>`; }).join("");
  return gridBar(`<span class="bt-sortbar-label">Group</span>${GROUPS.map(([k, l]) => `<button type="button" class="bt-chip bt-chip--small${S.group === k ? " is-active" : ""}" data-as-group="${k}">${l}</button>`).join("")}`)
    + `<div class="as-legend"><span>${cell("ok", "")}Done</span><span>${cell("old", "")}Out of date</span><span>${cell("missing", "")}Missing</span><span>${cell("bad", "")}Needs a look</span></div>`
    + `<div class="bt-table-wrap as-wide"><table class="as-matrix"><thead><tr><th>Service</th><th>Status</th><th>Members rated</th><th>Rating</th><th>Video</th><th>Tested staging</th><th>Tested prod</th><th>Member tests</th><th>Bugs</th><th>Ideas</th></tr></thead><tbody>${body}</tbody></table></div>`
    + `<div class="as-cards as-narrow">${cards}</div>`;
}
const SORTS: [typeof S.sort, string][] = [["loved", "Most loved"], ["disliked", "Most disliked"], ["most", "Most rated"], ["least", "Least rated"], ["newest", "Newest version"], ["oldestTest", "Oldest test"]];
function ratingsHtml(list: Row[]) {
  const sc = (r: Row) => r.ratings.score ?? -9;
  const testAt = (r: Row) => Math.max(r.tests.staging?.at || 0, r.tests.production?.at || 0);
  const by: Record<string, (a: Row, b: Row) => number> = {
    loved: (a, b) => sc(b) - sc(a), disliked: (a, b) => b.ratings.dislikePct - a.ratings.dislikePct || b.ratings.dislike - a.ratings.dislike,
    most: (a, b) => b.ratings.n - a.ratings.n, least: (a, b) => a.ratings.n - b.ratings.n,
    newest: (a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }), oldestTest: (a, b) => testAt(a) - testAt(b),
  };
  const rows = list.filter((r) => r.status !== "planned").sort(by[S.sort]);
  return gridBar(`<span class="bt-sortbar-label">Sort</span>${SORTS.map(([k, l], i) => `<button type="button" class="bt-chip bt-chip--small${S.sort === k ? " is-active" : ""}" data-as-sort="${k}">${l}</button>`).join("")}`)
    + `<div class="bt-card as-wide"><div class="bt-table-wrap"><table class="bt-table as-table"><thead><tr><th>Service</th><th>Version</th><th>Status</th><th>Ratings (love · like · not for me)</th><th class="bt-num">Popularity</th><th class="bt-num">Rated by</th><th>Video and tests</th></tr></thead><tbody>`
    + rows.map((r) => `<tr><td>${openBtn(r)}</td><td class="bt-muted">v${esc(r.version)}</td><td>${statusBadge(r)}</td><td>${ratingBar(r)}</td><td class="bt-num as-score">${scoreText(r.ratings.score)}</td><td class="bt-num bt-muted">${r.ratings.n}</td><td>${inds(r)}</td></tr>`).join("")
    + `</tbody></table></div></div><div class="as-cards as-narrow">${rows.map((r) => `<button type="button" class="as-mcard" data-as-open="${esc(r.id)}"><span class="as-mcard-top">${thumb(r)}<span><span class="as-name">${esc(r.name)}</span><span class="as-type">v${esc(r.version)} · popularity ${scoreText(r.ratings.score)}</span></span>${statusBadge(r)}</span>${ratingBar(r)}${inds(r)}</button>`).join("")}</div>`;
}

// ---------------------------------------------------------------------------------------------- Board
function boardHtml(list: Row[]) {
  const cols: [Row["status"], string, string][] = [["planned", "Planned", "var(--bt-gold)"], ["building", "Building", "var(--bt-green)"], ["live", "Live", "var(--bt-lime)"], ["retired", "Retired", "var(--bt-gray)"]];
  return `<div class="bt-kanban">${cols.map(([k, t, c]) => { const it = list.filter((r) => r.status === k); return `<div class="bt-kanban-col" style="--tone:${c}"><div class="bt-kanban-h"><span class="bt-label"><i></i>${t}</span><span class="bt-meta">${it.length}</span></div>`
    + (it.length ? it.map((r) => `<button type="button" class="as-card${nope7(r) ? " is-flag" : ""}" data-as-open="${esc(r.id)}"><span class="as-card-top"><span class="as-type">${esc(TYPES[r.type]?.[1] || r.type)}</span><span class="bt-meta">v${esc(r.version)}</span></span><span class="as-name">${esc(r.name)}</span>${r.status === "live" && r.type !== "adminTool" ? ratingBar(r) : ""}${r.status === "planned" ? "" : inds(r)}</button>`).join("")
      : `<div class="as-empty">${k === "retired" ? `<p>Nothing retired. Retired services keep their ratings.</p>` : `<p>Nothing here.</p>`}</div>`) + `</div>`; }).join("")}</div>`;
}

// ---------------------------------------------------------------------------------------------- Map
const COLORS: [typeof S.color, string][] = [["popularity", "Popularity"], ["attention", "Attention"], ["video", "Video"], ["testing", "Testing"]];
function tone(r: Row, attnIds: Set<string>): string {
  if (S.color === "attention") return attnIds.has(r.id) ? "nope" : "mid";
  if (S.color === "video") return r.videoState === "current" ? "mid" : r.videoState === "stale" ? "nope" : "none";
  if (S.color === "testing") return r.stagingTest === "current" || r.productionTest === "current" ? "mid" : r.stagingTest === "old" || r.productionTest === "old" ? "nope" : "none";
  if (r.status === "planned" || r.status === "building") return "plan";
  const s = r.ratings.score;
  return !r.ratings.n || s == null ? "none" : s >= 1.4 ? "love" : s >= 1.0 ? "mid" : "nope";
}
const LEGEND: Record<string, [string, string][]> = {
  popularity: [["var(--bt-rate-love)", "Loved"], ["var(--bt-rate-like)", "Liked"], ["var(--bt-rate-nope)", "Mixed"], ["var(--bt-gray)", "No ratings"], ["ring", "Not live yet"]],
  attention: [["var(--bt-rate-nope)", "Needs attention"], ["var(--bt-rate-like)", "Fine"]],
  video: [["var(--bt-rate-like)", "Video covers this version"], ["var(--bt-rate-nope)", "Stale video"], ["var(--bt-gray)", "No video"]],
  testing: [["var(--bt-rate-like)", "Tested on this version"], ["var(--bt-rate-nope)", "Tested on an older version"], ["var(--bt-gray)", "Not tested"]],
};
function mapShellHtml() {
  return `<div class="as-bar"><span class="bt-sortbar-label">Color by</span>${COLORS.map(([k, l], i) => `<button type="button" class="bt-chip bt-chip--small${S.color === k ? " is-active" : ""}" data-as-color="${k}">${l}</button>`).join("")}<span class="as-sp"></span><span class="bt-sortbar-label">Zones</span>${[["area", "Area"], ["type", "Type"]].map(([k, l]) => `<button type="button" class="bt-chip bt-chip--small${S.zones === k ? " is-active" : ""}" data-as-zones="${k}">${l}</button>`).join("")}</div>`
    + `<div class="as-legend">${LEGEND[S.color].map(([c, l]) => `<span><i class="as-dot${c === "ring" ? " as-dot--ring" : ""}" style="--c:${c === "ring" ? "transparent" : c}"></i>${l}</span>`).join("")}</div>`
    + `<div class="as-mapbox" data-as-map></div><div data-as-mapcard></div>`;
}
function mountMap(list: Row[]) {
  const box = root.querySelector<HTMLElement>("[data-as-map]");
  if (!box) return;
  const attnIds = new Set(attentionRows(base(), []).map((a) => a.id).filter(Boolean) as string[]);
  const key = (r: Row) => (S.zones === "type" ? TYPES[r.type]?.[1] || r.type : r.area);
  const zones = [...new Set(list.map(key))].sort();
  const html = `<div class="as-map-html"><div class="bt-map-zones">${zones.map((z) => { const it = list.filter((r) => key(r) === z); return `<div class="bt-map-zone${it.length > 6 ? " bt-map-zone--wide" : ""}"><div class="bt-map-zone-h"><span class="bt-label">${esc(z)}</span><small>${it.length} service${it.length === 1 ? "" : "s"}</small></div><div class="bt-map-nodes">${it.map((r) => `<button type="button" class="bt-map-node${S.sel === r.id ? " is-sel" : ""}" data-c="${tone(r, attnIds)}" data-node="${esc(r.id)}">${esc(r.name)}${r.ratings.n && S.color === "popularity" ? `<small>${scoreText(r.ratings.score)}</small>` : ""}</button>`).join("")}</div></div>`; }).join("")}</div></div>`;
  // measure the zones at the drawing's width, then draw them into the zoom frame (a foreignObject) at that size
  const probe = document.createElement("div");
  probe.className = "as-measure"; probe.innerHTML = html; root.appendChild(probe);
  const W = 1200, H = Math.max(400, Math.ceil(probe.firstElementChild!.getBoundingClientRect().height));
  probe.remove();
  box.innerHTML = zoomFrameHtml({ width: W, height: H, label: "Map of the services", inner: `<foreignObject x="0" y="0" width="${W}" height="${H}">${html.replace('<div class="as-map-html">', '<div xmlns="http://www.w3.org/1999/xhtml" class="as-map-html">')}</foreignObject>` });
  initZoomFrame(box.querySelector(".bt-zoomframe"), { width: W, height: H, itemSelector: ".bt-map-node", onTap: (_e: Event, item: HTMLElement | null) => { if (item) selectNode(item.dataset.node || ""); } });
  if (S.sel) drawMapCard();
}
function selectNode(id: string) {
  S.sel = id;
  root.querySelectorAll<HTMLElement>(".bt-map-node").forEach((n) => n.classList.toggle("is-sel", n.dataset.node === id));
  drawMapCard();
}
function drawMapCard() {
  const r = S.rows.find((x) => x.id === S.sel), el = root.querySelector<HTMLElement>("[data-as-mapcard]");
  if (!el) return;
  el.innerHTML = r ? `<div class="as-mapcard">${thumb(r)}<div><span><span class="as-name">${esc(r.name)}</span> <span class="as-type">${esc(TYPES[r.type]?.[1] || r.type)} · v${esc(r.version)}</span></span>${inds(r)}</div><button type="button" class="bt-btn bt-btn--sm bt-btn--admin" data-as-open="${esc(r.id)}">Open</button></div>` : "";
}

// ---------------------------------------------------------------------------------------------- Needs attention
function attentionHtml(rows: ReturnType<typeof attentionRows>) {
  const q = S.q.trim().toLowerCase();
  const list = rows.filter((a) => !q || a.title.toLowerCase().includes(q));
  if (!list.length) return `<div class="as-empty">${mascot()}<p>Nothing needs attention. Every service is rated, tested and has its video.</p></div>`;
  return `<div class="as-attn">${list.map((a, i) => `<div class="bt-row"><span class="as-task-ic" style="--tc:${a.tone}">${IC[a.icon] || ""}</span><div class="bt-row-body"><div class="bt-row-title">${esc(a.title)}</div><div class="bt-row-desc">${esc(a.desc)}</div></div><div class="bt-row-side">${a.action ? `<button type="button" class="bt-btn bt-btn--sm ${a.action.kind === "open" || a.action.kind === "bugs" ? "bt-btn--secondary" : "bt-btn--admin"}" data-as-attn="${i}">${esc(a.action.label)}</button>` : ""}</div></div>`).join("")}</div>`;
}

// ---------------------------------------------------------------------------------------------- the detail dialog and its actions
async function showDetail(id: string) {
  const u = new URL(location.href); u.searchParams.set("service", id); history.replaceState(null, "", u);
  await openDetail({ api: S.api!, id, row: S.rows.find((r) => r.id === id)!, onChange: refresh, onClose: () => { const v = new URL(location.href); v.searchParams.delete("service"); history.replaceState(null, "", v); } });
}

// ---------------------------------------------------------------------------------------------- events
root.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => t.closest<T>(sel);
  const open = q("[data-as-open]"); if (open) { void showDetail(open.dataset.asOpen!); return; }
  const tile = q("[data-as-tile]"); if (tile) { const k = tile.dataset.asTile as Tile; S.tile = S.tile === k || k === "all" ? "all" : k; render(); return; }
  const view = q("[data-as-view]"); if (view) { S.view = view.dataset.asView as View; try { localStorage.setItem(VIEW_KEY, S.view); } catch { /* storage off */ } const u = new URL(location.href); u.searchParams.set("view", S.view); history.replaceState(null, "", u); render(); return; }
  if (q("[data-as-all]")) { S.all = !S.all; render(); return; }
  const g = q("[data-as-grid]"); if (g) { S.grid = g.dataset.asGrid as typeof S.grid; render(); return; }
  const gr = q("[data-as-group]"); if (gr) { S.group = gr.dataset.asGroup as typeof S.group; render(); return; }
  const so = q("[data-as-sort]"); if (so) { S.sort = so.dataset.asSort as typeof S.sort; render(); return; }
  const co = q("[data-as-color]"); if (co) { S.color = co.dataset.asColor as typeof S.color; render(); return; }
  const zo = q("[data-as-zones]"); if (zo) { S.zones = zo.dataset.asZones as typeof S.zones; render(); return; }
  if (q("[data-as-sync]")) { const b = q<HTMLButtonElement>("[data-as-sync]")!; b.disabled = true; void sync(false).then(render); return; }
  if (q("[data-as-settings]")) { if (S.settings) { S.settings = ""; render(); } else void settingsHtml(S.api!).then((h) => { S.settings = h; render(); root.querySelector<HTMLInputElement>("#as-g-test")?.focus(); }); return; }
  const at = q("[data-as-attn]");
  if (at) {
    const a = attentionRows(base(), S.build?.unclaimed || []).filter((x) => !S.q.trim() || x.title.toLowerCase().includes(S.q.trim().toLowerCase()))[Number(at.dataset.asAttn)];
    if (!a || !a.action) return;
    const row = a.id ? S.rows.find((r) => r.id === a.id) : null;
    if (a.action.kind === "open" && row) void showDetail(row.id);
    else if (a.action.kind === "test" && row) void openMarkTested({ api: S.api!, row, onDone: refresh });
    else if (a.action.kind === "video" && row) void openLinkVideo({ api: S.api!, row, onDone: refresh });
    else if (a.action.kind === "bugs") location.href = "/bug-zapper";
    else if (a.action.kind === "copy") { void navigator.clipboard?.writeText(a.action.text || "").then(() => toast("Copied."), () => toast("Couldn't copy.", { kind: "error" })); }
  }
});
root.addEventListener("input", (e) => {
  const t = e.target as HTMLInputElement;
  if (!t.matches("[data-as-q]")) return;
  S.q = t.value;
  const at = t.selectionStart;
  const body = root.querySelector<HTMLElement>("[data-as-body]");
  if (body) { body.innerHTML = (() => { const list = shown(); return (S.view === "attention" ? attentionHtml(attentionRows(base(), S.build?.unclaimed || [])) : !list.length ? `<div class="as-empty">${mascot()}<p>No service matches that search.</p></div>` : S.view === "board" ? boardHtml(list) : S.view === "map" ? mapShellHtml() : S.grid === "ratings" ? ratingsHtml(list) : coverageHtml(list)); })(); if (S.view === "map") mountMap(shown()); }
  t.focus(); try { t.setSelectionRange(at, at); } catch { /* not a text field */ }
});
