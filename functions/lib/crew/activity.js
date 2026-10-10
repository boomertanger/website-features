// Mod Machina phase 3 part 7: the activity rules on (docs/specs/mod-machina.md section 3f "Activity and perks", section 17a "Activity rules on", choices 1 and 2).
//
//   crewSetRules({ on, startMonth })   owner only. startMonth "YYYY-MM" (default next month, never a past month). On: activityRules true, rulesSince and graceMonth = startMonth.
//                                      Off: activityRules false, history kept. adminLog crewRules; a "rules" notice to the crew when they turn on.
//   crewActivityMonthly (1st, 00:10 Central)   for the month just ended (when rules are on and it is rulesSince or later): section 3f as written. Grace month (graceMonth):
//                                      nobody moves down and missedMonths doesn't grow; moving up, On the Clock and Iron Shift still run. Idempotent per month (rulesRunMonth).
//   crewReminders (15th and 24th, 10:00 Central)   an HQ notice to anyone behind this month (written once per day per person); the grace month adds the practice line.
//   nightlyUp(now)                     called by crewNightly: Check-in and Reserve crew who meet this month's minimum are Active again the next day (decided Oct 9, 2026).
//
// What counts (section 17a "Duty records and duty Gears"): a duty record (crew/main/duties) on a stream that STARTED in the month (Central), counted (60 confirmed minutes,
// or the whole stream minus 5 if it ran under an hour); "led" = Lead or Captain for 30+ of them. A record not confirmed yet (the 24 h auto-confirm) is judged from its lines.
// Minimums: Initiate and Watcher 2; Warden and Sentinel 3 with at least 1 led; admins 2, or 1 duty + admin work (an adminLog queue decision, Night Shift publish or
// Bug Zapper / Feature Lab triage that month, decided Oct 9, 2026). Light month (fewer than 8 streams scheduled): 1 for everyone. Owner excuses (excusedMonths), Going dark
// (never a missed month; perks pause after the break's first month; back to Active when breakUntil passes, decided Oct 9, 2026) and a first partial month (joined
// mid-month) are neutral. On the Clock: 4+ counted duties in a month, a badge per month (on-the-clock-YYYY-MM, made from the on-the-clock template, decided Oct 9, 2026).
const { onCall } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { paths, ROOT, SITE_ID, loadSettings } = require("./settings");
const { makeStore, fail, ms } = require("./store");
const { makeNotices } = require("./notices");
const D = require("./dutyLogic");
const { dayKey, WEEK_TZ } = require("../arcade/logic");

const YM = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (ym) => MONTHS[Number(ym.slice(5, 7)) - 1];
const monthShort = (ym) => monthName(ym).slice(0, 3);
const monthOf = (at) => dayKey(at).slice(0, 7);
const nextMonth = (ym) => { const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; };
const prevMonth = (ym) => { const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; };
const monthsApart = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
/** The instant a month starts in Central (00:00 on the 1st). */
function monthStart(ym) {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  for (const h of [4, 5, 6, 7]) { const t = Date.UTC(y, m - 1, 1, h); if (dayKey(t).startsWith(ym) && !dayKey(t - 60000).startsWith(ym)) return t; }
  return Date.UTC(y, m - 1, 1, 6);
}
const monthRange = (ym) => [monthStart(ym), monthStart(nextMonth(ym))];

const LIGHT_MONTH_STREAMS = 8;
const ON_THE_CLOCK = 4;
const IRON_SHIFT = [3, 6, 12, 24];
const ADMIN_WORK = new Set(["crewApprove", "crewNotNow", "crewDecline", "factoryPublish", "triage"]);
const ON_ROSTER = ["active", "checkIn", "goingDark", "reserve"];

