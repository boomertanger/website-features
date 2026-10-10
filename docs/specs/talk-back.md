# Talk Back

> **Split decided Oct 10, 2026 (Service Hub chat).** Talk Back is no longer its own service. Nothing below is cancelled; it is re-homed:
> - **Service Hub** (`claude/service-hub.md`, §8a) owns the page side: the margin note becomes the shared **page strip** (rate it + Ask a question + Give feedback, mockup option S1), the Ask pins stay, and the feature registry moves into the Service Hub manifests (`services/<id>.json` gains `sections`, `talkBack: note | pins | skip` and `help`). `talkback-features.json` is not created; the rollout page list (§9) and the "every spec gets a Talk Back line" rule become Service Hub's.
> - **Hotline Boom part 2** owns everything else here: `contactSend` `kind` / `context` (stored as `context.serviceId`, same slug as the manifest id), the line 2 rename, BOOMBOT answers and `contactDeflect`, the stats, the inbox context bar and Sources › By feature, Part B (inbox Gears, Pick up, Clear desk, Operator of the Month) and Part C (the inbox How it works page).
> - Order: Service Hub manifests first; Talk Back's Hotline Boom pieces after Hotline Boom passes its staging tests. Service Hub shows team-lane question and feedback counts per service as a grid column; owner-lane counts never leave `statsOwner`.
> - Members call the Ask / Feedback half of the strip "Talk back".


Status: **confirmed Oct 10, 2026** (all of §12 as recommended). Build only after Hotline Boom passes its first staging tests (docs/testing/hotline-boom-test-plan.md).
Name: **Talk Back** (chosen Oct 10, 2026; working name was "Ask from anywhere").
Concept: approved mockup `ask-from-anywhere.html` (save as `docs/design/mockups/talk-back-concept.html`), trigger option 4 "Note + pins".
Depends on: Hotline Boom (`docs/specs/hotline-boom.md`), Bug Zapper (`/bug-zapper?new=1&page=<path>`), Accounts (E1 sign-in dialog), Boom Alerts (contact-reply alerts), Mod Machina Gears (`docs/specs/mod-machina.md` §4-5: the ledger, grantGears, the crew boards, the award run).

Three parts: **A. Talk Back on feature pages** (§1-10), **B. Inbox recognition** (§11), Gears and credit for staff who answer and tidy Hotline Boom messages, and **C. the staff How it works page** for the inbox (§16). Part B changes Hotline Boom and Mod Machina, not just this feature; once confirmed, hotline-boom.md and mod-machina.md §4a, §4b and §5 get matching lines.

## 1. What it is

A small Hotline Boom door on every appropriate feature page. Anyone can ask a question or give feedback without leaving the page; the message arrives in the Hotline Boom inbox already labelled with the feature, section and page it came from. BOOMBOT offers the feature's own help answers while you type, so many questions never need sending.

It is **not** a new inbox, line or security model. It sends through `contactSend` to line 2 with an extra `context` field.

## 2. Who sees it

| Viewer | Gets |
|---|---|
| Visitor | The note, the pins and the dialog. Email field for the reply. Turnstile. Visitor rate limit (3 an hour, shared with /contact). Sent screen adds the Join free nudge. |
| Member (signed in, signup finished) | The same, sending as @handle. Reply arrives in their alerts (and by email once Hotline email is on). Member rate limit from Hotline Boom, shared with /contact. |
| Signed in, signup not finished | Treated the way `contactSend` already treats them (check hotline-boom.md; do not invent a new rule). |
| Crew and admins | The same as members. Staff never get extra controls in the dialog. |

Protections, all unchanged from /contact: Turnstile, rate limits, the name check (a message that names a crew member moves to the owner lane), and the privacy lanes (teamMessages / ownerMessages enforced by rules).

Kill switch: a `talkBack` module in `site/src/data/site.json`. Off = no notes, no pins anywhere. It also hides when the contact module is off.

## 3. Line 2 rename

Line 2 "Feedback" becomes **"Feedback & questions"** everywhere: the /contact phone menu, `/contact?line=2` (the deep link number is unchanged), /contact/how-it-works (H1 dial), the inbox labels and filters, alert titles and email subjects. The stored line key stays the same, so existing messages and settings are untouched.

