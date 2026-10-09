// Mod Machina phase 3 part 2: reliability and no-shows (docs/specs/mod-machina.md section 17a "Reliability and no-shows"), run every night by crewNightly.
//   reliability = showed / kept seats over 90 days, written to roster/{uid}/private/record { reliability, keptSeats90, showed90, noShows: [{ streamId, at }], reliabilityAt }.
//   Kept seats: confirmed seats on streams that ended (a duty record with a scheduled seat), plus untaken LATE drops (swaps with countsAsNoShow). Showed: clocked in at any point.
//   No-shows: a scheduled seat with no clock-in at all, plus those late drops. Seats released by Delay or Cancel never count (a cancelled stream never ends; their swaps are noRecord).
//   3 no-shows in 90 days: lockUntil = now + 30 days (once per set of no-shows: lockTriggerAt is the newest one it locked on). The owner lifts it with crewLockLift.
const admin = require("firebase-admin");
const D = require("./dutyLogic");
const { paths } = require("./settings");

const ms = (v) => (v == null ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : null);

function makeReliability({ db = admin.firestore(), now = () => Date.now() } = {}) {
  const { Timestamp } = admin.firestore;

  async function forPerson(uid, at) {
    const [duties, swaps, recSnap] = await Promise.all([
      db.collection(paths.dutiesCol()).where("uid", "==", uid).get(),
      db.collection(paths.swapsCol()).where("fromUid", "==", uid).get(),
      db.doc(paths.record(uid)).get(),
    ]);
    const dutyRows = duties.docs.map((d) => d.data()).filter((x) => x.endedAt != null).map((x) => ({ streamId: x.streamId, endedAt: ms(x.endedAt), scheduled: x.scheduled || null, clockedIn: (x.segments || []).length > 0 }));
    const lateSwaps = swaps.docs.filter((d) => d.get("countsAsNoShow") === true).map((d) => ({ streamId: d.get("streamId"), at: ms(d.get("closedAt")) || ms(d.get("startsAt")) || at }));
    const r = D.reliability(dutyRows, lateSwaps, at);
    const record = recSnap.exists ? recSnap.data() : {};
    const lock = D.lockFor(r.noShows, record, at);
    const patch = { reliability: r.reliability, keptSeats90: r.kept, showed90: r.showed, noShows: r.noShows, reliabilityAt: Timestamp.fromMillis(at) };
    if (lock) { patch.lockUntil = Timestamp.fromMillis(lock); patch.lockTriggerAt = r.noShows[r.noShows.length - 1].at; }
    await db.doc(paths.record(uid)).set(patch, { merge: true });
    return { ...r, lockedUntil: lock };
  }

  /** Every non-alumni crew member. Returns { people, locked }. */
  async function run(at = now()) {
    const roster = await db.collection(`${paths.settings()}/roster`).get();
    let people = 0, locked = 0;
    for (const d of roster.docs) {
      if (d.get("status") === "alumni") continue;
      const r = await forPerson(d.id, at);
      people++;
      if (r.lockedUntil) locked++;
    }
    return { people, locked };
  }
  return { run, forPerson };
}

module.exports = { makeReliability };
