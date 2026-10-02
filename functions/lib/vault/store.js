// Game Vault Firestore access (docs/specs/game-vault.md §4, §8): the single place that
// creates a game with its duplicate keys, rebuilds the public/vault summary, keeps the
// rolling activity digest, counts a member's brakes and caches lookups. Used by the callables
// in index.js, the cover flow, the editor and the stream trigger. Admin SDK only.
//
//   sites/{siteId}/vaultGames/{slug}            the game (public read; this module writes)
//   …/vaultGames/{slug}/private/source          checks, themes, the adder's uid (staff read)
//   …/vaultGames/{slug}/wants/{uid}             { createdAt } (no client read)
//   sites/{siteId}/vaultKeys/{key}              { slug } duplicate keys: igdb_{id} steam_{appid} title_{key}
//   sites/{siteId}/vaultQueue/{id}              the mod queue (staff read)
//   sites/{siteId}/vaultCache/{source}_{id}     lookup results   (TTL 7 days: expireAt)
//   sites/{siteId}/vaultLimits/{uid}            brakes           (TTL: expireAt)
//   sites/{siteId}/public/vault                 the summary doc every visit reads
//   sites/{siteId}/private/vaultDigest          pointer to the open "games added" digest
const admin = require("firebase-admin");
const D = require("./digest");
const S = require("../streams/logic");
const { dayKey } = require("../arcade/logic");

const SITE_ID = "boomertanger";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LIMITS_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const PUBLIC_WARN_BYTES = 700 * 1024;
const TZ_FALLBACK = "America/Chicago";

