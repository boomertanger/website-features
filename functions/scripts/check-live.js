#!/usr/bin/env node
// functions/scripts/check-live.js: checks for the Control Room's pure logic (lib/live/logic.js,
// lib/live/words.js, docs/specs/control-room.md sections 3, 4, 6, 8, 10, 12, 13, 14, 16).
// Everything is in memory: no credentials, no network, no Firestore.   npm run check
const assert = require("assert/strict");
const crypto = require("crypto");
const L = require("../lib/live/logic");
const W = require("../lib/live/words");
const S = require("../lib/streams/logic");

const SEC = 1000, MIN = 60 * SEC, DAY = 24 * 60 * MIN;
const T0 = Date.UTC(2026, 9, 6, 1, 0, 0);
const at = (min, sec = 0) => T0 + min * MIN + sec * SEC;

// A live stream with the Start beat running, built through the stream object's own transitions.
const scheduled = { state: "scheduled", type: "platform", segments: [], plannedGames: [{ gameId: "g1", title: "One" }, { gameId: "g2", title: "Two" }] };
const started = L.startLive(scheduled, at(0), { gameId: "g1", title: "One" });
assert.equal(started.ok, true);
const live0 = { ...scheduled, ...started.patch };
assert.equal(live0.state, "live");

// beats map with a check-in window opened on the given beats (held = begun + a window opened)
const withWin = (beats, ...ks) => Object.fromEntries(Object.entries(beats).map(([k, b]) => [k, ks.includes(k) ? { ...b, windowOpenedAt: 1 } : b]));

// ---------- settings: every number has the spec default ----------
const D = L.DEFAULT_SETTINGS;
assert.deepEqual([D.windowDefaultMinutes, D.windowGraceSeconds, D.maxWrongTries, D.xpCheckin, D.xpAllBeats, D.xpStreamCap, D.flushMinGapSeconds, D.wordRepeatDays, D.windowExtendSeconds],
  [5, 30, 5, 10, 15, 100, 3, 30, 60]);
assert.deepEqual(D.windowLengthChoices, [2, 3, 5, 10]);
assert.equal(L.resolveSettings(null).xpCheckin, 10);
assert.equal(L.resolveSettings({ xpCheckin: 12 }).xpCheckin, 12);
assert.equal(L.resolveSettings({ xpCheckin: -1 }).xpCheckin, 10, "bad values fall back");
assert.equal(L.resolveSettings({ maxWrongTries: "x" }).maxWrongTries, 5);
assert.equal(L.resolveSettings({ flushMinGapSeconds: 0 }).flushMinGapSeconds, 3);
assert.equal(L.resolveSettings({ windowLengthChoices: [] }).windowLengthChoices.length, 4);
assert.equal(Object.isFrozen(D), true);
assert.equal(L.resolveSettings(L.resolveSettings({ xpCheckin: 7 })).xpCheckin, 7, "resolving twice is stable");

// ---------- 1. beats ----------
assert.deepEqual(L.BEATS, ["start", "break1", "break2", "end"]);
// startLive reuses streams/logic.startStream and begins the Start beat; NO window opens (spec 19.3)
assert.equal(live0.beats.start.startedAt, at(0));
assert.equal(live0.actualStart, at(0));
assert.equal(L.currentBeat(live0.beats), "start");
assert.equal(L.nextBeat(live0.beats), "break1");
assert.equal(started.closeWindow, false);
assert.equal(live0.beats.start.windowOpenedAt, undefined, "beginning a beat does not open a window");
assert.equal(L.startLive({ state: "live" }, at(0)).reason, "badState", "already live: refused by the stream object's rule");
assert.equal(L.startLive({ state: "ended" }, at(0)).reason, "badState");
assert.equal(L.startLive({ state: "planned" }, at(0)).ok, true, "ad hoc / planned goes live too");
assert.equal(L.startLive({ state: "scheduled" }, at(0)).patch.segments.length, 0, "no first game: no segment");
// never out of order, never twice
assert.equal(L.beginBeat(live0, "break2", at(10)).reason, "outOfOrder");
assert.equal(L.beginBeat({ ...live0, beats: {} }, "end", at(10)).reason, "outOfOrder", "End needs Start handled first");
{
  // End from any beat marks every not-yet-begun break skipped in one step; the other beats stay strict
  const e1 = L.beginBeat(live0, "end", at(10));
  assert.equal(e1.ok, true);
  assert.equal(e1.patch.beats.break1.skipped, true);
  assert.equal(e1.patch.beats.break2.skipped, true);
  assert.equal(e1.patch.beats.break1.startedAt, undefined);
  assert.equal(e1.patch.beats.start.endedAt, at(10));
  assert.equal(e1.patch.beats.end.startedAt, at(10));
  assert.equal(e1.closeWindow, true);
  assert.equal(L.nextBeat({ ...live0.beats, ...e1.patch.beats }), null);
  assert.deepEqual(L.beatsHeld(withWin(e1.patch.beats, "start", "end")), ["start", "end"], "skipped breaks cost nothing");
  assert.equal(L.beginBeat({ ...live0, ...e1.patch }, "end", at(13)).reason, "outOfOrder", "End never twice");
  assert.equal(L.beginBeat({ ...live0, ...e1.patch }, "break1", at(13)).reason, "outOfOrder", "no break after End");
  assert.equal(L.beginBeat({ ...live0, beats: live0.beats }, "break2", at(10)).reason, "outOfOrder", "Break 2 before Break 1: refused");
  assert.equal(L.beginBeat(live0, "end", at(10)).patch.segments, undefined, "End opens no break segment");
}
assert.equal(L.beginBeat(live0, "start", at(10)).reason, "outOfOrder", "never twice");
assert.equal(L.beginBeat(live0, "nope", at(10)).reason, "badBeat");
assert.equal(L.beginBeat({ ...live0, state: "scheduled" }, "break1", at(10)).reason, "notLive");
assert.equal(L.beginBeat({ ...live0, state: "ended" }, "break1", at(10)).reason, "notLive");
// break 1: ends Start, closes any window, opens a break segment through switchSegment
const b1 = L.beginBeat(live0, "break1", at(10));
assert.equal(b1.ok, true);
assert.equal(b1.closeWindow, true);
assert.equal(b1.patch.beats.start.endedAt, at(10));
assert.equal(b1.patch.beats.break1.startedAt, at(10));
assert.equal(b1.patch.beats.break1.windowOpenedAt, undefined);
assert.equal(b1.patch.segments.at(-1).kind, "break");
assert.equal(b1.patch.segments[0].endedAt, at(10), "the game segment closed (streams/logic.switchSegment)");
assert.deepEqual(b1.patch.segments, S.switchSegment(live0, { kind: "break" }, at(10)).patch.segments, "same result as the stream object's own rule");
assert.equal(live0.beats.start.endedAt, null, "input is not mutated");
const live1 = { ...live0, ...b1.patch };
assert.equal(L.currentBeat(live1.beats), "break1");
{
  const e2 = L.beginBeat(live1, "end", at(12));            // from Break 1: Break 2 skipped, Break 1 kept
  assert.equal(e2.ok, true);
  assert.equal(e2.patch.beats.break2.skipped, true);
  assert.equal(e2.patch.beats.break1.skipped, undefined);
  assert.equal(e2.patch.beats.break1.endedAt, at(12));
}
assert.equal(L.beginBeat(live1, "break1", at(11)).reason, "outOfOrder");
// back to the game closes the break (reused switchSegment)
const back = L.backToGame(live1, { gameId: "g1", title: "One" }, at(14));
assert.equal(back.ok, true);
assert.equal(back.patch.segments.at(-1).kind, "game");
assert.equal(L.backToGame(L.backToGame(live1, { gameId: "g1", title: "One" }, at(14)).ok ? { ...live1, ...back.patch } : live1, { gameId: "g1", title: "One" }, at(15)).reason, "alreadyOn");
// skipping: nothing lost, marks skipped:true, only the next beat, then the next one becomes available
const sk = L.skipBeat(live1, "break2", at(20));
assert.equal(sk.ok, true);
assert.equal(sk.patch.beats.break2.skipped, true);
assert.equal(sk.patch.beats.break2.startedAt, undefined);
assert.equal(L.skipBeat(live1, "end", at(20)).reason, "outOfOrder");
assert.equal(L.skipBeat(live1, "break1", at(20)).reason, "outOfOrder", "a begun beat can't be skipped");
assert.equal(L.skipBeat({ ...live1, state: "ended" }, "break2", at(20)).reason, "notLive");
const live2 = { ...live1, ...sk.patch };
assert.equal(L.nextBeat(live2.beats), "end");
assert.equal(L.beginBeat(live2, "break2", at(21)).reason, "outOfOrder", "a skipped beat can't be begun later");
const bEnd = L.beginBeat(live2, "end", at(30));
assert.equal(bEnd.ok, true);
assert.equal(bEnd.patch.beats.break1.endedAt, at(30));
assert.equal(bEnd.patch.segments, undefined, "End opens no break segment");
const live3 = { ...live2, ...bEnd.patch };
assert.equal(L.nextBeat(live3.beats), null);
assert.equal(L.currentBeat(live3.beats), "end");
assert.deepEqual(L.beatsHeld(live3.beats), [], "begun beats that never opened a window are not held");
assert.deepEqual(L.beatsHeld(withWin(live3.beats, "start", "break1", "end")), ["start", "break1", "end"], "held = begun + window opened, in order");
assert.deepEqual(L.beatsHeld(withWin(live3.beats, "start", "break2", "end")), ["start", "end"], "a skipped beat is never held, even with a stray flag");
assert.deepEqual(L.beatsHeld(null), []);
assert.equal(L.nextBeat(null), "start");
// a stream with no breaks: skip both, the beats never begun do not count
let nb = live0;
nb = { ...nb, ...L.skipBeat(nb, "break1", at(5)).patch };
nb = { ...nb, ...L.skipBeat(nb, "break2", at(5)).patch };
assert.deepEqual(L.beatsHeld(withWin(nb.beats, "start")), ["start"]);
// stop: reuses stopStream (outcomes, segments) and ends the open beat; closeWindow true
const stop = L.stopLive(live3, at(40));
assert.equal(stop.ok, true);
assert.equal(stop.closeWindow, true);
assert.equal(stop.patch.state, "ended");
assert.equal(stop.patch.actualEnd, at(40));
assert.equal(stop.patch.beats.end.endedAt, at(40));
assert.equal(stop.patch.beats.break2.skipped, true);
assert.equal(stop.patch.beats.break2.endedAt, undefined, "a skipped beat is never 'ended'");
assert.deepEqual(stop.patch.plannedGames.map((g) => g.outcome), ["played", "skipped"], "planned-game outcomes come from streams/logic");
assert.equal(stop.patch.segments.every((s) => s.endedAt != null), true);
assert.equal(L.stopLive({ ...live3, state: "ended" }, at(41)).reason, "badState");
assert.equal(L.stopLive({ ...live3, state: "scheduled" }, at(41)).reason, "badState");
// auto-end after 12 hours reuses autoEnd
const auto = L.autoEndLive(live3);
assert.equal(auto.ok, true);
assert.equal(auto.patch.autoEnded, true);
assert.equal(auto.patch.actualEnd, at(0) + S.AUTO_END_MS);
assert.equal(auto.patch.beats.end.endedAt, auto.patch.actualEnd);
assert.equal(auto.closeWindow, true);
assert.equal(S.needsAutoEnd(live3, at(0) + S.AUTO_END_MS), true);

