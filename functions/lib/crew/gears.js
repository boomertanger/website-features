// Gears (docs/specs/mod-machina.md section 4): crew-only points for helping, an append-only ledger at
// crew/main/gears/{source:ref:uid} (the doc id is the idempotency key, so nothing pays twice) and the
// boards rebuilt after each grant. Internal: features require() this; nothing here is callable.
//
//   makeGears({ db }) -> { grantGears, grantTask, grantRecruit, grantRecruitCheckin, grantQueueReview,
//                          grantAcademy, rebuildBoards }
//
// Phase 1 sources: task, recruit, recruitCheckin, queueReview, academy. Duty sources come in phase 3.
// Never earn Gears: timeouts, bans, deleted messages, raw message counts (they would reward spam).
const admin = require("firebase-admin");
const L = require("./logic");
const { SITE_ID, paths, loadSettings } = require("./settings");
const { dayKey } = require("../arcade/logic");

const SOURCES = ["task", "recruit", "recruitCheckin", "queueReview", "academy"];
const NEVER = ["timeout", "ban", "deletedMessage", "messages", "messageCount"];
const safe = (s) => String(s).replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 100);
const ms = (v) => (v == null ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : null);
const monthOf = (at) => dayKey(at).slice(0, 7);
/** The ledger key: source:ref:uid (spec 13). */
const gearKey = (source, ref, uid) => `${safe(source)}:${safe(ref)}:${safe(uid)}`;

