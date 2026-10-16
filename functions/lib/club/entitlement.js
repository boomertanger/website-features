// functions/lib/club/entitlement.js: the one place a member's Club Pass is worked out (docs/specs/club-pass.md §11, §12).
//
//   const E = makeEntitlement({ db, auth, now });
//   await E.recompute(uid, { by })   // -> { plan, changed, rolesChanged, legacy? } or null (not a site member)
//
// Sources live in sites/boomertanger/members/{uid}.club.sources, each written by its own part:
//   twitch  { tier, gifted, since }        the Twitch check, EventSub and the sweep (lib/club/twitch.js); removed when the sub ends
//   stripe  { kind: "sub" | "month", status, subscriptionId?, renewsAt?, endsAt?, cancelAt?, graceUntil?, monthEndsAt? }
//                                          lib/billing (the Stripe webhook and clubBillingSweep; docs/specs/club-pass.md §13). Gold while
//                                          a subscription is active or trialing, or past_due before graceUntil, or a one-month pass (or
//                                          monthEndsAt, a month bought alongside) before its end
//   gift { endsAt } (gifts, later)
//   grant   { by, note, at, until? }       functions/scripts/club-grant.js (the owner and testing)
//   crew    { grade }                      worked out HERE from the members doc's crewGrade / crewStatus (Mod Machina writes those):
//                                          on the crew and not Paused or Alumni
//   owner   {}                             worked out HERE: the member is sites/boomertanger.ownerUid. The owner's pass is always gold.
// Any live source makes the plan "sub" (Sub Club); none makes it "fan". recompute writes the summary in the §11 shape
//   club: { plan, sources, twitch: { linked, login?, sub?, tier?, gifted?, checkedAt? }, gifts: { given, received }, updatedAt }
// (club.twitch and club.gifts are kept as their writers left them; club.twitch is never made up here, so a missing one means "not
// checked yet", never "not linked": whether Twitch is linked is users/{uid}.linked.twitch, the same field Linked accounts reads), and keeps the "sub" role in the members doc in step, leaving every
// other role untouched. When the role changes it also sets the custom claims at once (the same merge mirrorMemberRoles does, so the
// site can refresh the ID token straight away); mirrorMemberRoles then runs as usual for the role tag and the adminLog entry.
// Legacy: a member with the old staging-only "sub" role and no club.sources yet is left alone (no write) until it becomes a grant
// (club-grant.js lists them).
const admin = require("firebase-admin");

const SITE_ID = "boomertanger";
const SOURCES = ["twitch", "stripe", "gift", "grant", "crew", "owner"];
const DERIVED = ["crew", "owner"];   // worked out here from other data, never stored by a writer
const BY = { uid: null, name: "Club Pass" };

const msOf = (v) => (v == null ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : null);
const crewActive = (m) => m.crewGrade != null && !["paused", "alumni"].includes(String(m.crewStatus || ""));
const stable = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));

/** Is a stored source still giving gold? (gift and grant can end; the others are removed by their writers when they end) */
/** Is a Stripe source giving gold at `at`? (docs/specs/club-pass.md §13) */
function stripeLive(s, at) {
  if (!s || s.ended) return false;
  if ((msOf(s.monthEndsAt) ?? 0) > at) return true;
  if (s.kind === "month") return (msOf(s.endsAt) ?? 0) > at;
  if (s.status === "active" || s.status === "trialing") return true;
  if (s.status === "past_due") return (msOf(s.graceUntil) ?? 0) > at;
  return false;
}

function live(key, s, at) {
  if (!s || typeof s !== "object") return false;
  if (key === "gift") return (msOf(s.endsAt) ?? 0) > at;
  if (key === "grant") return s.until == null || (msOf(s.until) ?? 0) > at;
  if (key === "stripe") return stripeLive(s, at);
  return true;
}

/**
 * Pure: the member doc's data -> { club, sub, legacy }. club is the new summary without updatedAt; sub whether the "sub" role belongs.
 */
