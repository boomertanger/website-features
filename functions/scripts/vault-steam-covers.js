#!/usr/bin/env node
// functions/scripts/vault-steam-covers.js
//
// Gives Steam-only and cover-less Game Vault games a cover from Steam's own art, through the approved cover-override
// path (docs/specs/game-vault.md §6; adminEditItem's vaultGame cover "replace", lib/vault/edit.js applyEdit): the image
// is uploaded to Cloudinary under game-vault/covers (never hotlinked), then applyEdit checks it (format, size, 3:4),
// records it with recordAssetCreated() (feature gameVault, linked to the game's cover.url), swaps the cover in one
// transaction, writes the adminLog entry (actor "vault-steam-covers.js") and rebuilds public/vault.
//
// Which games: every game with a Steam app id that is Steam-only (no IGDB record; its cover was a Steam hotlink) or has
// no cover at all. Games with no Steam app (added by hand) are listed and left coverless.
// Which image: Steam's portrait library image (library_600x900, from IStoreBrowseService/GetItems, since newer apps keep
// it under a hashed path), cropped to 3:4 on the way in (600x800, c_fill, g_auto); with no portrait, the header capsule,
// padded to 600x800 over a blurred copy of itself (a header is too small to crop to 3:4).
//
// Dry run by default (every game and the image it would use); --apply uploads and sets the covers. Staging unless
// --project production is given.
// Credentials (only for --apply): CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in your shell, or
// --from-secret-manager to read them from the project's Secret Manager (Application Default Credentials). Never printed.
//
//   node functions/scripts/vault-steam-covers.js
//   node functions/scripts/vault-steam-covers.js --apply --from-secret-manager

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const { adminLogEntry } = require("./import-vault");

const STEAM_ASSETS = "https://shared.akamai.steamstatic.com/store_item_assets/";
const PORTRAIT_T = "c_fill,g_auto,w_600,h_800";
const HEADER_T = "c_pad,w_600,h_800,b_blurred:400:15";

function parseArgs(argv) {
  const a = { project: "staging", apply: false, secretManager: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--project") a.project = argv[++i];
    else if (x.startsWith("--project=")) a.project = x.slice("--project=".length);
    else if (x === "--apply") a.apply = true;
    else if (x === "--from-secret-manager") a.secretManager = true;
    else throw new Error(`Unknown argument: ${x}`);
  }
  return a;
}
function resolveProjectId(nameOrId) {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", ".firebaserc"), "utf8")).projects?.[nameOrId] ?? nameOrId; } catch { return nameOrId; }
}