function makeGears({ db = admin.firestore(), now = () => Date.now() } = {}) {
  const { FieldValue, Timestamp } = admin.firestore;
  const gearsCol = () => db.collection(`${paths.settings()}/gears`);

  async function grantGears(uid, source, ref, amount, extra = {}) {
    const n = Math.floor(Number(amount));
    if (!uid || !source || ref == null) throw new Error("grantGears: uid, source and ref are required");
    if (NEVER.includes(source) || !SOURCES.includes(source)) return { granted: false, reason: "badSource" };
    if (!(n > 0) || n > 1000) return { granted: false, reason: "badAmount" };
    const key = gearKey(source, ref, uid), at = now();
    const out = await db.runTransaction(async (tx) => {
      const [ledger, roster] = await Promise.all([tx.get(db.doc(paths.gear(key))), tx.get(db.doc(paths.roster(uid)))]);
      if (ledger.exists) return { granted: false, reason: "paid" };
      if (!roster.exists || roster.get("status") === "alumni") return { granted: false, reason: "notCrew" };
      tx.set(db.doc(paths.gear(key)), { uid, source, ref: String(ref), amount: n, month: monthOf(at), atMs: at, at: Timestamp.fromMillis(at), ...extra });
      return { granted: true, amount: n, key };
    });
    if (out.granted) { try { await rebuildBoards(at); } catch (err) { console.error("crew: board rebuild failed", err); } }
    return out;
  }

  async function sumThisMonth(uid, source, at) {
    const snap = await gearsCol().where("uid", "==", uid).get();
    const m = monthOf(at);
    return snap.docs.filter((d) => d.get("source") === source && d.get("month") === m).reduce((t, d) => t + (d.get("amount") || 0), 0);
  }
  const countThisMonth = async (uid, source, at) => {
    const snap = await gearsCol().where("uid", "==", uid).get();
    const m = monthOf(at);
    return snap.docs.filter((d) => d.get("source") === source && d.get("month") === m).length;
  };

  const grantTask = async (uid, taskId, amount) => grantGears(uid, "task", taskId, amount);
  const grantAcademy = async (uid, moduleId) => grantGears(uid, "academy", moduleId, (await loadSettings(db)).gearsValues.academyModule);
  /** A recruit counted: +10 for the referrer, up to recruitCapPerMonth recruits a month. */
  async function grantRecruit(referrerUid, newUid) {
    const s = await loadSettings(db), at = now();
    if (await countThisMonth(referrerUid, "recruit", at) >= s.recruitCapPerMonth) return { granted: false, reason: "monthlyCap" };
    return grantGears(referrerUid, "recruit", newUid, s.gearsValues.recruitActivated);
  }
  const grantRecruitCheckin = async (referrerUid, newUid) => grantGears(referrerUid, "recruitCheckin", newUid, (await loadSettings(db)).gearsValues.recruitFirstCheckin);
  /** A queue review (a vouch or a note): +2, at most 10 Gears a month. */
  async function grantQueueReview(uid, appId) {
    const s = await loadSettings(db), at = now(), v = s.gearsValues;
    if ((await sumThisMonth(uid, "queueReview", at)) + v.queueReview > v.queueReviewMonthlyCap) return { granted: false, reason: "monthlyCap" };
    return grantGears(uid, "queueReview", appId, v.queueReview);
  }

  /** Boards (spec 4b): month, season (Night Shift's live season, else the latest one) and all time. Admins are on them with a staff flag. */
  async function rebuildBoards(at = now()) {
    const [ledger, roster, seasons] = await Promise.all([gearsCol().get(), db.collection(`${paths.settings()}/roster`).get(), db.collection(`sites/${SITE_ID}/factory/main/seasons`).get()]);
    const live = seasons.docs.map((d) => d.data()).filter((s) => ["live", "ended"].includes(s.status) && s.startsAt)
      .sort((a, b) => (b.status === "live") - (a.status === "live") || ms(b.startsAt) - ms(a.startsAt))[0] || null;
    const onBoard = new Map(roster.docs.filter((d) => ["active", "checkIn", "goingDark"].includes(d.get("status"))).map((d) => [d.id, d.data()]));
    const ids = [...onBoard.keys()];
    const profiles = ids.length ? await db.getAll(...ids.map((u) => db.doc(`sites/${SITE_ID}/profiles/${u}`))) : [];
    const handleOf = new Map(profiles.map((p, i) => [ids[i], p.exists ? p.get("handle") || null : null]));   // the profile's handle is current; the roster copy can go stale
    const rowsFor = (inRange) => {
      const by = new Map();
      for (const d of ledger.docs) {
        const g = d.data();
        if (!onBoard.has(g.uid) || !inRange(g)) continue;
        const row = by.get(g.uid) || { gears: 0, recruits: 0 };
        row.gears += g.amount || 0;
        if (g.source === "recruit") row.recruits++;
        by.set(g.uid, row);
      }
      return [...onBoard.entries()].map(([uid, r]) => {
        const row = by.get(uid) || { gears: 0, recruits: 0 };
        return { uid, handle: handleOf.get(uid) || r.handle || null, track: r.track === "admin" ? "admin" : "mod", grade: r.grade, gears: row.gears, duties: 0, hours: 0, rooms: [], recruits: row.recruits, staff: r.track === "admin" };
      }).filter((r) => r.gears > 0 || r.recruits > 0)
        .sort((a, b) => b.gears - a.gears || b.recruits - a.recruits || String(a.handle).localeCompare(String(b.handle)))
        .map((r, i) => ({ ...r, place: i + 1 }));
    };
    const month = monthOf(at);
    const seasonStart = live ? ms(live.startsAt) : Infinity, seasonEnd = live ? ms(live.endsAt) || Infinity : Infinity;
    const boards = {
      month: { period: month, rows: rowsFor((g) => g.month === month) },
      season: { period: live ? live.name || live.id || "season" : null, rows: live ? rowsFor((g) => g.atMs >= seasonStart && g.atMs < seasonEnd) : [] },
      all: { period: "all", rows: rowsFor(() => true) },
    };
    await Promise.all(Object.entries(boards).map(([id, b]) => db.doc(paths.board(id)).set({ ...b, updatedAt: Timestamp.fromMillis(at) })));
    return boards;
  }

  return { grantGears, grantTask, grantRecruit, grantRecruitCheckin, grantQueueReview, grantAcademy, rebuildBoards };
}

module.exports = { makeGears, gearKey, SOURCES, NEVER };
