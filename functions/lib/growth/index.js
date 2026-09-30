// Growth collector (docs/specs/growth-collector.md): daily follower and subscriber
// counts for the footer's Follow badges and the owner's history.
//   collectGrowthDaily       scheduled, 05:00 America/Los_Angeles
//   runGrowthCollectorNow    owner-only callable, for testing
//   tiktokConnect            owner-only callable: swaps the Login Kit code for tokens
//   tiktokStatus             owner-only callable: is TikTok set up and connected?
//   setManualTikTok          admin-only callable: today's TikTok count, typed in until
//                            the TikTok API is approved (refused once TikTok is connected)
// Params (functions/.env, public): TWITCH_CLIENT_ID (shared with accounts),
// TWITCH_LOGIN, YOUTUBE_CHANNEL_ID, TIKTOK_CLIENT_KEY (empty until TikTok approves).
// Secrets (firebase functions:secrets:set NAME --project <alias>): TWITCH_CLIENT_SECRET
// (shared), YOUTUBE_API_KEY, TIKTOK_CLIENT_SECRET (a placeholder until approval).
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret, defineString } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { collect, tiktokToken, dayKey, validManualFollowers, TZ } = require("./collect");

const SITE_ID = "boomertanger";
const TWITCH_CLIENT_ID = defineString("TWITCH_CLIENT_ID");
const TWITCH_LOGIN = defineString("TWITCH_LOGIN");
const YOUTUBE_CHANNEL_ID = defineString("YOUTUBE_CHANNEL_ID");
const TIKTOK_CLIENT_KEY = defineString("TIKTOK_CLIENT_KEY", { default: "" });
const TWITCH_CLIENT_SECRET = defineSecret("TWITCH_CLIENT_SECRET");
const YOUTUBE_API_KEY = defineSecret("YOUTUBE_API_KEY");
const TIKTOK_CLIENT_SECRET = defineSecret("TIKTOK_CLIENT_SECRET");
const SECRETS = [TWITCH_CLIENT_SECRET, YOUTUBE_API_KEY, TIKTOK_CLIENT_SECRET];

// TikTok returns here (the Login Kit redirect URIs registered for the app).
const TIKTOK_REDIRECTS = {
  "boomertanger-staging": [
    "http://localhost:4321/auth/tiktok/callback",
    "https://staging.boomertanger.com/auth/tiktok/callback",
  ],
  "boomertanger-prod": [
    // TODO: the production site's /auth/tiktok/callback when it launches.
  ],
};
function projectId() {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  try { return JSON.parse(process.env.FIREBASE_CONFIG || "{}").projectId || ""; } catch { return ""; }
}
const fail = (code, message, reason) => new HttpsError(code, message, { reason });
// Until TikTok approves the app the secret holds a placeholder: anything shorter than a real secret counts as unset.
const tiktokSecret = () => { const s = TIKTOK_CLIENT_SECRET.value() || ""; return s.length >= 16 ? s : ""; };

const config = () => ({
  twitchClientId: TWITCH_CLIENT_ID.value(),
  twitchClientSecret: TWITCH_CLIENT_SECRET.value(),
  twitchLogin: TWITCH_LOGIN.value(),
  youtubeApiKey: YOUTUBE_API_KEY.value(),
  youtubeChannelId: YOUTUBE_CHANNEL_ID.value(),
  tiktokClientKey: TIKTOK_CLIENT_KEY.value(),
  tiktokClientSecret: tiktokSecret(),
});

