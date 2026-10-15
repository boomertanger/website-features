# Spec: Traffic Pulse — CONFIRMED (2026-10-15)

Picks: **H1 Monitor** hero, **L1 Triage** overview, **F1 Scatter** focus map (lanes on phones).
Mockup: `docs/design/mockups/traffic-pulse.html` (all sample data, repo-safe).
New ROADMAP workstream (next free number). Replaces the `trackEvent` helper and the
"Feature Pulse" view that `foundation.md` planned for Night Watch; Night Watch can embed the
/admin card later.

## 1. Summary

Traffic Pulse is the site's private analytics service. Each week it answers four questions:
what's working (expand it), what's leaking (fix it), what's hidden (promote it), and are we on
pace (goals). It works per **service** (the Service Hub manifests), with drill-down to pages.

Privacy first, as `foundation.md` promises: no cookies, no cross-site tracking, no individual
visitor trails, no ad IDs. Everything is stored as counts.

Out of scope for v1 (later phases): weekly email report (after Resend), A/B experiments,
BOOMBOT insights, a custom funnel builder, a traffic panel inside Service Hub's detail dialog,
a Night Watch embed, site search terms.

## 2. Pages and who sees what

| Where | Who | What |
|---|---|---|
| `/admin/pulse` | Owner + admins (Steward and up) | The tool page |
| `/admin` card | Same | Today vs. usual, the newest open alert, the goal that most needs attention; opens /admin/pulse |
| Settings tab | Owner + A2+ (Overseer, Right Hand) | Goals, alert rules, staff exclusion, sampling, campaign tags |
| Alerts and notes | Every Pulse viewer (A1+) | Acknowledge, snooze, add notes |

