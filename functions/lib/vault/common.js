// Small helpers shared by the Game Vault callables, the editor and the stream trigger.
const { HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

const SITE_ID = "boomertanger";

/** HttpsError with details.reason, the same shape as lib/accounts and lib/arcade. */
const fail = (code, message, reason, extra = {}) => new HttpsError(code, message, { reason, ...extra });

/**
 * Who is calling, from the authoritative sources: the member doc's roles (what the custom
 * claims mirror, so a revoked role stops working at once, not when the token refreshes), the
 * site's ownerUid and the profile's handle. The owner counts as admin.
 *   verified: the sign-in's email is verified (a member with a verified email).
 *   member:   has finished signup (a profile with a handle).
 */
async function callerInfo(request) {
  if (!request.auth) throw fail("unauthenticated", "Sign in first.", "signedOut");
  const uid = request.auth.uid;
  const db = admin.firestore();
  const [site, member, profile] = await Promise.all([
    db.doc(`sites/${SITE_ID}`).get(),
    db.doc(`sites/${SITE_ID}/members/${uid}`).get(),
    db.doc(`sites/${SITE_ID}/profiles/${uid}`).get(),
  ]);
  const roles = member.exists ? member.get("roles") || [] : [];
  const isOwner = site.exists && site.get("ownerUid") === uid;
  const isAdmin = isOwner || roles.includes("admin");
  const isMod = roles.includes("mod");
  return {
    uid,
    handle: profile.exists ? profile.get("handle") || null : null,
    member: member.exists && profile.exists,
    verified: request.auth.token.email_verified === true,
    pausedUntil: member.exists ? member.get("vaultAddPausedUntil") || null : null,
    roles, isOwner, isAdmin, isMod, isStaff: isAdmin || isMod,
    name: profile.exists && profile.get("handle") ? `@${profile.get("handle")}` : request.auth.token.email || "Admin",
  };
}

/** A member with a verified email (or staff). Throws the reason the site shows otherwise. */
function requireVerifiedMember(c) {
  if (!c.member) throw fail("failed-precondition", "Finish signing up first.", "needsSignup");
  if (!c.verified && !c.isStaff) throw fail("failed-precondition", "Verify your email first.", "emailNotVerified");
  return c;
}

function requireStaff(c) {
  if (!c.isStaff) throw fail("permission-denied", "Mods and admins only.", "notStaff");
  return c;
}

function requireAdmin(c) {
  if (!c.isAdmin) throw fail("permission-denied", "Admins only.", "notAdmin");
  return c;
}

/** Error from a source client -> the error the site shows (members never see the word IGDB). */
function sourceError(err, SourceError) {
  if (err instanceof SourceError) {
    return fail("unavailable", err.kind === "down" ? "Try again in a few minutes." : "Search is having trouble. Paste a Steam link instead.", err.kind === "down" ? "allDown" : "igdbDown");
  }
  return err;
}

const str = (v, max) => (typeof v === "string" && v.length <= max ? v : null);

module.exports = { SITE_ID, fail, callerInfo, requireVerifiedMember, requireStaff, requireAdmin, sourceError, str };
