# Boomertanger rebuild — roadmap

Last updated: 2026-10-05. Every planning chat reads this file first and proposes an update to it when a workstream starts, finishes or changes. Status: **Done**, **In progress**, **Next**, **Later**.

## Order at a glance
| # | Workstream | Status | Chat |
|---|---|---|---|
| 1 | Boom Arcade (step 1: foundations + Tap the Splat v1 for real) | Done (step 1) | Arcade |
| 2 | 404 page | In progress | 404 page |
| 2b | Goal Tracker (needed for relaunch) | In progress | Goal Tracker |
| 3 | Game Vault | In progress | Games and streams |
| 4 | Schedule Planner | Later | Games and streams |
| 5 | Live Beacon and Control Room | Later | Games and streams |
| 6 | Stream Library | Later | Games and streams |
| 7 | Trophy Room (rewards) | Done on staging (waiting sources aside) | Community services |
| 7b | Night Shift (was Fun Factory) | v1 done on staging; v2 later | Community services |
| 8 | Accounts part 2b (security and data rights) | Later (before launch) | Accounts and security |
| 9 | Mod Machina | Phase 1 built and tested on staging (Oct 7); phases 2 to 4 later | Community services |
| 10 | Porting Bug Zapper, Feature Lab, Cloud Stash + Night Watch | Later (before launch) | Feature ports |
| 11 | Plans and billing (Fan Club, Sub Club) | Later (before launch) | Billing and plans |
| 12 | Contests | Later | Community services |
| 13 | Launch and legal | Later | Launch and legal |

Why this order: Game Vault → Schedule Planner → Control Room → Stream Library is one chain built around the stream object. The Vault supplies the games, the Planner creates the stream objects for next week, the Control Room plays them (start, stop, games played), and the Library stores them. Building the Vault first means no free-text game names to clean up later. The Trophy Room (badges, trophies, XP) comes before Mod Machina and Contests because both depend on it, and the Arcade needs it for pitching; Night Shift is built on it. Security (2b), the ports and billing must all be done before launch; billing brings the paid Sub Club.

## Done (on staging)
- Foundation: Astro on Cloudflare Pages, home page design, header, mascot logo (R4).
- Tap the Splat v7 footer game with the L3 spotlight footer, fixes (tool spots, phone top row, 2 s grace period), doom organ lose sound, new splat sound.
- Accounts (milestone 2): Google, email (E1 dialog), email link, Twitch; signup; account page; roles; owner boomertanger@gmail.com.
- Growth collector (Twitch + YouTube daily 05:00 PT; TikTok built but off; manual TikTok card on /admin).
- "Shared power" Contact + Follow footer; Contact "Pulse and type" reveal (prompt given; confirm it shipped).
- Live UI kit at https://staging.boomertanger.com/dev/ui-kit/.
- Privacy Policy and Terms drafted; pages on staging at /privacy and /terms (prompt given; confirm it shipped).
- Trophy Room (7): badges, trophies, XP, levels and ranks, the ledger, crew awards, the trophy case, /trophies, How it works and /u/{handle}. Badge sources that wait for other workstreams are listed under Night Shift hooks.
- Night Shift v1 (7b): the engine (activity recording, streaks and savers, the scheduler and season finalize), the idea library, the builder and its guide, the season pass, the leaderboard, How it works, the nav module, the Clock in menu item, hidden medal hunts and site-tour visits.

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

### 2b. Goal Tracker
Goal: the plan to become Content Creator of the Year (The Game Awards 2027) laid out for members at /goals: the North Star, the road of levels, relaunch readiness, 2027 goals, live numbers and how to help. The owner edits a draft at /admin/goals and members see it when he presses Publish. Needed for the relaunch (the readiness meter and countdown are on the gate).
Spec: [docs/specs/goal-tracker.md](specs/goal-tracker.md) (confirmed 2026-10-04); starting plan `docs/specs/goal-tracker-seed.json`; mockup `docs/design/mockups/goal-tracker.html` (road option 1, Level select). Parts: 1 docs, 2 kit (`.bt-road`, `.bt-tree`), 3 backend, 4 members page, 5 admin page.
Status: in progress.
Kickoff: "Start workstream 2b (Goal Tracker) from docs/ROADMAP.md."