The line 2 form on /contact gains the same **Question / Feedback** switch (no "Something's broken" there; /contact already points to Bug Zapper if it does today, otherwise add the same hand-off). Old line 2 messages with no kind show as Feedback.

## 4. Triggers

### 4a. Margin note (every included feature page)

A calm strip at the end of the page's main content, after the closing call to action and above the footer, outside any TocLayout chapter (not in the rail):

- the real mascot (small), **"Questions or feedback about {Feature}?"**
- **Ask a question** (`.bt-btn--primary .bt-btn--sm`) and **Give feedback** (`.bt-btn--secondary .bt-btn--sm`), opening the dialog in Question or Feedback mode.
- At 420px the buttons stack under the line.

Astro: `<TalkBackNote feature="tap-the-splat" />`. One per page.

### 4b. Ask pins (where questions cluster)

A small dashed purple chip, **Ask**, in a `.bt-section-head-tools` slot. Opens the dialog in Question mode with that section attached and briefly highlights the section (no highlight under reduced motion). On phones (420px) it is icon-only with `aria-label="Ask about {Section}"`.

Astro: `<AskPin section="leaderboard" label="Leaderboard" />` inside the section head tools; the page's feature comes from its `TalkBackNote`. Pins are added only where the approved page list (§9) says so.

Nothing floats over the page. The footer game, the More sheet and the tab bar keep their space.

## 5. The dialog

`openModal({ variant: "sheet", feature: "talkBack" })`: a centred dialog that becomes a bottom sheet at 640px and below. It renders in the portal on `<body>` and opening it closes any open nav panel, account menu or More sheet through `bt:overlay-open`.

**Header:** the Hotline Boom W5 icon, `.bt-modal-title` "Ask about {Feature}" (Question) or "Feedback on {Feature}" (Feedback), and the context tag (`.bt-tag` with a pin icon): "Boom Arcade › Tap the Splat › Leaderboard". A pinned section can be removed with a small ✕ ("Remove the section"); the feature can't.

**Mode switch** (`.bt-pills.bt-pills--mode`, `aria-pressed`): Question · Feedback · Something's broken. Switching keeps the typed text.

**Question / Feedback:**
- `.bt-textarea`, 2,000 characters, counter "0 / 2,000". Placeholders: "What would you like to know?" / "What worked, what didn't, what would you change?"
- BOOMBOT box (Question mode only, §6).
- Visitor: "Your email, for the reply" (`.bt-input`, required, same check as /contact). Member: "Sending as @gbo. The reply arrives in your alerts."
- `label.bt-check` **Only Boomertanger should read this** (sends to the owner lane, exactly as on /contact).
- Foot line: "Goes to Hotline Boom with this page attached. Protected from spam by Cloudflare." and **Send** (primary).
- Turnstile runs as on /contact (invisible unless it needs a tap).

**Something's broken:** the form is replaced by a note: "**Bug Zapper is faster for this.** It tracks the bug until it's fixed, lets you add a screenshot, and you can watch it get squashed. The page is filled in for you." with **Report in Bug Zapper** (`/bug-zapper?new=1&page=<path>`) and **Send it as feedback instead** (ghost, switches to Feedback). Visitors see "Bug Zapper needs a free account" with **Join free** (opens E1 on Join free) and the same "Send it as feedback instead". The typed text isn't carried to Bug Zapper (later, §12).

**Sent:** `.bt-stamp--primary` "HOTLINE · SENT" (with the reference if `contactSend` returns one), `.bt-modal-title` "Got it, thanks!", then:
- Member: "The reply will land in your alerts, usually within {reply time}. It's filed under Tap the Splat › Leaderboard."
- Visitor: "Boomertanger usually replies within {reply time}, by email. It's filed under …" plus the nudge **"Join free to get the reply in your alerts"** with **Join free** (closes this dialog, opens E1 on Join free). See §11, question 1.
- **Back to the page** closes it. The reply time is the same text /contact uses.

**Close guard:** closing with text typed uses the same guard as the /contact form. Focus starts in the textarea and returns to the trigger.

## 6. BOOMBOT answers

