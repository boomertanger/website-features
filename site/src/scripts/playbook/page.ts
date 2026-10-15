// /admin/playbook (docs/specs/playbook.md §2, §5-§9): the owner's Playbook. Owner only: everyone else gets the gate (the rules deny every read anyway).
//   Overview      the hanging-light hero, the review bar (first read-through progress or the pages due), the overview page, the pages grid
//   ?page=<id>    a page: its review header (last reviewed, still to settle, Copy for Claude, Edit, History, Mark reviewed), the TocLayout rail and the
//                 rendered Markdown (render.ts), ending with "What we assumed"; #ch-<slug> jumps to a chapter
//   ?page=flags   every flag with filters, plus the decisions log
//   Copy review prompt / Apply an update (review.ts): the prompt remembers each page's version, so a page that changed since it was copied warns before
//                 saving (Save anyway sends force). Edit: a wide openModal, Markdown left, live preview right, pinned to the version. History: versions with
//                 Restore. Every write is playbookAdmin.
// Preview (non-production, signed out, ?as=owner): made-up sample data from src/data/preview-playbook.json; changes stay in the page.
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { confirmAction } from "../../../../shared/ui/confirm.js";
import { toast } from "../../../../shared/ui/toast.js";
import { stampHtml } from "../../../../shared/ui/stamp.js";
import { initToc } from "../../../../shared/ui/toc.js";
import { initHowItWorks } from "../../../../shared/ui/how-it-works.js";
import { initStickyBar } from "../../../../shared/ui/sticky-bar.js";
import { onAuth, type AuthState } from "../../lib/auth";
import { call } from "../../lib/call";
import { messageFor, reasonOf } from "../../lib/errors";
import { isProduction } from "../../lib/env.js";
import { renderPage, renderMarkdown, renderInline, chaptersOf, flagRowHtml, safeHref, type Flag, type FlagStatus } from "./render";
import { reviewPrompt, pagePrompt, findUpdate, checkUpdate, lineDelta, type Page, type Decision, type PulseSummary, type Update } from "./review";
import { lampScene } from "./art";

