#!/usr/bin/env node
// functions/scripts/seed-climb-history.js: the one-time Creator Climb history import (docs/specs/creator-climb.md §3). Reads
// functions/scripts/data/climb-history.json (GITIGNORED, never committed: the detail is members-only and the repo is public) and, when it is
// there, Boomer's stream sheet functions/scripts/data/climb-sheet.csv (GITIGNORED too; lib/climb/sheet.js: exact headers, rows on or before
// the history's last reading ignored, an unknown header or a bad row stops here with the row number; sheet streams, hours and likes count
// only for days before the Back on air date), validates it all (points in date order inside their month, nothing after lastReadingDay, the
// totals are the platforms added up), and with --apply writes:
//   climb/main/months/{YYYY-MM}.imported   the imported points (src "import"), month-ends, starting balances, streams, hours, likes,
//                                          highlights and notes. Re-running replaces the imported part only, never collector or manual points.
//   climb/main.import                      combinedOnly (Jan–May 2025), the records, the eras from the file
//   climb/main.eras / excludeHandles       only when not set yet: the file's eras plus "Back on air" (no start date), and @gbo left out of
//                                          member counts
// then runs the full rebuild (months and public/climb). Imported milestones are never announced; nothing is announced by the seed at all.
// The dry run (the default) changes nothing: it reads the project's growthDaily and builds everything in memory, so its summary is what
// --apply would produce. Application Default Credentials.
//   node functions/scripts/seed-climb-history.js --project staging            # dry run
//   node functions/scripts/seed-climb-history.js --project staging --apply    # write it (staging first; production at launch, spec §15)
const fs = require("fs");
const path = require("path");
const B = require("../lib/climb/build");
const Sheet = require("../lib/climb/sheet");

const FILE = path.join(__dirname, "data", "climb-history.json");
const SHEET = path.join(__dirname, "data", "climb-sheet.csv");
const DEFAULT_LEFT_OUT = ["gbo"];   // the test member (spec §7); the owner is always left out

