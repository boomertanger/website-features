# Changelog

All notable changes, one entry per tagged release.

## [Unreleased]
- bt-ui: mascot component (.bt-mascot, live-aware lens stripes) with brand tokens --bt-mascot-head/-lens/-stripe/-stripe-edge, the R4 logo lockup (split wordmark, TANGER hover shimmer), the G4 footer with G3 domain cards (4 across, a one-column list on phones, live-aware .live / .club cards), --bt-shadow-lift and --bt-logo-shine; design-system.md §5 and §8e.
- assets: mascot artwork (shared/assets/mascot.svg), real favicon (site/public/favicon.svg) and the approved header/footer mockup (docs/design/mockups/header-footer-final.html).
- Cloudflare Pages project 'boomertanger' connected (root site/, dev = preview/staging, main paused until launch).
- site: new Astro site in site/ (static, Node 22, Cloudflare Pages): base layout, header, Live Beacon, phone tab bar, footer, home page (hero 3B stories carousel, 4C/6A layout) with ?as= / ?live= preview mode on non-production builds, placeholder pages and a 404. No Firebase yet; member content is preview data.
- bt-ui: Site shell components for the new site (header, nav, Live Beacon, tab bar, footer, stories hero carousel, tiles, member strip, join card, pill switches, Boom Board, pinboard notes, Boom Board / Warm Fuzzies wordmarks), shared/ui/hero-carousel.js and shared/ui/pill-switch.js; modal.js prefers --bt-header-h when the page sets it.
- docs: foundation spec (docs/specs/foundation.md) and the approved home page and slide library mockups (docs/design/mockups/).
- Admin panel (Bug Zapper + Feature Lab): a note can be saved on its own, as a "Note added" history entry (gray dot); status and statusChangedAt stay put. Save enables for a status / priority / duplicate-of change or a non-blank note; the dialog stays open after saving and the note field clears.
- firestore.rules: allow the note-only history entry (kind "note", 1-500 chars, status and statusChangedAt unchanged) and reject admin-panel writes that change nothing.
- Admin panel (Bug Zapper + Feature Lab): the note field is always typeable (it was disabled until the status changed, so clicks focused the dialog and lit it purple); it's still saved only with a real status change.
- Admin panel: the note hint sits right-aligned directly above the right-aligned save button; Admin activity follows.
- bt-ui: dialogs no longer show a focus ring on themselves, and disabled inputs, textareas and selects look disabled.
- Admin panel (Bug Zapper + Feature Lab): save button right-aligned in a `.bt-form-actions` row; Admin activity follows it directly.
- Rename Disk Stash to Cloud Stash (code, docs, display name). The
  Cloudinary upload preset name `disk-stash`, and the generic
  externalAssets/storageUsage/cleanupRules collections and
  deleteExternalAsset/scheduledAssetCleanup function names, are
  unchanged on purpose — see features/cloud-stash/README.md.
- Add `disk-stash` feature: admin-only dashboard for the shared
  `externalAssets` storage collection — tracked-storage usage bar, asset
  list with a manual purge action, and admin-editable auto-cleanup rules.
  Adds `deleteExternalAsset` (callable) and `scheduledAssetCleanup`
  (daily) Cloud Functions, the single allowed Cloudinary deletion path,
  plus `functions/lib/externalAssets.js`'s `recordAssetCreated()` helper
  for future writers (Bug Zapper first). Requires `CLOUDINARY_CLOUD_NAME`
  / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` secrets on both
  Firebase projects before deploying functions.

## [v1.1.0] - 2026-09-18
- Add `site-nav-login` feature: injects a "LOG IN" link into the desktop and
  mobile nav via Footer Code Injection, hidden automatically for logged-in
  visitors via MemberSpace's `data-ms-hide-when-logged-in`. Consolidates two
  raw scripts previously pasted directly into Squarespace's Footer Code
  Injection.

## [v1.0.0] - 2026-09-16
- Add `member-welcome-banner` feature: shows a welcome message for logged-in
  members or a login prompt for logged-out visitors, based on MemberSpace
  login state. First feature verified through the staging-to-production
  pipeline.
