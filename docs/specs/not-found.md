# 404 page: the workshop — spec

Oct 9, 2026 · Glenn Bowering · Confirmed (mockup approved: Workshop level 4, CRT TV, Bright core glow, light step 2 Dim).
Mockup: docs/design/mockups/not-found-workshop.html (https://claude.ai/artifact/QMNzqMDVSMXk59WVT61Gwd). Level 4 in the mockup is the build.
Supersedes the earlier "Lost firefly" bug-zapper drafts (not built).

## What it is
Any address on boomertanger.com that doesn't exist shows this page, with the normal header and footer. The left side is the real content: what happened and the ways forward. The right side (above the content on phones) is a pitch-black basement workshop. The green firefly from the Tap the Splat footer is the only light. On desktop it follows the mouse; left alone, it wanders. Whatever it lights shows up: tools and weapons on the wall, crawlers on the floor, eyes in the dark, a doll that watches it, a figure behind plastic sheeting, and an old CRT TV that shows 404 when you switch it on.

## Who sees it
Everyone (visitors, members, admins). Static page; reads only the live state the layout already has (`data-live`). The report button calls one function.

## Files
- `site/src/pages/404.astro` (replaces the placeholder). `<meta name="robots" content="noindex">`. Cloudflare Pages serves `404.html` with a real 404 status; there must be no catch-all rewrite that hides it.
- `site/src/styles/not-found.css` — page layout, scene, art palette, TV, effects.
- `site/src/scripts/not-found/workshop-art.js` — the SVG builders (ported from the mockup's `A` and `W` modules, level 4 only).
- `site/src/scripts/not-found/room.js` — the engine (ported from the mockup's `Room`).
- `site/src/lib/routes.js` — known public paths for "Did you mean", generated at build from `src/pages` (no dynamic, admin, dev or API routes).
- Kit: `shared/ui/firefly.js` + `.bt-firefly` and tokens in `shared/bt-ui.css` (see Design system).
- Functions: `functions/lib/brokenLinks/report.js` (`reportBrokenLink`), plus the Mark fixed path (see Data).

## Page content (left column; always visible, never covered by the dark)
1. `.bt-title` "Page not found"; subtitle "Nothing lives at this address. It may have moved, or the link has a typo."
2. "`/path` isn't a page on this site." Path only: never the query string or hash (they can hold sign-in codes). Escaped, never used as markup. Shortened in the middle when long (56 characters desktop, 34 phone).
3. "Did you mean `/schedule`?" (primary link) only when the path is close to a known page: Levenshtein distance on the whole path ≤ max(2, 25% of its length), best match only; also match when one segment is a typo of a known segment.
4. Ways forward: Take me home (primary, `data-home`), Live, Schedule, Arcade (secondary; each only if its module is enabled, same rule as the nav). While live (`data-live` public or backstage): the top button becomes "Watch Boomer live" (primary purple with the red live dot), Home steps down to secondary and keeps `data-home`, and the Live button hides.
5. "Report this broken link" (ghost button) + hint "Sends only the address, so it can be fixed or redirected." States: ready → "Reporting…" (spinner) → "Reported. Thanks!" (lime check, disabled, hint "It's on the list to fix."), remembered for the session (`sessionStorage` key `nf:reported:<path>`); error → "Couldn't send. Try again." and the button re-enables.
6. Small caption with a firefly dot: "The firefly follows your mouse. Leave it and it wanders." (touch: "Tap the dark to send the firefly."; reduced motion: "The firefly's resting. Nothing moves.").

## Layout
- Desktop: `main` is near-black (`--bt-footer-bg`), min-height 580px. Text column up to 610px wide, aligned to the content edge, with a gradient behind it. The scene fills the rest (`left: clamp(380px, 40%, 600px)`) with a 140px fade on its left edge.
- ≤1024: text 420px, scene from `clamp(260px, 38%, 440px)`.
- ≤640: scene first, 380px tall, bottom fade; text below; actions in a 3-column grid with the primary button full width. ≤420: secondary icons hidden.
- Container queries only (bt 1024/640/420). Header, footer (Tap the Splat) and phone tab bar unchanged.

## The scene (level 4 in the mockup; port it, don't redraw it)
SVG, viewBox 900×600, `preserveAspectRatio="xMidYMid slice"`; important content stays within x 140–760. `aria-hidden="true"`.
- **Room:** cinder-block wall with rust streaks, a crack and grime; concrete floor with a drain; rusty pipe along the ceiling with a slow drip onto the bench (splash ring); cobwebs.
- **Wall:** pegboard with hacksaw, hammer, three screwdrivers, pliers; two painted empty outlines with "gone?" and "this one too"; a gas mask hanging where the chain was; a corkboard of four Polaroids with faces scratched out, joined by red string, "WHO'S NEXT?"; shelf with a rusty chainsaw and a jar of eyeballs; breaker box with the blown fuse; "DON'T STAY" scratched on the wall.
- **Bench and floor:** workbench with vise, handsaw and the CRT TV; "IT'S STILL HERE" and tally marks scratched in the dark under the bench; cardboard boxes ("TAPES"); sprung mousetrap; a chair facing the wall; a sledgehammer and an axe; bare footprints leading to the plastic.
- **Ceiling:** dead bulb, fly paper full of dead flies, two meat hooks on chains.
- **Plastic sheeting** on the right with grimy handprints, and the figure behind it.
- **Doll** (porcelain, one eye missing) sitting on the breaker box.
- No blood or gore anywhere: rust, grime, bugs, tools, shapes in the dark.

## The light
- Firefly glow = a hole in a full black layer (`mask-image`, two radial layers: firefly and TV, composited with `mask-composite: intersect` / `-webkit-mask-composite: source-in`).
- **Bright core, step 2 Dim** (fixed values, no switches on the real page): base radius 150px desktop / 112px touch × size 0.74; breathing ×(1 + 0.035 sin(t/700) + 0.018 sin(t/233)); extent = radius × 2.3; dim 0.2; alpha stops (before dim) 0.02 @7%, 0.28 @16%, 0.70 @26%, 0.90 @40%, 0.965 @68%, 1 @100%, each mapped to `dim + (1 − dim) × a`.
- Bloom (screen blend, radius × 0.62, opacity 0.55 × (1 − dim × 1.4)) and a soft-light tint in `--bt-firefly`.
- Dust motes (22) drift inside the light; a fixed film grain (opacity 0.1) sits over the art.
- Nothing flashes more than 3 times a second.

## The firefly
- Desktop: follows the pointer with a lag (spring); after 3.5 s without movement it wanders between points of interest (the mockup's level-4 list), pausing 0.9–2.5 s at each, sometimes a random spot.
- Touch: tap the dark to send it there; tapping near Take me home lands it there. Never blocks scrolling (no drag handling).
- Hover or focus on Take me home (or tap near it): it flies to the button's top-right edge, lands, and the button lights (`nf-lit`: neon ring + purple glow). Leaving releases it.
- Uses the kit firefly (`FIREFLY_SVG`, `.bt-firefly`). Layer over the whole `main`, `pointer-events: none`.

## The room reacts (reaction radius = light radius × 1.05)
- **Crawlers** (level-4 list: roaches incl. a small swarm, two centipedes, spiders, beetle, two rats, maggots near the drain, a scorpion): twitch and walk a little in the dark; flee at speed when the light reaches them; settle once it's 1.5× away. Legs animate only while moving.
- **Hanging spiders** (3): climb up out of the light fast, drop back slowly in the dark.
- **Eyes** (8 pairs, red `--bt-blood` / gold `--bt-lamp`, drawn above the dark): blink now and then; vanish when a light comes within 1.25× and return 2.6 s after it leaves.
- **Swinging things** (bulb, fly paper, gas mask, meat hooks): one damped swing when the light passes.
- **Doll:** head slowly turns (±28°) and its glass eye follows the firefly, always, lit or not.
- **Figure** behind the plastic: only visible when the firefly is between 0.55× and 1.45× the reaction radius from it (the edge of the light); when the light comes closer it fades fast and reappears somewhere else behind the sheet (x 725–845) after a pause.

## The CRT TV ("ZENTRON", bubble screen, rabbit ears)
- Standby LED (red, slow pulse) drawn above the dark, so it's findable. Click or tap anywhere on the TV to toggle.
- On: a thin line opens out (≈0.55 s), static fades (1.5 s), then "404" / "PAGE NOT FOUND" in cool white phosphor with scanlines, a rolling bar, vignette and glass reflections; LED turns `--bt-lamp`. Its glow is a second light (radius = firefly base × 0.95, same profile, no dim, cool `--nf-tv-glow` tint): crawlers flee it and eyes vanish near it.
- Off: screen collapses to a line, then a dot (0.4 s).
- **Won't stay off:** the first time it's switched off, it turns itself back on after 2.6 s. Once per page view.
- **BEHIND YOU:** 4.2 s after it first comes on, the screen shows "BEHIND / YOU" for 1.4 s and the figure is forced visible for 1.6 s. Once per page view.
- It's a toy, not a control: not focusable, nothing depends on it; the real 404 message is always in the text.

## Reduced motion
Final, still state: the firefly rests at the TV (scene point 500, 296) with its light there; no follow, wander, crawlers, blinking, swinging, drip, motes, doll turn or figure. The TV still switches on and off instantly (404 shown, faint static, no warm-up, roll, auto-on or BEHIND YOU).

## Performance
- Only this page loads the scene code and CSS. Code-drawn SVG and CSS, no images (grain is an inline SVG data URI). About 20 KB gzipped for art + engine.
- One `requestAnimationFrame` loop; pauses when the scene is off screen (IntersectionObserver) or the tab is hidden; stops on page hide.
- Without JavaScript: the text and links work; the scene shows as a dark panel.

## Data: Report this broken link
- Callable `reportBrokenLink({ path, referrer })`, open to visitors and members.
  - Server strips query and hash again; path must start with "/", max 300 characters; referrer reduced to its host, or "direct".
  - Rate limit by hashed visitor key (same pattern as Arcade visitor runs): max 10 reports per hour per key, and one per path per key per day (later ones return ok without counting).
  - Writes `sites/boomertanger/brokenLinks/{sha1(path)}`: `{ path, count, firstAt, lastAt, referrerHosts (≤5 unique), fixedAt: null, fixedBy: null }`. A report on a row with `fixedAt` set reopens it (`fixedAt: null`) and counts.
- Rules: admin read; no client writes.
- **/admin card "Broken links"** (green admin card, Admin only tag): open rows (`fixedAt == null`) sorted by count, top 20. Columns: Address, Reports, Last reported, Came from, and a green "Mark fixed" button. Empty state with the mascot: "No broken links reported."
- **Mark fixed** sets `fixedAt` and `fixedBy` (hides the row; never deletes) through `adminEditItem` if it already supports this; otherwise a small admin callable. Writes an `adminLog` entry (feature `brokenLinks`, action `fix`).
- Later: when Bug Zapper is ported, the report button opens Bug Zapper with the URL pre-filled instead.

## Design system
- **Kit addition:** `shared/ui/firefly.js` exports `FIREFLY_SVG`; `.bt-firefly` and tokens `--bt-firefly`, `--bt-firefly-shell`, `--bt-firefly-head`, `--bt-firefly-wing` in `shared/bt-ui.css`. The Tap the Splat footer game imports them (no copy). Added to the UI kit page.
- Colour meaning unchanged: purple only on the buttons and links; the firefly's yellow-green is a lamp, not admin green; TV phosphor is cool white; eyes use `--bt-blood` / `--bt-lamp`.
- Feature-only: the art palette, declared once as `--nf-*` custom properties in `not-found.css` (one per colour). The mask uses black alpha only.
- Fonts: the scratched and marker lettering uses a marker-style face (see the build prompt's stop-and-ask).

## Edge cases
- Odd characters or HTML in the path: escaped. Query strings and hashes: never shown or sent.
- Old Squarespace URLs after launch: real moves go in Cloudflare `_redirects`; Did you mean is the backup and the reports show what's missing.
- Visitor + Arcade button: lands on the members-only gate (the sales screen).
- Staging preview switches (`?as=`, `?live=`) work here too.
- Very wide or very short screens: the scene is cropped from the centre (slice), never stretched.

## Out of scope / later
- The Bug Zapper port (then the report button opens it).
- A "Show fixed" toggle on the admin card.
- Sound (a CRT hum or click when the TV turns on, respecting the footer's sound setting).

## Decisions made in the build (Oct 10, 2026)
- **Lettering:** the scratched and marker words ("gone?", "this one too", "WHO'S NEXT?", "TAPES", "IT'S STILL HERE", "DON'T STAY") are drawn as SVG outlines of Permanent Marker (Apache 2.0), generated once into `workshop-art.js`, so no font loads.
- **Mark fixed** uses a small admin callable, `brokenLinkFix`. `adminEditItem` wasn't used because it only edits text fields on top-level collections, and Mark fixed sets `fixedAt` and `fixedBy` on a `sites/{site}` subcollection.
- **Robots:** the page passes `noindex` to the layout, so the tag is `noindex,nofollow` (the layout's standard tag).
- **Did you mean** also leaves out, besides dynamic, admin, dev and API routes: the 404 itself, the `view.astro` rewrite targets behind `/games/:slug`, `/u/:handle` and `/join/:handle`, and the sign-in callbacks under `/auth`.
- **Referrer:** the page sends only the referrer's origin; the server stores only its host (or "direct").
- **Admin card:** reads the 100 most reported rows by `count` and shows the top 20 open ones (`fixedAt` null), so no composite index is needed.
