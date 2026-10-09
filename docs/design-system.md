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

Game Vault kit pieces (added): `ease-glide` (the one glide curve for tilt, shelves, tokens and the command panel) · `glare` (the light a tilted cover catches: a little of `logo-shine`).

Color meaning: purple = clickable. Gold = page and dialog titles (and the level-3 tick).
Red = destroys data. Admin green (`admin-*`) = staff (mods and admins; widened from admin-only by the Game Vault, §8i). Status and level badges follow
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
| Bug: status | Open blue · **Confirmed gold** · In progress green · Fixed lime · Won't fix gray · Can't reproduce gray · Duplicate gray (stored keys are lowercase on the new site: `open`, `confirmed`, `in_progress`, `fixed`, `wont_fix`, `cant_reproduce`, `duplicate`) |
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
`.bt-comment--hidden` is a hidden comment as staff see it (Feature Lab: dashed border, faded, the text struck through) followed by a
`.bt-comment-hidden-note` line ("Hidden by @handle: reason. Only staff see this."); members never receive hidden comments, so it only ever renders for staff;
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
Cloud Stash additions (docs/specs/cloud-stash.md §10): `.bt-meter--stack` (add to `.bt-meter`: the track holds `.bt-meter-seg` segments with their own colour in `--c` and a width %, then `ul.bt-meter-keys` > `li` (`i` swatch, label, `b` figure) under it); `.bt-notice--warn` (the gold notice, beside `--error` and `--ok`) and `.bt-notice--row` (a notice on one row: `b` title, `span` line, an optional button); `.bt-file-thumb` (a 52px file tile: an `img`, or `--locked` for a private file with a lock and "Private", or `--lg` for the full-width preview in a dialog).
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
  `.bt-when-visitor` `.bt-when-signed-in` (member or admin) `.bt-when-admin` `.bt-when-staff`
  (mods and admins; `data-staff="on"` on the page root, set by `site/src/lib/auth.ts` from the roles, and by
  `?as=admin` in a preview). Display only: the callables and rules enforce roles.
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
  `.bt-logo` (the R4 lockup, also Home), `.bt-nav` (the `.bt-navgroup` menus below and a plain link with
  `aria-current="page"`), `.bt-spacer`, `.bt-beacon-slot`, `.bt-account.bt-account--wide`
  and `.bt-account.bt-account--compact` (phones). Account: `.bt-account-btn` +
  `.bt-avatar-sm` (a `button` opening `.bt-account-menu`); green `.bt-admin-link` for
  admins; `.bt-skeleton.bt-account-skel` while auth loads; a Finish signup button
  mid-signup (see Accounts below). ≤ 1024px: mascot-only logo, no
  beacon subtitle, tighter nav. ≤ 640px: nav and beacon hide (the tab bar takes
  over); the wordmark comes back at 15px with a 30px mascot.
