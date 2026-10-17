// site/src/lib/boomertang/render.js — Boomertang's one page renderer (docs/specs/boomertang.md §4b). It turns an issue page (Markdown with
// a small front matter, fenced magazine blocks and inline fact tags) into the page's HTML, the same way at build time (public issues, whose
// text is in the repo) and in the browser (members-only issues, whose text is seeded into Firestore), so both look the same. Plain ESM with
// JSDoc: the Astro pages, the client and scripts/check-boomertang.js all import it. It never touches the DOM.
//
//   renderPage(md, ctx)  -> { meta, html, tags, blocks }
//     md    the page file: front matter between --- lines, then the body
//     ctx   { issue (issues.json entry), sources: { [id]: source }, hrefFor(slug) -> URL of a page in this issue, art: { photo } }
//   parsePage(md)        -> { meta, body } (no rendering; the check script uses it)
//   scanTags(text)       -> [{ trust, source, raw }] every inline fact tag
//
// Front matter (one "key: value" per line): kicker, hed (*word* is the one condensed word, H3), dek, byline (items split by " · "),
// sample (the byline's Sample text label), folio (the folio's right side), layout (plain | spread | columns), drop (true: a drop cap
// on the first paragraph), photo (spread: the figure's caption; the art is the placeholder until screenshots are cleared), wide (true:
// the page is The Map's dark frame).
//
// Inline: {tag:off|ver|com|fan source=<sourceId>} a fact tag linked to the source in The Index; {sample} the Sample text label.
// Blocks (```name ... ```): facts (value | label per line), pull (the quote, then "— attribution"), note (first line is the title),
// tree, rooms, secrets, tally, runs, polls, board, rules, index, map (JSON, except facts, pull and note), column (layout columns: starts
// the second column; empty).
import { Marked } from "marked";
import { factagHtml, TRUST } from "../../../../shared/ui/magazine.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const TAG_RE = /\{tag:(off|ver|com|fan|[a-z]*)(?:\s+source=([a-z0-9-]*))?\s*\}/g;
const SAMPLE = '<span class="tg-sample">Sample text</span>';
export const BLOCKS = ["facts", "pull", "note", "tree", "rooms", "secrets", "tally", "runs", "polls", "board", "rules", "index", "map", "column"];
const FLOOR_NAMES = { base: "Basement", main: "Main floor", upper: "Upstairs", attic: "Attic", out: "Outside" };

/** Front matter and body. */
export function parsePage(md) {
  const text = String(md).replace(/\r\n/g, "\n");
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  const meta = {};
  if (m) for (const line of m[1].split("\n")) {
    const kv = /^([a-zA-Z][\w-]*):\s*(.*)$/.exec(line.trim());
    if (!kv) continue;
    let v = kv[2].trim();
    if (/^".*"$/.test(v)) v = v.slice(1, -1);
    meta[kv[1]] = v === "true" ? true : v === "false" ? false : v;
  }
  return { meta, body: m ? text.slice(m[0].length) : text };
}

/** Every inline fact tag in a piece of text. */
export function scanTags(text) {
  return [...String(text).matchAll(TAG_RE)].map((m) => ({ trust: m[1], source: m[2] || "", raw: m[0] }));
}

/** The fenced blocks in a body: [{ name, text }]. */
export function scanBlocks(body) {
  return [...String(body).matchAll(/^```([a-z-]+)\n([\s\S]*?)^```\s*$/gm)].map((m) => ({ name: m[1], text: m[2] }));
}

/** H3 headline: *word* is the condensed word (rendered as <em>). */
export const hedHtml = (s) => esc(s).replace(/\*([^*]+)\*/g, "<em>$1</em>");

