# Spec: Control Room — CONFIRMED (2026-10-08)

ROADMAP workstream 5 (Live Beacon and Control Room). Builds on `stream-object.md`, `scream-planner.md`,
`game-vault.md`, `boom-alerts.md`, `mod-machina.md`, `rewards.md` (Trophy Room) and `fun-factory.md`
(Night Shift). Approved mockups: `docs/design/mockups/control-room-batch-1.html` to `-batch-4.html` and
`control-room-review.html` (every pick, with the look switch). Web search wasn't available in the chat that
wrote this spec, so prices and API limits marked **(verify)** come from memory as of mid-2026 and must be
checked during the build.

## 1. Summary

The Control Room runs every stream. The owner plays the Scream Planner's stream objects from his controls,
four beats (Start, Break 1, Break 2, End) give each stream its shape, and /live shows everyone, including the
stream itself, what's happening. It is the flagship page: the bar is above the Game Vault and the Boom Arcade
How it works page. The look is a ship's bridge on a derelict vessel: horror first, never clean sci-fi.

Decided (Oct 8, 2026):

1. Name: **Control Room**.
2. Check-ins: one window per beat, opened with a word the owner says on stream. The rolling 15-minute code
   (Night Shift §13b) is dropped. Passive Twitch presence still counts for stream streaks.
3. Crew: the Stream Captain runs Chat Games, any mod on duty moderates, only the owner and admins
   (A2+) control the stream.
4. Backstage: its own stream (as planned) or a members-only after-show handed over at End. No second video
   output during public streams.
5. Questions: one queue with two lanes, Standing (open any time) and Tonight (live only); a question is
   never in both. A Questions session works Tonight first, then Standing.
6. Hot Seat: three players picked, answers typed on /live, everyone checked in votes.
7. The owner's setup: Streamlabs Desktop to Twitch and YouTube (YouTube Vertical through Streamlabs Dual
   Output); TikTok LIVE Studio to TikTok; Stream Deck software on a dedicated iPad (hardware Deck later).

Out of scope: the Chat Games formats (workstream 5b, formerly Mod Machina phase 4), Contests (ws 12), the Stream Library pages
(ws 6), connecting the Twitch broadcaster token (planned for here behind a switch).

## 2. Pages and who sees what

Everything lives under /live; boomertanger.live redirects to /live. /live joins the header's Watch group in
`site/src/lib/nav.js` with a one-line blurb, and its nav tile shows the live state. Every page carries the
CONTROL ROOM wordmark in the kit's feature bar (section 7c).

| URL | Who | What |
| --- | --- | --- |
| /live | Everyone | The public live page (section 7). Off air it is the waiting room for the next stream. |
| /live/control | Owner and A2 Overseer and up | Controls, beats, launch panel, Scene card, Stream Deck card, Flag to owner inbox. A1 Steward can't open it (same safety net as the Planner's delay and cancel). |
| /live/control (checklist rail) | Owner only | The private checklist (section 5). Admins never see it, not even an empty slot. |
| /live/control/checklist | Owner only | Edit the four beat templates. |
| /live/deck | Crew on duty, the owner | The Mod Deck (Mod Machina §8, unchanged) plus the Captain's launch panel. |
| /live/obs?k=… | Streamlabs and TikTok LIVE Studio browser sources | The stream view (section 8). The private key is required because the scene shows the check-in word. |
| /live/questions | Everyone reads; members post and vote | The question queue (section 9). |

| Action | Visitors | Members | Mods on duty | Captain | Admins (A2+) | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| Watch /live, see stats and crew | Yes | Yes | Yes | Yes | Yes | Yes |
| Watch backstage video | No (Join free) | The stream's audience (Fan Club now, Sub Club later) | Yes | Yes | Yes | Yes |
| Check in, post and vote on questions, play Hot Seat | Join free | Yes | Yes (no prizes, per Mod Machina) | Yes | Yes | No |
| Moderate questions and Hot Seat answers | No | No | Yes | Yes | Yes | Yes |
| Start and end Questions, Hot Seat, Chat Games | No | No | No | Yes | Yes | Yes |
| Start, stop, switch games, beats, delay, cancel, after-show | No | No | No | No | Yes | Yes |
| Private checklist | No | No | No | No | No | Yes |

Every check is shown in the page and enforced again in Cloud Functions and Firestore rules.

## 3. Stream controls

The controls move a stream through the stream object's states with the callables that spec reserved for this
workstream: `startStream`, `switchGame`, `stopStream`. Delay and cancel reuse the Planner's `delayStream` and
`cancelStream`.

