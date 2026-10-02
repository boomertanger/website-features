#!/usr/bin/env node
// functions/scripts/check-streams.js: checks for the stream object's pure logic
// (lib/streams/logic.js, docs/specs/stream-object.md): transitions, slugs and weeks in the
// site's time zone, segments, outcomes, minutes per game, the 12-hour auto-end and the stats
// the Vault's trigger recomputes. No credentials.   npm run check
const assert = require("assert/strict");
const L = require("../lib/streams/logic");

const TZ = "America/Chicago";
const T0 = Date.UTC(2026, 9, 6, 0, 0, 0);          // Mon 2026-10-05 19:00 in Chicago
const MIN = 60000, HOUR = 60 * MIN;
const at = (min) => T0 + min * MIN;

// ---------- transitions ----------
assert.equal(L.canTransition("planned", "scheduled"), true);
assert.equal(L.canTransition("planned", "cancelled"), true);
assert.equal(L.canTransition("planned", "live"), true);
assert.equal(L.canTransition("scheduled", "live"), true);
assert.equal(L.canTransition("scheduled", "planned"), false);
assert.equal(L.canTransition("scheduled", "ended"), false);
assert.equal(L.canTransition("live", "ended"), true);
assert.equal(L.canTransition("live", "cancelled"), false);
assert.equal(L.canTransition("ended", "live"), false);
assert.equal(L.canTransition("ended", "planned"), false);
assert.equal(L.canTransition("cancelled", "scheduled"), false);
assert.equal(L.canTransition("nope", "live"), false);
for (const s of L.STATES) assert.ok(s in L.TRANSITIONS, s);

// ---------- slug and week (site time zone) ----------
assert.equal(L.streamSlug(T0, TZ), "2026-10-05");               // 19:00 Chicago is already 00:00 UTC on the 6th
assert.equal(L.streamSlug(T0, TZ, ["2026-10-05"]), "2026-10-05-2");
assert.equal(L.streamSlug(T0, TZ, ["2026-10-05", "2026-10-05-2"]), "2026-10-05-3");
assert.equal(L.streamSlug(T0, TZ, ["2026-10-06"]), "2026-10-05");
assert.equal(L.streamSlug(T0, "UTC"), "2026-10-06");
assert.equal(L.streamWeek(T0, TZ), "2026-W41");
assert.equal(L.streamWeek(Date.UTC(2026, 9, 12, 4, 59, 0), TZ), "2026-W41");   // Sun 23:59 Chicago
assert.equal(L.streamWeek(Date.UTC(2026, 9, 12, 5, 0, 0), TZ), "2026-W42");    // Mon 00:00 Chicago
assert.throws(() => L.streamSlug(T0), /time zone/);
assert.throws(() => L.streamWeek(T0, ""), /time zone/);

// ---------- start, switch, stop ----------
const GRANNY = { gameId: "granny-chapter-two", title: "Granny: Chapter Two" };
const SH2 = { gameId: "silent-hill-2", title: "Silent Hill 2" };
const LC = { gameId: "lethal-company", title: "Lethal Company" };
const planned = [
  { gameId: GRANNY.gameId, title: GRANNY.title, order: 1, source: { kind: "owner" }, outcome: null },
  { gameId: SH2.gameId, title: SH2.title, order: 2, source: { kind: "suggestion", suggestionId: "s1", byHandle: "viewer1" }, outcome: null },
  { gameId: LC.gameId, title: LC.title, order: 3, source: { kind: "wishlist" }, outcome: null },
];
let stream = { state: "scheduled", plannedGames: planned, segments: [], gameIds: [] };

