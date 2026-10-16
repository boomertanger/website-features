// functions/lib/billing/core.js: Club Pass billing (docs/specs/club-pass.md §13), with every dependency injected so
// scripts/check-billing.js runs it against a fake Firestore and a fake Stripe. lib/billing/index.js wraps it in Cloud Functions.
//
//   const B = makeBilling({ db, auth, stripe, entitlement, now, prices: { sub, month }, portalConfig, origins });
//   await B.checkout(uid, { kind, guardianOk, origin })   -> { url }     clubCheckout
//   await B.portal(uid, { origin })                       -> { url }     clubPortal
//   await B.status(uid)                                   -> { receipts, subscription }   clubStatus
//
// Server-only data (firestore.rules: billing/** deny-all):
//   billing/main/customers/{uid}            { customerId, createdAt, testClock? }   one Stripe customer per member (metadata uid)
//   billing/main/customerIndex/{customerId} { uid }
// Card details never touch the site: Checkout and the customer portal are Stripe's own pages.
const SITE_ID = "boomertanger";
const ACTIVE = ["active", "trialing", "past_due"];

class BillingError extends Error {
  constructor(code, message, reason) { super(message); this.name = "BillingError"; this.code = code; this.reason = reason; }
}

/** The period end of a subscription in ms (API 2025+ keeps it on the items; older shapes on the subscription). */
const periodEnd = (sub) => {
  const s = sub?.items?.data?.[0]?.current_period_end ?? sub?.current_period_end;
  return s ? s * 1000 : null;
};

function makeBilling({ db, auth, stripe, entitlement, now = Date.now, prices = {}, portalConfig = "", origins = [] }) {
  const ref = {
    customer: (uid) => db.doc(`billing/main/customers/${uid}`),
    index: (customerId) => db.doc(`billing/main/customerIndex/${customerId}`),
    member: (uid) => db.doc(`sites/${SITE_ID}/members/${uid}`),
  };
  const okOrigin = (o) => {
    if (!origins.includes(o)) throw new BillingError("invalid-argument", "That return address isn't allowed.", "origin");
    return o;
  };

  async function customerFor(uid, { create = true } = {}) {
    const snap = await ref.customer(uid).get();
    if (snap.exists && snap.get("customerId")) return snap.get("customerId");
    if (!create) return null;
    let email;
    try { email = (await auth.getUser(uid)).email || undefined; } catch { email = undefined; }
    const profile = await db.doc(`sites/${SITE_ID}/profiles/${uid}`).get();
    const c = await stripe.customers.create({ email, name: profile.exists && profile.get("handle") ? `@${profile.get("handle")}` : undefined, metadata: { uid } }, { idempotencyKey: `customer-${uid}` });
    await ref.customer(uid).set({ customerId: c.id, createdAt: now() });
    await ref.index(c.id).set({ uid });
    return c.id;
  }

  /** The member's live Stripe subscription (active, trialing or past_due), straight from Stripe, or null. */
  async function liveSubscription(customerId) {
    const list = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
    return (list.data || []).find((s) => ACTIVE.includes(s.status)) || null;
  }

  async function checkout(uid, { kind, guardianOk = false, origin } = {}) {
    if (kind !== "sub" && kind !== "month") throw new BillingError("invalid-argument", "Pick Sub Club or one month.", "kind");
    okOrigin(origin);
    const price = prices[kind];
    if (!price) throw new BillingError("failed-precondition", "Sub Club isn't open yet.", "paymentsOff");
    const [member, age] = await Promise.all([ref.member(uid).get(), db.doc(`users/${uid}/private/age`).get()]);
    if (!member.exists || !age.exists) throw new BillingError("failed-precondition", "Finish signing up first.", "needsSignup");
    const adultAt = age.get("adultAt");
    const adultMs = typeof adultAt === "number" ? adultAt : adultAt?.toMillis?.() ?? Infinity;
    const minor = adultMs > now();
    if (minor && guardianOk !== true) throw new BillingError("failed-precondition", "A parent or guardian has to say yes first.", "guardianRequired");
    const customer = await customerFor(uid);
    if (await liveSubscription(customer)) throw new BillingError("failed-precondition", "You already have Sub Club here. Manage it from My pass.", "alreadySubscribed");
    const metadata = { uid, kind, ...(minor ? { guardianOk: "yes" } : {}) };
    const session = await stripe.checkout.sessions.create({
      customer, client_reference_id: uid, mode: kind === "sub" ? "subscription" : "payment",
      line_items: [{ price, quantity: 1 }], metadata,
      ...(kind === "sub" ? { subscription_data: { metadata: { uid } } } : { payment_intent_data: { metadata, description: "Sub Club, one month" } }),
      success_url: `${origin}/account/club?checkout=success`, cancel_url: `${origin}/club-pass#ch-pick`,
      allow_promotion_codes: false,
    });
    return { url: session.url };
  }

  async function portal(uid, { origin } = {}) {
    okOrigin(origin);
    const customer = await customerFor(uid, { create: false });
    if (!customer) throw new BillingError("failed-precondition", "There's nothing to manage yet.", "noCustomer");
    const s = await stripe.billingPortal.sessions.create({ customer, return_url: `${origin}/account/club`, ...(portalConfig ? { configuration: portalConfig } : {}) });
    return { url: s.url };
  }

  /** For My pass: receipts (newest first) and the subscription's next charge, cancel date or problem. */
  async function status(uid) {
    const customer = await customerFor(uid, { create: false });
    if (!customer) return { receipts: [], subscription: null };
    const [charges, subs] = await Promise.all([stripe.charges.list({ customer, limit: 24 }), stripe.subscriptions.list({ customer, status: "all", limit: 5 })]);
    const receipts = (charges.data || []).filter((c) => c.status === "succeeded").map((c) => ({
      at: c.created * 1000, amount: c.amount, currency: c.currency, description: c.description || (c.metadata?.kind === "month" ? "Sub Club, one month" : "Sub Club"),
      receiptUrl: c.receipt_url || null, refunded: !!c.refunded, amountRefunded: c.amount_refunded || 0,
    }));
    const sub = (subs.data || []).find((s) => ACTIVE.includes(s.status)) || null;
    const subscription = sub ? {
      status: sub.status, renewsAt: sub.cancel_at_period_end || sub.cancel_at ? null : periodEnd(sub),
      cancelAt: sub.cancel_at ? sub.cancel_at * 1000 : sub.cancel_at_period_end ? periodEnd(sub) : null,
      amount: sub.items?.data?.[0]?.price?.unit_amount ?? null, currency: sub.items?.data?.[0]?.price?.currency ?? "usd",
    } : null;
    return { receipts, subscription };
  }

  return { checkout, portal, status, customerFor, liveSubscription, ref };
}

module.exports = { makeBilling, BillingError, periodEnd, ACTIVE };
