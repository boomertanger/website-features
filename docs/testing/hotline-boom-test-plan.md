# Hotline Boom test plan

Hand-run checks for Hotline Boom on staging (`PUBLIC_FIREBASE_ENV=staging`) with real accounts. The automated checks cover the logic (`npm run check` in `functions/`, which runs `scripts/check-hotline.js`: validation, lanes, the name check, rate limits, idempotency, the inbox actions, replies with email off, settings) and the layouts (the Playwright runs at 1180 px and 390 px with reduced motion in the build notes). This plan is what only a person with a few accounts, two browsers and a phone can prove. Spec: `docs/specs/hotline-boom.md`.

Accounts you need: **Owner** (boss), an **Overseer** (A2) or **Right Hand** (A3) admin, a **Steward** (A1) admin or a **mod**, an adult **Fan Club member** (18+), a **13 to 17 member**, and a **visitor** (signed out, ideally a private window).
Email is **off** on staging today (`HOTLINE_EMAIL=off` in `functions/.env`, no `RESEND_API_KEY`), so replies go through "Open in my email" and "Mark as replied". Section E covers switching it on later.

Before you start:
- In the Cloudflare dashboard, Turnstile widget for site key `0x4AAAAAAFSyVCo3xA4susd6`: the **staging hostname** (and `localhost` if you test locally) must be in its hostname list, or every send fails with "The check didn't pass".
- Hard-refresh every page with **Ctrl+Shift+R** after a deploy.
- The inbox has a preview for looking around without accounts: `/admin/inbox?as=admin` signed out (the owner's view) or `&owner=0` (an inbox admin's view). Sample data; nothing is saved.

## Walk-throughs (do these first)

### W1. A visitor sends a message

1. Private window, signed out, open **/contact**. Expect: the status pill "Lines open. Replies in about 3 days.", the ringing desk phone (hover or tap it: the handset lifts and the bubble says "Hotline Boom, what's it about?"), six keypad rows with gold locks on 4 to 6, and the idle card "Pick a number to start".
2. Press **2** on the keyboard (focus not in a field). Expect: row 2 presses in, the LCD says "Line 2 connected / Feedback", the Feedback form opens with "Your name" and "Your email".
3. Press **Send message** with everything empty. Expect: red errors on name, email and message; focus on the name field.
4. Pick **A stream**. Expect: "Which stream?" with the last finished public streams (or "Not sure, or not listed" only, if none).
5. Fill in name, a real email you can read, a message, pick a source in "How did you find Boomertanger?", **Send message**. Expect: "Sending…", then the Sent card: the purple **Hotline / Sent / BT-48xx** stamp, the lane tag "Boomertanger + inbox team", "The reply will go to <your email>", the reply time and **Send another message**.
6. **Send another message**, pick line 1. Expect: the "How did you find" question is **gone** (asked once per browser).
7. Owner, **/admin/inbox**: the message is at the top as **New** with lamp 2 lit; open it. Expect: sender "<name>", your email "(visitor)", About "A stream" (and the stream), "Found Boomertanger through" your answer, "Arrived through" Direct (or the site you came from).

### W2. A member sends, and the Business line for 13 to 17

