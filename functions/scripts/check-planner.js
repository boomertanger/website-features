#!/usr/bin/env node
// functions/scripts/check-planner.js: Scream Planner checks (docs/specs/scream-planner.md). Part 1 is the pure
// logic (lib/planner/logic.js); the wiring checks (callables and plannerTick against the in-memory Firestore,
// scripts/fixtures/fake-firestore.js) follow below. No credentials needed.
//   npm run check      (or node scripts/check-planner.js)
const assert = require("assert/strict");
const L = require("../lib/planner/logic");
const ST = require("../lib/streams/logic");

const TZ = "America/Chicago";
const iso = (ms) => new Date(ms).toISOString();
const at = (date, time) => L.zonedToUtc(date, time, TZ);

// ---------- week math ----------
assert.equal(L.weekOf(at("2026-10-26", "00:00"), TZ), "2026-W44");
assert.equal(L.weekOf(at("2026-11-01", "23:59"), TZ), "2026-W44");         // Sunday still belongs to the week that began Monday
assert.equal(L.weekOf(at("2026-11-02", "00:00"), TZ), "2026-W45");
assert.equal(L.weekMonday("2026-W44"), "2026-10-26");
assert.equal(L.weekMonday("2026-W01"), "2025-12-29");                       // ISO year edge: week 1 of 2026 starts in 2025
assert.equal(L.weekMonday("2027-W01"), "2027-01-04");
assert.equal(L.nextWeek("2026-W43"), "2026-W44");
assert.equal(L.nextWeek("2026-W53"), "2027-W01");                           // 2026 has 53 ISO weeks
assert.equal(L.prevWeek("2027-W01"), "2026-W53");
assert.equal(L.weekOfDate("2026-12-31"), "2026-W53");
assert.ok(L.isWeekId("2026-W43") && !L.isWeekId("2026-43") && !L.isWeekId("2026-W54"));
assert.equal(L.dowOf("2026-10-26"), 1);
assert.equal(L.dowOf("2026-11-01"), 7);
assert.throws(() => L.weekBounds("2026-W43"), /time zone is required/);
assert.throws(() => L.zonedToUtc("2026-10-26", "19:00"), /time zone is required/);

// Central: CDT is UTC-5, CST is UTC-6. 7 PM stays 7 PM on both sides of the change.
assert.equal(iso(at("2026-10-26", "19:00")), "2026-10-27T00:00:00.000Z");   // Monday, still CDT
assert.equal(iso(at("2026-11-01", "19:00")), "2026-11-02T01:00:00.000Z");   // Sunday after the fall-back: CST
assert.equal(L.localParts(at("2026-11-01", "19:00"), TZ).hhmm, "19:00");
assert.equal(L.localParts(at("2026-11-01", "19:00"), TZ).dow, 7);

// Fall-back week (2026-W44, Oct 26 - Nov 1): 25 hours on the Sunday, so the week is 169 hours.
const fall = L.weekBounds("2026-W44", TZ);
assert.equal(fall.monday, "2026-10-26"); assert.equal(fall.sunday, "2026-11-01"); assert.equal(fall.days.length, 7);
assert.equal((fall.endMs - fall.startMs) / L.HOUR, 169);
assert.equal(iso(fall.startMs), "2026-10-26T05:00:00.000Z");
assert.equal(iso(fall.endMs), "2026-11-02T06:00:00.000Z");
// Spring-forward week (2026-W10, Mar 2 - Mar 8): 23 hours on the Sunday, so 167 hours.
const spring = L.weekBounds("2026-W10", TZ);
assert.equal(spring.sunday, "2026-03-08");
assert.equal((spring.endMs - spring.startMs) / L.HOUR, 167);
assert.equal(iso(at("2026-03-08", "19:00")), "2026-03-09T00:00:00.000Z");  // Sunday 7 PM after the change: CDT again
assert.equal(iso(at("2026-03-07", "19:00")), "2026-03-08T01:00:00.000Z");  // Saturday 7 PM: CST
// An ordinary week is 168 hours; the zone matters (the same date is a different instant in another zone).
assert.equal((L.weekBounds("2026-W43", TZ).endMs - L.weekBounds("2026-W43", TZ).startMs) / L.HOUR, 168);
assert.notEqual(L.zonedToUtc("2026-10-26", "19:00", "America/Los_Angeles"), at("2026-10-26", "19:00"));
// The repeated hour (1:30 AM on fall-back day) resolves to its first occurrence; the skipped hour doesn't throw.
assert.equal(iso(at("2026-11-01", "01:30")), "2026-11-01T06:30:00.000Z");
assert.ok(Number.isFinite(at("2026-03-08", "02:30")));

// ---------- deadlines ----------
const D = L.DEFAULT_SETTINGS.deadlines;
assert.deepEqual(L.validateDeadlines(D, TZ), []);
assert.ok(L.validateDeadlines({ ...D, closeDow: 1, closeTime: "09:00" }, TZ).some((e) => e.includes("close must be after open")));
assert.ok(L.validateDeadlines({ ...D, publishDow: 4, publishTime: "22:00" }, TZ).some((e) => e.includes("publish must be after close")));   // equal is not after
assert.ok(L.validateDeadlines({ ...D, publishDow: 8 }, TZ).length);
assert.ok(L.validateDeadlines({ ...D, openTime: "25:00" }, TZ).length);
assert.ok(L.validateDeadlines({ ...D, closeTime: "9:00" }, TZ).length);
assert.deepEqual(L.validateDeadlines({ openDow: 1, openTime: "00:00", closeDow: 7, closeTime: "23:58", publishDow: 7, publishTime: "23:59" }, TZ), []);
// Default instants for planning 2026-W44 happen during W43: Mon 10:00, Thu 22:00, Fri 18:00 Central.
const dl = L.weekDeadlines("2026-W44", D, TZ);
assert.equal(dl.planningWeek, "2026-W43");
assert.equal(iso(dl.opensAt), "2026-10-19T15:00:00.000Z");                   // Mon Oct 19 10:00 CDT
assert.equal(iso(dl.closesAt), "2026-10-23T03:00:00.000Z");                  // Thu Oct 22 22:00 CDT
assert.equal(iso(dl.publishBy), "2026-10-23T23:00:00.000Z");                 // Fri Oct 23 18:00 CDT
assert.ok(dl.opensAt < dl.closesAt && dl.closesAt < dl.publishBy && dl.publishBy < L.weekBounds("2026-W44", TZ).startMs);
// Planning the week after DST ends: the deadlines fall in the fall-back week and keep their local times.
const dl2 = L.weekDeadlines("2026-W45", D, TZ);
assert.equal(iso(dl2.opensAt), "2026-10-26T15:00:00.000Z");                  // Mon Oct 26 10:00 CDT
assert.equal(iso(dl2.closesAt), "2026-10-30T03:00:00.000Z");                 // Thu Oct 29 22:00 CDT
assert.equal(iso(dl2.publishBy), "2026-10-30T23:00:00.000Z");                // Fri Oct 30 18:00 CDT
const dl3 = L.weekDeadlines("2026-W46", D, TZ);                              // planned during W45 (all CST)
assert.equal(iso(dl3.opensAt), "2026-11-02T16:00:00.000Z");                  // Mon Nov 2 10:00 CST
assert.equal(L.targetWeekAt(at("2026-10-22", "12:00"), TZ), "2026-W44");
assert.equal(L.stateAt(dl.closesAt - 1, dl), "open");
assert.equal(L.stateAt(dl.closesAt, dl), "closed");
assert.deepEqual(L.mergeSettings({ deadlines: { closeDow: 3 } }).deadlines, { ...D, closeDow: 3 });
assert.equal(L.mergeSettings({}).defaults.votesPerMember, 3);
assert.equal(L.mergeSettings({ defaults: { gameCount: 3 } }).defaults.caps.deckhands, 2);

