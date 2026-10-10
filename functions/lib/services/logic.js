// Service Hub, the pure rules (docs/specs/service-hub.md §3-§9). No Firestore here: index.js reads and writes, these decide.
// Checked by scripts/check-services-fn.js.
//
//   popularity(r)                 (2 × love + like − 2 × dislike) ÷ n, plus love % and dislike %; null score with no ratings
//   audienceOpen(audience, who)   is a service with this audience open to this person ({ member, staff, admin, owner })
//   isCore(item, who)             a "rate them all" service: feature, page, arcadeGame or streamSetup, live, not hidden, open to them
//   canRate(item, who, now)       live, not hidden, open to them; admin tools never; a stream only within 14 days of its end
//   compareVersions(a, b)         -1 / 0 / 1 on "1.0" < "1.1" < "2" (a leading "v" is ignored)
//   videoState(video, version)    none · current (the video covers this version or later) · stale
//   testState(mark, version)      none · current · old (an admin test mark against the service's version)
//   ratedEveryCore(coreIds, rated)    every core id open to them is in their rated map
//   coverage(item)                the percent of the coverage cells that are done (G2's lime cells)
//   validateRating / validateTest / normalizeManifest / planSync / badge ladders / rows
const VALUES = ["love", "like", "dislike"];
const TYPES = ["feature", "page", "arcadeGame", "vaultGame", "stream", "streamSetup", "video", "adminTool"];
const MANIFEST_TYPES = ["feature", "page", "arcadeGame", "streamSetup", "adminTool"];
const CORE_TYPES = ["feature", "page", "arcadeGame", "streamSetup"];
const STATUS = ["planned", "building", "live", "retired"];
const AUDIENCE = ["everyone", "members", "crew", "staff", "admins", "owner"];
const TALKBACK = ["note", "pins", "rate", "skip"];
const DEVICES = ["desktop", "phone"];
const ENVS = ["staging", "production"];
const DAY = 24 * 60 * 60 * 1000;
const STREAM_RATE_DAYS = 14;
const HISTORY_MAX = 20;
const COMMENT_MAX = 500, DISLIKE_MIN = 10, NOTE_MAX = 300;
const LIMITS = { rate: { perHour: 60, message: "That's a lot of ratings for one hour. Try again a little later." }, test: { perHour: 10, message: "That's a lot of tests for one hour. Try again a little later." } };
const SUMMARY_WARN_BYTES = 700 * 1024;

const refuse = (code, reason, message, field) => ({ ok: false, code, reason, message, ...(field ? { field } : {}) });
const num = (v) => (Number.isFinite(v) ? v : 0);
const str = (v) => (typeof v === "string" ? v.trim() : "");

// ---------------------------------------------------------------------------------------------- scores
function popularity(r = {}) {
  const love = num(r.love), like = num(r.like), dislike = num(r.dislike), n = love + like + dislike;
  if (!n) return { n: 0, score: null, lovePct: 0, dislikePct: 0 };
  return { n, score: Math.round(((2 * love + like - 2 * dislike) / n) * 100) / 100, lovePct: Math.round((love / n) * 100), dislikePct: Math.round((dislike / n) * 100) };
}

