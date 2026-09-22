# Bug Zapper

Members report bugs with enough structured detail (steps to reproduce,
expected vs. actual, severity) to make them trackable and actionable.
Public list, logged-in-members-only (any active membership), "bit me
too" confirmations instead of upvotes, real admin controls for status /
priority / duplicate-linking. Visual design follows the Boomertanger
logo palette — see FRONTEND CONVENTIONS note below.

## Visual design — Boomertanger logo palette

This feature moved off the original single-red-accent look shared with
Feature Lab / Disk Stash, to match the real Boomertanger logo. Exact
values (pulled directly from the logo file, not eyeballed):

| Role | Hex | CSS var |
|---|---|---|
| Background | `#0F0F0F` | `--bz-bg` |
| Primary / interactive (buttons, links, focus states) | `#9146FF` | `--bz-primary` |
| Page title accent | `#FFA100` | `--bz-title` |
| Critical severity + admin danger states only | `#AE201B` | `--bz-accent` |
| Body text | `#F4F2EA` | `--bz-text` |
| Font (everywhere — display, body, and what used to be "mono" meta text) | Inter | — |

Status pill colors (blue/amber/green for Open/In progress/Fixed, etc.)
are functional UI state colors, not brand identity — they weren't
changed and don't need to match the logo.

**Next step, per the plan:** retrofit Feature Lab's and Disk Stash's
CSS to this same palette so all three features look consistent. This
table is the reference for that pass — no need to re-derive the colors.

## Files in this feature

- `bug-zapper.js` — client module, imported from the page's Code Block
- `bug-zapper.css` — stylesheet, same dark theme tokens as Feature Lab / Disk Stash
- `functions-addition.js` — paste into `functions/index.js` (see comments inside)
- `firestore-rules-addition.txt` — paste into `firestore.rules` (see comments inside)

## One-time setup before this goes live

1. **Cloudinary unsigned upload preset.** Cloud name is `nz4usqtz` (confirmed).
   In the Cloudinary dashboard, create an **unsigned** upload preset scoped to
   this use case: image-only, a server-side file-size cap, folder restricted
   to `bug-zapper/` if that's configurable. Put its name into
   `bug-zapper.js`'s `CLOUDINARY_UPLOAD_PRESET` constant (currently a
   placeholder — `REPLACE_ME_bug_zapper_unsigned`).
2. **Merge `functions-addition.js`** into `functions/index.js` — adds
   `recordBugScreenshot`, the only path allowed to set `screenshotUrl`.
3. **Merge `firestore-rules-addition.txt`** into `firestore.rules` — adds
   the `bugReports` collection rules, including the me-too toggle exception.
4. **Merge `functions-addition-delete.js`** into `functions/index.js` —
   adds `deleteBugReport`, which cleans up any attached screenshot via
   the same safe path Disk Stash's manual purge uses, then deletes the
   report itself.
5. **Apply `firestore-rules-delete-update.txt`** — removes bugReports'
   old `allow delete: if isAdmin();` line, so `deleteBugReport` becomes
   the only way to delete a report (a direct client delete would skip
   the Cloudinary cleanup step and orphan the asset).
6. **Apply `firestore-rules-comments-history.txt`** — five precise edits
   adding the private comments subcollection, the `isCommentCountBump`
   exception, and letting admin saves append to `statusHistory`.
7. **Deploy both, separately** — pushing to git alone doesn't update either;
   `firebase deploy --project <staging|production> --only firestore:rules`
   and the functions deploy are two separate steps, for both projects.
8. **Add a `cleanupRules` doc in Disk Stash** (after Bug Zapper has at least
   one real "Fixed" report with a screenshot to test against):
   ```json
   {
     "enabled": true,
     "feature": "bugZapper",
     "collection": "bugReports",
     "matchField": "status",
     "matchValue": "Fixed",
     "ageField": "statusChangedAt",
     "ageThresholdDays": 60
   }
   ```
   Expect Firestore's one-time "failed-precondition: requires an index" error
   the first time this specific rule shape runs — normal, just create the
   index via the link in the error and it'll work from then on.

