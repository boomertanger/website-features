# Talk Back (Hotline Boom part 2)

Status: **confirmed Oct 10, 2026**; re-homed the same day (split with Service Hub, below). Build after (1) Hotline Boom passes its first staging tests (docs/testing/hotline-boom-test-plan.md) and (2) Service Hub's manifests and `/services.json` exist.
Name: **Talk Back** (working name was "Ask from anywhere"). Members see "Talk back" as the right half of the Service Hub page strip.
Concept: `docs/design/mockups/talk-back-concept.html` (trigger option 4 "Note + pins"; the strip itself is now Service Hub mockup S1).
Depends on: Hotline Boom (`docs/specs/hotline-boom.md`, whose §14 points here), Service Hub (`docs/specs/service-hub.md` §3a and §8a), Bug Zapper (`/bug-zapper?new=1&page=<path>`), Accounts (E1), Boom Alerts (`contact-reply`), Mod Machina Gears (`docs/specs/mod-machina.md` §4-5).

## 0. Who owns what (split decided Oct 10, 2026)

| Piece | Owner |
|---|---|
| The page strip (`.bt-talkback`, `<TalkBackNote service="…"/>`: Rate it + Talk back halves, foot line), the Ask pins (`.bt-ask-pin`, `<AskPin section="…"/>`), their kit entries | **Service Hub** (§8a) |
| The registry: manifests `services/<id>.json` with `sections`, `talkBack: note | pins | rate | skip`, `help`; `/services.json`; `scripts/check-services.js` | **Service Hub** (§3a). `talkback-features.json` is **not** created. |
| The page rollout list and the rule that every feature spec says "Talk Back: note / pins / rate / skip" | **Service Hub** |
| The dialog, BOOMBOT answers, `window.btTalkBack`, line 2 rename, `contactSend` `kind` + `context`, `contactDeflect`, the stats, the inbox context bar, Sources › By service | **This spec** (Hotline Boom part 2), Part A |
| Inbox recognition: Gears, Pick up, tidying, Clear desk, Operator of the Month | **This spec**, Part B |
| The staff inbox How it works page | **This spec**, Part C |

**Placement values** (Service Hub decides per page; listed here so this spec matches): `note` = the strip with both halves; `pins` = the strip plus Ask pins, **at most 3 pins per page** to start; `rate` = the strip with only the Rate half, no Talk back and no pins; `skip` = no strip. **/contact and its sub-pages use `rate`**: people there are already talking to Hotline Boom, so the Talk Back dialog never opens on them. This spec keeps no always-skip list of its own; the list is Service Hub's (§8a).

## 1. The contract with Service Hub

**Opening the dialog.** Two ways, both supported; Service Hub's strip and pins use the data attributes:

- Markup: any button with `data-talkback="question"` or `"feedback"`, `data-service="<serviceId>"` and optional `data-section="<key>"`. Talk Back's loader handles clicks by delegation, so buttons work before any dialog code has loaded and need no inline script.
- Script: `window.btTalkBack.open({ serviceId, section?, mode: "question" | "feedback" })` → `Promise<{ result: "sent" | "answered" | "closed" | "off" }>`.

Either opens the dialog in §4 unchanged. After a send the document fires `bt:talkback-sent` with `{ serviceId, kind }` (the strip may use it; nothing depends on it).

**What the caller never passes:** the path and title. The dialog reads `location.pathname` (query and hash dropped) and `document.title` itself.

**What Talk Back reads from Service Hub:** `/services.json` (built from the manifests) for each service's `name`, `area`, `sections` ({ key: label }) and `help` (path to `site/src/data/help/<id>.json`). Help files are bundled with `import.meta.glob` and loaded lazily per service. A service missing from `/services.json` still works: header "Ask about this page", no section label, no BOOMBOT.

**The loader:** a small script in the base layout (`site/src/scripts/hotline/talkback-loader.ts`) defines `window.btTalkBack` and the click delegation and imports the dialog on first use. With the `talkBack` module off in `site.json`, `open()` resolves `{ result: "off" }` and does nothing (Service Hub already hides the half and the pins).