module.exports = function makeStore({ adminLogEntry }) {
  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;
  const Timestamp = admin.firestore.Timestamp;

  const site = db.doc(`sites/${SITE_ID}`);
  const games = site.collection("vaultGames");
  const keysCol = site.collection("vaultKeys");
  const queue = site.collection("vaultQueue");
  const cache = site.collection("vaultCache");
  const limits = site.collection("vaultLimits");
  const publicVault = site.collection("public").doc("vault");
  const digestPtr = site.collection("private").doc("vaultDigest");

  const ts = (ms) => (ms == null ? null : Timestamp.fromMillis(ms));
  const msOf = (t) => (t == null ? null : typeof t === "number" ? t : t.toMillis ? t.toMillis() : null);

  // ---------- the site's time zone ----------
  let tzCache = null;
  async function siteTz() {
    if (tzCache && Date.now() - tzCache.at < 10 * 60 * 1000) return tzCache.value;
    const snap = await site.get();
    const value = (snap.exists && snap.get("timezone")) || TZ_FALLBACK;
    tzCache = { value, at: Date.now() };
    return value;
  }

  // ---------- duplicate keys ----------
  async function lookupKey(key) {
    const snap = await keysCol.doc(key).get();
    return snap.exists ? snap.get("slug") || null : null;
  }

  // ---------- creating a game ----------
  /**
   * Writes the game, its private source doc and its duplicate keys in one transaction.
   * The keys are re-checked inside it, so two members adding the same game at once leave one
   * game and one "already there". Returns { ok: true, slug } or { ok: false, duplicateSlug }.
   */
  async function createGame({ draft, source, keys, addedByUid, checks, reason, now = Date.now() }) {
    const base = draft.slug;
    const slugs = [base, ...Array.from({ length: 8 }, (_, i) => `${base}-${i + 2}`)];
    return db.runTransaction(async (tx) => {
      const keyRefs = keys.map((k) => keysCol.doc(k));
      const slugRefs = slugs.map((s) => games.doc(s));
      const [keySnaps, slugSnaps] = await Promise.all([tx.getAll(...keyRefs), tx.getAll(...slugRefs)]);
      const taken = keySnaps.find((s) => s.exists);
      if (taken) return { ok: false, duplicateSlug: taken.get("slug") };
      const at = slugSnaps.findIndex((s) => !s.exists);
      if (at < 0) throw new Error("vault: no free slug for " + base);
      const slug = slugs[at];
      const stamp = FieldValue.serverTimestamp();
      tx.set(games.doc(slug), {
        ...draft,
        slug,
        releaseDate: ts(draft.releaseDate),
        stats: { streamCount: 0, minutes: 0, firstStreamedAt: null, lastStreamedAt: null },
        legacy: { streamCount: 0, minutes: 0, lastStreamedAt: null },
        createdAt: stamp, updatedAt: stamp, statusChangedAt: stamp, metaFetchedAt: stamp, editedAt: null, editCount: 0,
      });
      tx.set(games.doc(slug).collection("private").doc("source"), {
        ...source,
        addedByUid: addedByUid || null,
        checks: (checks || []).map((c) => ({ id: c.id, state: c.state })),
        reason: reason || "",
        createdAt: stamp,
      });
      for (const k of keys) tx.set(keysCol.doc(k), { slug, createdAt: stamp });
      return { ok: true, slug };
    });
  }

  // ---------- "I want this too" ----------
  /** Counts a member once on a game that is already there (or removes the count). Returns the new wantedCount. */
  async function setWant(slug, uid, on) {
    const gRef = games.doc(slug), wRef = gRef.collection("wants").doc(uid);
    return db.runTransaction(async (tx) => {
      const [g, w] = await Promise.all([tx.get(gRef), tx.get(wRef)]);
      if (!g.exists) return null;
      let count = g.get("wantedCount") || 0;
      if (on && !w.exists) { tx.set(wRef, { createdAt: FieldValue.serverTimestamp() }); count += 1; tx.update(gRef, { wantedCount: count }); }
      else if (!on && w.exists) { tx.delete(wRef); count = Math.max(0, count - 1); tx.update(gRef, { wantedCount: count }); }
      return count;
    });
  }

  // ---------- public/vault ----------
  function card(id, g) {
    const stats = S.displayStats(
      { streamCount: g.stats?.streamCount, minutes: g.stats?.minutes, lastStreamedAt: g.stats?.lastStreamedAt },
      { streamCount: g.legacy?.streamCount, minutes: g.legacy?.minutes, lastStreamedAt: g.legacy?.lastStreamedAt },
    );
    return {
      slug: id,
      title: g.title,
      sortTitle: g.sortTitle,
      altNames: g.altNames || [],
      status: g.status,
      origin: g.origin,
      by: g.addedBy?.handle || null,
      wanted: g.wantedCount || 0,
      cover: g.cover || null,
      release: msOf(g.releaseDate),
      releaseStatus: g.releaseStatus || "released",
      developers: g.developers || [],
      tags: [...(g.tags?.auto || []), ...(g.tags?.boomer || [])],
      ttb: g.timeToBeat?.normally ?? null,
      score: g.review?.score ?? null,
      verdict: g.review?.verdict || null,
      streams: stats.streamCount,
      minutes: stats.minutes,
      last: stats.lastStreamedAt,
      added: msOf(g.createdAt),
      statusAt: msOf(g.statusChangedAt),
    };
  }

  /** Rebuilds the summary doc from every non-hidden game. Warns in the logs above 700 KB. */
  async function rebuildPublic() {
    const snap = await games.where("hidden", "==", false).get();
    const cards = snap.docs.map((d) => card(d.id, d.data())).sort((a, b) => String(a.sortTitle).localeCompare(String(b.sortTitle), "en"));
    const counts = new Map();
    for (const c of cards) for (const t of c.tags) counts.set(t, (counts.get(t) || 0) + 1);
    const tags = [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "en"));
    const doc = { games: cards, tags, count: cards.length, updatedAt: FieldValue.serverTimestamp() };
    const bytes = Buffer.byteLength(JSON.stringify({ games: cards, tags }));
    if (bytes > PUBLIC_WARN_BYTES) console.warn(`vault: public/vault is ${Math.round(bytes / 1024)} KB (warn at 700 KB, hard limit 1 MB)`);
    await publicVault.set({ ...doc, bytes });
    return { count: cards.length, bytes };
  }

  // ---------- the rolling "games added" digest ----------
  async function digestAdd(slug, game, now = Date.now()) {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(digestPtr);
      const ptr = snap.exists && snap.get("count") > 0 ? snap.data() : null;
      const r = D.applyAdd(ptr, { id: slug, title: game.title, cover: game.cover || null }, now);
      if (r.action === "none") return;
      if (r.action === "open") {
        const ev = db.collection("activityLog").doc();
        tx.set(ev, { ...r.event, createdAt: Timestamp.fromMillis(now) });
        tx.set(digestPtr, { ...r.pointer, eventId: ev.id });
      } else {
        tx.set(db.collection("activityLog").doc(ptr.eventId), { ...r.event, createdAt: Timestamp.fromMillis(ptr.openedAt) }, { merge: true });
        tx.set(digestPtr, { ...r.pointer, eventId: ptr.eventId });
      }
    });
  }

  async function digestRemove(slug) {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(digestPtr);
      if (!snap.exists) return;
      const ptr = snap.data();
      const r = D.applyRemove(ptr, slug);
      if (r.action === "none") return;
      const evRef = db.collection("activityLog").doc(ptr.eventId);
      if (r.action === "delete") { tx.delete(evRef); tx.delete(digestPtr); return; }
      tx.set(evRef, { ...r.event, createdAt: Timestamp.fromMillis(ptr.openedAt) }, { merge: true });
      tx.set(digestPtr, { ...r.pointer, eventId: ptr.eventId });
    });
  }

  async function postEvent(event) {
    await db.collection("activityLog").add({ ...event, createdAt: FieldValue.serverTimestamp() });
  }

  // ---------- adminLog ----------
  async function buildLog({ action, slug, title, actorUid, actorName, reason, changes, details, snapshot }) {
    return adminLogEntry(db, {
      feature: "gameVault",
      action,
      itemPath: slug ? `sites/${SITE_ID}/vaultGames/${slug}` : `sites/${SITE_ID}/vaultQueue`,
      itemTitle: title || slug || "",
      actorUid: actorUid ?? null,
      actorName: actorName || "Automatic",
      reason: reason || "",
      ...(changes ? { changes } : {}),
      ...(details ? { details } : {}),
      ...(snapshot ? { snapshot } : {}),
    });
  }
  async function logAdmin(params) {
    await db.collection("adminLog").add(await buildLog(params));
  }

  // ---------- brakes (per member) ----------
  // vaultLimits/{uid} holds one counter per kind and the window it counts, e.g.
  // { lookups: 3, lookupsKey: "2026-10-02T14" }. Expires through the expireAt TTL.
  async function windowKey(kind, now) {
    return kind === "lookups" ? new Date(now).toISOString().slice(0, 13) : dayKey(now, await siteTz());
  }
  async function readLimit(uid, kind, now = Date.now()) {
    const snap = await limits.doc(uid).get();
    const key = await windowKey(kind, now);
    return snap.exists && snap.get(`${kind}Key`) === key ? snap.get(kind) || 0 : 0;
  }
  /** Adds one to a counter. With max, refuses (returns false) once it is reached, without counting. */
  async function bumpLimit(uid, kind, max = Infinity, now = Date.now()) {
    const key = await windowKey(kind, now);
    const ref = limits.doc(uid);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const used = snap.exists && snap.get(`${kind}Key`) === key ? snap.get(kind) || 0 : 0;
      if (used >= max) return false;
      tx.set(ref, { [kind]: used + 1, [`${kind}Key`]: key, expireAt: Timestamp.fromMillis(now + LIMITS_TTL_MS) }, { merge: true });
      return true;
    });
  }

  // ---------- lookup cache (7 days) ----------
  async function cacheGet(key, now = Date.now()) {
    const snap = await cache.doc(key).get();
    if (!snap.exists) return null;
    const exp = msOf(snap.get("expireAt"));
    return exp && exp > now ? JSON.parse(snap.get("json")) : null;
  }
  async function cacheSet(key, value, now = Date.now()) {
    await cache.doc(key).set({ json: JSON.stringify(value), expireAt: Timestamp.fromMillis(now + CACHE_TTL_MS) });
  }

  return {
    SITE_ID, site, games, keysCol, queue, publicVault, digestPtr,
    ts, msOf, siteTz, lookupKey, createGame, setWant, card, rebuildPublic,
    digestAdd, digestRemove, postEvent, buildLog, logAdmin, readLimit, bumpLimit, cacheGet, cacheSet,
  };
};
