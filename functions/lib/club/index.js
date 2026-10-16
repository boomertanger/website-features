// Club Pass backend (docs/specs/club-pass.md §11, §12). functions/index.js calls build({ adminLogEntry }) and spreads .functions into
// its exports, the same way lib/climb does.
//
//   clubBroadcasterStart       owner: { redirectUri } -> { url, state }. Stores a one-time state (10 minutes) server-side at
//                              sites/boomertanger/private/twitchBroadcasterConnect; the site sends the owner to Twitch's consent screen.
//   clubBroadcasterConnect     owner: { code, state, redirectUri } from /auth/twitch/callback (mode "broadcaster"). Checks the state,
//                              swaps the code, checks the token is the Boomertanger channel's (TWITCH_LOGIN, and growthConfig's
//                              twitchBroadcasterId when known) with both scopes, then stores it (lib/twitchBroadcaster.js). adminLog.
//   clubBroadcasterStatus      owner: connected as, scopes, token health (asks Twitch). Never returns a token.
//   clubBroadcasterDisconnect  owner: revokes and deletes the token. adminLog.
//   clubOnCrewChange           trigger on sites/boomertanger/members/{uid}: when crewGrade or crewStatus changes, recompute the pass
//                              (lib/club/entitlement.js; the crew source). Its own writes change neither, so it doesn't loop.
//   clubLinkTwitch             signed-up member, 1 a minute and 20 a day (sites/boomertanger/rateLimits/clubTwitch_{uid}): "Check again"
//                              on My pass. Get Broadcaster Subscriptions for their linked Twitch -> club.twitch, sources.twitch ->
//                              recompute (lib/club/twitch.js). Returns { linked, counting, sub?, tier?, gifted?, checkedAt?, plan }.
//   clubTwitchSweep            every day 05:30 America/Chicago: the channel's whole subscriber list once (paged), compared with every
//                              linked member; fixes any difference and recomputes. Skips (logs) while no broadcaster token is connected.
//   Connect and disconnect also set sites/boomertanger/public/clubPass.twitchCounting, which My pass reads.
//
// adminLog feature "clubPass". No activityLog.
const { onCall } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineString } = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("crypto");
const accounts = require("../accounts");
const { SITE_ID, fail, callerInfo } = require("../vault/common");
const { makeBroadcaster, authUrl, BroadcasterError, SCOPES, DOC_PATH } = require("../twitchBroadcaster");
const { makeEntitlement } = require("./entitlement");
const { makeTwitchSubs } = require("./twitch");

const FEATURE = "clubPass";
const TWITCH_LOGIN = defineString("TWITCH_LOGIN");
const STATE_TTL_MS = 10 * 60 * 1000;
const LIMIT = { minuteMs: 60 * 1000, perDay: 20 };
const SECRETS = [accounts.TWITCH_CLIENT_SECRET];

function projectId() {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  try { return JSON.parse(process.env.FIREBASE_CONFIG || "{}").projectId || ""; } catch { return ""; }
}