// ---------------------------------------------------------------------------------------------- who can use what
/** who: { member (finished signup), staff (mods and admins), admin, owner }. Crew is the staff for now (Night Watch can split it later). */
function audienceOpen(audience, who = {}) {
  if (who.owner) return true;
  switch (audience) {
    case "everyone": return true;
    case "members": return !!who.member || !!who.staff || !!who.admin;
    case "crew": case "staff": return !!who.staff || !!who.admin;
    case "admins": return !!who.admin;
    case "owner": return false;
    default: return false;
  }
}
const isCore = (item, who) => !!item && CORE_TYPES.includes(item.type) && item.status === "live" && item.hidden !== true && audienceOpen(item.audience, who);
function canRate(item, who, now = Date.now()) {
  if (!item || item.hidden === true || item.status !== "live") return refuse("failed-precondition", "notOpen", "That can't be rated right now.");
  if (item.type === "adminTool") return refuse("failed-precondition", "adminTool", "Admin tools aren't rated.");
  if (!audienceOpen(item.audience, who)) return refuse("permission-denied", "notOpen", "That service isn't open to you.");
  if (item.type === "stream") {
    const until = num(item.rateableUntil);
    if (!until || now > until) return refuse("failed-precondition", "streamClosed", `Streams can be rated for ${STREAM_RATE_DAYS} days after they end.`);
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------- versions, videos, tests
const parts = (v) => String(v ?? "").trim().replace(/^v/i, "").split(".").map((x) => parseInt(x, 10)).map((x) => (Number.isFinite(x) ? x : 0));
function compareVersions(a, b) {
  const A = parts(a), B = parts(b), n = Math.max(A.length, B.length);
  for (let i = 0; i < n; i++) { const d = (A[i] || 0) - (B[i] || 0); if (d) return d < 0 ? -1 : 1; }
  return 0;
}
/** "v1" (the Arcade's version ids) → "1.0"; "v1.2" → "1.2"; anything already like "1.0" stays. */
function normalizeVersion(v) {
  const p = parts(v);
  if (!String(v ?? "").trim()) return "1.0";
  return p.length === 1 ? `${p[0]}.0` : p.join(".");
}
function videoState(video, version) {
  if (!video || !video.id) return "none";
  return video.coversVersion != null && compareVersions(video.coversVersion, version) >= 0 ? "current" : "stale";
}
function testState(mark, version) {
  if (!mark || mark.version == null) return "none";
  return compareVersions(mark.version, version) === 0 ? "current" : "old";
}
const ratedEveryCore = (coreIds, rated = {}) => coreIds.length > 0 && coreIds.every((id) => !!rated[id]);

/** G2's cells for a service: which are done. Only cells that apply (a member-rated service) count. */
function coverageCells(item) {
  const rateable = item.type !== "adminTool";
  const cells = {
    rated: rateable ? num(item.ratings && item.ratings.n) > 0 : null,
    video: videoState(item.video, item.version) === "current",
    staging: testState(item.tests && item.tests.staging, item.version) === "current",
    production: testState(item.tests && item.tests.production, item.version) === "current",
    memberTests: rateable && Array.isArray(item.checks) && item.checks.length ? !!(item.communityTests && compareVersions(item.communityTests.version, item.version) === 0 && num(item.communityTests.pass) + num(item.communityTests.problems) > 0) : null,
  };
  return cells;
}
function coverage(item) {
  const vals = Object.values(coverageCells(item)).filter((v) => v !== null);
  return vals.length ? Math.round((vals.filter(Boolean).length / vals.length) * 100) : 0;
}

// ---------------------------------------------------------------------------------------------- input
function validateRating(data = {}) {
  if (!VALUES.includes(data.value)) return refuse("invalid-argument", "value", "Pick Not for me, Like it or Love it.", "value");
  if (data.comment != null && typeof data.comment !== "string") return refuse("invalid-argument", "comment", "The comment must be text.", "comment");
  const comment = str(data.comment);
  if (data.value === "dislike" && comment.length < DISLIKE_MIN) return refuse("invalid-argument", "commentNeeded", `Tell Boomer what's not working (at least ${DISLIKE_MIN} characters).`, "comment");
  if (comment.length > COMMENT_MAX) return refuse("invalid-argument", "comment", `Keep the comment under ${COMMENT_MAX} characters.`, "comment");
  return { ok: true, value: { value: data.value, comment } };
}
/** results[i] answers checks[i]: { ok: true } or { ok: false, note } (a problem needs a note). */
function validateTest(data = {}, checks = []) {
  if (!Array.isArray(checks) || checks.length < 3) return refuse("failed-precondition", "noChecks", "This service has no test checks yet.");
  if (!DEVICES.includes(data.device)) return refuse("invalid-argument", "device", "Say whether you tested on a phone or a desktop.", "device");
  const results = data.results;
  if (!Array.isArray(results) || results.length !== checks.length) return refuse("invalid-argument", "results", "Answer every check.", "results");
  const out = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i] || {};
    if (typeof r.ok !== "boolean") return refuse("invalid-argument", "results", "Mark every check OK or Problem.", "results");
    const note = str(r.note);
    if (!r.ok && !note) return refuse("invalid-argument", "noteNeeded", "Say what went wrong for each problem.", "results");
    if (note.length > NOTE_MAX) return refuse("invalid-argument", "note", `Keep each note under ${NOTE_MAX} characters.`, "results");
    out.push({ check: checks[i], ok: r.ok, note: r.ok ? "" : note });
  }
  return { ok: true, value: { device: data.device, results: out, problems: out.filter((r) => !r.ok).length } };
}
/** The rating's history: newest last, the last 20 kept. */
function pushHistory(history, entry) {
  const h = Array.isArray(history) ? history.slice() : [];
  h.push(entry);
  return h.slice(-HISTORY_MAX);
}
/** Totals from the countable ratings of one service: { love, like, dislike, n, comments, score, lovePct, dislikePct, byVersion }. */
function totalsOf(ratings) {
  const t = { love: 0, like: 0, dislike: 0, comments: 0, byVersion: {} };
  for (const r of ratings) {
    if (r.countable === false || !VALUES.includes(r.value)) continue;
    t[r.value]++;
    if (r.comment && r.hidden !== true) t.comments++;
    const v = String(r.version || "?").replace(/\./g, "_");
    (t.byVersion[v] ||= { love: 0, like: 0, dislike: 0 })[r.value]++;
  }
  return { ...t, ...popularity(t) };
}

