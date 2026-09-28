// One auth state store for the whole site (docs/specs/accounts.md "Client").
// Used by the header account area, the verify banner, the account page, the
// sign-in dialog, the home member strip and the footer game.
//
// Status:
//   loading      Firebase hasn't reported yet (the header shows a skeleton)
//   signedOut    nobody signed in
//   needsSignup  signed in, but the signup steps (birthday, handle, terms) aren't done
//   unverified   signed up; email not verified yet (or a Twitch account with no email)
//   verified     signed up with a verified email: community actions allowed
//
// Roles come from the ID token's custom claims { roles: { boomertanger: [...] } },
// mirrored from sites/{siteId}/members/{uid}.roles by a Cloud Function.
//
// <body> reflects the state for CSS: data-auth-state = status, and data-auth =
// visitor | member | admin. A real signed-in member always wins over the ?as=
// preview switch (non-production only); signed out, the preview stays as set.
import { onAuthStateChanged, onIdTokenChanged, signOut as fbSignOut, sendEmailVerification, type User } from "firebase/auth";
import { auth, SITE_ID } from "./firebase";

export type AuthStatus = "loading" | "signedOut" | "needsSignup" | "unverified" | "verified";

export interface Profile {
  handle: string;
  displayName: string;
  avatar?: { type: "initials" | "photo"; initials?: string; url?: string };
  joinedAt?: { toDate(): Date };
}
export interface Account {
  signedUpAt?: { toDate(): Date };
  ageBand?: "13-17" | "18+";
  prefs?: { showLinked?: boolean; useProviderPhoto?: boolean; reminders?: boolean };
  handleChangedAt?: { toDate(): Date };
  linked?: { twitch?: { id: string; login: string; displayName?: string } };
}
export interface AuthState {
  status: AuthStatus;
  user: User | null;
  profile: Profile | null;
  account: Account | null;
  roles: string[];
  isAdmin: boolean;
}

const EMPTY: AuthState = { status: "loading", user: null, profile: null, account: null, roles: [], isAdmin: false };
let state: AuthState = EMPTY;
const listeners = new Set<(s: AuthState) => void>();
const previewAuth = document.body.dataset.auth || "visitor";   // set by the ?as= switch before this runs

function publish(next: AuthState) {
  state = next;
  const b = document.body;
  b.dataset.authState = next.status;
  if (next.user && next.status !== "needsSignup") b.dataset.auth = next.isAdmin ? "admin" : "member";
  else if (next.user) b.dataset.auth = "visitor";
  else b.dataset.auth = previewAuth;
  listeners.forEach((fn) => { try { fn(next); } catch (err) { console.error(err); } });
}

/** Calls fn now with the current state and again on every change. Returns an unsubscribe. */
export function onAuth(fn: (s: AuthState) => void): () => void {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}
export const getAuthState = () => state;
/** Resolves with the first settled (non-loading) state. */
export function whenReady(): Promise<AuthState> {
  return new Promise((resolve) => {
    if (state.status !== "loading") return resolve(state);
    const off = onAuth((s) => { if (s.status !== "loading") { off(); resolve(s); } });
  });
}

let loadSeq = 0;
async function load(user: User | null, forceToken = false) {
  const seq = ++loadSeq;
  if (!user) return publish({ ...EMPTY, status: "signedOut" });
  let roles: string[] = [];
  let account: Account | null = null, profile: Profile | null = null, readOk = true;
  try {
    const token = await user.getIdTokenResult(forceToken);
    const claimed = (token.claims.roles as Record<string, unknown> | undefined)?.[SITE_ID];
    roles = Array.isArray(claimed) ? claimed.filter((r): r is string => typeof r === "string") : [];
  } catch (err) { console.error("auth: couldn't read the ID token", err); }
  try {
    const { db, doc, getDoc } = await import("./db");   // only once someone is signed in
    const [a, p] = await Promise.all([
      getDoc(doc(db, "users", user.uid)),
      getDoc(doc(db, "sites", SITE_ID, "profiles", user.uid)),
    ]);
    account = a.exists() ? (a.data() as Account) : null;
    profile = p.exists() ? (p.data() as Profile) : null;
  } catch (err) {
    readOk = false;
    console.error("auth: couldn't read the account", err);
  }
  if (seq !== loadSeq) return;   // a newer sign-in/out won
  // Only a confirmed missing signup sends someone to the signup steps; a failed
  // read keeps them signed in rather than asking them to sign up again.
  const needsSignup = readOk && !account?.signedUpAt;
  const status: AuthStatus = needsSignup ? "needsSignup" : user.emailVerified ? "verified" : "unverified";
  publish({ status, user, account, profile, roles, isAdmin: roles.includes("admin") });
}

/** Re-reads the member's docs (and optionally the token's claims), e.g. after a callable changed them. */
export function refresh({ forceToken = false } = {}) {
  return load(auth.currentUser, forceToken);
}

export async function signOut() {
  await fbSignOut(auth);
}

/** Sends the verification email; the link comes back to the account page. */
export async function sendVerification() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  await sendEmailVerification(user, { url: `${location.origin}/account` });
}

// Initials for an avatar: the first two letters of the display name (or handle).
export function initialsOf(p: Pick<Profile, "displayName" | "handle"> | null): string {
  const src = (p?.displayName || p?.handle || "?").replace(/[^\p{L}\p{N}]/gu, "");
  return (src.slice(0, 2) || "?").toUpperCase();
}

let started = false;
/** Starts listening to Firebase Auth (once per page). */
export function startAuth() {
  if (started) return;
  started = true;
  document.body.dataset.authState = "loading";
  onAuthStateChanged(auth, (user) => { load(user); });
  // New claims (e.g. a role change after a forced refresh) arrive as a token change.
  let lastUid: string | null = null;
  onIdTokenChanged(auth, (user) => {
    if (user && user.uid === lastUid && state.status !== "loading") {
      user.getIdTokenResult().then((t) => {
        const claimed = (t.claims.roles as Record<string, unknown> | undefined)?.[SITE_ID];
        const roles = Array.isArray(claimed) ? (claimed as string[]) : [];
        if (roles.join() !== state.roles.join()) publish({ ...state, roles, isAdmin: roles.includes("admin") });
      }).catch(() => {});
    }
    lastUid = user?.uid ?? null;
  });
  // Verified in another tab: pick it up when this one gets focus again.
  window.addEventListener("focus", async () => {
    const user = auth.currentUser;
    if (!user || state.status !== "unverified") return;
    try {
      await user.reload();
      if (user.emailVerified) { await user.getIdToken(true); await load(user); }
    } catch { /* offline; try on the next focus */ }
  });
}
