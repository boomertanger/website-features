// /services.json: every Service Hub manifest (services/<id>.json at the repo root; docs/specs/service-hub.md §3a) and a build hash, written once at
// build time (a prerendered static endpoint: the site has no server). /admin/services compares `hash` with Firestore and sends the manifests to
// serviceSync when they differ. The hash is the SHA-256 of the combined manifests (sorted by id), so any manifest change gives a new hash.
// "unclaimed" lists the page routes in src/pages that no manifest claims (the same list scripts/check-services.js warns about: endpoints and /dev/*
// left out), for the Needs attention view. It isn't part of the hash.
import type { APIRoute } from "astro";
import { createHash } from "node:crypto";

const files = import.meta.glob("../../../services/*.json", { eager: true, import: "default" });
const pages = Object.keys(import.meta.glob("./**/*.{astro,md,mdx}"));

/** "./games/view.astro" → "/games/view"; "./index.astro" → "/"; /dev pages are left out (null). */
function routeOf(file: string): string | null {
  let r = "/" + file.replace(/^\.\//, "").replace(/\.(astro|md|mdx)$/, "");
  r = r.replace(/\/index$/, "") || "/";
  if (r === "/index") r = "/";
  return r === "/dev" || r.startsWith("/dev/") ? null : r;
}

export const GET: APIRoute = () => {
  const services = (Object.values(files) as { id: string; routes?: string[] }[]).sort((a, b) => a.id.localeCompare(b.id));
  const hash = createHash("sha256").update(JSON.stringify(services)).digest("hex");
  const claimed = new Set(services.flatMap((s) => s.routes || []));
  const unclaimed = pages.map(routeOf).filter((r): r is string => !!r && !claimed.has(r)).sort();
  return new Response(JSON.stringify({ hash, count: services.length, services, unclaimed }), { headers: { "Content-Type": "application/json; charset=utf-8" } });
};
