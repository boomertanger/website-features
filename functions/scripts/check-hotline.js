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
  assert.equal(r.sent, false); assert.equal(r.reason, "email-off"); assert.equal(r.to, "fan@members.example"); assert.equal(r.subject, `Re: Feedback (BT-${t1.ref})`);
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

  // ---------- settings (owner only) ----------
  assert.equal(await why(core.settings(req("a2", { replyTime: "2 days" }, A2))), "not-allowed");
  r = await core.settings(req("boss", { replyTime: "2 days", inboxGrades: ["A1", "A2"], nameCheck: false, emailOwner: { private: false }, lines: { report: true } }));
  assert.equal(r.settings.replyTime, "2 days"); assert.deepEqual(r.settings.inboxGrades, ["A1", "A2"]); assert.equal(r.settings.emailOwner.private, false); assert.equal(r.settings.emailOwner.business, true);
  assert.equal(await why(core.action(req("a1", { lane: "team", id: t1.id, action: "status", value: "done" }, A1))), "ok", "A1 has the inbox once the owner adds it");
  assert.equal(await why(core.settings(req("boss", { inboxGrades: ["A9"] }))), "bad-input");
  assert.ok(logs.some((l) => l.action === "settings"));

  // ---------- rules, indexes, exports ----------
  const rules = fs.readFileSync(path.join(__dirname, "../../firestore.rules"), "utf8");
  assert.match(rules, /match \/hotline\/main \{\s*allow read: if true;\s*allow write: if false;/);
  assert.match(rules, /match \/hotline\/main\/ownerMessages\/\{msgId\} \{\s*allow read: if isSiteOwner\(siteId\);/);
  assert.match(rules, /match \/hotline\/main\/limits\/\{key\} \{\s*allow read, write: if false;/);
  const idx = JSON.parse(fs.readFileSync(path.join(__dirname, "../../firestore.indexes.json"), "utf8"));
  for (const g of ["teamMessages", "ownerMessages", "hotlineNotes", "limits"]) assert.ok(idx.fieldOverrides.some((f) => f.collectionGroup === g && f.fieldPath === "expireAt" && f.ttl === true), `TTL on ${g}`);
  const fns = require("../lib/hotline")({ adminLogEntry });
  assert.deepEqual(Object.keys(fns).sort(), ["contactAction", "contactNote", "contactReply", "contactSend", "contactSettings"]);

  console.log("check-hotline: ok");
}
main().catch((e) => { console.error(e); process.exit(1); });