let r = L.startStream(stream, at(0), GRANNY);
assert.equal(r.ok, true);
assert.equal(r.patch.state, "live");
assert.equal(r.patch.actualStart, at(0));
assert.deepEqual(r.patch.gameIds, [GRANNY.gameId]);
assert.equal(r.patch.segments[0].endedAt, null);
stream = { ...stream, ...r.patch };
assert.deepEqual(L.startStream(stream, at(1)), { ok: false, reason: "badState" });           // already live
assert.deepEqual(L.startStream({ state: "ended" }, at(1)), { ok: false, reason: "badState" });
assert.deepEqual(L.startStream({ state: "cancelled" }, at(1)), { ok: false, reason: "badState" });
r = L.startStream({ state: "planned", plannedGames: [] }, at(0));                             // no game yet: segments start empty
assert.deepEqual(r.patch.segments, []);

// switch to another game after 60 minutes, then a 10 minute break, then back
r = L.switchSegment(stream, SH2, at(60));
assert.equal(r.ok, true);
assert.equal(r.patch.segments.length, 2);
assert.equal(r.patch.segments[0].endedAt, at(60), "the open segment closes at the switch");
assert.equal(r.patch.segments[1].gameId, SH2.gameId);
assert.equal(r.patch.segments[1].endedAt, null);
assert.equal(stream.segments[0].endedAt, null, "the input is not mutated");
stream = { ...stream, ...r.patch };
assert.deepEqual(L.switchSegment(stream, SH2, at(61)), { ok: false, reason: "alreadyOn" });
r = L.switchSegment(stream, { kind: "break" }, at(100));
assert.equal(r.patch.segments[2].kind, "break");
assert.equal(r.patch.segments[2].gameId, null);
assert.deepEqual(r.patch.gameIds, [GRANNY.gameId, SH2.gameId], "breaks are not games");
stream = { ...stream, ...r.patch };
assert.deepEqual(L.switchSegment(stream, null, at(101)), { ok: false, reason: "alreadyOn" });  // already on a break
r = L.switchSegment(stream, SH2, at(110));                                                     // back to the same game: a new segment
assert.equal(r.ok, true);
stream = { ...stream, ...r.patch };
assert.equal(stream.segments.length, 4);
assert.deepEqual(L.switchSegment({ ...stream, state: "ended" }, LC, at(120)), { ok: false, reason: "notLive" });

// stop at 150 minutes: closes the open segment, marks the planned games
r = L.stopStream(stream, at(150));
assert.equal(r.ok, true);
assert.equal(r.patch.state, "ended");
assert.equal(r.patch.actualEnd, at(150));
assert.equal(r.patch.segments.every((s) => s.endedAt != null), true);
assert.deepEqual(r.patch.plannedGames.map((g) => g.outcome), ["played", "played", "skipped"]);
assert.equal(r.patch.autoEnded, undefined);
const ended = { ...stream, ...r.patch };
assert.deepEqual(L.stopStream(ended, at(160)), { ok: false, reason: "badState" });
assert.deepEqual(L.stopStream({ state: "scheduled", segments: [] }, at(1)), { ok: false, reason: "badState" });

// minutes per game: Granny 0-60, Silent Hill 2 60-100 + 110-150
assert.deepEqual(L.minutesPerGame(ended.segments, at(150)), { [GRANNY.gameId]: 60, [SH2.gameId]: 80 });
assert.deepEqual(L.minutesPerGame([], at(5)), {});
assert.deepEqual(L.minutesPerGame([{ gameId: "a", kind: "game", startedAt: at(0), endedAt: null }], at(45)), { a: 45 }, "an open segment counts up to the end time");
assert.deepEqual(L.minutesPerGame([{ gameId: "a", kind: "game", startedAt: 0, endedAt: 20000 }, { gameId: "a", kind: "game", startedAt: 100000, endedAt: 120000 }], 0), { a: 1 }, "rounded once per game, not per segment");
assert.deepEqual(L.minutesPerGame([{ gameId: null, kind: "break", startedAt: 0, endedAt: HOUR }], 0), {});

// outcomes alone
assert.deepEqual(L.computeOutcomes(planned, []).map((g) => g.outcome), ["skipped", "skipped", "skipped"]);
assert.deepEqual(L.computeOutcomes([], ended.segments), []);

