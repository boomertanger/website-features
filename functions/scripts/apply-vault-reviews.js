#!/usr/bin/env node
// functions/scripts/apply-vault-reviews.js
//
// Applies Boomer's Game Vault reviews from a JSON file (default functions/scripts/data/vault-reviews.json).
// For each entry in "reviews" it finds the game by title with the Vault's forgiving matcher
// (shared/vault-search.js; skipped and reported unless there's one clear match: an exact title, or one
// close match with the words in the same order), then sets the status, the review (score, verdict, body)
// and adds the entry's tags to the game's Boomer tags (existing tags kept, same tag in another case not
// added twice). An entry without a score sets only its status (and tags, if listed); the review stays as
// it is. An optional "hint" (year, developer, Steam app id, store link) only chooses between several
// candidates; it never makes a match on its own. "pinned": true pins the game to the top of the Wishlist
// (Boomer's "Up next"; Wishlist games only), false unpins it. Every write goes through adminEditItem's vaultGame
// path (functions/lib/vault/edit.js applyEdit): the same validation and conflict check, one adminLog
// entry per game (actor "apply-vault-reviews.js"), the Latest updates event when a game becomes
// finished, and the public/vault rebuild. "pending" entries are ignored.
// Dry run by default; --apply writes. Staging unless --project production is given.
//
//   node functions/scripts/apply-vault-reviews.js
//   node functions/scripts/apply-vault-reviews.js --apply
//   node functions/scripts/apply-vault-reviews.js --file <json> --project production --apply
// Needs Application Default Credentials that can write Firestore (gcloud auth application-default login).

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const { adminLogEntry } = require("./import-vault");

const DEFAULT_FILE = path.join(__dirname, "data", "vault-reviews.json");
const CLEAR_SCORE = 1.8;   // every word of the title matched the game's title
const CLEAR_GAP = 0.5;     // ahead of the next game by at least this much

function parseArgs(argv) {
  const args = { project: "staging", apply: false, file: DEFAULT_FILE };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--project") args.project = argv[++i];
    else if (argv[i].startsWith("--project=")) args.project = argv[i].slice("--project=".length);
    else if (argv[i] === "--file") args.file = argv[++i];
    else if (argv[i].startsWith("--file=")) args.file = argv[i].slice("--file=".length);
    else if (argv[i] === "--apply") args.apply = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return args;
}
function resolveProjectId(nameOrId) {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", ".firebaserc"), "utf8")).projects?.[nameOrId] ?? nameOrId; } catch { return nameOrId; }
}
async function loadSearch() {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "shared", "vault-search.js"), "utf8");
  return import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
}

/** Existing Boomer tags plus the new ones, skipping any already there in another case. */
function mergeTags(existing, add) {
  const out = [...existing], seen = new Set(existing.map((t) => t.toLowerCase()));
  for (const t of add) if (!seen.has(t.toLowerCase())) { out.push(t); seen.add(t.toLowerCase()); }
  return out;
}

/** The query's words appear in the game's title in the same order (a typo allowed in words of 5+ letters). */
function inOrder(S, query, title) {
  const q = S.normalize(query).split(" "), t = S.normalize(title).split(" ");
  let at = 0;
  for (const w of q) {
    while (at < t.length && !(t[at] === w || (w.length >= 5 && S.editDistance(w, t[at], 1) <= 1))) at++;
    if (at++ >= t.length) return false;
  }
  return true;
}

/** How well a game fits a hint: a point each for its Steam app id, a store link, its release year and a developer or publisher named
 *  in the hint. Text after "not" is ignored ("the 2023 remake, not the 2008 original"). */
