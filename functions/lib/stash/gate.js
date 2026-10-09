// The upload gate (docs/specs/cloud-stash.md §4). uploadGate(caller, kind) is called FIRST in every upload-signature callable (vaultCoverSignature,
// vaultCoverSuggestSignature, factoryArtSignature and Bug Zapper's bugShotParams and bugSubmit with a screenshot), so a site that's near its Cloudinary limit stops taking new
// files before the limit is hit. It reads only storageUsage/cloudinary, which Cloud Stash keeps up to date:
//   uploads "open"            everyone may upload
//   uploads "members-paused"  member uploads are refused; staff (mods and admins) may still upload
//   uploads "stopped"         everything is refused except the owner
// It FAILS OPEN: if the status doc is missing, has no uploads value, or is more than 48 hours old, uploads stay open (and the stale-usage alert fires elsewhere).
// The refusal is HttpsError("resource-exhausted", message, { reason: "uploadsPaused" }); the member-facing message is below.
const admin = require("firebase-admin");
const { HttpsError } = require("firebase-functions/v2/https");

const STALE_MS = 48 * 60 * 60 * 1000;
const PAUSED_MESSAGE = "Uploads are paused for a bit. Try again later, or send it without a picture.";
const KINDS = ["vaultCover", "vaultSuggestion", "seasonArt", "bugShot"];

/** Pure: may this caller upload given the status doc's data? Returns null when allowed, else the refusal message. */
function refusalFor(status, caller, now = Date.now()) {
  if (!status) return null;
  const at = typeof status.fetchedAt === "number" ? status.fetchedAt : status.fetchedAt && typeof status.fetchedAt.toMillis === "function" ? status.fetchedAt.toMillis() : 0;
  if (!at || now - at > STALE_MS) return null;
  if (status.uploads === "members-paused") return caller && caller.isStaff ? null : PAUSED_MESSAGE;
  if (status.uploads === "stopped") return caller && caller.isOwner ? null : PAUSED_MESSAGE;
  return null;
}

/** Throws the refusal, or resolves. `kind` is only for the logs. A failed read of the status doc counts as open (never blocks an upload on a Firestore hiccup). */
async function uploadGate(caller, kind, { db = admin.firestore(), now = Date.now } = {}) {
  let status = null;
  try { const snap = await db.doc("storageUsage/cloudinary").get(); status = snap.exists ? snap.data() : null; }
  catch (err) { console.error(`uploadGate(${kind}): couldn't read the usage status, uploads stay open`, String((err && err.message) || err).slice(0, 160)); return; }
  const message = refusalFor(status, caller, now());
  if (message) throw new HttpsError("resource-exhausted", message, { reason: "uploadsPaused" });
}

module.exports = { uploadGate, refusalFor, PAUSED_MESSAGE, STALE_MS, KINDS };
