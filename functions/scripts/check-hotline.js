#!/usr/bin/env node
// functions/scripts/check-hotline.js: Hotline Boom (docs/specs/hotline-boom.md §3 to §8), run against the in-memory Firestore with a fake Turnstile and a
// fake Resend. No network, no deploy.
//   npm run check      (or node scripts/check-hotline.js)
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
const S = "sites/boomertanger", B = `${S}/hotline/main`;
const H = 3600000, DAY = 24 * H;
const L = require("../lib/hotline/logic");
const M = require("../lib/hotline/mail");
const { verifyTurnstile } = require("../lib/security/turnstile");

let clock = Date.UTC(2026, 9, 12, 15, 0);
let turnstileOk = true;
const sent = [];
const fakeFetch = async (url, init = {}) => {
  if (url.includes("turnstile")) return { ok: true, json: async () => (turnstileOk ? { success: true } : { success: false, "error-codes": ["invalid-input-response"] }) };
  if (url.includes("resend")) { sent.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ id: "em_1" }) }; }
  throw new Error("unexpected fetch " + url);
};
const logs = [];
const adminLogEntry = async (_d, f) => { logs.push(f); return { ...f, createdAt: realFs.Timestamp.now() }; };
let resendKey = "";
const core = require("../lib/hotline").build({ db: wdb, adminLogEntry, now: () => clock, fetchFn: fakeFetch,
  secrets: { turnstile: () => "TS-SECRET", salt: () => "SALT-123", resend: () => resendKey }, getUserEmail: async (uid) => `${uid}@members.example` });
