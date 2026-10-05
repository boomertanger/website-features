# Spec: Game Vault, How it works — CONFIRMED (2026-10-05)

Mockup: `docs/design/mockups/game-vault-how-it-works.html`. Approved: **H2 J1 Q1**.
The mockup's copy is the starting copy; Boomer may edit wording later.

## 1. The page

- **URL:** `/games/how-it-works`. Public (visitors included); only the calls to action
  change by viewer (visitors: Browse the Vault + Join free; members: Browse the Vault +
  Add a game).
- **Layout:** the Vault's feature bar (with a ghost "How it works" link, current on this
  page) + the shared `TocLayout` (sticky chapter menu; chip row on phones) + the Arcade
  How it works blocks: hero, stage cards with scenes, journey, house-rules placard,
  BOOMBOT FAQ, CTA. Chapters use `.bt-chapter--ghost`.
- **Reads:** `sites/{siteId}/public/vault` only (already used by /games). **Writes:**
  nothing. Every demo on the page (search, wants, score, story) works on local state.
- **Ways in:** the "How it works" link in the GAMEVAULT bar; "How adding works" in the
  Add a game dialog (→ `#s-add`); refusal messages link to `#s-fair`; every chapter has
  an anchor.

## 2. Chapters

| # | Anchor | Title | Interactive piece |
|---|---|---|---|
| Hero | | Every horror game, in one vault | **H2 cover wall**: 4 columns of real covers drifting slowly behind the hero, masked toward the text; still under reduced motion; decorative (aria-hidden). Counts from the summary doc: games in the Vault, finished, played in VR (games with Boomer's VR tag); a count of 0 is hidden. |
| 01 | s-what | What the Vault is | Four status cards (Playing, Finished, Abandoned, Wishlist); pointing at one shows its mark on a cover (pulse, dial, tape, stamp). |
| 02 | s-find | Finding games | A working search over the real summary doc (shared/vault-search.js) + clickable tips. Each tip's example must return at least one real game. |
| 03 | s-add | Adding a game | **J1 journey**, 5 steps (Paste or search, Pick it, The checks, In the Vault, Or a quick check — the last dashed as the fork), + 3 fact cards (verified email, 5 a day, duplicates count as a want). |
| 04 | s-wants | Community picks and "I want this too" | A local "Most wanted (try it)" list that re-ranks as you want games; 3 points beside it. |
| 05 | s-covers | Covers | Three cards: from the game databases (IGDB/Steam), suggest one when there's none, a mod checks it first. |
| 06 | s-reviews | Boomer's reviews and scores | The score dial with sample scores 3/6/8/10 and verdicts; Boomer's gold. |
| 07 | s-moves | How a game moves | "One game's story": Wishlist → Playing → Finished/Abandoned with a cover token and ticking stream/hour counts; Play / Play again. |
| 08 | s-fair | Fair play | House-rules placard (7 rules) + "Who keeps it tidy" card. Never spells out how the content checks work. |
| 09 | s-faq | FAQ | BOOMBOT chat FAQ (6 questions). |
| CTA | | Ready to dig in? | |

Reduced motion: every scene shows its end state; no drifting, sliding or typing.
Phones: the menu becomes the chip row; scenes respond to tap/focus as well as hover.

## 3. The mod guide (Q1)

- A "How the queue works" panel above the triage deck on `/games/queue`, staff only.
  Open on a staff member's first visit; after they close it, it stays a slim bar with
  "Show guide" (remembered per browser).
- **Its text is not in the repo or the page bundle** (the repo is public). It lives in
  `sites/{siteId}/staffDocs/vault-guide` (read: mods and admins; no client writes),
  shaped `{ sections: [{ title, body }], updatedAt }`, with `body` in a tiny safe subset
  (paragraphs, "- " bullets, **bold**, `kbd`-style keys), rendered as text, never as
  raw HTML.
- Loaded by `functions/scripts/seed-staff-doc.js --doc vault-guide --file <path>`
  (staging unless `--project production` is given), from a local Markdown file kept out
  of git (`functions/scripts/private/`, gitignored).

## 4. Shared pieces

The How it works blocks the Arcade page and this page share (hero, stage cards, journey,
placard, BOOMBOT FAQ, CTA, and their behaviour: journey, FAQ typing, spotlight) move from
the Arcade's own CSS/script into a shared stylesheet and module used by both pages,
keeping their class names so the Arcade page doesn't change.
