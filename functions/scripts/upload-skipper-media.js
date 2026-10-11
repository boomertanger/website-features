#!/usr/bin/env node
// functions/scripts/upload-skipper-media.js: uploads Skipper's photos and clips to Cloudinary once (docs/specs/base-camp.md "Media" and "Privacy and
// media rules"). STAGING ONLY, like upload-tech-stack-photos.js: it refuses any production project, even named deliberately. The media never goes
// in the repo (functions/scripts/data/skipper-media/ is gitignored).
//
// Point it at the unzipped media folder (media-manifest.json + the files). Each file gets the fixed public id from the manifest (skipper/<name>) and
// is never overwritten: a public id Cloudinary already holds is skipped. Each new upload is recorded with recordAssetCreated() (feature "skipper"),
// so Cloud Stash counts it and only the approved delete path can remove it; the linked doc is sites/boomertanger/public/skipperCam, field
// media.<name> (nothing is written there).
//
// The privacy check runs on every file, dry run or not, and a file that fails it is REFUSED (reported, never uploaded; the rest carry on):
//   images  EXIF GPS (latitude / longitude), Make, Model, DateTime, DateTimeOriginal, CreateDate (read with exifr)
//   videos  the bytes contain com.apple.quicktime (Apple's location / device / date keys), ISO6709 (a location), creationdate, or ©xyz (a location)
// The media pack was stripped and cropped before it was zipped; this is the second check (what's IN the frame is a person's check, not this one).
//
// Without --apply it's a dry run: every file, its public id and size, and what was refused.
// Credentials (only for --apply): CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in your shell, or --from-secret-manager to read
// them from the staging project's Secret Manager (Application Default Credentials). The values are never printed.
//
// Usage (from the repo root or functions/):
//   node functions/scripts/upload-skipper-media.js                       # dry run, default folder functions/scripts/data/skipper-media
//   node functions/scripts/upload-skipper-media.js --apply --from-secret-manager
//   --dir <folder>   another folder;  --project <name|id>   default staging
const fs = require("fs");
const path = require("path");

const FEATURE = "skipper";
const LINK = { collection: "sites/boomertanger/public", docId: "skipperCam" };
const IMAGE_FORMATS = ["jpg", "jpeg", "png", "webp"];
const VIDEO_FORMATS = ["mp4"];
const VIDEO_MARKERS = ["com.apple.quicktime", "ISO6709", "creationdate", "©xyz"];

