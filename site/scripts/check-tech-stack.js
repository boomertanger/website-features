#!/usr/bin/env node
// site/scripts/check-tech-stack.js — the Tech Stack data check (docs/specs/tech-stack.md §6), run before every site build (npm run build).
// It reads src/data/tech-stack.json and fails the build when the diagram would break: every cable and tour step points at real devices and
// cables, every device has a position for each view, and every photo id is present and well formed. No network.
//   node scripts/check-tech-stack.js          (from site/)
import fs from "node:fs";

const file = process.argv[2] || new URL("../src/data/tech-stack.json", import.meta.url);   // a path argument checks another copy
const data = JSON.parse(fs.readFileSync(file, "utf8"));
const errors = [];
const fail = (msg) => errors.push(msg);
const num = (v) => typeof v === "number" && Number.isFinite(v);
const PHOTO = (kind) => new RegExp(`^tech-stack/${kind}/[a-z0-9-]+$`);

const ids = (list, what) => {
  const seen = new Set();
  for (const x of list || []) { if (!x.id) fail(`${what} without an id`); else if (seen.has(x.id)) fail(`${what} id "${x.id}" is used twice`); else seen.add(x.id); }
  return seen;
};
const cats = ids(data.categories, "category"), sigs = ids(data.signals, "signal");
const devs = ids(data.devices, "device"), cabs = ids(data.cables, "cable"), tours = ids(data.tours, "tour");
ids(data.gear, "gear");
const CARRIES = ["video", "av", "audio", "control", "data", "stream"];
const VIEWS = ["photo", "drawn", "blueprint", "flow", "list"];

if (!Array.isArray(data.viewBox) || data.viewBox.length !== 2 || !data.viewBox.every(num)) fail("viewBox must be [width, height]");
for (const v of data.views || []) if (!VIEWS.includes(v)) fail(`unknown view "${v}"`);
if (!VIEWS.includes(data.defaultView)) fail(`defaultView "${data.defaultView}" isn't a view`);

for (const d of data.devices || []) {
  const at = `device "${d.id}"`;
  for (const k of ["short", "name", "model", "role", "art"]) if (typeof d[k] !== "string" || !d[k]) fail(`${at}: ${k} is missing`);
  if (!cats.has(d.category)) fail(`${at}: category "${d.category}" isn't a category`);
  if (![null, "gaming", "streaming", "both"].includes(d.pc)) fail(`${at}: pc "${d.pc}" must be null, gaming, streaming or both`);
  const v = d.views || {};
  if (!v.drawn || !num(v.drawn.x) || !num(v.drawn.y)) fail(`${at}: no Drawn position (views.drawn {x, y}; Blueprint uses it too)`);
  if (!Number.isInteger(v.flowColumn) || v.flowColumn < 0 || v.flowColumn > 5) fail(`${at}: no Flow column (views.flowColumn 0-5)`);
  if (v.photo === null) { if (d.photo && d.photo.desk) fail(`${at}: has a desk photo but no Photo position`); }   // no cut-out: the drawing sits at its Drawn position
  else if (!v.photo || !["x", "y", "w", "h"].every((k) => num(v.photo[k])) || !Array.isArray(v.photo.anchor) || !v.photo.anchor.every(num)) fail(`${at}: no Photo position (views.photo {x, y, w, h, anchor})`);
  if (!d.photo || !PHOTO("card").test(d.photo.card || "")) fail(`${at}: photo.card must be tech-stack/card/<id>`);
  if (d.photo && d.photo.desk !== null && !PHOTO("desk").test(d.photo.desk || "")) fail(`${at}: photo.desk must be tech-stack/desk/<id> or null`);
  if (d.referral !== null && typeof d.referral !== "string") fail(`${at}: referral must be null or a link`);
}
for (const g of data.gear || []) {
  if (!cats.has(g.category)) fail(`gear "${g.id}": category "${g.category}" isn't a category`);
  if (!PHOTO("card").test(g.photo || "")) fail(`gear "${g.id}": photo must be tech-stack/card/<id>`);
}
for (const c of data.cables || []) {
  const at = `cable "${c.id}"`;
  if (!devs.has(c.from)) fail(`${at}: from "${c.from}" isn't a device`);
  if (!devs.has(c.to)) fail(`${at}: to "${c.to}" isn't a device`);
  if (!sigs.has(c.signal)) fail(`${at}: signal "${c.signal}" isn't a signal`);
  if (!CARRIES.includes(c.carries)) fail(`${at}: carries "${c.carries}" must be one of ${CARRIES.join(", ")}`);
}
for (const t of data.tours || []) {
  if (!t.steps || !t.steps.length) fail(`tour "${t.id}" has no steps`);
  (t.steps || []).forEach((s, i) => {
    if (!devs.has(s.device)) fail(`tour "${t.id}" stop ${i + 1}: device "${s.device}" isn't a device`);
    for (const c of s.cables || []) if (!cabs.has(c)) fail(`tour "${t.id}" stop ${i + 1}: cable "${c}" isn't a cable`);
  });
}
for (const k of ["gaming", "streaming"]) if (!data.pcCompare || !PHOTO("card").test(data.pcCompare[k]?.photo || "")) fail(`pcCompare.${k}.photo must be tech-stack/card/<id>`);
if (!data.mixerPublic || !devs.has(data.mixerPublic.device)) fail("mixerPublic.device isn't a device");

if (errors.length) { console.error(`check-tech-stack: ${errors.length} problem(s) in src/data/tech-stack.json\n  - ${errors.join("\n  - ")}`); process.exit(1); }
console.log(`check-tech-stack: ok (${devs.size} devices, ${cabs.size} cables, ${tours.size} tours, ${(data.gear || []).length} gear)`);
