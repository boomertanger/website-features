# Spec: Boom Alerts — CONFIRMED (2026-10-07; all 12 choices as recommended; mockups next)

New ROADMAP workstream (the "Notifications" workstream proposed in `scream-planner.md` §9).
Planning chat: "Boom Alerts".
Builds on: accounts (milestone 2), `scream-planner.md` §4f (`notifyOutbox`), `stream-object.md`,
`game-vault.md`, `mod-machina.md` (crew grades, status, crewComp), `arcade-step1.md`.
Providers (picked 2026-10-07): **Twilio** (toll-free number) for texts, **Resend** for email,
**Firebase Cloud Messaging** for push, **Discord webhooks** (optional, off by default).
Out of scope: billing (ws 11), a native app, Discord direct messages (later, needs a bot and
linked Discord accounts), go-live email for visitors without an account (decided: no visitor list).

## 1. Summary

Boom Alerts is the site's one notification service. Features never send messages themselves:
they drop an **event** into `notifyOutbox`, and Boom Alerts decides who gets it, on which
channels, and when, from each person's preferences. Channels: the **inbox** (the bell), **push**,
**email**, **text (SMS)**, and the owner's **Discord** channels. Members choose topics × channels,
quiet hours, instant or a daily summary, and games they follow. Every email has one-click
unsubscribe; every text honours STOP. Account and security messages can't be turned off.

Texts are part of the first build: the ~20 crew get them free (paid by the owner). Sub Club
members get them once billing exists; the gate (§6) is built now and reads an entitlement that
billing will write later.

## 2. Pages and who sees what

| URL | Who | What |
|---|---|---|
| Header bell (panel / phone sheet) | Members; visitors see a Join nudge | Unread count, latest 20 items, Mark all read, settings link |
| `/alerts` | Members | The full inbox: filters (All · Streams · Games · Community · Crew · Account), paging, mark read |
| `/account/alerts` | Members | Preferences: channels, topics × channels, quiet hours, summary time, followed games, devices, phone |
| `/admin/alerts` | Owner, A2+ (A1 Steward: crew-only sends, no settings) | Health, Send, Test sends, History, Failures, Settings |
| `/alerts/sms` | Everyone (public) | Text program terms (required for toll-free verification) |
| `/alerts/unsubscribe` | Anyone holding an email link | One-click unsubscribe result, no sign-in needed |

