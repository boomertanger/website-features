#!/usr/bin/env node
// functions/scripts/check-climb.js: checks for the Creator Climb core (lib/climb/build.js; docs/specs/creator-climb.md §3, §9, §10). No network.
// Part 1 (always): validation, merging (collector / manual over import, corrections), streams that count, members, crossover, the gap, milestones.
// Part 2 (only where functions/scripts/data/climb-history.json exists: the file is gitignored, so it is skipped elsewhere with a note): every
// confirmed number in spec §10 against the real history.   npm run check
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const B = require("../lib/climb/build");
const { dayKey } = require("../lib/growth/collect");

const HISTORY = path.join(__dirname, "data", "climb-history.json");

/** Builds every month in order (the previous calendar month's month-end feeds the next) and the public doc, as lib/climb/index.js does. */
function buildAll({ imp, daily = [], corrections = [], streams = [], settings = {} }) {
  const keys = [...new Set([...Object.keys(imp.months || {}), ...daily.map((d) => d.day.slice(0, 7))])].sort();
  const months = [];
  let prev = null;
  for (const key of keys) {
    const prevEnd = prev && prev.key === B.prevMonth(key) ? prev.monthEnd : {};
    const prevMembersEnd = prev && prev.key === B.prevMonth(key) && prev.members ? prev.members.end : null;
    const m = B.buildMonth({ key, imported: imp.months[key] || null, daily: daily.filter((d) => d.day.startsWith(key)), corrections, streams, prevEnd, prevMembersEnd, settings, dayKey });
    months.push(m); prev = m;
  }
  const pub = B.buildPublic({ months, combinedOnly: imp.combinedOnly || {}, records: imp.records || [], settings, now: Date.now() });
  return { months, ...pub, M: Object.fromEntries(months.map((m) => [m.key, m])) };
}

