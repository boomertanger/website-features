// Every Boomertang issue page (docs/specs/boomertang.md §3, §5, §6), on top of the static HTML from IssueShell.astro:
//   - the issue bar: the Paper / Ink switch (scripts/boomertang/mode.ts: saved to the account when signed in, this browser otherwise) and
//     the arrow keys for Turn the page (never swipe);
//   - the locks: which of the issue's pages this reader can open (access.ts), on the bar, the contents and the sealed page's list;
//   - the cover's edition log (issues/{id}.editions, newest first);
//   - a members-only page: when this reader may read the issue, its text comes from Firestore (issues/{id}/pages/{slug}; the rules decide),
//     rendered by the same renderer as the public pages and sanitized; otherwise the sealed page (L2) with the lock card for this reader.
// The magazine's interactive blocks (the family tree, Survive's rooms, the redact, Chat's Verdict, The Map) are wired by blocks.ts after
// any page body is in place.
import DOMPurify from "dompurify";
import { initIssueBar, initTurnPage } from "../../../../shared/ui/magazine.js";
import { toast } from "../../../../shared/ui/toast.js";
import { db, doc, getDoc, SITE_ID } from "../../lib/db";
import { renderPage, pageHeadHtml } from "../../lib/boomertang/render.js";
import { loadTang, onReader, accessOf, type Reader, type TangState } from "./access";
import { modeNow, setMode, onMode, followAccount, type Mode } from "./mode";
import { wireBlocks } from "./blocks";
import issuesData from "../../data/boomertang/issues.json";

interface Meta { id: string; vol: number; no: number; title: string; slug: string; inRepo: boolean; membersOnly: boolean; pages: { slug: string; nav: string; n: string; kind: string; href: string; free: boolean }[] }

const root = document.getElementById("boomertang-root");
if (root) init(root);