- **Header nav groups (`docs/specs/header-nav.md`, mockup `docs/design/mockups/header-nav.html`, UI Kit
  "Header nav groups"):** `span.bt-navgroup[data-navgroup]` > trigger `.bt-navgroup-btn` (`a` that
  `shared/ui/navgroup.js` upgrades to a `button` with `aria-expanded` + `aria-controls`; a link to the group's
  first page without JavaScript; `.is-current` = purple underline for the section you are in; a
  `.bt-navgroup-dot` with `.bt-when-public` is Watch's red live dot) + `.bt-navgroup-panel[hidden]` >
  `.bt-navgroup-links` > `a.bt-navgroup-link` (`.bt-navgroup-ic` icon tile, `.bt-navgroup-name`,
  `.bt-navgroup-blurb`; `aria-current="page"`; `--live` pulses the icon) + one `.bt-navgroup-feature` tile.
  The panel is placed against the nearest positioned ancestor (the header); the script sets `--bt-ng-left`.
  ≤ 1024px (container): the panel fits the container and the tile moves under the cards; ≤ 640px the cards
  go single column (the phone header has no nav; the More sheet takes over). Reduced motion: no slide, glow,
  icon lift or pulse. **Feature tile:** `.bt-navgroup-feature` (`.is-watch` goes red under `data-live="public"`;
  `.is-live` / `.is-off` force a state for demos) holds a `.bt-label`, a `strong` title, `p`, `.bt-btn.bt-btn--sm`;
  extras `.bt-navgroup-count` (countdown boxes), `.bt-navgroup-score`, `.bt-navgroup-medal`,
  `.bt-navgroup-mascot`; `.bt-navgroup-notlive` / `.bt-navgroup-livenow` show only offline / live. States:
  loading (`.bt-skeleton` shimmer, `.bt-navgroup-skel`), live, offline, empty (call to action). The tile markup
  comes from `navgroup.js` builders so the site and the kit draw the same thing.
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
  (`.bt-avatar-sm` + name, an `a` to `/u/{handle}` when the member has a handle, + `small` @handle), `td.bt-board-date`, `td.bt-board-time`;
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

**Stepper, drawer and lanes** (the Night Shift builder, `docs/specs/fun-factory.md` §7; reusable for
any multi-stage editor).
- **Stepper: `.bt-stepper`**, the assembly line (`shared/ui/stepper.js` `stepperHtml({ steps, open, crate,
  rail })`, `keepOpenInView(el)`). Each stage is a `button.bt-stepper-step[data-step]` (`.bt-stepper-mach`
  icon, `.bt-stepper-n` "Stage 3", `b` name, `.bt-stepper-s` status line) on a conveyor
  (`.bt-stepper-belt`), gold (`.bt-stepper-done`) up to the current stage, where the crate
  (`.bt-stepper-crate`) sits. States `.is-done` (gold lamp), `.is-now` (blinking lamp), `.is-todo`, and
  `.is-open` (`aria-current="step"`) for the stage on screen. `--bt-stepper-n` and `--bt-stepper-at` place
  the belt and crate. Phones: a sideways strip; call `keepOpenInView` after opening a stage.
  `.bt-stepper--rail`: a vertical list with progress rings (`.bt-stepper-ring`, `--v` 0 to 100) for narrow
  side panels; a row of cards below 1024px. Reduced motion: the belt stands still, no blinking.
- **Drawer: `.bt-drawer`**, a sticky side panel of ideas in a `.bt-drawer-layout` (content plus a 320px
  panel; below 1024px it stacks under the content): `.bt-drawer-head` (`b`, `small`, `.bt-drawer-tools`),
  `.bt-drawer-list` (scrolls) of `.bt-drawer-item` (`b`, a button or a "Needs …" badge, `p`,
  `.bt-drawer-meta` badges; `.is-used`, `.is-waiting`), `.bt-drawer-group` labels, `.bt-drawer-tip`,
  `.bt-drawer-foot`.
- **Lanes: `.bt-lanes`**, a week timeline with labelled lanes (`shared/ui/lanes.js` `lanesHtml({ weeks,
  rows })`): a header row of `.bt-lanes-wk`, then `.bt-lanes-row`s with `.bt-lanes-lab` (`.is-head`) and
  `.bt-lanes-bar`s (`--c` colour, `grid-column: start / span len`, the label being column 1). Scrolls
  sideways when narrow. Named lanes because `.bt-timeline` is the Vault's dots on a line.

**Road and tree** (the Goal Tracker, `docs/specs/goal-tracker.md` §7; see §8k).
- **Road: `.bt-road`**, a level select (`shared/ui/road.js` `roadHtml({ levels, selected, label, mascot,
  panelHtml })`, `initRoad(host, { renderPanel, onSelect })`). Each stop is a `button.bt-road-stop[data-lv]`
  (`.bt-road-nodewrap` > `.bt-road-node` icon and an optional `.bt-road-me` mascot, then `.bt-road-lv`,
  `.bt-road-name`, `.bt-road-when`) on a dashed road with a gold-to-purple fill (`.bt-road-fill`) that grows
  once on load to the current stop. States: `.is-done` (gold), `.is-now` (glows, the mascot stands on it),
  `.is-later` (dashed), `.bt-road-stop--boss` (the last stop, bigger and gold); `aria-pressed` marks the
  open stop and puts a notch toward `.bt-road-panel` under the road. `--bt-road-n` sets the stop count;
  `--bt-road-fill` and `--bt-road-fill-v` are set by `initRoad`. At 640px and under it is a vertical path and
  `initRoad` moves the panel to sit right under the tapped stop. Reduced motion: no pulse, no bobbing, the
  fill is drawn at once.
- **Tree: `.bt-tree`**, collapsible admin rows (`shared/ui/tree.js` `initTree(root, { collapsed, onChange })`).
  `.bt-tree-row` (`--d` depth, `data-id`, `data-parent`, `data-type`) holds `.bt-tree-caret[data-caret]`,
  `.bt-tree-main` (`b`, `.bt-tree-type`, `.bt-tree-tag` / `--quiet` state tags), `.bt-tree-meta`
  (`.bt-tree-vis`, `.bt-tree-opt`, a `.bt-tree-status` button around a badge) and `.bt-tree-acts`
  (`.bt-tree-move` hides at 640px and under). `initTree` hides a row (`data-hidden`) while an ancestor is
  collapsed; page filters use the `hidden` attribute.

**Task row, timer, lock card, clock and path** (the Night Shift season pass, `docs/specs/fun-factory.md`
§8; `shared/ui/season.js` builds them, `shared/ui/countdown.js` ticks the timers).
- **Task row: `.bt-task-row`** (`taskRowHtml({ icon, title, sub, n, of, xp, soon })`), an activity:
  `.bt-task-row-ic`, `.bt-task-row-main` (`b`, `small`, `.bt-task-row-bar > i` with `--v`), and
  `.bt-task-row-xp` ("+60 XP" over "2 / 3" or "Done ✓"). `.is-done` has a gold edge; `.is-soon` is dashed
  and dimmed with a Soon badge. `.bt-task-list` lays them out two across (one at ≤ 640px).
- **Timer: `.bt-timer`** (`timerHtml({ until, label, icon, locked, done })`,
  `initTimers(root)`, `fmtLeft(ms)`; not `.bt-countdown`, the home hero's next-stream digits): the gold pill with a timer ("Resets in 7h 12m", "Ch 3 in 10d 14h"),
  `--locked` grey. Ticks on the minute; when it runs out it shows `data-done` and fires
  `bt:timer-done`. Nothing moves under reduced motion.
- **Lock card: `.bt-lock-card`** (`lockCardHtml({ icon, title, text, href, label })`): the dashed gold upsell
  card (icon tile, `b` + `p`, a button).
- **Clock: `.bt-clock`** (`clockHtml({ streak, savers, cap, done })`): the streak number in
  `.bt-clock-flame`, `.bt-clock-txt` with saver pips (`.bt-clock-savers i`, `.is-empty`), and a
  `[data-clock-btn]` button; `.is-done` (and `aria-disabled`) once punched in today.
- **Path: `.bt-path`** (`pathHtml({ nodes })`): the story path, an `ol` of `.bt-path-node`s (`i` icon, `b`,
  `small`) on a line that fills gold to the first node not done (`--fill` 0 to 1); `.is-done`, `.is-now`,
  `.is-locked`. Scrolls sideways when narrow.
- **Hidden medal: `.bt-hunt-medal`** (the Night Shift's site-wide hunts,
  `site/src/scripts/factory/site-wide.ts`): a small `.bt-medal` button in a corner of a host with
  `.bt-hunt-host` (`position: relative`); `--top-left`, `--top-right`, `--bottom-left`,
  `--bottom-right`. Absolutely placed, so it never moves the layout. It glints every few seconds and pops
  away with `.is-claimed`; neither animates under reduced motion.
- **Account menu meta: `.bt-account-menu-meta`**: a right-aligned value in an account menu item (the
  Punch the clock item's 🔥 streak). A menu item with `aria-disabled="true"` doesn't highlight on hover.

**Toast: `.bt-toast`** (`shared/ui/toast.js` `toast(message, { kind: "ok" | "error" | "info", ms = 4500 })`,
returns dismiss). A short confirmation at the bottom of the screen, above the tab bar on phones
(full width at ≤ 640px). It renders in its own `.bt-root.bt-toast-host` on `<body>`, like a modal
portal; the host ignores clicks and each toast takes them. `.bt-toast-ic` (✓, !, i), `.bt-toast-text`,
`.bt-toast-x`. Errors are `role="alert"`, the rest `role="status"`; a toast stays while it's hovered
or focused. Use it for the result of an action that doesn't change the page much (an admin award);
keep inline notices for form errors. Reduced motion: no slide.

**Flip card, placard and chat** (promoted from the Arcade's How it works when the Trophy Room
became their second user; `docs/specs/rewards.md` §12). Same look and behaviour as before.
- **Flip card: `.bt-flip`**, a `<button>` medal card that turns over: `.bt-flip-in` >
  `.bt-flip-face` (front: `.bt-flip-medal`, `b`, `.bt-flip-sub`, `.bt-flip-hint`) and
  `.bt-flip-face--back` (`.bt-flip-k` labels, `.bt-flip-v` values, `.bt-flip-tag`). Hover or focus
  turns it; a tap toggles `.is-flipped` (`shared/ui/flip-card.js` `initFlipCards(root)`). Tones
  `--red` `--gold` `--teal` `--primary`, or set `--c`. `.bt-flip-grid`: four columns, two at
  ≤ 900px. Give the button an `aria-label` with both sides (the faces are `aria-hidden`). Reduced
  motion: it cross-fades to the back.
- **Placard: `.bt-placard`**, an arcade cabinet's instruction placard: `.bt-placard-head` (two
  blinking bulbs, a lit title) over `ol.bt-placard-list` of `li.bt-placard-rule`
  (`.bt-placard-n` outlined numeral, `b`, text); one column at ≤ 640px.
- **Chat: `.bt-chat`** (Ask BOOMBOT): `button.bt-chat-q` questions (right bubbles,
  `aria-expanded`, `aria-controls`) and `.bt-chat-a` answers (left bubbles: `.bt-chat-av` with
  `boombotIcon(uid)`, `.bt-chat-bub` with `small`, `.bt-chat-typing`, `.bt-chat-text`).
  `shared/ui/chat.js` `initChat(root)`: one open at a time, 650 ms of "typing" (`.is-thinking`);
  the answers are in the HTML from the start. Reduced motion: no typing.

**Game Vault kit pieces** (`docs/specs/game-vault.md` §9; mockups
`docs/design/mockups/game-vault-mockups.html` round 1 and `game-vault-round-2.html`). Built
for the Vault, reusable anywhere; all on the live UI kit page (Covers, search and triage).
- **Cover: `.bt-cover`**, a 3:4 box with an `<img>` or the mascot fallback
  (`.bt-cover-fallback`); `--sm` is a 48px thumb. `shared/ui/cover.js`:
  `coverHtml(cover, { cls, alt, over, tilt, size, eager })` builds the IGDB
  (`t_cover_big` / `t_cover_small`) or Steam (`library_600x900`) URL at display time from
  `{ source: igdb | steam | upload }`; nothing is copied to our side. `initCoverFallbacks()`
  swaps an image that fails to load for the mascot.
- **Cover grid and card: `.bt-cover-grid`** (auto-fill 164px, 140px at ≤ 640, two columns at
  ≤ 420) of **`.bt-cover-card`** links: `.bt-cover` + `.bt-cover-card-body` (`-title`, two
  lines; `-row` with a status badge and the score; `-meta`; optional `.bt-tags`).
  `--dimmed` greys an abandoned game; `.bt-cover-on--top` / `--bottom` put a badge or score
  on the art. Hover: the purple ring.
- **Score: `.bt-score`** (`b` value + small `/10`), `--lg`, `.bt-score-pips` (10 `i`,
  `.is-on`), `.bt-score-none` ("Not rated"). **Score dial: `.bt-dial`**
  (`shared/ui/dial.js` `dialHtml(score, { label, caption, size })` + `initDials(root)`): ten
  segments that light one by one in Boomer's gold (`--bt-title`) as it scrolls into view;
  `--sm`; reduced motion lights them at once.
- **Tag: `.bt-tag`** (neutral pill; `a`/`button.bt-tag` is clickable, purple on hover) in
  **`.bt-tags`**. **Token: `.bt-token`**, a removable active filter (purple: it's clickable),
  `<button>` + `<i>×</i>` + a `.bt-sr-only` "Remove …" label. **`.bt-sr-only`** hides text
  for everyone but screen readers.
- **Search: `.bt-search`** (icon + `.bt-input` + `.bt-search-key` showing "/" or
  `.bt-search-clear`), `--lg` for a page's main search. **Command panel: `.bt-cmd`**
  (`shared/ui/cmd.js` `initCmd({ input, mount, groups, onChoose })`) under a search field in a
  `position: relative` wrapper: `.bt-label` groups, `button.bt-cmd-item` options
  (`aria-selected`), `.bt-cmd-ic` for filter and action rows, `.bt-cmd-foot` with `kbd`. The
  field is a combobox: ↑ ↓ move, Enter picks, Esc closes. `litText(text, indexes, esc)` wraps
  matched letters in `<mark>`.
- **Chip count `.bt-chip-n`** (inside a chip or button) and **`.bt-chip--menu`** (a caret;
  `aria-expanded`). **Popover: `.bt-popover`** under a chip (checkbox or radio rows with a
  `.bt-popover-n` count, `.bt-popover-foot`). **Sheet: `.bt-sheet`**, a bottom sheet (grip,
  head, groups, chips, actions).
- **Pick list: `.bt-pick-list`** of **`button.bt-pick`** (thumb, `.bt-pick-main` with `b` and
  `small`, `.bt-pick-act` or a tag); `aria-pressed="true"` when chosen, `.is-in` when it's
  already there (an `a.bt-pick.is-in` links to it). **Dropzone: `.bt-dropzone`** (`.is-over`
  while a file is dragged over; keyboard: Enter or Space opens the file picker).
- **Tilt and glare: `[data-tilt]`** with a `.bt-glare` inside (`shared/ui/tilt.js`
  `initTilt()`, one delegated listener): the element turns toward the pointer and catches the
  light. Pointer devices with a fine pointer only; still under reduced motion.
- **Count-up: `[data-count-to]`** (+ `data-suffix`; `shared/ui/count-up.js` `initCountUp`): a
  number that counts up once as it scrolls in; its text is the final value without the script.
- **Shelf: `.bt-shelf`** in a `[data-shelf-wrap]` with `.bt-shelf-head`, `.bt-shelf-tools`
  and `.bt-shelf-arrows` (`[data-shelf-prev]` / `[data-shelf-next]`; `shared/ui/shelf.js`): a
  snap rail of cards (168px, 138px on phones; arrows hide on phones). `--ranked` with
  `.bt-ranked` + `.bt-rank`: outlined numerals in `--rk` (`--bt-rank-1..3` for the top three).
- **Section head: `.bt-section-head`** (`shared/ui/section-head.js` `sectionHeadHtml({ icon, title, count,
  sub, tools, level })`; Game Vault part 8, mockup SH3): a 38px icon tile, the heading with a
  `.bt-section-head-n` count pill (and an optional line under it), and a thin gold rule that runs
  across to `.bt-section-head-tools` (a shelf's arrows and See all). Use it for the head of any
  page section or shelf; phones drop the rule and the line under the heading. `meta` puts a short
  note at the right (`.bt-section-head-meta`); `small` (`.bt-section-head--sm`) is the compact size
  for the head above a card on a detail page (the Game Vault game page, G1).
- **Timeline: `.bt-timeline`** (`shared/ui/timeline.js` `timelineHtml({ points, site, ends,
  keys, label })` + `initTimelines`): dots on a line sized by value, a hollow `.is-legacy` dot
  for history before the site, a flag, a coloured stretch for "on the site", tooltips on hover
  and focus. Built for a game's streams; the Stream Library reuses it.
- **Triage deck: `.bt-deck`** (`shared/ui/deck.js` `initDeck(deck, { onKey })` +
  `flyOut(card, kind)`): `.bt-deck-count` / `.bt-deck-prog`, two `.bt-deck-ghost` cards behind
  one `.bt-deck-card` (cover + `.bt-deck-body`: `h3`, `.bt-deck-checks` with `.is-flag` rows,
  `.bt-deck-acts`). Approve flies right with a green glow, Reject left; A / R / S work while the
  deck has focus. Reduced motion: the card just swaps.
- **Gliding grid** (`shared/ui/flip.js` `flipSwap(container, html)`): items with `data-key`
  glide to their new places when a list re-renders; new ones fade in.
- **Store marks** (`shared/ui/brand-icons.js` `brandIcon(key)`): the official Steam, GOG,
  itch.io and Epic Games Store marks (Simple Icons, CC0), one-colour, for "Where to play".
- **Back pill: `.bt-back`** (`shared/ui/pager.js` `backHtml({ href, label, long, short })`; round 3
  N1): a frosted pill with a chevron, `.bt-back-long` ("Back to the Vault") and a small reminder of
  the list you came from ("Wishlist, A-Z"); on phones `.bt-back-short` ("Vault") replaces both.
- **Pager: `.bt-pager`** (`pagerHtml({ pos, total, prev, next, keys, label })`; round 3 P12):
  `.bt-pager-pos` ("3 of 14") and round ‹ › links (`.bt-pager-btn` with `data-pg="-1" / "1"` in a
  `.bt-pager-wrap`); a side with nothing is an empty `.bt-pager-gap`, so the other button doesn't
  move. `.bt-pager-peek` previews the item (cover, title, a line) on hover or focus, pointer
  devices only; `.bt-pager-keys` hints at ← →. 44px buttons on phones. The page wires the links and
  keys (the Vault's game page steps in place).

**Mod Machina pieces** (`docs/specs/mod-machina.md` §16, §8m; all on the UI Kit page under "Mod Machina"):
- **Admin badge: `.bt-badge--admin`**: the admin green (`--bt-admin-text` on `--bt-admin-tint`, a thin
  admin-border ring). For the Staff tag and the admin grade track only; never for anything a member can have.
- **Grade chip: `.bt-grade`** (`shared/ui/grade-chip.js` `gradeChipHtml({ track, grade, code, label })`, or
  `gradeChip(opts)` for an element): `.bt-badge` + `.bt-level` bars (option 1, Bars). Mod grades (`track: "mod"`,
  1-4: M1 Initiate blue, M2 Watcher gold, M3 Warden pink, M4 Sentinel red) show 4 bars; admin grades
  (`track: "admin"`, 1-3: A1 Steward, A2 Overseer, A3 Right Hand) use `.bt-badge--admin` and `.bt-level--3`.
  `grade` also takes `"A2"` or the profile's `crewGrade` claim (`parseGrade`). `code: true` prefixes "M2 ".
  ```html
  <span class="bt-badge bt-grade bt-badge--gold" data-track="mod" data-grade="2"><span class="bt-level">
    <i class="is-on"></i><i class="is-on"></i><i></i><i></i></span>Watcher</span>
  ```
- **Wordmark icon: `.bt-mm-icon`** (`shared/ui/mod-machina.js` `MM_ICON`): a gear with a watching eye, in
  `.bt-wordmark-icon` next to `MOD <span class="bt-wordmark-accent">MACHINA</span>` on `.bt-wordmark--power`.
  The gear turns slowly and the pupil glances about; on hover, focus or touch (`initPowerWordmarks`) the gear
  speeds up, the eye glows gold and MACHINA lights. Still under reduced motion.
- **Platform tile and room: `.bt-platform-icon--sm`, `.bt-room`** (`shared/ui/crew.js` `platformIconHtml(chat,
  { logo })`, `roomHtml({ chat, name, state, text })`). Chats: `twitch`, `ytLandscape`, `ytVertical` (a corner
  mark, `.bt-platform-or.is-l|.is-v`), `tiktok`; the tile is a letter until a real logo URL is passed
  (`.has-logo`). `.bt-room[data-state="covered|needed|off"]`: covered lime, **needed GOLD, never red** (red is
  for destroying data), off dimmed. `.bt-rooms` wraps a row of them.
- **Swap board: `.bt-swap`** (in `.bt-swaps`; `shared/ui/swap.js` `swapRowHtml({ id, dow, day, chat, role, roomName, note, state, actionLabel })`, `swapsHtml(rows)`; Mod Machina phase 3 part 1, mockup `docs/design/mockups/mod-deck.html` section 4): a seat someone dropped after publish. A day stub (`.bt-swap-day`), the platform tile, role and room (`.bt-swap-main`), a notice line and a **Take it** button (`data-swap-take`; wire it to `confirmAction()` and toast "Yours. See you <day> at <time>."). **Open is GOLD** (it means "needed"), never red; `.is-taken` is dimmed with no button ("Taken by @handle"); `.is-mine-now` is purple with a lime "Yours" badge. Hover lifts the row (none under reduced motion); under 640px (container `bt`) the button drops under the row. On /live/deck and /crew/hq it sits in a `.bt-cr-panel`/`.bt-card` with a gold count badge ("2 up for grabs"); the empty state is the mascot and "Nothing up for grabs. Every seat has its crew." Shown in every state on the UI kit page under Mod Machina.
- **Preference rows: `.bt-pref`** (`shared/ui/pref.js` `prefHtml({ rows })`, `prefRowHtml`, `initPrefs(root,
  { onChange(chat, value) })`, `PREF_OPTIONS`): one `.bt-pref-row[data-chat]` per chat with a `.bt-pref-seg`
  radio group (Favourite · Happy to help · Only if needed · No; values `favourite`, `happy`, `ifNeeded`, `no`).
  Buttons are `role="radio"` with `aria-checked` and a roving tabindex; arrows, Home and End move and choose.
  A row with `needed` gets a gold edge and a "Most needed" tag. The group is full width on phones. The change
  also fires a bubbling `bt-pref-change` event (`detail: { chat, value }`). `initRadioGroup(group, opts)` is the
  reusable radio behaviour.
- **Crew card: `.bt-crew-card`** (`crewCardHtml({ name, handle, href, avatar, gradeHtml, staff, onBreak, chats,
  meta })` in `.bt-roster`): a `.bt-tile` with avatar, name, grade chip (plus the Staff tag for admins, a gray
  "On a break" and a dimmed `.is-reserve` card), and the chats as `.bt-crew-plats`: a star on favourites, faded
  for No (`chats: { twitch: "favourite", … }`), each with a screen-reader label.
- **Podium and crew board: `.bt-podium`** (`podiumHtml({ places })`, B2): the top three as `.bt-podium-card[data-r]`
  with rank, avatar, name and chip, a big value (`.bt-podium-val`) and a line; 1st sits in the middle and taller,
  one column on phones with 1st first. Under it the table is `.bt-board.bt-board--crew` (cells `.bt-board-n`,
  `.bt-board-rooms`, `.bt-board-hide` for the columns phones drop, `tr.is-staff` green-tinted, `tr.is-me`) and
  `.bt-board-legend`.
- **Time card: `.bt-timecard`** (`timecardHtml({ month, need, total, slots, state, bonusHtml, foot, badge })`, M2):
  ruled paper with a slot per duty (`.bt-timecard-slot.is-punched` with a `.bt-timecard-stamp` date, empty slots
  numbered "Needed" / "Extra", a dashed `.is-bonus` slot holding the On the Clock medal). `data-state` is
  `normal` (enough duties, lime "Active"), `behind` (the owed slots go gold), `done` (every slot punched, "On
  the Clock earned") or `idle`: "Starts with stream duty", shown while `crew.activityRules` is off, with the
  slots dimmed and nothing to punch. The state defaults from the number of punched slots; pass `state: "idle"`.
- **Progress ring: `.bt-ring`** (`ringHtml({ value, centre, caption, label, size, done })`): a conic ring driven by
  `--v` (0-100) with a text centre (`.bt-ring-c`: a number and a small caption); `--sm` is 64px with the number
  only, `--done` turns it lime. `role="img"` with `label` as its name.
- **Ladder: `.bt-ladder`** (`shared/ui/ladder.js` `ladderHtml({ rungs, selected, label, id, gate })`,
  `ladderDetailHtml({ chipHtml, meta, title, text, can, up, tags, admin })`, `initLadder(root, { onSelect })`):
  `.bt-ladder-rungs` is a vertical `role="tablist"` (lowest rung at the bottom; roving tabindex, `aria-selected`;
  Up climbs, Down descends, Home and End) and each `.bt-ladder-detail` is a `role="tabpanel"` already in the
  HTML (the unselected ones `hidden`). The first admin rung sits above a dashed `.bt-ladder-gate`
  ("Invitation only"); admin rungs and cards go green. Stacks on phones.
- **Quiz: `.bt-quiz`** (`shared/ui/quiz.js` `quizHtml({ questions, passMark, title })`, `initQuiz(root, { submit,
  onResult })`, `showQuizResults(el, answers, outcome)`): one question at a time (`.bt-steps`, Back / Next, a
  radio group of `.bt-quiz-opt` buttons). The component never knows the answers: on the last question it calls
  `await submit(answers)` (chosen option indexes) and the page returns `[{ correct, say }]` or `{ results,
  passed?, say? }`; a throw shows an error line and allows another try. Then every question shows `.is-right`
  (lime) or `.is-wrong` (red, with a ✕) on the picked option, the rest stay neutral, each with BOOMBOT's `say`
  as a `.bt-chat-a` bubble, and `.bt-quiz-result[data-state="pass|fail"]` shows a small ring, the score and,
  when not passed, a Try again button (a pass is "Passed", a fail is "Not quite", never red).
- **Four-step journey: `.ai-jr.ai-jr--4`** (`site/src/styles/how-it-works.css`, behaviour `initJourney` in
  `shared/ui/how-it-works.js`, markup exactly like the other journeys: `ol.ai-jr.ai-jr--4[data-journey] > li[tabindex=0]`
  with `.ai-jr-num`, `.ai-jr-ic`, `b`, `.ai-jr-t`). The same line and circles as the 3 / 5 / 6-step journeys with four
  columns (641px and up; phones keep the vertical path, the fill re-measured for four). Added rules only, so the
  other journeys are unchanged. Step states on the `li`: `.is-met` (lime circle, put a ✓ in `.ai-jr-num`), `.is-wait`
  (gold ring, dashed card: not yet), `.is-locked` (dimmed, dashed: comes later), `.is-waived` (teal: the owner waived
  it), and `.is-on` / `.is-past`, which `initJourney` sets on hover, focus and tap. `.ai-jr-v` is an optional value line
  under the text ("✓ 35 days"), coloured by the state. A page that shows progress without hover sets `--p` on the `ol`
  (the index the line fills to) and `.is-on` / `.is-past` itself.
- **Stamp: `.bt-stamp`** (`shared/ui/stamp.js` `stampHtml({ label, kicker, sub, tone, size })`): the celebratory seal
  ("Application · In · Oct 7"), for story pages and the key action on a tool page (queued, signed off, sent). `label`
  is the big word, `kicker` a small line above and `sub` below; `tone` is gold by default, `lime` or `primary`
  (`.bt-stamp--lime`, `--primary`, driven by `--st`); `size: "sm"` is `.bt-stamp--sm` (96px). It slams in once (scale and
  fade, `bt-stamp-slam`, 0.5s) and settles tilted; render it when the moment happens, or re-render to replay. Under
  `prefers-reduced-motion` there is no animation. `role="img"` with the text as its name.
- **Day picker: `.bt-day-picker`** (`shared/ui/day-picker.js` `dayPickerHtml({ days, selected, label, disabled })`,
  `initDayPicker(root, { onChange(selected, key) })`, `dayPickerValue(picker)`, `DAYS`): seven `.bt-day` tiles in a
  `role="group"`. Each is a real `<button aria-pressed>` (Tab, Space, Enter) with the day name, an optional big number
  (`num`, e.g. the date) and a dot that lights when chosen. `days` is `[{ key, label, num?, disabled? }]` or plain
  labels (the key is the index); default Mon to Sun. Selected tiles take the primary edge. `disabled` greys out
  the whole picker or a single tile. The change also fires a bubbling `bt-day-change` event (`detail: { selected, key }`).
  Seven columns at every width (tighter on phones).
- **Chat tile: `.bt-chat-tile`** (`shared/ui/chat-tile.js` `chatTileHtml({ chat, name, iconHtml, value, needed, boost,
  previewHtml, note })`, `chatPreviewHtml(messages)`, `initChatTiles(root, { onChange(chat, value) })`): a chat card for
  the per-chat choice on story pages (`.bt-pref` stays for the denser profile list). Header with the platform icon
  (`platformIconHtml`) and name, an optional gold "Most needed" ribbon (`needed`; `boost: 1.5` adds "· ×1.5"; gold edge,
  never red), a mini chat of a few fake messages (`.bt-chat-tile-mini`, from `chatPreviewHtml([{ user, text, tone }])`;
  `{ text, quiet: true }` is an italic system line) and the choice, a 2x2 `role="radiogroup"` (`.bt-chat-tile-pick`;
  Favourite · Happy to help · Only if needed · No, the same values as `.bt-pref`: `favourite`, `happy`, `ifNeeded`, `no`),
  built on `initRadioGroup` (roving tabindex; arrows, Home and End move and choose). `data-value` on the tile follows
  the choice: Favourite lights the primary edge, Happy to help a softer one, No dims the tile. Fires a bubbling
  `bt-chat-tile-change` event (`detail: { chat, value }`). The page lays the tiles out in its own grid.

**Scream Planner pieces** (`docs/specs/scream-planner.md` §13; approved mockup
`docs/design/mockups/scream-planner-mockups.html`; all on the UI Kit page under "Scream Planner", built in
`shared/ui-kit/kit-scream-planner.js`). Builders live in `shared/ui/` (§6); text is escaped, `*Html` arguments are
trusted markup; covers are always `coverHtml()` from `cover.js` (`.bt-cover`). Unique colours are custom properties
declared once at the top of the block in `bt-ui.css`: `--bt-velvet` (+ `-rgb`), `--bt-bulb`, `--bt-fuse`, `--bt-wire`,
`--bt-wax`, `--bt-snow`, `--bt-ice`, `--bt-pumpkin` (+ `-dk`), `--bt-stem`, and the shadow and glint triplets
`--bt-ink-rgb`, `--bt-sheen-rgb`; everything else is `var(--bt-*)`. Container queries only (1024 / 640 / 420). Under
reduced motion every piece goes still (frames, doors, flip clock, bursts, slider; one block at the end of the CSS).
**Naming:** `.bt-portal` is the modal portal (rule 6), so the doors are `.bt-doors` / `.bt-door`, never `.bt-portal`.
- **Icon:** `SP_ICON` (`.bt-sp-icon`, `scream-planner.js`) in `.bt-wordmark.bt-wordmark--power`: SCREAM PLANNER. On
  hover, focus or touch (`initPowerWordmarks`) the top page rips away and the mouth stretches. No sprite icon is needed.
- **Small parts:** `.bt-theme` (`themeChipHtml`), `.bt-velvet` (`velvetHtml`, the backstage badge), `.bt-plats`
  (`platformsHtml`), `.bt-avs` / `.bt-av` (`avatarsHtml`), `.bt-src--mod|vote|theme|you` (`srcHtml`), `.bt-dualtime`
  (`dualTimeHtml({ start, end, was, tz, localTz })`: Central first, your own time after, skipped when it is the same clock;
  `was` strikes a delayed time). `timeRangeText`, `dayParts` format dates for a ticket.
- **Ticket `.bt-ticket`** (`ticket.js` `ticketHtml`, `initTickets`): `.bt-ticket-stub` (day) + `.bt-ticket-body`. States by
  `state`: `scheduled` · `soon` (On air soon, with the stamp) · `tonight` (spinning edge) · `live` (red) · `ended`
  (`is-past`) · `cancelled` (tape, reason) · `off` (day off); `was` + `reason` add "Delayed · reason"; `backstage` adds the
  velvet badge and rope. Covers fan out (three, then dashed `+N`). Grid: `.bt-tickets` (3, 2, 1 columns).
- **Marquee `.bt-marquee[data-frame]`** (`marquee.js` `marqueeHtml`, `miniMarqueeHtml`, `setMarqueeFrame`, `frameHtml`):
  `FRAMES` (pool of 11: bulbs neon barbed drip tape film web electric vhs candles ecg), `SEASONAL` (jack, pumpkin,
  blizzard, snowman; picked by hand, never rolled), `rollFrame({ recent, current })`. Layers: `.bt-marquee-frame`,
  `.bt-marquee-main` (`-neon` kicker, `-title`, `-when`, `-meta`, `-cta`), `.bt-marquee-art` (two tilted covers) and
  `.bt-marquee-peek` (the mascot; hidden for `snowman`). `--mini` is the card-sized version.
- **Flip clock `.bt-flipclock`** (`flipClockHtml({ startsAt })`, `initFlipClocks(root, { onZero })` → `{ stop }`):
  `role="timer"`, Hours : Min : Sec under a day, Days : Hours : Min above; flips only the changed digits; `is-zero` at 0.
  `initFlipClocks` also ticks the VHS frame's REC counter.
- **Vote** (`vote.js`): `.bt-vote-card` (`voteCardHtml`, in `.bt-vote-grid`), `.bt-race-row` (`raceRowHtml`, in
  `.bt-race`), `.bt-vote-btn` (`voteBtnHtml`: Vote, Voted ✓ `is-on`, No votes left, Join to vote `[data-join]`),
  `.bt-vote-add`, `.bt-drops` / `.bt-tokens` (`dropsHtml`, `tokensHtml`: "2 of 3 votes left"),
  `initVoteButtons(root, { onVote(slug, on, btn), onJoin, onAdd })` (a new vote bursts).
- **Fuse `.bt-fuse`** (`fuseHtml({ steps, progress, left, short })`): the deadline strip; `.bt-unpub`, `.bt-published`,
  `.bt-btn--shine` (the Publish week button) go with it.
- **Slot + tray** (`slot.js`): `.bt-slot` (`slotHtml`, `slotOffHtml`, `roomsMiniHtml`; states `is-sel`, `is-published`,
  `is-backstage`; sockets `.bt-sock`, empty `.bt-sock-empty`; "needed" is gold, never red) and `.bt-tray` (`trayHtml` with
  the four fixed groups mod · vote · theme · pick, `trayEmptyHtml`). `initTray(root, { onAdd(slug, kind, item, socket),
  onRemove(slotId, i, slug), onSearch(q) })`: the + button (tap, Enter, Space) or a mouse and pen drag onto a slot; touch
  uses +. The page owns the data and re-renders.
- **Tri-toggle `.bt-tri`** (`tri.js` `triHtml({ value, label, name, disabled })`, `initTri`): `role="radiogroup"`,
  arrows, Home and End; `data-value` yes | maybe | no | "" drives the pill; `bt-tri-change` event.
- **Poster `.bt-poster`** (`poster.js` `posterHtml`, `posterAddHtml`) in `.bt-posters` (7 columns, scrolls at 640px).
- **Doors `.bt-door[data-style]`** (`doors.js`): styles `jaws` · `elevator` · `coffins` · `morgue` · `hinged`
  (`DOOR_STYLES`, `rollDoorStyle`, `setDoorStyle`); `doorHtml({ state })` with `later` · `tonight` (open a crack, light
  leaking) · `ended` (greyed, Ended stamp) · `cancelled` (chained, padlock, rattles on hover) · `off` (sealed) and
  `backstage` (velvet); `doorStateFor(stream, now, tz)` picks the state. `.bt-doors` is the row of seven; each door floats
  out of step (`--ph`). `initDoors(root, { onOpen(id, el) })`.
- **Slider `.bt-slider`** (`slider.js` `sliderHtml({ cells, index })`, `initSlider(root, { onChange })` → `{ go, get }`): the
  L4 layout. Above 640px (container) a row of seven; at 640px and below a left-right slider, tonight centred and open, the
  neighbours scaled and dimmed; swipe, ‹ ›, dots, arrow keys; no wrap. `bt-slider-change` event.
- **View switch `.bt-view-switch`** (`view-switch.js` `viewSwitchHtml`, `initViewSwitch`, `WEEK_VIEWS`, `VOTE_VIEWS`): a
  radiogroup that emits `bt-view-change`; the PAGE saves it (`bt.schedule.weekView`, `bt.schedule.voteView`, try/catch).
- **Burst** (`burst.js`): `burst(el)`, `flyTo(from, to, done)`, `celebrate(root, { selector })` (the ON AIR SOON stamp and a
  splat burst on each card), `onAirSoonHtml()`; nothing under reduced motion.
- **Crew view** (`seats.js`, added with the staff pages; shown live on the UI Kit page): `.bt-cslot` (`cslotHtml({ id, day, num, icon, label, timeHtml, count, games, metaHtml, state, backstage, sideHtml })`: the crew's slot card with read-only game sockets and a right column for the tri-toggle, seat map and Ask for a game; `state: "yes"` lights a lime edge), `.bt-smap` (`seatMapHtml({ captainHtml, rooms: [{ chat, name, boost, boxesHtml }] })`: the Captain row and one `.bt-smap-room` per chat, YouTube rooms edged gold with the "×1.5" boost), `.bt-sbox` (`seatBoxHtml({ kind, name, role, note, seat, label, title })`: `taken`, `open` (gold dashed button, `data-seat="room:role"` or `captain`), `mine` (primary; a button with `data-drop` when given a `seat`), `locked`), `.bt-crewbar` + `.bt-month` (`crewBarHtml`, `monthMeterHtml`: your grade and status chips, the month's duties as little bars and notes) and `.bt-myreq` (`myReqHtml`: "You asked for X" with where it stands). "Needed" is gold, never red.
- **Slot card options** (`slot.js`): `timeHtml` (a `dualTimeHtml`), `badgeHtml` (Delayed, Cancelled...), `metaHtml`, `actionsHtml` (`.bt-slot-acts`, buttons at the foot of the right column) and `reorder` (‹ › on a hovered game, `data-mv="slotId:index:-1|1"`). `confirmAction` takes `bodyHtml`, `cancelLabel` and `onOpen(modal)` (and passes `modal` to `onConfirm`) for a confirm dialog with a choice or a preview.

### Control Room pieces
Built for `docs/specs/control-room.md` §15 (mockups `docs/design/mockups/control-room-*.html`); shown in every state on the UI Kit page, section "Control Room" (`shared/ui-kit/kit-control-room.js`), which also has the Look switch. CSS block "Control Room pieces" at the end of `shared/bt-ui.css`. Colour meaning holds: purple clickable, gold headings and "needed", **red only for the live tag, the beacon and the open check-in** (`--bt-cr-live`: red, green under `[data-live="backstage"]`), green "You're in" and staff. Container queries only; reduced motion keeps colour and glow and drops movement, except inside `.bt-streamview`.
- **Panel `.bt-cr-panel`** (`cr-panel.js` `crPanelHtml({ id, cls, title, icon, tagHtml, actionsHtml, bodyHtml, label, level })`, `crPanelHeadHtml`, `CR_HEAD_ICONS`): a card with a head row `.bt-cr-panel-head` (`.bt-cr-hico` icon tile, `h2.bt-heading`, `.bt-cr-sp`, tag, `.bt-cr-led`, `.bt-cr-scan`). The icon tile, led and scan are always in the markup and hidden until a look shows them. Every Control Room block (readouts, check-in, crew, questions...) is a panel so the looks reach it.
- **Viewport `.bt-cr-viewport > .bt-cr-screen + .bt-cr-strip`** (`crViewportHtml({ innerHtml, overlayHtml, label })`): the frame round the video, a 16:9 glass; gold corner brackets. Hull: breathing targeting frame. CRT: a TV with its control strip (`.bt-cr-strip`, hidden otherwise).
- **Readout `.bt-readout`** in `.bt-readouts[data-cols]` (`readout.js` `readoutHtml({ value, label, key, wide, extraHtml })`, `readoutsHtml(list, { cols })`, `readoutBarsHtml([{ chat, value, max }])`, `setReadout(el, value, { tick })`, `initReadouts(root)`): big tabular number + label; `.is-tick` flashes gold when the text changes (`setReadout` does it); `data-ghost` feeds the hull look's ghost digits. `.bt-readout-bars > .bt-readout-bar` are per-platform bars (fuel cells in the looks).
- **Beats `.bt-beats`** (`beats.js` `beatsHtml({ beats: { start, break1, break2, end }, now, progress, chips, label })`, `BEAT_KEYS`, `BEAT_NAMES`): four stations, each `done` | `now` (double ripple, live colour) | `next` | `skipped` | empty; a value may be `{ state, time }`; `now: "break1"` forces that one and sets the line's fill. An `ol.bt-beats-list` of `li.bt-beat`.
- **Check-in `.bt-checkin`** (`checkin.js` `checkinHtml({ state, beat, closesAt, lengthMs, time, count, id, wordLabel, value, tries, room, rooms, stamps, first, message, avatarHtml, xp, streak, title, text, dialog })`): `data-state` = `entry` | `wrong` | `locked` | `success` | `visitor` | `closed`; `.is-open` (red or green edge) while a window is open. Parts: `.bt-checkin-ring` (--ring 0-1, countdown), `.bt-checkin-count`, `form.bt-checkin-form` with `.bt-checkin-word` (input `name="word"`) and `.bt-checkin-rooms` (a real radiogroup: `.bt-checkin-room[role=radio][data-value]`, canonical rooms `twitch`, `ytLandscape`, `ytVertical`, `tiktok`, `site`, labels Twitch, YouTube landscape, YouTube vertical, TikTok, On the site), `.bt-checkin-first`, `.bt-checkin-stamps` (four `.bt-checkin-stamp[data-beat]`, `.is-got`, `.is-new` slams). `dialog: true` renders the card without panel chrome (`.bt-checkin--dialog`) for the check-in dialog, which no look touches. `initCheckin(root, { onSubmit(word, room, el) })`: the countdown ticks to `data-closes` and stops there (form disabled, `bt-checkin-closed` bubbles); `onSubmit` returns `{ ok: true, count?, xp? }` | `{ ok: false, left }` | `{ locked: true }` | `{ error }` and the card shows that state (`applyCheckinResult(el, result)` does the same). `setCheckinCount`, `roomPickerHtml`, `stampsHtml`, `ROOMS`, `ROOM_KEYS`, `fmtClock`.
- **Live banner `.bt-live-banner[data-state="open"|"in"]`** (`liveBannerHtml({ state, beat, closesAt, time, cta, extra, dismissible })`: `extra` is small text after "You're in for ..." ("+10 XP"), `dismissible` adds `.bt-live-banner-x` (`data-banner-dismiss`; fires a bubbling `bt-banner-dismiss` and hides it); the site mounts it in `[data-live-banner]` under the header (scripts/live/site-banner.ts) and the overlay header steps out of the hero while it shows, `initLiveBanner(root, { onCheckIn(banner) })`): the site-wide strip under the header: "Check-in is open · Break 1 · 4:31 left · Check in" (red; the `[data-checkin-open]` button fires a bubbling `bt-checkin-open`), and "You're in for Break 1" (green). At zero it hides itself. Identical in every look.
- **Check-in dialog** (`openModal({ variant: "sheet", feature: "live-checkin" })`, scripts/live/checkin-dialog.ts): `.bt-modal--sheet` is a centred dialog that becomes a bottom sheet at <= 640px; inside, the kit's `.bt-checkin--dialog` card, and after a right word `.bt-ci-done` (the `.bt-stamp` slam, `.bt-ci-chips` with `.is-xp`, `.is-streak`, `.is-beats`, the four stamps). The /live panel and the dialog share scripts/live/checkin-flow.ts (rooms, the remembered room, the streamCheckIn call).
- **Launch panel `.bt-launch > .bt-launch-tile`** (`launch.js` `launchHtml({ tiles: [{ id, icon, title, sub, state, action, statusText }] })`, `launchTileHtml`, `initLaunch(root, { onLaunch(id, state, tile) })`): a button per activity. `state` `idle` (purple "Start"), `running` (`.is-running`, live tag and edge; one at a time is the page's job), `off` (`.is-off`, disabled, `sub` says why). Fires `bt-launch`.
- **Checklist `.bt-checklist`** (`checklist.js` `checklistHtml({ groups: [{ id, title, open, items: [{ id, text, note, shortcut, done }] }] })`, `initChecklist(root, { onToggle(itemId, done, groupId) })`, `tickChecklistItem(root, id, done)`): `.bt-task-row` is an XP activity row and does not fit. Groups fold (`.bt-checklist-head`, `aria-expanded`) to a progress chip ("3 of 5"); rows are real checkbox labels with a tick pop; `shortcut` text is purple. Fires `bt-checklist-toggle`.
- **Deck plan `.bt-deckplan`** (`deckplan.js` `deckplanHtml({ bridge, bays: [{ name, iconHtml, people: [{ name, role, gradeHtml }], open, need }] })`, `deckBayHtml`): the hull from above, Bridge up front, a compartment per room. `.is-lit` (green edge, pinging dot) or `.is-open` (dashed, gold, "needed").
- **Stream view `.bt-streamview > .bt-streamview-frame[data-shape="wide"|"tall"]`** (`streamview.js` `streamViewHtml({ shape, sceneHtml, label, fit })`, `fitStreamView(el)`, `initStreamView(root)` → disconnect, `STREAM_SIZES`): the frame keeps its design size (1920x1080 or 1080x1920) and is scaled by a transform (`--bt-sv-s`, ResizeObserver) to its box; `fit: false` (`data-fit="off"`) draws it unscaled for the real `/live/obs` page. **No container-query reflow inside the frame and its motion ignores reduced motion** (video overlay). Scene parts (canvas px): `.bt-sv-panel`, `.bt-sv-h` + `.bt-sv-led`, `.bt-sv-amber`, `.bt-sv-word`, `.bt-sv-url`, `.bt-sv-muted`, `.bt-sv-ring`, `.bt-sv-count`, `.bt-sv-rooms > .bt-sv-room`, `.bt-sv-first`, `.bt-sv-cam`, `.bt-sv-beats > .bt-sv-beat`, `.bt-sv-ticker`.
- **Wordmark** (`control-room.js` `CR_ICON`, `crWordmarkHtml({ href, label })`): CONTROL + accent ROOM on `.bt-wordmark--power` with the radar-scope `.bt-cr-icon`; the sweep turns and the blip lights in the live colour while `body[data-live]` is public or backstage, faster on hover, focus or touch (`.is-lit`), still under reduced motion.
- **Looks** (`site/src/styles/control-room-looks.css`; `control-room.js` `LOOKS`, `setLook(root, look)`, `crBoot(root)`): `data-look="hull" | "crt"` on the page root (or any ancestor of the pieces) plus the one stylesheet. A look restyles surfaces, frames, motion and decoration only. It sets no heading font size, hides or disables no link or button, recolours no live-red, gold, purple or green meaning (its decorative lights are lime), and never touches `.bt-live-banner` or `.bt-checkin--dialog`. Import the stylesheet on each Control Room page. `crBoot(root)` plays the CRT switch-on after a state change (numbers panels with `--i`, adds `.is-boot`).

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
| `navgroup.js` | `initNavGroups(root, { onOpen(name, panel, { first }), onClose(name, panel) })` → `{ open, close, destroy }`: the header menus (`.bt-navgroup`, §5): upgrades each `[data-navgroup-trigger]` link to a disclosure button, hover opens after ~140 ms (mouse), click toggles, one open at a time, outside click, scroll, resize (width) or Escape closes (Escape returns focus to the trigger). Tile builders (inner html): `featureLoadingHtml(label)`, `watchFeatureHtml({ title, whenHtml, startsAt })`, `playFeatureHtml({ title, href, best, bestNote, text, cta })`, `communityFeatureHtml({ month, winners, mascotHtml })`; `initWatchTile(tile, { title, startsAt, url, name })` → `{ start, stop }` (ticking countdown, Add to calendar downloads an `.ics`), `streamIcs(...)`. |
| `cover.js` | `coverHtml(cover, opts)`, `coverUrl(cover)`, `IGDB_COVER`, `STEAM_COVER`, `mascotFallback()`, `initCoverFallbacks()` |
| `tilt.js` · `count-up.js` · `flip.js` | `initTilt()` · `initCountUp(root)` · `flipSwap(container, html)` |
| `dial.js` | `dialHtml(score, { label, caption, size })`, `initDials(root)` |
| `cmd.js` | `initCmd({ input, mount, groups, onChoose, foot })` → `{ refresh, close }`; `litText(text, indexes, esc)` |
| `shelf.js` · `timeline.js` · `deck.js` | `initShelves(root)` · `timelineHtml(opts)`, `initTimelines(root)` · `initDeck(deck, { onKey })`, `flyOut(card, kind)` |
| `flip-card.js` · `chat.js` | `initFlipCards(root)` · `initChat(root)` |
| `stepper.js` · `lanes.js` | `stepperHtml({ steps, open, crate, rail })`, `keepOpenInView(el)` · `lanesHtml({ weeks, rows })` |
| `road.js` · `tree.js` | `roadHtml({ levels, selected, label, mascot, panelHtml })`, `initRoad(host, { renderPanel, onSelect })` · `initTree(root, { collapsed, onChange })` |
| `season.js` · `countdown.js` | `taskRowHtml`, `lockCardHtml`, `clockHtml`, `pathHtml` · `timerHtml`, `initTimers(root)`, `fmtLeft(ms)` |
| `toast.js` | `toast(message, { kind, ms })`: a floating confirmation (ok, error, info); returns dismiss |
| `brand-icons.js` | `brandIcon(key, size)`, `BRANDS` (steam, gog, itch, epic) |
| `cycle-wheel.js` | `cycleWheelHtml({ id, label, title, badge, stages, current, play, note })` (markup string), `initCycleWheels(root)` → `[{ show, stop }]`. The `.bt-cycle-wheel` tablist, prev / next, Play every 2.6 s (§5). |
| `grade-chip.js` · `mod-machina.js` | `gradeChipHtml({ track, grade, code, label })`, `gradeChip(opts)`, `gradeInfo`, `parseGrade`, `GRADES` · `MM_ICON` (the Mod Machina wordmark icon) |
| `crew.js` | `platformIconHtml(chat, { logo })`, `roomHtml`, `crewCardHtml`, `podiumHtml`, `timecardHtml`, `ringHtml`, `PLATFORMS` |
| `pref.js` · `ladder.js` · `quiz.js` | `prefHtml({ rows })`, `prefRowHtml`, `initPrefs(root, { onChange })`, `initRadioGroup(group, { onChange })`, `PREF_OPTIONS` · `ladderHtml`, `ladderDetailHtml`, `initLadder(root, { onSelect })` · `quizHtml`, `initQuiz(root, { submit, onResult })`, `showQuizResults(el, answers, outcome)` |
| `stamp.js` | `stampHtml({ label, sub, kicker, tone, size })`: the `.bt-stamp` seal (markup string, text escaped) |
| `swap.js` | `swapRowHtml({ id, dow, day, chat, role, roomName, note, state, actionLabel })`, `swapsHtml(rows)`: the `.bt-swap` row (state `open`, `taken` or `mine`) and its `.bt-swaps` wrapper (text escaped) |
| `day-picker.js` | `dayPickerHtml({ days, selected, label, disabled })`, `initDayPicker(root, { onChange(selected, key) })`, `dayPickerValue(picker)`, `DAYS` |
| `chat-tile.js` | `chatTileHtml({ chat, name, iconHtml, value, needed, boost, previewHtml, note })`, `chatPreviewHtml(messages)`, `initChatTiles(root, { onChange(chat, value) })` (reuses `initRadioGroup` from `pref.js`) |
| `scream-planner.js` · `ticket.js` · `poster.js` | `SP_ICON`, `themeChipHtml`, `velvetHtml`, `platformsHtml`, `avatarsHtml`, `srcHtml`, `dualTimeHtml`, `timeRangeText`, `dayParts` · `ticketHtml`, `initTickets` · `posterHtml`, `posterAddHtml` |
| `marquee.js` | `FRAMES`, `SEASONAL`, `frameHtml`, `marqueeHtml`, `miniMarqueeHtml`, `setMarqueeFrame`, `rollFrame`, `flipClockHtml`, `initFlipClocks` |
| `vote.js` · `slot.js` | `voteCardHtml`, `raceRowHtml`, `voteBtnHtml`, `voteAddHtml`, `tokensHtml`, `dropsHtml`, `initVoteButtons`, `fuseHtml` · `slotHtml`, `slotOffHtml`, `roomsMiniHtml`, `trayHtml`, `initTray` |
| `tri.js` · `view-switch.js` | `triHtml`, `initTri` · `viewSwitchHtml`, `initViewSwitch`, `WEEK_VIEWS`, `VOTE_VIEWS` |
| `doors.js` · `slider.js` · `burst.js` | `doorHtml`, `doorsHtml`, `doorStateFor`, `setDoorStyle`, `initDoors`, `DOOR_STYLES` · `sliderHtml`, `initSlider` · `burst`, `flyTo`, `celebrate`, `onAirSoonHtml` |
| `seats.js` | `seatBoxHtml`, `seatMapHtml`, `cslotHtml`, `crewBarHtml`, `monthMeterHtml`, `myReqHtml` (the crew view's seat map, slot card and bar) |
| `readout.js` · `beats.js` | `readoutHtml`, `readoutsHtml`, `readoutBarsHtml`, `setReadout`, `initReadouts`, `ghostOf`, `fmtNum` · `beatsHtml`, `BEAT_KEYS`, `BEAT_NAMES` (Control Room, §5) |
| `checkin.js` | `checkinHtml`, `roomPickerHtml`, `stampsHtml`, `initCheckin(root, { onSubmit })`, `applyCheckinResult`, `setCheckinCount`, `liveBannerHtml`, `initLiveBanner(root, { onCheckIn })`, `ROOMS`, `ROOM_KEYS`, `fmtClock` |
| `launch.js` · `checklist.js` · `deckplan.js` | `launchHtml`, `launchTileHtml`, `initLaunch` · `checklistHtml`, `initChecklist`, `tickChecklistItem` · `deckplanHtml`, `deckBayHtml` |
| `streamview.js` · `cr-panel.js` · `control-room.js` | `streamViewHtml`, `fitStreamView`, `initStreamView`, `STREAM_SIZES` · `crPanelHtml`, `crPanelHeadHtml`, `crViewportHtml`, `CR_HEAD_ICONS` · `CR_ICON`, `crWordmarkHtml`, `LOOKS`, `setLook`, `crBoot` |

## 7. Migration guide (Bug Zapper, Feature Lab, Cloud Stash)

Visual/markup refactor only: no changes to Firestore data shapes, rules, Cloud
Functions, enum values, identity sources (Bug Zapper's `meTooBy` uses Firebase uid,
Feature Lab's `votes` uses MemberSpace id — keep both; legacy only, MemberSpace was cancelled Oct 9, 2026 and the new site uses Firebase uids), or comment visibility.

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

**Cloud Stash (done, built fresh on the new site as `/admin/stash`; see 8s):** `.ds-header` → `.bt-topbar` (wordmark CLOUD + STASH, admin controls) +
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

**Superseded (Oct 2026).** This describes the old Squarespace Code Block, which is being retired (ROADMAP launch checklist). The new Cloud Stash is `/admin/stash` on the Astro site and follows the site's own auth (`onAuth`, `StashLayout`): visitors get a sign-in gate, members are sent to `/cloud-stash/how-it-works`, admins see the tool. See 8s. The text below is kept for the history of why the old page didn't use `admin-auth.js`.

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

### 8i. Game Vault

Spec: `docs/specs/game-vault.md` (and `docs/specs/stream-object.md`); mockups
`docs/design/mockups/game-vault-mockups.html` (round 1) and `game-vault-round-2.html` (round 2:
A65 C56 B34 D34 E4 F3 G34). Pages: `/games`, `/games/{slug}`, `/games/queue`; feature CSS
`site/src/styles/game-vault.css` (the hero, filter bar, tape, stamps, ribbon, lock scene,
flashlight, dust and the GAMEVAULT icon), scripts in `site/src/scripts/vault/`.

- **Staff green means mods and admins.** The admin green (`--bt-admin-*`, `.bt-btn--admin`) was
  admin-only; the Vault widens it to staff: the Queue button and count, Approve, Hide and the
  admin Edit all use it. Mods see the queue and Hide; only admins see Edit and Delete.
- **Boomer's gold is his own voice.** The score dial lights in `--bt-title`, the colour the site
  already uses for Boomer's words (titles, verdicts); never a status. Statuses keep their badge
  tones (Playing green, Finished lime, Abandoned gray, Wishlist gold).
- **Covers come from IGDB or Steam at display time.** We store only the IGDB image id or the
  Steam app id and build the URL in the browser (`shared/ui/cover.js`); nothing is copied to
  our side unless an admin or mod uploads an override (Cloudinary `game-vault/covers`). A game
  with no art shows the mascot.
- **The vault door is gone** (replaced by the V3 hero, below). The /games hero no longer plays an
  opening and nothing is kept in `sessionStorage` for it; the GAMEVAULT wordmark icon and its hover
  spin stay.
- **Member cover suggestions are only for games with no cover** (the mascot), or with an Add it
  by hand; never to replace an existing cover. They're cropped to 3:4 in the browser, uploaded
  privately (Cloudinary type authenticated) and seen by staff through 10-minute signed previews.
- **One read per visit.** /games draws everything from `public/vault`; search and filters run in
  the browser (`shared/vault-search.js`). A game page reads its own doc and its published,
  ended streams (filtered on `gameIds` + `published`, sorted in the browser).
- **Routing.** Cloudflare Pages rewrites `/games/:slug` to the one client-rendered page
  `/games/view/` (`site/public/_redirects`, status 200); `/games/queue` is matched first and
  rewritten to itself.
- **"I want this too" is remembered per browser.** The server never shows who wants what, so
  the button remembers the games you pressed in this browser; pressing again elsewhere is
  harmless (the server counts each member once).
- **Round 3** (`game-vault-round-3.html`, approved R4 S1 N1 P12; details in the spec's §9):
  - ~~The door opens all the way.~~ Superseded by the V3 hero (part 8, below).
  - **Shelves, then All games, always.** Shelves are highlights and only show with games; the full
    grid always follows, so the page is never one row. **Most wanted is the exception**: it shows
    whenever there's a wishlist game, ranked by wants (top 5, numerals) or, before anyone wants
    anything, the 5 newest wishlist games with a nudge to be the first. Search and filters show
    just the grid.
  - **A game page knows the list you came from.** Back to the Vault returns to the same URL and
    scroll position; the pager and the Up next card step through that same list in place (the
    address follows; the browser's back works). The context lives in sessionStorage
    (`site/src/scripts/vault/context.ts`); without it, the whole Vault, last streamed first.
  - **The back pill and the pager are kit pieces** (`.bt-back`, `.bt-pager`), not Vault-only;
    the banner bar around them (`.gv-pagebar`), the slide and the Up next layout stay in
    `game-vault.css`.

- **Page redesign, part 8** (`game-vault-page.html`, approved V3 SH3 B1; details in the spec's §9):
  - **The door is replaced by V3, search + spotlight.** The hero is a wall of real covers behind the
    big search, its match strip and the counts, with a Now playing spotlight on the right (the top
    Most wanted game when nothing is playing). Searching pauses the wall, greys the non-matches and
    lights the matches purple. This supersedes the door (R4) and the ledger; the door's code, CSS and
    sessionStorage mark are deleted.
  - **Filtering lives in a sticky bar under the hero**, under the GAMEVAULT bar (`.gp-fbar`, using
    `--bt-sticky-top`). A compact search slides in once the hero's is out of view. The hero's
    command panel is gone (the strip and hint replace it). Up to 1024px, Tags, Length, Community
    picks and Sort move into a Filters dialog (`openModal`; there was no bottom sheet to reuse).
  - **SH3 section heads** are the kit's `.bt-section-head` (§5), used by every shelf and All games.
  - **B1 phone bar:** under 640px the Vault bar's words are icons (? / queue with a count badge / +),
    40px each with aria-labels, on every Vault page. This replaces the kit's 420px label rule for the
    Vault and fixes the staff bar overflowing.

- **Phone hero and game page heads, part 9** (`game-vault-phone-heroes.html`, approved M3 G1; details in
  the spec's §9):
  - **M3, the phone hero keeps the wall.** Under 640px the cover wall fills the background behind the
    title, search and counts and fades to the page colour; there is no spotlight and no poster band
    (the M2 poster was built first and replaced). What's playing is the first shelf, Now playing, above
    Most wanted. Desktop and tablet keep V3 (wall plus spotlight).
  - **G1, section heads sit above the cards on the game page.** The same `.bt-section-head` as the
    /games shelves (compact `--sm`, with a `meta` note), not a second piece and not a title inside
    the card; the cards stay clean.
- **Game page hero on phones, part 10** (`game-vault-phone-game-page.html`, approved P3; details in the
  spec's §9). Under 640px the hero is a two-column row, the cover (58%) beside the status badge, the
  tags (one per line) and the score dial, then the title, byline and stream line (with the admin Edit
  button) full width. Built on the existing hero markup: `.gv-hero-text` and `.gv-badges` become
  `display: contents` and the hero grid places the pieces; no second copy of the title. "Not rated"
  (`.gv-norate`, shown on phones only) stands in for the dial on played games with no score.

### 8j. Trophy Room

Spec: `docs/specs/rewards.md` (§14 decisions, Oct 3, 2026); mockup
`docs/design/mockups/trophy-room-how-it-works.html`. (The workstream prompt called this §8i; §8i
was already the Game Vault, so the Trophy Room is §8j.)

- **Badges are coins.** `.bt-medal`: a ring (the rarity) and a face (the art). Commissioned art
  supplies the face only (`.bt-medal-art`), with an emoji fallback until it arrives; the rarity
  ring is added in code. The tombstone shape may be used later for one special set.
- **Rarity tones: gray, blue, gold, pink, red/ember**, Common to Legendary, each with 1 to 5
  signal bars (`.bt-level--5`). Gold is notched, pink glows with an inner ring, red/ember has an
  animated conic ring. **Never purple** (clickable) **or green** (staff), so a rarity never reads
  as a link or an admin control.
- **Roles and personas are identity tags, not badges.** Club, Sub, VIP, Mod and Admin come from
  the plan or role, and one persona is chosen (Gamer, Viewer, Lurker, Streamer, Creator); they're
  shown as tags, never collected, ranked or given a rarity: nobody "earns" Admin, and paid
  shouldn't read as rarer.
- **Boards: mods race on the season board with members; admins are on no boards.** Mods also have
  the crew board (Mod MVP). Crew members don't win member giveaways.
- **Supporter badges give no XP** and never appear on leaderboards.

### 8k. Goal Tracker

Spec: `docs/specs/goal-tracker.md` (confirmed Oct 4, 2026); mockup
`docs/design/mockups/goal-tracker.html`.

- **Draft and publish.** Every admin edit writes a draft (`goalItems`, `goalMetrics`,
  `goalTracker/config`); members see nothing until Publish rebuilds `public/goalTracker`. The admin
  page's sticky publish bar says how many changes are unpublished. Automatic counts (followers,
  Fan Club members) refresh in the snapshot daily without a publish. A failed publish leaves the
  draft untouched and members on the last snapshot.
- **The teaser doc.** `public/goalTrackerTeaser` is the only public read: the North Star title,
  readiness done / total, the relaunch date if set and the next key date. It feeds the /goals gate
  card and the home tile, so visitors see the goal and the progress but never the plan.
- **Option 1 was chosen for the timeline: Level select (`.bt-road`).** Options 2 (the climb) and 3
  (phase board) were drawn in the mockup and dropped. A level select works on a phone as a vertical
  path with the same nodes, so there is one kit component, not two layouts.
- **New kit pieces: `.bt-road` and `.bt-tree`** (see §5 "Road and tree"). Everything else on both
  pages is existing bt-ui.
- **Colours.** Meters on /goals are gold (readiness) and blue (a goal tied to a metric), never
  green: green stays for staff and admin actions. Status badges are the site-wide ones: Planned
  gold, In progress green, Done lime, Dropped gray. Overdue shows on the admin page only.
- **Visibility.** Public, members or private per item, never wider than its parent (applied when
  the snapshot is built). Income items are private by default and need a confirmation to be shown.

### 8l. Night Shift

Member-facing name of the Fun Factory (renamed Oct 6, 2026; the internal name stays `factory`: data paths,
`factory*` functions, activity type ids, the `ff-` prefix, `FactoryLayout`, `scripts/factory/`, `factory.css`).
Spec: `docs/specs/fun-factory.md`.

- **Routes.** `/shift`, `/shift/leaderboard`, `/shift/how-it-works`, `/shift/builder` (`/ideas`, `/guide`).
  `site/public/_redirects` sends every old `/factory/*` address there with a 301.
- **Wordmark.** NIGHT + accent SHIFT on `.bt-wordmark--power`: the accent lights gold like the Arcade's (the
  kit's own effect). The icon is a time clock over a punch card (`FF_ICON` in `scripts/factory/art.ts`); on
  hover, focus or touch its lamp, dial and punch holes flicker on in turn, like a light coming on. Under reduced
  motion they just light. The nav icon is the same drawing (`#i-shift` in IconSprite, built from `SHIFT_SYMBOL`).
- **One icon everywhere.** The factory emoji is gone from everything members see. `SHIFT_ICON` (`scripts/factory/art.ts`)
  is the nav's `#i-shift` sprite at text size (`.bt-ic`, 1em, text colour; gold on the Night Shift pages) and
  stands in for it in the gate, the intro card, the hero and season art placeholders, the leaderboard empty states
  and the Trophy Room's Night Shift badge source. Badge and idea placeholders in data use ⏱.
- **Crew entry points (Oct 6).** `.bt-when-staff` shows a Builder link (the staff green with a small Crew tag; an icon in
  the phone seg nav) on the member pages, a crew strip on the season pass (`.ff-crew`: builder and idea library
  links, a season waiting for review, additions to approve or the mod's own addition waiting), the account
  menu's "Night Shift builder" item, and "Member view" in the builder bar. A mod's additions to a live season are
  shown as Awaiting approval (teal) with Approve and Send back for admins (fun-factory.md §13d, §13e).
- **Staff race (Oct 6).** Admins race with members: a Staff tag (`.bt-admin-tag--small`) on their board rows, the
  Boss marker (`.ff-boss`: the owner's rank and the gap, from the board doc) on the season pass and the
  leaderboard, and a **Staff Finish** trophy in the trophy case (the season trophy's rank colours plus a green
  `.tr-staff` ribbon in the admin tokens, no XP). "Beat the Boss ×n" is a profile tag and the badge card's count.
  The builder's Rewards stage has an admin-only Where staff race setting (together by default).
- **Two different areas.** **Night Shift** is for members (seasons, missions, the leaderboard, plus the builder
  for mods and admins). **Night Watch** is the planned staff admin hub (ROADMAP workstream 10). They share a
  night theme on purpose, not a page, a layout or a nav slot.

### 8m. Mod Machina
Spec: `docs/specs/mod-machina.md` (confirmed Oct 6, 2026); Academy text `docs/specs/crew-academy.md`; mockups
`docs/design/mockups/mod-machina-screens.html`, `mod-machina-guides.html` and `mod-machina-live.html`.
Approved picks (the pages themselves come in the next prompt):
- **Grade chip: option 1, Bars.** The kit's `.bt-badge` with level bars (`.bt-grade`); the admin track uses a
  new `.bt-badge--admin` (the admin green).
- **Crew board: B2**, a podium plus a table (`/crew/board`).
- **Crew HQ activity meter: M2, the time card** (new kit piece `.bt-timecard`).
- **Seats: S1, the seat map.** **Mod Deck: D1, the chat wall**, with D2 (focus on one chat) as an in-Deck toggle.
  **Dead Air: C1, the evidence board.**
- Colours: "needed" uses gold, never red (red is for destroying data); admin-only controls are green.

**Kit pieces added for Mod Machina** (all shown in every state on the UI kit page, /dev/ui-kit/, under Mod Machina and Story page pieces; markup in §5, JS in §6):
- `.bt-badge--admin`: the admin-green badge, for the admin track's grades and admin-only tags.
- `gradeChip()` / `.bt-grade`: a grade chip with level bars (mod grades blue, gold, pink, red in 4 steps; admin grades `.bt-badge--admin` in 3 steps).
- `.bt-room`: one live chat (platform and name) with covered, needed (gold) or off states.
- `.bt-pref`: a per-chat preference row with a 4-way choice (Favourite, Happy to help, Only if needed, No); still used by /crew/profile.
- `.bt-crew-card`: a roster card with avatar, name, grade chip and starred favourite chats.
- `.bt-podium`: the crew board's top three (B2), with the `.bt-board--crew` table under it.
- `.bt-timecard`: the month's duty time card (M2), including the "Starts with stream duty" state.
- `.bt-ladder`: clickable grade rungs with a detail card (How it works, the join page).
- `.bt-ring`: a progress ring with a centre label (Academy progress).
- `.bt-quiz`: a question, options and right or wrong states; the server grades, so the component never holds the answers.
- The 4-step journey (`.ai-jr--4`, in how-it-works.css): the join page's "Can I apply?" and "What happens next", with met, waiting, waived and locked steps.
- `.bt-stamp`: the celebratory stamp (the "Application In" seal) for key actions on tool pages; still under reduced motion.
- `.bt-day-picker`: a week of day tiles to toggle.
- `.bt-chat-tile`: a chat card with a mini chat preview and a 4-way choice (the join page's replacement for the .bt-pref rows).

**Site-wide decision (Oct 6, widened Oct 7): the page quality standard, in two kinds.** Every member-facing page matches
the Boom Arcade How it works page in craft (minimum standard, never less).
- **Story pages** (pages that sell, explain or welcome: landing pages, Join, Meet the crew, How it works, Academy,
  feature home pages) use the full frame: TocLayout rail, ghost-numbered chapters (`.bt-chapter--ghost`), a hero with a
  scene, stage cards with hover scenes, journey line, flow diagram where it fits, flip medals or the placard where they
  fit, at least one working example, Ask BOOMBOT, the real mascot and BOOMBOT art, and a closing call to action.
- **Tool pages** (pages used every day: queues, HQ, tasks, profiles, boards, the Mod Deck, /admin) keep the same polish
  built for speed: a hero header with a small scene, cards that react to hover and taps, a celebratory moment on key
  actions (a stamp, a punch, a lamp), empty states with the mascot, and no long chapters.
Mockups: `docs/design/mockups/crew-story-pages.html` (Join the crew and Meet the crew, Before and After; After approved Oct 7).

### 8n. Header nav
Spec `docs/specs/header-nav.md`, mockup `docs/design/mockups/header-nav.html` (option 1, approved Oct 7).

- **`.bt-navgroup`** (`shared/bt-ui.css`, §5 "Header nav groups"): a header menu = trigger, panel of page cards and one feature tile. Kit piece, shown in every state on `/dev/ui-kit/`.
- **`shared/ui/navgroup.js`** (§6): the disclosure behaviour (hover about 140 ms or click, one open at a time, outside click, scroll or Escape closes) plus the tile builders and the Watch countdown and calendar file, shared by the site and the kit.
- **Groups live in `site/src/lib/nav.js`** (`headerNav`, `moreGroups`): Watch, Play, Community and a plain Shop link, built from `site.json` modules; a disabled module is hidden, an empty group is hidden, a one-page group becomes a plain link. /crew is always on. Bug Zapper, Feature Lab and Horror Monthly are defined there and appear in Community once their modules are enabled (Horror Monthly's href is still `#`).
- **Tiles read existing data only** (`site/src/scripts/nav-features.ts`, first open only): Watch = `site.json` nextStream and `data-live`; Play = public `games` plus the member's own `bests` doc; Community = public `crew/main/awards`. No functions, rules or collections were added.
- The phone tab bar is unchanged; its More sheet uses the same groups under headings, with a small tile on top.

### 8o. Scream Planner
Spec `docs/specs/scream-planner.md` (§13), mockups `docs/design/mockups/scream-planner-mockups.html` (round 4, approved Oct 7). Decisions recorded for the page and kit work:

- **Two heroes on /schedule:** the marquee (what is next, with a flip-clock countdown), then "This week at a glance" (doors), then the full week.
- **Chosen at publish** (the publish dialog warns about unfinished slots but doesn't block): a marquee frame and a door style, stored as `planWeeks/{week}.hero { frame, doors }` and copied to the public week. Changeable later with Publish changes; default is the previous week's choice.
- **Marquee frames.** Pool (Surprise me rolls only from these, never one used in the last three weeks): bulbs, neon, barbed, drip, tape, film, web, electric, vhs, candles, ecg. Seasonal (hand-picked only, never rolled; listed first in October and December): jack, pumpkin (Halloween); blizzard, snowman (Christmas). The snowman frame hides the mascot peek.
- **Door styles:** D1 jaws, D2 elevator, D3 coffins (the lid tips forward off its foot, falls and fades), D4 morgue drawers, D5 hinged; Surprise me rolls one. Viewers can flip styles with ‹ › for fun; nothing is saved. Shared door states: tonight (open a crack, light leaking), ended (greyed, "Ended" stamp), cancelled (chained, padlock rattles on hover), backstage (velvet), day off (sealed). Each door floats slightly, out of step.
- **Door layout L4 (slider):** a row of seven on desktop and tablet; on phones (container at most 640px) a left-right slider with tonight centred and open, neighbours scaled and dimmed; swipe, ‹ › and dots move it, no wrap at Mon or Sun.
- **Viewer view switches** (kept per viewer in localStorage inside try/catch): the week defaults to W1 tickets with a Tickets / Timeline (W2) switch, key `bt.schedule.weekView`; the ballot defaults to V1 covers with a Covers / Race (V2) switch, key `bt.schedule.voteView`. On phones the timeline is a compact grid.
- **Reduced motion:** frames, doors, flip clock, bursts and slider transitions all go still.
- **Kit pieces to add** (`bt-ui.css`, `shared/ui/*.js`, the /dev/ui-kit page): `.bt-ticket`, `.bt-marquee[data-frame]` + `.bt-flipclock`, `.bt-velvet`, `.bt-vote-card` + `.bt-drops`, `.bt-fuse`, `.bt-slot` + `.bt-tray`, `.bt-tri`, `.bt-poster`, `.bt-doors` / `.bt-door` (five door styles; not `.bt-portal`, which is the modal portal), `.bt-slider` (L4), `.bt-view-switch`, `.bt-burst`, and the Scream Planner icon. Feature-unique colours (velvet, bulb, fuse, wire, wax, snow, ice, pumpkin) are declared once as custom properties.
- **Staff pages** (`/schedule/plan` plan view and crew view, `/schedule/plan/usual`; `site/src/scripts/planner/plan*.ts`, `crew-view.ts`, `usual.ts`, styles in `planner-plan.css`): tool pages with a small scene (the screaming calendar and the mascot), the deadline fuse, cards that react, a stamp and splat burst on Publish, a seat burst for crew. Staff controls are `.bt-btn--admin` green; Publish week is the one primary `.bt-btn--shine`. Delay is its own dialog; Cancel is `confirmAction` (non-danger) with reason chips and a preview. Phones show one day at a time with the tray as a bottom sheet. Preview data: `?as=admin` and (on these pages) `?as=member` for the crew view, from `preview-planner-plan.json`.
- **Colours and tone:** purple clickable, gold "needed" and headings, green staff controls, no red (nothing in the Planner destroys data; cancel uses `confirmAction` in the non-destructive tone).

### 8p. Control Room
Spec `docs/specs/control-room.md` (confirmed Oct 8, 2026); mockups `docs/design/mockups/control-room-review.html` and `control-room-batch-1.html` to `control-room-batch-4.html`. **Everything in the Control Room build is built (parts 0-9, Oct 2026): the kit pieces (`.bt-cr-panel`, `.bt-cr-viewport`, `.bt-readout`, `.bt-beats`, `.bt-checkin`, `.bt-live-banner`, `.bt-launch`, `.bt-checklist`, `.bt-deckplan`, `.bt-streamview`, the radar wordmark, the check-in dialog sheet), both looks (Hull map Mk II and CRT), /live/control, the public /live page, the check-in banner and dialog, the stream view /live/obs and the backstage and after-show views. Only the Chat Games pieces below are still planned (workstream 5b). Kit pieces and looks: §5 "Control Room pieces", UI Kit page section "Control Room". /live/control and the public /live page (part 6): `/live` is `site/src/pages/live.astro` + `scripts/live/pub*.ts` + `styles/live-public.css` (prefix `lp-`), one controller choosing the waiting room (story page, also `/live?how=1`), the Bridge (live, Break, backstage) or the wrap-up; the live state across the site is `site/src/lib/live.ts` (one `public/live` listener per tab, sets `data-live` on `<body>`, released after a minute hidden). Staging preview: `?live=off|public|backstage` or `?state=off|soon|live|break|backstage|ended`, `?as=visitor|member`, `?look=crt`.**

**Mockup picks (spec §19):**
- **/live layout 1 "Bridge".** One column on phones in this order: video, beats, check-in, Play panel, Now playing, crew, readouts, Watch on.
- **Looks:** Hull map Mk II and CRT, with a house-look switch on /live/control (`live/main.look`).
- **Controls A "Cockpit"** (/live/control).
- **Break scene B1 "Takeover"** (B2 "Side rail" as a manual scene).
- **Hot Seat picker W2 "Séance board"** (W1 "Wheel" per round).
- **Wordmark:** CONTROL + accent ROOM on `.bt-wordmark--power` with the radar-scope icon (sweeps while live, blip in the live colour, faster on hover; still under reduced motion).
- Other confirmed choices (URLs, who may use controls, beat windows, XP, YouTube backstage, a wide and a tall stream view) are in spec §19.

**The looks rule (spec §7c), word for word:** "A look is `data-look="hull" | "crt"` on the page root plus one CSS block in the feature stylesheet. It may restyle surfaces, frames, motion and decoration; never colour meaning, the heading ladder or what's clickable."

**In more detail.** A look is `data-look="hull" | "crt"` on the page root plus **one CSS block** in the feature stylesheet. It may restyle surfaces, frames, motion and decoration; it **never changes colour meaning, the heading ladder or what's clickable**. The pages share one set of markup and data; new looks (seasonal, Halloween) can be added later without touching the pages; members may later pick their own look (stored per viewer). The check-in banner and dialog are site-wide kit pieces and look the same in every look. Colour meaning holds: purple clickable, gold headings and "needed", red only for the live tag, beacon and the open check-in (the existing live exception), green backstage and staff.

**Kit pieces (spec §15): built.** `.bt-readout`, `.bt-beats`, `.bt-checkin` (and `.bt-live-banner`), `.bt-launch`, `.bt-checklist` (`.bt-task-row` did not fit: it is an XP activity row), `.bt-deckplan`, `.bt-streamview`, plus the hooks the looks need (`.bt-cr-panel`, `.bt-cr-viewport`), the radar wordmark and the look blocks (`[data-look="hull"]`, `[data-look="crt"]` in `site/src/styles/control-room-looks.css`). Names deviate from the mockups' working names (`lv-`, `cr-`, `sv-`) as listed in §5. **Still planned, built with the Chat Games part:** `.bt-qcard` (question card), `.bt-seance` and `.bt-wheel` (Hot Seat pickers). Reused: `.bt-topbar`, `.bt-wordmark--power`, `.bt-beacon`, `.bt-mascot--aware`, `.bt-live-tag`, `.bt-hero-player`, `.bt-mini-cd`, `.bt-plats`, `.bt-velvet`, `.bt-theme`, `.bt-smap`/`.bt-sbox`, `.bt-grade`, `.bt-cover`, `.bt-score`, `.bt-meter`, `.bt-medal`, `.bt-boombot`, `.bt-chat`, `.bt-toc`, `.bt-chapter--ghost`, `.bt-toast`, `.bt-pills`, `.bt-switch`, `.bt-page-tabs`, `.bt-board`, the members-only gate, `openModal()`, `confirmAction()` and the `bt:overlay-open` event. Container queries only; reduced motion keeps colour and glow and drops movement on the site (not in the stream view).

### 8q. Feature Lab
The member idea board (spec `docs/specs/feature-lab.md`; mockups `docs/design/mockups/feature-lab-mockups.html` and `feature-lab-icon.html`). **Picks (Oct 8, 2026):** board option 3 (the List view with the Roadmap one switch away, remembered in `localStorage` `bt.lab.view`), How it works hero 1 (the bench scene beside the headline), and wordmark icon option 3, Bright idea (a bulb-flask: the bubbles rise and the filament lights on hover, focus or the touch power-on; its markup and CSS are spec Appendix A, in `site/src/scripts/lab/art.ts` and `site/src/styles/feature-lab.css`; the Community panel keeps the plain `#i-bulb` nav icon). **Kit:** `.bt-comment--hidden` with `.bt-comment-hidden-note` is the staff view of a hidden comment (members never receive hidden comments); it is the one kit addition and is on the UI Kit page. **Reused:** `.bt-topbar`, `.bt-wordmark--power`, `.bt-chip`, `.bt-row` with `.bt-tally`, `.bt-view-switch`, `.bt-badge` with level bars, `.bt-medal` (The Architect, Epic), `.bt-stamp` (IDEA IN, SHIPPED), `.bt-history`, `.bt-admin-panel`, `.bt-composer`, `.bt-empty`, `.bt-chapter--ghost`, `.bt-flip`, `.bt-placard`, `.bt-chat`, `openModal()` and `confirmAction()`. **Lab-only (`fl-`):** the bench scene (flask, five jars filled by count, the mascot), the Roadmap columns, the vote pop and the How it works scenes. **Rule:** new-site admins read the `adminLog` collection through `hasSiteRole('boomertanger', 'admin')` (the one legacy rule change: a second condition on the existing read line), which is how the idea dialog lists Admin activity; the legacy `isAdmin()` allowlist read is untouched.

### 8r. Bug Zapper
The member bug board (spec `docs/specs/bug-zapper.md`; mockup `docs/design/mockups/bug-zapper-mockups.html`). **Picks (Oct 8, 2026):** Board B (the List view with the Board of status columns one tap away through `.bt-view-switch`, remembered in `localStorage` `bt.bugs.view`), Hero H1 **Porch light**, and wordmark Icon I1 **Porch zapper** (a hanging porch lamp: the tube lights on hover, focus or the touch power-on and a moth flies in and is zapped; its markup and CSS are spec Appendix A, in `site/src/scripts/bugs/art.ts` and `site/src/styles/bug-zapper.css`; the Community panel keeps the plain `wrench` nav icon). **The porch-light scene:** the large hanging lamp, four moths drifting to it (one doomed), the real mascot, "N zapped so far" (the all-time public Fixed count, hidden if it can't be read) and four counter buttons (Open, Confirmed, In progress, Fixed) that filter the board and make the lamp zap once; on How it works the same scene is shown large with no counters. **Feature CSS scope (`bz-`, tokens only):** the wordmark icon, the porch-light scene and its counters, the board columns and cards, the bite box, the severity picker, the device line, the success art, the moments, the How it works stage scenes and Try it. The bolt's yellow is `--bt-lamp`; the zapper tube is `--bt-ice`, wires `--bt-wire`, wings `--bt-wax`. The unpicked mockup variants (icons I2 and I3, heroes H2 and H3) are not built. **Kit:** nothing new. Reused: `.bt-topbar`, `.bt-wordmark--power`, `.bt-chip`, `.bt-sortbar`, `.bt-row` with `.bt-tally` (the "bit me" tally, locked on private, own, fixed, won't fix and duplicate), `.bt-view-switch`, `.bt-badge` with level bars, `.bt-medal` (Bug Finder, Uncommon), `.bt-stamp` (ZAPPED IN, FIXED), `.bt-history`, `.bt-admin-panel`, `.bt-pick-list`, `.bt-search`, `.bt-dropzone`, `.bt-thumb` with the lightbox, `.bt-check`, `.bt-notice`, `.bt-tag`, `.bt-comment--hidden`, `.bt-meter`, `openModal()` and `confirmAction()`. Shared with Feature Lab: the generic board pieces live in `functions/lib/boards/` and `site/src/scripts/boards/` (gate, hide dialog, replies and gate boxes, live author chip, remembered choices), and the Cloudinary helpers in `functions/lib/cloudinary.js`. **Privacy:** a "This is a security or privacy problem" checkbox makes a report private (only the reporter and staff see it, no "bit me too", no feed event); the thread, the screenshot (a private Cloudinary file, viewed through 10-minute signed links) and the device line are for the reporter and staff only.

### 8s. Cloud Stash
The admin storage tool (spec `docs/specs/cloud-stash.md`; mockup `docs/design/mockups/cloud-stash.html`). **Picks (Oct 9, 2026):** icon **I1 Storm stash** (the old three disk bars now inside a cloud; on hover, focus or touch scroll-in it rains and the bars light gold one by one; `.bt-wordmark--power`), hero **S2 One big gauge** (a cloud raining into one gauge with the gold pause mark and the mascot; it drizzles when healthy, rains harder and the level goes gold when paused, red when over), page **P2 Overview and tabs** (`.bt-seg-nav` tabs Overview, Files, Rules, Activity in `?tab=`), file list **F2 Rows** (`.bt-row` with `.bt-file-thumb`, the lock tile for private files), How it works hero **W1 Into the cloud** (a screenshot, a cover and season art float up into a smiling cloud with the mascot). **Kit additions:** `.bt-notice--warn` (+ `--row`), `.bt-file-thumb` (`--locked`, `--lg`), `.bt-meter--stack` (`.bt-meter-seg`, `.bt-meter-keys`); the rest is existing kit (`.bt-card`, `.bt-meter`, `.bt-badge`, `.bt-switch`, `.bt-items`, `.bt-chip`, `.bt-stamp` SWEPT, `.bt-placard`, `openModal()`, `confirmAction()`). **Tiers:** the owner; an Overseer (A2 or A3); a Steward (A1, or an admin with no admin-ladder grade). A Steward sees everything and can scan, refresh, dry-run, preview and switch a rule off; purging, rules, the sweep and the limits need the owner or an Overseer (the server answers "Needs the owner or an Overseer."); log retention and untracked files are the owner's. **Rules:** a rule can only be an allowlisted target (v1: Bug Zapper screenshots, closed statuses, 14 to 730 days), Save stays locked until a dry run, a rule is created off, and switching one on or saving an enabled rule needs the dry run's count to still match. **Safety:** deletes only go through `performAssetDeletion` (storage first, then the record); a sweep stops at its cap (default 100) and alerts; private files are previewed through 10-minute signed links and every preview is logged. **Upload gate:** usage at the pause point (default 80% of Cloudinary's monthly credits) pauses member uploads, at 100% only the owner's work; every upload-signature callable asks `uploadGate` first and fails open when the usage numbers are missing or over 48 hours old. Cloud Stash is not in the header nav and writes nothing to the activity log (its own `adminLog` entries, feature `cloudStash`). **Open:** account-deletion file cleanup and retiring the legacy page (ROADMAP, Cloud Stash in production).
