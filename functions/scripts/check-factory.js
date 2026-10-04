#!/usr/bin/env node
// functions/scripts/check-factory.js: checks for the Fun Factory's pure logic (lib/factory/logic.js)
// and its data file (functions/data/fun-factory-ideas.json). No credentials needed.
//   npm run check      (or node scripts/check-factory.js)
const assert = require("assert/strict");
const path = require("path");
const fs = require("fs");
const L = require("../lib/factory/logic");

const at = (iso) => Date.parse(iso);

// ---------- Central day and week keys (daylight saving included) ----------
assert.equal(L.dayKey(at("2026-10-04T04:59:59Z")), "2026-10-03");   // 23:59:59 CDT
assert.equal(L.dayKey(at("2026-10-04T05:00:00Z")), "2026-10-04");   // 00:00 CDT
assert.equal(L.dayKey(at("2026-12-01T05:59:59Z")), "2026-11-30");   // 23:59:59 CST
assert.equal(L.dayKey(at("2026-12-01T06:00:00Z")), "2026-12-01");   // 00:00 CST
// Fall back (Nov 1 2026, 02:00 CDT -> 01:00 CST): the day is 25 hours long, still one key.
assert.equal(L.dayKey(at("2026-11-01T05:00:00Z")), "2026-11-01");   // 00:00 CDT
assert.equal(L.dayKey(at("2026-11-02T05:59:59Z")), "2026-11-01");   // 23:59:59 CST
assert.equal(L.dayKey(at("2026-11-02T06:00:00Z")), "2026-11-02");
// Spring forward (Mar 8 2026, 02:00 CST -> 03:00 CDT): a 23-hour day.
assert.equal(L.dayKey(at("2026-03-08T06:00:00Z")), "2026-03-08");   // 00:00 CST
assert.equal(L.dayKey(at("2026-03-09T04:59:59Z")), "2026-03-08");   // 23:59:59 CDT
assert.equal(L.dayKey(at("2026-03-09T05:00:00Z")), "2026-03-09");
// Weeks start Monday 00:00 Central.
assert.equal(L.weekKey(at("2026-10-05T04:59:59Z")), "2026-W40");   // Sunday 23:59:59 CDT
assert.equal(L.weekKey(at("2026-10-05T05:00:00Z")), "2026-W41");   // Monday 00:00 CDT
assert.equal(L.weekKey(at("2026-11-02T05:59:59Z")), "2026-W44");   // Sunday after fall back
assert.equal(L.weekKey(at("2026-11-02T06:00:00Z")), "2026-W45");   // Monday 00:00 CST
assert.equal(L.weekKey(at("2027-01-03T12:00:00Z")), "2026-W53");   // ISO year edge
// Day-key arithmetic is calendar days, not 24-hour steps.
assert.equal(L.addDays("2026-11-01", 1), "2026-11-02");
assert.equal(L.addDays("2026-03-01", -1), "2026-02-28");
assert.equal(L.addDays("2028-03-01", -1), "2028-02-29");
assert.equal(L.daysBetween("2026-10-03", "2026-10-04"), 1);
assert.equal(L.daysBetween("2026-10-31", "2026-11-02"), 2);
assert.equal(L.daysBetween("2026-12-31", "2027-01-01"), 1);

// ---------- periods ----------
const t = at("2026-10-07T15:00:00Z");
assert.equal(L.periodKey("none", t), "all");
assert.equal(L.periodKey(undefined, t), "all");
assert.equal(L.periodKey("daily", t), "2026-10-07");
assert.equal(L.periodKey("weekly", t), "2026-W41");

