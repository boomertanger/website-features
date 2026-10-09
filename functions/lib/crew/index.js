// Mod Machina, Cloud Functions (docs/specs/mod-machina.md section 14; data in section 13, with the roster
// at crew/main/roster/{uid}). Written ONLY here (Admin SDK); firestore.rules gives clients no writes.
// index.js calls this factory with its adminLog helper and spreads the result into its exports.
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const L = require("./logic");
const { SITE_ID } = require("./settings");

module.exports = function crew({ adminLogEntry } = {}) {
  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;

  // ---------- mirrorCrewRoster ----------
  // The roster entry is the source of truth. Each write copies (1) the public subset to
  // profiles/{uid}.crew (grade, track, status) and (2) crewGrade / crewStatus onto
  // members/{uid}, which mirrorMemberRoles then puts into the custom claims next to the roles.
  const mirrorCrewRoster = onDocumentWritten(`sites/{siteId}/crew/main/roster/{uid}`, async (event) => {
    const { siteId, uid } = event.params;
    if (siteId !== SITE_ID) return;
    const roster = event.data.after.exists ? event.data.after.data() : null;
    const pub = L.publicCrew(roster);
    const [profileRef, memberRef] = [db.doc(`sites/${siteId}/profiles/${uid}`), db.doc(`sites/${siteId}/members/${uid}`)];
    const [profile, member] = await Promise.all([profileRef.get(), memberRef.get()]);
    if (profile.exists) await profileRef.update({ crew: pub ? pub : FieldValue.delete() });
    if (member.exists) {
      const grade = L.claimGrade(roster);
      await memberRef.update({
        crewGrade: grade == null ? FieldValue.delete() : grade,
        crewStatus: pub ? pub.status : FieldValue.delete(),
      });
    }
    await require("./publicRoster").rebuildPublicCrew(db);        // public/crew: grade, track, status and Favourite chats only
  });

  const gears = require("./gears").makeGears({ db });

  // ---------- crewReferralSweep (03:40 Central) ----------
  // A recruit 7 days old with a real action is activated, and pays the referrer once (see ./referrals.js).
  const referrals = require("./referrals").makeReferrals({ db, gears });
  const crewReferralSweep = onSchedule({ schedule: "every day 03:40", timeZone: "America/Chicago", timeoutSeconds: 300 }, async () => {
    const r = await referrals.activateDue();
    console.log(`crewReferralSweep: ${r.checked} waiting, ${r.activated} activated`);
  });

  return {
    mirrorCrewRoster,
    crewReferralSweep,
    ...require("./academy")({ adminLogEntry, gears }),
    ...require("./awards")({ adminLogEntry }),
    ...require("./platform")({ adminLogEntry }),
    ...require("./core")({ adminLogEntry, gears }),
    ...require("./tasks")({ adminLogEntry, gears }),
    ...require("./notes")({ adminLogEntry }),
  };
};
