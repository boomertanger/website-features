# Spec: Scream Planner — CONFIRMED (2026-10-07; mockups approved)

ROADMAP workstream 4 (was "Schedule Planner"). Planning chat: "Games and streams".
Builds on: `stream-object.md` (confirmed), `game-vault.md` (confirmed), `mod-machina.md`
§6–7 (crew roles, seats, availability) and phase 2 of Mod Machina ("Schedule Planner seats").
Out of scope: the Control Room (ws 5), Discord, iCal export, billing, and the delivery of
email/text/push (a new **Notifications** workstream; see §9).

## 1. Summary

Boomer plans next week's streams with the community. Each week opens automatically, pre-filled
from **Boomer's usual week** (saved patterns). Boomer adjusts the slots (date, start, end, type,
theme, number of games); mods mark which slots they can make, take crew seats and can ask for a
game on a slot; members vote on games. Boomer fills each slot from the Game Vault in this order:
**mod requests → member votes → games that fit the slot's theme → his own picks.** Then he
publishes the week to **/schedule**. Before a stream starts he can **delay** it or **cancel** it.
Starting streams belongs to the Control Room.

## 2. Pages and who sees what

| Page | Who | What |
|---|---|---|
| `/schedule` (boomertanger.events redirects here) | Everyone | The marquee hero (next stream), This week at a glance (doors), then this week and next week (published only). Backstage streams show as members-only. |
| `/schedule/usual` | Everyone | Boomer's usual week. |
| `/schedule/vote` | Everyone (members vote) | Next week's ballot while it's open. |
| `/schedule/plan` | Owner, admins (plan view); Active crew (crew view) | The planning board for the open week. |
| `/schedule/plan/usual` | Owner, admins | The usual-week editor (patterns and exceptions). |
| `/admin` card "Scream Planner" | Owner, admins | Deadlines and defaults; "Week not published" to-do. |

| Who | Can do |
|---|---|
| Visitors | View the published schedule and usual week, and see the ballot read-only. Vote opens the Join dialog ("Join to vote on games"). |
| Members, email not verified | As visitors, plus the verify-email prompt on Vote. |
| Members, email verified | 3 votes a week on the ballot; add a Vault game to the ballot (2 a week); add a new game through the Vault's Add a game, then onto the ballot. |
| Crew (Active mods and admins on duty) | Crew view: see draft slots, mark availability per slot, request seats their grade allows, request one game per slot they'll crew. See their crew status chip and month meter (Mod Machina). |
| Admins | Plan view: everything below except as noted. A1 Steward can edit slots and confirm crew but cannot publish, delay or cancel (Mod Machina safety net). |
| Owner | Everything: patterns, settings, publish, delay, cancel. |

Feature bar: Scream Planner wordmark (the screaming tear-off calendar icon) with a seg nav: Schedule · Usual week · Vote (count) · Plan (crew and admins only).

Nav: `/schedule` stays in the Watch group (already in `site/src/lib/nav.js`). `/schedule/plan`
appears in the account menu for crew and admins ("Scream Planner"), not in the header.

## 3. The weekly rhythm (fixed deadlines, settable)

Weeks run Monday–Sunday, Central (`sites/{siteId}.timezone`). For the week **after** this one:

| Step | Default (Central) | What happens |
|---|---|---|
| Open | Monday 10:00 | `plannerTick` creates the week from the usual week minus exceptions. Crew view and the ballot open. |
| Close | Thursday 22:00 | Votes, game requests and availability changes close. Seat sign-ups stay open. |
| Publish by | Friday 18:00 | A reminder on /admin if it isn't published yet. **Nothing auto-publishes.** |

- Days and times are set on the /admin card (`planner/main.deadlines`); validated so open < close < publish < the week's Monday.
- Boomer can **open early** or **reopen voting** by hand (owner only; logged).
- Publishing before Close also closes the ballot.
- **Week off:** if an exception covers the whole week, the week opens empty with the exception's label ("Week off: holiday"), no ballot, and /schedule says so.

## 4. Data model

All under `sites/{siteId}/` (siteId `boomertanger`). No client writes anywhere; everything goes through callables.

### 4a. Settings and the usual week

**`planner/main`** (admins read): `deadlines { openDow, openTime, closeDow, closeTime, publishDow, publishTime }`,
`defaults { rooms[], minCrew { captain: true, rooms: ["youtube"] }, caps { deckhands: 2 }, votesPerMember: 3, ballotAddsPerMember: 2, ballotSeed: 5, gameCount: 2 }`.

**`planner/main/patterns/{id}`** (admins read): one repeating slot.

