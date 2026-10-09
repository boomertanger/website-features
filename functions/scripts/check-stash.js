#!/usr/bin/env node
// functions/scripts/check-stash.js: Cloud Stash (lib/stash/*, docs/specs/cloud-stash.md §1, §3, §4, §5). Part 1 proves the pure rules (settings and their limits, usage -> status and upload state,
// the rate limit, how a scan classifies a record, the allowlist, the upload gate, the alert rules). Part 2 runs every callable and the sweep against the in-memory Firestore with fakes for Cloudinary
// and the delete path: who may do what (the server-side safety net), the sweep's cap and feature-key limit, "numbers changed", conflicts, the delete order. No network, no credentials, no deploy.
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { makeDb } = require("./fixtures/fake-firestore");
const admin = require("firebase-admin");
process.env.GCLOUD_PROJECT ||= "boomertanger-staging";
process.env.FIREBASE_CONFIG ||= JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const wdb = makeDb(); const realFs = admin.firestore;
const fakeFs = () => wdb; fakeFs.Timestamp = realFs.Timestamp; fakeFs.FieldValue = realFs.FieldValue;
Object.defineProperty(admin, "firestore", { value: fakeFs, configurable: true, writable: true });

const L = require("../lib/stash/logic");
const T = require("../lib/stash/targets");
const G = require("../lib/stash/gate");

