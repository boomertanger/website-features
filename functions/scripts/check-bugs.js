#!/usr/bin/env node
// functions/scripts/check-bugs.js: Bug Zapper (lib/bugs/*, docs/specs/bug-zapper.md §2-4, §9). Part 1 proves the pure rules (field limits, the triage plan and its history
// rules, which statuses count as confirmed, "bit me too" and thread refusals, the screenshot checks). Part 2 runs every callable against the in-memory Firestore with
// fakes for Night Shift, the Trophy Room, Cloudinary and the asset paths (and the REAL Gears for the triage reward). No network, no credentials, no deploy.   npm run check
const assert = require("assert/strict");
const { makeDb } = require("./fixtures/fake-firestore");
const admin = require("firebase-admin");
process.env.GCLOUD_PROJECT ||= "boomertanger-staging";
process.env.FIREBASE_CONFIG ||= JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const wdb = makeDb(); const realFs = admin.firestore;
const fakeFs = () => wdb; fakeFs.Timestamp = realFs.Timestamp; fakeFs.FieldValue = realFs.FieldValue;
Object.defineProperty(admin, "firestore", { value: fakeFs, configurable: true, writable: true });

const L = require("../lib/bugs/logic");

// ================================================================ part 1: the pure rules
(function pure() {
  const ok = (r) => r.ok === true, bad = (r, reason, field) => { assert.equal(r.ok, false); assert.equal(r.reason, reason); if (field) assert.equal(r.field, field); };
  const good = { title: "  The  door   won't open ", page: "/schedule", whatHappened: "Clicking Remind me does nothing at all.", expected: "", steps: "", severity: "major", token: "tok_12345678" };
  const v = L.validateReport(good);
  assert.equal(v.ok, true); assert.equal(v.value.title, "The door won't open", "whitespace in the title is collapsed"); assert.equal(v.value.private, false); assert.equal(v.value.wantsShot, false); assert.equal(v.value.device, null);
  bad(L.validateReport({ ...good, title: "no" }), "invalid", "title");
  bad(L.validateReport({ ...good, whatHappened: "short" }), "invalid", "whatHappened");
  bad(L.validateReport({ ...good, whatHappened: "x".repeat(2001) }), "invalid", "whatHappened");
  bad(L.validateReport({ ...good, expected: "x".repeat(2001) }), "invalid", "expected");
  bad(L.validateReport({ ...good, steps: "x".repeat(2001) }), "invalid", "steps");
  bad(L.validateReport({ ...good, page: "" }), "invalid", "page");
  bad(L.validateReport({ ...good, page: "p".repeat(301) }), "invalid", "page");
  bad(L.validateReport({ ...good, severity: "bad" }), "invalid", "severity");
  bad(L.validateReport({ ...good, token: "x" }), "invalid", "token");
  assert.equal(L.validateReport({ ...good, private: true, wantsShot: true }).value.private, true);
  assert.equal(L.validateReport({ ...good, private: "yes" }).value.private, false, "only a real true makes it private");
  assert.deepEqual(L.cleanDevice({ browser: "Chrome 140", os: "Windows 11", viewport: "1280 × 720" }), { browser: "Chrome 140", os: "Windows 11", viewport: "1280 × 720" });
  assert.equal(L.cleanDevice({}), null); assert.equal(L.cleanDevice("x"), null);
  assert.equal(L.cleanDevice({ browser: "b".repeat(200) }).browser.length, 80, "device strings are capped");

  assert.equal(L.validateReply("  hello  ").value, "hello"); bad(L.validateReply(""), "invalid", "text"); bad(L.validateReply("x".repeat(1001)), "invalid", "text");
  assert.equal(L.validateEditField("severity", "minor").ok, true); bad(L.validateEditField("severity", "huge"), "invalid", "severity");
  bad(L.validateEditField("status", "fixed"), "invalid", "status"); bad(L.validateEditField("title", "x"), "invalid", "title");
  assert.equal(L.validateEditField("expected", "").ok, true, "expected may be emptied");
  bad(L.validateHide({ hidden: true }), "reason", "reason"); assert.equal(L.validateHide({ hidden: false }).ok, true); bad(L.validateHide({ hidden: true, reason: "x".repeat(201) }), "invalid", "reason");

  assert.equal(L.overLimit("submit", 4), false); assert.equal(L.overLimit("submit", 5), true); assert.equal(L.overLimit("reply", 20), true); assert.equal(L.overLimit("meToo", 59), false); assert.equal(L.overLimit("meToo", 60), true);
  assert.equal(L.periodKey("submit", Date.UTC(2026, 9, 12, 15), (t) => "D" + new Date(t).getUTCDate()), "D12"); assert.match(L.periodKey("reply", Date.UTC(2026, 9, 12, 15, 30), () => ""), /^2026101215$/);

  // who sees what, "bit me too", replies, screenshots
  const pub = { by: { uid: "r" }, status: "open", hidden: false, private: false };
  assert.equal(L.meTooRefusal(pub, "x"), null);
  assert.equal(L.meTooRefusal(null, "x").reason, "noReport"); assert.equal(L.meTooRefusal({ ...pub, private: true }, "x").reason, "hidden"); assert.equal(L.meTooRefusal({ ...pub, hidden: true }, "x").reason, "hidden");
  assert.equal(L.meTooRefusal(pub, "r").reason, "own");
  for (const s of ["fixed", "wont_fix", "duplicate"]) assert.equal(L.meTooRefusal({ ...pub, status: s }, "x").reason, "closed", s);
  for (const s of ["open", "confirmed", "in_progress", "cant_reproduce"]) assert.equal(L.meTooRefusal({ ...pub, status: s }, "x"), null, s + " still takes one");
  assert.equal(L.canSeePrivate(pub, { uid: "r" }), true); assert.equal(L.canSeePrivate(pub, { uid: "z", isStaff: true }), true); assert.equal(L.canSeePrivate(pub, { uid: "z" }), false);
  assert.equal(L.replyRefusal(pub, { uid: "z" }).reason, "notYours"); assert.equal(L.replyRefusal({ ...pub, hidden: true }, { uid: "r" }).reason, "hidden"); assert.equal(L.replyRefusal(pub, { uid: "r" }), null);
  assert.equal(L.shotRefusal({ ...pub, shotRef: "x" }, { uid: "r" }).reason, "hasShot"); assert.equal(L.shotRefusal({ ...pub, closed: true }, { uid: "r" }).reason, "closed"); assert.equal(L.shotRefusal({ ...pub, closed: true }, { uid: "m", isStaff: true }), null); assert.equal(L.shotRefusal(pub, { uid: "z" }).reason, "notYours");
  assert.equal(L.shotProblem({ format: "png", bytes: 5000 }), null); assert.equal(L.shotProblem({ format: "gif", bytes: 5000 }), "format"); assert.equal(L.shotProblem({ format: "jpg", bytes: 11 * 1024 * 1024 }), "tooBig"); assert.equal(L.shotProblem(null), "notFound");

  // the triage plan
  const by = { uid: "a", handle: "adm" }, at = "T";
  const open = { status: "open", priority: null, by: { uid: "r" } };
  const plan = (item, input) => L.planTriage(item, { before: { status: item.status, priority: item.priority ?? null }, ...input }, { by, at });
  bad(L.planTriage(open, {}, { by, at }), "args", "before");
  bad(L.planTriage(null, { before: { status: "open" } }, { by, at }), "noReport");
  bad(plan(open, {}), "nothing");
  bad(L.planTriage(open, { before: { status: "fixed" }, status: "confirmed" }, { by, at }), "conflict");
  bad(plan(open, { status: "nope" }), "invalid", "status"); bad(plan(open, { priority: "mega" }), "invalid", "priority"); bad(plan(open, { note: 5 }), "invalid", "note"); bad(plan(open, { note: "x".repeat(1001) }), "invalid", "note");
  let p = plan(open, { status: "confirmed", note: " seen it " });
  assert.equal(p.ok, true); assert.equal(p.historyEntry.status, "confirmed"); assert.equal(p.historyEntry.note, "seen it"); assert.equal(p.firstTriage, true); assert.equal(p.firstConfirmed, true); assert.equal(p.firstFixed, false); assert.equal(p.patch.closed, false); assert.equal(p.closes, false);
  p = plan(open, { priority: "urgent" }); assert.equal(p.ok, true); assert.equal(p.historyEntry, null, "priority alone adds no history"); assert.equal(p.patch.priority, "urgent"); assert.equal(p.firstTriage, false); assert.equal(p.statusChanged, false);
  p = plan(open, { note: "looking" }); assert.equal(p.historyEntry.kind, "note"); assert.equal(p.firstTriage, false, "a note alone is not a triage");
  assert.equal(plan(open, { status: "in_progress" }).firstConfirmed, true); assert.equal(plan(open, { status: "fixed" }).firstConfirmed, true); assert.equal(plan(open, { status: "fixed" }).firstFixed, true);
  for (const s of ["wont_fix", "cant_reproduce"]) { p = plan(open, { status: s }); assert.equal(p.firstConfirmed, false, s + " never confirms"); assert.equal(p.firstTriage, true, s + " is still a triage"); assert.equal(p.closes, true); assert.equal(p.patch.closed, true); }
  bad(plan(open, { status: "duplicate" }), "duplicateOf", "duplicateOf");
  p = plan(open, { status: "duplicate", duplicateOf: "orig" }); assert.equal(p.ok, true); assert.equal(p.patch.duplicateOf, "orig"); assert.equal(p.firstConfirmed, false, "a duplicate never counts"); assert.equal(p.closes, true);
  bad(plan(open, { status: "confirmed", duplicateOf: "orig" }), "duplicateOf", "duplicateOf");
  const dup = { status: "duplicate", priority: null, closed: true, duplicateOf: "orig", by: { uid: "r" } };
  p = plan(dup, { status: "confirmed" }); assert.equal(p.patch.duplicateOf, null, "leaving Duplicate clears the link"); assert.equal(p.reopens, true); assert.equal(p.patch.closed, false); assert.equal(p.firstConfirmed, true);
  const done = { status: "confirmed", priority: "high", confirmedAt: "x", firstTriagedAt: "x", by: { uid: "r" } };
  p = plan(done, { status: "fixed" }); assert.equal(p.firstConfirmed, false, "confirmedAt is never cleared, so it pays once"); assert.equal(p.firstTriage, false); assert.equal(p.firstFixed, true);
  p = plan({ ...done, status: "fixed", fixedAt: "x", closed: true }, { status: "in_progress" }); assert.equal(p.reopens, true); p = plan({ ...done, status: "in_progress", fixedAt: "x" }, { status: "fixed" }); assert.equal(p.firstFixed, false, "fixed again pays nothing");
  assert.equal(L.canDelete({ isOwner: true }, () => false), true); assert.equal(L.canDelete({}, () => true), true); assert.equal(L.canDelete({}, () => false), false);
  assert.deepEqual(L.snapshotOf({ title: "T", page: "/p", whatHappened: "w", severity: "minor", status: "open", by: { handle: "gbo" } }), { title: "T", page: "/p", whatHappened: "w", severity: "minor", status: "open", reporter: "@gbo" });
})();

