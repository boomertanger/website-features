# Boomertanger design system (`bt-ui`)

The live UI kit at **`/dev/ui-kit`** on the new site (staging and previews only; a 404
in production) renders every component below in every state with the real site CSS and
components — it's the visual source of truth. It mounts the Squarespace-era kit page
(`shared/ui-kit/`) as its "Shared kit" part and adds the site shell: tokens read from
the live CSS variables, the logo and mascot in every live state, the footer game, Contact
+ Follow, the sign-in dialog and signup steps, the account pieces and the home tiles,
with a desktop / tablet / phone switcher for the container queries. Source:
`site/src/pages/dev/[kit].astro`, `site/src/scripts/dev/ui-kit.ts`. This document is the
written one.

## 1. Loading

**Target (after the first release):** Squarespace Header Code Injection loads, once,
site-wide: the Inter font links and `shared/bt-ui.css` from a jsDelivr semver range
(`@1`). Feature Code Blocks load only the feature's own CSS + JS (also `@1`).

**Until then (staging):** each staging Code Block loads, in order:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/boomertanger/website-features@<sha>/shared/bt-ui.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/boomertanger/website-features@<sha>/features/<name>/<name>.css">
<div id="<name>-root"></div>
<script type="module" src="https://cdn.jsdelivr.net/gh/boomertanger/website-features@<sha>/features/<name>/<name>.js"></script>
```
After release, a staging page can still override the header's copy by loading
`bt-ui.css@<sha>` in its Code Block (later stylesheet wins).

### Staging loader
Staging pages use a small loader instead of commit-pinned URLs, so they
never need editing after a push. On every page load it asks GitHub for the
newest `dev` commit and loads the files pinned to that exact commit (so the
jsDelivr branch cache can't serve stale files). If GitHub's unauthenticated
limit (60 lookups/hour per visitor) is hit, it falls back to `@dev` and says
so. A small corner badge shows which commit is running. Template (replace
FEATURE_CSS, FEATURE_JS, ROOT_ID):
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<div id="ROOT_ID"></div>
<script type="module">
  // Boomertanger staging loader: always runs the newest dev commit.
  const REPO = "boomertanger/website-features";
  const CSS = ["shared/bt-ui.css", "FEATURE_CSS"];
  const JS = "FEATURE_JS";
  let sha = "dev", note = "fallback";
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/commits/dev`, { headers: { Accept: "application/vnd.github.sha" }, cache: "no-store" });
    if (r.ok) { sha = (await r.text()).trim(); note = ""; }
  } catch (e) {}
  const base = `https://cdn.jsdelivr.net/gh/${REPO}@${sha}/`;
  await Promise.all(CSS.map((f) => new Promise((res) => {
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = base + f;
    l.onload = l.onerror = res; document.head.appendChild(l);
  })));
  await import(base + JS);
  const b = document.createElement("div");
  b.textContent = `staging @${sha.slice(0, 7)}${note ? " (" + note + ")" : ""}`;
  b.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:2147483647;font:600 11px/1 system-ui,sans-serif;padding:5px 8px;border-radius:6px;background:#1e1a1d;color:#a89a9c;border:1px solid #332b2e;pointer-events:none";
  document.body.appendChild(b);
  console.info("[bt staging] loaded", sha);
