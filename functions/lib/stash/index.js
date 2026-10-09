// Cloud Stash callables and schedules (docs/specs/cloud-stash.md §1, §3, §4, §6). The admin tool at /admin/stash reads Firestore directly (rules: admins read) and does everything
// that changes anything through these. Gating uses the real accounts and role claims (callerInfo): every callable needs an admin; the safety net is a SERVER refusal for the actions
// the spec marks "Owner, A2, A3" (an A1 Steward gets "Needs the owner or an Overseer.") and for owner-only ones.
//
//   stashUsageRefresh   A1+                 Cloudinary's usage -> storageUsage/cloudinary (status and upload state). Once per 10 minutes.
//   stashScan           A1+                 classify every record (linked / orphan / stale / due), find unrecorded and untracked files, recount storageUsage/current. Once per 10 minutes.
//   stashPreview        A1+                 a 10-minute signed link to a private file. Logged.
//   stashPurge          Owner, A2, A3       up to 50 records, each through performAssetDeletion (the new-site replacement for deleteExternalAsset).
//   stashPurgeUntracked Owner               record an untracked file, then performAssetDeletion.
//   stashRuleDryRun     A1+                 what a rule would purge now (count, bytes, five examples). Read-only.
//   stashRuleSave       Owner, A2, A3       create, update, toggle on, delete (A1 may only toggle OFF); on/create/update re-count and refuse if it differs from expectCount.
//   stashSweepNow       Owner, A2, A3       the same sweep code the daily schedule runs.
//   stashSettings       Owner, A2, A3       the pause point, pause or resume; retentionDays is owner only.
//   stashUsageDaily     05:15 Los Angeles   refresh the usage.    stashScanWeekly  Monday 05:30 Los Angeles   a scan.
// Every write is logged to adminLog (feature cloudStash); scans and dry runs are read-only and not logged. Cloud Stash writes nothing to activityLog.
//
// build(deps) is what scripts/check-stash.js runs against the in-memory Firestore. deps: adminLogEntry, now(), cloud (lib/cloudinary.js), cloudCreds(), cloudSecrets, performAssetDeletion,
// recordUntrackedAsset, crewStore, alert(kind, payload), fetch.
const { onCall } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const { SITE_ID, fail, callerInfo, requireAdmin } = require("../vault/common");
const L = require("./logic");
const T = require("./targets");
const { makeSweep } = require("./sweep");

const text = (err) => String((err && err.message) || err).slice(0, 200);
const idStr = (v) => (typeof v === "string" && v && v.length <= 200 && !v.includes("/") ? v : null);

