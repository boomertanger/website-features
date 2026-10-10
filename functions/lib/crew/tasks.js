// The crew task board (docs/specs/mod-machina.md section 4a, 14): taskPost, taskClaim, taskDone, taskConfirm.
// tasks/{taskId}: title, detail, gears (5 to 50), postedBy, claimedBy, status open | claimed | done | confirmed,
// confirmedBy. Gears are paid once, on confirmation, by someone other than the claimer (the poster, or an
// Overseer and above). Callable errors carry details.reason.
const { onCall } = require("firebase-functions/v2/https");
const { paths } = require("./settings");
const { makeStore, fail, ms } = require("./store");

module.exports = function crewTasks({ adminLogEntry, gears }) {
  const S = makeStore({ adminLogEntry });
  const { db, FieldValue, Timestamp } = S;
  const taskRef = (id) => db.doc(paths.task(id));

  /** Sentinels and admins post tasks. */
  const canPost = (w) => w.isAdmin || (S.active(w) && w.grade >= 4);
  const view = (id, t) => ({
    taskId: id, title: t.title, detail: t.detail || "", gears: t.gears, status: t.status,
    postedBy: t.postedBy, postedByHandle: t.postedByHandle || null, claimedBy: t.claimedBy || null, claimedByHandle: t.claimedByHandle || null,
    confirmedBy: t.confirmedBy || null, createdAt: ms(t.createdAt),
  });
  async function load(id) {
    if (typeof id !== "string" || !id) throw fail("invalid-argument", "taskId is required.", "args");
    const ref = taskRef(id), snap = await ref.get();
    if (!snap.exists) throw fail("not-found", "That task doesn't exist.", "noTask");
    return { ref, t: snap.data() };
  }

  const taskPost = onCall(async (request) => {
    const uid = S.requireAuth(request);
    const w = await S.who(uid);
    if (!canPost(w)) throw fail("permission-denied", "Sentinels and admins post tasks.", "notAllowed");
    const d = request.data || {};
    const title = S.text(d.title, 100, { min: 3, field: "title" });
    const detail = S.text(d.detail ?? "", 600, { field: "detail" });
    const g = d.gears;
    if (!Number.isInteger(g) || g < 5 || g > 50) throw fail("invalid-argument", "Gears must be a whole number from 5 to 50.", "field", { field: "gears" });
    const ref = db.collection(`${paths.settings()}/tasks`).doc();
    await ref.set({ title, detail, gears: g, status: "open", postedBy: uid, postedByHandle: w.handle, claimedBy: null, claimedByHandle: null, confirmedBy: null, createdAt: Timestamp.now() });
    return { ok: true, taskId: ref.id };
  });

  const taskClaim = onCall(async (request) => {
    const uid = S.requireAuth(request);
    const w = await S.who(uid);
    if (!S.active(w)) throw fail("permission-denied", "Active crew can claim tasks.", "notCrew");
    const { ref } = await load(request.data?.taskId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.get("status") !== "open") throw fail("failed-precondition", "That task isn't open.", "notOpen");
      tx.update(ref, { status: "claimed", claimedBy: uid, claimedByHandle: w.handle, claimedAt: Timestamp.now() });
    });
    return { ok: true };
  });

  const taskDone = onCall(async (request) => {
    const uid = S.requireAuth(request);
    const { ref, t } = await load(request.data?.taskId);
    if (t.status !== "claimed") throw fail("failed-precondition", "That task isn't claimed.", "notClaimed");
    if (t.claimedBy !== uid) throw fail("permission-denied", "Only the person who claimed it can mark it done.", "notYours");
    await ref.update({ status: "done", doneAt: Timestamp.now() });
    return { ok: true };
  });

  const taskConfirm = onCall(async (request) => {
    const uid = S.requireAuth(request);
    const w = await S.who(uid);
    const { ref, t } = await load(request.data?.taskId);
    if (t.status !== "done") throw fail("failed-precondition", "That task isn't marked done.", "notDone");
    if (t.claimedBy === uid) throw fail("permission-denied", "Someone else has to confirm your task.", "ownTask");
    if (!(t.postedBy === uid || S.a2plus(w))) throw fail("permission-denied", "The poster or an Overseer confirms a task.", "notAllowed");
    await ref.update({ status: "confirmed", confirmedBy: uid, confirmedAt: Timestamp.now() });
    const paid = await gears.grantTask(t.claimedBy, ref.id, t.gears);
    await db.collection("adminLog").add(await adminLogEntry(db, {
      feature: "crew", action: "taskConfirm", itemPath: paths.task(ref.id), itemTitle: t.title,
      actorUid: uid, actorName: w.name, details: { gears: t.gears, to: t.claimedByHandle || t.claimedBy, paid: paid.granted ? "paid" : paid.reason },
    }));
    return { ok: true, paid: paid.granted };
  });

  return { taskPost, taskClaim, taskDone, taskConfirm };
};

// System tasks (docs/specs/service-hub.md §9): a task another service posts, not a person. key makes it once-only (the doc id is sys-<key>, so a retry
// or a second trigger posts nothing). postedBy "system": an Overseer and above confirms it (taskConfirm above). Gears: crew/main.serviceTaskGears
// { test, problems } when set, else the defaults below (5 to 50, like taskPost). Never throws; returns { created, taskId }.
const SYSTEM_GEARS = { test: 15, problems: 10 };
async function createSystemTask(db, { key, kind, title, detail = "" }) {
  try {
    const id = `sys-${String(key).replace(/[^A-Za-z0-9_.-]+/g, "-").slice(0, 120)}`;
    const crew = (await db.doc(paths.settings()).get()).data() || {};
    const set = crew.serviceTaskGears || {};
    const g = Number.isInteger(set[kind]) && set[kind] >= 5 && set[kind] <= 50 ? set[kind] : SYSTEM_GEARS[kind] || 10;
    const ref = db.doc(paths.task(id));
    let created = false;
    await db.runTransaction(async (tx) => {
      if ((await tx.get(ref)).exists) return;
      tx.set(ref, { title: String(title).slice(0, 100), detail: String(detail).slice(0, 600), gears: g, status: "open", postedBy: "system", postedByHandle: null, system: true, systemKey: String(key), claimedBy: null, claimedByHandle: null, confirmedBy: null, createdAt: require("firebase-admin").firestore.Timestamp.now() });
      created = true;
    });
    return { created, taskId: id, gears: g };
  } catch (err) { console.error("crew: system task failed", String((err && err.message) || err).slice(0, 160)); return { created: false, taskId: null }; }
}
module.exports.createSystemTask = createSystemTask;
module.exports.SYSTEM_GEARS = SYSTEM_GEARS;
