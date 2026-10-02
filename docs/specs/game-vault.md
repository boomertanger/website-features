# Spec: Game Vault — CONFIRMED (2026-10-02)

Workstream 3. Planning chat: "Games and streams". The stream object it depends on is
specified in `docs/specs/stream-object.md`.

Mockups: `docs/design/mockups/game-vault-mockups.html` (round 1: A2 C2 B1 D1 E2 S2 F1 G2,
approved) and `docs/design/mockups/game-vault-round-2.html` (round 2, the "next level"
versions of the same picks; recommended set `A65 C56 B34 D34 E4 F3 G34`, to be confirmed
before the UI parts are built).

## 1. Summary

**Game Vault** (`/games`; boomertanger.games redirects here) lists every horror game
Boomertanger streams or wants to: cover, summary, tags, Boomer's review and score, status,
and how often and how recently it was streamed. Members with a verified email add games by
pasting a Steam link or searching by name; the server fills in the details, blocks
duplicates and screens content. Only doubtful adds (and member cover suggestions) go to a
small mod queue.

Naming: **Vault games** (`vaultGames`) are games Boomertanger streams. **Arcade games**
(`games/`) are games people play on the site. Never mix the two.

## 2. Who sees and does what

| Who | Can do |
|---|---|
| Visitors | View everything. Add a game opens the Join dialog titled "Join to add games". |
| Members, email not verified | View everything. Add a game shows the verify-email prompt. |
| Members, email verified | Add up to 5 games a day (no account-age wait). "I want this too" on wishlist games. Suggest a cover for a game that has none (§6). |
| Mods | Approve or reject the queue (adds and covers); hide or unhide a community pick; replace a cover. |
| Admins and owner | Everything: add without the theme check, edit, write reviews, set status, delete, upload a cover override. |

Staff controls (mods and admins) use the admin green. This widens green from "admin-only"
to "staff" (record in design-system.md §8).

## 3. Adding a game

**Input:** a Steam store link or app ID (main flow), an IGDB link, or a game's name (runs an
IGDB search and shows covers). Members never see the word "IGDB". If neither source knows
the game: **Add it by hand** (name + a link, optional cover suggestion), always queued.

**The server re-fetches everything itself** and never trusts details from the browser. It
runs these checks, stopping at the first that decides:

1. **Resolve.** Steam app ID → IGDB via external games. Editions (Deluxe, GOTY) fold into
   their main game.
2. **Duplicate.** `vaultKeys/igdb_{id}`, `vaultKeys/steam_{appid}` or a normalised title key
   `vaultKeys/title_{key}`. Match → "Already in the Vault", and a +1 is recorded once per
   member (`wants/{uid}`).
3. **Not a game.** Refused: DLC, non-standalone expansion, bundle, pack, update, mod, fork, or
   a Steam `type` other than `game`. Accepted: main game, remake, remaster, expanded game,
   standalone expansion, episode, season.
4. **Not real.** Release status cancelled or rumored: refused.
5. **Adult content.** Refused if any of: IGDB Erotic theme; IGDB age-rating descriptors for
   strong or explicit sexual content; Steam content descriptors 3 or 4. **Violence and gore
   never block.**
6. **Title** fails `isProfane()` (functions/lib/accounts/validate.js): refused.
7. **Horror theme on IGDB → added automatically.** No horror theme, Steam-only, or by hand →
   queued.

| Result | Member sees | Recorded |
|---|---|---|
| Added | "Added to the Vault" + link | Wishlist game, origin `community`, `addedBy.handle` |
| Already there | "Already in the Vault", "N people want it" | `wants/{uid}`, `wantedCount` +1 |
| Queued | "Sent for a quick check" | `vaultQueue/{id}` (kind `add`) |
| Refused | A plain reason. Adult and profanity refusals stay vague on purpose ("This game can't be added to the Vault.") | adminLog `refused` with uid (private, TTL) |

**Brakes:** 5 adds a day, 30 lookups an hour, per member. Queued adds don't count toward
the 5 unless approved. Hiding a member's community pick pauses their adding for 7 days
(`sites/{siteId}/members/{uid}.vaultAddPausedUntil`). Rejecting a queued add does not pause.