interface Main { firstReadDone: boolean; firstReadDoneAt: number | null; seedVersion: string | null }
interface Due { dueCount: number; duePages: string[]; dueSince: string | null }
interface Version { n: number; title: string; lede: string; body: string; savedAt: number | null; source: string }
const TZ = "America/Los_Angeles";
const STATUS: Record<string, [string, string]> = { new: ["blue", "New"], planned: ["gold", "Planned"], building: ["green", "Building"], idea: ["gray", "Idea"] };
const PROMPT_KEY = "pb.prompt";   // { at, versions } when a review prompt was copied (a per-browser convenience)
const root = document.querySelector<HTMLElement>("[data-pb]")!;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const mascot = () => document.getElementById("bt-mascot-tpl")?.innerHTML ?? "";
const mascotShapes = () => { const t = document.getElementById("bt-mascot-tpl"); const s = t ? (t as HTMLTemplateElement).content?.querySelector("svg") || t.querySelector?.("svg") : null; return s ? s.innerHTML : ""; };
const ms = (v: any): number | null => (v == null ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : null);
const dayOf = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(t));
const nice = (t: number | null) => (t ? new Date(t).toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric", year: "numeric" }) : "never");
const niceDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
const qs = () => new URLSearchParams(location.search);
const H = 3600e3;

let P: any = null;   // preview data
const S = {
  main: { firstReadDone: false, firstReadDoneAt: null, seedVersion: null } as Main, due: { dueCount: 0, duePages: [], dueSince: null } as Due,
  pages: [] as Page[], flags: [] as Flag[], decisions: [] as Decision[], cur: "overview", filter: { status: "todo" as "all" | "todo" | FlagStatus, page: "all" }, busy: false,
};
const pageById = () => new Map(S.pages.map((p) => [p.id, p]));
const reviewable = () => S.pages.filter((p) => p.id !== "flags");
const flagsOf = (id: string) => S.flags.filter((f) => f.pageId === id);
const openCount = (id: string) => flagsOf(id).filter((f) => f.status !== "confirmed").length;
const setAccess = (a: string) => { const h = document.querySelector<HTMLElement>("[data-pb-access]"); if (h) h.dataset.pbAccess = a; };

/* ---------- data ---------- */
async function load() {
  if (P) {
    if (!S.pages.length) {
      S.main = { ...P.main, firstReadDoneAt: null }; S.due = { ...P.state };
      S.pages = P.pages.map((p: any) => ({ ...p, lastReviewedAt: p.reviewedH ? Date.now() - p.reviewedH * H : null, updatedAt: Date.now() - 48 * H }));
      S.flags = P.flags.map((f: any) => ({ answer: null, ...f })); S.decisions = [...P.decisions];
    }
    return;
  }
  const { db, doc, getDoc, getDocs, collection, SITE_ID } = await import("../../lib/db");
  const base = ["sites", SITE_ID, "playbook", "main"] as const;
  const [main, due, pages, flags, decisions] = await Promise.all([getDoc(doc(db, ...base)), getDoc(doc(db, ...base, "state", "current")), getDocs(collection(db, ...base, "pages")), getDocs(collection(db, ...base, "flags")), getDocs(collection(db, ...base, "decisions"))]);
  S.main = { firstReadDone: !!(main.exists() && main.get("firstReadDone")), firstReadDoneAt: ms(main.exists() ? main.get("firstReadDoneAt") : null), seedVersion: main.exists() ? main.get("seedVersion") ?? null : null };
  S.due = due.exists() ? { dueCount: Number(due.get("dueCount")) || 0, duePages: due.get("duePages") || [], dueSince: due.get("dueSince") || null } : { dueCount: 0, duePages: [], dueSince: null };
  S.pages = pages.docs.map((d) => { const x = d.data() as any; return { id: d.id, order: Number(x.order) || 0, nav: x.nav || x.title || d.id, icon: x.icon || "", title: x.title || d.id, status: x.status || null, service: x.service || null, lede: x.lede || "", body: x.body || "", version: Number(x.version) || 1, lastReviewedAt: ms(x.lastReviewedAt), updatedAt: ms(x.updatedAt), mockupUrl: x.mockupUrl || null, editedOnSite: !!x.editedOnSite } as Page; }).sort((a, b) => a.order - b.order);
  S.flags = flags.docs.map((d) => { const x = d.data() as any; return { id: d.id, pageId: x.pageId, status: x.status, text: x.text || "", answer: x.answer || null, order: Number(x.order) || 0 } as Flag; }).sort((a, b) => a.order - b.order);
  S.decisions = decisions.docs.map((d) => { const x = d.data() as any; return { id: d.id, date: x.date || "", text: x.text || "", pageId: x.pageId || null, flagId: x.flagId || null, order: Number(x.order) || 0 } as Decision; }).sort((a, b) => a.order - b.order);
}
async function loadVersions(pageId: string): Promise<Version[]> {
  if (P) return (P.versions?.[pageId] || []).map((v: any) => ({ ...v, savedAt: Date.now() - (v.savedH || 1) * H }));
  const { db, getDocs, collection, SITE_ID } = await import("../../lib/db");
  const snap = await getDocs(collection(db, "sites", SITE_ID, "playbook", "main", "pages", pageId, "versions"));
  return snap.docs.map((d) => { const x = d.data() as any; return { n: Number(d.id), title: x.title || "", lede: x.lede || "", body: x.body || "", savedAt: ms(x.savedAt), source: x.source || "edit" }; }).sort((a, b) => b.n - a.n);
}

/* ---------- writes (preview: a stand-in that changes the sample in the page) ---------- */
async function rpc<T = any>(action: string, data: Record<string, unknown>): Promise<T> {
  if (!P) return call<T>("playbookAdmin", { action, ...data });
  await new Promise((r) => setTimeout(r, 200));
  const page = S.pages.find((p) => p.id === data.pageId);
  const now = Date.now();
  const decide = (text: string, extra: object) => S.decisions.push({ id: `d-p-${now}-${S.decisions.length}`, date: dayOf(now), text, order: S.decisions.length + 1, ...extra } as Decision);
  if (action === "savePage" && page) { if (Number(data.version) !== page.version) throw Object.assign(new Error("This page changed since you opened it."), { details: { reason: "stale" } }); (P.versions[page.id] ||= []).unshift({ n: page.version, title: page.title, lede: page.lede, body: page.body, source: "edit", savedH: 0.01 }); Object.assign(page, { title: data.title, lede: data.lede, body: data.body, version: page.version + 1, editedOnSite: true }); return { version: page.version } as T; }
  if (action === "markReviewed" && page) { page.lastReviewedAt = now; const done = !S.main.firstReadDone && reviewable().every((p) => p.lastReviewedAt); if (done) S.main.firstReadDone = true; return { firstReadDone: done } as T; }
  if (action === "flagAction") {
    const f = S.flags.find((x) => x.id === data.id);
    if (data.op === "add") { const id = `f-${data.pageId}-p${now}`; S.flags.push({ id, pageId: String(data.pageId), status: (data.status as FlagStatus) || "open", text: String(data.text), order: S.flags.length + 1 }); return { id } as T; }
    if (!f) throw new Error("That flag doesn't exist.");
    if (data.op === "remove") S.flags = S.flags.filter((x) => x !== f);
    if (data.op === "edit") f.text = String(data.text);
    if (data.op === "confirm") { f.status = "confirmed"; decide(f.text, { pageId: f.pageId, flagId: f.id }); }
    if (data.op === "answer") { f.status = "confirmed"; f.answer = String(data.answer); decide(f.answer, { pageId: f.pageId, flagId: f.id }); }
    return { ok: true } as T;
  }
  if (action === "applyUpdate") {
    const u = data.update as Update;
    for (const up of u.pages || []) { const p = S.pages.find((x) => x.id === up.id)!; const changed = ["title", "lede", "body"].some((k) => (up as any)[k] !== undefined && (up as any)[k] !== (p as any)[k]); if (changed) { (P.versions[p.id] ||= []).unshift({ n: p.version, title: p.title, lede: p.lede, body: p.body, source: "update", savedH: 0.01 }); Object.assign(p, up.title !== undefined ? { title: up.title } : {}, up.lede !== undefined ? { lede: up.lede } : {}, up.body !== undefined ? { body: up.body } : {}, { version: p.version + 1 }); } if (up.markReviewed) p.lastReviewedAt = now; }
    for (const op of u.flags || []) await rpc("flagAction", { ...op });
    for (const d of u.decisions || []) decide(d.text, d.pageId ? { pageId: d.pageId } : {});
    const done = !S.main.firstReadDone && reviewable().every((p) => p.lastReviewedAt); if (done) S.main.firstReadDone = true;
    return { ok: true, firstReadDone: done } as T;
  }
  if (action === "restoreVersion" && page) { const v = (P.versions[page.id] || []).find((x: any) => x.n === Number(data.n)); (P.versions[page.id] ||= []).unshift({ n: page.version, title: page.title, lede: page.lede, body: page.body, source: "restore", savedH: 0.01 }); Object.assign(page, { title: v.title, lede: v.lede, body: v.body, version: page.version + 1 }); return { version: page.version } as T; }
  return { ok: true } as T;
}
async function refresh() { if (!P) await load(); render(); }

/* ---------- pieces ---------- */
const statusBadge = (s: string | null) => (s && STATUS[s] ? `<span class="bt-badge bt-badge--${STATUS[s][0]}"><span class="bt-badge-dot"></span>${STATUS[s][1]}</span>` : "");
function chipsHtml() {
  return `<nav class="pb-chips" aria-label="Playbook pages">${S.pages.map((p) => `<a class="bt-chip bt-chip--small${p.id === S.cur ? " is-active" : ""}" href="?page=${encodeURIComponent(p.id)}" data-go="${esc(p.id)}"${p.id === S.cur ? ' aria-current="page"' : ""}>${p.id !== "flags" && S.flags.some((f) => f.pageId === p.id && f.status === "open") ? '<span class="pb-dot" aria-label="Has open questions"></span>' : ""}${esc(p.nav)}</a>`).join("")}</nav>`;
}
function heroHtml(p: Page) {
  const assumed = S.flags.filter((f) => f.status === "assumed").length, open = S.flags.filter((f) => f.status === "open").length;
  return `<section class="pb-hero" aria-labelledby="pb-h">
    <div class="pb-scene">${lampScene(mascotShapes())}</div>
    <div class="pb-hero-copy">
      <p class="pb-crumb"><span>The Playbook</span><span aria-hidden="true">/</span><span>Plans, assumptions and decisions</span><span class="bt-badge bt-badge--admin">Owner only</span></p>
      <h1 class="bt-title" id="pb-h">${esc(p.title)}</h1>
      ${p.lede ? `<p class="pb-lede">${renderInline(p.lede)}</p>` : ""}
      <div class="pb-stats">${([[reviewable().length, "Pages"], [assumed, "Assumptions"], [open, "Open questions"]] as [number, string][]).map(([n, l]) => `<div class="pb-stat"><span class="bt-stat-value">${n}</span><span class="bt-stat-unit">${l}</span></div>`).join("")}</div>
    </div>
  </section>`;
}
function reviewBarHtml() {
  const R = reviewable(), done = R.filter((p) => p.lastReviewedAt).length;
  if (!S.main.firstReadDone) {
    const next = R.find((p) => !p.lastReviewedAt);
    return `<section class="pb-bar" data-pb-bar aria-label="First read-through"><span class="pb-bar-ic" aria-hidden="true">🔔</span><div class="pb-bar-main"><b>First read-through</b><span>${done} of ${R.length} pages reviewed. Nothing is due until you've read them all; sharing unlocks after that.</span>
      <div class="bt-meter pb-meter"><div class="bt-meter-track" role="progressbar" aria-label="Pages reviewed" aria-valuemin="0" aria-valuemax="${R.length}" aria-valuenow="${done}"><span class="bt-meter-fill" style="width:${R.length ? (done / R.length) * 100 : 0}%"></span></div></div></div>
      <div class="pb-bar-acts">${next ? `<a class="bt-btn bt-btn--primary" href="?page=${encodeURIComponent(next.id)}" data-go="${esc(next.id)}">Start with the next page</a>` : ""}<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-copy-review>Copy review prompt</button><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-apply>Apply an update</button></div></section>`;
  }
  const due = S.due.duePages.filter((id) => pageById().has(id));
  if (due.length) return `<section class="pb-bar is-due" data-pb-bar aria-label="Monthly review"><span class="pb-bar-ic" aria-hidden="true">🔔</span><div class="pb-bar-main"><b>Monthly review</b><span>${due.length} page${due.length === 1 ? "" : "s"} due${S.due.dueSince ? ` since ${niceDay(S.due.dueSince)}` : ""}: ${due.map((id) => `<a href="?page=${encodeURIComponent(id)}" data-go="${esc(id)}">${esc(pageById().get(id)!.nav)}</a>`).join(", ")}.</span></div>
    <div class="pb-bar-acts"><button type="button" class="bt-btn bt-btn--primary" data-copy-review>Copy review prompt</button><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-apply>Apply an update</button></div></section>`;
  return `<section class="pb-bar is-clear" data-pb-bar aria-label="Monthly review"><span class="pb-bar-ic" aria-hidden="true">✅</span><div class="pb-bar-main"><b>All caught up</b><span>Every page is reviewed for this month. The next review starts on the 1st.</span></div>
    <div class="pb-bar-acts"><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-copy-review>Copy review prompt</button><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-apply>Apply an update</button></div></section>`;
}
function pageHeadHtml(p: Page, compact = false) {
  const open = openCount(p.id), mock = safeHref(p.mockupUrl);
  const meta = `<span>Last reviewed ${esc(nice(p.lastReviewedAt))}</span>${p.id !== "flags" ? `<span>${open ? `${open} still to settle` : "Nothing open on this page"}</span>` : ""}${mock ? `<a href="${esc(mock)}" target="_blank" rel="noopener noreferrer">See the mockup</a>` : ""}`;
  const acts = `<div class="pb-head-acts"><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-copy-page>Copy for Claude</button><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-edit>Edit</button><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-history>History</button>${p.id !== "flags" ? `<button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-reviewed>${p.lastReviewedAt && p.lastReviewedAt >= startOfMonth() ? "Reviewed this month" : "Mark reviewed"}</button>` : ""}</div>`;
  if (compact) return `<div class="pb-head pb-head--compact"><div class="pb-head-meta">${meta}</div>${acts}</div>`;
  return `<header class="pb-head"><div class="pb-head-top"><span class="pb-head-ic" aria-hidden="true">${esc(p.icon)}</span><div><h1 class="bt-title pb-title">${esc(p.title)}</h1><div class="pb-head-tags">${statusBadge(p.status)}<span class="bt-badge bt-badge--admin">Owner only</span></div></div></div>
    ${p.lede ? `<p class="pb-lede">${renderInline(p.lede)}</p>` : ""}<div class="pb-head-meta">${meta}</div>${acts}</header>`;
}
const startOfMonth = () => { const d = dayOf(Date.now()).slice(0, 7); for (const off of [7, 8]) { const t = Date.parse(`${d}-01T00:00:00Z`) + off * H; if (dayOf(t) === `${d}-01` && dayOf(t - 1) !== `${d}-01`) return t; } return Date.parse(`${d}-01T08:00:00Z`); };
function withRail(items: [string, string][], content: string) {
  if (!items.length) return `<div class="pb-solo">${content}</div>`;
  return `<div class="tl-wrap pb-rail"><nav class="bt-toc bt-sticky-follow tl-nav" aria-label="On this page"><span class="bt-toc-rail" aria-hidden="true"></span><span class="bt-toc-fill" aria-hidden="true"></span>${items.map(([id, t]) => `<a href="#${id}">${esc(t)}</a>`).join("")}</nav><div class="tl-main">${content}</div></div>`;
}
function pagesGridHtml() {
  return `<section class="pb-grid-sec" aria-labelledby="pb-grid-h"><h2 class="bt-heading" id="pb-grid-h">Every page</h2><div class="pb-grid">${reviewable().filter((p) => p.id !== "overview").concat(S.pages.filter((p) => p.id === "flags")).map((p) => {
    const open = openCount(p.id), reviewed = !!p.lastReviewedAt;
    return `<a class="bt-card pb-gcard" href="?page=${encodeURIComponent(p.id)}" data-go="${esc(p.id)}"><span class="pb-gcard-ic" aria-hidden="true">${esc(p.icon)}</span><b>${esc(p.nav)}</b><span class="pb-gcard-lede">${renderInline(p.lede)}</span><span class="pb-gcard-foot">${statusBadge(p.status)}${p.id !== "flags" ? `<span class="bt-tag">${open ? `${open} to settle` : "Settled"}</span>${reviewed ? '<span class="bt-tag pb-tag-ok">Reviewed</span>' : ""}` : `<span class="bt-tag">${S.flags.filter((f) => f.status !== "confirmed").length} open</span>`}</span></a>`;
  }).join("")}</div></section>`;
}
function flagsPageHtml(p: Page) {
  const f = S.filter;
  const pm = pageById();
  const list = S.flags.filter((x) => (f.status === "all" || (f.status === "todo" ? x.status !== "confirmed" : x.status === f.status)) && (f.page === "all" || x.pageId === f.page))
    .sort((a, b) => (pm.get(a.pageId)?.order ?? 999) - (pm.get(b.pageId)?.order ?? 999) || a.order - b.order);
  const n = (s: string) => S.flags.filter((x) => (s === "all" ? true : s === "todo" ? x.status !== "confirmed" : x.status === s)).length;
  const chip = (k: string, label: string) => `<button type="button" class="bt-chip bt-chip--small${f.status === k ? " is-active" : ""}" aria-pressed="${f.status === k}" data-fstatus="${k}">${label} <span class="pb-n">${n(k)}</span></button>`;
  const pages = reviewable().filter((x) => S.flags.some((y) => y.pageId === x.id));
  const decisions = [...S.decisions].sort((a, b) => b.date.localeCompare(a.date) || b.order - a.order);
  const body = p.body.trim() ? `<div class="pb-prose pb-intro">${renderMarkdown(p.body)}</div>` : "";
  const content = `${body}
    <section class="ai-sec pb-sec" id="ch-flags" aria-labelledby="h-ch-flags"><header class="bt-chapter bt-chapter--ghost" data-n="01"><p class="bt-chapter-eyebrow" aria-hidden="true">01 · Chapter</p><h2 class="bt-chapter-title" id="h-ch-flags">Every flag</h2></header>
      <div class="pb-filters"><div class="bt-sortbar" role="group" aria-label="Filter by status">${chip("todo", "To settle")}${chip("open", "Open")}${chip("assumed", "Assumed")}${chip("confirmed", "Confirmed")}${chip("all", "All")}</div>
      <label class="pb-filter-page"><span class="bt-label">Page</span><select class="bt-select" data-fpage><option value="all">Every page</option>${pages.map((x) => `<option value="${esc(x.id)}"${f.page === x.id ? " selected" : ""}>${esc(x.nav)}</option>`).join("")}</select></label></div>
      ${list.length ? `<ul class="pb-flags">${list.map((x) => flagRowHtml(x, { pageLabel: pm.get(x.pageId)?.nav || x.pageId }).replace("</li>", `<div class="pb-flag-more"><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-flag-edit="${esc(x.id)}">Edit</button><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-flag-remove="${esc(x.id)}">Remove</button></div></li>`)).join("")}</ul>`
        : `<div class="bt-empty bt-empty--compact">${mascot()}<span class="bt-empty-title">Nothing here.</span><span>Try another filter.</span></div>`}
    </section>
    <section class="ai-sec pb-sec" id="ch-decisions" aria-labelledby="h-ch-decisions"><header class="bt-chapter bt-chapter--ghost" data-n="02"><p class="bt-chapter-eyebrow" aria-hidden="true">02 · Chapter</p><h2 class="bt-chapter-title" id="h-ch-decisions">The decisions log</h2></header>
      ${decisions.length ? `<div class="bt-table-wrap"><table class="bt-table pb-table"><thead><tr><th scope="col">Date</th><th scope="col">Decision</th><th scope="col">Page</th></tr></thead><tbody>${decisions.map((d) => `<tr><td class="pb-nowrap">${esc(niceDay(d.date))}</td><td>${renderInline(d.text)}</td><td>${d.pageId && pm.get(d.pageId) ? `<a href="?page=${encodeURIComponent(d.pageId)}" data-go="${esc(d.pageId)}">${esc(pm.get(d.pageId)!.nav)}</a>` : ""}</td></tr>`).join("")}</tbody></table></div>`
        : `<div class="bt-empty bt-empty--compact"><span class="bt-empty-title">No decisions yet.</span></div>`}
    </section>`;
  return withRail([["ch-flags", "Every flag"], ["ch-decisions", "The decisions log"]], content);
}

/* ---------- render ---------- */
function render() {
  if (!S.pages.length) { setAccess("empty"); return; }
  setAccess("page");
  const p = S.pages.find((x) => x.id === S.cur) || S.pages.find((x) => x.id === "overview") || S.pages[0];
  S.cur = p.id;
  const isOverview = p.id === "overview";
  const flags = p.id === "flags" ? null : flagsOf(p.id);
  const pageBody = p.id === "flags" ? flagsPageHtml(p) : withRail(chaptersOf(p.body, !!flags), renderPage(p.body, flags) + (isOverview ? pagesGridHtml() : "") + addQuestionHtml(p));
  root.innerHTML = `${chipsHtml()}${isOverview ? heroHtml(p) + reviewBarHtml() + pageHeadHtml(p, true) : pageHeadHtml(p)}${pageBody}
    ${isOverview ? `<section class="pb-close">${mascot()}<div><h2 class="bt-heading">Keep it alive</h2><p>Read a page, settle what you can, and mark it reviewed. On the 1st, copy the review prompt.</p></div><button type="button" class="bt-btn bt-btn--primary" data-copy-review>Copy review prompt</button></section>` : ""}`;
  root.querySelectorAll<HTMLElement>(".bt-toc").forEach((nav) => initToc(nav));
  initHowItWorks(root as unknown as Document);
  document.title = `${isOverview ? "The Playbook" : p.title} · Playbook`;
}
const addQuestionHtml = (p: Page) => (p.id === "flags" ? "" : `<div class="pb-add"><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-flag-add="${esc(p.id)}">Add a question or assumption</button></div>`);
function go(id: string, push = true) {
  S.cur = id;
  if (push) { const u = new URL(location.href); if (id === "overview") u.searchParams.delete("page"); else u.searchParams.set("page", id); u.hash = ""; history.pushState(null, "", u); }
  render();
  window.scrollTo({ top: 0 });
}
function toHash() {
  const id = decodeURIComponent(location.hash.slice(1)); const el = id ? document.getElementById(id) : null;
  if (el) requestAnimationFrame(() => { el.scrollIntoView({ block: "start" }); setTimeout(() => { if (Math.abs(el.getBoundingClientRect().top - (parseFloat(getComputedStyle(el).scrollMarginTop) || 0)) > 8) el.scrollIntoView({ block: "start" }); }, 500); });
}

/* ---------- copy ---------- */
async function copyText(text: string, ok: string) {
  try { await navigator.clipboard.writeText(text); toast(ok); return; } catch { /* the fallback */ }
  const { modal, close } = openModal({ feature: "playbook", wide: true, title: "Copy this", content: modalHeader("Copy this", "Your browser didn't let the page copy it. Select all and copy.") + `<textarea class="bt-textarea pb-copybox" rows="14" readonly>${esc(text)}</textarea><div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Done</button></div>` });
  const ta = modal.querySelector<HTMLTextAreaElement>("textarea"); ta?.focus(); ta?.select(); void close;
}
async function pulseSummary(sinceDay: string | null): Promise<PulseSummary | null> {
  if (P) return { days: 28, visitors: 1234, newMembers: 56, movers: ["Sample service +40%", "Another sample −12%"], alerts: ["A sample alert"] };
  try {
    const days = sinceDay ? Math.max(1, Math.round((Date.now() - Date.parse(`${sinceDay}T12:00:00Z`)) / 864e5)) : 28;
    const range = days <= 7 ? "7d" : days <= 28 ? "28d" : "90d";
    const n = range === "7d" ? 7 : range === "28d" ? 28 : 90;
    const { load: loadPulse, addDays, today } = await import("../pulse/data");
    const d = await loadPulse(range as any);
    const from = addDays(today(), -n + 1);
    const recent = d.days.filter((x) => x.day >= from);
    const visitors = recent.reduce((t, x) => t + (x.uniques || 0), 0), newMembers = recent.reduce((t, x) => t + (x.newMembers || 0), 0);
    const movers = (d.scores?.services || []).filter((s) => s.prevViews > 20).map((s) => ({ s, ch: (s.views - s.prevViews) / s.prevViews })).sort((a, b) => Math.abs(b.ch) - Math.abs(a.ch)).slice(0, 4).map(({ s, ch }) => `${s.name} ${ch >= 0 ? "+" : "−"}${Math.abs(Math.round(ch * 100))}%`);
    const alerts = (d.alerts || []).filter((a) => a.state === "new" || a.state === "ack").slice(0, 6).map((a) => a.title);
    return { days: n, visitors, newMembers, movers, alerts };
  } catch { return null; }
}
async function copyReviewPrompt() {
  const R = reviewable(), pm = pageById();
  let due: Page[], label: string;
  if (S.main.firstReadDone && S.due.duePages.length) { due = S.due.duePages.map((id) => pm.get(id)).filter(Boolean) as Page[]; label = `These ${due.length} pages are due this month.`; }
  else if (!S.main.firstReadDone) { due = R.filter((p) => !p.lastReviewedAt); if (!due.length) due = R; label = "This is my first read-through: these pages haven't been reviewed yet."; }
  else { due = R; label = "Nothing is due this month; this is an extra review of every page."; }
  const reviewedAt = R.map((p) => p.lastReviewedAt || 0).filter(Boolean);
  const since = reviewedAt.length ? dayOf(Math.max(...reviewedAt)) : null;
  const btn = root.querySelector<HTMLButtonElement>("[data-copy-review]"); if (btn) btn.disabled = true;
  const pulse = await pulseSummary(since);
  if (btn) btn.disabled = false;
  const decisions = S.decisions.filter((d) => !since || d.date > since).sort((a, b) => a.date.localeCompare(b.date));
  const text = reviewPrompt({ date: dayOf(Date.now()), due, dueLabel: label, since, pulse, decisions, flags: S.flags, pagesById: pm });
  try { localStorage.setItem(PROMPT_KEY, JSON.stringify({ at: Date.now(), versions: Object.fromEntries(S.pages.map((p) => [p.id, p.version])) })); } catch { /* fine */ }
  await copyText(text, `Review prompt copied (${due.length} page${due.length === 1 ? "" : "s"}). Paste it into a Claude chat.`);
}
function copyPage(p: Page) {
  try { const prev = JSON.parse(localStorage.getItem(PROMPT_KEY) || "{}"); localStorage.setItem(PROMPT_KEY, JSON.stringify({ at: Date.now(), versions: { ...(prev.versions || {}), [p.id]: p.version } })); } catch { /* fine */ }
  void copyText(pagePrompt(p, S.flags), "Page copied for Claude.");
}

/* ---------- dialogs ---------- */
function answerFlag(id: string) {
  const f = S.flags.find((x) => x.id === id); if (!f) return;
  const { modal, close } = openModal({ feature: "playbook", title: "Answer", content: modalHeader("Answer", "It's saved with the flag, the flag is confirmed, and the answer goes in the decisions log.") +
    `<form class="bt-form" novalidate><p class="pb-modal-flag">${renderInline(f.text)}</p><label class="bt-field"><span class="bt-label">Your answer</span><textarea class="bt-textarea" rows="4" maxlength="2000" required></textarea><span class="bt-hint">One paragraph. Markdown is fine.</span></label><p class="bt-error" role="alert" hidden></p><div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="submit" class="bt-btn bt-btn--primary">Save answer</button></div></form>` });
  const form = modal.querySelector("form")!, err = modal.querySelector<HTMLElement>(".bt-error")!, ta = form.querySelector("textarea")!;
  ta.focus();
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); err.hidden = true;
    const answer = ta.value.trim();
    if (!answer || /\n\s*\n/.test(answer)) { err.textContent = answer ? "Keep it to one paragraph." : "Write the answer first."; err.hidden = false; return; }
    try { await rpc("flagAction", { op: "answer", id, answer }); close(); toast("Answered. It's in the decisions log."); await refresh(); }
    catch (x) { err.textContent = messageFor(x, "That didn't save. Try again."); err.hidden = false; }
  });
}
function flagTextDialog(mode: "add" | "edit", ref: string) {
  const f = mode === "edit" ? S.flags.find((x) => x.id === ref) : null;
  const { modal, close } = openModal({ feature: "playbook", title: mode === "add" ? "Add a flag" : "Edit the flag", content: modalHeader(mode === "add" ? "Add a flag" : "Edit the flag") +
    `<form class="bt-form" novalidate>${mode === "add" ? `<div class="bt-field"><span class="bt-label">Kind</span><div class="bt-sortbar" role="radiogroup"><label class="bt-chip bt-chip--small"><input type="radio" name="st" value="open" checked> Open question</label><label class="bt-chip bt-chip--small"><input type="radio" name="st" value="assumed"> Assumption</label></div></div>` : ""}
      <label class="bt-field"><span class="bt-label">Text</span><textarea class="bt-textarea" rows="4" maxlength="2000">${esc(f?.text || "")}</textarea><span class="bt-hint">One paragraph. Markdown is fine.</span></label><p class="bt-error" role="alert" hidden></p>
      <div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="submit" class="bt-btn bt-btn--primary">${mode === "add" ? "Add" : "Save"}</button></div></form>` });
  const form = modal.querySelector("form")!, err = modal.querySelector<HTMLElement>(".bt-error")!, ta = form.querySelector("textarea")!;
  ta.focus();
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); err.hidden = true;
    const text = ta.value.trim();
    if (!text || /\n\s*\n/.test(text)) { err.textContent = text ? "Keep it to one paragraph." : "Write the text first."; err.hidden = false; return; }
    try {
      if (mode === "add") await rpc("flagAction", { op: "add", pageId: ref, status: (form.querySelector<HTMLInputElement>('input[name="st"]:checked')?.value) || "open", text });
      else await rpc("flagAction", { op: "edit", id: ref, text });
      close(); toast(mode === "add" ? "Added." : "Saved."); await refresh();
    } catch (x) { err.textContent = messageFor(x, "That didn't save. Try again."); err.hidden = false; }
  });
}
function editPage(p: Page) {
  const { modal, close } = openModal({ feature: "playbook", wide: true, title: `Edit ${p.nav}`, content: modalHeader(`Edit ${esc(p.nav)}`, `Version ${p.version}. Saving keeps this one in History.`) +
    `<form class="bt-form pb-edit" novalidate><div class="pb-edit-fields"><label class="bt-field"><span class="bt-label">Title</span><input class="bt-input" name="title" maxlength="120" value="${esc(p.title)}"></label><label class="bt-field"><span class="bt-label">Lede</span><input class="bt-input" name="lede" maxlength="600" value="${esc(p.lede)}"></label></div>
      <div class="pb-edit-split"><label class="bt-field pb-edit-src"><span class="bt-label">Markdown</span><textarea class="bt-textarea pb-mono" name="body" spellcheck="false">${esc(p.body)}</textarea><span class="bt-hint">## starts a chapter. Fenced blocks: cards, steps, tiers, ladder, rules, flow. Raw HTML shows as text.</span></label>
      <div class="pb-edit-prev"><span class="bt-label">Preview</span><div class="pb-edit-prev-in" data-prev aria-live="polite"></div></div></div>
      <p class="bt-notice bt-notice--warn" data-stale hidden>This page changed since you opened it. <button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-reload>Reload</button></p><p class="bt-error" role="alert" hidden></p>
      <div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="submit" class="bt-btn bt-btn--primary">Save</button></div></form>` });
  const form = modal.querySelector<HTMLFormElement>("form")!, prev = modal.querySelector<HTMLElement>("[data-prev]")!, err = modal.querySelector<HTMLElement>(".bt-error")!;
  const val = (n: string) => (form.elements.namedItem(n) as HTMLInputElement).value;
  let t = 0;
  const paint = () => { prev.innerHTML = renderPage(val("body"), null); prev.querySelectorAll<HTMLElement>("[data-journey]").forEach(() => initHowItWorks(prev as unknown as Document)); };
  paint();
  (form.elements.namedItem("body") as HTMLTextAreaElement).addEventListener("input", () => { clearTimeout(t); t = window.setTimeout(paint, 150); });
  modal.querySelector("[data-reload]")!.addEventListener("click", async () => { close(); await refresh(); const fresh = S.pages.find((x) => x.id === p.id); if (fresh) editPage(fresh); });
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); err.hidden = true;
    try { const r = await rpc<{ version: number }>("savePage", { pageId: p.id, version: p.version, title: val("title"), lede: val("lede"), body: val("body") }); close(); toast(`Saved. Version ${r.version}.`); await refresh(); }
    catch (x) { if (reasonOf(x) === "stale") { modal.querySelector<HTMLElement>("[data-stale]")!.hidden = false; return; } err.textContent = messageFor(x, "That didn't save. Try again."); err.hidden = false; }
  });
}
async function historyOf(p: Page) {
  const list = await loadVersions(p.id).catch(() => [] as Version[]);
  const { modal, close } = openModal({ feature: "playbook", wide: true, title: `History of ${p.nav}`, content: modalHeader(`History of ${esc(p.nav)}`, `Now at version ${p.version}. Restoring an older one keeps the current text as a version too.`) +
    (list.length ? `<ol class="pb-hist">${list.map((v) => `<li><div class="pb-hist-top"><b>Version ${v.n}</b><span class="bt-tag">${esc(v.source)}</span><span class="pb-hist-at">${esc(nice(v.savedAt))}</span><span class="pb-sp"></span><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-hv="${v.n}" aria-expanded="false">Preview</button><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-restore="${v.n}">Restore</button></div><div class="pb-hist-prev pb-prose" data-hp="${v.n}" hidden></div></li>`).join("")}</ol>`
      : `<div class="bt-empty bt-empty--compact">${mascot()}<span class="bt-empty-title">No earlier versions yet.</span><span>Every save, update and restore keeps the text it replaced here.</span></div>`) + `<div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Close</button></div>` });
  modal.addEventListener("click", (e) => {
    const t = e.target as Element;
    const pv = t.closest<HTMLButtonElement>("[data-hv]");
    if (pv) { const box = modal.querySelector<HTMLElement>(`[data-hp="${pv.dataset.hv}"]`)!; const v = list.find((x) => String(x.n) === pv.dataset.hv)!; if (box.hidden) box.innerHTML = renderPage(v.body, null); box.hidden = !box.hidden; pv.setAttribute("aria-expanded", String(!box.hidden)); return; }
    const rs = t.closest<HTMLButtonElement>("[data-restore]");
    if (rs) void confirmAction({ title: `Restore version ${rs.dataset.restore}?`, message: "The page goes back to that text. The current text is kept as a version, so you can undo this from History.", confirmLabel: "Restore", busyLabel: "Restoring…", danger: false, feature: "playbook",
      onConfirm: async () => { try { await rpc("restoreVersion", { pageId: p.id, n: Number(rs.dataset.restore), version: p.version }); } catch (x) { throw new Error(reasonOf(x) === "stale" ? "This page changed since you opened it. Close History and open it again." : messageFor(x, "That didn't restore. Try again.")); } } })
      .then(async (yes: boolean) => { if (!yes) return; close(); toast("Restored."); await refresh(); });
  });
}
function applyDialog() {
  const { modal, close } = openModal({ feature: "playbook", wide: true, title: "Apply an update", content: modalHeader("Apply an update", "Paste Claude's whole reply. The page finds the playbook-update block, checks it and shows what would change. Nothing is saved until you press Save.") +
    `<div class="pb-apply"><label class="bt-field"><span class="bt-label">Claude's reply</span><textarea class="bt-textarea pb-mono" rows="8" data-reply spellcheck="false"></textarea></label>
      <div class="pb-apply-acts"><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-check>Check it</button></div>
      <div data-out aria-live="polite"></div></div>
      <div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="button" class="bt-btn bt-btn--admin" data-save disabled>Save</button></div>` });
  const out = modal.querySelector<HTMLElement>("[data-out]")!, save = modal.querySelector<HTMLButtonElement>("[data-save]")!;
  let update: Update | null = null, force = false, expect: Record<string, number> = {};
  const say = (html: string) => { out.innerHTML = html; };
  const check = () => {
    update = null; force = false; save.disabled = true; save.textContent = "Save";
    const found = findUpdate(modal.querySelector<HTMLTextAreaElement>("[data-reply]")!.value);
    if (!found) return say(`<p class="bt-notice bt-notice--error">No update block in that reply. Look for a block that starts with <code>\`\`\`playbook-update</code> and paste the whole reply again.</p>`);
    if ("error" in found) return say(`<p class="bt-notice bt-notice--error">${esc(found.error)} Nothing was saved.</p>`);
    const v = checkUpdate(found.json, { pageIds: new Set(S.pages.map((p) => p.id)), flagIds: new Set(S.flags.map((f) => f.id)) });
    if (v.ok === false) return say(`<p class="bt-notice bt-notice--error">${esc(v.message)} Nothing was saved.</p>`);
    update = v.value;
    let stored: Record<string, number> = {}; try { stored = JSON.parse(localStorage.getItem(PROMPT_KEY) || "{}").versions || {}; } catch { /* none */ }
    const pm = pageById();
    expect = Object.fromEntries((update.pages || []).filter((p) => stored[p.id] != null).map((p) => [p.id, stored[p.id]]));
    const stale = Object.entries(expect).filter(([id, n]) => pm.get(id)!.version !== n).map(([id]) => pm.get(id)!.nav);
    const pagesHtml = (update.pages || []).map((up) => {
      const cur = pm.get(up.id)!, body = up.body ?? cur.body, d = lineDelta(cur.body, body);
      const fields = ["title", "lede", "body"].filter((k) => (up as any)[k] !== undefined && (up as any)[k] !== (cur as any)[k]);
      return `<section class="pb-diff"><div class="pb-diff-top"><b>${esc(cur.nav)}</b>${fields.length ? `<span class="bt-tag">${fields.join(", ")} changed</span>` : '<span class="bt-tag">No text change</span>'}${up.body !== undefined ? `<span class="pb-delta">+${d.added} / −${d.removed} lines</span>` : ""}${up.markReviewed ? '<span class="bt-tag pb-tag-ok">Marked reviewed</span>' : ""}</div>
        ${fields.length ? `<div class="pb-diff-cols"><div><span class="bt-label">Now</span><div class="pb-diff-pane">${up.title !== undefined && up.title !== cur.title ? `<p><b>${esc(cur.title)}</b></p>` : ""}${renderPage(cur.body, null)}</div></div><div><span class="bt-label">After</span><div class="pb-diff-pane is-new">${up.title !== undefined && up.title !== cur.title ? `<p><b>${esc(up.title)}</b></p>` : ""}${renderPage(body, null)}</div></div></div>` : ""}</section>`;
    }).join("");
    const fm = new Map(S.flags.map((f) => [f.id, f]));
    const OPW: Record<string, string> = { confirm: "Confirm", answer: "Answer", edit: "Edit", add: "Add", remove: "Remove" };
    const flagsHtml = (update.flags || []).map((f) => `<li><span class="bt-badge bt-badge--${f.op === "remove" ? "red" : f.op === "add" ? "blue" : "lime"}">${OPW[f.op]}</span><span>${f.op === "add" ? `${esc(pm.get(f.pageId!)?.nav || "")}: ${renderInline(f.text || "")}` : `${renderInline(fm.get(f.id!)?.text || "")}${f.op === "answer" ? `<br><b>Answer:</b> ${renderInline(f.answer || "")}` : f.op === "edit" ? `<br><b>Becomes:</b> ${renderInline(f.text || "")}` : ""}`}</span></li>`).join("");
    const decHtml = (update.decisions || []).map((d) => `<li>${renderInline(d.text)}${d.pageId ? ` <span class="pb-flag-page">${esc(pm.get(d.pageId)?.nav || "")}</span>` : ""}</li>`).join("");
    say(`${stale.length ? `<p class="bt-notice bt-notice--warn"><b>Changed since you copied the prompt:</b> ${esc(stale.join(", "))}. Saving replaces those edits (they stay in History).</p>` : ""}
      ${pagesHtml ? `<h3 class="bt-label pb-apply-h">Pages</h3>${pagesHtml}` : ""}${flagsHtml ? `<h3 class="bt-label pb-apply-h">Flags</h3><ul class="pb-ops">${flagsHtml}</ul>` : ""}${decHtml ? `<h3 class="bt-label pb-apply-h">New decisions</h3><ul class="pb-ops">${decHtml}</ul>` : ""}`);
    force = stale.length > 0; save.textContent = force ? "Save anyway" : "Save"; save.disabled = false;
  };
  modal.querySelector("[data-check]")!.addEventListener("click", check);
  modal.querySelector<HTMLTextAreaElement>("[data-reply]")!.focus();
  save.addEventListener("click", async () => {
    if (!update) return;
    save.disabled = true; save.textContent = "Saving…";
    try {
      const r = await rpc<{ firstReadDone?: boolean }>("applyUpdate", { update, expect, force });
      try { localStorage.removeItem(PROMPT_KEY); } catch { /* fine */ }
      close(); toast("Update applied."); await refresh(); if (r && r.firstReadDone) celebrate();
    } catch (x) {
      if (reasonOf(x) === "stale") { force = true; save.textContent = "Save anyway"; save.disabled = false; say(`<p class="bt-notice bt-notice--warn">A page changed since you copied the prompt. Save anyway replaces those edits (they stay in History).</p>` + out.innerHTML); return; }
      say(`<p class="bt-notice bt-notice--error">${esc(messageFor(x, "That didn't save."))} Nothing was saved.</p>` + out.innerHTML); save.disabled = false; save.textContent = force ? "Save anyway" : "Save";
    }
  });
}
function celebrate() {
  toast("First read-through done. Monthly reviews start on the 1st.");
  const bar = root.querySelector<HTMLElement>("[data-pb-bar]");
  if (bar) { bar.insertAdjacentHTML("beforeend", `<span class="pb-bar-stamp">${stampHtml({ kicker: "First read", label: "Done", tone: "lime", size: "sm" })}</span>`); bar.classList.add("is-celebrate"); }
}
async function markReviewed(p: Page, btn: HTMLButtonElement) {
  if (S.busy) return; S.busy = true; btn.disabled = true;
  try {
    const r = await rpc<{ firstReadDone?: boolean }>("markReviewed", { pageId: p.id });
    toast(`${p.nav} marked reviewed.`);
    await refresh();
    if (r && r.firstReadDone) { go("overview"); celebrate(); }
  } catch (x) { toast(messageFor(x, "That didn't save. Try again."), { kind: "error" }); btn.disabled = false; }
  finally { S.busy = false; }
}