function hintScore(S, hint, d) {
  const h = String(hint).split(/\bnot\b/i)[0], hn = ` ${S.normalize(h)} `;
  const g = d.data();
  let n = 0;
  if (g.ids?.steam && new RegExp(`\\b${g.ids.steam}\\b`).test(h)) n++;
  const urls = (h.match(/https?:\/\/\S+/g) || []).map((u) => u.replace(/[).,']+$/, "").replace(/\/+$/, "").toLowerCase());
  if (urls.some((u) => Object.values(g.links || {}).some((l) => String(l).toLowerCase().replace(/\/+$/, "").startsWith(u)))) n++;
  const year = g.releaseDate?.toDate ? String(g.releaseDate.toDate().getUTCFullYear()) : null;
  if (year && new RegExp(`\\b${year}\\b`).test(h)) n++;
  if ([...(g.developers || []), ...(g.publishers || [])].some((p) => S.normalize(p) && hn.includes(` ${S.normalize(p)} `))) n++;
  return n;
}

/** The one clear match for a title, or { why } when there isn't one. A hint only chooses between several candidates. */
function pick(S, index, title, hint) {
  const hits = S.search(index, title, { limit: 8 });
  if (!hits.length) return { why: "not found" };
  const exact = hits.filter((x) => S.normalize(x.game.title) === S.normalize(title));
  const close = hits.filter((x) => x.score >= CLEAR_SCORE && inOrder(S, title, x.game.title));
  const choose = (cands, label) => {
    if (!hint) return { why: `${label}, no hint: ${cands.map((x) => `"${x.game.title}"`).join(", ")}` };
    const ranked = cands.map((x) => ({ x, n: hintScore(S, hint, x.game.doc) })).sort((p, q) => q.n - p.n);
    if (ranked[0].n > 0 && (ranked.length < 2 || ranked[0].n > ranked[1].n)) return { hit: ranked[0].x, viaHint: true };
    return { why: `${label}, the hint doesn't pick one: ${cands.map((x) => `"${x.game.title}"`).join(", ")}` };
  };
  if (exact.length === 1) return { hit: exact[0] };
  if (exact.length > 1) return choose(exact, "several games with this title");
  if (!close.length) return { why: `not found${hits[0].score >= CLEAR_SCORE ? ` (closest: "${hits[0].game.title}", words in another order)` : ""}` };
  const [a, b] = close;
  if (b && a.score - b.score < CLEAR_GAP) return choose(close.filter((x) => a.score - x.score < CLEAR_GAP), "several close matches");
  return { hit: a };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  const data = JSON.parse(fs.readFileSync(args.file, "utf8"));
  const reviews = Array.isArray(data.reviews) ? data.reviews : [];
  admin.initializeApp({ projectId });
  const store = require("../lib/vault/store")({ adminLogEntry });
  const E = require("../lib/vault/edit");
  const editor = E({ store, deps: { cloudCreds: () => null } });
  const S = await loadSearch();
  console.log(`Project: ${projectId}${args.apply ? "" : " (dry run: nothing is written)"}`);

  const all = await store.games.get();
  const index = S.buildIndex(all.docs.map((d) => ({ title: d.get("title") || "", altNames: d.get("altNames") || [], developers: d.get("developers") || [], tags: d.get("tags") || {}, doc: d })));
  console.log(`${reviews.length} review(s) in ${path.relative(process.cwd(), args.file)}; ${all.size} games in the Vault.\n`);

  const rows = [];
  let applied = 0, unchanged = 0, skipped = 0, failed = 0;
  for (const r of reviews) {
    const row = { file: r.title, match: "", score: `${r.score ?? "-"} / ${r.status || "-"}`, changes: "" };
    rows.push(row);
    const m = pick(S, index, r.title, r.hint);
    if (!m.hit) { skipped++; row.match = m.why; row.changes = "skipped"; continue; }
    const d = m.hit.game.doc, g = d.data();
    row.match = `${g.title} (${d.id}, ${g.origin || "?"}, match ${m.hit.score.toFixed(2)}${m.viaHint ? ", chosen by the hint" : ""})`;
    // an entry without a score is status only: the review (and tags, unless listed) stay as they are
    const want = {};
    if (r.status) want.status = r.status;
    if (r.score !== undefined && r.score !== null) want.review = { score: r.score, verdict: r.verdict || "", body: r.review || "" };
    if (Array.isArray(r.tags) && r.tags.length) want.boomerTags = mergeTags(E.currentValue("boomerTags", g), r.tags);
    // "pinned": true pins it to the top of the Wishlist (Boomer's Up next; Wishlist games only), false unpins it
    if (typeof r.pinned === "boolean") want.pinned = r.pinned;
    const changes = {}, before = {}, notes = [];
    try {
      for (const [f, v] of Object.entries(want)) {
        const now = E.currentValue(f, g), next = E.validate(f, v);
        if (JSON.stringify(now) === JSON.stringify(next)) continue;
        changes[f] = v; before[f] = now;
        if (f === "status") notes.push(`status ${now} -> ${next}`);
        else if (f === "review") notes.push(now ? `review ${now.score} -> ${next.score} (verdict, text)` : `review added (${next.score})`);
        else if (f === "pinned") notes.push(next ? "pinned (Up next)" : "unpinned");
        else notes.push(`tags +${next.length - now.length}: ${next.slice(now.length).join(", ")}`);
      }
    } catch (err) { failed++; row.changes = `invalid: ${err.message}`; continue; }
    if (!Object.keys(changes).length) { unchanged++; row.changes = "already up to date"; continue; }
    row.changes = notes.join("; ");
    if (!args.apply) continue;
    try {
      const res = await editor.applyEdit({ uid: null, name: "apply-vault-reviews.js" }, { id: d.id, changes, before, reason: "Boomer's reviews (vault-reviews.json)" });
      if (res.changed) applied++; else unchanged++;
      if (res.warnings?.length) row.changes += ` [${res.warnings.join(" ")}]`;
    } catch (err) { failed++; row.changes += ` FAILED: ${err.message}`; }
  }

  console.log("| Title in the file | Matched game | Score / status | Changes |\n|---|---|---|---|");
  for (const r of rows) console.log(`| ${r.file} | ${r.match} | ${r.score} | ${r.changes} |`);
  const pending = Array.isArray(data.pending) ? data.pending.length : 0;
  console.log(`\n${args.apply ? `Applied ${applied}` : `Would change ${rows.filter((r) => !/^(skipped|already|invalid)/.test(r.changes)).length}`}, unchanged ${unchanged}, skipped ${skipped}, failed ${failed}; ${pending} pending entr${pending === 1 ? "y" : "ies"} ignored.`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => { console.error(err); process.exit(1); });
