#!/usr/bin/env node
// functions/scripts/check-billing.js: Club Pass billing (docs/specs/club-pass.md §13) against a fake Firestore and a fake Stripe, with
// webhook events signed exactly as Stripe signs them (the stripe package's own signer and checker; nothing reaches Stripe).
//   node functions/scripts/check-billing.js
const assert = require("assert/strict");
const Stripe = require("stripe");
const { fakeDb, fakeAuth, ALL_DBS } = require("./lib/fake-firestore");
const { makeBilling } = require("../lib/billing/core");
const { makeWebhook, GRACE_MS, MONTH_MS, TYPES } = require("../lib/billing/webhook");
const { makeSweep } = require("../lib/billing/sweep");
const { makeEntitlement } = require("../lib/club/entitlement");
const { assertKey } = require("../lib/billing/stripe");

const DAY = 86400000;
const SECRET = "whsec_test_check_billing";
const signer = new Stripe("sk_test_check_billing_only").webhooks;   // local signing helpers only

function fakeStripe() {
  const st = { calls: [], customers: {}, subs: {}, charges: {}, sessions: [], canceled: [], n: 0 };
  const id = (p) => `${p}_${++st.n}`;
  st.customers_ = {
    create: async (p) => { const c = { id: id("cus"), ...p }; st.customers[c.id] = c; st.calls.push(["customers.create", p]); return c; },
    retrieve: async (cid) => st.customers[cid] || { id: cid, deleted: true },
  };
  return {
    st,
    customers: st.customers_,
    subscriptions: {
      list: async ({ customer }) => ({ data: Object.values(st.subs).filter((s) => s.customer === customer) }),
      retrieve: async (sid) => st.subs[sid],
      cancel: async (sid) => { st.canceled.push(sid); if (st.subs[sid]) st.subs[sid].status = "canceled"; return st.subs[sid]; },
    },
    checkout: { sessions: { create: async (p) => { st.sessions.push(p); return { id: id("cs"), url: `https://checkout.stripe.test/${st.n}` }; } } },
    billingPortal: { sessions: { create: async (p) => { st.calls.push(["portal", p]); return { url: "https://billing.stripe.test/p" }; } } },
    invoices: { list: async ({ customer }) => ({ data: Object.values(st.invoices || {}).filter((i) => i.customer === customer) }) },
    charges: {
      list: async ({ customer }) => ({ data: Object.values(st.charges).filter((c) => c.customer === customer) }),
      retrieve: async (cid) => st.charges[cid],
    },
  };
}

