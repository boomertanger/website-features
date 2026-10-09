// Mod Machina phase 3 part 5: Flag to owner (docs/specs/mod-machina.md section 17a "Flag to owner"). liveFlag({ streamId, type, room, note }) from crew clocked in on the stream; liveFlagAck({ streamId, flagId,
// action: seen|done }) from the owner (and admins, for urgent flags). streams/{id}/flags/{flagId}: { type, room, note, byUid, byHandle, urgent, createdAt, seenAt, doneAt, expireAt (13 months, TTL) }.
// Rules: the owner and admins read flags; nobody writes from a client. The flagger sees "Seen by Boomer" through private/duty.flagsSeen[flagId] = true (a mirror with no text in it), so crew never read the
// flags collection. Urgent = Threat or Personal info (choice 9). Each flag writes adminLog "crewFlag" (no note text) and a notifyOutbox entry type "crewFlag" (not sent yet: Boom Alerts sending comes later).
// Built on the Control Room's ctx (lib/live/core.js), like lib/crew/duty.js.
const { onCall } = require("firebase-functions/v2/https");
const { P } = require("../live/core");

const TYPES = ["threat", "pii", "raid", "harassment", "other"];
const URGENT = ["threat", "pii"];
const ROOMS = ["twitch", "ytLandscape", "ytVertical", "tiktok", "site"];
const MAX_PER_STREAM = 5;
const KEEP_MS = 13 * 30 * 24 * 3600000;
const ID_SAFE = /^[A-Za-z0-9_-]{1,100}$/;

module.exports = function flags(ctx) {
  const { db, Timestamp, fail, now } = ctx;
  const col = (sid) => db.collection(`sites/boomertanger/streams/${sid}/flags`);

  const liveFlag = onCall(async (request) => {
    const w = await ctx.requireCrew(request);
    const { streamId, type, room } = request.data || {};
    if (typeof streamId !== "string" || !ID_SAFE.test(streamId)) throw fail("invalid-argument", "streamId is required.", "args");
    if (!TYPES.includes(type)) throw fail("invalid-argument", "Pick what is happening.", "type");
    if (!ROOMS.includes(room)) throw fail("invalid-argument", "Pick where.", "room");
    const note = typeof request.data.note === "string" ? request.data.note.trim() : "";
    if (note.length < 10 || note.length > 280) throw fail("invalid-argument", "Write 10 to 280 characters about what happened.", "note");
    if (w.isOwner) throw fail("permission-denied", "The owner reads flags, they don't send them.", "ownerHosts");
    const s = await ctx.loadStream(streamId);
    if (s.state !== "live") throw fail("failed-precondition", "That stream isn't live.", "notLive");
    const state = ((await db.doc(P.duty(streamId)).get()).data()) || null;
    if (!state || !state.onDuty || !state.onDuty[w.uid]) throw fail("failed-precondition", "Clock in before you flag.", "notOnDuty");
    const mine = await col(streamId).where("byUid", "==", w.uid).get();
    if (mine.size >= MAX_PER_STREAM) throw fail("resource-exhausted", "That's 5 flags from you tonight. Tell the Captain directly if there's more.", "limit");
    const at = now(), urgent = URGENT.includes(type);
    const ref = col(streamId).doc();
    await ref.set({ type, room, note, byUid: w.uid, byHandle: w.handle || null, urgent, createdAt: Timestamp.fromMillis(at), seenAt: null, doneAt: null, expireAt: Timestamp.fromMillis(at + KEEP_MS) });
    await ctx.logAdmin(w, { action: "crewFlag", streamId, title: s.title, details: { flagId: ref.id, type, room, urgent } });
    try { await ctx.outbox({ type: "crewFlag", audience: "admins", streamId, payload: { kind: "crewFlag", flagType: type, room, urgent, byHandle: w.handle || null, link: "/live/control" } }); }
    catch (err) { console.error("flags: outbox failed", String((err && err.message) || err).slice(0, 120)); }
    return { ok: true, flagId: ref.id, urgent };
  });

  const liveFlagAck = onCall(async (request) => {
    const uid = ctx.crew.requireAuth(request);
    const w = await ctx.crew.who(uid);
    const { streamId, flagId, action } = request.data || {};
    if (typeof streamId !== "string" || !ID_SAFE.test(streamId) || typeof flagId !== "string" || !ID_SAFE.test(flagId)) throw fail("invalid-argument", "Say which flag.", "args");
    if (!["seen", "done"].includes(action)) throw fail("invalid-argument", "Got it or Done.", "action");
    if (!(w.isOwner || w.isAdmin)) throw fail("permission-denied", "Only the owner and admins can answer flags.", "notAllowed");
    const ref = col(streamId).doc(flagId), snap = await ref.get();
    if (!snap.exists) throw fail("not-found", "That flag is gone.", "noFlag");
    if (!w.isOwner && snap.get("urgent") !== true) throw fail("permission-denied", "That flag is for the owner.", "notAllowed");
    const at = Timestamp.fromMillis(now());
    const patch = action === "done" ? { doneAt: at, ...(snap.get("seenAt") ? {} : { seenAt: at, seenBy: w.handle || null }) } : snap.get("seenAt") ? {} : { seenAt: at, seenBy: w.handle || null };
    if (Object.keys(patch).length) await ref.update(patch);
    await ctx.duty.markFlagSeen(streamId, flagId);
    return { ok: true };
  });

  return { functions: { liveFlag, liveFlagAck } };
};
