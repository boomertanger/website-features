// Fun Factory Cloud Functions (docs/specs/fun-factory.md §5, §10, §13a). Paths under
// sites/boomertanger/factory/main/ (§9); the engine is ./record.js, the pure rules ./logic.js.
//
//   factoryCheckIn()                  once per Central day: a checkin event and the streak (./streaks.js)
//   factoryVisit({ path })            a site section (allowlist), once per section per day
//   factoryHuntMedals({ path })       that page's medals for live hunts, each with a short-lived
//                                     claim token (never the other pages' medals)
//   factoryClaimMedal({ medalId, token })   one claim per member per medal
//   factoryStreakSweep                00:10 Central: missed check-ins spend streak savers, or break the streak
//   factoryTick                       every 5 minutes: go live, reveal, roll the boards, end the season (./season.js)
// The builder's callables (mods and admins) are in ./builder.js and come back from here too.
// Every member callable needs a signed-up member and is rate-limited per hour (rateLimits/{key}, the
// Arcade's pattern). Callable errors carry details.reason, like the other features.
const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const L = require("./logic");
const { makeFactory } = require("./record");
const { makeStreaks } = require("./streaks");
const { makeSeason } = require("./season");
const builder = require("./builder");

const SITE_ID = "boomertanger";
const LIMITS = { checkin: 30, visit: 120, hunt: 240, claim: 60 };   // per member per hour
const TOKEN_MINUTES = 30;
const fail = (code, message, reason, extra = {}) => new HttpsError(code, message, { reason, ...extra });
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const hourKey = (now) => new Date(now).toISOString().slice(0, 13).replace(/\D/g, "");

