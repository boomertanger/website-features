# Base Camp (spec, confirmed Oct 11, 2026; Pup Post addendum Oct 11)

The story of Boomertanger: who he is, where he came from, why his streams work, the island he grew up on, and his corgi co-host. Three pages, one wordmark, plus two shared engines (Kind Words and the Skipper Cam).

Mockups (approved): `docs/design/mockups/base-camp.html`, `base-camp-newfoundland.html`, `base-camp-skipper.html`. The Base Camp mockup in the repo has its Fan Club text replaced with a placeholder; the real text is in the gitignored member file.

## Brand

- Wordmark **BASECAMP** (one word, no gap), W1 "Peak and tent" icon, `.bt-wordmark--power`: BASE off-white, CAMP rests purple and lights gold; the tent door lights on hover/focus.
- Wordmark bar on all three pages with a `.bt-seg-nav`: The story / Newfoundland / Skipper (hidden on phones).
- Nav: one entry, **Base Camp**, in the Community group (`site/src/lib/nav.js`), blurb "Who Boomer is and how it all started." Newfoundland and Skipper are not in the nav.
- Never use Boomer's real first name anywhere. No WOAT, no Discord.
- Copy is US English. Every claim is something Boomer told us or a checked fact. Sample text is marked as sample.

## Page 1: /base-camp (story page, mostly Fan Club)

Hero H1 "The climb": a camp at the foot of a dark mountain; the trail's five purple waypoints link to the chapters; mascot by the fire; the painted sleeping Skipper curled by the fire.

| # | Chapter | Visitors | Fan Club |
|---|---|---|---|
| 1 | The personality behind the pixels | Full | Full |
| 2 | Get to know Boomer: three playing cards (Ace of Hearts, Ghosts, Gears) that turn over | Card fronts; backs show a lattice card back; lock card | Card backs (member file) |
| 3 | Blueprint behind the boom: 4-stop journey + story panel; Then and Now counter | Stop titles, years, teasers; lock card | Full stop stories (member file) |
| 4 | His edge: built for horror gaming, Top 5 as E1 stage cards | Full | Full |
| 5 | Base Camp and beyond; trails to Newfoundland and Skipper; Pup Post mail card; Ask BOOMBOT | Opener + lock card; mail card locked | Full paragraph (member file); mail card with the address |

Closing call: visitors "Join the Fan Club" + "Watch live"; members "Watch live" + "See the schedule".

**Top 5 (locked wording):**
1. He loves horror. It gets him every time. Games, movies, the slow build and the jump. He's a lifelong fan and he still screams. That's the fun of it.
2. Indie horror is home. Small studios, strange games, and the Granny Gauntlet that blew the channel up in June 2025.
3. Chat is in the game. Viewers remember the codes, pick the route and call the escape when it all goes wrong.
4. Mods are part of the team. They help set the tone of the chat and keep it welcoming and fair. He trusts them with real say, and he gives them the credit.
5. Built by an engineer. He started in R&D systems engineering in 2000, on projects for the Army, the Navy and NASA. He runs his stream setup the same way, and he built the site you're on.

**E1 stage cards:** running conic ring on hover, pointer tilt, spotlight, outlined number that ignites, idle motion + hover scene (hallway light dies and eyes appear; game slides off the shelf; chat floods in and the vote swings left; shield catches the light and the crew rises; fans spin up and a pulse runs between the PCs). On phones they play when scrolled into view. Reduced motion: static.

**Then and Now:** Sept 30, 2025 total 5,753 (Twitch 514, TikTok 4,688, YouTube 552) rolls up to today's live total from `sites/boomertanger/public/socials`. Missing platform: hide it. All missing: show the 2025 total only, labelled with its date.

**Data:** public text in `site/src/data/base-camp.json`. Fan Club text in `sites/boomertanger/memberContent/base-camp`, seeded by `functions/scripts/seed-base-camp.js` (dry run unless `--apply`, staging first) from gitignored `functions/scripts/data/base-camp-member.json`. Member text never appears in the repo or the page HTML. `?as=member` preview on localhost and staging only.

## Page 2: /base-camp/newfoundland (public story page)

Hero: dawn at Cape Spear (old square lighthouse, sweeping beam, iceberg); live clock ("Right now on the Rock", real `America/St_Johns` time and the offset from the viewer); "Say it right: New-fun-LAND rhymes with understand".

