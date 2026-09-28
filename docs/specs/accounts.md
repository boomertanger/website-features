# Accounts (milestone 2) — spec

Status: approved. Builds foundation spec steps 3–7 (site settings and owner, sign-in, signup, profiles, roles, Twitch). Visual source of truth: `docs/design/mockups/accounts.html` (S2 sign-in dialog, A2 account page; defaults). Data model, privacy and security rules come from `docs/specs/foundation.md`; this file records the build decisions.

## Scope
In: Google, email + password, email link, Twitch sign-in; signup (birthday, handle, terms); email verification banner; profiles and unique handles; account page (A2 tabs: Profile, Linked accounts, Sign-in methods, Privacy, Your data); header account states; roles as custom claims; owner setup; site settings document; Twitch account linking and unlinking.
Later (milestone 2b): data export, account deletion (screens exist in the mockup; buttons show "coming soon"), App Check, admin member view UI, YouTube linking (needs Google OAuth verification; shows "coming soon"), TikTok ("coming soon"), Apple sign-in.

## Screens (see mockup)
1. Sign-in dialog, E1 (`docs/design/mockups/email-flows.html`) in the S2 split layout (art panel unchanged; phones: the art banner with the splat and mascot over the wordmark, then the form, same order as desktop). It opens in a mode: every "Join free" button opens the Join tab, "Log in" opens the Sign in tab. A "Join free | Sign in" pill at the top switches between them and keeps the typed email. Both tabs: Google and Twitch side by side, divider "or with email", then the email form. Why: with Firebase's email enumeration protection one "Continue" can't tell a wrong password from an email that belongs to a Google account, so joining and signing in are two explicit modes.
2. The two tabs. **Join:** "Join the club" / "Free, and it takes a minute."; Email; "Create a password" (Show/Hide, "8+ characters"); "Create account"; the Terms / Privacy / 13+ line. If the email already has an account: "You already have an account with this email." with "Sign in instead" (switches tab, keeps the email) and "or use Google if that's how you joined." **Sign in:** "Welcome back" / "Sign in to your account."; Email; Password (Show/Hide); "Forgot password?" and "Email me a link instead"; "Sign in"; "New here? Join free". A failed sign-in says "That email and password don't match. If you joined with Google or Twitch, use that button, or reset your password." Any new account, however it was created, goes on to the signup steps (4-7).
3. Link sent: partly hidden address, resend with a 30 s cooldown.
4. Birthday (new members only): month + year, asked neutrally. Only month and year are stored, server-side only.
5. Under 13: friendly block, nothing saved, a per-browser flag prevents simply retrying.
6. Handle: live checks (3–20 of a–z, 0–9, _; reserved words; profanity list; taken, with a suggestion); display name; preview.
7. Terms: required agreement (version + time recorded); stream reminder emails opt-in, off by default.
8. Verify email banner: browsing works; community actions wait for a verified email. Twitch accounts without a verified email must add one.
9. Header: loading skeleton, logged out (Log in / Join free), logged in (avatar menu: My profile, Account settings, Linked accounts, Sign out), admins also get green "Admin tools".
10. Account page (A2 tabs; phones: swipeable pill row).

## Server (Cloud Functions, all callables require App Check later; auth now)
- `checkHandle(handle)` → available | taken (+suggestion) | reserved | invalid.
- `completeSignup({ birthMonth, birthYear, handle, displayName, termsVersion, reminders })` → computes age conservatively (treat the birthday as the last day of the birth month); under 13 → error, nothing written; otherwise one transaction: `handles/{handle}`, `users/{uid}` (ageBand, birthYear/birthMonth server-only fields, terms, prefs), `sites/boomertanger/members/{uid}` (roles: [], joinedAt), `sites/boomertanger/profiles/{uid}` (handle, displayName, avatar: initials).
- `changeHandle(handle)` (30-day cooldown), `updateProfile({ displayName })`, `updatePrefs({ showLinked, useProviderPhoto, reminders })`.
- `twitchAuth({ code, redirectUri, mode: "signin" | "link" })` → exchanges the code with Twitch (client secret in Secret Manager), reads the Twitch user (id, login, email if verified). signin: existing `platformLinks/twitch_{id}` → that uid; else a new Firebase user; returns a custom token. link: requires auth; refuses if the Twitch account is linked to someone else.
- `unlinkPlatform({ platform })` deletes the link and stored platform id.
- `setMemberRole({ uid, role, on })` (owner/admin rules from the foundation spec) + a trigger that mirrors `members/{uid}.roles` into custom claims `{ roles: { boomertanger: [...] } }`, and writes an adminLog entry.
- Scripts: `functions/scripts/seed-site.js` (creates `sites/boomertanger` with name, tagline, socials, modules) and `functions/scripts/set-owner.js --project <staging|production> --uid <uid>`.

