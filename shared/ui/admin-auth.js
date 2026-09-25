// shared/ui/admin-auth.js — shared admin identity flow.
//
// Extracted verbatim from the identical admin code in Bug Zapper and
// Feature Lab: every member gets a silent Firebase Anonymous session so
// they can write (vote, comment, submit); a real admin signs in with
// Google, which is re-verified server-side on every auth transition via
// the syncAdminStatus Cloud Function (checks the signed-in email against
// adminAllowlist and mirrors the result into admins/{uid}, which
// firestore.rules trusts for writes — the client-side isAdmin flag below
// is a UI convenience only, never the real security boundary).
//
// initAdminAuth({ auth, functions, onChange }) wires onAuthStateChanged
// once and returns { signIn, signOut }. onChange({ user, isAdmin }) fires
// on every auth transition, including the initial anonymous sign-in, so
// each feature decides what to do with it — update its own admin UI,
// capture user.uid for its own identity-keyed fields, subscribe to its
// collection once, etc.
import {
  onAuthStateChanged,
  signInAnonymously,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js";

export function initAdminAuth({ auth, functions, onChange = () => {} }) {
  async function syncAdmin(user) {
    let isAdmin = false;
    try {
      const syncAdminStatus = httpsCallable(functions, "syncAdminStatus");
      const result = await syncAdminStatus();
      isAdmin = !!result.data?.isAdmin;
    } catch (err) {
      console.error("Failed to sync admin status", err);
    }
    onChange({ user, isAdmin });
  }

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      // No session yet — sign in anonymously so members can write. This
      // re-triggers onAuthStateChanged with the anonymous user.
      signInAnonymously(auth).catch((err) => console.error("Anonymous sign-in failed", err));
      return;
    }

    if (user.isAnonymous) {
      onChange({ user, isAdmin: false });
      return;
    }

    // A real (Google) session, fresh or persisted from a previous visit —
    // re-verify against the allowlist rather than trusting the cache.
    await syncAdmin(user);
  });

  async function signIn() {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      await syncAdmin(auth.currentUser);
    } catch (err) {
      console.error("Admin sign-in failed", err);
    }
  }

  async function signOut() {
    try {
      // Signs out of the real (Google) Firebase session entirely.
      // onAuthStateChanged fires with user=null and automatically falls
      // back to a fresh anonymous session, same as a first-time visitor.
      await firebaseSignOut(auth);
      onChange({ user: null, isAdmin: false });
    } catch (err) {
      console.error("Admin sign-out failed", err);
    }
  }

  return { signIn, signOut };
}
