// Goal Tracker rules that need no database (docs/specs/goal-tracker.md §2, §4, §8): the field limits and
// enums, validation, who counts as an income item, visibility inheritance, relaunch readiness, the key
// dates, and building the published snapshot and the teaser from the draft.
// Everything here is pure, so scripts/check-goal-tracker.js tests it without Firestore.

const SITE_ID = "boomertanger";
const TYPES = ["track", "goal", "milestone", "task"];
const PARENT_OF = { track: null, goal: "track", milestone: "goal", task: "milestone" };
const STATUSES = ["planned", "progress", "done", "dropped"];
const VISIBILITIES = ["public", "members", "private"];
const SIDES = ["site", "stream"];
const LIMITS = { title: 120, description: 600, help: 200, icon: 8, levelName: 40, levelWhen: 60, levelBlurb: 300, northStar: 120, story: 600, result: 200, label: 60, unit: 20, reason: 300 };
const MAX_ITEMS = 300;
const MAX_LEVELS = 8;
const MAX_METRICS = 30;
const MAX_WEEKS = 52;
const AUTO_KEYS = ["twitchFollowers", "youtubeSubscribers", "tiktokFollowers", "fanClubMembers"];
const STALE_DAYS = 7;
const DAY_MS = 86400000;

const clean = (s) => (typeof s === "string" ? s.replace(/[ \t]+/g, " ").trim() : null);

/** Error carrying the field it belongs to; the callable wraps it in an HttpsError. */
class Invalid extends Error {
  constructor(field, message, reason = "invalid") { super(message); this.field = field; this.reason = reason; }
}
const bad = (field, message, reason) => new Invalid(field, message, reason);

function text(field, value, max, { required = false, label = field } = {}) {
  if (value == null || value === "") { if (required) throw bad(field, `${label} is required.`); return ""; }
  if (typeof value !== "string") throw bad(field, `${label} must be text.`);
  const v = clean(value);
  if (required && !v) throw bad(field, `${label} is required.`);
  if (v.length > max) throw bad(field, `${label} can be at most ${max} characters.`);
  return v;
}

/** A calendar day as YYYY-MM-DD, or null. */
function day(field, value) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw bad(field, "Dates look like 2027-03-31.");
  const t = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== value) throw bad(field, "That date doesn't exist.");
  const y = Number(value.slice(0, 4));
  if (y < 2024 || y > 2100) throw bad(field, "Pick a date between 2024 and 2100.");
  return value;
}

/** A moment as milliseconds, or null. */
function moment(field, value) {
  if (value == null || value === "") return null;
  if (!Number.isFinite(value) || value < Date.parse("2024-01-01") || value > Date.parse("2101-01-01")) throw bad(field, "That date and time isn't valid.");
  return Math.round(value);
}

const oneOf = (field, value, list, label = field) => {
  if (!list.includes(value)) throw bad(field, `Pick a valid ${label}.`);
  return value;
};

function relaunch(value) {
  if (value == null) return { needed: false, weeks: 0, side: "site" };
  if (typeof value !== "object" || Array.isArray(value)) throw bad("relaunch", "Relaunch needs a flag, weeks and a side.");
  const needed = value.needed === true;
  const weeks = value.weeks == null ? 0 : value.weeks;
  if (!Number.isFinite(weeks) || weeks < 0 || weeks > MAX_WEEKS || Math.round(weeks * 2) !== weeks * 2) throw bad("relaunch", `Weeks is 0 to ${MAX_WEEKS}, in halves.`);
  return { needed, weeks, side: oneOf("relaunch", value.side || "site", SIDES, "side") };
}

/**
 * Validates the fields of an item. `type` is the item's type. `levels` is the set of level numbers.
 * Only the keys present in `fields` are returned (so an update can send just what changed);
 * `full` (create, seed) also fills every default.
 */