async function credsFrom(args, projectId) {
  const names = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"];
  let vals = names.map((n) => process.env[n] || "");
  if (args.secretManager) {
    const { access_token: token } = await admin.credential.applicationDefault().getAccessToken();
    vals = await Promise.all(names.map(async (n) => {
      const res = await fetch(`https://secretmanager.googleapis.com/v1/projects/${projectId}/secrets/${n}/versions/latest:access`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Couldn't read ${n} from Secret Manager on ${projectId} (${res.status}).`);
      return Buffer.from((await res.json()).payload.data, "base64").toString("utf8").trim();
    }));
  }
  const missing = names.filter((_, i) => !vals[i]);
  if (missing.length) throw new Error(`Missing ${missing.join(", ")}. Set them in your shell, or pass --from-secret-manager.`);
  return { cloudName: vals[0], apiKey: vals[1], apiSecret: vals[2] };
}

/** Steam's library art for up to 50 apps: { appId: { portrait, header } } (full URLs, or null). */
async function steamArt(appIds) {
  const out = {};
  for (let i = 0; i < appIds.length; i += 50) {
    const ids = appIds.slice(i, i + 50);
    const q = { ids: ids.map((appid) => ({ appid: Number(appid) })), context: { language: "english", country_code: "US" }, data_request: { include_assets: true } };
    const res = await fetch(`https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(q))}`);
    if (!res.ok) throw new Error(`Steam GetItems: HTTP ${res.status}`);
    for (const it of (await res.json()).response?.store_items || []) {
      const a = it.assets || {}, url = (file) => (file && a.asset_url_format ? STEAM_ASSETS + a.asset_url_format.replace("${FILENAME}", file) : null);
      out[String(it.appid)] = { portrait: url(a.library_capsule_2x) || url(a.library_capsule), header: url(a.header) };
    }
  }
  return out;
}
const live = async (url) => { try { const r = await fetch(url, { method: "HEAD" }); return r.ok && /^image\//.test(r.headers.get("content-type") || ""); } catch { return false; } };

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  admin.initializeApp({ projectId });
  const store = require("../lib/vault/store")({ adminLogEntry });
  const E = require("../lib/vault/edit");
  const cloud = require("../lib/vault/cloudinary");
  console.log(`Project: ${projectId}${args.apply ? "" : " (dry run: nothing is uploaded or written)"}`);

  const games = (await store.games.get()).docs.map((d) => ({ slug: d.id, ...d.data() }));
  const steamOnly = (g) => g.ids?.steam && !g.ids?.igdb;
  const targets = games.filter((g) => g.ids?.steam && g.cover?.source !== "upload" && (steamOnly(g) || !g.cover));
  const handOnly = games.filter((g) => !g.ids?.steam && !g.cover);
  const art = await steamArt([...new Set(targets.map((g) => String(g.ids.steam)))]);

  const plan = [];
  for (const g of targets) {
    const a = art[String(g.ids.steam)] || {};
    const portrait = a.portrait && (await live(a.portrait)) ? a.portrait : null;
    const header = !portrait && a.header && (await live(a.header)) ? a.header : null;
    plan.push({ g, url: portrait || header, kind: portrait ? "portrait" : header ? "header" : null });
  }
  console.log(`\n${targets.length} game(s) get a Steam cover:`);
  for (const p of plan) console.log(`  ${p.g.title} (${p.g.slug}, Steam ${p.g.ids.steam}${steamOnly(p.g) ? ", Steam only" : ""}, now ${p.g.cover ? p.g.cover.source : "no cover"})\n    ${p.kind ? `${p.kind}: ${p.url}` : "NO STEAM ART FOUND (left as it is)"}`);
  console.log(`\n${handOnly.length} game(s) with no Steam app stay coverless (add covers by hand):`);
  for (const g of handOnly) console.log(`  ${g.title} (${g.slug})${g.links?.itch || g.links?.official ? ` · ${g.links.itch || g.links.official}` : ""}`);
  if (!args.apply) { console.log("\nDry run: nothing uploaded. Add --apply to upload and set the covers."); return; }

  const creds = await credsFrom(args, projectId);
  const { recordAssetCreated } = require("../lib/externalAssets");
  const editor = E({ store, deps: {
    cloudCreds: () => creds, recordAssetCreated,
    // only used to roll back or to remove an old uploaded cover; none of these games has one
    performAssetDeletion: async () => { throw new Error("vault-steam-covers.js can't delete assets; remove it from Cloud Stash"); },
  } });
  let done = 0, failed = 0;
  for (const p of plan.filter((x) => x.url)) {
    const publicId = `${cloud.PUBLIC_FOLDER}/${p.g.slug}-steam-${p.g.ids.steam}`;
    try {
      const params = { timestamp: Math.floor(Date.now() / 1000), public_id: publicId, overwrite: "false", transformation: p.kind === "portrait" ? PORTRAIT_T : HEADER_T };
      const form = new FormData();
      for (const [k, v] of Object.entries({ ...params, file: p.url, api_key: creds.apiKey, signature: require("../lib/cloudinary").signParams(params, creds.apiSecret) })) form.append(k, String(v));
      const res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(creds.cloudName)}/image/upload`, { method: "POST", body: form });
      const info = await res.json().catch(() => ({}));
      if (!res.ok || !info.public_id) throw new Error(`upload failed (${res.status}): ${info.error?.message || "no details"}`);
      const r = await editor.applyEdit({ uid: null, name: "vault-steam-covers.js" }, { id: p.g.slug, changes: { cover: { action: "replace", publicId: info.public_id } }, before: { cover: E.currentValue("cover", p.g) }, reason: `Cover from Steam's ${p.kind === "portrait" ? "library portrait" : "header capsule"} (app ${p.g.ids.steam})` });
      done++;
      console.log(`  ${p.g.title}: ${info.public_id} (${info.width}x${info.height}, ${Math.round(info.bytes / 1024)} KB)${r.warnings?.length ? ` [${r.warnings.join(" ")}]` : ""}`);
    } catch (err) { failed++; console.log(`  ${p.g.title}: FAILED, ${err.message || err}`); }
  }
  console.log(`\nCovers set: ${done}, failed: ${failed}.`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => { console.error(err.message || err); process.exit(1); });