// ================================================================ part 2: the callables
const S = "sites/boomertanger";
const BASE = `${S}/bugs/main`, REPORTS = `${BASE}/reports`;
let clock = Date.UTC(2026, 9, 12, 15, 0);
const nsEvents = [], badges = [], gearsCalls = [], order = [], cloudDeleted = [];
const fakeFactory = { recordFactoryEvent: async (uid, type, params, ref, opts) => { nsEvents.push({ uid, type, params, ref, opts }); return { counted: true }; } };
const badgeLedger = new Set();
const fakeGrant = { grantBadge: async (uid, id, o) => { badges.push({ uid, id, ...o }); const k = `${uid}:${id}:${o.ref}`; if (badgeLedger.has(k)) return { granted: false, reason: "paid" }; badgeLedger.add(k); return { granted: true }; } };
const realHooks = require("../lib/crew/hooks");
const hooks = { noteBugTriage: async (uid, id) => { const r = await realHooks.noteBugTriage(uid, id); gearsCalls.push({ uid, id, r }); return r; } };
const adminLogEntry = async (_d, f) => ({ ...f, createdAt: realFs.Timestamp.now() });
// Cloudinary and the asset paths: fakes that record what they were asked and keep externalAssets like the real ones
let remote = {};   // publicId -> the file Cloudinary "has" (what the Admin API would say)
const fakeCloud = {
  PREVIEW_TTL_S: 600,
  uploadParams: ({ type, publicId, context }) => ({ uploadUrl: "https://upload.example/x", fields: { type, public_id: publicId, context, signature: "sig" } }),
  resourceInfo: async (_f, _c, publicId) => remote[publicId] || null,
  previewUrl: (_c, publicId, format) => `https://dl.example/${publicId}.${format}?sig=1`,
  listFolder: async (_f, _c, folder) => Object.entries(remote).filter(([k]) => k.startsWith(folder + "/")).map(([publicId, f]) => ({ publicId, createdAt: f.createdAt || 0, bytes: f.bytes })),
};
const recordAssetCreated = async (p) => { const ref = wdb.collection("externalAssets").doc(); await ref.set({ publicId: p.publicId, feature: p.feature, deliveryType: p.deliveryType, linkedDoc: { collection: p.linkedCollection, docId: p.linkedDocId, field: p.linkedField } }); return ref.id; };
const performAssetDeletion = async (assetId, _c, opts = {}) => {
  const ref = wdb.doc(`externalAssets/${assetId}`); const a = (await ref.get()).data();
  const report = await wdb.doc(`${a.linkedDoc.collection}/${a.linkedDoc.docId}`).get();
  const events = (await wdb.collection("activityLog").where("reportId", "==", a.linkedDoc.docId).get()).size;
  order.push({ step: "asset", reportStillThere: report.exists, eventsLeft: events });
  delete remote[a.publicId]; cloudDeleted.push(a.publicId);
  if (opts.clearLinkedField !== false && report.exists) await report.ref.update({ [a.linkedDoc.field]: realFs.FieldValue.delete() });
  await ref.delete(); return { ok: true };
};
const cloudinaryDelete = async ({ publicId }) => { delete remote[publicId]; cloudDeleted.push(publicId); };
const bugs = require("../lib/bugs").build({ adminLogEntry, now: () => clock, factory: fakeFactory, grant: fakeGrant, crewHooks: hooks, cloud: fakeCloud, cloudCreds: () => ({ cloudName: "c", apiKey: "k", apiSecret: "s" }), cloudSecrets: [], performAssetDeletion, cloudinaryDelete, recordAssetCreated, fetch: async () => ({}) });
const fns = bugs.functions;
const as = (uid, fn, data = {}, token = { email_verified: true }) => fns[fn].run({ auth: uid ? { uid, token } : undefined, data });
const why = async (p) => { try { await p; return "ok"; } catch (e) { return (e.details && e.details.reason) || e.code || e.message; } };
const get = async (p) => (await wdb.doc(p).get()).data();
const col = async (p) => (await wdb.collection(p).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const edit = (uid, data) => bugs.editBugReport({ auth: uid ? { uid, token: { email_verified: true } } : undefined, data });
let tok = 0; const token = () => `tok_${String(++tok).padStart(8, "0")}`;
const rep = (o = {}) => ({ title: "Remind me does nothing", page: "/schedule", whatHappened: "I click Remind me on a stream and nothing happens at all.", expected: "A reminder is set.", steps: "1. Open the schedule", severity: "major", ...o });
const shotFile = (id, o = {}) => ({ format: "png", bytes: 120000, width: 1280, height: 720, secure_url: `https://res.example/${id}`, createdAt: clock, context: { custom: { owner: "gbo" } }, ...o });
const outboxOf = async (type) => (await col(`${S}/notifyOutbox`)).filter((o) => o.type === type);

(async () => {
  // ---------- the people ----------
  await wdb.doc(S).set({ ownerUid: "boss" });
  const person = async (uid, handle, roles = [], extra = {}) => {
    await wdb.doc(`${S}/members/${uid}`).set({ roles });
    if (handle) await wdb.doc(`${S}/profiles/${uid}`).set({ handle, displayName: extra.name || handle });
  };
  await person("boss", "boomer", ["admin"]); await person("adm1", "steward", ["admin"]); await person("adm2", "overseer", ["admin"]); await person("adm3", "righthand", ["admin"]);
  await person("mod1", "modmoth", ["mod"]); await person("gbo", "gbo", [], { name: "Gbo the Great" }); await person("fan2", "fan2"); await person("fan3", "fan3"); await person("newbie", null);
  const roster = (uid, grade) => wdb.doc(`${S}/crew/main/roster/${uid}`).set({ track: "admin", grade, status: "active", handle: null });
  await roster("adm1", 1); await roster("adm2", 2); await roster("adm3", 3);
  await wdb.doc(`${S}/crew/main/roster/mod1`).set({ track: "mod", grade: 3, status: "active" });

  // ================================================================ submit
  assert.equal(await why(as(null, "bugSubmit", { ...rep(), token: token() })), "signedOut");
  assert.equal(await why(as("newbie", "bugSubmit", { ...rep(), token: token() })), "needsSignup");
  assert.equal(await why(as("gbo", "bugSubmit", { ...rep(), token: token() }, { email_verified: false })), "emailNotVerified");
  assert.equal(await why(as("gbo", "bugSubmit", { ...rep({ title: "x" }), token: token() })), "invalid");
  assert.equal((await col(REPORTS)).length, 0, "nothing was made by the refused ones");
  const t1 = token();
  const r1 = await as("gbo", "bugSubmit", { ...rep({ severity: "critical" }), device: { browser: "Chrome 140", os: "Windows 11", viewport: "1280 × 720" }, wantsShot: true, token: t1 });
  assert.equal(r1.ok, true); assert.ok(r1.id); assert.equal(r1.counted, true);
  assert.equal(r1.upload.publicId, `bug-zapper/${r1.id}/shot`); assert.equal(r1.upload.fields.type, "authenticated"); assert.equal(r1.upload.fields.public_id, `bug-zapper/${r1.id}/shot`);
  const b1 = await get(`${REPORTS}/${r1.id}`);
  assert.equal(b1.status, "open"); assert.equal(b1.priority, null); assert.equal(b1.private, false); assert.equal(b1.hidden, false); assert.equal(b1.closed, false); assert.equal(b1.meTooCount, 0); assert.equal(b1.threadCount, 0); assert.equal(b1.severity, "critical");
  assert.deepEqual(b1.by, { uid: "gbo", handle: "gbo", name: "Gbo the Great" }, "the reporter's snapshot");
  assert.equal(b1.statusHistory.length, 1); assert.equal(b1.statusHistory[0].status, "open"); assert.equal(b1.shotRef, undefined, "no screenshot until it is attached");
  assert.deepEqual((await get(`${REPORTS}/${r1.id}/staff/info`)).device, { browser: "Chrome 140", os: "Windows 11", viewport: "1280 × 720" });
  assert.ok((await get(`${BASE}/submitTokens/${t1}`)).expireAt, "the token expires");
  assert.deepEqual(nsEvents.at(-1), { uid: "gbo", type: "bugs", params: { action: "report" }, ref: `report-${r1.id}`, opts: { keep: true } }, "Night Shift: report");
  let nb = await outboxOf("bug-new");
  assert.equal(nb.length, 1); assert.equal(nb[0].audience, "admins"); assert.equal(nb[0].priority, "high", "critical is high priority"); assert.equal(nb[0].payload.reportId, r1.id); assert.equal(nb[0].status, "pending");
  assert.equal((await col("activityLog")).filter((a) => a.feature === "bug-zapper").length, 0, "no feed event for a new report");
  const again = await as("gbo", "bugSubmit", { ...rep(), token: t1 });
  assert.equal(again.id, r1.id); assert.equal(again.already, true); assert.equal((await col(REPORTS)).length, 1); assert.equal(nsEvents.filter((e) => e.params.action === "report").length, 1, "a double click is one report");
  assert.equal(await why(as("fan2", "bugSubmit", { ...rep(), token: t1 })), "token", "someone else's token is refused");
  // 5 a day, then Slow down; the next Central day opens again
  for (let i = 2; i <= 5; i++) await as("gbo", "bugSubmit", { ...rep({ title: `Another bug number ${i}` }), token: token() });
  const slow = await as("gbo", "bugSubmit", { ...rep({ title: "Sixth bug of the day" }), token: token() }).catch((e) => e);
  assert.equal(slow.details.reason, "rateLimit"); assert.match(slow.message, /Slow down/); assert.equal((await col(REPORTS)).length, 5);
  assert.equal(await why(as("gbo", "bugSubmit", { ...rep(), token: t1 })), "ok", "a repeat of an old token still costs nothing at the limit");
  clock += 16 * 3600000;
  assert.equal(await why(as("gbo", "bugSubmit", { ...rep({ title: "First bug the next day" }), token: token() })), "ok");
  nb = await outboxOf("bug-new"); assert.equal(nb.filter((o) => o.priority === "normal").length, 5);
  // a private one (security), no screenshot
  const rp = await as("fan2", "bugSubmit", { ...rep({ title: "I can see another member's email" }), private: true, token: token() });
  assert.equal((await get(`${REPORTS}/${rp.id}`)).private, true);
  assert.equal(r1.upload && (await get(`${REPORTS}/${rp.id}/staff/info`)).device, undefined, "a reporter can leave the device off");
  const all = await col(REPORTS); const second = all.find((r) => r.title === "Another bug number 2");

  // ================================================================ the screenshot
  assert.equal(await why(as("fan3", "bugShotParams", { id: r1.id })), "notYours");
  assert.equal(await why(as("gbo", "bugShotParams", { id: "nope" })), "noReport");
  const sp = await as("gbo", "bugShotParams", { id: r1.id });
  assert.equal(sp.publicId, `bug-zapper/${r1.id}/shot`); assert.equal(sp.fields.type, "authenticated");
  assert.equal((await as("mod1", "bugShotParams", { id: r1.id })).ok, true, "staff can ask too");
  const pid = `bug-zapper/${r1.id}/shot`;
  assert.equal(await why(as("gbo", "bugAttachShot", { id: r1.id, publicId: "bug-zapper/other/shot" })), "args", "only this report's upload");
  assert.equal(await why(as("gbo", "bugAttachShot", { id: r1.id, publicId: pid })), "badShot", "nothing uploaded yet");
  remote[pid] = shotFile(pid, { format: "gif" });
  assert.equal(await why(as("gbo", "bugAttachShot", { id: r1.id, publicId: pid })), "badShot", "a GIF is refused");
  assert.ok(cloudDeleted.includes(pid) && !remote[pid], "and the refused file is deleted");
  remote[pid] = shotFile(pid, { bytes: 11 * 1024 * 1024 });
  assert.equal(await why(as("gbo", "bugAttachShot", { id: r1.id, publicId: pid })), "badShot", "over 10 MB is refused");
  remote[pid] = shotFile(pid, { context: { custom: { owner: "fan2" } } });
  assert.equal(await why(as("gbo", "bugAttachShot", { id: r1.id, publicId: pid })), "notOwner", "someone else's upload");
  assert.equal(await why(as("fan3", "bugAttachShot", { id: r1.id, publicId: pid })), "notYours");
  remote[pid] = shotFile(pid);
  assert.equal((await as("gbo", "bugAttachShot", { id: r1.id, publicId: pid })).ok, true);
  assert.equal((await get(`${REPORTS}/${r1.id}`)).shotRef, pid);
  assert.deepEqual((await get(`${REPORTS}/${r1.id}/staff/info`)).shot, { publicId: pid, format: "png", bytes: 120000, width: 1280, height: 720 });
  assert.equal((await get(`${REPORTS}/${r1.id}/staff/info`)).device.browser, "Chrome 140", "the device stays");
  const asset = (await col("externalAssets")).find((a) => a.publicId === pid);
  assert.equal(asset.feature, "bugZapper"); assert.equal(asset.deliveryType, "authenticated"); assert.deepEqual(asset.linkedDoc, { collection: REPORTS, docId: r1.id, field: "shotRef" });
  assert.equal(await why(as("gbo", "bugShotParams", { id: r1.id })), "hasShot", "one per report"); assert.equal(await why(as("gbo", "bugAttachShot", { id: r1.id, publicId: pid })), "hasShot");
  assert.match((await as("gbo", "bugShotUrl", { id: r1.id })).url, /bug-zapper\/.*\/shot\.png/); assert.equal((await as("mod1", "bugShotUrl", { id: r1.id })).expiresInS, 600);
  assert.equal(await why(as("fan3", "bugShotUrl", { id: r1.id })), "notYours", "others never see the screenshot");
  assert.equal(await why(as("gbo", "bugShotUrl", { id: second.id })), "noShot");
  assert.equal(await why(as(null, "bugShotUrl", { id: r1.id })), "signedOut");

  // ================================================================ Cloud Stash's upload gate (paused uploads): the screenshot callable is refused first, the report itself is never lost
  const gateDoc = (uploads, ago = 3600000) => wdb.doc("storageUsage/cloudinary").set({ uploads, fetchedAt: realFs.Timestamp.fromMillis(Date.now() - ago), status: "paused" });
  await gateDoc("members-paused");
  const gp = await as("gbo", "bugShotParams", { id: second.id }).catch((e) => e);
  assert.equal(gp.details.reason, "uploadsPaused", "a member can't get signed screenshot params while uploads are paused"); assert.equal(gp.message, "Uploads are paused for a bit. Try again later, or send it without a picture.");
  assert.equal(gp.code, "resource-exhausted"); assert.equal((await as("mod1", "bugShotParams", { id: second.id })).ok, true, "staff may still upload when only members are paused");
  const paused = await as("gbo", "bugSubmit", { ...rep({ title: "Report while paused" }), wantsShot: true, token: token() });
  assert.ok(paused.id && paused.ok, "the report is saved"); assert.equal(paused.upload, undefined, "no upload params while paused"); assert.equal(paused.uploadsPaused, true); assert.match(paused.uploadsPausedMessage, /paused for a bit/);
  await gateDoc("stopped"); assert.equal((await as("mod1", "bugShotParams", { id: second.id }).catch((e) => e)).details.reason, "uploadsPaused", "stopped: staff are refused too");
  await gateDoc("members-paused", 49 * 3600000); assert.equal((await as("gbo", "bugShotParams", { id: second.id })).ok, true, "a status older than 48 hours fails open");
  await wdb.doc("storageUsage/cloudinary").delete(); assert.equal((await as("gbo", "bugShotParams", { id: second.id })).ok, true, "no status doc: open");
  await wdb.doc(`${REPORTS}/${paused.id}`).delete();

  // ================================================================ bit me too
  assert.equal(await why(as(null, "bugMeToo", { id: r1.id, on: true })), "signedOut");
  assert.equal(await why(as("newbie", "bugMeToo", { id: r1.id, on: true })), "needsSignup");
  assert.equal(await why(as("fan2", "bugMeToo", { id: "nope", on: true })), "noReport");
  assert.equal(await why(as("gbo", "bugMeToo", { id: r1.id, on: true })), "own", "you can't bite on your own report");
  assert.equal(await why(as("fan3", "bugMeToo", { id: rp.id, on: true })), "hidden", "a private report takes no bit me too");
  let mt = await as("fan2", "bugMeToo", { id: r1.id, on: true });
  assert.equal(mt.meTooCount, 1); assert.equal(mt.on, true);
  mt = await as("fan2", "bugMeToo", { id: r1.id, on: true }); assert.equal(mt.meTooCount, 1, "twice changes nothing");
  assert.deepEqual((await get(`${BASE}/myMeToos/fan2`)).ids, [r1.id]); assert.ok(await get(`${REPORTS}/${r1.id}/meToo/fan2`));
  assert.equal(nsEvents.filter((e) => e.uid === "fan2" && e.params.action !== "report").length, 0, "bit me too is no Night Shift event");
  mt = await as("fan2", "bugMeToo", { id: r1.id, on: false }); assert.equal(mt.meTooCount, 0); assert.deepEqual((await get(`${BASE}/myMeToos/fan2`)).ids, []);
  await as("fan2", "bugMeToo", { id: r1.id, on: true }); await as("fan3", "bugMeToo", { id: r1.id, on: true });
  assert.equal((await get(`${REPORTS}/${r1.id}`)).meTooCount, 2);
  // 60 changes an hour
  for (let i = 0; i < 58; i++) await as("fan3", "bugMeToo", { id: second.id, on: i % 2 === 0 });
  const slowMt = await as("fan3", "bugMeToo", { id: second.id, on: true }).catch((e) => e);
  assert.equal(slowMt.details.reason, "rateLimit", "the 61st change in the hour is refused"); assert.match(slowMt.message, /Slow down/);
  clock += 3 * 3600000;

  // ================================================================ the private thread
  assert.equal(await why(as(null, "bugReply", { id: r1.id, text: "hi" })), "signedOut");
  assert.equal(await why(as("fan3", "bugReply", { id: r1.id, text: "me too, please look" })), "notYours", "only the reporter and staff");
  assert.equal(await why(as("gbo", "bugReply", { id: r1.id, text: "" })), "invalid");
  assert.equal(await why(as("gbo", "bugReply", { id: "nope", text: "hello" })), "noReport");
  await as("gbo", "bugReply", { id: r1.id, text: "It also happens on my phone." });
  let th = await col(`${REPORTS}/${r1.id}/thread`); assert.equal(th.length, 1); assert.equal(th[0].staffTag, null); assert.equal(th[0].by.handle, "gbo"); assert.equal(th[0].hidden, false);
  assert.equal((await outboxOf("report-update")).length, 0, "the reporter's own reply alerts nobody");
  await as("mod1", "bugReply", { id: r1.id, text: "Thanks, we are looking." });
  await as("adm1", "bugReply", { id: r1.id, text: "Confirmed on our side." });
  th = await col(`${REPORTS}/${r1.id}/thread`); assert.deepEqual(th.map((t) => t.staffTag).sort(), ["admin", "mod", null].sort(), "the staff tag comes from the roles");
  assert.equal((await get(`${REPORTS}/${r1.id}`)).threadCount, 3);
  let ru = await outboxOf("report-update"); assert.equal(ru.length, 2); assert.deepEqual(ru[0].uids, ["gbo"]); assert.equal(ru[0].payload.reply, true); assert.equal(ru[0].audience, "uids");
  for (let i = 0; i < 18; i++) await as("gbo", "bugReply", { id: r1.id, text: `note ${i}` });
  assert.equal((await as("gbo", "bugReply", { id: r1.id, text: "one too many" }).catch((e) => e)).details.reason, "rateLimit", "20 replies an hour");
  clock += 3 * 3600000;

  // ================================================================ triage
  const tri = (uid, id, o) => as(uid, "bugTriage", { id, ...o });
  const rep1 = async () => ({ status: (await get(`${REPORTS}/${r1.id}`)).status, priority: (await get(`${REPORTS}/${r1.id}`)).priority });
  assert.equal(await why(tri("gbo", r1.id, { status: "confirmed", before: { status: "open" } })), "notAdmin");
  assert.equal(await why(tri("mod1", r1.id, { status: "confirmed", before: { status: "open" } })), "notAdmin", "mods hide and reply; admins triage");
  assert.equal(await why(tri("adm1", "nope", { status: "confirmed", before: { status: "open" } })), "noReport");
  assert.equal(await why(tri("adm1", r1.id, { status: "confirmed", before: { status: "fixed" } })), "conflict");
  assert.equal(await why(tri("adm1", r1.id, { before: { status: "open" } })), "nothing");
  assert.equal(await why(tri("adm1", r1.id, { status: "nope", before: { status: "open" } })), "invalid");
  assert.equal(await why(tri("adm1", r1.id, { priority: "urgent", before: { status: "open" } })), "ok", "priority alone");
  let b = await get(`${REPORTS}/${r1.id}`);
  assert.equal(b.priority, "urgent"); assert.equal(b.statusHistory.length, 1, "priority alone adds no history"); assert.equal(b.firstTriagedAt, undefined); assert.equal(gearsCalls.length, 0);
  assert.equal(await why(tri("adm1", r1.id, { note: "Looking into it.", before: { status: "open", priority: "urgent" } })), "ok", "a note alone");
  b = await get(`${REPORTS}/${r1.id}`); assert.equal(b.statusHistory.length, 2); assert.equal(b.statusHistory[1].kind, "note"); assert.equal(b.status, "open"); assert.equal(gearsCalls.length, 0, "a note is not the first triage");
  nsEvents.length = 0;
  const tr = await tri("adm2", r1.id, { status: "confirmed", note: "Reproduced on Chrome.", before: { status: "open", priority: "urgent" } });
  assert.equal(tr.statusChanged, true); assert.equal(tr.rewards.gears, true); assert.equal(tr.rewards.badge, true);
  b = await get(`${REPORTS}/${r1.id}`);
  assert.equal(b.status, "confirmed"); assert.equal(b.closed, false); assert.ok(b.firstTriagedAt); assert.ok(b.confirmedAt); assert.ok(b.statusChangedAt); assert.equal(b.statusHistory.length, 3); assert.equal(b.statusHistory[2].status, "confirmed"); assert.equal(b.statusHistory[2].note, "Reproduced on Chrome.");
  assert.equal(gearsCalls.length, 1); assert.equal(gearsCalls[0].r.granted, true, JSON.stringify(gearsCalls[0].r));
  assert.ok(await get(`${S}/crew/main/gears/bugTriage:${r1.id}:adm2`), "+3 Gears to the admin, keyed by the report");
  assert.deepEqual(badges.filter((x) => x.id === "bug-finder").map((x) => [x.uid, x.feature, x.ref]), [["gbo", "bugs", r1.id]], "Bug Finder to the reporter on the first confirmed status");
  assert.deepEqual(nsEvents.at(-1), { uid: "gbo", type: "bugs", params: { action: "confirmed" }, ref: `confirmed-${r1.id}`, opts: { keep: true } });
  ru = (await outboxOf("report-update")).filter((o) => o.payload.status === "confirmed"); assert.equal(ru.length, 1); assert.deepEqual(ru[0].uids, ["gbo"]); assert.equal(ru[0].payload.statusLabel, "Confirmed");
  const logs = (await col("adminLog")).filter((e) => e.feature === "bugZapper" && e.action === "triage" && e.itemPath === `${REPORTS}/${r1.id}`);
  assert.equal(logs.length, 3, "every triage is logged"); assert.deepEqual(logs.at(-1).changes.status, { before: "open", after: "confirmed" });
  // moving on pays nothing again
  assert.equal(await why(tri("adm1", r1.id, { status: "in_progress", before: { status: "confirmed", priority: "urgent" } })), "ok");
  assert.equal(await why(tri("adm1", r1.id, { status: "confirmed", before: { status: "in_progress", priority: "urgent" } })), "ok");
  assert.equal(gearsCalls.length, 1, "no second review"); assert.equal(badges.filter((x) => x.id === "bug-finder").length, 1); assert.equal(nsEvents.filter((e) => e.params.action === "confirmed").length, 1, "Bug Finder and the Night Shift event come once");
  // fixed: the feed event, an alert to everyone who bit, once
  await tri("adm1", r1.id, { status: "in_progress", before: { status: "confirmed", priority: "urgent" } });
  const before = (await outboxOf("report-update")).length;
  const fx = await tri("adm1", r1.id, { status: "fixed", note: "Fixed in the next update.", before: { status: "in_progress", priority: "urgent" } });
  assert.equal(fx.rewards.gears, false, "the second admin to touch it earns nothing");
  b = await get(`${REPORTS}/${r1.id}`); assert.equal(b.status, "fixed"); assert.equal(b.closed, true); assert.ok(b.closedAt); assert.ok(b.fixedAt);
  let evs = (await col("activityLog")).filter((a) => a.feature === "bug-zapper" && a.reportId === r1.id); assert.equal(evs.length, 1); assert.equal(evs[0].type, "fixed"); assert.equal(evs[0].link, `/bug-zapper?report=${r1.id}`);
  const fixedAlerts = (await outboxOf("report-update")).slice(before).filter((o) => o.payload.status === "fixed");
  assert.deepEqual(fixedAlerts.map((o) => [...o.uids].sort()).sort(), [["fan2", "fan3"], ["gbo"]], "the reporter, and everyone who bit separately");
  assert.equal(await why(as("fan2", "bugMeToo", { id: r1.id, on: false })), "closed", "the count is frozen once it is fixed");
  assert.equal(await why(as("gbo", "bugShotParams", { id: r1.id })), "hasShot");
  // reopened and fixed again: no second event
  await tri("adm1", r1.id, { status: "in_progress", before: { status: "fixed", priority: "urgent" } });
  b = await get(`${REPORTS}/${r1.id}`); assert.equal(b.closed, false); assert.equal(b.closedAt, undefined, "reopening clears closedAt");
  await tri("adm1", r1.id, { status: "fixed", before: { status: "in_progress", priority: "urgent" } });
  assert.equal((await col("activityLog")).filter((a) => a.feature === "bug-zapper" && a.reportId === r1.id).length, 1, "fixed twice, one event");

  // won't fix: a triage, but no Bug Finder
  const wf = await tri("adm3", second.id, { status: "wont_fix", note: "Works as designed.", before: { status: "open" } });
  assert.equal(wf.rewards.gears, true, "any first move out of Open earns the review Gears"); assert.equal(wf.rewards.badge, false);
  assert.equal(badges.filter((x) => x.id === "bug-finder").length, 1);
  b = await get(`${REPORTS}/${second.id}`); assert.equal(b.closed, true); assert.ok(b.closedAt); assert.equal(b.confirmedAt, undefined);
  // a private report: no feed event when it is fixed
  await tri("adm2", rp.id, { status: "fixed", before: { status: "open" } });
  assert.equal((await col("activityLog")).filter((a) => a.reportId === rp.id).length, 0, "no event for a private report");
  assert.equal(badges.filter((x) => x.id === "bug-finder").length, 2, "a report that goes straight to Fixed is confirmed too (the reporter of the private one)");
  // duplicates
  const rd = await as("fan3", "bugSubmit", { ...rep({ title: "Remind me broken again" }), token: token() });
  const orig = r1.id;
  assert.equal(await why(tri("adm1", rd.id, { status: "duplicate", before: { status: "open" } })), "duplicateOf");
  assert.equal(await why(tri("adm1", rd.id, { status: "duplicate", duplicateOf: rd.id, before: { status: "open" } })), "duplicateOf", "not itself");
  assert.equal(await why(tri("adm1", rd.id, { status: "duplicate", duplicateOf: "nope", before: { status: "open" } })), "duplicateOf", "it must exist");
  const hiddenOne = await as("gbo", "bugSubmit", { ...rep({ title: "Will be hidden soon" }), token: token() });
  await as("mod1", "bugHide", { id: hiddenOne.id, hidden: true, reason: "spam" });
  assert.equal(await why(tri("adm1", rd.id, { status: "duplicate", duplicateOf: hiddenOne.id, before: { status: "open" } })), "duplicateOf", "not a hidden one");
  const badgesBefore = badges.length;
  const dr = await tri("adm1", rd.id, { status: "duplicate", duplicateOf: orig, before: { status: "open" } });
  assert.equal(dr.rewards.badge, false, "duplicates never count"); assert.equal(badges.length, badgesBefore);
  b = await get(`${REPORTS}/${rd.id}`); assert.equal(b.duplicateOf, orig); assert.equal(b.closed, true);
  assert.ok(await get(`${REPORTS}/${orig}/meToo/fan3`), "the duplicate's reporter is added to the original"); assert.ok((await get(`${BASE}/myMeToos/fan3`)).ids.includes(orig));
  assert.equal((await get(`${REPORTS}/${orig}`)).meTooCount, 2, "fan3 had already bit on it: still counted once");
  // a duplicate of a report whose reporter had not bit: counted
  const rd2 = await as("fan2", "bugSubmit", { ...rep({ title: "Same bug as the other one" }), token: token() });
  const orig2 = (await as("gbo", "bugSubmit", { ...rep({ title: "The original of the other one" }), token: token() })).id;
  const nsBeforeDup = nsEvents.length;
  await tri("adm1", rd2.id, { status: "duplicate", duplicateOf: orig2, before: { status: "open" } });
  assert.equal((await get(`${REPORTS}/${orig2}`)).meTooCount, 1); assert.deepEqual((await get(`${BASE}/myMeToos/fan2`)).ids.includes(orig2), true);
  assert.equal(nsEvents.length, nsBeforeDup, "a duplicate is no Night Shift event");
  await tri("adm1", rd2.id, { status: "open", before: { status: "duplicate" } });
  b = await get(`${REPORTS}/${rd2.id}`); assert.equal(b.duplicateOf, null, "leaving Duplicate clears the link"); assert.equal(b.closed, false);

  // ================================================================ hide
  assert.equal(await why(as("fan2", "bugHide", { id: r1.id, hidden: true, reason: "x" })), "notStaff");
  assert.equal(await why(as("mod1", "bugHide", { id: r1.id, hidden: true })), "reason", "a reason is needed to hide");
  assert.equal(await why(as("mod1", "bugHide", { id: "nope", hidden: true, reason: "x" })), "noReport");
  assert.equal(await why(as("mod1", "bugHide", { id: r1.id, replyId: "nope", hidden: true, reason: "x" })), "noReply");
  const hh = await as("mod1", "bugHide", { id: second.id, hidden: true, reason: "spam" });
  assert.equal(hh.changed, true); b = await get(`${REPORTS}/${second.id}`); assert.equal(b.hidden, true); assert.deepEqual(b.hiddenBy, { uid: "mod1", handle: "modmoth" }); assert.equal(b.hiddenReason, "spam");
  assert.equal(await why(as("fan2", "bugMeToo", { id: second.id, on: true })), "hidden"); assert.equal(await why(as("gbo", "bugReply", { id: second.id, text: "hello there" })), "noReport", "a hidden report takes no replies");
  assert.equal((await as("mod1", "bugHide", { id: second.id, hidden: true, reason: "spam" })).changed, false, "already hidden");
  assert.equal((await as("mod1", "bugHide", { id: second.id, hidden: false })).changed, true); assert.equal((await get(`${REPORTS}/${second.id}`)).hidden, false);
  const reply2 = (await col(`${REPORTS}/${r1.id}/thread`)).find((t) => t.by.handle === "gbo");
  await as("mod1", "bugHide", { id: r1.id, replyId: reply2.id, hidden: true, reason: "off topic" });
  assert.equal((await get(`${REPORTS}/${r1.id}/thread/${reply2.id}`)).hidden, true); const tc = (await get(`${REPORTS}/${r1.id}`)).threadCount;
  await as("mod1", "bugHide", { id: r1.id, replyId: reply2.id, hidden: false }); assert.equal((await get(`${REPORTS}/${r1.id}`)).threadCount, tc + 1, "the count follows what people can see");
  const hl = (await col("adminLog")).filter((e) => e.feature === "bugZapper" && (e.action === "hide" || e.action === "unhide")); assert.ok(hl.length >= 4); assert.ok(hl.some((e) => e.details && e.details.replyId === reply2.id));

  // ================================================================ the bugReport edit kind
  assert.equal(await why(edit("gbo", { id: r1.id, changes: { severity: "minor" }, before: { severity: "critical" } })), "notAdmin");
  assert.equal(await why(edit("mod1", { id: r1.id, changes: { severity: "minor" }, before: { severity: "critical" } })), "notAdmin");
  assert.equal(await why(edit("adm1", { id: r1.id, changes: { status: "open" }, before: { status: "fixed" } })), "invalid", "status isn't an edit field");
  assert.equal(await why(edit("adm1", { id: r1.id, changes: { severity: "huge" }, before: { severity: "critical" } })), "invalid");
  assert.equal(await why(edit("adm1", { id: r1.id, changes: { severity: "minor" }, before: { severity: "major" } })), "conflict");
  assert.equal(await why(edit("adm1", { id: "nope", changes: { severity: "minor" }, before: { severity: "x" } })), "noReport");
  assert.equal((await edit("adm1", { id: r1.id, changes: { severity: "critical" }, before: { severity: "critical" } })).changed, false, "an edit that changes nothing writes nothing");
  assert.equal((await edit("adm1", { id: r1.id, changes: { severity: "minor", title: "Remind me does nothing on stream pages" }, before: { severity: "critical", title: "Remind me does nothing" }, reason: "Overstated" })).changed, true);
  b = await get(`${REPORTS}/${r1.id}`); assert.equal(b.severity, "minor"); assert.equal(b.title, "Remind me does nothing on stream pages"); assert.equal(b.editCount, 1); assert.ok(b.editedAt); assert.equal(b.by.handle, "gbo", "the reporter is never touched");
  const el = (await col("adminLog")).filter((e) => e.feature === "bugZapper" && e.action === "edit").at(-1); assert.equal(el.reason, "Overstated"); assert.deepEqual(el.changes.severity, { before: "critical", after: "minor" });
  // removing the screenshot goes through the one delete path and clears shotRef
  assert.ok(await get(`${REPORTS}/${r1.id}`).then((x) => x.shotRef));
  assert.equal((await edit("adm1", { id: r1.id, removeShot: true, reason: "Showed a private email" })).removedShot, true);
  b = await get(`${REPORTS}/${r1.id}`); assert.equal(b.shotRef, undefined); assert.equal((await col("externalAssets")).filter((a) => a.publicId === pid).length, 0); assert.ok(cloudDeleted.filter((p) => p === pid).length >= 1);
  assert.equal((await get(`${REPORTS}/${r1.id}/staff/info`)).shot, undefined, "the info doc's shot goes too");
  assert.equal((await get(`${REPORTS}/${r1.id}/staff/info`)).device.browser, "Chrome 140");

  // ================================================================ delete: the order, and who may
  assert.equal(await why(as("gbo", "bugDelete", { id: r1.id })), "notAdmin");
  assert.equal(await why(as("mod1", "bugDelete", { id: r1.id })), "notAdmin");
  assert.equal(await why(as("adm1", "bugDelete", { id: r1.id })), "needsRightHand", "a Steward hides instead");
  assert.equal(await why(as("boss", "bugDelete", { id: "nope" })), "noReport");
  // a report with a screenshot, a thread, bit-me-toos, an event and a post token
  const rx = await as("gbo", "bugSubmit", { ...rep({ title: "Delete me with everything" }), wantsShot: true, token: token() });
  const px = `bug-zapper/${rx.id}/shot`; remote[px] = shotFile(px); await as("gbo", "bugAttachShot", { id: rx.id, publicId: px });
  await as("gbo", "bugReply", { id: rx.id, text: "A note for the team." }); await as("fan2", "bugMeToo", { id: rx.id, on: true }); await as("adm1", "bugTriage", { id: rx.id, status: "fixed", before: { status: "open" } });
  assert.equal((await col("activityLog")).filter((a) => a.reportId === rx.id).length, 1);
  order.length = 0;
  const del = await as("adm2", "bugDelete", { id: rx.id });
  assert.equal(del.ok, true); assert.equal(del.activityDeleted, 1);
  assert.deepEqual(order, [{ step: "asset", reportStillThere: true, eventsLeft: 1 }], "Cloudinary and the asset record go first, while the report and its events still exist");
  assert.equal(await get(`${REPORTS}/${rx.id}`), undefined, "the report is gone"); assert.equal((await col(`${REPORTS}/${rx.id}/thread`)).length, 0); assert.equal((await col(`${REPORTS}/${rx.id}/meToo`)).length, 0); assert.equal((await col(`${REPORTS}/${rx.id}/staff`)).length, 0);
  assert.equal((await col("activityLog")).filter((a) => a.reportId === rx.id).length, 0, "its events are gone");
  assert.equal((await col("externalAssets")).filter((a) => a.publicId === px).length, 0); assert.ok(!remote[px], "the file is gone from Cloudinary");
  assert.deepEqual((await get(`${BASE}/myMeToos/fan2`)).ids.includes(rx.id), false, "the marks are cleaned"); assert.equal((await col(`${BASE}/submitTokens`)).filter((t) => t.reportId === rx.id).length, 0);
  const dl = (await col("adminLog")).filter((e) => e.feature === "bugZapper" && e.action === "delete").at(-1);
  assert.equal(dl.itemPath, `${REPORTS}/${rx.id}`); assert.equal(dl.snapshot.title, "Delete me with everything"); assert.equal(dl.snapshot.reporter, "@gbo"); assert.equal(dl.details.assetsDeleted, 1);
  assert.ok(await get(`${REPORTS}/${r1.id}`), "other reports are untouched");
  assert.equal((await as("adm3", "bugDelete", { id: rd.id })).ok, true, "A3 Right Hand may delete");
  assert.equal((await as("boss", "bugDelete", { id: rp.id })).ok, true, "the owner may delete");

  // ================================================================ bugTidy
  remote = {
    "bug-zapper/old1/shot": shotFile("old1", { createdAt: clock - 30 * 3600000 }),   // never attached, older than a day: goes
    "bug-zapper/new1/shot": shotFile("new1", { createdAt: clock - 1 * 3600000 }),   // still being uploaded: stays
    "bug-zapper/old2/shot": shotFile("old2", { createdAt: clock - 30 * 3600000 }),   // attached (has a record): stays
    "game-vault/pending/x": shotFile("x", { createdAt: clock - 30 * 3600000 }),      // the Vault's: not ours
  };
  await wdb.collection("externalAssets").doc("a_old2").set({ publicId: "bug-zapper/old2/shot", linkedDoc: { collection: REPORTS, docId: "old2", field: "shotRef" } });
  assert.equal(await bugs.ops.tidy(), 1); assert.deepEqual(Object.keys(remote).sort(), ["bug-zapper/new1/shot", "bug-zapper/old2/shot", "game-vault/pending/x"]);

  // ================================================================ rules, indexes and the cleanup rule (text checks: no emulator here)
  const fsx = require("fs"), pathx = require("path");
  const root = pathx.join(__dirname, "..", "..");
  const rules = fsx.readFileSync(pathx.join(root, "firestore.rules"), "utf8");
  const a = rules.indexOf("// ---------- Bug Zapper (docs/specs/bug-zapper.md"); assert.ok(a > 0, "the Bug Zapper rules block is there");
  const block = rules.slice(a, rules.indexOf("// The mod queue", a));
  for (const m of ["match /bugs/main/reports/{reportId}", "match /staff/{docId}", "match /thread/{replyId}", "match /meToo/{uid}", "match /bugs/main/myMeToos/{uid}", "match /bugs/main/submitTokens/{token}"]) assert.ok(block.includes(m), m);
  const writes = block.match(/allow [a-z, ]*write[a-z, ]*:[^;]*;/g) || [];
  assert.ok(writes.length >= 6 && writes.every((w) => w.endsWith("if false;")), "every client write in the Bug Zapper block is false: " + writes.join(" | "));
  assert.ok(!/allow (create|update|delete)/.test(block), "no create, update or delete rule");
  const reports = block.slice(block.indexOf("match /bugs/main/reports/{reportId}"), block.indexOf("match /staff/{docId}"));
  assert.ok(reports.includes("resource.data.hidden == false") && reports.includes("resource.data.private == false") && reports.includes("resource.data.by.uid") && reports.includes("isSiteStaff(siteId)"), "public if neither private nor hidden; the reporter's own; staff always");
  const thread = block.slice(block.indexOf("match /thread/{replyId}"), block.indexOf("match /meToo/{uid}"));
  assert.ok(thread.includes("by.uid") && thread.includes("isSiteStaff(siteId)") && thread.includes("resource.data.hidden == false"), "the thread is for the reporter and staff, and a hidden reply is staff only");
  assert.ok(block.slice(block.indexOf("match /meToo/{uid}"), block.indexOf("match /bugs/main/myMeToos")).includes("allow read, write: if false;"), "bit me too records are closed");
  assert.ok(block.slice(block.indexOf("match /bugs/main/myMeToos")).includes("request.auth.uid == uid"), "a member reads only their own list");
  assert.ok(/match \/adminLog\/\{entryId\}[\s\S]{0,400}hasSiteRole\('boomertanger', 'admin'\)/.test(rules), "new-site admins already read adminLog (Feature Lab)");
  const idx = JSON.parse(fsx.readFileSync(pathx.join(root, "firestore.indexes.json"), "utf8"));
  const has = (group, fields) => idx.indexes.some((i) => i.collectionGroup === group && i.queryScope === "COLLECTION" && JSON.stringify(i.fields.map((x) => [x.fieldPath, x.order])) === JSON.stringify(fields));
  assert.ok(has("reports", [["private", "ASCENDING"], ["hidden", "ASCENDING"], ["createdAt", "DESCENDING"]]), "public reports, newest first");
  assert.ok(has("reports", [["by.uid", "ASCENDING"], ["createdAt", "DESCENDING"]]), "my reports");
  assert.ok(has("reports", [["closed", "ASCENDING"], ["closedAt", "ASCENDING"]]), "the cleanup rule");
  assert.ok(has("thread", [["hidden", "ASCENDING"], ["createdAt", "ASCENDING"]]), "the thread");
  assert.ok(idx.fieldOverrides.some((o) => o.collectionGroup === "submitTokens" && o.fieldPath === "expireAt" && o.ttl === true), "post tokens expire");
  // the cleanup rule's setup lives in seed-cloud-stash.js (checked in check-stash.js); seed-bug-cleanup-rule.js is retired
  assert.ok(!fsx.existsSync(pathx.join(__dirname, "seed-bug-cleanup-rule.js")), "the old cleanup-rule seed script is gone");

  // ================================================================ the daily report limit: members and mods 5, the owner and admins exempt (backstop 200)
  {
    clock += 3 * 24 * 3600000;   // a fresh Central day for everyone
    const send = (uid, n) => as(uid, "bugSubmit", { ...rep({ title: `Limit check ${uid} number ${n}` }), token: token() });
    const sendN = async (uid, n) => { for (let i = 1; i <= n; i++) await send(uid, i); };
    await sendN("fan3", 5); await sendN("mod1", 5); await sendN("boss", 5); await sendN("adm1", 5);
    const sixth = async (uid) => why(send(uid, 6));
    assert.equal(await sixth("fan3"), "rateLimit", "a member is refused on the 6th");
    assert.equal(await sixth("mod1"), "rateLimit", "a mod is refused on the 6th");
    assert.equal(await sixth("boss"), "ok", "the owner can send a 6th");
    assert.equal(await sixth("adm1"), "ok", "an admin (A1 Steward) can send a 6th");
    await sendN("adm1", 194);   // 200 today
    const over = await send("adm1", 201).catch((e) => e);
    assert.equal(over.details.reason, "rateLimit", "an admin is refused on the 201st");
    assert.equal(over.message, "That's 200 reports today. Try again tomorrow.");
    const keys = (await col(`${S}/rateLimits`)).map((d) => d.id);
    assert.ok(keys.some((k) => k.startsWith("bugs_submitAdmin_")) && keys.some((k) => k.startsWith("bugs_submit_")), "the backstop has its own key");
    assert.equal(L.overLimit("submitAdmin", 199), false); assert.equal(L.overLimit("submitAdmin", 200), true);
  }

  console.log("check-bugs: ok");
})().catch((e) => { console.error(e); process.exit(1); });
