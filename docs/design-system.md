# Boomertanger design system (`bt-ui`)

The UI Kit page (`shared/ui-kit/`) renders every component below in every state —
it's the visual source of truth. This document is the written one.

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
| Status tones | `amber` `blue` `teal` `green` `gray` `red`, each with `-bg` |
| Spacing | `space-0h`(2) `1`(4) `1h`(6) `2`(8) `3`(12) `4`(16) `5`(20) `6`(24) `8`(32) `12`(48) `16`(64) · `gutter` (32, 20 when narrow) |
| Type | `text-2xs`(10) `xs`(11) `sm`(12) `md`(13) `base`(14) `lg`(16) `xl`(18) `2xl`(20) `3xl`(32) · `leading-body` 1.6 |
| Radii | `radius-sm`(8) `md`(10) `lg`(12) `xl`(16) `full` |
| Effects | `shadow-dropdown` `shadow-admin-inset` `backdrop` · `z-dropdown`(20) `z-modal`(999999) · `modal-gap` (32/24/16) |

Color meaning: purple = clickable. Gold = page and dialog titles (and the level-3 tick).
Red = destroys data. Green = admin-only. Status tones only need to be distinct from each
other and from purple.

## 4. Heading ladder
| Level | Class | Look |
|---|---|---|
| 1 Page title | `.bt-title` | 32px bold UPPERCASE (26px narrow), gold-to-ember gradient through the letters (solid gold fallback). One per page. The element sizes to its text (`fit-content`) so the gradient spans the words. |
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

**Chips:** `.bt-chip` (+ `.is-active`, `aria-pressed`), `.bt-chip--small`. Inside
`.bt-sortbar`, active chips are purple-tinted.

**Badges:** `.bt-badge .bt-badge--{amber|blue|teal|green|gray|red}`, optional leading
`<span class="bt-badge-dot"></span>`. Sentence case. Features map each status to a TONE
NAME (not a color value): `{ label: "In progress", tone: "teal" }`.
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

**Dashboard (Disk Stash, Alert Center)**
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

## 6. JS modules (`shared/ui/`)
| Module | Exports |
|---|---|
| `dom.js` | `escapeHtml(str)`, `formatDate(value)` (Timestamp/Date/ms/ISO → "Sep 12, 2026"), `initials(name)` |
| `modal.js` | `openModal({ content, title, wide, feature, onClose })` → `{ modal, close, setDismissible }`; `modalHeader(titleHtml, subtitleHtml = "")`; `CLOSE_ICON`. Escape/backdrop/`[data-bt-close]` close; focus trap + restore; body scroll lock; positions below the measured Squarespace `#header`. |
| `confirm.js` | `confirmAction({ title, message, confirmLabel, busyLabel, danger, feature, onConfirm })` → `Promise<boolean>`. Locks everything while `onConfirm` runs; shows the error and re-enables if it throws. |
| `admin-menu.js` | `initAdminMenu(root)` → `{ close, sync }`; `LOGIN_ICON`, `SIGNOUT_ICON`, `SHIELD_ICON` |
| `admin-auth.js` | Extracted from the identical admin code in Bug Zapper and Feature Lab (see §7). |
| `effects.js` | `initRowSpotlight(root)` — one delegated pointermove listener; sets `--bt-mx`/`--bt-my` on the hovered `.bt-row--clickable`. |
| `composer.js` | `composerHtml(opts)`, `initComposer(el, { onSubmit, busyLabel })` → `{ focus, reset }` |
| `lightbox.js` | `thumbHtml({ src, full, alt })`, `initLightboxTriggers(scope)`, `openLightbox({ src, alt })`, `cloudinaryUrl(url, transform)` |

## 7. Migration guide (Bug Zapper, Feature Lab, Disk Stash)

Visual/markup refactor only: no changes to Firestore data shapes, rules, Cloud
Functions, enum values, identity sources (Bug Zapper's `meTooBy` uses Firebase uid,
Feature Lab's `votes` uses MemberSpace id — keep both), or comment visibility.

**Class mapping** (`bz-`/`fl-` shown; Disk Stash equivalents below)
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

**Disk Stash:** `.ds-header` → `.bt-topbar` (wordmark DISK + STASH, admin controls) +
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

### 8a. Admin-only page pattern (Disk Stash)

Disk Stash does **not** use `shared/ui/admin-auth.js`, on purpose. That module's
`onAuthStateChanged` handler always falls back to `signInAnonymously()` when
there's no user — correct for Bug Zapper and Feature Lab, which are public,
member-facing views that need to let a logged-in member write (vote, comment)
before anyone has signed in as an admin. Disk Stash has no public view at all:
every visitor who isn't an admin sees either the plan-gate message or the
sign-in gate, never a working page, and it never created an anonymous Firebase
session before this migration. Force-fitting `admin-auth.js` here would have
started silently creating one on every visit — a real behavior change, not a
markup one.

Disk Stash instead keeps its own `syncAdmin()`, `handleSignIn()`,
`handleSignOut()`, and `watchAuthState()` in `disk-stash.js`. Its
`watchAuthState()` shows the sign-in gate directly on `user === null`, with no
anonymous fallback branch. It does still use the shared `initAdminMenu()` for
the dropdown and `confirmAction()` for its destructive confirmations — only the
Firebase auth wiring itself is feature-local.

**Rule for future features:** an admin-only feature with no member-facing view
follows Disk Stash's pattern (its own `watchAuthState()`, no anonymous
fallback) until `admin-auth.js` gains an option to skip the anonymous sign-in —
see 8c.

