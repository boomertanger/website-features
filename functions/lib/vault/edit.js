// adminEditItem, new kind "vaultGame" (docs/specs/game-vault.md §5). adminEditItem in
// functions/index.js hands the request here before its own admin check, because this kind
// is gated on the site's roles (admin or owner), not on the legacy admins/{uid} allowlist
// the older kinds use.
//
//   adminEditItem({ feature: "vaultGame", id: slug, changes, before, reason })
//   changes (any of): status, review, boomerTags, legacy, summary, links, cover
//   before: the current value of every changed field, as the editor loaded it (the same
//           conflict check as the other kinds: "This was changed while you were editing.")
//
//   status      "playing" | "finished" | "abandoned" | "wishlist"
//   review      { score 1-10, verdict <= 140, body <= 3000 } | null (removes the review)
//   boomerTags  up to 12 tags of up to 30 characters (tags.boomer)
//   legacy      { streamCount, minutes, lastStreamedAt (ms) | null }: history from before the site
//   summary     up to 2000 characters
//   links       { steam, itch, gog, epic, official }: https links or "" (up to 300 characters)
//   cover       { action: "replace", publicId } (a file the admin uploaded to game-vault/covers,
//               verified server-side) | { action: "remove" } (back to the IGDB / Steam art)
const admin = require("firebase-admin");
const { HttpsError } = require("firebase-functions/v2/https");
const cloud = require("./cloudinary");
const D = require("./digest");
const { fail, callerInfo, requireAdmin } = require("./common");

const STATUSES = ["playing", "finished", "abandoned", "wishlist"];
const LINK_KEYS = ["steam", "itch", "gog", "epic", "official"];
const LOG_CAP = 2000;
const CONFLICT = "This was changed while you were editing.";

const invalid = (field, message) => new HttpsError("invalid-argument", message, { reason: "invalid", field });
const int = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const cap = (v) => (typeof v === "string" && v.length > LOG_CAP ? v.slice(0, LOG_CAP) : v);
const same = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v === undefined ? null : v;
}
const trimmed = (s) => s.replace(/\s+/g, " ").trim();

// ---------- field rules ----------
function validate(field, value) {
  switch (field) {
    case "status":
      if (!STATUSES.includes(value)) throw invalid(field, "Pick one of the four statuses.");
      return value;
    case "review": {
      if (value === null) return null;
      if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid(field, "The review must be a score, a verdict and a body.");
      const { score, verdict = "", body = "" } = value;
      if (!int(score, 1, 10)) throw invalid(field, "The score is a whole number from 1 to 10.");
      if (typeof verdict !== "string" || trimmed(verdict).length > 140) throw invalid(field, "The verdict can be at most 140 characters.");
      if (typeof body !== "string" || body.trim().length > 3000) throw invalid(field, "The review can be at most 3,000 characters.");
      return { score, verdict: trimmed(verdict), body: body.trim() };
    }
    case "boomerTags": {
      if (!Array.isArray(value) || value.length > 12) throw invalid(field, "Up to 12 tags.");
      const tags = value.map((t) => (typeof t === "string" ? trimmed(t) : ""));
      if (tags.some((t) => !t || t.length > 30)) throw invalid(field, "Each tag is 1 to 30 characters.");
      return [...new Set(tags)];
    }
    case "legacy": {
      if (!value || typeof value !== "object") throw invalid(field, "Legacy history needs a stream count, minutes and a last-streamed date.");
      const { streamCount, minutes, lastStreamedAt = null } = value;
      if (!int(streamCount, 0, 9999) || !int(minutes, 0, 1000000)) throw invalid(field, "Stream count is 0 to 9,999 and minutes 0 to 1,000,000.");
      if (lastStreamedAt !== null && !(Number.isFinite(lastStreamedAt) && lastStreamedAt > 0 && lastStreamedAt < Date.now() + 86400000)) throw invalid(field, "The last-streamed date isn't valid.");
      return { streamCount, minutes, lastStreamedAt: lastStreamedAt === null ? null : Math.round(lastStreamedAt) };
    }
    case "summary":
      if (typeof value !== "string" || value.trim().length > 2000) throw invalid(field, "The summary can be at most 2,000 characters.");
      return value.trim();
    case "links": {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid(field, "Links must be an object.");
      const out = {};
      for (const k of Object.keys(value)) {
        if (!LINK_KEYS.includes(k)) throw invalid(field, `${k} isn't a link this game can have.`);
        const v = value[k];
        if (v === "" || v == null) continue;
        let url;
        try { url = new URL(v); } catch { throw invalid(field, `${k}: that isn't a link.`); }
        if (url.protocol !== "https:" || String(v).length > 300) throw invalid(field, `${k}: use an https link of up to 300 characters.`);
        out[k] = url.href;
      }
      return out;
    }
    case "cover": {
      if (!value || (value.action !== "replace" && value.action !== "remove")) throw invalid(field, "Cover change must be replace or remove.");
      if (value.action === "replace" && (typeof value.publicId !== "string" || !value.publicId.startsWith(`${cloud.PUBLIC_FOLDER}/`) || value.publicId.length > 200)) throw invalid(field, "Upload the cover to the covers folder first.");
      return value.action === "replace" ? { action: "replace", publicId: value.publicId } : { action: "remove" };
    }
    default:
      throw invalid(field, `${field} can't be edited.`);
  }
}

