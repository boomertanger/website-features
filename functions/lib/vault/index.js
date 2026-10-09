// Game Vault callables and schedules (docs/specs/game-vault.md §3, §5, §6).
// Every document is written ONLY here (Admin SDK); firestore.rules gives clients read access
// to the public parts and no write access at all. Data model: see store.js.
//
//   vaultLookup               verified members   candidates for a name, Steam link or IGDB link
//   vaultAddGame              verified members   the §3 checks, then added / queued / refused / already there
//   vaultWant                 verified members   "I want this too" on a wishlist game
//   vaultQueueList            mods, admins       the queue, with 10-minute signed previews of pending covers
//   vaultReviewQueue          mods, admins       approve / reject / replace an add or a cover
//   vaultHideGame             mods, admins       hide / unhide a community pick (hiding pauses the adder 7 days)
//   vaultDeleteGame           admins             Cloudinary, records, the game and its subcollections, its events
//   vaultCoverSignature       mods, admins       signed upload into the public covers folder
//   vaultCoverSuggestSignature verified members  signed upload of type authenticated into game-vault/pending
//   vaultCoverSubmit          verified members   verifies the upload, records it, queues it
//   vaultSweepPendingCovers   daily              removes pending uploads never submitted within 24 hours
//   vaultRefresh              weekly             re-fetches unreleased and early-access games
// (adminEditItem's new kind vaultGame is in edit.js; onStreamWritten is in lib/streams.)
// Fun Factory events (type vault, docs/specs/fun-factory.md §4): want ("I want this too" turned on,
// once per game per member ever), add (a member's game gets in, directly or approved from the
// queue; never a rejected one), cover (a member's cover suggestion approved).
//
// Callable errors carry details.reason so the site can show the right message.
const crypto = require("crypto");
const { onCall } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret, defineString } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { createSources, SourceError } = require("./sources");
const C = require("./checks");
const makeStore = require("./store");
const cloud = require("./cloudinary");
const { uploadGate } = require("../stash/gate");
const { plannerRefs } = require("../planner/refs");
const { fail, callerInfo, requireVerifiedMember, requireStaff, requireAdmin, sourceError } = require("./common");
const factory = require("../factory/record");
const makeEditor = require("./edit");

const DAY_MS = 24 * 60 * 60 * 1000;
const ADDS_PER_DAY = 5;
const LOOKUPS_PER_HOUR = 30;
const COVERS_PER_DAY = 3;
const PAUSE_MS = 7 * DAY_MS;
const PENDING_MAX_AGE_MS = DAY_MS;
const NOTICE_TTL_MS = 30 * DAY_MS;
const REFRESH_BATCH = 60;

const TWITCH_CLIENT_ID = defineString("TWITCH_CLIENT_ID");
const TWITCH_CLIENT_SECRET = defineSecret("TWITCH_CLIENT_SECRET");
const TWITCH = [TWITCH_CLIENT_SECRET];

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

/**
 * deps (from functions/index.js, so the Vault uses the one delete path and the one adminLog):
 *   adminLogEntry, performAssetDeletion, cloudinaryDelete, recordAssetCreated,
 *   cloudSecrets (the CLOUDINARY_* secrets), cloudCreds() -> { cloudName, apiKey, apiSecret }
 */
