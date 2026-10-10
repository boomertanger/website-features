// Broken links (docs/specs/not-found.md "Data: Report this broken link"): the 404 page's report button and the /admin card's Mark fixed.
// Every document here is written ONLY by these functions (Admin SDK); firestore.rules lets admins read brokenLinks and nobody write.
//
//   sites/{siteId}/brokenLinks/{sha1(path)}   { path, count, firstAt, lastAt, referrerHosts (≤ 5 unique), fixedAt, fixedBy }
//   sites/{siteId}/rateLimits/{key}           reports per visitor per hour, and one per path per visitor per day (TTL: expireAt)
//   sites/{siteId}/private/arcadeSalt         the daily salt that hashes visitor IPs (shared with the Arcade, which rotates it)
//
//   reportBrokenLink({ path, referrer })   anyone (visitors and members). The server strips the query and hash again; the path must start
//                                          with "/" and be at most 300 characters; the referrer is kept as its host, or "direct". At most
//                                          10 reports per hour per visitor key (the Arcade's pattern: the uid, or the salted IP), and one
//                                          per path per key per day (later ones return ok without counting). A report on a fixed row
//                                          reopens it (fixedAt: null) and counts.                                   -> { ok: true }
//   brokenLinkFix({ id })                  admins only. Sets fixedAt and fixedBy (the row leaves the card; never deleted) and writes an
//                                          adminLog entry (feature brokenLinks, action fix).                      -> { ok: true, already? }
const crypto = require("crypto");
const { onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { callerInfo, requireAdmin, fail } = require("../vault/common");
const { dayKey } = require("../arcade/logic");

const SITE_ID = "boomertanger";
const MAX_PATH = 300, MAX_HOSTS = 5, PER_HOUR = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const sha = (alg, s) => crypto.createHash(alg).update(s).digest("hex");
const hourKey = (now) => new Date(now).toISOString().slice(0, 13).replace(/\D/g, "");   // 2026101016 (UTC)

/** The path to store: query and hash stripped, "/"-led, at most 300 characters. Throws invalid-argument otherwise. */
function cleanPath(raw) {
  if (typeof raw !== "string") throw fail("invalid-argument", "That isn't an address.", "badPath");
  const path = raw.split(/[?#]/)[0].trim();
  if (!path.startsWith("/") || path.length > MAX_PATH || /[\u0000-\u001f\u007f]/.test(path)) throw fail("invalid-argument", "That isn't an address.", "badPath");
  return path;
}

/** The referrer's host ("www.google.com"), or "direct" when there's none or it isn't a web address. */
function referrerHost(raw) {
  if (typeof raw !== "string" || !raw) return "direct";
  try { const u = new URL(raw); return /^https?:$/.test(u.protocol) && u.host ? u.host.toLowerCase().slice(0, 100) : "direct"; }
  catch { return "direct"; }
}

const linkId = (path) => sha("sha1", path);

module.exports = function brokenLinks({ adminLogEntry, now = () => Date.now() } = {}) {
  const db = () => admin.firestore();
  const site = () => db().doc(`sites/${SITE_ID}`);
  const { Timestamp, FieldValue } = admin.firestore;

  // The Arcade's daily salt (same doc, same rule: created on first use of the day; rollupArcadeStats rotates it).
  async function salt() {
    const t = now(), ref = site().collection("private").doc("arcadeSalt");
    return db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists && snap.get("day") === dayKey(t)) return snap.get("value");
      const fresh = crypto.randomBytes(32).toString("hex");
      tx.set(ref, { value: fresh, day: dayKey(t), rotatedAt: Timestamp.now() });
      return fresh;
    });
  }

  /** Who's reporting, as a stable key for today: the uid, or the salted IP (never stored as is). */
  async function visitorKey(request) {
    const uid = request.auth?.uid || null;
    if (uid) return `u_${sha("sha256", uid).slice(0, 32)}`;
    const ip = request.rawRequest?.ip || "unknown";
    return `ip_${sha("sha256", `${await salt()}|${ip}`).slice(0, 32)}`;
  }

  async function report(request) {
    const data = request.data || {};
    const path = cleanPath(data.path);
    const host = referrerHost(data.referrer);
    const t = now(), who = await visitorKey(request);
    const limits = site().collection("rateLimits");
    const hourRef = limits.doc(`brokenLinks_${sha("sha256", `${who}|${hourKey(t)}`).slice(0, 32)}`);
    const seenRef = limits.doc(`brokenLinks_seen_${sha("sha256", `${who}|${path}|${dayKey(t)}`).slice(0, 32)}`);
    const ref = site().collection("brokenLinks").doc(linkId(path));
    await db().runTransaction(async (tx) => {
      const [seen, hour, row] = await Promise.all([tx.get(seenRef), tx.get(hourRef), tx.get(ref)]);
      if (seen.exists) return;   // this visitor already reported this address today: ok, not counted again
      const count = hour.exists ? hour.get("count") || 0 : 0;
      if (count >= PER_HOUR) throw fail("resource-exhausted", "Too many reports this hour. Try again later.", "rateLimit");
      const expireAt = Timestamp.fromMillis(t + DAY_MS), at = Timestamp.fromMillis(t);
      tx.set(hourRef, { count: count + 1, expireAt }, { merge: true });
      tx.set(seenRef, { expireAt });
      if (!row.exists) {
        tx.set(ref, { path, count: 1, firstAt: at, lastAt: at, referrerHosts: [host], fixedAt: null, fixedBy: null });
      } else {
        const hosts = row.get("referrerHosts") || [];
        tx.set(ref, {
          count: (row.get("count") || 0) + 1, lastAt: at,
          referrerHosts: hosts.includes(host) || hosts.length >= MAX_HOSTS ? hosts : [...hosts, host],
          fixedAt: null, fixedBy: null,   // a report on a fixed row reopens it
        }, { merge: true });
      }
    });
    return { ok: true };
  }

  async function fix(request) {
    const c = requireAdmin(await callerInfo(request));
    const id = request.data?.id;
    if (typeof id !== "string" || !/^[0-9a-f]{40}$/.test(id)) throw fail("invalid-argument", "That isn't a broken link.", "badId");
    const ref = site().collection("brokenLinks").doc(id);
    const entry = await adminLogEntry(db(), { feature: "brokenLinks", action: "fix", itemPath: ref.path, itemTitle: "", actorUid: c.uid, actorName: c.name });
    return db().runTransaction(async (tx) => {
      const row = await tx.get(ref);
      if (!row.exists) throw fail("not-found", "That broken link is gone.", "notFound");
      if (row.get("fixedAt")) return { ok: true, already: true };
      tx.update(ref, { fixedAt: FieldValue.serverTimestamp(), fixedBy: c.uid });
      tx.set(db().collection("adminLog").doc(), { ...entry, itemTitle: row.get("path") || "", details: { count: row.get("count") || 0 } });
      return { ok: true };
    });
  }

  return {
    handlers: { report, fix },
    reportBrokenLink: onCall((request) => report(request)),
    brokenLinkFix: onCall((request) => fix(request)),
  };
};

module.exports.cleanPath = cleanPath;
module.exports.referrerHost = referrerHost;
module.exports.linkId = linkId;
