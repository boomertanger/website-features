# Spec: Bug Zapper (port) — CONFIRMED (2026-10-08)

ROADMAP workstream 10 (Porting existing features), Bug Zapper only. Builds on `feature-lab.md` (reuses its patterns:
build it after Feature Lab), `accounts.md`, `admin-editing.md`, `rewards.md` (Trophy Room), `fun-factory.md` (Night
Shift), `mod-machina.md` (Gears, grades), `boom-alerts.md` (`notifyOutbox`), `game-vault.md` (signed Cloudinary
uploads) and `header-nav.md`. Approved mockup: `docs/design/mockups/bug-zapper-mockups.html` (Board B, Hero H1 Porch
light, Icon I1 Porch zapper; every state). Published copy: https://claude.ai/artifact/Nm6hK6fXACbU2unzozqjpN

## 1. Summary

A bug board for the site and the stream at `/bug-zapper` (tool page), plus `/bug-zapper/how-it-works` (story page).
Members report bugs, add a "bit me too", and talk privately with the team in a thread on their own report; admins
triage; a confirmed report earns its reporter Bug Finder. Every write goes through Cloud Functions. The legacy
Squarespace Bug Zapper (`bugReports`, its rules, `recordBugScreenshot`, `deleteBugReport`, the `bugZapper` kind of
`adminEditItem`) stays untouched until launch; all changes are additive.

## 2. Decisions (Oct 8, 2026, all as recommended)

1. **Who sees and does what.** Everyone, visitors included, reads public reports that aren't hidden. Reporting and
   "bit me too" need a signed-up member with a verified email (or staff). A **"This is a security or privacy problem"**
   checkbox makes a report **private**: only the reporter and staff see it; no "bit me too", no feed event. The
   **thread** ("Talk with the team") is private to the reporter and staff (mods and admins); others never see it
   exists. **Screenshots and device details** are visible only to the reporter and staff. Visitors pressing Report or
   the bug counter get the Join dialog titled "Join to report bugs".
2. **Legacy data.** Prod Bug Zapper data is test data only: nothing is imported.
3. **Screenshots.** The Vault's signed upload into a **private (authenticated)** Cloudinary folder, public id
   `bug-zapper/<reportId>/shot`. The server checks the file with the Admin API (JPG, PNG or WebP; ≤ 10 MB; the browser
   scales anything over 3840 px down first). One per report. Viewing: signed links that expire after 10 minutes.
   Recorded with `recordAssetCreated` (`deliveryType: "authenticated"`). A failed upload never loses the report; the
   reporter can add it later. Uploads never attached are cleared by a daily sweep. A `cleanupRules` doc purges
   screenshots 60 days after a report closes (`closed == true`, age on `closedAt`). That rule is Cloud Stash's allowlisted
   Bug Zapper screenshots target, set up by `functions/scripts/seed-cloud-stash.js` (the only script that does it); it is created
   switched off and the owner switches it on in Cloud Stash after a dry run.
4. **Confirmed.** New status **Confirmed** (gold). A report counts as confirmed the first time it reaches Confirmed,
   In progress or Fixed: that grants Bug Finder and Night Shift `confirmed`. Duplicates never count (the original
   does); Won't fix and Can't reproduce don't.
5. **Triage.** Admins only (A1 Steward and up, and the owner): status, priority (Low, Normal, High, Urgent),
   duplicate-of (picked from a searchable list). Marking Duplicate adds its reporter as a "bit me too" on the original.
   Severity is the reporter's; admins correct it with `adminEditItem`. **+3 Gears** (`bugTriage`) to the admin who
   first moves a report out of Open, whatever the outcome. Mods hide, and reply in threads with a Mod tag.
6. **Alerts** (all through `notifyOutbox`; Boom Alerts delivers when it ships). New admin topic **`bug-new`** (inbox;
   Critical also push and email). The reporter gets **`report-update`** on every status change and every staff reply.
   Everyone who added a "bit me too" gets `report-update` when it's **Fixed**.
