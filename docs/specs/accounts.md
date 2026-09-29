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

Our own page for these links is built: `/auth/action`. It takes over once the project's action URL points at it (Firebase console: Authentication → Templates → (edit a template) → **Customize action URL** = the site's `/auth/action`), or once we send auth emails ourselves with links to it. **On `boomertanger-staging` Firebase refuses that setting** ("An error occurred updating action URL" in the console, `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED` from the API), so verification and reset links still open Firebase's plain page; the site passes a continue URL, so its CONTINUE button returns to the site (`continueSettings()` in `site/src/lib/auth.ts`). Passing `handleCodeInApp` doesn't hand these links on (tested: only email sign-in links are handed on). Email sign-in links already come through our own `/auth/email-link`. When the links do reach it, the page handles `verifyEmail` (confirms, clears the verify banner at once, Continue returns to the page the email came from), `resetPassword` (choose a new password with Show/Hide, then Sign in), `recoverEmail` (undo an email change, offer a password reset), `verifyAndChangeEmail`, and hands `signIn` links on to `/auth/email-link`. Expired or used links get a clear message (and, for verification, a Send a new link button). With an action URL set, email links would always open on that domain, even when testing on localhost.

## Setup per project (one-time)
Everything a Firebase project needs before accounts work. All of these are done for **staging** (`boomertanger-staging`); do the same for **production** (`boomertanger-prod`) before launch, in this order.

1. **Auth providers** (Firebase console → Authentication → Sign-in method): Email/Password with Email link (passwordless) turned on, and Google. One account per email address (the default).
2. **Authorized domains** (Authentication → Settings): the site's domains (staging: `staging.boomertanger.com`, plus `localhost` for local testing). The web API key's allowed websites (Google Cloud → APIs & Services → Credentials) must include the same domains.
3. **Twitch app** (Twitch developer console, the app with the client ID in `site.json` and `functions/.env`): Client Type Confidential, and OAuth Redirect URLs for every domain's `/auth/twitch/callback`. Add the production callback to `TWITCH_REDIRECTS` in `functions/lib/accounts/index.js` too.
4. **Twitch secret:** `firebase functions:secrets:set TWITCH_CLIENT_SECRET --project <alias>` (the user runs it; the secret never goes in chat or the repo). A function stays pinned to the secret version it was deployed with, so redeploy `twitchAuth` after setting a new version. To check it without revealing it, send a fake code to Twitch's token endpoint: "Invalid authorization code" means the secret is right, "invalid client secret" means it isn't.
5. **Custom tokens (Twitch sign-in):** in Google Cloud → IAM & Admin → Service accounts → the **Default compute service account** (`<project number>-compute@developer.gserviceaccount.com`) → **Principals with access** → Grant access: principal = that same service account, role = **Service Account Token Creator**. Without it `twitchAuth` fails at the last step with `iam.serviceAccounts.signBlob` denied, and members see "Twitch sign-in didn't work". The IAM Credentials API must be enabled (it was on staging). The grant can take a few minutes to apply.
6. **Deploy** rules, then functions: `firebase deploy --project <alias> --only firestore:rules`, then `--only functions`.
7. **Site settings:** `node scripts/seed-site.js --project <alias>` (dry run), then with `--apply`.
8. **Email action URL** (Authentication → Templates → edit → Customize action URL): the site's `/auth/action` (see "Emails"). Not possible on staging so far (Firebase refuses template updates there); try it on production, or send auth emails ourselves later.
9. **Owner:** the owner signs in once and finishes signup; then `node scripts/set-owner.js --project <alias> --uid <uid>` (dry run), then with `--apply`. To move ownership later (and give the owner a reserved handle such as @boomertanger, demoting the previous admin), use `node scripts/transfer-owner.js --project <alias> --to <email> [--handle <handle>] [--demote <email>]` (dry run, then `--apply`).

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
