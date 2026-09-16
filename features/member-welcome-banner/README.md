# Feature: member-welcome-banner

## Goal
Prove the staging-to-production pipeline works end to end with a trivial
Memberspace-gated banner. No Firebase, no design polish.

## Who sees it
Everyone — the message and color change based on Memberspace login state.

## Where it lives
Any Squarespace page with `<div id="member-welcome-banner"></div>` placed in
a code block. `feature.js` finds that div and fills it in.

## Data model
None — no Firestore/Firebase involved.

## Gating logic
`isLoggedIn()` from `shared/memberspace-helper.js` only. No plan-specific
check is needed: every signed-in visitor has at least the free "fan club"
plan, so there's no meaningful "logged in but no active plan" state to
handle separately.

## UI states
1. **Logged in** — light green box, text: `Welcome back, member! 👋`
2. **Logged out** — light gray box, text: `Log in to see member-only content`

There's no separate loading state shown to the visitor; the script waits
briefly for Memberspace to initialize (see edge cases) before rendering
either state.

## Edge cases
- [ ] `#member-welcome-banner` div not found on the page → script no-ops silently
- [ ] Script runs before DOM is ready → guarded with `DOMContentLoaded`
- [ ] `window.MemberSpace.ready` not yet true when script runs (async load) →
      poll every ~200ms for up to ~3s; if it never becomes ready, render the
      logged-out box
- [ ] Multiple divs share the id → only the first match (`getElementById`) is filled

## Test checklist (staging)
- [ ] Logged out: gray box with correct text renders
- [ ] Logged in: green box with correct text renders
- [ ] Div missing from page: no JS errors in console
- [ ] Confirmed via the `@dev` jsDelivr staging script tag before tagging a release