function parseArgs(argv) {
  const a = { project: "staging", apply: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--apply") a.apply = true;
    else if (argv[i] === "--project") a.project = argv[++i];
    else if (argv[i].startsWith("--project=")) a.project = argv[i].slice(10);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return a;
}
function resolveProjectId(nameOrId) {
  try { const rc = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", ".firebaserc"), "utf8")); return rc.projects?.[nameOrId] ?? nameOrId; }
  catch { return nameOrId; }
}
const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US"));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  if (!fs.existsSync(FILE)) throw new Error(`No history file at ${FILE} (it's gitignored: copy it there first).`);
  const json = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const jsonProblems = B.validateHistory(json);
  if (jsonProblems.length) { console.error(`The history file has ${jsonProblems.length} problem(s); nothing written:\n- ${jsonProblems.join("\n- ")}`); process.exit(1); }
  const admin = require("firebase-admin");
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const main0 = await db.doc("sites/boomertanger/climb/main").get();
  const cur = main0.exists ? main0.data() : {};
  // the stream sheet, when it's there: its rows become months (or extend the history's last month)
  let history = json, sheetLine = "  sheet: none (functions/scripts/data/climb-sheet.csv isn't there)";
  const sheetMonths = new Set();
  if (fs.existsSync(SHEET)) {
    const rows = Sheet.parseSheet(fs.readFileSync(SHEET, "utf8"));   // throws with the row number
    const backOnAir = ((Array.isArray(cur.eras) ? cur.eras : []).find((e) => e.id === "back-on-air") || {}).from || null;
    const m = Sheet.mergeSheet(json, rows, { backOnAir });
    history = m.history;
    const used = rows.filter((r) => !m.after || r.day > m.after);
    used.forEach((r) => sheetMonths.add(r.day.slice(0, 7)));
    sheetLine = `  sheet: ${rows.length} rows; ${m.used} used${used.length ? ` (${used[0].day} to ${used[used.length - 1].day})` : ""}, ${m.ignored} ignored (on or before ${m.after}); streams, hours and likes from ${m.counted} of them (${backOnAir ? `days before Back on air, ${backOnAir}` : "Back on air has no date yet: all of them"})`;
  }
  const problems = B.validateHistory(history);
  if (problems.length) { console.error(`The history and the sheet together have ${problems.length} problem(s); nothing written:\n- ${problems.join("\n- ")}`); process.exit(1); }
  const imp = B.importMonths(history);
  const { dayKey } = require("../lib/growth/collect");
  const climb = require("../lib/climb").build({ db, staging: /staging/i.test(projectId), adminLogEntry: async (_d, f) => f });
  const R = climb.refs;

  const keys = Object.keys(imp.months);
  const points = keys.reduce((a, k) => a + Object.values(imp.months[k].points).reduce((b, p) => b + p.length, 0), 0);
  console.log(`${projectId} · ${keys.length} imported months (${keys[0]} to ${keys[keys.length - 1]}), ${points} points · validation ok${args.apply ? "" : " · DRY RUN (add --apply)"}`);
  for (const k of keys) {
    const m = imp.months[k];
    const extra = [m.streams != null ? `${m.streams} streams` : null, m.hours != null ? `${m.hours} h` : null, m.likes != null ? `${fmt(m.likes)} likes` : null].filter(Boolean).join(", ");
    console.log(`  ${k}${sheetMonths.has(k) ? " (sheet)" : ""}  ${Object.entries(m.monthEnd).map(([p, v]) => `${p} ${fmt(v)} (${m.points[p].length} pts)${m.startingBalance[p] != null ? ` from ${fmt(m.startingBalance[p])}` : ""}`).join(", ")}  · total ${fmt(Object.values(m.monthEnd).reduce((a, v) => a + v, 0))}${extra ? `  · ${extra}` : ""}`);
  }
  console.log(sheetLine);

  // settings that are only set the first time
  const settingsPatch = { import: { combinedOnly: imp.combinedOnly, records: imp.records, eras: imp.eras } };
  if (!Array.isArray(cur.eras) || !cur.eras.length) settingsPatch.eras = [...imp.eras.map((e) => ({ id: e.id, label: e.label, from: e.from || null, to: e.to || null, ...(e.note ? { note: e.note } : {}) })), { id: "back-on-air", label: "Back on air", from: null, to: null }];
  if (!Array.isArray(cur.excludeHandles)) {
    const found = [];
    for (const h of DEFAULT_LEFT_OUT) { const s = await db.doc(`handles/${h}`).get(); if (s.exists && s.get("uid")) found.push({ uid: s.get("uid"), handle: h }); }
    settingsPatch.excludeHandles = found; settingsPatch.excludeUids = found.map((x) => x.uid);
  }
  console.log(`  settings: import (combinedOnly ${Object.keys(imp.combinedOnly).length} months, ${imp.records.length} records, ${imp.eras.length} eras)${settingsPatch.eras ? `; eras ${settingsPatch.eras.map((e) => e.label).join(", ")}` : "; eras kept as they are"}${settingsPatch.excludeHandles ? `; left out of member counts: ${settingsPatch.excludeHandles.map((x) => `@${x.handle}`).join(", ") || "nobody found"} (and the owner)` : "; left-out accounts kept as they are"}`);

  // what the rebuild will produce: read this project's growthDaily (no writes) and build in memory
  const dailySnap = await db.collection("sites/boomertanger/growthDaily").get();
  const daily = dailySnap.docs.map((d) => ({ day: d.id, ...d.data() })).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.day));
  const allKeys = [...new Set([...keys, ...daily.map((d) => d.day.slice(0, 7))])].sort();
  const eras = (settingsPatch.eras || cur.eras || imp.eras);
  const months = [];
  let prev = null;
  for (const key of allKeys) {
    const prevEnd = prev && prev.key === B.prevMonth(key) ? prev.monthEnd : {};
    const m = B.buildMonth({ key, imported: imp.months[key] || null, daily: daily.filter((d) => d.day.startsWith(key)), corrections: [], streams: [], prevEnd, settings: {}, dayKey });
    months.push(m); prev = m;
  }
  const built = B.buildPublic({ months, combinedOnly: imp.combinedOnly, records: imp.records, settings: { eras }, now: Date.now() });
  const p = built.public, newest = built.milestones[built.milestones.length - 1];
  console.log(`  collector readings already in growthDaily: ${daily.length} day(s)${daily.length ? ` (${daily[0].day} to ${daily[daily.length - 1].day})` : ""}`);
  console.log(`  after the rebuild: ${p.counts.months} months, ${p.counts.milestones} milestones (${built.milestones.filter((m) => m.src === "import").length} imported; newest ${newest ? `${newest.id} on ${newest.day}` : "—"}), total ${fmt(p.totals.all)} (Twitch ${fmt(p.totals.twitch)}, TikTok ${fmt(p.totals.tiktok)}, YouTube ${fmt(p.totals.youtube)}) on ${p.lastReading ? p.lastReading.day : "—"}`);
  console.log(`  the gap: ${p.gaps.map((g) => `${g.from} to ${g.to || "today (no automatic reading yet)"}`).join(", ") || "none"}`);
  if (p.crossover) console.log(`  crossover ${p.crossover.span.from} to ${p.crossover.span.to}: Twitch ${p.crossover.twitch} and YouTube ${p.crossover.youtube} per 100 TikTok (${fmt(p.crossover.tiktok)} TikTok); ${p.crossover.eras.map((e) => `${e.label} ${e.twitch} / ${e.youtube}`).join("; ")}`);
  if (!args.apply) { console.log("  nothing written."); return; }

  // write: the imported part of each month (the rebuild merges in the collector and manual points), the settings, then rebuild everything
  for (const k of keys) await R.month(k).set({ key: k, imported: JSON.parse(JSON.stringify(imp.months[k])) }, { mergeFields: ["key", "imported"] });   // the imported part is replaced whole
  await R.main.set(settingsPatch, { merge: true });
  const out = await climb.rebuildFrom(null, { announce: false });
  console.log(`  applied: ${keys.length} months' imported points written, settings saved, rebuilt (${out.months} months, ${out.milestones} milestones; nothing announced).`);
}

if (require.main === module) main().catch((err) => { console.error(String((err && err.message) || err)); process.exit(1); });