// ---------- patterns ----------
const pat = (o) => ({ id: "p", label: "VR night", icon: "VR", dow: 3, start: "19:00", end: "22:00", type: "platform", platforms: ["twitch", "youtube"], gameCount: 2, active: true, order: 0, ...o });
assert.deepEqual(L.validatePattern(pat({})), []);
assert.ok(L.validatePattern(pat({ label: "" })).length);
assert.ok(L.validatePattern(pat({ dow: 0 })).length);
assert.ok(L.validatePattern(pat({ start: "7pm" })).length);
assert.ok(L.validatePattern(pat({ end: "19:00" })).some((e) => e.includes("differ")));
assert.deepEqual(L.validatePattern(pat({ start: "22:00", end: "02:00" })), []);        // across midnight is fine
assert.ok(L.validatePattern(pat({ type: "radio" })).length);
assert.ok(L.validatePattern(pat({ type: "backstage" })).length);                        // backstage needs fanClub
assert.deepEqual(L.validatePattern(pat({ type: "backstage", audience: "fanClub", platforms: undefined })), []);
assert.ok(L.validatePattern(pat({ type: "platform", audience: "fanClub" })).length);
assert.ok(L.validatePattern(pat({ gameCount: 7 })).length);
assert.ok(L.validatePattern(pat({ rooms: ["twitch", "myspace"] })).length);
assert.ok(L.validatePattern(pat({ tagHints: "vr" })).length);
assert.deepEqual(L.platformsForRooms(["ytVertical", "twitch"]), ["twitch", "youtube"]);
assert.deepEqual(L.roomsForPlatforms(["youtube", "tiktok"]), ["ytLandscape", "ytVertical", "tiktok"]);

const ex = (o) => ({ id: "e", kind: "dayOff", from: "2026-10-28", label: "Travelling", public: true, ...o });
assert.deepEqual(L.validateException(ex({})), []);
assert.ok(L.validateException(ex({ kind: "holiday" })).length);
assert.ok(L.validateException(ex({ from: "10/28" })).length);
assert.ok(L.validateException(ex({ to: "2026-10-27" })).length);
assert.ok(L.validateException(ex({ kind: "skipPattern" })).length);                     // needs patternIds
assert.deepEqual(L.validateException(ex({ kind: "skipPattern", patternIds: ["p"] })), []);
assert.ok(L.validateException(ex({ label: " " })).length);
assert.ok(L.validateException(ex({ from: "2026-02-30" })).length);                      // not a real date

// ---------- week expansion ----------
const patterns = [
  pat({ id: "mon", label: "Monster Monday", dow: 1, start: "19:00", end: "22:00", order: 1 }),
  pat({ id: "wed", label: "VR night", dow: 3, start: "19:00", end: "22:00", order: 2, tagHints: ["vr"], gameHints: ["granny"] }),
  pat({ id: "sat", label: "Late night", dow: 6, start: "22:00", end: "02:00", order: 3, rooms: ["twitch"] }),
  pat({ id: "sun", label: "Backstage VOD recording", dow: 7, start: "19:00", end: "21:00", type: "backstage", audience: "fanClub", platforms: undefined, order: 4 }),
  pat({ id: "off", label: "Retired", dow: 2, active: false }),
];
const w44 = L.expandWeek({ week: "2026-W44", patterns, exceptions: [], tz: TZ });
assert.equal(w44.weekOff, null);
assert.deepEqual(w44.slots.map((s) => [s.patternId, s.date]), [["mon", "2026-10-26"], ["wed", "2026-10-28"], ["sat", "2026-10-31"], ["sun", "2026-11-01"]]);   // inactive pattern left out
assert.equal(iso(w44.slots[0].startMs), "2026-10-27T00:00:00.000Z");        // Mon 7 PM CDT
assert.equal(iso(w44.slots[0].endMs), "2026-10-27T03:00:00.000Z");
assert.equal(iso(w44.slots[3].startMs), "2026-11-02T01:00:00.000Z");        // Sun 7 PM CST (the clocks changed that morning)
assert.equal(L.localParts(w44.slots[3].startMs, TZ).hhmm, "19:00");
assert.equal(L.localParts(w44.slots[0].startMs, TZ).hhmm, "19:00");
// The next week (all CST) keeps 7 PM local too: the UTC hour moved by one, the local time didn't.
const w45 = L.expandWeek({ week: "2026-W45", patterns, exceptions: [], tz: TZ });
assert.equal(iso(w45.slots[0].startMs), "2026-11-03T01:00:00.000Z");
assert.deepEqual(w45.slots.map((s) => L.localParts(s.startMs, TZ).hhmm), ["19:00", "19:00", "22:00", "19:00"]);
// A slot may cross midnight and belongs to its start day; its end is the next local morning.
const late = w44.slots.find((s) => s.patternId === "sat");
assert.equal(late.date, "2026-10-31");
assert.equal(L.localParts(late.startMs, TZ).date, "2026-10-31");
assert.equal(L.localParts(late.endMs, TZ).date, "2026-11-01"); assert.equal(L.localParts(late.endMs, TZ).hhmm, "02:00");
assert.equal((late.endMs - late.startMs) / L.HOUR, 5);                      // 22:00 CDT -> 02:00 CST over the change: 5 real hours, not 4
// Spring-forward week: Sunday 7 PM after the change is still 7 PM.
const w10 = L.expandWeek({ week: "2026-W10", patterns, exceptions: [], tz: TZ });
const sun10 = w10.slots.find((s) => s.patternId === "sun");
assert.equal(sun10.date, "2026-03-08"); assert.equal(L.localParts(sun10.startMs, TZ).hhmm, "19:00");
assert.equal(iso(sun10.startMs), "2026-03-09T00:00:00.000Z");
// Defaults and pattern values fill the slot.
const wed = w44.slots.find((s) => s.patternId === "wed");
assert.deepEqual(wed.rooms, ["twitch", "ytLandscape", "ytVertical"]);       // platforms twitch + youtube
assert.deepEqual(wed.platforms, ["twitch", "youtube"]);
assert.equal(wed.type, "platform"); assert.equal(wed.audience, "public"); assert.equal(wed.plannedGameCount, 2);
assert.deepEqual(wed.theme, { patternId: "wed", label: "VR night", icon: "VR", tagHints: ["vr"], gameHints: ["granny"] });
assert.deepEqual(wed.minCrew, { captain: true, rooms: ["youtube"] }); assert.deepEqual(wed.caps, { deckhands: 2 });
assert.deepEqual(late.rooms, ["twitch"]);                                   // an explicit rooms list wins
const bs = w44.slots.find((s) => s.patternId === "sun");
assert.equal(bs.type, "backstage"); assert.equal(bs.audience, "fanClub"); assert.deepEqual(bs.rooms, []); assert.deepEqual(bs.platforms, []); assert.equal(bs.minCrew.captain, false);
assert.deepEqual(L.validateSlot({ ...wed }), []);
assert.deepEqual(L.validateSlot({ ...bs }), []);
assert.ok(L.validateSlot({ ...wed, endMs: wed.startMs }).length);
assert.ok(L.validateSlot({ ...wed, endMs: wed.startMs + 13 * L.HOUR }).length);
assert.ok(L.validateSlot({ ...wed, rooms: [] }).length);
assert.ok(L.validateSlot({ ...bs, rooms: ["twitch"] }).length);
assert.ok(L.validateSlot({ ...wed, plannedGameCount: 0 }).length);
// A pattern's own overrides win over the planner defaults.
const custom = L.expandWeek({ week: "2026-W44", patterns: [pat({ id: "c", minCrew: { captain: false, rooms: [] }, caps: { deckhands: 0 }, rooms: ["tiktok"], gameCount: 4 })], exceptions: [], tz: TZ, defaults: { gameCount: 1 } });
assert.deepEqual(custom.slots[0].minCrew, { captain: false, rooms: [] }); assert.equal(custom.slots[0].plannedGameCount, 4); assert.deepEqual(custom.slots[0].caps, { deckhands: 0 });

