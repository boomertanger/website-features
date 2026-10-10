// /admin/services markup helpers (docs/specs/service-hub.md §7): icons, the indicator chips, the rating bar, coverage cells, the six tile predicates and
// the Needs attention list. Shared by the views (page.ts) and the detail dialog (detail.ts). Kit classes only (.bt-ind, .bt-rating-bar, .bt-cov-cell).
import { escapeHtml } from "../../../../shared/ui/dom.js";
import type { Row } from "./data";

export const esc = (s: unknown) => escapeHtml(String(s ?? ""));
const svg = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
export const IC: Record<string, string> = {
  grid: svg(`<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>`),
  board: svg(`<rect x="4" y="4" width="4.5" height="16" rx="1.5"/><rect x="10" y="4" width="4.5" height="11" rx="1.5"/><rect x="16" y="4" width="4" height="7" rx="1.5"/>`),
  map: svg(`<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>`),
  inbox: svg(`<path d="M4 13h4l2 3h4l2-3h4"/><path d="M5 5h14l1 8v6H4v-6z"/>`),
  search: svg(`<circle cx="11" cy="11" r="6"/><path d="m20 20-4-4"/>`),
  sync: svg(`<path d="M20 11a8 8 0 0 0-14-4.5L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4.5l2-2.5M20 20v-5h-5"/>`),
  gear: svg(`<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M4.2 7.5l2.2 1.2M17.6 15.3l2.2 1.2M4.2 16.5l2.2-1.2M17.6 8.7l2.2-1.2"/>`),
  check: svg(`<path d="m5 12 5 5 9-10"/>`),
  play: svg(`<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/>`),
  novid: svg(`<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M4 4l16 16"/>`),
  bug: svg(`<path d="M8 9h8v6a4 4 0 0 1-8 0z"/><path d="M12 9V6M9 4.5 10.5 6M15 4.5 13.5 6M4 12h4M16 12h4M5 17l3-1M19 17l-3-1"/>`),
  bulb: svg(`<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>`),
  nope: svg(`<path d="M7 13V4H4v9zM7 13l4 8a2 2 0 0 0 3-2l-1-4h6a2 2 0 0 0 2-2.3l-1.2-6A2 2 0 0 0 17.8 5H7"/>`),
  route: svg(`<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/>`),
  tools: svg(`<path d="M14 6a4 4 0 0 0 5 5l-9 9a2 2 0 0 1-3-3l9-9a4 4 0 0 0-2-2z"/>`),
  quiet: svg(`<circle cx="12" cy="12" r="8"/><path d="M9 10h.01M15 10h.01M9 15h6"/>`),
  // service types
  feature: svg(`<path d="M12 3 4 7v10l8 4 8-4V7z"/><path d="M4 7l8 4 8-4M12 11v10"/>`),
  page: svg(`<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>`),
  arcadeGame: svg(`<rect x="3" y="7" width="18" height="11" rx="4"/><path d="M8 11v3M6.5 12.5h3M15 12h.01M17 14h.01"/>`),
  vaultGame: svg(`<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8M8 13h5"/>`),
  stream: svg(`<circle cx="12" cy="12" r="2"/><path d="M7.5 7.5a6.5 6.5 0 0 0 0 9M16.5 7.5a6.5 6.5 0 0 1 0 9M4.6 4.6a10.5 10.5 0 0 0 0 14.8M19.4 4.6a10.5 10.5 0 0 1 0 14.8"/>`),
  streamSetup: svg(`<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>`),
  video: svg(`<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/>`),
  adminTool: svg(`<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/>`),
};
/** type → [tone, label] */
export const TYPES: Record<string, [string, string]> = {
  feature: ["var(--bt-primary-soft)", "Feature"], page: ["var(--bt-blue)", "Page"], arcadeGame: ["var(--bt-pink)", "Arcade game"], vaultGame: ["var(--bt-gold)", "Vault game"],
  stream: ["var(--bt-red)", "Stream"], streamSetup: ["var(--bt-lime)", "Stream setup"], video: ["var(--bt-red)", "Video"], adminTool: ["var(--bt-gray)", "Admin tool"],
};
const MANIFEST = ["feature", "page", "arcadeGame", "streamSetup", "adminTool"];
export const isManifest = (r: Row) => MANIFEST.includes(r.type);

