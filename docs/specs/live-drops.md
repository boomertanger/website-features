# Live drops — spec

**Status:** Built on staging Oct 2026, parts 0-7; real tests pending: docs/testing/live-drops-test-plan.md.

Confirmed Oct 9, 2026 (spec, defaults and mockup picks). Workstream 7 (Trophy Room), built right after Mod Machina phase 3. Extends docs/specs/rewards.md sections 9 and 10a. Mockup: docs/design/mockups/live-drops.html.

## 1. Summary and decisions

During a live stream, the owner or that stream's Captain opens a short claim window for a badge; any signed-in member claims it from a site-wide banner, and the badge is granted through the Trophy Room grant().

Decided before this spec (rewards.md 10a and the Mod Deck build):

1. One drop panel, used in two places: /live/control (owner) and the Mod Deck H1 helm strip ("Drop a badge", replacing the reserved note). It opens on the badge's preset, with chips 1, 3, 5, 10, 15 min and Until stream ends, plus an optional claim cap. While open: countdown, claim count, +1 min, +5 min, Close now.
2. Presets: jump-scare-witness 3 min, glitchwitness 5 min, chosen-one 2 min, boss-fight-believer 10 min, anniversary-ember until the stream ends.
3. Safety: 30-second hidden grace after close; every drop closes at Stop (and at the 12-hour auto-end); timed windows capped at 2 hours; one drop per badge per stream; drops only while live; every drop action in adminLog.
4. Site-wide banner while a window is open; claims through claimDrop, one per member per drop; badges through grantBadge().

Decided Oct 9, 2026:

1. **Who drops:** the owner, or the stream's live Captain (captainNow, seated or acting) while clocked in.
2. **Who claims:** any signed-in member; no check-in needed. Visitors see the banner with Join free.
3. **Recruit Rush:** when the goal is hit, the drop panel shows a one-tap "Rush goal hit: drop <badge>?" prompt. The reward badge is picked when Rush is turned on. Nothing opens automatically.
4. **Self-claims:** the person who opened a drop can't claim it; everyone else signed in can, crew and admins included.
5. **Which badges:** only badges with a drop preset. Each preset carries drop.by ("captain" or "owner"; missing means owner): a Captain sees the captain ones, the owner sees all. awardableBy stays untouched (it controls manual awards). Changed Oct 10, 2026, after the Part 1 check found awardableBy null on all five.
6. **On stream:** the stream view (/live/obs, wide and tall) shows a drop callout while a window is open.
7. **The Chosen One:** a new mode, draw. The window collects entries; after the grace, one winner is picked at random and granted.

Fixes from the read-only check (HEAD 2a66c35): real ids are glitchwitness and chosen-one; anniversary-ember changes from source "stream" to source "drop" (its limited label stays); dropBadge leaves the Chat Games DECK_LATER list; "stream lead" means the Captain everywhere.

Confirmed defaults:

- One drop open at a time per stream.
- Drop badge XP comes from the badge's own xp through grantBadge and doesn't count toward the 100 XP per-stream cap (that cap stays for Control Room XP).
- One "badge-drop" activity entry per drop; no per-member badge-earned entries for drops.
- Close now uses a second tap ("Tap again to close", 3 s), not a dialog.
- dropSweep runs every minute, so a draw's winner shows within about a minute of close.
- A draw excludes members who already hold the badge.

