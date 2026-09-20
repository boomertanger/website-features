# Feature: Disk Stash

## Goal
Shared admin tool for monitoring and safely cleaning up external file
storage (Cloudinary), used by any feature that stores files — not just
Bug Zapper. Reads/manages a generic `externalAssets` collection so it
works for every current and future writer without redesign.

## Who sees it
Admin only. MemberSpace's Admin plan (`PLANS.ADMIN`) only gates whether
the sign-in invite is shown — it is not server-verifiable. Real access
requires signing in with a Google account on `adminAllowlist`, the same
pattern Feature Lab established (`syncAdminStatus` + `admins/{uid}`).

## Where it lives
Squarespace page slug: `disk-stash` (create this page; embed the usual
`<div id="disk-stash-root"></div>` + module script tag, per the repo's
loading convention).

## Data model

`externalAssets/{assetId}` — written only by Cloud Functions:
```
{
  url: string,
  publicId: string,
  resourceType: "image" | "video" | "raw",   // defaults to "image"
  feature: string,                            // e.g. "bugZapper"
  sizeBytes: number,
  linkedDoc: {
    collection: string,
    docId: string,
    field: string   // the field on that doc holding this asset's URL —
                     // e.g. "screenshotUrl". Required so the safe-delete
                     // function knows what to clear. (Not in the original
                     // one-line proposal — added so the delete path can
                     // actually be generic across features.)
  },
  createdAt: timestamp,
}
```

`storageUsage/current` — written only by Cloud Functions:
```
{ totalBytes: number, updatedAt: timestamp }
```
**This tracks bytes in known `externalAssets` records only.** Cloudinary's
25-credit free tier also spans bandwidth and transform usage, which this
number does not include — there's no visibility into those without a
separate call to Cloudinary's own Usage API. The usage bar is labeled
"Tracked storage," not "Cloudinary usage," to avoid overclaiming.

`cleanupRules/{ruleId}` — admin-editable directly (no Cloud Function
needed to write this; it's config, not user data):
```
{
  feature: string,          // e.g. "bugZapper"
  collection: string,       // the linked doc's collection to scan
  matchField: string,       // e.g. "status"
  matchValue: string,       // e.g. "fixed"
  ageField: string,         // timestamp field marking when it entered that state
  ageThresholdDays: number, // e.g. 60
  enabled: boolean,
  createdAt: timestamp,
}
```

## Gating logic
- Client-side visibility: `hasActivePlan(PLANS.ADMIN)`.
- Real reads/writes: `isAdmin()` in `firestore.rules`, checking
  `admins/{uid}` — set by `syncAdminStatus` right after Google Sign-In.
- `externalAssets` / `storageUsage`: admin-readable, write is `false` for
  every client (even admins) — only Cloud Functions touch them, so they
  can never drift from Cloudinary's real state.
- `cleanupRules`: admin-readable and admin-writable directly, since it's
  config with no orphan-safety stakes.

## Cloud Functions (`functions/index.js`)
- `deleteExternalAsset` (callable, admin-only) — the **only** allowed
  deletion path. Deletes from Cloudinary's Admin API first; only on
  success does it clear `linkedDoc.field` on the linked doc, delete the
  `externalAssets` record, and decrement `storageUsage/current`.
- `scheduledAssetCleanup` (daily, 09:00 America/Los_Angeles) — reads every
  enabled `cleanupRules` doc, finds linked docs matching its condition,
  and purges their assets through the exact same `performAssetDeletion`
  path as the manual button.
- `functions/lib/externalAssets.js` exports `recordAssetCreated()` for
  any feature's own Cloud Function to call right after a successful
  Cloudinary upload — Disk Stash doesn't own asset *creation*, only
  deletion and display, but ships this helper so every writer stays
  consistent with the schema above.

## UI states
- **Sign-in gate** — Admin-plan member, not yet Google-signed-in.
- **Not admin** — MemberSpace doesn't show them as Admin plan at all.
- **Populated dashboard** — usage bar, asset table, cleanup rules list.
- **Empty state** — no `externalAssets` docs yet (true today, until Bug
  Zapper ships and becomes the first writer).
- **Purge confirmation modal** — inline, with an in-progress and an error
  state if the callable fails.
- Loading/error states beyond "no data yet" were not built out — flagged
  as a possible follow-up if this proves flaky in practice.

## Edge cases
- [x] Linked doc was independently deleted before purge runs — `set()`
      with `merge: true` (not `update()`) so clearing its field doesn't
      throw on a missing document.
- [x] Cloudinary already deleted the file out-of-band — Cloudinary's API
      reports `not_found`, which we treat as success rather than blocking
      the Firestore cleanup.
- [ ] `scheduledAssetCleanup`'s per-rule Firestore query needs a composite
      index specific to that rule's `(collection, matchField, ageField)`
      triple. This can't be pre-declared generically — the first time a
      new rule shape runs, expect a `failed-precondition` in the function
      logs with a direct console link to create the index. Same one-time
      shape as the Eventarc propagation delay already noted in
      `custom-instructions.md`, not a real bug.
- [ ] Multiple `externalAssets` for the same `linkedDoc` (shouldn't happen
      in the current one-asset-per-doc model, but nothing enforces it) —
      the scheduled sweep purges all of them.

## Test checklist (staging)
- [ ] Non-admin member: page loads to the "admin only" message, no
      Firestore reads attempted.
- [ ] Admin-plan member, not signed in: sees the sign-in gate.
- [ ] Sign in with an allowlisted Google account: dashboard loads, empty
      state shows (no real `externalAssets` docs exist yet).
- [ ] Sign in with a non-allowlisted Google account: gate shows "not on
      the admin allowlist," no dashboard.
- [ ] Manually add a test doc to `externalAssets` (staging project) with
      a real-but-disposable Cloudinary asset behind it, confirm it
      appears in the table with correct age/size.
- [ ] Click Purge → confirm modal shows the right feature/linked doc →
      confirm → asset disappears from Cloudinary AND the `externalAssets`
      doc is gone AND `storageUsage/current` decremented.
- [ ] Add a cleanup rule via the UI, confirm it shows up with the toggle
      on; toggle off/on; delete it.
- [ ] Manually trigger `scheduledAssetCleanup` (Firebase console → Run
      now) against a test rule + a matching test doc, confirm it purges
      correctly and doesn't touch non-matching docs.

## Still needed before shipping
- Cloudinary account: cloud name, API key, API secret, set as Firebase
  secrets on **both** projects:
  ```
  firebase functions:secrets:set CLOUDINARY_CLOUD_NAME --project staging
  firebase functions:secrets:set CLOUDINARY_API_KEY --project staging
  firebase functions:secrets:set CLOUDINARY_API_SECRET --project staging
  # repeat with --project production
  ```
- The `disk-stash` Squarespace page itself (create it, note its page ID
  if anything beyond the embed needs it).
- Bug Zapper's actual field names, once it's built, need to line up with
  `linkedDoc.field` / the `cleanupRules` shape above — flag this when
  Bug Zapper's spec is written so its screenshot field name is chosen
  deliberately rather than retrofitted.
