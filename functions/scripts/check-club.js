#!/usr/bin/env node
// functions/scripts/check-club.js: Club Pass Twitch counting (docs/specs/club-pass.md §12), with a fake Firestore and a fake Twitch.
//   node functions/scripts/check-club.js
const assert = require("assert/strict");
const admin = require("firebase-admin");
const { makeBroadcaster, authUrl, SCOPES } = require("../lib/twitchBroadcaster");
const { makeEntitlement, computeClub } = require("../lib/club/entitlement");

const FV = admin.firestore.FieldValue;
function fakeAuth() {
  const users = new Map();
  return { users, async getUser(uid) { if (!users.has(uid)) throw Object.assign(new Error("no"), { code: "auth/user-not-found" }); return { customClaims: users.get(uid) }; }, async setCustomUserClaims(uid, c) { users.set(uid, JSON.parse(JSON.stringify(c))); } };
}

// ---------- a tiny in-memory Firestore (doc get / set (merge) / update / delete, runTransaction) ----------
function fakeDb() {
  const docs = new Map();
  const snap = (path) => { const d = docs.get(path); return { exists: d !== undefined, id: path.split("/").pop(), ref: doc(path), data: () => (d ? JSON.parse(JSON.stringify(d)) : undefined), get: (k) => k.split(".").reduce((o, p) => (o == null ? undefined : o[p]), d) }; };
  const merge = (a, b) => { const out = { ...(a || {}) }; for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object" && !Array.isArray(out[k]) ? merge(out[k], v) : v; return out; };
  function doc(path) {
    return {
      path, id: path.split("/").pop(),
      async get() { return snap(path); },
      async set(v, o = {}) { docs.set(path, o.merge ? merge(docs.get(path), v) : JSON.parse(JSON.stringify(v))); },
      async update(v) {
        if (!docs.has(path)) throw new Error(`no doc ${path}`);
        const d = JSON.parse(JSON.stringify(docs.get(path)));
        for (const [k, val] of Object.entries(v)) {              // dotted field paths; FieldValue.delete() removes
          const parts = k.split("."), last = parts.pop();
          let o = d; for (const p of parts) { if (!o[p] || typeof o[p] !== "object") o[p] = {}; o = o[p]; }
          if (val && typeof val.isEqual === "function" && val.isEqual(FV.delete())) delete o[last];
          else if (val && typeof val.isEqual === "function") o[last] = "(server time)";
          else o[last] = JSON.parse(JSON.stringify(val));
        }
        docs.set(path, d);
      },
      async delete() { docs.delete(path); },
      async create(v) { if (docs.has(path)) throw Object.assign(new Error("already exists"), { code: 6 }); docs.set(path, JSON.parse(JSON.stringify(v))); },
    };
  }
  return {
    docs, doc,
    collection(name) {
      const filters = [];
      const q = {
        async add(v) { const p = `${name}/${docs.size + 1}`; docs.set(p, v); return doc(p); },
        where(f, op, val) { filters.push([f, op, val]); return q; },
        async get() {
          const rows = [...docs.keys()].filter((p) => p.startsWith(`${name}/`) && p.split("/").length === name.split("/").length + 1).map(snap)
            .filter((s) => filters.every(([f, op, val]) => { const x = typeof f === "string" ? s.get(f) : s.id; return op === ">=" ? x >= val : op === "<" ? x < val : op === "==" ? x === val : true; }));
          return { docs: rows, size: rows.length };
        },
      };
      return q;
    },
    async runTransaction(fn) { return fn({ get: (r) => r.get(), set: (r, v, o) => r.set(v, o), update: (r, v) => r.update(v), delete: (r) => r.delete() }); },
  };
}

// ---------- a fake Twitch ----------
function fakeTwitch() {
  const t = { calls: [], refreshOk: true, user: { login: "boomertanger", user_id: "111" }, scopes: [...SCOPES], valid: true };
  t.fetch = async (url, init = {}) => {
    const u = String(url);
    t.calls.push(u);
    const json = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (u.startsWith("https://id.twitch.tv/oauth2/token")) {
      const p = new URLSearchParams(String(init.body));
      if (p.get("grant_type") === "refresh_token") return t.refreshOk ? json(200, { access_token: "acc-2", refresh_token: "ref-2", expires_in: 14400, scope: t.scopes }) : json(400, { message: "Invalid refresh token" });
      return json(200, { access_token: "acc-1", refresh_token: "ref-1", expires_in: 14400, scope: t.scopes });
    }
    if (u.startsWith("https://id.twitch.tv/oauth2/validate")) return t.valid ? json(200, { ...t.user, scopes: t.scopes, expires_in: 14000 }) : json(401, {});
    if (u.startsWith("https://id.twitch.tv/oauth2/revoke")) return json(200, {});
    return json(404, {});
  };
  return t;
}

(async () => {
  // ---------- the broadcaster token ----------
  {
    let clock = 1_000_000;
    const db = fakeDb(), tw = fakeTwitch();
    const b = makeBroadcaster({ db, fetchFn: tw.fetch, clientId: "cid", clientSecret: "sec", now: () => clock });
    const url = new URL(authUrl({ clientId: "cid", redirectUri: "https://x/auth/twitch/callback", state: "s1" }));
    assert.equal(url.searchParams.get("scope"), "channel:read:subscriptions channel:manage:moderators");
    assert.equal(url.searchParams.get("force_verify"), "true");
    assert.deepEqual(await b.status(), { connected: false });
    await assert.rejects(b.token(), { code: "none" });
    const t = await b.exchange({ code: "c", redirectUri: "https://x/auth/twitch/callback" });
    assert.equal(t.login, "boomertanger"); assert.equal(t.twitchUserId, "111"); assert.equal(t.accessExpiresAt, clock + 14400 * 1000);
    await b.store(t, { connectedBy: "owner" });
    assert.equal(await b.token(), "acc-1", "a fresh token is used as is");
    clock += 14400 * 1000 - 60 * 1000;                                  // under 5 minutes left: refresh
    assert.equal(await b.token(), "acc-2");
    assert.equal(db.docs.get("sites/boomertanger/private/twitchBroadcaster").refreshToken, "ref-2");
    const st = await b.status({ validate: true });
    assert.equal(st.connected, true); assert.equal(st.health.ok, true); assert.deepEqual(st.missingScopes, []);
    assert.ok(!JSON.stringify(st).includes("acc-") && !JSON.stringify(st).includes("ref-"), "status never returns a token");
    clock += 14400 * 1000;
    tw.refreshOk = false;                                                // the owner revoked it on Twitch
    await assert.rejects(b.token(), { code: "reconnect" });
    assert.equal(db.docs.get("sites/boomertanger/private/twitchBroadcaster").health.ok, false);
    assert.equal((await b.disconnect()).login, "boomertanger");
    assert.equal(db.docs.has("sites/boomertanger/private/twitchBroadcaster"), false);
    assert.ok(tw.calls.some((c) => c.includes("/revoke")));
  }
  // ---------- the entitlement ----------
  {
    const at = 5_000_000;
    // pure
    assert.equal(computeClub({ roles: [] }, at).club.plan, "fan");
    assert.equal(computeClub({ roles: [], crewGrade: 2, crewStatus: "active" }, at).club.sources.crew.grade, 2);
    assert.equal(computeClub({ roles: [], crewGrade: 2, crewStatus: "alumni" }, at).sub, false, "alumni aren't crew");
    assert.equal(computeClub({ club: { sources: { grant: { until: at - 1 } } } }, at).sub, false, "an ended grant doesn't count");
    assert.equal(computeClub({ club: { sources: { gift: { endsAt: at + 1 } } } }, at).sub, true);
    assert.equal(computeClub({ roles: ["sub"] }, at).legacy, true, "the old staging sub role is left alone");
    assert.equal(computeClub({ roles: ["sub"], club: { twitch: { linked: true } } }, at).legacy, true, "twitch info alone doesn't end the legacy role");
    assert.equal(computeClub({ roles: ["sub"], club: { sources: {} } }, at).legacy, false);

    const db = fakeDb(), auth = fakeAuth();
    const E = makeEntitlement({ db, auth, now: () => at });
    const m = "sites/boomertanger/members/u1";
    await db.doc(m).set({ roles: ["mod"], joinedAt: 1 });
    auth.users.set("u1", { roles: { boomertanger: ["mod"], other: ["x"] }, crewGrade: 2 });
    assert.equal(await E.recompute("nobody"), null);
    let r = await E.recompute("u1");
    assert.equal(r.plan, "fan"); assert.equal(r.rolesChanged, false);
    assert.deepEqual(db.docs.get(m).club.sources, {});
    r = await E.recompute("u1");
    assert.equal(r.changed, false, "nothing to write the second time");
    r = (await E.setGrant("u1", { on: true, note: "test" })).after;
    assert.equal(r.plan, "sub"); assert.equal(r.rolesChanged, true);
    assert.deepEqual(db.docs.get(m).roles, ["mod", "sub"], "other roles untouched");
    assert.deepEqual(auth.users.get("u1"), { roles: { boomertanger: ["mod", "sub"], other: ["x"] }, crewGrade: 2 }, "claims merged, the rest kept");
    assert.equal(db.docs.get(m).rolesChangedBy.name, "Club Pass");
    r = (await E.setGrant("u1", { on: false })).after;
    assert.equal(r.plan, "fan"); assert.deepEqual(db.docs.get(m).roles, ["mod"]);
    assert.deepEqual(auth.users.get("u1").roles.boomertanger, ["mod"]);
    // crew counts
    await db.doc(m).update({ crewGrade: 1, crewStatus: "active" });
    assert.equal((await E.recompute("u1")).plan, "sub");
    assert.equal(db.docs.get(m).club.sources.crew.grade, 1);
    // legacy
    await db.doc("sites/boomertanger/members/u2").set({ roles: ["sub"] });
    assert.equal((await E.recompute("u2")).legacy, true);
    assert.deepEqual(db.docs.get("sites/boomertanger/members/u2").roles, ["sub"], "legacy role kept");
  }
  // ---------- checking a sub, EventSub, unlink, the sweep ----------
  {
    let clock = 9_000_000;
    const db = fakeDb(), auth = fakeAuth(), tw = fakeTwitch();
    tw.subs = { "222": { user_id: "222", tier: "2000", is_gift: true } };
    const base = tw.fetch;
    tw.fetch = async (url, init) => {
      const u = new URL(String(url));
      if (u.pathname === "/helix/subscriptions") {
        tw.calls.push(String(url));
        const one = u.searchParams.get("user_id");
        const data = one ? (tw.subs[one] ? [tw.subs[one]] : []) : Object.values(tw.subs);
        return { ok: true, status: 200, json: async () => ({ data, pagination: {} }) };
      }
      return base(url, init);
    };
    const { makeTwitchSubs, tierOf } = require("../lib/club/twitch");
    assert.equal(tierOf("1000"), "1"); assert.equal(tierOf("3000"), "3");
    const b = makeBroadcaster({ db, fetchFn: tw.fetch, clientId: "cid", clientSecret: "sec", now: () => clock });
    const E = makeEntitlement({ db, auth, now: () => clock });
    const T = makeTwitchSubs({ db, fetchFn: tw.fetch, clientId: "cid", broadcaster: b, entitlement: E, now: () => clock });
    const m = "sites/boomertanger/members/u1";
    await db.doc(m).set({ roles: [] });
    await db.doc("users/u1").set({ linked: { twitch: { id: "222", login: "gbo_tv" } } });
    await db.doc("platformLinks/twitch_222").set({ uid: "u1", login: "gbo_tv" });
    auth.users.set("u1", {});

    let r = await T.check("u1");
    assert.equal(r.counting, false, "no broadcaster token: linked, not counted");
    assert.equal(db.docs.get(m).club.twitch.linked, true); assert.equal(db.docs.get(m).club.twitch.sub, undefined);
    assert.equal(db.docs.get(m).club.plan, "fan");

    await b.store({ accessToken: "acc", refreshToken: "ref", accessExpiresAt: clock + 3600000, scope: SCOPES, twitchUserId: "111", login: "boomertanger" });
    r = await T.check("u1");
    assert.deepEqual([r.counting, r.sub, r.tier, r.gifted, r.plan], [true, true, "2", true, "sub"]);
    assert.ok(tw.calls.some((c) => c.includes("broadcaster_id=111") && c.includes("user_id=222")));
    assert.deepEqual(db.docs.get(m).roles, ["sub"]); assert.deepEqual(auth.users.get("u1").roles.boomertanger, ["sub"]);
    const stored = JSON.stringify(db.docs.get(m).club);
    assert.ok(!/acc|ref/.test(stored), "no token on the member");

    // EventSub: the sub ends, a stranger subs, the member resubs
    assert.equal((await T.applyEvent("channel.subscription.end", { user_id: "222", broadcaster_user_id: "111", tier: "2000" })).applied, true);
    assert.equal(db.docs.get(m).club.plan, "fan"); assert.deepEqual(db.docs.get(m).roles, []);
    assert.equal(db.docs.get(m).club.sources.twitch, undefined);
    assert.equal((await T.applyEvent("channel.subscribe", { user_id: "999", broadcaster_user_id: "111", tier: "1000" })).applied, false, "unlinked Twitch users are ignored");
    assert.equal((await T.applyEvent("channel.subscribe", { user_id: "222", broadcaster_user_id: "555", tier: "1000" })).applied, false, "another channel is ignored");
    await T.applyEvent("channel.subscription.message", { user_id: "222", broadcaster_user_id: "111", tier: "1000" });
    assert.equal(db.docs.get(m).club.plan, "sub"); assert.equal(db.docs.get(m).club.twitch.tier, "1"); assert.equal(db.docs.get(m).club.twitch.gifted, false);

    // the sweep: Twitch says no sub any more -> fixed
    delete tw.subs["222"];
    const sw = await T.sweep();
    assert.deepEqual([sw.subscribers, sw.linked, sw.fixed], [0, 1, 1]);
    assert.equal(db.docs.get(m).club.plan, "fan");
    assert.equal((await T.sweep()).fixed, 0, "nothing to fix the second time");

    // unlink
    tw.subs["222"] = { user_id: "222", tier: "1000", is_gift: false };
    await T.check("u1");
    assert.equal(db.docs.get(m).club.plan, "sub");
    await T.unlink("u1");
    assert.equal(db.docs.get(m).club.plan, "fan"); assert.equal(db.docs.get(m).club.twitch.linked, false);
    // a Twitch user with no site member doc is skipped
    await db.doc("users/u9").set({ linked: { twitch: { id: "333", login: "x" } } });
    assert.equal((await T.check("u9")).plan, null);
  }
  // ---------- the EventSub webhook hands Club Pass types to applyEvent ----------
  {
    const eventsub = require("../lib/live/eventsub");
    const db = fakeDb(), seen = [];
    let fail = false;
    const clubSubs = { async applyEvent(type, ev) { if (fail) throw new Error("boom"); seen.push([type, ev.user_id]); return { applied: ev.user_id === "222" }; } };
    const at = Date.now();
    const ctx = { db, Timestamp: admin.firestore.Timestamp, now: () => at };
    const { helpers } = eventsub(ctx, { eventSubSecret: "secret", clubSubs });
    const send = async (type, msgType, id, extra = {}) => {
      const body = JSON.stringify({ subscription: { type, status: "enabled" }, event: { broadcaster_user_id: "111", ...extra }, ...(msgType === "webhook_callback_verification" ? { challenge: "hi" } : {}) });
      const ts = new Date(at).toISOString();
      const headers = { "twitch-eventsub-message-id": id, "twitch-eventsub-message-timestamp": ts, "twitch-eventsub-message-type": msgType, "twitch-eventsub-message-signature": eventsub.signMessage("secret", id, ts, body) };
      const res = { code: 0, out: "", status(c) { this.code = c; return this; }, set() { return this; }, send(x) { this.out = x; return this; } };
      await helpers.handleTwitchEventSub({ method: "POST", headers, rawBody: Buffer.from(body) }, res);
      return res;
    };
    assert.equal((await send("channel.subscribe", "webhook_callback_verification", "v1")).out, "hi", "club types verify");
    assert.equal((await send("channel.subscribe", "notification", "n1", { user_id: "222", tier: "1000" })).out, "ok");
    assert.equal((await send("channel.subscription.end", "notification", "n2", { user_id: "999" })).out, "ignored");
    assert.equal((await send("channel.subscribe", "notification", "n1", { user_id: "222" })).out, "duplicate");
    fail = true;
    assert.equal((await send("channel.subscription.message", "notification", "n3", { user_id: "222" })).code, 500);
    fail = false;
    assert.equal((await send("channel.subscription.message", "notification", "n3", { user_id: "222" })).out, "ok", "Twitch's retry is handled");
    assert.deepEqual(seen.map((x) => x[0]), ["channel.subscribe", "channel.subscription.end", "channel.subscription.message"]);
  }
  console.log("check-club: ok");
})().catch((err) => { console.error(err); process.exit(1); });

module.exports = { fakeDb, fakeTwitch };
