// site/src/lib/boomertang/cover.js — Boomertang's covers (docs/specs/boomertang.md §6, §8; mockup boomertang-granny.html): the big cover
// (masthead M1, cover lines, the Verified stamp, the B3 cover code: the decorative barcode beside the real QR code, the S2 cover story) and the
// shelf thumbnails (N2's back issues and the sealed L2 cover). Plain strings, used by the Astro pages at build time and by the newsstand script.
// No game art: the cover art is the placeholder (.tg-art) until the screenshot question is settled (spec §12); sample covers are abstract.
//   mastSvg()                                  the BOOMERTANG masthead, fitted (M1 Didone in gold)
//   coverHtml(issue, { qr })                   the full cover; qr is the build-time SVG (lib/boomertang/qr.js), omitted on samples
//   thumbHtml(issue, { locked, sample })       a small cover for the shelf
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// each style gets its own size and baseline, so tall condensed caps never clip (from the mockup)
const MAST = { vb: 170, y: 150, fs: 178, ff: "var(--tang-serif)", fw: 800, st: "normal" };
const STORY = {
  s1: { vb: 250, y: 226, fs: 268, ff: "var(--tang-serif)", fw: 800, st: "normal" },
  s2: { vb: 262, y: 250, fs: 268, ff: "var(--tang-condensed)", fw: 400, st: "normal" },
  s3: { vb: 250, y: 226, fs: 268, ff: "var(--tang-serif)", fw: 400, st: "italic" },
};
const fit = (t, s, cls, len) => `<svg viewBox="0 0 1000 ${s.vb}" aria-hidden="true" focusable="false"><text class="${cls}" x="${len ? 500 : 0}" y="${s.y}"${len ? ' text-anchor="middle"' : ""} textLength="${len || 1000}" lengthAdjust="spacingAndGlyphs" style="font-family:${s.ff};font-weight:${s.fw};font-style:${s.st};font-size:${s.fs}px">${esc(t)}</text></svg>`;

export const mastSvg = () => fit("BOOMERTANG", MAST, "mt", 940);
const storySvg = (issue) => fit(issue.cover.word, STORY[issue.cover.style] || STORY.s2, "st");
const lines = (arr = []) => arr.map((l) => `<div class="tg-cl${l.big ? " big" : ""}"><b>${esc(l.head)}</b>${esc(l.line)}</div>`).join("");
const art = (issue) => `<span class="tg-art${issue.sample ? ` tg-art--sample tg-art--${esc(issue.cover.art || "a")}` : ""}" aria-hidden="true"></span>`;

export function coverHtml(issue, { qr = "" } = {}) {
  const c = issue.cover;
  return `<div class="tg-cover" role="img" aria-label="${esc(c.alt)}">`
    + art(issue)
    + `<div class="tg-mast" aria-hidden="true">${mastSvg()}</div>`
    + `<div class="tg-dateline"><span>Vol. ${issue.vol} · No. ${issue.no}</span><span>${esc(issue.title)}</span><span>${esc(issue.edition)}</span></div>`
    + (c.linesLeft?.length ? `<div class="tg-coverlines">${lines(c.linesLeft)}</div>` : "")
    + (c.stamp ? `<div class="tg-stamp">${esc(c.stamp.small)}<b>${esc(c.stamp.big)}</b></div>` : "")
    + (c.linesRight?.length ? `<div class="tg-coverlines tg-coverlines--r">${lines(c.linesRight)}</div>` : "")
    + `<div class="tg-barcode" aria-hidden="true"><i></i><small>${esc(c.barcode)}</small></div>`
    + (qr ? `<div class="tg-qrbox">${qr}<small>Scan me</small></div>` : "")
    + `<div class="tg-coverstory"><span class="tg-kick">${esc(c.kicker)}</span><div class="tg-storyword">${storySvg(issue)}</div><p>${esc(c.dek)}</p></div>`
    + (issue.sample ? '<span class="tg-cover-sample">Sample</span>' : "")
    + `</div>`;
}

export const phoneLinesHtml = (issue) => (issue.cover.phoneLines?.length ? `<ul class="tg-phonelines">${issue.cover.phoneLines.map((l) => `<li><b>${esc(l.head)}</b> ${esc(l.line)}</li>`).join("")}</ul>` : "");

const LOCK = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 7V5a4 4 0 1 1 8 0v2h.5A1.5 1.5 0 0 1 14 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13.5v-5A1.5 1.5 0 0 1 3.5 7H4Zm1.6 0h4.8V5a2.4 2.4 0 1 0-4.8 0v2Z"/></svg>';
export const LOCK_SVG = LOCK;
export const OPEN_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M5.6 7V5a2.4 2.4 0 0 1 4.7-.7l1.5-.5A4 4 0 0 0 4 5v2h-.5A1.5 1.5 0 0 0 2 8.5v5A1.5 1.5 0 0 0 3.5 15h9a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 12.5 7H5.6Z"/></svg>';

export function thumbHtml(issue, { locked = false } = {}) {
  return `<div class="tg-thumb">${art(issue)}`
    + `<div class="m" aria-hidden="true">${mastSvg()}</div>`
    + `<div class="dl">Vol. ${issue.vol} · No. ${issue.no}</div>`
    + (issue.sample ? '<span class="smp">Sample</span>' : "")
    + (locked ? `<span class="tg-thumb-lock" title="Locked">${LOCK}</span>` : "")
    + `<div class="s" aria-hidden="true">${storySvg(issue)}</div></div>`;
}
