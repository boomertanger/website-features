// Mod Machina phase 3 part 4: the crew notes strip on the Mod Deck (docs/specs/mod-machina.md section 17a, "Crew notes strip"). crewNote({ text }) and crewNoteDelete({ noteId }).
// crew/main/notes/{noteId}: { uid, handle, grade, track, text, createdAt, expireAt (+24 h, TTL in firestore.indexes.json) }. Written ONLY here; rules give crew claims read and nobody a write.
// Any crew member (a mod or admin who is not Paused or Alumni, or the owner) posts 1 to 200 characters, at most 10 in a rolling day. Authors delete their own; admins delete any (adminLog only for
// those). The Deck hides anything older than 24 h even before the TTL removes it. Callable errors carry details.reason.
const { onCall } = require("firebase-functions/v2/https");
const { paths, ROOT } = require("./settings");
const { makeStore, fail, ms } = require("./store");

const DAY_MS = 24 * 3600000;
const MAX_LEN = 200;
const MAX_PER_DAY = 10;

/** Crew (any grade, any status but Paused and Alumni) and the owner. Pure. */
const canNote = (w) => !!w && (w.isOwner || ((w.isMod || w.isAdmin) && !(w.roster && ["paused", "alumni"].includes(w.roster.status))));

module.exports = function crewNotes({ adminLogEntry }) {
  const S = makeStore({ adminLogEntry });
  const { db, FieldValue, Timestamp } = S;
  const noteRef = (id) => db.doc(`${ROOT}/notes/${id}`);

  const crewNote = onCall(async (request) => {
    const uid = S.requireAuth(request);
    const w = await S.who(uid);
    if (!canNote(w)) throw fail("permission-denied", "Crew only.", "notCrew");
    const text = S.text(request.data?.text, MAX_LEN, { min: 1, field: "text" });
    const at = Date.now();
    const mine = await db.collection(`${ROOT}/notes`).where("uid", "==", uid).get();
    if (mine.docs.filter((d) => (ms(d.get("createdAt")) || 0) > at - DAY_MS).length >= MAX_PER_DAY) throw fail("resource-exhausted", "That's 10 notes today. Try again tomorrow.", "limit");
    const ref = db.collection(`${ROOT}/notes`).doc();
    await ref.set({ uid, handle: w.handle, grade: w.roster && Number.isInteger(w.roster.grade) ? w.roster.grade : null, track: w.roster && w.roster.track === "admin" || (!w.roster && w.isAdmin) ? "admin" : "mod", text, createdAt: Timestamp.fromMillis(at), expireAt: Timestamp.fromMillis(at + DAY_MS) });
    return { ok: true, noteId: ref.id };
  });

  const crewNoteDelete = onCall(async (request) => {
    const uid = S.requireAuth(request);
    const w = await S.who(uid);
    const noteId = request.data?.noteId;
    if (typeof noteId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(noteId)) throw fail("invalid-argument", "noteId is required.", "args");
    const ref = noteRef(noteId), snap = await ref.get();
    if (!snap.exists) return { ok: true, gone: true };
    const own = snap.get("uid") === uid;
    if (!own && !w.isAdmin) throw fail("permission-denied", "You can delete your own notes.", "notYours");
    await ref.delete();
    if (!own) await S.adminLog(w, { action: "crewNoteDelete", uid: snap.get("uid"), title: `Note by @${snap.get("handle") || "crew"}`, details: { noteId } });
    return { ok: true };
  });

  return { crewNote, crewNoteDelete };
};
module.exports.canNote = canNote;
