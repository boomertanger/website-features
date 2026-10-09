#!/usr/bin/env node
// functions/scripts/check-lab.js: checks for Feature Lab's pure logic (lib/lab/logic.js, docs/specs/feature-lab.md §3, §4, §9): field rules, the rate limits,
// when a vote is allowed, and the triage rules (what a save adds to the history, the one-time rewards, conflicts, empty saves).
// Everything is in memory: no credentials, no network, no Firestore.   npm run check
const assert = require("assert/strict");
const L = require("../lib/lab/logic");
const { dayKey } = require("../lib/arcade/logic");

const fine = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r.value; };
const refused = (r, reason, field) => { assert.equal(r.ok, false); assert.equal(r.reason, reason, JSON.stringify(r)); if (field) assert.equal(r.field, field); return r; };

// ---------- a new idea ----------
const ok = { title: "  A  better   queue  ", description: "Show the queue on stream.\r\nWith the next three games.", area: "stream", token: "tok_12345678" };
const v = fine(L.validateIdea(ok));
assert.equal(v.title, "A better queue", "title whitespace is collapsed");
assert.equal(v.description, "Show the queue on stream.\nWith the next three games.", "the description keeps its line breaks, trimmed");
for (const area of L.AREAS) fine(L.validateIdea({ ...ok, area }));
refused(L.validateIdea({ ...ok, title: "ab" }), "invalid", "title");
refused(L.validateIdea({ ...ok, title: "x".repeat(201) }), "invalid", "title");
fine(L.validateIdea({ ...ok, title: "x".repeat(200) }));
refused(L.validateIdea({ ...ok, title: "   a   " }), "invalid", "title");
refused(L.validateIdea({ ...ok, description: "too short" }), "invalid", "description");
refused(L.validateIdea({ ...ok, description: "y".repeat(2001) }), "invalid", "description");
fine(L.validateIdea({ ...ok, description: "y".repeat(2000) }));
refused(L.validateIdea({ ...ok, area: "arcade" }), "invalid", "area");
refused(L.validateIdea({ ...ok, token: "short" }), "invalid", "token");
refused(L.validateIdea({ ...ok, token: "has spaces in it" }), "invalid", "token");
refused(L.validateIdea({ ...ok, title: 42 }), "invalid", "title");
refused(L.validateIdea(null), "invalid");

// ---------- comments, hides, edits ----------
assert.equal(fine(L.validateComment("  hi  ")), "hi");
refused(L.validateComment("   "), "invalid", "text");
refused(L.validateComment("z".repeat(1001)), "invalid", "text");
fine(L.validateComment("z".repeat(1000)));
refused(L.validateComment(7), "invalid", "text");
refused(L.validateHide({ hidden: true }), "reason", "reason");
refused(L.validateHide({ hidden: true, reason: "   " }), "reason", "reason");
refused(L.validateHide({ hidden: true, reason: "r".repeat(201) }), "invalid", "reason");
assert.deepEqual(fine(L.validateHide({ hidden: true, reason: "  spam   here " })), { hidden: true, reason: "spam here" });
assert.deepEqual(fine(L.validateHide({ hidden: false })), { hidden: false, reason: "" }, "a reason is optional to unhide");
refused(L.validateHide({ hidden: "yes" }), "invalid", "hidden");
assert.equal(fine(L.validateEditField("title", "  New   title ")), "New title");
refused(L.validateEditField("title", "ab"), "invalid", "title");
refused(L.validateEditField("description", "short"), "invalid", "description");
assert.equal(fine(L.validateEditField("area", "other")), "other");
refused(L.validateEditField("area", "moon"), "invalid", "area");
refused(L.validateEditField("status", "shipped"), "invalid", "status");

