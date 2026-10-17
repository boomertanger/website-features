#!/usr/bin/env node
// site/scripts/check-boomertang.js — the Boomertang content check (docs/specs/boomertang.md §4c), run before every site build (npm run
// build) and by npm run check. No network. It reads src/data/boomertang/issues.json, each issue's pages and the map, and
//   FAILS on: a fact tag without a source, an unknown source id (in a tag, a block or a map pin), a source without checkedAt, a contents
//             row without a page, a page not in the contents, an unknown trust, a page that doesn't render (a bad block), a duplicate
//             issue / source / poll id, a sample issue without sample text or a real issue marked sample;
//   WARNS on: a source checked more than 30 days before today, a source without a url yet.
// It writes the "Sources to re-check" list for the desk (/admin/boomertang) to src/data/boomertang/recheck.generated.json (gitignored).
// Pages: public issues (textInRepo) are site/src/content/boomertang/<id>/<slug>.md; a members-only issue's pages are seeded from
// functions/scripts/data/boomertang/<id>/ (gitignored): they're checked when the folder is on this machine, and skipped otherwise.
//   node scripts/check-boomertang.js          (from site/)
import fs from "node:fs";
import { renderPage, parsePage, scanTags, scanBlocks } from "../src/lib/boomertang/render.js";

const ROOT = new URL("../src/", import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, ROOT), "utf8");
const exists = (u) => fs.existsSync(u);
const { issues } = JSON.parse(read("data/boomertang/issues.json"));
const TRUSTS = ["off", "ver", "com", "fan"];
const STALE_DAYS = 30;
const fails = [], warns = [], recheck = [];
const fail = (m) => fails.push(m), warn = (m) => warns.push(m);
const today = new Date();
const days = (iso) => Math.floor((today - new Date(`${iso}T12:00:00Z`)) / 86400000);

