# Bug Zapper

Members report bugs with enough structured detail (steps to reproduce,
expected vs. actual, severity) to make them trackable and actionable.
Public list, logged-in-members-only (any active membership), "bit me
too" confirmations instead of upvotes, real admin controls for status /
priority / duplicate-linking. Visual design follows the Boomertanger
logo palette — see FRONTEND CONVENTIONS note below.

## Visual design

Built on the shared `bt-ui` kit (`shared/bt-ui.css`, `shared/ui/*.js`) — see
`docs/design-system.md` for the full token/component reference and
`CLAUDE.md` for the rules this feature follows. The Boomertanger logo
palette (near-black ground, purple primary, gold titles, red reserved for
Critical severity and admin-danger states) now lives once in the shared kit
and applies to every feature, including Feature Lab and Disk Stash — this
feature's own `bug-zapper.css` keeps only what's genuinely unique to it: the
animated bolt/debris wordmark icon (one feature custom property, `--bz-bolt`,
for the bolt's yellow) and the two dialog-only pieces (the screenshot
dropzone, the "bit me too" row).

## Files in this feature

- `bug-zapper.js` — client module, imported from the page's Code Block
- `bug-zapper.css` — feature-specific styling only; everything shared lives in `shared/bt-ui.css`
- `functions-addition.js` — paste into `functions/index.js` (see comments inside)
- `firestore-rules-addition.txt` — paste into `firestore.rules` (see comments inside)

## One-time setup before this goes live

1. **Cloudinary unsigned upload preset.** Done: cloud `nz4usqtz`, unsigned
   preset `disk-stash`, uploads go to the `bug-zapper` folder
   (`CLOUDINARY_UPLOAD_PRESET` in `bug-zapper.js`). Until it was set, the
   constant held a placeholder, so every screenshot upload failed with
   "Upload preset not found" while the report itself still saved.
   Screenshots upload at full resolution (the original file, unless its
   longest side is over 3840px; up to 10 MB), so the preset must not have
   an incoming transformation that downsizes or recompresses them, and its
   max file size must allow 10 MB.
2. **Merge `functions-addition.js`** into `functions/index.js` — adds
   `recordBugScreenshot`, the only path allowed to set `screenshotUrl`.
3. **Merge `firestore-rules-addition.txt`** into `firestore.rules` — adds
   the `bugReports` collection rules, including the me-too toggle exception.
4. **Merge `functions-addition-delete.js`** into `functions/index.js` —
   adds `deleteBugReport`, which cleans up any attached screenshot via
   the same safe path Disk Stash's manual purge uses, then deletes the
   report and all its subcollections (`recursiveDelete`) plus any
   `activityLog` events tagged `feature: "bug-zapper"` + `reportId`
   (none exist today). Disk Stash's `asset_purged` event for the
   screenshot is kept as the purge audit trail.
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

## Embed snippets (bug-zapper page, Code Block)

**Staging** uses the staging loader from `docs/design-system.md` §1: it
looks up the newest `dev` commit on every page load and loads this
feature's files pinned to it, so the Code Block never needs editing after
a push (hard-refresh to pick up a new commit; the corner badge shows which
commit is running). Paste the template from §1 with:

- `FEATURE_CSS` → `features/bug-zapper/bug-zapper.css`
- `FEATURE_JS` → `features/bug-zapper/bug-zapper.js`
- `ROOT_ID` → `bug-zapper-root`

Filled in:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<div id="bug-zapper-root"></div>
<script type="module">
  // Boomertanger staging loader: always runs the newest dev commit.
  const REPO = "boomertanger/website-features";
  const CSS = ["shared/bt-ui.css", "features/bug-zapper/bug-zapper.css"];
  const JS = "features/bug-zapper/bug-zapper.js";
  let sha = "dev", note = "fallback";
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/commits/dev`, { headers: { Accept: "application/vnd.github.sha" }, cache: "no-store" });
    if (r.ok) { sha = (await r.text()).trim(); note = ""; }
  } catch (e) {}
  const base = `https://cdn.jsdelivr.net/gh/${REPO}@${sha}/`;
  await Promise.all(CSS.map((f) => new Promise((res) => {
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = base + f;
    l.onload = l.onerror = res; document.head.appendChild(l);
  })));
  await import(base + JS);
  const b = document.createElement("div");
  b.textContent = `staging @${sha.slice(0, 7)}${note ? " (" + note + ")" : ""}`;
  b.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:2147483647;font:600 11px/1 system-ui,sans-serif;padding:5px 8px;border-radius:6px;background:#1e1a1d;color:#a89a9c;border:1px solid #332b2e;pointer-events:none";
  document.body.appendChild(b);
  console.info("[bt staging] loaded", sha);
</script>
```

**Production** uses plain `@1` URLs (no loader, no GitHub lookup). The
Inter font links and `shared/bt-ui.css@1` load once site-wide from
Squarespace Header Code Injection, so the Code Block is just:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/boomertanger/website-features@1/features/bug-zapper/bug-zapper.css">
<div id="bug-zapper-root"></div>
<script type="module" src="https://cdn.jsdelivr.net/gh/boomertanger/website-features@1/features/bug-zapper/bug-zapper.js"></script>
```

## Data model — `bugReports/{reportId}`

| Field | Type | Set by |
|---|---|---|
| `title` | string | member, on create; admins can correct it via `adminEditItem` |
| `page` | string (free text, 1–300 chars; older reports hold the former dropdown values) | member, on create; admins can correct it via `adminEditItem` |
| `whatHappened` | string | member, on create; admins can correct it via `adminEditItem` |
| `expectedInstead` | string | member, on create; admins can correct it via `adminEditItem` |
| `stepsToReproduce` | string | member, on create; admins can correct it via `adminEditItem` |
| `severity` | `Cosmetic`\|`Minor`\|`Major`\|`Critical` | member, on create; admins can correct it via `adminEditItem` |
| `priority` | `Low`\|`Normal`\|`High`\|`Urgent`\|`null` | admin only |
| `status` | `Open`\|`In progress`\|`Fixed`\|`Won't fix`\|`Can't reproduce`\|`Duplicate` | admin only |
| `statusChangedAt` | timestamp | admin only, bumped only when `status` actually changes — Disk Stash's cleanup rule ages off this field |
| `duplicateOf` | string \| null | admin only |
| `screenshotUrl` | string \| null (missing after a Disk Stash purge) | **only** `recordBugScreenshot`, `adminEditItem` (replace/remove) or Disk Stash's safe-delete path (all Admin SDK) — never a direct client write |
| `reporterUid` | string | member's Firebase Auth uid (anonymous or real), set on create |
| `reporterName` | string | MemberSpace `memberInfo.name`, captured on create |
| `meTooBy` | array of strings | members, one uid added/removed at a time (field name unchanged even though the UI now says "bit me too" — no schema/rules impact from the rename) |
| `commentCount` | number | bumped by 1 whenever a comment is posted (via the `isCommentCountBump` narrow rule exception) — kept as a plain field, not derived, so the list view doesn't need to read every report's comments subcollection just to show a count |
| `statusHistory` | array of `{ status, changedBy, changedAt, note? }` | seeded with one opening entry (`status: "Open"`) at report creation, so the History timeline always shows when a bug was first opened — then appended via `arrayUnion` only when an admin saves a real status change (one entry, carrying the optional note). `firestore.rules` (`isConsistentStatusChange`) rejects a history entry without a status change |
| `editedAt` / `editCount` | timestamp / number | **only** `adminEditItem`; never settable from a browser. `editedAt` drives the public "Edited by an admin on DATE" note |

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
