#!/usr/bin/env node
// functions/scripts/vault-link-covers.js
//
// Gives cover-less Game Vault games with no Steam app (added by hand) a cover from their own store page: the page's
// og:image (Game Jolt: the game's thumbnail from the page's data), uploaded to Cloudinary under game-vault/covers and
// set through the cover-override path (lib/vault-cover.js: applyEdit's cover replace, recordAssetCreated, adminLog,
// public/vault rebuilt), framed 3:4 from the centre. Never a hotlink.
//
// Dry run by default (each game, its link and the image it would use); --apply uploads and sets the covers.
// --url <slug>=<image url> uses that image for that game instead of its page's (repeatable). Staging unless
// --project production is given. Credentials as vault-steam-covers.js (--from-secret-manager).
//
//   node functions/scripts/vault-link-covers.js
//   node functions/scripts/vault-link-covers.js --url road-of-fear=https://img.itch.zone/.../BH59fY.png --apply --from-secret-manager

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const { adminLogEntry } = require("./import-vault");
const VC = require("./lib/vault-cover");

function parseArgs(argv) {
  const a = { project: "staging", apply: false, secretManager: false, urls: {} };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--project") a.project = argv[++i];
    else if (x.startsWith("--project=")) a.project = x.slice("--project=".length);
    else if (x === "--apply") a.apply = true;
    else if (x === "--from-secret-manager") a.secretManager = true;
    else if (x === "--url") {
      const v = argv[++i] || "", at = v.indexOf("=");
      if (at < 1) throw new Error(`--url needs <slug>=<image url>, got "${v}"`);
      a.urls[v.slice(0, at)] = v.slice(at + 1);
    } else throw new Error(`Unknown argument: ${x}`);
  }
  return a;
}
function resolveProjectId(nameOrId) {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", ".firebaserc"), "utf8")).projects?.[nameOrId] ?? nameOrId; } catch { return nameOrId; }
}
const linkOf = (g) => g.links?.itch || g.links?.official || g.links?.gog || g.links?.epic || null;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  admin.initializeApp({ projectId });
  const store = require("../lib/vault/store")({ adminLogEntry });
  console.log(`Project: ${projectId}${args.apply ? "" : " (dry run: nothing is uploaded or written)"}`);

  const games = (await store.games.get()).docs.map((d) => ({ slug: d.id, ...d.data() }));
  const targets = games.filter((g) => !g.cover && !g.ids?.steam && (linkOf(g) || args.urls[g.slug]));
  for (const slug of Object.keys(args.urls)) if (!targets.some((g) => g.slug === slug)) console.log(`  note: --url ${slug} skipped (no such cover-less game without a Steam app)`);

  const plan = [];
  for (const g of targets) {
    const img = args.urls[g.slug] ? { url: args.urls[g.slug], from: "given (--url)" } : await VC.pageCoverImage(linkOf(g));
    plan.push({ g, ...img });
  }
  console.log(`\n${plan.length} game(s) without a Steam app or a cover:`);
  for (const p of plan) console.log(`  ${p.g.title} (${p.g.slug}) · ${linkOf(p.g) || "no link"}\n    ${p.url ? `${p.from}: ${p.url}` : `NO IMAGE: ${p.why}`}`);
  if (!args.apply) { console.log("\nDry run: nothing uploaded. Add --apply to upload and set the covers."); return; }

  const creds = await VC.cloudinaryCreds(projectId, { secretManager: args.secretManager });
  const editor = VC.scriptEditor(store, creds);
  let done = 0, failed = 0;
  for (const p of plan.filter((x) => x.url)) {
    try {
      const info = await VC.setCoverFromUrl({ store, creds, editor, g: p.g, imageUrl: p.url, publicId: `game-vault/covers/${p.g.slug}-page`, actor: "vault-link-covers.js", reason: `Cover from its store page (${p.from})` });
      done++;
      console.log(`  ${p.g.title}: ${info.public_id} (${info.width}x${info.height}, ${Math.round(info.bytes / 1024)} KB)`);
    } catch (err) { failed++; console.log(`  ${p.g.title}: FAILED, ${err.message || err}`); }
  }
  console.log(`\nCovers set: ${done}, failed: ${failed}.`);
  const left = (await store.games.get()).docs.filter((d) => !d.get("cover") && d.get("hidden") !== true).map((d) => `${d.get("title")} (${d.id})`);
  console.log(`Games still without a cover: ${left.length ? left.join(", ") : "none"}`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => { console.error(err.message || err); process.exit(1); });
