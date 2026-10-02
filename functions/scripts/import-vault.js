#!/usr/bin/env node
// functions/scripts/import-vault.js
//
// Imports old games into the Game Vault from a CSV (docs/specs/game-vault.md §10), with the
// same server checks the Add dialog runs, minus the horror-theme check (an import is Boomer's
// own list). Dry run by default: it shows what each row would do and writes nothing. --apply
// writes. Staging unless --project production is given explicitly.
//
// CSV columns (header row required; extra columns ignored; "title" or "steam" must be filled):
//   title            the game's name (needs one clear IGDB match; otherwise the row is listed as ambiguous)
//   steam            a store.steampowered.com link or app id (best: unambiguous)
//   status           playing | finished | abandoned | wishlist   (default wishlist)
//   score            Boomer's score 1-10 (optional; creates the review)
//   verdict          one line, up to 140 characters (optional)
//   legacy_streams   streams before the site existed (optional)
//   legacy_minutes   minutes streamed before the site existed (optional)
//   legacy_last      the last time it was streamed, YYYY-MM-DD (optional)
// Imported games are Boomer's adds. They don't post "games added" updates (old games would
// flood the feed), and a game already in the Vault is skipped, never changed.
//
// Needs Application Default Credentials that can read TWITCH_CLIENT_SECRET in Secret Manager
// and write Firestore (the same as run-growth-once.js):
//   gcloud auth application-default login
// Usage (from the repo root or functions/):
//   node functions/scripts/import-vault.js --file old-games.csv                      # dry run, staging
//   node functions/scripts/import-vault.js --file old-games.csv --apply              # write to staging
//   node functions/scripts/import-vault.js --file old-games.csv --project production # dry run, production
// --fixtures reads the recorded data in scripts/fixtures/vault/ instead of IGDB and Steam, so a
// CSV can be rehearsed with no secrets and no network (it still needs a Firestore to check
// duplicates: the real one with credentials, or the emulator via FIRESTORE_EMULATOR_HOST).

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const SITE_ID = "boomertanger";
const STATUSES = ["playing", "finished", "abandoned", "wishlist"];

// ---------- CSV (RFC 4180: quotes, doubled quotes, commas and newlines inside quotes) ----------
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r, i) => ({ line: i + 2, ...Object.fromEntries(header.map((h, j) => [h, (r[j] ?? "").trim()])) }));
}

/** A CSV row -> the fields the import needs, or { error }. */
function readRow(r) {
  const status = (r.status || "wishlist").toLowerCase();
  if (!STATUSES.includes(status)) return { error: `status "${r.status}" isn't playing, finished, abandoned or wishlist` };
  let score = null;
  if (r.score) {
    score = Number(r.score);
    if (!Number.isInteger(score) || score < 1 || score > 10) return { error: `score "${r.score}" isn't a whole number from 1 to 10` };
  }
  const verdict = (r.verdict || "").replace(/\s+/g, " ").trim();
  if (verdict.length > 140) return { error: "verdict is longer than 140 characters" };
  const num = (v, name, max) => { if (v === "" || v == null) return 0; const n = Number(v); if (!Number.isInteger(n) || n < 0 || n > max) throw new Error(`${name} "${v}" isn't a whole number from 0 to ${max}`); return n; };
  let legacy;
  try {
    legacy = { streamCount: num(r.legacy_streams, "legacy_streams", 9999), minutes: num(r.legacy_minutes, "legacy_minutes", 1000000), lastStreamedAt: null };
  } catch (e) { return { error: e.message }; }
  if (r.legacy_last) {
    const t = Date.parse(`${r.legacy_last}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.legacy_last) || !Number.isFinite(t) || t > Date.now()) return { error: `legacy_last "${r.legacy_last}" isn't a past date as YYYY-MM-DD` };
    legacy.lastStreamedAt = t;
  }
  if (!r.title && !r.steam) return { error: "needs a title or a steam link" };
  return { status, score, verdict, legacy, title: r.title, steam: r.steam };
}

/** Which input to hand the checks: a Steam link wins; a title needs exactly one clear IGDB match. */
async function inputFor(row, sources, titleKey) {
  if (row.steam) return { input: row.steam };
  const hits = await sources.igdbSearch(row.title);
  const key = titleKey(row.title);
  let exact = hits.filter((h) => titleKey(h.name) === key);
  if (exact.length > 1) {   // editions fold into one game: the one named exactly, or the main record, is the pick
    const named = exact.filter((h) => h.name.toLowerCase() === row.title.toLowerCase());
    const mains = exact.filter((h) => !h.versionParent);
    exact = named.length === 1 ? named : mains.length === 1 ? mains : exact;
  }
  if (exact.length === 1) return { input: { igdbId: exact[0].igdbId } };
  if (!hits.length) return { problem: "no match on IGDB (give its Steam link, or add it by hand)" };
  const list = (exact.length ? exact : hits).slice(0, 4).map((h) => `${h.name} (igdb ${h.igdbId})`).join(" | ");
  return { problem: `ambiguous: ${list}` };
}

// ---------- plumbing ----------
function parseArgs(argv) {
  const args = { project: "staging", apply: false, file: null, fixtures: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--project") args.project = argv[++i];
    else if (argv[i].startsWith("--project=")) args.project = argv[i].slice("--project=".length);
    else if (argv[i] === "--file") args.file = argv[++i];
    else if (argv[i].startsWith("--file=")) args.file = argv[i].slice("--file=".length);
    else if (argv[i] === "--apply") args.apply = true;
    else if (argv[i] === "--fixtures") args.fixtures = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!args.file) throw new Error("--file <csv> is required.");
  return args;
}

function resolveProjectId(nameOrId) {
  try {
    const rc = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", ".firebaserc"), "utf8"));
    return rc.projects?.[nameOrId] ?? nameOrId;
  } catch {
    return nameOrId;
  }
}

function readEnv() {
  const out = {};
  try {
    for (const line of fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2];
    }
  } catch { /* no .env */ }
  return out;
}

