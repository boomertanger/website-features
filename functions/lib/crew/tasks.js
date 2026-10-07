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
