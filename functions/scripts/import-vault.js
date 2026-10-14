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
//   boomerTags       Boomer's own tags, separated by semicolons, e.g. "VR" or "VR;Co-op" (optional;
//                    up to 12, each 1 to 30 characters; the game's tags.boomer)
//   hint             a developer or a release year, used ONLY to choose between several IGDB games
//                    with the same title (optional; it never picks when there's just one)
//   note             ignored (yours, for the list)
// Import-only columns (Boomer's own list; the member Add dialog keeps every rule):
//   title_as         store the game under this title (slug and sort title follow); the source's spelling is kept
//                    as an alternative name, e.g. a Latin "Cafe" for Steam's Cyrillic "Сafe"
//   steam_only       yes: build it from the Steam page alone (needs steam; IGDB isn't used, cover is Steam's capsule,
//                    the year comes from Steam)
//   episode          yes: an IGDB DLC or expansion record (or a Steam DLC page) is added as its own entry
//   owner_override   adult: lets this row past the adult-content check; recorded on the game's private source doc
//   link, developer  add by hand (no IGDB or Steam record): title + https link (+ developer); an itch.io link is
//                    stored as the itch link, any other as the official one. Its cover is the page's og:image (Game
//                    Jolt: the game's thumbnail), uploaded through the cover-override path (lib/vault-cover.js);
//                    the dry run shows the image, and a page with none is reported and added without a cover
// Never guesses: a title with more than one plausible IGDB game left after the hint, or none, is
// skipped and reported (ambiguous: each candidate with its year and developer; not found: the
// closest names). Editions, ports and versions of one game fold into its main record first. IGDB's
// search only returns its top 8, so a title is also looked up by its exact name (every IGDB game
// with that name, up to 50): one hit then really is the only game with that name.
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
const VC = require("./lib/vault-cover");

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
  // boomerTags (the header is read lowercased): "VR;Co-op", the same limits as the editor
  const boomerTags = [...new Set((r.boomertags || "").split(";").map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean))];
  if (boomerTags.length > 12) return { error: "boomerTags has more than 12 tags" };
  const long = boomerTags.find((t) => t.length > 30);
  if (long) return { error: `boomerTag "${long}" is longer than 30 characters` };
  const hint = (r.hint || "").replace(/\s+/g, " ").trim();
  // import-only extras (the member Add dialog has none of these)
  const yes = (v) => /^(yes|y|true|1)$/i.test(String(v || "").trim());
  const titleAs = (r.title_as || "").replace(/\s+/g, " ").trim();
  if (titleAs && (titleAs.length < 2 || titleAs.length > 100)) return { error: "title_as must be 2 to 100 characters" };
  const steamOnly = yes(r.steam_only);
  if (steamOnly && !r.steam) return { error: "steam_only needs a steam link or app id" };
  const override = (r.owner_override || "").trim().toLowerCase();
  if (override && override !== "adult") return { error: `owner_override "${r.owner_override}" isn't adult` };
  const link = (r.link || "").trim(), developer = (r.developer || "").replace(/\s+/g, " ").trim();
  if (link) {
    let u = null;
    try { u = new URL(link); } catch { /* not a link */ }
    if (!u || u.protocol !== "https:") return { error: `link "${link}" isn't an https link` };
    if (!r.title || r.steam) return { error: "a by-hand row (link) needs a title and no steam" };
  }
  if (developer.length > 100) return { error: "developer is longer than 100 characters" };
  return {
    status, score, verdict, legacy, title: r.title, steam: r.steam, boomerTags, hint,
    titleAs: titleAs || null, steamOnly, episode: yes(r.episode), allowAdult: override === "adult", link: link || null, developer: developer || null,
  };
}

/**
 * title_as: the draft is stored under this title instead of the source's (and gets its slug and sort title); the
 * source's own spelling is kept as an alternative name so search still finds it, and its title key stays claimed.
 */
