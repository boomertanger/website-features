#!/usr/bin/env node
// functions/scripts/check-rewards.js: checks for the Trophy Room's pure logic (lib/rewards/logic.js)
// and the starter catalog (functions/data/trophy-room-badges.json). No credentials needed.
//   npm run check      (or node scripts/check-rewards.js)
const assert = require("assert/strict");
const path = require("path");
const fs = require("fs");
const L = require("../lib/rewards/logic");

// ---------- levels: total XP for level L = 50 × L × (L − 1) ----------
assert.equal(L.xpForLevel(1), 0);
assert.equal(L.xpForLevel(2), 100);
assert.equal(L.xpForLevel(5), 1000);
assert.equal(L.xpForLevel(10), 4500);
assert.equal(L.xpForLevel(20), 19000);
assert.equal(L.xpForLevel(50), 122500);
assert.equal(L.levelForXp(0), 1);
assert.equal(L.levelForXp(99), 1);
assert.equal(L.levelForXp(100), 2);
assert.equal(L.levelForXp(999), 4);
assert.equal(L.levelForXp(1000), 5);
assert.equal(L.levelForXp(4499), 9);
assert.equal(L.levelForXp(4500), 10);
assert.equal(L.levelForXp(122500), 50);
assert.equal(L.levelForXp(-5), 1);
assert.equal(L.levelForXp("abc"), 1);
for (let x = 0; x < 200000; x += 977) {   // the level is always the largest L with xpForLevel(L) <= x
  const lv = L.levelForXp(x);
  assert.ok(L.xpForLevel(lv) <= x && L.xpForLevel(lv + 1) > x, `xp ${x}`);
}

// ---------- ranks ----------
assert.equal(L.rankFor(1), "Fresh Meat");
assert.equal(L.rankFor(4), "Fresh Meat");
assert.equal(L.rankFor(5), "Survivor");
assert.equal(L.rankFor(10), "Night Stalker");
assert.equal(L.rankFor(19), "Night Stalker");
assert.equal(L.rankFor(20), "Nightmare");
assert.equal(L.rankFor(35), "Dread Lord");
assert.equal(L.rankFor(50), "Boomer Legend");
assert.equal(L.rankFor(99), "Boomer Legend");
assert.deepEqual(L.progress(4600), { xp: 4600, level: 10, rank: "Night Stalker", levelXp: 4500, nextXp: 5500 });

// ---------- XP for badges and trophies ----------
assert.equal(L.badgeXp({ rarity: 3, xp: 50 }), 50);
assert.equal(L.badgeXp({ rarity: 4 }), 100);                                   // no xp field: by rarity
assert.equal(L.badgeXp({ rarity: 5, xp: 250, source: "support" }), 0);         // supporters: never XP
assert.equal(L.badgeXp({ rarity: 2, xp: 25, collection: "supporters" }), 0);
assert.equal(L.badgeXp(null), 0);
assert.deepEqual([1, 2, 3, 4, null].map(L.trophyXp), [150, 100, 75, 0, 0]);

// ---------- showcase ----------
assert.equal(L.showcaseLimit({}), 3);
assert.equal(L.showcaseLimit({ roles: ["mod"] }), 6);
assert.equal(L.showcaseLimit({ roles: ["admin"] }), 6);
assert.equal(L.showcaseLimit({ isOwner: true }), 6);
assert.equal(L.showcaseLimit({ roles: ["sub"], staging: true }), 6);           // staging-only stand-in for Sub Club
assert.equal(L.showcaseLimit({ roles: ["sub"], staging: false }), 3);
const held = new Set(["a", "b", "c", "d"]);
assert.deepEqual(L.checkShowcase(["a", "b"], { held, limit: 3 }), { ok: true, ids: ["a", "b"] });
assert.deepEqual(L.checkShowcase([], { held, limit: 3 }), { ok: true, ids: [] });
assert.equal(L.checkShowcase(["a", "b", "c", "d"], { held, limit: 3 }).reason, "tooMany");
assert.equal(L.checkShowcase(["a", "z"], { held, limit: 3 }).reason, "notHeld");
assert.equal(L.checkShowcase(["a", "a"], { held, limit: 3 }).reason, "duplicate");
assert.equal(L.checkShowcase("a", { held, limit: 3 }).reason, "args");
assert.equal(L.checkShowcase([1], { held, limit: 3 }).reason, "args");

