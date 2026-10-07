// Mod Machina hooks for other features (internal, lazy, never throw): a recruit's first real action.
//   noteRecruitAction(uid, "checkin" | "arcade")   from the Night Shift check-in and a finished Arcade run
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
module.exports = { noteRecruitAction };
