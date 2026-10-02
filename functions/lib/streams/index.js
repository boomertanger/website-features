// The stream object's trigger (docs/specs/stream-object.md §5). The callables that move a
// stream through its life (planSlot, publishWeek, startStream, switchGame, stopStream,
// cancelStream) belong to workstreams 4 and 5 and use lib/streams/logic.js.
//
//   sites/{siteId}/streams/{streamId}              the stream (public read once published)
//   …/streams/{streamId}/private/draft             the owner's working copy (staff read)
//
//   onStreamWritten   when a stream enters or leaves "ended", or its segments change: recompute
//                     the stats of every affected Vault game from that game's ended streams
//                     (recomputed, never running totals, so it heals itself), refresh
//                     public/vault, move a streamed wishlist game to Playing (adminLog status,
//                     actor "Automatic") and post the Vault's "now playing" event the first time.
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const L = require("./logic");
const D = require("../vault/digest");

module.exports = function streams({ adminLogEntry }) {
  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;
  const Timestamp = admin.firestore.Timestamp;

  /** Recomputes one game's stats from its ended streams; returns whether anything changed. */
  async function refreshGame(siteId, slug) {
    const site = db.doc(`sites/${siteId}`);
    const gRef = site.collection("vaultGames").doc(slug);
    const g = await gRef.get();
    if (!g.exists) return false;   // a game the Vault doesn't have (or no longer has)

    // gameIds array-contains + actualStart desc is the composite index in firestore.indexes.json.
    const snap = await site.collection("streams").where("gameIds", "array-contains", slug).orderBy("actualStart", "desc").get();
    const ended = snap.docs.map((d) => d.data()).filter((s) => s.state === "ended");
    const next = L.statsForGame(slug, ended);
    const prev = g.get("stats") || {};
    const stats = { streamCount: next.streamCount, minutes: next.minutes, firstStreamedAt: next.firstStreamedAt == null ? null : Timestamp.fromMillis(next.firstStreamedAt), lastStreamedAt: next.lastStreamedAt == null ? null : Timestamp.fromMillis(next.lastStreamedAt) };
    const unchanged = prev.streamCount === stats.streamCount && prev.minutes === stats.minutes
      && (prev.firstStreamedAt?.toMillis() ?? null) === next.firstStreamedAt && (prev.lastStreamedAt?.toMillis() ?? null) === next.lastStreamedAt;
    const toPlaying = L.wishlistToPlaying(g.get("status"), next.streamCount);
    if (unchanged && !toPlaying) return false;

    const update = { stats, updatedAt: FieldValue.serverTimestamp() };
    if (toPlaying) { update.status = "playing"; update.statusChangedAt = FieldValue.serverTimestamp(); }
    await gRef.update(update);

    if (toPlaying) {
      await db.collection("adminLog").add(await adminLogEntry(db, {
        feature: "gameVault", action: "status", itemPath: `sites/${siteId}/vaultGames/${slug}`, itemTitle: g.get("title"),
        actorUid: null, actorName: "Automatic", reason: "Streamed for the first time",
        changes: { status: { before: g.get("status"), after: "playing" } },
      }));
    }
    // "Now playing: X" the first time a game is streamed (no ended stream before this one).
    if ((prev.streamCount || 0) === 0 && next.streamCount > 0) {
      await db.collection("activityLog").add({ ...D.nowPlayingEvent({ title: g.get("title"), slug }), createdAt: FieldValue.serverTimestamp() });
    }
    return true;
  }

  const onStreamWritten = onDocumentWritten("sites/{siteId}/streams/{streamId}", async (event) => {
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after = event.data.after.exists ? event.data.after.data() : null;
    const affected = L.affectedGameIds(before, after);
    if (!affected.length) return;
    let changed = false;
    for (const slug of affected) changed = (await refreshGame(event.params.siteId, slug)) || changed;
    if (changed) {
      // The summary doc is rebuilt from the games, exactly as the Vault's own functions do.
      const makeStore = require("../vault/store");
      await makeStore({ adminLogEntry }).rebuildPublic();
    }
  });

  return { onStreamWritten };
};
