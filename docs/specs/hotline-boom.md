# Spec: Hotline Boom (contact) — CONFIRMED (2026-10-09)

Mockups (approved): `docs/design/mockups/hotline-boom-contact.html` (**Layout 3 Phone menu, wordmark W5 Dial-up**), `docs/design/mockups/hotline-boom-inbox.html` (**Layout 1 Split**), `docs/design/mockups/hotline-boom-how-it-works.html` (**Hero H1 The dial**). The mockups' copy is the starting copy; Boomertanger may edit wording later. Unpicked mockup variants are not built.

Internal name `hotline` (folders, functions, collections, CSS prefix `hb-`). Public name **Hotline Boom**, wordmark HOTLINE + accent BOOM.

## 1. What it is

The site's contact service. Anyone sends a message through one of six **lines**; each line decides who can read it, which extra fields appear, and which address replies come from. Messages land in a private inbox at `/admin/inbox` that the owner manages, helped by chosen admins for the team lines only. The owner is alerted through Boom Alerts. The four email addresses stay listed for people who prefer email.

## 2. Pages

| URL | Who | Kind | Notes |
|---|---|---|---|
| `/contact` | Everyone | Tool page | Layout 3: hero (ringing desk phone scene), "Pick a line" keypad menu with an LCD, the form beside it, "Better places", "Rather use email?". Joins the **Community** nav group in `site/src/lib/nav.js` with the blurb "Questions, feedback, business, private notes". |
| `/contact?line=N` | Everyone | Deep link | Opens the page with line N picked (1 to 6). Used by How it works, the footer and any page (e.g. Shop → `?line=4`). Ignored if the line is off or not allowed for the viewer. |
| `/contact/how-it-works` | Everyone | Story page | Full frame (TocLayout, `.bt-chapter--ghost`), hero H1 the dial. |
| `/admin/inbox` | Owner + inbox admins | Tool page | Split layout; tabs Inbox, Sources, Settings (owner only) in `.bt-seg-nav`. |
| `/admin` | Owner + admins | Card | A Hotline Boom card with the unread (New) count the viewer is allowed to see. |

The footer's "Shared power" Contact reveal gains a small "Send a message" link to `/contact`. Nothing else in the footer changes.

## 3. The six lines

