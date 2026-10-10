# Service Hub spec

Oct 10, 2026 · Glenn Bowering · **Confirmed** (Oct 10, 2026; Talk Back merge added the same day) · **Mockup picks approved Oct 10, 2026** (§14)
Mockups round 1 (approved): `docs/design/mockups/service-hub-round-1.html`
Planning history: started Oct 2 as "Review Hub", renamed Oct 10. Related: `docs/specs/talk-back.md` (its page side moved here, §8a; the contract is §8b).

## 1. Purpose
One list of every service on the site and stream, kept up to date automatically, so the owner can see at a glance which services have feedback, questions, videos, testing, bugs and ideas, and members can rate and test each one. Members rate with a thumbs down (comment required), a thumbs up or two thumbs up, and earn badges for rating and testing. Every feature page ends with one strip where anyone can rate it (members) or ask a question / give feedback (Talk Back, through Hotline Boom).

## 2. Who sees what
| | Visitors | Members (incl. mods) | Admins | Owner |
|---|---|---|---|---|
| `/services/how-it-works` | ✓ | ✓ | ✓ | ✓ |
| `/services` member page | Teaser + Join free | ✓ (only services open to them) | ✓ | ✓ |
| Page strip: rate | "Join free to rate" | ✓ | ✓ | ✓ |
| Page strip: Ask / Feedback (Talk Back) | ✓ (email for the reply, Turnstile) | ✓ | ✓ | ✓ |
| Their own ratings, comments, tests, badge progress | | ✓ | ✓ | ✓ |
| Other members' ratings, comments, totals, popularity | | | ✓ | ✓ |
| `/admin/services` (Grid, Board, Map, Needs attention, detail) | | | ✓ | ✓ |
| Mark tested, link a video, hide a comment, retire or hide a service | | | ✓ | ✓ |

Members never see totals or anyone else's feedback. Mods get the member view; Night Watch can add more later.

## 3. What a service is
Types: `feature`, `page`, `arcadeGame`, `vaultGame`, `stream`, `streamSetup`, `video`, `adminTool`.
- **Core services** (counted for "rate them all"): feature, page, arcadeGame, streamSetup that are live and open to that member.
- Vault games and streams can be rated but aren't counted in "rate them all" (there will be hundreds). They get their own ladders.
- Admin tools are listed for admins only, never rated by members.
- Videos are tracked against services, not rated on their own in v1.

Status: `planned` · `building` · `live` · `retired` (plus a "Needs setup" flag until a live service has its basics: blurb, area and, if wanted, test checks).

### 3a. Picked up automatically
| Source | How |
|---|---|
| Site features and pages | One manifest per service in `services/<id>.json`: id, name, type, area, blurb, version, status, audience, routes[], nav link, test plan path, checks[], video tag, and (from Talk Back) `sections` ({ slug: label }), `talkBack` (`note` · `pins` · `rate` · `skip`) and `help` (path to `site/src/data/help/<id>.json`). The build collects them into `/services.json` with a build hash. Claude Code adds or updates the manifest as part of every feature (rule in CLAUDE.md). This is the single registry; Talk Back's `talkback-features.json` is not created. |
| Safety net | `check-services.js` in `npm run check` lists every route in `src/pages` that no manifest claims, fails on a manifest whose routes don't exist, and fails on an Ask pin whose section isn't in its manifest. |
| Sync | When an admin opens `/admin/services`, the page compares the build hash with Firestore and, if different, sends the manifests to `serviceSync` (admin). Also a "Sync now" button. New services arrive; changed versions bump; missing ones become retired (never deleted). |
| Boom Arcade games | Trigger on `games/{id}` and its versions: one service per game, version = current version. |
| Game Vault games | Trigger on `vaultGames/{slug}`: one service per non-hidden game. |
| Streams | Trigger when a stream reaches Ended: one service per stream, rateable for 14 days. |
| YouTube videos | The growth collector reads the channel's uploads and matches a tag in the description (`#bt-<serviceId>`). It records the video, its publish date and `coversVersion` (the service's version on that date; admins can correct it). |
| Bugs and ideas | Bug Zapper reports and Feature Lab ideas get an optional `serviceId` (from the reported page path through the manifest routes, or a picker). Triggers keep open counts on the service. |
| Questions and feedback | Hotline Boom line 2 messages carry `context.serviceId` (Talk Back). Service Hub reads the team-lane counts from Hotline Boom's monthly `stats` (never `statsOwner`). |