// ---------------------------------------------------------------------------------------------- part 1: synthetic
{
  // validation
  assert.deepEqual(B.validateHistory({ months: { "2025-06": { platforms: { twitch: { monthEnd: 10, points: [["2025-06-02", 5], ["2025-06-03", 6]] } } } } }), []);
  assert.ok(B.validateHistory({ months: { "2025-06": { platforms: { twitch: { monthEnd: 10, points: [["2025-06-03", 5], ["2025-06-02", 6]] } } } } }).some((p) => /date order/.test(p)), "out of order");
  assert.ok(B.validateHistory({ months: { "2025-06": { lastReadingDay: "2025-06-10", platforms: { twitch: { monthEnd: 10, points: [["2025-06-12", 5]] } } } } }).some((p) => /after lastReadingDay/.test(p)), "after the last reading day");
  assert.ok(B.validateHistory({ months: { "2025-06": { platforms: { twitch: { monthEnd: 10, points: [["2025-07-01", 5]] } } } } }).some((p) => /outside the month/.test(p)));
  assert.ok(B.validateHistory({ months: { "2025-06": { total: 30, platforms: { twitch: { monthEnd: 10, points: [] }, tiktok: { monthEnd: 15, points: [] } } } } }).some((p) => /add up to 25/.test(p)), "a typed total must be the platforms added up");
  assert.throws(() => B.importMonths({ months: { bad: {} } }), /problems/);

  // merging: collector / manual over import, a hidden YouTube count skipped, a correction replaces the day
  const imported = { points: { twitch: [{ d: "2026-10-01", v: 600, s: "import" }, { d: "2026-10-02", v: 601, s: "import" }] }, monthEnd: {}, startingBalance: {}, notes: {}, lastReadingDay: null, streams: null, hours: null, likes: null, highlights: [] };
  const merged = B.mergePoints({ key: "2026-10", imported, daily: [{ day: "2026-10-02", twitch: { followers: 650 }, youtube: { subscribers: null }, tiktok: { followers: 8000, source: "manual" } }], corrections: [{ day: "2026-10-01", platform: "twitch", value: 599 }, { day: "2026-10-02", platform: "tiktok", value: 1, removedAt: 1 }] });
  assert.deepEqual(merged.twitch, [{ d: "2026-10-01", v: 599, s: "correction" }, { d: "2026-10-02", v: 650, s: "collector" }]);
  assert.deepEqual(merged.tiktok, [{ d: "2026-10-02", v: 8000, s: "manual" }], "a removed correction doesn't apply");
  assert.equal(merged.youtube, undefined, "a hidden YouTube count is skipped, never zero");

  // streams: ended in the month (LA), not after-shows or ad hoc backstage; hours from the Start beat to the End beat; the best combined peak
  const T = (s) => Date.parse(s);
  const st = B.streamStats([
    { id: "a", startMs: T("2026-10-03T02:00:00Z"), endMs: T("2026-10-03T05:00:00Z"), peak: 40 },
    { id: "b", startMs: T("2026-10-04T02:00:00Z"), endMs: T("2026-10-04T03:00:00Z"), peak: 90, afterShowOf: "a" },
    { id: "c", startMs: T("2026-10-05T02:00:00Z"), endMs: T("2026-10-05T03:00:00Z"), adhoc: true, type: "backstage" },
    { id: "d", startMs: T("2026-11-01T05:00:00Z"), endMs: T("2026-11-01T06:30:00Z"), peak: 55 },   // Oct 31, 10:30 pm in Los Angeles
  ], "2026-10", dayKey);
  assert.deepEqual(st, { count: 2, minutes: 270, peak: { value: 55, day: "2026-10-31", streamId: "d" } });

  // members (§9b): points, joined and left summed, groups under 5 as "<5"; the first month after the gap starts again from its first reading
  const daily = [
    { day: "2026-12-01", twitch: { followers: 612 }, tiktok: { followers: 8010, source: "api" }, youtube: { subscribers: 745 }, site: { members: 3, joined: 3, left: 0, fanClub: 3, subClub: 0, byMethod: { google: 2, email: 1, twitch: 0, unknown: 0 } } },
    { day: "2026-12-02", twitch: { followers: 615 }, tiktok: { followers: 8100, source: "api" }, youtube: { subscribers: 746 }, site: { members: 12, joined: 10, left: 1, fanClub: 12, subClub: 0, byMethod: { google: 7, email: 3, twitch: 2, unknown: 0 } } },
  ];
  const syn = buildAll({ imp: { months: {}, combinedOnly: {} }, daily, settings: { startDay: "2026-12-01" } });
  const dec = syn.M["2026-12"];
  assert.deepEqual(dec.members.points, [{ d: "2026-12-01", v: 3 }, { d: "2026-12-02", v: 12 }]);
  assert.equal(dec.members.joined, 13); assert.equal(dec.members.left, "<5"); assert.equal(dec.members.byMethod.twitch, "<5"); assert.equal(dec.members.byMethod.google, 7);
  assert.equal(dec.gain.all, (615 - 612) + (8100 - 8010) + (746 - 745), "a first month starts from its first reading");
  assert.equal(syn.public.members.total, 12); assert.equal(syn.public.members.perThousand, Math.round((12 / (615 + 8100 + 746)) * 10000) / 10);
  assert.deepEqual(syn.public.members.milestones.map((m) => m.id), ["members-10"], "members: every 10 up to 100");
  assert.equal(syn.public.gaps.length, 0, "no import, no gap");
  assert.equal(dec.crossover.membersPer100, Math.round((13 / dec.gain.all) * 1000) / 10);

  // milestone rules: a threshold at or below the first reading isn't one; a dip and recovery doesn't repeat it
  const ms = B.milestonesOf("twitch", [{ d: "a", v: 250, s: "live" }, { d: "b", v: 310, s: "live" }, { d: "c", v: 290, s: "live" }, { d: "d", v: 320, s: "live" }, { d: "e", v: 1200, s: "live" }], (first, max) => { const o = []; for (let v = 100; v <= max; v += v < 1000 ? 100 : 1000) if (v > first) o.push(v); return o; });
  assert.deepEqual(ms.map((m) => `${m.value}@${m.day}`), ["300@b", "400@e", "500@e", "600@e", "700@e", "800@e", "900@e", "1000@e"]);
}

