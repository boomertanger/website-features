// Bug Zapper callables (docs/specs/bug-zapper.md §3, §4). Every document under sites/boomertanger/bugs/main is written ONLY here (Admin SDK);
// firestore.rules gives clients read access to what the spec says and no write access at all.
//
//   bugSubmit      verified members, staff   a new report (5 a day, one report per post token); signed screenshot params when wantsShot
//   bugShotParams  the reporter, staff       fresh signed upload params for bug-zapper/<id>/shot (authenticated)
//   bugAttachShot  the reporter, staff       checks the uploaded file with the Admin API, records the asset, sets shotRef
//   bugShotUrl     the reporter, staff       a 10-minute signed link to the screenshot
//   bugMeToo       verified members          "bit me too" on or off (60 changes an hour; frozen on closed reports)
//   bugReply       the reporter, staff       a reply in the private thread (20 an hour)
//   bugTriage      admins                    status, priority, duplicate-of, a note; the one-time rewards (+3 Gears, Bug Finder) and alerts
//   bugHide        mods, admins              hide or unhide a report or a reply, with a reason
//   bugDelete      owner, A2, A3             Cloudinary, asset records, events, the report and its subcollections, "bit me too" marks
//   bugTidy        daily 04:30 Los Angeles   clears screenshot uploads that were never attached
// (adminEditItem's new kind bugReport is in edit.js, dispatched from functions/index.js like vaultGame and labIdea.)
//
// Data: bugs/main/reports/{id} (+ staff/info, thread/{cid}, meToo/{uid}), bugs/main/myMeToos/{uid}, bugs/main/submitTokens/{token}; rate-limit counters in the
// existing rateLimits collection as bugs_<kind>_<hash(uid|period)>. Logs: adminLog (feature "bugZapper"), activityLog (feature "bug-zapper", type fixed, never for
// a private or hidden report), notifyOutbox bug-new (admins) and report-update (the reporter on every status change and staff reply; everyone who bit on Fixed).
// Night Shift: type "bugs" (report, confirmed). Callable errors carry details.reason so the site can show the right message.
//
// build(deps) is what scripts/check-bugs.js runs against the in-memory Firestore. deps: adminLogEntry, now(), factory { recordFactoryEvent }, grant { grantBadge },
// crewHooks { noteBugTriage }, crewStore (the grade check on delete), cloud (lib/cloudinary.js), cloudCreds(), cloudSecrets, performAssetDeletion, cloudinaryDelete,
// recordAssetCreated, fetch.
const { onCall } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const L = require("./logic");
const { SITE_ID, fail, requireVerifiedMember, requireStaff, requireAdmin } = require("../vault/common");
const { dayKey } = require("../arcade/logic");
const { makeBoards, raise, idStr } = require("../boards");

const TOKEN_TTL_MS = L.DAY_MS;
const SHOT_SWEEP_FOLDER = "bug-zapper";
const SHOT_PENDING_MS = L.DAY_MS;
const shotId = (id) => `bug-zapper/${id}/shot`;
const UIDS_PER_ALERT = 400;

