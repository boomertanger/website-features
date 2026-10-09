#!/usr/bin/env node
// functions/scripts/check-duty.js: Mod Machina phase 3 part 2, the duty backend (docs/specs/mod-machina.md section 17a), run against the in-memory Firestore. No network, no credentials, no deploy.
//   npm run check      (or node scripts/check-duty.js)
// Sections: pure rules, clock in, heartbeat minutes, step away and handoffs, the Captain (acting, seated, set, reassign), quiet leads, Stop, confirm and the payout (Gears per line, boost, one rate,
// keyed ids, counted and led, badges), auto-confirm, nightly reliability and the lockout, public/live, rules and the shared-file wiring.
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { makeDb } = require("./fixtures/fake-firestore");
const D = require("../lib/crew/dutyLogic");
const L = require("../lib/live/logic");

const admin = require("firebase-admin");
process.env.GCLOUD_PROJECT ||= "boomertanger-staging";
process.env.FIREBASE_CONFIG ||= JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const wdb = makeDb(); const realFs = admin.firestore;
const fakeFs = () => wdb; fakeFs.Timestamp = realFs.Timestamp; fakeFs.FieldValue = realFs.FieldValue;
Object.defineProperty(admin, "firestore", { value: fakeFs, configurable: true, writable: true });
const TS = (m) => realFs.Timestamp.fromMillis(m);
const S = "sites/boomertanger";
const H = 3600000, MIN = 60000;
const T0 = Date.UTC(2026, 9, 12, 1, 0);
let clock = T0;

// ---------- pure rules ----------
(function pure() {
  assert.deepEqual(D.creditFor({ lastPing: 0 }, 60000), { credit: 1, ignored: false }, "a ping a minute later: one minute");
  assert.equal(D.creditFor({ lastPing: 0 }, 20000).ignored, true, "two tabs: the second ping inside the minute is ignored");
  assert.equal(D.creditFor({ lastPing: 0 }, 3 * MIN).credit, 3, "a 3 minute gap is bridged");
  assert.equal(D.creditFor({ lastPing: 0 }, 2 * MIN).credit, 2);
  assert.equal(D.creditFor({ lastPing: 0 }, 4 * MIN).credit, 1, "a longer gap is not bridged: only the minute the ping arrived in");
  assert.equal(D.creditFor({ lastPing: 0, away: true }, 5 * MIN).credit, 0, "while stepped away nothing counts");
  assert.equal(D.primaryRole([{ role: "deckhand", room: "twitch" }, { role: "captain", room: null }, { role: "lead", room: "twitch" }]).role, "captain", "one rate at a time: the highest-paid role");
  assert.deepEqual(D.capLines({ captain: 100, "lead:twitch": 200, "deckhand:twitch": 100 }, 360), { captain: 100, "lead:twitch": 200, "deckhand:twitch": 60 }, "the 6-hour cap keeps the best-paid lines");
  const gv = { dutyCaptainPerHour: 12, dutyRoomLeadPerHour: 10, dutyDeckhandPerHour: 6 };
  assert.deepEqual(D.gearLines({ captain: 120, "lead:twitch": 100, "lead:ytLandscape": 90, "deckhand:ytVertical": 60 }, gv, {}, { youtubeBoost: 1.5 }).map((l) => [l.key, l.gears]),
    [["captain", 24], ["deckhand:ytVertical", 9], ["lead:twitch", 17], ["lead:ytLandscape", 23]], "minutes / 60 x rate x boost, rounded per line; YouTube rooms get the boost");
  assert.equal(D.boostOf("ytVertical", { boost: { ytVertical: 2 } }, { youtubeBoost: 1.5 }), 2, "a per-room boost on crew.caps wins");
  assert.equal(D.boostOf("twitch", {}, { youtubeBoost: 1.5 }), 1); assert.equal(D.boostOf(null, {}, { youtubeBoost: 1.5 }), 1);
  assert.deepEqual(D.dutyOutcome({ "deckhand:twitch": 59 }, 240).counted, false); assert.deepEqual(D.dutyOutcome({ "deckhand:twitch": 60 }, 240).counted, true);
  assert.equal(D.dutyOutcome({ "deckhand:twitch": 40 }, 45).counted, true, "a stream under an hour: the whole stream minus 5 minutes");
  assert.equal(D.dutyOutcome({ "lead:twitch": 30, "deckhand:twitch": 40 }, 240).led, true); assert.equal(D.dutyOutcome({ "lead:twitch": 29, "deckhand:twitch": 40 }, 240).led, false);
  assert.equal(D.dutyOutcome({ "lead:ytLandscape": 31, "lead:ytVertical": 10 }, 240).ytRoomsLed, 1);
  assert.deepEqual(D.laddered(D.DUTY_BADGES, 25), ["crew-duties-10", "crew-duties-25"]); assert.deepEqual(D.laddered(D.PIONEER_BADGES, 5), ["youtube-pioneer-1", "youtube-pioneer-5"]);
  assert.equal(D.nextActingCaptain([{ uid: "a", grade: 2, since: 5 }, { uid: "b", grade: 3, since: 9 }, { uid: "c", grade: 3, since: 7 }, { uid: "d", grade: 1, since: 1 }, { uid: "e", grade: 4, since: 0, blocked: true }, { uid: "f", grade: 4, since: 0, away: true }]), "c", "highest grade, earliest clock-in, never blocked, away or below Watcher");
  assert.equal(D.nextActingCaptain([{ uid: "b", grade: 3, since: 9 }], ["b"]), null);
  assert.match(D.lockMessage(Date.UTC(2026, 10, 4, 12)), /^No Lead or Captain seats until Nov 4, 2026 \(3 no-shows in 90 days\)\.$/);
  const rel = D.reliability([{ streamId: "a", endedAt: 100 * H, scheduled: { role: "lead" }, clockedIn: true }, { streamId: "b", endedAt: 101 * H, scheduled: { role: "lead" }, clockedIn: false }, { streamId: "c", endedAt: 102 * H, scheduled: null, clockedIn: true }], [{ streamId: "d", at: 103 * H }], 110 * H);
  assert.equal(rel.kept, 3); assert.equal(rel.showed, 1); assert.equal(rel.noShows.length, 2); assert.equal(Math.round(rel.reliability * 100), 33);
  assert.equal(D.lockFor([{ at: 1 }, { at: 2 }], {}, 10), null); assert.ok(D.lockFor([{ at: 1 }, { at: 2 }, { at: 3 }], {}, 10) > 10);
  assert.equal(D.lockFor([{ at: 1 }, { at: 2 }, { at: 3 }], { lockTriggerAt: 3 }, 10), null, "the same no-shows never lock twice");
  assert.equal(D.lockFor([{ at: 1 }, { at: 2 }, { at: 3 }], { lockUntil: 100 }, 10), null, "already locked");
})();