// ---------------------------------------------------------------------------------------------- part 2: the real history (local only)
if (!fs.existsSync(HISTORY)) {
  console.log("check-climb: ok (synthetic only; functions/scripts/data/climb-history.json isn't on this machine, so the confirmed numbers were skipped)");
} else {
  const h = JSON.parse(fs.readFileSync(HISTORY, "utf8"));
  assert.deepEqual(B.validateHistory(h), [], "the history file passes validation");
  const imp = B.importMonths(h);
  assert.equal(Object.keys(imp.months).length, 11, "11 imported months");
  assert.equal(Object.values(imp.months).reduce((a, m) => a + Object.values(m.points).reduce((b, p) => b + p.length, 0), 0), 330, "330 points");
  const settings = { eras: imp.eras };
  const r = buildAll({ imp, settings });
  const row = (k) => r.public.monthEnd.find((x) => x.month === k);
  // §10 confirmed numbers
  assert.equal(row("2025-11").all, 6615, "D2: November 2025 = 6,615");
  assert.equal(r.M["2025-08"].gain.all, 645, "D3: August 2025 new = 645 (YouTube's 443 is a starting balance)");
  assert.equal(r.M["2025-08"].startingBalance.youtube, 443);
  assert.equal(row("2026-04").all, 9234, "April 2026 total = 9,234");
  assert.equal(r.public.totals.all, 9234, "the total until the collector's first reading");
  assert.equal(r.M["2025-07"].monthEnd.twitch, 412, "D1: July 2025 Twitch is the month-end only");
  assert.equal(r.M["2025-06"].likes, null, "D4: no likes recorded in June 2025"); assert.equal(r.M["2025-07"].likes, null);
  assert.equal(r.milestones.length, 31, "31 imported milestones");
  assert.ok(r.milestones.every((m) => m.src === "import"), "all of them imported (none announced at seed)");
  const newest = r.milestones[r.milestones.length - 1];
  assert.equal(newest.id, "all-9000", "the newest milestone: 9,000 combined");
  // The spec says Apr 20, 2026; by its own rule (the first reading at or above it) the combined total first passed 9,000 on Apr 16 (9,012).
  assert.equal(newest.day, "2026-04-16", "9,000 combined: the first reading at or above it (9,012 on Apr 16, 2026)");
  // crossover, August 2025 to April 2026
  const x = r.public.crossover;
  assert.deepEqual(x.span, { from: "2025-08", to: "2026-04" });
  assert.equal(x.tiktok, 4609); assert.equal(x.twitch, 4.2); assert.equal(x.youtube, 6.4);
  const era = (id) => x.eras.find((e) => e.era === id);
  assert.deepEqual([era("the-grind").twitch, era("the-grind").youtube], [5.3, 6.9], "The grind");
  assert.deepEqual([era("the-build").twitch, era("the-build").youtube], [1.8, 5.3], "The build");
  assert.equal(r.M["2025-11"].crossover.small, true, "November 2025 is a small month");
  assert.equal(r.M["2025-10"].crossover.small, false);
  // the gap: from the last imported reading, open until the first automatic one
  assert.deepEqual(r.public.gaps, [{ from: "2026-04-20", to: null }]);
  assert.equal(r.public.monthEnd[0].month, "2025-01", "month-ends from January 2025");
  assert.equal(r.public.counts.milestones, 31);
  // the first collector reading closes the gap and its month starts from its first reading (never a jump across untracked time)
  const r2 = buildAll({ imp, settings, daily: [{ day: "2026-09-26", twitch: { followers: 610 }, tiktok: { followers: 7950, source: "manual" }, youtube: { subscribers: 740 } }, { day: "2026-09-27", twitch: { followers: 611 }, tiktok: { followers: 7960, source: "manual" }, youtube: { subscribers: 740 } }] });
  assert.deepEqual(r2.public.gaps, [{ from: "2026-04-20", to: "2026-09-26" }]);
  assert.equal(r2.M["2026-09"].gain.all, 1 + 10 + 0);
  assert.equal(r2.public.totals.all, 611 + 7960 + 740);
  assert.equal(r2.milestones.filter((m) => m.src !== "import").length, 0, "no new milestone yet");
  console.log("check-climb: ok (synthetic, and the confirmed numbers from the real history)");
}
