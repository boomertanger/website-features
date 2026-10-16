// functions/lib/billing/webhook.js: Stripe's webhook for Club Pass billing (docs/specs/club-pass.md §13). Every dependency is injected so
// scripts/check-billing.js signs sample events and runs them against a fake Firestore and a fake Stripe.
//
//   const W = makeWebhook({ db, stripe, entitlement, now, verify });
//   await W.handle(req, res)        // the HTTP handler: signature on the raw body, then each event id once
//   await W.applyEvent(event)       // one verified event (also what the checks call)
//
// Every request: the Stripe-Signature header is checked on the raw body (verify(raw, sig) = stripe.webhooks.constructEvent with the
// endpoint's signing secret; a bad or missing signature is a 400 and nothing is read or written). A live-mode event is ignored until
// launch (BILLING_LIVE). Each event id is handled once: billing/main/events/{eventId} is created first (a repeat gets 200 "duplicate");
// if handling fails, that record is removed and Stripe gets a 500, so its retry is handled.
//
// Events: checkout.session.completed, customer.subscription.created / updated / deleted, invoice.paid, invoice.payment_failed,
// charge.refunded, charge.dispute.created. Writes (server-only; firestore.rules billing/** deny-all):
//   billing/main/customers/{uid}, billing/main/customerIndex/{customerId}, billing/main/subscriptions/{id},
//   billing/main/ledger/{eventId} (append-only: create, never update), and
//   sites/boomertanger/members/{uid}.club.sources.stripe { kind, status, subscriptionId?, renewsAt?, endsAt?, cancelAt?, graceUntil?,
//   monthEndsAt? }, then recomputes the pass (lib/club/entitlement.js).
// Rules: a failed payment keeps the pass gold with graceUntil = first failure + 7 days (Stripe retries in that week and cancels if all
// fail); a full refund or a dispute ends the Stripe source at once (and cancels the subscription); a one-month pass ends 30 days after it
// was paid (a second one adds 30 days to the end of the first).
const admin = require("firebase-admin");
const { periodEnd } = require("./core");

const SITE_ID = "boomertanger";
const DAY = 24 * 60 * 60 * 1000;
const GRACE_MS = 7 * DAY;
const MONTH_MS = 30 * DAY;
const TYPES = ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
  "invoice.paid", "invoice.payment_failed", "charge.refunded", "charge.dispute.created"];
const OVER = ["canceled", "incomplete_expired", "unpaid"];

const idOf = (x) => (x && typeof x === "object" ? x.id : x) || null;
/** The subscription an invoice belongs to (API 2025+: parent.subscription_details; older: invoice.subscription). */
const invoiceSub = (inv) => idOf(inv?.parent?.subscription_details?.subscription) || idOf(inv?.subscription);

