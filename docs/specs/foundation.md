# Foundation Spec — Site Shell, Accounts & Roles

Sep 26, 2026 · Glenn Bowering · Confirmed

## Purpose and scope

The foundation gives the new site a home, a shell and real accounts, so every later feature builds on server-verifiable identity instead of MemberSpace. It is also platform-ready: one streamer site today, shaped so more could be added later without a rewrite.

**In scope**

- New Astro site on Cloudflare Pages, with production, staging and preview environments.
- New header, footer and navigation for desktop and mobile; bt-ui adapted to its new home.
- Firebase Auth accounts: Google, email/password, email link, Twitch. Apple later.
- Member profiles with public handles, plus linking Twitch, YouTube and TikTok accounts.
- Site-scoped mod and admin roles, set only by the server.
- Security rules, abuse protection, 13+ age gate, data export and GDPR-grade account deletion.
- Site settings document and site IDs on data (platform-ready groundwork).

**Deferred to their own specs**

- Plans and billing (Fan Club, Sub Club, one-time purchases, tax approach).
- Control Room, Live Beacon, presence, Question Queue, check-ins, points.
- Growth data collector and dashboard.
- Porting Bug Zapper, Feature Lab, Cloud Stash and Night Watch.
- Domain redirects (added once the target pages exist).

## Repo, environments and deploys

Decision: keep the existing repo and add the Astro site inside it, so history, functions, rules, CHANGELOG.md and CLAUDE.md stay in one place.

| Path | Holds |
| --- | --- |
| `site/` | New Astro project (pages, layouts, feature pages). Cloudflare Pages builds this folder. |
| `shared/` | bt-ui CSS and JS, imported by the Astro site directly (no jsDelivr). |
| `features/` | Existing features, ported into `site/` in a later phase. |
| `functions/`, `firestore.rules` | Firebase backend, unchanged workflow. |

| Branch | Deploys to | Firebase project |
| --- | --- | --- |
| `main` | Pre-launch: a production URL such as new.boomertanger.com. At launch: boomertanger.com. | boomertanger-prod |
| `dev` | staging.boomertanger.com | boomertanger-staging |
| Any other branch | Its own Cloudflare preview URL | boomertanger-staging |

- The Firebase environment comes from a Cloudflare build setting per environment. It replaces the manual `ENV` flip at release.
- Staging and preview sites are locked to your email with Cloudflare Access (free for small teams), so unfinished work stays private.
- The repo stays public while the old Squarespace staging pages still load from jsDelivr. It can go private once those pages are retired.
- Every new site address (staging, preview, new.boomertanger.com) is added to Firebase authorized domains and the API key's allowed websites.
- Google sign-in uses the popup method at first. A Cloudflare proxy for Firebase's sign-in path can come later if the redirect method is needed.

## Platform-ready data model

A person has one account for the whole system, and a separate membership record for each streamer site they join. Today there is one site, `boomertanger`.

| Document | Holds | Who reads | Who writes |
| --- | --- | --- | --- |
| `sites/{siteId}` | Name, tagline, logo, theme values, social links, platform handles, enabled modules, owner uid | Everyone | Cloud Functions only |
| `users/{uid}` | Account-level data: age band, accepted terms version, linked platform accounts, privacy choices | That user | Cloud Functions, plus a few preference fields by the user |
| `sites/{siteId}/members/{uid}` | Site-level data: roles, joined date, later plan and points | That user and site admins | Cloud Functions only |
| `sites/{siteId}/profiles/{uid}` | Public profile: handle, display name, avatar, badges, opted-in platform names | Everyone | Cloud Functions only |
| `handles/{handle}` | Handle to uid, so handles are unique | Everyone | Cloud Functions only |
| `platformLinks/{platform}_{id}` | Platform account to uid, so one Twitch/YouTube/TikTok account links to only one site account | Nobody (server only) | Cloud Functions only |

