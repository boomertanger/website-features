// Service Hub links (docs/specs/service-hub.md §3a "Bugs and ideas"): which service a Bug Zapper report or a Feature Lab idea is about. Used by bugSubmit,
// labSubmit and their adminEditItem kinds; the counts on the service item are the triggers in index.js (onBugReportService, onLabIdeaService).
//   makeLinks(db).serviceForPath(text)   the service whose routes match the path in text (exact routes first, then [slug] / view patterns); null otherwise
//   makeLinks(db).validServiceId(id)     id when it's a real, non-retired item; null otherwise (never throws: a bad id is dropped, a report is never refused)
//   makeLinks(db).resolve({ serviceId, page })   a valid serviceId, else the page's service (bugs), else null
// The items are read once a minute at most (a warm function instance keeps them).
const admin = require("firebase-admin");
const L = require("./logic");

const SITE_ID = "boomertanger";
const CACHE_MS = 60 * 1000;
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function makeLinks(db = admin.firestore(), { now = Date.now } = {}) {
  let cache = null, at = 0;
  async function items() {
    if (cache && now() - at < CACHE_MS) return cache;
    const snap = await db.collection(`sites/${SITE_ID}/services/main/items`).get();
    cache = snap.docs.map((d) => ({ id: d.id, status: d.get("status"), routes: d.get("routes") || [], name: d.get("name") || d.id }));
    at = now();
    return cache;
  }
  async function serviceForPath(text) {
    try { return L.serviceForPath(text, await items()); }
    catch (err) { console.error("services: serviceForPath failed", String((err && err.message) || err).slice(0, 120)); return null; }
  }
  async function validServiceId(id) {
    if (typeof id !== "string" || !ID_RE.test(id) || id.length > 120) return null;
    try {
      const s = await db.doc(`sites/${SITE_ID}/services/main/items/${id}`).get();
      return s.exists && s.get("status") !== "retired" ? id : null;
    } catch { return null; }
  }
  async function resolve({ serviceId, page } = {}) {
    const ok = serviceId != null ? await validServiceId(serviceId) : null;
    if (ok) return ok;
    return page != null ? serviceForPath(page) : null;
  }
  return { serviceForPath, validServiceId, resolve, items };
}

module.exports = { makeLinks };
