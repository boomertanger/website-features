# Spec: Feature Lab (port) — CONFIRMED (2026-10-08)

ROADMAP workstream 10 (Porting existing features), Feature Lab only. Bug Zapper, Cloud Stash and Night Watch get
their own specs. Builds on `accounts.md`, `admin-editing.md`, `rewards.md` (Trophy Room), `fun-factory.md` (Night
Shift), `mod-machina.md` (Gears, grades), `boom-alerts.md` (`report-update`) and `header-nav.md`.
Approved mockups: `docs/design/mockups/feature-lab-mockups.html` (board option 3, How it works hero 1, every state)
and `docs/design/mockups/feature-lab-icon.html` (wordmark icon option 3, Bright idea).

## 1. Summary

A member idea board for the site and the stream at `/feature-lab` (a tool page), plus `/feature-lab/how-it-works`
(a story page). Members post ideas, vote and comment; admins triage; an idea that ships earns its author The
Architect. Every write goes through Cloud Functions. The legacy Squarespace Feature Lab (`featureRequests`, its
rules, `logFeatureRequestSubmitted`, `logFeatureRequestStatusChanged`, `deleteFeatureRequest`, the `featureLab`
kind of `adminEditItem`, `syncAdminStatus`) stays untouched until launch; all changes are additive.

## 2. Decisions (Oct 8, 2026)

1. **Who can do what.** Everyone, visitors included, can read the board, ideas, comments and history. Posting,
   voting and commenting need a signed-up member with a verified email (or staff), as in the Game Vault. No plan check.
2. **Legacy data.** Prod Feature Lab data is test data only: nothing is imported.
3. **Identity.** Firebase uid. Each idea and comment stores `by { uid, handle, name }` as a snapshot; the page shows
   the live public profile (one read per distinct person on screen, cached) and links to `/u/{handle}`. A missing
   profile shows "Former member".
4. **Admin edits and deletes.** Title, description and area through `adminEditItem` (new kind `labIdea`, in
   `lib/lab/edit.js`, dispatched like `vaultGame`), always with an adminLog entry. Delete through `labDelete`.
5. **Votes and counts.** Callables, not member-writable rules (Night Shift needs the event recorded in the same
   function, and this fixes fake votes and the comment undercount).
6. **Abuse protection.** Limits per member: 3 ideas a day, 20 comments an hour, 60 vote changes an hour, plus the
   length limits. Mods and admins can hide or unhide an idea or a comment (reversible, logged, with a reason). Only
   admins triage. Delete: the owner, A2 Overseer or A3 Right Hand; an A1 Steward gets Hide and a note instead. No
   member Report button in v1 (waits for the site-wide reports system).
7. **Night Shift and rewards.** Activity type `lab` switched on with actions `post`, `vote`, `shipped`. The Architect
   (`architect`) is granted when an idea first reaches Shipped. Mod Machina's "+3 Gears for Feature Lab review" is
   paid to the admin who first moves an idea out of Submitted. Boom Alerts gets a `report-update` event in
   `notifyOutbox` on every status change.
8. **Where it lives.** `/feature-lab` and `/feature-lab/how-it-works`; Community nav group (already defined in
   `site/src/lib/nav.js`: "Suggest ideas and vote on them."), switched on by adding `featurelab` to `site.json`
   modules (seed-site copies it to `sites/boomertanger`). A Feature Lab card on /admin.
9. **Page types.** The board is a tool page; How it works is a story page (full frame). See §7 and §8.
10. **Mockup picks.** Board option 3 (List by default, Roadmap one tap away through `.bt-view-switch`, choice kept in
    `localStorage` key `bt.lab.view`, try/catch). How it works hero 1 (the lab bench). Wordmark icon option 3
    (Bright idea). New kit piece `.bt-comment--hidden`.

## 3. Data model (`sites/boomertanger/lab/main/…`)