1. **Pick today's stream.** /live/control opens on `scheduled` streams whose planned start is within 12 hours
   of now, the next one first, with readiness chips (YouTube event ready, crew seats, open seats, check-in
   words ready). **Start an unscheduled stream** asks for a title, type (platform or backstage), rooms,
   audience and a first game, and creates the stream already live with `adhoc: true`.
   *Unscheduled streams are two steps (owner decision, Oct 8):* `createAdhocStream` makes a stream that starts now but is not live yet (state `scheduled`, `adhoc: true`, `published: true`, planned end +3 h or the form's length, in this week's week id), so `youtubeSync` creates its YouTube event at once and the owner can pick it in Streamlabs before going live. He then presses Start like for any planned stream (`startStream {streamId}`). `startStream` refuses an `adhoc` argument (reason `args`): there is one way in, so an event can never be made twice. Until it is live, Delay and Cancel work on it too: the Planner's `delayStream` and `cancelStream` act on the public stream doc directly when a stream is `adhoc` and has no planner draft (same owner and A2+ check, overlap refusal, `stream-delayed` / `stream-cancelled` alerts and activity, adminLog). `youtubeSync` moves or deletes its event; a cancelled one stays as a record. On /schedule it shows as a ticket starting now.
2. **Before Start.** Running late is one tap: +5, +10, +15, +30 minutes or a custom time (`delayStream`;
   Boom Alerts sends `stream-delayed`; the YouTube event moves). Cancel asks for a reason in `confirmAction`
   (`cancelStream`). Neither is red: nothing is destroyed.
3. **Start.** A confirm dialog checks each platform as it comes up (Twitch from the API, the YouTube event,
   the vertical broadcast found, a TikTok switch). `startStream` records `actualStart`, opens the first
   game's segment, sets the site's live state (`public` or `backstage`), writes `stream-live` or
   `backstage-live` to `notifyOutbox`, posts the activity event, copies the checklist templates and begins
   the Start beat. A short "WE'RE LIVE" power-up plays on the controls. While the dialog is open it asks
   `livePlatformStatus {streamId}` every 5 s (owner and A2+, no writes, never an id or token): Twitch live, the YouTube event live,
   the vertical broadcast active. **The TikTok switch** is the stream's `liveRooms` (callable `liveRoom {streamId?, room: "tiktok", on}`, owner and A2+,
   platform streams, adminLog `room`): the Start dialog's switch is ON when TikTok is a planned chat and OFF otherwise; the owner's final choice is written with `liveRoom` right before `startStream`, which keeps it (called without a choice, Start goes live without TikTok). /live (`public/live.liveRooms`) and the stream view follow it.
4. **Switch game.** Tonight's planned games first, then a Game Vault search. `switchGame` closes the open
   segment and opens the next. A game not in the Vault can be added as a wishlist entry in the same step.
5. **Beats.** Four stations: Start, Break 1, Break 2, End. Each beat changes the stream view's scene (when the
   Scene card is on Auto), shows that beat's checklist and enables Open check-in (section 4). Break 1 and
   Break 2 open a `break` segment; **Back to the game** closes it. A beat can be skipped and nothing is lost.
6. **After-show** (End beat, platform streams only). `stopStream` ends the public stream; a linked backstage
   stream starts with `adhoc: true`, `afterShowOf: <id>`, audience Fan Club, live state `backstage`; its
   unlisted YouTube event is created; `backstage-live` goes to the outbox. A card shows the Streamlabs steps.
7. **Stop.** `confirmAction` (primary, not red). Closes the open segment, check-in window, activities and live
   drops, records `actualEnd`, computes planned-game outcomes, turns the live state off. Then the **Stream
   wrap-up** celebration: duration, peak, check-ins by beat, games timeline, questions answered, and anything
   left unticked on the checklist.

The controls show what the platforms report: a gold banner if Start was pressed but Twitch says offline for
3 minutes; if Twitch drops mid-stream, a banner asks Stop or wait (a crash and restart must not end the
stream). The existing 12-hour auto-end stays, with a correction offered next time the controls open.

**Scene card.** Auto (follows the beat) or a pinned scene: Starting soon, Live stats, Break, Be right back
(with a timer), Ending. The stream view follows within a second. Streamlabs' own scenes (camera and game
layout) are separate: in v1 the owner switches them with a Streamlabs hotkey or a Stream Deck Multi Action.
Later: **Connect Streamlabs** through Streamlabs Desktop's local remote-control API (verify the API, its
token and that the browser allows the local connection).