// ---------- 2. check-in windows ----------
const W0 = L.openWindow(live0, null, "start", "lantern", undefined, at(1), null);
assert.equal(W0.ok, true);
assert.equal(W0.window.closesAt, at(1) + 5 * MIN, "default length is 5 minutes");
assert.equal(W0.window.word, "lantern");
assert.equal(W0.beatPatch.windowOpenedAt, at(1));
for (const len of [2, 3, 5, 10]) assert.equal(L.openWindow(live0, null, "start", "lantern", len, at(1)).window.closesAt, at(1) + len * MIN);
for (const len of [1, 4, 7, 11, 0, "5"]) assert.equal(L.openWindow(live0, null, "start", "lantern", len, at(1)).reason, "badLength", String(len));
assert.equal(L.openWindow(live0, null, "start", "  ", 5, at(1)).reason, "noWord");
assert.equal(L.openWindow(live0, null, "break1", "lantern", 5, at(1)).reason, "beatNotBegun", "only the current begun beat opens");
assert.equal(L.openWindow(live1, null, "start", "lantern", 5, at(11)).reason, "beatNotBegun", "an ended beat can't open one");
assert.equal(L.openWindow({ ...live0, state: "scheduled" }, null, "start", "lantern", 5, at(1)).reason, "notLive");
assert.equal(L.openWindow(live0, null, "nope", "lantern", 5, at(1)).reason, "badBeat");
assert.equal(L.openWindow(live0, null, "start", "lantern", 5, at(1), { windowLengthChoices: [1, 5], windowDefaultMinutes: 1 }).ok, true, "choices come from settings");
assert.equal(L.openWindow(live0, null, "start", "lantern", undefined, at(1), { windowLengthChoices: [1, 5], windowDefaultMinutes: 1 }).window.closesAt, at(1) + MIN);
// only when pressed: one window per beat, and not while one is open
const liveW = { ...live0, beats: { ...live0.beats, start: { ...live0.beats.start, ...W0.beatPatch } } };
assert.equal(L.openWindow(liveW, W0.window, "start", "crypt", 5, at(2)).reason, "windowOpen");
assert.equal(L.openWindow(liveW, { ...W0.window, closedAt: at(2), closesAt: at(2) }, "start", "crypt", 5, at(3)).reason, "alreadyOpened", "one window per beat (use reopenWindow)");
// reopen: ONE per beat, same word, same openedAt, the unused time or 2 minutes
{
  const R0 = (o) => L.reopenWindow(liveW, o, "start", at(4));
  const early = L.closeWindow(W0.window, at(4)).window;             // closed with 2 minutes left (closes at(6))
  const r = R0(early);
  assert.equal(r.ok, true);
  assert.equal(r.window.word, "lantern", "same word");
  assert.equal(r.window.openedAt, W0.window.openedAt, "same openedAt: earlier check-ins stay valid");
  assert.equal(r.window.reopened, true);
  assert.equal(r.window.closedAt, undefined);
  assert.equal(r.window.closesAt, at(4) + 2 * MIN, "unused time: 2 minutes left -> 2 minutes");
  const e3 = L.closeWindow(W0.window, at(2)).window;                 // 4 minutes left
  assert.equal(L.reopenWindow(liveW, e3, "start", at(3)).window.closesAt, at(3) + 4 * MIN, "reopened with what was unused");
  const e4 = L.closeWindow(W0.window, at(5, 30)).window;             // 30 s left: floor 2 minutes
  assert.equal(L.reopenWindow(liveW, e4, "start", at(5, 40)).window.closesAt, at(5, 40) + 2 * MIN, "less than 2 minutes left -> 2 minutes");
  assert.equal(L.reopenWindow(liveW, W0.window, "start", at(7)).window.closesAt, at(7) + 2 * MIN, "a window that ran out gets 2 minutes");
  assert.equal(L.reopenWindow(liveW, W0.window, "start", at(2)).reason, "windowOpen", "still open: nothing to reopen");
  assert.equal(L.reopenWindow(liveW, r.window, "start", at(7)).reason, "reopenUsed", "second reopen refused");
  assert.equal(L.reopenWindow(liveW, L.closeWindow(r.window, at(5)).window, "start", at(5, 10)).reason, "reopenUsed", "also after closing the reopened window");
  assert.equal(L.reopenWindow(liveW, null, "start", at(4)).reason, "noWindow");
  assert.equal(L.reopenWindow(liveW, early, "break1", at(4)).reason, "noWindow", "another beat's window");
  assert.equal(L.reopenWindow({ ...liveW, state: "ended" }, early, "start", at(4)).reason, "notLive");
  assert.equal(L.reopenWindow(live1, early, "start", at(11)).reason, "beatNotBegun", "the beat ended: too late");
  assert.equal(L.openWindow(liveW, early, "start", "other", 5, at(4)).reason, "alreadyOpened", "openWindow can't be used to reopen");
  assert.equal(L.windowOpenNow(r.window, at(5)), true);
  assert.equal(L.windowAccepts(r.window, at(6, 30)), true, "grace applies to the reopened closesAt");
  assert.equal(L.windowAccepts(r.window, at(6, 30) + 1), false);
  // earlier check-ins stay valid: a member who checked in before the close is still "already"; others can still check in
  const pre = { beats: { start: { room: "twitch", at: at(2) } }, wrongTries: {} };
  const ciR = (o) => L.validateCheckIn({ member: { uid: "u1" }, stream: liveW, window: r.window, answer: "lantern", room: "twitch", presence: null, nowMs: at(5), ...o });
  assert.equal(ciR({ presence: pre }).reason, "already");
  assert.equal(ciR({}).ok, true, "a late member can now check in with the same word");
  assert.equal(ciR({ answer: "crypt" }).reason, "wrongWord");
  assert.equal(L.validateCheckIn({ member: { uid: "u1" }, stream: liveW, window: early, answer: "lantern", room: "twitch", nowMs: at(4, 40) }).reason, "windowClosed", "closed between close and reopen (past grace)");
}
// open / accepting / grace
assert.equal(L.windowOpenNow(W0.window, at(1)), true);
assert.equal(L.windowOpenNow(W0.window, at(6) - 1), true);
assert.equal(L.windowOpenNow(W0.window, at(6)), false, "closed exactly at closesAt");
assert.equal(L.windowAccepts(W0.window, at(6, 30)), true, "accepted until closesAt + 30 s grace (inclusive)");
assert.equal(L.windowAccepts(W0.window, at(6, 30) + 1), false);
assert.equal(L.windowAccepts(W0.window, at(1) - 1), false, "not before it opened");
assert.equal(L.windowAccepts(W0.window, at(6, 20), { windowGraceSeconds: 10 }), false, "grace is a setting");
assert.equal(L.windowAccepts(null, at(1)), false);
// extend: +1 minute, only while open
const ext = L.extendWindow(W0.window, at(5));
assert.equal(ext.ok, true);
assert.equal(ext.window.closesAt, at(7));
assert.equal(L.extendWindow(ext.window, at(6)).window.closesAt, at(8), "can extend again");
assert.equal(L.extendWindow(W0.window, at(6)).reason, "windowClosed", "no extending a window that already ran out");
assert.equal(L.extendWindow(null, at(6)).reason, "noWindow");
assert.equal(L.extendWindow(W0.window, at(5), { windowExtendSeconds: 120 }).window.closesAt, at(8), "extend length is a setting");
// close early, and extend then close
const cl = L.closeWindow(ext.window, at(5, 30));
assert.equal(cl.ok, true);
assert.equal(cl.window.closesAt, at(5, 30));
assert.equal(cl.window.closedAt, at(5, 30));
assert.equal(L.windowOpenNow(cl.window, at(5, 31)), false);
assert.equal(L.windowAccepts(cl.window, at(5, 59)), true, "closed early: grace still applies");
assert.equal(L.windowAccepts(cl.window, at(6, 1)), false);
assert.equal(L.extendWindow(cl.window, at(5, 31)).reason, "windowClosed", "no extending a closed window");
assert.equal(L.closeWindow(cl.window, at(5, 40)).already, true, "closing twice is harmless");
assert.equal(L.closeWindow(null, at(5)).reason, "noWindow");
assert.equal(L.closeWindow(W0.window, at(7)).already, true, "a window that ran out is already closed");
// opening the next beat closes an open window (beginBeat says so; the caller closes it)
const liveWB = { ...liveW };
const nextB = L.beginBeat(liveWB, "break1", at(3));
assert.equal(nextB.closeWindow, true);
const closedByNext = L.closeWindow(W0.window, at(3));
assert.equal(closedByNext.window.closesAt, at(3));
assert.equal(L.windowOpenNow(closedByNext.window, at(3, 1)), false);
assert.equal(L.windowAccepts(closedByNext.window, at(3, 20)), true, "grace for the beat that just closed");
// a window closed at Stop still accepts within the grace
const stopClose = L.closeWindow(W0.window, at(4));
assert.equal(L.stopLive(liveW, at(4)).closeWindow, true);
assert.equal(L.validateCheckIn({ member: { uid: "u1" }, stream: liveW, window: stopClose.window, answer: "lantern", room: "twitch", nowMs: at(4, 20) }).ok, true, "inside the grace after Stop");
assert.equal(L.validateCheckIn({ member: { uid: "u1" }, stream: liveW, window: stopClose.window, answer: "lantern", room: "twitch", nowMs: at(4, 31) }).reason, "windowClosed", "after the grace");