| Path | Fields | Read |
|---|---|---|
| `ideas/{ideaId}` | `title` 3–200, `description` 10–2000, `area` `site`·`stream`·`other`, `status` `submitted`·`under_review`·`planned`·`in_progress`·`shipped`·`declined`, `priority` `low`·`medium`·`high`·null, `by { uid, handle, name }`, `voteCount`, `commentCount`, `hidden` (bool), `hiddenBy { uid, handle }`?, `hiddenReason`?, `statusChangedAt`, `shippedAt`?, `firstTriagedAt`?, `statusHistory[]` (`{ status, changedBy, changedAt, note? }` or `{ kind: "note", note, changedBy, changedAt }`), `editedAt`?, `editCount`?, `createdAt`, `updatedAt` | anyone if `hidden == false`; staff always |
| `ideas/{id}/comments/{cid}` | `text` 1–1000, `by { uid, handle, name }`, `staffTag` `admin`·`mod`·null (server-set from roles), `hidden`, `hiddenBy`?, `hiddenReason`?, `createdAt` | same as the idea, and the comment's own `hidden == false` for non-staff |
| `ideas/{id}/votes/{uid}` | `createdAt` | nobody (server only) |
| `myVotes/{uid}` | `ids[]` (idea ids this member voted for) | that member only |
| `submitTokens/{token}` | `uid`, `ideaId`, `expireAt` (1 day TTL) | nobody (server only; makes a double-click post one idea) |

Rate-limit counters use the existing `sites/boomertanger/rateLimits` collection (server only), keys
`lab_<kind>_<hash(uid|period)>` like the Night Shift's. Every path is `write: if false` for clients.

Indexes: `ideas` where `hidden == false` order by `createdAt desc`; `comments` where `hidden == false` order by
`createdAt asc`. The existing `adminLog` index (`itemPath` + `createdAt desc`) serves the admin activity list.

## 4. Functions (`functions/lib/lab/*.js`, wired in `functions/index.js` like `lib/vault`)

Callers come from `sites/boomertanger/members/{uid}.roles`, `ownerUid` and the profile (the Vault's `callerInfo`
pattern); crew grade from the member's crew roster entry or the `crewGrade` claim. Errors are HttpsError with
`details.reason`.

