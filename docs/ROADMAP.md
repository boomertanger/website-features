# Boomertanger rebuild — roadmap

Last updated: 2026-10-04. Every planning chat reads this file first and proposes an update to it when a workstream starts, finishes or changes. Status: **Done**, **In progress**, **Next**, **Later**.

## Order at a glance
| # | Workstream | Status | Chat |
|---|---|---|---|
| 1 | Boom Arcade (step 1: foundations + Tap the Splat v1 for real) | Done (step 1) | Arcade |
| 2 | 404 page | In progress | 404 page |
| 3 | Game Vault | In progress | Games and streams |
| 4 | Schedule Planner | Later | Games and streams |
| 5 | Live Beacon and Control Room | Later | Games and streams |
| 6 | Stream Library | Later | Games and streams |
| 7 | Trophy Room (rewards) | In progress | Community services |
| 7b | Fun Factory | Next | Community services |
| 8 | Accounts part 2b (security and data rights) | Later (before launch) | Accounts and security |
| 9 | Mod Machina | Later | Community services |
| 10 | Porting Bug Zapper, Feature Lab, Cloud Stash + Night Watch | Later (before launch) | Feature ports |
| 11 | Plans and billing (Fan Club, Sub Club) | Later (before launch) | Billing and plans |
| 12 | Contests | Later | Community services |
| 13 | Launch and legal | Later | Launch and legal |

Why this order: Game Vault → Schedule Planner → Control Room → Stream Library is one chain built around the stream object. The Vault supplies the games, the Planner creates the stream objects for next week, the Control Room plays them (start, stop, games played), and the Library stores them. Building the Vault first means no free-text game names to clean up later. The Trophy Room (badges, trophies, XP) comes before Mod Machina and Contests because both depend on it, and the Arcade needs it for pitching; Fun Factory is built on it. Security (2b), the ports and billing must all be done before launch; billing brings the paid Sub Club.

## Done (on staging)
- Foundation: Astro on Cloudflare Pages, home page design, header, mascot logo (R4).
- Tap the Splat v7 footer game with the L3 spotlight footer, fixes (tool spots, phone top row, 2 s grace period), doom organ lose sound, new splat sound.
- Accounts (milestone 2): Google, email (E1 dialog), email link, Twitch; signup; account page; roles; owner boomertanger@gmail.com.
- Growth collector (Twitch + YouTube daily 05:00 PT; TikTok built but off; manual TikTok card on /admin).
- "Shared power" Contact + Follow footer; Contact "Pulse and type" reveal (prompt given; confirm it shipped).
- Live UI kit at https://staging.boomertanger.com/dev/ui-kit/.
- Privacy Policy and Terms drafted; pages on staging at /privacy and /terms (prompt given; confirm it shipped).

## The stream object (shared by workstreams 3 to 6)
Design it once, in the Game Vault chat, so every later piece fills in the same object. Lifecycle: **Planned → Scheduled → Live → Ended → in the Library**.
- Planned: an open slot the owner marked for next week (day, planned start and end).
- Scheduled: games planned for it (from the Game Vault), mod crew signed up, week published to /schedule.
- Live: started in the Control Room (actual start time recorded; live states turn on); switching games records when each game started and ended.
- Ended: stopped in the Control Room (actual end time); which planned games were played or skipped, and for how long.
- Library: the finished object is the Stream Library entry; each Game Vault game lists the streams it appeared in.
Holds: planned and actual start/end, title, platforms, planned games, games played with times, crew, source of each game suggestion, later VOD links and stats. Written by Cloud Functions only.

## Workstreams

### 1. Boom Arcade (step 1 done)
Goal: games, per-version leaderboards, Arcade Studio (pitches), Workshops (Draft board, Keeper). Step 1 = foundations + Tap the Splat v1 for real.
Specs: docs/specs/arcade-overview.md, docs/specs/tap-the-splat.md. Open question: end-screen layout and tone.
Kickoff: "Start workstream 1 (Boom Arcade) from docs/ROADMAP.md."