## 4. Data model (`sites/boomertanger/services/main/…`, every client write false)
| Path | Holds | Read |
|---|---|---|
| `items/{serviceId}` | type, name, area, blurb, version, status, audience, routes, sections, source ref, needsSetup, versionHistory[] (version, at), video { id, title, publishedAt, coversVersion, state none/current/stale }, tests { staging: { version, at, by, result }, production: {…} }, communityTests { version, pass, problems }, bugs { open }, ideas { open }, talk { questions, feedback, answered, month } (team lane only), ratings { love, like, dislike, n, comments, score, byVersion{} }, lastRatedAt, createdAt, updatedAt | admins |
| `ratings/{serviceId}__{uid}` | value love/like/dislike, comment (dislike 10–500 chars required; others 0–500), version, hidden, history[] (last 20: value, version, at), createdAt, updatedAt | that member; admins |
| `tests/{serviceId}__{uid}__{version}` | device desktop/phone, results per check (ok / problem + note), bugReportId?, createdAt | that member; admins |
| `my/{uid}` | rated { serviceId: { value, version } }, tested { serviceId: version }, coreRated count | that member |
| `summary` | one row per service for the admin views (everything in items minus history), rebuilt on every change; warn above 700 KB | admins |
| `public/services` (existing public path) | member-safe list: id, name, type, area, blurb, link, version, status, audience, checks count. No counts, no feedback. Admin tools excluded. | anyone |

Rate limits through `rateLimits` (60 ratings an hour, 10 tests an hour). Account deletion removes a member's ratings and tests (add to the Accounts 2b list). Talk Back messages keep Hotline Boom's own limits, lanes and rules.

## 5. Ratings
- One rating per member per service, changeable at any time. Each change is kept in history with the version.
- **One tap from the page strip:** Like it and Love it save straight away with a toast ("Saved: you love Tap the Splat. Add a comment"); Not for me opens the rating dialog because it needs a comment.
- **New version:** the member's rating stays and shows "You rated v1.0. Still feel the same?" with Keep or Change. Totals count every current rating; the admin detail can filter to "since this version".
- Thumbs down needs a comment; the other two take one optionally.
- Comments are seen by the owner and admins only. Admins can hide one (logged).
- Owner and admin ratings are kept but left out of totals and popularity.
- Members can rate only services that are live and open to them; streams only within 14 days of ending.
- **Popularity score** = (2 × love + like − 2 × dislike) ÷ ratings; also shown as love % and dislike %.
- Tones: Love pink, Like blue, Not for me gold (red stays reserved for deleting). Labels: Not for me / Like it / Love it.
- **Rating vs Talk back:** a rating is a quick private verdict with no reply; Ask and Feedback are a conversation in Hotline Boom that gets a reply. The strip says so in one line.

## 6. Tests
- **Admin test marks:** Mark tested on staging or production, for the current version, with pass or issues and a note. A version bump makes the mark "Not tested on v1.1".
- **Member walkthrough tests:** a service can list 3 to 8 checks in its manifest ("Open the report form", "Attach a screenshot on your phone"). A member runs them, marks each OK or Problem (with a note), and picks phone or desktop. A Problem offers "Report it in Bug Zapper" with the page and service filled in. One counted test per member per version.
- A service shows: Admin tested (staging, production, version) and Community tested (how many members, on which devices, problems found).

