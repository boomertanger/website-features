// Goal Tracker Cloud Functions (docs/specs/goal-tracker.md §4). All writes to the plan go through here:
// the rules close every goal collection to client writes.
//   goalTrackerEdit        admins: create, update, delete, reorder, setStatus, updateConfig, metricSave, metricDelete, seed (./edit.js)
//   goalTrackerSetMetric   admins: a manual metric's value + today's history (./metrics.js)
//   goalTrackerPublish     admins: builds public/goalTracker and public/goalTrackerTeaser from the draft (./publish.js)
//   goalTrackerDaily       05:30 America/Los_Angeles: automatic counts into the draft, snapshot, teaser and history (./daily.js)
// adminLog feature key: goalTracker. activityLog: goal-milestone-done on publish.
const { onCall } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const makeStore = require("./store");
const makeEdit = require("./edit");
const makeMetrics = require("./metrics");
const makePublish = require("./publish");
const makeDaily = require("./daily");

module.exports = function goalTracker({ adminLogEntry }) {
  const store = makeStore({ adminLogEntry });
  const edit = makeEdit({ store });
  const metrics = makeMetrics({ store });
  const pub = makePublish({ store });
  const daily = makeDaily({ store });

  const goalTrackerEdit = onCall((request) => edit.handle(request));
  const goalTrackerSetMetric = onCall((request) => metrics.setMetric(request));
  const goalTrackerPublish = onCall((request) => pub.publish(request));
  const goalTrackerDaily = onSchedule({ schedule: "30 5 * * *", timeZone: "America/Los_Angeles" }, async () => {
    const out = await daily.run();
    console.log("goalTrackerDaily: updated", out.day, out.metrics.join(", ") || "(nothing)");
  });

  return { goalTrackerEdit, goalTrackerSetMetric, goalTrackerPublish, goalTrackerDaily };
};
