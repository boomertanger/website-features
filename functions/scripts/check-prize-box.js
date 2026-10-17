#!/usr/bin/env node
// functions/scripts/check-prize-box.js: Prize Box (lib/prizeBox/*, docs/specs/prize-box.md §3-§8). Part 1 proves the pure rules (contest fields, status moves,
// who can win, the spin plan, codes, postmarks, claims, the public summary). Part 2 runs every callable and prizeTick against the in-memory Firestore with
// fakes for the Trophy Room, Cloudinary and the asset paths. No network, no credentials, no deploy.   npm run check
const assert = require("assert/strict");
const { makeDb } = require("./fixtures/fake-firestore");
const admin = require("firebase-admin");
process.env.GCLOUD_PROJECT ||= "boomertanger-staging";
process.env.FIREBASE_CONFIG ||= JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const wdb = makeDb(); const realFs = admin.firestore;
const fakeFs = () => wdb; fakeFs.Timestamp = realFs.Timestamp; fakeFs.FieldValue = realFs.FieldValue;
Object.defineProperty(admin, "firestore", { value: fakeFs, configurable: true, writable: true });

const L = require("../lib/prizeBox/logic");
const DAY = L.DAY_MS;

// ================================================================ part 1: the pure rules
(function pure() {
  const bad = (r, reason) => { assert.equal(r.ok, false, JSON.stringify(r)); assert.equal(r.reason, reason); };
  const now = Date.UTC(2026, 9, 17, 18);
  const online = { type: "online", title: "Draw Boomer's Nightmare", method: "judge", winnersCount: 2, prizes: [{ place: 1, title: "A framed print", kind: "mailed" }, { place: 2, title: "A Steam game", kind: "digital" }], opensAt: now, closesAt: now + 14 * DAY, eligibility: [{ kind: "memberDays", n: 7 }, { kind: "everyBeat" }, { kind: "bogus" }] };
  const v = L.validateContest(online, { now });
  assert.equal(v.ok, true); assert.equal(v.value.slug, "draw-boomer-s-nightmare"); assert.equal(v.value.entryKind, "upload"); assert.deepEqual(v.value.eligibility, [{ kind: "memberDays", n: 7 }], "everyBeat is live only; unknown filters are dropped");
  assert.equal(v.value.audience, "members"); assert.equal(v.value.announce.banner, true);
  bad(L.validateContest({ ...online, type: "raffle" }, { now }), "type");
  bad(L.validateContest({ ...online, title: "x" }, { now }), "title");
  bad(L.validateContest({ ...online, method: "wheel" }, { now }), "method");
  bad(L.validateContest({ ...online, winnersCount: 3 }, { now }), "prizes");
  bad(L.validateContest({ ...online, prizes: [{ place: 1, title: "A", kind: "mailed" }, { place: 1, title: "B", kind: "digital" }] }, { now }), "prizes");
  bad(L.validateContest({ ...online, prizes: [online.prizes[0], { ...online.prizes[1], kind: "cash" }] }, { now }), "prizes");
  bad(L.validateContest({ ...online, closesAt: now - 1 }, { now }), "dates");
  bad(L.validateContest({ ...online, closesAt: online.opensAt }, { now }), "dates");
  const live = { type: "live", title: "Break Wheel #1", method: "wheel", winnersCount: 1, prizes: [{ place: 1, title: "A horror game on Steam", kind: "digital" }], draw: { beat: "break1" }, eligibility: [{ kind: "everyBeat" }],
    round1: [{ group: "Everyone", filter: { kind: "everyone" } }, { group: "Every beat tonight", filter: { kind: "everyBeat" } }] };
  const lv = L.validateContest(live, { now });
  assert.equal(lv.ok, true); assert.equal(lv.value.draw.beat, "break1"); assert.equal(lv.value.round1.length, 2); assert.deepEqual(lv.value.eligibility, [{ kind: "everyBeat" }]);
  bad(L.validateContest({ ...live, draw: { beat: "start" } }, { now }), "beat");
  bad(L.validateContest({ ...live, winnersCount: 2, prizes: [...live.prizes, { place: 2, title: "B", kind: "digital" }] }, { now }), "winnersCount");
  bad(L.validateContest({ ...live, round1: [{ group: "One", filter: { kind: "everyone" } }] }, { now }), "round1");
  assert.equal(L.validFilter({ kind: "nightShiftTop", n: 500 }, "online"), null, "the season board keeps the top 100");
  assert.deepEqual(L.validFilter({ kind: "badge", badgeId: "splat-finisher" }, "online"), { kind: "badge", badgeId: "splat-finisher" });
  assert.ok(!L.FILTERS.includes("streamStreak") && !L.FILTERS.includes("firstStream"), "no data for stream streaks or first streams yet: left out");

  // status moves
  const c = (o) => ({ type: "online", method: "judge", opensAt: now - 1, ...o });
  assert.equal(L.planMove(c({ status: "draft" }), "publish", now).to, "open");
  assert.equal(L.planMove(c({ status: "draft", opensAt: now + DAY }), "publish", now).to, "scheduled");
  assert.equal(L.planMove({ type: "live", status: "draft" }, "publish", now).to, "scheduled");
  assert.equal(L.planMove(c({ status: "open" }), "close", now).to, "judging", "a judged contest goes to judging");
  assert.equal(L.planMove(c({ status: "open", method: "random" }), "close", now).to, "closed");
  bad(L.planMove({ type: "live", status: "scheduled" }, "open", now), "live");
  bad(L.planMove(c({ status: "won" }), "cancel", now), "status");
  bad(L.planMove(c({ status: "open" }), "explode", now), "action");
  assert.equal(L.canManage({ isAdmin: true }, { type: "online" }), true); assert.equal(L.canManage({ isAdmin: true }, { type: "live" }), false); assert.equal(L.canManage({ isAdmin: true, isOwner: true }, { type: "live" }), true);

  // who can win
  const p = (o) => ({ uid: "u", profile: { handle: "u" }, member: { roles: [], joinedAt: now - 30 * DAY }, ownerUid: "boss", badges: new Set(), ...o });
  const cont = { type: "online", eligibility: [] };
  assert.equal(L.ineligible(p(), cont, now), null);
  assert.equal(L.ineligible(p({ profile: null }), cont, now).reason, "needsSignup");
  assert.equal(L.ineligible(p({ uid: "boss" }), cont, now).reason, "crew", "the owner can never win");
  for (const roles of [["admin"], ["mod"]]) assert.equal(L.ineligible(p({ member: { roles } }), cont, now).reason, "crew", roles[0]);
  assert.equal(L.ineligible(p({ member: { roles: [], crewGrade: 1, crewStatus: "paused" } }), cont, now).reason, "crew", "paused crew are still crew");
  assert.equal(L.ineligible(p({ member: { roles: [], crewGrade: 1, crewStatus: "alumni", joinedAt: now - 30 * DAY } }), cont, now), null, "alumni can win");
  assert.equal(L.ineligible(p({ cooldownUntil: now + DAY }), { type: "live", eligibility: [] }, now).reason, "cooldown");
  assert.equal(L.ineligible(p({ cooldownUntil: now + DAY }), cont, now), null, "the cooldown is for live draws");
  assert.equal(L.ineligible(p(), { type: "online", eligibility: [{ kind: "memberDays", n: 60 }] }, now).reason, "memberDays");
  assert.equal(L.ineligible(p(), { type: "online", eligibility: [{ kind: "badge", badgeId: "b" }] }, now).reason, "badge");
  assert.equal(L.ineligible(p({ badges: new Set(["b"]) }), { type: "online", eligibility: [{ kind: "badge", badgeId: "b" }] }, now), null);
  assert.equal(L.ineligible(p({ nsRank: 11 }), { type: "online", eligibility: [{ kind: "nightShiftTop", n: 10 }] }, now).reason, "nightShiftTop");
  assert.equal(L.ineligible(p({ nsRank: 10 }), { type: "online", eligibility: [{ kind: "nightShiftTop", n: 10 }] }, now), null);
  assert.equal(L.checkedIn({ beats: { break1: {} } }), true); assert.equal(L.checkedIn({ drops: 1 }), false, "a drop alone isn't a check-in");
  assert.equal(L.checkedIn({ beats: { break1: {} }, crew: true }), false); assert.equal(L.checkedIn({ beats: { break1: {} }, noPrize: true }), false);

  // the spin plan (spec §4.5)
  for (let i = 0; i < 200; i++) {
    const s = L.planSpin({ now });
    assert.ok(s.pickIndex >= 0 && s.pickIndex < 10); assert.ok(s.offset >= 0.2 && s.offset <= 0.8); assert.ok(s.spins === 5 || s.spins === 6); assert.ok(s.durationMs >= 7200 && s.durationMs <= 8400); assert.equal(s.startAt, now + 1500);
  }
  const r2 = L.roundTwo([{ uid: "a", handle: "a" }, { uid: "b", handle: "b" }, { uid: "c", handle: "c" }]);
  assert.equal(r2.blades.length, 10); assert.equal(r2.labels.filter(Boolean).length, 3); assert.equal(r2.labels.filter((x) => x === null).length, 7, "empty blades are Spin again");
  assert.equal(L.roundTwo(Array.from({ length: 30 }, (_, i) => ({ uid: `u${i}`, handle: `h${i}` }))).labels.filter(Boolean).length, 10);

  // codes, postmarks, entries
  for (let i = 0; i < 50; i++) assert.match(L.makeCode(), /^PB-[A-HJKMNP-Z2-9]{4}$/);
  assert.equal(L.normCode(" pb 7k4m "), "PB-7K4M"); assert.equal(L.normCode("7K4M"), "PB-7K4M"); assert.equal(L.normCode("PB-7K4"), null);
  const closes = Date.UTC(2026, 10, 1, 4, 59);   // Oct 31, 11:59 PM Central
  assert.equal(L.postmarkLate("2026-10-31", closes), false); assert.equal(L.postmarkLate("2026-11-01", closes), true);
  assert.equal(L.validDate("2026-10-31"), "2026-10-31"); assert.equal(L.validDate("10/31/2026"), null);
  bad(L.validateEntry({ publicId: "x" }, { entryKind: "upload" }), "rules");
  assert.equal(L.validateEntry({ publicId: "x", rulesOk: true }, { entryKind: "upload" }).value.showIfWin, true);
  assert.equal(L.validateEntry({ text: "A ghost under the desk", rulesOk: true, showIfWin: false }, { entryKind: "text" }).value.showIfWin, false);
  assert.equal(L.uploadProblem({ format: "png", bytes: 5 }), null); assert.equal(L.uploadProblem({ format: "gif", bytes: 5 }), "format"); assert.equal(L.uploadProblem({ format: "jpg", bytes: 11 * 1024 * 1024 }), "tooBig");
  assert.equal(L.enterRefusal({ type: "live", status: "scheduled" }, now).reason, "live");
  assert.equal(L.enterRefusal({ type: "online", status: "open", closesAt: now - 1 }, now).reason, "closed");

  // claims
  const addr = { name: "Sample Person", line1: "1 Sample St", city: "Sample City", state: "mn", zip: "00000" };
  assert.equal(L.validateAddress(addr).value.state, "MN");
  bad(L.validateAddress({ ...addr, country: "CA" }), "usOnly");
  bad(L.validateAddress({ ...addr, zip: "ABCDE" }), "zip");
  bad(L.validateAddress({ ...addr, state: "ZZ" }), "state");
  assert.equal(L.claimRefusal({ uid: "u", status: "pending", claimBy: now + 1 }, "u", now), null);
  assert.equal(L.claimRefusal({ uid: "u", status: "pending", claimBy: now - 1 }, "u", now).reason, "late");
  assert.equal(L.claimRefusal({ uid: "x", status: "pending", claimBy: now + 1 }, "u", now).reason, "notYours");

  // the summary: only showIfWin winners, never a uid
  const s = L.buildSummary([{ id: "a", slug: "a", title: "A", status: "open", type: "online", closesAt: now + DAY, prizes: [] }, { id: "b", slug: "b", title: "B", status: "done", type: "online", prizes: [] }],
    [{ uid: "u1", handle: "one", contestTitle: "A", prizeTitle: "P", at: now, showIfWin: true, status: "claimed" }, { uid: "u2", handle: "two", contestTitle: "A", prizeTitle: "P", at: now, showIfWin: false, status: "pending" }]);
  assert.equal(s.contests.length, 1); assert.equal(s.winners.length, 1); assert.equal(s.winners[0].handle, "one"); assert.ok(!JSON.stringify(s).includes("u1"), "no uids in the public summary");
})();