## 7. Admin page `/admin/services` (tool page)
Hero header with a small scene and Sync now, six filter tiles (Services, New Not for me, Not tested on this version, No video, Stale video, Open bugs), a search, and a `.bt-view-switch` with four views (choice remembered in `bt.services.view`):
1. **Grid** (default): **G2 coverage matrix** (one cell per thing a service should have: members rated, rating, video, tested staging, tested prod, member tests, bugs, questions this month; lime done, gold out of date, dashed gray missing, pink needs a look), grouped by area, type, audience or status. A **Coverage / Ratings** switch inside the Grid shows **G1** (table with rating bars and popularity; sorts Most loved, Most disliked, Most rated, Least rated, Most asked about, Newest version, Oldest test). Phones: cards.
2. **Board:** columns Planned, Building, Live, Retired; cards show the same indicators; a gold edge for new Not for me comments.
3. **Map:** services as nodes in zones by area (or audience, or type) inside the kit's `.bt-zoomframe` (pan, zoom, FIT, minimap); color by popularity, attention, video or testing; select a node to see what it links to.
4. **Needs attention:** new Not for me comments, new versions not tested, stale or missing videos, live services with no ratings after 14 days, routes no manifest claims, services needing setup, open bugs, and Talk Back's hint when a section gets 5+ questions in a month ("its help may need a line about it"). Each row has its action.
**Detail dialog** (from any view, deep link `?service=<id>`): health numbers, ratings by version, comments (hide), questions and feedback this month (counts and a link to the inbox filtered to this service; no message text here), tests, video (link, correct `coversVersion`), bugs and ideas links, version history, and the admin panel (Mark tested, Link video, Set video's version, Retire, Hide).
A Service Hub card on `/admin`: counts of new Not for me comments and untested versions, Open. Moves into Night Watch when it exists.

## 8. Member page `/services` (tool page) and the rate control
- Hero header with a small scene and your progress ("7 of 15 core services rated", next badge in a `.bt-tease`).
- **P3 collection wall:** every core service is a tile that lights up in the color of your rating once rated; unrated tiles are dashed with "Rate"; a moved-on service shows "New version". A **Wall / List** switch shows the **P2 checklist by area** instead (remembered per viewer). Chips: Core services / Vault games / Streams; search.
- **Rating dialog: R1 three buttons** (`.bt-rate`): big icon buttons with a one-line hint each; Not for me turns the comment box required in place; a short celebration when a badge or "all rated" lands.
- Community nav group entry with a one-line blurb (`site/src/lib/nav.js`).
- `/services/how-it-works`: story page at the Arcade standard (TocLayout, ghost chapters, hero scene, stage cards, journey, a working Try it rating, flip medals, placard, Ask BOOMBOT, closing call to action). Mocked up in round 2. It also explains rating vs Talk back.

### 8a. The page strip (Service Hub + Talk Back, one door per page)
- **S1 one strip, two halves** (`.bt-talkback`, `<TalkBackNote service="tap-the-splat" />`) at the end of every included feature page, after the closing call to action and above the footer, outside any TocLayout chapter. Head: the mascot, "How's {Service}?", "Rate it in one tap, or talk to Boomer."
- **Left half, Rate it (Service Hub):** the three rating buttons (one tap for Like / Love, dialog for Not for me); once rated, "You love it · Change" with the version and date; visitors see **Join free to rate** (opens E1 on Join free).
- **Right half, Talk back (Hotline Boom):** Ask a question and Give feedback, opening Talk Back's dialog through `window.btTalkBack.open()` (§8b). Members: "Replies land in your alerts"; visitors: "Replies come by email. No account needed."
- **Ask pins** (`.bt-ask-pin`, `<AskPin section="leaderboard" />`) stay on the sections listed in the manifest's `sections`, in `.bt-section-head-tools`; they open Ask with the section attached. Icon-only at 420px.
- Foot line: "Ratings are a quick verdict with no reply. Questions and feedback go to Hotline Boom with this page attached, and get a reply."
- Phones: the halves stack; at 420px the buttons share the row evenly.
- Placement comes from the manifest's `talkBack` field: `note` (the strip), `pins` (the strip plus Ask pins on the manifest's `sections`), `rate` (the strip with only the Rate half: no Ask / Feedback, no pins) or `skip` (no strip). Pins are at most 3 per page to start, added later where Talk Back's stats show questions clustering (`check-services.js` fails on more than 3). /contact and its sub-pages use `rate` (they are already the place to talk to Boomer). Always skipped: /auth/*, /admin/*, /live/obs, /live/control and its checklist, checkout, 404 and error pages.
- Kill switches: the `talkBack` module in `site.json` hides the right half and the pins; the strip still shows Rate. The `services` module hides the left half. Both off: no strip.
- Rollout: Claude Code drafts the page list (Talk Back §9) as the manifests' `talkBack` values; **stop** for approval; then one pass adds every strip and pin.
- No separate "Rate this" chip in the feature bar: one door per page.

