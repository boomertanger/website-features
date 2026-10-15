#!/usr/bin/env node
// functions/scripts/check-pulse.js: checks for Traffic Pulse (lib/pulse; docs/specs/traffic-pulse.md). No network.
// The core: batch cleaning (caps, unknown events, personal data never kept), hosts, bots, the rollup tally, the focus engine, the join path,
// the usual baseline and goal pace; then the wiring: lib/pulse never loads rewards/grant.js, and the six functions are exported.   npm run check
const assert = require("assert/strict");
const path = require("path");
const C = require("../lib/pulse/core");

// ---- the beacon's batches
const b = C.cleanBatch({ in: true, st: 0, u: "abcdefghijklmnop", ev: [
  { e: "view", s: "game-vault", p: "/games", live: "public", dev: "phone", ref: "Twitch.tv", tag: "dom-live", sec: "hero", ip: "1.2.3.4", email: "x@y.z" },
  { e: "scroll", s: "game-vault", p: "/games", d: 50 }, { e: "scroll", s: "game-vault", p: "/games", d: 33 },
  { e: "cta", s: "game-vault", p: "/games", id: "Vote-Play-This" }, { e: "error", s: "game-vault", p: "/games", m: "TypeError at https://staging.boomertanger.com/x.js?token=secret line 4 " + "y".repeat(200) },
  { e: "hack", s: "x" }, { e: "view", s: "BAD SERVICE", p: "/games?q=1" },
] });
assert.equal(b.in, true); assert.equal(b.u, "abcdefghijklmnop");
assert.equal(b.ev.length, 5, "unknown events and bad scroll depths are dropped");
assert.deepEqual(Object.keys(b.ev[0]).sort(), ["dev", "e", "live", "p", "ref", "s", "sec", "tag"], "a view keeps only its known fields (no ip, no email)");
assert.equal(b.ev[0].ref, "twitch.tv");
assert.equal(b.ev[2].id, "vote-play-this");
assert.ok(!b.ev[3].m.includes("token=") && b.ev[3].m.length <= 120, "error messages lose query strings and are trimmed to 120");
assert.equal(b.ev[4].s, "unassigned"); assert.equal(b.ev[4].p, "/", "a path with a query string is not kept");
assert.equal(C.cleanBatch({ ev: [] }), null);
assert.equal(C.cleanBatch({ ev: Array.from({ length: 50 }, () => ({ e: "engaged", s: "home", p: "/" })) }).ev.length, 30, "30 events per batch at most");
assert.equal(C.cleanBatch({ u: "x", ev: [{ e: "engaged", s: "home", p: "/" }] }).u, null, "a malformed uid is dropped");
assert.ok(C.hostAllowed("boomertanger.com", false) && !C.hostAllowed("staging.boomertanger.com", false), "production counts boomertanger.com only");
assert.ok(C.hostAllowed("staging.boomertanger.com", true) && C.hostAllowed("abc.boomertanger-site.pages.dev", true) && !C.hostAllowed("evil.com", true));
assert.ok(C.isBot("Mozilla/5.0 (compatible; Googlebot/2.1)") && C.isBot("HeadlessChrome") && C.isBot("") && !C.isBot("Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36"));

// ---- Los Angeles dates
assert.equal(C.laParts(Date.UTC(2026, 9, 15, 6, 30)).day, "2026-10-14", "06:30 UTC is still the day before in Los Angeles");
assert.equal(C.laParts(Date.UTC(2026, 9, 15, 6, 30)).hh, "23");

