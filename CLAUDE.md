# CLAUDE.md — Boomertanger website-features

Instructions for Claude Code working in this repo. Read `docs/design-system.md`
before touching any feature's markup or CSS.

## Repo layout
- `shared/` — code used by every feature
  - `bt-ui.css` — the shared UI kit (tokens, Squarespace guard rails, all components)
  - `ui/dom.js`, `ui/modal.js`, `ui/confirm.js`, `ui/admin-menu.js`, `ui/admin-auth.js`
  - `ui-kit/` — the UI Kit reference page (renders every component)
  - `firebase-init.js`, `memberspace-helper.js`
- `features/<name>/` — one folder per feature: `<name>.js`, `<name>.css`, `README.md`
- `functions/`, `firestore.rules` — backend (separate deploys; see below)
- Branches: `dev` = work in progress, `main` = production-ready. Never tag from `dev`.

## UI rules (non-negotiable)
1. **Use `bt-ui`.** Every feature root carries `class="bt-root"` (add it from JS at init
   if the Code Block's div doesn't have it). Build UI from `bt-*` components. Never
   re-create a component that exists in `shared/bt-ui.css` inside a feature.
2. **Feature CSS is for feature-specific things only** — unique layout, animated
   wordmark icons, a dropzone, etc. It must not redefine tokens or restyle shared
   components.
3. **No raw colors in feature CSS or feature JS markup.** Use `var(--bt-*)`. The only
   exception: a feature-unique color (e.g. Bug Zapper's bolt yellow) declared ONCE as a
   feature custom property at the top of the feature CSS (`--bz-bolt: #ffd400;`) and
   referenced by name everywhere else. Check before every commit:
   `grep -nE "#[0-9a-fA-F]{3,8}\b|rgba?\(" features/*/*.css features/*/*.js`
   — every hit must be a feature custom-property declaration line, or explain why.
4. **New component needed?** Propose adding it to `shared/bt-ui.css` (and the UI Kit
   page). Don't build it feature-local.
5. **Responsive:** container queries only, never `@media` for layout. The root's
   container name is `bt`. Breakpoints: `@container bt (max-width: 1024px)`,
   `(max-width: 640px)`, `(max-width: 420px)`.
6. **Modals:** always `openModal()` / `confirmAction()` from `shared/ui/`. Never
   `window.confirm()`, never a hand-rolled backdrop. Modals render in a portal on
   `<body>`, so feature-specific modal CSS targets
   `.bt-portal[data-feature="<feature-name>"] …`, NOT `#<feature>-root …`.
7. **Selectors in feature CSS:** `#<feature>-root .x` (it loads after `bt-ui.css`, so it
   wins ties). Keep the specificity at that level — no `!important` except the
   documented `[hidden]` guard, which `bt-ui.css` already provides.
8. **Import shared modules by relative path** (`../../shared/ui/modal.js`) so they
   always resolve at the same version as the feature.
9. Button/heading/label text is sentence case. Uppercase only where the kit does it
   (page title, dialog title, labels, table headers, admin tag).

Building an admin-only feature, auditing status colors, or picking up
follow-up work? Read `docs/design-system.md` §8 ("Recorded decisions") first.

## Other conventions
- MemberSpace: use `shared/memberspace-helper.js`, never `window.MemberSpace` directly.
  `memberInfo.id` is a NUMBER — `String()` it before writing to Firestore.
- Firebase: modular imports only, via `shared/firebase-init.js`. Never compat scripts.
- Client-side membership checks are visual only; real protection is Firestore rules /
  Cloud Functions.
- Firestore rules and Cloud Functions deploy separately from git:
  `firebase deploy --project staging --only firestore:rules` / `--only functions`,
  staging first. A first-ever 2nd-gen Firestore-trigger deploy may fail once with an
  Eventarc/IAM error — retry after a couple of minutes. Confirm functions in the
  Firebase console; don't trust the terminal summary alone.

## After every push to dev
1. `git rev-parse HEAD`, and confirm it matches
   `git ls-remote https://github.com/boomertanger/website-features.git dev`.
   If they differ, the push silently failed (sandboxed credential prompt) — stop and
   tell the user to run `git push origin dev` from a real terminal.
2. Print ready-to-paste Squarespace Code Block snippets pinned to that full SHA:
   `https://cdn.jsdelivr.net/gh/boomertanger/website-features@<sha>/<path>`.
   Until the release moves them into Header Code Injection, staging snippets must
   include the Inter font `<link>`s and `shared/bt-ui.css` before the feature CSS.