1. Adult member, /contact. Expect: no name or email fields; "Sending as @handle. The reply arrives in your alerts and by email."
2. Send on **4 Business & collabs** (company, kind; website and timeline optional). Expect: the Sent card says "Only Boomertanger reads" and "The reply will show up in your alerts and by email."
3. Send a second message: "How did you find" is gone for this account (it is stored on the account, not the browser: check from another browser too).
4. **13 to 17 member**, /contact. Expect: **five** rows, no Business, and the keys renumber (Private matter is 4, Report a person is 5). Open **/contact?line=4**: no line is picked (the link means Business, which isn't open to them).
5. Adult member, **/contact?line=5**: the page opens with Private matter picked, the lock note and the crisis line.

### W3. Who reads what (the lanes)

1. As the visitor, send one message on **1 Say hi**, one on **5 Private matter**, and one on **2 Feedback** with **Only Boomertanger should read this** ticked.
2. **Overseer** (A2), /admin. Expect: the Hotline Boom card with the New count of the **team lines only**. Open **/admin/inbox**. Expect: only three lamps (1 to 3), Say hi is there, Private matter and the ticked Feedback are **not** (no count, no lamp, no hint anywhere), no Settings tab, and Sources says "Counts the team lines only."
3. **Owner**, /admin/inbox. Expect: six lamps, all three messages; the ticked Feedback shows "The sender ticked 'Only Boomertanger should read this'" and the lane tag "Only Boomertanger".
4. **Steward** (A1) or a **mod**: /admin/inbox says "Staff only… This inbox is for Boomertanger and the admins who help with it." and no Hotline Boom card on /admin.
5. Optional, the real protection: as the Overseer, in the browser console on /admin/inbox, run a read of `sites/boomertanger/hotline/main/ownerMessages` (any Firestore read). Expect: permission denied.

### W4. The name check and Owner only

1. As a visitor, send on **2 Feedback** a message that names a crew member, e.g. "@ravenmod was great tonight" (use a real crew handle on staging).
2. Overseer inbox: the message is **not** there. Owner inbox: it is, with the gold notice "Moved to Owner only by the name check. It mentions @<handle>, a <grade> on the crew, so the inbox team never saw it." and the flag icon in the row.
3. Send a plain Say hi. As the **Overseer**, open it and press **Owner only**. Expect: the confirm dialog "Make it Owner only?". Confirm: the toast "Moved to Owner only" and the message leaves the Overseer's list at once. Owner: it is there with "Moved to Owner only by @<overseer>" and the history line.
4. Settings, owner: switch **Name check** off, Save. Send another message naming the crew member: it now stays in the team lane. Switch it back on.

### W5. Replying with email off

1. Owner, open the visitor's Say hi message. Press **Reply**: the composer's Reply tab, From "fanmail@boomertanger.com" (the line's address), To the visitor's email, "Signed 'the Boomertanger crew'", "Then mark it Waiting" ticked.
2. Write a reply, **Send reply**. Expect: the warning "Email isn't switched on yet, so the site can't send this reply…", **Open in my email**, **Mark as replied**, **Back to the reply**.
3. **Open in my email**: your email app opens with To, the subject "Re: Say hi (BT-48xx)" and the text with the signature. Send it from your own mail (from the fanmail address if your app can).
4. **Mark as replied**. Expect: the lime **Replied** stamp (not with reduced motion), the toast, the status **Waiting**, and the history "Replied from email … by @boomertanger" with the text. The readout "First reply, median" now has a value.
5. **Internal note** tab: write a note, **Save note**. Expect: the dashed box, the note in the history; the Overseer sees notes on team messages; nobody else sees owner-lane notes.
6. Status select (Open, Waiting, Done, Spam) and the **Assigned to** select (team messages only: the owner and the admins whose grade has the inbox). Each change toasts and shows in the history. Spam drops out of **All**; the **Spam** chip shows it.
7. Member message: reply the same way. Expect: the To line says "@handle (alerts and email)"; after **Mark as replied** the member gets a **contact-reply** alert once Boom Alerts delivers the outbox (check `sites/boomertanger/notifyOutbox/hotline-reply-…` exists).

### W6. Limits and double sends

1. Visitor: send **3** messages within an hour, then a 4th. Expect: "That's the limit for now… You can send another after <time>." with Back to the menu; the email rows below still work.
2. Member: the limit is **5 a day**.
3. Double submit: on a slow connection (DevTools, Slow 3G), press **Send message** twice quickly. Expect: one message in the inbox, one Sent card.
4. Paste a message with **6 links**. Expect: it sends normally, and in the owner's inbox it is already **Spam**.
5. The honeypot and Turnstile: block `challenges.cloudflare.com` in DevTools and send. Expect: "The check didn't pass. Try again." and the message is still in the form.

### W7. Settings (owner only)

1. **Reply-time promise**: change to "2 days", Save. /contact's pill, the Sent card and /contact/how-it-works ("~2 days", the closing line and BOOMBOT's answer) all say 2 days. Set it back.
2. **Lines on the contact page**: switch off **3 Help**, Save. /contact shows five rows (keys renumber), `?line=3` is ignored, the How it works dial hides hole 3 and its card. If someone had the form open, sending answers "That line just closed". Switch it back on.
3. **Who helps with the inbox**: untick Overseer, Save. The Overseer reloads /admin/inbox: "Staff only" and no /admin card (the rules now deny them). Tick it back.
4. **Email me Business messages / Private matters**: the toggles save; they only send copies once email is on (section E).

### W8. Sources

1. Owner, Sources tab: the readouts (messages, answered the question, top source, replied to), the bars "How they found Boomertanger" and "Arrived through". Switch **30 days / 90 days / All time**.
2. Open **/contact?via=yt-description** in a fresh private window and send a message: "Arrived through" shows `yt-description` on the message and in Sources.
3. Overseer: Sources counts the team lines only.

### W9. How it works, footer, nav

1. **/contact/how-it-works**: hover the dial's holes (the LCD shows each line), click **4**: the dial turns to the stop and back, "Connected / Business & collabs" with **Open line 4**, and card 4 in chapter 1 lights up. Keyboard: Tab to a hole, Enter.
2. Chapter 2 chips light each route; chapter 3 journey steps light on hover; chapter 4: type "can't log in" (Account help), "a mod was rude" (Report a person), "the page is broken" (Bug Zapper); chapter 5 medals flip (tap on a phone); chapter 8 BOOMBOT answers one at a time.
3. The **footer**: under Contact, the Show buttons work as before, and **Send a message** goes to /contact. Nothing else in the footer changed.
4. The header: **Community** has **Contact** with "Questions, feedback, business, private notes"; the phone **More** sheet has it too.

## Phones and reduced motion

- At 390 px: /contact shows the title beside a small phone, the menu first, then the form with **Back to the menu**; no sideways scroll. /admin/inbox: the bar is the dial icon and the three tabs on one row, the lamps above the readouts, the list, then a message full screen with **Back to the inbox**.
- With reduced motion on (Windows: Settings, Accessibility, Visual effects, Animation effects off): the phone doesn't ring or lift (the ring marks show still, answering hides them), the wordmark doesn't spin, the dial connects without turning, the stage scenes show still, and there is no Replied stamp animation.

## E. When email is switched on (later)

Boom Alerts sets `RESEND_API_KEY`. Then set `HOTLINE_EMAIL=on` in `functions/.env` and redeploy the five contact functions one at a time (staging first). Repeat W5: **Send reply** now sends from the line's address (the composer no longer offers "Open in my email"), the member also gets the alert, and Business and Private messages arrive as copies at business@ and fanmail@ when the Settings toggles are on. If the domain isn't verified in Resend yet, the inbox quietly falls back to the email-off flow.

## Results

| Check | Date | Who | Result | Notes |
|---|---|---|---|---|
| W1 Visitor sends | | | | |
| W2 Member, 13 to 17 | | | | |
| W3 Lanes | | | | |
| W4 Name check, Owner only | | | | |
| W5 Reply with email off | | | | |
| W6 Limits | | | | |
| W7 Settings | | | | |
| W8 Sources | | | | |
| W9 How it works, footer, nav | | | | |
| Phones, reduced motion | | | | |