### 8b. Contract with Talk Back
- Talk Back (Hotline Boom part 2) builds `window.btTalkBack.open({ serviceId, section?, mode: "question" | "feedback" })`, which opens its dialog (talk-back.md §5) unchanged.
- Messages store `context.serviceId` (the manifest id) and `context.section` (a key of that manifest's `sections`). BOOMBOT reads the manifest's `help` file.
- Hotline Boom's monthly `stats` key per serviceId ("By service"); Service Hub reads the team lane only.
- Until Hotline Boom passes its staging tests, the strip ships with the Rate half only.

## 9. Night Shift and Trophy Room hooks
- Night Shift activity type `services`, actions `rate`, `test`, `rateAll`, parameters `type` and `serviceId`. It also fills the waiting `ratings` type ("Rate a game"): rating a Vault game sends `services` with `type: vaultGame`.
- Badges (Community collection; names to confirm): first rating (Common), rating ladder 10 / 25 / 50 / 100, **rate every core service** (Rare, working name Full Coverage; earned once when every core service open to you is rated; a new service doesn't take it away), tester ladder 1 / 5 / 15, Vault critic ladder for games.
- No XP per rating (avoids farming); XP comes from Night Shift activities and badges. Talk Back messages earn nothing for the sender (staff Gears for answering are Hotline Boom part 2).
- Mod Machina task board: Service Hub posts system tasks (Gears set in crew settings): "Test v1.1 of <service> on phone and desktop" when a version bumps, "Check the problems members found on <service>".

## 10. Callables, triggers, rules
- Callables: `serviceRate`, `serviceTest`, `serviceSync` (admin), `serviceAdmin` (admin: markTested, linkVideo, setCoversVersion, hideComment, retire, hide; every action in adminLog, feature `serviceHub`). Talk Back uses Hotline Boom's `contactSend` (with `kind`, `context.serviceId`) and `contactDeflect`.
- Triggers: arcade games, Vault games, ended streams, bug reports, Feature Lab ideas → items + summary; ratings/tests → totals, `my/{uid}`, Night Shift events, badges; Hotline Boom's monthly `stats` → `items.talk` (team lane only). Growth collector step for videos.
- Rules: items, ratings (others'), tests (others') and summary read for `hasSiteRole('boomertanger','admin')`; ratings/tests/my own for the member; public/services already public; all writes false. Hotline Boom rules unchanged.

## 11. Edge cases
- Retired service: hidden from members, ratings kept, out of the "rate every core service" count; its strip disappears with the page.
- A service changes audience (e.g. becomes Sub Club only): members who lose access keep their rating; it stays counted.
- Version bump while a member has the dialog open: the save records the new version.
- Two manifests claim the same route: the check fails the build.
- A Talk Back message with an unknown `serviceId` shows its stored title and path in the inbox and counts as "Other".
- Owner-lane messages (Only Boomertanger, or moved by the name check) never appear in Service Hub counts.
- Staging and production each sync from their own build; nothing carries over.
- No ratings yet: empty states with the mascot.

## 12. Kit pieces (new, added to the UI kit page)
`.bt-rate` (three-way rating control with comment rule), `.bt-talkback` (the page strip: rate half + talk back half, with visitor and rated states), `.bt-ask-pin` (dashed section-head chip), `.bt-ind` (indicator strip: bugs, video, tests, ratings), `.bt-filter-tile` (summary tile that filters), `.bt-rating-bar` (love / like / not for me split bar), `.bt-map-zone` / `.bt-map-node` (inside `.bt-zoomframe`), `.bt-kanban` (status columns, shared with Bug Zapper's Board if it fits), the coverage cell (`.bt-cov-cell`: done / old / missing / bad). Reused: `.bt-view-switch`, `.bt-table`, `.bt-badge`, `.bt-meter`, `.bt-medal`, `.bt-tease`, `.bt-toast`, `.bt-section-head`, the mascot, `.bt-admin-panel`, `openModal()`.

## 13. Build parts
1. Docs: this spec, the approved mockups, the Talk Back split note, ROADMAP entry.
2. Manifests for every existing service (including `sections`, `talkBack`, `help`), the build step, `check-services.js`, the CLAUDE.md rule and the new-feature checklist line ("Service Hub manifest: type, area, talkBack note / pins (sections) / skip").
3. Backend: data, callables, triggers, rules, indexes, Night Shift and Trophy Room hooks, Mod Machina tasks; staging deploy (only the changed functions).
4. Bug Zapper and Feature Lab: the `serviceId` link.
5. Kit pieces (incl. `.bt-talkback` and `.bt-ask-pin`).
6. `/admin/services` (four views + detail) and the /admin card.
7. `/services`, the page strip with its Rate half, and the nav entry. The strip ships with Rate only (Talk back half off by the `talkBack` module) until step 10.
8. `/services/how-it-works` (after its round 2 mockup).
9. Growth collector video matching.
10. After Hotline Boom passes its staging tests: Talk Back's Hotline Boom side (Hotline Boom part 2, built in the Talk Back chat), then switch on the Talk back half and the Ask pins, and the questions column in the grid. Parts B and C of Talk Back follow in Hotline Boom part 2.

## 14. Mockup picks (approved Oct 10, 2026)
R1 three buttons · P3 collection wall with a Wall / List switch (P2 as the List) · S1 page strip, one strip with two halves · G2 coverage matrix as the Grid default with G1 as its Ratings switch · Board, Map, Needs attention, detail and member test as shown · tones Love pink, Like blue, Not for me gold.
Still open: member page name (the mockup used "Rate the site" as the page heading under the SERVICE HUB wordmark), badge names and art, whether mods get a read-only admin view later. How it works: round 2 mockup.
