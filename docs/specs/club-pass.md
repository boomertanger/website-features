# Spec: Club Pass (Fan Club and Sub Club) — CONFIRMED (2026-10-15)

Club Pass is the membership system: the page that sells and explains Fan Club (free) and Sub Club
(paid), the plans and payments behind it (absorbs ROADMAP workstream 11, Plans and billing), member
management for admins, and later the member home. Approved mockup: `docs/design/mockups/club-pass.html`
(mockup 5, "the merged magazine", approved Oct 15, 2026).

## 1. Plans and prices
| | Fan Club | Sub Club |
|---|---|---|
| Price | Free | $5.99 a month (matches Twitch Tier 1 US web) |
| Also sold | | One month, no renewal: $5.99 · Gift one month: $5.99 |
| Tips | Any member or visitor: $2 minimum, preset $3 / $5 / $10. No perks, no XP, never on leaderboards. | |
| Not offered | Annual plans; a founding-member price | |

- Twitch subs **count**: an active Twitch sub to Boomertanger on a linked Twitch account gives Sub Club
  for as long as it lasts, Prime and gifted subs included. Members paying on both see "You're paying
  twice" with a way to cancel the site subscription. YouTube memberships get the same rule later, once
  channel memberships are on.
- Crew keep free Sub Club through `crewComp` (Mod Machina). Owner grants exist for gifts and testing.
- Merch shop: members only, even to browse. Sub Club gets 10% off (proposed; confirm before the shop
  ships) and early access to new merch.
- Contests and drawings (future Contests service): only members checked into the stream can win.

## 2. Who sees what
| | Visitors | Fan Club | Sub Club | Admins |
|---|---|---|---|---|
| /club-pass (everything, with Join free) | ✓ | ✓ (Get Sub Club) | ✓ ("You're in") | ✓ |
| /account/club (pass, renewal, Twitch link, gifts, receipts) | | ✓ | ✓ | ✓ |
| Member home at / | | ✓ | ✓ | ✓ |
| /admin/members | | | | ✓ |

Display state on the page comes from the auth roles (display only). Rules and functions enforce access.

## 3. Pages and routes
- `/club-pass`: one story page, the CLUB PASS magazine. `/club-pass/how-it-works` redirects (301) to it.
  At the domain switch: boomertanger.club → `/club-pass`, boomertanger.plus → `/club-pass#ch-pick`.
- Nav: Community group, blurb "Fan Club and Sub Club, explained".
- Later parts (mockups first, one at a time): `/tip`, `/admin/members`, the member home
  (its own addendum).

### /club-pass layout (mockup 5)
1. **Cover (hero):** strip "Issue 01 · <month year> · Fan Club · Sub Club · Boomertanger"; the masthead
   CLUB PASS is the page title (`.bt-title.bt-title--hero`, slams in once); "Pick your pass"; the gold
   pass hanging as cover star; a price burst (Fan Club FREE · GOLD $5.99); six cover lines linking to
   chapters; a purple "Twitch sub?!" sticker (a link to 05) above the Twitch cover line, its arrow aimed
   at the word Already, never over the pass; Join free / Pick your pass; a headline ticker under the cover.
   The old placeholder /club redirects (301) to /club-pass.
2. **In this issue:** the cover story (02, three fanned perk pages) and numbered rows for the other
   chapters; the "20 perks · 2 passes · 1 goal" strip.
3. **01 Pick your pass:** headline "Two passes. One costs nothing."; the two plan cards (`.bt-plan`);
   "Compare every perk" jumps to 02.
4. **02 Everything your pass opens:** the perk board (20 buttons in Watch, Play, Inside, You) with a
   No pass / Fan Club / Sub Club switch. No pass: the board is dark and the switch invites a pick.
   Fan Club: its perks light silver one by one. Sub Club: the whole board turns gold. A meter counts
   "N of 20". Tapping a perk opens its magazine spread (`.bt-spread`): kicker, giant headline, drop-cap
   intro, three facts, an animated scene, a stamp (Fan Club included / plus gold / Sub Club), a pull
   line, status for the chosen pass and a call to action; ← → and Flip through (6 s per page).
   The selected perk has a purple ring (no side bar).
5. **03 Get your pass:** the pass press (blank pass → name → club stamp → gold press with sparks) and
   the three-step journey.
