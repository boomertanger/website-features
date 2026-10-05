// Game Vault UI pieces shared by its pages: status badges, scores, the C5 + C6 cover card
// (evidence marks at rest, the verdict on hover), short dates and hours.
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { reveal as revealOf, metaLine as cardMeta } from "../../../../shared/vault-reveal.js";
import { coverHtml } from "../../../../shared/ui/cover.js";
import { I } from "./art";
import type { VCard, Status } from "./data";

export { esc };
export const STATUS: Record<Status, [string, string]> = {
  playing: ["Playing", "green"], finished: ["Finished", "lime"], abandoned: ["Abandoned", "gray"], wishlist: ["Wishlist", "gold"],
};
export const STATUS_KEYS: Status[] = ["playing", "finished", "abandoned", "wishlist"];

export const badge = (st: Status) => `<span class="bt-badge bt-badge--${STATUS[st][1]}"><span class="bt-badge-dot"></span>${STATUS[st][0]}</span>`;
export const score = (n: number | null | undefined) => n == null
  ? '<span class="bt-score-none">Not rated</span>'
  : `<span class="bt-score" aria-label="Boomer's score ${n} out of 10"><b>${n}</b><small>/10</small></span>`;
export const tag = (t: string, icon = "") => `<span class="bt-tag">${icon}${esc(t)}</span>`;
export const hours = (minutes: number) => Math.round((minutes || 0) / 60);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Sep 26" this year, "Nov 2025" before. */
export function shortDate(ms: number | null | undefined) {
  if (!ms) return "";
  const d = new Date(ms), now = new Date();
  return d.getFullYear() === now.getFullYear() ? `${MONTHS[d.getMonth()]} ${d.getDate()}` : `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
export const longDate = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The line under a card's title; a played game with no streams shows its time to beat, never "Not streamed yet". */
export const metaLine = (g: VCard): string => cardMeta(g);
export const isEarly = (g: { releaseStatus?: string }) => g.releaseStatus === "early_access";

/** The cover card (C5 + C6): tape, stamp, ribbon and pulse on the art; the verdict slides up on hover. */
export function vcard(g: VCard, { key = true }: { key?: boolean } = {}) {
  let over = "";
  if (g.status === "abandoned") over += '<span class="gv-tape" aria-hidden="true">ABANDONED</span>';
  if (g.status === "wishlist" && g.wanted) over += `<span class="gv-stamp" aria-hidden="true">${g.wanted} want it</span>`;
  if (g.score === 10) over += '<span class="gv-ribbon" aria-hidden="true">10/10</span>';
  // The hover panel follows the game: its verdict, else "No review yet" with a status line, else (wishlist) "Not played yet".
  const r = revealOf(g);
  over += `<span class="gv-reveal" aria-hidden="true">${r.quoted ? `<q>${esc(r.title)}</q>` : `<b>${esc(r.title)}</b>`}<span>${esc(r.line)}</span></span>`;
  const extras = g.origin === "community" || isEarly(g)
    ? `<div class="bt-tags">${g.origin === "community" ? tag("Community pick", I.people) : ""}${isEarly(g) ? tag("Early access") : ""}</div>` : "";
  return `<a class="bt-cover-card" href="/games/${encodeURIComponent(g.slug)}"${key ? ` data-key="${esc(g.slug)}"` : ""}>${coverHtml(g.cover, { tilt: true, cls: g.status === "playing" ? "gv-rim" : "", over })}<div class="bt-cover-card-body"><div class="bt-cover-card-title">${esc(g.title)}</div><div class="bt-cover-card-row">${badge(g.status)}${score(g.score)}</div><div class="bt-cover-card-meta">${metaLine(g)}</div>${extras}</div></a>`;
}

export const lenOf = (g: VCard) => (g.ttb == null ? null : g.ttb <= 3 ? "short" : g.ttb <= 10 ? "medium" : "long");
export const LENGTHS: [string, string][] = [["short", "Short, up to 3 h"], ["medium", "Medium, up to 10 h"], ["long", "Long, over 10 h"]];
