const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { recordAssetCreated } = require("./lib/externalAssets");

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

// ---------- adminLog ----------
// Admin-only audit trail (docs/specs/admin-editing.md). Written ONLY here via
// the Admin SDK; firestore.rules lets admins read it and nobody write it.
// Entries expire through a Firestore TTL policy on expireAt (set per project
// in the console), createdAt + adminSettings/log.retentionDays (default 365).
const DEFAULT_LOG_RETENTION_DAYS = 365;
const LOG_TEXT_CAP = 2000;

function actorNameOf(auth) {
  return auth?.token?.name || auth?.token?.email || "Admin";
}

function capText(value) {
  return typeof value === "string" && value.length > LOG_TEXT_CAP ? value.slice(0, LOG_TEXT_CAP) : value;
}

async function logExpireAt(db) {
  let days = DEFAULT_LOG_RETENTION_DAYS;
  try {
    const settings = await db.collection("adminSettings").doc("log").get();
    const configured = settings.get("retentionDays");
    if (Number.isFinite(configured) && configured > 0) days = configured;
  } catch (err) {
    console.error("adminLog: couldn't read adminSettings/log, using the default retention", err);
  }
  return admin.firestore.Timestamp.fromMillis(Date.now() + days * 24 * 60 * 60 * 1000);
}

// feature: "bugZapper" | "featureLab" | "diskStash"; action: "edit" | "delete" | "purge".
// actorUid null + actorName "Automatic" for scheduled actions.
async function adminLogEntry(db, { feature, action, itemPath, itemTitle, actorUid, actorName, reason, changes, snapshot, details }) {
  const entry = {
    feature,
    action,
    itemPath,
    itemTitle: capText(itemTitle || ""),
    actorUid: actorUid ?? null,
    actorName: actorName || "Admin",
    reason: reason || "",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expireAt: await logExpireAt(db),
  };
  if (changes) entry.changes = changes;
  if (snapshot) entry.snapshot = snapshot;
  if (details) entry.details = details;
  return entry;
}

async function writeAdminLog(fields) {
  const db = admin.firestore();
  await db.collection("adminLog").add(await adminLogEntry(db, fields));
}

// Text snapshot for delete entries: only string fields, each capped.
function textSnapshot(data, fields) {
  const out = {};
  for (const f of fields) if (typeof data[f] === "string") out[f] = capText(data[f]);
  return out;
}

// ---------- Deleting an item without leaving orphans ----------
// Firestore never cascades a delete, so every item delete goes through a
// Cloud Function that removes, in this order:
//   1. the item's activityLog events (matched by feature + the id field the
//      event stores — feature-lab events carry requestId; bug-zapper has no
//      events today, but any future one must carry reportId to be cleaned)
//   2. the item doc AND every subcollection under it (recursiveDelete)
// Events go first so a retry after a partial failure still finds the item.
// Disk Stash's "asset_purged" events are deliberately NOT removed: they're
// the purge audit trail and store no linked doc id anyway.
// functions/scripts/find-orphans.js mirrors this ACTIVITY_LINKS map.
const ACTIVITY_LINKS = {
  featureRequests: { feature: "feature-lab", idField: "requestId" },
  bugReports: { feature: "bug-zapper", idField: "reportId" },
};

