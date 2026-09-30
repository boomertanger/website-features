# Boomertanger rebuild — roadmap

Last updated: 2026-09-30. Every planning chat reads this file first and proposes an update to it when a workstream starts, finishes or changes. Status: **Done**, **In progress**, **Next**, **Later**.

## Order at a glance
| # | Workstream | Status | Chat |
|---|---|---|---|
| 1 | Boom Arcade (step 1: foundations + Tap the Splat v1 for real) | In progress (testing) | Arcade |
| 2 | 404 page | In progress | 404 page |
| 3 | Live Beacon and Control Room | Next | Live and Control Room |
| 4 | Badges | Later | Community services |
| 5 | Accounts part 2b (security and data rights) | Later (before launch) | Accounts and security |
| 6 | Mod Machina | Later | Community services |
| 7 | Porting Bug Zapper, Feature Lab, Cloud Stash + Night Watch | Later (before launch) | Feature ports |
| 8 | Plans and billing (Fan Club, Sub Club) | Later (before launch) | Billing and plans |
| 9 | Contests | Later | Community services |
| 10 | Launch and legal | Later | Launch and legal |

Why this order: Live is the heart of the site and lights up the footer's Twitch state. Badges come before Mod Machina and Contests because both depend on them, and the Arcade needs them for pitching. Security (2b), the ports and billing must all be done before launch; billing is what lets MemberSpace go.

## Done (on staging)
- Foundation: Astro on Cloudflare Pages, home page design, header, mascot logo (R4).
- Tap the Splat v7 footer game with the L3 spotlight footer, fixes (tool spots, phone top row, 2 s grace period), doom organ lose sound, new splat sound.
- Accounts (milestone 2): Google, email (E1 dialog), email link, Twitch; signup; account page; roles; owner boomertanger@gmail.com.
- Growth collector (Twitch + YouTube daily 05:00 PT; TikTok built but off; manual TikTok card on /admin).
- "Shared power" Contact + Follow footer; Contact "Pulse and type" reveal (prompt given; confirm it shipped).
- Live UI kit at https://staging.boomertanger.com/dev/ui-kit/.
- Privacy Policy and Terms drafted; pages on staging at /privacy and /terms (prompt given; confirm it shipped).

## Workstreams

### 1. Boom Arcade
Goal: games, per-version leaderboards, Arcade Studio (pitches), Workshops (Draft board, Keeper). Step 1 = foundations + Tap the Splat v1 for real.
Specs: docs/specs/arcade-overview.md, docs/specs/tap-the-splat.md. Open question: end-screen layout and tone.
Kickoff: "Start workstream 1 (Boom Arcade) from docs/ROADMAP.md."

### 2. 404 page
Goal: an enjoyable, on-brand "page not found" page (lost firefly, dead bug zapper, a way home, "Report this broken link" into Bug Zapper).
Kickoff: see the 404 kickoff message, or "Start workstream 2 (404 page) from docs/ROADMAP.md."

### 3. Live Beacon and Control Room
Goal: live and backstage states across the site (header beacon, mascot "aware" lenses, footer Twitch LIVE dot), and the owner's streaming controls (go live, backstage, schedule, stream info).
Depends on: accounts (done), Twitch app (done).
Kickoff: "Start workstream 3 (Live Beacon and Control Room) from docs/ROADMAP.md."

### 4. Badges
Goal: the shared badge service: stable badge IDs, game scope, levels, awarding (by functions), display on profiles, and an eligibility check other services call ("does member X hold badge Y?"). Includes public profiles.
Used by: Arcade Studio (pitching), Contests (entry pools), Mod Machina (Keeper eligibility).
Kickoff: "Start workstream 4 (Badges) from docs/ROADMAP.md."

### 5. Accounts part 2b
Goal: App Check, a signup challenge (Turnstile), rate limits, download my data, account deletion, the admin member list, automated rules tests (needs Java 11+ for the emulator), backups and budget alerts.
Must be done before launch.
Kickoff: "Start workstream 5 (Accounts part 2b) from docs/ROADMAP.md."

### 6. Mod Machina
Goal: mod requests (not public), mod permissions, moderation tools, the Keeper volunteer queue.
Depends on: Badges.
Kickoff: "Start workstream 6 (Mod Machina) from docs/ROADMAP.md."

### 7. Porting existing features
Goal: move Bug Zapper, Feature Lab and Cloud Stash from Squarespace Code Blocks to the new site, and build the Night Watch admin hub.
Must be done before launch.
Kickoff: "Start workstream 7 (Porting existing features) from docs/ROADMAP.md."

### 8. Plans and billing
Goal: Fan Club (free) and Sub Club (paid) plans, payments, entitlements written by server webhooks, an append-only ledger. This is what replaces MemberSpace.
Must be done before launch.
Kickoff: "Start workstream 8 (Plans and billing) from docs/ROADMAP.md."

### 9. Contests
Goal: contests with entry pools by badge (e.g. only Tap the Splat badge holders), official rules per contest, fair draws (can be drawn live on stream).
Depends on: Badges; official rules need legal review.
Kickoff: "Start workstream 9 (Contests) from docs/ROADMAP.md."

### 10. Launch and legal
Goal: production Firebase setup, domains and redirects for all 12 domains, custom email sending domain, final privacy and terms, the TikTok app review, go-live on main.
Kickoff: "Start workstream 10 (Launch and legal) from docs/ROADMAP.md."

## Deadlines
- MemberSpace: decide by 2026-10-20; it renews 2026-10-31. The new site won't be live by then, so plan to renew once unless nothing on the current site depends on it.
- Squarespace: cancel by 2027-07-01.

## Before launch
- [ ] Set the effective date in the Privacy Policy and Terms (the day they go live).
- [ ] Confirm support@boomertanger.com exists and is monitored.
- [ ] Lawyer review of the Privacy Policy and Terms.
- [ ] Publish them at /privacy and /terms, linked in the footer (production indexable unless decided otherwise).
- [ ] Decide whether the public mailing address on the legal pages should be a PO box or registered agent.
- [ ] Finish the TikTok app review: privacy and terms live, domain verified, Web URL = homepage, redirect https://boomertanger.com/auth/tiktok/callback, sandbox demo video on boomertanger.com, then submit. Set TIKTOK_CLIENT_SECRET for production and press Connect TikTok.
- [ ] Workstreams 5, 7 and 8 done.
- [ ] Production Firebase, secrets and scheduled jobs set up (staging values never carry over).
- [ ] Twitch app: add the production redirect https://boomertanger.com/auth/twitch/callback.
- [ ] Cancel MemberSpace once billing is live.
