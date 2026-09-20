const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
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
