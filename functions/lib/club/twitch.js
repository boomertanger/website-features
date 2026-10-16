// functions/lib/club/twitch.js: Twitch subs count for Club Pass (docs/specs/club-pass.md §12). Pure of Cloud Functions: lib/club/index.js
// (clubLinkTwitch, clubTwitchSweep), lib/accounts (Twitch link, sign-in, unlink) and lib/live/eventsub.js call it.
//
//   const T = makeTwitchSubs({ db, fetchFn, clientId, broadcaster, entitlement, now });
//   await T.check(uid)             // Get Broadcaster Subscriptions for the member's linked Twitch -> club.twitch + sources.twitch -> recompute
//   await T.unlink(uid)            // Twitch unlinked: no twitch source, linked false -> recompute
//   await T.applyEvent(type, ev)   // EventSub channel.subscribe / channel.subscription.message / channel.subscription.end
//   await T.sweep()                // the channel's whole subscriber list once vs every linked member; fixes differences
//
// Stored on sites/boomertanger/members/{uid} (server-only): club.twitch { linked, login, sub, tier, gifted, checkedAt } and, while subbed,
// club.sources.twitch { tier, gifted, since }. Nothing else from Twitch; no payment data. Who a Twitch user is comes from
// platformLinks/twitch_{id} (one Twitch account links to one site account); unlinked Twitch users are ignored.
// Without a connected broadcaster token (lib/twitchBroadcaster.js) check() records the link but no sub result (counting: false).
// The channel's own Twitch account (the broadcaster's user id, or TWITCH_LOGIN when no token is connected) is never checked for a sub:
// club.twitch { linked, login, own: true, checkedAt } and no twitch source (My pass: "This is the channel's own Twitch account.").
// club.twitch is removed on unlink; whether Twitch is linked is always users/{uid}.linked.twitch.
const admin = require("firebase-admin");
const { BroadcasterError } = require("../twitchBroadcaster");

const SITE_ID = "boomertanger";
const HELIX = "https://api.twitch.tv/helix";
const TYPES = ["channel.subscribe", "channel.subscription.message", "channel.subscription.end"];

/** "1000" -> "1", "2000" -> "2", "3000" -> "3" (Twitch's tier strings). */
const tierOf = (t) => { const n = Math.round(Number(t) / 1000); return n >= 1 && n <= 3 ? String(n) : "1"; };