function applyTitleAs(draft, keys, titleAs, C) {
  if (!titleAs || titleAs === draft.title) return { draft, keys };
  const altNames = [...new Set([draft.title, ...(draft.altNames || [])].filter((a) => a && a !== titleAs))];
  return {
    draft: { ...draft, title: titleAs, sortTitle: C.sortTitle(titleAs), slug: C.slugify(titleAs), altNames },
    keys: [...new Set([...keys, `title_${C.titleKey(titleAs)}`])],
  };
}

/** A by-hand row (link + developer): Boomer's own pick, straight into the Vault, no cover. */
function byHandDraft(game, row) {
  const itch = /(^|\.)itch\.io$/i.test(new URL(row.link).hostname);
  return {
    ...game, origin: "boomer", addedBy: null, status: row.status, cover: null,
    developers: row.developer ? [row.developer] : [],
    links: itch ? { itch: row.link } : { official: row.link },
    tags: { ...game.tags, boomer: row.boomerTags },
  };
}

const yearOf = (h) => (h.releaseDate ? new Date(h.releaseDate).getUTCFullYear() : null);
/** "Dead Space (2008, EA Redwood Studios; igdb 1234)" */
const describe = (h) => `${h.name} (${[yearOf(h) || "no date", h.developers?.[0] || "no developer"].join(", ")}; igdb ${h.igdbId})`;

/**
 * Picks the one IGDB game a title means, or says why it can't. Never guesses:
 *   - candidates are the hits whose title matches (titleKey: case, punctuation, "the" and edition
 *     words don't matter); editions, ports and versions of another game fold away (a hit with a
 *     version parent, or a port with a parent game), unless that leaves nothing;
 *   - exactly one -> { pick };
 *   - several -> the hint (a 4-digit year, or part of a developer's name) narrows them; exactly one
 *     left -> { pick, byHint: true }, otherwise { ambiguous: [candidates] };
 *   - none -> { notFound: [the closest hits] }.
 */
function matchTitle(title, hint, hits, titleKey) {
  const key = titleKey(title);
  const exact = hits.filter((h) => titleKey(h.name) === key);
  if (!exact.length) return { notFound: hits.slice(0, 4) };
  const mains = exact.filter((h) => !h.versionParent && !(h.gameType === "port" && h.parentGame));
  const cands = mains.length ? mains : exact;
  if (cands.length === 1) return { pick: cands[0] };
  if (hint) {
    const year = /^\d{4}$/.test(hint) ? Number(hint) : null;
    const h = hint.toLowerCase();
    const hit = cands.filter((c) => (year ? yearOf(c) === year : (c.developers || []).some((d) => d.toLowerCase().includes(h))));
    if (hit.length === 1) return { pick: hit[0], byHint: true };
  }
  return { ambiguous: cands };
}

