// goalTrackerDaily (docs/specs/goal-tracker.md §4), 05:30 America/Los_Angeles, after the growth collector (05:00).
// Copies the automatic counts (Twitch followers, YouTube subscribers, TikTok from public/socials, and a
// count() of Fan Club members) into the draft metrics, today's history, and the published snapshot and
// teaser, WITHOUT a publish and without touching pendingChanges. It never zeroes a number it couldn't
// read, and the teaser's next key date moves on once a date has passed.
const L = require("./logic");

module.exports = function makeDaily({ store }) {
  const { R, Timestamp } = store;

  async function run(now = Date.now()) {
    const [socialsSnap, metricsSnap, pubSnap, teaserSnap] = await Promise.all([R.socials.get(), R.metrics.get(), R.pub.get(), R.teaser.get()]);
    let members = null;
    try { members = (await R.profiles.count().get()).data().count; } catch (err) { console.error("goalTrackerDaily: member count failed", err); }
    const values = L.autoValues(socialsSnap.exists ? socialsSnap.data() : null, members, now);
    const day = store.dayKey(now);
    const touched = [];
    const ops = [];
    const patch = {};
    for (const m of metricsSnap.docs) {
      const src = String(m.get("source") || "");
      if (!src.startsWith("auto:")) continue;
      const v = values[src.slice(5)];
      if (!v) continue;   // couldn't read it today: keep the last good value
      touched.push(m.id);
      ops.push((b) => b.update(m.ref, { value: v.value, updatedAt: Timestamp.fromMillis(v.updatedAt) }));
      ops.push((b) => b.set(R.history(m.id).doc(day), { value: v.value, at: Timestamp.fromMillis(now), source: "auto" }));
      patch[m.id] = v;
    }
    if (pubSnap.exists) {
      const snap = pubSnap.data();
      const upd = { updatedAt: Timestamp.fromMillis(now) };
      for (const [id, v] of Object.entries(patch)) {
        if (snap.metrics && snap.metrics[id]) { upd[`metrics.${id}.value`] = v.value; upd[`metrics.${id}.updatedAt`] = v.updatedAt; }
      }
      ops.push((b) => b.update(R.pub, upd));
      if (teaserSnap.exists) {
        const cfg = snap.config || {};
        ops.push((b) => b.update(R.teaser, { nextKeyDate: L.nextKeyDate(cfg, now), updatedAt: Timestamp.fromMillis(now) }));
      }
    }
    await store.commitChunks(ops);
    return { day, metrics: touched };
  }

  return { run };
};
