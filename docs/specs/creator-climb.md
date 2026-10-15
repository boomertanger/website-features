# Creator Climb — follower growth across every platform

Status: confirmed Oct 15, 2026, including Addendum A (site members) and the Crossover chapter. Updated Oct 15, 2026
to match the repo: peak viewers (§6, §9), the sign-in method and `joinedAt` (§9b), the `completeSignup` change (§10), and Boomer's stream sheet (§3).
Picks: hero **H1-D Summit camp**, line colors **P1 Night lamps**.
Mockup: `docs/design/mockups/creator-climb.html` (its "After launch" moment uses made-up SAMPLE
numbers to show the relaunch; H1-A/B/C and P2/P3 were not picked and are not built).
Related: `growth-collector.md` (daily counts), `stream-object.md` and `control-room.md` (streams),
`service-hub.md` (manifest, page strip), `header-nav.md` (Community group).

## 1. What it is

A story page at **/climb** that tells Boomertanger's growth since January 2025 and keeps itself up
to date with no manual work. Visitors see the summary; signed-in members (Fan Club) see every
stream day, month reports, records and pace. Two climbs are shown side by side: **followers**
(Twitch + TikTok + YouTube) and **site members** (boomertanger.com, from launch). Members are never
added to the follower total, because most members also follow on a platform. A **Crossover**
chapter shows how new TikTok followers come with new Twitch, YouTube and site growth. Admins get
one card on /admin. It replaces the
Squarespace pages /growth-2025 and /growth-2026, which redirect to /climb at launch.

Nav: Community group, blurb "Follower growth across every platform", with its own summit icon (`i-climb` in the nav sprite).

## 2. Where the numbers come from

| Data | Source | Manual work |
| --- | --- | --- |
| Twitch followers, YouTube subscribers | `growthDaily/{day}` (collector, 05:00 Los Angeles) | none |
| TikTok followers | `growthDaily/{day}.tiktok` (`source` api or manual) | the existing manual card until TikTok approves the app |
| Streams, hours, peak viewers | Control Room streams that ended in the month; after-shows (`afterShowOf` set) and ad hoc backstage streams are not counted | none |
| Milestones | detected from the points (§9) | none |
| Records | calculated, plus imported records (§3) | none |
| Site members | count queries in the same morning run (§9b), from launch | none |
| Live likes | optional number per month (no platform API offers TikTok LIVE likes; Twitch has none) | optional |
| Highlights | optional lines per month | optional |
| History Jan 2025 – Sep 7, 2026 | one-time import (§3): the old pages + Boomer's stream sheet | none |

## 3. History import

File: `functions/scripts/data/climb-history.json` (**gitignored**, never committed: detail is
members-only and the repo is public). 11 months, 330 points, read from both Squarespace pages
(text and chart blocks) on Oct 15, 2026. Shape: `combinedOnly` (Jan–May 2025 combined totals),
`months["YYYY-MM"] = { streams, hours, likes|null, highlights[], lastReadingDay?, platforms: {
twitch|tiktok|youtube: { monthEnd, startingBalance?, points: [["YYYY-MM-DD", n]], note? } } }`,
`records[]`, `eras[]`.

**Stream sheet (May 13, 2026 onward):** `functions/scripts/data/climb-sheet.csv` (**gitignored**),
a CSV export of Boomer's stream log with these exact headers: `Enter Stream Date` (M/D/YYYY),
`How many streams?`, `Enter Total Likes`, `Enter Total Hours Streamed`, `Enter Twitch Follower
Count`, `Enter TikTok Follower Count`, `Enter YouTube Follower Count`. One row per stream day:
the follower counts become that day's points (`src: "import"`), and streams, hours and likes are
summed per month. The current file has 20 rows (May 13 – Sep 7, 2026). Boomer keeps logging
stream days in the sheet until launch and exports a fresh CSV right before the production seed,
so the production gap is only the days between the last row and launch. Sheet streams, hours and
likes count only for days before the Back on air date (after that, streams come from the Control
Room). Rows dated before the last JSON reading (Apr 20, 2026) are ignored; an unknown header or
an unparseable row stops the seed with the row number.

