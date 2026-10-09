// Mod Machina phase 3, part 1: the swap board (docs/specs/mod-machina.md section 17a, "Part 1: the swap board"). After a week is published, a confirmed seat that is dropped goes on the board
// instead of just disappearing: crew/main/swaps/{streamId}_{seatKey}. The seat shows as open on the stream (the planner removes it from the crew field); the swap remembers who dropped it and
// how much notice they gave, so the no-show rule (part 2) can be fair. "early" = 24 hours or more before the start, "late" = less. Someone else can take it (dutySwapTake claims it with a
// transaction, first write wins). At the stream's start every open swap closes; an untaken LATE drop is marked countsAsNoShow (part 2 counts it), an early one sets nothing. Delay and Cancel
// close open swaps with noRecord: true (no effect on anyone's record). Only functions write these documents (rules: crew read, no client writes).
//
// deps: { db, FieldValue, Timestamp, outbox(doc), log({ action, streamId, title, actor, details }) }. The planner and the Control Room each pass their own writers, so nothing is copied.
const { paths, ROOT } = require("./settings");
const SEAT_KEY = (s) => (s.role === "captain" ? "captain" : `${s.room}:${s.role}`);
const HOUR = 3600000;
const EARLY_MS = 24 * HOUR;
const PLATFORM_ROOMS = ["twitch", "ytLandscape", "ytVertical", "tiktok"];
const AUDIENCE_CAP = 200;

const swapPath = (id) => `${ROOT}/swaps/${id}`;
const swapId = (streamId, seat) => `${streamId}_${SEAT_KEY(seat)}`;
/** "early" when the stream starts 24 hours or more from now, otherwise "late". */
const noticeOf = (startsAtMs, nowMs) => (startsAtMs - nowMs >= EARLY_MS ? "early" : "late");
const gradeOf = (r) => (r.track === "admin" ? 4 : Number.isInteger(r.grade) ? r.grade : 0);
/** Who should hear about an open seat (pure): active or Check-in crew, grade high enough for the seat, platform preference for that room not "no", not the dropper. */
function audienceOf(rosterRows, seat, fromUid) {
  const need = seat.role === "captain" ? 3 : seat.role === "lead" ? 2 : 1;
  return rosterRows
    .filter((r) => r.uid !== fromUid && ["active", "checkIn"].includes(r.status) && gradeOf(r) >= need)
    .filter((r) => !PLATFORM_ROOMS.includes(seat.room) || (r.platforms || {})[seat.room] !== "no")
    .map((r) => r.uid)
    .slice(0, AUDIENCE_CAP);
}

