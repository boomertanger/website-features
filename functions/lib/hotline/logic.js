// Hotline Boom, the pure rules (docs/specs/hotline-boom.md §3 to §5). No I/O: lib/hotline/index.js and scripts/check-hotline.js both use these.
//
//   LINES / LINE_IDS / lineByKey     the six lines: key 1-6, id, title, lane (team | owner), reply-from address, extra fields
//   DEFAULT_MAIN, mergeMain          the hotline/main settings doc with its defaults
//   validateSend(input, ctx)         -> { ok, value } | { ok: false, reason: "bad-input", field, message }
//   nameCheck(text, crew)            -> { uid, handle, grade } | null (whole word, case-insensitive, 3+ chars; the owner never in `crew`)
//   pickLane(line, { onlyOwner, namecheck })   -> "team" | "owner"
//   countLinks(text), cleanVia(v), monthKey(ms), audienceFor(lane, ownerUid, inboxAdmins)
const LINES = [
  { key: 1, id: "hi", title: "Say hi", lane: "team", from: "fanmail" },
  { key: 2, id: "feedback", title: "Feedback", lane: "team", from: "fanmail" },
  { key: 3, id: "help", title: "Account help", lane: "team", from: "support" },
  { key: 4, id: "business", title: "Business & collabs", lane: "owner", from: "business" },
  { key: 5, id: "private", title: "Private matter", lane: "owner", from: "fanmail" },
  { key: 6, id: "report", title: "Report a person", lane: "owner", from: "support" },
];
const LINE_IDS = LINES.map((l) => l.id);
const lineById = (id) => LINES.find((l) => l.id === id) || null;
const FROM = ["business", "fanmail", "support", "privacy"];
const STATUSES = ["new", "open", "waiting", "done", "spam"];
const ABOUT = ["stream", "website", "game", "crew", "other"];
const MOODS = ["loved", "okay", "notgreat"];
const KINDS = ["sponsorship", "collab", "gamekey", "press", "other"];
const TIMELINES = ["norush", "month", "twoweeks", "urgent"];
const SOURCES = ["twitch", "youtube", "tiktok", "instagram", "search", "friend", "streamer", "community", "other"];
const GRADES = ["A1", "A2", "A3"];
const MAX_BODY = 5000;
const MAX_LINKS = 5;
const REF_START = 4800;
const DAY_MS = 86400000;
const KEEP_MS = 730 * DAY_MS;            // 2 years
const SPAM_KEEP_MS = 30 * DAY_MS;

const DEFAULT_MAIN = {
  inboxGrades: ["A2", "A3"], replyTime: "3 days", lines: Object.fromEntries(LINE_IDS.map((id) => [id, true])),
  nameCheck: true, emailOwner: { business: true, private: true }, nextRef: REF_START,
};
function mergeMain(d) {
  const x = d || {};
  return { ...DEFAULT_MAIN, ...x, lines: { ...DEFAULT_MAIN.lines, ...(x.lines || {}) }, emailOwner: { ...DEFAULT_MAIN.emailOwner, ...(x.emailOwner || {}) },
    inboxGrades: Array.isArray(x.inboxGrades) ? x.inboxGrades.filter((g) => GRADES.includes(g)) : DEFAULT_MAIN.inboxGrades };
}

const str = (v) => (typeof v === "string" ? v.trim() : "");
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const bad = (field, message) => ({ ok: false, reason: "bad-input", field, message });

/**
 * The send, checked. input: { line, body, fields, name, email, source, onlyOwner }. ctx: { member (bool), ageBand, main }.
 * Lines off and Business for 13-17 return reason "line-off" (the same answer, so a minor learns nothing more).
 */