async function deleteActivityEvents(collectionName, docId) {
  const { feature, idField } = ACTIVITY_LINKS[collectionName];
  const db = admin.firestore();
  // Single-field equality (auto-indexed); feature is checked in code so no
  // composite index is needed.
  const snap = await db.collection("activityLog").where(idField, "==", docId).get();
  const refs = snap.docs.filter((d) => d.get("feature") === feature).map((d) => d.ref);
  for (let i = 0; i < refs.length; i += 500) {
    const batch = db.batch();
    refs.slice(i, i + 500).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
  return refs.length;
}

async function deleteItemCompletely(collectionName, docId) {
  const db = admin.firestore();
  const activityDeleted = await deleteActivityEvents(collectionName, docId);
  await db.recursiveDelete(db.collection(collectionName).doc(docId));
  return { activityDeleted };
}

// ---------- Bug Zapper: screenshot attach ----------
// See /features/bug-zapper/README.md for the full contract. No new trigger
// for "new bug report" activity is added here on purpose — per the Alert
// Center planning, a new bug report should eventually raise an Alert
// Center item (severity, reporter, link), NOT an activityLog event, but
// Alert Center doesn't exist yet. When it ships, add an
// onDocumentCreated("bugReports/{reportId}") trigger here, following
// whatever write convention Alert Center establishes (mirroring the
// activityLog convention comment at the top of this file).

/**
 * Callable from Bug Zapper's client right after a successful Cloudinary
 * upload. Records the asset in the shared externalAssets/storageUsage
 * collections (Disk Stash's contract) and sets screenshotUrl on the
 * bug report doc. This is the ONLY path that ever writes screenshotUrl —
 * Firestore rules refuse client writes to that field directly.
 */
exports.recordBugScreenshot = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }

  const { docId, url, publicId, sizeBytes, resourceType } = request.data || {};
  if (typeof docId !== "string" || !docId) {
    throw new HttpsError("invalid-argument", "docId is required.");
  }
  if (typeof url !== "string" || typeof publicId !== "string" || !Number.isFinite(sizeBytes)) {
    throw new HttpsError(
      "invalid-argument",
      "url, publicId and a numeric sizeBytes are required."
    );
  }

  const db = admin.firestore();
  const reportRef = db.collection("bugReports").doc(docId);
  const reportSnap = await reportRef.get();
  if (!reportSnap.exists) {
    throw new HttpsError("not-found", "No bug report with that id.");
  }
  const report = reportSnap.data();

  // Only the reporter who owns this report, or a real admin, may attach
  // a screenshot to it — otherwise any signed-in caller could attach an
  // image to someone else's report.
  const callerIsOwner = report.reporterUid === request.auth.uid;
  if (!callerIsOwner && !(await isCallerAdmin(request.auth))) {
    throw new HttpsError(
      "permission-denied",
      "You can only attach a screenshot to your own report."
    );
  }
  if (report.screenshotUrl) {
    throw new HttpsError("failed-precondition", "This report already has a screenshot.");
  }

  await recordAssetCreated({
    url,
    publicId,
    resourceType: resourceType || "image",
    feature: "bugZapper",
    sizeBytes,
    linkedCollection: "bugReports",
    linkedDocId: docId,
    linkedField: "screenshotUrl",
  });

  await reportRef.set({ screenshotUrl: url }, { merge: true });

  return { ok: true };
});

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
//
// options.clearLinkedField (default true): set false when the linked doc's
//   field no longer points at THIS asset (adminEditItem's replace, or its
//   rollback), so the doc's current URL isn't wiped.
// options.logActor: { uid, name } writes an adminLog "purge" entry (manual
//   purges and the scheduled sweep; name "Automatic", uid null). The entry
//   is logged against the linked item (e.g. bugReports/abc123, so it shows
//   in that item's Admin activity) when it still exists, else the file.
// options.cleanupRule: the cleanupRules doc behind an automatic purge,
//   recorded in the entry's details.
async function performAssetDeletion(assetId, cloudinaryCreds, options = {}) {
  const { clearLinkedField = true, logActor = null, cleanupRule = null } = options;
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

  // Step 2: only now touch Firestore. The linked doc is read first and only
  // updated if it still exists: a set()+merge on a doc that was deleted
  // independently would re-create it as an empty document (e.g. a blank
  // bug report in the list). If it's gone there's nothing left to orphan.
  const batch = db.batch();
  const { collection: linkedCollection, docId: linkedDocId, field: linkedField } =
    asset.linkedDoc || {};
  const linkedSnap = linkedCollection && linkedDocId
    ? await db.collection(linkedCollection).doc(linkedDocId).get()
    : null;
  if (clearLinkedField && linkedSnap?.exists && linkedField) {
    batch.update(linkedSnap.ref, { [linkedField]: admin.firestore.FieldValue.delete() });
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

  if (logActor) {
    let itemPath = `externalAssets/${assetId}`;
    let itemTitle = asset.publicId;
    if (linkedSnap?.exists) {
      itemPath = `${linkedCollection}/${linkedDocId}`;
      itemTitle = linkedSnap.get("title") || asset.publicId;
    }
    const details = {
      assetId,
      publicId: asset.publicId,
      sizeBytes: asset.sizeBytes || 0,
      assetFeature: asset.feature || "",
      linkedField: linkedField || "",
    };
    if (cleanupRule) {
      details.cleanupRule = {
        id: cleanupRule.id,
        collection: cleanupRule.collection || "",
        matchField: cleanupRule.matchField || "",
        matchValue: cleanupRule.matchValue ?? "",
        ageField: cleanupRule.ageField || "",
        ageThresholdDays: cleanupRule.ageThresholdDays ?? null,
      };
    }
    await writeAdminLog({
      feature: "diskStash",
      action: "purge",
      itemPath,
      itemTitle,
      actorUid: logActor.uid,
      actorName: logActor.name,
      details,
    });
  }

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
  return performAssetDeletion(
    assetId,
    {
      cloudName: CLOUDINARY_CLOUD_NAME.value(),
      apiKey: CLOUDINARY_API_KEY.value(),
      apiSecret: CLOUDINARY_API_SECRET.value(),
    },
    { logActor: { uid: request.auth.uid, name: actorNameOf(request.auth) } }
  );
});