### 8b. Status tone maps (intentional)

**Bug Zapper — status**
| Value | Tone |
|---|---|
| `Open` | blue |
| `In progress` | amber |
| `Fixed` | green |
| `Won't fix` | gray |
| `Can't reproduce` | gray |
| `Duplicate` | gray |

**Bug Zapper — severity**
| Value | Tone |
|---|---|
| `Cosmetic` | gray |
| `Minor` | blue |
| `Major` | amber |
| `Critical` | red |

**Feature Lab — status**
| Value | Tone |
|---|---|
| `submitted` | gray |
| `under_review` | amber |
| `planned` | blue |
| `in_progress` | teal |
| `shipped` | green |
| `declined` | gray |

**Feature Lab — priority**
| Value | Tone |
|---|---|
| `low` | gray |
| `medium` | amber |
| `high` | red |

**Disk Stash — usage state**
| Value | Tone |
|---|---|
| Healthy | green |
| Uploads paused | amber |
| Over limit | red |

These preserve each feature's original pre-migration colors on purpose. The UI
Kit page's demo data is illustrative only and does NOT match (for example, the
demo shows `under_review` as blue and `planned` as amber; Feature Lab's real
map is the reverse). Don't "correct" these to match the kit.

### 8c. Known follow-ups

- **`admin-auth.js` has no skip-anonymous option.** Referenced in 8a — Disk
  Stash needs an admin-only auth flow with no anonymous fallback, and
  currently duplicates that flow locally instead. A future version of
  `shared/ui/admin-auth.js` could take an option (e.g. `anonymousFallback:
  false`) so an admin-only feature could use the shared module too.
- **`--bt-green` and `--bt-admin-accent` are the same hex** (`#5fa876`,
  `shared/bt-ui.css`) — but this doc's own color rule says green means
  "admin-only," while `--bt-green` is also a generic status tone (`Fixed` /
  `shipped` / `Healthy` all render in it). The design rules say status tones
  only need to be distinct from each other and from purple, but this one
  collides with the admin-only meaning specifically, which the rule doesn't
  call out as safe.
- **`--bt-gray` and `--bt-text-muted` are the same hex** (`#a89a9c`,
  `shared/bt-ui.css`) — a redundant token pair carried over from the
  pre-migration code, where each feature had its own duplicate `--*-gray`
  var. The migration consolidated two duplicates into one; the duplication
  itself is still there.
- **Feature Lab's delete only removes the parent doc.** `confirmAction()`'s
  `onConfirm` in `features/feature-lab/feature-lab.js` (the detail modal's
  delete handler) calls `deleteDoc()` on the `featureRequests` doc only —
  its `comments` subcollection isn't cascade-deleted (Firestore doesn't do
  that automatically) and is left orphaned. This is a known, documented
  limitation (the confirm dialog's own message says so, and so does
  `features/feature-lab/README.md`), not a bug, but it's still true and
  worth knowing before anyone builds cleanup tooling for orphaned
  subcollections.
- **`updateAdminUi()` is still duplicated.** Bug Zapper
  (`features/bug-zapper/bug-zapper.js`) and Feature Lab
  (`features/feature-lab/feature-lab.js`) each define their own
  near-identical closure that toggles the sign-in/badge/sign-out
  visibility and calls `menu.sync()`. `admin-auth.js`'s `onChange`
  callback only reports `{ user, isAdmin }`; it doesn't own this DOM
  toggling. A small shared helper (in `admin-auth.js` or `admin-menu.js`)
  could take this over.
- **Bug Zapper never dims a closed report.** Its row rendering
  (`features/bug-zapper/bug-zapper.js`) never applies `.bt-row--dimmed`,
  so `Won't fix` / `Can't reproduce` / `Duplicate` all render at full
  opacity, same as `Open`. Feature Lab's rows do dim when `status ===
  "declined"` (`features/feature-lab/feature-lab.js`). Pre-existing
  asymmetry, preserved as-is since this was a visual/markup migration, not
  a behavior-unification pass.
