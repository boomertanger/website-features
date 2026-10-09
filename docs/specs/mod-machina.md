# Mod Machina spec: crew roles, ladders, stream duty, recruiting and Chat Games

Oct 6, 2026 · Glenn Bowering · **Confirmed** (all section 18 recommendations accepted Oct 6)
Mockups batch 1 (approved Oct 6: grade chip option 1 Bars, crew board B2 podium + table; Meet the crew, Join, Queue screens approved): https://claude.ai/artifact/DDvFMBcTeytbcYqG4VvVSX
Mockups batch 2 round 2 (approved Oct 6: How it works, Crew Academy and module pages on the Arcade How it works frame; Crew HQ activity meter M2, the time card): https://claude.ai/artifact/Y4gPMTTRDFQxKM55omBwye
Mockups batch 3 (approved Oct 6: seats S1 seat map, Mod Deck D1 chat wall with D2 focus as an in-Deck toggle, Dead Air C1 evidence board; Chat Games pool and /live Play panel approved): https://claude.ai/artifact/219k2BT2pjFuFyW4V9pGp1
Story-page round (approved Oct 7: Join the crew and Meet the crew rebuilt as story pages on the How it works frame; the site-wide two-kind page standard, story pages and tool pages, is now in CLAUDE.md rule 10 and design-system.md §8m): https://claude.ai/artifact/FxmQd6qveeiKSnmjo5fvMz (repo copy: `docs/design/mockups/crew-story-pages.html`)
ROADMAP workstream 9. Builds on the Trophy Room (`rewards.md`) and Night Shift (`fun-factory.md`). Parts depend on the Schedule Planner (ws 4) and the Control Room (ws 5); section 15 phases it so the first part can start without them.

## 1. Purpose
Turn a handful of volunteer mods into a crew that grows the channel every stream:
1. Clear roles and a ladder worth climbing (mods and admins).
2. A fair way to see who's helping most (Gears and the crew board), and to thank them (monthly awards).
3. Every chat covered on stream, with **YouTube** as the first gap to close (two chats: landscape and vertical).
4. Mods as recruiters, with credit for the members they bring in.
5. Chat Games that give viewers a reason to talk in every chat: members play, mods run them.
6. One path from "I want to help" to trained crew: queue → training → duty → promotion.

Design rules: volunteers first (life comes first, no guilt for stepping away); reward helping, never punishing (timeouts and bans earn nothing); everything verifiable is counted automatically, everything else is confirmed by someone else; the owner approves every new mod.

## 2. Words used in this spec
| Term | Meaning |
|---|---|
| **Crew** | Mods and admins together (already used by Trophy Room and Night Shift). |
| **Grade** | Where you are on your ladder (section 3). Lasts until changed. |
| **Duty** | Being on the crew for one stream, in one stream role (section 6). |
| **Room** | One live chat: Twitch, YouTube Landscape, YouTube Vertical, TikTok. A stream has 1 to 4 rooms. |
| **Gears** | Crew-only points for helping. Drive the crew board (section 4). Separate from member XP. |
| **Mod Deck** | The crew's live panel inside the Control Room (section 8). |

## 3. Roles and ladders
### 3a. Mod ladder (draft names, tunable)
| Grade | Who | Can do | To move up (all of these, then owner confirms) |
|---|---|---|---|
| **M1 Initiate** | Just approved, in training | Deckhand duty; mod on their own rooms; Academy | Core Academy modules 1-6 · 2 ride-alongs signed off by a Room Lead · 30 days · showed up for 80% of duties |
| **M2 Watcher** | Full mod | + Room Lead duty, task board, vouch in the queue, award badges up to Uncommon | 90 days as Watcher · 15 duties, 5 as Room Lead · Safety module · no active strikes |
| **M3 Warden** | Senior mod | + Stream Captain, award up to Rare, live drops while Captain, mentor an Initiate, draft Night Shift | 6 months as Warden · 40 duties, 10 as Captain · mentored 2 Initiates to Watcher · owner invite |
| **M4 Sentinel** | Top of the mod ladder | + confirm crew rosters, shortlist the queue, post tasks | Eligible to be invited to the admin ladder |

### 3b. Admin ladder (invitation only)
Admins are Sentinels the owner trusts with the site, not just the stream. Nobody applies to be an admin.
| Grade | Can do | How you get here |
|---|---|---|
| **A1 Steward** (90-day trial) | Admin tools with a safety net: anything that deletes or removes needs owner or A3 confirmation; Bug Zapper / Feature Lab triage; Night Shift publish; schedule crew | Owner invite + Admin Academy |
| **A2 Overseer** | Full admin tools (as foundation.md), crew management, strikes, approve tasks, publish | Finish the trial with the owner's OK |
| **A3 Right Hand** | + confirm mod promotions up to Warden (owner notified), run the crew in the owner's absence | Owner invite |

**The owner** stays the only one who approves new mods, makes Sentinels, and invites or removes admins. (This narrows foundation.md, where admins could grant mods.)

### 3c. Status, not just grade
- **Active**: met the monthly minimum (section 3f). Full perks.
- **Check-in**: missed one month. Perks stay; reminders and a friendly owner message.
- **Going dark**: a planned break set in advance (up to 2 months a year). No warnings; perks continue the first month, pause after.
- **Reserve**: missed two months in a row (or a Going dark break past its first month). Keeps grade, badges and Hall of Fame; loses perks (section 3f). Back after 90+ days → one short refresher quiz.
- **Alumni**: 6 months on Reserve, or retired by choice in good standing. Platform mod powers removed. Keeps the Crew badges and Hall of Fame entries. Can come back through a short fast-track (no queue).
- **Paused**: by the owner or an A2+ after a conduct issue.

### 3d. Strikes (private)
Logged by A2+ or the owner with a reason. 1 = a note and a chat; 2 = no Captain or Room Lead duty for 30 days; 3 = owner review. Strikes expire after 6 months. Only the mod, admins and the owner see them.

### 3e. Badges for the ladder (Crew collection, crew-only)
One badge per grade (Initiate Common, Watcher Uncommon, Warden Rare, Sentinel Epic; Steward, Overseer, Right Hand Epic), a service-length ladder (3, 6, 12, 24 months), a duties ladder (10, 25, 50, 100, 250), and the **YouTube Pioneer** ladder (section 7). Grades also show as a chip next to the name everywhere the crew appears.

### 3f. Activity and perks (approved Oct 6, 2026)
Crew perks belong to **Active** crew. The goal is steady stream sign-ups without guilt: small clear minimums, warnings before anything is lost, and a quick way back.

**Monthly minimum** (calendar month, Central):
| Grade | Duties a month |
|---|---|
| Initiate, Watcher | 2 (Initiate ride-alongs count) |
| Warden, Sentinel | 3, at least 1 as Room Lead or Stream Captain |
| Admins | 2, or 1 duty + admin work (queue decisions, Night Shift publishing, Bug Zapper / Feature Lab triage) |