/* ---------- events ---------- */
function wire() {
  root.addEventListener("click", (e) => {
    const t = e.target as Element;
    const p = S.pages.find((x) => x.id === S.cur)!;
    const g = t.closest<HTMLElement>("[data-go]"); if (g && !(e as MouseEvent).metaKey && !(e as MouseEvent).ctrlKey) { e.preventDefault(); go(g.dataset.go!); return; }
    if (t.closest("[data-copy-review]")) { void copyReviewPrompt(); return; }
    if (t.closest("[data-apply]")) { applyDialog(); return; }
    if (t.closest("[data-copy-page]")) { copyPage(p); return; }
    if (t.closest("[data-edit]")) { editPage(p); return; }
    if (t.closest("[data-history]")) { void historyOf(p); return; }
    const rv = t.closest<HTMLButtonElement>("[data-reviewed]"); if (rv) { void markReviewed(p, rv); return; }
    const fc = t.closest<HTMLButtonElement>("[data-flag-confirm]");
    if (fc) { fc.disabled = true; void rpc("flagAction", { op: "confirm", id: fc.dataset.flagConfirm }).then(async () => { toast("Confirmed. It's in the decisions log."); await refresh(); }, (x) => { toast(messageFor(x, "That didn't save."), { kind: "error" }); fc.disabled = false; }); return; }
    const fa = t.closest<HTMLElement>("[data-flag-answer]"); if (fa) { answerFlag(fa.dataset.flagAnswer!); return; }
    const fe = t.closest<HTMLElement>("[data-flag-edit]"); if (fe) { flagTextDialog("edit", fe.dataset.flagEdit!); return; }
    const fd = t.closest<HTMLElement>("[data-flag-add]"); if (fd) { flagTextDialog("add", fd.dataset.flagAdd!); return; }
    const fr = t.closest<HTMLElement>("[data-flag-remove]");
    if (fr) { void confirmAction({ title: "Remove this flag?", message: "It's deleted for good. Settled flags are better confirmed or answered, so they stay in the decisions log.", confirmLabel: "Remove", busyLabel: "Removing…", feature: "playbook", onConfirm: async () => { await rpc("flagAction", { op: "remove", id: fr.dataset.flagRemove }); } }).then(async (yes: boolean) => { if (yes) { toast("Removed."); await refresh(); } }); return; }
    const fs = t.closest<HTMLElement>("[data-fstatus]"); if (fs) { S.filter.status = fs.dataset.fstatus as any; render(); return; }
  });
  root.addEventListener("change", (e) => { const t = e.target as HTMLSelectElement; if (t.matches("[data-fpage]")) { S.filter.page = t.value; render(); } });
  addEventListener("popstate", () => { S.cur = qs().get("page") || "overview"; render(); toHash(); });
}