## Rules (deny by default)
- `sites/{siteId}`: public read; no client writes.
- `users/{uid}`: the user reads their own doc except server-only fields (keep birthYear/birthMonth in `users/{uid}/private/age`, no client access); no client writes (prefs go through `updatePrefs`).
- `sites/{siteId}/members/{uid}`: the user and site admins read; no client writes.
- `sites/{siteId}/profiles/{uid}`: public read; no client writes.
- `handles/{handle}`: public read; no client writes. `platformLinks/*`: no client access.

## Client
- `site/src/lib/firebase.ts`: modular Firebase from npm; picks the staging or production config from `PUBLIC_FIREBASE_ENV` (configs copied from shared/firebase-init.js, which stays unchanged for the Squarespace features).
- `site/src/lib/auth.ts`: auth state store (loading / signed out / needs signup / signed in / verified), used by the header, account page, verify banner, footer game (Join free opens the dialog) and home member strip.
- Dialogs use bt-ui `openModal()`; the S2 split layout becomes a kit variant (`.bt-modal--split`).
- Routes: `/account`, `/auth/action`, `/auth/twitch/callback`, `/auth/email-link`.
- Preview mode (`?as=member`) stays on non-production builds, but a real signed-in user always wins.

## Emails
Firebase's built-in email templates for verification, password reset and sign-in links (sender name "Boomertanger"). Custom sending domain later.

The links open our own page, `/auth/action`, not Firebase's plain hosted one: in the Firebase console, Authentication → Templates → (edit a template) → **Customize action URL** = `https://staging.boomertanger.com/auth/action` (one setting per project; production gets its own domain at launch). The page handles `verifyEmail` (confirms, clears the verify banner at once, Continue returns to the page the email came from), `resetPassword` (choose a new password with Show/Hide, then Sign in), `recoverEmail` (undo an email change, offer a password reset), `verifyAndChangeEmail`, and hands `signIn` links on to `/auth/email-link`. Expired or used links get a clear message (and, for verification, a Send a new link button). With the action URL set, email links always open on staging, even when testing on localhost.

## Rules: manual test checklist
The repo has no Firestore rules test setup yet (the emulator needs Java 11+), so check these in the Firebase console's Rules Playground (Firestore → Rules → Rules Playground) after each rules deploy. "Signed in" = Authenticated with a test uid; add `roles: { boomertanger: ["admin"] }` under custom claims for the admin rows.

| # | Operation | Path | Who | Expect |
| --- | --- | --- | --- | --- |
| 1 | get | `sites/boomertanger` | unauthenticated | allow |
| 2 | create / update | `sites/boomertanger` | signed in (admin claim) | deny |
| 3 | get | `users/A` | signed in as A | allow |
| 4 | get | `users/A` | signed in as B | deny |
| 5 | update (`prefs.reminders`) | `users/A` | signed in as A | deny |
| 6 | get | `users/A/private/age` | signed in as A | deny |
| 7 | get | `sites/boomertanger/members/A` | signed in as A | allow |
| 8 | get | `sites/boomertanger/members/A` | signed in as B | deny |
| 9 | get | `sites/boomertanger/members/A` | signed in as B with the admin claim | allow |
| 10 | update (`roles: ["admin"]`) | `sites/boomertanger/members/A` | signed in as A (admin claim) | deny |
| 11 | get | `sites/boomertanger/profiles/A` | unauthenticated | allow |
| 12 | create / update | `sites/boomertanger/profiles/A` | signed in as A | deny |
| 13 | get | `handles/nightowl` | unauthenticated | allow |
| 14 | create | `handles/nightowl` | signed in | deny |
| 15 | get / create | `platformLinks/twitch_123` | signed in (admin claim) | deny |
| 16 | get | `sites/boomertanger/anythingElse/x` | signed in (admin claim) | deny (not opened yet) |
| 17 | get | `bugReports/…`, `featureRequests/…`, `adminLog/…` | as before | unchanged (Bug Zapper, Feature Lab, Cloud Stash rules untouched) |
