#!/usr/bin/env node
// functions/scripts/pulse-sample.js: 90 days of SAMPLE Traffic Pulse data on staging (docs/specs/traffic-pulse.md §9), so /admin/pulse has
// something to show before real visits arrive. STAGING ONLY: it refuses any production project, even named deliberately. Application Default
// Credentials and the Admin SDK.
//
// It writes, every doc marked sample: true:
//   pulse/main/days/{date}, services/{id} + services/{id}/days/{date}, paths/{hash} + paths/{hash}/days/{date}, sources/{date} (90 days, made-up
//   counts with a weekly rhythm, stream nights and slow growth), pulse/main/streams/sample-*, two sample notes, and settings/main.sample = true
//   (the page shows "Staging: sample data").
// Then it runs the real nightly close (lib/pulse daily(): scores, moves, the join path, alerts) and one weekly report, and marks what those
// created (scores/current, moves/current, the report, new alerts and notes) sample: true too. No goals are seeded (spec §5).
// --clean deletes every pulse doc marked sample: true (and settings.sample), and nothing else. Days a real visit also touched are deleted with
// them (staging only, so that's fine).
// Usage (from the repo root or functions/):
//   node functions/scripts/pulse-sample.js                     # dry run: what it would write
//   node functions/scripts/pulse-sample.js --apply             # write it, then run the nightly close
//   node functions/scripts/pulse-sample.js --clean --apply     # remove it
//   --project <name|id>  default staging
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DAYS = 90;
const SERVICES = [["home", 420, 0.43], ["game-vault", 310, 0.64], ["boom-arcade", 240, 0.72], ["live", 220, 0.55], ["tech-stack", 170, 0.29], ["scream-planner", 130, 0.58], ["night-shift", 70, 0.34], ["hotline-boom", 48, 0.48], ["trophy-room", 40, 0.66], ["feature-lab", 29, 0.61], ["chat-games", 21, 0.74], ["bug-zapper", 17, 0.38], ["service-hub", 13, 0.27], ["creator-climb", 30, 0.62], ["base-camp", 36, 0.57]];
const PATHS = { home: ["/"], "game-vault": ["/games", "/games/most-wanted", "/games/view"], "boom-arcade": ["/arcade", "/arcade/tap-the-splat"], live: ["/live", "/live/questions"], "tech-stack": ["/tech-stack"], "scream-planner": ["/schedule"], "night-shift": ["/shift"], "hotline-boom": ["/contact"], "trophy-room": ["/trophies"], "feature-lab": ["/feature-lab"], "chat-games": ["/live/chat-games"], "bug-zapper": ["/bug-zapper"], "service-hub": ["/services"], "creator-climb": ["/climb"], "base-camp": ["/base-camp"] };
const CTAS = { home: ["hero-watch", "hero-join"], "game-vault": ["vote-play-this", "rate-game"], "boom-arcade": ["play-now", "leaderboard"], live: ["claim-drop"], "tech-stack": ["diagram-view", "tour-start", "ask-boombot"], "scream-planner": ["remind-me", "ballot-vote"], "night-shift": ["punch-the-clock"], "hotline-boom": ["dial-line"], "trophy-room": ["badge-open"], "feature-lab": ["submit-idea"], "chat-games": ["try-example"], "bug-zapper": ["report-bug"], "service-hub": ["rate-love"] };