async function twitchSecret(projectId) {
  const { GoogleAuth } = require("google-auth-library");
  const client = await new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] }).getClient();
  const res = await client.request({ url: `https://secretmanager.googleapis.com/v1/projects/${projectId}/secrets/TWITCH_CLIENT_SECRET/versions/latest:access` });
  return Buffer.from(res.data.payload.data, "base64").toString("utf8").trim();
}

function fixtureSources() {
  const { normalizeIgdb, normalizeSteam } = require("../lib/vault/sources");
  const IGDB = require("./fixtures/vault/igdb.json");
  const STEAM = { ...require("./fixtures/vault/steam-1205040.json"), ...require("./fixtures/vault/steam-dlc.json"), ...require("./fixtures/vault/steam-eldenring.json") };
  const find = (f) => { const g = IGDB.games.find(f); return g ? normalizeIgdb(g) : null; };
  return {
    igdbGet: async (id) => find((g) => g.id === id),
    igdbBySlug: async (slug) => find((g) => g.slug === slug),
    igdbSearch: async (q) => IGDB.games.filter((g) => g.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8).map(normalizeIgdb),
    igdbFindBySteam: async (appId) => find((g) => (g.external_games || []).some((e) => e.uid === String(appId) && e.external_game_source === 1)),
    steamGet: async (appId) => (STEAM[appId] ? normalizeSteam(appId, STEAM[appId]) : null),
    steamCoverExists: async () => true,
  };
}