## Squarespace embed (bug-zapper page, Code Block)

```html
<div id="bug-zapper-root"></div>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/boomertanger/website-features@dev/features/bug-zapper/bug-zapper.css">
<script type="module" src="https://cdn.jsdelivr.net/gh/boomertanger/website-features@dev/features/bug-zapper/bug-zapper.js"></script>
```

**Note:** earlier versions of this snippet were missing the Google Fonts
`<link>` entirely — `bug-zapper.css` declared `font-family: "Space
Grotesk"` etc. but nothing ever loaded them, so the page was silently
falling back to the browser's default sans-serif this whole time. Now
that the design has moved to Inter, this snippet actually loads it —
if you already have this embedded on the `bug-zapper` page, replace the
whole block, not just the two lines that reference the repo files.

Swap `@dev` for a pinned tag (e.g. `@v1.3.0`) when promoting to production,
per the repo's normal release process.

## Data model — `bugReports/{reportId}`

| Field | Type | Set by |
|---|---|---|
| `title` | string | member, on create |
| `page` | string | member, on create |
| `whatHappened` | string | member, on create |
| `expectedInstead` | string | member, on create |
| `stepsToReproduce` | string | member, on create |
| `severity` | `Cosmetic`\|`Minor`\|`Major`\|`Critical` | member, on create |
| `priority` | `Low`\|`Normal`\|`High`\|`Urgent`\|`null` | admin only |
| `status` | `Open`\|`In progress`\|`Fixed`\|`Won't fix`\|`Can't reproduce`\|`Duplicate` | admin only |
| `statusChangedAt` | timestamp | admin only, bumped only when `status` actually changes — Disk Stash's cleanup rule ages off this field |
| `duplicateOf` | string \| null | admin only |
| `screenshotUrl` | string \| null | **only** `recordBugScreenshot` (Admin SDK) or Disk Stash's safe-delete path — never a direct client write |
| `reporterUid` | string | member's Firebase Auth uid (anonymous or real), set on create |
| `reporterName` | string | MemberSpace `memberInfo.name`, captured on create |
| `meTooBy` | array of strings | members, one uid added/removed at a time (field name unchanged even though the UI now says "bit me too" — no schema/rules impact from the rename) |
| `commentCount` | number | bumped by 1 whenever a comment is posted (via the `isCommentCountBump` narrow rule exception) — kept as a plain field, not derived, so the list view doesn't need to read every report's comments subcollection just to show a count |
| `statusHistory` | array of `{ status, changedBy, changedAt, note? }` | admin only, appended via `arrayUnion` every time "Save changes" is clicked in the admin panel — one entry per save, using whatever status is currently selected (even if unchanged), same convention Feature Lab already uses |

### `bugReports/{reportId}/comments/{commentId}` (subcollection)

**Private** — readable and postable only by a real admin or that specific report's `reporterUid`, enforced in `firestore.rules` via a `get()` on the parent report doc, not just a client-side check. Nobody else can see this thread exists, including other members. Shape: `{ text, authorId, authorName, isAdminAuthor, createdAt }` — same as Feature Lab's public comments, just with a much narrower read/write rule.
| `createdAt` | timestamp | server, on create |

## Known gaps / accepted tradeoffs (flagging, not solving here)

- **Cross-device "me too"** — anonymous Firebase Auth is per-browser, so
  the same real member on two devices can register two "me too"s. Same
  tradeoff Feature Lab's voting already accepts.
- **No spam/rate limiting** on submissions.
- **No Alert Center hook yet** — a new bug report should eventually raise
  an Alert Center item (not an `activityLog` event); nothing to wire up
  until Alert Center exists. Screenshot upload failures are a candidate
  for a future "feature-error" alert too, once that exists.
