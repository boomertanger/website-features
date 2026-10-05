# Goal Tracker

Confirmed Oct 4, 2026. Mockup: `docs/design/mockups/goal-tracker.html` (road option 1, Level select).
Starting plan: `docs/specs/goal-tracker-seed.json`.

## 1. Purpose

Goal Tracker lays out the plan to become Content Creator of the Year: the big goal, the ladder of
2027 goals under it, and the milestones and tasks for each, with live progress. Members see the
plan and how they can help; the owner updates it from an admin page and the members page reflects
the changes when he presses Publish.

**North Star:** The Game Awards 2027, Content Creator of the Year. A stretch goal: every rung
below it is worth reaching on its own.

**Award facts still to verify on thegameawards.com** (from memory, not their site): creators can't
submit or apply, nominees are picked by The Game Awards; the eligibility window runs about
mid-November 2026 to mid-November 2027; nominees are announced in November and the show is in
December; fan voting plays some part in the winner. The FAQ copy "creators can't sign themselves
up" depends on the first one.

## 2. Shape of the plan

North Star → Tracks → Goals → Milestones → Tasks, plus Metrics.

- **Tracks:** Identity, Signature content, Platforms, Community, Collabs, Recognition, Money (private).
- **Goals:** the 2027 rungs under a track. Optional metric + target.
- **Milestones:** dated steps toward a goal; each belongs to a **level** on the road.
- **Tasks:** the owner's checklist under a milestone.
- **Levels (the road):** 0 Rebuild (now until relaunch), 1 Relaunch (when it's ready),
  2 Grow (Spring 2027), 3 Break out (Summer 2027), 4 Halloween (October 2027), and the final boss,
  The Game Awards (nominees Nov, show Dec). Levels are editable (name, timing text, icon, status).
- **Metrics:** automatic (Twitch followers, YouTube subscribers, TikTok from the manual card,
  Fan Club members) or typed in (average viewers, income, anything else).

Visibility per item: public, members or private. An item is never shown more widely than its
parent (applied when the snapshot is built). Income items are private by default and need a
confirmation to be made visible.

**Relaunch readiness:** any item can be flagged "Needed for relaunch" with an effort estimate in
weeks and a side (website or stream prep). There is no relaunch date until the owner sets one.

## 3. Who sees what

| | Visitors | Members (Fan Club and up) | Admins |
|---|---|---|---|
| /goals gate: North Star, readiness meter or countdown, Join free | ✓ | | |
| /goals full page (public and members items) | | ✓ | ✓ |
| Private items | | | ✓ (admin page only) |
| /admin/goals | | | ✓ |

## 4. Data model (all under `sites/boomertanger/`)

| Path | Holds | Read | Write |
|---|---|---|---|
| `goalTracker/config` | North Star title and story, levels, key dates (relaunch date + time America/Chicago, nominees announced, show), result line, `pendingChanges` count, `lastPublishedAt` | Admins | Functions |
| `goalItems/{itemId}` | type (track, goal, milestone, task), parentId, level (milestones), title (≤ 120), description (≤ 600), help (≤ 200), status, startDate, dueDate, visibility, order, relaunch { needed, weeks, side }, metricId, target, changedSincePublish, updatedAt | Admins | Functions |
| `goalMetrics/{metricId}` | label, unit, source (auto key or manual), value, updatedAt, visibility; `history/{YYYY-MM-DD}` | Admins | Functions |
| `public/goalTracker` | Published snapshot: config (no private data), levels, every public/members item, metric values, readiness counts | Signed-up members | Functions |
| `public/goalTrackerTeaser` | North Star title, readiness done/total, relaunch date if set, next key date | Anyone | Functions |

Statuses (site-wide badge system): Planned gold, In progress green, Done lime, Dropped gray.
Overdue (past due, not done) shows on the admin page only.

**Draft and publish.** Every admin edit writes the draft (`goalItems`, `goalMetrics`, `config`),
marks the item `changedSincePublish` and bumps `config.pendingChanges`. Members see nothing until
Publish rebuilds `public/goalTracker` and `public/goalTrackerTeaser` from the draft and clears
the flags. Automatic counts refresh in the snapshot daily without a publish. If a publish fails,
the draft is untouched and members keep the last snapshot.

**Functions (functions/lib/goalTracker/*.js):**
- `goalTrackerEdit` callable, admins only: create, update, delete (with its children), reorder,
  setStatus, updateConfig, seed (loads the starting plan only when there are no items). Reuse
  `adminEditItem` if its shape fits cleanly; otherwise this separate callable with the same shape.
- `goalTrackerSetMetric` callable, admins only: sets a manual value and today's history entry.
- `goalTrackerPublish` callable, admins only: builds and writes both public docs in one batch.
- `goalTrackerDaily` scheduled 05:30 America/Los_Angeles: copies automatic counts from
  `public/socials` and a count() of Fan Club members into the snapshot, teaser and history.
- adminLog feature key `goalTracker` (create, update, delete, reorder, status, metric, config,
  seed, publish). activityLog `goal-milestone-done` on publish for each public/members milestone
  that became Done since the last publish.

Rules: no client writes anywhere; `goalTracker/**`, `goalItems/**`, `goalMetrics/**` admin read
only; `public/goalTracker` readable by signed-up members; `public/goalTrackerTeaser` public read.

## 5. Members page (/goals)

How it works layout (side menu, ghost chapter numbers). Feature top bar: trophy + GOAL TRACKER
wordmark; green Edit plan link for admins only.

1. **Hero:** kicker, North Star as `.bt-title--hero`, the story, Join/help buttons, and a card:
   relaunch readiness (percent, gold meter, one mini bar per group) until a relaunch date is set;
   then a countdown to the next key date; after the show, the result line.
2. **01 The road:** `.bt-road` level select (option 1). Current level glows and the mascot stands
   on it; done levels gold; later levels dashed; the boss node gold. Clicking a level shows its
   panel (status, blurb, milestones with status dots). Phones: vertical path, panel opens under
   the level tapped. The fill grows once on load (none with reduced motion).
3. **02 Relaunch readiness:** one card per group with a gold meter and its items.
4. **03 2027 goals:** track chips with done counts; goal rows with status badge, description,
   blue meter when tied to a metric, and "You can help" text.
5. **04 The numbers:** Twitch, YouTube, TikTok, Fan Club, each with the next milestone bar.
   Stale (> 7 days) shows "Last counted DATE. Updating."
6. **05 How you can help:** come live (schedule), follow everywhere, share a clip, bring a friend
   (copy the site link).
7. **06 Questions:** Ask BOOMBOT.
8. Footer lines: Last updated DATE; "Boomertanger isn't affiliated with The Game Awards."

States: auth loading skeleton (never a flash of the gate); visitors and mid-signup get the gate
(Arcade membersOnly pattern) with the teaser card; no snapshot yet → "The plan is being written".

## 6. Admin page (/admin/goals)

Sticky publish bar (admin green panel): "N unpublished changes" / "Everything is published" /
"Couldn't publish. Members still see the last version." + Preview (opens /goals) + Publish.
Tabs (`.bt-page-tabs`): **Plan** (`.bt-tree`: collapse, status badge click cycles, move up/down,
Edit dialog, Add; filters All, In progress, Planned, Overdue, Needed for relaunch; Unpublished,
Relaunch and Overdue labels; empty state offers "Load the starting plan"), **Relaunch** (done of
total, weeks left, earliest realistic date, side-by-side switch, per-item week estimates, relaunch
date + time with Save), **Metrics** (table; manual values with Save), **Settings** (North Star,
story, levels, key dates, result line). Edit dialog: openModal edit mode (banner first), fields
as in the mockup; Delete via confirmAction stating how many children go with it.

## 7. bt-ui

Used: .bt-title(--hero), .bt-chapter--ghost, .bt-toc + TocLayout, .bt-page-tabs, .bt-badge,
.bt-meter (gold and blue only on /goals), .bt-chip, .bt-btn (admin green for admin actions),
.bt-switch, .bt-table, .bt-empty, .bt-skeleton, the Arcade gate, openModal, confirmAction,
modalHeader, BOOMBOT FAQ (.ai-chat).

New kit pieces (bt-ui.css + UI kit page + design-system.md): **.bt-road** (level select) and
**.bt-tree** (admin rows).

## 8. Edge cases

Visibility inheritance at publish time; metric deleted → no meter; two admin tabs → last write
wins and the dialog reloads the item; publish failure keeps the last snapshot; key date passed →
countdown moves to the next date; The Game Awards named factually only, no logo.

## 9. Out of scope for v1 / later

Out: member comments or votes on goals, "I'll help" sign-ups, alerts, rewards for helping,
automatic average-viewer and income tracking, a visitor version of the full page.
Later: metric history chart, weekly check-in reminder on /admin, "Milestone reached" on stream,
milestones linked to roadmap workstreams.