// ================================================================ part 2: the callables
const S = "sites/boomertanger", BASE = `${S}/prizeBox/main`;
let clock = Date.UTC(2026, 9, 17, 18, 0);
const badges = [], xps = [], cloudDeleted = [], order = [];
const fakeGrant = {
  grantBadge: async (uid, id, o) => { badges.push({ uid, id, ...o }); return { granted: !badges.slice(0, -1).some((b) => b.uid === uid && b.id === id) }; },
  grantXp: async (uid, n, o) => { xps.push({ uid, n, ...o }); return { granted: true }; },
};
const adminLogEntry = async (_d, f) => ({ ...f, createdAt: realFs.Timestamp.now() });
let remote = {};
const fakeCloud = {
  PREVIEW_TTL_S: 600,
  uploadParams: ({ type, publicId, context }) => ({ uploadUrl: "https://upload.example/x", fields: { type, public_id: publicId, context, signature: "sig" } }),
  resourceInfo: async (_f, _c, publicId) => remote[publicId] || null,
  previewUrl: (_c, publicId, format) => `https://dl.example/${publicId}.${format}?sig=1`,
};
const recordAssetCreated = async (p) => { const ref = wdb.collection("externalAssets").doc(); await ref.set({ publicId: p.publicId, url: p.url, feature: p.feature, deliveryType: p.deliveryType, linkedDoc: { collection: p.linkedCollection, docId: p.linkedDocId, field: p.linkedField } }); return ref.id; };
const performAssetDeletion = async (assetId) => {
  const ref = wdb.doc(`externalAssets/${assetId}`); const a = (await ref.get()).data();
  const contest = await wdb.doc(a.linkedDoc.collection.replace(/\/entries$/, "")).get();
  order.push({ step: "asset", contestStillThere: contest.exists });
  delete remote[a.publicId]; cloudDeleted.push(a.publicId); await ref.delete(); return { ok: true };
};
const cloudinaryDelete = async ({ publicId }) => { delete remote[publicId]; cloudDeleted.push(publicId); };
const pb = require("../lib/prizeBox").build({ adminLogEntry, now: () => clock, grant: fakeGrant, cloud: fakeCloud, cloudCreds: () => ({ cloudName: "c", apiKey: "k", apiSecret: "s" }), cloudSecrets: [], performAssetDeletion, cloudinaryDelete, recordAssetCreated, fetch: async () => ({}) });
const fns = pb.functions;
const as = (uid, fn, data = {}, token = { email_verified: true }) => fns[fn].run({ auth: uid ? { uid, token } : undefined, data });
const why = async (p) => { try { await p; return "ok"; } catch (e) { return (e.details && e.details.reason) || e.code || e.message; } };
const get = async (p) => (await wdb.doc(p).get()).data();
const col = async (p) => (await wdb.collection(p).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const outboxOf = async (type) => (await col(`${S}/notifyOutbox`)).filter((o) => o.type === type);
const file = (publicId, owner, o = {}) => { remote[publicId] = { format: "png", bytes: 200000, secure_url: `https://res.example/${publicId}.png`, context: { custom: { owner } }, ...o }; };

(async () => {
  // ---------- the people ----------
  await wdb.doc(S).set({ ownerUid: "boss" });
  const person = async (uid, handle, roles = [], extra = {}) => {
    await wdb.doc(`${S}/members/${uid}`).set({ roles, joinedAt: realFs.Timestamp.fromMillis(clock - (extra.days ?? 90) * DAY), ...(extra.member || {}) });
    if (handle) await wdb.doc(`${S}/profiles/${uid}`).set({ handle, displayName: handle });
    await wdb.doc(`users/${uid}`).set({ ageBand: extra.age || "18+" });
  };
  await person("boss", "boomer", ["admin"]); await person("adm", "steward", ["admin"]); await person("mod", "modmoth", ["mod"]);
  await person("owl", "nightowl"); await person("hex", "hexqueen"); await person("teen", "teenghost", [], { age: "13-17" }); await person("fresh", "freshie", [], { days: 2 });
  await person("crew", "crewbie", [], { member: { crewGrade: 2, crewStatus: "active" } }); await person("newbie", null);

  // ================================================================ settings
  assert.equal(await why(as("adm", "prizeSettings", { claimDays: 10 })), "notOwner");
  let r = await as("boss", "prizeSettings", { claimDays: 7, cooldownDays: 30, hereSeconds: 60, mailingAddress: "Sample Box 0000\nSample City" });
  assert.equal(r.settings.claimDays, 7); assert.equal((await get(`${BASE}/private/settings`)).mailingAddress, "Sample Box 0000\nSample City");
  assert.ok(!(await get(BASE)).mailingAddress, "the address is never on the public main doc");
  assert.equal(await why(as("boss", "prizeSettings", { claimDays: 0 })), "claimDays");

  // ================================================================ contests
  const online = { type: "online", title: "Draw Boomer's Nightmare", blurb: "Sample contest.", method: "judge", winnersCount: 2, entryKind: "upload",
    prizes: [{ place: 1, title: "A framed print (sample)", kind: "mailed" }, { place: 2, title: "A Steam game (sample)", kind: "digital", xp: 150 }], opensAt: clock + DAY, closesAt: clock + 14 * DAY, eligibility: [{ kind: "memberDays", n: 7 }] };
  assert.equal(await why(as("owl", "prizeContestSave", online)), "notAdmin");
  assert.equal(await why(as("adm", "prizeContestSave", { type: "live", title: "Break Wheel", method: "wheel", winnersCount: 1, prizes: [{ place: 1, title: "G", kind: "digital" }], draw: { beat: "break1" } })), "notOwner", "live draws are the owner's");
  r = await as("adm", "prizeContestSave", online);
  const cid = r.id; assert.equal(r.slug, "draw-boomer-s-nightmare");
  let ct = await get(`${BASE}/contests/${cid}`);
  assert.equal(ct.status, "draft"); assert.deepEqual(ct.counts, { entries: 0, accepted: 0, received: 0 });
  assert.equal((await as("adm", "prizeContestSave", { ...online, title: "Draw Boomer's Nightmare" })).slug, "draw-boomer-s-nightmare-2", "slugs are unique");
  const dupId = (await col(`${BASE}/contests`)).find((x) => x.slug === "draw-boomer-s-nightmare-2").id;
  assert.equal(await why(as("owl", "prizeEnter", { contestId: cid })), "noContest", "a draft can't be entered");
  r = await as("adm", "prizeContestStatus", { id: cid, action: "publish" });
  assert.equal(r.status, "scheduled", "opens tomorrow");
  assert.equal((await get(`${S}/public/prizeBox`)).contests.find((x) => x.id === cid).status, "scheduled");
  // prizeTick opens it on time and announces it once
  clock += DAY + 60000;
  r = await pb.ops.tick(); assert.equal(r.opened, 1);
  assert.equal((await get(`${BASE}/contests/${cid}`)).status, "open");
  await pb.ops.tick();
  assert.equal((await outboxOf("prize-open")).length, 1, "announced once"); assert.equal((await outboxOf("prize-open"))[0].audience, "members");

  // ================================================================ entries (online upload)
  assert.equal(await why(as("fresh", "prizeEntryParams", { contestId: cid })), "memberDays", "eligibility: member for 7 days");
  assert.equal(await why(as("mod", "prizeEntryParams", { contestId: cid })), "crew", "crew and admins can't win");
  assert.equal(await why(as("crew", "prizeEntryParams", { contestId: cid })), "crew", "active crew by grade");
  await wdb.doc("storageUsage/cloudinary").set({ uploads: "members-paused", fetchedAt: clock });
  assert.equal(await why(as("owl", "prizeEntryParams", { contestId: cid })), "uploadsPaused", "the upload gate comes first");
  await wdb.doc("storageUsage/cloudinary").set({ uploads: "open", fetchedAt: clock });
  r = await as("owl", "prizeEntryParams", { contestId: cid });
  assert.ok(r.publicId.startsWith(`prize-box/entries/${cid}/owl/`)); assert.equal(r.fields.type, "authenticated");
  const p1 = r.publicId;
  assert.equal(await why(as("owl", "prizeEnter", { contestId: cid, publicId: p1, rulesOk: true })), "badFile", "nothing uploaded yet");
  file(p1, "hex");
  assert.equal(await why(as("owl", "prizeEnter", { contestId: cid, publicId: p1, rulesOk: true })), "notOwner", "the file must be the entrant's");
  file(p1, "owl");
  assert.equal(await why(as("owl", "prizeEnter", { contestId: cid, publicId: p1 })), "rules");
  assert.equal(await why(as("owl", "prizeEnter", { contestId: cid, publicId: `prize-box/entries/${cid}/hex/x`, rulesOk: true })), "notOwner");
  r = await as("owl", "prizeEnter", { contestId: cid, publicId: p1, title: "The Thing Under the Desk", rulesOk: true });
  assert.equal(r.replaced, false);
  let e = await get(`${BASE}/contests/${cid}/entries/owl`);
  assert.equal(e.status, "submitted"); assert.equal(e.assetId, p1); assert.equal(e.showIfWin, true);
  assert.equal((await get(`${BASE}/contests/${cid}`)).counts.entries, 1);
  const asset = (await col("externalAssets")).find((a) => a.publicId === p1);
  assert.equal(asset.feature, "prizeBox"); assert.equal(asset.deliveryType, "authenticated"); assert.deepEqual(asset.linkedDoc, { collection: `${BASE}/contests/${cid}/entries`, docId: "owl", field: "assetId" });
  assert.equal((await outboxOf("prize-entry-received")).at(-1).uids[0], "owl");
  assert.deepEqual((await get(`${BASE}/my/owl`)).contestIds, [cid]);
  // replace: the old file goes, the count stays
  clock += 1000;
  const p2 = (await as("owl", "prizeEntryParams", { contestId: cid })).publicId; file(p2, "owl");
  r = await as("owl", "prizeEnter", { contestId: cid, publicId: p2, rulesOk: true, showIfWin: false });
  assert.equal(r.replaced, true); assert.ok(cloudDeleted.includes(p1), "the replaced file is deleted"); assert.equal((await get(`${BASE}/contests/${cid}`)).counts.entries, 1);
  assert.equal((await get(`${BASE}/contests/${cid}/entries/owl`)).showIfWin, false);
  r = await as("owl", "prizeEntryUrl", { contestId: cid });
  assert.match(r.url, new RegExp(`${p2}\\.png`)); assert.equal(r.expiresInS, 600);
  assert.equal(await why(as("hex", "prizeEntryUrl", { contestId: cid, uid: "owl" })), "notYours");
  assert.ok((await as("adm", "prizeEntryUrl", { contestId: cid, uid: "owl" })).url, "admins can view");
  // a second entrant, then a withdraw
  const p3 = (await as("hex", "prizeEntryParams", { contestId: cid })).publicId; file(p3, "hex");
  await as("hex", "prizeEnter", { contestId: cid, publicId: p3, rulesOk: true });
  const p4 = (await as("teen", "prizeEntryParams", { contestId: cid })).publicId; file(p4, "teen");
  await as("teen", "prizeEnter", { contestId: cid, publicId: p4, rulesOk: true });
  assert.equal((await get(`${BASE}/contests/${cid}`)).counts.entries, 3);
  await as("hex", "prizeWithdraw", { contestId: cid });
  assert.equal((await get(`${BASE}/contests/${cid}/entries/hex`)).status, "withdrawn"); assert.ok(cloudDeleted.includes(p3));
  assert.equal((await get(`${BASE}/contests/${cid}`)).counts.entries, 2);
  assert.equal(await why(as("hex", "prizeWithdraw", { contestId: cid })), "noEntry");
  const p5 = (await as("hex", "prizeEntryParams", { contestId: cid })).publicId; file(p5, "hex");
  await as("hex", "prizeEnter", { contestId: cid, publicId: p5, rulesOk: true });
  assert.equal((await get(`${BASE}/contests/${cid}`)).counts.entries, 3, "entering again after a withdraw counts again");
  // review
  assert.equal(await why(as("owl", "prizeEntryReview", { contestId: cid, uid: "hex", decision: "accept" })), "notAdmin");
  assert.equal(await why(as("adm", "prizeEntryReview", { contestId: cid, uid: "hex", decision: "reject" })), "reason");
  await as("adm", "prizeEntryReview", { contestId: cid, uid: "hex", decision: "reject", reason: "It's someone else's drawing." });
  assert.equal((await get(`${BASE}/contests/${cid}/entries/hex`)).rejectReason, "It's someone else's drawing.");
  await as("adm", "prizeEntryReview", { contestId: cid, uid: "owl", decision: "accept" });
  await as("adm", "prizeEntryReview", { contestId: cid, uid: "teen", decision: "accept" });
  assert.equal((await get(`${BASE}/contests/${cid}`)).counts.accepted, 2);
  // prizeMine for a contest page
  r = await as("owl", "prizeMine", { contestId: cid });
  assert.equal(r.eligible, true); assert.equal(r.entry.status, "accepted"); assert.equal(r.entry.hasFile, true);
  r = await as("fresh", "prizeMine", { contestId: cid });
  assert.equal(r.eligible, false); assert.equal(r.reason, "memberDays"); assert.match(r.message, /7 days/);
  assert.equal(await why(as("owl", "prizeMine", { contestId: dupId })), "noContest", "drafts are hidden from members");

  // reminders, then close on time (judged → judging)
  clock = (await get(`${BASE}/contests/${cid}`)).closesAt.toMillis() - 20 * 60 * 60 * 1000;
  await pb.ops.tick(); await pb.ops.tick();
  assert.equal((await outboxOf("prize-reminder")).length, 1, "the 24 h reminder, once");
  clock += 19.5 * 60 * 60 * 1000;
  await pb.ops.tick();
  assert.equal((await outboxOf("prize-reminder")).length, 2, "then the 1 h reminder");
  assert.equal(await why(as("owl", "prizeJudge", { contestId: cid, places: [] })), "notOwner");
  assert.equal(await why(as("boss", "prizeJudge", { contestId: cid, places: [{ place: 1, uid: "owl" }] })), "status", "close entries first");
  clock += 60 * 60 * 1000;
  r = await pb.ops.tick(); assert.equal(r.closed, 1);
  assert.equal((await get(`${BASE}/contests/${cid}`)).status, "judging");
  assert.equal(await why(as("owl", "prizeEnter", { contestId: cid, publicId: p2, rulesOk: true })), "closed");

  // ================================================================ judging, winners, claims
  assert.equal(await why(as("boss", "prizeJudge", { contestId: cid, places: [{ place: 1, uid: "hex" }] })), "places", "a rejected entry can't win");
  assert.equal(await why(as("boss", "prizeJudge", { contestId: cid, places: [{ place: 1, uid: "owl" }, { place: 1, uid: "teen" }] })), "places", "one winner per place");
  r = await as("boss", "prizeJudge", { contestId: cid, places: [{ place: 1, uid: "teen" }, { place: 2, uid: "owl" }] });
  assert.equal(r.winners.length, 2);
  ct = await get(`${BASE}/contests/${cid}`); assert.equal(ct.status, "won");
  const w1 = await get(`${BASE}/winners/${cid}_1`), w2 = await get(`${BASE}/winners/${cid}_2`);
  assert.equal(w1.uid, "teen"); assert.equal(w1.kind, "mailed"); assert.equal(w1.status, "pending"); assert.equal(w1.claimBy.toMillis(), clock + 7 * DAY);
  assert.equal(w2.showIfWin, false, "owl said no to showing");
  assert.equal(badges.filter((b) => b.id === "prize-box-winner").length, 2); assert.deepEqual(xps.map((x) => [x.uid, x.n]), [["owl", 150]], "prize XP");
  assert.equal((await get(`${S}/profiles/teen`)).prizeWins, 1);
  const acts = (await col("activityLog")).filter((a) => a.type === "contest-winner");
  assert.equal(acts.length, 1, "only the winner who said yes is posted"); assert.match(acts[0].summary, /@teenghost/);
  const sum = await get(`${S}/public/prizeBox`);
  assert.equal(sum.winners.length, 1); assert.equal(sum.winners[0].handle, "teenghost"); assert.ok(!JSON.stringify(sum).includes("\"teen\""), "no uid in the summary");
  assert.ok((await outboxOf("prize-results")).find((o) => o.audience === "uids").uids.length >= 3, "every entrant hears the results");
  assert.ok((await outboxOf("prize-winner")).every((o) => !JSON.stringify(o.payload).match(/address|Sample Box/)), "no private data in payloads");
  // claim: under 18 needs a parent's OK, mailed needs a US address
  assert.equal(await why(as("owl", "prizeClaim", { winnerId: `${cid}_1` })), "notYours");
  assert.equal(await why(as("teen", "prizeClaim", { winnerId: `${cid}_1`, address: { name: "S", line1: "1 St", city: "C", state: "MN", zip: "00000" } })), "parentOk");
  assert.equal(await why(as("teen", "prizeClaim", { winnerId: `${cid}_1`, parentOk: true, address: { name: "S", line1: "1 St", city: "C", state: "ON", zip: "00000", country: "CA" } })), "usOnly");
  r = await as("teen", "prizeClaim", { winnerId: `${cid}_1`, parentOk: true, address: { name: "Sample Person", line1: "1 Sample St", city: "Sample City", state: "MN", zip: "00000" } });
  assert.equal(r.status, "claimed");
  assert.equal((await get(`${BASE}/winners/${cid}_1/private/claim`)).address.city, "Sample City"); assert.ok(!(await get(`${BASE}/winners/${cid}_1`)).address, "the address only lives in private/claim");
  assert.equal(await why(as("teen", "prizeClaim", { winnerId: `${cid}_1`, parentOk: true })), "claimed");
  // claim admin (owner)
  assert.equal(await why(as("adm", "prizeClaimAdmin", { winnerId: `${cid}_1`, action: "showAddress" })), "notOwner");
  const logsBefore = (await col("adminLog")).filter((l) => l.action === "show-address").length;
  r = await as("boss", "prizeClaimAdmin", { winnerId: `${cid}_1`, action: "showAddress" });
  assert.equal(r.address.line1, "1 Sample St"); assert.equal((await col("adminLog")).filter((l) => l.action === "show-address").length, logsBefore + 1, "every look is logged");
  assert.ok(!JSON.stringify((await col("adminLog")).filter((l) => l.action === "show-address")).includes("Sample St"), "the log never holds the address");
  assert.equal(await why(as("boss", "prizeClaimAdmin", { winnerId: `${cid}_1`, action: "setCode", code: "X" })), "kind");
  await as("boss", "prizeClaimAdmin", { winnerId: `${cid}_1`, action: "markShipped", tracking: "SAMPLE123" });
  assert.equal((await get(`${BASE}/winners/${cid}_1`)).status, "shipped"); assert.equal((await outboxOf("prize-shipped")).length, 1);
  await as("boss", "prizeClaimAdmin", { winnerId: `${cid}_2`, action: "setCode", code: "SAMPLE-KEY-0000" });
  r = await as("owl", "prizeMine", {});
  assert.equal(r.toClaim.length, 1); assert.equal(r.toClaim[0].winnerId, `${cid}_2`); assert.equal(r.toClaim[0].code, undefined, "no code before claiming");
  r = await as("owl", "prizeClaim", { winnerId: `${cid}_2` });
  assert.equal(r.code, "SAMPLE-KEY-0000", "the code shows after claiming");
  r = await as("owl", "prizeMine", {});
  assert.equal(r.toClaim.length, 0); assert.equal(r.wins[0].code, "SAMPLE-KEY-0000"); assert.equal(r.entries[0].contestTitle, "Draw Boomer's Nightmare");

  // ================================================================ mail-in, random draw, claim expiry, forfeit and redraw
  clock += DAY;
  const mail = await as("adm", "prizeContestSave", { type: "mail", title: "Mail-in art (sample)", method: "random", winnersCount: 1, prizes: [{ place: 1, title: "Store credit (sample)", kind: "storeCode" }], opensAt: clock - 1000, closesAt: Date.UTC(2026, 11, 1, 5, 59) });
  const mid = mail.id;
  await as("adm", "prizeContestStatus", { id: mid, action: "publish" });
  assert.equal((await get(`${BASE}/contests/${mid}`)).status, "open");
  assert.equal(await why(as("owl", "prizeGetCode", { contestId: mid })), "rules");
  r = await as("owl", "prizeGetCode", { contestId: mid, rulesOk: true });
  assert.match(r.code, /^PB-/); assert.equal(r.mailingAddress, "Sample Box 0000\nSample City");
  const owlCode = r.code;
  assert.equal((await as("owl", "prizeGetCode", { contestId: mid, rulesOk: true })).code, owlCode, "one code per member");
  const hexCode = (await as("hex", "prizeGetCode", { contestId: mid, rulesOk: true })).code;
  const teenCode = (await as("teen", "prizeGetCode", { contestId: mid, rulesOk: true })).code;
  assert.deepEqual(await get(`${BASE}/codes/${owlCode}`), { contestId: mid, uid: "owl", createdAt: (await get(`${BASE}/codes/${owlCode}`)).createdAt });
  assert.equal(await why(as("owl", "prizeMailLog", { action: "lookup", code: owlCode })), "notAdmin");
  r = await as("adm", "prizeMailLog", { action: "lookup", code: owlCode.toLowerCase().replace("-", " ") });
  assert.equal(r.found, true); assert.equal(r.handle, "nightowl");
  assert.equal((await as("adm", "prizeMailLog", { action: "lookup", code: "PB-ZZZZ" })).found, false);
  r = await as("adm", "prizeMailLog", { action: "receive", code: owlCode, postmarkedOn: "2026-11-25" });
  assert.equal(r.late, false); assert.equal((await get(`${BASE}/contests/${mid}/entries/owl`)).status, "received");
  r = await as("adm", "prizeMailLog", { action: "receive", code: hexCode, postmarkedOn: "2026-12-02" });
  assert.equal(r.late, true, "postmarked after the deadline"); assert.equal((await get(`${BASE}/contests/${mid}/entries/hex`)).status, "rejected");
  await as("adm", "prizeMailLog", { action: "receive", code: teenCode, postmarkedOn: "2026-11-30" });
  assert.equal((await as("adm", "prizeMailLog", { action: "receive", code: owlCode, postmarkedOn: "2026-11-25" })).already, true);
  assert.equal(await why(as("adm", "prizeMailLog", { action: "unmatched", note: "" })), "note");
  await as("adm", "prizeMailLog", { action: "unmatched", note: "A drawing of a moth, no code on it (sample).", postmarkedOn: "2026-11-20", contestId: mid });
  assert.equal((await col(`${BASE}/mailLog`)).filter((m) => m.kind === "unmatched").length, 1);
  assert.equal((await get(`${BASE}/contests/${mid}`)).counts.received, 2);
  clock = Date.UTC(2026, 11, 1, 6); await pb.ops.tick();
  assert.equal((await get(`${BASE}/contests/${mid}`)).status, "closed", "a random contest closes, then Boomer draws");
  assert.equal(await why(as("boss", "prizeJudge", { contestId: mid, places: [] })), "method");
  r = await as("boss", "prizeJudge", { contestId: mid, random: true });
  const firstWinner = r.winners[0].handle;
  assert.ok(["nightowl", "teenghost"].includes(firstWinner), "only received, eligible entries are drawn");
  // the claim window ends: a reminder a day before, then forfeited with Boomer's redraw prompt
  clock += 6.5 * DAY; await pb.ops.tick();
  assert.equal((await outboxOf("prize-claim-reminder")).filter((o) => o.payload.event === "reminder").length, 1);
  clock += DAY; await pb.ops.tick();
  assert.equal((await get(`${BASE}/winners/${mid}_1`)).status, "forfeited");
  assert.equal((await outboxOf("prize-claim-reminder")).filter((o) => o.payload.event === "expired").length, 1);
  r = await as("boss", "prizeClaimAdmin", { winnerId: `${mid}_1`, action: "redraw" });
  assert.equal(r.redraw, "drawn"); assert.notEqual(r.handle, firstWinner, "the redraw skips the first winner");
  assert.equal((await get(`${BASE}/winners/${r.winnerId}`)).status, "pending");

  // ================================================================ delete: Cloudinary first, then records, then the contest, then its events
  assert.equal(await why(as("adm", "prizeContestStatus", { id: cid, action: "delete" })), "notOwner");
  order.length = 0;
  const assetsBefore = (await col("externalAssets")).filter((a) => a.linkedDoc.collection.includes(cid)).length;
  assert.ok(assetsBefore >= 2);
  r = await as("boss", "prizeContestStatus", { id: cid, action: "delete" });
  assert.equal(r.deleted, true);
  assert.ok(order.length >= 2 && order.every((o) => o.contestStillThere), "Cloudinary goes while the contest is still there");
  assert.equal((await col("externalAssets")).filter((a) => a.linkedDoc.collection.includes(cid)).length, 0);
  assert.equal(await get(`${BASE}/contests/${cid}`), undefined); assert.equal((await col(`${BASE}/contests/${cid}/entries`)).length, 0);
  assert.equal((await col(`${BASE}/winners`)).filter((w) => w.contestId === cid).length, 0);
  assert.equal((await col("activityLog")).filter((a) => a.contestId === cid).length, 0);
  assert.ok(!(await get(`${BASE}/my/owl`)).contestIds.includes(cid));
  assert.ok((await col("adminLog")).some((l) => l.feature === "prizeBox" && l.action === "delete"));

  console.log("check-prize-box: ok");
})().catch((e) => { console.error(e); process.exit(1); });