function init(root: HTMLElement) {
  const meta = JSON.parse(root.querySelector("[data-tang-meta]")!.textContent || "{}") as Meta;
  const issue = (issuesData as { issues: any[] }).issues.find((i) => i.id === meta.id);
  const sources = Object.fromEntries((issue?.sources || []).map((s: any) => [s.id, s]));
  const hrefFor = (s: string) => meta.pages.find((p) => p.slug === s)?.href || `/boomertang/vol-${meta.vol}/no-${meta.no}/${s}`;

  // ---- Paper / Ink ----
  const bar = root.querySelector<HTMLElement>(".bt-issuebar")!;
  const barApi = initIssueBar(bar, {
    onMode: (m: Mode) => void setMode(m).then((where) => toast(`${m === "ink" ? "Ink" : "Paper"}. ${where === "account" ? "Saved to your account." : "Remembered in this browser."}`, { kind: "ok", ms: 3200 })),
  });
  barApi.set(modeNow());
  onMode((m) => barApi.set(m));

  // ---- Turn the page: buttons and the arrow keys ----
  const turn = root.querySelector<HTMLElement>("[data-turnpage] .bt-turnpage");
  if (turn) initTurnPage(turn);

  // the public page's own blocks are already in the HTML
  wireBlocks(root, { issueId: meta.id, slug: meta.slug, hrefFor, sources });

  // ---- who's reading, and what this issue gives them ----
  let tang: TangState | null = null;
  onReader(async (r) => {
    if (r.state) followAccount(r.state);
    tang ||= await loadTang([meta.id]);
    const a = accessOf(meta.id, meta.inRepo, tang, r);
    paintLocks(a.open);
    paintEditions(tang);
    if (meta.membersOnly) await membersPage(r, a.open, a.why);
    if (meta.slug === "contents" && !meta.inRepo) await membersLetter(a.open);
  });

  function paintLocks(open: boolean) {
    for (const p of meta.pages) {
      const locked = !p.free && !open;
      const link = bar.querySelector<HTMLElement>(`.bt-issuebar-nav a[href="${CSS.escape(p.href)}"]`);
      if (link) {
        link.toggleAttribute("data-locked", locked);
        link.querySelector(".bt-issuebar-lock")?.toggleAttribute("hidden", !locked);
        link.querySelector(".bt-sr-only")?.toggleAttribute("hidden", !locked);
      }
      root.querySelectorAll<HTMLElement>(`[data-lock="${CSS.escape(p.slug)}"]`).forEach((m) => { m.hidden = !locked; });
    }
  }

  function paintEditions(t: TangState) {
    const log = root.querySelector<HTMLElement>("[data-edlog]");
    const eds = t.issues[meta.id]?.editions || [];
    if (!log || !eds.length) return;
    const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    log.innerHTML = eds.slice(0, 6).map((e) => `<div><b>${fmt(e.date)}</b><span>${esc(e.note)}</span></div>`).join("") + `<div><b>${esc(issue?.edition || "Launch")}</b><span>The first edition.</span></div>`;
  }

  async function readPage(slug: string): Promise<string | null> {
    try {
      const s = await getDoc(doc(db, "sites", SITE_ID, "tang", "main", "issues", meta.id, "pages", slug));
      return s.exists() ? String(s.data().body || "") : null;
    } catch { return null; }   // permission-denied: the rules say no
  }
  const clean = (html: string) => DOMPurify.sanitize(html, { ADD_ATTR: ["aria-controls", "aria-expanded", "aria-pressed", "data-trust", "data-source", "data-redact-toggle", "data-pulse", "data-poll", "data-opt", "data-room", "data-floor", "data-guide", "data-person", "data-say", "data-map", "data-watch", "data-video", "data-polls", "data-rooms", "data-poll-bars", "data-poll-foot", "data-poll-state", "target"] });

  async function membersPage(r: Reader, open: boolean, why: string) {
    const sealed = root.querySelector<HTMLElement>("[data-sealed]"), body = root.querySelector<HTMLElement>("[data-tang-body]");
    if (!sealed || !body) return;
    const md = open && !r.preview ? await readPage(meta.slug) : null;
    if (md) {
      try {
        const { meta: pm, html } = renderPage(md, { issue, sources, hrefFor });
        body.innerHTML = clean(pageHeadHtml(pm, { bignum: pm.hedStyle === "bignum" }) + html);
        body.hidden = false; sealed.hidden = true;
        wireBlocks(body, { issueId: meta.id, slug: meta.slug, hrefFor, sources });
        return;
      } catch (err) { console.warn("boomertang: couldn't render the page", err); }
    }
    sealed.hidden = false; body.hidden = true;
    root.querySelector<HTMLElement>("[data-lockcard]")!.innerHTML = lockCardHtml(r, why, open && r.preview);
  }

  async function membersLetter(open: boolean) {
    const box = root.querySelector<HTMLElement>("[data-tang-letter]"), into = root.querySelector<HTMLElement>("[data-tang-letter-body]");
    if (!box || !into || !open) return;
    const md = await readPage("contents");
    if (!md) return;
    into.innerHTML = clean(renderPage(md, { issue, sources, hrefFor }).html);
    box.hidden = false;
  }

  function lockCardHtml(r: Reader, why: string, previewOnly: boolean) {
    const next = meta.no + 1;
    const join = '<button type="button" class="bt-btn bt-btn--primary" data-signin="join" data-signin-title="Join free for every back issue" data-pulse="tang-join">Join free</button>';
    const signin = '<p class="tg-alt">Already a member? <button type="button" class="bt-link-btn" data-signin="signin">Sign in</button></p>';
    const card = (ic: string, b: string, p: string, act: string) => `<div class="bt-lock-card"><span class="bt-lock-card-ic" aria-hidden="true">${ic}</span><div><b>${b}</b><p>${p}</p></div>${act}</div>`;
    if (previewOnly) return card("👀", "Preview", "This reader would see the page. Previews can't read members-only text: sign in as that reader to see it.", "");
    if (why === "draft" || why === "unknown") return card("🗞️", "This issue isn't out yet", "It's still on the desk. Read the latest issue in the meantime.", '<a class="bt-btn bt-btn--primary" href="/boomertang">The newsstand</a>');
    if (r.kind === "visitor" && why === "back") return card("🔒", "Back issues are free with Fan Club", `Join free to read No. ${meta.no} and every other past issue. No. 1 stays free for everyone.`, join) + signin;
    if (r.kind === "visitor") return card("🗞️", "This is the newest issue", `Sub Club reads it now. Join free and it's yours when No. ${next} comes out, along with every back issue.`, join) + signin;
    return card("🗞️", "Sub Club reads the newest issue first", `No. ${meta.no} opens for you when No. ${next} comes out. Sub Club is coming soon.`, '<a class="bt-btn bt-btn--primary" href="/boomertang#back-issues">Read back issues</a>');
  }
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