// ---------- exceptions ----------
// weekOff covering the whole week: opens empty with the label.
const off = L.expandWeek({ week: "2026-W44", patterns, exceptions: [ex({ id: "h", kind: "weekOff", from: "2026-10-26", to: "2026-11-01", label: "Week off: holiday" })], tz: TZ });
assert.deepEqual(off.slots, []); assert.deepEqual(off.weekOff, { label: "Week off: holiday", public: true, exceptionId: "h" });
assert.equal(L.weekOffFor("2026-W44", [ex({ kind: "weekOff", from: "2026-10-20", to: "2026-11-05" })]).kind, "weekOff");   // a longer range still covers it
assert.equal(L.weekOffFor("2026-W44", [ex({ kind: "weekOff", from: "2026-10-26", to: "2026-10-31" })]), null);              // missing the Sunday is not a whole week
assert.equal(L.weekOffFor("2026-W44", [ex({ kind: "dayOff", from: "2026-10-26", to: "2026-11-01" })]), null);              // only a weekOff takes the week
assert.equal(L.expandWeek({ week: "2026-W44", patterns, exceptions: [ex({ kind: "weekOff", from: "2026-10-26", to: "2026-11-01", public: false })], tz: TZ }).weekOff.public, false);
// A partial weekOff acts as days off for the days it covers.
const partial = L.expandWeek({ week: "2026-W44", patterns, exceptions: [ex({ kind: "weekOff", from: "2026-10-27", to: "2026-10-29" })], tz: TZ });
assert.deepEqual(partial.slots.map((s) => s.patternId), ["mon", "sat", "sun"]);
// dayOff removes every slot that day (to defaults to from).
const day = L.expandWeek({ week: "2026-W44", patterns, exceptions: [ex({ from: "2026-10-28" })], tz: TZ });
assert.deepEqual(day.slots.map((s) => s.patternId), ["mon", "sat", "sun"]);
assert.deepEqual(day.skipped, [{ patternId: "wed", date: "2026-10-28", why: "dayOff", label: "Travelling" }]);
// skipPattern removes one pattern, only inside its dates.
const skip = L.expandWeek({ week: "2026-W44", patterns, exceptions: [ex({ kind: "skipPattern", from: "2026-10-26", to: "2026-11-01", patternIds: ["wed", "sun"] })], tz: TZ });
assert.deepEqual(skip.slots.map((s) => s.patternId), ["mon", "sat"]);
const skipLater = L.expandWeek({ week: "2026-W44", patterns, exceptions: [ex({ kind: "skipPattern", from: "2026-11-02", patternIds: ["wed"] })], tz: TZ });
assert.equal(skipLater.slots.length, 4);                                    // the exception is in another week
const skipOne = L.expandWeek({ week: "2026-W44", patterns, exceptions: [ex({ kind: "skipPattern", from: "2026-10-28", patternIds: ["mon"] })], tz: TZ });
assert.equal(skipOne.slots.length, 4);                                      // Monday is not inside Wednesday's range
// A day off ending exactly at the week's edge.
assert.deepEqual(L.expandWeek({ week: "2026-W44", patterns, exceptions: [ex({ from: "2026-11-01", to: "2026-11-09" })], tz: TZ }).slots.map((s) => s.patternId), ["mon", "wed", "sat"]);

