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
assert.equal(L.tierFor(adm), "crew");      // admins race with the crew, with a Staff tag
assert.equal(L.tierFor(owner), "crew");
assert.equal(L.roleTagFor(adm), "admin");
assert.equal(L.roleTagFor(owner), "admin");
assert.equal(L.roleTagFor(mod), null);
assert.equal(L.roleTagFor(fan), null);
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
// ---------- staff race (fun-factory.md §13c) ----------
assert.equal(L.staffRaceOf({}), "together");
assert.equal(L.staffRaceOf({ staffRace: "separate" }), "separate");
assert.equal(L.staffRaceOf({ staffRace: "nonsense" }), "together");
const race = [
  { uid: "adm1", seasonXp: 900, updatedAt: 1, tier: "crew", roleTag: "admin" },   // 1st by XP, but staff
  { uid: "f1", seasonXp: 800, updatedAt: 1, tier: "fan" },
  { uid: "adm2", seasonXp: 700, updatedAt: 1, tier: "crew", roleTag: "admin" },
  { uid: "m1", seasonXp: 600, updatedAt: 1, tier: "crew" },
  { uid: "s1", seasonXp: 500, updatedAt: 1, tier: "sub" },
  { uid: "f2", seasonXp: 400, updatedAt: 1, tier: "fan" },
  { uid: "f3", seasonXp: 300, updatedAt: 1, tier: "fan" },
];
// Boards: admins on all and crew, never on sub; real ranks include them.
assert.deepEqual(L.boardRows(race, "all").map((r) => r.uid), ["adm1", "f1", "adm2", "m1", "s1", "f2", "f3"]);
assert.deepEqual(L.boardRows(race, "crew").map((r) => r.uid), ["adm1", "adm2", "m1"]);
assert.deepEqual(L.boardRows(race, "sub").map((r) => r.uid), ["s1"]);
assert.deepEqual(L.boardRows(race, "staff").map((r) => r.uid), []);
// Prizes skip admins: places count members only (the first member is 1st even though the board says #2).
assert.deepEqual(L.seasonAwards(race).slice(0, 4).map((a) => [a.uid, a.place, a.kind]), [["f1", 1, "season"], ["m1", 2, "season"], ["s1", 3, "season"], ["f2", 4, "plaque"]]);
// Staff Finish: an admin in the top 10 of the all board, with the real place and the board size.
assert.deepEqual(L.staffFinishes(race, "together", 612), [{ uid: "adm1", place: 1, of: 612 }, { uid: "adm2", place: 3, of: 612 }]);
// An admin outside the top 10 gets none.
const deep = [...Array.from({ length: 10 }, (_, i) => ({ uid: `x${i}`, seasonXp: 1000 - i, updatedAt: 1, tier: "fan" })), { uid: "adm3", seasonXp: 5, updatedAt: 1, tier: "crew", roleTag: "admin" }];
assert.deepEqual(L.staffFinishes(deep, "together", 11), []);
// Separate: admins leave the all, sub and crew boards for a staff board; their finish is their place there.
assert.deepEqual(L.boardRows(race, "all", "separate").map((r) => r.uid), ["f1", "m1", "s1", "f2", "f3"]);
assert.deepEqual(L.boardRows(race, "crew", "separate").map((r) => r.uid), ["m1"]);
assert.deepEqual(L.boardRows(race, "staff", "separate").map((r) => r.uid), ["adm1", "adm2"]);
assert.deepEqual(L.staffFinishes(race, "separate"), [{ uid: "adm1", place: 1, of: 2 }, { uid: "adm2", place: 2, of: 2 }]);
// Beat the Boss: only once the owner has 500 season XP, only non-admins, only strictly more.
assert.deepEqual(L.beatTheBoss(race, 600), ["f1"]);   // f1 (800) beats a boss on 600; m1 ties and doesn't; admins never
assert.deepEqual(L.beatTheBoss(race, 499), []);                                           // under the 500 gate nobody earns it
assert.deepEqual(L.beatTheBoss(race, 500).sort(), ["f1", "m1"]);                          // exactly 500 opens the gate; s1 (500) doesn't beat it
assert.equal(L.BOSS_MIN_XP, 500);

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
assert.equal(types.get("ratings")?.enabled, true, "ratings is on: the Service Hub rates Vault games (docs/specs/service-hub.md §9)");
assert.deepEqual(types.get("ratings").actions, ["rate"]);
assert.equal(types.get("services")?.enabled, true, "services is on (Service Hub)");
assert.deepEqual(types.get("services").actions, ["rate", "test", "rateAll"]);
assert.deepEqual(types.get("services").params, ["action", "type", "serviceId"]);
assert.deepEqual(types.get("vault").actions, ["want", "add", "cover"]);
for (const a of data.activities) {
  assert.ok(types.has(a.type), `${a.title}: type ${a.type}`);
  assert.ok(L.CADENCES.includes(a.cadence), `${a.title}: cadence`);
  assert.ok(L.AUDIENCES.includes(a.audience), `${a.title}: audience`);
  if (a.params?.action) assert.ok(types.get(a.type).actions.includes(a.params.action), `${a.title}: action ${a.params.action}`);
}
assert.ok(!data.activities.some((a) => a.type === "vault" && /rate/i.test(a.instructions)), "no vault idea asks to rate");
// The idea seed gives every idea a stable, unique id.
const { ideasFrom } = require("./seed-factory-ideas");
const seeded = ideasFrom(data);
assert.equal(new Set(seeded.map(([id]) => id)).size, seeded.length, "unique idea ids");
assert.ok(seeded.every(([id]) => /^[a-z]+-[a-z0-9-]+$/.test(id)), "idea ids are slugs");

