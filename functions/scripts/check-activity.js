#!/usr/bin/env node
// functions/scripts/check-activity.js: Mod Machina phase 3 part 7, the activity rules (crewSetRules, the monthly run, reminders, back to Active, the ballot and join rules;
// docs/specs/mod-machina.md sections 3f and 17a), run against the in-memory Firestore. No network, no deploy.
//   npm run check      (or node scripts/check-activity.js)
const assert = require("assert/strict");
const { makeDb } = require("./fixtures/fake-firestore");

const admin = require("firebase-admin");
process.env.GCLOUD_PROJECT ||= "boomertanger-staging";
process.env.FIREBASE_CONFIG ||= JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const wdb = makeDb(); const realFs = admin.firestore;
const fakeFs = () => wdb; fakeFs.Timestamp = realFs.Timestamp; fakeFs.FieldValue = realFs.FieldValue;
Object.defineProperty(admin, "firestore", { value: fakeFs, configurable: true, writable: true });
const TS = (m) => realFs.Timestamp.fromMillis(m);
const S = "sites/boomertanger", C = `${S}/crew/main`;
const H = 3600000, DAY = 24 * H, MIN = 60000;
const adminLogEntry = async (_d, f) => ({ ...f, createdAt: realFs.Timestamp.now() });
const ACT = require("../lib/crew/activity");
const P = ACT.pure;
const why = async (p) => { try { await p; return "ok"; } catch (e) { return e.details?.reason || e.message; } };
const get = async (p) => (await wdb.doc(p).get()).data();
const list = async (p) => (await wdb.collection(p).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const roster = (uid) => get(`${C}/roster/${uid}`);
const noticesOf = async (uid) => (await list(`${C}/notices`)).filter((n) => n.uid === uid);

let clock = 0;
const granted = [];
const grant = { grantBadge: async (uid, id, o) => { granted.push({ uid, id, ref: o.ref }); return { granted: true }; } };
const A = ACT.makeActivity({ db: wdb, Timestamp: realFs.Timestamp, adminLogEntry, grant, now: () => clock });
const at = (ym, day, hour = 12) => P.monthStart(ym) + (day - 1) * DAY + hour * H;   // a Central wall time (close enough: day + hours from the month's start)

let sid = 0;
async function streams(ym, n, { ran = true } = {}) {
  const ids = [];
  for (let i = 0; i < n; i++) {
    const id = `s${++sid}`, start = at(ym, 2 + i, 19);
    await wdb.doc(`${S}/streams/${id}`).set({ title: `Stream ${id}`, state: ran ? "ended" : "scheduled", published: true, plannedStart: TS(start), ...(ran ? { actualStart: TS(start), actualEnd: TS(start + 3 * H) } : {}), rooms: ["twitch"], crew: { captain: null, chats: {}, caps: { deckhands: 2 } } });
    ids.push(id);
  }
  return ids;
}
async function duty(streamId, uid, { counted = true, led = false, confirmed = true, lines = null } = {}) {
  await wdb.doc(`${C}/duties/${streamId}_${uid}`).set({ streamId, uid, counted: confirmed ? counted : false, led: confirmed ? led : false, minutes: counted ? 120 : 20, confirmedAt: confirmed ? TS(clock) : null, lines: lines || {} });
}
async function person(uid, r) {
  await wdb.doc(`${S}/members/${uid}`).set({ roles: [r.track === "admin" ? "admin" : "mod"] });
  await wdb.doc(`${S}/profiles/${uid}`).set({ handle: uid });
  await wdb.doc(`${C}/roster/${uid}`).set({ handle: uid, track: "mod", grade: 2, status: "active", since: TS(at("2026-06", 1)), statusSince: TS(at("2026-06", 1)), missedMonths: 0, activeStreak: 0, excusedMonths: [], ...r });
}
const settings = (patch) => wdb.doc(C).set(patch, { merge: true });

async function main() {
  // ---------- pure ----------
  assert.deepEqual(P.minimumFor({ track: "mod", grade: 1 }, false), { need: 2, led: false, adminRoute: false });
  assert.deepEqual(P.minimumFor({ track: "mod", grade: 3 }, false), { need: 3, led: true, adminRoute: false });
  assert.deepEqual(P.minimumFor({ track: "admin", grade: 2 }, false), { need: 2, led: false, adminRoute: true });
  for (const r of [{ track: "mod", grade: 4 }, { track: "admin", grade: 1 }]) assert.equal(P.minimumFor(r, true).need, 1, "light month: 1 for everyone");
  assert.equal(P.meets(P.minimumFor({ track: "mod", grade: 3 }, false), { counted: 3, led: 0 }), false, "Warden: 3 with none led isn't enough");
  assert.equal(P.meets(P.minimumFor({ track: "mod", grade: 3 }, false), { counted: 3, led: 1 }), true);
  assert.equal(P.meets(P.minimumFor({ track: "admin", grade: 2 }, false), { counted: 1, adminWork: 1 }), true, "admins: 1 duty + admin work");
  assert.equal(P.meets(P.minimumFor({ track: "admin", grade: 2 }, false), { counted: 1, adminWork: 0 }), false);
  assert.equal(P.monthStart("2026-11"), Date.UTC(2026, 10, 1, 5), "Nov 1 00:00 CDT"); assert.equal(P.monthStart("2026-12"), Date.UTC(2026, 11, 1, 6), "Dec 1 00:00 CST");
  assert.equal(P.progressLine(P.minimumFor({ track: "mod", grade: 3 }, false), { counted: 1, led: 0 }), "1 of 3 duties, at least 1 as Room Lead or Captain");

  // ---------- the cast ----------
  await wdb.doc(S).set({ ownerUid: "boss" });
  await wdb.doc(`${S}/members/boss`).set({ roles: ["admin"] }); await wdb.doc(`${S}/profiles/boss`).set({ handle: "boss" });
  await wdb.doc(`${S}/badges/on-the-clock`).set({ id: "on-the-clock", name: "On the Clock", collection: "crew", rarity: 2, source: "stream", limited: { label: "Monthly", opensAt: null, closesAt: null }, crewOnly: true, holders: 3, status: "active" });
  await person("a", {});                                                         // active, does nothing
  await person("b", { status: "checkIn", missedMonths: 1 });                     // Check-in, comes back
  await person("c", { activeStreak: 2 });                                        // does 4 a month
  await person("w", { grade: 3 });                                              // Warden: 3 a month, 1 led
  await person("e", { status: "checkIn", missedMonths: 1 });                     // Check-in, keeps missing
  await person("j", { since: TS(at("2026-11", 15)) });                           // joined mid-November
  await person("x", { excusedMonths: ["2026-11", "2026-12"] });                  // excused
  await person("g", { status: "goingDark", statusSince: TS(at("2026-10", 20)), breakUntil: TS(at("2026-11", 19)) });
  await person("p", { status: "paused" });
  await person("adm", { track: "admin", grade: 2 });

  // ---------- crewSetRules ----------
  const F = ACT({ adminLogEntry });
  const as = (uid, data) => F.crewSetRules.run({ auth: uid ? { uid, token: {} } : undefined, data });
  assert.equal(await why(as(null, { on: true })), "signedOut");
  assert.equal(await why(as("a", { on: true })), "notOwner");
  assert.equal(await why(as("boss", { on: "yes" })), "args");
  assert.equal(await why(as("boss", { on: true, startMonth: "2026-13" })), "startMonth");
  assert.equal(await why(as("boss", { on: true, startMonth: "2020-01" })), "pastMonth");
  const realNext = P.nextMonth(P.monthOf(Date.now()));
  let r = await as("boss", { on: true });
  assert.equal(r.rulesSince, realNext, "defaults to the next calendar month"); assert.equal(r.graceMonth, realNext);
  r = await as("boss", { on: true, startMonth: "2099-11" });
  let st = await get(C);
  assert.equal(st.activityRules, true); assert.equal(st.rulesSince, "2099-11"); assert.equal(st.graceMonth, "2099-11");
  assert.ok((await list("adminLog")).some((l) => l.action === "crewRules" && l.actorUid === "boss"));
  assert.ok((await noticesOf("a")).some((n) => n.kind === "rules" && /November 1/.test(n.title) && /practice month/.test(n.text)), "the crew hear about it");
  assert.equal((await noticesOf("p")).length, 0, "Paused crew don't");
  await as("boss", { on: false });
  st = await get(C);
  assert.equal(st.activityRules, false); assert.equal(st.rulesSince, "2099-11", "off keeps the history");

  // ---------- rules off / before rulesSince: nothing changes ----------
  const before = JSON.stringify(await list(`${C}/roster`));
  clock = at("2026-12", 1, 0) + 10 * MIN;
  assert.equal((await A.runMonthly(clock)).skipped, "rulesOff");
  await settings({ activityRules: true, rulesSince: "2026-11", graceMonth: "2026-11" });
  clock = at("2026-11", 1, 0) + 10 * MIN;
  assert.equal((await A.runMonthly(clock)).skipped, "beforeRulesSince", "October is before the rules start");
  assert.equal(JSON.stringify(await list(`${C}/roster`)), before, "nothing changed");

  // ---------- November: the grace month ----------
  const nov = await streams("2026-11", 8);
  clock = at("2026-11", 28);
  await duty(nov[0], "b"); await duty(nov[1], "b");
  for (const s of nov.slice(0, 4)) await duty(s, "c");
  await duty(nov[0], "w"); await duty(nov[1], "w"); await duty(nov[2], "w");      // 3, none led
  await duty(nov[3], "e");
  await duty(nov[5], "j"); await duty(nov[4], "adm");
  await duty(nov[6], "a", { counted: false });                                    // under an hour: not a duty
  await wdb.collection("adminLog").add({ action: "triage", actorUid: "adm", feature: "bugZapper", createdAt: TS(at("2026-11", 10)) });
  // the reminders on the 15th of the grace month: only people behind, with the practice line, once a day
  clock = at("2026-11", 15, 10);
  let rem = await A.runReminders(clock);
  assert.equal(rem.grace, true);
  const remA = (await noticesOf("a")).filter((n) => n.kind === "reminder");
  assert.equal(remA.length, 1); assert.match(remA[0].text, /^You're at 0 of 2 duties this month\. \d+ streams? left with open seats\. Practice month: nothing changes status yet\.$/);
  assert.equal((await noticesOf("c")).filter((n) => n.kind === "reminder").length, 0, "c is on track (4 already)");
  for (const u of ["j", "x", "g", "p"]) assert.equal((await noticesOf(u)).filter((n) => n.kind === "reminder").length, 0, `${u}: no reminder (joined this month, excused, Going dark, Paused)`);
  assert.match((await noticesOf("w")).find((n) => n.kind === "reminder").text, /3 of 3 duties, at least 1 as Room Lead or Captain/);
  const sentFirst = rem.sent;
  rem = await A.runReminders(clock);
  assert.equal(rem.sent, 0, "a second run the same day writes nothing"); assert.ok(sentFirst > 0);

  // the dry run (planMonth) writes nothing
  clock = at("2026-12", 1, 0) + 10 * MIN;
  const snapBefore = JSON.stringify([...wdb._store.entries()]);
  const plan = await A.planMonth("2026-11", { runAt: clock });
  assert.equal(JSON.stringify([...wdb._store.entries()]), snapBefore, "planMonth writes nothing");
  assert.equal(plan.grace, true); assert.equal(plan.light, false);
  // the run
  r = await A.runMonthly(clock);
  assert.equal(r.ym, "2026-11"); assert.equal(r.grace, true);
  let ra = await roster("a"); assert.equal(ra.status, "active", "grace: nobody moves down"); assert.equal(ra.missedMonths, 0, "and missedMonths doesn't grow");
  assert.equal((await roster("e")).status, "checkIn", "grace: Check-in doesn't become Reserve"); assert.equal((await roster("e")).missedMonths, 1);
  assert.equal((await roster("w")).status, "active", "the Warden without a led duty isn't moved in grace");
  const rb = await roster("b"); assert.equal(rb.status, "active", "grace: moving up still works"); assert.equal(rb.missedMonths, 0); assert.equal(rb.activeStreak, 1);
  assert.ok((await noticesOf("b")).some((n) => n.kind === "status" && n.title === "You're Active again"));
  assert.ok((await list("adminLog")).some((l) => l.action === "crewStatus" && l.itemTitle === "@b" && l.changes.status.after === "active"));
  assert.ok(granted.some((g) => g.uid === "c" && g.id === "on-the-clock-2026-11"), "On the Clock in the grace month");
  assert.ok((await get(`${S}/badges/on-the-clock-2026-11`)).name.startsWith("On the Clock · Nov 2026"), "the month's badge, made from the template");
  assert.equal((await roster("c")).activeStreak, 3); assert.ok(granted.some((g) => g.uid === "c" && g.id === "iron-shift-3"), "Iron Shift counting runs in grace");
  assert.equal((await roster("j")).status, "active"); assert.equal((await roster("x")).status, "active");
  assert.equal((await roster("adm")).activeStreak, 1, "the admin met it with 1 duty + triage");
  const rg = await roster("g"); assert.equal(rg.status, "active", "the break ended: back to Active"); assert.equal(rg.crewComp, true);
  assert.equal((await roster("p")).status, "paused", "Paused is never touched");
  assert.equal((await A.runMonthly(clock)).skipped, "alreadyRun", "idempotent");

  // ---------- December: the month after grace applies normally ----------
  const dec = await streams("2026-12", 8);
  clock = at("2026-12", 10, 4);
  await duty(dec[0], "e"); await duty(dec[1], "e");
  // back to Active the night after meeting the minimum (crewNightly): a Check-in with 2 duties this month
  await person("k", { status: "checkIn", missedMonths: 1 });
  await duty(dec[2], "k"); await duty(dec[3], "k");
  r = await A.nightlyUp(clock);
  assert.equal((await roster("k")).status, "active"); assert.equal((await roster("e")).status, "active"); assert.equal(r.moved, 2);
  // e misses again? no: e met December. a and j do nothing in December; w leads one; c does 4; the excused x does nothing; g (back) does nothing
  await duty(dec[0], "w", { led: true }); await duty(dec[1], "w"); await duty(dec[2], "w");
  for (const s of dec.slice(0, 4)) await duty(s, "c");
  await duty(dec[4], "b");                                                        // b: 1 of 2
  // ---------- the ballot: at least 2 counted duties that month (rules on) ----------
  const awards = require("../lib/crew/awards")({ adminLogEntry, now: () => at("2026-12", 28) });
  const ballot = await awards.fanFavouriteBallot.run({ auth: { uid: "voter", token: {} }, data: {} });
  const names = ballot.candidates.map((x) => x.uid).sort();
  assert.ok(names.includes("c") && names.includes("w") && names.includes("k") && names.includes("e"), "2+ duties in December");
  assert.ok(!names.includes("j") && !names.includes("x") && !names.includes("adm"), "fewer than 2 (or an admin) isn't on it");


  // ---------- HQ and /admin/crew reads (crewMe.month, crewAdminOverview.activity) ----------
  clock = at("2026-12", 12);
  await settings({ rulesRunMonth: null });
  const mm = await A.myMonth("k", await roster("k"), clock);
  assert.equal(mm.rules, "on"); assert.equal(mm.counted, 2); assert.equal(mm.need, 2); assert.equal(mm.met, true); assert.equal(mm.duties.length, 2); assert.ok(mm.duties[0].at < mm.duties[1].at);
  const mw = await A.myMonth("w", await roster("w"), clock);
  assert.equal(mw.ledRequired, true); assert.equal(mw.line.startsWith("3 of 3"), true);
  const novState = await A.myMonth("k", await roster("k"), at("2026-11", 12));
  assert.equal(novState.rules, "grace");
  const octState = await A.myMonth("k", await roster("k"), at("2026-10", 12));
  assert.equal(octState.rules, "before"); assert.equal(octState.counted, undefined);
  const lists = await A.adminLists(clock);
  assert.equal(lists.rules, "on"); assert.ok(lists.behind.some((x) => x.uid === "a")); assert.ok(!lists.behind.some((x) => x.uid === "k"));
  assert.ok(lists.checkIn.every((x) => x.status === "checkIn")); assert.ok(lists.dueReserve.every((x) => x.status === "checkIn" && lists.behind.some((y) => y.uid === x.uid)));
  clock = at("2027-01", 1, 0) + 10 * MIN;
  r = await A.runMonthly(clock);
  assert.equal(r.grace, false);
  ra = await roster("a"); assert.equal(ra.status, "checkIn", "a missed month -> Check-in"); assert.equal(ra.missedMonths, 1); assert.equal(ra.crewComp, true);
  assert.ok((await noticesOf("a")).some((n) => n.kind === "status" && n.title === "You're on Check-in"));
  assert.equal((await roster("j")).status, "checkIn", "December is j's first full month: it counts");
  assert.equal((await roster("x")).status, "active", "excused for December");
  assert.equal((await roster("w")).status, "active", "the Warden led one");
  assert.equal((await roster("b")).status, "checkIn", "1 of 2: Check-in");
  assert.equal((await roster("g")).status, "checkIn", "back from the break and missed December");
  // January: a misses again -> Reserve (crewComp off)
  await streams("2027-01", 8);
  clock = at("2027-02", 1, 0) + 10 * MIN;
  await A.runMonthly(clock);
  ra = await roster("a"); assert.equal(ra.status, "reserve"); assert.equal(ra.missedMonths, 2); assert.equal(ra.crewComp, false);
  assert.ok((await noticesOf("a")).some((n) => n.title === "You're on Reserve"));

  // ---------- a light month (fewer than 8 streams): 1 for everyone ----------
  const feb = await streams("2027-02", 3);
  clock = at("2027-02", 20);
  await duty(feb[0], "b"); await duty(feb[1], "w");                               // the Warden's one isn't led: fine in a light month
  clock = at("2027-03", 1, 0) + 10 * MIN;
  r = await A.runMonthly(clock);
  assert.equal(r.light, true);
  assert.equal((await roster("b")).status, "active", "light month: 1 duty is enough"); assert.equal((await roster("w")).status, "active");

  // ---------- Going dark: never a missed month; perks pause after the break's first month ----------
  await person("d", { status: "goingDark", statusSince: TS(at("2027-02", 20)), breakUntil: TS(at("2027-04", 15)) });
  await streams("2027-03", 8);
  clock = at("2027-04", 1, 0) + 10 * MIN;
  await A.runMonthly(clock);
  const rd = await roster("d"); assert.equal(rd.status, "goingDark"); assert.equal(rd.missedMonths, 0); assert.equal(rd.crewComp, false, "April is the break's third month: perks paused");

  // ---------- the join rule: 3 real stream check-ins once the rules are on ----------
  const L = require("../lib/crew/logic");
  const base = { ageBand: "18+", signedUpAtMs: 1, linkedCount: 1, checkins: 9, waived: false, now: Date.now(), settings: { ...L.DEFAULT_SETTINGS, activityRules: true } };
  assert.equal(L.applyEligibility({ ...base, streamCheckins: 2 }).reason, "needsStreamCheckins", "daily check-ins no longer stand in");
  assert.equal(L.applyEligibility({ ...base, streamCheckins: 3 }).ok, true);
  assert.equal(L.applyEligibility({ ...base, streamCheckins: 0, waived: true }).ok, true, "the owner can still waive");
  const item = L.applyChecklist({ ...base, streamCheckins: 2 }).items.find((x) => x.id === "checkins");
  assert.equal(item.label, "3 stream check-ins in the last 30 days"); assert.equal(item.detail, "2 of 3"); assert.equal(item.ok, false);
  // crewMe counts presence docs (any beat in the last 30 days, this site only)
  const now = Date.now();
  await wdb.doc(`users/hopeful`).set({ signedUpAt: TS(now - 60 * DAY), ageBand: "18+", linked: { twitch: { login: "h" } } });
  await wdb.doc(`${S}/profiles/hopeful`).set({ handle: "hopeful" }); await wdb.doc(`${S}/members/hopeful`).set({ roles: [] });
  for (const [s, ago] of [["p1", 2], ["p2", 10], ["p3", 40]]) await wdb.doc(`${S}/streams/${s}/presence/hopeful`).set({ uid: "hopeful", beats: { start: { room: "twitch", at: TS(now - ago * DAY) } } });
  await wdb.doc(`${S}/streams/p4/presence/hopeful`).set({ uid: "hopeful", wrongTries: { start: 2 } });   // wrong words only: not a check-in
  const core = require("../lib/crew/core")({ adminLogEntry });
  const me = await core.crewMe.run({ auth: { uid: "hopeful", token: {} }, data: {} });
  assert.equal(me.apply.items.find((x) => x.id === "checkins").detail, "2 of 3", "2 streams in the last 30 days");

  console.log("check-activity: ok");
}
main().catch((e) => { console.error(e); process.exit(1); });
