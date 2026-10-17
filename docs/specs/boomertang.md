# Boomertang (horror gaming magazine)

Spec confirmed Oct 17, 2026. Mockups approved Oct 17, 2026:
- `docs/design/mockups/boomertang-granny.html` (mockup 3: the locked style; cover, contents, cover story, The Family, The Map, Speed, The Index)
- `docs/design/mockups/boomertang-newsstand.html` (mockup 4: pick **N2 The spread**; locked pages pick **L2 Sealed issue**)
- `docs/design/mockups/boomertang-pages.html` (mockup 5: picks **S1 Room by room**, **X2 Redacted**, **G2 The tally wall**, **V1 Ballot cards**)
- `docs/design/mockups/boomertang-how-it-works.html` (mockup 6: picks **H2 The press**, **A1 The desk**)

The repo copies are repo-safe: the Granny screenshot is replaced by a placeholder until the
screenshot question (§12) is settled.

## 1. What it is
Boomer's digital horror gaming magazine on boomertanger.com.
- **Volume** = a year. **Issue (No.)** = one monthly release. **Edition** = an updated version of an
  issue: updates keep the same No. and show in the issue's edition log ("updated Jan 24"). No. 2 is
  the next new issue.
- **Cover story** = the main feature; **features** = big stories; **departments** = recurring sections
  (Survive, Speed, Secrets, Chat's Verdict, The Index); **spread** = picture + story layout.
- One issue = many pages, each on its own URL, joined by the issue bar and "Turn the page."
- First issue: **Vol. 1 · No. 1 · The Granny Issue · Launch edition**, public at go-live (the
  flagship). Regular monthly issues start after the community proof goals (Playbook) are met.
- The Granny YouTube series (about 20 episodes, 43 shorts) feeds the issue; the issue's outline guides
  the series' storytelling.

## 2. Routes
| Route | Kind | Notes |
|---|---|---|
| `/boomertang` | Newsstand (N2) | Latest cover beside its contents, back issues below. boomertang.com redirects here (Cloudflare, at the domain switch). |
| `/boomertang/vol-1/no-1` | Cover | The issue's cover, the side cards, the edition log. |
| `/boomertang/vol-1/no-1/<page>` | Issue pages | `contents`, `the-woman-in-the-house`, `the-family`, `the-map`, `survive`, `speed`, `secrets`, `the-gauntlet`, `chats-verdict`, `the-index`. |
| `/boomertang/how-it-works` | Story page (H2) | Full frame. |
| `/admin/boomertang` | Tool page (A1) | Owner only; a card on /admin. |

- The Map deep links: `?floor=`, `?layer=`, `?pin=`. Survive deep links: `?room=`.
- Nav: a temporary spot in the Community group (blurb "Horror gaming monthly"), flagged to move in the
  planned nav regroup (ROADMAP). The Granny games' Game Vault pages link to the issue: `issues.json`
  `games` lists the Vault slugs an issue covers (No. 1: `granny`, `granny-chapter-two`, `granny-3`), and
  those game pages get an "In Boomertang" card (Read the issue, `data-pulse="tang-from-vault"`) once the
  issue is published. A draft's issue doc isn't readable, so before that nothing shows.
- Footer: site.json's boomertang.com domain entry reads "Boomertang" and goes to `/boomertang` (until
  the domain redirect at launch, §13).
- Unknown issue or page: 404. A page dropped in a later edition redirects to that issue's contents.

## 3. Who reads what
| Reader | No. 1 and issues made public | Back issues | Newest issue |
|---|---|---|---|
| Visitor | Everything | Cover, contents, sealed pages (Join free → E1) | Same |
| Fan Club (free) | Everything | Everything | Cover, contents, sealed pages (Sub Club) |
| Sub Club, owner, admins | Everything | Everything | Everything |

- **Newest issue** = the newest published issue (`tang/main.currentIssueId`). It becomes a back issue
  the moment the next one is published, not on a calendar date.
- **Sub Club** uses the same check as Brain Dump (`hasBrainDump()`'s sub path: the staging-only sub role
  until billing exists). Before billing, Fan Club reads a members-only newest issue when the next one
  comes out. The owner can make any issue public.
- **Interactive parts** (map, guides, polls) are open to whoever can read the issue. **Voting** needs a
  signed-in member (finished signup, members doc).
- **Writing and editing:** owner only. Pages are files, seeded; an /admin editor comes later.
- Client checks only decide what's shown; Firestore rules enforce every read and write.

