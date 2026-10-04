#!/usr/bin/env node
// functions/scripts/check-arcade.js: quick checks for the pure Boom Arcade helpers
// (lib/arcade/logic.js): run checks, week keys in America/Chicago, board insert
// and trim to 100, tie order and ranks, plus the new exports. No credentials needed.
//   npm run check      (or node scripts/check-arcade.js)
const assert = require("assert/strict");
const L = require("../lib/arcade/logic");

// ---------- run ids ----------
const AUTO = "Ab3dEf6hIj9lMn2pQr5t";   // 20 chars, like a Firestore auto-id
assert.deepEqual(L.parseRunId(`tapTheSplat/v1/${AUTO}`), { gameId: "tapTheSplat", version: "v1", docId: AUTO });
assert.equal(L.runPath("tapTheSplat", "v1", "x"), "tapTheSplat/v1/x");
for (const bad of ["", "a/b", "a/b/c/d", "a/../c", "a/b/c d", "tapTheSplat/v1/abc123", `tapTheSplat/v1/${AUTO}x`,
  `tapTheSplat/v1/${AUTO.slice(0, 19)}_`, `tapTheSplat/v1/${AUTO}/x`, `/v1/${AUTO}`, null, 42]) assert.equal(L.parseRunId(bad), null, String(bad));

// ---------- weeks: Monday 00:00 America/Chicago ----------
const utc = (iso) => new Date(iso).getTime();
assert.equal(L.WEEK_TZ, "America/Chicago");
assert.equal(L.weekKey(utc("2026-09-28T05:00:00Z")), "2026-W40");   // Mon 00:00 CDT
assert.equal(L.weekKey(utc("2026-09-28T04:59:59Z")), "2026-W39");   // Sun 23:59 CDT
assert.equal(L.weekKey(utc("2026-09-28T06:30:00Z")), "2026-W40");   // Mon 01:30 CDT (Sun 23:30 in Pacific: the old boundary)
assert.equal(L.weekKey(utc("2026-10-04T23:00:00Z")), "2026-W40");   // Sun 18:00 CDT
assert.equal(L.weekKey(utc("2026-11-02T06:00:00Z")), "2026-W45");   // Mon 00:00 CST (after DST ends)
assert.equal(L.weekKey(utc("2026-11-02T05:59:00Z")), "2026-W44");
assert.equal(L.weekKey(utc("2027-01-01T12:00:00Z")), "2026-W53");   // ISO year: Fri Jan 1 2027 belongs to 2026-W53
assert.equal(L.weekKey(utc("2027-01-04T06:00:00Z")), "2027-W01");
assert.equal(L.dayKey(utc("2026-09-30T04:30:00Z")), "2026-09-29");  // still the 29th in Chicago
assert.equal(L.dayKey(utc("2026-09-30T05:30:00Z")), "2026-09-30");

// ---------- boards ----------
const row = (uid, secs, at) => ({ uid, handle: uid, displayName: uid, secs, penalties: 0, at });
let r = L.insertRow([], row("a", 50, 1));
assert.deepEqual([r.rank, r.changed, r.rows.length], [1, true, 1]);
r = L.insertRow(r.rows, row("b", 40, 2));
assert.deepEqual(r.rows.map((x) => x.uid), ["b", "a"]);
assert.equal(r.rank, 1);
// Ties: the earlier run ranks higher.
r = L.insertRow(r.rows, row("c", 40, 3));
assert.deepEqual(r.rows.map((x) => x.uid), ["b", "c", "a"]);
assert.equal(r.rank, 2);
// One row per member: a slower time leaves the board as it was; a faster one moves up.
let same = L.insertRow(r.rows, row("a", 60, 4));
assert.deepEqual([same.changed, same.rank, same.rows.length], [false, 3, 3]);
same = L.insertRow(r.rows, row("a", 50, 0.5));   // equal time, earlier: counts as better
assert.equal(same.changed, true);
same = L.insertRow(r.rows, row("a", 30, 5));
assert.deepEqual(same.rows.map((x) => x.uid), ["a", "b", "c"]);
// Trim to 100; a time that doesn't place changes nothing.
const full = Array.from({ length: 100 }, (_, i) => row(`m${i}`, 30 + i, i));
const miss = L.insertRow(full, row("late", 500, 1000));
assert.deepEqual([miss.changed, miss.rank, miss.rows.length], [false, null, 100]);
const hit = L.insertRow(full, row("fast", 10, 1000));
assert.deepEqual([hit.changed, hit.rank, hit.rows.length, hit.rows[99].uid], [true, 1, 100, "m98"]);
assert.equal(L.rankOf(hit.rows, "m50"), 52);
assert.equal(L.rankOf(hit.rows, "m99"), null);
assert.deepEqual(L.removeRow([row("a", 1, 1), row("b", 2, 2)], "a").map((x) => x.uid), ["b"]);
assert.deepEqual(L.buildRows([row("b", 5, 2), row("a", 5, 1), row("c", 4, 9)]).map((x) => x.uid), ["c", "a", "b"]);
assert.equal(L.boardId(1, "desktop", "2026-W40"), "e1_desktop_2026-W40");

