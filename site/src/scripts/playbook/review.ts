// The Playbook's monthly review (docs/specs/playbook.md §5, §6), built in the browser:
//   reviewPrompt(input)     one prompt for a Claude chat: the date, the due pages, what changed since the last review (a Traffic Pulse summary from its
//                           rollups and the decisions added since), every open or assumed flag on those pages, each page's Markdown, and how to reply
//                           (ask about open items one at a time, then one `playbook-update` block; a Claude Code prompt only if something built has to change)
//   pagePrompt(page, flags) Copy for Claude: one page the same way
//   findUpdate(reply)       the update in a pasted reply: a ```playbook-update block, a ```json block with "playbookUpdate", or bare JSON with
//                           "playbookUpdate" at its top level (just the code box's contents); null when there's none
//   checkUpdate(u, ctx)     the same checks the server makes (functions/lib/playbook/logic.js validateUpdate), so the preview can explain a refusal in plain words
// Nothing here writes; applying goes through playbookAdmin applyUpdate.
import type { Flag } from "./render";

export interface Page { id: string; order: number; nav: string; icon: string; title: string; status: string | null; service: string | null; lede: string; body: string; version: number; lastReviewedAt: number | null; updatedAt: number | null; mockupUrl?: string | null; editedOnSite?: boolean }
export interface Decision { id: string; date: string; text: string; pageId?: string | null; flagId?: string | null; order: number }
export interface PulseSummary { days: number; visitors: number; newMembers: number; movers: string[]; alerts: string[] }
export interface UpdatePage { id: string; title?: string; lede?: string; body?: string; markReviewed?: boolean }
export interface UpdateFlag { op: "confirm" | "answer" | "edit" | "add" | "remove"; id?: string; pageId?: string; status?: string; text?: string; answer?: string }
export interface Update { playbookUpdate: 1; pages?: UpdatePage[]; flags?: UpdateFlag[]; decisions?: { text: string; pageId?: string }[] }

const FENCE = "~~~~";   // page bodies hold ``` blocks, so pages go inside a tilde fence
const flagLine = (f: Flag) => `- [${f.status}] ${f.text.replace(/\s+/g, " ")} (id: ${f.id})${f.answer ? `\n  Answer: ${f.answer.replace(/\s+/g, " ")}` : ""}`;
const pageBlock = (p: Page) => `### ${p.title} (id: ${p.id}, version ${p.version})\n${p.lede ? `Lede: ${p.lede}\n` : ""}\n${FENCE}markdown\n${p.body}\n${FENCE}`;
const SCHEMA = `\`\`\`playbook-update
{ "playbookUpdate": 1,
  "pages": [{ "id": "<page id>", "title": "…", "lede": "…", "body": "…the full new Markdown…", "markReviewed": true }],
  "flags": [{ "op": "confirm", "id": "f-…" }, { "op": "answer", "id": "f-…", "answer": "…" },
            { "op": "edit", "id": "f-…", "text": "…" }, { "op": "remove", "id": "f-…" },
            { "op": "add", "pageId": "<page id>", "status": "open", "text": "…" }],
  "decisions": [{ "text": "…", "pageId": "<page id>" }] }
\`\`\``;
const FIRST_READ = " This is my first read-through: set \"markReviewed\" only for pages we actually went through in this chat, never for the others.";
const rules = (firstRead: boolean) => { const FIRST = firstRead ? FIRST_READ : ""; return `How to reply:
1. Ask me about the open items one at a time, and wait for each answer. Assumptions can be confirmed or corrected together at the end.
2. When we're done, reply with exactly one block in the format below. Leave out anything that doesn't change. A page's "body" is the full new Markdown (keep its \`## \` chapters and its fenced blocks: cards, steps, tiers, ladder, rules, flow). Use only the page and flag ids above. A flag's text is one paragraph. Settle an open question with "answer" (never "confirm"); "confirm" is for assumptions. Mark each page we went through with "markReviewed": true.${FIRST}
3. Only if something already built on the site has to change, add a short prompt for Claude Code after the block. Otherwise don't.

${SCHEMA}`; };