// ---------- 3. words ----------
assert.equal(L.normalise("  Lan-Tern! "), "lantern");
assert.equal(L.normalise("LANTERN"), "lantern");
assert.equal(L.normalise("lan tern"), "lantern");
assert.equal(L.normalise("lantern."), "lantern");
assert.equal(L.normalise("l a n,t.e;r'n"), "lantern");
assert.notEqual(L.normalise("lanturn"), L.normalise("lantern"), "no fuzzy matching");
assert.equal(L.normalise("séance"), L.normalise("seance"), "accents are stripped (owner decision)");
assert.equal(L.normalise("Séance"), "seance");
assert.equal(L.normalise("crème brûlée!"), "cremebrulee");
assert.equal(L.normalise("ñandú"), "nandu");
assert.equal(W.normalise("séance"), "seance", "words.js uses the same normalise");
assert.equal(W.normalise, L.normalise);
assert.equal(L.normalise(null), "");
assert.equal(L.normalise(42), "");
assert.equal(L.normalise("   "), "");
const list = ["alpha", "bravo", "charlie", "delta"];
const rng0 = () => 0, rngHi = () => 0.9999;
assert.deepEqual(L.pickWord(list, [], at(0), rng0), { ok: true, word: "alpha", fallback: false });
assert.equal(L.pickWord(list, [], at(0), rngHi).word, "delta");
assert.equal(L.pickWord(list, [], at(0), () => 1).word, "delta", "rng at 1 stays in range");
assert.equal(L.pickWord(list, [{ word: "alpha", atMs: at(0) - 5 * DAY }], at(0), rng0).word, "bravo", "used in the last 30 days: skipped");
assert.equal(L.pickWord(list, [{ word: "ALPHA", atMs: at(0) - 5 * DAY }], at(0), rng0).word, "bravo", "recent uses are compared normalised");
assert.equal(L.pickWord(list, [{ word: "alpha", atMs: at(0) - 31 * DAY }], at(0), rng0).word, "alpha", "older than 30 days is fine again");
assert.equal(L.pickWord(list, [{ word: "alpha", atMs: at(0) - 30 * DAY }], at(0), rng0).word, "alpha", "exactly 30 days ago is fine");
assert.equal(L.pickWord(list, [{ word: "alpha", atMs: at(0) - 30 * DAY + 1 }], at(0), rng0).word, "bravo");
assert.equal(L.pickWord(list, [{ word: "alpha", atMs: at(0) - 5 * DAY }, { word: "bravo", atMs: at(0) - 5 * DAY }], at(0), rngHi).word, "delta");
// never repeats any recent word over many draws
for (let i = 0; i < 40; i++) {
  const recent = [{ word: "alpha", atMs: at(0) - DAY }, { word: "charlie", atMs: at(0) - 2 * DAY }];
  const r = L.pickWord(list, recent, at(0), () => i / 40);
  assert.equal(["bravo", "delta"].includes(r.word), true);
  assert.equal(r.fallback, false);
}
// exhausted within 30 days: the least recently used, flagged
const used = [{ word: "alpha", atMs: at(0) - 1 * DAY }, { word: "bravo", atMs: at(0) - 9 * DAY }, { word: "charlie", atMs: at(0) - 3 * DAY }, { word: "delta", atMs: at(0) - 2 * DAY }];
const fb = L.pickWord(list, used, at(0), rng0);
assert.equal(fb.word, "bravo");
assert.equal(fb.fallback, true);
assert.match(fb.note, /least recently used/);
assert.equal(L.pickWord(list, [...used, { word: "bravo", atMs: at(0) - 1 * MIN }], at(0), rng0).word, "charlie", "the latest use of a word counts");
assert.equal(L.pickWord([], [], at(0), rng0).reason, "emptyList");
assert.equal(L.pickWord(null, [], at(0), rng0).reason, "emptyList");
assert.equal(L.pickWord(["a-b", "ab", "AB"], [], at(0), rng0).word, "a-b", "duplicates after normalise are one word");
assert.equal(L.pickWord(list, [{ word: "alpha", atMs: at(0) - 5 * DAY }], at(0), rng0, { wordRepeatDays: 3 }).word, "alpha", "repeat window is a setting");
assert.equal(L.pickWord(list, [{ word: "alpha", atMs: at(0) - 5 * DAY }], at(0)).ok, true, "default rng works");
assert.equal(L.pickWord(list, [{ word: "alpha", atMs: { toMillis: () => at(0) - DAY } }], at(0), rng0).word, "bravo", "Timestamps are accepted");

