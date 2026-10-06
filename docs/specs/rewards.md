# Rewards spec (Trophy Room): badges, trophies, XP and perks

Oct 3, 2026 · Glenn Bowering · **Confirmed**
Mockup: `docs/design/mockups/trophy-room-how-it-works.html` (approved Oct 3: shape 1 Coin). Starter catalog: `functions/data/trophy-room-badges.json` (90 badges).
Replaces and grows ROADMAP workstream 7 (Badges). Night Shift is built on it.

## 1. Purpose
One shared rewards service for the whole site. Features earn things (Night Shift, Boom Arcade, Bug Zapper, Feature Lab, Contests, live streams); Rewards pays out, keeps one append-only ledger, and answers "does member X hold badge Y?".

## 2. What members collect
| Kind | Meaning | Lasts |
|---|---|---|
| Badge | You did something. Has a rarity and a collection. | Forever |
| Trophy | You placed (1st/2nd/3rd) or were picked. Dated. | Forever |
| XP and level | Lifetime XP raises your level and rank. | Never resets |
| Season XP | Night Shift's per-season race. | Resets each season |
| Perk | Comes with a plan (showcase slots, early merch, giveaways). | While on the plan |
| Identity tag | Role (from plan) and one chosen persona. Not collected or ranked. | Live |

## 3. Rarity (5 tiers)
Reuses the site's level ladder plus gray; shown with 5 signal bars (new kit `.bt-level--5`). Never purple or green.

| Tier | Tone | Bars | XP | Guide |
|---|---|---|---|---|
| Common | gray | 1 | 10 | Most members, first week |
| Uncommon | blue | 2 | 25 | Regulars within a season |
| Rare | gold | 3 | 50 | Real dedication or right moment |
| Epic | pink | 4 | 100 | A small crowd |
| Legendary | red/ember (animated ring) | 5 | 250 | A handful, maybe ever |

Each badge also shows "Held by N% of members" and the holder's serial ("#12 to earn it").

## 4. Collections (9)
Loyalty · Chat and Hype · Stream Moments · Community · Creators · Arcade and Contests · Supporters · Limited and Legacy · Crew (mods/admins only). Full starter list (68 badges, from the July 18 notes) is in the mockup's section 3.

Changes from the notes:
- "Badge Types" and "Badge Reward Categories" overlapped; merged into one collection per badge, plus a separate **source** (section 5).
- Roles (Club, Sub, VIP, Mod, Admin) and Personas become **identity tags**, not rarity badges: nobody "earns" Admin, and paid shouldn't read as rarer.
- Milestone, Award, Winner, Founder and Exclusive stop being types: milestones are **ladders** (a series of badges with rising rarity), Award is the **crew award** source, Winner is a **trophy** or the Arcade and Contests collection, Founder sits in Limited and Legacy.
- Golden Tanger (top monthly supporter) stays a badge for now; could become a trophy.

## 5. Sources (how a badge is earned)
| Source | How | Needs |
|---|---|---|
| Automatic | A Cloud Function trigger on an existing event (Bug Zapper confirmed, Feature Lab shipped, Arcade finish, account age, linked accounts) | Those features |
| Stream presence | Linked Twitch account seen in chat during a live stream (Get Chatters poll) and message counts (EventSub chat). Text is never stored. | Control Room (ws 5), Twitch scopes |
| Live drop | Owner or the stream lead presses Drop in the Control Room; a banner shows site-wide while the claim window is open (configurable, section 10a); members claim through a callable | Control Room |
| Crew award | Mod/admin awards with a written reason | Mod Machina permissions (ws 9), or admin until then |
| Contests and hunts | Contest results, scavenger hunts, hidden finds (one-time server tokens) | Contests (ws 12) |
| Night Shift | Campaign/activity completion | Night Shift |
| Support | Subs, gifts, tips. **No XP, never on leaderboards** | Billing (ws 11), tip provider |

## 6. Plans
| | Fan Club (free) | Sub Club ($7.99) | Crew (mods + admins) |
|---|---|---|---|
| Badges | All except Crew | All except Crew | All, plus Crew |
| Showcase | 3 pins | 6 pins + animated featured frame | 6 pins |
| Night Shift | All campaigns | + Sub Club campaigns (more ways, same XP per task) | + Crew missions |
| Boards | Season, Arcade | Season, Arcade | Season, Arcade, plus the crew board (Mod MVP). Admins on no boards |
| Giveaways | Member giveaways | + Sub Club giveaways (**legal review**) | Not eligible for member giveaways |
| Other | Merch store | Early merch access | Free Sub Club, earliest merch, Mod MVP trophy monthly |

Changes from the notes: one season board (filter All / Sub Club / Crew) instead of separate Club, Sub, Mod and Admin boards. **Decision (Oct 3): mods race on the season board with members**, to maximise activity at launch; revisit if mods dominate the top spots. Mods also have a crew board for Mod MVP. Admins stay off every board. An Admin-only board and admin giveaways are dropped; crew members don't win member giveaways.

## 7. Trophies
Weekly Arcade boards (top 3 per board, every Monday) · Season finish (top 3; top 10 plaque) · Contests · Mod MVP (monthly, picked by the owner). XP: 1st 150, 2nd 100, 3rd 75.

## 8. XP and levels
- XP: Night Shift dailies 10-25, weeklies 50-100, badges by rarity, trophies by place, supporter badges 0.
- Total XP for level L = 50 × L × (L − 1). Level 5 = 1,000 · 10 = 4,500 · 20 = 19,000 · 50 = 122,500.
- Ranks (draft names): Fresh Meat 1 · Survivor 5 · Night Stalker 10 · Nightmare 20 · Dread Lord 35 · Boomer Legend 50.
- An active member earns roughly 3,000-4,000 XP a season, so level 10 in the first season.

