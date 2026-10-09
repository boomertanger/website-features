// Cloud Stash, pure logic (docs/specs/cloud-stash.md §3, §4, §5): the settings and their limits, how Cloudinary's usage becomes a status and an upload state, how a file record
// is classified by a scan, the rate limit, the sweep's cap and result, and the alert rules. No Firestore, no clock reads, no network, so scripts/check-stash.js can prove every rule.

const MIN_MS = 60 * 1000;
const HOUR_MS = 60 * MIN_MS;
const DAY_MS = 24 * HOUR_MS;

const DEFAULTS = { pauseAtPct: 80, manualPause: false, manualPauseReason: "", runCap: 100 };
const PAUSE_MIN = 60;
const PAUSE_MAX = 95;
const RETENTION_MIN = 90;
const RETENTION_MAX = 730;
const RUN_CAP_MIN = 10;
const RUN_CAP_MAX = 500;
const REASON_MAX = 200;
const BATCH_MAX = 50;
const SCAN_RESOURCE_CAP = 2000;
const LIST_CAP = 200;
const RATE_WINDOW_MS = 10 * MIN_MS;
const STALE_USAGE_MS = 48 * HOUR_MS;

const no = (code, reason, message, field) => ({ ok: false, code, reason, message, ...(field ? { field } : {}) });

/** The stored adminSettings/storage doc (or nothing) as settings with every field present and clamped to its limits. */
function settingsOf(doc) {
  const d = doc && typeof doc === "object" ? doc : {};
  const num = (v, lo, hi, dflt) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : dflt);
  return {
    pauseAtPct: num(d.pauseAtPct, PAUSE_MIN, PAUSE_MAX, DEFAULTS.pauseAtPct),
    manualPause: d.manualPause === true,
    manualPauseReason: typeof d.manualPauseReason === "string" ? d.manualPauseReason.slice(0, REASON_MAX) : "",
    runCap: num(d.runCap, RUN_CAP_MIN, RUN_CAP_MAX, DEFAULTS.runCap),
  };
}