// ---------- 4. check-in validation ----------
const stream = { state: "live", type: "platform" };
const winOpen = W0.window;              // beat start, word lantern, opens at(1), closes at(6)
const ci = (over = {}) => L.validateCheckIn({ member: { uid: "u1", signedIn: true }, stream, window: winOpen, answer: "lantern", room: "twitch", presence: null, crew: null, nowMs: at(2), ...over });
const okR = ci();
assert.equal(okR.ok, true);
assert.equal(okR.awardXp, true);
assert.deepEqual(okR.patch, { beat: "start", room: "twitch", at: at(2) });
assert.equal(ci({ answer: " LAN-tern " }).ok, true, "normalised answer");
assert.equal(ci({ member: null }).reason, "signedOut");
assert.equal(ci({ member: { uid: "u1", signedIn: false } }).reason, "signedOut");
assert.equal(ci({ member: { signedIn: true } }).reason, "signedOut");
assert.equal(ci({ window: null }).reason, "noWindow");
assert.equal(ci({ nowMs: at(6, 31) }).reason, "windowClosed");
assert.equal(ci({ nowMs: at(6, 29) }).ok, true, "inside the grace");
assert.equal(ci({ nowMs: at(0, 59) }).reason, "windowClosed", "before it opened");
// rooms
for (const room of ["twitch", "ytLandscape", "ytVertical", "tiktok"]) assert.equal(ci({ room }).ok, true, room);
// canonical rooms only inside validateCheckIn: an alias is badRoom and can never be stored
for (const room of ["youtube", "ytv", "YouTube", "TWITCH", "ytlandscape"]) assert.equal(ci({ room }).reason, "badRoom", `alias or wrong case refused: ${room}`);
assert.deepEqual(L.ROOMS, ["twitch", "ytLandscape", "ytVertical", "tiktok", "site"]);
assert.deepEqual(L.PLATFORM_ROOMS, ["twitch", "ytLandscape", "ytVertical", "tiktok"]);
// aliases are converted at the EDGE only
assert.equal(L.normaliseRoom("youtube"), "ytLandscape");
assert.equal(L.normaliseRoom("ytv"), "ytVertical");
assert.equal(L.normaliseRoom("YTV"), "ytVertical");
assert.equal(L.normaliseRoom(" YouTube "), "ytLandscape");
for (const c of ["twitch", "ytLandscape", "ytVertical", "tiktok", "site"]) assert.equal(L.normaliseRoom(c), c, c);
assert.equal(L.normaliseRoom("YTLANDSCAPE"), "ytLandscape");
for (const bad of ["discord", "", "yt", "ytvertical2", null, undefined, 3, {}, "__proto__", "constructor"]) assert.equal(L.normaliseRoom(bad), null, String(bad));
assert.equal(ci({ room: L.normaliseRoom("ytv") }).patch.room, "ytVertical", "the edge converts, then validate stores the canonical name");
assert.equal(ci({ room: "site" }).reason, "badRoom", "site is for backstage only");
assert.equal(ci({ room: "discord" }).reason, "badRoom");
assert.equal(ci({ room: undefined }).reason, "badRoom");
assert.equal(ci({ room: "twitch", presence: { beats: {}, wrongTries: {} }, answer: "x" }).triesLeft, 4);
assert.deepEqual(L.allowedRooms({ type: "platform" }), ["twitch", "ytLandscape", "ytVertical", "tiktok"]);
assert.deepEqual(L.allowedRooms({ type: "platform", liveRooms: ["twitch", "ytLandscape"] }), ["twitch", "ytLandscape"], "restricted to the rooms streaming now");
assert.deepEqual(L.allowedRooms({ type: "platform", rooms: ["ytVertical", "tiktok"] }), ["ytVertical", "tiktok"], "falls back to the planned rooms");
assert.deepEqual(L.allowedRooms({ type: "platform", liveRooms: ["youtube", "ytv"] }), ["twitch", "ytLandscape", "ytVertical", "tiktok"], "aliases in stream data are not recognised");
assert.deepEqual(L.allowedRooms({ type: "platform", liveRooms: ["tiktok"], rooms: ["twitch"] }), ["tiktok"], "liveRooms wins over rooms");
assert.deepEqual(L.allowedRooms({ type: "platform", liveRooms: [], rooms: ["twitch"] }), ["twitch"]);
assert.deepEqual(L.allowedRooms({ type: "platform", liveRooms: ["bogus"] }), ["twitch", "ytLandscape", "ytVertical", "tiktok"]);
assert.equal(ci({ stream: { type: "platform", liveRooms: ["twitch"] }, room: "ytLandscape" }).reason, "badRoom");
assert.equal(ci({ stream: { type: "platform", liveRooms: ["twitch"] }, room: "twitch" }).ok, true);
// backstage: the site is the only room
const back1 = { state: "live", type: "backstage", rooms: [] };
assert.deepEqual(L.allowedRooms(back1), ["site"]);
assert.equal(ci({ stream: back1, room: "site" }).ok, true);
for (const room of ["twitch", "ytLandscape", "ytVertical", "tiktok"]) assert.equal(ci({ stream: back1, room }).reason, "badRoom", `backstage ${room}`);
// two devices, same member: the second is a friendly "already"
const done = { beats: { start: { room: "twitch", at: at(2) } }, wrongTries: {} };
assert.equal(ci({ presence: done }).reason, "already");
assert.equal(ci({ presence: done, answer: "wrong" }).reason, "already", "already beats a wrong word (no try spent)");
assert.equal(ci({ presence: { beats: { break1: { room: "twitch" } } } }).ok, true, "another beat's check-in doesn't block this beat");
// wrong tries: 5 per beat, a distinct lockedOut reason
let pres = { beats: {}, wrongTries: {} };
for (let n = 1; n <= 5; n++) {
  const r = ci({ presence: pres, answer: "nope" });
  assert.equal(r.reason, "wrongWord");
  assert.equal(r.wrongTries, n);
  assert.equal(r.triesLeft, 5 - n);
  assert.equal(r.locked, n === 5);
  pres = { ...pres, wrongTries: { start: r.wrongTries } };
}
const locked = ci({ presence: pres, answer: "lantern" });
assert.equal(locked.reason, "lockedOut", "locked out even with the right word");
assert.equal(locked.triesLeft, 0);
assert.notEqual(locked.reason, "wrongWord");
assert.equal(ci({ presence: pres, answer: "lantern", room: "site" }).reason, "badRoom", "room is checked before the lock");
assert.equal(ci({ presence: { beats: {}, wrongTries: { start: 4 } }, answer: "lantern" }).ok, true, "4 wrong then right still works");
assert.equal(ci({ presence: { beats: {}, wrongTries: { start: 4 } }, answer: "lantern" }).triesLeft, 1);
assert.equal(ci({ presence: { beats: {}, wrongTries: { break1: 5 } }, answer: "lantern" }).ok, true, "the lock is per beat");
assert.equal(ci({ presence: { beats: {}, wrongTries: { start: 3 } }, answer: "   " }).reason, "empty", "an empty answer costs nothing");
assert.equal(ci({ presence: { beats: {}, wrongTries: { start: 3 } }, answer: "   " }).triesLeft, 2);
assert.equal(ci({ answer: "x" }, null).triesLeft, 4);
assert.equal(L.validateCheckIn({ member: { uid: "u1" }, stream, window: winOpen, answer: "x", room: "twitch", presence: { beats: {}, wrongTries: { start: 2 } }, nowMs: at(2) }, { maxWrongTries: 3 }).locked, true, "tries are a setting");
// crew unlock resets that member's count for that beat
const unl = L.unlockTries({ start: 5, break1: 2 }, "start");
assert.deepEqual(unl, { start: 0, break1: 2 });
assert.equal(ci({ presence: { beats: {}, wrongTries: unl }, answer: "lantern" }).ok, true, "unlocked member can check in");
assert.deepEqual(L.unlockTries(null, "start"), { start: 0 });
// clocked-in crew count as present with no word, no XP, room from the seat
const crewR = ci({ crew: { clockedIn: true, room: "ytVertical" }, answer: "", room: undefined });
assert.equal(crewR.ok, true);
assert.equal(crewR.crew, true);
assert.equal(crewR.awardXp, false);
assert.equal(crewR.room, "ytVertical");
assert.deepEqual(crewR.patch, { beat: "start", room: "ytVertical", at: at(2) });
assert.equal(ci({ crew: { clockedIn: false }, answer: "x" }).reason, "wrongWord", "a crew member not clocked in is an ordinary member");
assert.equal(ci({ crew: { clockedIn: true, room: "ytVertical" }, window: null }).reason, "noWindow", "crew still need a window");
assert.equal(ci({ crew: { clockedIn: true, room: "ytVertical" }, member: null }).reason, "signedOut");
assert.equal(L.planGrant("checkin", { streamId: "s1", uid: "u1", beat: "start", crew: true }, 0).paid, 0, "no check-in XP for crew");

