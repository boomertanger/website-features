const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();

// ---------- activityLog convention for future features ----------
// activityLog is written ONLY from server-side code (Admin SDK), never
// directly by clients — see firestore.rules, where activityLog's
// "create" rule is simply `false`. A client-writable event log on a
// PUBLIC feed is spoofable by anyone who can get an anonymous Firebase
// session, with zero tie-back to real data; a server-side trigger reacting
// to an actual Firestore write closes that off entirely.
//
// When a future feature wants to appear on the site-wide updates feed:
// add its own onDocumentCreated/onDocumentUpdated trigger below,
// watching that feature's own collection, and have it write a
// standardized event via admin.firestore().collection("activityLog").add({
//   feature, type, summary, link, actorName, createdAt: serverTimestamp(),
//   ...whatever extra fields that event type needs
// }). Keep "type" and "summary" freeform per-feature; only feature/type
// have size limits in the rules, so no rules change needed per feature.

const STATUS_LABELS = {
  submitted: "Submitted",
  under_review: "Under review",
  planned: "Planned",
  in_progress: "In progress",
  shipped: "Shipped",
  declined: "Declined",
};

exports.logFeatureRequestSubmitted = onDocumentCreated(
  "featureRequests/{requestId}",
  async (event) => {
    const data = event.data.data();
    await admin.firestore().collection("activityLog").add({
      feature: "feature-lab",
      type: "submitted",
      summary: `${data.requesterName ?? "Someone"} submitted "${data.title}"`,
      link: null,
      actorName: data.requesterName ?? null,
      requestId: event.params.requestId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
);

exports.logFeatureRequestStatusChanged = onDocumentUpdated(
  "featureRequests/{requestId}",
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (before.status === after.status) return; // not an actual transition

    const history = after.statusHistory ?? [];
    const actorName = history[history.length - 1]?.changedBy ?? null;
    const label = STATUS_LABELS[after.status] ?? after.status;

    await admin.firestore().collection("activityLog").add({
      feature: "feature-lab",
      type: "status_changed",
      summary: `"${after.title}" moved to ${label}`,
      link: null,
      actorName,
      requestId: event.params.requestId,
      status: after.status,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
);

// ---------- Admin sign-in sync ----------

// Callable from the browser right after Google Sign-In completes.
// Re-checks the allowlist every call, so adding or removing someone
// from adminAllowlist takes effect on their NEXT sign-in — no redeploy.
exports.syncAdminStatus = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }

  const email = request.auth.token.email;
  if (!email) {
    throw new HttpsError("failed-precondition", "This account has no email.");
  }

  const db = admin.firestore();
  const emailKey = email.toLowerCase();
  const allowlistDoc = await db.collection("adminAllowlist").doc(emailKey).get();
  const adminDocRef = db.collection("admins").doc(request.auth.uid);

  if (allowlistDoc.exists) {
    await adminDocRef.set(
      {
        email: emailKey,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { isAdmin: true };
  }

  // Not (or no longer) on the allowlist — make sure any stale admin doc is gone.
  await adminDocRef.delete().catch(() => {});
  return { isAdmin: false };
});

// ---------- Disk Stash: shared external-storage admin ----------
// See /features/disk-stash/README.md for the full contract. This is the
// ONLY place that deletes a Cloudinary asset — no feature, including Bug
// Zapper, should ever call Cloudinary's delete API itself. Every path here
// deletes from Cloudinary FIRST and only touches Firestore once that
// succeeds, per the orphan-safety rule: never a live file with no record,
// never a dead reference on someone else's doc.

const CLOUDINARY_CLOUD_NAME = defineSecret("CLOUDINARY_CLOUD_NAME");
const CLOUDINARY_API_KEY = defineSecret("CLOUDINARY_API_KEY");
const CLOUDINARY_API_SECRET = defineSecret("CLOUDINARY_API_SECRET");
const CLOUDINARY_SECRETS = [CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET];

async function isCallerAdmin(auth) {
  if (!auth) return false;
  const doc = await admin.firestore().collection("admins").doc(auth.uid).get();
  return doc.exists;
}

// Cloudinary's Admin API treats "already gone" as success (not an error),
// which is what we want: a resource that was somehow already deleted
// shouldn't block clearing the Firestore side.
async function cloudinaryDelete({ publicId, resourceType, cloudName, apiKey, apiSecret }) {
  const basicAuth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  const url =
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}` +
    `/resources/${encodeURIComponent(resourceType)}/upload` +
    `?public_ids[]=${encodeURIComponent(publicId)}`;

  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Basic ${basicAuth}` },
  });
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(`Cloudinary delete request failed (${res.status}): ${JSON.stringify(body)}`);
  }
  const outcome = body.deleted?.[publicId];
  if (outcome !== "deleted" && outcome !== "not_found") {
    throw new Error(`Cloudinary did not confirm deletion of ${publicId}: ${JSON.stringify(body)}`);
  }
  return outcome;
}

