# Bug Zapper

Members report bugs with enough structured detail (steps to reproduce,
expected vs. actual, severity) to make them trackable and actionable.
Public list, logged-in-members-only (any active membership), "me too"
confirmations instead of upvotes, real admin controls for status /
priority / duplicate-linking.

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
4. **Deploy both, separately** — pushing to git alone doesn't update either;
   `firebase deploy --project <staging|production> --only firestore:rules`
   and the functions deploy are two separate steps, for both projects.
5. **Add a `cleanupRules` doc in Disk Stash** (after Bug Zapper has at least
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
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/boomertanger/website-features@dev/features/bug-zapper/bug-zapper.css">
<script type="module" src="https://cdn.jsdelivr.net/gh/boomertanger/website-features@dev/features/bug-zapper/bug-zapper.js"></script>
```

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
| `meTooBy` | array of strings | members, one uid added/removed at a time |
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