Stewards see Settings read-only with the notice "View only. Stewards can view, acknowledge
alerts and add notes. Overseer and Right Hand change settings." Rules allow reads for site
admins only; every write goes through Cloud Functions; settings changes go to adminLog
(feature `trafficPulse`). No nav group entry (admin pages aren't in the header nav).

## 3. What's measured

### A. The Pulse beacon (first-party, cookieless)
- A small script in the base layout sends batched events with `navigator.sendBeacon` to a
  same-origin endpoint `/p` (Cloudflare Pages Function or Astro endpoint, whichever matches the
  site's setup). `/p` forwards to the `pulseBeacon` function with the visitor's IP from
  `CF-Connecting-IP` and a shared header `x-pulse-key` (secret `PULSE_PROXY_KEY`, set on both
  sides). `pulseBeacon` rejects requests without the key.
- `<body data-service="<id>">` is written at build time from the manifests (route → service).
- Events: `view` (service, path without query or hash, section, signed-in flag, live flag from
  the header's `data-live`, device class, referrer domain, `ref` tag), `engaged` (visible 10 s+,
  once per view), `scroll` (25/50/75/100), `cta` (elements with `data-pulse="<id>"`, plus
  automatic E1 opens, `data-talkback` buttons and outbound links), `error` (JS error count per
  service; message trimmed to 120 characters, no URLs with query strings, nothing personal).
- `?ref=` is read once, sent with the view, then removed with `history.replaceState`.
  Each redirect domain adds its own ref (e.g. boomertanger.live → `ref=dom-live`).
- Back/forward cache restores count once (`pageshow` with `persisted`).
- Not counted: localhost, `?as=member` previews, staff (owner + admins, on by default,
  setting), known bots and headless browsers, Global Privacy Control or Do Not Track, and
  members who switch on "Don't count my visits" (Account › Privacy; a user-writable
  preference field on `users/{uid}`). Production counts only the boomertanger.com hostname.
- Unique visitors: `pulseBeacon` hashes IP + user agent + hostname with today's salt
  (`pulse/main/private/salt`, random, overwritten at midnight America/Los_Angeles). IP and user
  agent are never stored. Members are de-duplicated by uid in markers that expire through TTL.

### B. Cloudflare Web Analytics
`pulseCfPull` (hourly for today, and at the daily close) reads visits, countries, browsers and
Core Web Vitals (LCP, INP, CLS, p75) per path through Cloudflare's GraphQL Analytics API.
Shown under their own labels, never added to the beacon's counts. Token secret
`CLOUDFLARE_ANALYTICS_TOKEN` (read-only analytics); account id and site tag in
`functions/.env`. Until the token exists the page shows "Cloudflare: not connected" and
everything else works.

### C. Site data that already exists (read only; no changes to other features' functions)
Sign-ups (count queries on `members.joinedAt`), Arcade plays, Vault votes, Service Hub
ratings, Bug Zapper and Feature Lab counts per service, broken links, Hotline Boom counts per
line (`serviceStats`, counts only), and the growth collector's social counts.

### D. Streams
Every view carries the live flag. `pulseDaily` builds a rollup per stream from the stream doc's
live window: visits during the stream and the hour after, joins, referrals from Twitch, YouTube
and TikTok, and the peak minute.

## 4. The focus engine

Pulse score 0–100 per service, from four vitals shown separately:

| Vital | Built from |
|---|---|
| Reach | Views and unique visitors vs. the site median, plus trend |
| Engagement | Engaged-view rate, scroll depth, CTA rate, return rate |
| Health | Core Web Vitals pass rate, JS errors, broken links, open bugs |
| Love | Service Hub ratings score (only with 3+ member ratings, same rule as the game pages) |

**Focus map:** Reach (views, log scale) across, engagement up, split at the median and 50%:
Expand (high/high, lime), Fix (high reach, low engagement, gold), Spotlight (low reach, high
engagement, blue), Rethink (low/low, gray). Manifests may mark a service `utility` so Rethink
reads "fine for a utility". A service needs 50 views in 28 days; under that it shows
"Not enough visits to judge yet."

**Next best moves:** up to 5, ranked by traffic × size of the gap, written by plain rules (no
AI), each with its evidence chips, an impact level (`.bt-level`), an action button and
Mark done (it drops off next week unless the numbers still say so).

**Join path (fixed, v1):** Visited → Opened Join → Started signup → Made an account → Came back
within 7 days, site-wide and per entry service. The step with the biggest drop is gold.

## 5. Goals
Owner/A2+ set targets: monthly visitors, new members, Fan Club joins, member return rate, or
views on a chosen service. Each shows a `.bt-meter` with a marker for "where you should be
today" and a badge: Ahead (lime), On pace (blue), Behind (gold). Hitting a goal or a record
plays the celebration (section 8). No goals are seeded.

## 6. Alerts
`pulseRollup` (every 15 min) runs the fast checks, `pulseDaily` (00:30 America/Los_Angeles)
the slow ones. Baseline: median of the same weekday over the last 4 weeks, with minimum volumes.

| Alert (default on) | Trigger | Severity |
|---|---|---|
| Traffic spike | A service at 3× usual for an hour (with where it came from) | Urgent |
| Traffic drop | Site or service under 50% of usual for a full day | Urgent |
| Beacon silence | No events for 2 h while Cloudflare still sees visits | Urgent |
| Error surge | 3× usual, or 20+ in an hour, on a service | Watch |
| Missing page surge | 10+ hits on one missing path in a day (links to Broken links) | Watch |
| Slow page | LCP p75 over 2.5 s for 3 days in a row | Urgent |
| Goal off pace | Behind by 15%+ with a week left | Watch |
| Record | Best day or best stream ever | Good news |

States: New (blue), Acknowledged (teal, shows who), Snoozed (gray, 1 day or 7 days),
Resolved (lime, automatic when the condition clears). Each alert is written to `notifyOutbox`
as type `pulse-alert`, audience `admins`, no message text in the payload, with a dedupeKey.
Every rule can be edited or switched off in Settings.

## 7. Reports and notes
- Weekly report (Monday 06:00 America/Los_Angeles) and monthly report (the 1st), stored in
  `reports/{id}`: headline numbers vs. the previous period, focus map movement, top and bottom
  services, sources, the best stream, goals, alerts, the moves. Copy summary, Print (clean
  print stylesheet), CSV export for every table.
- Notes on the timeline: automatic pins for Service Hub version bumps, streams and YouTube
  uploads, plus manual notes. Shown as blue numbered pins on every trend chart.
- Optional one-time baseline: Squarespace monthly visit totals as a dashed "old site" line.
  Export from Squarespace before it's cancelled (ROADMAP).

## 8. UI (tool page)
- Top bar: `TRAFFIC` + `PULSE` wordmark (`.bt-wordmark`, ECG icon in purple), range chips
  (Today, 7 days, 28 days, 90 days, 12 months), Compare switch.
- **Overview only:** the hero: `.bt-title` "Traffic Pulse" + Staff badge, the **H1 Monitor**
  (a bezel screen; the trace is the last 24 hours of real visits by hour, the faint line is a
  usual same weekday, red bands mark the on-air hours, a sweep bar moves across; tags "Last 24
  hours", "<n> visits this hour", "Usual for a <weekday>: <n>"), and four `.bt-kpi` tiles
  (Visitors, Page views, Engaged views, New members). Other tabs show a slim header: title,
  Staff badge and a tiny live pulse ("<n> visits this hour").
- Tabs (`.bt-seg-nav`): Overview, Services, Audience, Health, Alerts (open count), Reports,
  Settings. Overview filters: All traffic, Visitors, Members, During streams.
- **L1 Triage** overview grid: Next best moves (left, tall) | Focus map, Goals (right); then
  Visits chart (full width); then Top movers | Join path. One column under 1024px.
- **F1** scatter: bubble size = views, quadrant tints, median and 50% split lines, keyboard
  focusable bubbles that open the service. Under 640px it switches to lanes automatically.
- Services: sortable table (Pulse score, Views, Change, Engaged, Health, Love), cards on
  phones, CSV; a row opens the **service detail dialog** (`openModal`, deep link `?service=`):
  score ring, Focus badge, the four vitals, the trend with note pins, pages, clicked CTAs,
  sources, notes with Add note.
- Audience: sources, live vs. off air, devices, top countries (Cloudflare), the redirect
  domains and ref tags (name above its bar), streams with small curves.
- Health: KPI tiles, Speed by service ("Shows in", "Tap reply", "Jumpiness", errors; lime
  good, gold needs work, pink poor, Core Web Vitals limits), top script errors (Report in Bug
  Zapper), missing pages (Open Broken links).
- Alerts: filter chips (Open, Snoozed, Resolved, All); Acknowledge (admin green), Snooze a
  day, Open service; mascot empty state "All quiet".
- Reports: list of weeks and months, report view.
- Settings: Goals, Alert rules, Privacy and counting (staff exclusion switch; GPC/DNT,
  member opt-out and "no cookies, no stored IPs" shown locked), Campaign tags (Copy link, New
  tag), Cloudflare connection status.
- States: skeleton rows while loading; "No pulse yet" mascot empty state before launch;
  low-data line; stale Cloudflare `.bt-notice--warn` row with Try again; "Staging: sample
  data" badge when the sample script's data is present.
- Celebration (goal hit or record): the trace turns gold with a heartbeat flash and a
  "Record day" chip; the matching KPI ticks. Reduced motion: no sweep, no flash, a static chip.
- Writes use admin green buttons (Mark done, Acknowledge, Add goal, New tag, Add note, Try
  again); everything else is secondary.

### Colors and kit
- `--tp-phosphor: #34e21c` (with `--tp-phosphor-rgb: 52, 226, 28`), the monitor's neon green,
  on a near-black glass `#020903`. It's a **monitor light** (like the firefly's lamp), distinct
  from admin green and `--bt-green`; used only for scenes drawn as screens, never for buttons,
  badges or text that means something. Declared once in the feature CSS. Record in
  design-system §8.
- Charts: gold = this period, gray dashed = previous period, blue = note pins, red tint = on
  air (the live color). No purple in charts.
- `.bt-delta`: **lime = better, gold = worse**, gray = flat; the arrow shows the direction
  (so rising errors are ▲ in gold). Never color alone (screen-reader text says "up, worse").
- New kit pieces (bt-ui + UI kit page): `.bt-kpi` (built on `.bt-stat`), `.bt-spark`,
  `.bt-delta`, `.bt-quadrant` with `.bt-lanes`. **The Visits chart extends the existing
  `.bt-chart` (shared/ui/chart.js)** with a compare series and note pins instead of creating a
  new chart; stream days use its band support. The mockup's `.bt-trend` was a stand-in.

## 9. Data model (`sites/boomertanger/pulse/main/`)

| Path | Holds | Lifetime |
|---|---|---|
| `buffer/{autoId}` | Raw events (no IP, no uid, no user agent), `expireAt` | TTL 48 h |
| `private/salt` | Today's salt | Overwritten daily |
| `uniq/{day}_{hash}` | Visitor dedupe markers | TTL 2 days |
| `uniqMembers/{day}_{uid}` | Member dedupe markers (return rate) | TTL 8 days |
| `days/{date}` | Site totals | 25 months |
| `services/{id}/days/{date}` | Views, uniques, engaged, scroll, CTAs, errors, vitals | 25 months |
| `paths/{pathHash}/days/{date}` | Per page | 25 months |
| `sources/{date}`, `streams/{streamId}` | Audience and stream rollups | 25 months |
| `months/{yyyy-mm}` | Monthly rollups | Kept |
| `scores/current`, `moves/current`, `alerts/{id}`, `goals/{id}`, `notes/{id}`, `reports/{id}`, `settings/main`, `refs/{tag}` | Engine output and settings | Kept |

Dates are `YYYY-MM-DD` in America/Los_Angeles. Retention is enforced by `pulseDaily` (deletes
daily docs older than 25 months after the monthly rollup exists) and TTL policies.

Functions (`functions/lib/pulse/*.js`; none loads `rewards/grant.js`):
`pulseBeacon` (HTTPS; method POST, origin check, `x-pulse-key`, 8 KB cap, per-hash rate
limit), `pulseRollup` (every 15 min), `pulseDaily` (00:30), `pulseCfPull` (hourly),
`pulseReport` (Mon 06:00, 1st 06:30), `pulseAdmin` (callable: goals, rules, notes, alert
actions, move done, exclusions, refs, CSV; role checks inside). Settings changes →
adminLog `trafficPulse`. No activityLog entries.

Service Hub manifest `services/traffic-pulse.json` (type feature, area admin, talkBack skip).
Staging sample data: `functions/scripts/pulse-sample.js` (staging only; 90 days; `--clean`).
Test plan: `docs/testing/traffic-pulse-test-plan.md`.

## 10. Edge cases
Pages without a manifest route count as "unassigned" and are flagged; renamed paths keep
history through the service id; Cloudflare and the beacon will disagree slightly (explained
on the page); staging and production never mix (separate projects); bots that run JS but
fail the checks are dropped; a sudden write surge flips nothing automatically (sampling is a
manual setting).

## 11. Launch
- Privacy policy paragraph (cookieless counts, daily-rotating hash, no stored IP, GPC/DNT and
  "Don't count my visits"); part of the pre-launch policy review.
- Production: rules, TTL policies, the `pulse` functions, `PULSE_PROXY_KEY` on both sides,
  `CLOUDFLARE_ANALYTICS_TOKEN`, confirm the four schedulers.
- Export Squarespace visit history before cancelling (deadline Jul 1, 2027).