Visitors: the bell shows and opens "Get go-live alerts — Join free" (Join dialog titled "Join to
get alerts"). "Remind me" and "Follow" buttons do the same.

Nav: no header link. The bell sits in the header beside the account button (phones too). The
account menu gets "Alerts settings"; /admin gets a Boom Alerts card. The bell panel and phone
sheet use `bt:overlay-open` like every other overlay.

## 3. Topics

Stable dash-style IDs (they match the Planner's outbox types). **Time-critical** topics are
instant-or-off (no summary) and expire if held too long. Defaults apply to new members; nothing
is texted until a phone is verified and the member turns it on.

### Streams (members; backstage only to its audience)
| Topic | When | Time-critical | Default |
|---|---|---|---|
| `stream-live` | Going live (platforms named) | ✓ expires 2 h | Inbox, push |
| `backstage-live` | Backstage stream started (audience only; link to the site, never the unlisted video). **An after-show also sends `backstage-live` to its audience** (added Oct 8, 2026, `control-room.md` §9, §17). | ✓ 2 h | Inbox, push |
| `stream-soon` | Starts in 15 minutes | ✓ 20 min | Inbox |
| `stream-remind` | "Remind me" on one stream: 15 min before, plus its delays/cancel | ✓ | Inbox, push, email |
| `stream-delayed` | Running late, new time | ✓ until new start | Inbox, push |
| `stream-cancelled` | Cancelled, with reason | ✓ until old start | Inbox, push |
| `week-published` | Next week's schedule is up | — | Inbox, email |
| `ballot-open` / `ballot-closing` | Voting opened / last call 3 h before close (only if you haven't used your votes) | — | Inbox |
| `game-planned` | A game you follow is on next week's schedule | — | Inbox, email |
| `game-tonight` | A game you follow or voted for is on today (sent at noon local) | — | Inbox, push |
| `special-event` | Owner announcement: marathon, collab, Halloween 24 h, merch drop | — | Inbox, email |
| `vod-new` / `clip-new` | Reserved; switched on with the Stream Library | — | — |

### Games, Vault and Arcade (only the people concerned)
| Topic | When | Default |
|---|---|---|
| `vault-add-result` | Your added game was approved, rejected or hidden | Inbox, email |
| `vault-cover-result` | Your cover was approved or rejected | Inbox |
| `arcade-beaten` | Your time was beaten (lost #1, or dropped out of the top 10) — max one a day per game | Inbox, push |
| `arcade-new` | New Arcade game or new version (fresh boards) | Inbox |
| `arcade-playtest` | You're invited to a playtest | Inbox, email |

### Community (as features ship)
`badge-earned`, `contest-open`, `contest-won` (always email too), `report-update` (your Bug
Zapper / Feature Lab item changed status, after the ports; Bug Zapper also sends it on every staff reply in your thread, and to everyone who added a "bit me too" when the report is Fixed), `night-shift` (season starts, ends,
your final rank).

### Crew (crew only)
| Topic | When | Default for crew |
|---|---|---|
| `crew-signups-open` | Next week opened: mark availability | Inbox, email |
| `crew-seat-open` | A seat needs someone (your grade can take it) | Inbox, push, **text** |
| `crew-seat-confirmed` | You're confirmed (seat, stream, time) | Inbox, push, **text** |
| `crew-reminder-24h` | Your stream is tomorrow | Inbox, email |
| `crew-reminder-30m` | Your stream starts in 30 minutes (**amends the Planner's 1 h reminder**) | Inbox, push, **text** |
| `crew-stream-changed` | A stream you're crewing was delayed, cancelled or re-planned | Inbox, push, **text** |
| `crew-daily` | Daily summary: applications to vouch, tasks to review, open seats in the next 48 h (skipped if empty) | Email |
| `crew-awards` | Monthly awards and your Gears | Inbox |
| `crew-status` | Time-card reminders (15th, 24th), Check-in, Reserve | Inbox, email |

### Admin (owner and admins)
`admin-health` (send failures, SMS budget at 80% and 100%, provider down, Twilio verification
status, collector failures), `admin-todo` (week not published, crew to-dos, new mod application), `bug-new` (a new Bug Zapper report: inbox; a **Critical** report also goes by push and email; added Oct 9, 2026, `docs/specs/bug-zapper.md` §2.6, queued by `bugSubmit` through `notifyOutbox` with `audience: "admins"`).
Inbox and email; texts only for "provider down" and "budget reached", max one an hour.

### Account (can't be turned off; inbox + email, never text or push)
Sign-in method added or removed, password changed, email changed (sent to the old address too),
phone added or removed, texts stopped (confirmation), account deletion scheduled or done,
Terms or Privacy changed; later, billing (payment failed, renewal).

## 4. Channels

- **Inbox**: every topic you receive lands here (unless you turn that topic off entirely). Kept
  90 days, max 200 items.
- **Push**: per device. Desktop browsers and Android work directly. **iPhone/iPad need the site
  added to the Home Screen** and opened from there; the preferences page shows a short guide on
  iOS. Permission is only asked from a button (never on page load). One soft prompt in the bell
  panel after the first inbox item ("Want these on your phone too?"), shown once.
- **Email**: to the account email, only if verified. From `Boomertanger <alerts@mail.boomertanger.com>`,
  reply-to `support@boomertanger.com`. Images hosted on Cloudinary (staging is behind Access, so
  site-hosted images would break).
- **Text**: one verified US mobile number per member (+1 only), 18+, eligible (§6), consent
  recorded. Every text starts with "Boomertanger:", is plain GSM-7 (no emoji), ≤160 characters
  (one segment, checked by script), links only to boomertanger.com (no shorteners). The first
  text and one a month include "Reply STOP to end".
- **Discord**: two webhooks (public announcements, crew channel). Admin chooses per topic:
  `stream-live`, `stream-delayed`, `stream-cancelled`, `week-published`, `special-event` →
  public; `crew-seat-open`, `crew-signups-open` → crew. Backstage never goes to Discord. Off by default.

## 5. Delivery rules

### 5a. Quiet hours (push and text; inbox and email are silent anyway)
- Member sets start and end (default **10 PM – 8 AM**) in their time zone (saved from the
  browser, editable; default Central). Can cross midnight. Option "Let go-live through" (adults).
- **Text window floor (all member topics): 8 AM – 9 PM recipient time**, whatever the member
  sets (lawyer check before launch). Crew duty topics (`crew-seat-*`, `crew-reminder-30m`,
  `crew-stream-changed`) are exempt: mods asked for them for a seat they took.
- During quiet hours: time-critical items go to the inbox only (and expire); others are held and
  sent when quiet hours end, or join the summary.
- **13–17:** quiet hours fixed at a minimum of 9 PM – 8 AM (can be widened, not shortened), no
  "Let go-live through".

### 5b. Instant or daily summary
Per topic: Instant or Daily summary (non-time-critical topics only). One summary email (and one
push "You have 4 new alerts") at the member's chosen time (default 8:00 AM). Texts never summarise.

### 5c. Limits (per person)
Texts: 6 a day, 60 a month (crew duty counts but isn't blocked until 2× the cap). Push: 12 a day.
Email: 10 a day (account messages never blocked). Over a limit → inbox only, and once a day a
quiet note "Some alerts went to your inbox only".
**Coalescing:** two changes to the same stream within 5 minutes become one message (the latest).
**Dedupe:** each send has a key (person, topic, subject, channel), so retries and duplicate events
never double-send.

### 5d. Site-wide safety
- **SMS monthly budget** (default **$25**, settable): at 80% the owner is told; at 100% member
  texts pause (crew duty continues), and the owner is told.
- **Pause all sending** switch on /admin/alerts (green, owner): everything goes to the inbox only.
- **Staging allowlist**: on boomertanger-staging, texts and emails go only to allowlisted
  addresses and numbers (the owner and @gbo), whatever the preferences say.
- Priority: when a big send is queued (2,000 go-live texts at ~3 a second ≈ 11 minutes),
  time-critical topics go first.

## 6. Who can get texts (the gate)

`canText(uid)` (in `alerts/logic.js`, enforced in functions; the page only shows the result):
1. Age band `18+`, verified email, verified phone, consent on record, not opted out (STOP), **and**
2. one of: crew status Active or Check-in (mods and admins; follows the same rule as crewComp, so
   a mod on Reserve loses free texts), **or** entitlement `alertsSms: true` in
   `sites/boomertanger/members/{uid}.entitlements` (written by billing for Sub Club later), **or**
   owner grant `alertsSmsGrant: true` (gifts and testing; logged).
3. Site flag `alerts.smsForSubClub` (off until billing) controls whether the entitlement path is
   offered at all; until then non-crew see "Texts are a Sub Club perk — coming soon".

Losing eligibility keeps the phone number but stops texts; the member gets an email and an inbox
item ("Texts paused: …"). Regaining it doesn't switch texts back on without a tap.

## 7. Consent and the law (design, not legal advice; lawyer review before launch)

- **Text opt-in**: unticked checkbox beside the phone field with the versioned disclosure:
  *"Text me Boom Alerts from Boomertanger at this number. Up to 60 msgs/month. Msg & data rates
  may apply. Reply STOP to cancel, HELP for help. Consent isn't required to join or buy anything.
  [Text terms] [Privacy]"*. Stored: time, disclosure version, page, method `web-checkbox`.
- **Verification**: a 6-digit code by text (10 minutes, 5 tries, 3 codes an hour, 5 a day). The
  number is linked to one account only.
- **STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, OPTOUT, REVOKE** → all texts off at once,
  recorded, confirmed by Twilio's opt-out reply; **START / UNSTOP** re-enables (only if consent
  exists); **HELP** → "Boomertanger alerts: help at boomertanger.com/alerts/sms or
  support@boomertanger.com. Reply STOP to end." (Twilio Advanced Opt-Out). Turning texts off on
  the site works the same way.
- **Consent proof** is kept for 5 years after opt-out (phone hash, times, disclosure version),
  even after account deletion; the Privacy Policy says so (lawyer check).
- **Email**: SPF, DKIM, DMARC; every non-account email has a visible unsubscribe link and the
  one-click header (`List-Unsubscribe` + `List-Unsubscribe-Post`), applied instantly; footer:
  why you got this, manage preferences, the owner's PO box as the postal address (decided
  2026-10-07; the exact address is set in `alerts/main.postalAddress`, asked for at build time). Hard bounce or spam complaint → email alerts off for
  that member, banner on the preferences page.
- **Privacy Policy additions**: phone numbers are used only for alerts and never shared or sold
  for marketing; the text program terms; consent retention.
- **Minors (13–17)**: no phone collected, no texts; inbox, push and email allowed with the fixed
  quiet hours (§5a). Turning 18 makes texts available, never switched on automatically.
- **Toll-free verification** needs reviewers to see the opt-in and policies: a Cloudflare Access
  **bypass for `/alerts/sms`, `/privacy` and `/terms` (and their assets) on staging**, still noindex.

## 8. Data model

All server-written unless noted. Site paths under `sites/boomertanger/`.

| Path | Read | Holds |
|---|---|---|
| `alerts/main` | Admins | Settings: channel switches, pause, SMS budget and month spend, caps, text window, Discord topic map, topic overrides (enabled, default channels), staging allowlist, disclosure version |
| `alertPrefs/{uid}` | That member | `topics { id: { inbox, push, email, sms, mode: instant|digest } }`, `quiet { start, end, allowLive }`, `timeZone`, `digestTime`, `followAuto`, `pausedUntil`, `preset`, `updatedAt` (written via callable) |
| `alertPrefs/{uid}/follows/{gameSlug}` | That member | Followed Vault games (max 100), `source: manual|vote|want` |
| `alertPrefs/{uid}/reminders/{streamId}` | That member | "Remind me" on one stream; TTL after the stream |
| `alertPrefs/{uid}/devices/{tokenHash}` | That member (label only via callable) | FCM token, label ("Chrome on Windows"), platform, `createdAt`, `lastSeenAt` |
| `users/{uid}/private/contact` | Server only | `phone { e164, verifiedAt }`, `sms { on, consentAt, version, optOutAt?, via? }`, `emailBad?` |
| `users/{uid}/private/phoneCode` | Server only | Hashed code, expiry, tries |
| `alertPhones/{phoneHash}` | Server only | uid, opt-out state (works for numbers without an account), consent proof (kept 5 years) |
| `inbox/{uid}` | That member | `unread`, `lastAt` (running total; the bell listens to this one doc) |
| `inbox/{uid}/items/{id}` | That member | `topic`, `title`, `body`, `link`, `icon`, `createdAt`, `readAt`, `expireAt` (TTL 90 days) |
| `notifyOutbox/{id}` | Server only | The event queue (already in the Planner spec), extended: `type`, `audience` (`members`, `crew`, `admins`, `fanClub`, `subClub`, `followers:{slug}`, `reminders:{streamId}`, `uids[]`), `subject { kind, id }`, `payload`, `priority`, `dedupeKey`, `notBefore?`, `status`, `counts`, `expireAt` (30 days) |
| `alertSends/{id}` | Server only | One per person × channel to send now; id = dedupe key |
| `alertHeld/{id}` | Server only | Held by quiet hours or summary, with `sendAt` and `expiresAt` |
| `alertLog/{id}` | Admins | Delivery log: uid, channel, topic, status (`sent`, `delivered`, `failed`, `quiet`, `capped`, `optedOut`, `expired`, `staging-blocked`), provider id, error, est. cost, `expireAt` (TTL 90 days) |
| `alertCounts/{uid}` | Server only | Today's and this month's counts per channel |

Producers call one helper, `queueAlert({ type, audience, subject, payload, priority })` in
`functions/lib/alerts/queue.js`. The Planner's existing outbox writes are compatible; its
`crew-reminder-1h` becomes `crew-reminder-30m` (amendment).

Logs: adminLog feature `boomAlerts` (`settings`, `topic`, `send`, `test`, `retry`, `pause`,
`budget`, `smsGrant`). No activityLog events (alerts are private).

## 9. Functions (`functions/lib/alerts/*.js`, JavaScript)

| Function | Kind | Does |
|---|---|---|
| `logic.js` | Pure | Audience → recipients, `decide()` per person × channel (send / hold / summary / skip), quiet hours across time zones, midnight and DST, the text window, caps, coalescing, `canText`, GSM-7 and 160-character check, summary grouping. Checked by `scripts/check-alerts.js` in `npm run check` (includes every text template's worst case) |
| `templates.js` | Pure | Every topic × channel: inbox, push (title, body, tag), text, email (subject, HTML, plain text) |
| `alertsFanout` | Trigger on `notifyOutbox` create | Resolve recipients in pages of 500, write inbox items, sends, held items |
| `alertsSend` | Trigger on `alertSends` create | Calls the adapter (`sms-twilio.js`, `email-resend.js`, `push-fcm.js`, `discord.js`), retries transient errors 3× with backoff, logs, removes dead push tokens |
| `alertsTick` | Every 5 min | `stream-soon`, reminders, `crew-reminder-30m` from published streams; release held items; summaries at each member's time; `game-tonight` at noon; `crew-daily`; budget checks |
| `alertsSavePrefs`, `alertsPreset`, `alertsPause` | Callables (members) | Validate and save; presets "Just go-live", "Everything", "Quiet" |
| `alertsPushRegister` / `alertsPushRemove` | Callables | Devices |
| `alertsPhoneStart` / `alertsPhoneConfirm` / `alertsPhoneRemove` / `alertsSmsToggle` | Callables | Phone, consent, verification, on/off |
| `alertsRemindMe`, `alertsFollowGame`, `alertsMarkRead` | Callables | One stream, follows, read state (keeps the unread count right) |
| `alertsAdminSend`, `alertsAdminTest`, `alertsAdminRetry`, `alertsAdminSettings`, `alertsAdminGrant` | Callables (owner / admins as §2) | Compose (audience, channels, preview, recipient count and est. text cost, confirm), test any template to yourself, retry failures, settings, owner text grant |
| `alertsUnsubscribe` | HTTPS | One-click POST and the page's request; signed token (`ALERTS_UNSUB_KEY`), no personal data in the URL |
| `alertsTwilioInbound` / `alertsTwilioStatus` | HTTPS | STOP/START/HELP and delivery receipts; Twilio signature checked |
| `alertsResendEvents` | HTTPS | Bounces and complaints; signature checked |

Account deletion (ws 8 list): prefs, devices, inbox, contact, counts deleted; consent proof kept (§7).

## 10. Secrets and setup (the owner sets secrets himself; never in chat)

Secrets (`firebase functions:secrets:set <NAME> --project staging`): `TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `ALERTS_UNSUB_KEY`,
`DISCORD_WEBHOOK_PUBLIC`, `DISCORD_WEBHOOK_CREW`. Not secret (site config / settings): the Twilio
Messaging Service ID and toll-free number, the FCM web push key (VAPID), the sending address.

One-time steps (detailed in the Claude Code prompt): Twilio account (upgrade, add funds), buy a
toll-free number, Messaging Service with Advanced Opt-Out and the HELP text, webhooks, submit
toll-free verification (legal name, EIN, address, the public pages, sample texts, ~2,000/month);
Resend domain `mail.boomertanger.com` with its DNS records in Cloudflare, and a DMARC record on
the root (`p=none` to start) — Cloudflare Email Routing for support@ is untouched; FCM web push
certificate; Discord webhooks (optional). Staging uses the number until launch; at launch it moves
to production (a second number for staging only if needed).

## 11. UI (mockups will be the source of truth)

**Feature top bar (every Boom Alerts page):** `.bt-topbar` > `a.bt-wordmark` (`.bt-wordmark-icon` >
`.bt-bal-icon`, the animated bell from `shared/ui/alerts.js` `BAL_ICON`: purple bell, blood-drop
clapper, lamp-yellow sound arcs; swings every 3.6 s like the Arcade joystick, still under reduced
motion; `.bt-wordmark-text` BOOM + `.bt-wordmark-accent` ALERTS) + `.bt-topnav` with ghost
`.bt-btn--sm` links: Inbox (`/alerts`), Settings (`/account/alerts`), and a green Admin
(`/admin/alerts`) for admins; icon-only at ≤ 420px. Page titles under it: Inbox, Settings, Admin.

**Bell** (tool UI): `.bt-bell` in the header with an unread count (blue "new" badge style, 9+
cap); panel grouped Today / Earlier, rows with topic icon, title, time, unread dot; Mark all read;
gear to settings; See all; empty state with the mascot ("All quiet… too quiet."). Phones: a sheet.
New item arriving: the bell swings once (still under reduced motion).

**`/account/alerts`** (tool page): hero header with a small scene (the mascot on a crackling
radio), quick presets, Channels (push devices with Add this device and the iPhone guide; email;
text with the eligibility state and phone verification), the topics × channels grid by group
(Account row locked), quiet hours, summary time, time zone, followed games, Pause all. Celebration
when a phone is verified (splat burst, mascot thumbs-up; none under reduced motion).

**Phone verification**: an `openModal` dialog: number → consent checkbox → Send code → 6-digit
code input → verified.

**`/admin/alerts`** (tool page): health strip (each channel's state, Twilio verification status,
this month's texts and est. cost vs budget), Send (composer with live previews: lock screen, text
bubble, email), Test sends, History (each event with counts per channel and status), Failures
(retry), Settings. Staff controls green; "Remove phone" is the only red (it deletes data).

**Message previews** (in mockups and the admin composer): iPhone lock screen, Android
notification, text thread, email (dark with light-mode fallback).

**Other features**: "Remind me" on /schedule cards and the marquee; "Follow" on Vault game pages.

**Kit pieces to add** (bt-ui.css + shared/ui/*.js + /dev/ui-kit): `.bt-bal-icon` (BOOM ALERTS
wordmark icon), `.bt-bell` + panel,
`.bt-inbox-item`, `.bt-pref-grid` (topic × channel toggles), `.bt-channel-card`, `.bt-code-input`,
`.bt-quiet` (quiet hours range), `.bt-device-row`, `.bt-preview` (lock screen / text / email
frames), plus the Boom Alerts icon. Reuse existing switches, pills, badges and dialogs.

## 12. Edge cases

- Stream delayed twice in 5 minutes: one message with the latest time. Cancelled after "Remind
  me": the cancellation goes to everyone with the reminder.
- Go-live during your quiet hours: inbox only, expires after 2 h.
- A phone already on another account: refused. A number with no account texts STOP: recorded.
- Carrier says the number is unreachable or opted out (Twilio 21610 and similar): texts off, banner.
- Email bounces or a spam complaint: email alerts off, banner to fix.
- Push token dead: device removed silently.
- Provider outage: 3 retries, then Failures + one `admin-health` alert an hour at most.
- Budget reached mid-blast: the rest of member texts go to the inbox; crew duty continues.
- Member loses eligibility (Sub Club ends, mod to Reserve): texts paused with a notice.
- Teen turns 18: text option appears; nothing switches on by itself.
- A followed game is hidden or deleted in the Vault: the follow is removed quietly.
- DST and time zone changes: quiet hours and summaries use the member's zone at send time.
- Staging: anyone not on the allowlist gets the inbox only (`staging-blocked` in the log).

## 13. Expected monthly cost (Twilio toll-free + Resend; mid-2026 prices, verify)

Assumes ~35 streams a month, mods ~40 texts, Sub Club texters ~30 texts, everyone opted in.

| Scenario | Texts | Texts + number | Email | Total |
|---|---|---|---|---|
| 20 mods | ~800 | ~$11 | $0 (free tier) | **~$11** |
| + 100 Sub Club | ~3,800 | ~$45 | $20 | **~$65** |
| + 500 | ~15,800 | ~$181 | $20 | **~$201** |
| + 2,000 | ~60,800 | ~$689 | $20 | **~$709** |

About $0.34 per Sub Club texter a month. Push and Discord are free. The Twilio adapter is one file,
so Telnyx (~40% cheaper) stays a later option.

## 14. Parts (one commit each)

1. Docs: this spec; amend `scream-planner.md` (30-minute crew reminder, outbox fields) and
   `foundation.md` (alerts); ROADMAP (new workstream, status); privacy policy additions drafted;
   CHANGELOG.
2. Backend logic: `alerts/logic.js`, `templates.js`, `check-alerts.js`.
3. Backend wiring: triggers, tick, callables, HTTPS endpoints, adapters, rules, indexes, TTLs
   (`inbox/*/items`, `notifyOutbox`, `alertLog`, `alertHeld`, reminders); staging deploy.
4. Producers that exist now: account security notices, Arcade (`arcade-beaten`, `arcade-new`),
   Vault results (if built), the Planner outbox.
5. Site (after mockups): kit pieces + UI kit page, bell, `/alerts`, `/account/alerts`, phone dialog,
   `/admin/alerts`, `/alerts/sms`, `/alerts/unsubscribe`, service worker + web app manifest,
   Remind me and Follow buttons, design-system.md §8.
6. Setup and live test: Twilio verification, Resend DNS, Discord, the staging test checklist.

## 15. Confirmed choices (all 12 confirmed 2026-10-07)

1. URLs: **`/alerts`, `/account/alerts`, `/admin/alerts`, `/alerts/sms`, `/alerts/unsubscribe`**.
2. Texts **18+ only**; teens get inbox, push and email with fixed quiet hours.
3. Text window **8 AM – 9 PM recipient time for member topics**; crew duty texts exempt.
4. Crew reminders: **24 h + 30 min** (replaces the Planner's 1 h).
5. Visitors **see the bell, which opens Join free**.
6. **Staging allowlist** for texts and email.
7. **Cloudflare Access bypass** on staging for `/alerts/sms`, `/privacy`, `/terms`.
8. **Keep consent proof 5 years** after opt-out, even after deletion.
9. **Auto-follow** games you vote for or "want" (members can turn it off).
10. Limits: **6 texts a day, 60 a month per person; $25 monthly SMS budget** to start.
11. Discord: **webhooks only, off by default**, topics as §4.
12. ROADMAP: **new workstream "Boom Alerts", next after the Scream Planner**, required before launch
    (account and security emails, and the Planner's outbox, depend on it).