const yt = { active: [], created: [], videos: {} };
const jr = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body), json: async () => body });
const fakeFetch = async (url) => {
  if (url.startsWith("https://id.twitch.tv/oauth2/token")) return jr(200, { access_token: "TWTOKEN", expires_in: 3600 });
  if (url.startsWith("https://api.twitch.tv/helix/users")) return jr(200, { data: [{ id: "B1" }] });
  if (url.startsWith("https://api.twitch.tv/helix/streams")) return jr(200, { data: [] });
  throw new Error("unexpected network call " + url);
};
const fakeYoutube = { apiClient: async () => null, syncStream: async (id, opts) => { yt.created.push({ id, ...opts }); return { action: "create", status: "ok" }; } };
const adminLogEntry = async (_d, f) => ({ ...f, createdAt: realFs.Timestamp.now() });
const badges = [];
const fakeGrant = { grantXp: async () => ({ granted: true }), grantBadge: async (uid, id, o) => { badges.push({ uid, id, ref: o && o.ref }); return { granted: true }; } };
const fakeFactory = { recordFactoryEvent: async () => ({ counted: true }) };
const live = require("../lib/live").build({ adminLogEntry, youtube: fakeYoutube, now: () => clock, rng: () => 0.5, grant: fakeGrant, factory: fakeFactory, fetchFn: fakeFetch, twitchClientId: "CID", twitchClientSecret: "TSEC", twitchLogin: "boomertanger", eventSubSecret: "ES", enqueue: async () => {}, sleep: async () => {} });
const fns = live.functions, ctx = live.hooks.ctx, duty = live.hooks.duty;
const as = (uid, fn, data = {}) => fns[fn].run({ auth: uid ? { uid, token: {} } : undefined, data });
const why = async (p) => { try { await p; return "ok"; } catch (e) { return e.details?.reason || e.message; } };
const msgOf = async (p) => { try { await p; return "ok"; } catch (e) { return e.message; } };
const get = async (p) => (await wdb.doc(`${S}/${p}`).get()).data();
const col = async (p) => (await wdb.collection(`${S}/${p}`).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const st = (sid) => get(`streams/${sid}/private/duty`);
const rec = (sid, uid) => get(`crew/main/duties/${sid}_${uid}`);
const at = (min) => { clock = T0 + min * MIN; };

async function main() {
  await wdb.doc(S).set({ ownerUid: "boss", timezone: "America/Chicago" });
  // handles differ from uids on purpose: public/live must never show a uid
  const person = async (uid, roles, roster) => {
    await wdb.doc(`${S}/members/${uid}`).set({ roles }); await wdb.doc(`${S}/profiles/${uid}`).set({ handle: `${uid}_h`, xp: 0 });
    if (roster) await wdb.doc(`${S}/crew/main/roster/${uid}`).set({ handle: `${uid}_h`, status: "active", since: TS(T0 - 400 * 86400000), stats: { duties: 0 }, ...roster });
  };
  await person("boss", ["admin"]); await person("adm2", ["admin"], { track: "admin", grade: 2 });
  await person("capt", ["mod"], { track: "mod", grade: 3 }); await person("mod1", ["mod"], { track: "mod", grade: 3 });
  await person("w2", ["mod"], { track: "mod", grade: 2 }); await person("dk1", ["mod"], { track: "mod", grade: 1 }); await person("dk2", ["mod"], { track: "mod", grade: 1 });
  await person("dk3", ["mod"], { track: "mod", grade: 1 }); await person("dk9", ["mod"], { track: "mod", grade: 1 });
  await person("lockee", ["mod"], { track: "mod", grade: 3 }); await person("blocked", ["mod"], { track: "mod", grade: 3, leadBlockedUntil: TS(T0 + 30 * 86400000) });
  await person("paused", ["mod"], { track: "mod", grade: 2, status: "paused" }); await person("fan", []);
  await wdb.doc(`${S}/crew/main/roster/lockee/private/record`).set({ lockUntil: TS(T0 + 20 * 86400000) });
  const mkStream = async (id, o = {}, crew = null) => {
    const base = { title: "Monster Monday", slug: id, state: "scheduled", published: true, type: "platform", audience: "public", rooms: ["twitch", "ytLandscape", "ytVertical"], platforms: ["twitch", "youtube"], plannedStart: TS(T0 + H), plannedEnd: TS(T0 + 4 * H), hasUnpublishedChanges: false, rev: 1, caps: { deckhands: 2 }, plannedGames: [], ...o };
    const dcrew = crew || { captain: { uid: "capt", handle: "capt_h" }, chats: { twitch: { lead: { uid: "mod1", handle: "mod1_h" }, deckhands: [{ uid: "dk1", handle: "dk1_h" }, { uid: "dk9", handle: "dk9_h" }] }, ytLandscape: { lead: null, deckhands: [] }, ytVertical: { lead: null, deckhands: [] } }, caps: { deckhands: 2 } };
    await wdb.doc(`${S}/streams/${id}`).set({ ...base, crew: { captain: "capt_h", chats: {}, caps: { deckhands: 2 } } });
    await wdb.doc(`${S}/streams/${id}/private/draft`).set({ ...base, crew: dcrew });
  };
  await mkStream("s1");

  // ================================================================ clock in: before start
  assert.equal(await why(as("fan", "dutyClockIn", { streamId: "s1" })), "notCrew");
  assert.equal(await why(as("paused", "dutyClockIn", { streamId: "s1" })), "notCrew", "Paused crew can't clock in");
  assert.equal(await why(as(null, "dutyClockIn", { streamId: "s1" })), "signedOut");
  assert.equal(await why(as("boss", "dutyClockIn", { streamId: "s1" })), "ownerHosts", "the owner hosts and can't clock in");
  assert.equal(await why(as("dk1", "dutyClockIn", { streamId: "s1" })), "notStarted", "refused before startStream");
  assert.equal(await msgOf(as("dk1", "dutyClockIn", { streamId: "s1" })), "The stream hasn't started yet.");
  assert.equal(await why(as("dk1", "dutyClockIn", { streamId: "nope" })), "noStream");
  await as("adm2", "startStream", { streamId: "s1" });
  assert.equal((await st("s1")).state, "live", "the live duty state exists from Start"); assert.deepEqual((await st("s1")).onDuty, {});

  // ================================================================ clock in: seated, drop-in, refusals
  at(1);
  let r = await as("dk1", "dutyClockIn", { streamId: "s1" });
  assert.deepEqual(r.roles, [{ role: "deckhand", room: "twitch" }]); assert.equal(r.showed, true, "seated and within 15 minutes of the start: the +5 is recorded");
  let d1 = await rec("s1", "dk1");
  assert.deepEqual(d1.scheduled, { role: "deckhand", room: "twitch" }); assert.equal(d1.segments.length, 1); assert.equal(d1.segments[0].out, null); assert.equal(d1.showed, true);
  assert.equal((await as("dk1", "dutyClockIn", { streamId: "s1" })).already, true, "clocking in twice is a no-op");
  assert.equal(await why(as("dk2", "dutyClockIn", { streamId: "s1" })), "badRoom", "a drop-in picks a room");
  assert.equal(await why(as("dk2", "dutyClockIn", { streamId: "s1", room: "site" })), "badRoom");
  assert.equal(await why(as("dk2", "dutyClockIn", { streamId: "s1", room: "twitch", role: "captain" })), "badRole");
  assert.equal(await why(as("dk2", "dutyClockIn", { streamId: "s1", room: "ytLandscape", role: "lead" })), "gradeTooLow", "an Initiate can't drop in as Lead");
  assert.equal(await why(as("lockee", "dutyClockIn", { streamId: "s1", room: "ytLandscape", role: "lead" })), "locked", "locked out by the no-show rule");
  assert.match(await msgOf(as("lockee", "dutyClockIn", { streamId: "s1", room: "ytLandscape", role: "lead" })), /^No Lead or Captain seats until .* \(3 no-shows in 90 days\)\.$/);
  assert.equal(await why(as("blocked", "dutyClockIn", { streamId: "s1", room: "ytLandscape", role: "lead" })), "leadBlocked", "a strike blocks Lead");
  r = await as("dk2", "dutyClockIn", { streamId: "s1", room: "ytLandscape" });
  assert.deepEqual(r.roles, [{ role: "deckhand", room: "ytLandscape" }]); assert.equal(r.showed, false, "drop-ins earn no showed-up Gears");
  assert.equal((await rec("s1", "dk2")).scheduled, null);
  assert.equal(await why(as("w2", "dutyClockIn", { streamId: "s1", room: "twitch", role: "lead" })), "leadTaken", "a room with a Lead (seated) has none to give");
  r = await as("w2", "dutyClockIn", { streamId: "s1", room: "ytVertical", role: "lead" });
  assert.deepEqual(r.roles, [{ role: "lead", room: "ytVertical" }], "Room Lead where the room has none and the grade allows");
  assert.equal((await as("lockee", "dutyClockIn", { streamId: "s1", room: "twitch" })).ok, true, "the lockout is for Lead and Captain, a Deckhand is fine");
  // no Captain seated on duty yet: nothing is offered until the seated Captain is 15 minutes late
  let s = await st("s1");
  assert.equal(s.captainNow, null); assert.equal(Object.values(s.prompts).filter((p) => p.kind === "actingCaptain").length, 0, "the seated Captain gets 15 minutes before an acting Captain is offered");

  // ================================================================ heartbeat minutes
  at(1); const base = clock;                       // dk1 clocked in at +1
  clock = base + 60000; r = await as("dk1", "dutyPing", { streamId: "s1" }); assert.equal(r.counted, 1);
  clock = base + 80000; r = await as("dk1", "dutyPing", { streamId: "s1" }); assert.equal(r.ignored, true, "a second Deck tab inside the minute counts once");
  clock = base + 3 * MIN; r = await as("dk1", "dutyPing", { streamId: "s1" }); assert.equal(r.counted, 2, "a 2 minute gap is bridged");
  clock = base + 10 * MIN; r = await as("dk1", "dutyPing", { streamId: "s1" }); assert.equal(r.counted, 1, "a 7 minute gap is not bridged");
  d1 = await rec("s1", "dk1"); assert.equal(d1.minutes, 4); assert.deepEqual(d1.lines, { "deckhand:twitch": 4 });
  assert.equal(await why(as("fan", "dutyPing", { streamId: "s1" })), "notCrew"); assert.equal(await why(as("dk9", "dutyPing", { streamId: "s1" })), "notOnDuty");
  // the other people tick along so they have minutes to pay
  for (const u of ["dk2", "w2", "lockee"]) { clock = base + 12 * MIN; await as(u, "dutyPing", { streamId: "s1" }); }

  // ================================================================ the seated Captain's 15 minutes, acting Captain
  r = await as("mod1", "dutyClockIn", { streamId: "s1" });     // seated twitch Lead
  assert.deepEqual(r.roles, [{ role: "lead", room: "twitch" }]);
  at(10); let t = await live.hooks.duty.tick({ id: "s1", ...(await get("streams/s1")) }, clock);
  assert.equal(Object.values((await st("s1")).prompts).filter((p) => p.kind === "actingCaptain").length, 0, "before 15 minutes: nothing offered");
  at(17); await duty.tick({ id: "s1", ...(await get("streams/s1")) }, clock);
  s = await st("s1");
  let offer = Object.values(s.prompts).find((p) => p.kind === "actingCaptain" && p.status === "open");
  assert.ok(offer, "the seated Captain is 15 minutes late: acting Captain is offered"); assert.equal(offer.to, "mod1", "to the highest grade on duty (Warden, earliest clock-in), not an Initiate");
  assert.equal(await why(as("w2", "dutyTakeLead", { streamId: "s1", promptId: offer.id })), "notYours");
  assert.equal(await why(as("mod1", "dutyDecline", { streamId: "s1", promptId: offer.id })), "ok");
  s = await st("s1"); offer = Object.values(s.prompts).find((p) => p.kind === "actingCaptain" && p.status === "open");
  assert.equal(offer.to, "w2", "a decline offers it to the next person"); assert.deepEqual(s.captainDeclined, ["mod1"]);
  r = await as("w2", "dutyTakeLead", { streamId: "s1", promptId: offer.id });
  assert.equal(r.role, "captain"); s = await st("s1"); assert.deepEqual({ uid: s.captainNow.uid, acting: s.captainNow.acting }, { uid: "w2", acting: true });
  assert.deepEqual(s.onDuty.w2.roles.map((x) => x.role).sort(), ["captain", "lead"], "the acting Captain keeps their own Lead role");
  // minutes while holding both: one rate at a time (the Captain line, not both)
  clock += MIN; await as("w2", "dutyPing", { streamId: "s1" });
  const w2d = await rec("s1", "w2"); assert.ok(w2d.lines.captain >= 1, "paid at the Captain rate"); assert.equal(Object.keys(w2d.lines).filter((k) => k.startsWith("lead")).length, 1, "the Lead line stays what it was");
  // the seated Captain arrives and takes over at once
  at(20); r = await as("capt", "dutyClockIn", { streamId: "s1" });
  s = await st("s1"); assert.deepEqual({ uid: s.captainNow.uid, acting: s.captainNow.acting }, { uid: "capt", acting: false }, "a seated Captain takes over from the acting one at once");
  assert.equal(s.onDuty.w2.roles.some((x) => x.role === "captain"), false); assert.equal(s.onDuty.w2.roles.some((x) => x.role === "lead"), true, "the acting Captain keeps their own role");
  assert.ok(Object.values(s.prompts).some((p) => p.kind === "thanks" && p.to === "w2" && p.text === "Thanks for holding the helm"));
  assert.equal(r.showed, false, "the Captain clocked in 19 minutes after the start: no showed-up Gears");

  // ================================================================ step away, handoffs
  assert.equal(await why(as("mod1", "dutyStepAway", { streamId: "s1", kind: "7" })), "args");
  // a second Deckhand in twitch for a two-person race
  await as("dk3", "dutyClockIn", { streamId: "s1", room: "twitch" });
  at(25); r = await as("mod1", "dutyStepAway", { streamId: "s1", kind: "15" });
  s = await st("s1"); assert.ok(s.onDuty.mod1.away);
  const ho = Object.values(s.prompts).find((p) => p.kind === "handoff" && p.status === "open");
  assert.equal(ho.room, "twitch"); assert.deepEqual(ho.to.sort(), ["dk1", "dk3", "lockee"], "the room's Deckhands get the handoff prompt"); assert.equal(ho.text, "Take the lead?");
  assert.equal(s.rooms.twitch.covered, false, "while the Lead is away the room shows needed");
  clock += 30000; await as("dk1", "dutyPing", { streamId: "s1" });
  assert.equal((await as("dk1", "dutyTakeLead", { streamId: "s1", promptId: ho.id })).role, "lead");
  assert.equal(await why(as("dk3", "dutyTakeLead", { streamId: "s1", promptId: ho.id })), "beaten", "the second accept: someone beat you to it");
  assert.equal(await msgOf(as("dk3", "dutyTakeLead", { streamId: "s1", promptId: ho.id })), "Someone beat you to it.");
  s = await st("s1"); assert.equal(s.takeovers.dk1, 1); assert.equal(s.rooms.twitch.lead, "dk1_h"); assert.equal(s.rooms.twitch.covered, true);
  assert.equal((await rec("s1", "dk1")).takeovers.length, 1);
  // back from the break: the Lead is the Lead again, the acting Lead is a Deckhand
  at(33); r = await as("mod1", "dutyBack", { streamId: "s1" });
  s = await st("s1"); assert.equal(s.onDuty.mod1.away, null); assert.deepEqual(s.onDuty.mod1.roles, [{ role: "lead", room: "twitch" }]);
  assert.deepEqual(s.onDuty.dk1.roles, [{ role: "deckhand", room: "twitch" }], "the acting lead goes back to Deckhand"); assert.equal(s.rooms.twitch.lead, "mod1_h");
  // away: minutes pause
  at(34); await as("dk3", "dutyStepAway", { streamId: "s1", kind: "5" });
  const before = (await rec("s1", "dk3")).minutes; at(36); r = await as("dk3", "dutyPing", { streamId: "s1" }); assert.equal(r.counted, 0, "no minutes while stepped away");
  assert.equal((await rec("s1", "dk3")).minutes, before);
  // nobody takes the handoff in 2 minutes: the Captain is nudged and the room shows needed
  at(40); await as("mod1", "dutyStepAway", { streamId: "s1", kind: "30" });
  await as("dk3", "dutyBack", { streamId: "s1" });                        // dk3 is back but the handoff goes to dk1 and dk3: nobody accepts
  at(41); await duty.tick({ id: "s1", ...(await get("streams/s1")) }, clock);
  assert.ok(Object.values((await st("s1")).prompts).some((p) => p.kind === "handoff" && p.status === "open"), "inside the 2 minutes it still waits");
  at(43); await duty.tick({ id: "s1", ...(await get("streams/s1")) }, clock);
  s = await st("s1");
  assert.ok(Object.values(s.prompts).some((p) => p.kind === "handoff" && p.status === "expired")); assert.ok(Object.values(s.prompts).some((p) => p.kind === "needed" && p.to === "capt" && p.room === "twitch"), "the Captain gets the needed prompt");
  assert.equal(s.rooms.twitch.covered, false);
  // a break that ran 10 minutes over just ends: back as a Deckhand
  at(71); await duty.tick({ id: "s1", ...(await get("streams/s1")) }, clock);         // away until 40+30=70, +10 = 80: not yet
  assert.ok((await st("s1")).onDuty.mod1.away, "not yet overstayed");
  at(81); await duty.tick({ id: "s1", ...(await get("streams/s1")) }, clock);
  s = await st("s1"); assert.equal(s.onDuty.mod1.away, null); assert.deepEqual(s.onDuty.mod1.roles, [{ role: "deckhand", room: "twitch" }], "overstaying by 10 minutes ends the break: back as a Deckhand");
  // done for tonight clocks out and runs the handoff
  at(82); await as("dk3", "dutyStepAway", { streamId: "s1", kind: "done" });
  s = await st("s1"); assert.equal(s.onDuty.dk3, undefined); assert.ok((await rec("s1", "dk3")).segments.every((g) => g.out != null), "clocked out: segments closed");

  // ================================================================ the Captain steps away; captainSet; reassign
  at(85); await as("capt", "dutyStepAway", { streamId: "s1", kind: "5" });
  s = await st("s1"); const ch = Object.values(s.prompts).find((p) => p.kind === "captainHandoff" && p.status === "open");
  assert.equal(s.captainNow, null); assert.equal(ch.to, "w2", "Captain steps away: offered to the highest-grade Room Lead on duty");
  assert.equal(await why(as("w2", "dutyDecline", { streamId: "s1", promptId: ch.id })), "ok");
  s = await st("s1"); const next = Object.values(s.prompts).find((p) => p.kind === "captainHandoff" && p.status === "open");
  assert.ok(!next || next.to !== "w2");
  await as("capt", "dutyBack", { streamId: "s1" });
  s = await st("s1"); assert.deepEqual({ uid: s.captainNow.uid, acting: s.captainNow.acting }, { uid: "capt", acting: false }, "back from a break: the Captain is the Captain again");
  assert.equal(await why(as("capt", "captainSet", { streamId: "s1", uid: "w2" })), "notOwner");
  r = await as("boss", "captainSet", { streamId: "s1", uid: "mod1" });
  s = await st("s1"); assert.deepEqual({ uid: s.captainNow.uid, acting: s.captainNow.acting }, { uid: "mod1", acting: true }, "the owner picks the Captain");
  assert.equal(await why(as("boss", "captainSet", { streamId: "s1", uid: "dk2" })), "gradeTooLow");
  await as("boss", "captainSet", { streamId: "s1", uid: "capt" }); s = await st("s1"); assert.equal(s.captainNow.uid, "capt"); assert.equal(s.captainNow.acting, false, "the seated Captain, set by the owner, is not acting");
  assert.equal((await wdb.collection("adminLog").get()).docs.filter((x) => x.get("action") === "captainSet").length, 2, "adminLog captainSet");
  // reassign
  assert.equal(await why(as("dk1", "dutyReassign", { streamId: "s1", uid: "dk2", room: "ytVertical", role: "deckhand" })), "notCaptain");
  assert.equal((await as("capt", "dutyReassign", { streamId: "s1", uid: "dk2", room: "ytVertical", role: "deckhand" })).moved, true);
  assert.deepEqual((await st("s1")).onDuty.dk2.roles, [{ role: "deckhand", room: "ytVertical" }]);
  assert.equal(await why(as("capt", "dutyReassign", { streamId: "s1", uid: "dk2", room: "ytLandscape", role: "lead" })), "gradeTooLow", "within the person's grade");
  assert.equal(await why(as("capt", "dutyReassign", { streamId: "s1", uid: "mod1", room: "ytVertical", role: "lead" })), "leadTaken");
  r = await as("capt", "dutyReassign", { streamId: "s1", uid: "mod1", room: "ytLandscape", role: "lead" });
  assert.ok(r.prompt, "into Lead: an accept prompt instead of an instant move"); assert.deepEqual((await st("s1")).onDuty.mod1.roles, [{ role: "deckhand", room: "twitch" }].concat([]), "nothing moves until they accept");
  assert.equal((await as("mod1", "dutyTakeLead", { streamId: "s1", promptId: r.prompt })).role, "lead");
  assert.deepEqual((await st("s1")).onDuty.mod1.roles, [{ role: "lead", room: "ytLandscape" }]);
  assert.equal((await as("capt", "dutyReassign", { streamId: "s1", uid: "mod1", room: "ytLandscape", role: "free" })).freed, true, "freeing a Lead seat steps the holder down");
  assert.deepEqual((await st("s1")).onDuty.mod1.roles, [{ role: "deckhand", room: "ytLandscape" }]);
  assert.equal((await wdb.collection("adminLog").get()).docs.filter((x) => x.get("action") === "dutyReassign").length >= 3, true, "adminLog dutyReassign");

  // ================================================================ quiet leads
  await as("capt", "dutyReassign", { streamId: "s1", uid: "mod1", room: "twitch", role: "lead" }).then((x) => as("mod1", "dutyTakeLead", { streamId: "s1", promptId: x.prompt }));
  at(130); await as("capt", "dutyPing", { streamId: "s1" }); await as("w2", "dutyPing", { streamId: "s1" });      // mod1 has not pinged since +33
  await duty.tick({ id: "s1", ...(await get("streams/s1")) }, clock);
  s = await st("s1");
  const quiet = Object.values(s.prompts).find((p) => p.kind === "quiet" && p.about === "mod1");
  assert.ok(quiet, "no ping for 20 minutes while holding Lead: a gentle nudge"); assert.equal(quiet.to, "capt", "to the Captain");
  assert.deepEqual(s.onDuty.mod1.roles, [{ role: "lead", room: "twitch" }], "nothing is taken away");
  await duty.tick({ id: "s1", ...(await get("streams/s1")) }, clock); assert.equal(Object.values((await st("s1")).prompts).filter((p) => p.kind === "quiet").length, 1, "one nudge, not one a minute");
  at(131); await as("mod1", "dutyPing", { streamId: "s1" });

  // ================================================================ public/live deck: handles and counts only
  await ctx.publishLive();
  const pub = await get("public/live");
  assert.ok(pub.deck && pub.deck.rooms.twitch, "public/live carries the Deck's room coverage");
  assert.equal(pub.deck.rooms.twitch.lead, "mod1_h"); assert.equal(pub.deck.rooms.twitch.covered, true); assert.equal(typeof pub.deck.rooms.twitch.deckhands, "number");
  const pubText = JSON.stringify(pub);
  for (const uid of ["boss", "adm2", "capt", "mod1", "w2", "dk1", "dk2", "dk3", "dk9", "lockee"]) assert.ok(!new RegExp(`"${uid}"`).test(pubText), `public/live has no bare uid ${uid}`);
  assert.deepEqual(L.findSecrets(pub, {}), [], "the deep scan is clean");
  assert.ok(L.findSecrets({ deck: { rooms: { twitch: { lead: "x", uid: "u1" } } } }, {}).length > 0, "a uid inside deck would be caught");
  assert.deepEqual(L.buildPublicLive({ stream: null, nowMs: 1 }).deck, { rooms: {} }, "off air: an empty deck");
  assert.deepEqual(L.buildPublicLive({ stream: { id: "x", state: "live", beats: {} }, deck: { rooms: { twitch: { lead: "a", deckhands: 2, covered: true, uid: "leak" }, mars: { lead: "b" } } }, nowMs: 1 }).deck, { rooms: { twitch: { lead: "a", deckhands: 2, covered: true } } }, "only known rooms and fields get through");

  // ================================================================ Stop: clocked out, no-shows, the confirm prompt
  at(300); await as("capt", "dutyPing", { streamId: "s1" });
  const stopAt = T0 + 7 * H; clock = stopAt;
  await as("adm2", "stopStream", { streamId: "s1" });
  s = await st("s1");
  assert.equal(s.state, "ended"); assert.deepEqual(s.onDuty, {}); assert.equal(s.captainNow, null); assert.equal(s.captainAtStop, "capt"); assert.equal(s.needsConfirm, true);
  assert.deepEqual({ kind: s.prompts.confirm.kind, to: s.prompts.confirm.to }, { kind: "confirm", to: "capt" }, "a confirm prompt for the Captain");
  for (const u of ["capt", "dk1", "w2", "mod1", "dk2", "lockee"]) assert.ok((await rec("s1", u)).segments.every((g) => g.out != null), `${u}: segments closed at Stop`);
  const noShow = await rec("s1", "dk9"); assert.equal(noShow.noShow, true, "a seat nobody clocked into is a no-show"); assert.deepEqual(noShow.segments, []); assert.deepEqual(noShow.scheduled, { role: "deckhand", room: "twitch" });
  assert.equal(await why(as("dk1", "dutyPing", { streamId: "s1" })), "ended", "a ping after Stop is refused");
  assert.equal(await why(as("dk1", "dutyClockIn", { streamId: "s1" })), "ended", "clock in after Stop is refused");
  assert.equal(await why(as("dk1", "dutyConfirmNight", { streamId: "s1" })), "notCaptain");
  assert.equal(await why(as("capt", "dutyConfirmNight", { streamId: "nope" })), "noStream");
  const cs = await get("streams/s1"); assert.equal(cs.state, "ended");

  // ================================================================ confirm with added minutes, then the payout
  // give people the minutes the design calls for (the Deck pings are covered above): a 7 hour stream
  const setLines = (u, lines, extra = {}) => wdb.doc(`${S}/crew/main/duties/s1_${u}`).set({ lines, minutes: D.totalMinutes(lines), ...extra }, { merge: true });
  await setLines("capt", { captain: 120 }); await setLines("mod1", { "lead:twitch": 100 }); await setLines("w2", { "lead:ytLandscape": 90, "deckhand:ytVertical": 60, captain: 20 });
  await setLines("dk1", { "deckhand:twitch": 400 }, { takeovers: [{ id: "o1", at: 1 }, { id: "o2", at: 2 }, { id: "o3", at: 3 }, { id: "o4", at: 4 }] });
  await setLines("dk2", { "deckhand:ytVertical": 40 }); await setLines("lockee", { "deckhand:twitch": 100 });
  await wdb.doc(`${S}/crew/main/roster/capt`).update({ stats: { duties: 9 } });
  assert.equal(await why(as("mod1", "dutyConfirmNight", { streamId: "s1" })), "notCaptain", "only the Captain or the owner");
  assert.equal(await why(as("capt", "dutyConfirmNight", { streamId: "s1", added: { fan: 10 } })), "notCrew");
  assert.equal(await why(as("capt", "dutyConfirmNight", { streamId: "s1", added: { dk2: 0 } })), "args");
  assert.equal(await why(as("capt", "dutyConfirmNight", { streamId: "s1", added: { dk2: 999 } })), "args");
  const conf = await as("capt", "dutyConfirmNight", { streamId: "s1", added: { dk2: 360, dk3: 30 } });
  assert.equal(conf.added.dk2, 360 > 420 - 40 ? 380 : 360, "added minutes are whole and capped by the stream's length");
  assert.ok((await rec("s1", "dk2")).minutes <= 420, "never past the stream's length");
  assert.equal(conf.added.dk3 <= 30, true);
  assert.equal((await st("s1")).needsConfirm, false); assert.ok((await st("s1")).confirmedAt);
  assert.equal(await why(as("capt", "dutyConfirmNight", { streamId: "s1" })), "alreadyConfirmed");
  const gear = async (key) => (await wdb.doc(`${S}/crew/main/gears/${key}`).get()).data();
  assert.equal((await gear("duty:s1:capt:captain")).amount, 24, "Captain: 120 min at 12/h");
  assert.equal((await gear("duty:s1:mod1:lead:twitch")).amount, 17, "Room Lead: 100 min at 10/h, rounded per line");
  assert.equal((await gear("duty:s1:w2:lead:ytLandscape")).amount, 23, "YouTube Lead: 90 min x 10/h x 1.5 boost");
  assert.equal((await gear("duty:s1:w2:deckhand:ytVertical")).amount, 9, "YouTube Deckhand: 60 min x 6/h x 1.5");
  assert.equal((await gear("duty:s1:w2:captain")).amount, 4, "the acting Captain's own minutes, at the Captain rate");
  assert.equal((await gear("duty:s1:dk1:deckhand:twitch")).amount, 36, "the 6-hour cap: 400 minutes pay as 360");
  assert.equal((await gear("showed:s1:dk1")).amount, 5, "showed up (seated, clocked in within 15 minutes)");
  assert.equal(await gear("showed:s1:dk2"), undefined, "a drop-in earns no showed-up Gears");
  assert.equal(await gear("showed:s1:capt"), undefined, "the Captain clocked in late");
  assert.equal((await gear("takeover:s1:o1:dk1")).amount, 5); assert.equal((await gear("takeover:s1:o3:dk1")).amount, 5); assert.equal(await gear("takeover:s1:o4:dk1"), undefined, "took over: at most 3 a stream");
  assert.equal((await wdb.doc(`${S}/crew/main/roster/capt`).get()).get("stats").duties, 10, "the 10th counted duty");
  const ledgerBefore = (await wdb.collection(`${S}/crew/main/gears`).get()).docs.map((x) => [x.id, x.get("amount")]).sort();
  const again = await duty.payNight("s1");               // a retry pays nothing: the doc is confirmed and the keyed ids exist
  assert.equal(again.paid.length, 0);
  await wdb.doc(`${S}/crew/main/duties/s1_capt`).update({ confirmedAt: null });         // even with the flag cleared, the keyed ledger ids never pay twice
  await duty.payNight("s1");
  assert.deepEqual((await wdb.collection(`${S}/crew/main/gears`).get()).docs.map((x) => [x.id, x.get("amount")]).sort(), ledgerBefore, "keyed ids never pay twice");
  // counted and led
  assert.equal((await rec("s1", "capt")).counted, true); assert.equal((await rec("s1", "capt")).led, true);
  assert.equal((await rec("s1", "dk2")).counted, true); assert.equal((await rec("s1", "dk2")).led, false);
  assert.equal((await rec("s1", "dk9")).counted, false, "a no-show never counts");
  assert.equal((await rec("s1", "w2")).gears.lines.length >= 3, true);
  // badges
  assert.ok(badges.some((b) => b.uid === "capt" && b.id === "crew-duties-10"), "10th duty: the duties ladder badge");
  assert.ok(badges.some((b) => b.uid === "w2" && b.id === "youtube-pioneer-1"), "first YouTube room led for 30+ minutes: YouTube Pioneer");
  assert.ok(!badges.some((b) => b.uid === "dk1" && /duties/.test(b.id)));
  assert.equal((await wdb.collection("adminLog").get()).docs.filter((x) => x.get("action") === "dutyConfirmNight").length >= 1, true, "adminLog dutyConfirmNight");

  // ================================================================ all decline: the owner is Captain
  clock = T0 + 10 * H;
  await mkStream("s2", { plannedStart: TS(clock + H), crew: undefined }, { captain: null, chats: { twitch: { lead: null, deckhands: [] }, ytLandscape: { lead: null, deckhands: [] }, ytVertical: { lead: null, deckhands: [] } }, caps: { deckhands: 2 } });
  clock += H; await as("adm2", "startStream", { streamId: "s2" });
  await as("w2", "dutyClockIn", { streamId: "s2", room: "twitch", role: "lead" });
  s = await wdb.doc(`${S}/streams/s2/private/duty`).get(); const o2 = Object.values(s.data().prompts).find((p) => p.kind === "actingCaptain");
  assert.equal(o2.to, "w2", "nobody seated: acting Captain is offered at once");
  await as("w2", "dutyDecline", { streamId: "s2", promptId: o2.id });
  s = (await wdb.doc(`${S}/streams/s2/private/duty`).get()).data();
  assert.deepEqual({ uid: s.captainNow.uid, owner: s.captainNow.owner, acting: s.captainNow.acting }, { uid: "boss", owner: true, acting: false }, "if everyone declines, the owner is Captain");
  // the after-show: no seats, Deckhand only, in the site room
  await as("adm2", "liveAfterShow", { streamId: "s2" }).catch(() => {});
  const afterId = (await get("streams/s2")).afterShowId;
  if (afterId) {
    await wdb.doc(`${S}/streams/${afterId}/private/draft`).set({ crew: { captain: { uid: "capt", handle: "capt_h" }, chats: {}, caps: { deckhands: 2 } } });
    assert.equal(await why(as("capt", "dutyClockIn", { streamId: afterId, role: "lead", room: "site" })), "afterShow", "the after-show has no Lead seats");
    r = await as("capt", "dutyClockIn", { streamId: afterId, room: "site" });
    assert.deepEqual(r.roles, [{ role: "deckhand", room: "site" }], "no seats at the after-show: a drop-in Deckhand in the site room, even for the seated Captain");
  }

  for (const id of [afterId, "s2"]) { if (id) { try { await as("adm2", "stopStream", { streamId: id }); } catch (e) { /* already ended */ } } }
  // ================================================================ auto-confirm after 24 hours
  clock = T0 + 20 * H; await mkStream("s3", { plannedStart: TS(clock + H) }, { captain: null, chats: { twitch: { lead: null, deckhands: [{ uid: "dk1", handle: "dk1_h" }] }, ytLandscape: { lead: null, deckhands: [] }, ytVertical: { lead: null, deckhands: [] } }, caps: { deckhands: 2 } });
  clock += H; await as("adm2", "startStream", { streamId: "s3" }); await as("dk1", "dutyClockIn", { streamId: "s3" });
  for (let i = 1; i <= 90; i++) { clock += MIN; await as("dk1", "dutyPing", { streamId: "s3" }); }
  await as("adm2", "stopStream", { streamId: "s3" });
  await duty.runAutoConfirm(clock + 23 * H);                       // older nights (s2 and its after-show) are confirmed; this one is inside 24 hours
  assert.equal((await st("s3")).confirmedAt, null, "inside 24 hours nothing is confirmed");
  assert.deepEqual(await duty.runAutoConfirm(clock + 25 * H), { confirmed: 1 }, "older than 24 hours: confirmed with the heartbeat minutes");
  assert.equal((await gear("duty:s3:dk1:deckhand:twitch")).amount, 9, "90 minutes at 6/h"); assert.equal((await rec("s3", "dk1")).confirmedBy, "auto");
  assert.deepEqual(await duty.runAutoConfirm(clock + 26 * H), { confirmed: 0 });

  // ================================================================ nightly reliability and the lockout
  const relMod = require("../lib/crew/reliability").makeReliability({ db: wdb, now: () => clock });
  clock = T0 + 40 * 86400000;
  const seatDuty = (sid, uid, clocked, endedAt) => wdb.doc(`${S}/crew/main/duties/${sid}_${uid}`).set({ streamId: sid, uid, scheduled: { role: "lead", room: "twitch" }, segments: clocked ? [{ role: "lead", room: "twitch", in: 1, out: 2 }] : [], endedAt, noShow: !clocked, confirmedAt: null });
  await seatDuty("a1", "dk3", true, clock - 10 * 86400000); await seatDuty("a2", "dk3", false, clock - 8 * 86400000);
  await relMod.run(clock);
  let rr = (await wdb.doc(`${S}/crew/main/roster/dk3/private/record`).get()).data();
  assert.equal(rr.keptSeats90, 2); assert.equal(rr.showed90, 1); assert.equal(rr.reliability, 0.5); assert.equal(rr.noShows.length, 1); assert.equal(rr.lockUntil, undefined, "one no-show is no lockout");
  assert.equal((await wdb.doc(`${S}/crew/main/roster/dk9/private/record`).get()).get("noShows").length, 1, "the s1 seat nobody clocked into counts");
  // a late swap nobody took counts as a no-show, and a swap closed by Delay or Cancel never does
  await wdb.doc(`${S}/crew/main/swaps/x_twitch:lead`).set({ streamId: "x", fromUid: "dk3", status: "closed", countsAsNoShow: true, startsAt: TS(clock - 3 * 86400000), closedAt: TS(clock - 3 * 86400000), noRecord: false });
  await wdb.doc(`${S}/crew/main/swaps/y_twitch:lead`).set({ streamId: "y", fromUid: "dk3", status: "closed", countsAsNoShow: false, noRecord: true, startsAt: TS(clock - 2 * 86400000) });
  await seatDuty("a3", "dk3", false, clock - 5 * 86400000);
  await relMod.run(clock);
  rr = (await wdb.doc(`${S}/crew/main/roster/dk3/private/record`).get()).data();
  assert.equal(rr.noShows.length, 3, "seats and an untaken late drop; the Delay or Cancel swap is not counted"); assert.ok(rr.lockUntil.toMillis() >= clock + 29 * 86400000, "3 no-shows in 90 days: locked for 30 days");
  const lockedUntil = rr.lockUntil.toMillis();
  await relMod.run(clock + 86400000); assert.equal((await wdb.doc(`${S}/crew/main/roster/dk3/private/record`).get()).get("lockUntil").toMillis(), lockedUntil, "the next night doesn't extend it");
  assert.equal(await why(as("adm2", "crewLockLift", { uid: "dk3" })), "notOwner"); assert.equal(await why(as("fan", "crewLockLift", { uid: "dk3" })), "notOwner");
  assert.equal((await as("boss", "crewLockLift", { uid: "dk3" })).lifted, true);
  assert.equal((await wdb.doc(`${S}/crew/main/roster/dk3/private/record`).get()).get("lockUntil"), undefined, "the owner lifts it");
  await relMod.run(clock + 2 * 86400000); assert.equal((await wdb.doc(`${S}/crew/main/roster/dk3/private/record`).get()).get("lockUntil"), undefined, "the same no-shows never lock them again");
  assert.equal((await wdb.collection("adminLog").get()).docs.filter((x) => x.get("action") === "crewLockLift").length, 1, "adminLog crewLockLift");
  assert.equal(await why(as("fan", "dutyPing", { streamId: "s3" })), "notCrew");

  // ================================================================ the presence hook (not called yet) and liveTick idle
  clock = T0 + 60 * H; await mkStream("s4", { plannedStart: TS(clock + H) }, { captain: null, chats: { twitch: { lead: null, deckhands: [{ uid: "dk1", handle: "dk1_h" }] }, ytLandscape: { lead: null, deckhands: [] }, ytVertical: { lead: null, deckhands: [] } }, caps: { deckhands: 2 } });
  clock += H; await as("adm2", "startStream", { streamId: "s4" }); await as("dk1", "dutyClockIn", { streamId: "s4" });
  clock += MIN; assert.equal((await duty.creditPresence("s4", "dk1", clock)).counted, 1); assert.equal((await duty.creditPresence("s4", "dk1", clock + 1000)).counted, 0, "a minute counts once");
  assert.equal((await duty.creditPresence("s4", "fan", clock)).counted, 0, "only people clocked in");
  assert.equal(await why(as("fan", "dutyConfirmNight", { streamId: "s4" })), "notEnded");
  await as("adm2", "stopStream", { streamId: "s4" });
  assert.deepEqual(await duty.tick({ id: "s4" }, clock), { idle: true }, "nothing live: the tick does nothing");
  assert.deepEqual(await duty.tick({ id: "none" }, clock), { idle: true });

  // ================================================================ rules and the shared-file wiring
  const rules = fs.readFileSync(path.join(__dirname, "..", "..", "firestore.rules"), "utf8");
  assert.ok(/docId == 'duty' && \(isSiteStaff\(siteId\) \|\| isSiteOwner\(siteId\)\)/.test(rules), "private/duty: crew and the owner read it");
  assert.ok(/docId == 'control' && isOwnerOrA2Plus\(siteId\)/.test(rules), "private/control stays owner and A2+");
  assert.ok(/match \/duties\/\{dutyId\} \{\s+allow read: if request\.auth != null && \(resource\.data\.uid == request\.auth\.uid \|\| hasSiteRole\(siteId, 'admin'\) \|\| isSiteOwner\(siteId\)\);\s+allow write: if false;/.test(rules), "duties: the person, admins and the owner read; no client writes");
  const src = (f) => fs.readFileSync(path.join(__dirname, "..", "lib", f), "utf8");
  assert.ok(/ctx\.duty\.onStart\(/.test(src("live/controls.js")) && /ctx\.duty\.closeOut\(/.test(src("live/controls.js")), "startStream and Stop call the duty hooks");
  assert.ok(/ctx\.duty\.tick\(/.test(src("live/feeds.js")), "liveTick runs the duty tick after the stream-live check");
  assert.ok(/every day 03:30/.test(src("crew/core.js")) && /reliability/.test(src("crew/core.js")), "crewNightly runs reliability at 03:30");
  for (const fn of ["dutyClockIn", "dutyPing", "dutyStepAway", "dutyBack", "dutyTakeLead", "dutyDecline", "dutyReassign", "captainSet", "dutyConfirmNight", "dutyAutoConfirm", "crewLockLift"]) assert.equal(typeof fns[fn], "function", `${fn} is exported`);
  console.log("check-duty: ok");
}
main().catch((e) => { console.error(e); process.exit(1); });
