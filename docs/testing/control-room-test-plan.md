# Control Room test plan

Hand-run checks for the Control Room on staging (`PUBLIC_FIREBASE_ENV=staging`), with real accounts. The automated checks (`npm run check` in `functions/`, the Playwright runs in the build notes) cover the logic and the layouts; this plan is what only a person with Streamlabs, a second browser and a few accounts can prove. This file did not exist before part 9; it starts with the after-show and backstage steps and is the place to add the rest (stream view, check-ins, Questions) as they are walked through.

Accounts you need: **Owner** (boss), **Overseer** (A2), a **Fan Club member** (signed up, free), a **visitor** (signed out), and a **signed-in non-member** (signed in, signup unfinished) if you can make one.
Staging safety: every YouTube event is Private and starts with `[STAGING] `; nothing here reaches production.

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
