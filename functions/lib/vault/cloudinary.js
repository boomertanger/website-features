// Cloudinary REST helpers for the Game Vault's covers (docs/specs/game-vault.md §6). No
// SDK: signed upload parameters, the Admin API's read of an uploaded file (so nothing the
// browser says about a file is trusted), the rename that moves an approved cover from the
// private pending folder to the public one, expiring signed preview URLs and the pending
// folder listing the daily sweep uses. Deleting is NOT here: the one delete path is
// performAssetDeletion in functions/index.js.
//
// Every function takes the creds object ({ cloudName, apiKey, apiSecret }) and a fetch, so
// nothing reads secrets itself. Nothing here has been run against a live Cloudinary account:
// the first staging run of the cover flow is its test (see the Game Vault part 3 notes).
const crypto = require("crypto");

const PUBLIC_FOLDER = "game-vault/covers";
const PENDING_FOLDER = "game-vault/pending";
const ALLOWED_FORMATS = ["jpg", "jpeg", "png", "webp"];
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const MIN_COVER_W = 300;
const MIN_COVER_H = 400;
const RATIO = 3 / 4;
const RATIO_TOLERANCE = 0.03;       // the browser crops to 3:4; allow rounding
const PREVIEW_TTL_S = 10 * 60;      // signed staff previews last 10 minutes

/** Cloudinary's request signature: sorted "k=v" pairs (minus file, cloud_name, resource_type, api_key) + the secret, SHA-1. */
function signParams(params, apiSecret) {
  const skip = new Set(["file", "cloud_name", "resource_type", "api_key"]);
  const text = Object.keys(params)
    .filter((k) => !skip.has(k) && params[k] !== undefined && params[k] !== null && params[k] !== "")
    .sort()
    .map((k) => `${k}=${Array.isArray(params[k]) ? params[k].join(",") : params[k]}`)
    .join("&");
  return crypto.createHash("sha1").update(text + apiSecret).digest("hex");
}

/** Parameters the browser posts with the file to https://api.cloudinary.com/v1_1/{cloud}/image/upload. */
function uploadParams({ creds, folder, type = "upload", publicId, context, now = Date.now() }) {
  const params = {
    timestamp: Math.floor(now / 1000),
    ...(publicId ? {} : { folder }),   // a public_id that already holds its folder path needs no folder param
    allowed_formats: ALLOWED_FORMATS.join(","),
    ...(type !== "upload" ? { type } : {}),
    ...(publicId ? { public_id: publicId } : {}),
    ...(context ? { context } : {}),
  };
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(creds.cloudName)}/image/upload`,
    fields: { ...params, api_key: creds.apiKey, signature: signParams(params, creds.apiSecret) },
  };
}

const basic = (creds) => `Basic ${Buffer.from(`${creds.apiKey}:${creds.apiSecret}`).toString("base64")}`;

async function api(fetchFn, creds, method, pathPart, body) {
  const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(creds.cloudName)}/${pathPart}`;
  const res = await fetchFn(url, { method, headers: { Authorization: basic(creds), ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) }, ...(body ? { body: new URLSearchParams(body) } : {}) });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

/** Cloudinary's own record of an uploaded image, or null if it isn't there. */
async function resourceInfo(fetchFn, creds, publicId, type = "upload") {
  const r = await api(fetchFn, creds, "GET", `resources/image/${type}/${encodeURIComponent(publicId)}?context=true`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Cloudinary resource lookup failed (${r.status})`);
  return r.json;
}

/** Why an uploaded file can't be a cover, or null when it can (format, bytes, size, 3:4). */
function coverProblem(info) {
  if (!info) return "notFound";
  if (!ALLOWED_FORMATS.includes(String(info.format || "").toLowerCase())) return "format";
  if (!(info.bytes > 0) || info.bytes > MAX_COVER_BYTES) return "tooBig";
  if (!(info.width >= MIN_COVER_W) || !(info.height >= MIN_COVER_H)) return "tooSmall";
  if (Math.abs(info.width / info.height - RATIO) > RATIO_TOLERANCE) return "notPortrait";
  return null;
}

/** Moves an approved cover from the pending (authenticated) folder to the public covers folder. */
async function moveToPublic(fetchFn, creds, fromPublicId, now = Date.now()) {
  const toPublicId = `${PUBLIC_FOLDER}/${fromPublicId.split("/").pop()}`;
  const params = { from_public_id: fromPublicId, to_public_id: toPublicId, type: "authenticated", to_type: "upload", overwrite: "false", timestamp: Math.floor(now / 1000) };
  const r = await api(fetchFn, creds, "POST", "image/rename", { ...params, api_key: creds.apiKey, signature: signParams(params, creds.apiSecret) });
  if (!r.ok) throw new Error(`Cloudinary rename failed (${r.status}): ${JSON.stringify(r.json).slice(0, 200)}`);
  return { publicId: r.json.public_id || toPublicId, url: r.json.secure_url, bytes: r.json.bytes, format: r.json.format };
}

/** A signed, expiring URL staff can load a pending (authenticated) cover from. */
function previewUrl(creds, publicId, format, now = Date.now()) {
  const params = { public_id: publicId, format, type: "authenticated", timestamp: Math.floor(now / 1000), expires_at: Math.floor(now / 1000) + PREVIEW_TTL_S };
  const q = new URLSearchParams({ ...params, api_key: creds.apiKey, signature: signParams(params, creds.apiSecret) });
  return `https://api.cloudinary.com/v1_1/${encodeURIComponent(creds.cloudName)}/image/download?${q}`;
}

/** Up to 500 files in the pending folder: [{ publicId, createdAt (ms), bytes }]. */
async function listPending(fetchFn, creds) {
  const out = [];
  let cursor = null;
  do {
    const q = `resources/image/authenticated?prefix=${encodeURIComponent(PENDING_FOLDER + "/")}&max_results=100${cursor ? `&next_cursor=${encodeURIComponent(cursor)}` : ""}`;
    const r = await api(fetchFn, creds, "GET", q);
    if (!r.ok) throw new Error(`Cloudinary list failed (${r.status})`);
    for (const x of r.json.resources || []) out.push({ publicId: x.public_id, createdAt: Date.parse(x.created_at) || 0, bytes: x.bytes || 0 });
    cursor = r.json.next_cursor || null;
  } while (cursor && out.length < 500);
  return out;
}

module.exports = {
  PUBLIC_FOLDER, PENDING_FOLDER, ALLOWED_FORMATS, MAX_COVER_BYTES, MIN_COVER_W, MIN_COVER_H, PREVIEW_TTL_S,
  signParams, uploadParams, resourceInfo, coverProblem, moveToPublic, previewUrl, listPending,
};
