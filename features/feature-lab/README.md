# Feature Lab

Members suggest ideas for the site or the stream, vote on their favorites instead
of just leaving a comment, and can track progress through to Shipped/Declined.
Admins triage: set status and priority, leave a note that shows up in the
request's history, and delete requests that don't belong.

Built on the shared `bt-ui` kit (`shared/bt-ui.css`, `shared/ui/*.js`) — see
`docs/design-system.md` for the component/token reference and `CLAUDE.md` for
the rules this feature follows. This feature's own CSS
(`feature-lab.css`) keeps only the animated flask/bubble wordmark icon;
everything else (layout, colors, buttons, forms, modals, badges) is shared.

## Who sees it

- **Logged out:** a branded "members-only" screen. No list, no form.
- **Any logged-in member** (any active Boomertanger membership — every
  signup includes the free Fan Club plan, so being logged in is the real
  gate): can see the full list, filter/sort it, vote ("me too" isn't a thing
  here — this is a plain upvote), open a request's detail view, read and post
  comments, and submit new requests.
- **Admins** (Google Sign-In, verified server-side against `adminAllowlist`
  via the `syncAdminStatus` Cloud Function — the client-side check is a UI
  convenience only): additionally get an admin-only panel inside the detail
  view to change status/priority and leave a history note, plus a delete
  button.

## Data model — `featureRequests/{requestId}`

| Field | Type | Set by |
|---|---|---|
| `title` | string | member, on create |
| `description` | string | member, on create |
| `status` | `submitted`\|`under_review`\|`planned`\|`in_progress`\|`shipped`\|`declined` | admin only |
| `priority` | `low`\|`medium`\|`high`\|`null` | admin only |
| `votes` | array of strings (MemberSpace member id, as a string) | members, one id added/removed at a time |
| `commentCount` | number | bumped by 1 whenever a comment is posted — kept as a plain field so the list view doesn't need to read every request's comments subcollection just to show a count |
| `requesterId` | string | MemberSpace `memberInfo.id`, `String()`-cast, set on create |
| `requesterName` | string | MemberSpace `memberInfo.name`, captured on create |
| `createdAt` / `updatedAt` | timestamp | server; `updatedAt` is bumped on every admin save |
| `statusHistory` | array of `{ status, changedBy, changedAt, note? }` | seeded with one `submitted` entry at creation, then appended via `arrayUnion` every time an admin clicks "Save changes" (one entry per save, using whatever status is currently selected, even if unchanged) |

### `featureRequests/{requestId}/comments/{commentId}` (subcollection)

Public — any logged-in member can read and post. Shape:
`{ text, authorId, authorName, isAdminAuthor, createdAt }`.

## Identity note

Votes key on `state.memberId` — MemberSpace's own numeric member id,
`String()`-cast before it's written to Firestore — **not** the Firebase Auth
uid that Bug Zapper's `meTooBy` uses. This is a deliberate, pre-existing
difference between the two features (not something this UI migration
touched): Bug Zapper's rules verify a `meTooBy` toggle against
`request.auth.uid` directly, which requires the real Firebase uid; Feature
Lab has no such rule, so it keeps using the MemberSpace id it always has.

## Known gaps / accepted tradeoffs

- **No rate limiting** on submissions or comments.
- **Cross-device voting**: voting keys on the MemberSpace member id (stable
  per member, not per browser), so this one is actually *not* subject to the
  same per-browser tradeoff Bug Zapper's anonymous-Auth-based "me too"
  accepts — a real member can't double-vote from a second device.
- **Deleting a request orphans its comments** — `comments` is a
  subcollection, and Firestore doesn't cascade-delete subcollections when
  the parent document is deleted. The confirm dialog says so.

## Staging embed snippet (feature-lab page, Code Block)

Per `docs/design-system.md` §1 ("Until then (staging)"), each staging Code
Block loads the shared kit and this feature's own files, in order, pinned to
one commit SHA so the page never silently picks up an unfinished change:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/boomertanger/website-features@<sha>/shared/bt-ui.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/boomertanger/website-features@<sha>/features/feature-lab/feature-lab.css">
<div id="feature-lab-root"></div>
<script type="module" src="https://cdn.jsdelivr.net/gh/boomertanger/website-features@<sha>/features/feature-lab/feature-lab.js"></script>
```

Replace `<sha>` in all three URLs with the current full commit SHA on `dev`
(`git rev-parse HEAD`, or the snippet printed after the last push to `dev` —
see `CLAUDE.md`'s "After every push to dev"). Swap it for a pinned release
tag (e.g. `@v2.0.0`) when promoting to production, per the repo's normal
release process. After the first release, this feature's Code Block will
only need its own two lines (`feature-lab.css` + `feature-lab.js`) — the
Inter font links and `shared/bt-ui.css` move to Squarespace Header Code
Injection, loaded once site-wide.

## Staging test checklist

- [ ] Logged out: branded "members-only" screen shows, no list/form reachable.
- [ ] Logged in (non-admin): list loads (skeleton rows appear briefly first),
      filters and sort chips work, vote toggles on/off and the count updates.
- [ ] Submit a request: validation errors show for a too-short title/description;
      a valid submission closes the dialog and the new request appears at the
      top of "Newest".
- [ ] Open a request's detail view: description, comments, and history all
      render; posting a comment appears live without a refresh.
- [ ] Admin (Google Sign-In via the top-bar control, both inline at wide
      widths and behind the dots menu at ≤ 640px): admin panel appears in the
      detail view; changing status/priority and saving updates the badge,
      the history list, and (for status) which filter the request now falls
      under.
- [ ] Admin delete: confirm dialog appears, "Deleting…" busy state shows and
      every control locks while it runs, the request disappears from the
      list on success.
- [ ] Sign out: admin controls disappear immediately; the page falls back to
      the normal member view without a refresh.
- [ ] Resize the Code Block (or the browser) through ~1024px, ~640px, and
      ~420px: rows restack, the admin controls collapse behind the dots menu,
      the top-bar button drops its text label and keeps its icon, nothing
      overlaps or clips.
- [ ] Simulate a load failure (e.g. block the Firestore request in devtools):
      the error empty-state shows instead of an infinite skeleton.
