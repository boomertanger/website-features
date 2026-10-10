# Chat Games spec (docs/specs/chat-games.md)

Confirmed Oct 9, 2026 (owner: @boomertanger). Workstream 5b. **Part 1 (engine and registry) built on staging, Oct 2026**; the spec was reconciled with the code in part 1 (§2, §3, §9, §11, §12, §13). Approved mockups: docs/design/mockups/chat-games-batch-1.html (Would You Rather, Predictions, launch panel, pool) and docs/design/mockups/chat-games-how-it-works.html (the How Chat Games work page); Questions and Hot Seat are in docs/design/mockups/control-room-batch-4.html.

## 1. Summary and decisions

Chat Games is one service and one engine for everything members do live with a stream: Questions (the queue) and every Chat Game. It is workstream 5b, absorbs Mod Machina phase 4, and fills the slots the Control Room already left for it.

Sources: control-room.md §2, 7, 8, 9, 12, 13, 15 (the launch panel, Play panel and stream view slots), mod-machina.md §6, §11, §17a (Mod Deck), design-system.md 8p, mockup control-room-batch-4.html (Questions page, Hot Seat run and play panels, stream view, séance board and wheel).

**Decided Oct 8-9, 2026:**

1. One service, one engine. Members see two names: **Questions** and **Chat Games**. "Crew-hosted" is a property of a game. "Live activities" is retired as a name.
2. Build order: Questions and Hot Seat; then Would You Rather and Predictions; then Caption This; then the crew-hosted games (Dead Air, Scream Off, Scare Bingo, Body Count); later Spirit Board, Dare Deck, Haunted Trivia, Scream-o-meter, next-game vote, Polls, Last Words, Beat Goal, Clip it!.
3. Questions rules as in §4.
4. Hot Seat rules as in §5; pickers W2 Séance board (default) and W1 Wheel per round.
5. Rewards through the Trophy Room's `grant()` with keyed ledger ids; the 100 XP per member per stream cap is shared with the Control Room; nothing costs anything to enter (members can be 13: no wagering). Games run on the site because Twitch polls and predictions only reach Twitch viewers.
6. One game or Questions session on stream at a time. The Captain runs them, mods on duty moderate, the owner can do everything.
7. Quick formats first release: Would You Rather and Predictions. Caption This follows as its own part.
8. Predictions are settled by a mod on duty proposing the result and the Captain or owner confirming. Unsettled at Stop = void. A result can be corrected once.
9. The Hot Seat deck lives in the Chat Games pool at `/crew/games` as card packs; mods suggest cards into a Suggested lane, the owner approves.
10. Would You Rather and Predictions prompts come from packs or are typed live, with "Save to pack".
11. XP: Would You Rather 3 for voting; Predictions 3 for locking, +10 if correct.
12. Crew-hosted games plug into the Mod Deck through the generic cue contract in §9, agreed with the Mod Deck build; each crew-hosted game gets an addendum to this spec.
13. Stream view: Would You Rather is R2 Two cards; Predictions is P1 Odds board (§14).
14. How Chat Games work is its own story page at `/live/chat-games` with hero H2 Live wall (§14a).

## 2. Names, pages and who can do what

| Page | Who | What Chat Games adds |
| --- | --- | --- |
| `/live` (Bridge) | Everyone; playing needs a free account | The Play panel: the running game or Questions session, Ask a question, Put me in (Hot Seat volunteers), the "Waiting on" strip for locked Predictions, a "How Chat Games work" link. Visitors see "Join free to play". |
| `/live/questions` | Everyone reads; members ask and vote | The two lanes (Tonight, Standing), My questions, the mod queue for held questions. |
| `/live/control` (Cockpit) | Owner and A2+ (actions when Captain) | The launch panel tiles and the run controls for the active game. The page is owner and A2+ only; an A2+ who isn't the Captain sees the tiles read-only. Captains who aren't A2+ start and end games from the Deck. |
| `/live/obs` | Streamlabs / TikTok LIVE Studio | Stream view scenes: question card, Hot Seat picker and reveal, Would You Rather cards, Predictions board, waiting chip. |
| `/live/deck` (Mod Deck) | Crew on duty | Launch tiles from the format registry (Captain and owner act; Deckhands read; "running" comes from `public/live.chatGame` as well as `private/duty.chatGames.activeRunIds`, so a Captain of any grade can end any game here), mod actions for Questions, Hot Seat answers and Prediction calls, and the cue slot (§9). The Deck loads `shared/ui/chatgames.js`. |
| `/crew/games` | Crew (Watcher+); pack drafts Wardens+ | The pool: formats, packs (Hot Seat decks, Would You Rather and Predictions packs), Suggested lane. Votes and pledges come later. |
| `/live/chat-games` | Everyone | How Chat Games work (§14a). |
| Site-wide live banner | Everyone | "Hot Seat is running · join in" while a game runs. |

