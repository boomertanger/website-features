# Changelog

All notable changes, one entry per tagged release.

## [Unreleased]
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
