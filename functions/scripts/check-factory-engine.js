#!/usr/bin/env node
// functions/scripts/check-factory-engine.js: runs the Fun Factory engine (lib/factory/record.js)
// against an in-memory Firestore (scripts/fixtures/fake-firestore.js) and a recording stand-in for
// the Trophy Room's grants. Counting, periods, parameters, audiences, the daily cap, campaign
// bonuses, standings (never admins), distinct visits, duplicate events, and check-in streaks with
// savers, badges and the nightly sweep. No credentials needed.
//   npm run check      (or node scripts/check-factory-engine.js)
const assert = require("assert/strict");
const admin = require("firebase-admin");
const { makeDb } = require("./fixtures/fake-firestore");
const { makeFactory } = require("../lib/factory/record");
const { makeStreaks } = require("../lib/factory/streaks");

const T = admin.firestore.Timestamp;
const day = 86400000;
let NOW = Date.parse("2026-10-07T15:00:00Z");   // a Wednesday, 10:00 Central
const realNow = Date.now;
Date.now = () => NOW;

async function main() {
  const db = makeDb();
  const ledger = new Set();
  const paid = [];
  const grant = {
    async grantXp(uid, amount, { feature, ref }) {
      const k = `${feature}:${ref}:${uid}`;
      if (ledger.has(k) || !(amount > 0)) return { granted: false, reason: ledger.has(k) ? "paid" : "noXp" };
      ledger.add(k); paid.push({ uid, amount, ref }); return { granted: true };
    },
    async grantBadge(uid, badgeId, { feature, ref }) {
      const k = `${feature}:${ref}:${uid}`;
      if (ledger.has(k)) return { granted: false, reason: "paid" };
      ledger.add(k); paid.push({ uid, badgeId, ref }); return { granted: true };
    },
  };
  const F = makeFactory({ db, grant });
  const root = "sites/boomertanger/factory/main";
  const S = `${root}/seasons/s00`;
  const put = (p, d) => db.doc(p).set(d);

  // Members: a fan, a mod, an admin; all signed up.
  await put("sites/boomertanger", { ownerUid: "boss" });
  for (const [uid, roles] of [["fan", []], ["mod", ["mod"]], ["adm", ["admin"]]]) {
    await put(`sites/boomertanger/profiles/${uid}`, { handle: uid, displayName: uid.toUpperCase() });
    await put(`sites/boomertanger/members/${uid}`, { roles });
  }
  // No live season yet: nothing counts.
  assert.equal((await F.recordFactoryEvent("fan", "checkin", {}, "x")).reason, "noSeason");

  await put(S, { name: "Season 00", status: "live", revealed: true, startsAt: T.fromMillis(NOW - 3 * day), endsAt: T.fromMillis(NOW + 10 * day), dailyXpCap: 200 });
  const camp = (id, d) => put(`${S}/campaigns/${id}`, { revealed: true, opensAt: T.fromMillis(NOW - 3 * day), closesAt: null, audience: "all", ...d });
  const act = (id, d) => put(`${S}/activities/${id}`, { revealed: true, repeat: "none", target: 1, params: {}, ...d });
  await camp("daily", { cadence: "daily", bonus: { xp: 20 } });
  await act("play", { campaignId: "daily", typeId: "arcade", params: { action: "play" }, repeat: "daily", xp: 15 });
  await act("clock", { campaignId: "daily", typeId: "checkin", repeat: "daily", xp: 10 });
  await camp("weekly", { cadence: "weekly" });
  await act("splat", { campaignId: "weekly", typeId: "arcade", params: { action: "finish", gameId: "tapTheSplat" }, repeat: "weekly", target: 3, xp: 60 });
  await camp("story", { cadence: "story" });
  await act("tour", { campaignId: "story", typeId: "visit", target: 3, xp: 100 });
  await camp("crew", { cadence: "story", audience: "crew" });
  await act("crewjob", { campaignId: "crew", typeId: "checkin", xp: 50 });
  await camp("later", { cadence: "event", opensAt: T.fromMillis(NOW + day), revealed: false });
  await act("later1", { campaignId: "later", typeId: "checkin", xp: 999, revealed: false });
  await camp("big", { cadence: "milestone" });
  await act("bigxp", { campaignId: "big", typeId: "badges", params: { rarity: 5 }, xp: 500 });
  F.dropCache();   // the engine keeps the live season for a minute; this one just went live

  // A play counts for the daily activity; the same event again doesn't.
  let r = await F.recordFactoryEvent("fan", "arcade", { action: "play", gameId: "tapTheSplat" }, "play-run1");
  assert.deepEqual(r.completed, ["play"]);
  assert.deepEqual((await F.recordFactoryEvent("fan", "arcade", { action: "play", gameId: "tapTheSplat" }, "play-run1")).reason, "duplicate");
  // The second play of the day: the daily is already done.
  r = await F.recordFactoryEvent("fan", "arcade", { action: "play" }, "play-run2");
  assert.deepEqual(r.completed, []);
  // Finishing counts for the weekly (parameters match), not for the daily play (action differs).
  for (const run of ["a", "b"]) assert.deepEqual((await F.recordFactoryEvent("fan", "arcade", { action: "finish", gameId: "tapTheSplat" }, `finish-${run}`)).completed, []);
  assert.equal((await F.recordFactoryEvent("fan", "arcade", { action: "finish", gameId: "otherGame" }, "finish-x")).reason, "noActivity");
  assert.deepEqual((await F.recordFactoryEvent("fan", "arcade", { action: "finish", gameId: "tapTheSplat" }, "finish-c")).completed, ["splat"]);
  // Check-in: completes the daily clock-in, which completes the Daily campaign (bonus). The crew job
  // isn't for fans, and the later campaign isn't revealed.
  r = await F.recordFactoryEvent("fan", "checkin", {}, "2026-10-07");
  assert.deepEqual(r.completed, ["clock"]);
  assert.deepEqual(r.bonuses, ["daily"]);
  // Paid: 15 + 60 + 10 + 20 bonus = 105 (under the 200 cap), with the right ledger refs.
  const fanPaid = paid.filter((p) => p.uid === "fan");
  assert.deepEqual(fanPaid.map((p) => [p.ref, p.amount]), [["play:2026-10-07", 15], ["splat:2026-W41", 60], ["clock:2026-10-07", 10], ["bonus:daily:2026-10-07", 20]]);
  let st = (await db.doc(`${S}/standings/fan`).get()).data();
  assert.deepEqual([st.seasonXp, st.tier, st.handle], [105, "fan", "fan"]);

  // Visits count different sections only.
  for (const [p, k] of [["/games", "a"], ["/games", "b"], ["/arcade", "c"]]) assert.deepEqual((await F.recordFactoryEvent("fan", "visit", { path: p }, k)).completed, []);
  r = await F.recordFactoryEvent("fan", "visit", { path: "/trophies" }, "d");
  assert.deepEqual(r.completed, ["tour"]);
  // The daily cap: 105 + 100 = 205 would pass 200, so the tour paid 95.
  assert.deepEqual(paid.filter((p) => p.uid === "fan").pop(), { uid: "fan", amount: 95, ref: "tour:all" });
  // A Legendary badge after the cap is reached pays nothing more today (the completion still counts).
  r = await F.recordFactoryEvent("fan", "badges", { action: "earn", rarity: 5, collection: "loyalty" }, "badge-x");
  assert.deepEqual(r.completed, ["bigxp"]);
  assert.equal(paid.filter((p) => p.uid === "fan" && p.ref === "bigxp:all").length, 0);
  st = (await db.doc(`${S}/standings/fan`).get()).data();
  assert.equal(st.seasonXp, 200);

  // Next day: dailies reset, the cap resets, the weekly stays done.
  NOW += day;
  F.dropCache();
  r = await F.recordFactoryEvent("fan", "arcade", { action: "play" }, "play-run3");
  assert.deepEqual(r.completed, ["play"]);
  assert.equal(paid.filter((p) => p.uid === "fan").pop().ref, "play:2026-10-08");
  assert.deepEqual((await F.recordFactoryEvent("fan", "arcade", { action: "finish", gameId: "tapTheSplat" }, "finish-d")).completed, []);

  // A mod gets the crew job; an admin earns XP but is never on the standings.
  r = await F.recordFactoryEvent("mod", "checkin", {}, "2026-10-08");
  assert.deepEqual(r.completed.sort(), ["clock", "crewjob"]);
  assert.equal((await db.doc(`${S}/standings/mod`).get()).data().tier, "crew");
  r = await F.recordFactoryEvent("adm", "checkin", {}, "2026-10-08");
  assert.deepEqual(r.completed.sort(), ["clock", "crewjob"]);
  assert.ok(paid.some((p) => p.uid === "adm" && p.ref === "crewjob:all"));
  assert.equal((await db.doc(`${S}/standings/adm`).get()).exists, false);
  // Someone who never signed up counts for nothing.
  assert.equal((await F.recordFactoryEvent("ghost", "checkin", {}, "2026-10-08")).reason, "noProfile");

  // Every event is stored once, with a 120-day TTL unless kept.
  const ev = (await db.doc(`${root}/events/arcade:play-run1:fan`).get()).data();
  assert.equal(ev.expireAt.toMillis() - ev.at.toMillis(), 120 * day);
  await F.recordFactoryEvent("fan", "vault", { action: "want", slug: "visage" }, "want-visage", { keep: true });
  assert.equal((await db.doc(`${root}/events/vault:want-visage:fan`).get()).get("expireAt"), undefined);

  // An ended season does nothing.
  NOW += 20 * day;
  F.dropCache();
  assert.equal((await F.recordFactoryEvent("fan", "checkin", {}, "late")).reason, "noSeason");
  // ---------- streaks (§13a): no season needed, never reset with the season ----------
  const K = makeStreaks({ db, grant });
  const fanWho = { roles: [] };
  const start = Date.parse("2026-11-01T15:00:00Z");   // through the fall-back weekend
  let out;
  for (let d = 0; d < 7; d++) out = await K.checkIn("fan", fanWho, start + d * day);
  assert.deepEqual([out.current, out.savers, out.earnedSaver], [7, 1, true]);
  assert.ok(paid.some((p) => p.uid === "fan" && p.badgeId === "streak-day-3") && paid.some((p) => p.badgeId === "streak-day-7"));
  assert.equal((await K.checkIn("fan", fanWho, start + 6 * day + 3600e3)).already, true);   // twice in a day: once
  // Missed day 8: the 00:10 sweep on day 9 spends the saver; day 9's check-in carries on.
  let sw = await K.sweep(start + 8 * day);
  assert.deepEqual([sw.checked, sw.kept, sw.broke], [1, 1, 0]);
  let doc = (await db.doc(`${root}/streaks/fan`).get()).data();
  assert.deepEqual([doc.current, doc.savers, doc.lastDay], [7, 0, "2026-11-08"]);
  out = await K.checkIn("fan", fanWho, start + 8 * day);
  assert.deepEqual([out.current, out.best], [8, 8]);
  // Missed two days with no savers: the sweep breaks it; the next check-in starts again at 1.
  sw = await K.sweep(start + 11 * day);
  assert.equal(sw.broke, 1);
  doc = (await db.doc(`${root}/streaks/fan`).get()).data();
  assert.deepEqual([doc.current, doc.best, doc.lastDay], [0, 8, null]);
  assert.equal((await K.sweep(start + 12 * day)).checked, 0);   // broken streaks drop out of the sweep
  out = await K.checkIn("fan", fanWho, start + 12 * day);
  assert.deepEqual([out.current, out.best], [1, 8]);
  // Sub Club and crew hold 3 savers.
  for (let d = 0; d < 21; d++) out = await K.checkIn("mod", { roles: ["mod"] }, start + d * day);
  assert.deepEqual([out.current, out.savers, out.saversCap], [21, 3, 3]);

  console.log("check-factory-engine: ok");
}

main().then(() => { Date.now = realNow; }).catch((err) => { console.error(err); process.exit(1); });