// ---------- builder stage checks (lib/factory/checks.js) and the site's copy ----------
const C = require("../lib/factory/checks");
const W = 7 * 86400000;
const s0 = Date.parse("2027-01-11T06:00:00Z");   // Monday 00:00 CST
function draft(over = {}) {
  const chapters = [0, 3, 6, 10].map((wk, i) => ({ id: `c${i + 1}`, order: i + 1, name: `Chapter ${i + 1}`, unlockAt: s0 + wk * W }));
  const campaigns = [], activities = [];
  for (const ch of chapters) {
    campaigns.push({ id: `${ch.id}-d`, chapterId: ch.id, name: "Daily", cadence: "daily", audience: "all" }, { id: `${ch.id}-w`, chapterId: ch.id, name: "Weekly", cadence: "weekly", audience: "all" }, { id: `${ch.id}-s`, chapterId: ch.id, name: "Story", cadence: "story", audience: "all" });
    activities.push({ id: `${ch.id}-d1`, campaignId: `${ch.id}-d`, title: "Clock in", typeId: "checkin", target: 1, xp: 10, repeat: "daily" });
    activities.push({ id: `${ch.id}-w1`, campaignId: `${ch.id}-w`, title: "Splat run", typeId: "arcade", params: { action: "finish" }, target: 3, xp: 60, repeat: "weekly" });
    activities.push({ id: `${ch.id}-s1`, campaignId: `${ch.id}-s`, title: `Story ${ch.id}`, typeId: "visit", target: 3, xp: 150 });
  }
  campaigns.push({ id: "m", chapterId: "c1", name: "Milestones", cadence: "milestone", audience: "all" });
  activities.push({ id: "m1", campaignId: "m", title: "Ten check-ins", typeId: "checkin", target: 10, xp: 250 });
  campaigns.push({ id: "crew", chapterId: "c1", name: "Mod patrol", cadence: "weekly", audience: "crew" });
  activities.push({ id: "crew1", campaignId: "crew", title: "Patrol", typeId: "badges", target: 1, xp: 500, repeat: "weekly" });
  return { season: { id: "s2", name: "Vaultbreakers", pitch: "Crack it open.", art: { url: "https://x/y.png" }, startsAt: s0, endsAt: s0 + 13 * W, badgeId: "season-s2", status: "draft" }, chapters, campaigns, activities, ...over };
}
const TYPES = { checkin: true, visit: true, medals: true, profile: true, arcade: true, badges: true, vault: true, ratings: false };
const ctx = { types: TYPES, others: [{ id: "s1", name: "Dark Signal", status: "ended", startsAt: s0 - 14 * W, endsAt: s0 - W }], now: s0 - 10 * W };
let r = C.stageChecks(draft(), ctx);
// Budget: daily 10 x 91 days, weekly 60 x 13 weeks, 4 x 150 story, 250 milestone; the crew campaign doesn't count.
assert.deepEqual(r.budget.byCadence, { daily: 910, weekly: 780, story: 600, milestone: 250, event: 0 });
assert.equal(r.budget.total, 2540);
assert.equal(r.stages.find((x) => x.key === "rewards").checks[0].state, "warn");   // below 3,000: a warning...
assert.equal(r.readyToSubmit, true);                                                 // ...that doesn't block
assert.deepEqual(r.stages.map((x) => x.state), ["done", "done", "done", "done", "done", "done", "now", "todo"]);
const T = (t) => { const c = draft(); t(c); return C.stageChecks(c, ctx); };
const stage = (res, k) => res.stages.find((x) => x.key === k);
assert.equal(stage(T((c) => { c.season.art = null; }), "theme").ok, false);
assert.equal(stage(T((c) => { c.season.name = "dark signal"; }), "theme").ok, false);   // used before, any case
assert.equal(stage(T((c) => { c.chapters = c.chapters.slice(0, 1); c.campaigns = c.campaigns.filter((x) => x.chapterId === "c1"); }), "chapters").ok, false);
assert.equal(stage(T((c) => { c.chapters[0].unlockAt += 86400000; }), "chapters").ok, false);   // a gap at the start
assert.equal(stage(T((c) => { c.chapters[2].name = " "; }), "chapters").ok, false);
assert.equal(stage(T((c) => { c.campaigns = c.campaigns.filter((x) => x.id !== "c3-s"); c.activities = c.activities.filter((a) => a.campaignId !== "c3-s"); }), "campaigns").ok, false);
assert.equal(stage(T((c) => { for (let i = 0; i < 4; i++) c.campaigns.push({ id: `x${i}`, chapterId: "c2", name: `X${i}`, cadence: "event", audience: "all" }); }), "campaigns").ok, false);   // 7 in a chapter
assert.equal(stage(T((c) => { c.activities = c.activities.filter((a) => a.id !== "c2-w1"); }), "activities").ok, false);
assert.equal(stage(T((c) => { c.activities[0].typeId = "ratings"; }), "activities").ok, false);
assert.equal(stage(T((c) => { c.activities.push({ id: "dup", campaignId: "c1-d", title: "Clock in", typeId: "visit", target: 2, xp: 5 }); }), "activities").ok, false);
assert.equal(stage(T((c) => { c.season.badgeId = null; }), "rewards").ok, false);
assert.equal(stage(T((c) => { c.activities.filter((a) => a.repeat === "weekly" && a.id !== "crew1").forEach((a) => { a.xp = 130; }); }), "rewards").checks[0].state, "ok");   // weekly 130 x 13 brings it to 3,450
assert.equal(stage(T((c) => { c.season.startsAt = null; }), "schedule").ok, false);
const clashCtx = { ...ctx, others: [...ctx.others, { id: "s3", name: "Other", status: "scheduled", startsAt: s0 + 12 * W, endsAt: s0 + 20 * W }] };
assert.equal(stage(C.stageChecks(draft(), clashCtx), "schedule").ok, false);
assert.equal(stage(C.stageChecks(draft(), { ...clashCtx, others: [{ ...clashCtx.others[1], status: "draft" }] }), "schedule").ok, true);   // drafts don't block
assert.equal(stage(T((c) => { c.campaigns.push({ id: "ev", chapterId: "c2", name: "Full moon", cadence: "event", audience: "all", opensAt: s0 + 4 * W, closesAt: s0 + 7 * W }); c.activities.push({ id: "ev1", campaignId: "ev", title: "Moon", typeId: "medals", target: 1, xp: 100 }); }), "schedule").ok, false);   // past its chapter's end
assert.equal(stage(T((c) => { c.campaigns.push({ id: "ev", chapterId: "c2", name: "Full moon", cadence: "event", audience: "all", opensAt: s0 + 4 * W, closesAt: s0 + 4 * W + 3 * 86400000 }); c.activities.push({ id: "ev1", campaignId: "ev", title: "Moon", typeId: "medals", target: 1, xp: 100 }); }), "schedule").ok, true);
assert.equal(T((c) => { c.season.status = "live"; }).stages.find((x) => x.key === "live").state, "done");

// The site's copy gives the same answers.
import(require("url").pathToFileURL(path.join(__dirname, "../../site/src/lib/factory-checks.js")).href).then((S) => {
  const cases = [draft(), ...[(c) => { c.season.art = null; }, (c) => { c.chapters[0].unlockAt += 86400000; }, (c) => { c.activities.filter((a) => a.repeat === "weekly" && a.id !== "crew1").forEach((a) => { a.xp = 130; }); }, (c) => { c.season.status = "review"; }, (c) => { c.season.status = "live"; }].map((t) => { const c = draft(); t(c); return c; })];
  for (const c of cases) for (const x of [ctx, clashCtx]) assert.deepEqual(S.stageChecks(c, x), C.stageChecks(c, x), "site copy of the stage checks");
  assert.deepEqual(S.STAGES, C.STAGES);
  assert.deepEqual(S.BUDGET, C.BUDGET);
  console.log("check-factory: ok");
}).catch((e) => { console.error(e); process.exit(1); });