function build(deps = {}) {
  const db = deps.db || admin.firestore();
  const { FieldValue, Timestamp } = admin.firestore;
  const now = deps.now || Date.now;
  let crewMod = deps.crewStore, cloudMod = deps.cloud;
  const crewStore = () => (crewMod ||= require("../crew/store").makeStore({ db, adminLogEntry: deps.adminLogEntry }));
  const cloud = () => (cloudMod ||= require("../cloudinary"));
  const fetchFn = deps.fetch || ((...a) => fetch(...a));
  const creds = () => deps.cloudCreds();
  // the six admin-health alerts go through the existing notifyOutbox writer (lib/stash/alerts.js); a check can pass its own to capture them
  const alert = deps.alert || require("./alerts").makeAlerts({ db, now, adminLogEntry: deps.adminLogEntry }).raise;
  const sweeper = makeSweep({ db, now, creds, performAssetDeletion: deps.performAssetDeletion, adminLogEntry: deps.adminLogEntry, alert });
  const ms = (v) => (v == null ? 0 : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : 0);

  // ---------- who ----------
  /** The caller: an admin, with their tier: "owner", "overseer" (A2 and A3) or "steward" (A1, and admins with no admin-ladder grade). */
  async function whoAmI(request) {
    const c = requireAdmin(await callerInfo(request));
    const store = crewStore();
    const w = await store.who(c.uid);
    c.tier = c.isOwner ? "owner" : store.a2plus(w) ? "overseer" : "steward";
    return c;
  }
  const needOverseer = (c) => { if (c.tier === "steward") throw fail("permission-denied", "Needs the owner or an Overseer.", "needsOverseer"); };
  const needOwner = (c) => { if (c.tier !== "owner") throw fail("permission-denied", "Only the owner can do this.", "ownerOnly"); };
  const actorOf = (c) => ({ uid: c.uid, name: c.name });

  async function log(actor, { action, itemPath, itemTitle, reason = "", changes, details }) {
    try {
      const entry = await deps.adminLogEntry(db, { feature: "cloudStash", action, itemPath, itemTitle, actorUid: actor.uid ?? null, actorName: actor.name || "Admin", reason, changes, details });
      await db.collection("adminLog").add(entry);
    } catch (err) { console.error("stash: adminLog write failed", text(err)); }
  }

  /** Refresh and Scan now are each allowed once per 10 minutes per site (counters in sites/boomertanger/rateLimits). */
  async function rateGate(kind) {
    const ref = db.doc(`sites/${SITE_ID}/rateLimits/stash_${kind}`);
    const at = now();
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const wait = L.tooSoon(snap.exists ? snap.get("at") : 0, at);
      if (wait) throw fail("resource-exhausted", `That just ran. Try again in ${Math.ceil(wait / 60)} minute${wait > 60 ? "s" : ""}.`, "tooSoon", { retryInS: wait });
      tx.set(ref, { at, expireAt: Timestamp.fromMillis(at + 2 * L.RATE_WINDOW_MS) }, { merge: true });
    });
  }

  const storageSettings = async () => L.settingsOf((await db.doc("adminSettings/storage").get()).data());

  // ---------- usage ----------
  /** Fetches the usage and writes storageUsage/cloudinary. On a failed fetch the old numbers stay and `failures` counts up (two days running is an alert). */
  async function refreshUsage({ strict = false } = {}) {
    const ref = db.doc("storageUsage/cloudinary");
    const before = (await ref.get()).data() || {};
    let json;
    try { json = await cloud().usage(fetchFn, creds()); }
    catch (err) {
      const failures = (before.failures || 0) + 1;
      await ref.set({ failures }, { merge: true });
      if (failures >= 2) await alert("stash-usage-stale", { failures });
      if (strict) throw fail("unavailable", "Couldn't reach Cloudinary. The numbers on the page are the last ones we had.", "usageDown");
      return null;
    }
    const u = L.normalizeUsage(json);
    const s = await storageSettings();
    const st = L.statusOf(u.credits.pct, s);
    const doc = { ...u, status: st.status, uploads: st.uploads, fetchedAt: Timestamp.fromMillis(now()), failures: 0 };
    await ref.set(doc);
    for (const kind of L.alertKinds({ before: before.credits, after: u.credits, pauseAtPct: s.pauseAtPct, failures: 0 })) await alert(kind, { pct: u.credits.pct });
    return doc;
  }

  // ---------- scan ----------
  async function scan(actor) {
    const at = now();
    const recs = (await db.collection("externalAssets").limit(5000).get()).docs;
    const known = new Set(recs.map((d) => d.get("publicId")));
    // which records an enabled rule would purge (the Files tab's "Due for the sweep")
    const due = new Map();
    for (const r of (await db.collection("cleanupRules").where("enabled", "==", true).get()).docs) {
      try { const c = await sweeper.candidates(r.data()); if (c.ok) c.items.forEach((i) => due.set(i.assetId, r.id)); } catch (err) { console.error("stash scan: a rule's query failed", r.id, text(err)); }
    }
    const cache = new Map();
    const linked = async (a) => {
      const k = `${a.linkedDoc.collection}/${a.linkedDoc.docId}`;
      if (!cache.has(k)) cache.set(k, db.doc(k).get().then((s) => (s.exists ? s.data() : null)));
      return cache.get(k);
    };
    const counts = { orphan: 0, stale: 0, unrecorded: 0, untracked: 0 };
    let batch = db.batch(), pending = 0;
    for (const d of recs) {
      const a = d.data();
      const state = L.classifyRecord(a, a.linkedDoc ? await linked(a) : null);
      if (state === "orphan") counts.orphan++; else if (state === "stale") counts.stale++;
      const dueRule = due.get(d.id) || null;
      const prev = a.scan || {};
      if (prev.state !== state || (prev.due || null) !== dueRule) { batch.update(d.ref, { scan: { state, at: Timestamp.fromMillis(at), ...(dueRule ? { due: dueRule } : {}) } }); pending++; }
      if (pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0; }
    }
    if (pending) await batch.commit();

    // items that point at a file with no record (report only): Bug Zapper screenshots and uploaded Vault covers
    const unrecorded = [];
    const reports = await db.collection(T.BUG_SCREENSHOTS.collection).limit(500).get();
    for (const d of reports.docs) { const p = d.get("shotRef"); if (p && !known.has(p)) unrecorded.push({ path: `${T.BUG_SCREENSHOTS.collection}/${d.id}`, field: "shotRef", publicId: p }); }
    const games = await db.collection(`sites/${SITE_ID}/vaultGames`).limit(500).get();
    for (const d of games.docs) { const cv = d.get("cover"); if (cv && cv.source === "upload" && cv.publicId && !known.has(cv.publicId)) unrecorded.push({ path: `sites/${SITE_ID}/vaultGames/${d.id}`, field: "cover.url", publicId: cv.publicId }); }
    counts.unrecorded = unrecorded.length;

    // files Cloudinary holds that nothing recorded (upload and authenticated, up to 2,000)
    const files = [];
    let truncated = false;
    for (const type of ["upload", "authenticated"]) {
      const list = await cloud().listResources(fetchFn, creds(), { type, max: L.SCAN_RESOURCE_CAP - files.length });
      files.push(...list);
      if (list.truncated || files.length >= L.SCAN_RESOURCE_CAP) { truncated = true; break; }
    }
    const untrackedAll = files.filter((f) => !known.has(f.publicId));
    counts.untracked = untrackedAll.length;
    if (untrackedAll.length > L.LIST_CAP) truncated = true;
    const doc = {
      at: Timestamp.fromMillis(at), by: actor.name || "Automatic", counts,
      untracked: untrackedAll.slice(0, L.LIST_CAP).map((f) => ({ publicId: f.publicId, type: f.type, bytes: f.bytes, createdAt: f.createdAt })),
      unrecorded: unrecorded.slice(0, L.LIST_CAP), truncated,
    };
    const prev = (await db.doc("storageUsage/scan").get()).data();
    await db.doc("storageUsage/scan").set(doc);
    // the recount fixes increment drift: the records are the truth
    const rc = L.recount(recs.map((d) => d.data()));
    await db.doc("storageUsage/current").set({ totalBytes: rc.totalBytes, byFeature: rc.byFeature, recountedAt: Timestamp.fromMillis(at), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    for (const kind of L.alertKinds({ scan: counts, prevScan: prev && prev.counts, pauseAtPct: 100 })) await alert(kind, counts);
    return { ...doc, at, counts };
  }

  // ---------- callables ----------
  async function usageRefresh(request) {
    await whoAmI(request);
    await rateGate("refresh");
    return { ok: true, usage: await refreshUsage({ strict: true }) };
  }
  async function scanNow(request) {
    const c = await whoAmI(request);
    await rateGate("scan");
    const out = await scan(actorOf(c));
    return { ok: true, counts: out.counts, truncated: out.truncated };
  }
  async function preview(request) {
    const c = await whoAmI(request);
    const id = idStr((request.data || {}).assetId);
    if (!id) throw fail("invalid-argument", "Say which file.", "args");
    const snap = await db.doc(`externalAssets/${id}`).get();
    if (!snap.exists) throw fail("not-found", "That file isn't recorded any more.", "noAsset");
    const a = snap.data();
    if (a.deliveryType !== "authenticated") throw fail("failed-precondition", "Only private files need a signed preview.", "notPrivate");
    const format = (String(a.url || "").match(/\.([a-z0-9]{2,5})(?:\?|$)/i) || [])[1] || "png";
    await log(actorOf(c), { action: "preview", itemPath: `externalAssets/${id}`, itemTitle: a.publicId, details: { feature: a.feature || "" } });
    return { ok: true, url: cloud().previewUrl(creds(), a.publicId, format.toLowerCase(), now()), expiresInS: cloud().PREVIEW_TTL_S };
  }
  async function purge(request) {
    const c = await whoAmI(request);
    needOverseer(c);
    const ids = (request.data || {}).assetIds;
    if (!Array.isArray(ids) || !ids.length || ids.length > L.BATCH_MAX || ids.some((x) => !idStr(x))) throw fail("invalid-argument", `Send 1 to ${L.BATCH_MAX} file ids.`, "args");
    const results = [];
    for (const id of [...new Set(ids)]) {
      try {
        const before = await db.doc(`externalAssets/${id}`).get();
        if (!before.exists) { results.push({ assetId: id, ok: true, already: true, bytes: 0 }); continue; }   // purged elsewhere meanwhile: "already gone" is success
        await deps.performAssetDeletion(id, creds(), { logActor: actorOf(c) });
        results.push({ assetId: id, ok: true, bytes: before.get("sizeBytes") || 0 });
      } catch (err) {
        if (err && err.code === "not-found") results.push({ assetId: id, ok: true, already: true, bytes: 0 });
        else results.push({ assetId: id, ok: false, error: text(err) });
      }
    }
    return { ok: true, results, purged: results.filter((r) => r.ok && !r.already).length, bytes: results.reduce((n, r) => n + (r.ok ? r.bytes : 0), 0) };
  }
  async function purgeUntracked(request) {
    const c = await whoAmI(request);
    needOwner(c);
    const { publicId, type } = request.data || {};
    if (typeof publicId !== "string" || !publicId || publicId.length > 300 || !["upload", "authenticated"].includes(type)) throw fail("invalid-argument", "Say which file and its type.", "args");
    if (!(await db.collection("externalAssets").where("publicId", "==", publicId).limit(1).get()).empty) throw fail("failed-precondition", "That file has a record. Purge it from the Files tab.", "tracked");
    const info = await cloud().resourceInfo(fetchFn, creds(), publicId, type);
    if (!info) { await dropUntracked(publicId); return { ok: true, already: true }; }   // Cloudinary already lost it
    const id = await deps.recordUntrackedAsset({ publicId, deliveryType: type, sizeBytes: info.bytes || 0, url: info.secure_url || "" });
    await deps.performAssetDeletion(id, creds(), {});
    await log(actorOf(c), { action: "purge-untracked", itemPath: `externalAssets/${id}`, itemTitle: publicId, details: { publicId, type, bytes: info.bytes || 0 } });
    await dropUntracked(publicId);
    return { ok: true, bytes: info.bytes || 0 };
  }
  /** The purged file leaves the scan's untracked list at once. */
  async function dropUntracked(publicId) {
    const ref = db.doc("storageUsage/scan");
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const list = (snap.get("untracked") || []).filter((x) => x.publicId !== publicId);
      const counts = { ...(snap.get("counts") || {}) };
      if (list.length !== (snap.get("untracked") || []).length) { counts.untracked = Math.max(0, (counts.untracked || 0) - 1); tx.update(ref, { untracked: list, counts }); }
    });
  }
  async function ruleDryRun(request) {
    await whoAmI(request);
    const v = T.validateRule((request.data || {}).rule);
    if (!v.ok) throw fail("invalid-argument", v.message, v.reason, v.field ? { field: v.field } : {});
    const found = await sweeper.candidates(v.value);
    if (!found.ok) throw fail("invalid-argument", found.message, found.reason);
    return { ok: true, count: found.count, bytes: found.bytes, examples: found.examples.map((e) => ({ title: e.title, link: e.link, days: e.days, bytes: e.bytes })), truncated: found.truncated, sentence: T.sentence(v.value) };
  }
  const legacyFields = (v) => { const t = T.targetOf(v.target); return { feature: t.feature, collection: t.collection, matchField: t.matchField, matchValue: t.matchValue, ageField: t.ageField, ageThresholdDays: v.days }; };
  const numbersChanged = (found) => fail("failed-precondition", "The numbers changed since you looked. Check them again.", "numbersChanged", { count: found.count, bytes: found.bytes });
  async function ruleSave(request) {
    const c = await whoAmI(request);
    const { op, rule, id, expectCount, enabled, updatedAtMs } = request.data || {};
    const actor = actorOf(c);
    if (op === "toggle") {
      if (typeof enabled !== "boolean" || !idStr(id)) throw fail("invalid-argument", "Say which rule and whether it is on.", "args");
      if (enabled) needOverseer(c);   // an A1 Steward may only switch a rule OFF
      const ref = db.doc(`cleanupRules/${id}`);
      const snap = await ref.get();
      if (!snap.exists) throw fail("not-found", "That rule isn't there any more.", "noRule");
      const r = snap.data();
      if (enabled && T.isLegacyShaped(r)) throw fail("failed-precondition", "A rule from the old page can only be switched off.", "legacy");
      if (enabled && T.isUnsafe(r)) throw fail("failed-precondition", "This rule isn't in a safe shape. Edit it first.", "unsafe");
      if (enabled) {
        const found = await sweeper.candidates(r);
        if (!found.ok) throw fail("failed-precondition", found.message, found.reason);
        if (found.count !== expectCount) throw numbersChanged(found);
      }
      await ref.set({ enabled, updatedBy: actor, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await log(actor, { action: "rule-toggle", itemPath: `cleanupRules/${id}`, itemTitle: r.name || id, changes: { enabled: { before: r.enabled === true, after: enabled } } });
      return { ok: true, id, enabled };
    }
    needOverseer(c);
    if (op === "delete") {
      if (!idStr(id)) throw fail("invalid-argument", "Say which rule.", "args");
      const ref = db.doc(`cleanupRules/${id}`);
      const snap = await ref.get();
      if (!snap.exists) throw fail("not-found", "That rule isn't there any more.", "noRule");
      await ref.delete();
      await log(actor, { action: "rule-delete", itemPath: `cleanupRules/${id}`, itemTitle: snap.get("name") || id, details: { rule: { name: snap.get("name") || "", target: snap.get("target") || "legacy", days: snap.get("days") ?? snap.get("ageThresholdDays") ?? null } } });
      return { ok: true, id };
    }
    if (op !== "create" && op !== "update") throw fail("invalid-argument", "Pick create, update, toggle or delete.", "args");
    const v = T.validateRule(rule);
    if (!v.ok) throw fail("invalid-argument", v.message, v.reason, v.field ? { field: v.field } : {});
    let existing = null, ref;
    if (op === "update") {
      if (!idStr(id)) throw fail("invalid-argument", "Say which rule.", "args");
      ref = db.doc(`cleanupRules/${id}`);
      const snap = await ref.get();
      if (!snap.exists) throw fail("not-found", "That rule isn't there any more.", "noRule");
      existing = snap.data();
      if (T.isLegacyShaped(existing)) throw fail("failed-precondition", "A rule from the old page can't be edited here.", "legacy");
      if (ms(existing.updatedAt) !== Number(updatedAtMs || 0)) throw fail("aborted", "Someone else changed this rule. Reload and try again.", "conflict");
    } else ref = db.collection("cleanupRules").doc();
    const on = op === "create" ? rule.enabled === true : existing.enabled === true;
    const found = await sweeper.candidates(v.value);
    if (!found.ok) throw fail("failed-precondition", found.message, found.reason);
    if ((on || expectCount !== undefined) && found.count !== expectCount) throw numbersChanged(found);
    const fields = { name: v.value.name, target: v.value.target, statuses: v.value.statuses, days: v.value.days, ...legacyFields(v.value), updatedBy: actor, updatedAt: FieldValue.serverTimestamp() };
    if (op === "create") await ref.set({ ...fields, enabled: on, createdBy: actor, createdAt: FieldValue.serverTimestamp() });
    else await ref.set(fields, { merge: true });
    await log(actor, { action: "rule-save", itemPath: `cleanupRules/${ref.id}`, itemTitle: v.value.name, details: { op, sentence: T.sentence(v.value), count: found.count, bytes: found.bytes, enabled: on }, changes: op === "update" ? { days: { before: existing.days ?? null, after: v.value.days } } : undefined });
    return { ok: true, id: ref.id, count: found.count, bytes: found.bytes };
  }
  async function sweepNow(request) {
    const c = await whoAmI(request);
    needOverseer(c);
    return { ok: true, sweep: await sweeper.run({ actor: actorOf(c), trigger: "manual" }) };
  }
  async function settings(request) {
    const c = await whoAmI(request);
    const v = L.validateSettings(request.data);
    if (!v.ok) throw fail(v.code, v.message, v.reason, v.field ? { field: v.field } : {});
    const s = v.value, actor = actorOf(c);
    if (s.retentionDays !== undefined) needOwner(c); else needOverseer(c);
    const before = await storageSettings();
    if (s.retentionDays !== undefined) {
      const ref = db.doc("adminSettings/log");
      const prev = (await ref.get()).get("retentionDays");
      await ref.set({ retentionDays: s.retentionDays }, { merge: true });
      await log(actor, { action: "retention", itemPath: "adminSettings/log", itemTitle: "Log retention", changes: { retentionDays: { before: prev ?? null, after: s.retentionDays } }, details: { appliesTo: "new entries only" } });
    }
    const patch = {};
    if (s.pauseAtPct !== undefined) patch.pauseAtPct = s.pauseAtPct;
    if (s.manualPause !== undefined) { patch.manualPause = s.manualPause; patch.manualPauseReason = s.manualPause ? s.reason || "" : ""; }
    if (Object.keys(patch).length) {
      await db.doc("adminSettings/storage").set(patch, { merge: true });
      if (s.pauseAtPct !== undefined && s.pauseAtPct !== before.pauseAtPct) await log(actor, { action: "limits", itemPath: "adminSettings/storage", itemTitle: "Pause point", changes: { pauseAtPct: { before: before.pauseAtPct, after: s.pauseAtPct } } });
      if (s.manualPause !== undefined && s.manualPause !== before.manualPause) await log(actor, { action: "pause", itemPath: "adminSettings/storage", itemTitle: s.manualPause ? "Paused member uploads" : "Resumed member uploads", reason: s.reason || "", changes: { manualPause: { before: before.manualPause, after: s.manualPause } } });
      // the upload state follows at once, from the numbers we already have
      const ref = db.doc("storageUsage/cloudinary");
      const u = (await ref.get()).data();
      if (u) { const st = L.statusOf(u.credits && u.credits.pct, await storageSettings()); await ref.set({ status: st.status, uploads: st.uploads }, { merge: true }); }
    }
    return { ok: true, settings: await storageSettings() };
  }

  const secrets = deps.cloudSecrets;
  const functions = {
    stashUsageRefresh: onCall({ secrets }, usageRefresh), stashScan: onCall({ secrets, timeoutSeconds: 300 }, scanNow), stashPreview: onCall({ secrets }, preview),
    stashPurge: onCall({ secrets, timeoutSeconds: 300 }, purge), stashPurgeUntracked: onCall({ secrets }, purgeUntracked), stashRuleDryRun: onCall(ruleDryRun),
    stashRuleSave: onCall(ruleSave), stashSweepNow: onCall({ secrets, timeoutSeconds: 540 }, sweepNow), stashSettings: onCall(settings),
    stashUsageDaily: onSchedule({ schedule: "every day 05:15", timeZone: "America/Los_Angeles", secrets }, async () => { await refreshUsage(); }),
    stashScanWeekly: onSchedule({ schedule: "every monday 05:30", timeZone: "America/Los_Angeles", secrets, timeoutSeconds: 540 }, async () => { await scan({ uid: null, name: "Automatic" }); }),
  };
  return { functions, ops: { usageRefresh, scanNow, preview, purge, purgeUntracked, ruleDryRun, ruleSave, sweepNow, settings, refreshUsage, scan }, sweeper, runSweep: (o) => sweeper.run(o) };
}

module.exports = function stash(deps) { return build(deps); };
module.exports.build = build;
