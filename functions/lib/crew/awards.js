// Monthly crew awards (docs/specs/mod-machina.md section 5): Top Gear (automatic, most Gears) and Fan Favourite
// (a member vote in the last 5 days of the month). Boomer's Blessing stays the owner's, outside this file.
//
//   fanFavouriteBallot()             -> { open, month, closesAt, candidates, canVote, reason, myVote }
//   fanFavouriteVote({ uid })        one vote per member; results stay hidden until the month closes
//   crewMonthlyAwards (1st 00:05 Central) -> awards/{yyyy-mm} for the month just ended, two 150 XP trophies
// Ballot = crew in good standing who are not admins (admins race but never win crew awards), with at least 2 counted duties
// that month once the activity rules are on (phase 3 part 7); before that "at least 2 duties that month" is "Active that month". Voters = members at least 14 days old with a
// Night Shift check-in that month (the stream check-in fallback); crew can't vote.
const { onCall } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const L = require("./logic");
const { SITE_ID, paths, loadSettings } = require("./settings");
const { makeStore, fail, ms } = require("./store");
const { dayKey, WEEK_TZ } = require("../arcade/logic");

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthLabel = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const prevMonth = (ym) => { const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; };
const daysIn = (ym) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();

/** The vote window: the last 5 days of the month, Central. day = "2026-10-27". */
function voteWindow(day) {
  const ym = day.slice(0, 7), d = Number(day.slice(8, 10)), dim = daysIn(ym);
  return { open: d > dim - 5, month: ym, opensOn: `${ym}-${String(dim - 4).padStart(2, "0")}`, closesOn: `${ym}-${String(dim).padStart(2, "0")}` };
}

/**
 * Top Gear: most Gears that month; a tie goes to more duty hours, then to whoever reached their total first.
 * entries: [{ uid, gears, hours, reachedAtMs }]. Returns the winner entry or null.
 */
function pickTopGear(entries) {
  const live = entries.filter((e) => e.gears > 0);
  live.sort((a, b) => b.gears - a.gears || (b.hours || 0) - (a.hours || 0) || (a.reachedAtMs || 0) - (b.reachedAtMs || 0) || String(a.uid).localeCompare(String(b.uid)));
  return live[0] || null;
}
/** Fan Favourite: most votes; ties go to more Gears that month, then the longer-serving. entries: [{ uid, votes, gears, sinceMs }]. */
function pickFanFavourite(entries) {
  const live = entries.filter((e) => e.votes > 0);
  live.sort((a, b) => b.votes - a.votes || (b.gears || 0) - (a.gears || 0) || (a.sinceMs || 0) - (b.sinceMs || 0) || String(a.uid).localeCompare(String(b.uid)));
  return live[0] || null;
}

