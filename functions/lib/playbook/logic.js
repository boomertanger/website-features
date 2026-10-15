// The Playbook (docs/specs/playbook.md): pure checks shared by the callable, the scheduler and the seed script. No Firestore here.
//   validatePage(fields)          { title, lede, body } -> { ok, value } | { ok: false, reason, field, message }
//   validateFlagText(text)        one Markdown paragraph
//   validateUpdate(update, ctx)   the `playbook-update` block (spec §5): { playbookUpdate: 1, pages[], flags[], decisions[] } against the ids that exist
//   monthStart(at), dateKey(at)   America/Los_Angeles (the review tick runs on the 1st, 06:00 Pacific)
//   reviewable(pageId)            every page but `flags` (a view of the flags, not a page to review)
// Messages are plain words for the owner; no Playbook text is ever quoted back.
const TZ = "America/Los_Angeles";
const LIMITS = { title: 120, lede: 600, body: 60000, flag: 2000, answer: 2000, decision: 1000, pages: 30, flags: 200, decisions: 100 };
const PAGE_ID = /^[a-z][a-z0-9-]{0,40}$/;
const FLAG_ID = /^f-[a-z0-9-]{1,80}$/;
const STATUSES = ["assumed", "open", "confirmed"];
const OPS = ["confirm", "answer", "edit", "add", "remove"];
const NOT_REVIEWED = new Set(["flags"]);

const dateKey = (at) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(at));
/** The first of `at`'s month in Los Angeles, as UTC milliseconds (its midnight there). */
function monthStart(at) {
  const ym = dateKey(at).slice(0, 7);
  for (const off of [7, 8]) { const t = Date.parse(`${ym}-01T00:00:00Z`) + off * 3600000; if (dateKey(t) === `${ym}-01` && dateKey(t - 1) !== `${ym}-01`) return t; }
  return Date.parse(`${ym}-01T08:00:00Z`);
}
const reviewable = (pageId) => !NOT_REVIEWED.has(pageId);
const bad = (reason, message, field) => ({ ok: false, reason, message, ...(field ? { field } : {}) });
const str = (v) => (typeof v === "string" ? v : null);

function validatePage(fields) {
  const title = str(fields.title), lede = str(fields.lede ?? ""), body = str(fields.body);
  if (!title || !title.trim()) return bad("bad-input", "The page needs a title.", "title");
  if (title.length > LIMITS.title) return bad("bad-input", `The title is longer than ${LIMITS.title} characters.`, "title");
  if (lede === null || lede.length > LIMITS.lede) return bad("bad-input", `The lede is longer than ${LIMITS.lede} characters.`, "lede");
  if (body === null || !body.trim()) return bad("bad-input", "The page body is empty.", "body");
  if (body.length > LIMITS.body) return bad("bad-input", "The page body is too long.", "body");
  return { ok: true, value: { title: title.trim(), lede: lede.trim(), body } };
}
function validateFlagText(text, field = "text", max = LIMITS.flag) {
  const t = str(text);
  if (!t || !t.trim()) return bad("bad-input", "Write the text first.", field);
  if (t.length > max) return bad("bad-input", `That's longer than ${max} characters.`, field);
  if (/\n\s*\n/.test(t.trim())) return bad("bad-input", "Keep it to one paragraph.", field);
  return { ok: true, value: t.trim() };
}

/**
 * The update block from a review chat. ctx = { pageIds: Set, flagIds: Set }. Returns { ok, value: { pages, flags, decisions } } or a plain-words reason.
 * Unknown page or flag ids are refused (spec §9); nothing is half-applied, because the caller applies it in one transaction.
 */
