// Fun Factory engine (docs/specs/fun-factory.md §5): recordFactoryEvent and the pay-out.
// Internal: features require() it and call it in the same function that does the action;
// nothing here is callable from a browser. Every XP point and badge is paid through the
// Trophy Room (lib/rewards/grant.js), so the ledger key factory:<activityId>:<period>:<uid>
// means nothing pays twice.
//
//   recordFactoryEvent(uid, type, params, ref, { keep })
//     1. writes events/{type:ref:uid} (TTL 120 days via expireAt; keep: true = no TTL, for actions
//        that count once ever). If the event already exists, it does nothing.
//     2. finds the live season's revealed activities of that type whose campaign is open now and
//        whose audience matches the member (all; sub = Sub Club or crew; crew = mods and admins),
//        and whose parameters match (an activity that sets action, gameId, collection, rarity…
//        only counts events with the same value).
//     3. counts toward the target in the activity's period (repeat none / daily / weekly, Central);
//        visit and medals count distinct sections / medals.
//     4. on reaching the target, pays grantXp (feature "factory", ref "{activityId}:{period}") and
//        grantBadge if the activity has a badgeId; adds the same XP to standings/{uid}.seasonXp
//        (admins too, with roleTag "admin": they race, but member prizes skip them); a campaign whose activities are all done pays its bonus once per period.
//     5. respects the season's optional dailyXpCap (factory XP per Central day).
//     Activities whose type an admin switched off don't count.
//   Never throws for a member's action: problems are logged and the feature carries on.
//   Returns { counted, completed: [activityIds], reason }.
const admin = require("firebase-admin");
const L = require("./logic");

const SITE_ID = "boomertanger";
const EVENT_TTL_DAYS = 120;
const CACHE_MS = 60 * 1000;
const MAX_SEEN = 100;
const DISTINCT = { visit: "path", medals: "medalId" };   // these types count different values, not repeats
const isStaging = () => (process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "").includes("staging");

function refs(db) {
  const site = db.doc(`sites/${SITE_ID}`);
  const root = site.collection("factory").doc("main");
  const season = (s) => root.collection("seasons").doc(s);
  return {
    site, root,
    seasons: root.collection("seasons"),
    season,
    chapters: (s) => season(s).collection("chapters"),
    campaigns: (s) => season(s).collection("campaigns"),
    activities: (s) => season(s).collection("activities"),
    hunts: (s) => season(s).collection("hunts"),
    progress: (s, uid) => season(s).collection("progress").doc(uid),
    standings: (s) => season(s).collection("standings"),
    boards: (s) => season(s).collection("boards"),
    event: (key) => root.collection("events").doc(key),
    events: root.collection("events"),
    streak: (uid) => root.collection("streaks").doc(uid),
    streaks: root.collection("streaks"),
    types: root.collection("activityTypes"),
    private: (id) => root.collection("private").doc(id),
    profile: (uid) => site.collection("profiles").doc(uid),
    member: (uid) => site.collection("members").doc(uid),
  };
}
const safeKey = (s) => String(s).replace(/[\/\s]+/g, "_").slice(0, 1400);
const eventKey = (type, ref, uid) => safeKey(`${type}:${ref}:${uid}`);

