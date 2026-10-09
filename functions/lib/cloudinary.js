// Cloudinary REST helpers shared by the Game Vault (covers) and Bug Zapper (screenshots). No SDK: signed upload parameters, the Admin API's read of an
// uploaded file (so nothing the browser says about a file is trusted), expiring signed URLs and the folder listing a daily sweep uses. Deleting is NOT here:
// the one delete path is performAssetDeletion in functions/index.js. A feature's own rules (a cover's size and ratio, a screenshot's bytes) live with the
// feature (lib/vault/cloudinary.js, lib/bugs); the folder is always a parameter.
//
// Every function takes the creds object ({ cloudName, apiKey, apiSecret }) and a fetch, so nothing reads secrets itself.
const crypto = require("crypto");

const ALLOWED_FORMATS = ["jpg", "jpeg", "png", "webp"];
const PREVIEW_TTL_S = 10 * 60;      // signed previews last 10 minutes

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

/** A signed, expiring URL staff can load a pending (authenticated) cover from. */
function previewUrl(creds, publicId, format, now = Date.now()) {
  const params = { public_id: publicId, format, type: "authenticated", timestamp: Math.floor(now / 1000), expires_at: Math.floor(now / 1000) + PREVIEW_TTL_S };
  const q = new URLSearchParams({ ...params, api_key: creds.apiKey, signature: signParams(params, creds.apiSecret) });
  return `https://api.cloudinary.com/v1_1/${encodeURIComponent(creds.cloudName)}/image/download?${q}`;
}

/** Up to 500 authenticated files under a folder: [{ publicId, createdAt (ms), bytes }]. */
async function listFolder(fetchFn, creds, folder) {
  const out = [];
  let cursor = null;
  do {
    const q = `resources/image/authenticated?prefix=${encodeURIComponent(folder + "/")}&max_results=100${cursor ? `&next_cursor=${encodeURIComponent(cursor)}` : ""}`;
    const r = await api(fetchFn, creds, "GET", q);
    if (!r.ok) throw new Error(`Cloudinary list failed (${r.status})`);
    for (const x of r.json.resources || []) out.push({ publicId: x.public_id, createdAt: Date.parse(x.created_at) || 0, bytes: x.bytes || 0 });
    cursor = r.json.next_cursor || null;
  } while (cursor && out.length < 500);
  return out;
}

module.exports = { ALLOWED_FORMATS, PREVIEW_TTL_S, signParams, uploadParams, api, resourceInfo, previewUrl, listFolder };