Mockup picks (Oct 9, 2026): drop panel **P1 "One card"**; helm strip tool opens the same panel as a **popover (desktop) / bottom sheet (phone)**, and the button turns into a mini countdown while a drop is open; banner **B1 "Strip"** (gold, in the check-in banner's slot, stacks under it).

## 2. Who can do what

The server checks every row; the client only hides what a person can't use.

| Action | Owner | Live Captain (seated or acting, clocked in) | Other crew / admins | Signed-in member | Visitor |
| --- | --- | --- | --- | --- | --- |
| See the drop panel | /live/control | Mod Deck helm strip | No | No | No |
| Open a drop | Any badge with a preset | Badges with drop.by captain | No | No | No |
| +1 min, +5 min, Close now | Any open drop | Any open drop | No | No | No |
| Open from the Rush prompt | Yes | Yes, if the badge's drop.by is captain | No | No | No |
| See the banner, /live card, stream callout | Yes | Yes | Yes | Yes | Yes |
| Claim or enter | Not their own drop | Not their own drop | Yes | Yes | Join free first |
| Read drops/{id} | Yes | Yes (crew read) | Crew yes | No | No |
| Read own claims/{uid} | Yes | Yes | Yes | Yes | No |

"Owner" is uid = sites/boomertanger.ownerUid on both sides, as in /live/control today. "Live Captain" is captainNow.uid on streams/{id}/private/duty at the moment of the call; if the Captain changes mid-drop, the new Captain can manage the open drop, and the old one can't. A2+ admins on /live/control don't get the panel unless they are the live Captain.

A claim needs a finished signup (a handle). Someone mid-signup sees "Finish joining to claim", which reopens the E1 dialog at their step.

## 3. Data model

All paths sit under sites/boomertanger. Every write goes through Cloud Functions; the browser writes nothing here.

**Badge preset — badges/{badgeId}.drop** (seed: functions/data/trophy-room-badges.json; badgeDoc already copies it through)

- mode: "timed" | "streamEnd" | "draw" ("until" a clock time stays reserved for the badge editor; the panel doesn't offer it)
- minutes: number (timed and draw), cap: number | null, winners: number (draw only, default 1), by: "captain" | "owner" (who may drop it; missing means owner)
- Seed values: jump-scare-witness { timed, 3 }, glitchwitness { timed, 5 }, chosen-one { draw, 2, winners 1 }, boss-fight-believer { timed, 10 }, anniversary-ember { streamEnd } plus source "drop". by: captain for jump-scare-witness, glitchwitness, boss-fight-believer; owner for chosen-one and anniversary-ember.

**drops/{dropId}** — dropId = `<streamId>_<badgeId>`, so a second drop of the same badge in the same stream can't exist.

- streamId, badgeId, name, art, rarity (copied at open, so the banner never needs the catalog)
- mode, minutes, cap | null, winners (draw)
- status: "open" | "closing" | "closed" | "drawn"
- openedAt, closesAt (null for streamEnd), maxClosesAt (openedAt + 2 h), closedAt, graceUntil (closedAt + 30 s), closedBy: "timer" | "cap" | "manual" | "stop" | "autoEnd"
- droppedBy { uid, handle, as: "owner" | "captain" | "acting" }, source: "manual" | "rush"
- extensions: [{ by, minutes, at }] (list, max 20)
- claims: number (from the counter shards, written at close), winnersOut: [{ uid, handle }] (draw)
- Kept as history (no TTL); about 1 kB each.

**drops/{dropId}/claims/{uid}**

- uid, handle, at, kind: "claim" | "entry", inGrace: boolean
- result: "granted" | "already" | "entered" | "won" | "lost"
- Created once in a transaction; that create is the "one per member" lock.

**Counter shards** — drops/{dropId}/shards/{n} { claims }, the same pattern as check-in counts, so a burst of claims doesn't hit one document. A capped drop counts inside the claim transaction on a single counter doc instead, so the cap is exact.

**public/live.drop** (no uids; publishLive and findSecrets cover it)

- id, badgeId, name, art, rarity, mode, state: "open" | "closing" | "drawing" | "closed"
- closesAt | null, untilEnd: boolean, cap | null, claims (refreshed by liveFlush, about every 5 s while open)
- winners: [handle] (draw, after the result), closedAt
- Removed 60 s after closed, or at the next publish after that.

**Existing docs touched**

- streams/{id}/presence/{uid}.drops: +1 on each successful claim or entry (it already counts as "present" for streaks).
- streams/{id}/private/control.recruitRush gains rewardBadgeId (set when Rush is turned on) and rushDropId (set when the prompt is used).
- public/live.recruitRush gains dropReady: badgeId (only while the goal is hit and no Rush drop has opened yet).
- adminLog: feature "liveDrops"; actions dropOpen, dropExtend, dropClose, dropDraw, dropStopClose.
- activityLog: one "badge-drop" entry per drop at close ("42 members caught Jump-Scare Witness"; for a draw, "@handle is The Chosen One"). Individual badge-earned entries are skipped for drop grants, so one drop doesn't flood the feed.

## 4. Cloud Functions and rules

New file functions/lib/live/drops.js, because drops publish to public/live. Deploy lesson applies: lib/live functions are deployed together.

**dropOpen({ streamId, badgeId, minutes? | untilEnd?, cap?, source? })** — callable

- Caller is the owner or the live Captain (captainNow.uid, clocked in).
- Stream state is "live" (on staging, a test stream started with startStream counts).
- The badge has a drop preset; a Captain needs drop.by "captain".
- drops/{streamId}_{badgeId} doesn't exist yet, and no other drop is open on this stream.
- minutes 1–120 (draw: from the preset, 1–15); cap 1–10 000 or none; streamEnd ignores minutes.
- Writes the drop, public/live.drop, adminLog dropOpen. With source "rush", also private/control.recruitRush.rushDropId.

**dropAdjust({ dropId, action: "plus1" | "plus5" | "close" })** — callable

- Owner or the current live Captain, whoever opened it.
- plus1/plus5: timed and draw only, refused past maxClosesAt (the 2-hour cap) and after close.
- close: status "closing", closedAt = now, graceUntil = now + 30 s, closedBy "manual". adminLog dropExtend / dropClose.

**claimDrop({ dropId })** — callable

- Signed in with a handle; not droppedBy.uid; now ≤ graceUntil (or before closesAt); status open or closing; cap not reached.
- Transaction: create claims/{uid} (refuse if it exists), bump the counter, presence.drops +1.
- timed / streamEnd: grantBadge(uid, badgeId, { ref: "drop-<dropId>" }); if they already hold it, result "already" and no grant.
- draw: result "entered"; nothing granted yet.
- Returns { result, badge } so the banner can play the medal. A repeat call returns the first result.

**dropSweep** — scheduled every minute; does nothing when no drop is open or closing.

- open with closesAt passed → closing (closedBy "timer"); cap reached → closing ("cap").
- closing with graceUntil passed → closed: write the final count, the activity entry, publish.
- draw: pick winners with crypto randomness from entries (excluding anyone who already holds the badge), grant them, mark results won/lost, status "drawn", adminLog dropDraw.
- Winners show within about a minute of close; the banner shows "Drawing…" meanwhile.

**Hooks into existing code**

- afterEnd (Stop and the 12-hour auto-end): any open drop goes to closing with closedBy "stop"/"autoEnd"; dropSweep finishes it after the grace. adminLog dropStopClose.
- buildPublicLive: adds drop; findSecrets covers it.
- rush.js: when hitAt is set and rewardBadgeId exists, publish recruitRush.dropReady.
- Recruit Rush settings (/live/control): a badge picker beside the reward text, limited to drop badges.
- feeds.js DECK_LATER: remove dropBadge. controls.js SHORTCUTS: drop the dropBadge keys for now.

**firestore.rules**

- drops/{id}: read for the owner and crew (the existing crew helper); write false.
- drops/{id}/claims/{uid}: read when request.auth.uid == uid, or owner; write false.
- drops/{id}/shards: read and write false.
- public/live is already public read.

## 5. UI and states

Five surfaces read one source: the drop panel writes through dropOpen/dropAdjust; everything else reads public/live.drop from the existing one-per-tab listener. All of it follows the house look (Hull or CRT) where it sits inside the Control Room, and never changes colour meaning: Claim and the panel buttons are purple, nothing here is red (Close now ends a window but destroys no data), and the badge's rarity colour only tints the art frame. The drop's own tint is gold (red stays the check-in's live exception).

**1. Drop panel (P1 "One card")** — site/src/scripts/live/drop-panel.ts, one module mounted in two places

- On /live/control: an owner-only panel slot. In the Mod Deck: a "Drop a badge" button in the helm strip (Captain only) opens the panel as a popover on desktop and a bottom sheet on phones, both using bt:overlay-open. While a drop is open the button shows the fuse ring, the countdown and the claim count.
- States: not live ("Drops open while you're live", controls disabled) · pick a badge (cards with art, rarity and preset; already-dropped ones show "Dropped" and are disabled) · set up (preset chip pre-selected and marked with a gold dot, cap toggle, Open drop · <window>) · open (fuse ring, big countdown or "Until stream ends", claim count, cap bar, +1 min, +5 min, Close now) · closing ("Last call", grace seconds) · drawing · closed summary ("64 claimed" or the winner) above the badge picker for the next drop · Rush prompt (dashed gold card on top: "Rush goal hit: 25 recruits — Drop <badge> for everyone?" with Open drop and Not now) · error toast.
- Draw badges: no cap and no "Until stream ends" chip; the button reads "Open the draw".

**2. Site-wide banner (B1 "Strip")** — a drop variant of .bt-live-banner, loaded by BaseLayout when public/live.drop exists (beside the check-in trigger)

- Visitor: fuse ring, "Live drop Jump-Scare Witness · 37 claimed · 2:41 left", Join free to claim (opens E1).
- Member: Claim (or Enter the draw) · claimed ("It's yours" + flip medal, then a quiet confirmation) · already ("Already yours") · entered ("You're in the draw") · closing ("Last call", no countdown, Claim still works) · drawing · won ("You're The Chosen One", medal) · lost ("Not this time: @handle was chosen") · closed ("Drop closed", fades after 10 s) · dropper ("Your drop · 37 claimed", no button).
- If a check-in window and a drop are both open, the two banners stack, check-in first.
- Hidden on /live/control and /live/obs; on /live the drop card replaces it.
- Phone: one line (fuse, name, timer, button); the "Live drop" label hides for open, visitor and dropper so the name has room; "Last call" always shows.

**3. /live drop card** — in the Bridge layout, under the stream: the same states as the banner, bigger fuse, the claim count ticking.

**4. Stream view callout** — /live/obs wide and tall: fuse, "Live drop · claim at boomertanger.com/live", name, countdown, claim count; slides in at open, shows the winner for a draw, slides out 10 s after close. Reduced motion: fade only.

**5. Recruit Rush settings** — a "Reward badge (optional)" select beside the reward text, listing drop badges the person can drop.

The celebratory moment is the flip medal on claim and on a draw win, plus a toast; prefers-reduced-motion shows the medal face without the flip.

## 6. Edge cases

| Situation | What happens |
| --- | --- |
| Two taps on Claim, or a retry after a network blip | The claims/{uid} create fails the second time; the callable returns the first result, no double grant (the ledger key is keyed too). |
| Cap reached mid-burst | The transaction refuses claim cap+1 with "All claimed"; dropSweep moves the drop to closing. |
| Member already holds the badge | Claim works, result "already", no grant; it still counts for streak presence. In a draw they can't win. |
| Draw with no entries | Status drawn, no winner; the activity entry is skipped; the panel shows "No entries". |
| Captain changes mid-drop | The drop stays open; the new Captain can manage it, the old one can't. droppedBy keeps the original. |
| Captain clocks out with a drop open | The drop keeps running to its timer; the owner can still close it. |
| Stop or auto-end while open | Closing with a 30 s grace; dropSweep finishes it. A draw still draws. |
| Stream goes off before the sweep | dropSweep doesn't depend on the stream being live. |
| Owner tries to claim their own drop | Refused ("Your drop"); they can claim the Captain's drop. |
| Same badge twice in one stream | Refused by the dropId; the card shows "Dropped". |
| Second drop while one is open | Refused ("One drop at a time"); the badge list is disabled until the first closes. |
| Extending past 2 hours | +1/+5 disabled at maxClosesAt; the server refuses too. |
| Visitor joins during the window | After E1 finishes, the banner flips to Claim if the window (or grace) is still open. |
| Rush hit with no reward badge, or the Captain can't drop that badge | No prompt for that person; the text reward still shows as today. |
| Tab asleep, clock skew | Countdown uses closesAt against server time (the offset live.ts already keeps); the server decides with its own clock. |
| Badge removed from the catalog mid-drop | The drop keeps its copied name and art; grants still use badgeId; the open is refused for removed badges. |

## 7. bt-ui components

**Used as they are:** .bt-cr-panel, .bt-heading, .bt-label, .bt-chip, .bt-btn primary, secondary and ghost, .bt-switch (cap), .bt-input (cap number), .bt-medal, .bt-level (rarity), toasts, the sheet pattern with bt:overlay-open, the existing .bt-live-banner (check-in).

**Kit additions (shared/bt-ui.css + the UI kit page, every state shown):**

- .bt-live-banner drop variants: data-kind="drop" with data-state open, closing, drawing, claimed, already, entered, won, lost, closed, visitor, dropper; and a stacked pair (check-in + drop).
- .bt-dropfuse: the medal in a fuse ring (--p 0–1) that drains with the countdown, turns dashed and spins for Last call (closing), goes gray for closed/lost and fills gold for claimed/won; used by the banner, the panel, the helm button, the /live card and the callout.
- .bt-drop-timer: a big countdown with a "Last call" state (.bt-countdown is already the home hero's next-stream digits), shared by the panel and the /live card.

**Feature-only CSS:** the stream view callout (inside the stream view's own look) and the panel's badge picker grid (prefix dp-). Both use var(--bt-*) or one declared custom property per unique colour; layout uses container queries on "bt" only.

## 8. Out of scope and build parts

**Out of scope:** the badge editor (rewards.md 18; presets stay in the seed), supporter badges (billing), "until a set time" drops, a Stream Deck drop key, the chat bot claim message, stream-presence-based claiming, automatic Rush drops.

**Build parts (one Claude Code prompt and one commit each):**

1. Part 0 — save this spec and the mockup; ROADMAP workstream 7 line.
2. Part 1 — badge seed presets (and anniversary-ember source), firestore.rules for drops; staging rules deploy and reseed.
3. Part 2 — functions/lib/live/drops.js (dropOpen, dropAdjust, claimDrop, dropSweep), the afterEnd hook, public/live.drop, findSecrets, DECK_LATER and SHORTCUTS cleanup; staging deploy of all lib/live functions.
4. Part 3 — kit additions (.bt-live-banner drop variants, .bt-dropfuse, .bt-drop-timer) and the UI kit page.
5. Part 4 — the drop panel on /live/control and in the Mod Deck helm strip.
6. Part 5 — the site-wide banner, the /live card and the stream view callout.
7. Part 6 — Recruit Rush reward badge and the one-tap prompt.
8. Part 7 — docs/testing/live-drops-test-plan.md, design-system.md entry, CHANGELOG and instruction updates.

## 9. Built differently from the spec

- **Countdowns use the browser clock.** No server-time offset exists in lib/live.ts (or anywhere on the site), so the panel, the banner, the /live card and the stream view tick from closesAt against Date.now(), as the check-in countdown does. The server decides with its own clock and the 30-second grace, so a skewed clock only moves the numbers, never who gets the badge. (Follow-up: serverNow in callable replies.)
- **"Already yours" shows after the tap.** It comes from claimDrop's result ("already") and is kept by the member's claims listener, so it survives a reload; the site doesn't load a member's badges on every page. (Follow-up: one read of profiles/{uid}/badges/{badgeId} to show it before the tap.)
- **Recruit Rush is edited by the owner only.** liveRecruitRush is owner-only, so the "Reward badge (optional)" picker is on /live/control only (a Captain gets the one-tap prompt, not the picker). The server accepts a reward badge change after the goal is hit (dropReady follows it) until the Rush drop opens; then the picker locks.
- **The claim count reaches public/live through the 3-second check-in flush** (the same debounced liveFlush), not a drop-only writer.
- **The stream view callout sits top left (wide) and above TikTok's captions band (tall)**, not where the mockup put it: there it covered the beats rail and the stats panel. It clears every scene's panels in both shapes.
- **drops.js has its own adminLog writer** with feature "liveDrops" (actions dropOpen, dropExtend, dropClose, dropDraw, dropStopClose).
- **drop-sample.js runs the drop code against staging Firestore as a given uid** (the cue-sample.js pattern, Application Default Credentials), not the deployed callables.