### 2. 404 page
Goal: an enjoyable, on-brand "page not found" page (lost firefly, dead bug zapper, a way home, "Report this broken link" into Bug Zapper).
Kickoff: see the 404 kickoff message, or "Start workstream 2 (404 page) from docs/ROADMAP.md."

### 3. Game Vault
Goal: every horror game on the channel at /games (boomertanger.games redirects here): cover art, tags, the owner's rating, how often and when it was last streamed, status (playing, finished, abandoned, wishlist), admin editing. Also design the stream object here (see above), since games and streams reference each other. Member game suggestions and votes are built with the Schedule Planner.
Naming: Game Vault games are games Boomertanger streams; Boom Arcade games are games people play on the site. Keep the terms separate.
Specs: `docs/specs/game-vault.md` and `docs/specs/stream-object.md` (both confirmed 2026-10-02); mockups `docs/design/mockups/game-vault-mockups.html` and `game-vault-round-2.html`. Parts 1 to 4 (docs, backend logic, wiring and staging deploy, scripts) come first; the site pages are part 5.
Kickoff: "Start workstream 3 (Game Vault) from docs/ROADMAP.md."

### 4. Schedule Planner
Goal: plan next week with the community. The owner opens slots (e.g. Mon to Fri with times); members suggest and vote on games (from the Game Vault; a new game can be added as a wishlist entry); the owner drags games into slots (a slot can hold several); mods sign up to crew each stream; the owner publishes the week to /schedule (boomertanger.events redirects here). Unpublished changes stay private.
Mod crew per stream: one stream lead (there the whole stream, others lean on them), one lead per platform streamed to (Twitch, YouTube, TikTok), optional helpers with a per-stream cap (default 2 per platform). Mods sign up; the owner or stream lead confirms; reminders go out. Mod eligibility comes from the existing mod role until Mod Machina takes over.
Planner UI idea: week as columns with slot cards, a suggestions tray beside it, crew status on each card ("Lead ✓ · Twitch ✓ · YouTube needed"), a Publish week button.
Depends on: Game Vault, the stream object.
Kickoff: "Start workstream 4 (Schedule Planner) from docs/ROADMAP.md."