const req = (uid, data, { claims = {}, ip = "1.2.3.4" } = {}) => ({ auth: uid ? { uid, token: claims } : undefined, data, rawRequest: { ip } });
const why = async (p) => { try { await p; return "ok"; } catch (e) { return e.details?.reason || e.message; } };
const detail = async (p) => { try { await p; return null; } catch (e) { return e.details || {}; } };
const list = async (p) => (await wdb.collection(p).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
let n = 0;
const ref = () => `client-${++n}-abcdef`;
const visitor = (line, extra = {}) => ({ line, body: "Hello there, big fan of the streams!", name: "Mara", email: "mara@example.com", turnstile: "tok", clientRef: ref(), ...extra });
const member = (line, extra = {}) => ({ line, body: "Hello from a member.", turnstile: "tok", clientRef: ref(), ...extra });

async function main() {
  // ---------- pure ----------
  assert.deepEqual(L.LINES.map((l) => [l.key, l.id, l.lane]), [[1, "hi", "team"], [2, "feedback", "team"], [3, "help", "team"], [4, "business", "owner"], [5, "private", "owner"], [6, "report", "owner"]]);
  assert.equal(L.lineById("feedback").title, "Feedback & questions", "line 2's new name (the id stays feedback)");
  // Talk Back's fields, pure (talk-back.md §1, §6)
  assert.deepEqual(L.talkBackFields({}), { kind: "feedback", context: null, boombotShown: null }, "kind defaults to feedback");
  assert.equal(L.talkBackFields({ kind: "rant" }).kind, "feedback");
  assert.equal(L.cleanPath("/games/x?as=member#top"), "/games/x", "query and hash dropped");
  assert.equal(L.cleanPath("/bug-zapper/how-it-works"), "/bug-zapper/how-it-works", "a sub-page path is kept exactly");
  assert.equal(L.cleanPath("/bug-zapper/how-it-works/?x=1#y"), "/bug-zapper/how-it-works", "no trailing slash");
  assert.equal(L.cleanPath("/bug-zapper//"), "/bug-zapper"); assert.equal(L.cleanPath("/"), "/", "the home page stays /");
  for (const bad of ["games", "//evil.com/x", "https://evil.com/", "/a b", "/" + "x".repeat(200)]) assert.equal(L.cleanPath(bad), null, `not a same-site path: ${bad.slice(0, 20)}`);
  assert.equal(L.cleanTitle("<b>Hi</b>\n there"), "b Hi /b there"); assert.equal(L.cleanTitle("x".repeat(300)).length, 120);
  assert.equal(L.cleanContext({ serviceId: "Bad.Id", path: "/x" }), null, "a bad service id drops the context");
  assert.equal(L.cleanContext({ serviceId: "games", section: "a.b", path: "/x" }).section, null, "a bad section drops just the section");
  assert.deepEqual(L.cleanShown(["a", "a", "B!", "b", "c", "d", "e"]), ["a", "b", "c", "d"], "up to 4 distinct ids");
  assert.equal(L.nameCheck("I think nightowl was rude", [{ uid: "u1", handle: "nightowl", name: "Night Owl", grade: 3 }]).uid, "u1");
  assert.equal(L.nameCheck("thanks @NightOwl!", [{ uid: "u1", handle: "nightowl" }]).uid, "u1", "case-insensitive, with @");
  assert.equal(L.nameCheck("the nightowls are out", [{ uid: "u1", handle: "nightowl" }]), null, "whole word only");
  assert.equal(L.nameCheck("hey ab", [{ uid: "u1", handle: "ab" }]), null, "3+ characters");
  assert.equal(L.nameCheck("Night Owl helped me", [{ uid: "u1", handle: "nightowl", name: "Night Owl" }]).uid, "u1", "display names too");
  assert.equal(L.cleanVia("https://www.BoomerTanger.net/path?x=1"), "boomertanger.net"); assert.equal(L.cleanVia("<script>"), null);
  assert.equal(L.countLinks("a https://x.com b http://y.com www.z.com"), 3);
  assert.deepEqual(L.audienceFor("owner", "boss", ["a2"]), ["boss"]); assert.deepEqual(L.audienceFor("team", "boss", ["a2"]), ["boss", "a2"]);
  assert.equal((await verifyTurnstile({ token: "", secret: "x" })).reason, "missing");
  assert.equal(M.emailOn("re_123456789012"), false, "email is off unless HOTLINE_EMAIL=on");
  assert.match(M.mailtoUrl({ to: "a@b.co", subject: "Re: Hi (BT-1)", text: "x y" }), /^mailto:a%40b\.co\?subject=Re%3A%20Hi%20\(BT-1\)&body=x%20y$/);

  // ---------- the cast ----------
  await wdb.doc(S).set({ ownerUid: "boss" });
  for (const [uid, handle, display] of [["boss", "boomertanger", "Boomer"], ["fan", "fan_one", "Fan"], ["teen", "teen_one", "Teen"], ["a2", "overseer", "Ollie"], ["a1", "steward", "Stew"], ["mod", "nightowl", "Night Owl"]]) {
    await wdb.doc(`${S}/profiles/${uid}`).set({ handle, displayName: display });
    await wdb.doc(`users/${uid}`).set({ signedUpAt: realFs.Timestamp.fromMillis(clock - 90 * DAY), ageBand: uid === "teen" ? "13-17" : "18+" });
  }
  await wdb.doc(`${S}/crew/main/roster/a2`).set({ handle: "overseer", track: "admin", grade: 2, status: "active" });
  await wdb.doc(`${S}/crew/main/roster/a1`).set({ handle: "steward", track: "admin", grade: 1, status: "active" });
  await wdb.doc(`${S}/crew/main/roster/mod`).set({ handle: "nightowl", track: "mod", grade: 3, status: "active" });
  await wdb.doc(`${S}/crew/main/roster/boss`).set({ handle: "boomertanger", track: "admin", grade: 3, status: "active" });
  const A2 = { claims: { crewGrade: "A2" } }, A1 = { claims: { crewGrade: "A1" } }, MODC = { claims: { crewGrade: 3 } };

  // ---------- contactSend: a visitor on Say hi (team lane) ----------
  let r = await core.send(req(null, visitor("hi", { via: "boomertanger.net", source: "twitch" })));
  assert.equal(r.ref, 4800, "refs start at 4800"); assert.equal(r.lane, "team"); assert.equal(r.replyTime, "3 days");
  const main = (await wdb.doc(B).get()).data();
  assert.equal(main.nextRef, 4801); assert.deepEqual(main.inboxGrades, ["A2", "A3"], "hotline/main seeded with the defaults");
  let team = await list(`${B}/teamMessages`);
  assert.equal(team.length, 1);
  const m0 = team[0];
  assert.deepEqual(m0.sender, { name: "Mara", email: "mara@example.com" }); assert.equal(m0.status, "new"); assert.equal(m0.via, "boomertanger.net"); assert.equal(m0.source, "twitch");
  assert.ok(m0.ipHash && m0.ipHash.length === 64 && !JSON.stringify(m0).includes("1.2.3.4"), "only the HMAC of the IP is kept");
  assert.equal(m0.expireAt.toMillis() - m0.createdAt.toMillis(), L.KEEP_MS);
  assert.equal((await list(`${B}/teamMessages/${m0.id}/hotlineNotes`))[0].text, "received");
  // the alert: owner + inbox admins (A2 yes, A1 no), no text, no name
  let ob = (await list(`${S}/notifyOutbox`)).find((x) => x.id === `hotline-${m0.id}`);
  assert.equal(ob.type, "contact-new"); assert.deepEqual(ob.uids.sort(), ["a2", "boss"]); assert.deepEqual(ob.payload, { ref: 4800, line: "hi" }); assert.equal(ob.dedupeKey, `hotline:${m0.id}`);
  assert.ok(!JSON.stringify(ob).includes("Hello") && !JSON.stringify(ob).includes("Mara"), "the outbox never carries the text or the name");
  // stats: every line in stats, team lines in statsTeam
  const month = L.monthKey(clock);
  let st = (await wdb.doc(`${B}/stats/${month}`).get()).data(), stt = (await wdb.doc(`${B}/statsTeam/${month}`).get()).data();
  assert.equal(st.total, 1); assert.equal(st.lines.hi, 1); assert.equal(st.source.twitch, 1); assert.equal(st.via.boomertanger_net, 1); assert.equal(stt.total, 1);

  // ---------- idempotency: the same clientRef answers the same ref and writes nothing ----------
  const same = visitor("hi", { clientRef: "repeat-me-123" });
  const r1 = await core.send(req(null, same, { ip: "9.9.9.9" })), r2 = await core.send(req(null, same, { ip: "9.9.9.9" }));
  assert.equal(r1.ref, r2.ref); assert.equal((await list(`${B}/teamMessages`)).length, 2);

  // ---------- rate limits: visitors 3 an hour per IP, members 5 a day ----------
  await core.send(req(null, visitor("hi"), { ip: "9.9.9.9" })); await core.send(req(null, visitor("hi"), { ip: "9.9.9.9" }));
  const rl = await detail(core.send(req(null, visitor("hi"), { ip: "9.9.9.9" })));
  assert.equal(rl.reason, "rate-limited"); assert.ok(rl.retryAt > clock && rl.retryAt <= clock + H);
  assert.equal(await why(core.send(req(null, visitor("hi"), { ip: "8.8.8.8" }))), "ok", "another IP isn't limited");
  for (let i = 0; i < 5; i++) assert.equal(await why(core.send(req("fan", member("hi")))), "ok");
  const rlm = await detail(core.send(req("fan", member("hi"))));
  assert.equal(rlm.reason, "rate-limited"); assert.ok(rlm.retryAt <= clock + DAY);
  clock += DAY;   // a new day for the member checks below

  // ---------- input checks ----------
  assert.equal(await why(core.send(req(null, visitor("nope")))), "bad-input");
  assert.equal((await detail(core.send(req(null, visitor("hi", { email: "not-an-email" }))))).field, "email");
  assert.equal((await detail(core.send(req(null, visitor("hi", { body: "x".repeat(5001) }))))).field, "body");
  assert.equal((await detail(core.send(req(null, visitor("business", { fields: { kind: "sponsorship" } }))))).field, "company");
  assert.equal(await why(core.send(req(null, visitor("hi", { hp: "i am a bot" })))), "check-failed", "the honeypot");
  turnstileOk = false;
  assert.equal(await why(core.send(req(null, visitor("hi")))), "check-failed", "Turnstile");
  turnstileOk = true;
  // a member sends as themselves (no name or email to type); the question is answered once
  r = await core.send(req("fan", member("feedback", { fields: { about: "stream", stream: "s1", mood: "loved" }, source: "youtube" })));
  const fb = (await list(`${B}/teamMessages`)).find((x) => x.ref === r.ref);
  assert.deepEqual(fb.sender, { uid: "fan", handle: "fan_one" }); assert.deepEqual(fb.fields, { about: "stream", stream: "s1", mood: "loved" });
  assert.equal((await wdb.doc("users/fan").get()).get("hotlineAskedSource"), true);
  // members 13 to 17: no Business
  assert.equal(await why(core.send(req("teen", member("business", { fields: { company: "Acme", kind: "collab" } })))), "line-off");
  assert.equal(await why(core.send(req("fan", member("business", { fields: { company: "Acme", kind: "collab" } })))), "ok");

  // ---------- lanes ----------
  clock += DAY;   // a fresh daily allowance for the member
  r = await core.send(req("fan", member("private", { body: "Something personal." })));
  assert.equal(r.lane, "owner");
  r = await core.send(req("fan", member("hi", { onlyOwner: true })));
  assert.equal(r.lane, "owner", "Only Boomertanger should read this");
  // the name check: a crew handle on Feedback goes to the owner, flagged; the team never sees it, not even as a count
  const stBefore = (await wdb.doc(`${B}/statsTeam/${L.monthKey(clock)}`).get()).data() || {};
  r = await core.send(req("fan", member("feedback", { body: "I think @nightowl was rude in chat." })));
  assert.equal(r.lane, "owner");
  const nc = (await list(`${B}/ownerMessages`)).find((x) => x.ref === r.ref);
  assert.deepEqual(nc.namecheck, { uid: "mod", handle: "nightowl", grade: 3 });
  assert.deepEqual(((await wdb.doc(`${B}/statsTeam/${L.monthKey(clock)}`).get()).data() || {}).total, stBefore.total, "statsTeam doesn't count it");
  assert.deepEqual((await list(`${S}/notifyOutbox`)).find((x) => x.subject && x.payload.ref === r.ref).uids, ["boss"], "owner-lane alerts: the owner only");
  r = await core.send(req("fan", member("feedback", { body: "Boomertanger is great" })));
  assert.equal(r.lane, "team", "the owner's own name doesn't trip it");
  // too many links: stored as spam (30 days)
  clock += DAY;
  r = await core.send(req("fan", member("hi", { body: "a http://1.co http://2.co http://3.co http://4.co http://5.co http://6.co" })));
  const sp = (await list(`${B}/teamMessages`)).find((x) => x.ref === r.ref);
  assert.equal(sp.status, "spam"); assert.equal(sp.expireAt.toMillis() - sp.createdAt.toMillis(), L.SPAM_KEEP_MS);

  // ---------- lines switched off ----------
  await wdb.doc(B).update({ "lines.report": false });
  assert.equal(await why(core.send(req(null, visitor("report", { fields: { who: "someone" } })))), "line-off");

  // ---------- staff: who may act ----------
  const t0 = (await list(`${B}/teamMessages`))[0], o0 = nc;
  assert.equal(await why(core.action(req(null, { lane: "team", id: t0.id, action: "status", value: "open" }))), "signedOut");
  assert.equal(await why(core.action(req("mod", { lane: "team", id: t0.id, action: "status", value: "open" }, MODC))), "not-allowed", "mods never");
  assert.equal(await why(core.action(req("a1", { lane: "team", id: t0.id, action: "status", value: "open" }, A1))), "not-allowed", "A1 isn't an inbox grade by default");
  assert.equal(await why(core.action(req("a2", { lane: "owner", id: o0.id, action: "status", value: "open" }, A2))), "not-allowed", "admins never touch the owner lane");
  assert.equal(await why(core.action(req("a2", { lane: "team", id: t0.id, action: "status", value: "open" }, A2))), "ok");
  assert.equal((await wdb.doc(`${B}/teamMessages/${t0.id}`).get()).get("status"), "open");
  assert.ok(logs.some((l) => l.feature === "hotline" && l.action === "status" && l.actorUid === "a2"));
  // assign: team lane only, to an inbox member
  assert.equal(await why(core.action(req("a2", { lane: "team", id: t0.id, action: "assign", value: "mod" }, A2))), "bad-input");
  assert.equal(await why(core.action(req("a2", { lane: "team", id: t0.id, action: "assign", value: "a2" }, A2))), "ok");
  assert.equal(await why(core.action(req("boss", { lane: "owner", id: o0.id, action: "assign", value: "boss" }))), "not-allowed", "owner-lane messages can't be assigned");
  // spam: 30 days from marking
  await core.action(req("a2", { lane: "team", id: t0.id, action: "spam" }, A2));
  assert.equal((await wdb.doc(`${B}/teamMessages/${t0.id}`).get()).get("expireAt").toMillis(), clock + L.SPAM_KEEP_MS);
  await core.action(req("a2", { lane: "team", id: t0.id, action: "status", value: "open" }, A2));
  // a note
  assert.equal(await why(core.note(req("a2", { lane: "team", id: t0.id, text: "Looks friendly." }, A2))), "ok");
  // escalate: copies the message and its notes to the owner lane and deletes the team copy (one way)
  r = await core.action(req("a2", { lane: "team", id: t0.id, action: "escalate" }, A2));
  assert.equal(r.lane, "owner");
  assert.equal((await wdb.doc(`${B}/teamMessages/${t0.id}`).get()).exists, false); assert.equal((await list(`${B}/teamMessages/${t0.id}/hotlineNotes`)).length, 0);
  const esc = (await wdb.doc(`${B}/ownerMessages/${t0.id}`).get()).data();
  assert.equal(esc.lane, "owner"); assert.equal(esc.escalatedBy, "a2"); assert.equal(esc.assignee, null);
  const escNotes = await list(`${B}/ownerMessages/${t0.id}/hotlineNotes`);
  assert.ok(escNotes.some((x) => x.kind === "note" && x.text === "Looks friendly.") && escNotes.some((x) => x.event === "escalate"), "notes moved, escalate recorded");
  assert.equal(await why(core.action(req("a2", { lane: "owner", id: t0.id, action: "status", value: "done" }, A2))), "not-allowed", "and it leaves the admin's inbox");

  // ---------- reply: email off -> the mailto fallback, then Mark as replied ----------
  const t1 = (await list(`${B}/teamMessages`)).find((x) => x.sender && x.sender.uid === "fan" && x.line === "feedback");
  r = await core.reply(req("a2", { lane: "team", id: t1.id, text: "Thanks for this!", from: "fanmail", markWaiting: true }, A2));
  assert.equal(r.sent, false); assert.equal(r.reason, "email-off"); assert.equal(r.to, "fan@members.example"); assert.equal(r.subject, `Re: Feedback & questions (BT-${t1.ref})`);
  assert.ok(r.text.endsWith("the Boomertanger crew") && r.mailto.startsWith("mailto:"));
  assert.equal((await wdb.doc(`${B}/teamMessages/${t1.id}`).get()).get("firstReplyAt"), null, "nothing recorded until Mark as replied");
  r = await core.reply(req("a2", { lane: "team", id: t1.id, text: "Thanks for this!", from: "fanmail", markWaiting: true, manual: true }, A2));
  assert.equal(r.sent, true); assert.equal(r.manual, true);
  const t1b = (await wdb.doc(`${B}/teamMessages/${t1.id}`).get()).data();
  assert.equal(t1b.status, "waiting"); assert.ok(t1b.firstReplyAt);
  assert.ok((await list(`${B}/teamMessages/${t1.id}/hotlineNotes`)).some((x) => x.kind === "reply" && x.manual === true && x.from === "fanmail@boomertanger.com"));
  assert.equal((await wdb.doc(`${B}/stats/${L.monthKey(t1.createdAt.toMillis())}`).get()).get("answered"), 1);
  assert.ok((await list(`${S}/notifyOutbox`)).some((x) => x.type === "contact-reply" && x.uids[0] === "fan" && JSON.stringify(x.payload) === JSON.stringify({ ref: t1.ref })));
  assert.equal(await why(core.reply(req("a2", { lane: "team", id: t1.id, text: "x", from: "nope" }, A2))), "bad-input");
  // email on: it sends, Reply-To is the line's address, signed
  process.env.HOTLINE_EMAIL = "on"; resendKey = "re_test_123456789";
  r = await core.reply(req("boss", { lane: "team", id: t1.id, text: "One more thing.", from: "support" }));
  assert.equal(r.sent, true); const e = sent.pop();
  assert.equal(e.reply_to, "support@boomertanger.com"); assert.equal(e.from, M.SENDER); assert.ok(e.text.endsWith("the Boomertanger crew"));
  // the owner's copy of a Business message, only with email on
  clock += DAY;
  sent.length = 0;
  await core.send(req("fan", member("business", { fields: { company: "Acme", kind: "press" } })));
  assert.equal(sent.length, 1); assert.equal(sent[0].to[0], "business@boomertanger.com");
  process.env.HOTLINE_EMAIL = "off"; resendKey = "";

  // ---------- Talk Back on line 2 (talk-back.md §6) ----------
  clock += DAY;
  const tm = L.monthKey(clock);
  const svcStats = async () => ((await wdb.doc(`${B}/serviceStats/${tm}`).get()).data() || {}).byService || {};
  const ownStats = async () => ((await wdb.doc(`${B}/stats/${tm}`).get()).data() || {}).byService || {};
  const ctx = { serviceId: "bug-zapper", section: "report", path: "/bug-zapper?as=member#form", title: "Bug Zapper · Boomertanger" };
  // kind and context stored (path without the query), counted per service and section on the team lane
  r = await core.send(req(null, visitor("feedback", { kind: "question", context: ctx, boombotShown: ["how-to-report", "screenshots"] }), { ip: "7.7.7.1" }));
  assert.equal(r.lane, "team");
  let q1 = (await list(`${B}/teamMessages`)).find((x) => x.ref === r.ref);
  assert.equal(q1.kind, "question"); assert.deepEqual(q1.context, { serviceId: "bug-zapper", section: "report", path: "/bug-zapper", title: "Bug Zapper · Boomertanger" });
  assert.deepEqual(q1.boombotShown, ["how-to-report", "screenshots"]);
  assert.equal((await svcStats())["bug-zapper"].questions, 1); assert.equal((await svcStats())["bug-zapper"].sections.report.questions, 1);
  assert.equal((await ownStats())["bug-zapper"].questions, 1, "the owner's stats count it too");
  assert.deepEqual((await list(`${S}/notifyOutbox`)).find((x) => x.payload && x.payload.ref === r.ref).payload, { ref: r.ref, line: "feedback" }, "contact-new stays { ref, line }");
  // feedback (the default): counted as feedback, no section count
  r = await core.send(req(null, visitor("feedback", { context: ctx }), { ip: "7.7.7.2" }));
  assert.equal((await list(`${B}/teamMessages`)).find((x) => x.ref === r.ref).kind, "feedback");
  assert.equal((await svcStats())["bug-zapper"].feedback, 1); assert.equal((await svcStats())["bug-zapper"].sections.report.questions, 1, "sections count questions only");
  // an invalid context is dropped, never a reason to refuse
  r = await core.send(req(null, visitor("feedback", { kind: "question", context: { serviceId: "Bad.Id", path: "/x" }, boombotShown: "nope" }), { ip: "7.7.7.3" }));
  q1 = (await list(`${B}/teamMessages`)).find((x) => x.ref === r.ref);
  assert.equal(q1.context, null); assert.equal(q1.boombotShown, null); assert.equal(q1.kind, "question");
  r = await core.send(req(null, visitor("feedback", { context: { serviceId: "games", path: "https://evil.example/" } }), { ip: "7.7.7.4" }));
  assert.equal((await list(`${B}/teamMessages`)).find((x) => x.ref === r.ref).context, null, "an off-site path drops the context");
  assert.equal((await svcStats()).games, undefined, "nothing counted without a context");
  // owner-lane messages: in stats.byService, never in serviceStats (ticked, and a name-check hit)
  const svcBefore = JSON.stringify(await svcStats());
  r = await core.send(req(null, visitor("feedback", { kind: "question", context: { ...ctx, serviceId: "games" }, onlyOwner: true }), { ip: "7.7.7.5" }));
  assert.equal(r.lane, "owner");
  r = await core.send(req(null, visitor("feedback", { body: "I think @nightowl was rude in chat.", context: { ...ctx, serviceId: "games" } }), { ip: "7.7.7.6" }));
  assert.equal(r.lane, "owner", "the name check still sends it to the owner");
  assert.equal((await list(`${B}/ownerMessages`)).find((x) => x.ref === r.ref).context.serviceId, "games");
  assert.equal(JSON.stringify(await svcStats()), svcBefore, "owner-lane messages never touch serviceStats");
  assert.equal((await ownStats()).games.questions, 1); assert.equal((await ownStats()).games.feedback, 1, "both are in the owner's stats.byService");
  // other lines ignore the new fields
  r = await core.send(req(null, visitor("hi", { kind: "question", context: { ...ctx, serviceId: "arcade" }, boombotShown: ["x"] }), { ip: "7.7.7.7" }));
  const hi1 = (await list(`${B}/teamMessages`)).find((x) => x.ref === r.ref);
  assert.ok(!("kind" in hi1) && !("context" in hi1) && !("boombotShown" in hi1), "Say hi stores none of them");
  assert.equal((await svcStats()).arcade, undefined); assert.equal((await ownStats()).arcade, undefined);
  // contactDeflect: visitors allowed, counts boombot, 30 an hour per ipHash, then quietly nothing; nothing else stored
  assert.equal(await why(core.deflect(req(null, { serviceId: "Bad.Id", answerId: "a" }))), "bad-input");
  assert.equal(await why(core.deflect(req(null, { serviceId: "bug-zapper", answerId: "" }))), "bad-input");
  assert.deepEqual(await core.deflect(req(null, { serviceId: "bug-zapper", answerId: "how-to-report" }, { ip: "6.6.6.6" })), { ok: true });
  assert.equal((await svcStats())["bug-zapper"].boombot, 1);
  for (let i = 0; i < 35; i++) assert.deepEqual(await core.deflect(req("fan", { serviceId: "bug-zapper", answerId: "screenshots" }, { ip: "6.6.6.7" })), { ok: true }, "the same answer over the limit");
  assert.equal((await svcStats())["bug-zapper"].boombot, 31, "30 an hour from one ipHash");
  clock += H;
  await core.deflect(req(null, { serviceId: "bug-zapper", answerId: "screenshots" }, { ip: "6.6.6.7" }));
  assert.equal((await svcStats())["bug-zapper"].boombot, 32, "a new hour, counted again");
  assert.ok(!JSON.stringify(await svcStats()).includes("screenshots") && !JSON.stringify(await svcStats()).includes("fan"), "no answer id or uid stored");

  // a sub-page path is stored and returned unchanged (only a trailing slash goes)
  r = await core.send(req(null, visitor("feedback", { kind: "question", context: { ...ctx, path: "/bug-zapper/how-it-works/" } }), { ip: "7.7.7.11" }));
  assert.equal((await list(`${B}/teamMessages`)).find((x) => x.ref === r.ref).context.path, "/bug-zapper/how-it-works", "the sub-page, not the service's first page");

  // ---------- settings (owner only) ----------
  assert.equal(await why(core.settings(req("a2", { replyTime: "2 days" }, A2))), "not-allowed");
  r = await core.settings(req("boss", { replyTime: "2 days", inboxGrades: ["A1", "A2"], nameCheck: false, emailOwner: { private: false }, lines: { report: true } }));
  assert.equal(r.settings.replyTime, "2 days"); assert.deepEqual(r.settings.inboxGrades, ["A1", "A2"]); assert.equal(r.settings.emailOwner.private, false); assert.equal(r.settings.emailOwner.business, true);
  assert.equal(await why(core.action(req("a1", { lane: "team", id: t1.id, action: "status", value: "done" }, A1))), "ok", "A1 has the inbox once the owner adds it");
  assert.equal(await why(core.settings(req("boss", { inboxGrades: ["A9"] }))), "bad-input");
  assert.ok(logs.some((l) => l.action === "settings"));


  // ---------- Talk Back Part B: inbox recognition (talk-back.md §9), on a fresh database ----------
  {
    const db2 = makeDb();
    // real Firestore retries conflicting transactions; the fake runs them straight through, so serialise them here
    let chain = Promise.resolve();
    const rt = db2.runTransaction.bind(db2);
    db2.runTransaction = (fn) => { const p = chain.then(() => rt(fn)); chain = p.catch(() => {}); return p; };
    let t = Date.UTC(2026, 9, 20, 15, 0);   // Tue Oct 20, 10:00 Chicago
    const c2 = require("../lib/hotline").build({ db: db2, adminLogEntry, now: () => t, fetchFn: fakeFetch,
      secrets: { turnstile: () => "TS-SECRET", salt: () => "SALT-123", resend: () => "" }, getUserEmail: async (uid) => uid + "@members.example" });
    await db2.doc(S).set({ ownerUid: "boss" });
    for (const [uid, track, grade] of [["boss", "admin", 3], ["a2", "admin", 2], ["b2", "admin", 2], ["a1", "admin", 1], ["mod", "mod", 3], ["fan", null, null]]) {
      await db2.doc(S + "/profiles/" + uid).set({ handle: uid + "_h", displayName: uid });
      await db2.doc("users/" + uid).set({ signedUpAt: realFs.Timestamp.fromMillis(t - 90 * DAY), ageBand: "18+" });
      if (track) await db2.doc(S + "/crew/main/roster/" + uid).set({ handle: uid + "_h", track, grade, status: "active" });
    }
    const B2 = { claims: { crewGrade: "A2" } };
    const L2 = (p) => db2.collection(p).get().then((q) => q.docs.map((d) => ({ id: d.id, ...d.data() })));
    const msgOf = async (ref) => (await L2(B + "/teamMessages")).find((x) => x.ref === ref);
    const ledger = async (uid) => (await L2(S + "/crew/main/gears")).filter((g) => g.uid === uid);
    const total = async (uid) => (await ledger(uid)).reduce((a, g) => a + g.amount, 0);
    const stats2 = async () => ((await db2.doc(B + "/inboxStats/2026-10").get()).data() || {});
    let ip = 0;
    const vsend = async (extra = {}) => (await c2.send(req(null, visitor("hi", extra), { ip: "5.5.5." + (++ip) }))).ref;
    const why2 = async (p) => { try { await p; return "ok"; } catch (e) { return e.details?.reason || e.message; } };

    // two replies at once: one first reply, paid once (reply 4 + fast 2 + oldest 1, it was the only waiting message)
    const r1 = await vsend();
    t += H;
    const m1 = await msgOf(r1);
    const [x1, x2] = await Promise.all([c2.reply(req("a2", { lane: "team", id: m1.id, text: "Hi!", from: "fanmail", manual: true }, A2)), c2.reply(req("b2", { lane: "team", id: m1.id, text: "Hello!", from: "fanmail", manual: true }, B2))]);
    assert.equal(x1.gears + x2.gears, 7, "one payment: 4 + 2 fast + 1 oldest");
    let m1b = await msgOf(r1);
    assert.equal(m1b.firstReplyBy, "a2"); assert.deepEqual(m1b.gearsPaid.parts, { inboxReply: 4, inboxFast: 2, inboxOldest: 1 });
    assert.deepEqual(m1b.firstReplyMeta, { fast: true, oldest: true, minutes: 60 });
    assert.equal(await total("a2"), 7); assert.equal(await total("b2"), 0);
    assert.deepEqual((await ledger("a2")).map((g) => g.id).sort(), ["inboxFast:" + m1.id + ":a2", "inboxOldest:" + m1.id + ":a2", "inboxReply:" + m1.id + ":a2"]);
    assert.equal((await ledger("a2")).find((g) => g.source === "inboxReply").label, "Hotline reply");
    assert.ok((await L2(B + "/teamMessages/" + m1.id + "/hotlineNotes")).some((n) => n.kind === "credit" && n.amount === 7 && n.by === "a2"), "the credit line");
    assert.equal((await stats2()).perStaff.a2.replies, 1); assert.equal((await stats2()).perStaff.a2.minutes[m1.id], 60);
    // the board counts the reply (admins only)
    const board = (await db2.doc(S + "/crew/main/boards/month").get()).data();
    assert.equal(board.rows.find((r) => r.uid === "a2").inboxReplies, 1, "the board's Inbox column");

    // not oldest, not fast: a newer message answered while an older one waits
    const rOld = await vsend(); t += 10 * 60000; const rNew = await vsend();
    t += 30 * H;
    const mNew = await msgOf(rNew);
    let x = await c2.reply(req("a2", { lane: "team", id: mNew.id, text: "Late hello", from: "fanmail", manual: true }, A2));
    assert.equal(x.gears, 4, "4 for the reply, not fast (over 24 h), not the oldest");

    // owner, owner-lane and self-sent pay nothing
    const mOld = await msgOf(rOld);
    x = await c2.reply(req("boss", { lane: "team", id: mOld.id, text: "From the boss", from: "fanmail", manual: true }));
    assert.equal(x.gears, 0, "the owner never earns"); assert.equal(await total("boss"), 0);
    t += DAY;
    const own = await c2.send(req("fan", member("private", { body: "Private thing." })));
    assert.equal(own.lane, "owner");
    const mine = await c2.send(req("a2", member("hi", { body: "Sent by an admin." })));
    const mMine = await msgOf(mine.ref);
    x = await c2.reply(req("a2", { lane: "team", id: mMine.id, text: "Replying to myself", from: "fanmail", manual: true }, A2));
    assert.equal(x.gears, 0, "self-sent pays nothing");
    x = await c2.reply(req("b2", { lane: "team", id: mMine.id, text: "Second reply", from: "fanmail", manual: true }, B2));
    assert.equal(x.gears, 0, "a second reply is never first");
    // mods never act; A1 isn't an inbox grade
    assert.equal(await why2(c2.reply(req("a1", { lane: "team", id: mMine.id, text: "x", from: "fanmail", manual: true }, A1))), "not-allowed");

    // escalation keeps the payment and leaves the reply numbers
    const before = await total("a2");
    const rEsc = await vsend(); t += H;
    const mEsc = await msgOf(rEsc);
    x = await c2.reply(req("a2", { lane: "team", id: mEsc.id, text: "Let me check", from: "fanmail", manual: true }, A2));
    assert.ok(x.gears >= 4);
    const repliesBefore = (await stats2()).perStaff.a2.replies;
    await c2.action(req("a2", { lane: "team", id: mEsc.id, action: "escalate" }, A2));
    assert.equal(await total("a2"), before + x.gears, "escalation is neutral for Gears");
    assert.equal((await db2.doc(B + "/ownerMessages/" + mEsc.id).get()).get("gearsPaid").amount, x.gears, "gearsPaid moves with the message");
    assert.equal((await stats2()).perStaff.a2.replies, repliesBefore - 1, "but the reply leaves the strip numbers");
    assert.equal((await stats2()).perStaff.a2.minutes[mEsc.id], undefined);

    // spam after a paid reply: reversed with an adjustment; the credit line says so; then the spam mark is pending
    const rSp = await vsend(); t += H;
    const mSp = await msgOf(rSp);
    x = await c2.reply(req("b2", { lane: "team", id: mSp.id, text: "Hi", from: "fanmail", manual: true }, B2));
    const paidB2 = x.gears; assert.ok(paidB2 >= 4);
    await c2.action(req("b2", { lane: "team", id: mSp.id, action: "spam" }, B2));
    assert.equal(await total("b2"), 0, "the reply is reversed");
    const adj = (await ledger("b2")).find((g) => g.source === "adjust");
    assert.equal(adj.amount, -paidB2); assert.equal(adj.reason, "Marked as spam"); assert.ok(adj.reverses.includes("inboxReply:" + mSp.id + ":b2"));
    let mSpb = await msgOf(rSp);
    assert.equal(mSpb.spamBy, "b2"); assert.ok(mSpb.spamAt); assert.equal(mSpb.gearsPaid.reversed, true);
    const spNotes = await L2(B + "/teamMessages/" + mSp.id + "/hotlineNotes");
    assert.ok(spNotes.some((n) => n.kind === "credit" && n.reversed === paidB2) && spNotes.some((n) => n.kind === "credit" && n.pending === "spam"));
    // a second spam mark on the same message never reverses twice
    await c2.action(req("b2", { lane: "team", id: mSp.id, action: "status", value: "open" }, B2));
    await c2.action(req("b2", { lane: "team", id: mSp.id, action: "spam" }, B2));
    assert.equal(await total("b2"), 0);

    // the daily cap (30, Chicago day): a busy admin stops being paid and the credit line says capped
    t = Date.UTC(2026, 9, 26, 14, 0);   // Mon Oct 26
    for (let i = 0; i < 8; i++) await vsend();
    t += H;
    const waiting = (await L2(B + "/teamMessages")).filter((m) => m.firstReplyAt == null && ["new", "open"].includes(m.status)).sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());
    let day = 0, capped = null;
    for (const m of waiting) { const y = await c2.reply(req("a2", { lane: "team", id: m.id, text: "Got it", from: "fanmail", manual: true }, A2)); day += y.gears; const mm = await msgOf(m.ref); if (mm.gearsPaid && mm.gearsPaid.capped) capped = mm; }
    assert.ok(day <= 30, "never over 30 a day: " + day); assert.ok(capped, "a capped credit line");
    assert.ok((await L2(B + "/teamMessages/" + capped.id + "/hotlineNotes")).some((n) => n.kind === "credit" && n.capped === true && n.cap === 30));
    t += DAY;   // a new Chicago day: paid again
    const rNext = await vsend(); t += H;
    x = await c2.reply(req("a2", { lane: "team", id: (await msgOf(rNext)).id, text: "Hi", from: "fanmail", manual: true }, A2));
    assert.ok(x.gears >= 4, "a new day, a new cap");

    // a close with no reply needed: closedBy, Tidied, Oldest first when it was the oldest
    const rCl = await vsend(); t += H;
    const mCl = await msgOf(rCl);
    x = await c2.action(req("b2", { lane: "team", id: mCl.id, action: "status", value: "done" }, B2));
    const mClb = await msgOf(rCl);
    assert.equal(mClb.closedBy, "b2"); assert.equal(x.gears, 1, "oldest first for the close");
    assert.equal((await stats2()).perStaff.b2.closed, 1);

    // spam hold: after 7 days, 1 Gear, max 5 a day per person; un-spammed marks never pay
    t = Date.UTC(2026, 9, 27, 14, 0);
    const spamIds = [];
    for (let i = 0; i < 7; i++) { const r = await vsend(); const m = await msgOf(r); spamIds.push(m.id); await c2.action(req("b2", { lane: "team", id: m.id, action: "spam" }, B2)); }
    // one mark is overturned by the owner: it never pays and counts against b2's Accuracy
    await c2.action(req("boss", { lane: "team", id: spamIds[6], action: "status", value: "open" }));
    assert.equal((await db2.doc(B + "/teamMessages/" + spamIds[6]).get()).get("spamBy"), undefined);
    assert.equal((await db2.doc(B + "/inboxStats/2026-10").get()).data().perStaff.b2.spamOverturned, 1);
    let h = await c2.credit.spamHold(t + 6 * DAY);
    assert.equal(h.due, 1, "only the earlier mark (mSp) is due; the new ones wait 7 days");
    const b2Before = await total("b2");
    h = await c2.credit.spamHold(t + 7 * DAY + H);
    assert.equal(h.paid, 5, "the daily max"); assert.equal(await total("b2"), b2Before + 5);
    h = await c2.credit.spamHold(t + 8 * DAY + H);
    assert.ok(h.paid >= 1, "the rest the next day"); assert.equal(await c2.credit.spamHold(t + 8 * DAY + 2 * H).then((r) => r.paid), 0, "never twice");
    assert.equal((await db2.doc(B + "/teamMessages/" + spamIds[0]).get()).get("spamHeld").paid, true);

    // pick up and let go (team lane; release only by the person who picked it up)
    t = Date.UTC(2026, 10, 2, 15, 0);
    const rPu = await vsend(); const mPu = await msgOf(rPu);
    assert.equal(await why2(c2.action(req("mod", { lane: "team", id: mPu.id, action: "pickUp" }, MODC))), "not-allowed", "mods never");
    assert.equal(await why2(c2.action(req("a2", { lane: "team", id: mPu.id, action: "pickUp" }, A2))), "ok");
    let pu = await msgOf(rPu);
    assert.equal(pu.assignee, "a2"); assert.ok(pu.pickedUpAt);
    assert.equal(await why2(c2.action(req("b2", { lane: "team", id: mPu.id, action: "pickUp" }, B2))), "taken");
    assert.equal(await why2(c2.action(req("b2", { lane: "team", id: mPu.id, action: "release" }, B2))), "not-allowed", "only the one who picked it up");
    assert.equal(await why2(c2.action(req("a2", { lane: "team", id: mPu.id, action: "release" }, A2))), "ok");
    pu = await msgOf(rPu);
    assert.equal(pu.assignee, null); assert.equal(pu.pickedUpAt, undefined);
    assert.ok(logs.some((l) => l.action === "pickUp") && logs.some((l) => l.action === "release"));
    const ownMsg = (await L2(B + "/ownerMessages"))[0];
    assert.equal(await why2(c2.action(req("boss", { lane: "owner", id: ownMsg.id, action: "pickUp" }))), "not-allowed", "owner-lane messages can't be picked up");

    // Clear desk: 7 clear days in a row pay everyone who handled 3+ that week; a stale message breaks the run
    for (const m of await L2(B + "/teamMessages")) if (m.firstReplyAt == null && ["new", "open"].includes(m.status)) await db2.doc(B + "/teamMessages/" + m.id).update({ status: "done" });
    t = Date.UTC(2026, 10, 3, 15, 0);
    for (let i = 0; i < 3; i++) { const r = await vsend(); t += 10 * 60000; await c2.reply(req("b2", { lane: "team", id: (await msgOf(r)).id, text: "Hi", from: "fanmail", manual: true }, B2)); }
    const rEsc2 = await vsend(); t += H; const mEsc2 = await msgOf(rEsc2);
    await c2.reply(req("a2", { lane: "team", id: mEsc2.id, text: "Hi", from: "fanmail", manual: true }, A2));
    await c2.action(req("a2", { lane: "team", id: mEsc2.id, action: "escalate" }, A2));   // escalation doesn't break a clear day
    const b2Desk = await total("b2");
    let dk;
    for (let i = 0; i < 7; i++) dk = await c2.credit.deskCheck(Date.UTC(2026, 10, 3 + i, 3 + 24, 0));   // 21:00 Chicago each day
    assert.equal(dk.clear, true); assert.ok(dk.bonus && dk.bonus.paid.includes("b2") && !dk.bonus.paid.includes("a2"), "b2 handled 3, a2 only 1");
    assert.equal(await total("b2"), b2Desk + 5);
    assert.equal((await c2.credit.deskCheck(Date.UTC(2026, 10, 9, 27, 0))).already, true, "once a day");
    // a message waiting over 48 hours makes the day not clear
    const rStale = await vsend();
    dk = await c2.credit.deskCheck(t + 3 * DAY);
    assert.equal(dk.clear, false); assert.equal(dk.streak, 0);

    // Operator of the Month: the minimum, accuracy and the switch
    const op = await c2.credit.operatorFor("2026-10");
    assert.ok(op.winner && op.winner.uid === "a2", "a2 has the most replies; b2 has an overturned mark and no held spam in October");
    await db2.doc(S + "/crew/main").set({ inbox: { operatorAward: false } }, { merge: true });
    assert.equal((await c2.credit.operatorFor("2026-10")).off, true);
    void rStale;
  }

  // ---------- rules, indexes, exports ----------
  const rules = fs.readFileSync(path.join(__dirname, "../../firestore.rules"), "utf8");
  assert.match(rules, /match \/hotline\/main \{\s*allow read: if true;\s*allow write: if false;/);
  assert.match(rules, /match \/hotline\/main\/ownerMessages\/\{msgId\} \{\s*allow read: if isSiteOwner\(siteId\);/);
  assert.match(rules, /match \/hotline\/main\/limits\/\{key\} \{\s*allow read, write: if false;/);
  assert.match(rules, /match \/hotline\/main\/serviceStats\/\{month\} \{\s*allow read: if isHotlineInbox\(siteId\) \|\| hasSiteRole\(siteId, 'admin'\);\s*allow write: if false;/, "serviceStats: owner, inbox admins and site admins read; nobody writes");
  const idx = JSON.parse(fs.readFileSync(path.join(__dirname, "../../firestore.indexes.json"), "utf8"));
  for (const g of ["teamMessages", "ownerMessages", "hotlineNotes", "limits"]) assert.ok(idx.fieldOverrides.some((f) => f.collectionGroup === g && f.fieldPath === "expireAt" && f.ttl === true), `TTL on ${g}`);
  const fns = require("../lib/hotline")({ adminLogEntry });
  assert.deepEqual(Object.keys(fns).sort(), ["contactAction", "contactDeflect", "contactNote", "contactReply", "contactSend", "contactSettings", "inboxDeskCheck", "inboxSpamHold"]);
  assert.match(rules, /match \/hotline\/main\/inboxStats\/\{month\} \{\s*allow read: if isHotlineInbox\(siteId\);\s*allow write: if false;/, "inboxStats: owner and inbox admins read; nobody writes");

  console.log("check-hotline: ok");
}
main().catch((e) => { console.error(e); process.exit(1); });