function itemFields(type, fields, { levels, full = false } = {}) {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) throw bad("changes", "Nothing to save.");
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(fields, k);
  const allowed = {
    track: ["title", "description", "icon", "visibility"],
    goal: ["title", "description", "help", "status", "startDate", "dueDate", "visibility", "relaunch", "metricId", "target"],
    milestone: ["title", "description", "help", "status", "startDate", "dueDate", "visibility", "relaunch", "level"],
    task: ["title", "description", "help", "status", "startDate", "dueDate", "visibility", "relaunch"],
  }[type];
  for (const k of Object.keys(fields)) if (!allowed.includes(k)) throw bad(k, `A ${type} has no "${k}".`, "badField");

  if (has("title") || full) out.title = text("title", fields.title, LIMITS.title, { required: true, label: "The title" });
  if (has("description") || full) out.description = text("description", fields.description, LIMITS.description, { label: "The description" });
  if (allowed.includes("help") && (has("help") || full)) out.help = text("help", fields.help, LIMITS.help, { label: "The help line" });
  if (allowed.includes("icon") && (has("icon") || full)) out.icon = text("icon", fields.icon, LIMITS.icon, { label: "The icon" });
  if (allowed.includes("status") && (has("status") || full)) out.status = oneOf("status", has("status") ? fields.status : "planned", STATUSES, "status");
  if (allowed.includes("startDate") && (has("startDate") || full)) out.startDate = day("startDate", fields.startDate);
  if (allowed.includes("dueDate") && (has("dueDate") || full)) out.dueDate = day("dueDate", fields.dueDate);
  if (has("visibility") || full) out.visibility = oneOf("visibility", has("visibility") ? fields.visibility : "members", VISIBILITIES, "visibility");
  if (allowed.includes("relaunch") && (has("relaunch") || full)) out.relaunch = relaunch(fields.relaunch);
  if (allowed.includes("level")) {
    if (has("level") || full) {
      if (!Number.isInteger(fields.level) || (levels && !levels.has(fields.level))) throw bad("level", "Pick one of the levels on the road.");
      out.level = fields.level;
    }
  }
  if (allowed.includes("metricId")) {
    if (has("metricId") || has("target") || full) {
      const metricId = fields.metricId || null, target = fields.target == null || fields.target === "" ? null : fields.target;
      if (metricId == null && target != null) throw bad("target", "A target needs a metric.");
      if (metricId != null && (typeof metricId !== "string" || !/^[A-Za-z0-9_-]{1,60}$/.test(metricId))) throw bad("metricId", "Pick a metric.");
      if (target != null && (!Number.isFinite(target) || target <= 0 || target > 1e9)) throw bad("target", "The target is a number above 0.");
      out.metricId = metricId; out.target = target;
    }
  }
  if (out.startDate && out.dueDate && out.startDate > out.dueDate) throw bad("dueDate", "The due date is before the start date.");
  return out;
}

function levelList(value) {
  if (!Array.isArray(value) || !value.length || value.length > MAX_LEVELS) throw bad("levels", `Between 1 and ${MAX_LEVELS} levels.`);
  const seen = new Set();
  const out = value.map((l, i) => {
    if (!l || typeof l !== "object") throw bad("levels", "A level needs a name.");
    if (!Number.isInteger(l.n) || l.n < 0 || l.n > 20 || seen.has(l.n)) throw bad("levels", "Level numbers are whole numbers and can't repeat.");
    seen.add(l.n);
    const lv = {
      n: l.n,
      name: text("levels", l.name, LIMITS.levelName, { required: true, label: "A level's name" }),
      when: text("levels", l.when, LIMITS.levelWhen, { label: "A level's timing" }),
      icon: text("levels", l.icon, LIMITS.icon, { label: "A level's icon" }),
      status: oneOf("levels", l.status || "planned", STATUSES, "level status"),
      blurb: text("levels", l.blurb, LIMITS.levelBlurb, { label: "A level's blurb" }),
    };
    if (l.boss === true) lv.boss = true;
    return lv;
  });
  const bosses = out.filter((l) => l.boss);
  if (bosses.length > 1 || (bosses.length === 1 && !out[out.length - 1].boss)) throw bad("levels", "Only the last level can be the final boss.");
  return out;
}

/** Validates a config patch. Returns only the keys present. */
function configFields(fields) {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) throw bad("changes", "Nothing to save.");
  const allowed = ["northStar", "story", "levels", "relaunchAt", "nomineesAt", "showAt", "result"];
  for (const k of Object.keys(fields)) if (!allowed.includes(k)) throw bad(k, `Settings have no "${k}".`, "badField");
  const out = {};
  if ("northStar" in fields) out.northStar = text("northStar", fields.northStar, LIMITS.northStar, { required: true, label: "The North Star" });
  if ("story" in fields) out.story = text("story", fields.story, LIMITS.story, { label: "The story" });
  if ("result" in fields) out.result = text("result", fields.result, LIMITS.result, { label: "The result line" });
  if ("levels" in fields) out.levels = levelList(fields.levels);
  for (const k of ["relaunchAt", "nomineesAt", "showAt"]) if (k in fields) out[k] = moment(k, fields[k]);
  return out;
}