- **A duty counts** when you're clocked in for at least 60 minutes, or the whole stream if it's shorter. Drop-ins count.
- **No-shows don't count.** 3 no-shows in 90 days without dropping the seat on the swap board → no Lead or Captain seats for 30 days.
- **Light months:** if fewer than 8 streams are scheduled that month, the minimum is 1 for everyone.
- The owner can excuse anyone for a month (logged).
- A YouTube duty counts as one duty (the 1.5× Gears boost is YouTube's reward; doubling the count would cut coverage).

**Falling short:**
1. Reminders on the 15th and 24th to anyone behind ("1 of 2 duties · 3 streams left with open seats").
2. One missed month → **Check-in**: perks stay.
3. Two missed months in a row → **Reserve**: free Sub Club ends at the end of the current period; off the active roster and crew board; no vouching, Lead/Captain seats or crew awards. Grade, badges and Hall of Fame stay.
4. Meet the minimum once → **Active** again the next day, perks restored. A drop-in is the easy way back.
5. 6 months on Reserve → **Alumni**: Twitch moderator removed by sync; YouTube and TikTok on the owner's checklist.

**Perks by status:**
| | Active | Check-in | Going dark | Reserve | Alumni |
|---|---|---|---|---|---|
| Free Sub Club (crew grant) | ✓ | ✓ | First month | — | — |
| Earliest merch, crew-only campaigns | ✓ | ✓ | First month | — | — |
| Lead / Captain seats, vouching, crew awards, crew board | ✓ | ✓ | — | — | — |
| Deckhand and drop-in duty | ✓ | ✓ | ✓ | ✓ (the way back) | Fast-track first |
| Grade, badges, Hall of Fame | ✓ | ✓ | ✓ | ✓ | ✓ |

**Rewards for doing more:**
- **On the Clock** monthly badge (Crew collection, Limited per month, Uncommon): 4+ duties that month. A collectible set.
- **Iron Shift** ladder: 3, 6, 12, 24 Active months in a row (Uncommon → Legendary).
- **Early sign-up:** +3 Gears for taking a seat within 48 h of the week being published.
- **First pick:** crew Active 3 months in a row with 90%+ reliability get seats 24 h before everyone else.

**On the site:** a month meter on /crew/hq ("2 of 3 duties · Oct", streams left with open seats); status chip on HQ and /admin/crew; the owner's /admin/crew lists who's behind, on Check-in and due for Reserve, with Excuse buttons. Free Sub Club is a server-written entitlement (`crewComp`) that follows status, so nobody is charged; until billing ships it's a flag only.

## 4. Gears and the crew board
Gears count help. They are crew-only, separate from Trophy Room XP (mods still earn XP and race on the member season board, as decided Oct 3).

### 4a. What earns Gears (starting values, tunable in /admin/crew)
| Source | Gears | How it's verified |
|---|---|---|
| Duty: Stream Captain | 12 / hour | Clock-in in the Mod Deck + presence (Twitch chatters; others by Captain check) |
| Duty: Room Lead | 10 / hour | same |
| Duty: Deckhand | 6 / hour | same |
| Room boost ("Help wanted") | × 1.5 on YouTube rooms by default | Owner sets per room; shows on the schedule |
| Showed up for a scheduled duty | + 5 | Clocked in within 15 min of the start |
| Took over as lead mid-stream | + 5 | The handoff (section 6d) |
| Hosted a Chat Game in your room | + 5 per game | Cues sent from the Mod Deck |
| Task board task | 5 to 50, set on the task | Confirmed by someone other than you (A2+ or the poster) |
| Recruit activated (section 9) | + 10 | Server |
| Recruit's first stream check-in | + 5 | Server |
| Queue review (vouch or note) | + 2, max 10 a month | Server |
| Academy module passed | + 5 once | Server |
| Bug Zapper triage confirmed / Feature Lab review | + 3 | Server (after the ports) |

Not counted: timeouts, bans, deleted messages (tracked for safety stats only), raw message counts (would reward spam).
Caps: duty Gears stop at 6 hours a stream; recruits credited up to 10 a month.

### 4b. Boards
- `/crew/board`: **This month** (default), **This season** (matches Night Shift), **All time**. Columns: Gears, duties, hours, rooms covered (platform icons), recruits.
- Your own row pinned; tap a mod to see their breakdown.
- Visible to all members (you want people to see who helps), so it doubles as recruiting.
- Admins appear with a green Staff tag and their real place, but never win crew awards (same rule as the season race).

## 5. Recognition
| Award | When | How chosen | Prize |
|---|---|---|---|
| **Top Gear** | Monthly | Most Gears that month (automatic; ties → more duty hours) | Trophy (150 XP) · on-stream shout-out · **Mod's Pick**: chooses a game from the Game Vault shortlist for one stream next month |
| **Fan Favourite** | Monthly | Member vote, last 5 days of the month | Trophy (150 XP) · on-stream shout-out · featured on /crew for the month |
| **Boomer's Blessing** | Any time | Owner only (existing Legendary badge) | Badge + personal thank-you |
| **Crew of the Year** | December | Owner picks from the 12 monthly winners | Legendary trophy + physical merch |

Fan Favourite vote: ballot = mods with at least 2 duties that month; voters = members with accounts at least 14 days old and at least one stream check-in that month; one vote each; results hidden until the vote closes; crew can't vote. Replaces the owner-picked "Mod MVP" in rewards.md (the owner keeps Boomer's Blessing for that).

Also: Hall of Fame wall on /crew (every past winner), a monthly "Crew report" card on stream (top 3 Gears, hours covered, new members recruited), and the existing crew perks (free Sub Club, earliest merch).

## 6. Stream duty
Replaces the crew section of ROADMAP workstream 4 (stream lead → Stream Captain, platform lead → Room Lead, helper → Deckhand; YouTube becomes two rooms).

### 6a. Roles per stream
| Role | How many | Grade | Expectation (realistic for volunteers) |
|---|---|---|---|
| **Stream Captain** | 1 | Warden+ (Watcher with owner OK early on) | Around for most of the stream. Watches every room's coverage in the Mod Deck, fills gaps, drops badges, the owner's one point of contact, handles anything serious. Hands off if leaving. |
| **Room Lead** | 1 per room | Watcher+ | Owns one room: welcomes, house rules, posts the check-in code and game cues, moderates. Can step away; hands off for longer breaks. |
| **Deckhand** | 0 to 2 per room | Initiate+ | Lighter: welcomes, answers questions, backs up the lead, can take over. Come and go freely. |

Small crew rules (the normal case today):
- The Captain can also be a Room Lead.
- **One YouTube Lead may cover both YouTube rooms** (the Mod Deck shows both chats side by side) until traffic justifies splitting them.
- The owner sets which rooms a stream has and the minimum crew. Default minimum: a Captain and a YouTube Lead.

### 6b. Signing up (in the Schedule Planner)
- Each stream card shows open seats: "Captain ✓ · Twitch ✓ · YouTube needed ×1.5 · TikTok —".
- Mods sign up for a seat their grade allows. Captain or owner confirms. Reminders 24 h and 1 h before.
- **Swap board**: drop a seat with 24 h notice and it's offered to others; no reliability hit. Later than that, it still costs nothing if someone picks it up.
- Reliability = showed ÷ kept seats over the last 90 days. Shown only to you, admins and the owner. Used for promotion checks, never shown publicly.

### 6c. Drop-ins
Any Active mod can open the Mod Deck during a live stream, see open seats and **Clock in** as a Deckhand (or as Lead if the room has none and their grade allows). Same Gears rate, no "showed up" bonus.

### 6d. The handoff ("pass the lantern")
1. The lead taps **Step away**: 5 min · 15 min · 30 min · I'm done for tonight.
2. Deckhands in that room get a prompt: "Take the lead?" First to accept becomes acting lead. Short breaks hand back automatically on return.
3. No one in the room → the Captain is pinged. Captain stepping away → the highest-grade lead on duty gets Captain.
4. Gears follow the minutes each person held the role.
5. If a lead goes quiet (no Twitch activity / no Deck activity for 20 minutes), the Captain gets a gentle nudge, never the mod. No penalties.

## 7. Platform preferences and the YouTube gap
- **Crew profile**: each platform as Favourite · Happy to help · Only if needed · No. Plus linked, verified accounts (Twitch, YouTube, TikTok when live), usual availability (days and time windows, Central), and device ("Can mod from phone" matters for YouTube Vertical).
- **Coverage map** (/admin/crew): per room, how many mods are willing, how many Leads, and the % of last month's streams that were covered. YouTube will show red-flag gaps at first; that's the point.
- **Levers to fill YouTube**, all built into the system:
  1. ×1.5 Gears boost on YouTube rooms (owner can raise it).
  2. Queue applicants who mark YouTube as Favourite or Happy are sorted higher (section 10) and the join page shows "Most needed: YouTube".
  3. **YouTube Pioneer** badge ladder: lead your 1st, 5th, 15th, 30th YouTube room (Uncommon → Epic). The first 5 crew to hit 5 also get a Limited "Founding YouTube Crew" badge.
  4. Chat Games always drop at least one clue or call in a YouTube room (section 11).
  5. Auto-moderator setup: when a YouTube stream starts, the YouTube Leads on duty are added as moderators of that broadcast's chat (YouTube API, verify during build; fallback: a checklist in the Deck).

