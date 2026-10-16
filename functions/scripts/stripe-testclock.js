#!/usr/bin/env node
// functions/scripts/stripe-testclock.js: a Stripe TEST CLOCK customer for a named test member on STAGING (docs/specs/club-pass.md §13;
// docs/testing/club-pass-billing-test-plan.md). With it, renewals and failed renewals happen in minutes instead of a month: buy Sub Club
// as that member (Checkout uses this customer), then advance the clock and Stripe sends the webhook events it would send then.
// DRY RUN by default; --apply does it. Refuses any project but staging and any key but sk_test_ (STRIPE_SECRET_KEY from Secret Manager).
//
//   node functions/scripts/stripe-testclock.js --handle tester                    # dry run: what it would create
//   node functions/scripts/stripe-testclock.js --handle tester --apply            # a test clock + a customer on it, linked to @tester
//   node functions/scripts/stripe-testclock.js --handle tester --advance 31 --apply   # move that clock 31 days forward
//   node functions/scripts/stripe-testclock.js --handle tester --status           # the clock's time and the customer's subscriptions
//
// It refuses a member who already has a Stripe customer that isn't on a test clock (add --replace to start that member over on a clock;
// the old customer stays in Stripe, unused). Writes billing/main/customers/{uid} { customerId, testClock } and customerIndex.
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const { makeStripe } = require("../lib/billing/stripe");

const STAGING_PROJECT = "boomertanger-staging";
const SITE_ID = "boomertanger";

function parseArgs(argv) {
  const a = { apply: false, handle: null, advance: null, status: false, replace: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--apply") a.apply = true;
    else if (x === "--status") a.status = true;
    else if (x === "--replace") a.replace = true;
    else if (x === "--handle") a.handle = String(argv[++i] || "").replace(/^@/, "").toLowerCase();
    else if (x === "--advance") { a.advance = Number(argv[++i]); if (!(a.advance > 0 && a.advance <= 400)) throw new Error("--advance takes a number of days (1 to 400)."); }
    else throw new Error(`Unknown argument: ${x}`);
  }
  if (!a.handle) throw new Error("Say which test member: --handle <handle>.");
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  admin.initializeApp({ projectId: STAGING_PROJECT });
  const db = admin.firestore();
  const { readSecret } = require("./youtube-cleanup");
  const stripe = makeStripe(await readSecret({ projectId: STAGING_PROJECT, name: "STRIPE_SECRET_KEY" }));
  const h = await db.doc(`handles/${args.handle}`).get();
  const uid = h.exists ? h.get("uid") : null;
  if (!uid) throw new Error(`No member with the handle @${args.handle}.`);
  const custRef = db.doc(`billing/main/customers/${uid}`), cur = (await custRef.get()).data() || null;
  console.log(`Project: ${STAGING_PROJECT} (Stripe TEST MODE). Member @${args.handle} (${uid}).${args.apply || args.status ? "" : " Dry run: nothing changes; add --apply."}`);

  if (args.status || args.advance) {
    if (!cur?.testClock) throw new Error(`@${args.handle} has no test-clock customer yet. Run with --apply first.`);
    const clock = await stripe.testHelpers.testClocks.retrieve(cur.testClock);
    console.log(`  Test clock ${clock.id}: ${new Date(clock.frozen_time * 1000).toISOString()} (${clock.status})`);
    const subs = await stripe.subscriptions.list({ customer: cur.customerId, status: "all", limit: 5 });
    for (const s of subs.data) console.log(`  Subscription ${s.id}: ${s.status}${s.cancel_at_period_end ? " (cancels at period end)" : ""}, period ends ${new Date((s.items.data[0]?.current_period_end || 0) * 1000).toISOString()}`);
    if (!args.advance) return;
    const to = clock.frozen_time + Math.round(args.advance * 86400);
    if (!args.apply) { console.log(`  Would advance the clock ${args.advance} days, to ${new Date(to * 1000).toISOString()}.`); return; }
    await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: to });
    console.log(`  Advancing to ${new Date(to * 1000).toISOString()}. Stripe takes a few seconds, then sends the events (renewal, or a failed payment).`);
    return;
  }

  if (cur?.customerId && !args.replace) {
    if (cur.testClock) { console.log(`  Already on test clock ${cur.testClock} (customer ${cur.customerId}). Use --status or --advance.`); return; }
    throw new Error(`@${args.handle} already has a Stripe customer (${cur.customerId}) without a test clock. Add --replace to start over on a clock.`);
  }
  if (!args.apply) { console.log(`  Would create a test clock at now and a customer on it (metadata uid ${uid}), and use it for @${args.handle}'s checkouts.`); return; }
  const user = await admin.auth().getUser(uid).catch(() => null);
  const clock = await stripe.testHelpers.testClocks.create({ frozen_time: Math.floor(Date.now() / 1000), name: `@${args.handle}` });
  const customer = await stripe.customers.create({ email: user?.email || undefined, name: `@${args.handle}`, metadata: { uid }, test_clock: clock.id });
  await custRef.set({ customerId: customer.id, testClock: clock.id, createdAt: Date.now(), ...(cur?.customerId ? { replaced: cur.customerId } : {}) });
  await db.doc(`billing/main/customerIndex/${customer.id}`).set({ uid });
  console.log(`  Created test clock ${clock.id} and customer ${customer.id}. Buy Sub Club as @${args.handle} now; then --advance.`);
}

module.exports = { parseArgs };
if (require.main === module) main().then(() => process.exit(0)).catch((err) => { console.error(err.message || err); process.exit(1); });