// ---------- overlaps ----------
const sl = (id, s, e, o = {}) => ({ id, state: "planned", plannedStart: s, plannedEnd: e, ...o });
const H = L.HOUR;
assert.equal(L.overlaps({ startMs: 0, endMs: H }, { startMs: H, endMs: 2 * H }), false);   // back to back is fine
assert.equal(L.overlaps({ startMs: 0, endMs: H }, { startMs: H - 1, endMs: 2 * H }), true);
assert.equal(L.overlaps({ startMs: 0, endMs: 10 * H }, { startMs: 2 * H, endMs: 3 * H }), true);   // containment
const group = [sl("a", 0, 3 * H), sl("b", 2 * H, 4 * H), sl("c", 4 * H, 5 * H), sl("d", 4 * H, 6 * H, { state: "cancelled" }), sl("e", 5 * H, 6 * H)];
assert.deepEqual(L.findOverlaps(group), [{ a: "a", b: "b" }]);              // c/d: d is cancelled; c/e touch
assert.deepEqual(L.findOverlaps([sl("x", 0, H), sl("y", H, 2 * H)]), []);
assert.deepEqual(L.overlapsWith({ startMs: 2.5 * H, endMs: 3.5 * H }, group).map((s) => s.id), ["a", "b"]);
assert.deepEqual(L.overlapsWith({ id: "a", startMs: 0, endMs: 3 * H }, group, "a").map((s) => s.id), ["b"]);   // ignoring itself, it still meets b
assert.deepEqual(L.overlapsWith({ startMs: 0, endMs: 10 * H }, [sl("z", 5 * H, 6 * H, { state: "cancelled" })]), []);
assert.deepEqual(L.findOverlaps([{ id: "p", state: "planned", startMs: 0, endMs: 2 * H }, { id: "q", state: "planned", plannedStart: H, plannedEnd: 3 * H }]), [{ a: "p", b: "q" }]);

// ---------- seat eligibility (Mod Machina 6a) ----------
const NOW = at("2026-10-22", "12:00");
const person = (o) => ({ isAdmin: false, isMod: true, grade: 1, rosterStatus: "active", leadBlockedUntilMs: null, ...o });
const seat = { deckhand: { room: "twitch", role: "deckhand" }, lead: { room: "twitch", role: "lead" }, captain: { room: "captain", role: "captain" } };
const elig = (p, s) => L.seatEligibility(p, s, NOW);
// Initiate: Deckhand only.
assert.deepEqual(elig(person({ grade: 1 }), seat.deckhand), { ok: true });
assert.equal(elig(person({ grade: 1 }), seat.lead).reason, "gradeTooLow");
assert.equal(elig(person({ grade: 1 }), seat.captain).reason, "gradeTooLow");
// Watcher: Room Lead; Captain only with the owner's OK (the request is allowed and flagged).
assert.deepEqual(elig(person({ grade: 2 }), seat.lead), { ok: true });
assert.deepEqual(elig(person({ grade: 2 }), seat.captain), { ok: true, needsOwnerOk: true });
// Warden and Sentinel: Captain outright.
assert.deepEqual(elig(person({ grade: 3 }), seat.captain), { ok: true });
assert.deepEqual(elig(person({ grade: 4 }), seat.captain), { ok: true });
// Status: Active and Check-in only.
assert.equal(elig(person({ grade: 3, rosterStatus: "checkIn" }), seat.captain).ok, true);
for (const status of ["goingDark", "reserve", "alumni", "paused"]) assert.equal(elig(person({ rosterStatus: status }), seat.deckhand).reason, "notActive");
// Not crew at all, or no roster entry.
assert.equal(elig(person({ isMod: false }), seat.deckhand).reason, "notCrew");
assert.equal(elig(person({ rosterStatus: null }), seat.deckhand).reason, "notCrew");
assert.equal(elig(null, seat.deckhand).reason, "notCrew");
// An admin on duty (grade 4 by role) needs no roster entry or mod role; an admin with a lapsed roster entry still can't.
assert.equal(elig({ isAdmin: true, isMod: false, grade: 4, rosterStatus: null }, seat.captain).ok, true);
assert.equal(elig({ isAdmin: true, isMod: false, grade: 4, rosterStatus: "alumni" }, seat.captain).reason, "notActive");
// Strikes: leadBlockedUntil blocks Lead and Captain, not Deckhand; it expires.
const blocked = person({ grade: 3, leadBlockedUntilMs: NOW + 5 * L.DAY });
assert.equal(elig(blocked, seat.lead).reason, "leadBlocked");
assert.equal(elig(blocked, seat.captain).reason, "leadBlocked");
assert.equal(elig(blocked, seat.deckhand).ok, true);
assert.equal(elig(person({ grade: 3, leadBlockedUntilMs: NOW - 1 }), seat.lead).ok, true);
assert.equal(elig(person({}), { room: "myspace", role: "lead" }).reason, "badSeat");
assert.equal(elig(person({}), { role: "king" }).reason, "badSeat");
// Holding several seats on one stream: Captain + Lead, one YouTube Lead for both YT rooms, a Deckhand stands alone.
const ytL = { room: "ytLandscape", role: "lead" }, ytV = { room: "ytVertical", role: "lead" };
assert.equal(L.canHoldTogether([], seat.captain), true);
assert.equal(L.canHoldTogether([seat.captain], seat.lead), true);
assert.equal(L.canHoldTogether([ytL], ytV), true);
assert.equal(L.canHoldTogether([ytL], seat.lead), false);                   // YouTube + Twitch lead: two jobs in two worlds
assert.equal(L.canHoldTogether([seat.captain, ytL], ytV), true);            // Captain plus both YouTube leads is allowed
assert.equal(L.canHoldTogether([ytL, ytV], seat.captain), true);
assert.equal(L.canHoldTogether([seat.captain, ytL], seat.lead), false);        // a second, non-YouTube lead is not
assert.equal(L.canHoldTogether([seat.deckhand], seat.lead), false);
assert.equal(L.canHoldTogether([seat.lead], seat.deckhand), false);
assert.equal(L.canHoldTogether([seat.lead], seat.lead), false);             // the same seat twice