**The add dialog shows the checks** (round 2, D3): while `vaultAddGame` runs, the dialog
ticks off "Found it", "Not already in the Vault", "A full game", "Fits the Vault",
"Safe for the channel". The server returns which checks passed so the dialog can show
the real result, not a fake animation.

## 4. Data model

All under `sites/{siteId}/` (siteId `boomertanger`).

**`vaultGames/{slug}`** (public read; function writes only)

| Field | Notes |
|---|---|
| `title`, `sortTitle`, `slug`, `altNames[]` | Slug never changes once set. `sortTitle` drops "The"/"A". `altNames`: up to 5 from IGDB (acronyms like "RE2"), for search. |
| `status` | `playing` (green) · `finished` (lime) · `abandoned` (gray) · `wishlist` (gold) |
| `origin`, `addedBy` | `boomer` or `community`; `addedBy: { handle }` only (uid is private) |
| `wantedCount` | From `wants/{uid}` (function-written) |
| `summary` | IGDB, falling back to Steam's short description. Page credit: "Game info from IGDB". |
| `review` | `{ score 1–10, verdict ≤140, body ≤3000, updatedAt }`, admin only |
| `cover` | `{ source: igdb | steam | upload, igdbImageId?, steamAppId?, url?, publicId?, byHandle? }`, or absent (mascot fallback). See §6. |
| `releaseDate`, `releaseStatus` | Early access shows a tag |
| `timeToBeat` | `{ hastily, normally }` hours, from IGDB |
| `developers[]`, `publishers[]` | |
| `tags` | `{ auto: [...] }` from IGDB (perspective, modes, themes) + `{ boomer: [...] }` admin curated |
| `ids` | `{ igdb, steam, twitch }` (Twitch game id lets the Control Room set the category later) |
| `links` | steam, itch, gog, epic, official |
| `stats` | `{ streamCount, minutes, firstStreamedAt, lastStreamedAt }`, written by the stream trigger only |
| `legacy` | `{ streamCount, minutes, lastStreamedAt }`, admin-entered history from before the site; added into displayed stats |
| `hidden`, `createdAt`, `updatedAt`, `editedAt`, `editCount`, `statusChangedAt`, `metaFetchedAt` | |

**Support docs**
- `vaultGames/{slug}/private/source` (staff read): themes, game type, Steam content
  descriptors, age-rating flags, check results and reasons, the adder's uid.
- `vaultGames/{slug}/wants/{uid}` (no client read): `{ createdAt }`.
- `vaultKeys/{key}` (no client access): duplicate keys, created in the same transaction as
  the game.
- `vaultQueue/{id}` (staff read): `kind: add | cover`, the fetched candidate or the cover's
  pending asset, why it was queued, submitter handle (+ uid in a private field), createdAt.
- `public/vault` (public read): the summary doc, one read per visit. Card fields for every
  non-hidden game plus the tag list. Rebuilt by functions on every change. Must stay well
  under 1 MB (warn in logs above 700 KB).
- `vaultCache/{source}_{id}` (server only, TTL 7 days): lookup results.
- `vaultLimits/{uid}` (server only, TTL): counters for adds, lookups and cover suggestions.
- `private/vaultDigest` (server only): pointer to the open Latest updates digest (§8).

## 5. Functions (all JavaScript, `functions/lib/vault/*.js`, exported from index.js)