/** Which input to hand the checks: a Steam link wins; a title needs exactly one plausible IGDB game. */
async function inputFor(row, sources, titleKey) {
  if (row.steam) return { input: row.steam };
  const seen = new Set();
  const hits = [...(await sources.igdbSearch(row.title)), ...(sources.igdbByName ? await sources.igdbByName(row.title) : [])].filter((h) => !seen.has(h.igdbId) && seen.add(h.igdbId));
  const m = matchTitle(row.title, row.hint, hits, titleKey);
  if (m.pick) return { input: { igdbId: m.pick.igdbId }, match: m.pick, byHint: !!m.byHint };
  return m;
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

/**
 * Every IGDB game named exactly this (case-insensitive), up to 50, for the import only (the
 * functions' sources search by relevance and stop at 8). Same Twitch app credentials and fields.
 */
function igdbByNameLive(clientId, clientSecret) {
  const { GAME_FIELDS, normalizeIgdb, IGDB_MIN_GAP_MS } = require("../lib/vault/sources");
  let token = null, last = 0;
  return async (name) => {
    if (!token) {
      const t = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`, { method: "POST" });
      if (!t.ok) throw new Error(`Twitch token: HTTP ${t.status}`);
      token = (await t.json()).access_token;
    }
    const wait = last + 2 * (IGDB_MIN_GAP_MS || 250) - Date.now();   // room for the search call that runs alongside
    if (wait > 0) await new Promise((res) => setTimeout(res, wait));
    last = Date.now();
    const q = `fields ${GAME_FIELDS}; where name ~ "${String(name).replace(/["\\]/g, (c) => "\\" + c)}"; limit 50;`;
    const res = await fetch("https://api.igdb.com/v4/games", { method: "POST", headers: { "Client-ID": clientId, Authorization: `Bearer ${token}`, "Content-Type": "text/plain" }, body: q });
    if (!res.ok) throw new Error(`IGDB by name: HTTP ${res.status}`);
    return (await res.json()).map(normalizeIgdb);
  };
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
    igdbByName: async (q) => IGDB.games.filter((g) => g.name.toLowerCase() === q.toLowerCase()).slice(0, 50).map(normalizeIgdb),
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
    ...(fields.changes ? { changes: fields.changes } : {}),
    ...(fields.snapshot ? { snapshot: fields.snapshot } : {}),
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
  let sources;
  if (args.fixtures) sources = fixtureSources();
  else {
    const twitchClientId = readEnv().TWITCH_CLIENT_ID, twitchClientSecret = await twitchSecret(projectId);
    sources = { ...createSources({ twitchClientId, twitchClientSecret }), igdbByName: igdbByNameLive(twitchClientId, twitchClientSecret) };
  }

  const rows = parseCsv(fs.readFileSync(args.file, "utf8"));
  console.log(`${rows.length} row(s) in ${args.file}\n`);
  const tally = { added: 0, duplicate: 0, refused: 0, problem: 0, error: 0 };
  const report = { add: [], ambiguous: [], notFound: [], other: [] };   // the three lists, printed at the end
  let cloudCreds = null;   // Cloudinary, read once from Secret Manager when a by-hand row gets its cover
  const taken = new Set();   // keys claimed by earlier rows of this file, so two rows for one game don't both write

  for (const raw of rows) {
    const label = `line ${raw.line}: ${raw.title || raw.steam}`;
    const row = readRow(raw);
    if (row.error) { tally.problem++; report.other.push(`${label}: ${row.error}`); console.log(`PROBLEM   ${label}\n          ${row.error}`); continue; }
    try {
      const lookupKey = async (key) => (taken.has(key) ? "an earlier row of this file" : store.lookupKey(key));
      // by hand: a name and a link, no IGDB or Steam record
      if (row.link) {
        const h = await C.runByHandChecks({ name: row.title, link: row.link, lookupKey });
        if (h.decision === "duplicate") { tally.duplicate++; report.other.push(`${label}: already in the Vault as ${h.duplicateSlug}`); console.log(`SKIP      ${label}\n          already in the Vault as ${h.duplicateSlug}`); continue; }
        if (h.decision === "refused") { tally.refused++; report.other.push(`${label}: refused, ${h.code}`); console.log(`REFUSED   ${label}\n          ${h.code}`); continue; }
        const draft = byHandDraft(h.game, row);
        const matched = `${draft.title} (by hand, ${draft.developers[0] || "no developer"}, ${row.link})`;
        report.add.push(`${raw.title} -> ${matched}`);
        // its cover: the store page's image (og:image; Game Jolt's thumbnail), uploaded through the cover-override path
        const img = args.fixtures ? { url: null, why: "fixtures: not looked up" } : await VC.pageCoverImage(row.link);
        const coverNote = img.url ? `cover from the page (${img.from}): ${img.url}` : `NO COVER IMAGE (${img.why})`;
        if (!img.url) report.other.push(`${label}: added with no cover, ${img.why}`);
        if (!args.apply) { tally.added++; h.keys.forEach((k) => taken.add(k)); console.log(`WOULD ADD ${label}\n          -> ${draft.slug}: ${matched} · status ${row.status} · ${coverNote}`); continue; }
        const made = await store.createGame({ draft, source: { ...h.source, addedBy: "hand" }, keys: h.keys, addedByUid: null, checks: h.checks, reason: "Imported by hand" });
        if (!made.ok) { tally.duplicate++; console.log(`SKIP      ${label}\n          already in the Vault as ${made.duplicateSlug}`); continue; }
        h.keys.forEach((k) => taken.add(k));
        await store.logAdmin({ action: "add", slug: made.slug, title: draft.title, actorUid: null, actorName: "Automatic", details: { via: "import-vault.js", byHand: true, status: row.status, line: raw.line } });
        tally.added++;
        let coverDone = "no cover";
        if (img.url) {
          try {
            cloudCreds ||= await VC.cloudinaryCreds(projectId, { secretManager: true });
            const g = { slug: made.slug, ...(await store.games.doc(made.slug).get()).data() };
            const info = await VC.setCoverFromUrl({ store, creds: cloudCreds, g, imageUrl: img.url, publicId: `game-vault/covers/${made.slug}-page`, actor: "import-vault.js", reason: `Cover from its store page (${img.from})` });
            coverDone = `cover ${info.public_id}`;
          } catch (err) { coverDone = `COVER FAILED (${err.message}); run vault-link-covers.js`; report.other.push(`${label}: added, but the cover failed: ${err.message}`); }
        }
        console.log(`ADDED     ${label}\n          -> ${made.slug}: ${matched} · ${coverDone}`);
        continue;
      }
      const pick = await inputFor(row, sources, C.titleKey);
      if (pick.ambiguous) {
        tally.problem++;
        report.ambiguous.push({ label, hint: row.hint, cands: pick.ambiguous.map(describe) });
        console.log(`AMBIGUOUS ${label}${row.hint ? ` (hint "${row.hint}")` : ""}\n${pick.ambiguous.map((h) => `          - ${describe(h)}`).join("\n")}`);
        continue;
      }
      if (pick.notFound) {
        tally.problem++;
        report.notFound.push({ label, closest: pick.notFound.map(describe) });
        console.log(`NOT FOUND ${label}\n          closest on IGDB: ${pick.notFound.map(describe).join(" | ") || "nothing"}`);
        continue;
      }
      const r = await C.runChecks({
        input: pick.input, sources, isStaff: true, origin: "boomer", handle: null, lookupKey,
        importOptions: { steamOnly: row.steamOnly, allowEpisode: row.episode, allowAdult: row.allowAdult },
      });
      if (r.decision === "duplicate") { tally.duplicate++; report.other.push(`${label}: already in the Vault as ${r.duplicateSlug}`); console.log(`SKIP      ${label}\n          already in the Vault as ${r.duplicateSlug}`); continue; }
      if (r.decision === "refused" || r.decision === "error") { tally.refused++; report.other.push(`${label}: refused, ${r.code}: ${r.message}`); console.log(`REFUSED   ${label}\n          ${r.code}: ${r.message}`); continue; }

      const named = applyTitleAs({ ...r.game, status: row.status, tags: { ...r.game.tags, boomer: row.boomerTags } }, r.keys, row.titleAs, C);
      const draft = named.draft;
      r.keys = named.keys;
      if (row.titleAs && (await lookupKey(`title_${C.titleKey(row.titleAs)}`))) { tally.duplicate++; report.other.push(`${label}: "${row.titleAs}" is already in the Vault`); console.log(`SKIP      ${label}\n          "${row.titleAs}" is already in the Vault`); continue; }
      const how = [row.steamOnly ? "Steam only" : null, r.source.importedAs === "episode" ? "as an episode" : null, r.source.ownerOverride ? `owner override: ${r.source.ownerOverride}` : null, row.titleAs ? `title_as` : null, draft.cover ? `cover ${draft.cover.source}` : "no cover"].filter(Boolean).join(", ");
      const extras = [`status ${row.status}`, row.boomerTags.length ? `tags ${row.boomerTags.join(", ")}` : null, row.score ? `score ${row.score}/10` : null, row.legacy.streamCount || row.legacy.minutes ? `legacy ${row.legacy.streamCount} streams, ${row.legacy.minutes} min` : null, pick.byHint ? `chosen by the hint "${row.hint}"` : null, how].filter(Boolean).join(" · ");
      const matched = `${draft.title} (${[draft.releaseDate ? new Date(draft.releaseDate).getUTCFullYear() : "no date", draft.developers[0] || "no developer"].join(", ")})`;
      report.add.push(`${raw.title || raw.steam} -> ${matched}${extras.includes("tags") ? ` [${row.boomerTags.join(", ")}]` : ""}${pick.byHint ? ` [hint "${row.hint}"]` : ""}`);
      if (!args.apply) { tally.added++; r.keys.forEach((k) => taken.add(k)); console.log(`WOULD ADD ${label}\n          -> ${draft.slug}: ${matched} · ${extras}`); continue; }

      const made = await store.createGame({ draft, source: r.source, keys: r.keys, addedByUid: null, checks: r.checks, reason: "Imported from CSV" });
      if (!made.ok) { tally.duplicate++; console.log(`SKIP      ${label}\n          already in the Vault as ${made.duplicateSlug}`); continue; }
      r.keys.forEach((k) => taken.add(k));
      const update = { legacy: { streamCount: row.legacy.streamCount, minutes: row.legacy.minutes, lastStreamedAt: store.ts(row.legacy.lastStreamedAt) } };
      if (row.score) update.review = { score: row.score, verdict: row.verdict, body: "", updatedAt: admin.firestore.FieldValue.serverTimestamp() };
      await store.games.doc(made.slug).update(update);
      await store.logAdmin({ action: "add", slug: made.slug, title: draft.title, actorUid: null, actorName: "Automatic", details: { via: "import-vault.js", status: row.status, line: raw.line } });
      tally.added++;
      console.log(`ADDED     ${label}\n          -> ${made.slug}: ${matched} · ${extras}`);
    } catch (err) {
      tally.error++;
      report.other.push(`${label}: error, ${err.message || err}`);
      console.log(`ERROR     ${label}\n          ${err.message || err}`);
    }
  }

  const list = (title, items, fmt) => { console.log(`\n=== ${title} (${items.length}) ===`); items.forEach((x) => console.log(fmt(x))); };
  list(args.apply ? "ADDED" : "WILL ADD", report.add, (x) => `  ${x}`);
  list("AMBIGUOUS", report.ambiguous, (x) => `  ${x.label}${x.hint ? ` (hint "${x.hint}")` : ""}\n${x.cands.map((c) => `      - ${c}`).join("\n")}`);
  list("NOT FOUND", report.notFound, (x) => `  ${x.label}\n      closest: ${x.closest.join(" | ") || "nothing"}`);
  if (report.other.length) list("OTHER (skipped)", report.other, (x) => `  ${x}`);

  if (args.apply && tally.added) { const s = await store.rebuildPublic(); console.log(`\npublic/vault rebuilt: ${s.count} games, ${Math.round(s.bytes / 1024)} KB`); }
  console.log(`\n${args.apply ? "Added" : "Would add"} ${tally.added} · already there ${tally.duplicate} · refused ${tally.refused} · need attention ${tally.problem + tally.error}`);
  if (!args.apply) console.log("Dry run: nothing written. Add --apply to write it.");
}

module.exports = { parseCsv, readRow, matchTitle, adminLogEntry, applyTitleAs, byHandDraft };

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