// ---------- the 12-hour auto-end ----------
const live = { state: "live", actualStart: at(0), plannedGames: planned, segments: [{ gameId: GRANNY.gameId, kind: "game", title: GRANNY.title, startedAt: at(0), endedAt: null }] };
assert.equal(L.needsAutoEnd(live, at(0) + 12 * HOUR - 1), false);
assert.equal(L.needsAutoEnd(live, at(0) + 12 * HOUR), true);
assert.equal(L.needsAutoEnd({ ...live, state: "ended" }, at(0) + 20 * HOUR), false);
assert.equal(L.needsAutoEnd({ ...live, actualStart: null }, at(0) + 20 * HOUR), false);
r = L.autoEnd(live);
assert.equal(r.ok, true);
assert.equal(r.patch.state, "ended");
assert.equal(r.patch.autoEnded, true);
assert.equal(r.patch.actualEnd, at(0) + 12 * HOUR, "ended exactly 12 hours in, however late the sweep runs");
assert.equal(r.patch.segments[0].endedAt, at(0) + 12 * HOUR);
assert.deepEqual(L.minutesPerGame(r.patch.segments, 0), { [GRANNY.gameId]: 720 });

// ---------- segments are capped at 30 ----------
{
  let s = { state: "live", actualStart: at(0), segments: [], plannedGames: [] };
  for (let i = 0; i < 30; i++) {
    const out = L.switchSegment(s, { gameId: `g${i}`, title: `Game ${i}` }, at(i));
    assert.equal(out.ok, true, `segment ${i}`);
    s = { ...s, ...out.patch };
  }
  assert.deepEqual(L.switchSegment(s, { gameId: "one-more", title: "One more" }, at(31)), { ok: false, reason: "tooManySegments" });
}

// ---------- validation ----------
assert.deepEqual(L.validateStream({ state: "planned", title: "Monday scare", platforms: ["twitch", "youtube"], plannedStart: at(0), plannedEnd: at(180), plannedGames: planned }), []);
assert.deepEqual(L.validateStream(ended), []);
const bad = (s) => L.validateStream({ state: "planned", ...s });
assert.ok(bad({ state: "paused" }).some((e) => e.startsWith("state")));
assert.ok(bad({ title: "x".repeat(121) }).some((e) => e.startsWith("title")));
assert.ok(bad({ platforms: ["twitch", "kick"] }).some((e) => e.startsWith("platforms")));
assert.ok(bad({ plannedStart: at(10), plannedEnd: at(10) }).some((e) => e.startsWith("plannedEnd")));
assert.ok(bad({ plannedGames: [{ gameId: "", source: { kind: "owner" } }] }).some((e) => e.includes("gameId")));
assert.ok(bad({ plannedGames: [{ gameId: "a", source: { kind: "friend" } }] }).some((e) => e.includes("source.kind")));
assert.ok(bad({ plannedGames: [{ gameId: "a", source: { kind: "owner" }, outcome: "won" }] }).some((e) => e.includes("outcome")));
assert.ok(bad({ plannedGames: Array.from({ length: 21 }, (_, i) => ({ gameId: `g${i}`, source: { kind: "owner" } })) }).some((e) => e.startsWith("plannedGames")));
assert.ok(bad({ segments: Array.from({ length: 31 }, () => ({ kind: "break", startedAt: 0, endedAt: 1 })) }).some((e) => e.startsWith("segments")));
assert.ok(bad({ segments: [{ kind: "game", gameId: "a", startedAt: 5, endedAt: 1 }] }).some((e) => e.includes("ends before")));
assert.ok(bad({ segments: [{ kind: "game", startedAt: 1, endedAt: 5 }] }).some((e) => e.includes("gameId")));
assert.ok(bad({ segments: [{ kind: "break", startedAt: 1 }, { kind: "break", startedAt: 2 }] }).some((e) => e.includes("more than one open")));
assert.ok(L.validateStream({ state: "ended", segments: [{ kind: "break", startedAt: 1 }] }).some((e) => e.includes("open segment")));
assert.ok(bad({ actualStart: 10, actualEnd: 5 }).some((e) => e.startsWith("actualEnd")));

