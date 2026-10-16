// functions/lib/billing/stripe.js: the one way the functions and scripts make a Stripe client (docs/specs/club-pass.md §13).
// The API version is pinned here (the stripe package is pinned in package.json), so Stripe never changes shapes under us.
// TEST MODE ONLY until launch: any key that isn't an sk_test_ key is refused, unless BILLING_LIVE=on (not set anywhere yet; the
// production launch checklist turns it on together with the live key).
const Stripe = require("stripe");

const API_VERSION = "2026-08-26.dahlia";   // stripe@22.6.2's own version

function assertKey(key, { live = process.env.BILLING_LIVE === "on" } = {}) {
  if (typeof key !== "string" || !key) throw new Error("No Stripe secret key.");
  if (key.startsWith("sk_test_")) return;
  if (live && key.startsWith("sk_live_")) return;
  throw new Error("That Stripe key isn't a test key (sk_test_...). Live keys are refused until launch.");
}

function makeStripe(key, opts = {}) {
  assertKey(key, opts);
  return new Stripe(key, { apiVersion: API_VERSION, maxNetworkRetries: 2, timeout: 20000, appInfo: { name: "boomertanger-functions" } });
}

module.exports = { makeStripe, assertKey, API_VERSION };