</script>
```
Production pages keep plain `@1` URLs (no loader, no GitHub lookup).

## 2. How the CSS is built
- Everything is scoped under `.bt-root`. Plain Squarespace pages are untouched.
- Every shared selector starts with `.bt-root:not(#_)` — `:not(#_)` matches everything
  but counts as an ID, so shared rules can't be outranked by Squarespace template
  selectors. Feature rules written as `#feature-root .x` tie and win (loaded later).
- Guard rails built in: `[hidden]` always hides; every descendant inherits the font;
  buttons never wrap text; headings/paragraphs have Squarespace's margins reset.
- `.bt-root` is a size container named `bt`.
  Breakpoints: medium `≤ 1024px`, narrow `≤ 640px`, compact `≤ 420px`.

## 3. Tokens (all `--bt-*`, defined on `.bt-root`)
| Group | Tokens |
|---|---|
| Surfaces/text | `bg` `surface` `surface-2` `border` `border-2` `text` `text-muted` `text-faint` |
| Brand | `primary` (interactive only) `primary-hover` `primary-bg` `primary-soft` · `title` (gold, headings) · `danger` `danger-hover` `danger-bg` `danger-text` (destructive only) |
| Brand (added) | `primary-rgb` (145, 70, 255, for `rgba(var(--bt-primary-rgb), a)` glows) · `neon` (#b98aff, lit row edge) · `title-gradient` (gold holds for the first 25%, then fades to ember; page title only) |
| Admin (restricted, not destructive) | `admin-text` `admin-accent` `admin-tint` `admin-panel-bg` `admin-panel-border` `admin-tag` |
| Admin (added) | `admin-btn-text` (dark text on the admin button) · `admin-neon` / `admin-neon-rgb` (bright neon green hover) |
| Status/level tones | `blue` `gold` `pink` `red` `green` `lime` `gray` (each with `-bg`) · `teal` spare · `amber` = alias of `gold`. `--bt-green` is now #3ccf6e, deliberately distinct from the admin greens. |
| Spacing | `space-0h`(2) `1`(4) `1h`(6) `2`(8) `3`(12) `4`(16) `5`(20) `6`(24) `8`(32) `12`(48) `16`(64) · `gutter` (32, 20 when narrow) · `content-max` (1216: the site's content width inside the gutters; the home `.bt-zone` is `content-max` + 2 gutters, `.bt-hero-inner` and the footer's game bar and legal row cap at it) |
| Type | `text-2xs`(10) `xs`(11) `sm`(12) `md`(13) `base`(14) `lg`(16) `xl`(18) `2xl`(20) `3xl`(32) · `leading-body` 1.6 |
| Radii | `radius-sm`(8) `md`(10) `lg`(12) `xl`(16) `full` |
| Effects | `shadow-dropdown` `shadow-admin-inset` `backdrop` · `z-dropdown`(20) `z-modal`(999999) · `modal-gap` (32/24/16) |
| Site shell (added) | `red-rgb` `green-rgb` `gold-rgb` (triplets for `rgba(var(--x), a)`) · glows `red-glow` / `-strong` / `-soft`, `green-glow` / `-strong` / `-soft`, `primary-glow`, `gold-glow` · `scrim` `scrim-strong` · `shadow-note` `shadow-pin` `shadow-lift` · `header-h` (site header height: 64, 56 on phones; the layout sets it) · `sticky-top` (the height of whatever is stuck at the top of the screen right now, 0 by default; every sticky offset uses it, §5 "Sticky offsets") |
| Mascot (brand, added) | `mascot-head` (#000) `mascot-lens` (#1b1464) `mascot-stripe` (#4c186b) `mascot-stripe-edge` (#fff): the logo artwork's own colors; the mascot's lines use `title` · `logo-shine` (#fff, the TANGER hover shimmer highlight) |
| Tap the Splat (added) | `blood` (#ff1f2d, the bright title red) `blood-rgb` `blood-drip` (#e0141b) `blood-edge` (#5a0006) `blood-glow` · shadow lists ready for `text-shadow` / `box-shadow`: `glow-red` `glow-green` `glow-gold` `glow-primary` (not the same as the single-colour `red-glow` etc.) · `shadow-text` (big wordmark over the splat) `shadow-drop` (a `drop-shadow()` under the splat mascot) |
| Footer Contact + Follow (added) | one colour per badge: `contact-business` (`title`), `contact-fanmail` (`pink`), `contact-support` (`teal`), `follow-tiktok` (#25f4ee), `follow-youtube` (#ff0000), `follow-twitch` (`brand-twitch`), `follow-instagram` (#ff0069) · `pw-cable` (#2e2a33, an unlit cable) `pw-ring-bg` (#0b0a10) `pw-ring-edge` (#2a2530, an unlit ring) `pw-arc` (#fff, the lightning and ring flash) |
| Footer L3 (added) | `footer-bg` (#040404, near-black) `footer-spot` (the spotlight cone, a radial gradient drawn 1000px wide from the top centre) · `hud-bg` `hud-edge` `hud-inset` (the game bar's HUD strip) · `shadow-splat` (a `drop-shadow()` under the splat in the spotlight) |
| Accounts (added) | provider and platform brand colors, for their small tiles only: `brand-google` (#4285f4) on `brand-google-tile` (#fff), `brand-twitch` (#9146ff), `brand-youtube` (#ff0033), `brand-tiktok` (#111) with `brand-tiktok-edge` (#333), `brand-email` (#3a3a44) · `on-brand` (#fff, the letters on a tile) |
| Boom Arcade (added) | `rank-1` … `rank-5`, one rank set for every board and the podium: 1 gold (`title`), 2 silver (#dfe4ee), 3 ember orange (#f0441c, the end of `title-gradient`), 4 dark graphite (mixed from `text-muted` and `surface-2`; numbers on it in `text-muted`), 5 pink (`pink`); never purple, which means clickable. `rank-silver` and `rank-bronze` stay as aliases of `rank-2` and `rank-3` · `lamp` (#ffd400, + `lamp-rgb`), the joystick's lamp, shared with Bug Zapper's bolt yellow (§8h) · `game-spot` (the blood-red spotlight behind game art) · `cycle-1` … `cycle-8` (#ff3b3b #ff8a1f #ffd400 #7ed957 #2fcf6a #1fc7a4 #1fb2d6 #4f7cff, "Spectrum"), the version cycle's stage colours on `.bt-cycle-wheel`: decorative only, never a status (§8h) |

Color meaning: purple = clickable. Gold = page and dialog titles (and the level-3 tick).
Red = destroys data. Admin green (`admin-*`) = admin-only. Status and level badges follow
the site-wide badge system in §5 and are never purple.

## 4. Heading ladder
| Level | Class | Look |
|---|---|---|
| 1 Page title | `.bt-title` | 32px black (Inter 900) UPPERCASE (26px narrow), gold-to-ember gradient through the letters (solid gold fallback). One per page. The element sizes to its text (`fit-content`) so the gradient spans the words. |
| 1 Hero title | `.bt-title.bt-title--hero` | the page title at hero-banner size: 40px (28px at ≤ 640px), Inter 900, line-height 1.05. |
| 2 Dialog title | `.bt-modal-title` | 20px bold gold UPPERCASE |
| 3 Card / section | `.bt-heading` or `.bt-card-title` | 18px bold off-white, normal case, gold tick before it |
| 4 Label | `.bt-section-label` and `.bt-label` | ONE style for both form labels and read-only section labels: 12px semibold UPPERCASE, 0.06em tracking, muted color. |
| Data | `.bt-stat` | big number, not a heading |

## 5. Components (markup patterns)

**Page shell (list features)**
```html
<div id="x-root" class="bt-root">
  <div class="bt-topbar">
    <div class="bt-wordmark">
      <span class="bt-wordmark-icon"><svg overflow="visible">…animated icon…</svg></span>
      <span class="bt-wordmark-text">BUG<span class="bt-wordmark-accent">ZAPPER</span></span>
    </div>
    <div class="bt-topnav">
      <div class="bt-admin">…see Admin controls…</div>
      <button class="bt-btn bt-btn--primary" aria-label="Report a bug">
        <svg>…plus…</svg><span class="bt-btn-label">Report a bug</span></button>
    </div>
  </div>
  <div class="bt-header"><h1 class="bt-title">…</h1><p class="bt-subtitle">…</p></div>
  <div class="bt-filters">…bt-chip…</div>
  <div class="bt-sortbar"><span class="bt-sortbar-label">Sort by</span>…bt-chip bt-chip--small…</div>
  <div class="bt-list">…bt-row…</div>
</div>
```
Wordmark: icon wrapper OUTSIDE `.bt-wordmark-text` (only the text may truncate; the icon
slot never clips, so animations can burst past it). Top-bar action buttons: icon +
`.bt-btn-label` + `aria-label`; the label hides at ≤ 420px.

**Admin controls** (same DOM inline at wide widths, dropdown at ≤ 640px)
```html
<div class="bt-admin">
  <button class="bt-admin-menu-toggle" aria-label="Admin menu" aria-expanded="false">${LOGIN_ICON}</button>
  <div class="bt-admin-row">
    <div class="bt-admin-section"><span class="bt-admin-label">Admin access</span>
      <button class="bt-signin-btn">Sign in as Admin</button></div>
    <div class="bt-admin-section"><span class="bt-admin-label">Signed in as</span>
      <span class="bt-admin-pill"><span class="bt-admin-pill-dot"></span>Admin</span>
      <button class="bt-signout-row">${SIGNOUT_ICON}Sign out</button></div>
  </div>
</div>
```
Wire with `initAdminMenu(root)`; call `.sync()` after toggling any control's `.hidden`.

**Buttons:** `.bt-btn` + `--primary` | `--secondary` | `--ghost` | `--danger` |
`--danger-outline` | `--admin`; size `--sm`; `--block`.
`.bt-icon-btn` (36px, e.g. close) and `.bt-icon-btn--sm` (28px). Busy state: prepend
`<span class="bt-spinner"></span>` and disable.

**Buttons (updated).** Row-level destructive actions (e.g. the table's
"Purge") use the same solid red as every delete: `.bt-btn--sm .bt-btn--danger`.
`.bt-btn--danger-outline` stays in the kit but isn't used by current features.
New `.bt-btn--admin`: solid soft green at rest, bright neon green with a glow
on hover. Use it for EVERY admin-only action button across the site (Add
rule, Save rule, Save status in admin panels, etc.) so green buttons always
mean "admin action". Purple primary stays for member-facing actions.

**Button hovers (A2, docs/design/mockups/arcade-styling-ideas.html).** `.bt-btn--primary`
lifts 1px with a purple glow; `.bt-btn--secondary` lifts 1px and lights up (border
`--bt-primary`, background `--bt-primary-bg`, text `--bt-text`). Disabled buttons don't
react. Link-buttons (`a.bt-btn`, except `--ghost`, which stays underlined on purpose) and
wordmarks never underline on hover. Reduced motion: no lift, only the colours change.

**Link underline rule.** The hover underline is for plain text links only: an `<a>` with no
class, any link inside `.bt-prose`, and the opt-in `.bt-link` class for a text-style link
that has to carry a class (e.g. `.ar-tile-link`, `.bt-lightbox-link`). Component links
(`.bt-keyhole-link`, `.bt-card--door`, nav, tabs, buttons, wordmarks) never get the global
underline; give them their own hover. `.bt-btn--ghost` keeps its deliberate always-on
underline.

**Top tabs: `.bt-seg-nav`** (B3). `<nav class="bt-seg-nav" aria-label="…">` > `a`
(`aria-current="page"` on the current one): one dark rounded track; a lit pill with a small
glowing purple tick glides to the hovered or focused tab and settles back on the current
one. Behavior: `shared/ui/seg-nav.js` (`initSegNav(nav)` / `initSegNavs(root)`) adds and
moves one shared `.bt-seg-nav-pill`; without it the current tab is lit on its own. Used for
the Arcade top-bar links (hidden on phones).

**Sticky offsets: `--bt-sticky-top`.** The site header is not sticky; it scrolls away. So a
sticky element never offsets by `--bt-header-h`: every sticky `top` and every
`scroll-margin-top` uses `--bt-sticky-top`, the height of whatever is stuck at the top of the
screen right now (0 by default; the Arcade's sticky bar sets it while it's stuck or shown).
Desktop side menus and sticky cards sit 16px below it (`calc(var(--bt-sticky-top) + 16px)`);
phone chip rows touch it (`top: var(--bt-sticky-top)`), and scroll-margins on phones add the
chip row's height. Used by `.tl-nav`, the UI Kit page's `.lk-nav`, the glossary card,
`.bt-account-tabs` and `.bt-home-right`. `--bt-header-h` is only the header's own height.

**Sticky feature bar: `.bt-sticky-bar`** (`shared/ui/sticky-bar.js` `initStickyBar(bar, {
progress })`; mockup `docs/design/mockups/podium-sticky-gap.html` §3 and §4 B). A wrapper round
a feature's `.bt-topbar` that sticks at `top: 0` (`--bt-z-sticky`: above page content, below
the header's menus, the tab bar, dialogs and the lightbox); the site header above still
scrolls away. Its parent must span the whole page (the site's is in BaseLayout's `bar` slot,
in the frame), or it only sticks while the parent is on screen. Desktop: 80px at rest
(`--bt-sticky-bar-rest`, seg-nav links 8 × 16px padding). A sentinel adds `.is-stuck` when it
reaches the top: a slim 66px bar (`--bt-sticky-bar-h`, links 7 × 15px; the extra height is room above and below them) on the page black at
85% with a blur, a soft shadow and a bottom border, the wordmark a little smaller. A 14px
`margin-bottom` gives back the lost height (height and margin move with the same timing),
and it un-sticks only after scrolling 40px back up past the stick point (hysteresis), so a
notched wheel can't make it shake. With `progress: true` a 2px gold-to-purple
reading-progress line (`.bt-sticky-bar-progress`; CSS scroll-driven animation, a
rAF-throttled JS fallback). While stuck it sets `--bt-sticky-top` to 66px. At ≤ 640px it's
always a 62px bar (icon buttons 44 × 44); it never hides within the first screen (scrollY < 60% of the viewport
height), then hides (`.is-hidden`) after 200px of continuous downward scroll (any upward
scroll resets the count) and comes back after 24px up, and whenever focus is inside;
`--bt-sticky-top` is 62px while shown, 0 while hidden, so a chip row slides up with it. The
thresholds are constants at the top of `sticky-bar.js`. Reduced motion: it never hides.

**Icon-only seg nav: `.bt-seg-nav--icons`**: the `.bt-seg-nav` track and lit pill with an
icon per link (IconSprite symbols in the tab bar's line style) and no text at all, not even
on the current one. Each link has `aria-label` and `title` with its name and is at least
44 × 44px; the current one (`aria-current="page"`) gets the lit background and the purple
underline.

**Side menu: `.bt-toc`** (C3), the progress rail. `<nav class="bt-toc" aria-label="On this
page">` > `.bt-toc-rail`, `.bt-toc-fill`, `a[href="#section"]`: stops on a vertical line,
passed sections (`.is-past`) gold, the current one (`aria-current="true"`) a glowing purple
dot, the line filling to it (`--bt-toc-fill`). At ≤ 640px it becomes a swipeable chip row
with a thin gold progress bar above it (`--bt-toc-prog`). Behavior: `shared/ui/toc.js`
(`initToc(nav)` follows the scroll with an IntersectionObserver; `initToc(nav, { observe:
false }).set(i)` for demos). The current stop is the last section whose top has passed a
line 30% down the screen (the last one on screen at the very bottom; a menu click sets it at
once), so it works for tall sections and for short targets like Markdown `h2`s. Long text
pages use the shared `site/src/components/TocLayout.astro` (`items: [id, label][]`): the
sticky rail in a left column, the content on the right, the chip row at ≤ 640px, and
jumps landing below the header (`scroll-margin-top` from `--bt-header-h`). How it works,
Terms and Privacy use it; the legal pages build their items at build time from the
Markdown's own `h2`s (`getHeadings()`, depth 2).

**Chapter heading: `.bt-chapter`** (D2), for the top-level sections of long pages:
`<header class="bt-chapter">` > `p.bt-chapter-eyebrow` (gold mono "01 · Chapter", a fading
gold rule; `aria-hidden`), `h2.bt-chapter-title` (28px, tight tracking), `p.bt-chapter-lede`.
Number chapters to match the side menu. Panels and cards keep `.bt-heading`.
Variants (D1-D4 in the mockup), all on the same markup; the eyebrow stays in it and the
variants hide it, so switching is just the class:
- `.bt-chapter` (D2, the default): the numbered eyebrow above.
- `.bt-chapter--bar` (D1): no eyebrow; the `.bt-heading` gold bar before the title, at
  chapter size. Quiet pages, short sections.
- `.bt-chapter--ember` (D3): no eyebrow; an uppercase 900 title in the page-title gradient,
  a gold-to-blood bar and an occasional blood drip from it (a still drop under reduced
  motion). Special moments only.
- `.bt-chapter--ghost` (D4): no eyebrow; a huge outlined numeral from `data-n` ("01", "02"…)
  behind the title, with the title and lede offset to clear it; smaller at ≤ 640px.

**Numbered prose sections: `.bt-prose--chapters`**, on the `<article class="bt-prose">` of a
long Markdown page: a CSS counter numbers every `h2` with a D2 eyebrow ("01 · Section", gold
mono, a fading gold rule) and gives it the chapter title size. The Markdown isn't touched.

**Door card: `.bt-card.bt-card--door`** (docs/design/mockups/how-it-works-round-2.html): a
card that is a link (`<a class="bt-card bt-card--door">`). On hover and focus it lifts 3px
with a purple border and glow, and its arrow link `.bt-card-go` (text + arrow svg) slides.
Only for cards that go somewhere; a plain `.bt-card` stays put. `.bt-icon-tile--lg` is the
64px glowing icon tile (purple for live things, `--soon` gold-tinted for Soon), tilting on
the card's hover. `.bt-spotlight` (+ `--gold` for Soon cards) is a soft glow that follows
the pointer inside the card; `shared/ui/spotlight.js` (`initSpotlights(root)`) sets
`--mx`/`--my`. Pointer devices only; nothing on touch or under reduced motion.

**BOOMBOT: `.bt-boombot`**, the Arcade's helper robot (`shared/ui/arcade.js` `BOOMBOT_ICON`, or
`boombotIcon(uid)` when a page shows more than one, since each copy needs its own gradient
id): a yellow head (`--bt-lamp` to `--bt-title`), a dark visor, `--bt-neon` eyes that blink now
and then, a `--bt-blood` antenna knob. `.is-thinking` (on it or a parent) scans the eyes and
blinks the antenna while it "types". Still under reduced motion.

**Cycle wheel: `.bt-cycle-wheel`** (`shared/ui/cycle-wheel.js`; mockup
`docs/design/mockups/how-it-works-sections-2-3.html`, 3C): a version's stages as segments
round a ring. `cycleWheelHtml({ id, label, title, badge, stages, current, play, note })` builds
the markup from `stages: [{ name, text, who }]` (render it at build time, so the names and
texts are in the HTML), `initCycleWheels(root)` wires it. Stage i takes `--bt-cycle-(i+1)`:
future stages faint, finished ones (`.is-done`) half strength, the chosen one full colour,
lifted and glowing; the centre reads "Stage / 0N / of 8 stages" in its colour, and a dashed
arrow runs from the last stage back to the first. The card beside it (no side bar: a 1px
border in the stage colour with a soft glow, a black body with a faint wash of the colour)
shows the title with a "Stage N of 8" chip, the text, "Led by" as a chip, and prev / next
arrows (disabled at the ends). The segments are a tablist (roving tabindex, `aria-selected`,
each named "Stage N: name"; Arrow keys wrap, Home / End), the card holds one tabpanel per
stage. Play goes round the wheel (2.6 s a stage) and stops on any other interaction. Wheel
left, card right; above the card at ≤ 900px. Reduced motion: colour and glow only, and Play
steps without animating. How it works uses it; the Workshop pages will too.

**Hero title: `.bt-title.bt-title--hero`**: the page title at hero-banner size (40px, 28px at
≤ 640px), with the same gradient.

**Wordmark power-on: `.bt-wordmark--power`**, a feature wordmark's hover and focus effect,
word-level (no per-letter spans): `.bt-wordmark-text` > the first word + `.bt-wordmark-accent`.
The accent word is filled with a moving gradient: it rests in its colour, and on
`:is(:hover, :focus-visible, .is-lit)` it switches to its lit colour while one sheen crosses
it (the gradient move `.bt-logo-w2`, TANGER, makes on the main logo); the first word gets the
faint white glow (`--bt-wm-glow`). Because the accent is gradient-filled its glow is a
`filter: drop-shadow`, never a text-shadow (that would paint over the fill). Each feature adds
its icon effect under the same selector: the Boom Arcade joystick (`.bt-ba-icon`) turns its
lamp fully on and wiggles the stick once, and rests otherwise. Boom Arcade's is "Gold shine"
(`docs/design/mockups/boomarcade-electric-gold.html`, option 5): ARCADE rests purple and lights
gold (`--bt-title`). Touch screens (`hover: none`) play it once when the wordmark first
scrolls into view (`shared/ui/wordmark.js`, `initPowerWordmarks()`, adds `.is-lit` for 1.8 s).
Reduced motion: the colour change and glow only, with no sheen and no wiggle.

**Chips:** `.bt-chip` (+ `.is-active`, `aria-pressed`), `.bt-chip--small`. Inside
`.bt-sortbar`, active chips are purple-tinted.

**Badges:** `.bt-badge .bt-badge--{blue|gold|pink|red|green|lime|gray|teal}` (`amber` = old
alias of `gold`). Sentence case. Features map each value to a TONE NAME (not a color
value): `{ label: "In progress", tone: "green" }`.

**Badges: one site-wide system.** Same word, same color in every feature.
- **Levels** (ordered scales: how bad, priority) climb **blue → gold → pink →
  red** and show signal bars instead of a dot:
  `<span class="bt-badge bt-badge--gold">${levelBars(2, 4)}Minor</span>`
  (`levelBars(n, of)` from shared/ui/dom.js; `of` = number of steps in that
  scale, `n` = this value's position starting at 1).
- **Statuses** keep the dot and are colored by meaning: **blue** = new /
  waiting for a look · **gold** = planned · **green** = in progress · **lime**
  = done · **gray** = closed without a change (those rows also get
  `.bt-row--dimmed`). History dots use the same tone as the status.

| Scale | Values → tone |
|---|---|
| Bug: how bad is it (level, 4) | Cosmetic blue · Minor gold · Major pink · Critical red |
| Bug: priority (level, 4) | Low blue · Normal gold · High pink · Urgent red |
| Bug: status | Open blue · In progress green · Fixed lime · Won't fix gray · Can't reproduce gray · Duplicate gray |
| Feature: priority (level, 3) | Low blue · Medium gold · High pink |
| Feature: status | Submitted blue · Under review teal · Planned gold · In progress green · Shipped lime · Declined gray |

Feature Lab's stored `under_review` status isn't in the original table; it uses the
spare `teal` tone (decided with the badge system). Cloud Stash usage keeps its meanings:
Healthy green, Uploads paused gold, Over limit red.

`.bt-count` = small counter pill (comments). `.bt-avatar` = 24px initials.

**List rows**
```html
<div class="bt-row bt-row--clickable [bt-row--dimmed]" tabindex="0">
  <button class="bt-tally [is-active]" aria-pressed="…">${UP_ICON}<span class="bt-tally-count">42</span><span class="bt-tally-label">votes</span></button>
  <div class="bt-row-body">
    <div class="bt-row-title">…</div><div class="bt-row-desc">…</div>
    <div class="bt-row-meta"><span class="bt-avatar">HM</span><span>Name</span></div>
  </div>
  <div class="bt-row-side"><div class="bt-row-badges">…badges…</div><span class="bt-count">…</span><span class="bt-row-date">…</span></div>
</div>
```
At ≤ 640px rows restack (tally stays left). `--dimmed` for closed/declined items.

**Row hover (clickable rows).** Mouse only (`(hover: hover) and (pointer: fine)`):
a purple spotlight follows the pointer, the neon edge flickers on, then holds
with an outer glow. Keyboard focus gets the steady lit state without the
flicker. Reduce-motion users get the steady state on hover. Requires
`initRowSpotlight(root)` once per feature root (shared/ui/effects.js) so the
spotlight tracks the mouse; without it the glow sits centered.

**States:** loading → 3× `.bt-skeleton-row` (see UI Kit markup) while the first snapshot
is in flight. Empty/error → `.bt-empty` with `<p class="bt-empty-title">` + one line of
direction + optional action button. Inside cards use `.bt-empty--compact`. Logged out →
`.bt-logged-out` with wordmark, `.bt-logged-out-title`, `.bt-logged-out-text`, button.
Admin-only gate → same, with `.bt-admin-tag` and `.bt-signin-btn`.

**Forms:** `.bt-field` > `.bt-label` + `.bt-input|.bt-textarea|.bt-select` +
`.bt-hint` / `.bt-error`. Inputs are 16px (prevents iOS zoom).
Invalid: `aria-invalid="true"`. Grouping: `.bt-form`, `.bt-form-grid`, `.bt-form-actions`.

**Field focus.** 1px purple border + 3px soft purple glow
(`box-shadow: 0 0 0 3px rgba(var(--bt-primary-rgb), .22)`), no outline.

**Page/URL fields.** Plain `.bt-input` with placeholder
`e.g. www.boomertanger.com/live` (placeholder, never a prefilled value) and a
`.bt-hint` underneath.

**Dialog content** (inside `openModal`)
`modalHeader(title, subtitle)` → gold uppercase title (+ subtitle) + close button. Then `.bt-modal-section` >
`.bt-section-label` + `.bt-section-text`; `.bt-admin-panel` (starts with
`<span class="bt-admin-tag">${SHIELD_ICON}Admin only</span>`); `.bt-comments` >
`.bt-comment` > `.bt-comment-head` (`.bt-comment-author`, optional
`.bt-admin-tag.bt-admin-tag--small`, `.bt-comment-time`) + `.bt-comment-text`;
`.bt-history` > `.bt-history-item` > `.bt-history-line` (`.bt-history-dot
.bt-history-dot--{tone}` + `.bt-history-rule`) + `.bt-history-body`;
`.bt-modal-actions` last.

**Dialog heading + subtitle.** `modalHeader(titleHtml, subtitleHtml)` renders
`.bt-modal-heading` (title + `.bt-modal-subtitle`, 6px apart) next to the close
button. Every "new item" dialog gets a one-sentence subtitle. Detail views put
the who/when line in the subtitle slot, so the order is always: title →
"Reported by NAME on DATE" (or "Requested by…") → status badges → sections.
Never place a subtitle as a separate child of `.bt-modal` (that's what caused
the 20px gap).

**Dialog header buttons.** `modalHeader(titleHtml, subtitleHtml, toolsHtml)`:
the third argument places extra header buttons (e.g. Edit) in
`.bt-modal-tools`, before the close button. The Edit button is
`.bt-btn--sm .bt-btn--admin` with `PENCIL_ICON` and its text in
`.bt-btn-label` (icon-only at ≤ 420px) plus `aria-label="Edit"`.

**Admin edit mode.** The same dialog switches in place: add
`.bt-modal--editing` to the `.bt-modal` element (green border) and start the
content with `.bt-edit-banner` (`.bt-admin-tag--small` "Editing as admin" +
`.bt-meta` "Changes are logged"). Fields are normal `.bt-field`s pre-filled
with current values, then an optional "Reason for the edit" input, then
`.bt-modal-actions` with Cancel (`--secondary`) and Save changes (`--admin`,
disabled until something changed, "Saving…" while busy). Status stays in the
admin panel, never in edit mode.

**Edited note.** When an item has `editedAt`, its detail view subtitle gets a
second line: `<br><span class="bt-edited">${PENCIL_ICON}Edited by an admin on
DATE</span>`. Never name the admin publicly.

**Unsaved changes.** While editing, call `setBeforeClose(guard)` (returned by
`openModal`). Escape, backdrop clicks, and `[data-bt-close]` run the guard;
the guard shows `confirmAction({ title: "Discard your changes?", confirmLabel:
"Discard" })` only if something changed. Programmatic `close()` skips the
guard (use it after a successful save or delete). Clear the guard with
`setBeforeClose(null)` when leaving edit mode.

**Admin activity.** Inside the admin panel, a `.bt-modal-section` labelled
"Admin activity" with a `.bt-history` list of this item's `adminLog` entries
(newest first, up to 20): what changed, the reason if any, and "ADMIN NAME,
DATE". Skeleton while loading; "No admin activity yet." when empty.

**Comment composer.** `composerHtml({ placeholder, buttonLabel, maxLength })` +
`initComposer(el, { onSubmit, busyLabel })` from shared/ui/composer.js.
Button is right-aligned and stays quiet (grey) until there's text, then turns
purple. Character count on the left. Ctrl/Cmd+Enter submits. While posting:
box + button locked, button reads "Posting…". On error the message shows and
the text is kept. Use the feature's existing comment length limit (from its
firestore.rules) as `maxLength`.

**Image thumbnails + lightbox.** Uploaded images in dialogs render with
`thumbHtml({ src, full, alt })` (shared/ui/lightbox.js): a full-width,
clickable preview (max 320px tall, `object-fit: contain`, never cropped) with
a "Click to enlarge" chip that turns purple on hover. Clicking opens
`openLightbox()`: a full-screen dark viewer above the site header, image fit
to the screen; clicking the image toggles actual size (scrollable); "Open
original" opens the file in a new tab; Escape, the close button, or clicking
the dark area closes it (Escape closes only the lightbox, not the dialog
underneath). Call `initLightboxTriggers(modalElement)` once per dialog.
For Cloudinary images use `cloudinaryUrl(url, "w_900,c_limit,f_auto,q_auto")`
for the thumbnail `src` and `cloudinaryUrl(url, "f_auto,q_auto")` for `full`
(full resolution, efficient format). Never store transformed URLs; transform
at display time only.

**Dashboard (Cloud Stash, Alert Center)**
`.bt-body` (padded column) > cards and `.bt-columns` (2fr/1fr, stacks ≤ 1024px).
`.bt-card [bt-card--divided]` > `.bt-card-head` (`.bt-card-title` + `.bt-card-meta` or a
`--sm` button). `.bt-stat` > `.bt-stat-value` + `.bt-stat-unit`. `.bt-meter
.bt-meter--{green|amber|red|blue}` > `.bt-meter-track` (role="meter") >
`.bt-meter-fill` (width %) + optional `.bt-meter-marker` (left %); `.bt-meter-legend`
with optional `.bt-meter-legend-mark` (`style="--bt-at:80%"`, ends at the marker).
`.bt-table-wrap` > `.bt-table` (`th`, `.bt-num` right-aligned numbers,
`.bt-table-action`, `.bt-muted`). `.bt-code` = literal identifiers only (doc paths, field
names) — the one monospace exception. `.bt-switch` = `<button role="switch"
aria-checked>`. `.bt-items` > `.bt-item [--off]` > `.bt-item-head` (`.bt-item-title`,
`.bt-item-actions`) + `.bt-item-desc`. `.bt-fineprint`.

**Site shell (new site, `site/`)** — ported from `docs/design/mockups/home-5c-refined.html`
(hero 3B, home 4C/6A). All in the "Site shell (new site, Sept 2026)" section of bt-ui.css.
- **Page root:** `<body class="bt-root bt-site" data-live data-auth>` > `.bt-site-frame`
  (the `bt` size container: header, `.bt-site-main`, footer). Fixed pieces (tab bar,
  dialog portals) sit outside the frame. See §8d for why.
- **States:** `data-live` = `off | public | backstage`, `data-auth` =
  `visitor | member | admin` on the page root (or any ancestor). Show/hide with
  `.bt-when-off` `.bt-when-live` `.bt-when-public` `.bt-when-backstage`
  `.bt-when-visitor` `.bt-when-signed-in` (member or admin) `.bt-when-admin`.
- **Mascot:** `svg.bt-mascot [.bt-mascot--aware]` (`viewBox="30 92 145 162"`), inline so
  CSS can style it; the site renders it with `site/src/components/Mascot.astro`
  (props `size`, `aware`, `label`, `decorative`) from `shared/assets/mascot.svg`. Parts keep
  the artwork's classes: `.m-hd` head (`--bt-mascot-head`, with a thick same-color stroke
  that closes the hairline gaps around the head), `.m-ln` / `.m-th` lines (`--bt-title`),
  `.m-gl` lens (`--bt-mascot-lens`), `.m-sp` lens stripes (`--bt-mascot-stripe`, edged
  `--bt-mascot-stripe-edge`). Size it by `width` (default 36px); the height follows the
  artwork. `--aware`: while `data-live` is `public` the stripe edges turn `--bt-red` with a
  soft red glow, `backstage` turns them `--bt-green`. Used next to the wordmark it's
  decorative (`aria-hidden`); alone it's `role="img"` with an `aria-label`.
- **Logo lockup (R4):** `a.bt-logo` > `.bt-mascot.bt-mascot--aware` + `.bt-logo-text` >
  `.bt-logo-w1` (BOOMER, off-white) + `.bt-logo-w2` (TANGER, `--bt-title`). On hover or
  focus a light sweeps across TANGER once (a 900ms background-position transition, not a
  loop; none under reduced motion). Header, footer top, same markup.
- **Header:** `.bt-site-header [--overlay]` (overlay = transparent, over the home hero) >
  `.bt-logo` (the R4 lockup), `.bt-nav` (links with
  `aria-current="page"`), `.bt-spacer`, `.bt-beacon-slot`, `.bt-account.bt-account--wide`
  and `.bt-account.bt-account--compact` (phones). Account: `.bt-account-btn` +
  `.bt-avatar-sm` (a `button` opening `.bt-account-menu`); green `.bt-admin-link` for
  admins; `.bt-skeleton.bt-account-skel` while auth loads; a Finish signup button
  mid-signup (see Accounts below). ≤ 1024px: mascot-only logo, no
  beacon subtitle, nav scrolls if tight. ≤ 640px: nav and beacon hide (the tab bar takes
  over); the wordmark comes back at 15px with a 30px mascot.
- **Accounts (`docs/specs/accounts.md`, mockup `docs/design/mockups/accounts.html`, S2 +
  A2):** state comes from `<body data-auth-state>` = `loading | signedOut | needsSignup |
  unverified | verified` (site/src/lib/auth.ts) with helpers `.bt-when-auth-loading`,
  `.bt-when-needs-signup`, `.bt-when-unverified`; while loading or mid-signup the
  `.bt-account` area hides its visitor / signed-in / admin pieces. Any `[data-signin]`
  element opens the sign-in dialog (`data-signin="signup"` resumes the signup steps).
  **Sign-in dialog:** `openModal({ variant: "split" })` → `.bt-modal.bt-modal--split` >
  `.bt-modal-art` (`.bt-modal-splat` img + `.bt-mascot`, `.bt-modal-wordmark` with a gold
  `span`, `.bt-modal-reasons` li > icon `span` + text) + `.bt-modal-body` (`.bt-modal-x`
  close, then the screen as a `.bt-stack`). ≤ 640px: one column, the splat and mascot
  stacked over the wordmark, reasons hidden. E1 first screen: `.bt-pills.bt-pills--mode`
  (`role=tablist`, Join free | Sign in; `data-signin="join|signin"` picks the tab it
  opens on), `.bt-providers.bt-providers--row` (Google and Twitch side by side),
  `.bt-password` > input + `.bt-password-toggle` (Show / Hide). Inside: `.bt-providers` >
  `button.bt-provider` > `.bt-provider-icon--google|--twitch|--email`; `.bt-or` divider;
  `.bt-fine [--left]` small print; `.bt-link-btn` text buttons; `.bt-row-split` /
  `.bt-row-center`; `.bt-modal-icon` (big emoji); `.bt-notice [--error|--ok]`. Signup:
  `.bt-steps-label` + `.bt-steps` > `i[.is-on]`; `.bt-bday` (month + year selects);
  `.bt-handle-input` (the @ prefix) + `.bt-field-state [--ok|--bad]` (checking = plain);
  `.bt-profile-preview` with `.bt-avatar-md`; `label.bt-check` > `input[type=checkbox]` +
  text. **Auth return pages** (`/auth/action`, `/auth/email-link`,
  `/auth/twitch/callback`, via `site/src/components/AuthStatus.astro`):
  `.bt-card.bt-auth-card` > `.bt-auth-card-art` (splat + mascot), `h1.bt-title`,
  `.bt-auth-card-msg`, an optional `.bt-stack` form, `.bt-row-center` actions. **Banners** under the header: `.bt-account-banner` (gold) for verify-your-email
  and finish-signup; while one shows, an overlay header joins the flow. **Avatar menu:**
  `.bt-account-wrap` > button + `.bt-account-menu[role=menu]` (`.bt-account-menu-who`,
  links, `a.is-admin` green, `hr`, sign-out button). **Account page (A2):**
  `.bt-account-page` > `nav.bt-account-tabs[role=tablist]` > `a[role=tab][aria-selected]`
  + `.bt-account-panes` > `section.bt-account-pane[role=tabpanel]` > `.bt-card` with
  `.bt-set-row` (`.bt-set-row-main` > `b` + `small`; actions; an inline
  `form.bt-set-row-form`), `.bt-platform-icon--twitch|--youtube|--tiktok|--google|--email`,
  `.bt-pill-ok` / `.bt-pill-warn`, `.bt-switch[role=switch]`, `.bt-card--danger`. ≤ 640px:
  the tabs become a swipeable pill row. Avatars: `.bt-avatar-md` (44px) and
  `.bt-avatar-xl` (72px) show initials or an opted-in photo (`img`).
- **Live Beacon:** `.bt-beacon [--public|--backstage]` > `.bt-beacon-dot` + label +
  `.bt-beacon-sub`. Offline shows the next stream time; public glows red, backstage green.
- **Tab bar (phones):** `nav.bt-tabbar` (5 columns) > links; the center `.bt-tab-raised` >
  `.bt-tab-raise` (glows by `data-live`) + "Live" or `.bt-tab-next` (next stream time).
  "More" opens a `.bt-menu-sheet`.
- **Footer: Tap the Splat (`docs/specs/tap-the-splat.md`, prototype
  `docs/design/mockups/tap-the-splat.html`):** replaces the G4 footer. The idle footer is
  plain HTML/CSS: `footer.bt-site-footer.bt-tts-footer` > `.bt-tts[data-phase]` (the
  play area) > `.bt-tts-top` (`.bt-tts-title` blood-drip letters `.bt-tts-lt`, drips on
  those with `data-drip` and `--len/--dl/--dur`; `.bt-tts-meter` (green, `role="meter"`);
  `.bt-tts-spacer`; `.bt-tts-sound`; `.bt-tts-lb` members-only trophy with the
  `.bt-tts-lb-list` popover) > `.bt-tts-stage` > `.bt-tts-hub` (`.bt-tts-splat` button:
  splatter image + mascot, pulsing on hover; `.bt-tts-wm` one span per letter, TANGER in
  `.bt-tts-tanger`; `.bt-tts-tag` in `--bt-primary` with `--bt-glow-primary`) +
  `nav.bt-tts-links` > `a.bt-tts-link [--live|--club]` (`--fx/--fy` place it on the
  ring, `--bt-tts-tone` colours the icon); then `.bt-tts-cf[data-power]` (Contact + Follow,
  "Shared power": `svg.bt-tts-pw-svg` cable overlay + two `.bt-tts-pw-col[data-pw-col]` >
  `.bt-label`, `.bt-tts-pw-row` > `.bt-tts-pw-b[data-pw]` (`.bt-tts-pw-ring` icon, `b` label,
  then `.bt-tts-pw-show` on Contact or `.bt-tts-pw-n` count + `.bt-tts-pw-u` unit on Follow;
  `.is-on` powered, `.is-swing`), Contact's `.bt-tts-pw-readout` (aria-live) with
  `.bt-tts-pw-mail` lines); then
  `.bt-footer-legal` > `.bt-footer-sign` (18px mascot + ©) and legal links, centered.
  Links and Contact / Follow are in the HTML from the start, hidden until
  `[data-links="1"]` / `[data-cf="1"]` (set by the game) or keyboard focus inside them.
  The ring sizes itself with `cqw` so it fits the container; ≤ 1024px tightens the cards
  and the wordmark and shrinks the badges (Contact and Follow stay side by side); ≤ 640px
  Contact stacks over Follow, each with its own node, and the links become a 2-column
  grid under the hub (visually hidden, still read and focusable, until revealed) and the
  play area clips sideways overflow. Game-only pieces and states (`.bt-tts-arcade`,
  chain, bomb, tools, end card, `.is-got` / `.is-hot` links) live in the game stylesheet
  (`site/src/scripts/tap-the-splat/tap-the-splat.css`), loaded with the game.
  **L3 look ("spotlight, aligned"; above 640px only, phones keep the plain look):** the
  footer is `--bt-footer-bg` with a 1px `--bt-border` hairline across its full width on
  top, the play area paints `--bt-footer-spot` over it, and `.bt-tts-top` is a HUD strip
  (`--bt-hud-bg`, 1px `--bt-hud-edge`, `radius-lg`, `--bt-hud-inset`, 10px 16px padding).
  The game bar and `.bt-footer-legal` both cap at `--bt-content-max` inside the gutters
  (the legal row with `margin-inline: max(gutter, (100% - content-max) / 2)`), so their
  edges line up with the home bento cards at every width. Stage 390px (520px with the
  links out). **Phone game bar:** a grid; row 1 = title, meter (stretches), sound; row 2
  = the TIME / PENALTY clocks (only while playing) and the round leaderboard button
  directly under the sound button. The leaderboard popover has # / Member / Date / Time
  columns (`.bt-tts-lb-row.is-hd` headings, `.t` date, `.s` time); on phones, opening it
  grows the play area so all ten rows can be scrolled to.
- **Hero carousel (stories):** `.bt-hero` (`tabindex="0"`) > `.bt-hero-pin` +
  `.bt-hero-viewport` > `.bt-hero-track` > `.bt-hero-slide[data-title][data-mood]`
  (`data-stream`, `data-starts`/`data-ends`, `data-audience`) > `.bt-hero-inner`.
  Moods: `poster` `hub` `stream` `gold`. Poster: `.bt-mascot.bt-hero-mascot` (112px, 80 on phones),
  `.bt-hero-poster-title`, `.bt-hero-status`. Template: `.bt-hero-tpl [--text]` >
  `.bt-hero-kicker` (+ `.bt-hero-kicker-pip`), `.bt-hero-title`, `p`, `.bt-hero-cta`,
  optional `.bt-hero-media`. Stream: `.bt-hero-split`, `.bt-countdown`,
  `.bt-hero-player [--public|--backstage]` + `.bt-hero-viewers`. The segment bars
  (`.bt-hero-stories`) are built by `hero-carousel.js`.
- **Home zone and tiles:** `.bt-zone[data-view]` > `.bt-home-grid` > `.bt-home-left`
  (children `.bt-wide` span two columns) + `.bt-home-right` (sticky). Visitors get one
  column with three tiles in a row. `.bt-tile [--hot|--next|--board|--fuzz]` >
  `.bt-tile-head`. Next livestream: `.bt-ns` > `.bt-ns-art` + `h4`, `.bt-ns-when`,
  `.bt-mini-cd`, `.bt-expect`, `.bt-btn-row`; `.bt-live-tag`. Updates: `.bt-upd` >
  `.bt-upd-ic`. To-dos: `.bt-todo` > `.bt-todo-dot`.
- **Member strip / join card:** `.bt-member-strip` > `.bt-member-strip-av`, `h3`,
  `.bt-member-strip-sub`, `.bt-member-stats`. `.bt-join-card` (visitors).
- **Pill switches:** `.bt-pills[data-attr]` > `button[data-value]` (`.is-on`,
  `data-tone="gold"`, `.bt-pills-n` count, `.bt-pills-av`). `.bt-pills--view` is the
  phone-only For you / Boom Board switch (signed-in only). Behavior: `pill-switch.js`.
- **Boom Board:** `.bt-mark` (`.bt-mark-w1` BOOM + `.bt-mark-w2` BOARD, `--sm`) with the
  animated `.bt-bb-icon` (bubble, burst, ring, dots). `[data-board][data-filter]`
  (`boom` hides `[data-kind="crowd"]`, `crowd` hides `[data-kind="boom"]`) >
  `.bt-bb-head`, `.bt-bb-compose` (`-ph`, `-to`), `.bt-bb-list` > `.bt-bb-post
  [--pinned]` > `.bt-bb-post-hd` (`.bt-bb-av [--boss]`, `b`, `.bt-bb-meta`, `.bt-bb-flag
  [--pin]`), `.bt-bb-quote`, `p`, `.bt-bb-img`, `.bt-bb-post-ft` (+ `.bt-bb-replied`).
- **Warm Fuzzies:** `.bt-mark.bt-mark--fuzzies` (pink FUZZIES) with the animated
  `.bt-wf-icon` (beating fuzzy heart, sparks). `.bt-notes` > `.bt-note
  [--primary|--teal|--pink|--blue|--lime|--boss]` (tilted pinboard notes; Boomer's are
  `--boss`, gold) > `.bt-note-to`, `p`, `.bt-note-from`; `.bt-notes-rule`.
- **Boom Arcade** (`docs/specs/arcade-step1.md` §7, §8; UI Kit "Boom Arcade"). Every Arcade
  page: `.bt-topbar` > `a.bt-wordmark` (`.bt-wordmark-icon` > `.bt-ba-icon`, the animated
  joystick from `shared/ui/arcade.js` `BA_ICON`; `.bt-wordmark-text` BOOM +
  `.bt-wordmark-accent` ARCADE) + `.bt-topnav` (ghost `.bt-btn--sm` links, `aria-current`).
  Game pages: `nav.bt-page-tabs` > `a[aria-current="page"]` (real link tabs; a pill row at
  ≤ 640px; `.bt-account-tabs` is separate). A game's title is `.bt-game-logo`
  (`--lg` page title 36px / 28px on phones, `--sm` 22px); Tap the Splat's is
  `.bt-tts-title.bt-game-logo` from `ttsLogoHtml()`, the same letters and drips as the
  footer (`--bt-drip-scale` lengthens the drips). `.bt-tile.bt-game-card
  [--compact] [.is-soon]` > `.bt-game-art` (splat img + `.bt-mascot`, or
  `.bt-game-art-soon`) + `.bt-game-body` > badges, `.bt-game-name`, `.bt-game-tag`,
  `.bt-game-stats` (`b` counts), `.bt-game-me` (your best), `.bt-game-acts`.
  `.bt-btn--go` is the green Play now / Play again (§8f). Leaderboards:
  `.bt-tile.bt-board-card` [> `.bt-tile-head`] > `table.bt-board [--mini]` > `tr[data-r]`
  (1–3 gold, silver, orange: `--bt-rank-1` … `--bt-rank-3`, the same set the podium uses) [`.is-me`] > `td.bt-board-rank`, `.bt-board-who`
  (`.bt-avatar-sm` + name + `small` @handle), `td.bt-board-date`, `td.bt-board-time`;
  `tr.bt-board-gap` then your pinned row when you're past the rows shown;
  `.bt-board-foot` (Showing N of M, Show more, not on this board, verify email);
  `.bt-board-empty`. Phones drop the Date column and @handles. `.bt-tease [--stack]` >
  `.bt-tease-ic`, `.bt-tease-txt` (`b` + Soon badge, `small`), optional `.bt-btn`. Play now's
  cue on the footer: `.bt-tts[data-cue]` pulses the splat and shows `.bt-tts-cue`. Page grids
  (lobby row, Play tab split, gate, How it works) live in `site/src/styles/arcade.css`.
- **Boom Arcade top bar:** the wordmark is a `.bt-wordmark--power` and the links a
  `.bt-seg-nav` (see above). How it works uses `.bt-toc`, `.bt-chapter` and
  `.bt-title--hero`.
- **Prose** (legal pages): `<article class="bt-prose">` around rendered Markdown
  (`site/src/content/legal/*.md`). Its `h1` is the gold page title and its `h2`s are
  section headings (they share the `.bt-title` and `.bt-heading` rules); the paragraph
  after the `h1` is the "Last updated" line; line breaks inside a paragraph are kept, and
  the measure is 70ch. Markdown renders as written (`smartypants: false`).
- Reduced motion: icons, beacon pulse and the hero stop animating; the hero doesn't
  autoplay.

## 6. JS modules (`shared/ui/`)
| Module | Exports |
|---|---|
| `dom.js` | `escapeHtml(str)`, `formatDate(value)` (Timestamp/Date/ms/ISO → "Sep 12, 2026"), `initials(name)`, `levelBars(n, of)` |
| `modal.js` | `openModal({ content, title, wide, variant, feature, onClose })` (`variant` adds `bt-modal--<variant>`, e.g. `"split"`) → `{ modal, close, requestClose, setBeforeClose, setDismissible }`; `modalHeader(titleHtml, subtitleHtml = "", toolsHtml = "")`; `CLOSE_ICON`. Escape/backdrop/`[data-bt-close]` go through `requestClose()` (runs the `setBeforeClose` guard); `close()` always closes; focus trap + restore; body scroll lock; positions below `--bt-header-h` when `<body>` sets it (the new site), otherwise below the measured Squarespace `#header`. |
| `confirm.js` | `confirmAction({ title, message, confirmLabel, busyLabel, danger, feature, onConfirm })` → `Promise<boolean>`. Locks everything while `onConfirm` runs; shows the error and re-enables if it throws. |
| `admin-menu.js` | `initAdminMenu(root)` → `{ close, sync }`; `LOGIN_ICON`, `SIGNOUT_ICON`, `SHIELD_ICON`, `PENCIL_ICON` |
| `admin-auth.js` | Extracted from the identical admin code in Bug Zapper and Feature Lab (see §7). |
| `effects.js` | `initRowSpotlight(root)` — one delegated pointermove listener; sets `--bt-mx`/`--bt-my` on the hovered `.bt-row--clickable`. |
| `composer.js` | `composerHtml(opts)`, `initComposer(el, { onSubmit, busyLabel })` → `{ focus, reset }` |
| `lightbox.js` | `thumbHtml({ src, full, alt })`, `initLightboxTriggers(scope)`, `openLightbox({ src, alt })`, `cloudinaryUrl(url, transform)` |
| `hero-carousel.js` | `initHeroCarousel(hero, { duration = 7000, stateRoot = document.body })` → `{ go, destroy }`. Stories bars, 7 s per slide, pause on hover / focus / hidden tab, swipe, tap zones on narrow screens (never on links or buttons), arrow keys, no autoplay under reduced motion, live-first pinning of the `data-stream` slide while `data-live` isn't `off`, drops slides outside `data-starts`/`data-ends` or for another `data-audience`. |
| `pill-switch.js` | `initPillSwitch(group, { target, attr, onChange })` → `{ set }`. Marks the chosen `button[data-value]` `.is-on` / `aria-pressed` and writes `data-{attr}` on the target. |
| `cycle-wheel.js` | `cycleWheelHtml({ id, label, title, badge, stages, current, play, note })` (markup string), `initCycleWheels(root)` → `[{ show, stop }]`. The `.bt-cycle-wheel` tablist, prev / next, Play every 2.6 s (§5). |

## 7. Migration guide (Bug Zapper, Feature Lab, Cloud Stash)

Visual/markup refactor only: no changes to Firestore data shapes, rules, Cloud
Functions, enum values, identity sources (Bug Zapper's `meTooBy` uses Firebase uid,
Feature Lab's `votes` uses MemberSpace id — keep both), or comment visibility.

**Class mapping** (`bz-`/`fl-` shown; Cloud Stash equivalents below)
| Old | New |
|---|---|
| root `#x-root` tokens `--bz-*`/`--fl-*` | `class="bt-root"` + `--bt-*`; delete the feature token block, the `[hidden]` rule, the `*` font rule |
| `.bz-topbar` / `.fl-wordmark-bar` | `.bt-topbar` |
| `.bz-wordmark` / `.fl-wordmark-group` + `.fl-wordmark` | `.bt-wordmark` > `.bt-wordmark-icon` + `.bt-wordmark-text` (+ `.bt-wordmark-accent`) |
| `.bz-topnav` | `.bt-topnav`, with toggle + admin row wrapped in `.bt-admin` |
| `.bz-admin-menu-toggle` `-row` `-section` `-label` `.bz-signin-btn` `.bz-admin-pill(-dot)` `.bz-signout-row` | same names with `bt-` |
| `.bz-open` (dropdown) / `.bz-has-admin-trigger` | handled by `initAdminMenu()` (`.is-open`, `.bt-has-admin-trigger`) — delete the feature's own dropdown handlers |
| `.bz-header` `.bz-title` (+`.bz-title-brand`) `.bz-subtitle` | `.bt-header` `.bt-title` `.bt-subtitle` |
| `.bz-filters` `.bz-chip` `.bz-active` `.bz-chip-small` `.bz-sortbar(-label)` | `.bt-filters` `.bt-chip` `.is-active` `.bt-chip--small` `.bt-sortbar(-label)` |
| `.bz-list` `.bz-row` `.fl-clickable` `.fl-declined` | `.bt-list` `.bt-row` `.bt-row--clickable` `.bt-row--dimmed` |
| `.bz-row-body/-title/-desc/-meta/-right/-badges/-date` | `.bt-row-body/-title/-desc/-meta/-side/-badges/-date` |
| `.bz-bit-btn` / `.fl-vote-btn` (+ `&#9650;` glyph) | `.bt-tally` (+ `-count`, `-label`, `.is-active`); replace the glyph with an SVG chevron |
| `.bz-avatar` `.bz-comment-badge` | `.bt-avatar` `.bt-count` |
| `.bz-pill` `.bz-badge` `.bz-sev` `.fl-badge` + inline color styles | `.bt-badge .bt-badge--{tone}` (+ `.bt-badge-dot`); status/severity/priority maps carry tone names |
| `.bz-empty` `.fl-empty` `.bz-logged-out` `.fl-logged-out` | `.bt-empty` (+ title) / `.bt-logged-out` (full branded version for both) + new skeleton loading state |
| `.bz-btn(-primary/-secondary)` `.fl-btn-ghost` `.fl-btn-critical` / inline danger style | `.bt-btn` + `--primary` `--secondary` `--ghost` `--danger` |
| `.bz-close-btn` | `.bt-icon-btn` via `modalHeader()` |
| `.bz-field` `.bz-label` `.bz-input/-textarea/-select` `.bz-hint` `.bz-error` | `bt-` equivalents |
| hand-built modal slot/backdrop, `.bz-modal(-wide)` `.bz-detail-title` `.bz-modal-actions` | `openModal({ content, wide, feature })`, `modalHeader()`, `.bt-modal-actions` |
| `.bz-section(-label/-text)` | `.bt-modal-section`, `.bt-section-label`, `.bt-section-text` |
| `.bz-admin-panel` `.bz-admin-tag` / `.fl-admin-only-badge` | `.bt-admin-panel`, `.bt-admin-tag` (+ `SHIELD_ICON`) |
| `.bz-comment*` `.bz-history*` (inline dot color) | `.bt-comment*`, `.bt-history*` with `.bt-history-dot--{tone}` |
| `window.confirm()` deletes | `confirmAction()` (busy label "Deleting…") |

**Cloud Stash:** `.ds-header` → `.bt-topbar` (wordmark CLOUD + STASH, admin controls) +
`.bt-header` (`.bt-title` "Storage" or similar). `.ds-body` → `.bt-body`; `.ds-columns` →
`.bt-columns`; `.ds-card(-tight)` → `.bt-card`; `.ds-card-head(-border)` →
`.bt-card-head` / `.bt-card--divided`; `.ds-title` / `.ds-eyebrow` (as card heading) →
`.bt-card-title`; `.ds-count` → `.bt-card-meta`; usage number → `.bt-stat`; bar →
`.bt-meter` (tone from status; marker = upload pause buffer, with
`.bt-meter-legend-mark`); `.ds-badge-*` UPPERCASE → sentence-case `.bt-badge--*`
("Healthy" / "Uploads paused" / "Over limit"); `.ds-table` → `.bt-table-wrap` >
`.bt-table`; `.ds-mono` on paths/field names → `.bt-code`, on numbers → `.bt-num`
(Inter tabular figures, no monospace); `.ds-btn-ghost-danger` → `.bt-btn--sm
.bt-btn--danger-outline`; `.ds-btn-ghost` → `.bt-btn--sm .bt-btn--secondary`;
`.ds-icon-btn` → `.bt-icon-btn--sm` (SVG ×, not `&times;`); `.ds-toggle` →
`.bt-switch` (`role="switch"`, `aria-checked`); `.ds-rule*` → `.bt-items`/`.bt-item*`;
`.ds-empty(-dashed)` → `.bt-empty--compact`; `.ds-fineprint` → `.bt-fineprint`;
`.ds-add-form` → `.bt-form` + `.bt-form-grid` + `.bt-field`s; `.ds-gate` → admin gate
(`.bt-logged-out` + `.bt-admin-tag` + `.bt-signin-btn`); purge modal → `confirmAction()`
("Purge file" / "Purging…"). Remove Space Grotesk / IBM Plex entirely.

**Divergence decisions already made:** top bar bottom padding 20px; backdrop
`rgba(10,9,10,.72)`; dialog padding 28px, widths 520/680; primary buttons have a hover;
dialog titles gold UPPERCASE; inputs 16px with focus ring; badges 12px sentence case;
rows `16px 20px`, restack at ≤ 640px; empty state muted, `48px 16px`; avatar 24px;
history rule 1px, dots 8px in the status tone; admin palette as shipped
(`#0d2418` / `#3ba86b` / `#5fe89a`).

**Feature CSS after migration** keeps only: wordmark icon animations (keyframes +
classes; icon SVG fills via `var(--bt-*)` or a declared feature custom property),
genuinely unique pieces (e.g. Bug Zapper's screenshot dropzone — which lives in a
dialog, so target `.bt-portal[data-feature="bug-zapper"]`), and feature-unique layout.
Any `@container` rules use the `bt` name and the three standard widths.

## 8. Recorded decisions

Written from the actual code after the bt-ui migration (commit `70722be`), not
from the original plan — these are the calls that were made and why, and the
gaps that are still open.

### 8a. Admin-only page pattern (Cloud Stash)

Cloud Stash does **not** use `shared/ui/admin-auth.js`, on purpose. That module's
`onAuthStateChanged` handler always falls back to `signInAnonymously()` when
there's no user — correct for Bug Zapper and Feature Lab, which are public,
member-facing views that need to let a logged-in member write (vote, comment)
before anyone has signed in as an admin. Cloud Stash has no public view at all:
every visitor who isn't an admin sees either the plan-gate message or the
sign-in gate, never a working page, and it never created an anonymous Firebase
session before this migration. Force-fitting `admin-auth.js` here would have
started silently creating one on every visit — a real behavior change, not a
markup one.

Cloud Stash instead keeps its own `syncAdmin()`, `handleSignIn()`,
`handleSignOut()`, and `watchAuthState()` in `cloud-stash.js`. Its
`watchAuthState()` shows the sign-in gate directly on `user === null`, with no
anonymous fallback branch. It does still use the shared `initAdminMenu()` for
the dropdown and `confirmAction()` for its destructive confirmations — only the
Firebase auth wiring itself is feature-local.

**Rule for future features:** an admin-only feature with no member-facing view
follows Cloud Stash's pattern (its own `watchAuthState()`, no anonymous
fallback) until `admin-auth.js` gains an option to skip the anonymous sign-in —
see 8c.

### 8b. Status tone maps

Superseded: all features now use the site-wide badge system in
section 5 (decided after the migration). New features must use it too.

### 8c. Known follow-ups

- **`admin-auth.js` has no skip-anonymous option.** Referenced in 8a — Cloud
  Stash needs an admin-only auth flow with no anonymous fallback, and
  currently duplicates that flow locally instead. A future version of
  `shared/ui/admin-auth.js` could take an option (e.g. `anonymousFallback:
  false`) so an admin-only feature could use the shared module too.
- **`--bt-gray` and `--bt-text-muted` are the same hex** (`#a89a9c`,
  `shared/bt-ui.css`) — a redundant token pair carried over from the
  pre-migration code, where each feature had its own duplicate `--*-gray`
  var. The migration consolidated two duplicates into one; the duplication
  itself is still there.
- **`updateAdminUi()` is still duplicated.** Bug Zapper
  (`features/bug-zapper/bug-zapper.js`) and Feature Lab
  (`features/feature-lab/feature-lab.js`) each define their own
  near-identical closure that toggles the sign-in/badge/sign-out
  visibility and calls `menu.sync()`. `admin-auth.js`'s `onChange`
  callback only reports `{ user, isAdmin }`; it doesn't own this DOM
  toggling. A small shared helper (in `admin-auth.js` or `admin-menu.js`)
  could take this over.
- **Done: the site shell is on the live kit (`/dev/ui-kit`).** Kept for history: The Site
  shell components (§5) live in `bt-ui.css`, but `shared/ui-kit/` hasn't been
  updated to render them, so the kit page isn't yet the visual source of
  truth for them (the mockup is). Update the published UI Kit page. (The Boom
  Arcade pieces are on it: its "Boom Arcade" section.)
- **Add these to the published UI Kit page:** the mascot (`.bt-mascot`, `--aware`), the
  R4 logo lockup (`.bt-logo`), the Tap the Splat idle footer (`.bt-tts`, §5) with its L3
  look and the phone game bar, and the new tokens (`--bt-blood*`, `--bt-glow-*`,
  `--bt-shadow-text`, `--bt-shadow-drop`, `--bt-content-max`, `--bt-footer-bg`,
  `--bt-footer-spot`, `--bt-hud-*`, `--bt-shadow-splat`).
- **Add the accounts pieces to the published UI Kit page:** `.bt-modal--split`, provider
  buttons and platform tiles, handle field states, steps, checkbox rows, avatars md / xl,
  `.bt-account-banner`, `.bt-account-menu`, `.bt-account-page` tabs and `.bt-set-row`, the
  auth-state helpers and the `--bt-brand-*` / `--bt-on-brand` tokens.
- **No Firestore rules tests yet.** The emulator needs Java 11+; until a rules test setup
  exists, the accounts rules are checked by hand with the checklist in
  `docs/specs/accounts.md`.

### 8d. New site shell (Astro on Cloudflare Pages)

The new site lives in `site/` (spec: `docs/specs/foundation.md`). It imports
the kit at build time and follows the same rules as features, with these
differences:

- **Page layout may use `@media`; components keep container queries.** Only
  page-level layout (the fixed tab bar, `--bt-header-h`, the preview chip) uses
  `@media` in the site's own CSS. Components still respond to the `bt`
  container with the standard widths (1024 / 640 / 420).
- **The whole page is a bt-root.** `<body class="bt-root bt-site">` carries the
  tokens, guard rails and state attributes. `.bt-site` switches off the root's
  container, overflow clipping, width cap and radius, because a size container
  is the containing block for `position: fixed` descendants (the tab bar and
  every dialog portal would be placed against the whole document, not the
  screen) and `overflow: hidden` on body stops the page scrolling. The `bt`
  container is `.bt-site-frame` inside it. Features keep their own
  `class="bt-root"` for portability.
- **`--bt-header-h`.** The layout sets it on `<body>` (64px, 56px on phones) and
  the header uses it for its height. `modal.js` places dialogs below it when set,
  and falls back to measuring Squarespace's `#header` when it isn't, so the
  Squarespace pages behave exactly as before. It's the header's height only:
  sticky elements offset by `--bt-sticky-top`, never by the header height (§5).
- **The kit is imported at build time** (`import "../../shared/bt-ui.css"` in the
  base layout), not loaded from jsDelivr. Shared JS modules are imported the
  same way.
- **The header owns the account area** (Log in / Join free, or the member's
  avatar and a green Admin link). The Squarespace footer script that injects a
  LOG IN link doesn't apply to the new site.
- Header states come from data attributes on the page root, `data-live` and
  `data-auth`, the same way the mockup does it; on staging and previews the
  `?live=` and `?as=` preview switches set them.

### 8e. Logo

- **Logo: mascot + split wordmark (R4); mascot head stays black, lines use
  `--bt-title`, lens colors are brand tokens.** Chosen from the header options in
  `docs/design/mockups/header-footer-final.html`. The artwork
  (`shared/assets/mascot.svg`, favicon `site/public/favicon.svg`) is the source; the
  site inlines its shapes so the lines follow the gold token and the lens stripes can
  react to the live state. The head's black and the lens purples are the logo's own
  colors, so they're brand tokens (`--bt-mascot-*`), not status colors, and never
  change with a theme. The live-aware stripes read the same `data-live` attribute as
  the Live Beacon and the `?live=` preview switch.

### 8f. Tap the Splat footer

- **Exception: Tap the Splat's completion meter and Play again button use green
  (otherwise admin-only).** Approved in the prototype: green reads as progress and "go"
  in the game, and neither control is an admin action. It's `--bt-green` (the status
  green, not the `--bt-admin-*` greens) and stays limited to those two controls.
- **Footer: L3 spotlight, game bar and legal row share `--bt-content-max`.** Chosen from
  the footer-look variations in the prototype (L0 current, L1 framed stage, L2 blood drip
  edge, L3 spotlight, L4 wall, L5 light). On desktop and tablets the footer goes
  near-black with a soft cone of light on the splat, a full-width hairline mirrors the
  header's bottom border, and the game bar becomes a HUD strip. The game bar and the
  legal row use the same content width as the page above, from one token that the home
  zone and hero use too (1216px, the width the home page already had), so the edges line
  up exactly instead of running to the screen edges. Phones keep the plain look.
- **The clock never pauses (v7).** The firefly's flight counts toward the time; it's
  bounded (one S-shaped path, 2.6 to 5 s) instead of the old 2 to 5 wandering loops with
  the clock paused. Under reduced motion it glides flatter over the same duration, so
  times stay comparable.
- **The footer is the game.** The G4 footer (domain cards, labeled contact list) is
  retired; `docs/design/mockups/header-footer-final.html` stays as the header reference.
  Nothing says "game": visitors who only want links can stop after round 3, the links are
  real links in the HTML (hidden until revealed, or focused), and the header nav covers
  the same pages.
- **Contact addresses never appear in the HTML.** Each Show button joins `user` + `@` +
  `emailDomain` from `site.json` in the browser, then offers Copy.
- **Footer Contact + Follow: Shared power (hanging cables; Show is "Pulse and type").** Chosen in
  `docs/design/mockups/footer-power.html` (1 Follow only, 2 Shared power, 3 Two circuits).
  One glowing node (`--bt-title`) where the chain hung feeds a hanging cable to all seven
  badges, Contact left and Follow right, same size and baseline, so the two halves read as
  one wired-up machine instead of neighbours; phones give each section its own node and
  short cables. Cables come in from above onto the top of their own ring, so they never
  cross a badge. The power-up (sparks about 150 ms apart, cables lit in each badge colour,
  ring flash, one swing, counts ticking up from 0) runs each time Contact and Follow
  appear, and after the chain pull it waits until the page has stopped scrolling and the
  section is on screen. Follow uses the platforms' official icons (Simple Icons, one colour) and
  colours; Contact uses plain line icons. One colour token per badge (`--bt-contact-*`,
  `--bt-follow-*`). The effect code (`scripts/tap-the-splat/power.js`) loads with the game
  or on the first Show or focus, and the sway runs only while the section is on screen.
  Reduced motion shows the final state (lit, final numbers) with no sparks, sway, swing,
  pulses or typing. Counts come from the growth collector's `public/socials`
  (`docs/specs/growth-collector.md`); one older than 7 days shows Follow. Twitch has a
  hidden LIVE hook (`[data-live-hook]`) for the Live Beacon.
- **Contact: "Pulse and type" replaces the lightning.** Chosen in
  `docs/design/mockups/contact-copy.html` (A Pulse and type, over the ticket, ink and
  envelope styles). The same cables carry the signal down on Show (a soft pulse, the ring
  blooms, the address types into a tinted monospace readout line with a cursor) and back up
  on Copy (the characters light, the ring ripples, a COPIED tag, a solid "Copied ✓" button),
  so Contact keeps the footer's power story, and the address stays plain, readable text.
  A failed clipboard write says "Press and hold to copy" and selects the address. The
  lightning bolt and the scramble are gone.
- **The Contact + Follow power-up waits for the scroll.** The chain pull scrolls the page
  to the footer's bottom; starting the sparks mid-scroll meant they ran off screen. It now
  starts once the scroll has ended (`scrollend`, or 150 ms without scroll events) and at
  least 60% of the section is visible, 200 ms later; a safety net starts it 1.5 s after the
  pull if the section is on screen at all, or when it comes into view. Details:
  `docs/specs/tap-the-splat.md` "Contact + Follow".
- **The game loads only on the first splat tap** (a dynamic import). The game module
  attaches its own stylesheet, because a CSS import inside a dynamically imported module
  is hoisted into every page by the build. The only game-adjacent code in the idle
  bundle is the Web Audio unlock, which iOS requires inside the tap itself.
- **Game colours are feature properties.** The props (bone, steel, brass, fire, the
  arcade board) have no kit equivalent, so each is declared once as a `--tts-*`
  property at the top of the game stylesheet (CLAUDE.md rule 3) and used by name,
  including in the SVG art. The title red, glows and shadows that the idle footer
  shares are kit tokens (§3).
- **The end screen is an in-place card, not a modal.** As approved it floats on the
  splatter over the dimmed play area and closes on any non-button click, so it doesn't
  use `openModal()`. Hidden game pieces are `inert`.
- **Meter steps follow the spec table** (power cut 52 / 57, DANGER 73 / 76 / 85, +1.4
  per catch), where the prototype's code used 50 / 55, 72 / 75 / 84 and +1.5.
- **Real runs, boards and votes (Boom Arcade step 1).** Every run goes through the
  Arcade callables (`startRun` at the first splat tap without blocking the clock,
  `finishRun` on the end card or a tap-out), the trophy renders in every environment
  and reads the current version's all-time board doc, and the two votes are once per
  kind per run through `voteRun` (locked until the next play), with counts from
  `games/tapTheSplat.stats` plus a local +1. PREVIEW DATA is gone. `game-api.js` loads
  with the game bundle or the popover only; the Functions SDK loads on the first run.
- **The leaderboard is open to guests.** Everyone can open it, to see what they're
  missing; only members' completed runs are on it, and guests get a Join free prompt
  under the rows (`.bt-tts-lb-join`).

### 8g. Accounts

- **Accounts: S2 sign-in, A2 account page.** Chosen in `docs/design/mockups/accounts.html`
  (S1 classic, S2 split with pitch, S3 splatter; A1 one column, A2 tabs). S2 puts the
  splatter, mascot, wordmark and four reasons to join beside the form, so the same dialog
  sells the club to new visitors and signs members back in; on phones the art shrinks to
  the splat and mascot stacked over the wordmark. A2 keeps each part of the account
  behind a tab (a swipeable pill row on phones). The split layout is a kit variant of the
  standard dialog (`openModal({ variant: "split" })`), not a hand-rolled modal.
- **One dialog, two explicit modes (E1).** The dialog opens on a Join free or Sign in
  tab (chosen in `docs/design/mockups/email-flows.html`), because with Firebase's email
  enumeration protection a single Continue can't tell a wrong password from an email
  that belongs to a Google account. New members continue in the same dialog through
  birthday, handle and terms. Redirect sign-ins (Twitch, email link) come back to the
  page they started from and reopen the signup steps there.
- **Brand colors live on the provider tiles only.** Google, Twitch, YouTube, TikTok and
  the email tile use their own colors (`--bt-brand-*`), declared once as tokens; the
  buttons around them are ordinary kit buttons.
- **The account area shows the auth state, never a guess.** While Firebase restores the
  session the header shows a skeleton instead of flashing Log in; mid-signup it offers
  Finish signup. A real signed-in member always wins over the `?as=` preview switch.
- **Nothing about accounts is written from the browser.** Profiles, handles, roles and
  preferences change only through Cloud Functions; the rules give clients read access to
  their own docs and public profiles, and no writes.

### 8h. Boom Arcade

Spec: `docs/specs/arcade-step1.md` (§7 UI states, §8 kit pieces); mockup
`docs/design/mockups/arcade-step1-screens.html` (lobby 1 Marquee, Play tab 1 Split).

- **The Arcade uses the feature top-bar pattern.** Every Arcade page puts the kit's
  `.bt-topbar` + `.bt-wordmark` under the site header: an animated joystick icon, BOOM +
  accent ARCADE (like BUGZAPPER), and links (Games, Leaderboards, How it works) on the
  right, hidden on phones. The wordmark links to `/arcade`; no breadcrumbs. Game pages
  add real link tabs (`.bt-page-tabs`: Play, Leaderboards, later Workshop), each with its
  own URL.
- **A game's name uses the game's own logo lettering; every other page title stays
  gold.** On the game card, the Play tab and the leaderboards, a game's title is
  `.bt-game-logo` wrapping that game's lettering (for Tap the Splat, the footer's
  `.bt-tts-title` letters and drips, shared from one place). Lobby, Leaderboards and the
  gate keep the gold `.bt-title`.
- **Play now joins the §8f green exception.** The Arcade's Play now is the same solid
  green as the game's Play again (`.bt-btn--go`, `--bt-green`), because both mean "start
  the game". It stays limited to those two controls and the completion meter.
- **Exception: the keyhole link is warm amber, not purple.** The members-only gate's
  "Peek inside · no account needed" pill (`.bt-keyhole-link`, approved in
  `docs/design/mockups/keyhole-hover-ideas.html`, option 2 "Door ajar", after
  `gate-see-inside.html` option C) is a deliberate exception to "purple = clickable",
  alongside the green Play again exception above. It uses the amber gold (`--bt-title` /
  `--bt-gold-rgb`: a flickering keyhole, a faint wash and a thin border), not `--bt-lamp`,
  whose lemon wash read as olive green on the dark background. Only for the gate's
  peek-inside invitation to /arcade/how-it-works; don't use it for other links. Hover and
  focus: a wedge of amber light swings open across the pill from the left (clip-path, about
  0.5s), the border brightens with a soft glow, the keyhole's circle warms and the muted
  text brightens; no lift, no underline. Reduced motion: no flicker, and the light appears
  without the swing.
- **The Arcade is members only, and the gate is display-only.** One Arcade layout takes
  a `membersOnly` flag (every page except How it works). For visitors it renders the
  members-only gate instead of the page, and opens the Join dialog once per visit. The
  pages are static and carry no member data, and the boards stay public-read (the footer
  popover is open to guests, §8f), so the gate is a sales screen, not protection. While
  the auth state loads it shows a skeleton, never a flash of the gate.
- **`--bt-lamp` is the shared lamp yellow.** `#ffd400` (+ `--bt-lamp-rgb`), used by the
  Arcade's marquee lights, is the same yellow as Bug Zapper's bolt. Bug Zapper still
  declares its own `--bz-bolt` (features/ isn't touched from site work); it moves to
  `--bt-lamp` when Bug Zapper is ported.
- **Arcade pages read after sign-in, within the §3 budget.** Each page's script waits for
  a signed-up member (`onMember()` in `site/src/scripts/arcade/data.ts`) before loading
  Firestore Lite (`lib/db.ts`). The games list and game docs are kept in sessionStorage
  for 5 minutes, and board ids come from `games/{gameId}.boardEpoch` (a mirror of the
  version doc's, arcade-step1.md §4), so moving between pages costs only the bests,
  boards and rank count each page lists.
- **Styling ideas: A2, B3, C3, D2, E3** (`docs/design/mockups/arcade-styling-ideas.html`):
  button hovers that lift, the `.bt-seg-nav` top tabs, the `.bt-toc` progress rail, the
  `.bt-chapter` heading and the `.bt-wordmark--power` hover. Page titles stay the only
  gradient heading (plus `.bt-title--hero` on hero banners), set in Inter 900 (the hero with a
  tight 1.05 line-height, as in the mockup; the site loads Inter up to 900); `.bt-chapter` is for the
  top-level sections of long pages, and panels and cards keep `.bt-heading`.
- **The Arcade wordmark rests purple and lights gold on hover** ("Gold shine"): ARCADE switches
  to `--bt-title` as one sheen crosses it, deliberately echoing TANGER on the main logo, so
  the two logos on the site share one hover. It replaces the letter-by-letter power-on.
- **BOOMBOT is the Arcade's helper character.** A small yellow robot used for help and FAQ
  answers (How it works' "Ask BOOMBOT"), always labelled BOOMBOT. It's never presented as a
  real person or as Boomertanger, and it doesn't speak for Boomertanger; answers are the
  site's written help text.
- **How it works, sections 5-9** (`docs/design/mockups/how-it-works-sections-5-9.html`): 5A
  Flow (role cards with arrows that light on hover, real text in reading order), 6A Flip
  medals (buttons; a cross-fade instead of the turn under reduced motion), 7A House rules
  (a placard with a lit header and an ordered list), 8B Term chips (the full `<dl>` stays in
  the HTML, visually hidden once the chips take over) and 9A Ask BOOMBOT (question bubbles
  as buttons, answers in the HTML from the start; the typing dots are visual only). These
  use a 900px container breakpoint for the flow and medals, as specified for this page.
- **The BOOMARCADE bar sticks on every Arcade page** (`docs/design/mockups/podium-sticky-gap.html`
  §3, §4 B; sizes and thresholds from `podium-sticky-round-2.html`): /arcade, the leaderboards,
  the game page and its leaderboards, and How it works. It's rendered in BaseLayout's `bar`
  slot (the site frame, outside `<main>`) so it stays stuck to the end of the page. On
  desktop (> 640px) it's a `.bt-sticky-bar`, 80px at rest, that slims to 66px when it reaches
  the top without moving the page, with a reading-progress line on TocLayout pages only (How
  it works), and the side menu tucks in under it. On phones it's a 62px bar with the wordmark and an icon-only switch (`.bt-seg-nav--icons`:
  joystick Games, trophy Leaderboards, question mark How it works; no words) that hides on
  a long scroll down (not within the first screen) and shows after a short scroll up, the
  page's chip row moving up with it. Nothing else on the Arcade pages is sticky; anything
  that becomes sticky offsets by `--bt-sticky-top`. The members-only gate's bar has no links
  and doesn't stick. The site header is never sticky.
- **The podium shows the top five** (How it works' Leaderboards card): 4 · 2 · 1 · 3 · 5, 34px
  bars with 6px gaps rising from the middle out, in the shared rank colours (`--bt-rank-1` …
  `--bt-rank-5`: gold, silver, orange, dark grey, pink; never purple). Only 1 glows. The
  leaderboard tables use the same set, so their #3 is orange too.
- **How it works, sections 2 and 3** (`docs/design/mockups/how-it-works-sections-2-3.html`):
  2 is the journey ("After"; the circles on their own line above the cards, the line filling
  gold up to the step; 3 columns at ≤ 900px, a vertical path on phones) and 3 is the kit's
  `.bt-cycle-wheel` with palette 1 "Spectrum". The journey also uses the page's 900px
  breakpoint.
- **The cycle colours are decorative stage colours only.** `--bt-cycle-1` … `--bt-cycle-8`
  mark where a stage sits in the cycle, hot to cool; they never mean a status (badges keep
  their tone maps, §8b). Stage 1 is a scarlet (#ff3b3b), not the kit's danger red, which
  stays reserved for "this deletes something".
- **Every feature wordmark gets its own hover "power-on" when it's ported**, built on
  `.bt-wordmark--power`: a word-level shine on its accent word (its own lit colour, one sheen
  crossing) plus its icon's moment: Bug Zapper's bolt crackles, Cloud Stash's cloud rains,
  Feature Lab's flask bubbles. The icons rest when not hovered. `features/` isn't touched
  until each port.
- **Chapter headings: D2 is the default.** `.bt-chapter` (the numbered eyebrow) is the
  standard for long pages. How it works is trying D4 (`.bt-chapter--ghost`, numerals from
  `data-n`). Terms and Privacy use D2 numbering through `.bt-prose--chapters`. D3
  (`.bt-chapter--ember`) is kept for special moments: game pages, launches. D1
  (`.bt-chapter--bar`) is there for quieter pages.
- **Long text pages get the progress-rail menu** through the shared `TocLayout`: How it works,
  Terms and Privacy. The menu shows the plain section names; on Terms and Privacy the
  headings themselves carry the "01 · Section" numbering (`.bt-prose--chapters`).