**What Service Hub reads back:** team-lane counts per service from `hotline/main/serviceStats/{yyyy-mm}` (§6), `byService.{serviceId}.{ questions, feedback, boombot }`. Readable by site admins, so /admin/services can show it. Owner-lane counts never leave the owner-only `stats` doc.

**Ids:** `serviceId` must match `^[a-z0-9][a-z0-9-]{0,63}$` and section keys `^[a-z0-9-]{1,40}$` (they become Firestore map keys, so no dots or slashes). `check-services.js` enforces this on manifests.

**Order:** Service Hub manifests and `/services.json` first; the strip ships with only the Rate half; Talk Back is built after Hotline Boom's staging tests; switching on `talkBack` in `site.json` turns on the Talk back half, the pins and the loader.

# Part A. The dialog and the inbox

## 2. Who can send

| Viewer | Gets |
|---|---|
| Visitor | The dialog with **Your name** and **Your email, for the reply** (Hotline Boom needs both). Turnstile. Visitor limit 3 an hour per `ipHash`, shared with /contact. Sent screen adds the Join free nudge. |
| Member | "Sending as @handle", nothing to type. Member limit 5 a day, shared with /contact. Reply in their alerts (and by email once Hotline email is on). |
| Signed in, signup not finished | Whatever `contactSend` already does; no new rule. |
| Crew and admins | Same as members. No extra controls in the dialog. |

Unchanged from /contact: Turnstile, honeypot, idempotency key (`clientRef`), the name check (a hit goes to the owner lane), the lanes and their rules. A visitor with more than 5 links in the message is stored as spam-suspect exactly as on /contact.

## 3. Line 2 rename

Line 2 (id `feedback`) is titled **"Feedback & questions"** everywhere: the /contact keypad and LCD, `/contact?line=2` (unchanged number), the How it works dial and chapter 1, inbox lamps, labels and filters, the reply subject (`Re: Feedback & questions (BT-<ref>)`), alert text. The line id stays `feedback`, so settings and old messages are untouched.

The /contact line 2 form keeps its About chips and mood and gains a **Question / Feedback** switch (`kind`). Old line 2 messages with no `kind` show as Feedback.

## 4. The dialog

`openModal({ variant: "sheet" })`: centred dialog, bottom sheet at 640px and below, portal on `<body>`; opening it closes nav panels, the account menu and the More sheet through `bt:overlay-open`. Feature CSS uses the `hb-` prefix.

**Header:** the W5 icon (`HB_ICON`), `.bt-modal-title` "Ask about {Service}" or "Feedback on {Service}", and the context tag (`.bt-tag` with a pin): "{Area} › {Service} › {Section}" from `/services.json`. The section can be removed with ✕ ("Remove the section"); the service can't.

**Mode switch** (`.bt-pills.bt-pills--mode[data-n="3"]`, `aria-pressed`; `data-n="3"` is a new kit modifier for a three-way pill, added to bt-ui.css and the UI kit page): Question · Feedback · Something's broken. Switching keeps the typed text.

**Question / Feedback:** `.bt-textarea`, max 5,000 with a counter (same cap as /contact); the BOOMBOT box (Question only, §5); visitor name + email, or "Sending as @gbo. The reply arrives in your alerts."; `label.bt-check` **Only Boomertanger should read this** (owner lane, as on /contact); foot line "Goes to Hotline Boom with this page attached. Protected from spam by Cloudflare."; **Send**. The "How did you find Boomertanger?" question is not asked here (`source` stays null). Line 2's About chips and mood aren't shown; the context replaces them.

**Something's broken:** "**Bug Zapper is faster for this.** It tracks the bug until it's fixed, lets you add a screenshot, and you can watch it get squashed. The page is filled in for you." **Report in Bug Zapper** (`/bug-zapper?new=1&page=<path>`) and **Send it as feedback instead** (ghost). Visitors: "Bug Zapper needs a free account" with **Join free** (E1 on Join free) and the same fallback.

