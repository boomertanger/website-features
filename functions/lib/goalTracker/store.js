// Goal Tracker storage helpers: the paths (docs/specs/goal-tracker.md §4), loading the whole draft,
// serialising for callable replies, chunked deletes and the adminLog entry (feature key goalTracker).
//   sites/boomertanger/goalTracker/config            draft config (+ pendingChanges, lastPublishedAt)
//   sites/boomertanger/goalItems/{itemId}            the draft plan
//   sites/boomertanger/goalMetrics/{metricId}        metric values (+ history/{YYYY-MM-DD})
//   sites/boomertanger/public/goalTracker            published snapshot (signed-up members read)
//   sites/boomertanger/public/goalTrackerTeaser      published teaser (anyone reads)
const admin = require("firebase-admin");
const { dayKey } = require("../growth/collect");
const { SITE_ID } = require("./logic");

const ms = (v) => (v == null ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : null);

module.exports = function makeStore({ adminLogEntry, db = admin.firestore() }) {
  const site = db.doc(`sites/${SITE_ID}`);
  const R = {
    site,
    config: site.collection("goalTracker").doc("config"),
    items: site.collection("goalItems"),
    item: (id) => site.collection("goalItems").doc(id),
    metrics: site.collection("goalMetrics"),
    metric: (id) => site.collection("goalMetrics").doc(id),
    history: (id) => site.collection("goalMetrics").doc(id).collection("history"),
    pub: site.collection("public").doc("goalTracker"),
    teaser: site.collection("public").doc("goalTrackerTeaser"),
    socials: site.collection("public").doc("socials"),
    profiles: site.collection("profiles"),
  };

  const itemOf = (snap) => {
    const d = snap.data();
    return { ...d, id: snap.id, createdAt: ms(d.createdAt), updatedAt: ms(d.updatedAt) };
  };
  const metricOf = (snap) => {
    const d = snap.data();
    return { ...d, id: snap.id, updatedAt: ms(d.updatedAt) };
  };
  const configOf = (snap) => {
    const d = snap.exists ? snap.data() : {};
    return { ...d, lastPublishedAt: ms(d.lastPublishedAt), pendingChanges: d.pendingChanges || 0 };
  };

  /** The whole draft: { config, items: [..], metrics: { id: {..} } }. */
  async function loadAll() {
    const [cfg, items, metrics] = await Promise.all([R.config.get(), R.items.get(), R.metrics.get()]);
    return {
      config: configOf(cfg),
      items: items.docs.map(itemOf),
      metrics: Object.fromEntries(metrics.docs.map((m) => [m.id, metricOf(m)])),
    };
  }

  /** Commits writes in chunks the batch limit allows. ops: [(batch) => void]. */
  async function commitChunks(ops, size = 400) {
    for (let i = 0; i < ops.length; i += size) {
      const batch = db.batch();
      ops.slice(i, i + size).forEach((op) => op(batch));
      await batch.commit();
    }
  }

  async function log(params) {
    try {
      await db.collection("adminLog").add(await adminLogEntry(db, { feature: "goalTracker", ...params }));
    } catch (err) { console.error("goalTracker: adminLog write failed", err); }
  }

  return { db, R, itemOf, metricOf, configOf, loadAll, commitChunks, log, dayKey, ms, FieldValue: admin.firestore.FieldValue, Timestamp: admin.firestore.Timestamp };
};
