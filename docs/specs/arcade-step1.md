# Boom Arcade step 1 — foundations + Tap the Splat v1

Status: approved (Sep 29, 2026). Builds step 1 of `docs/specs/arcade-overview.md` §9. Visual source of truth: `docs/design/mockups/arcade-step1-screens.html` (approved: lobby 1 Marquee, Play tab 1 Split, game-logo titles, members-only gate) and `docs/design/mockups/arcade-info.html` (layout 1) for How it works. Related: `tap-the-splat.md`, `foundation.md`, `accounts.md`, design-system.md §8f, §8g, §8h.

Step 1 turns the footer game's stubs (`site/src/scripts/tap-the-splat/game-api.js`) into real server-checked runs, leaderboards and votes, and adds the Arcade pages to the Astro site.

## 1. End screen: layout 2 "Play first", Spooky wording

Order (every result): gold title, big time, one line, pills (Desktop or Mobile, v1, +Ns penalties or "no miss-clicks" on wins), solid green Play again, placement line, the two vote buttons with counts, "8.4K runs · 612 finished", teaser card. The 2-second click guard and dimmed buttons from the current game stay.

| Result | Title | Line |
| --- | --- | --- |
| Win | You survived | Every trap cleared. 100% complete. |
| Missed | It got away | Too slow. It slipped into the dark. You made it N% of the way. |
| Wrong | Wrong one | That wasn't the bloody one. It's still watching. You made it N% of the way. |
| Boom | Boom | Should have cut the wire. You made it N% of the way. |

- Buttons: "👍 I liked it" and "🎮 Make more games", each once per run (locked after pressing, unlocking on the next play), with counts. This replaces the older "▲ I liked it" / once-per-person rule in `tap-the-splat.md`.
- Placement (members): "You placed #4 on the desktop board for v1. See leaderboard" (links to `/arcade/tap-the-splat/leaderboards?device=desktop`). A personal best that doesn't place: "New personal best: #312 on the desktop board." Unverified: "Verify your email to get on the board." Mid-signup: "Finish signup to get on the board." Losses: "Only finished runs get on the leaderboard."
- Visitors: "Finished runs by members go on the leaderboard." "See leaderboard" and the teaser's Join free open the sign-in dialog on its Join tab (the Arcade pages are members only).
- Teaser: visitors "More games for members · Soon — Horror point-and-click puzzles, leaderboards and badges. Join free to play them first." + Join free. Members "More games coming · Soon — You'll play them first." The "Got an idea for v2? Suggest it" link appears only when the version doc has `workshopOpen: true` (build step 3).
- Run not recorded (offline, startRun failed, or refused build): "This run wasn't recorded." and no votes or placement. A refused build adds "Refresh the page to play the latest version."
- Also fix: the "Tapped out at N%" toast sits below the game bar and above the splat (it overlaps the bar on desktop today).

## 2. Scope

In: game registry and version docs (Tap the Splat, v1, build 1.0); runs through shared callables `startRun`, `finishRun`, `voteRun` for visitors and members; per-version Desktop and Mobile boards, weekly and all-time; a member's own best and rank; per-run votes and run counts; the end screen above; pages `/arcade`, `/arcade/how-it-works`, `/arcade/tap-the-splat`, `/arcade/tap-the-splat/leaderboards`, `/arcade/leaderboards`; an admin script to pull a cheated run off the boards.

Out: public profiles and badges (step 2; board names are plain text until then), Workshop (step 3), Studio (step 4), Playtest and a visible version picker (step 5), balance-patch admin UI (the data supports it), admin run review UI (Night Watch), App Check (2b), `trackEvent` (drop-off comes from stored runs), claiming a visitor's run after joining (D4, later). Removing a member's bests and board rows is added to the 2b account-deletion job's list.

## 3. Routes, gating, navigation

| Route | Who | Shows | Reads per view |
| --- | --- | --- | --- |
| `/arcade` | members | Lobby | `games` query (a handful of docs) + member's bests |
| `/arcade/how-it-works` | everyone | Info page (approved layout 1) | 0 |
| `/arcade/tap-the-splat` | members | Play tab | game doc + member's 2 bests + 1 board doc |
| `/arcade/tap-the-splat/leaderboards` | members | Leaderboards tab (`?device=desktop|mobile`, `?period=week|all`) | 1 board doc + member's best + a rank count |
| `/arcade/leaderboards` | members | Every game's all-time top 3 per device | 2 board docs per game |

