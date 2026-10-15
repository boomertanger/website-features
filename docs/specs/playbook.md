# Spec: The Playbook — CONFIRMED (2026-10-15)

Owner-only living reference pages that hold the plan: strategy, assumptions, open questions and
decisions, one page per service or plan, reviewed monthly through a Claude chat. **All Playbook text
lives in Firestore, never in this repo.** The approved mockup (mockup 2) is published privately and is
not committed, because nearly every line of it is private strategy; a local reference copy lives in
the gitignored `functions/scripts/data/playbook-mockup.html`.

Out of scope for v1: sharing pages with admins, image uploads, a visual block editor, email
reminders (they arrive with Boom Alerts).

## 1. Who sees what
| Who | Access |
|---|---|
| Owner | Everything: read, edit, review, apply updates |
| Everyone else, admins included | Nothing: no nav link, no /admin card, rules deny reads |

The page shows "Sharing unlocks after your first read-through"; the sharing itself is a later phase.

## 2. Pages and routes
- `/admin/playbook`: the Overview (hanging-light hero, review bar, then the overview page body), the
  page chips, and the pages grid.
- `/admin/playbook?page=<id>` opens a page; `#ch-<slug>` jumps to a chapter.
- Pages come from the seed (ids: overview, award, engine, granny, features, studio, tang, pulse,
  proof, games, flags). The `flags` page renders every flag with filters plus the decisions log.
- Owner-only card on /admin: first read-through progress ("4 of 10 pages reviewed") or pages due
  ("3 pages due since Nov 1"); opens the Playbook.

## 3. Page format
Each page is one **Markdown document** (`body`). `##` headings become ghost-numbered chapters
(`.bt-chapter--ghost`) with the TocLayout rail; `###` are sub-headings. Fenced blocks render kit
visuals; each line is `|`-separated:

| Block | Renders as | Line format |
|---|---|---|
| ` ```cards ` | Card grid | `icon \| title \| text` |
| ` ```steps ` | Journey line | `icon \| title \| text` |
| ` ```tiers ` | Tier columns | `## Title` then `- item` lines |
| ` ```ladder ` | Ladder rungs | `n \| title \| text [\| now]` |
| ` ```rules ` | `.bt-placard` house rules | `title \| text` |
| ` ```flow ` | The "how it fits" diagram | `icon \| title \| text [\| goal]` |
| Normal Markdown | Prose, lists, tables (`.bt-table`), bold, links | — |

Raw HTML is never rendered (sanitized). The renderer is `marked` plus `DOMPurify` (both pinned to exact
versions, browser only, decided Oct 15, 2026), with these rules on top: raw HTML is printed as escaped text, links
only for `https:`, `http:`, `mailto:`, site paths and `#anchors`, images off, and the fenced blocks drawn by the
Playbook's own renderers. The renderer appends a final "What we assumed" chapter with
the page's flags (none on the `flags` page itself). A page's `mockupUrl`, if set, shows a "See the
mockup" link. Illustrated mockups are not rebuilt inside the Playbook.

## 4. Data model (`sites/boomertanger/playbook/main/`)
| Path | Holds |
|---|---|
| `main` (doc) | `firstReadDone`, `firstReadDoneAt`, `reviewDay: 1`, `seedVersion` |
| `pages/{pageId}` | `title`, `nav`, `icon`, `order`, `service`, `status` (new, planned, building, idea, null), `lede`, `body`, `version`, `updatedAt`, `lastReviewedAt`, `mockupUrl?`, `editedOnSite` |
| `pages/{pageId}/versions/{n}` | Earlier `title`, `lede`, `body`, with `savedAt` and `source` (edit, update, seed, restore) |
| `flags/{flagId}` | `pageId`, `status` (assumed, open, confirmed), `text` (Markdown, one paragraph), `answer?`, `order`, `createdAt`, `settledAt?` |
| `decisions/{id}` | `date` (YYYY-MM-DD), `text`, `pageId?`, `flagId?`, `order` |
| `state/current` (doc) | `dueCount`, `duePages[]`, `dueSince` (scheduler) |

- Rules: owner reads everything; no client writes.
- Callable `playbookAdmin` (owner only): `savePage` (pinned to `version`; stale edits refused),
  `flagAction` (confirm, answer, edit, add, remove), `markReviewed`, `applyUpdate`,
  `restoreVersion`. adminLog feature `playbook`, ids only, never page text.
