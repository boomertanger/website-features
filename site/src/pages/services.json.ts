// /services.json: every Service Hub manifest (services/<id>.json at the repo root; docs/specs/service-hub.md §3a) and a build hash, written once at
// build time (a prerendered static endpoint: the site has no server). /admin/services compares `hash` with Firestore and sends the manifests to
// serviceSync when they differ. The hash is the SHA-256 of the combined manifests (sorted by id), so any manifest change gives a new hash.
import type { APIRoute } from "astro";
import { createHash } from "node:crypto";

const files = import.meta.glob("../../../services/*.json", { eager: true, import: "default" });

export const GET: APIRoute = () => {
  const services = (Object.values(files) as { id: string }[]).sort((a, b) => a.id.localeCompare(b.id));
  const hash = createHash("sha256").update(JSON.stringify(services)).digest("hex");
  return new Response(JSON.stringify({ hash, count: services.length, services }), { headers: { "Content-Type": "application/json; charset=utf-8" } });
};