Confirmed decisions:
- **D1** July 2025 Twitch: month-end only (412); the old graph was a copy of August's.
- **D2** Totals are always the platforms added up, never typed. November 2025 = 6,615.
- **D3** A platform's first reading is a **starting balance**, not new followers (YouTube 443 on
  Aug 8, 2025). August 2025 new = 645.
- **D4** Likes kept as recorded; `null` where none (June, July 2025).

`functions/scripts/seed-climb-history.js --project <alias>`: dry run by default (prints what it
would write and the checks below), `--apply` writes. Staging first. It reads the JSON and, if present, the sheet CSV, and validates
before writing:
every month's platforms sum to its combined total; points are in date order inside their month;
no point after `lastReadingDay`. Imported points carry `src: "import"`. Re-running replaces
imported points only (never collector or manual points) and then runs the full rebuild.

## 4. Eras and the gap

Eras (editable on /admin): Before the push (Jan–May 2025), The grind (Jun 2025 – Jan 2026), The
build (Feb 2026 – launch, "Streaming paused to build boomertanger.com; surprise streams only"),
Back on air (from launch; its start date is set on /admin at launch and is also the members
start date).

**The gap:** between the last imported reading (Sep 7, 2026 today; the last sheet row at launch)
and the first collector reading in that project, charts draw a hatched band "Not tracked month by
month". No line crosses it and no
value is invented; lines break at the gap and resume at the first automatic reading. On staging the gap ends at the
first staging collector reading (late September 2026), on production at launch. Ranges count back from today, so a range that falls
entirely in the gap shows the empty state.

## 5. Who sees what

| | Visitors | Members (Fan Club) | Admins |
| --- | --- | --- | --- |
| Hero with total, platform chips, the ridge and scrub | ✓ | ✓ | ✓ |
| Members total, Members chart, member milestones | ✓ | ✓ | ✓ |
| Crossover headline and "on schedule vs paused" | ✓ | ✓ | ✓ |
| Crossover month by month; member breakdowns (joined / left, sign-up method, Fan Club / Sub Club) | lock card | ✓ | ✓ |
| Big chart: month-end per platform and combined, "All" only | ✓ | — | — |
| Big chart: every reading, ranges 30 days / 90 days / 1 year / All | lock chips | ✓ | ✓ |
| Milestones, platform totals, goal meters, How the numbers work | ✓ | ✓ | ✓ |
| Platform cards: month growth and best month | — | ✓ | ✓ |
| Month by month, records, pace | `.bt-lock-card` (opens E1) | ✓ | ✓ |
| /admin card | — | — | ✓ |

`?as=member` preview: localhost and staging only, never production.

## 6. /climb (story page, full frame)

TocLayout rail, `.bt-chapter--ghost` chapters:

**Hero H1-D Summit camp.** Title, lede "Every follower on Twitch, TikTok and YouTube since 2025,
counted one stream at a time.", the follower total and, from launch, the members total beside it
in the members color (both count up on load), the "Last reading …" line,
platform chips (icon, count, name), visitor call to action "Join free to see every stream day",
secondary "How the numbers work". The scene (SVG, `aspect-ratio`, never a fixed height): the
ridge is the combined month-end line (Jan 2025 → last reading) over a far ridge, stars and the
moon; after the last reading the ridge levels off into fog (never drawn as a drop). Tents and
campfires where Before the push and The grind began, a flag at every thousand (gold when reached),
and on the summit the cabin being built (scaffolding, crane, one lit window) labeled with the
current era. When the Back on air era has a start date, the cabin is drawn finished (no
scaffolding or crane), a new tent marks the Back on air camp, and a dark foreground hill rises
from the cabin with a teal members trail (its own scale) and a teal flag at every 100 members,
labeled "Members N". In the hero only, the untracked gap is drawn short (about 45 days wide) so
the relaunch has room; charts keep true time. The real mascot stands at the
last reading. One orchestrated moment on load: the flags raise in order. **Scrub the climb:**
hover or drag along the scene, or arrow keys / Home / End (`role="slider"` with value text):
the mascot moves to that month, the total shows that month ("End of September 2025: 5,769"),
flags light up to that point and a gold month pill sits over the mascot; Esc, leaving or
letting go (1.4 s on touch) returns it to the summit. Phones: the scene sits under the lede, full
width, labels larger, tent labels hidden. Reduced motion: no movement, values still change.