**Sent:** `.bt-stamp--primary` "Hotline / Sent / BT-<ref>", "Got it, thanks!", then member: "The reply will land in your alerts, usually within {replyTime}. Filed under {Service} › {Section}." Visitor: "Boomertanger usually replies within {replyTime}, by email to {email}." plus **"Join free and next time the reply lands in your alerts"** with **Join free** (closes this, opens E1). `{replyTime}` comes from `hotline/main.replyTime`, as on /contact. **Back to the page**.

**Other states:** sending; **Too many** (the /contact wording with `retryAt`); Turnstile failed (retry, text kept); send failed ("Couldn't send. Your message is still here."); a line-off error if line 2 is switched off (dialog shows the /contact line-off state). Closing with text typed uses the /contact close guard. Focus starts in the textarea and returns to the trigger. Reduced motion: no stamp slam, no BOOMBOT typing.

## 5. BOOMBOT answers

- Source: the service's help file (`help` in its manifest), `[{ id, q, a, keys: [] }]`. The service's How it works page renders its Ask BOOMBOT `.bt-chat` from the same file (moving each FAQ into its file is part of Service Hub's rollout pass; screenshots before and after match).
- Local matching in the browser, no network or AI: from 6 typed characters, up to 2 entries whose keys appear in the text. Question mode only.
- Box (`aria-live="polite"`), **picked B2 "BOOMBOT speaks"** (batch 1, Oct 11, 2026): up to 2 `.bt-chat-a` bubbles (smaller avatar), the first labelled "BOOMBOT: this might answer it", each showing the help question in bold and the answer; a moment of typing dots before each (none under reduced motion); then **That answers it** (secondary sm) and "Not quite? Just send it."
- **That answers it:** toast "Glad BOOMBOT could help. Nothing was sent.", closes, and calls `contactDeflect` once per dialog open.
- Sent anyway: the message stores `boombotShown: [ids]`.
- No help file: no box. BOOMBOT is always labelled BOOMBOT and never speaks as Boomertanger.

## 6. Data and functions (functions/lib/hotline/*.js)

**`contactSend` (changed).** Line 2 only, all optional: `kind` (`question | feedback`, default `feedback`); `context { serviceId, section?, path, title }` (ids per §1, `path` a same-site pathname up to 200, `title` up to 120 plain text; invalid context is dropped, never a reason to refuse); `boombotShown` (up to 4 ids). Stored on the message. The name check is unchanged. The `contact-new` payload stays `{ ref, line }`. After the write it increments, besides today's `stats` and `statsTeam`:
- `stats/{yyyy-mm}.byService.{id}.{ questions | feedback }` (every lane; owner only),
- `serviceStats/{yyyy-mm}.byService.{id}.{ questions | feedback }` and `.sections.{key}.questions`, **team lane only** (an owner-lane message, ticked or name-check hit, never touches it).

**`contactDeflect` (new callable, visitors allowed).** `{ serviceId, answerId }` → `serviceStats/{yyyy-mm}.byService.{id}.boombot += 1`. No text, uid or email stored. 30 an hour per `ipHash`; over the limit it quietly does nothing.

**Rules.** `serviceStats/*`: read owner, inbox admins, and site admins (`hasSiteRole('boomertanger','admin')`, the Service Hub readers); write none. Counts only, team lane only.

**Message fields added:** `kind`, `context`, `boombotShown` (plus Part B's fields, §9g).

## 7. Inbox

**Context bar** (**picked C1**, batch 1) on a line 2 message with `context`, between the message header and the message: `.bt-tag` "From {Area} › {Service} › {Section}" and **Open the page** (stored path, new tab); "BOOMBOT showed 2 answers; they sent it anyway." when `boombotShown` is set. Row snippets read "Question: …" or "Feedback: …". Unknown service ids show the stored title and path.

**Sources › By service** (new block in the Sources tab, same period chips: 30 days / 90 days / All time): **picked V2 split bars** (batch 1): one key above the list (questions blue, feedback teal; never purple), then one `.bt-meter--stack` row per service (name and area from `/services.json`, the bar's length relative to the busiest service, split into questions and feedback, the total at the right); the owner sees "Includes N owner-only messages. Inbox admins don't see these." under the list, **Answered by BOOMBOT: N**, and a hint when one section has 5+ questions in the period: "{Service} › {Section} keeps coming up. Its help may need a line about it." Admins read `serviceStats`; the owner's numbers come from `stats.byService` (all lanes) plus `serviceStats` for BOOMBOT. Empty: mascot "No questions from feature pages yet."

# Part B. Inbox recognition

## 8. The idea

Staff who answer people and keep the desk clear earn Gears on Mod Machina's ledger and get seen for it. Clicks pay only once they've proven right (spam that holds), or the reward goes to the state of the whole inbox (oldest first, Clear desk), which nobody can fake alone.

## 9. Rules

### 9a. Who earns

- Crew-roster admins whose `crewGrade` is in `hotline/main.inboxGrades` (default A2 Overseer and A3 Right Hand). If the owner adds A1 Steward to the inbox, Stewards earn too.
- **The owner never earns** (not on the crew board). Owner-lane messages never pay anyone.
- Nobody earns on a message they sent.

### 9b. What pays (starting values, tunable in /admin/crew)

| Source | Gears | When | Ledger key (`${source}:${ref}:${uid}`) |
|---|---|---|---|
| First staff reply | 4 | The first reply on a team-lane message (`contactReply`, or **Mark as replied** while email is off), to whoever replied, not the assignee | `inboxReply:{messageId}:{uid}` |
| Fast reply | +2 | That first reply within 24 h of `createdAt` | `inboxFast:{messageId}:{uid}` |
| Oldest first | +1 | The first reply, or a close with no reply needed, was on the oldest waiting team-lane message at that moment (checked by the server) | `inboxOldest:{messageId}:{uid}` |
| Spam that held | 1 | Marked spam by that person and still spam 7 days later (daily run). Un-spammed within 7 days: nothing paid, nothing to reverse. Max 5 a day | `inboxSpam:{messageId}:{uid}` |
| Clear desk (team) | +5 | 7 clear days in a row (§9f), to everyone who handled at least 3 messages that week | `inboxDesk:{weekId}:{uid}` |
| Added to BOOMBOT's answers (later) | +3 | The owner or an Overseer adds the reply to a service's help, to whoever wrote the reply, once per message | `inboxBoombot:{messageId}:{uid}` |

- **"First" is decided once:** `contactReply` already sets `firstReplyAt`; it now also sets `firstReplyBy`, in a transaction that only succeeds while `firstReplyAt` is empty, so two admins replying at once can't both be paid. Payment through `grantGears` with the keyed ids.
- **Daily cap:** 30 inbox Gears per person per day (America/Chicago). Over the cap the reply still sends; the ledger records nothing; the credit line says "Daily inbox cap reached".
- Ledger rows say only "Hotline reply", "Fast reply", "Oldest first", "Spam cleared", "Clear desk" or "Added to BOOMBOT": no text, sender, line or service.

### 9c. What never pays

Picking up, assigning, status changes, notes, closing without a reply, the spam click itself, escalating (Owner only).

- **Escalation is neutral.** It neither pays nor costs. A reply paid before it stays paid (`gearsPaid` is copied with the message to the owner lane). An escalated message drops out of the escalating admin's reply-time numbers and never counts against a clear day.
- **Spam after a paid reply:** the reply credit is reversed automatically through the existing Gears adjustment (`gearsAdjust`, reason "Marked as spam").
- **Automatic spam** (the 5-links rule) never pays anyone.
- A name-check hit lives in the owner lane, so it never pays.

### 9d. Pick up

**Pick up** (**picked P1**, batch 2: on unassigned rows in the list and in the message's action row; the row button hides on phones) on each unassigned team-lane message (`.bt-btn--admin .bt-btn--sm`) = `contactAction` assign to yourself. Shows "Picked up by @handle" on the row and in the detail. **Let it go** (assign null) for the person who picked it up; the existing assign select stays for everyone in the lane. Anyone can still reply; the replier is paid.

### 9e. Seeing it

- **Credit line** (**picked K1**, batch 2): an entry in the message's `.bt-history` right under the reply that earned it, gold dot: "Paid 7 Gears to @handle (4 reply + 2 fast + 1 oldest first)"; over the cap it's a gray entry "No Gears for this reply. @handle reached today's inbox cap (30)."; a spam mark adds "1 Gear pending: it pays in 7 days if it stays spam." The owner also gets **Remove credit**, opening the existing Gears adjustment in /admin/crew prefilled (person, amount, ledger ids; reason required). A link "How Gears work here" goes to Part C.
- **This month strip** (**picked S1 staff cards**, batch 2; a swipe row on phones) (top of the Inbox tab, owner and inbox admins): a card per staff member (`.bt-avatar-sm`, handle, grade; three big numbers; Tidied and Accuracy as `.bt-tag`s, Accuracy under 90% outlined gold): avatar, first replies, fast replies, median reply time, **Tidied** (spam that held + closed with no reply needed), **Accuracy** (share of their spam marks the owner didn't overturn); plus the team median and the Clear desk streak (seven pips for the last 7 days, lime = clear). Team lane only; spam and escalated messages don't count. Empty: "No replies yet this month."
- **/crew/board Inbox column:** first replies per period (This month, This season, All time); "—" for crew who don't work the inbox. Inbox Gears are part of each Gears total and breakdown.
- **Top Gear:** inbox Gears count, but admins never win crew awards (unchanged rule).
- **Operator of the Month** (**picked O1**, batch 2: a gold-rarity `.bt-medal` with a ☎️ emoji face until commissioned art arrives, a card in the /crew awards row between Top Gear and Fan Favourite with the winner and a plain score line) (staff award, last to build): in the award run (1st of the month, 00:05 Central). Score = first replies + 0.5 per spam mark that held + 1 per oldest-first pick, among staff with at least 5 first replies and 90%+ spam accuracy; ties go to the lower median reply time; no winner under the minimum. Prize: a Trophy Room trophy (`grant()`), a line on /crew beside Top Gear and Fan Favourite, an on-stream shout-out. `awards/{yyyy-mm}.operator`; a `crew-award` activity event.

### 9f. Clear desk and tidying

- **Clear day:** a daily check at 21:00 Central finds no team-lane message with status `new` or `open`, no `firstReplyAt`, older than 48 h. Waiting, done, spam, escalated and owner-lane messages don't count.
- **Streak** in the strip; 7 clear days pays the team bonus and starts a new count.
- **Moments:** clearing the last waiting message shows the mascot with an empty desk, a lime `.bt-stamp--lime .bt-stamp--sm` "Desk / Clear", the title "Desk clear" and the streak line; it plays only when you clear the last one (opening an empty inbox later shows the calm empty state). "Desk clear" (the inbox-zero empty state gets this celebration). Marking spam gets a small gray "Marked / Spam" stamp with Undo in the toast for 5 seconds; replying slams Hotline Boom's "Hotline / Replied" stamp and the toast names the Gears earned.
- What counts as spam vs rude-but-real, and "done, no reply needed" (thank-yous, duplicates), are taught in Part C, not enforced.

### 9g. Data

- Message (function-written): `firstReplyBy`, `pickedUpAt` (`assignee` already exists), `gearsPaid { amount, uids, ledgerIds }`, `spamBy`, `spamAt`.
- `hotline/main/inboxStats/{yyyy-mm}`: `perStaff.{uid}.{ replies, fast, minutes: [..], oldest, spamHeld, spamOverturned, closed }`, `desk { streak, clearDays: [..] }`. Read owner and inbox admins; write none.
- Crew settings (`crew/main`, beside `youtubeBoost`): `inbox: { reply: 4, fast: 2, fastHours: 24, oldest: 1, spam: 1, spamHoldDays: 7, spamDailyCap: 5, desk: 5, deskMinHandled: 3, deskStaleHours: 48, boombot: 3, dailyCap: 30, operatorMin: 5, operatorAccuracy: 0.9, operatorAward: true }`, in the Gears settings on /admin/crew (owner and A2+).
- Scheduled: `inboxSpamHold` (daily) and `inboxDeskCheck` (21:00 Central).
- Crew board shape gains `inboxReplies`. **Deploy:** every Gears grant rebuilds the crew boards, so board functions and changed contact functions deploy together (lib/live first if touched, then batches of about 15 with 3-minute pauses; confirm the served revision).
- adminLog feature `hotline`: new actions `pickUp`, `release`; removals and spam reversals log through the existing `gearsAdjust`.

# Part C. The staff inbox How it works page

## 10. /admin/inbox/how-it-works

Built last, after Part B passes staging tests. Owner and inbox admins (the /admin gate). Static HTML, so nothing secret on it (the name check is explained without its rules). The public `/contact/how-it-works` stays the visitor page and gains one line about Talk back on feature pages.

**Ways in:** a ghost **How it works** link in the inbox hero (icon on phones), the /admin Hotline card, the credit line, and beside the inbox values in /admin/crew. /crew/how-it-works gets the inbox rows in its Gears chapter.

**Frame:** full story page (TocLayout, `.bt-chapter--ghost`, hero scene, stage cards, journey, flow, `.bt-flip`, `.bt-placard`, a working example, Ask BOOMBOT, mascot and BOOMBOT art, closing call). No Talk back strip (it's under /admin).

**Hero (picked H1 "The desk", batch 3, with a quality pass):** title "Working the inbox", "Answer people. Keep the desk clear." Open the inbox, a ghost "Try a pretend desk" jump, and two `.bt-tag` counts from `inboxStats` (team replies this month, Clear desk streak; hidden if unreadable). The scene (SVG, keeps its aspect ratio): a dark office wall with a flickering neon HOTLINE sign, a wall clock and a desk lamp casting warm light; a **silhouette in over-ear headphones** (not the mascot) behind the desk, nodding slightly, with a purple status light; the **desk phone from the /contact hero** (`hotline-boom-hero.html`: gold-rimmed body, purple dial, gold handset glyph, prongs, coiled cord) with a **thicker ear piece and mouth piece**; a BT mug with steam; a New tray and a Done tray. Three numbered envelopes fly one at a time from New past the phone (its handset lifts as each passes) into a fanned stack in Done; then the Done tray glows lime and the "Desk / Clear" stamp slams in; the cycle repeats every 12 s. Reduced motion: the finished state, still.

**Chapters:** 01 Your desk (team and owner lanes, the six lines, why some messages never reach you; two stage cards with hover scenes: the team lane's lamps 1-3 light, the top message lifts toward an admin avatar and a green "Picked up" tag appears; the owner lane is a gold-trimmed safe with lamps 4-6 whose dial spins, padlock rattles and an envelope drops into the slot, "Only Boomertanger"); 02 A message's journey (New → Pick up → Reply → Waiting → Done, each stop with its own icon; an envelope travels the line lighting each stop, vertical on phones); 03 Answering well (fact cards with drawn icons, not emoji; tone, `replyTime`, Open in my email and Mark as replied until email is on, the BOOMBOT line); 04 When to escalate (personal matters, reports about people, anything about crew, safety; one-way; **always neutral**); 05 Spam and tidying (spam vs rude-but-real, done with no reply, the 7-day hold, Accuracy, Undo, Clear desk); 06 Gears for inbox work (§9b with live values from crew settings, caps, what never pays; flow action → check → Gears); 07 Being seen (strip, Inbox column, Top Gear rule, Operator of the Month; four flip medals: Operator of the Month gold, Clear desk teal, Inbox column purple, Top Gear blue, never red); 08 House rules placard (answer the oldest first; never mark real messages spam; escalate whenever in doubt, it never costs you; private stays private; never reply to your own message; check Picked up by); 09 Try it: work a pretend desk (four sample messages, each with its line key and an age chip, gold on the oldest waiting: a quick question, a two-day-old one, obvious spam, a personal matter; Reply / Done, no reply / Mark spam / Owner only; the wrong choice shakes the card and shows a hint; handling stamps the card (Replied, Done, Spam, Owner); a progress bar; a tally that counts up with a floating "+N" and a receipt of every action, using the current values; spam shows "pending", escalation "±0"; clearing all four plays Desk clear with the mascot; Start over; nothing saved); 10 Ask BOOMBOT (`site/src/data/help/hotline-inbox.json`). Closing call: **Open the inbox**.

**Data:** reads crew settings and `inboxStats`; writes nothing.

## 11. Decisions (confirmed Oct 10, 2026)

1. Visitor nudge: "Join free and next time the reply lands in your alerts."
2. One help file per service, read by the dialog and the How it works FAQ.
3. Owner-lane counts stay owner-only (`stats.byService`); Service Hub and admins read `serviceStats` (team lane).
4. Visitors on "Something's broken" see Join free.
5. Mark as replied pays until email is on (cap, credit line, Remove credit).
6. Admins never win crew awards; Operator of the Month is the staff award.
7. Inbox staff not on the crew roster earn nothing.
8. Tidying: spam that held (1 after 7 days), oldest first (+1), Clear desk (+5 team), Tidied and Accuracy, the Operator score with the 90% floor, the Desk clear moment.
9. Split with Service Hub and the §1 contract.

## 12. Out of scope (later)

Add to BOOMBOT's answers in the inbox (its +3 Gears are specified; switches on with it); carrying typed text into Bug Zapper (`&desc=`); linking a visitor's past messages to a new account; a service filter in the inbox list; Gears for owner-lane work; mods working the inbox.

## 13. Edge cases

- Send fails, rate limited, Turnstile fails: §4 states; text kept.
- Signs in with the dialog open: text kept, sender switches to "Sending as @handle".
- `?as=` preview pages: path stored without the query.
- Name-check hit: owner lane silently, no `serviceStats` count.
- Line 2 switched off: dialog shows line-off; Talk back half stays (Service Hub may hide it on `line-off`, nice-to-have).
- Two admins reply at once: one `firstReplyBy`, one payment.
- Picked up by one, replied by another: replier paid; assignment stays until changed.
- Message deleted or TTL-expired after payment: credit stays unless the owner removes it.
- Admin loses inbox access or leaves the crew: earned Gears stay.
- Escalated after a paid reply: credit stays; out of reply-time numbers.
- Reply after the fast window: base Gears only.
- Owner un-spams within 7 days: no spam Gear; counts against Accuracy.
- Two people act on the oldest message together: the first transaction gets oldest first.
- A quiet week: every day clear, nobody handled 3, no bonus.
- Daily cap hit mid-reply: reply sends, no Gears, the line says so.

## 14. Mockups and build order

Mockup round (published artifact, real bt-ui.css, desktop and phone, numbered options, a recommendation), three batches. The strip and pins are in Service Hub's mockup and not repeated here.
1. **Dialog and inbox** (published Oct 11, 2026, `talk-back-batch-1.html`; picked B2, C1, V2): every dialog state (question with BOOMBOT, feedback, broken member and visitor, sending, error, too many, sent member and visitor with the nudge), the inbox context bar, Sources › By service.
2. **Part B** (published Oct 11, 2026, `talk-back-batch-2.html`; picked P1, K1, S1, O1): Pick up and Picked up by, the credit line with Remove credit, the This month strip, Desk clear and the spam stamp, the Inbox column on /crew/board, the Operator of the Month card.
3. **Part C** (published Oct 11, 2026, `talk-back-batch-3.html`; picked H1 with the quality pass, the silhouette and the /contact hero phone): the How it works page.

Build (after Hotline Boom's staging tests and Service Hub's manifests): A `contactSend` fields, `contactDeflect`, stats, rules, line 2 rename; B the loader and dialog with BOOMBOT; C inbox context bar and By service; D Part B (Pick up, Gears, tidying, Clear desk, strip, board column); E Operator of the Month; F Part C; G docs (hotline-boom.md, mod-machina.md, ROADMAP, CHANGELOG). Turning on `talkBack` in `site.json` is a separate step after staging tests of A to C.
