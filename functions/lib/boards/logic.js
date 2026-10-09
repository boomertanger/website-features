// Shared board rules, pure (docs/specs/bug-zapper.md §2 decision 12): what Feature Lab and Bug Zapper have in common. Refusal shape, text validators, the
// hide rule, rate-limit windows, who may delete, and the triage plan (the history rules and the conflict check). No Firestore and no clock reads in here.
// Each feature keeps its own field rules and statuses in its own logic.js and hands them in.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const REASON_MAX = 200;
const NOTE_MAX = 1000;
const HISTORY_MAX = 200;
const TOKEN_RE = /^[A-Za-z0-9_-]{8,80}$/;

/** A refusal in the shape the callables turn into an HttpsError: { ok: false, code, reason, message, field? }. */
const no = (code, reason, message, field) => ({ ok: false, code, reason, message, ...(field ? { field } : {}) });
const oneLine = (s) => s.replace(/\s+/g, " ").trim();

/** Hide or unhide: the reason (1 to 200) is required to hide, optional to unhide. */
function validateHide({ hidden, reason } = {}) {
  if (typeof hidden !== "boolean") return no("invalid-argument", "invalid", "Say whether to hide or unhide.", "hidden");
  const r = typeof reason === "string" ? oneLine(reason) : "";
  if (r.length > REASON_MAX) return no("invalid-argument", "invalid", `The reason can be at most ${REASON_MAX} characters.`, "reason");
  if (hidden && !r) return no("invalid-argument", "reason", "Say why you are hiding it.", "reason");
  return { ok: true, value: { hidden, reason: r } };
}

/** The rate-limit window key for a member's action: the Central day for "day" limits, the UTC hour for the rest. `dayKey` is lib/arcade/logic.js dayKey. */
function periodKey(limits, kind, now, dayKey) {
  const l = limits[kind];
  if (!l) throw new Error(`no such limit: ${kind}`);
  return l.period === "day" ? dayKey(now) : new Date(now).toISOString().slice(0, 13).replace(/\D/g, "");
}
/** How long a counter document may live (the TTL on expireAt): a bit past its window. */
const limitTtlMs = (limits, kind) => (limits[kind].period === "day" ? 2 * DAY_MS : 2 * HOUR_MS);
const overLimit = (limits, kind, count) => count >= limits[kind].count;

/** Who may delete: the owner, an A2 Overseer or an A3 Right Hand (store.a2plus); an A1 Steward hides instead. */
const canDelete = (w, a2plus) => !!w && (w.isOwner === true || a2plus(w) === true);

/**
 * Applies the rules of a triage save to an item as it is now. Returns { ok: false, ... } or
 *   { ok: true, patch, historyEntry|null, statusChanged, priorityChanged, from, to, firstTriage, ...cfg.flags(...) }
 * patch is the field changes (without server timestamps: the caller adds statusChangedAt, firstTriagedAt and updatedAt where the flags say so);
 * a real status change adds exactly ONE history entry (with the optional note), a note alone adds a { kind: "note" } entry, priority alone adds none,
 * and a save that changes nothing is refused. `before` is what the admin's form loaded; if the item moved on, it is a conflict.
 * cfg: { statuses, priorities, statusMessage, priorityMessage, openStatus (the status a new item starts in), notFound, flags(item, { status, statusChanged, from }) }
 */
function planTriage(item, input = {}, { by, at }, cfg) {
  if (!item) return no("not-found", cfg.noItem || "noIdea", cfg.notFound || "This idea is no longer here.");
  const { status, priority, note, before } = input || {};
  const b = before && typeof before === "object" ? before : null;
  if (!b || !("status" in b)) return no("invalid-argument", "args", "before is required.", "before");
  if ((b.status ?? null) !== (item.status ?? null) || ("priority" in b && (b.priority ?? null) !== (item.priority ?? null))) {
    return no("aborted", "conflict", "This was changed while you were editing.", b.status !== item.status ? "status" : "priority");
  }
  if (status !== undefined && status !== null && !cfg.statuses.includes(status)) return no("invalid-argument", "invalid", cfg.statusMessage, "status");
  if (priority !== undefined && priority !== null && !cfg.priorities.includes(priority)) return no("invalid-argument", "invalid", cfg.priorityMessage, "priority");
  let text = "";
  if (note !== undefined && note !== null) {
    if (typeof note !== "string") return no("invalid-argument", "invalid", "The note must be text.", "note");
    text = note.replace(/\r\n/g, "\n").trim();
    if (text.length > NOTE_MAX) return no("invalid-argument", "invalid", `The note can be at most ${NOTE_MAX.toLocaleString("en-US")} characters.`, "note");
  }
  const statusChanged = status != null && status !== item.status;
  const priorityChanged = priority !== undefined && (priority ?? null) !== (item.priority ?? null);
  if (!statusChanged && !priorityChanged && !text) return no("failed-precondition", "nothing", "There is nothing to save.");

  const patch = {};
  let historyEntry = null;
  if (statusChanged) {
    patch.status = status;
    historyEntry = { status, changedBy: by, changedAt: at, ...(text ? { note: text } : {}) };
  } else if (text) {
    historyEntry = { kind: "note", note: text, changedBy: by, changedAt: at };
  }
  if (priorityChanged) patch.priority = priority ?? null;

  const from = item.status;
  return {
    ok: true, patch, historyEntry, statusChanged, priorityChanged, from, to: statusChanged ? status : from,
    // one-time rewards, so moving an item back and forth never pays twice: these hang on fields that are never cleared
    firstTriage: statusChanged && from === cfg.openStatus && !item.firstTriagedAt,
    ...(cfg.flags ? cfg.flags(item, { status, statusChanged, from }) : {}),
  };
}

module.exports = { HOUR_MS, DAY_MS, REASON_MAX, NOTE_MAX, HISTORY_MAX, TOKEN_RE, no, oneLine, validateHide, periodKey, limitTtlMs, overLimit, canDelete, planTriage };