module.exports = function growth({ adminLogEntry }) {
  const db = admin.firestore();
  const Timestamp = admin.firestore.Timestamp;

  /** Only the site owner (sites/{siteId}.ownerUid). */
  async function requireOwner(request) {
    const uid = request.auth?.uid;
    if (!uid) throw fail("unauthenticated", "Sign in first.", "signIn");
    const site = await db.doc(`sites/${SITE_ID}`).get();
    if (!site.exists || site.get("ownerUid") !== uid) throw fail("permission-denied", "Only the site owner can do that.", "owner");
    return uid;
  }

  /** The owner or a site admin (members/{uid}.roles), checked on the server. */
  async function requireAdmin(request) {
    const uid = request.auth?.uid;
    if (!uid) throw fail("unauthenticated", "Sign in first.", "signIn");
    const [site, member] = await Promise.all([db.doc(`sites/${SITE_ID}`).get(), db.doc(`sites/${SITE_ID}/members/${uid}`).get()]);
    const ok = site.get("ownerUid") === uid || (member.get("roles") || []).includes("admin");
    if (!ok) throw fail("permission-denied", "Only site admins can do that.", "notAdmin");
    return uid;
  }

  const run = async (label) => {
    const out = await collect({ db, siteId: SITE_ID, cfg: config(), Timestamp });
    if (out.daily.errors.length) console.warn(`${label}: some platforms failed`, JSON.stringify(out.daily.errors));
    else console.log(`${label}: collected`, out.day);
    return out;
  };

  const collectGrowthDaily = onSchedule({ schedule: "0 5 * * *", timeZone: TZ, secrets: SECRETS }, async () => { await run("collectGrowthDaily"); });

  // Returns the new summary and the day's errors (never tokens or keys).
  const runGrowthCollectorNow = onCall({ secrets: SECRETS }, async (request) => {
    await requireOwner(request);
    const out = await run("runGrowthCollectorNow");
    const plain = (v) => JSON.parse(JSON.stringify(v, (k, x) => (x && typeof x.toDate === "function" ? x.toDate().toISOString() : x)));
    return { day: out.day, summary: plain(out.summary), errors: out.daily.errors, tiktok: out.tiktok };
  });

  const tiktokStatus = onCall({ secrets: [TIKTOK_CLIENT_SECRET] }, async (request) => {
    await requireOwner(request);
    const auth = await db.doc(`sites/${SITE_ID}/private/tiktokAuth`).get();
    return {
      configured: !!TIKTOK_CLIENT_KEY.value() && !!tiktokSecret(),
      connected: auth.exists && !!auth.get("refreshToken"),
      refreshExpiresAt: auth.exists ? auth.get("refreshExpiresAt") || null : null,
    };
  });

  // tiktokConnect({ code, redirectUri }): the /auth/tiktok/callback page hands over the code.
  const tiktokConnect = onCall({ secrets: [TIKTOK_CLIENT_SECRET] }, async (request) => {
    const uid = await requireOwner(request);
    const { code, redirectUri } = request.data || {};
    if (typeof code !== "string" || !code || code.length > 1000) throw fail("invalid-argument", "TikTok didn't send a code.", "code");
    if (!(TIKTOK_REDIRECTS[projectId()] || []).includes(redirectUri)) throw fail("invalid-argument", "That return address isn't allowed.", "redirectUri");
    if (!TIKTOK_CLIENT_KEY.value() || !tiktokSecret()) throw fail("failed-precondition", "The TikTok app isn't set up yet.", "tiktokOff");
    let tokens;
    try {
      tokens = await tiktokToken(fetch, { client_key: TIKTOK_CLIENT_KEY.value(), client_secret: tiktokSecret(), code, grant_type: "authorization_code", redirect_uri: redirectUri });
    } catch (err) {
      console.error("tiktokConnect: token exchange failed", String(err?.message || err));
      throw fail("permission-denied", "TikTok didn't accept that. Try connecting again.", "tiktokCode");
    }
    await db.doc(`sites/${SITE_ID}/private/tiktokAuth`).set({ ...tokens, connectedBy: uid, connectedAt: Date.now() });
    return { ok: true };
  });

  // setManualTikTok({ followers }): writes today's growthDaily tiktok and public/socials.tiktok
  // (source "manual") and an adminLog entry. Refused once TikTok is connected (the API wins).
  const setManualTikTok = onCall(async (request) => {
    const uid = await requireAdmin(request);
    const followers = Number(request.data?.followers);
    if (!validManualFollowers(followers)) throw fail("invalid-argument", "Enter a whole number from 0 to 100,000,000.", "followers");
    const site = db.doc(`sites/${SITE_ID}`);
    const auth = await site.collection("private").doc("tiktokAuth").get();
    if (auth.exists && auth.get("refreshToken")) throw fail("failed-precondition", "TikTok is connected, so its count updates automatically.", "tiktokConnected");
    const now = Timestamp.now(), day = dayKey(now.toMillis());
    const summaryRef = site.collection("public").doc("socials");
    const prev = (await summaryRef.get()).get("tiktok") || null;
    const profile = await site.collection("profiles").doc(uid).get();
    const batch = db.batch();
    batch.set(site.collection("growthDaily").doc(day), { tiktok: { followers, source: "manual" } }, { merge: true });
    batch.set(summaryRef, { tiktok: { followers, latestVideoAt: null, source: "manual", updatedAt: now } }, { merge: true });
    batch.set(db.collection("adminLog").doc(), await adminLogEntry(db, {
      feature: "growth", action: "manualTikTok", itemPath: `sites/${SITE_ID}/public/socials`, itemTitle: "TikTok followers",
      actorUid: uid, actorName: profile.exists ? `@${profile.get("handle")}` : (request.auth.token.email || "Admin"),
      changes: { followers: { before: prev?.followers ?? null, after: followers } }, details: { day },
    }));
    await batch.commit();
    return { ok: true, day, followers };
  });

  return { collectGrowthDaily, runGrowthCollectorNow, tiktokStatus, tiktokConnect, setManualTikTok };
};
