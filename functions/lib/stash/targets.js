// Cloud Stash cleanup targets, the allowlist (docs/specs/cloud-stash.md §4). A cleanup rule can only be one of these shapes: the editor offers nothing else and the server
// refuses anything else. Each target says which files it may purge (the feature key on the asset records), which collection and fields it reads, which values count, and the
// composite index it needs. v1 has one target: Bug Zapper screenshots on reports in a closed status for at least N days. Vault covers and Fun Factory season art are NEVER
// targets, and Vault suggestions keep their own vaultSweepPendingCovers. Pure: no Firestore, so scripts/check-stash.js can prove every rule.
const { SITE_ID } = require("../vault/common");
const BUGS = require("../bugs/logic");

const DAYS_MIN = 14;
const DAYS_MAX = 730;
const NAME_MAX = 80;

/**
 * [BZ] from docs/specs/bug-zapper.md §3 and lib/bugs: reports live in sites/boomertanger/bugs/main/reports; a report is closed (closed == true, closedAt set) in the four
 * statuses fixed, wont_fix, cant_reproduce and duplicate; its screenshot is the Cloudinary public id in shotRef (the asset's linkedField), recorded with feature "bugZapper"
 * and delivery type authenticated; a report opens at /bug-zapper?report=<id>. The index (closed asc, closedAt asc on reports) already ships in firestore.indexes.json.
 */
const BUG_SCREENSHOTS = {
  key: "bugScreenshots",
  label: "Bug Zapper screenshots",
  feature: "bugZapper",
  collection: `sites/${SITE_ID}/bugs/main/reports`,
  matchField: "closed",
  matchValue: true,
  ageField: "closedAt",
  statusField: "status",
  statuses: BUGS.CLOSED,
  statusLabels: BUGS.STATUS_LABEL,
  screenshotField: "shotRef",
  titleField: "title",
  daysMin: DAYS_MIN,
  daysMax: DAYS_MAX,
  link: (id) => `/bug-zapper?report=${id}`,
  index: { collectionGroup: "reports", fields: [["closed", "ASCENDING"], ["closedAt", "ASCENDING"]] },
};

const TARGETS = { [BUG_SCREENSHOTS.key]: BUG_SCREENSHOTS };
const targetOf = (key) => (typeof key === "string" && Object.prototype.hasOwnProperty.call(TARGETS, key) ? TARGETS[key] : null);

const no = (reason, message, field) => ({ ok: false, reason, message, ...(field ? { field } : {}) });

/**
 * A rule as the editor sends it: { name, target, statuses[], days }. Returns { ok: true, value } with the clean rule, or { ok: false, reason, message, field }.
 * A rule is allowlisted when its target exists, its statuses are a non-empty subset of the target's, and days is a whole number between 14 and 730.
 */
function validateRule(rule) {
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) return no("invalid", "Send the rule as an object.");
  const t = targetOf(rule.target);
  if (!t) return no("notAllowed", "That kind of rule isn't allowed.", "target");
  const name = typeof rule.name === "string" ? rule.name.replace(/\s+/g, " ").trim() : "";
  if (!name || name.length > NAME_MAX) return no("invalid", `Give the rule a name (up to ${NAME_MAX} characters).`, "name");
  if (!Array.isArray(rule.statuses) || !rule.statuses.length) return no("invalid", "Pick at least one status.", "statuses");
  const statuses = [...new Set(rule.statuses)];
  if (statuses.some((s) => !t.statuses.includes(s))) return no("notAllowed", "One of those statuses isn't a closed status.", "statuses");
  const days = rule.days;
  if (!Number.isInteger(days) || days < t.daysMin || days > t.daysMax) return no("invalid", `Days must be a whole number from ${t.daysMin} to ${t.daysMax}.`, "days");
  return { ok: true, value: { name, target: t.key, statuses: t.statuses.filter((s) => statuses.includes(s)), days } };
}

/** A rule written by the legacy Squarespace page has no target (it names a collection and fields by hand). The new page shows it read-only. */
const isLegacyShaped = (rule) => !!rule && typeof rule === "object" && !rule.target;

/**
 * What the sweep and the dry run actually query for a rule of either shape: { collection, matchField, matchValue, ageField, days, statuses|null, statusField|null }.
 * A new-shape rule must still agree with its target (a hand-edited rule doc that drifts is refused here); a legacy-shaped rule keeps running as written until launch.
 */
function queryOf(rule) {
  if (isLegacyShaped(rule)) {
    const days = Number(rule.ageThresholdDays);
    if (!rule.collection || !rule.matchField || !rule.ageField || !Number.isFinite(days) || days <= 0) return no("invalid", "This legacy rule is incomplete.");
    return { ok: true, legacy: true, value: { collection: rule.collection, matchField: rule.matchField, matchValue: rule.matchValue, ageField: rule.ageField, days, statuses: null, statusField: null, screenshotField: null } };
  }
  const v = validateRule(rule);
  if (!v.ok) return v;
  const t = targetOf(rule.target);
  if (rule.days !== v.value.days) return no("invalid", "The rule's days are out of range.", "days");
  return { ok: true, legacy: false, value: { collection: t.collection, matchField: t.matchField, matchValue: t.matchValue, ageField: t.ageField, days: v.value.days, statuses: v.value.statuses, statusField: t.statusField, screenshotField: t.screenshotField } };
}

const joinList = (items) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`);
/** The rule as a plain sentence for the Rules tab and the editor ("Purge the screenshot of any bug report that has been closed as Fixed or Duplicate for 60 days."). */
function sentence(rule) {
  const t = targetOf(rule && rule.target);
  if (!t) return "A rule from the old Cloud Stash page.";
  const all = rule.statuses.length === t.statuses.length;
  return `Purge the screenshot of any bug report ${all ? "that has been closed" : `closed as ${joinList(rule.statuses.map((s) => t.statusLabels[s]))}`} for ${rule.days} days.`;
}

module.exports = { TARGETS, BUG_SCREENSHOTS, DAYS_MIN, DAYS_MAX, NAME_MAX, targetOf, validateRule, isLegacyShaped, queryOf, sentence };
