// Accounts (docs/specs/accounts.md "Server"; data model in docs/specs/foundation.md).
// Every document written here is written ONLY by these functions (Admin SDK);
// firestore.rules gives clients no write access to any of them.
//
//   users/{uid}                       account: signedUpAt, ageBand, terms, prefs, handleChangedAt, linked
//   users/{uid}/private/age           birthYear, birthMonth, adultAt (no client access at all)
//   handles/{handle}                  { uid }: handles are unique across the platform
//   sites/{siteId}/members/{uid}      roles, joinedAt, rolesChangedBy
//   sites/{siteId}/profiles/{uid}     public: handle, displayName, avatar, badges, platforms
//   platformLinks/twitch_{id}         { uid, login }: one Twitch account links to one site account
//
// Callable errors carry details.reason so the site can show the right message.
//
// index.js calls this factory with its adminLog helper and spreads the result
// into its exports, so the existing functions stay exactly where they are.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { defineSecret, defineString } = require("firebase-functions/params");
const admin = require("firebase-admin");
const v = require("./validate");

const SITE_ID = "boomertanger";
const TERMS_VERSION_FALLBACK = "2026-09-28";   // sites/{siteId}.termsVersion wins (seed-site.js copies it from site.json)
const HANDLE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
const ROLES = ["admin", "mod"];

// Twitch app (docs/specs/foundation.md "Values you need to supply"). The client ID
// is public: functions/.env. The secret is in Secret Manager:
//   firebase functions:secrets:set TWITCH_CLIENT_SECRET --project staging
const TWITCH_CLIENT_ID = defineString("TWITCH_CLIENT_ID");
const TWITCH_CLIENT_SECRET = defineSecret("TWITCH_CLIENT_SECRET");

// Where Twitch may send people back to, per Firebase project. The same URLs must
// be registered as OAuth Redirect URLs on the Twitch app.
const TWITCH_REDIRECTS = {
  "boomertanger-staging": [
    "http://localhost:4321/auth/twitch/callback",
    "https://staging.boomertanger.com/auth/twitch/callback",
  ],
  "boomertanger-prod": [
    // TODO: the production site's /auth/twitch/callback when it launches.
  ],
};

function projectId() {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  try { return JSON.parse(process.env.FIREBASE_CONFIG || "{}").projectId || ""; } catch { return ""; }
}

const fail = (code, message, reason, extra = {}) => new HttpsError(code, message, { reason, ...extra });

function requireAuth(request) {
  if (!request.auth) throw fail("unauthenticated", "Sign in first.", "signedOut");
  return request.auth.uid;
}

const sameRoles = (a, b) => [...(a || [])].sort().join() === [...(b || [])].sort().join();
const platformsFrom = (linked = {}) => (linked.twitch?.login ? { twitch: linked.twitch.login } : {});
const photoOf = (userRecord) => userRecord.photoURL || userRecord.providerData.find((p) => p.photoURL)?.photoURL || null;

