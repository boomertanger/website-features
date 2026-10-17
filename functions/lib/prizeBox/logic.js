// Prize Box pure logic (docs/specs/prize-box.md §3, §4, §6, §8): what a contest may hold, which status moves are allowed, who can win, the
// spin the server decides before anything animates, mail-in codes, claims and the public summary. No Firestore here: index.js reads and
// writes, this decides. Every refusal is { ok: false, code, reason, message, field? } (lib/boards raise() turns it into the HttpsError).
const crypto = require("crypto");

const DAY_MS = 24 * 60 * 60 * 1000;
const TYPES = ["live", "online", "mail"];
const STATUSES = ["draft", "scheduled", "open", "closed", "judging", "drawing", "won", "done", "cancelled"];
const METHODS = { live: ["wheel"], online: ["judge", "random"], mail: ["judge", "random"] };
const PRIZE_KINDS = ["digital", "storeCode", "mailed", "badgeXp"];
const BEATS = ["break1", "break2"];
const ENTRY_KINDS = ["upload", "text"];
const ENTRY_STATUSES = ["submitted", "accepted", "rejected", "withdrawn", "received"];
const WINNER_STATUSES = ["pending", "claimed", "shipped", "forfeited"];
const DEFAULT_SETTINGS = { cooldownDays: 30, claimDays: 7, hereSeconds: 60 };
// Eligibility filters (spec §3). "First stream here" and "stream streak" are left out: nothing stores a member's first stream or a
// stream streak yet (the site works the streak out on the page), so there is no data to filter on.
const FILTERS = ["badge", "nightShiftTop", "memberDays", "everyBeat"];
const ROUND1_MAX = 10, WHEEL = 10, PRIZES_MAX = 10, TITLE_MAX = 80, BLURB_MAX = 400, RULES_MAX = 20000, TEXT_MAX = 2000, ENTRY_TITLE_MAX = 60;
const REASON_MAX = 300, NOTE_MAX = 300;
const UPLOAD_FORMATS = ["jpg", "jpeg", "png", "webp"], UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";   // no 0/O, 1/I/L
const LIMITS = {
  enter: { max: 20, windowMs: 60 * 60 * 1000, message: "That's a lot of entries for one hour. Try again later." },
  code: { max: 10, windowMs: DAY_MS, message: "You've asked for a lot of codes today. Try again tomorrow." },
  claim: { max: 20, windowMs: 60 * 60 * 1000, message: "Too many tries. Wait a few minutes and try again." },
  here: { max: 30, windowMs: 60 * 60 * 1000, message: "Too many taps. Wait a moment." },
};
const US_STATES = new Set(("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR GU VI AS MP AA AE AP").split(" "));

const no = (reason, message, code = "invalid-argument", field) => ({ ok: false, code, reason, message, ...(field ? { field } : {}) });
const ms = (v) => (v == null ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : typeof v === "string" ? Date.parse(v) || null : null);
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const int = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
const periodKey = (kind, at) => String(Math.floor(at / LIMITS[kind].windowMs));

function slugify(s) {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "contest";
}

// ---------------------------------------------------------------- settings
function validateSettings(d = {}) {
  const out = {};
  if (d.cooldownDays != null) { const n = int(d.cooldownDays, 0, 365); if (n == null) return no("cooldownDays", "The cooldown is 0 to 365 days.", undefined, "cooldownDays"); out.cooldownDays = n; }
  if (d.claimDays != null) { const n = int(d.claimDays, 1, 60); if (n == null) return no("claimDays", "The claim window is 1 to 60 days.", undefined, "claimDays"); out.claimDays = n; }
  if (d.hereSeconds != null) { const n = int(d.hereSeconds, 15, 300); if (n == null) return no("hereSeconds", "The I'm here window is 15 to 300 seconds.", undefined, "hereSeconds"); out.hereSeconds = n; }
  let mailingAddress;
  if (d.mailingAddress != null) {
    mailingAddress = str(d.mailingAddress, 400);
    if (mailingAddress.split("\n").length > 6) return no("mailingAddress", "Keep the mailing address to six lines.", undefined, "mailingAddress");
  }
  if (!Object.keys(out).length && mailingAddress === undefined) return no("nothing", "Nothing to save.");
  return { ok: true, settings: out, mailingAddress };
}
const settingsOf = (main) => ({ ...DEFAULT_SETTINGS, ...((main && main.settings) || {}) });