## 4. Content
### 4a. Files
- `site/src/data/boomertang/issues.json`: public metadata for every issue, drafts included: id
  (`v1n1`), vol, no, slug, title, date line, cover lines, cover story word and style, contents rows
  (page slug, title, one line, kind), sources list. Public data only.
- **Public issue text** (No. 1): one Markdown file per page in `site/src/content/boomertang/v1n1/`,
  built into static HTML (search, sharing, phones). An issue whose text is in the repo is always
  public; its switch is locked on.
- **Members-only issue text**: gitignored Markdown in `functions/scripts/data/boomertang/<issueId>/`,
  seeded by `functions/scripts/seed-boomertang.js` (dry run unless `--apply`, staging first) into
  `issues/{issueId}/pages/{slug}`. One renderer serves both, so pages look the same.
- Making a members-only issue public makes it readable at once (client-rendered); it's indexed by search
  engines only once its files move into the repo (a Claude Code step).

### 4b. Page format
Markdown with fenced blocks for the magazine pieces (rendered by one shared renderer): `facts` (the
number strip), `pull` (pull quote), `note`, `tree` (The Family), `map` (points at the map JSON), `rooms`
(Survive), `secrets` (Secrets), `tally` + `runs` (The Gauntlet), `polls` (Chat's Verdict), `board`
(Speed records), `rules`, `index` (The Index, built from the sources list).
- **Fact tags** inline: `{tag:off|ver|com|fan source=<sourceId>}`. Every tag names a source.
  Verified by Boomer carries the version (PC 1.3.4).
- **Sample text** is marked in the file and renders the `Sample text` label.

### 4c. Sources and The Index
Each issue's `sources`: `{ id, title, url, trust: off|ver|com|fan, checkedAt, note }`. The Index lists
them by group with the trust tag and the checked date. `scripts/check-boomertang.js` (in `npm run check`
and the build) fails on: a tag without a source, an unknown source id, a source without `checkedAt`, a
contents row without a page, a page not in the contents. It warns on sources checked more than 30 days
before the build; the build writes that list for the desk's "Sources to re-check" card.

### 4d. The Map
One JSON per issue (`site/src/data/boomertang/v1n1-map.json`): floors, rooms (traced from Boomer's real
drawing; the mockup's layout is a placeholder until then), layers (hiding spots and tricks, items per
preset, creaking floors, routes, Boomer's deaths), pins `{ id, layer, floor, x, y, title, text, tag,
source, platform: pc | mobile | both, video?: { youtubeId, start }, room? }`. PC 1.3.4 is the default
version; the mobile layer comes later. Pan and zoom reuse `.bt-zoomframe`. The Map stays dark in Paper
and Ink.

### 4e. Media
Cloudinary under `boomertang/<issueId>/`, uploaded by `functions/scripts/upload-boomertang-media.js`
(fixed public ids, no overwrite, dry run first, `--from-secret-manager`), each recorded with
`recordAssetCreated()` (feature `boomertang`). Not used until the screenshot question is settled;
until then pages use the placeholder art.

### 4f. Cover code
A real QR code generated at build (SVG) to `https://boomertanger.com/boomertang?ref=tang-cover`
(production even on staging), beside the decorative barcode (B3). `tang-cover` joins Traffic Pulse's
ref list.

## 5. Data (Firestore, under `sites/boomertanger/tang/main`)
| Path | Holds | Read | Write |
|---|---|---|---|
| `tang/main` | `currentIssueId` | public | functions |
| `issues/{issueId}` | `status` draft \| published, `access` public \| members, `publishedAt`, `editions: [{ date, note }]` | public when published; owner and admins always | functions |
| `issues/{issueId}/pages/{slug}` | members-only page body | the §3 rule | seed script only |
| `polls/{pollId}` | `issueId`, `question`, `options [{ id, label }]`, `counts {}`, `open`, `closesAt?` | whoever can read its issue | functions |
| `pollVotes/{pollId_uid}` | `optionId`, `at` | none (server only) | functions |

- Page rule: `access == "public"` or (members doc exists and (`issueId != currentIssueId` or Sub Club)),
  or owner / admin. Drafts: owner and admins only (the owner preview on localhost and staging).
- **Paper or Ink:** `users/{uid}.prefs.tangMode` (`paper` | `ink`) through `updatePrefs` (one new allowed
  value); visitors keep it in localStorage `bt.tang.mode`; applied before first paint.
- **Callables**
  - `tangAdmin` (owner only; adminLog feature `boomertang`, TTL as usual): `publish` (draft → published,
    sets `currentIssueId`, one activityLog `tang-issue` entry), `setAccess` (refused for issues whose
    text is in the repo), `addEdition` (note 1–120 characters, today's date in Central), `poll`
    (open / close / reopen; a closed poll's result is the final verdict).
  - `tangVote({ pollId, optionId })` (signed-in member; one vote per poll, changeable while open; one
    transaction moving `counts`; rate-limited like other member writes).
  - `tangVote({ issueId, mine: true })`, the "my votes" mode: returns `{ votes: { [pollId]: optionId } }`,
    the caller's own votes in that issue's polls, if they can read the issue. Votes are server only, so
    Chat's Verdict asks for them to mark the member's picks.
- These functions must not load `rewards/grant.js` or anything in `lib/live`, so deploying them never
  redeploys the rest.

## 6. Pages (UI)
All built from bt-ui; magazine pieces that other features could reuse go into the kit (§8).
- **Newsstand (N2):** the band (masthead, "Boomer's horror gaming magazine", How Boomertang works); the
  latest cover beside its contents rows (locks on rows the reader can't open) and Read the issue; a
  soft lamp glow behind the cover; back issues as a grid with an access line under each (Free for
  everyone / Free with Fan Club / Sub Club first). At launch: the mascot empty state "No back issues
  yet."
- **Issue pages:** the issue bar (mini masthead, issue line, page nav with locks, Paper / Ink switch),
  the folio, Turn the page (previous / next). Paper is the default; the cover and The Map stay dark.
- **Locked page (L2 Sealed issue):** the issue's cover taped shut ("Members only"), the public headline
  and dek, the lock card, and the issue's other pages with locks. Lock card text by reader:
  - Visitor, back issue: "Back issues are free with Fan Club" → Join free (E1), plus "Already a member?
    Sign in."
  - Visitor, newest issue: "This is the newest issue": Sub Club reads it now; join free and it's yours
    when the next issue comes out → Join free.
  - Fan Club, newest issue: "Sub Club reads the newest issue first": opens when the next issue comes
    out; Sub Club is coming soon → Read back issues.
  - No member text is ever in the page.
- **Cover, contents, cover story, The Family, The Map, Speed, The Index:** as in mockup 3. One change
  on the cover: the members card reads "Fan Club members vote in Chat's Verdict and read every back
  issue. Sub Club reads the newest issue first." The mockup's line (comments, the death map, new chapters
  first) promised things that aren't built: comments are out of scope (§11), and there is no death map.
- **Survive (S1 Room by room):** floor chips; rooms as cards (episode, one line, danger meter); tapping a
  room opens its guide under the row: the episode short, Boomer's steps, items and hiding spots from
  The Map, Watch the short, Show on the map.
- **Secrets (X2 Redacted):** one page; each secret's spoiler-free line reads normally, the how-to is
  blacked out until Reveal (Cover it again); each secret keeps its tag and a status line (works on PC
  1.3.4 / patched in PC 1.3.4 / not tested by Boomer yet).
- **The Gauntlet (G2 The tally wall):** every try as a tally mark (a slash per five) on a dark wall, the
  best try as a bar across Granny, Chapter Two and Granny 3; then every try (date, got to, how it ended,
  VOD) and the rules. Tries are issue content, updated as a new edition after each attempt night.
- **Chat's Verdict (V1 Ballot cards):** a grid of poll cards. Members who haven't voted see purple
  option buttons; after voting, the bars with their pick outlined and Change my vote. Visitors see the
  bars and "Join free to vote." Closed polls show "Final result."
- **How it works (H2 The press, story page):** TocLayout rail, six ghost chapters: A magazine, page by
  page (four stage cards with hover scenes: Volume, Issue, Edition, Departments); How an issue grows
  (five-step journey); Can you trust it? (the placard of four tags + a working tag example: tap a tag to
  see its source); Who reads what (a working "publish the next issue" table); Paper or Ink (a live
  switch); Ask BOOMBOT (`site/src/data/help/boomertang.json`); closing call to action with the mascot
  (Read the Granny Issue, Join free for back issues). The hero: pages fly in and stack, the cover drops
  on top, a Launch edition stamp lands (one moment on load; reduced motion shows the finished stack).
- **The desk (A1, /admin/boomertang):** hero with the desk lamp over a cover stack and the Owner only
  badge; Issues (rows newest first: cover, status badge Draft blue / Newest lime, the free-for-everyone
  `.bt-switch`, Publish with `confirmAction` and the `.bt-stamp` moment, Preview for drafts; No. 1's
  edition log); Edition note (1–120 characters, stamp on save); Chat's Verdict (Close poll / Reopen);
  Sources to re-check (from the build); mascot empty state "No issue in the works."
- **Phone:** the issue bar shrinks (nav scrolls sideways, the mode switch stays); Turn the page uses
  buttons and arrow keys, never swipe (it would fight The Map); the cover's side lines move below it.
- Reduced motion everywhere (cover reveal, hero stack, page turn, stamps, map pins, the reveal).

## 7. Copy and honesty
US English. Real facts carry their tags and sources (mockup 3's facts were sourced Oct 15, 2026).
Paragraphs not written by Boomer yet are marked Sample text. No invented settings, records or specs.
Speedrun rules are summarized in Boomer's words with a link to speedrun.com, never copied word for word.

## 8. Design decisions (design-system §8)
- **Fonts:** Bodoni Moda (masthead M1, inside headlines H3), Anton (cover story S2, the condensed word
  in H3), Newsreader (reading text), loaded only on Boomertang pages, with fallback stacks.
- **Locked style:** masthead M1 Didone in gold, never changes; cover story type S2 Condensed (can change
  per issue); inside headlines H3 (italic Didone with one condensed word); cover code B3.
- **Paper and Ink:** a paper surface (`--tang-paper`, `--tang-ink`) with a darker gold for headings on
  paper (`--tang-gold-ink`) and a darker purple for links (`--tang-link-ink`); `--tang-blood` for
  editorial hairlines, folio marks, drop caps and data marks (danger meter, tally slashes), never
  buttons or anything clickable; the lamp light (one rgb token). Color meaning holds: gold headings,
  purple clickable, red never on buttons.
- **Story-page frame:** the magazine pages keep the magazine look; `/boomertang/how-it-works` carries the
  full story-page frame for the feature.
- **Kit additions** (shared/bt-ui.css + shared/ui, on the UI kit page): `.bt-surface--paper` (the paper
  tokens and Ink variant), `.bt-factag` (the four trust tags, each tone readable on paper, ink and dark),
  `.bt-issuebar` (with the reading-mode switch), `.bt-turnpage`, `.bt-redact` (blacked-out text with a
  reveal). Feature-only CSS: covers, the newsstand, the tally wall, the map art.

## 9. Service Hub, Traffic Pulse, nav
- Manifest `services/boomertang.json` (pages, sections; talkBack pins on The Map, Survive and Speed;
  rate on). The desk is an admin tool (skip).
- `data-pulse` ids: `tang-read-issue`, `tang-join`, `tang-vote`, `tang-reveal`, `tang-watch-short`,
  `tang-mode`, and `tang-from-vault` on the Game Vault card. Ref `tang-cover` registered (seeded by
  `seed-boomertang.js` in the same shape /admin/pulse saves).
- `"boomertang"` in site.json modules.

## 10. Testing
`docs/testing/boomertang-test-plan.md`: the access table for each reader type (visitor, Fan Club,
staging sub role, admin, owner) on No. 1, a sample back issue and a sample newest issue (seeded on
staging only), Paper / Ink sync across two devices, voting and changing a vote, publish and the
back-issue switch, setAccess refused for No. 1, the edition note, rules checks with custom-token users
(staging only, cleans up), phones.

## 11. Out of scope (later)
The /admin writing editor, guest or crew writers, PDF or print, a "new issue" Boom Alert or email,
comments, real Sub Club billing, speedrun.com API records (v1 records are entered by hand with a checked
date), Chat Games results in Chat's Verdict, the mobile map layer.

## 12. Open items
- Speedrun rules: Boomer pastes them; they're summarized in his words with a link.
- Game screenshots: do they need permission? Placeholders until settled.
- DVloper (DVapps AB, Sweden) interview: optional; No. 1 doesn't depend on it.
- Volume numbering: does Vol. 2 start in January, or after 12 issues?
- Playbook: update the `tang` page.

## 13. At launch
Deploy the `tang` rules, `tangAdmin`, `tangVote` and `updatePrefs` to production; seed No. 1's polls on
production (dry run, then `--apply`). The production seed creates No. 1 as a **draft** (it never
publishes, and `currentIssueId` stays empty); the owner publishes it from the desk, which sets
`currentIssueId`. Then: add the boomertang.com redirect to
`/boomertang`; check the QR code scans to production.