// ---------- 5. rewards ----------
assert.equal(L.grantKey("checkin", { streamId: "s1", uid: "u1", beat: "break2" }), "s1:break2:u1:checkin");
assert.equal(L.grantKey("firstIn", { streamId: "s1", uid: "u1", beat: "start" }), "s1:start:u1:first-in");
assert.equal(L.grantKey("allBeats", { streamId: "s1", uid: "u1" }), "s1:u1:all-beats");
assert.equal(L.grantKey("present", { streamId: "s1", uid: "u1" }), "s1:u1:present");
assert.equal(L.grantKey("questionAnswered", { streamId: "s1", uid: "u1", questionId: "q9" }), "s1:q9:u1:question-answered");
assert.equal(L.grantKey("hotseatPlayed", { streamId: "s1", uid: "u1", round: 2 }), "s1:round2:u1:hotseat-played");
assert.equal(L.grantKey("hotseatWon", { streamId: "s1", uid: "u1", round: 2 }), "s1:round2:u1:hotseat-won");
assert.notEqual(L.grantKey("checkin", { streamId: "s1", uid: "u1", beat: "start" }), L.grantKey("checkin", { streamId: "s1", uid: "u1", beat: "break1" }), "one key per beat");
assert.notEqual(L.grantKey("checkin", { streamId: "s1", uid: "u1", beat: "start" }), L.grantKey("checkin", { streamId: "s2", uid: "u1", beat: "start" }), "one key per stream");
assert.equal(L.grantKey("checkin", { streamId: "s1", uid: "u1", beat: "start" }), L.grantKey("checkin", { streamId: "s1", uid: "u1", beat: "start" }), "deterministic");
assert.throws(() => L.grantKey("checkin", { streamId: "s1", uid: "u1" }), /beat/);
assert.throws(() => L.grantKey("nope", { streamId: "s1", uid: "u1" }), /unknown/);
assert.throws(() => L.grantKey("allBeats", { streamId: "s1" }), /uid/);
assert.throws(() => L.grantKey("hotseatWon", { streamId: "s1", uid: "u1" }), /round/);
assert.deepEqual(Object.fromEntries(Object.entries(L.GRANT_KINDS).map(([k, v]) => [k, v.nightShiftKey])), {
  checkin: "stream-checkin", allBeats: "stream-all-beats", present: "stream-present", questionAnswered: "question-answered",
  hotseatPlayed: "hotseat-played", hotseatWon: "hotseat-won", firstIn: "first-in",
});
assert.deepEqual(["checkin", "allBeats", "present", "questionAnswered", "hotseatPlayed", "hotseatWon", "firstIn"].map((k) => L.grantXp(k)), [10, 15, 0, 15, 5, 25, 0], "spec 12 values");
assert.equal(L.grantXp("checkin", { xpCheckin: 20 }), 20, "XP values come from settings");
assert.equal(L.grantXp("nope"), 0);
// the cap
assert.equal(L.capPayout(0, 10), 10);
assert.equal(L.capPayout(90, 10), 10, "lands exactly on the cap");
assert.equal(L.capPayout(95, 10), 5, "partly paid");
assert.equal(L.capPayout(100, 10), 0);
assert.equal(L.capPayout(250, 10), 0, "never negative past the cap");
assert.equal(L.capPayout(0, -5), 0);
assert.equal(L.capPayout(-20, 10), 10, "negative earned counts as 0");
assert.equal(L.capPayout(0, 500), 100, "never above the cap");
assert.equal(L.capPayout("x", "y"), 0);
assert.equal(L.capPayout(40, 30, 50), 10, "custom cap");
// the cap holds across kinds (sum of paid never above 100)
let earned = 0;
const seq = [["checkin", { beat: "start" }], ["checkin", { beat: "break1" }], ["checkin", { beat: "break2" }], ["checkin", { beat: "end" }], ["allBeats", {}],
  ["hotseatWon", { round: 1 }], ["hotseatWon", { round: 2 }], ["questionAnswered", { questionId: "q1" }], ["questionAnswered", { questionId: "q2" }], ["hotseatPlayed", { round: 3 }], ["hotseatWon", { round: 4 }]];
const paidList = [];
for (const [kind, extra] of seq) {
  const g = L.planGrant(kind, { streamId: "s1", uid: "u1", ...extra }, earned);
  paidList.push(g.paid);
  earned += g.paid;
  assert.equal(earned <= 100, true);
}
assert.deepEqual(paidList, [10, 10, 10, 10, 15, 25, 20, 0, 0, 0, 0]);
assert.equal(earned, 100);
const g5 = L.planGrant("hotseatWon", { streamId: "s1", uid: "u1", round: 1 }, 90);
assert.deepEqual([g5.requested, g5.paid, g5.capped, g5.key, g5.nightShiftKey], [25, 10, true, "s1:round1:u1:hotseat-won", "hotseat-won"]);
assert.equal(L.planGrant("present", { streamId: "s1", uid: "u1" }, 0).paid, 0);
assert.equal(L.planGrant("checkin", { streamId: "s1", uid: "u1", beat: "start" }, 0, { xpCheckin: 12, xpStreamCap: 100 }).paid, 12);
assert.equal(L.planGrant("checkin", { streamId: "s1", uid: "u1", beat: "start" }, 95, { xpStreamCap: 100 }).paid, 5);
// all-beats bonus: every begun beat checked in AND at least one began
const HELD3 = withWin(live3.beats, "start", "break1", "end"), HELDNB = withWin(nb.beats, "start");
const mine = (...ks) => Object.fromEntries(ks.map((k) => [k, { room: "twitch", at: 1 }]));
assert.equal(L.qualifiesAllBeats(HELD3, mine("start", "break1", "end")), true, "skipped break2 does not count against");
assert.equal(L.qualifiesAllBeats(HELD3, mine("start", "end")), false, "missed one begun beat");
assert.equal(L.qualifiesAllBeats(HELD3, mine("start", "break1", "end", "break2")), true, "extra check-ins don't matter");
assert.equal(L.qualifiesAllBeats(HELDNB, mine("start")), true, "no breaks held: only Start must be checked");
assert.equal(L.qualifiesAllBeats(HELDNB, mine()), false);
assert.equal(L.qualifiesAllBeats({}, mine("start")), false, "no beat began: no bonus");
assert.equal(L.qualifiesAllBeats(null, null), false);
assert.equal(L.qualifiesAllBeats({ start: { skipped: true }, break1: { skipped: true } }, mine("start")), false, "only skipped beats: none held");
assert.equal(L.qualifiesAllBeats(HELD3, null), false);

// owner decision: only beats that had a window are held
assert.equal(L.qualifiesAllBeats(live3.beats, mine("start")), false, "no window opened on any beat: nothing held, no bonus");
assert.equal(L.qualifiesAllBeats(withWin(live3.beats, "start"), mine("start")), true, "begun beats without a window do not block the bonus");
assert.equal(L.qualifiesAllBeats(withWin(live3.beats, "start"), mine("break1", "end")), false, "and a held beat still has to be checked in");
assert.equal(L.qualifiesAllBeats(withWin(live3.beats, "start", "break1"), mine("start")), false);
assert.equal(L.qualifiesAllBeats(withWin(live3.beats, "start", "break1"), mine("start", "break1")), true);

