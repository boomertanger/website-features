// goalTrackerPublish (docs/specs/goal-tracker.md §4): rebuilds public/goalTracker (members) and
// public/goalTrackerTeaser (anyone) from the draft in ONE transaction, clears the unpublished flags and
// resets config.pendingChanges. If anything fails nothing is written: the draft is untouched and members
// keep the last snapshot. Afterwards, an activityLog "goal-milestone-done" event for each public or members
// milestone that became Done since the last publish (none on the first publish), and an adminLog entry.
const { callerInfo, requireAdmin, fail } = require("../vault/common");
const L = require("./logic");

const MAX_EVENTS = 20;
const FEATURE = "goal-tracker";

module.exports = function makePublish({ store }) {
  const { R, db, FieldValue, Timestamp } = store;

  async function publish(request) {
    const c = requireAdmin(await callerInfo(request));
    const now = Date.now();
    let built, prev, flagged = 0, items = 0;
    await db.runTransaction(async (tx) => {
      const [cfgSnap, itemsSnap, metricsSnap, prevSnap] = await Promise.all([tx.get(R.config), tx.get(R.items), tx.get(R.metrics), tx.get(R.pub)]);
      if (!cfgSnap.exists || !itemsSnap.docs.length) throw fail("failed-precondition", "There's nothing to publish yet. Load the starting plan or add an item first.", "empty");
      const config = store.configOf(cfgSnap);
      const draft = itemsSnap.docs.map(store.itemOf);
      const metrics = Object.fromEntries(metricsSnap.docs.map((m) => [m.id, store.metricOf(m)]));
      prev = prevSnap.exists ? prevSnap.data() : null;
      flagged = 0;
      built = L.buildPublic({ config, items: draft, metrics, now });
      items = built.snapshot.items.length;
      tx.set(R.pub, { ...built.snapshot, publishedAt: Timestamp.fromMillis(now), updatedAt: Timestamp.fromMillis(now) });
      tx.set(R.teaser, { ...built.teaser, updatedAt: Timestamp.fromMillis(now) });
      for (const d of itemsSnap.docs) if (d.get("changedSincePublish")) { tx.update(d.ref, { changedSincePublish: false }); flagged++; }
      tx.set(R.config, { pendingChanges: 0, lastPublishedAt: Timestamp.fromMillis(now) }, { merge: true });
    });

    const done = L.newlyDoneMilestones(prev, built.visibleItems).slice(0, MAX_EVENTS);
    for (const m of done) {
      try {
        await db.collection("activityLog").add({
          feature: FEATURE, type: "goal-milestone-done", summary: `Milestone reached: ${m.title}`.slice(0, 200),
          link: "/goals", actorName: null, goalItemId: m.id, createdAt: FieldValue.serverTimestamp(),
        });
      } catch (err) { console.error("goalTracker: activityLog write failed", err); }
    }
    await store.log({
      action: "publish", itemPath: R.pub.path, itemTitle: "Goal Tracker", actorUid: c.uid, actorName: c.name, reason: "",
      details: { items, changed: flagged, milestonesDone: done.length },
    });
    return { publishedAt: now, items, readiness: built.snapshot.readiness, milestonesDone: done.length };
  }

  return { publish };
};