| Field | Notes |
|---|---|
| `label`, `icon` | The theme, e.g. "VR night" 🥽, "Co-op day", "Granny day", "Backstage VOD recording" |
| `dow`, `start`, `end` | Weekday and local times (Central). A slot may cross midnight; it belongs to its start day. |
| `type`, `audience` | `platform` with `platforms[]`, or `backstage` with audience `fanClub` (Sub Club later). |
| `gameCount` | Default number of games |
| `tagHints[]`, `gameHints[]` | Vault tags (`vr`, `co-op`) and Vault slugs (the Granny games) suggested first in the tray |
| `rooms`, `minCrew` | Override the defaults for this pattern |
| `active`, `order` | |

**`planner/main/exceptions/{id}`** (admins read): `kind: weekOff | dayOff | skipPattern`, `from`, `to`,
`patternIds[]?`, `label` ("Holidays", "Travelling"), `public` (show the label on /schedule or not).

**`public/usualWeek`** (public read): patterns as display cards (label, icon, day, times, type,
backstage marked members-only) plus upcoming public exceptions. Rebuilt on any change.

Editing a pattern never changes weeks already opened.

### 4b. Weeks

**`planWeeks/{week}`** (`2026-W43`; crew read): `state: open | closed | published`, `opensAt`,
`closesAt`, `publishBy`, `publishedAt`, `publishedRev`, `hasUnpublishedChanges`, `weekOff?`,
`streamIds[]`, `counts { slots, seatsOpen, votes }`.

### 4c. Streams (amends stream-object.md)

Planned slots are stream objects from the start (`state: planned`), exactly as stream-object.md
says; the working copy lives in `streams/{id}/private/draft` until publish. New fields:

| Field | Notes |
|---|---|
| `type` | `platform` or `backstage` |
| `audience` | `public` (platform streams), `fanClub`, later `subClub` |
| `plannedGameCount` | 1–6. Fewer planned games than the count shows "+1 picked on stream". |
| `theme` | `{ patternId?, label, icon }` or absent |
| `rooms[]` | Which chats this stream has: `twitch`, `ytLandscape`, `ytVertical`, `tiktok` (backstage: none) |
| `minCrew`, `caps` | From the pattern or defaults |
| `crew` | **Changed to the Mod Machina shape (§16a):** `{ captain, chats: { twitch, ytLandscape, ytVertical, tiktok: { lead, deckhands[] } }, caps }`. Confirmed seats only; handles in the public doc, uids in the draft. |
| `delay` | `{ originalStart, originalEnd, count, reason?, at, by }` or absent |
| `cancel` | `{ reason?, at, by }` (state `cancelled`) |
| `plannedGames[].source.kind` | Adds `modRequest` (with `byHandle`) and `ballot` (with vote count) to `owner | suggestion | wishlist`. `suggestion` is kept for old data; new ballot picks use `ballot`. |
| `week` | Already in the spec; used for all planner queries |

Backstage watch details (the unlisted YouTube video ID; since Oct 8 also **the YouTube event IDs** for every stream, see Part 8) go in `streams/{id}/private/watch`,
filled by the Control Room and handed out by a callable to members with the right audience
only. The Planner only sets `type` and `audience`.

### 4d. Crew sign-ups and mod requests

**`streams/{id}/signups/{uid}`** (crew read; owner/admins see all, a mod sees all handles but only their own reliability):

| Field | Notes |
|---|---|
| `availability` | `yes | maybe | no`, pre-filled from the crew profile's usual availability (`prefilled: true` until the mod touches it) |
| `seats[]` | Requested seats in order of preference: `{ room | "captain", role: captain | lead | deckhand, status: requested | confirmed | declined | dropped }` |
| `gameRequest` | `{ gameSlug, note ≤140, status: open | planned | notPlanned }` or absent |
| `handle`, `grade`, `updatedAt` | |