// The same adminLog entry shape as adminLogEntry in functions/index.js (this script can't load
// that file: it initialises every function). Entries expire after the configured retention.
async function adminLogEntry(db, fields) {
  let days = 365;
  try { const c = (await db.collection("adminSettings").doc("log").get()).get("retentionDays"); if (Number.isFinite(c) && c > 0) days = c; } catch { /* default */ }
  return {
    feature: fields.feature, action: fields.action, itemPath: fields.itemPath, itemTitle: fields.itemTitle || "",
    actorUid: fields.actorUid ?? null, actorName: fields.actorName || "Automatic", reason: fields.reason || "",
    createdAt: admin.firestore.FieldValue.serverTimestamp(), expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + days * 86400000),
    ...(fields.details ? { details: fields.details } : {}),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  console.log(`Project: ${projectId}${args.apply ? "" : " (dry run: nothing is written)"}${args.fixtures ? " · recorded fixtures instead of IGDB and Steam" : ""}`);
  if (process.env.FIRESTORE_EMULATOR_HOST) console.log(`Firestore: the emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`);

  const C = require("../lib/vault/checks");
  const makeStore = require("../lib/vault/store");
  const { createSources } = require("../lib/vault/sources");
  const store = makeStore({ adminLogEntry });
  const sources = args.fixtures ? fixtureSources() : createSources({ twitchClientId: readEnv().TWITCH_CLIENT_ID, twitchClientSecret: await twitchSecret(projectId) });

  const rows = parseCsv(fs.readFileSync(args.file, "utf8"));
  console.log(`${rows.length} row(s) in ${args.file}\n`);
  const tally = { added: 0, duplicate: 0, refused: 0, problem: 0, error: 0 };
  const taken = new Set();   // keys claimed by earlier rows of this file, so two rows for one game don't both write

  for (const raw of rows) {
    const label = `line ${raw.line}: ${raw.title || raw.steam}`;
    const row = readRow(raw);
    if (row.error) { tally.problem++; console.log(`PROBLEM   ${label}\n          ${row.error}`); continue; }
    try {
      const pick = await inputFor(row, sources, C.titleKey);
      if (pick.problem) { tally.problem++; console.log(`PROBLEM   ${label}\n          ${pick.problem}`); continue; }
      const r = await C.runChecks({
        input: pick.input, sources, isStaff: true, origin: "boomer", handle: null,
        lookupKey: async (key) => (taken.has(key) ? "an earlier row of this file" : store.lookupKey(key)),
      });
      if (r.decision === "duplicate") { tally.duplicate++; console.log(`SKIP      ${label}\n          already in the Vault as ${r.duplicateSlug}`); continue; }
      if (r.decision === "refused" || r.decision === "error") { tally.refused++; console.log(`REFUSED   ${label}\n          ${r.code}: ${r.message}`); continue; }

      const draft = { ...r.game, status: row.status };
      const extras = [`status ${row.status}`, row.score ? `score ${row.score}/10` : null, row.legacy.streamCount || row.legacy.minutes ? `legacy ${row.legacy.streamCount} streams, ${row.legacy.minutes} min` : null].filter(Boolean).join(" · ");
      if (!args.apply) { tally.added++; r.keys.forEach((k) => taken.add(k)); console.log(`WOULD ADD ${label}\n          -> ${draft.slug}: "${draft.title}" · ${extras}${r.decision === "queued" ? "" : ""}`); continue; }

      const made = await store.createGame({ draft, source: r.source, keys: r.keys, addedByUid: null, checks: r.checks, reason: "Imported from CSV" });
      if (!made.ok) { tally.duplicate++; console.log(`SKIP      ${label}\n          already in the Vault as ${made.duplicateSlug}`); continue; }
      r.keys.forEach((k) => taken.add(k));
      const update = { legacy: { streamCount: row.legacy.streamCount, minutes: row.legacy.minutes, lastStreamedAt: store.ts(row.legacy.lastStreamedAt) } };
      if (row.score) update.review = { score: row.score, verdict: row.verdict, body: "", updatedAt: admin.firestore.FieldValue.serverTimestamp() };
      await store.games.doc(made.slug).update(update);
      await store.logAdmin({ action: "add", slug: made.slug, title: draft.title, actorUid: null, actorName: "Automatic", details: { via: "import-vault.js", status: row.status, line: raw.line } });
      tally.added++;
      console.log(`ADDED     ${label}\n          -> ${made.slug}: "${draft.title}" · ${extras}`);
    } catch (err) {
      tally.error++;
      console.log(`ERROR     ${label}\n          ${err.message || err}`);
    }
  }

  if (args.apply && tally.added) { const s = await store.rebuildPublic(); console.log(`\npublic/vault rebuilt: ${s.count} games, ${Math.round(s.bytes / 1024)} KB`); }
  console.log(`\n${args.apply ? "Added" : "Would add"} ${tally.added} · already there ${tally.duplicate} · refused ${tally.refused} · need attention ${tally.problem + tally.error}`);
  if (!args.apply) console.log("Dry run: nothing written. Add --apply to write it.");
}

module.exports = { parseCsv, readRow };

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