6. **04 Going gold:** "Feel the gold moment" (pass turns gold, confetti, "Welcome to Sub Club" stamp),
   the checkout flow, the under-18 note, "Sub Club opens soon" while payments are off.
7. **05 Twitch subs**, **06 Gifts and tips**, **07 Where your money goes** (fees and tax first, the
   rest builds the road; the Goal Tracker levels; never income numbers), **08 The fine print** (six
   rules), **09 Dear BOOMBOT** (six letters, `.bt-chat` behaviour).
8. **Back cover:** the gold "Admit one" ticket (`.bt-admit`); Join free tears off the stub.

Phones (640px and below): mockup club-pass-phone-cover.html, P1 ("Magazine cover", approved Oct 16, 2026). Cover lines 01-03 on
the left and the hanging pass in a 136px column on the right (the burst on its corner); below them the Twitch sticker over 05, then 05
and 07 full width; 09 Letters is left off the phone cover only; the barcode sits small in the bottom-right corner of 07.

Colors: Fan Club = silver (`--bt-rank-2`), Sub Club = gold (`--bt-title`) for passes, the board and
stamps. Purple stays the only clickable color. Reduced motion keeps colors and drops movement.

## 4. The perks (data: `site/src/data/club-pass.json`)
Each perk: `id`, `section` (watch, play, inside, you), `icon`, `label`, `plan` (`fan`, `fan+` = Fan
Club with more for Sub Club, `sub`), `soon`, `kicker`, `head` (`*word*` marks the gold or silver
highlight), `dek`, `facts[3]`, `pull`, `scene`, optional `serviceId`. Checked in the build by
`scripts/check-club-pass.js` (unique ids, valid plan and scene, three facts, serviceId exists). Optional `passes`: the spread's status
line for each pass (`visitor`, `fan`, `sub`: two plain lines) where the plan's default lines would be wrong.

Watch: Backstage (fan), Game votes (fan), Sub Club stream (sub, soon).
Play: Chat Games (fan), Badge drops (fan), Contests and drawings (fan+, soon), Night Shift (fan+),
Boom Arcade (fan, soon), boomgames.tv (sub, soon).
Inside: Tech Stack (fan), Creator Climb (fan), Goal Tracker (fan), Numbers note (sub, soon),
Boomertang (fan+, /boomertang; boomertang.md §3: No. 1 and any issue made public are free for everyone, Fan Club reads the back
issues, Sub Club reads the newest issue first; its `passes` lines say so on each pass).
You: Rate and suggest (fan), Trophy case (fan+: 3 pins / 6 + animated frame), Name in the credits
(sub, soon), Text alerts (sub, soon, 18+), Merch shop (fan+, soon), Your account (fan).
Copy is honest: anything not built carries Coming soon; no invented specs or claims.

## 5. Payments switch and the quiet launch
`site/src/data/site.json` → `"clubPass": { "payments": false, "price": "5.99", "shopDiscount": 10 }`.
While `payments` is false every buy, gift and tip button shows "Opening soon" (disabled) and Twitch
linking still works. The site launches quietly first; Stripe's review, Amazon Associates and the TikTok
app review happen while it's public; payments switch on after Stripe re-enables live mode; then the
site is promoted. The word "donate" never appears on the site: it's always "tip".

## 6. Under 18
13 is the minimum age (existing signup). Members 13–17 can buy only after confirming a parent or
guardian is paying or has agreed (checkout checkbox, age band from the server). Gifts need no payment
from the recipient. Text alerts stay 18+.

## 7. Billing (later part; outline)
- Stripe Checkout, Billing and the Customer Portal; Stripe Tax (Minnesota sales tax: confirm with the
  accountant and register before payments switch on).
- `sites/boomertanger/members/{uid}.entitlements.subClub`: `{ active, sources: { stripe?, twitch?,
  gift?, crew?, grant? }, until }`, server-written; mirrored into custom claims (roles gain `"sub"`,
  replacing the staging-only `sub` role).
- `sites/boomertanger/billing/main/`: `customers/{uid}`, `subscriptions/{id}`, `gifts/{id}`,
  `tips/{id}`, append-only `ledger/{id}`. Server only. Card details never touch the site.