// ---------- rate limits: 3 ideas a Central day, 20 comments and 60 vote changes an hour ----------
assert.deepEqual([L.LIMITS.submit.count, L.LIMITS.comment.count, L.LIMITS.vote.count], [3, 20, 60]);
assert.equal(L.overLimit("submit", 2), false); assert.equal(L.overLimit("submit", 3), true);
assert.equal(L.overLimit("comment", 19), false); assert.equal(L.overLimit("comment", 20), true);
assert.equal(L.overLimit("vote", 59), false); assert.equal(L.overLimit("vote", 60), true);
// the Central day, not the UTC day: 2026-10-12 04:30 UTC is still Oct 11 evening in Chicago; 06:00 UTC is Oct 12 morning
const lateUtc = Date.UTC(2026, 9, 12, 4, 30), nextUtc = Date.UTC(2026, 9, 12, 6, 0);
assert.notEqual(L.periodKey("submit", lateUtc, dayKey), L.periodKey("submit", nextUtc, dayKey), "the daily window turns at Central midnight");
assert.equal(L.periodKey("submit", Date.UTC(2026, 9, 12, 14, 0), dayKey), L.periodKey("submit", Date.UTC(2026, 9, 12, 22, 59), dayKey), "one window for the whole Central day");
assert.equal(L.periodKey("vote", Date.UTC(2026, 9, 12, 14, 5), dayKey), "2026101214");
assert.notEqual(L.periodKey("vote", Date.UTC(2026, 9, 12, 14, 59), dayKey), L.periodKey("vote", Date.UTC(2026, 9, 12, 15, 0), dayKey), "the hourly window turns on the hour");
assert.throws(() => L.periodKey("nope", 0, dayKey));
assert.ok(L.limitTtlMs("submit") >= L.DAY_MS && L.limitTtlMs("comment") >= L.HOUR_MS);

// ---------- votes: closed on hidden, shipped and declined ideas ----------
assert.equal(L.voteRefusal({ status: "submitted", hidden: false }), null);
for (const status of ["under_review", "planned", "in_progress"]) assert.equal(L.voteRefusal({ status }), null);
assert.equal(L.voteRefusal({ status: "shipped" }).reason, "closed");
assert.equal(L.voteRefusal({ status: "declined" }).reason, "closed");
assert.equal(L.voteRefusal({ status: "planned", hidden: true }).reason, "hidden");
assert.equal(L.voteRefusal(null).reason, "noIdea");

// ---------- triage ----------
const by = { uid: "adm", handle: "boss" }, at = 1234;
const idea = (o = {}) => ({ title: "T", status: "submitted", priority: null, statusHistory: [{ status: "submitted" }], ...o });
const plan = (i, input, ctx = { by, at }) => L.planTriage(i, { before: { status: i.status, priority: i.priority ?? null }, ...input }, ctx);

// a real status change adds exactly one history entry, with the note when there is one
let p = plan(idea(), { status: "under_review" });
assert.equal(p.ok, true); assert.equal(p.statusChanged, true); assert.deepEqual(p.patch, { status: "under_review" });
assert.deepEqual(p.historyEntry, { status: "under_review", changedBy: by, changedAt: at });
assert.equal(p.firstTriage, true, "the first move out of Submitted");
assert.equal(p.firstShipped, false);
p = plan(idea(), { status: "planned", note: "  We'll do it in November.  " });
assert.deepEqual(p.historyEntry, { status: "planned", changedBy: by, changedAt: at, note: "We'll do it in November." });
// a note alone adds a note entry and changes nothing else
p = plan(idea({ status: "planned" }), { note: "Waiting on the Vault work." });
assert.equal(p.statusChanged, false); assert.deepEqual(p.patch, {});
assert.deepEqual(p.historyEntry, { kind: "note", note: "Waiting on the Vault work.", changedBy: by, changedAt: at });
assert.equal(p.firstTriage, false); assert.equal(p.firstShipped, false);
// the same status again with a note is a note, not a status change
p = plan(idea({ status: "planned" }), { status: "planned", note: "Still on it." });
assert.equal(p.statusChanged, false); assert.equal(p.historyEntry.kind, "note");
// a priority alone adds no history
p = plan(idea(), { priority: "high" });
assert.equal(p.ok, true); assert.deepEqual(p.patch, { priority: "high" }); assert.equal(p.historyEntry, null); assert.equal(p.statusChanged, false); assert.equal(p.firstTriage, false);
p = plan(idea({ priority: "high" }), { priority: null });
assert.deepEqual(p.patch, { priority: null }, "priority can be cleared"); assert.equal(p.historyEntry, null);
// status and priority together: one entry for the status change
p = plan(idea(), { status: "in_progress", priority: "medium", note: "Started." });
assert.deepEqual(p.patch, { status: "in_progress", priority: "medium" }); assert.equal(p.historyEntry.status, "in_progress"); assert.equal(p.historyEntry.note, "Started.");
// an empty save is refused, and so is one that repeats the current values
refused(plan(idea(), {}), "nothing");
refused(plan(idea(), { status: "submitted" }), "nothing");
refused(plan(idea({ priority: "low" }), { priority: "low" }), "nothing");
refused(plan(idea(), { note: "   " }), "nothing");
// bad input
refused(plan(idea(), { status: "done" }), "invalid", "status");
refused(plan(idea(), { priority: "urgent" }), "invalid", "priority");
refused(plan(idea(), { note: "n".repeat(1001) }), "invalid", "note");
refused(plan(idea(), { note: 5 }), "invalid", "note");
refused(L.planTriage(null, { status: "planned", before: { status: "submitted" } }, { by, at }), "noIdea");
refused(L.planTriage(idea(), { status: "planned" }, { by, at }), "args", "before");
// conflicts: the form loaded an older status or priority
refused(L.planTriage(idea({ status: "planned" }), { status: "shipped", before: { status: "submitted", priority: null } }, { by, at }), "conflict", "status");
refused(L.planTriage(idea({ priority: "high" }), { priority: "low", before: { status: "submitted", priority: null } }, { by, at }), "conflict", "priority");
assert.equal(L.planTriage(idea({ priority: "high" }), { priority: "low", before: { status: "submitted" } }, { by, at }).ok, true, "before.priority is only checked when it is sent");

