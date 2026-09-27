# Tap the Splat — footer game spec

Status: approved from the playable prototype (`docs/design/mockups/tap-the-splat.html`, v6). The prototype is the source of truth for visuals, timings and sounds; this spec records the rules.

## What it is
The site footer is a hidden point-and-click puzzle game. Nothing says "game": the footer shows the blood splatter, mascot, BOOMERTANGER wordmark and the tagline "Built for horror gaming". Tapping the splat starts it. Visitors who only want to navigate can stop after round 3 and use the links normally.

## Layout (idle)
- Top bar: game title "TAP THE SPLAT" (blood-drip style, letters with aligned drips) top left, green completion meter beside it. TIME and PENALTY arcade panels are hidden until play starts. Sound toggle and a members-only leaderboard button on the right.
- Centre: bright red splatter (pulses on hover), mascot, wordmark (BOOMER off-white, TANGER gold), tagline in `--bt-primary` with a neon glow.
- Legal row underneath.

## Rounds and completion %
| # | Round | Player action | Meter |
|---|---|---|---|
| 1 | Start | Tap the splat. Links fan out in an ellipse around the hub (phones: 2-column grid). Clock starts. | 5% |
| 2 | Firefly | Automatic. A firefly wanders in on a random 2–5 loop path (clock paused during flight), hits the B of "Built". Tagline zaps bright, then flickers (words only); the skull pull chain drops at the same moment with a springy bounce and swing. | 10% |
| 3 | Pull chain | Pull the skull handle. Flicker stops, chain disappears, Contact and Follow appear at the bottom. | 20% |
| 4 | Breaker | A breaker switch appears at a random spot. Ignored = links work normally. Flip it (KACHUNK) = lights flicker out and all eight links go dark. | 25% |
| 5 | Links | Hover each link (tap on phones) to relight it with a red border. | +2.5% each, 45% |
| 6 | Power cut | TANGER goes dark grey; a cord runs from the bottom of the R to a plug lying at a random spot below the wordmark; an outlet appears at a random spot above, always far from the plug and never over a link. Drag the plug into the outlet: TANGER powers up (dim to bright, rising zap sound) and holds a steady glow. Click TANGER to restore it. | 52%, 57% |
| 7 | Loose letters | TANGER trembles (crumble sound); A, G and R come loose. A hammer appears at a random spot; pick it up (follows the cursor) and knock each letter back. | +4% each, 69% |
| 8 | DANGER | The T flips to D (red flicker). Click it: the bomb appears in the first O with a burning braided fuse (smoke, embers, hiss; 11 s), wire cutters appear at a random spot. Pick them up and snip the fuse. Clicking the fuse without cutters = penalty and hint; clicking the bomb or running out of time = explosion (lose). | 73%, 76%, 85% |
| 9 | Catch the blood | Links dim; one at a time lights blood red. Hit it before it moves (window shrinks from 1.4 s to 0.6 s). Catches register on pointer down. Missing one or hitting the wrong link = lose. 10 catches. | +1.4% each, 99% |
| 10 | Finish | The splat pulses (no hint text). Tap it: splat sound, victory fanfare, win screen. | 100% |

## Timing and scoring
- Time is the only score. Display m:ss.cc (hundredths).
- Every miss-click inside the play area adds 1 s (red "+1s" floats up; PENALTY panel counts them).
- The clock pauses while the firefly flies, so random flight length never affects a time.
- Only completed (100%) runs get on the leaderboard. Separate Desktop and Mobile boards (phones play a different game).
- Tapping the splat mid-game taps out: everything collapses back to idle, small "Tapped out at N%" toast, clock resets.

## End screens (splatter style)
- Card floats on the blood splatter; the play area dims behind it. No close button: clicking anywhere that is not a button closes it and collapses to idle.
- Win: "YOU BEAT TAP THE SPLAT", big time, "100% complete · includes Ns of miss-click penalties" (or "no miss-clicks"), Desktop/Mobile run label. Members: leaderboard placement. Visitors: "Completed runs by members make the leaderboard." + Join free button.
- Lose (Boom. / Missed one. / Wrong one.): big time so far, "You made it N% of the way.", "Only completed runs make the leaderboard.", Join free for visitors.
- Buttons: "▲ I liked it", "🕹 Make more games" (counted once per person), solid green "Play again".

## Sound
All effects are synthesised with the Web Audio API (no audio files): splat, zap, chain clinks and pull, KACHUNK, power-up zap, crumble, hammer thunk, fuse hiss, snip, boom, catch blips, sting, victory fanfare, buzz, penalty blip. Sound toggle in the top bar; preference saved per browser. iOS: unlock on first touch and set `navigator.audioSession.type = "playback"`.

## Accessibility and motion
- All interactive pieces are real buttons (or role=button with keyboard support); the links remain normal links outside the game.
- `prefers-reduced-motion`: animations shortened or removed; the game stays playable.
- The footer links and contact/follow are reachable without playing (round 3 is always available, and the header nav covers the same pages).

## Performance
- The idle footer is plain HTML/CSS. The game module (JS + extra CSS) is loaded with a dynamic import on the first splat tap.

## Data (later milestone, needs accounts and Cloud Functions)
- Runs: `sites/{siteId}/games/tapTheSplat/runs/{runId}` created by a `startRun` callable (server timestamp) and closed by `finishRun` (server checks timing sanity, members only, one best time per member per device).
- Leaderboards: summary docs per device (`.../boards/desktop`, `.../boards/mobile`), written only by functions; weekly and all-time.
- Feedback: two counters ("liked", "wantMore"), one vote per member or browser.
- Usage: `trackEvent("tapTheSplat", "round:N")` rollups show where people drop off.
- Until then: leaderboard shows PREVIEW DATA on non-production builds only and is hidden in production; feedback buttons are visual only.

## Design system notes (record in design-system.md §8)
- Exception: the game's completion meter and "Play again" button use green, which is otherwise admin-only.
- New tokens for game colours: `--bt-blood` (bright title red), glow tokens for red/green/gold/primary, mascot brand tokens.