- New features store data under `sites/{siteId}/...` or carry a `siteId` field.
- Branding and names live in `sites/{siteId}`, never hard-coded in feature code.
- Existing collections (Bug Zapper, Feature Lab, Cloud Stash, logs) stay where they are until their port.

## Accounts and signup

Members sign in with Firebase Auth, and every request the server receives carries a verified identity.

| Method | How | Notes |
| --- | --- | --- |
| Google | Firebase built-in | Popup sign-in |
| Email and password | Firebase built-in | Email verification required before community actions |
| Email link | Firebase built-in | Passwordless sign-in link |
| Twitch | Cloud Function turns a Twitch login into a Firebase login | Needs a Twitch developer app |
| Apple | Firebase built-in | Later, near launch; needs an Apple Developer account (\~$99/year) |

Signup flow:

1. Choose a sign-in method.
2. Age screen: date of birth, asked neutrally. Under 13 stops here and nothing is saved.
3. Pick a public handle and display name.
4. Accept the terms and privacy policy (version and time recorded).
5. Land on the account page or the page they came from.

- An age band is stored (`13-17` or `18+`), plus a private, server-only birth year and month so the band moves to 18+ automatically. The full date of birth is never stored.
- Avatars default to initials. Showing a provider photo is opt-in.
- Firebase's one-account-per-email setting is on, so signing in a second way prompts linking, not a duplicate account.
- The account page covers: edit profile, linked accounts, sign-in methods, download my data, delete my account.

## Linked platform accounts

Members link their Twitch, YouTube and TikTok accounts so the site recognizes them as one person across all three platforms. This powers cross-platform points later and lets the growth dashboard measure viewers moving between platforms.

| Platform | How it's verified | Phase |
| --- | --- | --- |
| Twitch | Twitch login returns the Twitch user ID | Foundation |
| YouTube | Google sign-in plus YouTube's read-only permission returns the member's channel ID | Foundation |
| TikTok | TikTok Login Kit returns the member's TikTok ID | Later (needs TikTok developer approval) |

- Links are always proven by logging in to that platform, never typed in, so nobody can claim someone else's account.
- Each platform account links to one site account only (`platformLinks`), which blocks point farming with duplicate accounts.
- Linked accounts are private by default. Showing a platform name on the public profile is opt-in.
- Members can unlink at any time; unlinking deletes the stored platform ID.

## Roles

Mod and admin are roles on a member's site record, granted only by the server, and mirrored onto the account so security rules can check them without extra reads.

| Role | Can do | Granted by |
| --- | --- | --- |
| Owner | Everything, including managing admins. Cannot be removed. | Set once in `sites/{siteId}` (you) |
| Admin | Admin tools, member management (cannot grant or remove the mod role) | Owner |
| Mod | Moderation tools (e.g. Question Queue control, later) | Owner only, through Mod Machina (crewDecide) |
| Member | Community features | Signup |

- Source of truth: `sites/{siteId}/members/{uid}.roles`. A Cloud Function copies it into the account's custom claims, scoped per site: `{ roles: { boomertanger: ["admin"] } }`.
- Role changes go through a `setMemberRole` callable and write an `adminLog` entry.
- Admins use their normal member account. This replaces the separate Google allowlist sign-in once existing features are ported; until then both coexist.
- The old MemberSpace Mods and Admin plans are not carried over.

## Security and abuse protection

Everything is denied by default; each document type opens only what the data model table allows.

- Roles, age band, linked accounts, handles and platform links can only be written by Cloud Functions.
- Users can edit a small allowlist of their own preference fields and nothing else.
- Firebase App Check (reCAPTCHA) protects Cloud Functions and Firestore from scripts pretending to be the site.
- Community actions (check-ins, contests, posting) require a verified email, enforced in rules and functions.
- Handles are checked against a reserved-word list and a profanity filter; admins can rename abusive handles.
- Real accounts prove who made a request, not that one person has one account. Contest eligibility rules (verified email, account age, linked platform) are set in the Contests spec.

## Privacy, export and deletion

