// Bug Zapper, pure logic (docs/specs/bug-zapper.md §2, §3, §4, §9): the field rules, the rate limits, who sees what, "bit me too" refusals and the triage rules
// (what a save changes, what it adds to the history, which one-time rewards it unlocks). The shared pieces (refusal shape, hide rule, rate-limit windows, the
// triage plan) are in lib/boards/logic.js. No Firestore and no clock reads in here, so scripts/check-bugs.js can prove every rule.
const B = require("../boards/logic");
const { HOUR_MS, DAY_MS, REASON_MAX, NOTE_MAX, HISTORY_MAX, TOKEN_RE, no, oneLine, validateHide, canDelete } = B;

const STATUSES = ["open", "confirmed", "in_progress", "fixed", "wont_fix", "cant_reproduce", "duplicate"];
const STATUS_LABEL = { open: "Open", confirmed: "Confirmed", in_progress: "In progress", fixed: "Fixed", wont_fix: "Won't fix", cant_reproduce: "Can't reproduce", duplicate: "Duplicate" };
const SEVERITIES = ["cosmetic", "minor", "major", "critical"];
const PRIORITIES = ["low", "normal", "high", "urgent"];
/** closed == true for these (the cleanup rule purges a closed report's screenshot 60 days after closedAt). */
const CLOSED = ["fixed", "wont_fix", "cant_reproduce", "duplicate"];
/** A report counts as confirmed the first time it reaches one of these (Bug Finder, Night Shift confirmed). Duplicates, Won't fix and Can't reproduce never do. */
const CONFIRMED = ["confirmed", "in_progress", "fixed"];
/** "Bit me too" is refused on a report in one of these (the count is frozen). Can't reproduce stays open to it: it may still be happening. */
const ME_TOO_LOCKED = ["fixed", "wont_fix", "duplicate"];

const TITLE = { min: 3, max: 200 };
const PAGE = { min: 1, max: 300 };
const WHAT = { min: 10, max: 2000 };
const LONG_OPTIONAL = { max: 2000 };
const REPLY = { min: 1, max: 1000 };
const DEVICE_FIELD_MAX = 80;
const SHOT_MAX_BYTES = 10 * 1024 * 1024;
const SHOT_FORMATS = ["jpg", "jpeg", "png", "webp"];

/** Per member (spec §2.7): reports per Central day, thread replies and "bit me too" changes per hour. */
const LIMITS = {
  submit: { count: 5, period: "day", message: "Slow down: you can send 5 reports a day. Try again tomorrow." },
  // the owner and admins (A1 Steward and up) skip the 5 a day; this backstop, on its own key, is theirs
  submitAdmin: { count: 200, period: "day", message: "That's 200 reports today. Try again tomorrow." },
  reply: { count: 20, period: "hour", message: "Slow down: 20 replies an hour is the most. Try again later." },
  meToo: { count: 60, period: "hour", message: "Slow down: too many changes in an hour. Try again later." },
};

const oneLineOrNull = (v, max) => (typeof v === "string" ? oneLine(v).slice(0, max) : null);
const body = (v) => v.replace(/\r\n/g, "\n").trim();

/** The device line the form shows ("Chrome on Windows, 1280 × 720"): three short strings, or null when the reporter left it off. */
function cleanDevice(d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  const browser = oneLineOrNull(d.browser, DEVICE_FIELD_MAX), os = oneLineOrNull(d.os, DEVICE_FIELD_MAX), viewport = oneLineOrNull(d.viewport, DEVICE_FIELD_MAX);
  return browser || os || viewport ? { browser: browser || "", os: os || "", viewport: viewport || "" } : null;
}

/** A new report: the fields, the security checkbox, whether a screenshot will follow, and the post token. Whitespace in one-line fields is collapsed; the long ones keep their line breaks. */
function validateReport(data = {}) {
  const { title, page, whatHappened, expected, steps, severity, device, token } = data || {};
  if (typeof title !== "string") return no("invalid-argument", "invalid", "Give it a short name.", "title");
  const t = oneLine(title);
  if (t.length < TITLE.min || t.length > TITLE.max) return no("invalid-argument", "invalid", `The name needs to be ${TITLE.min} to ${TITLE.max} characters.`, "title");
  if (typeof whatHappened !== "string") return no("invalid-argument", "invalid", "Say what happened.", "whatHappened");
  const w = body(whatHappened);
  if (w.length < WHAT.min || w.length > WHAT.max) return no("invalid-argument", "invalid", `What happened needs to be ${WHAT.min} to ${WHAT.max.toLocaleString("en-US")} characters.`, "whatHappened");
  const ex = typeof expected === "string" ? body(expected) : "";
  if (ex.length > LONG_OPTIONAL.max) return no("invalid-argument", "invalid", `What you expected can be at most ${LONG_OPTIONAL.max.toLocaleString("en-US")} characters.`, "expected");
  const st = typeof steps === "string" ? body(steps) : "";
  if (st.length > LONG_OPTIONAL.max) return no("invalid-argument", "invalid", `Steps can be at most ${LONG_OPTIONAL.max.toLocaleString("en-US")} characters.`, "steps");
  if (typeof page !== "string") return no("invalid-argument", "invalid", "Say which page or feature.", "page");
  const p = oneLine(page);
  if (p.length < PAGE.min || p.length > PAGE.max) return no("invalid-argument", "invalid", `The page or feature needs to be ${PAGE.min} to ${PAGE.max} characters.`, "page");
  if (!SEVERITIES.includes(severity)) return no("invalid-argument", "invalid", "Pick how bad it is.", "severity");
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return no("invalid-argument", "invalid", "Reload the page and try again.", "token");
  return { ok: true, value: { title: t, page: p, whatHappened: w, expected: ex, steps: st, severity, private: data.private === true, wantsShot: data.wantsShot === true, device: cleanDevice(device), token } };
}