## 8. Mod Deck (in the Control Room, /live/deck)
For crew while a stream is live; the owner sees it too.
- **Rooms strip**: each room's lead and deckhands, a coverage chip (covered / needed / not streaming), viewer count where the platform gives it.
- **Clock in / Step away / Take the lead** buttons (section 6).
- **Chats**: Twitch and both YouTube chats embedded side by side (both platforms allow chat embeds; TikTok has none, so it links out).
- **Quick lines**: copy buttons for your room's link (Room Leads post a **room link**, not a per-room code; see control-room.md §4), your referral link, house rules, socials, today's schedule. One tap to copy, paste in any chat.
- **Game cues**: the next clue or call for your room, with a "Posted" button (section 11).
- **Captain tools**: Drop a badge (rewards.md 10a), reassign seats, mark an incident.
- **Flag to owner**: short note for something serious (raid, threat, personal info posted); shows on the owner's Control Room.
- Crew messages: use the existing crew Discord if there is one; otherwise a tiny "crew notes" strip that clears after 24 h (decision 8).
- **Amended Oct 8, 2026 (`control-room.md` §3, §4, §9, §17):** the **Captain's launch panel** (start the stream and the after-show, the launch tiles) joins the Mod Deck, and the Captain can **unlock a member who is locked out** of a beat check-in (`liveUnlock`).

## 9. Recruiting
**v1**
- **Referral link for every member**, not just mods: `boomertanger.com/join/@handle`. Stored on the new account at signup (first link wins, 30 days).
- A recruit counts as **activated** after 7 days with at least one real action (a stream check-in, 3 daily check-ins, or an Arcade game). Only activated recruits pay (10 Gears for crew; members get XP and a "Recruiter" badge ladder: 1, 5, 15, 50).
- Crew recruit counts show on the crew board; members' on their profile.
- **Recruit Rush** (optional per stream, owner turns it on): a goal bar on stream and on /live ("12 / 20 new members tonight"). Hitting it unlocks a community reward the owner sets (a forfeit, a hard-mode run, a live drop for everyone checked in). Collective, so it doesn't turn mods into spammers.
- Night Shift activity types: "Bring a friend" and "Your recruit checks in to a stream".
- Etiquette rule (Academy module 7): one link post per room per hour, never in DMs to strangers.

**Later: Houses** (clans). Wardens+ found a House; members join one; members' Night Shift XP adds to a seasonal House Cup. Strong pull, but it adds factions to manage and needs a bigger crowd. Revisit after two Night Shift seasons.

## 10. The crew queue (applying to be a mod)
- **/crew/join** (public): what the crew does, expectations, ladder, the Crew Code, "Most needed: YouTube", and Apply (members only).
- **Who can apply**: 18+ (decision 1), account at least 14 days old, at least one linked platform account, at least 3 stream check-ins (owner can waive), no active member warnings.
- **Application**: platform preferences, availability, phone or desktop, why you want to help, any mod experience, agree to the Crew Code.
- **The queue** (/crew/queue, Watcher+, admins, owner):
  - **Vouch**: Watchers and up can vouch for applicants; each mod holds up to **3 active vouches**, so a vouch means something. Vouches are visible to crew with the voucher's name.
  - **Concern**: a private note only admins and the owner see.
  - **Order**: vouches (weighted by grade: Watcher 1, Warden 2, Sentinel 3) + platform need (YouTube favourite +3) + stream attendance in the last 30 days. Tunable.
  - Applicants see their own band ("Top 5" · "In the queue"), never others.
- **Decision (owner only)**: Approve → M1 Initiate, welcome message, Academy unlocked, Twitch moderator added automatically (Helix API). Not now → a kind note; can reapply after 60 days. Applications expire after 90 days unless refreshed.
- The queue is generic (`role: mod | keeper`) so the Arcade's Keeper volunteers reuse it.

## 11. Chat Games (run by the crew, played by members, live in every chat)
> **Decided Oct 9, 2026: Chat Games are merged into live activities (workstream 5b).** One service and one engine, called "live activities" internally. Members see two names only: **Questions** (the queue) and **Chat Games** (every game: Hot Seat, Would You Rather, Predictions, Caption This, Dead Air, Scream Off, Scare Bingo, Body Count). A game can be crew-hosted (it needs Room Leads posting in chats, so the Mod Deck); that is a property of the game, not a separate system. Build order: Questions and Hot Seat, then the quick formats (Would You Rather, Predictions, Caption This), then the crew-hosted games once the Mod Deck exists. Spec: `docs/specs/live-activities.md` (to come). The game designs, crew votes, pledges and packs below stay valid and move into that spec when it is written; this section is the source until then.

Name decided Oct 6: **Chat Games** (not "Side Quests", which would blur with Night Shift campaigns). On stream they can carry a branded line ("Chat Games, tonight on the Kill Floor"); the site name stays Chat Games. Keeps the three kinds of game apart: Boom Arcade games (played on the site any time), Game Vault games (what Boomertanger streams), Chat Games (live, during a stream, with chat).

TikTok has no chat API and YouTube's is quota-limited, so Chat Games are **site-powered, chat-voiced**: the logic and scores live on the site, the talking happens in every chat, mods drive the moments from the Mod Deck, and results go on the stream overlay.

### 11a. Who plays
| | Can do |
|---|---|
| Visitors (no account) | Watch the game on /live, talk in any chat. Locking a guess or scoring needs a free account ("Join free to play"). |
| Members (Fan Club, Sub Club) | **The players.** Accuse, mark bingo cards, predict, check in for their room. Earn XP, badges and Night Shift progress. |
| Mods | **Host.** Post clues and cues in their room, call squares, hype their room. Earn Gears for hosting. Can play, never win prizes. |
| Captain / owner | Start, swap, skip and end games; pick the case shortlist. |

**Inside Job** (Dead Air mode): one crew member is secretly cast as the culprit and slips tells into chat; members accuse a mod.

### 11b. Where they live
- **Players:** a Play panel on `/live`, under the stream embed, phone-first. The site-wide live banner shows "Dead Air is running · join in" while a game is on.
- **Crew:** cues for your room in the Mod Deck (section 8).
- **Owner / Captain:** Start · Swap · Skip · End in the Control Room.
- **The pool:** `/crew/games` (crew only).
- **Results:** overlay at the end; a "Chat Games" line on the Stream Library entry (who solved it, winning room).

### 11c. The pool: formats and packs
- **Format** = the rules. Each has requirements (minimum stream length, how many rooms need a lead), a cooldown (Dead Air at most once a week, so it stays special), and whether it needs a pack.
- **Pack** = content for a format: one Dead Air case ("The Lighthouse Keeper"), one bingo set ("Asylum tropes"). A pack can be tagged to Game Vault games, so the Outlast bingo set is suggested when Outlast is scheduled. Played packs are marked used.
- Wardens+ write packs; admins approve (same draft → approve pattern as the Night Shift builder). Starter set: about 20 Dead Air cases and 10 bingo sets.
- Formats with no pack (Scream Off, Body Count) are always available.

### 11d. Crew votes
- Each mod (Watcher+) gets **3 votes a week** to push packs up the pool.
- **"I'll host this"** counts as a heavier vote (3×): it's a vote plus a commitment, so the pool rises on what the crew will actually run.
- Pool order = votes + host pledges + post-game ratings (11g) − recently played. Tunable.

### 11e. Picking during scheduling (Schedule Planner)
- Each stream card gets a **Chat Games** slot (0 to 2 games).
- The Planner suggests the top packs that **fit**: stream length, rooms with a lead signed up, the Vault game, cooldowns and recent plays.
- Warnings, not blocks: "Dead Air needs 3 room leads, 2 signed up."
- The owner or that stream's Captain confirms. Published weeks show it on `/schedule` ("Tonight: Dead Air, case #4"), which gives people a reason to show up.

### 11f. On the night
- **Planned games** wait in the Control Room. If the crew is thin, the Captain swaps to a lighter format or skips.
- **Quick games** (Scream Off, Body Count) need no planning: any Captain can start one mid-stream when chat goes quiet.
- **Members pick the case**: for pack games, the crew shortlists 3 packs and members vote in the first 10 minutes. The vote itself gets chat moving early.
- Anyone can join a game in progress; mods can pick up a room's cues by clocking in.

### 11g. Afterwards
Crew rate the game (thumbs + optional note); turnout per room is recorded automatically. Both feed back into pool order.

