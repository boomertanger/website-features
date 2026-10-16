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
- Later parts (mockups first, one at a time): `/tip`, `/account/club`, `/admin/members`, the member home
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

Colors: Fan Club = silver (`--bt-rank-2`), Sub Club = gold (`--bt-title`) for passes, the board and
stamps. Purple stays the only clickable color. Reduced motion keeps colors and drops movement.

## 4. The perks (data: `site/src/data/club-pass.json`)
Each perk: `id`, `section` (watch, play, inside, you), `icon`, `label`, `plan` (`fan`, `fan+` = Fan
Club with more for Sub Club, `sub`), `soon`, `kicker`, `head` (`*word*` marks the gold or silver
highlight), `dek`, `facts[3]`, `pull`, `scene`, optional `serviceId`. Checked in the build by
`scripts/check-club-pass.js` (unique ids, valid plan and scene, three facts, serviceId exists).

Watch: Backstage (fan), Game votes (fan), Sub Club stream (sub, soon).
Play: Chat Games (fan), Badge drops (fan), Contests and drawings (fan+, soon), Night Shift (fan+),
Boom Arcade (fan, soon), boomgames.tv (sub, soon).
Inside: Tech Stack (fan), Creator Climb (fan), Goal Tracker (fan), Numbers note (sub, soon),
Boomertang (fan+, soon; Sub Club reads the new edition, Fan Club back issues).
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
1. Docs (this spec, the mockup, ROADMAP, CHANGELOG).
2. Kit pieces.
3. The `/club-pass` page (payments off), data file and check, redirect, nav entry, service manifest.
4. Billing on staging (Stripe test mode), `/account/club`. 5. Twitch counting. 6. Gifts and `/tip`.
7. `/admin/members`. 8. Member home (addendum first).

## 10. Launch checklist additions
Quiet launch; Stripe's form pointing at /club-pass; Minnesota sales tax answer from the accountant;
live Stripe keys as secrets; set `clubPass.payments` to true; one real $5.99 purchase and refund;
.club and .plus redirects; then promote.