// ---------------------------------------------------------------- contests
function validFilter(f, type) {
  if (!f || typeof f !== "object") return null;
  if (f.kind === "everyone") return { kind: "everyone" };
  if (f.kind === "badge") { const id = str(f.badgeId, 80); return /^[a-z0-9-]{2,80}$/.test(id) ? { kind: "badge", badgeId: id } : null; }
  if (f.kind === "nightShiftTop") { const n = int(f.n, 1, 100); return n ? { kind: "nightShiftTop", n } : null; }   // the season board keeps the top 100
  if (f.kind === "memberDays") { const n = int(f.n, 1, 3650); return n ? { kind: "memberDays", n } : null; }
  if (f.kind === "everyBeat") return type === "live" ? { kind: "everyBeat" } : null;
  return null;
}
/** The contest fields an admin may set (spec §6). `prev` is the stored contest when editing. Returns { ok, value } with the fields to write. */
function validateContest(d = {}, { prev = null, now = Date.now() } = {}) {
  const type = prev ? prev.type : d.type;
  if (!TYPES.includes(type)) return no("type", "Pick live, online or mail-in.", undefined, "type");
  const title = str(d.title, TITLE_MAX);
  if (title.length < 3) return no("title", "Give the contest a title (3 to 80 characters).", undefined, "title");
  const blurb = str(d.blurb, BLURB_MAX);
  const method = d.method == null && prev ? prev.method : d.method;
  if (!METHODS[type].includes(method)) return no("method", type === "live" ? "Live draws use the Prize Wheel." : "Pick judged or a random draw.", undefined, "method");
  const winnersCount = int(d.winnersCount, 1, PRIZES_MAX);
  if (!winnersCount) return no("winnersCount", "One to ten winners.", undefined, "winnersCount");
  if (type === "live" && winnersCount !== 1) return no("winnersCount", "A live draw has one winner per spin.", undefined, "winnersCount");
  const prizes = Array.isArray(d.prizes) ? d.prizes.slice(0, PRIZES_MAX).map((p, i) => ({
    place: int(p && p.place, 1, PRIZES_MAX) || i + 1, title: str(p && p.title, 120), kind: p && p.kind,
    xp: int(p && p.xp, 0, 1000) || 0,
  })) : [];
  if (prizes.length !== winnersCount) return no("prizes", "Add one prize per winner.", undefined, "prizes");
  for (const p of prizes) {
    if (!p.title) return no("prizes", "Every prize needs a title.", undefined, "prizes");
    if (!PRIZE_KINDS.includes(p.kind)) return no("prizes", "Pick a kind for every prize.", undefined, "prizes");
  }
  if (new Set(prizes.map((p) => p.place)).size !== prizes.length) return no("prizes", "Each place can have only one prize.", undefined, "prizes");
  prizes.sort((a, b) => a.place - b.place);
  const opensAt = ms(d.opensAt), closesAt = ms(d.closesAt);
  let draw = null;
  if (type === "live") {
    const beat = BEATS.includes(d.draw && d.draw.beat) ? d.draw.beat : null;
    if (!beat) return no("beat", "Pick the beat the draw runs at (Break 1 or Break 2).", undefined, "beat");
    const streamId = d.draw && typeof d.draw.streamId === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(d.draw.streamId) ? d.draw.streamId : null;
    draw = { beat, streamId };
  } else {
    if (!opensAt || !closesAt) return no("dates", "Set when entries open and close.", undefined, "closesAt");
    if (closesAt <= opensAt) return no("dates", "Entries must close after they open.", undefined, "closesAt");
    if (!prev && closesAt <= now) return no("dates", "The closing date is in the past.", undefined, "closesAt");
  }
  const entryKind = type === "online" ? (ENTRY_KINDS.includes(d.entryKind) ? d.entryKind : "upload") : null;
  const eligibility = (Array.isArray(d.eligibility) ? d.eligibility : []).map((f) => validFilter(f, type)).filter((f) => f && f.kind !== "everyone");
  if (eligibility.length > 5) return no("eligibility", "Use at most five entry rules.", undefined, "eligibility");
  let round1 = [];
  if (type === "live" && Array.isArray(d.round1) && d.round1.length) {
    round1 = d.round1.slice(0, ROUND1_MAX).map((g) => ({ group: str(g && g.group, 40), filter: validFilter(g && g.filter, "live") }));
    if (round1.some((g) => !g.group || !g.filter)) return no("round1", "Every Round 1 slice needs a name and a group.", undefined, "round1");
    if (round1.length < 2) return no("round1", "Round 1 needs at least two slices (a group may repeat to change the odds).", undefined, "round1");
  }
  const rulesMd = typeof d.rulesMd === "string" ? d.rulesMd.slice(0, RULES_MAX) : "";
  const a = d.announce || {};
  const announce = { banner: a.banner !== false, alerts: a.alerts !== false, feed: a.feed !== false, plannerTag: str(a.plannerTag, 40) || null };
  const slug = slugify(d.slug || title);
  return {
    ok: true,
    value: { slug, title, blurb, type, method, winnersCount, prizes, opensAt, closesAt, draw, entryKind, eligibility, round1, rulesMd, announce, audience: "members" },
  };
}

