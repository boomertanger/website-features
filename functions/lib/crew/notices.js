// Mod Machina phase 3 part 7: HQ notices (docs/specs/mod-machina.md section 17a "Activity rules on": reminders and status changes land on /crew/hq).
// crew/main/notices/{noticeId}: { uid, kind (swap | reminder | status | rules), title, text, link, createdAt, readAt, expireAt (+30 days, TTL) }. Function-written only;
// the member it is for reads it (plus admins and the owner, rules). crewNoticeRead({ noticeId }) marks one of your own read.
//
//   writeNotice(uid, { kind, title, text, link, id }, { outbox = true })   one notice, plus the notifyOutbox entry (type "crewNotice") for when Boom Alerts sends,
//                                                                         so callers make one call. With an `id` it is written once (a retried run is a no-op).
//   writeNotices(uids, notice)                                            the same notice to many, notices only: for callers that already write their own outbox
//                                                                         entry (the swap board), so nothing is sent twice.
const { onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { ROOT, SITE_ID } = require("./settings");
const { makeStore, fail } = require("./store");

const KINDS = ["swap", "reminder", "status", "rules"];
const KEEP_MS = 30 * 24 * 3600000;
const ID_SAFE = /^[A-Za-z0-9_-]{1,120}$/;
const OUTBOX = `sites/${SITE_ID}/notifyOutbox`;

function makeNotices({ db = admin.firestore(), now = Date.now } = {}) {
  const { FieldValue, Timestamp } = admin.firestore;
  const col = () => db.collection(`${ROOT}/notices`);
  const docOf = (uid, n, at) => {
    if (!KINDS.includes(n.kind)) throw new Error(`notices: unknown kind ${n.kind}`);
    return { uid, kind: n.kind, title: String(n.title || "").slice(0, 120), text: String(n.text || "").slice(0, 400), link: typeof n.link === "string" && n.link.startsWith("/") ? n.link : null,
      createdAt: Timestamp.fromMillis(at), readAt: null, expireAt: Timestamp.fromMillis(at + KEEP_MS) };
  };
  /** create() when an id is given (a repeat is a no-op, false); add() otherwise. */
  async function put(ref, doc) {
    try { await ref.create(doc); return true; }
    catch (err) { if (err.code === 6 || /ALREADY_EXISTS|already exists/i.test(String(err.message))) return false; throw err; }
  }

  async function writeNotice(uid, n, { outbox = true } = {}) {
    if (typeof uid !== "string" || !uid) return false;
    const at = now(), id = n.id && ID_SAFE.test(n.id) ? n.id : null;
    const doc = docOf(uid, n, at);
    const wrote = id ? await put(col().doc(id), doc) : (await col().add(doc), true);
    if (!wrote || !outbox) return wrote;
    // the same shape the planner's outbox writer uses (lib/planner/core.js): Boom Alerts reads these when it sends
    const entry = { type: "crewNotice", audience: "uids", uids: [uid], streamId: null, week: null, payload: { kind: doc.kind, title: doc.title, text: doc.text, link: doc.link }, status: "pending",
      createdAt: FieldValue.serverTimestamp(), expireAt: Timestamp.fromMillis(at + KEEP_MS) };
    try { if (id) await put(db.doc(`${OUTBOX}/notice-${id}`), entry); else await db.collection(OUTBOX).add(entry); }
    catch (err) { console.error("notices: outbox failed", String((err && err.message) || err).slice(0, 120)); }
    return true;
  }

  async function writeNotices(uids, n) {
    const at = now(), list = [...new Set((uids || []).filter((u) => typeof u === "string" && u))];
    for (let i = 0; i < list.length; i += 400) {
      const batch = db.batch();
      for (const uid of list.slice(i, i + 400)) batch.set(col().doc(), docOf(uid, n, at));
      await batch.commit();
    }
    return list.length;
  }

  return { writeNotice, writeNotices };
}

module.exports = function notices({ adminLogEntry } = {}) {
  const S = makeStore({ adminLogEntry });
  const { db, Timestamp } = S;
  const crewNoticeRead = onCall(async (request) => {
    const uid = S.requireAuth(request);
    const id = request.data && request.data.noticeId;
    if (typeof id !== "string" || !ID_SAFE.test(id)) throw fail("invalid-argument", "noticeId is required.", "args");
    const ref = db.doc(`${ROOT}/notices/${id}`), snap = await ref.get();
    if (!snap.exists) return { ok: true, gone: true };
    if (snap.get("uid") !== uid) throw fail("permission-denied", "That notice isn't yours.", "notYours");
    if (snap.get("readAt") == null) await ref.update({ readAt: Timestamp.now() });
    return { ok: true };
  });
  return { crewNoticeRead };
};
module.exports.makeNotices = makeNotices;
module.exports.KINDS = KINDS;