function computeClub(member, at, { isOwner = false } = {}) {
  const old = member.club && typeof member.club === "object" ? member.club : null;
  const sources = {};
  for (const k of SOURCES) if (!DERIVED.includes(k) && old?.sources?.[k] && live(k, old.sources[k], at)) sources[k] = old.sources[k];
  if (crewActive(member)) sources.crew = { grade: member.crewGrade };
  if (isOwner) sources.owner = {};
  const sub = Object.keys(sources).length > 0;
  const legacy = !old?.sources && !sub && (member.roles || []).includes("sub");   // no source was ever written
  const club = { plan: sub ? "sub" : "fan", sources, gifts: old?.gifts || { given: 0, received: 0 } };
  if (old?.twitch && old.twitch.linked !== false) club.twitch = old.twitch;   // an old made-up { linked: false } is dropped
  return { club, sub, legacy };
}

function makeEntitlement({ db = admin.firestore(), auth = admin.auth(), now = Date.now } = {}) {
  const FieldValue = admin.firestore.FieldValue;
  const memberRef = (uid) => db.doc(`sites/${SITE_ID}/members/${uid}`);

  /** The same claims merge as lib/accounts mirrorMemberRoles: roles[site] replaced, everything else kept. */
  async function setRoleClaims(uid, roles) {
    let user;
    try { user = await auth.getUser(uid); } catch (err) { if (err.code === "auth/user-not-found") return; throw err; }
    const claims = { ...(user.customClaims || {}) };
    const roleMap = { ...(claims.roles || {}) };
    if (roles.length) roleMap[SITE_ID] = [...roles].sort(); else delete roleMap[SITE_ID];
    if (Object.keys(roleMap).length) claims.roles = roleMap; else delete claims.roles;
    await auth.setCustomUserClaims(uid, claims);
    await db.doc(`users/${uid}`).set({ claimsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }

  async function recompute(uid, { by = BY } = {}) {
    const at = now();
    const out = await db.runTransaction(async (tx) => {
      const [snap, site] = await Promise.all([tx.get(memberRef(uid)), tx.get(db.doc(`sites/${SITE_ID}`))]);
      if (!snap.exists) return null;
      const m = snap.data();
      const { club, sub, legacy } = computeClub(m, at, { isOwner: site.exists && site.get("ownerUid") === uid });
      if (legacy) return { plan: "sub", changed: false, rolesChanged: false, legacy: true, roles: m.roles || [] };
      const roles = new Set(m.roles || []);
      const hadSub = roles.has("sub");
      if (sub) roles.add("sub"); else roles.delete("sub");
      const rolesChanged = hadSub !== sub;
      const { updatedAt: _u, ...oldClub } = m.club || {};
      const changed = stable(oldClub) !== stable(club);
      if (!changed && !rolesChanged) return { plan: club.plan, changed: false, rolesChanged: false, roles: [...roles] };
      const patch = { club: { ...club, updatedAt: at } };
      if (rolesChanged) Object.assign(patch, { roles: [...roles].sort(), rolesChangedBy: by, rolesChangedAt: FieldValue.serverTimestamp() });
      tx.update(memberRef(uid), patch);
      return { plan: club.plan, changed, rolesChanged, roles: [...roles].sort() };
    });
    if (out?.rolesChanged) await setRoleClaims(uid, out.roles);
    return out;
  }

  /** Sets (on) or removes the grant source, then recomputes. Returns { before, after: recompute result } or null (no member). */
  async function setGrant(uid, { on, note = "", by = BY, until = null } = {}) {
    const ref = memberRef(uid), snap = await ref.get();
    if (!snap.exists) return null;
    const before = snap.get("club.sources.grant") || null;
    await ref.update({ "club.sources.grant": on ? { by: by.name, byUid: by.uid ?? null, note: String(note).slice(0, 200), at: now(), ...(until ? { until } : {}) } : FieldValue.delete() });
    return { before, after: await recompute(uid, { by }) };
  }

  return { recompute, setRoleClaims, setGrant };
}

module.exports = { makeEntitlement, computeClub, crewActive, stripeLive, SOURCES };