function build(deps = {}) {
  const db = deps.db || admin.firestore();
  const now = deps.now || Date.now;
  const fetchFn = deps.fetchFn || fetch;
  const adminLogEntry = deps.adminLogEntry;
  const R = {
    connect: db.doc(`sites/${SITE_ID}/private/twitchBroadcasterConnect`),
    growthConfig: db.doc(`sites/${SITE_ID}/private/growthConfig`),
  };
  const clientId = () => deps.clientId ?? accounts.TWITCH_CLIENT_ID.value();
  const login = () => String(deps.twitchLogin ?? TWITCH_LOGIN.value() ?? "").toLowerCase();
  const redirects = () => deps.redirects ?? (accounts.TWITCH_REDIRECTS[projectId()] || []);
  let bc = null;
  const broadcaster = () => (bc ||= makeBroadcaster({ db, fetchFn, clientId: clientId(), clientSecret: deps.clientSecret ?? accounts.TWITCH_CLIENT_SECRET.value(), now }));

  async function requireOwner(request) {
    const c = await callerInfo(request);
    if (!c.isOwner) throw fail("permission-denied", "Only the owner can connect the broadcaster's Twitch.", "notOwner");
    return c;
  }
  async function log(c, action, details) {
    try {
      await db.collection("adminLog").add(await adminLogEntry(db, { feature: FEATURE, action, itemPath: DOC_PATH, itemTitle: "Twitch broadcaster", actorUid: c?.uid ?? null, actorName: c?.name || "Automatic", reason: "", details }));
    } catch (err) { console.error("club: adminLog write failed", err); }
  }
  const okRedirect = (u) => typeof u === "string" && redirects().includes(u);

  // ---------- the broadcaster token ----------
  async function startConnect(request) {
    const c = await requireOwner(request);
    const { redirectUri } = request.data || {};
    if (!okRedirect(redirectUri)) throw fail("invalid-argument", "That return address isn't allowed.", "redirectUri");
    const state = crypto.randomBytes(24).toString("hex");
    await R.connect.set({ state, uid: c.uid, expireAt: now() + STATE_TTL_MS });
    return { url: authUrl({ clientId: clientId(), redirectUri, state }), state };
  }

  async function finishConnect(request) {
    const c = await requireOwner(request);
    const { code, state, redirectUri } = request.data || {};
    if (typeof code !== "string" || !code || code.length > 200) throw fail("invalid-argument", "Twitch didn't send a code.", "code");
    if (!okRedirect(redirectUri)) throw fail("invalid-argument", "That return address isn't allowed.", "redirectUri");
    // The state is one-time: read and delete it together, then check it.
    const saved = await db.runTransaction(async (tx) => {
      const s = await tx.get(R.connect);
      if (s.exists) tx.delete(R.connect);
      return s.exists ? s.data() : null;
    });
    const same = saved && typeof state === "string" && state.length === String(saved.state).length && crypto.timingSafeEqual(Buffer.from(state), Buffer.from(String(saved.state)));
    if (!same || saved.uid !== c.uid || !(saved.expireAt > now())) throw fail("failed-precondition", "That connection expired. Press Connect again.", "state");
    let t;
    try { t = await broadcaster().exchange({ code, redirectUri }); }
    catch (err) {
      console.error("clubBroadcasterConnect: exchange failed", err?.code);
      if (err instanceof BroadcasterError && err.code === "network") throw fail("unavailable", "Could not reach Twitch. Try again.", "network");
      throw fail("permission-denied", "Twitch didn't accept that. Press Connect again.", "exchange");
    }
    const cfg = (await R.growthConfig.get()).data() || {};
    const wrongUser = t.login !== login() || (cfg.twitchBroadcasterId && String(cfg.twitchBroadcasterId) !== t.twitchUserId);
    const missing = SCOPES.filter((s) => !t.scope.includes(s));
    if (wrongUser || missing.length) {
      await broadcaster().revoke(t.refreshToken);
      if (wrongUser) throw fail("permission-denied", `That's ${t.login || "another account"} on Twitch. Sign in to Twitch as ${login()} and connect again.`, "wrongChannel");
      throw fail("failed-precondition", `Twitch didn't grant ${missing.join(" and ")}. Connect again and allow both.`, "scopes");
    }
    await broadcaster().store(t, { connectedBy: c.uid });
    await subs().setCounting(true);
    await log(c, "broadcasterConnect", { login: t.login, scope: t.scope });
    return { ok: true, login: t.login };
  }

  async function broadcasterStatus(request) {
    await requireOwner(request);
    return broadcaster().status({ validate: true });
  }

  async function disconnect(request) {
    const c = await requireOwner(request);
    const was = await broadcaster().disconnect();
    await subs().setCounting(false);
    if (was) await log(c, "broadcasterDisconnect", { login: was.login });
    return { ok: true, wasConnected: !!was };
  }

  // ---------- the entitlement ----------
  const entitlement = makeEntitlement({ db, auth: deps.auth || admin.auth(), now });
  async function onCrewChange(event) {
    const { siteId, uid } = event.params;
    if (siteId !== SITE_ID || !event.data.after.exists) return;
    const b = event.data.before.exists ? event.data.before.data() : {}, a = event.data.after.data();
    if ((b.crewGrade ?? null) === (a.crewGrade ?? null) && (b.crewStatus ?? null) === (a.crewStatus ?? null)) return;
    await entitlement.recompute(uid);
  }

  // ---------- checking a sub ----------
  let ts = null;
  const subs = () => (ts ||= makeTwitchSubs({ db, fetchFn, clientId: clientId(), broadcaster: broadcaster(), entitlement, now }));
  const limitRef = (uid) => db.doc(`sites/${SITE_ID}/rateLimits/clubTwitch_${uid}`);
  /** 1 a minute and 20 a day (UTC days) per member. */
  async function rateLimit(uid) {
    const at = now(), day = new Date(at).toISOString().slice(0, 10);
    await db.runTransaction(async (tx) => {
      const s = await tx.get(limitRef(uid));
      const d = s.exists ? s.data() : {};
      const count = d.day === day ? d.dayCount || 0 : 0;
      if (d.lastAt && at - d.lastAt < LIMIT.minuteMs) throw fail("resource-exhausted", "You just checked. Try again in a minute.", "rateLimited", { retryInMs: LIMIT.minuteMs - (at - d.lastAt) });
      if (count >= LIMIT.perDay) throw fail("resource-exhausted", "That's enough checks for today. Twitch subs also update on their own.", "rateLimitedDay");
      tx.set(limitRef(uid), { lastAt: at, day, dayCount: count + 1, expireAt: admin.firestore.Timestamp.fromMillis(at + 2 * 86400000) });
    });
  }
  async function linkTwitch(request) {
    if (!request.auth) throw fail("unauthenticated", "Sign in first.", "signedOut");
    const uid = request.auth.uid;
    if (!(await db.doc(`sites/${SITE_ID}/members/${uid}`).get()).exists) throw fail("failed-precondition", "Finish signing up first.", "needsSignup");
    await rateLimit(uid);
    try { return await subs().check(uid); }
    catch (err) {
      console.error("clubLinkTwitch: check failed", String((err && err.message) || err).slice(0, 160));
      throw fail("unavailable", "Couldn't reach Twitch. Try again in a minute.", "twitch");
    }
  }

  async function runSweep() {
    try {
      const out = await subs().sweep();
      console.log("clubTwitchSweep:", JSON.stringify(out));
      return out;
    } catch (err) {
      if (err instanceof BroadcasterError) { console.warn(`clubTwitchSweep: skipped (${err.code}: ${err.message})`); return { skipped: err.code }; }
      throw err;
    }
  }

  const functions = {
    clubBroadcasterStart: onCall({ secrets: SECRETS }, startConnect),
    clubBroadcasterConnect: onCall({ secrets: SECRETS }, finishConnect),
    clubBroadcasterStatus: onCall({ secrets: SECRETS }, broadcasterStatus),
    clubBroadcasterDisconnect: onCall({ secrets: SECRETS }, disconnect),
    clubOnCrewChange: onDocumentWritten("sites/{siteId}/members/{uid}", onCrewChange),
    clubLinkTwitch: onCall({ secrets: SECRETS }, linkTwitch),
    clubTwitchSweep: onSchedule({ schedule: "30 5 * * *", timeZone: "America/Chicago", secrets: SECRETS, timeoutSeconds: 540 }, async () => { await runSweep(); }),
  };
  return { functions, helpers: { startConnect, finishConnect, broadcasterStatus, disconnect, broadcaster, entitlement, onCrewChange, subs, linkTwitch, rateLimit, runSweep } };
}

module.exports = (deps) => build(deps).functions;
module.exports.build = build;
