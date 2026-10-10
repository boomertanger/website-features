# Control Room test plan

Hand-run checks for the Control Room on staging (`PUBLIC_FIREBASE_ENV=staging`), with real accounts. The automated checks (`npm run check` in `functions/`, the Playwright runs in the build notes) cover the logic and the layouts; this plan is what only a person with Streamlabs, a second browser and a few accounts can prove. It opens with six walk-throughs (W1 to W6: check-in from another page, the two-tab test, the stream view in Streamlabs, the Stream Deck, Twitch EventSub and a real Start), then the part 9 checks (A to E: after-show and backstage), then the Mod Machina phase 3 walk-throughs (W7 to W11: swap board, Deck duty loop, Captain and flags, Recruit Rush, activity rules). Add Questions and Hot Seat here when the Chat Games are built.

Accounts you need: **Owner** (boss), **Overseer** (A2), a **Fan Club member** (signed up, free), a **visitor** (signed out), and a **signed-in non-member** (signed in, signup unfinished) if you can make one.
Staging safety: every YouTube event is Private and starts with `[STAGING] `; nothing here reaches production.

## Walk-throughs (do these first)

Real-world checks of parts 3 to 8. Each has the exact steps and what you should see. Do them in order W1 to W6; W5 and W6 need a real Twitch stream. Use a throwaway stream so nothing public is announced: **Start an unscheduled stream** on /live/control with the title **Dry run** (type Platform, chats Twitch only), which makes the stream and its YouTube event, then **Start**.

### W1. Check in from another page

1. Owner, /live/control: Start an unscheduled stream "Dry run" (Twitch only). Press **Start**, pick any first game, Start. WE'RE LIVE plays; the Start beat is on.
2. Press **Begin Break 1**. Press **Open check-in** (3 minutes). The big word shows on the controls (and only there and on the stream view).
3. In a second browser signed in as **@gbo** (a signed-up Fan Club member; the owner cannot check in), open the Game Vault (/games). Expect: a red banner under the header, "Check-in is open · Break 1 · 2:5x left" with **Check in**. It is not on /live or /live/control.
4. Press **Check in**. The dialog opens (a bottom sheet on a phone-sized window). Type a **wrong word**: the field shakes and says "That's not tonight's word. 4 tries left for this beat." Pick **where you are watching** (Twitch).
5. Type the **right word** (any case, spaces or accents are ignored). Expect: the stamp slams in, a burst (none with reduced motion), chips "+10 XP", "Stream streak safe tonight" and "1 of N beats", the four stamps with B1 filled, and **Back to the page**. The banner behind turns green: "You're in for Break 1 · +10 XP".
6. Dismiss test: reload, the banner is back in the green state; on the next window use the ✕, go to another page: it stays hidden for that window.
7. On the controls: the check-in count is 1 and @gbo is under First in. Press **Stop the stream** (confirm). The wrap-up shows.
8. As @gbo open **/account#streams**. Expect: "Dry run" at the top with **Counted** "because you checked in", Checked in from Twitch, the B1 stamp filled, **+10 XP**, and "1 stream in a row". The page also says what is never recorded and that details are deleted after 13 months.

### W2. Two-tab live test

Tab A: the owner on /live/control. Tab B: /live as a signed-in member (and a third window as a visitor).