| Role | Can do |
| --- | --- |
| Visitor | Watch, read Questions, see results, try the examples on /live/chat-games. No asking, voting or playing. |
| Member (13+) | Ask (3 open), vote on questions, volunteer and play Hot Seat, vote in Would You Rather, pick in Predictions. Earns XP. |
| Mod on duty | Approve, Hide, To Standing, Merge questions; hide a Hot Seat answer before reveal; propose (call) a Prediction result; suggest cards. Can play, but earns no game XP that stream (Gears for hosting instead, §11). |
| Captain (this stream: `captainNow.uid` on the stream's duty doc, whatever their grade) | Start, Swap, Skip, End any game or Questions session; run Questions (Answered, Skip, Pin next); pick Hot Seat cards and picker style; confirm Prediction results; type live prompts; Save to pack as a suggestion. |
| Owner | Everything above on any stream; write and approve packs and cards; correct a settled result. |

## 3. The engine

Every game and every Questions session is a **run**: one document under `runs/{runId}` that moves through the same states, driven only by Cloud Functions. Formats differ in what happens inside a state, not in the state machine.

**Run states:** `ready` (created by Start; a picker draw or pack choice happens here) → `open` (members act; `closesAt` when timed) → `locked` (input closed; waiting for a reveal or a result) → `revealed` (result on stream; XP granted now) → `ended`. `void` = ended without a result (Swap, End early, Stop, unsettled Prediction); no XP.

A format may loop states in rounds (Hot Seat: pick → answer → vote → reveal, per card; Would You Rather: one prompt per round) by keeping `round` on the run; each round has its own sub-state in `runs/{runId}/rounds/{n}`.

**One at a time.** `public/live.chatGame = { runId, formatId, state, round, title }` points at the active run. It is stored in `streams/{streamId}/private/control.chatGame` (function-written) and copied into `public/live` by the Control Room's `buildPublicLive`, because `publishLive` rebuilds and overwrites `public/live` in full: every writer keeps the field, and the stream view's `obsFeed` gets it too. It replaces the never-written `activity` field. It is only present while the stream is live; Start refuses when it is set ("Hot Seat is running. End it first or use Swap"). Swap = void the current run and start the new one, in one callable. The Mod Deck launch tiles read this pointer. A locked Prediction does not hold this slot (§7). Crew-hosted runs also appear in `streams/{streamId}/private/duty.chatGames.activeRunIds` (§9).

**Timers.** Deadlines are server timestamps (`closesAt`). Clients count down from them; a Cloud Task (`chatGameDeadline`, `onTaskDispatched`, the same default region as `liveFlush`; one task per deadline) closes the state on the server, so a closed laptop never leaves a run open. A task whose deadline was moved (pause, next round) does nothing. `liveTick` (every minute) sweeps any deadline a task missed, so a queue failure costs at most a minute. A client action after the deadline is refused by the callable.

**Gating.** Every member action needs: signed in, not banned, the stream live (`streams/{id}.state == "live"`; Break is a beat inside live, and the after-show counts), and, where a format says so, checked in to the current beat (Hot Seat picking and voting): `streams/{id}/presence/{uid}.beats[<current beat>]` exists. Checks run in the callable; the client only hides buttons.

**How pages follow a run (reads).** Pages never poll a run. They follow it with live listeners (`site/src/scripts/live/cg-watch.ts`), the same pattern as `lib/live.ts` (the one `public/live` listener per tab) and the Mod Deck:
- The full `firebase/firestore` is imported the first time a game needs it (the rest of the site stays on Firestore Lite).
- There is one listener per document per tab, let go after the tab has been hidden for a minute and reopened when it comes back.
- Only the run doc and the current round doc are watched. Hot Seat's Play panel needs the run doc alone: its `display` carries the seats, the nameless answers and the results. The Hot Seat run panel watches the run and the current round. Questions watches the run and the question on stream, because votes change the question, not the run.
- Everything else is a one-off Lite read when a watched doc changes: a member's own play, check-in and Put me in; the staff answers; my vote on the card. Countdowns tick locally from `closesAt`.
- About 100 viewers × a handful of changes per round: hundreds of reads per game, not tens of thousands.
- The crew-only Questions run panel re-reads Up next with each run change and every 15 s while visible. `/live/questions` reloads when `public/live.chatGame` changes (the shared listener), with a backstop every 30 s while the stream is on (my votes read once per question).
- The stream view never reads Firestore (it reads `obsFeed`).

**Stop.** When the Control Room's Stop runs (its `afterEnd`, shared by Stop, the 12-hour auto-end and the after-show handover), Chat Games clean-up (`closeOut`) voids any open run, settles Questions (§4), voids unsettled Predictions, clears `public/live.chatGame` and `private/duty.chatGames`, and writes the night's results to `streams/{streamId}.chatGames` for the Stream Library.

**Plug-in points** (as named in control-room.md; reconciled in part 1):

- Launch panel on `/live/control` (`scripts/live/control-games.ts` fills the Control Room's `launchHtml` slot): one tile per enabled format from the registry plus the running one from `public/live.chatGame`; Start opens the format's launch dialog, End confirms then calls `chatGameEnd`.
- Play panel on `/live`: renders the active run by `formatId` through `shared/ui/chatgames.js`.
- Stream view `/live/obs`: a Chat Games scene per format while a run is `open`, `locked` or `revealed`, returning to the previous scene 8 s after `ended`. The page reads `obsFeed` (never Firestore), which carries `chatGame`; the scene mounts in `[data-cg-scene]`.
- Mod Deck: launch tiles, mod actions, cue slot.

`shared/ui/chatgames.js` exposes `window.btChatGames = { openLaunch({ formatId, streamId, title }), end({ runId, title }), mountPlay(el, { chatGame }), mountScene(el, { chatGame }) }`, the only entry point the Control Room and the Mod Deck call. The site installs it with its callable, toast and mascot (`initChatGames`); each format plugs its launch dialog, Play panel and scene in with `registerFormat(formatId, { launch, play, scene })`.

## 4. Questions

The member queue for things to ask on stream, at `/live/questions`, with a session the Captain runs from the launch panel.

**Lanes.** Standing (asked any time) and Tonight (asked while live). A question is in exactly one lane. At Stop, Tonight questions with 5+ votes move to Standing; the rest are cleared (status `cleared`, kept 30 days, then deleted by TTL). Standing questions unanswered for 30 days are archived.

**Asking.** 200 characters, plain text, at most 3 open questions per member (open = held, Tonight or Standing). Accounts under 7 days old are held for a mod (`held`). One vote per member per question; a vote can be taken back. Members can't vote on their own question. The asker can withdraw an unanswered question.

**Mod actions** (mods on duty, Captain, owner; all to adminLog): Approve (held → lane), Hide (asker sees "Hidden by a mod"), To Standing (Tonight → Standing), Merge (votes fold into the target with each voter counted once; the merged question shows "Merged into…" to its asker and frees their open slot).

**Sessions.** Default 10 minutes (5, 10, 15 or open-ended). Order: Tonight by votes, then Standing by votes; ties by oldest. Controls: **Answered** (asker gets 15 XP), **Skip** (back to its lane, not shown again this session), **Pin next**. The card shows "asker is here" when the asker checked in to the current beat. When the timer ends, the current card can finish; then the run ends.

**On stream.** `.bt-qcard` with the text, the asker's handle and avatar, votes and the "asker is here" mark.

**Statuses** (site badge system): held = teal, Tonight = blue, Standing = gold, answered = lime, hidden / merged / cleared / archived = gray. A withdrawn question is `withdrawn` (asker and crew only; deleted after 30 days like `cleared`).

**As built (part 2).** `questions/{id}` keeps `status` (one of the above) and `lane` (where a held question goes when approved). Moderating: the owner, the Captain and crew clocked in while live; **off air, admins and mods** (so held questions never wait for a stream). "Not banned" can't be checked yet: the site has no ban flag; add the check when one exists. The session's card on stream is the run's public `display` ({ questionId, text, handle, votes, here, lane, next, ending }); the pointer's `round` counts cards, so a new card redraws every page. The stream view gets the card through `obsFeed` (`chatGameDisplay`). Night Shift event: type `stream` with `action: "question-answered"` (the existing Stream presence type; there is no Chat Games type yet).

## 5. Hot Seat

Three members answer the same card; everyone checked in votes; the winner gets 25 XP. Run by the owner or the Captain.

**Start.** Pick a pack (default: the pack tagged to tonight's Game Vault game, else General) and rounds (1 to 5, default 3). The launch dialog shows the first card; Skip card draws another.

**Each round**

1. **Pick** (`ready`). The server draws 3 from members checked in to the current beat plus volunteers ("Put me in" on the Play panel while Hot Seat is running). Nobody is picked twice in one stream; anyone replaced can be drawn again. The stream view shows the draw: W2 Séance board by default, W1 Wheel when the Captain switches for that round. The animation only shows the server's draw.
2. **Accept** (15 s). Each picked member taps **I'm in**. No tap = replaced by a new draw; if the pool is empty, the round runs with 2. Fewer than 2 = the round is void and the next card comes up.
3. **Answer** (60 s, 140 characters). Hidden from everyone but mods until the reveal. A mod can hide one before reveal (that player is out of the round, no XP, logged). No answer = out of the round.
4. **Vote** (30 s). Everyone checked in to the beat votes once, not for themselves; players vote too. Answers show without names until the reveal.
5. **Reveal.** Names and vote counts; winner 25 XP, other players 5. A tie: every tied player wins 25. No votes at all: everyone who answered gets 5, nobody wins.

**Deck.** Cards come from Hot Seat packs (§10). A card used on stream is marked used with the stream id; the draw skips cards used in the last 30 days unless the pack runs out.

**Moderation.** Answers pass the same text filter as Questions (blocked words, links refused). Hidden answers never reach the stream view. Answers from accounts under 7 days are not held.

**Edge.** Fewer than 2 eligible at Start: a warning; the Captain can start anyway and the first round waits 30 s for volunteers.

**As built (part 4).** The run carries `phase`: `starting`, `waiting` (round 1 only, 30 s, when fewer than 2 can play), `accept` (15 s), `answer` (60 s), `vote` (30 s), `reveal`, `void`, `over`; the engine's `state` stays `open` until the reveal moves it to `revealed` (Next round moves it back). Hot Seat runs its own phases: its handler's `onDeadline`, `control` and `play` return `{ handled: true, closesAt }` and the engine only schedules the next deadline and syncs the pointer. A phase change is claimed in a transaction (`busy:<phase>`, stale after 30 s), so the deadline task, the liveTick sweep and an early finish (every seat in, every answer locked) never advance a round twice. The pool is members checked in to the current beat (`presence.beats[beat]`) plus `volunteers/{streamId}_{uid}` (Put me in also works before checking in), minus `hotSeatPicked/{streamId}.uids` (nobody twice in a stream; a replaced player is taken off that list so they can be drawn again). No tap in 15 s: the seat is `replaced` and a fresh draw fills it, at most 2 replacement draws per round; after that the round runs with whoever tapped (2 or more) or is void. The card is drawn and `markUsed` when the round starts (the launch dialog's first card is passed as `cardId`). Paths: `runs/{id}/rounds/{n}` = `{ n, cardId, card, picker, phase, seats: [{ seat, uid, handle, volunteer, status: picked | in | answered | out | hidden | replaced }], board (up to 10 handles for the picker), answers (vote: `[{ id, text }]` without names), results (reveal), noVotes, closesAt }`; `secret/r{n}` = `{ answers: { uid: text }, votes: { voterUid: answerId }, idMap: { answerId: uid } }`; `staff/r{n}` = `{ answers: { uid: { text, handle } }, hidden: { uid: { by, byHandle, at } } }`; `plays/{uid}` = `{ round, r: { <n>: { seat, answer, answerId, vote, result } } }` (per round, so a member's own answer is marked in the vote). The run's `display` (and obsFeed's `chatGameDisplay`) = `{ kind: "hot-seat", phase, round, rounds, card, picker, board, paused, seats: [{ handle, status }], answers, noVotes }`: answers have no names until the reveal and hidden answers never appear. Votes: a player in the round or a member checked in to the beat, once, not their own. Reveal: `grantXp(uid, 25 | 5, { feature: "chatGames", ref: "{runId}:{n}" })` through the shared stream cap (`presence.xpEarned`); crew clocked in get none (`crew: true`); Night Shift `stream` event `action: "chat-game-played"` for each player; activityLog `chat-game-won` for each winner. A mod's Hide (chatGameModerate: owner, Captain, anyone on `private/duty.onDuty`) before the reveal marks the seat `hidden`, takes the answer and its votes out of the vote, writes `staff/r{n}.hidden` and adminLog `hotSeat:hide`. Pause stores the time left and clears `closesAt`; Resume sets `closesAt = now + left`. Controls: `nextRound` (after a reveal or a void; on the last round it ends the run), `skipCard` (waiting or accept), `picker` (`nextPicker`, used from the next round), `pause`, `resume`. Kit: `.bt-seance` (`shared/ui/seance.js`) and `.bt-wheel` (`shared/ui/wheel.js`); the stream view keeps their motion (`data-motion="always"`). The panels follow the run with live listeners (§3 "How pages follow a run"), never by polling.

## 6. Would You Rather

One prompt, two options, members vote, the split shows on stream. 3 XP for voting; no right answer.

- **Prompt source.** A Would You Rather pack, or typed live by the Captain or owner: two options of 80 characters plus a lead line (default "Would you rather…"). A typed prompt offers **Save to pack** after the round (owner saves straight in; the Captain's save lands in the pack's Suggested lane).
- **Open** 45 s (30, 45 or 60). Any member votes, checked in or not, and can change until it closes. The running split is hidden until the reveal.
- **Reveal.** The split on the Play panel and stream view; 3 XP to every voter.
- **Chaining.** "Next prompt" starts another round in the same run.

## 7. Predictions

A question about what happens next on screen, 2 to 4 answers; members pick; a mod calls the result and the Captain or owner confirms. 3 XP for a locked pick, +10 if right.

- **Prompt source.** Usually typed live (question up to 120 characters, 2 to 4 answers of 40); packs hold reusable ones, taggable to a Game Vault game. Save to pack as in §6.
- **Open** until the Captain taps **Lock**, 3 minutes at most. Members can change their pick until it locks. Picks per answer are hidden until the lock.
- **Locked.** Waits for its result for as long as the stream runs. It does **not** hold the one-at-a-time slot; it shows as a "Waiting on: …" strip on the Play panel and a chip on the stream view. At most 3 locked Predictions at once.
- **Settle.** A mod on duty taps what happened (**Propose**; shown to the Captain and owner, not to members). The Captain or owner taps **Confirm** or **Reject** (clears the proposal), or settles directly. Confirm = `revealed`: result on stream, XP goes out.
- **Void.** The Captain or owner can void; at Stop every unsettled Prediction is voided. No XP; logged.
- **Correct once.** In the same stream, the owner or Captain can change a confirmed result once: the first winners' +10 is reversed and the new winners are granted (§11). Then it's final.

## 8. Caption This (next) and later formats

Caption This ships as its own part after Would You Rather and Predictions, with a short addendum first: where the frame comes from (stream still, Captain upload or pack image, all via Cloudinary with `recordAssetCreated()`), how captions are shortlisted (likely mods, then a member vote) and the moderation load. The engine already supports it.

Later formats (no spec yet): Spirit Board, Dare Deck, Haunted Trivia, Scream-o-meter, next-game vote, Polls, Last Words, Beat Goal, Clip it!.

## 9. Crew-hosted games and the Mod Deck contract

Agreed with the Mod Deck build (mod-machina.md §17a) on Oct 9.

**Finding the run.** Chat Games writes `streams/{streamId}/private/duty.chatGames = { activeRunIds: [runId] }`, function-only, listing only runs that send cues (crew-hosted formats), at most one id. No id = the Deck's cue slot renders nothing; an id but no cues for the room = "No cues for your room yet".

**Cue docs** at `chatGames/main/runs/{runId}/cues/{cueId}`:

| Field | Type | Notes |
| --- | --- | --- |
| room | twitch \| ytLandscape \| ytVertical \| tiktok \| site | The room the cue is for |
| order | number | Deck sorts by it |
| kicker | string | The small line above the text on the Deck's card (the format's title) |
| text | string | Exactly what to paste in chat; never an answer |
| dueAt | timestamp, optional | Shown in gold |
| status | pending \| posted \| done | |
| postedBy, postedAt, doneBy, doneAt | uid, timestamp | Set by the callable |

Crew claims read; no client writes. Pack answers stay server-only until the reveal.

**`chatGameCue({ runId, cueId, action: "posted" | "done" })`** — allowed for the member on duty in that cue's room (one of `private/duty.onDuty[uid].roles[].room`, and not away), the Captain (`captainNow.uid`) or the owner. Pays the "Hosted a Chat Game in your room" +5 Gears via `grantGears` with key `chatGame:{runId}:{uid}`, once per game per mod (first Posted).

**Deck behaviour.** Room Lead and Captain get Posted and Done; Deckhands see cards without buttons; the Captain can switch rooms; the owner sees all rooms. The Deck builds `.bt-cue-card`. The Deck reads a cue's `status` (and the older `posted` / `done` booleans) and treats a run in `ended` or `void` as over. A second tap gets "Already done by @handle".

**Launch tiles.** The Deck reads `chatGames/main/formats/{formatId}` (title, blurb, icon, crewHosted, needsPack, minLeads, enabled, order) and `public/live.chatGame`. Start, Swap and End are for the Captain and owner and call `window.btChatGames.openLaunch` / `.end`; without the module the slot renders nothing. The Deck hard-codes no games. The running tile comes from `public/live.chatGame` (any format) or, for crew-hosted runs, `private/duty.chatGames.activeRunIds`.

## 10. Packs and the pool at /crew/games

The pool from mod-machina.md §11c-11g, starting with what Hot Seat, Would You Rather and Predictions need. Crew votes, host pledges and the Planner slot arrive with the crew-hosted games.

- **Formats** (`formats/{formatId}`): the registry. First rows `questions`, `hot-seat`, `would-you-rather`, `predictions`, each `enabled: false` until its part ships. The owner toggles `enabled` on `/crew/games` (green admin control).
- **Packs** (`packs/{packId}`): formatId, title, vaultGameIds, status draft | approved | retired, cards `{ id, text, options?, usedOn[] }`. Hot Seat starts with one pack, "General".
- **Who writes.** The owner creates and edits directly (approved on save). Wardens+ draft whole packs. Any mod (Watcher+) can suggest a card into an approved pack.
- **Suggested lane.** Card text, who, Approve (green), Edit then approve, Reject (optional reason; the mod sees "Not used this time"). Approval pays the mod +2 Gears (key `cardSuggest:{cardId}`).
- **Draw rules.** Skip cards used in the last 30 days unless none are left; the launch dialog always offers Skip card and, for Would You Rather and Predictions, Type my own.
- **Page shape.** Tool page: hero header with a small scene (fanned cards and the mascot), format tabs (`.bt-seg-nav`), pack list, card rows, the Suggested lane; empty states with the mascot; a celebratory moment on approve.
- **As built (part 3).** Cards are `{ id, text, options?, usedOn: [{ streamId, at }] }`: Hot Seat `text` (140); Would You Rather `text` is the lead line (80, "Would you rather…" when empty) plus two `options` of 80; Predictions `text` is the question (120) plus 2 to 4 `options` of 40. The same text filter as Questions (the profanity list, no links). Suggestions: `packs/{packId}/suggested/{id}` = `{ text, options?, formatId, packId, by, byHandle, createdAt, status: pending | approved | rejected, reason, cardId? }`, at most 10 pending per mod per pack, approved packs only. "Wardens and up" includes admins. Deleting a card: the owner, only a card with no `usedOn`; used cards are edited. Packs are never deleted (op `retire`). The owner's format switches use a small owner-only callable, `chatGameFormatSet({ formatId, enabled })`, which writes `enabled` only (not `adminEditItem`, which is admin-wide and lives in the shared `functions/index.js`). Draw helper for parts 4 and 5: `draw(packId, { skip })` picks at random among cards not used in the last 30 days, else the one used longest ago; drafts and retired packs are never drawn; `markUsed(packId, cardId, streamId)` records the use. The page is in the crew bar (Games) and on Crew HQ ("Chat Games pool: Suggest cards for Hot Seat and more").

## 11. Rewards

All XP goes through the Trophy Room's `grantXp(uid, amount, { feature: "chatGames", ref, reason })`; the ledger id is `chatGames:{ref}:{uid}` (a retry never pays twice). It counts toward the shared 100 XP per member per stream cap: the Control Room's `capPayout` against `streams/{streamId}/presence/{uid}.xpEarned`, which Chat Games increments too (with a merge, so a member who never checked in still gets a counter). Over the cap nothing is granted (`grantXp` refuses 0); the play doc is marked `capped: true` and the member sees "Tonight's XP is maxed". Nothing costs anything to enter.

| What | XP | Ledger id (`ref` in brackets) |
| --- | --- | --- |
| Your question answered on stream | 15 | `chatGames:q:{questionId}:{uid}` |
| Hot Seat round winner (ties all win) | 25 | `chatGames:{runId}:{round}:{uid}` |
| Hot Seat player, not winning | 5 | `chatGames:{runId}:{round}:{uid}` |
| Would You Rather vote | 3 | `chatGames:{runId}:{round}:{uid}` |
| Predictions locked pick | 3 | `chatGames:{runId}:lock:{uid}` |
| Predictions correct | +10 | `chatGames:{runId}:win:{uid}` |

Correcting a Prediction: reverse with `chatGames:{runId}:win-rev:{uid}`; new winners get `chatGames:{runId}:win2:{uid}`. Lock XP stays. `grant.js` has no XP reversal yet (only `revokeBadge`); part 5 adds one.

Mods clocked in for the stream earn no game XP; hosting pays Gears through `grantGears(uid, source, ref, amount, { key })` (`lib/crew/gears.js`): +5 per crew-hosted game (source `chatGame`, key `chatGame:{runId}:{uid}`, a Chat Games constant); +2 per approved card (source `cardSuggest`, added in part 3).

Hooks: Night Shift events `chat-game-played` and `question-answered`. Stream Moments badges come with the crew-hosted games.

## 12. Data model

Everything under `sites/boomertanger/chatGames/main/`, function-written unless noted. Firestore stays deny-all by default.

| Path | Holds | Read by | Client writes |
| --- | --- | --- | --- |
| `formats/{formatId}` | Registry plus rules (timers, XP) | Everyone | None |
| `packs/{packId}` | Pack and cards (no answers) | Crew | None |
| `packs/{packId}/suggested/{id}` | Suggested cards | Crew | None |
| `questions/{questionId}` | text, uid, handle, lane, status, votes, createdAt, streamId, mergedInto, expireAt | Everyone (held and hidden: asker and crew) | None |
| `questions/{questionId}/votes/{uid}` | One vote: `{ at }` (`{ at, fromMerge }` when Merge copies it) | That voter | Create or delete own vote only: `{ at: request.time }` and nothing else, a signed-up member, on a Tonight or Standing question that isn't their own; count kept by `onQuestionVote` (a copied merge vote is already counted) |
| `runs/{runId}` | formatId, streamId, state, round, closesAt, packId, cardId, prompt, options, startedBy, env, result after reveal | Everyone | None |
| `runs/{runId}/rounds/{n}` | Round state, players, deadlines, tallies after reveal | Everyone (answers and running tallies hidden until reveal) | None |
| `runs/{runId}/secret/{doc}` | Answers before reveal, running tallies, picker pool, proposals | Functions only (proposals mirrored to crew via `runs/{runId}/staff`) | None |
| `runs/{runId}/staff/{doc}` | Prediction proposal, hidden-answer list | Crew | None |
| `runs/{runId}/plays/{uid}` | A member's vote, pick, answer status | That member; crew | None |
| `runs/{runId}/cues/{cueId}` | §9 | Crew | None |
| `volunteers/{streamId}_{uid}` | Hot Seat "Put me in" `{ uid, handle, streamId, at }` | That member (`resource.data.uid`) | None |
| `hotSeatPicked/{streamId}` | `uids` picked this stream (nobody twice) | Functions only | None |

Also written: `streams/{streamId}/private/control.chatGame` (copied to `public/live.chatGame`), `streams/{streamId}/private/duty.chatGames.activeRunIds`, `streams/{streamId}.chatGames`, adminLog (key `chatGames`), activityLog (`chat-game-won`, `question-answered`).

## 13. Callables, triggers and logs

Functions in `functions/lib/chatGames/*.js`. Every callable checks auth, role and stream state; every staff action writes adminLog under `chatGames`.

| Callable | Who | Does |
| --- | --- | --- |
| `questionAsk` | Member | Post a question (limits, filter, 7-day hold) |
| `questionWithdraw` | Asker | Withdraw own unanswered question |
| `questionModerate` | Mod on duty, Captain, owner | Approve, Hide, To Standing, Merge |
| `chatGameStart` | Captain, owner | Start a run (refuses if one is active) |
| `chatGameSwap` | Captain, owner | Void the active run and start another |
| `chatGameEnd` | Captain, owner | End or void the active run |
| `chatGameControl` | Captain, owner | Answered, Skip, Pin next, Next round, Lock, Reveal now, Pause/Resume, Skip card, switch picker |
| `chatGameVolunteer` | Member | Hot Seat Put me in / take back |
| `chatGamePlay` | Member | Accept seat, answer, vote, pick |
| `chatGameModerate` | Mod on duty, Captain, owner | Hide a Hot Seat answer before reveal |
| `predictionPropose` | Mod on duty | Propose the result |
| `predictionSettle` | Captain, owner | Confirm, reject, settle directly, void, correct once |
| `chatGamePackSave` | Owner (Wardens+ drafts) | `op`: create, edit, addCard, editCard, deleteCard (owner, unused cards only), approve and retire (owner); Save to pack |
| `chatGameFormatSet` | Owner | Switch a format's `enabled` on or off (/crew/games) |
| `chatGameCardSuggest` / `chatGameCardDecide` | Mods / owner | Suggested lane |
| `chatGameCue` | §9 | Posted / Done |

Triggers and tasks: `onQuestionVote` (counts), deadline tasks, Stop clean-up (§3), daily 05:15 America/Los_Angeles archive of Standing questions older than 30 days (`questionArchive`, from `standingSince`). Questions session controls go through `chatGameControl`: `answered`, `skip`, `pinNext` (data `questionId`) and `nextRound` (bring up the next card when none is on screen); `answered` and `skip` carry the `questionId` the staff member saw, so a second tap gets "Already done by @handle".

"Mod on duty" = clocked in for the current stream (`private/duty.onDuty`), or the Captain, or the owner. "Captain" in every Chat Games callable = `captainNow.uid` on the stream's `private/duty`, whatever the person's grade; the owner is always allowed. adminLog uses feature `chatGames` (its own helper; the Control Room's `logAdmin` is `controlRoom`).

## 14. UI states and bt-ui components

All live pages use bt-ui and both Control Room looks (hull, crt) through `data-look`; looks never change colour meaning, the heading ladder or what's clickable. Container queries only (1024 / 640 / 420). Reduced motion keeps colour and glow and drops movement on the site; the stream view keeps its motion.

**New kit pieces** (in `shared/bt-ui.css`, `shared/ui/*.js` and the UI kit page):

| Piece | Use | States |
| --- | --- | --- |
| `.bt-qcard` | Question card in lanes, sessions and the stream view | held, tonight, standing, on stream, answered, hidden, merged; asker is here; voted |
| `.bt-seance` | Hot Seat picker W2 | idle, drawing, landed, replaced |
| `.bt-wheel` | Hot Seat picker W1 | idle, spinning, landed |
| `.bt-choice` | One tappable option: Would You Rather A/B (with an OR badge), Predictions 2-4, later Polls | open, picked ("✓ Your pick"), locked, revealed (gold fill + percentage), correct (lime), out (dimmed), void |

Reused: `.bt-cue-card` (Mod Deck), `.bt-launch`, `.bt-streamview`, `.bt-cr-panel`, `.bt-badge`, `.bt-seg-nav`, `.bt-chip` (option groups of 3+; `.bt-pills` is two options only), `.bt-card`, `.bt-toast`, `openModal()` / `confirmAction()`, the members-only gate, the check-in dialog, `bt:overlay-open`.

**Stream view scenes (approved, chat-games-batch-1):**

- **Would You Rather: R2 Two cards.** The Play panel's two `.bt-choice` cards at stream size with an OR badge: while open, a gold letter A / B on each card; at the reveal the share as a gold fill, the percentage on top, the winner outlined in lime. Side by side in wide, stacked in tall. No new colours.
- **Predictions: P1 Odds board.** Hot Seat's answer rows reused: answer, picks, a gold bar; picks hidden until the lock; at the result the right row turns lime and the others dim.
- **Waiting chip:** a dashed gold "⏳ Waiting on: …" chip in the footer while a Prediction is locked.

**Run panels (Captain/owner):** step chips, the prompt card ("Typed live" badge), live counts with the split hidden, Reveal now / Pause / End; after reveal Next prompt and Save to pack. Predictions: Lock now (auto-lock countdown), the settle row ("Or settle it yourself"), the teal proposal card with Confirm / Reject, "Correct the result" once (a dialog), Void.

**States every surface handles:** nothing running, visitor, member not checked in (Hot Seat), playing, waiting, revealed (confetti for winners; none under reduced motion), over the XP cap, error and offline ("Reconnecting…", actions disabled). Mods on duty see "You're clocked in, so you can play but earn no game XP tonight."

**Page quality.** `/live/questions` and `/crew/games` are tool pages: hero header with a small scene, cards that react to hover and taps, a celebratory moment on key actions, empty states with the mascot.

## 14a. How Chat Games work (/live/chat-games)

The member-facing story page and the Chat Games home. Approved mockup: chat-games-how-it-works.html.

**Who and where.** Public; every example works without signing in and keeps local state only. Joins the Play nav group in `site/src/lib/nav.js` with the blurb "Questions, Hot Seat and every live game". Linked from the Play panel ("How Chat Games work"), the `/live/questions` header, and one short Chat Games chapter in the Control Room's How it works.

**Frame.** TocLayout rail (chips with a gold progress bar at ≤ 640px), `.bt-chapter--ghost` chapters, hero H2 **Live wall** (a stream screen and a phone: a tap on the phone's Play panel, the split appearing on stream, then +3 XP, looping; a still frame under reduced motion), the How it works journey, stage cards with hover scenes, flows, `.bt-flip` medals, `.bt-placard`, `.bt-chat` Ask BOOMBOT with `boombotIcon(uid)`, the real mascot, and a closing call to action by state (visitor: Join free to play / Sign in; member off air: the next stream's time + Ask a question now; live: Watch live and play).

**Chapters:** 1 What Chat Games are (journey: the Captain calls a game → you play on /live → it shows on stream → XP lands; four stage cards); 2 Questions (lanes, limits; Try it: ask and vote); 3 Hot Seat (round flow; Try it: draw, I'm in, answer, vote, reveal); 4 Would You Rather (Try it: vote, reveal, next prompt); 5 Predictions (flow; Try it: pick, lock, a mod calls it, the Captain confirms); 6 XP and fair play (eight flip medals incl. the 100 XP cap and free entry; the mods-earn-Gears note; the House rules placard: Be kind, No links, Keep it private, Mods have the final say, One account each); 7 Who runs it (role cards); 8 Coming next (Soon cards); 9 Ask BOOMBOT (six questions).

## 15. Edge cases

- **Break during a run.** Timers keep running; the Break scene takes the stream view; the Play panel still works. The Captain can pause a timed state; paused time is added to `closesAt`.
- **Stream drops and returns** (same stream): runs continue; passed deadlines close normally.
- **Captain changes mid-stream.** Controls follow the current Captain.
- **Picked player leaves or is banned mid-round.** No answer; a ban also removes their answer and votes.
- **Question limit.** The 3-open limit counts both lanes; the asker sees which to withdraw.
- **Merge loops.** A merged question can't be a target; merging into an answered question is refused.
- **Two staff tap at once.** Every control is a transaction-checked transition; the second gets "Already done by @handle".
- **XP cap mid-game.** Keep playing; grants recorded at 0.
- **Deleted member.** Questions removed; votes subtracted; past results show "deleted member".
- **Staging.** Runs carry `env`; the 8p preview flags plus `?game=hot-seat|wyr|predictions|questions` drive a sample run.

## 16. Build parts

Code starts after the Mod Deck push (done). One Claude Code prompt per part, staging first.

1. **Engine and registry** (plus saving this spec and the mockups): formats, runs, state machine, deadline tasks, `public/live.chatGame`, Stop clean-up, `chatGameCue`, `shared/ui/chatgames.js`, launch tiles on `/live/control`, rules, seed script.
2. **Questions:** data, callables, `/live/questions`, `.bt-qcard`, the session in the Play panel, run controls, the stream view card.
3. **Packs and the pool:** `/crew/games`, card editor, Suggested lane.
4. **Hot Seat:** rounds, draw, `.bt-seance`, `.bt-wheel`, Play panel, run controls, stream view.
5. **Would You Rather and Predictions:** `.bt-choice`, launch dialogs, Save to pack, settle flow, waiting strip and chip.
6. **How Chat Games work** page (§14a).
7. **Mod Deck hookup:** mod actions in the Deck, launch tiles in the Deck.
8. **Docs:** design-system "Chat Games" section, ROADMAP 5b renamed and pointed here, CLAUDE.md, UI kit page sections.

Later: Caption This (after its addendum), then the crew-hosted games (each with an addendum, plus crew votes, host pledges and the Planner slot).