module.exports = function crewAwards({ adminLogEntry, now = () => Date.now() } = {}) {
  const S = makeStore({ adminLogEntry });
  const { db, FieldValue, Timestamp } = S;
  const grant = require("../rewards/grant").makeGrant({ db });
  const rosterCol = () => db.collection(`${paths.settings()}/roster`);

  /** Crew who can win the awards for month `ym`: in good standing, not admins, and (rules on) at least 2 counted duties that month. */
  async function ballot(ym) {
    const [snap, settings] = await Promise.all([rosterCol().get(), loadSettings(db)]);
    let docs = snap.docs.filter((d) => d.get("track") !== "admin" && ["active", "checkIn"].includes(d.get("status")));
    if (settings.activityRules === true && ym) {
      const t = await require("./activity").makeActivity({ db, Timestamp, adminLogEntry }).tallyMonth(ym, { upTo: now() });
      docs = docs.filter((d) => ((t.by.get(d.id) || {}).counted || 0) >= 2);
    }
    const handles = await S.handlesOf(docs.map((d) => d.id));
    return docs.map((d) => ({ uid: d.id, handle: handles.get(d.id) || d.get("handle") || null, grade: d.get("grade"), sinceMs: ms(d.get("since")) }));
  }

  async function voterCheck(uid, at) {
    const [user, profile, member, roster, streak] = await Promise.all([
      db.doc(`users/${uid}`).get(), db.doc(`sites/${SITE_ID}/profiles/${uid}`).get(), db.doc(`sites/${SITE_ID}/members/${uid}`).get(),
      db.doc(paths.roster(uid)).get(), db.doc(`sites/${SITE_ID}/factory/main/streaks/${uid}`).get(),
    ]);
    const roles = member.exists ? member.get("roles") || [] : [];
    if (!user.get("signedUpAt") || !profile.exists) return "needsSignup";
    if (roster.exists || roles.includes("mod") || roles.includes("admin")) return "crewCantVote";
    if (!(at - ms(user.get("signedUpAt")) >= 14 * L.DAY_MS)) return "tooNew";
    if (L.monthCheckins(streak.get("recentDays"), dayKey(at)) < 1) return "needsCheckin";
    return null;
  }

  const fanFavouriteBallot = onCall(async (request) => {
    const uid = S.requireAuth(request);
    const at = now(), w = voteWindow(dayKey(at));
    const [vote, blocked] = await Promise.all([db.doc(paths.awardVote(w.month, uid)).get(), voterCheck(uid, at)]);
    return {
      open: w.open, month: w.month, opensOn: w.opensOn, closesOn: w.closesOn,
      candidates: w.open ? await ballot(w.month) : [],
      canVote: w.open && !blocked && !vote.exists, reason: !w.open ? "closed" : vote.exists ? "voted" : blocked,
      myVote: vote.exists ? vote.get("candidate") : null,      // your own vote only; nobody sees a tally before the close
    };
  });

  const fanFavouriteVote = onCall(async (request) => {
    const uid = S.requireAuth(request);
    const at = now(), w = voteWindow(dayKey(at));
    if (!w.open) throw fail("failed-precondition", "The vote opens in the last 5 days of the month.", "closed", { opensOn: w.opensOn });
    const candidate = request.data?.uid;
    if (typeof candidate !== "string" || !candidate) throw fail("invalid-argument", "uid is required.", "args");
    const blocked = await voterCheck(uid, at);
    if (blocked) throw fail("permission-denied", "You can't vote this month.", blocked);
    if (!(await ballot(w.month)).some((c) => c.uid === candidate)) throw fail("failed-precondition", "That person isn't on the ballot.", "notOnBallot");
    try {
      await db.doc(paths.awardVote(w.month, uid)).create({ candidate, atMs: at });
    } catch (err) {
      if (err.code === 6 || /already exists/i.test(err.message)) throw fail("already-exists", "You've already voted this month.", "voted");
      throw err;
    }
    return { ok: true, month: w.month };
  });

  /** Runs the awards for `ym` (default: the month that just ended). Safe to run twice. */
  async function runAwards(ym, at = now()) {
    ym = ym || prevMonth(dayKey(at).slice(0, 7));
    const ref = db.doc(paths.award(ym));
    const existing = await ref.get();
    if (existing.exists && existing.get("ranAt")) return { month: ym, skipped: true };
    const eligible = await ballot(ym);
    const byUid = new Map(eligible.map((c) => [c.uid, c]));
    const gearsSnap = await db.collection(`${paths.settings()}/gears`).get();
    const earned = new Map();
    for (const d of gearsSnap.docs) {
      const g = d.data();
      if (g.month !== ym || !byUid.has(g.uid)) continue;
      const e = earned.get(g.uid) || { uid: g.uid, gears: 0, hours: 0, reachedAtMs: 0 };
      e.gears += g.amount || 0; e.reachedAtMs = Math.max(e.reachedAtMs, g.atMs || 0);
      earned.set(g.uid, e);
    }
    const top = pickTopGear([...earned.values()]);
    const votes = (await db.collection(`${paths.award(ym)}/votes`).get()).docs.map((d) => d.get("candidate"));
    const tally = new Map();
    for (const c of votes) if (byUid.has(c)) tally.set(c, (tally.get(c) || 0) + 1);
    const fan = pickFanFavourite([...tally.entries()].map(([uid, n]) => ({ uid, votes: n, gears: earned.get(uid)?.gears || 0, sinceMs: byUid.get(uid).sinceMs })));
    const label = monthLabel(ym);
    const out = { month: ym, topGear: null, fanFavourite: null, ballot: eligible.map((c) => c.uid), votesCast: votes.length };
    for (const [key, win, kind, name, extra] of [
      ["topGear", top, "crew-top-gear", "Top Gear", top && { gears: top.gears }],
      ["fanFavourite", fan, "crew-fan-favourite", "Fan Favourite", fan && { votes: fan.votes }],
    ]) {
      if (!win) continue;
      const c = byUid.get(win.uid);
      await grant.grantTrophy(win.uid, { kind, place: 1, label: `${name} · ${label}`, period: ym, ref: ym });
      out[key] = { uid: win.uid, handle: c.handle, ...extra };
      await S.activity("crew-award", `${c.handle ? `@${c.handle}` : "A crew member"} won ${name} for ${label}`, c.handle ? `@${c.handle}` : null, { award: kind, month: ym });
    }
    await ref.set({ ...out, ranAt: Timestamp.fromMillis(at) }, { merge: true });
    return out;
  }

  const crewMonthlyAwards = onSchedule({ schedule: "5 0 1 * *", timeZone: WEEK_TZ, timeoutSeconds: 300 }, async () => {
    const r = await runAwards();
    console.log(`crewMonthlyAwards ${r.month}: ${r.skipped ? "already run" : `Top Gear ${r.topGear?.handle || r.topGear?.uid || "none"}, Fan Favourite ${r.fanFavourite?.handle || r.fanFavourite?.uid || "none"}`}`);
  });

  return { fanFavouriteBallot, fanFavouriteVote, crewMonthlyAwards };
};
module.exports.voteWindow = voteWindow;
module.exports.pickTopGear = pickTopGear;
module.exports.pickFanFavourite = pickFanFavourite;
module.exports.prevMonth = prevMonth;
module.exports.monthLabel = monthLabel;
