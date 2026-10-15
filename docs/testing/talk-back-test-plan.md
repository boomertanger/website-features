# Talk Back test plan (Parts A and B)

Hand-run checks for Talk Back Part A on staging: the dialog, BOOMBOT, the inbox context bar and Sources › By service. Spec: `docs/specs/talk-back.md` §0-§7. The automated checks cover the backend (`npm run check` in `functions/`: kind, context and boombotShown stored, invalid context dropped, team-lane counts in serviceStats, owner-lane messages kept out of it, contactDeflect's limit) and the manifests and help files (`npm run check` in `site/`).

Accounts: **Owner** (boomertanger@gmail.com), an **inbox admin** (Overseer A2, for example @gbo), a **member** with no crew grade, and a **visitor** (signed out, ideally a private window). Hard-refresh with **Ctrl+Shift+R** after a deploy. Turnstile must list the staging hostname (see the Hotline Boom test plan), or every visitor send fails with "The check didn't pass".

**Where to test.** The strip with the Talk back half is on every page whose manifest says `note` or `pins` (the list is in the Part A build report and in `services/*.json`). Good ones: **/bug-zapper/how-it-works** (it has a help file, so BOOMBOT answers), **/arcade/tap-the-splat**, **/schedule**, **/live**. /contact uses `rate` (Rate half only, never the dialog). **Ask pins:** no page places one yet; when one does, its pin opens the dialog with that section.

## A. The dialog

1. **Visitor, Question.** /bug-zapper/how-it-works, scroll to the strip at the end ("Rate it" and the purple **Talk** pill), tap **Talk**. Expect: a centred dialog (a bottom sheet on a phone), the dial icon, "ASK ABOUT BUG ZAPPER", the tag "Community › Bug Zapper", Question pressed, the cursor in the text box, Your name and Your email, for the reply, Only Boomertanger should read this, and the Cloudflare line.
2. **BOOMBOT.** Type `who can see my screenshot`. Expect: after a moment of typing dots, BOOMBOT's bubble "BOOMBOT: this might answer it" with **Who can see my report?** and its answer, then **That answers it** and "Not quite? Just send it." Clear the text: the bubble goes. Under reduced motion: no dots, the answer appears straight away.
3. **Answered.** Tap **That answers it**. Expect: the toast "Glad BOOMBOT could help. Nothing was sent.", the dialog closes, focus is back on the Talk pill, nothing in the inbox. Owner, /admin/inbox › Sources, By service: **Answered by BOOMBOT** went up by 1 (do it twice in one dialog: still +1).
4. **Sent anyway.** Open it again, type a question that triggers BOOMBOT, fill name and email, **Send**. Expect: "Sending", then the purple **Hotline / Sent / BT-48xx** stamp, "Got it, thanks!", "Boomertanger usually replies within 3 days, by email to <you>. Filed under Bug Zapper.", the **Join free** card, **Back to the page**.
5. **Empty send.** Open it, **Send** with nothing filled. Expect: red errors on the message, name and email; focus in the message box.
6. **Feedback.** Tap **Talk**, then **Feedback** in the dialog. Expect: "FEEDBACK ON BUG ZAPPER", Feedback pressed, no BOOMBOT however you type. Switch to Question and back: the text stays.
7. **Close guard.** With text typed, press Escape (or the ✕, or tap outside). Expect: "Discard it?". Cancel keeps the dialog and the text; Discard closes it. Empty: closes with no question.
8. **Member.** Sign in as a member, send a Question from /arcade/tap-the-splat. Expect: no name or email; "Sending as @handle. The reply arrives in your alerts."; Sent says "The reply will land in your alerts, usually within 3 days. Filed under Tap the Splat." and no Join card.
9. **Something's broken, member.** Pick **Something's broken**. Expect: "Bug Zapper is faster for this." and **Report in Bug Zapper**; it opens /bug-zapper with the report form open and this page's path filled in. **Send it as feedback instead** switches to Feedback with the text kept.
10. **Something's broken, visitor.** Expect: "Bug Zapper is faster for this, and it needs a free account." and **Join free** (the dialog closes and the sign-in dialog opens on Join), plus Send it as feedback instead.
11. **Section removal** (needs a page with an Ask pin; until then, from the console: `btTalkBack.open({ serviceId: "schedule", section: "ballot", mode: "question" })` on /schedule). Expect: the tag "Watch › Schedule › The ballot" with a small ✕ ("Remove the section"). Tap it: the tag becomes "Watch › Schedule"; the service can't be removed. Send: Filed under "Schedule".
12. **Too many.** As the visitor, send a 4th message within the hour (visitors get 3 an hour, shared with /contact; members 5 a day). Expect: the gold notice "You've sent a lot of messages in the last hour. You can send another after <time>. Your message is still here." and Send greyed out.
13. **Line off.** Owner, /admin/inbox › Settings, switch line 2 off. Open the dialog. Expect: "This line is closed right now" with Open the contact page. Switch it back on.
14. **Unknown service** (console): `btTalkBack.open({ serviceId: "nope-not-real", mode: "question" })`. Expect: "ASK ABOUT THIS PAGE", no tag, no BOOMBOT; sending works.

## B. The inbox

15. **Context bar.** Owner, /admin/inbox, open the message from A4. Expect: its row reads "Question: …"; between the header and the message, "From [Community › Bug Zapper] **Open the page**" and "BOOMBOT showed 1 answer; they sent it anyway." Open the page opens /bug-zapper/how-it-works in a new tab (no ?query, no #hash). The A6 feedback reads "Feedback: …" with no BOOMBOT line.
16. **Old messages.** A line 2 message sent before today (no kind) reads "Feedback: …" and has no context bar.
17. **/contact switch.** /contact, line 2: "Is it a question or feedback?" with Question / Feedback (Feedback by default). Pick Question: the placeholder becomes "What would you like to know?". Send: the inbox row reads "Question: …" with no context bar.

## C. Sources › By service

18. **Owner.** Sources tab, By service. Expect: the key (Questions blue, Feedback teal) with totals, one split bar per service (name, area, total; the longest bar is the busiest service), "Includes N owner-only messages. Inbox admins don't see these.", and Answered by BOOMBOT. 30 days / 90 days / All time change the numbers.
19. **Owner-lane privacy.** As the visitor, send a Talk Back message with **Only Boomertanger should read this** ticked from /tech-stack. Owner: Tech Stack appears in By service and the owner-only count goes up by 1. **Inbox admin** (@gbo), Sources: Tech Stack is **not** there (unless a team-lane message came from it), there is no owner-only line ("Counts the team lines only."), and the message itself isn't in the inbox.
20. **Name check.** Send a Talk Back message that names a crew member's handle. Expect: it goes to the owner lane like any /contact message, and is counted for the owner only (as in 19).
21. **The hint.** Five questions from one section in the period (the console call from A11, five times as different visitors or members). Expect: the gold notice "Schedule › The ballot keeps coming up. 5 questions in 30 days. Its help may need a line about it."
22. **Empty.** Inbox admin on a fresh project, or a period with none: the mascot and "No questions from feature pages yet."

## D. Data (console or Firebase console)

23. `sites/boomertanger/hotline/main/teamMessages/<id>` for A4: `kind: "question"`, `context: { serviceId, section, path, title }` (the path with no query), `boombotShown: ["who-sees"]`.
24. `hotline/main/serviceStats/<yyyy-mm>`: `byService.bug-zapper.questions`, `.feedback`, `.boombot`; no text, uid or email anywhere in it. The owner-only message from C19 is **not** counted here; it is in `stats/<yyyy-mm>.byService` (owner only).
25. As a member (not an admin), reading `serviceStats` from the console is denied; as a site admin it's allowed.

## Results (Oct 14, 2026)

Run on staging by the owner, with @gbo (inbox admin) and a visitor.

- **Passed:** A1-A11, A14, B15, B17, C18, C19, D24.
- **Not run yet** (low risk: the same code as Hotline Boom's tests, or covered by `scripts/check-hotline.js`): A12 (too many), A13 (line off), B16 (old messages), C20 (name check), C21 (the hint), C22 (empty), D23 (the stored fields), D25 (serviceStats rules).
- **Found and fixed:** page paths are now stored without a trailing slash, so `/bug-zapper/` and `/bug-zapper` are one path and sub-pages are kept exactly (commit "Talk Back: page paths without a trailing slash", `42a529a`; contactSend redeployed). Messages sent before it keep their old path.
- **Not a bug:** in B15, Open the page went to /bug-zapper because A4 and A6 were sent from /bug-zapper, not /bug-zapper/how-it-works (the stored path and the page title both say so).
- **Also changed during testing:**
  - the compact page strip, V5 "Talk word pill" + S1 (`03e399a`);
  - the strip label: "Rate it" on phones, "Rate {service}" at 420px and up (`5becc34`, after the short-lived "Rate page" label in `3e92be0`);
  - the rating toast names the service: "Thanks! That's your rating for all of {service}. Only Boomer and the admins see ratings." (`5becc34`);
  - dialogs no longer jump to the top on close: openModal's scroll lock saves and restores the scroll position, and tapping outside no longer falls through to the page (`6b3611a`).
- In A1, A6 and A11 the strip now has one **Talk** pill instead of Ask a question and Give feedback; Feedback is chosen inside the dialog.

# Part B: inbox recognition

Hand-run checks for Talk Back Part B on staging: Pick up, the credit line, the This month strip, Desk clear, the spam stamp, the crew board's Inbox column, the inbox values and Adjust Gears on /admin/crew, and Operator of the Month. Spec: `docs/specs/talk-back.md` §9; mockup `docs/design/mockups/talk-back-recognition.html` (P1, K1, S1, O1). The automated checks cover the rules for paying Gears (`npm run check` in `functions/`, `scripts/check-hotline.js` and `scripts/check-crew.js`): two replies at once pay once, the daily cap, the owner, owner-lane and self-sent messages pay nothing, escalation keeps the payment and doesn't break a clear day, the spam reversal, the spam hold and its daily max, a clear-desk week, the Pick up and Let it go permissions, gearsAdjust, and the award.

**Accounts.** The **inbox admin is @gbo** (uid `uoTkquoPL9abAJMKsiAuSi7D20R2`). Checked on Oct 15, 2026: the `crewGrade` claim is `A2`, the crew roster has an active admin at grade 2, and `hotline/main.inboxGrades` is `["A2", "A3"]`. @gbo is the only inbox admin on staging, so it is the only account that earns inbox Gears. The **owner** works the inbox too but never earns. Use a **visitor** (a private window) to send messages. Hard-refresh with **Ctrl+Shift+R** after a deploy.

**Sample data (optional).** `node functions/scripts/inbox-sample.js --apply` writes two weeks of sample inbox work. It runs the real code as @gbo: replies (fast and slow), spam that held, a reversed reply, a close, an escalation and a 7-day Clear desk run. It ends with three waiting messages, one of them picked up. It pays real staging Gears. `--as-of 2026-10-31` moves the two weeks; `--clean --apply` removes everything it made (messages, Gears rows, the inboxStats months it touched, its adminLog entries) and rebuilds the boards. It refuses production. Use it to see the strip, the pips and the board column straight away. The steps below also work without it.

## E. Pick up

26. **Row button.** @gbo, /admin/inbox. Each unassigned New or Open team-lane row has a green **Pick up** at its right edge. Tap one. Expect the toast "Picked up. It shows as yours on the row.", and the row now reads "Picked up by @gbo" instead of the button. On a phone (390 px) the row button is hidden and the message's action row has it.
27. **Detail.** Open an unassigned message: **Pick up** (green, hand icon) is beside **Reply**. Tap it. Expect "Picked up by **@gbo** · Let it go", and the history gains "Picked up by @gbo".
28. **Let it go.** Tap **Let it go**. Expect "Let go. Anyone can pick it up.", the Pick up button back, and "Let go by @gbo" in the history. As the owner, a message @gbo picked up shows "Picked up by @gbo" with **no** Let it go. The assign select still works for everyone, and reassigning clears the "Picked up by" line.
29. **Not for owner-only.** Owner, an Owner only message: no Pick up anywhere.

## F. Credit line and Gears

30. **First reply, paid.** Visitor sends a Say hi. @gbo opens it (it is the oldest waiting team message if nothing older is waiting) and replies (email is off, so **Open in my email**, then **Mark as replied**). Expect the lime **Hotline / Replied** stamp, the toast "Marked as replied. +7 Gears (4 reply + 2 fast + 1 oldest first).", and in History, under the reply, a gold line "**Paid 7 Gears to @gbo** (4 reply + 2 fast + 1 oldest first)" and **How Gears work here**. That link goes to /admin/inbox/how-it-works (Part C, not built yet: a 404 for now). If an older message was waiting, it's +6 with no oldest first.
31. **Second reply.** The owner replies to the same message. Expect no new credit line and no Gears; the first reply is decided once.
32. **Owner pays nothing.** The owner replies first to a new message. Expect no credit line. The owner never earns.
33. **Self-sent.** @gbo, signed in as a member on /contact, sends a Say hi, then replies to it from the inbox. Expect no credit line.
34. **Owner only.** A visitor message with **Only Boomertanger should read this** ticked: the owner replies and gets no credit line (owner-lane messages never pay).
35. **The board.** /crew/board: a new **Inbox** column (desktop; hidden on phones like Duties, Hours and Recruits). @gbo shows their first replies this month; mods show "—". @gbo's Gears total includes the inbox Gears.
36. **Remove credit.** Owner, the message from F30: the credit line has **Remove credit**. It opens /admin/crew at **Adjust Gears** with @gbo, the amount -7 and "Reverses 3 payments on BT-…". Write a reason and tap **Adjust Gears**, then confirm. Expect "Adjusted. @gbo now has N Gears.". In Firestore, `crew/main/gears/adjust:…:<uid>` has amount -7, the reason and `reverses`, and adminLog `crew / gearsAdjust` has the reason and before / after.
37. **Daily cap** (needs volume: the sample script, or about five fresh replies in one Chicago day). Past 30 inbox Gears in a day, the credit line is gray: "No Gears for this reply. @gbo reached today's inbox cap (30). Resets at midnight Central." If only part of a reply fits under the cap, the gold line ends "Today's cap (30) stopped the rest".

## G. Spam

38. **Mark spam.** @gbo opens a fresh visitor message and sets the status to **Spam**. Expect the gray **Marked / Spam** stamp, and the toast "Marked as spam. 1 Gear pending for 7 days." with **Undo** for 10 seconds. History: "1 Gear pending: it pays in 7 days if it stays spam."
39. **Undo.** Tap **Undo** within 10 s. Expect "Back in the inbox. No Gear pending.", the message back in its old status, and the pending line now reads "No Gear pending: it isn't spam any more."
40. **Spam after a paid reply.** Mark the F30 message spam. Expect a gray history line "**7 Gears reversed** from @gbo: marked as spam." (an `adjust` row with reason "Marked as spam"), and @gbo's total on /crew/board drops by 7.
41. **Spam that held** (the sample script, or wait 7 days). `inboxSpamHold` runs daily at 04:15 Central and pays 1 Gear for each mark that has stood for 7 days, at most 5 a day per person. The pending line then reads "Spam held. 1 Gear paid to @gbo." The owner un-spamming someone's mark before then pays nothing and counts against their Accuracy.

## H. This month strip and Desk clear

42. **Strip.** Top of the Inbox tab, for the owner and @gbo: **This month** with "Team median reply", seven Clear desk pips (lime = a clear day) and "Clear desk: N days in a row", then one card per inbox admin. Each card shows first replies, within 24 h, median, Tidied (spam that held + closed with no reply), and Accuracy (or "No spam marks"). Accuracy under 90% has a gold outline. Before any work this month: the mascot and "No replies yet this month." On a phone the cards are a swipe row.
43. **Desk clear.** With one waiting (New or Open) team message left, reply to it, close it or mark it spam. Expect the mascot at an empty desk with the lime **Desk / Clear** stamp, "DESK CLEAR", and the streak line above the list, once. Reload: it's gone. Under reduced motion the stamp appears still.
44. **Close with no reply.** Set a waiting message to Done without replying. Expect "Marked Done.", plus "+1 Gear (1 oldest first)" when it was the oldest waiting. Tidied goes up by 1 on the card.
45. **Escalation is neutral.** Reply to a message (paid), then **Owner only**. Expect the Gears stay (the owner sees the credit line on the moved message), and @gbo's first replies on the card drop by 1.

## I. /admin/crew

46. **Inbox values.** @gbo (A2), /admin/crew › Settings: **Hotline Boom inbox** has 14 numbers and the Operator of the Month switch, all editable, with **Save inbox values**. The other crew settings stay read-only for @gbo. Change First reply to 5 and save: the next paid reply's credit line says "5 reply". Put it back to 4. A Steward (A1) or a mod sees the values read-only.
47. **Adjust Gears by hand.** /admin/crew › Adjust Gears: a handle, an amount (not 0, ±1000), a reason (3 to 200 characters). @gbo can't adjust their own Gears ("Ask the owner to adjust your own Gears."); the owner can adjust anyone's.

## J. Operator of the Month

48. **The card.** /crew: the awards row has five medals. **Operator of the Month** (a gold coin with ☎️) sits between Top Gear and Fan Favourite. Flip it: the winner and a plain line like "14 first replies, 6 tidied, 5 oldest first. Median reply 5 h.", or "No Operator this month (nobody reached 5 first replies)". Preview: /crew?as=crew.
49. **The run.** `crewMonthlyAwards` (the 1st, 00:05 Central) picks it for the month just ended, from `hotline/main/inboxStats/{yyyy-mm}`. The score is first replies + 0.5 per spam mark that held + 1 per oldest first, among staff with at least 5 first replies and 90%+ accuracy. Ties go to the lower median reply time. The run writes `awards/{yyyy-mm}.operator`, grants a `crew-operator` trophy (in the Trophy Room) and posts a `crew-award` activity event. The first real run is Nov 1 for October.

## K. Data and rules

50. `hotline/main/inboxStats/<yyyy-mm>`: `perStaff.<uid>` (replies, fast, oldest, minutes by message id, spamMarks, spamHeld, spamOverturned, closed) and `desk` (streak, lastDay, lastClear, clearDays). A team message @gbo replied to has `firstReplyBy`, `firstReplyMeta` and `gearsPaid { amount, uids, ledgerIds, parts }`. A spam mark has `spamBy` and `spamAt`; a pick up has `pickedUpAt`.
51. From the console, as a member or a mod, reading `inboxStats` is denied; as @gbo or the owner it's allowed. Nobody can write it.
52. Cloud Scheduler has `inboxSpamHold` (04:15 America/Chicago) and `inboxDeskCheck` (21:00 America/Chicago); their logs print what they did.

## Part B results (Oct 15, 2026)

Run on staging by the owner with @gbo (the inbox admin), after the sample data from `inbox-sample.js`.

- **Passed on staging:** E26, E28, F30, F32, F36, G38-G39, G40, H42, H43, J48. The full 172-function batched deploy (lib/live first, then nine batches with 3-minute pauses) ran with no retries.
- **Not run by hand** (covered by `scripts/check-hotline.js` and `scripts/check-crew.js`, or needs time to pass): E27, E29, F31, F33-F35, F37, G41, H44-H45, I46-I47, J49, K50-K52.
- **Fixed:**
  - `390c450`: a replied message left Open no longer counts as waiting (Desk clear, Pick up).
  - Remove credit lands on Adjust Gears: the section renders after sign-in, so /admin/crew now scrolls to it (no smooth scroll under reduced motion) and focuses the reason once it's filled in.
  - The spam toast's Undo lasts 10 seconds (was 5).
  - Medal backs fit their card: the kit's flip back is tighter and centres safely, and flip cards are taller on phones. Checked on /crew, the Trophy Room and every page with flip medals at 1280, 1024, 390 and 320.
- **Note:** while email is off, the reply box shows **Send reply** first. It switches to **Open in my email** and **Mark as replied** after a try (F30).