Chapters (ten things, pinned on the chart):
1. **The island, pin by pin:** chart traced from real coordinates (`site/src/data/base-camp/newfoundland-map.json`: main island, Fogo, New World Island, Bell Island, St. Pierre and Miquelon, the Labrador shore), Iceberg Alley, Grand Banks, Titanic marker at the bottom edge ("about 370 mi south", links to Iceberg Alley), Gander label; pins and legend highlight each other; "Not to scale".
2. **The rock itself:** (1) older than the Atlantic: rock layers that open, Split the continents; (2) first light, half an hour ahead: live world clocks; (3) Iceberg Alley: hover to see the 90% under water; season strip that marks this month.
3. **Who came by sea:** (4) Vikings c. 1000 AD; (5) white gold, the cod, with the St. Pierre and Miquelon stamp; (6) St. John's, Signal Hill, Jellybean Row. Big gradient headlines need room for descenders.
4. **The war years:** (7) a dominion at war: the 2 years, 3 months bar, the four bases, Bell Island 1942 (hedged wording), Placentia Bay 1941, and four stamp cards (Forestry Unit, 166th Field Regiment, 125 Squadron, At sea).
5. **The people:** (8) Gander, Sept 11 (38 large planes in three rows, counters); (9) the way we talk (word of the day, rotates daily; flip cards); (10) two breeds named for the island: the Newfoundland dog (swimming rescue scene, stats, coats) and the pony (stocky, shaggy; hover: says hello), plus Famous Newfoundlands stamp cards (Seaman 1804, Boatswain 1808, Nana 1904, Gander 1941).
6. **Kind words (Puffin Post):** see Kind Words below. Chapter lede: "Newfoundlanders are famous for their hospitality. Share a story or a few kind words that'll make someone smile."
7. **A thousand years on the Rock:** sideways timeline, then Ask BOOMBOT and "Back to camp".

Round badges are not used here (they look like earnable site badges); medals are perforated stamps. Fact corrections from the review are already in the mockup text; keep them.

## Page 3: /base-camp/skipper (public story page; the cam is Fan Club)

Hero: taped polaroid with the hero loop (Skipper on the float), "Meet Skipper", tags (Pembroke Welsh Corgi, Co-host, Fan favorite), Skipper Cam status chip, "Watch the Skipper Cam" and "Send her some love" (jumps to chapter 5).