**Stream Deck card.** Every control as a one-tap URL for a web-request key (a plugin such as API Ninja or
Web Requests; verify). Each request carries the owner's deck key: generated on the card, shown once with copy
buttons, stored only as a hash in `live/main`, rotatable, never pasted in chat. HTTPS function `liveDeck`
checks the key, rate-limits, runs the same server logic as the buttons and writes adminLog with actor
"Stream Deck". Actions: begin next beat, open check-in, +1 minute, close check-in, scene (Auto, Be right
back, Ending), next planned game, start or end Questions, answered, skip, start Hot Seat, spin, next step,
drop the preset badge. Start and Stop stay on the controls page (a key can't confirm). A Multi Action can
chain the Streamlabs plugin with these URLs (one Break 1 key: switch the Streamlabs scene, begin Break 1, open
check-in). Key titles that show live state are a later step.

## 4. Beats and check-ins

Each beat can open one check-in window, so a stream has up to four. Members **check in**; crew **clock in**
for their shift in the Mod Deck (Mod Machina).

**The window.** The owner presses **Open check-in** when ready to talk to chat. The server picks the beat's
word from a curated horror word list (no repeats within 30 days) and shows it on the controls and big on the
stream view (it scrambles, then settles). It is never sent to the public page. Length per beat in the
templates: 2, 3, 5 or 10 minutes (default 5). The server accepts check-ins until close plus 30 seconds of
grace (YouTube runs about 15 to 20 seconds behind on normal latency; Twitch low latency about 2 to 5) (verify).
+1 minute and Close now on the controls; opening the next beat closes any open window. A window can be **reopened once** per beat (after Close now or after it ran out, while the beat is still running): same word, so earlier check-ins stay valid, with the time that was left when it closed or 2 minutes if less; a second reopen is refused. Answers ignore case, spaces, punctuation and accents ("séance" = "seance"); no fuzzy matching. **Beats in order:** Start, Break 1, Break 2, End. End can begin from any beat and marks any break not yet begun as skipped; the other beats stay in strict order.

**Checking in (members).** While a window is open a red **live banner** drops in under the header on every
page (`.bt-live-banner`: "Check-in is open · Break 1 · 4:31 left · Check in"). Check in opens a dialog (a
bottom sheet on phones): type the word, confirm where you're watching (Twitch, YouTube, YouTube Vertical,
TikTok, or On the site for backstage; defaults to the last one). Stored room names are always `twitch`, `ytLandscape`, `ytVertical`, `tiktok`, `site`; the links and the callable also accept the aliases `youtube` and `ytv` and convert them at the edge (`normaliseRoom`). Room Leads post a room link
(`/live?room=ytv`, converted to `ytVertical`) instead of a code, which keeps Scream Off scoring by room. 5 wrong tries per beat, then
that beat locks for that member (a mod or the Captain can unlock). Visitors get Join free (the Join dialog
titled "Join to check in"). Success: the stamp slams on, +10 XP, stream streak and beats-so-far chips, the
banner turns green ("You're in for Break 1"), the count ticks up, and the first three of each beat are named
on the stream view ("First in"). A missed window is missed; passive Twitch presence still keeps the streak.

**Crew.** A mod clocked in when a window opens is counted present for that beat automatically, no word, no
check-in XP; the room comes from the seat.

**Wording.** Members: Check in. Crew: Clock in. Night Shift's daily button is renamed **Punch the clock** (its
internal name), so "Clock in" means crew duty everywhere.

**Backstage streams** have beats and check-ins too; the room is always On the site.

## 5. The owner's private checklist

Four templates, one per beat, edited at /live/control/checklist; every stream gets a fresh copy at Start and
remembers what was ticked. Only the owner's uid can read or write either (rules, not just hidden).

- Items: text (up to 120 characters), optional note, optional "only on platform streams" / "only on
  backstage", optional shortcut that runs a control (Open check-in, Start Questions, Start Hot Seat, Drop a
  badge, Copy socials). Drag to reorder.
- On the controls: the rail pinned on the left (layout A Cockpit). The current beat is open, others fold to
  a progress chip ("Break 1 · 3 of 5"). Ticking saves at once with a small pop; a shortcut item ticks itself
  when its control is used.
- Wrap-up lists anything unticked. Template edits only affect streams started afterwards; editing the live
  copy doesn't touch the templates.
- Starter templates: Start (welcome chat by room, say the word and open check-in, tonight's games, socials,
  point to the queue); Break 1 (check-in, Questions 8 minutes, hydrate, shout out first-ins); Break 2
  (check-in, Hot Seat 2 rounds, plug the schedule); End (check-in, thank the crew by name, next stream,
  after-show or goodbye).

## 6. Presence and privacy

Enough to reward people and keep streaks fair, nothing that feels like being watched. Members see their own
record on /account ("What we recorded for this stream").

| Recorded, per stream and member | Never recorded |
| --- | --- |
| Which beats they checked in to, and the room | Chat text, on any platform |
| Twitch chat presence in 5-minute buckets (Get Chatters, once the broadcaster token is connected) | Exact times finer than the beat or bucket |
| Live drops claimed | Whether the tab was open, focused or visible |
| Which activities they took part in (asked, voted, played) | IP addresses or device details |
| Crew: clock-in and clock-out times (Mod Machina) | How long anyone watched the video, including backstage |

A stream counts for the stream streak when the member checked in to at least one beat, was seen in Twitch chat
for at least 15 minutes, or claimed a live drop (Night Shift §13b minus the rolling code). Per-stream details
expire after 13 months (TTL); totals stay on the profile; account deletion removes them (ws 2b). Crew activity
is only what Mod Machina defines (the 20-minute quiet nudge goes to the Captain, never the mod).

## 7. The public live page (/live)

A tool page with story-page craft. It reads one public document (`public/live`).

### 7a. Layout and states (mockup batch 1, layout 1 Bridge)

The video in a ship's **viewport** frame with a console column beside it (live readouts, then check-in, then
crew on duty and Watch on), the beat rail under the viewport, Now playing and the Play panel below. Phones:
one column in this order: video, beats, check-in, Play panel, Now playing, crew, readouts, Watch on.

