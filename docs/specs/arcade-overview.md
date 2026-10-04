# Boom Arcade — overview

Status: concept approved (September 2026). This is the anchor document for every Arcade chat and spec. Detailed specs (games and runs, leaderboards, Studio, Workshop) build on it and must not contradict it; if one needs to, update this file first.

Related: `docs/specs/foundation.md` (site, accounts, data model rules), `docs/specs/accounts.md`, `docs/specs/tap-the-splat.md`, mockups `docs/design/mockups/arcade-info.html` (approved: layout 1 "Guided scroll") and `docs/design/mockups/end-screen-variations.html` (chosen: layout 2 "Play first", Spooky wording; see `docs/specs/arcade-step1.md` §1). Step 1: `docs/specs/arcade-step1.md`, mockup `docs/design/mockups/arcade-step1-screens.html`.

## 1. What it is
A section of boomertanger.com where people play horror point-and-click puzzle games, compete on leaderboards, and help decide what gets built next. Games grow version by version, shaped by the community. Tagline on the info page: "Horror games, built with you."

## 2. Names (use these everywhere: UI, docs, code comments)
| Term | Meaning |
|---|---|
| Boom Arcade | The whole section (menu label: "Arcade"). |
| Arcade Studio | Where new games are pitched and greenlit. Arcade-wide, not per game. |
| Pitch | An idea for a brand-new game, posted in the Studio. |
| Greenlit | A pitch the owner chose to build. It becomes a game with its own Workshop. |
| Workshop | One game's space for its next version. |
| Draft board | The Workshop's message board (threaded posts, not live chat). Not to be confused with the home page's Boom Board. |
| Keeper | The volunteer product manager for one version of one game. Term ends at release. Shown as "Keeper of <game> v2". |
| Version (v1, v2) | A full release. What players pick and what leaderboards track. |
| Patch (v1.8) | An internal fix after release. Players still see "v1". Every run stores its exact build. |
| Balance patch | A patch that changes difficulty or timing. The version's boards restart or show a note ("times before v1.4 used the old timing"). |
| Playtest | The members-first beta of the next version, offered in the version picker. |
| Run | One play of a game, win or lose. |

Rejected names, for the record: "Game owner" (clashes with the site owner role), "Game boss" (a boss is an enemy in games), "Whiteboard"/"Idea board" for the Draft board.

## 3. Structure and URLs (organized game first)
- `/arcade` — lobby: every game, what's new, active Workshops.
- `/arcade/how-it-works` — the info page (mockup approved, layout 1).
- `/arcade/<game>` — Play (version picker hidden until a second version exists).
- `/arcade/<game>/leaderboards` — per version, Desktop and Mobile, weekly and all-time.
- `/arcade/<game>/workshop` — Draft board, ideas, Keeper, version cycle bar.
- `/arcade/studio` — pitches for new games.
- `/arcade/leaderboards` — cross-game overview.
- Leaderboard names link to public profiles (badges, Keeper history). Profiles exist from the accounts work; they need a public view.
- The Arcade pages are members only, except `/arcade/how-it-works` (the public pitch page). Visitors see a members-only gate that opens the Join dialog; the gate is display-only (the pages carry no member data). The footer game stays public: anyone can play it on every page (`arcade-step1.md` §3, D9, D10).

## 4. Life cycles (shown on the info page and Workshop pages)
New game: Pitch → Community vote → Greenlit → Workshop plans v1 → Playtest → Release.

New version (Workshop cycle bar, 8 stages, colored with the site-wide status colors):
1. Ideas open (blue) — all members post ideas on the Draft board, comment and vote.
2. Shortlist (teal) — Keeper merges duplicates and picks the strongest, with reasons.
3. Vote (teal) — members vote on the shortlist; results guide, not dictate.
4. Plan locked (gold) — Keeper writes the plan; the owner approves. This becomes the build requirements (worked out with Claude, then built).
5. In development (green) — owner builds; Keeper posts updates.
6. Playtest (green) — members play the beta, report bugs and balance issues.
7. Release (lime) — new version with fresh boards; release notes credit every idea used.
8. Thanks and badges (lime) — contributors, playtesters and Keeper earn badges; Keeper term ends; next cycle can open.