// ---------- Bug Zapper: safe report deletion ----------
// Why this can't just be a client-side Firestore delete: if the report
// has a screenshot, deleting the bugReports doc directly would leave its
// Cloudinary asset (and its externalAssets record) orphaned — exactly
// the failure mode Disk Stash's safe-delete path exists to prevent. This
// function always cleans up the asset first (via the same
// performAssetDeletion used by Disk Stash's manual purge and scheduled
// sweep), and only deletes the report doc once that's done — or
// immediately, if there was never a screenshot to begin with.
//
// IMPORTANT: this requires the corresponding firestore.rules change
// (removing bugReports' old `allow delete: if isAdmin();` line) to
// actually be the ONLY delete path. The Admin SDK used here bypasses
// rules entirely, so this function keeps working either way; the rules
// change just closes off the unsafe direct-delete route for any future
// client code.
exports.deleteBugReport = onCall({ secrets: CLOUDINARY_SECRETS }, async (request) => {
  if (!(await isCallerAdmin(request.auth))) {
    throw new HttpsError("permission-denied", "Admins only.");
  }

  const reportId = request.data?.reportId;
  if (typeof reportId !== "string" || !reportId) {
    throw new HttpsError("invalid-argument", "reportId is required.");
  }

  const db = admin.firestore();
  const reportRef = db.collection("bugReports").doc(reportId);
  const reportSnap = await reportRef.get();
  if (!reportSnap.exists) {
    throw new HttpsError("not-found", "No bug report with that id.");
  }

  const creds = {
    cloudName: CLOUDINARY_CLOUD_NAME.value(),
    apiKey: CLOUDINARY_API_KEY.value(),
    apiSecret: CLOUDINARY_API_SECRET.value(),
  };

  // Find any externalAssets record(s) tied to this report (normally 0 or
  // 1 — a report only ever gets one screenshot today, but this handles
  // it defensively rather than assuming exactly one).
  const assetsSnap = await db
    .collection("externalAssets")
    .where("linkedDoc.collection", "==", "bugReports")
    .where("linkedDoc.docId", "==", reportId)
    .get();

  for (const assetDoc of assetsSnap.docs) {
    // Cloudinary delete + externalAssets/storageUsage cleanup first,
    // same safe path as Disk Stash's manual purge button. If this
    // throws, the report is NOT deleted, so nothing is left half-done.
    await performAssetDeletion(assetDoc.id, creds);
  }

  // Then the report, its comments (and any other subcollection), and its
  // activityLog events — see deleteItemCompletely above.
  const { activityDeleted } = await deleteItemCompletely("bugReports", reportId);

  const report = reportSnap.data();
  await writeAdminLog({
    feature: "bugZapper",
    action: "delete",
    itemPath: `bugReports/${reportId}`,
    itemTitle: report.title,
    actorUid: request.auth.uid,
    actorName: actorNameOf(request.auth),
    snapshot: textSnapshot(report, ["title", "whatHappened", "expectedInstead", "page", "stepsToReproduce", "severity", "status", "reporterName"]),
  });

  return { ok: true, activityDeleted };
});