| Callable | Who | Does |
|---|---|---|
| `labSubmit { title, description, area, token }` | verified members, staff | validates, rate limit (3/day, Central day), creates the idea (`status: submitted`, `voteCount: 1`, author's vote doc and `myVotes` entry, first history entry), activityLog `submitted`, Night Shift `recordFactoryEvent(uid, "lab", { action: "post" }, "post-<id>", { keep: true })`. Returns `{ id }` |
| `labVote { id, on }` | verified members, staff | refuses hidden, shipped and declined ideas; rate limit (60/h); one transaction: vote doc, `voteCount`, `myVotes`. When turned on and not the author's own idea: Night Shift `{ action: "vote" }`, ref `vote-<id>`, `keep: true` |
| `labComment { id, text }` | verified members, staff | refuses hidden ideas; rate limit (20/h); one transaction: the comment and `commentCount + 1`; `staffTag` from roles |
| `labTriage { id, status?, priority?, note?, before }` | admins (A1+ and owner) | same rules as today: a real status change adds exactly one history entry (with the optional note); a note alone adds a `kind: "note"` entry; priority alone adds none; an empty save is refused. Sets `statusChangedAt`. Conflict check against `before.status`/`before.priority`. adminLog `triage`. On a status change: activityLog `status-changed`, `notifyOutbox` `report-update` to the author. First move out of Submitted: `firstTriagedAt` and +3 Gears (`labReview`, ref idea id) to the admin. First time Shipped: `shippedAt`, `grantBadge(authorUid, "architect", { feature: "lab", ref: id })`, Night Shift `{ action: "shipped" }` for the author, activityLog `shipped` |
| `labHide { id, commentId?, hidden, reason }` | mods and admins | hides or unhides an idea or a comment; reason 1–200 required to hide; adminLog `hide`/`unhide` |
| `labDelete { id }` | owner, A2, A3 | in order: activityLog events with `ideaId`, then the idea with comments and votes (`recursiveDelete`), removes the id from every `myVotes` that has it, adminLog `delete` with a text snapshot |
| `adminEditItem` kind `labIdea` | admins | title 3–200, description 10–2000, area; conflict check; `editedAt`, `editCount`; adminLog `edit` |

Logging: adminLog feature key `featureLab`, `itemPath: sites/boomertanger/lab/main/ideas/<id>` (through the shared
`adminLogEntry`). activityLog: `feature: "feature-lab"`, types `submitted`, `status-changed`, `shipped`, with
`ideaId`, `link: "/feature-lab?idea=<id>"`; never for hidden ideas.

Night Shift: in `functions/data/fun-factory-ideas.json` the `lab` type becomes `enabled: true`, `needs: null`,
`source: "Feature Lab"`, actions `post`, `vote`, `shipped`, params `action`, with a description; re-seed with
`seed-factory-types.js`. Gears: add source `labReview` to `lib/crew/gears.js` `SOURCES` and a
`noteLabReview(uid, ideaId)` hook in `lib/crew/hooks.js` (lazy, never throws).

## 5. Rules (additive)

- New matches under `match /sites/{siteId}` for `lab/main/ideas` (and `comments`, `votes`), `lab/main/myVotes`,
  `lab/main/submitTokens`, as in §3. Every write `false`.
- `adminLog` read becomes `isAdmin() || hasSiteRole('boomertanger', 'admin')` so new-site admins see the admin
  activity list. Nothing else in the legacy rules changes.

## 6. Kit

- New: `.bt-comment--hidden` (a hidden comment as staff see it: dashed border, faded, struck-through text, a
  "Hidden by @handle: reason. Only staff see this." line). Added to `shared/bt-ui.css`, the UI kit page and
  design-system §5.
- Reused: `.bt-topbar`, `.bt-wordmark--power`, chips, `.bt-row` + `initRowSpotlight`, `.bt-tally`, badges with
  `levelBars`, `.bt-view-switch`, `openModal` / `modalHeader` / `confirmAction`, composer, comments, history,
  admin panel, `.bt-stamp`, `burst`, `.bt-mascot`, `.bt-medal`, `.bt-empty`, the members-only gate, TocLayout,
  `.bt-chapter--ghost`, `.ai-stage`, `.ai-jr`, `.ai-flow`, `.bt-flip`, `.bt-placard`, `.bt-chat`, `.ai-cta`.
- Feature CSS only (`site/src/styles/feature-lab.css`, prefix `fl-`): the wordmark icon, the bench and jars, the vote
  pop, the roadmap columns and the How it works scenes. Tokens only.

## 7. /feature-lab (tool page)

- **Top bar**: FEATURE LAB `.bt-wordmark--power` with the Bright idea icon (Appendix A), a ghost How it works link
  and a primary New idea button (visitors get the Join dialog titled "Join to post ideas"). Phones: icons only.
- **Hero**: `.bt-title` "Feature requests", the subtitle "Suggest ideas for the site or the stream, vote on your
  favorites, and track progress, all in one place.", Post an idea and How it works buttons (hidden on phones), and
  the bench scene: a bubbling flask, five jars (Submitted, Under review, Planned, In progress, Shipped) filled by
  count, the mascot. Jars are buttons that filter (labels hidden on phones, kept in `aria-label`).
- **Controls**: status chips with counts, Area (All, Site, Stream, Other) and Sort (Newest, Most voted, Recently
  updated), the List / Roadmap switch.
- **List**: `.bt-row` with `.bt-tally` (locked on Shipped and Declined), title, description, avatar and `@handle`
  link, The Architect mini medal on shipped rows, area, priority and status badges, comment count, date.
  Declined rows dimmed.
- **Roadmap**: a "N new ideas waiting for a look" strip, then columns Under review, Planned, In progress, Shipped
  (cards with a mini vote); declined hidden behind "Show declined". Phones: a side-scrolling track.
- **Idea dialog** (`openModal`, wide; deep link `?idea=<id>`): title, "Requested by @handle on DATE · Area",
  badges, a vote box, description, comments with the composer (visitors: a Join free box; unverified: the verify
  box), history. Mods: Hide on comments and Hide idea. Admins: the green admin panel (status, priority, note, Save;
  hint "Moving an idea to Shipped gives its author The Architect."), Admin activity, Edit (`adminEditItem`),
  Delete (`confirmAction`; Stewards see "Deleting needs the owner or a Right Hand.").
- **Post an idea** dialog: It's for (Site, Stream, Other), Title, What should it do? (hint: "A new game idea? Pitch
  it in the Arcade Studio instead."), then the success view: the IDEA IN `.bt-stamp` with a bubble burst, "It's on
  the board", the Night Shift line when a live mission counted it.
- **States**: loading (3 skeleton rows), empty board (mascot with the flask), empty filter (mascot), visitor strip,
  not verified, rate limit, load error, hidden idea for staff (dimmed, gray Hidden badge, Unhide), "Your idea
  shipped" (once per idea, on the author's next visit; lime SHIPPED stamp and The Architect; remembered in
  `localStorage` `bt.lab.shippedSeen`), delete confirmation.
