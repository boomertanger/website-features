# Boomertanger rebuild — roadmap

Last updated: 2026-10-10. Every planning chat reads this file first and proposes an update to it when a workstream starts, finishes or changes. Status: **Done**, **In progress**, **Next**, **Later**.

## Order at a glance
| # | Workstream | Status | Chat |
|---|---|---|---|
| 1 | Boom Arcade (step 1: foundations + Tap the Splat v1 for real) | Done (step 1) | Arcade |
| 2 | 404 page | Done on staging (tested Oct 2026) | 404 page |
| 2b | Goal Tracker (needed for relaunch) | In progress | Goal Tracker |
| 3 | Game Vault | In progress | Games and streams |
| 4 | Scream Planner (was Schedule Planner) | In progress (backend Oct 7; site pages next) | Games and streams |
| 4b | Notifications (email, text, push from the Planner's outbox) | Later | Community services |
| 5 | Live Beacon and Control Room | Built on staging (parts 0-9); real-world tests pending | Games and streams |
| 5b | Chat Games (Questions and every game; absorbs Mod Machina phase 4) | Parts 1 to 7 built and tested on staging (Oct 2026); next: Caption This | Community services |
| 6 | Stream Library | Later | Games and streams |
| 7 | Trophy Room (rewards) | Done on staging (waiting sources aside) | Community services |
| 7b | Night Shift (was Fun Factory) | v1 done on staging; v2 later | Community services |
| 8 | Accounts part 2b (security and data rights) | Later (before launch) | Accounts and security |
| 9 | Mod Machina | Phase 1 tested on staging (Oct 7); phase 3 (the Mod Deck) built on staging (Oct 2026), real tests pending; phase 4 lives in Chat Games (5b) | Community services |
| 10 | Porting Bug Zapper, Feature Lab, Cloud Stash + Night Watch | Later (before launch) | Feature ports |
| 11 | Club Pass (plans and billing) | In progress (before launch) | Billing and plans |
| 12 | Contests | Later | Community services |
| 13 | Launch and legal | Later | Launch and legal |
| 14 | Hotline Boom (contact) | Built on staging (parts 0-6); Talk Back built and tested on staging (Oct 15, 2026), all three parts | Community services |
| 15 | 404 page ("the workshop": the firefly-lit basement, Did you mean, Report this broken link; spec [docs/specs/not-found.md](specs/not-found.md)) | Done on staging (tested Oct 2026) | Site shell |
| 16 | Tech Stack (/tech-stack: the streaming setup, the wiring diagram, hardware, software, internet; spec [docs/specs/tech-stack.md](specs/tech-stack.md)) | Built; staging set-up pending | Community services |
| 17 | Nav redesign once the remaining pages are built | Later | Site shell |
| 18 | Service Hub | In progress (docs and manifests) | Service Hub |
| 19 | Base Camp (/base-camp, /base-camp/newfoundland, /base-camp/skipper, /base-camp/mail-call; Kind Words and the Skipper Cam; spec [docs/specs/base-camp.md](specs/base-camp.md)) | Built on staging (Oct 11, 2026); tests pending | Community services |
| 20 | Creator Climb (/climb: follower growth across every platform, members as their own climb; spec [docs/specs/creator-climb.md](specs/creator-climb.md)) | Built (Oct 15, 2026); staging deploy and history import in progress | Community services |
| 21 | Traffic Pulse (/admin/pulse: the site's private, cookieless analytics per service; spec [docs/specs/traffic-pulse.md](specs/traffic-pulse.md)) | In progress (Oct 15, 2026) |
| 22 | The Playbook (/admin/playbook: the owner's private living plan, reviewed monthly through a Claude chat; spec [docs/specs/playbook.md](specs/playbook.md)) | In progress (Oct 15, 2026) | Planning | Admin tools |

Why this order: Game Vault → Scream Planner → Control Room → Stream Library is one chain built around the stream object. The Vault supplies the games, the Planner creates the stream objects for next week, the Control Room plays them (start, stop, games played), and the Library stores them. Building the Vault first means no free-text game names to clean up later. The Trophy Room (badges, trophies, XP) comes before Mod Machina and Contests because both depend on it, and the Arcade needs it for pitching; Night Shift is built on it. Security (2b), the ports and billing must all be done before launch; billing brings the paid Sub Club.

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
Status: done on staging (tested Oct 2026), built as "the workshop" (spec docs/specs/not-found.md; workstream 15). Production check is in "404 page in production" below.

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

### 4. Scream Planner (was Schedule Planner)
Status: **In progress.** Spec `docs/specs/scream-planner.md` (confirmed Oct 7, 2026), approved mockups `docs/design/mockups/scream-planner-mockups.html`. Backend first (logic, callables, `plannerTick`, rules, indexes, test-week script), then the site pages (kit pieces, /schedule, /schedule/plan, /schedule/plan/usual, the /admin card). The original goal below was refined by the spec (usual-week patterns, a weekly ballot, tray order, delay and cancel).
Goal: plan next week with the community. The owner opens slots (e.g. Mon to Fri with times); members suggest and vote on games (from the Game Vault; a new game can be added as a wishlist entry); the owner drags games into slots (a slot can hold several); mods sign up to crew each stream; the owner publishes the week to /schedule (boomertanger.events redirects here). Unpublished changes stay private.
Mod crew per stream: one stream lead (there the whole stream, others lean on them), one lead per platform streamed to (Twitch, YouTube, TikTok), optional helpers with a per-stream cap (default 2 per platform). Mods sign up; the owner or stream lead confirms; reminders go out. Mod eligibility comes from the existing mod role until Mod Machina takes over.
Update (Oct 6, Mod Machina): the crew roles are now Stream Captain (was stream lead) / Room Lead (was platform lead) / Deckhand (was helper), and YouTube counts as two chats (landscape and vertical), so a stream has up to four rooms (Twitch, YouTube Landscape, YouTube Vertical, TikTok); one YouTube Lead may cover both. The stream object's crew field should follow docs/specs/mod-machina.md section 16a: `crew: { captain, chats: { twitch, ytLandscape, ytVertical, tiktok: { lead, deckhands[] } }, caps }`.
Planner UI idea: week as columns with slot cards, a suggestions tray beside it, crew status on each card ("Lead ✓ · Twitch ✓ · YouTube needed"), a Publish week button.
Depends on: Game Vault, the stream object.
**Next: part 8, YouTube events** (see `docs/specs/scream-planner.md` section 15; built before the Control Room).
Kickoff: "Start workstream 4 (Scream Planner) from docs/ROADMAP.md."

### 4b. Notifications
Goal: one service that delivers events from `notifyOutbox` (written by the Scream Planner now; later Mod Machina reminders, Night Shift, Contests) by email, text and push, with per-member preferences on the account page (which events, which channels, quiet hours), unsubscribe links and delivery logs. Until it exists nothing is sent off-site.
Spec: section 9 of `docs/specs/scream-planner.md` (outbox shape in section 4f); a full spec comes when the workstream starts.
Depends on: Scream Planner (outbox), the custom email sending domain (13) and an SMS provider.
Kickoff: "Start workstream 4b (Notifications) from docs/ROADMAP.md."

### 5. Live Beacon and Control Room
Goal: live and backstage states across the site (header beacon, mascot "aware" lenses, footer Twitch LIVE dot), and the owner's controls at /live for playing the scheduled streams: pick today's stream, Start (records the actual start, turns on live states), mark the game being played (records each game's start and end), Stop (records the end). An unscheduled stream can still be started ad hoc.
Status: **Built on staging (parts 0-9); real-world tests pending.** Everything below runs on staging with sample data, the logic and wiring checks (`npm run check`) and Playwright; what still needs a real stream, Streamlabs, a Stream Deck and a real Twitch go-live is the walk-through list in [docs/testing/control-room-test-plan.md](testing/control-room-test-plan.md) (W1 to W6, then the after-show and backstage checks A to E). Built since in their own workstreams: Chat Games (5b: Questions, Hot Seat, Would You Rather, Predictions, their scenes and panels) and the Mod Deck (Mod Machina phase 3). Not built: Connect Streamlabs, Stream Deck key titles with live state and member-chosen looks (spec section 18, "Later").
Spec: [docs/specs/control-room.md](specs/control-room.md); mockups `docs/design/mockups/control-room-review.html` and `control-room-batch-1.html` to `control-room-batch-4.html`.
Parts (spec section 18; one or more commits each, staging first; all built):
0. **Scream Planner part 8, YouTube events:** `004ceb9`, `3274042`, `e8272c7`, `e2ce5b0`, `9e54c3b`.
1. **Docs** (spec, mockups, amendments): `ce29d53`.
2. **Logic** (`lib/live/logic.js`, `check-live.js`): `51b869a`, `2e84323`.
3. **Backend wiring** (callables, check-ins, feeds and ticks, EventSub, rules, indexes, ad hoc streams; staging deployed): `1b7b06c`, `ac8979e`, `37fd037`, `02bff5d`, `39ed8c5`, `06454e6`, `dd31e45`, `2ea5e64` (livePlatformStatus and the TikTok switch).
4. **Kit pieces and the two looks** (UI kit page section "Control Room"): `79508fd`, `f15238e`, `cb95e97`, `21976d7`.
5. **/live/control** (Cockpit): `674f427` shell, `39b6105` before the stream, `5086565` live controls, `5235cf4` the owner's checklist, `fad3f20` Stream Deck and stream view keys, `8820b46` the Start dialog's TikTok switch.
6. **/live and the live states across the site:** `8b4abe4` shell, `5c8290d` waiting room, `1f6195f` the Bridge and backstage, `e65a04a` Just ended, `b5b5d18` live states site-wide; follow-ups `32df1bc` (firstIn and crew grades in public/live, one Twitch channel source), `405d65d` (Offline without a placeholder), `4f784f5` (First in and grade chips).
7. **Check-ins site-wide:** `9e21a88` banner and dialog (7a, 7b), `3dd642c` /account Streams (7c), `1e7e8cf` Punch the clock (7d), `b4d9a2a` the seeded wording with the `--wording` seed mode (applied to staging).
8. **The stream view** (/live/obs): `29ca3ab` page, key and polling, `5cd2ebf` scenes, `82f2984` staging demo; follow-ups `408562f` (covers and next stream in obsFeed, break-side accepted) and `9e88698` (Break · side rail on the Scene card and the deck).
9. **Backstage watching and the after-show:** `6e9fb5a` after-show card, `b65c244` backstage Start, `e6faefb` hand-over and embed retry, `a51f0e9` privacy setting, `93978a2` gate checks and the test plan.
Depends on: Scream Planner, Game Vault, accounts (done), Twitch app (done).
Kickoff: "Start workstream 5 (Live Beacon and Control Room) from docs/ROADMAP.md."

### 5b. Chat Games (Questions and every game; absorbs Mod Machina phase 4)
Decided Oct 9, 2026: **Chat Games** is the one service and the one engine for Questions and every game (the earlier working name "live activities" is retired). Members see two names only, **Questions** (the queue) and **Chat Games** (every game, including Hot Seat, Would You Rather, Predictions, Caption This, Dead Air, Scream Off, Scare Bingo and Body Count). Some games are crew-hosted (they need Room Leads posting in chats, so the Mod Deck); that is a property of the game, not a separate system. Build order: Questions and Hot Seat, then the quick formats (Would You Rather, Predictions, Caption This), then the crew-hosted games once the Mod Deck exists. The game designs and crew-vote rules stay in `docs/specs/mod-machina.md` section 11 until the spec moves them.
Goal: live things members do during a stream: Questions (ask and promote) and every Chat Game, then the ranked extras. Its own service, after the Control Room core. The Control Room already has the places for it: the Play panel on /live, the launch panel on /live/control and in the Mod Deck, the question card and the Hot Seat pickers still to add to the kit (`.bt-qcard`, `.bt-seance`, `.bt-wheel`), and the stream view scenes.
Spec: [docs/specs/chat-games.md](specs/chat-games.md) (confirmed Oct 9, 2026; the as-built notes are in each section). Design decisions: docs/design-system.md §8w.
Status: **Parts 1 to 7 built and tested on staging (Oct 2026):**
- [x] 1. The engine and registry (run states, deadline tasks and the liveTick sweep, `public/live.chatGame`, Stop clean-up, the cue contract, launch tiles).
- [x] 2. Questions (`/live/questions`, `.bt-qcard`, the session, the run panel, the stream view card).
- [x] 3. Packs and the pool (`/crew/games`, the card editor, the Suggested lane).
- [x] 4. Hot Seat (`.bt-seance`, `.bt-wheel`, the rounds, the Play panel, the run panel, the stream view).
- [x] 5. Would You Rather and Predictions (`.bt-choice`, launch dialogs, Save to pack, the settle flow with Correct once and `grant.reverseXp`, the waiting strip and chip, the 15 s result chip).
- [x] 6. The How Chat Games work page (`/live/chat-games`).
- [x] 7. The Mod Deck hookup (`btChatGames.mountRun`, the Deck's Chat Games mod tools, `functions/scripts/cue-sample.js`).
- [x] 8. Docs.

Next:
1. **Caption This**, with a short addendum first (where the frame comes from, how captions are shortlisted, the moderation load).
2. **The crew-hosted games:** Dead Air, Scream Off, Scare Bingo, Body Count. Each needs an addendum first, plus crew votes, host pledges and the Planner's Chat Games slot.
3. **The later formats:** Spirit Board, Dare Deck, Haunted Trivia, Scream-o-meter, next-game vote, Polls, Last Words, Beat Goal, Clip it!.

Open follow-ups:
- [ ] A ban check in every Chat Games callable once the site has a ban flag (spec §4 as built: "not banned" can't be checked yet).
- [ ] A dedicated Night Shift event type for Chat Games (today they post the Stream type with `action: "chat-game-played"` / `"question-answered"`).
Depends on: Control Room (5); the crew-hosted games also need the Mod Deck (Mod Machina phase 3).

### 6. Stream Library
Goal: finished stream objects at /tv (boomertanger.tv redirects here): look up any past stream, its games played, crew and times, plus YouTube VODs and clips; each linked to its Game Vault game.
Depends on: Control Room.
Kickoff: "Start workstream 6 (Stream Library) from docs/ROADMAP.md."

### 7. Trophy Room (rewards)
Goal: the shared rewards service: badges (5 rarities, 9 collections), trophies, XP, levels and ranks, one append-only ledger, the showcase and persona, crew awards, and an eligibility check other services call ("does member X hold badge Y?"). Includes the profile trophy case.
Spec: [docs/specs/rewards.md](specs/rewards.md) (confirmed 2026-10-03); mockup `docs/design/mockups/trophy-room-how-it-works.html`; starter catalog `functions/data/trophy-room-badges.json` (90 badges). Part 1: docs, kit pieces (`.bt-medal`, `.bt-level--5`), the rewards backend and the Arcade's switch to Central time; part 2: the pages.
Used by: Night Shift, Arcade Studio (pitching), Contests (entry pools), Mod Machina (Keeper eligibility).
Status: done on staging, except the badge sources that wait for other workstreams (see Night Shift hooks).
Live drops: built on staging Oct 2026 (parts 0-7); real tests pending (docs/testing/live-drops-test-plan.md). Spec docs/specs/live-drops.md, mockup docs/design/mockups/live-drops.html (P1 One card, helm popover/sheet, B1 Strip).
Live drops follow-ups:
- serverNow in callable replies, for skew-proof countdowns (today they use the browser clock).
- "Already yours" before the tap (one read of profiles/{uid}/badges/{badgeId} while a drop is open).
- A rules test harness (the signed-in cases in the test plan are manual today).
- The UI kit page scrolls sideways at phone width (older sections, not the live drops one).
- Later: a Stream Deck drop key, the chat bot claim message, "until a set time" drops with the badge editor.
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
Account deletion also removes:
- Delete a member's Service Hub ratings and tests (`sites/boomertanger/services/main/ratings` and `tests` where uid is theirs, and `my/{uid}`; docs/specs/service-hub.md §4).
Kickoff: "Start workstream 8 (Accounts part 2b) from docs/ROADMAP.md."

### 9. Mod Machina
Goal: mod requests (not public), mod permissions, moderation tools, the Keeper volunteer queue, and eligibility for stream crew sign-ups (taking over from the plain mod role).
Spec: [docs/specs/mod-machina.md](specs/mod-machina.md) (confirmed Oct 6, 2026); Academy text `docs/specs/crew-academy.md`; mockups `docs/design/mockups/mod-machina-screens.html`, `mod-machina-guides.html` and `mod-machina-live.html`.
Status: **Phase 1 (crew core, spec section 15) is built and tested on staging (Oct 7, 2026).** Tested end to end: the owner's waiver, applying on /crew/join, approving on /crew/queue, the new Initiate in /crew/hq, an Academy quiz paying Gears, and the quote on /crew/profile. Built: grades and status, the queue, Gears, the task board, the crew board, referral links, Academy modules 1 to 7, 9 and 10, monthly awards, /crew, /crew/how-it-works, /crew/join, /crew/vote, /crew/board, /crew/hq, /crew/queue, /crew/tasks, /crew/profile, /crew/academy and /admin/crew, with the Twitch moderator sync built but off (twitchSync).
Next, in order:
1. **Header nav redesign (done, pushed Oct 7).** The header is now Watch, Play and Community menus plus Shop (spec `docs/specs/header-nav.md`, mockup `docs/design/mockups/header-nav.html`), each with a live feature tile, and Crew is back in Community. The phone More sheet is grouped the same way; Crew also stays in the account menu and the footer. Bug Zapper, Feature Lab and Horror Monthly join Community when their modules are enabled.
2. **Phase 2: Scream Planner seats** (the Planner's backend provides `dutySignUp` / `dutyDrop` / `dutyConfirm`, availability and reminders) and the stream crew field (`crew: { captain, chats: { twitch, ytLandscape, ytVertical, tiktok: { lead, deckhands[] } }, caps }`, spec section 16a): sign-ups, the swap board, reliability, reminders.
3. **Phase 3: the Mod Deck: built on staging (Oct 2026), real staging tests pending** (spec section 17a, eight parts: the swap board, the duty backend and records, the Captain and flags, crew notes, /live/deck, Recruit Rush, the activity rules with a practice month and HQ notices). YouTube moderator sync stays later. **Next:** live drops (Trophy Room, rewards.md §10a), so Drop a badge can join the Deck and the Recruit Rush reward gets a one-tap drop prompt (docs/specs/live-drops.md).
4. **Phase 4: Chat Games, now part of workstream 5b (Chat Games).** The pool, crew votes, Planner slot and Play panel (Dead Air and Scream Off first among the crew-hosted games) are built there, after the Mod Deck; Academy module 8 and the Captain's course content go live with them.
Depends on: Badges.
Kickoff: "Start workstream 9 (Mod Machina) from docs/ROADMAP.md."

### 10. Porting existing features
Goal: move Bug Zapper, Feature Lab and Cloud Stash from Squarespace Code Blocks to the new site, and build the Night Watch admin hub.
Must be done before launch.
Status: Feature Lab is built on staging (spec `docs/specs/feature-lab.md`: /feature-lab, /feature-lab/how-it-works, the /admin card, the lab callables, rules and indexes). Bug Zapper is built on staging too (spec `docs/specs/bug-zapper.md`: /bug-zapper, /bug-zapper/how-it-works, the /admin card, the 404 report link, the bug callables, rules, indexes and the 60-day screenshot cleanup rule). Cloud Stash is built on staging too (spec `docs/specs/cloud-stash.md`: /admin/stash with the Overview, Files, Rules and Activity tabs, /cloud-stash/how-it-works, the /cloud-stash redirect, the /admin card, the stash callables and schedules, the upload gate in every upload-signature callable, the six admin-health alerts, rules, indexes and `functions/scripts/seed-cloud-stash.js`). Night Watch is still to do.
When ported, the 404 page's Report this broken link button opens Bug Zapper with the URL pre-filled (spec: docs/specs/not-found.md, Out of scope).
Kickoff: "Start workstream 10 (Porting existing features) from docs/ROADMAP.md."

### 11. Club Pass (plans and billing)
Goal: Fan Club (free) and Sub Club (paid) plans, payments, entitlements written by server webhooks, an append-only ledger.
Must be done before launch.
Spec: `docs/specs/club-pass.md` (confirmed Oct 15, 2026; mockup `docs/design/mockups/club-pass.html`).
Status: **In progress: part 3 Twitch counting in progress.** Parts 1 and 2 are on staging with payments off: part 1 the /club-pass page (docs, the kit pieces `.bt-pass`, `.bt-plan`, `.bt-spread` and `.bt-admit`, and the page), part 2 the My pass account tab at /account/club (spec §11, mockup `docs/design/mockups/club-pass-my-pass.html`). Part 3 Twitch counting (spec §12) is being built. Then, in order (spec §9): part 4 billing on staging (Stripe test mode), part 5 gifts and /tip, part 6 /admin/members, part 7 the member home.
- [ ] Boom Board full page (was planned at /club): plan its route with the member home (part 7).
Kickoff: "Start workstream 11 (Plans and billing) from docs/ROADMAP.md."

### 12. Contests
Goal: contests with entry pools by badge (e.g. only Tap the Splat badge holders), official rules per contest, fair draws (can be drawn live on stream).
Depends on: Badges; official rules need legal review.
Kickoff: "Start workstream 12 (Contests) from docs/ROADMAP.md."

### 13. Launch and legal
Goal: production Firebase setup, domains and redirects for all 12 domains, custom email sending domain, final privacy and terms, the TikTok app review, go-live on main.
Kickoff: "Start workstream 13 (Launch and legal) from docs/ROADMAP.md."

### 14. Hotline Boom (contact)
Goal: the site's contact service: six lines on `/contact` (who reads each, which fields, which address replies), a private inbox at `/admin/inbox` for the owner and chosen admins (team lines only), and `/contact/how-it-works`.
Spec: [docs/specs/hotline-boom.md](specs/hotline-boom.md) (confirmed Oct 9, 2026); mockups `docs/design/mockups/hotline-boom-contact.html` (Layout 3, W5), `hotline-boom-hero.html` (the /contact hero), `hotline-boom-inbox.html` (Split), `hotline-boom-how-it-works.html` (H1).
Status: **Built on staging (parts 0-6); real tests pending (docs/testing/hotline-boom-test-plan.md).** Parts, one commit each:
0. Docs: spec and mockups in, Boom Alerts topics, ROADMAP, design-system decisions.
1. Kit: `.bt-reveal` + `shared/ui/reveal.js`, the `--bt-contact-privacy` token, the UI kit page.
2. Backend: `contactSend`, `contactAction`, `contactNote`, `contactReply`, `contactSettings` (`functions/lib/hotline/`, Turnstile helper in `functions/lib/security/`), rules, indexes, TTL policies.
3. `/contact` (Layout 3 with the new hero), nav and footer link.
4. `/admin/inbox` (Split: Inbox, Sources, Settings) and the /admin card.
5. `/contact/how-it-works` (H1, the dial).
6. Test plan (`docs/testing/hotline-boom-test-plan.md`).
Part 2 (Talk Back): Hotline Boom part 2. Spec confirmed Oct 10, 2026, mockups approved Oct 11, 2026: [docs/specs/talk-back.md](specs/talk-back.md), `docs/design/mockups/talk-back-*.html`. The page strip, Ask pins and registry move to Service Hub (placement values note, pins, rate, skip; /contact uses rate).
**Talk Back Part A: tested on staging (Oct 14, 2026); results in docs/testing/talk-back-test-plan.md.** Four commits: (1) backend: line 2 "Feedback & questions", contactSend kind / context / boombotShown, stats.byService and serviceStats, contactDeflect, the serviceStats rule; (2) the dialog, the loader, `.bt-pills[data-n="3"]`, Bug Zapper's help file; (3) the inbox context bar, Question:/Feedback: rows, Sources › By service, /contact's Question / Feedback switch; (4) `talkBack` on in site.json, the test plan, docs. **Talk Back Part B: tested on staging (Oct 15, 2026); results in docs/testing/talk-back-test-plan.md (Part B results).** Five commits:
1. Backend: inbox Gears through `lib/hotline/credit.js`, the first reply in a transaction, the spam reversal, Pick up / Let it go, `gearsAdjust`, `crew/main.inbox`, `inboxReplies` on the boards, `inboxStats` and its rule, `inboxSpamHold` and `inboxDeskCheck`, `inbox-sample.js`.
2. /admin/inbox: Pick up, the credit line, the This month strip, Desk clear, the spam stamp with Undo, Gears in the toast; kit `.bt-stamp--gray`.
3. /crew/board's Inbox column; the inbox values and Adjust Gears on /admin/crew.
4. Operator of the Month (the award run, the trophy, the ☎️ card on /crew).
5. Docs.

**Talk Back Part C: built and tested on staging (Oct 15, 2026); results in docs/testing/talk-back-test-plan.md (Part C results).** `/admin/inbox/how-it-works`, the staff guide: the desk hero, ten chapters (the pretend desk and Ask BOOMBOT from `data/help/hotline-inbox.json` among them), and the ways in from the inbox, /admin, the credit line and /admin/crew. Site only: nothing to deploy. **Talk Back is built and tested on staging (Oct 15, 2026), all three parts.** Next: Service Hub part 10's questions column and the first Ask pins on pages.
Depends on: Accounts, Boom Alerts (the alerts wait in notifyOutbox until it's built; replies fall back to "Open in my email" until Resend is set up).

### 16. Tech Stack
Goal: rebuild /tech-stack on the new site: the dual-PC setup, an interactive wiring diagram (Photo, Drawn, Blueprint, Flow and List views, tours, Trace from here, Pull the plug, Inside the mixer), hardware with the PC compare table, software, the internet backbone and setup history. Fan Club parts read `sites/boomertanger/memberContent/tech-stack`. Referral links come later (off until launch).
Spec: [docs/specs/tech-stack.md](specs/tech-stack.md) (confirmed Oct 10, 2026); mockup `docs/design/mockups/tech-stack.html`.
Status: **Built (parts 1-6, Oct 10, 2026); staging set-up pending.** Parts: 1 docs; 2 kit `.bt-zoomframe`; 3 data check and photo upload script; 4 rules and member seed; 5 the page; 6 checks (raw-colour grep clean, check-tech-stack.js ok, site build ok). Still to do on staging: deploy the memberContent rule, upload the photos (upload-tech-stack-photos.js), seed the member doc (seed-tech-stack.js), and set PUBLIC_CLOUDINARY_CLOUD_NAME in Cloudflare Pages so the photos show.

### 17. Nav redesign
Goal: regroup the header and phone navigation once the remaining pages are built (Tech Stack sits in Community for now).

### 18. Service Hub
Goal: one list of every service on the site and stream, kept up to date automatically, so the owner can see at a glance which services have feedback, questions, videos, testing, bugs and ideas, and members can rate and test each one (and every feature page ends with one strip to rate it or talk back).
Spec: [docs/specs/service-hub.md](specs/service-hub.md) (confirmed Oct 10, 2026, with the Talk Back merge); mockup `docs/design/mockups/service-hub-round-1.html` (picks in spec §14). Talk Back's page side moved here (`docs/specs/talk-back.md`, "Split decided Oct 10, 2026").
Status: **In progress (docs and manifests).** Parts, one commit each (spec §13):
1. Docs: the spec, the approved mockups, the Talk Back split note, this entry.
2. Manifests for every existing service (`services/<id>.json`, with `sections`, `talkBack`, `help`), the build step (`/services.json` with a build hash), `check-services.js`, the CLAUDE.md rule and the new-feature checklist line.
3. Backend: data, callables, triggers, rules, indexes, Night Shift and Trophy Room hooks, Mod Machina tasks; staging deploy (only the changed functions).
4. Bug Zapper and Feature Lab: the `serviceId` link.
5. Kit pieces (incl. `.bt-talkback` and `.bt-ask-pin`).
6. `/admin/services` (Grid, Board, Map, Needs attention, detail) and the /admin card.
7. `/services`, the page strip with its Rate half, and the nav entry (the Talk back half stays off until part 10).
8. `/services/how-it-works` (after its round 2 mockup).
9. Growth collector video matching.
10. Talk Back's Hotline Boom side (Hotline Boom part 2), then the Talk back half, the Ask pins and the questions column.
Depends on: nothing for parts 1-9; part 10 waits for Hotline Boom's staging tests (Talk Back).
Kickoff: "Start workstream 18 (Service Hub) from docs/ROADMAP.md."

### 19. Base Camp
Goal: the story of Boomertanger in three pages under one BASECAMP wordmark: /base-camp (who he is and how it started; mostly Fan Club), /base-camp/newfoundland (the island, ten things; public) and /base-camp/skipper (his corgi co-host; the Skipper Cam is Fan Club), plus two shared engines: Kind Words (Puffin Post and Paw Notes, read before they go up) and the Skipper Cam. The Pup Post mail card gives Fan Club members the PO box.
Spec: [docs/specs/base-camp.md](specs/base-camp.md) (confirmed Oct 11, 2026, with the Pup Post addendum); mockups `docs/design/mockups/base-camp.html`, `base-camp-newfoundland.html`, `base-camp-skipper.html`.
Status: **Built on staging (Oct 11, 2026); tests pending.** Parts: 1 docs; 2 the foundation (bar, corgi drawings, Pup Post card, member layer, nav); 3 /base-camp and seed-base-camp.js; 4 /base-camp/newfoundland; 5 Kind Words (rules, kindSubmit / kindWithdraw / kindReview, the wall and composer, /admin/kind-words); 6 the Skipper Cam functions, upload-skipper-media.js, /base-camp/skipper and the kit's openGallery; 7 manifests and this entry. The Fan Club text and the address live in the gitignored functions/scripts/data/base-camp-member.json; Skipper's media pack in the gitignored functions/scripts/data/skipper-media/.
The memberContent rule lists the docs members may read: tech-stack, base-camp and mail (Oct 11, 2026).
Mail Call (Addendum 2, Oct 11, 2026): /base-camp/mail-call, the fourth stop in the BASECAMP bar (not in the header nav): the hero, Send real mail (the Pup Post card, now the only place the address appears), How Mail Call works, Notes for Boomer (Kind Words board boomer: torn notebook pages), Mail Call on stream and Ask BOOMBOT. The Base Camp and Skipper pages show a Mail Call teaser instead of the mail card; /contact has one line pointing fan mail here. Built on staging; tests pending. Later: a list of past Mail Call streams with VOD links, a mail counter, letter of the month.
The rise and "The rise, replayed" (Addendum 3, option B, Oct 15, 2026): chapter 03's journey gets stage 5 "The build" (its line and Fan Club panel fill 10,000 and its date from Creator Climb; the tag reads Under construction until Creator Climb's Back on air era starts, then Back on air, with no code change), five stages in a row that scrolls sideways at 900px and narrower, and "The rise, replayed" replaces "Then and now": a `.bt-scrubber` (new kit piece) through every month-end since January 2025 and Today, with the story lines, Play the climb and the flares. **Depends on Creator Climb** (workstream 20): it reads `sites/boomertanger/public/climb` only and hard-codes no follower number; without that doc the replay is hidden and stage 5's line has no number. Built on staging; tests pending.
Later (spec): an admin editor for Base Camp text; real photos for Newfoundland; more Skipper clips; Skipper Cam auto-detect from YouTube; approval alerts to authors once Boom Alerts ships; guest posting on Kind Words (Turnstile + hashed-IP limits) if wanted.

**Base Camp notes: on-stream mail rules (for Boomer).** Open envelopes off camera and set the envelope aside before showing the letter. Read first names or handles only; skip last names, streets, schools and phone numbers written in letters. Kids' mail: first name only, and no photos of children without a parent's clear OK. "Just for Boomer" letters are read off stream.

### 20. Creator Climb
Goal: one page for the whole climb:
- Follower growth on Twitch, TikTok and YouTube since January 2025, from the old /growth-2025 and /growth-2026 pages plus the daily collector.
- Site members as their own climb.
- Milestones, crossover, month reports, records and pace.

Spec: [docs/specs/creator-climb.md](specs/creator-climb.md) (confirmed Oct 15, 2026). Mockup: `docs/design/mockups/creator-climb.html` (H1-D Summit camp, P1 Night lamps).

Status: **Built (Oct 15, 2026); staging deploy and history import in progress.** Parts:
1. Docs.
2. The kit's `.bt-chart`.
3. The backend: lib/climb, climbRebuild, climbAdmin, the climb rules, and the collector's site-members block. completeSignup records signInMethod. seed-climb-history.js and check-climb.js.
4. The /climb page.
5. The /admin card.
6. The nav entry, manifest, redirects, docs and this entry.

The private history file (`functions/scripts/data/climb-history.json`) is gitignored.

Later:
- **Crowd crossover** (spec §16).
- A per-platform peak once the Control Room records one.

### 21. Traffic Pulse
Goal: the site's private analytics service. Each week it answers what's working (expand it), what's leaking (fix it), what's hidden (promote it) and whether the goals are on pace, per Service Hub service with drill-down to pages. No cookies, no cross-site tracking, no individual visitor trails: counts only. It replaces foundation.md's `trackEvent` helper and the Night Watch "Feature Pulse" view.

Spec: [docs/specs/traffic-pulse.md](specs/traffic-pulse.md) (confirmed Oct 15, 2026). Mockup: `docs/design/mockups/traffic-pulse.html` (H1 Monitor hero, L1 Triage overview, F1 Scatter focus map with lanes under 640px).

Status: **In progress (Oct 15, 2026).** Parts: 1 docs; 2 the kit (`.bt-kpi`, `.bt-spark`, `.bt-delta`, `.bt-quadrant` + `.bt-lanes`, `.bt-chart` compare series and note pins); 3 the beacon, `data-service` on `<body>`, the `/p` proxy (a Cloudflare Pages Function) and "Don't count my visits"; 4 the `lib/pulse` functions, rules, indexes and TTL; 5 /admin/pulse and the /admin card; 6 the Service Hub manifest, `pulse-sample.js` and the test plan; 7 design-system §8 and CLAUDE.md.

Boom Alerts isn't built yet: alerts are written to `notifyOutbox` as `pulse-alert` (audience admins, no message text, a dedupeKey). When Boom Alerts ships, add the topic `pulse-alert` (audience admins, inbox only).

Later (spec §1): the weekly email report (after Resend), A/B experiments, BOOMBOT insights, a custom funnel builder, a traffic panel inside Service Hub's detail dialog, a Night Watch embed of the /admin card, site search terms.

### 22. The Playbook
Goal: owner-only living reference pages that hold the plan (strategy, assumptions, open questions, decisions), one page per service or plan, reviewed each month through a Claude chat: copy a review prompt, talk it through, paste the reply back as one update.

Spec: [docs/specs/playbook.md](specs/playbook.md) (confirmed Oct 15, 2026). **All Playbook text lives in Firestore, never in this repo.** The seed and the approved mockup are private and gitignored (`functions/scripts/data/playbook.json`, `playbook-mockup.html`, and every `playbook-*.json` export).

Status: **In progress (Oct 15, 2026).** Parts: 1 docs; 2 rules, the `playbookAdmin` callable and the `playbookReviewTick` scheduler; 3 the Markdown renderer (`marked` + `DOMPurify`, pinned, browser only) with the six fenced blocks; 4 /admin/playbook and the owner-only /admin card; 5 `seed-playbook.js`, `export-playbook.js` and the Service Hub manifest (adminTool, off /services); 6 the test plan; 7 design-system §8.

Later (spec, out of scope for v1): sharing pages with admins, image uploads, a visual block editor, the reminder by email or push (with Boom Alerts).

## Night Shift hooks
Activity types (and automatic badges) that wait for another workstream. Tick one off when that workstream adds its hook into the Trophy Room's grant functions.
- [x] Live drops: built on staging Oct 2026 (workstream 7, docs/specs/live-drops.md); drop badges are granted through grant() with the quiet flag and count toward stream presence.
- [ ] Stream presence, stream check-ins and stream streaks: Live Beacon and Control Room (5). Stream check-ins now come from the Control Room's **beat windows** (spoken word per beat; presence keeps Twitch chat and drops), not a rolling code (control-room.md section 4, fun-factory.md 13b).
- [ ] Schedule votes: Scream Planner (4).
- [x] Bug Zapper activities and the Bug Finder badge (a confirmed report): porting (10). Done: the bugs Night Shift type (report, confirmed) is on, and the first confirmed status (Confirmed, In progress or Fixed) grants Bug Finder.
- [x] Feature Lab activities and The Architect badge (an idea that ships): porting (10). Done: the lab Night Shift type (post, vote, shipped) is on, and the first move to Shipped grants The Architect.
- [ ] Moderation activities and crew awards by mods: Mod Machina (9).
- [ ] Contests: Contests (12).
- [ ] Polls, comments, shout-outs, clips and Discord: not planned yet.

Rule: every future feature spec gets a **"Night Shift and Trophy Room hooks"** section listing what it can reward (activity types, automatic badges) and the event it fires, so the hook is built with the feature. It also adds or updates its **Service Hub manifest** in `services/` (type, area, routes, version bump when it changes, talkBack note / pins (sections) / rate / skip); `npm run check` warns about pages no manifest claims (CLAUDE.md "New feature checklist").

## Deadlines
- Squarespace: cancel by 2027-07-01.
- Cloudflare Access service token "service-hub-sync" (serviceSyncTick on staging): expires October 2027 (a 1-year token, created Oct 10, 2026). Renew it before then: rotate its client secret in Cloudflare Zero Trust (the client ID stays the same), then set CF_ACCESS_CLIENT_SECRET again on staging (firebase functions:secrets:set CF_ACCESS_CLIENT_SECRET --project staging) and redeploy serviceSyncTick so it picks up the new version. Once it expires, /admin/services shows "Auto sync failing" after 3 runs.

## Before launch
- [x] MemberSpace cancelled Oct 9, 2026. It never went live and had no members, so there is nothing to migrate; the new site's accounts start fresh. (The renewal deadline of Oct 31 and its Oct 20 reminder no longer apply.)
- [ ] Set the effective date in the Privacy Policy and Terms (the day they go live).
- [ ] Confirm support@boomertanger.com exists and is monitored.
- [ ] Lawyer review of the Privacy Policy and Terms.
- [ ] Publish them at /privacy and /terms, linked in the footer (production indexable unless decided otherwise).
- [ ] Decide whether the public mailing address on the legal pages should be a PO box or registered agent.
- [ ] Finish the TikTok app review: privacy and terms live, domain verified, Web URL = homepage, redirect https://boomertanger.com/auth/tiktok/callback, sandbox demo video on boomertanger.com, then submit. Set TIKTOK_CLIENT_SECRET for production and press Connect TikTok.
- [ ] Set CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET to `none` on production (serviceSyncTick declares both on every project; production is public and needs no Cloudflare Access headers; docs/specs/service-hub.md §3b).
- [ ] Deploy onVaultGameService before the Vault import on production, or run reconcile-vault-services.js --apply once after it (`--allow-project <prod id>`; dry run first). On staging the first 78 games were imported before the trigger existed and had no Service Hub item until the reconcile (Oct 15, 2026); serviceSyncTick's Vault guard now catches that drift within 15 minutes.
- [ ] Workstreams 8, 10 and 11 done.

### Club Pass at launch (docs/specs/club-pass.md §10)
- [ ] Launch quietly first; promote only after payments are on.
- [ ] Point Stripe's account form (business website) at /club-pass.
- [ ] Minnesota sales tax: get the accountant's answer and register before payments switch on.
- [ ] Set the live Stripe keys as secrets on production.
- [ ] Set `clubPass.payments` to true in `site/src/data/site.json`.
- [ ] Make one real $5.99 purchase and refund it.
- [ ] Redirect boomertanger.club and boomertanger.plus to /club-pass.
- [ ] Then promote.
- [ ] Production Firebase, secrets and scheduled jobs set up (staging values never carry over).
- [ ] Twitch app: add the production redirect https://boomertanger.com/auth/twitch/callback.
- [ ] Turn on Tech Stack referral links (`site.json` modules `techStack.referrals: true`, with the Amazon Associates disclosure).

### Control Room and YouTube in production
- [ ] Set the YouTube OAuth app to **In production** (not Testing: a Testing app loses its refresh token every 7 days) and set the production `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` secrets.
- [ ] Connect YouTube in production (Connect YouTube on /admin, once; click through the "unverified app" warning).
- [ ] Generate a new stream view key and a new deck key in production (never reuse staging's).
- [ ] Seed `live/main` in production.
- [ ] Production Twitch EventSub: set `TWITCH_EVENTSUB_SECRET` and create the stream.online and stream.offline subscriptions for the production callback (scripts/twitch-eventsub.js is staging only).
- [ ] Re-seed the "Punch the clock" wording in production (`seed-factory-ideas.js`, `seed-factory-types.js`, `seed-badges.js` with `--wording "Punch the clock"`; so far only staging was done).
- [ ] Walk through every item in docs/testing/control-room-test-plan.md on staging first, and note whether TikTok LIVE Studio accepts a browser source.

### Chat Games in production
- [ ] Run the Chat Games seed on production (`node functions/scripts/seed-chat-games.js --project production`, dry run first, then `--apply`): the registry and the General Hot Seat pack.
- [ ] Create the `chatGameDeadline` Cloud Tasks queue in production (same default region as `liveFlush`; on staging the liveTick sweep is the backstop).
- [ ] Deploy rules and indexes first, then the functions in batches per the CLAUDE.md deploy lesson (all `lib/live` functions together first, then batches of about 15 with 3-minute pauses), and confirm each function's served revision, not just ACTIVE.
- [ ] Switch the four formats on in production (`sites/boomertanger/chatGames/main/formats/{questions|hot-seat|would-you-rather|predictions}.enabled`, from /crew/games as the owner).

### Mod Machina in production
- [ ] Deploy rules and indexes first (the TTL fields for crew notes, flags, notices and rushJoins), then all functions together: anything that rebuilds public/live (every function in lib/live) or the crew boards (every Gears grant) must be on the new code at the same time. Watch the Cloud Run CPU quota per region (staging hit it on the full deploy, Oct 2026).
- [ ] Check youtubeBoost in the crew settings (/admin/crew, 1.5 by default).
- [ ] Turn on the activity rules on production from /admin/crew with the start month = the first month after launch (that month is the practice month).
- [ ] Run `functions/scripts/crew-monthly-dry-run.js --project prod` before the first 1st of the month the rules count (and `--as-if-on` before turning them on).
- [ ] Connect the Twitch broadcaster token for mod sync (twitchSync is off until then): store sites/boomertanger/private/twitchBroadcaster { accessToken, refreshToken, accessExpiresAt, scope incl. channel:manage:moderators }, then set crew/main.twitchSync = true in Crew settings. Until then every Twitch mod change is a to-do on /admin/crew.
- [ ] Admin Academy text before the first Steward is invited (outline at the bottom of docs/specs/crew-academy.md; the hub shows it as a locked card).
- [ ] Deploy the crew functions and rules to production (rules first, separately; staging done) and check crewNightly, crewReferralSweep and crewMonthlyAwards are scheduled in the production console.
- [ ] Seed the crew badges in production with the rest of the Trophy Room catalog (seed-badges.js, dry run first).

### Cloud Stash in production
- [ ] Account-deletion file cleanup: deleting an account must also delete that member's uploads (bug screenshots, pending covers) within 7 days. Until it exists, the "deleted with your account, within 7 days" line is left out of /cloud-stash/how-it-works and the FAQ; add it back when the cleanup ships.
- [ ] Retire the legacy Cloud Stash page (the Squarespace Code Block), the `deleteExternalAsset` callable and the legacy `externalAssets` / `cleanupRules` rules, and the `bugReports` rule shape the sweep still runs as a legacy rule. The Bug Zapper cleanup rule is `cleanupRules/bugZapperScreenshots`, set up by `seed-cloud-stash.js` (seed-bug-cleanup-rule.js is retired and deleted, so production setup runs only seed-cloud-stash.js).
- [ ] Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET for production (staging values never carry over).
- [ ] Run functions/scripts/seed-cloud-stash.js on production (it is staging only today: allow the production project name deliberately, dry run first). Then open /admin/stash, run Dry run on "Old bug screenshots" and switch it on: the How it works page promises screenshots are deleted 60 days after a report closes, which is only true while that rule is on.
- [ ] Deploy rules and indexes, then functions, to production (rules first, separately; retry once on an Eventarc/IAM error) and confirm the stash callables, stashUsageDaily, stashScanWeekly and scheduledAssetCleanup in the production console, and the adminLog (feature, createdAt) index is Enabled.

### Trophy Room and Night Shift in production
- [ ] Seed the Trophy Room badge catalog in production: functions/scripts/seed-badges.js --project prod (dry run, then --apply). Includes beat-the-boss and the streak badges; check boomer-s-blessing is owner only.
- [ ] Seed Night Shift activity types in production: seed-factory-types.js --project prod (dry run, then --apply). Check the enabled list matches what's live in production.
- [ ] Seed the Night Shift idea library in production: seed-factory-ideas.js --project prod (dry run, then --apply).
- [ ] Build the season export/import tool (below), export Season 01 from staging, import it into production as a Draft, re-upload its art, set its dates, approve it.
- [ ] Set sites/boomertanger.flags.founderStart in production to the launch date (Founder badge window).
- [ ] Remove the staging test season (seed-test-season.js --remove) once Season 01 is ready on staging.
- [ ] Deploy firestore rules and functions to production (rules first, separately; retry once on an Eventarc/IAM error) and confirm rewardsNightly, factoryTick and factoryStreakSweep are scheduled in the production console.

### Live drops in production
- [ ] Deploy the drops rules to production (rules first, separately).
- [ ] Run seed-badges.js on production (dry run, then --apply): the drop presets, and anniversary-ember's source "drop".
- [ ] grant.js changed (the quiet flag), so the production deploy is the full batched one: all lib/live functions together first, then the rest in batches of about 15 with 3-minute pauses; confirm each function's served revision (Cloud Run latestReadyRevision = latestCreatedRevision, created by this deploy), not just ACTIVE.
- [ ] Confirm the dropSweep Cloud Scheduler job exists and is ENABLED on production.
- [ ] Walk through docs/testing/live-drops-test-plan.md on staging first.

### Creator Climb in production
- [ ] Deploy the climb rules to production (rules first, separately), then climbRebuild, climbAdmin and the growth functions; then completeSignup on its own.
- [ ] Copy climb-history.json to the production machine path. Run `seed-climb-history.js --project prod` as a dry run, then with `--apply`.
- [ ] On /admin, set the **Back on air** start date: the cabin is drawn finished from then, and member counting starts.
- [ ] Check "Left out of member counts": the owner is always left out. Remove @gbo only if it's a real member on production. Production members start at 0.
- [ ] The 301 redirects /growth-2025 and /growth-2026 → /climb go live with the domain switch.
- [ ] After the first production collector run, confirm `public/climb.lastReading` and the gap.

### Traffic Pulse in production
- [ ] Privacy policy paragraph: cookieless counts, a daily-rotating hash, no stored IP, Global Privacy Control / Do Not Track and "Don't count my visits" (part of the pre-launch policy review).
- [ ] Deploy firestore.rules and the indexes to production (rules first, separately), then the `pulse` functions only (pulseBeacon, pulseRollup, pulseDaily, pulseCfPull, pulseReport, pulseAdmin); confirm each served revision.
- [ ] Set the Firestore TTL policies (field `expireAt`) on `buffer`, `uniq` and `uniqMembers` on production and confirm they're active.
- [ ] `PULSE_PROXY_KEY` on both sides: Firebase production secret and the Cloudflare Pages production environment (same value).
- [ ] `CLOUDFLARE_ANALYTICS_TOKEN` (read-only analytics) as a Firebase production secret; the Cloudflare account id and the Web Analytics site tag in functions/.env.
- [ ] Confirm the four Cloud Scheduler jobs exist and are ENABLED (pulseRollup every 15 min, pulseDaily 00:30, pulseCfPull hourly, pulseReport Monday 06:00 and the 1st 06:30, America/Los_Angeles).
- [ ] Each redirect domain adds its own `ref` tag (e.g. boomertanger.live → `ref=dom-live`).
- [ ] **Export Squarespace visit history before cancelling** (monthly visit totals for the optional "old site" baseline; deadline Jul 1, 2027).

### The Playbook in production
- [ ] Deploy firestore.rules to production first (the `playbook` match: owner reads, no client writes), on its own.
- [ ] Deploy `playbookAdmin` and `playbookReviewTick` only (never a full `--only functions`); confirm both served revisions and that the Cloud Scheduler job exists and is ENABLED (the 1st, 06:00 America/Los_Angeles).
- [ ] Export the Playbook from staging with `export-playbook.js` (writes only to the gitignored data folder).
- [ ] Seed production with `seed-playbook.js --project prod` as a dry run, check the counts, then `--apply`.
- [ ] Until then the Playbook is used on staging only.

### Squarespace switch-off cleanup
- [ ] After the Squarespace Code Blocks are off: delete shared/memberspace-helper.js, the features/ folders (bug-zapper, cloud-stash, feature-lab, member-welcome-banner, site-nav-login, _template) and the MemberSpace mentions in README.md, site/README.md and firestore.rules.
- [ ] Make the repo private (right after the Squarespace Code Blocks are switched off); then commit `functions/scripts/data/tech-stack-member.json` and drop it from .gitignore.

### Hotline Boom in production
- [ ] Production Turnstile widget hostnames, and `TURNSTILE_SECRET_KEY` / `CONTACT_HASH_SALT` set on prod.
- [ ] The Resend domain (Boom Alerts part 6) so replies send from the site.
- [ ] Set HOTLINE_EMAIL=on in functions/.env once Boom Alerts sets RESEND_API_KEY, then redeploy the contact functions.
- [ ] Redirect rules on the other 11 domains add `?via=<domain>`.
- [ ] A Privacy Policy line: what the form stores, the 2-year deletion, how the source question works.
- [ ] The Squarespace contact page switched off.
- [ ] Talk Back: deploy `contactDeflect` (with the other contact functions) and the `serviceStats` rule to production (rules first, separately); keep `"talkBack"` in site.json modules; production Turnstile hostnames cover every page with a strip, not just /contact.
- [ ] Talk Back Part B in production:
  - Rules first, on their own: the `hotline/main/inboxStats/{month}` rule.
  - Then the functions, batched:
    - Every function that loads `lib/crew/gears.js`, since inbox Gears and `gearsAdjust` rebuild the crew boards with the new `inboxReplies` shape.
    - Every function that loads `lib/hotline`.
    - The new scheduled `inboxSpamHold` and `inboxDeskCheck`.
    - The new callable `gearsAdjust`.
    - `crewMonthlyAwards` (Operator of the Month).
    - Order: `lib/live` first, then batches of about 15 with 3-minute pauses, confirming the served revisions.
  - Check that Cloud Scheduler has both inbox jobs.
  - No seeds: `crew/main.inbox` falls back to the defaults, and trophies describe themselves (no catalog entry for `crew-operator`).
  - Never run `inbox-sample.js` on production (it refuses).
- [ ] Talk Back Part C (the staff guide at /admin/inbox/how-it-works) needs nothing at launch: it's site only, with no functions, rules or seeds of its own.

### 404 page in production
- [ ] 404 page: confirm it works on production after the first production deploy (rules + reportBrokenLink + brokenLinkFix deployed to prod).

### Base Camp in production
- [ ] Deploy firestore.rules (kindWords, skipperCam, the memberContent check) to production.
- [ ] Deploy `kindSubmit`, `kindWithdraw`, `kindReview`, `skipperCamSet`, `skipperCamWatch`, `skipperCamSweep` to production (only those; confirm the served revision and the sweep's Cloud Scheduler job).
- [ ] Run `seed-base-camp.js --apply` on production (includes the mail doc; the real address must be in the member file first). The script is staging-only today: lift its guard for this run.
- [ ] Re-run `seed-base-camp.js` on production after any member file change; the Addendum 3 change (stops.build, the rise's "started streaming on YouTube") needs it. Dry run first.
- [ ] Creator Climb must be on production first (its rules, functions and seed): Base Camp's stage 5 and "The rise, replayed" read public/climb.
- [ ] At relaunch, add the "Back on air" era in Creator Climb (on /admin, give it its start date): Base Camp's stage 5 tag turns from Under construction to Back on air by itself.
- [ ] Run `upload-skipper-media.js` on production (records only; files already uploaded with fixed ids). Same staging-only guard to lift.

### Real tests pending (staging)
Mod Machina phase 3 walk-throughs in docs/testing/control-room-test-plan.md:
- [ ] W7 Swap board
- [ ] W8 Deck duty loop
- [ ] W9 Captain and flags
- [ ] W10 Recruit Rush
- [ ] W11 Activity rules

### Code health
- [ ] UI kit page scrolls sideways at 390 px (older sections: Control Room, Scream Planner, Night Shift).
- [ ] Clear the 78 older tsc errors across site features (factory, vault and others) so the type check is clean before launch.