function metricFields(fields, { full = false } = {}) {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) throw bad("changes", "Nothing to save.");
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(fields, k);
  for (const k of Object.keys(fields)) if (!["label", "unit", "visibility"].includes(k)) throw bad(k, `A metric has no "${k}".`, "badField");
  if (has("label") || full) out.label = text("label", fields.label, LIMITS.label, { required: true, label: "The label" });
  if (has("unit") || full) out.unit = text("unit", fields.unit, LIMITS.unit, { label: "The unit" });
  if (has("visibility") || full) out.visibility = oneOf("visibility", has("visibility") ? fields.visibility : "members", VISIBILITIES, "visibility");
  return out;
}

const metricValue = (v) => {
  if (!Number.isFinite(v) || v < 0 || v > 1e12) throw bad("value", "The value is a number from 0 up.");
  return v;
};

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "metric";

// ---------- the tree ----------
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.id).localeCompare(String(b.id));

/** items: [{ id, parentId, ... }]. Children of an id (null for the roots), in order. */
function childrenOf(items, id) {
  return items.filter((i) => (i.parentId || null) === (id || null)).sort(byOrder);
}

/** All descendants of an id, depth first. */
function descendants(items, id) {
  const out = [];
  const walk = (p) => { for (const c of childrenOf(items, p)) { out.push(c); walk(c.id); } };
  walk(id);
  return out;
}

const rootOf = (map, item) => { let x = item; for (let n = 0; x.parentId && map.get(x.parentId) && n < 10; n++) x = map.get(x.parentId); return x; };

/**
 * Income items stay private unless the owner confirms: an item is income when it's tied to a metric
 * measured in USD, or sits under a track that has such an item. A USD metric is income itself.
 */
function incomeIds(items, metrics) {
  const map = new Map(items.map((i) => [i.id, i]));
  const usd = (mid) => mid && metrics[mid] && String(metrics[mid].unit).toUpperCase() === "USD";
  const tracks = new Set();
  for (const i of items) if (usd(i.metricId)) tracks.add(rootOf(map, i).id);
  return new Set(items.filter((i) => usd(i.metricId) || tracks.has(rootOf(map, i).id)).map((i) => i.id));
}
const isIncomeMetric = (m) => String(m?.unit || "").toUpperCase() === "USD";

// ---------- publishing ----------
const RANK = { public: 0, members: 1, private: 2 };
/** An item is never shown more widely than its parent. */
function effectiveVisibility(map, item) {
  let v = item.visibility || "members";
  for (let p = item, n = 0; p.parentId && n < 10; n++) {
    p = map.get(p.parentId);
    if (!p) return "private";   // an orphan is never shown
    if (RANK[p.visibility || "members"] > RANK[v]) v = p.visibility || "members";
  }
  return v;
}

/** The nearest goal above a flagged item, else its track, else itself: the card it is counted in. */
function groupOf(map, item) {
  let x = item, track = null;
  for (let n = 0; x.parentId && map.get(x.parentId) && n < 10; n++) {
    x = map.get(x.parentId);
    if (x.type === "goal") return x;
    if (x.type === "track") track = x;
  }
  return track || item;
}

/** Relaunch readiness over the given (already filtered) items. */
function readiness(items) {
  const map = new Map(items.map((i) => [i.id, i]));
  const flagged = items.filter((i) => i.relaunch?.needed && i.status !== "dropped");
  const groups = new Map();
  const sides = { site: { done: 0, total: 0, weeksLeft: 0 }, stream: { done: 0, total: 0, weeksLeft: 0 } };
  let done = 0, weeksLeft = 0;
  for (const i of flagged) {
    const isDone = i.status === "done";
    const g = groupOf(map, i);
    const entry = groups.get(g.id) || { id: g.id, name: g.title, icon: rootOf(map, g).icon || "", done: 0, total: 0, items: [] };
    entry.total++; entry.items.push(i.id); if (isDone) entry.done++;
    groups.set(g.id, entry);
    const s = sides[i.relaunch.side] || sides.site;
    s.total++;
    if (isDone) { done++; s.done++; } else { weeksLeft += i.relaunch.weeks || 0; s.weeksLeft += i.relaunch.weeks || 0; }
  }
  // Groups in the plan's order.
  const order = new Map(); let n = 0;
  const walk = (p) => { for (const c of childrenOf(items, p)) { order.set(c.id, n++); walk(c.id); } };
  walk(null);
  const list = [...groups.values()].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)).map((g) => g);
  return { done, total: flagged.length, weeksLeft, sides, groups: list };
}

/** The next key date (relaunch, nominees announced, the show) that hasn't passed, or null. */
function nextKeyDate(config, now) {
  const dates = [["relaunch", "Relaunch", config.relaunchAt], ["nominees", "Nominees announced", config.nomineesAt], ["show", "The Game Awards", config.showAt]]
    .filter(([, , at]) => Number.isFinite(at) && at > now).sort((a, b) => a[2] - b[2]);
  return dates.length ? { key: dates[0][0], label: dates[0][1], at: dates[0][2] } : null;
}