function makeWebhook({ db, stripe, entitlement, now = Date.now, verify, live = process.env.BILLING_LIVE === "on" }) {
  const FieldValue = admin.firestore.FieldValue;
  const ref = {
    event: (id) => db.doc(`billing/main/events/${id}`),
    ledger: (id) => db.doc(`billing/main/ledger/${id}`),
    sub: (id) => db.doc(`billing/main/subscriptions/${id}`),
    customer: (uid) => db.doc(`billing/main/customers/${uid}`),
    index: (customerId) => db.doc(`billing/main/customerIndex/${customerId}`),
    member: (uid) => db.doc(`sites/${SITE_ID}/members/${uid}`),
  };

  /** Who a Stripe object belongs to: its metadata.uid, else the customer index, else the Stripe customer's metadata.uid. */
  async function uidOf(obj) {
    const meta = obj?.metadata?.uid || obj?.client_reference_id;
    const customerId = idOf(obj?.customer);
    let uid = meta || null;
    if (!uid && customerId) {
      const ix = await ref.index(customerId).get();
      uid = ix.exists ? ix.get("uid") : null;
      if (!uid) { const c = await stripe.customers.retrieve(customerId); uid = (c && !c.deleted && c.metadata?.uid) || null; }
    }
    if (uid && customerId) {
      const [ix, cu] = await Promise.all([ref.index(customerId).get(), ref.customer(uid).get()]);
      if (!ix.exists) await ref.index(customerId).set({ uid });
      if (!cu.exists) await ref.customer(uid).set({ customerId, createdAt: now() });
    }
    return uid;
  }

  const currentStripe = async (uid) => ((await ref.member(uid).get()).get("club.sources.stripe")) || null;
  /** Writes (or removes, with null) members/{uid}.club.sources.stripe, then recomputes. Skips non-members. */
  async function setStripe(uid, source) {
    const m = await ref.member(uid).get();
    if (!m.exists) { console.warn("billingWebhook: no member doc for", uid); return null; }
    await ref.member(uid).update({ "club.sources.stripe": source ? JSON.parse(JSON.stringify(source)) : FieldValue.delete() });
    return entitlement.recompute(uid, { by: { uid: null, name: "Stripe" } });
  }

  /** A subscription's state -> the Stripe source (keeping a month bought alongside, and the grace window while past_due). */
  async function applySubscription(uid, sub) {
    await ref.sub(sub.id).set({ uid, customerId: idOf(sub.customer), status: sub.status, priceId: sub.items?.data?.[0]?.price?.id || null,
      periodEnd: periodEnd(sub), cancelAtPeriodEnd: !!sub.cancel_at_period_end, cancelAt: sub.cancel_at ? sub.cancel_at * 1000 : null, updatedAt: now() }, { merge: true });
    const cur = await currentStripe(uid);
    const month = (cur?.kind === "month" ? cur.endsAt : cur?.monthEndsAt) || null;
    if (cur?.kind === "sub" && cur.subscriptionId && cur.subscriptionId !== sub.id && !OVER.includes(cur.status) && OVER.includes(sub.status)) return null;   // an old subscription ending: not this one
    if (OVER.includes(sub.status)) return setStripe(uid, month && month > now() ? { kind: "month", status: "paid", endsAt: month } : null);
    const pe = periodEnd(sub);
    const cancelAt = sub.cancel_at ? sub.cancel_at * 1000 : sub.cancel_at_period_end ? pe : null;
    return setStripe(uid, {
      kind: "sub", status: sub.status, subscriptionId: sub.id,
      ...(cancelAt ? { cancelAt } : pe ? { renewsAt: pe } : {}),
      // past_due: keep the first failure's grace window; if this update beats invoice.payment_failed here, start the window now
      ...(sub.status === "past_due" ? { graceUntil: cur?.graceUntil || now() + GRACE_MS } : {}),
      ...(month && month > now() ? { monthEndsAt: month } : {}),
    });
  }

  /** A full refund or a dispute: the Stripe source ends now, and a live subscription is cancelled at Stripe. */
  async function endStripe(uid, why) {
    const cur = await currentStripe(uid);
    if (cur?.subscriptionId && !OVER.includes(cur.status)) {
      try { await stripe.subscriptions.cancel(cur.subscriptionId, { prorate: false }); }
      catch (err) { console.error(`billingWebhook: couldn't cancel ${cur.subscriptionId} after a ${why}`, err?.code || err?.message); }
      await ref.sub(cur.subscriptionId).set({ status: "canceled", endedBy: why, updatedAt: now() }, { merge: true });
    }
    return setStripe(uid, null);
  }

  async function ledger(event, uid, { amount = null, currency = null, objectId = null, note = null } = {}) {
    try {
      await ref.ledger(event.id).create({ type: event.type, uid: uid || null, objectId, amount, currency, note, at: (event.created || 0) * 1000, recordedAt: now(), livemode: !!event.livemode });
    } catch (err) { if (!(err.code === 6 || /already exists/i.test(String(err.message)))) throw err; }
  }

  async function applyEvent(event) {
    const o = event?.data?.object || {};
    const at = (event.created || 0) * 1000 || now();
    switch (event.type) {
      case "checkout.session.completed": {
        const uid = await uidOf(o);
        if (!uid) return { applied: false, why: "no uid" };
        if (o.mode === "payment") {
          if (o.payment_status !== "paid") return { applied: false, why: "not paid" };
          const cur = await currentStripe(uid);
          const base = Math.max(at, (cur?.kind === "month" ? cur.endsAt : cur?.monthEndsAt) || 0);
          const endsAt = base + MONTH_MS;
          await ledger(event, uid, { amount: o.amount_total ?? null, currency: o.currency ?? null, objectId: o.id, note: "one month" });
          if (cur?.kind === "sub" && !OVER.includes(cur.status)) await setStripe(uid, { ...cur, monthEndsAt: endsAt });
          else await setStripe(uid, { kind: "month", status: "paid", endsAt });
          return { applied: true, uid };
        }
        const subId = idOf(o.subscription);
        await ledger(event, uid, { amount: o.amount_total ?? null, currency: o.currency ?? null, objectId: o.id, note: "subscription started" });
        if (subId) await applySubscription(uid, await stripe.subscriptions.retrieve(subId));
        return { applied: true, uid };
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const uid = await uidOf(o);
        if (!uid) return { applied: false, why: "no uid" };
        await ledger(event, uid, { objectId: o.id, note: o.status });
        await applySubscription(uid, o);
        return { applied: true, uid };
      }
      case "invoice.paid": {
        const uid = await uidOf(o);
        if (!uid) return { applied: false, why: "no uid" };
        await ledger(event, uid, { amount: o.amount_paid ?? null, currency: o.currency ?? null, objectId: o.id });
        const subId = invoiceSub(o);
        if (subId) await applySubscription(uid, await stripe.subscriptions.retrieve(subId));   // active again: the grace window goes
        return { applied: true, uid };
      }
      case "invoice.payment_failed": {
        const uid = await uidOf(o);
        if (!uid) return { applied: false, why: "no uid" };
        await ledger(event, uid, { amount: o.amount_due ?? null, currency: o.currency ?? null, objectId: o.id, note: "payment failed" });
        const subId = invoiceSub(o);
        const cur = await currentStripe(uid);
        if (!subId || !cur || cur.kind !== "sub") return { applied: true, uid };
        const graceUntil = cur.graceUntil || at + GRACE_MS;
        await setStripe(uid, { ...cur, status: "past_due", graceUntil });
        return { applied: true, uid };
      }
      case "charge.refunded": {
        const uid = await uidOf(o);
        if (!uid) return { applied: false, why: "no uid" };
        const full = o.refunded === true || (o.amount_refunded || 0) >= (o.amount || 0);
        await ledger(event, uid, { amount: -(o.amount_refunded || 0), currency: o.currency ?? null, objectId: o.id, note: full ? "refund (full)" : "refund (partial)" });
        if (full) await endStripe(uid, "refund");
        return { applied: true, uid, ended: full };
      }
      case "charge.dispute.created": {
        const charge = typeof o.charge === "object" && o.charge ? o.charge : await stripe.charges.retrieve(idOf(o.charge));
        const uid = await uidOf(charge);
        if (!uid) return { applied: false, why: "no uid" };
        await ledger(event, uid, { amount: -(o.amount || 0), currency: o.currency ?? null, objectId: o.id, note: `dispute (${o.reason || "?"})` });
        await endStripe(uid, "dispute");
        return { applied: true, uid, ended: true };
      }
      default: return { applied: false, why: "ignored" };
    }
  }

  async function handle(req, res) {
    if (req.method !== "POST") { res.status(405).send("method"); return; }
    const sig = req.headers?.["stripe-signature"];
    const raw = req.rawBody;
    if (!sig || !raw) { res.status(400).send("signature"); return; }
    let event;
    try { event = verify(raw, sig); } catch { res.status(400).send("signature"); return; }
    if (event.livemode && !live) { res.status(200).send("ignored (live mode)"); return; }
    if (!TYPES.includes(event.type)) { res.status(200).send("ignored"); return; }
    const seen = ref.event(event.id);
    try { await seen.create({ type: event.type, at: (event.created || 0) * 1000, receivedAt: now() }); }
    catch (err) { if (err.code === 6 || /already exists/i.test(String(err.message))) { res.status(200).send("duplicate"); return; } throw err; }
    try {
      const r = await applyEvent(event);
      await seen.set({ result: r.applied ? "applied" : r.why || "skipped" }, { merge: true });
      res.status(200).send(r.applied ? "ok" : "skipped");
    } catch (err) {
      console.error("billingWebhook:", event.type, event.id, err?.type || err?.code || "", String(err?.message || err).slice(0, 200));
      await seen.delete().catch(() => {});
      res.status(500).send("error");
    }
  }

  return { handle, applyEvent, applySubscription, endStripe, uidOf, TYPES };
}

module.exports = { makeWebhook, TYPES, GRACE_MS, MONTH_MS, invoiceSub };
