# Brain Dump (spec, confirmed Oct 17, 2026)

A private, categorized brain-dump board: a Big Goal, quick capture into an Inbox, color-coded checklist cards, starring, reordering, drag-to-rearrange cards, and Undo instead of confirmations. A rebuild of Glenn's "Bump Board" prototype (which started as a photo of a paper planner worksheet), renamed and rebranded to bt-ui. Plus a story page, How it works.

Mockups (approved, working, sample data only): `docs/design/mockups/brain-dump.html` (picked: card style 1 Tinted fill) and `docs/design/mockups/brain-dump-how-it-works.html` (picked: hero H2 Paper to board, roles R1 one chapter with a switch). The inline script in `brain-dump.html` is the reference engine: port it, don't redesign it.

**Keep it simple.** No statuses, tags, due dates, nested lists or item dragging between cards. Glenn asked for none of these.

## 1. Who and where
- `/brain-dump` (tool page): one private board per person. Access: Sub Club, crew (mods), admins and the owner. Until billing ships, that means crew, admins and the owner (plus the staging-only Sub Club test role, if the repo has one).
- `/brain-dump/how-it-works` (story page): public. The closing call to action changes by viewer: has access → **Open my Brain Dump**; signed-in member without access → "Brain Dump comes with Sub Club. Sub Club isn't open yet…" (no buy button until billing exists); visitor → **Join free** (opens E1).
- Not in the header nav groups (it's personal). An account-menu item "Brain Dump" for people with access. `/brain-dump` without access: visitors get `.bt-lock-card` opening E1; members get `.bt-lock-card` "Comes with Sub Club" with a link to How it works.
- The board's hero has a "How it works" link (`.bt-link-btn`).

## 2. Data
- One document per person: `sites/boomertanger/brainDump/{uid}`
  `{ v: 1, goal, goalDone, startDate, inbox: { items: [{ id, text }] }, categories: [{ id, title, color, size, placeholder, items: [{ id, text, done, starred }] }], updatedAt }`
  `color` is one of `ember pink gold lime teal blue`; `size` is `sm | wide | half`. Loading migrates older shapes (missing inbox, done/starred default false, prototype color names coral→ember, plum→pink, moss→lime, sage→teal, sky→blue) and falls back to the default board if missing or corrupt.
- **Rules (a recorded narrow exception to "writes go through Cloud Functions"):** these are the member's own private notes, nothing else reads them, no XP or counts depend on them. Read and write only when `request.auth.uid == uid` and the person has access (owner, admin, crew, Sub Club; reuse the repo's existing helpers for each). Writes: keys limited to the list above; `updatedAt == request.time`; `categories.size() <= 40`; `inbox.items.size() <= 300`; `goal` a string ≤ 300. No one else can read it, including admins, through the site. Deletes: owner of the doc only.
- **Saving:** the whole document, debounced about 800 ms after the last change, plus on `visibilitychange` to hidden. A small "Saved" note (mono, muted). A local copy in `localStorage` (`bt.braindump.v1.<uid>`, with a `pending` flag) is kept so a change made with a bad signal survives a reload and is pushed when back online; on load, a pending local copy newer than the server copy wins.
- **Two devices:** an `onSnapshot` listener applies remote changes when there are no pending local changes and nothing editable has focus; otherwise they apply after the next save. Last save wins (one person, so acceptable).
- **Losing access:** the document is kept untouched; the page shows the lock card; regaining access shows it again.
- **Account deletion:** if the repo has an account-deletion flow, it deletes this document too; if not, add a ROADMAP note.
- No adminLog, activityLog, XP, Gears, Night Shift or badges.

## 3. Board behavior (match the reference engine)
Header card (Started date, Big Goal with checkbox and strike-through, three stats: ideas on the board excluding the Inbox, checked off, starred, then Quick capture). Toolbar (search, Starred only `aria-pressed`, Clear checked). Grid: Inbox first (dashed, "N waiting", items with text, Move to…, ✕; no checkbox or star; mascot empty state), the categories in saved order, the add-category card last (name, six color swatches as a radio group, default rotates, "+ Add category"; new cards are small).

Ten default categories, all empty: I need to call (ember, sm) · I need to text (pink, sm) · I need to email (gold, sm) · I need to schedule (lime, sm) · I need to follow through (teal, sm) · I need to speak with (blue, sm) · I want to research / look into / learn about (ember, wide) · I want to make / create (gold, wide) · What I want to do (lime, half) · Top priorities (blue, half). Each keeps its own placeholder ("Add someone to call…").