function parseArgs(argv) {
  const a = { project: "staging", apply: false, dir: path.join(__dirname, "data", "skipper-media"), secretManager: false };
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
  return a;
}
function resolveProjectId(nameOrId) {
  try { const rc = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", ".firebaserc"), "utf8")); return rc.projects?.[nameOrId] ?? nameOrId; }
  catch { return nameOrId; }
}
/** The guard: anything that looks like production is refused, whatever the flags say. */
function stagingOnly(projectId, name) {
  if (/prod/i.test(String(projectId)) || /prod/i.test(String(name))) throw new Error(`Refusing ${projectId}: upload-skipper-media.js runs on staging only.`);
  if (!/staging/i.test(String(projectId))) throw new Error(`Refusing ${projectId}: upload-skipper-media.js runs on staging only (the project id must name staging).`);
}

/** The manifest's files: { file, type, publicId, bytes, path }. */
function listMedia(dir) {
  const mf = path.join(dir, "media-manifest.json");
  if (!fs.existsSync(mf)) throw new Error(`No media-manifest.json in ${dir}.`);
  const manifest = JSON.parse(fs.readFileSync(mf, "utf8"));
  if (manifest.folder !== "skipper") throw new Error(`media-manifest.json: folder must be "skipper".`);
  return manifest.files.map((f) => {
    const p = path.join(dir, f.file);
    const ext = path.extname(f.file).slice(1).toLowerCase();
    if (!/^skipper\/[a-z0-9-]+$/.test(f.publicId)) throw new Error(`${f.file}: public id ${f.publicId} must be skipper/<lowercase-name>.`);
    if (f.type === "video" ? !VIDEO_FORMATS.includes(ext) : !IMAGE_FORMATS.includes(ext)) throw new Error(`${f.file}: a ${f.type} must be ${(f.type === "video" ? VIDEO_FORMATS : IMAGE_FORMATS).join(" / ")}.`);
    return { file: f.file, type: f.type === "video" ? "video" : "image", publicId: f.publicId, path: p, bytes: fs.existsSync(p) ? fs.statSync(p).size : null };
  });
}

/** What still identifies a place, a time or a device in the file: [] when it's clean. */
async function metadataProblems(m) {
  if (m.type === "image") {
    const exifr = require("exifr");
    let t = null;
    try { t = await exifr.parse(m.path, { gps: true, tiff: true, exif: true, ifd0: true, xmp: false, icc: false, iptc: false, translateValues: false, reviveValues: false }); }
    catch (err) { return [`couldn't read its metadata (${String(err.message || err).slice(0, 60)})`]; }
    if (!t) return [];
    const out = [];
    if (t.latitude != null || t.longitude != null || t.GPSLatitude != null || t.GPSLongitude != null) out.push("GPS location");
    for (const k of ["Make", "Model"]) if (t[k]) out.push(`device (${k})`);
    for (const k of ["DateTime", "DateTimeOriginal", "CreateDate", "ModifyDate"]) if (t[k]) out.push(`date (${k})`);
    return out;
  }
  // video: scan the metadata boxes (everything outside the media data) for the markers
  const buf = fs.readFileSync(m.path);
  const out = [];
  const regions = [];
  let o = 0;
  while (o + 8 <= buf.length) {
    let size = buf.readUInt32BE(o); const type = buf.toString("latin1", o + 4, o + 8);
    if (size === 1 && o + 16 <= buf.length) size = Number(buf.readBigUInt64BE(o + 8));
    else if (size === 0) size = buf.length - o;
    if (size < 8) break;
    if (type !== "mdat") regions.push(buf.subarray(o, Math.min(buf.length, o + size)));
    o += size;
  }
  const meta = regions.length ? Buffer.concat(regions) : buf;
  for (const k of VIDEO_MARKERS) if (meta.indexOf(Buffer.from(k, "latin1")) >= 0 || (k === "creationdate" && meta.toString("latin1").toLowerCase().includes(k))) out.push(k === "©xyz" ? "location (©xyz)" : k);
  return [...new Set(out)];
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
  const dir = path.resolve(args.dir);
  const all = listMedia(dir);
  const ok = [], refused = [];
  for (const m of all) {
    if (m.bytes == null) { refused.push({ ...m, why: ["the file isn't in the folder"] }); continue; }
    const why = await metadataProblems(m);
    (why.length ? refused : ok).push({ ...m, why });
  }
  const total = ok.reduce((s, m) => s + m.bytes, 0);
  console.log(`${projectId} · ${ok.length} of ${all.length} files ready (${(total / 1048576).toFixed(1)} MB) from ${dir}${args.apply ? "" : " · dry run (add --apply to upload)"}`);
  for (const m of ok) console.log(`  ${m.type.padEnd(5)} ${m.file.padEnd(32)} -> ${m.publicId.padEnd(34)} ${(m.bytes / 1024).toFixed(0)} KB`);
  if (refused.length) { console.log(`  REFUSED (${refused.length}), never uploaded:`); for (const m of refused) console.log(`    ${m.file}: ${m.why.join(", ")}`); }
  else console.log("  Metadata check: no location, date or device tags in any file.");
  if (!args.apply) return;

  const creds = await credsFrom(args, projectId);
  const C = require("../lib/cloudinary");
  const admin = require("firebase-admin");
  admin.initializeApp({ projectId });
  const { recordAssetCreated } = require("../lib/externalAssets");
  let up = 0, already = 0;
  for (const m of ok) {
    const look = await C.api(fetch, creds, "GET", `resources/${m.type}/upload/${encodeURIComponent(m.publicId)}`);
    if (look.ok) { console.log(`  skip ${m.publicId} (already on Cloudinary; never overwritten)`); already++; continue; }
    if (look.status !== 404) throw new Error(`Couldn't check ${m.publicId} (${look.status}). ${up} uploaded before this; rerun to continue.`);
    const formats = (m.type === "video" ? VIDEO_FORMATS : IMAGE_FORMATS).join(",");
    const params = { timestamp: Math.floor(Date.now() / 1000), public_id: m.publicId, overwrite: "false", allowed_formats: formats };
    const form = new FormData();
    for (const [k, v] of Object.entries({ ...params, api_key: creds.apiKey, signature: C.signParams(params, creds.apiSecret) })) form.append(k, String(v));
    form.append("file", new Blob([fs.readFileSync(m.path)], { type: m.type === "video" ? "video/mp4" : "image/jpeg" }), m.file);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(creds.cloudName)}/${m.type}/upload`, { method: "POST", body: form });
    const info = await res.json().catch(() => ({}));
    if (!res.ok || !info.public_id) throw new Error(`Upload failed for ${m.publicId} (${res.status}): ${info.error?.message || "no details"}. ${up} uploaded before this; rerun to continue (done ones are skipped).`);
    if (info.public_id !== m.publicId) throw new Error(`Cloudinary stored ${m.publicId} as ${info.public_id}; stopping.`);
    await recordAssetCreated({ url: info.secure_url, publicId: info.public_id, resourceType: m.type, feature: FEATURE, sizeBytes: info.bytes, linkedCollection: LINK.collection, linkedDocId: LINK.docId, linkedField: `media.${m.publicId.split("/")[1]}` });
    console.log(`  uploaded ${m.publicId} (${(info.bytes / 1024).toFixed(0)} KB) and recorded it`);
    up++;
  }
  console.log(`Done: ${up} uploaded, ${already} already there, ${refused.length} refused.`);
}

if (require.main === module) main().catch((err) => { console.error(String((err && err.message) || err)); process.exit(1); });
module.exports = { stagingOnly, listMedia, metadataProblems };