The site uses privacy-protective defaults for everyone, follows the 13+ standard, and lets members download or delete their data themselves. This is a design, not legal advice; the privacy policy and terms should be reviewed before launch.

**Age and defaults**

- Minimum age 13 via a neutral date-of-birth screen. Under 13 is blocked, nothing is stored, and the session is marked so the screen can't simply be retried.
- Everyone gets the UK Children's Code style defaults: linked accounts and provider photos hidden unless opted in, no precise location, no ad tracking, cookieless analytics.
- Members aged 13–17 are flagged by age band, so paid features can require a parent later.

**Download my data**

- An `exportMyData` callable gathers every document tied to the member and returns one JSON file.

**Delete my account** (GDPR: without undue delay, at most one month)

1. Member confirms and re-authenticates.
2. Account is locked immediately, with a 7-day window to cancel.
3. After 7 days a scheduled function removes: the account doc, member and profile records on every site, handle, platform links, uploaded files (Cloudinary via performAssetDeletion), and the Firebase Auth user.
4. Community contributions (bug reports, requests, comments) are anonymized as "Deleted member", by default; members can choose to delete their posts too.
5. A deletion record keeps only a date and a one-way hash, to prove the request was handled.

- Payment records later stay as long as tax law requires; the privacy policy will say so.
- adminLog entries keep their normal retention; the policy will describe it.
- privacy@boomertanger.com is the published contact for requests.

## Layout and bt-ui changes

One base layout wraps every page: header, main content, footer. The approved look is in `docs/design/mockups/home-5c-refined.html` (hero carousel variation 3B, home layout 5C/6A).