/** The month's minimum for a roster entry. -> { need, led, adminRoute } */
function minimumFor(r, light) {
  if (light) return { need: 1, led: false, adminRoute: false };
  if (r.track === "admin") return { need: 2, led: false, adminRoute: true };
  return r.grade >= 3 ? { need: 3, led: true, adminRoute: false } : { need: 2, led: false, adminRoute: false };
}
/** Did they meet it? tally = { counted, led, adminWork } */
function meets(min, t) {
  if ((t.counted || 0) >= min.need && (!min.led || (t.led || 0) >= 1)) return true;
  return !!min.adminRoute && (t.counted || 0) >= 1 && (t.adminWork || 0) >= 1;
}
/** "2 of 3 duties" and what's still missing, for HQ and the reminders. */
function progressLine(min, t) {
  const base = `${Math.min(t.counted || 0, 99)} of ${min.need} dut${min.need === 1 ? "y" : "ies"}`;
  return min.led && (t.led || 0) < 1 ? `${base}, at least 1 as Room Lead or Captain` : base;
}

/**
 * One person's month (pure). r: roster { status, track, grade, since, statusSince, breakUntil (ms), excusedMonths, missedMonths, activeStreak }.
 * ctx: { ym (the month just ended), tally, light, grace, runAt (ms) }. Returns { patch, from, to, onTheClock, ironShift: [ids], neutral }.
 */
function monthStep(r, { ym, tally, light, grace, runAt }) {
  const out = { patch: {}, from: r.status, to: r.status, onTheClock: false, ironShift: [], neutral: null };
  if (!ON_ROSTER.includes(r.status)) { out.neutral = r.status; return out; }
  out.onTheClock = (tally.counted || 0) >= ON_THE_CLOCK;
  const [start] = monthRange(ym), next = nextMonth(ym);
  const partial = ms(r.since) != null && ms(r.since) > start;
  const excused = (r.excusedMonths || []).includes(ym);
  const met = meets(minimumFor(r, light), tally);
  const missed = r.missedMonths || 0, streak = r.activeStreak || 0;
  if (r.status === "goingDark") {
    out.neutral = "goingDark";
    const until = ms(r.breakUntil);
    if (until != null && until <= runAt) { out.to = "active"; Object.assign(out.patch, { status: "active", breakUntil: null, crewComp: true, missedMonths: 0 }); }
    else if (monthOf(ms(r.statusSince) || runAt) < next) out.patch.crewComp = false;   // perks continue the break's first month only
    return out;
  }
  if (met) {
    const s = streak + 1;
    Object.assign(out.patch, { missedMonths: 0, activeStreak: s, crewComp: true });
    if (r.status !== "active") { out.to = "active"; out.patch.status = "active"; }
    out.ironShift = IRON_SHIFT.filter((n) => s >= n && streak < n).map((n) => `iron-shift-${n}`);
    return out;
  }
  if (partial || excused) { out.neutral = partial ? "joinedMidMonth" : "excused"; return out; }
  if (grace) { out.neutral = "grace"; return out; }
  const m = missed + 1;
  Object.assign(out.patch, { missedMonths: m, activeStreak: 0 });
  if (r.status === "active") { out.to = "checkIn"; Object.assign(out.patch, { status: "checkIn", crewComp: true }); }
  else if (r.status === "checkIn" && m >= 2) { out.to = "reserve"; Object.assign(out.patch, { status: "reserve", crewComp: false }); }
  else if (r.status === "reserve" && monthsApart(monthOf(ms(r.statusSince) || runAt), next) >= 6) { out.to = "alumni"; Object.assign(out.patch, { status: "alumni", alumni: true, crewComp: false }); }
  return out;
}

const STATUS_NOTICE = {
  active: { title: "You're Active again", text: "You met the minimum. Perks are back." },
  checkIn: { title: "You're on Check-in", text: "You missed last month's minimum. Perks stay; meet this month's minimum and you're Active again the next day." },
  reserve: { title: "You're on Reserve", text: "Two missed months in a row. Grade, badges and Hall of Fame stay. A drop-in or a Deckhand seat is the way back." },
  alumni: { title: "You're an alumnus now", text: "Six months on Reserve. Thank you for everything. You can come back through the short fast-track." },
};