// the one-time rewards: Gears on the first move out of Submitted, The Architect on the first Shipped, never twice
p = plan(idea(), { status: "shipped" });
assert.equal(p.firstTriage, true); assert.equal(p.firstShipped, true, "straight to Shipped is both");
p = plan(idea({ status: "under_review", firstTriagedAt: 1 }), { status: "shipped" });
assert.equal(p.firstTriage, false); assert.equal(p.firstShipped, true);
p = plan(idea({ status: "shipped", firstTriagedAt: 1, shippedAt: 2 }), { status: "planned" });
assert.equal(p.firstTriage, false); assert.equal(p.firstShipped, false); assert.equal(p.statusChanged, true, "shipped can be moved back");
p = plan(idea({ status: "planned", firstTriagedAt: 1, shippedAt: 2 }), { status: "shipped" });
assert.equal(p.firstShipped, false, "shipped again pays nothing");
p = plan(idea({ status: "declined", firstTriagedAt: 1 }), { status: "submitted" });
assert.equal(p.statusChanged, true); assert.equal(p.firstTriage, false);
p = plan(idea({ status: "submitted" }), { status: "declined" });
assert.equal(p.firstTriage, true, "declining out of Submitted is a review too");
p = plan(idea({ status: "under_review" }), { status: "submitted" });
assert.equal(p.firstTriage, false, "moving back to Submitted is not a first review");
// every status can be reached
for (const s of L.STATUSES) { const q = plan(idea({ status: s === "planned" ? "submitted" : "planned", firstTriagedAt: 1 }), { status: s }); assert.equal(q.ok, true, s); assert.equal(q.to, s); }

// ---------- delete: the owner, A2 and A3; a Steward hides instead ----------
const a2plus = (w) => w.isOwner || (w.isAdmin && w.roster?.track === "admin" && w.roster.grade >= 2);
assert.equal(L.canDelete({ isOwner: true, isAdmin: true }, a2plus), true);
assert.equal(L.canDelete({ isAdmin: true, roster: { track: "admin", grade: 3 } }, a2plus), true, "A3 Right Hand");
assert.equal(L.canDelete({ isAdmin: true, roster: { track: "admin", grade: 2 } }, a2plus), true, "A2 Overseer");
assert.equal(L.canDelete({ isAdmin: true, roster: { track: "admin", grade: 1 } }, a2plus), false, "A1 Steward");
assert.equal(L.canDelete({ isAdmin: true, roster: null }, a2plus), false, "an admin with no crew entry is treated as a Steward");
assert.equal(L.canDelete({ isMod: true, roster: { track: "mod", grade: 4 } }, a2plus), false, "no mod deletes");
assert.equal(L.canDelete(null, a2plus), false);
const snap = L.snapshotOf({ title: "T", description: "d".repeat(3000), area: "site", status: "planned", by: { uid: "u", handle: "gbo" }, secret: "x" });
assert.deepEqual(Object.keys(snap).sort(), ["area", "author", "description", "status", "title"], "text only");
assert.equal(snap.description.length, 2000); assert.equal(snap.author, "@gbo");

console.log("check-lab: ok");