// ---------------------------------------------------------------------------------------------- manifests and sync
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** A manifest from services/<id>.json, checked and trimmed to the fields an item keeps. */
function normalizeManifest(m) {
  if (!m || typeof m !== "object") return refuse("invalid-argument", "manifest", "A manifest must be an object.");
  const id = str(m.id);
  if (!KEBAB.test(id) || id.length > 80) return refuse("invalid-argument", "manifest", `Bad manifest id "${m.id}".`);
  if (!MANIFEST_TYPES.includes(m.type)) return refuse("invalid-argument", "manifest", `${id}: bad type.`);
  if (!STATUS.includes(m.status)) return refuse("invalid-argument", "manifest", `${id}: bad status.`);
  if (!AUDIENCE.includes(m.audience)) return refuse("invalid-argument", "manifest", `${id}: bad audience.`);
  if (!TALKBACK.includes(m.talkBack)) return refuse("invalid-argument", "manifest", `${id}: bad talkBack.`);
  for (const k of ["name", "area", "blurb", "version"]) if (!str(m[k])) return refuse("invalid-argument", "manifest", `${id}: ${k} is required.`);
  if (!Array.isArray(m.routes) || m.routes.some((r) => typeof r !== "string" || !r.startsWith("/"))) return refuse("invalid-argument", "manifest", `${id}: bad routes.`);
  const sections = m.sections && typeof m.sections === "object" && !Array.isArray(m.sections) ? Object.fromEntries(Object.entries(m.sections).filter(([k, v]) => KEBAB.test(k) && typeof v === "string").map(([k, v]) => [k, v.slice(0, 60)])) : {};
  return {
    ok: true,
    value: {
      id, name: str(m.name).slice(0, 80), type: m.type, area: str(m.area).slice(0, 40), blurb: str(m.blurb).slice(0, 200), version: str(m.version).slice(0, 20),
      status: m.status, audience: m.audience, routes: m.routes.slice(0, 30), nav: typeof m.nav === "string" ? m.nav : null, testPlan: typeof m.testPlan === "string" ? m.testPlan : null,
      checks: Array.isArray(m.checks) ? m.checks.filter((c) => typeof c === "string" && c.trim()).map((c) => c.trim().slice(0, 120)).slice(0, 8) : [],
      videoTag: `#bt-${id}`, sections, talkBack: m.talkBack, help: typeof m.help === "string" ? m.help : null,
    },
  };
}
/** "Needs setup" until a live service has its basics: a blurb and an area (spec §3). */
const needsSetup = (item) => item.status === "live" && (!str(item.blurb) || !str(item.area));

