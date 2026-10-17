// Build-time lookup of a page's Service Hub manifest (docs/specs/service-hub.md §3a, §8a): BaseLayout asks which service claims the current route,
// to render the page strip (TalkBackNote.astro). Routes in the manifests are page paths; a dynamic segment ("/crew/academy/[slug]") matches any
// one segment. Pages the strip always skips (spec §8a): /auth/*, /admin/*, /live/obs, /live/control and its checklist, checkout, 404 and errors.
const files = import.meta.glob("../../../services/*.json", { eager: true, import: "default" });
export type TalkBack = "note" | "pins" | "rate" | "skip";
export interface Manifest { id: string; name: string; type: string; status: string; audience: string; version: string; routes: string[]; talkBack: TalkBack; talkBackRoutes?: Record<string, TalkBack>; checks?: string[] }
const all = Object.values(files) as Manifest[];

const clean = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p) || "/";
const SKIP = [/^\/auth(\/|$)/, /^\/admin(\/|$)/, /^\/live\/obs(\/|$)/, /^\/live\/control(\/|$)/, /^\/checkout(\/|$)/, /^\/404$/, /^\/500$/];
const pattern = (route: string) => new RegExp(`^${clean(route).split("/").map((s) => (/^\[.+\]$/.test(s) ? "[^/]+" : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("/")}$`);

/** The manifest whose routes claim this path (exact routes first, then dynamic ones), or null; null too for the always-skipped pages. */
export function manifestFor(pathname: string): Manifest | null {
  const p = clean(pathname.replace(/\/index\.html$/, "").replace(/\.html$/, ""));
  if (SKIP.some((re) => re.test(p))) return null;
  return all.find((m) => (m.routes || []).some((r) => clean(r) === p))
    || all.find((m) => (m.routes || []).some((r) => r.includes("[") && pattern(r).test(p)))
    || null;
}
/** Traffic Pulse (docs/specs/traffic-pulse.md §3A): the service id every page counts under, written on <body data-service> at build. Unlike
 *  manifestFor it skips nothing (admin pages count too); a page no manifest claims is "unassigned" (flagged on /admin/pulse). */
export function serviceIdFor(pathname: string): string {
  const p = clean(pathname.replace(/\/index\.html$/, "").replace(/\.html$/, ""));
  const m = all.find((x) => (x.routes || []).some((r) => clean(r) === p)) || all.find((x) => (x.routes || []).some((r) => r.includes("[") && pattern(r).test(p)));
  return m ? m.id : "unassigned";
}
export const manifestById = (id: string): Manifest | null => all.find((m) => m.id === id) || null;
/** The page strip on this path: the manifest's talkBackRoutes entry for it (e.g. a tool page "rate", its How it works "note"), else its talkBack. */
export function talkBackFor(m: Manifest, pathname: string): TalkBack {
  const p = clean(pathname.replace(/\/index\.html$/, "").replace(/\.html$/, ""));
  const hit = Object.entries(m.talkBackRoutes || {}).find(([r]) => clean(r) === p);
  return hit ? hit[1] : m.talkBack;
}