/** Open seats on a published stream doc (handles on the public crew): no Captain, a room without a lead, or room for a Deckhand. */
function hasOpenSeat(s) {
  const c = s.crew || {}, chats = c.chats || {}, cap = (c.caps && Number.isInteger(c.caps.deckhands)) ? c.caps.deckhands : 2;
  if (!c.captain) return true;
  return (s.rooms || []).some((room) => !chats[room] || !chats[room].lead || (chats[room].deckhands || []).length < cap);
}

function makeActivity({ db, Timestamp, adminLogEntry, notices = null, grant = null, now = () => Date.now() }) {
  const N = notices || makeNotices({ db, now });
  const G = () => grant || require("../rewards/grant").makeGrant({ db });
  const streamsCol = () => db.collection(`sites/${SITE_ID}/streams`);
  const sysLog = async (action, { uid = null, title, details, changes }) => {
    await db.collection("adminLog").add(await adminLogEntry(db, { feature: "crew", action, itemPath: uid ? paths.roster(uid) : paths.settings(), itemTitle: title, actorUid: null, actorName: "Automatic", changes, details }));
  };

  /** The month's numbers: light month, and per uid { counted, led, adminWork }. upTo caps the duty streams (this month so far). */
  async function tallyMonth(ym, { upTo = Infinity } = {}) {
    const [start, end] = monthRange(ym);
    const planned = await streamsCol().where("plannedStart", ">=", Timestamp.fromMillis(start)).where("plannedStart", "<", Timestamp.fromMillis(end)).get();
    const scheduled = planned.docs.filter((d) => ["scheduled", "live", "ended"].includes(d.get("state")) && !d.get("afterShowOf"));
    const light = scheduled.length < LIGHT_MONTH_STREAMS;
    const ran = (await streamsCol().where("actualStart", ">=", Timestamp.fromMillis(start)).where("actualStart", "<", Timestamp.fromMillis(Math.min(end, upTo))).get()).docs;
    const minutesOf = new Map(ran.map((d) => [d.id, Math.max(1, Math.round(((ms(d.get("actualEnd")) || now()) - ms(d.get("actualStart"))) / D.MIN))]));
    const by = new Map();
    const row = (uid) => { if (!by.has(uid)) by.set(uid, { counted: 0, led: 0, adminWork: 0, minutes: 0 }); return by.get(uid); };
    const ids = [...minutesOf.keys()];
    for (let i = 0; i < ids.length; i += 30) {
      const snap = await db.collection(paths.dutiesCol()).where("streamId", "in", ids.slice(i, i + 30)).get();
      for (const d of snap.docs) {
        const x = d.data();
        const o = x.confirmedAt ? { counted: x.counted === true, led: x.led === true, total: x.minutes || 0 } : D.dutyOutcome(x.lines || {}, minutesOf.get(x.streamId) || 60);
        if (!o.counted) continue;
        const t = row(x.uid); t.counted++; if (o.led) t.led++; t.minutes += o.total || 0;
      }
    }
    const log = await db.collection("adminLog").where("createdAt", ">=", Timestamp.fromMillis(start)).where("createdAt", "<", Timestamp.fromMillis(end)).get();
    for (const d of log.docs) { const a = d.get("action"), u = d.get("actorUid"); if (u && ADMIN_WORK.has(a)) row(u).adminWork++; }
    return { light, scheduled: scheduled.length, by, streamsLeftOpen: scheduled.filter((d) => ms(d.get("plannedStart")) > now() && d.get("state") === "scheduled" && hasOpenSeat(d.data())).length };
  }
  const rosterRows = async () => (await db.collection(`${ROOT}/roster`).get()).docs.map((d) => ({ uid: d.id, ref: d.ref, ...d.data() }));

  /** The plan for a month (pure reads, nothing written): what crewActivityMonthly would do. */
  async function planMonth(ym, { settings = null, runAt = now() } = {}) {
    const s = settings || (await loadSettings(db));
    const on = s.activityRules === true && typeof s.rulesSince === "string" && ym >= s.rulesSince;
    if (!on) return { ym, on: false, reason: s.activityRules ? "beforeRulesSince" : "rulesOff", rows: [] };
    const grace = s.graceMonth === ym;
    const t = await tallyMonth(ym);
    const rows = [];
    for (const r of await rosterRows()) {
      const tally = t.by.get(r.uid) || { counted: 0, led: 0, adminWork: 0, minutes: 0 };
      const step = monthStep({ ...r, since: ms(r.since), statusSince: ms(r.statusSince), breakUntil: ms(r.breakUntil) }, { ym, tally, light: t.light, grace, runAt });
      rows.push({ uid: r.uid, handle: r.handle || null, track: r.track, grade: r.grade, tally, min: minimumFor(r, t.light), step });
    }
    return { ym, on: true, grace, light: t.light, scheduled: t.scheduled, rows };
  }

  /** On the Clock for a month: the per-month badge, made from the template the first time. */
  async function onTheClockBadge(ym) {
    const id = `on-the-clock-${ym}`, ref = db.doc(`sites/${SITE_ID}/badges/${id}`);
    if ((await ref.get()).exists) return id;
    const tpl = (await db.doc(`sites/${SITE_ID}/badges/on-the-clock`).get()).data();
    if (!tpl) return null;
    const [start, end] = monthRange(ym);
    try { await ref.create({ ...tpl, id, name: `${tpl.name} · ${monthShort(ym)} ${ym.slice(0, 4)}`, holders: 0, ladder: null, template: "on-the-clock", month: ym, limited: { label: `${monthShort(ym)} ${ym.slice(0, 4)}`, opensAt: Timestamp.fromMillis(start), closesAt: Timestamp.fromMillis(end + 7 * 24 * 3600000) } }); }
    catch (err) { if (!(err.code === 6 || /ALREADY_EXISTS/.test(String(err.message)))) throw err; }
    return id;
  }

  async function runMonthly(runAt = now()) {
    const ym = prevMonth(monthOf(runAt));
    const s = await loadSettings(db);
    if (s.rulesRunMonth === ym) return { ym, skipped: "alreadyRun" };
    const plan = await planMonth(ym, { settings: s, runAt });
    if (!plan.on) return { ym, skipped: plan.reason };
    let moved = 0, clocks = 0, iron = 0;
    const clockId = plan.rows.some((x) => x.step.onTheClock) ? await onTheClockBadge(ym) : null;
    for (const x of plan.rows) {
      const { step } = x;
      if (Object.keys(step.patch).length) {
        const patch = { ...step.patch, rulesMonth: ym };
        if (step.to !== step.from) patch.statusSince = Timestamp.fromMillis(runAt);
        await db.doc(paths.roster(x.uid)).update(patch);
      }
      if (step.to !== step.from) {
        moved++;
        if (step.to === "alumni" && x.track !== "admin") { try { await setMod(x.uid, false); } catch (err) { console.error("activity: mod role", String((err && err.message) || err).slice(0, 120)); } }
        const n = STATUS_NOTICE[step.to];
        if (n) await N.writeNotice(x.uid, { id: `status-${ym}-${x.uid}`, kind: "status", title: n.title, text: n.text, link: "/crew/hq" });
        await sysLog("crewStatus", { uid: x.uid, title: x.handle ? `@${x.handle}` : x.uid, changes: { status: { before: step.from, after: step.to } }, details: { month: ym, counted: x.tally.counted, need: x.min.need, grace: plan.grace } });
      }
      if (step.onTheClock && clockId && step.from !== "paused") { try { if ((await G().grantBadge(x.uid, clockId, { feature: "crew", ref: `onTheClock:${ym}` })).granted) clocks++; } catch (err) { console.error("activity: on the clock", String((err && err.message) || err).slice(0, 120)); } }
      for (const id of step.ironShift) { try { if ((await G().grantBadge(x.uid, id, { feature: "crew", ref: id })).granted) iron++; } catch (err) { console.error("activity: iron shift", String((err && err.message) || err).slice(0, 120)); } }
    }
    await db.doc(paths.settings()).update({ rulesRunMonth: ym });
    return { ym, grace: plan.grace, light: plan.light, moved, onTheClock: clocks, ironShift: iron, people: plan.rows.length };
  }

  /** The mod role follows Alumni (the platform mod powers go), as crewSetStatus does. */
  async function setMod(uid, on) {
    const ref = db.doc(`sites/${SITE_ID}/members/${uid}`);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const roles = new Set(snap.get("roles") || []);
      if (on) roles.add("mod"); else roles.delete("mod");
      tx.update(ref, { roles: [...roles].sort(), rolesChangedBy: { uid: null, name: "Automatic" }, rolesChangedAt: Timestamp.fromMillis(now()) });
    });
  }

  /** Who is behind this month so far (reminders, /admin/crew's lists, HQ). */
  async function behindNow(at = now(), settings = null) {
    const s = settings || (await loadSettings(db));
    const ym = monthOf(at);
    const on = s.activityRules === true && typeof s.rulesSince === "string" && ym >= s.rulesSince;
    if (!on) return { ym, on: false, rows: [] };
    const t = await tallyMonth(ym, { upTo: at });
    const [start] = monthRange(ym);
    const rows = [];
    for (const r of await rosterRows()) {
      if (!["active", "checkIn", "reserve"].includes(r.status)) continue;
      if ((ms(r.since) || 0) > start || (r.excusedMonths || []).includes(ym)) continue;
      const tally = t.by.get(r.uid) || { counted: 0, led: 0, adminWork: 0, minutes: 0 };
      const min = minimumFor(r, t.light);
      if (!meets(min, tally)) rows.push({ uid: r.uid, handle: r.handle || null, status: r.status, track: r.track, grade: r.grade, missedMonths: r.missedMonths || 0, tally, min, line: progressLine(min, tally) });
    }
    return { ym, on: true, grace: s.graceMonth === ym, light: t.light, streamsLeftOpen: t.streamsLeftOpen, rows };
  }

  async function runReminders(at = now()) {
    const b = await behindNow(at);
    if (!b.on) return { sent: 0, skipped: "rulesOff" };
    const day = dayKey(at);
    let sent = 0;
    for (const x of b.rows) {
      const text = `You're at ${x.line} this month. ${b.streamsLeftOpen} stream${b.streamsLeftOpen === 1 ? "" : "s"} left with open seats.${b.grace ? " Practice month: nothing changes status yet." : ""}`;
      if (await N.writeNotice(x.uid, { id: `rem-${day}-${x.uid}`, kind: "reminder", title: `${monthName(b.ym)}: ${x.line}`, text, link: "/schedule/plan" })) sent++;
    }
    return { sent, behind: b.rows.length, grace: b.grace };
  }

  /** crewNightly: Check-in and Reserve crew who meet this month's minimum are Active again (the next day). */
  async function nightlyUp(at = now()) {
    const s = await loadSettings(db);
    const ym = monthOf(at);
    if (!(s.activityRules === true && typeof s.rulesSince === "string" && ym >= s.rulesSince)) return { moved: 0 };
    const back = (await rosterRows()).filter((r) => ["checkIn", "reserve"].includes(r.status));
    if (!back.length) return { moved: 0 };
    const t = await tallyMonth(ym, { upTo: at });
    let moved = 0;
    for (const r of back) {
      const tally = t.by.get(r.uid) || { counted: 0, led: 0, adminWork: 0 };
      if (!meets(minimumFor(r, t.light), tally)) continue;
      await db.doc(paths.roster(r.uid)).update({ status: "active", statusSince: Timestamp.fromMillis(at), missedMonths: 0, crewComp: true });
      await N.writeNotice(r.uid, { id: `status-up-${ym}-${r.uid}`, kind: "status", title: STATUS_NOTICE.active.title, text: STATUS_NOTICE.active.text, link: "/crew/hq" });
      await sysLog("crewStatus", { uid: r.uid, title: r.handle ? `@${r.handle}` : r.uid, changes: { status: { before: r.status, after: "active" } }, details: { month: ym, counted: tally.counted } });
      moved++;
    }
    return { moved };
  }

  return { tallyMonth, planMonth, runMonthly, runReminders, behindNow, nightlyUp, onTheClockBadge };
}