/** The value the editor sees for a field, in the same shape as `changes` / `before`. */
function currentValue(field, g) {
  switch (field) {
    case "status": return g.status;
    case "review": return g.review ? { score: g.review.score, verdict: g.review.verdict || "", body: g.review.body || "" } : null;
    case "boomerTags": return g.tags?.boomer || [];
    case "legacy": return { streamCount: g.legacy?.streamCount || 0, minutes: g.legacy?.minutes || 0, lastStreamedAt: g.legacy?.lastStreamedAt ? g.legacy.lastStreamedAt.toMillis() : null };
    case "summary": return g.summary || "";
    case "links": return g.links || {};
    case "cover": return g.cover || null;
    default: return undefined;
  }
}

module.exports = function makeEditor({ store, deps }) {
  const FieldValue = admin.firestore.FieldValue;
  const db = admin.firestore();

  async function editVaultGame(request) {
    const c = requireAdmin(await callerInfo(request));
    const { id, changes, before = {}, reason = "" } = request.data || {};
    if (typeof id !== "string" || !id) throw fail("invalid-argument", "id is required.", "args");
    if (!changes || typeof changes !== "object" || Array.isArray(changes) || !Object.keys(changes).length) throw fail("invalid-argument", "changes is required.", "args");
    if (!before || typeof before !== "object") throw fail("invalid-argument", "before is required.", "args");
    if (typeof reason !== "string" || reason.trim().length > 300) throw invalid("reason", "Reason can be at most 300 characters.");

    const values = {};
    for (const [field, raw] of Object.entries(changes)) {
      if (!(field in before)) throw fail("invalid-argument", `before.${field} is required.`, "args");
      values[field] = validate(field, raw);
    }
    const fields = Object.keys(values);
    const ref = store.games.doc(id);
    const creds = deps.cloudCreds();

    // A cover replace: the admin already uploaded the file; trust nothing the browser says about it.
    let newCover = null, newAssetId = null;
    if (values.cover?.action === "replace") {
      const info = await cloud.resourceInfo(fetch, creds, values.cover.publicId, "upload");
      const problem = cloud.coverProblem(info);
      if (problem) throw invalid("cover", "That file can't be a cover.");
      const used = await db.collection("externalAssets").where("publicId", "==", values.cover.publicId).limit(1).get();
      if (!used.empty) throw fail("failed-precondition", "That upload is already in use.", "inUse");
      newAssetId = await deps.recordAssetCreated({ url: info.secure_url, publicId: info.public_id, feature: "gameVault", sizeBytes: info.bytes, linkedCollection: `sites/${store.SITE_ID}/vaultGames`, linkedDocId: id, linkedField: "cover.url" });
      newCover = { source: "upload", url: info.secure_url, publicId: info.public_id, byHandle: null };
    }

    let result;
    try {
      result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError("not-found", "This game no longer exists.", { reason: "noGame" });
        const g = snap.data();
        for (const f of fields) {
          if (!same(currentValue(f, g), before[f])) throw new HttpsError("aborted", CONFLICT, { reason: "conflict", field: f });
        }
        const update = {}, logChanges = {};
        const note = (f, after) => { logChanges[f] = { before: cap(JSON.stringify(sortKeys(currentValue(f, g)))), after: cap(JSON.stringify(sortKeys(after))) }; };
        let oldAssetPublicId = null, coverAfter;

        for (const f of fields) {
          const v = values[f];
          if (f === "status") {
            if (v === g.status) continue;
            update.status = v; update.statusChangedAt = FieldValue.serverTimestamp(); note(f, v);
          } else if (f === "review") {
            if (same(v, currentValue(f, g))) continue;
            update.review = v === null ? FieldValue.delete() : { ...v, updatedAt: FieldValue.serverTimestamp() }; note(f, v);
          } else if (f === "boomerTags") {
            if (same(v, currentValue(f, g))) continue;
            update["tags.boomer"] = v; note(f, v);
          } else if (f === "legacy") {
            if (same(v, currentValue(f, g))) continue;
            update.legacy = { streamCount: v.streamCount, minutes: v.minutes, lastStreamedAt: store.ts(v.lastStreamedAt) }; note(f, v);
          } else if (f === "summary") {
            if (v === (g.summary || "")) continue;
            update.summary = v || null; note(f, v);
          } else if (f === "links") {
            if (same(v, g.links || {})) continue;
            update.links = v; note(f, v);
          } else if (f === "cover") {
            if (v.action === "replace") coverAfter = newCover;
            else {
              if (!g.cover) continue;
              // back to the art IGDB or Steam provides, or none (the mascot)
              coverAfter = g.ids?.igdb && g.cover.igdbImageId ? { source: "igdb", igdbImageId: g.cover.igdbImageId }
                : g.ids?.steam ? { source: "steam", steamAppId: g.ids.steam } : null;
            }
            oldAssetPublicId = g.cover?.source === "upload" ? g.cover.publicId : null;
            update.cover = coverAfter; note(f, coverAfter ? { source: coverAfter.source, publicId: coverAfter.publicId || null } : null);
          }
        }
        if (!Object.keys(logChanges).length) return { changed: false };

        update.editedAt = FieldValue.serverTimestamp();
        update.editCount = FieldValue.increment(1);
        update.updatedAt = FieldValue.serverTimestamp();
        tx.update(ref, update);
        const changed = Object.keys(logChanges);
        const action = changed.length === 1 && changed[0] === "status" ? "status" : changed.length === 1 && changed[0] === "review" ? "review" : changed.length === 1 && changed[0] === "cover" ? "cover" : "edit";
        tx.set(db.collection("adminLog").doc(), await store.buildLog({ action, slug: id, title: g.title, actorUid: c.uid, actorName: c.name, reason: reason.trim(), changes: logChanges }));
        return { changed: true, g, update, oldAssetPublicId };
      });
    } catch (err) {
      if (newAssetId) await deps.performAssetDeletion(newAssetId, creds, { clearLinkedField: false }).catch((e) => console.error("vault: couldn't roll back the new cover", e));
      throw err;
    }

    const warnings = [];
    if (!result.changed) {
      if (newAssetId) await deps.performAssetDeletion(newAssetId, creds, { clearLinkedField: false }).catch((e) => console.error("vault: couldn't remove the unused cover", e));
      return { ok: true, changed: false, warnings };
    }
    // The game already points at the new cover; only now is the old upload removed.
    if (result.oldAssetPublicId) {
      try {
        const old = await db.collection("externalAssets").where("publicId", "==", result.oldAssetPublicId).limit(1).get();
        if (!old.empty) await deps.performAssetDeletion(old.docs[0].id, creds, { clearLinkedField: false });
      } catch (e) {
        console.error("vault: the old cover wasn't removed", e);
        warnings.push("The old cover couldn't be removed; purge it from Cloud Stash.");
      }
    }
    // Separate "Latest updates" events for a status change.
    const u = result.update, g = result.g;
    if (u.status === "playing") await store.postEvent(D.nowPlayingEvent({ title: g.title, slug: id }));
    if (u.status === "finished") await store.postEvent(D.finishedEvent({ title: g.title, slug: id }, values.review === undefined ? g.review?.score : values.review?.score));
    await store.rebuildPublic();
    return { ok: true, changed: true, warnings };
  }

  return { editVaultGame };
};

module.exports.validate = validate;
