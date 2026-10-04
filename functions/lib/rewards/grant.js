// Trophy Room grants (docs/specs/rewards.md §9, §10): the ONLY code that writes badges, trophies
// and XP. Internal: features require() these; nothing here is callable from a browser.
//
//   grantXp(uid, amount, { feature, ref, reason, grantedBy })
//   grantBadge(uid, badgeId, { feature, ref, grantedBy, reason })
//   grantTrophy(uid, { kind, place, label, period, ref })
//   hasBadge(uid, badgeId)
//   revokeBadge(uid, badgeId, { grantedBy, reason })   (for the revokeBadge callable)
//
// Every grant writes sites/{siteId}/rewardLedger/{feature:ref:uid} in the same transaction as
// the reward; that doc already existing means "already paid", so the grant does nothing. A badge
// also adds its XP (supporter badges 0), gets serial = holders + 1 and bumps holders. XP moves the
// profile's xp, level and rank (logic.js). activityLog gets "badge-earned" (Uncommon and rarer)
// and "trophy-won". Results are { granted: true, … } or { granted: false, reason }, never a throw
// for "already paid" or "no such badge", so a feature's own work never fails because of rewards.
const admin = require("firebase-admin");
const L = require("./logic");

const SITE_ID = "boomertanger";
const FEATURE = "trophy-room";   // the activityLog feature key

function refs(db) {
  const site = db.doc(`sites/${SITE_ID}`);
  return {
    site,
    badge: (id) => site.collection("badges").doc(id),
    profile: (uid) => site.collection("profiles").doc(uid),
    member: (uid) => site.collection("members").doc(uid),
    owned: (uid, id) => site.collection("profiles").doc(uid).collection("badges").doc(id),
    trophy: (uid, id) => site.collection("profiles").doc(uid).collection("trophies").doc(id),
    ledger: (key) => site.collection("rewardLedger").doc(key),
  };
}
const ms = (v) => (v == null ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : null);
const safeId = (s) => String(s).replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 120);

/** The profile fields an XP change writes (xp, level, rank), and whether the level went up. */
function xpPatch(profile, add) {
  const before = L.progress(profile.get("xp") || 0);
  const after = L.progress(before.xp + add);
  return { patch: { xp: after.xp, level: after.level, rank: after.rank }, leveledUp: after.level > before.level, after };
}

async function postEvent(db, event) {
  try {
    await db.collection("activityLog").add({ ...event, createdAt: admin.firestore.FieldValue.serverTimestamp() });
  } catch (err) { console.error("rewards: activityLog write failed", err); }
}

