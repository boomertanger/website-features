// Cloudinary helpers for the Game Vault's covers (docs/specs/game-vault.md §6). The generic REST pieces (signed uploads, the Admin API read, signed
// URLs, the folder listing) moved to functions/lib/cloudinary.js (shared with Bug Zapper); this file keeps the cover rules (3:4, size, bytes), the cover
// folders and the rename that moves an approved cover from the private pending folder to the public one, and re-exports the rest so the Vault is unchanged.
// Deleting is NOT here: the one delete path is performAssetDeletion in functions/index.js.
const C = require("../cloudinary");
const { ALLOWED_FORMATS, PREVIEW_TTL_S, signParams, uploadParams, api, resourceInfo, previewUrl } = C;

const PUBLIC_FOLDER = "game-vault/covers";
const PENDING_FOLDER = "game-vault/pending";
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const MIN_COVER_W = 300;
const MIN_COVER_H = 400;
const RATIO = 3 / 4;
const RATIO_TOLERANCE = 0.03;       // the browser crops to 3:4; allow rounding

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

/** Moves an approved cover from the pending (authenticated) folder to the public covers folder. */
async function moveToPublic(fetchFn, creds, fromPublicId, now = Date.now()) {
  const toPublicId = `${PUBLIC_FOLDER}/${fromPublicId.split("/").pop()}`;
  const params = { from_public_id: fromPublicId, to_public_id: toPublicId, type: "authenticated", to_type: "upload", overwrite: "false", timestamp: Math.floor(now / 1000) };
  const r = await api(fetchFn, creds, "POST", "image/rename", { ...params, api_key: creds.apiKey, signature: signParams(params, creds.apiSecret) });
  if (!r.ok) throw new Error(`Cloudinary rename failed (${r.status}): ${JSON.stringify(r.json).slice(0, 200)}`);
  return { publicId: r.json.public_id || toPublicId, url: r.json.secure_url, bytes: r.json.bytes, format: r.json.format };
}

/** Up to 500 files in the pending folder: [{ publicId, createdAt (ms), bytes }]. */
const listPending = (fetchFn, creds) => C.listFolder(fetchFn, creds, PENDING_FOLDER);

module.exports = {
  PUBLIC_FOLDER, PENDING_FOLDER, ALLOWED_FORMATS, MAX_COVER_BYTES, MIN_COVER_W, MIN_COVER_H, PREVIEW_TTL_S,
  signParams, uploadParams, resourceInfo, coverProblem, moveToPublic, previewUrl, listPending,
};