/* ---------- access and start ---------- */
let started = false;
async function start() {
  try { await load(); } catch (err) { setAccess("error"); const m = document.querySelector<HTMLElement>("[data-pb-error]"); if (m) m.textContent = messageFor(err, "Check your connection and try again."); return; }
  S.cur = qs().get("page") || "overview";
  wire();
  render();
  toHash();
}
const dock = document.querySelector<HTMLElement>("[data-pb-dock]"); if (dock) initStickyBar(dock, { progress: true });
document.querySelector("[data-pb-retry]")?.addEventListener("click", () => location.reload());
onAuth(async (s: AuthState) => {
  if (s.status === "loading" || started) return;
  if (!s.user && !isProduction && qs().get("as") === "owner") { started = true; P = (await import("../../data/preview-playbook.json")).default; P.versions = JSON.parse(JSON.stringify(P.versions || {})); await start(); return; }
  if (!s.user || s.status === "needsSignup") { setAccess("join"); return; }
  started = true;
  try {
    const { db, doc, getDoc, SITE_ID } = await import("../../lib/db");
    const site = await getDoc(doc(db, "sites", SITE_ID));
    if (String(site.get("ownerUid") || "") !== s.user.uid) { setAccess("denied"); return; }
  } catch { setAccess("denied"); return; }
  await start();
});
void reduced;