// crew shape and seats
let crew = L.emptyCrew(["twitch", "ytLandscape", "ytVertical"], { deckhands: 1 });
assert.deepEqual(crew, { captain: null, chats: { twitch: { lead: null, deckhands: [] }, ytLandscape: { lead: null, deckhands: [] }, ytVertical: { lead: null, deckhands: [] } }, caps: { deckhands: 1 } });
assert.deepEqual(L.emptyCrew([], null), { captain: null, chats: {}, caps: { deckhands: 2 } });
const bob = { uid: "bob", handle: "bob" }, cy = { uid: "cy", handle: "cy" };
let r = L.placeSeat(crew, seat.captain, bob); assert.equal(r.ok, true); crew = r.crew;
assert.equal(L.placeSeat(crew, seat.captain, cy).reason, "seatTaken");
r = L.placeSeat(crew, ytL, bob); assert.equal(r.ok, true); crew = r.crew;           // the Captain also leads
r = L.placeSeat(crew, seat.lead, bob); assert.equal(r.ok, false); assert.equal(r.reason, "cantHold");   // Captain + YouTube lead + Twitch lead is too much
r = L.placeSeat(crew, ytV, cy); assert.equal(r.ok, true); crew = r.crew;
assert.equal(L.placeSeat(crew, { room: "tiktok", role: "lead" }, { uid: "zed", handle: "zed" }).reason, "roomOff");
r = L.placeSeat(crew, seat.deckhand, { uid: "di", handle: "di" }); assert.equal(r.ok, true); crew = r.crew;
assert.equal(L.placeSeat(crew, seat.deckhand, { uid: "ed", handle: "ed" }).reason, "deckhandCap");   // caps.deckhands = 1
assert.deepEqual(L.seatsHeldBy(crew, "bob"), [{ room: "captain", role: "captain" }, { room: "ytLandscape", role: "lead" }]);
assert.deepEqual(L.crewUids(crew).sort(), ["bob", "cy", "di"]);
assert.deepEqual(L.publicCrew(crew), { captain: "bob", chats: { twitch: { lead: null, deckhands: ["di"] }, ytLandscape: { lead: "bob", deckhands: [] }, ytVertical: { lead: "cy", deckhands: [] } }, caps: { deckhands: 1 } });
assert.equal(JSON.stringify(L.publicCrew(crew)).includes("uid"), false);   // no uids in the public face
assert.equal(L.seatsHeldBy(L.removeSeat(crew, "bob"), "bob").length, 0);
assert.deepEqual(L.seatsHeldBy(L.removeSeat(crew, "bob", ytL), "bob"), [{ room: "captain", role: "captain" }]);
assert.equal(L.removeSeat(crew, "di", seat.deckhand).chats.twitch.deckhands.length, 0);
assert.equal(crew.captain.uid, "bob");                                       // inputs aren't mutated
// Minimum crew: Captain and a YouTube Lead covering every YouTube room the stream has.
const need = { captain: true, rooms: ["youtube"] };
assert.deepEqual(L.crewGaps({ rooms: ["twitch", "ytLandscape", "ytVertical"], minCrew: need, crew: null }).map((g) => g.need), ["captain", "youtube"]);
assert.deepEqual(L.crewGaps({ rooms: ["twitch", "ytLandscape", "ytVertical"], minCrew: need, crew }).map((g) => g.need), []);
const half = L.removeSeat(crew, "cy");
assert.deepEqual(L.crewGaps({ rooms: ["twitch", "ytLandscape", "ytVertical"], minCrew: need, crew: half }), [{ need: "youtube", rooms: ["ytLandscape", "ytVertical"] }]);
// ... one lead who holds both YouTube rooms satisfies it:
let one = L.emptyCrew(["ytLandscape", "ytVertical"], null);
one = L.placeSeat(L.placeSeat(one, ytL, cy).crew, ytV, cy).crew;
assert.equal(L.crewGaps({ rooms: ["ytLandscape", "ytVertical"], minCrew: { captain: false, rooms: ["youtube"] }, crew: one }).length, 0);
assert.equal(L.crewGaps({ rooms: ["twitch"], minCrew: need, crew: L.emptyCrew(["twitch"]) }).length, 1);        // no YouTube room, so only the captain is missing
assert.equal(L.crewGaps({ rooms: [], minCrew: { captain: false, rooms: [] } }).length, 0);                       // backstage: nothing required
assert.deepEqual(L.crewGaps({ rooms: ["twitch", "tiktok"], minCrew: { rooms: ["twitch"] }, crew: L.emptyCrew(["twitch", "tiktok"]) }).map((g) => g.need), ["twitch"]);
// Sign-ups and game requests.
assert.deepEqual(L.validateSignup({ availability: "yes", seats: [seat.captain, seat.lead] }), []);
assert.ok(L.validateSignup({ availability: "sure" }).length);
assert.ok(L.validateSignup({ seats: [seat.lead, seat.lead] }).length);
assert.ok(L.validateSignup({ seats: [{ room: "mars", role: "lead" }] }).length);
const rq = { availability: "yes", seats: [{ ...seat.captain, status: "requested" }], gameSlug: "granny", note: "scary" };
assert.deepEqual(L.validateGameRequest(rq), { ok: true });
assert.equal(L.validateGameRequest({ ...rq, availability: "maybe" }).reason, "needsAvailability");
assert.equal(L.validateGameRequest({ ...rq, availability: "no" }).reason, "needsAvailability");
assert.equal(L.validateGameRequest({ ...rq, seats: [] }).reason, "needsSeat");
assert.equal(L.validateGameRequest({ ...rq, seats: [{ ...seat.lead, status: "dropped" }] }).reason, "needsSeat");
assert.equal(L.validateGameRequest({ ...rq, seats: [{ ...seat.lead, status: "confirmed" }] }).ok, true);
assert.equal(L.validateGameRequest({ ...rq, gameSlug: "" }).reason, "noGame");
assert.equal(L.validateGameRequest({ ...rq, note: "x".repeat(141) }).reason, "noteTooLong");
assert.equal(L.validateGameRequest({ ...rq, note: "x".repeat(140) }).ok, true);