/**
 * What a sync does. existing: { id → item } (every item, any source); manifests: normalized. Returns { create[], update[], bump[], retire[], same[] }:
 * create: new ids; update: manifest fields changed (bump also when the version moved; an Arcade game keeps its own version); retire: manifest items
 * whose manifest is gone (never deleted; already-retired ones are left alone).
 */
const MANIFEST_FIELDS = ["name", "type", "area", "blurb", "status", "audience", "routes", "nav", "testPlan", "checks", "videoTag", "sections", "talkBack", "help"];
function planSync(existing, manifests) {
  const out = { create: [], update: [], bump: [], retire: [], same: [] };
  const seen = new Set();
  for (const m of manifests) {
    seen.add(m.id);
    const cur = existing[m.id];
    if (!cur) { out.create.push(m); continue; }
    const versionFromGame = cur.source && cur.source.arcade;   // an Arcade game's version is its currentVersion, not the manifest's
    const changed = MANIFEST_FIELDS.filter((k) => JSON.stringify(cur[k] ?? null) !== JSON.stringify(m[k] ?? null));
    const bumped = !versionFromGame && String(cur.version) !== String(m.version);
    if (bumped) out.bump.push({ id: m.id, from: cur.version, to: m.version, name: m.name, status: m.status });
    if (changed.length || bumped || (cur.source && cur.source.manifest !== true)) out.update.push({ ...m, ...(versionFromGame ? { version: cur.version } : {}), changed: bumped ? [...changed, "version"] : changed });
    else out.same.push(m.id);
  }
  for (const [id, cur] of Object.entries(existing)) {
    if (seen.has(id) || !cur.source || cur.source.manifest !== true || cur.status === "retired") continue;
    out.retire.push({ id, name: cur.name });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- rows
/** summary row: everything an admin view needs, without the history. */
function summaryRow(item) {
  const { versionHistory, ...rest } = item;
  return { ...rest, coverage: coverage(item), videoState: videoState(item.video, item.version), stagingTest: testState(item.tests && item.tests.staging, item.version), productionTest: testState(item.tests && item.tests.production, item.version) };
}
/** public/services row: member-safe (no counts, no feedback); admin tools, hidden and retired services are left out (null). */
function publicRow(item) {
  if (!item || item.type === "adminTool" || item.hidden === true || item.status === "retired") return null;
  return { id: item.id, name: item.name, type: item.type, area: item.area || "", blurb: item.blurb || "", link: (item.routes && item.routes[0]) || item.link || null, version: item.version, status: item.status, audience: item.audience, checks: Array.isArray(item.checks) ? item.checks.length : 0, ...(item.type === "stream" && item.rateableUntil ? { rateableUntil: item.rateableUntil } : {}) };
}

// ---------------------------------------------------------------------------------------------- badges (functions/data/trophy-room-badges.json, Community)
const RATING_LADDER = [[1, "services-first-rating"], [10, "services-rated-10"], [25, "services-rated-25"], [50, "services-rated-50"], [100, "services-rated-100"]];
const TESTER_LADDER = [[1, "services-tester-1"], [5, "services-tester-5"], [15, "services-tester-15"]];
const VAULT_LADDER = [[5, "vault-critic-5"], [15, "vault-critic-15"], [30, "vault-critic-30"]];
const FULL_COVERAGE = "services-full-coverage";
const reached = (ladder, n) => ladder.filter(([at]) => n >= at).map(([, id]) => id);
const ratingBadges = (n) => reached(RATING_LADDER, n);
const testerBadges = (n) => reached(TESTER_LADDER, n);
const vaultBadges = (n) => reached(VAULT_LADDER, n);
const BADGE_IDS = [...RATING_LADDER, ...TESTER_LADDER, ...VAULT_LADDER].map(([, id]) => id).concat(FULL_COVERAGE);

// ---------------------------------------------------------------------------------------------- rate limits
const periodKey = (_kind, at) => new Date(at).toISOString().slice(0, 13);   // the UTC hour
const overLimit = (kind, count) => count >= LIMITS[kind].perHour;
const limitTtlMs = () => 2 * 60 * 60 * 1000;
const skipsLimits = (c) => !!(c && (c.isOwner || c.isAdmin));

// ---------------------------------------------------------------------------------------------- links (§3a "Bugs and ideas")
/** The path in what someone typed or the page sent: "/arcade/x?y#z", "https://boomertanger.com/arcade/x", "boomertanger.com/arcade/x". Null for plain words. */
function pathOf(textIn) {
  const t = String(textIn || "").trim();
  if (!t) return null;
  let p = null;
  if (t.startsWith("/")) p = t;
  else {
    const m = /^(?:https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(\/[^\s]*)?$/i.exec(t);
    if (m) p = m[1] || "/";
  }
  if (!p) return null;
  p = p.split(/[?#]/)[0].replace(/\/{2,}/g, "/");
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return /\s/.test(p) ? null : p.toLowerCase();
}
const segs = (p) => p.split("/").filter(Boolean);
/** A manifest route against a path: exact, or a [slug] segment (and a route served for every /x/<slug> through _redirects, written /x/view) matching one segment. */
function routeMatches(route, path) {
  const r = segs(String(route).toLowerCase()), p = segs(path);
  if (r.length !== p.length) return false;
  return r.every((s, i) => s === p[i] || /^\[[^\]]+\]$/.test(s) || (s === "view" && i === r.length - 1 && i > 0));
}
/**
 * The service a path belongs to, from the items (retired ones left out): an exact route first; else the pattern with the most literal segments.
 * Null when nothing matches.
 */
function serviceForPath(pathIn, items) {
  const path = pathOf(pathIn);
  if (!path) return null;
  const live = (items || []).filter((it) => it && it.status !== "retired" && Array.isArray(it.routes));
  for (const it of live) if (it.routes.some((r) => String(r).toLowerCase() === path)) return it.id;
  let best = null, score = -1;
  for (const it of live) for (const r of it.routes) {
    if (!routeMatches(r, path)) continue;
    const s = segs(String(r)).filter((x) => !/^\[[^\]]+\]$/.test(x) && x !== "view").length;
    if (s > score) { best = it.id; score = s; }
  }
  return best;
}
const BUG_CLOSED = ["fixed", "wont_fix", "cant_reproduce", "duplicate"];
const IDEA_CLOSED = ["shipped", "declined"];
/** Open reports for a service (hidden ones still count: only staff see the number). */
const openBugs = (reports) => reports.filter((r) => !BUG_CLOSED.includes(r.status)).length;
const openIdeas = (ideas) => ideas.filter((i) => !IDEA_CLOSED.includes(i.status)).length;

module.exports = {
  VALUES, TYPES, MANIFEST_TYPES, CORE_TYPES, STATUS, AUDIENCE, TALKBACK, DEVICES, ENVS, DAY, STREAM_RATE_DAYS, HISTORY_MAX, COMMENT_MAX, DISLIKE_MIN, LIMITS, SUMMARY_WARN_BYTES,
  popularity, audienceOpen, isCore, canRate, compareVersions, normalizeVersion, videoState, testState, ratedEveryCore, coverageCells, coverage,
  validateRating, validateTest, pushHistory, totalsOf, normalizeManifest, needsSetup, planSync, MANIFEST_FIELDS, summaryRow, publicRow,
  RATING_LADDER, TESTER_LADDER, VAULT_LADDER, FULL_COVERAGE, BADGE_IDS, ratingBadges, testerBadges, vaultBadges,
  periodKey, overLimit, limitTtlMs, skipsLimits,
  pathOf, routeMatches, serviceForPath, BUG_CLOSED, IDEA_CLOSED, openBugs, openIdeas,
};
