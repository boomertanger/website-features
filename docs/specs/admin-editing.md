# Spec: Admin editing (Bug Zapper + Feature Lab) — CONFIRMED

## What it does
Admins can fix the content of any bug report or feature request in place
(typos, vague titles, wrong page, bad screenshot). Every edit is recorded in
the new `adminLog` from day one. Members see "Edited by an admin on DATE",
never which admin.

## Gating
- Members: normal detail view + the edited note when `editedAt` is set.
- Admins (Google sign-in, allowlisted): Edit button in the detail header;
  "Admin activity" in the admin panel.
- Real protection: edits happen only through the `adminEditItem` callable
  (checks `admins/{uid}`). Firestore rules block content-field changes from
  the browser for everyone, admins included, so no edit can skip the log.

## Editable fields
| Feature | Fields |
|---|---|
| Bug Zapper | title, what happened (description), page, steps to reproduce, screenshot (replace or remove) |
| Feature Lab | title, what should it do (description), page |
Status (and severity/priority if admin-set today) stays in the admin panel.
Each field keeps the create form's length limits.

## Data model
Item doc gains: `editedAt` (timestamp), `editCount` (number).

`adminLog/{id}` — Cloud-Function-only writes, admin-only reads:
```
{
  feature: "bugZapper" | "featureLab" | "diskStash",
  action: "edit" | "delete" | "purge",
  itemPath: "bugReports/abc123",
  itemTitle: string,                      // snapshot at time of action
  actorUid: string | null,                // null for automatic actions
  actorName: string,                      // admin's Google name, or "Automatic"
  reason: string,                         // optional, max 300 chars
  changes: { field: { before, after } },  // edits only; long text capped at 2,000 chars each
  snapshot: { title, text fields },       // deletes only
  createdAt: timestamp,
  expireAt: timestamp                     // createdAt + retentionDays (TTL)
}
```
Retention: `adminSettings/log` { retentionDays }, default 365 if missing.

## Server
`adminEditItem({ feature, id, changes, before, reason })` — one generic
callable with a per-feature allowlist of editable fields:
1. Verify admin.
2. Validate each changed field (allowlist + create-rule limits).
3. Conflict check: `before` = values the client loaded; if any edited field
   differs on the server now, reject ("This was changed while you were
   editing").
4. Transaction: update fields, set `editedAt`, increment `editCount`, write
   the adminLog entry.
5. No-op if nothing actually changed.

Screenshot (Bug Zapper): upload to Cloudinary only on Save (picking a file
shows a local preview only). Function records the new asset
(recordAssetCreated) first, then updates the report, then removes the old
asset via performAssetDeletion. If the update fails, it deletes the new
asset. Remove = performAssetDeletion on the old asset + clear the field.

Logging added to existing functions: deleteBugReport / deleteFeatureRequest
log "delete" with a text snapshot; manual purges log with the admin name;
scheduledAssetCleanup logs as "Automatic".

Rules: adminLog admin-read, no client writes. Content fields on reports and
requests unchangeable from the browser. Status updates unchanged.

## UI states
1. Member view (+ edited note).
2. Admin view: Edit button (pencil, icon-only on phones); admin panel adds
   Admin activity (skeleton / "No admin activity yet." / list).
3. Edit mode in the same dialog (see design-system.md "Admin edit mode").
4. Inline validation errors under fields.
5. Conflict: explain, offer "Load latest"; keep typed text visible.
6. Unsaved changes guard on Escape / outside click / × / Cancel.
7. After save: back to view mode with new content; new activity entry.
8. Item deleted meanwhile: "This item no longer exists", dialog closes.

## Firebase setup to flag
- TTL policy per project: Firestore → Time-to-live → collection group
  `adminLog`, field `expireAt`.
- Composite index for Admin activity (itemPath + createdAt desc): expect a
  first-run console link.

## Out of scope
Member self-editing (needs identity bridge), comment editing/deleting,
status and cleanup-rule change logging (Night Watch spec), the Night Watch
page, archive instead of delete.