module.exports = function factory(deps = {}) {
  const db = admin.firestore();
  const { Timestamp } = admin.firestore;
  const F = makeFactory({ db });
  const Streaks = makeStreaks({ db });
  const Season = makeSeason({ db });
  const R = F.refs;

  async function member(request) {
    if (!request.auth) throw fail("unauthenticated", "Sign in first.", "signedOut");
    const uid = request.auth.uid;
    const who = await F.memberInfo(uid);
    if (!who.signedUp) throw fail("failed-precondition", "Finish signing up first.", "needsSignup");
    return { uid, who };
  }

  async function rateLimit(uid, kind) {
    const now = Date.now();
    const ref = R.site.collection("rateLimits").doc(`factory_${kind}_${sha256(`${uid}|${hourKey(now)}`).slice(0, 32)}`);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const count = snap.exists ? snap.get("count") || 0 : 0;
      if (count >= LIMITS[kind]) throw fail("resource-exhausted", "Slow down a little and try again later.", "rateLimit");
      tx.set(ref, { count: count + 1, expireAt: Timestamp.fromMillis(now + L.DAY_MS) }, { merge: true });
    });
  }

  // ---------- factoryCheckIn() ----------
  // The streak runs all year (never resets with the season); the checkin event only counts while a
  // season is live. Returns { day, streak: { current, best, savers, saversCap, already, spent,
  // earnedSaver, badges }, counted, completed }.
  const factoryCheckIn = onCall(async (request) => {
    const { uid, who } = await member(request);
    await rateLimit(uid, "checkin");
    const now = Date.now(), today = L.dayKey(now);
    const streak = await Streaks.checkIn(uid, who, now);
    if (!streak.already) await require("../crew/hooks").noteRecruitAction(uid, "checkin");   // Mod Machina: a recruit's first check-in
    const r = streak.already ? { counted: false, completed: [] } : await F.recordFactoryEvent(uid, "checkin", {}, today);
    return { ok: true, day: today, streak, counted: r.counted, completed: r.completed || [] };
  });

  // ---------- factoryStreakSweep (00:10 Central) ----------
  const factoryStreakSweep = onSchedule({ schedule: "every day 00:10", timeZone: L.TZ, timeoutSeconds: 540 }, async () => {
    const r = await Streaks.sweep(Date.now());
    console.log(`factoryStreakSweep: ${r.checked} late streaks, ${r.kept} kept by savers, ${r.broke} broken`);
  });

  // ---------- factoryVisit({ path }) ----------
  const factoryVisit = onCall(async (request) => {
    const { uid } = await member(request);
    const section = L.visitSection(request.data?.path);
    if (!section) throw fail("invalid-argument", "That page doesn't count.", "path");
    await rateLimit(uid, "visit");
    const r = await F.recordFactoryEvent(uid, "visit", { path: section }, `${section}:${L.dayKey(Date.now())}`);
    return { ok: true, section, counted: r.counted, completed: r.completed || [] };
  });

  // ---------- hidden medal hunts ----------
  // A hunt (hunts/{huntId}: activityId, name) lists medals (medals/{medalId}: path, position, hint).
  // Pages ask for their own path's medals; each comes with a claim token = HMAC(uid, medal, expiry)
  // under a server-only secret (private/huntSecret), so tokens are never stored. Each medal also says
  // how many of its hunt the member has (have) out of the activity's target (of), for "Medal 3 of 5 found".
  let secretCache = null;
  async function huntSecret() {
    if (secretCache) return secretCache;
    secretCache = await db.runTransaction(async (tx) => {
      const ref = R.private("huntSecret"), snap = await tx.get(ref);
      if (snap.exists && snap.get("value")) return snap.get("value");
      const value = crypto.randomBytes(32).toString("hex");
      tx.set(ref, { value, createdAt: Timestamp.now() });
      return value;
    });
    return secretCache;
  }
  const sign = (secret, uid, medalKey, exp) => crypto.createHmac("sha256", secret).update(`${uid}|${medalKey}|${exp}`).digest("hex").slice(0, 40);
  const normPath = (p) => (typeof p === "string" && p.startsWith("/") && p.length <= 200 ? (p.split(/[?#]/)[0].replace(/\/+$/, "") || "/").toLowerCase() : null);

  /** The live season's hunts whose activity is revealed, open now and meant for this member. */
  async function liveHunts(who, now) {
    const b = await F.liveBundle(now);
    if (!b || !L.seasonLive(b.season, now)) return { b, hunts: [] };
    const hunts = await R.hunts(b.season.id).get();
    const ok = hunts.docs.filter((h) => {
      const a = b.activities.find((x) => x.id === h.get("activityId"));
      const c = a && b.campaigns.get(a.campaignId);
      return a && a.typeId === "medals" && c && L.campaignOpen(c, b.season, now) && L.audienceOk(c.audience, who);
    });
    return { b, hunts: ok };
  }

  const factoryHuntMedals = onCall(async (request) => {
    const { uid, who } = await member(request);
    const path = normPath(request.data?.path);
    if (!path) throw fail("invalid-argument", "Unknown page.", "path");
    await rateLimit(uid, "hunt");
    const now = Date.now();
    const { b, hunts } = await liveHunts(who, now);
    if (!hunts.length) return { ok: true, medals: [] };
    const secret = await huntSecret();
    const exp = now + TOKEN_MINUTES * 60 * 1000;
    const out = [];
    let acts = null;   // the member's progress, read once if this page has medals: have / of for the toast
    for (const h of hunts) {
      const medals = await h.ref.collection("medals").where("path", "==", path).get();
      if (!medals.size) continue;
      if (!acts) { const p = await R.progress(b.season.id, uid).get(); acts = (p.exists && p.get("acts")) || {}; }
      const a = b.activities.find((x) => x.id === h.get("activityId"));
      const have = acts[a.id]?.count || 0, of = a.target || 1;
      for (const m of medals.docs) {
        const medalKey = `${h.id}/${m.id}`;
        const found = (await R.event(F.eventKey("medals", medalKey, uid)).get()).exists;
        out.push({
          medalId: medalKey, huntId: h.id, activityId: a.id, have, of, position: m.get("position") || null, hint: m.get("hint") || null, art: m.get("art") || null,
          found, ...(found ? {} : { token: `${exp}.${sign(secret, uid, medalKey, exp)}` }),
        });
      }
    }
    return { ok: true, seasonId: b.season.id, medals: out };
  });

  const factoryClaimMedal = onCall(async (request) => {
    const { uid, who } = await member(request);
    const { medalId, token } = request.data || {};
    if (typeof medalId !== "string" || !/^[\w-]{1,80}\/[\w-]{1,80}$/.test(medalId) || typeof token !== "string" || token.length > 80) {
      throw fail("invalid-argument", "medalId and token are required.", "args");
    }
    await rateLimit(uid, "claim");
    const now = Date.now();
    const [expStr, sig] = token.split(".");
    const exp = Number(expStr);
    const good = Number.isFinite(exp) && exp > now && typeof sig === "string" && sig.length === 40 && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(sign(await huntSecret(), uid, medalId, exp)));
    if (!good) throw fail("permission-denied", "That medal has slipped away. Refresh the page and try again.", "token");
    const [huntId, mid] = medalId.split("/");
    const { hunts } = await liveHunts(who, now);
    const hunt = hunts.find((h) => h.id === huntId);
    if (!hunt || !(await hunt.ref.collection("medals").doc(mid).get()).exists) throw fail("failed-precondition", "That hunt isn't running right now.", "huntClosed");
    const r = await F.recordFactoryEvent(uid, "medals", { huntId, medalId }, medalId, { keep: true });
    if (r.reason === "duplicate") return { ok: true, claimed: false, already: true };
    return { ok: true, claimed: true, counted: r.counted, completed: r.completed || [] };
  });

  // ---------- factoryTick (every 5 minutes, Central) ----------
  const factoryTick = onSchedule({ schedule: "every 5 minutes", timeZone: L.TZ, timeoutSeconds: 540 }, async () => {
    const log = await Season.tick(Date.now());
    if (log.length) console.log(`factoryTick: ${log.join("; ")}`);
  });

  return { factoryCheckIn, factoryVisit, factoryHuntMedals, factoryClaimMedal, factoryStreakSweep, factoryTick, ...builder(deps) };
};

module.exports.SITE_ID = SITE_ID;