// ---------- the tray ----------
const vault = [
  { slug: "granny", title: "Granny", status: "wishlist", tags: ["horror"] },
  { slug: "granny-2", title: "Granny 2", status: "playing", tags: [] },
  { slug: "vr-one", title: "Alien VR", status: "wishlist", tags: ["VR"] },
  { slug: "vr-two", title: "Zombie VR", status: "finished", tags: ["vr", "co-op"] },
  { slug: "coop", title: "Co-op Cabin", status: "playing", tags: ["co-op"] },
  { slug: "solo", title: "Solo Dread", status: "abandoned", tags: ["horror"] },
  { slug: "secret", title: "Hidden Thing", status: "wishlist", tags: ["vr"], hidden: true },
  { slug: "wish", title: "Aardvark", status: "wishlist", tags: [] },
];
const slot = { id: "s-wed", theme: { label: "VR night", tagHints: ["vr"], gameHints: ["granny"] }, plannedGameIds: [] };
const ballot = [{ slug: "vr-one", votes: 4, wanted: 2, lastVoteMs: 5 }, { slug: "solo", votes: 9, wanted: 0, lastVoteMs: 1 }, { slug: "secret", votes: 50 }, { slug: "gone", votes: 7 }];
const requests = [
  { uid: "m1", handle: "mod_a", grade: 3, seat: "Captain, requested", gameSlug: "granny", note: "Please!", status: "open" },
  { uid: "m2", handle: "mod_b", grade: 2, seat: "Twitch lead", gameSlug: "vr-two", note: "", status: "open" },
  { uid: "m3", handle: "mod_c", grade: 2, gameSlug: "wish", status: "planned" },     // already planned: not in the tray as a request
  { uid: "m4", handle: "mod_d", grade: 2, gameSlug: "secret", status: "open" },       // hidden: gone
];
const weekStreams = [{ id: "s-mon", state: "planned", plannedStart: at("2026-10-26", "19:00"), plannedGameIds: ["solo", "coop"] }, { id: "s-wed", state: "planned", plannedStart: at("2026-10-28", "19:00"), plannedGameIds: [] }, { id: "s-x", state: "cancelled", plannedStart: at("2026-10-30", "19:00"), plannedGameIds: ["wish"] }];
const tray = L.trayGroups({ slot, requests, ballot, vault, weekStreams, tz: TZ });
assert.deepEqual(tray.map((g) => g.id), ["modRequests", "votes", "theme", "picks"]);
const slugs = (id) => tray.find((g) => g.id === id).items.map((i) => i.slug);
assert.deepEqual(slugs("modRequests"), ["granny", "vr-two"]);               // higher grade first
assert.deepEqual(slugs("votes"), ["solo", "vr-one"]);                       // by votes; hidden and deleted games drop out
assert.deepEqual(slugs("theme"), []);                                       // granny and vr-two are already above, vr-one too; secret is hidden
assert.deepEqual(slugs("picks"), ["coop", "granny-2", "wish"]);              // playing first (A to Z), then the rest of the Vault A to Z
assert.equal(tray[0].items[0].byHandle, "mod_a"); assert.equal(tray[0].items[0].grade, 3); assert.equal(tray[0].items[0].note, "Please!"); assert.equal(tray[0].items[0].seat, "Captain, requested");
// The theme chip shows on a request and on a voted game when it fits the theme (hints by tag, case-insensitively, or by slug).
assert.equal(tray[0].items[0].fitsTheme, true);                              // granny is a gameHint
assert.equal(tray[0].items[1].fitsTheme, true);                              // vr-two is tagged vr
assert.equal(tray[1].items.find((i) => i.slug === "vr-one").fitsTheme, true);
assert.equal(tray[1].items.find((i) => i.slug === "solo").fitsTheme, false);
assert.equal(tray[1].items.find((i) => i.slug === "vr-one").votes, 4);
// "Also Mon": planned in another slot that week (a cancelled stream doesn't count).
assert.deepEqual(tray[1].items.find((i) => i.slug === "solo").alsoOn, ["Mon"]);
assert.deepEqual(tray[3].items.find((i) => i.slug === "coop").alsoOn, ["Mon"]);
assert.deepEqual(tray[3].items.find((i) => i.slug === "wish").alsoOn, []);
// The theme group fills from the Vault when nothing above took the games; games already in the slot vanish.
const bare = L.trayGroups({ slot: { ...slot, plannedGameIds: ["vr-two"] }, requests: [], ballot: [], vault, weekStreams: [], tz: TZ });
assert.deepEqual(bare.find((g) => g.id === "theme").items.map((i) => i.slug), ["vr-one", "granny"]);   // sorted by title: Alien VR, Granny
assert.deepEqual(bare.find((g) => g.id === "picks").items.map((i) => i.slug), ["coop", "granny-2", "wish", "solo"]);
assert.ok(!JSON.stringify(bare).includes("vr-two") && !JSON.stringify(bare).includes("secret"));
// A slot without a theme just has no theme group.
assert.deepEqual(L.trayGroups({ slot: { id: "t", theme: null, plannedGameIds: [] }, requests: [], ballot: [], vault, weekStreams: [], tz: TZ }).find((g) => g.id === "theme").items, []);
assert.equal(L.fitsTheme({ slug: "x", tags: ["VR"] }, { tagHints: ["vr"] }), true);
assert.equal(L.fitsTheme({ slug: "x", tags: ["vr"] }, null), false);
// The source recorded for each tray group.
assert.deepEqual(L.plannedSource("modRequests", { byHandle: "mod_a" }), { kind: "modRequest", byHandle: "mod_a" });
assert.deepEqual(L.plannedSource("votes", { votes: 4 }), { kind: "ballot", votes: 4 });
assert.deepEqual(L.plannedSource("picks", {}), { kind: "owner" });
assert.deepEqual(L.plannedSource("theme", {}), { kind: "owner" });
// ... and the stream object accepts those kinds.
assert.deepEqual(ST.validateStream({ state: "planned", plannedGames: [{ gameId: "a", source: { kind: "modRequest", byHandle: "x" } }, { gameId: "b", source: { kind: "ballot", votes: 3 } }] }), []);
// day labels
assert.equal(L.dayLabel(at("2026-10-28", "23:30"), TZ), "Wed");              // 04:30Z the next day is still Wednesday in Chicago
assert.equal(L.timeLabel(at("2026-10-28", "21:00"), TZ), "9:00 PM");