### 3. Game Vault
Goal: every horror game on the channel at /games (boomertanger.games redirects here): cover art, tags, the owner's rating, how often and when it was last streamed, status (playing, finished, abandoned, wishlist), admin editing. Also design the stream object here (see above), since games and streams reference each other. Member game suggestions and votes are built with the Schedule Planner.
Naming: Game Vault games are games Boomertanger streams; Boom Arcade games are games people play on the site. Keep the terms separate.
Specs: `docs/specs/game-vault.md` and `docs/specs/stream-object.md` (both confirmed 2026-10-02); mockups `docs/design/mockups/game-vault-mockups.html` and `game-vault-round-2.html`. Parts 1 to 4 (docs, backend logic, wiring and staging deploy, scripts) come first; the site pages are part 5.
Kickoff: "Start workstream 3 (Game Vault) from docs/ROADMAP.md."

### 4. Schedule Planner
Goal: plan next week with the community. The owner opens slots (e.g. Mon to Fri with times); members suggest and vote on games (from the Game Vault; a new game can be added as a wishlist entry); the owner drags games into slots (a slot can hold several); mods sign up to crew each stream; the owner publishes the week to /schedule (boomertanger.events redirects here). Unpublished changes stay private.
Mod crew per stream: one stream lead (there the whole stream, others lean on them), one lead per platform streamed to (Twitch, YouTube, TikTok), optional helpers with a per-stream cap (default 2 per platform). Mods sign up; the owner or stream lead confirms; reminders go out. Mod eligibility comes from the existing mod role until Mod Machina takes over.
Update (Oct 6, Mod Machina): the crew roles are now Stream Captain (was stream lead) / Room Lead (was platform lead) / Deckhand (was helper), and YouTube counts as two chats (landscape and vertical), so a stream has up to four rooms (Twitch, YouTube Landscape, YouTube Vertical, TikTok); one YouTube Lead may cover both. The stream object's crew field should follow docs/specs/mod-machina.md section 16a: `crew: { captain, chats: { twitch, ytLandscape, ytVertical, tiktok: { lead, deckhands[] } }, caps }`.
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
Used by: Night Shift, Arcade Studio (pitching), Contests (entry pools), Mod Machina (Keeper eligibility).
Status: done on staging, except the badge sources that wait for other workstreams (see Night Shift hooks).
Kickoff: "Start workstream 7 (Trophy Room) from docs/ROADMAP.md."

### 7b. Night Shift (was Fun Factory; internal name factory)
Goal: quarterly seasons of chapters, campaigns and activities that pay XP, badges and trophies through the Trophy Room; the idea library, the builder with a stage tracker, the member season pass and leaderboard, hidden medal hunts, How it works and the builder guide.
Spec: [docs/specs/fun-factory.md](specs/fun-factory.md); mockups `docs/design/mockups/fun-factory-how-it-works.html` and `fun-factory-screens.html`.
Depends on: Trophy Room (7).
Status: v1 done on staging.
v2 (later):
- [ ] Story layer and chapter intros.
- [ ] Squad campaigns.
- [ ] Notifications (a chapter unlocks, a streak is at risk, a season ends).
- [ ] AI ideas in the builder.
- [ ] Stream streaks and stream check-ins, with the Control Room (5).
- [ ] Season export/import:
  - `functions/scripts/season-export.js --project staging --season <id>` writes a JSON file (season, chapters, campaigns, activities, hunt medals with hints, season badge name and rarity; no dates, no art files, no progress, no standings, no ledger, no ids that point at member data).
  - `functions/scripts/season-import.js --project prod --file <json>` creates it as a Draft with new ids, dates cleared, art empty, the season badge created as a draft badge; dry run unless `--apply`; refuses if a season with the same name exists unless `--rename` is given.
  - Checks in check-factory for a round trip (export then import gives the same tree minus dates and art).
Kickoff: "Start workstream 7b (Night Shift) from docs/ROADMAP.md."

### 8. Accounts part 2b
Goal: App Check, a signup challenge (Turnstile), rate limits, download my data, account deletion, the admin member list, automated rules tests (needs Java 11+ for the emulator), backups and budget alerts.
Must be done before launch.
Kickoff: "Start workstream 8 (Accounts part 2b) from docs/ROADMAP.md."