| State | What shows |
| --- | --- |
| Off air | The waiting room (story frame): `.bt-toc` rail, hero with a scene and the mascot, countdown, the next stream's ticket (games, platforms, Captain, Remind me), ghost-numbered chapters (How a stream runs as a four-stage journey line; Check in at every beat with a working practice check-in, word "lantern"; Ask before the doors open with the Standing questions; Ask BOOMBOT), closing call to action. |
| Starting soon | From 15 minutes before the planned start, or while delayed: the same frame with "Starting soon" and the countdown. |
| Live (public) | The Bridge layout. Beacon and mascot red. |
| Break | The live layout with the open check-in (marching edges, countdown ring, live count, First in) and the running activity. |
| Live (backstage) | The unlisted YouTube player for the audience with YouTube's chat beside it; others see the velvet curtain gate with Join free. Beacon and mascot green. The page title reads "After-show". |
| Just ended | For 2 hours: the wrap-up with confetti (duration, peak, check-ins, questions answered, the games timeline, the Hot Seat champion, the next stream). |

### 7b. Live content

| Block | Shows | Source |
| --- | --- | --- |
| Live readouts | Uptime, check-ins tonight, watching (total and per platform as fuel cells), peak, time on this game | `public/live` |
| Beat rail | Four stations: done, now (pulsing double ripple), next; a light runs along the finished line | `public/live` |
| Check in | Closed: when the next one opens. Open: the form. Your four stamps | `public/live` + your presence |
| Now playing | Vault cover, Boomer's score, tonight's time, streams, all-time; Up next | Game Vault + segments |
| Crew on duty | Hull look: the **deck plan** (Bridge with the Captain, one compartment per room, lit and pinging when crewed, gold "Lead needed" when open). Base look: a list | Stream crew + clock-ins |
| Play panel | The running activity (Questions, Hot Seat, a Chat Game), otherwise the next questions | Chat Games |
| Watch on | One button per platform live, with its viewers | Stream rooms |
| Video | Public streams: the Twitch player. Backstage: the unlisted YouTube player for the audience | Section 11 |

Later, from data the site already has: stream streak leaders, Body Count counters while that game runs,
Recruit Rush and Beat Goal bars. New followers and subs once the broadcaster token is connected.

### 7c. Wordmark and looks

**Wordmark.** CONTROL + accent ROOM on `.bt-wordmark--power` in a `.bt-topbar`, with a radar-scope icon
(sweeps while live, blip in the live colour, faster on hover; still under reduced motion). Top nav: Live,
Questions, How it works (and Controls, Mod Deck, Checklist templates for the owner). The gold page title shows
the stream's own title ("MONSTER MONDAY").

**Looks (reskins).** The Control Room pages ship with switchable looks sharing one set of markup and data:

