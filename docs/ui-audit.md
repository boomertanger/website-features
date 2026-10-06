# UI Audit — Bug Zapper vs. Feature Lab vs. shared/

Read-only audit. No files outside this report were created or modified.

**Branch:** `dev` (pulled, up to date with `origin/dev`)
**Tags (newest first):** `v1.2.0`, `v1.1.0`, `v1.0.0`
**HEAD commit:** `897131f215a5dc022f5b1c9b2d966b048545d9cc`

---

## 1. Inventory

### `features/bug-zapper/`

| File | Lines | Bytes |
|---|---:|---:|
| `README.md` | 140 | 8,286 |
| `bug-zapper.css` | 960 | 22,738 |
| `bug-zapper.js` | 1,058 | 44,385 |

### `features/feature-lab/`

| File | Lines | Bytes |
|---|---:|---:|
| `feature-lab.css` | 848 | 18,579 |
| `feature-lab.js` | 754 | 30,205 |

**No `README.md` exists for Feature Lab** — see §7.

### `shared/`

| File | Lines | Bytes |
|---|---:|---:|
| `firebase-init.js` | 33 | 1,331 |
| `memberspace-helper.js` | 47 | 1,575 |

### Root-level docs read per scope

- `README.md` (repo root) — exists, 140 lines. **Its content is byte-for-byte identical to `features/bug-zapper/README.md`** (same "# Bug Zapper" doc). See §7.
- `CLAUDE.md` — does not exist anywhere in the repo.

### `<link>` / `<script>` URLs the embed snippets/README expect

**Bug Zapper** (documented in `features/bug-zapper/README.md`, "Squarespace embed" section):

```
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/boomertanger/website-features@dev/features/bug-zapper/bug-zapper.css">
<script type="module" src="https://cdn.jsdelivr.net/gh/boomertanger/website-features@dev/features/bug-zapper/bug-zapper.js"></script>
```

**Feature Lab** — **no README exists, so no embed snippet is documented anywhere in the repo.** By analogy with Bug Zapper and the fact that `#feature-lab-root` also declares `font-family: "Inter", sans-serif`, Feature Lab presumably needs the same Google Fonts `<link>` plus its own CSS/JS CDN links, but nothing in the repo says so. This is a real gap, not an inference I can verify. See §4 and §7.

**Module-internal script URLs** (ES module imports, both `bug-zapper.js` and `feature-lab.js`, same Firebase SDK version `12.19.0` in both):
- `https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js` (via `shared/firebase-init.js`)
- `https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js`
- `https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js`
- `https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js`

### Files the Bug Zapper README references that do **not** exist in `features/bug-zapper/`

The README's "One-time setup" section (steps 2–8) instructs merging in `functions-addition.js`, `firestore-rules-addition.txt`, `functions-addition-delete.js`, `firestore-rules-delete-update.txt`, and `firestore-rules-comments-history.txt`, plus a "Files in this feature" list that names `functions-addition.js` and `firestore-rules-addition.txt`. **None of these five files exist anywhere in the repo** — the directory contains only `README.md`, `bug-zapper.css`, `bug-zapper.js`. Either they were already hand-merged into `functions/index.js`/`firestore.rules` and never committed as standalone files, or the README is stale. Flagged again in §7.

---

## 2. Token inventory

### 2a. Custom properties (CSS variables)

**Bug Zapper** — all declared once, on `#bug-zapper-root`:

| Var | Value |
|---|---|
| `--bz-bg` | `#0f0f0f` |
| `--bz-surface` | `#1a1619` |
| `--bz-surface-2` | `#1e1a1d` |
| `--bz-border` | `#2a2326` |
| `--bz-border-2` | `#332b2e` |
| `--bz-text` | `#f4f2ea` |
| `--bz-text-muted` | `#a89a9c` |
| `--bz-text-faint` | `#786e70` |
| `--bz-primary` | `#9146ff` |
| `--bz-primary-hover` | `#a565ff` |
| `--bz-primary-bg` | `rgba(145, 70, 255, 0.14)` |
| `--bz-title` | `#ffa100` |
| `--bz-accent` | `#ae201b` |
| `--bz-accent-bg` | `rgba(174, 32, 27, 0.14)` |
| `--bz-amber` | `#d9a441` |
| `--bz-amber-bg` | `rgba(217, 164, 65, 0.14)` |
| `--bz-blue` | `#6a93c9` |
| `--bz-blue-bg` | `rgba(106, 147, 201, 0.14)` |
| `--bz-green` | `#5fa876` |
| `--bz-green-bg` | `rgba(95, 168, 118, 0.12)` |
| `--bz-gray` | `#a89a9c` |
| `--bz-gray-bg` | `#241f22` |

**Feature Lab** — all declared once, on `#feature-lab-root`:

| Var | Value |
|---|---|
| `--fl-bg` | `#0f0f0f` |
| `--fl-surface` | `#1a1619` |
| `--fl-surface-2` | `#1e1a1d` |
| `--fl-border` | `#2a2326` |
| `--fl-border-2` | `#332b2e` |
| `--fl-text` | `#f4f2ea` |
| `--fl-text-muted` | `#a89a9c` |
| `--fl-text-faint` | `#786e70` |
| `--fl-primary` | `#9146ff` |
| `--fl-primary-bg` | `rgba(145, 70, 255, 0.14)` |
| `--fl-title-accent` | `#ffa100` |
| `--fl-critical` | `#ae201b` |
| `--fl-critical-bg` | `rgba(174, 32, 27, 0.14)` |
| `--fl-amber` | `#d9a441` |
| `--fl-amber-bg` | `rgba(217, 164, 65, 0.14)` |
| `--fl-blue` | `#6a93c9` |
| `--fl-blue-bg` | `rgba(106, 147, 201, 0.14)` |
| `--fl-teal` | `#2ec4b6` |
| `--fl-teal-bg` | `rgba(46, 196, 182, 0.14)` |
| `--fl-green` | `#5fa876` |
| `--fl-green-bg` | `rgba(95, 168, 118, 0.12)` |
| `--fl-gray` | `#a89a9c` |
| `--fl-gray-bg` | `#241f22` |