// ---------- parameters and audiences ----------
assert.ok(L.paramsMatch({}, { action: "play" }));
assert.ok(L.paramsMatch(null, {}));
assert.ok(L.paramsMatch({ action: "finish", gameId: "tapTheSplat" }, { action: "finish", gameId: "tapTheSplat" }));
assert.ok(!L.paramsMatch({ action: "finish" }, { action: "play", gameId: "tapTheSplat" }));
assert.ok(!L.paramsMatch({ gameId: "tapTheSplat" }, { action: "finish" }));
assert.ok(L.paramsMatch({ rarity: 3 }, { rarity: 3 }));
assert.ok(L.paramsMatch({ rarity: "3" }, { rarity: 3 }));
assert.ok(L.paramsMatch({ collection: null, rarity: "" }, { action: "earn" }));
const fan = { roles: [] }, sub = { roles: ["sub"], staging: true }, subProd = { roles: ["sub"], staging: false };
const mod = { roles: ["mod"] }, adm = { roles: ["admin"] }, owner = { roles: [], isOwner: true };
assert.ok(L.audienceOk("all", fan));
assert.ok(!L.audienceOk("sub", fan) && L.audienceOk("sub", sub) && !L.audienceOk("sub", subProd) && L.audienceOk("sub", mod) && L.audienceOk("sub", adm));
assert.ok(!L.audienceOk("crew", fan) && !L.audienceOk("crew", sub) && L.audienceOk("crew", mod) && L.audienceOk("crew", adm) && L.audienceOk("crew", owner));
assert.equal(L.tierFor(fan), "fan");
assert.equal(L.tierFor(sub), "sub");
assert.equal(L.tierFor(subProd), "fan");
assert.equal(L.tierFor(mod), "crew");
assert.equal(L.tierFor(adm), null);
assert.equal(L.tierFor(owner), null);
assert.equal(L.saversCapFor(fan), 2);
assert.equal(L.saversCapFor(sub), 3);
assert.equal(L.saversCapFor(mod), 3);

// ---------- streaks and savers (§13a) ----------
let s = L.streakCheckIn(null, "2026-10-01", 2);
assert.deepEqual([s.current, s.best, s.lastDay, s.savers, s.already], [1, 1, "2026-10-01", 0, false]);
assert.equal(L.streakCheckIn(s, "2026-10-01", 2).already, true);
for (let d = 2; d <= 7; d++) s = L.streakCheckIn(s, `2026-10-0${d}`, 2);
assert.deepEqual([s.current, s.savers, s.earnedSaver], [7, 1, true]);          // 7 in a row earns a saver
assert.deepEqual(s.badges, ["streak-day-7"]);
s = L.streakCheckIn(s, "2026-10-09", 2);                                         // missed the 8th: a saver covers it
assert.deepEqual([s.current, s.savers, s.spent, s.best], [8, 0, 1, 8]);
s = L.streakCheckIn(s, "2026-10-12", 2);                                         // missed two, no savers: reset
assert.deepEqual([s.current, s.best, s.savers], [1, 8, 0]);
// Savers cap at 2 (3 for Sub Club and crew).
let long = null;
for (let d = 0; d < 28; d++) long = L.streakCheckIn(long, L.addDays("2026-01-01", d), 2);
assert.deepEqual([long.current, long.savers], [28, 2]);
let longPlus = null;
for (let d = 0; d < 28; d++) longPlus = L.streakCheckIn(longPlus, L.addDays("2026-01-01", d), 3);
assert.equal(longPlus.savers, 3);
// Two missed days, two savers: kept; the streak goes on from the check-in.
const kept = L.streakCheckIn(long, "2026-01-31", 2);
assert.deepEqual([kept.current, kept.savers, kept.spent], [29, 0, 2]);
// Badge thresholds come exactly once, on the day they're reached.
const days = [];
let b = null;
for (let d = 0; d < 365; d++) { b = L.streakCheckIn(b, L.addDays("2026-01-01", d), 3); days.push(...b.badges); }
assert.deepEqual(days, L.STREAK_BADGES.map((n) => `streak-day-${n}`));
// The nightly sweep: nothing to do for a streak that checked in yesterday or today.
assert.equal(L.streakSweep({ current: 5, lastDay: "2026-10-03", savers: 0 }, "2026-10-04").changed, false);
assert.equal(L.streakSweep({ current: 5, lastDay: "2026-10-04", savers: 0 }, "2026-10-04").changed, false);
let sw = L.streakSweep({ current: 5, best: 9, lastDay: "2026-10-02", savers: 1 }, "2026-10-04");   // missed the 3rd
assert.deepEqual([sw.current, sw.savers, sw.lastDay, sw.broke], [5, 0, "2026-10-03", false]);
assert.deepEqual([L.streakCheckIn(sw, "2026-10-04", 2).current], [6]);          // the saver kept it going
sw = L.streakSweep({ current: 5, best: 9, lastDay: "2026-10-02", savers: 0 }, "2026-10-04");
assert.deepEqual([sw.current, sw.best, sw.lastDay, sw.broke], [0, 9, null, true]);
assert.equal(L.streakCheckIn(sw, "2026-10-04", 2).current, 1);                    // a broken streak restarts
assert.equal(L.streakSweep({ current: 0, lastDay: null, savers: 2 }, "2026-10-04").changed, false);

