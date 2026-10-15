// Hotline Boom inbox recognition (Talk Back Part B, docs/specs/talk-back.md §9). What the inbox pays on Mod Machina's Gears ledger and what it
// counts for the This month strip and Operator of the Month. Used by lib/hotline/index.js (contactReply, contactAction) and the two scheduled
// runs (inboxSpamHold, inboxDeskCheck); scripts/inbox-sample.js runs the same code on staging with --as-of.
//
// Who earns (§9a): crew-roster admins whose grade is in hotline/main.inboxGrades (and not paused or alumni); never the owner; never on an
// owner-lane message; never on a message they sent. Values, caps and the Operator rules: crew/main.inbox (crew settings, §9g).
// What pays (§9b), each through grantGears with a keyed ledger id (${source}:${messageId|weekId}:${uid}) so nothing pays twice:
//   first reply (inboxReply) + fast (inboxFast, within fastHours of createdAt) + oldest first (inboxOldest, the oldest waiting team-lane
//   message at that moment, also for a close with no reply needed); spam that held (inboxSpam, after spamHoldDays, max spamDailyCap a day);
//   Clear desk (inboxDesk, 7 clear days in a row, to everyone who handled deskMinHandled that week). A daily cap (dailyCap, America/Chicago)
//   over every inbox source: over it nothing more is paid and the credit line says so.
// What never pays (§9c): escalation is neutral (gearsPaid moves with the message); a spam mark after a paid reply reverses it (adjustGears,
// reason "Marked as spam"); automatic spam and name-check hits (owner lane) never pay.
// inboxStats/{yyyy-mm} (Chicago months, §9g): perStaff.{uid}.{ replies, fast, oldest, minutes: { messageId: n }, spamMarks, spamHeld,
// spamOverturned, closed } and desk { streak, clearDays: [..], lastDay }. minutes is a map (message id -> minutes to the first reply) so an
// escalated or spammed message can drop out of the reply-time numbers.
const admin = require("firebase-admin");
const { dayKey } = require("../arcade/logic");
const { loadSettings, paths } = require("../crew/settings");
const { INBOX_LABELS } = require("../crew/gears");