module.exports = function accounts({ adminLogEntry }) {
  const db = admin.firestore();
  const auth = admin.auth();
  const FieldValue = admin.firestore.FieldValue;
  const Timestamp = admin.firestore.Timestamp;

  const refs = (uid) => ({
    user: db.doc(`users/${uid}`),
    age: db.doc(`users/${uid}/private/age`),
    member: db.doc(`sites/${SITE_ID}/members/${uid}`),
    profile: db.doc(`sites/${SITE_ID}/profiles/${uid}`),
  });

  // A free handle close to the one asked for, e.g. vexa -> vexa_13, vexa13, vexa_666.
  async function suggestHandle(base) {
    const stem = base.slice(0, 16).replace(/_+$/, "");
    const tries = [`${stem}_13`, `${stem}13`, `${stem}_666`, `${stem}_tv`, `${stem}_${Math.floor(Math.random() * 90 + 10)}`, `${stem}${Math.floor(Math.random() * 900 + 100)}`]
      .filter((h) => v.handleShape(h) === "ok");
    const snaps = await db.getAll(...tries.map((h) => db.doc(`handles/${h}`)));
    const free = snaps.findIndex((s) => !s.exists);
    return free >= 0 ? tries[free] : null;
  }

  // Removes everything a started-but-unfinished signup left behind (a Twitch link
  // record, the partial account doc, the Firebase Auth user), so an under-13 visitor
  // leaves nothing saved. Never touches an account that finished signing up.
  async function purgePreSignup(uid) {
    const user = await refs(uid).user.get();
    if (user.get("signedUpAt")) return false;
    const links = await db.collection("platformLinks").where("uid", "==", uid).get();
    const batch = db.batch();
    links.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(refs(uid).age);
    batch.delete(refs(uid).user);
    await batch.commit();
    await auth.deleteUser(uid).catch((err) => { if (err.code !== "auth/user-not-found") throw err; });
    return true;
  }

  async function currentTermsVersion() {
    const site = await db.doc(`sites/${SITE_ID}`).get();
    return site.get("termsVersion") || TERMS_VERSION_FALLBACK;
  }

  // ---------- checkHandle(handle) -> available | taken (+suggestion) | reserved | invalid ----------
  const checkHandle = onCall(async (request) => {
    const uid = requireAuth(request);
    const handle = v.normalizeHandle(request.data?.handle);
    const shape = v.handleShape(handle);
    if (shape !== "ok") return { status: shape, handle };
    const snap = await db.doc(`handles/${handle}`).get();
    if (!snap.exists || snap.get("uid") === uid) return { status: "available", handle };
    return { status: "taken", handle, suggestion: await suggestHandle(handle) };
  });

  // ---------- completeSignup ----------
  // Validates everything here (the dialog's checks are only a convenience). Under 13
  // throws before anything is written. Otherwise one transaction writes the handle,
  // account (+ private birth month/year), membership and public profile.
  const completeSignup = onCall(async (request) => {
    const uid = requireAuth(request);
    const d = request.data || {};
    const birthYear = d.birthYear, birthMonth = d.birthMonth, now = new Date();
    if (!v.validBirth(birthYear, birthMonth, now)) throw fail("invalid-argument", "Pick your birth month and year.", "birthday");
    const age = v.conservativeAge(birthYear, birthMonth, now);
    if (age < 13) {
      await purgePreSignup(uid);
      throw fail("failed-precondition", "You need to be 13 or older to create an account.", "under13");
    }

    const handle = v.normalizeHandle(d.handle);
    const shape = v.handleShape(handle);
    if (shape !== "ok") throw fail("invalid-argument", shape === "reserved" ? "That handle is reserved." : "Handles are 3 to 20 letters, numbers or underscores.", shape);
    const displayName = v.cleanDisplayName(d.displayName == null || d.displayName === "" ? handle : d.displayName);
    if (!displayName) throw fail("invalid-argument", "Display names are 1 to 30 characters.", "displayName");
    if (d.termsVersion !== await currentTermsVersion()) throw fail("failed-precondition", "The terms have changed. Reload the page and try again.", "terms");
    const reminders = d.reminders === true;

    const r = refs(uid), handleRef = db.doc(`handles/${handle}`);
    const stamp = Timestamp.fromDate(now);
    await db.runTransaction(async (tx) => {
      const [user, taken, member] = await Promise.all([tx.get(r.user), tx.get(handleRef), tx.get(r.member)]);
      if (user.get("signedUpAt")) throw fail("already-exists", "You've already finished signing up.", "signedUp");
      if (taken.exists && taken.get("uid") !== uid) throw fail("already-exists", `@${handle} is taken.`, "taken", { suggestion: await suggestHandle(handle) });
      tx.set(handleRef, { uid, createdAt: stamp });
      tx.set(r.user, {
        signedUpAt: stamp,
        ageBand: v.ageBand(age),
        terms: { version: d.termsVersion, acceptedAt: stamp },
        prefs: { showLinked: false, useProviderPhoto: false, reminders },
        handleChangedAt: stamp,
      }, { merge: true });
      tx.set(r.age, { birthYear, birthMonth, adultAt: Timestamp.fromMillis(v.adultAtMs(birthYear, birthMonth)) });
      tx.set(r.member, member.exists ? { joinedAt: member.get("joinedAt") || stamp } : { roles: [], joinedAt: stamp }, { merge: true });
      tx.set(r.profile, {
        handle, displayName,
        avatar: { type: "initials", initials: v.initialsOf(displayName) },
        badges: [], platforms: {}, joinedAt: stamp,   // linked platforms stay private until showLinked is on
      });
    });
    return { handle, displayName, ageBand: v.ageBand(age) };
  });

  // ---------- abandonSignup() ----------
  // The birthday step said under 13 (the site checks first, so the server never
  // sees the birthday): delete the half-made account and everything tied to it.
  const abandonSignup = onCall(async (request) => {
    const uid = requireAuth(request);
    return { removed: await purgePreSignup(uid) };
  });

  // ---------- changeHandle(handle): once every 30 days ----------
  const changeHandle = onCall(async (request) => {
    const uid = requireAuth(request);
    const handle = v.normalizeHandle(request.data?.handle);
    const shape = v.handleShape(handle);
    if (shape !== "ok") throw fail("invalid-argument", shape === "reserved" ? "That handle is reserved." : "Handles are 3 to 20 letters, numbers or underscores.", shape);
    const r = refs(uid), newRef = db.doc(`handles/${handle}`);
    return db.runTransaction(async (tx) => {
      const [user, profile, taken] = await Promise.all([tx.get(r.user), tx.get(r.profile), tx.get(newRef)]);
      if (!user.get("signedUpAt") || !profile.exists) throw fail("failed-precondition", "Finish signing up first.", "needsSignup");
      const old = profile.get("handle");
      if (old === handle) return { handle };
      const last = user.get("handleChangedAt")?.toMillis?.() || 0;
      if (Date.now() - last < HANDLE_COOLDOWN_MS) throw fail("failed-precondition", "You can change your handle once every 30 days.", "cooldown", { nextAt: last + HANDLE_COOLDOWN_MS });
      if (taken.exists && taken.get("uid") !== uid) throw fail("already-exists", `@${handle} is taken.`, "taken", { suggestion: await suggestHandle(handle) });
      const oldRef = old ? db.doc(`handles/${old}`) : null;
      const oldSnap = oldRef ? await tx.get(oldRef) : null;
      const now = Timestamp.now();
      if (oldSnap?.exists && oldSnap.get("uid") === uid) tx.delete(oldRef);
      tx.set(newRef, { uid, createdAt: now });
      tx.update(r.profile, { handle });
      tx.update(r.user, { handleChangedAt: now });
      return { handle };
    });
  });

  // ---------- updateProfile({ displayName }) ----------
  const updateProfile = onCall(async (request) => {
    const uid = requireAuth(request);
    const displayName = v.cleanDisplayName(request.data?.displayName);
    if (!displayName) throw fail("invalid-argument", "Display names are 1 to 30 characters.", "displayName");
    const r = refs(uid);
    const profile = await r.profile.get();
    if (!profile.exists) throw fail("failed-precondition", "Finish signing up first.", "needsSignup");
    const patch = { displayName };
    if (profile.get("avatar.type") !== "photo") patch.avatar = { type: "initials", initials: v.initialsOf(displayName) };
    await r.profile.update(patch);
    return { displayName };
  });

  // ---------- updatePrefs({ showLinked, useProviderPhoto, reminders }) ----------
  // Any subset of the three switches (all off by default). The public profile
  // follows: linked platform names only when showLinked is on, the provider photo
  // only when useProviderPhoto is on (initials otherwise).
  const PREFS = ["showLinked", "useProviderPhoto", "reminders"];
  const updatePrefs = onCall(async (request) => {
    const uid = requireAuth(request);
    const d = request.data || {};
    const keys = Object.keys(d);
    if (!keys.length || keys.some((k) => !PREFS.includes(k) || typeof d[k] !== "boolean")) {
      throw fail("invalid-argument", "Unknown setting.", "prefs");
    }
    const r = refs(uid);
    const [user, profile] = await Promise.all([r.user.get(), r.profile.get()]);
    if (!user.get("signedUpAt") || !profile.exists) throw fail("failed-precondition", "Finish signing up first.", "needsSignup");
    const userPatch = {}, profilePatch = {};
    keys.forEach((k) => { userPatch[`prefs.${k}`] = d[k]; });
    if ("showLinked" in d) profilePatch.platforms = d.showLinked ? platformsFrom(user.get("linked")) : {};
    let photo = null;
    if ("useProviderPhoto" in d) {
      photo = d.useProviderPhoto ? photoOf(await auth.getUser(uid)) : null;
      profilePatch.avatar = photo ? { type: "photo", url: photo } : { type: "initials", initials: v.initialsOf(profile.get("displayName")) };
    }
    const batch = db.batch();
    batch.update(r.user, userPatch);
    if (Object.keys(profilePatch).length) batch.update(r.profile, profilePatch);
    await batch.commit();
    return { ok: true, photo: !!photo };
  });

  // ---------- Twitch ----------
  // Authorization-code flow: the site sends people to id.twitch.tv (scope
  // "openid user:read:email", asking for email + email_verified in userinfo) and
  // Twitch returns them to /auth/twitch/callback with a code, which lands here.
  async function twitchUser(code, redirectUri) {
    const clientId = TWITCH_CLIENT_ID.value();
    const tokenRes = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      body: new URLSearchParams({ client_id: clientId, client_secret: TWITCH_CLIENT_SECRET.value(), code, grant_type: "authorization_code", redirect_uri: redirectUri }),
    });
    if (!tokenRes.ok) {
      console.error("twitchAuth: token exchange failed", tokenRes.status, await tokenRes.text().catch(() => ""));
      throw fail("permission-denied", "Twitch didn't accept that sign-in. Try again.", "twitchCode");
    }
    const { access_token: accessToken } = await tokenRes.json();
    const headers = { Authorization: `Bearer ${accessToken}` };
    try {
      const [usersRes, infoRes] = await Promise.all([
        fetch("https://api.twitch.tv/helix/users", { headers: { ...headers, "Client-Id": clientId } }),
        fetch("https://id.twitch.tv/oauth2/userinfo", { headers }),
      ]);
      const tw = usersRes.ok ? (await usersRes.json()).data?.[0] : null;
      if (!tw?.id) {
        console.error("twitchAuth: helix/users failed", usersRes.status);
        throw fail("unavailable", "Couldn't read your Twitch account. Try again.", "twitchUser");
      }
      // The email only counts when Twitch says it's verified (OIDC userinfo).
      let email = null;
      if (infoRes.ok) {
        const info = await infoRes.json();
        if (info.sub === tw.id && info.email_verified === true && typeof info.email === "string") email = info.email.toLowerCase();
      }
      return { id: String(tw.id), login: tw.login, displayName: tw.display_name || tw.login, email };
    } finally {
      // We only needed the token once; give it back.
      fetch("https://id.twitch.tv/oauth2/revoke", { method: "POST", body: new URLSearchParams({ client_id: clientId, token: accessToken }) }).catch(() => {});
    }
  }

  const twitchLinkData = (tw, now) => ({ id: tw.id, login: tw.login, displayName: tw.displayName, linkedAt: now });

  // twitchAuth({ code, redirectUri, mode: "signin" | "link" })
  //   signin -> { token } (a Firebase custom token for the linked or a new account)
  //   link   -> { linked: { platform, login } } (requires auth)
  const twitchAuth = onCall({ secrets: [TWITCH_CLIENT_SECRET] }, async (request) => {
    const { code, redirectUri, mode } = request.data || {};
    if (typeof code !== "string" || !code || code.length > 200) throw fail("invalid-argument", "Missing Twitch code.", "twitchCode");
    if (mode !== "signin" && mode !== "link") throw fail("invalid-argument", "Unknown mode.", "mode");
    if (!(TWITCH_REDIRECTS[projectId()] || []).includes(redirectUri)) throw fail("invalid-argument", "That return address isn't allowed.", "redirectUri");
    if (mode === "link") requireAuth(request);

    const tw = await twitchUser(code, redirectUri);
    const linkRef = db.doc(`platformLinks/twitch_${tw.id}`);
    const now = Timestamp.now();

    if (mode === "link") {
      const uid = request.auth.uid, r = refs(uid);
      await db.runTransaction(async (tx) => {
        const [link, user, profile] = await Promise.all([tx.get(linkRef), tx.get(r.user), tx.get(r.profile)]);
        if (link.exists && link.get("uid") !== uid) throw fail("already-exists", "That Twitch account is linked to another member.", "linkedElsewhere");
        const current = user.get("linked.twitch");
        if (current?.id && current.id !== tw.id) throw fail("failed-precondition", "Unlink your other Twitch account first.", "otherLinked");
        tx.set(linkRef, { uid, login: tw.login, linkedAt: now });
        tx.set(r.user, { linked: { twitch: twitchLinkData(tw, now) } }, { merge: true });
        if (profile.exists && user.get("prefs.showLinked") === true) tx.update(r.profile, { "platforms.twitch": tw.login });
      });
      return { linked: { platform: "twitch", login: tw.login } };
    }

    // signin: the linked account, or a brand-new one.
    let uid = (await linkRef.get()).get("uid") || null;
    if (uid) {
      try { await auth.getUser(uid); } catch (err) {
        if (err.code !== "auth/user-not-found") throw err;
        await linkRef.delete();   // the account was deleted; start fresh
        uid = null;
      }
    }
    if (!uid) {
      if (tw.email) {
        // Same email, second sign-in method: sign in the original way once, then
        // link Twitch from the account page (docs/specs/foundation.md "Edge cases").
        const existing = await auth.getUserByEmail(tw.email).catch((err) => { if (err.code === "auth/user-not-found") return null; throw err; });
        if (existing) throw fail("already-exists", "There's already an account with your Twitch email. Sign in the way you did before, then link Twitch from your account page.", "emailInUse");
      }
      const created = await auth.createUser(tw.email ? { email: tw.email, emailVerified: true } : {});
      try {
        uid = await db.runTransaction(async (tx) => {
          const link = await tx.get(linkRef);
          if (link.exists) return link.get("uid");   // a parallel sign-in won; use that account
          tx.set(linkRef, { uid: created.uid, login: tw.login, linkedAt: now });
          tx.set(refs(created.uid).user, { linked: { twitch: twitchLinkData(tw, now) }, createdVia: "twitch" }, { merge: true });
          return created.uid;
        });
      } catch (err) {
        await auth.deleteUser(created.uid).catch(() => {});
        throw err;
      }
      if (uid !== created.uid) await auth.deleteUser(created.uid).catch(() => {});
    } else {
      // Keep the stored login fresh (people rename on Twitch).
      const r = refs(uid);
      const batch = db.batch();
      batch.update(linkRef, { login: tw.login });
      batch.set(r.user, { linked: { twitch: { login: tw.login, displayName: tw.displayName } } }, { merge: true });
      const [user, profile] = await Promise.all([r.user.get(), r.profile.get()]);
      if (profile.exists && user.get("prefs.showLinked") === true) batch.update(r.profile, { "platforms.twitch": tw.login });
      await batch.commit();
    }
    return { token: await auth.createCustomToken(uid) };
  });

  // ---------- unlinkPlatform({ platform }) ----------
  // Deletes the link and the stored platform id. Refused when Twitch is the only
  // way into the account (add a password or Google first).
  const unlinkPlatform = onCall(async (request) => {
    const uid = requireAuth(request);
    if (request.data?.platform !== "twitch") throw fail("invalid-argument", "Only Twitch can be unlinked for now.", "platform");
    const record = await auth.getUser(uid);
    if (!record.providerData.length) throw fail("failed-precondition", "Add a password or Google first, so you can still sign in.", "lastMethod");
    const r = refs(uid);
    await db.runTransaction(async (tx) => {
      const [user, profile] = await Promise.all([tx.get(r.user), tx.get(r.profile)]);
      const id = user.get("linked.twitch.id");
      if (id) {
        const linkRef = db.doc(`platformLinks/twitch_${id}`);
        const link = await tx.get(linkRef);
        if (link.exists && link.get("uid") === uid) tx.delete(linkRef);
      }
      if (user.exists) tx.update(r.user, { "linked.twitch": FieldValue.delete() });
      if (profile.exists) tx.update(r.profile, { "platforms.twitch": FieldValue.delete() });
    });
    return { ok: true };
  });

  // ---------- signOutEverywhere() ----------
  // Revokes every refresh token; other devices are signed out within the hour
  // (when their current ID token expires).
  const signOutEverywhere = onCall(async (request) => {
    const uid = requireAuth(request);
    await auth.revokeRefreshTokens(uid);
    return { ok: true };
  });

  // ---------- setMemberRole({ uid, role, on }) ----------
  // Owner: everything, including admins. Admins: mods. The owner's admin role
  // can't be removed. The trigger below mirrors the change into custom claims and
  // writes the adminLog entry (with rolesChangedBy as the actor).
  const setMemberRole = onCall(async (request) => {
    const caller = requireAuth(request);
    const { uid: target, role, on } = request.data || {};
    if (typeof target !== "string" || !target || !ROLES.includes(role) || typeof on !== "boolean") {
      throw fail("invalid-argument", "uid, role (admin or mod) and on are required.", "args");
    }
    const [site, callerMember, callerProfile] = await Promise.all([
      db.doc(`sites/${SITE_ID}`).get(), refs(caller).member.get(), refs(caller).profile.get(),
    ]);
    const ownerUid = site.get("ownerUid") || null;
    const isOwner = caller === ownerUid;
    const isAdmin = isOwner || (callerMember.get("roles") || []).includes("admin");
    if (role === "admin" && !isOwner) throw fail("permission-denied", "Only the owner can change admins.", "notOwner");
    if (role === "mod" && !isAdmin) throw fail("permission-denied", "Only admins can change mods.", "notAdmin");
    if (target === ownerUid && role === "admin" && !on) throw fail("failed-precondition", "The owner can't be removed as admin.", "owner");
    const targetRef = refs(target).member;
    await db.runTransaction(async (tx) => {
      const member = await tx.get(targetRef);
      if (!member.exists) throw fail("not-found", "That member doesn't exist.", "noMember");
      const roles = new Set(member.get("roles") || []);
      if (on) roles.add(role); else roles.delete(role);
      tx.update(targetRef, {
        roles: [...roles].sort(),
        rolesChangedBy: { uid: caller, name: callerProfile.exists ? `@${callerProfile.get("handle")}` : (request.auth.token.email || "Member") },
        rolesChangedAt: FieldValue.serverTimestamp(),
      });
    });
    return { ok: true };
  });

  // ---------- mirror roles into custom claims ----------
  // sites/{siteId}/members/{uid}.roles -> claims { roles: { [siteId]: [...] } }, then
  // users/{uid}.claimsUpdatedAt so the site refreshes the member's ID token.
  const mirrorMemberRoles = onDocumentWritten("sites/{siteId}/members/{uid}", async (event) => {
    const { siteId, uid } = event.params;
    const before = event.data.before.exists ? (event.data.before.get("roles") || []) : [];
    const after = event.data.after.exists ? (event.data.after.get("roles") || []) : [];
    if (sameRoles(before, after)) return;

    let user;
    try { user = await auth.getUser(uid); } catch (err) {
      if (err.code === "auth/user-not-found") return;
      throw err;
    }
    const claims = { ...(user.customClaims || {}) };
    const roleMap = { ...(claims.roles || {}) };
    if (after.length) roleMap[siteId] = [...after].sort(); else delete roleMap[siteId];
    if (Object.keys(roleMap).length) claims.roles = roleMap; else delete claims.roles;
    await auth.setCustomUserClaims(uid, claims);
    await db.doc(`users/${uid}`).set({ claimsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });

    const actor = event.data.after.exists ? event.data.after.get("rolesChangedBy") : null;
    const profile = await db.doc(`sites/${siteId}/profiles/${uid}`).get();
    await db.collection("adminLog").add(await adminLogEntry(db, {
      feature: "accounts",
      action: "role",
      itemPath: `sites/${siteId}/members/${uid}`,
      itemTitle: profile.exists ? `@${profile.get("handle")}` : uid,
      actorUid: actor?.uid ?? null,
      actorName: actor?.name || "Automatic",
      changes: { roles: { before: [...before].sort(), after: [...after].sort() } },
    }));
  });

  return { checkHandle, completeSignup, abandonSignup, changeHandle, updateProfile, updatePrefs, twitchAuth, unlinkPlatform, signOutEverywhere, setMemberRole, mirrorMemberRoles };
};

module.exports.SITE_ID = SITE_ID;
module.exports.TERMS_VERSION_FALLBACK = TERMS_VERSION_FALLBACK;
