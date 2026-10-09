// Shared board server pieces (docs/specs/bug-zapper.md §2 decision 12), the generic half of what Feature Lab's callables do and Bug Zapper's do too:
// the caller with the display name snapshots keep, the per-member rate limit, the post token, hide and unhide (an item or one of its replies), a reply
// written with the server-set staff tag, the logs (adminLog, activityLog, notifyOutbox, a Night Shift event) and the delete tree.
// A feature calls makeBoards(cfg) once inside its build(deps); nothing here knows a status, a field name or a message of its own.
//
// cfg: {
//   db, now, adminLogEntry,
//   label                  "lab" | "bugs": prefixes console messages
//   logKey                 adminLog feature key ("featureLab" | "bugZapper")
//   itemPath(id)           the item's document path, for adminLog
//   activityFeature        activityLog feature ("feature-lab" | "bug-zapper"); linkOf(id) is the event's link; idField the event's id field ("ideaId" | "reportId")
//   rate: { prefix, limits, periodKey(kind, at), ttlMs(kind), overLimit(kind, count) }   counters live in sites/{siteId}/rateLimits as <prefix>_<kind>_<hash>
//   factoryType            the Night Shift type id ("lab" | "bugs"); factory is lazy (it needs initializeApp)
// }
const crypto = require("crypto");
const { HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { SITE_ID, fail, callerInfo } = require("../vault/common");

const OUTBOX_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

/** A refusal from a logic.js as the HttpsError the site reads (details.reason, details.field). */
const raise = (r) => new HttpsError(r.code, r.message, { reason: r.reason, ...(r.field ? { field: r.field } : {}) });
/** A document id that is safe to put in a path. */
const idStr = (v) => (typeof v === "string" && v && v.length <= 100 && !v.includes("/") ? v : null);
const text = (err) => String((err && err.message) || err).slice(0, 160);

function makeBoards(cfg) {
  const { db, now, label } = cfg;
  const { FieldValue, Timestamp } = admin.firestore;
  let factoryMod = cfg.factory;
  const factory = () => (factoryMod ||= require("../factory/record"));

  /** The caller, with the display name the item and reply snapshots keep. */
  async function caller(request) {
    const c = await callerInfo(request);
    const prof = await db.doc(`sites/${SITE_ID}/profiles/${c.uid}`).get();
    const displayName = prof.exists ? prof.get("displayName") || c.handle : null;
    return { ...c, displayName: typeof displayName === "string" ? displayName.slice(0, 60) : c.handle };
  }
  const byOf = (c) => ({ uid: c.uid, handle: c.handle, name: c.displayName || c.handle });
  /** The staff tag a reply or comment gets, from the caller's roles (never from the client). */
  const staffTagOf = (c) => (c.isAdmin ? "admin" : c.isMod ? "mod" : null);

  // ---------- rate limits ----------
  async function bump(kind, uid) {
    const { rate } = cfg;
    const at = now();
    const ref = db.doc(`sites/${SITE_ID}/rateLimits/${rate.prefix}_${kind}_${sha(`${uid}|${rate.periodKey(kind, at)}`).slice(0, 32)}`);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const count = snap.exists ? snap.get("count") || 0 : 0;
      if (rate.overLimit(kind, count)) throw fail("resource-exhausted", rate.limits[kind].message, "rateLimit");
      tx.set(ref, { count: count + 1, expireAt: Timestamp.fromMillis(at + rate.ttlMs(kind)) }, { merge: true });
    });
  }

  // ---------- logs ----------
  async function adminLog(c, { action, id, title, reason = "", changes, details, snapshot }) {
    try {
      const entry = await cfg.adminLogEntry(db, { feature: cfg.logKey, action, itemPath: cfg.itemPath(id), itemTitle: title, actorUid: c.uid, actorName: c.name || c.displayName || "Admin", reason, changes, snapshot, details });
      await db.collection("adminLog").add(entry);
    } catch (err) { console.error(`${label}: adminLog write failed`, text(err)); }
  }
  async function activity(type, summary, actorName, item, id, extra = {}) {
    if (item.hidden === true || item.private === true) return;
    try {
      await db.collection("activityLog").add({ feature: cfg.activityFeature, type, summary, link: cfg.linkOf(id), actorName: actorName || null, [cfg.idField]: id, ...extra, createdAt: FieldValue.serverTimestamp() });
    } catch (err) { console.error(`${label}: activityLog write failed`, text(err)); }
  }
  async function outbox(doc) {
    try { await db.collection(`sites/${SITE_ID}/notifyOutbox`).add({ ...doc, streamId: null, week: null, status: "pending", createdAt: FieldValue.serverTimestamp(), expireAt: Timestamp.fromMillis(now() + OUTBOX_TTL_MS) }); }
    catch (err) { console.error(`${label}: notifyOutbox write failed`, text(err)); }
  }
  /** A Night Shift event (never throws; recordFactoryEvent already logs its own failures). */
  async function nightShift(uid, action, ref) {
    try { const r = await factory().recordFactoryEvent(uid, cfg.factoryType, { action }, ref, { keep: true }); return !!(r && r.counted); }
    catch (err) { console.error(`${label}: Night Shift event failed`, text(err)); return false; }
  }

  // ---------- the post token: a double click or a retry is the same post ----------
  /** The id a token already made for this member (null if it is new). Another member's token is refused. */
  async function seenToken(tokenRef, uid, idField) {
    const seen = await tokenRef.get();
    if (!seen.exists) return null;
    if (seen.get("uid") === uid) return seen.get(idField);
    throw fail("failed-precondition", "Reload the page and try again.", "token");
  }
  /** Inside the transaction that writes the item: refuse a token that was used in the meantime, then record it. */
  async function claimToken(tx, tokenRef, fields, at, ttlMs) {
    const t = await tx.get(tokenRef);
    if (t.exists) throw fail("failed-precondition", "Reload the page and try again.", "token");
    tx.set(tokenRef, { ...fields, expireAt: Timestamp.fromMillis(at + ttlMs) });
  }

  // ---------- replies (comments, thread) ----------
  /**
   * Writes one reply under an item in a transaction and bumps the item's count. `gate(item)` may throw (a hidden item, a stranger).
   * Returns the new reply id.
   */
  async function addReply({ itemRef, repliesRef, value, c, countField, missing, gate }) {
    const ref = repliesRef.doc();
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(itemRef);
      if (!snap.exists || snap.get("hidden") === true) throw fail("not-found", missing[1], missing[0]);
      if (gate) gate(snap.data());
      tx.set(ref, { text: value, by: byOf(c), staffTag: staffTagOf(c), hidden: false, createdAt: FieldValue.serverTimestamp() });
      tx.update(itemRef, { [countField]: FieldValue.increment(1) });
    });
    return ref.id;
  }

  // ---------- hide and unhide ----------
  /**
   * Hides or unhides an item (no replyId) or one reply. `missing` is { item: [reason, message], reply: [reason, message] }. A reply's visibility moves the
   * item's public count (countField). Resolves { changed, item } (changed false when it was already so).
   */
  async function setHidden({ itemRef, repliesRef, replyId, hidden, reason, c, countField, missing }) {
    return db.runTransaction(async (tx) => {
      const iSnap = await tx.get(itemRef);
      if (!iSnap.exists) throw fail("not-found", missing.item[1], missing.item[0]);
      const target = replyId ? repliesRef.doc(replyId) : itemRef;
      const tSnap = replyId ? await tx.get(target) : iSnap;
      if (!tSnap.exists) throw fail("not-found", missing.reply[1], missing.reply[0]);
      if ((tSnap.get("hidden") === true) === hidden) return { changed: false, item: iSnap.data() };
      const update = hidden
        ? { hidden: true, hiddenBy: { uid: c.uid, handle: c.handle }, hiddenReason: reason }
        : { hidden: false, hiddenBy: FieldValue.delete(), hiddenReason: FieldValue.delete() };
      if (!replyId) update.updatedAt = FieldValue.serverTimestamp();
      tx.update(target, update);
      // the public count is the number of replies people can see
      if (replyId && countField) tx.update(itemRef, { [countField]: FieldValue.increment(hidden ? -1 : 1) });
      return { changed: true, item: iSnap.data() };
    });
  }

  // ---------- delete ----------
  async function inBatches(docs, apply) {
    for (let i = 0; i < docs.length; i += 400) { const b = db.batch(); docs.slice(i, i + 400).forEach((d) => apply(b, d)); await b.commit(); }
  }
  /** Deletes the activityLog events of an item (events first, so a retry after a partial failure still finds the item). Resolves how many. */
  async function deleteEvents(id) {
    const ev = (await db.collection("activityLog").where(cfg.idField, "==", id).get()).docs.filter((d) => d.get("feature") === cfg.activityFeature);
    await inBatches(ev, (b, d) => b.delete(d.ref));
    return ev.length;
  }
  /**
   * The rest of the tree: the item with all its subcollections, then the marks it left behind (the members' vote or "me too" lists that name it) and its
   * post tokens. marksCollection / tokensCollection are collection paths. Resolves how many marks were cleared.
   */
  async function deleteTree({ id, itemRef, marksCollection, tokensCollection, tokenField }) {
    await db.recursiveDelete(itemRef);
    const marks = (await db.collection(marksCollection).where("ids", "array-contains", id).get()).docs;
    await inBatches(marks, (b, d) => b.update(d.ref, { ids: FieldValue.arrayRemove(id) }));
    const toks = (await db.collection(tokensCollection).where(tokenField, "==", id).get()).docs;
    await inBatches(toks, (b, d) => b.delete(d.ref));
    return marks.length;
  }

  return { caller, byOf, staffTagOf, bump, adminLog, activity, outbox, nightShift, seenToken, claimToken, addReply, setHidden, inBatches, deleteEvents, deleteTree };
}

module.exports = { makeBoards, raise, idStr, OUTBOX_TTL_MS, sha };