function validateUpdate(update, ctx) {
  if (!update || typeof update !== "object" || Array.isArray(update)) return bad("bad-update", "The update isn't a JSON object.");
  if (update.playbookUpdate !== 1) return bad("bad-update", "The update needs \"playbookUpdate\": 1.");
  const pages = update.pages ?? [], flags = update.flags ?? [], decisions = update.decisions ?? [];
  if (![pages, flags, decisions].every(Array.isArray)) return bad("bad-update", "pages, flags and decisions must be lists.");
  if (pages.length > LIMITS.pages || flags.length > LIMITS.flags || decisions.length > LIMITS.decisions) return bad("bad-update", "The update is too big to apply at once.");
  if (!pages.length && !flags.length && !decisions.length) return bad("bad-update", "The update has nothing in it.");
  const outPages = [], seen = new Set();
  for (const [i, p] of pages.entries()) {
    if (!p || typeof p.id !== "string" || !ctx.pageIds.has(p.id)) return bad("unknown-page", `Page ${i + 1} in the update isn't a Playbook page${p && typeof p.id === "string" ? ` (${p.id.slice(0, 40)})` : ""}.`);
    if (seen.has(p.id)) return bad("bad-update", `The page ${p.id} appears twice.`);
    seen.add(p.id);
    const has = (k) => p[k] !== undefined;
    if (!has("title") && !has("lede") && !has("body") && p.markReviewed !== true) return bad("bad-update", `The page ${p.id} has no changes.`);
    for (const k of ["title", "lede", "body"]) if (has(k) && typeof p[k] !== "string") return bad("bad-update", `The ${k} of ${p.id} must be text.`);
    if (has("title") && (!p.title.trim() || p.title.length > LIMITS.title)) return bad("bad-update", `The title of ${p.id} is empty or too long.`);
    if (has("lede") && p.lede.length > LIMITS.lede) return bad("bad-update", `The lede of ${p.id} is too long.`);
    if (has("body") && (!p.body.trim() || p.body.length > LIMITS.body)) return bad("bad-update", `The body of ${p.id} is empty or too long.`);
    outPages.push({ id: p.id, ...(has("title") ? { title: p.title.trim() } : {}), ...(has("lede") ? { lede: p.lede.trim() } : {}), ...(has("body") ? { body: p.body } : {}), markReviewed: p.markReviewed === true });
  }
  const outFlags = [];
  for (const [i, f] of flags.entries()) {
    const n = `Flag change ${i + 1}`;
    if (!f || !OPS.includes(f.op)) return bad("bad-update", `${n} has no known op (confirm, answer, edit, add, remove).`);
    if (f.op === "add") {
      if (typeof f.pageId !== "string" || !ctx.pageIds.has(f.pageId)) return bad("unknown-page", `${n} adds a flag to a page that doesn't exist.`);
      const status = f.status || "open";
      if (!["open", "assumed"].includes(status)) return bad("bad-update", `${n}: a new flag is open or assumed.`);
      const t = validateFlagText(f.text); if (!t.ok) return bad("bad-update", `${n}: ${t.message}`);
      outFlags.push({ op: "add", pageId: f.pageId, status, text: t.value });
      continue;
    }
    if (typeof f.id !== "string" || !ctx.flagIds.has(f.id)) return bad("unknown-flag", `${n} points at a flag that doesn't exist.`);
    if (f.op === "answer") { const t = validateFlagText(f.answer, "answer", LIMITS.answer); if (!t.ok) return bad("bad-update", `${n}: ${t.message}`); outFlags.push({ op: "answer", id: f.id, answer: t.value }); continue; }
    if (f.op === "edit") { const t = validateFlagText(f.text); if (!t.ok) return bad("bad-update", `${n}: ${t.message}`); if (f.status !== undefined && !STATUSES.includes(f.status)) return bad("bad-update", `${n}: unknown status.`); outFlags.push({ op: "edit", id: f.id, text: t.value, ...(f.status ? { status: f.status } : {}) }); continue; }
    outFlags.push({ op: f.op, id: f.id });
  }
  const outDecisions = [];
  for (const [i, d] of decisions.entries()) {
    const t = validateFlagText(d && d.text, "text", LIMITS.decision); if (!t.ok) return bad("bad-update", `Decision ${i + 1}: ${t.message}`);
    if (d.pageId !== undefined && (typeof d.pageId !== "string" || !ctx.pageIds.has(d.pageId))) return bad("unknown-page", `Decision ${i + 1} points at a page that doesn't exist.`);
    outDecisions.push({ text: t.value, ...(d.pageId ? { pageId: d.pageId } : {}) });
  }
  return { ok: true, value: { pages: outPages, flags: outFlags, decisions: outDecisions } };
}

module.exports = { TZ, LIMITS, PAGE_ID, FLAG_ID, STATUSES, OPS, dateKey, monthStart, reviewable, validatePage, validateFlagText, validateUpdate };