function build(deps = {}) {
  const db = deps.db || admin.firestore();
  const { FieldValue, Timestamp } = admin.firestore;
  const now = deps.now || Date.now;
  const base = `sites/${SITE_ID}/bugs/main`;
  const reportRef = (id) => db.doc(`${base}/reports/${id}`);
  const infoRef = (id) => db.doc(`${base}/reports/${id}/staff/info`);
  const threadOf = (id) => db.collection(`${base}/reports/${id}/thread`);
  const meTooRef = (id, uid) => db.doc(`${base}/reports/${id}/meToo/${uid}`);
  const myMeToosRef = (uid) => db.doc(`${base}/myMeToos/${uid}`);
  const tokenRef = (t) => db.doc(`${base}/submitTokens/${t}`);
  const itemPath = (id) => `${base}/reports/${id}`;
  const reportsPath = `${base}/reports`;

  // lazy collaborators (they need initializeApp, and the checks swap them)
  let grantMod = deps.grant, hooksMod = deps.crewHooks, crewStoreMod = deps.crewStore, cloudMod = deps.cloud;
  const grant = () => (grantMod ||= require("../rewards/grant"));
  const hooks = () => (hooksMod ||= require("../crew/hooks"));
  const crewStore = () => (crewStoreMod ||= require("../crew/store").makeStore({ db, adminLogEntry: deps.adminLogEntry }));
  const cloud = () => (cloudMod ||= require("../cloudinary"));
  const fetchFn = deps.fetch || ((...a) => fetch(...a));
  const creds = () => deps.cloudCreds();

  const B = makeBoards({
    db, now, adminLogEntry: deps.adminLogEntry, label: "bugs", logKey: "bugZapper", itemPath, factory: deps.factory,
    activityFeature: "bug-zapper", linkOf: (id) => `/bug-zapper?report=${id}`, idField: "reportId", factoryType: "bugs",
    rate: { prefix: "bugs", limits: L.LIMITS, periodKey: (kind, at) => L.periodKey(kind, at, dayKey), ttlMs: L.limitTtlMs, overLimit: L.overLimit },
  });
  const { caller, byOf, bump, adminLog, activity, outbox, nightShift } = B;
  const link = (id) => `/bug-zapper?report=${id}`;
  const assetsOf = (id) => db.collection("externalAssets").where("linkedDoc.collection", "==", reportsPath).where("linkedDoc.docId", "==", id).get();

  /** report-update to some members (chunked). Never throws (outbox already logs its failures). */
  async function tell(uids, payload) {
    const list = [...new Set(uids.filter(Boolean))];
    for (let i = 0; i < list.length; i += UIDS_PER_ALERT) await outbox({ type: "report-update", audience: "uids", uids: list.slice(i, i + UIDS_PER_ALERT), payload: { kind: "bug-zapper", ...payload } });
  }
  const statusPayload = (id, r, extra = {}) => ({ reportId: id, title: r.title, link: link(id), ...extra });

  // ---------- bugSubmit ----------
  async function submit(request) {
    const c = requireVerifiedMember(await caller(request));
    const v = L.validateReport(request.data);
    if (!v.ok) throw raise(v);
    const { title, page, whatHappened, expected, steps, severity, device, wantsShot, token } = v.value;
    // a double click or a retry with the same token is the same report, and costs no part of the daily limit
    const already = await B.seenToken(tokenRef(token), c.uid, "reportId");
    if (already) return { ok: true, id: already, already: true, counted: false };
    await bump("submit", c.uid);
    const at = now();
    const ref = db.collection(reportsPath).doc();
    const by = byOf(c);
    const report = {
      title, page, whatHappened, expected, steps, severity, status: "open", priority: null, private: v.value.private, hidden: false, closed: false, by,
      meTooCount: 0, threadCount: 0, statusChangedAt: Timestamp.fromMillis(at), statusHistory: [{ status: "open", changedBy: { uid: c.uid, handle: c.handle }, changedAt: Timestamp.fromMillis(at) }],
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    };
    await db.runTransaction(async (tx) => {
      await B.claimToken(tx, tokenRef(token), { uid: c.uid, reportId: ref.id }, at, TOKEN_TTL_MS);
      tx.set(ref, report);
      tx.set(infoRef(ref.id), device ? { device } : {});
    });
    await outbox({ type: "bug-new", audience: "admins", priority: severity === "critical" ? "high" : "normal", payload: { kind: "bug-zapper", reportId: ref.id, title, severity, private: v.value.private, link: link(ref.id) } });
    const counted = await nightShift(c.uid, "report", `report-${ref.id}`);
    const out = { ok: true, id: ref.id, counted };
    if (wantsShot) out.upload = { publicId: shotId(ref.id), ...cloud().uploadParams({ creds: creds(), type: "authenticated", publicId: shotId(ref.id), context: `owner=${c.uid}`, now: at }) };
    return out;
  }

  // ---------- the screenshot ----------
  async function loadForShot(request, c) {
    const { id } = request.data || {};
    if (!idStr(id)) throw fail("invalid-argument", "Say which report.", "args");
    const snap = await reportRef(id).get();
    return { id, report: snap.exists ? snap.data() : null };
  }
  async function shotParams(request) {
    const c = requireVerifiedMember(await caller(request));
    const { id, report } = await loadForShot(request, c);
    const refusal = L.shotRefusal(report, c);
    if (refusal) throw raise(refusal);
    return { ok: true, publicId: shotId(id), ...cloud().uploadParams({ creds: creds(), type: "authenticated", publicId: shotId(id), context: `owner=${c.uid}`, now: now() }) };
  }
  async function attachShot(request) {
    const c = requireVerifiedMember(await caller(request));
    const { id, report } = await loadForShot(request, c);
    const { publicId } = request.data || {};
    if (publicId !== shotId(id)) throw fail("invalid-argument", "That isn't this report's upload.", "args");
    const refusal = L.shotRefusal(report, c);
    if (refusal) throw raise(refusal);
    const info = await cloud().resourceInfo(fetchFn, creds(), publicId, "authenticated");
    const problem = L.shotProblem(info);
    if (problem) {
      if (info) await deps.cloudinaryDelete({ publicId, resourceType: "image", type: "authenticated", ...creds() }).catch((e) => console.error("bugs: couldn't remove a refused screenshot", e));
      throw fail("invalid-argument", "That file can't be a screenshot. Use a JPG, PNG or WebP under 10 MB.", "badShot", { problem });
    }
    if (info.context?.custom?.owner !== c.uid) throw fail("permission-denied", "That upload isn't yours.", "notOwner");
    if (!(await db.collection("externalAssets").where("publicId", "==", publicId).limit(1).get()).empty) throw fail("already-exists", "That upload was already attached.", "inUse");
    await deps.recordAssetCreated({ url: info.secure_url, publicId, feature: "bugZapper", sizeBytes: info.bytes, deliveryType: "authenticated", linkedCollection: reportsPath, linkedDocId: id, linkedField: "shotRef" });
    await reportRef(id).update({ shotRef: publicId, updatedAt: FieldValue.serverTimestamp() });
    await infoRef(id).set({ shot: { publicId, format: String(info.format || "").toLowerCase(), bytes: info.bytes, width: info.width || null, height: info.height || null } }, { merge: true });
    return { ok: true };
  }
  async function shotUrl(request) {
    const c = requireVerifiedMember(await caller(request));
    const { id, report } = await loadForShot(request, c);
    if (!report || (report.hidden === true && !c.isStaff)) throw fail("not-found", "This report is no longer here.", "noReport");
    if (!L.canSeePrivate(report, c)) throw fail("permission-denied", "Only the reporter and the team can see the screenshot.", "notYours");
    // shotRef is the truth: a purge clears it, and the info doc's shot may still be there until the next write
    if (!report.shotRef) throw fail("not-found", "There is no screenshot on this report.", "noShot");
    const info = (await infoRef(id).get()).data() || {};
    const format = (info.shot && info.shot.publicId === report.shotRef && info.shot.format) || "png";
    return { ok: true, url: cloud().previewUrl(creds(), report.shotRef, format, now()), expiresInS: cloud().PREVIEW_TTL_S };
  }

  // ---------- bugMeToo ----------
  async function meToo(request) {
    const c = requireVerifiedMember(await caller(request));
    const { id, on } = request.data || {};
    if (!idStr(id) || typeof on !== "boolean") throw fail("invalid-argument", "Say which report and whether it bit you too.", "args");
    await bump("meToo", c.uid);
    const out = await db.runTransaction(async (tx) => {
      const [snap, ms] = await Promise.all([tx.get(reportRef(id)), tx.get(meTooRef(id, c.uid))]);
      const report = snap.exists ? snap.data() : null;
      const refusal = L.meTooRefusal(report, c.uid);
      if (refusal) throw raise(refusal);
      if (on && !ms.exists) {
        tx.set(meTooRef(id, c.uid), { createdAt: FieldValue.serverTimestamp() });
        tx.update(reportRef(id), { meTooCount: FieldValue.increment(1) });
        tx.set(myMeToosRef(c.uid), { ids: FieldValue.arrayUnion(id) }, { merge: true });
        return { on: true, meTooCount: (report.meTooCount || 0) + 1 };
      }
      if (!on && ms.exists) {
        tx.delete(meTooRef(id, c.uid));
        tx.update(reportRef(id), { meTooCount: FieldValue.increment(-1) });
        tx.set(myMeToosRef(c.uid), { ids: FieldValue.arrayRemove(id) }, { merge: true });
        return { on: false, meTooCount: Math.max(0, (report.meTooCount || 0) - 1) };
      }
      return { on: ms.exists, meTooCount: report.meTooCount || 0 };
    });
    return { ok: true, ...out };
  }

  // ---------- bugReply ----------
  async function reply(request) {
    const c = requireVerifiedMember(await caller(request));
    const { id, text } = request.data || {};
    if (!idStr(id)) throw fail("invalid-argument", "Say which report.", "args");
    const v = L.validateReply(text);
    if (!v.ok) throw raise(v);
    await bump("reply", c.uid);
    const replyId = await B.addReply({
      itemRef: reportRef(id), repliesRef: threadOf(id), value: v.value, c, countField: "threadCount", missing: ["noReport", "This report is no longer here."],
      gate: (report) => { const r = L.replyRefusal(report, c); if (r) throw raise(r); },
    });
    if (c.isStaff) {
      const report = (await reportRef(id).get()).data();
      if (report && report.by && report.by.uid && report.by.uid !== c.uid) await tell([report.by.uid], statusPayload(id, report, { reply: true, staffHandle: c.handle || null }));
    }
    return { ok: true, replyId };
  }

  // ---------- bugTriage ----------
  async function triage(request) {
    const c = requireAdmin(await caller(request));
    const { id } = request.data || {};
    if (!idStr(id)) throw fail("invalid-argument", "Say which report.", "args");
    const at = now();
    const by = { uid: c.uid, handle: c.handle };
    const res = await db.runTransaction(async (tx) => {
      const snap = await tx.get(reportRef(id));
      const report = snap.exists ? snap.data() : null;
      const plan = L.planTriage(report, request.data, { by, at: Timestamp.fromMillis(at) });
      if (!plan.ok) throw raise(plan);
      let original = null;
      if (plan.duplicateOf) {
        if (plan.duplicateOf === id || !idStr(plan.duplicateOf)) throw fail("invalid-argument", "A report can't be a duplicate of itself.", "duplicateOf");
        const o = await tx.get(reportRef(plan.duplicateOf));
        if (!o.exists || o.get("hidden") === true) throw fail("not-found", "That report isn't there.", "duplicateOf");
        original = { id: plan.duplicateOf, ...o.data() };
      }
      const update = { ...plan.patch, updatedAt: FieldValue.serverTimestamp() };
      if (plan.historyEntry) update.statusHistory = [...(report.statusHistory || []), plan.historyEntry].slice(-L.HISTORY_MAX);
      if (plan.statusChanged) update.statusChangedAt = FieldValue.serverTimestamp();
      if (plan.firstTriage) update.firstTriagedAt = FieldValue.serverTimestamp();
      if (plan.firstConfirmed) update.confirmedAt = FieldValue.serverTimestamp();
      if (plan.firstFixed) update.fixedAt = FieldValue.serverTimestamp();
      if (plan.closes) update.closedAt = FieldValue.serverTimestamp();
      if (plan.reopens) update.closedAt = FieldValue.delete();
      tx.update(reportRef(id), update);
      return { plan, report, original };
    });
    const { plan, report, original } = res;
    const changes = {};
    if (plan.statusChanged) changes.status = { before: plan.from, after: plan.to };
    if (plan.priorityChanged) changes.priority = { before: report.priority ?? null, after: plan.patch.priority ?? null };
    const note = plan.historyEntry && plan.historyEntry.note ? plan.historyEntry.note : "";
    await adminLog(c, { action: "triage", id, title: report.title, reason: note, changes: Object.keys(changes).length ? changes : undefined, details: { ...(note && !plan.statusChanged ? { note: note.slice(0, 300) } : {}), ...(plan.duplicateOf ? { duplicateOf: plan.duplicateOf } : {}) } });
    const reporterUid = report.by && report.by.uid;
    const rewards = { gears: false, badge: false };
    if (plan.statusChanged && reporterUid) await tell([reporterUid], statusPayload(id, report, { status: plan.to, statusLabel: L.STATUS_LABEL[plan.to] }));
    if (plan.firstTriage) {
      try { const r = await hooks().noteBugTriage(c.uid, id); rewards.gears = !!(r && r.granted); } catch (err) { console.error("bugs: Gears hook failed", String((err && err.message) || err).slice(0, 160)); }
    }
    if (plan.firstConfirmed && reporterUid) {
      try { const r = await grant().grantBadge(reporterUid, "bug-finder", { feature: "bugs", ref: id, grantedBy: c.uid }); rewards.badge = !!(r && r.granted); }
      catch (err) { console.error("bugs: Bug Finder grant failed", String((err && err.message) || err).slice(0, 160)); }
      await nightShift(reporterUid, "confirmed", `confirmed-${id}`);
    }
    if (plan.firstFixed) {
      await activity("fixed", `"${report.title}" was fixed`, c.name, report, id, { status: "fixed" });
      const bit = (await db.collection(`${reportsPath}/${id}/meToo`).get()).docs.map((d) => d.id);
      await tell(bit.filter((u) => u !== reporterUid), statusPayload(id, report, { status: "fixed", statusLabel: L.STATUS_LABEL.fixed }));
    }
    if (plan.duplicateOf && original) await addToOriginal(original, report);
    return { ok: true, status: plan.to, statusChanged: plan.statusChanged, rewards };
  }

  /** Marking Duplicate adds the duplicate's reporter as a "bit me too" on the original (counts and myMeToos, no events, never on a private original). */
  async function addToOriginal(original, duplicate) {
    const uid = duplicate.by && duplicate.by.uid;
    if (!uid || original.private === true || (original.by && original.by.uid === uid)) return;
    try {
      await db.runTransaction(async (tx) => {
        const ms = await tx.get(meTooRef(original.id, uid));
        if (ms.exists) return;
        tx.set(meTooRef(original.id, uid), { createdAt: FieldValue.serverTimestamp(), fromDuplicate: true });
        tx.update(reportRef(original.id), { meTooCount: FieldValue.increment(1) });
        tx.set(myMeToosRef(uid), { ids: FieldValue.arrayUnion(original.id) }, { merge: true });
      });
    } catch (err) { console.error("bugs: couldn't add the duplicate's reporter to the original", String((err && err.message) || err).slice(0, 160)); }
  }

  // ---------- bugHide ----------
  async function hide(request) {
    const c = requireStaff(await caller(request));
    const { id, replyId } = request.data || {};
    if (!idStr(id) || (replyId != null && !idStr(replyId))) throw fail("invalid-argument", "Say which report.", "args");
    const v = L.validateHide(request.data);
    if (!v.ok) throw raise(v);
    const { hidden, reason } = v.value;
    const out = await B.setHidden({ itemRef: reportRef(id), repliesRef: threadOf(id), replyId: replyId || null, hidden, reason, c, countField: "threadCount", missing: { item: ["noReport", "This report is no longer here."], reply: ["noReply", "That reply is no longer here."] } });
    if (out.changed) await adminLog(c, { action: hidden ? "hide" : "unhide", id, title: out.item.title, reason, details: replyId ? { replyId } : undefined });
    return { ok: true, changed: out.changed, hidden };
  }

  // ---------- bugDelete ----------
  async function remove(request) {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw fail("unauthenticated", "Sign in first.", "signedOut");
    const { id } = request.data || {};
    if (!idStr(id)) throw fail("invalid-argument", "Say which report.", "args");
    const store = crewStore();
    const w = await store.who(uid);
    if (!w.isAdmin) throw fail("permission-denied", "Admins only.", "notAdmin");
    if (!L.canDelete(w, store.a2plus)) throw fail("permission-denied", "Deleting needs the owner or a Right Hand. Hide it instead.", "needsRightHand");
    const snap = await reportRef(id).get();
    if (!snap.exists) throw fail("not-found", "This report is no longer here.", "noReport");
    const report = snap.data();
    // 1. Cloudinary first, through the approved delete path (it also removes the asset record); a retry after a partial failure still finds the report
    const assets = await assetsOf(id);
    for (const a of assets.docs) await deps.performAssetDeletion(a.id, creds(), { clearLinkedField: false });
    if (report.shotRef && assets.empty) await deps.cloudinaryDelete({ publicId: report.shotRef, resourceType: "image", type: "authenticated", ...creds() }).catch((e) => console.error("bugs: couldn't delete an unrecorded screenshot", e));
    // 2. the events, 3. the report with its subcollections, the marks it left behind and its post tokens
    const activityDeleted = await B.deleteEvents(id);
    const marksCleared = await B.deleteTree({ id, itemRef: reportRef(id), marksCollection: `${base}/myMeToos`, tokensCollection: `${base}/submitTokens`, tokenField: "reportId" });
    // 4. the log
    await adminLog({ uid, name: w.name }, { action: "delete", id, title: report.title, snapshot: L.snapshotOf(report), details: { activityDeleted, marksCleared, assetsDeleted: assets.size } });
    return { ok: true, activityDeleted };
  }

  // ---------- bugTidy: screenshot uploads that were never attached ----------
  async function tidy() {
    const cutoff = now() - SHOT_PENDING_MS;
    let removed = 0;
    for (const f of await cloud().listFolder(fetchFn, creds(), SHOT_SWEEP_FOLDER)) {
      if (f.createdAt > cutoff) continue;
      if (!(await db.collection("externalAssets").where("publicId", "==", f.publicId).limit(1).get()).empty) continue;
      try { await deps.cloudinaryDelete({ publicId: f.publicId, resourceType: "image", type: "authenticated", ...creds() }); removed++; }
      catch (err) { console.error(`bugTidy: couldn't delete ${f.publicId}`, err); }
    }
    console.log(`bugTidy: removed ${removed} unattached upload(s)`);
    return removed;
  }

  const secrets = deps.cloudSecrets;
  const functions = {
    bugSubmit: onCall({ secrets }, submit), bugShotParams: onCall({ secrets }, shotParams), bugAttachShot: onCall({ secrets }, attachShot), bugShotUrl: onCall({ secrets }, shotUrl),
    bugMeToo: onCall(meToo), bugReply: onCall(reply), bugTriage: onCall(triage), bugHide: onCall(hide), bugDelete: onCall({ secrets }, remove),
    bugTidy: onSchedule({ schedule: "every day 04:30", timeZone: "America/Los_Angeles", secrets }, async () => { await tidy(); }),
  };
  const editor = require("./edit")({ db, adminLogEntry: deps.adminLogEntry, performAssetDeletion: deps.performAssetDeletion, cloudCreds: deps.cloudCreds });
  return { functions, ops: { submit, shotParams, attachShot, shotUrl, meToo, reply, triage, hide, remove, tidy }, editBugReport: editor.editBugReport, base };
}

module.exports = function bugs(deps) { return build(deps); };
module.exports.build = build;