Cards: grip handle (pointer-events drag with a floating copy in a portal, the original faded in place, live reflow, auto-scroll near the screen edges; `touch-action: none` on the handle only; arrow keys on the focused handle move it, announced "Moved to 3 of 10"), editable title, done/total count, ✕. Items: checkbox, editable text, star, ▲ ▼ (32 px targets; first ▲ and last ▼ disabled), ✕. Add line under the list (focus stays for the next item).

Undo instead of confirm (kit toast with an Undo action, 6 s, one at a time) for: delete item, delete Inbox item, delete category, Clear checked (exact positions), Reset board (whole snapshot incl. goal and date).

Search and Starred only filter category cards (not the Inbox), combine, and re-apply on star. A title match shows the whole card.

**Known-gap fixes (all in the reference engine):** Move to… options are rebuilt when it opens and after any category change; a missing target shows an info toast. Paste is plain text. An emptied item is deleted with Undo; an emptied title restores the old name. Drag auto-scrolls.

Celebration: checking the Big Goal bursts gold sparks and the hero mascot hops (none under reduced motion).

## 4. Look
- bt-ui only. Card colors are the six tones as tinted fills on the dark surface (C1 Tinted fill): `color-mix(in srgb, tone 13%, var(--bt-surface))`, the title in the tone, items in `--bt-text`. Tones: Ember (`--bd-ember: #ff7a12`, the middle of the title gradient, the one feature color), `--bt-pink`, `--bt-gold`, `--bt-lime`, `--bt-teal`, `--bt-blue`. Never purple (clickable), red (delete) or green (admin) as card colors. Contrast checked ≥ 4.5:1 (lowest 4.74).
- Purple: Capture, Add, focus. Gold: stars, starred rows (`--bt-gold-bg`), the Inbox title. ✕ turns red on hover. Inter everywhere; the goal 28 px / 800 (23 px on phones); counts, stats and dates in the site's mono stack.
- Layout: 6 columns; ≤ 1024 px 2 columns; ≤ 640 px 1 column (container queries). Tool-page touches: the hero with a small mascot scene, the mascot in the empty Inbox, the goal celebration.
- Print: a light sheet in two columns with colors kept (tinted on white), all controls hidden except a starred item's ★; the Inbox prints only when it has items.

## 5. How it works (`/brain-dump/how-it-works`, story page, picks H2 + R1)
TocLayout rail, ghost chapters, the real mascot and BOOMBOT. Copy as in the mockup:
- Hero H2 "Paper to board": the paper planner sheet with the dark board wiping across it (a still half-wipe under reduced motion); title "How Brain Dump works"; buttons by viewer plus "Try the practice board".
- 01 Why dump it: three stage cards (Capture, Sort, Check off) with scenes that play on hover, focus or tap, resting on a meaningful still frame.
- 02 How it works: the five-step journey (`.ai-jr--5`): Capture, Sort, Star, Check off, Clear; then six tips.
- 03 Try it: the real engine mounted with an in-memory store (never saved; says so), example items, a "Try this" list (capture, move, check off) that lights up, a stamp when all three are done, Start over.
- 04 Made for your role (R1): `.bt-pills` three-way switch Mod / Admin / Sub Club (default follows the viewer: crew → Mod, everyone else → Sub Club), three use cases each as Before / With it, and an example board (all items "Example ·").
- 05 Private by design: phone ↔ your board ↔ PC flow; "Nobody else can open it"; three facts (saves as you go, bad signal, access ends).
- 06 Good habits: the placard (capture fast, sort once a day, three Top priorities, clear checked weekly).
- 07 Ask BOOMBOT: from `site/src/data/help/brain-dump.json`.
- Closing call to action by viewer.

## 6. Help file, manifest, pulse ids
- `site/src/data/help/brain-dump.json`: the seven Ask BOOMBOT answers from the mockup (who can see it, where it saves, deleted by mistake, moving a card, own lists, Sub Club ends, printing), in the existing help-file format.
- `services/brain-dump.json`: routes `/brain-dump` and `/brain-dump/how-it-works`, the `help` file, talkBack `rate` on the board and `note` on How it works (follow `services/README.md`).
- Traffic Pulse: `capture`, `add-item`, `add-category`, `starred-only`, `clear-checked`, `reset-board`, `inbox-move`, `drag-card`, `goal-done`, `undo`, `how-it-works`, `hiw-open`, `hiw-join`.

## 7. Later (not now)
Mentioned once, not building: due dates or snooze, dragging items between cards, an export-as-text backup.

## 8. Build parts
1. Docs: this spec, both mockups, the test plan, ROADMAP entry.
2. Rules + data shape; staging rules deploy.
3. `/brain-dump`: engine port with the Firestore store, gating, account-menu item, help file, manifest, pulse ids, print.
4. `/brain-dump/how-it-works`.
5. design-system §8 "Brain Dump" entry; CHANGELOG.
