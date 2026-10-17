# Brain Dump (spec, confirmed Oct 17, 2026)

A private, categorized brain-dump board: a Big Goal, quick capture into an Inbox, color-coded checklist cards, starring, reordering, drag-to-rearrange cards, and Undo instead of confirmations. A rebuild of Glenn's "Bump Board" prototype (which started as a photo of a paper planner worksheet), renamed and rebranded to bt-ui. Plus a story page, How it works.

Mockups (approved, working, sample data only): `docs/design/mockups/brain-dump.html` (picked: card style 1 Tinted fill) and `docs/design/mockups/brain-dump-how-it-works.html` (picked: hero H2 Paper to board, roles R1 one chapter with a switch). The inline script in `brain-dump.html` is the reference engine: port it, don't redesign it.

**Keep it simple.** No statuses, tags, due dates, nested lists or item dragging between cards. Glenn asked for none of these.

## 1. Who and where
- `/brain-dump` (tool page): one private board per person. Access: Sub Club (the "sub" role, which Club Pass grants for every pass source), crew (an active crew grade), admins and the owner. firestore.rules `hasBrainDump()` and `site/src/lib/brain-dump-access.ts` hold the same rule.
- `/brain-dump/how-it-works` (story page): public. The closing call to action changes by viewer: has access → **Open my Brain Dump**; signed-in member without access → "Brain Dump comes with Sub Club. Get it and your board is ready right away." with **Get Sub Club** and **Try the practice board**; visitor → "Brain Dump comes with Sub Club. Join free first, then add Sub Club." with **Join free** (opens E1) and **Try the practice board**.
- **Get Sub Club** is the site's existing Sub Club upsell: the pre-checkout dialog in `site/src/lib/checkout.ts` (`startCheckout`), the same as on /club-pass and My pass. Where payments are off (production until launch, `site/src/lib/club-pay.js`) it is a **See Sub Club** link to /club-pass instead; never "opening soon".
- Not in the header nav groups (it's personal). An account-menu item "Brain Dump" for people with access. `/brain-dump` without access: visitors get `.bt-lock-card` opening E1; members get `.bt-lock-card` "Brain Dump comes with Sub Club." with **Get Sub Club** and a link to How it works.
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
- Hero H2 "Paper to board": the paper planner sheet with the dark board wiping across it (a still half-wipe under reduced motion); title "How Brain Dump works"; buttons by viewer (a member without access gets **Get Sub Club**) plus "Try the practice board".
- 01 Why dump it: three stage cards (Capture, Sort, Check off) with scenes that play on hover, focus or tap, resting on a meaningful still frame.
- 02 How it works: the five-step journey (`.ai-jr--5`): Capture, Sort, Star, Check off, Clear; then six tips.
- 03 Try it: the real engine mounted with an in-memory store (never saved; says so), example items, a "Try this" list (capture, move, check off) that lights up, a stamp when all three are done, Start over.
- 04 Made for your role (R1): `.bt-pills` three-way switch Mod / Admin / Sub Club (default follows the viewer: crew → Mod, everyone else → Sub Club), three use cases each as Before / With it, and an example board (all items "Example ·").
- 05 Private by design: phone ↔ your board ↔ PC flow; "Nobody else can open it"; three facts (saves as you go, bad signal, access ends).
- 06 Good habits: the placard (capture fast, sort once a day, three Top priorities, clear checked weekly).
- 07 Ask BOOMBOT: from `site/src/data/help/brain-dump.json`.
- Closing call to action by viewer (§1).

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

## 9. Looks and card sizes (addendum, confirmed Oct 17, 2026)

Mockup: `docs/design/mockups/brain-dump-looks.html` (mockup 3 with Chalkboard; working board with the picker). Reference CSS: `brain-dump-looks-reference-v2.css` (the mockup's looks block, to adapt, not paste blindly). The mockup's inline script is the reference for the engine changes.

### 9a. Card sizes
- Three widths: **S** = a third (`sm`), **M** = half (`half`), **L** = full width (`wide`). Same `size` field as before; no data change.
- Each category card has a size button (`.bd-size`, mono letter S / M / L) between the count and ✕. A tap cycles S → M → L → S, saves, and announces "Card size: Medium". Its label says what it is and what's next ("Card size: Large. Change to Small"). It hides at ≤ 640 px, where every card is full width. At 2 columns S and M look the same (known, fine).
- The add-category card has a size radio group (S · a third, M · half, L · full width; default S; arrow keys) before "+ Add category".
- Print hides the size button. Pulse id `card-size`.

### 9b. Looks (a per-person setting)
- Six looks: **Classic** (the original C1 tinted fill), **Neon**, **Control panel** (the Control Room hull look), **CRT TV**, **Post-it**, **Chalkboard**. New boards start on **Control panel**.
- Stored on the board: new field `look` (`classic | neon | panel | crt | postit | chalk`); a missing or unknown value becomes `panel`. **Rules:** add `look` to the brainDump key list (a string in that list). Reset board and Undo keep the person's look.
- Applied as `data-look` on the board root (Classic = no attribute) plus one CSS block per look, following the Control Room looks rule (design-system: a look restyles surfaces, frames, motion and decoration only; never color meaning, the heading ladder or what's clickable). The drag copy in the portal carries the same `data-look`. Category cards carry `data-color` (Post-it uses it).
- **Picker:** in the toolbar after Clear checked: `button.bt-chip.bt-chip--menu` "🎨 Look: <name>" opening a `.bt-popover` menu (`role="menu"`, `menuitemradio` options with a small preview swatch each, a ✓ on the current one, and the note "Only changes how your board looks to you."). Opens with the current look focused; arrow keys, Home / End; Esc closes and returns focus; Tab or a click outside closes. Opening dispatches the site's `bt:overlay-open` and it closes when another overlay opens. It keeps itself on screen (on phones it shifts so it never runs off the left edge). Pulse ids `look-open`, `look-classic`, `look-neon`, `look-panel`, `look-crt`, `look-postit`, `look-chalk`.
- **Neon:** near-black cards with a glowing edge and glowing title in the card's color.
- **Control panel:** square panels on a faint grid, corner brackets and a status light before the title in the card's color, mono uppercase titles, the count as a readout; the Inbox light blinks gently; the goal card gets gold brackets.
- **CRT TV:** each card a bubble TV (thick rounded bezel, two knobs, a lime power light), subtle scanlines, glowing text, the count as "CH 2/5"; the TVs switch on once when the page opens (`is-boot`, stagger by `--i`) and when the look is picked; none under reduced motion.
- **Post-it:** each card color maps to its own yellow (ember → marigold, pink → lemon, gold → sunflower, lime → canary, teal → butter, blue → honey), dark pencil ink, a sticky strip, a curled corner, a slight tilt (smaller on M and L), and a pushpin in the card's original color. The Inbox is a ruled index card; the Big Goal is a canary note with two strips of tape. Declared colors: the six `--bd-note-*` yellows, `--bd-note-index` and `--bd-note-ink` (one custom property per unique color).
- **Chalkboard:** a **black** slate (not green: green means admin on this site, and a look can't change color meaning) in a wooden frame around the whole board (12 px, 26 px at the bottom like a chalk ledge; 6 px / 16 px on phones), faint eraser smudges, cards as chalk-drawn boxes with slightly uneven corners, titles underlined in pastel chalk of each card's color, chalk-outlined checkboxes and counts, dashed chalk lines for the add fields, the goal written straight on the board with a chalk line under it. Declared colors: `--bd-chalk-slate`, `--bd-chalk`, `--bd-chalk-wood`, `--bd-chalk-wood-dark`. Print drops the frame.
- Starred rows in Neon, Control panel, CRT TV and Chalkboard get only a faint gold tint (8%) and the filled star; no edge bar on the left.
- No raw black or white: shadows, scanlines and sheen mix `--bt-bg` / `--bt-text` with transparent.
- Contrast checked in all six looks: titles ≥ 4.74:1, items ≥ 7.43:1 (Chalkboard: titles 8.13, items 13.62).
- Print: every look falls back to the plain light sheet.
- **How it works:** the practice board shows the picker too (memory only, never saved); the "Try it" tips get one more tip: "🎨 Pick your look: Classic, Neon, Control panel, CRT TV, Post-it or Chalkboard. Only you see it." Ask BOOMBOT gets one more answer: "Can I change how it looks?" → "Yes. Use 🎨 Look in the toolbar: Classic, Neon, Control panel, CRT TV, Post-it or Chalkboard. It's saved on your board and only changes what you see."

### 9c. Checked items drop to the bottom (always on; confirmed Oct 17, 2026)
- In every category list, unchecked items come first and checked items after, each group keeping its own order. This is the order saved in the board document; there's no new field and no rules change.
- **Check an item:** it moves to the top of the checked pile (the newest checked sits directly under the unchecked items).
- **Uncheck an item:** it moves to the end of the unchecked items, just above the checked pile (not back to its exact old spot; deliberate, to keep it simple).
- **New items** (the add line, and Move to… from the Inbox) land at the end of the unchecked items, above the checked pile.
- **▲ / ▼** reorder within a group only: ▼ on the last unchecked item and ▲ on the first checked item are disabled, and the handler refuses a swap across groups.
- **Loading** an existing board tidies any checked items found mid-list to the bottom, keeping their order (a stable partition, done in the load/migrate step and before rendering a list).
- **Undo** (delete, Clear checked, Reset) restores items and the list is re-tidied, so checked items stay at the bottom.
- **Motion:** the moved row slides to its new place (about 240 ms; a FLIP animation with the Web Animations API); none under reduced motion. The checkbox keeps focus after the move (without scrolling).
- Search and Starred only re-apply after a move. The Inbox (no checkboxes), stars, counts and Clear checked are unchanged.
- How it works: the example boards list checked items last (mockup data updated).