const seen = new Set(), pollIds = new Set();
for (const issue of issues) {
  const at = `issue ${issue.id}`;
  if (!/^v\d+n\d+$/.test(issue.id || "")) fail(`${at}: id must look like v1n1`);
  if (seen.has(issue.id)) fail(`${at}: duplicate id`);
  seen.add(issue.id);
  if (issue.id !== `v${issue.vol}n${issue.no}`) fail(`${at}: id doesn't match vol ${issue.vol} / no ${issue.no}`);
  for (const k of ["title", "cover", "contents", "sources"]) if (!(k in issue)) fail(`${at}: missing ${k}`);

  // sources
  const sources = {};
  for (const s of issue.sources || []) {
    const sa = `${at} source ${s.id}`;
    if (!s.id || !/^[a-z0-9-]+$/.test(s.id)) fail(`${sa}: id must be lowercase letters, digits and dashes`);
    if (sources[s.id]) fail(`${sa}: duplicate id`);
    sources[s.id] = s;
    if (!TRUSTS.includes(s.trust)) fail(`${sa}: trust must be one of ${TRUSTS.join(", ")}`);
    if (!s.title) fail(`${sa}: no title`);
    if (!s.checkedAt || !/^\d{4}-\d{2}-\d{2}$/.test(s.checkedAt)) fail(`${sa}: no checkedAt (YYYY-MM-DD)`);
    else if (days(s.checkedAt) > STALE_DAYS) { warn(`${sa}: checked ${s.checkedAt}, ${days(s.checkedAt)} days ago (re-check it)`); recheck.push({ issueId: issue.id, id: s.id, title: s.title, url: s.url || null, checkedAt: s.checkedAt, days: days(s.checkedAt) }); }
    if (!s.url && s.trust !== "ver") warn(`${sa}: no url yet (The Index shows the title without a link)`);
    if (s.trust === "ver" && !s.version) fail(`${sa}: a Verified by Boomer source carries its version (e.g. PC 1.3.4)`);
  }
  const knowSource = (id, where) => { if (!id) fail(`${where}: a tag without a source`); else if (!sources[id]) fail(`${where}: unknown source "${id}"`); };

  // pages: the contents rows and the page files
  const slugs = new Set(["contents"]);
  for (const row of issue.contents || []) {
    if (!row.page || !/^[a-z0-9-]+$/.test(row.page)) fail(`${at}: a contents row without a page slug (${row.title})`);
    if (slugs.has(row.page)) fail(`${at}: page ${row.page} is in the contents twice`);
    slugs.add(row.page);
    for (const k of ["title", "line", "kind", "nav"]) if (!row[k]) fail(`${at} contents ${row.page}: missing ${k}`);
  }
  const dir = issue.textInRepo ? new URL(`content/boomertang/${issue.id}/`, ROOT) : new URL(`../../functions/scripts/data/boomertang/${issue.id}/`, ROOT);
  if (!exists(dir)) {
    if (issue.textInRepo) fail(`${at}: textInRepo, but site/src/content/boomertang/${issue.id}/ is missing`);
    else warns.push(`${at}: members-only text isn't on this machine (functions/scripts/data/boomertang/${issue.id}/); its pages weren't checked`);
    continue;
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3));
  for (const slug of slugs) if (!files.includes(slug)) fail(`${at}: contents row "${slug}" has no page (${slug}.md)`);
  for (const slug of files) if (!slugs.has(slug)) fail(`${at}: page ${slug}.md is not in the contents`);
  let sampleSeen = false;
  for (const slug of files) {
    const md = fs.readFileSync(new URL(`${slug}.md`, dir), "utf8");
    const pa = `${at} page ${slug}`;
    const { meta, body } = parsePage(md);
    if (!meta.title) fail(`${pa}: front matter needs a title`);
    if (slug !== "contents" && !meta.hed) fail(`${pa}: front matter needs a hed`);
    if (/Sample text|\{sample\}|"sample": true|^sample:/m.test(md)) sampleSeen = true;
    for (const t of scanTags(md)) {
      if (!TRUSTS.includes(t.trust)) fail(`${pa}: unknown trust in ${t.raw}`);
      knowSource(t.source, `${pa} ${t.raw}`);
    }
    // sources named by blocks (trust + source in their JSON)
    for (const b of scanBlocks(body)) {
      if (!["facts", "pull", "note", "column", "index"].includes(b.name)) {
        let d; try { d = JSON.parse(b.text); } catch (e) { fail(`${pa}: the ${b.name} block isn't valid JSON (${e.message})`); continue; }
        const walk = (o) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === "object") { if (o.trust) { if (!TRUSTS.includes(o.trust)) fail(`${pa} ${b.name}: unknown trust "${o.trust}"`); knowSource(o.source, `${pa} ${b.name} (${o.id || o.title || o.name})`); } Object.values(o).forEach(walk); } };
        walk(d);
        if (b.name === "polls") for (const p of d) { if (pollIds.has(p.id)) fail(`${pa}: duplicate poll id ${p.id}`); pollIds.add(p.id); if (!p.id?.startsWith(`${issue.id}-`)) fail(`${pa}: poll id ${p.id} must start with "${issue.id}-"`); if (!(p.options?.length >= 2)) fail(`${pa}: poll ${p.id} needs two options or more`); }
        if (b.name === "map") {
          const mapUrl = new URL(`data/boomertang/${d.src}`, ROOT);
          if (!exists(mapUrl)) { fail(`${pa}: map file ${d.src} is missing`); continue; }
          const map = JSON.parse(fs.readFileSync(mapUrl, "utf8"));
          const floors = new Set(map.floors.map((f) => f.id)), layers = new Set(map.layers.map((l) => l.id));
          for (const pin of map.pins) {
            const w = `${pa} map pin ${pin.id}`;
            if (!floors.has(pin.floor)) fail(`${w}: unknown floor ${pin.floor}`);
            if (!layers.has(pin.layer)) fail(`${w}: unknown layer ${pin.layer}`);
            if (!TRUSTS.includes(pin.tag)) fail(`${w}: unknown tag ${pin.tag}`);
            knowSource(pin.source, w);
            if (!["pc", "mobile", "both"].includes(pin.platform)) fail(`${w}: platform must be pc, mobile or both`);
          }
        }
      }
    }
    try { renderPage(md, { issue, sources, hrefFor: (s) => `/boomertang/vol-${issue.vol}/no-${issue.no}/${s}` }); }
    catch (e) { fail(`${pa}: doesn't render (${e.message})`); }
  }
  if (issue.sample && !sampleSeen) fail(`${at}: a sample issue must say Sample text`);
  if (!issue.sample && /^Sample /.test(issue.title)) fail(`${at}: titled like a sample but not marked sample: true`);
}

fs.writeFileSync(new URL("data/boomertang/recheck.generated.json", ROOT), JSON.stringify({ builtAt: today.toISOString(), staleAfterDays: STALE_DAYS, sources: recheck }, null, 2) + "\n");
for (const w of warns) console.warn(`check-boomertang: warning: ${w}`);
if (fails.length) {
  for (const f of fails) console.error(`check-boomertang: ${f}`);
  console.error(`check-boomertang: ${fails.length} problem(s)`);
  process.exit(1);
}
console.log(`check-boomertang: ok (${issues.length} issues, ${pollIds.size} polls; ${recheck.length} source(s) to re-check, ${warns.length} warning(s))`);
