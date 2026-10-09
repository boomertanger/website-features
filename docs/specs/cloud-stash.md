# Cloud Stash (port), confirmed spec

Workstream 10, one feature. Confirmed Oct 9, 2026. Mockups: `docs/design/mockups/cloud-stash.html` (approved: I1, S2, P2, F2, W1).

**What it is.** An admin tool page at `/admin/stash` for watching and safely cleaning up the site's external file storage (Cloudinary), plus a public How it works page at `/cloud-stash/how-it-works` ("What happens to your uploads").

**Ground rules.**
- Changes are additive. The legacy Squarespace page, its rules, functions and collections stay until launch.
- Nothing is ever deleted in Cloudinary outside `performAssetDeletion` and the approved sweeps.
- None of these carry over: MemberSpace, Code Blocks, the jsDelivr loader, anonymous sign-in, `adminAllowlist`, `admins/{uid}`, `syncAdminStatus`.
- Gating uses the real accounts and role claims. It is enforced in rules and functions.

**Depends on Bug Zapper.** The build runs only after Bug Zapper is pushed and deployed. It takes these from `docs/specs/bug-zapper.md` and the Bug Zapper code:
- the report collection path,
- the screenshot field,
- the closed statuses,
- the report link format,
- the screenshot upload-signature callable.

Parts marked **[BZ]** below depend on these.

## 1. Who can do what

| Action | Owner | A3 Right Hand | A2 Overseer | A1 Steward | Mods, members |
|---|---|---|---|---|---|
| Open `/admin/stash`, see everything, refresh usage, run a scan, dry-run a rule, open a private preview (logged) | ✓ | ✓ | ✓ | ✓ | – |
| Switch a rule **off** | ✓ | ✓ | ✓ | ✓ | – |
| Purge a file, bulk-purge orphans and stale files (≤ 50 at a time), add, edit, switch on or delete a rule, run the sweep now, change the pause point, pause or resume member uploads | ✓ | ✓ | ✓ | refused | – |
| Change the admin log retention; record and purge an untracked file | ✓ | – | – | – | – |
| Read `/cloud-stash/how-it-works` | everyone, visitors included | | | | |

The safety net is a server refusal, not a confirmation queue. This matches Planner, Control Room and Feature Lab. A1 sees the controls disabled with "Needs the owner or an Overseer."

Role checks reuse the shared `callerInfo` helper from the Bug Zapper build (owner, `hasSiteRole` admin, `crewGrade`).

## 2. Where it lives
- **`/admin/stash`** is the tool page. It is not in the header nav.
- **The `/admin` card** shows the status badge, the usage meter, the loose-end count, the last sweep and an "Open Cloud Stash" button. Night Watch later reuses the card as its tile.
- **`/cloud-stash/how-it-works`** is the public story page.
- **`/cloud-stash`** redirects admins to `/admin/stash` and everyone else to How it works.
- **Links to How it works** go on the Privacy page, the Account page, and Bug Zapper's and the Vault's upload dialogs.
- **Night Watch** later links to this page and shows the card. Cloud Stash is not a section of the hub.

## 3. Data

The top-level collections stay where they are: `externalAssets`, `storageUsage`, `cleanupRules`, `adminSettings`. The Vault, Fun Factory and the legacy page all use them already.

| Doc | Status | Fields |
|---|---|---|
| `externalAssets/{id}` | existing | Unchanged. The scan adds `scan { state: "linked" \| "orphan" \| "stale", at }`. Untracked purges first write a record with `feature: "untracked"` and `linkedDoc: null`, through a new `recordUntrackedAsset()` in `lib/externalAssets.js`. |
| `storageUsage/current` | existing | Adds `byFeature { <key>: { bytes, files } }` and `recountedAt`. The scan sets both from the records, which fixes increment drift. |
| `storageUsage/cloudinary` | new | `credits { used, limit, pct }`; `storage`, `bandwidth`, `transformations` (each `{ usage, credits }`); `plan`; `status` ("healthy" \| "paused" \| "over"); `uploads` ("open" \| "members-paused" \| "stopped"); `fetchedAt`; `failures` (consecutive failed fetches). The upload gate reads only this doc. |
| `storageUsage/scan` | new | `at`, `by`, `counts { orphan, stale, unrecorded, untracked }`, `untracked[]` (≤ 200: `publicId`, `type`, `bytes`, `createdAt`), `unrecorded[]` (≤ 200), `truncated`. |
| `storageUsage/sweep` | new | `lastRunAt`, `status` ("ok" \| "partial" \| "capped" \| "failed"), `purged`, `bytes`, `failures[]` (≤ 20), `perRule { <ruleId>: { purged, bytes } }`. |
| `cleanupRules/{id}` | existing | Adds `name`, `target` (allowlist key), `statuses[]`, `days`, `createdBy`, `updatedBy`, `updatedAt`, `lastRun { at, purged, bytes, failed }`. Legacy-shaped rules show read-only as "Legacy (Squarespace)". |
| `adminSettings/storage` | new | `pauseAtPct` (default 80, allowed 60–95), `manualPause` (bool), `manualPauseReason`, `runCap` (100). |
| `adminSettings/log` | existing | `retentionDays`, 90–730. A change applies to new entries only. |