function validateReply(text) {
  if (typeof text !== "string") return no("invalid-argument", "invalid", "Write a reply.", "text");
  const v = body(text);
  if (v.length < REPLY.min || v.length > REPLY.max) return no("invalid-argument", "invalid", `A reply is ${REPLY.min} to ${REPLY.max.toLocaleString("en-US")} characters.`, "text");
  return { ok: true, value: v };
}

/** A staff edit (adminEditItem kind bugReport): only the fields sent, each with the same limits as a new report. */
function validateEditField(field, value) {
  const text = (label) => (typeof value === "string" ? null : no("invalid-argument", "invalid", `${label} must be text.`, field));
  if (field === "title") {
    const bad = text("Title"); if (bad) return bad;
    const t = oneLine(value);
    return t.length < TITLE.min || t.length > TITLE.max ? no("invalid-argument", "invalid", `Title needs to be ${TITLE.min}–${TITLE.max} characters.`, field) : { ok: true, value: t };
  }
  if (field === "page") {
    const bad = text("Page"); if (bad) return bad;
    const t = oneLine(value);
    return t.length < PAGE.min || t.length > PAGE.max ? no("invalid-argument", "invalid", `Page needs to be ${PAGE.min}–${PAGE.max} characters.`, field) : { ok: true, value: t };
  }
  if (field === "whatHappened") {
    const bad = text("What happened"); if (bad) return bad;
    const d = body(value);
    return d.length < WHAT.min || d.length > WHAT.max ? no("invalid-argument", "invalid", `What happened needs to be ${WHAT.min}–${WHAT.max.toLocaleString("en-US")} characters.`, field) : { ok: true, value: d };
  }
  if (field === "expected" || field === "steps") {
    const bad = text(field === "steps" ? "Steps" : "What should have happened"); if (bad) return bad;
    const d = body(value);
    return d.length > LONG_OPTIONAL.max ? no("invalid-argument", "invalid", `At most ${LONG_OPTIONAL.max.toLocaleString("en-US")} characters.`, field) : { ok: true, value: d };
  }
  if (field === "severity") return SEVERITIES.includes(value) ? { ok: true, value } : no("invalid-argument", "invalid", "Severity: Cosmetic, Minor, Major or Critical.", field);
  return no("invalid-argument", "invalid", `${field} can't be edited.`, field);
}

const periodKey = (kind, now, dayKey) => B.periodKey(LIMITS, kind, now, dayKey);
const limitTtlMs = (kind) => B.limitTtlMs(LIMITS, kind);
const overLimit = (kind, count) => B.overLimit(LIMITS, kind, count);

const isClosed = (status) => CLOSED.includes(status);

/** Can this report take a "bit me too" right now? (public, not hidden, not the caller's own, not fixed, won't fix or a duplicate) */
function meTooRefusal(report, uid) {
  if (!report) return no("not-found", "noReport", "This report is no longer here.");
  if (report.hidden === true || report.private === true) return no("failed-precondition", "hidden", "This report is no longer here.");
  if (report.by && report.by.uid === uid) return no("failed-precondition", "own", "You reported this one. Add details in the thread instead.");
  if (ME_TOO_LOCKED.includes(report.status)) return no("failed-precondition", "closed", "This report is closed. If it is still happening, report it again and mention this one.");
  return null;
}

/** Who may see a report's private parts (the thread, the screenshot, the device): its reporter and staff. */
const canSeePrivate = (report, c) => !!c && (c.isStaff === true || (report && report.by && report.by.uid === c.uid));

/** Can this report take a thread reply from this caller? (not hidden; the reporter or staff) */
function replyRefusal(report, c) {
  if (!report) return no("not-found", "noReport", "This report is no longer here.");
  if (report.hidden === true) return no("failed-precondition", "hidden", "This report is no longer here.");
  if (!canSeePrivate(report, c)) return no("permission-denied", "notYours", "Only the reporter and the team can reply here.");
  return null;
}