export const thumb = (r: Row) => `<span class="as-thumb" style="--tc:${TYPES[r.type]?.[0] || "var(--bt-text-muted)"}">${IC[r.type] || IC.feature}</span>`;
const STATUS_BADGE: Record<string, string> = { planned: "bt-badge--gold", building: "bt-badge--blue", live: "bt-badge--lime", retired: "bt-badge--gray" };
export const statusBadge = (r: Row) => `<span class="bt-badge ${STATUS_BADGE[r.status] || ""}">${esc(r.status[0].toUpperCase() + r.status.slice(1))}${r.hidden ? " · hidden" : ""}</span>`;
export const scoreText = (s: number | null) => (s == null ? "–" : (s > 0 ? "+" : "") + s.toFixed(2));
export const cell = (s: "ok" | "old" | "missing" | "bad", text: string) => `<span class="bt-cov-cell" data-s="${s}">${esc(text)}</span>`;
export function ratingBar(r: Row) {
  const { love, like, dislike, n } = r.ratings;
  if (!n) return `<span class="bt-rating-bar"><span class="bt-rating-bar-track"></span><small>No ratings yet</small></span>`;
  const p = (x: number) => ((x / n) * 100).toFixed(1);
  return `<span class="bt-rating-bar"><span class="bt-rating-bar-track"><i data-v="love" style="width:${p(love)}%"></i><i data-v="like" style="width:${p(like)}%"></i><i data-v="nope" style="width:${p(dislike)}%"></i></span><small><b data-v="love">${love}</b> · <b data-v="like">${like}</b> · <b data-v="nope">${dislike}</b></small></span>`;
}
/** The indicator chips: video, tested, bugs, ideas. */
export function inds(r: Row) {
  const v = r.videoState === "current" ? `<span class="bt-ind bt-ind--lime">${IC.play}Video</span>` : r.videoState === "stale" ? `<span class="bt-ind bt-ind--gold">${IC.play}Video stale</span>` : `<span class="bt-ind bt-ind--off">${IC.novid}No video</span>`;
  const cur = r.stagingTest === "current" || r.productionTest === "current", old = r.stagingTest === "old" || r.productionTest === "old";
  const t = cur ? `<span class="bt-ind bt-ind--lime">${IC.check}Tested v${esc(r.version)}</span>` : old ? `<span class="bt-ind bt-ind--gold">${IC.check}Not on v${esc(r.version)}</span>` : `<span class="bt-ind bt-ind--off">${IC.check}Untested</span>`;
  const b = r.bugs.open ? `<span class="bt-ind bt-ind--pink">${IC.bug}${r.bugs.open}</span>` : "";
  const i = r.ideas.open ? `<span class="bt-ind bt-ind--blue">${IC.bulb}${r.ideas.open}</span>` : "";
  return `<span class="bt-inds">${v}${t}${b}${i}</span>`;
}
export function mascot() {
  const t = document.getElementById("as-mascot") as HTMLTemplateElement | null;
  return t ? t.innerHTML : "";
}

// ---------------------------------------------------------------------------------------------- the tiles' predicates
const DAY = 86400000;
/** New Not for me: dislikes in the last 7 days (the rating trigger keeps dislike7d; lastDislikeAt guards a count that has gone quiet since). */
export const nope7 = (r: Row) => (r.ratings.dislike7d > 0 && r.ratings.lastDislikeAt && Date.now() - r.ratings.lastDislikeAt < 7 * DAY ? r.ratings.dislike7d : 0);
/** Not tested on this version: a live or building manifest service that neither environment has tested at its current version. */
export const untested = (r: Row) => isManifest(r) && (r.status === "live" || r.status === "building") && r.stagingTest !== "current" && r.productionTest !== "current";
export const noVideo = (r: Row) => r.status === "live" && r.type !== "adminTool" && r.videoState === "none";
export const staleVideo = (r: Row) => r.status !== "retired" && r.videoState === "stale";
export const quiet = (r: Row) => r.status === "live" && r.type !== "adminTool" && !r.ratings.n && !!r.createdAt && Date.now() - r.createdAt > 14 * DAY;

// ---------------------------------------------------------------------------------------------- Needs attention
export interface Attn { id: string | null; title: string; desc: string; tone: string; icon: string; action: { kind: "open" | "test" | "video" | "bugs" | "copy"; label: string; text?: string } | null }
export function attentionRows(rows: Row[], unclaimed: string[]): Attn[] {
  const out: Attn[] = [];
  const by = (p: (r: Row) => unknown) => rows.filter((r) => !!p(r)).sort((a, b) => a.name.localeCompare(b.name));
  for (const r of by(nope7)) out.push({ id: r.id, title: `${nope7(r)} new Not for me on ${r.name}`, desc: "Read why in the comments, and hide any that break the house rules.", tone: "var(--bt-rate-nope)", icon: "nope", action: { kind: "open", label: "Read them" } });
  for (const r of by(untested)) out.push({ id: r.id, title: `${r.name} v${r.version} isn't tested`, desc: r.stagingTest === "old" || r.productionTest === "old" ? "It was tested on an older version." : "Nobody has marked it tested yet.", tone: "var(--bt-gold)", icon: "check", action: { kind: "test", label: "Mark tested" } });
  for (const r of by(staleVideo)) out.push({ id: r.id, title: `${r.name}'s video is stale`, desc: `It covers v${r.video?.coversVersion || "?"}; the service is on v${r.version}.`, tone: "var(--bt-gold)", icon: "play", action: { kind: "video", label: "Link video" } });
  for (const r of by(noVideo)) out.push({ id: r.id, title: `${r.name} has no video`, desc: "Link a YouTube walkthrough so members can see it in action.", tone: "var(--bt-gray)", icon: "novid", action: { kind: "video", label: "Link video" } });
  for (const r of by(quiet)) out.push({ id: r.id, title: `No ratings on ${r.name}`, desc: "Live for more than 14 days and nobody has rated it. Check its Talk Back strip is on the page.", tone: "var(--bt-blue)", icon: "quiet", action: { kind: "open", label: "Open" } });
  for (const route of unclaimed) out.push({ id: null, title: `Unclaimed route ${route}`, desc: "No manifest lists this page. Add it to a service's routes in services/<id>.json.", tone: "var(--bt-primary-soft)", icon: "route", action: { kind: "copy", label: "Copy route", text: route } });
  for (const r of by((x) => x.needsSetup && x.status !== "retired")) out.push({ id: r.id, title: `${r.name} needs setup`, desc: "Its manifest is missing something (a route, a test plan or checks).", tone: "var(--bt-blue)", icon: "tools", action: { kind: "open", label: "Open" } });
  for (const r of by((x) => x.bugs.open > 0)) out.push({ id: r.id, title: `${r.bugs.open} open bug${r.bugs.open === 1 ? "" : "s"} on ${r.name}`, desc: "Reported in Bug Zapper and linked to this service.", tone: "var(--bt-pink)", icon: "bug", action: { kind: "bugs", label: "Open Bug Zapper" } });
  return out;
}