**Usage numbers.** They come from Cloudinary's Admin API usage endpoint. The plan limit is read from that response, never hardcoded.

**Status thresholds:**
- **Healthy** below `pauseAtPct`.
- **Uploads paused** from `pauseAtPct` up to 100%.
- **Over limit** at 100% or more.

`manualPause` forces the paused state.

**Rate limits.** Refresh and Scan now are each allowed once per 10 minutes per site. They are tracked in `sites/boomertanger/rateLimits`.

## 4. Functions (`functions/lib/stash/*.js`, JavaScript)

**Shared helper `functions/lib/cloudinary.js`.** One copy holds the generic pieces: signing, the API call, the signed preview link, `cloudinaryDelete`, `usage()`, and `listResources({ type, prefix, max })`. Merge with whatever the Bug Zapper build already moved there. `lib/vault/cloudinary.js` keeps only cover-specific code and re-exports the rest. Secrets: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (already defined).

**Callables** (role per §1; every write is logged to adminLog `cloudStash`):

| Callable | Who | What it does |
|---|---|---|
| `stashUsageRefresh` | A1+ | Fetches usage, writes `storageUsage/cloudinary`. Rate-limited. |
| `stashScan` | A1+ | Rate-limited. Classifies every record: orphan (linked doc missing), stale (linked field no longer points at this record's URL), linked. Lists items that point at a URL with no record (unrecorded, report only). Lists Cloudinary resources (upload and authenticated types, cap 2,000) to find files with no record (untracked). Recounts `storageUsage/current`. |
| `stashPreview { assetId }` | A1+ | Private files only. Returns a 10-minute signed link. Logs `preview`. |
| `stashPurge { assetIds[] ≤ 50 }` | Owner, A2, A3 | Calls `performAssetDeletion` for each ID and returns a result per file. New-site replacement for `deleteExternalAsset`; the legacy callable stays. |
| `stashPurgeUntracked { publicId, type }` | Owner | `recordUntrackedAsset()`, then `performAssetDeletion`. |
| `stashRuleDryRun { rule }` | A1+ | Validates against the allowlist. Returns `{ count, bytes, examples[5] }`. |
| `stashRuleSave { op: create \| update \| toggle \| delete, rule, expectCount }` | Owner, A2, A3; A1 only toggle-off | Create, update and toggle-on re-run the count and refuse with `numbersChanged` if it differs from `expectCount`. Conflict check on `updatedAt`. |
| `stashSweepNow` | Owner, A2, A3 | Runs the same sweep code now. |
| `stashSettings { pauseAtPct?, manualPause?, reason?, retentionDays? }` | Owner, A2, A3; `retentionDays` owner only | Writes settings and recomputes `storageUsage/cloudinary.status` and `.uploads`. |

**Schedules:**
- `stashUsageDaily` at 05:15 America/Los_Angeles, after the growth collector.
- `stashScanWeekly` on Mondays at 05:30 America/Los_Angeles.

**Allowlist `lib/stash/targets.js`.** Each target declares the feature key, the collection, the match field, its allowed values, the age field, the screenshot field, and the composite index it needs. The editor only offers these shapes, and each target's index ships in `firestore.indexes.json`.

v1 has one target:
- **Bug Zapper screenshots** on reports in a closed status for at least N days, N between 14 and 730. **[BZ]** collection, fields and closed statuses come from `bug-zapper.md`.
- Vault covers and Fun Factory season art are **never** targets.
- Vault suggestions keep their own `vaultSweepPendingCovers`.

**Seed.** A disabled rule "Old bug screenshots" (60 days, all closed statuses) and `adminSettings/storage` defaults. The seed script is idempotent.

**`scheduledAssetCleanup`.** It keeps its schedule (09:00 LA) and gains:
- the allowlist check (legacy-shaped rules still run until launch),
- the per-run cap (`runCap`; status "capped" and an alert when reached),
- the run record in `storageUsage/sweep` and `lastRun` per rule,
- errors become alerts instead of being swallowed.

**`performAssetDeletion`:**
- Stop writing `asset_purged` to `activityLog`; adminLog stays the audit trail.
- Take the adminLog title from `title || name`.
- The order is unchanged: Cloudinary, then the linked field is cleared, then the record and usage, then the log. A Cloudinary `not_found` counts as success.

**`uploadGate(caller, kind)` in `lib/stash/gate.js`.** It is called first in every upload-signature callable: `vaultCoverSignature`, `vaultCoverSuggestSignature`, `factoryArtSignature`, and Bug Zapper's screenshot signature callable **[BZ]**.
- **Paused** (`members-paused`): member uploads are refused; staff uploads are allowed.
- **Stopped**: everything is refused except the owner.
- **Refusal:** `HttpsError("resource-exhausted", …, { reason: "uploadsPaused" })`. Member-facing message: "Uploads are paused for a bit. Try again later, or send it without a picture."
- **Fail open:** if the status doc is missing or more than 48 h old, uploads stay open (and the stale-usage alert fires).

## 5. Alerts

Alerts are `admin-health` items written to `notifyOutbox` with the existing writer helper. They are delivered once Boom Alerts ships. Until then they also show on the page and on the `/admin` card. At most one per kind per day.

| Kind | When it fires |
|---|---|
| `stash-sweep-failed` | A sweep run failed or partly failed. |
| `stash-sweep-capped` | A sweep run hit the per-run cap. |
| `stash-usage-80` | Usage crossed the pause point. Once per crossing per month. |
| `stash-usage-100` | Usage crossed 100%. Once per crossing per month. |
| `stash-usage-stale` | The usage fetch failed 2 days running. |
| `stash-loose-ends` | The weekly scan found more orphans or untracked files than last time. |

## 6. Logging
- **adminLog `cloudStash` actions:** `purge` (existing), `purge-untracked`, `preview`, `rule-save`, `rule-toggle`, `rule-delete`, `sweep-run`, `limits`, `pause`, `retention`. Every entry carries `expireAt` from `logExpireAt`.
- **Not logged:** scans and dry runs (read-only).
- **activityLog:** nothing. Cloud Stash writes no public feed events.

## 7. Rules and indexes (additive)
- **Reads** on `externalAssets`, `storageUsage`, `cleanupRules`, `adminSettings` and `adminLog`: `isAdmin() || isSiteOwner('boomertanger') || hasSiteRole('boomertanger', 'admin')`. Merge with Feature Lab's or Bug Zapper's `adminLog` change if it's already there.
- **Writes:** none from the new site. The legacy `isAdmin()` write on `cleanupRules` stays until launch.
- **Indexes:**
  - `adminLog` (`feature` asc, `createdAt` desc).
  - Each allowlisted target's composite index.
  - Any index `stashScan` or the sweep needs that doesn't already exist.
- **File list:** reads the newest 1,000 records (`createdAt` desc) and filters in the browser, so it needs no extra index.

## 8. Tool page `/admin/stash` (P2, S2 hero, F2 rows, I1 icon)

**Header and hero:**
- **Top bar:** CLOUD + accent STASH on `.bt-wordmark--power` with the **I1 Storm stash** icon. The old icon's three bars sit inside the cloud. On power-on, rain falls and the bars light gold one by one. On the right: a ghost How it works link and a Scan now button (admin green).
- **Hero:** `.bt-title` "Cloud Stash", one subtitle line, the status badge, "N% of this month's 25 credits" (the limit comes from Cloudinary) and the uploads line.
- **Hero scene S2:** a cloud raining into one gauge, with the gold pause mark and the mascot. It reacts to status: drizzle when healthy, heavier rain and a gold level when paused, a red spill when over the limit.
- **Banners:** `.bt-notice--warn` for Uploads paused, `.bt-notice--error` for Over limit.

**Tabs** (`.bt-seg-nav`, kept in `?tab=`):
- **Overview:**
  - This month's usage card: `.bt-meter--stack` split into storage, bandwidth and transformations, the pause marker, what's driving it, "From Cloudinary, N hours ago" and Refresh.
  - Loose ends card: orphans, stale and untracked counts. A count opens the filtered Files tab; untracked opens its dialog. Purge orphans and stale.
  - Recorded by feature card.
  - Last sweep card.
  - The newest 3 files.
- **Files:**
  - Filter chips: All, Orphans and stale, Due for the sweep, Private.
  - A feature select, a sort (Newest, Largest, Oldest) and a search.
  - **F2 rows** (`.bt-row--clickable`). Each row shows `.bt-file-thumb` (or the lock for private files), the linked item as the title (a link into its feature), the publicId, the feature, the kind and the age, then the size, a state badge, a preview icon and Purge.
  - 50 at a time.
- **Rules:**
  - Rules as plain sentences, each with a switch, Edit and its last run.
  - The legacy rule shows read-only.
  - The Last sweep and Limits and settings cards.
- **Activity:** the newest 20 `cloudStash` adminLog entries, plus the alert history.

**Dialogs** (`openModal` / `confirmAction` / `modalHeader`):
- **File details:** a private file shows "Show preview", then a 10-minute countdown; it also shows the item link, admin activity and Purge.
- **Purge one file:** "Purge this file?" with Purge file / Purging…
- **Purge orphans:** lists the files first.
- **Rule editor:** the target, closed-status chips **[BZ]**, the number of days and the plain sentence. Save stays locked until a dry run, and the "numbers changed" error appears if the count moved.
- **Limits and settings.**
- **Untracked files.**

**Celebratory moments:**
- The SWEPT stamp (`stampHtml`, lime) with a burst after a purge.
- "All clean" (mascot, sun, confetti once) when a scan finds nothing.
- A purged row falls away.

**States:** skeletons; "Nothing stashed yet" with the mascot; scanning; usage out of date; sweep capped; couldn't load; A1 view. Members are redirected to How it works; visitors get the sign-in dialog.

**Layout:** container queries only (`bt`; 1024, 640, 420); no `@media` for layout; reduced motion respected.

**Feature CSS:** `site/src/styles/cloud-stash.css`, prefix `cs-`. It holds only the icon, the hero scene, the How it works scenes and the page layout. Tokens only.

## 9. How it works `/cloud-stash/how-it-works` (public story page, full frame, W1)
- TocLayout rail.
- **Hero W1 "Into the cloud":** a screenshot, a cover and season art float up into a smiling cloud, with the mascot watching.
- **Chapters:**
  1. **What we store:** four stage cards with hover scenes (bug screenshots, game covers, cover suggestions, season art).
  2. **A file's journey:** five steps (`.ai-jr`, five columns).
  3. **Try it:** close a pretend bug, skip ahead 60 days, the screenshot is swept with the SWEPT stamp. Nothing is saved.
  4. **Who does what:** `.ai-flow` with You, The site, Boomertanger (mascot), Admins and The daily sweep.
  5. **How long we keep things:** `.bt-placard` titled "Kept until".
  6. **Our promises:** four cards.
  7. **Ask BOOMBOT:** five questions.
- **Closing CTA:** Report a bug, Suggest a cover.
- No limits or numbers appear on the page.
- **Copy** comes from the approved mockup. **[BZ]** check "60 days after the report is closed" against `bug-zapper.md`.
- **Unbuilt behaviour:** "Your uploads are deleted with your account, within 7 days" describes the planned account-deletion cleanup, which is on the launch checklist and not built yet. Ship the line only once that cleanup exists, or ask the owner.

## 10. Kit additions (`shared/bt-ui.css`, the UI kit page, design-system §5)
- `.bt-notice--warn` (gold) and the `.bt-notice--row` layout.
- `.bt-file-thumb` (+ `--locked`, `--lg`).
- `.bt-meter--stack` with `.bt-meter-seg` and `.bt-meter-keys`.

## 11. Not included
- Night Shift, Trophy Room, Gears: no hooks. No activity type, no badge, no Gears.
- Header nav: no entry.

## 12. Edge cases
- A file is purged elsewhere while it's on screen. The row disappears, and a purge of it returns "already gone" as success.
- Cloudinary already lost the file: `not_found` counts as success.
- The linked item was deleted first: the record becomes an orphan.
- A rule's numbers change between the dry run and the save: the save is refused with `numbersChanged`.
- The sweep reaches its cap: it stops and raises the capped alert.
- The usage API is down: the upload gate fails open and the stale alert fires.
- Two admins edit the same rule: `updatedAt` conflict.
- Retention change: applies to new entries only.
- More than 1,000 records: "Showing the newest 1,000".
- Scan finds more than 200 untracked files: "and N more" plus `truncated`.
- Legacy `disk-stash` preset files: they show as untracked; owner-only purge.

## 13. Docs to update when shipped
- **ROADMAP:** workstream 10, Cloud Stash done; the launch checklist gains account-deletion file cleanup and "retire the legacy Cloud Stash page, `deleteExternalAsset` and the legacy rules".
- **design-system:** §5 (kit pieces), §7 (migration mapping, now done), §8a (superseded: the new site gates on real roles), and a §8 recorded decision for the I1 icon and P2 layout.
- **CHANGELOG:** one line per part.
- **Project instructions:** propose the update.