- **/admin card**: "N new ideas waiting for a look", the oldest one, Open the board (admin green).
- Preview data for `?as=` like the other features (`site/src/data/preview-lab.json`).

## 8. /feature-lab/how-it-works (story page)

TocLayout with: hero 1 ("Your ideas, built for real", the bench scene), 01 What it's for (four stage cards with
hover scenes: Pitch an idea, Vote on ideas, Watch it move, Ship it), 02 An idea's journey (`.ai-jr`, five steps with
status badges, plus the Declined note), 03 Try it (a sample idea to vote on and move to Shipped; nothing saved),
04 Who does what (`.ai-flow`: You, Admins, Boomertanger, Mods), 05 Rewards (flip cards: The Architect, Big idea,
Vote on ideas), 06 House rules (placard, six rules), 07 Ask BOOMBOT (five questions), closing CTA. Copy as in the
mockup. No Firestore reads except the jar counts (one capped query; fall back to an empty bench).

## 9. Edge cases

Idea deleted or hidden while open (the dialog says "This idea is no longer here" and closes). Double-click on
Post (one idea, by token). Handle changed or account deleted (live profile, "Former member"). Twitch accounts
without email ("Add an email in Account, then verify it."). Shipped, moved back, shipped again (badge, Gears and
events once, by ledger keys). Votes after Shipped or Declined are refused; the count is frozen. A member voting
on their own idea never counts for Night Shift.

## 10. Build order

1. Spec and mockups saved. 2. Functions (`lib/lab`, the `labIdea` edit kind, Gears source and hook, Night Shift
type data). 3. Rules and indexes. 4. Kit `.bt-comment--hidden` + UI kit page. 5. /feature-lab. 6.
/feature-lab/how-it-works. 7. /admin card, nav module on. 8. Docs: ROADMAP, design-system §8, CHANGELOG.
Deploy to staging: rules and indexes, then functions, then `seed-factory-types.js --project staging`.

## Appendix A: the wordmark icon (option 3, Bright idea)

`FL_ICON` in `site/src/scripts/lab/art.ts`; `<uid>` must be unique per instance.

```html
<svg class="fl-icon" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
  <defs><radialGradient id="<uid>" cx=".4" cy=".3" r=".8"><stop offset="0" class="s-hi"/><stop offset="1" class="s-lo"/></radialGradient><radialGradient id="<uid>h"><stop offset="0" class="h-in"/><stop offset="1" class="h-out"/></radialGradient></defs>
  <path class="glass" d="M16.5 6.5V15.6A11 11 0 1 0 23.5 15.6V6.5Z"/>
  <circle class="halo" cx="20" cy="23.4" r="9" fill="url(#<uid>h)"/>
  <path class="liq" fill="url(#<uid>)" d="M11.3 30Q20 28.6 28.7 30A9.6 9.6 0 0 1 11.3 30Z"/>
  <circle class="in" cx="17" cy="33" r="1"/><circle class="in" cx="23.4" cy="32.6" r="1.2"/>
  <path class="post" d="M18 13.5V22.6M22 13.5V22.6"/>
  <path class="fil" d="M17.2 23.2c.6-2.1 1.5-2.1 2 0s1.4 2.1 2 0 1.4-2.1 2 0"/>
  <path class="outline" d="M16.5 6.5V15.6A11 11 0 1 0 23.5 15.6V6.5"/>
  <path class="thread" d="M16.5 8.6l7-1.2M16.5 11.2l7-1.2M16.5 13.8l7-1.2"/>
  <path class="shine" d="M12.6 23.2A8.4 8.4 0 0 1 16.2 18.4"/>
  <rect class="lip" x="14.6" y="4.4" width="10.8" height="2.6" rx="1.3"/>
  <circle class="up u1" cx="20" cy="9" r="1.5"/><circle class="up u2" cx="21.5" cy="9" r="1"/><circle class="up u3" cx="19" cy="9" r="1.2"/>
</svg>
```