/** Allowed status moves (spec §6). Admin actions; prizeTick does scheduled → open and open → closed on time. */
const MOVES = {
  publish: { from: ["draft"], to: (c, now) => (c.type === "live" ? "scheduled" : (ms(c.opensAt) || 0) > now ? "scheduled" : "open") },
  open: { from: ["scheduled"], to: () => "open", notLive: true },
  close: { from: ["open"], to: (c) => (c.method === "judge" ? "judging" : "closed"), notLive: true },
  judging: { from: ["closed"], to: () => "judging", notLive: true },
  unpublish: { from: ["scheduled"], to: () => "draft" },
  cancel: { from: ["draft", "scheduled", "open", "closed", "judging", "drawing"], to: () => "cancelled" },
  done: { from: ["won"], to: () => "done" },
};
function planMove(c, action, now) {
  if (!c) return no("noContest", "This contest is no longer here.", "not-found");
  const m = MOVES[action];
  if (!m) return no("action", "That isn't a contest action.");
  if (m.notLive && c.type === "live") return no("live", "Live contests open and close with the draw.", "failed-precondition");
  if (!m.from.includes(c.status)) return no("status", `A ${c.status} contest can't do that.`, "failed-precondition");
  return { ok: true, to: m.to(c, now), from: c.status };
}
/** Who may change this contest: admins; live contests (the draw) are the owner's alone (spec §2). */
const canManage = (c, contest) => (contest && contest.type === "live" ? !!c.isOwner : !!c.isAdmin);

// ---------------------------------------------------------------- who can win (spec §2 "Who can win", §3)
/**
 * The person's standing: { member (members doc), profile, ownerUid, cooldownUntil (ms), badges: Set, nsRank (1-based or null), presence, stream }.
 * Returns null when they can enter, else the reason the page shows.
 */
function ineligible(p, contest, now = Date.now()) {
  const m = p.member || {};
  const roles = Array.isArray(m.roles) ? m.roles : [];
  if (!p.profile) return { reason: "needsSignup", message: "Finish signing up first." };
  if (p.uid && p.uid === p.ownerUid) return { reason: "crew", message: "Boomer runs the Prize Box, so he can't win it." };
  if (roles.includes("admin") || roles.includes("mod") || (m.crewGrade != null && !["alumni"].includes(String(m.crewStatus || "")))) return { reason: "crew", message: "Crew and admins can't win prizes." };
  if (contest.type === "live" && p.cooldownUntil && p.cooldownUntil > now) return { reason: "cooldown", message: "You won a live draw recently. You're back in the draw soon." };
  for (const f of contest.eligibility || []) {
    const why = filterMiss(f, p, now);
    if (why) return why;
  }
  return null;
}
function filterMiss(f, p, now) {
  if (f.kind === "badge" && !(p.badges && p.badges.has(f.badgeId))) return { reason: "badge", message: `This one needs the ${p.badgeNames && p.badgeNames[f.badgeId] ? p.badgeNames[f.badgeId] : f.badgeId} badge.` };
  if (f.kind === "nightShiftTop" && !(p.nsRank && p.nsRank <= f.n)) return { reason: "nightShiftTop", message: `This one is for the Night Shift top ${f.n} this season.` };
  if (f.kind === "memberDays") { const j = ms(p.member && p.member.joinedAt); if (!j || now - j < f.n * DAY_MS) return { reason: "memberDays", message: `This one is for members of at least ${f.n} days.` }; }
  if (f.kind === "everyBeat" && !(p.everyBeat === true)) return { reason: "everyBeat", message: "This one is for members checked in at every beat tonight." };
  return null;
}
/** Does a presence doc count as checked in to the stream (spec §4.2)? Crew and on-duty check-ins never do. */
const checkedIn = (pr) => !!(pr && pr.beats && Object.keys(pr.beats).length && !pr.crew && !pr.noPrize);

