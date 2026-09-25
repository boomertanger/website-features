# website-features

Small, self-contained features for the Boomertanger Squarespace site
(boomertanger.com and its sibling domains), each embedded via a Squarespace
Code Block that loads a stylesheet and an ES module straight from this
repo's `dev` branch (staging) or a pinned release tag (production) via
jsDelivr. There is no build step and no bundler — every file here is loaded
as-is by the browser.

## Folder layout

- **`shared/`** — code used by every feature.
  - `bt-ui.css` — the shared UI kit: design tokens, Squarespace guard
    rails, and every shared component (buttons, chips, badges, forms,
    modals, dashboard parts, etc.).
  - `ui/dom.js`, `ui/modal.js`, `ui/confirm.js`, `ui/admin-menu.js`,
    `ui/admin-auth.js` — small shared JS modules a feature imports by
    relative path (dialogs, the admin dropdown, the shared admin
    sign-in/out flow, text/date helpers).
  - `ui-kit/` — a reference page (`ui-kit.css` + `ui-kit.js`) that renders
    every shared component in every state. The visual source of truth for
    `bt-ui` — see `docs/design-system.md` for the written one.
  - `firebase-init.js` — one Firebase app instance (staging or production
    config), shared by every feature.
  - `memberspace-helper.js` — a thin wrapper around MemberSpace's
    client-side membership state (`window.MemberSpace`). Features should
    always go through this, never touch `window.MemberSpace` directly.
- **`features/<name>/`** — one folder per feature: `<name>.js` (the client
  module, `initXxx()`), `<name>.css` (feature-specific styling only — see
  `docs/design-system.md` rule 2), and a `README.md` describing what the
  feature does, its data model, and its embed snippet.
- **`functions/`**, **`firestore.rules`** — the Cloud Functions and
  Firestore security rules backend. These deploy separately from git (see
  below) and are not loaded by the browser.
- **`docs/design-system.md`** — the `bt-ui` kit's token and component
  reference, and the migration guide used to bring each feature onto it.
- **`CLAUDE.md`** — the non-negotiable rules for working on this repo's
  frontend (use `bt-ui`, no raw colors in feature files, container queries
  only, always `openModal`/`confirmAction`, etc.).

## How a feature gets onto a page

Each feature is a Squarespace Code Block (see `docs/design-system.md` §1).
Staging Code Blocks use the **staging loader**: on every page load it asks
GitHub for the newest `dev` commit and loads `shared/bt-ui.css`, the
feature's `<name>.css` and `<name>.js` from jsDelivr pinned to that exact
SHA, so all files always come from the same commit and the Code Block never
needs editing after a push. Production Code Blocks use plain `@1` URLs, with
the Inter fonts and `shared/bt-ui.css` in Squarespace Header Code Injection.
Each feature's own `README.md` has its exact, ready-to-paste snippets.

## Branches and releases

- `dev` — work in progress; staging Code Blocks follow it via the staging
  loader (always the newest commit, loaded pinned to its SHA).
- `main` — production-ready; production Code Blocks point to a tag cut from
  `main` (e.g. `@v2.0.0`). Never tag from `dev`.
- After every push to `dev`, confirm it landed
  (`git rev-parse HEAD` should match
  `git ls-remote https://github.com/boomertanger/website-features.git dev`)
  before telling anyone to refresh staging — see `CLAUDE.md`'s
  "After every push to dev".
- Firestore rules and Cloud Functions are deployed separately from git
  (`firebase deploy --project <staging|production> --only firestore:rules`
  / `--only functions`) — pushing to git alone never updates either.

## Where to start

- Changing or adding UI in a feature: read `docs/design-system.md` and
  `CLAUDE.md` first.
- Working on a specific feature: read that feature's own `README.md` for
  its data model, setup steps, and embed snippet.
