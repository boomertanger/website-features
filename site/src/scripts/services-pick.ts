// "Which part of the site?" for Bug Zapper reports and Feature Lab ideas (docs/specs/service-hub.md §3a "Bugs and ideas"; Service Hub part 4).
//   loadServices({ preview })   the services a report or an idea can be about: public/services (the member-safe list the functions keep), limited to
//                               features, pages, Arcade games and stream setup that are live or being built (no Vault games or streams: there are hundreds).
//                               Preview (the pages' signed-out ?as= mode) reads the build's /services.json instead, so it never touches Firestore.
//   serviceForPage(text)        the service whose routes match the path in text, from /services.json (the manifests' routes; the same rules as the
//                               functions' serviceForPath: exact routes first, then [slug] and /view patterns)
//   serviceSelectHtml(o)        a kit .bt-field with a .bt-select grouped by area (<optgroup>), the "none" option first
//   serviceTagHtml(id)          the service as a small .bt-tag (any known service, after loadServices), or "" when unset or unknown
import { escapeHtml } from "../../../shared/ui/dom.js";

export interface PickService { id: string; name: string; area: string; type: string; status: string }
const TYPES = ["feature", "page", "arcadeGame", "streamSetup"];
const OPEN = ["live", "building"];
const esc = escapeHtml as (s: unknown) => string;

let manifests: Promise<{ id: string; name: string; area: string; type: string; status: string; routes: string[] }[]> | null = null;
function loadManifests() {
  manifests ||= fetch("/services.json").then((r) => (r.ok ? r.json() : { services: [] })).then((j) => j.services || []).catch(() => []);
  return manifests;
}

let listCache: Promise<PickService[]> | null = null;
const names = new Map<string, string>();   // every known service, for the tags (a report may point at one the select leaves out)
export function loadServices({ preview = false } = {}): Promise<PickService[]> {
  listCache ||= (async () => {
    let rows: any[] = [];
    if (!preview) {
      try {
        const { db, doc, getDoc, SITE_ID } = await import("../lib/db");
        const s = await getDoc(doc(db, "sites", SITE_ID, "public", "services"));
        rows = s.exists() ? (s.data().services || []) : [];
      } catch { rows = []; }
    }
    if (!rows.length) rows = await loadManifests();   // preview, or before the first sync
    for (const r of [...(await loadManifests()), ...rows]) if (r && r.id && r.name) names.set(r.id, r.name);
    return rows.filter((r) => r && TYPES.includes(r.type) && OPEN.includes(r.status)).map((r) => ({ id: r.id, name: r.name, area: r.area || "Other", type: r.type, status: r.status }))
      .sort((a, b) => a.area.localeCompare(b.area) || a.name.localeCompare(b.name));
  })();
  return listCache;
}

/** The path in what someone typed or the page sent ("/x?y", "https://site/x", "site.com/x"); null for plain words. */
function pathOf(text: string): string | null {
  const t = String(text || "").trim();
  if (!t) return null;
  let p: string | null = null;
  if (t.startsWith("/")) p = t;
  else { const m = /^(?:https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(\/[^\s]*)?$/i.exec(t); if (m) p = m[1] || "/"; }
  if (!p) return null;
  p = p.split(/[?#]/)[0].replace(/\/{2,}/g, "/");
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return /\s/.test(p) ? null : p.toLowerCase();
}
const segs = (p: string) => p.split("/").filter(Boolean);
const patternMatches = (route: string, path: string) => {
  const r = segs(route.toLowerCase()), p = segs(path);
  return r.length === p.length && r.every((s, i) => s === p[i] || /^\[[^\]]+\]$/.test(s) || (s === "view" && i === r.length - 1 && i > 0));
};
export async function serviceForPage(text: string): Promise<string | null> {
  const path = pathOf(text);
  if (!path) return null;
  const list = (await loadManifests()).filter((m) => m.status !== "retired");
  for (const m of list) if ((m.routes || []).some((r) => r.toLowerCase() === path)) return m.id;
  let best: string | null = null, score = -1;
  for (const m of list) for (const r of m.routes || []) {
    if (!patternMatches(r, path)) continue;
    const s = segs(r).filter((x) => !/^\[[^\]]+\]$/.test(x) && x !== "view").length;
    if (s > score) { best = m.id; score = s; }
  }
  return best;
}

export function serviceSelectHtml({ id, label, list, value = "", none, hint = "" }: { id: string; label: string; list: PickService[]; value?: string; none: string; hint?: string }): string {
  const areas = [...new Set(list.map((s) => s.area))];
  // a value that isn't in the list (a retired service, or an admin tool) still shows, so an edit never clears it by accident
  const extra = value && !list.some((s) => s.id === value) ? `<option value="${esc(value)}" selected>${esc(value)}</option>` : "";
  const groups = areas.map((a) => `<optgroup label="${esc(a)}">${list.filter((s) => s.area === a).map((s) => `<option value="${esc(s.id)}"${s.id === value ? " selected" : ""}>${esc(s.name)}</option>`).join("")}</optgroup>`).join("");
  return `<div class="bt-field"><label class="bt-label" for="${esc(id)}">${esc(label)}</label><select id="${esc(id)}" class="bt-select"><option value=""${value ? "" : " selected"}>${esc(none)}</option>${extra}${groups}</select>${hint ? `<span class="bt-hint">${esc(hint)}</span>` : ""}</div>`;
}

export function serviceTagHtml(id: string | null | undefined): string {
  const name = id ? names.get(id) : null;
  return name ? `<span class="bt-tag">${esc(name)}</span>` : "";
}