// Shared by the callable and the scheduled sweep below. Never call this
// with an assetId you haven't verified the caller is allowed to touch —
// callers below check admin status first.
async function performAssetDeletion(assetId, cloudinaryCreds) {
  const db = admin.firestore();
  const assetRef = db.collection("externalAssets").doc(assetId);
  const assetSnap = await assetRef.get();
  if (!assetSnap.exists) {
    throw new HttpsError("not-found", "No externalAssets record with that id.");
  }
  const asset = assetSnap.data();

  // Step 1: Cloudinary first. If this throws, nothing else runs and the
  // Firestore record is untouched — the asset stays fully intact rather
  // than half-deleted.
  await cloudinaryDelete({
    publicId: asset.publicId,
    resourceType: asset.resourceType || "image",
    ...cloudinaryCreds,
  });

  // Step 2: only now touch Firestore. set()+merge (not update()) on the
  // linked doc so a linked doc that was independently deleted doesn't
  // throw here — there's nothing left to orphan in that case anyway.
  const batch = db.batch();
  const { collection: linkedCollection, docId: linkedDocId, field: linkedField } =
    asset.linkedDoc || {};
  if (linkedCollection && linkedDocId && linkedField) {
    batch.set(
      db.collection(linkedCollection).doc(linkedDocId),
      { [linkedField]: admin.firestore.FieldValue.delete() },
      { merge: true }
    );
  }
  batch.delete(assetRef);
  batch.set(
    db.collection("storageUsage").doc("current"),
    {
      totalBytes: admin.firestore.FieldValue.increment(-(asset.sizeBytes || 0)),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  await batch.commit();

  await db.collection("activityLog").add({
    feature: "disk-stash",
    type: "asset_purged",
    summary: `Purged a ${asset.feature} asset (${asset.publicId})`,
    link: null,
    actorName: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { ok: true };
}

// Callable from the Disk Stash admin UI's manual "Purge" button.
exports.deleteExternalAsset = onCall({ secrets: CLOUDINARY_SECRETS }, async (request) => {
  if (!(await isCallerAdmin(request.auth))) {
    throw new HttpsError("permission-denied", "Admins only.");
  }
  const assetId = request.data?.assetId;
  if (typeof assetId !== "string" || !assetId) {
    throw new HttpsError("invalid-argument", "assetId is required.");
  }
  return performAssetDeletion(assetId, {
    cloudName: CLOUDINARY_CLOUD_NAME.value(),
    apiKey: CLOUDINARY_API_KEY.value(),
    apiSecret: CLOUDINARY_API_SECRET.value(),
  });
});

// Daily sweep: reads every enabled cleanupRules doc, finds linked docs
// matching its status+age condition, and purges their assets through the
// exact same safe-delete path as the manual button above.
//
// NOTE on indexes: this runs a where(matchField == matchValue) +
// where(ageField <= cutoff) query against whatever collection a rule
// names. Firestore needs a composite index per distinct (collection,
// matchField, ageField) triple — it can't be predeclared generically here
// since it depends on rules admins create later. The FIRST time a new
// rule's shape runs, expect a "failed-precondition: requires an index"
// error in the logs with a direct console link to create it — same
// one-time-setup shape as the Eventarc propagation delay noted elsewhere
// in this repo, not a real bug.
exports.scheduledAssetCleanup = onSchedule(
  { schedule: "every day 09:00", timeZone: "America/Los_Angeles", secrets: CLOUDINARY_SECRETS },
  async () => {
    const db = admin.firestore();
    const creds = {
      cloudName: CLOUDINARY_CLOUD_NAME.value(),
      apiKey: CLOUDINARY_API_KEY.value(),
      apiSecret: CLOUDINARY_API_SECRET.value(),
    };

    const rulesSnap = await db.collection("cleanupRules").where("enabled", "==", true).get();

    for (const ruleDoc of rulesSnap.docs) {
      const rule = ruleDoc.data();
      const cutoff = admin.firestore.Timestamp.fromMillis(
        Date.now() - rule.ageThresholdDays * 24 * 60 * 60 * 1000
      );

      let candidates;
      try {
        candidates = await db
          .collection(rule.collection)
          .where(rule.matchField, "==", rule.matchValue)
          .where(rule.ageField, "<=", cutoff)
          .get();
      } catch (err) {
        console.error(`scheduledAssetCleanup: query failed for rule ${ruleDoc.id}`, err);
        continue; // one bad/unindexed rule shouldn't block the others
      }

      for (const linkedDoc of candidates.docs) {
        const assetsSnap = await db
          .collection("externalAssets")
          .where("linkedDoc.collection", "==", rule.collection)
          .where("linkedDoc.docId", "==", linkedDoc.id)
          .get();

        for (const assetDoc of assetsSnap.docs) {
          try {
            await performAssetDeletion(assetDoc.id, creds);
          } catch (err) {
            console.error(`scheduledAssetCleanup: failed to purge ${assetDoc.id}`, err);
            // Keep sweeping — one failure shouldn't stop the rest.
          }
        }
      }
    }
  }
);
