// Mod Machina hooks for other features (internal, lazy, never throw): a recruit's first real action.
//   noteRecruitAction(uid, "checkin" | "arcade")   from the Night Shift check-in and a finished Arcade run
//   noteLabReview(uid, ideaId)                      Feature Lab: the admin who first moves an idea out of Submitted earns +3 Gears (labReview)
const admin = require("firebase-admin");

let shared = null;
function referrals() {
  if (!shared) {
    const db = admin.firestore();
    shared = require("./referrals").makeReferrals({ db, gears: require("./gears").makeGears({ db }) });
  }
  return shared;
}
async function noteRecruitAction(uid, kind) {
  try { return await referrals().noteAction(uid, kind); } catch (err) { console.error("crew: noteRecruitAction failed", err); return { noted: false }; }
}
/** Feature Lab review Gears for an admin. Lazy and never throws (a failed grant is logged, the triage still stands). */
async function noteLabReview(uid, ideaId) {
  try {
    const db = admin.firestore();
    return await require("./gears").makeGears({ db }).grantLabReview(uid, ideaId);
  } catch (err) { console.error("crew: noteLabReview failed", err); return { granted: false, reason: "error" }; }
}
module.exports = { noteRecruitAction, noteLabReview };