1. **The climb so far:** `.bt-chart`, series chips (Combined, Twitch, TikTok, YouTube; at least one
   stays on; hovering a chip highlights its line), range chips (§5), era bands, the gap, line-end
   platform icons (collisions nudged apart), "Show as table". Below it, a second card
   **Members on boomertanger.com**: a `.bt-chart` of the members total since launch (own scale),
   meta "N members, N per 1,000 followers"; before launch the mascot empty state "Members are
   counted from launch day. The first reading lands the next morning."
   Members-only below it: joined and left per month, Fan Club / Sub Club (once billing exists),
   and sign-up method (Google, email, Twitch, and Unknown for members who signed up before it was
   recorded); any group under 5 shows "under 5".
2. **Milestones:** `.bt-path` with the newest 6 (the newest pops), "N milestones since June 2025",
   "Show all milestones" list.
3. **Platforms:** three stage cards (icon, total, "followers since …"; the sparkline is faint and
   draws in bright on hover, focus or tap). Members: last month's gain and rate, best month.
4. **Crossover** (real numbers): "For every 100 new TikTok followers" flow (a TikTok 100 block with
   bands to Twitch, YouTube and Members; band width by ratio, capped; the members band is dashed
   with "counted from launch" until launch, then "members per 100 new followers"), the span line
   ("August 2025 to September 2026, 6,167 new TikTok followers"). **Streaming on schedule vs paused**:
   per era, Twitch and YouTube per 100 TikTok as bars, with the note that Twitch rewards a regular
   schedule. Members: **Each month** rows (month, new on TikTok, Twitch per 100, YouTube per 100;
   a "Small month" tag when TikTok gained under 200). Closing note "Moving together isn't proof":
   correlation only; Crowd crossover (§16) will show real movement for members. Phones: rows
   stack with the platform name beside each bar.
