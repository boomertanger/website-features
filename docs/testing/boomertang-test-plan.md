# Boomertang: staging test plan

Spec: `docs/specs/boomertang.md` (§3 who reads what, §10 testing). Already checked by Claude Code in headless Chromium against staging (Oct 17, 2026):
the kit page (15 checks), the newsstand and issue shell (22), No. 1's pages (18), The Map (19), Survive, Secrets, The Gauntlet and
Chat's Verdict as a visitor (23) and as real signed-in members (14: voting, changing a vote, the reading rule; the votes were reversed
afterwards), How it works (23), the desk (13) and the Game Vault link (6). The rules check (25 checks, custom users, cleans up) and the
functions check pass. What's left needs your accounts, two devices, real phones and the owner's desk. Hard refresh (Ctrl+Shift+R) before
each round.

**Staging right now** (seeded with `--samples`): No. 1 (public, text in the repo), No. 2 (sample, members), No. 3 (sample, made public),
No. 4 (sample, members, the **newest** issue: `tang/main.currentIssueId = v1n4`). No. 1's three polls are open with no votes.
`node functions/scripts/seed-boomertang.js --clean --apply` removes the samples and points the newsstand back at No. 1.

## A. Who reads what (spec §3)
For each reader, open `/boomertang`, then No. 1, No. 2 (a members back issue) and No. 4 (the members newest issue). "Sealed" means
the cover and contents show, and the pages show the sealed shell with its button.

| Reader | No. 1 / No. 3 (public) | No. 2 (back issue) | No. 4 (newest) |
|---|---|---|---|
| Signed out | Everything | Sealed: Join free | Sealed: Join free |
| Fan Club member (free, signed up) | Everything | Everything | Sealed: Sub Club |
| Member with the staging `sub` role | Everything | Everything | Everything |
| @gbo (admin) | Everything | Everything | Everything |
| Owner | Everything | Everything | Everything |

1. Each row above, on the PC. The lock icons in the contents match what opens.
2. The Join free button opens sign-up. After signing up, No. 2 opens without a reload.
3. A members page opened by its URL while signed out shows the sealed shell, never the text (also check View source: the text isn't there).

## B. Paper / Ink across two devices
1. Signed in, switch No. 1 to Ink on the PC. Open No. 1 on your phone with the same account: it opens in Ink.
2. Switch back to Paper on the phone, then hard refresh the PC: Paper.
3. Signed out: the switch still works and is remembered in that browser only.

## C. Chat's Verdict (No. 1)
1. As a member, vote on all three polls. The bars and counts update, and your pick is marked.
2. Change one vote: the old option goes down one, the new one goes up one, and the total stays the same.
3. Refresh: your picks are still marked. Signed out: the polls show the results, and voting asks you to join free first.
4. Afterwards, close and reopen a poll from the desk (section D) and check that the page follows.

## D. The owner's desk (`/admin/boomertang`, owner account)
1. `/admin` shows the Boomertang card: "No. 4 is the newest issue". It's hidden for @gbo and plain members.
2. The desk lists No. 4 to No. 1 newest first, with their badges. No. 1's access switch is locked on ("Locked on: its text is in the repo").
3. **The setAccess refusal for No. 1:** the switch can't be turned off on the page. The server refuses it too (the functions check covers this; nothing to do unless you want to try it from the console).
4. Turn No. 2's switch on (make it public). Signed out, No. 2's pages open. Turn it back off: they're sealed again.
5. **Publish and the back-issue switch:** run `--clean --apply`, then seed `--samples` but leave one sample as a draft (or ask Claude Code to make No. 4 a draft). Publish it from the desk: the stamp slams, `/boomertang` shows it as the newest issue, and the issue before it becomes a back issue. A Fan Club member can now read that back issue (spec §3).
6. **The edition note:** add a note to No. 1 ("Fixed a typo on The Map", say). It appears at the top of the edition log on the desk, and on No. 1's cover under "This issue is alive" (and on /boomertang while No. 1 is the newest issue). An empty note, or one over 120 characters, is refused.
7. Close a poll, then reopen it. Sources to re-check lists nothing until a source was last checked more than 30 days before the build (No. 1's were checked Oct 15, 2026, so they show from mid-November).

## E. Rules (Claude Code runs this)
1. `node functions/scripts/boomertang-rules-check.js --apply` on staging: all checks pass, and the test users are deleted afterwards.

## F. Phones (iPhone Safari and Android Chrome)
1. `/boomertang` and No. 1's cover: the cover fits the screen, with the phone cover lines. Nothing scrolls sideways.
2. Swipe through the pages with Turn the page. The issue bar's page menu works with a thumb.
3. The Map: pinch and drag inside the frame, change floors and layers, and tap a pin. The page itself doesn't zoom.
4. Survive: open a room's guide, and tap a Watch the short link.
5. Secrets: tap to reveal, and the redaction lifts.
6. How it works: the chip row sticks, the scenes play, and Ask BOOMBOT answers.

## G. The cover QR code
1. Print No. 1's cover (or open it on a second screen) and scan the QR code with a phone. It opens `https://boomertanger.com/boomertang?ref=tang-cover`. Until the domain points at the new site, it lands on the live Squarespace site: that's expected, and it's re-checked at launch (spec §13).
2. `/admin/pulse` → Ref tags lists `tang-cover` ("Boomertang cover QR"). It's seeded by `seed-boomertang.js`.

## H. Facts
1. Boomer checks every fact tag on No. 1 against its source in The Index (Claude Code matched them; the editor confirms).

## I. Odds and ends
1. The Game Vault: `/games/granny`, `/games/granny-chapter-two` and `/games/granny-3` have the "In Boomertang" card linking to No. 1. Other games don't.
2. Nav: Community → Boomertang. The footer's boomertang.com entry goes to `/boomertang`.
3. Ask pins: The Map, Survive and Speed have the Ask pin next to the page title.
4. Reduced motion (Windows: Settings → Accessibility → Visual effects → Animation effects off): nothing slides, flickers or slams.
5. `/club-pass`: the Boomertang perk (no longer Coming soon). With No pass lit it reads "No. 1 is free to read", with Fan Club "Yours with Fan Club" (back issues), with Sub Club "Yours with your gold pass" (the newest issue first). A signed-in member gets Open it, which goes to `/boomertang`.
