// Fun Factory daily check-in streaks (docs/specs/fun-factory.md §13a), at
// sites/boomertanger/factory/main/streaks/{uid}: { current, best, lastDay, savers, saversCap,
// lastCheckIn, updatedAt }. The streak never resets with the season.
//
//   checkIn(uid, who)   today's check-in: +1 after yesterday; missed days are covered by savers if
//                       there are enough, else it starts again at 1. Every 7 days in a row earns a
//                       saver (hold 2; Sub Club and crew 3). Pays the streak-day-N badges (3 … 365)
//                       through the Trophy Room. Returns the streak and what changed.
//   sweep(now)          the 00:10 Central job: streaks that missed yesterday spend savers or break,
//                       so pages show the right number before the member comes back.
// lastDay is the last day the streak covers (a check-in, or a missed day a saver paid for), and
// null once it's broken, so the sweep's query (lastDay < yesterday) skips broken streaks.
const admin = require("firebase-admin");
const L = require("./logic");
const { refs } = require("./record");

function makeStreaks({ db = admin.firestore(), grant = null } = {}) {
  const R = refs(db);
  const { Timestamp } = admin.firestore;
  const G = () => grant || require("../rewards/grant");

  async function checkIn(uid, who, now = Date.now()) {
    const today = L.dayKey(now);
    const cap = L.saversCapFor(who);
    const s = await db.runTransaction(async (tx) => {
      const snap = await tx.get(R.streak(uid));
      const next = L.streakCheckIn(snap.exists ? snap.data() : null, today, cap);
      if (!next.already) {
        tx.set(R.streak(uid), {
          uid, current: next.current, best: next.best, lastDay: next.lastDay, savers: next.savers, saversCap: cap,
          lastCheckIn: today, updatedAt: Timestamp.fromMillis(now),
        }, { merge: true });
      }
      return next;
    });
    const badges = [];
    for (const badgeId of s.badges || []) {
      try {
        const r = await G().grantBadge(uid, badgeId, { feature: "factory", ref: badgeId });
        if (r.granted) badges.push(badgeId);
      } catch (err) { console.error(`factory: streak badge ${badgeId} failed`, err); }
    }
    return { current: s.current, best: s.best, savers: s.savers, saversCap: cap, already: !!s.already, spent: s.spent || 0, earnedSaver: !!s.earnedSaver, badges };
  }

  async function sweep(now = Date.now()) {
    const today = L.dayKey(now), yesterday = L.addDays(today, -1);
    const late = await R.streaks.where("lastDay", "<", yesterday).get();
    let kept = 0, broke = 0;
    for (const doc of late.docs) {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(doc.ref);
        const next = L.streakSweep(snap.data(), today);
        if (!next.changed) return;
        tx.update(doc.ref, { current: next.current, lastDay: next.lastDay, savers: next.savers, updatedAt: Timestamp.fromMillis(now) });
        if (next.broke) broke++; else kept++;
      });
    }
    return { checked: late.size, kept, broke };
  }

  return { checkIn, sweep };
}

module.exports = { makeStreaks };
