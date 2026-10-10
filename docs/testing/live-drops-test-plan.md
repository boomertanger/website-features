# Live drops test plan

Hand-run checks for live drops on staging (`PUBLIC_FIREBASE_ENV=staging`), with real accounts. The automated checks (`npm run check` in `functions/`, which runs `scripts/check-drops.js` against the in-memory Firestore with the real Trophy Room grants, and the Playwright runs in the build notes) cover the logic and the layouts; this plan is what only a person with two browsers, a few accounts and Streamlabs can prove. Spec: `docs/specs/live-drops.md`; mockup: `docs/design/mockups/live-drops.html`.

**Two windows throughout:**
- **A** = the **owner** on /live/control.
- **B** = **@gbo** (a signed-up Fan Club member) in an **incognito** window, signed in through the Cloudflare Access login first, then the site's own sign-in.

Other accounts for some steps: a **mod** who can clock in as Captain, a second member (for the cap), and a **visitor** (a second incognito window, signed out of the site).
Staging safety: every YouTube event is Private and starts with `[STAGING] `; badges granted here are staging badges (grant ref `drop-<dropId>`).

**Before you start:** on /live/control start an unscheduled stream **Dry run** (Platform, Twitch only) and press **Start**. Drops open only while a stream is live. Each badge can be dropped once per stream, so start a new Dry run when you run out.

## The scripts (from the repo root; staging only, they refuse production)

`functions/scripts/drop-sample.js` runs the real drop code (`lib/live/drops.js`) on your machine against staging Firestore as the uid you name, with Application Default Credentials (the `cue-sample.js` pattern). It writes the same documents the deployed functions would. Without `--apply` it only says what it would do.

```
node functions/scripts/drop-sample.js --status                                                     # the live stream, its open drop, the counts
node functions/scripts/drop-sample.js --open jump-scare-witness [--minutes 3] [--cap 10] [--until-end] [--rush] --as <ownerUid> --apply
node functions/scripts/drop-sample.js --claim <dropId> --as <memberUid> --apply
node functions/scripts/drop-sample.js --adjust <dropId> plus1|plus5|close --as <ownerUid> --apply
node functions/scripts/drop-sample.js --sweep --apply                                              # one sweep now, instead of waiting a minute
```
`--stream <id>` picks a stream other than the live one. The deployed `dropSweep` also runs every minute on staging. A dropId is `<streamId>_<badgeId>`; `--status` prints it.

## 1. Open, extend, close (A)

1. A, the **Live drops** panel in the right column: five badges (art or emoji, rarity, preset). Pick **Jump-Scare Witness**. Expect: the **3 min** chip is picked and has a small gold dot (the preset); the button reads **Open drop · 3 min**.
2. Press **Open drop**. Expect: the medal flips once, a toast "Jump-Scare Witness is dropping for 3:00.", then the open card: the big fuse ring draining, **2:5x** counting down, "left · closes h:mm pm", **0 claimed**, and **+1 min**, **+5 min**, **Close now** (all purple outlines, nothing red).
3. Press **+1 min**. Expect: a toast, the countdown jumps up a minute and the fuse ring refills a little. Buttons don't move.
4. Press **Close now** once. Expect: it turns gold and reads **Tap again to close**; wait 3 s and it goes back to **Close now**. Press it twice. Expect: **Last call** (gold, blinking), "Claims still count for 0:2x (stream delay)", the fuse dashed and spinning, +1/+5/Close now disabled.
5. Wait for the 30 s grace and the next sweep (up to a minute; or run `--sweep --apply`). Expect: the closed summary on top, "Drop closed · N claimed", "Jump-Scare Witness · closed by hand", and the badge picker below it with **Jump-Scare Witness** greyed out as **Dropped**.

## 2. Claim from the banner (B)

