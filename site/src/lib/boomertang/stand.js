// site/src/lib/boomertang/stand.js — the newsstand's pieces (docs/specs/boomertang.md §6 "Newsstand (N2)"; mockup boomertang-newsstand.html
// N2 The spread): the latest issue's spread (its cover beside its contents rows, with locks on rows this reader can't open, and Read the
// issue) and the back issues shelf (a grid with an access line under each; at launch the mascot empty state). Plain strings: the Astro page
// draws them at build time for No. 1, and scripts/boomertang/stand.ts redraws them from Firestore (the newest published issue, access).
import { coverHtml, thumbHtml, LOCK_SVG, OPEN_SVG } from "./cover.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const href = (i, slug = "") => `/boomertang/vol-${i.vol}/no-${i.no}${slug ? `/${slug}` : ""}`;
/** The issue's title as an H3 headline: the last word condensed. */
export const titleHed = (t) => { const w = String(t).split(" "); return w.length > 1 ? `${esc(w.slice(0, -1).join(" "))} <em>${esc(w.at(-1))}</em>` : esc(t); };
const accessLine = (a) => `<span class="tg-access${a.open ? " is-open" : ""}">${a.open ? OPEN_SVG : LOCK_SVG}${esc(a.label)}</span>`;

/** The latest issue's spread. a: { open, label } for this reader; qr: the cover's QR SVG (the real issue only). */
export function spreadHtml(i, a, { qr = "", edited = "" } = {}) {
  const cover = i.sample ? `<div class="tg-spreadthumb">${thumbHtml(i, { locked: !a.open })}</div>` : coverHtml(i, { qr });
  const lock = a.open ? "" : `<span class="tg-lockmark">${LOCK_SVG}</span>`;
  const rows = i.contents.map((r) => `<li><a class="tg-tocrow" href="${href(i, r.page)}"><span class="n">${esc(r.n)}</span><span><b>${esc(r.title)}${lock}</b><span class="d">${esc(r.line)}</span></span><span class="k">${esc(r.kind)}</span></a></li>`).join("");
  return `<section class="tg-hero tg-spreadhero" aria-labelledby="tg-latest-h">`
    + `<div class="tg-covercol">${cover}<div class="tg-acts"><a class="bt-btn bt-btn--primary" href="${href(i, "contents")}" data-pulse="tang-read-issue">Read the issue</a></div></div>`
    + `<div class="tg-info"><span class="tg-kicker">Latest issue</span><h2 class="tg-hed" id="tg-latest-h">${titleHed(i.title)}</h2>`
    + `<div class="tg-date"><span><b>Vol. ${i.vol} · No. ${i.no}</b></span><span>${esc(i.edition)}</span>${edited ? `<span class="tg-edit">${esc(edited)}</span>` : ""}</div>`
    + `<p class="tg-dek">${esc(i.about)}</p>${accessLine(a)}`
    + `<ol class="tg-standtoc">${rows}</ol></div></section>`;
}

/** The back issues: newest first. list: [{ issue, access }]. */
export function backIssuesHtml(list, { visitor = true, mascot = "" } = {}) {
  const head = `<div class="tg-back-head"><h2 class="bt-heading" id="back-issues">Back issues</h2>${list.length ? `<p>${visitor ? "Free with Fan Club. Join free to read them all." : "Every past issue, yours to read."}</p>` : ""}</div>`;
  if (!list.length) return `<section class="tg-back" aria-labelledby="back-issues">${head}<div class="tg-empty">${mascot}<div><b>No back issues yet</b><p>No. 1 is the first one. When No. 2 comes out, No. 1 moves here, and it stays free for everyone.</p></div></div></section>`;
  const cards = list.map(({ issue: i, access: a }) => `<a class="tg-issuecard" href="${href(i)}" aria-label="No. ${i.no}, ${esc(i.title)}. ${esc(a.label)}">${thumbHtml(i, { locked: !a.open })}<b>No. ${i.no} · ${esc(i.title)}</b>${accessLine(a)}</a>`).join("");
  return `<section class="tg-back" aria-labelledby="back-issues">${head}<div class="tg-shelf">${cards}</div></section>`;
}