export function reviewPrompt(i: { firstRead?: boolean; date: string; due: Page[]; dueLabel: string; since: string | null; pulse: PulseSummary | null; decisions: Decision[]; flags: Flag[]; pagesById: Map<string, Page> }) {
  const open = i.flags.filter((f) => f.status !== "confirmed" && i.due.some((p) => p.id === f.pageId));
  const byPage = i.due.map((p) => [p, open.filter((f) => f.pageId === p.id).sort((a, b) => a.order - b.order)] as const).filter(([, l]) => l.length);
  const pulse = i.pulse
    ? [`- Visitors: ${i.pulse.visitors.toLocaleString("en-US")} over the last ${i.pulse.days} days`, `- New members: ${i.pulse.newMembers.toLocaleString("en-US")}`,
       `- Top movers: ${i.pulse.movers.length ? i.pulse.movers.join("; ") : "none"}`, `- Open alerts: ${i.pulse.alerts.length ? i.pulse.alerts.join("; ") : "none"}`].join("\n")
    : "- (Traffic Pulse couldn't be read.)";
  return `# Playbook review, ${i.date}

You're helping me review my Playbook: the living plan for my site and streams. ${i.dueLabel}

## Pages to review
${i.due.map((p) => `- ${p.title} (id: ${p.id})`).join("\n") || "- none"}

## What changed${i.since ? ` since the last review (${i.since})` : ""}
### Traffic Pulse
${pulse}
### Decisions added${i.since ? " since then" : ""}
${i.decisions.length ? i.decisions.map((d) => `- ${d.date}: ${d.text.replace(/\s+/g, " ")}${d.pageId && i.pagesById.get(d.pageId) ? ` (${i.pagesById.get(d.pageId)!.title})` : ""}`).join("\n") : "- none"}

## Open questions and assumptions on these pages
${byPage.length ? byPage.map(([p, l]) => `### ${p.title}\n${l.map(flagLine).join("\n")}`).join("\n\n") : "Nothing open on these pages."}

## The pages
${i.due.map(pageBlock).join("\n\n")}

${rules(!!i.firstRead)}
`;
}

export function pagePrompt(p: Page, flags: Flag[], firstRead = false) {
  const l = flags.filter((f) => f.pageId === p.id).sort((a, b) => a.order - b.order);
  return `# One page of my Playbook: ${p.title}

Help me think this page through. If we change it, end with one update block in the format below.

## Its flags
${l.length ? l.map(flagLine).join("\n") : "None."}

## The page
${pageBlock(p)}

${rules(firstRead)}
`;
}

/**
 * The update in a pasted reply, in this order: a ```playbook-update block; a ```json (or unlabelled) block whose JSON has "playbookUpdate" at its top
 * level; or the whole paste as bare JSON with "playbookUpdate" at its top level (just the contents of Claude's code box). { json } when found,
 * { error } when a playbook-update block (or a bare JSON paste) is there but isn't valid JSON, null when there's none. Everything else is refused, and
 * what's found still goes through checkUpdate.
 */
export function findUpdate(reply: string): { json: unknown } | { error: string } | null {
  const text = String(reply || "");
  const bad = (what: string, e: unknown) => ({ error: `${what} isn't valid JSON (${String((e as Error).message).slice(0, 80)}).` });
  const isUpdate = (j: unknown) => !!j && typeof j === "object" && !Array.isArray(j) && Object.prototype.hasOwnProperty.call(j, "playbookUpdate");
  const fenced = text.match(/```playbook-update[^\n]*\n([\s\S]*?)\n```[ \t]*(?:\n|$)/);
  if (fenced) { try { return { json: JSON.parse(fenced[1]) }; } catch (e) { return bad("The update block", e); } }
  for (const m of text.matchAll(/```(json|JSON)?[ \t]*\n([\s\S]*?)\n```[ \t]*(?:\n|$)/g)) {
    try { const j = JSON.parse(m[2]); if (isUpdate(j)) return { json: j }; } catch { /* not this block */ }
  }
  const bare = text.trim();
  if (bare.startsWith("{") && bare.endsWith("}") && /"playbookUpdate"\s*:/.test(bare)) {
    try { const j = JSON.parse(bare); if (isUpdate(j)) return { json: j }; } catch (e) { return bad("The pasted update", e); }
  }
  return null;
}

