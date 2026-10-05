#!/usr/bin/env node
// functions/scripts/delete-vault-games.js
//
// Removes games from the Game Vault by title, following vaultDeleteGame's path step by step
// (functions/lib/vault/index.js): refused while any stream references the game; then its duplicate
// keys, the game with its subcollections (wants), its game-vault activity events, its place in
// the updates digest, an adminLog "delete" entry with a snapshot, and one rebuild of public/vault
// at the end. A game with uploaded covers (externalAssets) or cover suggestions in the queue is
// refused here: those go through Cloudinary's approved delete path, so delete that one from the
// site (Edit, Delete) instead. Dry run by default; --apply writes. Staging unless --project is given.
//
// The CSV needs a "title" column (other columns are ignored); a game matches when its title is the
// same game title (functions/lib/vault/checks.js titleKey) and it's one of Boomer's (origin boomer),
// so member picks are never touched.
//
//   node functions/scripts/delete-vault-games.js --file functions/scripts/fixtures/vault/staging-sample.csv
//   node functions/scripts/delete-vault-games.js --file ... --apply
// Needs Application Default Credentials that can write Firestore (gcloud auth application-default login).

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const { parseCsv, adminLogEntry } = require("./import-vault");

function parseArgs(argv) {
  const args = { project: "staging", apply: false, file: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--project") args.project = argv[++i];
    else if (argv[i].startsWith("--project=")) args.project = argv[i].slice("--project=".length);
    else if (argv[i] === "--file") args.file = argv[++i];
    else if (argv[i].startsWith("--file=")) args.file = argv[i].slice("--file=".length);
    else if (argv[i] === "--apply") args.apply = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!args.file) throw new Error("--file <csv> is required.");
  return args;
}
function resolveProjectId(nameOrId) {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", ".firebaserc"), "utf8")).projects?.[nameOrId] ?? nameOrId; } catch { return nameOrId; }
}
const day = (t) => (t?.toMillis ? new Date(t.toMillis()).toISOString().slice(0, 10) : "?");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const C = require("../lib/vault/checks");
  const store = require("../lib/vault/store")({ adminLogEntry });
  console.log(`Project: ${projectId}${args.apply ? "" : " (dry run: nothing is written)"}`);

  const wanted = new Map(parseCsv(fs.readFileSync(args.file, "utf8")).filter((r) => r.title).map((r) => [C.titleKey(r.title), r.title]));
  const all = await store.games.get();
  const hits = all.docs.filter((d) => wanted.has(C.titleKey(d.get("title") || "")) && d.get("origin") === "boomer");
  const missing = [...wanted].filter(([k]) => !hits.some((d) => C.titleKey(d.get("title")) === k)).map(([, t]) => t);
  console.log(`${wanted.size} title(s) in ${args.file}; ${hits.length} of Boomer's games match; ${all.size} games in the Vault.\n`);

  let removed = 0, refused = 0;
  for (const g of hits) {
    const slug = g.id, title = g.get("title");
    const line = `${slug}: "${title}" · ${g.get("status")} · wanted ${g.get("wantedCount") || 0} · added ${day(g.get("createdAt"))}`;
    const refs = new Set();
    for (const field of ["plannedGameIds", "gameIds"]) (await store.site.collection("streams").where(field, "array-contains", slug).get()).docs.forEach((d) => refs.add(d.id));
    if (refs.size) { refused++; console.log(`REFUSED   ${line}\n          appears in ${refs.size} stream(s); set it to Abandoned instead`); continue; }
    const assets = await db.collection("externalAssets").where("linkedDoc.collection", "==", `sites/${store.SITE_ID}/vaultGames`).where("linkedDoc.docId", "==", slug).get();
    const covers = await store.queue.where("slug", "==", slug).get();
    if (assets.size || covers.size) { refused++; console.log(`REFUSED   ${line}\n          has ${assets.size} uploaded cover(s) and ${covers.size} queued suggestion(s); delete it from the site instead`); continue; }
    if (!args.apply) { removed++; console.log(`WOULD DELETE ${line}`); continue; }

    const keys = await store.keysCol.where("slug", "==", slug).get();
    const batch = db.batch(); keys.docs.forEach((k) => batch.delete(k.ref)); await batch.commit();
    const snapshot = { title, status: g.get("status"), origin: g.get("origin"), summary: (g.get("summary") || "").slice(0, 2000) };
    await db.recursiveDelete(g.ref);
    const events = await db.collection("activityLog").where("gameId", "==", slug).get();
    const evBatch = db.batch(); events.docs.filter((e) => e.get("feature") === "game-vault").forEach((e) => evBatch.delete(e.ref)); await evBatch.commit();
    await store.digestRemove(slug);
    await store.logAdmin({ action: "delete", slug, title, actorUid: null, actorName: "delete-vault-games.js", snapshot });
    removed++;
    console.log(`DELETED   ${line}\n          ${keys.size} key(s), ${events.docs.filter((e) => e.get("feature") === "game-vault").length} event(s)`);
  }
  if (missing.length) console.log(`\nNot in the Vault (nothing to do): ${missing.join(", ")}`);
  if (args.apply && removed) { const s = await store.rebuildPublic(); console.log(`\npublic/vault rebuilt: ${s.count} games, ${Math.round(s.bytes / 1024)} KB`); }
  console.log(`\n${args.apply ? "Deleted" : "Would delete"} ${removed} · refused ${refused}`);
  if (!args.apply) console.log("Dry run: nothing written. Add --apply to delete.");
}

main().catch((err) => { console.error(err.message || err); process.exit(1); });
