const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();

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