function validateSend(input, { member = false, ageBand = null, main = DEFAULT_MAIN } = {}) {
  const i = input || {};
  const line = lineById(i.line);
  if (!line) return bad("line", "Pick a line.");
  if (main.lines[line.id] === false) return { ok: false, reason: "line-off", field: "line", message: "That line is closed right now." };
  if (line.id === "business" && member && ageBand !== "18+") return { ok: false, reason: "line-off", field: "line", message: "That line isn't open to you." };
  const body = str(i.body);
  if (!body) return bad("body", "Write your message.");
  if (body.length > MAX_BODY) return bad("body", `Keep it under ${MAX_BODY.toLocaleString("en-US")} characters.`);
  let sender = null;
  if (!member) {
    const name = str(i.name), email = str(i.email).toLowerCase();
    if (!name) return bad("name", "Add your name.");
    if (name.length > 80) return bad("name", "That name is too long.");
    if (!EMAIL.test(email)) return bad("email", "That email doesn't look right.");
    sender = { name, email };
  }
  const f = i.fields && typeof i.fields === "object" ? i.fields : {};
  const fields = {};
  if (line.id === "feedback") {
    if (f.about != null) { if (!ABOUT.includes(f.about)) return bad("about", "Pick what it's about."); fields.about = f.about; }
    if (f.about === "stream" && f.stream != null) { const s = str(f.stream); if (!/^[A-Za-z0-9_-]{1,100}$/.test(s)) return bad("stream", "Pick a stream."); fields.stream = s; }
    if (f.mood != null && f.mood !== "") { if (!MOODS.includes(f.mood)) return bad("mood", "Pick a mood."); fields.mood = f.mood; }
  } else if (line.id === "business") {
    const company = str(f.company);
    if (!company) return bad("company", "Add the company or brand.");
    if (company.length > 120) return bad("company", "That's too long.");
    fields.company = company;
    const site = str(f.website);
    if (site) { if (site.length > 200 || !/^(https?:\/\/)?[^\s/$.?#].[^\s]*$/i.test(site)) return bad("website", "That website doesn't look right."); fields.website = site; }
    if (!KINDS.includes(f.kind)) return bad("kind", "Pick what kind.");
    fields.kind = f.kind;
    if (f.timeline != null && f.timeline !== "") { if (!TIMELINES.includes(f.timeline)) return bad("timeline", "Pick a timeline."); fields.timeline = f.timeline; }
  } else if (line.id === "report") {
    const who = str(f.who);
    if (!who) return bad("who", "Say who it's about.");
    if (who.length > 120) return bad("who", "That's too long.");
    fields.who = who;
  }
  const source = i.source == null || i.source === "" ? null : (SOURCES.includes(i.source) ? i.source : undefined);
  if (source === undefined) return bad("source", "Pick where you found Boomertanger.");
  return { ok: true, value: { line, body, fields, sender, source, onlyOwner: line.lane === "team" && i.onlyOwner === true } };
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The first crew member named in `text` (handles with or without @, display names); crew = [{ uid, handle, name, grade }] without the owner. */
function nameCheck(text, crew) {
  const hay = String(text || "");
  for (const c of crew || []) {
    for (const n of [c.handle, c.name]) {
      const w = String(n || "").trim();
      if (w.length < 3) continue;
      const re = new RegExp(`(^|[^\\p{L}\\p{N}_])@?${esc(w)}($|[^\\p{L}\\p{N}_])`, "iu");
      if (re.test(hay)) return { uid: c.uid, handle: c.handle || null, grade: c.grade ?? null };
    }
  }
  return null;
}

const pickLane = (line, { onlyOwner = false, namecheck = null } = {}) => (line.lane === "owner" || onlyOwner || namecheck ? "owner" : "team");
const countLinks = (text) => (String(text || "").match(/\bhttps?:\/\/|\bwww\./gi) || []).length;
/** ?via= or the referrer's host: lowercase letters, digits, dots and dashes, 60 at most; anything else is dropped. */
function cleanVia(v) {
  const s = str(v).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
  return /^[a-z0-9][a-z0-9.-]{0,59}$/.test(s) ? s : null;
}
/** "2026-10" for the stats docs (UTC is fine for monthly counts). */
const monthKey = (ms) => new Date(ms).toISOString().slice(0, 7);
/** Who hears about a new message: the owner, plus the inbox admins on the team lane only. */
const audienceFor = (lane, ownerUid, inboxAdmins = []) => [...new Set([ownerUid, ...(lane === "team" ? inboxAdmins : [])].filter(Boolean))];
const refLabel = (ref) => `BT-${ref}`;

module.exports = {
  LINES, LINE_IDS, lineById, FROM, STATUSES, ABOUT, MOODS, KINDS, TIMELINES, SOURCES, GRADES, MAX_BODY, MAX_LINKS, REF_START, DAY_MS, KEEP_MS, SPAM_KEEP_MS,
  DEFAULT_MAIN, mergeMain, validateSend, nameCheck, pickLane, countLinks, cleanVia, monthKey, audienceFor, refLabel,
};