- Source (v1): the feature's own written help, the same Q&A shown in its How it works "Ask BOOMBOT". One file per feature, `site/src/data/help/<feature>.json`: `[{ id, q, a, keys: ["reset", "season", …] }]`. The How it works page renders its `.bt-chat` from the same file, so the help is written once (pages must look identical before and after).
- Matching is local in the browser: no network, no AI. From 6 typed characters, show up to 2 entries whose keys appear in the text. Question mode only.
- Box (`aria-live="polite"`): BOOMBOT (`boombotIcon(uid)`), "**BOOMBOT:** this might answer it.", the answers as `.bt-chat` answer bubbles, then **That answers it** (secondary sm) and "Not quite? Just send it."
- **That answers it** closes the dialog with a toast "Glad BOOMBOT could help. Nothing was sent." and calls `contactDeflect` once per dialog open (§7).
- If they send anyway, the message records which answers were shown (`boombotShown: [ids]`).
- A feature with no help file gets no BOOMBOT box; everything else works.
- BOOMBOT is always labelled BOOMBOT and never speaks as Boomertanger (design-system §8h).

## 7. Data and functions

### contactSend (changed)

New optional fields, ignored on every line except 2:
- `kind`: `"question" | "feedback"` (default `"feedback"`).
- `context`: `{ feature, section?, path, title }`. Validated on the server: `feature` and `section` are slugs (`^[a-z0-9-]{1,40}$`), `path` is a same-site pathname starting with `/` (query and hash dropped, max 200), `title` max 120 characters, plain text. Invalid context is dropped, never a reason to refuse the message.
- `boombotShown`: up to 4 help ids.

Stored on the message as-is. The name check still reads only the message text. The alert payload (notifyOutbox) still carries no message text; it may carry the feature name for the alert title.

After a successful send it increments the month's stats (below).

### contactDeflect (new callable)

`{ feature, answerId }` → increments `answered` for that feature and month. No text, no email, no uid stored. Rate limit 30 an hour per hashed IP (CONTACT_HASH_SALT), no Turnstile (it only moves a counter). Refused quietly when over the limit; the visitor still sees the toast.

### Stats (function-written only)

Under Hotline Boom's existing contact root (use the path from hotline-boom.md):

- `stats/{yyyy-mm}`: `byFeature.{feature}.{ questions, feedback, answered }` and `byFeature.{feature}.sections.{section}.questions`. Team-lane messages and deflections only. Readable by the owner and inbox admins.
- `statsOwner/{yyyy-mm}`: the same shape for messages that landed in the owner lane (ticked "Only Boomertanger", or moved by the name check). Readable by the owner only.

Rules: both are read-only to those readers, write false. Nothing else in Firestore changes.

### Feature registry

`site/src/data/talkback-features.json`: `{ "<feature>": { "name": "Tap the Splat", "area": "Boom Arcade", "sections": { "leaderboard": "Leaderboard" } } }`. Used by the note, the pins, the dialog header, the inbox context bar and the chart. Unknown slugs in the inbox show the stored title and path, and count as "Other" in the chart.

## 8. Inbox

**Context bar** on each line 2 message with a context, above the message body: `.bt-tag` "From Boom Arcade › Tap the Splat › Leaderboard" and **Open the page** (the stored path, new tab). If BOOMBOT showed answers: "BOOMBOT showed 2 answers; they sent it anyway." The list row subject reads "Question: …" or "Feedback: …". Messages from /contact show no bar.

**Sources › By feature:** `.bt-pills` This month / Last month; one `.bt-meter` row per feature (name, count, sorted high to low; questions and feedback together, a small split under the bar); **Answered by BOOMBOT: N**; and one hint when a feature section has 5 or more questions in the month: "{Feature} › {Section} keeps coming up. Its help may need a line about it." The owner's chart adds `statsOwner`. Empty month: the mascot empty state "No questions from feature pages yet."

**/admin card:** unchanged (it already counts line 2).

## 9. Rollout