## 5. Roles
- Players (all members): play, post and vote in Workshops, playtest.
- Pitchers: members with a qualifying gamer badge can pitch in the Studio.
- Keeper: one per version; chosen by the owner from mods who volunteered.
- Mods: keep every space safe; report/hide in Workshops. Keepers get report/hide tools but not bans.
- Owner (Boomertanger): greenlights pitches, approves every plan, builds the games, final say.

## 6. Service boundaries (who owns what)
- Boom Arcade: games, versions, runs, leaderboards, Studio pitches, Workshops, Draft board, the Keeper assignment for a version.
- Mod Machina (separate service): who is a mod, member requests to become a mod (not public), mod permissions, and the Keeper volunteer queue/eligibility. When a Workshop cycle opens, it shows "Keeper wanted"; Mod Machina supplies the queue; the owner picks; the Arcade records the choice on the version doc.
- Badges (separate shared service, to be designed): awards and checks badges. The Arcade Studio (pitch eligibility), Contests (entry pools, e.g. only Tap the Splat badge holders) and Mod Machina (Keeper eligibility) all ask it "does member X hold badge Y?". Badges need stable machine IDs, a game scope, and levels.
- Contests (separate service): entry pools by badge.
- Feature Lab: stays for site features only. Studio and Workshop ideas are separate data, reusing the same bt-ui building blocks (votes, comments, statuses, composer).

## 7. Data (Firestore, under the site; details in each spec)
- `sites/{siteId}/games/{gameId}` — title, slug, status, current version, sort order.
- `.../games/{gameId}/versions/{version}` — status (cycle stage or released), current build (e.g. 1.8), balance notes, keeperUid, dates, plan (locked requirements).
- `.../versions/{version}/runs/{runId}` — member, device (desktop/mobile), build, start/finish, time, penalties, result, server checks. Written only by functions.
- Leaderboard summaries per version, device and period, written only by functions.
- Vote counters per version ("liked", "wantMore"); one vote per button per run, tied to the server run id.
- Workshop: ideas, comments, Draft board threads and posts per version. Studio: pitches and comments.
- Shared callables for every game: `startRun`, `finishRun`, `voteRun`. A new game plugs into leaderboards and votes for free.
- Games load lazily, one bundle per game, sharing the end screen, leaderboard, sound and run modules.
- Keeper permissions come from the version doc (no extra account roles).

## 8. Rules already decided
- Time is the score (m:ss.cc); miss-clicks add seconds; only finished runs by members make the board; Desktop and Mobile boards are separate.
- Votes: 👍 thumbs up (not the site's up arrow) because visitors see this game first. One vote per button per run, unlocking again on the next play. Show run counts too ("8.4K runs · 612 finished").
- End screen titles are always gold, for every result; the big time stays.
- The footer game's end screen shows a teaser. Visitors: "More games for members · Soon — horror point-and-click puzzles, leaderboards and badges. Join free to play them first." Members: "More games coming · Soon — You'll play them first.", plus "Got an idea for v2? Suggest it" only while the version's Workshop is open (`arcade-step1.md` §1).
- Versions: players only ever see major versions; builds are internal; balance patches restart or annotate boards.
- Conversation is threaded (Draft board), not real-time chat. Live chat only if members ask for it later.
- Safety: some members are 13–17. All Workshop and Studio conversation is public and moderated; Keepers are 18+ to start; no private messaging in the Arcade.

## 9. Build order
1. Arcade foundations + Tap the Splat v1 for real: game registry, versions and builds, server-checked runs, per-version Desktop/Mobile leaderboards, per-run votes and run counts, final end screen, Arcade lobby, the info page.
2. Public profiles + first badges (and the shared Badges service design).
3. Workshop v1: Draft board, ideas, Keeper, cycle bar (needs Mod Machina's Keeper queue).
4. Arcade Studio: pitches gated by badge.
5. Playtest betas via the version picker.

## 10. Open questions
- ~~End screen: layout and wording tone.~~ Decided: layout 2 "Play first", Spooky wording (`arcade-step1.md` §1, D0).
- Which badge unlocks pitching (e.g. "finished any game").
- How long a version cycle stage lasts, and who can advance it (Keeper proposes, owner approves?).
- ~~Weekly board reset day and timezone.~~ Decided: Monday 00:00 America/Chicago (`arcade-step1.md` D6; Pacific until Oct 2026).
- Whether leaderboards show during a balance patch transition as "restart" or "note" by default.

## 11. Pending small fix to include in the first build
- The "Tapped out at N%" toast sits below the game bar and above the splat (it currently overlaps the bar on desktop).