**Every color role that exists in both features has the identical value** (bg, surface, surface-2, border, border-2, text, text-muted, text-faint, primary, primary-bg, title/title-accent, accent/critical, accent-bg/critical-bg, amber, amber-bg, blue, blue-bg, green, green-bg, gray, gray-bg) — only the variable *names* differ (`--bz-title` vs `--fl-title-accent`, `--bz-accent` vs `--fl-critical`, `--bz-accent-bg` vs `--fl-critical-bg`). This is the strongest signal that a shared token file is trivial to extract.

**Roles that exist in only one feature:**
- `--bz-primary-hover` (`#a565ff`) — Bug Zapper only. Feature Lab's `.fl-btn-primary` has no hover state at all (see §3).
- `--fl-teal` / `--fl-teal-bg` (`#2ec4b6` / `rgba(46, 196, 182, 0.14)`) — Feature Lab only, used for the `in_progress` status. Bug Zapper has no `in_progress`-equivalent status and no teal token.

### 2b. Colors used as raw literals (not via `var()`)

| Value | Where | Bug Zapper | Feature Lab |
|---|---|---|---|
| `#5fa876` | `.{bz,fl}-signin-btn` border, `.{bz,fl}-admin-pill-dot` background | 2 uses | 2 uses (identical) |
| `#8fd9aa` | `.{bz,fl}-signin-btn` color, `.{bz,fl}-admin-pill` color | 2 uses (CSS) + 1 more in `bug-zapper.js`'s `.bz-comment-badge` inline color | 2 uses (CSS) |
| `rgba(95, 168, 118, 0.1)` | `.{bz,fl}-signin-btn:hover` background | 1 use | 1 use (identical) |
| `rgba(95, 168, 118, 0.16)` | `.{bz,fl}-admin-pill` background | 1 use | 1 use (identical) |
| `#0d2418` | `.{bz,fl}-admin-panel` background | 1 use | 1 use (identical) |
| `#3ba86b` | `.{bz,fl}-admin-panel` border-color; also the shield-icon `fill` in both files' "Admin only" SVG | 2 uses | 2 uses (identical) |
| `rgba(59, 168, 107, 0.25)` | `.{bz,fl}-admin-panel` inset box-shadow | 1 use | 1 use (identical) |
| `#5fe89a` | `.bz-admin-tag` / `.fl-admin-only-badge` text color | 1 use | 1 use (identical) |
| `rgba(0, 0, 0, 0.55)` / `rgba(0, 0, 0, 0.4)` | mobile admin dropdown box-shadow | 1 use | 1 use (identical) |
| `#c9a8ff` | `.bz-bit-btn.bz-bit-active` text color | 2 uses | — (no equivalent; `.fl-vote-btn.fl-voted` uses `var(--fl-primary)` instead of a lightened literal) |
| `rgba(10, 9, 10, 0.72)` | `.bz-modal-backdrop` background | 1 use | — |
| `rgba(0, 0, 0, 0.6)` | `.fl-modal-backdrop` background | — | 1 use |
| `#FFD400`, `#2A2326` (`fill-opacity:0.7`), `#786e70` | bolt-icon SVG debris/flash fills (duplicated verbatim in `renderShell()` and `renderLoggedOut()`) | 2× per color (one per SVG copy) | — |
| `#9146FF`, `#FFA100` | flask-icon SVG fills/strokes | — | multiple, once (no logged-out duplicate — Feature Lab's `renderLoggedOut()` has no icon at all) |

**Side-by-side: different literal values for the same role**

| Role | Bug Zapper | Feature Lab |
|---|---|---|
| Modal backdrop scrim | `rgba(10, 9, 10, 0.72)` | `rgba(0, 0, 0, 0.6)` |
| "Active vote/reaction" text color | `#c9a8ff` (hardcoded lightened purple) | `var(--fl-primary)` (`#9146ff`, unlightened) |
| Top bar bottom padding | `20px` (`.bz-topbar`) | `18px` (`.fl-wordmark-bar`) |
| Wordmark `letter-spacing` | `0.02em` | `-0.01em` |
| Wordmark icon+text gap | `8px` (inline in `.bz-wordmark`) | `10px` (`.fl-wordmark-group`) |
| Avatar background | `var(--bz-surface-2)` | `var(--fl-border-2)` |
| Avatar font-weight | `700` | `600` |
| Avatar size | `26×26px` | `24×24px` |
| Vote/reaction button min-width | `52px` fixed `width` | `44px` `min-width` |
| Vote/reaction button border | `1.5px solid` | `1px solid` |
| Vote/reaction button border-radius | `10px` | `8px` |
| List row gap (`.{bz,fl}-list`) | `12px` | `10px` |
| List row border-radius | `12px` | `12px` (same) |
| Modal `padding` | `32px` | `28px` |
| Modal max-width (narrow) | `520px` | `460px` |
| Modal max-width (wide) | `680px` | `640px` |
| Modal-backdrop top padding (desktop) | `280px` | `300px` |
| Modal-backdrop bottom padding (desktop) | `48px` | `40px` |
| Comment-badge treatment | colored pill: `color:#8fd9aa; background:rgba(95,168,118,.12); padding:4px 9px; border-radius:999px` | plain text+icon, `color:var(--fl-text-muted)`, no background/padding/pill |
| Admin dropdown mobile breakpoint | `@container bz (max-width: 640px)` | `@container fl (max-width: 600px)` |
| History dot size | `10×10px` | `8×8px` |
| History rule (vertical line) width | `2px` | `1px` |

### 2c. Font-family

Both declare `font-family: "Inter", sans-serif;` once for the whole widget, but propagate it very differently:

- **Feature Lab**: sets it once on `#feature-lab-root`, then `#feature-lab-root * { font-family: inherit; }` cascades it to every descendant. Only 6 total `font-family` declarations in the whole file (root, the universal `inherit`, `.fl-signin-btn`, `.fl-admin-pill`, `.fl-signout-row`, `.fl-input`/`.fl-textarea`/`.fl-select` — the last one is redundant given the universal `inherit` rule already covers it).
- **Bug Zapper**: sets it on `#bug-zapper-root` but has **no** universal `* { font-family: inherit }` rule, so it re-declares `font-family: "Inter", sans-serif;` explicitly **17 times** across the file (`.bz-display`, `.bz-mono`, `.bz-signin-btn`, `.bz-admin-pill`, `.bz-signout-row`, `.bz-btn`, `.bz-badge`/`.bz-pill`, `.bz-sev`, `.bz-chip`, `.bz-row-meta`, `.bz-input`/`.bz-textarea`/`.bz-select`, `.bz-dropzone`, `.bz-avatar`, `.bz-section-label`, `.bz-admin-tag`, plus the root). This is exactly the pattern Feature Lab's own CSS header comment warns about needing to fix (see §4/§7) but it was never back-ported to Bug Zapper.

### 2d. Font sizes (px)

**Bug Zapper** — 33 declarations, 13 distinct values:

| px | Count | Selectors |
|---:|---:|---|
| 9 | 1 | `.bz-bit-label` |
| 10 | 1 | `.bz-admin-row.bz-open .bz-admin-label` (mobile) |
| 11 | 4 | `.bz-badge`/`.bz-pill`, `.bz-sev`, `.bz-comment-badge`, `.bz-avatar` |
| 12 | 8 | `.bz-admin-pill`, `.bz-signout-row`, `.bz-eyebrow`, `.bz-chip-small`, `.bz-row-meta`, `.bz-row-date`, `.bz-hint`, `.bz-section-label` |
| 13 | 7 | `.bz-signin-btn`, `.bz-chip`, `.bz-sortbar-label`, `.bz-row-desc`, `.bz-label`, `.bz-dropzone`, `.bz-error` |
| 14 | 4 | `.bz-subtitle`, `.bz-btn`, `.bz-empty`, `.bz-input`/`.bz-textarea`/`.bz-select` |
| 15 | 2 | `.bz-section-text`, `.bz-admin-tag` |
| 16 | 1 | `.bz-row-title` |
| 17 | 1 | `.bz-bit-count` |
| 18 | 1 | `.bz-wordmark` (mobile, `.bz-has-admin-trigger`) |
| 20 | 1 | `.bz-wordmark` |
| 22 | 1 | `.bz-detail-title` |
| 32 | 1 | `.bz-title` |

**Feature Lab** — 29 declarations, 10 distinct values:

| px | Count | Selectors |
|---:|---:|---|
| 10 | 2 | `.fl-vote-arrow`; `.fl-admin-row.fl-open .fl-admin-label` (mobile) |
| 11 | 1 | `.fl-avatar` |
| 12 | 8 | `.fl-admin-pill`, `.fl-signout-row`, `.fl-eyebrow`, `.fl-chip-small`, `.fl-badge`, `.fl-comment-badge`, `.fl-row-date`, `.fl-hint` |
| 13 | 8 | `.fl-signin-btn`, `.fl-chip`, `.fl-sort-label`, `.fl-row-desc`, `.fl-vote-count`, `.fl-comment-badge` svg-adjacent text, `.fl-label`, `.fl-error` |
| 14 | 3 | `.fl-subtitle`, `.fl-btn`, `.fl-empty` |
| 15 | 3 | `.fl-input`/`.fl-textarea`/`.fl-select`, `.fl-admin-only-badge`, `.fl-logged-out` |
| 16 | 1 | `.fl-row-title` |
| 18 | 1 | `.fl-wordmark` (mobile, `.fl-has-admin-trigger`) |
| 20 | 1 | `.fl-wordmark` |
| 32 | 1 | `.fl-title` |

Both features use the **same scale** (10/11/12/13/14/15/16/18/20/32, Bug Zapper adding 9/17/22 for its bit-button and detail-title). No feature invents an oddball size the other doesn't roughly share, but neither shares a single `font-size` custom property — every value is a repeated literal.

### 2e. Font weights

| Weight | Bug Zapper count | Feature Lab count |
|---:|---:|---:|
| 500 | 2 | 1 |
| 600 | 8 | 10 |
| 700 | 3 | 3 |
| 800 | 2 | 1 |

Same four-weight palette in both (500/600/700/800), no divergence in the set of weights used, only in which selectors get which weight (see §3 component diffs, e.g. avatar weight 700 vs 600).

### 2f. Line-heights

Only 3 explicit `line-height` declarations in the entire scope:
- Bug Zapper: `.bz-bit-count { line-height: 1; }`, `.bz-section-text { line-height: 1.6; }`
- Feature Lab: `.fl-vote-arrow { line-height: 1; }` (Feature Lab has no `line-height:1.6` equivalent in CSS — the description paragraph's `line-height:1.6` is set as an **inline style** in `feature-lab.js` line 451 instead of a class, whereas Bug Zapper's equivalent body-copy line-height lives in the stylesheet as `.bz-section-text`).

### 2g. Spacing (padding/margin/gap)

Both features share the same base spacing scale — `0, 2, 4, 6, 8, 9, 10, 12, 13, 14, 16, 18, 20, 22, 24, 32px` — used for padding, margin, and gap alike, all in raw `px`, never `rem`/`em`, and never through a spacing custom property. Representative shared values (identical in both): `gap: 8px` / `12px` / `16px` (topbar/wordmark-bar rows), `padding: 12px 20px` (primary buttons), `padding: 8px 14px` (chips), `margin-top: 4px` (subtitle). Representative **diverging** values are tabulated in §2b above (topbar padding, modal padding, list gap, etc.). No `rem` or `em` unit appears anywhere in either stylesheet — 100% px.

### 2h. Border-radius

| px / shape | Bug Zapper count | Feature Lab count | Same selectors' role? |
|---|---:|---:|---|
| `50%` | 4 | 3 | Yes — avatars/dots (bz has one extra: `.bz-row-dot`) |
| `999px` (pill) | 4 | 5 | Yes — chips/pills/badges |
| `8px` | 4 | 4 | Yes — buttons/inputs/icon-buttons |
| `10px` | 3 | 1 | Diverges — bz uses 10px for dropzone, me-too row, and duplicate-of hint container; fl only for admin-panel |
| `12px` | 2 | 2 | Yes — list rows, mobile dropdown |
| `16px` | 2 | 2 | Yes — root radius, modal radius |

Both use the same small radius vocabulary (`8/10/12/16px` + pill `999px` + circle `50%`); no unique radius value in either file, only different assignment of `10px` vs `12px` to a couple of components.

### 2i. Box-shadow

Exactly 2 distinct `box-shadow` values, and both are used **identically** in both files:
- `0 0 0 1px rgba(59, 168, 107, 0.25) inset` — `.{bz,fl}-admin-panel`
- `0 16px 40px rgba(0, 0, 0, 0.55), 0 2px 8px rgba(0, 0, 0, 0.4)` — mobile admin dropdown panel (`.{bz,fl}-admin-row.{bz,fl}-open`)

No divergence at all here — this is a fully shared token pair already.

### 2j. z-index

| Value | Bug Zapper | Feature Lab |
|---:|---|---|
| `999999` | `.bz-modal-backdrop` | `.fl-modal-backdrop` |
| `20` | `.bz-admin-row.bz-open` (mobile dropdown) | `.fl-admin-row.fl-open` (mobile dropdown) |

Identical values, identical roles, in both — trivially shared already in spirit, just not in a variable.

### 2k. `@container` breakpoints

| Feature | Breakpoints | Purpose |
|---|---|---|
| Bug Zapper | `@container bz (max-width: 1024px)` | tablet: adjust modal-backdrop top padding only |
| | `@container bz (max-width: 640px)` | mobile: full stacked layout + admin dropdown |
| Feature Lab | `@container fl (max-width: 900px)` | tablet: hide the date column only |
| | `@container fl (max-width: 600px)` | mobile: full stacked layout + admin dropdown |

**Divergence:** the two features don't share a breakpoint set. Bug Zapper's "mobile" cutover is `640px`; Feature Lab's is `600px`. Bug Zapper has no intermediate hide-a-column behavior (Feature Lab hides `.fl-row-date` at `900px`, well before its own `600px` full-stack point); Bug Zapper instead has a `1024px` breakpoint that exists purely to retune modal-backdrop padding for a taller mobile-admin-bar height, which Feature Lab has no equivalent for.

---

## 3. Component comparison

| Component | Classification | Notes |
|---|---|---|
| **Primary button** | SAME IDEA / DIVERGED | Base (`.{bz,fl}-btn`): `font-size:14px; font-weight:600; border:none; border-radius:8px; padding:12px 20px; cursor:pointer; white-space:nowrap; flex:none;` — identical in both. `.bz-btn-primary` adds `:hover { background: var(--bz-primary-hover) }`; **`.fl-btn-primary` has no `:hover` state at all.** |
| **Secondary/ghost button** | Secondary IDENTICAL, Ghost UNIQUE TO ONE | `.bz-btn-secondary`/`.fl-btn-secondary`: identical (`background:transparent; border:1px solid var(--..-border-2); color:var(--..-text-muted)`). Feature Lab additionally has `.fl-btn-ghost` (underlined text-only button, `font-size:13px`, `text-decoration:underline`) — **Bug Zapper has no equivalent class.** |
| **Danger/critical button** | SAME IDEA / DIVERGED | Feature Lab defines a reusable `.fl-btn-critical { background: var(--fl-critical); color: var(--fl-text); }` class, applied via `class="fl-btn fl-btn-critical"`. Bug Zapper has **no equivalent class** — its delete button instead uses `class="bz-btn"` plus an inline `style="background:var(--bz-accent);color:var(--bz-text);"` set directly in `bug-zapper.js` line 702. Same token, different implementation pattern — prime candidate for a shared `.btn-danger`. |
| **Icon-only button (modal close)** | IDENTICAL | `.bz-close-btn`/`.fl-close-btn`: `36×36px; padding:0; border:1px solid var(--..-border-2); border-radius:8px; color:var(--..-text-muted)`, `:hover{border-color:var(--..-text-faint); color:var(--..-text)}` — byte-for-byte equivalent values. |
| **Icon-only button (mobile admin toggle)** | IDENTICAL | `.bz-admin-menu-toggle`/`.fl-admin-menu-toggle`: `34×34px; border-radius:8px; background:transparent; border:none; color:var(--..-text-faint)`, hover identical. |
| **Filter pills** | IDENTICAL | `.bz-chip`/`.fl-chip` and their `.bz-active`/`.fl-active`, `.bz-chip-small`/`.fl-chip-small` variants: every declared property and value matches exactly (padding `8px 14px`, font `13px/500`, radius `999px`, active state inverts to `background:var(--..-text)`). Only the sort-bar's active-state override differs in selector specificity approach, not value (`#bz-sortbar .bz-chip.bz-active` vs `#fl-sort .fl-chip.fl-active`, same computed styles). |
| **Sort pills** | IDENTICAL | Same as filter pills — shared `.bz-chip`/`.fl-chip` classes are reused for sort, not a separate component, in both features. |
| **Top bar + wordmark** | SAME IDEA / DIVERGED | `.bz-topbar` padding `32px 32px 20px 32px` vs `.fl-wordmark-bar` padding `32px 32px 18px 32px` (top padding now matches per recent commit `897131f`; bottom still differs 20 vs 18). Structural DOM difference: Bug Zapper's `.bz-wordmark` is a single flex element containing both the SVG and the text; Feature Lab wraps icon+text in a separate `.fl-wordmark-group`, with `.fl-wordmark` being text-only. `letter-spacing` differs (`0.02em` bz vs `-0.01em` fl). Icon-to-text gap differs (`8px` vs `10px`). |
| **Page title / heading** | SAME IDEA / DIVERGED | `.fl-title` bakes brand color + `text-transform:uppercase` + `letter-spacing:0.32px` directly into the class, and always renders orange (`var(--fl-title-accent)`) — including a `.fl-modal .fl-title` override that turns it **purple** inside modals. Bug Zapper splits this: `.bz-title` alone has no color/transform/letter-spacing; a *second* class, `.bz-title-brand`, supplies `color:var(--bz-title); text-transform:uppercase; letter-spacing:0.01em` (note: `0.01em`, not Feature Lab's `0.32px` — different units and magnitude for a supposedly equivalent "brand title" treatment) and must be applied per-instance in markup. Consequently Bug Zapper's in-modal titles render in the **default body text color**, not purple — Feature Lab and Bug Zapper disagree on what a modal title should look like. |
| **Admin sign-in / status / sign-out row** | IDENTICAL markup & CSS | `.{bz,fl}-signin-btn`, `.{bz,fl}-admin-pill` (+ `-pill-dot`), `.{bz,fl}-signout-row` are pixel-identical in both CSS files (only the class prefix changes), and the surrounding HTML shell (`renderShell()`) is structurally identical: `#..-admin-menu-toggle` → `#..-admin-row` → three `.{bz,fl}-admin-section` blocks (sign-in / badge / sign-out). |
| **Mobile admin-icon dropdown** | IDENTICAL CSS pattern, DIVERGED breakpoint | Dropdown panel styling (position, shadow, arrow `::before`, per-section border, `:has()`-based empty-section hiding) is identical between `.bz-admin-row.bz-open` and `.fl-admin-row.fl-open`. The **login icon SVG markup is identical** in both (`<svg width="18" height="18" viewBox="0 0 24 24" ...><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>`, exact match, and likewise the sign-out icon SVG). Only the trigger breakpoint differs: bz fires at `≤640px`, fl at `≤600px`. |
| **Modal (backdrop, padding, z-index, panel, close)** | SAME IDEA / DIVERGED | `z-index:999999` identical. Backdrop scrim color differs (`rgba(10,9,10,.72)` bz vs `rgba(0,0,0,.6)` fl). Panel `padding` differs (`32px` vs `28px`); narrow/wide `max-width` differ (`520/680px` vs `460/640px`). Desktop backdrop top/bottom padding differ (`280px/48px` vs `300px/40px`). Bug Zapper alone has a `1024px`-tablet backdrop-padding tier; Feature Lab has none. Close button is identical (see above). Neither implements focus-trapping or Escape-to-close. |
| **Form inputs, textareas, selects, labels** | SAME IDEA / DIVERGED | `.{bz,fl}-input/-textarea/-select` share `border:1px solid var(--..-border-2); border-radius:8px; color:var(--..-text)`. Bug Zapper: `font-size:14px; padding:11px 13px;` plus an explicit `:focus{outline:2px solid var(--bz-primary); outline-offset:1px; border-color:var(--bz-primary)}`. Feature Lab: `font-size:15px; padding:12px 14px; outline:none;` with **no focus ring styling at all** (accessibility regression relative to Bug Zapper). `.bz-field` is `margin-bottom:20px` (block spacing); `.fl-field` is `display:flex;flex-direction:column;gap:8px` (flex spacing) — different layout mechanism for the same "label above input" pattern. Labels: `.bz-label`/`.fl-label` — identical `font-size:13px; font-weight:600; color:var(--..-text-muted)`. |
| **Validation / error text** | IDENTICAL role, minor diff | `.bz-error{color:var(--bz-accent); font-size:13px; margin-bottom:14px;}` vs `.fl-error{font-size:13px; color:var(--fl-critical);}` — same color role and size, bz additionally sets a bottom margin that fl leaves to its flex `gap` instead. |
| **Status/severity/priority badges/pills** | SAME IDEA / DIVERGED | Bug Zapper: `.bz-pill` — pill shape (`border-radius:999px; padding:3px 10px; font-size:11px; uppercase; letter-spacing:0.04em`). Feature Lab: `.fl-badge` — rounded-rect chip (`border-radius:999px; padding:6px 12px; font-size:12px; font-weight:600`, **not** uppercase, no letter-spacing). Different visual language for conceptually the same "status chip" (bz favors small-caps micro-pills, fl favors bolder regular-case badges). `.bz-badge`/`.bz-badge-neutral` are also defined in Bug Zapper's CSS but are **dead code** — see §7; the equivalent `.fl-badge-neutral` **is** used in Feature Lab's JS. |
| **Cards / list items** | SAME IDEA / DIVERGED | `.bz-row`: `justify-content:space-between; align-items:flex-start; padding:18px 20px; gap:16px`, two-tier internal structure (`.bz-row-top` + `.bz-row-right`), always `cursor:pointer`. `.fl-row`: `align-items:center; padding:16px 18px; gap:16px`, `cursor:default` by default with a separate `.fl-clickable` modifier class layered on, plus a `.fl-declined{opacity:.6}` state Bug Zapper has no equivalent for. List container itself differs: `.fl-list` caps at `max-height:640px; overflow-y:auto` (internal scroll); `.bz-list` has no max-height (whole widget grows). |
| **Vote/reaction button ("bit me too" / upvote)** | SAME IDEA / DIVERGED | Both are a 2-line vertical button (count + label) with an active/inactive toggle state, but rendered differently: `.bz-bit-btn` is a fixed `52px`-wide button showing a big count (`17px/800`) over a small uppercase label ("bit"); `.fl-vote-btn` is `min-width:44px` showing a `▲` glyph over a `13px/600` count, no text label. Active-state color also diverges (`#c9a8ff` hardcoded vs `var(--fl-primary)`, see §2b). |
| **Comment badge (count indicator)** | SAME IDEA / DIVERGED | Bug Zapper renders it as a colored pill (private-comments indicator, green-tinted, `padding:4px 9px; border-radius:999px`). Feature Lab renders it as plain muted text next to a 15×15 SVG icon, no pill/background at all (public comment count). Different treatments are arguably justified by bz's comments being *private* vs fl's being *public*, but the underlying "N comments" affordance is the same idea. |
| **Avatar (initials circle)** | SAME IDEA / DIVERGED | `.bz-avatar`: `26×26px; background:var(--bz-surface-2); font-size:11px; font-weight:700`. `.fl-avatar`: `24×24px; background:var(--fl-border-2); font-size:11px; font-weight:600`. Different size, different background token role, different weight, for the same component. |
| **Empty state** | SAME IDEA / DIVERGED | `.bz-empty{padding:40px 0; color:var(--bz-text-faint); font-size:14px;}` vs `.fl-empty{padding:48px 16px; color:var(--fl-text-muted); font-size:14px;}` — different padding and, notably, a **different text-color token role** (`text-faint` vs `text-muted` — bz's faintest tone vs fl's mid tone) for what should be the same "nothing here" message. |
| **Loading state** | UNIQUE TO NEITHER (absent from both) | Neither feature renders an explicit loading/spinner state while the initial Firestore snapshot is pending — the list is simply empty (indistinguishable from the real empty state) until `onSnapshot`'s first callback fires. |
| **Error state (data fetch failure)** | IDENTICAL pattern | Both `subscribeTo{Reports,Requests}()` error callbacks replace the list's `innerHTML` with a one-line `<div class="{bz-empty|fl-empty}">Couldn't load ... Try refreshing.</div>` — same mechanism, same fallback-into-the-empty-state-class approach, in both files. |
| **Toasts / inline confirmations** | UNIQUE TO NEITHER (absent from both) | No toast component and no non-blocking inline confirmation exists in either feature. All feedback is either an inline error `<div>` (shown/hidden) or the browser's native `window.confirm()` for destructive actions. |
| **History timeline** | SAME IDEA / DIVERGED | Structurally identical (`.{bz,fl}-history-item` → `-line` → `-dot` + `-rule` → `-body`), but dot size (`10px` vs `8px`) and rule width (`2px` vs `1px`) differ. |
| **Admin-only panel** | IDENTICAL | `.bz-admin-panel`/`.fl-admin-panel` and `.bz-admin-tag`/`.fl-admin-only-badge`: identical background (`#0d2418`), border (`2.5px solid #3ba86b`), inset shadow, and badge text styling (`#5fe89a`, `15px/800`, uppercase, `0.08em` tracking) — the shield SVG markup is also identical. Only structural difference: `.fl-admin-panel` is `display:flex;flex-direction:column;gap:16px` (flex layout for its children) while `.bz-admin-panel` has no such layout rule (children are spaced with ad hoc inline `margin`/`gap` styles in the JS template instead). |

---

## 4. Squarespace workaround rules

| Rule | Bug Zapper | Feature Lab |
|---|---|---|
| `[hidden] { display: none !important; }` | ✅ `#bug-zapper-root [hidden] { display: none !important; }` | ✅ `#feature-lab-root [hidden] { display: none !important; }` (identical pattern; Feature Lab's CSS comment explicitly explains this guards against the exact bug that once broke Bug Zapper's admin badge) |
| `* { font-family: inherit }` | ❌ **Absent.** `#bug-zapper-root * { box-sizing: border-box; }` only — no `font-family: inherit`. Font is instead re-declared 17× (see §2c). | ✅ `#feature-lab-root * { box-sizing: border-box; font-family: inherit; }` |
| `white-space: nowrap; flex: none` on buttons | ✅ `.bz-btn` has both | ✅ `.fl-btn` has both |
| `container-type: inline-size` on root | ✅ `#bug-zapper-root { container-type: inline-size; container-name: bz; }` | ✅ `#feature-lab-root { container-type: inline-size; container-name: fl; }` |
| Any `@media` use | None found — only a code comment (line 7 of `feature-lab.css`) explicitly documenting the decision to avoid `@media` in favor of `@container`. No actual `@media` rule exists in either CSS file or either JS file. | Same — none found. |
| Google Fonts `<link>` for Inter | Documented in `features/bug-zapper/README.md`'s embed snippet (`family=Inter:wght@400;500;600;700;800`). | **Not documented anywhere** — no README exists for Feature Lab (see §1, §7), so there is no committed record of how/whether Inter gets loaded for this feature's embed. |

---

## 5. JavaScript duplication

| Logic | Bug Zapper (file:function) | Feature Lab (file:function) | Verdict |
|---|---|---|---|
| Admin Google sign-in | `bug-zapper.js: handleAdminSignIn()` (937–945) | `feature-lab.js: handleAdminSignIn()` (635–643) | **Near-identical** — same `GoogleAuthProvider` + `signInWithPopup` + `syncAdmin()` call sequence, same `try/catch` shape, same console.error message text. |
| `admins/{uid}` check via `syncAdminStatus` | `bug-zapper.js: syncAdmin()` (962–973) | `feature-lab.js: syncAdmin()` (656–667) | **Near-identical** — identical `httpsCallable(functions, "syncAdminStatus")` call, identical fallback-to-`false`-on-error, identical `updateAdminUi(); renderList();` tail. |
| Admin sign-out | `bug-zapper.js: handleAdminSignOut()` (947–960) | `feature-lab.js: handleAdminSignOut()` (645–654) | **Near-identical** — same `signOut(auth)` → reset `state.isAdmin` → `updateAdminUi()` → `renderList()` sequence. Bug Zapper's version carries an extra explanatory comment about `onAuthStateChanged` re-arming anonymous auth; no functional difference. |
| `updateAdminUi()` (hide/show sign-in/badge/sign-out/mobile-trigger) | `bug-zapper.js` (975–996) | `feature-lab.js` (669–687) | **Near-identical** — same element lookups, same `hasActivePlan(PLANS.ADMIN)` convenience check with the identical inline comment ("UI convenience only, not a security boundary"), same `classList.toggle(".. -has-admin-trigger", hasAnythingToShow)` call. |
| `watchAuthState()` (anonymous-auth bootstrap + admin re-verify) | `bug-zapper.js` (998–1013) | `feature-lab.js` (689–708) | **Near-identical** — identical `onAuthStateChanged` shape: no user → `signInAnonymously`; non-anonymous user → `syncAdmin()`; always → subscribe to the collection. |
| Admin dropdown open/close/outside-click | `bug-zapper.js: initBugZapper()` inline handlers (1033–1040) | `feature-lab.js: initFeatureLab()` inline handlers (728–735) | **Identical approach** — toggle button click `stopPropagation()`s and toggles `.{bz,fl}-open`; a single `document.addEventListener("click", ...)` unconditionally removes `.{bz,fl}-open` on every other click. Neither has Escape-key handling, and neither actually checks "was the click outside the dropdown" — both rely solely on the toggle button's `stopPropagation()`. Same latent quirk in both (clicking *inside* an open dropdown but not on the toggle also closes it via the document listener, though in practice the dropdown's own buttons trigger navigation/state changes that make this moot). |
| Modal open/close/focus handling | `openSubmitModal()` / `openDetailModal()` in both files | same | **Near-identical shell**, different domain logic. Both: render into a `#..-modal-slot`, backdrop click closes only if `e.target.id === "..-backdrop-id"`, dedicated close button, `close()` also tears down any live `onSnapshot` comment subscription. Neither traps focus or closes on Escape. Bug Zapper's detail modal carries substantially more logic (severity/priority/duplicate-of fields, private-comment visibility gating via `canSeeComments()`, screenshot rendering) that Feature Lab has no equivalent for. |
| Confirm-before-delete | `bug-zapper.js` delete handler (888–912) | `feature-lab.js` delete handler (593–610) | **Near-identical UX, different implementation.** Both use native `window.confirm()` with a dynamic message. Bug Zapper calls the `deleteBugReport` **Cloud Function** (so it can also clean up the Cloudinary screenshot) and sets a `disabled`/"Deleting…" loading state on the button during the async call, re-enabling on failure. Feature Lab calls `deleteDoc()` directly against Firestore with no Cloud Function and **no loading/disabled state** on the delete button during the request. |
| MemberSpace `waitForReady` + gating | `bug-zapper.js: initBugZapper()` (1042–1047) | `feature-lab.js: initFeatureLab()` (737–742) | **Identical** — both literally call the same shared `waitForReady()`/`isLoggedIn()` from `shared/memberspace-helper.js`; this one is correctly de-duplicated already. |
| Toast / notification helper | none | none | **N/A** — neither feature has one; all feedback is inline error `<div>`s or native `confirm()`. |
| `escapeHtml()` | `bug-zapper.js` (144–150) | `feature-lab.js` (95–101) | **Byte-identical** function body, duplicated per-file rather than lifted into `shared/`. |
| `formatDate()` | `bug-zapper.js` (152–157) | `feature-lab.js` (113–118) | **Byte-identical** function body, duplicated per-file. |
| `initials()` | `bug-zapper.js` (167–174) | `feature-lab.js` (103–111) | **Near-identical** — same intent (first letters of up to 2 words, uppercased), slightly different implementation order (`.slice(0,2)` before vs after `.map()`) and a different fallback (`"?"` via `|| "?"` in bz vs a default parameter `name ?? "?"` in fl), but same output for all normal inputs. |
| Vote/me-too toggle (`toggleVote`/`toggleMeToo`) | `bug-zapper.js: toggleMeToo()` (330–342) | `feature-lab.js: toggleVote()` (222–234) | **Near-identical** — same `arrayUnion`/`arrayRemove` toggle-by-uid pattern against the doc, same try/catch/console.error shape. |

**Not duplicated** (already correctly shared): `getFirebaseApp()`, `isMemberSpaceReady()`, `getCurrentMember()`, `isLoggedIn()`, `hasActivePlan()`, `waitForReady()`, `PLANS` — all live once in `shared/memberspace-helper.js` / `shared/firebase-init.js` and are imported by both features without duplication.

---

## 6. Hardcoded values that should become tokens

Beyond the CSS-variable analysis in §2, these are the concrete literals (CSS + JS-set inline styles) that duplicate an existing token's *value* without using the token, or that diverge where they arguably shouldn't:

- **Success/green cluster** — `#5fa876`, `#8fd9aa`, `rgba(95, 168, 118, 0.1)`, `rgba(95, 168, 118, 0.16)` are hardcoded identically in *both* files' sign-in/admin-pill rules rather than promoted to a shared `--success` / `--success-bg` pair (note `--bz-green`/`--fl-green` already exist at `#5fa876` and are used elsewhere for the "Fixed"/"shipped" status — these sign-in-specific literals duplicate that same value without referencing the variable).
- **Admin-panel green cluster** — `#0d2418`, `#3ba86b`, `rgba(59, 168, 107, 0.25)`, `#5fe89a` are hardcoded identically in both files with no corresponding `--admin-panel-bg` / `--admin-panel-border` / `--admin-accent` variables.
- **Modal backdrop scrim** — `rgba(10, 9, 10, 0.72)` (bz) and `rgba(0, 0, 0, 0.6)` (fl) are both hardcoded *and* diverge from each other — the clearest single "pick one value, make it a shared token" candidate in the whole audit.
- **Dropdown shadow** — `0 16px 40px rgba(0, 0, 0, 0.55), 0 2px 8px rgba(0, 0, 0, 0.4)` hardcoded identically in both — a good `--dropdown-shadow` candidate.
- **`#c9a8ff`** (Bug Zapper's lightened-purple active-vote text) — hardcoded, no variable, and not reused anywhere else; if this lightened tone is intentional it should become e.g. `--bz-primary-light` rather than a bare literal repeated twice.
- **`z-index: 999999`** (modal) and **`z-index: 20`** (dropdown) — hardcoded identically in both files; harmless today since both features already agree on the numbers, but any future third surface layering on top of these would have to guess rather than reference a shared stacking-context token.
- **SVG icon fills** — `#FFD400`, `#2A2326`, `#786e70` (bug icon, Bug Zapper) and `#9146FF`, `#FFA100` (flask icon, Feature Lab) are hardcoded per `<path>`/`<circle>`/`<rect>`. The purple/orange ones duplicate `--primary`/`--title` values already defined as variables one line of CSS away but can't reference them (raw SVG `fill` attributes, not CSS) — acceptable for brand artwork, but Bug Zapper additionally **duplicates its entire icon markup byte-for-byte** across `renderShell()` and `renderLoggedOut()` inside the same file, doubling the hardcoded-literal count for no reason other than not having extracted a helper function.
- **Inline `style="..."` literals set from JS** — both files set numerous one-off inline styles (`style="display:flex;gap:16px;flex-wrap:wrap;margin:14px 0;"`, `style="flex:1;min-width:160px;"`, etc., see the `style="..."` greps in this audit) for layout that arguably belongs in the stylesheet as named classes rather than repeated per-template-literal-call inline strings — this is the majority of "hardcoded spacing" by raw count, more than the CSS files themselves.

---

## 7. Anything surprising

1. **Root `README.md` is a byte-for-byte duplicate of `features/bug-zapper/README.md`.** The repository's top-level README currently *is* the Bug Zapper feature doc (same "# Bug Zapper" heading, same content, same length — 140 lines both). There is no actual repo-level README describing the project as a whole, its features, or how to use the CDN/tagging workflow it references (`@dev` vs `@v1.3.0`). This looks like a copy/paste-to-the-wrong-path mistake rather than an intentional decision.

2. **Feature Lab has no `README.md` at all**, unlike Bug Zapper and (per the `features/` directory listing surfaced during this audit) the sibling `disk-stash`, `member-welcome-banner`, `site-nav-login`, and `_template` features, which do have their own READMEs. Feature Lab is the outlier with zero documentation of its embed snippet, data model, or known gaps.

3. **Bug Zapper's README documents setup files that don't exist in the repo.** Steps 2–8 of "One-time setup before this goes live" instruct merging `functions-addition.js`, `firestore-rules-addition.txt`, `functions-addition-delete.js`, `firestore-rules-delete-update.txt`, and `firestore-rules-comments-history.txt` into `functions/index.js`/`firestore.rules`. None of these five files exist anywhere in the repository — the `features/bug-zapper/` directory contains only `README.md`, `bug-zapper.css`, and `bug-zapper.js`. Either the merges already happened and the standalone diff files were (correctly) never committed, in which case the README is stale and should say so, or they're missing.

4. **Two confirmed dead CSS selectors in `bug-zapper.css`**, verified by grepping `bug-zapper.js` for their class names and finding zero matches:
   - `.bz-mono` (line 65) — defined identically to `.bz-display` (`font-family: "Inter", sans-serif`), never referenced in the JS. Its own file header comment explains the *reason* it should be pointless now ("Font (everywhere ... and what used to be 'mono' meta text) | Inter"), i.e. this is a vestige of the pre-Inter-migration design that was never cleaned up.
   - `.bz-badge` / `.bz-badge-neutral` / `.bz-sev` / `.bz-sev-dot` / `.bz-row-badges` — all defined in `bug-zapper.css`, none referenced in `bug-zapper.js` (which renders severity/status via `.bz-pill` directly instead). By contrast, Feature Lab's equivalent `.fl-badge` / `.fl-badge-neutral` **are** used in `feature-lab.js` — so this isn't a case of both features carrying the same dead weight, it's Bug Zapper alone accumulating an abandoned parallel badge system.

5. **`shared/firebase-init.js` hardcodes both the staging and production Firebase Web API keys** directly in a client-shipped ES module. The in-file comment correctly notes this is expected/safe for Firebase web config (real access control is Firestore/Storage rules, not key secrecy), so this is not flagged as a vulnerability — but it's exactly the kind of literal a security-focused reviewer would flag on sight, so it's worth confirming the team is comfortable with that tradeoff being spelled out in a comment rather than, say, an env-specific build step.

6. **`shared/firebase-init.js`'s `ENV` constant is a manually-edited literal currently set to `"staging"`**, with a comment instructing it be "flipped manually per environment (or derive it from hostname/page)." Since this file is shared by *both* features, if it is currently deployed with `ENV = "staging"` on any live/production Squarespace page, both Bug Zapper and Feature Lab would be writing member data to the **staging** Firebase project rather than production, silently. Worth an explicit check outside this read-only audit.

7. **Bug Zapper duplicates its entire wordmark SVG markup verbatim** inside a single file — once in `renderShell()` (lines ~197–210) and again in `renderLoggedOut()` (lines ~251–264), 13 near-identical lines each. Feature Lab's `renderLoggedOut()` has no icon at all (just a plain text line), so the two features are inconsistent both in whether the logged-out screen shows the wordmark, and (within Bug Zapper alone) in whether that markup is factored into a helper.

8. **Neither feature's admin dropdown or modal supports Escape-to-close**, and neither traps focus inside an open modal — both are accessibility gaps shared identically by both features (see §5), so fixing it once in a shared modal/dropdown helper would fix both at once.

9. **Feature Lab's inputs (`.fl-input`/`.fl-textarea`/`.fl-select`) have no visible `:focus` style** (`outline: none;` with nothing replacing it), while Bug Zapper's equivalents have an explicit 2px primary-color focus ring. This is a real, user-visible accessibility regression unique to Feature Lab, not just a "different value for the same token" style difference.

10. **The `disk-stash` feature** (referenced repeatedly by both READMEs and by name inside `bug-zapper.js`'s comments — "the same safe path Disk Stash's manual purge uses," "a `cleanupRules` doc in Disk Stash," etc., and cross-referenced for its old "Space Grotesk / IBM Plex Sans / IBM Plex Mono" look) **exists in the repo at `features/disk-stash/disk-stash.css`** and does still use `"Space Grotesk"`/`"IBM Plex Sans"`/`"IBM Plex Mono"` font-families and (presumably) the old single-red-accent palette — confirming both READMEs' claims about the "old look" are accurate, though `disk-stash/` itself is out of scope for this audit and was not read beyond confirming its font-family declarations exist.

---

## Changes made

None. Only `docs/ui-audit.md` was created, as instructed; it has not been committed.

`git status`:
```
On branch dev
Your branch is up to date with 'origin/dev'.

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	docs/

nothing added to commit but untracked files present (use "git add" to track)
```