Rules: a game request needs `availability: yes` and at least one requested seat
(you ask for a game on a slot you'll crew). One request per mod per slot. Seats follow
Mod Machina §6a grades. The Captain or owner confirms. Seat sign-ups stay open after Close
and after publish, until the stream starts. Seats follow the Mod Machina swap board after
publishing.

### 4e. The ballot

**`planWeeks/{week}/ballot/{gameSlug}`** (server only): `votes`, `seededFrom: mostWanted | member | owner`,
`addedBy { handle }?`, `createdAt`.
**`planWeeks/{week}/votes/{uid}`** (no client read): `slugs[]` (max 3, one per game).
**`public/ballot`** (public read): the open week's ballot with counts, closing time, and the
signed-in member's own picks come from a callable (`ballotMine`), not the public doc.

- When the week opens, the ballot is seeded with the top `ballotSeed` (5) Most wanted wishlist
  games, plus every `playing` game. "I want this too" stays the long-term wishlist signal; the
  ballot is "play it next week".
- Members can add any non-hidden Vault game (2 a week). A game not in the Vault goes through
  the Vault's Add a game first; when it's added, it's put on the ballot in the same flow.
- Votes can be moved until Close. Counts show live.
- Hidden or deleted Vault games drop off the ballot; votes on them are returned.

### 4f. Notifications outbox (hand-off to the Notifications service)

**`notifyOutbox/{id}`** (server only, TTL 30 days): `type` (`week-published`, `stream-delayed`,
`stream-cancelled`, `crew-seat-confirmed`, `crew-reminder-24h`, `crew-reminder-1h`,
`crew-seat-open`), `audience` (`members`, `crew`, `uids[]`), `streamId?`, `week?`, `payload`
(title, times, reason, link), `createdAt`, `status: pending`. The Planner only writes it. The
Notifications service (new workstream) reads it and delivers email, text and push by each
member's preferences. Until then nothing is sent off-site.

### 4g. Logs

adminLog feature `screamPlanner`: `pattern`, `exception`, `settings`, `slot`, `games`, `publish`,
`delay`, `cancel`, `crewConfirm`, `reopen`. activityLog feature `schedule`: `week-published`
("Next week's schedule is up: 5 streams"), `stream-delayed` ("Tonight's stream moved to 9:00 PM"),
`stream-cancelled`.

## 5. Choosing games for a slot (the tray)

When Boomer opens a slot's games, the tray lists Vault games in four groups, in this order:

1. **Mod requests** for this slot: game, requester's handle and grade, their seat
   ("Captain, requested"), note. Planning a requested game marks the request `planned` and
   gives the mod a heads-up in the crew view.
2. **Community votes**: ballot games by votes.
3. **Fits the theme**: Vault games matching the slot's `tagHints` or `gameHints`.
4. **Your picks**: `playing` games first, then the whole Vault with search (the Vault matcher).

A game matching the theme also shows a theme chip in groups 1–2, so a VR request on VR night
stands out. Dragging (or tapping Add) puts the game in the slot. A slot holds up to
`plannedGameCount` games; reordering sets `order`. The source is recorded on each planned game.
A game already planned in another slot that week shows "Also Wed".

Slot cards show availability and crew at a glance: "4 available · Captain ✓ · Twitch ✓ ·
YouTube needed ×1.5 · TikTok —" ("needed" in gold, never red).

## 6. Publish, delay, cancel

- **Publish week** (owner): checks first and lists warnings (slot without games, min crew
  missing, overlap) without blocking. Copies each draft into the public doc (`published: true`,
  `state: scheduled`), sets `planWeeks.state = published`, posts the activity event, writes
  `week-published` to the outbox, starts the Mod Machina early sign-up window (+3 Gears within
  48 h). Celebration: the board's cards stamp "ON AIR SOON" with a short splat burst (none
  under reduced motion).
- **Changes after publishing** stay in the draft (`hasUnpublishedChanges`) until "Publish
  changes", which only notifies about streams that actually changed.