function makeGrant({ db = admin.firestore() } = {}) {
  const R = refs(db);
  const { FieldValue, Timestamp } = admin.firestore;

  async function grantXp(uid, amount, { feature, ref, reason = "", grantedBy = null } = {}) {
    const n = Math.floor(Number(amount));
    if (!uid || !feature || ref == null) throw new Error("grantXp: uid, feature and ref are required");
    if (!(n > 0)) return { granted: false, reason: "noXp" };
    const key = L.ledgerKey(feature, ref, uid);
    return db.runTransaction(async (tx) => {
      const [ledger, profile] = await Promise.all([tx.get(R.ledger(key)), tx.get(R.profile(uid))]);
      if (ledger.exists) return { granted: false, reason: "paid" };
      if (!profile.exists) return { granted: false, reason: "noProfile" };
      const x = xpPatch(profile, n);
      tx.update(R.profile(uid), x.patch);
      tx.set(R.ledger(key), { uid, kind: "xp", amount: n, badgeId: null, feature, ref: String(ref), grantedBy, reason, createdAt: FieldValue.serverTimestamp() });
      return { granted: true, xp: x.after.xp, level: x.after.level, leveledUp: x.leveledUp };
    });
  }

  async function grantBadge(uid, badgeId, { feature, ref, grantedBy = null, reason = "" } = {}) {
    if (!uid || !badgeId || !feature) throw new Error("grantBadge: uid, badgeId and feature are required");
    const key = L.ledgerKey(feature, ref ?? `badge-${badgeId}`, uid);
    const now = Date.now();
    const out = await db.runTransaction(async (tx) => {
      const [ledger, badge, owned, profile, member] = await Promise.all([
        tx.get(R.ledger(key)), tx.get(R.badge(badgeId)), tx.get(R.owned(uid, badgeId)), tx.get(R.profile(uid)), tx.get(R.member(uid)),
      ]);
      if (ledger.exists) return { granted: false, reason: "paid" };
      if (owned.exists) return { granted: false, reason: "held" };
      if (!badge.exists) return { granted: false, reason: "noBadge" };
      if (!profile.exists) return { granted: false, reason: "noProfile" };
      const b = badge.data();
      if (!L.badgeOpen({ ...b, limited: b.limited ? { opensAt: ms(b.limited.opensAt), closesAt: ms(b.limited.closesAt) } : null }, now)) return { granted: false, reason: "closed" };
      const roles = member.exists ? member.get("roles") || [] : [];
      if (b.crewOnly && !roles.includes("mod") && !roles.includes("admin")) return { granted: false, reason: "crewOnly" };
      const xp = L.badgeXp(b);
      const serial = (b.holders || 0) + 1;
      tx.set(R.owned(uid, badgeId), { badgeId, earnedAt: Timestamp.fromMillis(now), serial, source: b.source || null, sourceRef: key });
      tx.update(R.badge(badgeId), { holders: serial });
      const x = xpPatch(profile, xp);
      if (xp > 0 || profile.get("level") == null) tx.update(R.profile(uid), x.patch);
      tx.set(R.ledger(key), { uid, kind: "badge", amount: xp, badgeId, feature, ref: String(ref ?? `badge-${badgeId}`), grantedBy, reason, createdAt: FieldValue.serverTimestamp() });
      return { granted: true, serial, xp, level: x.after.level, leveledUp: x.leveledUp, badge: b, handle: profile.get("handle") || null };
    });
    if (out.granted && out.badge.rarity >= 2) {
      await postEvent(db, {
        feature: FEATURE, type: "badge-earned",
        summary: `${out.handle ? `@${out.handle}` : "A member"} earned ${out.badge.name} (${L.RARITY_NAMES[out.badge.rarity]})`,
        link: "/trophies", actorName: out.handle ? `@${out.handle}` : null, badgeId, rarity: out.badge.rarity,
      });
    }
    if (out.granted) {
      // Fun Factory (type badges): every badge earned, with its collection and rarity. Lazy require:
      // the engine pays its own badges through this function.
      await require("../factory/record").recordFactoryEvent(uid, "badges", { action: "earn", badgeId, collection: out.badge.collection, rarity: out.badge.rarity }, `badge-${badgeId}`);
      delete out.badge;
    }
    return out;
  }

  async function grantTrophy(uid, { kind, place = null, label, period = null, ref } = {}) {
    if (!uid || !kind || !label || ref == null) throw new Error("grantTrophy: uid, kind, label and ref are required");
    const id = safeId(`${kind}-${ref}`);
    const key = L.ledgerKey("trophy", id, uid);
    const xp = L.trophyXp(place);
    const out = await db.runTransaction(async (tx) => {
      const [ledger, trophy, profile] = await Promise.all([tx.get(R.ledger(key)), tx.get(R.trophy(uid, id)), tx.get(R.profile(uid))]);
      if (ledger.exists || trophy.exists) return { granted: false, reason: "paid" };
      if (!profile.exists) return { granted: false, reason: "noProfile" };
      tx.set(R.trophy(uid, id), { kind, place, label, period, earnedAt: FieldValue.serverTimestamp() });
      const x = xpPatch(profile, xp);
      if (xp > 0) tx.update(R.profile(uid), x.patch);
      tx.set(R.ledger(key), { uid, kind: "trophy", amount: xp, badgeId: null, trophyId: id, feature: "trophy", ref: String(ref), grantedBy: null, reason: label, createdAt: FieldValue.serverTimestamp() });
      return { granted: true, trophyId: id, xp, level: x.after.level, leveledUp: x.leveledUp, handle: profile.get("handle") || null };
    });
    if (out.granted) {
      await postEvent(db, {
        feature: FEATURE, type: "trophy-won",
        summary: `${out.handle ? `@${out.handle}` : "A member"} won ${label}`,
        link: "/trophies", actorName: out.handle ? `@${out.handle}` : null, trophyKind: kind, place,
      });
    }
    return out;
  }

  async function hasBadge(uid, badgeId) {
    if (!uid || !badgeId) return false;
    return (await R.owned(uid, badgeId).get()).exists;
  }

  /** Takes a badge back: removes it and its XP, writes a reversal ledger entry, lowers holders, unpins it. */
  async function revokeBadge(uid, badgeId, { grantedBy = null, reason = "" } = {}) {
    const now = Date.now();
    return db.runTransaction(async (tx) => {
      const [owned, badge, profile] = await Promise.all([tx.get(R.owned(uid, badgeId)), tx.get(R.badge(badgeId)), tx.get(R.profile(uid))]);
      if (!owned.exists) return { revoked: false, reason: "notHeld" };
      const original = owned.get("sourceRef") ? await tx.get(R.ledger(owned.get("sourceRef"))) : null;
      const xp = original?.exists ? original.get("amount") || 0 : L.badgeXp(badge.exists ? badge.data() : null);
      tx.delete(R.owned(uid, badgeId));
      if (badge.exists) tx.update(R.badge(badgeId), { holders: Math.max(0, (badge.get("holders") || 0) - 1) });
      if (profile.exists) {
        const p = L.progress(Math.max(0, (profile.get("xp") || 0) - xp));
        const showcase = (profile.get("showcase") || []).filter((x) => x !== badgeId);
        const featured = profile.get("featuredBadge") === badgeId ? showcase[0] || null : profile.get("featuredBadge") ?? null;
        tx.update(R.profile(uid), { xp: p.xp, level: p.level, rank: p.rank, showcase, featuredBadge: featured });
      }
      tx.set(R.ledger(L.ledgerKey("revoke", `${badgeId}-${now}`, uid)), { uid, kind: "badge-revoke", amount: -xp, badgeId, feature: "revoke", ref: `${badgeId}-${now}`, grantedBy, reason, createdAt: FieldValue.serverTimestamp() });
      return { revoked: true, xp, badgeName: badge.exists ? badge.get("name") : badgeId };
    });
  }

  return { grantXp, grantBadge, grantTrophy, hasBadge, revokeBadge, refs: R };
}

// The default instance, for features that just need to pay out (lazy, after initializeApp).
let shared = null;
const get = () => (shared ||= makeGrant());
module.exports = {
  makeGrant, SITE_ID, FEATURE,
  grantXp: (...a) => get().grantXp(...a),
  grantBadge: (...a) => get().grantBadge(...a),
  grantTrophy: (...a) => get().grantTrophy(...a),
  hasBadge: (...a) => get().hasBadge(...a),
  revokeBadge: (...a) => get().revokeBadge(...a),
};