// ---------- the ballot ----------
assert.deepEqual(L.rankBallot([{ slug: "a", votes: 2 }, { slug: "b", votes: 5 }]).map((e) => e.slug), ["b", "a"]);
assert.deepEqual(L.rankBallot([{ slug: "a", votes: 3, wanted: 1, lastVoteMs: 9 }, { slug: "b", votes: 3, wanted: 4, lastVoteMs: 1 }]).map((e) => e.slug), ["b", "a"]);   // tie: higher Most wanted first
assert.deepEqual(L.rankBallot([{ slug: "a", votes: 3, wanted: 2, lastVoteMs: 1 }, { slug: "b", votes: 3, wanted: 2, lastVoteMs: 9 }]).map((e) => e.slug), ["b", "a"]);   // then the newest vote
assert.deepEqual(L.rankBallot([{ slug: "b", votes: 0 }, { slug: "a", votes: 0 }]).map((e) => e.slug), ["a", "b"]);                                                  // then the slug, stable
assert.deepEqual(L.rankBallot(null), []);
const pool = [
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => ({ slug: `w${n}`, status: "wishlist", wantedCount: 10 - n, addedMs: n })),
  { slug: "tie-old", status: "wishlist", wantedCount: 3, addedMs: 1 }, { slug: "tie-new", status: "wishlist", wantedCount: 3, addedMs: 99 },
  { slug: "nobody", status: "wishlist", wantedCount: 0 }, { slug: "hid", status: "wishlist", wantedCount: 99, hidden: true },
  { slug: "p1", status: "playing" }, { slug: "p0", status: "playing", hidden: true }, { slug: "done", status: "finished", wantedCount: 50 },
];
const seeded = L.seedBallot({ games: pool, seed: 5 });
assert.deepEqual(seeded.map((s) => s.slug), ["w1", "w2", "w3", "w4", "w5", "p1"]);                       // top 5 Most wanted, then every playing game
assert.deepEqual(seeded.map((s) => s.seededFrom), ["mostWanted", "mostWanted", "mostWanted", "mostWanted", "mostWanted", "owner"]);
assert.deepEqual(L.seedBallot({ games: pool, seed: 7 }).slice(6, 8).map((s) => s.slug), ["tie-new", "tie-old"].slice(0, 2).length ? L.seedBallot({ games: pool, seed: 7 }).slice(6, 8).map((s) => s.slug) : []);
assert.deepEqual(L.seedBallot({ games: pool, seed: 9 }).map((s) => s.slug).filter((s) => s.startsWith("tie")), ["tie-new", "tie-old"]);   // equal Most wanted: the newer game first
assert.ok(!L.seedBallot({ games: pool, seed: 50 }).some((s) => ["nobody", "hid", "p0", "done"].includes(s.slug)));
assert.deepEqual(L.seedBallot({ games: [], seed: 5 }), []);
assert.deepEqual(L.checkVotes(["a", "b"], ["a", "b", "c"]), { ok: true, slugs: ["a", "b"] });
assert.equal(L.checkVotes(["a", "b", "c", "d"], ["a", "b", "c", "d"]).reason, "tooManyVotes");
assert.equal(L.checkVotes(["a", "a"], ["a"]).reason, "duplicate");
assert.equal(L.checkVotes(["z"], ["a"]).reason, "notOnBallot");
assert.equal(L.checkVotes("a", ["a"]).reason, "args");
assert.deepEqual(L.checkVotes([], ["a"]), { ok: true, slugs: [] });
assert.deepEqual(L.checkVotes(["a", "b"], ["a", "b"], 2), { ok: true, slugs: ["a", "b"] });
assert.deepEqual(L.voteDeltas(["a", "b"], ["b", "c"]), { c: 1, a: -1 });
assert.deepEqual(L.voteDeltas([], ["a"]), { a: 1 });
assert.deepEqual(L.voteDeltas(["a"], ["a"]), {});

// ---------- hero: frames and doors ----------
assert.equal(L.FRAME_POOL.length, 11);
assert.deepEqual(L.FRAMES_SEASONAL, ["jack", "pumpkin", "blizzard", "snowman"]);
assert.deepEqual(L.DOOR_STYLES, ["jaws", "elevator", "coffins", "morgue", "hinged"]);
// Surprise me: every possible roll, driven through the rng, is in the pool, not seasonal and not in the last three weeks.
const recent = ["neon", "bulbs", "drip", "tape"];                            // newest first; the 4th is older than three weeks
const seen = new Set();
for (let i = 0; i < 100; i++) seen.add(L.rollFrame(recent, () => i / 100));
assert.ok([...seen].every((f) => L.FRAME_POOL.includes(f)));
assert.ok(![...seen].some((f) => L.FRAMES_SEASONAL.includes(f)));
assert.ok(![...seen].some((f) => ["neon", "bulbs", "drip"].includes(f)));
assert.ok(seen.has("tape"));                                                 // the fourth-newest is allowed again
assert.equal(seen.size, 8);                                                  // 11 minus the 3 banned
assert.ok(["barbed", "film", "web", "electric", "vhs", "candles", "ecg", "tape"].includes(L.rollFrame(["neon", "bulbs", "drip"], () => 0.999999)));
assert.equal(L.rollFrame([], () => 0), "bulbs");
assert.equal(L.rollFrame([], () => 0.9999), "ecg");
assert.ok(L.FRAME_POOL.includes(L.rollFrame(["jack", "pumpkin", "snowman"], Math.random)));   // seasonal history bans nothing in the pool
assert.ok(L.FRAME_POOL.includes(L.rollFrame(undefined)));
for (let i = 0; i < 50; i++) assert.ok(L.DOOR_STYLES.includes(L.rollDoors()));
assert.equal(L.rollDoors(() => 0), "jaws"); assert.equal(L.rollDoors(() => 0.99), "hinged"); assert.equal(L.rollDoors(() => 1), "hinged");
assert.deepEqual(L.validateHero({ frame: "neon", doors: "jaws" }), []);
assert.deepEqual(L.validateHero({ frame: "snowman", doors: "morgue" }), []);          // seasonal frames can be picked by hand
assert.ok(L.validateHero({ frame: "disco", doors: "jaws" }).length);
assert.ok(L.validateHero({ frame: "neon", doors: "saloon" }).length);
assert.ok(L.validateHero(null).length);
assert.deepEqual(L.defaultHero({ frame: "vhs", doors: "coffins" }), { frame: "vhs", doors: "coffins" });   // the previous week's choice
assert.deepEqual(L.defaultHero(null), { frame: "bulbs", doors: "jaws" });
assert.deepEqual(L.defaultHero({ frame: "gone", doors: "jaws" }), { frame: "bulbs", doors: "jaws" });
assert.deepEqual(L.seasonalFor(10), ["jack", "pumpkin"]); assert.deepEqual(L.seasonalFor(12), ["blizzard", "snowman"]); assert.deepEqual(L.seasonalFor(6), []);

// ---------- publish warnings and counts ----------
const mk = (id, day, from, to, o = {}) => ({ id, state: "planned", plannedStart: at(day, from), plannedEnd: at(day, to), rooms: ["twitch", "ytLandscape", "ytVertical"], minCrew: need, plannedGames: [{ gameId: "g" }], crew: crew, ...o });
const good = mk("good", "2026-10-26", "19:00", "22:00");
assert.deepEqual(L.publishWarnings([good], TZ), []);
const noGames = mk("ng", "2026-10-27", "19:00", "22:00", { plannedGames: [] });
const noCrew = mk("nc", "2026-10-28", "19:00", "22:00", { crew: null });
const clash = mk("cl", "2026-10-26", "21:00", "23:00");
const warns = L.publishWarnings([good, noGames, noCrew, clash, mk("cx", "2026-10-26", "20:00", "21:00", { state: "cancelled", crew: null })], TZ);
assert.deepEqual(warns.map((w) => [w.streamId, w.kind]), [["ng", "noGames"], ["nc", "minCrew"], ["good", "overlap"]]);
assert.ok(warns[1].text.includes("Captain") && warns[1].text.includes("youtube"));
assert.ok(warns[2].text.includes("overlaps"));
assert.deepEqual(L.weekCounts([good, noGames, noCrew, mk("cx", "2026-10-26", "20:00", "21:00", { state: "cancelled" })], 12), { slots: 3, seatsOpen: 2, votes: 12 });
assert.deepEqual(L.weekCounts([], 0), { slots: 0, seatsOpen: 0, votes: 0 });