// ---------- reveals, windows, caps ----------
const now = at("2026-10-10T12:00:00Z");
assert.ok(L.revealDue({ unlockAt: now - 1, revealed: false }, now));
assert.ok(L.revealDue({ opensAt: now, revealed: false }, now));
assert.ok(!L.revealDue({ unlockAt: now + 1, revealed: false }, now));
assert.ok(!L.revealDue({ unlockAt: now - 1, revealed: true }, now));
assert.ok(!L.revealDue({ revealed: false }, now));
const season = { status: "live", startsAt: now - 1e6, endsAt: now + 1e6 };
assert.ok(L.seasonLive(season, now));
assert.ok(!L.seasonLive({ ...season, status: "scheduled" }, now));
assert.ok(!L.seasonLive({ ...season, endsAt: now }, now));
assert.ok(L.campaignOpen({ revealed: true, opensAt: now - 1, closesAt: now + 1 }, season, now));
assert.ok(!L.campaignOpen({ revealed: false, opensAt: now - 1 }, season, now));
assert.ok(!L.campaignOpen({ revealed: true, opensAt: now - 1, closesAt: now }, season, now));
assert.ok(!L.campaignOpen({ revealed: true, opensAt: now + 1 }, season, now));
assert.ok(L.campaignOpen({ revealed: true, opensAt: now - 1 }, season, now));          // no closesAt: the season's end
assert.ok(!L.campaignOpen({ revealed: true, opensAt: now - 1, enabled: false }, season, now));
assert.equal(L.capXp(50, 0, null), 50);
assert.equal(L.capXp(50, 180, 200), 20);
assert.equal(L.capXp(50, 200, 200), 0);
assert.equal(L.capXp(50, 250, 200), 0);

// ---------- boards and season end ----------
const rows = [
  { uid: "a", seasonXp: 300, updatedAt: 5 }, { uid: "b", seasonXp: 500, updatedAt: 9 }, { uid: "c", seasonXp: 300, updatedAt: 2 },
  { uid: "z", seasonXp: 0, updatedAt: 1 },
  ...Array.from({ length: 10 }, (_, i) => ({ uid: `m${i}`, seasonXp: 100 - i, updatedAt: 1 })),
];
assert.deepEqual(L.rankRows(rows).slice(0, 3).map((r) => r.uid), ["b", "c", "a"]);       // tie: who got there first
assert.ok(!L.rankRows(rows).some((r) => r.uid === "z"));                                   // no XP, no row
const awards = L.seasonAwards(rows);
assert.equal(awards.length, 10);
assert.deepEqual(awards.slice(0, 4).map((a) => [a.uid, a.place, a.kind]), [["b", 1, "season"], ["c", 2, "season"], ["a", 3, "season"], ["m0", 4, "plaque"]]);
assert.equal(awards[9].kind, "plaque");
assert.ok(L.seasonsOverlap({ startsAt: 0, endsAt: 10 }, { startsAt: 5, endsAt: 20 }));
assert.ok(!L.seasonsOverlap({ startsAt: 0, endsAt: 10 }, { startsAt: 10, endsAt: 20 }));   // back to back is fine

// ---------- visits ----------
assert.equal(L.visitSection("/arcade/leaderboards"), "/arcade");
assert.equal(L.visitSection("/Games?q=x"), "/games");
assert.equal(L.visitSection("/"), "/");
assert.equal(L.visitSection("/admin"), null);
assert.equal(L.visitSection("arcade"), null);
assert.equal(L.visitSection(42), null);

// ---------- the data file ----------
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "fun-factory-ideas.json"), "utf8"));
const types = new Map(data.activityTypes.map((x) => [x.id, x]));
assert.equal(types.size, data.activityTypes.length, "unique type ids");
for (const x of data.activityTypes) assert.ok(x.enabled || x.needs, `${x.id}: off types say what they need`);
for (const id of ["checkin", "visit", "medals", "profile", "arcade", "badges", "vault"]) assert.equal(types.get(id)?.enabled, true, `${id} is on`);
assert.equal(types.get("ratings")?.enabled, false, "ratings waits for member ratings");
assert.deepEqual(types.get("vault").actions, ["want", "add", "cover"]);
for (const a of data.activities) {
  assert.ok(types.has(a.type), `${a.title}: type ${a.type}`);
  assert.ok(L.CADENCES.includes(a.cadence), `${a.title}: cadence`);
  assert.ok(L.AUDIENCES.includes(a.audience), `${a.title}: audience`);
  if (a.params?.action) assert.ok(types.get(a.type).actions.includes(a.params.action), `${a.title}: action ${a.params.action}`);
}
assert.ok(!data.activities.some((a) => a.type === "vault" && /rate/i.test(a.instructions)), "no vault idea asks to rate");

console.log("check-factory: ok");