// ---- the rollup tally
const t = C.tally([
  { day: "2026-10-14", hh: "20", mm: "05", in: true, ev: [
    { e: "view", s: "live", p: "/live", live: "public", dev: "phone", ref: "twitch.tv", tag: "dom-live", uv: true, us: true, um: true, mr: true },
    { e: "engaged", s: "live", p: "/live" }, { e: "scroll", s: "live", p: "/live", d: 75 }, { e: "cta", s: "live", p: "/live", id: "join-open" },
    { e: "cta", s: "live", p: "/live", id: "out:twitch.tv" }, { e: "error", s: "live", p: "/live", m: "boom" }] },
  { day: "2026-10-14", hh: "20", mm: "10", in: false, ev: [{ e: "view", s: "live", p: "/live", live: "off", dev: "desktop", uv: false, us: false }] },
]);
const d = t.days["2026-10-14"], s = t.services.live["2026-10-14"];
assert.deepEqual([d.views, d.uniques, d.engaged, d.errors, d.signedIn, d.members, d.memberReturns, d.joinOpens], [2, 1, 1, 1, 1, 1, 1, 1]);
assert.deepEqual([s.views, s.uniques, s.live, d.hours["20"], d.live.views], [2, 1, 1, 2, 1]);
assert.equal(d.ctas["out:twitch_tv"], 1, "field keys never carry dots");
assert.equal(t.sources["2026-10-14"].platforms.twitch, 1);
assert.equal(d.hourRefs["20"].twitch, 1);
assert.equal(d.liveMinutes["2005"], 1);
assert.equal(Object.values(t.paths)[0]["2026-10-14"].views, 2);

// ---- the focus engine
const sc = C.vitals({
  big: { views: 4000, prevViews: 3000, engaged: 2600 }, leaky: { views: 3000, prevViews: 3000, engaged: 900 },
  gem: { views: 300, engaged: 240 }, quiet: { views: 120, engaged: 30 }, tiny: { views: 20, engaged: 18 },
}, { utility: new Set(["quiet"]) });
const g = Object.fromEntries(sc.map((x) => [x.id, x]));
assert.deepEqual([g.big.group, g.leaky.group, g.gem.group, g.quiet.group, g.tiny.group], ["expand", "fix", "spotlight", "rethink", null]);
assert.equal(g.tiny.score, null, "under 50 views: not enough visits to judge yet");
assert.equal(g.quiet.utility, true);
assert.ok(sc.every((x) => x.score == null || (x.score >= 0 && x.score <= 100)));
const jp = C.joinPath({ visited: 1000, opened: 120, started: 60, accounts: 50, returned: 20 });
assert.equal(jp.weakest.key, "opened", "the biggest drop is from Visited to Opened Join");
const mv = C.moves(sc, { join: jp });
assert.ok(mv.length <= 5 && mv.length >= 2);
assert.ok(mv.some((m) => m.id === "fix-leaky") && mv.some((m) => m.id === "spot-gem"));
assert.ok(mv.every((m, i) => i === 0 || mv[i - 1].weight >= m.weight), "moves are ranked by traffic times the gap");
assert.ok(mv.every((m) => m.impact >= 1 && m.impact <= 4));

// ---- the baseline and goals
assert.equal(C.usual([10, 30, 20, undefined]), 20);
assert.equal(C.goalPace({ kind: "visitors", target: 1000 }, 600, 15, 30).state, "ahead");
assert.equal(C.goalPace({ kind: "visitors", target: 1000 }, 300, 15, 30).state, "behind");
assert.equal(C.goalPace({ kind: "visitors", target: 1000 }, 500, 15, 30).state, "on");

// ---- wiring: lib/pulse never loads rewards/grant.js; the six functions exist
for (const k of Object.keys(require.cache)) delete require.cache[k];
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp({ projectId: "demo-pulse-check" });
const P = require("../lib/pulse");
const fns = P.build({ adminLogEntry: async () => ({}) }).functions;
assert.ok(!Object.keys(require.cache).some((k) => /rewards[\\/]grant\.js$/.test(k)), "lib/pulse must not load rewards/grant.js");
assert.deepEqual(Object.keys(fns).sort(), ["pulseAdmin", "pulseBeacon", "pulseCfPull", "pulseDaily", "pulseReport", "pulseRollup"]);
assert.ok(path.basename(__filename));
console.log("check-pulse: ok");