(async () => {
  // ---------- keys ----------
  assert.doesNotThrow(() => assertKey("sk_test_abc"));
  assert.throws(() => assertKey("sk_live_abc"), /isn't a test key/);
  assert.throws(() => assertKey("rk_live_abc"), /isn't a test key/);

  let clock = Date.UTC(2026, 9, 16, 12);
  const now = () => clock;
  const db = fakeDb(), auth = fakeAuth(), stripe = fakeStripe();
  const E = makeEntitlement({ db, auth, now });
  const ORIGIN = "https://staging.boomertanger.com";
  const B = makeBilling({ db, auth, stripe, entitlement: E, now, prices: { sub: "price_sub", month: "price_month" }, portalConfig: "bpc_1", origins: [ORIGIN] });
  const W = makeWebhook({ db, stripe, entitlement: E, now, verify: (raw, sig) => signer.constructEvent(raw, sig, SECRET) });
  const sweep = makeSweep({ db, entitlement: E, now });

  const member = async (uid, adult) => {
    await db.doc(`sites/boomertanger/members/${uid}`).set({ roles: [] });
    await db.doc(`sites/boomertanger/profiles/${uid}`).set({ handle: uid });
    await db.doc(`users/${uid}/private/age`).set({ adultAt: adult ? clock - 365 * DAY : clock + 2 * 365 * DAY });
    auth.users.set(uid, {});
  };
  await member("adult", true); await member("teen", false);
  const M = (uid) => db.docs.get(`sites/boomertanger/members/${uid}`);

  // ---------- clubCheckout ----------
  await assert.rejects(B.checkout("adult", { kind: "sub", origin: "https://evil.example" }), { reason: "origin" });
  await assert.rejects(B.checkout("adult", { kind: "gold", origin: ORIGIN }), { reason: "kind" });
  await assert.rejects(B.checkout("nobody", { kind: "sub", origin: ORIGIN }), { reason: "needsSignup" });
  const off = makeBilling({ db, auth, stripe, entitlement: E, now, prices: {}, origins: [ORIGIN] });
  await assert.rejects(off.checkout("adult", { kind: "sub", origin: ORIGIN }), { reason: "paymentsOff" }, "no prices (production): off");
  let r = await B.checkout("adult", { kind: "sub", origin: ORIGIN });
  assert.ok(r.url.startsWith("https://checkout.stripe.test/"));
  const s1 = stripe.st.sessions.at(-1);
  assert.equal(s1.mode, "subscription"); assert.equal(s1.line_items[0].price, "price_sub"); assert.equal(s1.metadata.uid, "adult");
  assert.equal(s1.success_url, `${ORIGIN}/account/club?checkout=success`); assert.equal(s1.cancel_url, `${ORIGIN}/club-pass#ch-pick`);
  const cus = db.docs.get("billing/main/customers/adult").customerId;
  assert.equal(stripe.st.customers[cus].metadata.uid, "adult", "one Stripe customer per member, metadata uid");
  assert.equal(db.docs.get(`billing/main/customerIndex/${cus}`).uid, "adult");
  await B.checkout("adult", { kind: "month", origin: ORIGIN });
  assert.equal(stripe.st.sessions.at(-1).mode, "payment");
  assert.equal(stripe.st.sessions.at(-1).invoice_creation?.enabled, true, "the one-month pass gets an invoice");
  assert.equal(Object.keys(stripe.st.customers).length, 1, "the same customer again");
  // under 18
  await assert.rejects(B.checkout("teen", { kind: "sub", origin: ORIGIN }), { reason: "guardianRequired" }, "the under-18 refusal");
  await assert.rejects(B.checkout("teen", { kind: "sub", origin: ORIGIN, guardianOk: "yes" }), { reason: "guardianRequired" }, "only true counts");
  r = await B.checkout("teen", { kind: "sub", origin: ORIGIN, guardianOk: true });
  assert.equal(stripe.st.sessions.at(-1).metadata.guardianOk, "yes");

  // ---------- the webhook: signatures, live mode, idempotency ----------
  const send = async (event, { secret = SECRET, sig } = {}) => {
    const payload = JSON.stringify(event);
    const header = sig ?? signer.generateTestHeaderString({ payload, secret, timestamp: Math.floor(Date.now() / 1000) });
    const res = { code: 0, out: "", status(c) { this.code = c; return this; }, send(x) { this.out = x; return this; } };
    await W.handle({ method: "POST", headers: { "stripe-signature": header }, rawBody: Buffer.from(payload) }, res);
    return res;
  };
  let n = 0;
  const ev = (type, object, extra = {}) => ({ id: `evt_${++n}`, object: "event", type, created: Math.floor(clock / 1000), livemode: false, data: { object }, ...extra });
  const subObj = (id, status, extra = {}) => ({ id, object: "subscription", customer: cus, status, metadata: { uid: "adult" }, cancel_at_period_end: false, cancel_at: null,
    items: { data: [{ current_period_end: Math.floor((clock + 30 * DAY) / 1000), price: { id: "price_sub", unit_amount: 599, currency: "usd" } }] }, ...extra });

  assert.equal((await send(ev("invoice.paid", {}), { secret: "whsec_wrong" })).code, 400, "a wrong signature is refused");
  assert.equal((await send(ev("invoice.paid", {}), { sig: "" })).code, 400, "no signature is refused");
  assert.equal((await send(ev("invoice.paid", {}, { livemode: true }))).out, "ignored (live mode)");
  assert.equal((await send(ev("customer.created", {}))).out, "ignored");

  // checkout.session.completed (subscription) -> gold
  stripe.st.subs.sub_1 = subObj("sub_1", "active");
  const done = ev("checkout.session.completed", { id: "cs_1", object: "checkout.session", mode: "subscription", customer: cus, subscription: "sub_1", metadata: { uid: "adult", kind: "sub" }, amount_total: 599, currency: "usd" });
  assert.equal((await send(done)).out, "ok");
  assert.equal(M("adult").club.plan, "sub"); assert.deepEqual(M("adult").roles, ["sub"]); assert.deepEqual(auth.users.get("adult").roles.boomertanger, ["sub"]);
  let src = M("adult").club.sources.stripe;
  assert.equal(src.kind, "sub"); assert.equal(src.status, "active"); assert.equal(src.subscriptionId, "sub_1"); assert.equal(src.renewsAt, clock + 30 * DAY);
  assert.equal((await send(done)).out, "duplicate", "each event id once");
  assert.equal(db.docs.get(`billing/main/events/${done.id}`).result, "applied");
  assert.equal(db.docs.get("billing/main/subscriptions/sub_1").uid, "adult");
  await assert.rejects(B.checkout("adult", { kind: "sub", origin: ORIGIN }), { reason: "alreadySubscribed" }, "refused with an active Stripe subscription");
  await assert.rejects(B.checkout("adult", { kind: "month", origin: ORIGIN }), { reason: "alreadySubscribed" });

  // customer.subscription.created / updated (cancel at period end)
  assert.equal((await send(ev("customer.subscription.created", subObj("sub_1", "active")))).out, "ok");
  await send(ev("customer.subscription.updated", subObj("sub_1", "active", { cancel_at_period_end: true })));
  src = M("adult").club.sources.stripe;
  assert.equal(src.cancelAt, clock + 30 * DAY); assert.equal(src.renewsAt, undefined); assert.equal(M("adult").club.plan, "sub", "cancelled: gold until the end");
  await send(ev("customer.subscription.updated", subObj("sub_1", "active")));   // resumed

  // API 2026-09-30.endive (the webhook endpoint's version) adds a "paused" status (flexible billing mode, an explicit pause; not offered
  // in our portal): a paused subscription doesn't give gold, and resuming brings it back. The fields read here are the same as in dahlia.
  await send(ev("customer.subscription.updated", subObj("sub_1", "paused", { status_details: { paused: { subscription: { type: "first_payment_failure" } } } })));
  assert.equal(M("adult").club.plan, "fan", "paused: no gold");
  await send(ev("customer.subscription.updated", subObj("sub_1", "active")));
  assert.equal(M("adult").club.plan, "sub", "resumed: gold again");

  // invoice.payment_failed -> grace (first failure + 7 days), still gold; a second failure keeps the first date
  const inv = (extra) => ({ id: `in_${++n}`, object: "invoice", customer: cus, parent: { subscription_details: { subscription: "sub_1" } }, amount_due: 599, amount_paid: 599, currency: "usd", ...extra });
  const firstFail = clock;
  stripe.st.subs.sub_1.status = "past_due";
  await send(ev("invoice.payment_failed", inv()));
  src = M("adult").club.sources.stripe;
  assert.equal(src.status, "past_due"); assert.equal(src.graceUntil, firstFail + GRACE_MS); assert.equal(M("adult").club.plan, "sub", "grace: still gold");
  clock += 3 * DAY;
  await send(ev("invoice.payment_failed", inv()));
  assert.equal(M("adult").club.sources.stripe.graceUntil, firstFail + GRACE_MS, "grace counts from the first failure");
  await send(ev("customer.subscription.updated", subObj("sub_1", "past_due")));
  assert.equal(M("adult").club.sources.stripe.graceUntil, firstFail + GRACE_MS, "an update keeps the window");
  // invoice.paid -> active again, grace gone
  stripe.st.subs.sub_1.status = "active";
  await send(ev("invoice.paid", inv()));
  src = M("adult").club.sources.stripe;
  assert.equal(src.status, "active"); assert.equal(src.graceUntil, undefined);
  // grace runs out -> the sweep ends it
  stripe.st.subs.sub_1.status = "past_due";
  await send(ev("invoice.payment_failed", inv()));
  clock += GRACE_MS + DAY;
  let sw = await sweep.run();
  assert.equal(sw.ended, 1); assert.equal(M("adult").club.plan, "fan", "grace over: Fan Club"); assert.deepEqual(M("adult").roles, []);
  assert.deepEqual(auth.users.get("adult").roles || {}, {}, "the sub role left the claims");
  // Stripe cancels after the failed retries -> customer.subscription.deleted
  await send(ev("customer.subscription.deleted", subObj("sub_1", "canceled")));
  assert.equal(M("adult").club.sources?.stripe, undefined);

  // a new subscription, then a full refund ends it at once (and cancels it at Stripe)
  stripe.st.subs.sub_2 = subObj("sub_2", "active");
  await send(ev("customer.subscription.created", subObj("sub_2", "active")));
  assert.equal(M("adult").club.plan, "sub");
  await send(ev("customer.subscription.deleted", subObj("sub_1", "canceled")));
  assert.equal(M("adult").club.plan, "sub", "an old subscription ending doesn't end the new one");
  stripe.st.charges.ch_1 = { id: "ch_1", object: "charge", customer: cus, amount: 599, amount_refunded: 200, refunded: false, currency: "usd", metadata: {} };
  await send(ev("charge.refunded", stripe.st.charges.ch_1));
  assert.equal(M("adult").club.plan, "sub", "a partial refund doesn't end it");
  await send(ev("charge.refunded", { ...stripe.st.charges.ch_1, amount_refunded: 599, refunded: true }));
  assert.equal(M("adult").club.plan, "fan", "a full refund ends it at once"); assert.ok(stripe.st.canceled.includes("sub_2"));
  assert.equal(db.docs.get("billing/main/subscriptions/sub_2").endedBy, "refund");

  // a dispute ends it at once
  stripe.st.subs.sub_3 = subObj("sub_3", "active");
  await send(ev("customer.subscription.created", subObj("sub_3", "active")));
  assert.equal(M("adult").club.plan, "sub");
  stripe.st.charges.ch_2 = { id: "ch_2", object: "charge", customer: cus, amount: 599, currency: "usd", metadata: {} };
  await send(ev("charge.dispute.created", { id: "dp_1", object: "dispute", charge: "ch_2", amount: 599, currency: "usd", reason: "fraudulent" }));
  assert.equal(M("adult").club.plan, "fan", "a dispute ends it at once"); assert.ok(stripe.st.canceled.includes("sub_3"));

  // ---------- one-month pass: 30 days, a second adds 30 to the end, the sweep ends it ----------
  const paidAt = clock;
  const month = () => ev("checkout.session.completed", { id: `cs_${++n}`, object: "checkout.session", mode: "payment", payment_status: "paid", customer: cus, metadata: { uid: "adult", kind: "month" }, amount_total: 599, currency: "usd" });
  await send(month());
  src = M("adult").club.sources.stripe;
  assert.equal(src.kind, "month"); assert.equal(src.endsAt, paidAt + MONTH_MS); assert.equal(M("adult").club.plan, "sub");
  clock += 10 * DAY;
  await send(month());
  assert.equal(M("adult").club.sources.stripe.endsAt, paidAt + 2 * MONTH_MS, "a second month adds 30 days to the end");
  await send(ev("checkout.session.completed", { id: "cs_unpaid", object: "checkout.session", mode: "payment", payment_status: "unpaid", customer: cus, metadata: { uid: "adult" } }));
  assert.equal(M("adult").club.sources.stripe.endsAt, paidAt + 2 * MONTH_MS, "unpaid: nothing changes");
  clock = paidAt + 2 * MONTH_MS - DAY;
  assert.equal((await sweep.run()).ended, 0, "not yet");
  clock = paidAt + 2 * MONTH_MS + 1;
  sw = await sweep.run();
  assert.equal(sw.ended, 1); assert.equal(M("adult").club.plan, "fan", "one-month expiry"); assert.equal(M("adult").club.sources?.stripe, undefined);

  // ---------- a failed run is retried ----------
  const broken = makeWebhook({ db, stripe: { ...stripe, subscriptions: { ...stripe.subscriptions, retrieve: async () => { throw new Error("stripe down"); } } }, entitlement: E, now, verify: (raw, sig) => signer.constructEvent(raw, sig, SECRET) });
  const retry = ev("invoice.paid", inv());
  const payload = JSON.stringify(retry), header = signer.generateTestHeaderString({ payload, secret: SECRET });
  const mk = () => ({ code: 0, out: "", status(c) { this.code = c; return this; }, send(x) { this.out = x; return this; } });
  const orig = console.error; console.error = () => {};
  let res = mk(); await broken.handle({ method: "POST", headers: { "stripe-signature": header }, rawBody: Buffer.from(payload) }, res);
  console.error = orig;
  assert.equal(res.code, 500); assert.equal(db.docs.has(`billing/main/events/${retry.id}`), false, "the record is removed so Stripe's retry runs");
  stripe.st.subs.sub_1.status = "canceled";
  res = mk(); await W.handle({ method: "POST", headers: { "stripe-signature": header }, rawBody: Buffer.from(payload) }, res);
  assert.equal(res.out, "ok");

  // ---------- the ledger: one entry per handled event, never rewritten ----------
  const ledger = [...db.docs.keys()].filter((k) => k.startsWith("billing/main/ledger/"));
  const types = new Set(ledger.map((k) => db.docs.get(k).type));
  for (const t of TYPES) assert.ok(types.has(t), `the ledger has a ${t} entry`);
  await assert.rejects(db.doc(ledger[0]).create({ x: 1 }), /already exists/, "append-only: create, never overwrite");

  // ---------- portal and status ----------
  assert.equal((await B.portal("adult", { origin: ORIGIN })).url, "https://billing.stripe.test/p");
  assert.equal(stripe.st.calls.find((c) => c[0] === "portal")[1].return_url, `${ORIGIN}/account/club`);
  await assert.rejects(B.portal("nobody", { origin: ORIGIN }), { reason: "noCustomer" });
  // receipts: named and dated by the invoice each charge paid (a test clock's date), not Stripe's "Subscription update" or the real time
  const T = (d) => Math.floor(Date.UTC(2026, d[0], d[1], 5, 36) / 1000);
  stripe.st.invoices = {
    in_a: { id: "in_a", customer: cus, created: T([9, 17]), parent: { subscription_details: { subscription: "sub_9" } }, payments: { data: [{ payment: { payment_intent: "pi_a" } }] } },
    in_b: { id: "in_b", customer: cus, created: T([10, 17]), parent: { subscription_details: { subscription: "sub_9" } }, payments: { data: [{ payment: { payment_intent: { id: "pi_b" } } }] } },
    in_c: { id: "in_c", customer: cus, created: T([11, 3]), metadata: { kind: "month" }, payments: { data: [{ payment: { payment_intent: "pi_c" } }] } },
  };
  const realNow = Math.floor(Date.UTC(2026, 9, 17, 7) / 1000);
  const charge = (id, pi, extra = {}) => ({ id, object: "charge", customer: cus, payment_intent: pi, amount: 599, currency: "usd", status: "succeeded", created: realNow, description: "Subscription update", metadata: {}, receipt_url: `https://pay.stripe.test/${id}`, ...extra });
  stripe.st.charges = { r1: charge("r1", "pi_a", { description: "Subscription creation" }), r2: charge("r2", "pi_b"), r3: charge("r3", "pi_c", { description: null, metadata: { kind: "month" }, disputed: true }),
    r4: charge("r4", "pi_none", { description: null, metadata: { kind: "month" }, refunded: true }), rf: charge("rf", "pi_f", { status: "failed" }) };
  const status = await B.status("adult");
  const byUrl = Object.fromEntries(status.receipts.map((x) => [x.receiptUrl.split("/").pop(), x]));
  assert.equal(status.receipts.length, 4, "failed charges aren't receipts");
  assert.equal(byUrl.r1.description, "Sub Club · 1 month"); assert.equal(byUrl.r2.description, "Sub Club · 1 month");
  assert.equal(byUrl.r3.description, "Sub Club · one month pass"); assert.equal(byUrl.r4.description, "Sub Club · one month pass", "a pass without an invoice, by its metadata");
  assert.equal(byUrl.r1.at, T([9, 17]) * 1000, "the invoice's own date"); assert.equal(byUrl.r2.at, T([10, 17]) * 1000, "each month its month");
  assert.equal(byUrl.r4.at, realNow * 1000, "no invoice: the charge's date");
  assert.equal(byUrl.r3.disputed, true); assert.equal(byUrl.r4.refunded, true); assert.equal(byUrl.r1.disputed, false);
  assert.deepEqual(status.receipts.map((x) => x.at), [...status.receipts.map((x) => x.at)].sort((a, b) => b - a), "newest first");
  assert.deepEqual(await B.status("nobody"), { receipts: [], subscription: null });

  // ---------- nothing went to activityLog; no card data stored ----------
  for (const docs of ALL_DBS) for (const [k, v] of docs) {
    assert.ok(!/^(sites\/[^/]+\/)?activity(Log)?\//.test(k), `billing wrote to activityLog: ${k}`);
    assert.ok(!/"(card|number|cvc|exp_month|last4)"/.test(JSON.stringify(v)), `card details stored at ${k}`);
  }
  console.log("check-billing: ok");
})().catch((err) => { console.error(err); process.exit(1); });