/** A settings change from the Limits dialog: { pauseAtPct?, manualPause?, reason?, retentionDays? }. Returns { ok, value } with only the fields sent, or a refusal. */
function validateSettings(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return no("invalid-argument", "invalid", "Send the settings as an object.");
  const out = {};
  if (input.pauseAtPct !== undefined) {
    if (!Number.isInteger(input.pauseAtPct) || input.pauseAtPct < PAUSE_MIN || input.pauseAtPct > PAUSE_MAX) return no("invalid-argument", "invalid", `The pause point is a whole number from ${PAUSE_MIN} to ${PAUSE_MAX} percent.`, "pauseAtPct");
    out.pauseAtPct = input.pauseAtPct;
  }
  if (input.manualPause !== undefined) {
    if (typeof input.manualPause !== "boolean") return no("invalid-argument", "invalid", "Say whether to pause or resume.", "manualPause");
    out.manualPause = input.manualPause;
  }
  if (input.reason !== undefined) {
    if (typeof input.reason !== "string" || input.reason.trim().length > REASON_MAX) return no("invalid-argument", "invalid", `The reason can be at most ${REASON_MAX} characters.`, "reason");
    out.reason = input.reason.replace(/\s+/g, " ").trim();
  }
  if (input.retentionDays !== undefined) {
    if (!Number.isInteger(input.retentionDays) || input.retentionDays < RETENTION_MIN || input.retentionDays > RETENTION_MAX) return no("invalid-argument", "invalid", `Log retention is a whole number of days from ${RETENTION_MIN} to ${RETENTION_MAX}.`, "retentionDays");
    out.retentionDays = input.retentionDays;
  }
  if (!Object.keys(out).length) return no("failed-precondition", "nothing", "There is nothing to save.");
  return { ok: true, value: out };
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
/**
 * Cloudinary's usage response as the numbers Cloud Stash keeps. The plan limit is read from the response, never hardcoded: credits { usage, limit, used_percent }. A plan with no
 * credit limit gives pct null (unknown), which never pauses anything. Anything missing counts as 0.
 */
function normalizeUsage(json) {
  const j = json && typeof json === "object" ? json : {};
  const c = j.credits && typeof j.credits === "object" ? j.credits : {};
  const used = num(c.usage), limit = num(c.limit);
  const pct = Number.isFinite(c.used_percent) ? c.used_percent : limit > 0 ? (used / limit) * 100 : null;
  const part = (p) => ({ usage: num(p && p.usage), credits: num(p && (p.credits_usage ?? p.credits)) });
  return {
    credits: { used, limit, pct: pct == null ? null : Math.round(pct * 10) / 10 },
    storage: part(j.storage), bandwidth: part(j.bandwidth), transformations: part(j.transformations),
    plan: typeof j.plan === "string" ? j.plan : "",
  };
}

/**
 * The state the site shows and the upload gate acts on (spec §3): Healthy below the pause point, Uploads paused from the pause point up to 100%, Over limit at 100% or more;
 * manualPause forces paused. uploads: open | members-paused (paused, or paused by hand) | stopped (over the limit: only the owner may upload).
 */
function statusOf(pct, settings) {
  const s = settingsOf(settings);
  const p = typeof pct === "number" && Number.isFinite(pct) ? pct : null;
  if (p != null && p >= 100) return { status: "over", uploads: "stopped" };
  if (s.manualPause || (p != null && p >= s.pauseAtPct)) return { status: "paused", uploads: "members-paused" };
  return { status: "healthy", uploads: "open" };
}

/** Rate limit for Refresh and Scan now: once per 10 minutes per site. Returns null when allowed, else how many whole seconds to wait. */
function tooSoon(lastAtMs, now) {
  if (!lastAtMs) return null;
  const left = RATE_WINDOW_MS - (now - lastAtMs);
  return left > 0 ? Math.ceil(left / 1000) : null;
}

/** Reads a dotted path ("cover.url") from a document's data. */
function getPath(data, path) {
  return String(path || "").split(".").reduce((o, k) => (o != null && typeof o === "object" ? o[k] : undefined), data);
}

/**
 * How a scan classifies one record: "orphan" (it names a linked doc that no longer exists), "stale" (the doc is there but its linked field no longer points at this record's file:
 * it doesn't equal the URL and doesn't contain the public id), or "linked". A record with no linked doc at all (a purge of an untracked file in progress) is "linked". `linkedData`
 * is the linked doc's data, or null when the doc is missing.
 */
function classifyRecord(asset, linkedData) {
  if (!asset || !asset.linkedDoc) return "linked";
  if (!linkedData) return "orphan";
  const field = asset.linkedDoc.field;
  if (!field) return "linked";
  const v = getPath(linkedData, field);
  if (v == null || v === "") return "stale";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s === asset.url || (asset.publicId && s.includes(asset.publicId)) ? "linked" : "stale";
}

/** Per-feature recount for storageUsage/current from the records: { byFeature: { <key>: { bytes, files } }, totalBytes }. */
function recount(records) {
  const byFeature = {};
  let totalBytes = 0;
  for (const r of records) {
    const key = r.feature || "unknown", b = num(r.sizeBytes);
    byFeature[key] ||= { bytes: 0, files: 0 };
    byFeature[key].bytes += b; byFeature[key].files += 1; totalBytes += b;
  }
  return { byFeature, totalBytes };
}

/** What a sweep reports for itself: ok, partial (some purges failed), capped (the per-run cap stopped it) or failed (nothing it tried worked). */
function sweepStatus({ purged, failures, capped, attempted }) {
  if (attempted > 0 && purged === 0 && failures > 0) return "failed";
  if (failures > 0) return "partial";
  if (capped) return "capped";
  return "ok";
}

/** The month key an "once per crossing per month" alert is remembered under (UTC, "2026-10"). */
const monthKey = (now) => new Date(now).toISOString().slice(0, 7);
const dayKey = (now) => new Date(now).toISOString().slice(0, 10);

/**
 * Which alerts a state calls for (spec §5). Inputs: the usage status before and after a fetch ({ pct }), the pause point, the consecutive failed fetches, the sweep's result, the
 * weekly scan's counts and the previous scan's. Returns the kinds in a stable order; the writer drops any kind already sent today (and 80/100 already sent this month).
 */
function alertKinds({ before, after, pauseAtPct, failures, sweep, scan, prevScan }) {
  const out = [];
  if (sweep && (sweep.status === "failed" || sweep.status === "partial" || sweep.skipped > 0)) out.push("stash-sweep-failed");
  if (sweep && sweep.status === "capped") out.push("stash-sweep-capped");
  const b = before && typeof before.pct === "number" ? before.pct : 0, a = after && typeof after.pct === "number" ? after.pct : null;
  if (a != null && a >= 100 && b < 100) out.push("stash-usage-100");
  else if (a != null && a >= pauseAtPct && b < pauseAtPct) out.push("stash-usage-80");
  if (failures >= 2) out.push("stash-usage-stale");
  if (scan && prevScan) {
    const now = num(scan.orphan) + num(scan.untracked), then = num(prevScan.orphan) + num(prevScan.untracked);
    if (now > then) out.push("stash-loose-ends");
  }
  return out;
}

module.exports = {
  MIN_MS, HOUR_MS, DAY_MS, DEFAULTS, PAUSE_MIN, PAUSE_MAX, RETENTION_MIN, RETENTION_MAX, RUN_CAP_MIN, RUN_CAP_MAX, REASON_MAX, BATCH_MAX, SCAN_RESOURCE_CAP, LIST_CAP, RATE_WINDOW_MS, STALE_USAGE_MS,
  no, settingsOf, validateSettings, normalizeUsage, statusOf, tooSoon, getPath, classifyRecord, recount, sweepStatus, monthKey, dayKey, alertKinds,
};
