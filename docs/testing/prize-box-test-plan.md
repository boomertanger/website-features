# Prize Box: staging test plan

Already checked by Claude Code (Oct 17, 2026), all passing:
- `npm run check` in functions/. `check-prize-box.js` covers every core callable and prizeTick against the in-memory Firestore. `check-prize-draw.js` covers the live draw built inside lib/live: the pool, both rounds, Spin again, I'm here, the timeout respin by the task and by the backstop, Respin without them, the Chat Game block, one draw at a time, the stream's end voiding a draw and the rerun from its snapshot, and public/live with handles only.
- Headless Chromium on the preview build:
  - the kit section: 17 checks
  - the live UI: the banner, the /live card, the owner's panel and the stream view wide and tall, 35 checks
  - the pages: /prizes, a contest page in every state, the rules, /prizes/mine and the claim dialog, 38 checks
  - /admin/prize-box against staging with a throwaway admin, signed in for real: 17 checks
  - 390 px and reduced motion

What's left needs the owner's account, real members, a live stream and real devices. Hard refresh (Ctrl+Shift+R) before each round.

**Sample data:** `node functions/scripts/prize-sample.js --apply` (staging only) adds four contests marked "(sample)" with five sample members:
- a scheduled Break Wheel
- an open written contest with four entries
- an open mail-in contest with three codes and one unmatched envelope
- a finished contest with two winners

`--clean --apply` removes all of it. Nothing it makes grants a badge, XP, a feed post or an alert.

**Previews (staging and localhost only):**
- `?prize=pool|round1|still|out|wheel|spinning|picked|waiting|won|wonme|nospin` on any page, /live and /live/control
- `/live/obs?demo=1&prize=spinning&layout=wide|tall`
- `?sample=1` on /prizes, a contest page and /prizes/mine

## A. The pages, signed out and signed in
1. `/prizes` signed out: the PRIZE BOX bar shows only Contests; the hero offers Join free. Click the wheel: it spins with you on the yellow blade, the box shakes, the lid flies off and a card rises ("It's you!" in lime on the yellow blade). Nothing is saved.
2. The same page as a member: My entries in the bar, See open contests in the hero, See the schedule in the closing call. As an admin: the Admin button in admin green.
3. Open now lists the sample contests with their hover scenes (the wheel turns, the pencil draws, the envelope opens). Past winners shows @sampleteen and @samplehex. The flow lights a path on hover and on a tap. Spin the wheel lands on a name.
4. The header's Play menu lists "Prize Box: Contests, drawings and prizes".
5. `/prizes/sample-ghost-story` (a real address: the rewrite to /prizes/view must work on Cloudflare): the written entry form; send one, replace it, withdraw it. `/prizes/sample-ghost-story/rules` shows the template with its "Waiting for legal review" note.
6. `/prizes/sample-haunted-postcard`: Get my entry code shows a PB- code and the mailing address (set it first on /admin/prize-box → Settings).
7. `/prizes/mine` signed out: the lock card. As a member with entries: your entries with their status.

## B. Online uploads (Cloudinary)
1. Make an online picture contest in the builder (Online art), publish it, and enter it from a member account with a JPG, a PNG and a WebP. Try a GIF and a file over 10 MB: both are refused.
2. Replace the picture: the old file is gone from Cloud Stash (externalAssets, feature prizeBox).
3. As an admin, Entries → See the file opens a 10-minute link; Accept one, Reject one with a reason; the member sees the reason on /prizes/mine.
4. With Cloud Stash's uploads paused for members, Send my entry says uploads are paused.

## C. Judging, random draws and claims (the owner)
1. Close entries on your test contest, then Pick winners: the winners get the Prize Box Winner badge (×1 on their profile, ×2 after a second win) and the "prize-winner" notice. Only winners who said "show me" appear in the feed and on /prizes.
2. On the mail-in sample: Mail log → PB-SAM3 + today's date → Mark received; a postmark after the deadline is logged as late. Then Close, and Draw winners.
3. Claims (owner only): the sample's mailed prize shows "Address hidden". Show address: it appears, and adminLog has a "show-address" entry with no address in it. Mark shipped: the stamp, a toast, and the winner's "prize-shipped" notice.
4. Set the code on a code prize. As the winner, claim it on /prizes/mine: the code shows only after claiming.
5. Claim as a 13-17 member: refused without the parent's OK box, accepted with it. A mailed prize refuses a non-US address.
6. Let a claim window run out (or set the claim days to 1 in Settings): prizeTick sends a reminder a day before, then forfeits it, and Claims offers Redraw.

## D. The live draw, end to end (needs a staging stream and two or more test members checked in)
1. Start a staging stream. Members check in at the beat. Optionally start a Chat Game: Run the draw is blocked and the panel offers to end the game.
2. On /live/control at Break 1 (the sample Break Wheel is due then): the "It's time" badge and a toast. Leave Round 1 on and press Run the draw: the pool counts add up (checked in, minus crew, minus the cooldown).
3. Add the stream view (`/live/obs?k=…&layout=wide`, then tall) as a Streamlabs browser source with "Control audio via OBS" on. Spin round 1, then Spin for the winner. Every phone, /live and the stream view show the same spin at the same moment, with one tick per peg on stream. Spin again blades re-pick on their own.
4. On the picked member's phone, the banner on another page and the /live card both say "It landed on you" with the countdown. Let the 60 seconds run out once: the wheel respins among the others on its own. Then tap I'm here: the box bursts on the stream view, /live and the winner's screen, and the winner card says "It's you!" in lime on the winner's own screen.
5. Respin without them works mid-window. Done clears the stream view, the banner and the card. The Draws tab has the record: the pool, both rounds, every spin and respin, and the result.
6. Run another draw and stop the stream mid-draw: the draw is void. On the next stream, Run the draw reruns it from the same pool snapshot.
7. A member who won a live draw in the last 30 days isn't in the next live draw's pool.

## E. Real phones (iPhone Safari and Android Chrome)
1. /prizes: the rail turns into the chip row, the hero spin works by tap, and the stage cards play their scenes on a tap.
2. A contest page: the dropzone opens the photo picker; the entry and the claim dialog fit the screen.
3. /live during a draw: the card's I'm here button is big and easy to hit; the sound button turns the tick on and off.
4. /admin/prize-box at phone width: the tabs scroll sideways and the builder's steps are usable.

## F. Clean up
1. `node functions/scripts/prize-sample.js --clean --apply`. Delete your test contests from /admin/prize-box (owner: Delete), which removes their files, codes, winners and feed posts.
