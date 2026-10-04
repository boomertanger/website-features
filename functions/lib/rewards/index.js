// Trophy Room (rewards) Cloud Functions (docs/specs/rewards.md §10). Paths under
// sites/boomertanger/ (§9):
//   badges/{badgeId}                      the catalog (seed: scripts/seed-badges.js); holders, pctHeld
//   collections/{id}                      the nine collections
//   profiles/{uid}                        + xp, level, rank, showcase [badgeIds], featuredBadge, persona
//   profiles/{uid}/badges/{badgeId}       badgeId, earnedAt, serial, source, sourceRef (public)
//   profiles/{uid}/trophies/{trophyId}    kind, place, label, period, earnedAt (public)
//   rewardLedger/{feature:ref:uid}        every grant (closed to clients)
// Everything is written through lib/rewards/grant.js or these functions; no client writes.
//
//   setShowcase({ badgeIds })            pin up to 3 held badges (6 for Sub Club and crew)
//   setPersona({ persona })              Gamer, Viewer, Lurker, Streamer, Creator (Liker, Gifter later)
//   myRewardHistory({ cursor })          the member's own ledger, 25 at a time
//   awardBadge({ uid, badgeId, reason }) admins (mods with Mod Machina): reason, no self-awards, 20 a day
//   revokeBadge({ uid, badgeId, reason }) admins: removes the badge and its XP
//   rewardsLinkedAccounts                users/{uid} trigger: The Multistream Nomad (Twitch + YouTube + TikTok)
//   rewardsNightly                       03:00 America/Chicago: holders and pctHeld, bury closed limited
//                                        badges, The Pilgrim / The Elder, Founder (when flags.founderStart is set)
const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const L = require("./logic");
const { makeGrant, SITE_ID } = require("./grant");
const factory = require("../factory/record");   // Fun Factory profile event: persona

const TZ = "America/Chicago";
const PAGE = 25;
const AWARDS_PER_DAY = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const fail = (code, message, reason, extra = {}) => new HttpsError(code, message, { reason, ...extra });
const isStaging = () => (process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "").includes("staging");
const ms = (v) => (v == null ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : null);
/** "2026-10-04" in Central time (the award cap resets at midnight there). */
const dayKey = (now) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));

