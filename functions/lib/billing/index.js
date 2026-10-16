// Club Pass billing, Stripe (docs/specs/club-pass.md §13). STAGING / TEST MODE until launch. functions/index.js calls
// build({ adminLogEntry }) and spreads .functions into its exports. The logic is in core.js (checkout, portal, status).
//
//   clubCheckout   signed-up member: { kind: "sub" | "month", guardianOk?, origin } -> { url } of a Stripe Checkout page. Members 13 to
//                  17 (users/{uid}/private/age, server side) need guardianOk: true. Refused with an active Stripe subscription.
//   clubPortal     { origin } -> { url } of the Stripe customer portal (cancel at period end, update card, invoices).
//   clubStatus     -> { receipts: [{ at, amount, currency, description, receiptUrl, refunded }], subscription } for My pass.
//
// Secret: STRIPE_SECRET_KEY (an sk_test_ key on staging; lib/billing/stripe.js refuses anything else). Params (functions/.env.staging,
// public): STRIPE_PRICE_SUB, STRIPE_PRICE_MONTH, STRIPE_PORTAL_CONFIG. They're empty on any other project, so every callable answers
// "Sub Club isn't open yet" there.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret, defineString } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { makeStripe } = require("./stripe");
const { makeBilling, BillingError } = require("./core");
const { makeEntitlement } = require("../club/entitlement");

const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_PRICE_SUB = defineString("STRIPE_PRICE_SUB", { default: "" });
const STRIPE_PRICE_MONTH = defineString("STRIPE_PRICE_MONTH", { default: "" });
const STRIPE_PORTAL_CONFIG = defineString("STRIPE_PORTAL_CONFIG", { default: "" });

// Where Checkout and the portal may send people back to, per project (the same idea as lib/accounts TWITCH_REDIRECTS).
const ORIGINS = {
  "boomertanger-staging": ["https://staging.boomertanger.com", "http://localhost:4321"],
  "boomertanger-prod": [],   // payments stay off in production until launch
};
function projectId() {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  try { return JSON.parse(process.env.FIREBASE_CONFIG || "{}").projectId || ""; } catch { return ""; }
}
const fail = (code, message, reason) => new HttpsError(code, message, { reason });

function build(deps = {}) {
  const db = deps.db || admin.firestore();
  const now = deps.now || Date.now;
  let B = null;
  const billing = () => (B ||= makeBilling({
    db, auth: deps.auth || admin.auth(), stripe: deps.stripe || makeStripe(STRIPE_SECRET_KEY.value()),
    entitlement: makeEntitlement({ db, auth: deps.auth || admin.auth(), now }), now,
    prices: deps.prices || { sub: STRIPE_PRICE_SUB.value(), month: STRIPE_PRICE_MONTH.value() },
    portalConfig: deps.portalConfig ?? STRIPE_PORTAL_CONFIG.value(), origins: deps.origins || ORIGINS[projectId()] || [],
  }));

  const signedIn = (request) => { if (!request.auth) throw fail("unauthenticated", "Sign in first.", "signedOut"); return request.auth.uid; };
  const wrap = (fn) => async (request) => {
    const uid = signedIn(request);
    try { return await fn(uid, request.data || {}); }
    catch (err) {
      if (err instanceof BillingError) throw fail(err.code, err.message, err.reason);
      console.error("billing:", err?.type || err?.code || "", String(err?.message || err).slice(0, 200));
      throw fail("unavailable", "Couldn't reach the payment service. Try again in a minute.", "stripe");
    }
  };

  const functions = {
    clubCheckout: onCall({ secrets: [STRIPE_SECRET_KEY] }, wrap((uid, d) => billing().checkout(uid, { kind: d.kind, guardianOk: d.guardianOk === true, origin: d.origin }))),
    clubPortal: onCall({ secrets: [STRIPE_SECRET_KEY] }, wrap((uid, d) => billing().portal(uid, { origin: d.origin }))),
    clubStatus: onCall({ secrets: [STRIPE_SECRET_KEY] }, wrap((uid) => billing().status(uid))),
  };
  return { functions, helpers: { billing } };
}

module.exports = (deps) => build(deps).functions;
module.exports.build = build;
module.exports.STRIPE_SECRET_KEY = STRIPE_SECRET_KEY;
