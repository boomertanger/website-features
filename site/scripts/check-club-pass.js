#!/usr/bin/env node
// site/scripts/check-club-pass.js — the Club Pass perks check (docs/specs/club-pass.md §4), run before every site build (npm run build) and by
// npm run check. It reads src/data/club-pass.json and fails when a perk would break the page: unique ids, a known section, plan and scene,
// exactly three facts, the fields the spread needs, a serviceId that has a manifest in services/, and never the word "donate". No network.
//   node scripts/check-club-pass.js          (from site/)
import fs from "node:fs";

const data = JSON.parse(fs.readFileSync(new URL("../src/data/club-pass.json", import.meta.url), "utf8"));
const SERVICES = new URL("../../services/", import.meta.url);
const SECTIONS = ["watch", "play", "inside", "you"];
const PLANS = ["fan", "fan+", "sub"];
// The scene drawings in src/scripts/club-pass/scenes.ts (keep the two lists the same).
const SCENES = ["curtain", "ballot", "moon", "cards", "drop", "flame", "arcade", "mixer", "climb", "road", "stars", "trophy", "phone", "bars", "credits", "raffle", "shelf", "mag", "merch", "pass"];
const errors = [];
const fail = (m) => errors.push(m);
const text = (v) => typeof v === "string" && v.trim().length > 0;

const perks = Array.isArray(data.perks) ? data.perks : (fail("perks must be a list"), []);
const seen = new Set();
for (const [i, p] of perks.entries()) {
  const at = `perk ${i + 1}${p.id ? ` (${p.id})` : ""}`;
  if (!/^[a-z0-9-]+$/.test(p.id || "")) fail(`${at}: id must be lowercase letters, digits and dashes`);
  else if (seen.has(p.id)) fail(`${at}: id is used twice`); else seen.add(p.id);
  if (!SECTIONS.includes(p.section)) fail(`${at}: section must be one of ${SECTIONS.join(", ")}`);
  if (!PLANS.includes(p.plan)) fail(`${at}: plan must be one of ${PLANS.join(", ")}`);
  if (!SCENES.includes(p.scene)) fail(`${at}: unknown scene "${p.scene}"`);
  if (typeof p.soon !== "boolean") fail(`${at}: soon must be true or false`);
  for (const k of ["icon", "label", "kicker", "head", "dek", "pull"]) if (!text(p[k])) fail(`${at}: ${k} is missing`);
  if (text(p.head) && !/\*[^*]+\*/.test(p.head)) fail(`${at}: head needs one *accent* word`);
  if (!Array.isArray(p.facts) || p.facts.length !== 3 || !p.facts.every(text)) fail(`${at}: facts must be exactly three lines`);
  for (const f of p.facts || []) if (/<(?!\/?b>)/.test(f)) fail(`${at}: facts allow only <b> markup`);
  if (p.serviceId !== undefined && !fs.existsSync(new URL(`${p.serviceId}.json`, SERVICES))) fail(`${at}: serviceId "${p.serviceId}" has no manifest in services/`);
  if (/donat/i.test(JSON.stringify(p))) fail(`${at}: never "donate" (it's "tip")`);
}
if (perks.length !== 20) fail(`there are ${perks.length} perks; the page says 20 (update the copy too if this changes)`);

if (errors.length) { console.error(`check-club-pass: ${errors.length} problem(s)\n  ${errors.join("\n  ")}`); process.exit(1); }
console.log(`check-club-pass: ok (${perks.length} perks)`);