| Function | Caller | Does |
|---|---|---|
| `vaultLookup` | Verified members | Parse input, return up to 8 candidates with an "In the Vault" flag. Cached. 30/hour. |
| `vaultAddGame` | Verified members; staff skip check 7 | §3 checks, then the write in one transaction (game + keys + public/vault refresh queued). Accepts an optional `pendingCoverId` for by-hand adds. Returns the check list. |
| `vaultWant` | Verified members | `{ slug, on }`: add or remove the member's +1 on a wishlist game |
| `vaultReviewQueue` | Mods, admins | `{ id, decision: approve | reject | replace, reason?, replacementUploadId? }` for adds and covers |
| `vaultQueueList` | Mods, admins | Queue items, with short-lived signed URLs (10 min) for pending covers |
| `vaultHideGame` | Mods, admins | Hide/unhide a community pick; hiding starts the 7-day pause |
| `adminEditItem`, new kind `vaultGame` | Admins | Status, review, boomer tags, legacy counts, summary, links, cover override; field allowlist + adminLog |
| `vaultDeleteGame` | Admins | Standard order: Cloudinary, records, the game with subcollections, its activity events. Refused while any stream references the game ("Appears in N streams; set it to Abandoned instead"). |
| `vaultCoverSignature` | Admins, mods (replace) | Signed Cloudinary upload, public folder `game-vault/covers` |
| `vaultCoverSuggestSignature` | Verified members | Signed upload of type **authenticated** into `game-vault/pending` (§6) |
| `vaultCoverSubmit` | Verified members | Verifies the uploaded file (format, bytes, size) via Cloudinary, records it with `recordAssetCreated()`, creates a `cover` queue item |
| `vaultSweepPendingCovers` | Daily schedule | Deletes pending uploads never submitted within 24 h (through the approved delete path) |
| `vaultRefresh` | Weekly schedule | Re-fetch unreleased and early-access games |
| `onStreamWritten` | Trigger | See stream-object.md: recompute affected games' `stats`, refresh `public/vault`, move a streamed wishlist game to `playing` |

IGDB uses the existing Twitch app (`TWITCH_CLIENT_ID` param + `TWITCH_CLIENT_SECRET`
secret) and the growth collector's app-token helper; 4 requests/second max. Steam store
API needs no key. Keep the data source behind one module so it can be swapped.
**No new secrets.** Cloudinary uses the existing `CLOUDINARY_*` secrets.

**Logs:** adminLog (top-level `adminLog`, via `adminLogEntry`/`writeAdminLog`) feature
`gameVault`, actions `add`, `edit`, `status`, `review`, `hide`, `queue`, `cover`, `refused`,
`delete`. activityLog: §8.

## 6. Covers

- **IGDB games:** store only `igdbImageId`; the page builds the IGDB image URL at display
  time. Nothing stored on our side.
- **Steam-only games:** store `steamAppId`; the page loads Steam's portrait box art
  (`library_600x900`). The server checks it exists when the game is added; if not, no
  cover (mascot fallback).
- **Admin override / mod replace:** Cloudinary `game-vault/covers`, recorded with
  `recordAssetCreated()`. The previous upload (if any) is deleted after the new one is
  saved, never before.
- **Member cover suggestions** (confirmed): only for a game with **no cover** (showing the
  mascot), or as part of an Add it by hand. Never to replace an existing cover.
  - JPG, PNG or WebP; max 5 MB; at least 300 × 400 px; cropped to 3:4 in the browser
    before upload.
  - One pending suggestion per member per game; 3 suggestions a day.
  - Uploaded as Cloudinary type **authenticated** (not publicly reachable). Staff see it
    through signed URLs only.
  - **Approve:** the asset moves to public `game-vault/covers`, becomes `cover`
    (`source: upload`, `byHandle`), and the asset record is updated.
  - **Reject:** a function deletes the file immediately; the member sees the reason.
  - **Replace:** the mod uploads their own; the member's file is deleted.

## 7. Search and filters

Whole Vault in the browser from `public/vault`; no server calls.
- Forgiving matching (own small matcher in `shared/`, no library): typos, any word order,
  accents and punctuation ignored, acronyms via `altNames` and title initials. Searches
  title, alt names, developer, tags; title matches rank first. Tested by a check script
  ("grany" → Granny: Chapter Two, "sh2" → Silent Hill 2, "zeekers" → Lethal Company,
  "bunker amnesia" → Amnesia: The Bunker, "dead space" → none).
- Filters: status, tags, length (from `timeToBeat.normally`: Short ≤ 3 h, Medium ≤ 10 h,
  Long > 10 h), Community picks. Sort: Last streamed, Most streamed, Boomer's score, Most
  wanted, Newest, A–Z.
