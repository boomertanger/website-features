// The Playbook's page renderer (docs/specs/playbook.md §3). One Markdown document per page becomes:
//   - chapters: every `##` heading opens a ghost-numbered chapter (.bt-chapter--ghost) with id "ch-<slug>"; `###` are sub-headings; text before the first
//     `##` is the page's intro. chaptersOf(body) gives the rail's [id, label] list.
//   - six fenced blocks, each line `|`-separated, drawn by our own renderers (every field escaped; text fields allow inline Markdown):
//       cards  `icon | title | text`              a card grid
//       steps  `icon | title | text`              the journey line (.ai-jr)
//       tiers  `## Title` then `- item` lines     tier columns
//       ladder `n | title | text [| now]`         ladder rungs, "now" marks the current one
//       rules  `title | text`                     the .bt-placard house rules
//       flow   `icon | title | text [| goal]`     the "how it fits" diagram, "goal" marks the destination
//   - prose, lists and tables (.bt-table in a .bt-table-wrap), bold, links.
//   - a final "What we assumed" chapter with the page's flags (none on the flags page itself).
// Safety (decided Oct 15, 2026): marked (pinned) parses; raw HTML is printed as escaped text; links only for https:, http:, mailto:, site paths and
// #anchors (anything else is plain text); images are off (their alt text shows); any other fenced block is an escaped <pre>. DOMPurify (pinned) then
// sanitizes the whole result as a second layer. Browser only.
import { Marked, type Tokens } from "marked";
import DOMPurify from "dompurify";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";

export type FlagStatus = "assumed" | "open" | "confirmed";
export interface Flag { id: string; pageId: string; status: FlagStatus; text: string; answer?: string | null; order: number }
export const BLOCKS = ["cards", "steps", "tiers", "ladder", "rules", "flow"] as const;