### 5. Live Beacon and Control Room
Goal: live and backstage states across the site (header beacon, mascot "aware" lenses, footer Twitch LIVE dot), and the owner's controls at /live for playing the scheduled streams: pick today's stream, Start (records the actual start, turns on live states), mark the game being played (records each game's start and end), Stop (records the end). An unscheduled stream can still be started ad hoc.
Depends on: Schedule Planner, Game Vault, accounts (done), Twitch app (done).
Kickoff: "Start workstream 5 (Live Beacon and Control Room) from docs/ROADMAP.md."

### 6. Stream Library
Goal: finished stream objects at /tv (boomertanger.tv redirects here): look up any past stream, its games played, crew and times, plus YouTube VODs and clips; each linked to its Game Vault game.
Depends on: Control Room.
Kickoff: "Start workstream 6 (Stream Library) from docs/ROADMAP.md."

### 7. Trophy Room (rewards)
Goal: the shared rewards service: badges (5 rarities, 9 collections), trophies, XP, levels and ranks, one append-only ledger, the showcase and persona, crew awards, and an eligibility check other services call ("does member X hold badge Y?"). Includes the profile trophy case.
Spec: [docs/specs/rewards.md](specs/rewards.md) (confirmed 2026-10-03); mockup `docs/design/mockups/trophy-room-how-it-works.html`; starter catalog `functions/data/trophy-room-badges.json` (90 badges). Part 1: docs, kit pieces (`.bt-medal`, `.bt-level--5`), the rewards backend and the Arcade's switch to Central time; part 2: the pages.
Used by: Fun Factory, Arcade Studio (pitching), Contests (entry pools), Mod Machina (Keeper eligibility).
Kickoff: "Start workstream 7 (Trophy Room) from docs/ROADMAP.md."

### 7b. Fun Factory
Goal: quarterly seasons of chapters, campaigns and activities that pay XP, badges and trophies through the Trophy Room; the idea library, the builder with a stage tracker, the member season pass and leaderboard, hidden medal hunts, How it works and the builder guide.
Spec: [docs/specs/fun-factory.md](specs/fun-factory.md); mockups `docs/design/mockups/fun-factory-how-it-works.html` and `fun-factory-screens.html`.
Depends on: Trophy Room (7).
Kickoff: "Start workstream 7b (Fun Factory) from docs/ROADMAP.md."

### 8. Accounts part 2b
Goal: App Check, a signup challenge (Turnstile), rate limits, download my data, account deletion, the admin member list, automated rules tests (needs Java 11+ for the emulator), backups and budget alerts.
Must be done before launch.
Kickoff: "Start workstream 8 (Accounts part 2b) from docs/ROADMAP.md."

### 9. Mod Machina
Goal: mod requests (not public), mod permissions, moderation tools, the Keeper volunteer queue, and eligibility for stream crew sign-ups (taking over from the plain mod role).
Depends on: Badges.
Kickoff: "Start workstream 9 (Mod Machina) from docs/ROADMAP.md."

### 10. Porting existing features
Goal: move Bug Zapper, Feature Lab and Cloud Stash from Squarespace Code Blocks to the new site, and build the Night Watch admin hub.
Must be done before launch.
Kickoff: "Start workstream 10 (Porting existing features) from docs/ROADMAP.md."

### 11. Plans and billing
Goal: Fan Club (free) and Sub Club (paid) plans, payments, entitlements written by server webhooks, an append-only ledger.
Must be done before launch.
Kickoff: "Start workstream 11 (Plans and billing) from docs/ROADMAP.md."

### 12. Contests
Goal: contests with entry pools by badge (e.g. only Tap the Splat badge holders), official rules per contest, fair draws (can be drawn live on stream).
Depends on: Badges; official rules need legal review.
Kickoff: "Start workstream 12 (Contests) from docs/ROADMAP.md."

### 13. Launch and legal
Goal: production Firebase setup, domains and redirects for all 12 domains, custom email sending domain, final privacy and terms, the TikTok app review, go-live on main.
Kickoff: "Start workstream 13 (Launch and legal) from docs/ROADMAP.md."

## Fun Factory hooks
Activity types (and automatic badges) that wait for another workstream. Tick one off when that workstream adds its hook into the Trophy Room's grant functions.
- [ ] Stream presence, stream check-ins, stream streaks and live drops: Live Beacon and Control Room (5).
- [ ] Schedule votes: Schedule Planner (4).
- [ ] Bug Zapper activities and the Bug Finder badge (a confirmed report): porting (10).
- [ ] Feature Lab activities and The Architect badge (an idea that ships): porting (10).
- [ ] Moderation activities and crew awards by mods: Mod Machina (9).
- [ ] Contests: Contests (12).
- [ ] Polls, comments, shout-outs, clips and Discord: not planned yet.

Rule: every future feature spec gets a **"Fun Factory and Trophy Room hooks"** section listing what it can reward (activity types, automatic badges) and the event it fires, so the hook is built with the feature.

## Deadlines
- MemberSpace: turn off auto-renew before 2026-10-20 (it renews 2026-10-31). Nobody uses it and nothing live depends on it, so it doesn't need renewing.
- Squarespace: cancel by 2027-07-01.

## Before launch
- [ ] Set the effective date in the Privacy Policy and Terms (the day they go live).
- [ ] Confirm support@boomertanger.com exists and is monitored.
- [ ] Lawyer review of the Privacy Policy and Terms.
- [ ] Publish them at /privacy and /terms, linked in the footer (production indexable unless decided otherwise).
- [ ] Decide whether the public mailing address on the legal pages should be a PO box or registered agent.
- [ ] Finish the TikTok app review: privacy and terms live, domain verified, Web URL = homepage, redirect https://boomertanger.com/auth/tiktok/callback, sandbox demo video on boomertanger.com, then submit. Set TIKTOK_CLIENT_SECRET for production and press Connect TikTok.
- [ ] Workstreams 8, 10 and 11 done.
- [ ] Production Firebase, secrets and scheduled jobs set up (staging values never carry over).
- [ ] Twitch app: add the production redirect https://boomertanger.com/auth/twitch/callback.
