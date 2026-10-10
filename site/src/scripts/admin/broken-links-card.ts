// /admin: the Broken links card (docs/specs/not-found.md "Data"): addresses people reported from the 404 page. Open rows (fixedAt null), most
// reported first, top 20: Address, Reports, Last reported, Came from, and Mark fixed (brokenLinkFix: sets fixedAt and fixedBy, never deletes;
// a new report reopens the row). Display only: the rules let admins read brokenLinks and nobody write. Preview (non-production, signed out,
// ?as=admin) shows site/src/data/preview-broken-links.json and Mark fixed only hides the row.
// The read is one orderBy("count") (single-field index, no composite needed) filtered to open rows here.
import { whenReady } from "../../lib/auth";
import { isAdmin, isPreview } from "../stash/gate";
import { messageFor } from "../../lib/errors";
import { escapeHtml } from "../../../../shared/ui/dom.js";
import { toast } from "../../../../shared/ui/toast.js";
import previewRows from "../../data/preview-broken-links.json";

type Row = { id: string; path: string; count: number; lastAt: number; referrerHosts: string[] };
const TOP = 20, SCAN = 100;   // read the 100 most reported, show the 20 most reported open ones
const esc = (v: unknown) => escapeHtml(String(v ?? ""));
const card = document.querySelector<HTMLElement>("[data-bl-card]");

function ago(t: number) {
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

async function read(): Promise<Row[]> {
  if (isPreview()) return (previewRows as Array<Omit<Row, "lastAt"> & { lastAtAgo: number }>).map((r) => ({ ...r, lastAt: Date.now() - r.lastAtAgo }));
  const { db, collection, getDocs, query, orderBy, limit, SITE_ID } = await import("../../lib/db");
  const snap = await getDocs(query(collection(db, "sites", SITE_ID, "brokenLinks"), orderBy("count", "desc"), limit(SCAN)));
  return snap.docs.filter((d) => !d.get("fixedAt")).slice(0, TOP).map((d) => ({
    id: d.id, path: d.get("path") || "", count: d.get("count") || 0, lastAt: d.get("lastAt")?.toMillis?.() || 0, referrerHosts: d.get("referrerHosts") || [],
  }));
}

const rowHtml = (r: Row) => `<tr data-id="${esc(r.id)}">
  <td><span class="bt-code bl-path" title="${esc(r.path)}">${esc(r.path)}</span></td>
  <td class="bl-n">${r.count}</td>
  <td class="bl-when">${r.lastAt ? esc(ago(r.lastAt)) : "—"}</td>
  <td class="bl-from">${esc(r.referrerHosts.join(", ") || "direct")}</td>
  <td class="bl-act"><button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-bl-fix>Mark fixed</button></td>
</tr>`;

whenReady().then(async (s) => {
  if (!card || !isAdmin(s)) return;
  const body = card.querySelector<HTMLElement>("[data-bl-body]")!, empty = card.querySelector<HTMLElement>("[data-bl-empty]")!;
  const showEmpty = () => { body.hidden = true; empty.hidden = false; };
  card.hidden = false;
  let rows: Row[];
  try { rows = await read(); }
  catch (err) {
    console.warn("broken links card: couldn't read", err);
    body.innerHTML = '<p class="bt-meta">Couldn\'t read the broken links. Reload to try again.</p>';
    return;
  }
  if (!rows.length) { showEmpty(); return; }
  body.innerHTML = `<div class="bt-table-wrap"><table class="bt-table bl-table">
    <thead><tr><th scope="col">Address</th><th scope="col">Reports</th><th scope="col">Last reported</th><th scope="col">Came from</th><th scope="col" aria-label="Mark fixed"></th></tr></thead>
    <tbody>${rows.map(rowHtml).join("")}</tbody></table></div>`;
  body.addEventListener("click", async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-bl-fix]");
    if (!btn || btn.disabled) return;
    const tr = btn.closest<HTMLElement>("tr")!, id = tr.dataset.id!;
    btn.disabled = true; btn.innerHTML = '<span class="bt-spinner" aria-hidden="true"></span>Marking…';
    try {
      if (!isPreview()) { const { call } = await import("../../lib/call"); await call("brokenLinkFix", { id }); }
      const path = tr.querySelector(".bl-path")?.textContent || "That address";
      tr.remove();
      toast(`${path} marked fixed.`);
      if (!body.querySelector("tbody tr")) showEmpty();
    } catch (err) {
      btn.disabled = false; btn.textContent = "Mark fixed";
      toast(messageFor(err, "Couldn't mark it fixed. Try again."), { kind: "error" });
    }
  });
});
