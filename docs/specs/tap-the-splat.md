# Tap the Splat — footer game spec (v7 + L3 look)

Status: approved. Source of truth for visuals, timings, animations and sounds: `docs/design/mockups/tap-the-splat.html` (use its defaults; the pinned-bar switches only exist for comparison). This spec records the rules.

## What it is
The site footer is a hidden point-and-click puzzle game. Nothing says "game": the footer shows the blood splatter, mascot, BOOMERTANGER wordmark and "Built for horror gaming". Tapping the splat starts it. Visitors who only want to navigate can stop after the chain and use the links normally.

## Footer look (desktop, "L3 Spotlight aligned")
- Footer background near-black (#040404, as a token) with a soft spotlight cone falling from the top centre onto the splat.
- A full-width 1px hairline at the top of the footer, mirroring the header's bottom border.
- The game bar (title, meter, clocks, sound, leaderboard) is a HUD strip: rounded, 1px border, subtle dark gradient, on the SAME content width as the page's bento/content container (share one container token, e.g. `--bt-content-max`), so its edges line up with the cards above at every width.
- The legal row sits on the same content width.
- Phones keep the current footer look unchanged.

## Layout (idle)
- Game bar: "TAP THE SPLAT" in bright blood red (`--bt-blood`) with blood drips hanging from specific letters; green completion meter; TIME and PENALTY panels (yellow digits) hidden until play starts; sound toggle; leaderboard button (everyone can open it).
- Phones: the game bar is one row: title, completion meter (the bar shrinks to fit, down to about 24 px), sound, and the leaderboard button. The TIME / PENALTY clocks take a second row while playing.
- Centre: bright red splatter (pulses on hover), mascot, wordmark, tagline in `--bt-primary` with neon glow. Generous space above and below the splat.

## Rounds and completion %
| # | Round | Player action | Meter |
|---|---|---|---|
| 1 | Start | Tap the splat (slop sound). Links fan out in an ellipse (phones: 2-column grid). Clock starts. Page scrolls smoothly to the bottom of the footer. | 5% |
| 2 | Firefly | Automatic. A glowing firefly flies an S-shaped path (random height and direction) lasting 2.6–5 s, then hits the B of "Built". The flight counts toward the time. Tagline zaps bright, then flickers (words only, via colour, not opacity), and the skull pull chain drops at the same moment with a springy bounce and pendulum swing. | 10% |
| 3 | Pull chain | Pull the skull handle. Flicker stops, chain disappears, Contact and Follow appear; page scrolls to the bottom. Their power-up waits for that scroll to finish (see Contact + Follow below). | 20% |
| 4 | Breaker | A breaker switch appears in a gap of the link ring (desktop, like the hammer, cutters and outlet; phones: a top corner of the play area). Ignored = links work normally. Flip it (KACHUNK) = lights flicker out and all eight links go dark. | 25% |
| 5 | Links | Hover each link (tap on phones) to relight it with a red border. | +2.5% each, 45% |
| 6 | Power cut | TANGER goes dark grey; a cord runs from the bottom of the R to a plug at a random spot below the wordmark; an outlet appears in a gap of the link ring (desktop, like the hammer and cutters; phones: a random spot above), far from the plug and never over a link. Drag the plug in (the cord stays visible right into the plug): TANGER rises smoothly from dim to a steady bright glow in about 1 s (no blinking or pulsing), with a rising power-up zap. Click TANGER to restore it. | 52%, 57% |
| 7 | Loose letters | TANGER trembles (blocky crumble sound); A, G and R come loose. A hammer appears in a gap of the link ring (desktop: right, left, top or bottom middle of the ring around the hub, with a small random jitter, never over a link or at the screen edge; phones: a top corner of the play area); pick it up (it follows the cursor) and knock each letter back. On phones the hammer and cutters are tap to pick up, then tap the target (no dragging). | +4% each, 69% |
| 8 | DANGER | The T flips to D. Click it: the bomb appears in the first O with a braided burning fuse that reaches the bomb (smoke, embers, hiss; 11 s); wire cutters appear in a gap of the link ring, like the hammer. Pick them up and snip the fuse. Fuse without cutters = penalty + hint; clicking the bomb or running out of time = explosion. | 73%, 76%, 85% |
| 9 | Catch the blood | One link at a time lights blood red; hit it before it moves (window 1.4 s shrinking to 0.6 s). Catches register on pointerdown. Missing one or hitting the wrong link = lose. 10 catches; the last plays a short sting. | +1.4% each, 99% |
| 10 | Finish | The splat pulses (no hint text). Tap it: splat sound, then a horror-organ victory fanfare, win screen. | 100% |

## Contact + Follow ("Shared power", design-system.md §8f)
- One node where the chain hung feeds a hanging cable to every Contact and Follow badge (`docs/design/mockups/footer-power.html`).
- **The power-up waits for the scroll.** After the chain pull the page scrolls to the bottom; the power-up (sparks, cable glow, ring flashes, count-up) starts only once that scroll has finished (`scrollend` where supported, otherwise 150 ms with no scroll events) and at least 60% of the section is on screen, 200 ms after that. Safety net: 1.5 s after the pull it starts anyway if the section is on screen at all, or else as soon as it scrolls into view. Same on phones and desktop. Keyboard focus reveals and powers it at once.
- **Show and Copy: "Pulse and type"** (`docs/design/mockups/contact-copy.html`, style A). Show: a soft white pulse, glowing in the contact's colour, runs down that contact's cable from the node (650 ms), the ring blooms, and the address types out (28 ms a character) in a readout line under the Contact row (rounded, 1px border, a faint tint in the contact's colour, monospace) with a blinking cursor that goes 0.9 s after typing ends; the button becomes Copy. Copy: the address is copied, its characters light up left to right, the pulse runs back up the cable, the ring ripples, a COPIED tag pops beside the line and fades after 1.6 s, and the button shows a solid "Copied ✓" in the contact's colour for 1.8 s. If the clipboard write fails the tag says "Press and hold to copy" and the address is selected. Lines stack when several contacts are shown; the cables stay attached as the section grows, and a new line that lands below the visible area scrolls just into view (smoothly; a jump under reduced motion). When the footer collapses back to idle (the splat tapped, a tap-out, an end card closed) every revealed address is removed from the page, the buttons go back to Show and any typing, pulse or Copied timers are cancelled, so Contact starts fresh next time. Addresses are still joined in the browser, never in the HTML; the readout is aria-live polite. Reduced motion: no pulse, typing or ripple; the address appears at once and Copy still confirms.

## Timing and scoring
- Time is the only score, shown m:ss.cc. Every miss-click in the play area adds 1 s ("+1s" floats up; PENALTY counts them). The clock never pauses.
- Only members' completed runs (verified email) get on the leaderboard, but everyone can open it: guests see the board (what they're missing) with "Only members make the board. Join free" under the rows, which opens the sign-in dialog on its Join tab. Separate Desktop and Mobile boards; columns: #, Member, Date, Time. On phones, opening the leaderboard grows the footer so all ten rows can be scrolled to.
- Tapping the splat mid-game taps out: everything collapses to idle, "Tapped out at N%" toast (below the game bar, above the splat), clock stops and resets.

## End screens (splatter style)
- Card on the blood splatter, centred on the play area (phones: top of the play area, scrolled into view); play area dims behind it. No close button: any click that is not a button closes it and collapses to idle. For the first 2 seconds after it opens (win or lose), it ignores all clicks and taps (on the card and the dimmed play area) and its buttons show dimmed, then fade in, so quick follow-up clicks from the last round can't close it by accident.
- Layout 2 "Play first", Spooky wording (Boom Arcade step 1; full wording, placement lines and states in `docs/specs/arcade-step1.md` §1). Every result, top to bottom: gold title, big time, one line, pills (Desktop or Mobile, v1, +Ns penalties or "no miss-clicks" on wins), solid green Play again, placement line, the two vote buttons with counts, run counts ("8.4K runs · 612 finished", from `games/tapTheSplat.stats`), teaser card.
- Titles: You survived (win), It got away (missed), Wrong one (wrong link), Boom (bomb).
- Votes: "👍 I liked it" and "🎮 Make more games", each once per run (locked after pressing, unlocking on the next play), with counts. This replaces the old "▲ I liked it" / once-per-person rule.
- Placement: members see their board place, a personal best that didn't place, or why the run isn't on the board (verify email, finish signup, losses). Visitors see "Finished runs by members go on the leaderboard."; their "See leaderboard" and the teaser's Join free open the sign-in dialog on its Join tab, because the Arcade pages are members only.
- A run the server didn't record (offline, start failed, refused build) says "This run wasn't recorded." with no votes or placement.

## Sound (Web Audio synthesis, no files)
Slop (start and tap out: sounds/slop-custom.js from Slop lab, values as approved; a heavy low thump, a wet squelch with bubbles, a short sticky pull and a cafeteria echo, about 1.7 s), splat (the finish tap only; gooey and sloppy: a soft wet slap, a resonant downward "shlop" with a wet wobble, goo bubbles and a sticky tail; no bright clicks; varies slightly each time), zap, chain clinks and pull, KACHUNK, rising power-up zap, blocky crumble, hammer thunk, fuse hiss, snip, explosion (about 1 s: a sharp crack, a roaring blast sweeping down, crackling debris, a rumbling tail), doom organ on lose screens (sounds/doom-organ.js: a sagging dissonant organ chord over a low bass, about 2.2 s; the only lose sound, no buzz: "Missed one." and "Wrong one." play it as the card appears; "Boom." plays it about 1 s after the explosion, as the card appears), catch blips, sting, victory fanfare, buzz (DANGER only), penalty blip. Toggle in the bar; preference in localStorage. iOS: unlock on first touch; `navigator.audioSession.type = "playback"`.

## Accessibility, motion, performance
- Real buttons (or role=button with keyboard support); links remain normal links outside the game; the header nav covers the same pages.
- prefers-reduced-motion: animations shortened; the game stays playable.
- The idle footer is plain HTML/CSS; the game module loads with a dynamic import on the first splat tap.

## Data (Boom Arcade step 1; details in `docs/specs/arcade-step1.md` §4–§6)
- Everything lives under `sites/boomertanger/games/tapTheSplat` and is written only by Cloud Functions: the game doc (with rolled-up `stats`), `versions/v1` (build 1.0, checks), `versions/v1/runs/{runId}`, `bests/{uid}_{device}`, `boards/e{epoch}_{device}_{period}` (top 100, weekly and all-time), `counters/{0-9}`.
- Every run, visitor or member, goes through the shared callables: `startRun` at the first splat tap (without blocking the clock), `finishRun` at the end (server timing and split checks), `voteRun` for the two votes. Tap-outs are stored but not counted.
- Only passing wins by signed-up members with a verified email reach the boards; one row per member per board (their best), ties go to the earlier run. Weeks start Monday 00:00 America/Chicago (Central).
- Drop-off comes from stored runs (`reached`, `splits`), so there's no `trackEvent`.
- The leaderboard popover reads the real board doc in every environment (no more PREVIEW DATA; the trophy shows in production too).

## Design system notes (§8)
- Exception: the completion meter and Play again button use green (otherwise admin-only); the Arcade's Play now joins it (§8h).
- Tokens: `--bt-blood`, glow tokens (red, green, gold, primary), mascot brand tokens, footer spotlight background, shared `--bt-content-max`.
