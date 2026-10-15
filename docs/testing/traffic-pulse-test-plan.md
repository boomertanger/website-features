# Traffic Pulse test plan

Hand-run checks for Traffic Pulse on staging (`staging.boomertanger.com`, `PUBLIC_FIREBASE_ENV=staging`). The automated checks (`npm run check` in `functions/`, which runs `scripts/check-pulse.js`: batch cleaning, the rollup tally, the focus engine, the join path, goal pace, and that `lib/pulse` never loads `rewards/grant.js`; and the Playwright runs in the build notes) cover the logic and the layouts. This plan is what needs real browsers, real accounts and the deployed functions. Spec: `docs/specs/traffic-pulse.md`; mockup: `docs/design/mockups/traffic-pulse.html`.

**Accounts:** the **owner**; an **A2 Overseer** (or the owner again); an **A1 Steward** (an admin without an A2 grade); **@gbo** (a member); a **visitor** (an incognito window signed out of the site, after the Cloudflare Access login).

**Before you start:**
- `PULSE_PROXY_KEY` is set in Firebase staging **and** in the Cloudflare Pages preview environment (same value), and the six pulse functions are deployed.
- The TTL policies on `buffer`, `uniq` and `uniqMembers` (field `expireAt`) show as active.
- For the page: `node functions/scripts/pulse-sample.js --apply` loads 90 days of sample data (the page shows "Staging: sample data"); `--clean --apply` removes it.

## 1. The beacon (cookieless counting)

| # | Do | Expect |
|---|---|---|
| B1 | As the visitor, open any page, DevTools › Network, filter `/p`. Stay 10 s, scroll to the bottom, then switch tabs. | One POST to `/p` (204). The payload (text) has `view`, `engaged`, `scroll` 25/50/75/100; no cookie is set (Application › Cookies has nothing new from the site). |
| B2 | Open `/?ref=dom-live`. | The address bar loses `?ref=` within a second or two; the next batch's view has `tag: "dom-live"`. |
| B3 | Click a tagged button (e.g. the Arcade's Play now, `data-pulse="play-now"`), a Join free button and an outbound link (a Twitch link). | `cta` events `play-now`, `join-open`, `out:twitch.tv`. |
| B4 | Open a page with `?as=member`. | No `/p` request. |
| B5 | Turn on Global Privacy Control (Brave, or a GPC extension) and reload. | No `/p` request. |
| B6 | As @gbo: Account › Privacy › **Don't count my visits** on. Reload a page. | The switch saves; no `/p` request. Turn it off: requests come back. |
| B7 | As @gbo, try writing any other field on your users doc from the console (`updateDoc(doc(db,"users",uid),{ageBand:"18+"})`). | Permission denied (only `pulseOptOut` is writable, and only as a boolean). |
| B8 | As the owner (staff), browse a few pages; wait 15 min. | Nothing counted while Settings › Don't count staff is on (the default); turn it off, browse again: counted. |
| B9 | `curl -X POST https://us-central1-boomertanger-staging.cloudfunctions.net/pulseBeacon -d '{}'` | 403 (no `x-pulse-key`). |
| B10 | Back/forward: open page A, go to page B, press Back. | One new `view` for page A (the restore counts once). |

## 2. The rollup and the page

| # | Do | Expect |
|---|---|---|
| P1 | After real visits, wait for the 15-minute rollup (or run it from the console). Open /admin/pulse as the owner. | The monitor's last hour shows the visits; "visits this hour" matches; Overview KPIs are numbers, not dashes. |
| P2 | With sample data: Overview at 1280 and 390. | L1 layout on desktop (moves left, map and goals right, Visits full width, movers and join path); one column under 1024; the focus map turns into lanes under 640; no sideways scroll. |
| P3 | Range chips Today / 7 / 28 / 90 days / 12 months; Compare off and on; filters. | The KPIs, sparks and the Visits chart change; the gray dashed previous period hides with Compare off. |
| P4 | Hover or tab to a blue note pin on the Visits chart. | The note shows in the tooltip. |
| P5 | Click a bubble on the focus map, a service row, a mover. | The service dialog opens; the address has `?service=<id>`; Escape closes it and removes it. Reloading with `?service=` opens it again. |
| P6 | In the dialog, Add note. | The note saves (toast) and appears as a pin on the dialog's chart. |
| P7 | Services: sort by each column; Download CSV. | Sorting works; the CSV opens in a spreadsheet with one row per service. |
| P8 | Alerts: Acknowledge, Snooze a day. | The state badge changes (Acknowledged shows who); Open filter counts update; with nothing open: the mascot "All quiet". |
| P9 | Reports: open the sample week; Copy summary; Print. | The clipboard has the report text; the print preview hides the site chrome and the buttons. |
| P10 | Mark done on a move. | It greys out with a line through; Undo brings it back. |

## 3. Settings and roles

| # | Do | Expect |
|---|---|---|
| S1 | As the Steward, open Settings. | "View only. Stewards can view, acknowledge alerts and add notes. Overseer and Right Hand change settings."; every control is disabled. Alerts and notes still work. |
| S2 | As the Overseer: add a goal (Monthly visitors 20,000), change an alert rule, add a campaign tag (`tt-bio` → `/`), Copy link. | Each saves (toast); the goal shows on Overview with its "where you should be today" tick; the link has `?ref=tt-bio`. adminLog has entries with feature `trafficPulse`. |
| S3 | Cloudflare row before the token exists. | "Not connected (missing: token)". Try again keeps it. |

## 4. Schedules and data hygiene

- Firebase console › Functions: `pulseRollup` (every 15 min), `pulseDaily` (00:30 America/Los_Angeles), `pulseCfPull` (hourly at :05), `pulseReport` (06:00 and 06:30) exist and their Cloud Scheduler jobs are ENABLED.
- After a night: `pulse/main/private/salt` has today's `day`; `scores/current` and `moves/current` are from yesterday.
- `buffer` docs older than 48 hours disappear (TTL can take up to a day).
- No document under `pulse/main` holds an IP, a user agent or a uid (buffer events have none; `uniqMembers` ids carry a uid but expire after 8 days).