// ================================================================ part 1: the pure rules
(function pure() {
  const bad = (r, reason, field) => { assert.equal(r.ok, false); assert.equal(r.reason, reason); if (field) assert.equal(r.field, field); };
  // settings
  assert.deepEqual(L.settingsOf(null), { pauseAtPct: 80, manualPause: false, manualPauseReason: "", runCap: 100 });
  assert.equal(L.settingsOf({ pauseAtPct: 10 }).pauseAtPct, 60, "clamped up"); assert.equal(L.settingsOf({ pauseAtPct: 99 }).pauseAtPct, 95, "clamped down"); assert.equal(L.settingsOf({ runCap: 5000 }).runCap, 500);
  assert.equal(L.validateSettings({ pauseAtPct: 70 }).ok, true); bad(L.validateSettings({ pauseAtPct: 59 }), "invalid", "pauseAtPct"); bad(L.validateSettings({ pauseAtPct: 96 }), "invalid", "pauseAtPct"); bad(L.validateSettings({ pauseAtPct: 70.5 }), "invalid", "pauseAtPct");
  bad(L.validateSettings({ manualPause: "yes" }), "invalid", "manualPause"); bad(L.validateSettings({ retentionDays: 89 }), "invalid", "retentionDays"); bad(L.validateSettings({ retentionDays: 731 }), "invalid", "retentionDays");
  assert.equal(L.validateSettings({ retentionDays: 90 }).ok, true); assert.equal(L.validateSettings({ retentionDays: 730 }).ok, true); bad(L.validateSettings({}), "nothing"); bad(L.validateSettings({ reason: "x".repeat(201) }), "invalid", "reason");
  // usage and status
  const u = L.normalizeUsage({ plan: "Free", credits: { usage: 12.5, limit: 25, used_percent: 50 }, storage: { usage: 1000, credits_usage: 1.5 }, bandwidth: { usage: 5, credits_usage: 2 }, transformations: { usage: 9, credits_usage: 9 } });
  assert.deepEqual(u, { credits: { used: 12.5, limit: 25, pct: 50 }, storage: { usage: 1000, credits: 1.5 }, bandwidth: { usage: 5, credits: 2 }, transformations: { usage: 9, credits: 9 }, plan: "Free" }, "the limit comes from the response");
  assert.equal(L.normalizeUsage({ credits: { usage: 5, limit: 20 } }).credits.pct, 25, "pct from usage over limit when used_percent is missing");
  assert.equal(L.normalizeUsage({}).credits.pct, null, "a plan with no credit limit is unknown, not zero"); assert.equal(L.normalizeUsage(null).credits.used, 0);
  const st = (pct, s) => L.statusOf(pct, s);
  assert.deepEqual(st(10, {}), { status: "healthy", uploads: "open" }); assert.deepEqual(st(79.9, {}), { status: "healthy", uploads: "open" });
  assert.deepEqual(st(80, {}), { status: "paused", uploads: "members-paused" }); assert.deepEqual(st(99.9, {}), { status: "paused", uploads: "members-paused" });
  assert.deepEqual(st(100, {}), { status: "over", uploads: "stopped" }); assert.deepEqual(st(140, {}), { status: "over", uploads: "stopped" });
  assert.deepEqual(st(70, { pauseAtPct: 70 }), { status: "paused", uploads: "members-paused" }, "a lower pause point"); assert.deepEqual(st(30, { manualPause: true }), { status: "paused", uploads: "members-paused" }, "manual pause forces paused");
  assert.deepEqual(st(null, {}), { status: "healthy", uploads: "open" }); assert.equal(st(100, { manualPause: true }).status, "over", "over wins over a manual pause");
  // rate limit
  assert.equal(L.tooSoon(0, 1000), null); assert.equal(L.tooSoon(1000, 1000 + 9 * 60000), 60); assert.equal(L.tooSoon(1000, 1000 + 10 * 60000), null);
  // classification
  const asset = { url: "https://res.example/a.png", publicId: "bug-zapper/r1/shot", linkedDoc: { collection: "c", docId: "d", field: "shotRef" } };
  assert.equal(L.classifyRecord(asset, null), "orphan"); assert.equal(L.classifyRecord(asset, { shotRef: "bug-zapper/r1/shot" }), "linked");
  assert.equal(L.classifyRecord(asset, {}), "stale", "the field is gone"); assert.equal(L.classifyRecord(asset, { shotRef: "bug-zapper/other/shot" }), "stale");
  assert.equal(L.classifyRecord({ ...asset, linkedDoc: { ...asset.linkedDoc, field: "cover.url" } }, { cover: { url: "https://res.example/a.png" } }), "linked", "dotted fields");
  assert.equal(L.classifyRecord({ ...asset, linkedDoc: { ...asset.linkedDoc, field: "cover.url" } }, { cover: { url: "https://res.example/c_fill/bug-zapper/r1/shot.png" } }), "linked", "a URL that contains the public id still points at it");
  assert.equal(L.classifyRecord({ url: "", publicId: "x", linkedDoc: null }, null), "linked", "an untracked purge in progress is not an orphan");
  const rc = L.recount([{ feature: "gameVault", sizeBytes: 10 }, { feature: "gameVault", sizeBytes: 5 }, { feature: "bugZapper", sizeBytes: 7 }, { sizeBytes: 1 }]);
  assert.deepEqual(rc, { byFeature: { gameVault: { bytes: 15, files: 2 }, bugZapper: { bytes: 7, files: 1 }, unknown: { bytes: 1, files: 1 } }, totalBytes: 23 });
  // sweep result and alerts
  assert.equal(L.sweepStatus({ purged: 3, failures: 0, capped: false, attempted: 3 }), "ok"); assert.equal(L.sweepStatus({ purged: 3, failures: 1, capped: false, attempted: 4 }), "partial");
  assert.equal(L.sweepStatus({ purged: 0, failures: 2, capped: false, attempted: 2 }), "failed"); assert.equal(L.sweepStatus({ purged: 100, failures: 0, capped: true, attempted: 100 }), "capped");
  assert.equal(L.sweepStatus({ purged: 0, failures: 1, capped: false, attempted: 0 }), "partial", "a rule that couldn't even run is a partial run");
  const k = (o) => L.alertKinds({ pauseAtPct: 80, failures: 0, ...o });
  assert.deepEqual(k({ sweep: { status: "failed" } }), ["stash-sweep-failed"]); assert.deepEqual(k({ sweep: { status: "partial" } }), ["stash-sweep-failed"]); assert.deepEqual(k({ sweep: { status: "capped" } }), ["stash-sweep-capped"]); assert.deepEqual(k({ sweep: { status: "ok" } }), []);
  assert.deepEqual(k({ before: { pct: 70 }, after: { pct: 85 } }), ["stash-usage-80"]); assert.deepEqual(k({ before: { pct: 85 }, after: { pct: 90 } }), [], "already past the pause point: no new crossing");
  assert.deepEqual(k({ before: { pct: 95 }, after: { pct: 101 } }), ["stash-usage-100"]); assert.deepEqual(k({ before: { pct: 10 }, after: { pct: 120 } }), ["stash-usage-100"], "jumping past both fires only the 100% one");
  assert.deepEqual(k({ failures: 1 }), []); assert.deepEqual(k({ failures: 2 }), ["stash-usage-stale"]);
  assert.deepEqual(k({ scan: { orphan: 3, untracked: 2 }, prevScan: { orphan: 2, untracked: 2 } }), ["stash-loose-ends"]); assert.deepEqual(k({ scan: { orphan: 2, untracked: 2 }, prevScan: { orphan: 2, untracked: 2 } }), []);
  assert.deepEqual(k({ scan: { orphan: 5, untracked: 0 } }), [], "no previous scan to compare with"); assert.equal(L.monthKey(Date.UTC(2026, 9, 9)), "2026-10"); assert.equal(L.dayKey(Date.UTC(2026, 9, 9, 23)), "2026-10-09");
  // the allowlist
  const rule = { name: "  Old bug screenshots ", target: "bugScreenshots", statuses: ["fixed", "wont_fix", "cant_reproduce", "duplicate"], days: 60 };
  const v = T.validateRule(rule); assert.equal(v.ok, true); assert.equal(v.value.name, "Old bug screenshots"); assert.deepEqual(v.value.statuses, ["fixed", "wont_fix", "cant_reproduce", "duplicate"]);
  bad(T.validateRule({ ...rule, target: "vaultCovers" }), "notAllowed", "target"); bad(T.validateRule({ ...rule, target: "__proto__" }), "notAllowed", "target"); bad(T.validateRule({ ...rule, target: undefined }), "notAllowed", "target");
  bad(T.validateRule({ ...rule, statuses: ["open"] }), "notAllowed", "statuses"); bad(T.validateRule({ ...rule, statuses: [] }), "invalid", "statuses"); bad(T.validateRule({ ...rule, days: 13 }), "invalid", "days"); bad(T.validateRule({ ...rule, days: 731 }), "invalid", "days");
  bad(T.validateRule({ ...rule, days: 60.5 }), "invalid", "days"); bad(T.validateRule({ ...rule, name: "" }), "invalid", "name"); bad(T.validateRule(null), "invalid"); assert.equal(T.validateRule({ ...rule, days: 14 }).ok, true); assert.equal(T.validateRule({ ...rule, days: 730 }).ok, true);
  assert.equal(T.targetOf("constructor"), null, "only own keys");
  assert.equal(T.BUG_SCREENSHOTS.collection, "sites/boomertanger/bugs/main/reports"); assert.equal(T.BUG_SCREENSHOTS.screenshotField, "shotRef"); assert.equal(T.BUG_SCREENSHOTS.link("r1"), "/bug-zapper?report=r1"); assert.deepEqual(T.BUG_SCREENSHOTS.statuses, require("../lib/bugs/logic").CLOSED);
  assert.equal(T.isLegacyShaped({ collection: "x" }), true); assert.equal(T.isLegacyShaped(rule), false);
  const q = T.queryOf(rule); assert.equal(q.ok, true); assert.equal(q.value.collection, "sites/boomertanger/bugs/main/reports"); assert.equal(q.value.matchField, "closed"); assert.equal(q.value.matchValue, true); assert.equal(q.value.ageField, "closedAt"); assert.equal(q.value.days, 60);
  const lq = T.queryOf({ collection: "anything", matchField: "status", matchValue: "x", ageField: "at", ageThresholdDays: 30 }); assert.equal(lq.ok, true); assert.equal(lq.legacy, true); assert.equal(lq.value.statuses, null);
  assert.equal(T.queryOf({ collection: "x" }).ok, false, "an incomplete legacy rule");
  assert.equal(T.sentence(rule), "Purge the screenshot of any bug report that has been closed for 60 days."); assert.equal(T.sentence({ ...rule, statuses: ["fixed"] }), "Purge the screenshot of any bug report closed as Fixed for 60 days.");
  assert.equal(T.sentence({ ...rule, statuses: ["fixed", "duplicate"] }), "Purge the screenshot of any bug report closed as Fixed or Duplicate for 60 days."); assert.match(T.sentence({ collection: "x" }), /old Cloud Stash page/);
  // the upload gate
  const now = Date.UTC(2026, 9, 9, 12), fresh = { fetchedAt: now - 3600000 };
  assert.equal(G.refusalFor(null, {}, now), null, "no status doc: open"); assert.equal(G.refusalFor({ uploads: "stopped" }, {}, now), null, "no fetchedAt: open (fail open)");
  assert.equal(G.refusalFor({ ...fresh, uploads: "open" }, {}, now), null); assert.equal(G.refusalFor({ uploads: "stopped", fetchedAt: now - 49 * 3600000 }, {}, now), null, "stale: fail open");
  assert.equal(G.refusalFor({ ...fresh, uploads: "members-paused" }, { isStaff: false }, now), G.PAUSED_MESSAGE); assert.equal(G.refusalFor({ ...fresh, uploads: "members-paused" }, { isStaff: true }, now), null, "staff may still upload when paused");
  assert.equal(G.refusalFor({ ...fresh, uploads: "stopped" }, { isStaff: true, isAdmin: true }, now), G.PAUSED_MESSAGE, "stopped: admins too"); assert.equal(G.refusalFor({ ...fresh, uploads: "stopped" }, { isOwner: true }, now), null, "stopped: only the owner");
  assert.equal(G.PAUSED_MESSAGE, "Uploads are paused for a bit. Try again later, or send it without a picture.");
  assert.equal(G.refusalFor({ uploads: "members-paused", fetchedAt: { toMillis: () => now - 1000 } }, {}, now), G.PAUSED_MESSAGE, "a Firestore Timestamp works too");
})();