```css
.bt-root:not(#_) .fl-icon { width: 36px; height: 36px; overflow: visible; }
.bt-root:not(#_) .fl-wm .bt-wordmark-icon { padding-top: 4px; }   /* headroom: the bubbles never clip */
.bt-root:not(#_) .fl-icon .glass { fill: color-mix(in srgb, var(--bt-primary) 9%, var(--bt-surface-2)); }
.bt-root:not(#_) .fl-icon .outline { fill: none; stroke: var(--bt-primary); stroke-width: 2.1; stroke-linejoin: round; stroke-linecap: round; }
.bt-root:not(#_) .fl-icon .lip { fill: var(--bt-surface-2); stroke: var(--bt-primary); stroke-width: 1.7; }
.bt-root:not(#_) .fl-icon .thread { stroke: var(--bt-primary-soft); stroke-width: 1.2; stroke-linecap: round; opacity: .7; }
.bt-root:not(#_) .fl-icon .shine { fill: none; stroke: var(--bt-text); stroke-width: 1.5; stroke-linecap: round; opacity: .45; }
.bt-root:not(#_) .fl-icon .s-hi { stop-color: var(--bt-primary-soft); }
.bt-root:not(#_) .fl-icon .s-lo { stop-color: var(--bt-primary); }
.bt-root:not(#_) .fl-icon .liq { opacity: .6; transition: opacity .35s, filter .35s; }
.bt-root:not(#_) .fl-icon .in { fill: var(--bt-text); opacity: .5; }
.bt-root:not(#_) .fl-icon .up { fill: var(--bt-primary-soft); opacity: 0; transform-box: fill-box; transform-origin: center; }
.bt-root:not(#_) .fl-icon .up.u2 { fill: var(--bt-title); }
.bt-root:not(#_) .fl-icon .up.u1 { --dx: -2px; }
.bt-root:not(#_) .fl-icon .up.u3 { --dx: 2px; }
.bt-root:not(#_) .fl-icon .post { stroke: var(--bt-text-faint); stroke-width: 1; }
.bt-root:not(#_) .fl-icon .fil { fill: none; stroke: var(--bt-text-muted); stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; transition: stroke .2s; }
.bt-root:not(#_) .fl-icon .halo { opacity: 0; transition: opacity .3s; }
.bt-root:not(#_) .fl-icon .h-in { stop-color: var(--bt-lamp); stop-opacity: .75; }
.bt-root:not(#_) .fl-icon .h-out { stop-color: var(--bt-lamp); stop-opacity: 0; }
/* Power on: hover, focus, or .is-lit (initPowerWordmarks on touch screens) */
.bt-root:not(#_) .bt-wordmark--power:is(:hover, :focus-visible, .is-lit) .fl-icon .liq { opacity: 1; filter: drop-shadow(0 0 4px rgba(var(--bt-primary-rgb), .9)); }
.bt-root:not(#_) .bt-wordmark--power:is(:hover, :focus-visible, .is-lit) .fl-icon .up { animation: fl-rise 1.2s ease-in infinite; }
.bt-root:not(#_) .bt-wordmark--power:is(:hover, :focus-visible, .is-lit) .fl-icon .up.u2 { animation-delay: .35s; }
.bt-root:not(#_) .bt-wordmark--power:is(:hover, :focus-visible, .is-lit) .fl-icon .up.u3 { animation-delay: .7s; }
.bt-root:not(#_) .bt-wordmark--power:is(:hover, :focus-visible, .is-lit) .fl-icon .in { animation: fl-float 1.4s ease-in-out infinite alternate; }
.bt-root:not(#_) .bt-wordmark--power:is(:hover, :focus-visible, .is-lit) .fl-icon .fil { stroke: var(--bt-lamp); filter: drop-shadow(0 0 2px rgba(var(--bt-lamp-rgb), .95)); animation: fl-flicker 1s steps(1, end) both; }
.bt-root:not(#_) .bt-wordmark--power:is(:hover, :focus-visible, .is-lit) .fl-icon .halo { opacity: 1; animation: fl-flicker 1s steps(1, end) both; }
@keyframes fl-rise { 0% { transform: translate(0, 0) scale(.6); opacity: 0; } 20% { opacity: 1; } 100% { transform: translate(var(--dx, 0px), -16px) scale(1.15); opacity: 0; } }
@keyframes fl-float { to { transform: translateY(-1.5px); opacity: .85; } }
@keyframes fl-flicker { 0% { opacity: .2; } 12% { opacity: 1; } 20% { opacity: .3; } 30%, 100% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .bt-root:not(#_) .fl-icon :is(.up, .in, .fil, .halo) { animation: none !important; } }
```

The nav sprite (`#i-bulb` in IconSprite, used by the Community panel) stays as it is.