- **Delay** (owner, A2+): only before `actualStart`. New start and end (same length by
  default), optional reason (shown publicly). Refused if it overlaps another stream. Public card
  shows "Delayed · now 9:00 PM (was 7:00 PM)". Crew seats stay. Crew get "Still on for the new
  time?" (keep / drop with no reliability hit). Writes the outbox and the activity event. A
  delay takes effect immediately (it doesn't wait for re-publish).
- **Cancel** (owner, A2+): only before `actualStart`. Confirm dialog (`confirmAction`, not red:
  nothing is destroyed). State `cancelled`, kept as a record, gray badge on /schedule with the
  reason. Seats are released without reliability hits, planned games return to the tray for
  later weeks, and the outbox and activity event are written. A planned (unpublished) slot can
  simply be removed instead.

- **YouTube (added Oct 8, 2026, Part 8):** publish, edits (Publish changes), delay and cancel also **sync the stream's YouTube event** (create, update, move, delete); a failure never blocks the Planner action: the card shows "YouTube failed · Retry".

## 7. Functions (`functions/lib/planner/*.js`, JavaScript)

| Function | Caller | Does |
|---|---|---|
| `plannerSaveSettings` | Owner | Deadlines and defaults |
| `patternSave` / `patternDelete` | Owner, admins | Usual-week patterns; rebuild `public/usualWeek` |
| `exceptionSave` / `exceptionDelete` | Owner, admins | Weeks off, days off, skipped patterns |
| `weekOpen` | Owner (manual) / `plannerTick` | Create the week and its planned streams from patterns; seed the ballot |
| `weekReopen` | Owner | Reopen voting and requests until a new close time |
| `planSlot` | Owner, admins | Create, edit or remove a planned slot (draft) |
| `planGames` | Owner, admins | Set a slot's planned games and order |
| `publishWeek` | Owner | §6; also "Publish changes" |
| `delayStream` / `cancelStream` | Owner, A2+ | §6 |
| `crewAvailability` | Active crew | `{ streamId, availability }` |
| `dutySignUp` / `dutyDrop` / `dutyConfirm` | Crew / Captain, owner | Mod Machina names; seat rules from §6a |
| `modGameRequest` | Active crew | `{ streamId, gameSlug, note }` or remove |
| `ballotVote` | Verified members | `{ week, slugs[] }`, max 3 |
| `ballotAddGame` | Verified members | Add a Vault game (2 a week) |
| `ballotMine` | Members | Their votes and adds this week |
| `plannerTick` | Every 15 min | Open, close and nudge at the set times; 24 h and 1 h crew reminders into the outbox; rebuild `public/ballot` |

Pure logic in `functions/lib/planner/logic.js` (week math across DST, pattern expansion with
exceptions, overlap checks, tray ordering, seat eligibility, deadline validation), checked by
`functions/scripts/check-planner.js` in `npm run check`. Uses `streams/logic.js` for transitions.
Test helper `functions/scripts/make-test-week.js` (staging only; `--remove`).

## 8. UI (mockups will be the source of truth)

**`/schedule`** (tool page): hero header with a small scene (the mascot pinning cards to a
blood-red calendar), This week / Next week tabs, one card per stream (day, Central time plus
your local time, platform icons or a **Backstage · Fan Club** badge, theme chip, game covers,
crew line by handle, Delayed or Cancelled states). Phones: an agenda list. Sections:
**Boomer's usual week** (a compact week strip of themed slots), **Vote for next week** while the
ballot is open (game cards with vote buttons, "2 of 3 votes left", "Closes Thu 10 PM"). Empty
state: mascot with "Next week's schedule lands Friday."

**`/schedule/plan`** plan view: deadline strip (Open · Close · Publish by, with countdown),
the week as columns with slot cards, the tray beside it (four groups, §5), crew status on each
card, unpublished-changes marker, Publish week. Phones: one day at a time with the tray as a
sheet. Crew view (same URL): the slots with an availability toggle (Available / Maybe / Can't),
seat buttons their grade allows, Request a game, their status chip and month meter.

**`/schedule/plan/usual`**: the usual week as a 7-day strip of pattern cards, add or edit a
pattern in a dialog (`openModal`), exceptions list.

**Kit pieces to add (propose to the UI kit):** slot card, deadline strip, availability
tri-toggle (segmented), vote button with remaining-votes counter, theme chip, dual time
(Central + local), tray group. Reuse from Mod Machina if already built: room chip, seat card,
grade chip. Colours: purple clickable, gold "needed" and headings, green staff controls, no red
(nothing here destroys data).

## 9. New workstream: Notifications

Proposed ROADMAP entry: one service that delivers events from `notifyOutbox` by email, text and
push, with per-member preferences on the account page (which events, which channels, quiet
hours), unsubscribe links, and delivery logs. Needs the custom email sending domain (ws 13) and
an SMS provider. Other services (Mod Machina reminders, Night Shift, Contests) will use the same
outbox.

## 10. Edge cases

- DST weeks: patterns store local times; expansion uses the Central zone, so 7 PM stays 7 PM.
- Overlapping slots: refused on save, delay and publish.
- A mod loses Active status or the mod role: their seats are released, the owner gets a to-do,
  their game requests stay visible as "requester no longer on crew".
- A pattern edited after the week opened: that week is unchanged; the next one uses the edit.
- Vault game deleted: refused while on a ballot or a planned slot (adds to the Vault's
  "appears in N streams" check). Hidden: it leaves the ballot, votes are returned.
- Votes after Close: refused; the page shows the closed state.
- Delaying more than once: `delay.count` increases; `originalStart` stays the first time.
- Delay or cancel after the stream started: refused (Control Room's job).
- Account deletion (2b list): votes and sign-ups removed, seats released, `byHandle` becomes
  "Deleted member".
- Ballot ties: higher Most wanted count first, then newest vote.

## 11. Parts (one commit each)

1. Docs: this spec; amend `stream-object.md` (new fields, crew shape, source kinds) and
   `mod-machina.md` §16a (done); ROADMAP (rename to Scream Planner, status, new Notifications
   workstream); CHANGELOG.
2. Backend logic: `planner/logic.js` + `check-planner.js`.
3. Backend wiring: callables, `plannerTick`, rules, indexes, TTL on `notifyOutbox`; Vault delete
   check; staging deploy.
4. Scripts: `make-test-week.js`; dry run.
5. Site (after mockups are approved): kit pieces + UI kit page, `/schedule`, `/schedule/plan`
   (both views), `/schedule/plan/usual`, /admin card, account menu link, design-system.md §8.
8. YouTube events (Part 8, added Oct 8; see section 15): `functions/lib/youtube/`, Connect YouTube, the Planner chips, the staging rule and cleanup script; built before the Control Room.

## 12. Confirmed choices (all five confirmed 2026-10-07)

1. URLs: `/schedule/plan` and `/schedule/plan/usual`.
2. Ballot seed: top 5 Most wanted + all playing games; 3 votes and 2 adds per member per week.
3. A2+ (not A1 Steward) can delay and cancel; only the owner publishes.
4. Delays keep crew seats and ask crew to reconfirm.
5. Notifications as a new workstream, with the Planner writing to the outbox now.

## 13. Approved mockups (2026-10-07)

Mockups: `docs/design/mockups/scream-planner-mockups.html`, round 4, approved. Round 1 picks: H1 marquee, W1 tickets, V1 covers, T1 side tray, plus the crew view, the delay and cancel dialogs, the usual week editor and the /admin card as shown.

- **/schedule shows both heroes:** the marquee (what's next, with a flip-clock countdown), then **This week at a glance** (doors), then the full week.
- **Chosen at publish:** the publish dialog lists what's unfinished (it warns but doesn't block), then the **marquee frame** and the **door style**. Stored as `planWeeks/{week}.hero { frame, doors }` and copied to the public week. They can be changed later with Publish changes. The default is the previous week's choice.
  - Frame pool (🎲 Surprise me rolls only from these, never one used in the last three weeks): bulbs, neon, barbed, drip, tape, film, web, electric, vhs, candles, ecg.
  - Seasonal frames (picked by hand only, never rolled; listed first in October for Halloween and December for Christmas): jack, pumpkin (Halloween); blizzard, snowman (Christmas). The snowman frame hides the mascot peek.
  - Door styles: D1 Jaws, D2 Elevator, D3 Coffins (the lid tips forward off its foot, falls and fades), D4 Morgue drawers, D5 Hinged; Surprise me rolls one. Viewers can flip styles with ‹ › for fun; nothing is saved.
  - Shared door states: tonight open a crack with light leaking, ended (greyed, "Ended" stamp), cancelled (chained with a padlock; rattles on hover), backstage (velvet), day off (sealed). Each door floats slightly, out of step with its neighbours.
  - **Door layout L4:** a row of seven on desktop and tablet; on phones (container ≤ 640px) a left-right slider. Tonight is centred and opens, with neighbours scaled and dimmed; swipe, ‹ › and dots move it (no wrap at Mon/Sun).
- **Viewer view switches:** the week defaults to W1 tickets with a Tickets / Timeline (W2) switch, and the ballot defaults to V1 covers with a Covers / Race (V2) switch. Both are kept per viewer in localStorage (`bt.schedule.weekView`, `bt.schedule.voteView`), wrapped in try/catch. On phones the timeline is a compact grid.
- **Everything goes still under reduced motion** (frames, doors, flip clock, bursts, slider transitions).
- **New kit pieces** (bt-ui.css + shared/ui/*.js + the /dev/ui-kit page): `.bt-ticket`, `.bt-marquee[data-frame]` + `.bt-flipclock`, `.bt-velvet`, `.bt-vote-card` + `.bt-drops`, `.bt-fuse`, `.bt-slot` + `.bt-tray`, `.bt-tri`, `.bt-poster`, `.bt-portal` (five styles), `.bt-slider` (L4), `.bt-view-switch`, `.bt-burst`, plus the Scream Planner icon. Unique colours are declared once as custom properties (velvet, bulb, fuse, wire, wax, snow, ice, pumpkin).

## 14. Reads for the pages (the backend contract, built Oct 7)

Everything below is written only by `functions/lib/planner/*` (Admin SDK). Pages read these paths and call the callables; they never write. Times are Firestore Timestamps on stream docs and plain UTC milliseconds in the `public/*` summary docs. Weekdays are ISO numbers (1 Monday to 7 Sunday); local times are `"HH:MM"` strings in the site zone (`sites/{siteId}.timezone`, Central today). Callable errors carry `details.reason`.

### Public reads (everyone)
- **`public/schedule`** (new): `{ currentWeek, tz, weeks: [{ week, state: "published" | "planning", startsMs, endsMs, publishBy, publishedAt, publishedRev, hero: { frame, doors } | null, weekOff: { label } | null, streamCount }], updatedAt }`. Every week from the current one on. `hero` and `streamCount` are only set once published; `weekOff.label` is null when the exception is not public. Rebuilt on open, close, publish and every tick. This is what /schedule reads for the marquee frame, the door style and the week-off message; with no entry for next week (or `state: "planning"`) show "Next week's schedule lands Friday."
- **Published streams**: `streams` where `published == true` (rules already public). By week: `where published == true, where week == "2026-W44", orderBy plannedStart`. The marquee's next stream: `where published == true, where plannedStart > now, orderBy plannedStart, limit 1` (skip `state == "cancelled"` client-side). The indexes are in `firestore.indexes.json`.
  - Fields: `state` (`scheduled | live | ended | cancelled`), `slug`, `week`, `title`, `tz`, `plannedStart`, `plannedEnd`, `type` (`platform | backstage`), `audience` (`public | fanClub`), `platforms[]`, `rooms[]`, `plannedGameCount`, `theme { patternId, label, icon, tagHints[], gameHints[] }?`, `plannedGames[] { gameId, title, order, source { kind, byHandle?, votes? }, outcome }`, `plannedGameIds[]`, `minCrew`, `caps`, `crew { captain: handle | null, chats: { room: { lead: handle | null, deckhands: [handle] } }, caps }` (a room the stream doesn't have is absent), `delay { originalStart, originalEnd, count, reason?, at, by }?`, `cancel { reason?, at, by }?`, `hasUnpublishedChanges`, `rev`. Backstage streams are public docs too: show them as members-only ("Backstage · Fan Club", velvet door) without linking.
  - After publishing, **seat changes, delay and cancel reach the public doc at once**; edits to times, games, theme and rooms stay in the draft until Publish changes (the public doc keeps showing the published version).
- **`public/usualWeek`**: `{ patterns: [{ id, label, icon, dow, start, end, type, membersOnly, platforms[], gameCount }], exceptions: [{ id, kind, from, to, label, patternIds[] }] (upcoming public ones only), tz, updatedAt }`.
- **`public/ballot`**: `{ week, state: "open" | "closed" | "none", opensAt, closesAt, games: [{ slug, title, cover, status, tags[], votes, wanted, seededFrom, addedBy (handle | null) }] (ranked: votes, then Most wanted, then newest vote), totalVotes, votesPerMember, updatedAt }`. It always shows the newest week that has a ballot (state `closed` once voting is over). The signed-in member's own picks come from `ballotMine`.

### Crew and staff reads (Firestore rules: mods and admins; admins for settings)
- **`planWeeks/{week}`** (staff): `state` (`open | closed | published`), `opensAt`, `closesAt`, `publishBy`, `publishedAt`, `publishedRev`, `hasUnpublishedChanges`, `hero { frame, doors } | null`, `weekOff { label, public, exceptionId } | null`, `streamIds[]`, `ballotSlugs[]`, `counts { slots, seatsOpen, votes }`, `earlySignupUntil?`, `closedEarly?`. The collection is small: read it whole and pick the weeks you need.
- **Planning board**: `streams` where `week == w` ordered by `plannedStart` (staff read every stream, including `published: false`), plus `streams/{id}/private/draft` for the full working copy (crew seats there are `{ uid, handle }`).
- **`streams/{id}/signups/{uid}`** (staff): `{ availability: "yes" | "maybe" | "no", prefilled, seats: [{ room: "captain" | room, role, status: "requested" | "confirmed" | "declined" | "dropped", needsOwnerOk?, why? }], gameRequest: { gameSlug, note, status: "open" | "planned" | "notPlanned" } | null, reconfirm: { count, needed }?, handle, grade, track, updatedAt }`. No reliability data.
- **`planner/main`** (admins): `{ deadlines { openDow, openTime, closeDow, closeTime, publishDow, publishTime }, defaults { rooms[], minCrew, caps, votesPerMember, ballotAddsPerMember, ballotSeed, gameCount } }`; `planner/main/patterns/{id}`, `planner/main/exceptions/{id}`, `planner/main/todos/{id}` (`{ kind: "weekNotPublished" | "seatReleased", text, week, link }`: the /admin to-do list).
- Not readable by clients: `planWeeks/{week}/ballot`, `planWeeks/{week}/votes`, `notifyOutbox`.

### Callables (all `onCall`, all refuse with `details.reason`)
| Callable | Who | Data in | Returns |
|---|---|---|---|
| `plannerSaveSettings` | owner | `{ deadlines?, defaults? }` (merged) | `{ ok, settings }` |
| `patternSave` / `patternDelete` | admins | `{ id?, label, icon, dow, start, end, type, platforms?, rooms?, gameCount, tagHints[], gameHints[], minCrew?, caps?, active?, order? }` / `{ id }` | `{ ok, id }` |
| `exceptionSave` / `exceptionDelete` | admins | `{ id?, kind, from, to?, label, public?, patternIds? }` (dates `YYYY-MM-DD`) / `{ id }` | `{ ok, id }` |
| `weekOpen` | owner | `{ week? }` (default: next week) | `{ ok, week, created, streams, weekOff }` |
| `weekReopen` | owner | `{ week, closesAt? (ms) }` | `{ ok, week, closesAt }` |
| `planSlot` | admins | create: `{ week, date, start, end, type?, rooms?, plannedGameCount?, theme?, minCrew?, caps?, title? }`; edit: add `streamId`; remove: `{ week, streamId, remove: true }` (a published slot is cancelled instead) | `{ ok, streamId, slug }` |
| `planGames` | admins | `{ streamId, slugs[] }` in order; the server sets each source (modRequest, ballot, owner) | `{ ok, plannedGames }` |
| `planTray` | admins | `{ streamId }` | `{ ok, groups: [{ id: modRequests / votes / theme / picks, items }] }` (picks capped at 60, with `more`) |
| `publishWeek` | owner | `{ week, hero?: { frame, doors } (either may be "surprise"), check?: true }` | check: `{ warnings, hero (default), recentFrames, poolFrames, seasonalFrames, doorStyles }`; publish: `{ publishedRev, published, changed, hero, warnings }` |
| `delayStream` | owner, A2+ | `{ streamId, date, start, end?, reason? }` (or `startMs`, `endMs`) | `{ ok, plannedStart, plannedEnd, delayCount }` |
| `cancelStream` | owner, A2+ | `{ streamId, reason? }` | `{ ok, state }` |
| `crewAvailability` | Active crew | `{ streamId, availability }` (week must be open) | `{ ok }` |
| `dutySignUp` | Active crew | `{ streamId, seats: [{ room?, role }] }` in order of preference | `{ ok, seats, earlyGears }` |
| `dutyDrop` | crew (own); admins (`uid`) | `{ streamId, seat?, uid? }` | `{ ok, dropped, released }` |
| `dutyConfirm` | Captain, admins, owner | `{ streamId, uid, seat, decline? }` | `{ ok, status, crew }` |
| `dutyKeep` | Active crew | `{ streamId }` ("Still on for the new time?" keep) | `{ ok }` |
| `modGameRequest` | Active crew | `{ streamId, gameSlug, note?, remove? }` | `{ ok, gameRequest }` |
| `ballotVote` | verified members | `{ week?, slugs[] }` (replaces the member's picks, max 3) | `{ ok, slugs, votesLeft }` |
| `ballotAddGame` | verified members | `{ week?, slug }` | `{ ok, slug, addsLeft }` |
| `ballotMine` | members | `{ week? }` | `{ week, open, closesAt, votes[], adds[], votesLeft, addsLeft }` |

Common `details.reason` values: `notOwner`, `notAdmin`, `notAllowed` (delay and cancel below A2), `notCrew`, `notActive`, `gradeTooLow`, `leadBlocked`, `needsOwner`, `seatTaken`, `cantHold`, `roomOff`, `deckhandCap`, `needsAvailability`, `needsSeat`, `noteTooLong`, `closed` (voting, availability and requests after Close), `emailNotVerified`, `needsSignup`, `tooManyVotes`, `notOnBallot`, `addLimit`, `onBallot`, `noGame`, `overlap`, `outsideWeek`, `tooManyGames`, `started`, `badState`, `noChange`, `nothingToPublish`, `noTimezone`, `invalid` (with `details.problems[]`). The Vault's `vaultDeleteGame` now refuses with `inPlanner` while a game is on a ballot taking votes or in a planned or scheduled slot.

### Decisions made while building (flagged for review)
- Overlaps are refused on save, delay and publish (section 10); section 6 lists overlap among the publish warnings, so `publishWeek` returns it in `warnings` and also blocks (`overlap`). Overlaps cannot normally exist at publish because saves and delays refuse them.
- A Watcher may request Captain; the request is flagged `needsOwnerOk` and only the owner can confirm it. A Captain may also hold Room Lead seats (including both YouTube rooms); a Deckhand holds that seat only.
- Prefilled availability: the slot's weekday is in the mod's usual days gives `yes`, otherwise `no`; a mod with no usual days is left blank. Saying `no` drops pending seat requests and the game request (confirmed seats stay until dropped).
- Planner defaults when unset: every room (`twitch`, `ytLandscape`, `ytVertical`, `tiktok`), `minCrew { captain: true, rooms: ["youtube"] }`, `caps.deckhands 2`, 2 games. Playing games are seeded onto the ballot as `seededFrom: "owner"`; a wishlist game needs at least one "want" to count as Most wanted.
- The Mod Machina early sign-up window is `planWeeks.earlySignupUntil` (48 h after the first publish); the first seat request in it pays +3 Gears through `grantGears` with source `earlySignup` (added to the Gears sources; idempotent per stream and person).
- A partly covering `weekOff` exception acts as days off for the days it covers; only a range covering Monday to Sunday takes the whole week off.
- `notifyOutbox` docs carry `expireAt` (30 days); the TTL policy is in `firestore.indexes.json` `fieldOverrides`.

## 15. Part 8: YouTube events (added Oct 8, 2026)

Built from `control-room.md` §11 and §18 item 0, **before** the Control Room, because publish, edits, delay and cancel start in the Planner. The Control Room reuses the same module for ad hoc streams, after-shows and Start.

**Module:** `functions/lib/youtube/` (JavaScript), with the callables and triggers below. The site creates every YouTube event, so in Streamlabs the owner only picks it from the list.

| Function | Kind | Does |
| --- | --- | --- |
| `youtubeConnect` | HTTPS | The Google sign-in callback for **Connect YouTube** on /admin (the Connect TikTok pattern; scope `youtube.force-ssl`; the token lives server-only at `sites/boomertanger/private/youtubeChannel`). The owner sets `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET` himself. |
| `youtubeSync` | Trigger | Creates, updates or deletes the YouTube event for a stream when the week is published, a published stream is edited and republished, a stream is delayed or cancelled (and, from the Control Room, for ad hoc streams and after-shows). |
| `youtubeTidy` | Daily | Sets backstage videos to private the set number of days after the stream (7, on by default). |

**What gets synced**

| When | What the site does on YouTube |
| --- | --- |
| Week published | One event per stream: public for platform streams, unlisted for backstage. Title, a description with the /live link, scheduled start, Low latency, a thumbnail from the first game's Vault cover (a default card for backstage). Public events show as Upcoming so subscribers can tap Notify me. |
| Published stream edited, then republished | Updates title, start and thumbnail. |
| Delayed | Moves the scheduled start (immediately, like the delay itself). |
| Cancelled | Deletes the event (it never went live). |

The YouTube event IDs live in `streams/{id}/private/watch` (with `provider: "youtube"`); the video ID is only handed out by `backstageWatch` to the stream's audience.

**UI**
- A chip on each plan card and the public-facing card state: **"YouTube ✓"** when the event is in sync, **"YouTube failed · Retry"** when the last sync failed (Retry calls the sync again).
- The **publish dialog** shows the event count ("5 YouTube events will be created") next to the unfinished list.
- **Connect YouTube** on /admin shows connected / not connected and the app status.

**Staging rule (always):** on staging every event is created **Private** with "[STAGING]" at the start of its title; a **cleanup script** (`functions/scripts/youtube-cleanup.js`; it reads the client secret itself from Secret Manager with your Application Default Credentials, so nothing goes in the environment, staging only, dry run first) deletes them. Only production creates public and unlisted events.

**Things to know**
- **Google's 7-day trap:** an OAuth app left in Testing loses its refresh token every 7 days. The app is set to **In production**; as its only user the owner clicks through the "unverified app" warning once (verify).
- **Quota:** create, update and thumbnail cost about 50 units each (verify); a 7-stream week stays well under 1,000 of the 10,000 daily units.
- **Fallbacks:** events made by hand in YouTube Studio are found at Start; a Paste link field is always on the controls; an event deleted by hand is recreated at the next sync, with a warning.
- **Later switch:** `private/watch.provider` can become `cloudflare` (Cloudflare Stream Live with signed playback) if paid Sub Club content ever needs real protection.

**Parts:** one commit with a CHANGELOG line; `check-youtube.js` for the pure parts (event bodies, what changed, staging title rule) in `npm run check`; staging deploy.