// ---------------------------------------------------------------- the spin (spec §4.5)
/** A uniform integer in [0, n) from crypto (the draw never uses Math.random). */
function randInt(n, rand = crypto.randomInt) { return n <= 1 ? 0 : rand(n); }
function shuffle(list, rand = crypto.randomInt) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1, rand); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
/**
 * The server's spin, decided before any animation: { pickIndex, offset (0.2–0.8 of the blade), spins (5–6), durationMs (7200–8400), startAt }.
 * `live` is the blade indexes that are real picks; the pick is uniform over the 10 blades, so an empty blade lands as "Spin again" (a re-pick).
 */
function planSpin({ now, leadMs = 1500, rand = crypto.randomInt }) {
  return {
    pickIndex: randInt(WHEEL, rand),
    offset: 0.2 + randInt(601, rand) / 1000,
    spins: 5 + randInt(2, rand),
    durationMs: 7200 + randInt(1201, rand),
    startAt: now + leadMs,
  };
}
/** Round 2's labels: up to 10 members of the pool at random, then empty "Spin again" blades. pool: [{ uid, handle }]. */
function roundTwo(pool, rand = crypto.randomInt) {
  const picks = shuffle(pool, rand).slice(0, WHEEL);
  const blades = Array.from({ length: WHEEL }, (_, i) => picks[i] || null);
  return { blades, labels: blades.map((b) => (b ? `@${b.handle}` : null)) };
}

// ---------------------------------------------------------------- mail-in codes
function makeCode(rand = crypto.randomInt) { let s = ""; for (let i = 0; i < 4; i++) s += CODE_ALPHABET[randInt(CODE_ALPHABET.length, rand)]; return `PB-${s}`; }
function normCode(v) {
  const s = String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = s.startsWith("PB") ? s.slice(2) : s;
  return /^[A-Z0-9]{4}$/.test(body) ? `PB-${body}` : null;
}
function validDate(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const t = Date.parse(`${v}T12:00:00Z`);
  return Number.isFinite(t) ? v : null;
}
/** Is the postmark on time? The postmark is a calendar date; the contest closes at closesAt (any time that day counts). */
function postmarkLate(postmarkedOn, closesAt, tz = "America/Chicago") {
  const close = new Date(ms(closesAt));
  const day = close.toLocaleDateString("en-CA", { timeZone: tz });
  return postmarkedOn > day;
}

// ---------------------------------------------------------------- entries
function validateEntry(d = {}, contest) {
  const showIfWin = d.showIfWin !== false;
  if (d.rulesOk !== true) return no("rules", "Tick that you've read the official rules.", undefined, "rulesOk");
  if (contest.entryKind === "text") {
    const text = str(d.text, TEXT_MAX);
    if (text.length < 2) return no("text", "Write your entry first.", undefined, "text");
    return { ok: true, value: { kind: "text", text, title: str(d.title, ENTRY_TITLE_MAX) || null, showIfWin } };
  }
  if (typeof d.publicId !== "string") return no("file", "Add your file first.", undefined, "file");
  return { ok: true, value: { kind: "upload", publicId: d.publicId, title: str(d.title, ENTRY_TITLE_MAX) || null, showIfWin } };
}
function uploadProblem(info) {
  if (!info) return "notFound";
  if (!UPLOAD_FORMATS.includes(String(info.format || "").toLowerCase())) return "format";
  if (!(info.bytes > 0) || info.bytes > UPLOAD_MAX_BYTES) return "tooBig";
  return null;
}
/** Can this member enter or replace now? */
function enterRefusal(contest, now) {
  if (!contest || contest.status === "draft") return no("noContest", "This contest isn't here.", "not-found");
  if (contest.type === "live") return no("live", "Everyone checked in to the stream is in a live draw. There's nothing to enter.", "failed-precondition");
  if (contest.status !== "open" || (ms(contest.closesAt) || 0) <= now) return no("closed", "Entries are closed.", "failed-precondition");
  return null;
}