- Functions: `billingWebhook` (HTTP, signature-checked), callables `clubCheckout` (sub, month, gift,
  tip), `clubPortal`, `clubLinkTwitch`, `clubAdmin` (adminLog feature `clubPass`), scheduler
  `clubSweep` (daily: gift ends, Twitch rechecks), Twitch EventSub (subscribe, end, gift).
- Edge cases: failed payment → 7 days' grace with a banner; refund or chargeback ends access; gifts to
  the owner or crew are blocked; a gift to someone with Sub Club starts after their time; progress is
  kept when Sub Club ends (Sub Club campaigns pause).

## 8. bt-ui
New kit pieces (bt-ui.css + UI kit page + design-system.md): `.bt-pass` (the club pass card, silver or
gold), `.bt-plan` (plan card), `.bt-spread` (magazine feature spread for story pages), `.bt-admit`
(tear-off ticket call to action; named `.bt-admit` because `.bt-ticket` is already the Scream Planner's
stream ticket). Feature CSS (`club-pass.css`): the cover, the ticker, the contents
spread, the perk board, the spread scenes, the press, the gold moment. Reused: TocLayout,
`.bt-chapter--ghost`, `.bt-title--hero`, `.bt-stamp`, `.bt-placard`, `.bt-chat`, `.bt-lock-card`,
`.bt-badge`, `.bt-chip`, `.bt-btn`, the mascot, BOOMBOT.

## 9. Parts
1. The `/club-pass` page: docs (this spec, the mockup, ROADMAP, CHANGELOG), the kit pieces, the page (payments off), data file and
   check, redirect, nav entry, service manifest. Done.
2. My pass, the account tab at `/account/club` (§11). Done.
3. Twitch counting. 4. Billing on staging (Stripe test mode). 5. Gifts and `/tip`. 6. `/admin/members`.
7. Member home (addendum first).

## 10. Launch checklist additions
Quiet launch; Stripe's form pointing at /club-pass; Minnesota sales tax answer from the accountant;
live Stripe keys as secrets; set `clubPass.payments` to true; one real $5.99 purchase and refund;
.club and .plus redirects; then promote.

## 11. My pass (account tab) — CONFIRMED (2026-10-16)
Mockup: `docs/design/mockups/club-pass-my-pass.html` (hero H1, the hanging pass).
- **Where:** the first tab of the account page (A2 tabs), before Profile. `/account/club` opens it; the
  avatar menu gets "My pass". Phones: the first pill in the swipeable tab row. Signed-in members only.
- **Hero:** the hanging pass (silver Fan Club / gold Sub Club with sheen; handle; swing, still under
  reduced motion), kicker "My pass", plan name, a status line + one sentence, chips (Member since, handle,
  "N of 20 perks"), and the state's buttons.
- **Cards:** Where your gold comes from (one row per source: Fan Club pass, Twitch sub, Paid here,
  Gift, Crew; each with its end or renewal and a pill), Payments (next charge, Manage payment = Stripe's
  portal, receipts), Twitch (linked or not, sub found, Check again, Linked accounts), Gifts (given and
  received, Gift a month). Fan Club adds "What Sub Club adds" (mini perk board 15 → 20 on hover/tap).
  Crew adds a thank-you card.
- **States:** Fan Club; Fan Club + Twitch linked, no sub; gold via Twitch; gold paid here; paying twice
  (banner + "Cancel the site subscription"); gift ("Keep it gold"); crew; cancelled (gold until the end,
  "Resume Sub Club"); payment failed (red banner, 7 days, "Fix my card"); payments not open (every buy
  and gift button "Opening soon"; Twitch linking still works).
- **Gold moment:** the first time the tab opens after the pass turns gold: the pass pops, confetti,
  "Welcome to Sub Club" stamp (`.bt-stamp--sm`). Remembered per viewer in localStorage
  (`bt.club.goldSeen.<uid>`, try/catch); reduced motion: the stamp only.
- **Data:** the tab reads the member's own `sites/boomertanger/members/{uid}.club` summary (server-written
  only): `{ plan, sources: { stripe?, twitch?, gift?, crew? }, renewsAt?, endsAt?, cancelAt?, graceUntil?,
  twitch: { linked, login?, sub?, tier?, prime?, gifted?, checkedAt? }, gifts: { given, received } }`.
  Until billing and Twitch counting exist, it falls back to the auth claims (roles `sub`, crew grade)
  and the existing Twitch link. Receipts and the gift list come from the `clubStatus` callable (billing
  part); Check again calls `clubLinkTwitch` (Twitch part).