module.exports = function rewards({ adminLogEntry }) {
  const db = admin.firestore();
  const { FieldValue, Timestamp } = admin.firestore;
  const G = makeGrant({ db });
  const site = db.doc(`sites/${SITE_ID}`);
  const profiles = site.collection("profiles");
  const badges = site.collection("badges");

  async function caller(request) {
    if (!request.auth) throw fail("unauthenticated", "Sign in first.", "signedOut");
    const uid = request.auth.uid;
    const [s, member, profile] = await Promise.all([site.get(), site.collection("members").doc(uid).get(), profiles.doc(uid).get()]);
    const roles = member.exists ? member.get("roles") || [] : [];
    const isOwner = s.exists && s.get("ownerUid") === uid;
    return {
      uid, roles, isOwner, isAdmin: isOwner || roles.includes("admin"), profile,
      name: profile.exists && profile.get("handle") ? `@${profile.get("handle")}` : request.auth.token.email || "Admin",
    };
  }
  const requireMember = (c) => { if (!c.profile.exists) throw fail("failed-precondition", "Finish signing up first.", "needsSignup"); return c; };
  const requireAdmin = (c) => { if (!c.isAdmin) throw fail("permission-denied", "Only admins can do that for now.", "notAdmin"); return c; };

  // ---------- setShowcase({ badgeIds }) ----------
  const setShowcase = onCall(async (request) => {
    const c = requireMember(await caller(request));
    const ids = request.data?.badgeIds;
    const limit = L.showcaseLimit({ roles: c.roles, isOwner: c.isOwner, staging: isStaging() });
    const held = new Set();
    if (Array.isArray(ids) && ids.length && ids.length <= 20 && ids.every((x) => typeof x === "string" && x && x.length <= 80)) {
      const snaps = await db.getAll(...[...new Set(ids)].map((id) => profiles.doc(c.uid).collection("badges").doc(id)));
      snaps.forEach((s) => { if (s.exists) held.add(s.id); });
    }
    const r = L.checkShowcase(ids, { held, limit });
    if (!r.ok) {
      const msg = { args: "Pick up to a few of your badges.", duplicate: "A badge can only be pinned once.", tooMany: `You can pin ${limit} badges.`, notHeld: "You can only pin badges you hold." }[r.reason];
      throw fail("invalid-argument", msg, r.reason, { limit });
    }
    await profiles.doc(c.uid).update({ showcase: r.ids, featuredBadge: r.ids[0] || null });
    return { ok: true, showcase: r.ids, limit };
  });

  // ---------- setPersona({ persona }) ----------
  const setPersona = onCall(async (request) => {
    const c = requireMember(await caller(request));
    const r = L.checkPersona(request.data?.persona ?? null);
    if (!r.ok) throw fail("invalid-argument", r.reason === "locked" ? "That persona isn't unlocked yet." : "Pick Gamer, Viewer, Lurker, Streamer or Creator.", r.reason);
    await profiles.doc(c.uid).update({ persona: r.persona });
    if (r.persona) await factory.recordFactoryEvent(c.uid, "profile", { action: "persona" }, "persona");
    return { ok: true, persona: r.persona };
  });

  // ---------- myRewardHistory({ cursor }) ----------
  const myRewardHistory = onCall(async (request) => {
    const c = requireMember(await caller(request));
    const cursor = request.data?.cursor;
    let q = site.collection("rewardLedger").where("uid", "==", c.uid).orderBy("createdAt", "desc").limit(PAGE + 1);
    if (typeof cursor === "string" && cursor) {
      const after = await site.collection("rewardLedger").doc(cursor).get();
      if (!after.exists || after.get("uid") !== c.uid) throw fail("invalid-argument", "That page has expired. Start again.", "cursor");
      q = q.startAfter(after);
    }
    const snap = await q.get();
    const docs = snap.docs.slice(0, PAGE);
    const badgeIds = [...new Set(docs.map((d) => d.get("badgeId")).filter(Boolean))];
    const names = new Map();
    if (badgeIds.length) (await db.getAll(...badgeIds.map((id) => badges.doc(id)))).forEach((b) => { if (b.exists) names.set(b.id, { name: b.get("name"), rarity: b.get("rarity"), emoji: b.get("emoji") || null }); });
    const items = docs.map((d) => {
      const x = d.data();
      return { id: d.id, kind: x.kind, amount: x.amount || 0, badgeId: x.badgeId || null, badge: x.badgeId ? names.get(x.badgeId) || null : null, trophyId: x.trophyId || null, feature: x.feature, reason: x.reason || "", createdAt: ms(x.createdAt) };
    });
    return { ok: true, items, cursor: snap.docs.length > PAGE ? docs[docs.length - 1].id : null };
  });

  // ---------- awardBadge({ uid, badgeId, reason }) ----------
  const awardBadge = onCall(async (request) => {
    const c = requireAdmin(await caller(request));
    const { uid, badgeId } = request.data || {};
    const reason = L.checkReason(request.data?.reason);
    if (typeof uid !== "string" || !uid || typeof badgeId !== "string" || !badgeId) throw fail("invalid-argument", "uid and badgeId are required.", "args");
    if (!reason) throw fail("invalid-argument", "Write a reason of 10 to 300 characters.", "reason");
    if (uid === c.uid) throw fail("permission-denied", "You can't award a badge to yourself.", "self");
    const [badge, target] = await Promise.all([badges.doc(badgeId).get(), profiles.doc(uid).get()]);
    if (!badge.exists) throw fail("not-found", "That badge doesn't exist.", "noBadge");
    if (!target.exists) throw fail("not-found", "That member doesn't exist.", "noMember");
    const no = L.canAward(badge.data(), c);
    if (no) throw fail("permission-denied", { notActive: "That badge isn't active.", notAwardable: "That badge is earned, not awarded.", ownerOnly: "Only the owner can award that badge.", notAdmin: "Only admins can award badges for now." }[no], no);
    // 20 awards a day per admin (Central time).
    const capRef = site.collection("rateLimits").doc(`rewardsAward_${c.uid}_${dayKey(Date.now())}`);
    const allowed = await db.runTransaction(async (tx) => {
      const s = await tx.get(capRef);
      const n = s.exists ? s.get("count") || 0 : 0;
      if (n >= AWARDS_PER_DAY) return false;
      tx.set(capRef, { count: n + 1, expireAt: Timestamp.fromMillis(Date.now() + 2 * DAY_MS) }, { merge: true });
      return true;
    });
    if (!allowed) throw fail("resource-exhausted", `You can award ${AWARDS_PER_DAY} badges a day.`, "awardLimit");
    const awardId = crypto.randomBytes(8).toString("hex");
    const r = await G.grantBadge(uid, badgeId, { feature: "award", ref: awardId, grantedBy: c.uid, reason });
    if (!r.granted) {
      await capRef.set({ count: FieldValue.increment(-1) }, { merge: true });   // not used
      const msg = { held: "They already hold that badge.", crewOnly: "That badge is for crew only.", closed: "That badge's window is closed.", noProfile: "That member hasn't finished signing up." }[r.reason] || "That badge couldn't be awarded.";
      throw fail("failed-precondition", msg, r.reason);
    }
    await db.collection("adminLog").add(await adminLogEntry(db, {
      feature: "rewards", action: "rewardsAward", itemPath: `sites/${SITE_ID}/profiles/${uid}/badges/${badgeId}`,
      itemTitle: `${badge.get("name")} to @${target.get("handle") || uid}`, actorUid: c.uid, actorName: c.name, reason,
      details: { badgeId, uid, serial: r.serial, xp: r.xp, awardId },
    }));
    return { ok: true, serial: r.serial, xp: r.xp };
  });

  // ---------- revokeBadge({ uid, badgeId, reason }) ----------
  const revokeBadge = onCall(async (request) => {
    const c = requireAdmin(await caller(request));
    const { uid, badgeId } = request.data || {};
    const reason = L.checkReason(request.data?.reason);
    if (typeof uid !== "string" || !uid || typeof badgeId !== "string" || !badgeId) throw fail("invalid-argument", "uid and badgeId are required.", "args");
    if (!reason) throw fail("invalid-argument", "Write a reason of 10 to 300 characters.", "reason");
    const r = await G.revokeBadge(uid, badgeId, { grantedBy: c.uid, reason });
    if (!r.revoked) throw fail("failed-precondition", "They don't hold that badge.", r.reason);
    const target = await profiles.doc(uid).get();
    await db.collection("adminLog").add(await adminLogEntry(db, {
      feature: "rewards", action: "rewardsRevoke", itemPath: `sites/${SITE_ID}/profiles/${uid}/badges/${badgeId}`,
      itemTitle: `${r.badgeName} from @${target.get("handle") || uid}`, actorUid: c.uid, actorName: c.name, reason,
      details: { badgeId, uid, xp: -r.xp },
    }));
    return { ok: true, xp: r.xp };
  });

  // ---------- The Multistream Nomad: Twitch, YouTube and TikTok all linked ----------
  // Watches users/{uid}.linked, so it pays out as soon as the third platform links (today only
  // Twitch can be linked; YouTube and TikTok linking land with their own workstreams).
  const rewardsLinkedAccounts = onDocumentWritten("users/{uid}", async (event) => {
    if (!event.data.after.exists) return;
    const linked = event.data.after.get("linked") || {};
    const all = ["twitch", "youtube", "tiktok"].every((p) => linked[p] && (linked[p].id || linked[p].login || linked[p].channelId || linked[p].handle));
    if (!all) return;
    const before = event.data.before.exists ? event.data.before.get("linked") || {} : {};
    if (["twitch", "youtube", "tiktok"].every((p) => before[p])) return;   // not new
    const r = await G.grantBadge(event.params.uid, "multistream-nomad", { feature: "accounts", ref: "multistream-nomad" });
    if (!r.granted && !["paid", "held"].includes(r.reason)) console.log(`rewardsLinkedAccounts: not granted (${r.reason})`);
  });

  // ---------- rewardsNightly (03:00 America/Chicago) ----------
  const rewardsNightly = onSchedule({ schedule: "every day 03:00", timeZone: TZ, timeoutSeconds: 540 }, async () => {
    const now = Date.now();
    const s = await site.get();
    const membersCount = (await profiles.count().get()).data().count;
    const all = await badges.get();
    let buried = 0, recounted = 0;
    for (const b of all.docs) {
      const holders = (await db.collectionGroup("badges").where("badgeId", "==", b.id).count().get()).data().count;
      const pctHeld = membersCount ? Math.round((holders / membersCount) * 1000) / 10 : 0;
      const patch = {};
      if (b.get("holders") !== holders) patch.holders = holders;
      if (b.get("pctHeld") !== pctHeld) patch.pctHeld = pctHeld;
      const closesAt = ms(b.get("limited")?.closesAt);
      if (b.get("status") === "active" && closesAt != null && closesAt <= now) { patch.status = "buried"; patch.buriedAt = Timestamp.fromMillis(now); buried++; }
      if (Object.keys(patch).length) { await b.ref.update(patch); recounted++; }
    }
    // The Pilgrim (1 year) and The Elder (3 years), from profiles.joinedAt.
    let paid = 0;
    for (const [badgeId, days] of L.MEMBERSHIP_BADGES) {
      const cutoff = Timestamp.fromMillis(now - days * DAY_MS);
      const snap = await profiles.where("joinedAt", "<=", cutoff).select().get();
      for (const p of snap.docs) {
        if (await G.hasBadge(p.id, badgeId)) continue;
        const r = await G.grantBadge(p.id, badgeId, { feature: "membership", ref: badgeId });
        if (r.granted) paid++;
      }
    }
    // Founder: only once sites/{siteId}.flags.founderStart is set (off until the launch date is decided).
    const founderStart = ms(s.get("flags")?.founderStart);
    if (founderStart) {
      const snap = await profiles.where("joinedAt", ">=", Timestamp.fromMillis(founderStart)).where("joinedAt", "<", Timestamp.fromMillis(founderStart + L.FOUNDER_WINDOW_DAYS * DAY_MS)).select().get();
      for (const p of snap.docs) {
        if (await G.hasBadge(p.id, "founder")) continue;
        const r = await G.grantBadge(p.id, "founder", { feature: "membership", ref: "founder" });
        if (r.granted) paid++;
      }
    }
    console.log(`rewardsNightly: ${all.size} badges (${recounted} updated, ${buried} buried), ${membersCount} members, ${paid} membership badges paid${founderStart ? "" : "; Founder off (no flags.founderStart)"}`);
  });

  return { setShowcase, setPersona, myRewardHistory, awardBadge, revokeBadge, rewardsLinkedAccounts, rewardsNightly };
};