- Scheduler `playbookReviewTick` (1st of the month, 06:00 America/Los_Angeles): once
  `firstReadDone`, every page with `lastReviewedAt` before this month is due; writes `state`; writes
  notifyOutbox `playbook-review` with `audience: "uids"`, `uids: [ownerUid]` (the owner, the way Hotline Boom
  reaches the owner; Boom Alerts has no `owner` audience), no text.
- Confirm adds a decision; Answer saves the answer, marks the flag confirmed and adds a decision.

## 5. The monthly review
1. Reminder on the 1st: the /admin card (and the bell once Boom Alerts exists).
2. **Copy review prompt** (built in the browser): date and due pages; "What changed" since the
   last review (a Traffic Pulse summary from its rollups: visitors, new members, top movers, open
   alerts; and decisions added since); every open or assumed flag on those pages; each due page's
   Markdown; instructions: ask about open items one at a time, then return one `playbook-update`
   block, and a Claude Code prompt only if something built has to change.
3. **Apply an update:** paste the reply; the page finds the ` ```playbook-update ` JSON block,
   validates it, and shows a side-by-side preview (page diffs, flag changes, new decisions). Save
   applies everything in one transaction, versioning every changed page. If a page changed since the
   prompt was copied, it warns before saving.

```json
{ "playbookUpdate": 1,
  "pages": [{ "id": "engine", "title": "…", "lede": "…", "body": "…full Markdown…", "markReviewed": true }],
  "flags": [{ "op": "confirm", "id": "f-…" }, { "op": "answer", "id": "f-…", "answer": "…" },
            { "op": "add", "pageId": "games", "status": "open", "text": "…" }],
  "decisions": [{ "text": "…", "pageId": "tang" }] }
```

## 6. Other actions
- First read-through: "Start with the next page" opens the first unreviewed page; Mark reviewed on
  each fills the bar; when all are reviewed, `firstReadDone` is set (small celebration on the bar)
  and monthly reviews begin.
- Copy for Claude on any page copies that page the same way.
- Edit: wide `openModal`, Markdown left, live preview right; saving makes a version.
- History: a page's versions, with Restore (restoring also makes a version).

## 7. Seed, export, repo safety
- `functions/scripts/data/playbook.json` (gitignored): pages, flags, decisions.
- `functions/scripts/seed-playbook.js`: dry run unless `--apply`; staging first; never overwrites a
  page with `editedOnSite: true` unless `--force`; flags and decisions are upserted by id.
- `functions/scripts/export-playbook.js`: writes the live Playbook back to the gitignored file
  (used at launch: export from staging, seed production).
- The repo holds code, this spec and nothing else of the Playbook.

## 8. UI and states
- Overview hero: the hanging light (a lamp on a cord swings over a small open book; its beam and
  pool of light move with it; the bulb flickers now and then; reduced motion: it hangs still).
  Light color declared once in the feature CSS: `--pb-lamp: #ffcb78`.
- Page chips with a blue dot on pages that have open questions; a review header on every page
  (last reviewed, how many still to settle, Copy for Claude, Edit, History, Mark reviewed).
- Kit used: TocLayout, `.bt-chapter--ghost`, `.bt-placard`, `.bt-meter`, `.bt-badge`, `.bt-chip`,
  `.bt-table`, `openModal`, toasts, `.bt-empty`. No new kit pieces (the flag row is feature CSS).
- States: loading skeleton; not seeded ("The Playbook is empty. Run the seed."); invalid update
  (plain-words reason, nothing saved); stale edit ("This page changed since you opened it",
  Reload); "Nothing open on this page."
- Phones: the rail becomes chips; flags stack.

## 9. Edge cases
No update block in a pasted reply (say so); unknown page id in an update (refused); removing a flag
needs a confirmation; two tabs (version pin protects); long pages are fine.

## 10. Service Hub and Traffic Pulse
Manifest `services/playbook.json` (area admin, talkBack skip), marked so it never appears on the
members' /services list. Traffic Pulse doesn't count staff visits.

## 11. Launch
Rules, `playbookAdmin` and `playbookReviewTick` to production; export from staging; seed production
(dry run, then `--apply`). Used on staging until then.