## 12. Twitch counting — CONFIRMED (2026-10-16)
- **Broadcaster token:** one token, connected once by the owner on `/admin` ("Connect Twitch broadcaster"), scopes
  `channel:read:subscriptions` and `channel:manage:moderators`, stored server-only at `sites/boomertanger/private/twitchBroadcaster`
  `{ accessToken, refreshToken, accessExpiresAt, scope, twitchUserId }` and refreshed automatically. Mod Machina's mod sync stays off.
- **When a sub is checked:** when a member links Twitch, signs in with Twitch, or presses Check again on My pass (callable
  `clubLinkTwitch`, rate limited 1 a minute and 20 a day per member); EventSub tells the site about new subs, resubs and ends; a daily
  sweep rechecks every linked member.
- **One entitlement module** recomputes each member's pass from all sources (twitch now; stripe, gift and crew later; grant for the
  owner and testing): writes `members/{uid}.club` and adds or removes the "sub" role in the members doc and the custom claims, leaving
  every other role untouched.
- **Stored:** sub or not, tier, is_gift, checkedAt. Nothing else from Twitch; no payment data.
- **Owner:** an "owner" source, worked out from `sites/boomertanger.ownerUid` (never stored by a writer), makes the owner's pass
  always Sub Club. My pass shows it as "Owner" with "Gold, it's your channel."
- **The channel's own Twitch account:** a member whose linked Twitch is the Boomertanger channel itself is never checked for a sub
  (not by the check, EventSub or the sweep). My pass's Twitch card says "This is the channel's own Twitch account."
- **Linked or not** is always `users/{uid}.linked.twitch`, the same data Linked accounts shows; `club.twitch` only adds the sub
  result (members who linked before Twitch counting have none until `functions/scripts/club-twitch-backfill.js` or the sweep runs).
- **Logs:** adminLog feature `clubPass` (connect, disconnect, grants). No activityLog.

## 13. Billing — CONFIRMED (2026-10-16)
- **Products (Stripe test mode first):** "Sub Club" $5.99/month recurring; "Sub Club, one month" $5.99 one-time (30 days of gold, no
  renewal). Customer portal: cancel at period end, update card, invoices; no plan switching. Created by a setup script; price and portal
  ids live in `functions/.env.staging` (not secrets).
- **clubCheckout({ kind: "sub" | "month", guardianOk? })** creates a Stripe Checkout session (one Stripe customer per member, metadata
  uid) and returns its URL; success returns to `/account/club?checkout=success`, cancel to `/club-pass#ch-pick`. Refused when the member
  already has an active Stripe subscription (use the portal instead). Members 13 to 17 (age band from `users/{uid}/private/age`, server
  side) must send `guardianOk: true`, set by a checkbox in a short pre-checkout dialog (`openModal`); members gold through Twitch see a
  "Your Twitch sub already gives you Sub Club" warning in the same dialog before continuing.
- **billingWebhook** (HTTP, Stripe signature checked on the raw body, each event id handled once via `billing/main/events/{eventId}`):
  checkout.session.completed, customer.subscription.created/updated/deleted, invoice.paid, invoice.payment_failed, charge.refunded,
  charge.dispute.created. It writes `billing/main/customers/{uid}`, `subscriptions/{id}` and an append-only `ledger/{id}`, sets
  `members/{uid}.club.sources.stripe { kind, status, renewsAt?, endsAt?, cancelAt?, graceUntil? }`, then recomputes the pass with
  `lib/club/entitlement.js`.
- **Failed payment:** the pass stays gold with graceUntil = first failure + 7 days; Stripe retries within that week and cancels the
  subscription if all fail. Refund or dispute ends the Stripe source at once. One-month pass: endsAt = paid + 30 days.
- **clubPortal** returns a Stripe customer portal URL (return to `/account/club`). **clubStatus** returns receipts (date, amount,
  description, Stripe receipt link) for My pass. A daily **clubBillingSweep** (05:45 America/Chicago) ends one-month passes and expired
  grace periods and recomputes.
- `billing/**` is server only (deny-all rules). Card details never touch the site. Sales tax off on staging; Stripe Tax waits for the
  accountant (launch checklist).
- Payments switch on for staging only; production keeps "Opening soon".
