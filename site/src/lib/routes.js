// The site's known public paths, for the 404 page's "Did you mean" (docs/specs/not-found.md "Page content" 3).
// Built from src/pages when the site builds (import.meta.glob only lists the files; nothing is imported), so a new
// page is suggested without touching this file. Left out: the 404 itself, dynamic routes ([slug]), the rewrite
// targets behind them (view.astro: /games/:slug, /u/:handle, /join/:handle in public/_redirects), admin, dev, API
// and the auth callbacks (sign-in plumbing, never a page to land on).
const files = Object.keys(import.meta.glob("../pages/**/*.{astro,md}"));

const SKIP = /(^|\/)(404|view|_[^/]*)$|\[|^\/(admin|dev|api|auth)(\/|$)/;

/** Every known path, sorted: "/", "/arcade", "/arcade/how-it-works", … */
export const knownRoutes = [...new Set(files
  .map((f) => f.replace(/^\.\.\/pages/, "").replace(/\.(astro|md)$/, "").replace(/\/index$/, "") || "/")
  .filter((p) => !SKIP.test(p)))].sort();