// ---------- run checks ----------
const cfg = { minSecs: { desktop: 26, mobile: 31 }, slackSecs: 3, maxRunMins: 30 };
const splits = [0, 1.1, 4.9, 7, 9, 14, 18, 24, 30, 38];
const win = { result: "win", secs: 45.5, penalties: 3, reached: 100, splits, device: "desktop" };
const check = (run, serverSecs = 42.4) => L.checkRun(run, { serverSecs, checks: cfg });
assert.deepEqual(check(win), { ok: true, reasons: [] });   // wall clock 42.5 vs server 42.4
assert.deepEqual(check(win, 38).reasons, ["clock"]);       // 4.5 s apart
assert.deepEqual(check({ ...win, secs: 28, penalties: 3, splits: [0, 1, 4, 5, 6, 7, 8, 9, 10, 11] }, 25).reasons, ["tooFast"]);   // 25 s wall < 26
assert.ok(check({ ...win, device: "mobile" }).ok);
assert.deepEqual(check({ ...win, penalties: 1.5 }).reasons.includes("penalties"), true);
assert.deepEqual(check({ ...win, penalties: 1000 }).reasons.includes("penalties"), true);
assert.deepEqual(check({ ...win, reached: 99 }).reasons, ["reached"]);
assert.deepEqual(check({ ...win, splits: splits.slice(0, 9) }).reasons, ["splits"]);                    // a win needs every round
assert.deepEqual(check({ ...win, splits: [0, 1.1, 3.5, ...splits.slice(3)] }).reasons, ["splits"]);    // firefly under 2.6 s
assert.deepEqual(check({ ...win, splits: [0, 1.1, 4.9, 4.9, ...splits.slice(4)] }).reasons, ["splits"]); // not strictly rising
assert.deepEqual(check({ ...win, splits: [...splits.slice(0, 9), 50] }).reasons, ["splits"]);           // after the end
assert.deepEqual(check({ ...win, splits: "nope" }).reasons, ["splits"]);
const loss = { result: "boom", secs: 20, penalties: 0, reached: 76, splits: [0, 1.1, 4.5, 6, 8, 10, 13, 17], device: "desktop" };
assert.ok(check(loss, 20.5).ok);                                                  // losses have no floor
assert.deepEqual(check({ ...loss, reached: 100 }, 20.5).reasons, ["reached"]);    // 100% only on a win
assert.ok(check({ ...loss, result: "tappedOut", splits: [0] }, 20.5).ok);
assert.deepEqual(check({ ...loss, result: "cheat" }, 20.5).reasons, ["result"]);

const block = (o) => L.boardBlock({ result: "win", ok: true, uid: "a", signedUp: true, verified: true, epoch: 1, currentEpoch: 1, ...o });
assert.equal(block({}), null);
assert.equal(block({ result: "tappedOut" }), "tappedOut");
assert.equal(block({ result: "missed" }), "lost");
assert.equal(block({ ok: false }), "checks");
assert.equal(block({ uid: null }), "visitor");
assert.equal(block({ signedUp: false }), "needsSignup");
assert.equal(block({ verified: false }), "unverified");
assert.equal(block({ epoch: 0 }), "epoch");

// The functions entry point exports the Arcade functions.
process.env.GCLOUD_PROJECT ||= "boomertanger-staging";
process.env.FIREBASE_CONFIG ||= JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
const fns = require("../index.js");
for (const name of ["startRun", "finishRun", "voteRun", "rollupArcadeStats", "syncArcadeNames"]) {
  assert.ok(fns[name], `missing export ${name}`);
}
console.log("arcade checks passed");