1. A opens **The Glitchwitness** (5 min). B is on any page except /live, /live/control and /live/obs (try /games). Expect within a few seconds: a gold strip under the header: fuse ring, "**Live drop** The Glitchwitness · N claimed · 4:5x left", purple **Claim**, ✕.
2. B presses **Claim**. Expect: the strip turns brighter gold, "✓ **It's yours** The Glitchwitness · added to your Trophy Room", the medal flips once (no flip with reduced motion on), and a toast "It's yours: The Glitchwitness". No button.
3. A: the claim count goes up by one within about 3 seconds (the check-in flush).
4. B reloads. Expect: still "It's yours" (it comes from B's own claim record, not the page). The strip does not slide in again on state changes, only when it first appears.
5. B opens **/live**. Expect: no strip; the **Live drop** card under the stream instead, with the same state ("It's yours", "Added to your Trophy Room · N claimed"). It follows the house look.
6. B's Trophy Room (/trophies): The Glitchwitness is held. Drop badges no longer show "Coming soon".
7. ✕ test: open another drop, press ✕ on B's strip. It goes for that drop only (also after a reload); the next drop shows again.

## 3. A repeat claim

1. With a drop open, run the claim twice for the same member:
   `node functions/scripts/drop-sample.js --claim <dropId> --as <memberUid> --apply` (twice).
2. Expect: the first prints `result: "granted"` (or `"already"` if they hold the badge), the second prints the **same result** with `repeat: true`. The member's badge is granted once (one ledger entry, ref `drop-<dropId>`); A's count went up once.

## 4. A draw: The Chosen One

1. A picks **The Chosen One**. Expect: chips 1, 2 (preset), 3, 5, 10, 15 min, no "Until stream ends", no claim limit; the button reads **Open the draw · 2 min**. Open it.
2. B: the strip says "Live drop The Chosen One · N entered" with **Enter the draw**. Press it. Expect: "**You're in the draw** The Chosen One · N entered" with the countdown.
3. When the window and the 30 s grace end: B shows **Drawing…**, A shows Drawing… too. Within about a minute (the next sweep): the winner is picked from the entries (anyone who already holds the badge can't win).
4. Expect, for the winner: "✓ **You're The Chosen One** · picked from N entries", the medal flip and a toast. For anyone else who entered: "**Not this time** @handle was chosen". A's summary: "@handle is The Chosen One · N entries". With no entries: "Nobody entered the draw".

## 5. Stop, the cap, and a visitor

1. **Stop:** open a drop, then press **Stop the stream** on A. Expect: the drop goes to Last call (30 s grace) and closes at the next sweep (adminLog `dropStopClose`). A draw still draws.
2. **Cap:** on a new Dry run, open a drop with **Limit claims** on and the limit at **1** (or `--open glitchwitness --cap 1`). B claims: "It's yours". A second member presses Claim: the toast says **All claimed.** and the drop goes to Last call at the next sweep. A's card shows the cap bar full.
3. **Visitor:** a signed-out window on any page. Expect: the strip with **Join free to claim**, which opens the Join dialog titled "Join to claim". After finishing signup while the window (or the grace) is still open, the strip flips to **Claim**. Someone signed in mid-signup sees **Finish joining to claim**, which reopens the signup at their step.
4. **Your drop:** when the owner (or the Captain who opened it) looks at the site banner, it says "**Your drop** · N claimed" with no button.

## 6. The Captain (Mod Deck)

1. A mod clocks in on /live/deck and takes the Captain seat (or acting Captain). Expect: **✦ Drop a badge** at the end of the Captain row of the helm strip. A Room Lead or a Deckhand doesn't see it; the owner sees it only when the owner is Captain.
2. Desktop: tap it. Expect a popover under the button with the panel, showing only **Jump-Scare Witness, The Glitchwitness, Boss Fight Believer** ("Owner-only badges don't show for Captains"). Esc or a tap outside closes it; focus goes back to the button on Esc. Opening the account menu or a nav panel closes it too.
3. Phone width: the helm strip is on the **Tools** tab; tap the button. Expect a bottom sheet with the same panel and a close button.
4. Open a drop from it. Expect: the button turns into a mini countdown: the small fuse, **2:5x**, "· N". A screen reader reads "Jump-Scare Witness drop open, 2 minutes 50 seconds left, N claimed".
5. On A the drop shows as open, and A can still +1 / Close it.

## 7. Recruit Rush with a reward badge

1. A, the **Recruit Rush** card: turn it on, goal **5** (the lowest), a reward text, and **Reward badge (optional)** = **Boss Fight Believer**. Save. Badges already dropped this stream show "(dropped)" and can't be picked.
2. Make the goal hit (five finished signups during the stream, or a goal already met). Expect on A's Live drops panel, on top: the dashed gold card "**Rush goal hit: 5 recruits** · Drop Boss Fight Believer for everyone? Preset 10 min." with **Open drop** and **Not now**.
3. While another drop is open, the card waits; it comes back once that drop has closed. It never shows for a badge already dropped this stream.
4. **Not now** hides it for this viewer until the reward badge changes. Changing the reward badge after the hit (before the Rush drop) moves the prompt to the new badge.
5. The Captain (step 6) sees the same card in the helm panel, because Boss Fight Believer is a Captain badge.
6. **Open drop** (from either). Expect: the drop opens with the preset; the card goes away for everyone; the Rush picker on A is **locked** with "The Rush drop is out: the badge is set for tonight."

## 8. The stream view

1. Streamlabs (wide, 1920 × 1080 browser source, see the Control Room plan W3): open a drop. Expect, in the **top left**: "Live drop · claim at boomertanger.com/live", the fuse, the badge name, the countdown and "· N". It slides in. Colours: gold, lime and gray only (no purple). It clears every scene's panels (stats, side rail, Break camera, Be right back).
2. Close it: **Last call**, then **Closed**; 10 s after the drop closed it slides out. For a draw it shows "@handle wins" in lime, then slides out after 10 s.
3. TikTok LIVE Studio (tall, 1080 × 1920): the callout sits **above the captions band** and left of the buttons. Check it with the platform's phone preview.

## 9. Looks, phones, motion

1. Phone width (390 px) on any page: the strip is **one line** (fuse, name, timer, button); the "Live drop" label is hidden for open, visitor and the dropper; **Last call** always shows.
2. Open a check-in window and a drop at once: the two strips **stack, check-in first** (desktop and phone).
3. /live in **Hull** and in **CRT** (the house look switch on A): the drop card follows the look; the countdown glows gold; nothing changes colour meaning.
4. Turn on reduced motion (OS setting): no flip, no spinning dashed ring, no blinking Last call; the stream view callout fades instead of sliding.

## 10. Rules (signed in; manual until a rules test harness exists)

Use the Firebase console, **Firestore → Rules → Rules Playground**, on the staging project, with **Authenticated** and the uid filled in:
1. A member (B's uid) **get** `sites/boomertanger/drops/<dropId>/claims/<B's uid>` → **allowed**.
2. The same member **get** `.../claims/<another uid>` → **denied**.
3. The same member **get** `sites/boomertanger/drops/<dropId>` → **denied**.
4. A crew member (a mod or admin uid: the custom claims carry the roles, so test with their real uid) **get** `sites/boomertanger/drops/<dropId>` → **allowed**. The owner too.
5. Anyone **create/update** under `drops/` → **denied** (every write goes through the functions).

## Preview URLs (localhost and staging only, local data, nothing written)

Banner on any page (the shell's `?as=` decides who is looking):
- `/?drop=<kind>&as=member`, kinds `open`, `until`, `closing`, `claimed`, `already`, `draw`, `entered`, `drawing`, `won`, `lost`, `closed`, `dropper`
- visitor `&as=visitor`; mid-signup `&as=member&signup=1`; dropper `/?drop=dropper&as=admin`
- stacked with a check-in: `/?state=break&live=public&drop=open&as=member`

/live card: `/live/?live=public&drop=<kind>&as=member` (or `&as=visitor`), `&look=crt` for CRT.

Stream view: `/live/obs/?demo=1&layout=wide|tall&scene=stats|break|brb|side&drop=open|until|closing|drawing|won|closed`, plus `&look=crt` or `&guides=1` (TikTok's safe zones, tall).

The panel and Recruit Rush (owner, Captain):
- `/live/control/?as=admin&state=live` (the panel; `&state=idle` for "not live"; `&look=crt`)
- Rush prompt ready: `&rush=20` (a hit Rush on a goal of 20, reward badge Boss Fight Believer); waiting behind an open drop: `&rush=20&predrop=jump-scare-witness`; hidden, already dropped: `&rush=20&dropped=boss-fight-believer`; before the hit: `&rush=14`
- Captain: `/live/deck/?as=captain` (then Drop a badge; on phones, the Tools tab), with `&rush=20` or `&rush=20&predrop=glitchwitness`