const DAY_MS = 86400000, HOUR_MS = 3600000;
const ms = (t) => (t == null ? null : typeof t === "number" ? t : typeof t.toMillis === "function" ? t.toMillis() : null);
const monthOf = (at) => dayKey(at).slice(0, 7);
const prevMonth = (ym) => { const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; };
const addDay = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const median = (a) => { const s = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const WAITING = ["new", "open"];

function makeCredit({ db, now = () => Date.now(), gears, base, ownerUid, inboxAdmins, loadMain }) {
  const { FieldValue, Timestamp } = admin.firestore;
  const TS = (m) => Timestamp.fromMillis(m);
  const team = () => db.collection(`${base}/teamMessages`);
  const statsRef = (ym) => db.doc(`${base}/inboxStats/${ym}`);
  const values = async () => (await loadSettings(db)).inbox;

  /** True when uid earns on this message (§9a). */
  async function earns(uid, lane, msg, ctx = {}) {
    if (!uid || lane !== "team") return false;
    const owner = ctx.owner !== undefined ? ctx.owner : await ownerUid();
    if (uid === owner) return false;
    if (msg && msg.sender && msg.sender.uid === uid) return false;
    const admins = ctx.admins || await inboxAdmins(await loadMain());
    return admins.includes(uid);
  }
  /** The oldest waiting team-lane message (status new or open, no first reply yet), or null. */
  async function oldestWaiting() {
    const snap = await team().where("firstReplyAt", "==", null).get();
    const list = snap.docs.filter((d) => WAITING.includes(d.get("status"))).sort((a, b) => (ms(a.get("createdAt")) || 0) - (ms(b.get("createdAt")) || 0) || (a.id < b.id ? -1 : 1));
    return list.length ? list[0].id : null;
  }
  /** Pays the parts in order while the daily cap allows; returns the gearsPaid record (or a capped one). */
  async function pay(uid, id, parts, at) {
    const v = await values();
    let today = await gears.inboxToday(uid, at), amount = 0, capped = false;
    const ledgerIds = [], paid = {};
    for (const [source, n] of parts) {
      if (!(n > 0)) continue;
      if (today + n > v.dailyCap) { capped = true; continue; }
      const key = `${source}:${id}:${uid}`;
      const r = await gears.grantGears(uid, source, id, n, { key, label: INBOX_LABELS[source] });
      if (r.granted) { today += n; amount += n; ledgerIds.push(key); paid[source] = n; }
    }
    return { amount, uids: amount ? [uid] : [], ledgerIds, parts: paid, capped, cap: v.dailyCap, by: uid };
  }
  const stat = (ym, uid, patch) => statsRef(ym).set({ perStaff: { [uid]: patch } }, { merge: true });
  const inc = (n = 1) => FieldValue.increment(n);

  /** The first reply (or Mark as replied): the stats, then Gears when the replier earns. meta = { fast, oldest, minutes }. */
  async function onFirstReply({ lane, id, msg, uid, at, oldest }) {
    const v = await values();
    const created = ms(msg.createdAt) || at;
    const minutes = Math.max(0, Math.round((at - created) / 60000));
    const fast = at - created <= v.fastHours * HOUR_MS;
    const meta = { fast, oldest: !!oldest, minutes };
    if (!(await earns(uid, lane, msg))) return { meta, gearsPaid: null };
    await stat(monthOf(at), uid, { replies: inc(), ...(fast ? { fast: inc() } : {}), ...(oldest ? { oldest: inc() } : {}), minutes: { [id]: minutes } });
    const gearsPaid = await pay(uid, id, [["inboxReply", v.reply], ["inboxFast", fast ? v.fast : 0], ["inboxOldest", oldest ? v.oldest : 0]], at);
    return { meta, gearsPaid };
  }
  /** A close with no reply needed (status done before any reply): Tidied, and Oldest first when it was the oldest waiting. */
  async function onClose({ lane, id, msg, uid, at, oldest }) {
    if (!(await earns(uid, lane, msg))) return null;
    const v = await values();
    await stat(monthOf(at), uid, { closed: inc(), ...(oldest ? { oldest: inc() } : {}) });
    return oldest ? pay(uid, id, [["inboxOldest", v.oldest]], at) : null;
  }
  /** A message leaves the reply numbers (escalated or marked spam): its first reply's counts come off the month it was made in. */
  async function dropReply(id, msg) {
    if (!msg.firstReplyBy || !msg.firstReplyMeta || !msg.firstReplyAt) return;
    const ym = monthOf(ms(msg.firstReplyAt)), m = msg.firstReplyMeta;
    await statsRef(ym).set({ perStaff: { [msg.firstReplyBy]: { replies: inc(-1), ...(m.fast ? { fast: inc(-1) } : {}), ...(m.oldest ? { oldest: inc(-1) } : {}), minutes: { [id]: FieldValue.delete() } } } }, { merge: true });
  }
  /** Spam after a paid reply: every payment on the message is reversed (adjustGears, "Marked as spam"). Returns the new gearsPaid or null. */
  async function reverse(id, msg, by) {
    const g = msg.gearsPaid;
    if (!g || g.reversed || !g.amount) return null;
    for (const u of g.uids || []) await gears.adjustGears({ uid: u, amount: -g.amount, reason: "Marked as spam", by, ref: `spam-${id}`, reverses: g.ledgerIds || [] });
    return { ...g, reversed: true, reversedAt: TS(now()) };
  }
  /** A spam mark by a person (not the 5-links rule): who and when; the strip counts the mark. */
  async function onSpamMark(uid, lane, msg, at) {
    if (await earns(uid, lane, msg)) await stat(monthOf(at), uid, { spamMarks: inc() });
  }
  /** The owner un-spams someone else's mark: it was wrong (Accuracy). */
  async function onSpamOverturned(markedBy, at) {
    if (markedBy) await stat(monthOf(at), markedBy, { spamOverturned: inc() });
  }

  // ---------- inboxSpamHold (daily): spam that held for spamHoldDays pays 1 Gear, max spamDailyCap a day per person ----------
  async function spamHold(asOf = now()) {
    const v = await values();
    const owner = await ownerUid(), admins = await inboxAdmins(await loadMain());
    const snap = await team().where("status", "==", "spam").get();
    const due = snap.docs.filter((d) => d.get("spamBy") && !d.get("spamHeld") && (ms(d.get("spamAt")) || Infinity) <= asOf - v.spamHoldDays * DAY_MS)
      .sort((a, b) => (ms(a.get("spamAt")) || 0) - (ms(b.get("spamAt")) || 0));
    const day = dayKey(asOf), countToday = new Map();
    const todaySpam = async (uid) => {
      if (!countToday.has(uid)) {
        const l = await db.collection(`${paths.settings()}/gears`).where("uid", "==", uid).get();
        countToday.set(uid, l.docs.filter((x) => x.get("source") === "inboxSpam" && dayKey(x.get("atMs") || 0) === day).length);
      }
      return countToday.get(uid);
    };
    let paid = 0, held = 0, skipped = 0;
    for (const d of due) {
      const msg = d.data(), by = msg.spamBy;
      if (!(await earns(by, "team", msg, { owner, admins }))) { await d.ref.update({ spamHeld: { at: TS(asOf), paid: false, why: "not-earning" } }); skipped++; continue; }
      if ((await todaySpam(by)) >= v.spamDailyCap) { skipped++; continue; }   // waits for tomorrow's run
      const g = await pay(by, d.id, [["inboxSpam", v.spam]], asOf);
      if (g.amount) countToday.set(by, countToday.get(by) + 1);
      await d.ref.update({ spamHeld: { at: TS(asOf), paid: !!g.amount, amount: g.amount, ledgerIds: g.ledgerIds, capped: g.capped } });
      await stat(monthOf(asOf), by, { spamHeld: inc() });
      held++; if (g.amount) paid++;
    }
    return { due: due.length, held, paid, skipped };
  }

  // ---------- inboxDeskCheck (21:00 Central): a clear day, the streak, the Clear desk bonus ----------
  async function deskCheck(asOf = now()) {
    const v = await values();
    const day = dayKey(asOf), ym = day.slice(0, 7);
    const waiting = (await team().where("firstReplyAt", "==", null).get()).docs.filter((d) => WAITING.includes(d.get("status")) && (ms(d.get("createdAt")) || asOf) < asOf - v.deskStaleHours * HOUR_MS);
    const clear = waiting.length === 0;
    const [cur, prev] = await Promise.all([statsRef(ym).get(), statsRef(prevMonth(ym)).get()]);
    const desk = (cur.exists && cur.get("desk")) || null, prevDesk = (prev.exists && prev.get("desk")) || null;
    if (desk && desk.lastDay === day) return { day, clear: desk.lastClear, streak: desk.streak, already: true };
    let streak = desk ? desk.streak || 0 : prevDesk ? prevDesk.streak || 0 : 0;
    streak = clear ? streak + 1 : 0;
    let bonus = null;
    if (clear && streak >= 7) {
      // everyone who handled at least deskMinHandled team-lane messages in the 7 days: first replies, closes with no reply, spam marks
      const from = TS(Date.parse(`${addDay(day, -6)}T00:00:00Z`) - 12 * HOUR_MS);
      const handled = new Map();
      const add = (u) => { if (u) handled.set(u, (handled.get(u) || 0) + 1); };
      const [r, c, s] = await Promise.all([team().where("firstReplyAt", ">=", from).get(), team().where("closedAt", ">=", from).get(), team().where("spamAt", ">=", from).get()]);
      r.docs.forEach((d) => add(d.get("firstReplyBy"))); c.docs.forEach((d) => add(d.get("closedBy"))); s.docs.forEach((d) => add(d.get("spamBy")));
      const owner = await ownerUid(), admins = await inboxAdmins(await loadMain());
      const weekId = day;   // the 7-day run ending today
      bonus = { weekId, paid: [] };
      for (const [u, n] of handled) {
        if (n < v.deskMinHandled || u === owner || !admins.includes(u)) continue;
        const g = await pay(u, weekId, [["inboxDesk", v.desk]], asOf);
        if (g.amount) bonus.paid.push(u);
      }
      streak = 0;   // a new count starts
    }
    await statsRef(ym).set({ desk: { streak, lastDay: day, lastClear: clear, ...(clear ? { clearDays: FieldValue.arrayUnion(day) } : {}), ...(bonus ? { lastBonus: { day, uids: bonus.paid } } : {}) } }, { merge: true });
    return { day, clear, waiting: waiting.length, streak, bonus };
  }

  /** Operator of the Month (§9e) for month ym: score, the minimum, accuracy, ties to the lower median reply time. */
  async function operatorFor(ym) {
    const v = await values();
    if (v.operatorAward === false) return { off: true, winner: null };
    const snap = await statsRef(ym).get();
    const per = (snap.exists && snap.get("perStaff")) || {};
    const owner = await ownerUid();
    const rows = Object.entries(per).filter(([u]) => u !== owner).map(([uid, s]) => {
      const marks = (s.spamHeld || 0) + (s.spamOverturned || 0);
      const accuracy = marks ? (s.spamHeld || 0) / marks : 1;
      const med = median(Object.values(s.minutes || {}));
      return { uid, replies: s.replies || 0, spamHeld: s.spamHeld || 0, oldest: s.oldest || 0, accuracy, medianMinutes: med, score: (s.replies || 0) + 0.5 * (s.spamHeld || 0) + (s.oldest || 0) };
    }).filter((r) => r.replies >= v.operatorMin && r.accuracy >= v.operatorAccuracy);
    rows.sort((a, b) => b.score - a.score || (a.medianMinutes ?? Infinity) - (b.medianMinutes ?? Infinity) || String(a.uid).localeCompare(String(b.uid)));
    return { off: false, winner: rows[0] || null, candidates: rows.length };
  }

  return { earns, oldestWaiting, onFirstReply, onClose, dropReply, reverse, onSpamMark, onSpamOverturned, spamHold, deskCheck, operatorFor, monthOf, median };
}

module.exports = { makeCredit, median, monthOf };
