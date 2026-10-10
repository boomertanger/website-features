#!/usr/bin/env node
// functions/scripts/check-lab-wiring.js: Feature Lab's callables (lib/lab/*, docs/specs/feature-lab.md §4) run against the in-memory Firestore with fakes for
// Night Shift and the Trophy Room (and the REAL Gears for the review reward). No network, no credentials, no deploy.   npm run check
// Sections: submit, vote, comment, triage and its rewards, hide, delete, the labIdea edit kind, and who may do what.
const assert = require("assert/strict");
const { makeDb } = require("./fixtures/fake-firestore");
const admin = require("firebase-admin");
process.env.GCLOUD_PROJECT ||= "boomertanger-staging";
process.env.FIREBASE_CONFIG ||= JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const wdb = makeDb(); const realFs = admin.firestore;
const fakeFs = () => wdb; fakeFs.Timestamp = realFs.Timestamp; fakeFs.FieldValue = realFs.FieldValue;
Object.defineProperty(admin, "firestore", { value: fakeFs, configurable: true, writable: true });

const S = "sites/boomertanger";
const BASE = `${S}/lab/main`;
let clock = Date.UTC(2026, 9, 12, 15, 0);
const nsEvents = [], badges = [], gearsCalls = [];
const fakeFactory = { recordFactoryEvent: async (uid, type, params, ref, opts) => { nsEvents.push({ uid, type, params, ref, opts }); return { counted: true }; } };
const badgeLedger = new Set();
const fakeGrant = { grantBadge: async (uid, id, o) => { badges.push({ uid, id, ...o }); const k = `${uid}:${id}:${o.ref}`; if (badgeLedger.has(k)) return { granted: false, reason: "paid" }; badgeLedger.add(k); return { granted: true }; } };
const realHooks = require("../lib/crew/hooks");
const hooks = { noteLabReview: async (uid, id) => { const r = await realHooks.noteLabReview(uid, id); gearsCalls.push({ uid, id, r }); return r; } };
const adminLogEntry = async (_d, f) => ({ ...f, createdAt: realFs.Timestamp.now() });
const lab = require("../lib/lab").build({ adminLogEntry, now: () => clock, factory: fakeFactory, grant: fakeGrant, crewHooks: hooks });
const fns = lab.functions;
const as = (uid, fn, data = {}, token = { email_verified: true }) => fns[fn].run({ auth: uid ? { uid, token } : undefined, data });
const why = async (p) => { try { await p; return "ok"; } catch (e) { return (e.details && e.details.reason) || e.code || e.message; } };
const get = async (p) => (await wdb.doc(p).get()).data();
const col = async (p) => (await wdb.collection(p).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const edit = (uid, data) => lab.editLabIdea({ auth: uid ? { uid, token: { email_verified: true } } : undefined, data });
let tok = 0; const token = () => `tok_${String(++tok).padStart(8, "0")}`;
const idea = (o = {}) => ({ title: "Show the queue on stream", description: "A panel with the next three games.", area: "stream", ...o });

(async () => {
  // ---------- the people ----------
  await wdb.doc(S).set({ ownerUid: "boss" });
  const person = async (uid, handle, roles = [], extra = {}) => {
    await wdb.doc(`${S}/members/${uid}`).set({ roles });
    if (handle) await wdb.doc(`${S}/profiles/${uid}`).set({ handle, displayName: extra.name || handle });
  };
  await person("boss", "boomer", ["admin"]);
  await person("adm1", "steward", ["admin"]);       // A1 Steward
  await person("adm2", "overseer", ["admin"]);      // A2 Overseer
  await person("adm3", "righthand", ["admin"]);     // A3 Right Hand
  await person("mod1", "modmoth", ["mod"]);
  await person("gbo", "gbo", [], { name: "Gbo the Great" });
  await person("fan2", "fan2");
  await person("fan3", "fan3");
  await person("newbie", null);                      // signed in, signup unfinished
  const roster = (uid, grade) => wdb.doc(`${S}/crew/main/roster/${uid}`).set({ track: "admin", grade, status: "active", handle: null });
  await roster("adm1", 1); await roster("adm2", 2); await roster("adm3", 3);
  await wdb.doc(`${S}/crew/main/roster/mod1`).set({ track: "mod", grade: 3, status: "active" });

  // ================================================================ submit
  assert.equal(await why(as(null, "labSubmit", { ...idea(), token: token() })), "signedOut");
  assert.equal(await why(as("newbie", "labSubmit", { ...idea(), token: token() })), "needsSignup");
  assert.equal(await why(as("gbo", "labSubmit", { ...idea(), token: token() }, { email_verified: false })), "emailNotVerified");
  assert.equal(await why(as("gbo", "labSubmit", { ...idea(), title: "no", token: token() })), "invalid");
  assert.equal(await why(as("gbo", "labSubmit", { ...idea(), area: "arcade", token: token() })), "invalid");
  assert.equal((await col(`${BASE}/ideas`)).length, 0, "nothing was made by the refused ones");

  const t1 = token();
  const r1 = await as("gbo", "labSubmit", { ...idea(), token: t1 });
  assert.equal(r1.ok, true); assert.ok(r1.id); assert.equal(r1.counted, true);
  const i1 = await get(`${BASE}/ideas/${r1.id}`);
  assert.equal(i1.status, "submitted"); assert.equal(i1.voteCount, 1); assert.equal(i1.commentCount, 0); assert.equal(i1.hidden, false); assert.equal(i1.priority, null);
  assert.deepEqual(i1.by, { uid: "gbo", handle: "gbo", name: "Gbo the Great" }, "the author's snapshot");
  assert.equal(i1.statusHistory.length, 1); assert.equal(i1.statusHistory[0].status, "submitted"); assert.deepEqual(i1.statusHistory[0].changedBy, { uid: "gbo", handle: "gbo" });
  assert.ok(await get(`${BASE}/ideas/${r1.id}/votes/gbo`), "the author's vote is recorded");
  assert.deepEqual((await get(`${BASE}/myVotes/gbo`)).ids, [r1.id]);
  assert.ok((await get(`${BASE}/submitTokens/${t1}`)).expireAt, "the token expires");
  assert.deepEqual(nsEvents.at(-1), { uid: "gbo", type: "lab", params: { action: "post" }, ref: `post-${r1.id}`, opts: { keep: true } }, "Night Shift: post");
  let acts = (await col("activityLog")).filter((a) => a.feature === "feature-lab" && a.ideaId === r1.id);
  assert.equal(acts.length, 1); assert.equal(acts[0].type, "submitted"); assert.equal(acts[0].link, `/feature-lab?idea=${r1.id}`);
  // a double click is the same idea and costs nothing
  const again = await as("gbo", "labSubmit", { ...idea(), token: t1 });
  assert.equal(again.id, r1.id); assert.equal(again.already, true);
  assert.equal((await col(`${BASE}/ideas`)).length, 1); assert.equal(nsEvents.filter((e) => e.params.action === "post").length, 1, "no second event");
  assert.equal(await why(as("fan2", "labSubmit", { ...idea(), token: t1 })), "token", "someone else's token is refused");
  // 3 a day; the 4th is refused with Slow down; the next Central day opens again
  await as("gbo", "labSubmit", { ...idea({ title: "Second idea here" }), token: token() });
  await as("gbo", "labSubmit", { ...idea({ title: "Third idea here" }), token: token() });
  const slow = await as("gbo", "labSubmit", { ...idea({ title: "Fourth idea here" }), token: token() }).catch((e) => e);
  assert.equal(slow.details.reason, "rateLimit"); assert.match(slow.message, /Slow down/);
  assert.equal((await col(`${BASE}/ideas`)).length, 3);
  assert.equal(await why(as("gbo", "labSubmit", { ...idea({ title: "Same token again" }), token: t1 })), "ok", "a repeat of an old token still costs nothing at the limit");
  clock += 16 * 3600000;   // Central day turned (01:00 the next day in Chicago)
  assert.equal(await why(as("gbo", "labSubmit", { ...idea({ title: "Fourth idea next day" }), token: token() })), "ok");
  // the owner and admins skip the limits: an admin and the owner post a 4th idea in a day; a member still gets Slow down
  for (let n = 1; n <= 4; n++) assert.equal(await why(as("adm1", "labSubmit", { ...idea({ title: `Admin idea number ${n}` }), token: token() })), "ok", `admin idea ${n}`);
  await person("own2", "owner2");                   // an owner with no admin role: ownerUid alone is enough
  await wdb.doc(S).set({ ownerUid: "own2" });
  for (let n = 1; n <= 4; n++) assert.equal(await why(as("own2", "labSubmit", { ...idea({ title: `Owner idea number ${n}` }), token: token() })), "ok", `owner idea ${n}`);
  await wdb.doc(S).set({ ownerUid: "boss" });
  await person("fan4", "fan4");
  for (let n = 1; n <= 3; n++) await as("fan4", "labSubmit", { ...idea({ title: `Fan idea number ${n}` }), token: token() });
  const slow2 = await as("fan4", "labSubmit", { ...idea({ title: "Fan idea number 4" }), token: token() }).catch((e) => e);
  assert.equal(slow2.details && slow2.details.reason, "rateLimit", "a member still gets Slow down"); assert.match(slow2.message, /Slow down/);
  const ideas = await col(`${BASE}/ideas`);
  const second = ideas.find((i) => i.title === "Second idea here"), third = ideas.find((i) => i.title === "Third idea here");

  // ================================================================ vote
  assert.equal(await why(as(null, "labVote", { id: r1.id, on: true })), "signedOut");
  assert.equal(await why(as("newbie", "labVote", { id: r1.id, on: true })), "needsSignup");
  assert.equal(await why(as("fan2", "labVote", { id: "nope", on: true })), "noIdea");
  let vr = await as("fan2", "labVote", { id: r1.id, on: true });
  assert.equal(vr.voteCount, 2); assert.equal(vr.voted, true); assert.equal(vr.counted, true);
  assert.deepEqual(nsEvents.at(-1), { uid: "fan2", type: "lab", params: { action: "vote" }, ref: `vote-${r1.id}`, opts: { keep: true } });
  vr = await as("fan2", "labVote", { id: r1.id, on: true });
  assert.equal(vr.voteCount, 2, "voting twice changes nothing"); assert.equal(vr.counted, false);
  assert.deepEqual((await get(`${BASE}/myVotes/fan2`)).ids, [r1.id]);
  vr = await as("fan2", "labVote", { id: r1.id, on: false });
  assert.equal(vr.voteCount, 1); assert.equal(vr.voted, false);
  assert.deepEqual((await get(`${BASE}/myVotes/fan2`)).ids, []); assert.equal(await get(`${BASE}/ideas/${r1.id}/votes/fan2`), undefined);
  vr = await as("fan2", "labVote", { id: r1.id, on: false }); assert.equal(vr.voteCount, 1, "taking back a vote that was never given changes nothing");
  // a member voting on their own idea never counts for Night Shift (it stays voted by the author)
  const before = nsEvents.length;
  await as("gbo", "labVote", { id: r1.id, on: false }); const own = await as("gbo", "labVote", { id: r1.id, on: true });
  assert.equal(own.counted, false); assert.equal(nsEvents.length, before, "no Night Shift event for your own idea");
  await as("fan2", "labVote", { id: r1.id, on: true });
  // closed ideas refuse votes; hidden ones too
  await wdb.doc(`${BASE}/ideas/${second.id}`).update({ status: "shipped" });
  assert.equal(await why(as("fan3", "labVote", { id: second.id, on: true })), "closed");
  await wdb.doc(`${BASE}/ideas/${second.id}`).update({ status: "declined" });
  assert.equal(await why(as("fan3", "labVote", { id: second.id, on: true })), "closed");
  await wdb.doc(`${BASE}/ideas/${second.id}`).update({ status: "submitted", hidden: true });
  assert.equal(await why(as("fan3", "labVote", { id: second.id, on: true })), "hidden");
  await wdb.doc(`${BASE}/ideas/${second.id}`).update({ hidden: false });
  // 60 vote changes an hour
  let n = 0, tripped = null;
  for (let k = 0; k < 70 && !tripped; k++) { try { await as("fan3", "labVote", { id: third.id, on: k % 2 === 0 }); n++; } catch (e) { tripped = e; } }
  assert.equal(tripped && tripped.details.reason, "rateLimit"); assert.equal(n, 57, "60 an hour, and the 3 refused tries above counted too");
  clock += 3600000;
  assert.equal(await why(as("fan3", "labVote", { id: third.id, on: true })), "ok", "a new hour");

  // ================================================================ comment
  assert.equal(await why(as(null, "labComment", { id: r1.id, text: "hi" })), "signedOut");
  assert.equal(await why(as("fan2", "labComment", { id: r1.id, text: "   " })), "invalid");
  assert.equal(await why(as("fan2", "labComment", { id: "nope", text: "hi" })), "noIdea");
  const c1 = await as("fan2", "labComment", { id: r1.id, text: "Great idea, please do it." });
  let cd = await get(`${BASE}/ideas/${r1.id}/comments/${c1.commentId}`);
  assert.equal(cd.text, "Great idea, please do it."); assert.equal(cd.staffTag, null); assert.equal(cd.hidden, false); assert.deepEqual(cd.by, { uid: "fan2", handle: "fan2", name: "fan2" });
  const c2 = await as("mod1", "labComment", { id: r1.id, text: "Noted by the crew." });
  assert.equal((await get(`${BASE}/ideas/${r1.id}/comments/${c2.commentId}`)).staffTag, "mod");
  const c3 = await as("adm1", "labComment", { id: r1.id, text: "We are looking at it." });
  assert.equal((await get(`${BASE}/ideas/${r1.id}/comments/${c3.commentId}`)).staffTag, "admin");
  assert.equal((await get(`${BASE}/ideas/${r1.id}`)).commentCount, 3, "the count follows the comments");
  await wdb.doc(`${BASE}/ideas/${third.id}`).update({ hidden: true });
  assert.equal(await why(as("fan2", "labComment", { id: third.id, text: "hi there" })), "noIdea", "a hidden idea takes no comments");
  await wdb.doc(`${BASE}/ideas/${third.id}`).update({ hidden: false });
  let cn = 0, ctrip = null;
  for (let k = 0; k < 30 && !ctrip; k++) { try { await as("fan3", "labComment", { id: third.id, text: `comment number ${k}` }); cn++; } catch (e) { ctrip = e; } }
  assert.equal(ctrip && ctrip.details.reason, "rateLimit"); assert.equal(cn, 20);

  // ================================================================ triage and its rewards
  const triage = (uid, data) => as(uid, "labTriage", data);
  assert.equal(await why(triage("gbo", { id: r1.id, status: "planned", before: { status: "submitted" } })), "notAdmin");
  assert.equal(await why(triage("mod1", { id: r1.id, status: "planned", before: { status: "submitted" } })), "notAdmin", "mods do not triage");
  assert.equal(await why(triage("adm1", { id: r1.id, before: { status: "submitted" } })), "nothing", "an empty save is refused");
  assert.equal(await why(triage("adm1", { id: "nope", status: "planned", before: { status: "submitted" } })), "noIdea");
  assert.equal(await why(triage("adm1", { id: r1.id, status: "planned", before: { status: "under_review" } })), "conflict");
  assert.equal(await why(triage("adm1", { id: r1.id, status: "done", before: { status: "submitted" } })), "invalid");
  const outBefore = (await col(`${S}/notifyOutbox`)).length;
  // 1. out of Submitted: history, activity, outbox, +3 Gears to the admin
  let tr = await triage("adm2", { id: r1.id, status: "under_review", note: "Looks promising.", before: { status: "submitted", priority: null } });
  assert.equal(tr.statusChanged, true);
  let t = await get(`${BASE}/ideas/${r1.id}`);
  assert.equal(t.status, "under_review"); assert.equal(t.statusHistory.length, 2); assert.equal(t.statusHistory[1].status, "under_review"); assert.equal(t.statusHistory[1].note, "Looks promising.");
  assert.deepEqual(t.statusHistory[1].changedBy, { uid: "adm2", handle: "overseer" }); assert.ok(t.statusChangedAt); assert.ok(t.firstTriagedAt); assert.equal(t.shippedAt, undefined);
  acts = (await col("activityLog")).filter((a) => a.ideaId === r1.id);
  assert.deepEqual(acts.map((a) => a.type).sort(), ["status-changed", "submitted"]);
  assert.equal(acts.find((a) => a.type === "status-changed").status, "under_review"); assert.equal(acts.find((a) => a.type === "status-changed").link, `/feature-lab?idea=${r1.id}`);
  let ob = (await col(`${S}/notifyOutbox`)).filter((o) => o.type === "report-update");
  assert.equal(ob.length, outBefore + 1); assert.deepEqual(ob.at(-1).uids, ["gbo"]); assert.equal(ob.at(-1).audience, "uids"); assert.equal(ob.at(-1).payload.status, "under_review"); assert.equal(ob.at(-1).status, "pending");
  assert.equal(gearsCalls.length, 1); assert.equal(gearsCalls[0].r.granted, true, JSON.stringify(gearsCalls[0].r));
  const gear = await get(`${S}/crew/main/gears/labReview:${r1.id}:adm2`);
  assert.equal(gear.amount, 3); assert.equal(gear.source, "labReview"); assert.equal(gear.uid, "adm2");
  // 2. a note alone: one note entry, no status change, no outbox, no new reward
  const obCount = (await col(`${S}/notifyOutbox`)).length;
  await triage("adm1", { id: r1.id, note: "Waiting on the Vault work.", before: { status: "under_review", priority: null } });
  t = await get(`${BASE}/ideas/${r1.id}`);
  assert.equal(t.statusHistory.length, 3); assert.equal(t.statusHistory[2].kind, "note"); assert.equal(t.status, "under_review");
  assert.equal((await col(`${S}/notifyOutbox`)).length, obCount, "a note alone tells nobody");
  assert.equal(gearsCalls.length, 1);
  // 3. a priority alone adds nothing to the history
  await triage("adm1", { id: r1.id, priority: "high", before: { status: "under_review", priority: null } });
  t = await get(`${BASE}/ideas/${r1.id}`); assert.equal(t.priority, "high"); assert.equal(t.statusHistory.length, 3);
  // 4. Shipped: The Architect for the author, Night Shift event, activity, outbox
  tr = await triage("adm1", { id: r1.id, status: "shipped", before: { status: "under_review", priority: "high" } });
  assert.equal(tr.rewards.architect, true);
  assert.deepEqual(badges.at(-1), { uid: "gbo", id: "architect", feature: "lab", ref: r1.id, grantedBy: "adm1" });
  assert.deepEqual(nsEvents.at(-1), { uid: "gbo", type: "lab", params: { action: "shipped" }, ref: `shipped-${r1.id}`, opts: { keep: true } });
  t = await get(`${BASE}/ideas/${r1.id}`); assert.ok(t.shippedAt);
  acts = (await col("activityLog")).filter((a) => a.ideaId === r1.id); assert.ok(acts.some((a) => a.type === "shipped"));
  assert.equal(gearsCalls.length, 1, "Shipped by a second admin pays no second review");
  // 5. back and shipped again: nothing is paid twice
  await triage("adm1", { id: r1.id, status: "planned", before: { status: "shipped", priority: "high" } });
  const nsBefore = nsEvents.filter((e) => e.params.action === "shipped").length, badgeBefore = badges.length;
  tr = await triage("adm1", { id: r1.id, status: "shipped", before: { status: "planned", priority: "high" } });
  assert.equal(tr.rewards.architect, false, "shipped again does not grant again");
  assert.equal(badges.length, badgeBefore, "the grant is not even asked for"); assert.equal(nsEvents.filter((e) => e.params.action === "shipped").length, nsBefore);
  assert.equal((await get(`${BASE}/ideas/${r1.id}`)).statusHistory.length, 6, "each real change added exactly one entry");
  // 6. adminLog: every triage, by feature key and item path
  const logs = (await col("adminLog")).filter((l) => l.feature === "featureLab" && l.itemPath === `${BASE}/ideas/${r1.id}`);
  assert.equal(logs.filter((l) => l.action === "triage").length, 6);
  assert.deepEqual(logs.find((l) => l.reason === "Looks promising.").changes.status, { before: "submitted", after: "under_review" });
  // 7. an idea hidden from the public gives no activity event
  await wdb.doc(`${BASE}/ideas/${second.id}`).update({ hidden: true });
  await triage("adm1", { id: second.id, status: "planned", before: { status: "submitted" } });
  assert.equal((await col("activityLog")).filter((a) => a.ideaId === second.id && a.type === "status-changed").length, 0, "never for a hidden idea");
  await wdb.doc(`${BASE}/ideas/${second.id}`).update({ hidden: false });

  // ================================================================ hide and unhide
  assert.equal(await why(as("gbo", "labHide", { id: r1.id, hidden: true, reason: "x" })), "notStaff");
  assert.equal(await why(as("mod1", "labHide", { id: r1.id, hidden: true })), "reason", "a reason is required to hide");
  assert.equal(await why(as("mod1", "labHide", { id: r1.id, commentId: "nope", hidden: true, reason: "spam" })), "noComment");
  const h1 = await as("mod1", "labHide", { id: r1.id, commentId: c1.commentId, hidden: true, reason: "off topic" });
  assert.equal(h1.changed, true);
  cd = await get(`${BASE}/ideas/${r1.id}/comments/${c1.commentId}`); assert.equal(cd.hidden, true); assert.equal(cd.hiddenReason, "off topic"); assert.deepEqual(cd.hiddenBy, { uid: "mod1", handle: "modmoth" });
  assert.equal((await get(`${BASE}/ideas/${r1.id}`)).commentCount, 2, "the count is the comments people can see");
  assert.equal((await as("mod1", "labHide", { id: r1.id, commentId: c1.commentId, hidden: true, reason: "again" })).changed, false, "hiding twice is a no-op");
  await as("adm1", "labHide", { id: r1.id, commentId: c1.commentId, hidden: false });
  cd = await get(`${BASE}/ideas/${r1.id}/comments/${c1.commentId}`); assert.equal(cd.hidden, false); assert.equal(cd.hiddenReason, undefined); assert.equal(cd.hiddenBy, undefined);
  assert.equal((await get(`${BASE}/ideas/${r1.id}`)).commentCount, 3);
  await as("mod1", "labHide", { id: third.id, hidden: true, reason: "duplicate" });
  t = await get(`${BASE}/ideas/${third.id}`); assert.equal(t.hidden, true); assert.equal(t.hiddenReason, "duplicate");
  await as("mod1", "labHide", { id: third.id, hidden: false }); assert.equal((await get(`${BASE}/ideas/${third.id}`)).hidden, false);
  const hl = (await col("adminLog")).filter((l) => l.feature === "featureLab" && ["hide", "unhide"].includes(l.action));
  assert.deepEqual(hl.map((l) => l.action), ["hide", "unhide", "hide", "unhide"]); assert.equal(hl[0].reason, "off topic"); assert.equal(hl[0].details.commentId, c1.commentId);

  // ================================================================ edit (adminEditItem kind labIdea)
  assert.equal(await why(edit("gbo", { id: r1.id, changes: { title: "Hacked title" }, before: { title: i1.title } })), "notAdmin");
  const nLog = (await col("adminLog")).length;
  assert.deepEqual(await edit("adm1", { id: second.id, changes: { title: "Second idea here" }, before: { title: "Second idea here" } }), { ok: true, changed: false });
  assert.equal((await col("adminLog")).length, nLog, "a no-op edit logs nothing");
  assert.equal(await why(edit("adm1", { id: second.id, changes: { title: "A new title" }, before: { title: "Someone else's" } })), "conflict");
  assert.equal(await why(edit("adm1", { id: second.id, changes: { title: "ab" }, before: { title: "Second idea here" } })), "invalid");
  assert.equal(await why(edit("adm1", { id: second.id, changes: { status: "shipped" }, before: { status: "submitted" } })), "invalid", "status is not an edit");
  assert.equal(await why(edit("adm1", { id: second.id, changes: { title: "x title here" } })), "args", "before is required");
  const er = await edit("adm1", { id: second.id, changes: { title: "A clearer title", area: "site" }, before: { title: "Second idea here", area: "stream" }, reason: "typo" });
  assert.equal(er.changed, true);
  t = await get(`${BASE}/ideas/${second.id}`);
  assert.equal(t.title, "A clearer title"); assert.equal(t.area, "site"); assert.equal(t.editCount, 1); assert.ok(t.editedAt); assert.equal(t.status, "planned", "the status is not touched by an edit"); assert.deepEqual(t.by, second.by, "the author is never touched");
  const el = (await col("adminLog")).find((l) => l.action === "edit" && l.itemPath === `${BASE}/ideas/${second.id}`);
  assert.deepEqual(el.changes.title, { before: "Second idea here", after: "A clearer title" }); assert.equal(el.reason, "typo"); assert.equal(el.feature, "featureLab");

  // ================================================================ delete
  assert.equal(await why(as("gbo", "labDelete", { id: r1.id })), "notAdmin");
  assert.equal(await why(as("mod1", "labDelete", { id: r1.id })), "notAdmin");
  assert.equal(await why(as("adm1", "labDelete", { id: r1.id })), "needsRightHand", "a Steward hides and leaves a note instead");
  assert.equal(await why(as("boss", "labDelete", { id: "nope" })), "noIdea");
  assert.ok(await get(`${BASE}/ideas/${r1.id}`));
  const dr = await as("adm2", "labDelete", { id: r1.id });
  assert.equal(dr.ok, true); assert.ok(dr.activityDeleted >= 3);
  assert.equal(await get(`${BASE}/ideas/${r1.id}`), undefined, "the idea is gone");
  assert.equal((await col(`${BASE}/ideas/${r1.id}/comments`)).length, 0, "and its comments");
  assert.equal((await col(`${BASE}/ideas/${r1.id}/votes`)).length, 0, "and its votes");
  assert.equal((await col("activityLog")).filter((a) => a.ideaId === r1.id).length, 0, "and its activity events");
  assert.ok(!(await get(`${BASE}/myVotes/gbo`)).ids.includes(r1.id) && !(await get(`${BASE}/myVotes/fan2`)).ids.includes(r1.id), "and the vote marks");
  assert.equal((await col(`${BASE}/submitTokens`)).filter((x) => x.ideaId === r1.id).length, 0, "and its post token");
  const dl = (await col("adminLog")).find((l) => l.action === "delete" && l.itemPath === `${BASE}/ideas/${r1.id}`);
  assert.equal(dl.snapshot.title, "Show the queue on stream"); assert.equal(dl.snapshot.author, "@gbo"); assert.equal(dl.feature, "featureLab"); assert.equal(dl.actorUid, "adm2");
  assert.ok(await get(`${BASE}/ideas/${third.id}`), "other ideas are untouched");
  assert.equal((await as("adm3", "labDelete", { id: third.id })).ok, true, "A3 Right Hand may delete");
  await as("fan3", "labSubmit", { ...idea({ title: "Owner will delete this" }), token: token() });
  const mine = (await col(`${BASE}/ideas`)).find((i) => i.title === "Owner will delete this");
  assert.equal((await as("boss", "labDelete", { id: mine.id })).ok, true, "the owner may delete");

  console.log("check-lab-wiring: ok");
})().catch((e) => { console.error(e); process.exit(1); });
