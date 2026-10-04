// Pure checks for accounts (no Firebase): handles, display names, age.
// docs/specs/accounts.md; tested by scripts/check-accounts.js.
const { RESERVED, RESERVED_PARTS, PROFANITY, PROFANITY_WORDS } = require("./wordlists");

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

/** Lowercases and trims a handle (a leading @ is dropped). */
function normalizeHandle(raw) {
  return typeof raw === "string" ? raw.trim().replace(/^@/, "").toLowerCase() : "";
}

function isProfane(text) {
  const lower = String(text).toLowerCase();
  const squashed = lower.replace(/[^a-z]/g, "");
  if (PROFANITY.some((w) => squashed.includes(w))) return true;
  return lower.split(/[^a-z]+/).some((t) => PROFANITY_WORDS.includes(t));
}

/** "ok" | "invalid" | "reserved" (reserved words and the profanity list). Doesn't check "taken". */
function handleShape(handle) {
  if (!HANDLE_RE.test(handle)) return "invalid";
  if (RESERVED.includes(handle) || RESERVED_PARTS.some((p) => handle.includes(p)) || isProfane(handle)) return "reserved";
  return "ok";
}

/** Trimmed display name, or null when it isn't acceptable (1-30 chars, no control chars, not profane). */
function cleanDisplayName(raw) {
  if (typeof raw !== "string") return null;
  const name = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  if (name.length < 1 || name.length > 30) return null;
  if (/[\p{Cc}\p{Cf}<>]/u.test(name)) return null;
  if (isProfane(name)) return null;
  return name;
}

/**
 * Age in whole years, computed conservatively: the birthday is taken as the LAST
 * day of the birth month (so someone born in March is counted as turning N on
 * March 31). month is 1-12. now defaults to the current time (UTC).
 */
function conservativeAge(birthYear, birthMonth, now = new Date()) {
  const y = now.getUTCFullYear();
  // Day 0 of the next month = the last day of birthMonth, at the very end of that day.
  const birthdayThisYear = Date.UTC(y, birthMonth, 0, 23, 59, 59, 999);
  return y - birthYear - (now.getTime() < birthdayThisYear ? 1 : 0);
}

/** The moment (ms) the member counts as 18, on the same conservative rule. */
function adultAtMs(birthYear, birthMonth) {
  return Date.UTC(birthYear + 18, birthMonth, 1);   // the first moment after the last day of the month
}

function ageBand(age) {
  return age >= 18 ? "18+" : "13-17";
}

/** Valid birth month and year (a plausible range; the future isn't allowed). */
function validBirth(birthYear, birthMonth, now = new Date()) {
  return Number.isInteger(birthYear) && Number.isInteger(birthMonth)
    && birthMonth >= 1 && birthMonth <= 12
    && birthYear >= 1900 && birthYear <= now.getUTCFullYear()
    && Date.UTC(birthYear, birthMonth - 1, 1) <= now.getTime();
}

/** Initials for the default avatar: first two letters or digits of the display name. */
function initialsOf(name) {
  const src = String(name || "").replace(/[^\p{L}\p{N}]/gu, "");
  return (src.slice(0, 2) || "?").toUpperCase();
}

/**
 * The public role tag on a profile (sites/{siteId}/profiles/{uid}.roleTag): the highest of
 * admin > mod > sub > fan. Every member is at least "fan" (Fan Club, free). The owner counts as admin.
 */
const ROLE_TAGS = ["admin", "mod", "sub", "fan"];
function roleTagFor(roles, { isOwner = false } = {}) {
  const r = Array.isArray(roles) ? roles : [];
  if (isOwner) return "admin";
  return ROLE_TAGS.find((t) => t !== "fan" && r.includes(t)) || "fan";
}

module.exports = { ROLE_TAGS, roleTagFor, HANDLE_RE, normalizeHandle, handleShape, isProfane, cleanDisplayName, conservativeAge, adultAtMs, ageBand, validBirth, initialsOf };