// ---------- persona, reasons, awards ----------
assert.deepEqual(L.checkPersona("Gamer"), { ok: true, persona: "Gamer" });
assert.deepEqual(L.checkPersona(null), { ok: true, persona: null });
assert.equal(L.checkPersona("Liker").reason, "locked");
assert.equal(L.checkPersona("Gifter").reason, "locked");
assert.equal(L.checkPersona("Admin").reason, "args");
assert.equal(L.checkReason("short"), null);
assert.equal(L.checkReason("  Carried chat through   the blackout  "), "Carried chat through the blackout");
assert.equal(L.checkReason("x".repeat(301)), null);
assert.equal(L.checkReason(42), null);
const admin = { isOwner: false, isAdmin: true }, owner = { isOwner: true, isAdmin: true }, member = { isOwner: false, isAdmin: false };
assert.equal(L.canAward({ status: "active", awardableBy: "mod" }, admin), null);
assert.equal(L.canAward({ status: "active", awardableBy: "admin" }, admin), null);
assert.equal(L.canAward({ status: "active", awardableBy: "owner" }, admin), "ownerOnly");
assert.equal(L.canAward({ status: "active", awardableBy: "owner" }, owner), null);
assert.equal(L.canAward({ status: "active", awardableBy: null }, owner), "notAwardable");
assert.equal(L.canAward({ status: "buried", awardableBy: "mod" }, owner), "notActive");
assert.equal(L.canAward({ status: "active", awardableBy: "mod" }, member), "notAdmin");

// ---------- ledger keys, windows, membership ----------
assert.equal(L.ledgerKey("arcade", "splat-finisher", "u1"), "arcade:splat-finisher:u1");
assert.equal(L.ledgerKey("x", "a/b", "u1"), "x:a_b:u1");                       // never a path separator
const now = Date.UTC(2026, 9, 4);
assert.equal(L.badgeOpen({ status: "active", limited: null }, now), true);
assert.equal(L.badgeOpen({ status: "buried" }, now), false);
assert.equal(L.badgeOpen({ status: "active", limited: { opensAt: null, closesAt: now - 1 } }, now), false);
assert.equal(L.badgeOpen({ status: "active", limited: { opensAt: now + 1, closesAt: null } }, now), false);
assert.equal(L.badgeOpen({ status: "active", limited: { opensAt: null, closesAt: null } }, now), true);
assert.equal(L.memberDays(now - 400 * 86400000, now), 400);
const start = Date.UTC(2027, 0, 1);
assert.equal(L.isFounder(start + 5 * 86400000, start), true);
assert.equal(L.isFounder(start + 90 * 86400000, start), false);
assert.equal(L.isFounder(start - 1, start), false);
assert.equal(L.isFounder(start, null), false);                                  // off until founderStart is set

// ---------- the starter catalog ----------
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "trophy-room-badges.json"), "utf8"));
const ids = new Set();
const cols = new Set(data.collections.map((c) => c.id));
assert.equal(cols.size, 9, "nine collections");
for (const b of data.badges) {
  assert.ok(/^[a-z0-9-]+$/.test(b.id), `id ${b.id}`);
  assert.ok(!ids.has(b.id), `duplicate ${b.id}`); ids.add(b.id);
  assert.ok(cols.has(b.collection), `${b.id}: collection ${b.collection}`);
  assert.ok(Number.isInteger(b.rarity) && b.rarity >= 1 && b.rarity <= 5, `${b.id}: rarity`);
  assert.ok([null, "mod", "admin", "owner"].includes(b.awardableBy ?? null), `${b.id}: awardableBy`);
  assert.equal(L.badgeXp(b), b.source === "support" ? 0 : L.XP_BY_RARITY[b.rarity], `${b.id}: xp matches its rarity`);
  if (b.crewOnly) assert.equal(b.collection, "crew", `${b.id}: crew-only badges live in Crew`);
}
// Boomer's Blessing is given by Boomertanger only: owner-only, so awardBadge refuses admins (canAward "ownerOnly").
const blessing = data.badges.find((b) => b.id === "boomer-s-blessing");
assert.equal(blessing?.awardableBy, "owner", "Boomer's Blessing is owner only");
assert.equal(L.canAward(blessing, { isOwner: false, isAdmin: true }), "ownerOnly");
assert.equal(L.canAward(blessing, { isOwner: true, isAdmin: true }), null);
for (const id of ["splat-finisher", "top-10", "multistream-nomad", "pilgrim", "elder", "founder", "bug-finder", "architect"]) assert.ok(ids.has(id), `catalog has ${id}`);

// ---------- the site's mirror (site/src/lib/rewards.js) gives the same answers ----------
import(require("url").pathToFileURL(path.join(__dirname, "../../site/src/lib/rewards.js")).href).then((S) => {
  for (const k of ["XP_BY_RARITY", "RANKS", "PERSONAS", "LOCKED_PERSONAS", "SHOWCASE"]) assert.deepEqual(S[k], L[k], `site mirror: ${k}`);
  for (let xp = 0; xp <= 130000; xp += 37) assert.deepEqual(S.progress(xp), L.progress(xp), `site mirror: progress(${xp})`);
  for (let lv = 1; lv <= 60; lv++) { assert.equal(S.xpForLevel(lv), L.xpForLevel(lv)); assert.equal(S.rankFor(lv), L.rankFor(lv)); }
  for (const b of data.badges) assert.equal(S.badgeXp(b), L.badgeXp(b), `site mirror: badgeXp(${b.id})`);
  for (const roles of [[], ["mod"], ["admin"], ["sub"]]) for (const staging of [false, true]) assert.equal(S.showcaseLimit({ roles, staging }), L.showcaseLimit({ roles, staging }), "site mirror: showcaseLimit");
  console.log("check-rewards: ok");
}).catch((e) => { console.error(e); process.exit(1); });