| # | id | Title | Lane | Extra fields | Reply from |
|---|---|---|---|---|---|
| 1 | `hi` | Say hi | team | none | fanmail |
| 2 | `feedback` | Feedback | team | About chips (A stream, The website, A game, The crew, Something else); "Which stream?" select (last 8 streams from the stream object) when About = A stream; optional mood (Loved it, It was okay, Not great) | fanmail |
| 3 | `help` | Account help | team | Three quick answers first (sign in, handle/name, data), then the form | support |
| 4 | `business` | Business & collabs | owner | Company or brand, Website (optional), What kind (Sponsorship, Collab with another creator, Game key or early access, Press or interview, Something else), Timeline (optional: No rush, This month, Within two weeks, It's urgent) | business |
| 5 | `private` | Private matter | owner | Lock note ("Only Boomertanger reads this. Not the crew, and not the admins who help with the inbox.") and the crisis line (988 US / local emergency number; "This inbox isn't watched around the clock.") | fanmail |
| 6 | `report` | Report a person | owner | "Who is it about?" (text) + lock note ("Reports about a mod or an admin never reach them.") | support |

Every line also has: sender (visitors: name + email; members: "Sending as @handle", nothing to type), Message (required, max 5,000 characters with a counter), "How did you find Boomertanger?" (optional, asked once: Twitch, YouTube, TikTok, Instagram, Google or another search, A friend told me, Another streamer, Reddit or Discord, Something else). Team lines add the checkbox **"Only Boomertanger should read this"**, which sends the message to the owner lane.

**Members 13 to 17 don't see Business** (client hides it; `contactSend` rejects it using `users/{uid}.ageBand`). Lines can be switched off in Settings (hidden on /contact and the dial; rejected by `contactSend`).

## 4. Privacy lanes (enforced, not just hidden)

- **Team lane** (`teamMessages`): readable by the owner and by admins whose `crewGrade` claim is in `hotline/main.inboxGrades` (default `["A2", "A3"]`: Overseer, Right Hand). Mods never.
- **Owner lane** (`ownerMessages`): readable by the owner only. Business, Private matter, Report a person, any team-line message with "Only Boomertanger should read this" ticked, and any name-check hit.
- **Name check** (on by default, Settings): before storing a team-line message, `contactSend` checks the body and fields for any crew member's `@handle`, bare handle or display name (whole word, case-insensitive, 3+ characters; the owner excluded). A hit stores it in the owner lane with `namecheck: { uid, handle, grade }`. The team never sees it, not even as a count.
- **Escalate:** admins (and the owner) can move a team message to the owner lane ("Owner only"; `confirmAction`, one-way; the message leaves the admin's inbox at once, notes included). There is no move back down.
- Admins never see owner-lane counts, lamps or sources; Settings is owner only.
- The four mailboxes (business@, fanmail@, support@, privacy@ via Cloudflare Email Routing) are the owner's alone; admins work only in the site inbox.

## 5. Data model

All under `sites/boomertanger/hotline/main` (the settings doc). Server writes only; the browser reads what rules allow.

- `hotline/main`: `inboxGrades` (["A2","A3"]), `replyTime` ("3 days"), `lines` ({ hi: true, … }), `nameCheck` (true), `emailOwner` ({ business: true, private: true }), `nextRef` (counter, starts at 4800). Read: anyone (for replyTime and lines; holds no private data). Write: functions only.
- `hotline/main/teamMessages/{id}` and `hotline/main/ownerMessages/{id}`: `ref` (number, shown as BT-4821), `line`, `lane`, `status` (new | open | waiting | done | spam), `assignee` (uid or null; team lane only), `sender` ({ uid, handle } for members; { name, email } for visitors), `fields` (the line's extras), `body`, `source` (answer or null), `via` (landing domain or `?via=` value), `onlyOwner` (bool), `namecheck` (object or null), `escalatedBy` (uid or null), `ipHash`, `createdAt`, `updatedAt`, `firstReplyAt`, `expireAt` (createdAt + 2 years; spam: 30 days from marking).
- `…/{lane}Messages/{id}/hotlineNotes/{id}`: `kind` (reply | note | event), `by` (uid), `from` (address for replies), `text`, `at`, `expireAt` (same as the message). Events record received, status, assign, escalate, name check.
- `hotline/main/limits/{key}`: rate-limit buckets (server only, `expireAt` 2 days).
- `hotline/main/stats/{yyyy-mm}` (every line) and `hotline/main/statsTeam/{yyyy-mm}` (team lines only): `{ total, answered, source: {…}, via: {…}, lines: {…} }`, both incremented by `contactSend`. The owner's Sources tab reads `stats`, admins read `statsTeam`.
- Members: `users/{uid}.hotlineAskedSource` (server-set) so the "How did you find" question shows once. Visitors: localStorage `bt.hotline.asked` (per-browser convenience).
- TTL policies on collection groups `teamMessages`, `ownerMessages`, `hotlineNotes`, `limits` (field `expireAt`).
- `adminLog`, feature key `hotline` (every staff action: status, assign, note, reply, escalate, settings). No `activityLog` (nothing public).

## 6. Functions (functions/lib/hotline/*.js; JavaScript)

- `contactSend` (callable, visitors allowed): validates line, fields and lengths; Turnstile token (shared helper `functions/lib/security/turnstile.js`, secret `TURNSTILE_SECRET_KEY`); honeypot; idempotency key (`clientRef`); rate limits (visitors 3 per hour per `ipHash`, members 5 per day per uid; `ipHash` = HMAC-SHA256 of the IP with secret `CONTACT_HASH_SALT`); minors and Business; line switched on; name check; picks the lane; assigns `ref` from `nextRef` in a transaction; writes the message and a `received` event; updates stats; sets `users/{uid}.hotlineAskedSource`; drops one `notifyOutbox` event (§8); emails the owner a copy for Business/Private when `emailOwner` says so and email is configured. Returns `{ ref, lane, replyTime }`. Errors: `rate-limited` (with `retryAt`), `bad-input`, `check-failed`, `line-off`.
- `contactAction` (callable, staff): `{ lane, id, action: status | assign | spam | escalate, value }`. Escalate copies the message and its notes to the owner lane and deletes the team copy in one batch. Owner-lane messages can't be assigned.
- `contactNote` (callable, staff): adds a `note`.
- `contactReply` (callable, staff): `{ lane, id, text, from, markWaiting }`. Sends through `functions/lib/hotline/mail.js` (Resend REST API, secret `RESEND_API_KEY`, the same key Boom Alerts will use): From `"Boomertanger" <hotline@mail.boomertanger.com>`, **Reply-To `<from>@boomertanger.com`**, subject `Re: <line title> (BT-<ref>)`, signed "the Boomertanger crew". Members are also notified through Boom Alerts (`contact-reply` event, §8). Sets `firstReplyAt`, status waiting (if `markWaiting`) or open. **If email isn't configured** (no key or the domain isn't verified yet) it returns `{ sent: false, reason: "email-off" }` and the composer offers "Open in my email" (a `mailto:` with To, subject and text) plus "Mark as replied", which records the reply as sent by hand.
- `contactSettings` (callable, owner): updates `hotline/main`.
- Visitor email is used only to reply. Nothing is added to any mailing list.

## 7. Rules (firestore.rules)

`hotline/main`: read all, write none. `teamMessages` (+ `hotlineNotes`): read if owner, or signed in with `crewGrade` in `get(hotline/main).inboxGrades`; write none. `ownerMessages` (+ notes): read if owner; write none. `stats/*`: read owner. `statsTeam/*`: read owner and inbox admins. `limits`: read none. All write none. Use the repo's existing owner check (the one /admin and Cloud Stash use); don't invent a new one.

## 8. Alerts (Boom Alerts)

`contactSend` drops into `notifyOutbox`: type `contact-new`, audience `uids[]` (owner lane: owner only; team lane: owner + current inbox admins), `subject { kind: "hotline", id, lane }`, payload `{ ref, line }` only (**never the message text or the sender's name**, so a push or text can't leak a private message), dedupeKey `hotline:<id>`. `contactReply` drops `contact-reply` to the member (audience `uids: [senderUid]`, payload `{ ref }`). Amend `docs/specs/boom-alerts.md` §3 with both topics (admins/owner and members; not time-critical; defaults Inbox + push for `contact-new`, Inbox + email for `contact-reply`). Until Boom Alerts is built, the events wait in the queue harmlessly and the /admin card's count is the alert.

## 9. UI (mockups are the source of truth)

**Wordmark W5 Dial-up** on every Hotline Boom page (`.bt-wordmark--power`): a rotary dial with a gold handset glyph in the centre; on hover/focus/touch power-on the wheel dials to the finger stop and springs back. Art in `site/src/scripts/hotline/art.ts` (`HB_ICON`, unique gradient ids per copy), CSS in `site/src/styles/hotline.css`.

**/contact (Layout 3):** the hero is `docs/design/mockups/hotline-boom-hero.html` (approved Oct 9, 2026; it replaces Layout 3's hero): (a) the redrawn desk phone scene: a two-tone gradient body with a gold rim, a glossy purple handset and cups, and a W5-style purple dial with a gold handset glyph and finger stop; gold ring marks and purple arcs flash while it rings now and then (art in `site/src/scripts/hotline/art.ts` next to `HB_ICON`, unique gradient ids per copy); (b) the scene is a `<button aria-pressed>`: hover (pointer devices) or tap toggles "answered": the handset lifts off, the ringing stops and a bubble says "Hotline Boom, what's it about?"; phones hide the bubble and the "Pick it up" hint; (c) a status pill above the title: a teal dot and "Lines open. Replies in about <replyTime>." from `hotline/main.replyTime`; (d) a primary "Pick a line" button that scrolls to the keypad menu, a ghost "How Hotline Boom works" link and the lock line "Private lines are read by Boomertanger only"; (e) on phones (container `bt` <= 640px) the title and a 118px phone share the first row, the lede and links go full width below; (f) reduced motion: no ringing or lifting, the ring marks show still and answering just hides them. Below the hero: section heads (kit `.bt-section-head`) "Pick a line" and "Write your message" over two columns; the menu card with the LCD ("Hotline Boom / Press 1 to 6", then "Line N connected / <title>"), six keypad rows (big key, title, line, lane icon: gold lock = owner lane), a legend and the keyboard hint (keys 1 to 6 pick a line when focus isn't in a field). The form card shows "Line N", the title and the lane tag. Phones: menu first, then the form with "Back to the menu". States: idle (mascot "Pick a number to start"), member vs visitor sender, 13 to 17 (no Business, numbers renumber), field errors, sending, **Sent** (`.bt-stamp--primary` "Hotline / Sent / BT-<ref>", lane tag, reply address or "alerts and email", reply time, Send another / Back home), **Too many** (mascot empty state with the retry time; the email rows still work), line switched off. "Better places" door cards (Bug Zapper, Feature Lab, crew apply). "Rather use email?" rows with **`.bt-reveal`** (Show types the address in, then Copy; addresses never in the HTML).

**/admin/inbox (Split):** hero with readouts (New, Open, Waiting, First reply median) and the **switchboard lamps** (one per visible line, lit with the New count, gold for owner lines; a lamp filters by line; admins see only lamps 1 to 3); status chips (`.bt-sortbar`, All excludes Spam) with counts; `.bt-search` ("/" focuses it); rows (`.bt-row--clickable`: line key, sender, lock and name-check flag icons, line + snippet, time, assignee, status badge); the detail (line key + title, BT ref, age, lane tag, status badge; name-check `.bt-notice--warn` for the owner; actions: Reply, status select, assign select (team lane), Owner only (team lane); sender card; the line's fields; message; "Found through" and "Arrived through"; earlier messages from the same sender (filtered by lane access); history `.bt-history`; composer with Reply / Internal note tabs, From select (defaults to the line's address), To, signature line, "Then mark it Waiting"). Replying slams a "Hotline / Replied" stamp and toasts. Phones: list, then the message full screen with "Back to the inbox". Inbox zero: mascot empty state. Status badge tones: New blue, Open teal, Waiting gold, Done lime, Spam gray. **Sources** tab: readouts + "How they found Boomertanger" bars + "Arrived through" list, period chips 30 days / 90 days / All time (admins: team lines only). **Settings** tab (owner only, `.bt-admin-panel`): inbox grades, reply-time text, name check, email copies for Business and Private, lines on/off.

**/contact/how-it-works (H1):** hero with the interactive dial (holes 1 to 6, gold numbers for owner lines; hover/focus shows the line on the LCD; click/Enter dials and lights that line's card in chapter 1; links use `?line=N`) and the peeking mascot. Chapters (TocLayout items in this order): 01 The six lines (stage cards with hover scenes), 02 Who reads what (flow with Team / Gold / Safety switch chips), 03 After you send (four-step journey using the site's `.ai-jr.ai-jr--4`, plus three fact cards: ~3 days, 5,000, 2 years), 04 Find your line (the working line finder: keyword match to a line, or to Bug Zapper / Feature Lab; nothing sent), 05 Rather use email? (four `.bt-flip` medals; no addresses), 06 Better places (door cards), 07 Hotline rules (`.bt-placard`, six rules), 08 Ask BOOMBOT (`.bt-chat`, six questions). Closing CTA "Ready to dial in?". Reduced motion: every scene shows its end state.

## 10. Kit additions (shared/bt-ui.css, shared/ui/, the /dev/ui-kit page)

- **`.bt-reveal`** + `shared/ui/reveal.js` (`revealRowHtml({ key, label, user, domain })`, `initReveals(root)`): the page version of the footer's Show / Copy. The footer is not refactored in this build.
- **`--bt-contact-privacy`** (blue) beside the existing contact tokens.
- Reused, unchanged: `.bt-topbar`, `.bt-wordmark--power`, `.bt-section-head`, `.bt-seg-nav`, `.bt-readouts`, `.bt-sortbar`, `.bt-chip`, `.bt-search`, `.bt-row--clickable`, `.bt-badge`, `.bt-tag`, `.bt-field` family, `.bt-composer`, `.bt-history`, `.bt-notice`, `.bt-admin-panel`, `.bt-admin-tag`, `.bt-stamp`, `.bt-empty`, `.bt-card--door`, `.bt-icon-tile--lg`, `.bt-toc`, `.bt-chapter--ghost`, `.bt-flip`, `.bt-placard`, `.bt-chat`, `.bt-boombot`, `openModal()`, `confirmAction()`, `toast()`.
- Feature CSS only (`hb-`): the wordmark icon, the hero phone scene, the keypad menu and LCD, the lamps, the line keys, the inbox compose tabs, the source bars, the dial, the stage scenes, the flow, the line finder.

## 11. Edge cases

Double submit (idempotency key); Turnstile fails or times out (inline error, retry, no message lost); visitor email typo (shown on Sent; "Send it again with the right one"); very long input (5,000 cap, client and server); links in the body (allowed; more than 5 links marks it spam-suspect: stored as status `spam`); a banned member (can still send; rate limits apply); the sender is an admin (their message follows the same lanes); a crew handle that is a common word (name check errs on the private side); a deleted account (sender shows "Deleted member"; message kept until TTL); an assignee who loses inbox access (assignment cleared on next read by a function, or shown as "Former admin"); reply email bounces (shown later by Boom Alerts' Resend events; out of scope here); `?line=` for a switched-off or not-allowed line (ignored).

## 12. Out of scope (later)

Forwarding emails sent to the four addresses into the inbox (Cloudflare Email Routing → Worker), a member "Your messages" history, saved replies, screenshots on Feedback, a "Triage new" mode inside the Split inbox, "How did you find" at signup.

## 13. Before launch (ROADMAP)

Production Turnstile widget hostnames and `TURNSTILE_SECRET_KEY` / `CONTACT_HASH_SALT` on prod; the Resend domain (Boom Alerts part 6) so replies send from the site; redirect rules on the other 11 domains add `?via=<domain>`; a Privacy Policy line (what the form stores, 2-year deletion, how the source question works); the Squarespace contact page switched off.
