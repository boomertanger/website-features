// adminEditItem, new kind "bugReport" (docs/specs/bug-zapper.md §4). adminEditItem in functions/index.js hands the request here before its own admin check,
// like the Game Vault's and Feature Lab's kinds, because this kind is gated on the site's roles (admin or owner), not on the legacy admins/{uid} allowlist.
//
//   adminEditItem({ feature: "bugReport", id, changes?, before?, removeShot?, reason })
//   changes (any of): title, whatHappened, expected, steps, page, severity (the reporter's own words and severity; admins correct them here), serviceId (the
//   Service Hub service it is about; "" clears it)
//   before: the current value of every changed field, as the editor loaded it (the same conflict check as the other kinds)
//   removeShot: true removes the screenshot (through performAssetDeletion, the one delete path), which clears shotRef
//
// An edit that changes nothing writes nothing. Otherwise: the fields, editedAt, editCount and updatedAt, and one adminLog entry (action edit) with the before and
// after of each changed field (and details.removedShot). The reporter, status, history, thread and "bit me too" marks are never touched.
const admin = require("firebase-admin");
const { HttpsError } = require("firebase-functions/v2/https");
const L = require("./logic");
const { SITE_ID, fail, callerInfo, requireAdmin } = require("../vault/common");

const CONFLICT = "This was changed while you were editing.";
const FIELDS = ["title", "whatHappened", "expected", "steps", "page", "severity", "serviceId"];
const LOG_CAP = 2000;
const cap = (v) => (typeof v === "string" && v.length > LOG_CAP ? v.slice(0, LOG_CAP) : v);

module.exports = function makeEditor({ db = admin.firestore(), adminLogEntry, performAssetDeletion, cloudCreds, links = require("../services/links").makeLinks(db) }) {
  const { FieldValue } = admin.firestore;
  const reportsPath = `sites/${SITE_ID}/bugs/main/reports`;

  async function editBugReport(request) {
    const c = requireAdmin(await callerInfo(request));
    const { id, changes = {}, before = {}, removeShot = false, reason = "" } = request.data || {};
    if (typeof id !== "string" || !id || id.includes("/")) throw fail("invalid-argument", "id is required.", "args");
    if (!changes || typeof changes !== "object" || Array.isArray(changes)) throw fail("invalid-argument", "changes must be an object.", "args");
    if (!Object.keys(changes).length && removeShot !== true) throw fail("invalid-argument", "changes or removeShot is required.", "args");
    if (!before || typeof before !== "object") throw fail("invalid-argument", "before is required.", "args");
    if (typeof reason !== "string" || reason.trim().length > 300) throw new HttpsError("invalid-argument", "Reason can be at most 300 characters.", { reason: "invalid", field: "reason" });


    // serviceId (Service Hub §3a): "" or null clears it; an id must be a real, non-retired service (an admin's explicit pick is refused if it isn't)
    if ("serviceId" in changes) {
      const raw = changes.serviceId;
      if (raw == null || raw === "") changes.serviceId = "";
      else if (!(await links.validServiceId(raw))) throw new HttpsError("invalid-argument", "That isn't a service in the Service Hub.", { reason: "invalid", field: "serviceId" });
    }
    const values = {};
    for (const [field, raw] of Object.entries(changes)) {
      if (!FIELDS.includes(field)) throw new HttpsError("invalid-argument", `${field} can't be edited.`, { reason: "invalid", field });
      if (!(field in before)) throw fail("invalid-argument", `before.${field} is required.`, "args");
      if (field === "serviceId") { values[field] = raw; continue; }
      const v = L.validateEditField(field, raw);
      if (!v.ok) throw new HttpsError(v.code, v.message, { reason: v.reason, field: v.field });
      values[field] = v.value;
    }
    const ref = db.doc(`${reportsPath}/${id}`);
    const out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError("not-found", "This report is no longer here.", { reason: "noReport" });
      const report = snap.data();
      const update = {}, logChanges = {};
      for (const f of Object.keys(values)) {
        if ((report[f] ?? "") !== (before[f] ?? "")) throw new HttpsError("aborted", CONFLICT, { reason: "conflict", field: f });
        if (values[f] === (report[f] ?? "")) continue;
        update[f] = f === "serviceId" && !values[f] ? null : values[f];
        logChanges[f] = { before: cap(String(report[f] ?? "")), after: cap(values[f]) };
      }
      if (!Object.keys(update).length) return { changed: false, report };
      update.editedAt = FieldValue.serverTimestamp();
      update.editCount = FieldValue.increment(1);
      update.updatedAt = FieldValue.serverTimestamp();
      tx.update(ref, update);
      return { changed: true, report, logChanges };
    });
    // the screenshot goes through the one delete path (Cloudinary first, then the asset record and the linked shotRef); the info doc's shot goes with it
    let removed = false;
    if (removeShot === true && out.report.shotRef) {
      const assets = await db.collection("externalAssets").where("linkedDoc.collection", "==", reportsPath).where("linkedDoc.docId", "==", id).get();
      for (const a of assets.docs) await performAssetDeletion(a.id, cloudCreds(), { clearLinkedField: true });
      if (!assets.size) await ref.update({ shotRef: FieldValue.delete() });
      await db.doc(`${reportsPath}/${id}/staff/info`).set({ shot: FieldValue.delete() }, { merge: true });
      removed = true;
    }
    if (!out.changed && !removed) return { ok: true, changed: false };
    const entry = await adminLogEntry(db, {
      feature: "bugZapper", action: "edit", itemPath: `${reportsPath}/${id}`, itemTitle: out.report.title, actorUid: c.uid, actorName: c.name, reason: reason.trim(),
      ...(out.changed ? { changes: out.logChanges } : {}), ...(removed ? { details: { removedShot: true } } : {}),
    });
    await db.collection("adminLog").add(entry);
    return { ok: true, changed: out.changed || removed, removedShot: removed };
  }
  return { editBugReport };
};
