# Club Pass: billing test plan (staging, Stripe TEST MODE)

Spec: `docs/specs/club-pass.md` §13 (and §11 for My pass). Everything here is on **staging**
(`https://staging.boomertanger.com`, Firebase `boomertanger-staging`) with Stripe in **test mode**: no real money moves.
Production keeps "Opening soon".

**Before you start:** the webhook endpoint exists in Stripe (test mode), `STRIPE_WEBHOOK_SECRET` is set, and `billingWebhook`
has been redeployed with `STRIPE_WEBHOOK=on` (Claude does the redeploy). Hard-refresh each page (Ctrl+Shift+R).

## Stripe's test cards
Any future expiry date (e.g. 12/34), any 3-digit CVC, any ZIP.

| Card | What it does |
|---|---|
| `4242 4242 4242 4242` | Good card: every payment goes through |
| `4000 0000 0000 0002` | Declined at checkout |
| `4000 0000 0000 0341` | Saves fine, but every charge after that fails: use it to **fail on renewal** (add it in the portal, then advance the test clock) |
| `4000 0025 0000 3155` | **Needs bank authentication** (3D Secure): a test "Complete" / "Fail" screen appears |

## You need
- An adult test member and, for step 6, a member who signed up as 13 to 17 (a test birthday).
- For the renewal steps (7 to 9): a test clock for one test member. From the repo root:

      node functions/scripts/stripe-testclock.js --handle <tester>            # dry run
      node functions/scripts/stripe-testclock.js --handle <tester> --apply

  Do that **before** that member's first purchase.

## 1. Buy Sub Club (good card)
1. As the adult test member, open `/club-pass`, press **Get Sub Club**. The dialog shows Sub Club monthly and One month; pick monthly,
   **Continue to payment**.
2. Stripe's Checkout page opens. Pay with `4242 4242 4242 4242`.
3. You land on `/account/club`: "Payment received. Turning your pass gold…", then the pass turns gold **without a reload**, the gold
   moment plays, and "You're in Sub Club. Welcome!".
4. My pass shows **Gold, paid here. Renews <date>**, Payments shows **$5.99 next charge <date>** and a receipt with **Receipt ↗**.
5. Press **Get Sub Club** again on `/club-pass`: "You already have Sub Club here. Manage it from My pass."

## 2. Declined card
As another adult member, start a checkout and pay with `4000 0000 0000 0002`. Stripe says the card was declined; nothing changes on
My pass (still Fan Club).

## 3. Needs bank authentication
Start a checkout and pay with `4000 0025 0000 3155`. On Stripe's test screen press **Fail**: no payment, still Fan Club. Try again
and press **Complete**: the pass turns gold as in step 1.

## 4. Manage payment and cancel
1. My pass > **Manage payment**: Stripe's portal opens (your card, invoices, Cancel). There is no "change plan".
2. **Cancel** the subscription and go back to the site.
3. My pass: **Gold until <date>, then Fan Club**, Resume Sub Club; Payments: **No more charges**.
4. **Resume Sub Club** > in the portal, renew/resume: back to **Renews <date>**.

## 5. One month
As a Fan Club member, **Get Sub Club** > pick **One month, $5.99 once** > pay with `4242…`. My pass: **Gold for one month. Your
month ends <date 30 days on>**, Keep it gold.

## 6. Under 18
As the 13-to-17 member, press **Get Sub Club**. The dialog has the box "I'm a parent or guardian, and I say yes to this purchase."
1. Press **Continue to payment** without ticking it: "A parent or guardian has to tick the box first." Nothing opens.
2. Tick it and continue: Checkout opens.

## 7. A renewal (test clock)
As the test-clock member, buy Sub Club (step 1). Then:

    node functions/scripts/stripe-testclock.js --handle <tester> --advance 31 --apply

After a minute, My pass shows the next renewal date a month later and a second receipt.

## 8. A failed renewal and the 7 days of grace
1. My pass > **Manage payment** > replace the card with `4000 0000 0000 0341`.
2. Advance the clock past the renewal: `… --advance 31 --apply`.
3. My pass: a **red banner** "Your payment didn't go through … stays gold until <date 7 days on>", **Fix my card**. The pass is
   still gold.
4. **Fix my card** > put `4242…` back. Stripe retries; the banner goes away (or advance the clock 2 days to make it retry now).

## 9. Grace runs out
Repeat step 8 but don't fix the card. Advance the clock 8 days or more (`--advance 8 --apply`). Stripe gives up and cancels: My pass is
**Fan Club**. (If Stripe's retry schedule is longer than the week, `clubBillingSweep` ends it at 05:45 Chicago; to run it now: Google
Cloud console > Cloud Scheduler > `firebase-schedule-clubBillingSweep-us-central1` > Force run.)

## 10. Refund and dispute
In the Stripe dashboard (test mode) > Payments, open the test member's payment:
1. **Refund** the full amount: My pass goes to **Fan Club** at once, and the subscription is cancelled. (A partial refund changes nothing.)
2. On another member's payment made with `4000 0000 0000 0259` (it opens a dispute), the pass goes to **Fan Club** too.

## 11. Paying twice
For a member whose pass is gold through Twitch (or with a grant on staging), buy Sub Club. The dialog first says **Your Twitch sub
already gives you Sub Club**; continue anyway. My pass shows the **You're paying twice** banner and **Cancel the site subscription**.

## What to report
Pass, or what you saw, for each step. Logs: Cloud Run logs for `billingWebhook`, `clubCheckout` and `clubBillingSweep` (they never
contain card details or keys). Stripe dashboard > Developers > Webhooks > the endpoint shows every delivery and its response.
