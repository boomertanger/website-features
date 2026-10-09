// Feature Lab callables (docs/specs/feature-lab.md §3, §4). Every document under sites/boomertanger/lab/main is written ONLY here (Admin SDK);
// firestore.rules gives clients read access to what the spec says and no write access at all.
//
//   labSubmit   verified members, staff   a new idea (3 a day, one idea per post token)
//   labVote     verified members, staff   vote or take the vote back (60 changes an hour; frozen once shipped or declined)
//   labComment  verified members, staff   a comment (20 an hour)
//   labTriage   admins                    status, priority and a note; the one-time rewards (+3 Gears, The Architect)
//   labHide     mods, admins              hide or unhide an idea or a comment, with a reason
//   labDelete   owner, A2, A3             the idea, its comments, votes, events and vote marks
// (adminEditItem's new kind labIdea is in edit.js, dispatched from functions/index.js like vaultGame.)
//
// Data: lab/main/ideas/{id} (+ comments/{cid}, votes/{uid}), lab/main/myVotes/{uid}, lab/main/submitTokens/{token}; rate-limit counters in the existing
// rateLimits collection as lab_<kind>_<hash(uid|period)>. Logs: adminLog (feature "featureLab"), activityLog (feature "feature-lab", types submitted,
// status-changed, shipped, never for a hidden idea), notifyOutbox report-update on a status change. Night Shift: type "lab" (post, vote, shipped).
// Callable errors carry details.reason so the site can show the right message.
//
// build(deps) is what scripts/check-lab-wiring.js runs against the in-memory Firestore. deps: adminLogEntry, now(), factory { recordFactoryEvent },
// grant { grantBadge }, crewHooks { noteLabReview }, crewStore (for the grade check on delete).
const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const L = require("./logic");
const { SITE_ID, fail, callerInfo, requireVerifiedMember, requireStaff, requireAdmin } = require("../vault/common");
const { dayKey } = require("../arcade/logic");

const OUTBOX_TTL_MS = 30 * L.DAY_MS;
const TOKEN_TTL_MS = L.DAY_MS;
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

/** A refusal from lib/lab/logic.js as the HttpsError the site reads (details.reason, details.field). */
const raise = (r) => new HttpsError(r.code, r.message, { reason: r.reason, ...(r.field ? { field: r.field } : {}) });

