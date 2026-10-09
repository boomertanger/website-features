// adminEditItem, new kind "labIdea" (docs/specs/feature-lab.md §2.4, §4). adminEditItem in functions/index.js hands the request here before its own
// admin check, like the Game Vault's kind, because this kind is gated on the site's roles (admin or owner), not on the legacy admins/{uid} allowlist.
//
//   adminEditItem({ feature: "labIdea", id, changes, before, reason })
//   changes (any of): title (3-200), description (10-2000), area (site | stream | other)
//   before: the current value of every changed field, as the editor loaded it (the same conflict check as the other kinds)
//
// An edit that changes nothing writes nothing. Otherwise: the fields, editedAt, editCount and updatedAt, and one adminLog entry (action edit) with the
// before and after of each changed field. The author, votes, comments, status and history are never touched.
const admin = require("firebase-admin");
const { HttpsError } = require("firebase-functions/v2/https");
const L = require("./logic");
const { SITE_ID, fail, callerInfo, requireAdmin } = require("../vault/common");

const CONFLICT = "This was changed while you were editing.";
const FIELDS = ["title", "description", "area"];
const LOG_CAP = 2000;
const cap = (v) => (typeof v === "string" && v.length > LOG_CAP ? v.slice(0, LOG_CAP) : v);

module.exports = function makeEditor({ db = admin.firestore(), adminLogEntry }) {
  const { FieldValue } = admin.firestore;

  async function editLabIdea(request) {
    const c = requireAdmin(await callerInfo(request));
    const { id, changes, before = {}, reason = "" } = request.data || {};
    if (typeof id !== "string" || !id || id.includes("/")) throw fail("invalid-argument", "id is required.", "args");
    if (!changes || typeof changes !== "object" || Array.isArray(changes) || !Object.keys(changes).length) throw fail("invalid-argument", "changes is required.", "args");
    if (!before || typeof before !== "object") throw fail("invalid-argument", "before is required.", "args");
    if (typeof reason !== "string" || reason.trim().length > 300) throw new HttpsError("invalid-argument", "Reason can be at most 300 characters.", { reason: "invalid", field: "reason" });

    const values = {};
    for (const [field, raw] of Object.entries(changes)) {
      if (!FIELDS.includes(field)) throw new HttpsError("invalid-argument", `${field} can't be edited.`, { reason: "invalid", field });
      if (!(field in before)) throw fail("invalid-argument", `before.${field} is required.`, "args");
      const v = L.validateEditField(field, raw);
      if (!v.ok) throw new HttpsError(v.code, v.message, { reason: v.reason, field: v.field });
      values[field] = v.value;
    }
    const ref = db.doc(`sites/${SITE_ID}/lab/main/ideas/${id}`);
    const out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError("not-found", "This idea is no longer here.", { reason: "noIdea" });
      const idea = snap.data();
      const update = {}, logChanges = {};
      for (const f of Object.keys(values)) {
        if ((idea[f] ?? "") !== (before[f] ?? "")) throw new HttpsError("aborted", CONFLICT, { reason: "conflict", field: f });
        if (values[f] === (idea[f] ?? "")) continue;
        update[f] = values[f];
        logChanges[f] = { before: cap(String(idea[f] ?? "")), after: cap(values[f]) };
      }
      if (!Object.keys(update).length) return { changed: false };
      update.editedAt = FieldValue.serverTimestamp();
      update.editCount = FieldValue.increment(1);
      update.updatedAt = FieldValue.serverTimestamp();
      tx.update(ref, update);
      return { changed: true, idea, logChanges };
    });
    if (!out.changed) return { ok: true, changed: false };
    const entry = await adminLogEntry(db, { feature: "featureLab", action: "edit", itemPath: `sites/${SITE_ID}/lab/main/ideas/${id}`, itemTitle: out.idea.title, actorUid: c.uid, actorName: c.name, reason: reason.trim(), changes: out.logChanges });
    await db.collection("adminLog").add(entry);
    return { ok: true, changed: true };
  }
  return { editLabIdea };
};
