# Feature: site-nav-login

## Goal
Add a "LOG IN" link to the site nav that's visible to logged-out visitors
and hides itself automatically once MemberSpace detects a logged-in member.
Replaces two raw scripts previously pasted directly into Squarespace's
Footer Code Injection — same behavior, now version-controlled.

## Who sees it
Logged-out visitors only, on both desktop and mobile nav.

## Where it lives
Site-wide, via Squarespace's **Footer Code Injection** — not a page-level
code block like other features. Applies to every page. `feature.js` has no
imports, so a plain `<script src="...feature.js"></script>` tag works
(`type="module"` isn't required, but doesn't hurt if used for consistency
with other features).

## Data model
None — no Firestore/Firebase involved.

## Gating logic
None in JS. The link carries `data-ms-hide-when-logged-in`, which
MemberSpace's own script watches and uses to hide the element once it
detects a logged-in visitor.

## UI states
1. **Logged out** — "LOG IN" link appears in both the desktop
   (`.header-actions--right`) and mobile (`.header-menu-nav-folder-content`)
   nav, linking to `https://boomertanger.com?msopen=/member/sign_in`.
   - Desktop: a bare `<a class="boomertanger-login">` appended directly to
     `.header-actions--right`.
   - Mobile: matches the old script's markup, inserted as the first child
     of `.header-menu-nav-folder-content`:
     ```html
     <div class="container header-menu-nav-item header-menu-nav-item--collection">
       <a class="boomertanger-login" data-ms-hide-when-logged-in rel="nofollow">
         <div class="header-menu-nav-item-content">LOG IN</div>
       </a>
     </div>
     ```
2. **Logged in** — link is hidden by MemberSpace.

Left out for now: a "Members" dashboard button/link — to be added later as
a separate change.

## Edge cases
- [ ] `.header-actions--right` or `.header-menu-nav-folder-content` not
      found on a given page/template → that target is skipped silently
- [ ] Script runs before DOM is ready → guarded with `DOMContentLoaded`,
      same pattern as `member-welcome-banner`
- [ ] Script re-runs on the same page (e.g. Squarespace AJAX nav) → guarded
      against double-inject by checking for an existing `.boomertanger-login`
      in the target container first
- [ ] The link uses class `boomertanger-login`, matching the class name the
      old inline scripts used, so existing Custom CSS in Squarespace's
      Design settings continues to apply with no changes needed there

## Test checklist (staging)
- [ ] Logged out: "LOG IN" link appears in desktop nav, links to the
      correct MemberSpace sign-in URL
- [ ] Logged out: "LOG IN" link appears in mobile nav
- [ ] Logged in: link is hidden in both desktop and mobile nav
- [ ] No JS errors in console on pages without a matching nav container
- [ ] Confirmed via the `@dev` jsDelivr staging script tag before tagging a release
