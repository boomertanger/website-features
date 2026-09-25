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
| Admin (restricted, not destructive) | `admin-text` `admin-accent` `admin-tint` `admin-panel-bg` `admin-panel-border` `admin-tag` |
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
| 1 Page title | `.bt-title` | 32px bold gold UPPERCASE (26px narrow). One per page. |
| 2 Dialog title | `.bt-modal-title` | 20px bold gold UPPERCASE |
| 3 Card / section | `.bt-heading` or `.bt-card-title` | 18px bold off-white, normal case, gold tick before it |
| 4 Label | `.bt-section-label` | 12px UPPERCASE faint |
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
`--danger-outline` (row-level destructive, e.g. table "Purge"); size `--sm`; `--block`.
`.bt-icon-btn` (36px, e.g. close) and `.bt-icon-btn--sm` (28px). Busy state: prepend
`<span class="bt-spinner"></span>` and disable.

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

**States:** loading → 3× `.bt-skeleton-row` (see UI Kit markup) while the first snapshot
is in flight. Empty/error → `.bt-empty` with `<p class="bt-empty-title">` + one line of
direction + optional action button. Inside cards use `.bt-empty--compact`. Logged out →
`.bt-logged-out` with wordmark, `.bt-logged-out-title`, `.bt-logged-out-text`, button.
Admin-only gate → same, with `.bt-admin-tag` and `.bt-signin-btn`.

**Forms:** `.bt-field` > `.bt-label` + `.bt-input|.bt-textarea|.bt-select` +
`.bt-hint` / `.bt-error`. Inputs are 16px (prevents iOS zoom) with a purple focus ring.
Invalid: `aria-invalid="true"`. Grouping: `.bt-form`, `.bt-form-grid`, `.bt-form-actions`.

**Dialog content** (inside `openModal`)
`modalHeader(title)` → gold uppercase title + close button. Then `.bt-modal-section` >
`.bt-section-label` + `.bt-section-text`; `.bt-admin-panel` (starts with
`<span class="bt-admin-tag">${SHIELD_ICON}Admin only</span>`); `.bt-comments` >
`.bt-comment` > `.bt-comment-head` (`.bt-comment-author`, optional
`.bt-admin-tag.bt-admin-tag--small`, `.bt-comment-time`) + `.bt-comment-text`;
`.bt-history` > `.bt-history-item` > `.bt-history-line` (`.bt-history-dot
.bt-history-dot--{tone}` + `.bt-history-rule`) + `.bt-history-body`;
`.bt-modal-actions` last.

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
| `modal.js` | `openModal({ content, title, wide, feature, onClose })` → `{ modal, close, setDismissible }`; `modalHeader(titleHtml)`; `CLOSE_ICON`. Escape/backdrop/`[data-bt-close]` close; focus trap + restore; body scroll lock; positions below the measured Squarespace `#header`. |
| `confirm.js` | `confirmAction({ title, message, confirmLabel, busyLabel, danger, feature, onConfirm })` → `Promise<boolean>`. Locks everything while `onConfirm` runs; shows the error and re-enables if it throws. |
| `admin-menu.js` | `initAdminMenu(root)` → `{ close, sync }`; `LOGIN_ICON`, `SIGNOUT_ICON`, `SHIELD_ICON` |
| `admin-auth.js` | Extracted from the identical admin code in Bug Zapper and Feature Lab (see §7). |

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