// ================================================================ part 2: the callables
const S = "sites/boomertanger";
const REPORTS = `${S}/bugs/main/reports`;
let clock = Date.UTC(2026, 9, 9, 15, 0);
const DAY = 86400000;
const alerts = [], deletedOrder = [], cloudDeleted = [];
let remote = {}, usageResponse = null, usageFails = false, failIds = new Set();
const fakeCloud = {
  PREVIEW_TTL_S: 600,
  usage: async () => { if (usageFails) throw new Error("usage down"); return usageResponse; },
  listResources: async (_f, _c, { type, max }) => { const out = Object.entries(remote).filter(([, f]) => f.type === type).map(([publicId, f]) => ({ publicId, type, bytes: f.bytes, createdAt: f.createdAt || 0, format: "png" })); const list = out.slice(0, max); list.truncated = out.length > max; return list; },
  resourceInfo: async (_f, _c, publicId) => { const f = remote[publicId]; return f ? { bytes: f.bytes, secure_url: `https://res.example/${publicId}.png`, format: "png" } : null; },
  previewUrl: (_c, publicId, format) => `https://dl.example/${publicId}.${format}?sig=1`,
};
const performAssetDeletion = async (assetId, _c, opts = {}) => {
  const ref = wdb.doc(`externalAssets/${assetId}`); const snap = await ref.get();
  if (!snap.exists) { const e = new Error("No externalAssets record with that id."); e.code = "not-found"; throw e; }
  const a = snap.data();
  if (failIds.has(assetId)) throw new Error("Cloudinary says no");
  deletedOrder.push({ assetId, actor: opts.logActor ? opts.logActor.name : null, rule: opts.cleanupRule ? opts.cleanupRule.id : null });
  delete remote[a.publicId]; cloudDeleted.push(a.publicId);
  if (a.linkedDoc) { const doc = await wdb.doc(`${a.linkedDoc.collection}/${a.linkedDoc.docId}`).get(); if (doc.exists && opts.clearLinkedField !== false) await doc.ref.update({ [a.linkedDoc.field]: realFs.FieldValue.delete() }); }
  await ref.delete(); return { ok: true };
};
const adminLogEntry = async (_d, f) => ({ ...f, createdAt: realFs.Timestamp.now() });
const crew = require("../lib/crew/store").makeStore({ db: wdb, adminLogEntry });
const stash = require("../lib/stash").build({ db: wdb, adminLogEntry, now: () => clock, cloud: fakeCloud, cloudCreds: () => ({ cloudName: "c", apiKey: "k", apiSecret: "s" }), cloudSecrets: [], performAssetDeletion, recordUntrackedAsset: require("../lib/externalAssets").recordUntrackedAsset, crewStore: crew, alert: async (kind, p) => { alerts.push({ kind, ...p }); }, fetch: async () => ({}) });
const fns = stash.functions;
const as = (uid, fn, data = {}, token = { email_verified: true }) => fns[fn].run({ auth: uid ? { uid, token } : undefined, data });
const why = async (p) => { try { await p; return "ok"; } catch (e) { return (e.details && e.details.reason) || e.code || e.message; } };
const get = async (p) => (await wdb.doc(p).get()).data();
const col = async (p) => (await wdb.collection(p).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const ts = (ms) => realFs.Timestamp.fromMillis(ms);
const logs = async (action) => (await col("adminLog")).filter((e) => e.feature === "cloudStash" && (!action || e.action === action));

(async () => {
  // ---------- the people ----------
  await wdb.doc(S).set({ ownerUid: "boss" });
  const person = async (uid, handle, roles = []) => { await wdb.doc(`${S}/members/${uid}`).set({ roles }); if (handle) await wdb.doc(`${S}/profiles/${uid}`).set({ handle, displayName: handle }); };
  await person("boss", "boomer", ["admin"]); await person("adm1", "steward", ["admin"]); await person("adm2", "overseer", ["admin"]); await person("adm3", "righthand", ["admin"]); await person("mod1", "modmoth", ["mod"]); await person("gbo", "gbo");
  const roster = (uid, grade) => wdb.doc(`${S}/crew/main/roster/${uid}`).set({ track: "admin", grade, status: "active", handle: null });
  await roster("adm1", 1); await roster("adm2", 2); await roster("adm3", 3);

  // ================================================================ who may call
  for (const fn of ["stashUsageRefresh", "stashScan", "stashPurge", "stashSweepNow", "stashSettings", "stashRuleSave", "stashRuleDryRun", "stashPreview", "stashPurgeUntracked"]) {
    assert.equal(await why(as(null, fn, {})), "signedOut", fn + " needs a signed-in caller");
    assert.equal(await why(as("gbo", fn, {})), "notAdmin", fn + ": members are refused");
    assert.equal(await why(as("mod1", fn, {})), "notAdmin", fn + ": mods are refused");
  }

  // ================================================================ usage and status
  usageResponse = { plan: "Free", credits: { usage: 5, limit: 25, used_percent: 20 }, storage: { usage: 100, credits_usage: 1 }, bandwidth: { usage: 50, credits_usage: 2 }, transformations: { usage: 7, credits_usage: 2 } };
  const r1 = await as("adm1", "stashUsageRefresh");
  assert.equal(r1.ok, true); let cu = await get("storageUsage/cloudinary");
  assert.equal(cu.status, "healthy"); assert.equal(cu.uploads, "open"); assert.equal(cu.credits.limit, 25, "the plan limit comes from Cloudinary"); assert.equal(cu.credits.pct, 20); assert.equal(cu.failures, 0); assert.ok(cu.fetchedAt);
  assert.equal(await why(as("adm1", "stashUsageRefresh")), "tooSoon", "once per 10 minutes"); assert.equal(await why(as("boss", "stashUsageRefresh")), "tooSoon", "per site, not per person");
  clock += 11 * 60000; usageResponse.credits.used_percent = 85; await as("adm2", "stashUsageRefresh");
  cu = await get("storageUsage/cloudinary"); assert.equal(cu.status, "paused"); assert.equal(cu.uploads, "members-paused");
  assert.deepEqual(alerts.map((a) => a.kind), ["stash-usage-80"], "crossing the pause point raises one alert");
  clock += 11 * 60000; usageResponse.credits.used_percent = 100.5; await as("boss", "stashUsageRefresh");
  cu = await get("storageUsage/cloudinary"); assert.equal(cu.status, "over"); assert.equal(cu.uploads, "stopped"); assert.equal(alerts.at(-1).kind, "stash-usage-100");
  clock += 11 * 60000; usageFails = true; assert.equal(await why(as("adm1", "stashUsageRefresh")), "usageDown");
  cu = await get("storageUsage/cloudinary"); assert.equal(cu.failures, 1); assert.equal(cu.status, "over", "the last numbers stay when a fetch fails"); assert.ok(!alerts.some((a) => a.kind === "stash-usage-stale"));
  clock += 11 * 60000; assert.equal(await why(as("adm1", "stashUsageRefresh")), "usageDown"); cu = await get("storageUsage/cloudinary"); assert.equal(cu.failures, 2); assert.equal(alerts.at(-1).kind, "stash-usage-stale", "two failed fetches running");
  usageFails = false; clock += 11 * 60000; usageResponse.credits.used_percent = 30; await as("adm1", "stashUsageRefresh"); cu = await get("storageUsage/cloudinary"); assert.equal(cu.failures, 0); assert.equal(cu.status, "healthy"); assert.equal(cu.uploads, "open");
  // the scheduled path swallows a failure instead of throwing (it counts it)
  usageFails = true; assert.equal(await stash.ops.refreshUsage(), null); usageFails = false; await stash.ops.refreshUsage(); assert.equal((await get("storageUsage/cloudinary")).failures, 0);
  assert.equal((await logs()).length, 0, "reads are not logged");

  // ================================================================ data for the files, scan and sweep
  const rec = async (id, o) => wdb.doc(`externalAssets/${id}`).set({ url: `https://res.example/${o.publicId}.png`, resourceType: "image", feature: "bugZapper", sizeBytes: 1000, deliveryType: "authenticated", createdAt: ts(clock - 100 * DAY), ...o });
  const report = (id, o = {}) => wdb.doc(`${REPORTS}/${id}`).set({ title: `Report ${id}`, status: "fixed", closed: true, closedAt: ts(clock - 70 * DAY), by: { uid: "gbo", handle: "gbo" }, shotRef: `bug-zapper/${id}/shot`, ...o });
  const linkedRec = (id, repId, o = {}) => rec(id, { publicId: `bug-zapper/${repId}/shot`, linkedDoc: { collection: REPORTS, docId: repId, field: "shotRef" }, ...o });
  // r-old1/r-old2: closed 70 days ago, due at 60; r-new: closed 10 days ago; r-open: not closed; r-wont: won't fix 90 days ago; r-dupe: duplicate 80 days ago
  await report("r-old1"); await report("r-old2", { status: "wont_fix", closedAt: ts(clock - 90 * DAY) }); await report("r-new", { closedAt: ts(clock - 10 * DAY) }); await report("r-open", { status: "open", closed: false, closedAt: undefined });
  await report("r-dupe", { status: "duplicate", closedAt: ts(clock - 80 * DAY) });
  for (const id of ["r-old1", "r-old2", "r-new", "r-open", "r-dupe"]) { await linkedRec(`a-${id}`, id); remote[`bug-zapper/${id}/shot`] = { type: "authenticated", bytes: 1000, createdAt: clock - 100 * DAY }; }
  await rec("a-vault", { feature: "gameVault", publicId: "game-vault/covers/c1", deliveryType: undefined, sizeBytes: 5000, linkedDoc: { collection: `${S}/vaultGames`, docId: "g1", field: "cover.url" } });
  await wdb.doc(`${S}/vaultGames/g1`).set({ title: "Game", cover: { source: "upload", url: "https://res.example/game-vault/covers/c1.png", publicId: "game-vault/covers/c1" } }); remote["game-vault/covers/c1"] = { type: "upload", bytes: 5000 };
  // problems a scan should find: an orphan (its report is gone), a stale record (the report points elsewhere), an unrecorded shot, untracked files in Cloudinary
  await linkedRec("a-orphan", "r-gone"); remote["bug-zapper/r-gone/shot"] = { type: "authenticated", bytes: 700 };
  await report("r-stale", { shotRef: "bug-zapper/r-other/shot", closedAt: ts(clock - 5 * DAY) }); await linkedRec("a-stale", "r-stale"); remote["bug-zapper/r-stale/shot"] = { type: "authenticated", bytes: 400 };
  await report("r-unrec", { closedAt: ts(clock - 5 * DAY), shotRef: "bug-zapper/r-unrec/shot" });   // a screenshot ref with no asset record
  remote["legacy/preset/one"] = { type: "upload", bytes: 2222 }; remote["legacy/preset/two"] = { type: "upload", bytes: 3333 };
  await wdb.doc("storageUsage/current").set({ totalBytes: 1, byFeature: {} });   // drifted on purpose

  // ================================================================ files: preview and the scan
  assert.equal(await why(as("adm1", "stashPreview", {})), "args"); assert.equal(await why(as("adm1", "stashPreview", { assetId: "nope" })), "noAsset");
  assert.equal(await why(as("adm1", "stashPreview", { assetId: "a-vault" })), "notPrivate", "only private files get a signed preview");
  const pv = await as("adm1", "stashPreview", { assetId: "a-r-old1" }); assert.match(pv.url, /bug-zapper\/r-old1\/shot\.png/); assert.equal(pv.expiresInS, 600);
  assert.equal((await logs("preview")).length, 1, "a private preview is logged"); assert.equal((await logs("preview"))[0].actorName, "@steward");
  await wdb.doc("cleanupRules/rule-on").set({ name: "Old bug screenshots", target: "bugScreenshots", statuses: T.BUG_SCREENSHOTS.statuses, days: 60, enabled: true, ...{ feature: "bugZapper", collection: REPORTS, matchField: "closed", matchValue: true, ageField: "closedAt", ageThresholdDays: 60 } });
  const sc = await as("adm1", "stashScan");   // a Steward may scan
  assert.deepEqual(sc.counts, { orphan: 1, stale: 1, unrecorded: 2, untracked: 2 }, JSON.stringify(sc.counts));
  assert.equal((await get("externalAssets/a-orphan")).scan.state, "orphan"); assert.equal((await get("externalAssets/a-stale")).scan.state, "stale"); assert.equal((await get("externalAssets/a-r-old1")).scan.state, "linked");
  assert.equal((await get("externalAssets/a-r-old1")).scan.due, "rule-on", "due for the sweep"); assert.equal((await get("externalAssets/a-r-new")).scan.due, undefined); assert.equal((await get("externalAssets/a-r-old2")).scan.due, "rule-on");
  const sd = await get("storageUsage/scan"); assert.equal(sd.by, "@steward"); assert.deepEqual(sd.untracked.map((x) => x.publicId).sort(), ["legacy/preset/one", "legacy/preset/two"]); assert.deepEqual(sd.unrecorded.map((x) => x.publicId).sort(), ["bug-zapper/r-other/shot", "bug-zapper/r-unrec/shot"], "a screenshot ref with no record (r-stale also points at one)"); assert.equal(sd.truncated, false);
  const cur = await get("storageUsage/current"); assert.equal(cur.byFeature.bugZapper.files, 7, "the recount fixes drift: the records are the truth"); assert.equal(cur.byFeature.gameVault.bytes, 5000); assert.ok(cur.recountedAt);
  assert.equal(cur.totalBytes, (await col("externalAssets")).reduce((n, a) => n + a.sizeBytes, 0));
  assert.equal(await why(as("adm2", "stashScan")), "tooSoon", "once per 10 minutes"); assert.equal((await logs()).filter((e) => e.action !== "preview").length, 0, "a scan is read-only and not logged");
  clock += 11 * 60000;
  // more than 200 untracked files: the list is capped and says so
  for (let i = 0; i < 205; i++) remote[`legacy/bulk/${i}`] = { type: "upload", bytes: 1 };
  const big = await as("adm2", "stashScan"); assert.equal(big.counts.untracked, 207); assert.equal(big.truncated, true); assert.equal((await get("storageUsage/scan")).untracked.length, 200);
  assert.ok(alerts.some((a) => a.kind === "stash-loose-ends"), "more loose ends than last time raises the weekly alert");
  for (let i = 0; i < 205; i++) delete remote[`legacy/bulk/${i}`];
  clock += 11 * 60000; await as("adm2", "stashScan");

  // ================================================================ rules: dry run and save
  const goodRule = { name: "Old bug screenshots", target: "bugScreenshots", statuses: T.BUG_SCREENSHOTS.statuses, days: 60 };
  let dr = await as("adm1", "stashRuleDryRun", { rule: goodRule });   // a Steward may dry-run
  assert.equal(dr.count, 3, "r-old1, r-old2 and r-dupe have recorded screenshots; r-open isn't closed, r-new is too recent"); assert.equal(dr.bytes, 3000); assert.equal(dr.examples.length, 3); assert.equal(dr.examples[0].link.startsWith("/bug-zapper?report="), true);
  dr = await as("adm1", "stashRuleDryRun", { rule: { ...goodRule, statuses: ["wont_fix"] } }); assert.equal(dr.count, 1); dr = await as("adm1", "stashRuleDryRun", { rule: { ...goodRule, days: 5 } }).catch((e) => e); assert.equal(dr.details.reason, "invalid");
  assert.equal(await why(as("adm1", "stashRuleDryRun", { rule: { ...goodRule, target: "vaultCovers" } })), "notAllowed"); assert.equal(await why(as("adm1", "stashRuleDryRun", { rule: { ...goodRule, statuses: ["open"] } })), "notAllowed");
  assert.equal((await as("adm1", "stashRuleDryRun", { rule: { ...goodRule, days: 14 } })).count, 3, "14 days: still the same three (r-new closed 10 days ago, r-stale 5)"); assert.equal((await logs()).filter((e) => /rule/.test(e.action)).length, 0, "a dry run isn't logged");
  const sv = (uid, data) => as(uid, "stashRuleSave", data);
  assert.equal(await why(sv("adm1", { op: "create", rule: goodRule })), "needsOverseer", "an A1 Steward can't create"); assert.equal(await why(sv("adm1", { op: "update", id: "rule-on", rule: goodRule, updatedAtMs: 0 })), "needsOverseer");
  assert.equal(await why(sv("adm1", { op: "delete", id: "rule-on" })), "needsOverseer"); assert.equal(await why(sv("adm1", { op: "toggle", id: "rule-on", enabled: true, expectCount: 3 })), "needsOverseer", "a Steward can't switch ON");
  assert.equal(await why(sv("adm2", { op: "wat" })), "args"); assert.equal(await why(sv("adm2", { op: "create", rule: { ...goodRule, target: "vaultCovers" } })), "notAllowed");
  const c1 = await sv("adm2", { op: "create", rule: { ...goodRule, name: "Second rule", days: 75 } });   // created OFF
  const made = await get(`cleanupRules/${c1.id}`); assert.equal(made.enabled, false); assert.equal(made.target, "bugScreenshots"); assert.equal(made.days, 75); assert.equal(made.ageThresholdDays, 75, "legacy-compatible fields are kept"); assert.equal(made.collection, REPORTS); assert.deepEqual(made.createdBy, { uid: "adm2", name: "@overseer" }); assert.ok(made.updatedAt);
  assert.equal(c1.count, 3 - 1 + 0, "closed 75 days or longer: r-old2 (90) and r-dupe (80)");
  assert.equal(await why(sv("adm3", { op: "toggle", id: c1.id, enabled: true, expectCount: 99 })), "numbersChanged", "switching on re-counts and refuses if the numbers moved");
  assert.equal(await why(sv("adm3", { op: "toggle", id: c1.id, enabled: true })), "numbersChanged", "no expectCount at all"); assert.equal((await sv("adm3", { op: "toggle", id: c1.id, enabled: true, expectCount: 2 })).enabled, true);
  assert.equal((await get(`cleanupRules/${c1.id}`)).enabled, true); assert.equal((await sv("adm1", { op: "toggle", id: c1.id, enabled: false })).enabled, false, "an A1 Steward may switch a rule OFF"); assert.equal((await get(`cleanupRules/${c1.id}`)).enabled, false);
  const nc = await sv("boss", { op: "create", rule: { ...goodRule, name: "Third", days: 365, statuses: ["fixed"] }, expectCount: 0 }); assert.equal(nc.count, 0, "an expected count is checked even when off");
  assert.equal(await why(sv("boss", { op: "create", rule: { ...goodRule, name: "Fourth", days: 365 }, expectCount: 5 })), "numbersChanged");
  // update with a conflict check
  const cur1 = await get(`cleanupRules/${c1.id}`); const t0 = cur1.updatedAt.toMillis();
  assert.equal(await why(sv("adm2", { op: "update", id: c1.id, rule: { ...goodRule, name: "Second rule", days: 90 }, updatedAtMs: t0 - 1 })), "conflict", "two admins edit the same rule");
  assert.equal((await sv("adm2", { op: "update", id: c1.id, rule: { ...goodRule, name: "Second rule", days: 90 }, updatedAtMs: t0 })).ok, true); assert.equal((await get(`cleanupRules/${c1.id}`)).days, 90);
  assert.equal(await why(sv("adm2", { op: "update", id: "nope", rule: goodRule, updatedAtMs: 0 })), "noRule");
  // a rule from the old page: shown read-only, only ever switched OFF
  await wdb.doc("cleanupRules/legacy1").set({ feature: "bugZapper", collection: "bugReports", matchField: "status", matchValue: "Closed", ageField: "updatedAt", ageThresholdDays: 30, enabled: false, createdAt: ts(clock - DAY) });
  assert.equal(await why(sv("adm2", { op: "toggle", id: "legacy1", enabled: true, expectCount: 0 })), "legacy"); assert.equal(await why(sv("adm2", { op: "update", id: "legacy1", rule: goodRule, updatedAtMs: 0 })), "legacy");
  assert.equal((await sv("adm1", { op: "toggle", id: "legacy1", enabled: false })).ok, true);
  assert.equal((await sv("adm2", { op: "delete", id: "legacy1" })).ok, true); assert.equal(await get("cleanupRules/legacy1"), undefined); assert.equal((await sv("adm3", { op: "delete", id: nc.id })).ok, true);
  const rl = await logs(); const acts = rl.map((e) => e.action);
  for (const a of ["rule-save", "rule-toggle", "rule-delete"]) assert.ok(acts.includes(a), a + " is logged"); assert.ok(rl.every((e) => e.expireAt || e.createdAt), "entries carry their timestamps");
  assert.deepEqual((await logs("rule-toggle")).map((e) => e.changes.enabled.after).sort(), [false, false, true], "on, off, and the legacy rule off");

  // ================================================================ purge
  assert.equal(await why(as("adm1", "stashPurge", { assetIds: ["a-r-new"] })), "needsOverseer", "an A1 Steward can't purge");
  assert.equal(await why(as("adm2", "stashPurge", { assetIds: [] })), "args"); assert.equal(await why(as("adm2", "stashPurge", { assetIds: Array.from({ length: 51 }, (_, i) => `x${i}`) })), "args", "at most 50 at a time"); assert.equal(await why(as("adm2", "stashPurge", { assetIds: ["a/b"] })), "args");
  failIds = new Set(["a-stale"]);
  const pr = await as("adm2", "stashPurge", { assetIds: ["a-orphan", "a-stale", "a-gone-already", "a-orphan"] });
  assert.deepEqual(pr.results.map((r) => [r.assetId, r.ok, !!r.already]), [["a-orphan", true, false], ["a-stale", false, false], ["a-gone-already", true, true]], "one result per file; a file that's gone counts as success; one failure doesn't stop the rest");
  assert.match(pr.results[1].error, /Cloudinary says no/); assert.equal(pr.purged, 1); assert.equal(pr.bytes, 1000); assert.equal(await get("externalAssets/a-orphan"), undefined); assert.ok(await get("externalAssets/a-stale"), "the failed one is untouched");
  assert.equal(deletedOrder.at(-1).actor, "@overseer", "the admin is the actor in the delete's log"); failIds = new Set();
  assert.equal((await as("adm3", "stashPurge", { assetIds: ["a-stale"] })).purged, 1, "A3 Right Hand may purge");

  // ================================================================ untracked files (owner only)
  assert.equal(await why(as("adm2", "stashPurgeUntracked", { publicId: "legacy/preset/one", type: "upload" })), "ownerOnly", "an Overseer can't purge untracked files"); assert.equal(await why(as("adm1", "stashPurgeUntracked", { publicId: "x", type: "upload" })), "ownerOnly");
  assert.equal(await why(as("boss", "stashPurgeUntracked", { publicId: "x", type: "raw" })), "args"); assert.equal(await why(as("boss", "stashPurgeUntracked", { publicId: "bug-zapper/r-old1/shot", type: "authenticated" })), "tracked", "a recorded file goes through the Files tab");
  const un = await as("boss", "stashPurgeUntracked", { publicId: "legacy/preset/one", type: "upload" });
  assert.equal(un.ok, true); assert.equal(un.bytes, 2222); assert.ok(!remote["legacy/preset/one"], "gone from Cloudinary"); assert.equal((await col("externalAssets")).filter((a) => a.publicId === "legacy/preset/one").length, 0, "the temporary record is gone with the file");
  assert.equal(deletedOrder.at(-1).rule, null); assert.ok((await logs("purge-untracked")).length === 1 && (await logs("purge-untracked"))[0].details.publicId === "legacy/preset/one");
  assert.deepEqual((await get("storageUsage/scan")).untracked.map((x) => x.publicId), ["legacy/preset/two"], "it leaves the scan's list at once"); assert.equal((await get("storageUsage/scan")).counts.untracked, 1);
  assert.equal((await as("boss", "stashPurgeUntracked", { publicId: "legacy/never", type: "upload" })).already, true, "Cloudinary already lost it: success");

  // ================================================================ the sweep
  assert.equal(await why(as("adm1", "stashSweepNow")), "needsOverseer");
  await wdb.doc("cleanupRules/rule-on").set({ enabled: true }, { merge: true });
  // a rule on the allowlist can only purge its own feature's files: give a closed report a vault-feature record too
  await rec("a-wrong-feature", { feature: "gameVault", publicId: "game-vault/covers/other", sizeBytes: 9, linkedDoc: { collection: REPORTS, docId: "r-old1", field: "shotRef" } }); remote["game-vault/covers/other"] = { type: "upload", bytes: 9 };
  alerts.length = 0; deletedOrder.length = 0;
  const sw = (await as("adm2", "stashSweepNow")).sweep;
  assert.equal(sw.status, "ok"); assert.equal(sw.purged, 3); assert.equal(sw.bytes, 3000); assert.deepEqual(deletedOrder.map((d) => d.assetId).sort(), ["a-r-dupe", "a-r-old1", "a-r-old2"]);
  assert.ok(deletedOrder.every((d) => d.actor === "@overseer" && d.rule === "rule-on"), "each purge carries the admin and the rule"); assert.ok(await get("externalAssets/a-wrong-feature"), "another feature's file on the same report is never touched");
  assert.ok(await get("externalAssets/a-r-new") && await get("externalAssets/a-r-open"), "too recent and not closed are left alone"); assert.equal((await get(`${REPORTS}/r-old1`)).shotRef, undefined, "the report's field is cleared by the one delete path");
  const sd2 = await get("storageUsage/sweep"); assert.equal(sd2.status, "ok"); assert.equal(sd2.purged, 3); assert.deepEqual(sd2.perRule["rule-on"], { purged: 3, bytes: 3000, failed: 0 }); assert.equal(sd2.trigger, "manual");
  assert.equal((await get("cleanupRules/rule-on")).lastRun.purged, 3); assert.equal((await logs("sweep-run")).at(-1).details.purged, 3); assert.deepEqual(alerts, [], "a clean run raises nothing");
  // the per-run cap and failures
  await wdb.doc("adminSettings/storage").set({ runCap: 10 });
  for (let i = 0; i < 14; i++) { await report(`c${i}`, { closedAt: ts(clock - 100 * DAY) }); await linkedRec(`a-c${i}`, `c${i}`); }
  deletedOrder.length = 0; alerts.length = 0;
  const cap = (await as("adm2", "stashSweepNow")).sweep; assert.equal(cap.status, "capped"); assert.equal(cap.purged, 10, "stops at the per-run cap"); assert.deepEqual(alerts.map((a) => a.kind), ["stash-sweep-capped"]);
  failIds = new Set(["a-c10", "a-c11", "a-c12", "a-c13"]); alerts.length = 0;
  const part = (await as("adm2", "stashSweepNow")).sweep; assert.equal(part.status, "failed", "every purge it tried failed"); assert.equal(part.purged, 0); assert.ok(alerts.some((x) => x.kind === "stash-sweep-failed"));
  failIds = new Set(["a-c10"]); await wdb.doc("adminSettings/storage").set({ runCap: 100 }); alerts.length = 0;
  const part2 = (await as("adm2", "stashSweepNow")).sweep; assert.equal(part2.status, "partial"); assert.equal(part2.failures.length, 1); assert.equal(part2.failures[0].assetId, "a-c10"); assert.ok(alerts.some((a) => a.kind === "stash-sweep-failed"), "failures become alerts, not silence"); failIds = new Set();
  // a rule that can't run (bad shape) is a failure of that rule only
  await wdb.doc("cleanupRules/broken").set({ name: "x", target: "vaultCovers", statuses: ["fixed"], days: 60, enabled: true });
  alerts.length = 0; const brk = (await as("adm2", "stashSweepNow")).sweep; assert.equal(brk.status, "partial"); assert.equal(brk.perRule.broken.failed, 1, "the bad rule is reported"); assert.ok(brk.failures.some((f) => f.ruleId === "broken")); await wdb.doc("cleanupRules/broken").delete();
  // the scheduled run is the same code with Automatic as the actor; legacy-shaped rules keep running until launch
  await wdb.doc("cleanupRules/rule-on").set({ enabled: false }, { merge: true });
  await wdb.doc("bugReportsLegacy/x").set({ status: "Closed", updatedAt: ts(clock - 40 * DAY) });
  await rec("a-legacy", { feature: "bugZapper", publicId: "legacy/bug/shot", linkedDoc: { collection: "bugReportsLegacy", docId: "x", field: "screenshotUrl" } }); remote["legacy/bug/shot"] = { type: "upload", bytes: 1000 };
  await wdb.doc("cleanupRules/legacy2").set({ feature: "bugZapper", collection: "bugReportsLegacy", matchField: "status", matchValue: "Closed", ageField: "updatedAt", ageThresholdDays: 30, enabled: true }); deletedOrder.length = 0;
  const auto = await stash.runSweep({ trigger: "schedule" }); assert.equal(auto.status, "ok"); assert.equal(auto.purged, 1); assert.equal(deletedOrder[0].actor, "Automatic", "the schedule's actor is Automatic"); assert.equal(auto.trigger, "schedule");
  assert.equal((await logs("sweep-run")).at(-1).actorName, "Automatic");
  // an empty sweep is ok
  assert.equal((await stash.runSweep({})).status, "ok");

  // ================================================================ settings
  assert.equal(await why(as("adm1", "stashSettings", { pauseAtPct: 70 })), "needsOverseer"); assert.equal(await why(as("adm2", "stashSettings", { pauseAtPct: 50 })), "invalid"); assert.equal(await why(as("adm2", "stashSettings", {})), "nothing");
  assert.equal(await why(as("adm2", "stashSettings", { retentionDays: 365 })), "ownerOnly", "log retention is owner only"); assert.equal(await why(as("adm3", "stashSettings", { retentionDays: 365 })), "ownerOnly");
  await wdb.doc("storageUsage/cloudinary").set({ credits: { used: 17, limit: 25, pct: 68 }, status: "healthy", uploads: "open", fetchedAt: ts(clock), failures: 0 });
  let st2 = await as("adm2", "stashSettings", { pauseAtPct: 60 }); assert.equal(st2.settings.pauseAtPct, 60);
  cu = await get("storageUsage/cloudinary"); assert.equal(cu.status, "paused", "a lower pause point takes effect at once"); assert.equal(cu.uploads, "members-paused");
  await as("adm2", "stashSettings", { pauseAtPct: 80 }); cu = await get("storageUsage/cloudinary"); assert.equal(cu.status, "healthy"); assert.equal(cu.uploads, "open");
  await as("adm3", "stashSettings", { manualPause: true, reason: "Big launch week" }); cu = await get("storageUsage/cloudinary"); assert.equal(cu.status, "paused"); assert.equal(cu.uploads, "members-paused"); assert.equal((await get("adminSettings/storage")).manualPauseReason, "Big launch week");
  await as("adm3", "stashSettings", { manualPause: false }); assert.equal((await get("storageUsage/cloudinary")).uploads, "open"); assert.equal((await get("adminSettings/storage")).manualPauseReason, "");
  await wdb.doc("adminSettings/log").set({ retentionDays: 365 }); await as("boss", "stashSettings", { retentionDays: 180 }); assert.equal((await get("adminSettings/log")).retentionDays, 180);
  const la = (await logs()).map((e) => e.action); for (const a of ["limits", "pause", "retention"]) assert.ok(la.includes(a), a + " is logged"); assert.deepEqual((await logs("retention"))[0].changes.retentionDays, { before: 365, after: 180 });
  assert.equal((await logs("limits")).length, 2); assert.equal((await logs("pause")).length, 2);

  // ================================================================ alerts: admin-health items through notifyOutbox, once per kind per day
  const A = require("../lib/stash/alerts");
  const al = A.makeAlerts({ db: wdb, now: () => clock, adminLogEntry });
  const outboxDocs = async () => (await col(`${S}/notifyOutbox`)).filter((o) => o.type === "admin-health");
  const o0 = (await outboxDocs()).length;
  for (const kind of ["stash-sweep-failed", "stash-sweep-capped", "stash-usage-80", "stash-usage-100", "stash-usage-stale", "stash-loose-ends"]) assert.equal(await al.raise(kind, { failures: 2, purged: 100, pct: 84.2, orphan: 3, untracked: 4 }), true, kind + " is sent");
  const sent = (await outboxDocs()).slice(o0);
  assert.equal(sent.length, 6); assert.ok(sent.every((o) => o.audience === "admins" && o.status === "pending" && o.expireAt && o.payload.link === "/admin/stash" && o.payload.feature === "cloudStash"), "each is an admin-health item for the admins");
  assert.deepEqual(sent.map((o) => o.payload.kind).sort(), ["stash-loose-ends", "stash-sweep-capped", "stash-sweep-failed", "stash-usage-100", "stash-usage-80", "stash-usage-stale"]);
  assert.equal(await al.raise("stash-sweep-failed", { failures: 5 }), false, "at most one per kind per day"); assert.equal((await outboxDocs()).length, o0 + 6);
  assert.equal(await al.raise("stash-nonsense"), false);
  clock += DAY; assert.equal(await al.raise("stash-sweep-failed", { failures: 1 }), true, "the next day it can fire again"); assert.equal(await al.raise("stash-usage-80", { pct: 85 }), false, "the usage alerts are once per month");
  clock += 31 * DAY; assert.equal(await al.raise("stash-usage-80", { pct: 85 }), true, "and again in a new month");
  const hist = (await get("storageUsage/alerts")).items; assert.equal(hist[0].kind, "stash-usage-80"); assert.ok(hist[0].at && hist[0].title && hist[0].body, "the page's alert history is kept, newest first");
  for (let i = 0; i < 40; i++) { clock += DAY; await al.raise("stash-sweep-capped", { purged: i }); }
  assert.equal((await get("storageUsage/alerts")).items.length, 30, "the history keeps the newest 30");
  assert.match(A.messageFor("stash-usage-80", { pct: 84.2 }).body, /84\.2%/); assert.equal(A.messageFor("stash-usage-100", {}).severity, "critical");
  assert.equal(A.idFor("stash-sweep-failed", Date.UTC(2026, 9, 9)), "stash-sweep-failed-2026-10-09"); assert.equal(A.idFor("stash-usage-80", Date.UTC(2026, 9, 9)), "stash-usage-80-2026-10");

  // ================================================================ rules, indexes, performAssetDeletion and the nothing-in-the-feed promise (text checks: no emulator here)
  const root = path.join(__dirname, "..");
  const idx = fs.readFileSync(path.join(root, "index.js"), "utf8");
  assert.ok(!/type:\s*"asset_purged"/.test(idx), "performAssetDeletion no longer writes asset_purged to activityLog");
  assert.ok(idx.includes('linkedSnap.get("title") || linkedSnap.get("name")'), "the adminLog title is title || name");
  const pa = idx.slice(idx.indexOf("async function performAssetDeletion"), idx.indexOf("// Callable from the Cloud Stash admin UI"));
  assert.ok(pa.indexOf("await cloudinaryDelete") < pa.indexOf("batch.commit"), "the delete order is unchanged: Cloudinary first, then the linked field, the record and usage, then the log");
  for (const f of ["lib/stash/index.js", "lib/stash/sweep.js", "lib/stash/gate.js", "lib/stash/targets.js", "lib/stash/logic.js"]) assert.ok(!/activityLog/.test(fs.readFileSync(path.join(root, f), "utf8").replace(/\/\/.*$/gm, "")), f + " writes nothing to activityLog");
  assert.ok(!/cloudinaryDelete\(/.test(fs.readFileSync(path.join(root, "lib/stash/index.js"), "utf8").replace(/\/\/.*$/gm, "")), "the stash module never calls the raw delete: only performAssetDeletion does");
  assert.ok(!/cloudinaryDelete\(/.test(fs.readFileSync(path.join(root, "lib/stash/sweep.js"), "utf8").replace(/\/\/.*$/gm, "")));
  assert.equal(typeof require("../lib/cloudinary").cloudinaryDelete, "function"); assert.equal(typeof require("../lib/cloudinary").usage, "function"); assert.equal(typeof require("../lib/cloudinary").listResources, "function"); assert.equal(typeof require("../lib/externalAssets").recordUntrackedAsset, "function");
  const vc = require("../lib/vault/cloudinary"); assert.equal(vc.signParams, require("../lib/cloudinary").signParams, "the Vault re-exports the shared helpers, no copies");

  // ================================================================ rules and indexes (text checks: no emulator here)
  const rules = fs.readFileSync(path.join(root, "..", "firestore.rules"), "utf8").replace(/\r\n/g, "\n");
  const NEWREAD = "allow read: if isAdmin() || isSiteOwner('boomertanger') || hasSiteRole('boomertanger', 'admin');";
  const block = (name) => { const i = rules.indexOf("match /" + name + " {"); assert.ok(i > 0, name); return rules.slice(i, rules.indexOf("\n    }\n", i)); };
  for (const m of ["adminLog/{entryId}", "adminSettings/{docId}", "externalAssets/{assetId}", "storageUsage/{docId}", "cleanupRules/{ruleId}"]) assert.ok(block(m).includes(NEWREAD), m + " is readable by the legacy allowlist, the owner and new-site admins");
  for (const m of ["adminLog/{entryId}", "adminSettings/{docId}", "externalAssets/{assetId}", "storageUsage/{docId}"]) assert.ok(/allow write: if false;/.test(block(m)), m + ": no client writes");
  assert.ok(/allow create, update: if isAdmin\(\)/.test(block("cleanupRules/{ruleId}")) && /allow delete: if isAdmin\(\);/.test(block("cleanupRules/{ruleId}")), "the legacy cleanupRules writes stay until launch");
  assert.ok(!/legacy.*removed/i.test(block("externalAssets/{assetId}")), "nothing in the legacy rules was removed");
  const idxJson = JSON.parse(fs.readFileSync(path.join(root, "..", "firestore.indexes.json"), "utf8"));
  const has = (group, fields) => idxJson.indexes.some((i) => i.collectionGroup === group && i.queryScope === "COLLECTION" && JSON.stringify(i.fields.map((x) => [x.fieldPath, x.order])) === JSON.stringify(fields));
  assert.ok(has("adminLog", [["feature", "ASCENDING"], ["createdAt", "DESCENDING"]]), "adminLog by feature, newest first (the Activity tab)");
  assert.ok(has("adminLog", [["itemPath", "ASCENDING"], ["createdAt", "DESCENDING"]]), "the existing adminLog index is still there");
  const ti = T.BUG_SCREENSHOTS.index; assert.ok(has(ti.collectionGroup, ti.fields), "each allowlisted target's composite index ships (reports: closed, closedAt)");
  assert.ok(idxJson.indexes.every((i, n) => idxJson.indexes.findIndex((j) => JSON.stringify(j) === JSON.stringify(i)) === n), "no duplicate index entries");

  // ---- the seed script (functions/scripts/seed-cloud-stash.js): adds only what is missing, never touches what exists ----
  const seed = require("./seed-cloud-stash");
  assert.deepStrictEqual(seed.settingsToAdd(undefined), { pauseAtPct: 80, manualPause: false, manualPauseReason: "", runCap: 100 }, "a missing settings doc gets every default");
  assert.deepStrictEqual(seed.settingsToAdd({ pauseAtPct: 70, runCap: 50 }), { manualPause: false, manualPauseReason: "" }, "stored limits are never overwritten");
  assert.deepStrictEqual(seed.settingsToAdd({ pauseAtPct: 80, manualPause: true, manualPauseReason: "x", runCap: 100 }), {}, "a complete settings doc adds nothing");
  const newRule = seed.ruleToAdd([{ id: "bugZapperScreenshots", enabled: true, ageThresholdDays: 60 }]);
  assert.ok(newRule && newRule.enabled === false && newRule.name === "Old bug screenshots" && newRule.days === 60 && newRule.target === "bugScreenshots", "the seeded rule is disabled and 60 days");
  assert.deepStrictEqual(newRule.statuses, T.BUG_SCREENSHOTS.statuses, "it covers every closed status");
  assert.ok(T.queryOf(newRule).ok && !T.isLegacyShaped(newRule), "the sweep accepts the seeded rule");
  assert.strictEqual(seed.ruleToAdd([{ id: "x", target: "bugScreenshots" }]), null, "no second rule when one for the target exists");
  assert.throws(() => seed.parseArgs(["--project", "production"]), /staging only/, "the seed refuses any project but staging");

  console.log("check-stash: ok");
})().catch((e) => { console.error(e); process.exit(1); });