// ---------- stats for the Vault: recomputed from ended streams ----------
const second = {
  state: "ended", actualStart: at(24 * 60), actualEnd: at(24 * 60 + 120), gameIds: [GRANNY.gameId],
  segments: [{ gameId: GRANNY.gameId, kind: "game", title: GRANNY.title, startedAt: at(24 * 60), endedAt: at(24 * 60 + 120) }],
};
const cancelled = { ...second, state: "cancelled" };
const notEnded = { ...live };
let st = L.statsForGame(GRANNY.gameId, [ended, second, cancelled, notEnded]);
assert.deepEqual(st, { streamCount: 2, minutes: 180, firstStreamedAt: at(0), lastStreamedAt: at(24 * 60 + 120) });
st = L.statsForGame(SH2.gameId, [ended, second]);
assert.deepEqual(st, { streamCount: 1, minutes: 80, firstStreamedAt: at(60), lastStreamedAt: at(150) });
assert.deepEqual(L.statsForGame("never-played", [ended, second]), { streamCount: 0, minutes: 0, firstStreamedAt: null, lastStreamedAt: null });
assert.deepEqual(L.statsForGame(GRANNY.gameId, []), { streamCount: 0, minutes: 0, firstStreamedAt: null, lastStreamedAt: null });
// recomputing the same inputs twice gives the same answer (no running totals)
assert.deepEqual(L.statsForGame(GRANNY.gameId, [ended, second]), L.statsForGame(GRANNY.gameId, [second, ended]));

// which games a stream write touches
assert.deepEqual(L.affectedGameIds(live, ended).sort(), [GRANNY.gameId, SH2.gameId].sort());       // enters ended
assert.deepEqual(L.affectedGameIds(ended, { ...ended, state: "cancelled" }).sort(), [GRANNY.gameId, SH2.gameId].sort());   // leaves ended
assert.deepEqual(L.affectedGameIds(ended, ended), []);                                             // nothing changed
assert.deepEqual(L.affectedGameIds(live, { ...live, title: "New title" }), []);                    // not ended before or after
assert.deepEqual(L.affectedGameIds(null, live), []);
assert.deepEqual(L.affectedGameIds(null, ended).sort(), [GRANNY.gameId, SH2.gameId].sort());       // created already ended (test helper, imports)
assert.deepEqual(L.affectedGameIds(ended, null).sort(), [GRANNY.gameId, SH2.gameId].sort());       // deleted
{
  // a correction that drops SH2 from the segments still refreshes SH2
  const fixed = { ...ended, segments: ended.segments.filter((s) => s.gameId !== SH2.gameId), gameIds: [GRANNY.gameId] };
  assert.deepEqual(L.affectedGameIds(ended, fixed).sort(), [GRANNY.gameId, SH2.gameId].sort());
}

// what a game shows: recomputed stats plus the admin-entered history
assert.deepEqual(L.displayStats({ streamCount: 2, minutes: 180, lastStreamedAt: at(5) }, { streamCount: 10, minutes: 3000, lastStreamedAt: at(2) }), { streamCount: 12, minutes: 3180, lastStreamedAt: at(5) });
assert.deepEqual(L.displayStats(null, { streamCount: 3, minutes: 60, lastStreamedAt: at(9) }), { streamCount: 3, minutes: 60, lastStreamedAt: at(9) });
assert.deepEqual(L.displayStats({}, null), { streamCount: 0, minutes: 0, lastStreamedAt: null });

// a streamed wishlist game moves to Playing; nothing else moves by itself
assert.equal(L.wishlistToPlaying("wishlist", 1), true);
assert.equal(L.wishlistToPlaying("wishlist", 0), false);
assert.equal(L.wishlistToPlaying("finished", 3), false);
assert.equal(L.wishlistToPlaying("abandoned", 3), false);
assert.equal(L.wishlistToPlaying("playing", 3), false);

console.log("check-streams: ok");