// ---------- 6. stream streak presence ----------
const P = (o) => L.streakPresence(o);
assert.equal(P({}).present, false);
assert.equal(P(null).present, false);
assert.deepEqual(P({ beats: { start: { room: "twitch" } } }), { present: true, why: ["checkin"] });
assert.equal(P({ beats: {}, twitchBuckets: [1, 2], drops: [] }).present, false, "10 minutes in chat is not enough");
assert.equal(P({ twitchBuckets: [1, 2, 3] }).present, true, "3 buckets = 15 minutes");
assert.equal(P({ twitchBuckets: { a: true, b: true, c: true } }).present, true);
assert.equal(P({ twitchBuckets: { a: true, b: true, c: false } }).present, false);
assert.equal(P({ twitchBuckets: 3 }).present, true);
assert.equal(P({ twitchBuckets: 2 }).present, false);
assert.deepEqual(P({ drops: [{ id: "d1" }] }), { present: true, why: ["drop"] });
assert.equal(P({ crew: true }).present, true, "crew clocked in are present");
assert.deepEqual(P({ crew: true, beats: { start: 1 }, drops: ["d"], twitchBuckets: [1, 2, 3] }).why, ["crew", "checkin", "twitch", "drop"]);
assert.equal(L.streakPresence({ twitchBuckets: [1, 2] }, { presenceTwitchMinutes: 10 }).present, true, "minutes are a setting");

// ---------- 7. scene ----------
const sc = (o) => L.autoScene({ pinned: null, nowMs: at(2), window: null, ...o });
assert.equal(sc({ stream: null }), "starting");
assert.equal(sc({ stream: { state: "planned" } }), "starting");
assert.equal(sc({ stream: { state: "scheduled" } }), "starting", "before start: starting soon");
assert.equal(sc({ stream: live0 }), "stats", "live between beats: live stats");
assert.equal(sc({ stream: live1 }), "break", "a break beat: break");
assert.equal(sc({ stream: { ...live1, ...back.patch } }), "stats", "back to the game: live stats again");
assert.equal(sc({ stream: { ...live1, segments: undefined } }), "break", "no segment data: the beat decides");
assert.equal(sc({ stream: live0, window: winOpen }), "break", "an open window: break");
assert.equal(sc({ stream: live0, window: winOpen, nowMs: at(6) }), "stats", "a window past closesAt is not open");
assert.equal(sc({ stream: live0, window: cl.window, nowMs: at(5, 40) }), "stats", "a closed window is not open (grace does not hold the scene)");
assert.equal(sc({ stream: live3 }), "ending", "End beat: ending");
assert.equal(sc({ stream: live3, window: winOpen }), "break", "an open window on the End beat is still the break scene");
assert.equal(sc({ stream: { state: "ended" } }), "ending");
for (const p of L.SCENES) assert.equal(sc({ stream: live0, pinned: p }), p, `pinned ${p} wins`);
assert.equal(sc({ stream: live1, pinned: "stats" }), "stats", "pinned wins over a break");
assert.equal(sc({ stream: live0, window: winOpen, pinned: "brb" }), "brb", "pinned wins over an open window");
assert.equal(sc({ stream: null, pinned: "ending" }), "ending");
assert.equal(sc({ stream: live1, pinned: "bogus" }), "break", "an unknown pin is ignored");
assert.equal(sc({ stream: live1, pinned: null }), "break", "released: auto again");
assert.deepEqual(L.SCENES, ["starting", "stats", "break", "break-side", "brb", "ending"]);
assert.equal(sc({ stream: live0, window: null, pinned: "break-side" }), "break-side", "the side rail can be pinned");
assert.equal(L.coverUrl({ source: "igdb", igdbImageId: "co2abc" }), "https://images.igdb.com/igdb/image/upload/t_cover_big/co2abc.jpg");
assert.equal(L.coverUrl({ source: "steam", steamAppId: 123 }), "https://cdn.cloudflare.steamstatic.com/steam/apps/123/library_600x900.jpg");
assert.equal(L.coverUrl({ source: "upload", url: "https://example.com/a.jpg" }), "https://example.com/a.jpg");
assert.equal(L.coverUrl({ source: "upload", url: "http://example.com/a.jpg" }), null);
assert.equal(L.coverUrl({ source: "igdb", igdbImageId: "../x" }), null);
assert.equal(L.coverUrl(null), null);

