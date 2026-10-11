// Kind Words (docs/specs/base-camp.md "Kind Words engine"): short notes members leave on a board (newfoundland = Puffin Post, skipper = Paw Notes),
// read before they go up. Every document under sites/boomertanger/kindWords is written ONLY here (Admin SDK); firestore.rules lets anyone read an
// approved card and an author read their own, and nobody writes.
//
//   kindSubmit    signed-up members   { board, connection, place?, text, token? } -> { ok, id, linksRemoved }
//                                     3 a day per person (rateLimits kw_submit_<hash>), one pending card per board, text 20 to 600 after links are
//                                     stripped, place 40 at most (newfoundland only). The crew name check (hotline's) flags it for review.
//   kindWithdraw  the author          { id } while it's pending -> status withdrawn
//   kindReview    admins (and owner)  { id, action: approve | reject | feature | unfeature | hide, note? }; never deletes; adminLog feature "kindWords"
//
// Data: kindWords/{id} { board, uid, handle (snapshot), connection, place, text, status, featured, flagged, createdAt, updatedAt, reviewedAt,
// reviewedBy }. The private half, kindWords/{id}/private/review { rejectNote, nameFlag }, is read by admins only: the author never sees why a card
// wasn't posted (the wall shows a quiet "Not posted"). Callable errors carry details.reason.
//
// build(deps) is what scripts/check-kind-words.js runs against the in-memory Firestore: { db, adminLogEntry, now }.
const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const L = require("./logic");
const { nameCheck } = require("../hotline/logic");
const { SITE_ID, fail, callerInfo } = require("../vault/common");

const SITE = `sites/${SITE_ID}`;
const ID_SAFE = /^[A-Za-z0-9_-]{1,100}$/;
const raise = (r) => new HttpsError(r.code, r.message, { reason: r.reason, ...(r.field ? { field: r.field } : {}) });
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

function build(deps = {}) {
  const db = deps.db || admin.firestore();
  const { FieldValue, Timestamp } = admin.firestore;
  const now = deps.now || Date.now;
  const col = () => db.collection(`${SITE}/kindWords`);
  const cardRef = (id) => db.doc(`${SITE}/kindWords/${id}`);
  const privRef = (id) => db.doc(`${SITE}/kindWords/${id}/private/review`);

  /** Crew for the name check: every roster member but the owner, with their handle and display name (as Hotline Boom does). */
  async function crewNames() {
    const owner = (await db.doc(SITE).get()).get("ownerUid") || null;
    const roster = (await db.collection(`${SITE}/crew/main/roster`).get()).docs.filter((d) => d.id !== owner && d.get("status") !== "alumni");
    if (!roster.length) return [];
    const profiles = await Promise.all(roster.map((d) => db.doc(`${SITE}/profiles/${d.id}`).get()));
    return roster.map((d, i) => ({ uid: d.id, handle: (profiles[i].exists && profiles[i].get("handle")) || d.get("handle") || null, name: profiles[i].exists ? profiles[i].get("displayName") || null : null }));
  }
  async function bumpDaily(uid) {
    const at = now();
    const ref = db.doc(`${SITE}/rateLimits/kw_submit_${sha(`${uid}|${L.dayKey(at)}`).slice(0, 32)}`);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const count = snap.exists ? snap.get("count") || 0 : 0;
      if (count >= L.DAY_LIMIT) throw fail("resource-exhausted", `That's ${L.DAY_LIMIT} for today. Come back tomorrow.`, "rateLimit");
      tx.set(ref, { count: count + 1, expireAt: Timestamp.fromMillis(at + 2 * L.DAY_MS) }, { merge: true });
    });
  }
  async function log(c, action, id, card, extra = {}) {
    if (!deps.adminLogEntry) return;
    try {
      const entry = await deps.adminLogEntry(db, { feature: "kindWords", action, itemPath: `${SITE}/kindWords/${id}`, itemTitle: `${L.BOARDS[card.board]?.title || "Kind words"} from @${card.handle || "member"}`, actorUid: c.uid, actorName: c.name || "Admin", ...extra });
      await db.collection("adminLog").add(entry);
    } catch (err) { console.error("kindWords: adminLog write failed", String((err && err.message) || err).slice(0, 160)); }
  }

  // ---------- kindSubmit ----------
  async function submit(request) {
    const c = await callerInfo(request);
    if (!c.member) throw fail("failed-precondition", "Finish signing up first.", "needsSignup");
    const v = L.validateSubmit(request.data);
    if (!v.ok) throw raise(v);
    const { board, connection, place, text, linksRemoved } = v.value;
    const pending = await col().where("uid", "==", c.uid).where("board", "==", board).where("status", "==", "pending").limit(1).get();
    if (!pending.empty) throw fail("failed-precondition", "You already have one waiting for a look on this board. Withdraw it or wait until it's read.", "pendingExists");
    await bumpDaily(c.uid);
    const hit = nameCheck(text + (place ? `\n${place}` : ""), await crewNames());
    const ref = col().doc();
    const ts = FieldValue.serverTimestamp();
    await ref.set({ board, uid: c.uid, handle: c.handle || null, connection, place, text, status: "pending", featured: false, flagged: !!hit, createdAt: ts, updatedAt: ts, reviewedAt: null, reviewedBy: null });
    if (hit) await privRef(ref.id).set({ nameFlag: { uid: hit.uid, handle: hit.handle || null }, rejectNote: null });
    return { ok: true, id: ref.id, linksRemoved };
  }

  // ---------- kindWithdraw ----------
  async function withdraw(request) {
    const c = await callerInfo(request);
    const id = request.data && request.data.id;
    if (typeof id !== "string" || !ID_SAFE.test(id)) throw fail("invalid-argument", "Say which card.", "badInput");
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(cardRef(id));
      if (!snap.exists || snap.get("uid") !== c.uid) throw fail("not-found", "That card is no longer here.", "gone");
      if (snap.get("status") !== "pending") throw fail("failed-precondition", "Only a card that's still waiting can be withdrawn.", "wrongStatus");
      tx.update(cardRef(id), { status: "withdrawn", updatedAt: FieldValue.serverTimestamp() });
    });
    return { ok: true };
  }

  // ---------- kindReview ----------
  async function review(request) {
    const c = await callerInfo(request);
    if (!c.isAdmin) throw fail("permission-denied", "Admins only.", "notAdmin");
    const id = request.data && request.data.id;
    if (typeof id !== "string" || !ID_SAFE.test(id)) throw fail("invalid-argument", "Say which card.", "badInput");
    const out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(cardRef(id));
      const card = snap.exists ? snap.data() : null;
      const plan = L.planReview(card, request.data);
      if (!plan.ok) throw raise(plan);
      const ts = FieldValue.serverTimestamp();
      tx.update(cardRef(id), { ...plan.patch, updatedAt: ts, reviewedAt: ts, reviewedBy: { uid: c.uid, handle: c.handle || null } });
      if (plan.action === "reject") tx.set(privRef(id), { rejectNote: plan.note }, { merge: true });
      return { plan, card };
    });
    const { plan, card } = out;
    const changes = plan.patch.status && plan.patch.status !== card.status ? { status: { before: card.status, after: plan.patch.status } } : undefined;
    await log(c, plan.action, id, card, { changes, ...(plan.note ? { reason: plan.note } : {}) });
    return { ok: true, status: plan.patch.status || card.status, featured: plan.patch.featured ?? !!card.featured };
  }

  return {
    functions: { kindSubmit: onCall(submit), kindWithdraw: onCall(withdraw), kindReview: onCall(review) },
    ops: { submit, withdraw, review },
  };
}

module.exports = { build };
