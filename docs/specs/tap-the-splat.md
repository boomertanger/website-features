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
- Game bar: "TAP THE SPLAT" in bright blood red (`--bt-blood`) with blood drips hanging from specific letters; green completion meter; TIME and PENALTY panels (yellow digits) hidden until play starts; sound toggle; members-only leaderboard button.
- Phones: the game bar is one row: title, completion meter (the bar shrinks to fit, down to about 24 px), sound, and the leaderboard button for members (visitors have no trophy, so their bar is a little longer). The TIME / PENALTY clocks take a second row while playing.
- Centre: bright red splatter (pulses on hover), mascot, wordmark, tagline in `--bt-primary` with neon glow. Generous space above and below the splat.

## Rounds and completion %
| # | Round | Player action | Meter |
|---|---|---|---|
| 1 | Start | Tap the splat (splat sound). Links fan out in an ellipse (phones: 2-column grid). Clock starts. Page scrolls smoothly to the bottom of the footer. | 5% |
| 2 | Firefly | Automatic. A glowing firefly flies an S-shaped path (random height and direction) lasting 2.6–5 s, then hits the B of "Built". The flight counts toward the time. Tagline zaps bright, then flickers (words only, via colour, not opacity), and the skull pull chain drops at the same moment with a springy bounce and pendulum swing. | 10% |
| 3 | Pull chain | Pull the skull handle. Flicker stops, chain disappears, Contact and Follow appear; page scrolls to the bottom. | 20% |
| 4 | Breaker | A breaker switch appears at a random spot. Ignored = links work normally. Flip it (KACHUNK) = lights flicker out and all eight links go dark. | 25% |
| 5 | Links | Hover each link (tap on phones) to relight it with a red border. | +2.5% each, 45% |
| 6 | Power cut | TANGER goes dark grey; a cord runs from the bottom of the R to a plug at a random spot below the wordmark; an outlet appears in a gap of the link ring (desktop, like the hammer and cutters; phones: a random spot above), far from the plug and never over a link. Drag the plug in (the cord stays visible right into the plug): TANGER rises smoothly from dim to a steady bright glow in about 1 s (no blinking or pulsing), with a rising power-up zap. Click TANGER to restore it. | 52%, 57% |
| 7 | Loose letters | TANGER trembles (blocky crumble sound); A, G and R come loose. A hammer appears in a gap of the link ring (desktop: right, left, top or bottom middle of the ring around the hub, with a small random jitter, never over a link or at the screen edge; phones: a top corner of the play area); pick it up (it follows the cursor) and knock each letter back. On phones the hammer and cutters are tap to pick up, then tap the target (no dragging). | +4% each, 69% |
| 8 | DANGER | The T flips to D. Click it: the bomb appears in the first O with a braided burning fuse that reaches the bomb (smoke, embers, hiss; 11 s); wire cutters appear in a gap of the link ring, like the hammer. Pick them up and snip the fuse. Fuse without cutters = penalty + hint; clicking the bomb or running out of time = explosion. | 73%, 76%, 85% |
| 9 | Catch the blood | One link at a time lights blood red; hit it before it moves (window 1.4 s shrinking to 0.6 s). Catches register on pointerdown. Missing one or hitting the wrong link = lose. 10 catches; the last plays a short sting. | +1.4% each, 99% |
| 10 | Finish | The splat pulses (no hint text). Tap it: splat sound, then a horror-organ victory fanfare, win screen. | 100% |

## Timing and scoring
- Time is the only score, shown m:ss.cc. Every miss-click in the play area adds 1 s ("+1s" floats up; PENALTY counts them). The clock never pauses.
- Only completed runs get on the leaderboard. Separate Desktop and Mobile boards; columns: #, Member, Date, Time. On phones, opening the leaderboard grows the footer so all ten rows can be scrolled to.
- Tapping the splat mid-game taps out: everything collapses to idle, "Tapped out at N%" toast, clock stops and resets.

## End screens (splatter style)
- Card on the blood splatter, centred on the play area (phones: top of the play area, scrolled into view); play area dims behind it. No close button: any click that is not a button closes it and collapses to idle. For the first 2 seconds after it opens (win or lose), it ignores all clicks and taps (on the card and the dimmed play area) and its buttons show dimmed, then fade in, so quick follow-up clicks from the last round can't close it by accident.
- Win: "YOU BEAT TAP THE SPLAT", big time, "100% complete · includes Ns of miss-click penalties" / "no miss-clicks", Desktop/Mobile run label. Members: leaderboard placement. Visitors: "Completed runs by members make the leaderboard." + Join free.
- Lose (Boom. / Missed one. / Wrong one.): big time so far, "… You made it N% of the way.", "Only completed runs make the leaderboard.", Join free for visitors.
- Buttons: "▲ I liked it", "🕹 Make more games" (once per person), solid green "Play again".

## Sound (Web Audio synthesis, no files)
Splat (gooey and sloppy: a soft wet slap, a resonant downward "shlop" with a wet wobble, goo bubbles and a sticky tail; no bright clicks; varies slightly each time), zap, chain clinks and pull, KACHUNK, rising power-up zap, blocky crumble, hammer thunk, fuse hiss, snip, boom, catch blips, sting, victory fanfare, buzz, penalty blip. Toggle in the bar; preference in localStorage. iOS: unlock on first touch; `navigator.audioSession.type = "playback"`.

## Accessibility, motion, performance
- Real buttons (or role=button with keyboard support); links remain normal links outside the game; the header nav covers the same pages.
- prefers-reduced-motion: animations shortened; the game stays playable.
- The idle footer is plain HTML/CSS; the game module loads with a dynamic import on the first splat tap.

## Data (milestone 2: accounts + Cloud Functions)
- Runs: `sites/{siteId}/games/tapTheSplat/runs/{runId}` via `startRun` / `finishRun` callables (server timing checks, members only, best time per member per device).
- Boards per device, written only by functions; weekly and all-time.
- Feedback counters "liked" and "wantMore", one vote per member or browser.
- `trackEvent("tapTheSplat", "round:N")` for drop-off.
- Until then: leaderboard shows PREVIEW DATA on non-production builds only and is hidden in production; votes are visual only.

## Design system notes (§8)
- Exception: the completion meter and Play again button use green (otherwise admin-only).
- Tokens: `--bt-blood`, glow tokens (red, green, gold, primary), mascot brand tokens, footer spotlight background, shared `--bt-content-max`.
