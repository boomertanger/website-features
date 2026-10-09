// Mod Machina paths and the settings document (docs/specs/mod-machina.md section 13). Everything lives under
// sites/boomertanger/crew/main/ (Firestore paths alternate collection / document, like factory/main).
const L = require("./logic");

const SITE_ID = "boomertanger";
const ROOT = `sites/${SITE_ID}/crew/main`;

const paths = {
  settings: () => ROOT,
  roster: (uid) => `${ROOT}/roster/${uid}`,
  record: (uid) => `${ROOT}/roster/${uid}/private/record`,
  application: (id) => `${ROOT}/applications/${id}`,
  vouch: (id, voucher) => `${ROOT}/applications/${id}/vouches/${voucher}`,
  concern: (id, uid) => `${ROOT}/applications/${id}/concerns/${uid}`,
  score: (id) => `${ROOT}/applications/${id}/private/score`,
  gear: (key) => `${ROOT}/gears/${key}`,
  board: (id) => `${ROOT}/boards/${id}`,
  task: (id) => `${ROOT}/tasks/${id}`,
  academy: (uid) => `${ROOT}/academyProgress/${uid}`,
  award: (ym) => `${ROOT}/awards/${ym}`,
  awardVote: (ym, uid) => `${ROOT}/awards/${ym}/votes/${uid}`,
  waiver: (uid) => `${ROOT}/waivers/${uid}`,
  referral: (uid) => `${ROOT}/referrals/${uid}`,
  swapsCol: () => `${ROOT}/swaps`,
  dutiesCol: () => `${ROOT}/duties`,
  duty: (streamId, uid) => `${ROOT}/duties/${streamId}_${uid}`,
};

/** crew/main merged over the defaults. Creates the document with the defaults the first time. */
async function loadSettings(db) {
  const ref = db.doc(paths.settings());
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set(L.mergeSettings({}), { merge: true });
    return L.mergeSettings({});
  }
  return L.mergeSettings(snap.data());
}

module.exports = { SITE_ID, ROOT, paths, loadSettings };