/** Can a screenshot be added now? The reporter until the report closes (staff any time); one per report. */
function shotRefusal(report, c) {
  if (!report) return no("not-found", "noReport", "This report is no longer here.");
  if (!canSeePrivate(report, c)) return no("permission-denied", "notYours", "Only the reporter and the team can add a screenshot.");
  if (report.shotRef) return no("failed-precondition", "hasShot", "This report already has a screenshot.");
  if (report.closed === true && !c.isStaff) return no("failed-precondition", "closed", "This report is closed.");
  return null;
}

/** Why an uploaded file can't be a screenshot, or null when it can (format, bytes). */
function shotProblem(info) {
  if (!info) return "notFound";
  if (!SHOT_FORMATS.includes(String(info.format || "").toLowerCase())) return "format";
  if (!(info.bytes > 0) || info.bytes > SHOT_MAX_BYTES) return "tooBig";
  return null;
}

/**
 * Applies the rules of a triage save (spec §4 bugTriage) to a report as it is now (the shared plan is in lib/boards/logic.js). Returns { ok: false, ... } or
 *   { ok: true, patch, historyEntry|null, statusChanged, priorityChanged, firstTriage, firstConfirmed, firstFixed, closes, reopens, duplicateOf, from, to }
 * A real status change adds exactly ONE history entry (with the optional note), a note alone adds a { kind: "note" } entry, priority alone adds none, and a
 * save that changes nothing is refused. Duplicate needs duplicateOf (the caller checks that the original exists, is visible and is not the report itself); any
 * other status clears it. patch carries closed and duplicateOf; the caller adds the server timestamps (statusChangedAt, firstTriagedAt, confirmedAt, fixedAt,
 * closedAt, updatedAt) where the flags say so.
 */
function planTriage(report, input, ctx) {
  const plan = B.planTriage(report, input, ctx, {
    statuses: STATUSES, priorities: PRIORITIES, statusMessage: "Pick one of the seven statuses.", priorityMessage: "Priority is Low, Normal, High or Urgent.", openStatus: "open",
    noItem: "noReport", notFound: "This report is no longer here.",
    flags: (item, { status, statusChanged }) => ({
      firstConfirmed: statusChanged && CONFIRMED.includes(status) && !item.confirmedAt,
      firstFixed: statusChanged && status === "fixed" && !item.fixedAt,
    }),
  });
  if (!plan.ok) return plan;
  const dup = input && typeof input.duplicateOf === "string" ? input.duplicateOf : null;
  const becomesDup = plan.statusChanged && plan.to === "duplicate";
  if (becomesDup) {
    if (!dup) return no("invalid-argument", "duplicateOf", "Pick the report this one duplicates.", "duplicateOf");
    plan.patch.duplicateOf = dup;
    plan.duplicateOf = dup;
  } else {
    const staysDup = !plan.statusChanged && report.status === "duplicate";
    if (dup && !staysDup) return no("invalid-argument", "duplicateOf", "A duplicate link only goes with the Duplicate status.", "duplicateOf");
    if (plan.statusChanged && report.status === "duplicate") plan.patch.duplicateOf = null;
    plan.duplicateOf = null;
  }
  if (plan.statusChanged) {
    plan.patch.closed = isClosed(plan.to);
    plan.closes = isClosed(plan.to) && !isClosed(plan.from);
    plan.reopens = !isClosed(plan.to) && isClosed(plan.from);
  } else { plan.closes = false; plan.reopens = false; }
  return plan;
}

/** A short text snapshot of a report for the delete's adminLog entry (strings only, capped). */
function snapshotOf(report) {
  const cap = (s, n) => (typeof s === "string" ? s.slice(0, n) : "");
  return { title: cap(report.title, 200), page: cap(report.page, 300), whatHappened: cap(report.whatHappened, 2000), severity: report.severity || "", status: report.status || "", reporter: report.by && report.by.handle ? `@${report.by.handle}` : "" };
}

module.exports = {
  STATUSES, STATUS_LABEL, SEVERITIES, PRIORITIES, CLOSED, CONFIRMED, ME_TOO_LOCKED, TITLE, PAGE, WHAT, REPLY, REASON_MAX, NOTE_MAX, HISTORY_MAX, TOKEN_RE, LIMITS, SHOT_MAX_BYTES, SHOT_FORMATS, HOUR_MS, DAY_MS,
  validateReport, validateReply, validateEditField, validateHide, cleanDevice, periodKey, limitTtlMs, overLimit, isClosed, meTooRefusal, canSeePrivate, replyRefusal, shotRefusal, shotProblem, planTriage, canDelete, snapshotOf, no,
};
