// Mod Machina, shared server helpers: who is calling, the logs, and the mod role. Internal.
const { HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const L = require("./logic");
const { SITE_ID, paths } = require("./settings");

const fail = (code, message, reason, extra = {}) => new HttpsError(code, message, { reason, ...extra });
const ms = (v) => (v == null ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : null);

function makeStore({ db = admin.firestore(), adminLogEntry } = {}) {
  const { FieldValue, Timestamp } = admin.firestore;

  function requireAuth(request) {
    if (!request.auth) throw fail("unauthenticated", "Sign in first.", "signedOut");
    return request.auth.uid;
  }

  /** The caller as the server knows them (members doc, not claims): owner, admin, roles, roster and effective grade. */
  async function who(uid) {
    const [site, member, profile, roster] = await Promise.all([
      db.doc(`sites/${SITE_ID}`).get(), db.doc(`sites/${SITE_ID}/members/${uid}`).get(),
      db.doc(`sites/${SITE_ID}/profiles/${uid}`).get(), db.doc(paths.roster(uid)).get(),
    ]);
    const roles = member.exists ? member.get("roles") || [] : [];
    const isOwner = site.get("ownerUid") === uid;
    const r = roster.exists ? roster.data() : null;
    return {
      uid, isOwner, isAdmin: isOwner || roles.includes("admin"), isMod: roles.includes("mod"), roles,
      handle: profile.exists ? profile.get("handle") || null : null,
      name: profile.exists ? `@${profile.get("handle")}` : "Member",
      roster: r,
      // admins without a roster entry count as Sentinel-level for permission checks
      grade: r ? L.effectiveGrade(r) : (isOwner || roles.includes("admin") ? 4 : 0),
    };
  }
  const active = (w) => !!w.roster && ["active", "checkIn"].includes(w.roster.status) && w.isMod;
  /** Watcher or above (mod grade 2+ and in good standing), or an admin. */
  const watcherPlus = (w) => w.isAdmin || (active(w) && w.roster.track !== "admin" && w.grade >= 2);
  /** A2 Overseer or above on the admin ladder, or the owner. */
  const a2plus = (w) => w.isOwner || (w.isAdmin && w.roster?.track === "admin" && w.roster.grade >= 2);

  async function adminLog(w, { action, uid, title, reason = "", changes, details }) {
    await db.collection("adminLog").add(await adminLogEntry(db, {
      feature: "crew", action, itemPath: paths.roster(uid), itemTitle: title || uid,
      actorUid: w.uid, actorName: w.name, reason, changes, details,
    }));
  }
  async function activity(type, summary, actorName, extra = {}) {
    try {
      await db.collection("activityLog").add({ feature: "crew", type, summary, link: "/crew", actorName: actorName || null, ...extra, createdAt: FieldValue.serverTimestamp() });
    } catch (err) { console.error("crew: activityLog write failed", err); }
  }

  /** Adds or removes the "mod" role on members/{uid}; mirrorMemberRoles puts it in the claims. */
  async function setModRole(uid, on, by) {
    const ref = db.doc(`sites/${SITE_ID}/members/${uid}`);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw fail("not-found", "That member doesn't exist.", "noMember");
      const roles = new Set(snap.get("roles") || []);
      if (on) roles.add("mod"); else roles.delete("mod");
      tx.update(ref, { roles: [...roles].sort(), rolesChangedBy: { uid: by.uid, name: by.name }, rolesChangedAt: FieldValue.serverTimestamp() });
    });
  }

  /** Current public handles for some uids (the roster copy can go stale after a handle change). */
  async function handlesOf(uids) {
    if (!uids.length) return new Map();
    const snaps = await db.getAll(...uids.map((u) => db.doc(`sites/${SITE_ID}/profiles/${u}`)));
    return new Map(snaps.map((s, i) => [uids[i], s.exists ? s.get("handle") || null : null]));
  }

  const text = (v, max, { min = 0, field = "text" } = {}) => {
    const s = typeof v === "string" ? v.trim() : "";
    if (s.length < min || s.length > max) throw fail("invalid-argument", `${field} must be ${min ? `${min} to ` : "up to "}${max} characters.`, "field", { field });
    return s;
  };

  return { db, FieldValue, Timestamp, requireAuth, who, active, watcherPlus, a2plus, adminLog, activity, setModRole, handlesOf, text };
}

module.exports = { makeStore, fail, ms };
