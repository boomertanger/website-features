// Creator Climb site members (docs/specs/creator-climb.md §9b, §10): the `site` block the morning collector adds to growthDaily/{day}, from the
// day the Back on air era starts (before that: null, and no queries). Count queries only, never a full read of the members:
//   members  = members docs − the left-out accounts that still exist (the owner always, plus climb/main.excludeUids)
//   joined   = members whose joinedAt falls on that Los Angeles day (the members doc's creation time, set by completeSignup)
//   left     = yesterday's members + joined − today's members (never negative; deleted accounts drop out of the total by themselves)
//   fanClub  = members (until billing exists), subClub = 0
//   byMethod = one count per members/{uid}.signInMethod (google, email, twitch); unknown = the rest (members from before it was recorded)
// The left-out accounts' own methods are subtracted from their groups. Also the YouTube goal the footer shares (climb/main.goals.youtube, 1000).
const { YOUTUBE_GOAL, TZ } = require("../growth/collect");

const METHODS = ["google", "email", "twitch"];

/** UTC ms of midnight at the start of a Los Angeles day (YYYY-MM-DD), DST-safe. */
function laMidnight(day, tz = TZ) {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 8);   // 08:00 UTC is midnight in LA in winter; correct by the zone's offset at that moment
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(guess));
  const h = Number(parts.find((p) => p.type === "hour").value), min = Number(parts.find((p) => p.type === "minute").value);
  return guess - (h * 60 + min) * 60000;
}
const nextDay = (day) => new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)) + 1)).toISOString().slice(0, 10);
const prevDay = (day) => new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)) - 1)).toISOString().slice(0, 10);

/** The climb settings the collector needs: the Back on air start day, the left-out uids, the YouTube goal. */
async function climbSettings(db, siteId) {
  const s = await db.doc(`sites/${siteId}/climb/main`).get();
  const d = s.exists ? s.data() : {};
  const eras = Array.isArray(d.eras) && d.eras.length ? d.eras : (d.import && d.import.eras) || [];
  const back = eras.find((e) => e && e.id === "back-on-air");
  const goal = d.goals && Number(d.goals.youtube) > 0 ? Number(d.goals.youtube) : YOUTUBE_GOAL;
  return { startDay: back && back.from ? back.from : null, excludeUids: Array.isArray(d.excludeUids) ? d.excludeUids : [], youtubeGoal: goal };
}

/** growthDaily/{day}.site, or null before the Back on air start day. Timestamp: admin.firestore.Timestamp. */
async function siteBlock({ db, siteId, day, Timestamp }) {
  const cfg = await climbSettings(db, siteId);
  if (!cfg.startDay || day < cfg.startDay) return null;
  const members = db.collection(`sites/${siteId}/members`);
  const n = async (q) => (await q.count().get()).data().count;
  const site = await db.doc(`sites/${siteId}`).get();
  const owner = site.exists ? site.get("ownerUid") : null;
  const leftOut = [...new Set([owner, ...cfg.excludeUids].filter(Boolean))];
  const leftDocs = leftOut.length ? await db.getAll(...leftOut.map((uid) => members.doc(uid))) : [];
  const leftExisting = leftDocs.filter((s) => s.exists);
  const from = Timestamp.fromMillis(laMidnight(day)), to = Timestamp.fromMillis(laMidnight(nextDay(day)));
  const [total, joinedAll, ...byM] = await Promise.all([
    n(members), n(members.where("joinedAt", ">=", from).where("joinedAt", "<", to)),
    ...METHODS.map((m) => n(members.where("signInMethod", "==", m))),
  ]);
  const inDay = (s) => { const j = s.get("joinedAt"); const ms = j && typeof j.toMillis === "function" ? j.toMillis() : null; return ms != null && ms >= from.toMillis() && ms < to.toMillis(); };
  const membersNow = Math.max(0, total - leftExisting.length);
  const joined = Math.max(0, joinedAll - leftExisting.filter(inDay).length);
  const byMethod = {};
  METHODS.forEach((m, i) => { byMethod[m] = Math.max(0, byM[i] - leftExisting.filter((s) => s.get("signInMethod") === m).length); });
  byMethod.unknown = Math.max(0, membersNow - METHODS.reduce((a, m) => a + byMethod[m], 0));
  const y = await db.doc(`sites/${siteId}/growthDaily/${prevDay(day)}`).get();
  const yesterday = y.exists && y.get("site") && typeof y.get("site.members") === "number" ? y.get("site.members") : null;
  const left = yesterday == null ? 0 : Math.max(0, yesterday + joined - membersNow);
  return { members: membersNow, joined, left, fanClub: membersNow, subClub: 0, byMethod };
}

module.exports = { siteBlock, climbSettings, laMidnight, METHODS };
