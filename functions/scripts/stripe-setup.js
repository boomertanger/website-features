#!/usr/bin/env node
// functions/scripts/stripe-setup.js: Club Pass billing on STAGING, Stripe TEST MODE (docs/specs/club-pass.md §13).
// Creates (or finds) the two Sub Club prices and the customer portal configuration, then writes their ids to functions/.env.staging
// (not secrets: Firebase loads that file for --project staging deploys).
//   "Sub Club"              $5.99 a month, recurring          lookup key sub_club_monthly
//   "Sub Club, one month"   $5.99 once (30 days of gold)        lookup key sub_club_one_month
//   portal                  cancel at period end, update card, invoices; no plan switching    metadata bt=club-portal
// DRY RUN by default (reads Stripe, says what it would create, writes nothing); --apply does it. Refuses any project but staging and
// any key that isn't sk_test_. The key is STRIPE_SECRET_KEY from Secret Manager (Application Default Credentials and Secret Manager
// Secret Accessor); it is never printed.
//
//   node functions/scripts/stripe-setup.js
//   node functions/scripts/stripe-setup.js --apply
const fs = require("fs");
const path = require("path");
const { makeStripe } = require("../lib/billing/stripe");

const STAGING_PROJECT = "boomertanger-staging";
const ORIGIN = "https://staging.boomertanger.com";
const ENV_FILE = path.join(__dirname, "..", ".env.staging");
const SITE = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "site", "src", "data", "site.json"), "utf8"));
const CENTS = Math.round(Number(SITE.clubPass.price) * 100);
const PRICES = [
  { env: "STRIPE_PRICE_SUB", lookup: "sub_club_monthly", product: "Sub Club", description: "Every Club Pass perk, renewed monthly.", recurring: { interval: "month" } },
  { env: "STRIPE_PRICE_MONTH", lookup: "sub_club_one_month", product: "Sub Club, one month", description: "30 days of every Club Pass perk. Doesn't renew.", recurring: null },
];

/** functions/.env.staging with these keys set (other lines kept as they are). Pure. */
function mergeEnv(text, values) {
  const lines = String(text || "").split(/\r?\n/);
  const seen = new Set();
  const out = lines.map((l) => { const m = l.match(/^([A-Z0-9_]+)=/); if (m && m[1] in values) { seen.add(m[1]); return `${m[1]}=${values[m[1]]}`; } return l; });
  for (const [k, v] of Object.entries(values)) if (!seen.has(k)) out.push(`${k}=${v}`);
  return out.join("\n").replace(/\n*$/, "\n");
}

async function main() {
  const apply = process.argv.includes("--apply");
  for (const a of process.argv.slice(2)) if (a !== "--apply") throw new Error(`Unknown argument: ${a}`);
  const { readSecret } = require("./youtube-cleanup");
  const key = await readSecret({ projectId: STAGING_PROJECT, name: "STRIPE_SECRET_KEY" });
  const stripe = makeStripe(key);   // throws for anything but sk_test_
  const acct = await stripe.accounts.retrieve().catch((e) => { throw new Error(`Stripe refused the key (${e.code || e.type || e.message}).`); });
  console.log(`Project: ${STAGING_PROJECT}, Stripe account ${acct.id} (TEST MODE)${apply ? "" : " — dry run: nothing is created or written; add --apply"}`);
  if (acct.requirements?.disabled_reason) console.log(`  Note: Stripe says the account has a restriction: ${acct.requirements.disabled_reason}`);

  const ids = {};
  const found = await stripe.prices.list({ lookup_keys: PRICES.map((p) => p.lookup), active: true, limit: 10 });
  for (const p of PRICES) {
    const have = found.data.find((x) => x.lookup_key === p.lookup);
    if (have) {
      const ok = have.unit_amount === CENTS && have.currency === "usd" && !!have.recurring === !!p.recurring;
      console.log(`  ${p.product}: price ${have.id} exists${ok ? "" : ` but is ${have.unit_amount} ${have.currency}${have.recurring ? "/" + have.recurring.interval : ""} (expected ${CENTS} usd): fix it in the dashboard`}`);
      ids[p.env] = have.id;
      continue;
    }
    if (!apply) { console.log(`  ${p.product}: would create the product and a $${(CENTS / 100).toFixed(2)}${p.recurring ? " a month" : " one-time"} price (lookup key ${p.lookup})`); continue; }
    const product = await stripe.products.create({ name: p.product, description: p.description, metadata: { bt: p.lookup } });
    const price = await stripe.prices.create({ product: product.id, unit_amount: CENTS, currency: "usd", lookup_key: p.lookup, ...(p.recurring ? { recurring: p.recurring } : {}), metadata: { bt: p.lookup } });
    console.log(`  ${p.product}: created product ${product.id}, price ${price.id}`);
    ids[p.env] = price.id;
  }

  const configs = await stripe.billingPortal.configurations.list({ active: true, limit: 20 });
  const mine = configs.data.find((c) => c.metadata?.bt === "club-portal");
  if (mine) { console.log(`  Portal: configuration ${mine.id} exists`); ids.STRIPE_PORTAL_CONFIG = mine.id; }
  else if (!apply) console.log("  Portal: would create a configuration (cancel at period end, update card, invoices; no plan switching)");
  else {
    const c = await stripe.billingPortal.configurations.create({
      metadata: { bt: "club-portal" },
      business_profile: { headline: "Boomertanger Sub Club", privacy_policy_url: `${ORIGIN}/privacy`, terms_of_service_url: `${ORIGIN}/terms` },
      default_return_url: `${ORIGIN}/account/club`,
      features: {
        customer_update: { enabled: false },
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: { enabled: true, mode: "at_period_end", proration_behavior: "none" },
        subscription_update: { enabled: false },
      },
    });
    console.log(`  Portal: created configuration ${c.id}`);
    ids.STRIPE_PORTAL_CONFIG = c.id;
  }

  const before = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, "utf8") : "";
  const values = { ...ids };
  if (!/^STRIPE_WEBHOOK=/m.test(before)) values.STRIPE_WEBHOOK = "off";
  const after = mergeEnv(before || "# Staging-only function params (public values, not secrets): Club Pass billing, Stripe TEST MODE (functions/scripts/stripe-setup.js).\n# STRIPE_WEBHOOK=on binds the STRIPE_WEBHOOK_SECRET secret to billingWebhook: set it only once that secret exists.\n", values);
  if (after === before) { console.log("functions/.env.staging: already up to date."); return; }
  if (!apply) { console.log("functions/.env.staging would become:\n" + after.replace(/^/gm, "    ")); return; }
  fs.writeFileSync(ENV_FILE, after);
  console.log("Wrote functions/.env.staging:\n" + after.replace(/^/gm, "    "));
}

module.exports = { mergeEnv, PRICES };
if (require.main === module) main().then(() => process.exit(0)).catch((err) => { console.error(err.message || err); process.exit(1); });
