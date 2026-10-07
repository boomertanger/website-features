// Referral links (docs/specs/mod-machina.md section 9). Every member has boomertanger.com/join/@handle; the new
// account stores the link at signup (first link wins; the browser keeps it 30 days, the page part comes next).
// referrals/{newUid}: { refUid, refHandle, atMs, firstAction, checkinPaid, activatedAt }.
// A recruit counts as activated after 7 days with at least one real action (a Night Shift check-in or a
// finished Arcade run). Only activated recruits pay: Gears for crew (10, up to 10 a month; +5 for the
// recruit's first check-in), the Recruiter badge ladder (1, 5, 15, 50) for everyone, and a Night Shift
// event ("bring-a-friend"; "recruit-checks-in" at the first check-in), both off by default as activity types.
//
//   recordReferral(db, newUid, refHandle)   internal, from completeSignup; never throws
//   noteAction(db, uid, kind)               internal, from a check-in or a finished Arcade run; never throws
//   makeReferrals({ db, gears })            { activateDue(now) }, and the referralSweep job in ./index.js
const admin = require("firebase-admin");
const { paths, SITE_ID } = require("./settings");
const { normalizeHandle, handleShape } = require("../accounts/validate");

const ACTIVATE_AFTER_DAYS = 7;
const LADDER = [[1, "recruiter-1"], [5, "recruiter-5"], [15, "recruiter-15"], [50, "recruiter-50"]];
const DAY_MS = 86400000;
const KINDS = ["checkin", "arcade"];

/** Stores the referral for a brand-new account. First link wins; a bad or self link is ignored. */
async function recordReferral(db, newUid, refHandle, now = Date.now()) {
  try {
    if (typeof refHandle !== "string" || !refHandle) return { saved: false, reason: "noLink" };
    const handle = normalizeHandle(refHandle);
    if (handleShape(handle) !== "ok") return { saved: false, reason: "badHandle" };
    const h = await db.doc(`handles/${handle}`).get();
    const refUid = h.exists ? h.get("uid") : null;
    if (!refUid || refUid === newUid) return { saved: false, reason: "noReferrer" };
    const profile = await db.doc(`sites/${SITE_ID}/profiles/${refUid}`).get();
    if (!profile.exists) return { saved: false, reason: "noReferrer" };
    try {
      await db.doc(paths.referral(newUid)).create({ refUid, refHandle: handle, atMs: now, at: admin.firestore.Timestamp.fromMillis(now), firstAction: null, checkinPaid: false, activatedAt: null });
    } catch (err) {
      if (err.code === 6 || /already exists/i.test(err.message)) return { saved: false, reason: "firstLinkWins" };
      throw err;
    }
    return { saved: true, refUid };
  } catch (err) { console.error("crew: recordReferral failed", err); return { saved: false, reason: "error" }; }
}

function makeReferrals({ db = admin.firestore(), gears, now = () => Date.now(), grant = null, recordEvent = null } = {}) {
  const { Timestamp } = admin.firestore;
  const G = () => grant || require("../rewards/grant");
  const E = () => recordEvent || require("../factory/record").recordFactoryEvent;
  const col = () => db.collection(`${paths.settings()}/referrals`);

  /** A recruit did something real. Marks the first action; pays the referrer's +5 for the first check-in. */
  async function noteAction(uid, kind) {
    try {
      if (!KINDS.includes(kind)) return { noted: false };
      const ref = db.doc(paths.referral(uid)), snap = await ref.get();
      if (!snap.exists) return { noted: false };
      const patch = {}, at = now();
      if (!snap.get("firstAction")) patch.firstAction = { kind, atMs: at };
      let paid = false;
      if (kind === "checkin" && !snap.get("checkinPaid")) {
        patch.checkinPaid = true; paid = true;
      }
      if (Object.keys(patch).length) await ref.update(patch);
      if (paid) {
        const r = await gears.grantRecruitCheckin(snap.get("refUid"), uid);
        // Night Shift: "your recruit checks in" counts for the referrer (the type is off until a season uses it)
        await E()(snap.get("refUid"), "recruit-checks-in", {}, uid);
        return { noted: true, gears: r.granted ? r.amount : 0 };
      }
      return { noted: true };
    } catch (err) { console.error("crew: noteAction failed", err); return { noted: false }; }
  }

  /** Daily: referrals 7 days old with a real action become activated, and pay the referrer once. */
  async function activateDue(at = now()) {
    const snap = await col().where("activatedAt", "==", null).get();
    let activated = 0;
    for (const d of snap.docs) {
      const r = d.data();
      if (!r.firstAction || at - r.atMs < ACTIVATE_AFTER_DAYS * DAY_MS) continue;
      await d.ref.update({ activatedAt: Timestamp.fromMillis(at) });
      activated++;
      try {
        await gears.grantRecruit(r.refUid, d.id);                       // Gears if crew (the cap is per month)
        const count = (await col().where("refUid", "==", r.refUid).get()).docs.filter((x) => x.get("activatedAt")).length;
        for (const [n, badgeId] of LADDER) if (count >= n) await G().grantBadge(r.refUid, badgeId, { feature: "recruit", ref: badgeId });
        await E()(r.refUid, "bring-a-friend", {}, d.id);
      } catch (err) { console.error("crew: referral payout failed", err); }
    }
    return { checked: snap.size, activated };
  }

  return { noteAction, activateDue };
}

module.exports = { recordReferral, makeReferrals, ACTIVATE_AFTER_DAYS, LADDER };