// ---------- Feature Lab: request deletion ----------
// The only way to delete a feature request: firestore.rules refuses client
// deletes on featureRequests and its comments. Feature Lab has no uploads,
// so there are no externalAssets to clean up first.
exports.deleteFeatureRequest = onCall(async (request) => {
  if (!(await isCallerAdmin(request.auth))) {
    throw new HttpsError("permission-denied", "Admins only.");
  }

  const requestId = request.data?.requestId;
  if (typeof requestId !== "string" || !requestId) {
    throw new HttpsError("invalid-argument", "requestId is required.");
  }

  const reqSnap = await admin.firestore().collection("featureRequests").doc(requestId).get();
  if (!reqSnap.exists) {
    throw new HttpsError("not-found", "No feature request with that id.");
  }

  const { activityDeleted } = await deleteItemCompletely("featureRequests", requestId);

  const featureRequest = reqSnap.data();
  await writeAdminLog({
    feature: "featureLab",
    action: "delete",
    itemPath: `featureRequests/${requestId}`,
    itemTitle: featureRequest.title,
    actorUid: request.auth.uid,
    actorName: actorNameOf(request.auth),
    snapshot: textSnapshot(featureRequest, ["title", "description", "status", "requesterName"]),
  });

  return { ok: true, activityDeleted };
});

// ---------- Admin editing (docs/specs/admin-editing.md) ----------
// One generic callable: adminEditItem({ feature, id, changes, before, reason }).
// changes: { field: newValue } for allowlisted fields, plus (Bug Zapper)
//   screenshot: { action: "replace", url, publicId, sizeBytes, resourceType }
//             | { action: "remove" }
// before: the values the client loaded for every changed field (and
//   screenshotUrl when the screenshot changes) — the conflict check.
// Content fields can only change here: firestore.rules blocks them from the
// browser for everyone, so no edit can skip the adminLog entry.
// Limits match each collection's create rule.
const EDITABLE = {
  bugZapper: {
    collection: "bugReports",
    fields: {
      title: { label: "Title", min: 3, max: 200 },
      whatHappened: { label: "What happened", min: 1, max: 2000 },
      expectedInstead: { label: "What you expected", min: 0, max: 2000 },
      page: { label: "Page", min: 1, max: 300 },
      stepsToReproduce: { label: "Steps to reproduce", min: 0, max: 2000 },
      severity: { label: "How bad is it", oneOf: ["Cosmetic", "Minor", "Major", "Critical"] },
    },
    screenshot: { field: "screenshotUrl", assetFeature: "bugZapper" },
  },
  featureLab: {
    collection: "featureRequests",
    fields: {
      title: { label: "Title", min: 3, max: 200 },
      description: { label: "Description", min: 10, max: 2000 },
    },
  },
};

function editInvalid(field, message) {
  return new HttpsError("invalid-argument", message, { field });
}

function validateEditField(field, rule, value) {
  if (rule.oneOf) {
    if (!rule.oneOf.includes(value)) throw editInvalid(field, `${rule.label}: pick one of the listed options.`);
    return value;
  }
  if (typeof value !== "string") throw editInvalid(field, `${rule.label} must be text.`);
  const v = value.trim();
  if (v.length < rule.min || v.length > rule.max) {
    throw editInvalid(
      field,
      rule.min > 0
        ? `${rule.label} needs to be ${rule.min}–${rule.max.toLocaleString("en-US")} characters.`
        : `${rule.label} can be at most ${rule.max.toLocaleString("en-US")} characters.`
    );
  }
  return v;
}

function validateScreenshotChange(shot) {
  if (!shot || (shot.action !== "replace" && shot.action !== "remove")) {
    throw editInvalid("screenshot", "Screenshot change must be replace or remove.");
  }
  if (shot.action === "remove") return { action: "remove" };
  const { url, publicId, sizeBytes, resourceType = "image" } = shot;
  if (typeof url !== "string" || !url.startsWith("https://res.cloudinary.com/")) {
    throw editInvalid("screenshot", "The new screenshot must be a Cloudinary URL.");
  }
  if (typeof publicId !== "string" || !publicId || publicId.length > 300 || !Number.isFinite(sizeBytes) || sizeBytes < 0) {
    throw editInvalid("screenshot", "The new screenshot is missing its Cloudinary details.");
  }
  if (!["image", "video", "raw"].includes(resourceType)) throw editInvalid("screenshot", "Unknown screenshot type.");
  return { action: "replace", url, publicId, sizeBytes, resourceType };
}