// ---------------------------------------------------------------- claims (spec §2 "Prizes", "Legal")
function validateAddress(a) {
  if (!a || typeof a !== "object") return no("address", "Add the address to mail it to.", undefined, "address");
  const v = { name: str(a.name, 80), line1: str(a.line1, 120), line2: str(a.line2, 120), city: str(a.city, 80), state: str(a.state, 2).toUpperCase(), zip: str(a.zip, 10), country: str(a.country || "US", 2).toUpperCase() };
  if (v.country !== "US") return no("usOnly", "Prizes that ship go to US addresses only.", "failed-precondition", "country");
  if (!v.name || !v.line1 || !v.city) return no("address", "Fill in the name, street and city.", undefined, "address");
  if (!US_STATES.has(v.state)) return no("state", "Pick a US state.", undefined, "state");
  if (!/^\d{5}(-\d{4})?$/.test(v.zip)) return no("zip", "Use a 5-digit ZIP code.", undefined, "zip");
  return { ok: true, value: v };
}
function claimRefusal(w, uid, now) {
  if (!w || w.uid !== uid) return no("notYours", "This prize isn't yours.", "permission-denied");
  if (w.status === "claimed" || w.status === "shipped") return no("claimed", "You've already claimed this prize.", "failed-precondition");
  if (w.status === "forfeited") return no("forfeited", "The claim window for this prize has closed.", "failed-precondition");
  if ((ms(w.claimBy) || 0) < now) return no("late", "The claim window for this prize has closed.", "failed-precondition");
  return null;
}

// ---------------------------------------------------------------- the public summary (public/prizeBox)
const summaryOf = (c) => ({
  id: c.id, slug: c.slug, title: c.title, blurb: c.blurb || "", type: c.type, status: c.status, method: c.method,
  opensAt: ms(c.opensAt), closesAt: ms(c.closesAt), beat: c.draw ? c.draw.beat : null, streamId: c.draw ? c.draw.streamId || null : null,
  prizes: (c.prizes || []).map((p) => ({ place: p.place, title: p.title, kind: p.kind })),
  entries: (c.counts && c.counts.entries) || 0,
});
/** { contests: open and upcoming (and judging), winners: the latest 30 public wins, counts }. winners: [{ handle, contestTitle, prizeTitle, place, at, showIfWin }]. */
function buildSummary(contests, winners) {
  const live = contests.filter((c) => ["scheduled", "open", "closed", "judging", "drawing"].includes(c.status));
  const order = { open: 0, drawing: 1, judging: 2, closed: 3, scheduled: 4 };
  live.sort((a, b) => (order[a.status] - order[b.status]) || ((ms(a.closesAt) || ms(a.opensAt) || 0) - (ms(b.closesAt) || ms(b.opensAt) || 0)));
  const pub = winners.filter((w) => w.showIfWin !== false && w.status !== "forfeited").sort((a, b) => (ms(b.at) || 0) - (ms(a.at) || 0)).slice(0, 30)
    .map((w) => ({ handle: w.handle, contestTitle: w.contestTitle, contestSlug: w.contestSlug || null, prizeTitle: w.prizeTitle, place: w.place || 1, at: ms(w.at) }));
  const counts = { open: live.filter((c) => c.status === "open").length, upcoming: live.filter((c) => c.status === "scheduled").length, winners: winners.filter((w) => w.status !== "forfeited").length };
  return { contests: live.slice(0, 40).map(summaryOf), winners: pub, counts };
}

module.exports = {
  DAY_MS, TYPES, STATUSES, METHODS, PRIZE_KINDS, BEATS, ENTRY_KINDS, ENTRY_STATUSES, WINNER_STATUSES, DEFAULT_SETTINGS, FILTERS, WHEEL, LIMITS,
  UPLOAD_MAX_BYTES, REASON_MAX, NOTE_MAX, ms, str, int, periodKey, slugify, no,
  validateSettings, settingsOf, validateContest, planMove, canManage, ineligible, checkedIn, validFilter, filterMiss,
  randInt, shuffle, planSpin, roundTwo, makeCode, normCode, validDate, postmarkLate,
  validateEntry, uploadProblem, enterRefusal, validateAddress, claimRefusal, buildSummary, summaryOf,
};
