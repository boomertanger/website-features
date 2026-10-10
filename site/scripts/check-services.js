#!/usr/bin/env node
// site/scripts/check-services.js — the Service Hub manifest check (docs/specs/service-hub.md §3a "Safety net"), run before every site build
// (npm run build) and by npm run check. It reads every services/<id>.json at the repo root and the routes in src/pages. No network.
// FAILS on: a manifest that isn't valid JSON or misses a required field (or has a wrong value), a duplicate id, two manifests claiming the same
// route, a manifest route that doesn't exist in src/pages, and talkBack "pins" with no sections (or more than 3: pins start small, spec §8a).
// WARNS (doesn't fail) with the routes in src/pages that no manifest claims. API endpoints and dev-only pages (/dev/*) are ignored.
//   node scripts/check-services.js          (from site/)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SERVICES = path.resolve(here, "../../services");
const PAGES = path.resolve(here, "../src/pages");
const errors = [];
const fail = (msg) => errors.push(msg);

const TYPES = ["feature", "page", "arcadeGame", "streamSetup", "adminTool"];
const STATUS = ["planned", "building", "live", "retired"];
const AUDIENCE = ["everyone", "members", "crew", "staff", "admins", "owner"];
const TALKBACK = ["note", "pins", "rate", "skip"];
const REQUIRED = ["id", "name", "type", "area", "blurb", "version", "status", "audience", "routes", "nav", "testPlan", "checks", "videoTag", "sections", "talkBack", "help"];

/** Every page route in src/pages: "/games/view", "/crew/academy/[slug]", "/404". Endpoints (.ts/.js) and /dev/* are left out. */
function pageRoutes() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(astro|md|mdx)$/.test(e.name)) continue;   // .ts / .js files are endpoints (like services.json.ts)
      let r = "/" + path.relative(PAGES, p).replace(/\\/g, "/").replace(/\.(astro|md|mdx)$/, "");
      r = r.replace(/\/index$/, "") || "/";
      if (r === "/index") r = "/";
      if (r.startsWith("/dev/") || r === "/dev") continue;
      out.push(r);
    }
  };
  walk(PAGES);
  return out.sort();
}

const routes = new Set(pageRoutes());
const ids = new Map(), claimed = new Map();
const files = fs.existsSync(SERVICES) ? fs.readdirSync(SERVICES).filter((f) => f.endsWith(".json")).sort() : [];
if (!files.length) fail(`no manifests in ${SERVICES}`);

for (const f of files) {
  let m;
  try { m = JSON.parse(fs.readFileSync(path.join(SERVICES, f), "utf8")); }
  catch (err) { fail(`${f}: not valid JSON (${err.message})`); continue; }
  const where = `${f}`;
  for (const k of REQUIRED) if (!(k in m)) fail(`${where}: missing "${k}"`);
  if (typeof m.id !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(m.id)) fail(`${where}: id must be kebab-case`);
  else if (`${m.id}.json` !== f) fail(`${where}: the file name must be the id (${m.id}.json)`);
  for (const k of ["name", "area", "blurb", "version"]) if (k in m && (typeof m[k] !== "string" || !m[k].trim())) fail(`${where}: "${k}" must be a non-empty string`);
  if ("version" in m && !/^\d+\.\d+(\.\d+)?$/.test(String(m.version))) fail(`${where}: version "${m.version}" isn't like "1.0"`);
  if ("type" in m && !TYPES.includes(m.type)) fail(`${where}: type "${m.type}" isn't one of ${TYPES.join(", ")}`);
  if ("status" in m && !STATUS.includes(m.status)) fail(`${where}: status "${m.status}" isn't one of ${STATUS.join(", ")}`);
  if ("audience" in m && !AUDIENCE.includes(m.audience)) fail(`${where}: audience "${m.audience}" isn't one of ${AUDIENCE.join(", ")}`);
  if ("talkBack" in m && !TALKBACK.includes(m.talkBack)) fail(`${where}: talkBack "${m.talkBack}" isn't one of ${TALKBACK.join(", ")}`);
  if ("videoTag" in m && m.id && m.videoTag !== `#bt-${m.id}`) fail(`${where}: videoTag must be "#bt-${m.id}"`);
  if ("checks" in m && (!Array.isArray(m.checks) || m.checks.some((c) => typeof c !== "string" || !c.trim()))) fail(`${where}: checks must be a list of short strings`);
  if (Array.isArray(m.checks) && m.checks.length && (m.checks.length < 3 || m.checks.length > 8)) fail(`${where}: a service lists 3 to 8 checks (or none yet)`);
  if ("nav" in m && m.nav !== null && typeof m.nav !== "string") fail(`${where}: nav must be a nav.js id or null`);
  if ("help" in m && m.help !== null && typeof m.help !== "string") fail(`${where}: help must be a path or null`);
  if ("testPlan" in m && m.testPlan !== null) {
    if (typeof m.testPlan !== "string") fail(`${where}: testPlan must be a path or null`);
    else if (!fs.existsSync(path.resolve(here, "../..", m.testPlan))) fail(`${where}: testPlan ${m.testPlan} doesn't exist`);
  }
  const secs = m.sections;
  if ("sections" in m && (typeof secs !== "object" || secs === null || Array.isArray(secs))) fail(`${where}: sections must be an object { slug: label }`);
  else if (secs) for (const [k, v] of Object.entries(secs)) { if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(k)) fail(`${where}: section "${k}" must be kebab-case`); if (typeof v !== "string" || !v.trim()) fail(`${where}: section "${k}" needs a label`); }
  if (m.talkBack === "pins" && (!secs || !Object.keys(secs).length)) fail(`${where}: talkBack "pins" needs at least one section`);
  if (m.talkBack === "pins" && secs && Object.keys(secs).length > 3) fail(`${where}: at most 3 Ask pins per page to start (spec §8a)`);
  if (m.talkBack !== "pins" && secs && Object.keys(secs).length) fail(`${where}: sections are only for talkBack "pins"`);
  if (m.id) { if (ids.has(m.id)) fail(`${where}: id "${m.id}" is also in ${ids.get(m.id)}`); else ids.set(m.id, f); }
  if (!Array.isArray(m.routes)) { if ("routes" in m) fail(`${where}: routes must be a list`); continue; }
  for (const r of m.routes) {
    if (typeof r !== "string" || !r.startsWith("/")) { fail(`${where}: route ${JSON.stringify(r)} must start with /`); continue; }
    if (!routes.has(r)) fail(`${where}: route ${r} isn't a page in src/pages`);
    if (claimed.has(r)) fail(`${where}: route ${r} is also claimed by ${claimed.get(r)}`); else claimed.set(r, f);
  }
}

const unclaimed = [...routes].filter((r) => !claimed.has(r));
if (unclaimed.length) console.warn(`check-services: ${unclaimed.length} page route(s) no manifest claims:\n  ${unclaimed.join("\n  ")}`);
if (errors.length) {
  console.error(`check-services: ${errors.length} problem(s)\n  ${errors.join("\n  ")}`);
  process.exit(1);
}
console.log(`check-services: ok (${files.length} manifests, ${claimed.size} of ${routes.size} page routes claimed)`);