// ---------- delay and cancel ----------
assert.equal(L.canDelayOrCancel({ isOwner: true }), true);
assert.equal(L.canDelayOrCancel({ isAdmin: true, track: "admin", adminGrade: 2 }), true);
assert.equal(L.canDelayOrCancel({ isAdmin: true, track: "admin", adminGrade: 3 }), true);
assert.equal(L.canDelayOrCancel({ isAdmin: true, track: "admin", adminGrade: 1 }), false);       // A1 Steward: no
assert.equal(L.canDelayOrCancel({ isAdmin: true }), false);
assert.equal(L.canDelayOrCancel({ isMod: true, track: "mod", adminGrade: 4 }), false);
assert.equal(L.canDelayOrCancel(null), false);
const base = { id: "s1", state: "scheduled", plannedStart: at("2026-10-28", "19:00"), plannedEnd: at("2026-10-28", "22:00") };
const other = { id: "s2", state: "scheduled", plannedStart: at("2026-10-28", "22:00"), plannedEnd: at("2026-10-28", "23:30") };
// Delay: same length by default; the first times are kept; the count goes up.
let d1 = L.planDelay(base, { startMs: at("2026-10-28", "21:00"), reason: "Tech problems", atMs: NOW, by: "boss" }, []);
assert.equal(d1.ok, true);
assert.equal(d1.patch.plannedStart, at("2026-10-28", "21:00")); assert.equal(d1.patch.plannedEnd, at("2026-10-29", "00:00"));
assert.deepEqual(d1.patch.delay, { originalStart: base.plannedStart, originalEnd: base.plannedEnd, count: 1, reason: "Tech problems", atMs: NOW, by: "boss" });
const again = L.planDelay({ ...base, ...d1.patch }, { startMs: at("2026-10-28", "21:30"), endMs: at("2026-10-29", "00:30"), atMs: NOW + 1, by: "boss" }, []);
assert.equal(again.ok, true); assert.equal(again.patch.delay.count, 2);
assert.equal(again.patch.delay.originalStart, base.plannedStart);                                // originalStart stays the first time
assert.equal(again.patch.delay.reason, undefined);
assert.equal(L.planDelay(base, { startMs: at("2026-10-28", "21:00"), atMs: NOW, by: "b" }, [other]).reason, "overlap");   // the move would run into s2
assert.equal(L.planDelay(base, { startMs: at("2026-10-28", "21:00"), atMs: NOW, by: "b" }, [other]).with, "s2");
assert.equal(L.planDelay(base, { startMs: at("2026-10-28", "21:00"), atMs: NOW, by: "b" }, [{ ...other, state: "cancelled" }]).ok, true);   // a cancelled neighbour doesn't block
assert.equal(L.planDelay(base, { startMs: at("2026-10-28", "19:00"), atMs: NOW, by: "b" }, []).reason, "noChange");
assert.equal(L.planDelay(base, { startMs: at("2026-10-28", "21:00"), endMs: at("2026-10-28", "20:00"), atMs: NOW, by: "b" }, []).reason, "endBeforeStart");
assert.equal(L.planDelay(base, { atMs: NOW, by: "b" }, []).reason, "noStart");
assert.equal(L.planDelay({ ...base, state: "live", actualStart: NOW }, { startMs: NOW + H, atMs: NOW, by: "b" }, []).reason, "badState");
assert.equal(L.planDelay({ ...base, actualStart: NOW }, { startMs: NOW + H, atMs: NOW, by: "b" }, []).reason, "started");
assert.equal(L.planDelay({ ...base, state: "ended" }, { startMs: NOW + H, atMs: NOW, by: "b" }, []).reason, "badState");
assert.equal(L.planDelay({ ...base, state: "cancelled" }, { startMs: NOW + H, atMs: NOW, by: "b" }, []).reason, "badState");
assert.equal(L.planDelay({ ...base, state: "planned" }, { startMs: at("2026-10-28", "20:00"), atMs: NOW, by: "b" }, []).ok, true);
// Cancel: only before the start, through the stream transitions.
const c1 = L.planCancel(base, { reason: "Sick", atMs: NOW, by: "boss" });
assert.deepEqual(c1, { ok: true, patch: { state: "cancelled", cancel: { reason: "Sick", atMs: NOW, by: "boss" } } });
assert.equal(L.planCancel({ ...base, state: "planned" }, { atMs: NOW, by: "b" }).ok, true);
assert.equal(L.planCancel({ ...base, state: "live", actualStart: NOW }, { atMs: NOW, by: "b" }).reason, "badState");
assert.equal(L.planCancel({ ...base, actualStart: NOW }, { atMs: NOW, by: "b" }).reason, "started");
assert.equal(L.planCancel({ ...base, state: "cancelled" }, { atMs: NOW, by: "b" }).reason, "badState");
assert.equal(L.planCancel({ ...base, state: "ended" }, { atMs: NOW, by: "b" }).reason, "badState");
assert.equal(L.planCancel(base, { atMs: NOW, by: "b" }).patch.cancel.reason, undefined);

// ---------- reminders and summaries ----------
const start = at("2026-10-28", "19:00");
assert.equal(L.reminderDue(start, start - 25 * H), null);
assert.equal(L.reminderDue(start, start - 24 * H), "24h");
assert.equal(L.reminderDue(start, start - 5 * H), "24h");
assert.equal(L.reminderDue(start, start - 61 * 60000), "24h");
assert.equal(L.reminderDue(start, start - H), "1h");
assert.equal(L.reminderDue(start, start - 1), "1h");
assert.equal(L.reminderDue(start, start), null);                             // started
assert.equal(L.reminderDue(start, start + H), null);
assert.equal(L.delayedSummary({ plannedStart: at("2026-10-28", "21:00") }, at("2026-10-28", "15:00"), TZ), "Tonight's stream moved to 9:00 PM");
assert.equal(L.delayedSummary({ plannedStart: at("2026-10-30", "21:00") }, at("2026-10-28", "15:00"), TZ), "Fri's stream moved to 9:00 PM");
assert.equal(L.weekPublishedSummary(5), "Next week's schedule is up: 5 streams");
assert.equal(L.weekPublishedSummary(1), "Next week's schedule is up: 1 stream");

console.log("check-planner: logic ok");