## 9. Data model (sites/boomertanger/…)
- `badges/{badgeId}`: name, collection, rarity 1-5, source, ladder {id, step}, secret + hint, limited {opensAt, closesAt}, crewOnly, xp, art (Cloudinary publicId, recordAssetCreated), status draft | active | buried | retired, awardableBy (mod | admin | owner), holders (running count). Public read.
- `profiles/{uid}/badges/{badgeId}`: earnedAt, serial, source, sourceRef. Public read. Reasons stay private.
- `profiles/{uid}/trophies/{trophyId}`: kind, place, label, period, earnedAt. Public read.
- `profiles/{uid}` adds: xp, level, rank, showcase [badgeIds], featuredBadge, persona.
- `rewardLedger/{key}`: uid, kind (xp | badge | trophy), amount, badgeId, feature, ref, grantedBy, reason, createdAt. Doc id = idempotency key `${feature}:${ref}:${uid}`, so a grant can never double-pay. Closed to clients; members read their own history through a callable.
- `drops/{dropId}`: badgeId, streamId, mode (timed | streamEnd | until | firstN), opensAt, closesAt, cap, droppedBy, claims (count), status open | closed. Claims in `drops/{id}/claims/{uid}`.
- `badges/{badgeId}.drop`: default mode, minutes, cap (the badge's drop preset).
- Season XP lives in Night Shift (`seasons/{id}/standings/{uid}`), written through the same grant function.
- adminLog `rewardsAward`, `rewardsRevoke`; activityLog `badge-earned`, `trophy-won` (Common badges skipped to keep the feed readable).

## 10. Functions
- `lib/rewards/grant.js` (internal): `grantBadge`, `grantXp`, `grantTrophy`, `hasBadge(uid, badgeId)`. Every feature calls these; nothing else writes rewards.
- Callables: `awardBadge` (mods/admins, reason required, daily cap per mod, no self-awards, mods up to Rare, admins up to Legendary, Boomer's Blessing owner only), `revokeBadge` (admin, logged), `claimDrop` (member, open window, one per member), `setShowcase` (member, slot count from plan), `setPersona`, `myRewardHistory`.
- Triggers: rule evaluator on activity events; scheduled job that buries limited badges at `closesAt` and recounts holders/percentages nightly.

## 10a. Live drop windows
- **Preset per badge.** Each drop badge stores its default window, set in the badge editor. Starting values: Jump-Scare Witness 3 min, The Glitchwitness 5 min, The Chosen One 2 min, Boss Fight Believer 10 min, Anniversary Ember until the stream ends.
- **Four modes:** Timed (countdown), Until the stream ends (closes on Stop), Until a set time, First N claims (optionally with a time limit too).
- **Override at drop time.** The drop panel opens on the preset with quick chips (1, 3, 5, 10, 15 min, Until stream ends) and an optional claim cap.
- **While it's open:** live countdown and claim count, +1 min, +5 min, Close now.
- **Safety:** 30-second hidden grace after close for stream delay; every drop closes when the stream stops; a timed window is capped at 2 hours; one drop per badge per stream; drops only while live (staging can test).
- **Who can drop:** the owner and that stream's stream lead (Schedule Planner crew). Every drop is in adminLog.
- **Later:** a Stream Deck button (signed webhook) and a chat bot message with the claim link.

## 11. Pages
- `/trophies/how-it-works` (public): the mockup.
- `/trophies` (members): full catalog with filters, your progress and ladders.
- Profile trophy case on public profiles; Rewards tab on `/account` (showcase, persona, history).
- Admin: badge editor (create, art, rules, schedule a limited window), award tool, drop button (in Control Room later).

## 12. Kit pieces (new)
`.bt-medal` (ring + face, sizes, 5 rarities, secret, shape), `.bt-level--5`, `.bt-trophy`; promote the Arcade's flip card, House rules placard and Ask BOOMBOT chat to the kit (second user).

## 13. Phasing
1. Core service + Automatic badges (Bug Zapper, Feature Lab, Arcade, account age, linked accounts) + XP/levels + profile trophy case + How it works.
2. Night Shift on top.
3. Stream presence and Live drops once the Control Room exists.
4. Crew awards with Mod Machina; Supporters with billing; Contests.
Badges whose source isn't live yet show in the catalog with "Coming soon".

## 14. Decisions (Oct 3, 2026)
1. Name: Trophy Room.
2. Badge shape: 1 Coin. The tombstone may be used later for one special set.
3. Roles and personas are identity tags, not rarity badges.
4. Mods are on the season leaderboard with members (Option A). Admins are on no boards.
5. Rank names and XP curve as in section 8 (tunable before launch).
6. Badge art: commission a full set (art brief to follow: one coin template, rarity ring added in code, art supplied as the face only).
7. Live drop windows are configurable per drop (section 10a).
8. Sub Club giveaways go ahead; legality handled by Glenn before launch.
9. Everything else as recommended in this spec.

Streak ladders (Loyalty collection): daily check-in streak, 12 badges from 3 to 365 days (fun-factory.md 13a); stream streak, 10 badges from 3 to 100 streams in a row (fun-factory.md 13b, needs the Control Room). Stream presence also counts through the on-site stream code check-in. Clock: America/Chicago.

## 15. Still open (before the relevant phase)
- Sub Club-only giveaways: going ahead (Oct 3); Glenn sorts out legality before the first one runs (free way in or a lawyer's OK; prizes for 13-17 year olds).
