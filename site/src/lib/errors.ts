// Friendly text for Firebase Auth errors and our callables' errors (callables
// send details.reason; see functions/lib/accounts/index.js).

const AUTH: Record<string, string> = {
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/invalid-credential": "That email and password don't match. If you signed up with Google or Twitch, use that button, or reset your password.",
  "auth/wrong-password": "That password doesn't match. Try again, or reset it.",
  "auth/user-disabled": "This account has been turned off. Contact support if that's a mistake.",
  "auth/too-many-requests": "Too many tries. Wait a minute and try again.",
  "auth/network-request-failed": "You seem to be offline. Check your connection and try again.",
  "auth/weak-password": "Use at least 8 characters for your password.",
  "auth/popup-blocked": "Your browser blocked the Google window.",
  "auth/account-exists-with-different-credential": "There's already an account with that email. Sign in the way you did before, then add this method from your account page.",
  "auth/credential-already-in-use": "That sign-in is already used by another account.",
  "auth/email-already-in-use": "That email already has an account. Sign in with it instead.",
  "auth/provider-already-linked": "That sign-in method is already on your account.",
  "auth/requires-recent-login": "For your security, sign out and back in, then try again.",
  "auth/invalid-action-code": "That link has expired or was already used. Ask for a new one.",
  "auth/expired-action-code": "That link has expired. Ask for a new one.",
  "auth/unauthorized-domain": "Sign-in isn't set up for this address yet.",
  "auth/operation-not-allowed": "That sign-in method isn't turned on yet.",
};

const REASONS: Record<string, string> = {
  under13: "You need to be 13 or older to create an account.",
  taken: "That handle is taken.",
  reserved: "That handle is reserved.",
  invalid: "Handles are 3 to 20 letters, numbers or underscores.",
  cooldown: "You can change your handle once every 30 days.",
  terms: "The terms have changed. Reload the page and try again.",
  linkedElsewhere: "That Twitch account is linked to another member.",
  emailInUse: "There's already an account with your Twitch email. Sign in the way you did before, then link Twitch from your account page.",
  lastMethod: "Add a password or Google first, so you can still sign in.",
};

/** The reason a callable gave (details.reason), if any. */
export function reasonOf(err: unknown): string | null {
  const d = (err as { details?: { reason?: unknown } })?.details;
  return typeof d?.reason === "string" ? d.reason : null;
}

export function messageFor(err: unknown, fallback = "Something went wrong. Try again."): string {
  const e = err as { code?: string; message?: string };
  const reason = reasonOf(err);
  if (e?.code === "bt/msg" && e.message) return e.message;   // our own, already written for people
  if (reason && REASONS[reason]) return REASONS[reason];
  if (e?.code && AUTH[e.code]) return AUTH[e.code];
  // Callable errors carry a message written for people (HttpsError in our functions).
  if (e?.code?.startsWith("functions/") && e.message && e.code !== "functions/internal") return e.message;
  console.error(err);
  return fallback;
}