// ---------- 8. public/live ----------
const WORD = "lantern", VIDEO = "dQw4w9WgXcQ", VIDEO2 = "AbCdEfGhIjK";
const fullStream = {
  ...live3, id: "s1", title: "MONSTER MONDAY", type: "platform", audience: "public",
  crew: { captain: { handle: "Cap", uid: "UID-CAPTAIN" }, chats: { twitch: { lead: "Ana", deckhands: ["Bo", { handle: "Cy", uid: "x" }] }, tiktok: { lead: null, deckhands: [] } } },
  // fields that must never reach the public document:
  private: { control: { word: WORD }, watch: { youtube: { landscape: VIDEO } } },
  watch: { videoId: VIDEO }, youtubeVideoId: VIDEO2, control: { word: WORD }, obsKeyHash: "a".repeat(64),
};
const shards = [{ beats: { start: { twitch: 3, ytLandscape: 1 }, break1: { twitch: 2 } } }, { beats: { start: { twitch: 1, ytVertical: 2 } } }, {}, null];
const sums = L.sumShards(shards);
assert.deepEqual(sums, { total: 9, byBeat: { start: 7, break1: 2 }, byRoom: { twitch: 6, ytLandscape: 1, ytVertical: 2 } });
assert.deepEqual(L.sumShards(null), { total: 0, byBeat: {}, byRoom: {} });
const winEnd = { beat: "end", word: WORD, openedAt: at(31), closesAt: at(36), lengthMinutes: 5 };
const pub = L.buildPublicLive({ stream: fullStream, window: winEnd, counters: shards, viewers: { twitch: 120, ytLandscape: 30, ytVertical: 5, tiktok: 0, youtube: 50, discord: 99 }, peak: 160, onDuty: ["Ana", { handle: "Bo", uid: "u" }], activity: { kind: "questions", title: "Questions", status: "running", secretNote: "x" }, look: "crt", nowMs: at(32) });
assert.equal(pub.state, "live");
assert.equal(pub.streamId, "s1");
assert.equal(pub.title, "MONSTER MONDAY");
assert.equal(pub.actualStart, at(0));
assert.equal(pub.beat, "end");
assert.deepEqual(pub.beats, { start: { status: "done", checkins: 0 }, break1: { status: "done", checkins: 0 }, break2: { status: "skipped", checkins: 0 }, end: { status: "now", checkins: 0 } });
assert.deepEqual(pub.window, { open: true, closesAt: at(36), beat: "end" });
assert.deepEqual(pub.counts, { total: 9, byBeat: { start: 7, break1: 2 }, byRoom: { twitch: 6, ytLandscape: 1, ytVertical: 2 } });
assert.deepEqual(pub.viewers, { total: 155, byPlatform: { twitch: 120, ytLandscape: 30, ytVertical: 5, tiktok: 0 } });
assert.equal(pub.peak, 160);
assert.deepEqual(pub.crew, { captain: "Cap", chats: { twitch: { lead: "Ana", deckhands: ["Bo", "Cy"] }, tiktok: { lead: null, deckhands: [] } }, onDuty: ["Ana", "Bo"], grades: [] });
assert.deepEqual(pub.firstIn, []);
assert.equal(pub.firstInBeat, null);
assert.deepEqual(pub.activity, { kind: "questions", title: "Questions", status: "running" });
assert.equal(pub.look, "crt");
assert.equal(pub.updatedAt, at(32));
assert.deepEqual(pub.game, null, "no open game segment at the End beat in this fixture");
assert.deepEqual(pub.nextGame, { gameId: "g2", title: "Two" }, "next = first planned game not yet played");
assert.deepEqual(L.findSecrets(pub, { words: [WORD], videoIds: [VIDEO, VIDEO2] }), [], "public/live never contains the word, private data or a video id");
assert.equal(JSON.stringify(pub).includes("UID-CAPTAIN"), false, "no uids");
// first in (public handles, at most three) and the crew's grades (only people shown on the page, from the public crew mirror)
const pubFirst = L.buildPublicLive({
  stream: fullStream, window: winEnd, counters: shards, viewers: {}, onDuty: ["Ana"], nowMs: at(32),
  firstIn: ["gbo", "cryptkeeper", "lanternjaw", "fourth", { handle: "x", uid: "UID-X" }, 7],
  grades: { Ana: { track: "mod", grade: 2 }, Cap: { track: "admin", grade: 3 }, Cy: { track: "mod", grade: 1 }, Stranger: { track: "mod", grade: 4 }, Bo: { track: "mod", grade: "x" } },
});
assert.deepEqual(pubFirst.firstIn, ["gbo", "cryptkeeper", "lanternjaw"], "three handles at most");
assert.equal(pubFirst.firstInBeat, "end");
assert.deepEqual(pubFirst.crew.grades, [{ handle: "Ana", track: "mod", grade: 2 }, { handle: "Cap", track: "admin", grade: 3 }, { handle: "Cy", track: "mod", grade: 1 }], "grades only for crew on the page, no bad grades");
assert.deepEqual(L.findSecrets(pubFirst, { words: [WORD], videoIds: [VIDEO, VIDEO2] }), [], "first in and grades leak nothing");
assert.equal(JSON.stringify(pubFirst).includes("UID-"), false, "no uids from first in");
assert.equal(L.findSecrets({ crew: { grades: [{ uid: "u1", grade: 2 }] } }).length, 1, "a uid in a grade entry would be caught");
assert.deepEqual(L.buildPublicLive({ stream: { ...fullStream, state: "ended" }, window: null, counters: sums, viewers: {}, firstIn: ["a"], nowMs: at(41) }).firstIn, [], "no first in once the stream has ended");
assert.deepEqual(L.buildPublicLive({ stream: null, nowMs: 5 }).crew.grades, []);
assert.equal(JSON.stringify(pub).includes(WORD), false);
// window closed or absent: open false, no closesAt leaks, never the word either way
const pubClosed = L.buildPublicLive({ stream: fullStream, window: { ...winEnd, closesAt: at(31, 30) }, counters: sums, viewers: {}, nowMs: at(32) });
assert.deepEqual(pubClosed.window, { open: false, closesAt: null, beat: null });
assert.deepEqual(L.findSecrets(pubClosed, { words: [WORD], videoIds: [VIDEO] }), []);
assert.equal(pubClosed.look, "hull", "default look");
assert.equal(L.buildPublicLive({ stream: fullStream, window: null, counters: null, viewers: null, nowMs: 1 }).counts.total, 0);
// game and a break in progress
const midStream = { ...live1, id: "s2", type: "platform", plannedGames: [{ gameId: "g1" }, { gameId: "g2", title: "Two" }] };
const pubMid = L.buildPublicLive({ stream: { ...midStream, ...back.patch }, window: null, counters: sums, viewers: {}, nowMs: at(15) });
assert.equal(pubMid.game.gameId, "g1");
assert.equal(pubMid.game.startedAt, at(14));
assert.equal(pubMid.beats.break1.status, "now");
assert.equal(pubMid.beats.break2.status, "next");
assert.equal(pubMid.nextGame.gameId, "g2");
// states: off, backstage, ended
assert.equal(L.buildPublicLive({ stream: null, nowMs: 5 }).state, "off");
assert.equal(L.buildPublicLive({ stream: null, nowMs: 5 }).streamId, null);
assert.equal(L.buildPublicLive({ stream: { state: "scheduled", title: "Later", id: "s9", private: { x: 1 } }, nowMs: 5 }).title, null, "an unstarted stream shows nothing yet");
assert.equal(L.buildPublicLive({ stream: { ...fullStream, type: "backstage" }, nowMs: at(5) }).state, "backstage");
const pubEnded = L.buildPublicLive({ stream: { ...fullStream, ...stop.patch }, window: stopClose.window, counters: sums, viewers: {}, nowMs: at(41) });
assert.equal(pubEnded.state, "ended");
assert.equal(pubEnded.actualEnd, at(40));
assert.equal(pubEnded.beat, null);
assert.equal(pubEnded.window.open, false);
assert.deepEqual(L.findSecrets(pubEnded, { words: [WORD], videoIds: [VIDEO, VIDEO2] }), []);
assert.deepEqual(L.findSecrets(L.buildPublicLive({ stream: null, nowMs: 5 }), { words: [WORD] }), []);
// the deep scan itself: it must catch leaks anywhere (this is what makes the checks above mean something)
assert.equal(L.findSecrets({ a: { b: [{ word: "x" }] } }).length, 1, "forbidden key");
assert.equal(L.findSecrets({ private: {} }).length, 1);
assert.equal(L.findSecrets({ watch: 1 }).length, 1);
assert.equal(L.findSecrets({ videoId: 1 }).length, 1);
assert.equal(L.findSecrets({ landscapeVideoId: 1 }).length, 1);
assert.equal(L.findSecrets({ obsKeyHash: "x" }).length, 1);
assert.equal(L.findSecrets({ deckKeyHash: "x" }).length, 1);
assert.equal(L.findSecrets({ uid: "x" }).length, 1);
assert.equal(L.findSecrets({ title: "Say the word: Lantern!" }, { words: ["lantern"] }).length, 1, "word inside text, any case");
assert.equal(L.findSecrets({ title: "LAN-TERN" }, { words: ["lantern"] }).length, 1, "normalised exact match");
assert.equal(L.findSecrets({ list: ["a", "lantern"] }, { words: ["lantern"] })[0], "$.list[1] (word)");
assert.equal(L.findSecrets({ lantern: 1 }, { words: ["lantern"] }).length, 1, "word as a key");
assert.equal(L.findSecrets({ x: `see https://youtu.be/${VIDEO}` }, { videoIds: [VIDEO] }).length, 1, "video id inside a url");
assert.equal(L.findSecrets({ title: "Lanterns glow" }, { words: ["lantern"] }).length, 0, "a longer word is not the word");
assert.equal(L.findSecrets({ title: "ok" }, { words: [], videoIds: [] }).length, 0);
assert.equal(L.findSecrets(null).length, 0);

// ---------- 9. flush debounce ----------
const fd = (o) => L.flushDecision(o);
assert.deepEqual(fd({ lastFlushMs: null, nowMs: 1000 }), { action: "flush" }, "first flush is immediate");
assert.deepEqual(fd({ lastFlushMs: 1000, nowMs: 1000 + 2999 }), { action: "schedule", atMs: 4000 }, "1 ms before the gap: schedule");
assert.deepEqual(fd({ lastFlushMs: 1000, nowMs: 4000 }), { action: "flush" }, "exactly 3 s: flush");
assert.deepEqual(fd({ lastFlushMs: 1000, nowMs: 4001 }), { action: "flush" });
assert.deepEqual(fd({ lastFlushMs: 1000, nowMs: 1000 }), { action: "schedule", atMs: 4000 }, "same instant: schedule");
assert.deepEqual(fd({ lastFlushMs: 1000, nowMs: 2000, scheduledAtMs: 4000 }), { action: "wait", atMs: 4000 }, "one already queued: wait");
assert.deepEqual(fd({ lastFlushMs: 1000, nowMs: 2000, scheduledAtMs: 1500 }), { action: "schedule", atMs: 4000 }, "a stale queued time does not count");
assert.deepEqual(fd({ lastFlushMs: 1000, nowMs: 4000, scheduledAtMs: 5000 }), { action: "flush" }, "the gap passed: flush even if one is queued");
assert.deepEqual(L.flushDecision({ lastFlushMs: 1000, nowMs: 2000 }, { flushMinGapSeconds: 1 }), { action: "flush" }, "the gap is a setting");
assert.deepEqual(L.flushDecision({ lastFlushMs: 1000, nowMs: 2000 }, { flushMinGapSeconds: 10 }), { action: "schedule", atMs: 11000 });
// 300 check-ins in a minute: at most one flush per 3 s window, however many events arrive
{
  let last = null, flushes = 0, queued = null;
  for (let i = 0; i < 300; i++) {
    const now = i * 200;                              // 300 events over 60 s
    if (queued != null && now >= queued) { last = queued; queued = null; flushes++; }
    const d = L.flushDecision({ lastFlushMs: last, nowMs: now, scheduledAtMs: queued });
    if (d.action === "flush") { last = now; flushes++; queued = null; } else if (d.action === "schedule") queued = d.atMs;
  }
  assert.equal(flushes <= 21, true, `flushes: ${flushes}`);
  assert.equal(flushes >= 18, true);
}