1. Claude Code lists every page in `site/src/pages` in `docs/specs/talk-back-pages.md` with a proposed placement: **note**, **note + pins** (naming the sections), or **skip**, and the feature slug.
   Always skip: /contact and its sub-pages, sign-in and auth pages (/auth/*), /admin and everything under it, /live/obs, /live/control and its checklist, checkout pages, 404 and other error pages.
2. **Stop.** I approve or edit the list.
3. One pass adds every note and pin, the registry entries, and moves each How it works FAQ into its help file (screenshots before and after match).

**New features:** a standard step from then on. Every feature spec gets a line "Talk Back: note / note + pins (sections) / skip", and CLAUDE.md, design-system.md and the new-feature checklist say so.

## 10. bt-ui

New kit pieces (added to `shared/bt-ui.css`, `shared/ui/talkback.js` for the markup helpers, the UI kit page and design-system §5):
- `.bt-talkback`: the margin-note strip (rest, hover, 420px stacked).
- `.bt-ask-pin`: the dashed section-head chip (rest, hover, focus, icon-only).

Reused: `openModal` sheet variant, `modalHeader`, `.bt-pills--mode`, `.bt-textarea`, `.bt-input`, `.bt-field`, `.bt-check`, `.bt-tag`, `.bt-btn`, `.bt-boombot` and `.bt-chat` bubbles, `.bt-stamp--primary`, `.bt-toast`, `.bt-notice`, `.bt-meter`, `.bt-empty`, `.bt-section-head`, the mascot, the W5 icon.

Feature code: `site/src/components/talkback/TalkBackNote.astro`, `AskPin.astro`, `site/src/scripts/talkback/` (dialog, matching, send). No feature CSS beyond layout glue; no raw colours. Container queries only; reduced motion drops the highlight, the stamp slam and the BOOMBOT typing.

## 11. Inbox recognition (Part B)

Staff who answer people in the Hotline Boom inbox earn Gears on Mod Machina's existing ledger and get seen for it. The aim is to reward answering people and keeping the desk clear, never moving messages around. Clicks pay only once they've proven right (spam that holds), or the reward goes to the state of the whole inbox (oldest first, Clear desk), which nobody can fake alone.

### 11a. Who earns

- Staff on the **crew roster with an admin grade** (Steward, Overseer, Right Hand) who are inbox admins. They already appear on the crew board with the green Staff tag.
- An inbox admin who isn't on the crew roster earns nothing; their replies still count in the This month strip (§11e).
- **The owner never earns** (not on the crew board). The owner lane is owner-only, so owner-lane messages never pay anyone.
- Nobody earns for replying to a message they sent themselves.

### 11b. What pays (starting values, tunable in /admin/crew)

| Source | Gears | When | Ledger key (`${source}:${ref}:${uid}`) |
|---|---|---|---|
| First staff reply | 4 | The first staff reply on a team-lane message, to whoever sent that reply (not the assignee) | `inboxReply:{messageId}:{uid}` |
| Fast reply | +2 | That first reply came within 24 h of the message arriving | `inboxFast:{messageId}:{uid}` |
| Oldest first | +1 | The first reply or the close was on the oldest open team-lane message at that moment (the server checks) | `inboxOldest:{messageId}:{uid}` |
| Spam that held | 1 | Marked spam and still spam 7 days later (daily run). Un-spammed within the 7 days: nothing is paid and nothing needs reversing. Max 5 a day | `inboxSpam:{messageId}:{uid}` |
| Clear desk (team) | +5 | 7 clear days in a row (§11f), to everyone who handled at least 3 messages that week | `inboxDesk:{weekId}:{uid}` |
| Added to BOOMBOT's answers (later, with that feature) | +3 | The owner or an Overseer adds the reply to a feature's help, paid to whoever wrote the reply, once per message | `inboxBoombot:{messageId}:{uid}` |

- **"First" is decided once:** contactReply sets `firstStaffReplyAt` and `firstStaffReplyBy` on the message in a transaction, so two admins replying at once can't both be paid. Payment goes through `grantGears` with the keyed id, so a retry never pays twice.
- **"Mark as replied"** (used until Hotline email is on) counts as the first staff reply. See §12 question 5.
- **Daily cap:** 30 inbox Gears per person per day (America/Chicago, like the crew runs), the BOOMBOT bonus included. Over the cap the reply still sends; the ledger records nothing and the credit line says "Daily inbox cap reached".
- Ledger rows say only "Hotline reply" / "Fast reply" / "Added to BOOMBOT". They carry no message text, sender, line or feature, so the Gears breakdown on the crew board reveals nothing about the message.

### 11c. What never pays

Picking up (assigning), status changes, notes, closing without a reply, the spam click itself (only spam that holds pays, §11b), and escalating to Owner only. Closes are counted and shown (§11e) but never paid, so closing never beats answering.

- **Escalation stays neutral.** Escalating neither pays nor costs anything. A reply paid before the escalation stays paid. An escalated message drops out of the escalating admin's reply-time numbers, so escalating never looks slow, and it doesn't count as a miss.
- **Spam:** a message marked spam before any reply can never pay a reply. If it's marked spam after a paid reply, that reply credit is reversed automatically through the existing Gears adjustment (`gearsAdjust`, reason "Marked as spam") and logged.
- A message the name check moved to the owner lane never pays (the owner answers it).

### 11d. Pick up

A **Pick up** button on each unassigned team-lane message (`.bt-btn--admin .bt-btn--sm`, staff green), meaning "assign to me", through contactAction. It shows "Picked up by @handle" on the row and in the message so two people don't answer the same thing. Anyone in the lane can still reply, and the replier gets the credit. A picked-up message has **Let it go** for the person who picked it up (and Reassign for A2+ if Hotline Boom already has assigning). Pick up pays nothing.

### 11e. Seeing it

**On the message (staff):** after the first reply, a small line "Paid 6 Gears to @handle (4 + 2 fast)". For the owner it adds **Remove credit**, which opens the existing Gears adjustment in /admin/crew prefilled with the person, the amount and the ledger ids (reason required, logged as `gearsAdjust`). No new adjustment tool.

**/admin/inbox, This month strip** (top of the Inbox tab, owner and inbox admins): one compact card per staff member with their avatar, first replies this month, fast replies, median reply time ("4 replies · median 6 h"), **Tidied** (spam that held plus messages closed with no reply needed) and **Accuracy** (the share of their spam marks the owner didn't overturn), plus the team's median and the Clear desk streak ("Clear desk: 5 days"). Only team-lane messages that weren't spam or escalated count. Empty month: "No replies yet this month."

**/crew/board, Inbox column:** first replies in the period (This month, This season, All time), for everyone on the board. Crew who don't work the inbox show "—". It's a count only. Gears from the inbox are part of each person's Gears total and their breakdown ("Hotline replies: 24").

**Top Gear:** inbox Gears are ordinary Gears and count in the monthly total. The existing rule still holds: admins appear in their real place but never win crew awards, so today inbox Gears can't change who wins Top Gear. See §12 question 6.

**Operator of the Month (optional, last to build):** a monthly staff award in the existing award run (1st of the month, 00:05 Central), the one award admins can win. Chosen automatically by a score: first replies + 0.5 per spam mark that held + 1 per oldest-first pick, among staff with at least 5 first replies and spam accuracy of 90% or more; ties go to the lower median reply time; no winner under the minimum. Prize: a Trophy Room trophy (`grant()`), a line on /crew beside Top Gear and Fan Favourite, and an on-stream shout-out. Stored in `awards/{yyyy-mm}.operator`; a `crew-award` activity event.

### 11f. Clear desk and tidying

- **A clear day:** a daily check at 21:00 Central finds no team-lane message older than 48 h still waiting (not replied, not closed, not spam). Escalated and owner-lane messages don't count against it.
- **The streak** shows in the This month strip. 7 clear days in a row pays the team bonus (§11b) and starts a new week's count.
- **The moment:** clearing the last waiting message shows the mascot with an empty desk and "Desk clear" (a small celebration; colour only under reduced motion). Marking spam gets a quick stamp. Undo is offered in the toast for 5 seconds.
- **What counts as spam** vs rude-but-real, and "closed, no reply needed" (a thank-you, a duplicate) are explained on the How it works page (§16), not enforced by code.

### 11g. Data

- On each message (function-written): `firstStaffReplyAt`, `firstStaffReplyBy`, `pickedUpBy`, `pickedUpAt`, `gearsPaid: { amount, uids, ledgerIds }`.
- `inboxStats/{yyyy-mm}` under the contact root: `perStaff.{uid}.{ replies, fast, minutes: [..], oldest, spamHeld, spamOverturned, closed }` and `desk: { streak, clearDays: [..] }` (minutes to first reply, kept to the month's replies so the median is exact). Readable by the owner and inbox admins. Function-written only.
- Crew settings (`crew/main`, beside `youtubeBoost`): `inbox: { reply: 4, fast: 2, fastHours: 24, oldest: 1, spam: 1, spamHoldDays: 7, spamDailyCap: 5, desk: 5, deskMinHandled: 3, deskStaleHours: 48, boombot: 3, dailyCap: 30, operatorMin: 5, operatorAccuracy: 0.9, operatorAward: true }`, edited in the existing Gears settings on /admin/crew (owner and A2+), logged as today.
- Crew board shape gains `inboxReplies`. **Deploy lesson:** every Gears grant rebuilds the crew boards, so the board rebuild functions and the changed contact functions go out together (staging first, retry a 429 once).
- Scheduled: `inboxSpamHold` (daily, pays spam that held) and `inboxDeskCheck` (daily 21:00 Central, the clear day and the weekly bonus).
- adminLog: `contactPickUp`, `contactRelease`, `gearsAdjust` (existing) for removals and spam reversals.

## 12. Decisions (confirmed Oct 10, 2026, as recommended)

1. **Visitor nudge wording.** Joining after sending doesn't move that message's reply into alerts (the reply still goes to the email they typed). Recommend: "Join free and next time the reply lands in your alerts."
2. **One help file per feature** that both the dialog and How it works read. Recommend yes, so answers never drift apart.
3. **Owner-lane counts stay owner-only** (`statsOwner`). Recommend yes: admins never learn that something private was sent about a feature.
4. **Visitors hitting "Something's broken"** see Join free (Bug Zapper is members only). Recommend yes.
5. **"Mark as replied" pays** until Hotline email is on. It's the only way to reply today, but nothing proves the email was sent. Recommend yes, guarded by the daily cap, the credit line on the message and your Remove credit. The other choice is no inbox Gears until email is on.
6. **Top Gear and admins.** Inbox Gears count toward Top Gear as you asked, but since only admins work the inbox and admins never win crew awards, they can't change the winner. Recommend keeping the rule (admins never win crew awards) and building **Operator of the Month** as the staff award, so inbox work has a prize of its own.
7. **Inbox admins not on the crew roster earn nothing.** Recommend yes: Gears and the board are crew things.

Confirmed Oct 10, 2026: spam that held (1 Gear after 7 days), oldest first (+1), Clear desk (+5 team bonus), Tidied and Accuracy in the strip, the Operator of the Month score with the 90% accuracy floor, and the Desk clear moment.

## 13. Out of scope (later)

- **Add to BOOMBOT's answers** in the inbox (saves an answered Q&A into the feature's help; needs help to move from files to Firestore). Its +3 Gears bonus is specified now and switches on with it.
- Carrying the typed text into Bug Zapper (`&desc=`).
- Linking a visitor's past messages to the account they create.
- A feature filter in the inbox list.
- Moving the help into the How it works pages that don't exist yet.
- Gears for owner-lane work, and mods working the inbox.

## 14. Edge cases

- Send fails (network, server): "Couldn't send. Your message is still here." Text kept.
- Rate limited: the /contact wording with the minutes left.
- Turnstile fails: the /contact wording, retry.
- Signs in while the dialog is open: the dialog keeps the text and switches to "Sending as @handle" on the next redraw.
- Page has no section pins: the note alone works.
- Preview pages (`?as=`): path is stored without the query, so preview flags never reach the inbox.
- Name check moves a message to the owner lane silently, exactly as on /contact.
- Ask module off or contact module off: nothing renders.
- Two admins reply at the same moment: the transaction picks one first reply; only that person is paid.
- An admin picks up a message and someone else replies: the replier is paid; the pick-up clears.
- A paid reply is deleted or the message is deleted later: credit stays unless the owner removes it (deletes don't reach into the ledger).
- An admin loses their admin grade or leaves the crew: earned Gears stay, like every other Gears source.
- A message escalated after a paid reply: credit stays; it drops out of reply-time numbers.
- A reply to a message older than the fast window: base Gears only.
- The owner un-spams a message within 7 days: no spam Gear, and it counts against that person's accuracy.
- Two people act on the oldest message together: whoever's action lands first gets oldest first.
- No messages at all in a week: every day is clear, but nobody handled 3, so no team bonus.
- Daily cap reached mid-reply: the reply sends; no Gears; the line says so.

## 15. Next step

Mockup round (published artifact, real bt-ui.css, desktop and phone, numbered options, a recommendation): the margin note and the pin (2-3 options each), the dialog in every state (question with BOOMBOT, feedback, broken for member and visitor, sending, error, rate limited, sent member and visitor with the nudge), the inbox context bar, Sources › By feature, plus Part B: Pick up and Picked up by on a row, the credit line with Remove credit, the This month strip, the Inbox column on /crew/board, the Operator of the Month card on /crew, the Desk clear moment, and Part C: the inbox How it works page (hero options and the Try it desk).

Build order once confirmed: A kit pieces, B functions and rules for Part A, C the dialog and components, D inbox context bar and By feature, E the page list (stop for approval), F the rollout pass, G Part B (Pick up, Gears, tidying, Clear desk, strip, board column), H Operator of the Month, I the How it works page (Part C), J docs.

## 16. The inbox How it works page (Part C)

A staff story page that teaches the whole system: what the desk is, how a message moves, how to answer, when to escalate, how to handle spam and tidying, and how Gears and recognition work. It's built last, after Part B passes its staging tests, so it explains what actually works.

**Where:** `/admin/inbox/how-it-works`. Owner and inbox admins (the /admin gate; others get the usual no-access state). The public `/contact/how-it-works` stays the visitor page and only gains a line about asking from any feature page. The page is static HTML, so nothing secret goes on it (no name-check word lists, no limits beyond what staff already see).

**Ways in:** a ghost **How it works** link in the inbox header (icon on phones), a link on the /admin inbox card, "How Gears work here" on the credit line, and a link beside the inbox values in /admin/crew Gears settings. /crew/how-it-works gets the inbox rows in its Gears chapter (one line linking here for staff).

**Frame:** the full story-page frame (TocLayout rail, ghost-numbered chapters, hero with a scene, stage cards with hover scenes, journey line, flow diagram, flip medals, placard, a working example, Ask BOOMBOT, the real mascot and BOOMBOT art, closing call to action). No margin note (it's under /admin).

**Hero:** the Hotline Boom desk phone with the W5 dial-up mark, message cards stacking and clearing, the mascot at the desk; "Answer people. Keep the desk clear." Counts from inboxStats (this month's replies, the Clear desk streak); hidden if unreadable.

**Chapters:**
1. **Your desk.** The two lanes (team and owner), the six lines, who sees what, and why some messages never reach you (owner lines, "Only Boomertanger", the name check, described without its rules). Stage cards per lane.
2. **A message's journey.** Arrives → Pick up → Reply → Closed, with the context bar and "Open the page". Journey line.
3. **Answering well.** Tone, the reply time to aim for, "Open in my email" and "Mark as replied" until Hotline email is on, what the "BOOMBOT showed 2 answers" line means.
4. **When to escalate.** What belongs to the owner (personal matters, reports about people, anything about crew, safety), one-way escalation, and that **escalating is always neutral**: it never pays and never costs.
5. **Spam and tidying.** Spam vs rude-but-real (with examples), closed with no reply needed (thank-yous, duplicates), the 7-day hold, Accuracy, Undo, and Clear desk.
6. **Gears for inbox work.** The table from §11b with the current values read from crew settings, the daily caps, what never pays and why. A flow diagram: action → check → Gears.
7. **Being seen.** The This month strip, the Inbox column on /crew/board, Top Gear (admins never win crew awards) and Operator of the Month (how the score works). Flip medals for Operator of the Month and the Clear desk streak.
8. **House rules** placard: answer the oldest first; never mark real messages as spam; escalate whenever in doubt, it never costs you; private stays private; never reply to your own message; one person, one reply (check Picked up by).
9. **Try it: work a pretend desk.** Four sample messages (a quick question, a two-day-old one, obvious spam, a message naming a crew member). Pick up, reply, mark spam, escalate; a Gears tally shows what each action would pay under the current values, the spam Gear shows "pending 7 days", escalation shows "neutral", and clearing the last one plays Desk clear. Nothing is saved.
10. **Ask BOOMBOT** FAQ (from `site/src/data/help/hotline-inbox.json`, the same help-file format as §6): Why didn't my reply pay? What if two of us reply? Does escalating hurt me? Why is my spam Gear pending? What's the daily cap? Can credit be removed?

**Closing call:** Open the inbox.

**Data:** reads crew settings (the values) and inboxStats (hero counts) only. Writes nothing.