- State in the URL (`/games?q=…&status=…&sort=…`); `/` focuses search; no match turns into
  Add (visitors: Join free).
- Round 2 (pending confirmation): command panel under the search (games with matched
  letters lit, suggested filters, Add row, full keyboard), seg-nav status filter, removable
  filter tokens, cards that glide (FLIP) on change.

## 8. Latest updates (activityLog)

Uses the existing top-level `activityLog` collection and its shape
(`feature, type, summary, link, actorName, createdAt, …`), written only by functions.
Feature key `game-vault`.
- **Rolling digest** `type: "games-added"`: the first add opens an event; adds within the
  next 60 minutes update the same event (count + up to 3 titles and cover refs). After
  60 minutes the next add opens a new one. Pointer `sites/{siteId}/private/vaultDigest`,
  updated in a transaction. Wording: 1 game "X was added to the Vault"; several
  "10 games added to the Vault: X, Y and 8 more". Link `/games?sort=new`.
- Counts community picks, Boomer's adds, and queued games when approved. Hidden or deleted
  games leave their digest; a digest at 0 is removed.
- Separate events: `now-playing` ("Now playing: X") and `finished` ("Finished X. Boomer's
  score: 9").
- `activityLog` currently needs sign-in to read (rules). The new home tile reads it when
  it's wired up; whether visitors see it is decided then.

## 9. UI (summary; mockups are the source of truth)

- `/games`: GAMEVAULT feature bar (`.bt-wordmark--power`; the vault-dial icon rests, and on
  hover spins a combination and lights the lamp), Add a game (members), Queue + count
  (staff, green). Round 2: vault door hero (once per visit, never under reduced motion),
  ledger counts, shelves (Now playing, Most wanted with rank numerals and I want this too,
  Boomer's best, The ones that got away); grid when searching or filtering.
- Cards (round 2 C5 + C6): tilt + glare on pointer devices, verdict reveal on hover,
  caution tape (abandoned), pulse (playing), want stamp (wishlist), 10/10 ribbon.
- Game page `/games/{slug}` (round 2 E4): ambient banner, score dial (Boomer's gold),
  review, Every stream timeline, about + IGDB credit, facts, where to play, stats; admin
  Edit; staff Hide on community picks; "Suggest a cover" on mascot covers.
- `/games/queue` (round 2 F3): triage deck, keyboard A/R/S, add and cover cards.
- States: loading (spinning dial + wave skeleton), empty, no matches (flashlight), error.
- New kit pieces: see the mockups' section 9 lists (round 1 and round 2).

## 10. Edge cases

- IGDB down: "Search is having trouble, paste a Steam link instead"; Steam-only adds queue.
  Both down: "Try again in a few minutes."
- Steam returns nothing (delisted, region-locked): not found → Add it by hand.
- Two members add the same game at once: the `vaultKeys` transaction lets one win; the
  other gets a +1.
- IGDB renames a game: title updates on refresh, slug stays. A vanished record is flagged
  for an admin.
- A community pick gets streamed: status → playing; the "Community pick by @handle" credit
  stays.
- Account deletion (2b list): `addedBy` and `cover.byHandle` become "Deleted member"; the
  member's `wants` docs and pending cover suggestions are removed.
- Old games: admins add them with status and legacy counts, or `scripts/import-vault.js`
  from a CSV (dry run unless `--apply`).

## 11. Parts (one commit each)

1. Docs: this spec, stream-object.md, the two mockups, CHANGELOG, ROADMAP status.
2. Backend logic: source clients (IGDB, Steam), checks, matcher, digest and stream logic as
   pure modules, with check scripts in `npm run check`.
3. Backend wiring: callables, trigger, schedules, rules, indexes, TTLs; staging deploy.
4. Scripts: `import-vault.js`, `make-test-stream.js`; dry runs.
5. Site (after round 2 picks are confirmed): kit pieces + UI kit page, `/games`,
   `/games/{slug}`, the Add a game dialog, `/games/queue`, cover suggestions,
   design-system.md §5 and §8i.