### 11h. Starting formats
> **Amended Oct 8, 2026 (control-room.md §4, §17):** there are no per-room codes. Room Leads post a **room link** that opens the site's check-in with the room already chosen, and **Scream Off scores rooms by the member's self-reported room** (the room picked when they check in to a beat).
1. **Dead Air** (flagship murder mystery, one case per stream). 5 suspects, a weapon, a place. Six clues drop through the stream, **each in a different room**, posted by that room's lead from a Deck cue (no lead → the Captain posts it, or it goes straight to the site). The Case Board shows "Clue 3 dropped in YouTube Vertical chat" and reveals the text there 10 minutes later, so the fastest way to keep up is to visit the other chats. Members lock one accusation any time; earlier correct guesses earn more XP; reveal on stream at the end; solvers get a badge. Inside Job mode as above.
2. **Scream Off** (rooms compete). Each room has its own check-in code posted by its lead, so check-ins and plays count per room. Scored per viewer, so a small YouTube chat can beat a big Twitch one. The winning room picks something (the next game from a shortlist, a forfeit). Also shows where viewers watch.
3. **Scare Bingo**. A 5×5 card of horror tropes. Any duty mod calls a square from the Deck; the Captain can undo. First bingo gets a live drop.
4. **Body Count**. Predict deaths, jump scares and screams before the 30-minute mark; mods tap the counters; closest wins.

v1 ships Dead Air and Scream Off (they move YouTube chat most); Bingo and Body Count follow.

### 11i. Hooks
- Night Shift events: `chat-game-played`, `case-solved`, `bingo`, `scream-off-won`; Crew missions ("Host 3 Chat Games this chapter"). A season can feature a format for a chapter.
- Trophy Room: solver and bingo badges (Stream Moments collection); Gears for hosting (section 4).

## 12. Pages
**Public**
- `/crew`: Meet the crew (roster with grade chips, Top Gear and Fan Favourite this month, Hall of Fame, "Most needed" banner, Join button).
- `/crew/how-it-works`: roles, ladders, Gears, awards, stream duty, games, in Arcade-quality style.
- `/crew/join`: requirements, what to expect, the Crew Code, apply.
- `/crew/vote`: Fan Favourite ballot (members, while open).
- `/crew/board`: the crew leaderboard.

**Crew only** (the "Crew Academy" and HQ)
- `/crew/hq`: my grade and progress to the next, upcoming duties, my Gears, task board, notices.
- `/crew/academy`: training hub (full module text: `claude/crew-academy.md`). Modules, each a short page + a 5-question quiz, passing earns Gears and unlocks grades:
  1. Welcome to the crew: values, the Crew Code, "life comes first".
  2. House rules and the escalation ladder: remind → warn → timeout → ban; what never to do.
  3. Platform guides: Twitch; YouTube landscape and vertical (how to mod both from one screen or a phone); TikTok.
  4. Stream duty: seats, clock in, step away, the handoff, the swap board.
  5. Engagement playbook: welcoming new chatters, conversation prompts, cross-chat nudges, quick lines.
  6. Tools: Mod Deck, task board, Gears, awarding badges.
  7. Recruiting: your link, etiquette, Recruit Rush.
  8. Hosting Chat Games: Dead Air, Scream Off, Bingo, Body Count; voting and pledging in the pool.
  9. Safety (required for Warden): personal info, minors in chat, harassment and raids, self-harm mentions, when and how to flag the owner.
  10. Captain's course (required for Captain duty): coverage, drops, incidents.
- `/crew/academy/admin`: Admin Academy (site tools, publishing, member reports, crew management, audit log, privacy duties).
- `/crew/queue`, `/crew/tasks`, `/crew/profile` (preferences, availability, Going dark).
- `/crew/games`: the Chat Games pool (formats, packs, votes, host pledges, pack editor for Wardens+).

**Members**: the Chat Games Play panel on `/live` (visitors see it with "Join free to play").
- `/live/deck`: the Mod Deck.

**Owner and admins**: `/admin/crew` (roster, coverage map, promotions ready, queue decisions, strikes, Gears settings, award runs).

Promotions are never automatic: when someone meets every criterion, a "Ready to promote" card appears on /admin/crew and the owner (or A3 for up to Warden) confirms with one tap.

## 13. Data model (sites/boomertanger/crew/main/…)
- `crew/main/roster/{uid}` (the roster; the settings doc is `crew/main` itself; amended Oct 6 to match the build): grade, track (mod | admin), status (active | checkIn | goingDark | reserve | alumni | paused), monthDuties, missedMonths, activeStreak, breakUntil, breakMonthsUsed (per year), excusedMonths, firstPick, crewComp, since, gradeSince, platforms {twitch, ytLandscape, ytVertical, tiktok: favourite | happy | ifNeeded | no}, availability, device, mentor, alumni flag. Crew read; public subset mirrored to `profiles/{uid}.crew` (grade, track and status only). Grade is 1-4 on the mod track and 1-3 on the admin track (claims: `crewGrade` 1-4 or "A1"-"A3", and `crewStatus`).
- `crew/main/roster/{uid}/private/record`: reliability, strikes, notes. Admins + owner + self (strikes visible to self).
- `applications/{appId}`: uid, role (mod | keeper), answers, status, score, expiresAt; `vouches/{voucherUid}`, `concerns/{uid}` (admin + owner only).
- `duties/{streamId}_{uid}`: streamId, room, role, scheduled, clockIns [{in, out, role}], handoffs, minutes, gears. Seats themselves live on the stream object.
- `gears/{key}`: append-only ledger like rewardLedger (key `${source}:${ref}:${uid}`, so nothing pays twice). `boards/{month|season|all}` pre-built.
- `tasks/{taskId}`: title, gears, postedBy, claimedBy, status open | claimed | done | confirmed, confirmedBy.
- `academy/{moduleId}` (content refs, quiz), `academyProgress/{uid}`.
- `awards/{yyyy-mm}`: topGear, fanFavourite, ballot, votes in `awards/{m}/votes/{uid}` (server-written).
- `referrals/{newUid}`: refUid, at, activatedAt.
- Chat Games (`sites/boomertanger/chatGames/main/…`): `formats/{formatId}` (rules, requirements, cooldown, on/off), `packs/{packId}` (formatId, content, vaultGameIds, status draft | approved | retired, usedOn[], rating), `votes/{week}_{uid}` (packIds, pledges), `runs/{runId}` (streamId, formatId, packId, state, room codes, clue schedule, results); `runs/{r}/plays/{uid}` (accusation, card, prediction, room). Pack content (answers) server-only until the reveal.
- Roles: grade and track are mirrored into custom claims (`roles.boomertanger: ["mod"]` stays; add `crewGrade`) so rules can check seats without reads.
- adminLog keys: `crewApprove`, `crewPromote`, `crewStrike`, `crewStatus`, `crewExcuse`, `gearsAdjust`, `taskConfirm`. activityLog: `crew-joined`, `crew-promoted`, `crew-award` (public, celebratory).

## 14. Functions (lib/crew/*.js)
Callables: `crewApply`, `crewVouch` / `crewUnvouch`, `crewConcern`, `crewDecide` (owner), `crewPromote` (owner; A3 up to Warden), `crewSetStatus` (Going dark), `crewExcuse` (owner), `crewStrike` (A2+), `crewSaveProfile`, `dutySignUp` / `dutyDrop` / `dutyConfirm`, `dutyClockIn` / `dutyStepAway` / `dutyTakeLead`, `taskPost` / `taskClaim` / `taskDone` / `taskConfirm`, `academySubmitQuiz`, `fanFavouriteVote`, Chat Games callables (`chatGameVote`, `chatGamePledge`, `chatGamePackSave` / `chatGamePackApprove`, `chatGamePlan` (Planner slot), `chatGameStart` / `Swap` / `End`, `chatGameCue`, `chatGameShortlistVote`, `caseAccuse`, `bingoCall`, `roomCheckIn`, `chatGameRate`).
Internal: `grantGears` (idempotent), `syncPlatformMods` (Twitch Helix add/remove moderator on approve/remove; YouTube per-broadcast on stream start).
Scheduled: nightly reliability and coverage stats; activity reminders (15th and 24th, 10:00 Central); monthly status run (1st, 00:10 Central: Check-in / Reserve / Alumni, crewComp on or off, On the Clock and Iron Shift badges, first-pick list); monthly award run (1st of month 00:05 Central); application expiry; board rebuilds.
Triggers: referral activation (on the first qualifying event), presence → duty minutes.