export function renderPage(md, ctx) {
  const { meta, body } = parsePage(md);
  const sources = ctx.sources || {};
  const tags = [], blocks = [];
  const tagHtml = (trust, source) => {
    tags.push({ trust, source });
    const s = sources[source];
    if (!TRUST[trust]) return "";
    return factagHtml({ trust, version: trust === "ver" ? s?.version || "" : "", href: s ? `${ctx.hrefFor("the-index")}#src-${source}` : "", sourceTitle: s?.title || "" });
  };
  /** Inline Markdown plus fact tags and {sample}. */
  const inline = (s) => marked.parseInline(String(s ?? "")).replace(TAG_RE, (_, t, src) => tagHtml(t, src || "")).replace(/\{sample\}/g, SAMPLE);
  const json = (name, text) => {
    try { return JSON.parse(text); } catch (e) { throw new Error(`boomertang: the ${name} block isn't valid JSON (${e.message})`); }
  };
  const tagOf = (o) => (o.trust ? tagHtml(o.trust, o.source || "") : "");
  const sampleOf = (o) => (o.sample ? ` ${SAMPLE}` : "");

  const R = {
    facts: (t) => `<div class="tg-facts">${t.trim().split("\n").filter(Boolean).map((l) => { const [v, k] = l.split("|").map((x) => x.trim()); return `<div><b>${esc(v)}</b><span>${esc(k)}</span></div>`; }).join("")}</div>`,
    pull: (t) => { const lines = t.trim().split("\n"); const by = lines.findIndex((l) => /^—\s/.test(l)); const q = (by < 0 ? lines : lines.slice(0, by)).join(" "); return `<blockquote class="tg-pull"><p>${inline(q)}</p>${by >= 0 ? `<small>${inline(lines[by].replace(/^—\s*/, ""))}</small>` : ""}</blockquote>`; },
    note: (t) => { const [head, ...rest] = t.trim().split("\n"); return `<aside class="tg-note"><b>${inline(head)}</b>${inline(rest.join(" "))}</aside>`; },
    tree: (t) => {
      const d = json("tree", t);
      const person = (p) => `<button type="button" class="tg-person${p.fan ? " fan" : ""}" data-person="${esc(p.id)}" aria-controls="tg-say-${esc(p.id)}" aria-expanded="false"><b>${esc(p.name)}</b><span>${esc(p.kind)}</span><small>${esc(TRUST[p.trust] || "")}</small></button>`;
      return `<div class="tg-legend"><span><i></i>Shown in the games</span><span><i class="d"></i>Fan theory or fan name</span><span>Tap anyone for the sources</span></div>`
        + `<div class="tg-tree">${d.generations.map((g, i) => `<div class="tg-gen${d.dashedLinks?.includes(i) ? " fanlink" : ""}">${g.map(person).join("")}</div>`).join("")}</div>`
        + `<div class="tg-says">${d.generations.flat().map((p) => `<p class="tg-say" id="tg-say-${esc(p.id)}" data-say="${esc(p.id)}" hidden><b>${esc(p.name)}</b> ${inline(p.line)} ${tagOf(p)}</p>`).join("")}</div>`;
    },
    rooms: (t) => {
      const d = json("rooms", t);
      const floors = [...new Set(d.rooms.map((r) => r.floor))];
      const danger = (n) => `<span class="tg-danger" aria-label="Danger ${n} of 4">${[1, 2, 3, 4].map((i) => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}<span>Danger</span></span>`;
      const guide = (r) => `<div class="tg-guide" id="tg-guide-${esc(r.id)}" data-guide="${esc(r.id)}" hidden>`
        + `<div><div class="tg-video" data-video="${esc(r.video?.youtubeId || "")}"><span class="tg-art" aria-hidden="true"></span><span class="tg-play" aria-hidden="true">▶</span><small>${esc(r.videoLabel || `Episode ${r.episode}: the ${r.name.toLowerCase()}`)}${r.sample ? " (sample)" : ""}</small></div>`
        + `<p class="tg-meta">The episode starts at this room. The short plays right here.</p></div>`
        + `<div><h3 class="tg-guide-h">${hedHtml(r.hed || `The *${r.name}*`)}</h3><div>${tagOf(r)}${sampleOf(r)}</div>`
        + `<dl class="tg-kv"><dt>Floor</dt><dd>${esc(FLOOR_NAMES[r.floor] || r.floor)}</dd><dt>Items here</dt><dd>${inline(r.items || "")}</dd><dt>Hiding spots</dt><dd>${inline(r.hiding || "")}</dd></dl>`
        + `<ol class="tg-steps">${(r.steps || []).map((s) => `<li>${inline(s)}</li>`).join("")}</ol>`
        + `<div class="tg-acts"><button type="button" class="bt-btn bt-btn--primary" data-watch="${esc(r.id)}" data-pulse="tang-watch-short">▶ Watch the short</button><a class="bt-btn bt-btn--secondary" href="${esc(ctx.hrefFor("the-map"))}?floor=${esc(r.floor)}${r.pin ? `&pin=${esc(r.pin)}` : ""}">Show on the map</a></div></div></div>`;
      return `<div class="tg-chips" role="group" aria-label="Floor">${floors.map((f, i) => `<button type="button" class="tg-chip" data-floor="${esc(f)}" aria-pressed="${i === 0}">${esc(FLOOR_NAMES[f] || f)}</button>`).join("")}</div>`
        + `<div class="tg-rooms" data-rooms>${d.rooms.map((r) => `<button type="button" class="tg-room" data-room="${esc(r.id)}" data-floor="${esc(r.floor)}" aria-expanded="false" aria-controls="tg-guide-${esc(r.id)}"><span class="ep">Episode ${esc(r.episode)}</span><b>${esc(r.name)}</b><span>${inline(r.line)}</span>${danger(r.danger)}</button>${guide(r)}`).join("")}</div>`;
    },
    secrets: (t) => json("secrets", t).map((s, i) => `<article class="tg-file" id="secret-${esc(s.id)}"><span class="n" aria-hidden="true">${i + 1}</span><div><h3>${esc(s.title)}</h3>`
      + `<div class="bt-redact" id="tg-rd-${esc(s.id)}"><p>${inline(s.line)} <span class="bt-redact-text">${inline(s.how)}</span><span class="bt-sr-only tg-covered-note"> (the how-to is covered: press Reveal)</span></p></div>`
      + `<div class="tg-status">${tagOf(s)}<span>${esc(s.status)}</span>${sampleOf(s)}<span class="tg-sp"></span><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-redact-toggle aria-controls="tg-rd-${esc(s.id)}" data-pulse="tang-reveal">Reveal</button></div></div></article>`).join(""),
    tally: (t) => {
      const d = json("tally", t);
      const fives = Math.floor(d.tries / 5), rest = d.tries % 5;
      const five = `<svg class="tg-tally" viewBox="0 0 46 36" aria-hidden="true">${[6, 14, 22, 30].map((x) => `<line x1="${x}" y1="4" x2="${x}" y2="32"/>`).join("")}<line class="x" x1="2" y1="28" x2="38" y2="8"/></svg>`;
      const some = (n) => `<svg class="tg-tally" viewBox="0 0 46 36" aria-hidden="true">${[6, 14, 22, 30].slice(0, n).map((x) => `<line x1="${x}" y1="4" x2="${x}" y2="32"/>`).join("")}</svg>`;
      return `<div class="tg-wallscene"><div class="tg-wall" role="img" aria-label="${d.tries} tries, scratched as tally marks">${five.repeat(fives)}${rest ? some(rest) : ""}</div>`
        + `<div class="tg-best"><span class="tg-meta">Best try</span><div class="tg-best-bar">${d.games.map((g) => `<span><i style="--w:${Math.max(0, Math.min(100, +g.best || 0))}%"></i></span>`).join("")}</div>`
        + `<div class="tg-best-lbl">${d.games.map((g) => `<span>${esc(g.short || g.name)}</span>`).join("")}</div>`
        + `<p class="tg-wallfoot"><span><b>${esc(d.tries)}</b>tries${d.sample ? " (sample)" : ""}</span><span><b>${d.games.filter((g) => +g.best > 0).length} of ${d.games.length}</b>houses reached</span><span><b>${esc(d.finished || 0)}</b>finished runs</span></p></div></div>`;
    },
    runs: (t) => { const rows = json("runs", t); return `<div class="tg-logwrap"><table class="tg-log"><thead><tr><th scope="col">Try</th><th scope="col" class="hide-sm">Date</th><th scope="col">Got to</th><th scope="col">How it ended</th><th scope="col">VOD</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="n">${esc(r.n)}</td><td class="hide-sm">${esc(r.date)}</td><td>${esc(r.got)}</td><td>${inline(r.ended)}</td><td>${r.vod ? `<a href="${esc(r.vod)}" rel="noopener" target="_blank">Watch</a>` : '<span class="tg-meta">Soon</span>'}</td></tr>`).join("")}</tbody></table></div>`; },
    polls: (t) => `<div class="tg-cards" data-polls>${json("polls", t).map((p) => `<article class="tg-card" data-poll="${esc(p.id)}"><div class="tg-q"><span data-poll-state>Open poll</span>${sampleOf(p)}</div><h3>${esc(p.question)}</h3>`
      + `<div class="tg-bars" data-poll-bars>${p.options.map((o) => `<div class="tg-opt" data-opt="${esc(o.id)}"><span class="fill"></span><span>${esc(o.label)}</span><span class="pct"></span></div>`).join("")}</div>`
      + `<div class="tg-pollfoot" data-poll-foot><span class="tg-meta">Results load with the page.</span></div></article>`).join("")}</div>`,
    board: (t) => { const d = json("board", t); return `<table class="tg-board"><caption class="bt-sr-only">${esc(d.caption || "Records")}</caption><thead><tr><th scope="col">#</th><th scope="col">Runner</th><th scope="col">Time</th></tr></thead><tbody>${d.rows.map((r) => `<tr><td>${esc(r.rank)}</td><td>${esc(r.runner)}</td><td class="time">${esc(r.time)}</td></tr>`).join("")}</tbody></table><p class="tg-boardnote">${inline(d.note || "")} ${tagOf(d)}</p>`; },
    rules: (t) => { const d = json("rules", t); return `<div class="tg-rules">${d.map((c) => `<div><h4>${esc(c.title)}</h4><ul>${c.items.map((i) => `<li>${inline(i)}</li>`).join("")}</ul></div>`).join("")}</div>`; },
    index: () => {
      const groups = {};
      for (const s of Object.values(sources)) (groups[s.group || "Other"] ||= []).push(s);
      const fmt = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
      return `<div class="tg-legend">${Object.keys(TRUST).map((k) => factagHtml({ trust: k })).join("")}</div><div class="tg-src">`
        + Object.entries(groups).map(([g, rows]) => `<h2 class="tg-src-h">${esc(g)}</h2>${rows.map((s) => `<div class="tg-src-row" id="src-${esc(s.id)}"><span>${s.url ? `<a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.title)}</a>` : `<b>${esc(s.title)}</b>`}</span><span>${inline(s.note || "")}</span><small>${factagHtml({ trust: s.trust, version: s.version || "" })} Checked ${fmt(s.checkedAt)}</small></div>`).join("")}`).join("")
        + `</div>`;
    },
    map: (t) => { const d = json("map", t); return `<div class="tg-mapapp" data-map="${esc(d.src)}"><p class="tg-meta tg-map-loading">The map loads here.</p></div>`; },
    column: () => '<!--tg-column-->',
  };

  const marked = new Marked({ gfm: true, breaks: false });
  marked.use({
    renderer: {
      code({ text, lang }) {
        const name = String(lang || "").trim();
        if (!R[name]) throw new Error(`boomertang: unknown block "${name}"`);
        blocks.push(name);
        return R[name](text) + "\n";
      },
      paragraph({ tokens }) { return `<p>${this.parser.parseInline(tokens)}</p>\n`; },
      heading({ tokens, depth }) { const h = Math.max(2, depth); return `<h${h} class="tg-h${h}">${this.parser.parseInline(tokens)}</h${h}>\n`; },
      html({ text }) { return esc(text); },   // no raw HTML in issue pages
    },
  });

  // fact tags hold no Markdown syntax, so they pass through marked untouched and become tags afterwards (blocks did their own)
  let html = marked.parse(body).replace(TAG_RE, (_, t, src) => tagHtml(t, src || "")).replace(/\{sample\}/g, SAMPLE);
  if (meta.drop) html = html.replace(/<p>/, '<p class="tg-drop">');

  const layout = meta.layout || "plain";
  if (layout === "spread") {
    const cut = html.indexOf('<div class="tg-facts">');
    const cols = cut < 0 ? html : html.slice(0, cut), after = cut < 0 ? "" : html.slice(cut);
    const fig = `<figure class="tg-photo"><span class="tg-art tg-art--photo" role="img" aria-label="${esc(meta.photoAlt || "Placeholder art: the screenshot comes once its permission is settled")}"></span>${meta.photo ? `<figcaption>${inline(meta.photo)}</figcaption>` : ""}</figure>`;
    html = `<div class="tg-spread">${fig}<div><div class="tg-cols">${cols}</div>${after}</div></div>`;
  } else if (layout === "columns") {
    const [a, b = ""] = html.split("<!--tg-column-->");
    html = `<div class="tg-spread tg-spread--even"><div>${a}</div><div>${b}</div></div>`;
  }
  return { meta, html, tags, blocks };
}

/** The page's head: kicker, headline, dek and byline (the same for every page). */
export function pageHeadHtml(meta, { bignum = false } = {}) {
  const by = String(meta.byline || "").split(" · ").filter(Boolean).map((b) => `<span>${esc(b)}</span>`).join("");
  const sample = meta.sample ? `<span class="tg-sample">${esc(meta.sample === true ? "Sample text" : meta.sample)}</span>` : "";
  const hed = bignum ? `<h1 class="tg-bignum"><span class="bt-sr-only">${esc(meta.title || "")}: </span>${esc(meta.hed)}</h1>` : `<h1 class="tg-hed">${hedHtml(meta.hed)}</h1>`;
  return `${meta.kicker ? `<span class="tg-kicker">${esc(meta.kicker)}</span>` : ""}${hed}${meta.dek ? `<p class="tg-dek">${esc(meta.dek)}</p>` : ""}${by || sample ? `<div class="tg-byline">${by}${sample}</div>` : ""}`;
}