const CONFLICT_MESSAGE = "This was changed while you were editing.";

function normalizeText(v) {
  return v ?? "";
}

// Throws "aborted" if any field the admin edited no longer matches what they loaded.
function checkEditConflict(data, before, fields, shotField) {
  for (const f of fields) {
    if (normalizeText(data[f]) !== normalizeText(before[f])) {
      throw new HttpsError("aborted", CONFLICT_MESSAGE, { reason: "conflict", field: f });
    }
  }
  if (shotField && (data[shotField] ?? null) !== (before[shotField] ?? null)) {
    throw new HttpsError("aborted", CONFLICT_MESSAGE, { reason: "conflict", field: "screenshot" });
  }
}

async function linkedAssetIds(db, collectionName, docId) {
  const snap = await db
    .collection("externalAssets")
    .where("linkedDoc.collection", "==", collectionName)
    .where("linkedDoc.docId", "==", docId)
    .get();
  return snap.docs.map((d) => d.id);
}

exports.adminEditItem = onCall({ secrets: CLOUDINARY_SECRETS }, async (request) => {
  // 1. Verify admin.
  if (!(await isCallerAdmin(request.auth))) {
    throw new HttpsError("permission-denied", "Admins only.");
  }
  const { feature, id, changes, before = {}, reason = "" } = request.data || {};
  const cfg = EDITABLE[feature];
  if (!cfg) throw new HttpsError("invalid-argument", "Unknown feature.");
  if (typeof id !== "string" || !id) throw new HttpsError("invalid-argument", "id is required.");
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
    throw new HttpsError("invalid-argument", "changes is required.");
  }
  if (!before || typeof before !== "object") throw new HttpsError("invalid-argument", "before is required.");

  let shot = null;
  if ("screenshot" in changes) {
    if (!cfg.screenshot) throw editInvalid("screenshot", "This item has no screenshot.");
    shot = validateScreenshotChange(changes.screenshot);
  }
  const shotField = shot ? cfg.screenshot.field : null;

  const db = admin.firestore();
  const ref = db.collection(cfg.collection).doc(id);
  const itemPath = `${cfg.collection}/${id}`;
  const creds = {
    cloudName: CLOUDINARY_CLOUD_NAME.value(),
    apiKey: CLOUDINARY_API_KEY.value(),
    apiSecret: CLOUDINARY_API_SECRET.value(),
  };

  // Replace: the client already uploaded the new file to Cloudinary (on
  // Save). Record it FIRST, so it's tracked by Disk Stash no matter what
  // happens next; every failure below rolls it back (Cloudinary + record).
  let newAssetId = null;
  if (shot && shot.action === "replace") {
    newAssetId = await recordAssetCreated({
      url: shot.url,
      publicId: shot.publicId,
      resourceType: shot.resourceType,
      feature: cfg.screenshot.assetFeature,
      sizeBytes: shot.sizeBytes,
      linkedCollection: cfg.collection,
      linkedDocId: id,
      linkedField: shotField,
    });
  }

  let changed = false;
  let oldAssetIds = [];
  try {
    if (typeof reason !== "string" || reason.trim().length > 300) {
      throw editInvalid("reason", "Reason can be at most 300 characters.");
    }
    if (shot && !(shotField in before)) {
      throw new HttpsError("invalid-argument", `before.${shotField} is required.`);
    }

    // 2. Validate each changed field against the allowlist + create-rule limits.
    const fieldValues = {};
    for (const [field, value] of Object.entries(changes)) {
      if (field === "screenshot") continue;
      const rule = cfg.fields[field];
      if (!rule) throw editInvalid(field, `${field} can't be edited.`);
      if (!(field in before)) throw new HttpsError("invalid-argument", `before.${field} is required.`);
      fieldValues[field] = validateEditField(field, rule, value);
    }
    const editedFields = Object.keys(fieldValues);

    // 3. Conflict pre-check (re-checked inside the transaction) and 5. no-op.
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError("not-found", "This item no longer exists.");
    const current = snap.data();
    checkEditConflict(current, before, editedFields, shotField);
    const textChanged = editedFields.some((f) => normalizeText(current[f]) !== fieldValues[f]);
    const shotChanged = !!shot && (shot.action === "replace" || !!current[shotField]);
    if (!textChanged && !shotChanged) return { ok: true, changed: false, warnings: [] };

    const oldShotUrl = shotField ? current[shotField] ?? null : null;
    if (shotChanged) {
      oldAssetIds = (await linkedAssetIds(db, cfg.collection, id)).filter((a) => a !== newAssetId);
    }

    // Remove: delete the old asset first (Cloudinary, then its record, then
    // the field). If Cloudinary refuses, nothing has changed yet.
    if (shotChanged && shot.action === "remove") {
      for (const assetId of oldAssetIds) await performAssetDeletion(assetId, creds);
      oldAssetIds = [];
    }

    // 4. One transaction: update the fields, editedAt, editCount, adminLog entry.
    const baseEntry = await adminLogEntry(db, {
      feature,
      action: "edit",
      itemPath,
      actorUid: request.auth.uid,
      actorName: actorNameOf(request.auth),
      reason: reason.trim(),
    });
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      if (!fresh.exists) throw new HttpsError("not-found", "This item no longer exists.");
      const data = fresh.data();
      // A remove already cleared the field above, so only a replace re-checks it.
      checkEditConflict(data, before, editedFields, shot?.action === "replace" ? shotField : null);

      const update = {};
      const logChanges = {};
      for (const f of editedFields) {
        const was = normalizeText(data[f]);
        if (was !== fieldValues[f]) {
          update[f] = fieldValues[f];
          logChanges[f] = { before: capText(was), after: capText(fieldValues[f]) };
        }
      }
      if (shotChanged) {
        // null, not a deleted field: firestore.rules compare this field.
        update[shotField] = shot.action === "replace" ? shot.url : null;
        logChanges[shotField] = { before: oldShotUrl, after: update[shotField] };
      }
      if (!Object.keys(logChanges).length) return;

      update.editedAt = admin.firestore.FieldValue.serverTimestamp();
      update.editCount = admin.firestore.FieldValue.increment(1);
      tx.update(ref, update);
      tx.set(db.collection("adminLog").doc(), {
        ...baseEntry,
        itemTitle: capText(update.title ?? data.title ?? ""),
        changes: logChanges,
      });
      changed = true;
    });
    if (newAssetId && !changed) throw new Error("Screenshot replace didn't apply.");
  } catch (err) {
    // The item never pointed at the new asset: remove it (Cloudinary +
    // record) without touching the item's current screenshotUrl.
    if (newAssetId) {
      await performAssetDeletion(newAssetId, creds, { clearLinkedField: false }).catch((e) =>
        console.error(`adminEditItem: couldn't roll back new asset ${newAssetId}`, e)
      );
    }
    throw err;
  }

  // Replace: only now remove the old asset(s). The item already points at
  // the new URL, so the linked field is left alone.
  const warnings = [];
  if (newAssetId) {
    for (const assetId of oldAssetIds) {
      try {
        await performAssetDeletion(assetId, creds, { clearLinkedField: false });
      } catch (e) {
        console.error(`adminEditItem: old asset ${assetId} wasn't removed`, e);
        warnings.push("The old screenshot couldn't be removed; purge it from Disk Stash.");
      }
    }
  }

  return { ok: true, changed, warnings };
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
            await performAssetDeletion(assetDoc.id, creds, {
              logActor: { uid: null, name: "Automatic" },
              cleanupRule: { id: ruleDoc.id, ...rule },
            });
          } catch (err) {
            console.error(`scheduledAssetCleanup: failed to purge ${assetDoc.id}`, err);
            // Keep sweeping — one failure shouldn't stop the rest.
          }
        }
      }
    }
  }
);
