// The no-show lockout (Mod Machina phase 3 part 2; docs/specs/mod-machina.md section 17a "Reliability and no-shows"): 3 no-shows in 90 days means no Lead or Captain seats for 30 days.
// crewNightly writes roster/{uid}/private/record.lockUntil (and lockTriggerAt, the newest no-show it locked on, so the same no-shows never lock someone twice); the owner lifts it
// with crewLockLift. dutySignUp, dutySwapTake and dutyClockIn all ask here. A missing field is no lock.
const { paths } = require("./settings");

/** lockUntil in milliseconds (0 when there is none). */
async function lockUntilOf(db, uid) {
  const snap = await db.doc(paths.record(uid)).get();
  const v = snap.exists ? snap.get("lockUntil") : null;
  return v == null ? 0 : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : 0;
}

module.exports = { lockUntilOf };