module.exports = function vault(deps) {
  const { performAssetDeletion, cloudinaryDelete, recordAssetCreated, cloudSecrets, cloudCreds } = deps;
  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;
  const Timestamp = admin.firestore.Timestamp;
  const store = makeStore({ adminLogEntry: deps.adminLogEntry });
  const { games, queue, site } = store;

  let sourcesCache = null;
  // deps.sources lets scripts/check-vault-emulator.js run the callables against recorded data
  const sources = () => deps.sources || (sourcesCache ||= createSources({ twitchClientId: TWITCH_CLIENT_ID.value(), twitchClientSecret: TWITCH_CLIENT_SECRET.value() }));

  const queueItem = (id) => queue.doc(id);
  const submitterOf = async (id) => (await queue.doc(id).collection("private").doc("submitter").get()).get("uid") || null;
  const assetsFor = (publicId) => db.collection("externalAssets").where("publicId", "==", publicId).limit(1).get();

  /** Leaves a note the member can read about a decision on their add or cover (30 days). */
  async function notify(uid, notice) {
    if (!uid) return;
    await site.collection("members").doc(uid).collection("vaultNotices").add({ ...notice, createdAt: FieldValue.serverTimestamp(), expireAt: Timestamp.fromMillis(Date.now() + NOTICE_TTL_MS) });
  }

  // ---------- vaultLookup ----------
  function candidateOf(rec) {
    return {
      igdbId: rec.igdbId, steamAppId: rec.steamAppId || null, title: rec.name,
      year: rec.releaseDate ? new Date(rec.releaseDate).getUTCFullYear() : null,
      cover: rec.coverImageId ? { source: "igdb", igdbImageId: rec.coverImageId } : rec.steamAppId ? { source: "steam", steamAppId: rec.steamAppId } : null,
      input: { igdbId: rec.igdbId },
    };
  }
  const worthShowing = (rec) => (!rec.gameType || C.ACCEPTED_TYPES.has(rec.gameType)) && !["cancelled", "rumored"].includes(rec.releaseStatus);

  const vaultLookup = onCall({ secrets: TWITCH }, async (request) => {
    const c = requireVerifiedMember(await callerInfo(request));
    const parsed = C.parseInput(request.data?.query);
    if (!parsed) throw fail("invalid-argument", "Type a game's name or paste a Steam link.", "args");
    if (!(await store.bumpLimit(c.uid, "lookups", c.isStaff ? Infinity : LOOKUPS_PER_HOUR))) {
      throw fail("resource-exhausted", "That's a lot of searches. Try again in a little while.", "lookupLimit");
    }
    let candidates;
    try {
      const src = sources();
      if (parsed.name) {
        const key = `search_${sha(C.titleKey(parsed.name) || parsed.name.toLowerCase()).slice(0, 24)}`;
        candidates = await store.cacheGet(key);
        if (!candidates) {
          candidates = (await src.igdbSearch(parsed.name)).filter(worthShowing).map(candidateOf);
          await store.cacheSet(key, candidates);
        }
      } else if (parsed.steamAppId) {
        const key = `steam_${parsed.steamAppId}`;
        candidates = await store.cacheGet(key);
        if (!candidates) {
          const [steam, igdb] = await Promise.all([src.steamGet(parsed.steamAppId), src.igdbFindBySteam(parsed.steamAppId).catch((e) => (e instanceof SourceError ? null : Promise.reject(e)))]);
          candidates = igdb ? [candidateOf(igdb)] : steam
            ? [{ igdbId: null, steamAppId: steam.appId, title: steam.name, year: null, cover: null, input: { steamAppId: steam.appId } }]
            : [];
          await store.cacheSet(key, candidates);
        }
      } else {
        const rec = parsed.igdbSlug ? await src.igdbBySlug(parsed.igdbSlug) : await src.igdbGet(parsed.igdbId);
        candidates = rec ? [candidateOf(rec)] : [];
      }
    } catch (err) { throw sourceError(err, SourceError); }

    const out = [];
    for (const cand of candidates.slice(0, 8)) {
      const slug = (cand.igdbId && (await store.lookupKey(`igdb_${cand.igdbId}`))) || (cand.steamAppId && (await store.lookupKey(`steam_${cand.steamAppId}`))) || null;
      out.push({ ...cand, inVault: slug });
    }
    return { ok: true, candidates: out };
  });

  // ---------- vaultAddGame ----------
  const vaultAddGame = onCall({ secrets: TWITCH }, async (request) => {
    const c = requireVerifiedMember(await callerInfo(request));
    const { input, byHand, pendingCoverId } = request.data || {};
    if (!c.isStaff) {
      const until = store.msOf(c.pausedUntil);
      if (until && until > Date.now()) throw fail("failed-precondition", "Adding games is paused for you for now.", "paused", { until });
      if ((await store.readLimit(c.uid, "adds")) >= ADDS_PER_DAY) throw fail("resource-exhausted", `You can add ${ADDS_PER_DAY} games a day. Try again tomorrow.`, "addLimit");
    }
    let r;
    try {
      r = byHand
        ? await C.runByHandChecks({ name: byHand.name, link: byHand.link, lookupKey: store.lookupKey, handle: c.handle })
        : await C.runChecks({ input, sources: sources(), lookupKey: store.lookupKey, isStaff: c.isStaff, origin: c.isAdmin ? "boomer" : "community", handle: c.handle });
    } catch (err) { throw sourceError(err, SourceError); }
    const reply = (extra = {}) => ({ ok: r.decision !== "error" && r.decision !== "refused", decision: r.decision, code: r.code, message: r.message, checks: r.checks, ...extra });

    if (r.decision === "error") throw fail("unavailable", r.message, r.code, { checks: r.checks });

    if (r.decision === "refused") {
      await store.logAdmin({ action: "refused", title: String(byHand?.name || (typeof input === "string" ? input : JSON.stringify(input || ""))).slice(0, 120), actorUid: c.uid, actorName: c.name, details: { code: r.code, uid: c.uid } });
      return reply();
    }

    if (r.decision === "duplicate") return reply(await countWant(r.duplicateSlug, c.uid));

    if (r.decision === "queued") {
      // The same game already waiting for a check isn't queued twice.
      const waiting = await queue.where("keys", "array-contains", r.keys[0]).limit(1).get();
      if (!waiting.empty) return reply({ code: "alreadyQueued", message: "Already waiting for a quick check." });
      const id = queue.doc().id;
      let coverHoldId = null;
      if (byHand && typeof pendingCoverId === "string") {
        const hold = await queue.doc(pendingCoverId).get();
        if (hold.exists && hold.get("kind") === "cover" && hold.get("held") === true && (await submitterOf(pendingCoverId)) === c.uid) coverHoldId = pendingCoverId;
      }
      const batch = db.batch();
      batch.set(queueItem(id), {
        kind: "add", game: r.game, source: r.source, keys: r.keys, reason: r.queueReason, code: r.code,
        checks: r.checks.map((x) => ({ id: x.id, state: x.state })), submittedBy: { handle: c.handle }, held: false, coverHoldId,
        createdAt: FieldValue.serverTimestamp(),
      });
      batch.set(queueItem(id).collection("private").doc("submitter"), { uid: c.uid });
      if (coverHoldId) batch.update(queueItem(coverHoldId), { forAdd: id });
      await batch.commit();
      await store.logAdmin({ action: "queue", title: r.game.title, actorUid: c.uid, actorName: c.name, details: { queueId: id, kind: "add", reason: r.queueReason } });
      return reply({ queueId: id });
    }

    // added
    if (!c.isStaff && !(await store.bumpLimit(c.uid, "adds", ADDS_PER_DAY))) throw fail("resource-exhausted", `You can add ${ADDS_PER_DAY} games a day. Try again tomorrow.`, "addLimit");
    const made = await store.createGame({ draft: r.game, source: r.source, keys: r.keys, addedByUid: c.uid, checks: r.checks, reason: "Added automatically" });
    if (!made.ok) return reply({ decision: "duplicate", code: "duplicate", message: "Already in the Vault.", ...(await countWant(made.duplicateSlug, c.uid)) });
    await Promise.all([
      store.logAdmin({ action: "add", slug: made.slug, title: r.game.title, actorUid: c.uid, actorName: c.name, details: { origin: r.game.origin, via: c.isStaff ? "staff" : "automatic" } }),
      store.digestAdd(made.slug, r.game),
    ]);
    await store.rebuildPublic();
    await factory.recordFactoryEvent(c.uid, "vault", { action: "add", slug: made.slug }, `add-${made.slug}`, { keep: true });
    return reply({ slug: made.slug, title: r.game.title });
  });

  /** A +1 for a member on a game that is already there (wishlist games only). */
  async function countWant(slug, uid) {
    const g = await games.doc(slug).get();
    if (!g.exists) return { slug, wantedCount: 0 };
    let wantedCount = g.get("wantedCount") || 0;
    if (g.get("status") === "wishlist" && g.get("hidden") !== true) {
      const before = wantedCount;
      wantedCount = (await store.setWant(slug, uid, true)) ?? wantedCount;
      if (wantedCount !== before) await store.rebuildPublic();
    }
    return { slug, title: g.get("title"), status: g.get("status"), wantedCount };
  }

  // ---------- vaultWant ----------
  const vaultWant = onCall(async (request) => {
    const c = requireVerifiedMember(await callerInfo(request));
    const { slug, on } = request.data || {};
    if (typeof slug !== "string" || !slug || typeof on !== "boolean") throw fail("invalid-argument", "slug and on are required.", "args");
    const g = await games.doc(slug).get();
    if (!g.exists || g.get("hidden") === true) throw fail("not-found", "That game isn't in the Vault.", "noGame");
    if (g.get("status") !== "wishlist") throw fail("failed-precondition", "Only wishlist games can be wanted.", "notWishlist");
    const wantedCount = await store.setWant(slug, c.uid, on);
    await store.rebuildPublic();
    if (on) await factory.recordFactoryEvent(c.uid, "vault", { action: "want", slug }, `want-${slug}`, { keep: true });
    return { ok: true, wantedCount, on };
  });

  // ---------- the queue ----------
  const vaultQueueList = onCall({ secrets: cloudSecrets }, async (request) => {
    requireStaff(await callerInfo(request));
    const creds = cloudCreds();
    const snap = await queue.orderBy("createdAt", "asc").limit(200).get();
    const items = [];
    for (const d of snap.docs) {
      const x = d.data();
      if (x.held) continue;
      const preview = async (assetDoc) => (assetDoc?.publicId ? cloud.previewUrl(creds, assetDoc.publicId, assetDoc.format || "jpg") : null);
      let coverPreview = null;
      if (x.kind === "cover") coverPreview = await preview(x);
      else if (x.coverHoldId) coverPreview = await preview((await queue.doc(x.coverHoldId).get()).data());
      const gameDoc = x.kind === "cover" && x.slug ? (await games.doc(x.slug).get()).data() : null;
      items.push({
        id: d.id, kind: x.kind, reason: x.reason || "", code: x.code || null, checks: x.checks || [],
        submittedBy: x.submittedBy?.handle || null, createdAt: store.msOf(x.createdAt),
        slug: x.slug || null, title: x.game?.title || gameDoc?.title || x.title || "",
        game: x.game ? { title: x.game.title, summary: x.game.summary, cover: x.game.cover, tags: x.game.tags?.auto || [], links: x.game.links, ids: x.game.ids, developers: x.game.developers, releaseStatus: x.game.releaseStatus } : null,
        coverPreview, previewExpiresInSeconds: coverPreview ? cloud.PREVIEW_TTL_S : null,
      });
    }
    return { ok: true, items, count: items.length };
  });

  async function dropQueueItem(id) {
    await db.recursiveDelete(queueItem(id));
  }

  async function dropCoverAsset(assetId, creds) {
    if (!assetId) return;
    try { await performAssetDeletion(assetId, creds, { clearLinkedField: false }); }
    catch (err) { if (err.code !== "not-found") throw err; }   // already gone is fine
  }

  const vaultReviewQueue = onCall({ secrets: cloudSecrets }, async (request) => {
    const c = requireStaff(await callerInfo(request));
    const { id, decision, reason = "", replacementUploadId } = request.data || {};
    if (typeof id !== "string" || !id || !["approve", "reject", "replace"].includes(decision)) throw fail("invalid-argument", "id and decision (approve, reject or replace) are required.", "args");
    if (typeof reason !== "string" || reason.length > 300) throw fail("invalid-argument", "The reason can be at most 300 characters.", "args");
    const snap = await queueItem(id).get();
    if (!snap.exists || snap.get("held")) throw fail("not-found", "That item is no longer in the queue.", "noItem");
    const item = snap.data();
    const creds = cloudCreds();
    const submitterUid = await submitterOf(id);
    const log = (action, title, slug, extra = {}) => store.logAdmin({ action, slug, title, actorUid: c.uid, actorName: c.name, reason, details: { queueId: id, kind: item.kind, decision, ...extra } });

    // ----- an add -----
    if (item.kind === "add") {
      if (decision === "replace") throw fail("invalid-argument", "Only covers can be replaced.", "args");
      if (decision === "reject") {
        if (item.coverHoldId) { const hold = await queue.doc(item.coverHoldId).get(); await dropCoverAsset(hold.get("assetId"), creds); await dropQueueItem(item.coverHoldId); }
        await dropQueueItem(id);
        await notify(submitterUid, { kind: "add", title: item.game.title, decision: "rejected", reason: reason.trim() });
        await log("queue", item.game.title, null, { result: "rejected" });
        return { ok: true, result: "rejected" };
      }
      const made = await store.createGame({ draft: item.game, source: item.source, keys: item.keys, addedByUid: submitterUid, checks: item.checks, reason: item.reason });
      if (!made.ok) {
        if (submitterUid) await store.setWant(made.duplicateSlug, submitterUid, true);
        await dropQueueItem(id);
        await log("queue", item.game.title, made.duplicateSlug, { result: "duplicate" });
        await store.rebuildPublic();
        return { ok: true, result: "duplicate", slug: made.duplicateSlug };
      }
      if (submitterUid) await store.bumpLimit(submitterUid, "adds");     // an approved add counts toward the day's 5
      if (item.coverHoldId) {                                            // the by-hand cover becomes an ordinary cover item for the new game
        const hold = await queue.doc(item.coverHoldId).get();
        if (hold.exists) await queue.doc(item.coverHoldId).update({ held: false, slug: made.slug, forAdd: FieldValue.delete(), title: item.game.title, createdAt: FieldValue.serverTimestamp() });
      }
      await dropQueueItem(id);
      await Promise.all([store.digestAdd(made.slug, item.game), log("queue", item.game.title, made.slug, { result: "approved" })]);
      await store.rebuildPublic();
      await notify(submitterUid, { kind: "add", title: item.game.title, slug: made.slug, decision: "approved", reason: "" });
      if (submitterUid) await factory.recordFactoryEvent(submitterUid, "vault", { action: "add", slug: made.slug }, `add-${made.slug}`, { keep: true });
      return { ok: true, result: "approved", slug: made.slug };
    }

    // ----- a cover suggestion -----
    const gRef = games.doc(item.slug);
    const g = await gRef.get();
    if (!g.exists) {
      await dropCoverAsset(item.assetId, creds); await dropQueueItem(id);
      return { ok: true, result: "gone" };
    }
    if (decision === "reject") {
      await dropCoverAsset(item.assetId, creds);
      await dropQueueItem(id);
      await notify(submitterUid, { kind: "cover", title: g.get("title"), slug: item.slug, decision: "rejected", reason: reason.trim() });
      await log("cover", g.get("title"), item.slug, { result: "rejected" });
      return { ok: true, result: "rejected" };
    }
    if (g.get("cover")) throw fail("failed-precondition", "This game already has a cover. Reject the suggestion.", "hasCover");

    let newCover, newAssetId = null;
    if (decision === "approve") {
      const moved = await cloud.moveToPublic(fetch, creds, item.publicId);
      await db.collection("externalAssets").doc(item.assetId).update({
        url: moved.url, publicId: moved.publicId, deliveryType: "upload",
        linkedDoc: { collection: `sites/${store.SITE_ID}/vaultGames`, docId: item.slug, field: "cover.url" },
      });
      newCover = { source: "upload", url: moved.url, publicId: moved.publicId, byHandle: item.submittedBy?.handle || null };
    } else {   // replace: the mod uploaded their own to the public covers folder
      if (typeof replacementUploadId !== "string" || !replacementUploadId.startsWith(`${cloud.PUBLIC_FOLDER}/`)) throw fail("invalid-argument", "replacementUploadId must be a file in the covers folder.", "args");
      const info = await cloud.resourceInfo(fetch, creds, replacementUploadId, "upload");
      const problem = cloud.coverProblem(info);
      if (problem) throw fail("invalid-argument", "That file can't be a cover.", "badCover", { problem });
      if (!(await assetsFor(replacementUploadId)).empty) throw fail("failed-precondition", "That upload is already in use.", "inUse");
      newAssetId = await recordAssetCreated({ url: info.secure_url, publicId: info.public_id, feature: "gameVault", sizeBytes: info.bytes, linkedCollection: `sites/${store.SITE_ID}/vaultGames`, linkedDocId: item.slug, linkedField: "cover.url" });
      newCover = { source: "upload", url: info.secure_url, publicId: info.public_id, byHandle: null };
    }
    try {
      await gRef.update({ cover: newCover, updatedAt: FieldValue.serverTimestamp() });
    } catch (err) {
      if (newAssetId) await performAssetDeletion(newAssetId, creds, { clearLinkedField: false }).catch((e) => console.error("vault: couldn't roll back the replacement cover", e));
      throw err;
    }
    if (decision === "replace") await dropCoverAsset(item.assetId, creds);   // the member's file goes, after the new cover is saved
    await dropQueueItem(id);
    await store.rebuildPublic();
    await notify(submitterUid, { kind: "cover", title: g.get("title"), slug: item.slug, decision: decision === "approve" ? "approved" : "replaced", reason: "" });
    await log("cover", g.get("title"), item.slug, { result: decision === "approve" ? "approved" : "replaced" });
    if (decision === "approve" && submitterUid) await factory.recordFactoryEvent(submitterUid, "vault", { action: "cover", slug: item.slug }, `cover-${item.slug}`, { keep: true });
    return { ok: true, result: decision === "approve" ? "approved" : "replaced" };
  });

  // ---------- vaultHideGame ----------
  const vaultHideGame = onCall(async (request) => {
    const c = requireStaff(await callerInfo(request));
    const { slug, hidden, reason = "" } = request.data || {};
    if (typeof slug !== "string" || !slug || typeof hidden !== "boolean") throw fail("invalid-argument", "slug and hidden are required.", "args");
    const gRef = games.doc(slug);
    const [g, src] = await Promise.all([gRef.get(), gRef.collection("private").doc("source").get()]);
    if (!g.exists) throw fail("not-found", "That game isn't in the Vault.", "noGame");
    if (g.get("origin") !== "community") throw fail("failed-precondition", "Only community picks can be hidden.", "notCommunity");
    if ((g.get("hidden") === true) === hidden) return { ok: true, changed: false };
    await gRef.update({ hidden, updatedAt: FieldValue.serverTimestamp() });
    const adderUid = src.get("addedByUid");
    if (hidden) {
      if (adderUid) await site.collection("members").doc(adderUid).set({ vaultAddPausedUntil: Timestamp.fromMillis(Date.now() + PAUSE_MS) }, { merge: true });
      await store.digestRemove(slug);
    }
    await store.logAdmin({ action: "hide", slug, title: g.get("title"), actorUid: c.uid, actorName: c.name, reason: String(reason).slice(0, 300), details: { hidden, pausedAdder: hidden && !!adderUid } });
    await store.rebuildPublic();
    return { ok: true, changed: true, hidden };
  });

  // ---------- vaultDeleteGame ----------
  const vaultDeleteGame = onCall({ secrets: cloudSecrets }, async (request) => {
    const c = requireAdmin(await callerInfo(request));
    const { slug } = request.data || {};
    if (typeof slug !== "string" || !slug) throw fail("invalid-argument", "slug is required.", "args");
    const gRef = games.doc(slug);
    const g = await gRef.get();
    if (!g.exists) throw fail("not-found", "That game isn't in the Vault.", "noGame");

    // Refused while the Scream Planner still uses it: on a ballot that is taking votes, or in a planned or scheduled slot.
    const inPlanner = await plannerRefs(db, slug);
    if (inPlanner.ballots.length || inPlanner.slots.length) {
      throw fail("failed-precondition", "It's on next week's ballot or planned in a slot; take it off first, or set it to Abandoned instead.", "inPlanner", { ballots: inPlanner.ballots.length, slots: inPlanner.slots.length });
    }
    // Refused while any stream references it.
    const refs = new Set();
    for (const field of ["plannedGameIds", "gameIds"]) {
      (await site.collection("streams").where(field, "array-contains", slug).get()).docs.forEach((d) => refs.add(d.id));
    }
    if (refs.size) throw fail("failed-precondition", `Appears in ${refs.size} stream${refs.size === 1 ? "" : "s"}; set it to Abandoned instead.`, "inStreams", { count: refs.size });

    const creds = cloudCreds();
    // 1. Cloudinary first (the cover upload, any pending cover suggestions), through the approved delete path.
    const assets = await db.collection("externalAssets").where("linkedDoc.collection", "==", `sites/${store.SITE_ID}/vaultGames`).where("linkedDoc.docId", "==", slug).get();
    for (const a of assets.docs) await performAssetDeletion(a.id, creds, { clearLinkedField: false });
    const covers = await queue.where("slug", "==", slug).get();
    for (const q of covers.docs) { await dropCoverAsset(q.get("assetId"), creds); await dropQueueItem(q.id); }
    // 2. Records: the duplicate keys. 3. The game with its subcollections. 4. Its activity events.
    const keys = await store.keysCol.where("slug", "==", slug).get();
    const batch = db.batch(); keys.docs.forEach((k) => batch.delete(k.ref)); await batch.commit();
    const snapshot = { title: g.get("title"), status: g.get("status"), origin: g.get("origin"), summary: (g.get("summary") || "").slice(0, 2000), review: g.get("review") ? { score: g.get("review").score, verdict: g.get("review").verdict } : null };
    await db.recursiveDelete(gRef);
    const events = await db.collection("activityLog").where("gameId", "==", slug).get();
    const evBatch = db.batch(); events.docs.filter((e) => e.get("feature") === "game-vault").forEach((e) => evBatch.delete(e.ref)); await evBatch.commit();
    await store.digestRemove(slug);
    await store.logAdmin({ action: "delete", slug, title: snapshot.title, actorUid: c.uid, actorName: c.name, snapshot: { title: snapshot.title, status: snapshot.status, origin: snapshot.origin, summary: snapshot.summary } });
    await store.rebuildPublic();
    return { ok: true, eventsDeleted: events.size };
  });

  // ---------- covers ----------
  const vaultCoverSignature = onCall({ secrets: cloudSecrets }, async (request) => {
    const c = requireStaff(await callerInfo(request));
    await uploadGate(c, "vaultCover");   // Cloud Stash: paused or stopped uploads are refused first (staff may still upload when only members are paused)
    return { ok: true, ...cloud.uploadParams({ creds: cloudCreds(), folder: cloud.PUBLIC_FOLDER }) };
  });

  const vaultCoverSuggestSignature = onCall({ secrets: cloudSecrets }, async (request) => {
    const c = requireVerifiedMember(await callerInfo(request));
    await uploadGate(c, "vaultSuggestion");   // Cloud Stash: first, before any other check
    const { slug } = request.data || {};
    if (slug != null) {
      if (typeof slug !== "string") throw fail("invalid-argument", "slug must be text.", "args");
      const g = await games.doc(slug).get();
      if (!g.exists || g.get("hidden") === true) throw fail("not-found", "That game isn't in the Vault.", "noGame");
      if (g.get("cover")) throw fail("failed-precondition", "This game already has a cover.", "hasCover");
      if ((await queueItem(coverItemId(slug, c.uid)).get()).exists) throw fail("already-exists", "You already suggested a cover for this game.", "alreadySuggested");
    }
    if (!(await store.bumpLimit(c.uid, "covers", c.isStaff ? Infinity : COVERS_PER_DAY))) throw fail("resource-exhausted", `You can suggest ${COVERS_PER_DAY} covers a day.`, "coverLimit");
    const publicId = `${cloud.PENDING_FOLDER}/p_${crypto.randomBytes(12).toString("hex")}`;
    return { ok: true, publicId, ...cloud.uploadParams({ creds: cloudCreds(), type: "authenticated", publicId, context: `owner=${c.uid}` }) };
  });

  const coverItemId = (slug, uid) => `cover_${slug}_${sha(uid).slice(0, 16)}`;

  const vaultCoverSubmit = onCall({ secrets: cloudSecrets }, async (request) => {
    const c = requireVerifiedMember(await callerInfo(request));
    const { publicId, slug } = request.data || {};
    if (typeof publicId !== "string" || !publicId.startsWith(`${cloud.PENDING_FOLDER}/p_`) || publicId.length > 120) throw fail("invalid-argument", "That isn't one of your pending uploads.", "args");
    if (slug != null && typeof slug !== "string") throw fail("invalid-argument", "slug must be text.", "args");
    let game = null;
    if (slug) {
      game = await games.doc(slug).get();
      if (!game.exists || game.get("hidden") === true) throw fail("not-found", "That game isn't in the Vault.", "noGame");
      if (game.get("cover")) throw fail("failed-precondition", "This game already has a cover.", "hasCover");
    }
    const creds = cloudCreds();
    const info = await cloud.resourceInfo(fetch, creds, publicId, "authenticated");
    const problem = cloud.coverProblem(info);
    if (problem) throw fail("invalid-argument", "That file can't be a cover.", "badCover", { problem });
    if (info.context?.custom?.owner !== c.uid) throw fail("permission-denied", "That upload isn't yours.", "notOwner");
    if (!(await assetsFor(publicId)).empty) throw fail("already-exists", "That upload was already submitted.", "inUse");

    const id = slug ? coverItemId(slug, c.uid) : queue.doc().id;   // one pending suggestion per member per game
    if (slug && (await queueItem(id).get()).exists) throw fail("already-exists", "You already suggested a cover for this game.", "alreadySuggested");
    const base = { kind: "cover", slug: slug || null, title: game ? game.get("title") : "", publicId, format: info.format, submittedBy: { handle: c.handle }, held: !slug, createdAt: FieldValue.serverTimestamp() };
    const batch = db.batch();
    batch.set(queueItem(id), base);
    batch.set(queueItem(id).collection("private").doc("submitter"), { uid: c.uid });
    await batch.commit();
    try {
      const assetId = await recordAssetCreated({ url: info.secure_url, publicId, feature: "gameVault", sizeBytes: info.bytes, deliveryType: "authenticated", linkedCollection: `sites/${store.SITE_ID}/vaultQueue`, linkedDocId: id, linkedField: "coverUrl" });
      await queueItem(id).update({ assetId, coverUrl: info.secure_url });
    } catch (err) {
      await dropQueueItem(id).catch(() => {});   // the file stays in pending; the daily sweep removes it
      throw err;
    }
    if (game) await store.logAdmin({ action: "queue", slug, title: game.get("title"), actorUid: c.uid, actorName: `@${c.handle}`, details: { queueId: id, kind: "cover" } });
    return { ok: true, id, pendingCoverId: slug ? null : id };
  });

  // ---------- daily sweep of pending covers ----------
  const vaultSweepPendingCovers = onSchedule({ schedule: "every day 04:30", timeZone: "America/Chicago", secrets: cloudSecrets }, async () => {
    const creds = cloudCreds();
    const cutoff = Date.now() - PENDING_MAX_AGE_MS;
    // Held by-hand covers whose add was never sent: through the approved delete path.
    const held = await queue.where("held", "==", true).get();
    for (const d of held.docs) {
      if ((store.msOf(d.get("createdAt")) || 0) > cutoff) continue;
      try { await dropCoverAsset(d.get("assetId"), creds); await dropQueueItem(d.id); }
      catch (err) { console.error(`vaultSweepPendingCovers: couldn't remove held cover ${d.id}`, err); }
    }
    // Files uploaded to pending but never submitted (no externalAssets record): older than 24 h.
    let removed = 0;
    for (const f of await cloud.listPending(fetch, creds)) {
      if (f.createdAt > cutoff) continue;
      if (!(await assetsFor(f.publicId)).empty) continue;
      try { await cloudinaryDelete({ publicId: f.publicId, resourceType: "image", type: "authenticated", ...creds }); removed++; }
      catch (err) { console.error(`vaultSweepPendingCovers: couldn't delete ${f.publicId}`, err); }
    }
    console.log(`vaultSweepPendingCovers: removed ${removed} unsubmitted upload(s)`);
  });

  // ---------- weekly refresh of unreleased and early-access games ----------
  const vaultRefresh = onSchedule({ schedule: "every monday 04:00", timeZone: "America/Chicago", secrets: TWITCH }, async () => {
    const snap = await games.where("releaseStatus", "in", ["unreleased", "early_access"]).limit(REFRESH_BATCH).get();
    const src = sources();
    let updated = 0, vanished = 0;
    for (const d of snap.docs) {
      const igdbId = d.get("ids")?.igdb;
      if (!igdbId) continue;
      try {
        const rec = await src.igdbGet(igdbId);
        const srcRef = d.ref.collection("private").doc("source");
        if (!rec) { await srcRef.set({ vanished: true, vanishedAt: FieldValue.serverTimestamp() }, { merge: true }); vanished++; continue; }
        const steam = d.get("ids")?.steam ? await src.steamGet(d.get("ids").steam).catch(() => null) : null;
        const draft = C.buildDrafts({ igdb: rec, steam, cover: d.get("cover"), origin: d.get("origin"), handle: d.get("addedBy")?.handle, now: Date.now() }).game;
        const patch = {
          title: rec.name, sortTitle: draft.sortTitle, altNames: draft.altNames, releaseDate: store.ts(draft.releaseDate), releaseStatus: draft.releaseStatus,
          timeToBeat: draft.timeToBeat, developers: draft.developers, publishers: draft.publishers,
          "tags.auto": draft.tags.auto, metaFetchedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        };
        if (d.get("title") !== rec.name) {   // a rename: the slug stays; the new title gets a duplicate key if it's free
          const key = `title_${C.titleKey(rec.name)}`;
          if (!(await store.lookupKey(key))) await store.keysCol.doc(key).set({ slug: d.id, createdAt: FieldValue.serverTimestamp() });
        }
        await d.ref.update(patch);
        await srcRef.set({ vanished: FieldValue.delete() }, { merge: true });
        updated++;
      } catch (err) { console.error(`vaultRefresh: ${d.id}`, err); }
    }
    if (updated || vanished) await store.rebuildPublic();
    console.log(`vaultRefresh: ${updated} updated, ${vanished} not found on IGDB`);
  });

  const editor = makeEditor({ store, deps: { performAssetDeletion, recordAssetCreated, cloudCreds } });

  return {
    // exported from functions/index.js as Cloud Functions
    functions: {
      vaultLookup, vaultAddGame, vaultWant, vaultQueueList, vaultReviewQueue, vaultHideGame, vaultDeleteGame,
      vaultCoverSignature, vaultCoverSuggestSignature, vaultCoverSubmit, vaultSweepPendingCovers, vaultRefresh,
    },
    // not a function of its own: adminEditItem calls it for feature "vaultGame"
    editVaultGame: editor.editVaultGame,
    store,
  };
};
