// functions/lib/externalAssets.js
//
// Shared helper for any feature that stores a file in Cloudinary and wants
// it tracked in the shared externalAssets / storageUsage collections — see
// /features/cloud-stash/README.md for the full contract these fields serve.
//
// Call recordAssetCreated() from your own feature's Cloud Function right
// after a successful Cloudinary upload. Do NOT write to externalAssets or
// storageUsage directly — firestore.rules denies client writes to both, and
// hand-rolling this write elsewhere risks drifting from the shape Cloud
// Stash (and the safe-delete function) expect.
//
// Deletion is NEVER a feature's own responsibility — see
// deleteExternalAsset / performAssetDeletion in functions/index.js, the
// one allowed path (Cloudinary delete first, then clear the linked field).

const admin = require("firebase-admin");

/**
 * @param {object} params
 * @param {string} params.url - Cloudinary secure_url.
 * @param {string} params.publicId - Cloudinary public_id.
 * @param {"image"|"video"|"raw"} [params.resourceType] - Cloudinary resource_type; defaults to "image".
 * @param {string} params.feature - short feature key, e.g. "bugZapper".
 * @param {number} params.sizeBytes - the uploaded file's size, for storageUsage tracking.
 * @param {string} params.linkedCollection - the Firestore collection of the doc this asset belongs to.
 * @param {string} params.linkedDocId - that doc's id.
 * @param {string} params.linkedField - the field on that doc holding this asset's URL
 *   (e.g. "screenshotUrl"). REQUIRED — the safe-delete function reads this to know
 *   which field to clear when the asset is purged. Without it, deleting the asset
 *   would leave a dead URL on the linked doc, which is exactly what the orphan-safety
 *   rule exists to prevent.
 * @returns {Promise<string>} the new externalAssets doc id.
 */
async function recordAssetCreated({
  url,
  publicId,
  resourceType = "image",
  feature,
  sizeBytes,
  linkedCollection,
  linkedDocId,
  linkedField,
}) {
  if (!url || !publicId || !feature || !Number.isFinite(sizeBytes)) {
    throw new Error(
      "recordAssetCreated: url, publicId, feature and a numeric sizeBytes are required."
    );
  }
  if (!linkedCollection || !linkedDocId || !linkedField) {
    throw new Error(
      "recordAssetCreated: linkedCollection, linkedDocId and linkedField are all required " +
        "so the safe-delete function can clear the right field later."
    );
  }

  const db = admin.firestore();
  const assetRef = db.collection("externalAssets").doc();
  const usageRef = db.collection("storageUsage").doc("current");

  await db.runTransaction(async (tx) => {
    tx.set(assetRef, {
      url,
      publicId,
      resourceType,
      feature,
      sizeBytes,
      linkedDoc: {
        collection: linkedCollection,
        docId: linkedDocId,
        field: linkedField,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    tx.set(
      usageRef,
      {
        totalBytes: admin.firestore.FieldValue.increment(sizeBytes),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  return assetRef.id;
}

module.exports = { recordAssetCreated };