- **Header:** logo, main navigation, a slot for the Live Beacon later, and the account area (Log in / Join, or the member's avatar menu with a green admin entry for admins).
- **Navigation:** Home, Live, Schedule, Games, Streams, Shop, Club. Only pages that exist are shown, controlled by enabled modules in site settings.
- **Mobile:** a full-width bottom tab bar (Home, Schedule, Live, Games, More) with a raised center Live button that glows red (public) or green (backstage) when live, and shows the next stream time when offline.
- **Footer:** social links, legal links (privacy, terms), contact addresses.

bt-ui changes (recorded in design-system.md section 8):

| Today (Squarespace) | New site |
| --- | --- |
| Dialogs measure Squarespace's `#header` | The layout sets a `--bt-header-h` variable that dialogs read |
| Container queries only, never `@media` | Components keep container queries; page layout may use `@media` |
| `.bt-root` protects features from template CSS | The whole page is a bt-root; features keep the class for portability |
| Kit loaded from jsDelivr | Kit imported from `shared/` at build time |
| Footer script injects the LOG IN button | The header owns the account area |

Likely new kit components: site header, footer, navigation (desktop and mobile), avatar, account menu, sign-in provider buttons.

## Approved home page design (from the mockup rounds)

- **Header:** logo, navigation, Live Beacon (offline shows next stream time), account area. On the home page it sits over the hero.
- **Hero:** a stories-style carousel (3B): segment bars that fill as slides play, tap left/right on phones, labeled segments on desktop, and live-first (jumps to and pins the Stream slide while live). Slides come from a reusable template (kicker, headline, text, buttons, optional media, mood tint, optional start/end dates, audience) plus automatic slides (Stream, later Vote, Goal, Series, Top fans). Managed later from Night Watch.
- **Below the hero (4C):** visitors see a join card and the Next livestream, Get involved and Latest updates tiles. Members see a welcome strip (points, streak, badges, rank), then bento tiles on the left (Next livestream wide, Your to-dos, Latest updates, Warm Fuzzies wide) and the Boom Board in a sticky column on the right. Tiles are admin-controlled later.
- **Phone:** members get a For you / Boom Board pill switch under their strip.
- **Boom Board:** member-only posts to Boomer and each other, with a Boom / Everyone pill filter, a composer, a pinned post, and "Boomer replied" markers. Wordmark: BOOM (off-white) + BOARD (purple) with an animated speech-bubble burst icon.
- **Warm Fuzzies (6A):** member-only short kind notes, shown as tilted sticky notes addressed "To ...", Boomer's in gold. Wordmark: WARM (off-white) + FUZZIES (pink) with an animated fuzzy heart icon.

## UI states

These are the screens and states the mockups need to cover.

| Area | States |
| --- | --- |
| Header | Loading, logged out, logged in, admin |
| Sign-in dialog | Method picker, email/password form, email link sent, error, popup blocked |
| Signup steps | Age screen, under-13 blocked, handle picker (taken / reserved / OK), terms acceptance |
| Email verification | Verify-your-email banner, resend, verified |
| Account page | Profile edit, linked accounts (linked / not linked / error), sign-in methods, download data |
| Delete account | Confirm, re-authenticate, scheduled (with cancel), cancelled |
| Admin member view | Member list, member detail with role controls |

## Edge cases

- **Same email, second sign-in method:** the member is asked to sign in the original way once to link the two.
- **Twitch account with no or unverified email:** allowed to sign in, but must add and verify an email before community actions.
- **Member turns 18:** the stored birth year and month move the age band to 18+ automatically.
- **Deleted member signs up again with the same email:** gets a brand-new account; nothing is restored.
- **Popup blocked on sign-in:** show a clear retry button; sign-in always starts from a click.
- **Platform account already linked to another member:** refused with a message; an admin can resolve disputes.
- **Handle changes:** allowed with a cooldown (e.g. once per 30 days), so people can't impersonate by swapping.
- **Staging vs production:** separate Firebase projects, so test accounts never appear on the live site.

## Values you need to supply

| What | Where you get it | Used for |
| --- | --- | --- |
| Cloudflare Pages connected to GitHub | Cloudflare dashboard, Workers & Pages | Deploys |
| Twitch app client ID and secret | Twitch developer console | Twitch login and linking |
| Google OAuth consent screen with YouTube read-only permission | Google Cloud console (per Firebase project) | YouTube linking. Google reviews this permission; until approved, up to 100 test users and a warning screen. |
| reCAPTCHA key for App Check | Firebase console, App Check | Abuse protection |
| Your email for Cloudflare Access | You | Locking staging and previews |
| Owner uid | Created when you first sign in on staging, then production | Site owner role |

## Build order

Each step is testable on staging before the next starts.

1. ✅ Astro project in `site/`, Cloudflare Pages with `main` and `dev`, staging.boomertanger.com, Cloudflare Access.
2. ✅ Base layout: header, footer, navigation, bt-ui changes, placeholder home page.
3. ✅ Site settings document and owner setup (milestone 2: `seed-site.js`, `set-owner.js`).
4. ✅ Google and email sign-in, email verification, account page (milestone 2).
5. ✅ Signup steps: age screen, handle, terms; public profiles (milestone 2).
6. ✅ Roles and claims (milestone 2: `setMemberRole`, `mirrorMemberRoles`). The admin member view UI moves to milestone 2b.
7. ✅ Twitch login and Twitch linking (milestone 2). YouTube linking moves to milestone 2b (it needs Google's OAuth verification); TikTok later.
8. Milestone 2b: App Check and rules hardening.
9. Milestone 2b: data export and account deletion (the screens exist; the buttons say "coming soon").

Milestone 2 is specified in `docs/specs/accounts.md`.

After the foundation, the proposed order is: growth data collector (so history starts early), Live Beacon and the Control Room shell, existing feature ports, then plans and billing.

That order is build sequence only: Fan Club membership access and paid Sub Club subscriptions are required before go-live, along with the other launch essentials.

## Decisions

| # | Question | Decision |
| --- | --- | --- |
| 1 | Same repo with a `site/` folder, or a brand-new repo? | Same repo |
| 2 | Pre-launch production address? | new.boomertanger.com |
| 3 | Store only the age band, or also birth year and month so the band can move to 18+ automatically? | Birth year and month, private, server-only |
| 4 | When a member deletes their account, anonymize or delete their posts? | Anonymize by default, with a "delete my posts too" option |
| 5 | Require a unique public handle for every member? | Yes |
| 6 | Build plans and billing after the live features? Decided: yes, but Fan Club access and paid Sub Club must be done before go-live. | Yes; paid memberships required before go-live |
| 7 | Lock staging and previews with Cloudflare Access? | Yes |

## Open items and reminders

- [ ] Cancel MemberSpace before its renewal on Oct 31, 2026 (reminder Oct 20, 2026). Check whether access continues to the end of the term.
- [ ] Cancel Squarespace once the new site is live, before its August 2027 renewal (reminder Jul 1, 2027).
- [ ] Update site-architecture.md and the project custom instructions: domains on Cloudflare, redirect plan, email addresses, retired Squarespace assumptions.
- [ ] Export historical Twitch, YouTube and TikTok analytics.
- [ ] Stream on schedule for a few weeks before launch, with the collector running, to set the baseline.
- [ ] Draft the privacy policy and terms; have them reviewed before launch.
- [ ] Add design-system.md and bt-ui.css back to Project Knowledge for mockups.

Current follower counts for reference (not the baseline): TikTok 9,496 · YouTube 820 · Twitch 654.

## Scale and usage insight (applies to every feature)

Every feature is built to stay fast and affordable as the community grows, and to report how much it is used. The foundation provides the shared plumbing; each feature spec adds its own limits and signals.

**Built in from the start**

- Lists always load in pages (Boom Board, Warm Fuzzies, feeds), never everything at once.
- Counts (reactions, votes, members online) are stored as running totals, not recounted on every page view.
- The home page reads a small pre-built summary document per member and one for the site, updated by Cloud Functions, instead of querying every feature.
- Real-time updates only where they matter (live status, Control Room, presence). Everything else loads on visit.
- Per-feature limits and switches live in `sites/{siteId}.limits` and `.flags`, editable from Night Watch: posts per day, character limits, image posting, slow mode during streams, and which features are on for which plans.
- Trust levels: new members start with small limits (no images or links) that lift with account age and good standing.

**Designed to grow visually**

- New posts arrive behind a "12 new, show" pill instead of jumping the page.
- Filters and sorting (Boom / Everyone, New / Top) come first; channels or topics are the next step for the Boom Board when volume demands it.
- Tiles show summaries and link to full pages, so the home page stays the same size however busy the site gets.

**Signals that a feature needs an upgrade** (starting thresholds, tuned with real data; shown in Alert Center)

| Signal | Starting threshold | Likely response |
| --- | --- | --- |
| Boom Board posts per day | Over 200 | Add Top sorting, then channels |
| Moderation queue waiting | Over 25 reports, or any older than 24 hours | Add mods, tighten auto-filters, raise trust requirements |
| Firestore reads per month | Over 70% of budget | More caching and summary documents |
| Concurrent Control Room viewers | Over 500 | Review presence design and slow mode |
| Cloud Function errors | Any sustained rise | Alert and investigate |

**Usage insight: which features are most and least used**

- A shared `trackEvent(feature, action)` helper counts views and actions per feature per day into small rollup documents. Counts only, no per-person tracking, which suits the privacy defaults.
- Also counted: daily unique members per feature, and click-through on each hero slide and bento tile, so their order can be set from real data.
- Shown in Night Watch as a Feature Pulse view (most and least used, trends) and fed into the growth dashboard.

## Parked ideas

- Warm Fuzzies note-stack view for reading notes live on stream (Control Room module or stream overlay).
- Boom Board drawer (variation 5D) so members can post from the Control Room.
- Callout component for bt-ui, based on the mockups' recommendation box.
- Alternative name for Warm Fuzzies if wanted later: Boo-quets.

**Update (Oct 6, Mod Machina):** only the owner approves new mods, through Mod Machina's `crewDecide` (and removes them through `crewSetStatus`). Admins can no longer grant or remove the mod role. See `docs/specs/mod-machina.md` section 3b.
