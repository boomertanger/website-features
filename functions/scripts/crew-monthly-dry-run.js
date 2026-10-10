#!/usr/bin/env node
// functions/scripts/crew-monthly-dry-run.js: what the activity rules' monthly run (crewActivityMonthly, lib/crew/activity.js) WOULD do for a month. Reads only: nothing
// is ever written (the activity module is built with writers that throw).
//   node scripts/crew-monthly-dry-run.js --project staging --month 2026-10            (the month to judge; default: the month just ended)
//   options: --as-if-on   judge it as if the rules were on from that month (when they're off or start later), not a grace month
//            --grace      with --as-if-on: as the grace month
// Prints: the settings, light month or not, then one row per crew member: their duties (counted, led, admin work), the minimum, and what would change
// (status, missedMonths, On the Clock, Iron Shift); then who is behind this month so far (the 15th / 24th reminders).
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

function parseArgs(argv) {
  const a = { project: "staging", month: null, asIfOn: false, grace: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === "--project") a.project = argv[++i];
    else if (v.startsWith("--project=")) a.project = v.slice(10);
    else if (v === "--month") a.month = argv[++i];
    else if (v.startsWith("--month=")) a.month = v.slice(8);
    else if (v === "--as-if-on") a.asIfOn = true;
    else if (v === "--grace") a.grace = true;
    else throw new Error(`Unknown argument: ${v}`);
  }
  if (a.month != null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(a.month)) throw new Error("--month looks like 2026-10");
  return a;
}
function resolveProjectId(nameOrId) {
  try { const rc = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", ".firebaserc"), "utf8")); return rc.projects?.[nameOrId] ?? nameOrId; } catch { return nameOrId; }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  // read-only: any write through these would throw
  const noWrite = async () => { throw new Error("dry run: refusing to write"); };
  const { makeActivity, pure: P } = require("../lib/crew/activity");
  const A = makeActivity({ db, Timestamp: admin.firestore.Timestamp, adminLogEntry: noWrite, notices: { writeNotice: noWrite, writeNotices: noWrite }, grant: { grantBadge: noWrite } });

  const now = Date.now(), cur = P.monthOf(now);
  const ym = args.month || P.prevMonth(cur);
  const real = await (async () => { const ref = db.doc("sites/boomertanger/crew/main"); const s = await ref.get(); return s.exists ? require("../lib/crew/logic").mergeSettings(s.data()) : require("../lib/crew/logic").mergeSettings({}); })();
  console.log(`Project: ${projectId} · dry run, nothing is written`);
  console.log(`Rules: ${real.activityRules ? "on" : "off"} · rulesSince ${real.rulesSince || "-"} · graceMonth ${real.graceMonth || "-"} · last run ${real.rulesRunMonth || "-"}`);
  const settings = args.asIfOn ? { ...real, activityRules: true, rulesSince: ym, graceMonth: args.grace ? ym : null } : real;
  const plan = await A.planMonth(ym, { settings, runAt: ym === cur ? now : P.monthStart(P.nextMonth(ym)) + 10 * 60000 });
  console.log(`\nMonth ${ym}${ym === cur ? " (so far)" : ""}${args.asIfOn ? ` · AS IF the rules were on${args.grace ? " (grace month)" : ""}` : ""}`);
  if (!plan.on) {
    console.log(`  Nothing would change: ${plan.reason === "rulesOff" ? "the rules are off" : `the rules start in ${real.rulesSince}`}. Add --as-if-on to see the month judged anyway.`);
  } else {
    console.log(`  ${plan.scheduled} streams scheduled · ${plan.light ? "LIGHT month (minimum 1)" : "normal month"}${plan.grace ? " · grace month: nobody moves down" : ""}`);
    const rows = plan.rows.sort((a, b) => String(a.handle).localeCompare(String(b.handle)));
    for (const x of rows) {
      const s = x.step, t = x.tally;
      const change = s.to !== s.from ? `${s.from} -> ${s.to}` : s.neutral ? `stays ${s.from} (${s.neutral})` : `stays ${s.from}`;
      const extras = [s.patch.missedMonths != null && s.patch.missedMonths !== 0 ? `missedMonths ${s.patch.missedMonths}` : "", s.onTheClock ? "On the Clock" : "", ...s.ironShift].filter(Boolean).join(", ");
      console.log(`  @${String(x.handle || x.uid).padEnd(18)} ${x.track === "admin" ? "admin" : `M${x.grade}`.padEnd(5)} ${String(t.counted).padStart(2)} duties (${t.led} led${t.adminWork ? `, ${t.adminWork} admin work` : ""}) of ${x.min.need}${x.min.led ? " +1 led" : ""}  ${change}${extras ? ` · ${extras}` : ""}`);
    }
    if (!rows.length) console.log("  (nobody on the roster)");
  }
  const b = await A.behindNow(now, args.asIfOn ? { ...real, activityRules: true, rulesSince: cur, graceMonth: args.grace ? cur : null } : real);
  console.log(`\nBehind this month (${cur}) so far: ${b.on ? (b.rows.length ? "" : "nobody") : "rules off, no reminders"}`);
  if (b.on) { for (const x of b.rows) console.log(`  @${x.handle || x.uid}: ${x.line} (${x.status})`); console.log(`  ${b.streamsLeftOpen} streams left with open seats this month`); }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