function makeSwap({ db, FieldValue, Timestamp, outbox = null, log = null }) {
  const col = () => db.collection(`${ROOT}/swaps`);
  const note = async (entry) => { if (log) { try { await log(entry); } catch (err) { console.error("swap: adminLog failed", err); } } };

  /** Puts a dropped, confirmed seat on the board. `from` is { uid, handle }. noRecord: an admin released it for them (never counts against anyone). */
  async function open({ streamId, seat, from, startsAtMs, title = "", week = null, nowMs = Date.now(), noRecord = false, actor = null }) {
    const id = swapId(streamId, seat);
    const doc = {
      streamId, room: seat.room, role: seat.role, fromUid: from.uid, fromHandle: from.handle || null, droppedAt: Timestamp.fromMillis(nowMs), startsAt: Timestamp.fromMillis(startsAtMs),
      notice: noticeOf(startsAtMs, nowMs), status: "open", takenBy: null, takenByHandle: null, takenAt: null, countsAsNoShow: false, noRecord: noRecord === true,
    };
    await db.doc(swapPath(id)).set(doc);
    await note({ action: "crewSwap", streamId, title, actor, details: { kind: "drop", swapId: id, seat: { room: seat.room, role: seat.role }, from: from.handle || null, notice: doc.notice } });
    if (outbox) {
      try {
        const rows = (await db.collection(`${ROOT}/roster`).where("status", "in", ["active", "checkIn"]).get()).docs.map((d) => ({ uid: d.id, ...d.data() }));
        const uids = audienceOf(rows, seat, from.uid);
        if (uids.length) await outbox({ type: "crewSwap", audience: "uids", uids, streamId, week, payload: { event: "open", title: `${title || "A stream"} has a seat up for grabs`, seat: { room: seat.room, role: seat.role }, start: startsAtMs, notice: doc.notice, swapId: id, link: "/crew/hq" } });
      } catch (err) { console.error("swap: notice failed", err); }
    }
    return { id, ...doc };
  }

  /** The first-write-wins claim: open -> taken inside a transaction. Throws { beaten: true } when the swap is no longer open. */
  async function claim(id, taker, nowMs = Date.now()) {
    const ref = db.doc(swapPath(id));
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.get("status") !== "open") { const e = new Error("beaten"); e.beaten = true; throw e; }
      tx.update(ref, { status: "taken", takenBy: taker.uid, takenByHandle: taker.handle || null, takenAt: Timestamp.fromMillis(nowMs) });
      return { id, ...snap.data(), status: "taken", takenBy: taker.uid };
    });
  }
  /** Undoes a claim when the seat couldn't be written (the swap goes back on the board). */
  async function unclaim(id) {
    await db.doc(swapPath(id)).update({ status: "open", takenBy: null, takenByHandle: null, takenAt: null });
  }
  const taken = (swap, taker, { title = "", actor = null } = {}) => note({ action: "crewSwap", streamId: swap.streamId, title, actor, details: { kind: "take", swapId: swap.id, seat: { room: swap.room, role: swap.role }, from: swap.fromHandle || null, to: taker.handle || null } });

  async function openOf(streamId) {
    return (await col().where("status", "==", "open").get()).docs.filter((d) => !streamId || d.get("streamId") === streamId);
  }

  /** Delay or Cancel: every open swap of the stream closes with no effect on anyone's record. */
  async function closeForStream(streamId, { title = "", actor = null, why = "changed" } = {}) {
    const docs = (await openOf(streamId)).filter((d) => d.get("streamId") === streamId);
    for (const d of docs) await d.ref.update({ status: "closed", closedAt: FieldValue.serverTimestamp(), noRecord: true, countsAsNoShow: false, closedWhy: why });
    if (docs.length) await note({ action: "crewSwap", streamId, title, actor, details: { kind: "close", why, closed: docs.map((d) => d.id), noRecord: true } });
    return docs.length;
  }

  /** Closes these open swaps because their stream has started. An untaken LATE drop counts as a no-show for whoever dropped it (part 2 counts it); an early one sets nothing; a seat an admin released never counts. */
  async function finish(docs, { title = "", actor = null } = {}) {
    const marked = [];
    for (const d of docs) {
      const counts = d.get("notice") === "late" && d.get("noRecord") !== true;
      await d.ref.update({ status: "closed", closedAt: FieldValue.serverTimestamp(), closedWhy: "started", ...(counts ? { countsAsNoShow: true } : {}) });
      marked.push({ id: d.id, countsAsNoShow: counts });
    }
    const byStream = {};
    for (const d of docs) (byStream[d.get("streamId")] ||= []).push(d.id);
    for (const [streamId, ids] of Object.entries(byStream)) await note({ action: "crewSwap", streamId, title, actor, details: { kind: "close", why: "started", closed: marked.filter((m) => ids.includes(m.id)) } });
    return marked;
  }
  /** Start (startStream): every open swap of the stream closes. */
  async function closeAtStart(streamId, opts = {}) {
    return finish((await openOf(streamId)).filter((d) => d.get("streamId") === streamId), opts);
  }

  /** plannerTick: swaps whose start time has passed close even if the stream started without startStream. Only the due swaps close. */
  async function closeStarted(nowMs = Date.now()) {
    return (await finish((await openOf(null)).filter((d) => d.get("startsAt") && d.get("startsAt").toMillis() <= nowMs))).length;
  }

  return { open, claim, unclaim, taken, closeForStream, closeAtStart, closeStarted };
}

module.exports = { makeSwap, swapId, swapPath, noticeOf, audienceOf, EARLY_MS, SEAT_KEY, paths };
