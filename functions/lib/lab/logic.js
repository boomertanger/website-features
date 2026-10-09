// Feature Lab, pure logic (docs/specs/feature-lab.md §3, §4, §9): the field rules, the rate limits and the triage rules (what a save changes, what it adds to the
// history, which one-time rewards it unlocks). No Firestore and no clock reads in here, so scripts/check-lab.js can prove every rule.

const STATUSES = ["submitted", "under_review", "planned", "in_progress", "shipped", "declined"];
const STATUS_LABEL = { submitted: "Submitted", under_review: "Under review", planned: "Planned", in_progress: "In progress", shipped: "Shipped", declined: "Declined" };
const AREAS = ["site", "stream", "other"];
const PRIORITIES = ["low", "medium", "high"];
/** Votes are refused on an idea in one of these states: the count is frozen. */
const CLOSED = ["shipped", "declined"];

const TITLE = { min: 3, max: 200 };
const DESCRIPTION = { min: 10, max: 2000 };
const COMMENT = { min: 1, max: 1000 };
const B = require("../boards/logic");
const { HOUR_MS, DAY_MS, REASON_MAX, NOTE_MAX, HISTORY_MAX, TOKEN_RE, no, oneLine, validateHide, canDelete } = B;
/** Per member (spec §2.6): ideas per Central day, comments and vote changes per hour. */
const LIMITS = {
  submit: { count: 3, period: "day", message: "Slow down: you can post 3 ideas a day. Try again tomorrow." },
  comment: { count: 20, period: "hour", message: "Slow down: 20 comments an hour is the most. Try again later." },
  vote: { count: 60, period: "hour", message: "Slow down: too many votes in an hour. Try again later." },
};

const GEARS_SOURCE = "labReview";

/** Title, description, area (and the post token) of a new idea. Whitespace in the title is collapsed; the description keeps its line breaks. */
function validateIdea(data = {}) {
  const { title, description, area, token } = data || {};
  if (typeof title !== "string") return no("invalid-argument", "invalid", "Give the idea a title.", "title");
  const t = oneLine(title);
  if (t.length < TITLE.min || t.length > TITLE.max) return no("invalid-argument", "invalid", `The title needs to be ${TITLE.min} to ${TITLE.max} characters.`, "title");
  if (typeof description !== "string") return no("invalid-argument", "invalid", "Say what the idea should do.", "description");
  const d = description.replace(/\r\n/g, "\n").trim();
  if (d.length < DESCRIPTION.min || d.length > DESCRIPTION.max) return no("invalid-argument", "invalid", `The description needs to be ${DESCRIPTION.min} to ${DESCRIPTION.max.toLocaleString("en-US")} characters.`, "description");
  if (!AREAS.includes(area)) return no("invalid-argument", "invalid", "Pick Site, Stream or Other.", "area");
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return no("invalid-argument", "invalid", "Reload the page and try again.", "token");
  return { ok: true, value: { title: t, description: d, area, token } };
}

function validateComment(text) {
  if (typeof text !== "string") return no("invalid-argument", "invalid", "Write a comment.", "text");
  const v = text.replace(/\r\n/g, "\n").trim();
  if (v.length < COMMENT.min || v.length > COMMENT.max) return no("invalid-argument", "invalid", `A comment is ${COMMENT.min} to ${COMMENT.max.toLocaleString("en-US")} characters.`, "text");
  return { ok: true, value: v };
}

/** A staff edit (adminEditItem kind labIdea): only the fields sent, each with the same limits as a new idea. */
function validateEditField(field, value) {
  if (field === "title") {
    if (typeof value !== "string") return no("invalid-argument", "invalid", "Title must be text.", field);
    const t = oneLine(value);
    return t.length < TITLE.min || t.length > TITLE.max ? no("invalid-argument", "invalid", `Title needs to be ${TITLE.min}–${TITLE.max} characters.`, field) : { ok: true, value: t };
  }
  if (field === "description") {
    if (typeof value !== "string") return no("invalid-argument", "invalid", "Description must be text.", field);
    const d = value.replace(/\r\n/g, "\n").trim();
    return d.length < DESCRIPTION.min || d.length > DESCRIPTION.max ? no("invalid-argument", "invalid", `Description needs to be ${DESCRIPTION.min}–${DESCRIPTION.max.toLocaleString("en-US")} characters.`, field) : { ok: true, value: d };
  }
  if (field === "area") return AREAS.includes(value) ? { ok: true, value } : no("invalid-argument", "invalid", "Area: pick Site, Stream or Other.", field);
  return no("invalid-argument", "invalid", `${field} can't be edited.`, field);
}

/** The rate-limit window key for a member's action: the Central day for ideas, the UTC hour for the rest. `dayKey` is lib/arcade/logic.js dayKey. */
const periodKey = (kind, now, dayKey) => B.periodKey(LIMITS, kind, now, dayKey);
/** How long a counter document may live (the TTL on expireAt): a bit past its window. */
const limitTtlMs = (kind) => B.limitTtlMs(LIMITS, kind);
const overLimit = (kind, count) => B.overLimit(LIMITS, kind, count);

/** Can this idea take a vote right now? (not hidden, not shipped or declined) */
function voteRefusal(idea) {
  if (!idea) return no("not-found", "noIdea", "This idea is no longer here.");
  if (idea.hidden === true) return no("failed-precondition", "hidden", "This idea is no longer here.");
  if (CLOSED.includes(idea.status)) return no("failed-precondition", "closed", "Voting is closed on this idea.");
  return null;
}

/**
 * Applies the rules of a triage save (spec §4 labTriage) to an idea as it is now (the shared plan is in lib/boards/logic.js). Returns { ok: false, ... } or
 *   { ok: true, patch, historyEntry|null, statusChanged, firstTriage, firstShipped, from, to }
 * a real status change adds exactly ONE history entry (with the optional note), a note alone adds a { kind: "note" } entry, priority alone adds none,
 * and a save that changes nothing is refused. `before` is what the admin's form loaded; if the idea moved on, it is a conflict.
 */
const planTriage = (idea, input, ctx) => B.planTriage(idea, input, ctx, {
  statuses: STATUSES, priorities: PRIORITIES, statusMessage: "Pick one of the six statuses.", priorityMessage: "Priority is Low, Medium or High.", openStatus: "submitted",
  flags: (item, { status, statusChanged }) => ({ firstShipped: statusChanged && status === "shipped" && !item.shippedAt }),
});

/** A short text snapshot of an idea for the delete's adminLog entry (strings only, capped). */
function snapshotOf(idea) {
  const cap = (s, n) => (typeof s === "string" ? s.slice(0, n) : "");
  return { title: cap(idea.title, 200), description: cap(idea.description, 2000), area: idea.area || "", status: idea.status || "", author: idea.by && idea.by.handle ? `@${idea.by.handle}` : "" };
}

module.exports = {
  STATUSES, STATUS_LABEL, AREAS, PRIORITIES, CLOSED, TITLE, DESCRIPTION, COMMENT, REASON_MAX, NOTE_MAX, HISTORY_MAX, TOKEN_RE, LIMITS, GEARS_SOURCE, HOUR_MS, DAY_MS,
  validateIdea, validateComment, validateEditField, validateHide, periodKey, limitTtlMs, overLimit, voteRefusal, planTriage, canDelete, snapshotOf, no,
};
