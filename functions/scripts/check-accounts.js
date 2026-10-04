#!/usr/bin/env node
// functions/scripts/check-accounts.js: quick checks for the pure account helpers
// (lib/accounts/validate.js), plus a load of the whole functions entry point so a
// syntax or wiring error shows up before a deploy. No credentials needed.
//   npm run check      (or node scripts/check-accounts.js)
const assert = require("assert/strict");
const v = require("../lib/accounts/validate");

const shape = (h) => v.handleShape(v.normalizeHandle(h));
assert.equal(shape("NightOwl"), "ok");
assert.equal(shape("@night_owl_13"), "ok");
assert.equal(shape("ab"), "invalid");
assert.equal(shape("a".repeat(21)), "invalid");
assert.equal(shape("night-owl"), "invalid");
assert.equal(shape("nïght"), "invalid");
for (const r of ["boomertanger", "boomer", "admin", "mod", "mods", "support", "staff", "official", "moderator", "system", "boomertanger_fan", "realboomertang"]) assert.equal(shape(r), "reserved", r);
for (const bad of ["shit99", "f_u_c_k", "xxbitchxx", "big_dick", "rape_fan"]) assert.equal(shape(bad), "reserved", bad);
for (const fine of ["grapefan", "peacock22", "torpedo", "classic_ass_mod_x".replace("_ass", ""), "badminton", "swanky", "cocktail_hour", "sussex"]) assert.equal(shape(fine), "ok", fine);

// Public role tag: the highest of admin > mod > sub > fan; the owner is admin.
assert.equal(v.roleTagFor([]), "fan");
assert.equal(v.roleTagFor(undefined), "fan");
assert.equal(v.roleTagFor(["sub"]), "sub");
assert.equal(v.roleTagFor(["mod", "sub"]), "mod");
assert.equal(v.roleTagFor(["mod", "admin"]), "admin");
assert.equal(v.roleTagFor(["vip"]), "fan");
assert.equal(v.roleTagFor([], { isOwner: true }), "admin");

assert.equal(v.cleanDisplayName("  Night   Owl "), "Night Owl");
assert.equal(v.cleanDisplayName(""), null);
assert.equal(v.cleanDisplayName("x".repeat(31)), null);
assert.equal(v.cleanDisplayName("<b>hi</b>"), null);
assert.equal(v.cleanDisplayName("Bad Shit"), null);

// Conservative age: the birthday counts as the LAST day of the birth month.
const at = (iso) => new Date(iso);
assert.equal(v.conservativeAge(2013, 3, at("2026-03-01T12:00:00Z")), 12);   // born Mar 2013: not 13 until Mar 31
assert.equal(v.conservativeAge(2013, 3, at("2026-03-31T12:00:00Z")), 12);   // still Mar 31 (end of day counts)
assert.equal(v.conservativeAge(2013, 3, at("2026-04-01T00:00:00Z")), 13);
assert.equal(v.conservativeAge(2013, 12, at("2026-12-31T23:00:00Z")), 12);
assert.equal(v.conservativeAge(2013, 12, at("2027-01-01T00:00:00Z")), 13);
assert.equal(v.conservativeAge(2013, 2, at("2028-02-29T12:00:00Z")), 14);    // leap year: Feb 29 is the last day
assert.equal(v.conservativeAge(1994, 3, at("2026-09-28T00:00:00Z")), 32);
assert.equal(v.ageBand(17), "13-17");
assert.equal(v.ageBand(18), "18+");
assert.equal(new Date(v.adultAtMs(2010, 3)).toISOString(), "2028-04-01T00:00:00.000Z");

assert.ok(v.validBirth(1994, 3, at("2026-09-28T00:00:00Z")));
assert.ok(!v.validBirth(2026, 10, at("2026-09-28T00:00:00Z")));   // the future
assert.ok(!v.validBirth(1899, 1));
assert.ok(!v.validBirth(1994, 13));
assert.ok(!v.validBirth("1994", 3));

assert.equal(v.initialsOf("Night Owl"), "NI");
assert.equal(v.initialsOf("🦇"), "?");
// The functions entry point loads and exports every callable and trigger.
process.env.GCLOUD_PROJECT ||= "boomertanger-staging";
process.env.FIREBASE_CONFIG ||= JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
const fns = require("../index.js");
for (const name of ["checkHandle", "completeSignup", "abandonSignup", "changeHandle", "updateProfile", "updatePrefs", "twitchAuth", "unlinkPlatform", "signOutEverywhere", "setMemberRole", "mirrorMemberRoles", "syncAdminStatus", "adminEditItem"]) {
  assert.ok(fns[name], `missing export ${name}`);
}
console.log("accounts checks passed");
