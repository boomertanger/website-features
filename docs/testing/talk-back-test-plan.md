# Talk Back test plan (Part A)

Hand-run checks for Talk Back Part A on staging: the dialog, BOOMBOT, the inbox context bar and Sources › By service. Spec: `docs/specs/talk-back.md` §0-§7. The automated checks cover the backend (`npm run check` in `functions/`: kind, context and boombotShown stored, invalid context dropped, team-lane counts in serviceStats, owner-lane messages kept out of it, contactDeflect's limit) and the manifests and help files (`npm run check` in `site/`).

Accounts: **Owner** (boomertanger@gmail.com), an **inbox admin** (Overseer A2, for example @gbo), a **member** with no crew grade, and a **visitor** (signed out, ideally a private window). Hard-refresh with **Ctrl+Shift+R** after a deploy. Turnstile must list the staging hostname (see the Hotline Boom test plan), or every visitor send fails with "The check didn't pass".

**Where to test.** The strip with the Talk back half is on every page whose manifest says `note` or `pins` (the list is in the Part A build report and in `services/*.json`). Good ones: **/bug-zapper/how-it-works** (it has a help file, so BOOMBOT answers), **/arcade/tap-the-splat**, **/schedule**, **/live**. /contact uses `rate` (Rate half only, never the dialog). **Ask pins:** no page places one yet; when one does, its pin opens the dialog with that section.

## A. The dialog

1. **Visitor, Question.** /bug-zapper/how-it-works, scroll to "How's Bug Zapper?", tap **Ask a question**. Expect: a centred dialog (a bottom sheet on a phone), the dial icon, "ASK ABOUT BUG ZAPPER", the tag "Community › Bug Zapper", Question pressed, the cursor in the text box, Your name and Your email, for the reply, Only Boomertanger should read this, and the Cloudflare line.
2. **BOOMBOT.** Type `who can see my screenshot`. Expect: after a moment of typing dots, BOOMBOT's bubble "BOOMBOT: this might answer it" with **Who can see my report?** and its answer, then **That answers it** and "Not quite? Just send it." Clear the text: the bubble goes. Under reduced motion: no dots, the answer appears straight away.
3. **Answered.** Tap **That answers it**. Expect: the toast "Glad BOOMBOT could help. Nothing was sent.", the dialog closes, focus is back on Ask a question, nothing in the inbox. Owner, /admin/inbox › Sources, By service: **Answered by BOOMBOT** went up by 1 (do it twice in one dialog: still +1).
4. **Sent anyway.** Open it again, type a question that triggers BOOMBOT, fill name and email, **Send**. Expect: "Sending", then the purple **Hotline / Sent / BT-48xx** stamp, "Got it, thanks!", "Boomertanger usually replies within 3 days, by email to <you>. Filed under Bug Zapper.", the **Join free** card, **Back to the page**.
5. **Empty send.** Open it, **Send** with nothing filled. Expect: red errors on the message, name and email; focus in the message box.
6. **Feedback.** Tap **Give feedback** on the strip. Expect: "FEEDBACK ON BUG ZAPPER", Feedback pressed, no BOOMBOT however you type. Switch to Question and back: the text stays.
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
