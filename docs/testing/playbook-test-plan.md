# The Playbook test plan

Hand-run checks for The Playbook on staging (`docs/specs/playbook.md`). The automated checks cover the server: `npm run check` in `functions/` runs `scripts/check-playbook.js`. It checks owner only, a stale save refused, versions on every save, update and restore, Confirm and Answer adding decisions, applyUpdate in one transaction (stale refused unless forced, unknown ids refused), the review tick and its reminder, adminLog with ids only, and that nothing outside `lib/playbook` is loaded.

This plan never quotes Playbook text. Where a step needs words, it uses made-up ones; the real pages are read on staging.

**Accounts:** the **owner**, an **admin** (for example @gbo), and signed out. **Preview:** `/admin/playbook?as=owner` without signing in shows made-up sample data (non-production only).

## A. Who sees it
1. Signed out: "Owner only" and Sign in. Signed in as an admin: "Owner only", no Playbook. The /admin page has no Playbook card for the admin.
2. As the admin, from the browser console, reading `sites/boomertanger/playbook/main/pages/overview` is denied. As the owner it's allowed. Nobody can write.
3. The owner's /admin card reads "N of M pages reviewed" during the first read-through and opens the Playbook. /services never lists the Playbook.

## B. Seed
4. `node functions/scripts/seed-playbook.js` (dry run) prints counts only: pages, flags, decisions, and what's new, updated or skipped. Nothing is written.
5. `--apply` writes it. The Playbook opens on the Overview. Running the dry run again says everything is unchanged.
6. Edit a page on the site, then run the dry run: that page shows as skipped (edited on the site). `--force` would overwrite it, keeping the old text in History.
7. `--project` with anything but staging or prod is refused. A `--file` outside the gitignored names is refused.

## C. The Overview
8. The hero: a lamp swings over an open book, its beam and pool of light move with it, the bulb flickers now and then, and the mascot watches. With reduced motion on, it hangs still.
9. The page chips: every page, with a blue dot on pages that have open questions. The stat tiles count pages, assumptions and open questions.
10. The review bar during the first read-through: "0 of N pages reviewed", a meter, **Start with the next page** (opens the first unreviewed page), Copy review prompt, Apply an update.

## D. A page
11. The review header: last reviewed, how many still to settle, Copy for Claude, Edit, History, Mark reviewed, and See the mockup when the page has one.
12. Chapters: every `##` heading is a ghost-numbered chapter with the rail; the rail follows the scroll. `?page=<id>#ch-<slug>` lands on that chapter. The fenced blocks draw as cards, the journey line, tiers, ladder rungs (one marked Now), the house rules placard and the flow (one marked as the goal). Tables use the kit table.
13. "What we assumed" ends every page but the flags page. Each flag shows its status (open blue, assumed gold, confirmed lime). **Confirm** settles it and adds a decision. **Answer** opens a dialog, saves the answer, confirms the flag and adds a decision. With every flag settled, the chapter says "Nothing open on this page."
14. **Mark reviewed** fills the bar. When the last page is reviewed, the bar celebrates once ("First read / Done") and the toast says monthly reviews start on the 1st.

## E. Edit and History
15. **Edit** opens a wide dialog: Markdown on the left, a live preview on the right. Save makes a new version. Typing raw HTML (for example a made-up `<b>` tag) shows it as text, never as markup.
16. Two tabs: save the same page in both. The second says "This page changed since you opened it" with Reload.
17. **History** lists the versions with their source (edit, update, seed, restore). Preview shows one. **Restore** asks first, then puts it back, and the replaced text becomes a version too.

## F. The monthly review
18. **Copy review prompt** copies one prompt: the date, the pages due (during the first read-through, the unreviewed ones), a Traffic Pulse summary (visitors, new members, top movers, open alerts), decisions added since the last review, the open and assumed flags on those pages, each page's Markdown, and the reply format.
19. Paste a made-up reply into **Apply an update**:
    - Text with no block: "No update block in that reply."
    - A block that isn't JSON: the reason, and nothing is saved.
    - An unknown page id: refused in plain words.
    - A valid block: a side-by-side preview (now and after), line counts, flag changes and new decisions. Save applies everything at once and makes a version of each changed page.
20. Copy the prompt, then edit one of its pages, then apply an update for that page: a warning names it, and the button reads Save anyway.
21. **Copy for Claude** on any page copies just that page in the same format.

## G. The flags page
22. Every flag, filtered by status (To settle, Open, Assumed, Confirmed, All) and by page. Edit changes a flag's text. Remove asks first. The decisions log lists every decision, newest first, with a link to its page.

## H. Phones (390 px)
23. The rail becomes chips, flags stack, the review bar's buttons wrap under the text, and nothing scrolls sideways (the tables scroll inside their own box).

## I. The schedule
24. Cloud Scheduler has `playbookReviewTick` (the 1st, 06:00 America/Los_Angeles). Run it once from the console after the first read-through: `state/current` lists the pages not reviewed this month, the /admin card says "N pages due since …", and `notifyOutbox/playbook-review-<date>` exists with `audience: "uids"`, the owner's uid and a count only (no text).