function build(deps = {}) {
  const db = deps.db || admin.firestore();
  const { FieldValue, Timestamp } = admin.firestore;
  const now = deps.now || Date.now;
  const base = `sites/${SITE_ID}/lab/main`;
  const ideaRef = (id) => db.doc(`${base}/ideas/${id}`);
  const commentsOf = (id) => db.collection(`${base}/ideas/${id}/comments`);
  const voteRef = (id, uid) => db.doc(`${base}/ideas/${id}/votes/${uid}`);
  const myVotesRef = (uid) => db.doc(`${base}/myVotes/${uid}`);
  const tokenRef = (t) => db.doc(`${base}/submitTokens/${t}`);
  const itemPath = (id) => `${base}/ideas/${id}`;

  // lazy collaborators (they need initializeApp, and the checks swap them)
  let factoryMod = deps.factory, grantMod = deps.grant, hooksMod = deps.crewHooks, crewStoreMod = deps.crewStore;
  const factory = () => (factoryMod ||= require("../factory/record"));
  const grant = () => (grantMod ||= require("../rewards/grant"));
  const hooks = () => (hooksMod ||= require("../crew/hooks"));
  const crewStore = () => (crewStoreMod ||= require("../crew/store").makeStore({ db, adminLogEntry: deps.adminLogEntry }));

  const idStr = (v) => (typeof v === "string" && v && v.length <= 100 && !v.includes("/") ? v : null);

  /** The caller, with the display name the idea and comment snapshots keep. */
  async function caller(request) {
    const c = await callerInfo(request);
    const prof = await db.doc(`sites/${SITE_ID}/profiles/${c.uid}`).get();
    const displayName = prof.exists ? prof.get("displayName") || c.handle : null;
    return { ...c, displayName: typeof displayName === "string" ? displayName.slice(0, 60) : c.handle };
  }
  const byOf = (c) => ({ uid: c.uid, handle: c.handle, name: c.displayName || c.handle });

  // ---------- rate limits ----------
  async function bump(kind, uid) {
    const at = now();
    const ref = db.doc(`sites/${SITE_ID}/rateLimits/lab_${kind}_${sha(`${uid}|${L.periodKey(kind, at, dayKey)}`).slice(0, 32)}`);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const count = snap.exists ? snap.get("count") || 0 : 0;
      if (L.overLimit(kind, count)) throw fail("resource-exhausted", L.LIMITS[kind].message, "rateLimit");
      tx.set(ref, { count: count + 1, expireAt: Timestamp.fromMillis(at + L.limitTtlMs(kind)) }, { merge: true });
    });
  }

  // ---------- logs ----------
  async function adminLog(c, { action, id, title, reason = "", changes, details, snapshot }) {
    try {
      const entry = await deps.adminLogEntry(db, { feature: "featureLab", action, itemPath: itemPath(id), itemTitle: title, actorUid: c.uid, actorName: c.name || c.displayName || "Admin", reason, changes, snapshot, details });
      await db.collection("adminLog").add(entry);
    } catch (err) { console.error("lab: adminLog write failed", String((err && err.message) || err).slice(0, 160)); }
  }
  async function activity(type, summary, actorName, idea, id, extra = {}) {
    if (idea.hidden === true) return;
    try {
      await db.collection("activityLog").add({ feature: "feature-lab", type, summary, link: `/feature-lab?idea=${id}`, actorName: actorName || null, ideaId: id, ...extra, createdAt: FieldValue.serverTimestamp() });
    } catch (err) { console.error("lab: activityLog write failed", String((err && err.message) || err).slice(0, 160)); }
  }
  async function outbox(doc) {
    try { await db.collection(`sites/${SITE_ID}/notifyOutbox`).add({ ...doc, streamId: null, week: null, status: "pending", createdAt: FieldValue.serverTimestamp(), expireAt: Timestamp.fromMillis(now() + OUTBOX_TTL_MS) }); }
    catch (err) { console.error("lab: notifyOutbox write failed", String((err && err.message) || err).slice(0, 160)); }
  }
  /** A Night Shift event (never throws; recordFactoryEvent already logs its own failures). */
  async function nightShift(uid, action, ref) {
    try { const r = await factory().recordFactoryEvent(uid, "lab", { action }, ref, { keep: true }); return !!(r && r.counted); }
    catch (err) { console.error("lab: Night Shift event failed", String((err && err.message) || err).slice(0, 160)); return false; }
  }

  // ---------- labSubmit ----------
  async function submit(request) {
    const c = requireVerifiedMember(await caller(request));
    const v = L.validateIdea(request.data);
    if (!v.ok) throw raise(v);
    const { title, description, area, token } = v.value;
    // a double click or a retry with the same token is the same idea, and costs no part of the daily limit
    const seen = await tokenRef(token).get();
    if (seen.exists) {
      if (seen.get("uid") === c.uid) return { ok: true, id: seen.get("ideaId"), already: true, counted: false };
      throw fail("failed-precondition", "Reload the page and try again.", "token");
    }
    await bump("submit", c.uid);
    const at = now();
    const ref = db.collection(`${base}/ideas`).doc();
    const by = byOf(c);
    const idea = {
      title, description, area, status: "submitted", priority: null, by, voteCount: 1, commentCount: 0, hidden: false,
      statusChangedAt: Timestamp.fromMillis(at), statusHistory: [{ status: "submitted", changedBy: { uid: c.uid, handle: c.handle }, changedAt: Timestamp.fromMillis(at) }],
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    };
    await db.runTransaction(async (tx) => {
      const t = await tx.get(tokenRef(token));
      if (t.exists) throw fail("failed-precondition", "Reload the page and try again.", "token");
      tx.set(tokenRef(token), { uid: c.uid, ideaId: ref.id, expireAt: Timestamp.fromMillis(at + TOKEN_TTL_MS) });
      tx.set(ref, idea);
      tx.set(voteRef(ref.id, c.uid), { createdAt: FieldValue.serverTimestamp() });
      tx.set(myVotesRef(c.uid), { ids: FieldValue.arrayUnion(ref.id) }, { merge: true });
    });
    await activity("submitted", `${c.name || `@${c.handle}`} suggested "${title}"`, c.name, idea, ref.id);
    const counted = await nightShift(c.uid, "post", `post-${ref.id}`);
    return { ok: true, id: ref.id, counted };
  }

  // ---------- labVote ----------
  async function vote(request) {
    const c = requireVerifiedMember(await caller(request));
    const { id, on } = request.data || {};
    if (!idStr(id) || typeof on !== "boolean") throw fail("invalid-argument", "Say which idea and whether to vote.", "args");
    await bump("vote", c.uid);
    const out = await db.runTransaction(async (tx) => {
      const [snap, vs] = await Promise.all([tx.get(ideaRef(id)), tx.get(voteRef(id, c.uid))]);
      const refusal = L.voteRefusal(snap.exists ? snap.data() : null);
      if (refusal) throw raise(refusal);
      const idea = snap.data();
      if (on && !vs.exists) {
        tx.set(voteRef(id, c.uid), { createdAt: FieldValue.serverTimestamp() });
        tx.update(ideaRef(id), { voteCount: FieldValue.increment(1) });
        tx.set(myVotesRef(c.uid), { ids: FieldValue.arrayUnion(id) }, { merge: true });
        return { changed: true, voted: true, voteCount: (idea.voteCount || 0) + 1, own: idea.by && idea.by.uid === c.uid };
      }
      if (!on && vs.exists) {
        tx.delete(voteRef(id, c.uid));
        tx.update(ideaRef(id), { voteCount: FieldValue.increment(-1) });
        tx.set(myVotesRef(c.uid), { ids: FieldValue.arrayRemove(id) }, { merge: true });
        return { changed: true, voted: false, voteCount: Math.max(0, (idea.voteCount || 0) - 1), own: false };
      }
      return { changed: false, voted: vs.exists, voteCount: idea.voteCount || 0, own: false };
    });
    let counted = false;
    if (out.changed && out.voted && !out.own) counted = await nightShift(c.uid, "vote", `vote-${id}`);
    return { ok: true, voted: out.voted, voteCount: out.voteCount, counted };
  }

  // ---------- labComment ----------
  async function comment(request) {
    const c = requireVerifiedMember(await caller(request));
    const { id, text } = request.data || {};
    if (!idStr(id)) throw fail("invalid-argument", "Say which idea.", "args");
    const v = L.validateComment(text);
    if (!v.ok) throw raise(v);
    await bump("comment", c.uid);
    const ref = commentsOf(id).doc();
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ideaRef(id));
      if (!snap.exists || snap.get("hidden") === true) throw fail("not-found", "This idea is no longer here.", "noIdea");
      tx.set(ref, { text: v.value, by: byOf(c), staffTag: c.isAdmin ? "admin" : c.isMod ? "mod" : null, hidden: false, createdAt: FieldValue.serverTimestamp() });
      tx.update(ideaRef(id), { commentCount: FieldValue.increment(1) });
    });
    return { ok: true, commentId: ref.id };
  }

  // ---------- labTriage ----------
  async function triage(request) {
    const c = requireAdmin(await caller(request));
    const { id } = request.data || {};
    if (!idStr(id)) throw fail("invalid-argument", "Say which idea.", "args");
    const at = now();
    const by = { uid: c.uid, handle: c.handle };
    const res = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ideaRef(id));
      const idea = snap.exists ? snap.data() : null;
      const plan = L.planTriage(idea, request.data, { by, at: Timestamp.fromMillis(at) });
      if (!plan.ok) throw raise(plan);
      const update = { ...plan.patch, updatedAt: FieldValue.serverTimestamp() };
      if (plan.historyEntry) update.statusHistory = [...(idea.statusHistory || []), plan.historyEntry].slice(-L.HISTORY_MAX);
      if (plan.statusChanged) update.statusChangedAt = FieldValue.serverTimestamp();
      if (plan.firstTriage) update.firstTriagedAt = FieldValue.serverTimestamp();
      if (plan.firstShipped) update.shippedAt = FieldValue.serverTimestamp();
      tx.update(ideaRef(id), update);
      return { plan, idea };
    });
    const { plan, idea } = res;
    const changes = {};
    if (plan.statusChanged) changes.status = { before: plan.from, after: plan.to };
    if (plan.priorityChanged) changes.priority = { before: idea.priority ?? null, after: plan.patch.priority ?? null };
    const note = plan.historyEntry && plan.historyEntry.note ? plan.historyEntry.note : "";
    await adminLog(c, { action: "triage", id, title: idea.title, reason: note, changes: Object.keys(changes).length ? changes : undefined, details: note && !plan.statusChanged ? { note: note.slice(0, 300) } : undefined });
    const authorUid = idea.by && idea.by.uid;
    const rewards = { gears: false, architect: false };
    if (plan.statusChanged) {
      await activity("status-changed", `"${idea.title}" moved to ${L.STATUS_LABEL[plan.to]}`, c.name, idea, id, { status: plan.to });
      if (authorUid) await outbox({ type: "report-update", audience: "uids", uids: [authorUid], payload: { kind: "feature-lab", ideaId: id, title: idea.title, status: plan.to, statusLabel: L.STATUS_LABEL[plan.to], link: `/feature-lab?idea=${id}` } });
    }
    if (plan.firstTriage) {
      try { const r = await hooks().noteLabReview(c.uid, id); rewards.gears = !!(r && r.granted); } catch (err) { console.error("lab: Gears hook failed", String((err && err.message) || err).slice(0, 160)); }
    }
    if (plan.firstShipped) {
      await activity("shipped", `"${idea.title}" shipped`, c.name, idea, id, { status: "shipped" });
      if (authorUid) {
        try { const r = await grant().grantBadge(authorUid, "architect", { feature: "lab", ref: id, grantedBy: c.uid }); rewards.architect = !!(r && r.granted); }
        catch (err) { console.error("lab: The Architect grant failed", String((err && err.message) || err).slice(0, 160)); }
        await nightShift(authorUid, "shipped", `shipped-${id}`);
      }
    }
    return { ok: true, status: plan.to, statusChanged: plan.statusChanged, rewards };
  }

  // ---------- labHide ----------
  async function hide(request) {
    const c = requireStaff(await caller(request));
    const { id, commentId } = request.data || {};
    if (!idStr(id) || (commentId != null && !idStr(commentId))) throw fail("invalid-argument", "Say which idea.", "args");
    const v = L.validateHide(request.data);
    if (!v.ok) throw raise(v);
    const { hidden, reason } = v.value;
    const out = await db.runTransaction(async (tx) => {
      const iSnap = await tx.get(ideaRef(id));
      if (!iSnap.exists) throw fail("not-found", "This idea is no longer here.", "noIdea");
      const target = commentId ? commentsOf(id).doc(commentId) : ideaRef(id);
      const tSnap = commentId ? await tx.get(target) : iSnap;
      if (!tSnap.exists) throw fail("not-found", "That comment is no longer here.", "noComment");
      if ((tSnap.get("hidden") === true) === hidden) return { changed: false, idea: iSnap.data() };
      const update = hidden
        ? { hidden: true, hiddenBy: { uid: c.uid, handle: c.handle }, hiddenReason: reason }
        : { hidden: false, hiddenBy: FieldValue.delete(), hiddenReason: FieldValue.delete() };
      if (!commentId) update.updatedAt = FieldValue.serverTimestamp();
      tx.update(target, update);
      // the public comment count is the number of comments people can see
      if (commentId) tx.update(ideaRef(id), { commentCount: FieldValue.increment(hidden ? -1 : 1) });
      return { changed: true, idea: iSnap.data() };
    });
    if (out.changed) await adminLog(c, { action: hidden ? "hide" : "unhide", id, title: out.idea.title, reason, details: commentId ? { commentId } : undefined });
    return { ok: true, changed: out.changed, hidden };
  }

  // ---------- labDelete ----------
  async function remove(request) {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw fail("unauthenticated", "Sign in first.", "signedOut");
    const { id } = request.data || {};
    if (!idStr(id)) throw fail("invalid-argument", "Say which idea.", "args");
    const store = crewStore();
    const w = await store.who(uid);
    if (!w.isAdmin) throw fail("permission-denied", "Admins only.", "notAdmin");
    if (!L.canDelete(w, store.a2plus)) throw fail("permission-denied", "Deleting needs the owner or a Right Hand. Hide it and leave a note instead.", "needsRightHand");
    const snap = await ideaRef(id).get();
    if (!snap.exists) throw fail("not-found", "This idea is no longer here.", "noIdea");
    const idea = snap.data();
    // 1. the events first, so a retry after a partial failure still finds the idea
    const ev = (await db.collection("activityLog").where("ideaId", "==", id).get()).docs.filter((d) => d.get("feature") === "feature-lab");
    for (let i = 0; i < ev.length; i += 400) { const b = db.batch(); ev.slice(i, i + 400).forEach((d) => b.delete(d.ref)); await b.commit(); }
    // 2. the idea with its comments and votes, then the marks it left behind
    await db.recursiveDelete(ideaRef(id));
    const marks = (await db.collection(`${base}/myVotes`).where("ids", "array-contains", id).get()).docs;
    for (let i = 0; i < marks.length; i += 400) { const b = db.batch(); marks.slice(i, i + 400).forEach((d) => b.update(d.ref, { ids: FieldValue.arrayRemove(id) })); await b.commit(); }
    const toks = (await db.collection(`${base}/submitTokens`).where("ideaId", "==", id).get()).docs;
    for (let i = 0; i < toks.length; i += 400) { const b = db.batch(); toks.slice(i, i + 400).forEach((d) => b.delete(d.ref)); await b.commit(); }
    await adminLog({ uid, name: w.name }, { action: "delete", id, title: idea.title, snapshot: L.snapshotOf(idea), details: { activityDeleted: ev.length, votesCleared: marks.length } });
    return { ok: true, activityDeleted: ev.length };
  }

  const functions = {
    labSubmit: onCall(submit), labVote: onCall(vote), labComment: onCall(comment),
    labTriage: onCall(triage), labHide: onCall(hide), labDelete: onCall(remove),
  };
  const editor = require("./edit")({ db, adminLogEntry: deps.adminLogEntry, now });
  return { functions, ops: { submit, vote, comment, triage, hide, remove }, editLabIdea: editor.editLabIdea, base };
}

module.exports = function lab(deps) { return build(deps); };
module.exports.build = build;
