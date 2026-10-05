// shared/staff-doc.js — the tiny, safe text format of staff-only documents (docs/specs/game-vault-how-it-works.md
// §3), e.g. the queue's mod guide in sites/{siteId}/staffDocs/vault-guide. Their text isn't in the repo or
// the page bundle; functions/scripts/seed-staff-doc.js loads it from a local Markdown file.
//
//   parseDoc(markdown)  -> { sections: [{ title, body }] } or throws: "# " headings start sections; the body
//                          keeps paragraphs (blank lines between), "- " bullets, **bold** and [A]-style keys.
//                          Anything else (other headings, HTML, code) is refused rather than guessed at.
//   toBlocks(body)      -> [{ type: "p", runs } | { type: "ul", items: [runs] }], runs = [{ t: "text" | "b" | "kbd", v }]
//                          for the page to build with textContent (never innerHTML of stored text).
// Checked in functions/scripts/check-staff-doc.js.

export const LIMITS = { sections: 20, title: 80, body: 2000 };

export function parseDoc(markdown) {
  const lines = String(markdown || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  const sections = [];
  let cur = null;
  lines.forEach((raw, i) => {
    const line = raw.replace(/\s+$/, "");
    const where = `line ${i + 1}`;
    if (/^#\s+/.test(line)) {
      const title = line.replace(/^#\s+/, "").trim();
      if (!title || title.length > LIMITS.title) throw new Error(`${where}: a heading needs 1 to ${LIMITS.title} characters`);
      cur = { title, lines: [] };
      sections.push(cur);
      return;
    }
    if (/^#{2,}\s/.test(line)) throw new Error(`${where}: only "# " headings are supported`);
    if (/^\s*(```|~~~)/.test(line)) throw new Error(`${where}: code blocks aren't supported`);
    if (/<\/?[a-z!][^>]*>/i.test(line)) throw new Error(`${where}: HTML isn't allowed`);
    if (!cur) { if (line.trim()) throw new Error(`${where}: text before the first "# " heading`); return; }
    cur.lines.push(line.replace(/^\s*[*+]\s+/, "- ").replace(/^\s+-\s+/, "- "));
  });
  if (!sections.length) throw new Error('no "# " headings found');
  if (sections.length > LIMITS.sections) throw new Error(`more than ${LIMITS.sections} sections`);
  return {
    sections: sections.map(({ title, lines: ls }) => {
      const body = ls.join("\n").replace(/\n{3,}/g, "\n\n").trim();
      if (!body) throw new Error(`"${title}" has no text`);
      if (body.length > LIMITS.body) throw new Error(`"${title}" is longer than ${LIMITS.body} characters`);
      return { title, body };
    }),
  };
}

/** **bold** and [A]-style keys (1 to 6 letters or digits) in a line -> runs. */
export function runsOf(text) {
  const runs = [];
  const re = /\*\*(.+?)\*\*|\[([A-Za-z0-9]{1,6})\]/g;
  let at = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > at) runs.push({ t: "text", v: text.slice(at, m.index) });
    runs.push(m[1] != null ? { t: "b", v: m[1] } : { t: "kbd", v: m[2] });
    at = re.lastIndex;
  }
  if (at < text.length) runs.push({ t: "text", v: text.slice(at) });
  return runs;
}

export function toBlocks(body) {
  const blocks = [];
  for (const para of String(body || "").split(/\n\s*\n/)) {
    const lines = para.split("\n").map((l) => l.trim()).filter(Boolean);
    let text = [];
    const flush = () => { if (text.length) { blocks.push({ type: "p", runs: runsOf(text.join(" ")) }); text = []; } };
    for (const l of lines) {
      if (l.startsWith("- ")) {
        flush();
        const last = blocks[blocks.length - 1];
        const item = runsOf(l.slice(2).trim());
        if (last && last.type === "ul" && !last.closed) last.items.push(item); else blocks.push({ type: "ul", items: [item] });
      } else {
        const last = blocks[blocks.length - 1];
        if (last && last.type === "ul") last.closed = true;
        text.push(l);
      }
    }
    flush();
    const last = blocks[blocks.length - 1];
    if (last && last.type === "ul") last.closed = true;
  }
  return blocks.map((b) => (b.type === "ul" ? { type: "ul", items: b.items } : b));
}