1. Before Start: B shows the waiting room (Off air or Starting soon, the next stream's ticket). The header beacon says Offline or the next stream's time.
2. Start in A. Within a few seconds B switches by itself to the Bridge: the title in gold, the red Live tag, the beacon and mascot red, the Watch dot red on every page.
3. Begin Break 1 in A: B's beat rail moves (Start done, Break 1 now). Open check-in in A: B's Check in panel opens with the countdown ring and a red edge; the visitor window says "Join free to check in"; the site banner shows on any other page.
4. Check in from another account: the count on A and B goes up within about 3 seconds, and the first three handles appear under First in on both, in order.
5. Close the window in A: B's panel says Check-in is closed (or shows your stamp); the banner goes.
6. Stop in A. B changes to **Just ended**: confetti (none with reduced motion), on-air time, peak, check-ins by beat, the games timeline and the next stream. A shows its own wrap-up. After two hours (or `?state=off` in preview) /live is the waiting room again.

### W3. Stream view in Streamlabs

1. /live/control, owner: the **Stream view** card, **Make a key**. The key is shown once: copy it into the browser source URL at once (never into chat). The wide URL is `https://<site>/live/obs?k=<key>&layout=wide`; the tall one has `layout=tall`.
2. Streamlabs Desktop: Add Source, **Browser Source**. URL = the wide URL. **Width 1920, Height 1080.** Leave "Shutdown source when not visible" off and "Refresh browser when scene becomes active" on. Expect nothing visible at first (it is transparent) while nothing is live.
3. Wrong key check: set a wrong key for a moment. Expect the source to be completely empty (no text, no error). Put the right key back.
4. Dual Output: in the **vertical** canvas add another Browser Source with the tall URL, **Width 1080, Height 1920**.
5. With the Dry run stream live, use the **Scene card** on /live/control and look at the source after each: **Auto** (follows the beat), **Starting soon** (countdown, games with covers, crew ticker), **Live stats** (corner panel and beat rail), **Break** (camera window, the word scrambling then settling, ring, counts by room, First in popping in), **Break · side rail**, **Be right back** (5 minutes: the timer counts down), **Ending** (thanks, stats, crew, "Next: day · title · time"). Each should change within about a second.
6. **Line up the camera:** in the Break scene put your camera source behind the browser source and size it to fill the dashed "Your camera" frame (wide: left 90, top 120, 880 by 760 on the 1920 by 1080 canvas; tall: left 70, top 190, 780 by 460). The picture should show through the window with the frame drawn around it.
7. **Tall safe zones:** with the platform's phone preview open, nothing important sits under the top bar, the buttons down the right or the captions at the bottom.
8. Open check-in and say the word: the ring counts down, the count climbs, First in pops in one by one. Nothing flashes faster than about three times a second; all text is easy to read at stream size.
9. **TikTok LIVE Studio:** add a Browser or Link/Web source with the tall URL. Write down whether it accepts it and whether it is transparent. If it does not, say so here and in the ROADMAP: the fallback is a window capture of the stream view in a browser.

### W4. Stream Deck

1. /live/control, owner: the **Stream Deck** card, **Make a key** (shown once; copy it into the Stream Deck software only).
2. In the Stream Deck software add three web-request keys (a plugin such as API Ninja or Web Requests): **Begin next beat** (`.../liveDeck?k=<key>&action=nextBeat`), **Open check-in** (`&action=openCheckin&minutes=3`) and **Be right back** (`&action=scene&scene=brb&brbMinutes=5`). The card lists every URL with a Copy button.
3. With the Dry run live, press each key. Expect: the beat begins, the window opens, the stream view shows Be right back with its timer, and the controls page updates within about two seconds. The Admin log shows the actor **Stream Deck**.
4. Add a **Multi Action** key: first the Streamlabs plugin's switch-scene action (your Break scene), then the Open check-in request, then "Begin next beat". One press should switch Streamlabs, begin Break 1 and open the check-in.
5. Negative checks: a wrong key gives 403; the key made for the stream view does not work here; `action=start` or `action=stop` is refused ("Start and Stop stay on the controls page"); Questions and Hot Seat actions say they arrive with Chat Games; more than 30 presses a minute are refused (429).

### W5. Twitch EventSub (next real Twitch stream)

Setup once: the staging EventSub subscriptions exist (`node functions/scripts/twitch-eventsub.js` for a dry run, then `--apply`) and `TWITCH_EVENTSUB_SECRET` is set. Then:

1. Start streaming on Twitch and press **Start** on the controls. Expect: the Twitch card says ● Live with viewers, and the function logs for `twitchEventSub` show a `stream.online` notification (signature accepted, no errors).
2. Stop streaming on Twitch (leave the site stream running). Expect a `stream.offline` notification in the logs, the Twitch card going to Offline, and after **3 minutes** the gold banner "Twitch says you're offline" with **Stop the stream** and **Wait**. The stream is **not** ended by itself.
3. **Crash test:** go live again, then kill Streamlabs or the PC mid-stream and restart it. Expect: the site stream is still live the whole time (nothing ends it), `/live` still shows the Bridge, and the banner offers Stop or Wait. Go live again: the banner clears when Twitch reports live. Only Stop, or the 12-hour auto-end, ends it.
4. Replays: nothing changes if the same notification arrives twice (message ids are de-duplicated).

### W6. Real Start

1. Streamlabs ready: the Twitch output, the YouTube event picked from the list and Dual Output on. **Do not go live yet.** Open the Start dialog on /live/control.
2. Expect the rows to say Looking…, then **Not live yet** for Twitch, **Event ready, not live yet** for YouTube and **Not found yet: Dual Output makes it at go-live** for the vertical broadcast, with a gold note naming what is missing. Start stays allowed.
3. Go live in Streamlabs while the dialog is open. Within about 5 seconds each row flips to **Live ✓** (Twitch with its viewer count, YouTube, the vertical broadcast).
4. The TikTok row is a switch, ON when TikTok is a planned chat, independent of any check. Press **Start the stream**. Expect the controls' Platforms card to show the same three as live.
5. Stop the stream in Streamlabs before pressing Start (dialog still open): the rows go back to Not live yet on the next check, still without errors.

## Mod Machina phase 3 walk-throughs (the Mod Deck)

Real-world checks of the Mod Deck build (spec `docs/specs/mod-machina.md` §17a). Accounts: the **Owner**, **@gbo** (on the crew roster, Watcher or above, Active), a **second crew account** and a **third crew account** (both Active, Watcher or above), and a **brand-new account** made during W10. Use a separate browser (or profile) per account; incognito for the brand-new one. Nothing here touches production.

### W7. Swap board

1. Owner, /schedule/plan: publish a week with a stream **more than a day out**, with **@gbo** confirmed in a seat (a Room Lead seat is easiest).
2. @gbo, /schedule/plan: open that stream, **Drop** the seat. The drop dialog says "More than 24 hours’ notice: no effect on your record. The seat goes on the swap board for the crew." Confirm.
3. Second crew account, /crew/hq: a notice at the top ("… has a seat up for grabs", unread with a purple dot) and the seat on the swap board card ("Dropped by @gbo · …"). Press **Take it**, confirm. Toast: "Yours. See you …". The seat is theirs on /schedule/plan and the card says "Nothing up for grabs".
4. Third crew account, with /crew/hq open from before the take: press **Take it** on the same seat. Expect "Someone beat you to it." and the card refreshes.
5. Repeat steps 1 to 3 with a stream **less than 24 hours out**: the drop dialog says "Less than 24 hours: no effect if someone takes it before the stream starts. If nobody does, it counts as a no-show." Leave it untaken this time.
6. Owner, /schedule/plan: **Delay** the stream that has the open swap. The swap closes (it leaves the HQ board) and nothing is recorded against @gbo.

### W8. Deck duty loop

1. Owner, /live/control: Start an unscheduled stream "Dry run" (Twitch only), **Start**.
2. @gbo, **/live/deck**: the Deck shows the hero with the clock, the rooms strip and the Twitch chat. Press **Clock in**: the "ON the clock" stamp lands (no movement with reduced motion) and the duty bar shows your minutes.
3. Wait 2 to 3 minutes: the minutes count up (the 60 s heartbeat; leaving the tab in the background keeps counting).
4. **Step away**, pick **5 min**: the duty bar turns gold with the countdown. Press **I'm back**: "Welcome back. Your minutes are counting again."
5. Owner: **Stop the stream** (confirm).
6. @gbo, still on the Deck: the ended view shows **Your night** (minutes, role lines, Gears waiting for the crew to be confirmed).

### W9. Captain and flags

1. Owner: Start a "Dry run" as in W8 (nobody seated).
2. @gbo, /live/deck: **Clock in**. Within 15 minutes a lantern prompt drops over the chats: "Nobody's at the helm. Be acting Captain tonight?" Press **Take the helm**: the gold helm strip appears (Unlock, TikTok viewers, Reassign, Launch panel) and the toast says "You're acting Captain tonight. Thank you."
3. @gbo: the flag button on the duty bar → **Flag to Boomer**: pick **Raid**, the room, a note of 10+ characters, **Send flag**.
4. Owner, /live/control (and /live/deck as the owner): a gold flag card at the top; the browser tab title alternates; after tapping the page once (browser sound rule) the next flag plays one soft chime. Press **Got it**.
5. @gbo: the flag shows "Seen by Boomer".
6. Owner: **Stop the stream**. @gbo (the Captain who ended the night): **Confirm tonight's crew** shows everyone with their minutes; press **Confirm and pay Gears**. The ended view shows "Confirmed · Gears paid" and the Gears count up.

### W10. Recruit Rush

1. Owner: Start a "Dry run". On /live/control, the **Recruit Rush** card in the right column: switch on, Goal **5**, a reward (e.g. "Hard-mode run on Friday"), **Save**. The On badge turns green and the meter shows 0 / 5.
2. A second browser on /live (signed out): under the check-in, the gold Recruit Rush meter "0 / 5", "new members tonight · 5 to go" and **Join free and count**.
3. Incognito: sign up a **brand-new account** (finish every signup step).
4. Within a minute, /live (any browser) shows **1 / 5**; /live/deck's rail and the stream view's Live stats bar show the same. The new account's handle appears nowhere on /live.

### W11. Activity rules

1. In a terminal: `node functions/scripts/crew-monthly-dry-run.js --project staging --month <this month>` (and again with `--as-if-on`). It prints the rules state, the month and one row per crew member, and writes nothing.
2. Owner, **/admin/crew** → Activity rules: Off. Pick next month as the start, **Turn on**. The confirmation says "Activity rules start on <Month> 1. <Month> is a practice month: nobody moves down." Confirm: the badge says "On · starts <Month> 1".
3. @gbo, /crew/hq: a "rules" notice at the top, and the time card says "Activity rules start <Month>." Nothing else changes: same status, no reminders, the lists on /admin/crew stay hidden until the start month.
4. To put staging back: /admin/crew → **Turn off** (confirm). History (rulesSince) is kept.

## A. After-show: public stream to backstage

Setup: a published platform stream for today (Twitch, YouTube, vertical; TikTok optional), the YouTube channel connected on /admin, Streamlabs with Dual Output, and `/live` open in a second browser as a Fan Club member and a third as a visitor.

1. **Start** the platform stream from /live/control (Start dialog, WE'RE LIVE). `/live` shows the Bridge for both viewers.
2. Begin Break 1, Break 2 and **End** with Begin. The End beat is current.
3. Press **Start after-show**. The confirm lists the three things that happen: the public stream ends, a Fan Club backstage stream starts (site only), its unlisted YouTube event is created. Confirm.
   - Expected: the controls switch to the new backstage stream (title "<title> after-show"), beats start again at Start, the check-in rooms are the site only, and the **Switch Streamlabs** card shows at the top.
   - Expected: the old stream's wrap-up is not shown (the controls moved on); it is ended in the Planner list.
4. On the card, note the event name: `[STAGING] <title> after-show`. Its status line says **Waiting for YouTube…**.
5. In Streamlabs follow the card: stop streaming; turn off Twitch and the vertical output; pick the event with that name (refresh the list once); go live.
   - Expected: within about 15 seconds the status line says **Live ✓** and the button says **Done**.
   - Expected: if you do nothing for a few minutes the line keeps saying Waiting for YouTube (no error, no pile of requests: one status call every 5 seconds while the card shows).
6. End **TikTok LIVE Studio** by hand (the card says so). Nothing on the site does it.
7. **Done** hides the card; the backstage stream has its own beats, an Open check-in with the room "site" only, and **Stop the stream**.
8. **Stop** the backstage stream. `/live` shows Just ended for two hours; the stream view says Ending. About `makeBackstagePrivateAfterDays` later the daily tidy makes the video private (see D).

Edge cases to try once: press Start after-show twice quickly (the second is refused: "already has an after-show"); start an after-show while a check-in window is open (the window closes with the stream); try Start after-show on a backstage stream (the button is not offered).

## B. Starting a planned backstage stream

1. In the Planner publish a week with a **backstage** stream (audience Fan Club). Open /live/control within 12 hours of its start and pick it.
2. Press **Start**. The dialog shows **only** the YouTube event (unlisted) row: no Twitch, no vertical, no TikTok row and **no TikTok switch**. The subtitle says it plays on /live for the Fan Club with the site as the only chat room.
3. Start. `/live` goes to the green backstage view; the header beacon, the mascot and the Watch dot are green; the title reads the stream's title; check-ins offer only "On the site".

## C. /live while backstage

Run each as the viewer named, at a desktop width and on a phone, in both looks (the owner sets the look on /live/control).

| Viewer | Expected |
| --- | --- |
| Fan Club member (or any signed-up member) | The unlisted YouTube player and YouTube's **live chat** beside it (below the video on a phone). Chat loads on staging and on boomertanger.com (the page's host is the `embed_domain`). Check in works with the room "On the site". |
| Visitor (signed out) | The **velvet curtain** over the video with "Join free to watch" (opens the Join dialog) and "I have an account". No video id in the page source. The check-in panel says Join free. |
| Signed in, signup unfinished | The same curtain (Join free). |
| Sub Club audience stream, Fan Club member | Curtain with "This show is for Sub Club members." (when a stream's audience is Sub Club). |
| Staff on duty | They can watch. |

Also check:

1. **Hand-over without a reload.** Keep `/live` open as a member while the owner does section A step 3. The page changes over by itself: the curtains close over the picture, then the green backstage view opens (no page reload; the browser tab does not flash). With reduced motion on, the curtains are held still for a moment and the view changes over without sliding.
2. **Embed failure.** In devtools block `youtube-nocookie.com` for a moment, or start the event late: the player says it is not ready. "Video not playing? Reload it" under the video asks for the id again. The id is never in localStorage (Application tab: nothing with the video id; `lp-room` is the only key this page writes).
3. A refresh during backstage asks for the id again and does not need a cache.

## D. Backstage videos private after N days (owner)

1. /live/control, owner only: the **Backstage videos** card. An Overseer does not see it.
2. Set 3 days, Save: "On: private 3 days after the stream." Turn the switch off, Save: "Off: backstage videos stay unlisted…". Set 7 again.
3. In staging the tidy skips anything not made by the site; for a real check run `youtubeTidy` from the console after back-dating a test stream's end and confirm the video is Private in YouTube Studio.

## E. The audience gate on the server

Using the real callable (browser console on /live signed in as each account: `httpsCallable(functions, "backstageWatch")({})`) while a backstage stream is live:

| Caller | Expected |
| --- | --- |
| Signed out | `unauthenticated` |
| Signed in, signup unfinished | `permission-denied`, reason `audience` ("Join free to watch backstage.") |
| Fan Club member | `{ ok: true, provider: "youtube", videoId }` |
| Fan Club member, stream audience Sub Club | `permission-denied` |
| Sub Club member, mod, admin, owner | allowed |
| Any caller, a stream that is not backstage or not live | `failed-precondition` (`notBackstage` / `notLive`) |

The video id must appear **only** in that answer: not in `public/live`, not in the stream document, not in the stream view feed (`/live/obs` data), not in adminLog or activityLog, and not in the Cloud Functions logs (search the logs for the id after a watch).