- **Hull map** (mockup 1C+, Mk II): panels on a blueprint grid with blue corner brackets; lit section headers
  (an animated icon tile, a blinking status light, red and fast while a check-in is open, and a gold scan line
  along the header's edge); amber readouts with faint ghost digits and an amber flash on change; viewers as
  fuel cells; pulsing beat circles; a breathing targeting frame on the viewport; marching edges on an open
  check-in; the deck plan.
- **CRT** (mockup 1D): futuristic 80s bubble monitors: thick bezels, curved glass with scanlines and a
  reflection, amber phosphor numbers, power lights on headers, the video on a TV with its control strip, a
  pink horizon grid scrolling under the page, and screens switching on with the CRT line on state changes.

The owner picks the **house look** on /live/control (`live/main.look`); /live, the Mod Deck and the stream
view follow it. A look is `data-look="hull" | "crt"` on the page root plus one CSS block in the feature
stylesheet. It may restyle surfaces, frames, motion and decoration; never colour meaning, the heading ladder
or what's clickable. New looks (seasonal, Halloween) can be added later without touching the pages. Later,
members may pick their own look on /live (stored per viewer). The check-in banner and dialog are site-wide kit
pieces and look the same in every look.

## 8. Stream view (Streamlabs and TikTok LIVE Studio)

- **URLs:** `/live/obs?k=<key>&layout=wide` (1920×1080, Streamlabs for Twitch and YouTube) and
  `&layout=tall` (1080×1920, Streamlabs Dual Output's vertical canvas for YouTube Vertical, and TikTok LIVE
  Studio; verify it accepts a browser or link source).
- **The key:** generated on /live/control, shown once with a copy button, stored only as a hash, rotatable.
  Without a valid key the page shows nothing.
- **Scenes:** Starting soon (countdown, games, crew, a ticker), Live stats (a corner panel and a beat rail,
  the rest transparent), Break (**B1 Takeover**: a framed camera window on the left, the word, countdown ring,
  live counter by room and First in on the right; Questions and Hot Seat take over the same panel), Be right
  back (timer and a Standing question), Ending (thanks, stats, the crew by name, next stream). **B2 Side
  rail** (game stays on screen, a rail with the word and counter, Questions as a lower third) is kept as a
  manual scene. Tall versions stack the same content; nothing essential under the platforms' buttons,
  captions or top bar.
- **Readable on stream:** text at least 32 px at 1080p, high contrast on a transparent background. Motion
  stays on (it's video); nothing flashes faster than 3 times a second.
- The view shows nothing beyond handles that are already public.

## 9. Launch panel and Chat Games

The Control Room owns the launch panel; the activities run in one **Chat Games** engine (Questions and every game),
specified in `docs/specs/chat-games.md` (next spec) and built after the Control Room core.
Contests stay ws 12 and plug in later.

Note (Oct 9, 2026): the service is named Chat Games (the working name "Chat Games" is retired). One engine; members see "Questions" and "Chat Games" (Hot Seat and the rest are Chat Games). Crew-hosted games need the Mod Deck, so they come last. ROADMAP 5b has the order; `mod-machina.md` section 11 keeps the game designs.

**Launch panel** (on /live/control, and for the Captain in the Mod Deck): Questions, Hot Seat, tonight's
planned Chat Game, the quick Chat Games, Drop a badge, Recruit Rush. One activity is on stream at a time; the
running tile is marked.

**Questions** (settled here, built in Chat Games): /live/questions with Tonight and Standing lanes,
sorted Top or New. Up to 200 characters, at most 3 open per member, one vote each (can be taken back).
Accounts under 7 days are held for a mod; others post at once behind a word filter. Cards show asker is here,
On air, Pinned next, Answered on stream with the time. At Stop, Tonight questions with 5+ votes move to
Standing; the rest clear; Standing questions unanswered for 30 days are archived. Mods: Approve, Hide, To
Standing, Merge (votes fold into the original, voters counted once); every action logged. Sessions default
to 10 minutes on a visible timer, Tonight first; Answered, Skip, Pin next.

**Hot Seat** (settled here, built in Chat Games): run by the owner or the Captain. Draw a card (the
owner writes the deck; mods suggest cards for approval) → the picker chooses three from members checked in
this beat plus volunteers, nobody twice in a stream → each has 15 seconds to tap I'm in → 60 seconds to type
an answer (140 characters; a mod can hide one before reveal) → everyone checked in votes for 30 seconds (not
for themselves) → the winner (+25 XP; others +5; a tie means both win). Picker styles: **W2 Séance board**
(default: a planchette glides over a board of names with YES, NO and GOODBYE and stops on each player) and
**W1 Wheel** (selectable per round; it lands on each pick).

Ranked for later (Chat Games spec): Scream-o-meter, Predictions (free picks), next-game vote, Polls,
Last Words, Beat Goal, Clip it! (with the Stream Library). Twitch's Polls and Predictions only reach Twitch
viewers, which is why these run on the site. Scare Bingo and Body Count are already Chat Games.

## 10. Live data, APIs and real-time cost

Firestore listeners are enough at a few hundred viewers: roughly $3 to $5 a month at 20 streams
(approximate; verify current prices). No Realtime Database or Durable Objects.

| Data | Source | Needs |
| --- | --- | --- |
| Twitch live, viewers, start time | Helix Get Streams every minute, plus EventSub `stream.online` / `stream.offline` | The existing app token |
| Twitch chatters (presence) | Get Chatters every 5 minutes | Broadcaster token with `moderator:read:chatters` (switch `live/main.twitchPresence`, off until connected) |
| Twitch followers, subs, bits tonight | EventSub | Broadcaster token (later) |
| YouTube live viewers (landscape and vertical) | `videos.list` with `liveStreamingDetails` every minute, about 1 quota unit (verify) | The video IDs from the events the site created (section 11) |
| TikTok live and viewers | No public API known (verify) | A TikTok switch on the controls; the TikTok Room Lead types the viewer count in the Deck |

Flow: check-ins and votes go through callables that write only the member's own document; a trigger adds to a
10-shard counter (the controls and the stream view listen to the shards); a debounced task folds counts into
`public/live` at most every 3 seconds; `liveTick` runs every minute while live (viewers, peak, platform
status) and does nothing otherwise; uptime is computed in the browser. Estimate at 300 viewers: about 250,000
reads per stream.

## 11. YouTube events and backstage video

Backstage runs on **unlisted YouTube**. Decided Oct 8: YouTube costs nothing at any audience size (Cloudflare
Stream would be about $360 a month with 1,000 members watching 4 shows); a shared link is accepted as free
advertising; /live still shows the player only to the stream's audience, so signing up stays the way in.

The site creates every YouTube event, so in Streamlabs the owner only picks it from the list. This is built
as **Scream Planner part 8, YouTube events**, before the Control Room, because publish, edits, delay and
cancel start in the Planner; the Control Room uses the same module for ad hoc streams, after-shows and Start.

| When | What the site does on YouTube |
| --- | --- |
| Week published | One event per stream: public for platform streams, unlisted for backstage. Title, a description with the /live link, scheduled start, Low latency, a thumbnail from the first game's Vault cover (a default card for backstage). Public events show as Upcoming, so subscribers can tap Notify me. |
| Published stream edited, then republished | Updates title, start and thumbnail. |
| Delayed | Moves the scheduled start. |
| Cancelled | Deletes the event (it never went live). |
| Ad hoc stream or after-show | Creates the event at once (it appears in Streamlabs' list after a refresh). |
| Start | Checks the event went live, finds the vertical broadcast Streamlabs Dual Output made, stores both IDs; until then "Waiting for YouTube…" retries every 15 seconds. |
| 7 days after a backstage stream | Sets the unlisted video to private (setting, on by default). |

- **Connect YouTube:** once, on /admin (the Connect TikTok pattern). Google sign-in with `youtube.force-ssl`.
  Token server-only at `sites/boomertanger/private/youtubeChannel`. The owner sets `YOUTUBE_CLIENT_ID` and
  `YOUTUBE_CLIENT_SECRET` himself.
- **Google's 7-day trap:** an OAuth app left in Testing loses its refresh token every 7 days. The app is set to
  In production; as its only user the owner clicks through the "unverified app" warning once (verify).
- **In Streamlabs:** picking the event connects the stream to it (confirmed Oct 8). Only one event can be
  picked; with Dual Output on, Streamlabs creates the vertical broadcast itself.
- **Quota:** create, update and thumbnail cost about 50 units each (verify); a 7-stream week stays well under
  1,000 of the 10,000 daily units.
- **Fallbacks:** events made by hand in YouTube Studio are found at Start; a Paste link field is always on the
  controls; an event deleted by hand is recreated at the next sync, with a warning on the controls.
- **Staging safety:** on staging every event is created **Private** with "[STAGING]" at the start of its
  title, and a cleanup script deletes them. Only production creates public and unlisted events.
- **Watching backstage:** `backstageWatch` returns the video ID only to the stream's audience.
- **After-show in Streamlabs:** stop, turn off Twitch and the vertical output, pick the new event, go live
  (about a minute's gap); TikTok LIVE Studio is ended separately. Phone viewers get the landscape picture.
- **Later switch:** `private/watch` stores `provider: "youtube"`; `cloudflare` (Cloudflare Stream Live with
  signed playback) is a setting plus one build part if paid Sub Club content ever needs real protection.

## 12. Points, Night Shift and Trophy Room hooks

No new currency. Every reward goes through the Trophy Room's `grant()` and its ledger, each grant keyed (e.g.
`{streamId}:beat2:{uid}:checkin`) so an action can never pay twice. XP for members, Gears for crew.
Predictions cost nothing to enter (members can be 13; no wagering).

| Event (Night Shift key) | Who | Pays (starting values, tunable in `live/main`) |
| --- | --- | --- |
| `stream-checkin` | Member, per beat | 10 XP |
| `stream-all-beats` | Member who checked in to every beat held (a beat is held when it began and a check-in window was opened for it; skipped beats and beats with no window don't count; at least one beat held) | 15 XP bonus |
| `stream-present` | Anyone counted present (check-in, 15 min in Twitch chat, or a drop) | Stream streak and the Loyalty ladder |
| `question-answered` | The asker | 15 XP |
| `hotseat-played` / `hotseat-won` | Players | 5 XP / 25 XP |
| `first-in` | First three per beat | Toward a future badge, no XP |
| Hosting Questions or Hot Seat | Captain | Gears, as Mod Machina pays for hosting Chat Games |
| Duty | Mods clocked in | Gears per hour (unchanged); present for streaks; no check-in XP |

Cap: 100 XP per member per stream from the Control Room and Chat Games together. Badge hooks (Stream
Moments and Loyalty): All Four Beats, Hot Seat Champion (1, 5, 25 wins), First In (10 times), Question of the
Night. This workstream fires the events; the badge editor adds the badges.

## 13. Data model

All under `sites/boomertanger/`. No client writes anywhere; every write goes through a Cloud Function.

| Path | Read by | Holds |
| --- | --- | --- |
| `streams/{id}` (existing) | As `stream-object.md` | Adds `beats { start, break1, break2, end: { startedAt, endedAt, skipped?, checkins } }`, `afterShowOf`, `afterShowId`, `liveRooms[]`, `stats` per platform (`peak`, `avg`, already reserved) |
| `streams/{id}/presence/{uid}` | That member, admins | `beats { start: { room, at } … }`, `twitchBuckets`, `drops[]`, `crew`, `activities { asked, voted, played }`, `expireAt` (13 months) |
| `streams/{id}/counters/{0-9}` | Owner, A2+, the stream view (via its key, through `obsFeed`) | Check-in counts per beat and room |
| `streams/{id}/private/control` | Owner, A2+ | Current word per beat, window `opensAt` / `closesAt`, the TikTok viewer entry, the pinned scene |
| `streams/{id}/private/checklist` | Owner only | Copied items and ticks per beat |
| `streams/{id}/private/watch` (existing) | Server; via callable | `provider`, the YouTube event IDs (landscape, vertical, backstage) and their status |
| `live/main` | Owner, A2+ | Settings: window defaults, grace, XP values, word list, `look`, `obsKeyHash`, `deckKeyHash`, `twitchPresence`, `makeBackstagePrivateAfterDays` |
| `live/main/private/checklistTemplates` | Owner only | The four beat templates |
| `private/youtubeChannel` | Server only | The YouTube OAuth tokens and the channel id |
| `public/live` | Everyone | State, stream id and title, `actualStart`, current beat, window `{ open, closesAt }`, counts, viewers per platform and peak, current and next game, crew on duty, the running activity, `look`, `updatedAt` |

Questions and Hot Seat data (`live/main/questions`, `hotSeatDecks`, `streams/{id}/hotseat/{round}`) are
defined in the Chat Games spec.

## 14. Functions

JavaScript in `functions/lib/live/*.js` and `functions/lib/youtube/*.js`, reusing
`functions/lib/streams/logic.js` for every transition.

| Function | Kind | Does |
| --- | --- | --- |
| `live/logic.js` | Pure | Beat order and skips, window open and close with grace, word picking without repeats, check-in validation, the XP cap, the debounce rule. Checked by `scripts/check-live.js` in `npm run check` |
| `startStream`, `switchGame`, `stopStream` | Callables (owner, A2+) | Section 3 |
| `liveBeat`, `liveCheckInWindow`, `liveScene` | Callables (owner, A2+) | Begin or skip a beat; open, extend or close a window; pin or release a scene |
| `liveAfterShow` | Callable (owner, A2+) | Stop and start the linked backstage stream |
| `liveChecklist` | Callable (owner only) | Save templates, tick items |
| `liveObsKey`, `liveDeckKey` | Callables (owner) | Generate or rotate the stream view key and the deck key |
| `streamCheckIn(word, room)` | Callable (members) | Validate, write presence, rate-limit wrong tries, grant XP |
| `liveUnlock` | Callable (crew on duty, Captain) | Unlock a member locked out of a beat |
| `liveViewerEntry` | Callable (crew on duty) | The TikTok Room Lead's viewer count |
| `backstageWatch` | Callable (audience) | The YouTube video ID, for the stream's audience only |
| `obsFeed` | HTTPS | The stream view's data for a valid key (the word included) |
| `liveDeck` | HTTPS | Stream Deck actions for a valid deck key |
| `onCheckInWritten` | Trigger | Shard counters, queue the debounced flush |
| `liveFlush` | Cloud Tasks | Fold counts into `public/live` (at most every 3 s) |
| `liveTick` | Every minute | Platform viewers and status while live; nothing otherwise |
| `twitchEventSub` | HTTPS | `stream.online` and `stream.offline`, signature checked |
| `youtubeConnect` | HTTPS | The Google sign-in callback (Scream Planner part 8) |
| `youtubeSync` | Trigger | Create, update or delete events on publish, edits, delay, cancel, ad hoc streams and after-shows (part 8) |
| `youtubeTidy` | Daily | Make backstage videos private after the set days (part 8) |

Every control writes adminLog (feature `controlRoom`); public changes write activityLog (`stream-live`,
`stream-ended`, `after-show`).

## 15. bt-ui components

**Reused:** `.bt-topbar`, `.bt-wordmark--power`, `.bt-beacon`, `.bt-mascot--aware`, `.bt-live-tag`,
`.bt-hero-player`, `.bt-mini-cd`, `.bt-plats`, `.bt-velvet`, `.bt-theme`, `.bt-smap` / `.bt-sbox`, `.bt-grade`,
`.bt-cover`, `.bt-score`, `.bt-meter`, `.bt-medal`, `.bt-boombot`, `.bt-chat`, `.bt-toc`, `.bt-chapter--ghost`,
`.bt-toast`, `.bt-pills`, `.bt-switch`, `.bt-page-tabs`, `.bt-board`, the members-only gate, `openModal()`,
`confirmAction()`, the `bt:overlay-open` event.

**New, for `shared/bt-ui.css` and the UI kit page** (names checked against the kit before adding):
`.bt-readout` (live stat with tick animation and ghost digits in the hull look), `.bt-beats` (four-station
beat tracker), `.bt-checkin` (word entry, countdown ring, room picker, stamps), `.bt-live-banner` (site-wide
check-in banner), `.bt-launch` (launch panel tiles: idle, running, unavailable), the checklist rows
(`.bt-task-row` if it fits, otherwise `.bt-checklist`), `.bt-deckplan` (crew compartments), `.bt-qcard`
(question card), `.bt-seance` and `.bt-wheel` (Hot Seat pickers), `.bt-streamview` (fixed-size wide and tall
frames and scenes), and the look blocks (`[data-look="hull"]`, `[data-look="crt"]`).

Colour meaning holds: purple clickable, gold headings and "needed", red only for the live tag, beacon and the
open check-in (the existing live exception), green backstage and staff. Container queries only; reduced
motion keeps colour and glow and drops movement on the site (not in the stream view).

## 16. Edge cases

- Streamlabs or the PC crashes: nothing ends until the 12-hour auto-end; the controls ask Stop or wait.
- Start pressed twice or on two devices: refused if already live; the second device shows the live controls.
- Two streams live at once: refused, except the after-show handover, which ends the first in the same step.
- The word leaks: accepted risk (short window, a new word every beat).
- A member checks in from two devices: a friendly "Already checked in".
- 300 check-ins in a minute: per-member documents, sharded counters, debounced flush.
- Window open at Stop: closed; the grace period still applies.
- No breaks: skipped beats cost nothing; "all beats" means every beat held.
- Hot Seat with fewer than three eligible: runs with two or asks for volunteers; with one, "Not enough
  players yet". A picked player who doesn't accept in 15 seconds is replaced.
- A YouTube event deleted by hand: recreated at the next sync with a warning.
- Staging: live states, alerts and XP work with test streams; Boom Alerts' staging block keeps real texts
  from going out; YouTube events are Private and "[STAGING]".

## 17. Changes to other specs

| Spec | Change |
| --- | --- |
| `fun-factory.md` §13b (Night Shift) | Beat check-ins with a spoken word replace the rolling 15-minute code; presence keeps Twitch chat and drops. The daily button is renamed Punch the clock. |
| `mod-machina.md` §8, §11h | Room Leads post a room link, not a per-room code; Scream Off scores rooms by self-reported room; the Captain's launch panel joins the Mod Deck; the Captain can unlock a locked-out member. |
| `scream-planner.md` §4, §6 and a new part 8 | `private/watch` holds the YouTube event IDs; publish, edits, delay and cancel also sync the YouTube events; a "YouTube ✓" / "YouTube failed · Retry" chip on each card and the event count in the publish dialog. |
| `stream-object.md` §3 | New fields `beats`, `afterShowOf`, `afterShowId`, `liveRooms[]`. |
| `boom-alerts.md` §3 | An after-show sends `backstage-live` to its audience. |
| `header-nav.md` | /live joins the Watch group with a blurb and a live tile. |
| `design-system.md` §8 | A new "Control Room" subsection: the picks, the looks rule, the planned kit pieces. |
| `docs/ROADMAP.md` | Workstream 5 in progress (spec, mockups, parts); Scream Planner part 8 next; a new entry for the Chat Games service; the launch checklist items below. |

## 18. Parts and phasing

One commit per part, each with a line under Unreleased in CHANGELOG.md; staging first, always.

0. **Scream Planner part 8, YouTube events** (first): `functions/lib/youtube/`, Connect YouTube on /admin,
   `youtubeConnect`, `youtubeSync`, `youtubeTidy`, the Planner chips and publish-dialog count, the staging
   rule and a cleanup script; staging deploy.
1. Docs: this spec, the mockups and the amendments above.
2. Logic: `lib/live/logic.js` and `check-live.js`.
3. Backend wiring: callables, triggers, `liveTick`, `liveFlush`, `obsFeed`, `liveDeck`, `twitchEventSub`,
   rules and indexes; staging deploy (rules, then functions).
4. Kit pieces and the two looks on the UI kit page.
5. /live/control (Cockpit) with the checklist, its editor, the Scene card and the Stream Deck card.
6. /live and the live states across the site (beacon, mascot, footer, nav tile, live banner).
7. Check-ins and presence, with the Night Shift and Trophy Room hooks.
8. The stream view (wide and tall, every scene, both looks).
9. Backstage watching and the after-show.

Then the **Chat Games** spec and build (Questions and Hot Seat first, then the quick formats and the crew-hosted
games once the Mod Deck exists, then the ranked extras). Later: the Twitch broadcaster token (presence, followers, subs,
clips) behind its switch; Connect Streamlabs; Stream Deck key titles with live state; member-chosen looks.

**Before launch (add to the ROADMAP checklist):** the YouTube OAuth app set to In production and production
`YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET`, Connect YouTube in production; a new stream view key and deck
key generated in production; `live/main` seeded in production.

## 19. Confirmed choices (all confirmed Oct 8, 2026, as recommended)

1. URLs: /live, /live/control, /live/control/checklist, /live/deck, /live/obs, /live/questions.
2. Controls for the owner and A2 Overseer and up; A1 Steward can't.
3. Start begins the Start beat; each window opens only when Open check-in is pressed.
4. Window default 5 minutes, 30 seconds of grace, 5 wrong tries per beat.
5. One word per beat; room self-reported; Room Leads post room links.
6. Clocked-in mods are present automatically, with no check-in XP.
7. Night Shift's daily button renamed Punch the clock.
8. Presence recording as in section 6, details kept 13 months.
9. XP values and the 100 XP cap per stream as in section 12.
10. Backstage on unlisted YouTube; Cloudflare Stream a later switch for paid Sub Club content.
11. Questions: 200 characters, 3 open per member, accounts under 7 days held, promote at 5 votes,
    10-minute sessions.
12. Hot Seat: 15 seconds to accept, 60 to answer, 30 to vote, once per stream per player.
13. Chat Games as its own spec and service (Questions and every game), after the Control Room core.
14. A wide and a tall stream view.
15. The Twitch player on /live during public streams.
16. The site creates, moves and deletes YouTube events (Planner and ad hoc), the owner only picks the event
    in Streamlabs.
17. Event thumbnails from the first game's Vault cover; a default card for backstage.
18. Backstage videos made private 7 days after the stream.

Mockup picks: /live layout 1 Bridge; looks Hull map Mk II and CRT (house look switch); controls A Cockpit;
Break scene B1 Takeover (B2 Side rail as a manual scene); Hot Seat picker W2 Séance board (W1 Wheel per
round); the CONTROL ROOM wordmark with the radar icon.