## 15. Phasing
1. **Crew core** (needs only accounts + Trophy Room core). Until stream duty exists (phase 3): the monthly activity rules stay off (site setting `crew.activityRules = false`, the time card says "Starts with stream duty"); the join requirement "3 stream check-ins" and the Fan Favourite voter rule "a stream check-in that month" use Night Shift daily check-ins instead (3 in the last 30 days / 1 that month), owner can waive. Includes: grades and status, crew profiles and platform preferences, the queue (/crew/join, vouch, owner decision), Academy with modules 1-7 and 9, task board + Gears + crew board, referral links, monthly awards, /crew and how-it-works pages, /admin/crew with coverage map (preferences only at first). Twitch moderator sync.
2. **With the Schedule Planner**: seats, sign-ups, swap board, reliability, reminders.
3. **With the Control Room: the Mod Deck (confirmed Oct 9, 2026, see section 17a)**: swap board, /live/deck, clock in, handoffs, duty Gears, activity rules on, Recruit Rush. YouTube moderator sync stays later (section 17a, out of scope).
4. **Chat Games: now live activities (workstream 5b, ROADMAP).** The pool and crew votes, Planner slot, Play panel; Dead Air + Scream Off, then Bingo + Body Count; module 8 and the Captain's course. Built in 5b in the order set in section 11 (Questions and Hot Seat, quick formats, then crew-hosted games after the Mod Deck from phase 3).
5. **Later**: Houses, a chat bot for !join / !code on Twitch and YouTube, Stream Deck buttons.

## 16. Kit pieces (new)
Grade chip (`.bt-grade`, mod and admin tracks), room chip (platform + covered / needed / off), seat card, task card, queue card (vouch count, concern), Academy module card with progress, quiz, Deck room tile, quick-line copy row, goal bar (Recruit Rush; may reuse `.bt-meter`). Colours: "needed" uses gold, never red (red is for destroying data); admin-only controls green.

## 16a. Stream object note
The confirmed stream object (`docs/specs/stream-object.md`) keeps crew per platform. Mod Machina needs YouTube as two chats: the Schedule Planner's crew field should be `crew: { captain, chats: { twitch, ytLandscape, ytVertical, tiktok: { lead, deckhands[] } }, caps }`. Raise this when workstream 4 starts.

## 17. Edge cases
- Mod removed or Alumni: Twitch moderator removed by sync; YouTube and TikTok on a checklist; Gears and badges stay.
- Account deleted: crew data deleted with it; past award entries show "former crew member".
- A mod vouches for a friend: fine; the owner sees who vouched and decides.
- Two mods accept the same handoff: first write wins, the other becomes Deckhand.
- Stream ends while someone is clocked in: everyone is clocked out at Stop.
- Unscheduled stream: no seats; drop-ins only; duty Gears still count.
- Admin also mods a room: counts duty and Gears, Staff tag, no crew awards.
- Night Shift: mods keep racing with members (Oct 3 decision); Gears never add to season XP.

## 17a. Phase 3: the Mod Deck (confirmed Oct 9, 2026)
Source: the Mod Deck spec, confirmed Oct 9, 2026 (Glenn Bowering); approved mockups `docs/design/mockups/mod-deck.html` (H1 helm strip, P1 lantern prompt, R1 Recruit Rush goal meter). Eight build parts, listed at the end of this section. This is phase 3 of section 15.

### Summary

Phase 3 turns Mod Machina's seats into real duty: crew open the Mod Deck at /live/deck, clock in to a room, pass the lantern when they step away, and earn duty Gears for the minutes they hold a role. Once this build passes on staging, the monthly activity rules switch on, with a grace first month. This is a phase 3 section of docs/specs/mod-machina.md, not a new service: code lives in functions/lib/crew and data under sites/boomertanger/crew/main/.

In this build (decided Oct 9, 2026):

- **Swap board** (part 1, before the activity rules turn on).
- **Duty loop:** Deck at /live/deck, Clock in, Step away, pass the lantern, duty Gears.
- **Duty minutes:** a Deck heartbeat while the Deck is open and checking in, plus the Captain's "Confirm tonight's crew" at Stop. Twitch chat presence adds to it once the broadcaster token is connected.
- **Captain:** an acting Captain when nobody is seated; the owner reassigns from /live/control; a seated Captain who clocks in takes over.
- **Captain tools:** the launch panel, unlock a locked-out member (liveUnlock), the TikTok viewer count (liveViewerEntry), reassign seats, and Flag to owner.
- **Flags:** a gold card at the top of the owner's controls, a soft chime and a flashing tab title; urgent flags also reach admins on duty.
- **Crew notes strip** on the Deck, cleared after 24 hours.
- **Activity rules on**, with a grace first month in which nobody can drop status.
- **Recruit Rush:** a goal bar on stream and on /live; the reward is text for now.

The Deck reuses the Control Room's look system (Hull and CRT) and its callables (liveUnlock, liveViewerEntry, the launch panel); nothing is copied.

### Choices (confirmed)

All choices confirmed Oct 9, 2026, as recommended in bold. Choices 3 and 4: Drop a badge waits for live drops, built shortly after this build. Everything else in this spec follows from the Oct 6 and Oct 9 decisions.

| # | Choice | Recommended | Alternative |
| --- | --- | --- | --- |
| 1 | When the activity rules turn on | **On the 1st of the first calendar month after phase 3 passes on staging and launches; that whole month is the grace month** | Turn on mid-month, with grace to the end of the next month |
| 2 | What the grace month does | **Everything runs (time card, reminders on the 15th and 24th, On the Clock badge), but the status run on the 1st moves nobody down and doesn't count a missed month. Moving up (back to Active) still works.** | Reminders off as well |
| 3 | Drop a badge needs the live drop system (rewards.md §10a), which isn't built yet | **Decided Oct 9: wait. Drop a badge joins the Deck when live drops are built** | Build live drops in this build |
| 4 | Who can drop | **Decided Oct 9: settle it with live drops (rewards.md §10a says the owner and the stream lead)** | Owner only |
| 5 | Deck heartbeat | **A ping every 60 s while the Deck is open, even in a background tab. A minute counts when a ping arrived in it; gaps up to 3 min are bridged. After 20 quiet minutes the Captain gets the gentle nudge (§6d); nobody is ever clocked out for being quiet.** | Count only while the Deck tab is visible |
| 6 | Confirm tonight's crew | **At Stop, the Captain (or the owner) sees everyone with their heartbeat minutes and can add minutes for someone who modded without the Deck open (never past the stream's length). Not confirmed within 24 h → heartbeat minutes stand. Duty Gears pay at confirm.** | Captain must confirm; nothing pays until then |
| 7 | Swap board timing | **A seat dropped 24 h+ before start goes on the board with no reliability hit. Later drops also go on the board and cost nothing if someone takes them; untaken late drops count as a no-show.** (spec §6b) | Late drops always count as a no-show |
| 8 | Recruit Rush counts | **New accounts created between Start and 30 min after Stop, whether or not they came through a referral link** (collective, per §9) | Only referral sign-ups |
| 9 | Urgent flag types | **Threat and Personal info are urgent (gold card + admins on duty); Raid, Harassment and Other go to the owner only** | Every flag reaches admins on duty |

### Part 1: the swap board

After a week is published, dropping a confirmed seat puts it on the swap board instead of simply releasing it, so a fair no-show rule can turn on later. Before publish, dutyDrop works as it does today.

**How it works**

1. A mod drops a confirmed seat (on /schedule or /crew/hq). The dialog says which kind of drop it is: "More than 24 hours' notice: no effect on your record" or "Less than 24 hours: no effect if someone takes it."
2. The seat appears on the board: a **Swap board** card on /crew/hq and an "Up for grabs" chip on that stream's card on /schedule. Crew whose grade allows the seat and whose platform preference for that room isn't "No" get a notice on HQ.
3. **Take it** (one tap, confirmAction). First write wins. The seat is confirmed straight away, because it was already confirmed; the Captain and owner see who took it.
4. At the stream's start, open swaps close. An untaken late drop counts as a no-show for the person who dropped it; an untaken early drop counts as nothing and the seat shows as open for drop-ins.

**Who can take a seat:** the same grade rules as sign-ups (§6a), Lead and Captain seats only for Active or Check-in crew, nobody locked out by the no-show rule, and nobody already holding a seat in that stream (the Captain may also take a Room Lead seat, per the small-crew rule).

**Reliability and no-shows** (counted from part 2, once clock-ins exist):

- **Showed:** clocked in at any point during the stream. Clocking in within 15 minutes of the start also earns the +5 "showed up" Gears.
- **No-show:** a confirmed seat (or an untaken late drop) with no clock-in at all.
- Reliability = showed ÷ kept seats over 90 days, recalculated nightly into `roster/{uid}/private/record`. Seats released by Delay or Cancel never count.
- 3 no-shows in 90 days: no Lead or Captain seats for 30 days. dutySignUp, the swap board and clock-in all refuse with a plain reason and the date it ends. The owner sees it on /admin/crew and can lift it (logged).

