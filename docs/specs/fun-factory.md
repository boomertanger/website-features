# Night Shift spec: seasons, chapters, campaigns and activities

Member-facing name: Night Shift (renamed Oct 6, 2026; internal name stays factory)

The internal names did not change: data paths (`sites/{siteId}/factory/main`), the `factory*` functions, activity type ids, the `ff-` CSS prefix, FactoryLayout, `scripts/factory/` and `factory.css`, and this file's name. The pages moved from `/factory` to `/shift` (old addresses redirect), the wordmark is NIGHT SHIFT with a time clock over a punch card, and the site tour and hidden medals keep their stored key `/factory` for the pages under `/shift`.

Oct 3, 2026 · Glenn Bowering · **Confirmed**
Mockups (stage tracker A chosen Oct 3): How it works https://claude.ai/artifact/Jxo6qvjhVJSHf3gp23RV3j · Screens (season pass, builder with stage tracker options A/B/C, builder guide) https://claude.ai/artifact/5aRBbxzU9BwXjzbcZHT7XP
Builds on the Trophy Room (`rewards.md`): every XP point, badge and trophy is paid through its grant functions.

## 1. Purpose
A quarterly engagement engine that gives members a reason to come back every day, every week and every few weeks. You and the mods plan each season in a builder, picking from a library of ideas, and the site runs it on schedule.

**v1:** seasons, chapters, campaigns and activities with scheduling; the idea library; the builder with a stage tracker; the member season pass; the season leaderboard; hidden medal hunts; the How it works page and the builder guide.
**Later (v2 roadmap):** story layer and chapter intros, squad campaigns, email/push notifications, AI-suggested ideas. Activities that need unbuilt features wait in the library (section 6).

## 2. Who sees what
| | Visitors | Fan Club | Sub Club | Mods | Admins |
|---|---|---|---|---|---|
| How it works | ✓ | ✓ | ✓ | ✓ | ✓ |
| Season pass, leaderboard | Gate (Join free) | ✓ | ✓ | ✓ | ✓ |
| "Everyone" campaigns | | ✓ | ✓ | ✓ | ✓ |
| Sub Club campaigns | | See them locked (upsell) | ✓ | ✓ | ✓ |
| Crew campaigns | | | | ✓ | ✓ |
| On the season leaderboard | | ✓ | ✓ | ✓ | |
| Builder: draft and edit | | | | ✓ | ✓ |
| Builder: publish, unpublish, end early | | | | | ✓ |

Until billing ships (workstream 11), Sub Club campaigns can be tested with a staging-only `sub` role.

## 3. Structure
**Season** (about 13 weeks, one at a time, gaps allowed) → **Chapters** (2 to 5, each unlocks on a date) → **Campaigns** (2 to 6 per chapter) → **Activities** (1 to 20 per campaign).

