# Spec: The stream object — CONFIRMED (2026-10-02)

Defined in workstream 3 (Game Vault) so that workstreams 4 (Schedule Planner),
5 (Live Beacon and Control Room) and 6 (Stream Library) all fill in the same record.
This workstream builds: the data shape, the rules, the pure transition logic with its
check script, and the stats trigger the Vault needs. The callables that move a stream
through its life (planSlot, publishWeek, startStream, switchGame, stopStream,
cancelStream) are built in workstreams 4 and 5 against this spec.

## 1. Where it lives

`sites/{siteId}/streams/{streamId}`; the id is auto-generated. `slug` is the planned date
in the site's time zone (`2026-10-05`, then `2026-10-05-2` for a second stream that day)
and becomes `/tv/{slug}` later. Time zone: **America/Chicago** (from
`sites/{siteId}.timezone`); viewers see their own local time too.

## 2. States

| State | Meaning | Tone | Moved there by |
|---|---|---|---|
| `planned` | An open slot for next week, not public | blue badge | `planSlot` (4) |
| `scheduled` | Published to /schedule with its games and crew | gold badge | `publishWeek` (4) |
| `live` | Started in the Control Room | the red `.bt-live-tag`, not a badge | `startStream` (5); ad hoc streams are born here with `adhoc: true` |
| `ended` | Stopped | lime badge | `stopStream` (5), or auto-ended after 12 h with `autoEnded: true` |
| `cancelled` | Dropped; kept as a record | gray badge | `cancelStream` (4) |

"In the Library" = `ended` and `hidden != true`. Not a separate state.

## 3. Fields

- **Times:** `plannedStart`, `plannedEnd`, `actualStart`, `actualEnd` (UTC timestamps), `tz`,
  `week` (ISO week in the site's time zone, e.g. `2026-W41`).
- **Basics:** `title`, `description`, `platforms` (`twitch`, `youtube`, `tiktok`).
- **Planned games:** `plannedGames[]` of `{ gameId, title, order, source: { kind: owner | suggestion | wishlist, suggestionId?, byHandle? }, outcome: played | skipped | null }`, plus `plannedGameIds[]` for queries.
- **Games played:** `segments[]` of `{ gameId | null, kind: game | break, title, startedAt, endedAt }`, max 30, plus `gameIds[]` (played games only).
- **Crew summary:** `crew: { lead, platforms: { twitch: { lead, helpers[] }, … }, caps }`. Sign-ups live in a subcollection defined by the Planner spec.
- **Reserved for later:** `vods: { youtube: [], twitch: [] }`, `clips[]`, `stats` per platform (`peak`, `avg`).
- **Flags and audit:** `published`, `hasUnpublishedChanges`, `adhoc`, `autoEnded`, `hidden`, `rev`, `createdAt`, `updatedAt`.

**Unpublished changes stay private:** the public doc holds only the published version. The
owner's working copy is `streams/{id}/private/draft` (admins and mods can read it; mods
need it to sign up as crew). Publish copies the draft into the public doc.

## 4. Rules

- Everyone may read a stream when `published == true`; clients must query with that filter.
- Admins and mods read every stream and `private/*`.
- No client writes anywhere.
- Index: `gameIds` array-contains + `actualStart` desc (a game's streams).

## 5. Logic and stats

- `functions/lib/streams/logic.js`: pure functions for allowed transitions, closing the
  open segment, computing outcomes, validating fields, computing per-game minutes from
  segments, and the 12-hour auto-end. Checked by `functions/scripts/check-streams.js`
  (part of `npm run check`). Workstreams 4 and 5 call these instead of re-deriving them.
- `onStreamWritten` (trigger): when a stream enters or leaves `ended`, or its segments
  change, recompute `stats` for each affected Vault game from that game's ended streams
  (recompute, never running totals: self-healing), refresh `public/vault`, and move a
  `wishlist` game that was played to `playing` (adminLog `status`, actor "Automatic").
  Also posts the Vault's `now-playing` activity event the first time a game is played.
- Corrections to an ended stream's times come later as admin corrections (adminLog) and
  re-run the stats.

## 6. Edge cases

- A stream left live: auto-ended at 12 hours (`autoEnded: true`); the Control Room offers a
  correction.
- A game deleted from the Vault: refused while any stream references it.
- Account deletion: `source.byHandle` becomes "Deleted member" (2b list).

## 7. Test helper

`functions/scripts/make-test-stream.js` (staging only; refuses any other project): creates
an ended, published test stream with segments for given Vault game slugs, so the stats
trigger can be tested before the Control Room exists. `--remove` deletes the test streams
it made (marked `test: true`).