5. **Month by month** (members): month chips newest first, plus a disabled "May–Oct 2026: not
   tracked" chip (generated from the gap). Report card: month, era tag, "N more/fewer new followers
   than <previous month>", stat boxes (Streams, Hours live, New followers with growth %, Total at
   month end, New members from launch, Live likes or "not recorded"), three mini charts (stream-day points, own scale;
   "Not streaming here yet" or the month's note when there are none), Highlights (typed
   highlights + the month's milestones + records).
6. **Records and pace:** goal meters (public, one per goal set); members: `.bt-flip-grid` with
   Biggest month (gold), Best jump between consecutive readings (teal), Peak viewers (primary:
   the best Control Room stream as "N viewers, all platforms" with its date once one exists,
   otherwise the imported record; the back always keeps "Before the site: 577 on TikTok,
   September 2025"; the two are never compared), Most streams in a month (gold);
   and "At this pace" (§9) or its paused state with the mascot.
7. **How the numbers work:** four-step flow (The platforms → Every morning → The climb updates →
   You see it here) and notes: imported history, The build, YouTube rounding above 1,000, streams
   count the next morning (after-shows not counted), members are their own number (owner and test
   accounts left out).
8. **Ask BOOMBOT** (`.bt-chat`): Why is there a gap in 2026? / Are these numbers live? / What
   counts as a new follower? / Why does YouTube move in steps? Answers in
   `site/src/data/help/creator-climb.json`.
9. **Closing call to action** with the mascot: visitors "Climb with us" + Join free; members "Help
   with the next thousand" + See the schedule.

Deep links: `?month=YYYY-MM` (opens and scrolls to Month by month), `?platform=twitch|tiktok|youtube`
(only that line on), `?range=30d|90d|1y|all`. Visitors' locked ranges fall back to All.

## 7. /admin card (tool page polish)

Card "Creator Climb" on /admin (site admins; owner or A2+ where the kit's admin tiers apply):
small ridge scene and "Runs itself every morning. Everything here is optional, and every change is
logged."
- **Readings:** last reading per platform and for site members (time, Automatic / By hand as
  `.bt-tag`), last rebuild,
  **Rebuild now** (toast "Rebuilt: N months, N milestones").
- **Month notes:** month select, Live likes (optional), Highlights (one per line), Save notes.
- **Eras:** name, start, end ("Until launch" / "Now"), a remove button on each era, Add an era (8 at most), Save eras.
- **Goals:** YouTube subscribers, Twitch, TikTok, Combined, Members (empty = no goal), Save goals.
- **Left out of member counts:** the owner always; add or remove accounts by handle (the test
  member @gbo by default). Changes apply from the next reading.
- **Corrections:** empty state with the mascot; Add a correction (day, platform, correct number,
  reason required), list with who and when, Remove (never deletes the original reading).
Admin controls are green; nothing here is red.

## 8. Data model (all under `sites/boomertanger`, written only by Cloud Functions)

| Path | Holds | Read |
| --- | --- | --- |
| `growthDaily/{day}.site` | `{ members, joined, left, fanClub, subClub, byMethod { google, email, twitch, unknown } }` (added by the collector from launch; `null` before) | site admins |
| `public/climb` | `updatedAt`, `lastReading { day, at }`, `totals { all, twitch, tiktok, youtube }`, `members { total, perThousand, start, monthEnd[] { month, day, total }, milestones[] }`, `crossover { span, tiktok, twitch, youtube, members?, eras[] { era, twitch, youtube } }`, `monthEnd[] { month, day, all, twitch?, tiktok?, youtube? }` (from Jan 2025), `gaps[] { from, to }`, `eras[]`, `milestones[] { id, platform, value, day }`, `goals { twitch?, tiktok?, youtube?, all? }`, `counts { months, milestones }` | everyone (existing `public/*` rule) |
| `climb/main/months/{YYYY-MM}` | `points { twitch, tiktok, youtube: [{ d, v, s }] }` (day, value, source: `import` | `collector` | `manual` | `correction`; Firestore can't nest arrays), `monthEnd`, `startingBalance`, `gain`, `rate`, `streams`, `minutes`, `peak { value, day, streamId }` (the combined `stats.peak`, all platforms), `likes`, `highlights[]`, `records[]`, `notes { platform: text }`, `members { points [{ d, v }], start, end, joined, left, fanClub, subClub, byMethod }` (groups under 5 stored as `"<5"`), `crossover { tiktok, twitchPer100, youtubePer100, membersPer100?, small }`, `updatedAt` | signed in with a `members/{uid}` doc |
| `climb/main` | the settings, on the doc itself (a path can't end in a collection, so there is no `settings` doc): `eras[]`, `goals`, `likes { month: n }`, `highlights { month: [] }`, `excludeUids[]` and `excludeHandles[] { uid, handle }` (left out of member counts; the owner is always left out); `import { combinedOnly, records, eras }` (from the seed); `lastRebuild { at, months, milestones }`. The doc's own rule: read by site admins, no client writes | site admins |
| `climb/main/corrections/{id}` | `{ day, platform, value, before, reason, by, at, removedAt? }` | site admins |
| `climb/main/private/state` | `lastBuildHash`, `announced[]` milestone ids | nobody |

Months use the Los Angeles date (same as `growthDaily`). Points: `{ d, v, s }`, one per day per platform; source
order collector/manual > import for the same day; a correction replaces that day's value.

## 9. Calculations

- **Total** = sum of the platforms tracked that day (combined-only before June 2025).
- **New followers in a month** = Σ over platforms of (month end − previous month end); a platform's
  first month uses its starting balance (first reading). **Growth %** = new ÷ start total.
- **Milestones:** every 100 below 1,000, then every 1,000, per platform; combined every 1,000.
  A threshold at or below a platform's first reading is not a milestone. The date is the first
  reading at or above it. A milestone is created once (id `platform-value`) and never repeated if a
  count dips and comes back.
- **Feed:** each new milestone found in collector or manual data writes one `activityLog` entry
  `climb-milestone`; imported milestones never do (no flood at seed).
- **Crossover:** per month and per era, Twitch per 100 TikTok = Twitch new ÷ TikTok new × 100
  (same for YouTube), using month gains (§9 new followers); from August 2025 (the first month
  with all three). Headline = sums over the span. "Small month" when TikTok new < 200. Members
  per 100 new followers = new members ÷ all new followers × 100, from launch. Never shown as
  people moving between platforms.
- **Records:** biggest month (new followers), best jump (largest rise between consecutive
  readings of one platform, with both dates), peak viewers (the Control Room's combined
  `stats.peak`, all platforms; the imported TikTok-only 577 is kept as its own fact, never
  compared), most streams in a month.
- **At this pace** (members): per platform and combined, a least-squares line over the last 60
  days, shown only with at least 14 readings; with a goal: "At this pace, YouTube reaches 1,000
  around <Month YYYY>"; slope ≤ 0: "Holding steady"; otherwise paused with the reason.
- **Site members (§9b):** in the same morning run after launch, count queries (no full reads) on
  `members`: total, minus left-out accounts that still exist; joined = members created that LA
  day (`members/{uid}.joinedAt`); left = yesterday's total + joined − today's total (never
  negative; deleted accounts drop out of the total by themselves); Fan Club / Sub Club from plans
  once billing exists (all Fan Club until then); byMethod by count queries on
  `members/{uid}.signInMethod` (google, email, twitch; missing = unknown), which `completeSignup`
  sets on the server from the ID token's `firebase.sign_in_provider` (google.com → google;
  password or emailLink → email; custom → twitch, only minted by twitchAuth; else unknown). Members milestones: every 10 up to
  100, every 100 up to 1,000, then every 1,000; announced to the feed like the others.
  Members per 1,000 followers = members ÷ follower total × 1,000.
- **Streams in a month:** streams whose end beat ended in the month (LA), not after-shows; hours =
  live time from the Start beat to the End beat; counted by the next rebuild.

## 10. Functions and scripts (`functions/lib/climb/`)

- `climbRebuild` (Firestore trigger on `growthDaily/{day}` writes): rebuilds that day's month,
  then `public/climb`; announces new milestones. Skips if the rebuilt content is unchanged.
- `climbAdmin` (callable; owner or site admin, checked on the server; rate-limited): actions
  `notes`, `eras`, `goals`, `exclude`, `correctionAdd`, `correctionRemove`, `rebuildAll`. Every change writes
  `adminLog` (feature `creatorClimb`, `changes { before, after }`).
- Core in `lib/climb/build.js` (pure functions, unit-tested by `scripts/check-climb.js` against
  the confirmed numbers: Nov 2025 = 6,615, Aug 2025 new = 645, 2026 Apr total = 9,234, 31
  milestones from the JSON alone, newest 9,000 combined on Apr 20, 2026. With the sheet: Sep 2026
  month end 10,924 (Twitch 653, TikTok 9,450, YouTube 821); 10,000 combined on Jul 19, 2026;
  35 imported milestones; Jul 2026: 11 streams, 38.5 hours, 1,478,000 likes; crossover Aug 2025 –
  Sep 2026: Twitch 3.9 and YouTube 6.1 per 100 TikTok (6,167 TikTok); The grind 5.3 / 6.9; The
  build (Feb – Sep 2026) 2.4 / 5.4; Nov 2025 is a small month).
- `completeSignup` (accounts) writes `signInMethod` as above; deployed on its own, after the climb
  functions. No backfill (production has no members until launch).
- Collector (`lib/growth/collect.js`): adds the `site` block (§9b) once the Back on air start
  date is set (before that: `null`, no queries). Staging counts its test accounts and the page
  marks the members line "Staging".
- `seed-climb-history.js` (§3).
- Goals: YouTube's goal is shared with the footer. If the collector writes `youtubeGoal` as a
  constant, it reads `climb/main.goals.youtube` instead (fallback 1000).

## 11. Rules

Inside `match /sites/{siteId}`: `climb/main/months/{m}` read if signed in and a
`members/{request.auth.uid}` doc exists (same condition as `memberContent`); `climb/main` (the doc itself)
and `climb/main/corrections/{id}` read if `hasSiteRole(siteId, 'admin')`; `climb/main/private/{d}`
no access; no client writes anywhere under `climb`.

## 12. Kit: `.bt-chart` (new, `shared/ui/chart.js` + `shared/bt-ui.css`, on the UI kit page)

`chart(el, { series: [{ key, label, points: [{ t, v, src }] }], t0, t1, eras?, gaps?, zero?,
mini?, monthly?, empty? })`. SVG line chart: grid and nice ticks, era bands with labels, hatched
gaps, lines by `data-k` (colors from the feature's tokens), line-end icon slot, crosshair with
tooltip (date, each value, change since the previous reading, "From the old growth pages" for
imports, "Sample" for sample data), lines break across a gap longer than 20 days, pointer and
keyboard (arrows, Home, End, Esc), `has-focus` to highlight one series, an
empty state with the mascot, `--mini` small multiples, and `chartTable()` for "Show as table".
Redraws on resize (ResizeObserver). `aspect-ratio` 16 / 7 (4 / 3.4 at ≤ 640px), mini 4 / 3.
Container queries only; reduced motion: no transitions. UI kit page shows: full, mini, empty,
with eras and a gap, focused series, and the table.

## 13. Colors (P1 Night lamps, `site/src/styles/creator-climb.css`, `cc-` prefix)

`--cc-all: var(--bt-title)`, `--cc-twitch: var(--bt-ice)`, `--cc-tiktok: var(--bt-pink)`,
`--cc-youtube: var(--bt-fuse)`, `--cc-members: var(--bt-teal)`. No purple (clickable) or red (danger) lines; the platform icon at a
line's end carries the meaning. Scene pieces use existing tokens (`--bt-lamp`, `--bt-wire`,
`--bt-bulb`, `--bt-fuse`, `--bt-wax`, `--bt-surface*`). Platform icons: official icons from
`site/src/data/footer-icons.js`.

## 14. Edge cases

- A platform with no reading for over 7 days: its value shows with "last reading N days ago".
- YouTube hidden count (`null`): the day is skipped, never drawn as zero.
- A drop shows as a drop.
- Two readings on the same day: the later one wins (the collector replaces the day).
- A correction to a past day rebuilds that month and recalculates milestones (an already
  announced milestone is never removed from the feed).
- No members doc: months reads fail quietly and the lock cards show.
- Empty ranges: the mascot empty state.

## 15. Launch checklist

1. Deploy the `climb` rules and `climbRebuild`, `climbAdmin` to production.
2. Export the stream sheet to `functions/scripts/data/climb-sheet.csv` (fresh, up to the last
   stream before launch); `climb-history.json` stays as is. Run `seed-climb-history.js --project
   prod` dry run, then `--apply`.
3. On /admin set the **Back on air** start date (the cabin is drawn finished from then, and
   member counting starts). Check "Left out of member counts" (owner always; remove @gbo only if
   it's a real member on production). Production members start at 0.
4. Redirects `/growth-2025` and `/growth-2026` → `/climb` (301) go live with the domain switch.
5. After the first production collector run, confirm `public/climb.lastReading` and the gap.

## 16. Later: Crowd crossover

Admin-only counts of members who linked one, two or three platforms (never individuals; groups
under 5 hidden). Needs YouTube and TikTok account linking (only Twitch linking exists). Not built
now.

## 17. Testing on staging

- Seed (dry run, then apply), then Rebuild now: 16 imported months (11 from the JSON, 5 from the
  sheet), 35 milestones, total 10,924 at Sep 7, 2026; the gap ends at the first staging
  collector reading.
- Visitor, `?as=member` and admin views; scrub with mouse, touch and keys; Show as table; deep
  links; phone width; reduced motion.
- Manual TikTok save → a rebuild within a minute; a correction → the month and the chart change.
- Crossover numbers match §10; set a staging Back on air date, run the collector now, and check
  the members total (test accounts, marked Staging), the cabin, the members hill and the Members
  chart; remove the staging date afterwards if you want the pre-launch look back.