/** Only these links survive; anything else becomes its text. */
export function safeHref(href: string | null | undefined): string | null {
  const h = String(href || "").trim();
  if (!h) return null;
  if (/^(https?:|mailto:)/i.test(h)) return h;
  if (/^\/(?!\/)/.test(h) || h.startsWith("#")) return h;
  return null;
}
export const slugOf = (text: string) => text.toLowerCase().replace(/<[^>]*>/g, "").replace(/&[a-z]+;/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "chapter";

const md = new Marked({ gfm: true, breaks: false });
md.use({
  renderer: {
    html(t: Tokens.HTML | Tokens.Tag) { return esc(t.text); },
    image(t: Tokens.Image) { return esc(t.text || ""); },
    link(this: any, t: Tokens.Link) {
      const inner = this.parser.parseInline(t.tokens);
      const href = safeHref(t.href);
      if (!href) return inner;
      const ext = /^https?:/i.test(href);
      return `<a href="${esc(href)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ""}>${inner}</a>`;
    },
    heading(this: any, t: Tokens.Heading) {
      const inner = this.parser.parseInline(t.tokens);
      if (t.depth <= 2) return `<h3 class="pb-h3">${inner}</h3>`;   // a ## inside a block's prose (chapters are split out before this)
      return `<h${Math.min(6, t.depth + 1)} class="pb-h${Math.min(6, t.depth + 1)}">${inner}</h${Math.min(6, t.depth + 1)}>`;
    },
    table(this: any, t: Tokens.Table) {
      const cell = (c: Tokens.TableCell, tag: string) => `<${tag}${c.align ? ` style="text-align:${c.align}"` : ""}>${this.parser.parseInline(c.tokens)}</${tag}>`;
      return `<div class="bt-table-wrap"><table class="bt-table pb-table"><thead><tr>${t.header.map((c) => cell(c, "th")).join("")}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map((c) => cell(c, "td")).join("")}</tr>`).join("")}</tbody></table></div>`;
    },
    code(t: Tokens.Code) {
      const lang = (t.lang || "").trim().split(/\s+/)[0];
      if ((BLOCKS as readonly string[]).includes(lang)) return renderBlock(lang as (typeof BLOCKS)[number], t.text);
      return `<pre class="pb-pre"><code>${esc(t.text)}</code></pre>`;
    },
  },
});
const inline = (s: string) => md.parseInline(String(s || "").trim(), { async: false }) as string;
const cells = (line: string) => line.split("|").map((c) => c.trim());
const linesOf = (text: string) => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

/** One of the six fenced blocks. Every field is escaped (inline Markdown in text fields, through the same safe renderer). */
export function renderBlock(kind: (typeof BLOCKS)[number], text: string): string {
  const rows = linesOf(text);
  switch (kind) {
    case "cards":
      return `<div class="pb-cards">${rows.map((l) => { const [ic, t, x] = cells(l); return `<div class="bt-card pb-card"><span class="pb-card-ic" aria-hidden="true">${esc(ic || "")}</span><b>${inline(t || "")}</b><p>${inline(x || "")}</p></div>`; }).join("")}</div>`;
    case "steps": {
      const n = rows.length;
      return `<ol class="ai-jr pb-steps" data-journey style="--pb-n:${n}">${rows.map((l, i) => { const [ic, t, x] = cells(l); return `<li tabindex="0"><span class="ai-jr-num" aria-hidden="true">${i + 1}</span><span class="ai-jr-ic" aria-hidden="true">${esc(ic || "")}</span><b>${inline(t || "")}</b><span class="ai-jr-t">${inline(x || "")}</span></li>`; }).join("")}</ol>`;
    }
    case "tiers": {
      const tiers: { title: string; items: string[] }[] = [];
      for (const l of rows) {
        if (/^#{1,6}\s+/.test(l)) tiers.push({ title: l.replace(/^#{1,6}\s+/, ""), items: [] });
        else if (/^[-*]\s+/.test(l)) { if (!tiers.length) tiers.push({ title: "", items: [] }); tiers[tiers.length - 1].items.push(l.replace(/^[-*]\s+/, "")); }
      }
      return `<div class="pb-tiers" style="--pb-n:${Math.max(1, tiers.length)}">${tiers.map((t, i) => `<section class="pb-tier"><span class="pb-tier-n" aria-hidden="true">${i + 1}</span><h4>${inline(t.title)}</h4><ul>${t.items.map((x) => `<li>${inline(x)}</li>`).join("")}</ul></section>`).join("")}</div>`;
    }
    case "ladder":
      return `<ol class="pb-ladder">${rows.map((l) => { const [n, t, x, now] = cells(l); const isNow = /^now$/i.test(now || ""); return `<li class="pb-rung${isNow ? " is-now" : ""}"><span class="pb-rung-n">${esc(n || "")}</span><span class="pb-rung-t"><b>${inline(t || "")}</b><span>${inline(x || "")}</span></span>${isNow ? `<span class="bt-badge bt-badge--gold"><span class="bt-badge-dot"></span>Now</span>` : ""}</li>`; }).join("")}</ol>`;
    case "rules":
      return `<div class="bt-placard pb-placard"><div class="bt-placard-head"><i aria-hidden="true"></i><b>House rules</b><i aria-hidden="true"></i></div><ol class="bt-placard-list">${rows.map((l, i) => { const [t, x] = cells(l); return `<li class="bt-placard-rule"><span class="bt-placard-n" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span><b>${inline(t || "")}</b><span>${inline(x || "")}</span></li>`; }).join("")}</ol></div>`;
    case "flow":
      return `<div class="pb-flow">${rows.map((l, i) => { const [ic, t, x, goal] = cells(l); const isGoal = /^goal$/i.test(goal || ""); return `${i ? `<span class="pb-flow-arr" aria-hidden="true"></span>` : ""}<div class="pb-flow-node${isGoal ? " is-goal" : ""}"><span class="pb-flow-ic" aria-hidden="true">${esc(ic || "")}</span><b>${inline(t || "")}</b><span>${inline(x || "")}</span></div>`; }).join("")}</div>`;
  }
}

/** The body split at `##` headings outside fenced blocks: { intro, chapters: [{ title, id, md }] }. Ids are unique per page. */
export function splitChapters(body: string) {
  const lines = String(body || "").split(/\r?\n/);
  const out: { title: string; id: string; md: string[] }[] = [];
  const intro: string[] = [];
  const used = new Set<string>();
  let fence: string | null = null;
  for (const line of lines) {
    const f = line.match(/^\s*(`{3,}|~{3,})/);
    if (f) fence = fence ? (line.trim().startsWith(fence) ? null : fence) : f[1];
    const h = !fence && !f ? line.match(/^##\s+(.+?)\s*#*\s*$/) : null;
    if (h) {
      let id = `ch-${slugOf(h[1])}`, k = 2;
      while (used.has(id)) id = `ch-${slugOf(h[1])}-${k++}`;
      used.add(id);
      out.push({ title: h[1], id, md: [] });
    } else (out.length ? out[out.length - 1].md : intro).push(line);
  }
  return { intro: intro.join("\n"), chapters: out.map((c) => ({ title: c.title, id: c.id, md: c.md.join("\n") })) };
}
export const ASSUMED_ID = "ch-what-we-assumed";
/** The rail's [id, label] list: every chapter, then "What we assumed" when the page has flags. */
export function chaptersOf(body: string, withAssumed: boolean): [string, string][] {
  const list = splitChapters(body).chapters.map((c) => [c.id, plainInline(c.title)] as [string, string]);
  return withAssumed ? [...list, [ASSUMED_ID, "What we assumed"]] : list;
}
const plainInline = (s: string) => { const d = document.createElement("div"); d.innerHTML = clean(inline(s)); return d.textContent || ""; };

/** DOMPurify as the second layer: no images, scripts, styles, forms or event handlers survive; links keep only safe hrefs. */
export function clean(html: string): string {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ["img", "picture", "source", "video", "audio", "iframe", "object", "embed", "form", "input", "button", "textarea", "select", "style", "script", "svg", "math"],
    FORBID_ATTR: ["srcset", "src", "formaction"],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|\/(?!\/)|#)/i,
    ADD_ATTR: ["target"],
  }) as unknown as string;
}
export const chapterHead = (n: number, id: string, title: string) => `<header class="bt-chapter bt-chapter--ghost" data-n="${String(n).padStart(2, "0")}"><p class="bt-chapter-eyebrow" aria-hidden="true">${String(n).padStart(2, "0")} · Chapter</p><h2 class="bt-chapter-title" id="h-${id}">${title}</h2></header>`;

/** Markdown to safe HTML (the prose of one chapter, a flag's text, an Edit preview). */
export const renderMarkdown = (src: string) => clean(md.parse(String(src || ""), { async: false }) as string);
export const renderInline = (src: string) => clean(inline(src));

const FLAG_TONE: Record<FlagStatus, [string, string]> = { open: ["blue", "Open question"], assumed: ["gold", "Assumed"], confirmed: ["lime", "Confirmed"] };
/** One flag row: its status, its text (inline Markdown), the answer if there is one, and (unless settled) Confirm and Answer. */
export function flagRowHtml(f: Flag, { actions = true, pageLabel = "" }: { actions?: boolean; pageLabel?: string } = {}) {
  const [tone, label] = FLAG_TONE[f.status] || FLAG_TONE.open;
  const settled = f.status === "confirmed";
  return `<li class="pb-flag pb-flag--${f.status}" data-flag="${esc(f.id)}">
    <span class="bt-badge bt-badge--${tone} pb-flag-st"><span class="bt-badge-dot"></span>${label}</span>
    <div class="pb-flag-body"><p>${renderInline(f.text)}</p>${f.answer ? `<p class="pb-flag-answer"><b>Answer:</b> ${renderInline(f.answer)}</p>` : ""}${pageLabel ? `<span class="pb-flag-page">${esc(pageLabel)}</span>` : ""}</div>
    ${actions && !settled ? `<div class="pb-flag-acts"><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-flag-confirm="${esc(f.id)}">Confirm</button><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-flag-answer="${esc(f.id)}">Answer</button></div>` : ""}
  </li>`;
}

/** A whole page: the intro, the chapters with ghost numbers, and "What we assumed" (skip it with flags = null, as the flags page does). */
export function renderPage(body: string, flags: Flag[] | null): string {
  const { intro, chapters } = splitChapters(body);
  let html = intro.trim() ? `<div class="pb-prose pb-intro">${renderMarkdown(intro)}</div>` : "";
  chapters.forEach((c, i) => { html += `<section class="ai-sec pb-sec" id="${c.id}" aria-labelledby="h-${c.id}">${chapterHead(i + 1, c.id, renderInline(c.title))}<div class="pb-prose">${renderMarkdown(c.md)}</div></section>`; });
  if (flags) {
    const sorted = [...flags].sort((a, b) => (a.status === "confirmed" ? 1 : 0) - (b.status === "confirmed" ? 1 : 0) || a.order - b.order);
    const openN = flags.filter((f) => f.status !== "confirmed").length;
    html += `<section class="ai-sec pb-sec pb-assumed" id="${ASSUMED_ID}" aria-labelledby="h-${ASSUMED_ID}">${chapterHead(chapters.length + 1, ASSUMED_ID, "What we assumed")}
      ${flags.length ? `<p class="pb-assumed-sum">${openN ? `${openN} still to settle, ${flags.length - openN} confirmed.` : "Nothing open on this page."}</p><ul class="pb-flags">${sorted.map((f) => flagRowHtml(f)).join("")}</ul>` : `<div class="bt-empty bt-empty--compact"><span class="bt-empty-title">Nothing open on this page.</span></div>`}</section>`;
  }
  return html;
}