/**
 * The published snapshot and the teaser, from the draft.
 *   config: the goalTracker/config data; items: [{ id, ...fields }]; metrics: { id: { label, unit, source, value, updatedAt (ms), visibility } }
 * Returns { snapshot, teaser, visibleItems }. Private items, and anything under one, never get in.
 */
function buildPublic({ config, items, metrics, now }) {
  const map = new Map(items.map((i) => [i.id, i]));
  const shown = items.filter((i) => effectiveVisibility(map, i) !== "private");
  const shownIds = new Set(shown.map((i) => i.id));
  const shownMetrics = {};
  for (const [id, m] of Object.entries(metrics)) {
    if (m.visibility === "private") continue;
    shownMetrics[id] = { label: m.label, unit: m.unit || "", auto: String(m.source || "").startsWith("auto:"), value: Number.isFinite(m.value) ? m.value : null, updatedAt: m.updatedAt ?? null };
  }
  const flat = [];
  const walk = (p) => {
    for (const c of childrenOf(shown, p)) {
      const metricOk = c.metricId && shownMetrics[c.metricId];
      flat.push({
        id: c.id, type: c.type, parentId: c.parentId || null, level: c.level ?? null,
        title: c.title, description: c.description || "", help: c.help || "", status: c.status || null,
        startDate: c.startDate || null, dueDate: c.dueDate || null, order: c.order ?? 0,
        relaunch: c.relaunch || { needed: false, weeks: 0, side: "site" }, icon: c.icon || "",
        metricId: metricOk ? c.metricId : null, target: metricOk ? c.target ?? null : null,
      });
      walk(c.id);
    }
  };
  walk(null);
  const ready = readiness(flat);
  const cfg = {
    northStar: config.northStar || "", story: config.story || "", result: config.result || "",
    relaunchAt: config.relaunchAt ?? null, nomineesAt: config.nomineesAt ?? null, showAt: config.showAt ?? null,
  };
  const snapshot = {
    config: cfg, levels: config.levels || [], items: flat, metrics: shownMetrics,
    readiness: { done: ready.done, total: ready.total, weeksLeft: ready.weeksLeft, groups: ready.groups },
    publishedAt: now, updatedAt: now,
  };
  const teaser = teaserOf(cfg, snapshot.readiness, now);
  return { snapshot, teaser, visibleItems: flat, shownIds };
}

function teaserOf(cfg, ready, now) {
  return {
    northStar: cfg.northStar,
    readiness: { done: ready.done, total: ready.total },
    relaunchAt: cfg.relaunchAt ?? null,
    nextKeyDate: nextKeyDate(cfg, now),
    updatedAt: now,
  };
}

/** Milestones (public or members) that are Done now but weren't in the last snapshot. First publish: none. */
function newlyDoneMilestones(prevSnapshot, visibleItems) {
  if (!prevSnapshot || !Array.isArray(prevSnapshot.items)) return [];
  const before = new Map(prevSnapshot.items.map((i) => [i.id, i.status]));
  return visibleItems.filter((i) => i.type === "milestone" && i.status === "done" && before.has(i.id) && before.get(i.id) !== "done");
}

// ---------- the daily counts ----------
/** The automatic metric values the daily job can read: { key: { value, updatedAt (ms) } }. */
function autoValues(socials, fanClubCount, now) {
  const ms = (v) => (v == null ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : null);
  const out = {};
  const put = (key, value, at) => { if (Number.isFinite(value) && value >= 0) out[key] = { value, updatedAt: at ?? now }; };
  put("twitchFollowers", socials?.twitch?.followers, ms(socials?.twitch?.updatedAt));
  put("youtubeSubscribers", socials?.youtube?.subscribers, ms(socials?.youtube?.updatedAt));
  put("tiktokFollowers", socials?.tiktok?.followers, ms(socials?.tiktok?.updatedAt));
  put("fanClubMembers", fanClubCount, now);
  return out;
}

module.exports = {
  SITE_ID, TYPES, PARENT_OF, STATUSES, VISIBILITIES, SIDES, LIMITS, MAX_ITEMS, MAX_LEVELS, MAX_METRICS, MAX_WEEKS, AUTO_KEYS, STALE_DAYS, DAY_MS,
  Invalid, itemFields, configFields, levelList, metricFields, metricValue, slug,
  childrenOf, descendants, incomeIds, isIncomeMetric, effectiveVisibility, readiness, nextKeyDate,
  buildPublic, teaserOf, newlyDoneMilestones, autoValues, byOrder,
};
