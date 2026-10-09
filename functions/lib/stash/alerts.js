// Cloud Stash alerts (docs/specs/cloud-stash.md §5). Each is an admin-health item handed to the Notifications service through the EXISTING notifyOutbox writer (lib/planner/core.js outbox:
// written once per id, expires after 30 days; Boom Alerts delivers it once that ships). Until then every alert is also kept in storageUsage/alerts (the newest 30), which the Cloud Stash
// page shows on its Activity tab and the /admin card counts from. At most ONE alert per kind per day; the two usage alerts are once per month (they fire once per crossing, and a
// second crossing in the same month stays quiet).
//
//   stash-sweep-failed   a sweep run failed or partly failed      stash-usage-80    usage crossed the pause point    stash-loose-ends   the weekly scan found more orphans or untracked files
//   stash-sweep-capped   a sweep run hit the per-run cap          stash-usage-100   usage crossed 100%               stash-usage-stale  the usage fetch failed 2 days running
const admin = require("firebase-admin");
const L = require("./logic");
const { makeCore } = require("../planner/core");

const HISTORY_MAX = 30;
const MONTHLY = ["stash-usage-80", "stash-usage-100"];
const LINK = "/admin/stash";

/** The words for each kind. `info` carries the numbers the caller had. Pure. */
function messageFor(kind, info = {}) {
  const n = (v) => (Number.isFinite(v) ? v : 0);
  switch (kind) {
    case "stash-sweep-failed": return { title: "The Cloud Stash sweep had problems", body: `${n(info.failures)} file${n(info.failures) === 1 ? "" : "s"} couldn't be purged. The page says which.`, severity: "warn" };
    case "stash-sweep-capped": return { title: "The Cloud Stash sweep hit its limit", body: `It purged ${n(info.purged)} files and stopped at the per-run cap. The rest waits for the next run.`, severity: "info" };
    case "stash-usage-80": return { title: "Cloudinary storage is nearly full", body: `Usage is at ${n(info.pct)}% of this month's credits. Member uploads are paused until it drops.`, severity: "warn" };
    case "stash-usage-100": return { title: "Cloudinary is over its limit", body: `Usage is at ${n(info.pct)}% of this month's credits. Only the owner can upload until it drops.`, severity: "critical" };
    case "stash-usage-stale": return { title: "Cloud Stash can't read Cloudinary's usage", body: `The usage couldn't be fetched ${n(info.failures)} times in a row, so the numbers on the page are out of date.`, severity: "warn" };
    case "stash-loose-ends": return { title: "Cloud Stash found more loose ends", body: `The weekly scan found ${n(info.orphan)} orphans and ${n(info.untracked)} untracked files, more than last time.`, severity: "info" };
    default: return null;
  }
}

/** The outbox document id that makes an alert once-only: per day, or per month for the usage ones. */
const idFor = (kind, at) => `stash-${kind.replace(/^stash-/, "")}-${MONTHLY.includes(kind) ? L.monthKey(at) : L.dayKey(at)}`;

/** deps: { db, now, adminLogEntry }. Returns { raise(kind, info) -> true when it was newly sent }. Never throws (a failed alert is logged, the work it reports on stands). */
function makeAlerts({ db = admin.firestore(), now = Date.now, adminLogEntry } = {}) {
  const { Timestamp } = admin.firestore;
  let core = null;
  async function raise(kind, info = {}) {
    try {
      const m = messageFor(kind, info);
      if (!m) return false;
      core ||= makeCore({ db, adminLogEntry });
      const at = now();
      const fresh = await core.outbox({ id: idFor(kind, at), type: "admin-health", audience: "admins", payload: { kind, title: m.title, body: m.body, severity: m.severity, link: LINK, feature: "cloudStash" } });
      if (!fresh) return false;
      const ref = db.doc("storageUsage/alerts");
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const items = [{ kind, title: m.title, body: m.body, severity: m.severity, at: Timestamp.fromMillis(at) }, ...((snap.exists && snap.get("items")) || [])].slice(0, HISTORY_MAX);
        tx.set(ref, { items });
      });
      return true;
    } catch (err) {
      console.error("stash: alert failed", kind, String((err && err.message) || err).slice(0, 160));
      return false;
    }
  }
  return { raise };
}

module.exports = { makeAlerts, messageFor, idFor, HISTORY_MAX, LINK };