- **Members only (D9).** One shared Arcade layout takes a `membersOnly` flag (true everywhere except How it works, D10). For visitors it renders the gate (§7) instead of the page content. It's display-only: the pages are static and carry no member data, and boards stay public-read because the footer's leaderboard popover is open to guests (design-system §8f).
- **Signed-in states:** `loading` shows a skeleton (never a flash of the gate); `needsSignup` shows the gate with Finish signup; `unverified` and `verified` members get in.
- **How it works for visitors:** "Enter the Arcade" and "Join free" open the Join dialog; "Try Tap the Splat" scrolls to the footer. For members "Enter the Arcade" goes to `/arcade` and Join free hides.
- **Game tabs** are real links (Play, Leaderboards; Workshop joins in step 3), each with its own URL.
- Slug `tap-the-splat`; the Firestore id stays `tapTheSplat`.
- **Navigation:** add an `arcade` module to `site.json` and `nav.js` (label "Arcade", href `/arcade`, after Games; icon: a small joystick symbol added to IconSprite). The Games page (Boomer's Game Vault) stays. On phones Arcade lands in More (D1).
- **Where Play happens (D2):** the game is the footer, so the Play tab's Play now scrolls to the footer and pulses the splat (a short cue, "Tap the splat to start"); the player taps the splat as everywhere else. How to play stays spoiler-free.

## 4. Data model (all under `sites/boomertanger/games/{gameId}`, written only by Cloud Functions)

| Path | Holds | Read |
| --- | --- | --- |
| `games/{gameId}` | title, slug, tagline, status (`live` / `soon` / `hidden`), currentVersion (`v1`), boardEpoch (mirror, below), sortOrder, playsIn (`footer`), `stats` {runs, finished, liked, wantMore, updatedAt} for the current version, `news` [{title, text, at}] | everyone |
| `…/versions/{v}` | label, status (`released` or a cycle stage), releasedAt, currentBuild (`1.0`), acceptedBuilds (`["1.0"]`), boardEpoch (1), boardNote (null), `checks` {minSecs: {desktop: 26, mobile: 31}, slackSecs: 3, maxRunMins: 30}, workshopOpen (false), keeperUid (null), plan (null), releaseNotes | everyone |
| `…/versions/{v}/runs/{runId}` | uid or null, runKeyHash (visitors), device, build, epoch, startedAt, finishedAt, result (`win` / `missed` / `wrong` / `boom` / `tappedOut`), secs, penalties, reached, splits, serverSecs, `checks` {ok, reasons}, `voted` {liked, wantMore}, onBoard, expireAt (+180 days) | nobody |
| `…/versions/{v}/bests/{uid}_{device}` | uid, device, epoch, handle, displayName, `allTime` {secs, penalties, runId, at}, `week` {key, secs, penalties, runId, at} | everyone |
| `…/versions/{v}/boards/e{epoch}_{device}_{period}` | period (`all` or an ISO week key such as `2026-W40`), `rows` (top 100: uid, handle, displayName, secs, penalties, at), updatedAt | everyone |
| `…/versions/{v}/counters/{0-9}` | runs, finished, liked, wantMore | nobody |
| `sites/boomertanger/rateLimits/{key}` | count, expireAt (+1 day) | nobody |
| `sites/boomertanger/private/arcadeSalt` | value, day (rotated daily; the old value is destroyed) | nobody |

- `games/{gameId}.boardEpoch` mirrors `versions/{currentVersion}.boardEpoch`, so pages build board ids (`e{epoch}_{device}_{period}`) from the game doc alone and stay within the §3 reads. `seed-arcade.js` writes both and `rollupArcadeStats` copies it every 5 minutes; any future balance-patch tool must update both in one write.
- `runs` counts wins and losses; tap-outs are stored but not counted; `finished` counts wins.
- One row per member per board (their best). Ties: the earlier run ranks higher.
- Rank beyond the top 100: a count aggregation on `bests` (times faster + 1). Indexes: (device ASC, epoch ASC, allTime.secs ASC) and (device ASC, week.key ASC, week.secs ASC).
- Weeks start Monday 00:00 in `site.json` timezone (America/Chicago, Central; Pacific until Oct 2026); key by ISO week of the finish time in that zone.
- Retention: TTL on `runs.expireAt` (180 days, D5) and `rateLimits.expireAt`, as `fieldOverrides` with `"ttl": true` in `firestore.indexes.json`. Bests and boards are kept.

## 5. Server (`functions/lib/arcade/`, added to `index.js` exports without moving anything)

**`startRun({ gameId, device, build })`** — called at the first splat tap without blocking it (the clock starts locally).
- Auth optional. Refuses a game that isn't `live`, a version that isn't `released`, or a build not in `acceptedBuilds` (error code the client shows as "refresh").
- Rate limit per hour: 60 per visitor IP key (salted hash of IP + hour, IP from `rawRequest.ip`), 120 per member uid.
- Writes the run with server `startedAt`; returns `runId`, plus a random 128-bit `runKey` for visitors (stored only as a SHA-256 hash).

**`finishRun({ runId, runKey?, result, secs, penalties, reached, splits })`** — once per run.
1. Same caller (uid match, or runKey hash match), not finished, started under `maxRunMins` ago.
2. Checks, all recorded in `checks.reasons`: |secs − serverSecs| ≤ slackSecs; secs ≥ minSecs[device] (wins only); splits strictly rising, each ≤ secs, and the firefly round lasting ≥ 2.6 s; penalties an integer 0–999; reached 0–100 (100 only on a win).
3. A passing win by a signed-up member with a verified email (D3; `email_verified` in the token) updates their `bests` (all-time and this week) and, if it places, the matching board docs, in one transaction.
4. Increments one random counter shard (runs; finished on a win). Tap-outs skip this.
5. Returns `{ counted, onBoard, personalBest, rank: { all, week }, reason }`.

*Time checks use the wall clock.* `secs` is wall-clock time plus miss-click penalties, so the serverSecs and minSecs checks compare `secs − penalties` (the wall-clock part), not `secs`. `splits` are wall-clock seconds at each round start, so "each ≤ secs" means each ≤ `secs − penalties`.

*Run ids.* `runId` is `gameId/version/docId`. The server validates it strictly before trusting it: exactly 3 segments, a known `gameId` (its game doc exists), a `version` that exists under that game, and a `docId` in the format `startRun` creates (a 20-character Firestore auto-id). Knowing an id proves nothing. `finishRun` and `voteRun` always check ownership on the run's `uid` or `runKeyHash`, never on the id alone.

**`voteRun({ runId, runKey?, kind })`** — `liked` or `wantMore`, once per kind on an ended run (not a tap-out) by the same caller; increments a shard.

**Background:** `rollupArcadeStats` (every 5 minutes) sums each live version's shards into `games/{gameId}.stats` and rotates `private/arcadeSalt` once a day. `syncArcadeNames` (trigger on `sites/{siteId}/profiles/{uid}`) rewrites that member's `bests` and their rows on the current all-time and weekly boards when handle or displayName changes.

**Scripts** (dry run unless `--apply`): `functions/scripts/seed-arcade.js --project <alias>` creates the game and v1 docs with the values above; `functions/scripts/remove-run.js --project <alias> --game --version --run --reason` marks the run (`checks.ok: false`, reason `admin: …`), recomputes that member's best from their other passing runs, rebuilds the affected board rows, and writes an `adminLog` entry (feature `arcade`, action `removeRun`).

**Client:** `game-api.js` keeps its exports (`getBoard`, `submitRun`, `vote`, `getVotes`) plus `startRun`; the Functions SDK loads with the game bundle only. PREVIEW DATA goes; the footer trophy renders in production too once this ships.

## 6. Rules

No client writes anywhere in the Arcade. Inside the existing `match /sites/{siteId}` block: `games/{gameId}`, `versions/{v}`, `bests/{id}`, `boards/{id}` public read; `runs`, `counters`, `rateLimits`, `private` no access. Bug Zapper, Feature Lab and Cloud Stash rules stay untouched. Add six rows to the Rules Playground checklist in `accounts.md` (read game, read board as guest, read runs → deny, write board as admin → deny, read counters → deny, read private/arcadeSalt → deny).

## 7. UI states (mockup: `arcade-step1-screens.html`)

Every Arcade page: site header, then the kit's feature top bar (`.bt-topbar` + `.bt-wordmark`: joystick icon, BOOM + accent ARCADE, like BUGZAPPER; links Games, Leaderboards, How it works on the right, hidden on phones; the wordmark links to `/arcade`, no breadcrumbs), then the page.

| Screen | Contents | States |
| --- | --- | --- |
| Lobby | Gold title "Games", subtitle; marquee game card (art, New + v1 badges, game logo, tagline, counts, your best, Play now + Leaderboards); row: What's new (`games.news`), Workshops (Soon), teaser | loading (skeleton card), counts not yet rolled up (hidden), no runs yet |
| Play tab | Game logo title, v1 + counts, tabs; left: art, "The game lives in the footer of every page. Play now takes you there.", Play now, How to play (4 lines); right: Your best (Desktop, Mobile: time and "#5 all-time · #3 this week"), Top 3 Desktop all-time; teaser | loading, no runs, one device only, unverified (notice under Your best) |
| Leaderboards tab | Device and Period pills (current device first), meta line ("v1 · This week · Resets Monday 12 am CT" / "v1 · All time"), board (# / Member / Date / Time; 25 rows + Show more up to 100), own row highlighted, or pinned below a gap row when outside the top 100; footer line | loading (skeleton rows), empty ("No finished runs this week yet" + Play now), in top 100, outside, not on this board ("Finish a run on a computer / your phone to get on it"), unverified (verify + Resend) |
| All leaderboards | Gold title "Leaderboards", subtitle; one card per game: logo, v1, Desktop and Mobile top 3, Full leaderboard link; teaser | loading, empty board |
| Members-only gate | BOOMARCADE bar without links, splat + mascot, gold "Members only", one line, Join free + Log in (open the dialog on Join / Sign in), "See what's inside" (How it works), "Just want to play? Tap the splat at the bottom of any page." The dialog opens once per visit (sessionStorage) on the Join tab titled "Join to enter the Arcade"; closing leaves the gate | visitor, needsSignup (Finish signup), loading (skeleton) |
| End screen | §1 | win + 3 losses × visitor / member placed / personal best not placed / unverified / not recorded / votes locked |

Phones: bests stack, the board drops the Date column and @handles, Play now goes full width, pills share the row.

## 8. bt-ui (shared/bt-ui.css, design-system.md §5 and §8h, UI Kit page)

New: `.bt-page-tabs` (link tabs; pill row ≤ 640px; `.bt-account-tabs` untouched), `.bt-game-card` (+ `--compact`, `.is-soon`, `.bt-game-art`, `.bt-game-body`, `.bt-game-stats`, `.bt-game-me`, `.bt-game-acts`), `.bt-board` (+ `--mini`, `tr.is-me`, `tr.bt-board-gap`, `.bt-board-foot`, `.bt-board-card`), `.bt-tease` (+ `--stack`), `.bt-game-logo` (`--lg` 36px / 28px on phones, `--sm` 22px; wraps `.bt-tts-title` letters), `.bt-btn--go` (the green Play again / Play now, D7), the joystick wordmark icon `.bt-ba-icon`. Tokens: `--bt-rank-silver: #dfe4ee`, `--bt-rank-bronze: #d58b52`, `--bt-lamp: #ffd400` (+ `--bt-lamp-rgb`). Page layout (grids for lobby, split, gate) lives in the site's page CSS.

Recorded decisions (§8h): the Arcade uses the feature top-bar pattern; a game's name uses the game's own logo lettering, every other page title stays gold; Play now joins the §8f green exception; the Arcade is members-only with a display-only gate; `--bt-lamp` is shared with Bug Zapper's bolt yellow.

## 9. Edge cases

Offline or startRun failed → plays, "not recorded". startRun slower than early rounds → finishRun awaits it; the 3 s slack covers the latency. Signs in or out mid-run → the run belongs to its starter. Two tabs → two runs, the better one wins. Device decided once at the first tap (`G.isPhone()`). Stale build → refused only when removed from `acceptedBuilds`. Weekly rollover → week from `finishedAt`. Scripted cheating → a time can't beat real elapsed time; floor and split checks catch crude cases; `remove-run.js` and App Check (2b) for the rest. Vote spam → once per kind per run, runs rate-limited. Minors → boards show only the handle and display name members chose, no links until profiles have a privacy view.

## 10. Decisions

| # | Decision |
| --- | --- |
| D0 | End screen layout 2, Spooky wording, with the three fixes in §1 |
| D1 | Arcade in More on phones for now |
| D2 | Play tab jumps to the footer game |
| D3 | Verified email required to appear on a board |
| D4 | Claiming a visitor's run after joining: later, its own step |
| D5 | Raw runs kept 180 days |
| D6 | Weekly reset Monday 00:00 America/Chicago (moved from Pacific in Oct 2026 with the Trophy Room: one site clock) |
| D7 | Play now is green like Play again (§8f exception extended) |
| D8 | The all-games leaderboard page ships in step 1, light |
| D9 | The Arcade is members only, with a gate that opens the Join dialog; the footer game stays public |
| D10 | How it works stays public as the pitch page |
| — | Balance-patch default (restart or note): decide at the first balance patch |

## 11. Setup (per project; staging now, production at launch)

Deploy rules, then `--only firestore:indexes` (includes the TTL overrides), then functions (the first scheduled function may need a retry; check Cloud Scheduler and Cloud Run in the console), then `seed-arcade.js`. Confirm both TTL policies under Firestore → Time-to-live. No secrets needed.