module.exports = function activity({ adminLogEntry }) {
  const S = makeStore({ adminLogEntry });
  const { db, Timestamp } = S;
  const A = makeActivity({ db, Timestamp, adminLogEntry });

  const crewSetRules = onCall(async (request) => {
    const uid = S.requireAuth(request);
    const w = await S.who(uid);
    if (!w.isOwner) throw fail("permission-denied", "Only the owner turns the activity rules on or off.", "notOwner");
    const d = request.data || {};
    if (typeof d.on !== "boolean") throw fail("invalid-argument", "Say on or off.", "args");
    const before = await loadSettings(db);
    const at = Date.now(), cur = monthOf(at);
    let patch;
    if (d.on) {
      const start = d.startMonth == null ? nextMonth(cur) : d.startMonth;
      if (typeof start !== "string" || !YM.test(start)) throw fail("invalid-argument", "The start month looks like 2026-11.", "startMonth");
      if (start < cur) throw fail("invalid-argument", "The rules can't start in a month that's over.", "pastMonth");
      patch = { activityRules: true, rulesSince: start, graceMonth: start };
    } else patch = { activityRules: false };
    await db.doc(paths.settings()).set(patch, { merge: true });
    await db.collection("adminLog").add(await adminLogEntry(db, { feature: "crew", action: "crewRules", itemPath: paths.settings(), itemTitle: "Activity rules", actorUid: uid, actorName: w.name,
      changes: { activityRules: { before: before.activityRules === true, after: patch.activityRules }, ...(patch.rulesSince ? { rulesSince: { before: before.rulesSince || null, after: patch.rulesSince } } : {}) } }));
    if (d.on && !(before.activityRules === true && before.rulesSince === patch.rulesSince)) {
      const N = makeNotices({ db });
      const crew = (await db.collection(`${ROOT}/roster`).where("status", "in", ["active", "checkIn", "goingDark", "reserve"]).get()).docs.map((x) => x.id);
      for (const u of crew) await N.writeNotice(u, { id: `rules-${patch.rulesSince}-${u}`, kind: "rules", title: `Activity rules start on ${monthName(patch.rulesSince)} 1`, text: `${monthName(patch.rulesSince)} is a practice month: nobody moves down. Your time card on HQ shows where you are.`, link: "/crew/how-it-works" });
    }
    return { ok: true, activityRules: patch.activityRules, rulesSince: patch.rulesSince || before.rulesSince || null, graceMonth: patch.graceMonth || before.graceMonth || null };
  });

  const crewActivityMonthly = onSchedule({ schedule: "10 0 1 * *", timeZone: WEEK_TZ, timeoutSeconds: 540 }, async () => {
    const r = await A.runMonthly();
    console.log(`crewActivityMonthly ${r.ym}: ${r.skipped ? `skipped (${r.skipped})` : `${r.moved} moved, ${r.onTheClock} On the Clock, ${r.ironShift} Iron Shift${r.grace ? ", grace month" : ""}${r.light ? ", light month" : ""}`}`);
  });
  const crewReminders = onSchedule({ schedule: "0 10 15,24 * *", timeZone: WEEK_TZ, timeoutSeconds: 300 }, async () => {
    const r = await A.runReminders();
    console.log(`crewReminders: ${r.skipped ? `skipped (${r.skipped})` : `${r.sent} sent of ${r.behind} behind${r.grace ? " (grace month)" : ""}`}`);
  });

  return { crewSetRules, crewActivityMonthly, crewReminders };
};
module.exports.makeActivity = makeActivity;
module.exports.pure = { minimumFor, meets, monthStep, progressLine, hasOpenSeat, monthRange, monthStart, nextMonth, prevMonth, monthOf, monthName, LIGHT_MONTH_STREAMS };