function parseArgs(argv) {
  const a = { project: "staging", apply: false, clean: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--project") a.project = argv[++i];
    else if (x.startsWith("--project=")) a.project = x.slice(10);
    else if (x === "--apply") a.apply = true;
    else if (x === "--clean") a.clean = true;
    else throw new Error(`Unknown argument: ${x}`);
  }
  return a;
}
function resolveProjectId(nameOrId) {
  try { const rc = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", ".firebaserc"), "utf8")); return rc.projects?.[nameOrId] ?? nameOrId; }
  catch { return nameOrId; }
}
const addDays = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const pathHash = (p) => crypto.createHash("sha1").update(String(p)).digest("hex").slice(0, 16);

/** The sample docs, as { path: data } (pure; seeded random, so the same every run). */
function build(today) {
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const B = "sites/boomertanger/pulse/main", out = {};
  for (let i = DAYS; i >= 1; i--) {
    const day = addDays(today, -i), wd = new Date(`${day}T12:00:00Z`).getUTCDay(), live = wd === 2 || wd === 4 || wd === 6, growth = 1 + (DAYS - i) / 300;
    const d = { day, sample: true, views: 0, uniques: 0, engaged: 0, errors: 0, signedIn: 0, members: 0, memberReturns: 0, joinOpens: 0, newMembers: Math.round(3 + rnd() * 9 * growth), ctas: {}, scroll: { 25: 0, 50: 0, 75: 0, 100: 0 }, devices: { phone: 0, desktop: 0, tablet: 0 }, hours: {}, live: { views: 0 }, hourRefs: {}, liveMinutes: {} };
    for (const [id, base, eng] of SERVICES) {
      const v = Math.round(base * growth * (live && (id === "live" || id === "chat-games") ? 2.2 : live ? 1.2 : 0.95) * (0.8 + rnd() * 0.4));
      const s = { day, sample: true, views: v, uniques: Math.round(v * 0.55), engaged: Math.round(v * eng * (0.92 + rnd() * 0.16)), errors: Math.round((id === "boom-arcade" ? 3 : 0.4) * rnd() * 3), scroll: { 25: Math.round(v * 0.8), 50: Math.round(v * 0.55), 75: Math.round(v * 0.35), 100: Math.round(v * 0.2) }, ctas: {}, hours: {}, live: live ? Math.round(v * 0.3) : 0, errMsgs: {} };
      if (s.errors) s.errMsgs[id === "boom-arcade" ? "a1b2c3d4e5" : "f6a7b8c9d0"] = { m: id === "boom-arcade" ? "TypeError: Cannot read properties of null (reading 'score')" : "ResizeObserver loop completed with undelivered notifications", n: s.errors };
      for (const c of CTAS[id] || []) s.ctas[c] = Math.round(v * (0.02 + rnd() * 0.06));
      if (rnd() < 0.5) s.vitals = { lcp: Math.round((id === "tech-stack" ? 2.8 : 1.6) + rnd() * 1.2 * 10) / 10, inp: Math.round(100 + rnd() * 160), cls: Math.round(rnd() * 12) / 100, n: Math.round(v * 0.3) };
      out[`${B}/services/${id}`] = { id, sample: true };
      out[`${B}/services/${id}/days/${day}`] = s;
      const ps = PATHS[id] || [`/${id}`];
      ps.forEach((p, k) => {
        const share = k === 0 ? 0.6 : 0.4 / (ps.length - 1);
        out[`${B}/paths/${pathHash(p)}`] = { path: p, service: id, sample: true };
        out[`${B}/paths/${pathHash(p)}/days/${day}`] = { day, path: p, service: id, views: Math.round(v * share), engaged: Math.round(s.engaged * share), sample: true };
      });
      d.views += v; d.uniques += Math.round(v * 0.32); d.engaged += s.engaged; d.errors += s.errors; d.live.views += s.live;
      for (const [k, n] of Object.entries(s.ctas)) d.ctas[k] = (d.ctas[k] || 0) + n;
      for (const k of Object.keys(d.scroll)) d.scroll[k] += s.scroll[k];
    }
    d.signedIn = Math.round(d.views * 0.22); d.members = Math.round(d.views * 0.05); d.memberReturns = Math.round(d.members * 0.55); d.joinOpens = Math.round(d.views * 0.02);
    d.ctas["join-open"] = d.joinOpens; d.ctas["signup-started"] = Math.round(d.joinOpens * 0.5);
    d.devices = { phone: Math.round(d.views * 0.58), desktop: Math.round(d.views * 0.34), tablet: Math.round(d.views * 0.08) };
    for (let hh = 0; hh < 24; hh++) d.hours[String(hh).padStart(2, "0")] = Math.round((d.views / 30) * (hh >= 17 && hh <= 22 ? 2.4 : hh >= 9 ? 1.1 : 0.35) * (live && hh >= 19 && hh <= 21 ? 1.7 : 1));
    if (live) for (const hh of ["19", "20", "21"]) d.hourRefs[hh] = { twitch: Math.round(d.views * 0.02), tiktok: Math.round(d.views * 0.015), youtube: Math.round(d.views * 0.004) };
    d.cf = { visits: Math.round(d.uniques * 1.1), countries: { "United States": Math.round(d.uniques * 0.6), Canada: Math.round(d.uniques * 0.2), "United Kingdom": Math.round(d.uniques * 0.08), Germany: Math.round(d.uniques * 0.04) }, browsers: { Chrome: Math.round(d.uniques * 0.55), Safari: Math.round(d.uniques * 0.35), Firefox: Math.round(d.uniques * 0.06) } };
    out[`${B}/days/${day}`] = d;
    out[`${B}/sources/${day}`] = { day, sample: true, refs: { "tiktok_com": Math.round(d.views * 0.12), "twitch_tv": Math.round(d.views * 0.08), "google_com": Math.round(d.views * 0.04), "youtube_com": Math.round(d.views * 0.03), "instagram_com": Math.round(d.views * 0.01) }, tags: { "dom-live": Math.round(d.views * 0.01), "tt-bio": Math.round(d.views * 0.02) }, platforms: { tiktok: Math.round(d.views * 0.12), twitch: Math.round(d.views * 0.08), youtube: Math.round(d.views * 0.03) } };
    if (live) {
      const startMs = Date.parse(`${day}T02:00:00Z`) + 864e5;   // 7 PM Pacific
      out[`${B}/streams/sample-${day}`] = { id: `sample-${day}`, sample: true, title: `Sample stream, ${day}`, start: new Date(startMs), end: new Date(startMs + 3 * 3600e3), visits: Math.round(d.views * 0.4), joins: Math.round(d.newMembers * 0.5), refs: d.hourRefs["20"] || {}, peakMinute: { at: new Date(startMs + 3600e3), views: Math.round(d.views / 200) } };
    }
  }
  out[`${B}/notes/sample-1`] = { day: addDays(today, -40), service: "game-vault", text: "Game Vault 1.2 (sample)", auto: "version", by: null, sample: true };
  out[`${B}/notes/sample-2`] = { day: addDays(today, -12), service: null, text: "Shared the Arcade on TikTok (sample)", auto: null, by: { uid: null, name: "Sample" }, sample: true };
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  if (/prod/i.test(String(projectId)) || /prod/i.test(String(args.project)) || !/staging/i.test(String(projectId))) throw new Error(`Refusing ${projectId}: pulse-sample.js runs on staging only.`);
  const admin = require("firebase-admin");
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const B = "sites/boomertanger/pulse/main";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
  if (args.clean) {
    const groups = ["days", "sources", "streams", "notes", "alerts", "reports"].map((c) => db.collection(`${B}/${c}`));
    const lists = [];
    for (const c of groups) lists.push(...(await c.where("sample", "==", true).get()).docs.map((d) => d.ref));
    for (const sref of await db.collection(`${B}/services`).listDocuments()) { lists.push(...(await sref.collection("days").where("sample", "==", true).get()).docs.map((d) => d.ref)); const s = await sref.get(); if (s.exists && s.get("sample")) lists.push(sref); }
    for (const pref of await db.collection(`${B}/paths`).listDocuments()) { lists.push(...(await pref.collection("days").where("sample", "==", true).get()).docs.map((d) => d.ref)); const p = await pref.get(); if (p.exists && p.get("sample")) lists.push(pref); }
    for (const id of ["scores/current", "moves/current"]) { const r = db.doc(`${B}/${id}`), s = await r.get(); if (s.exists && s.get("sample")) lists.push(r); }
    console.log(`${projectId} · --clean · ${lists.length} sample docs${args.apply ? "" : " · DRY RUN (add --apply)"}`);
    if (!args.apply) return;
    const w = db.bulkWriter();
    lists.forEach((r) => w.delete(r));
    w.set(db.doc(`${B}/settings/main`), { sample: admin.firestore.FieldValue.delete() }, { merge: true });
    await w.close();
    console.log(`  deleted ${lists.length} docs; settings.sample cleared.`);
    return;
  }
  const docs = build(today);
  const paths = Object.keys(docs);
  const count = (re) => paths.filter((p) => re.test(p)).length;
  console.log(`${projectId} · ${DAYS} days of sample data (${addDays(today, -DAYS)} to ${addDays(today, -1)})${args.apply ? "" : " · DRY RUN (add --apply)"}`);
  console.log(`  pulse/main/days: ${count(/\/days\/[^/]+$/) - count(/services\/[^/]+\/days|paths\/[^/]+\/days/)} · services: ${count(/\/services\/[^/]+$/)} (${count(/services\/[^/]+\/days/)} service days) · paths: ${count(/\/paths\/[^/]+$/)} (${count(/paths\/[^/]+\/days/)} path days) · sources: ${count(/\/sources\//)} · streams: ${count(/\/streams\//)} · notes: ${count(/\/notes\//)}`);
  console.log(`  then: settings/main.sample = true, the nightly close (scores, moves, join path, alerts) and one weekly report, all marked sample.`);
  if (!args.apply) return;
  const w = db.bulkWriter();
  for (const [p, d] of Object.entries(docs)) w.set(db.doc(p), d, { merge: true });
  w.set(db.doc(`${B}/settings/main`), { sample: true }, { merge: true });
  await w.close();
  console.log(`  wrote ${paths.length} docs.`);
  const before = { alerts: new Set((await db.collection(`${B}/alerts`).listDocuments()).map((r) => r.id)), reports: new Set((await db.collection(`${B}/reports`).listDocuments()).map((r) => r.id)), notes: new Set((await db.collection(`${B}/notes`).listDocuments()).map((r) => r.id)) };
  const P = require("../lib/pulse").build({ db, staging: true, adminLogEntry: async (_d, f) => f });
  const r = await P.daily();
  const to = addDays(today, -1), from = addDays(to, -6);
  await P.makeReport("week", from, to, `w-sample-${to}`);
  const mark = db.bulkWriter();
  for (const c of ["alerts", "reports", "notes"]) for (const ref of await db.collection(`${B}/${c}`).listDocuments()) if (!before[c].has(ref.id)) mark.set(ref, { sample: true }, { merge: true });
  mark.set(db.doc(`${B}/scores/current`), { sample: true }, { merge: true });
  mark.set(db.doc(`${B}/moves/current`), { sample: true }, { merge: true });
  await mark.close();
  const sc = await db.doc(`${B}/scores/current`).get(), mv = await db.doc(`${B}/moves/current`).get(), al = await db.collection(`${B}/alerts`).get();
  console.log(`  nightly close: ${r.services} services scored, ${(mv.get("list") || []).length} moves, ${al.size} alerts, join path weakest step: ${(sc.get("join") || {}).weakest ? sc.get("join").weakest.label : "none"}; report w-sample-${to}.`);
}

if (require.main === module) main().catch((err) => { console.error(String((err && err.message) || err)); process.exit(1); });
module.exports = { build };