const one = (s: unknown, max: number) => typeof s === "string" && s.trim().length > 0 && s.length <= max && !/\n\s*\n/.test(s.trim());
/** The server's checks, in plain words (the server checks again). */
export function checkUpdate(u: any, ctx: { pageIds: Set<string>; flagIds: Set<string>; openIds?: Set<string> }): { ok: true; value: Update } | { ok: false; message: string } {
  const no = (message: string) => ({ ok: false as const, message });
  if (!u || typeof u !== "object" || Array.isArray(u)) return no("The update isn't a JSON object.");
  if (u.playbookUpdate !== 1) return no('The update needs "playbookUpdate": 1.');
  const pages = u.pages ?? [], flags = u.flags ?? [], decisions = u.decisions ?? [];
  if (![pages, flags, decisions].every(Array.isArray)) return no("pages, flags and decisions must be lists.");
  if (!pages.length && !flags.length && !decisions.length) return no("The update has nothing in it.");
  const seen = new Set<string>();
  for (const [i, p] of pages.entries()) {
    if (!p || typeof p.id !== "string" || !ctx.pageIds.has(p.id)) return no(`Page ${i + 1} in the update isn't a Playbook page${p && typeof p.id === "string" ? ` (${p.id.slice(0, 40)})` : ""}.`);
    if (seen.has(p.id)) return no(`The page ${p.id} appears twice.`); seen.add(p.id);
    for (const k of ["title", "lede", "body"]) if (p[k] !== undefined && typeof p[k] !== "string") return no(`The ${k} of ${p.id} must be text.`);
    if (p.title !== undefined && (!p.title.trim() || p.title.length > 120)) return no(`The title of ${p.id} is empty or too long.`);
    if (p.lede !== undefined && p.lede.length > 600) return no(`The lede of ${p.id} is too long.`);
    if (p.body !== undefined && (!p.body.trim() || p.body.length > 60000)) return no(`The body of ${p.id} is empty or too long.`);
    if (p.title === undefined && p.lede === undefined && p.body === undefined && p.markReviewed !== true) return no(`The page ${p.id} has no changes.`);
  }
  for (const [i, f] of flags.entries()) {
    const n = `Flag change ${i + 1}`;
    if (!f || !["confirm", "answer", "edit", "add", "remove"].includes(f.op)) return no(`${n} has no known op (confirm, answer, edit, add, remove).`);
    if (f.op === "add") {
      if (typeof f.pageId !== "string" || !ctx.pageIds.has(f.pageId)) return no(`${n} adds a flag to a page that doesn't exist.`);
      if (f.status !== undefined && !["open", "assumed"].includes(f.status)) return no(`${n}: a new flag is open or assumed.`);
      if (!one(f.text, 2000)) return no(`${n}: the text must be one paragraph.`);
      continue;
    }
    if (typeof f.id !== "string" || !ctx.flagIds.has(f.id)) return no(`${n} points at a flag that doesn't exist.`);
    if (f.op === "confirm" && ctx.openIds?.has(f.id)) return no(`${n} confirms an open question. Open questions need an answer.`);
    if (f.op === "edit" && f.status === "confirmed" && ctx.openIds?.has(f.id)) return no(`${n} confirms an open question. Open questions need an answer.`);
    if (f.op === "answer" && !one(f.answer, 2000)) return no(`${n}: the answer must be one paragraph.`);
    if (f.op === "edit" && !one(f.text, 2000)) return no(`${n}: the text must be one paragraph.`);
  }
  for (const [i, d] of decisions.entries()) {
    if (!d || !one(d.text, 1000)) return no(`Decision ${i + 1}: the text must be one paragraph.`);
    if (d.pageId !== undefined && (typeof d.pageId !== "string" || !ctx.pageIds.has(d.pageId))) return no(`Decision ${i + 1} points at a page that doesn't exist.`);
  }
  return { ok: true, value: u as Update };
}

/** Lines added and removed between two Markdown texts (a plain count for the preview). */
export function lineDelta(a: string, b: string) {
  const A = String(a || "").split("\n"), Bl = String(b || "").split("\n");
  const count = (l: string[]) => l.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map<string, number>());
  const ca = count(A), cb = count(Bl);
  let added = 0, removed = 0;
  for (const [k, n] of cb) added += Math.max(0, n - (ca.get(k) || 0));
  for (const [k, n] of ca) removed += Math.max(0, n - (cb.get(k) || 0));
  return { added, removed };
}