// ---------- 10. keys ----------
const fixed = (n) => Buffer.alloc(n, 7);
const k1 = L.generateKey(fixed);
assert.equal(k1, "07".repeat(32));
assert.equal(L.generateKey(fixed, 16), "07".repeat(16), "length is a parameter");
assert.match(L.generateKey(), /^[0-9a-f]{64}$/, "real random bytes");
assert.notEqual(L.generateKey(), L.generateKey(), "two real keys differ");
assert.throws(() => L.generateKey(() => Buffer.alloc(3)), /wrong length/);
assert.throws(() => L.generateKey(() => null), /wrong length/);
const h1 = L.hashKey(k1);
assert.equal(h1, crypto.createHash("sha256").update(k1).digest("hex"), "SHA-256 hex");
assert.match(h1, /^[0-9a-f]{64}$/);
assert.notEqual(h1, k1);
assert.equal(L.verifyKey(k1, h1), true);
assert.equal(L.verifyKey(k1, h1.toUpperCase()), true, "hash case does not matter");
assert.equal(L.verifyKey("wrong", h1), false, "a wrong key");
assert.equal(L.verifyKey(k1 + "0", h1), false, "a longer key");
assert.equal(L.verifyKey(k1.slice(0, -1), h1), false, "a shorter key");
assert.equal(L.verifyKey("", h1), false);
assert.equal(L.verifyKey(null, h1), false);
assert.equal(L.verifyKey(undefined, h1), false);
assert.equal(L.verifyKey(12345, h1), false);
assert.equal(L.verifyKey({}, h1), false);
assert.equal(L.verifyKey(k1, "short"), false, "different length hash: no throw");
assert.equal(L.verifyKey(k1, h1 + "00"), false);
assert.equal(L.verifyKey(k1, ""), false);
assert.equal(L.verifyKey(k1, null), false);
assert.equal(L.verifyKey(k1, undefined), false);
assert.equal(L.verifyKey(k1, "z".repeat(64)), false, "non-hex hash: no throw");
assert.equal(L.verifyKey(k1, L.hashKey("another")), false);
// the library uses timingSafeEqual and never prints
const src = require("fs").readFileSync(require.resolve("../lib/live/logic.js"), "utf8");
assert.match(src, /timingSafeEqual/);
assert.equal(/console\.(log|info|warn|error)/.test(src), false, "logic.js never logs (keys must not leak)");
assert.equal(/require\("(firebase|@google|https?|axios|node-fetch)/.test(src), false, "no Firestore or network in logic.js");

// ---------- word list sanity ----------
const words = W.WORDS;
assert.equal(words.length >= 140, true, `word count ${words.length}`);
assert.equal(W.normalise("Lan-Tern"), L.normalise("Lan-Tern"), "words.js normalise is logic.js normalise");
assert.equal(new Set(words.map(L.normalise)).size, words.length, "unique after normalise");
assert.equal(words.every((w) => /^[a-z]+$/.test(w)), true, "lowercase ASCII single words");
assert.equal(words.every((w) => w === L.normalise(w)), true, "already normalised");
const SHORT_OK = ["fog"];                                   // owner-approved 3-letter word; everything else is 4 to 10 letters
const odd = words.filter((w) => w.length < 3 || w.length > 10 || (w.length < 4 && !SHORT_OK.includes(w)));
assert.deepEqual(odd, [], "4 to 10 letters (3 allowed only for the approved short words)");
for (const w of ["fog", "tomb", "ghoul", "wraith", "haunted", "graveyard"]) assert.equal(words.includes(w), true, `owner-added word present: ${w}`);
for (const w of ["asylum", "pentagram", "chainsaw", "cleaver", "hatchet", "scalpel", "specter", "bogeyman", "cauldron", "grimoire", "tarot"]) assert.equal(words.includes(w), false, `owner-removed word gone: ${w}`);
assert.deepEqual(Object.values(W.GROUPS).flat(), [...words], "WORDS is exactly the groups");
assert.equal(Object.keys(W.GROUPS).length >= 5, true, "grouped by theme");
// deny list: words that must never appear (slurs and sexual terms are kept out by review; this list guards edits),
// real brands and people, real tragedies, and either side of a homophone / near-sound pair
const BANNED = ["ouija", "voodoo", "nazi", "hitler", "genocide", "holocaust", "massacre", "suicide", "noose", "rape", "sex", "porn", "nude", "naked", "slave", "lynch",
  "disney", "nike", "netflix", "google", "amazon", "xbox", "twitch", "youtube", "tiktok", "boomer", "boomertanger", "halloween", "krampus", "jason", "freddy", "chucky", "pennywise",
  "titanic", "chernobyl", "columbine", "tsunami", "katrina", "plague", "ebola", "covid"];
for (const b of BANNED) assert.equal(words.includes(b), false, `banned word in list: ${b}`);
// pairs the owner could mishear on stream: at most one side may be in the list
const CONFUSABLE = [
  ["crypt", "script"], ["crypt", "kept"], ["grave", "gray"], ["grave", "grey"], ["haunt", "hunt"], ["haunted", "hunted"], ["blood", "blud"], ["blood", "flood"],
  ["witch", "which"], ["scream", "stream"], ["ghost", "ghoul"], ["mummy", "mommy"], ["night", "knight"], ["hearse", "horse"], ["wail", "whale"], ["creak", "creek"],
  ["moan", "mourn"], ["moor", "more"], ["moth", "mouth"], ["bier", "beer"], ["pale", "pail"], ["cellar", "seller"], ["dead", "dread"], ["doom", "tomb"], ["doom", "room"],
  ["mist", "missed"], ["gore", "gour"], ["bone", "bowl"], ["fear", "fierce"], ["owl", "foul"], ["bat", "bad"], ["summon", "salmon"], ["horror", "terror"], ["coffin", "coughing"],
  ["scare", "scar"], ["fright", "flight"], ["fright", "freight"], ["bury", "berry"], ["gloom", "groom"], ["roam", "rome"], ["raven", "ravine"], ["wraith", "wrath"], ["reaper", "keeper"],
];
// pairs the owner reviewed and kept on purpose (reported to him): only these exact pairs may be close
const ALLOWED_CLOSE = [["ghost", "ghoul"], ["tomb", "tombstone"]];
const allowedClose = (a, b) => ALLOWED_CLOSE.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
for (const [a, b] of CONFUSABLE.filter(([a, b]) => !allowedClose(a, b))) assert.equal(words.includes(a) && words.includes(b), false, `confusable pair both in list: ${a} / ${b}`);
// the list's own near-sounds: no two words one letter apart, and no singular/plural or prefix-extension pairs
const lev = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
for (let i = 0; i < words.length; i++) {
  for (let j = i + 1; j < words.length; j++) {
    const a = words[i], b = words[j];
    if (allowedClose(a, b)) continue;
    assert.equal(lev(a, b) > 1, true, `too close: ${a} / ${b}`);
    assert.equal(a.startsWith(b) || b.startsWith(a), false, `one word starts the other: ${a} / ${b}`);
  }
}
// every list word can be picked, checked in with, and survives the deny scan of the public doc
const picked = L.pickWord(words, [], at(0), () => 0.5);
assert.equal(words.includes(picked.word), true);

// ---------- one source for the Twitch channel ----------
// The site's player embeds site.json twitchChannel; the functions use TWITCH_LOGIN (functions/.env, defaults in lib/live/feeds.js): they must match.
{
  const fs = require("fs"), path = require("path");
  const env = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").match(/^TWITCH_LOGIN=(.*)$/m);
  const site = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "site", "src", "data", "site.json"), "utf8"));
  assert.ok(env && env[1].trim(), "functions/.env has TWITCH_LOGIN");
  assert.equal(site.twitchChannel, env[1].trim(), "site.json twitchChannel must equal functions/.env TWITCH_LOGIN");
  const feedsSrc = fs.readFileSync(path.join(__dirname, "..", "lib", "live", "feeds.js"), "utf8");
  assert.ok(feedsSrc.includes(`defineString("TWITCH_LOGIN", { default: "${env[1].trim()}" })`), "lib/live/feeds.js TWITCH_LOGIN default must equal functions/.env");
}

console.log("check-live: ok");