**States on the card:** open (gold "Up for grabs"), taken ("Taken by @handle"), closed. Empty board: the mascot and "Nothing up for grabs. Every seat has its crew."

### The duty loop

A duty is a stretch of time in one role in one room, counted by the Deck heartbeat. Everything is server-checked: the Deck only shows buttons, and the callables decide.

**Clock in.** Opening /live/deck while a stream is live shows your seat (if you have one) with a big **Clock in** button. Without a seat you see the open seats and can drop in as a Deckhand, or as Room Lead where the room has none and your grade allows (§6c). Clocking in starts the heartbeat. A seated Captain who clocks in takes over from an acting Captain at once.

**Heartbeat.** The Deck calls dutyPing every 60 s with the stream id (choice 5). The server keeps `minutes` on the duty and `lastPing`. Two Deck tabs count once. A ping after Stop is refused and the Deck shows the wrap-up.

**Step away** (pass the lantern, §6d). The options are 5 min, 15 min, 30 min and "I'm done for tonight".

1. A Room Lead steps away. Deckhands in that room get the gold prompt "Take the lead?" with a countdown. First to accept becomes acting lead (+5 Gears "took over"); a second accept becomes Deckhand with a short note.
2. Nobody in the room accepts within 2 minutes: the Captain is pinged and the room chip turns gold "needed".
3. Short breaks (5, 15, 30 min) hand back automatically when you return; the acting lead goes back to Deckhand. Overstaying the break by 10 minutes just ends it: you come back as a Deckhand.
4. "I'm done for tonight" clocks you out; the handoff runs as above.
5. The Captain stepping away passes Captain to the highest-grade Room Lead on duty, with the same prompt.

Gears follow the minutes each person held each role. While you're stepped away your minutes don't count.