1. **Meet Skipper:** intro (keeps the tummy-rub ending) and two snapshots (Nap time, Treat?). **Favorite things** (E1 card chrome): Herding balls (clip), Frisbee catches (clip), Neighborhood walks (clip), Daytime naps (photo), Pool days (clip), Playing ball (clip).
2. **Skipper Cam** (Fan Club): live = muted embed with Live badge; off = painted sleeping Skipper in her bed + "last on"; visitors = blurred screen + lock card. Rules shown: sound always off, Fan Club only, turns itself off.
3. **All about corgis:** Wales (real outline), cor + ci, the fairy saddle; Pembroke vs Cardigan (red Pembroke, blue merle Cardigan, both drawn); numbers (10–12 in, up to 30 lb, 12–13 yrs, #11 Coren); the Queen's corgis timeline (1933, 1944, Dorgis, 2012, 2018, 2022 "found a new home with family"); six quirks on royal shield crests (flip cards).
4. **The reel:** masonry of photos and clips with a lightbox, order: Nap time, Frisbee run, Noodle cruise, Too cool, Did someone say treat?, Popcorn bandit, Ball patrol, All ears, Couch loaf, Sleepy sleeps.
5. **Skipper love:** lede "Two ways to reach her: real mail to the PO box, or a quick note right here."
   - **Pup Post (real mail):** the sitting corgi by the mailbox, wordmark PUP POST, "Send real mail", then the Pup Post mail card (below).
   - **Paw Notes (online):** wordmark PAW NOTES, "Leave a note for Skipper", intro ending "Every note is read before it goes up. Be one of the first to write to her.", button "Leave a note"; Kind Words board `skipper` rendered as coloured pinned notes with a teal paw pin (not letters, so they don't read as mail).
6. Ask BOOMBOT and "Back to camp".

**Corgi drawings:** look A (painted): gradients, rim light, fur strokes and a fine displacement "fur" edge. Standing (yard scenes, comparisons), sitting (by the Pup Post mailbox), sleeping (cam off, Base Camp hero). Palettes `.cgr` (red) and `.cgm` (blue merle).

**Media:** Cloudinary `skipper/` with fixed public ids from `media-manifest.json`, uploaded by `functions/scripts/upload-skipper-media.js` (dry run first, never overwrite, `--from-secret-manager`, `recordAssetCreated` feature key `skipper`). Videos autoplay muted, loop, `playsinline`, and only play while on screen. Reduced motion: posters only.

## Kind Words engine (shared; boards `newfoundland` and `skipper`)

- **Data:** `sites/boomertanger/kindWords/{id}`: `board`, `uid`, `handle` (snapshot), `connection`, `place` (optional, ≤40), `text` (20–600, plain, links stripped), `status` (`pending` | `approved` | `rejected` | `withdrawn` | `hidden`), `featured`, `createdAt`, `reviewedAt`, `reviewedBy`, `rejectNote` (private).
- **Board themes:** newfoundland = Puffin Post (postcards); skipper = Paw Notes (pinned notes).
- **Connections:** newfoundland: I'm from here / I live here now / I've visited / Never been, but…; skipper: Watches her on stream / Met her in person / Corgi owner / Just a fan.
- **Rules:** no client writes. Read if `status == "approved"`, or if `uid == request.auth.uid` (own cards). `rejectNote` is never readable by the author.
- **Callables:** `kindSubmit` (signed-in members only; 3 per day per person; 1 pending per board; length check; strip links; existing name check flags the item for review), `kindWithdraw` (author, while pending), `kindReview` (admins: approve, reject with optional private note, feature/unfeature, hide; never deletes; adminLog feature `kindWords`).
- **Wall:** featured first, then newest; 12 at a time with Load more; the author's own pending card shows "Under review" (teal) with Withdraw; rejected shows a quiet "Not posted" to the author only. Empty state: the puffin (Newfoundland) or the mascot (Skipper). Visitors read; the composer needs sign-in (lock card opens E1).
- **Composer:** `openModal()` with connection chips, optional town (Newfoundland), story with a live counter, live preview (postcard or letter). Celebratory moment: the puffin flies off with the postcard (Newfoundland); the note gets pinned to the wall with the paw pin (Skipper).
- **Admin:** "Kind words" card on /admin (pending count) → `/admin/kind-words` tool page: Pending / Approved / Hidden / Rejected tabs, board chips, cards with Approve (admin green), Reject, Feature; the green POSTED stamp on approve; "All caught up" empty state.
- Escape all user text; never render it as HTML.

## Pup Post mail card (Fan Club only)

- Shown on /base-camp/skipper (chapter 5) and /base-camp (chapter 5).
- Airmail envelope: "Send real mail", "Letters, cards and drawings are welcome", "Write to Boomer, to Skipper, or to both. Boomer opens and reads mail live on stream, and return addresses always stay off camera.", "Rather keep yours off stream? Write “just for Boomer” on the envelope. Please don't send food or treats.", "Fan Club members only. Please keep the address in the club."
- Members: "To: Boomer or Skipper", the address lines, **Copy address** (copies the lines joined by newlines).
- Visitors: blurred placeholder bars (no address in the HTML) + lock card "The address is for Fan Club members" / "Fan Club members can send real mail to Boomer and Skipper. Join free to see the address."
- Data: `sites/boomertanger/memberContent/mail { to, lines[] }`, seeded by `seed-base-camp.js` from the `mail` block in the gitignored member file. The owner types the address into that file himself. The seed refuses to write `mail` while any line still says REPLACE_ME, and never prints the address.
- Reusable later on /contact for members.

**On-stream mail rules (for Boomer):** open envelopes off camera and set the envelope aside before showing the letter; read first names or handles only; skip last names, streets, schools and phone numbers written in letters; kids' mail: first name only, no photos of children without a parent's clear OK; "just for Boomer" letters are read off stream.

## Skipper Cam

- An unlisted YouTube live stream from a dedicated camera in the office (setup is Boomer's; not part of this build).
- `sites/boomertanger/public/skipperCam { live, since, lastOn }` is public; the video id lives in an owner-only doc and is handed out by `skipperCamWatch` to signed-in members only while live (same pattern as `backstageWatch`).
- `skipperCamSet` (owner): go live needs the three privacy checks (sound off; no screens/mail/papers with private details; nothing out the window that shows where we live and nobody in frame who hasn't agreed) and a video id; turning off is always allowed. adminLog feature `skipperCam`.
- `skipperCamSweep` (scheduled, every 15 minutes) turns it off after 12 hours.
- /admin card: status, video id field, the three checkboxes, Go live (disabled until all checked), last on.
- Embed: `youtube-nocookie.com`, `mute=1`, no audio control.

## Privacy and media rules

- Strip all metadata before upload. Videos are re-encoded with no metadata and no chapters; photos are re-saved with no EXIF. The upload script refuses any file that still contains location, date or device tags (QuickTime location keys, EXIF GPS/Make/Model/DateTime).
- Check what's in the frame, not just the tags: no house exteriors, house numbers, street signs, faces of people who haven't agreed, hands where avoidable, the dog's name tag, or private screens.
- The provided media pack is already stripped and cropped; the check still runs.

## Services and docs

- Service manifests for the three pages (follow existing manifests and `scripts/check-services.js`).
- ROADMAP: Base Camp workstream entry with status; launch checklist items below.
- CHANGELOG: one line per part under "Unreleased".

## Launch checklist (add to ROADMAP)

- Deploy firestore.rules (kindWords, skipperCam, memberContent check) to production.
- Deploy `kindSubmit`, `kindWithdraw`, `kindReview`, `skipperCamSet`, `skipperCamWatch`, `skipperCamSweep` to production (only those; confirm the served revision and the sweep's scheduler).
- Run `seed-base-camp.js --apply` on production (includes the mail doc; the real address must be in the member file first).
- Run `upload-skipper-media.js` on production (records only; files already uploaded with fixed ids).

## Later

- Admin editor for Base Camp text; real photos for Newfoundland; more Skipper clips; Skipper Cam auto-detect from YouTube; approval alerts to authors once Boom Alerts ships; guest posting on Kind Words (Turnstile + hashed-IP limits) if wanted.


## Addendum 2: Mail Call (confirmed Oct 11, 2026)

Mockup: `docs/design/mockups/base-camp-mail-call.html`.

**Route:** `/base-camp/mail-call`, the fourth stop in the Base Camp bar (The story / Newfoundland / Skipper / Mail Call). Not in the header nav. Public page; the address is Fan Club only; writing notes needs sign-in.

**Sections**
1. **Hero:** MAIL CALL in large white letters with a soft glow, "Fan mail, opened live", "Send real mail to Boomer and Skipper, and Boomer opens it live on stream. Not a letter writer? Leave a note right here.", buttons Send real mail / Leave a note. Scene: glowing ON AIR sign; desk lamp on the left lighting the letter (beam + pool of light; reduced motion = still); the mascot reading a letter in the middle; a small MAIL sack on the right; envelopes on the desk and floating. Nothing overlaps.
2. **Send real mail:** the Pup Post mail card. This is now the only place the address appears.
3. **How Mail Call works:** 4-step journey (Write it; It reaches the PO box; Opened live; Read on stream) and four promise cards (return addresses stay off camera; first names or handles only; "just for Boomer"; no food or treats).
4. **Notes for Boomer:** Kind Words board `boomer`, torn notebook pages with a gold margin and a small mascot seal. Connections: Watches on Twitch / Watches on TikTok / Watches on YouTube / Fan Club member. Lede "Not a letter writer? Leave a note right here. Every note is read before it goes up." Link cards: Notes for Skipper (her page) and Something private? (Hotline Boom).
5. **Mail Call on stream:** "Mail Call happens live. Check the schedule to catch the next one." See the schedule / Watch live; Ask BOOMBOT (What is Mail Call? / Can anyone see the address? / Will my letter be read on stream? / What shouldn't I send?); Back to camp.

**Changes elsewhere**
- Skipper page chapter 5 and Base Camp page chapter 5: replace the full mail card with the teaser ("Skipper gets real mail too" / "Send Boomer real mail", Go to Mail Call). Paw Notes stays on the Skipper page.
- /contact (Hotline Boom): one line, "Fan mail for Boomer or Skipper? It goes to Mail Call."
- Kind Words: add board `boomer` (connections above) everywhere boards are listed (kindSubmit validation, the /admin/kind-words board chips).
- Service manifest for base-camp-mail-call.

**Later:** a list of past Mail Call streams with VOD links; a mail counter; letter of the month.


## Addendum 3: The rise and "The rise, replayed" (confirmed Oct 15, 2026; option B)

Mockup: `docs/design/mockups/base-camp-rise.html` (the repo copy has the Fan Club panel text removed).

**Depends on:** Creator Climb on staging (`docs/specs/creator-climb.md`) with `sites/boomertanger/public/climb` written: `totals { all, twitch, tiktok, youtube }`, `monthEnd[] { month, day, all, twitch?, tiktok?, youtube? }`, `milestones[] { id, platform, value, day }`, `eras[]`, `members`. Base Camp reads it and never writes it. **Base Camp hard-codes no follower numbers.**

**Journey (chapter 03), option B**
- Stage 4 "The rise", label "2024 to 2025". Its Fan Club panel now ends "…and in August he started streaming on YouTube." (was "added YouTube").
- New stage 5. Card (public): label "2026", title "The build", line "Stream schedule paused, a website took shape, and {all-10000.value} anyway." Tag: "Under construction" (gold, small crane icon) until `public/climb.eras` contains an era named "Back on air"; then "Back on air" (lime). No code change at launch.
- Stage 5 panel (Fan Club, member file, numbers and date filled from milestone all-10000): the text is in the gitignored member file (`functions/scripts/data/base-camp-member.json`, `stops.build`), never in the repo; it uses `{all-10000.value}` and `{all-10000.day}`, filled on the page from public/climb.
- Five stages: desktop one row; at 900px and narrower the row scrolls sideways (scroll-snap, the selected stage scrolled into view), keeping the horizontal line and numbers.

**The rise, replayed (replaces "Then and now")**
- Public. Hidden entirely if `public/climb` doesn't exist.
- Steps: every `monthEnd` month from Jan 2025, then **Today** (`totals`). No gap steps: months with no reading are skipped, and the curve connects the last month-end straight to Today (follower counts only change on stream days, and nothing has changed since the last stream).
- Scrubber: `role="slider"`, value text like "June 2025: 2,584 followers"; drag, tap, arrow keys, Home, End. Track shows the total curve (connected through to Today), era bands with names, milestone dots (10,000 larger, lime), the Today point and a purple thumb. Ticks: Jan 2025, Jun 2025, Jan 2026, Jul 2026, Today.
- **Play the climb** steps through in about 10 s and lands on Today; any touch on the track stops it.
- Display: month and era name; big rolling total with "followers on {day}, the month's last reading" (Today: "followers right now"); three platform bars (official icons; a dash and no bar where a platform has no value); the story line.
- Flares going forward only, gold/lime/gray: TikTok 1,000; 5,000 combined; 10,000 combined is the big one (lime, sparks) and also lights the stage 5 card.
- No gap or "paused" segment. Never invent values for months without a reading; just skip them.
- Link: "See every stream day on Creator Climb →" to /climb.
- Reduced motion: no rolling, no flares; values still change; Play steps without animation.
- Kit: new `.bt-scrubber` (track, bands, dots, thumb, keyboard + value text) in bt-ui with a UI kit page entry.

**Story lines** (public, in `site/src/data/base-camp.json`, keyed by month or milestone id; `{…}` filled from public/climb; four fixed facts stay as plain text):
- 2025-01: "This is where the data starts: {2025-01.all} followers."
- 2025-05: "The night before the Granny Gauntlet: {2025-05.all} followers."
- tiktok-1000: "TikTok passes {value} on {day}, {days since 2025-06-02} days after the Gauntlet's first stream. It was at 125 on June 2." (125 = fixed fact)
- 2025-06: "{2025-06.all} by the end of June, more than {floor(2025-06.all / 2025-05.all)} times May's {2025-05.all}. A new TikTok layout and the Granny Gauntlet did that."
- 2025-08: "On August 8 he started streaming on YouTube. The channel already had 443 subscribers." (443 = fixed fact)
- 2025-09: "{all-5000.value} combined on {all-5000.day}. That month also set records: 577 peak viewers on TikTok and 22 subs gifted in one Twitch stream." (577, 22 = fixed facts)
- 2026-01: "{2026-01.all} to start 2026. Then the scheduled streams pause so Boomer can build boomertanger.com."
- all-10000: "{value} across all three on {day}, with the schedule still paused."
- today: "Today: {totals.all} and counting."

**Expected values to check on staging** (public/climb wins if different; report it): month ends 2025-01 = 161, 2025-05 = 207, 2025-06 = 2,584, 2025-09 = 5,769 (515 / 4,701 / 553), 2026-01 = 7,648, 2026-05 = 9,498 (May 13: 615 / 8,120 / 763), 2026-06 = 9,691 (Jun 20), 2026-07 = 10,266 (Jul 28), 2026-08 = 10,685 (Aug 17), 2026-09 = 10,924 (Sep 7: 653 / 9,450 / 821); milestones tiktok-1000 = 2025-06-10, all-5000 = 2025-09-08, all-10000 = 2026-07-19 (Jul 19 reading 634 / 8,750 / 802 = 10,186). No streams since Sep 7, 2026, so Today should equal the Sep 7 reading until the next stream.

**Removed:** "Then and now", its Sept 30, 2025 numbers and the socials fallback.
