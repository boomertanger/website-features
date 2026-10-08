// Control Room, Twitch EventSub (docs/specs/control-room.md §10, §14).
//
//   twitchEventSub   HTTPS (POST): Twitch's webhook for stream.online and stream.offline.
//
// Set the secret yourself (it signs every message; nothing in the repo or the logs ever holds it):
//   firebase functions:secrets:set TWITCH_EVENTSUB_SECRET --project staging
// then deploy, then create the subscriptions with  node functions/scripts/twitch-eventsub.js --apply  (dry run by default).
//
// Every request is checked before anything else happens:
//   1. the three Twitch-Eventsub-Message-* headers are there (else 400);
//   2. the signature: HMAC-SHA256 over  message-id + message-timestamp + raw body  with the secret, compared with
//      crypto.timingSafeEqual to "sha256=<hex>" in Twitch-Eventsub-Message-Signature (else 403);
//   3. the timestamp is within 10 minutes of now, either way (else 403: a replayed old message is refused);
//   4. the message id has not been seen (rateLimits/eventsub_<id>, 24 h TTL): a repeat is acknowledged with 200 and ignored.
// Then by Twitch-Eventsub-Message-Type: webhook_callback_verification answers the challenge (200, text/plain);
// notification handles stream.online / stream.offline for the broadcaster in private/growthConfig; revocation is logged and noted
// in live/main.eventSubRevoked. The effect of a notification is small and safe: when a stream is live on the site it records the
// platform status in streams/{id}/private/control.twitch ({ status, at, offlineSince? }), which the controls' banners read. EventSub
// never starts or stops a stream; liveTick's Helix poll stays the other source of truth.
const crypto = require("crypto");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { P } = require("./core");

const TWITCH_EVENTSUB_SECRET = defineSecret("TWITCH_EVENTSUB_SECRET");
const REPLAY_WINDOW_MS = 10 * 60 * 1000;
const SEEN_TTL_MS = 24 * 60 * 60 * 1000;
const TYPES = ["stream.online", "stream.offline"];

/** "sha256=<hex>" for a message: the value Twitch sends and this function expects. */
const signMessage = (secret, messageId, timestamp, rawBody) =>
  "sha256=" + crypto.createHmac("sha256", secret).update(String(messageId) + String(timestamp) + (Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ""), "utf8"))).digest("hex");

function signatureOk(secret, headers, rawBody) {
  const id = headers["twitch-eventsub-message-id"], ts = headers["twitch-eventsub-message-timestamp"], sig = headers["twitch-eventsub-message-signature"];
  if (!secret || typeof id !== "string" || typeof ts !== "string" || typeof sig !== "string") return false;
  const want = Buffer.from(signMessage(secret, id, ts, rawBody), "utf8"), got = Buffer.from(sig, "utf8");
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

module.exports = function eventsub(ctx, { eventSubSecret = null } = {}) {
  const { db, Timestamp, now } = ctx;
  const secretValue = () => (eventSubSecret != null ? eventSubSecret : TWITCH_EVENTSUB_SECRET.value());

  async function applyStatus(online, at) {
    const stream = await ctx.liveStream();
    if (!stream || stream.type === "backstage") return { applied: false };
    const prev = (await ctx.control(stream.id)).twitch || {};
    const twitch = online ? { status: "live", at } : { status: "offline", at, offlineSince: prev.status === "offline" && prev.offlineSince ? prev.offlineSince : at };
    await ctx.controlRef(stream.id).update({ twitch });
    await ctx.publishLive();
    return { applied: true, streamId: stream.id };
  }

  /** The HTTPS handler (a plain function for the checks). Needs req.rawBody (Cloud Functions provides it), req.headers (lower case), req.method. */
  async function handleTwitchEventSub(req, res) {
    if (req.method !== "POST") { res.status(405).send("method"); return; }
    const h = req.headers || {};
    const id = h["twitch-eventsub-message-id"], ts = h["twitch-eventsub-message-timestamp"], type = h["twitch-eventsub-message-type"];
    if (!id || !ts || !type || !h["twitch-eventsub-message-signature"]) { res.status(400).send("headers"); return; }
    const raw = req.rawBody != null ? req.rawBody : Buffer.from(JSON.stringify(req.body || {}), "utf8");
    if (!signatureOk(secretValue(), h, raw)) { res.status(403).send("signature"); return; }
    const sent = Date.parse(ts);
    if (!Number.isFinite(sent) || Math.abs(now() - sent) > REPLAY_WINDOW_MS) { res.status(403).send("timestamp"); return; }
    let body;
    try { body = JSON.parse(Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw)); } catch { res.status(400).send("body"); return; }
    if (type === "webhook_callback_verification") {
      if (typeof body.challenge !== "string" || !TYPES.includes(body.subscription && body.subscription.type)) { res.status(400).send("challenge"); return; }
      res.status(200).set("Content-Type", "text/plain").send(body.challenge);
      return;
    }
    // From here every message is deduplicated by its id.
    try { await db.doc(P.eventSubSeen(`eventsub_${String(id).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120)}`)).create({ at: now(), type, expireAt: Timestamp.fromMillis(now() + SEEN_TTL_MS) }); }
    catch (err) { if (err.code === 6 || /ALREADY_EXISTS|already exists/i.test(String(err.message))) { res.status(200).send("duplicate"); return; } throw err; }
    if (type === "notification") {
      const sub = body.subscription || {}, ev = body.event || {};
      const cfg = (await db.doc(P.growthConfig).get()).data() || {};
      if (!TYPES.includes(sub.type)) { res.status(200).send("ignored"); return; }
      if (cfg.twitchBroadcasterId && String(ev.broadcaster_user_id) !== String(cfg.twitchBroadcasterId)) { res.status(200).send("ignored"); return; }
      try { await applyStatus(sub.type === "stream.online", sent); }
      catch (err) { console.error("twitchEventSub: could not record the status", String((err && err.message) || err).slice(0, 160)); res.status(500).send("error"); return; }
      res.status(200).send("ok");
      return;
    }
    if (type === "revocation") {
      const sub = body.subscription || {};
      console.warn(`twitchEventSub: subscription ${sub.type || "?"} revoked (${sub.status || "?"})`);
      if (TYPES.includes(sub.type)) await db.doc(P.main).set({ eventSubRevoked: { [sub.type.replace(".", "_")]: { at: now(), status: String(sub.status || "").slice(0, 60) } } }, { merge: true });
      res.status(200).send("ok");
      return;
    }
    res.status(200).send("ignored");
  }

  const twitchEventSub = onRequest({ secrets: [TWITCH_EVENTSUB_SECRET] }, handleTwitchEventSub);
  return { functions: { twitchEventSub }, helpers: { handleTwitchEventSub, signMessage, signatureOk, applyStatus } };
};
module.exports.signMessage = signMessage;
module.exports.REPLAY_WINDOW_MS = REPLAY_WINDOW_MS;
