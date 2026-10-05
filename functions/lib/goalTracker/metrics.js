// goalTrackerSetMetric (docs/specs/goal-tracker.md §4): sets a manual metric's value and today's history entry.
// It is a draft edit like the others: members see the new number when the owner publishes.
const { callerInfo, requireAdmin, fail } = require("../vault/common");
const L = require("./logic");

module.exports = function makeMetrics({ store }) {
  const { R, db, FieldValue, Timestamp } = store;

  async function setMetric(request) {
    const c = requireAdmin(await callerInfo(request));
    const d = request.data || {};
    let value;
    try { value = L.metricValue(d.value); } catch (err) { throw fail("invalid-argument", err.message, "invalid", { field: "value" }); }
    if (typeof d.metricId !== "string" || !d.metricId || d.metricId.includes("/")) throw fail("invalid-argument", "Pick a metric.", "metricId");
    const snap = await R.metric(d.metricId).get();
    if (!snap.exists) throw fail("not-found", "That metric no longer exists.", "gone");
    const m = snap.data();
    if (m.source !== "manual") throw fail("failed-precondition", "That one counts itself every morning.", "autoMetric");
    const now = Date.now(), day = store.dayKey(now);
    const batch = db.batch();
    batch.update(R.metric(d.metricId), { value, updatedAt: Timestamp.fromMillis(now) });
    batch.set(R.history(d.metricId).doc(day), { value, at: Timestamp.fromMillis(now), source: "manual" });
    batch.set(R.config, { pendingChanges: FieldValue.increment(1) }, { merge: true });
    await batch.commit();
    await store.log({
      action: "metric", itemPath: R.metric(d.metricId).path, itemTitle: m.label, actorUid: c.uid, actorName: c.name, reason: "",
      changes: { value: { from: m.value ?? null, to: value } },
    });
    return { metricId: d.metricId, value, updatedAt: now, day };
  }

  return { setMetric };
};