function makeTwitchSubs({ db, fetchFn = fetch, clientId, broadcaster, entitlement, now = Date.now, channelLogin = "boomertanger" }) {
  const FieldValue = admin.firestore.FieldValue;
  const memberRef = (uid) => db.doc(`sites/${SITE_ID}/members/${uid}`);
  const publicRef = db.doc(`sites/${SITE_ID}/public/clubPass`);

  async function helix(token, urlPath) {
    const res = await fetchFn(`${HELIX}/${urlPath}`, { headers: { Authorization: `Bearer ${token}`, "Client-Id": clientId } });
    if (!res.ok) throw new Error(`Twitch ${urlPath.split("?")[0]} failed (HTTP ${res.status})`);
    return res.json();
  }
  async function broadcasterId() {
    const snap = await db.doc(`sites/${SITE_ID}/private/twitchBroadcaster`).get();
    return snap.exists ? String(snap.get("twitchUserId") || "") : "";
  }

  /** Writes what Twitch said for one member (sub: null = unknown, no token) and recomputes. Skips non-members. */
  async function record(uid, { login, sub, tier = null, gifted = false, own = false }) {
    const ref = memberRef(uid), snap = await ref.get();
    if (!snap.exists) return null;
    const twitch = { linked: true, login: login || null, checkedAt: now() };
    if (own) { twitch.own = true; sub = false; }
    else if (sub !== null) Object.assign(twitch, { sub: !!sub, tier: sub ? tier : null, gifted: sub ? !!gifted : false });
    const patch = { "club.twitch": twitch };
    if (sub === true) patch["club.sources.twitch"] = { tier, gifted: !!gifted, since: snap.get("club.sources.twitch.since") || now() };
    if (sub === false) patch["club.sources.twitch"] = FieldValue.delete();
    await ref.update(patch);
    return entitlement.recompute(uid);
  }

  /** The Get Broadcaster Subscriptions answer for one Twitch user: { sub, tier, gifted }. */
  async function lookup(token, bid, twitchId) {
    const d = await helix(token, `subscriptions?broadcaster_id=${encodeURIComponent(bid)}&user_id=${encodeURIComponent(twitchId)}`);
    const row = (d && d.data || [])[0];
    return row ? { sub: true, tier: tierOf(row.tier), gifted: !!row.is_gift } : { sub: false };
  }

  async function check(uid) {
    const user = await db.doc(`users/${uid}`).get();
    const tw = user.exists ? user.get("linked.twitch") : null;
    if (!tw?.id) return { ...(await unlink(uid)), linked: false, counting: true };
    const bidKnown = await broadcasterId();
    if ((bidKnown && String(tw.id) === bidKnown) || (!bidKnown && String(tw.login || "").toLowerCase() === channelLogin)) {
      const r = await record(uid, { login: tw.login, own: true });
      return { linked: true, login: tw.login, own: true, counting: !!bidKnown, plan: r?.plan ?? null };
    }
    let token;
    try { token = await broadcaster.token(); } catch (err) {
      if (!(err instanceof BroadcasterError)) throw err;
      const r = await record(uid, { login: tw.login, sub: null });   // linked, but subs can't be counted yet
      return { linked: true, login: tw.login, counting: false, plan: r?.plan ?? null };
    }
    const bid = await broadcasterId();
    const found = await lookup(token, bid, tw.id);
    const r = await record(uid, { login: tw.login, ...found });
    return { linked: true, login: tw.login, counting: true, ...found, checkedAt: now(), plan: r?.plan ?? null };
  }

  async function unlink(uid) {
    const ref = memberRef(uid), snap = await ref.get();
    if (!snap.exists) return { plan: null };
    await ref.update({ "club.twitch": FieldValue.delete(), "club.sources.twitch": FieldValue.delete() });
    const r = await entitlement.recompute(uid);
    return { plan: r?.plan ?? null };
  }

  async function uidFor(twitchId) {
    const link = await db.doc(`platformLinks/twitch_${String(twitchId).replace(/[^0-9A-Za-z_]/g, "")}`).get();
    return link.exists ? link.get("uid") || null : null;
  }

  /** One EventSub notification. Returns { applied, uid? } (applied false: not a type we handle, or the Twitch user isn't linked). */
  async function applyEvent(type, ev = {}) {
    if (!TYPES.includes(type) || !ev.user_id) return { applied: false };
    const bid = await broadcasterId();
    if (bid && String(ev.broadcaster_user_id) !== bid) return { applied: false };
    if (bid && String(ev.user_id) === bid) return { applied: false };   // the channel's own account
    const uid = await uidFor(ev.user_id);
    if (!uid) return { applied: false };
    const user = await db.doc(`users/${uid}`).get();
    if (String(user.get("linked.twitch.id") || "") !== String(ev.user_id)) return { applied: false };   // a stale link
    const login = user.get("linked.twitch.login") || ev.user_login || null;
    const r = type === "channel.subscription.end"
      ? await record(uid, { login, sub: false })
      : await record(uid, { login, sub: true, tier: tierOf(ev.tier), gifted: type === "channel.subscribe" ? !!ev.is_gift : !!(await memberRef(uid).get()).get("club.sources.twitch.gifted") });
    return { applied: !!r, uid };
  }

  /** The daily recheck: every subscriber once (paged), compared with every linked member. */
  async function sweep() {
    const token = await broadcaster.token();
    const bid = await broadcasterId();
    const subs = new Map();
    let cursor = "";
    for (let i = 0; i < 200; i++) {
      const page = await helix(token, `subscriptions?broadcaster_id=${encodeURIComponent(bid)}&first=100${cursor ? `&after=${encodeURIComponent(cursor)}` : ""}`);
      for (const row of page.data || []) subs.set(String(row.user_id), { sub: true, tier: tierOf(row.tier), gifted: !!row.is_gift });
      cursor = page.pagination && page.pagination.cursor;
      if (!cursor || !(page.data || []).length) break;
    }
    const links = await db.collection("platformLinks").where(admin.firestore.FieldPath.documentId(), ">=", "twitch_").where(admin.firestore.FieldPath.documentId(), "<", "twitch`").get();
    const out = { subscribers: subs.size, linked: 0, fixed: 0, checked: 0 };
    for (const link of links.docs) {
      const uid = link.get("uid"), twitchId = link.id.slice("twitch_".length);
      if (!uid) continue;
      out.linked++;
      if (twitchId === bid) { out.own = (out.own || 0) + 1; await check(uid); continue; }   // the channel's own account: never a sub
      const m = await memberRef(uid).get();
      if (!m.exists) continue;
      out.checked++;
      const want = subs.get(twitchId) || { sub: false };
      const have = m.get("club.twitch") || {};
      const same = have.linked === true && have.sub === want.sub && (!want.sub || (have.tier === want.tier && !!have.gifted === want.gifted));
      if (same) { await m.ref.update({ "club.twitch.checkedAt": now() }); await entitlement.recompute(uid); continue; }
      out.fixed++;
      await record(uid, { login: link.get("login") || have.login || null, ...want });
    }
    return out;
  }

  /** The public flag My pass reads: is a broadcaster token connected (so Twitch subs count)? */
  const setCounting = (on) => publicRef.set({ twitchCounting: !!on, updatedAt: now() }, { merge: true });

  return { check, unlink, applyEvent, sweep, setCounting, lookup, broadcasterId, TYPES };
}

module.exports = { makeTwitchSubs, tierOf, TYPES };