**Quiet leads.** No ping for 20 minutes while holding a Lead or Captain role: the Captain (or the owner, if it's the Captain) gets a gentle nudge on the Deck. The mod is never told off and nothing is taken away.

**Stop.** Everyone is clocked out at Stop. The Captain gets **Confirm tonight's crew** (choice 6), then duty Gears pay.

### The Captain

Every live stream has one Captain at a time, stored as `crew.captainNow` on the stream's private control doc. The Captain's tools appear on the Deck; the owner has the same tools on /live/control.

**Who is Captain**

- **Seated Captain** clocks in: they're Captain, replacing any acting Captain at once (the acting one gets a thank-you toast and keeps their own role).
- **Nobody seated, or the seated Captain hasn't clocked in 15 minutes after the start:** the highest-grade crew member on duty (Watcher or above; earliest clock-in breaks ties) gets the prompt "Nobody's at the helm. Be acting Captain tonight?" Accept or Not tonight. Declining offers it to the next person; if everyone declines, the owner is Captain and the Deck says so.
- **Owner reassigns** from /live/control: a Captain picker listing crew on duty, Watcher and above.
- People with strike 2 or a no-show lockout are skipped.
- Captain Gears (12/h) are paid for the minutes someone actually held the Captain role, acting or seated.

**Captain tools** (all reuse what exists; nothing is copied)

| Tool | What it does | Built on |
| --- | --- | --- |
| Launch panel | The same panel and permissions control-room.md gives the Captain (§3, §4, §9); its activity tiles are a slot live activities fills | `.bt-launch` and its callables |
| Unlock a member | Lists members locked out of the current beat's check-in, with Unlock | liveUnlock |
| TikTok viewers | Type tonight's TikTok viewer count from the app | liveViewerEntry |
| Reassign seats | Move someone on duty to another room or role (within their grade), or free a seat whose holder left. Moving someone into Lead or Captain sends them an accept prompt. | new dutyReassign |
| Flag to owner | See the next section | new liveFlag |
| Confirm tonight's crew | At Stop: everyone's minutes by role, add minutes for someone who modded without the Deck, Confirm | new dutyConfirmNight |

Room Leads also see Unlock and TikTok viewers for their own room, since both callables already accept any crew on duty.

### Flag to owner

Any crew member on duty can flag; the flag lands as a gold card at the top of the owner's controls with a soft chime and a flashing tab title.

- **The form** (openModal): a type (Threat, Personal info, Raid, Harassment, Other), the room, and a short note (10 to 280 characters). The note may describe what happened but the form asks people not to paste the personal info itself.
- **The owner sees** the card on /live/control above everything else: type, room, who flagged, the note, how long ago. Buttons: **Got it** (the flagger sees "Seen by Boomer") and **Done** (closes it). Several flags stack, newest first.
- **Chime and tab title:** one soft chime per new flag (off under the browser's autoplay rules until the owner has interacted with the page; the card says "Tap to turn on sound"), and the tab title alternates "⚑ Flag · Control Room" until Got it. Reduced motion: no flashing title, the card still shows.
- **Urgent** (Threat, Personal info; choice 9): the same card also shows on the Deck of every admin on duty, and in their tab title.
- **Phone text later**, once Boom Alerts sending exists; the flag already writes a notifyOutbox entry with `kind: "crewFlag"` so nothing needs changing then.
- **Records:** `streams/{id}/flags/{flagId}` (staff read, function-written), adminLog `crewFlag`, deleted with the stream's private data at 13 months. Never in activityLog.
- **Limits:** 5 flags per person per stream, so a mistaken double tap or a panic doesn't bury the owner.

### Duty records and duty Gears

One duty record per person per stream, `crew/main/duties/{streamId}_{uid}`, written only by functions. Gears are paid once, at confirm, through grantGears with keyed ledger ids, so a retry never pays twice.

| Gears source | Amount | Ledger key |
| --- | --- | --- |
| Stream Captain | 12 / hour | `duty:{streamId}:{uid}:captain` |
| Room Lead | 10 / hour | `duty:{streamId}:{uid}:lead:{room}` |
| Deckhand | 6 / hour | `duty:{streamId}:{uid}:deckhand:{room}` |
| YouTube rooms | × the room's boost (1.5 by default, from the stream's `crew.caps`) | on the role line |
| Showed up for a scheduled seat | + 5 (clocked in within 15 min of start) | `showed:{streamId}:{uid}` |
| Took over as lead | + 5, at most 3 a stream | `takeover:{streamId}:{handoffId}:{uid}` |

- Paid by the minute: Gears = minutes ÷ 60 × rate × boost, rounded to the nearest whole Gear per line.
- **One rate at a time:** a Captain who is also a Room Lead is paid the higher rate for those minutes, not both.
- **6-hour cap** per person per stream, across all roles.
- **A duty counts** toward the monthly minimum at 60 confirmed minutes, or the whole stream minus 5 minutes if the stream ran under an hour. Role for the minimum ("at least 1 as Room Lead or Captain" for Warden and Sentinel) = held Lead or Captain for at least 30 of those minutes.
- **Badges on confirm:** the duties ladder (10, 25, 50, 100, 250) and YouTube Pioneer (1st, 5th, 15th, 30th YouTube room led for 30+ minutes), through the Trophy Room grant().
- Admins on duty earn Gears and duties with their Staff tag, as today; they never win crew awards.
- Timeouts, bans and message counts still earn nothing.

### Activity rules on

The owner flips `crew.activityRules` to true on /admin/crew with a confirmAction that names the grace month; the rules from §3f then run as written, with nobody moving down in the first month (choices 1 and 2).

- **Settings doc** `crew/main` gains `activityRules: true`, `rulesSince: "2026-11"` (example) and `graceMonth: "2026-11"`. Only the owner can change them (adminLog `crewRules`).
- **Time card on /crew/hq** stops saying "Starts with stream duty" and shows "2 of 3 duties · Nov" plus streams left with open seats. In the grace month it adds a small teal line: "Practice month: nothing changes status yet."
- **Monthly status run** (1st, 00:10 Central): skips moving anyone down for the grace month and doesn't increase `missedMonths`; it still moves people up, grants On the Clock and starts Iron Shift counting.
- **Light months** (fewer than 8 streams scheduled → minimum 1), **owner excuses** and **Going dark** work as in §3f.
- **Reminders** on the 15th and 24th at 10:00 Central go to anyone behind, as an HQ notice (and through notifyOutbox for when Boom Alerts sends).
- **Things that were waiting on duty** now count real duties: promotion criteria that needed duty (they stop showing "pending"), the Fan Favourite ballot's "at least 2 duties", the crew board's duties and hours columns, and the join rule "3 stream check-ins" (back to real stream check-ins, owner can still waive).
- **/admin/crew** gains the "Behind this month", "On Check-in" and "Due for Reserve" lists with Excuse buttons.

### Recruit Rush

The owner can turn on a Recruit Rush for any stream; a goal bar ("12 / 20 new members tonight") shows on /live and in the stream view, and hitting the goal reveals the reward text.

- **Turning it on:** a Recruit Rush card on /live/control (before or during the stream) with the goal (5 to 200) and the reward text (up to 80 characters, e.g. "Hard-mode run on Friday"). Saved on the stream as `recruitRush { on, goal, reward, count, hitAt }`; public/live carries only `{ goal, count, reward, hitAt }`. Changing the goal after it's hit is refused.
- **Counting** (choice 8): a trigger on new `users/{uid}` adds 1 while a Rush is on, between Start and 30 minutes after Stop. Counts go through the existing counter shards and liveFlush, so a busy night costs the same as check-ins.
- **On /live:** a `.bt-meter`-based goal bar (R1, gold) under the check-in with the count, the goal and "Bring someone: your link" (copy for members, Join free for visitors). At the goal: a short burst (none under reduced motion) and the reward text.
- **In the stream view:** a slim bar in Live stats and Break; at the goal, a one-time banner for 8 seconds.
- **On the Deck:** the bar plus the quick line "Your referral link" (one link post per room per hour, Academy module 7).
- **Referral credit** stays as in §9: crew get +10 Gears per activated recruit after 7 days, whether or not a Rush was on.
- **Later:** the reward becomes a live drop for everyone checked in, once live drops are built.

### The /live/deck page

A tool page in the Control Room's look system: the approved D1 chat wall, wearing the house look (`data-look` from `live/main.look`, Hull or CRT), with the Captain tools added. It joins the Watch group in site/src/lib/nav.js for crew only ("Mod Deck: your seat, the chats and the tools").

**Who sees it:** crew (any grade, any status except Paused and Alumni) and the owner. Members and visitors get a gate with the mascot: "This is where the crew works the stream" and a link to /crew/join. A client check only hides things; every callable re-checks claims.

**Desktop layout (D1)**

- **Hero header** with a small scene: the radar wordmark (MOD + accent DECK), the stream title, the live tag and beat, and your duty bar (role chip, room, minutes tonight, Clock in or Step away).
- **Rooms strip:** one `.bt-room-tile` per room in the stream: lead, deckhands, coverage chip (covered / gold needed / not streaming), viewers where the platform gives them, "Take the lead" where allowed.
- **Captain's helm strip (H1):** for the Captain only, one row under the rooms strip with Unlock (count of locked-out members), TikTok viewers (current count), Reassign and Launch panel; each opens its panel under the strip, one at a time. On phones the strip is in the Tools tab.
- **Chat wall:** Twitch, YouTube Landscape and YouTube Vertical side by side in `.bt-chat-feed` columns; TikTok is a link-out tile (no embed exists). A Focus toggle (D2) makes your chat big with one beside it.
- **Side rail:** quick lines (room link, referral link, house rules, socials, today's schedule), the Recruit Rush bar when on, and the crew notes strip.
- **Activity slots:** two empty places live activities fills later: the cue slot at the top of the rail (your room's next cue, with Posted) and the launch panel's activity tiles. This build ships them empty; an empty slot renders nothing. Live activities registers what goes in them, so the Deck never changes when a new activity ships.
- **Lantern prompt (P1):** handoff and acting-Captain prompts drop over the chat wall on desktop; on phones they sit in the dock above the duty bar.

**Phone layout:** three tabs, Chats · Crew · Tools, one chat at a time with a room switcher; the duty bar stays pinned at the bottom above the tab bar.

**States**

| State | What shows |
| --- | --- |
| Off air | The next stream and your seat, the swap board card, quick lines, crew notes; the mascot "Nobody's on air. Grab a seat for the next one." |
| Live, not clocked in | Your seat with a big Clock in, or the open seats for a drop-in |
| On duty | Duty bar ticking, Step away, your room highlighted |
| Stepped away | A gold strip with the countdown and I'm back |
| Handoff prompt | Gold "Take the lead?" card with a countdown, Accept / Not now |
| Acting Captain prompt | Same card, "Be acting Captain tonight?" |
| Flag sent | Toast, then "Seen by Boomer" when the owner taps Got it |
| Ended | Your night: minutes by role, Gears pending until confirmed; the Captain's Confirm tonight's crew |
| After-show | Site room only; drop-ins as Deckhand; no seats |

**Celebratory moments:** the Clock in stamp (`.bt-stamp`) with a short burst; the duty bar's first 60 minutes ticking over to "Duty counted"; confirm paying out with a count-up. All go still under reduced motion.

**Crew notes strip:** any crew member can post a note up to 200 characters; notes show newest first with handle and grade chip, and vanish 24 hours after posting. Authors delete their own; admins delete any.

### Data model

All paths under `sites/boomertanger/`. Every document below is written only by Cloud Functions; the Read column is what Firestore rules allow.

| Path | Fields | Read |
| --- | --- | --- |
| `crew/main/swaps/{streamId}_{seatKey}` | streamId, room, role, fromUid, fromHandle, droppedAt, startsAt, notice (early, late), status (open, taken, closed), takenBy, takenAt, countsAsNoShow, noRecord | crew |
| `crew/main/duties/{streamId}_{uid}` | streamId, uid, scheduled (seat or null), segments [{ role, room, in, out }], minutes by role, lastPing, stepAway { until, kind } or null, handoffs [], counted, gears, confirmedAt, confirmedBy, addedMinutes | self, admins, owner |
| `crew/main/notes/{noteId}` | uid, handle, grade, text, createdAt, expireAt (+24 h, TTL) | crew |
| `crew/main/roster/{uid}/private/record` | adds noShows [{ streamId, at }], lockUntil | self, admins, owner |
| `crew/main` (settings) | adds activityRules, rulesSince, graceMonth | crew |
| `streams/{id}/private/control` (existing) | adds crew.captainNow { uid, acting, since }, onDuty { uid: { role, room } }, prompts {}, recruitRush | staff |
| `streams/{id}/flags/{flagId}` | type, room, note, byUid, byHandle, urgent, createdAt, seenAt, doneAt, expireAt (13 months) | owner, admins |
| `public/live` (existing) | adds deck { rooms: { room: { lead handle, deckhands count, covered } } }, recruitRush { goal, count, reward, hitAt } | everyone |

- Handles and grades only in anything crew-wide or public; no uid ever in public/live (check-live-wiring already proves this and gets new cases).
- The live on-duty state is on the private control doc so the Deck reads one document; the duty record is the durable, payable copy.
- adminLog keys: `crewSwap`, `crewRules`, `crewLockLift`, `crewFlag`, `dutyConfirmNight`, `dutyReassign`, `captainSet`. activityLog: none new (duty is private).

### Functions and rules

New code goes in functions/lib/crew (duty, swap, notes, rules); the Control Room's callables are called, never copied.

| Function | Who | Does |
| --- | --- | --- |
| dutyDrop (changed) | crew (own), admins | after publish, opens a swap instead of releasing |
| dutySwapTake | Active or Check-in crew | first write wins in a transaction; seat confirmed |
| dutyClockIn | crew | seat or drop-in, grade and lockout checks, may hand Captain to a seated Captain |
| dutyPing | crew on duty | heartbeat; 1 write a minute at most |
| dutyStepAway / dutyBack | crew on duty | breaks and "done for tonight" |
| dutyTakeLead | crew on duty | answers a handoff or acting-Captain prompt |
| dutyReassign | Captain, owner | moves someone on duty; Lead or Captain needs their accept |
| captainSet | owner | picks the Captain from /live/control |
| dutyConfirmNight | Captain, owner | adds minutes, confirms, pays Gears and badges |
| liveFlag / liveFlagAck | crew on duty / owner, admins | flag, Got it, Done |
| crewNote / crewNoteDelete | crew / author, admins | 200 characters, 10 notes per person a day |
| liveRecruitRush | owner | turn on, goal, reward |
| crewSetRules | owner | activity rules on, grace month |
| liveTick (changed) | scheduled | quiet-lead nudges, prompt timeouts |
| stopStream (changed) | owner | clocks everyone out, closes swaps |
| dutyAutoConfirm | every 15 min | confirms nights older than 24 h |
| crewNightly, crewMonthly, crewReminders | scheduled | reliability and no-shows; status run with grace; 15th and 24th |
| onUserCreatedRush | trigger | Recruit Rush count |

**Rules:** swaps, notes and crew/main settings readable by crew claims; duties and private records by self, admins and owner; flags by owner and admins; everything closed to client writes. Claims already carry crewGrade and crewStatus, so no rule needs an extra read.

### bt-ui components

The Deck is built from the kit and the Control Room pieces; seven new pieces join the kit and the UI kit page, each in every state and in both looks.

**Reused:** `.bt-cr-panel`, `.bt-cr-viewport` and the look blocks, the radar wordmark on `.bt-wordmark--power`, `.bt-launch`, `.bt-readout`, `.bt-beats`, `.bt-live-tag`, `.bt-grade`, `.bt-room`, `.bt-seat`, `.bt-chat-tile`, `.bt-timecard`, `.bt-stamp`, `.bt-burst`, `.bt-meter`, `.bt-medal`, `.bt-toast`, `.bt-page-tabs`, `.bt-switch`, `.bt-section-head`, openModal(), confirmAction(), modalHeader() and the `bt:overlay-open` event.

| New piece | What it is |
| --- | --- |
| `.bt-room-tile` | A room in the Deck: platform, lead, deckhands, coverage chip, viewers (planned in batch 3, now built) |
| `.bt-chat-feed` | The embedded chat column frame, with a link-out variant for TikTok (planned in batch 3) |
| `.bt-duty-bar` | Your role, room, minutes and Clock in / Step away; pins to the bottom on phones |
| `.bt-prompt` | The gold timed prompt for handoffs and acting Captain (swinging lantern, countdown ring, Accept / Not now) |
| `.bt-flag-card` | The gold flag card for the owner's controls and admins' Decks, with the stack |
| `.bt-crew-notes` | The crew notes strip (.bt-notes is already the Warm Fuzzies pinboard) |
| `.bt-swap` | A seat on the swap board: day stub, room and role, notice line, Take it; is-taken, is-mine-now |

No kit piece for the activity slots until live activities ships. Colour meaning holds: purple clickable, gold for needed, prompts and flags, green for staff-only controls, red only for the live tag and an open check-in. The goal bar uses `.bt-meter` with gold; no new colours.

### Edge cases

- **Two people take the same swap or handoff:** first write wins; the other gets "Someone beat you to it" (handoffs: becomes Deckhand).
- **Captain's phone dies:** after 20 quiet minutes the owner is nudged; the owner can use captainSet. The Captain role never moves on its own except through Step away.
- **Owner on the Deck:** sees everything, earns nothing, can't clock in (the owner hosts, as with check-ins).
- **A mod is Paused, removed or loses Active mid-stream:** clocked out at once, minutes so far still pay at confirm; Lead and Captain seats on future streams are released with an owner to-do (existing).
- **Stream ends while someone is stepped away:** clocked out at Stop like everyone else.
- **Stream crashes and auto-ends after 12 hours:** same as Stop; minutes cap at 6 h each.
- **Unscheduled stream:** no seats, drop-ins only, acting Captain rules apply, duty Gears still count.
- **Delay or Cancel after swaps open:** open swaps close with no record effect.
- **Clock in before the stream starts:** refused until Start ("The stream hasn't started yet"); the Deck shows the off-air state.
- **Account deleted:** duties, notes and swap entries deleted with it; flags they raised keep the text with "former crew member".
- **Recruit Rush on two streams at once (main and after-show):** one Rush per main stream; the after-show shows the main stream's bar.
- **Grace month and a mod who joins mid-month:** their first partial month never counts as missed, grace or not.
- **Heartbeat on a sleeping laptop:** pings stop, minutes stop; on wake the Deck says "Welcome back" and keeps going if they're still clocked in.

### Build parts

Eight parts, one Claude Code prompt each, in this order; each commits to dev with a CHANGELOG line, and parts that touch rules or functions deploy to staging.

1. **Swap board:** dutyDrop change, dutySwapTake, swaps rules, the Swap board card on /crew/hq and "Up for grabs" on /schedule.
2. **Duty backend:** clock in, heartbeat, step away, handoffs, Captain logic (acting, seated, captainSet), dutyReassign, Stop changes, dutyConfirmNight and dutyAutoConfirm, duty Gears and badges, nightly reliability and no-shows.
3. **Kit pieces:** the new pieces in shared/bt-ui.css and shared/ui, on the UI kit page in every state, in both looks.
4. **The Deck page:** /live/deck (desktop and phone, Hull and CRT), the gate, the duty loop UI, chats, quick lines, crew notes, the empty activity slots, the nav entry, staging previews (`?state=`, `?as=captain|lead|deckhand`).
5. **Captain tools and the owner's side:** the helm strip on the Deck, the Captain picker, flag card, chime and tab title on /live/control, admins' urgent flags, Confirm tonight's crew.
6. **Recruit Rush:** the owner card, the counting trigger, the goal bar on /live, in the stream view and on the Deck.
7. **Activity rules on:** crewSetRules and the owner switch, the monthly run with the grace month, reminders, the HQ time card, the /admin/crew lists, duty-based promotion criteria and the Fan Favourite ballot rule.
8. **Docs:** design-system.md §8 (Mod Deck), ROADMAP, CLAUDE.md if needed, and walk-throughs added to docs/testing/control-room-test-plan.md.

Mockups approved Oct 9, 2026 (docs/design/mockups/mod-deck.html): **H1** helm strip for the Captain tools, **P1** lantern prompt over the Deck, **R1** Recruit Rush goal meter. The cue slot and the launch panel's activity tiles are empty slots that live activities fills.

### Out of scope and later

- YouTube moderator sync (needs members to link YouTube); until then, the YouTube Lead checklist stays on the owner's list.
- Game cues on the Deck: they come with live activities (workstream 5b, which merged Chat Games and absorbed Mod Machina phase 4, Oct 9). The Deck only provides the slots.
- Twitch chat presence counting toward duty minutes: built to plug in once the broadcaster token is connected.
- Texting flags to the owner's phone (when Boom Alerts sending exists; the outbox entry is already written).
- Mark an incident (a private incident log), not chosen for this build.
- Drop a badge on the Deck and /live/control, once live drops are built (rewards.md §10a); the Recruit Rush reward can become a live drop then too.
- Giving a swap to a named person, and Stream Deck keys for the Deck.

## 18. Decisions (Oct 6, 2026, all confirmed as in bold)
1. Crew minimum age: **18+** (crew spaces put adults and teens together in private channels) or 16+.
2. Ladder names: **Initiate · Watcher · Warden · Sentinel** and **Steward · Overseer · Right Hand**, or suggest your own.
3. Crew points name: **Gears** (fits Mod Machina).
4. Promotions: **criteria flag + owner one-tap (A3 can confirm up to Warden)**, or owner-only for everything.
5. Monthly awards: **Top Gear (automatic) + Fan Favourite (member vote)**, with Boomer's Blessing replacing the owner-picked Mod MVP. Or keep all three.
6. YouTube boost: **× 1.5** to start.
7. Houses: **later** (after two Night Shift seasons), or now.
8. Crew messages: **existing Discord** if you have one, otherwise the 24-hour crew notes strip.
9. Rename the planner roles: **Stream Captain / Room Lead / Deckhand; YouTube = two rooms; one lead may cover both**.
10. **Only the owner approves new mods** (narrows foundation.md).
11. First Chat Games: **Dead Air + Scream Off**.
12. ~~Name for the live games~~: **Chat Games** (decided Oct 6).
13. Activity rules and perks as section 3f (approved Oct 6).
13b. Academy text approved (`claude/crew-academy.md`), chat is English only (Oct 6).
13a. Batch 3 picks: S1 seat map, D1 chat wall, C1 evidence board (Oct 6).
14. Crew HQ activity meter: M2, the time card (new kit piece `.bt-timecard`).
15. Every How it works, guide and training page (/crew/how-it-works, /crew/academy and each module) is built on the Arcade How it works frame: TocLayout side rail, `.bt-chapter--ghost` chapters, the shared How it works blocks (hero, stage cards with hover scenes, journey, flow, glossary chips, CTA), `.bt-flip`, `.bt-placard`, Ask BOOMBOT, and at least one working example. Site-wide standard set Oct 6 (see design-system.md §8, to be added).