Each campaign has two labels instead of extra layers:
- **Cadence:** Daily (resets every day), Weekly (resets every Monday), Story (the season's themed path), Milestone (long counts), Event (a short window inside a chapter).
- **Audience:** Everyone, Sub Club, Crew.

Rules:
- Daily and Weekly campaigns end with their chapter. Story, Milestone and finished Event campaigns from earlier chapters stay open until the season ends, so late joiners can catch up.
- Activities only count actions after they open (no backfill).
- A campaign can give a completion bonus (XP and/or a badge) on top of its activities.
- The season badge goes to everyone who finishes the season's Story campaigns.

Clock: one site clock, **America/Chicago (Central)**, for Night Shift and the Arcade (daily reset 00:00, weekly Monday 00:00). The Arcade's weekly boards moved from Pacific to Central with Trophy Room part 1 (Oct 2026).

## 4. Activities and activity types
An activity is a rule over one **activity type**: "Do <type> <target> times (with these parameters)", for example "Rate 3 games in the Game Vault" or "Find 5 hidden medals".

Fields: title, instructions, link (where to go), type, target, parameters (a game, a collection, a page), XP, optional badge, repeat (none, daily, weekly).

**Activity type list** (`activityTypes`): each type has an event key, a name, a description, its parameters, the workstream that provides it, and an on/off switch. The builder only offers types that are on.

A type can cover several **actions**, passed as the `action` parameter: an activity that sets `action` (or any other parameter) only counts events with the same value; one that leaves it out counts them all. Seeded from `functions/data/fun-factory-ideas.json` by `functions/scripts/seed-factory-types.js`.

Available for v1:
| Type | Source |
|---|---|
| Daily check-in (streaks count too) | Night Shift |
| Visit pages (site tour) | Night Shift |
| Find hidden medals | Night Shift |
| Complete your profile, link accounts (`profile`: avatar, persona, link) | Accounts |
| Play / finish an Arcade game, beat your best, place on a board (`arcade`: play, finish, best, board; gameId) | Boom Arcade |
| Earn a badge (`badges`: any, by collection, by rarity) | Trophy Room |
| Game Vault (`vault`): **want** ("I want this too" turned on for a wishlist game; once per game per member, ever), **add** (a game you added gets into the Vault, directly or when a mod approves it; rejected adds never count), **cover** (a mod approves your cover suggestion) | Game Vault |
| Report a bug, bug confirmed; post an idea, vote on ideas | Bug Zapper, Feature Lab (after the port) |

Waiting (greyed out in the library, "Needs …"): rating games (`ratings`, needs Member ratings: members can't rate games yet), stream presence, stream check-ins and stream streaks, and live drops (Control Room), vote on the schedule and crew sign-ups (Schedule Planner), polls, comments and replies, shout-outs, favourites, clips, Discord.

## 5. How progress is counted
1. A feature's Cloud Function, in the same call that does the action, calls `recordFactoryEvent(uid, type, params, ref)`. Site-only actions use small callables: `factoryCheckIn`, `factoryVisit`, `factoryClaimMedal`.
2. The engine finds the live activities for that type and that member's audience, adds to their progress, and checks the target.
3. On completion it pays through the Trophy Room (`grantXp`, `grantBadge`) with the key `factory:<activityId>:<period>:<uid>`, so nothing pays twice. Season XP and lifetime XP go up together.
4. Every event has its own key (`<type>:<ref>`), so a retried call never counts twice.
5. Rate limits on every callable; optional per-season daily XP cap.

**Hidden medal hunts:** a hunt activity lists 3 to 10 medals, each placed on a page with an optional hint. Pages ask `factoryHuntMedals(path)` for the medals on that page only; claiming uses a one-time token. A determined cheater could still script it, so hunts give modest XP and rate limits keep it honest.

## 6. The idea library
A curated collection the builder offers at every stage, seeded from a file and editable by admins:
- **Season themes** (name, one-line pitch, mood tags, suggested art direction).
- **Chapter names**, with tags matching themes.
- **Campaign names** per cadence.
- **Activity ideas**: title, instructions, type, suggested target and XP, cadence, audience. Greyed out with "Needs …" until their type is on.
- **Reward ideas**: badge name and art concepts for season and campaign badges.

Starter set (compiled at the mockup stage from your examples and the best web engagement patterns): about 20 themes, 60 chapter names, 40 campaign names, 80 activity ideas, 30 reward ideas.
Builder tools: Inspire me (shuffle three), filter by tag, "used before" marker, add your own.

## 7. The builder (/shift/builder, mods and admins)
- **Season list:** every season with its status: Draft, In review, Scheduled, Live, Ended, Archived. Duplicate a past season as a starting point.
- **Stage tracker** (the "where am I" view), each stage with a completeness check:
  1. Theme: name, pitch, art.
  2. Chapters: 2 to 5, named, unlock dates cover the season.
  3. Campaigns: every chapter has at least one Daily or Weekly and one Story campaign.
  4. Activities: every campaign has at least one; all types are on.
  5. Rewards: XP totals look sane (the builder shows expected XP per member), season and campaign badges chosen.
  6. Schedule: a timeline of chapters and campaign windows, with no overlaps with another season.
  7. Review: a mod submits; an admin sees a checklist and a preview as Fan Club, Sub Club or Crew.
  8. Live: read-only targets (fairness); titles, instructions and new campaigns can still be added. Admins can end early.
- **Idea drawer** beside every stage: pick an idea to fill the field.
- **Preview** the season pass as a member at any date ("time travel" preview).
- Every publish, edit and end goes to adminLog.

## 8. Member pages
- `/shift`: the season pass. Season hero with art, a countdown to the next chapter, your season XP and rank. Chapter tabs (locked ones show a countdown, no spoilers). Today's dailies with the reset timer and your check-in streak, This week, the Story path, Milestones, Events. Sub Club and Crew campaigns marked. Off-season: countdown to the next season and the last season's results.
- `/shift/leaderboard`: season XP, filters All / Sub Club / Crew, your row pinned, top 100 + your rank.
- `/shift/how-it-works`: public guide, Arcade quality.
- `/shift/builder/guide`: the builder manual for mods and admins.
- The feature top bar pattern (a factory icon, FUN + accent FACTORY), members-only gate like the Arcade's.

## 9. Data model (sites/boomertanger/factory/main/…)
Firestore paths alternate collection and document, so everything hangs off one container doc, `sites/boomertanger/factory/main` (Oct 2026). The paths below are relative to it.
- `seasons/{seasonId}`: number, name, pitch, art, startsAt, endsAt, status, stage checks, dailyXpCap, createdBy, publishedBy.
- `seasons/{s}/chapters/{chapterId}`: order, name, blurb, art, unlockAt, revealed (set by the scheduler; public read only when revealed).
- `seasons/{s}/campaigns/{campaignId}`: chapterId, name, cadence, audience, opensAt, closesAt, order, bonus {xp, badgeId}, revealed.
- `seasons/{s}/activities/{activityId}`: campaignId, title, instructions, link, typeId, target, params, xp, badgeId, repeat, revealed.
- `seasons/{s}/hunts/{huntId}/medals/{medalId}`: path, position, hint. Tokens server-only.
- `seasons/{s}/progress/{uid}`: per-activity count, period, completedAt; the day's factory XP (for the cap); completed campaigns. Readable by its member only.
- `streaks/{uid}`: the daily check-in streak (current, best, lastDay, savers, saversCap); never resets with the season. Readable by its member only.
- `seasons/{s}/standings/{uid}` and `seasons/{s}/boards/{all|sub|crew|staff}`: season XP; boards pre-built top 100 (as the Arcade does). Public read. Admins race too (section 13c); `staff` exists only when the season's `staffRace` is "separate".
- `activityTypes/{typeId}`, `ideas/{ideaId}` (kind, text, tags, typeId, suggested values, uses, addedBy). Ideas readable by crew only.
- Events: `events/{type:ref:uid}` (type, uid, params, at), TTL 120 days (`expireAt`), server only.
- Drafts live in the same docs with status Draft; rules hide anything not revealed from members, and all writes go through callables.

## 10. Functions
- Library: `recordFactoryEvent`, progress engine, pay-out through Trophy Room.
- Member callables: `factoryCheckIn`, `factoryVisit`, `factoryHuntMedals`, `factoryClaimMedal`.
- Builder callables: `factorySave` (edit any draft node), `factorySubmit`, `factoryPublish` / `factoryUnpublish` / `factoryEnd` (admin), `factoryDuplicate`, `factoryIdeaSave`, `factoryTypeToggle` (admin).
- Scheduled: every 5 minutes reveal chapters, campaigns and activities whose time has come; roll boards; at season end, award trophies (top 3, top 10 plaque), season badges, and archive.

## 11. Edge cases
- A member's plan lapses mid-campaign: progress is kept; Sub Club activities stop counting until they resubscribe.
- An activity is removed after going live: it's switched off, not deleted; completions and XP stay.
- A season that never got published by its start date stays Scheduled-late and shows the off-season page; the builder flags it.
- Two seasons can't overlap; the scheduler refuses.
- Daylight saving: resets follow the Central clock.
- Mods can draft a campaign that only crew can see, but can't publish.

## 12. Kit pieces (new or promoted)
Stage tracker / stepper, countdown chip, locked card, campaign card with progress, season timeline (lanes), check-in streak, factory wordmark and icon; reuses `.bt-medal`, `.bt-board`, `.bt-meter`, `.bt-page-tabs`, the members-only gate and the Arcade's flip card, placard and BOOMBOT chat.

## 13. Build order
1. Trophy Room core (rewards phase 1) first.
2. Night Shift data, engine, activity types available now.
3. Builder and idea library.
4. Member pages and leaderboard.
5. How it works and the builder guide.
Each later feature adds its events through its spec's "Night Shift and Trophy Room hooks" section; ROADMAP.md gets a "Night Shift hooks" checklist.

## 13a. Daily check-in and streaks
- **Punch the clock:** a Clock in button on `/shift` (and in the header menu) once per Central day. It counts for check-in activities and the streak.
- **Streak savers:** every 7 days in a row earns one saver (hold up to 2; Sub Club up to 3). A missed day uses a saver automatically instead of breaking the streak.
- **The streak never resets with the season**; your best streak is kept on your profile.
- **Streak ladder** (Trophy Room badges, Loyalty collection, rarity rises with length):

| Days | Badge | Rarity |
|---|---|---|
| 3 | Fresh Blood | Common |
| 7 | Week of Dread | Common |
| 14 | Fortnight Fiend | Uncommon |
| 21 | Creature of Habit | Uncommon |
| 30 | Blood Moon | Rare |
| 45 | Restless Spirit | Rare |
| 60 | Unholy Devotion | Rare |
| 75 | Can't Stay Dead | Epic |
| 100 | Centurion of the Crypt | Epic |
| 150 | Undying | Epic |
| 200 | Eternal Vigil | Legendary |
| 365 | The Year of Fear | Legendary |

## 13b. Stream check-ins and stream streaks (needs the Control Room, workstream 5)
> **Amended Oct 8, 2026 (`control-room.md` §4, §6, §12).** The rolling 15-minute code is replaced by **beat check-ins with a spoken word**: the stream has four beats (Start, Break 1, Break 2, End); each window opens when the owner presses Open check-in, shows one word on stream, and members type it on /live and pick their room. **Presence keeps Twitch chat and drops** (linked Twitch accounts seen in chat) and clocked-in mods are present automatically (no check-in XP); the "Check in" button and the code in the first bullet below are superseded. The daily button is renamed **"Punch the clock"** (spec text only; nothing is renamed in code yet).
- **Presence counts three ways:** (1) a linked Twitch account seen in chat for at least 15 minutes of the stream; (2) the site's **Check in** button, shown only while live, with a short code shown on stream or said out loud that changes about every 15 minutes (works for YouTube and TikTok viewers); (3) claiming a live drop.
- **Stream streak:** streams in a row you were at. Only scheduled streams (from the Schedule Planner) can break it; unscheduled streams extend it if you're there and cost nothing if you miss them.
- **Stream savers:** one per 5 streams in a row, hold up to 2; a missed scheduled stream uses one automatically.
- Separate from the Loyalty ladder (total streams); both run side by side. Never resets with the season; best stream streak kept on the profile.
- New activity types once live: "Check in to a stream", "Reach a stream streak of N".
- Data: `streams/{streamId}/presence/{uid}` (method, firstSeen, minutes), code rotation server-only; callable `streamCheckIn(code)` with rate limits.
- **Stream streak ladder** (Trophy Room badges, Loyalty collection):

| Streams in a row | Badge | Rarity |
|---|---|---|
| 3 | Opening Night | Common |
| 5 | Front Row | Common |
| 10 | Season Ticket | Uncommon |
| 15 | The Usual Suspect | Uncommon |
| 20 | Never Missed a Scream | Rare |
| 25 | Ride or Die | Rare |
| 35 | Bound to the Stream | Rare |
| 50 | Possessed | Epic |
| 75 | The Unblinking | Epic |
| 100 | Witness to Everything | Legendary |

## 13c. Staff and the season race
Decided Oct 6, 2026 (Glenn). This replaces the earlier rule that admins never race (rewards.md sections 6, 7 and 14, and
the engine's "admins are never in standings"). The internal name is still factory.

1. **Admins race.** Admins (and the owner) are written to `standings` and appear on the **all** board with a
   **Staff** tag (`roleTag: "admin"`) and their real rank. Mods are unchanged: on the boards and prize-eligible.
   Admins never appear on the **sub** board; they do appear on the **crew** board (mods and admins).
2. **Prizes go to members.** At season end the top-3 season trophies and the places 4-10 plaques go to the top
   **non-admin** finishers, in order: admins are skipped when assigning places, so a member's trophy label uses
   their member place ("2nd · Season 01", not their board rank).
3. **Staff Finish trophy.** An admin who finishes in the top 10 of the all board gets `grantTrophy` kind
   **`staff-season`** with their real place and the board size in the label ("Season 01 · Staff finish · #4 of
   612"). It renders like the season trophies (rank colours) plus a green **Staff** ribbon (the admin tokens).
   **No XP.**
4. **Beat the Boss.** A new Trophy Room badge, id `beat-the-boss`, collection `arcade` (Arcade and Contests),
   rarity 3 (Rare), 50 XP, source `factory`, emoji 👑 (placeholder), how: "Finish a season with more season XP than
   Boomertanger." At season end, **if the owner's seasonXp is at least 500**, it is granted to every non-admin
   whose seasonXp is greater than the owner's. It is earned once (`grantBadge` is idempotent); the public profile
   also keeps `beatTheBoss: n`, incremented once per season (a per-season marker in `seasons/{s}/boss/{uid}` keeps a
   rerun from counting twice). The profile page shows "Beat the Boss ×n" and the badge card shows it when n > 1.
5. **Boss marker.** While the owner has standings this season, the season pass side card and the leaderboard show
   the owner's rank and the gap for the signed-in member ("Boss is #12 · you're 340 XP behind", or "You're ahead of
   the Boss"). The rollup writes it onto the board docs (`boss: { uid, handle, displayName, seasonXp, rank }`), so
   there is no extra query per row.
6. **Season setting `staffRace`: `"together"` (default) or `"separate"`.** "separate" keeps admins off the all, sub
   and crew boards and gives them a **staff** board (`boards/staff`) instead; their Staff Finish is then their place
   on the staff board. The switch is in the builder's Rewards stage (admins only) with a one-line explanation. The
   default stays "together".
7. **Giveaways are unchanged:** admins never win member giveaways.

Data: `standings/{uid}` gains `roleTag` ("admin" or null; an admin's `tier` is "crew"); board rows carry `roleTag`;
`boards/all` and `boards/crew` carry `boss`; `boards/staff` exists only under "separate"; `seasons/{s}.staffRace`;
`profiles/{uid}.beatTheBoss`. Rank for a member past the top 100 is still "members with more XP, plus one", so under
"together" it includes admins (their real rank).

## 13d. Mods' changes to a live season
Decided Oct 6, 2026 (Glenn, option A).

1. **Titles and instructions stay immediate.** On a live season a mod can still edit titles and instructions at once (logged to adminLog, as today). Everything else about live nodes stays locked (section 7, stage 8).
2. **A mod's additions wait for an admin.** A campaign or event a **mod** adds to a live season, and every activity in it, is saved with `approval: "pending"` (plus `addedBy: { uid, name }`). A pending node is **never revealed**: factoryTick skips it even after its unlock time, the public summary and its hunt paths ignore it, factoryPreview leaves it out of the member view, the engine (recordFactoryEvent) counts nothing for it, and the rules hide it. A campaign or event an **admin** adds goes live directly (`approval: "approved"`).
3. **Admin callables.** `factoryApproveAddition({ seasonId, campaignId })` sets the campaign and its activities to `"approved"`; it then reveals on schedule like any campaign (if its unlock time has passed, on the next tick). `factorySendBackAddition({ seasonId, campaignId, note })` returns it to the mod as `"changes"` ("changes requested") with the note; it stays hidden. Both are logged to adminLog.
4. **Mods keep editing their own.** A mod can edit and delete their own pending or sent-back addition (not another mod's). A mod's edit to a sent-back addition sets it back to `"pending"`.
5. **Where it shows.** The builder's Live stage lists pending additions with an "Awaiting approval" badge; admins get Approve and Send back (with a note), mods see the note on a sent-back one. The season list shows a count of pending additions per live season. The season pass's crew strip (below) tells admins "N additions to approve" and the mod who added one "Your event is waiting for approval".
6. Data: `approval` ("pending" | "changes" | "approved"; absent = approved, for everything built before a season goes live), `addedBy`, `reviewNote`, `approvedBy` on campaigns, and `approval`/`addedBy` on their activities. factoryListSeasons also returns the pending additions of live seasons (so the crew strip needs no extra read).

## 13e. Crew entry points to the builder
Display-only (the callables enforce roles). `.bt-when-staff` shows for mods and admins, like `.bt-when-admin` does for admins.
- **Nav on member pages** (/shift, /shift/leaderboard, /shift/how-it-works): a **Builder** link to /shift/builder for staff only, in the staff green with a small Crew tag; on phones an extra icon in the icon seg nav, staff only.
- **Season pass crew strip** (staff only, at the top of /shift): "You're crew · Open the builder · Idea library"; when relevant "Season N is waiting for review" (a Review link for admins, "with an admin" for mods) and "2 additions to approve" (admins) or "Your event is waiting for approval" (the mod who added it). Read through factoryListSeasons after sign-in, cached 5 minutes.
- **Account menu:** "🛠 Night Shift builder" (/shift/builder) for staff, beside Admin tools, in the same green.
- **Builder bar:** a "Member view" link to /shift.

## 14. Decisions (Oct 3, 2026)
1. Site clock: Central (America/Chicago) for Night Shift and the Arcade.
2. Only admins publish, including Event campaigns; mods draft and submit.
3. Check-in streaks earn badges on the 12-step ladder above, with streak savers.
4. Stream streaks added (section 13b), live once the Control Room ships.
5. Builder stage tracker: option A, Assembly line (eight machines on a conveyor, each a button). The plan map (option C) lives inside the Review stage.