7. **Abuse protection.** 5 reports a day for members and mods; the owner and admins are exempt (backstop 200 a day) (Central day). Per member: 20 thread replies an hour, 60 "bit me too" changes
   an hour; length limits in §3. Mods and admins hide or unhide a report or a reply (reason 1–200, logged). Delete:
   the owner, A2 Overseer or A3 Right Hand; an A1 Steward gets Hide and the note "Deleting needs the owner or a Right
   Hand. Hide it instead." No member Report button.
8. **Night Shift and badges.** Type `bugs` switched on (actions `report`, `confirmed`); the "Bug hunter" idea gets
   `params: { action: "report" }`, "Exterminator" `params: { action: "confirmed" }`. Bug Finder (`bug-finder`) on the
   first confirmed status. ROADMAP "Night Shift hooks" box ticked.
9. **Where it lives.** `/bug-zapper` and `/bug-zapper/how-it-works`; the Community nav entry already in
   `site/src/lib/nav.js` ("Report something broken."), switched on by adding `bugzapper` to `site.json` modules. A Bug
   Zapper card on /admin. The 404 page gets a "Report this broken link" button (`/bug-zapper?new=1&page=<path>`).
10. **Page types.** Board = tool page; How it works = story page (full frame).
11. **Delete order** (keeps the repo's retry-safe order, as Feature Lab does): Cloudinary (through
    `performAssetDeletion`) → asset records → activityLog events → the report with its subcollections → `myMeToos`
    cleanup → adminLog entry.
12. **Shared helpers.** Bug Zapper's build moves Feature Lab's generic server pieces into `functions/lib/boards/`
    (caller checks, rate limit, submit token, hide/unhide, thread or comment write with staff tag, author snapshot,
    delete tree) and the generic client pieces into `site/src/scripts/boards/` (author chip with the live profile
    cache, thread/comments with Hide, visitor / verify / rate-limit boxes, hide dialog, "seen once" memory). The Vault's
    Cloudinary helpers get a `folder` parameter in `functions/lib/cloudinary.js` (the Vault keeps working through a
    re-export). Feature Lab's behaviour must not change.
13. **Mockup picks.** Board **B** (List by default, Board one tap away through `.bt-view-switch`, kept in
    `localStorage` `bt.bugs.view`, try/catch). Hero **H1 Porch light**. Wordmark icon **I1 Porch zapper** (Appendix A).

## 3. Data model (`sites/boomertanger/bugs/main/…`; every client write `false`)