function makeFactory({ db = admin.firestore(), grant = null } = {}) {
  const R = refs(db);
  const { FieldValue, Timestamp } = admin.firestore;
  const G = () => grant || require("../rewards/grant");   // lazy: grant.js calls back into this module

  // ---------- the live season, cached per instance for a minute ----------
  let cache = null;
  async function liveBundle(now = Date.now()) {
    if (cache && now - cache.at < CACHE_MS) return cache.value;
    const snap = await R.seasons.where("status", "==", "live").limit(2).get();
    let value = null;
    if (!snap.empty) {
      const s = snap.docs[0];
      const [campaigns, activities, types] = await Promise.all([
        R.campaigns(s.id).where("revealed", "==", true).get(),
        R.activities(s.id).where("revealed", "==", true).get(),
        R.types.get(),
      ]);
      // A type an admin switched off stops counting (factoryTypeToggle); earned XP stays.
      const off = new Set(types.docs.filter((d) => d.get("enabled") === false).map((d) => d.id));
      value = {
        season: { id: s.id, ...s.data() },
        campaigns: new Map(campaigns.docs.map((d) => [d.id, { id: d.id, ...d.data() }])),
        activities: activities.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.enabled !== false && !off.has(a.typeId)),
      };
    }
    cache = { at: now, value };
    return value;
  }
  const dropCache = () => { cache = null; };

  /** The member as the engine sees them: signed up?, roles, owner?, staging (for the Sub Club role). */
  async function memberInfo(uid) {
    const [profile, member, site] = await db.getAll(R.profile(uid), R.member(uid), R.site);
    return {
      signedUp: profile.exists, handle: profile.get("handle") || null, displayName: profile.get("displayName") || profile.get("handle") || null,
      roles: member.exists ? member.get("roles") || [] : [], isOwner: site.exists && site.get("ownerUid") === uid, staging: isStaging(),
    };
  }

  // ---------- recordFactoryEvent ----------
  async function recordFactoryEvent(uid, type, params = {}, ref, { keep = false } = {}) {
    try {
      if (!uid || !type || ref == null) return { counted: false, reason: "args" };
      const now = Date.now();
      const b = await liveBundle(now);
      if (!b || !L.seasonLive(b.season, now)) return { counted: false, reason: "noSeason" };
      // 1. the event, once
      const key = eventKey(type, ref, uid);
      const cleanParams = Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v != null && typeof v !== "object").map(([k, v]) => [k, typeof v === "string" ? v.slice(0, 200) : v]));
      try {
        await R.event(key).create({ type, uid, params: cleanParams, ref: String(ref).slice(0, 300), seasonId: b.season.id, at: Timestamp.fromMillis(now), ...(keep ? {} : { expireAt: Timestamp.fromMillis(now + EVENT_TTL_DAYS * L.DAY_MS) }) });
      } catch (err) {
        if (err.code === 6 || /already exists/i.test(err.message)) return { counted: false, reason: "duplicate" };
        throw err;
      }
      // 2. the activities this event can count for
      const candidates = b.activities.filter((a) => a.typeId === type && L.paramsMatch(a.params, cleanParams));
      if (!candidates.length) return { counted: false, reason: "noActivity" };
      const who = await memberInfo(uid);
      if (!who.signedUp) return { counted: false, reason: "noProfile" };
      const open = candidates.filter((a) => {
        const c = b.campaigns.get(a.campaignId);
        return c && L.campaignOpen(c, b.season, now) && L.audienceOk(c.audience, who);
      });
      if (!open.length) return { counted: false, reason: "closed" };
      return await count(uid, who, b, open, cleanParams, type, now);
    } catch (err) {
      console.error(`recordFactoryEvent(${type}) failed`, err);
      return { counted: false, reason: "error" };
    }
  }

  // 3. count, in one transaction on the member's progress doc; then pay what completed.
  async function count(uid, who, b, activities, params, type, now) {
    const s = b.season, today = L.dayKey(now);
    const distinctBy = DISTINCT[type];
    const pay = await db.runTransaction(async (tx) => {
      const snap = await tx.get(R.progress(s.id, uid));
      const p = snap.exists ? snap.data() : {};
      const acts = { ...(p.acts || {}) };
      let xpDay = p.xpDay?.key === today ? { ...p.xpDay } : { key: today, xp: 0 };
      const done = [];
      for (const a of activities) {
        const period = L.periodKey(a.repeat, now);
        let cur = acts[a.id]?.period === period ? { ...acts[a.id] } : { count: 0, period, completedAt: null };
        if (cur.completedAt) continue;
        if (distinctBy) {
          const v = params[distinctBy];
          const seen = Array.isArray(cur.seen) ? cur.seen : [];
          if (v == null || seen.includes(String(v))) continue;
          cur.seen = [...seen, String(v)].slice(-MAX_SEEN);
        }
        cur.count = (cur.count || 0) + 1;
        if (cur.count >= (a.target || 1)) {
          cur.completedAt = Timestamp.fromMillis(now);
          const xp = L.capXp(a.xp, xpDay.xp, s.dailyXpCap);
          xpDay = { key: today, xp: xpDay.xp + xp };
          cur.paidXp = xp;
          done.push({ kind: "activity", id: a.id, campaignId: a.campaignId, period, xp, badgeId: a.badgeId || null });
        }
        acts[a.id] = cur;
      }
      // Campaign bonuses: every activity of the campaign complete in its current period.
      const camps = { ...(p.camps || {}) };
      for (const cid of new Set(done.map((d) => d.campaignId))) {
        const c = b.campaigns.get(cid);
        const all = b.activities.filter((a) => a.campaignId === cid);
        const period = L.periodKey(c.cadence === "daily" ? "daily" : c.cadence === "weekly" ? "weekly" : "none", now);
        if (!all.length || camps[cid]?.period === period) continue;
        const complete = all.every((a) => acts[a.id]?.completedAt && acts[a.id].period === L.periodKey(a.repeat, now));
        if (!complete) continue;
        const bonusXp = L.capXp(c.bonus?.xp || 0, xpDay.xp, s.dailyXpCap);
        xpDay = { key: today, xp: xpDay.xp + bonusXp };
        camps[cid] = { period, completedAt: Timestamp.fromMillis(now), cadence: c.cadence };
        done.push({ kind: "bonus", id: cid, campaignId: cid, period, xp: bonusXp, badgeId: c.bonus?.badgeId || null });
      }
      const changed = Object.keys(acts).some((k) => acts[k] !== (p.acts || {})[k]);
      if (!changed && !done.length) return [];
      tx.set(R.progress(s.id, uid), { uid, acts, camps, xpDay, updatedAt: Timestamp.fromMillis(now) }, { merge: true });
      return done;
    });

    // 4. pay through the Trophy Room (each grant is idempotent on its ledger key)
    let seasonXp = 0;
    for (const d of pay) {
      const ref = d.kind === "bonus" ? `bonus:${d.id}:${d.period}` : `${d.id}:${d.period}`;
      try {
        if (d.xp > 0) {
          const r = await G().grantXp(uid, d.xp, { feature: "factory", ref, reason: `${s.name || "Night Shift"}` });
          if (r.granted) seasonXp += d.xp;
        }
        if (d.badgeId) await G().grantBadge(uid, d.badgeId, { feature: "factory", ref: `badge:${d.badgeId}` });
      } catch (err) {
        console.error(`factory: pay ${ref} failed`, err);
      }
    }
    if (seasonXp > 0) await addStanding(s.id, uid, who, seasonXp, now);
    return { counted: true, completed: pay.filter((d) => d.kind === "activity").map((d) => d.id), bonuses: pay.filter((d) => d.kind === "bonus").map((d) => d.id) };
  }

  /** standings/{uid}.seasonXp += xp. Admins race too (tier crew, roleTag "admin"; fun-factory.md §13c). */
  async function addStanding(seasonId, uid, who, xp, now = Date.now()) {
    const tier = L.tierFor(who);
    await R.standings(seasonId).doc(uid).set({
      uid, seasonXp: FieldValue.increment(xp), tier, roleTag: L.roleTagFor(who), handle: who.handle, displayName: who.displayName, updatedAt: Timestamp.fromMillis(now),
    }, { merge: true });
  }

  return { recordFactoryEvent, liveBundle, memberInfo, addStanding, dropCache, refs: R, eventKey };
}

// The default instance, for features that just need to record an event (lazy, after initializeApp).
let shared = null;
const get = () => (shared ||= makeFactory());
module.exports = {
  makeFactory, refs, eventKey, SITE_ID, EVENT_TTL_DAYS,
  recordFactoryEvent: (...a) => get().recordFactoryEvent(...a),
  memberInfo: (...a) => get().memberInfo(...a),
  liveBundle: (...a) => get().liveBundle(...a),
  addStanding: (...a) => get().addStanding(...a),
};