### 9. Mod Machina
Goal: mod requests (not public), mod permissions, moderation tools, the Keeper volunteer queue, and eligibility for stream crew sign-ups (taking over from the plain mod role).
Spec: [docs/specs/mod-machina.md](specs/mod-machina.md) (confirmed Oct 6, 2026); Academy text `docs/specs/crew-academy.md`; mockups `docs/design/mockups/mod-machina-screens.html`, `mod-machina-guides.html` and `mod-machina-live.html`.
Status: **Phase 1 (crew core, spec section 15) is built and tested on staging (Oct 7, 2026).** Tested end to end: the owner's waiver, applying on /crew/join, approving on /crew/queue, the new Initiate in /crew/hq, an Academy quiz paying Gears, and the quote on /crew/profile. Built: grades and status, the queue, Gears, the task board, the crew board, referral links, Academy modules 1 to 7, 9 and 10, monthly awards, /crew, /crew/how-it-works, /crew/join, /crew/vote, /crew/board, /crew/hq, /crew/queue, /crew/tasks, /crew/profile, /crew/academy and /admin/crew, with the Twitch moderator sync built but off (twitchSync).
Next, in order:
1. **Header nav redesign (done, pushed Oct 7).** The header is now Watch, Play and Community menus plus Shop (spec `docs/specs/header-nav.md`, mockup `docs/design/mockups/header-nav.html`), each with a live feature tile, and Crew is back in Community. The phone More sheet is grouped the same way; Crew also stays in the account menu and the footer. Bug Zapper, Feature Lab and Horror Monthly join Community when their modules are enabled.
2. **Phase 2: Schedule Planner seats** and the stream crew field (`crew: { captain, chats: { twitch, ytLandscape, ytVertical, tiktok: { lead, deckhands[] } }, caps }`, spec section 16a): sign-ups, the swap board, reliability, reminders.
3. **Phase 3: Control Room / Mod Deck**: clock in, handoffs, duty Gears, per-room check-in codes, YouTube moderator sync, Recruit Rush, and the activity rules switched on (`crew.activityRules`; the HQ time card stops saying "Starts with stream duty").
4. **Phase 4: Chat Games** (the pool, crew votes, Planner slot, Play panel; Dead Air and Scream Off first), then Academy module 8 and the Captain's course content going live.
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

## Night Shift hooks
Activity types (and automatic badges) that wait for another workstream. Tick one off when that workstream adds its hook into the Trophy Room's grant functions.
- [ ] Stream presence, stream check-ins, stream streaks and live drops: Live Beacon and Control Room (5).
- [ ] Schedule votes: Schedule Planner (4).
- [ ] Bug Zapper activities and the Bug Finder badge (a confirmed report): porting (10).
- [ ] Feature Lab activities and The Architect badge (an idea that ships): porting (10).
- [ ] Moderation activities and crew awards by mods: Mod Machina (9).
- [ ] Contests: Contests (12).
- [ ] Polls, comments, shout-outs, clips and Discord: not planned yet.

Rule: every future feature spec gets a **"Night Shift and Trophy Room hooks"** section listing what it can reward (activity types, automatic badges) and the event it fires, so the hook is built with the feature.

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

### Mod Machina in production
- [ ] Connect the Twitch broadcaster token for mod sync (twitchSync is off until then): store sites/boomertanger/private/twitchBroadcaster { accessToken, refreshToken, accessExpiresAt, scope incl. channel:manage:moderators }, then set crew/main.twitchSync = true in Crew settings. Until then every Twitch mod change is a to-do on /admin/crew.
- [ ] Admin Academy text before the first Steward is invited (outline at the bottom of docs/specs/crew-academy.md; the hub shows it as a locked card).
- [ ] Deploy the crew functions and rules to production (rules first, separately; staging done) and check crewNightly, crewReferralSweep and crewMonthlyAwards are scheduled in the production console.
- [ ] Seed the crew badges in production with the rest of the Trophy Room catalog (seed-badges.js, dry run first).

### Trophy Room and Night Shift in production
- [ ] Seed the Trophy Room badge catalog in production: functions/scripts/seed-badges.js --project prod (dry run, then --apply). Includes beat-the-boss and the streak badges; check boomer-s-blessing is owner only.
- [ ] Seed Night Shift activity types in production: seed-factory-types.js --project prod (dry run, then --apply). Check the enabled list matches what's live in production.
- [ ] Seed the Night Shift idea library in production: seed-factory-ideas.js --project prod (dry run, then --apply).
- [ ] Build the season export/import tool (below), export Season 01 from staging, import it into production as a Draft, re-upload its art, set its dates, approve it.
- [ ] Set sites/boomertanger.flags.founderStart in production to the launch date (Founder badge window).
- [ ] Remove the staging test season (seed-test-season.js --remove) once Season 01 is ready on staging.
- [ ] Deploy firestore rules and functions to production (rules first, separately; retry once on an Eventarc/IAM error) and confirm rewardsNightly, factoryTick and factoryStreakSweep are scheduled in the production console.
