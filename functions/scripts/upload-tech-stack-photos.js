#!/usr/bin/env node
// functions/scripts/upload-tech-stack-photos.js: uploads the Tech Stack photos to Cloudinary once (docs/specs/tech-stack.md §6 "Photos").
// STAGING ONLY: it refuses any production project, even named deliberately. The photos never go in the repo.
//
// Point it at the unzipped photo folder (desk/ and card/ PNGs). Each file gets a fixed public id, tech-stack/desk/<id> or tech-stack/card/<id>
// (the ids site/src/data/tech-stack.json uses), and is never overwritten: a public id Cloudinary already holds is skipped. Each new upload is
// recorded with recordAssetCreated() (feature "techStack"), so Cloud Stash counts it and only the approved delete path can remove it; the
// linked doc is sites/boomertanger/memberContent/tech-stack, field photos.<desk|card>.<id> (nothing is written there; a purge clears it).
//
// Only the photos the page uses are uploaded: every id in site/src/data/tech-stack.json, plus the scene extras in SCENE_EXTRAS (the hero and chapter 1
// scenes, site/src/scripts/tech-stack/scenes.ts). Other files in the folder (alternate shots) are listed as skipped.
// Without --apply it's a dry run: every file and public id, its size, the skipped ones, and which ids the page uses that have no file.
//
// Credentials (only for --apply): the same three values the functions read from Secret Manager, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and
// CLOUDINARY_API_SECRET, either set in your shell's environment, or read from the staging project's Secret Manager with --from-secret-manager
// (Application Default Credentials with Secret Manager access). The values are never printed.
//
// Usage (from the repo root or functions/):
//   node functions/scripts/upload-tech-stack-photos.js --dir <folder>                          # dry run
//   node functions/scripts/upload-tech-stack-photos.js --dir <folder> --apply [--from-secret-manager]
//   --project <name|id>   default staging
const fs = require("fs");
const path = require("path");

const FEATURE = "techStack";
const LINK = { collection: "sites/boomertanger/memberContent", docId: "tech-stack" };
const FOLDERS = ["desk", "card"];
const SCENE_EXTRAS = ["tech-stack/card/gpu3080"];   // photos only scenes.ts draws (keep in step with it)

function parseArgs(argv) {
  const a = { project: "staging", apply: false, dir: null, secretManager: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--project") a.project = argv[++i];
    else if (x.startsWith("--project=")) a.project = x.slice(10);
    else if (x === "--dir") a.dir = argv[++i];
    else if (x.startsWith("--dir=")) a.dir = x.slice(6);
    else if (x === "--apply") a.apply = true;
    else if (x === "--from-secret-manager") a.secretManager = true;
    else throw new Error(`Unknown argument: ${x}`);
  }
  if (!a.dir) throw new Error("Pass --dir <folder> (the unzipped photos: desk/ and card/).");
  return a;
}
function resolveProjectId(nameOrId) {
  try { const rc = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", ".firebaserc"), "utf8")); return rc.projects?.[nameOrId] ?? nameOrId; }
  catch { return nameOrId; }
}
/** The guard: anything that looks like production is refused, whatever the flags say. */
function stagingOnly(projectId, name) {
  if (/prod/i.test(String(projectId)) || /prod/i.test(String(name))) throw new Error(`Refusing ${projectId}: upload-tech-stack-photos.js runs on staging only.`);
  if (!/staging/i.test(String(projectId))) throw new Error(`Refusing ${projectId}: upload-tech-stack-photos.js runs on staging only (the project id must name staging).`);
}

/** Every PNG under desk/ and card/: { folder, id, file, bytes, publicId }. */
function listPhotos(dir) {
  const out = [];
  for (const folder of FOLDERS) {
    const d = path.join(dir, folder);
    if (!fs.existsSync(d)) throw new Error(`No ${folder}/ folder in ${dir}.`);
    for (const name of fs.readdirSync(d).sort()) {
      if (!/\.png$/i.test(name)) continue;
      const id = name.replace(/\.png$/i, "");
      if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`${folder}/${name}: file names must be lowercase letters, digits and dashes.`);
      out.push({ folder, id, file: path.join(d, name), bytes: fs.statSync(path.join(d, name)).size, publicId: `tech-stack/${folder}/${id}` });
    }
  }
  return out;
}

/** The public ids the site's data file points at. */
function referencedIds() {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "site", "src", "data", "tech-stack.json"), "utf8"));
  const ids = new Set();
  for (const d of data.devices) { if (d.photo?.desk) ids.add(d.photo.desk); if (d.photo?.card) ids.add(d.photo.card); }
  for (const g of data.gear) ids.add(g.photo);
  for (const k of ["gaming", "streaming"]) ids.add(data.pcCompare[k].photo);
  SCENE_EXTRAS.forEach((id) => ids.add(id));
  return ids;
}