| Path | Fields | Read |
|---|---|---|
| `reports/{id}` | `title` 3–200, `page` 1–300, `whatHappened` 10–2000, `expected` 0–2000, `steps` 0–2000, `severity` `cosmetic·minor·major·critical`, `status` `open·confirmed·in_progress·fixed·wont_fix·cant_reproduce·duplicate`, `priority` `low·normal·high·urgent·null`, `duplicateOf`?, `private` (bool), `hidden` (bool), `hiddenBy {uid,handle}`?, `hiddenReason`?, `closed` (bool), `closedAt`?, `by {uid,handle,name}`, `meTooCount`, `threadCount`, `shotRef`? (the screenshot's public id; a screenshot exists when set), `statusHistory[]` (`{status, changedBy, changedAt, note?}` or `{kind:"note", note, changedBy, changedAt}`), `statusChangedAt`, `firstTriagedAt`?, `confirmedAt`?, `fixedAt`?, `editedAt`?, `editCount`?, `createdAt`, `updatedAt` | anyone if `!private && !hidden`; the reporter if `!hidden`; staff always |
| `reports/{id}/staff/info` | `device {browser, os, viewport}`? (shown in the form; the reporter can leave it off), `shot {publicId, format, bytes, width, height}`? | the reporter and staff |
| `reports/{id}/thread/{cid}` | `text` 1–1000, `by`, `staffTag` `admin·mod·null` (server-set), `hidden`, `hiddenBy`?, `hiddenReason`?, `createdAt` | the reporter and staff; non-staff only `hidden == false` |
| `reports/{id}/meToo/{uid}` | `createdAt` | server only |
| `myMeToos/{uid}` | `ids[]` | that member |
| `submitTokens/{token}` | `uid`, `reportId`, `expireAt` (1 day TTL) | server only |

`closed` is true for `fixed`, `wont_fix`, `cant_reproduce`, `duplicate`. Rate-limit counters in the existing
`sites/boomertanger/rateLimits`, keys `bugs_<kind>_<hash(uid|period)>`. Rules read a report's `by.uid` with `get()`
for the subcollections, and staff from the role claims (`hasSiteRole`), as Feature Lab does.

Indexes: `reports` where `private == false`, `hidden == false`, order `createdAt desc`; `reports` where `by.uid ==`,
order `createdAt desc` (My reports); `thread` where `hidden == false` order `createdAt asc`; `reports` `closed` +
`closedAt` (the cleanup rule). TTL on `submitTokens.expireAt` (a `fieldOverrides` entry, like `notifyOutbox`).

## 4. Functions (`functions/lib/bugs/*.js`, wired in `functions/index.js` like `lib/vault` and `lib/lab`)

| Callable | Who | Does |
|---|---|---|
| `bugSubmit { title, whatHappened, expected, steps, page, severity, private, device?, wantsShot, token }` | verified members, staff | Validates, rate limit (5/day), token. Creates the report (`status: open`, first history entry), the info doc. Night Shift `recordFactoryEvent(uid, "bugs", { action: "report" }, "report-<id>", { keep: true })`. `notifyOutbox` `bug-new` (audience admins; priority high when critical). Returns `{ id, upload? }` (signed params when `wantsShot`). |
| `bugShotParams { id }` | the reporter (report not closed, no shot yet), staff | Fresh signed upload params for `bug-zapper/<id>/shot` (authenticated). |
| `bugAttachShot { id, publicId }` | the reporter, staff | Reads the file with the Admin API (format, bytes); refuses anything else (and deletes it). `recordAssetCreated` (`feature: "bugZapper"`, `linkedCollection: sites/boomertanger/bugs/main/reports`, `linkedField: "shotRef"`, see the note below), info `shot`, `shotRef`. |
| `bugShotUrl { id }` | the reporter, staff | A 10-minute signed link (the Vault's `previewUrl`). |
| `bugMeToo { id, on }` | verified members | Refused on private, hidden, own, `fixed`, `wont_fix`, `duplicate`. Rate limit 60/h. Transaction: meToo doc, `meTooCount`, `myMeToos`. No Night Shift event. |
| `bugReply { id, text }` | the reporter, staff | Refused on hidden reports; rate limit 20/h; transaction: thread doc + `threadCount`; `staffTag` from roles. A staff reply sends `report-update` to the reporter. |
| `bugTriage { id, status?, priority?, duplicateOf?, note?, before }` | admins | Feature Lab's history rules and conflict check. Sets `statusChangedAt`, `closed`/`closedAt`. adminLog `triage`. On a status change: `report-update` to the reporter. First move out of Open: `firstTriagedAt`, +3 Gears `bugTriage` (ref report id) to the admin. First confirmed status: `confirmedAt`, `grantBadge(reporterUid, "bug-finder", { feature: "bugs", ref: id })`, Night Shift `{ action: "confirmed" }` ref `confirmed-<id>` for the reporter. First Fixed: `fixedAt`, activityLog `fixed` (not for private or hidden), `report-update` to every meToo uid. Duplicate: `duplicateOf` required (an existing, not-hidden report ≠ itself); its reporter is added to the original's meToo (counts and `myMeToos`, no events). |
| `bugHide { id, replyId?, hidden, reason }` | mods, admins | Report or reply; reason 1–200 to hide; adminLog `hide`/`unhide`. |
| `bugDelete { id }` | owner, A2, A3 | The order in decision 11; adminLog `delete` with a text snapshot. |
| `adminEditItem` kind `bugReport` (`lib/bugs/edit.js`) | admins | title, whatHappened, expected, steps, page, severity; remove the screenshot (through `performAssetDeletion`); conflict check; `editedAt`, `editCount`; adminLog `edit`. |
| `bugTidy` (scheduled, daily 04:30 America/Los_Angeles) | — | Lists `bug-zapper/` authenticated uploads older than 24 h with no `externalAssets` record and deletes them (the Vault's pending sweep, reused). |

Note on `linkedField`: the safe-delete path clears the linked field on purge. Use a field that holds the asset
reference on the report (`shotRef`, the public id) so a purge leaves the
report consistent; the info doc's `shot` is cleared by `bugTidy`'s next run or on read when `shotRef` is gone.

Logging: adminLog feature key `bugZapper`, `itemPath: sites/boomertanger/bugs/main/reports/<id>`. activityLog:
`feature: "bug-zapper"`, type `fixed`, `reportId`, `link: "/bug-zapper?report=<id>"`. Add the path to
`ACTIVITY_LINKS` (and `functions/scripts/find-orphans.js`). Gears: source `bugTriage` in `lib/crew/gears.js`
`SOURCES`, hook `noteBugTriage(uid, reportId)` in `lib/crew/hooks.js` (lazy, never throws).

Night Shift data (`functions/data/fun-factory-ideas.json`): type `bugs` → `enabled: true`, `needs: null`,
`source: "Bug Zapper"`, `description: "Help fix the site: report a bug, get a report confirmed."`,
`actions: ["report", "confirmed"]`, `params: ["action"]`; ideas as in decision 8. Re-seed with
`seed-factory-types.js --project staging`.

## 5. Rules (additive)

New matches under `match /sites/{siteId}` for `bugs/main/reports` (+ `staff`, `thread`, `meToo`),
`bugs/main/myMeToos`, `bugs/main/submitTokens`, as in §3; every write `false`. The `adminLog` read already allows
`hasSiteRole(... 'admin')` after Feature Lab. Nothing in the legacy rules changes.

## 6. Kit

Nothing new. Reused: `.bt-topbar`, `.bt-wordmark--power`, chips, `.bt-sortbar`, `.bt-row` + `initRowSpotlight`,
`.bt-tally` (+ the locked state and `.bt-comment--hidden` from Feature Lab), badges with `levelBars`,
`.bt-view-switch`, `openModal` / `modalHeader` / `confirmAction`, composer, comments, history, admin panel,
`.bt-pick-list`, `.bt-search`, `.bt-dropzone`, `thumbHtml` + lightbox, `.bt-check`, `.bt-notice`, `.bt-tag`,
`.bt-stamp`, `burst`, `.bt-mascot`, `.bt-medal`, `.bt-empty`, skeleton rows, `toast`, TocLayout,
`.bt-chapter--ghost`, `.ai-stage`, `.ai-jr--4`, `.ai-flow`, `.bt-flip`, `.bt-placard`, `.bt-chat`, `.ai-cta`,
`.bt-meter`. Feature CSS only (`site/src/styles/bug-zapper.css`, prefix `bz-`): the wordmark icon, the porch-light
scene and its counters, the board columns, the bite box, the severity picker, the device line, the success art and
the How it works scenes and Try it. Tokens only (`--bt-ice`, `--bt-lamp`, `--bt-wire`, `--bt-wax`, `--bt-snow`).
Badge table (design-system §5): Bug status becomes Open blue · **Confirmed gold** · In progress green · Fixed lime ·
Won't fix / Can't reproduce / Duplicate gray; stored keys are lowercase on the new site.

## 7. /bug-zapper (tool page) — mockup screens 1–4, 6

- **Top bar:** BUG ZAPPER power wordmark with the Porch zapper icon, a ghost How it works link, a primary "Report a
  bug" (visitors: Join dialog; unverified: the verify dialog). Phones: icons only.
- **Hero:** `.bt-title` "Bug reports", the subtitle, Report a bug and How it works buttons (hidden on phones), and the
  **Porch light** scene: the hanging lamp, moths, the real mascot, "N zapped so far" (all-time Fixed count), and four
  counter buttons (Open, Confirmed, In progress, Fixed) that filter the board (labels hidden on phones, kept in
  `aria-label`); pressing one makes the lamp zap once.
- **Strips:** visitor (Join free), not verified (Resend the link).
- **Controls:** status chips with counts (All, Open, Confirmed, In progress, Fixed, Closed) + "My reports" for members;
  How bad (Any + four); Sort (Newest, Most bit, Recently updated); the List / Board switch.
- **List:** `.bt-row` with the "bit me" `.bt-tally` (locked when private, own, fixed, won't fix, duplicate), title,
  first line of what happened, avatar and `@handle`, the Bug Finder mini medal on confirmed reports, the page,
  severity and status badges, Private / Hidden tags, the lock thread count (reporter and staff only), date. Closed
  and hidden rows dimmed.
- **Board:** a "N new reports waiting for a look" strip, columns Open, Confirmed, In progress, Fixed (Fixed: last 30
  days); closed behind "Show closed (N)". Phones: side-scrolling columns.
- **Report dialog** (`openModal`, wide; deep link `?report=<id>`): title; "Reported by @handle on DATE · page";
  badges (severity, status, priority, Private, Hidden); staff hidden bar with Unhide; private note; the bite box
  (states as in the mockup); duplicate link; What happened / What should have happened / Steps; Screenshot and device
  (reporter and staff; others see the lock line; the reporter can add a screenshot until it closes); the thread with
  the composer (reporter and staff); history. Mods: Hide report, Hide on replies. Admins: Edit, the green panel
  (status, priority, the duplicate picker when Duplicate is chosen, note, Save; hint "Confirming gives the reporter
  Bug Finder."), Admin activity, Hide, Delete (`confirmAction`; Stewards see the note instead).
- **Report a bug dialog:** Give it a short name / What happened? / What did you expect instead? / Which page or
  feature? (placeholder; prefilled only from `?page=`) / Steps (optional) / How bad is it? (four cards) / Screenshot
  (`.bt-dropzone`) / "We'll attach: BROWSER on OS, W × H" with Don't attach / the security checkbox. Sending: spinner.
  Sent: the ZAPPED IN stamp with an ice-and-lamp burst, "It's on the board", the Night Shift line when a live mission
  counted it, See your report / Report another. Screenshot failed: the saved-anyway notice and Add the screenshot.
  Rate limit, not verified, visitor: as in the mockup.
- **Moments** (once per report, on the reporter's next visit, `localStorage` `bt.bugs.seen`, try/catch): "Your bug was
  confirmed" (Bug Finder medal), "Your bug got zapped" (lime FIXED stamp).
- **States:** loading (3 skeleton rows), empty board (mascot + dead bug), empty filter, load error, report gone while
  open.
- **/admin card:** "N new reports waiting for a look", a red "N critical" badge, the oldest one, Open the board
  (admin green); "No reports waiting" when clear.
- Preview data for `?as=` (`site/src/data/preview-bugs.json`).

## 8. /bug-zapper/how-it-works (story page) — mockup screen 5

TocLayout; hero "Spot it. Report it. We zap it." with the large Porch light scene; 01 What it's for (stage cards
Spot it, Report it, Bit me too, Zapped, each with its hover scene); 02 A report's journey (`.ai-jr--4`: Open,
Confirmed, In progress, Fixed + the closed-status note); 03 Try it: fix a vague report (six fixes, a meter, a lime
"Ready to zap" stamp; nothing saved); 04 Who does what (`.ai-flow`: You, Admins, Boomertanger, Everyone it bites,
Mods); 05 Rewards (flip cards Bug Finder, Bug hunter, Exterminator); 06 House rules (placard, seven rules); 07 Ask
BOOMBOT (five questions); closing CTA. Copy as in the mockup. Only read: the all-time zapped count (one capped query or
a public counter; fall back to hiding the number).

## 9. Edge cases

Report deleted or hidden while open (the dialog says so). Double-click on Send (one report, by token). Upload
succeeds but attach fails (the sweep clears it; the report says "Add the screenshot"). Fixed, reopened, fixed again
(badge, Gears and events once, by ledger keys). Private report as a duplicate's original (the duplicate's reporter
sees "linked to a report the team is already on"). Handle changed or account deleted (live profile, "Former
member"). Twitch accounts without email ("Add an email in Account, then verify it."). Still happening after Fixed:
"Report it again and mention this one." A reporter can't "bit me too" their own report.

## 10. Build order

0. Feature Lab is on `dev` and deployed to staging. 1. Spec and mockup saved. 2. Shared `lib/boards`,
`lib/cloudinary.js` and client `scripts/boards` (Feature Lab unchanged). 3. `lib/bugs`, the edit kind, Gears,
Night Shift data, `ACTIVITY_LINKS`, `check-bugs`. 4. Rules, indexes, the cleanup rule (staging). 5. /bug-zapper.
6. How it works. 7. /admin card, 404 button, module on. 8. Docs. Deploy to staging: rules and indexes, then
functions, then `seed-factory-types.js`, then `seed-cloud-stash.js` (the cleanup rule).

## Appendix A: the wordmark icon (I1, Porch zapper)

`BZ_ICON` (and the hero's large lamp, `bzLamp()`) in `site/src/scripts/bugs/art.ts`; each copy needs unique gradient
ids. Source (JS, as in the mockup):

```js
const MOTH = `<path class="wing w1" d="M0 0C-2.8-2.6-4.6-.6-3.6 1.6C-2.4 2-1 1.2 0 0Z"/><path class="wing w2" d="M0 0C2.8-2.6 4.6-.6 3.6 1.6C2.4 2 1 1.2 0 0Z"/><ellipse class="body" cx="0" cy=".8" rx=".85" ry="2"/>`;
export function porchIcon({ big = false, cls = "" } = {}) {
  const u = uid("bzp");
  return `<svg class="bz-icon bz-icon--porch${big ? " bz-big bz-porch-svg" : ""}${cls ? " " + cls : ""}" viewBox="${big ? "9 -6 22 40" : "0 0 40 40"}" aria-hidden="true" focusable="false"><defs><linearGradient id="${u}t" x1="0" x2="1"><stop offset="0" class="t-lo"/><stop offset=".5" class="t-hi"/><stop offset="1" class="t-lo"/></linearGradient><radialGradient id="${u}h"><stop offset="0" class="h-in"/><stop offset="1" class="h-out"/></radialGradient></defs>
<circle class="halo" cx="20" cy="19.5" r="15" fill="url(#${u}h)"/>${big ? `<path class="hang" d="M20 -6V1.3"/>` : ""}
<path class="hang" d="M20 4.2V7.4"/><circle class="ring" cx="20" cy="2.8" r="1.5"/>
<path class="cap" d="M11.4 10.4C12.6 7.6 15.8 6.4 20 6.4S27.4 7.6 28.6 10.4Z"/>
<rect class="frame" x="12.6" y="10.4" width="14.8" height="17.6" rx="1.4"/>
<rect class="tube" x="17.5" y="12" width="5" height="14.4" rx="2.5" fill="url(#${u}t)"/>
<path class="wire" d="M14.7 10.4V28M16.1 10.4V28M23.9 10.4V28M25.3 10.4V28"/>
<path class="rung" d="M12.6 14.8H27.4M12.6 19.2H27.4M12.6 23.6H27.4"/>
<rect class="frame-line" x="12.6" y="10.4" width="14.8" height="17.6" rx="1.4"/>
<path class="base" d="M11.4 28H28.6C27.6 30.6 24.4 31.8 20 31.8S12.4 30.6 11.4 28Z"/>
${big ? "" : `<g transform="translate(33.4 12.6)"><g class="moth">${MOTH}</g></g>
<path class="zap" d="M28.2 14.6L30.6 16.4L28.9 17.6L31.4 19.6"/>
<g class="sparks"><circle cx="29.6" cy="15.6" r=".75"/><circle cx="30.8" cy="18.2" r=".6"/><circle cx="28.4" cy="19.4" r=".55"/><circle cx="31.4" cy="16.4" r=".5"/></g>
<circle class="ash" cx="28.9" cy="18.6" r=".75"/>`}</svg>`;
}
```

```css
.bt-root:not(#_) .bz-icon { width: 36px; height: 36px; overflow: visible; }
.bt-root:not(#_) .bz-wm .bt-wordmark-icon { padding-top: 2px; }
.bt-root:not(#_) .bz-icon :is(.frame, .cap, .base) { fill: var(--bt-surface-2); stroke: var(--bt-primary); stroke-width: 1.9; stroke-linejoin: round; }
.bt-root:not(#_) .bz-icon .frame { fill: color-mix(in srgb, var(--bt-ice) 7%, var(--bt-surface-2)); }
.bt-root:not(#_) .bz-icon .frame-line { fill: none; stroke: var(--bt-primary); stroke-width: 1.9; stroke-linejoin: round; }
.bt-root:not(#_) .bz-icon .hang { fill: none; stroke: var(--bt-text-faint); stroke-width: 1.3; stroke-linecap: round; }
.bt-root:not(#_) .bz-icon .ring { fill: none; stroke: var(--bt-primary); stroke-width: 1.4; }
.bt-root:not(#_) .bz-icon .wire { fill: none; stroke: var(--bt-wire); stroke-width: 0.9; opacity: 0.85; }
.bt-root:not(#_) .bz-icon .rung { fill: none; stroke: var(--bt-wire); stroke-width: 0.8; opacity: 0.55; }
.bt-root:not(#_) .bz-icon .t-lo { stop-color: var(--bt-ice); stop-opacity: 0.35; }
.bt-root:not(#_) .bz-icon .t-hi { stop-color: var(--bt-snow); stop-opacity: 0.9; }
.bt-root:not(#_) .bz-icon .tube { opacity: 0.5; transition: opacity 0.3s, filter 0.3s; }
.bt-root:not(#_) .bz-icon .h-in { stop-color: var(--bt-ice); stop-opacity: 0.5; }
.bt-root:not(#_) .bz-icon .h-out { stop-color: var(--bt-ice); stop-opacity: 0; }
.bt-root:not(#_) .bz-icon .halo { opacity: 0; transition: opacity 0.35s; }
.bt-root:not(#_) .bz-icon .moth .body { fill: var(--bt-wax); }
.bt-root:not(#_) .bz-icon .moth .wing { fill: var(--bt-text-muted); opacity: 0.9; transform-box: fill-box; }
.bt-root:not(#_) .bz-icon .moth .w1 { transform-origin: 100% 40%; }
.bt-root:not(#_) .bz-icon .moth .w2 { transform-origin: 0% 40%; }
.bt-root:not(#_) .bz-icon .moth { transform-box: fill-box; transform-origin: center; }
.bt-root:not(#_) .bz-icon .zap { fill: none; stroke: var(--bt-lamp); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; opacity: 0; filter: drop-shadow(0 0 2px rgba(var(--bt-lamp-rgb), 0.95)); }
.bt-root:not(#_) .bz-icon .sparks circle { fill: var(--bt-lamp); opacity: 0; transform-box: fill-box; transform-origin: center; }
.bt-root:not(#_) .bz-icon .sparks circle:nth-child(even) { fill: var(--bt-title); }
.bt-root:not(#_) .bz-icon .ash { fill: var(--bt-text-faint); opacity: 0; }
/* Power on: hover, focus, or .is-lit (initPowerWordmarks on touch screens) */
.bt-root:not(#_) .bt-wordmark--power:is(:hover, :focus-visible, .is-lit) .bz-icon .tube { opacity: 1; filter: drop-shadow(0 0 3px var(--bz-ice-glow)) drop-shadow(0 0 7px var(--bz-ice-glow)); }
.bt-root:not(#_) .bt-wordmark--power:is(:hover, :focus-visible, .is-lit) .bz-icon .halo { opacity: 1; }
.bt-root:not(#_) .bt-wordmark--power:is(:hover, :focus-visible, .is-lit) .bz-icon--porch .moth { animation: bz-moth 2.4s ease-in-out infinite; }
.bt-root:not(#_) .bt-wordmark--power:is(:hover, :focus-visible, .is-lit) .bz-icon .moth .wing { animation: bz-flutter 0.16s ease-in-out infinite alternate; }
.bt-root:not(#_) .bt-wordmark--power:is(:hover, :focus-visible, .is-lit) .bz-icon--porch .zap { animation: bz-flash 2.4s steps(1, end) infinite; }
.bt-root:not(#_) .bt-wordmark--power:is(:hover, :focus-visible, .is-lit) .bz-icon--porch .sparks circle { animation: bz-spark 2.4s ease-out infinite; }
.bt-root:not(#_) .bt-wordmark--power:is(:hover, :focus-visible, .is-lit) .bz-icon--porch .ash { animation: bz-ash 2.4s ease-in infinite; }
.bt-root:not(#_) .bz-icon .sparks circle:nth-child(1) { --dx: 1.5px; --dy: -2px; } .bt-root:not(#_) .bz-icon .sparks circle:nth-child(2) { --dx: 2.5px; --dy: 1px; }
.bt-root:not(#_) .bz-icon .sparks circle:nth-child(3) { --dx: -.5px; --dy: 2.5px; } .bt-root:not(#_) .bz-icon .sparks circle:nth-child(4) { --dx: 2px; --dy: -.5px; }
@keyframes bz-moth { 0%, 100% { transform: translate(0, 0); opacity: 1; } 18% { transform: translate(-1.2px, 2.2px); } 32% { transform: translate(-.6px, 3.4px); } 48% { transform: translate(-4.6px, 4.6px) scale(1); opacity: 1; } 51% { transform: translate(-4.6px, 4.6px) scale(.3); opacity: 0; } 92% { transform: translate(1px, -1px); opacity: 0; } }
@keyframes bz-flutter { from { transform: scaleX(1); } to { transform: scaleX(0.4); } }
@keyframes bz-flash { 0%, 46% { opacity: 0; } 48% { opacity: 1; } 51% { opacity: .25; } 54% { opacity: 1; } 60%, 100% { opacity: 0; } }
@keyframes bz-spark { 0%, 47% { opacity: 0; transform: translate(0, 0) scale(.4); } 50% { opacity: 1; transform: translate(0, 0) scale(1.2); } 66% { opacity: 0; transform: translate(var(--dx, 2px), var(--dy, -2px)) scale(.6); } 100% { opacity: 0; } }
@keyframes bz-ash { 0%, 52% { opacity: 0; transform: translate(0, 0); } 56% { opacity: 1; } 88% { opacity: 0; transform: translate(-.6px, 11px); } 100% { opacity: 0; } }
@keyframes bz-flicker { 0% { opacity: .2; } 12% { opacity: 1; } 20% { opacity: .3; } 30%, 100% { opacity: 1; } }

```

The hero scene, moths, counters and every other `bz-` rule: copy from the mockup's "Bug Zapper feature CSS" block
(H1, Board B and I1 parts only; leave out I2, I3, H2 and H3). The nav sprite (`wrench`) stays as it is.