async function credsFrom(args, projectId) {
  const names = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"];
  let vals = names.map((n) => process.env[n] || "");
  if (args.secretManager) {
    const admin = require("firebase-admin");
    const { access_token: token } = await admin.credential.applicationDefault().getAccessToken();
    vals = await Promise.all(names.map(async (n) => {
      const res = await fetch(`https://secretmanager.googleapis.com/v1/projects/${projectId}/secrets/${n}/versions/latest:access`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Couldn't read ${n} from Secret Manager on ${projectId} (${res.status}). Check that your Application Default Credentials can access secrets.`);
      return Buffer.from((await res.json()).payload.data, "base64").toString("utf8").trim();
    }));
  }
  const missing = names.filter((_, i) => !vals[i]);
  if (missing.length) throw new Error(`Missing ${missing.join(", ")}. Set them in your shell, or pass --from-secret-manager to read them from ${projectId}'s Secret Manager.`);
  return { cloudName: vals[0], apiKey: vals[1], apiSecret: vals[2] };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  stagingOnly(projectId, args.project);
  const all = listPhotos(path.resolve(args.dir));
  const used = referencedIds(), have = new Set(all.map((p) => p.publicId));
  const photos = all.filter((p) => used.has(p.publicId)), skipped = all.filter((p) => !used.has(p.publicId));
  const total = photos.reduce((s, p) => s + p.bytes, 0);
  console.log(`${projectId} · ${photos.length} photos (${(total / 1048576).toFixed(1)} MB) from ${path.resolve(args.dir)}${args.apply ? "" : " · dry run (add --apply to upload)"}`);
  for (const p of photos) console.log(`  ${p.folder}/${p.id}.png`.padEnd(30) + ` -> ${p.publicId}`.padEnd(36) + ` ${(p.bytes / 1024).toFixed(0)} KB`);
  if (skipped.length) console.log(`  Skipped, not used by the page (${skipped.length}): ${skipped.map((p) => `${p.folder}/${p.id}`).join(", ")}`);
  const noFile = [...used].filter((id) => !have.has(id));
  if (noFile.length) console.log(`  In tech-stack.json with no file here (the page shows the platforms' official marks instead): ${noFile.join(", ")}`);
  if (!args.apply) return;

  const creds = await credsFrom(args, projectId);
  const C = require("../lib/cloudinary");
  const admin = require("firebase-admin");
  admin.initializeApp({ projectId });
  const { recordAssetCreated } = require("../lib/externalAssets");
  let up = 0, already = 0;
  for (const p of photos) {
    if (await C.resourceInfo(fetch, creds, p.publicId)) { console.log(`  skip ${p.publicId} (already on Cloudinary; never overwritten)`); already++; continue; }
    const params = { timestamp: Math.floor(Date.now() / 1000), public_id: p.publicId, overwrite: "false", allowed_formats: C.ALLOWED_FORMATS.join(",") };
    const form = new FormData();
    for (const [k, v] of Object.entries({ ...params, api_key: creds.apiKey, signature: C.signParams(params, creds.apiSecret) })) form.append(k, String(v));
    form.append("file", new Blob([fs.readFileSync(p.file)], { type: "image/png" }), path.basename(p.file));
    const res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(creds.cloudName)}/image/upload`, { method: "POST", body: form });
    const info = await res.json().catch(() => ({}));
    if (!res.ok || !info.public_id) throw new Error(`Upload failed for ${p.publicId} (${res.status}): ${info.error?.message || "no details"}. ${up} uploaded before this; rerun to continue (done ones are skipped).`);
    if (info.public_id !== p.publicId) throw new Error(`Cloudinary stored ${p.publicId} as ${info.public_id}; stopping.`);
    await recordAssetCreated({ url: info.secure_url, publicId: info.public_id, feature: FEATURE, sizeBytes: info.bytes, linkedCollection: LINK.collection, linkedDocId: LINK.docId, linkedField: `photos.${p.folder}.${p.id}` });
    console.log(`  uploaded ${p.publicId} (${(info.bytes / 1024).toFixed(0)} KB) and recorded it`);
    up++;
  }
  console.log(`Done: ${up} uploaded, ${already} already there.`);
}

if (require.main === module) main().catch((err) => { console.error(String((err && err.message) || err)); process.exit(1); });
module.exports = { stagingOnly, listPhotos };
